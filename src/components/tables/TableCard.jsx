import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Edit2, Printer, X, Users, UserCheck, Lock, MessageSquare, Move, Trash2 } from 'lucide-react';
import { calculateElapsedTime, calculateElapsedTimePrecise, calculateSessionCost, calculateSessionCostBreakdown, calculateConsumptionBs, buildTableSyntheticCart } from '../../utils/tableBillingEngine';
import { getServerNow } from '../../utils/serverClock';
import { FinancialEngine } from '../../core/FinancialEngine';
import { round2 } from '../../utils/dinero';
import { useTablesStore } from '../../hooks/store/useTablesStore';
import { useAuthStore } from '../../hooks/store/authStore';
import { useOrdersStore } from '../../hooks/store/useOrdersStore';
import { useNotifications } from '../../hooks/useNotifications';
import { useCustomersStore } from '../../hooks/store/useCustomersStore';
import { useSharedTick } from '../../hooks/useSharedTick';

import { generatePartialSessionTicketPDF } from '../../utils/ticketGenerator';
import { showToast } from '../Toast';
import { logEvent } from '../../services/auditService';
import { useConfirm } from '../../hooks/useConfirm';
import { useProductContext } from '../../context/ProductContext';

import TableCardTimerDisplay from './TableCardTimerDisplay';
import TableCardActions from './TableCardActions';
import TableCardInlineModals from './TableCardInlineModals';

function useStaffName(staffId) {
    const cachedUsers = useAuthStore(s => s.cachedUsers);

    useEffect(() => {
        if (staffId && (!cachedUsers?.length || !cachedUsers.some(u => u.id === staffId))) {
            useAuthStore.getState().syncUsers().catch(() => {});
        }
    }, [staffId, cachedUsers]);

    if (!staffId || !cachedUsers?.length) return null;
    const user = cachedUsers.find(u => u.id === staffId);
    return user?.name || user?.nombre || null;
}



