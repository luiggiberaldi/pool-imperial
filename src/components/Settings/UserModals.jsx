import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { PinInput, ROLE_CONFIG } from './UserPinInput';

export function ChangePinModal({
    changePinUser, setChangePinUser,
    currentPinValue, setCurrentPinValue,
    pinValue, setPinValue,
    confirmPinValue, setConfirmPinValue,
    onSave,
}) {
    if (!changePinUser) return null;

    const targetRole = changePinUser?.role || changePinUser?.rol || 'CAJERO';
    const pinLen = targetRole === 'ADMIN' ? 6 : 4;
    const requireCurrentPin = targetRole === 'ADMIN';

    const isReady = (!requireCurrentPin || currentPinValue.length === pinLen) && pinValue.length === pinLen && confirmPinValue.length === pinLen;
    const mismatch = confirmPinValue.length === pinLen && pinValue !== confirmPinValue;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setChangePinUser(null)}>
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 w-full max-w-xs shadow-2xl animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                <div className="text-center mb-6">
                    <div className={`w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br ${ROLE_CONFIG[targetRole]?.gradient || 'from-slate-500 to-slate-600'} flex items-center justify-center mb-3 shadow-lg shadow-indigo-500/10`}>
                        <span className="text-white font-black text-2xl">{(changePinUser.name || changePinUser.nombre || 'U')[0].toUpperCase()}</span>
                    </div>
                    <h3 className="text-xl font-black text-slate-800 dark:text-white mb-1">Cambiar PIN</h3>
                    <p className="text-[13px] font-medium text-slate-500 dark:text-slate-400">{changePinUser.name || changePinUser.nombre} &middot; Seguridad Nivel {targetRole}</p>
                </div>

                <div className="space-y-5 mb-7">
                    {requireCurrentPin && (
                        <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800">
                            <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2 text-center tracking-wider">PIN Anterior</label>
                            <PinInput value={currentPinValue} onChange={setCurrentPinValue} label="current" length={pinLen} />
                        </div>
                    )}

                    <div>
                        <label className="text-[10px] uppercase font-bold text-indigo-500 dark:text-indigo-400 block mb-2 text-center tracking-wider">Nuevo PIN</label>
                        <PinInput value={pinValue} onChange={setPinValue} label="change" length={pinLen} />
                    </div>

                    <div>
                        <label className={`text-[10px] uppercase font-bold block mb-2 text-center tracking-wider transition-colors ${mismatch ? 'text-red-500' : 'text-slate-400'}`}>
                            {mismatch ? 'Los PINs no coinciden' : 'Confirmar Nuevo PIN'}
                        </label>
                        <PinInput value={confirmPinValue} onChange={setConfirmPinValue} label="confirm" length={pinLen} />
                    </div>
                </div>

                <div className="flex gap-3">
                    <button
                        onClick={() => setChangePinUser(null)}
                        className="flex-1 py-3 text-sm font-bold text-slate-500 bg-slate-100 dark:bg-slate-800 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-95 transition-all"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={onSave}
                        disabled={!isReady || mismatch}
                        className="flex-1 py-3 text-sm font-bold text-white bg-indigo-500 rounded-xl hover:bg-indigo-600 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Guardar
                    </button>
                </div>
            </div>
        </div>
    );
}

export function DeleteUserModal({ deleteUser, setDeleteUser, onDelete }) {
    if (!deleteUser) return null;
    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setDeleteUser(null)}>
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 w-full max-w-xs shadow-2xl animate-in zoom-in-95 duration-200 text-center" onClick={e => e.stopPropagation()}>
                <div className="w-14 h-14 mx-auto bg-red-100 dark:bg-red-900/30 text-red-500 rounded-full flex items-center justify-center mb-4">
                    <AlertTriangle size={28} />
                </div>
                <h3 className="text-lg font-black text-slate-800 dark:text-white mb-2">Eliminar Usuario</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                    ¿Seguro que deseas eliminar a <strong>"{deleteUser.name || deleteUser.nombre}"</strong>? Esta accion no se puede deshacer.
                </p>
                <div className="flex gap-3">
                    <button
                        onClick={() => setDeleteUser(null)}
                        className="flex-1 py-3 text-sm font-bold text-slate-500 bg-slate-100 dark:bg-slate-800 rounded-xl active:scale-95 transition-all"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={onDelete}
                        className="flex-1 py-3 text-sm font-bold text-white bg-red-500 rounded-xl hover:bg-red-600 active:scale-95 transition-all"
                    >
                        Si, eliminar
                    </button>
                </div>
            </div>
        </div>
    );
}

export function EditNameModal({ editNameUser, setEditNameUser, editNameValue, setEditNameValue, onSave }) {
    if (!editNameUser) return null;
    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setEditNameUser(null)}>
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 w-full max-w-xs shadow-2xl animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                <div className="text-center mb-6">
                    <div className={`w-14 h-14 mx-auto rounded-xl bg-gradient-to-br ${ROLE_CONFIG[editNameUser.role || editNameUser.rol]?.gradient || 'from-slate-500 to-slate-600'} flex items-center justify-center mb-3`}>
                        <span className="text-white font-black text-2xl">{(editNameUser.name || editNameUser.nombre || 'U')[0].toUpperCase()}</span>
                    </div>
                    <h3 className="text-lg font-black text-slate-800 dark:text-white">Cambiar Nombre</h3>
                    <p className="text-xs text-slate-400 mt-1">{editNameUser.role || editNameUser.rol}</p>
                </div>

                <div className="mb-6">
                    <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1.5 ml-1">Nuevo Nombre</label>
                    <input
                        autoFocus
                        type="text"
                        value={editNameValue}
                        onChange={e => setEditNameValue(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-indigo-500/30 outline-none text-slate-800 dark:text-white transition-all text-center"
                        placeholder="..."
                    />
                </div>

                <div className="flex gap-3">
                    <button
                        onClick={() => setEditNameUser(null)}
                        className="flex-1 py-3 text-sm font-bold text-slate-500 bg-slate-100 dark:bg-slate-800 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-95 transition-all"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={onSave}
                        disabled={!editNameValue.trim()}
                        className="flex-1 py-3 text-sm font-bold text-white bg-indigo-500 rounded-xl hover:bg-indigo-600 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Guardar
                    </button>
                </div>
            </div>
        </div>
    );
}
