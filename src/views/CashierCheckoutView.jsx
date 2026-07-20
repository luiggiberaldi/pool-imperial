import React, { useState, useEffect } from 'react';
import { CheckCircle2, AlertCircle, RefreshCw, DollarSign } from 'lucide-react';
import { useTablesStore } from '../hooks/store/useTablesStore';
import { useOrdersStore } from '../hooks/store/useOrdersStore';
import { useAuthStore } from '../hooks/store/authStore';
import { calculateSessionCost, buildTableSyntheticCart, getSessionElapsedMinutes } from '../utils/tableBillingEngine';
import { useConfirm } from '../hooks/useConfirm.jsx';
import { round2 } from '../utils/dinero';
import CashierPaymentModal from './CashierPaymentModal';
import { useProductContext } from '../context/ProductContext';
import { FinancialEngine } from '../core/FinancialEngine';

export default function CashierCheckoutView({ triggerHaptic, isActive }) {
    const { tables, activeSessions, config, closeSession, cancelCheckoutRequest, syncTablesAndSessions, paidHoursOffsets, paidRoundsOffsets, cancelSeatCheckoutRequest, pausedSessions } = useTablesStore();
    const { orders: allOrders, orderItems: allItems } = useOrdersStore();
    const { currentUser } = useAuthStore();
    const { effectiveRate, products } = useProductContext();
    const tasaUSD = effectiveRate;
    const confirm = useConfirm();

    const [selectedSession, setSelectedSession] = useState(null);
    const [selectedTable, setSelectedTable] = useState(null);
    const [selectedSeatId, setSelectedSeatId] = useState(null);

    useEffect(() => {
        if (isActive) {
            syncTablesAndSessions();
        }
    }, [isActive, syncTablesAndSessions]);

    // Build the checkout requests array
    const checkoutRequests = [];
    activeSessions.forEach(session => {
        if (session.status === 'CHECKOUT') {
            checkoutRequests.push({
                type: 'SESSION',
                id: `session-${session.id}`,
                session,
                seatId: null,
                started_at: session.started_at,
            });
        } else if (session.status === 'ACTIVE' && session.seats) {
            session.seats.forEach(seat => {
                if (seat.checkoutRequested && !seat.paid) {
                    checkoutRequests.push({
                        type: 'SEAT',
                        id: `seat-${session.id}-${seat.id}`,
                        session,
                        seatId: seat.id,
                        seat,
                        started_at: session.started_at,
                    });
                }
            });
        }
    });
    
    // Sort so oldest requests appear first
    checkoutRequests.sort((a, b) => new Date(a.started_at) - new Date(b.started_at));

    const handleSelectForPayment = (session, seatId = null) => {
        const table = tables.find(t => t.id === session.table_id);
        if (table) {
            triggerHaptic();
            setSelectedSession(session);
            setSelectedTable(table);
            setSelectedSeatId(seatId);
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
                            {checkoutRequests.length} cobro{checkoutRequests.length !== 1 ? 's' : ''} en cola
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
                {checkoutRequests.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-12 text-center bg-white dark:bg-slate-900 rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-800">
                        <CheckCircle2 size={48} className="text-emerald-400 mb-4" />
                        <h3 className="text-lg font-bold text-slate-700 dark:bg-slate-300">Cola vacía</h3>
                        <p className="text-slate-500 mt-2 text-sm max-w-sm">No hay cobros pendientes de cobro en este momento.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {checkoutRequests.map(req => {
                            const session = req.session;
                            const table = tables.find(t => t.id === session.table_id);
                            if (!table) return null;

                            let grandTotal = 0;
                            let isAnyAbono = false;
                            let abonoMonto = null;

                            if (req.type === 'SESSION') {
                                const isAbono = session.notes && session.notes.includes('|||ABONO:');
                                const isAbonoMonto = session.notes && session.notes.includes('|||ABONO_MONTO:');
                                isAnyAbono = isAbono || isAbonoMonto;
                                let abonoItems = [];
                                if (isAbono) {
                                    try {
                                        abonoItems = JSON.parse(session.notes.split('|||ABONO:')[1].split('|||')[0].trim());
                                    } catch (_) {}
                                } else if (isAbonoMonto) {
                                    try {
                                        abonoMonto = JSON.parse(session.notes.split('|||ABONO_MONTO:')[1].split('|||')[0].trim());
                                    } catch (_) {}
                                }

                                const order = allOrders.find(o => o.table_session_id === session.id);
                                const currentItems = isAbono ? abonoItems : (isAbonoMonto ? [] : (order ? allItems.filter(i => i.order_id === order.id) : []));
                                const totalConsumption = isAbonoMonto ? (abonoMonto?.amount || 0) : round2(currentItems.reduce((acc, item) => acc + (Number(item.unit_price_usd) * Number(item.qty)), 0));

                                const elapsed = isAnyAbono ? 0 : getSessionElapsedMinutes(session, pausedSessions);
                                const isTimeFree = isAnyAbono ? true : table.type === 'NORMAL';
                                const hoursOffset = (paidHoursOffsets || {})[session.id] || 0;
                                const roundsOffset = (paidRoundsOffsets || {})[session.id] || 0;
                                const timeCost = !isAnyAbono && !isTimeFree ? calculateSessionCost(elapsed, session.game_mode, config, session?.hours_paid, session?.extended_times, session?.paid_at, hoursOffset, roundsOffset, session?.seats) : 0;
                                
                                const taxRate = config?.tableTaxType === 'iva_19'
                                    ? (config?.taxRateIva ?? 19) / 100
                                    : config?.tableTaxType === 'impoconsumo_8'
                                        ? (config?.taxRateImpoconsumo ?? 8) / 100
                                        : 0;
                                const isExclusive = config?.tableTaxMode === 'exclusive' && taxRate > 0;
                                const finalPina = isExclusive ? (config?.pricePina || 0) * (1 + taxRate) : (config?.pricePina || 0);
                                const finalHora = isExclusive ? (config?.pricePerHour || 0) * (1 + taxRate) : (config?.pricePerHour || 0);

                                const seatTimeCost = !isAnyAbono && !isTimeFree ? (session?.seats || []).filter(s => !s.paid).reduce((sum, s) => {
                                    const tc = (s.timeCharges || []);
                                    const h = tc.filter(t => t.type === 'hora').reduce((a, t) => a + (Number(t.amount) || 0), 0);
                                    const p = tc.filter(t => t.type === 'pina').reduce((a, t) => a + (Number(t.amount) || 0), 0);
                                    return sum + (h * finalHora) + (p * finalPina);
                                }, 0) : 0;
                                
                                grandTotal = round2(timeCost + seatTimeCost + totalConsumption);
                                
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
                                        paidHoursOffsets: session ? { [session.id]: hoursOffset } : {},
                                        paidRoundsOffsets: session ? { [session.id]: roundsOffset } : {},
                                        isPartial: isAnyAbono
                                    };
                                    const result = buildTableSyntheticCart(tableCheckoutData, config, products);
                                    if (result && result.syntheticCart) {
                                        const totals = FinancialEngine.buildCartTotals(result.syntheticCart, null, 1, 1);
                                        grandTotal = totals.totalUsd || 0;
                                    }
                                } catch (e) {
                                    console.error("Error calculating CashierCheckoutView grand total:", e);
                                }
                            } else {
                                // SEAT checkout request
                                const order = allOrders.find(o => o.table_session_id === session.id);
                                const currentItems = order ? allItems.filter(i => i.order_id === order.id) : [];
                                const totalConsumption = round2(currentItems.reduce((acc, item) => acc + (Number(item.unit_price_usd) * Number(item.qty)), 0));

                                const elapsed = getSessionElapsedMinutes(session, pausedSessions);
                                const isTimeFree = table.type === 'NORMAL';
                                const hoursOffset = (paidHoursOffsets || {})[session.id] || 0;
                                const roundsOffset = (paidRoundsOffsets || {})[session.id] || 0;
                                const timeCost = !isTimeFree ? calculateSessionCost(elapsed, session.game_mode, config, session?.hours_paid, session?.extended_times, session?.paid_at, hoursOffset, roundsOffset, session?.seats) : 0;

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
                                        paidHoursOffsets: session ? { [session.id]: hoursOffset } : {},
                                        paidRoundsOffsets: session ? { [session.id]: roundsOffset } : {},
                                        seatId: req.seatId
                                    };
                                    const result = buildTableSyntheticCart(tableCheckoutData, config, products);
                                    if (result && result.syntheticCart) {
                                        const totals = FinancialEngine.buildCartTotals(result.syntheticCart, null, 1, 1);
                                        grandTotal = totals.totalUsd || 0;
                                    }
                                } catch (e) {
                                    console.error("Error calculating CashierCheckoutView seat grand total:", e);
                                }
                            }

                            return (
                                <div key={req.id} className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm border-2 border-orange-500/30 flex flex-col gap-3">
                                    <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-700 pb-2">
                                        <h3 className="font-black tracking-tight text-slate-850 dark:text-white text-sm">
                                            {req.type === 'SESSION' ? table.name : `${table.name} − ${req.seat.label || 'Persona'}`}
                                        </h3>
                                        {req.type === 'SESSION' && isAnyAbono ? (
                                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-700 uppercase tracking-widest flex items-center gap-1">
                                                <DollarSign size={10} />
                                                Abono {abonoMonto ? 'Monto' : 'Solicitado'}
                                            </span>
                                        ) : (
                                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-100 text-orange-700 uppercase tracking-widest flex items-center gap-1 animate-pulse">
                                                <AlertCircle size={10} />
                                                {req.type === 'SESSION' ? 'En Cobro' : 'Cliente en Cobro'}
                                            </span>
                                        )}
                                    </div>

                                    <div className="flex justify-between items-center text-sm font-medium">
                                        <span className="text-slate-500">Total a cobrar:</span>
                                        <span className="text-lg font-black text-emerald-600 dark:text-emerald-400">{new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(Math.round(grandTotal))}</span>
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
                                                    if (req.type === 'SESSION') {
                                                        cancelCheckoutRequest(session.id);
                                                    } else {
                                                        cancelSeatCheckoutRequest(session.id, req.seatId);
                                                    }
                                                }
                                            }}
                                            className="w-full py-2.5 rounded-xl font-bold bg-rose-50 dark:bg-rose-900/30 text-rose-600 border border-rose-200 dark:border-rose-800/50 hover:bg-rose-100 transition-colors text-xs"
                                        >
                                            Devolver
                                        </button>
                                        <button 
                                            onClick={() => handleSelectForPayment(session, req.seatId)}
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
                    seatId={selectedSeatId}
                    config={config}
                    rates={tasaUSD}
                    currentUser={currentUser}
                    onClose={() => { setSelectedSession(null); setSelectedTable(null); setSelectedSeatId(null); }}
                    onSuccess={() => { setSelectedSession(null); setSelectedTable(null); setSelectedSeatId(null); syncTablesAndSessions(); }}
                />
            )}
        </div>
    );
}
