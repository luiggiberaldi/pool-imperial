import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../../hooks/store/authStore';
import { useAudit } from '../../hooks/useAudit';
import { showToast } from '../Toast';
import { UserPlus, X, Check } from 'lucide-react';
import { PinInput, ROLE_CONFIG } from './UserPinInput';
import UserCard from './UserCard';
import { ChangePinModal, DeleteUserModal, EditNameModal } from './UserModals';

import { supabaseCloud } from '../../config/supabaseCloud';
import { useDebtsStore } from '../../hooks/store/useDebtsStore';

// Helper: obtener user_id del usuario Supabase autenticado
const getAuthUserId = async () => {
    try {
        const { data: { session } } = await supabaseCloud.auth.getSession();
        return session?.user?.id || null;
    } catch { return null; }
};

// ═══════════════════════════════════════════════════ MAIN
export default function UsersManager({ triggerHaptic }) {
    const { cachedUsers: usuarios, currentUser: usuarioActivo, syncUsers } = useAuthStore();
    const { log } = useAudit();
    const fetchDebts = useDebtsStore(s => s.fetchDebts);

    useEffect(() => { fetchDebts(); }, []);

    // Also load inactive users to allow re-activation
    const [inactiveUsers, setInactiveUsers] = useState([]);

    const loadInactiveUsers = async () => {
        try {
            const userId = await getAuthUserId();
            let query = supabaseCloud
                .from('staff_users')
                .select('*')
                .eq('active', false)
                .order('name');
            if (userId) query = query.eq('user_id', userId);
            const { data } = await query;
            setInactiveUsers(data || []);
        } catch { /* ignore */ }
    };

    // Siempre sincronizar al montar para tener UUIDs frescos de Supabase
    useEffect(() => {
        syncUsers();
        loadInactiveUsers();
    }, []);

    // States
    const [showAddForm, setShowAddForm] = useState(false);
    const [newName, setNewName] = useState('');
    const [newRole, setNewRole] = useState('CAJERO');
    const [newPin, setNewPin] = useState('');
    const [authorizatorPin, setAuthorizatorPin] = useState('');

    const [changePinUser, setChangePinUser] = useState(null);
    const [currentPinValue, setCurrentPinValue] = useState('');  // PIN anterior
    const [pinValue, setPinValue] = useState('');                 // PIN nuevo
    const [confirmPinValue, setConfirmPinValue] = useState('');   // Confirmación
    const [deleteUser, setDeleteUser] = useState(null);

    const [editNameUser, setEditNameUser] = useState(null);
    const [editNameValue, setEditNameValue] = useState('');

    // ─── Handlers ────────────────────────────────────
    const handleAdd = async () => {
        const requiredLen = newRole === 'ADMIN' ? 6 : 4;
        if (!newName.trim()) return showToast('Ingresa un nombre', 'error');
        if (newPin.length !== requiredLen) return showToast(`El PIN debe tener ${requiredLen} digitos`, 'error');

        try {
            const { hashPin } = await import('../../utils/crypto');
            
            if (newRole === 'ADMIN') {
                if (authorizatorPin.length !== 6) return showToast('PIN de autorización inválido', 'error');
                const adminHash = await hashPin(authorizatorPin);
                if (adminHash !== usuarioActivo?.pin_hash) return showToast('Autorización de Administrador fallida', 'error');
            }

            const hashedPin = await hashPin(newPin);
            const userId = await getAuthUserId();
            const insertPayload = {
                    name: newName.trim(),
                    role: newRole,
                    pin_hash: hashedPin,
                    active: true
            };
            if (userId) insertPayload.user_id = userId;
            const { error } = await supabaseCloud
                .from('staff_users')
                .insert(insertPayload);

            if (error) throw error;

            showToast(`Usuario "${newName.trim()}" creado`, 'success');
            triggerHaptic?.();
            log('USUARIO', 'ROL_CAMBIADO', `Usuario "${newName.trim()}" creado con rol ${newRole}`, { nombre: newName.trim(), rol: newRole });
            setNewName('');
            setNewRole('CAJERO');
            setNewPin('');
            setAuthorizatorPin('');
            setShowAddForm(false);
            
            await syncUsers(); // Actualiza LocalForage y Zustand
        } catch (err) {
            console.error('Error al agregar usuario:', err);
            showToast('Ocurrió un error al crear el usuario', 'error');
        }
    };

    const handleChangePin = async () => {
        const targetRole = changePinUser?.role || changePinUser?.rol || 'CAJERO';
        const requiredLen = targetRole === 'ADMIN' ? 6 : 4;
        const requireCurrentPin = targetRole === 'ADMIN';

        if (requireCurrentPin && currentPinValue.length !== requiredLen)
            return showToast(`El PIN actual debe tener ${requiredLen} digitos`, 'error');
        if (pinValue.length !== requiredLen)
            return showToast(`El nuevo PIN debe tener ${requiredLen} digitos`, 'error');
        if (pinValue !== confirmPinValue)
            return showToast('Los PINs no coinciden', 'error');

        try {
            const { hashPin: hp } = await import('../../utils/crypto');
            
            // Verificar PIN anterior solo si es Admin
            if (requireCurrentPin) {
                const currentHash = await hp(currentPinValue);
                if (currentHash !== changePinUser.pin_hash)
                    return showToast('El PIN anterior es incorrecto', 'error');
            }

            const hashedPin = await hp(pinValue);
            const { error } = await supabaseCloud
                .from('staff_users')
                .update({ pin_hash: hashedPin })
                .eq('id', changePinUser.id);

            if (error) throw error;

            showToast(`PIN de ${changePinUser.nombre || changePinUser.name} actualizado`, 'success');
            triggerHaptic?.();
            // Reset biometric dismiss flag so the prompt reappears with new PIN
            localStorage.removeItem(`bio_dismiss_${changePinUser.id}`);
            setChangePinUser(null);
            setCurrentPinValue('');
            setPinValue('');
            setConfirmPinValue('');

            await syncUsers();
        } catch (err) {
            console.error('Error al cambiar PIN:', err);
            showToast('Ocurrio un error al actualizar el PIN', 'error');
        }
    };

    const handleDelete = async () => {
        try {
            const { error } = await supabaseCloud
                .from('staff_users')
                .delete()
                .eq('id', deleteUser.id);

            if (error) throw error;

            showToast(`"${deleteUser.nombre || deleteUser.name}" eliminado`, 'success');
            triggerHaptic?.();
            setDeleteUser(null);

            await syncUsers();
            await loadInactiveUsers();
        } catch (err) {
            console.error('Error al eliminar usuario:', err);
            showToast('No se puede eliminar este usuario', 'error');
        }
    };

    const handleToggleActive = async (user) => {
        const newActive = user.active === false;
        try {
            const { error } = await supabaseCloud
                .from('staff_users')
                .update({ active: newActive })
                .eq('id', user.id);

            if (error) throw error;

            const name = user.name || user.nombre;
            showToast(newActive ? `"${name}" activado` : `"${name}" desactivado`, 'success');
            triggerHaptic?.();
            log('USUARIO', 'ROL_CAMBIADO', `Usuario "${name}" ${newActive ? 'activado' : 'desactivado'}`, { activo: newActive });

            await syncUsers();
            await loadInactiveUsers();
        } catch (err) {
            console.error('Error al cambiar estado del usuario:', err);
            showToast('Error al cambiar estado del usuario', 'error');
        }
    };

    const handleEditName = async () => {
        if (!editNameValue.trim()) return showToast('Ingresa un nombre válido', 'error');

        try {
            const { error } = await supabaseCloud
                .from('staff_users')
                .update({ name: editNameValue.trim() })
                .eq('id', editNameUser.id);
                
            if (error) throw error;
            
            showToast(`Nombre actualizado a ${editNameValue.trim()}`, 'success');
            triggerHaptic?.();
            setEditNameUser(null);
            setEditNameValue('');
            
            await syncUsers();
        } catch (err) {
            console.error('Error al editar usuario:', err);
            showToast('Error al modificar el nombre', 'error');
        }
    };

    return (
        <div className="space-y-4">
            {/* User List */}
            <div className="space-y-2">
                {[...usuarios, ...inactiveUsers].map(user => (
                    <UserCard
                        key={user.id}
                        user={user}
                        currentUserId={usuarioActivo?.id}
                        onChangePin={u => { setChangePinUser(u); setCurrentPinValue(''); setPinValue(''); setConfirmPinValue(''); }}
                        onEditName={u => { setEditNameUser(u); setEditNameValue(u.name || u.nombre || ''); }}
                        onDelete={u => setDeleteUser(u)}
                        onToggleActive={handleToggleActive}
                        triggerHaptic={triggerHaptic}
                    />
                ))}
            </div>

            {/* Add Button / Form */}
            {!showAddForm ? (
                <button
                    onClick={() => { triggerHaptic?.(); setShowAddForm(true); }}
                    className="w-full flex items-center justify-center gap-2 py-3 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 font-bold text-xs uppercase tracking-wider rounded-xl hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors active:scale-[0.98] border border-dashed border-indigo-300 dark:border-indigo-700"
                >
                    <UserPlus size={16} /> Agregar Usuario
                </button>
            ) : (
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-indigo-200 dark:border-indigo-800/40 p-4 space-y-4 animate-in slide-in-from-top-2 duration-200">
                    <div className="flex items-center justify-between">
                        <h4 className="text-sm font-black text-slate-800 dark:text-white flex items-center gap-2">
                            <UserPlus size={16} className="text-indigo-500" /> Nuevo Usuario
                        </h4>
                        <button onClick={() => setShowAddForm(false)} className="p-1 text-slate-400 hover:text-slate-600 transition-colors">
                            <X size={16} />
                        </button>
                    </div>

                    {/* Name */}
                    <div>
                        <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1.5">Nombre</label>
                        <input
                            type="text"
                            placeholder="Ej: Maria, Juan"
                            value={newName}
                            onChange={e => setNewName(e.target.value)}
                            className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 transition-all"
                            autoFocus
                        />
                    </div>

                    {/* Role Selector */}
                    <div>
                        <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1.5">Rol</label>
                        <div className="grid grid-cols-2 gap-2">
                            {Object.entries(ROLE_CONFIG).map(([key, conf]) => {
                                const Icon = conf.icon;
                                return (
                                    <button
                                        key={key}
                                        onClick={() => setNewRole(key)}
                                        className={`py-2.5 px-3 text-xs font-bold rounded-xl transition-all border flex items-center justify-center gap-2 ${newRole === key
                                            ? `${conf.bg} ${conf.border} ${conf.text} shadow-sm`
                                            : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                                        }`}
                                    >
                                        <Icon size={14} /> {conf.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* PIN Autorización (Solo si crea Admin) */}
                    {newRole === 'ADMIN' && (
                        <div className="p-3 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 rounded-xl mb-4">
                            <label className="text-[10px] uppercase font-bold text-red-600 dark:text-red-400 block mb-2 text-center tracking-wider">Tu PIN de Administrador (Autorización)</label>
                            <PinInput value={authorizatorPin} onChange={setAuthorizatorPin} label="auth" length={6} />
                        </div>
                    )}

                    {/* PIN */}
                    <div>
                        <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2 text-center">PIN del Nuevo Usuario ({newRole === 'ADMIN' ? '6' : '4'} digitos)</label>
                        <PinInput value={newPin} onChange={setNewPin} label="new" length={newRole === 'ADMIN' ? 6 : 4} />
                    </div>

                    {/* Submit */}
                    <button
                        onClick={handleAdd}
                        disabled={!newName.trim() || newPin.length !== (newRole === 'ADMIN' ? 6 : 4) || (newRole === 'ADMIN' && authorizatorPin.length !== 6)}
                        className="w-full flex items-center justify-center gap-2 py-3 bg-indigo-500 hover:bg-indigo-600 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all active:scale-[0.98] shadow-md shadow-indigo-500/20 disabled:shadow-none mt-2"
                    >
                        <Check size={16} /> Crear Usuario
                    </button>
                </div>
            )}

            {/* ─── Modals ────────────────────── */}
            <ChangePinModal
                changePinUser={changePinUser} setChangePinUser={setChangePinUser}
                currentPinValue={currentPinValue} setCurrentPinValue={setCurrentPinValue}
                pinValue={pinValue} setPinValue={setPinValue}
                confirmPinValue={confirmPinValue} setConfirmPinValue={setConfirmPinValue}
                onSave={handleChangePin}
            />
            <DeleteUserModal
                deleteUser={deleteUser} setDeleteUser={setDeleteUser}
                onDelete={handleDelete}
            />
            <EditNameModal
                editNameUser={editNameUser} setEditNameUser={setEditNameUser}
                editNameValue={editNameValue} setEditNameValue={setEditNameValue}
                onSave={handleEditName}
            />
        </div>
    );
}
