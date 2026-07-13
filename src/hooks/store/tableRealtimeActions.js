import { supabaseCloud } from '../../config/supabaseCloud';
import { useAuthStore } from './authStore';
import { getServerNow } from '../../utils/serverClock';

export const createRealtimeActions = (set, get, tablesCache, scopedKey) => {
    let lastRequestTime = 0;

    return {
        subscribeToRealtime: () => {
        if (get().realtimeChannel) return;

        // Scope channel by userId to prevent cross-account notification leaks
        const userId = useAuthStore.getState().cloudSession?.user?.id;
        const channelName = userId ? `pool_tables_sync_v2:${userId}` : 'pool_tables_sync_v2';

        // Filtro server-side por dueño: sin esto, el WAL de realtime empuja a este
        // cliente CADA cambio de fila de TODAS las cuentas del proyecto (RLS solo
        // filtra en lectura, no el stream). Con el filtro, Postgres solo serializa
        // y envía las filas propias → recorta el Realtime Egress drásticamente.
        // Fallback sin filtro si aún no hay userId (no rompe el arranque).
        const ownerFilter = (table) => userId
            ? { event: '*', schema: 'public', table, filter: `user_id=eq.${userId}` }
            : { event: '*', schema: 'public', table };

        const debouncedSync = () => {
            clearTimeout(get()._syncTimeout);
            const t = setTimeout(() => get().syncTablesAndSessions(), 300);
            set({ _syncTimeout: t });
        };

        const channel = supabaseCloud
            .channel(channelName)
            .on('broadcast', { event: 'table_pause' }, ({ payload }) => {
                console.log("[REALTIME] broadcast table_pause:", payload);
                if (payload?.sessionId) {
                    set(state => ({
                        pausedSessions: {
                            ...state.pausedSessions,
                            [payload.sessionId]: { isPaused: true, elapsedAtPause: payload.elapsedAtPause }
                        }
                    }));
                }
            })
            .on('broadcast', { event: 'table_resume' }, ({ payload }) => {
                console.log("[REALTIME] broadcast table_resume:", payload);
                if (payload?.sessionId) {
                    set(state => {
                        const { [payload.sessionId]: _, ...rest } = state.pausedSessions;
                        return { pausedSessions: rest };
                    });
                }
            })
            .on('broadcast', { event: 'table_pause_state_request' }, () => {
                const paused = get().pausedSessions;
                if (Object.keys(paused).length > 0) {
                    get().realtimeChannel?.send({
                        type: 'broadcast',
                        event: 'table_pause_state_sync',
                        payload: { pausedSessions: paused }
                    });
                }
            })
            .on('broadcast', { event: 'table_pause_state_sync' }, ({ payload }) => {
                console.log("[REALTIME] broadcast table_pause_state_sync:", payload);
                if (payload?.pausedSessions) {
                    set(state => ({
                        pausedSessions: { ...payload.pausedSessions, ...state.pausedSessions }
                    }));
                }
            })
            .on('broadcast', { event: 'table_checkout_request' }, async ({ payload }) => {
                console.log("[REALTIME] broadcast table_checkout_request:", payload);
                if (!payload?.sessionId) return;
                const { sessionId, tableId, notes, demotedIds = [] } = payload;
                const newSessions = get().activeSessions.map(s => {
                    if (s.id === sessionId) return { ...s, status: 'CHECKOUT', ...(notes !== undefined ? { notes } : {}) };
                    if (demotedIds.includes(s.id) || (s.table_id === tableId && s.status === 'CHECKOUT')) return { ...s, status: 'ACTIVE' };
                    return s;
                });
                set({ activeSessions: newSessions });
                await tablesCache.setItem(scopedKey('active_sessions'), newSessions);
            })
            .on('broadcast', { event: 'table_checkout_cancel' }, async ({ payload }) => {
                console.log("[REALTIME] broadcast table_checkout_cancel:", payload);
                if (!payload?.sessionId) return;
                const newSessions = get().activeSessions.map(s =>
                    s.id === payload.sessionId ? { ...s, status: 'ACTIVE' } : s
                );
                set({ activeSessions: newSessions });
                await tablesCache.setItem(scopedKey('active_sessions'), newSessions);
            })
            .on('broadcast', { event: 'table_payment_reset' }, async ({ payload }) => {
                console.log("[REALTIME] broadcast table_payment_reset:", payload);
                if (!payload?.sessionId) return;
                const { sessionId, paidAt, hoursOffset, elapsedAtPayment, roundsOffset, hasPinas, clearedSeats, notes } = payload;

                const paidCache = await tablesCache.getItem(scopedKey('paid_sessions')) || {};
                paidCache[sessionId] = paidAt;
                await tablesCache.setItem(scopedKey('paid_sessions'), paidCache);

                const offsetCache = await tablesCache.getItem(scopedKey('paid_hours_offsets')) || {};
                offsetCache[sessionId] = hoursOffset;
                await tablesCache.setItem(scopedKey('paid_hours_offsets'), offsetCache);
                set(state => ({ paidHoursOffsets: { ...state.paidHoursOffsets, [sessionId]: hoursOffset } }));

                if (elapsedAtPayment != null) {
                    const elapsedCache = await tablesCache.getItem(scopedKey('paid_elapsed_offsets')) || {};
                    elapsedCache[sessionId] = elapsedAtPayment;
                    await tablesCache.setItem(scopedKey('paid_elapsed_offsets'), elapsedCache);
                    set(state => ({ paidElapsedOffsets: { ...state.paidElapsedOffsets, [sessionId]: elapsedAtPayment } }));
                }

                if (hasPinas) {
                    const roundsOffsetCache = await tablesCache.getItem(scopedKey('paid_rounds_offsets')) || {};
                    roundsOffsetCache[sessionId] = roundsOffset;
                    await tablesCache.setItem(scopedKey('paid_rounds_offsets'), roundsOffsetCache);
                    set(state => ({ paidRoundsOffsets: { ...state.paidRoundsOffsets, [sessionId]: roundsOffset } }));
                }

                const newSessions = get().activeSessions.map(s =>
                    s.id === sessionId ? { ...s, paid_at: paidAt, status: 'ACTIVE', ...(clearedSeats ? { seats: clearedSeats } : {}), notes: notes !== undefined ? notes : s.notes } : s
                );
                set({ activeSessions: newSessions });
                await tablesCache.setItem(scopedKey('active_sessions'), newSessions);
            })
            .on('broadcast', { event: 'table_offsets_state_request' }, async () => {
                const paidHoursOffsets = get().paidHoursOffsets;
                const paidRoundsOffsets = get().paidRoundsOffsets;
                const paidElapsedOffsets = get().paidElapsedOffsets || {};
                const paidCache = await tablesCache.getItem(scopedKey('paid_sessions')) || {};
                if (Object.keys(paidHoursOffsets).length > 0 || Object.keys(paidRoundsOffsets).length > 0) {
                    get().realtimeChannel?.send({
                        type: 'broadcast',
                        event: 'table_offsets_state_sync',
                        payload: { paidHoursOffsets, paidRoundsOffsets, paidElapsedOffsets, paidSessions: paidCache }
                    });
                }
            })
            .on('broadcast', { event: 'table_offsets_state_sync' }, async ({ payload }) => {
                console.log("[REALTIME] broadcast table_offsets_state_sync:", payload);
                if (!payload) return;
                const { paidHoursOffsets: remoteHours, paidRoundsOffsets: remoteRounds, paidElapsedOffsets: remoteElapsed, paidSessions: remotePaid } = payload;

                if (remoteHours) {
                    const localOffsets = { ...get().paidHoursOffsets };
                    const merged = { ...remoteHours, ...localOffsets };
                    set({ paidHoursOffsets: merged });
                    await tablesCache.setItem(scopedKey('paid_hours_offsets'), merged);
                }
                if (remoteRounds) {
                    const localRounds = { ...get().paidRoundsOffsets };
                    const merged = { ...remoteRounds, ...localRounds };
                    set({ paidRoundsOffsets: merged });
                    await tablesCache.setItem(scopedKey('paid_rounds_offsets'), merged);
                }
                if (remoteElapsed) {
                    const localElapsed = { ...(get().paidElapsedOffsets || {}) };
                    const merged = { ...remoteElapsed, ...localElapsed };
                    set({ paidElapsedOffsets: merged });
                    await tablesCache.setItem(scopedKey('paid_elapsed_offsets'), merged);
                }
                if (remotePaid) {
                    const localPaid = await tablesCache.getItem(scopedKey('paid_sessions')) || {};
                    const mergedPaid = { ...remotePaid, ...localPaid };
                    await tablesCache.setItem(scopedKey('paid_sessions'), mergedPaid);
                    set(state => ({
                        activeSessions: state.activeSessions.map(s =>
                            mergedPaid[s.id] ? { ...s, paid_at: mergedPaid[s.id] } : s
                        )
                    }));
                }
            })
            .on('broadcast', { event: 'table_paid_clear' }, async ({ payload }) => {
                console.log("[REALTIME] broadcast table_paid_clear:", payload);
                if (!payload?.sessionId) return;
                const { sessionId } = payload;
                const paidCache = await tablesCache.getItem(scopedKey('paid_sessions')) || {};
                if (paidCache[sessionId]) {
                    delete paidCache[sessionId];
                    await tablesCache.setItem(scopedKey('paid_sessions'), paidCache);
                }
                set(state => ({
                    activeSessions: state.activeSessions.map(s =>
                        s.id === sessionId ? { ...s, paid_at: null } : s
                    )
                }));
            })
            .on('broadcast', { event: 'table_elapsed_reset' }, async ({ payload }) => {
                console.log("[REALTIME] broadcast table_elapsed_reset:", payload);
                if (!payload?.sessionId) return;
                const { sessionId, elapsedOffset, hoursOffset } = payload;

                const elapsedCache = await tablesCache.getItem(scopedKey('paid_elapsed_offsets')) || {};
                elapsedCache[sessionId] = elapsedOffset;
                await tablesCache.setItem(scopedKey('paid_elapsed_offsets'), elapsedCache);
                set(state => ({ paidElapsedOffsets: { ...state.paidElapsedOffsets, [sessionId]: elapsedOffset } }));

                if (hoursOffset != null) {
                    const offsetCache = await tablesCache.getItem(scopedKey('paid_hours_offsets')) || {};
                    offsetCache[sessionId] = hoursOffset;
                    await tablesCache.setItem(scopedKey('paid_hours_offsets'), offsetCache);
                    set(state => ({ paidHoursOffsets: { ...state.paidHoursOffsets, [sessionId]: hoursOffset } }));
                }
            })
            .on('broadcast', { event: 'table_offsets_clear' }, async ({ payload }) => {
                console.log("[REALTIME] broadcast table_offsets_clear:", payload);
                if (!payload?.sessionId) return;
                const { sessionId } = payload;

                const paidCache = await tablesCache.getItem(scopedKey('paid_sessions')) || {};
                delete paidCache[sessionId];
                await tablesCache.setItem(scopedKey('paid_sessions'), paidCache);

                const offsetCache = await tablesCache.getItem(scopedKey('paid_hours_offsets')) || {};
                delete offsetCache[sessionId];
                await tablesCache.setItem(scopedKey('paid_hours_offsets'), offsetCache);
                set(state => {
                    const { [sessionId]: _, ...rest } = state.paidHoursOffsets;
                    return { paidHoursOffsets: rest };
                });

                const roundsOffsetCache = await tablesCache.getItem(scopedKey('paid_rounds_offsets')) || {};
                delete roundsOffsetCache[sessionId];
                await tablesCache.setItem(scopedKey('paid_rounds_offsets'), roundsOffsetCache);
                set(state => {
                    const { [sessionId]: _, ...rest } = state.paidRoundsOffsets;
                    return { paidRoundsOffsets: rest };
                });

                const elapsedOffsetCache = await tablesCache.getItem(scopedKey('paid_elapsed_offsets')) || {};
                delete elapsedOffsetCache[sessionId];
                await tablesCache.setItem(scopedKey('paid_elapsed_offsets'), elapsedOffsetCache);
                set(state => {
                    const { [sessionId]: _e, ...rest } = (state.paidElapsedOffsets || {});
                    return { paidElapsedOffsets: rest };
                });
            })
            .on('postgres_changes', ownerFilter('table_sessions'), (payload) => {
                console.log("[REALTIME] table_sessions change received:", payload);
                if (payload.eventType === 'UPDATE') {
                    const newStatus = payload.new?.status;
                    if (newStatus === 'CLOSED') {
                        // Mesa cerrada desde otro dispositivo → eliminarla del estado local
                        set(state => ({ activeSessions: state.activeSessions.filter(s => s.id !== payload.new.id) }));
                    } else {
                        set(state => {
                            const next = { activeSessions: state.activeSessions.map(s => {
                                if (s.id !== payload.new.id) return s;
                                // Preserve local-only field paid_at (not a DB column)
                                const merged = { ...payload.new };
                                if (s.paid_at && !merged.paid_at) merged.paid_at = s.paid_at;
                                return merged;
                            }) };
                            // Reflejar la pausa/reanudación al instante (sin esperar el
                            // debouncedSync de 300ms) para que el plano no siga corriendo.
                            const id = payload.new.id;
                            if (payload.new.paused_at && payload.new.started_at) {
                                next.pausedSessions = { ...state.pausedSessions, [id]: {
                                    isPaused: true,
                                    elapsedAtPause: Math.max(0, (new Date(payload.new.paused_at).getTime() - new Date(payload.new.started_at).getTime()) / 60000)
                                } };
                            } else if (state.pausedSessions[id]) {
                                const { [id]: _, ...rest } = state.pausedSessions;
                                next.pausedSessions = rest;
                            }
                            return next;
                        });
                    }
                } else if (payload.eventType === 'INSERT') {
                    // Solo agregar si está activa (no insertar sesiones cerradas)
                    if (payload.new?.status === 'ACTIVE' || payload.new?.status === 'CHECKOUT') {
                        set(state => ({ activeSessions: [...state.activeSessions.filter(s => s.id !== payload.new.id), payload.new] }));
                    }
                } else if (payload.eventType === 'DELETE') {
                    set(state => ({ activeSessions: state.activeSessions.filter(s => s.id !== payload.old.id) }));
                }
                debouncedSync();
            })
            .on('postgres_changes', ownerFilter('tables'), (payload) => {
                console.log("[REALTIME] tables change received:", payload);
                if (payload.eventType === 'UPDATE') {
                    set(state => ({ tables: state.tables.map(t => t.id === payload.new.id ? payload.new : t) }));
                } else if (payload.eventType === 'INSERT') {
                    set(state => ({ tables: [...state.tables.filter(t => t.id !== payload.new.id), payload.new] }));
                } else if (payload.eventType === 'DELETE') {
                    set(state => ({ tables: state.tables.filter(t => t.id !== payload.old.id) }));
                }
                debouncedSync();
            })
            .on('postgres_changes', ownerFilter('pool_config'), (payload) => {
                console.log("[REALTIME] pool_config change received:", payload);
                if (payload.eventType === 'UPDATE' && payload.new) {
                    set(state => ({
                        config: {
                            pricePerHour: Number(payload.new.price_per_hour) || state.config.pricePerHour,
                            pricePerHourBs: payload.new.price_per_hour_bs !== undefined ? Number(payload.new.price_per_hour_bs) : state.config.pricePerHourBs,
                            pricePina: Number(payload.new.price_pina) || state.config.pricePina,
                            pricePinaBs: payload.new.price_pina_bs !== undefined ? Number(payload.new.price_pina_bs) : state.config.pricePinaBs,
                            tableTaxType: payload.new.table_tax_type || state.config.tableTaxType || 'exento',
                            tableTaxMode: payload.new.table_tax_mode || state.config.tableTaxMode || 'inclusive'
                        }
                    }));
                }
                debouncedSync();
            })
            .subscribe((status) => {
                console.log("[REALTIME] status pool_tables_sync_v2:", status);
                if (status === 'SUBSCRIBED') {
                    // Re-pull AUTORITATIVO desde la DB en CADA (re)conexión.
                    // postgres_changes NO reenvía los eventos perdidos durante un corte
                    // de red (típico en escritorio remoto), así que tras reconectar hay
                    // que volver a traer las sesiones para no quedar desfasado ni mostrar
                    // mesas que ya se cerraron/cobraron en otro equipo.
                    get().syncTablesAndSessions();

                    const now = Date.now();
                    if (now - lastRequestTime > 30000) { // 30 seconds rate-limit
                        lastRequestTime = now;
                        setTimeout(() => {
                            channel.send({
                                type: 'broadcast',
                                event: 'table_pause_state_request',
                                payload: {}
                            });
                            channel.send({
                                type: 'broadcast',
                                event: 'table_offsets_state_request',
                                payload: {}
                            });
                        }, 500);
                    } else {
                        console.log("[REALTIME] Ignorando table_state_request por rate-limit (último hace < 30s)");
                    }
                }
            });
        set({ realtimeChannel: channel });
    },

    unsubscribeFromRealtime: () => {
        clearTimeout(get()._syncTimeout);
        if (get().realtimeChannel) {
            supabaseCloud.removeChannel(get().realtimeChannel);
            set({ realtimeChannel: null, _syncTimeout: null });
        }
    },

    destroy: () => {
        get().unsubscribeFromRealtime();
        const handler = get()._onlineHandler;
        if (handler && typeof window !== 'undefined') {
            window.removeEventListener('online', handler);
            set({ _onlineHandler: null });
        }
    },

    pauseSession: async (sessionId, elapsedAtPause) => {
        const session = get().activeSessions.find(s => s.id === sessionId);
        // paused_at exacto = started_at + elapsedAtPause, para que el elapsed derivado
        // en cualquier dispositivo (paused_at - started_at) coincida con el punto pausado.
        const pausedAtISO = session?.started_at
            ? new Date(new Date(session.started_at).getTime() + elapsedAtPause * 60000).toISOString()
            : new Date(getServerNow()).toISOString();

        // Estado volátil (feedback instantáneo local) + marca DURABLE en la sesión.
        // _pendingSync evita que un sync concurrente revierta el paused_at recién puesto.
        set(state => ({
            pausedSessions: {
                ...state.pausedSessions,
                [sessionId]: { isPaused: true, elapsedAtPause }
            },
            activeSessions: state.activeSessions.map(s =>
                s.id === sessionId ? { ...s, paused_at: pausedAtISO, _pendingSync: true } : s
            )
        }));
        await tablesCache.setItem(scopedKey('active_sessions'), get().activeSessions);
        await tablesCache.setItem(scopedKey('paused_sessions'), get().pausedSessions);

        // Broadcast: sigue como aceleración; la fuente de verdad ahora es paused_at.
        get().realtimeChannel?.send({
            type: 'broadcast',
            event: 'table_pause',
            payload: { sessionId, elapsedAtPause }
        });

        try {
            const { error } = await supabaseCloud.from('table_sessions').update({ paused_at: pausedAtISO }).eq('id', sessionId);
            if (error) throw error;
            set(state => ({
                activeSessions: state.activeSessions.map(s => s.id === sessionId ? { ...s, _pendingSync: false } : s)
            }));
            await tablesCache.setItem(scopedKey('active_sessions'), get().activeSessions);
        } catch (e) {
            console.warn('Pausa en nube fallida, encolada:', e);
            await get().addPendingAction({ type: 'UPDATE_SESSION', sessionId, payload: { paused_at: pausedAtISO } });
        }
    },

    resumeSession: async (sessionId) => {
        const pauseData = get().pausedSessions[sessionId];
        const session = get().activeSessions.find(s => s.id === sessionId);
        // Se recalcula started_at contra getServerNow() —el MISMO reloj que usa el display—
        // para que el timer reanude exactamente en el segundo pausado y no "retroceda" por
        // el desfase entre el reloj local y el del servidor. elapsedAtPause está en minutos.
        // Fallback: si no hay pauseData volátil pero la sesión tiene paused_at durable,
        // se deriva el elapsed congelado de ahí.
        let elapsedAtPause = pauseData?.elapsedAtPause;
        if (elapsedAtPause == null && session?.paused_at && session?.started_at) {
            elapsedAtPause = Math.max(0, (new Date(session.paused_at).getTime() - new Date(session.started_at).getTime()) / 60000);
        }

        const newStartedAt = session && elapsedAtPause != null
            ? new Date(getServerNow() - elapsedAtPause * 60000).toISOString()
            : session?.started_at;

        // Update optimista: started_at recalculado + paused_at limpiado, en un solo write.
        set(state => {
            const { [sessionId]: _, ...rest } = state.pausedSessions;
            return {
                pausedSessions: rest,
                activeSessions: state.activeSessions.map(s =>
                    s.id === sessionId ? { ...s, started_at: newStartedAt, paused_at: null, _pendingSync: true } : s
                )
            };
        });
        await tablesCache.setItem(scopedKey('active_sessions'), get().activeSessions);
        await tablesCache.setItem(scopedKey('paused_sessions'), get().pausedSessions);

        get().realtimeChannel?.send({
            type: 'broadcast',
            event: 'table_resume',
            payload: { sessionId }
        });

        const payload = { started_at: newStartedAt, paused_at: null };
        try {
            const { error } = await supabaseCloud.from('table_sessions').update(payload).eq('id', sessionId);
            if (error) throw error;
            set(state => ({
                activeSessions: state.activeSessions.map(s => s.id === sessionId ? { ...s, _pendingSync: false } : s)
            }));
            await tablesCache.setItem(scopedKey('active_sessions'), get().activeSessions);
        } catch (e) {
            console.warn('Reanudar en nube fallido, encolado:', e);
            await get().addPendingAction({ type: 'UPDATE_SESSION', sessionId, payload });
        }
    },
};
};
