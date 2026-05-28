import React, { useState, useEffect } from 'react';
import {
    Users, Lock, Rocket, Clock, KeyRound, Eye, EyeOff, CheckCircle2, Fingerprint, ShieldCheck, Trash2
} from 'lucide-react';
import { SectionCard, Toggle } from '../../SettingsShared';
import UsersManager from '../UsersManager';
import CloudAuthModal from '../../security/CloudAuthModal';
import { useConfirm } from '../../../hooks/useConfirm';
import { supabaseCloud } from '../../../config/supabaseCloud';
import {
    isMobileDevice, isBiometricSupported, hasBiometricRegistered,
    getBiometricEmail, registerBiometric, clearBiometric
} from '../../../utils/biometricAuth';

// ─── CONTROL DE PRÓXIMAMENTE ────────────────────────────────────────────────
const SHOW_COMING_SOON = false;
// ────────────────────────────────────────────────────────────────────────────

function ComingSoonOverlay() {
    return (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-slate-50/95 dark:bg-slate-950/95 backdrop-blur-sm rounded-2xl">
            <div className="flex flex-col items-center gap-4 px-8 text-center max-w-xs">
                <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-xl shadow-indigo-500/30">
                    <Rocket size={36} className="text-white" strokeWidth={1.5} />
                </div>
                <div>
                    <h2 className="text-xl font-black text-slate-800 dark:text-white tracking-tight">Próximamente</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 leading-snug">
                        Esta sección está en desarrollo y estará disponible muy pronto.
                    </p>
                </div>
                <div className="flex items-center gap-2 bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-700 rounded-full px-4 py-2">
                    <Clock size={13} className="text-indigo-500" />
                    <span className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 tracking-wide uppercase">En desarrollo</span>
                </div>
            </div>
        </div>
    );
}

