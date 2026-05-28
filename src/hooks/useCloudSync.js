import { useEffect, useRef, useState } from 'react';
import { supabaseCloud } from '../config/supabaseCloud';
import { storageService } from '../utils/storageService';
import { scopedKey } from './store/accountScope';

const SYNC_KEYS = [
    'bodega_products_v1',
    'bodega_customers_v1',
    // 'bodega_sales_v1',      // Excluido: crece mucho, genera alto egress
    'bodega_payment_methods_v1',
    'monitor_rates_v12',
    'bodega_accounts_v2',
    // 'abasto_audit_log_v1',  // Excluido: log local, no necesita sync cross-device
    'bodega_custom_rate',
    'bodega_use_auto_rate',
    'tasa_cop',
    'cop_enabled',
    'auto_cop_enabled',
    'poolbar_categories_v1',
    // ── Permisos de cajero (sincronizar entre dispositivos) ──
    'cajero_puede_ver_mesas',
    'cajero_puede_abrir_caja',
    'cajero_puede_cerrar_caja',
    'max_discount_cajero',
    // ── Precios Bs independientes para mesas ──
    'pool_price_per_hour_bs',
    'pool_price_pina_bs',
];

// Clave para rastrear el último pull exitoso (evita re-descargar datos sin cambios)
const LAST_PULL_KEY_BASE = '_cloud_last_pull_at';
const getLastPullKey = () => scopedKey(LAST_PULL_KEY_BASE);

const LOCAL_KEYS = [
    'abasto-auth-storage',
    'bodega_custom_rate',
    'bodega_use_auto_rate',
    'tasa_cop',
    'cop_enabled',
    'auto_cop_enabled',
    // ── Permisos de cajero ──
    'cajero_puede_ver_mesas',
    'cajero_puede_abrir_caja',
    'cajero_puede_cerrar_caja',
    'max_discount_cajero',
];

// ─── Estado Global del Motor ───────────────────────────────────────────────
let globalSubscription = null;
let globalSubscriptionUserId = null; // Track which user the subscription belongs to
let syncBroadcastChannel = null;
let syncBroadcastUserId = null;
let isSyncingFromCloud = false;
let syncingFromCloudCount = 0;      // Counter-based guard (safer than boolean)
let isInitialSyncCompleted = false;  // BLOQUEO DE ARRANQUE: No subir nada hasta descargar
let pendingPush = {};
let isVisibilityBound = false;
let visibilityDebounceTimer = null;

const IMPORT_GUARD_KEY = '_poolbar_import_guard';
const SYNC_QUEUE_KEY_BASE = '_poolbar_sync_queue';
const getSyncQueueKey = () => scopedKey(SYNC_QUEUE_KEY_BASE);

export const setImportGuard = () => sessionStorage.setItem(IMPORT_GUARD_KEY, '1');
export const clearImportGuard = () => sessionStorage.removeItem(IMPORT_GUARD_KEY);
const hasImportGuard = () => sessionStorage.getItem(IMPORT_GUARD_KEY) === '1';

/** Canal Broadcast para sync_documents P2P (0 WAL egress) */
function _getSyncBroadcastChannel(userId) {
    if (syncBroadcastChannel && syncBroadcastUserId === userId) return syncBroadcastChannel;
    if (syncBroadcastChannel) syncBroadcastChannel.unsubscribe();
    syncBroadcastChannel = supabaseCloud.channel(`sync_docs:${userId}`);
    syncBroadcastUserId = userId;
    return syncBroadcastChannel;
}

// Gestión de Cola Offline
export const getSyncQueue = () => {
    try {
        return JSON.parse(localStorage.getItem(getSyncQueueKey()) || '[]');
    } catch(e) { return []; }
};
export const addToSyncQueue = (key) => {
    const queue = getSyncQueue();
    if (!queue.includes(key)) {
        queue.push(key);
        localStorage.setItem(getSyncQueueKey(), JSON.stringify(queue));
    }
};
export const removeFromSyncQueue = (key) => {
    const queue = getSyncQueue().filter(k => k !== key);
    localStorage.setItem(getSyncQueueKey(), JSON.stringify(queue));
};

/**
 * Procesa todos los cambios pendientes que se hicieron offline o durante el arranque.
 */
