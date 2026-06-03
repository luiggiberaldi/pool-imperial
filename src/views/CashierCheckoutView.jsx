import React, { useState, useEffect } from 'react';
import { CheckCircle2, AlertCircle, RefreshCw, DollarSign } from 'lucide-react';
import { useTablesStore } from '../hooks/store/useTablesStore';
import { useOrdersStore } from '../hooks/store/useOrdersStore';
import { useAuthStore } from '../hooks/store/authStore';
import { calculateSessionCost, calculateElapsedTime, buildTableSyntheticCart } from '../utils/tableBillingEngine';
import { useConfirm } from '../hooks/useConfirm.jsx';
import { round2 } from '../utils/dinero';
import CashierPaymentModal from './CashierPaymentModal';
import { useProductContext } from '../context/ProductContext';
import { FinancialEngine } from '../core/FinancialEngine';

export default function CashierCheckoutView({ triggerHaptic, isActive }) {
    const { tables, activeSessions, config, closeSession, cancelCheckoutRequest, syncTablesAndSessions, paidHoursOffsets, paidRoundsOffsets } = useTablesStore();
    const { orders: allOrders, orderItems: allItems } = useOrdersStore();
    const { currentUser } = useAuthStore();
    const { effectiveRate, products } = useProductContext();
    const tasaUSD = effectiveRate;
    const confirm = useConfirm();

    const [selectedSession, setSelectedSession] = useState(null);
    const [selectedTable, setSelectedTable] = useState(null);

    useEffect(() => {
        if (isActive) {
            syncTablesAndSessions();
        }
    }, [isActive, syncTablesAndSessions]);

    // Only show sessions that are waiting for checkout
    const checkoutSessions = activeSessions.filter(s => s.status === 'CHECKOUT');
    
    // Sort so oldest requests appear first
    checkoutSessions.sort((a, b) => new Date(a.started_at) - new Date(b.started_at));

    const handleSelectForPayment = (session) => {
        const table = tables.find(t => t.id === session.table_id);
        if (table) {
            triggerHaptic();
            setSelectedSession(session);
            setSelectedTable(table);
        }
    };

    return (
        <div className="flex-1 flex flex-col overflow-y-auto w-full relative">
            {/* Header */}
            <div className="sticky top-0 z-20 bg-[#F8FAFC]/90 dark:bg-[#0f172a]/90 backdrop-blur-xl px-6 pt-4 pb-3 border-b border-slate-200/50 dark:border-white/5">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight flex items-center gap-3">
                            <DollarSign className="text-emerald-500" />
                            Cola de Cobros
                        </h2>
                        <p className="text-sm font-medium text-slate-500 mt-0.5">
                            {checkoutSessions.length} mesa{checkoutSessions.length !== 1 ? 's' : ''} esperando cobro
                        </p>
                    </div>
                    <button 
                        onClick={() => { triggerHaptic(); syncTablesAndSessions(); }}
                        className="p-2.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-700 dark:hover:text-white transition-colors"
                    >
                        <RefreshCw size={20} />
                    </button>
                </div>
            </div>

            {/* List */}
            <div className="p-6">
                {checkoutSessions.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-12 text-center bg-white dark:bg-slate-900 rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-800">
                        <CheckCircle2 size={48} className="text-emerald-400 mb-4" />
                        <h3 className="text-lg font-bold text-slate-700 dark:bg-slate-300">Cola vacía</h3>
                        <p className="text-slate-500 mt-2 text-sm max-w-sm">No hay mesas pendientes de cobro en este momento.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {checkoutSessions.map(session => {
                            const table = tables.find(t => t.id === session.table_id);
                            if (!table) return null;

                            const order = allOrders.find(o => o.table_session_id === session.id);
                            const currentItems = order ? allItems.filter(i => i.order_id === order.id) : [];
                            const totalConsumption = round2(currentItems.reduce((acc, item) => acc + (Number(item.unit_price_usd) * Number(item.qty)), 0));

                            const elapsed = calculateElapsedTime(session.started_at);
                            const isTimeFree = table.type === 'NORMAL';
                            const hoursOffset = (paidHoursOffsets || {})[session.id] || 0;
                            const roundsOffset = (paidRoundsOffsets || {})[session.id] || 0;
                            const timeCost = !isTimeFree ? calculateSessionCost(elapsed, session.game_mode, config, session?.hours_paid, session?.extended_times, session?.paid_at, hoursOffset, roundsOffset, session?.seats) : 0;
                            
                            const taxRate = config?.tableTaxType === 'iva_19' ? 0.19 : config?.tableTaxType === 'impoconsumo_8' ? 0.08 : 0;
                            const isExclusive = config?.tableTaxMode === 'exclusive' && taxRate > 0;
                            const finalPina = isExclusive ? (config?.pricePina || 0) * (1 + taxRate) : (config?.pricePina || 0);
                            const finalHora = isExclusive ? (config?.pricePerHour || 0) * (1 + taxRate) : (config?.pricePerHour || 0);

                            const seatTimeCost = !isTimeFree ? (session?.seats || []).filter(s => !s.paid).reduce((sum, s) => {
                                const tc = (s.timeCharges || []);
                                const h = tc.filter(t => t.type === 'hora').reduce((a, t) => a + (Number(t.amount) || 0), 0);
                                const p = tc.filter(t => t.type === 'pina').reduce((a, t) => a + (Number(t.amount) || 0), 0);
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
                                    hoursOffset,
                                    roundsOffset,
                                    paidHoursOffsets: {},
                                    paidRoundsOffsets: {}
                                };
                                const result = buildTableSyntheticCart(tableCheckoutData, config, products);
                                if (result && result.syntheticCart) {
                                    const totals = FinancialEngine.buildCartTotals(result.syntheticCart, null, 1, 1);
                                    grandTotal = totals.totalUsd || 0;
                                }
                            } catch (e) {
                                console.error("Error calculating CashierCheckoutView grand total:", e);
                            }

                            return (
                                <div key={session.id} className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm border-2 border-orange-500/30 flex flex-col gap-3">
                                    <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-700 pb-2">
                                        <h3 className="font-black tracking-tight text-slate-800 dark:text-white">{table.name}</h3>
                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-100 text-orange-700 uppercase tracking-widest flex items-center gap-1">
                                            <AlertCircle size={10} />
                                            En Cobro
                                        </span>
                                    </div>

                                    <div className="flex justify-between items-center text-sm font-medium">
                                        <span className="text-slate-500">Total a cobrar:</span>
                                        <span className="text-lg font-black text-emerald-600 dark:text-emerald-400">${grandTotal.toFixed(2)}</span>
                                    </div>

                                    <div className="grid grid-cols-2 gap-2 mt-1">
                                        <button 
                                            onClick={async () => {
                                                if (await confirm({
                                                    title: '¿Devolver Cobro?',
                                                    message: '¿Estás seguro que deseas rechazar la solicitud de cobro y devolverla al mesero?',
                                                    confirmText: 'Sí, devolver',
                                                    variant: 'warning'
                                                })) {
                                                    cancelCheckoutRequest(session.id);
                                                }
                                            }}
                                            className="w-full py-2.5 rounded-xl font-bold bg-rose-50 dark:bg-rose-900/30 text-rose-600 border border-rose-200 dark:border-rose-800/50 hover:bg-rose-100 transition-colors text-xs"
                                        >
                                            Devolver
                                        </button>
                                        <button 
                                            onClick={() => handleSelectForPayment(session)}
                                            className="w-full py-2.5 rounded-xl font-black bg-emerald-500 text-white shadow-md shadow-emerald-500/20 hover:bg-emerald-400 active:scale-95 transition-all text-sm"
                                        >
                                            Cobrar
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Payment Modal */}
            {selectedSession && selectedTable && (
                <CashierPaymentModal
                    session={selectedSession}
                    table={selectedTable}
                    config={config}
                    rates={tasaUSD}
                    currentUser={currentUser}
                    onClose={() => { setSelectedSession(null); setSelectedTable(null); }}
                    onSuccess={() => { setSelectedSession(null); setSelectedTable(null); syncTablesAndSessions(); }}
                />
            )}
        </div>
    );
}
