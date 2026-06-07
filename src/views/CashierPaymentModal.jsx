import React, { useState, useEffect, useRef } from 'react';
import { CreditCard, Search, UserCheck, X, User, Users, MessageSquare } from 'lucide-react';
import { useTablesStore } from '../hooks/store/useTablesStore';
import { useOrdersStore } from '../hooks/store/useOrdersStore';
import { useAuthStore } from '../hooks/store/authStore';
import { useCustomersStore } from '../hooks/store/useCustomersStore';
import { calculateSessionCost, calculateElapsedTime, calculateSessionCostBreakdown, formatHoursPaid, buildTableSyntheticCart } from '../utils/tableBillingEngine';
import { Modal } from '../components/Modal';
import { processSaleTransaction } from '../utils/checkoutProcessor';
import { useProductContext } from '../context/ProductContext';
import { showToast } from '../components/Toast';
import { FinancialEngine } from '../core/FinancialEngine';
import { round2, divR, subR } from '../utils/dinero';
import { openCashDrawerWebSerial, getWebSerialConfig } from '../services/webSerialPrinter';
import { supabaseCloud } from '../config/supabaseCloud';

// Formatea un número como peso colombiano: $ 12.500
const formatCOP = (val) => new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', minimumFractionDigits: 0
}).format(Math.round(val || 0));