export const processSyncQueue = async () => {
    if (!isInitialSyncCompleted) return;
    const queue = getSyncQueue();
    if (queue.length === 0) return;

    console.log(`[CloudSync] Procesando cola de pendientes: ${queue.length} items`);
    for (const key of queue) {
        try {
            let value;
            if (LOCAL_KEYS.includes(key)) {
                value = localStorage.getItem(key);
                try { value = JSON.parse(value); } catch(e) { /* not JSON, use raw string */ }
            } else {
                value = await storageService.getItem(key);
            }
            
            if (value !== null) {
                await pushCloudSync(key, value, true);
            }
            // NOTA: removeFromSyncQueue ahora se llama dentro de pushCloudSync si tiene éxito
        } catch (e) {
            console.warn(`[CloudSync] Reintento fallido para ${key}:`, e.message);
            continue; // No bloquear la cola entera por un solo fallo
        }
    }
};

/**
 * FUERZA una descarga completa desde la nube, limpiando cualquier dato local
 * con discrepancias o pendientes.
 */
export const forcePullFromCloud = async () => {
    try {
        const { data: { session } } = await supabaseCloud.auth.getSession();
        if (!session?.user?.id) throw new Error('No hay sesión activa.');

        console.log('[CloudSync] Iniciando RESTAURACIÓN FORZADA desde la nube...');
        localStorage.removeItem(getSyncQueueKey());

        await storageService.removeItem('bodega_products_v1');
        await storageService.removeItem('poolbar_categories_v1');

        const { data: docs, error } = await supabaseCloud
            .from('sync_documents')
            .select('collection, doc_id, data')
            .eq('user_id', session.user.id);

        if (error) throw error;

        if (docs && docs.length > 0) {
            for (const doc of docs) {
                await _applyFromCloud(doc.doc_id, doc.collection, doc.data.payload);
            }
        }

        console.log('[CloudSync] Restauración forzada completa.');
        return true;
    } catch (e) {
        console.error('[CloudSync] Error en restauración forzada:', e);
        throw e;
    }
};

export const forcePushToCloud = async () => {
    try {
        const { data: { session } } = await supabaseCloud.auth.getSession();
        if (!session?.user?.id) throw new Error('No hay sesión activa.');

        console.log('[CloudSync] Iniciando SUBIDA FORZADA a la nube...');
        
        const localProducts = await storageService.getItem('bodega_products_v1') || [];
        const localCategories = await storageService.getItem('poolbar_categories_v1') || [];
        
        await pushCloudSync('bodega_products_v1', localProducts, true);
        await pushCloudSync('poolbar_categories_v1', localCategories, true);
        
        const backupData = {
            data: {
                idb: {
                    'bodega_products_v1': localProducts,
                    'poolbar_categories_v1': localCategories
                }
            }
        };
        
        const { error: backupError } = await supabaseCloud.from('cloud_backups').upsert({
            email: session.user.email,
            backup_data: backupData,
            updated_at: new Date().toISOString()
        }, { onConflict: 'email' });

        if (backupError) throw backupError;

        console.log('[CloudSync] Subida forzada completa.');
        return true;
    } catch (e) {
        console.error('[CloudSync] Error en subida forzada:', e);
        throw e;
    }
};

/**
 * Sube un backup completo de todos los datos del usuario a cloud_backups.
 * Usado cuando el admin solicita un backup inmediato desde el panel de administración.
 */
export const pushFullBackupToCloud = async () => {
    try {
        const { data: { session } } = await supabaseCloud.auth.getSession();
        if (!session?.user?.email) return;

        const idbKeys = [
            'bodega_products_v1', 'poolbar_categories_v1',
            'bodega_sales_v1', 'bodega_customers_v1',
            'bodega_accounts_v2', 'bodega_payment_methods_v1',
            'bodega_suppliers_v1', 'bodega_supplier_invoices_v1',
            'abasto_audit_log_v1', 'bodega_pending_cart_v1',
            'active_sessions', 'tables', 'pool_config',
            'active_orders', 'active_order_items', 'active_cash_session',
            'offline_sales_queue',
        ];
        const idbData = {};
        for (const key of idbKeys) {
            const data = await storageService.getItem(key, null);
            if (data !== null) idbData[key] = data;
        }

        const lsKeys = [
            'business_name', 'business_rif', 'bodega_use_auto_rate',
            'bodega_custom_rate', 'monitor_rates_v12', 'cop_enabled',
            'auto_cop_enabled', 'tasa_cop', 'premium_token',
            'allow_negative_stock', 'printer_paper_width',
            'street_rate_bs', 'catalog_use_auto_usdt',
            'catalog_custom_usdt_price', 'catalog_show_cash_price',
            'bodega_inventory_view', 'theme',
            'cajero_puede_ver_mesas', 'cajero_puede_abrir_caja',
            'cajero_puede_cerrar_caja', 'max_discount_cajero',
            'admin_auto_lock_on_minimize', 'admin_auto_lock_minutes',
            'pda_device_alias',
        ];
        const lsData = {};
        for (const key of lsKeys) {
            const val = localStorage.getItem(key);
            if (val !== null) lsData[key] = val;
        }

        const backupData = {
            timestamp: new Date().toISOString(),
            version: '2.0',
            data: { idb: idbData, ls: lsData }
        };

        const { error } = await supabaseCloud.from('cloud_backups').upsert({
            email: session.user.email,
            backup_data: backupData,
            updated_at: new Date().toISOString()
        }, { onConflict: 'email' });

        if (error) throw error;
        console.log('[CloudSync] Backup completo subido por solicitud del admin.');
        return true;
    } catch (e) {
        console.error('[CloudSync] Error en backup completo:', e);
        throw e;
    }
};

