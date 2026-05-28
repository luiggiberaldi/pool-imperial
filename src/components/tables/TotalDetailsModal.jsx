import React from 'react';
import { formatElapsedTime } from '../../utils/tableBillingEngine';
import { Modal } from '../Modal';

// Formatea un número como peso colombiano: $ 12.500
const formatCOP = (val) => new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', minimumFractionDigits: 0
}).format(Math.round(val || 0));

export function TotalDetailsModal({
    isOpen, onClose,
    table, session, elapsed,
    timeCost, totalConsumption, grandTotal,
    costBreakdown, config,
    currentItems,
}) {
    // Calcular desglose de horas/piñas de seats
    const seatHours = (session?.seats || []).reduce((sum, s) =>
        sum + (s.timeCharges || []).filter(tc => tc.type === 'hora').reduce((a, tc) => a + (Number(tc.amount) || 0), 0), 0);
    const seatPinas = (session?.seats || []).reduce((sum, s) =>
        sum + (s.timeCharges || []).filter(tc => tc.type === 'pina').reduce((a, tc) => a + (Number(tc.amount) || 0), 0), 0);

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Detalle de Cuenta">
             <div className="flex flex-col gap-3 py-4 text-slate-800 dark:text-white max-h-[70vh] overflow-y-auto">
                {/* Piñas */}
                {table?.type !== 'NORMAL' && (costBreakdown?.hasPinas || seatPinas > 0) && (
                <div className="flex flex-col p-3 bg-amber-50 dark:bg-amber-950/20 rounded-xl border border-amber-200 dark:border-amber-800/40">
                    <div className="flex justify-between items-center mb-1">
                        <span className="text-sm font-bold text-amber-700 dark:text-amber-400">Piñas jugadas</span>
                        <span className="text-lg font-black">{formatCOP(costBreakdown.pinaCost || 0)}</span>
                    </div>
                    <span className="text-xs text-amber-600 dark:text-amber-400/70">
                        {session?.game_mode === 'PINA' ? 1 + (Number(session?.extended_times) || 0) : Number(session?.extended_times) || 0} piña(s) · {formatCOP(config.pricePina || 0)} c/u
                    </span>
                </div>
                )}

                {/* Tiempo de sesión (session-level hours) */}
                {table?.type !== 'NORMAL' && costBreakdown?.hasHours && (
                <div className="flex flex-col p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-white/10">
                    <div className="flex justify-between items-center mb-1">
                        <span className="text-sm font-bold text-slate-600 dark:text-slate-300">Tiempo de Juego</span>
                        <span className="text-lg font-black">{formatCOP(costBreakdown.hourCost || 0)}</span>
                    </div>
                    <span className="text-xs text-slate-500">
                        {formatElapsedTime(elapsed)} · {Number(session?.hours_paid) || 0}h pagadas
                    </span>
                </div>
                )}

                {/* Tiempo de seats (horas prepagadas asignadas a clientes) */}
                {table?.type !== 'NORMAL' && seatHours > 0 && (
                <div className="flex flex-col p-3 bg-sky-50 dark:bg-sky-950/20 rounded-xl border border-sky-200 dark:border-sky-800/40">
                    <div className="flex justify-between items-center mb-1">
                        <span className="text-sm font-bold text-sky-700 dark:text-sky-400">Horas Prepagadas</span>
                        <span className="text-lg font-black">{formatCOP(seatHours * (config.pricePerHour || 0))}</span>
                    </div>
                    <span className="text-xs text-sky-600 dark:text-sky-400/70">
                        {seatHours === 0.5 ? '30 min' : `${seatHours}h`} · {formatCOP(config.pricePerHour || 0)}/hora
                    </span>
                </div>
                )}

                {/* Fallback */}
                {table?.type !== 'NORMAL' && !costBreakdown?.hasPinas && !costBreakdown?.hasHours && timeCost > 0 && (
                <div className="flex flex-col p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-white/10">
                    <div className="flex justify-between items-center mb-1">
                        <span className="text-sm font-bold text-slate-600 dark:text-slate-300">Tiempo de Juego</span>
                        <span className="text-lg font-black">{formatCOP(timeCost)}</span>
                    </div>
                </div>
                )}

                {/* Consumos Detallados */}
                <div className="flex flex-col p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-white/10">
                    <div className="flex justify-between items-center mb-2 pb-2 border-b border-slate-200/50 dark:border-white/5">
                        <span className="text-sm font-bold text-slate-600 dark:text-slate-300">Consumo en Mesa</span>
                        <span className="text-lg font-black">{formatCOP(totalConsumption)}</span>
                    </div>
                    {currentItems.length > 0 ? (
                        <div className="flex flex-col gap-1.5 mt-1">
                            {currentItems.map((item, idx) => (
                                <div key={idx} className="flex justify-between items-start text-sm">
                                    <span className="text-slate-700 dark:text-slate-300 font-medium">
                                        <span className="text-emerald-600 dark:text-emerald-400 font-bold mr-1">{item.qty}x</span>
                                        {item.product_name}
                                    </span>
                                    <span className="font-bold text-slate-800 dark:text-white">{formatCOP(item.qty * item.unit_price_usd)}</span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <span className="text-xs text-slate-400 italic">No hay consumos registrados</span>
                    )}
                </div>

                {/* Total */}
                <div className="flex justify-between items-center mt-2 p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-200 dark:border-emerald-500/20">
                    <span className="text-sm font-black text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">Total Cuenta</span>
                    <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400 leading-none">
                        {formatCOP(grandTotal)}
                    </span>
                </div>
                <button
                    onClick={onClose}
                    className="w-full mt-4 bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 rounded-xl transition-colors"
                >
                    Cerrar Detalle
                </button>
             </div>
        </Modal>
    );
}
