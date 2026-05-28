import { supabaseCloud } from '../../config/supabaseCloud';
import { logEvent } from '../../services/auditService';
import { useAuthStore } from './authStore';

const getUser = () => useAuthStore.getState().currentUser;

export const createBillingActions = (set, get, tablesCache, scopedKey) => ({
    addHoursToSession: async (sessionId, additionalHours, seatId = null) => {
        const session = get().activeSessions.find(s => s.id === sessionId);
        if (!session) return;

        // Fix: si el tiempo prepagado ya expiró, ajustar el elapsedOffset
        // para que la nueva hora arranque completa desde este momento.
        if (additionalHours > 0 && session.started_at) {
            const nowElapsed = Math.max(0, Math.floor((Date.now() - new Date(session.started_at).getTime()) / 60000));
            const currentElapsedOffset = (get().paidElapsedOffsets || {})[sessionId] || 0;
            const effectiveElapsed = currentElapsedOffset > 0 ? Math.max(0, nowElapsed - currentElapsedOffset) : nowElapsed;

            const seatHoursTotal = (session.seats || []).reduce((sum, s) =>
                sum + (s.timeCharges || []).filter(tc => tc.type === 'hora').reduce((acc, tc) => acc + (Number(tc.amount) || 0), 0), 0);
            const currentHoursOffset = (get().paidHoursOffsets || {})[sessionId] || 0;
            const totalHoursPaid = (Number(session.hours_paid) || 0) + seatHoursTotal;
            const effectiveHours = Math.max(0, totalHoursPaid - currentHoursOffset);
            const remainingMins = (effectiveHours * 60) - effectiveElapsed;

            if (remainingMins <= 0) {
                // Tiempo expirado: avanzar el offset para que el nuevo tiempo arranque desde ahora
                const newElapsedOffset = nowElapsed;
                const elapsedCache = await tablesCache.getItem(scopedKey('paid_elapsed_offsets')) || {};
                elapsedCache[sessionId] = newElapsedOffset;
                await tablesCache.setItem(scopedKey('paid_elapsed_offsets'), elapsedCache);
                set({ paidElapsedOffsets: { ...get().paidElapsedOffsets, [sessionId]: newElapsedOffset } });

                // También resetear el hoursOffset para que las horas nuevas cuenten desde 0
                const hoursOffsetCache = await tablesCache.getItem(scopedKey('paid_hours_offsets')) || {};
                hoursOffsetCache[sessionId] = totalHoursPaid;
                await tablesCache.setItem(scopedKey('paid_hours_offsets'), hoursOffsetCache);
                set({ paidHoursOffsets: { ...get().paidHoursOffsets, [sessionId]: totalHoursPaid } });

                // Broadcast para sincronizar otros dispositivos
                get().realtimeChannel?.send({
                    type: 'broadcast',
                    event: 'table_elapsed_reset',
                    payload: { sessionId, elapsedOffset: newElapsedOffset, hoursOffset: totalHoursPaid }
                });
            }
        }

        if (session.paid_at) {
            const paidCache = await tablesCache.getItem(scopedKey('paid_sessions')) || {};
            delete paidCache[sessionId];
            await tablesCache.setItem(scopedKey('paid_sessions'), paidCache);
            get().realtimeChannel?.send({
                type: 'broadcast',
                event: 'table_paid_clear',
                payload: { sessionId }
            });
        }

        if (seatId) {
            const newSeats = (session.seats || []).map(s =>
                s.id === seatId
                    ? { ...s, timeCharges: [...(s.timeCharges || []), { type: 'hora', amount: additionalHours, id: 'tc-' + Date.now() }] }
                    : s
            );
            const newSessions = get().activeSessions.map(s =>
                s.id === sessionId ? { ...s, seats: newSeats, paid_at: null } : s
            );
            set({ activeSessions: newSessions });
            await tablesCache.setItem(scopedKey('active_sessions'), newSessions);
            try {
                const { error } = await supabaseCloud.from('table_sessions').update({ seats: newSeats }).eq('id', sessionId);
                if (error) throw error;
            } catch (e) {
                await get().addPendingAction({ type: 'UPDATE_SESSION', sessionId, payload: { seats: newSeats } });
            }
        } else {
            // Si estamos restando horas, primero quitar de seat timeCharges, luego de hours_paid
            let remaining = additionalHours;
            let newSeats = session.seats ? [...session.seats.map(s => ({ ...s, timeCharges: [...(s.timeCharges || [])] }))] : null;
            let seatsChanged = false;

            if (remaining < 0 && newSeats) {
                // Quitar horas de timeCharges de seats (LIFO: último agregado primero)
                for (const seat of newSeats) {
                    const hourCharges = (seat.timeCharges || []).filter(tc => tc.type === 'hora');
                    // Recorrer de último a primero
                    for (let i = hourCharges.length - 1; i >= 0 && remaining < 0; i--) {
                        const tc = hourCharges[i];
                        const tcAmount = Number(tc.amount) || 0;
                        if (tcAmount <= Math.abs(remaining)) {
                            // Quitar este timeCharge completo
                            seat.timeCharges = seat.timeCharges.filter(t => t.id !== tc.id);
                            remaining += tcAmount;
                            seatsChanged = true;
                        } else {
                            // Reducir parcialmente este timeCharge
                            seat.timeCharges = seat.timeCharges.map(t =>
                                t.id === tc.id ? { ...t, amount: tcAmount + remaining } : t
                            );
                            remaining = 0;
                            seatsChanged = true;
                        }
                    }
                }
            }

            // Lo que quede se aplica a hours_paid
            const newHours = Math.max(0, (Number(session.hours_paid) || 0) + remaining);
            const updatePayload = { hours_paid: newHours, paid_at: null };
            if (seatsChanged) updatePayload.seats = newSeats;

            const newSessions = get().activeSessions.map(s =>
                s.id === sessionId ? { ...s, ...updatePayload } : s
            );
            set({ activeSessions: newSessions });
            await tablesCache.setItem(scopedKey('active_sessions'), newSessions);
            try {
                const dbPayload = { hours_paid: newHours };
                if (seatsChanged) dbPayload.seats = newSeats;
                const { error } = await supabaseCloud.from('table_sessions').update(dbPayload).eq('id', sessionId);
                if (error) throw error;
            } catch (e) {
                const pendingPayload = { hours_paid: newHours };
                if (seatsChanged) pendingPayload.seats = newSeats;
                await get().addPendingAction({ type: 'UPDATE_SESSION', sessionId, payload: pendingPayload });
            }
        }
    },

    resetSessionAfterPayment: async (sessionId) => {
        const paidAt = new Date().toISOString();
        const session = get().activeSessions.find(s => s.id === sessionId);
        if (!session) return;

        const paidCache = await tablesCache.getItem(scopedKey('paid_sessions')) || {};
        paidCache[sessionId] = paidAt;
        await tablesCache.setItem(scopedKey('paid_sessions'), paidCache);

        const currentHours = Number(session.hours_paid) || 0;
        const offsetCache = await tablesCache.getItem(scopedKey('paid_hours_offsets')) || {};
        offsetCache[sessionId] = currentHours;
        await tablesCache.setItem(scopedKey('paid_hours_offsets'), offsetCache);
        set({ paidHoursOffsets: { ...get().paidHoursOffsets, [sessionId]: currentHours } });

        // Guardar minutos transcurridos al momento del cobro para el timer
        const elapsedAtPayment = session.started_at
            ? Math.max(0, Math.floor((new Date(paidAt) - new Date(session.started_at)) / 60000))
            : 0;
        const elapsedCache = await tablesCache.getItem(scopedKey('paid_elapsed_offsets')) || {};
        elapsedCache[sessionId] = elapsedAtPayment;
        await tablesCache.setItem(scopedKey('paid_elapsed_offsets'), elapsedCache);
        set({ paidElapsedOffsets: { ...get().paidElapsedOffsets, [sessionId]: elapsedAtPayment } });

        const hasPinas = session.game_mode === 'PINA' || Number(session.extended_times) > 0;
        if (hasPinas) {
            let currentRounds;
            if (session.game_mode === 'PINA') {
                currentRounds = 1 + (Number(session.extended_times) || 0);
            } else {
                currentRounds = Number(session.extended_times) || 0;
            }
            const roundsOffsetCache = await tablesCache.getItem(scopedKey('paid_rounds_offsets')) || {};
            roundsOffsetCache[sessionId] = currentRounds;
            await tablesCache.setItem(scopedKey('paid_rounds_offsets'), roundsOffsetCache);
            set({ paidRoundsOffsets: { ...get().paidRoundsOffsets, [sessionId]: currentRounds } });
        }

        // Limpiar timeCharges de seats para evitar doble cobro al re-cobrar
        const clearedSeats = (session.seats || []).length > 0
            ? session.seats.map(s => ({ ...s, timeCharges: [] }))
            : null;

        const updatePayload = { status: 'ACTIVE', paid_at: paidAt };
        if (clearedSeats) updatePayload.seats = clearedSeats;

        const newSessions = get().activeSessions.map(s =>
            s.id === sessionId ? { ...s, ...updatePayload } : s
        );
        set({ activeSessions: newSessions });
        await tablesCache.setItem(scopedKey('active_sessions'), newSessions);

        try {
            const dbPayload = { status: 'ACTIVE' };
            if (clearedSeats) dbPayload.seats = clearedSeats;
            const { error } = await supabaseCloud.from('table_sessions').update(dbPayload).eq('id', sessionId);
            if (error) throw error;
            get().syncTablesAndSessions();
        } catch (e) {
            const pendingPayload = { status: 'ACTIVE' };
            if (clearedSeats) pendingPayload.seats = clearedSeats;
            await get().addPendingAction({ type: 'UPDATE_SESSION', sessionId, payload: pendingPayload });
        }

        get().realtimeChannel?.send({
            type: 'broadcast',
            event: 'table_payment_reset',
            payload: {
                sessionId,
                paidAt,
                hoursOffset: currentHours,
                elapsedAtPayment,
                roundsOffset: hasPinas ? (session.game_mode === 'PINA' ? 1 + (Number(session.extended_times) || 0) : Number(session.extended_times) || 0) : 0,
                hasPinas,
                clearedSeats: clearedSeats || null
            }
        });
    },

    addRoundToSession: async (sessionId, seatId = null) => {
        const session = get().activeSessions.find(s => s.id === sessionId);
        if (!session) return;
        const tableName = get().tables.find(t => t.id === session.table_id)?.name ?? session.table_id;

        if (session.paid_at) {
            const paidCache = await tablesCache.getItem(scopedKey('paid_sessions')) || {};
            delete paidCache[sessionId];
            await tablesCache.setItem(scopedKey('paid_sessions'), paidCache);
            get().realtimeChannel?.send({
                type: 'broadcast',
                event: 'table_paid_clear',
                payload: { sessionId }
            });
        }

        if (seatId) {
            const newSeats = (session.seats || []).map(s =>
                s.id === seatId
                    ? { ...s, timeCharges: [...(s.timeCharges || []), { type: 'pina', amount: 1, id: 'tc-' + Date.now() }] }
                    : s
            );
            const newSessions = get().activeSessions.map(s =>
                s.id === sessionId ? { ...s, seats: newSeats, paid_at: null } : s
            );
            set({ activeSessions: newSessions });
            await tablesCache.setItem(scopedKey('active_sessions'), newSessions);
            logEvent('MESAS', 'MESA_PIÑA_AGREGADA', `Mesa ${tableName} · Piña añadida a cliente`, getUser(), { sessionId, seatId });
            try {
                const { error } = await supabaseCloud.from('table_sessions').update({ seats: newSeats }).eq('id', sessionId);
                if (error) throw error;
            } catch (e) {
                await get().addPendingAction({ type: 'UPDATE_SESSION', sessionId, payload: { seats: newSeats } });
            }
        } else {
            const newRounds = (Number(session.extended_times) || 0) + 1;
            const newSessions = get().activeSessions.map(s =>
                s.id === sessionId ? { ...s, extended_times: newRounds, paid_at: null } : s
            );
            set({ activeSessions: newSessions });
            await tablesCache.setItem(scopedKey('active_sessions'), newSessions);
            logEvent('MESAS', 'MESA_PIÑA_AGREGADA', `Mesa ${tableName} · Piña añadida (total: ${newRounds})`, getUser(), { sessionId, newRounds });
            try {
                const { error } = await supabaseCloud.from('table_sessions').update({ extended_times: newRounds }).eq('id', sessionId);
                if (error) throw error;
            } catch (e) {
                await get().addPendingAction({ type: 'UPDATE_SESSION', sessionId, payload: { extended_times: newRounds } });
            }
        }
    },

    addPinaToSession: async (sessionId, seatId = null) => {
        const session = get().activeSessions.find(s => s.id === sessionId);
        if (!session) return;

        if (seatId) {
            return get().addRoundToSession(sessionId, seatId);
        }

        if (session.game_mode === 'PINA' || Number(session.extended_times) > 0) {
            return get().addRoundToSession(sessionId);
        }

        const newExtendedTimes = 1;
        const tableName = get().tables.find(t => t.id === session.table_id)?.name ?? session.table_id;

        if (session.paid_at) {
            const paidCache = await tablesCache.getItem(scopedKey('paid_sessions')) || {};
            delete paidCache[sessionId];
            await tablesCache.setItem(scopedKey('paid_sessions'), paidCache);
            get().realtimeChannel?.send({
                type: 'broadcast',
                event: 'table_paid_clear',
                payload: { sessionId }
            });
        }

        const newSessions = get().activeSessions.map(s =>
            s.id === sessionId ? { ...s, extended_times: newExtendedTimes, paid_at: null } : s
        );
        set({ activeSessions: newSessions });
        await tablesCache.setItem(scopedKey('active_sessions'), newSessions);

        logEvent('MESAS', 'MESA_PIÑA_AGREGADA', `Mesa ${tableName} · Primera piña añadida (modo mixto)`, getUser(), { sessionId });

        try {
            const { error } = await supabaseCloud.from('table_sessions').update({ extended_times: newExtendedTimes }).eq('id', sessionId);
            if (error) throw error;
        } catch (e) {
            await get().addPendingAction({ type: 'UPDATE_SESSION', sessionId, payload: { extended_times: newExtendedTimes } });
        }
    },

    removeRoundFromSession: async (sessionId) => {
        const session = get().activeSessions.find(s => s.id === sessionId);
        if (!session) return;
        const newRounds = Math.max(0, (Number(session.extended_times) || 0) - 1);
        const tableName = get().tables.find(t => t.id === session.table_id)?.name ?? session.table_id;

        const newSessions = get().activeSessions.map(s => s.id === sessionId ? { ...s, extended_times: newRounds } : s);
        set({ activeSessions: newSessions });
        await tablesCache.setItem(scopedKey('active_sessions'), newSessions);

        logEvent('MESAS', 'MESA_PIÑA_QUITADA', `Mesa ${tableName} · Piña removida (total: ${newRounds})`, getUser(), { sessionId, newRounds });

        try {
            const { error } = await supabaseCloud.from('table_sessions').update({ extended_times: newRounds }).eq('id', sessionId);
            if (error) throw error;
        } catch (e) {
            await get().addPendingAction({ type: 'UPDATE_SESSION', sessionId, payload: { extended_times: newRounds } });
        }
    },
});