// Escuchar retorno de internet
if (typeof window !== 'undefined') {
    window.addEventListener('online', processSyncQueue);
}

// Interceptor de localStorage 
const originalSetItem = localStorage.setItem.bind(localStorage);
localStorage.setItem = function (key, value) {
    originalSetItem(key, value);
    if (!isSyncingFromCloud && LOCAL_KEYS.includes(key)) {
        scheduleCloudPush(key, value);
    }
};

export function scheduleCloudPush(key, value) {
    // Al añadirlo a la cola de sincronización inmediatamente, evitamos que un reinicio
    // accidental sobrescriba el dato local (Punto ACID)
    addToSyncQueue(key);
    
    if (pendingPush[key]) clearTimeout(pendingPush[key]);
    pendingPush[key] = setTimeout(() => {
        delete pendingPush[key];
        pushCloudSync(key, value).catch(() => {});
    }, 1000);
}

/**
 * Empuja cambios a la nube.
 */
export const pushCloudSync = async (key, value, force = false) => {
    if (isSyncingFromCloud) return;
    if (!SYNC_KEYS.includes(key)) return;

    // Si aún no hemos terminado el pull inicial, DESCARTAMOS el push automático
    // para evitar pisar datos nuevos de la nube con datos locales viejos (stale).
    // Solo permitimos subir si es forzado o si ya terminó el arranque.
    if (!isInitialSyncCompleted && !force) {
        console.log(`[CloudSync] Push ignorado durante arranque para: ${key}`);
        return;
    }

    try {
        const { data: { session } } = await supabaseCloud.auth.getSession();
        if (!session?.user?.id) {
            addToSyncQueue(key);
            return;
        }

        const collectionType = LOCAL_KEYS.includes(key) ? 'local' : 'store';

        const { error } = await supabaseCloud.from('sync_documents').upsert({
            user_id: session.user.id,
            collection: collectionType,
            doc_id: key,
            data: { payload: value },
            updated_at: new Date().toISOString()
        }, { onConflict: 'user_id,collection,doc_id' });

        if (error) throw error;
        removeFromSyncQueue(key);

        // Broadcast P2P para dispositivos activos (0 DB egress)
        try {
            const ch = _getSyncBroadcastChannel(session.user.id);
            ch.send({
                type: 'broadcast',
                event: 'sync_doc_changed',
                payload: { doc_id: key, collection: collectionType, data: value },
            });
        } catch (_) { /* non-fatal: la DB ya tiene el dato */ }

    } catch (e) {
        console.warn('[CloudSync] Falló envío. Encolado para reintento:', key);
        addToSyncQueue(key);
    }
};

async function _applyFromCloud(docId, collection, payload) {
    syncingFromCloudCount++;
    isSyncingFromCloud = true;
    try {
        if (collection === 'local') {
            const stringPayload = typeof payload === 'string' ? payload : JSON.stringify(payload);
            originalSetItem(docId, stringPayload);
            window.dispatchEvent(new StorageEvent('storage', {
                key: docId,
                newValue: stringPayload,
                storageArea: localStorage
              }));
            if (docId === 'abasto-auth-storage') {
                // Auth storage is no longer synced to cloud - skip rehydration
            }
        } else {
            // Use storageService directly (consistent localforage instance, avoids config issues)
            await storageService.setItemSilent(docId, payload);
            window.dispatchEvent(new CustomEvent('app_storage_update', { detail: { key: docId } }));
        }
    } finally {
        syncingFromCloudCount--;
        if (syncingFromCloudCount <= 0) {
            syncingFromCloudCount = 0;
            isSyncingFromCloud = false;
        }
    }
}