function CloudLicenseViewer({ adminEmail, showToast }) {
    const [devices, setDevices] = useState([]);
    const [license, setLicense] = useState(null);
    const [loading, setLoading] = useState(true);
    const confirm = useConfirm();

    const loadData = async () => {
        setLoading(true);
        try {
            const [devRes, licRes] = await Promise.all([
                supabaseCloud.from('account_devices').select('*').eq('email', adminEmail).order('created_at', { ascending: true }),
                supabaseCloud.from('cloud_licenses').select('*').eq('email', adminEmail).maybeSingle()
            ]);
            if (!devRes.error && devRes.data) setDevices(devRes.data);
            if (!licRes.error && licRes.data) setLicense(licRes.data);
        } catch {
            // Sin conexión — no bloquear UI
        }
        setLoading(false);
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => {
        if (adminEmail) loadData();
    }, [adminEmail]);

    const handleRemoveDevice = async (deviceId, alias) => {
        const ok = await confirm({
            title: 'Desvincular dispositivo',
            message: `El dispositivo "${alias}" perderá acceso a tu cuenta. Esta acción no se puede deshacer.`,
            confirmText: 'Desvincular',
            cancelText: 'Cancelar',
            variant: 'unlink',
        });
        if (!ok) return;
        const { error } = await supabaseCloud
            .from('account_devices')
            .delete()
            .eq('email', adminEmail)
            .eq('device_id', deviceId);
            
        if (error) {
            showToast('Error al desvincular', 'error');
        } else {
            showToast('Dispositivo desvinculado', 'success');
            loadData();
        }
    }

    if (loading) return <div className="p-4 text-center text-[10px] text-indigo-500 font-bold animate-pulse">Cargando estado de la licencia...</div>;
    if (!license) return null;

    const isPermanent = license.license_type === 'permanent';
    let daysDiff = 0;
    if (license.valid_until) {
        daysDiff = Math.ceil((new Date(license.valid_until) - new Date()) / 86400000);
    } else {
        daysDiff = license.days_remaining || 0;
    }
    const daysLeft = daysDiff > 0 ? daysDiff : 0;
    const isExpired = !isPermanent && daysLeft === 0;

    return (
        <div className="space-y-4">
            <div className={`p-4 rounded-xl border ${isExpired ? 'bg-rose-50 border-rose-200 dark:bg-rose-900/20 dark:border-rose-900/50' : isPermanent ? 'bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-900/50' : 'bg-indigo-50 border-indigo-200 dark:bg-indigo-900/20 dark:border-indigo-900/50'}`}>
                <div className="flex justify-between items-center mb-4">
                    <h4 className="font-bold text-slate-800 dark:text-slate-200">Estado de Licencia</h4>
                    <span className={`px-2 py-0.5 rounded-md text-[10px] uppercase font-black tracking-wider ${isExpired ? 'bg-rose-200 text-rose-800 dark:bg-rose-800/80 dark:text-rose-100' : isPermanent ? 'bg-amber-200 text-amber-800 dark:bg-amber-800/80 dark:text-amber-100' : 'bg-indigo-200 text-indigo-800 dark:bg-indigo-800/80 dark:text-indigo-100'}`}>
                        {isExpired ? 'VENCIDA' : isPermanent ? 'LIFETIME' : 'ACTIVA'}
                    </span>
                </div>
                
                <div className="flex flex-col gap-2">
                    <div className="flex justify-between items-center text-sm">
                        <span className="text-slate-500 dark:text-slate-400">Cupo Dispositivos</span>
                        <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                            <span className={devices.length >= license.max_devices ? 'text-rose-500 font-black' : ''}>{devices.length}</span> / {license.max_devices}
                        </span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                        <span className="text-slate-500 dark:text-slate-400">Tipo de plan</span>
                        <span className="font-bold text-indigo-600 dark:text-indigo-400 capitalize">{license.plan_tier}</span>
                    </div>
                    
                    {!isPermanent && (
                        <>
                            <div className="w-full h-px bg-slate-200/60 dark:bg-slate-700/60 my-1 font-mono"></div>
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5"><Clock size={14} /> Días restantes</span>
                                <span className={`font-mono font-bold ${daysLeft <= 3 ? 'text-rose-500' : 'text-slate-700 dark:text-slate-300'}`}>{daysLeft}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-500 dark:text-slate-400">Fecha de corte</span>
                                <span className="font-bold text-slate-700 dark:text-slate-300">
                                    {license.valid_until ? new Date(license.valid_until).toLocaleDateString() : 'Desconocida'}
                                </span>
                            </div>
                        </>
                    )}
                </div>
            </div>

            <div className="pt-2 border-t border-indigo-200 dark:border-indigo-900/40">
                <p className="text-[10px] uppercase font-bold text-indigo-700 dark:text-indigo-400 mb-2.5">Equipos Vinculados ({devices.length})</p>
                {devices.length === 0 ? (
                    <div className="text-center text-xs text-slate-500">No hay dispositivos registrados.</div>
                ) : (
                    <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                        {devices.map((d, i) => (
                            <div key={d.device_id} className="flex items-center justify-between p-2.5 bg-white/60 dark:bg-slate-900/60 border border-indigo-100 dark:border-indigo-900/50 rounded-xl shadow-sm">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 flex items-center justify-center bg-indigo-50 dark:bg-indigo-900/30 rounded-lg shrink-0">
                                        <Smartphone size={16} className="text-indigo-500" />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate pr-2">
                                            {d.device_alias || `Dispositivo ${i + 1}`}
                                        </p>
                                        <p className="text-[9px] text-slate-500 font-mono mt-0.5" title={d.device_id}>Última vez: {new Date(d.last_seen).toLocaleDateString()}</p>
                                    </div>
                                </div>
                                <button 
                                    onClick={() => handleRemoveDevice(d.device_id, d.device_alias || `Dispositivo ${i + 1}`)}
                                    className="p-2 text-rose-500 dark:text-rose-400 bg-white dark:bg-slate-800 hover:bg-rose-50 dark:hover:bg-rose-900/20 border border-rose-100 dark:border-rose-900/50 rounded-lg transition-colors active:scale-95 shadow-sm"
                                    title="Desvincular"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

export default function SettingsTabUsuarios({
    autoLockMinutes, setAutoLockMinutes,
    autoLockOnMinimize, setAutoLockOnMinimize,
    showToast, triggerHaptic,
}) {
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showCurrent, setShowCurrent] = useState(false);
    const [showNew, setShowNew] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [changingPw, setChangingPw] = useState(false);
    const [pwSuccess, setPwSuccess] = useState(false);

    // ── Biometría ────────────────────────────────────────────────────
    const [isMobile, setIsMobile] = useState(false);
    const [bioSupported, setBioSupported] = useState(false);
    const [bioRegistered, setBioRegistered] = useState(false);
    const [bioEmail, setBioEmail] = useState('');
    const [bioLoading, setBioLoading] = useState(false);
    const [bioMsg, setBioMsg] = useState('');

    useEffect(() => {
        const mobile = isMobileDevice();
        setIsMobile(mobile);
        if (!mobile) return;
        isBiometricSupported().then(ok => {
            setBioSupported(ok);
            setBioRegistered(hasBiometricRegistered());
            setBioEmail(getBiometricEmail());
        });
    }, []);

    const handleRegisterBiometric = async () => {
        setBioMsg('');
        setBioLoading(true);
        try {
            const { data: { session } } = await supabaseCloud.auth.getSession();
            if (!session?.refresh_token) { setBioMsg('No hay sesión activa'); setBioLoading(false); return; }
            await registerBiometric(session.user.email, session.refresh_token);
            setBioRegistered(true);
            setBioEmail(session.user.email);
            setBioMsg('¡Biometría activada!');
            showToast('Acceso biométrico activado', 'success');
        } catch (e) {
            setBioMsg('No se pudo registrar. Intenta de nuevo.');
        }
        setBioLoading(false);
    };

    const handleClearBiometric = () => {
        clearBiometric();
        setBioRegistered(false);
        setBioEmail('');
        setBioMsg('Biometría desactivada');
        showToast('Acceso biométrico desactivado', 'success');
    };

    const handleChangePassword = async () => {
        if (!currentPassword) {
            showToast('Ingresa tu contraseña actual', 'error'); return;
        }
        if (!newPassword || newPassword.length < 6) {
            showToast('La nueva contraseña debe tener al menos 6 caracteres', 'error'); return;
        }
        if (newPassword !== confirmPassword) {
            showToast('Las contraseñas nuevas no coinciden', 'error'); return;
        }
        setChangingPw(true);
        // Verificar contraseña actual re-autenticando
        const { data: { user } } = await supabaseCloud.auth.getUser();
        const { error: signInError } = await supabaseCloud.auth.signInWithPassword({
            email: user.email,
            password: currentPassword,
        });
        if (signInError) {
            setChangingPw(false);
            showToast('Contraseña actual incorrecta', 'error'); return;
        }
        const { error } = await supabaseCloud.auth.updateUser({ password: newPassword });
        setChangingPw(false);
        if (error) {
            showToast('Error al cambiar contraseña: ' + error.message, 'error');
        } else {
            setPwSuccess(true);
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
            showToast('Contraseña actualizada correctamente', 'success');
            setTimeout(() => setPwSuccess(false), 3000);
        }
    };

    return (
        <div className="relative">
            {SHOW_COMING_SOON && <ComingSoonOverlay />}
            
            <div data-tour="settings-user-list">
            <SectionCard icon={Users} title="Usuarios y Roles" subtitle="Gestiona quien opera la app" iconColor="text-indigo-500">
                <UsersManager triggerHaptic={triggerHaptic} />
            </SectionCard>
            </div>

            <div data-tour="settings-auto-lock">
            <SectionCard icon={Lock} title="Seguridad Local" subtitle="Protección física del dispositivo" iconColor="text-rose-500">
                <div className="mb-4 pb-4 border-b border-rose-100 dark:border-rose-900/30">
                    <div className="flex items-center justify-between mb-1.5">
                        <label className="text-[10px] uppercase font-bold text-slate-400 block">Bloquear al Minimizar App</label>
                        <Toggle 
                            enabled={autoLockOnMinimize} 
                            color="rose"
                            onChange={() => {
                                const newVal = !autoLockOnMinimize;
                                setAutoLockOnMinimize(newVal);
                                localStorage.setItem('admin_auto_lock_on_minimize', newVal ? 'true' : 'false');
                                triggerHaptic?.('light');
                            }} 
                        />
                    </div>
                    <p className="text-[10px] text-slate-400">Exigir PIN inmediatamente si sales de la aplicación o cambias de pestaña en el navegador.</p>
                </div>

                <div>
                    <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1.5">Bloqueo Automático</label>
                    <p className="text-[10px] text-slate-400 mb-3">Tu sesión se bloqueará exigiendo el PIN tras estos minutos de inactividad.</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        {[
                            { val: '1', label: '1m' },
                            { val: '3', label: '3m' },
                            { val: '5', label: '5m' },
                            { val: '10', label: '10m' }
                        ].map(opt => (
                            <button
                                key={opt.val}
                                onClick={() => {
                                    setAutoLockMinutes(opt.val);
                                    localStorage.setItem('admin_auto_lock_minutes', opt.val);
                                    triggerHaptic?.();
                                }}
                                className={`py-2 text-xs font-bold rounded-xl transition-all border ${autoLockMinutes === opt.val
                                    ? 'bg-rose-50 dark:bg-rose-900/20 border-rose-400 text-rose-700 dark:text-rose-300 shadow-sm'
                                    : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                                }`}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                </div>
            </SectionCard>
            </div>

            <SectionCard icon={KeyRound} title="Cambiar Contraseña de Acceso" subtitle="Contraseña del login con correo electrónico (no el PIN)" iconColor="text-amber-500">
                {pwSuccess ? (
                    <div className="flex flex-col items-center gap-2 py-4">
                        <CheckCircle2 size={32} className="text-green-500" />
                        <p className="text-sm font-bold text-green-600 dark:text-green-400">Contraseña actualizada</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        <div>
                            <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1.5">Contraseña Actual</label>
                            <div className="relative">
                                <input
                                    type={showCurrent ? 'text' : 'password'}
                                    value={currentPassword}
                                    onChange={e => setCurrentPassword(e.target.value)}
                                    placeholder="Tu contraseña actual"
                                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 pr-10 text-sm text-slate-800 dark:text-slate-200 outline-none focus:border-amber-400"
                                />
                                <button onClick={() => setShowCurrent(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                                    {showCurrent ? <EyeOff size={15} /> : <Eye size={15} />}
                                </button>
                            </div>
                        </div>
                        <div className="w-full h-px bg-slate-200 dark:bg-slate-700" />
                        <div>
                            <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1.5">Nueva Contraseña</label>
                            <div className="relative">
                                <input
                                    type={showNew ? 'text' : 'password'}
                                    value={newPassword}
                                    onChange={e => setNewPassword(e.target.value)}
                                    placeholder="Mínimo 6 caracteres"
                                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 pr-10 text-sm text-slate-800 dark:text-slate-200 outline-none focus:border-amber-400"
                                />
                                <button onClick={() => setShowNew(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                                    {showNew ? <EyeOff size={15} /> : <Eye size={15} />}
                                </button>
                            </div>
                        </div>
                        <div>
                            <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1.5">Confirmar Nueva Contraseña</label>
                            <div className="relative">
                                <input
                                    type={showConfirm ? 'text' : 'password'}
                                    value={confirmPassword}
                                    onChange={e => setConfirmPassword(e.target.value)}
                                    placeholder="Repite la nueva contraseña"
                                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 pr-10 text-sm text-slate-800 dark:text-slate-200 outline-none focus:border-amber-400"
                                />
                                <button onClick={() => setShowConfirm(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                                    {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
                                </button>
                            </div>
                        </div>
                        <button
                            onClick={handleChangePassword}
                            disabled={changingPw || !currentPassword || !newPassword || !confirmPassword}
                            className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white font-bold rounded-xl text-sm transition-colors"
                        >
                            {changingPw ? 'Verificando...' : 'Actualizar Contraseña'}
                        </button>
                    </div>
                )}
            </SectionCard>

            {/* Sección biometría — solo aparece en móviles con soporte */}
            {isMobile && bioSupported && (
                <SectionCard icon={Fingerprint} title="Acceso Biométrico" subtitle="Huella dactilar o Face ID — solo para este dispositivo" iconColor="text-violet-500">
                    {bioRegistered ? (
                        <div className="space-y-3">
                            <div className="flex items-center gap-3 p-3 bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 rounded-xl">
                                <ShieldCheck size={20} className="text-violet-500 shrink-0" />
                                <div>
                                    <p className="text-sm font-bold text-violet-700 dark:text-violet-300">Biometría activada</p>
                                    <p className="text-[11px] text-slate-500 mt-0.5">{bioEmail}</p>
                                </div>
                            </div>
                            {bioMsg && <p className="text-[11px] text-center font-bold text-slate-500">{bioMsg}</p>}
                            <button
                                onClick={handleClearBiometric}
                                className="w-full py-2.5 bg-rose-50 hover:bg-rose-100 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800 font-bold rounded-xl text-sm flex items-center justify-center gap-2 transition-colors"
                            >
                                <Trash2 size={15} />
                                Desactivar biometría en este dispositivo
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <p className="text-[12px] text-slate-500 dark:text-slate-400 leading-relaxed">
                                Activa el acceso con huella o Face ID para entrar sin contraseña desde este teléfono. El registro es exclusivo para este dispositivo.
                            </p>
                            {bioMsg && <p className="text-[11px] text-center font-bold text-violet-600">{bioMsg}</p>}
                            <button
                                onClick={handleRegisterBiometric}
                                disabled={bioLoading}
                                className="w-full py-2.5 bg-violet-500 hover:bg-violet-600 disabled:opacity-40 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2 transition-colors"
                            >
                                {bioLoading ? (
                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                ) : (
                                    <>
                                        <Fingerprint size={16} />
                                        Activar huella / Face ID
                                    </>
                                )}
                            </button>
                        </div>
                    )}
                </SectionCard>
            )}
        </div>
    );
}

