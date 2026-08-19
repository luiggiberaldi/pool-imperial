import { supabaseCloud } from '../../config/supabaseCloud';
import { logEvent } from '../../services/auditService';
import { useAuthStore } from './authStore';
import { useOrdersStore } from './useOrdersStore';
import { calculateElapsedTime, calculateElapsedTimePrecise, calculateFullTableBreakdown, buildFrozenTimeCharge, getSessionElapsedMinutes } from '../../utils/tableBillingEngine';
import { getServerNow } from '../../utils/serverClock';
import {
    TRANSFER_TYPES,
    validateTableTransfer,
    buildTableTransferSessionPatch,
    buildConsumptionMergePayload,
    remapOrderItemSeatId,
    hasTransferOperation,
    createTransferOperationId,
} from '../../utils/tableTransferEngine';

const getUser = () => useAuthStore.getState().currentUser;
const transferInFlight = new Set();

const getAuthUserId = async () => {
    try {
        const { data: { session } } = await supabaseCloud.auth.getSession();
        return session?.user?.id || null;
    } catch { return null; }
};

const buildTipNotes = (notes, tipEnabled) => {
    const cleanNotes = (notes || '').replace(/\|\|\|TIP_ENABLED:[01]\|\|\|/g, '').trim();
    return `${cleanNotes}${cleanNotes ? ' ' : ''}|||TIP_ENABLED:${tipEnabled ? '1' : '0'}|||`;
};

const resolveTransferSourceSession = async (get, sessionId) => {
    let session = get().activeSessions.find(s => s.id === sessionId);
    if (!session) throw new Error('Sesión origen no encontrada');
    if (!String(session.id).startsWith('temp-')) return session;

    const tableId = session.table_id;
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 200));
        session = get().activeSessions.find(s =>
            s.table_id === tableId
            && !String(s.id).startsWith('temp-')
            && (s.status === 'ACTIVE' || s.status === 'CHECKOUT')
        );
        if (session) return session;
    }
    throw new Error('La sesión aún se está sincronizando; intenta transferirla de nuevo');
};

const isAtomicTransferRpcUnavailable = (error) => {
    const text = String(error?.message || error?.details || error?.hint || '').toLowerCase();
    const code = String(error?.code || '').toUpperCase();
    return code === 'PGRST202'
        || text.includes('could not find the function')
        || text.includes('transfer_pool_to_normal_atomic')
        || text.includes('transfer_table_atomic')
        || text.includes('transfer_metadata') && text.includes('column')
        || text.includes('table_transfer_operations') && (text.includes('relation') || text.includes('does not exist'))
        || text.includes('table_transfer_item_links') && (text.includes('relation') || text.includes('does not exist'))
        || text.includes('table_transfer_charges') && (text.includes('relation') || text.includes('does not exist'))
        || text.includes('paused_at') && text.includes('column');
};

const stripUnsupportedTransferColumns = (patch, error) => {
    const text = String(error?.message || error?.details || '').toLowerCase();
    const legacyPatch = { ...patch };
    let changed = false;

    if (text.includes('transfer_metadata')) {
        delete legacyPatch.transfer_metadata;
        changed = true;
    }
    if (text.includes('paused_at') && text.includes('column')) {
        delete legacyPatch.paused_at;
        changed = true;
    }
    return changed ? legacyPatch : null;
};

const tryAtomicPoolToNormalTransfer = async ({
    operationId,
    sourceSessionId,
    targetTableId,
    operatorId,
    frozenTimeUsd,
    transferMetadata,
}) => {
    const { data, error } = await supabaseCloud.rpc('transfer_pool_to_normal_atomic', {
        p_operation_id: operationId,
        p_source_session_id: sourceSessionId,
        p_target_table_id: targetTableId,
        p_operator_id: operatorId || null,
        p_frozen_time_usd: Number(frozenTimeUsd) || 0,
        p_transfer_metadata: transferMetadata || {},
    });

    if (error) {
        if (isAtomicTransferRpcUnavailable(error)) return null;
        throw new Error(`No se pudo completar el traslado atómico: ${error.message || 'error de Supabase'}`);
    }
    if (!data?.session) {
        throw new Error('La transferencia atómica no devolvió la sesión final');
    }
    return data;
};

const tryAtomicTableTransfer = async ({
    operationId,
    sourceSessionId,
    targetTableId,
    transferType,
    plan,
}) => {
    const { data, error } = await supabaseCloud.rpc('transfer_table_atomic', {
        p_operation_id: operationId,
        p_source_session_id: sourceSessionId,
        p_target_table_id: targetTableId,
        p_transfer_type: transferType,
        p_plan: plan || {},
    });

    if (error) {
        if (isAtomicTransferRpcUnavailable(error)) return null;
        throw new Error(`No se pudo completar la transferencia atómica: ${error.message || 'error de Supabase'}`);
    }
    if (!data?.session) {
        throw new Error('La transferencia atómica no devolvió la sesión final');
    }
    return data;
};

const clearTransferRuntimeState = async (set, get, tablesCache, scopedKey, sessionId, { clearOffsets = false, clearPaid = false, clearPaused = false } = {}) => {
    if (clearPaused) {
        set(state => {
            const { [sessionId]: _, ...rest } = state.pausedSessions || {};
            return { pausedSessions: rest };
        });
        await tablesCache.setItem(scopedKey('paused_sessions'), get().pausedSessions || {});
        get().realtimeChannel?.send({
            type: 'broadcast',
            event: 'table_resume',
            payload: { sessionId },
        });
    }

    if (clearOffsets) {
        const offsetKeys = [
            ['paid_hours_offsets', 'paidHoursOffsets'],
            ['paid_rounds_offsets', 'paidRoundsOffsets'],
            ['paid_elapsed_offsets', 'paidElapsedOffsets'],
        ];
        const nextState = {};
        for (const [cacheName, stateName] of offsetKeys) {
            const cache = await tablesCache.getItem(scopedKey(cacheName)) || {};
            delete cache[sessionId];
            await tablesCache.setItem(scopedKey(cacheName), cache);
            const current = { ...(get()[stateName] || {}) };
            delete current[sessionId];
            nextState[stateName] = current;
        }
        set(nextState);
        get().realtimeChannel?.send({
            type: 'broadcast',
            event: 'table_offsets_clear',
            payload: { sessionId },
        });
    }

    if (clearPaid) {
        const paidCache = await tablesCache.getItem(scopedKey('paid_sessions')) || {};
        delete paidCache[sessionId];
        await tablesCache.setItem(scopedKey('paid_sessions'), paidCache);
        set(state => ({
            activeSessions: state.activeSessions.map(s =>
                s.id === sessionId ? { ...s, paid_at: null } : s
            ),
        }));
        get().realtimeChannel?.send({
            type: 'broadcast',
            event: 'table_paid_clear',
            payload: { sessionId },
        });
    }
};

