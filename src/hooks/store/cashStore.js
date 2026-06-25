import { create } from 'zustand';
import localforage from 'localforage';
import { supabaseCloud } from '../../config/supabaseCloud';
import { logEvent } from '../../services/auditService';
import { scopedKey } from './accountScope';

// Helper: obtener user_id del usuario Supabase autenticado
const getAuthUserId = async () => {
    try {
        const { data: { session } } = await supabaseCloud.auth.getSession();
        return session?.user?.id || null;
    } catch { return null; }
};

// Dedicated offline cache for cash session state
const cashCache = localforage.createInstance({
    name: "PoolImperial",
    storeName: "cash_cache"
});

// Singletons para no crear duplicados entre re-renders
let cashRealtimeChannel = null;
let cashPollingInterval = null;
let cashVisibilityBound = false;
let cashVisibilityTimer = null;
let cashVisibilityHandler = null;
let lastSyncTime = 0;
const SYNC_DEBOUNCE = 3000; // No sincronizar más de una vez cada 3s

// userId cacheado al hacer init() para acceso síncrono en _subscribeRealtime
let cachedUserId = null;

// Clave para reintentar el insert de apertura de caja offline
const PENDING_CASH_KEY = 'poolbar_pending_cash_open';

export const useCashStore = create((set, get) => ({
    activeCashSession: null,
    loading: true,

    init: async () => {
        set({ loading: true });
        try {
            // 0. Resolver userId y cachearlo para acceso síncrono posterior
            cachedUserId = await getAuthUserId();

            // 1. Leer caché local primero (para mostrar algo mientras esperamos la nube)
            const cachedSession = await cashCache.getItem(scopedKey('active_cash_session'));
            // Ponemos el caché local PERO mantenemos loading:true hasta confirmar con la nube
            set({ activeCashSession: cachedSession });

            // 2. Intentar subir apertura pendiente (si hubo falla offline previa)
            await get()._retryPendingOpen();

            // 3. Sincronizar desde la nube para obtener el estado real
            // loading: false recién aquí — el Guard espera este momento para decidir
            await get().syncCashSession(true);
            set({ loading: false });

            // 4. Triple redundancia para multi-dispositivo:
            get()._subscribeRealtime();   // Capa A: Broadcast + postgres_changes
            get()._startPolling();        // Capa B: Polling cada 30s (fallback garantizado)
            get()._subscribeVisibility(); // Capa C: Al volver al primer plano (clave en móviles)
        } catch (error) {
            console.error('[Caja] Error de inicialización:', error);
            set({ loading: false });
        }
    },

    // Consulta directa a Supabase y actualiza el estado local
    syncCashSession: async (force = false) => {
        // Debounce: no sincronizar si ya se hizo recientemente (salvo force)
        const now = Date.now();
        if (!force && now - lastSyncTime < SYNC_DEBOUNCE) return;
        lastSyncTime = now;

        try {
            const userId = await getAuthUserId();
            let query = supabaseCloud
                .from('cash_sessions')
                .select('*')
                .eq('status', 'OPEN')
                .order('opened_at', { ascending: false })
                .limit(1);

            // Filtrar por user_id — misma cuenta, cualquier dispositivo
            if (userId) query = query.eq('user_id', userId);

            const { data, error } = await query.maybeSingle();

            // Si hay error, mantener estado local (puede ser RLS, offline, etc.)
            if (error) throw error;

            if (data) {
                // Hay sesión activa en la nube — sincronizar
                const enrichedData = {
                    id: data.id,
                    opened_at: data.opened_at,
                    closed_at: data.closed_at,
                    status: data.status,
                    user_id: data.user_id,
                    base_usd: data.initial_cash_usd || 0, // Almacena COP por compatibilidad
                    base_bs: 0,                           // Bs no existe en Pool Imperial
                    opened_by: 'Caja'                     // Por defecto, ya que no se almacena en la DB
                };
                await cashCache.setItem(scopedKey('active_cash_session'), enrichedData);
                set({ activeCashSession: enrichedData });
            } else {
                // ⚠️  La nube devolvió null. Puede ser:
                //   (a) No hay sesión abierta (correcto → limpiar local)
                //   (b) RLS bloquea el SELECT (falso negativo → NO limpiar local)
                //
                // Para distinguir (a) de (b): verificamos si la sesión local existe
                // con un ID conocido. Si la buscamos en la nube por su ID y tampoco
                // la encontramos, asumimos que no existe. Si ni siquiera podemos buscar,
                // mantenemos el estado local como verdad.
                const cachedSession = await cashCache.getItem(scopedKey('active_cash_session'));
                if (cachedSession?.id) {
                    const { data: specificSession, error: specificError } = await supabaseCloud
                        .from('cash_sessions')
                        .select('id, status')
                        .eq('id', cachedSession.id)
                        .maybeSingle();

                    if (!specificError && specificSession?.status === 'CLOSED') {
                        // Confirmado: la sesión específica está cerrada → limpiar local
                        await cashCache.removeItem(scopedKey('active_cash_session'));
                        set({ activeCashSession: null });
                    } else if (!specificError && specificSession === null) {
                        // La sesión no existe en la nube en absoluto (fue de otro día/cuenta)
                        // Si la sesión local es muy antigua (> 24 horas), marcarla como stale
                        // pero NO borrarla — el usuario debe cerrarla explícitamente
                        const openedAt = new Date(cachedSession.opened_at).getTime();
                        const hoursAgo = (Date.now() - openedAt) / 1000 / 3600;
                        if (hoursAgo > 24 && !cachedSession.stale) {
                            console.warn('[Caja] La sesión local lleva más de 24 horas abierta y no se encontró en la nube. Marcada como stale. El usuario debe cerrarla manualmente.');
                            const staleSession = { ...cachedSession, stale: true };
                            await cashCache.setItem(scopedKey('active_cash_session'), staleSession);
                            set({ activeCashSession: staleSession });
                        }
                        // Si < 24 horas y no se encuentra, puede ser un problema de RLS → mantener
                    }
                    // Si specificError → no podemos confirmar estado → mantener local
                } else {
                    // No había caché local tampoco → estado correcto (sin caja)
                    set({ activeCashSession: null });
                }
            }
        } catch {
            // Offline o error de red: mantener caché local sin modificar
            const cachedSession = await cashCache.getItem(scopedKey('active_cash_session'));
            if (cachedSession) set({ activeCashSession: cachedSession });
        }
    },

    // Capa A: Broadcast (instantáneo) + postgres_changes (si la tabla está en la publicación)
    _subscribeRealtime: () => {
        if (cashRealtimeChannel) return;
        // Usar userId cacheado en init() (síncrono) — mismo patrón que Pool Los Dias
        const channelName = cachedUserId ? `cash_sessions_realtime:${cachedUserId}` : 'cash_sessions_realtime';

        cashRealtimeChannel = supabaseCloud
            .channel(channelName)
            // Broadcast: notificación inmediata entre dispositivos (no requiere publicación DB)
            .on('broadcast', { event: 'cash_session_changed' }, async () => {
                console.log('[Caja] Broadcast recibido — sincronizando...');
                await get().syncCashSession(true);
            })
            // postgres_changes: backup por si la tabla está en la publicación de realtime
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'cash_sessions',
            }, async () => {
                console.log('[Caja] DB change recibido — sincronizando...');
                await get().syncCashSession(true);
            })
            .subscribe((status) => {
                console.log('[Caja] Realtime status:', status);
            });
    },

    // Capa B: Polling cada 30s — garantiza sync aunque el realtime falle
    _startPolling: () => {
        if (cashPollingInterval) return;
        cashPollingInterval = setInterval(() => {
            get().syncCashSession();
        }, 30_000);
    },

    // Reintento de insert de apertura de caja que falló por estar offline
    _retryPendingOpen: async () => {
        try {
            const pending = await cashCache.getItem(PENDING_CASH_KEY);
            if (!pending) return;
            console.log('[Caja] Reintentando apertura pendiente...');

            // Sanitizar el payload pendiente para eliminar columnas viejas o inexistentes
            const cleanPayload = {
                id: pending.id,
                opened_at: pending.opened_at,
                status: pending.status || 'OPEN',
                initial_cash_usd: pending.initial_cash_usd || pending.base_usd || 0,
                final_cash_usd: pending.final_cash_usd || 0
            };
            if (pending.user_id) cleanPayload.user_id = pending.user_id;

            const { error } = await supabaseCloud.from('cash_sessions').insert(cleanPayload);
            if (!error) {
                console.log('[Caja] Apertura pendiente sincronizada en la nube ✓');
                await cashCache.removeItem(PENDING_CASH_KEY);
                // Notificar a otros dispositivos via broadcast
                cashRealtimeChannel?.send({
                    type: 'broadcast',
                    event: 'cash_session_changed',
                    payload: { action: 'open' }
                });
            } else {
                console.warn('[Caja] Reintento fallido:', error.message);
            }
        } catch (err) {
            console.warn('[Caja] Error en reintento de apertura:', err);
        }
    },

    // Capa C: Al volver al primer plano — crítico para PWA en móvil
    _subscribeVisibility: () => {
        if (typeof document === 'undefined' || cashVisibilityBound) return;
        cashVisibilityBound = true;
        cashVisibilityHandler = () => {
            if (document.visibilityState === 'visible') {
                // Sincronizar inmediatamente al volver al primer plano (force=true)
                if (cashVisibilityTimer) clearTimeout(cashVisibilityTimer);
                cashVisibilityTimer = setTimeout(async () => {
                    await get()._retryPendingOpen(); // Reintento si hubo apertura offline
                    await get().syncCashSession(true);
                }, 500);
            }
        };
        document.addEventListener('visibilitychange', cashVisibilityHandler);

        // Capa D: Al recuperar conexión a internet — reintento automático offline→online
        const onlineHandler = async () => {
            console.log('[Caja] Reconexión detectada — reintentando pendientes...');
            await get()._retryPendingOpen();
            await get().syncCashSession(true);
        };
        window.addEventListener('online', onlineHandler);
    },

    openCashSession: async (baseUsd, baseBs, openedBy, openedByRole, openedAt) => {
        const userId = await getAuthUserId();
        const sessionPayload = {
            id: crypto.randomUUID(),
            opened_at: openedAt || new Date().toISOString(),
            opened_by: openedBy,
            base_usd: baseUsd || 0, // En Pool Imperial esto es COP
            base_bs: baseBs || 0,   // En Pool Imperial esto es USD
            status: 'OPEN'
        };

        // Actualizar UI y caché local inmediatamente
        await cashCache.setItem(scopedKey('active_cash_session'), sessionPayload);
        set({ activeCashSession: sessionPayload });

        // Payload para Supabase con columnas correctas de la DB
        const supabasePayload = {
            id: sessionPayload.id,
            opened_at: sessionPayload.opened_at,
            status: sessionPayload.status,
            initial_cash_usd: baseUsd || 0, // Almacena COP por compatibilidad
            final_cash_usd: 0
        };
        if (userId) supabasePayload.user_id = userId;

        try {
            const { error } = await supabaseCloud.from('cash_sessions').insert(supabasePayload);
            if (error) {
                console.warn('[Caja] Error al subir apertura a nube:', error.message);
                await cashCache.setItem(PENDING_CASH_KEY, supabasePayload);
            } else {
                console.log('[Caja] Apertura sincronizada en la nube ✓');
                await cashCache.removeItem(PENDING_CASH_KEY);
                cashRealtimeChannel?.send({
                    type: 'broadcast',
                    event: 'cash_session_changed',
                    payload: { action: 'open' }
                });
            }
        } catch (err) {
            console.warn('[Caja] Sin conexión — apertura guardada localmente para reintento:', err);
            await cashCache.setItem(PENDING_CASH_KEY, supabasePayload);
        }

        logEvent('VENTA', 'APERTURA_CAJA', `Caja abierta — Base: $${baseUsd} / USD ${baseBs}`, { nombre: openedBy, rol: openedByRole || 'DESCONOCIDO' }, { baseUsd, baseBs, sessionId: sessionPayload.id, openedByRole });
    },

    closeCashSession: async (stats, closedBy) => {
        const active = get().activeCashSession;
        if (!active) return;

        // Limpiar local inmediatamente para desbloquear la UI al instante
        await cashCache.removeItem(scopedKey('active_cash_session'));
        set({ activeCashSession: null });

        try {
            const finalCashCop = stats ? (stats.declaredCop || stats.declaredCOP || 0) : 0;
            const { error } = await supabaseCloud
                .from('cash_sessions')
                .update({
                    closed_at: new Date().toISOString(),
                    status: 'CLOSED',
                    final_cash_usd: finalCashCop
                })
                .eq('id', active.id);

            if (error) {
                console.warn('[Caja] Error al cerrar sesión en nube:', error.message);
            } else {
                console.log('[Caja] Cierre sincronizado en la nube ✓');
                // Notificar a todos los dispositivos conectados via broadcast
                cashRealtimeChannel?.send({
                    type: 'broadcast',
                    event: 'cash_session_changed',
                    payload: { action: 'close' }
                });
            }
        } catch (err) {
            console.warn('[Caja] Sin conexión al cerrar caja:', err);
        }

        logEvent('VENTA', 'CIERRE_CAJA_SESION', `Caja cerrada por ${closedBy}`, { nombre: closedBy }, { sessionId: active.id, stats });
    },

    destroy: () => {
        if (cashPollingInterval) {
            clearInterval(cashPollingInterval);
            cashPollingInterval = null;
        }
        if (cashRealtimeChannel) {
            try {
                supabaseCloud.removeChannel(cashRealtimeChannel);
            } catch (_) {
                try { cashRealtimeChannel.unsubscribe(); } catch (__) {}
            }
            cashRealtimeChannel = null;
        }
        if (cashVisibilityTimer) {
            clearTimeout(cashVisibilityTimer);
            cashVisibilityTimer = null;
        }
        if (cashVisibilityHandler && typeof document !== 'undefined') {
            document.removeEventListener('visibilitychange', cashVisibilityHandler);
            cashVisibilityHandler = null;
            cashVisibilityBound = false;
        }
    }
}));
// NO inicializar aquí: se llama desde useAppInit.js cuando hay sesión autenticada
// para evitar suscripciones anónimas que Supabase RLS bloquea silenciosamente.
