import React from 'react';
import { formatElapsedTime } from '../../utils/tableBillingEngine';
import { Modal } from '../Modal';
import { useProductContext } from '../../context/ProductContext';
import { useTablesStore } from '../../hooks/store/useTablesStore';
import { buildTableSyntheticCart } from '../../utils/tableBillingEngine';
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
    const hoursOffset = session ? (paidHoursOffsets[session.id] || 0) : 0;
    const roundsOffset = session ? (paidRoundsOffsets[session.id] || 0) : 0;

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
        }
    } catch (e) {
        console.error("Error calculating tax breakdown in TotalDetailsModal:", e);
    }

    console.log("[TotalDetailsModal] products:", products?.length, "currentItems:", currentItems, "totalTax:", totalTax, "taxBreakdown:", taxBreakdown, "config:", config);

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Detalle de Cuenta">
             <div className="flex flex-col gap-3 py-4 text-slate-800 dark:text-white max-h-[70vh] overflow-y-auto">
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
