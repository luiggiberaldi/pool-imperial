import React, { useEffect } from 'react';
import { CreditCard, X, ChevronRight, Coffee, Timer, MessageSquare } from 'lucide-react';
import { useTablesStore } from '../../hooks/store/useTablesStore';
import { useOrdersStore } from '../../hooks/store/useOrdersStore';
import { useAuthStore } from '../../hooks/store/authStore';
import { useCashStore } from '../../hooks/store/cashStore';
import { formatElapsedTime, calculateSessionCost, buildTableSyntheticCart, calculateFullTableBreakdown, getSessionElapsedMinutes } from '../../utils/tableBillingEngine';
import { round2 } from '../../utils/dinero';
import { showToast } from '../Toast';
import { useProductContext } from '../../context/ProductContext';
import { FinancialEngine } from '../../core/FinancialEngine';

// Formatea un número como peso colombiano: $ 12.500
const formatCOP = (val) => new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', minimumFractionDigits: 0
}).format(Math.round(val || 0));

/**
 * Panel shown in SalesView (cashier) listing all tables that have requested checkout.
 * Cashier taps a row to open the TableCheckoutModal for that table.
 */
export function TableQueuePanel({ onCheckoutTable }) {
    const { tables, activeSessions, subscribeToRealtime, pausedSessions } = useTablesStore();
    const { orders, orderItems, subscribeToRealtime: subscribeOrders } = useOrdersStore();
    const config = useTablesStore(s => s.config);
    const activeCashSession = useCashStore(s => s.activeCashSession);
    const paidHoursOffsets = useTablesStore(s => s.paidHoursOffsets);
    const paidRoundsOffsets = useTablesStore(s => s.paidRoundsOffsets);
    const cachedUsers = useAuthStore(s => s.cachedUsers);
    const { products } = useProductContext();

    // Ensure realtime is active while this panel is mounted
    useEffect(() => {
        subscribeToRealtime();
        subscribeOrders();
        return () => {}; // don't unsubscribe — shared channel
    }, [subscribeToRealtime, subscribeOrders]);

    const queueItems = [];
    activeSessions.forEach(session => {
        const table = tables.find(t => t.id === session.table_id);
        if (!table) return;

        const seatsRequesting = (session.seats || []).filter(seat => seat.checkoutRequested && !seat.paid);

        if (seatsRequesting.length > 0) {
            seatsRequesting.forEach(seat => {
                queueItems.push({
                    id: `${session.id}-${seat.id}`,
                    type: 'SEAT',
                    session,
                    table,
                    seat,
                    label: `${table.name} (${seat.label || 'Persona'})`,
                    seatId: seat.id
                });
            });
        } else if (session.status === 'CHECKOUT') {
            queueItems.push({
                id: session.id,
                type: 'SESSION',
                session,
                table,
                label: table.name,
                seatId: null
            });
        }
    });

    if (queueItems.length === 0) return null;

    return (
        <div className="mb-4 bg-orange-50 dark:bg-orange-950/20 border-2 border-orange-400 dark:border-orange-600/60 rounded-2xl sm:rounded-3xl overflow-hidden shadow-lg shadow-orange-500/10">
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-orange-200 dark:border-orange-800/40 bg-orange-100/60 dark:bg-orange-900/20">
                <div className="w-9 h-9 bg-orange-500 rounded-xl flex items-center justify-center shadow-md shadow-orange-500/30">
                    <CreditCard size={17} className="text-white" />
                </div>
                <div className="flex-1">
                    <p className="text-sm font-black text-orange-700 dark:text-orange-400">Cuentas Pendientes de Cobro</p>
                    <p className="text-[11px] text-orange-500/80">Toca una fila para procesar el cobro</p>
                </div>
                <div className="relative">
                    <div className="w-7 h-7 bg-orange-500 text-white rounded-full flex items-center justify-center text-sm font-black">
                        {queueItems.length}
                    </div>
                    <span className="absolute inset-0 rounded-full bg-orange-400 animate-ping opacity-40" />
                </div>
            </div>

            {/* Rows */}
            <div className="divide-y divide-orange-100 dark:divide-orange-800/20">
                {queueItems.map(item => {
                    const session = item.session;
                    const table = item.table;
                    const isAbono = session.notes && session.notes.includes('|||ABONO:');
                    const isAbonoMonto = session.notes && session.notes.includes('|||ABONO_MONTO:');
                    const isAnyAbono = isAbono || isAbonoMonto;
                    let abonoItems = [];
                    let abonoMonto = null;
                    if (isAbono) {
                        try {
                            abonoItems = JSON.parse(session.notes.split('|||ABONO:')[1].split('|||')[0].trim());
                        } catch (_) {}
                    } else if (isAbonoMonto) {
                        try {
                            abonoMonto = JSON.parse(session.notes.split('|||ABONO_MONTO:')[1].split('|||')[0].trim());
                        } catch (_) {}
                    }

                    const order = orders.find(o => o.table_session_id === session.id);
                    const currentItems = isAbono ? abonoItems : (isAbonoMonto ? [] : (order ? orderItems.filter(i => i.order_id === order.id) : []));
                    const totalConsumption = isAbonoMonto ? (abonoMonto?.amount || 0) : currentItems.reduce((a, i) => a + Number(i.unit_price_usd) * Number(i.qty), 0);
                    const elapsed = isAnyAbono ? 0 : getSessionElapsedMinutes(session, pausedSessions);
                    
                    const isTimeFree = isAnyAbono ? true : table.type === 'NORMAL';
                    const timeCost = !isAnyAbono && !isTimeFree ? calculateSessionCost(elapsed, session.game_mode, config, session.hours_paid, session.extended_times, session.paid_at, (paidHoursOffsets || {})[session.id] || 0, (paidRoundsOffsets || {})[session.id] || 0, session.seats, table.type) : 0;
                    const taxRate = config?.tableTaxType === 'iva_19'
                        ? (config?.taxRateIva ?? 19) / 100
                        : config?.tableTaxType === 'impoconsumo_8'
                            ? (config?.taxRateImpoconsumo ?? 8) / 100
                            : 0;
                    const isExclusive = config?.tableTaxMode === 'exclusive' && taxRate > 0;
                    const finalPina = isExclusive ? (config?.pricePina || 0) * (1 + taxRate) : (config?.pricePina || 0);
                    const finalHora = isExclusive ? (config?.pricePerHour || 0) * (1 + taxRate) : (config?.pricePerHour || 0);

                    const seatTimeCost = !isAnyAbono && !isTimeFree ? (session.seats || []).filter(s => !s.paid).reduce((sum, s) => {
                        const tc = (s.timeCharges || []);
                        const h = tc.filter(t => t.type === 'hora').reduce((a, t) => a + (Number(t.amount) || 0), 0);
                        const p = tc.filter(t => tc.type === 'pina').reduce((a, t) => a + (Number(t.amount) || 0), 0);
                        return sum + (h * finalHora) + (p * finalPina);
                    }, 0) : 0;
                    
                    let grandTotal = round2(timeCost + seatTimeCost + totalConsumption);
                    try {
                        const tableCheckoutData = {
                            table,
                            session,
                            elapsed,
                            timeCost,
                            totalConsumption,
                            currentItems,
                            config,
                            hoursOffset: (paidHoursOffsets || {})[session.id] || 0,
                            roundsOffset: (paidRoundsOffsets || {})[session.id] || 0,
                            paidHoursOffsets: {},
                            paidRoundsOffsets: {},
                            isPartial: isAnyAbono
                        };
                        const result = buildTableSyntheticCart(tableCheckoutData, config, products);
                        if (result && result.syntheticCart) {
                            const totals = FinancialEngine.buildCartTotals(result.syntheticCart, null, 1, 1);
                            grandTotal = totals.totalUsd || 0;
                        }
                    } catch (e) {
                        console.error("Error calculating TableQueuePanel grand total:", e);
                    }

                    // Calculate remainingToPay for this queue item
                    const getAbonoBreakdown = (item) => {
                        if (item.netAmount !== undefined) {
                            return {
                                net: Number(item.netAmount) || 0,
                                service: Number(item.serviceAmount) || 0
                            };
                        }
                        const amt = Number(item.amount) || 0;
                        const commonFactors = [1.10, 1.08, 1.05];
                        for (const factor of commonFactors) {
                            const net = Math.round(amt / factor);
                            if (net > 0 && Math.abs(net * factor - amt) < 2 && net % 100 === 0) {
                                return { net, service: amt - net };
                            }
                        }
                        return { net: amt, service: 0 };
                    };

                    let priorAbonoNetTotal = 0;
                    if (session.notes && session.notes.includes('|||HISTORIAL_ABONOS:')) {
                        try {
                            const histStr = session.notes.split('|||HISTORIAL_ABONOS:')[1].split('|||')[0].trim();
                            const list = JSON.parse(histStr);
                            priorAbonoNetTotal = list.reduce((sum, item) => sum + getAbonoBreakdown(item).net, 0);
                        } catch (_) {}
                    }

                    const remainingToPay = Math.max(0, grandTotal - priorAbonoNetTotal);

                    // SEAT SPECIFIC CALCULATIONS
                    let seatGrandTotal = 0;
                    let seatDisplayInfo = null;
                    let seatTaxBreakdown = {};
                    let seatTotalTax = 0;
                    let seatServiceChargeAmt = 0;
                    let seatTipAmt = 0;
                    let includeServiceCharge = config?.defaultServiceChargeEnabled ?? true;
                    let serviceChargePercent = config?.defaultServiceChargePercent ?? 10;
                    
                    const notes = session.notes || '';
                    const match = notes.match(/\|\|\|TIP_ENABLED:([01])\|\|\|/);
                    let includeTip = match ? match[1] === '1' : (config?.defaultTipEnabled ?? false);
                    let tipPercent = config?.defaultTipPercent ?? 8;
                    let seatBd = null;

                    if (item.type === 'SEAT' && item.seat) {
                        const _ho = (paidHoursOffsets || {})[session.id] || 0;
                        const _ro = (paidRoundsOffsets || {})[session.id] || 0;
                        const fb = calculateFullTableBreakdown(session, session.seats || [], elapsed, config, currentItems, null, session.seats?.filter(s => !s.paid).length || null, table.type === 'NORMAL', _ho, _ro);
                        seatBd = fb?.seats.find(s => s.seat.id === item.seat.id);
                        if (seatBd) {
                            seatDisplayInfo = {
                                timeCost: seatBd.timeCost,
                                items: seatBd.items,
                                sharedPortion: seatBd.sharedPortion,
                                sharedItems: fb.sharedItems,
                                sharedTimeTotal: fb.sharedTimeTotal,
                                divisor: fb.seats.filter(s => !s.seat.paid).length,
                            };

                            const tableCheckoutData = {
                                table,
                                session,
                                elapsed,
                                timeCost: seatBd.timeCost.total,
                                totalConsumption: seatBd.items.reduce((a, i) => a + Number(i.unit_price_usd) * Number(i.qty), 0),
                                currentItems,
                                config,
                                hoursOffset: _ho,
                                roundsOffset: _ro,
                                paidHoursOffsets: {},
                                paidRoundsOffsets: {},
                                isPartial: false,
                                seatId: item.seat.id,
                                seatDisplayInfo
                            };

                            const result = buildTableSyntheticCart(tableCheckoutData, config, products);
                            if (result && result.syntheticCart) {
                                const baseTotals = FinancialEngine.buildCartTotals(result.syntheticCart, null, 1, 1);
                                seatTaxBreakdown = baseTotals.taxBreakdown || {};
                                seatTotalTax = baseTotals.totalTax || 0;
                                seatServiceChargeAmt = includeServiceCharge ? Math.round(baseTotals.totalUsd * (serviceChargePercent / 100)) : 0;
                                seatTipAmt = includeTip ? Math.round(baseTotals.totalUsd * (tipPercent / 100)) : 0;
                                seatGrandTotal = baseTotals.totalUsd + seatServiceChargeAmt + seatTipAmt;
                            }
                        }
                    }

                    const mesero = session.opened_by && cachedUsers?.length
                        ? cachedUsers.find(u => u.id === session.opened_by)
                        : null;
                    const meseroName = mesero?.name || mesero?.nombre || null;

                    return (
                        <button
                            key={item.id}
                            onClick={() => {
                                if (!activeCashSession) { showToast('Abre la caja primero para poder cobrar', 'error'); return; }
                                if (item.type === 'SEAT') {
                                    onCheckoutTable({
                                        table,
                                        session,
                                        elapsed,
                                        timeCost: seatBd?.timeCost.total || 0,
                                        totalConsumption: seatBd?.items.reduce((a, i) => a + Number(i.unit_price_usd) * Number(i.qty), 0) || 0,
                                        currentItems,
                                        grandTotal: seatGrandTotal,
                                        frozenDivisor: session.seats.filter(s => !s.paid).length || null,
                                        isPartial: false,
                                        seatId: item.seat.id,
                                        seatDisplayInfo,
                                        includeServiceCharge,
                                        serviceChargePercent,
                                        serviceChargeAmount: seatServiceChargeAmt,
                                        includeTip,
                                        tipPercent,
                                        tipAmount: seatTipAmt,
                                        totalTax: seatTotalTax,
                                        taxBreakdown: seatTaxBreakdown
                                    });
                                } else {
                                    onCheckoutTable({ table, session, elapsed, timeCost, totalConsumption, currentItems, grandTotal, frozenDivisor: (session?.seats || []).filter(s => !s.paid).length || null, isPartial: isAnyAbono });
                                }
                            }}
                            className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-orange-100/70 dark:hover:bg-orange-900/20 active:scale-[0.99] transition-all text-left"
                        >
                            {/* Table name badge */}
                            <div className="w-11 h-11 bg-orange-500 text-white rounded-xl flex items-center justify-center font-black text-sm shrink-0 shadow-md shadow-orange-500/20">
                                {table.name.replace(/[^0-9]/g, '') || table.name.charAt(0)}
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                    <p className="font-bold text-slate-800 dark:text-white text-sm truncate">{item.label}</p>
                                    {isAnyAbono && (
                                        <span className="px-1.5 py-0.5 rounded-md text-[8px] font-black bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
                                            Abono
                                        </span>
                                    )}
                                </div>
                                {meseroName && (
                                    <p className="text-[10px] font-bold text-orange-500/80 truncate">{meseroName}</p>
                                )}
                                {item.type === 'SEAT' ? (
                                    <p className="text-[10px] text-orange-650 dark:text-orange-405 font-bold">Cobro individual solicitado</p>
                                ) : (
                                    (() => {
                                        const cleanNote = (session.notes || '').split('|||')[0].trim();
                                        if (!cleanNote) return null;
                                        return (
                                            <p className="text-[10px] text-amber-600 dark:text-amber-400 truncate flex items-center gap-1">
                                                <MessageSquare size={9} className="shrink-0" /> {cleanNote}
                                            </p>
                                        );
                                    })()
                                )}
                                <div className="flex items-center gap-2 mt-0.5">
                                    {isAnyAbono ? (
                                        <span className="flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-extrabold">
                                            <Coffee size={10} /> {isAbonoMonto ? 'Abono de monto libre' : `${currentItems.length} producto${currentItems.length !== 1 ? 's' : ''} a abonar`}
                                        </span>
                                    ) : (
                                        <>
                                            <span className="flex items-center gap-1 text-[10px] text-slate-400">
                                                <Timer size={10} /> {formatElapsedTime(elapsed)}
                                            </span>
                                            {(item.type === 'SEAT' ? (seatBd?.items.length || 0) : currentItems.length) > 0 && (
                                                <span className="flex items-center gap-1 text-[10px] text-slate-400">
                                                    <Coffee size={10} /> {item.type === 'SEAT' ? (seatBd?.items.length || 0) : currentItems.length} consumo{ (item.type === 'SEAT' ? (seatBd?.items.length || 0) : currentItems.length) !== 1 ? 's' : ''}
                                                </span>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* Total */}
                            <div className="text-right shrink-0">
                                {item.type !== 'SEAT' && remainingToPay === 0 ? (
                                    <div className="flex flex-col items-end">
                                        <span className="px-2 py-0.5 rounded-lg text-[9px] font-black bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 uppercase tracking-wider animate-pulse">
                                            Pagada ($0)
                                        </span>
                                    </div>
                                ) : (
                                    <p className="font-black text-orange-600 dark:text-orange-400 text-base">
                                        {formatCOP(item.type === 'SEAT' ? seatGrandTotal : remainingToPay)}
                                    </p>
                                )}
                            </div>

                            <ChevronRight size={18} className="text-orange-400 shrink-0" />
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
