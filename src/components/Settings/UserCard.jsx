import React from 'react';
import { Trash2, KeyRound, Edit2, Crown, ToggleLeft, ToggleRight } from 'lucide-react';
import { ROLE_CONFIG } from './UserPinInput';
import { useDebtsStore } from '../../hooks/store/useDebtsStore';

export default function UserCard({ user, currentUserId, onChangePin, onDelete, onEditName, onToggleActive, triggerHaptic }) {
    const roleString = user.role || user.rol || 'CAJERO';
    const rawName = user.name || user.nombre || 'Desconocido';
    const nameString = rawName.charAt(0).toUpperCase() + rawName.slice(1);
    const isActive = user.active !== false;
    const debtTotal = useDebtsStore(s => s.getTotalByStaff(user.id));

    const roleConf = ROLE_CONFIG[roleString] || ROLE_CONFIG.CAJERO;
    const RoleIcon = roleConf.icon;
    const isCurrentUser = user.id === currentUserId;
    const isAdmin = roleString === 'ADMIN';

    return (
        <div className={`p-3 rounded-xl border transition-all ${
            !isActive
                ? 'bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 opacity-60'
                : isCurrentUser
                    ? 'bg-indigo-50/50 dark:bg-indigo-900/10 border-indigo-200/50 dark:border-indigo-800/30'
                    : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800'
        }`}>
            <div className="flex items-center gap-3">
                {/* Avatar */}
                <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${isActive ? roleConf.gradient : 'from-slate-400 to-slate-500'} flex items-center justify-center shrink-0 shadow-sm relative`}>
                    <span className="text-white font-black text-lg">{(nameString)[0].toUpperCase()}</span>
                    {isAdmin && isActive && (
                        <div className="absolute -top-2 left-1/2 -translate-x-1/2">
                            <Crown size={12} className="text-yellow-400 fill-yellow-400 drop-shadow-sm" />
                        </div>
                    )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-bold text-slate-800 dark:text-white truncate max-w-[160px] sm:max-w-none">{nameString}</p>
                        {isCurrentUser && (
                            <span className="text-[8px] font-black uppercase tracking-wider bg-indigo-100 dark:bg-indigo-900/30 text-indigo-500 px-1.5 py-0.5 rounded-full">Tu</span>
                        )}
                        {!isActive && (
                            <span className="text-[8px] font-black uppercase tracking-wider bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 px-1.5 py-0.5 rounded-full">Inactivo</span>
                        )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        <RoleIcon size={10} className={isActive ? roleConf.text : 'text-slate-400'} />
                        <span className={`text-[9px] font-black uppercase tracking-wider ${isActive ? roleConf.text : 'text-slate-400'}`}>
                            {roleConf.label}
                        </span>
                        {debtTotal > 0 && (
                            <span className="text-[8px] font-black bg-rose-500 text-white px-1.5 py-0.5 rounded-full ml-1">
                                Debe ${debtTotal.toFixed(2)}
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* Actions — debajo en móvil */}
            {(isActive || !isCurrentUser) && (
                <div className="flex items-center gap-1 mt-2 ml-14 flex-wrap">
                    {isActive && (
                        <>
                            <button
                                onClick={() => { triggerHaptic?.(); onChangePin(user); }}
                                className="p-2 rounded-lg text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-all active:scale-90"
                                title="Cambiar PIN"
                            >
                                <KeyRound size={16} />
                            </button>
                            <button
                                onClick={() => { triggerHaptic?.(); onEditName(user); }}
                                className="p-2 rounded-lg text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all active:scale-90"
                                title="Editar Nombre"
                            >
                                <Edit2 size={16} />
                            </button>
                        </>
                    )}
                    {!isCurrentUser && (
                        <button
                            onClick={() => { triggerHaptic?.(); onToggleActive(user); }}
                            className={`p-2 rounded-lg transition-all active:scale-90 ${
                                isActive
                                    ? 'text-slate-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20'
                                    : 'text-emerald-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'
                            }`}
                            title={isActive ? 'Desactivar usuario' : 'Activar usuario'}
                        >
                            {isActive ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                        </button>
                    )}
                    {!isCurrentUser && isActive && (
                        <button
                            onClick={() => { triggerHaptic?.(); onDelete(user); }}
                            className="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all active:scale-90"
                            title="Eliminar"
                        >
                            <Trash2 size={16} />
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