export default function CashierPaymentModal({ session, table, config, currentUser, onClose, onSuccess }) {
    const { closeSession, resetSessionAfterPayment, paidHoursOffsets, paidRoundsOffsets } = useTablesStore();
    const { cancelOrderBySessionId } = useOrdersStore();
    const { orders: allOrders, orderItems: allItems } = useOrdersStore();
    const cachedUsers = useAuthStore(s => s.cachedUsers);
    const { products, tasaCop } = useProductContext();

    const [method, setMethod] = useState('EFECTIVO');
    const [receivedCOP, setReceivedCOP] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [splitPeople, setSplitPeople] = useState(null);
    const [postPaymentAction, setPostPaymentAction] = useState(null);

    // Customer selection state
    const { customers: allCustomers, fetchCustomers } = useCustomersStore();
    useEffect(() => { fetchCustomers(); }, []);

    const [customerSearch, setCustomerSearch] = useState('');

    const [selectedCustomer, setSelectedCustomer] = useState(() => {
        if (!session.client_id && !session.client_name) return null;
        if (session.client_id) {
            const cached = useCustomersStore.getState().customers;
            const found = cached.find(c => c.id === session.client_id);
            if (found) return found;
        }
        if (session.client_name) {
            return { id: session.client_id || null, name: session.client_name, deuda: 0 };
        }
        return null;
    });
    const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
    const customerSearchRef = useRef(null);
    const dropdownRef = useRef(null);

    // Cuando el store local carga, reemplazar el objeto mínimo con el completo
    useEffect(() => {
        if (session.client_id && allCustomers.length > 0) {
            const found = allCustomers.find(c => c.id === session.client_id);
            if (found) setSelectedCustomer(found);
        }
    }, [allCustomers, session.client_id]);

    const isFiado = method === 'FIADO';

    // Filter customers by search
    const filteredCustomers = customerSearch.trim().length > 0
        ? allCustomers.filter(c =>
            (c.name || c.nombre || '').toLowerCase().includes(customerSearch.toLowerCase()) ||
            (c.phone || c.telefono || '').includes(customerSearch)
          ).slice(0, 6)
        : [];

    // Close dropdown on outside click
    useEffect(() => {
        const handler = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target) &&
                customerSearchRef.current && !customerSearchRef.current.contains(e.target)) {
                setShowCustomerDropdown(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // Calculate total    const isAbono = session?.notes && session.notes.includes('|||ABONO:');
    const isAbonoMonto = session?.notes && session.notes.includes('|||ABONO_MONTO:');
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

    const order = allOrders.find(o => o.table_session_id === session.id);
    const currentItems = isAbono ? abonoItems : (isAbonoMonto ? [] : (order ? allItems.filter(i => i.order_id === order.id) : []));
    const totalConsumption = isAbonoMonto ? (abonoMonto?.amount || 0) : round2(currentItems.reduce((acc, item) => acc + (Number(item.unit_price_usd) * Number(item.qty)), 0));

    // Elapsed time calculation
    const isPlaying = session && (session.status === 'ACTIVE' || session.status === 'CHECKOUT');
    const pausedSessions = useTablesStore(state => state.pausedSessions);
    const paused = pausedSessions?.[session?.id];
    const elapsed = isAnyAbono ? 0 : (paused?.isPaused ? (paused.elapsedAtPause || 0) : (session?.started_at ? calculateElapsedTime(session.started_at) : 0));

    const isTimeFree = isAnyAbono ? true : table.type === 'NORMAL';
    const hoursOffset = (paidHoursOffsets || {})[session?.id] || 0;
    const roundsOffset = (paidRoundsOffsets || {})[session?.id] || 0;
    const timeCost = !isAnyAbono && !isTimeFree ? calculateSessionCost(elapsed, session.game_mode, config, session?.hours_paid, session?.extended_times, session?.paid_at, hoursOffset, roundsOffset, session?.seats, table.type) : 0;
    
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
            hoursOffset,
            roundsOffset,
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
        console.error("Error calculating CashierPaymentModal grand total:", e);
    }

    // ── Abonos previos del historial (solo para cierre definitivo) ──
    const priorAbonoHistory = (() => {
        if (isAnyAbono) return []; // En modo abono, no hay previos que descontár
        const notes = session?.notes || '';
        if (!notes.includes('|||HISTORIAL_ABONOS:')) return [];
        try {
            const hist = JSON.parse(notes.split('|||HISTORIAL_ABONOS:')[1].split('|||')[0].trim());
            return Array.isArray(hist) ? hist : [];
        } catch (_) { return []; }
    })();
    const priorAbonoTotal = priorAbonoHistory.reduce((s, h) => s + (Number(h.amount) || 0), 0);
    const netToPay = Math.max(0, grandTotal - priorAbonoTotal);

    // Auto-fill received COP for electronic payment methods
    useEffect(() => {
        if (method !== 'EFECTIVO' && method !== 'FIADO') {
            setReceivedCOP((isAnyAbono ? grandTotal : netToPay).toString());
        } else if (method === 'FIADO') {
            setReceivedCOP('');
        }
    }, [method, grandTotal, netToPay, isAnyAbono]);

    // Change calculations against net-to-pay
    const effectiveTotal = isAnyAbono ? grandTotal : netToPay;
    const rCop = parseFloat(receivedCOP || '0');
    const changeCOP = rCop > effectiveTotal ? round2(subR(rCop, effectiveTotal)) : 0;
    const remainingCOP = rCop < effectiveTotal ? round2(subR(effectiveTotal, rCop)) : 0;
    const isReady = isFiado ? !!selectedCustomer : rCop >= effectiveTotal - 1;

    const handleSelectCustomer = (customer) => {
        setSelectedCustomer(customer);
        setCustomerSearch('');
        setShowCustomerDropdown(false);
    };

    const handleConfirmPayment = async () => {
        if (!isReady || isProcessing) return;
        setIsProcessing(true);
        try {
            // 1. Armar el carrito de compras a partir de currentItems
            const cart = currentItems.map(item => {
                return {
                    id: item.product_id,
                    _originalId: item.product_id,
                    name: item.product_name,
                    qty: item.qty,
                    priceUsd: Number(item.unit_price_usd), // almacena COP directamente
                    exactBs: 0,
                    isWeight: false
                };
            });

            // 2. Si la mesa cobró tiempo, ingresarlo como ítems separados (jugadas + horas)
            if (timeCost > 0) {
                const breakdown = calculateSessionCostBreakdown(elapsed, session.game_mode, config, session?.hours_paid, session?.extended_times, hoursOffset, roundsOffset, null, table.type);
                if (breakdown.pinaCost > 0) {
                    const pinaCount = session.game_mode === 'PINA' ? 1 + (Number(session.extended_times) || 0) : Number(session.extended_times) || 0;
                    const billableRounds = Math.max(0, pinaCount - roundsOffset);
                    cart.push({
                        id: `MESA-PINA-${session.id}`,
                        _originalId: `MESA-PINA-${session.id}`,
                        name: `Jugada ${table.name}`,
                        qty: billableRounds,
                        priceUsd: round2(config.pricePina || 0),
                        isWeight: false
                    });
                }
                if (breakdown.hourCost > 0) {
                    const billableHours = Math.max(0, (Number(session.hours_paid) || 0) - hoursOffset);
                    cart.push({
                        id: `MESA-HORA-${session.id}`,
                        _originalId: `MESA-HORA-${session.id}`,
                        name: `Tiempo ${table.name} (${formatHoursPaid(billableHours)})`,
                        qty: 1,
                        priceUsd: round2(breakdown.hourCost),
                        isWeight: false
                    });
                }
            }

            // 3. Preparar array de pagos
            const paymentPayload = [];

            // Inyectar abonos previos (solo en cierre definitivo)
            priorAbonoHistory.forEach(h => {
                paymentPayload.push({
                    id: crypto.randomUUID(),
                    methodId: (h.method || 'efectivo').toLowerCase(),
                    methodLabel: `${(h.method || 'Efectivo')} (Abono)`,
                    currency: 'COP',
                    amountUsd: Number(h.amount),
                    amountOriginal: Number(h.amount),
                    amountOriginalCurrency: 'COP',
                    amountBs: 0,
                    isAbonoPrevio: true,
                });
            });

            if (isFiado) {
                paymentPayload.push({ methodId: 'fiado', amountUsd: grandTotal, currency: 'COP' });
            } else {
                paymentPayload.push({
                    methodId: method.toLowerCase(),
                    amountUsd: rCop,
                    currency: 'COP'
                });
            }

            // 4. Invocar transaccionario
            let meseroUser = null;
            if (session.opened_by) {
                let openerUser = cachedUsers?.find(u => u.id === session.opened_by) || null;
                if (!openerUser && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(session.opened_by)) {
                    try {
                        const { supabaseCloud } = await import('../config/supabaseCloud');
                        const { data } = await supabaseCloud.from('staff_users').select('id, name, role').eq('id', session.opened_by).single();
                        if (data) openerUser = data;
                    } catch (_) {}
                }
                if (openerUser?.role === 'MESERO' || openerUser?.rol === 'MESERO' || openerUser?.role === 'BARRA' || openerUser?.rol === 'BARRA') {
                    meseroUser = openerUser;
                }
            }
            const saleResult = await processSaleTransaction({
                cart,
                cartTotalCOP: grandTotal,
                cartSubtotalCOP: grandTotal,
                payments: paymentPayload,
                changeBreakdown: { changeUsdGiven: changeCOP },
                selectedCustomerId: selectedCustomer?.id || null,
                customers: allCustomers,
                products: products || [],
                discountData: null,
                meseroId: meseroUser?.id || null,
                meseroNombre: meseroUser?.name || meseroUser?.nombre || null,
                tableName: table?.name || null,
                tableSessionId: session?.id || null,
                skipStockDeduction: true,
                tasaCop: tasaCop
            });

            if (!saleResult.success) {
                showToast('Error', saleResult.error || 'Fallo registrando en el motor de ventas', 'error');
                setIsProcessing(false);
                return;
            }

            // 5. Abrir cajón de dinero automáticamente (solo si es efectivo)
            if (method === 'EFECTIVO') {
                const wsCfg = getWebSerialConfig();
                if (wsCfg.autoOpenDrawer) {
                    openCashDrawerWebSerial().catch(err => {
                        console.log('Cajón no se pudo abrir por WebSerial:', err.message);
                    });
                }
            }

            if (isAnyAbono) {
                try {
                    const ordersStore = useOrdersStore.getState();
                    if (isAbono && abonoItems && abonoItems.length > 0) {
                        for (const item of abonoItems) {
                            const originalItem = ordersStore.orderItems.find(oi => oi.id === item.id);
                            if (originalItem) {
                                const remainingQty = Number(originalItem.qty) - Number(item.qty);
                                if (remainingQty <= 0) {
                                    await ordersStore.deleteItem(item.id);
                                } else {
                                    await ordersStore.updateItemQty(item.id, remainingQty);
                                }
                            }
                        }
                    }

                    // Parse, append to historial, and serialize new notes
                    const parseSessionNotes = (notesStr) => {
                        if (!notesStr) return { cleanNotes: '', abono: null, abonoMonto: null, historial: [] };
                        let clean = notesStr;
                        let ab = null;
                        let abM = null;
                        let hist = [];
                        if (notesStr.includes('|||ABONO:')) {
                            try { ab = JSON.parse(notesStr.split('|||ABONO:')[1].split('|||')[0].trim()); } catch (_) {}
                        }
                        if (notesStr.includes('|||ABONO_MONTO:')) {
                            try { abM = JSON.parse(notesStr.split('|||ABONO_MONTO:')[1].split('|||')[0].trim()); } catch (_) {}
                        }
                        if (notesStr.includes('|||HISTORIAL_ABONOS:')) {
                            try { hist = JSON.parse(notesStr.split('|||HISTORIAL_ABONOS:')[1].split('|||')[0].trim()); } catch (_) {}
                        }
                        clean = notesStr.split('|||')[0].trim();
                        return { cleanNotes: clean, abono: ab, abonoMonto: abM, historial: hist };
                    };

                    const serializeSessionNotes = (clean, ab, abM, hist) => {
                        let res = clean ? clean.trim() : '';
                        if (ab && ab.length > 0) {
                            res += ` |||ABONO:${JSON.stringify(ab)}`;
                        }
                        if (abM) {
                            res += ` |||ABONO_MONTO:${JSON.stringify(abM)}`;
                        }
                        if (hist && hist.length > 0) {
                            res += ` |||HISTORIAL_ABONOS:${JSON.stringify(hist)}`;
                        }
                        return res.trim() || null;
                    };

                    const { cleanNotes, historial } = parseSessionNotes(session.notes);
                    const newHistorial = [...historial, {
                        amount: Number(grandTotal),
                        method: isFiado ? 'FIADO' : method,
                        date: new Date().toISOString()
                    }];
                    const newNotes = serializeSessionNotes(cleanNotes, null, null, newHistorial);

                    await useTablesStore.getState().updateSessionMetadata(session.id, session.client_name, session.guest_count, session.client_id, newNotes);

                    // Revert status to ACTIVE
                    await supabaseCloud.from('table_sessions').update({ status: 'ACTIVE' }).eq('id', session.id);

                    // Sync
                    await useTablesStore.getState().syncTablesAndSessions();

                    showToast(
                        'Abono Exitoso',
                        `Abono de ${formatCOP(grandTotal)} registrado y comanda actualizada.`,
                        'success'
                    );
                    onSuccess();
                    return;
                } catch (error) {
                    console.error('[CashierPaymentModal] Error finalizing abono:', error);
                    showToast('Abono registrado, pero falló al actualizar la comanda', 'warning');
                    onSuccess();
                    return;
                }
            }

            // 6. Mostrar diálogo post-pago
            setPostPaymentAction({
                sessionId: session.id,
                tableName: table.name,
                grandTotal,
                method: isFiado ? 'FIADO' : method,
                customerName: selectedCustomer?.name || selectedCustomer?.nombre || null,
                isFiado
            });
            showToast(
                'Cobro Exitoso',
                isFiado
                    ? `Mesa ${table.name} cargada a cuenta de ${selectedCustomer?.name || selectedCustomer?.nombre}.`
                    : `La mesa ${table.name} ha sido facturada correctamente.`,
                'success'
            );
        } catch (error) {
            console.error(error);
            showToast('Error de Cierre', 'No se pudo procesar el pago finalizado.', 'error');
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <>
        <Modal isOpen={!postPaymentAction} onClose={onClose} title={`Cobro: ${table.name}`}>
            <div className="flex flex-col gap-4 py-2">

                {(() => {
                    const cleanNote = (session?.notes || '').split('|||')[0].trim();
                    if (!cleanNote) return null;
                    return (
                        <div className="flex items-start gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-700/40 rounded-xl">
                            <MessageSquare size={13} className="text-amber-500 shrink-0 mt-0.5" />
                            <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">{cleanNote}</p>
                        </div>
                    );
                })()}

                {/* Customer Selector */}
                <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1">
                        <User size={12} /> Cliente (opcional)
                    </label>
                    {selectedCustomer ? (
                        <div className="flex items-center justify-between p-3 bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-700/40 rounded-xl">
                            <div className="flex items-center gap-2">
                                <UserCheck size={16} className="text-sky-600" />
                                <div>
                                    <p className="text-sm font-bold text-sky-800 dark:text-sky-300 leading-none">
                                        {selectedCustomer.name || selectedCustomer.nombre}
                                    </p>
                                    {selectedCustomer.phone || selectedCustomer.telefono ? (
                                        <p className="text-[10px] text-sky-600 dark:text-sky-400 mt-0.5">
                                            {selectedCustomer.phone || selectedCustomer.telefono}
                                        </p>
                                    ) : null}
                                </div>
                            </div>
                            <button
                                onClick={() => { setSelectedCustomer(null); if (isFiado) setMethod('EFECTIVO'); }}
                                className="p-1 rounded-full text-sky-500 hover:bg-sky-200 dark:hover:bg-sky-800 transition-colors"
                            >
                                <X size={14} />
                            </button>
                        </div>
                    ) : (
                        <div className="relative">
                            <div className="relative flex items-center">
                                <Search size={14} className="absolute left-3 text-slate-400 pointer-events-none" />
                                <input
                                    ref={customerSearchRef}
                                    type="text"
                                    value={customerSearch}
                                    onChange={e => { setCustomerSearch(e.target.value); setShowCustomerDropdown(true); }}
                                    onFocus={() => setShowCustomerDropdown(true)}
                                    placeholder="Buscar cliente por nombre o teléfono..."
                                    className="w-full pl-9 pr-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-sky-400 focus:outline-none"
                                />
                            </div>
                            {showCustomerDropdown && filteredCustomers.length > 0 && (
                                <div
                                    ref={dropdownRef}
                                    className="absolute z-50 left-0 right-0 mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden"
                                >
                                    {filteredCustomers.map(c => (
                                        <button
                                            key={c.id}
                                            onClick={() => handleSelectCustomer(c)}
                                            className="w-full text-left px-4 py-3 hover:bg-sky-50 dark:hover:bg-sky-900/20 border-b border-slate-100 dark:border-slate-700 last:border-0 transition-colors"
                                        >
                                            <p className="text-sm font-bold text-slate-800 dark:text-white">{c.name || c.nombre}</p>
                                            {(c.phone || c.telefono) && (
                                                <p className="text-[10px] text-slate-500">{c.phone || c.telefono}</p>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Method Selector */}
                <div className={`grid gap-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl grid-cols-3 sm:grid-cols-6`}>
                    {['EFECTIVO', 'NEQUI', 'DAVIPLATA', 'TRANSFERENCIA', 'DATAFONO', ...(selectedCustomer ? ['FIADO'] : [])].map(m => (
                        <button
                            key={m}
                            onClick={() => setMethod(m)}
                            className={`py-2 px-1 text-[9px] font-black rounded-lg transition-all ${
                                method === m
                                    ? m === 'FIADO'
                                        ? 'bg-rose-500 text-white shadow-sm'
                                        : 'bg-amber-500 text-white shadow-sm'
                                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700/50'
                            }`}
                        >
                            {m}
                        </button>
                    ))}
                </div>

                {/* Amount to pay */}
                <div className="flex justify-between items-center p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-200 dark:border-emerald-500/20">
                    <div className="flex flex-col">
                        <span className="text-xs font-black text-emerald-700 dark:text-emerald-400 uppercase tracking-widest">
                            {(!isAnyAbono && priorAbonoTotal > 0) ? 'Neto a Cobrar' : 'Total a pagar'}
                        </span>
                        {!isAnyAbono && priorAbonoTotal > 0 && (
                            <span className="text-[10px] text-slate-500 mt-0.5">
                                Consumo: {formatCOP(grandTotal)} · Abonos: -{formatCOP(priorAbonoTotal)}
                            </span>
                        )}
                    </div>
                    <div className="flex flex-col items-end">
                        <span className="text-3xl font-black text-emerald-600 dark:text-emerald-400 leading-none">
                            {formatCOP(effectiveTotal)}
                        </span>
                    </div>
                </div>

                {/* Split Bill */}
                <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1">
                        <Users size={12} /> Dividir Cuenta
                    </label>
                    <div className="flex gap-2 flex-wrap">
                        {[2, 3, 4, 5, 6].map(n => (
                            <button
                                key={n}
                                onClick={() => setSplitPeople(splitPeople === n ? null : n)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all border ${
                                    splitPeople === n
                                        ? 'bg-violet-500 text-white border-violet-500 shadow-md shadow-violet-500/30'
                                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-violet-400'
                                }`}
                            >
                                {n} personas
                            </button>
                        ))}
                    </div>
                    {splitPeople && grandTotal > 0 && (
                        <div className="mt-1 p-3 bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-700/40 rounded-xl flex items-center justify-between">
                            <div>
                                <p className="text-xs font-bold text-violet-700 dark:text-violet-400 uppercase tracking-widest">
                                    Por persona ({splitPeople})
                                </p>
                            </div>
                            <div className="flex flex-col items-end">
                                <span className="text-xl font-black text-violet-700 dark:text-violet-300 leading-none">
                                    {formatCOP(divR(grandTotal, splitPeople))}
                                </span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Fiado notice OR denomination inputs */}
                {isFiado ? (
                    <div className="p-4 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-700/40 rounded-xl text-center">
                        <p className="text-sm font-bold text-rose-700 dark:text-rose-300">
                            Se cargará {formatCOP(grandTotal)} a la cuenta de
                        </p>
                        <p className="text-base font-black text-rose-800 dark:text-rose-200 mt-1">
                            {selectedCustomer?.name || selectedCustomer?.nombre}
                        </p>
                        <p className="text-[10px] text-rose-600/70 mt-1">No se abrirá la caja registradora</p>
                    </div>
                ) : (
                    <div className="flex flex-col gap-1.5 mt-2">
                        <label className="text-xs font-bold text-slate-500 ml-1">Monto Recibido</label>
                        <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-lg">$</span>
                            <input
                                type="number"
                                value={receivedCOP}
                                onChange={e => setReceivedCOP(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-9 pr-4 font-bold text-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                                placeholder="0"
                            />
                        </div>
                    </div>
                )}

                {/* Change */}
                {!isFiado && rCop > 0 && (
                    <div className={`mt-2 p-3.5 rounded-xl flex items-center justify-between border ${!isReady ? 'bg-rose-50 border-rose-200' : 'bg-sky-50 border-sky-200'}`}>
                        <span className={`text-sm font-bold ${!isReady ? 'text-rose-600' : 'text-sky-700'}`}>
                            {!isReady ? 'Falta cobrar:' : 'Vuelto:'}
                        </span>
                        <div className="flex flex-col items-end">
                            <span className={`text-xl font-black ${!isReady ? 'text-rose-600' : 'text-sky-600'}`}>
                                {formatCOP(!isReady ? remainingCOP : changeCOP)}
                            </span>
                        </div>
                    </div>
                )}

                {/* Action */}
                <button
                    onClick={handleConfirmPayment}
                    disabled={!isReady || isProcessing}
                    className={`w-full mt-4 py-4 rounded-xl font-black text-lg transition-all flex items-center justify-center gap-2 ${
                        isReady && !isProcessing
                            ? isFiado
                                ? 'bg-rose-500 hover:bg-rose-400 text-white shadow-lg shadow-rose-500/30 active:scale-95'
                                : 'bg-emerald-500 hover:bg-emerald-400 text-white shadow-lg shadow-emerald-500/30 active:scale-95'
                            : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                    }`}
                >
                    {isProcessing ? 'Procesando...' : isFiado ? <><CreditCard size={20}/> Cargar a Cuenta</> : <><CreditCard size={20}/> Confirmar Pago</>}
                </button>
            </div>
        </Modal>

        {/* Post-payment dialog: ¿Liberar mesa o dejar activa? */}
        {postPaymentAction && (
            <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-md">
                <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-6 mx-4 max-w-sm w-full animate-in zoom-in-95">
                    <div className="text-center mb-5">
                        <div className="w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-3">
                            <span className="text-2xl">✓</span>
                        </div>
                        <h3 className="text-lg font-black text-slate-800 dark:text-white">Cobro Exitoso</h3>
                        <p className="text-sm text-slate-500 mt-1">¿Qué deseas hacer con <strong>{postPaymentAction.tableName}</strong>?</p>
                    </div>
                    <div className="flex flex-col gap-2.5">
                        <button
                            onClick={async () => {
                                try {
                                    await closeSession(postPaymentAction.sessionId);
                                } catch { showToast("Error al liberar mesa", "warning"); }
                                setPostPaymentAction(null);
                                onSuccess();
                            }}
                            className="w-full py-3.5 rounded-xl font-black text-white bg-emerald-500 hover:bg-emerald-400 shadow-lg shadow-emerald-500/20 active:scale-95 transition-all"
                        >
                            Liberar Mesa
                        </button>
                        <button
                            onClick={async () => {
                                try {
                                    await resetSessionAfterPayment(postPaymentAction.sessionId);
                                    await cancelOrderBySessionId(postPaymentAction.sessionId);
                                } catch { showToast("Error al resetear mesa", "warning"); }
                                setPostPaymentAction(null);
                                onSuccess();
                            }}
                            className="w-full py-3.5 rounded-xl font-black text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-900/30 border-2 border-violet-200 dark:border-violet-700/50 hover:bg-violet-100 dark:hover:bg-violet-900/50 active:scale-95 transition-all"
                        >
                            Dejar Activa
                        </button>
                    </div>
                </div>
            </div>
        )}
        </>
    );
}
