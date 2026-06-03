import React, { useEffect } from 'react';
import { CreditCard, X, ChevronRight, Coffee, Timer, MessageSquare } from 'lucide-react';
import { useTablesStore } from '../../hooks/store/useTablesStore';
import { useOrdersStore } from '../../hooks/store/useOrdersStore';
import { useAuthStore } from '../../hooks/store/authStore';
import { useCashStore } from '../../hooks/store/cashStore';
import { formatElapsedTime, calculateElapsedTime, calculateSessionCost, buildTableSyntheticCart } from '../../utils/tableBillingEngine';
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

    const pendingSessions = activeSessions.filter(s => s.status === 'CHECKOUT');

    if (pendingSessions.length === 0) return null;

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
                        {pendingSessions.length}
                    </div>
                    <span className="absolute inset-0 rounded-full bg-orange-400 animate-ping opacity-40" />
                </div>
            </div>

            {/* Rows */}
            <div className="divide-y divide-orange-100 dark:divide-orange-800/20">
                {pendingSessions.map(session => {
                    const table = tables.find(t => t.id === session.table_id);
                    if (!table) return null;

                    const order = orders.find(o => o.table_session_id === session.id);
                    const items = order ? orderItems.filter(i => i.order_id === order.id) : [];
                    const totalConsumption = items.reduce((a, i) => a + Number(i.unit_price_usd) * Number(i.qty), 0);
                    const paused = pausedSessions?.[session.id];
                    const elapsed = paused?.isPaused ? (paused.elapsedAtPause || 0) : (session.started_at ? calculateElapsedTime(session.started_at) : 0);
                    const isTimeFree = table.type === 'NORMAL';
                    const timeCost = isTimeFree ? 0 : calculateSessionCost(elapsed, session.game_mode, config, session.hours_paid, session.extended_times, session.paid_at, (paidHoursOffsets || {})[session.id] || 0, (paidRoundsOffsets || {})[session.id] || 0, session.seats, table.type);
                    const taxRate = config?.tableTaxType === 'iva_19'
                        ? (config?.taxRateIva ?? 19) / 100
                        : config?.tableTaxType === 'impoconsumo_8'
                            ? (config?.taxRateImpoconsumo ?? 8) / 100
                            : 0;
                    const isExclusive = config?.tableTaxMode === 'exclusive' && taxRate > 0;
                    const finalPina = isExclusive ? (config?.pricePina || 0) * (1 + taxRate) : (config?.pricePina || 0);
                    const finalHora = isExclusive ? (config?.pricePerHour || 0) * (1 + taxRate) : (config?.pricePerHour || 0);

                    const seatTimeCost = isTimeFree ? 0 : (session.seats || []).filter(s => !s.paid).reduce((sum, s) => {
                        const tc = (s.timeCharges || []);
                        const h = tc.filter(t => t.type === 'hora').reduce((a, t) => a + (Number(t.amount) || 0), 0);
                        const p = tc.filter(t => t.type === 'pina').reduce((a, t) => a + (Number(t.amount) || 0), 0);
                        return sum + (h * finalHora) + (p * finalPina);
                    }, 0);
                    let grandTotal = round2(timeCost + seatTimeCost + totalConsumption);
                    try {
                        const tableCheckoutData = {
                            table,
                            session,
                            elapsed,
                            timeCost,
                            totalConsumption,
                            currentItems: items,
                            config,
                            hoursOffset: (paidHoursOffsets || {})[session.id] || 0,
                            roundsOffset: (paidRoundsOffsets || {})[session.id] || 0,
                            paidHoursOffsets: {},
                            paidRoundsOffsets: {}
                        };
                        const result = buildTableSyntheticCart(tableCheckoutData, config, products);
                        if (result && result.syntheticCart) {
                            const totals = FinancialEngine.buildCartTotals(result.syntheticCart, null, 1, 1);
                            grandTotal = totals.totalUsd || 0;
                        }
                    } catch (e) {
                        console.error("Error calculating TableQueuePanel grand total:", e);
                    }
                    const mesero = session.opened_by && cachedUsers?.length
                        ? cachedUsers.find(u => u.id === session.opened_by)
                        : null;
                    const meseroName = mesero?.name || mesero?.nombre || null;

                    return (
                        <button
                            key={session.id}
                            onClick={() => {
                                if (!activeCashSession) { showToast('Abre la caja primero para poder cobrar', 'error'); return; }
                                onCheckoutTable({ table, session, elapsed, timeCost, totalConsumption, currentItems: items, grandTotal, frozenDivisor: (session?.seats || []).filter(s => !s.paid).length || null });
                            }}
                            className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-orange-100/70 dark:hover:bg-orange-900/20 active:scale-[0.99] transition-all text-left"
                        >
                            {/* Table name badge */}
                            <div className="w-11 h-11 bg-orange-500 text-white rounded-xl flex items-center justify-center font-black text-sm shrink-0 shadow-md shadow-orange-500/20">
                                {table.name.replace(/[^0-9]/g, '') || table.name.charAt(0)}
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                                <p className="font-bold text-slate-800 dark:text-white text-sm truncate">{table.name}</p>
                                {meseroName && (
                                    <p className="text-[10px] font-bold text-orange-500/80 truncate">{meseroName}</p>
                                )}
                                {session.notes && (
                                    <p className="text-[10px] text-amber-600 dark:text-amber-400 truncate flex items-center gap-1">
                                        <MessageSquare size={9} className="shrink-0" /> {session.notes}
                                    </p>
                                )}
                                <div className="flex items-center gap-2 mt-0.5">
                                    <span className="flex items-center gap-1 text-[10px] text-slate-400">
                                        <Timer size={10} /> {formatElapsedTime(elapsed)}
                                    </span>
                                    {items.length > 0 && (
                                        <span className="flex items-center gap-1 text-[10px] text-slate-400">
                                            <Coffee size={10} /> {items.length} consumo{items.length !== 1 ? 's' : ''}
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Total */}
                            <div className="text-right shrink-0">
                                <p className="font-black text-orange-600 dark:text-orange-400 text-base">{formatCOP(grandTotal)}</p>
                            </div>

                            <ChevronRight size={18} className="text-orange-400 shrink-0" />
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
