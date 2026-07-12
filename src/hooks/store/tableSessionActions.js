import { supabaseCloud } from '../../config/supabaseCloud';
import { logEvent } from '../../services/auditService';
import { useAuthStore } from './authStore';
import { useOrdersStore } from './useOrdersStore';
import { calculateElapsedTime, calculateElapsedTimePrecise, calculateFullTableBreakdown, buildFrozenTimeCharge } from '../../utils/tableBillingEngine';
import { getServerNow } from '../../utils/serverClock';

const getUser = () => useAuthStore.getState().currentUser;
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
            await get().addPendingAction({ type: 'OPEN_SESSION', payload: sessionPayload });
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
                
                // Calculate breakdown treating the seat to remove as unpaid to get its share
                const calculationSeats = (session.seats || []).map(s =>
                    s.id === seatId ? { ...s, paid: false } : s
                );
                
                const breakdown = calculateFullTableBreakdown(
                    session, calculationSeats, elapsed, config, currentItems,
                    null, null, isTimeFree, hoursOff, roundsOff, tableType
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

    transferSession: async (sourceSessionId, targetTableId, transferType = 'ALL') => {
        const sourceSession = get().activeSessions.find(s => s.id === sourceSessionId);
        if (!sourceSession) throw new Error("Sesión origen no encontrada");

        const targetSession = get().activeSessions.find(
            s => s.table_id === targetTableId && (s.status === 'ACTIVE' || s.status === 'CHECKOUT')
        );

        // Tipos de mesa origen/destino. El cobro de tiempo lo define el tipo de la
        // mesa (POOL cobra tiempo, NORMAL no), NO la sesión. Por eso al cruzar tipos
        // hay que transformar la sesión para no perder ni inventar cobros de tiempo.
        const sourceTable = get().tables.find(t => t.id === sourceSession.table_id);
        const targetTable = get().tables.find(t => t.id === targetTableId);
        const sourceType = sourceTable?.type || 'POOL';
        const targetType = targetTable?.type || 'POOL';
        const config = get().config;

        // elapsed consistente con la tarjeta: si está pausada usa el punto de pausa.
        const paused = get().pausedSessions?.[sourceSessionId];
        const sourceElapsed = paused?.isPaused
            ? (paused.elapsedAtPause || 0)
            : calculateElapsedTime(sourceSession.started_at);
        const hoursOff = get().paidHoursOffsets?.[sourceSessionId] || 0;
        const roundsOff = get().paidRoundsOffsets?.[sourceSessionId] || 0;

        if (transferType === 'ALL') {
            if (targetSession) {
                throw new Error("La mesa de destino ya está ocupada. Solo puedes transferir el consumo.");
            }

            const { orders } = useOrdersStore.getState();
            const sourceOrder = orders.find(o => o.table_session_id === sourceSessionId);

            // ── Cruce POOL → NORMAL: congelar el tiempo jugado como cargo fijo ──
            // La mesa destino no cobra tiempo, así que materializamos lo jugado como
            // un ítem de consumo y neutralizamos los campos de tiempo de la sesión.
            let frozen = null;
            if (sourceType === 'POOL' && targetType === 'NORMAL') {
                frozen = buildFrozenTimeCharge(sourceSession, sourceElapsed, config, sourceType, hoursOff, roundsOff);
                if (frozen) {
                    try {
                        await useOrdersStore.getState().addItemToSession(
                            sourceSession.table_id, sourceSessionId, sourceSession.opened_by,
                            frozen.productInfo, sourceOrder?.exchange_rate_used || 1, null
                        );
                    } catch (e) {
                        console.error("Error congelando tiempo en transferencia Pool→Normal:", e);
                        throw new Error("No se pudo preservar el cobro de tiempo. Transferencia cancelada.");
                    }
                }
            }

            // Payload de la sesión: siempre cambia table_id. Al cruzar tipos, además
            // se transforma para que el tipo destino no reinterprete el cobro.
            const sessionPatch = { table_id: targetTableId };
            if (sourceType === 'POOL' && targetType === 'NORMAL') {
                // Tiempo ya congelado como consumo → sesión pasa a modo Bar puro.
                sessionPatch.game_mode = 'NORMAL';
                sessionPatch.hours_paid = 0;
                sessionPatch.extended_times = 0;
                sessionPatch.seats = (sourceSession.seats || []).map(s => ({ ...s, timeCharges: [] }));
            } else if (sourceType === 'NORMAL' && targetType === 'POOL') {
                // El reloj de pool arranca en 0: sin cobro retroactivo del rato en el bar.
                sessionPatch.started_at = new Date(getServerNow()).toISOString();
                sessionPatch.game_mode = 'NORMAL';
                sessionPatch.hours_paid = 0;
                sessionPatch.extended_times = 0;
            }

            // optimistic session update
            const newSessions = get().activeSessions.map(s =>
                s.id === sourceSessionId ? { ...s, ...sessionPatch } : s
            );
            set({ activeSessions: newSessions });
            await tablesCache.setItem(scopedKey('active_sessions'), newSessions);

            // Al reiniciar el reloj (Normal→Pool) hay que limpiar offsets viejos
            // (mismo saneo que closeSession) para que el nuevo tiempo cuente desde 0.
            if (sourceType === 'NORMAL' && targetType === 'POOL') {
                const offsetCache = await tablesCache.getItem(scopedKey('paid_hours_offsets')) || {};
                if (offsetCache[sourceSessionId] !== undefined) {
                    delete offsetCache[sourceSessionId];
                    await tablesCache.setItem(scopedKey('paid_hours_offsets'), offsetCache);
                }
                const roundsOffsetCache = await tablesCache.getItem(scopedKey('paid_rounds_offsets')) || {};
                if (roundsOffsetCache[sourceSessionId] !== undefined) {
                    delete roundsOffsetCache[sourceSessionId];
                    await tablesCache.setItem(scopedKey('paid_rounds_offsets'), roundsOffsetCache);
                }
                const elapsedOffsetCache = await tablesCache.getItem(scopedKey('paid_elapsed_offsets')) || {};
                if (elapsedOffsetCache[sourceSessionId] !== undefined) {
                    delete elapsedOffsetCache[sourceSessionId];
                    await tablesCache.setItem(scopedKey('paid_elapsed_offsets'), elapsedOffsetCache);
                }
                set({
                    paidHoursOffsets: (() => { const n = { ...get().paidHoursOffsets }; delete n[sourceSessionId]; return n; })(),
                    paidRoundsOffsets: (() => { const n = { ...get().paidRoundsOffsets }; delete n[sourceSessionId]; return n; })(),
                    paidElapsedOffsets: (() => { const n = { ...(get().paidElapsedOffsets || {}) }; delete n[sourceSessionId]; return n; })(),
                });
                get().realtimeChannel?.send({
                    type: 'broadcast',
                    event: 'table_offsets_clear',
                    payload: { sessionId: sourceSessionId }
                });
            }

            try {
                const { error } = await supabaseCloud.from('table_sessions')
                    .update(sessionPatch)
                    .eq('id', sourceSessionId);
                if (error) throw error;
            } catch (e) {
                console.warn("Error sync transfer DB session, encolado:", e);
                await get().addPendingAction({ type: 'UPDATE_SESSION', sessionId: sourceSessionId, payload: sessionPatch });
            }

            // order update
            if (sourceOrder) {
                try {
                    const { error } = await supabaseCloud.from('orders')
                        .update({ table_id: targetTableId })
                        .eq('id', sourceOrder.id);
                    if (error) throw error;
                    await useOrdersStore.getState().syncOrders();
                } catch (e) {
                    console.error("Error sync transfer DB order:", e);
                }
            }

            const sourceTableName = sourceTable?.name ?? sourceSession.table_id;
            const targetTableName = targetTable?.name ?? targetTableId;
            const crossNote = sourceType !== targetType
                ? (sourceType === 'POOL'
                    ? ` · tiempo congelado${frozen ? ` $${frozen.total.toFixed(2)}` : ' $0'} (Pool→Bar)`
                    : ' · reloj reiniciado (Bar→Pool)')
                : '';
            logEvent('MESAS', 'TRANSFERENCIA', `Transferencia total de ${sourceTableName} a ${targetTableName}${crossNote}`, getUser(), { sourceSessionId, targetTableId, sourceType, targetType, frozenTime: frozen?.total || 0 });
        } else if (transferType === 'CONSUMPTION') {
            if (!targetSession) {
                throw new Error("La mesa de destino debe estar ocupada para poder recibir el consumo.");
            }

            const { orders, orderItems, addItemToSession, cancelOrderBySessionId } = useOrdersStore.getState();
            const sourceOrder = orders.find(o => o.table_session_id === sourceSessionId);
            
            if (sourceOrder) {
                const sourceItems = orderItems.filter(i => i.order_id === sourceOrder.id);
                for (const item of sourceItems) {
                    const productInfo = {
                        id: item.product_id,
                        name: item.product_name,
                        priceUsd: Number(item.unit_price_usd)
                    };
                    for (let q = 0; q < item.qty; q++) {
                        await addItemToSession(targetTableId, targetSession.id, sourceSession.opened_by, productInfo, sourceOrder.exchange_rate_used, item.seat_id || null);
                    }
                }

                // Delete the source order cleanly using existing store logic
                try {
                    await cancelOrderBySessionId(sourceSessionId);
                } catch (e) {
                    console.error("Error cleaning source order:", e);
                }
            }

            // Preservar el tiempo jugado del origen: como la sesión origen se cerrará
            // en $0, su cobro de tiempo se perdería. Si el origen es POOL con tiempo,
            // se congela como cargo fijo y se suma a la cuenta destino.
            let frozenMerge = null;
            if (sourceType === 'POOL') {
                frozenMerge = buildFrozenTimeCharge(sourceSession, sourceElapsed, config, sourceType, hoursOff, roundsOff);
                if (frozenMerge) {
                    try {
                        await addItemToSession(
                            targetTableId, targetSession.id, sourceSession.opened_by,
                            frozenMerge.productInfo, targetSession.exchange_rate_used || 1, null
                        );
                    } catch (e) {
                        console.error("Error preservando tiempo del origen en la fusión:", e);
                    }
                }
            }

            // Fusionar clientes (seats) y metadata de la sesión origen en la destino.
            // Sin esto se perdían los clientes de la mesa origen (con sus nombres y
            // cargos de tiempo por cliente), y los ítems movidos quedaban atribuidos
            // a seats inexistentes en el destino.
            const sourceSeats = Array.isArray(sourceSession.seats) ? sourceSession.seats : [];
            const targetSeats = Array.isArray(targetSession.seats) ? targetSession.seats : [];
            const mergedSeats = [...targetSeats, ...sourceSeats];
            const sourceGuests = Number(sourceSession.guest_count) || 0;
            const targetGuests = Number(targetSession.guest_count) || 0;
            // Los seat IDs son únicos entre sesiones (seat-<ts>-<rand>), no colisionan.
            const mergedGuestCount = Math.max(mergedSeats.length, targetGuests + sourceGuests);
            const mergedClientName = targetSession.client_name || sourceSession.client_name || null;
            const mergedClientId = targetSession.client_id || sourceSession.client_id || null;

            const mergePayload = {
                seats: mergedSeats,
                guest_count: mergedGuestCount,
                client_name: mergedClientName,
                client_id: mergedClientId,
            };
            const mergedSessions = get().activeSessions.map(s =>
                s.id === targetSession.id ? { ...s, ...mergePayload } : s
            );
            set({ activeSessions: mergedSessions });
            await tablesCache.setItem(scopedKey('active_sessions'), mergedSessions);
            try {
                const { error } = await supabaseCloud.from('table_sessions').update(mergePayload).eq('id', targetSession.id);
                if (error) throw error;
            } catch (e) {
                console.warn("Error sync fusión de clientes, encolado:", e);
                await get().addPendingAction({ type: 'UPDATE_SESSION', sessionId: targetSession.id, payload: mergePayload });
            }

            // Close source session with $0 cost
            await get().closeSession(sourceSessionId, getUser()?.id || 'SYSTEM', 0);

            const sourceTableName = sourceTable?.name ?? sourceSession.table_id;
            const targetTableName = targetTable?.name ?? targetTableId;
            const timeNote = frozenMerge ? ` (incl. tiempo $${frozenMerge.total.toFixed(2)})` : '';
            logEvent('MESAS', 'TRANSFERENCIA', `Consumo de ${sourceTableName} unificado en ${targetTableName}${timeNote}`, getUser(), { sourceSessionId, targetTableId, frozenTime: frozenMerge?.total || 0 });
        }
    },
});
