import React from 'react';
import { Play, ShoppingBag, CreditCard, Clock, Lock, Check, X } from 'lucide-react';
import { useTablesStore } from '../../hooks/store/useTablesStore';
import { useCashStore } from '../../hooks/store/cashStore';
import { TargetIcon } from './TargetIcon';
import { showToast } from '../Toast';

export default function TableCardActions({
    table, session, grandTotal,
    isAvailable, isLockedForMe, isPlaying, isCheckoutPending, isTimeFree,
    hasPinas, isMixedMode, hasHoursActive, costBreakdown, isProcessingCharge, isPaid,
    showReleaseConfirm, setShowReleaseConfirm,
    staffName, currentUser,
    onRequestOpen, onShowOrderPanel, onRequestCheckout, onNotifyMesaCobrar,
    onAddHoursModal, onCancelCheckout, onCloseSession,
    requestAttribution, addPinaToSession,
}) {
    const activeCashSession = useCashStore(s => s.activeCashSession);

    const handleRequestCheckout = () => {
        if (!activeCashSession) {
            showToast('Abre la caja primero para poder cobrar', 'error');
            return;
        }
        onRequestCheckout(session.id);
        onNotifyMesaCobrar(table.name, grandTotal);
    };

    return (
        <div className="mt-3 pt-3 border-t border-slate-100 dark:border-white/10 flex flex-col gap-2">
            {isAvailable ? (
                table.type === 'NORMAL' ? (
                    <button
                        onClick={() => onRequestOpen('CONSUMPTION')}
                        className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs sm:text-sm py-2.5 px-3 rounded-xl shadow-md transition-transform active:scale-95 flex items-center justify-center gap-2"
                    >
                        <Play size={14} fill="currentColor" /> Ocupar
                    </button>
                ) : (
                    <button
                        data-tour="mesa-btn-abrir"
                        onClick={() => onRequestOpen('SHOW_MODE')}
                        className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs sm:text-sm py-2.5 px-3 rounded-xl shadow-md transition-transform active:scale-95 flex items-center justify-center gap-2"
                    >
                        <Play size={14} fill="currentColor" /> Abrir Mesa
                    </button>
                )
            ) : isLockedForMe ? (
                    /* ── Mesa bloqueada para este mesero ── */
                    <div className="flex flex-col items-center gap-1.5 py-2">
                        <div className="w-full bg-white/10 border border-white/20 rounded-xl py-3 px-3 flex items-center justify-center gap-2">
                            <Lock size={14} className="text-white/50" />
                            <span className="text-[11px] font-bold text-white/60">Mesa asignada a {staffName || 'otro mesero'}</span>
                        </div>
                    </div>
            ) : (
                    <div className="flex flex-col gap-1.5">
                    {/* Botón Piña: nueva partida (PINA o mixto con piñas) */}
                    {hasPinas && !isCheckoutPending && (
                        <div className="flex flex-col gap-1">
                            <button
                                disabled={isProcessingCharge}
                                onClick={async () => {
                                    const seats = session?.seats || [];
                                    const activeSeats = seats.filter(s => !s.paid);
                                    if (activeSeats.length > 0) {
                                        requestAttribution({ type: 'pina' });
                                    } else {
                                        await useTablesStore.getState().addRoundToSession(session.id);
                                    }
                                }}
                                className="w-full bg-amber-500 hover:bg-amber-400 active:scale-95 text-white font-black text-xs py-3 rounded-xl shadow-md transition-all whitespace-nowrap disabled:opacity-50 disabled:pointer-events-none"
                            >
                                + Nueva Piña
                            </button>
                            {(currentUser?.role === 'ADMIN') && (Number(session?.extended_times) || 0) > 0 && (
                                <button
                                    onClick={() => useTablesStore.getState().removeRoundFromSession(session.id)}
                                    className="w-full text-[10px] font-bold text-white/80 bg-rose-500/20 hover:bg-rose-500/40 border border-rose-400/30 transition-colors py-1 rounded-lg flex items-center justify-center gap-1 whitespace-nowrap"
                                >
                                    <X size={10} strokeWidth={2.5} /> Quitar última piña
                                </button>
                            )}
                        </div>
                    )}

                    {/* Botones modo mixto: agregar el modo faltante */}
                    {!isCheckoutPending && !isTimeFree && (
                        <div className="flex gap-1.5">
                            {/* Agregar Piña a sesión que no tiene piñas */}
                            {!hasPinas && (
                                <button
                                    disabled={isProcessingCharge}
                                    onClick={async () => {
                                        const seats = session?.seats || [];
                                        const activeSeats = seats.filter(s => !s.paid);
                                        if (activeSeats.length > 0) {
                                            requestAttribution({ type: 'pina' });
                                        } else {
                                            await addPinaToSession(session.id);
                                        }
                                    }}
                                    className="flex-1 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 text-amber-400 font-bold text-[10px] py-2 rounded-xl transition-all active:scale-95 flex items-center justify-center gap-1 disabled:opacity-50 disabled:pointer-events-none"
                                >
                                    <TargetIcon size={10} /> + Piña
                                </button>
                            )}
                            {/* Agregar/Quitar Hora */}
                            <button
                                onClick={onAddHoursModal}
                                className="flex-1 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 text-emerald-400 font-bold text-[10px] py-2 rounded-xl transition-all active:scale-95 flex items-center justify-center gap-1"
                            >
                                <Clock size={10} /> Hora
                            </button>
                        </div>
                    )}


                    {isCheckoutPending ? (
                        /* ── Estado: enviado a caja ── */
                        <div className="flex flex-col gap-1.5">
                            <div className="w-full bg-orange-500/10 border border-orange-500/30 text-orange-400 rounded-xl py-2.5 px-3 flex items-center justify-center gap-2 text-xs font-bold">
                                <Clock size={14} className="animate-pulse" />
                                Esperando al cajero...
                            </div>
                            {/* Admin y mesero pueden revertir la solicitud */}
                            <button
                                onClick={() => onCancelCheckout(session.id)}
                                className="w-full text-[10px] font-bold text-slate-400 hover:text-rose-400 transition-colors py-1"
                            >
                                Retirar solicitud
                            </button>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-1.5">
                            <div className={`grid gap-1.5 ${grandTotal > 0 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                                <button
                                    onClick={onShowOrderPanel}
                                    className="bg-indigo-500 hover:bg-indigo-400 text-white font-bold text-[11px] sm:text-xs py-2.5 sm:py-2 px-2 rounded-xl shadow-md transition-transform active:scale-95 flex items-center justify-center gap-1.5"
                                >
                                    <ShoppingBag size={13} fill="currentColor" />
                                    <span>Consumo</span>
                                </button>
                                {grandTotal > 0 && (
                                <button
                                    onClick={handleRequestCheckout}
                                    className="bg-orange-500 hover:bg-orange-400 text-white font-bold text-[11px] sm:text-xs py-2.5 sm:py-2 px-2 rounded-xl shadow-md transition-transform active:scale-95 flex items-center justify-center gap-1.5"
                                >
                                    <CreditCard size={13} />
                                    <span>Cobrar</span>
                                </button>
                                )}
                            </div>

                            {/* Liberar mesa — solo cuando no hay saldo pendiente */}
                            {grandTotal === 0 && isPlaying && (
                                !showReleaseConfirm ? (
                                    <button
                                        onClick={() => setShowReleaseConfirm(true)}
                                        className="w-full bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-[11px] py-2 rounded-xl shadow-md transition-transform active:scale-95 flex items-center justify-center gap-1.5"
                                    >
                                        <Check size={13} />
                                        Liberar mesa
                                    </button>
                                ) : (
                                    <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40 rounded-xl px-3 py-2 flex flex-col gap-2">
                                        <p className="text-[10px] text-emerald-700 dark:text-emerald-400 font-bold text-center">¿Confirmar liberación de {table.name}?</p>
                                        <div className="grid grid-cols-2 gap-1.5">
                                            <button
                                                onClick={() => setShowReleaseConfirm(false)}
                                                className="text-[11px] font-bold text-slate-500 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-lg py-1.5 transition-colors"
                                            >
                                                Cancelar
                                            </button>
                                            <button
                                                onClick={async () => {
                                                    setShowReleaseConfirm(false);
                                                    await onCloseSession(session.id, currentUser?.id || 'SYSTEM', 0);
                                                    showToast(`${table.name} liberada`, 'success');
                                                }}
                                                className="text-[11px] font-bold text-white bg-emerald-500 hover:bg-emerald-400 rounded-lg py-1.5 transition-colors"
                                            >
                                                Confirmar
                                            </button>
                                        </div>
                                    </div>
                                )
                            )}
                        </div>
                    )}
                    </div>
            )}
        </div>
    );
}
