import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuthStore } from '../../hooks/store/authStore';
import { useCashStore } from '../../hooks/store/cashStore';
import UserCard from './UserCard';
import LoginPinModal from './LoginPinModal';
import { LogOut, DownloadCloud, ShieldCheck, X, Eye, EyeOff } from 'lucide-react';
import { supabaseCloud } from '../../config/supabaseCloud';
import { useConfirm } from '../../hooks/useConfirm.jsx';

// ── Modal super admin ─────────────────────────────────────────────────────────
function SuperAdminModal({ isOpen, onClose, onSuccess }) {
    const [password, setPassword] = useState('');
    const [showPw, setShowPw] = useState(false);
    const [error, setError] = useState(false);
    const [loading, setLoading] = useState(false);
    const inputRef = useRef(null);

    useEffect(() => {
        if (isOpen) {
            setPassword('');
            setError(false);
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [isOpen]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!password || loading) return;
        setLoading(true);
        setError(false);
        const ok = await onSuccess(password);
        setLoading(false);
        if (!ok) {
            setError(true);
            setPassword('');
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 flex flex-col gap-5">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <ShieldCheck className="w-5 h-5 text-sky-500" />
                        <span className="font-bold text-slate-800 text-lg">Acceso Admin</span>
                    </div>
                    <button onClick={onClose} className="p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    <div className="relative">
                        <input
                            ref={inputRef}
                            type={showPw ? 'text' : 'password'}
                            value={password}
                            onChange={e => { setPassword(e.target.value); setError(false); }}
                            placeholder="Contraseña maestra"
                            className={`w-full px-4 py-3 rounded-xl border-2 text-slate-800 outline-none transition-colors pr-11
                                ${error ? 'border-red-400 bg-red-50' : 'border-slate-200 focus:border-sky-400 bg-slate-50'}`}
                        />
                        <button
                            type="button"
                            onClick={() => setShowPw(v => !v)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >
                            {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                    </div>

                    {error && (
                        <p className="text-sm text-red-500 text-center -mt-2">Contraseña incorrecta</p>
                    )}

                    <button
                        type="submit"
                        disabled={!password || loading}
                        className="w-full py-3 bg-sky-500 hover:bg-sky-600 text-white font-semibold rounded-xl shadow-md shadow-sky-500/30 transition-all active:scale-95 disabled:opacity-50"
                    >
                        {loading ? 'Verificando...' : 'Entrar'}
                    </button>
                </form>
            </div>
        </div>
    );
}

export default function LoginScreen() {
    const { cachedUsers, login, loginWithBiometric, verifyPin, syncUsers, logout, loginAsSuperAdmin } = useAuthStore();
    const { activeCashSession } = useCashStore();
    const confirm = useConfirm();

    const [selectedUser, setSelectedUser] = useState(null);
    const [isSyncing, setIsSyncing] = useState(false);
    const [showSuperModal, setShowSuperModal] = useState(false);

    // Contador de clicks en logo para abrir modal super admin
    const logoClickCount = useRef(0);
    const logoClickTimer = useRef(null);

    const handleLogoClick = useCallback(() => {
        logoClickCount.current += 1;
        clearTimeout(logoClickTimer.current);
        if (logoClickCount.current >= 10) {
            logoClickCount.current = 0;
            setShowSuperModal(true);
        } else {
            logoClickTimer.current = setTimeout(() => { logoClickCount.current = 0; }, 2000);
        }
    }, []);

    const handleForceSync = async () => {
        setIsSyncing(true);
        await syncUsers();
        setIsSyncing(false);
    };

    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => {
        // Siempre sincronizar al montar para tener usuarios actualizados
        handleForceSync();
    }, []);

    // Verificar PIN sin activar sesión (para dar chance al prompt biométrico)
    const handlePinVerify = async (pin, userId) => {
        await new Promise(r => setTimeout(r, 350)); // feedback visual
        return await verifyPin(userId, pin);
    };

    // Activar sesión real (llamado por el modal después del prompt biométrico)
    const handleLoginComplete = async (userId) => {
        await loginWithBiometric(userId);
        setSelectedUser(null);
    };

    const handleBiometricLogin = async (userId) => {
        const success = await loginWithBiometric(userId);
        if (success) setSelectedUser(null);
        return success;
    };

    const handleCloudLogout = async () => {
        const ok = await confirm({
            title: '¿Cerrar sesión remota?',
            message: 'Se borrará todo caché.',
            confirmText: 'Sí, cerrar sesión',
            variant: 'logout'
        });
        if (!ok) return;
        await logout();
        await supabaseCloud.auth.signOut();
        window.location.reload();
    };

    return (
        <div className="fixed inset-0 z-[300] bg-slate-50 text-slate-800 font-sans" style={{ overflowY: 'auto' }}>
            {/* Background glow — decorativo, no interfiere con layout */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden">
                <div className="absolute -top-[30%] -left-[15%] w-[600px] h-[600px] bg-sky-500/10 rounded-full blur-[120px]" />
                <div className="absolute -bottom-[30%] -right-[15%] w-[600px] h-[600px] bg-teal-400/10 rounded-full blur-[120px]" />
            </div>

            {/* Contenedor principal — siempre ocupa al menos la pantalla completa */}
            <div className="relative z-10 min-h-screen flex flex-col items-center justify-between px-6 py-8 gap-6">

                {/* ── LOGO + TÍTULO ── */}
                <div className="text-center flex flex-col items-center gap-2 w-full">
                    <img
                        src="/logo.png"
                        alt="Logo"
                        onClick={handleLogoClick}
                        className="w-auto object-contain drop-shadow-xl cursor-pointer select-none"
                        style={{ height: 'clamp(110px, 28vw, 180px)' }}
                    />
                    <h1 className="text-2xl sm:text-3xl font-light tracking-[0.15em] text-slate-500">
                        Quien esta <strong className="text-slate-800 font-bold">operando</strong>?
                    </h1>
                </div>

                {/* ── GRID DE USUARIOS ── */}
                <div className="w-full flex-1 flex items-center justify-center py-4">
                    {cachedUsers.length === 0 ? (
                        <div className="text-center text-slate-500 max-w-xs w-full">
                            <p className="mb-4 text-sm">No hay usuarios en caché.</p>
                            <button
                                onClick={handleForceSync}
                                disabled={isSyncing}
                                className="px-6 py-2 bg-sky-500 text-white rounded-full font-medium shadow-md shadow-sky-500/20 active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2 w-full"
                            >
                                <DownloadCloud className={`w-5 h-5 ${isSyncing ? 'animate-bounce' : ''}`} />
                                {isSyncing ? 'Sincronizando...' : 'Sincronizar ahora'}
                            </button>
                        </div>
                    ) : (
                        /* Flex wrap: se ajusta automáticamente al número de cards (1,2,3,N).
                           En móvil max 2 por fila; en pantallas más grandes toda en fila. */
                        <div
                            className={`flex flex-wrap justify-center gap-8 sm:gap-12 ${cachedUsers.length <= 2 ? 'max-w-xs sm:max-w-sm' : 'max-w-[320px] sm:max-w-md md:max-w-lg'}`}
                        >
                            {cachedUsers.map(user => (
                                <div
                                    key={user.id}
                                    style={{ flexBasis: 'calc(50% - 16px)', maxWidth: '130px', minWidth: '100px' }}
                                >
                                    <UserCard
                                        user={user}
                                        onClick={() => setSelectedUser(user)}
                                    />
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* ── FOOTER ── */}
                <div className="w-full text-center flex flex-col items-center gap-3">
                    <p className="text-[10px] sm:text-xs text-slate-600 font-medium tracking-wider">
                        Ingresa tu PIN asignado
                    </p>
                    <div className="flex items-center gap-6">
                        <button
                            onClick={handleForceSync}
                            disabled={isSyncing}
                            className="flex items-center gap-1.5 text-[10px] sm:text-xs font-bold text-slate-400 hover:text-sky-500 transition-colors disabled:opacity-50"
                        >
                            <DownloadCloud className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} strokeWidth={2.5} />
                            Refrescar
                        </button>
                    </div>
                </div>

            </div>

            {/* PIN Modal */}
            <LoginPinModal
                isOpen={!!selectedUser}
                onClose={() => setSelectedUser(null)}
                user={selectedUser}
                onVerifyPin={handlePinVerify}
                onLoginComplete={handleLoginComplete}
                onBiometricLogin={handleBiometricLogin}
            />

            {/* Super Admin Modal */}
            <SuperAdminModal
                isOpen={showSuperModal}
                onClose={() => setShowSuperModal(false)}
                onSuccess={async (password) => {
                    const ok = await loginAsSuperAdmin(password);
                    if (ok) setShowSuperModal(false);
                    return ok;
                }}
            />
        </div>
    );
}