export default function TableCard({ table, session, onStartTransfer, initialOpenMode, onClose }) {
    const { config, openSession, closeSession, requestCheckout, cancelCheckoutRequest, updateSessionMetadata, updateSessionSeats, updateSessionTime, addPinaToSession, addHoursToSession, pauseSession, resumeSession } = useTablesStore();
    const paidHoursOffsets = useTablesStore(state => state.paidHoursOffsets);
    const paidRoundsOffsets = useTablesStore(state => state.paidRoundsOffsets);
    const paidElapsedOffsets = useTablesStore(state => state.paidElapsedOffsets);
    const pausedData = useTablesStore(state => session ? state.pausedSessions[session.id] : null);
    const { effectiveRate: tasaUSD } = useProductContext();
    const { currentUser } = useAuthStore();
    const staffName = useStaffName(session?.opened_by);
    const confirm = useConfirm();
    const { notifyMesaCobrar } = useNotifications();

    const isAvailable = !session || session.status === 'CLOSED';
    const isPlaying = session && (session.status === 'ACTIVE' || session.status === 'CHECKOUT');
    const isCheckoutPending = session?.status === 'CHECKOUT';

    // Bloqueo de mesa: si un mesero abrió la mesa, otros meseros no pueden interactuar
    const isLockedForMe = (currentUser?.role === 'MESERO' || currentUser?.role === 'BARRA') && isPlaying && session?.opened_by && session.opened_by !== currentUser?.id;

    const tick = useSharedTick();
    const [showOrderPanel, setShowOrderPanel] = useState(false);

    // Variables de control de tiempo (Mover al tope para evitar dependencias circulares)
    const isTimeFree = table.type === 'NORMAL';
    const hoursOffset = session ? (paidHoursOffsets[session.id] || 0) : 0;
    const roundsOffset = session ? (paidRoundsOffsets[session.id] || 0) : 0;
    const elapsedOffset = session ? ((paidElapsedOffsets || {})[session.id] || 0) : 0;

    const seatHasHours = (session?.seats || []).some(s => (s.timeCharges || []).some(tc => tc.type === 'hora'));
    const isLibreSession = table.type === 'POOL' && session?.game_mode === 'NORMAL' && (Number(session?.hours_paid) || 0) === 0 && !seatHasHours;

    const seatHoursTotal = (session?.seats || []).reduce((sum, s) =>
        sum + (s.timeCharges || []).filter(tc => tc.type === 'hora').reduce((acc, tc) => acc + (Number(tc.amount) || 0), 0), 0);
    const totalHoursPaid = (Number(session?.hours_paid) || 0) + seatHoursTotal;

    const seatHasPinas = (session?.seats || []).some(s => (s.timeCharges || []).some(tc => tc.type === 'pina'));
    const hasPinas = session?.game_mode === 'PINA' || (Number(session?.extended_times) || 0) > 0 || seatHasPinas;

    const wasOpenedWithHours = isPlaying && !isTimeFree && session?.game_mode === 'NORMAL' && !hasPinas && totalHoursPaid === 0 && !isLibreSession;
    const hasLimit = (totalHoursPaid > 0 || wasOpenedWithHours) && !isLibreSession;

    const [showCancelModal, setShowCancelModal] = useState(false);
    const [showAbonoModal, setShowAbonoModal] = useState(false);
    const [showCashierPaymentModal, setShowCashierPaymentModal] = useState(false);
    const [showAdjustModal, setShowAdjustModal] = useState(false);
    const [showModeModal, setShowModeModal] = useState(false);
    const [showTotalDetails, setShowTotalDetails] = useState(false);
    const [showPinaConfirm, setShowPinaConfirm] = useState(false);
    const [adjustMins, setAdjustMins] = useState('');

    // Modo mixto: toggles para modal unificado de apertura
    const [modePina, setModePina] = useState(false);
    const [modeHora, setModeHora] = useState(false);
    const [selectedHours, setSelectedHours] = useState(1);
    // Modal para agregar hora a sesión activa (piña → mixto)
    const [showAddHoursModal, setShowAddHoursModal] = useState(false);

    // Modal de nombre + personas al abrir mesa — wizard steps
    const [showOpenModal, setShowOpenModal] = useState(false);
    const [pendingOpen, setPendingOpen] = useState(null);
    const [wizardStep, setWizardStep] = useState(1); // 1=clients, 2=mode, 3=attribution, 4=confirm
    const [initialChargeTarget, setInitialChargeTarget] = useState(null); // seatId or null (shared)
    const [showReleaseConfirm, setShowReleaseConfirm] = useState(false);
    const [sessionClientName, setSessionClientName] = useState('');
    const [sessionGuestCount, setSessionGuestCount] = useState('');
    const [sessionClientId, setSessionClientId] = useState(null);
    const [sessionSeats, setSessionSeats] = useState([]);
    const [showCustomerSheet, setShowCustomerSheet] = useState(false);
    const [searchingSeatIndex, setSearchingSeatIndex] = useState(null); // qué seat está buscando cliente
    const { customers: allCustomers, fetchCustomers, createCustomer, refresh: refreshCustomers } = useCustomersStore();

    // Validación de nombres al abrir mesa
    const [seatValidationError, setSeatValidationError] = useState(false);

    // Modal de atribución de tiempo (+Hora / +Piña) a cliente específico o compartido
    const [showAttributeModal, setShowAttributeModal] = useState(false);
    const [pendingCharge, setPendingCharge] = useState(null); // { type: 'hora'|'pina', hoursValue? }
    const [isProcessingCharge, setIsProcessingCharge] = useState(false);

    // Modal de edición de nombre + personas en sesión activa
    const [showEditMetaModal, setShowEditMetaModal] = useState(false);
    const [editClientName, setEditClientName] = useState('');
    const [editGuestCount, setEditGuestCount] = useState('');
    const [editClientId, setEditClientId] = useState(null);
    const [editNotes, setEditNotes] = useState('');
    const [editSeats, setEditSeats] = useState([]);
    const [showEditCustomerSheet, setShowEditCustomerSheet] = useState(false);
    const [searchingEditSeatIndex, setSearchingEditSeatIndex] = useState(null);

    // Fetch customers from Supabase once on mount
    useEffect(() => { fetchCustomers(); }, []);

    // Always call hooks unconditionally — React rules of hooks
    const allOrders = useOrdersStore(state => state.orders);
    const allItems = useOrdersStore(state => state.orderItems);
    const cancelOrderBySessionId = useOrdersStore(state => state.cancelOrderBySessionId);
    const { products, adjustStock } = useProductContext();
    
    const order = session ? allOrders.find(o => o.table_session_id === session.id) : null;
    const currentItems = order ? allItems.filter(i => i.order_id === order.id) : [];
    const totalConsumption = currentItems.reduce((acc, item) => acc + (Number(item.unit_price_usd) * Number(item.qty)), 0);
    const consumptionBs = calculateConsumptionBs(currentItems, tasaUSD, products);
    
    const handleCancelTable = async () => {
        setShowCancelModal(false);
        onClose?.(); // Reset selectedTableId in TablesView to prevent reopening wizard modal on the free table
        try {
            // Devolver stock de cada producto al inventario antes de cancelar
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
            alert("Ocurrió un error local al preparar la anulación.");
        }
    };

    // Live Timer Update
    const isPaused = pausedData?.isPaused ?? false;
    const pauseElapsed = pausedData?.elapsedAtPause ?? 0;

    // elapsed en minutos limitado al tope si tiene limite (para billing)
    const elapsed = useMemo(() => {
        if (!isPlaying || !session?.started_at) return 0;
        if (isPaused) return pauseElapsed;
        const rawElapsed = calculateElapsedTime(session.started_at);
        if (hasLimit) {
            const limitMins = totalHoursPaid * 60;
            return Math.min(rawElapsed, limitMins);
        }
        return rawElapsed;
    }, [isPlaying, session?.started_at, isPaused, pauseElapsed, hasLimit, totalHoursPaid, tick]);

    // elapsed en segundos limitado al tope si tiene limite (para displays en tiempo real)
    const elapsedSeconds = useMemo(() => {
        if (!isPlaying || !session?.started_at) return 0;
        // Al pausar, elapsedAtPause son minutos con decimales (precisión exacta del
        // punto de pausa). Se redondea a segundos enteros con floor para que coincida
        // con el timer en marcha (que también usa Math.floor) y no muestre decimales.
        if (isPaused) return Math.floor((pausedData?.elapsedAtPause || 0) * 60);
        const start = new Date(session.started_at).getTime();
        const now = getServerNow();
        const rawSecs = Math.max(0, Math.floor((now - start) / 1000));
        if (hasLimit) {
            const limitSecs = totalHoursPaid * 3600;
            return Math.min(rawSecs, limitSecs);
        }
        return rawSecs;
    }, [isPlaying, session?.started_at, isPaused, pausedData, hasLimit, totalHoursPaid, tick]);

    // segundos restantes exactos
    const remainingSeconds = useMemo(() => {
        if (!hasLimit) return 0;
        const limitSecs = totalHoursPaid * 3600;
        const offsetSecs = hoursOffset * 3600;
        const effectiveLimitSecs = Math.max(0, limitSecs - offsetSecs);
        
        const elapsedOffsetSecs = elapsedOffset * 60;
        const effectiveElapsedSecs = elapsedOffsetSecs > 0 ? Math.max(0, elapsedSeconds - elapsedOffsetSecs) : elapsedSeconds;
        
        return Math.max(0, effectiveLimitSecs - effectiveElapsedSecs);
    }, [hasLimit, totalHoursPaid, hoursOffset, elapsedOffset, elapsedSeconds]);

    const handlePauseTimer = () => {
        if (!session) return;
        const currentElapsed = calculateElapsedTimePrecise(session.started_at);
        pauseSession(session.id, currentElapsed);
    };

    const handleResumeTimer = async () => {
        if (!session) return;
        await resumeSession(session.id);
    };

    const handleStartNormal = async (hours = 0, clientName = '', guestCount = 0, clientId = null, includePina = false, seats = []) => {
        if (!currentUser) return;
        const parts = [];
        if (includePina) parts.push('Jugada');
        if (hours === 0) parts.push('Libre');
        else if (hours === 0.5) parts.push('Prepago 30 min');
        else parts.push(`Prepago ${hours} hr${hours !== 1 ? 's' : ''}`);
        const modeLabel = parts.join(' + ');
        const ok = await confirm({ title: `Abrir ${table.name}`, message: `¿Confirmar apertura en modo ${modeLabel}?`, confirmText: 'Abrir Mesa', cancelText: 'Cancelar', variant: 'warning' });
        if (!ok) return;
        await openSession(table.id, currentUser.id, 'NORMAL', hours, clientName, guestCount, clientId, includePina, seats);
        setShowModeModal(false);
    };

    const handleStartPina = async (clientName = '', guestCount = 0, clientId = null, seats = []) => {
        if (!currentUser) return;
        const ok = await confirm({ title: `Abrir ${table.name}`, message: '¿Confirmar apertura en modo La Jugada?', confirmText: 'Abrir Mesa', cancelText: 'Cancelar', variant: 'warning' });
        if (!ok) return;
        await openSession(table.id, currentUser.id, 'PINA', 0, clientName, guestCount, clientId, false, seats);
    };

    const handleStartConsumption = async (clientName = '', guestCount = 0, clientId = null, seats = []) => {
        if (!currentUser) return;
        const ok = await confirm({ title: `Ocupar ${table.name}`, message: '¿Confirmar apertura de mesa?', confirmText: 'Ocupar Mesa', cancelText: 'Cancelar', variant: 'warning' });
        if (!ok) return;
        await openSession(table.id, currentUser.id, 'NORMAL', 0, clientName, guestCount, clientId, false, seats);
    };

    // Abre el modal de nombre/personas y guarda la acción pendiente
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

    // Auto-apertura rápida en plano de producción con delay para evitar colisiones de render/animación
    useEffect(() => {
        if (isAvailable && initialOpenMode) {
            const timer = setTimeout(() => {
                handleRequestOpen(initialOpenMode);
            }, 80);
            return () => clearTimeout(timer);
        }
    }, [isAvailable, initialOpenMode]);

    const handleCreateCustomer = async (name, phone, documentId) => {
        const newCustomer = await createCustomer(name, phone, documentId);
        return newCustomer;
    };

    // Selección de cliente en la búsqueda para un seat del modal de apertura
    const handleSelectCustomerForSeat = (customer) => {
        if (searchingSeatIndex !== null) {
            const updated = sessionSeats.map((s, i) =>
                i === searchingSeatIndex
                    ? { ...s, customerId: customer.id, label: s.label || customer.name }
                    : s
            );
            setSessionSeats(updated);
            setSearchingSeatIndex(null);
        } else {
            setSessionClientId(customer.id);
            setSessionClientName(customer.name);
        }
        setShowCustomerSheet(false);
    };

    // Helper: if only 1 active seat, charge directly to them; if 2+, show attribution modal
    const requestAttribution = (charge) => {
        const seats = session?.seats || [];
        const activeSeats = seats.filter(s => !s.paid);
        if (activeSeats.length === 1) {
            // Single client — charge directly, no modal needed
            setPendingCharge(charge);
            // Use setTimeout to let pendingCharge state settle before calling handler
            setTimeout(() => handleAttributeCharge(activeSeats[0].id, charge), 0);
        } else if (activeSeats.length > 1) {
            setPendingCharge(charge);
            setShowAttributeModal(true);
        }
    };

    // Atribuir +Hora a cliente específico o compartido
    const handleAttributeCharge = async (seatId, chargeOverride) => {
        const charge = chargeOverride || pendingCharge;
        if (!charge || isProcessingCharge) return;
        setIsProcessingCharge(true);
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
        }
    };

    // Wizard final step: open the session and apply initial charge attribution
    const handleWizardFinish = async () => {
        if (!pendingOpen) return;
        const firstSeat = sessionSeats.length > 0 ? sessionSeats[0] : null;
        const firstSeatClientId = firstSeat?.customerId || sessionClientId;
        const name = firstSeat
            ? (firstSeat.label || allCustomers.find(c => c.id === firstSeat.customerId)?.name || '')
            : (sessionClientId ? (allCustomers.find(c => c.id === sessionClientId)?.name || sessionClientName.trim()) : sessionClientName.trim());
        const guests = sessionSeats.length > 0 ? sessionSeats.length : (parseInt(sessionGuestCount) || 0);
        const seats = sessionSeats.length > 0 ? sessionSeats : [];
        const isMultiSeat = seats.length > 1;
        const { mode } = pendingOpen;

        // For pool tables (SHOW_MODE) use the selected mode
        if (mode === 'SHOW_MODE') {
            if (!modePina && !modeHora) return;
            if (modePina && !modeHora) {
                await openSession(table.id, currentUser.id, 'PINA', 0, name, guests, firstSeatClientId, false, seats);
                // Apply initial piña attribution
                if (isMultiSeat && initialChargeTarget !== undefined) {
                    // Wait briefly for session to be created
                    setTimeout(async () => {
                        try {
                            const { addRoundToSession } = useTablesStore.getState();
                            const newSession = useTablesStore.getState().activeSessions.find(s => s.table_id === table.id);
                            if (newSession) await addRoundToSession(newSession.id, initialChargeTarget);
                        } catch (e) { console.error(e); }
                    }, 500);
                }
            } else if (!modePina && modeHora) {
                // Always open with selected hours as shared
                await openSession(table.id, currentUser.id, 'NORMAL', selectedHours, name, guests, firstSeatClientId, false, seats);
            } else {
                // Mixed mode
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
    };

    const handleConfirmOpen = async () => {
        if (!pendingOpen) return;
        setShowOpenModal(false);
        // Tomar nombre del primer seat si hay clientes, si no del campo de cliente clásico
        const firstSeat = sessionSeats.length > 0 ? sessionSeats[0] : null;
        const firstSeatCustomerId = firstSeat?.customerId || null;
        const firstSeatClientId = firstSeatCustomerId || sessionClientId;
        const name = firstSeat
            ? (firstSeat.label || allCustomers.find(c => c.id === firstSeat.customerId)?.name || '')
            : (sessionClientId ? (allCustomers.find(c => c.id === sessionClientId)?.name || sessionClientName.trim()) : sessionClientName.trim());
        const guests = sessionSeats.length > 0 ? sessionSeats.length : (parseInt(sessionGuestCount) || 0);
        const seats = sessionSeats.length > 0 ? sessionSeats : [];
        const { mode, hours } = pendingOpen;
        if (mode === 'PINA') {
            await handleStartPina(name, guests, firstSeatClientId, seats);
            if (seats.length > 1) {
                requestAttribution({ type: 'pina' });
            }
        }
        else if (mode === 'CONSUMPTION') await handleStartConsumption(name, guests, firstSeatClientId, seats);
        else if (mode === 'SHOW_MODE') {
            // Para mesas de pool: mostrar modal unificado de modo
            setShowModeModal(true);
        }
        else await handleStartNormal(hours, name, guests, firstSeatClientId, false, seats);
        if (mode !== 'SHOW_MODE') setPendingOpen(null);
    };

    // Confirmar apertura desde el modal unificado de modo
    const handleConfirmMode = async () => {
        if (!modePina && !modeHora) return;
        setShowModeModal(false);
        // Derivar nombre del primer asiento si hay multi-cliente (igual que handleConfirmOpen)
        const firstSeat = sessionSeats.length > 0 ? sessionSeats[0] : null;
        const firstSeatClientId = firstSeat?.customerId || sessionClientId;
        const name = firstSeat
            ? (firstSeat.label || allCustomers.find(c => c.id === firstSeat.customerId)?.name || '')
            : (sessionClientId ? (allCustomers.find(c => c.id === sessionClientId)?.name || sessionClientName.trim()) : sessionClientName.trim());
        const guests = sessionSeats.length > 0 ? sessionSeats.length : (parseInt(sessionGuestCount) || 0);
        const seats = sessionSeats.length > 0 ? sessionSeats : [];

        const isMultiSeat = seats.length > 1;
        const hasSeatClients = seats.length > 0;

        if (modePina && !modeHora) {
            // Session opens with extended_times=-1 (neutralized for multi-seat),
            // then attribute first piña to a client
            await handleStartPina(name, guests, firstSeatClientId, seats);
            if (hasSeatClients) {
                if (isMultiSeat) {
                    setPendingCharge({ type: 'pina' });
                    setShowAttributeModal(true);
                } else {
                    // Single client — attribute directly (no modal)
                    // Need to wait for session to be created, then charge to single seat
                    // For single seat PINA, extended_times stays 0 (no -1 compensation needed)
                }
            }
        } else if (!modePina && modeHora) {
            // Always open with the selected hours (shared), even for multi-seat
            await handleStartNormal(selectedHours, name, guests, firstSeatClientId, false, seats);
        } else {
            // Mixed mode (piña + hora): keep shared for simplicity
            await handleStartNormal(selectedHours, name, guests, firstSeatClientId, true, seats);
        }
        setPendingOpen(null);
    };

    const handleAdjustTime = () => {
        setShowAdjustModal(true);
    };

    const submitAdjustTime = async () => {
        const m = parseInt(adjustMins);
        if (!isNaN(m) && m !== 0) {
            const d = new Date(session.started_at);
            d.setMinutes(d.getMinutes() + m); 
            await useTablesStore.getState().updateSessionTime(session.id, d.toISOString());
        }
        setShowAdjustModal(false);
        setAdjustMins('');
    };



    const handlePrintPartial = async () => {
        if (!session) return;
        try {
            await generatePartialSessionTicketPDF({
                table, session, elapsed, timeCost, totalConsumption, currentItems, grandTotal, tasaUSD, config,
                hoursOffset, roundsOffset, products
            });
            showToast('Pre-cuenta enviada a la impresora', 'success');
        } catch (err) {
            showToast(err.message || 'Error al imprimir pre-cuenta', 'error');
        }
    };

    // variables de offset de tiempo ya estan declaradas al inicio
    const timeCost = isPlaying && !isTimeFree ? calculateSessionCost(elapsed, session.game_mode, config, session?.hours_paid, session?.extended_times, session?.paid_at, hoursOffset, roundsOffset, session?.seats, table.type) : 0;
    const costBreakdown = isPlaying && !isTimeFree ? calculateSessionCostBreakdown(elapsed, session.game_mode, config, session?.hours_paid, session?.extended_times, hoursOffset, roundsOffset, session?.seats, table.type) : null;
    const isMixedMode = costBreakdown ? (costBreakdown.hasPinas && costBreakdown.hasHours) : false;
    const hasHoursActive = (costBreakdown ? costBreakdown.hasHours : (session?.hours_paid > 0)) || seatHasHours;
    const taxRate = config?.tableTaxType === 'iva_19'
        ? (config?.taxRateIva ?? 19) / 100
        : config?.tableTaxType === 'impoconsumo_8'
            ? (config?.taxRateImpoconsumo ?? 8) / 100
            : 0;
    const isExclusive = config?.tableTaxMode === 'exclusive' && taxRate > 0;
    const finalPina = isExclusive ? (config?.pricePina || 0) * (1 + taxRate) : (config?.pricePina || 0);
    const finalHora = isExclusive ? (config?.pricePerHour || 0) * (1 + taxRate) : (config?.pricePerHour || 0);

    // Sumar costo de seat-level timeCharges (horas + piñas asignadas a clientes)
    const seatTimeCost = isPlaying && !isTimeFree ? (session?.seats || []).filter(s => !s.paid).reduce((sum, s) => {
        const tc = (s.timeCharges || []);
        const h = tc.filter(t => t.type === 'hora').reduce((a, t) => a + (Number(t.amount) || 0), 0);
        const p = tc.filter(t => t.type === 'pina').reduce((a, t) => a + (Number(t.amount) || 0), 0);
        return sum + (h * finalHora) + (p * finalPina);
    }, 0) : 0;
    const grandTotal = useMemo(() => {
        const baseTotal = round2(timeCost + seatTimeCost + totalConsumption);
        if (baseTotal <= 0 || !session) return 0;
        let totalBuilt = baseTotal;
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
                totalBuilt = totals.totalUsd || 0;
            }
        } catch (e) {
            console.error("Error calculating tax-inclusive table card grand total:", e);
        }

        const isTipEnabled = (() => {
            const match = (session?.notes || '').match(/\|\|\|TIP_ENABLED:([01])\|\|\|/);
            if (match) return match[1] === '1';
            return config?.defaultTipEnabled ?? false;
        })();

        if (isTipEnabled) {
            const tipPercent = config?.defaultTipPercent ?? 8;
            const tipAmt = Math.round(totalBuilt * (tipPercent / 100));
            totalBuilt = round2(totalBuilt + tipAmt);
        }

        return totalBuilt;
    }, [timeCost, seatTimeCost, totalConsumption, table, session, elapsed, currentItems, config, hoursOffset, roundsOffset, products]);
    // Mesa pagada sin cerrar y sin cargos nuevos agregados (ni tiempo ni consumo)
    const isPaidIdle = isPlaying && !!session?.paid_at && grandTotal === 0;
    // Calculado a partir de segundos
    const remainingMins = hasLimit ? Math.max(0, Math.floor(remainingSeconds / 60)) : 0;
    const isExceeded = hasLimit && remainingSeconds <= 0;

    // Notifications for tiempo agotado and mesa pagada ociosa are handled
    // globally by useGlobalTableAlerts (App.jsx) to avoid duplicates and
    // ensure ALL devices receive them via Supabase broadcast.

    return (
        <>
        <div className={`relative flex flex-col rounded-3xl p-4 sm:p-5 shadow-sm border-2 overflow-hidden transition-all duration-300 ${
            isAvailable
                ? 'bg-white border-slate-200'
                : isLockedForMe
                    ? table.type === 'NORMAL'
                        ? 'bg-gradient-to-br from-violet-600/70 to-fuchsia-500/70 border-white/20 shadow-lg text-white opacity-75'
                        : 'bg-gradient-to-br from-indigo-600/70 to-sky-500/70 border-white/20 shadow-lg text-white opacity-75'
                    : table.type === 'NORMAL'
                        ? 'bg-gradient-to-br from-violet-600 to-fuchsia-500 border-transparent shadow-lg text-white scale-[1.02]'
                        : 'bg-gradient-to-br from-indigo-600 to-sky-500 border-transparent shadow-lg text-white scale-[1.02]'
        }`}>
            {/* Header: Title / Flow Actions */}
            <div className="flex flex-wrap items-start justify-between mb-2 gap-2 border-b border-white/5 pb-2">
                <div className="flex flex-col gap-0.5 min-w-0">
                    <div className="flex items-center gap-1.5">
                        <h3 className={`text-base sm:text-lg font-black tracking-tight leading-tight whitespace-nowrap shrink-0 ${isAvailable ? 'text-slate-800' : 'text-white'}`}>
                            {table.name}
                        </h3>
                        {isPlaying && !isLockedForMe && (
                            <>
                                <button
                                    onClick={handlePrintPartial}
                                    className="w-6 h-6 rounded-full flex items-center justify-center bg-white/20 hover:bg-white/40 text-white transition-all active:scale-95 shrink-0"
                                    title="Imprimir Pre-Cuenta"
                                >
                                    <Printer size={12} />
                                </button>
                                {onStartTransfer && (
                                    <button
                                        onClick={onStartTransfer}
                                        className="w-6 h-6 rounded-full flex items-center justify-center bg-white/20 hover:bg-white/40 text-white transition-all active:scale-95 shrink-0"
                                        title="Mover / Transferir Mesa"
                                    >
                                        <Move size={12} />
                                    </button>
                                )}
                                {(currentUser?.role === 'ADMIN' || currentUser?.role === 'CAJERO') && (
                                    <button
                                        onClick={() => setShowCancelModal(true)}
                                        className="w-6 h-6 rounded-full flex items-center justify-center bg-rose-500/80 hover:bg-rose-500 text-white transition-all active:scale-95 shrink-0 shadow-sm"
                                        title="Anular Mesa"
                                    >
                                        <Trash2 size={13} />
                                    </button>
                                )}
                            </>
                        )}
                        {isLockedForMe && (
                            <div className="w-6 h-6 rounded-full flex items-center justify-center bg-white/20 text-white/60 shrink-0" title="Mesa asignada a otro mesero">
                                <Lock size={12} />
                            </div>
                        )}
                    </div>
                    {isPlaying && staffName && (
                        <span className="text-[10px] font-bold opacity-70 bg-white/15 px-1.5 py-0.5 rounded-md self-start whitespace-nowrap">
                            {staffName}
                        </span>
                    )}
                    {isPlaying && (session?.client_name || session?.guest_count > 0) && (
                        isLockedForMe ? (
                            <div className={`flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md self-start ${session.client_id ? 'bg-sky-400/30 opacity-100' : 'opacity-80 bg-white/15'}`}>
                                {session.client_id ? <UserCheck size={9} className="shrink-0" /> : null}
                                {session.client_name && <span className="whitespace-nowrap">{session.client_name}</span>}
                                {session.guest_count > 0 && <span className="flex items-center gap-0.5"><Users size={9} />{session.guest_count}</span>}
                            </div>
                        ) : (
                        <button
                            onClick={() => { setEditClientName(session.client_name || ''); setEditGuestCount(session.guest_count > 0 ? String(session.guest_count) : ''); setEditClientId(session.client_id || null); setEditNotes((session.notes || '').split('|||')[0].trim()); setEditSeats(session.seats || []); setShowEditMetaModal(true); }}
                            className={`flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md self-start transition-colors ${session.client_id ? 'bg-sky-400/30 hover:bg-sky-400/50 opacity-100' : 'opacity-80 bg-white/15 hover:bg-white/30'}`}
                            title="Editar nombre y personas"
                        >
                            {session.client_id ? <UserCheck size={9} className="shrink-0" /> : null}
                            {session.client_name && <span className="whitespace-nowrap">{session.client_name}</span>}
                            {session.guest_count > 0 && <span className="flex items-center gap-0.5"><Users size={9} />{session.guest_count}</span>}
                            <Edit2 size={8} className="opacity-60" />
                        </button>
                        )
                    )}
                    {isPlaying && !session?.client_name && !(session?.guest_count > 0) && !isLockedForMe && (
                        <button
                            onClick={() => { setEditClientName(''); setEditGuestCount(''); setEditClientId(null); setEditNotes((session?.notes || '').split('|||')[0].trim()); setEditSeats(session?.seats || []); setShowEditMetaModal(true); }}
                            className="text-[10px] font-bold opacity-50 hover:opacity-80 bg-white/10 hover:bg-white/20 px-1.5 py-0.5 rounded-md self-start transition-colors flex items-center gap-1"
                            title="Añadir nombre y personas"
                        >
                            <Edit2 size={8} /> Añadir info
                        </button>
                    )}
                    {(() => {
                        const cleanNote = (session?.notes || '').split('|||')[0].trim();
                        if (!cleanNote) return null;
                        return (
                            <div className="flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-md self-start bg-amber-400/20 text-amber-100 max-w-full">
                                <MessageSquare size={9} className="shrink-0" />
                                <span className="truncate">{cleanNote}</span>
                            </div>
                        );
                    })()}
                </div>
                <div className={`px-2 py-1 rounded-md text-[9px] font-black tracking-widest uppercase shrink-0 ${
                    isAvailable ? 'bg-emerald-100 text-emerald-700' : isPaidIdle ? 'bg-emerald-400 text-white' : (hasLimit && isExceeded) ? 'bg-rose-500 text-white border border-rose-400' : hasLimit ? 'bg-amber-400 text-slate-900 border border-amber-300' : 'bg-white/20 text-white backdrop-blur-md'
                }`}>
                    {isAvailable ? 'LIBRE' : isPaidIdle ? 'PAGADO' : isLibreSession ? 'MODO LIBRE' : isMixedMode ? 'JUGADA + HORA' : session.game_mode === 'PINA' ? 'LA JUGADA' : session.game_mode === 'CONSUMO' ? 'BAR' : isTimeFree ? 'BAR' : (wasOpenedWithHours && isExceeded) ? 'SIN TIEMPO' : hasLimit ? (totalHoursPaid === 0.5 ? 'PREPAGO 30MIN' : `PREPAGO ${totalHoursPaid}h`) : hasPinas ? 'LA JUGADA' : 'JUG.'}
                </div>
            </div>

            {/* Timer & Cost display */}
            {(() => {
                const retiredPaidShared = (() => {
                    if (!session?.notes || !session.notes.includes('|||RETIRED_PAID_SHARED:')) return 0;
                    const parts = session.notes.split('|||RETIRED_PAID_SHARED:')[1];
                    if (!parts) return 0;
                    const val = parseFloat(parts.split('|||')[0].trim());
                    return isNaN(val) ? 0 : val;
                })();
                return (
                    <TableCardTimerDisplay
                        table={table}
                        session={session}
                        elapsed={elapsed}
                        isAvailable={isAvailable}
                        isTimeFree={isTimeFree}
                        isPaidIdle={isPaidIdle}
                        isMixedMode={isMixedMode}
                        isLibreSession={isLibreSession}
                        hasPinas={hasPinas}
                        hasHoursActive={hasHoursActive}
                        hasLimit={hasLimit}
                        remainingMins={remainingMins}
                        elapsedSeconds={elapsedSeconds}
                        remainingSeconds={remainingSeconds}
                        isExceeded={isExceeded}
                        isPaused={isPaused}
                        isLockedForMe={isLockedForMe}
                        timeCost={timeCost}
                        grandTotal={grandTotal}
                        totalConsumption={totalConsumption}
                        consumptionBs={consumptionBs}
                        costBreakdown={costBreakdown}
                        config={config}
                        tasaUSD={tasaUSD}
                        roundsOffset={roundsOffset}
                        hoursOffset={hoursOffset}
                        retiredPaidShared={retiredPaidShared}
                        onAdjustTime={handleAdjustTime}
                        onPauseTimer={handlePauseTimer}
                        onResumeTimer={handleResumeTimer}
                        onShowTotalDetails={() => setShowTotalDetails(true)}
                    />
                );
            })()}



            {/* Action Buttons */}
            <TableCardActions
                table={table}
                session={session}
                grandTotal={grandTotal}
                isAvailable={isAvailable}
                isLockedForMe={isLockedForMe}
                isPlaying={isPlaying}
                isCheckoutPending={isCheckoutPending}
                isTimeFree={isTimeFree}
                hasPinas={hasPinas}
                isMixedMode={isMixedMode}
                hasHoursActive={hasHoursActive}
                costBreakdown={costBreakdown}
                isProcessingCharge={isProcessingCharge}
                isPaid={!!session?.paid_at}
                showReleaseConfirm={showReleaseConfirm}
                setShowReleaseConfirm={setShowReleaseConfirm}
                staffName={staffName}
                currentUser={currentUser}
                onRequestOpen={handleRequestOpen}
                onShowOrderPanel={() => setShowOrderPanel(true)}
                onShowAbonoModal={() => setShowAbonoModal(true)}
                onRequestCheckout={requestCheckout}
                onNotifyMesaCobrar={notifyMesaCobrar}
                onAddHoursModal={() => setShowAdjustModal(true)}
                onCancelCheckout={cancelCheckoutRequest}
                onCloseSession={closeSession}
                requestAttribution={requestAttribution}
                addPinaToSession={addPinaToSession}
            />

        </div>

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
            isProcessingCharge={isProcessingCharge}
            // Abono modal
            showAbonoModal={showAbonoModal}
            setShowAbonoModal={setShowAbonoModal}
            showCashierPaymentModal={showCashierPaymentModal}
            setShowCashierPaymentModal={setShowCashierPaymentModal}
            // Cancel modal
            showCancelModal={showCancelModal}
            setShowCancelModal={setShowCancelModal}
            handleCancelTable={handleCancelTable}
            // Adjust modal
            showAdjustModal={showAdjustModal}
            setShowAdjustModal={setShowAdjustModal}
            adjustMins={adjustMins}
            setAdjustMins={setAdjustMins}
            submitAdjustTime={submitAdjustTime}
            requestAttribution={requestAttribution}
            // Piña confirm modal
            showPinaConfirm={showPinaConfirm}
            setShowPinaConfirm={setShowPinaConfirm}
            handleStartPina={handleStartPina}
            // Open wizard
            showOpenModal={showOpenModal}
            setShowOpenModal={(val) => {
                setShowOpenModal(val);
                if (val === false && isAvailable && onClose) {
                    onClose();
                }
            }}
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
            // Edit session
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
            // Attribution
            showAttributeModal={showAttributeModal}
            setShowAttributeModal={setShowAttributeModal}
            pendingCharge={pendingCharge}
            setPendingCharge={setPendingCharge}
            handleAttributeCharge={handleAttributeCharge}
            // Order panel
            showOrderPanel={showOrderPanel}
            setShowOrderPanel={setShowOrderPanel}
            // Total details
            showTotalDetails={showTotalDetails}
            setShowTotalDetails={setShowTotalDetails}
            // Customer sheets
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

        </>
    );
}
