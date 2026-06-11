import React from 'react';
import { formatElapsedTime, formatHoursPaid, buildTableSyntheticCart, calculateFullTableBreakdown } from '../../utils/tableBillingEngine';
import { Modal } from '../Modal';
import { useProductContext } from '../../context/ProductContext';
import { useTablesStore } from '../../hooks/store/useTablesStore';
import { FinancialEngine } from '../../core/FinancialEngine';

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
    const { products } = useProductContext();
    const paidHoursOffsets = useTablesStore(state => state.paidHoursOffsets);
    const paidRoundsOffsets = useTablesStore(state => state.paidRoundsOffsets);
    const requestSeatCheckout = useTablesStore(state => state.requestSeatCheckout);
    const cancelSeatCheckoutRequest = useTablesStore(state => state.cancelSeatCheckoutRequest);
    const hoursOffset = session ? (paidHoursOffsets[session.id] || 0) : 0;
    const roundsOffset = session ? (paidRoundsOffsets[session.id] || 0) : 0;

    const seats = session?.seats || [];
    const isMultiClient = seats.length > 1;

    const retiredPaidShared = (() => {
        if (!session?.notes || !session.notes.includes('|||RETIRED_PAID_SHARED:')) return 0;
        const parts = session.notes.split('|||RETIRED_PAID_SHARED:')[1];
        if (!parts) return 0;
        const val = parseFloat(parts.split('|||')[0].trim());
        return isNaN(val) ? 0 : val;
    })();

    const [activeTab, setActiveTab] = React.useState('clients');

    React.useEffect(() => {
        if (isOpen) {
            setActiveTab(isMultiClient ? 'clients' : 'general');
        }
    }, [isOpen, isMultiClient]);

    // Calcular desglose de horas/piñas de seats
    const seatHours = (session?.seats || []).reduce((sum, s) =>
        sum + (s.timeCharges || []).filter(tc => tc.type === 'hora').reduce((a, tc) => a + (Number(tc.amount) || 0), 0), 0);
    const seatPinas = (session?.seats || []).reduce((sum, s) =>
        sum + (s.timeCharges || []).filter(tc => tc.type === 'pina').reduce((a, tc) => a + (Number(tc.amount) || 0), 0), 0);

    const taxRate = config?.tableTaxType === 'iva_19'
        ? (config?.taxRateIva ?? 19) / 100
        : config?.tableTaxType === 'impoconsumo_8'
            ? (config?.taxRateImpoconsumo ?? 8) / 100
            : 0;
    const isExclusive = config?.tableTaxMode === 'exclusive' && taxRate > 0;
    const finalPina = isExclusive ? (config?.pricePina || 0) * (1 + taxRate) : (config?.pricePina || 0);
    const finalHora = isExclusive ? (config?.pricePerHour || 0) * (1 + taxRate) : (config?.pricePerHour || 0);

    let taxBreakdown = {};
    let totalTax = 0;
    let untippedTotal = grandTotal;
    let tipAmt = 0;

    const isTipEnabled = (() => {
        if (!session) return false;
        const match = (session.notes || '').match(/\|\|\|TIP_ENABLED:([01])\|\|\|/);
        if (match) return match[1] === '1';
        return config?.defaultTipEnabled ?? false;
    })();

    const tipPercent = config?.defaultTipPercent ?? 8;

    try {
        const tableCheckoutData = {
            table,
            session,
            elapsed,
            timeCost,
            totalConsumption,
            currentItems,
            config,
            hoursOffset,
            roundsOffset,
            paidHoursOffsets: {},
            paidRoundsOffsets: {}
        };
        const result = buildTableSyntheticCart(tableCheckoutData, config, products);
        if (result && result.syntheticCart) {
            const totals = FinancialEngine.buildCartTotals(result.syntheticCart, null, 1, 1);
            taxBreakdown = totals.taxBreakdown || {};
            totalTax = totals.totalTax || 0;
            untippedTotal = totals.totalUsd || 0;
            if (isTipEnabled) {
                tipAmt = Math.round(untippedTotal * (tipPercent / 100));
            }
        }
    } catch (e) {
        console.error("Error calculating tax breakdown in TotalDetailsModal:", e);
    }

    let breakdown = null;
    if (isMultiClient) {
        try {
            breakdown = calculateFullTableBreakdown(
                session,
                seats,
                elapsed,
                config,
                currentItems,
                null,
                null,
                table?.type === 'NORMAL',
                hoursOffset,
                roundsOffset,
                table?.type
            );
        } catch (e) {
            console.error("Error calculating table breakdown in TotalDetailsModal:", e);
        }
    }

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Detalle de Cuenta">
             <div className="flex flex-col gap-3 py-4 text-slate-800 dark:text-white max-h-[70vh] overflow-y-auto pr-1">
                {/* Selector de pestañas si hay múltiples clientes */}
                {isMultiClient && (
                    <div className="flex p-1 bg-slate-100 dark:bg-slate-800/40 rounded-xl mb-1 border border-slate-200/50 dark:border-white/5">
                        <button
                            onClick={() => setActiveTab('clients')}
                            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 ${
                                activeTab === 'clients'
                                    ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-white shadow-sm border border-slate-200/50 dark:border-white/5'
                                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-350'
                            }`}
                        >
                            <span>👥</span> Por Cliente
                        </button>
                        <button
                            onClick={() => setActiveTab('general')}
                            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 ${
                                activeTab === 'general'
                                    ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-white shadow-sm border border-slate-200/50 dark:border-white/5'
                                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-350'
                            }`}
                        >
                            <span>📋</span> Resumen General
                        </button>
                    </div>
                )}

                {isMultiClient && activeTab === 'clients' && breakdown ? (
                    <>
                        {/* Consumo Compartido */}
                        {breakdown.sharedTotal > 0 && (
                            <div className="flex flex-col p-3 bg-indigo-50/40 dark:bg-indigo-950/15 rounded-xl border border-indigo-150 dark:border-indigo-900/30">
                                <div className="flex justify-between items-center mb-2 pb-2 border-b border-indigo-200/30 dark:border-indigo-900/30">
                                    <span className="text-xs font-black text-indigo-700 dark:text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
                                        Consumo Compartido
                                    </span>
                                    <span className="text-base font-black text-indigo-800 dark:text-indigo-300">
                                        {breakdown.retiredPaidShared > 0 ? (
                                            <span className="flex flex-col items-end">
                                                <span className="text-[10px] line-through opacity-55 font-normal">{formatCOP(breakdown.sharedTotal)}</span>
                                                <span className="text-emerald-600 dark:text-emerald-450">{formatCOP(breakdown.remainingSharedTotal)}</span>
                                            </span>
                                        ) : (
                                            formatCOP(breakdown.sharedTotal)
                                        )}
                                    </span>
                                </div>
                                <div className="flex flex-col gap-1.5 text-xs text-slate-600 dark:text-slate-350">
                                    {breakdown.sessionTimeCost?.pinaCost > 0 && (
                                        <div className="flex justify-between">
                                            <span>
                                                {session?.game_mode === 'PINA' ? 1 + (Number(session?.extended_times) || 0) : Number(session?.extended_times) || 0} jugada(s) compartida(s)
                                            </span>
                                            <span className="font-semibold">{formatCOP(breakdown.sessionTimeCost.pinaCost)}</span>
                                        </div>
                                    )}
                                    {breakdown.sessionTimeCost?.hourCost > 0 && (
                                        <div className="flex justify-between">
                                            <span>
                                                Tiempo compartido ({formatHoursPaid(Number(session?.hours_paid) || 0)})
                                            </span>
                                            <span className="font-semibold">{formatCOP(breakdown.sessionTimeCost.hourCost)}</span>
                                        </div>
                                    )}
                                    {breakdown.sessionTimeCost?.libreCost > 0 && (
                                        <div className="flex justify-between">
                                            <span>Tiempo de juego libre compartido ({formatElapsedTime(elapsed)})</span>
                                            <span className="font-semibold">{formatCOP(breakdown.sessionTimeCost.libreCost)}</span>
                                        </div>
                                    )}
                                    {breakdown.sharedItems.map((item, idx) => (
                                        <div key={idx} className="flex justify-between">
                                            <span>
                                                <span className="text-indigo-600 dark:text-indigo-400 font-bold mr-1">{item.qty}x</span>
                                                {item.product_name}
                                            </span>
                                            <span>{formatCOP(item.qty * item.unit_price_usd)}</span>
                                        </div>
                                    ))}
                                </div>
                                    {breakdown.retiredPaidShared > 0 && (
                                        <div className="flex justify-between text-emerald-650 dark:text-emerald-400 font-bold border-t border-emerald-100/20 pt-1.5 mt-1.5">
                                            <span>✓ Pagado por clientes retirados</span>
                                            <span>-{formatCOP(breakdown.retiredPaidShared)}</span>
                                        </div>
                                    )}
                                    <div className="mt-2 pt-2 border-t border-indigo-200/30 dark:border-indigo-900/30 text-[11px] text-indigo-600 dark:text-indigo-400 font-medium">
                                        {breakdown.retiredPaidShared > 0 ? 'Cuota restante por cliente' : 'Cuota por cliente'} (÷{seats.filter(s => !s.paid).length}): <span className="font-bold">{formatCOP(breakdown.sharedPerSeat)}</span>
                                    </div>
                                </div>
                        )}

                        {/* Cuentas de Clientes */}
                        <div className="flex flex-col gap-2.5">
                            {breakdown.seats.map((sb, idx) => {
                                const seat = sb.seat;
                                const seatLabel = seat.label || `Cliente ${seats.indexOf(seat) + 1}`;
                                const isPaid = seat.paid;

                                return (
                                    <div
                                        key={idx}
                                        className={`flex flex-col p-3 rounded-xl border transition-all ${
                                            isPaid
                                                ? 'bg-slate-100/50 dark:bg-slate-800/10 border-slate-200 dark:border-slate-800/50 opacity-60'
                                                : 'bg-white dark:bg-slate-900/30 border-slate-200/80 dark:border-white/5 shadow-sm'
                                        }`}
                                    >
                                        <div className="flex justify-between items-center mb-2 pb-1.5 border-b border-slate-100 dark:border-white/5">
                                            <div className="flex items-center gap-2">
                                                <span className={`flex items-center justify-center w-5 h-5 rounded-full font-bold text-[10px] ${
                                                    isPaid 
                                                        ? 'bg-slate-200 dark:bg-slate-800 text-slate-500' 
                                                        : 'bg-sky-50 dark:bg-sky-950/50 text-sky-600 dark:text-sky-400 border border-sky-100 dark:border-sky-900/20'
                                                }`}>
                                                    {idx + 1}
                                                </span>
                                                <span className={`font-bold text-sm ${isPaid ? 'text-slate-500' : 'text-slate-800 dark:text-slate-200'}`}>
                                                    {seatLabel}
                                                </span>
                                            </div>
                                            {isPaid ? (
                                                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border border-emerald-250/20">
                                                    PAGADO
                                                </span>
                                            ) : (
                                                <div className="flex flex-col items-end gap-1">
                                                    <span className="text-xs font-black text-slate-850 dark:text-white">
                                                        Subtotal: {formatCOP(sb.subtotal)}
                                                    </span>
                                                    {seat.checkoutRequested ? (
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="text-[8px] font-black bg-orange-100 dark:bg-orange-950/40 text-orange-700 dark:text-orange-400 px-1.5 py-0.5 rounded uppercase tracking-wider animate-pulse">
                                                                En Cobro
                                                            </span>
                                                            <button
                                                                onClick={async () => {
                                                                    await cancelSeatCheckoutRequest(session.id, seat.id);
                                                                }}
                                                                className="text-[9px] font-extrabold text-rose-500 hover:text-rose-400 hover:underline transition-all"
                                                            >
                                                                Cancelar
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <button
                                                            onClick={async () => {
                                                                await requestSeatCheckout(session.id, seat.id);
                                                            }}
                                                            className="text-[9px] font-bold bg-sky-50 dark:bg-sky-900/20 hover:bg-sky-100 text-sky-650 dark:text-sky-400 border border-sky-200 dark:border-sky-700/40 px-1.5 py-0.5 rounded transition-all active:scale-95"
                                                        >
                                                            Solicitar Cobro
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex flex-col gap-1.5 text-xs">
                                            {sb.timeCost.total > 0 && (
                                                <div className="flex flex-col gap-1 bg-slate-50/50 dark:bg-slate-950/10 p-2 rounded-lg mb-1">
                                                    {sb.timeCost.hasPinas && (
                                                        (() => {
                                                            const tc = sb.seat.timeCharges?.filter(tc => tc.type === 'pina') || [];
                                                            return (
                                                                <div className="flex justify-between text-amber-700 dark:text-amber-400">
                                                                    <span>{tc.length} jugada(s) individual(es)</span>
                                                                    <span className="font-bold">{formatCOP(sb.timeCost.pinaCost)}</span>
                                                                </div>
                                                            );
                                                        })()
                                                    )}
                                                    {sb.timeCost.hasHours && (
                                                        (() => {
                                                            const tc = sb.seat.timeCharges?.filter(tc => tc.type === 'hora') || [];
                                                            const totalH = tc.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
                                                            return (
                                                                <div className="flex justify-between text-sky-700 dark:text-sky-400">
                                                                    <span>Tiempo individual ({formatHoursPaid(totalH)})</span>
                                                                    <span className="font-bold">{formatCOP(sb.timeCost.hourCost)}</span>
                                                                </div>
                                                            );
                                                        })()
                                                    )}
                                                </div>
                                            )}

                                            {sb.items.length > 0 && (
                                                <div className="flex flex-col gap-1">
                                                    {sb.items.map((item, itemIdx) => (
                                                        <div key={itemIdx} className="flex justify-between text-slate-700 dark:text-slate-355">
                                                            <span>
                                                                <span className="text-emerald-600 dark:text-emerald-400 font-bold mr-1">{item.qty}x</span>
                                                                {item.product_name}
                                                            </span>
                                                            <span className="font-semibold text-slate-800 dark:text-white">{formatCOP(item.qty * item.unit_price_usd)}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            {!isPaid && sb.sharedPortion > 0 && (
                                                <div className="flex justify-between text-slate-500 dark:text-slate-400 italic">
                                                    <span>Parte compartida</span>
                                                    <span>{formatCOP(sb.sharedPortion)}</span>
                                                </div>
                                            )}

                                            {sb.items.length === 0 && sb.timeCost.total === 0 && (!isPaid && sb.sharedPortion === 0) && (
                                                <span className="text-xs text-slate-400 italic">Sin consumos</span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </>
                ) : (
                    <>
                        {/* Jugadas */}
                        {table?.type !== 'NORMAL' && (costBreakdown?.hasPinas || seatPinas > 0) && (
                        <div className="flex flex-col p-3 bg-amber-50 dark:bg-amber-950/20 rounded-xl border border-amber-200 dark:border-amber-800/40">
                            <div className="flex justify-between items-center mb-1">
                                <span className="text-sm font-bold text-amber-700 dark:text-amber-400">Jugadas</span>
                                <span className="text-lg font-black">{formatCOP(costBreakdown.pinaCost || 0)}</span>
                            </div>
                            <span className="text-xs text-amber-600 dark:text-amber-400/70">
                                {session?.game_mode === 'PINA' ? 1 + (Number(session?.extended_times) || 0) : Number(session?.extended_times) || 0} jugada(s) · {formatCOP(finalPina)} c/u
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
                                <span className="text-lg font-black">{formatCOP(seatHours * finalHora)}</span>
                            </div>
                            <span className="text-xs text-sky-600 dark:text-sky-400/70">
                                {seatHours === 0.5 ? '30 min' : `${seatHours}h`} · {formatCOP(finalHora)}/hora
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
                        {retiredPaidShared > 0 && (
                            <div className="flex justify-between items-center p-3 bg-emerald-50/50 dark:bg-emerald-950/10 rounded-xl border border-emerald-200/30 dark:border-emerald-800/20 text-sm">
                                <span className="font-bold text-emerald-700 dark:text-emerald-400">✓ Pagado por clientes retirados</span>
                                <span className="font-black text-emerald-600 dark:text-emerald-400">-{formatCOP(retiredPaidShared)}</span>
                            </div>
                        )}
                    </>
                )}

                {/* Impuestos / IVA */}
                {totalTax > 0 && (
                <div className="flex flex-col p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-white/10 text-sm gap-1.5">
                    {Object.entries(taxBreakdown).map(([taxKey, taxVal]) => {
                        if (taxVal <= 0) return null;
                        const taxLabel = taxKey === 'iva_19' ? `IVA (${config?.taxRateIva ?? 19}%)` : taxKey === 'impoconsumo_8' ? `Impoconsumo (${config?.taxRateImpoconsumo ?? 8}%)` : taxKey;
                        return (
                            <div key={taxKey} className="flex justify-between items-center">
                                <span className="font-bold text-slate-650 dark:text-slate-350">{taxLabel}</span>
                                <span className="font-black text-slate-800 dark:text-white">{formatCOP(taxVal)}</span>
                            </div>
                        );
                    })}
                </div>
                )}

                {/* Propina del Personal */}
                {tipAmt > 0 && (
                <div className="flex flex-col p-3 bg-indigo-55/40 dark:bg-indigo-950/15 border border-indigo-150 dark:border-indigo-900/30 rounded-xl text-sm gap-1.5">
                    <div className="flex justify-between items-center">
                        <span className="font-bold text-indigo-700 dark:text-indigo-400">Propina del Personal ({tipPercent}%)</span>
                        <span className="font-black text-indigo-800 dark:text-indigo-300">{formatCOP(tipAmt)}</span>
                    </div>
                </div>
                )}

                {/* Total */}
                <div className="flex justify-between items-center mt-2 p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-200 dark:border-emerald-500/20">
                    <span className="text-sm font-black text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">Total Cuenta</span>
                    <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400 leading-none">
                        {formatCOP(untippedTotal + tipAmt)}
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