export const createSessionActions = (set, get, tablesCache, scopedKey) => ({
    openSession: async (tableId, staffId, gameMode = 'NORMAL', hoursPaid = 0, clientName = '', guestCount = 0, clientId = null, includePina = false, seats = []) => {
        const userId = await getAuthUserId();

        const orphans = get().activeSessions.filter(
            s => s.table_id === tableId && (s.status === 'ACTIVE' || s.status === 'CHECKOUT')
        );
        if (orphans.length > 0) {
            const cleanedSessions = get().activeSessions.filter(s => s.table_id !== tableId);
            set({ activeSessions: cleanedSessions });
            await tablesCache.setItem(scopedKey('active_sessions'), cleanedSessions);
            for (const orphan of orphans) {
                try {
                    await supabaseCloud.from('table_sessions')
                        .update({ status: 'CLOSED', closed_at: new Date(getServerNow()).toISOString(), total_cost_usd: 0 })
                        .eq('id', orphan.id);
                } catch { /* ignorar */ }
            }
        }

        const sessionPayload = {
            table_id: tableId,
            opened_by: staffId,
            game_mode: gameMode,
            hours_paid: hoursPaid,
            status: 'ACTIVE',
            started_at: new Date(getServerNow()).toISOString(),
            ...(clientName ? { client_name: clientName } : {}),
            ...(guestCount > 0 ? { guest_count: guestCount } : {}),
            ...(clientId ? { client_id: clientId } : {}),
            ...((includePina && gameMode !== 'PINA') ? { extended_times: 1 } : {}),
            ...(gameMode === 'PINA' && seats && seats.length > 1 ? { extended_times: -1 } : {}),
            ...(seats && seats.length > 0 ? { seats, guest_count: seats.length } : {}),
        };
        if (userId) sessionPayload.user_id = userId;

        const fakeId = 'temp-' + Date.now();
        const optimisticSession = { ...sessionPayload, id: fakeId };

        const newSessions = [...get().activeSessions, optimisticSession];
        set({ activeSessions: newSessions });
        await tablesCache.setItem(scopedKey('active_sessions'), newSessions);

        const tableName = get().tables.find(t => t.id === tableId)?.name ?? tableId;
        const parts = [];
        if (gameMode === 'PINA' || includePina) parts.push('Jugada');
        if (hoursPaid > 0) parts.push(`${hoursPaid}h`);
        else if (gameMode !== 'PINA') parts.push('Libre');
        const modeLabel = parts.join(' + ') || 'Normal';
        logEvent('MESAS', 'MESA_ABIERTA', `Mesa ${tableName} abierta · ${modeLabel}`, getUser(), { tableId, gameMode, hoursPaid, includePina });

        try {
            const { data, error } = await supabaseCloud.from('table_sessions').insert(sessionPayload).select().single();
            if (error) throw error;
            set(state => ({
                activeSessions: state.activeSessions.map(s => s.id === fakeId ? data : s)
            }));
            await tablesCache.setItem(scopedKey('active_sessions'), get().activeSessions);
        } catch (error) {
            console.warn('Guardado en nube fallido, encolado para más tarde.');
            set(state => ({
                activeSessions: state.activeSessions.map(s =>
                    s.id === fakeId ? { ...s, _pendingSync: true } : s
                )
            }));
            await tablesCache.setItem(scopedKey('active_sessions'), get().activeSessions);
            await get().addPendingAction({ type: 'OPEN_SESSION', sessionId: fakeId, payload: sessionPayload });
        }
    },

    closeSession: async (sessionId, staffId, totalCost, paymentMethod = null) => {
        const session = get().activeSessions.find(s => s.id === sessionId);
        const tableName = session ? (get().tables.find(t => t.id === session.table_id)?.name ?? session.table_id) : sessionId;

        if (get().pausedSessions[sessionId]) {
            set(state => {
                const { [sessionId]: _, ...rest } = state.pausedSessions;
                return { pausedSessions: rest };
            });
            // No dejar una pausa huérfana que reaparezca después de recargar.
            await tablesCache.setItem(scopedKey('paused_sessions'), get().pausedSessions);
        }

        const updatedList = get().activeSessions.filter(s => s.id !== sessionId);
        set({ activeSessions: updatedList });
        await tablesCache.setItem(scopedKey('active_sessions'), updatedList);

        // Limpiar paid_at, hours_offset y rounds_offset del cache local
        const paidCache = await tablesCache.getItem(scopedKey('paid_sessions')) || {};
        if (paidCache[sessionId]) {
            delete paidCache[sessionId];
            await tablesCache.setItem(scopedKey('paid_sessions'), paidCache);
        }
        const offsetCache = await tablesCache.getItem(scopedKey('paid_hours_offsets')) || {};
        if (offsetCache[sessionId] !== undefined) {
            delete offsetCache[sessionId];
            await tablesCache.setItem(scopedKey('paid_hours_offsets'), offsetCache);
            const newOffsets = { ...get().paidHoursOffsets };
            delete newOffsets[sessionId];
            set({ paidHoursOffsets: newOffsets });
        }
        const roundsOffsetCache = await tablesCache.getItem(scopedKey('paid_rounds_offsets')) || {};
        if (roundsOffsetCache[sessionId] !== undefined) {
            delete roundsOffsetCache[sessionId];
            await tablesCache.setItem(scopedKey('paid_rounds_offsets'), roundsOffsetCache);
            const newRoundsOffsets = { ...get().paidRoundsOffsets };
            delete newRoundsOffsets[sessionId];
            set({ paidRoundsOffsets: newRoundsOffsets });
        }
        const elapsedOffsetCache = await tablesCache.getItem(scopedKey('paid_elapsed_offsets')) || {};
        if (elapsedOffsetCache[sessionId] !== undefined) {
            delete elapsedOffsetCache[sessionId];
            await tablesCache.setItem(scopedKey('paid_elapsed_offsets'), elapsedOffsetCache);
            const newElapsedOffsets = { ...(get().paidElapsedOffsets || {}) };
            delete newElapsedOffsets[sessionId];
            set({ paidElapsedOffsets: newElapsedOffsets });
        }

        const cost = Number(totalCost);
        logEvent('MESAS', 'MESA_CERRADA', `Mesa ${tableName} cerrada${cost > 0 ? ` · $${cost.toFixed(2)}` : ''}`, getUser(), { sessionId, totalCost, paymentMethod });

        get().realtimeChannel?.send({
            type: 'broadcast',
            event: 'table_offsets_clear',
            payload: { sessionId }
        });

        const updatePayload = {
            status: 'CLOSED',
            closed_at: new Date(getServerNow()).toISOString(),
            total_cost_usd: totalCost
        };
        if (paymentMethod) updatePayload.payment_method = paymentMethod;

        try {
            const { error } = await supabaseCloud.from('table_sessions').update(updatePayload).eq('id', sessionId);
            if (error) throw error;
        } catch (error) {
            console.warn('Cierre en nube fallido, encolado.');
            await get().addPendingAction({ type: 'CLOSE_SESSION', sessionId, payload: updatePayload });
        }

        // Capa 1: Cerrar/eliminar la orden asociada para evitar órdenes huérfanas
        try {
            await useOrdersStore.getState().cancelOrderBySessionId(sessionId);
        } catch (_) {
            // Non-fatal: si falla, la Capa 3 (trigger DB) lo resuelve
            console.warn('[closeSession] No se pudo cerrar la orden asociada — el trigger DB lo resolverá');
        }
    },

    updateSessionMetadata: async (sessionId, clientName, guestCount, clientId = null, notes = undefined) => {
        const payload = {
            client_name: clientName || null,
            guest_count: guestCount || 0,
            ...(clientId !== undefined ? { client_id: clientId } : {}),
            ...(notes !== undefined ? { notes: notes || null } : {}),
        };
        const newSessions = get().activeSessions.map(s =>
            s.id === sessionId ? { ...s, ...payload } : s
        );
        set({ activeSessions: newSessions });
        await tablesCache.setItem(scopedKey('active_sessions'), newSessions);
        try {
            const { error } = await supabaseCloud.from('table_sessions').update(payload).eq('id', sessionId);
            if (error) throw error;
        } catch (e) {
            await get().addPendingAction({ type: 'UPDATE_SESSION', sessionId, payload });
        }
    },

    updateSessionSeats: async (sessionId, seats) => {
        const payload = { seats: seats || [] };
        const newSessions = get().activeSessions.map(s =>
            s.id === sessionId ? { ...s, ...payload, guest_count: (seats || []).length } : s
        );
        set({ activeSessions: newSessions });
        await tablesCache.setItem(scopedKey('active_sessions'), newSessions);
        try {
            const { error } = await supabaseCloud.from('table_sessions').update({ ...payload, guest_count: (seats || []).length }).eq('id', sessionId);
            if (error) throw error;
        } catch (e) {
            await get().addPendingAction({ type: 'UPDATE_SESSION', sessionId, payload: { ...payload, guest_count: (seats || []).length } });
        }
    },

    updateSessionTime: async (sessionId, newStartedAt) => {
        // _pendingSync evita que un syncTablesAndSessions concurrente (disparado por
        // el cambio de CUALQUIER mesa en el local) sobreescriba este started_at recién
        // calculado con el valor viejo que aún está en la nube mientras el UPDATE viaja.
        const newSessions = get().activeSessions.map(s =>
            s.id === sessionId ? { ...s, started_at: newStartedAt, _pendingSync: true } : s
        );
        set({ activeSessions: newSessions });
        await tablesCache.setItem(scopedKey('active_sessions'), newSessions);
        try {
            const { error } = await supabaseCloud.from('table_sessions').update({ started_at: newStartedAt }).eq('id', sessionId);
            if (error) throw error;
            set(state => ({
                activeSessions: state.activeSessions.map(s =>
                    s.id === sessionId ? { ...s, _pendingSync: false } : s
                )
            }));
        } catch (e) {
            await get().addPendingAction({ type: 'UPDATE_SESSION', sessionId, payload: { started_at: newStartedAt } });
        }
    },

    updateSessionTipEnabled: async (sessionId, tipEnabled) => {
        const session = get().activeSessions.find(s => s.id === sessionId);
        if (!session) return;

        const updatedNotes = buildTipNotes(session.notes, tipEnabled);
        const payload = { notes: updatedNotes };

        const newSessions = get().activeSessions.map(s =>
            s.id === sessionId ? { ...s, notes: updatedNotes } : s
        );
        set({ activeSessions: newSessions });
        await tablesCache.setItem(scopedKey('active_sessions'), newSessions);

        try {
            const { error } = await supabaseCloud.from('table_sessions').update(payload).eq('id', sessionId);
            if (error) throw error;
        } catch (e) {
            await get().addPendingAction({ type: 'UPDATE_SESSION', sessionId, payload });
        }
    },

    requestCheckout: async (sessionId, tipEnabled) => {
        const session = get().activeSessions.find(s => s.id === sessionId);
        if (!session) return;

        const tableId = session.table_id;
        const table = get().tables.find(t => t.id === tableId);
        const isPool = table?.type === 'POOL';

        if (isPool) {
            const paused = get().pausedSessions[sessionId];
            if (!paused?.isPaused) {
                const currentElapsed = calculateElapsedTimePrecise(session.started_at);
                get().pauseSession(sessionId, currentElapsed);
            }
        }

        const otherCheckouts = get().activeSessions.filter(
            s => s.id !== sessionId && s.table_id === tableId && s.status === 'CHECKOUT'
        );

        const updatedNotes = tipEnabled !== undefined
            ? buildTipNotes(session.notes, tipEnabled)
            : (session.notes || '');

        const newSessions = get().activeSessions.map(s => {
            if (s.id === sessionId) return { ...s, status: 'CHECKOUT', notes: updatedNotes };
            if (s.table_id === tableId && s.status === 'CHECKOUT') return { ...s, status: 'ACTIVE' };
            return s;
        });
        set({ activeSessions: newSessions });
        await tablesCache.setItem(scopedKey('active_sessions'), newSessions);

        // Broadcast inmediato a los demás dispositivos (no esperar a postgres_changes)
        get().realtimeChannel?.send({
            type: 'broadcast',
            event: 'table_checkout_request',
            payload: { sessionId, tableId, notes: updatedNotes, demotedIds: otherCheckouts.map(o => o.id) }
        });

        for (const other of otherCheckouts) {
            try {
                await supabaseCloud.from('table_sessions').update({ status: 'ACTIVE' }).eq('id', other.id);
            } catch { /* ignorar */ }
        }

        const dbPayload = { status: 'CHECKOUT' };
        if (tipEnabled !== undefined) dbPayload.notes = updatedNotes;
        try {
            const { error } = await supabaseCloud.from('table_sessions').update(dbPayload).eq('id', sessionId);
            if (error) throw error;
        } catch (e) {
            await get().addPendingAction({ type: 'UPDATE_SESSION', sessionId, payload: dbPayload });
        }
    },

    cancelCheckoutRequest: async (sessionId) => {
        const session = get().activeSessions.find(s => s.id === sessionId);
        const table = session ? get().tables.find(t => t.id === session.table_id) : null;
        const isPool = table?.type === 'POOL';

        if (isPool) {
            try {
                await get().resumeSession(sessionId);
            } catch (e) {
                console.warn('[cancelCheckoutRequest] Error resuming session:', e);
            }
        }

        const newSessions = get().activeSessions.map(s =>
            s.id === sessionId ? { ...s, status: 'ACTIVE' } : s
        );
        set({ activeSessions: newSessions });
        await tablesCache.setItem(scopedKey('active_sessions'), newSessions);

        // Broadcast inmediato a los demás dispositivos
        get().realtimeChannel?.send({
            type: 'broadcast',
            event: 'table_checkout_cancel',
            payload: { sessionId }
        });

        try {
            const { error } = await supabaseCloud.from('table_sessions').update({ status: 'ACTIVE' }).eq('id', sessionId);
            if (error) throw error;
        } catch (e) {
            await get().addPendingAction({ type: 'UPDATE_SESSION', sessionId, payload: { status: 'ACTIVE' } });
        }
    },

    markSeatAsPaid: async (sessionId, seatId) => {
        const session = get().activeSessions.find(s => s.id === sessionId);
        if (!session) return;
        const newSeats = (session.seats || []).map(s =>
            s.id === seatId ? { ...s, paid: true, checkoutRequested: false } : s
        );
        const allPaid = newSeats.every(s => s.paid);
        const newSessions = get().activeSessions.map(s =>
            s.id === sessionId ? { ...s, seats: newSeats } : s
        );
        set({ activeSessions: newSessions });
        await tablesCache.setItem(scopedKey('active_sessions'), newSessions);
        try {
            await supabaseCloud.from('table_sessions').update({ seats: newSeats }).eq('id', sessionId);
        } catch (e) {
            await get().addPendingAction({ type: 'UPDATE_SESSION', sessionId, payload: { seats: newSeats } });
        }
        return allPaid;
    },

    removeSeatFromSession: async (sessionId, seatId) => {
        const session = get().activeSessions.find(s => s.id === sessionId);
        if (!session) return;
        
        const seatToRemove = (session.seats || []).find(s => s.id === seatId);
        let notesUpdate = session.notes || '';
        
        // If removing a PAID seat, persist their shared portion before deletion
        if (seatToRemove?.paid) {
            try {
                const { orders, orderItems } = useOrdersStore.getState();
                const order = orders.find(o => o.table_session_id === sessionId);
                const currentItems = order ? orderItems.filter(i => i.order_id === order.id) : [];
                const config = get().config;
                const tableId = session.table_id;
                const table = get().tables.find(t => t.id === tableId);
                const tableType = table?.type || 'POOL';
                const isTimeFree = tableType === 'NORMAL';
                const elapsed = calculateElapsedTime(session.started_at);
                const hoursOff = get().paidHoursOffsets?.[sessionId] || 0;
                const roundsOff = get().paidRoundsOffsets?.[sessionId] || 0;
                const elapsedOff = get().paidElapsedOffsets?.[sessionId] || 0;
                
                // Calculate breakdown treating the seat to remove as unpaid to get its share
                const calculationSeats = (session.seats || []).map(s =>
                    s.id === seatId ? { ...s, paid: false } : s
                );
                
                const breakdown = calculateFullTableBreakdown(
                    session, calculationSeats, elapsed, config, currentItems,
                    null, null, isTimeFree, hoursOff, roundsOff, tableType, elapsedOff
                );
                
                if (breakdown) {
                    const seatBd = breakdown.seats.find(s => s.seat.id === seatId);
                    const seatSharedPortion = seatBd?.sharedPortion || 0;
                    
                    if (seatSharedPortion > 0) {
                        // Parse existing RETIRED_PAID_SHARED
                        let existing = 0;
                        if (notesUpdate.includes('|||RETIRED_PAID_SHARED:')) {
                            const parts = notesUpdate.split('|||RETIRED_PAID_SHARED:')[1];
                            if (parts) {
                                const val = parseFloat(parts.split('|||')[0].trim());
                                if (!isNaN(val)) existing = val;
                            }
                        }
                        const newTotal = existing + seatSharedPortion;
                        // Replace or append the tag
                        notesUpdate = notesUpdate.replace(/\|\|\|RETIRED_PAID_SHARED:[^|]*\|\|\|/g, '').trim();
                        notesUpdate = `${notesUpdate}${notesUpdate ? ' ' : ''}|||RETIRED_PAID_SHARED:${newTotal}|||`;
                    }
                }
            } catch (e) {
                console.warn('[removeSeatFromSession] Could not compute retired shared portion:', e);
            }
        }
        
        const newSeats = (session.seats || []).filter(s => s.id !== seatId);
        
        // Auto-update client_name/client_id if it matched the retiring seat
        let clientNameUpdate = session.client_name;
        let clientIdUpdate = session.client_id;
        const firstRemaining = newSeats.find(s => !s.paid);
        if (firstRemaining && seatToRemove) {
            const retiredLabel = seatToRemove.label || '';
            if (session.client_name === retiredLabel || (seatToRemove.customerId && seatToRemove.customerId === session.client_id)) {
                clientNameUpdate = firstRemaining.label || null;
                clientIdUpdate = firstRemaining.customerId || null;
            }
        }
        
        const payload = {
            seats: newSeats,
            guest_count: newSeats.length,
            notes: notesUpdate || null,
            client_name: clientNameUpdate || null,
            client_id: clientIdUpdate || null
        };
        
        const newSessions = get().activeSessions.map(s =>
            s.id === sessionId ? { ...s, ...payload } : s
        );
        set({ activeSessions: newSessions });
        await tablesCache.setItem(scopedKey('active_sessions'), newSessions);
        
        const seatLabel = seatToRemove?.label || seatId;
        logEvent('MESAS', 'CLIENTE_LIBERADO', `Cliente "${seatLabel}" retirado de la sesión`, getUser(), { sessionId, seatId });
        
        try {
            const { error } = await supabaseCloud.from('table_sessions').update(payload).eq('id', sessionId);
            if (error) throw error;
        } catch (e) {
            await get().addPendingAction({ type: 'UPDATE_SESSION', sessionId, payload });
        }
    },

    requestSeatCheckout: async (sessionId, seatId) => {
        const session = get().activeSessions.find(s => s.id === sessionId);
        if (!session) return;
        const newSeats = (session.seats || []).map(s =>
            s.id === seatId ? { ...s, checkoutRequested: true } : s
        );
        const newSessions = get().activeSessions.map(s =>
            s.id === sessionId ? { ...s, seats: newSeats } : s
        );
        set({ activeSessions: newSessions });
        await tablesCache.setItem(scopedKey('active_sessions'), newSessions);
        try {
            await supabaseCloud.from('table_sessions').update({ seats: newSeats }).eq('id', sessionId);
        } catch (e) {
            await get().addPendingAction({ type: 'UPDATE_SESSION', sessionId, payload: { seats: newSeats } });
        }
    },

    cancelSeatCheckoutRequest: async (sessionId, seatId) => {
        const session = get().activeSessions.find(s => s.id === sessionId);
        if (!session) return;
        const newSeats = (session.seats || []).map(s =>
            s.id === seatId ? { ...s, checkoutRequested: false } : s
        );
        const newSessions = get().activeSessions.map(s =>
            s.id === sessionId ? { ...s, seats: newSeats } : s
        );
        set({ activeSessions: newSessions });
        await tablesCache.setItem(scopedKey('active_sessions'), newSessions);
        try {
            await supabaseCloud.from('table_sessions').update({ seats: newSeats }).eq('id', sessionId);
        } catch (e) {
            await get().addPendingAction({ type: 'UPDATE_SESSION', sessionId, payload: { seats: newSeats } });
        }
    },

    transferSession: async (
        requestedSourceSessionId,
        targetTableId,
        transferType = TRANSFER_TYPES.ALL,
        transferOptions = {}
    ) => {
        const sourceSession = await resolveTransferSourceSession(get, requestedSourceSessionId);
        const sourceSessionId = sourceSession.id;
        const sourceTable = get().tables.find(table => table.id === sourceSession.table_id);
        const targetTable = get().tables.find(table => table.id === targetTableId);
        if (!sourceTable) throw new Error('Mesa origen no encontrada');
        if (!targetTable) throw new Error('Mesa destino no encontrada');
        const operationId = String(
            transferOptions?.transferOperationId || createTransferOperationId(sourceSessionId, targetTableId)
        );

        // Reintentos del mismo movimiento no deben volver a crear ni copiar órdenes.
        const completedSession = get().activeSessions.find(session =>
            session.table_id === targetTableId && hasTransferOperation(session, operationId)
        );
        if (completedSession) {
            return {
                type: transferType,
                sourceSessionId,
                targetTableId,
                idempotent: true,
                queued: true,
            };
        }

        const lockKey = `${sourceSessionId}:${targetTableId}`;
        if (transferInFlight.has(lockKey)) {
            throw new Error('Esta transferencia ya está siendo procesada');
        }
        transferInFlight.add(lockKey);

        try {
            const validation = validateTableTransfer({
                sourceSession,
                sourceTable,
                targetTable,
                allSessions: get().activeSessions,
                transferType,
            });
            const { sourceType, targetType, targetSession } = validation;
            const config = get().config;
            const sourceElapsed = getSessionElapsedMinutes(sourceSession, get().pausedSessions);
            const hoursOff = get().paidHoursOffsets?.[sourceSessionId] || 0;
            const roundsOff = get().paidRoundsOffsets?.[sourceSessionId] || 0;
            const elapsedOff = get().paidElapsedOffsets?.[sourceSessionId] || 0;

            // Construir el patch antes de crear/consolidar cualquier comanda. Esto
            // fuerza a seleccionar el modo Normal→Pool y la política de asientos
            // antes de producir efectos irreversibles.
            const transferNowISO = new Date(getServerNow()).toISOString();
            const transferMetadata = {
                operation_id: operationId,
                source_type: sourceType,
                target_type: targetType,
                source_started_at: sourceSession.started_at || null,
                transferred_at: transferNowISO,
                source_elapsed_minutes: sourceElapsed,
                paid_elapsed_offset_minutes: elapsedOff,
                frozen_time_usd: 0,
                operator_id: getUser()?.id || sourceSession.opened_by || null,
                pool_mode: transferOptions?.poolMode?.type || null,
                pool_hours_paid: transferOptions?.poolMode?.hoursPaid || 0,
                pool_rounds: transferOptions?.poolMode?.rounds || 0,
            };
            const sessionPatch = transferType === TRANSFER_TYPES.ALL
                ? buildTableTransferSessionPatch({
                    sourceSession,
                    targetTableId,
                    sourceType,
                    targetType,
                    nowISO: transferNowISO,
                    poolMode: transferOptions?.poolMode,
                    preserveSeatTimeCharges: transferOptions?.preserveSeatTimeCharges,
                    transferOperationId: operationId,
                    transferMetadata,
                })
                : null;

            if (transferType === TRANSFER_TYPES.ALL) {
            const ordersStore = useOrdersStore.getState();
            let sourceOrder = ordersStore.orders.find(o => o.table_session_id === sourceSessionId);
            let frozen = null;

            // Ruta autoritativa P0: la sesión, la orden y el cargo congelado se
            // confirman en una sola transacción. Si la migración aún no está
            // instalada, devuelve null y conserva temporalmente el fallback legacy.
            const atomicFrozen = sourceType === 'POOL' && targetType === 'NORMAL'
                ? buildFrozenTimeCharge(sourceSession, sourceElapsed, config, sourceType, hoursOff, roundsOff, operationId, elapsedOff)
                : null;
            if (atomicFrozen) {
                frozen = atomicFrozen;
                transferMetadata.frozen_time_usd = atomicFrozen.total;
                if (sessionPatch?.transfer_metadata) {
                    sessionPatch.transfer_metadata.frozen_time_usd = atomicFrozen.total;
                }
            }
            const atomicTableResult = await tryAtomicTableTransfer({
                operationId,
                sourceSessionId,
                targetTableId,
                transferType: TRANSFER_TYPES.ALL,
                plan: {
                    operator_id: getUser()?.id || sourceSession.opened_by || null,
                    source_type: sourceType,
                    target_type: targetType,
                    source_elapsed_minutes: sourceElapsed,
                    elapsed_offset_minutes: elapsedOff,
                    preview_total: atomicFrozen?.total || 0,
                    session_patch: sessionPatch || {},
                    frozen: atomicFrozen
                        ? {
                            total: atomicFrozen.total,
                            qty: atomicFrozen.qty,
                            productInfo: atomicFrozen.productInfo,
                        }
                        : null,
                },
            });

            if (!atomicTableResult && (transferType === TRANSFER_TYPES.CONSUMPTION || sourceType !== targetType)) {
                throw new Error('Esta transferencia requiere la migración de transferencia atómica antes de continuar');
            }

            if (atomicTableResult) {
                const atomicSession = atomicTableResult.session;
                const atomicSessions = get().activeSessions.map(session =>
                    session.id === sourceSessionId
                        ? { ...session, ...atomicSession, _pendingSync: false }
                        : session
                );
                set({ activeSessions: atomicSessions });
                await tablesCache.setItem(scopedKey('active_sessions'), atomicSessions);
                if (sourceType !== targetType) {
                    await clearTransferRuntimeState(
                        set,
                        get,
                        tablesCache,
                        scopedKey,
                        sourceSessionId,
                        { clearPaused: true, clearOffsets: true, clearPaid: true }
                    );
                }
                await useOrdersStore.getState().syncOrders();
                logEvent(
                    'MESAS',
                    'TRANSFERENCIA',
                    `Transferencia atómica de ${sourceTable?.name ?? sourceSession.table_id} a ${targetTable?.name ?? targetTableId}`,
                    getUser(),
                    {
                        sourceSessionId,
                        targetTableId,
                        sourceType,
                        targetType,
                        frozenTime: atomicTableResult.frozen_time_usd || 0,
                        transferOperationId: operationId,
                        atomic: true,
                    }
                );
                return {
                    type: TRANSFER_TYPES.ALL,
                    sourceSessionId,
                    targetTableId,
                    frozenTime: atomicTableResult.frozen_time_usd || 0,
                    atomic: true,
                    queued: false,
                };
            }

            // Pool→Normal no puede seguir interpretando horas/piñas como tiempo:
            // primero calcula el saldo y, si la RPC está instalada, guarda todo en
            // una transacción. Las instalaciones antiguas usan el fallback legado.
            let atomicRpcResult = null;
            if (sourceType === 'POOL' && targetType === 'NORMAL') {
                frozen = buildFrozenTimeCharge(sourceSession, sourceElapsed, config, sourceType, hoursOff, roundsOff, operationId, elapsedOff);
                transferMetadata.frozen_time_usd = frozen?.total || 0;
                if (sessionPatch?.transfer_metadata) {
                    sessionPatch.transfer_metadata.frozen_time_usd = transferMetadata.frozen_time_usd;
                }

                atomicRpcResult = await tryAtomicPoolToNormalTransfer({
                    operationId,
                    sourceSessionId,
                    targetTableId,
                    operatorId: getUser()?.id || sourceSession.opened_by,
                    frozenTimeUsd: frozen?.total || 0,
                    transferMetadata,
                });

                if (atomicRpcResult) {
                    const atomicSession = atomicRpcResult.session;
                    const atomicSessions = get().activeSessions.map(session =>
                        session.id === sourceSessionId
                            ? { ...session, ...atomicSession, _pendingSync: false }
                            : session
                    );
                    set({ activeSessions: atomicSessions });
                    await tablesCache.setItem(scopedKey('active_sessions'), atomicSessions);
                    await clearTransferRuntimeState(
                        set,
                        get,
                        tablesCache,
                        scopedKey,
                        sourceSessionId,
                        { clearPaused: true, clearOffsets: true, clearPaid: true }
                    );
                    await useOrdersStore.getState().syncOrders();

                    const sourceTableName = sourceTable?.name ?? sourceSession.table_id;
                    const targetTableName = targetTable?.name ?? targetTableId;
                    logEvent(
                        'MESAS',
                        'TRANSFERENCIA',
                        `Transferencia total de ${sourceTableName} a ${targetTableName} · tiempo congelado $${(frozen?.total || 0).toFixed(2)} (Pool→Bar)`,
                        getUser(),
                        {
                            sourceSessionId,
                            targetTableId,
                            sourceType,
                            targetType,
                            frozenTime: frozen?.total || 0,
                            startedAt: atomicSession.started_at || transferNowISO,
                            transferOperationId: operationId,
                            atomic: true,
                        }
                    );
                    return {
                        type: TRANSFER_TYPES.ALL,
                        sourceSessionId,
                        targetTableId,
                        frozenTime: frozen?.total || 0,
                        atomic: true,
                        queued: false,
                    };
                }

                if (frozen) {
                    const frozenLine = sourceOrder
                        ? (ordersStore.orderItems || []).find(item =>
                            item.order_id === sourceOrder.id
                            && item.product_id === frozen.productInfo.id
                        )
                        : null;
                    if (frozenLine) {
                        // Reintento legacy tras una respuesta perdida: reutilizar la
                        // línea existente evita sumar el cargo fijo por segunda vez.
                        const existingTotal = Number(frozenLine.unit_price_usd) * Number(frozenLine.qty || 1);
                        frozen = {
                            ...frozen,
                            total: Number(existingTotal.toFixed(2)),
                            qty: Number(frozenLine.qty || 1),
                            productInfo: {
                                ...frozen.productInfo,
                                priceUsd: Number(frozenLine.unit_price_usd),
                            },
                        };
                    } else {
                        try {
                            await ordersStore.addItemToSession(
                                sourceSession.table_id,
                                sourceSessionId,
                                sourceSession.opened_by,
                                frozen.productInfo,
                                sourceOrder?.exchange_rate_used || 1,
                                null,
                                frozen.qty
                            );
                        } catch (e) {
                            console.error('Error congelando tiempo en transferencia Pool→Normal:', e);
                            throw new Error('No se pudo preservar el cobro de tiempo. Transferencia cancelada.');
                        }
                    }
                    // Si no existía comanda, addItemToSession acaba de crearla.
                    sourceOrder = useOrdersStore.getState().orders.find(o => o.table_session_id === sourceSessionId);
                }
            }
            if (!atomicRpcResult) {
                transferMetadata.frozen_time_usd = frozen?.total || 0;
                if (sessionPatch?.transfer_metadata) {
                    sessionPatch.transfer_metadata.frozen_time_usd = transferMetadata.frozen_time_usd;
                }
            }

            // Revalidar tras cualquier espera/red antes de mutar la sesión local.
            validateTableTransfer({
                sourceSession: get().activeSessions.find(session => session.id === sourceSessionId),
                sourceTable,
                targetTable,
                allSessions: get().activeSessions,
                transferType,
            });

            let sessionSyncPending = false;
            let orderSyncPending = false;
            const newSessions = get().activeSessions.map(session =>
                session.id === sourceSessionId
                    ? { ...session, ...sessionPatch, _pendingSync: true }
                    : session
            );
            set({ activeSessions: newSessions });
            await tablesCache.setItem(scopedKey('active_sessions'), newSessions);

            if (sourceType !== targetType) {
                await clearTransferRuntimeState(
                    set,
                    get,
                    tablesCache,
                    scopedKey,
                    sourceSessionId,
                    {
                        clearPaused: true,
                        clearOffsets: true,
                        clearPaid: true,
                    }
                );
            }

            try {
                const { error } = await supabaseCloud
                    .from('table_sessions')
                    .update(sessionPatch)
                    .eq('id', sourceSessionId);
                if (error) {
                    // Compatibilidad con instalaciones que aún no ejecutaron las
                    // migraciones nuevas: notes conserva el operation_id aunque se
                    // omita únicamente la columna que el esquema desconoce.
                    const legacySessionPatch = stripUnsupportedTransferColumns(sessionPatch, error);
                    if (!legacySessionPatch) throw error;
                    const { error: legacyError } = await supabaseCloud
                        .from('table_sessions')
                        .update(legacySessionPatch)
                        .eq('id', sourceSessionId);
                    if (legacyError) throw legacyError;
                    console.warn('[Transfer] metadata/pausa no disponible; se guardó con el esquema legado');
                }
            } catch (e) {
                sessionSyncPending = true;
                console.warn('Error sync transfer DB session, encolado:', e);
                await get().addPendingAction({
                    type: 'UPDATE_SESSION',
                    sessionId: sourceSessionId,
                    payload: sessionPatch,
                });
            }

            // No permitir que un sync concurrente reemplace el contexto nuevo
            // mientras el patch de la sesión está en la cola offline.
            const syncedSessions = get().activeSessions.map(session =>
                session.id === sourceSessionId
                    ? { ...session, _pendingSync: sessionSyncPending }
                    : session
            );
            set({ activeSessions: syncedSessions });
            await tablesCache.setItem(scopedKey('active_sessions'), syncedSessions);

            if (sourceOrder) {
                const orderMove = await useOrdersStore.getState().moveOrderToTable(sourceOrder.id, targetTableId);
                orderSyncPending = orderMove?.synced === false;
                await useOrdersStore.getState().syncOrders();
            }

            const sourceTableName = sourceTable?.name ?? sourceSession.table_id;
            const targetTableName = targetTable?.name ?? targetTableId;
            const crossNote = sourceType !== targetType
                ? (sourceType === 'POOL'
                    ? ` · tiempo congelado${frozen ? ` $${frozen.total.toFixed(2)}` : ' $0'} (Pool→Bar)`
                    : ' · reloj reiniciado (Bar→Pool)')
                : '';
            logEvent(
                'MESAS',
                'TRANSFERENCIA',
                `Transferencia total de ${sourceTableName} a ${targetTableName}${crossNote}`,
                getUser(),
                {
                    sourceSessionId,
                    targetTableId,
                    sourceType,
                    targetType,
                    frozenTime: frozen?.total || 0,
                    poolMode: transferOptions?.poolMode?.type || null,
                    poolHoursPaid: transferOptions?.poolMode?.hoursPaid || 0,
                    poolRounds: transferOptions?.poolMode?.rounds || 0,
                    preserveSeatTimeCharges: transferOptions?.preserveSeatTimeCharges ?? null,
                    startedAt: sessionPatch.started_at || null,
                    transferOperationId: operationId,
                }
            );
            return {
                type: TRANSFER_TYPES.ALL,
                sourceSessionId,
                targetTableId,
                frozenTime: frozen?.total || 0,
                queued: sessionSyncPending || orderSyncPending,
            };
        }

        // CONSUMPTION: la validación ya garantizó que targetSession está ACTIVE.
        const { orders, orderItems, addItemToSession, cancelOrderBySessionId } = useOrdersStore.getState();
        const sourceOrder = orders.find(order => order.table_session_id === sourceSessionId);
        const mergePlan = buildConsumptionMergePayload({
            targetSession,
            sourceSession,
            sourceType,
            targetType,
            preserveSeatTimeCharges: transferOptions?.preserveSeatTimeCharges,
            transferOperationId: operationId,
        });
        const sourceItems = sourceOrder
            ? orderItems.filter(item => item.order_id === sourceOrder.id)
            : [];
        const frozenMerge = sourceType === 'POOL'
            ? buildFrozenTimeCharge(sourceSession, sourceElapsed, config, sourceType, hoursOff, roundsOff, operationId, elapsedOff)
            : null;

        const atomicConsumptionResult = await tryAtomicTableTransfer({
            operationId,
            sourceSessionId,
            targetTableId,
            transferType: TRANSFER_TYPES.CONSUMPTION,
            plan: {
                operator_id: getUser()?.id || sourceSession.opened_by || null,
                source_type: sourceType,
                target_type: targetType,
                target_session_id: targetSession.id,
                source_elapsed_minutes: sourceElapsed,
                elapsed_offset_minutes: elapsedOff,
                preview_total: frozenMerge?.total || 0,
                merge_payload: mergePlan.payload,
                seat_id_map: mergePlan.seatIdMap,
                frozen: frozenMerge
                    ? {
                        total: frozenMerge.total,
                        qty: frozenMerge.qty,
                        productInfo: frozenMerge.productInfo,
                    }
                    : null,
            },
        });

        if (!atomicConsumptionResult) {
            throw new Error('Las fusiones requieren la migración de transferencia atómica antes de continuar');
        }

        if (atomicConsumptionResult) {
            const atomicTargetSession = atomicConsumptionResult.session;
            const atomicSessions = get().activeSessions
                .filter(session => session.id !== sourceSessionId)
                .map(session => session.id === targetSession.id
                    ? { ...session, ...atomicTargetSession, _pendingSync: false }
                    : session
                );
            set({ activeSessions: atomicSessions });
            await tablesCache.setItem(scopedKey('active_sessions'), atomicSessions);
            await clearTransferRuntimeState(
                set,
                get,
                tablesCache,
                scopedKey,
                sourceSessionId,
                { clearPaused: true, clearOffsets: true, clearPaid: true }
            );
            await useOrdersStore.getState().syncOrders();
            logEvent(
                'MESAS',
                'TRANSFERENCIA',
                `Fusión atómica de ${sourceTable?.name ?? sourceSession.table_id} en ${targetTable?.name ?? targetTableId}`,
                getUser(),
                {
                    sourceSessionId,
                    targetTableId,
                    sourceType,
                    targetType,
                    frozenTime: atomicConsumptionResult.frozen_time_usd || 0,
                    transferOperationId: operationId,
                    atomic: true,
                }
            );
            return {
                type: TRANSFER_TYPES.CONSUMPTION,
                sourceSessionId,
                targetTableId,
                frozenTime: atomicConsumptionResult.frozen_time_usd || 0,
                atomic: true,
                queued: false,
            };
        }

        if (sourceOrder) {
            for (const item of sourceItems) {
                const quantity = Number(item.qty);
                if (!Number.isFinite(quantity) || quantity <= 0) continue;
                await addItemToSession(
                    targetTableId,
                    targetSession.id,
                    sourceSession.opened_by,
                    {
                        id: item.product_id,
                        name: item.product_name,
                        priceUsd: Number(item.unit_price_usd),
                    },
                    sourceOrder.exchange_rate_used || 1,
                    remapOrderItemSeatId(item, mergePlan.seatIdMap),
                    quantity
                );
            }

            try {
                await cancelOrderBySessionId(sourceSessionId);
            } catch (e) {
                console.error('Error cleaning source order:', e);
                throw new Error('No se pudo retirar la comanda origen. Fusión cancelada.');
            }
        }

        // El tiempo de Pool se convierte en una línea de consumo en el destino.
        // buildConsumptionMergePayload limpia esos timeCharges para no cobrarlo dos veces.
        const sourceAlreadyHasFrozenLine = Boolean(
            frozenMerge
            && sourceItems.some(item => item.product_id === frozenMerge.productInfo.id)
        );
        if (frozenMerge && !sourceAlreadyHasFrozenLine) {
            try {
                await addItemToSession(
                    targetTableId,
                    targetSession.id,
                    sourceSession.opened_by,
                    frozenMerge.productInfo,
                    targetSession.exchange_rate_used || 1,
                    null,
                    frozenMerge.qty
                );
            } catch (e) {
                console.error('Error preservando el tiempo del origen en la fusión:', e);
                throw new Error('No se pudo preservar el cobro de tiempo. Fusión cancelada.');
            }
        }

        const mergePayload = mergePlan.payload;
        let mergeSyncPending = false;
        const mergedSessions = get().activeSessions.map(session =>
            session.id === targetSession.id ? { ...session, ...mergePayload } : session
        );
        set({ activeSessions: mergedSessions });
        await tablesCache.setItem(scopedKey('active_sessions'), mergedSessions);
        try {
            const { error } = await supabaseCloud
                .from('table_sessions')
                .update(mergePayload)
                .eq('id', targetSession.id);
            if (error) throw error;
        } catch (e) {
            mergeSyncPending = true;
            console.warn('Error sync fusión de clientes, encolado:', e);
            await get().addPendingAction({
                type: 'UPDATE_SESSION',
                sessionId: targetSession.id,
                payload: mergePayload,
            });
        }

        await get().closeSession(sourceSessionId, getUser()?.id || 'SYSTEM', 0);

        const sourceTableName = sourceTable?.name ?? sourceSession.table_id;
        const targetTableName = targetTable?.name ?? targetTableId;
        const timeNote = frozenMerge ? ` (incl. tiempo $${frozenMerge.total.toFixed(2)})` : '';
        logEvent(
            'MESAS',
            'TRANSFERENCIA',
            `Consumo de ${sourceTableName} unificado en ${targetTableName}${timeNote}`,
            getUser(),
            {
                sourceSessionId,
                targetTableId,
                sourceType,
                targetType,
                frozenTime: frozenMerge?.total || 0,
                preserveSeatTimeCharges: transferOptions?.preserveSeatTimeCharges ?? null,
                transferOperationId: operationId,
            }
        );
        return {
            type: TRANSFER_TYPES.CONSUMPTION,
            sourceSessionId,
            targetTableId,
            frozenTime: frozenMerge?.total || 0,
            queued: mergeSyncPending,
        };
        } finally {
            transferInFlight.delete(lockKey);
        }
    },
});
