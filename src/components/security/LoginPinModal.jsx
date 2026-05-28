import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, Delete, Loader2, Fingerprint, Check, ChevronRight, ShieldOff } from 'lucide-react';
import LoginAvatar from './LoginAvatar';
import {
    isBiometricAvailable, isMobileDevice,
    isRegistered, registerBiometric, authenticateWithBiometric
} from '../../services/biometricPinService';

// Cache biometric availability globally (doesn't change during session)
let _bioAvailableCache = null;
const getBioAvailable = async () => {
    if (_bioAvailableCache !== null) return _bioAvailableCache;
    _bioAvailableCache = await isBiometricAvailable();
    return _bioAvailableCache;
};

// Cache mobile detection (doesn't change)
const _isMobile = isMobileDevice();

export default function LoginPinModal({ isOpen, onClose, user, onSubmit, onVerifyPin, onLoginComplete, onBiometricLogin }) {
    const targetPinLength = (user?.role === 'ADMIN' || user?.rol === 'ADMIN') ? 6 : 4;
    const [pinDisplay, setPinDisplay] = useState(0); // just the length, for rendering dots
    const [error, setError]           = useState(false);
    const [processing, setProcessing] = useState(false);

    // Use ref for actual pin value to avoid re-renders/re-creating callbacks
    const pinRef = useRef('');
    const processingRef = useRef(false);

    // ── Lockout ────────────────────────────────────────────────────────────
    const [lockoutSec, setLockoutSec] = useState(0);
    const lockoutTimer = useRef(null);
    const lockoutSecRef = useRef(0);

    const startLockoutCountdown = useCallback((seconds) => {
        setLockoutSec(seconds);
        lockoutSecRef.current = seconds;
        if (lockoutTimer.current) clearInterval(lockoutTimer.current);
        lockoutTimer.current = setInterval(() => {
            lockoutSecRef.current -= 1;
            if (lockoutSecRef.current <= 0) {
                clearInterval(lockoutTimer.current);
                lockoutTimer.current = null;
                lockoutSecRef.current = 0;
            }
            setLockoutSec(lockoutSecRef.current);
        }, 1000);
    }, []);

    useEffect(() => {
        return () => { if (lockoutTimer.current) clearInterval(lockoutTimer.current); };
    }, []);

    // ── Biometría ────────────────────────────────────────────────────────────
    const [bioAvailable, setBioAvailable]     = useState(_bioAvailableCache ?? false);
    const [bioRegistered, setBioRegistered]   = useState(false);
    const [bioLoading, setBioLoading]         = useState(false);

    // Setup prompt
    const [keepOpen, setKeepOpen]             = useState(false);
    const [showSetupPrompt, setShowSetupPrompt] = useState(false);
    const showSetupRef = useRef(false);
    const [setupLoading, setSetupLoading]     = useState(false);
    const [setupDone, setSetupDone]           = useState(false);

    const userId   = user?.id;
    const userName = (user?.name || user?.nombre || 'Usuario')
        .split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');

    // Refs for stable submit callback
    const bioAvailableRef = useRef(false);
    const bioRegisteredRef = useRef(false);
    bioAvailableRef.current = bioAvailable;
    bioRegisteredRef.current = bioRegistered;

    // Check biometric availability (cached, instant after first call)
    useEffect(() => {
        if (!isOpen || !userId) return;
        pinRef.current = '';
        setPinDisplay(0);
        setError(false);
        setShowSetupPrompt(false);
        showSetupRef.current = false;
        setSetupDone(false);
        setKeepOpen(false);

        getBioAvailable().then(available => {
            setBioAvailable(available);
            bioAvailableRef.current = available;
            if (available) {
                const reg = isRegistered(userId);
                setBioRegistered(reg);
                bioRegisteredRef.current = reg;
            }
        });
    }, [isOpen, userId]);

    // ── PIN submit (stable — no pin in deps) ────────────────────────────────
    const handleSubmit = useCallback(async () => {
        const currentPin = pinRef.current;
        if (currentPin.length !== targetPinLength || processingRef.current || showSetupRef.current || lockoutSecRef.current > 0) return;
        processingRef.current = true;
        setProcessing(true);

        const verify = onVerifyPin || onSubmit;
        const result = await verify(currentPin, userId);

        // Handle lockout
        if (result && typeof result === 'object' && result.locked) {
            startLockoutCountdown(result.remainingSec || 30);
            setError(true);
            pinRef.current = '';
            setPinDisplay(0);
            processingRef.current = false;
            setProcessing(false);
            setTimeout(() => setError(false), 600);
            return;
        }

        if (!result) {
            setError(true);
            pinRef.current = '';
            setPinDisplay(0);
            processingRef.current = false;
            setProcessing(false);
            setTimeout(() => setError(false), 600);
            return;
        }

        // PIN correcto
        const bioDismissed = localStorage.getItem(`bio_dismiss_${userId}`);
        if (onVerifyPin && bioAvailableRef.current && !bioRegisteredRef.current && _isMobile && !bioDismissed) {
            pinRef.current = '';
            setPinDisplay(0);
            setKeepOpen(true);
            setShowSetupPrompt(true);
            showSetupRef.current = true;
            processingRef.current = false;
            setProcessing(false);
        } else {
            if (onLoginComplete) await onLoginComplete(userId);
            processingRef.current = false;
            setProcessing(false);
            onClose();
        }
    }, [targetPinLength, onSubmit, onVerifyPin, onLoginComplete, userId, onClose, startLockoutCountdown]);

    // ── Pad press (stable) ──────────────────────────────────────────────────
    const handlePadPress = useCallback((digit) => {
        if (pinRef.current.length >= targetPinLength || processingRef.current) return;
        pinRef.current += digit;
        const newLen = pinRef.current.length;
        setPinDisplay(newLen);

        // Auto-submit when complete
        if (newLen === targetPinLength) {
            handleSubmit();
        }
    }, [targetPinLength, handleSubmit]);

    const handleDelete = useCallback(() => {
        if (processingRef.current) return;
        pinRef.current = pinRef.current.slice(0, -1);
        setPinDisplay(pinRef.current.length);
    }, []);

    // Keyboard handler (stable — no pin in deps)
    useEffect(() => {
        if (!isOpen && !keepOpen) return;
        const isTouchDevice = 'ontouchstart' in window && window.innerWidth < 1024;
        if (isTouchDevice) return;
        const handleKey = (e) => {
            if (e.key >= '0' && e.key <= '9') handlePadPress(e.key);
            else if (e.key === 'Backspace') handleDelete();
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [isOpen, keepOpen, handlePadPress, handleDelete]);

    // ── Biometric login ─────────────────────────────────────────────────────
    const handleBiometricLogin = async () => {
        if (bioLoading) return;
        setBioLoading(true);
        try {
            await authenticateWithBiometric(userId);
            await onBiometricLogin(userId);
        } catch (err) {
            if (!err.message?.includes('cancel') && !err.message?.toLowerCase().includes('abort')) {
                setError(true);
                setTimeout(() => setError(false), 800);
            }
        } finally {
            setBioLoading(false);
        }
    };

    // ── Biometric registration (post PIN) ───────────────────────────────────
    const handleRegister = async () => {
        setSetupLoading(true);
        try {
            await registerBiometric(userId, userName);
            setSetupDone(true);
            setBioRegistered(true);
            bioRegisteredRef.current = true;
            setTimeout(async () => {
                if (onLoginComplete) await onLoginComplete(userId);
                setKeepOpen(false);
                setShowSetupPrompt(false);
                showSetupRef.current = false;
                onClose();
            }, 1400);
        } catch (err) {
            if (!err.message?.includes('cancel') && !err.message?.toLowerCase().includes('abort')) {
                if (onLoginComplete) await onLoginComplete(userId);
                setKeepOpen(false);
                setShowSetupPrompt(false);
                showSetupRef.current = false;
                onClose();
            } else {
                setSetupLoading(false);
            }
        }
    };

    const [dontAskAgain, setDontAskAgain] = useState(false);

    const handleSkipSetup = async () => {
        if (dontAskAgain) localStorage.setItem(`bio_dismiss_${userId}`, '1');
        if (onLoginComplete) await onLoginComplete(userId);
        setKeepOpen(false);
        setShowSetupPrompt(false);
        showSetupRef.current = false;
        onClose();
    };

    const visible = (isOpen || keepOpen) && !!user;
    if (!visible) return null;

    return (
        <div
            className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={showSetupPrompt ? undefined : onClose}
        >
            <div
                className="relative bg-white rounded-3xl p-8 w-full max-w-sm mx-4 shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-300"
                onClick={e => e.stopPropagation()}
            >
                {/* ── Setup de huella (post PIN) ── */}
                {showSetupPrompt ? (
                    <div className="flex flex-col items-center text-center">
                        {setupDone ? (
                            <>
                                <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mb-4">
                                    <Check size={32} className="text-emerald-500" />
                                </div>
                                <p className="text-lg font-bold text-slate-800">¡Huella activada!</p>
                                <p className="text-sm text-slate-400 mt-1">La próxima vez entrás con el dedo</p>
                            </>
                        ) : (
                            <>
                                <div className="w-16 h-16 rounded-full bg-sky-50 flex items-center justify-center mb-5">
                                    <Fingerprint size={32} className="text-sky-500" />
                                </div>
                                <h2 className="text-lg font-bold text-slate-800 mb-1">¿Activar acceso por huella?</h2>
                                <p className="text-xs text-slate-500 mb-6 leading-relaxed">
                                    La próxima vez que ingreses como <strong>{userName}</strong>, solo necesitás poner el dedo.
                                </p>
                                <button
                                    onClick={handleRegister}
                                    disabled={setupLoading}
                                    className="w-full py-3 rounded-2xl bg-sky-500 hover:bg-sky-600 text-white font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-60 mb-3"
                                >
                                    {setupLoading
                                        ? <Loader2 size={16} className="animate-spin" />
                                        : <><Fingerprint size={16} /> Activar huella</>
                                    }
                                </button>
                                <label className="flex items-center justify-center gap-2 mb-2 cursor-pointer select-none">
                                    <input
                                        type="checkbox"
                                        checked={dontAskAgain}
                                        onChange={e => setDontAskAgain(e.target.checked)}
                                        className="w-4 h-4 rounded border-slate-300 text-sky-500 focus:ring-sky-500/30"
                                    />
                                    <span className="text-xs text-slate-400">No volver a mostrar</span>
                                </label>
                                <button
                                    onClick={handleSkipSetup}
                                    className="text-xs text-slate-400 hover:text-slate-600 py-2 transition-colors"
                                >
                                    Ahora no
                                </button>
                            </>
                        )}
                    </div>
                ) : (
                    <>
                        {/* ── Cerrar ── */}
                        <button
                            onClick={onClose}
                            className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-700 transition-colors rounded-full hover:bg-slate-100"
                        >
                            <X size={20} />
                        </button>

                        {/* ── Avatar + Nombre ── */}
                        <div className="flex flex-col items-center mb-6">
                            <div className="mb-4"><LoginAvatar user={user} /></div>
                            <h2 className="text-lg sm:text-xl font-bold text-slate-800">{userName}</h2>
                            <p className="text-xs text-slate-500 mt-1">Ingresa tu PIN de {targetPinLength} dígitos</p>
                        </div>

                        {/* ── PIN Dots ── */}
                        <div className={`flex justify-center gap-3 mb-6 ${error ? 'animate-shake' : ''}`}>
                            {Array.from({ length: targetPinLength }).map((_, i) => (
                                <div
                                    key={i}
                                    className={`w-4 h-4 rounded-full border-2 transition-all duration-200 ${
                                        error
                                            ? 'bg-red-500 border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]'
                                            : i < pinDisplay
                                                ? 'bg-sky-500 border-sky-500 shadow-[0_0_10px_rgba(14,165,233,0.4)] scale-110'
                                                : 'bg-transparent border-slate-300'
                                    }`}
                                />
                            ))}
                        </div>

                        {/* ── Numpad ── */}
                        <div className="grid grid-cols-3 gap-3 max-w-[280px] sm:max-w-xs md:max-w-sm mx-auto">
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
                                <button
                                    key={n}
                                    onClick={() => handlePadPress(String(n))}
                                    className="h-14 rounded-xl bg-slate-50 text-slate-800 text-lg sm:text-xl font-bold hover:bg-slate-100 active:scale-95 active:bg-sky-50 transition-all duration-150 border border-slate-200 shadow-sm"
                                >
                                    {n}
                                </button>
                            ))}
                            {bioAvailable && bioRegistered && _isMobile ? (
                                <button
                                    onClick={handleBiometricLogin}
                                    disabled={bioLoading}
                                    className="h-14 rounded-xl bg-sky-50 text-sky-500 flex items-center justify-center hover:bg-sky-100 active:scale-95 transition-all duration-150 border border-sky-200 shadow-sm disabled:opacity-60"
                                >
                                    {bioLoading
                                        ? <Loader2 size={22} className="animate-spin" />
                                        : <Fingerprint size={22} />
                                    }
                                </button>
                            ) : (
                                <div />
                            )}
                            <button
                                onClick={() => handlePadPress('0')}
                                className="h-14 rounded-xl bg-slate-50 text-slate-800 text-xl font-bold hover:bg-slate-100 active:scale-95 active:bg-sky-50 transition-all duration-150 border border-slate-200 shadow-sm"
                            >
                                0
                            </button>
                            <button
                                onClick={handleDelete}
                                className="h-14 rounded-xl bg-slate-50 text-slate-400 flex items-center justify-center hover:bg-red-50 hover:text-red-500 active:scale-95 transition-all duration-150 border border-slate-200 shadow-sm"
                            >
                                <Delete size={22} />
                            </button>
                        </div>
                    </>
                )}

                {/* ── Processing overlay ── */}
                {processing && (
                    <div className="absolute inset-0 bg-white/80 backdrop-blur-sm rounded-3xl flex items-center justify-center">
                        <Loader2 className="animate-spin text-sky-500" size={32} />
                    </div>
                )}

                {/* ── Lockout overlay ── */}
                {lockoutSec > 0 && !processing && (
                    <div className="absolute inset-0 bg-white/95 backdrop-blur-sm rounded-3xl flex flex-col items-center justify-center gap-3 z-10">
                        <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
                            <ShieldOff size={32} className="text-red-500" />
                        </div>
                        <p className="text-lg font-bold text-slate-800">Acceso bloqueado</p>
                        <p className="text-sm text-slate-500 text-center px-6">Demasiados intentos fallidos.<br/>Intente de nuevo en:</p>
                        <div className="text-3xl font-black text-red-500">{lockoutSec}s</div>
                    </div>
                )}
            </div>

            <style>{`
                @keyframes shake {
                    0%, 100% { transform: translateX(0); }
                    20% { transform: translateX(-10px); }
                    40% { transform: translateX(10px); }
                    60% { transform: translateX(-6px); }
                    80% { transform: translateX(6px); }
                }
                .animate-shake { animation: shake 0.4s ease-in-out; }
            `}</style>
        </div>
    );
}
