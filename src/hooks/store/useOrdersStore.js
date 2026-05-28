import { create } from 'zustand';
import localforage from 'localforage';
import { supabaseCloud } from '../../config/supabaseCloud';
import { scopedKey } from './accountScope';
import { useTablesStore } from './useTablesStore';

// Helper: obtener user_id del usuario Supabase autenticado
let _cachedUserId = null;
const getAuthUserId = async () => {
    try {
        const { data: { session } } = await supabaseCloud.auth.getSession();
        _cachedUserId = session?.user?.id || null;
        return _cachedUserId;
    } catch { return null; }
};

// ── Canal Broadcast para orders P2P (0 WAL egress) ──
let ordersBroadcastChannel = null;
let ordersBroadcastUserId = null;

function _getOrdersBroadcastChannel(userId) {
    if (ordersBroadcastChannel && ordersBroadcastUserId === userId) return ordersBroadcastChannel;
    if (ordersBroadcastChannel) ordersBroadcastChannel.unsubscribe();
    ordersBroadcastChannel = supabaseCloud.channel(`orders_live:${userId}`);
    ordersBroadcastUserId = userId;
    return ordersBroadcastChannel;
}

/** Notifica a otros dispositivos que las órdenes cambiaron */
async function _broadcastOrdersChanged() {
    // Resolver userId en el momento — evita race condition si _cachedUserId aún es null
    const uid = _cachedUserId || await getAuthUserId();
    if (!uid) return;
    try {
        const ch = _getOrdersBroadcastChannel(uid);
        // Solo enviar si el canal ya está suscrito; si no, el fallback WAL cubre el caso
        if (ch.state === 'joined') {
            ch.send({
                type: 'broadcast',
                event: 'orders_changed',
                payload: { ts: Date.now() },
            });
        }
    } catch (_) { /* non-fatal */ }
}

// Espera hasta que la sesión con tempId sea reemplazada por una con UUID real.
// Devuelve el UUID real, o lanza si se acaba el tiempo.
async function waitForRealSessionId(tempId, timeoutMs = 8000) {
    // Captura el table_id de la sesión temp para poder re-encontrarla después del swap
    const tempSession = useTablesStore.getState().activeSessions.find(s => s.id === tempId);
    if (!tempSession) throw new Error(`Sesión ${tempId} no encontrada`);
    const tableId = tempSession.table_id;

    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        await new Promise(r => setTimeout(r, 200));
        const sessions = useTablesStore.getState().activeSessions;
        // Si el temp ya no existe, buscar la sesión real por table_id sin temp
        const stillTemp = sessions.find(s => s.id === tempId);
        if (!stillTemp) {
            const real = sessions.find(s => s.table_id === tableId && !s.id.startsWith('temp-'));
            if (real) return real.id;
        } else if (!stillTemp.id.startsWith('temp-')) {
            return stillTemp.id;
        }
    }
    throw new Error(`Timeout esperando sync de sesión temporal ${tempId}`);
}

const ordersCache = localforage.createInstance({
    name: "PoolLosDiaz",
    storeName: "orders_cache"
});

