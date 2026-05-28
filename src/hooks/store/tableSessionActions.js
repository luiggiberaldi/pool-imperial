import { supabaseCloud } from '../../config/supabaseCloud';
import { logEvent } from '../../services/auditService';
import { useAuthStore } from './authStore';
import { useOrdersStore } from './useOrdersStore';

const getUser = () => useAuthStore.getState().currentUser;
const getAuthUserId = async () => {
    try {
        const { data: { session } } = await supabaseCloud.auth.getSession();
        return session?.user?.id || null;
    } catch { return null; }
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
                        .update({ status: 'CLOSED', closed_at: new Date().toISOString(), total_cost_usd: 0 })
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
            started_at: new Date().toISOString(),
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
        if (gameMode === 'PINA' || includePina) parts.push('Piña');
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
            closed_at: new Date().toISOString(),
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
        const newSessions = get().activeSessions.map(s =>
            s.id === sessionId ? { ...s, started_at: newStartedAt } : s
        );
        set({ activeSessions: newSessions });
        await tablesCache.setItem(scopedKey('active_sessions'), newSessions);
        try {
            const { error } = await supabaseCloud.from('table_sessions').update({ started_at: newStartedAt }).eq('id', sessionId);
            if (error) throw error;
        } catch (e) {
            await get().addPendingAction({ type: 'UPDATE_SESSION', sessionId, payload: { started_at: newStartedAt } });
        }
    },

    requestCheckout: async (sessionId) => {
        const session = get().activeSessions.find(s => s.id === sessionId);
        if (!session) return;

        const tableId = session.table_id;
        const otherCheckouts = get().activeSessions.filter(
            s => s.id !== sessionId && s.table_id === tableId && s.status === 'CHECKOUT'
        );

        const newSessions = get().activeSessions.map(s => {
            if (s.id === sessionId) return { ...s, status: 'CHECKOUT' };
            if (s.table_id === tableId && s.status === 'CHECKOUT') return { ...s, status: 'ACTIVE' };
            return s;
        });
        set({ activeSessions: newSessions });
        await tablesCache.setItem(scopedKey('active_sessions'), newSessions);

        for (const other of otherCheckouts) {
            try {
                await supabaseCloud.from('table_sessions').update({ status: 'ACTIVE' }).eq('id', other.id);
            } catch { /* ignorar */ }
        }

        try {
            const { error } = await supabaseCloud.from('table_sessions').update({ status: 'CHECKOUT' }).eq('id', sessionId);
            if (error) throw error;
        } catch (e) {
            await get().addPendingAction({ type: 'UPDATE_SESSION', sessionId, payload: { status: 'CHECKOUT' } });
        }
    },

    cancelCheckoutRequest: async (sessionId) => {
        const newSessions = get().activeSessions.map(s =>
            s.id === sessionId ? { ...s, status: 'ACTIVE' } : s
        );
        set({ activeSessions: newSessions });
        await tablesCache.setItem(scopedKey('active_sessions'), newSessions);
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
            s.id === seatId ? { ...s, paid: true } : s
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
});