/**
 * Cloud-first fetch: obtiene productos y categorías directamente de Supabase.
 * Usado por ProductContext al arrancar para tener la nube como fuente de verdad.
 * @param {string} userId - ID del usuario de Supabase
 * @returns {Promise<{products: Array, categories: Array}|null>} null si no hay datos
 */
export async function fetchCloudProducts(userId) {
    const { data } = await supabaseCloud
        .from('sync_documents')
        .select('doc_id, data')
        .eq('user_id', userId)
        .in('doc_id', ['bodega_products_v1', 'poolbar_categories_v1'])
        .eq('collection', 'store');

    if (!data || data.length === 0) return null;

    const result = { products: null, categories: null };
    for (const doc of data) {
        if (doc.doc_id === 'bodega_products_v1' && doc.data?.payload) {
            result.products = doc.data.payload;
        }
        if (doc.doc_id === 'poolbar_categories_v1' && doc.data?.payload) {
            result.categories = doc.data.payload;
        }
    }
    return result;
}

/**
 * Lightweight cloud pull: fetches latest from sync_documents without clearing local state.
 * Safe to call on visibility change / app foreground restore.
 */
export const pullLatestFromCloud = async () => {
    try {
        const { data: { session } } = await supabaseCloud.auth.getSession();
        if (!session?.user?.id) return;

        const queue = getSyncQueue();
        const lastPullAt = localStorage.getItem(getLastPullKey());

        let query = supabaseCloud
            .from('sync_documents')
            .select('collection, doc_id, data, updated_at')
            .eq('user_id', session.user.id)
            .in('doc_id', SYNC_KEYS);

        // Solo descargar documentos que cambiaron desde el último pull
        if (lastPullAt) {
            query = query.gt('updated_at', lastPullAt);
        }

        const { data: docs } = await query;

        if (docs?.length > 0) {
            for (const doc of docs) {
                if (queue.includes(doc.doc_id)) continue;
                await _applyFromCloud(doc.doc_id, doc.collection, doc.data.payload);
            }
        }

        // Guardar timestamp del pull para el próximo ciclo
        localStorage.setItem(getLastPullKey(), new Date().toISOString());
    } catch (e) {
        console.warn('[CloudSync] pullLatest falló silenciosamente:', e.message);
    }
};

// Auto-pull when app returns to foreground (recovers from WebSocket drops during sleep)
if (typeof document !== 'undefined' && !isVisibilityBound) {
    isVisibilityBound = true;
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && isInitialSyncCompleted) {
            if (visibilityDebounceTimer) clearTimeout(visibilityDebounceTimer);
            visibilityDebounceTimer = setTimeout(async () => {
                console.log('[CloudSync] App volvió al primer plano – re-sincronizando...');
                pullLatestFromCloud();
                // También pull incremental de ventas
                const { pullNewSales } = await import('../utils/salesSyncService');
                const { data: { session } } = await supabaseCloud.auth.getSession().catch(() => ({ data: {} }));
                if (session?.user?.id) pullNewSales(session.user.id);
            }, 500);
        }
    });
}

