import React, { useState, useEffect } from 'react';
import { 
    Edit2, Printer, X, Users, UserCheck, Lock, MessageSquare, Play, 
    ShoppingBag, CreditCard, Clock, Check, Plus, Trash2, CheckCircle2, ChevronRight
} from 'lucide-react';
import { 
    calculateElapsedTime, 
    calculateSessionCost, 
    calculateSessionCostBreakdown, 
    calculateConsumptionBs 
} from '../../utils/tableBillingEngine';
import { round2 } from '../../utils/dinero';
import { useTablesStore } from '../../hooks/store/useTablesStore';
import { useAuthStore } from '../../hooks/store/authStore';
import { useOrdersStore } from '../../hooks/store/useOrdersStore';
import { useNotifications } from '../../hooks/useNotifications';
import { useCustomersStore } from '../../hooks/store/useCustomersStore';
import { useConfirm } from '../../hooks/useConfirm';
import { useProductContext } from '../../context/ProductContext';
import { useCashStore } from '../../hooks/store/cashStore';
import { generatePartialSessionTicketPDF } from '../../utils/ticketGenerator';
import { showToast } from '../Toast';
import { logEvent } from '../../services/auditService';

import TableCardInlineModals from './TableCardInlineModals';
import { TargetIcon } from './TargetIcon';
import CashierPaymentModal from '../../views/CashierPaymentModal';

function useStaffName(staffId) {
    const cachedUsers = useAuthStore(s => s.cachedUsers);
    if (!staffId || !cachedUsers?.length) return null;
    const user = cachedUsers.find(u => u.id === staffId);
    return user?.name || user?.nombre || null;
}

