import { create } from 'zustand';
import localforage from 'localforage';
import { supabaseCloud } from '../../config/supabaseCloud';
import { logEvent } from '../../services/auditService';
import { scopedKey } from './accountScope';
import { useAuthStore } from './authStore';

// Helper: obtener user_id del usuario Supabase autenticado
const getAuthUserId = async () => {
    try {
        const { data: { session } } = await supabaseCloud.auth.getSession();
        return session?.user?.id || null;
    } catch { return null; }
};

// Dedicated offline cache for cash session state
const cashCache = localforage.createInstance({
    name: "PoolLosDiaz",
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

export const useCashStore = create((set, get) => ({
    activeCashSession: null,
    loading: true,

    init: async () => {
        set({ loading: true });
        try {
            // 1. Mostrar caché local inmediatamente — UI no bloquea al usuario
            const cachedSession = await cashCache.getItem(scopedKey('active_cash_session'));
            set({ activeCashSession: cachedSession, loading: false });

            // 2. Sincronizar desde la nube para obtener el estado real
            await get().syncCashSession();

            // 3. Triple redundancia para multi-dispositivo:
            get()._subscribeRealtime();   // Capa A: Realtime Supabase (instantáneo si habilitado)
            get()._startPolling();        // Capa B: Polling cada 45s (fallback garantizado)
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

            // Filtrar por user_id si la columna existe (nueva funcionalidad)
            if (userId) query = query.eq('user_id', userId);

            const { data, error } = await query.maybeSingle();

            // Si hay error, mantener estado local (puede ser RLS, offline, etc.)
            if (error) throw error;

            if (data) {
                // Hay sesión activa en la nube — sincronizar
                // Restaurar base_bs: preferir columna directa, fallback a notes (legacy)
                let enrichedData = { ...data };
                if (data.base_bs !== undefined && data.base_bs !== null) {
                    // Columna base_bs existe — usar directamente
                } else if (data.notes) {
                    try {
                        const parsed = typeof data.notes === 'string' ? JSON.parse(data.notes) : data.notes;
                        if (parsed?.base_bs !== undefined) {
                            enrichedData.base_bs = parsed.base_bs;
                        }
                    } catch {
                        // notes no es JSON válido — ignorar
                    }
                }
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

    // Capa A: Realtime de Supabase — instantáneo si la tabla tiene replication activo
    _subscribeRealtime: () => {
        if (cashRealtimeChannel) return;
        const userId = useAuthStore.getState().cloudSession?.user?.id;
        const channelName = userId ? `cash_sessions_realtime:${userId}` : 'cash_sessions_realtime';
        cashRealtimeChannel = supabaseCloud
            .channel(channelName)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'cash_sessions',
            }, async () => {
                await get().syncCashSession();
            })
            .subscribe();
    },

    // Capa B: Polling cada 15s — garantiza sync aunque el realtime falle
    _startPolling: () => {
        if (cashPollingInterval) return;
        cashPollingInterval = setInterval(() => {
            get().syncCashSession();
        }, 60_000);
    },

    // Capa C: Al volver al primer plano — crítico para PWA en móvil
    _subscribeVisibility: () => {
        if (typeof document === 'undefined' || cashVisibilityBound) return;
        cashVisibilityBound = true;
        cashVisibilityHandler = () => {
            if (document.visibilityState === 'visible') {
                // Sincronizar inmediatamente al volver al primer plano (force=true)
                if (cashVisibilityTimer) clearTimeout(cashVisibilityTimer);
                cashVisibilityTimer = setTimeout(() => {
                    get().syncCashSession(true);
                }, 500);
            }
        };
        document.addEventListener('visibilitychange', cashVisibilityHandler);
    },

    openCashSession: async (baseUsd, baseBs, openedBy, openedByRole) => {
        const userId = await getAuthUserId();
        const sessionPayload = {
            id: crypto.randomUUID(),
            opened_at: new Date().toISOString(),
            opened_by: openedBy,
            base_usd: baseUsd || 0,
            base_bs: baseBs || 0,
            status: 'OPEN'
        };

        // Actualizar UI y caché local inmediatamente
        await cashCache.setItem(scopedKey('active_cash_session'), sessionPayload);
        set({ activeCashSession: sessionPayload });

        // Payload para Supabase: incluye base_bs como columna directa + notes como fallback
        const supabasePayload = {
            id: sessionPayload.id,
            opened_at: sessionPayload.opened_at,
            opened_by: sessionPayload.opened_by,
            base_usd: sessionPayload.base_usd,
            base_bs: sessionPayload.base_bs,
            status: sessionPayload.status,
            notes: JSON.stringify({ base_bs: sessionPayload.base_bs }),
        };
        if (userId) supabasePayload.user_id = userId;

        try {
            const { error } = await supabaseCloud.from('cash_sessions').insert(supabasePayload);
            if (error) console.warn('[Caja] Error al subir apertura a nube:', error.message);
            else console.log('[Caja] Apertura sincronizada en la nube ✓');
        } catch (err) {
            console.warn('[Caja] Sin conexión — apertura guardada localmente:', err);
        }

        logEvent('VENTA', 'APERTURA_CAJA', `Caja abierta — Base: $${baseUsd} / Bs${baseBs}`, { nombre: openedBy, rol: openedByRole || 'DESCONOCIDO' }, { baseUsd, baseBs, sessionId: sessionPayload.id, openedByRole });
    },

    closeCashSession: async (stats, closedBy) => {
        const active = get().activeCashSession;
        if (!active) return;

        // Limpiar local inmediatamente para desbloquear la UI al instante
        await cashCache.removeItem(scopedKey('active_cash_session'));
        set({ activeCashSession: null });

        // Cleanup: detener polling y realtime para no sincronizar data fantasma
        if (cashPollingInterval) {
            clearInterval(cashPollingInterval);
            cashPollingInterval = null;
        }
        if (cashRealtimeChannel) {
            cashRealtimeChannel.unsubscribe();
            cashRealtimeChannel = null;
        }

        try {
            const { error } = await supabaseCloud
                .from('cash_sessions')
                .update({
                    closed_at: new Date().toISOString(),
                    closed_by: closedBy,
                    status: 'CLOSED',
                })
                .eq('id', active.id);

            if (error) console.warn('[Caja] Error al cerrar sesión en nube:', error.message);
            else console.log('[Caja] Cierre sincronizado en la nube ✓');
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
            cashRealtimeChannel.unsubscribe();
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

// Inicializar al cargar el módulo
useCashStore.getState().init();
