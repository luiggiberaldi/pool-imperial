import React, { useState, useEffect } from 'react';
import { X, Clock, Coffee, Layers, ChevronRight, Timer, MessageSquare, Percent, Tag, Trash2, Users, Target } from 'lucide-react';
import { formatElapsedTime, calculateSessionCostBreakdown, formatHoursPaid, calculateFullTableBreakdown, buildTableSyntheticCart } from '../../utils/tableBillingEngine';
import { FinancialEngine } from '../../core/FinancialEngine';
import { useTablesStore } from '../../hooks/store/useTablesStore';
import { useAuthStore } from '../../hooks/store/authStore';
import { useProductContext } from '../../context/ProductContext';
import DiscountModal from '../Sales/DiscountModal';
import { BillSeatBreakdown } from './BillSeatBreakdown';
import { BillClassicBreakdown } from './BillClassicBreakdown';

const formatCOP = (val) => new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', minimumFractionDigits: 0
}).format(Math.round(val || 0));




function TargetIcon({size}) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>
        </svg>
    );
}

/**
 * TableBillModal — Paso 1 del flujo de cobro de mesa.
 * Muestra el desglose completo de la cuenta (tiempo + piñas + consumos).
 * Soporta modo mixto (piña + hora simultáneamente).
 */
export default function TableBillModal({ data, onClose, onProceedToPayment }) {
    const { table, session, elapsed, timeCost, totalConsumption, currentItems, grandTotal, isPartial } = data;
    const config = useTablesStore(state => state.config);
    const paidHoursOffsets = useTablesStore(state => state.paidHoursOffsets);
    const paidRoundsOffsets = useTablesStore(state => state.paidRoundsOffsets);
    const { currentUser } = useAuthStore();
    const { products: allProducts, effectiveRate: tasaUSD } = useProductContext();
    const canDiscount = currentUser?.role === 'ADMIN' || currentUser?.role === 'CAJERO';

    const taxRate = config?.tableTaxType === 'iva_19'
        ? (config?.taxRateIva ?? 19) / 100
        : config?.tableTaxType === 'impoconsumo_8'
            ? (config?.taxRateImpoconsumo ?? 8) / 100
            : 0;
    const isExclusive = config?.tableTaxMode === 'exclusive' && taxRate > 0;
    const finalPina = isExclusive ? (config?.pricePina || 0) * (1 + taxRate) : (config?.pricePina || 0);
    const finalHora = isExclusive ? (config?.pricePerHour || 0) * (1 + taxRate) : (config?.pricePerHour || 0);

    const [discount, setDiscount] = useState({ type: 'percentage', value: 0 });
    const [showDiscountModal, setShowDiscountModal] = useState(false);
    const [itemDiscounts, setItemDiscounts] = useState({});
    const [discountPopoverItem, setDiscountPopoverItem] = useState(null);
    const [discountCustomValue, setDiscountCustomValue] = useState('');
    const [payingSeatId, setPayingSeatId] = useState(null);
    // División de compartido: 'equal' | 'custom'
    const [sharedDivisionType, setSharedDivisionType] = useState('equal');
    const [customSharedAmounts, setCustomSharedAmounts] = useState({});
    const [includeServiceCharge, setIncludeServiceCharge] = useState(true); // Checked by default in Colombia
    const [serviceChargePercent, setServiceChargePercent] = useState(10);

    // Seats mode
    const seats = isPartial ? [] : (session?.seats || []);
    const hasSeats = seats.length > 0;
    // G: Congelar el número de divisor al abrir el modal para que no cambie al pagar un asiento
    const [frozenActiveCount] = useState(() => {
        const active = seats.filter(s => !s.paid).length;
        return active || 1;
    });
    const unpaidSeatsCount = seats.filter(s => !s.paid).length;
    // I: Resetear a 'equal' cuando queda 1 solo asiento sin pagar
    useEffect(() => {
        if (unpaidSeatsCount <= 1) setSharedDivisionType('equal');
    }, [unpaidSeatsCount]);
    const sharedDivision = sharedDivisionType === 'equal'
        ? { type: 'equal' }
        : { type: 'custom', amounts: customSharedAmounts };
    const isTimeFree = table.type === 'NORMAL';
    const hoursOffset = session ? (paidHoursOffsets[session.id] || 0) : 0;
    const roundsOffset = session ? (paidRoundsOffsets[session.id] || 0) : 0;
    const seatBreakdown = hasSeats ? calculateFullTableBreakdown(session, seats, elapsed, config, currentItems, sharedDivision, frozenActiveCount, isTimeFree, hoursOffset, roundsOffset, table.type) : null;
    // H: Bloquear cobro si división manual no suma correctamente
    const customDivisionMismatch = seatBreakdown && sharedDivisionType === 'custom' &&
        Math.abs(Object.values(customSharedAmounts).reduce((s, v) => s + (parseFloat(v) || 0), 0) - seatBreakdown.sharedTotal) >= 0.01;
    const zeroBreakdown = { pinaCost: 0, hourCost: 0, libreCost: 0, hasPinas: false, hasHours: false, isLibre: false, total: 0 };
    const breakdown = (isTimeFree || isPartial) ? zeroBreakdown : calculateSessionCostBreakdown(elapsed, session?.game_mode, config, session?.hours_paid, session?.extended_times, hoursOffset, roundsOffset, null, table.type);
    // Full breakdown (sin offsets) para mostrar totales completos
    const fullBreakdown = (isTimeFree || isPartial) ? zeroBreakdown : calculateSessionCostBreakdown(elapsed, session?.game_mode, config, session?.hours_paid, session?.extended_times, 0, 0, null, table.type);
    const isMixed = fullBreakdown.hasPinas && fullBreakdown.hasHours;



    // Item discounts: recalculate consumption total
    const itemDiscountTotal = (currentItems || []).reduce((acc, item) => {
        const disc = itemDiscounts[item.id];
        if (!disc || disc.value <= 0) return acc;
        const lineTotal = Number(item.unit_price_usd) * Number(item.qty);
        return acc + (disc.type === 'percentage' ? lineTotal * (disc.value / 100) : Math.min(disc.value * Number(item.qty), lineTotal));
    }, 0);
    const consumptionTaxInclusive = Math.max(0, grandTotal - timeCost);
    const adjustedConsumption = consumptionTaxInclusive - itemDiscountTotal;

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
            paidRoundsOffsets: {},
            isPartial: isPartial
        };
        const result = buildTableSyntheticCart(tableCheckoutData, config, allProducts);
        if (result && result.syntheticCart) {
            const totals = FinancialEngine.buildCartTotals(result.syntheticCart, null, 1, 1);
            taxBreakdown = totals.taxBreakdown || {};
            totalTax = totals.totalTax || 0;
        }
    } catch (e) {
        console.error("Error calculating tax breakdown in TableBillModal:", e);
    }

    // Grand total with item discounts applied
    const subtotalAfterItems = grandTotal - itemDiscountTotal;

    // Total discount (applied on top of item discounts)
    const discountAmountUsd = discount.value > 0
        ? (discount.type === 'percentage' ? subtotalAfterItems * (discount.value / 100) : Math.min(discount.value, subtotalAfterItems))
        : 0;
    const finalTotal = subtotalAfterItems - discountAmountUsd;
    
    // Colombian optional service charge (Suggested tip)
    const baseTotal = hasSeats && seatBreakdown ? (seatBreakdown.grandTotal - discountAmountUsd) : finalTotal;
    const serviceChargeAmount = includeServiceCharge ? Math.round(baseTotal * (serviceChargePercent / 100)) : 0;
    const finalTotalWithService = baseTotal + serviceChargeAmount;


    // Helper: piña count depends on game mode
    const pinaCount = session.game_mode === 'PINA' ? 1 + (Number(session.extended_times) || 0) : Number(session.extended_times) || 0;

    // Header subtitle
    const headerParts = [];
    if (isPartial) {
        headerParts.push("Abono Parcial");
    } else {
        if (fullBreakdown.hasPinas) {
            headerParts.push(`${pinaCount} jugada(s)`);
        }
        if (fullBreakdown.hasHours) {
            headerParts.push(`${formatElapsedTime(elapsed)} de sesión`);
        }
        if (headerParts.length === 0) {
            headerParts.push(session.game_mode === 'PINA' ? `${pinaCount} jugada(s)` : `${formatElapsedTime(elapsed)} de sesión`);
        }
    }

    return (
        <div
            className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center"
            onClick={onClose}
        >
            <div
                className="bg-white dark:bg-slate-950 w-full sm:max-w-md rounded-t-[2rem] sm:rounded-[2rem] shadow-2xl overflow-hidden flex flex-col"
                style={{ maxHeight: '92dvh' }}
                onClick={e => e.stopPropagation()}
            >
                {/* ── Header ─────────────────────────────────── */}
                <div className="shrink-0 flex items-center gap-3 px-5 pt-5 pb-4 border-b border-slate-100 dark:border-slate-800">
                    <div className="w-11 h-11 bg-orange-500 rounded-2xl flex items-center justify-center shadow-lg shadow-orange-500/25">
                        <Layers size={20} className="text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h2 className="font-black text-slate-800 dark:text-white text-lg leading-tight">{table.name}</h2>
                        <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
                            <Timer size={11} />
                            {headerParts.join(' · ')}
                            {isMixed && <span className="text-amber-500 font-bold ml-1">MIXTO</span>}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
                    >
                        <X size={18} />
                    </button>
                </div>

                {(() => {
                    const cleanNote = (session?.notes || '').split('|||')[0].trim();
                    if (!cleanNote) return null;
                    return (
                        <div className="shrink-0 mx-4 mt-2 flex items-start gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-700/40 rounded-xl">
                            <MessageSquare size={13} className="text-amber-500 shrink-0 mt-0.5" />
                            <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">{cleanNote}</p>
                        </div>
                    );
                })()}

                {/* ── Scrollable body ─────────────────────────── */}
                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">

                    {/* ═══ SEATS MODE: Per-client breakdown ═══ */}
                    {hasSeats && seatBreakdown && (
                        <BillSeatBreakdown
                            seatBreakdown={seatBreakdown} seats={seats} unpaidSeatsCount={unpaidSeatsCount}
                            sharedDivisionType={sharedDivisionType} setSharedDivisionType={setSharedDivisionType}
                            customSharedAmounts={customSharedAmounts} setCustomSharedAmounts={setCustomSharedAmounts}
                            customDivisionMismatch={customDivisionMismatch}
                            onProceedToPayment={onProceedToPayment} discount={discount} itemDiscounts={itemDiscounts}
                            includeServiceCharge={includeServiceCharge ? serviceChargePercent : 0}
                        />
                    )}

                    {/* ═══ CLASSIC MODE: Session-level breakdown (when no seats) ═══ */}
                    {!hasSeats && (
                        <BillClassicBreakdown
                            session={session} elapsed={elapsed} timeCost={timeCost}
                            currentItems={currentItems} config={config} tasaUSD={tasaUSD}
                            fullBreakdown={fullBreakdown} breakdown={breakdown}
                            hoursOffset={hoursOffset} roundsOffset={roundsOffset}
                            pinaCount={pinaCount} canDiscount={canDiscount}
                            itemDiscounts={itemDiscounts} setItemDiscounts={setItemDiscounts}
                            discountPopoverItem={discountPopoverItem} setDiscountPopoverItem={setDiscountPopoverItem}
                            discountCustomValue={discountCustomValue} setDiscountCustomValue={setDiscountCustomValue}
                            products={allProducts}
                        />
                    )}
                    {/* ═══ END CLASSIC MODE ═══ */}

                    {/* Descuento general */}
                    {discountAmountUsd > 0 && (
                        <div className="bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/40 rounded-2xl p-4 flex items-center justify-between">
                            <div>
                                <p className="text-xs font-bold text-rose-600 uppercase tracking-wider">Descuento aplicado</p>
                                <p className="text-[10px] text-slate-400 mt-0.5">{discount.type === 'percentage' ? `${discount.value}%` : `${formatCOP(discount.value)} fijo`}</p>
                            </div>
                            <p className="text-base font-black text-rose-500">-{formatCOP(discountAmountUsd)}</p>
                        </div>
                    )}

                    {/* Servicio Opcional Toggle (Sugerencia de propina) */}
                    <div className="bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 rounded-2xl p-4 flex items-center justify-between select-none">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-emerald-100 dark:bg-emerald-950/40 rounded-xl flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                                <span className="font-extrabold text-sm">%</span>
                            </div>
                            <div>
                                <span className="text-xs font-bold text-slate-700 dark:text-slate-200">Servicio Voluntario</span>
                                <p className="text-[10px] text-slate-400 mt-0.5">Propina sugerida para el personal</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            {includeServiceCharge && (
                                <div className="flex items-center bg-white dark:bg-slate-850 px-2.5 py-1.5 rounded-xl border-2 border-slate-200 dark:border-slate-700 w-16 shadow-sm focus-within:border-emerald-500 transition-all select-none">
                                    <input 
                                        type="number" 
                                        min="0"
                                        max="100"
                                        value={serviceChargePercent} 
                                        onChange={(e) => {
                                            const v = parseInt(e.target.value);
                                            setServiceChargePercent(isNaN(v) ? 0 : Math.max(0, Math.min(100, v)));
                                        }}
                                        className="w-full text-center text-sm font-black bg-transparent text-slate-800 dark:text-white focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                    />
                                    <span className="text-xs font-black text-slate-400 select-none">%</span>
                                </div>
                            )}
                            <label className="relative inline-flex items-center cursor-pointer shrink-0">
                                <input 
                                    type="checkbox" 
                                    checked={includeServiceCharge} 
                                    onChange={(e) => setIncludeServiceCharge(e.target.checked)}
                                    className="sr-only peer"
                                />
                                <div className="w-11 h-6 bg-slate-200 dark:bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-350 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-650 peer-checked:bg-emerald-500"></div>
                            </label>
                        </div>
                    </div>

                    {/* -- DESGLOSE DE IMPUESTOS DYNAMIC -- */}
                    {totalTax > 0 && (
                        <div className="bg-slate-50 dark:bg-slate-900/40 border border-slate-200/50 dark:border-slate-800/50 rounded-2xl p-4 space-y-2 select-none text-xs">
                            <div className="flex items-center gap-2 mb-1">
                                <span className="font-extrabold text-sm text-slate-400">%</span>
                                <span className="font-bold text-slate-700 dark:text-slate-200">Impuestos del Consumo</span>
                            </div>
                            <div className="space-y-1 border-t border-slate-100 dark:border-slate-800 pt-2 font-medium text-slate-500 dark:text-slate-400">
                                {taxBreakdown && Object.entries(taxBreakdown).map(([taxKey, taxVal]) => {
                                    if (taxVal <= 0) return null;
                                    const taxLabel = taxKey === 'iva_19' ? `IVA (${config?.taxRateIva ?? 19}%)` : taxKey === 'impoconsumo_8' ? `Impoconsumo (${config?.taxRateImpoconsumo ?? 8}%)` : taxKey;
                                    return (
                                        <div key={taxKey} className="flex justify-between">
                                            <span>{taxLabel}:</span>
                                            <span className="font-bold text-slate-700 dark:text-slate-350">{formatCOP(taxVal)}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Total */}
                    <div
                        className="rounded-2xl p-4 flex items-center justify-between"
                        style={{ background: 'linear-gradient(135deg, #F97316, #EA580C)' }}
                    >
                        <div>
                            <p className="text-xs font-bold text-white/80 uppercase tracking-wider">Total a Cobrar</p>
                            {hasSeats && seatBreakdown && (
                                <p className="text-[10px] text-white/60 mt-0.5">
                                    {seatBreakdown.seats.filter(s => !s.seat.paid).length} persona(s) activa(s)
                                    {discountAmountUsd > 0 ? ` − Desc ${formatCOP(discountAmountUsd)}` : ''}
                                    {includeServiceCharge ? ` + Propina (${serviceChargePercent}%) ${formatCOP(serviceChargeAmount)}` : ''}
                                </p>
                            )}
                            {!hasSeats && isMixed && (
                                <p className="text-[10px] text-white/60 mt-0.5">
                                    Jugadas {formatCOP(fullBreakdown.pinaCost)} + Tiempo {formatCOP(fullBreakdown.hourCost)}{adjustedConsumption > 0 ? ` + Consumos ${formatCOP(adjustedConsumption)}` : ''}
                                    {(roundsOffset > 0 || hoursOffset > 0) ? ` − Pagado ${formatCOP(roundsOffset * finalPina + hoursOffset * finalHora)}` : ''}
                                    {discountAmountUsd > 0 ? ` − Desc ${formatCOP(discountAmountUsd)}` : ''}
                                    {includeServiceCharge ? ` + Propina (${serviceChargePercent}%) ${formatCOP(serviceChargeAmount)}` : ''}
                                </p>
                            )}
                            {!hasSeats && !isMixed && (timeCost > 0 || adjustedConsumption > 0 || discountAmountUsd > 0 || includeServiceCharge) && (
                                <p className="text-[10px] text-white/60 mt-0.5">
                                    {timeCost > 0 ? `Tiempo ${formatCOP(timeCost)}` : ''}
                                    {timeCost > 0 && adjustedConsumption > 0 ? ' + ' : ''}
                                    {adjustedConsumption > 0 ? `Consumos ${formatCOP(adjustedConsumption)}` : ''}
                                    {discountAmountUsd > 0 ? ` − Desc ${formatCOP(discountAmountUsd)}` : ''}
                                    {includeServiceCharge ? ` + Propina (${serviceChargePercent}%) ${formatCOP(serviceChargeAmount)}` : ''}
                                </p>
                            )}
                        </div>
                        <div className="text-right">
                            <p className="text-2xl font-black text-white">
                                {formatCOP(finalTotalWithService)}
                            </p>
                        </div>
                    </div>
                </div>

                {/* ── Footer ─────────────────────────────────── */}
                <div className="shrink-0 px-4 pb-6 pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
                    {/* Individual seat payment selector */}
                    {hasSeats && payingSeatId === null && (
                        <div className="flex gap-2">
                            <button
                                onClick={onClose}
                                className="flex-1 py-3.5 rounded-xl text-sm font-bold text-slate-500 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-95 transition-all"
                            >
                                Cerrar
                            </button>
                            {canDiscount && (
                                <button
                                    onClick={() => setShowDiscountModal(true)}
                                    className={`py-3.5 px-4 rounded-xl text-sm font-bold flex items-center gap-1.5 active:scale-95 transition-all ${discountAmountUsd > 0 ? 'bg-rose-100 text-rose-600 hover:bg-rose-200' : 'bg-amber-100 text-amber-600 hover:bg-amber-200'}`}
                                >
                                    <Percent size={14} />
                                </button>
                            )}
                            <button
                                disabled={customDivisionMismatch}
                                onClick={() => onProceedToPayment(discount, itemDiscounts, null, null, includeServiceCharge ? serviceChargePercent : 0)}
                                className={`flex-[2] py-3.5 rounded-xl text-sm font-black text-white flex items-center justify-center gap-2 active:scale-95 transition-all shadow-lg shadow-orange-500/25 ${customDivisionMismatch ? 'opacity-40 cursor-not-allowed' : ''}`}
                                style={{ background: customDivisionMismatch ? '#94a3b8' : 'linear-gradient(135deg, #F97316, #EA580C)' }}
                            >
                                Cobrar Todo
                                <ChevronRight size={16} />
                            </button>
                        </div>
                    )}
                    {hasSeats && payingSeatId === null && (
                        <div className="flex flex-wrap gap-1.5">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider py-1.5 mr-1">Cobrar individual:</span>
                            {seats.filter(s => !s.paid).map(seat => {
                                const sb = seatBreakdown?.seats.find(s => s.seat.id === seat.id);
                                return (
                                    <button
                                        key={seat.id}
                                        disabled={customDivisionMismatch}
                                        onClick={() => onProceedToPayment(discount, itemDiscounts, seat.id, sb?.subtotal, includeServiceCharge ? serviceChargePercent : 0)}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold bg-sky-50 dark:bg-sky-900/20 text-sky-600 dark:text-sky-400 border border-sky-200 dark:border-sky-700/40 hover:bg-sky-100 dark:hover:bg-sky-900/30 active:scale-95 transition-all ${customDivisionMismatch ? 'opacity-40 cursor-not-allowed' : ''}`}
                                    >
                                        {seat.label || `P${seats.indexOf(seat) + 1}`} · {sb ? formatCOP(includeServiceCharge ? sb.subtotal + Math.round(sb.subtotal * (serviceChargePercent / 100)) : sb.subtotal) : '$ 0'}
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {/* Classic footer (no seats) */}
                    {!hasSeats && (
                        <div className="flex gap-3">
                            <button
                                onClick={onClose}
                                className="flex-1 py-3.5 rounded-xl text-sm font-bold text-slate-500 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-95 transition-all"
                            >
                                Cerrar
                            </button>
                            {canDiscount && (
                                <button
                                    onClick={() => setShowDiscountModal(true)}
                                    className={`py-3.5 px-4 rounded-xl text-sm font-bold flex items-center gap-1.5 active:scale-95 transition-all ${discountAmountUsd > 0 ? 'bg-rose-100 text-rose-600 hover:bg-rose-200' : 'bg-amber-100 text-amber-600 hover:bg-amber-200'}`}
                                >
                                    <Percent size={14} />
                                    {discountAmountUsd > 0 ? `${discount.type === 'percentage' ? discount.value + '%' : formatCOP(discount.value)}` : 'Desc'}
                                </button>
                            )}
                            <button
                                onClick={() => onProceedToPayment(discount, itemDiscounts, null, null, includeServiceCharge ? serviceChargePercent : 0)}
                                className="flex-[2] py-3.5 rounded-xl text-sm font-black text-white flex items-center justify-center gap-2 active:scale-95 transition-all shadow-lg shadow-orange-500/25"
                                style={{ background: 'linear-gradient(135deg, #F97316, #EA580C)' }}
                            >
                                Cobrar {formatCOP(finalTotalWithService)}
                                <ChevronRight size={16} />
                            </button>
                        </div>
                    )}
                </div>

                {/* Discount Modal */}
                {showDiscountModal && (
                    <DiscountModal
                        currentDiscount={discount}
                        onApply={(d) => { setDiscount(d); setShowDiscountModal(false); }}
                        onClose={() => setShowDiscountModal(false)}
                        cartSubtotalUsd={subtotalAfterItems}
                        effectiveRate={1}
                        tasaCop={1}
                        copEnabled={true}
                        userRole={currentUser?.role || 'ADMIN'}
                        maxDiscountPercent={100}
                    />
                )}
            </div>
        </div>
    );
}