export default function TableContextPanel({ tableId, onClose }) {
    const tables = useTablesStore(s => s.tables);
    const activeSessions = useTablesStore(s => s.activeSessions);
    
    const table = tables.find(t => t.id === tableId);
    const session = activeSessions.find(s => s.table_id === tableId);

    if (!table) return null;

    const { 
        config, openSession, closeSession, requestCheckout, 
        cancelCheckoutRequest, updateSessionMetadata, updateSessionSeats, 
        updateSessionTime, addPinaToSession, addHoursToSession, 
        pauseSession, resumeSession 
    } = useTablesStore();

    const paidHoursOffsets = useTablesStore(state => state.paidHoursOffsets);
    const paidRoundsOffsets = useTablesStore(state => state.paidRoundsOffsets);
    const paidElapsedOffsets = useTablesStore(state => state.paidElapsedOffsets);
    const pausedData = useTablesStore(state => session ? state.pausedSessions[session.id] : null);
    const { effectiveRate: tasaUSD } = useProductContext();
    const { currentUser } = useAuthStore();
    const staffName = useStaffName(session?.opened_by);
    const confirm = useConfirm();
    const { notifyMesaCobrar } = useNotifications();
    const activeCashSession = useCashStore(s => s.activeCashSession);

    const isAvailable = !session || session.status === 'CLOSED';
    const isPlaying = session && (session.status === 'ACTIVE' || session.status === 'CHECKOUT');
    const isCheckoutPending = session?.status === 'CHECKOUT';

    // Bloqueo de mesa
    const isLockedForMe = (currentUser?.role === 'MESERO' || currentUser?.role === 'BARRA') && isPlaying && session?.opened_by && session.opened_by !== currentUser?.id;

    const [elapsed, setElapsed] = useState(() =>
        isPlaying && session?.started_at ? calculateElapsedTime(session.started_at) : 0
    );
    const [isMutating, setIsMutating] = useState(false);
    const [showOrderPanel, setShowOrderPanel] = useState(false);

    const [showCancelModal, setShowCancelModal] = useState(false);
    const [showAdjustModal, setShowAdjustModal] = useState(false);
    const [showModeModal, setShowModeModal] = useState(false);
    const [showTotalDetails, setShowTotalDetails] = useState(false);
    const [showPinaConfirm, setShowPinaConfirm] = useState(false);
    const [adjustMins, setAdjustMins] = useState('');

    // Modo mixto
    const [modePina, setModePina] = useState(false);
    const [modeHora, setModeHora] = useState(false);
    const [selectedHours, setSelectedHours] = useState(1);
    const [showCashierPaymentModal, setShowCashierPaymentModal] = useState(false);
    
    // Wizard
    const [showOpenModal, setShowOpenModal] = useState(false);
    const [pendingOpen, setPendingOpen] = useState(null);
    const [wizardStep, setWizardStep] = useState(1); 
    const [initialChargeTarget, setInitialChargeTarget] = useState(null); 
    const [showReleaseConfirm, setShowReleaseConfirm] = useState(false);
    const [sessionClientName, setSessionClientName] = useState('');
    const [sessionGuestCount, setSessionGuestCount] = useState('');
    const [sessionClientId, setSessionClientId] = useState(null);
    const [sessionSeats, setSessionSeats] = useState([]);
    const [showCustomerSheet, setShowCustomerSheet] = useState(false);
    const [searchingSeatIndex, setSearchingSeatIndex] = useState(null); 
    const { customers: allCustomers, fetchCustomers, createCustomer, refresh: refreshCustomers } = useCustomersStore();

    const [seatValidationError, setSeatValidationError] = useState(false);

    // Atribución
    const [showAttributeModal, setShowAttributeModal] = useState(false);
    const [pendingCharge, setPendingCharge] = useState(null); 
    const [isProcessingCharge, setIsProcessingCharge] = useState(false);

    // Edición
    const [showEditMetaModal, setShowEditMetaModal] = useState(false);
    const [editClientName, setEditClientName] = useState('');
    const [editGuestCount, setEditGuestCount] = useState('');
    const [editClientId, setEditClientId] = useState(null);
    const [editNotes, setEditNotes] = useState('');
    const [editSeats, setEditSeats] = useState([]);
    const [showEditCustomerSheet, setShowEditCustomerSheet] = useState(false);
    const [searchingEditSeatIndex, setSearchingEditSeatIndex] = useState(null);

    useEffect(() => { fetchCustomers(); }, []);

    // Orders bound
    const allOrders = useOrdersStore(state => state.orders);
    const allItems = useOrdersStore(state => state.orderItems);
    const cancelOrderBySessionId = useOrdersStore(state => state.cancelOrderBySessionId);
    const { products, adjustStock } = useProductContext();
    
    const order = session ? allOrders.find(o => o.table_session_id === session.id) : null;
    const currentItems = order ? allItems.filter(i => i.order_id === order.id) : [];
    const totalConsumption = currentItems.reduce((acc, item) => acc + (Number(item.unit_price_usd) * Number(item.qty)), 0);
    const consumptionBs = calculateConsumptionBs(currentItems, tasaUSD, products);

    // Devuelve el stock si cancela la mesa
    const handleCancelTable = async () => {
        if (isMutating) return;
        setIsMutating(true);
        setShowCancelModal(false);
        try {
            currentItems.forEach(item => {
                const qty = Number(item.qty) || 0;
                if (qty <= 0) return;
                const product = products.find(p => p.id === item.product_id);
                if (product?.isCombo) {
                    if (product.comboItems && product.comboItems.length > 0) {
                        product.comboItems.forEach(ci => {
                            adjustStock(ci.productId, qty * (ci.qty || 1));
                        });
                    } else if (product.linkedProductId) {
                        adjustStock(product.linkedProductId, qty * (product.linkedQty || 1));
                    }
                } else {
                    adjustStock(item.product_id, qty);
                }
            });

            await Promise.all([
                cancelOrderBySessionId(session.id).catch(e => console.warn("cancelOrder offline", e)),
                closeSession(session.id, currentUser?.id || "SYSTEM", 0).catch(e => console.warn("closeSession offline", e))
            ]);
            logEvent('MESAS', 'ANULACION', `Mesa ${table.name} anulada manualmente. ${currentItems.length} items devueltos al inventario.`, currentUser);
        } catch (error) {
            console.error("Error anulando mesa", error);
            showToast("Ocurrió un error local al preparar la anulación.", "error");
        } finally {
            setIsMutating(false);
        }
    };

    // Live Timer Update
    const isPaused = pausedData?.isPaused ?? false;
    const pauseElapsed = pausedData?.elapsedAtPause ?? 0;

    useEffect(() => {
        let interval;
        if (isPlaying && session?.started_at && !isPaused) {
            const raf = requestAnimationFrame(() => {
                setElapsed(calculateElapsedTime(session.started_at));
            });

            interval = setInterval(() => {
                setElapsed(calculateElapsedTime(session.started_at));
            }, 1000);

            return () => {
                cancelAnimationFrame(raf);
                clearInterval(interval);
            };
        } else if (isPaused) {
            setElapsed(pauseElapsed);
        } else {
            const raf = requestAnimationFrame(() => {
                setElapsed(0);
            });
            return () => cancelAnimationFrame(raf);
        }
    }, [isPlaying, session?.started_at, isPaused, pauseElapsed]);

    // Sincronización Remota Segura (Resiliencia Multi-dispositivo)
    useEffect(() => {
        setShowCancelModal(false);
        setShowAdjustModal(false);
        setShowModeModal(false);
        setShowPinaConfirm(false);
        setShowReleaseConfirm(false);
        setShowOrderPanel(false);
        setShowTotalDetails(false);
        setShowCashierPaymentModal(false);
    }, [session?.id, tableId]);

    const handlePauseTimer = () => {
        if (!session) return;
        const currentElapsed = calculateElapsedTime(session.started_at);
        setElapsed(currentElapsed);
        pauseSession(session.id, currentElapsed);
    };

    const handleResumeTimer = async () => {
        if (!session) return;
        await resumeSession(session.id);
    };

    const handleStartNormal = async (hours = 0, clientName = '', guestCount = 0, clientId = null, includePina = false, seats = []) => {
        if (!currentUser || isMutating) return;
        const parts = [];
        if (includePina) parts.push('Piña');
        if (hours === 0) parts.push('Libre');
        else if (hours === 0.5) parts.push('Prepago 30 min');
        else parts.push(`Prepago ${hours} hr${hours !== 1 ? 's' : ''}`);
        const modeLabel = parts.join(' + ');
        const ok = await confirm({ 
            title: `Abrir ${table.name}`, 
            message: `¿Confirmar apertura en modo ${modeLabel}?`, 
            confirmText: 'Abrir Mesa', 
            cancelText: 'Cancelar', 
            variant: 'warning' 
        });
        if (!ok) return;
        setIsMutating(true);
        try {
            await openSession(table.id, currentUser.id, 'NORMAL', hours, clientName, guestCount, clientId, includePina, seats);
            setShowModeModal(false);
        } catch (error) {
            console.error(error);
            showToast("Error al abrir mesa", "error");
        } finally {
            setIsMutating(false);
        }
    };

    const handleStartPina = async (clientName = '', guestCount = 0, clientId = null, seats = []) => {
        if (!currentUser || isMutating) return;
        const ok = await confirm({ 
            title: `Abrir ${table.name}`, 
            message: '¿Confirmar apertura en modo La Piña?', 
            confirmText: 'Abrir Mesa', 
            cancelText: 'Cancelar', 
            variant: 'warning' 
        });
        if (!ok) return;
        setIsMutating(true);
        try {
            await openSession(table.id, currentUser.id, 'PINA', 0, clientName, guestCount, clientId, false, seats);
        } catch (error) {
            console.error(error);
            showToast("Error al abrir mesa en modo Piña", "error");
        } finally {
            setIsMutating(false);
        }
    };

    const handleStartConsumption = async (clientName = '', guestCount = 0, clientId = null, seats = []) => {
        if (!currentUser || isMutating) return;
        const ok = await confirm({ 
            title: `Ocupar ${table.name}`, 
            message: '¿Confirmar apertura de mesa?', 
            confirmText: 'Ocupar Mesa', 
            cancelText: 'Cancelar', 
            variant: 'warning' 
        });
        if (!ok) return;
        setIsMutating(true);
        try {
            await openSession(table.id, currentUser.id, 'NORMAL', 0, clientName, guestCount, clientId, false, seats);
        } catch (error) {
            console.error(error);
            showToast("Error al ocupar mesa", "error");
        } finally {
            setIsMutating(false);
        }
    };

    const handleRequestOpen = (mode, hours = 0) => {
        setSessionClientName('');
        setSessionGuestCount('');
        setSessionClientId(null);
        setSessionSeats([]);
        setModePina(false);
        setModeHora(false);
        setSelectedHours(1);
        setInitialChargeTarget(null);
        setWizardStep(1);
        refreshCustomers();
        setPendingOpen({ mode, hours });
        setShowOpenModal(true);
    };

    const handleCreateCustomer = async (name, phone, documentId) => {
        return await createCustomer(name, phone, documentId);
    };

    const requestAttribution = (charge) => {
        const seats = session?.seats || [];
        const activeSeats = seats.filter(s => !s.paid);
        if (activeSeats.length === 1) {
            setPendingCharge(charge);
            setTimeout(() => handleAttributeCharge(activeSeats[0].id, charge), 0);
        } else if (activeSeats.length > 1) {
            setPendingCharge(charge);
            setShowAttributeModal(true);
        }
    };

    const handleAttributeCharge = async (seatId, chargeOverride) => {
        const charge = chargeOverride || pendingCharge;
        if (!charge || isProcessingCharge || isMutating) return;
        setIsProcessingCharge(true);
        setIsMutating(true);
        try {
            if (charge.type === 'hora') {
                await addHoursToSession(session.id, charge.hoursValue, seatId || null);
                showToast(`${charge.hoursValue === 0.5 ? '30 min' : charge.hoursValue + 'h'} agregadas`, 'success');
            } else if (charge.type === 'pina') {
                const { addRoundToSession } = useTablesStore.getState();
                await addRoundToSession(session.id, seatId || null);
            }
        } catch (e) {
            console.error('Error al atribuir cargo:', e);
            showToast('Error al agregar cargo', 'error');
        } finally {
            setShowAttributeModal(false);
            setPendingCharge(null);
            setIsProcessingCharge(false);
            setIsMutating(false);
        }
    };

    const handleWizardFinish = async () => {
        if (!pendingOpen || isMutating) return;
        setIsMutating(true);
        try {
            const firstSeat = sessionSeats.length > 0 ? sessionSeats[0] : null;
            const firstSeatClientId = firstSeat?.customerId || sessionClientId;
            const name = firstSeat
                ? (firstSeat.label || allCustomers.find(c => c.id === firstSeat.customerId)?.name || '')
                : (sessionClientId ? (allCustomers.find(c => c.id === sessionClientId)?.name || sessionClientName.trim()) : sessionClientName.trim());
            const guests = sessionSeats.length > 0 ? sessionSeats.length : (parseInt(sessionGuestCount) || 0);
            const seats = sessionSeats.length > 0 ? sessionSeats : [];
            const isMultiSeat = seats.length > 1;
            const { mode } = pendingOpen;

            if (mode === 'SHOW_MODE') {
                if (!modePina && !modeHora) return;
                if (modePina && !modeHora) {
                    await openSession(table.id, currentUser.id, 'PINA', 0, name, guests, firstSeatClientId, false, seats);
                    if (isMultiSeat && initialChargeTarget !== undefined) {
                        setTimeout(async () => {
                            try {
                                const { addRoundToSession } = useTablesStore.getState();
                                const newSession = useTablesStore.getState().activeSessions.find(s => s.table_id === table.id);
                                if (newSession) await addRoundToSession(newSession.id, initialChargeTarget);
                            } catch (e) { console.error(e); }
                        }, 500);
                    }
                } else if (!modePina && modeHora) {
                    await openSession(table.id, currentUser.id, 'NORMAL', selectedHours, name, guests, firstSeatClientId, false, seats);
                } else {
                    await openSession(table.id, currentUser.id, 'NORMAL', selectedHours, name, guests, firstSeatClientId, true, seats);
                }
            } else if (mode === 'PINA') {
                await openSession(table.id, currentUser.id, 'PINA', 0, name, guests, firstSeatClientId, false, seats);
                if (isMultiSeat && initialChargeTarget !== undefined) {
                    setTimeout(async () => {
                        try {
                            const { addRoundToSession } = useTablesStore.getState();
                            const newSession = useTablesStore.getState().activeSessions.find(s => s.table_id === table.id);
                            if (newSession) await addRoundToSession(newSession.id, initialChargeTarget);
                        } catch (e) { console.error(e); }
                    }, 500);
                }
            } else if (mode === 'CONSUMPTION') {
                await openSession(table.id, currentUser.id, 'NORMAL', 0, name, guests, firstSeatClientId, false, seats);
            } else {
                await openSession(table.id, currentUser.id, 'NORMAL', pendingOpen.hours, name, guests, firstSeatClientId, false, seats);
            }

            setShowOpenModal(false);
            setPendingOpen(null);
            setWizardStep(1);
        } catch (error) {
            console.error(error);
            showToast("Error al abrir mesa", "error");
        } finally {
            setIsMutating(false);
        }
    };

    const handleAdjustTime = () => {
        setShowAdjustModal(true);
    };

    const submitAdjustTime = async () => {
        if (isMutating) return;
        setIsMutating(true);
        try {
            const m = parseInt(adjustMins);
            if (!isNaN(m) && m !== 0) {
                const d = new Date(session.started_at);
                d.setMinutes(d.getMinutes() + m); 
                await updateSessionTime(session.id, d.toISOString());
            }
            setShowAdjustModal(false);
            setAdjustMins('');
        } catch (error) {
            console.error(error);
            showToast("Error al ajustar tiempo", "error");
        } finally {
            setIsMutating(false);
        }
    };

    const handlePrintPartial = async () => {
        if (!session) return;
        try {
            await generatePartialSessionTicketPDF({
                table, session, elapsed, timeCost, totalConsumption, currentItems, grandTotal, tasaUSD, config,
                hoursOffset, roundsOffset
            });
            showToast('Pre-cuenta enviada a la impresora', 'success');
        } catch (err) {
            showToast(err.message || 'Error al imprimir pre-cuenta', 'error');
        }
    };

    const handleRequestCheckout = async () => {
        if (!activeCashSession) {
            showToast('Abre la caja primero para poder cobrar', 'error');
            return;
        }
        if (isMutating) return;
        setIsMutating(true);
        try {
            if (currentUser?.role === 'ADMIN' || currentUser?.role === 'CAJERO') {
                setShowCashierPaymentModal(true);
            } else {
                await requestCheckout(session.id);
                notifyMesaCobrar(table.name, grandTotal);
                showToast('Solicitud de cobro enviada a caja', 'success');
            }
        } catch (error) {
            console.error(error);
            showToast("Error al solicitar cobro", "error");
        } finally {
            setIsMutating(false);
        }
    };

    // Live cost variables
    const isTimeFree = table.type === 'NORMAL';
    const hoursOffset = session ? (paidHoursOffsets[session.id] || 0) : 0;
    const roundsOffset = session ? (paidRoundsOffsets[session.id] || 0) : 0;
    const elapsedOffset = session ? ((paidElapsedOffsets || {})[session.id] || 0) : 0;
    
    const timeCost = isPlaying && !isTimeFree ? calculateSessionCost(elapsed, session.game_mode, config, session?.hours_paid, session?.extended_times, session?.paid_at, hoursOffset, roundsOffset, session?.seats) : 0;
    const costBreakdown = isPlaying && !isTimeFree ? calculateSessionCostBreakdown(elapsed, session.game_mode, config, session?.hours_paid, session?.extended_times, hoursOffset, roundsOffset, session?.seats) : null;
    const isMixedMode = costBreakdown ? (costBreakdown.hasPinas && costBreakdown.hasHours) : false;
    
    const seatHasPinas = (session?.seats || []).some(s => (s.timeCharges || []).some(tc => tc.type === 'pina'));
    const seatHasHours = (session?.seats || []).some(s => (s.timeCharges || []).some(tc => tc.type === 'hora'));
    const hasPinas = (costBreakdown ? costBreakdown.hasPinas : (session?.game_mode === 'PINA')) || seatHasPinas;
    const hasHoursActive = (costBreakdown ? costBreakdown.hasHours : (session?.hours_paid > 0)) || seatHasHours;

    const seatTimeCost = isPlaying && !isTimeFree ? (session?.seats || []).filter(s => !s.paid).reduce((sum, s) => {
        const tc = (s.timeCharges || []);
        const h = tc.filter(t => t.type === 'hora').reduce((a, t) => a + (Number(t.amount) || 0), 0);
        const p = tc.filter(t => t.type === 'pina').reduce((a, t) => a + (Number(t.amount) || 0), 0);
        return sum + (h * (config.pricePerHour || 0)) + (p * (config.pricePina || 0));
    }, 0) : 0;

    const grandTotal = round2(timeCost + seatTimeCost + totalConsumption);
    const isPaidIdle = isPlaying && !!session?.paid_at && grandTotal === 0;

    const seatHoursTotal = (session?.seats || []).reduce((sum, s) =>
        sum + (s.timeCharges || []).filter(tc => tc.type === 'hora').reduce((acc, tc) => acc + (Number(tc.amount) || 0), 0), 0);
    const totalHoursPaid = (Number(session?.hours_paid) || 0) + seatHoursTotal;
    
    const wasOpenedWithHours = isPlaying && !isTimeFree && session?.game_mode === 'NORMAL' && !hasPinas && totalHoursPaid === 0;
    const hasLimit = totalHoursPaid > 0 || wasOpenedWithHours;
    const effectiveHours = hasLimit ? Math.max(0, totalHoursPaid - hoursOffset) : 0;
    const effectiveElapsed = elapsedOffset > 0 ? Math.max(0, elapsed - elapsedOffset) : elapsed;
    const remainingMins = hasLimit ? (effectiveHours * 60) - effectiveElapsed : 0;
    const isExceeded = hasLimit && remainingMins < 0;

    // Formatear timer de sesión
    const fmtTimer = (seconds) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        return h > 0
            ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
            : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    };

    return (
        <div className="flex flex-col h-full select-none text-slate-800 dark:text-slate-100">
            {/* Cabecera compacta tipo POS */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm mb-4 relative overflow-hidden">
                <div className="flex items-start justify-between mb-2">
                    <div>
                        <h2 className="text-xl font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                            {table.name}
                        </h2>
                        <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mt-0.5">
                            {table.type === 'POOL' ? '🎱 MESA DE POOL' : '🍹 BARRA / COMEDOR'}
                        </p>
                    </div>

                    {/* Semantic Status Badge */}
                    <div className={`px-2.5 py-1 rounded-full text-[10px] font-black tracking-wider uppercase ${
                        isAvailable 
                            ? 'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' 
                            : isPaidIdle 
                                ? 'bg-indigo-100 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/20' 
                                : isCheckoutPending 
                                    ? 'bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20 animate-pulse'
                                    : 'bg-sky-100 dark:bg-sky-500/10 text-sky-700 dark:text-sky-400 border border-sky-200 dark:border-sky-500/20'
                    }`}>
                        {isAvailable ? 'Libre' : isPaidIdle ? 'Pagado' : isCheckoutPending ? 'En caja' : 'Jugando'}
                    </div>
                </div>

                {/* Opened By / Meta */}
                {isPlaying && (
                    <div className="flex flex-wrap gap-1.5 mt-2 border-t border-slate-100 dark:border-slate-800 pt-2 text-[11px]">
                        {staffName && (
                            <span className="bg-slate-100 dark:bg-white/5 font-semibold text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded">
                                {staffName}
                            </span>
                        )}
                        {(session?.client_name || session?.guest_count > 0) && (
                            <button
                                disabled={isLockedForMe}
                                onClick={() => {
                                    setEditClientName(session.client_name || '');
                                    setEditGuestCount(session.guest_count > 0 ? String(session.guest_count) : '');
                                    setEditClientId(session.client_id || null);
                                    setEditNotes(session.notes || '');
                                    setEditSeats(session.seats || []);
                                    setShowEditMetaModal(true);
                                }}
                                className="bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-400 font-bold px-2 py-0.5 rounded flex items-center gap-1 active:scale-95 transition-all hover:bg-sky-100"
                            >
                                <UserCheck size={10} />
                                <span className="truncate max-w-[120px]">{session.client_name || 'Huéspedes'}</span>
                                {session.guest_count > 0 && <span className="flex items-center text-[9px] opacity-75"><Users size={9} className="ml-0.5" />{session.guest_count}</span>}
                                {!isLockedForMe && <Edit2 size={9} className="opacity-60" />}
                            </button>
                        )}
                        {isPlaying && !session?.client_name && !isLockedForMe && (
                            <button
                                onClick={() => {
                                    setEditClientName('');
                                    setEditGuestCount('');
                                    setEditClientId(null);
                                    setEditNotes(session?.notes || '');
                                    setEditSeats(session?.seats || []);
                                    setShowEditMetaModal(true);
                                }}
                                className="bg-slate-100 dark:bg-white/5 font-bold px-2 py-0.5 rounded text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 flex items-center gap-1"
                            >
                                <Plus size={10} /> Info Cliente
                            </button>
                        )}
                    </div>
                )}

                {/* Notas de Mesa */}
                {isPlaying && session?.notes && (
                    <div className="flex items-center gap-1.5 text-[11px] font-medium bg-amber-50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300 border border-amber-100 dark:border-amber-900/30 rounded-lg p-2 mt-2">
                        <MessageSquare size={12} className="shrink-0 text-amber-500" />
                        <span className="italic truncate">{session.notes}</span>
                    </div>
                )}
            </div>

            {/* Panel de Datos Vivos de Sesión */}
            {isPlaying ? (
                <div className="flex-1 flex flex-col gap-4 overflow-y-auto pr-1">
                    {/* Live Timer Section */}
                    <div className="bg-slate-900 text-white rounded-2xl p-4 shadow-sm relative flex items-center justify-between overflow-hidden">
                        <div>
                            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                                {session.game_mode === 'PINA' ? 'LA PIÑA' : hasLimit ? 'TIEMPO LÍMITE' : 'TIEMPO DE JUEGO'}
                            </span>
                            <div className="text-3xl font-black tracking-tight font-mono mt-0.5 text-white">
                                {fmtTimer(elapsed)}
                            </div>
                            
                            {/* Alertas de tiempo de prepago */}
                            {hasLimit && (
                                <div className="mt-1 flex items-center gap-1">
                                    {isExceeded ? (
                                        <span className="text-[10px] bg-rose-500/20 border border-rose-500/40 text-rose-300 font-extrabold px-1.5 py-0.5 rounded">
                                            Excedido por {fmtTimer(Math.abs(Math.floor(remainingMins * 60)))}
                                        </span>
                                    ) : (
                                        <span className="text-[10px] bg-amber-500/20 border border-amber-500/40 text-amber-300 font-extrabold px-1.5 py-0.5 rounded">
                                            Quedan {fmtTimer(Math.max(0, Math.floor(remainingMins * 60)))}
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Controles del Reloj */}
                        {!isLockedForMe && (
                            <div className="flex items-center gap-1.5">
                                {isPaused ? (
                                    <button 
                                        onClick={handleResumeTimer}
                                        className="bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-white p-2.5 rounded-xl shadow-md transition-all"
                                        title="Reanudar tiempo"
                                    >
                                        <Play size={14} fill="currentColor" />
                                    </button>
                                ) : (
                                    <button 
                                        onClick={handlePauseTimer}
                                        className="bg-amber-500 hover:bg-amber-400 active:scale-95 text-white p-2.5 rounded-xl shadow-md transition-all"
                                        title="Pausar tiempo"
                                    >
                                        <Clock size={14} />
                                    </button>
                                )}
                                <button 
                                    onClick={handleAdjustTime}
                                    className="bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 p-2.5 rounded-xl border border-slate-700/60 shadow-md transition-all"
                                    title="Ajustar minutos"
                                >
                                    <Edit2 size={14} />
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Financial Summary Box */}
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm flex flex-col gap-3">
                        <h4 className="text-xs font-black uppercase tracking-wider text-slate-400 border-b border-slate-100 dark:border-slate-800 pb-1.5">
                            Desglose de Cuentas
                        </h4>
                        
                        <div className="grid grid-cols-2 gap-3 text-xs">
                            <div className="bg-slate-50 dark:bg-slate-950/40 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800/40">
                                <span className="text-[10px] text-slate-400 font-bold block">Tiempo de Juego</span>
                                <span className="text-sm font-black text-slate-800 dark:text-white block mt-0.5">
                                    {isTimeFree ? 'Gratis (Normal)' : `$${round2(timeCost + seatTimeCost).toFixed(2)}`}
                                </span>
                            </div>

                            <div 
                                className="bg-slate-50 dark:bg-slate-950/40 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800/40 cursor-pointer hover:border-indigo-400/40 transition-colors"
                                onClick={() => setShowOrderPanel(true)}
                            >
                                <span className="text-[10px] text-slate-400 font-bold block">Comanda / Barra</span>
                                <span className="text-sm font-black text-indigo-600 dark:text-indigo-400 block mt-0.5">
                                    ${totalConsumption.toFixed(2)}
                                </span>
                                {currentItems.length > 0 && (
                                    <span className="text-[9px] text-slate-400 font-semibold block">
                                        {currentItems.reduce((acc, i) => acc + i.qty, 0)} u. consumidos
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Grand Total Row */}
                        <div className="mt-1 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                            <div>
                                <span className="text-[10px] text-slate-400 font-black block uppercase tracking-wider">
                                    Total Acumulado
                                </span>
                                <div className="text-2xl font-black text-slate-950 dark:text-white flex items-baseline gap-1 mt-0.5">
                                    <span>${grandTotal.toFixed(2)}</span>
                                    <span className="text-xs text-slate-500 font-normal">USD</span>
                                </div>
                            </div>
                            
                            {tasaUSD > 0 && (
                                <div className="text-right">
                                    <span className="text-[9px] text-slate-400 font-semibold block">
                                        Tasa: {tasaUSD.toFixed(2)} Bs
                                    </span>
                                    <span className="text-base font-extrabold text-emerald-600 dark:text-emerald-400 block mt-0.5">
                                        {((timeCost + seatTimeCost) * tasaUSD + consumptionBs).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Bs
                                    </span>
                                </div>
                            )}
                        </div>

                        {/* Utility buttons row (Fase 2C) */}
                        <div className="grid grid-cols-2 gap-2 mt-1">
                            <button
                                onClick={handlePrintPartial}
                                className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 border border-slate-200 dark:border-slate-800 hover:border-slate-300 hover:bg-slate-50 dark:hover:bg-slate-950/40 rounded-xl py-2 text-xs font-bold transition-all flex items-center justify-center gap-1.5"
                            >
                                <Printer size={13} />
                                Pre-cuenta (PDF)
                            </button>
                            <button
                                onClick={() => setShowTotalDetails(true)}
                                className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 border border-slate-200 dark:border-slate-800 hover:border-slate-300 hover:bg-slate-50 dark:hover:bg-slate-950/40 rounded-xl py-2 text-xs font-bold transition-all flex items-center justify-center gap-1.5"
                            >
                                Ver Detalle
                            </button>
                        </div>
                    </div>
                </div>
            ) : (
                /* Mesa Libre: Mostrar contenedor explicativo y modos de apertura rápida (Fase 2C) */
                <div className="flex-1 flex flex-col p-4 bg-slate-50/50 dark:bg-slate-950/20 border border-slate-200/60 dark:border-slate-800/40 rounded-2xl shadow-sm mb-4 justify-center">
                    <div className="text-center mb-4">
                        <CheckCircle2 size={32} className="text-emerald-500 mx-auto mb-1.5" />
                        <h3 className="text-sm font-extrabold text-slate-700 dark:text-slate-300">
                            Mesa disponible
                        </h3>
                        <p className="text-[11px] text-slate-450 dark:text-slate-500 mt-0.5 leading-relaxed">
                            Selecciona un modo de juego rápido para iniciar:
                        </p>
                    </div>

                    {table.type === 'POOL' ? (
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                onClick={() => handleRequestOpen('SHOW_MODE')}
                                className="bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-xl p-3 flex flex-col items-center justify-center text-center transition-all group active:scale-[0.97]"
                            >
                                <Play size={15} className="text-emerald-500 mb-1 group-hover:scale-110 transition-transform" fill="currentColor" />
                                <span className="text-[11px] font-black text-slate-700 dark:text-slate-300">Libre / Prepago</span>
                                <span className="text-[9px] text-slate-400 dark:text-slate-500 mt-0.5">Control de hora manual</span>
                            </button>
                            <button
                                onClick={() => {
                                    setSessionClientName('');
                                    setSessionGuestCount('');
                                    setSessionClientId(null);
                                    setSessionSeats([]);
                                    setModePina(true);
                                    setModeHora(false);
                                    setSelectedHours(1);
                                    setInitialChargeTarget(null);
                                    setWizardStep(1);
                                    refreshCustomers();
                                    setPendingOpen({ mode: 'PINA', hours: 0 });
                                    setShowOpenModal(true);
                                }}
                                className="bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-xl p-3 flex flex-col items-center justify-center text-center transition-all group active:scale-[0.97]"
                            >
                                <TargetIcon size={15} className="text-amber-500 mb-1 group-hover:scale-110 transition-transform" />
                                <span className="text-[11px] font-black text-slate-700 dark:text-slate-300">La Piña</span>
                                <span className="text-[9px] text-slate-400 dark:text-slate-500 mt-0.5">Por partidas fijas</span>
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={() => handleRequestOpen('CONSUMPTION')}
                            className="bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-col items-center justify-center text-center transition-all group active:scale-[0.97]"
                        >
                            <Play size={18} className="text-indigo-500 mb-1.5 group-hover:scale-110 transition-transform" fill="currentColor" />
                            <span className="text-[11px] font-black text-slate-700 dark:text-slate-300">Ocupar Mesa / Comanda</span>
                            <span className="text-[9px] text-slate-400 dark:text-slate-500 mt-0.5">Mesa normal de barra/bebidas</span>
                        </button>
                    )}
                </div>
            )}

            {/* Acción de barra rápida / Botonera Operativa */}
            <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800 shrink-0">
                {isAvailable ? (
                    /* Acciones cuando la mesa está LIBRE (Fase 2C) */
                    table.type === 'NORMAL' ? (
                        <button
                            onClick={() => handleRequestOpen('CONSUMPTION')}
                            className="w-full bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-950 font-bold text-sm py-3 px-4 rounded-xl shadow-md hover:shadow-lg transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                        >
                            <Play size={14} fill="currentColor" /> Ocupar / Consumo
                        </button>
                    ) : (
                        <button
                            onClick={() => handleRequestOpen('SHOW_MODE')}
                            className="w-full bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-950 font-bold text-sm py-3 px-4 rounded-xl shadow-md hover:shadow-lg transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                        >
                            <Play size={14} fill="currentColor" /> Abrir Mesa de Pool
                        </button>
                    )
                ) : isLockedForMe ? (
                    /* Mesa bloqueada */
                    <div className="bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl py-3 px-4 flex items-center justify-center gap-2 text-center text-slate-500 dark:text-slate-400">
                        <Lock size={14} />
                        <span className="text-xs font-bold">Mesa asignada a {staffName || 'otro mesero'}</span>
                    </div>
                ) : (
                    /* Acciones cuando la mesa está OCUPADA */
                    <div className="flex flex-col gap-2">
                        {/* Atribución de Piña o Hora Rápida (Fase 2C) */}
                        {!isCheckoutPending && !isTimeFree && (
                            <div className="flex flex-col gap-1.5 mb-1.5">
                                <span className="text-[10px] font-black tracking-widest text-slate-450 dark:text-slate-550 uppercase">
                                    Carga Rápida de Tiempo
                                </span>
                                <div className="grid grid-cols-3 gap-2">
                                    {/* +30 Mins */}
                                    <button
                                        disabled={isProcessingCharge || isMutating}
                                        onClick={async () => {
                                            if (isProcessingCharge || isMutating) return;
                                            const seats = session?.seats || [];
                                            const activeSeats = seats.filter(s => !s.paid);
                                            if (activeSeats.length > 0) {
                                                requestAttribution({ type: 'hora', hoursValue: 0.5 });
                                            } else {
                                                setIsMutating(true);
                                                try {
                                                    await addHoursToSession(session.id, 0.5, null);
                                                    showToast('30 minutos agregados a la mesa', 'success');
                                                } catch (e) {
                                                    showToast('Error al agregar minutos', 'error');
                                                } finally {
                                                    setIsMutating(false);
                                                }
                                            }
                                        }}
                                        className="bg-emerald-50 dark:bg-emerald-950/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800/40 text-emerald-700 dark:text-emerald-350 font-black text-[11px] py-2 rounded-xl transition-all active:scale-95 disabled:opacity-50"
                                    >
                                        +30 Min
                                    </button>

                                    {/* +1 Hora */}
                                    <button
                                        disabled={isProcessingCharge || isMutating}
                                        onClick={async () => {
                                            if (isProcessingCharge || isMutating) return;
                                            const seats = session?.seats || [];
                                            const activeSeats = seats.filter(s => !s.paid);
                                            if (activeSeats.length > 0) {
                                                requestAttribution({ type: 'hora', hoursValue: 1.0 });
                                            } else {
                                                setIsMutating(true);
                                                try {
                                                    await addHoursToSession(session.id, 1.0, null);
                                                    showToast('1 hora agregada a la mesa', 'success');
                                                } catch (e) {
                                                    showToast('Error al agregar hora', 'error');
                                                } finally {
                                                    setIsMutating(false);
                                                }
                                            }
                                        }}
                                        className="bg-teal-50 dark:bg-teal-950/20 hover:bg-teal-100 dark:hover:bg-teal-900/30 border border-teal-200 dark:border-teal-800/40 text-teal-700 dark:text-teal-350 font-black text-[11px] py-2 rounded-xl transition-all active:scale-95 disabled:opacity-50"
                                    >
                                        +1 Hora
                                    </button>

                                    {/* +1 Piña */}
                                    <button
                                        disabled={isProcessingCharge || isMutating}
                                        onClick={async () => {
                                            if (isProcessingCharge || isMutating) return;
                                            const seats = session?.seats || [];
                                            const activeSeats = seats.filter(s => !s.paid);
                                            if (activeSeats.length > 0) {
                                                requestAttribution({ type: 'pina' });
                                            } else {
                                                setIsMutating(true);
                                                try {
                                                    const { addRoundToSession } = useTablesStore.getState();
                                                    await addRoundToSession(session.id);
                                                    showToast('1 Piña agregada a la mesa', 'success');
                                                } catch (e) {
                                                    showToast('Error al agregar Piña', 'error');
                                                } finally {
                                                    setIsMutating(false);
                                                }
                                            }
                                        }}
                                        className="bg-amber-50 dark:bg-amber-950/20 hover:bg-amber-100 dark:hover:bg-amber-900/30 border border-amber-200 dark:border-amber-800/40 text-amber-700 dark:text-amber-350 font-black text-[11px] py-2 rounded-xl transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-0.5"
                                    >
                                        <TargetIcon size={11} /> + Piña
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Botones principales de cierre/comanda */}
                        {isCheckoutPending ? (
                            <div className="flex flex-col gap-2">
                                {(currentUser?.role === 'ADMIN' || currentUser?.role === 'CAJERO') ? (
                                    <div className="flex flex-col gap-2">
                                        <div className="w-full bg-amber-500/10 border border-amber-500/30 text-amber-500 rounded-xl py-2 px-3 flex items-center justify-center gap-1.5 text-xs font-bold animate-pulse">
                                            <Clock size={12} />
                                            ESPERANDO PAGO ($ {grandTotal.toFixed(2)})
                                        </div>
                                        <button
                                            disabled={isMutating}
                                            onClick={() => setShowCashierPaymentModal(true)}
                                            className="w-full bg-emerald-500 hover:bg-emerald-400 text-white font-black text-xs py-3 rounded-xl shadow-md active:scale-95 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                                        >
                                            <CreditCard size={14} />
                                            Procesar Pago y Cierre
                                        </button>
                                        <button
                                            disabled={isMutating}
                                            onClick={async () => {
                                                if (isMutating) return;
                                                setIsMutating(true);
                                                try {
                                                    await cancelCheckoutRequest(session.id);
                                                    showToast('Mesa devuelta a salón', 'success');
                                                } catch (e) {
                                                    showToast('Error al devolver mesa', 'error');
                                                } finally {
                                                    setIsMutating(false);
                                                }
                                            }}
                                            className="w-full text-slate-450 hover:text-rose-500 text-[10.5px] font-bold py-1 transition-colors disabled:opacity-50"
                                        >
                                            Devolver a salón (Retirar cola)
                                        </button>
                                    </div>
                                ) : (
                                    <div className="flex flex-col gap-2">
                                        <div className="w-full bg-amber-500/10 border border-amber-500/30 text-amber-500 rounded-xl py-3 px-3 flex items-center justify-center gap-2 text-xs font-black">
                                            <Clock size={14} className="animate-pulse" />
                                            MESA EN COLA DE CAJA (ESPERANDO)
                                        </div>
                                        <button
                                            disabled={isMutating}
                                            onClick={async () => {
                                                if (isMutating) return;
                                                setIsMutating(true);
                                                try {
                                                    await cancelCheckoutRequest(session.id);
                                                    showToast('Solicitud de cobro cancelada', 'success');
                                                } catch (e) {
                                                    showToast('Error al retirar cola', 'error');
                                                } finally {
                                                    setIsMutating(false);
                                                }
                                            }}
                                            className="w-full text-slate-400 hover:text-rose-500 text-xs font-bold py-1 transition-colors disabled:opacity-50"
                                        >
                                            Retirar de la cola de caja
                                        </button>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="flex flex-col gap-2">
                                <div className={`grid gap-2 ${grandTotal > 0 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                                    <button
                                        disabled={isMutating}
                                        onClick={() => setShowOrderPanel(true)}
                                        className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs py-3 px-3 rounded-xl shadow-md active:scale-95 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                                    >
                                        <ShoppingBag size={14} fill="currentColor" />
                                        Comanda / Consumo
                                    </button>

                                    {grandTotal > 0 && (
                                        <button
                                            disabled={isMutating}
                                            onClick={handleRequestCheckout}
                                            className="bg-orange-500 hover:bg-orange-400 text-white font-bold text-xs py-3 px-3 rounded-xl shadow-md active:scale-95 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                                        >
                                            <CreditCard size={14} />
                                            {isMutating ? 'Procesando...' : 'Cerrar / Cobrar'}
                                        </button>
                                    )}
                                </div>

                                {/* Liberar mesa sin deudas */}
                                {grandTotal === 0 && isPlaying && (
                                    !showReleaseConfirm ? (
                                        <button
                                            disabled={isMutating}
                                            onClick={() => setShowReleaseConfirm(true)}
                                            className="w-full bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-xs py-3 rounded-xl shadow-md active:scale-95 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                                        >
                                            <Check size={14} strokeWidth={2.5} />
                                            Liberar y Limpiar Mesa
                                        </button>
                                    ) : (
                                        <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40 rounded-xl px-3 py-2.5 flex flex-col gap-2">
                                            <p className="text-[11px] text-emerald-800 dark:text-emerald-300 font-extrabold text-center">
                                                ¿Confirmar liberación de la mesa?
                                            </p>
                                            <div className="grid grid-cols-2 gap-2">
                                                <button
                                                    disabled={isMutating}
                                                    onClick={() => setShowReleaseConfirm(false)}
                                                    className="text-xs font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 rounded-lg py-2 transition-all disabled:opacity-50"
                                                >
                                                    Cancelar
                                                </button>
                                                <button
                                                    disabled={isMutating}
                                                    onClick={async () => {
                                                        if (isMutating) return;
                                                        if (grandTotal > 0.01) {
                                                            showToast(`La mesa tiene un saldo pendiente de $${grandTotal.toFixed(2)}. Debe cobrarse primero.`, 'warning');
                                                            setShowReleaseConfirm(false);
                                                            return;
                                                        }
                                                        setIsMutating(true);
                                                        setShowReleaseConfirm(false);
                                                        try {
                                                            await closeSession(session.id, currentUser?.id || 'SYSTEM', 0);
                                                            showToast(`${table.name} liberada con éxito`, 'success');
                                                        } catch (error) {
                                                            console.error(error);
                                                            showToast("Error al liberar mesa", "error");
                                                        } finally {
                                                            setIsMutating(false);
                                                        }
                                                    }}
                                                    className="text-xs font-bold text-white bg-emerald-500 hover:bg-emerald-400 rounded-lg py-2 transition-all disabled:opacity-50 flex items-center justify-center"
                                                >
                                                    {isMutating ? 'Procesando...' : 'Confirmar'}
                                                </button>
                                            </div>
                                        </div>
                                    )
                                )}

                                {/* Admin / Cajero: Anulación rápida de emergencia */}
                                {(currentUser?.role === 'ADMIN' || currentUser?.role === 'CAJERO') && (
                                    <button
                                        disabled={isMutating}
                                        onClick={() => setShowCancelModal(true)}
                                        className="w-full text-rose-500 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/15 text-[10px] font-black py-1.5 rounded-lg border border-transparent hover:border-rose-200 transition-all flex items-center justify-center gap-1 mt-1 disabled:opacity-50"
                                    >
                                        <Trash2 size={11} />
                                        Anular y cancelar sesión
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Inyección de Modales Compartidos de TableCardInlineModals */}
            <TableCardInlineModals
                table={table}
                session={session}
                elapsed={elapsed}
                timeCost={timeCost}
                seatTimeCost={seatTimeCost}
                totalConsumption={totalConsumption}
                consumptionBs={consumptionBs}
                grandTotal={grandTotal}
                costBreakdown={costBreakdown}
                config={config}
                tasaUSD={tasaUSD}
                currentItems={currentItems}
                currentUser={currentUser}
                hasPinas={hasPinas}
                isMixedMode={isMixedMode}
                hasHoursActive={hasHoursActive}
                hasLimit={hasLimit}
                isProcessingCharge={isProcessingCharge || isMutating}
                
                showCancelModal={showCancelModal}
                setShowCancelModal={setShowCancelModal}
                handleCancelTable={handleCancelTable}
                
                showAdjustModal={showAdjustModal}
                setShowAdjustModal={setShowAdjustModal}
                adjustMins={adjustMins}
                setAdjustMins={setAdjustMins}
                submitAdjustTime={submitAdjustTime}
                requestAttribution={requestAttribution}
                
                showPinaConfirm={showPinaConfirm}
                setShowPinaConfirm={setShowPinaConfirm}
                handleStartPina={handleStartPina}
                
                showOpenModal={showOpenModal}
                setShowOpenModal={setShowOpenModal}
                wizardStep={wizardStep}
                setWizardStep={setWizardStep}
                sessionSeats={sessionSeats}
                setSessionSeats={setSessionSeats}
                seatValidationError={seatValidationError}
                setSeatValidationError={setSeatValidationError}
                pendingOpen={pendingOpen}
                modePina={modePina}
                setModePina={setModePina}
                modeHora={modeHora}
                setModeHora={setModeHora}
                selectedHours={selectedHours}
                setSelectedHours={setSelectedHours}
                initialChargeTarget={initialChargeTarget}
                setInitialChargeTarget={setInitialChargeTarget}
                handleWizardFinish={handleWizardFinish}
                
                showEditMetaModal={showEditMetaModal}
                setShowEditMetaModal={setShowEditMetaModal}
                editSeats={editSeats}
                setEditSeats={setEditSeats}
                editClientId={editClientId}
                setEditClientId={setEditClientId}
                editClientName={editClientName}
                setEditClientName={setEditClientName}
                editGuestCount={editGuestCount}
                editNotes={editNotes}
                setEditNotes={setEditNotes}
                allCustomers={allCustomers}
                updateSessionMetadata={updateSessionMetadata}
                updateSessionSeats={updateSessionSeats}
                
                showAttributeModal={showAttributeModal}
                setShowAttributeModal={setShowAttributeModal}
                pendingCharge={pendingCharge}
                setPendingCharge={setPendingCharge}
                handleAttributeCharge={handleAttributeCharge}
                
                showOrderPanel={showOrderPanel}
                setShowOrderPanel={setShowOrderPanel}
                
                showTotalDetails={showTotalDetails}
                setShowTotalDetails={setShowTotalDetails}
                
                showCustomerSheet={showCustomerSheet}
                setShowCustomerSheet={setShowCustomerSheet}
                searchingSeatIndex={searchingSeatIndex}
                setSearchingSeatIndex={setSearchingSeatIndex}
                sessionClientId={sessionClientId}
                setSessionClientId={setSessionClientId}
                showEditCustomerSheet={showEditCustomerSheet}
                setShowEditCustomerSheet={setShowEditCustomerSheet}
                searchingEditSeatIndex={searchingEditSeatIndex}
                setSearchingEditSeatIndex={setSearchingEditSeatIndex}
                editClientIdSetter={setEditClientId}
                handleCreateCustomer={handleCreateCustomer}
            />

            {/* Modal de cobro de caja directo desde panel (Fase 3) */}
            {showCashierPaymentModal && (
                <CashierPaymentModal
                    session={session}
                    table={table}
                    config={config}
                    rates={tasaUSD}
                    currentUser={currentUser}
                    onClose={() => setShowCashierPaymentModal(false)}
                    onSuccess={() => { 
                        setShowCashierPaymentModal(false); 
                        useTablesStore.getState().syncTablesAndSessions(); 
                    }}
                />
            )}
        </div>
    );
}