export function useCloudSync() {
    const [isCloudConfigured, setIsCloudConfigured] = useState(false);
    const isInitialized = useRef(false);

    // Check Supabase session to determine cloud configuration status
    useEffect(() => {
        supabaseCloud.auth.getSession().then(({ data: { session } }) => {
            setIsCloudConfigured(!!session);
        }).catch(() => {});
        const { data: { subscription } } = supabaseCloud.auth.onAuthStateChange((_event, session) => {
            setIsCloudConfigured(!!session);
        });
        return () => subscription.unsubscribe();
    }, []);

    useEffect(() => {
        if (!isCloudConfigured) {
            if (globalSubscription) {
                globalSubscription.unsubscribe();
                globalSubscription = null;
                isInitialized.current = false;
            }
            // Si no hay nube instalada, el motor local es el maestro
            isInitialSyncCompleted = true;
            window.dispatchEvent(new CustomEvent('sync_initial_completed'));
            return;
        }

        if (isInitialized.current) return;

        const initSync = async () => {
            try {
                let session = (await supabaseCloud.auth.getSession()).data.session;
                if (!session?.user?.id) return;

                isInitialized.current = true;
                const userId = session.user.id;

                // ── Pull Inicial ───────────────────────────────────────────
                if (hasImportGuard()) {
                    console.log('[CloudSync] Guard activo — pull inicial omitido.');
                    clearImportGuard();
                    isInitialSyncCompleted = true;
                } else {
                    const lastPullAt = localStorage.getItem(getLastPullKey());
                    let initQuery = supabaseCloud
                        .from('sync_documents')
                        .select('collection, doc_id, data, updated_at')
                        .eq('user_id', userId)
                        .in('collection', ['store', 'local'])
                        .in('doc_id', SYNC_KEYS);

                    // En recargas posteriores, solo traer lo que cambió desde la última vez
                    if (lastPullAt) {
                        initQuery = initQuery.gt('updated_at', lastPullAt);
                    }

                    const { data: docs } = await initQuery;

                    if (docs?.length > 0) {
                        for (const doc of docs) {
                            // Solo aplicamos de nube si NO tenemos cambios locales pendientes para esa llave
                            // Esto protege cambios hechos offline justo antes de abrir la app.
                            const queue = getSyncQueue();
                            if (!queue.includes(doc.doc_id)) {
                                await _applyFromCloud(doc.doc_id, doc.collection, doc.data.payload);
                            } else {
                                console.log(`[CloudSync] Saltando pull para ${doc.doc_id} por discrepancia local pendiente.`);
                            }
                        }
                        isInitialSyncCompleted = true;
                        localStorage.setItem(getLastPullKey(), new Date().toISOString());
                    }
                }

                // Garantía final de que el motor está listo
                isInitialSyncCompleted = true;
                window.dispatchEvent(new CustomEvent('sync_initial_completed'));
                console.log('[CloudSync] Motor de sincronización listo (Pull Finalizado).');

                // Procesar cualquier cambio que se haya intentado subir durante el arranque
                processSyncQueue();

                // Pull incremental de ventas (solo nuevas desde último sync)
                const { pullNewSales, subscribeSalesRealtime, applyIncomingSale } = await import('../utils/salesSyncService');
                await pullNewSales(userId);

                // ── Suscripción Broadcast P2P (0 WAL egress) ─────────────────
                // Reemplaza postgres_changes en sync_documents por broadcast
                if (globalSubscription && globalSubscriptionUserId !== userId) {
                    globalSubscription.unsubscribe();
                    globalSubscription = null;
                    globalSubscriptionUserId = null;
                }
                if (!globalSubscription) {
                    globalSubscriptionUserId = userId;
                    const ch = _getSyncBroadcastChannel(userId);
                    globalSubscription = ch
                        .on('broadcast', { event: 'sync_doc_changed' }, async ({ payload }) => {
                            if (!payload?.doc_id) return;

                            // Ventas individuales → merge, no reemplazar
                            if (payload.collection === 'sale') {
                                await applyIncomingSale(payload.data);
                                return;
                            }

                            if (!['store', 'local'].includes(payload.collection)) return;

                            // Ignorar si nosotros mismos estamos intentando subir cambios de esta misma llave
                            const queue = getSyncQueue();
                            if (queue.includes(payload.doc_id)) return;

                            console.log(`[CloudSync] Recibido P2P (broadcast): ${payload.doc_id}`);
                            await _applyFromCloud(payload.doc_id, payload.collection, payload.data);
                        })
                        .subscribe((status) => {
                            if (status === 'SUBSCRIBED') {
                                console.log('[CloudSync] Conectado en Tiempo Real (Broadcast P2P)');
                            }
                        });
                }

                // Suscripción Broadcast para ventas en tiempo real (0 DB egress)
                subscribeSalesRealtime(userId, applyIncomingSale);

                // Suscripción a solicitudes de backup del admin
                supabaseCloud
                    .channel(`backup-requests:${userId}`)
                    .on('broadcast', { event: 'request' }, async ({ payload }) => {
                        if (payload?.email?.toLowerCase() === session.user.email?.toLowerCase()) {
                            console.log('[CloudSync] Backup solicitado por admin — subiendo...');
                            await pushFullBackupToCloud();
                        }
                    })
                    .subscribe();

            } catch (err) {
                console.error('[CloudSync] Error inicialización P2P:', err);
                isInitialized.current = false;
            }
        };

        initSync();
    }, [isCloudConfigured]);

    return {
        forcePullFromCloud,
        forcePushToCloud
    };
}