export const useOrdersStore = create((set, get) => ({
    orders: [], // Todas las órdenes abiertas
    orderItems: [], // Todos los items pertenecientes a órdenes abiertas
    loading: true,
    realtimeChannel: null,
    _subscribing: false,

    init: async () => {
        set({ loading: true });
        try {
            const cachedOrders = await ordersCache.getItem(scopedKey('active_orders')) || [];
            const cachedItems = await ordersCache.getItem(scopedKey('active_order_items')) || [];
            set({ orders: cachedOrders, orderItems: cachedItems, loading: false });
            
            // Sync initial state
            get().syncOrders();
            // Suscribir canal realtime temprano para que esté listo antes del primer addItem
            // El guard interno evita doble suscripción si useAppInit lo llama después
            get().subscribeToRealtime();
        } catch (e) {
            console.error('Error loading orders cache:', e);
            set({ loading: false });
        }
    },

    subscribeToRealtime: () => {
        // Guard: tanto síncrono (realtimeChannel) como flag de pending para evitar race condition
        if (get().realtimeChannel || get()._subscribing) return;
        set({ _subscribing: true });

        let syncTimeout;
        let retryCount = 0;
        const MAX_RETRIES = 3;
        const debouncedSync = () => {
            clearTimeout(syncTimeout);
            syncTimeout = setTimeout(() => get().syncOrders(), 300);
        };

        // Broadcast P2P: escucha notificaciones de otros dispositivos (0 WAL egress)
        getAuthUserId().then(userId => {
            if (!userId) { set({ _subscribing: false }); return; }
            // Si mientras esperábamos ya se creó un canal, abortar
            if (get().realtimeChannel) { set({ _subscribing: false }); return; }

            const channel = _getOrdersBroadcastChannel(userId)
                .on('broadcast', { event: 'orders_changed' }, () => {
                    console.log("[REALTIME] orders broadcast received");
                    retryCount = 0;
                    debouncedSync();
                })
                // Fallback WAL: garantiza sync aunque el broadcast falle
                // (mismo patrón que table_sessions en tableRealtimeActions.js)
                .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, () => {
                    console.log('[REALTIME] order_items DB change — syncing');
                    retryCount = 0;
                    debouncedSync();
                })
                .subscribe((status) => {
                    console.log("[REALTIME] status orders_broadcast:", status);
                    if (status === 'SUBSCRIBED') {
                        retryCount = 0;
                    }
                    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                        retryCount++;
                        if (retryCount > MAX_RETRIES) {
                            console.warn(`[REALTIME] Canal orders: ${MAX_RETRIES} reintentos agotados, funcionando sin realtime`);
                            return;
                        }
                        const delay = Math.min(5000 * Math.pow(2, retryCount - 1), 30000);
                        console.warn(`[REALTIME] Error en canal orders — reintentando en ${delay / 1000}s (intento ${retryCount}/${MAX_RETRIES})`);
                        setTimeout(() => {
                            get().unsubscribeFromRealtime();
                            get().subscribeToRealtime();
                        }, delay);
                    }
                });
            set({ realtimeChannel: channel, _subscribing: false });
        }).catch(() => set({ _subscribing: false }));
    },

    unsubscribeFromRealtime: () => {
        if (get().realtimeChannel) {
            supabaseCloud.removeChannel(get().realtimeChannel);
            set({ realtimeChannel: null });
        }
        // Forzar recreación del canal broadcast en el próximo subscribe
        if (ordersBroadcastChannel) {
            try { ordersBroadcastChannel.unsubscribe(); } catch (_) {}
            ordersBroadcastChannel = null;
            ordersBroadcastUserId = null;
        }
    },

    syncOrders: async () => {
        try {
            const userId = await getAuthUserId();

            // Filtro de seguridad: solo órdenes OPEN de las últimas 48h para evitar
            // acumular cientos de IDs que superan el límite de URL de PostgREST
            const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

            let query = supabaseCloud
                .from('orders')
                .select('id, table_id, table_session_id, status, exchange_rate_used, user_id, created_at')
                .eq('status', 'OPEN')
                .gte('created_at', since);
            // NO filtrar por user_id — todos los dispositivos deben ver todas las órdenes
            // El aislamiento por cuenta ya lo garantiza RLS + el vínculo con table_sessions

            const { data: openOrders, error: orderError } = await query;
            if (orderError) throw orderError;

            const orderIds = openOrders.map(o => o.id);
            let items = [];

            if (orderIds.length > 0) {
                // Fetch order items en batches paralelos de 50 para evitar URL larga en PostgREST
                // order_items no tiene columna created_at, así que siempre usamos .in()
                const batchSize = 50;
                const batches = [];
                for (let i = 0; i < orderIds.length; i += batchSize) {
                    batches.push(orderIds.slice(i, i + batchSize));
                }
                const results = await Promise.all(
                    batches.map(batchIds =>
                        supabaseCloud
                            .from('order_items')
                            .select('id, order_id, product_id, product_name, unit_price_usd, unit_price_bs, qty, seat_id')
                            .in('order_id', batchIds)
                    )
                );
                for (const { data, error } of results) {
                    if (error) throw error;
                    items = items.concat(data || []);
                }
            }

            set({ orders: openOrders, orderItems: items });
            await ordersCache.setItem(scopedKey('active_orders'), openOrders);
            await ordersCache.setItem(scopedKey('active_order_items'), items);
            return { orders: openOrders, orderItems: items };
        } catch (err) {
            console.error('Error syncOrders:', err);
        }
    },

    getOrderBySessionId: (sessionId) => {
        return get().orders.find(o => o.table_session_id === sessionId);
    },

    getItemsByOrderId: (orderId) => {
        return get().orderItems.filter(i => i.order_id === orderId);
    },

    // Añade un ítem a la sesión (crea la orden si no existe)
    addItemToSession: async (tableId, sessionId, creatorId, productInfo, exchangeRate = 1, seatId = null) => {
        // Si la sesión aún tiene ID temporal, esperar a que sincronice con Supabase
        if (typeof sessionId === 'string' && sessionId.startsWith('temp-')) {
            try {
                sessionId = await waitForRealSessionId(sessionId);
            } catch (e) {
                console.error('Error esperando sync de sesión:', e);
                throw e;
            }
        }

        let order = get().getOrderBySessionId(sessionId);
        const userId = await getAuthUserId();

        try {
            if (!order) {
                // Crear orden
                const orderPayload = {
                    table_id: tableId,
                    table_session_id: sessionId,
                    created_by: creatorId,
                    status: 'OPEN',
                    total_usd: 0,
                    total_bs: 0,
                    exchange_rate_used: exchangeRate
                };
                if (userId) orderPayload.user_id = userId;

                const { data: newOrder, error: orderErr } = await supabaseCloud
                    .from('orders')
                    .insert([orderPayload])
                    .select()
                    .single();
                
                if (orderErr) throw orderErr;
                order = newOrder;
                const newOrders = [...get().orders, order];
                set({ orders: newOrders });
                await ordersCache.setItem(scopedKey('active_orders'), newOrders);
                _broadcastOrdersChanged();
            }

            // Chequear si el producto ya existe en la orden
            const existingItem = get().orderItems.find(i => i.order_id === order.id && i.product_id === productInfo.id && (i.seat_id || null) === (seatId || null));

            if (existingItem) {
                const { data: updatedItem, error: err } = await supabaseCloud
                    .from('order_items')
                    .update({ qty: existingItem.qty + 1 })
                    .eq('id', existingItem.id)
                    .select()
                    .single();
                if (err) throw err;
                
                const newItems = get().orderItems.map(i => i.id === updatedItem.id ? updatedItem : i);
                set({ orderItems: newItems });
                await ordersCache.setItem(scopedKey('active_order_items'), newItems);
                _broadcastOrdersChanged();
            } else {
                const { data: newItem, error: err } = await supabaseCloud
                    .from('order_items')
                    .insert([{
                        order_id: order.id,
                        product_id: productInfo.id,
                        product_name: productInfo.name,
                        unit_price_usd: productInfo.priceUsd || productInfo.priceUsdt || productInfo.price || 0,
                        unit_price_bs: productInfo.priceBs || null,
                        qty: 1,
                        added_by: creatorId,
                        ...(seatId ? { seat_id: seatId } : {})
                    }])
                    .select()
                    .single();
                
                if (err) throw err;
                const newItems = [...get().orderItems, newItem];
                set({ orderItems: newItems });
                await ordersCache.setItem(scopedKey('active_order_items'), newItems);
                _broadcastOrdersChanged();
            }

        } catch (e) {
            console.error('Error adding item to session:', e);
            throw e; // Relaunch
        }
    },

    deleteItem: async (itemId) => {
         try {
            const { error } = await supabaseCloud.from('order_items').delete().eq('id', itemId);
            if (error) throw error;
            const newItems = get().orderItems.filter(i => i.id !== itemId);
            set({ orderItems: newItems });
            await ordersCache.setItem(scopedKey('active_order_items'), newItems);
            _broadcastOrdersChanged();
         } catch (e) {
             console.error('Error deleting item:', e);
         }
    },

    updateItemQty: async (itemId, newQty) => {
        try {
            if (newQty <= 0) {
                return get().deleteItem(itemId);
            }
            const { data: updatedItem, error } = await supabaseCloud
                .from('order_items')
                .update({ qty: newQty })
                .eq('id', itemId)
                .select()
                .single();
            if (error) throw error;

            const newItems = get().orderItems.map(i => i.id === itemId ? updatedItem : i);
            set({ orderItems: newItems });
            await ordersCache.setItem(scopedKey('active_order_items'), newItems);
            _broadcastOrdersChanged();
        } catch (e) {
            console.error('Error updating item qty:', e);
            throw e;
        }
    },

    cancelOrderBySessionId: async (sessionId) => {
        let order = get().getOrderBySessionId(sessionId);
        if (!order) return;

        // Guardar estado previo para rollback
        const prevOrders = get().orders;
        const prevItems = get().orderItems;

        // Optimistic update FIRST
        const newOrders = prevOrders.filter(o => o.id !== order.id);
        const newItems = prevItems.filter(i => i.order_id !== order.id);

        set({ orders: newOrders, orderItems: newItems });
        await ordersCache.setItem(scopedKey('active_orders'), newOrders);
        await ordersCache.setItem(scopedKey('active_order_items'), newItems);

        try {
            // Background network tasks
            await supabaseCloud.from('order_items').delete().eq('order_id', order.id);
            await supabaseCloud.from('orders').delete().eq('id', order.id);
            _broadcastOrdersChanged();
        } catch (e) {
            console.error('Error canceling order (network) — rolling back:', e);
            // Rollback: restaurar estado local
            set({ orders: prevOrders, orderItems: prevItems });
            await ordersCache.setItem(scopedKey('active_orders'), prevOrders);
            await ordersCache.setItem(scopedKey('active_order_items'), prevItems);
            throw e;
        }
    }
}));

useOrdersStore.getState().init();
