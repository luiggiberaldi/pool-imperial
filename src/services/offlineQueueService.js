import localforage from 'localforage';
import { supabaseCloud as supabase } from '../config/supabaseCloud';
import { scopedKey } from '../hooks/store/accountScope';

const SALES_KEY_BASE = 'bodega_sales_v1';
const QUEUE_KEY_BASE = 'offline_sales_queue';
const SYNC_LOCK_KEY_BASE = '_poolbar_offline_sync_lock';
const getQueueKey = () => scopedKey(QUEUE_KEY_BASE);
const getLockKey = () => scopedKey(SYNC_LOCK_KEY_BASE);
const LOCK_TTL = 30_000;
const LOCK_HEARTBEAT = 10_000;
const RPC_TIMEOUT = 12_000;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isValidUUID = (value) => typeof value === 'string' && UUID_REGEX.test(value);

// Errores de PostgreSQL que no se resuelven reintentando el mismo payload.
// 23505 se conserva como conflicto: con la migración idempotente puede significar
// que el servidor ya procesó la venta y debe reconciliarse, no volver a cobrarla.
const UNRECOVERABLE_CODES = new Set([
    '22P02',
    '23505', // requiere reconciliación; no reintentar a ciegas
    '23001',
    '23502',
    '23503',
    '42501',
    'P0001',
]);

let syncLockToken = null;
let syncLockHeartbeat = null;
let queueOperationChain = Promise.resolve();

/**
 * Serializa modificaciones en la pestaña actual y usa Web Locks cuando el
 * navegador lo soporta. El lock local sigue siendo un fallback para PWA viejas.
 */
function withQueueExclusive(task) {
    const execute = () => {
        if (typeof navigator !== 'undefined' && navigator.locks?.request) {
            return navigator.locks.request(
                `poolbar-offline-sales:${getQueueKey()}`,
                { mode: 'exclusive' },
                task
            );
        }
        return task();
    };

    const result = queueOperationChain.then(execute, execute);
    queueOperationChain = result.catch(() => undefined);
    return result;
}

// ─── Lock multi-tab fallback ────────────────────────────────────────────────
function acquireSyncLock() {
    try {
        const lockKey = getLockKey();
        const now = Date.now();
        const raw = localStorage.getItem(lockKey);
        if (raw) {
            const existing = JSON.parse(raw);
            if (existing?.ts && now - existing.ts < LOCK_TTL) return false;
        }

        const token = crypto.randomUUID();
        localStorage.setItem(lockKey, JSON.stringify({ token, ts: now }));
        const confirmed = JSON.parse(localStorage.getItem(lockKey) || '{}');
        if (confirmed.token !== token) return false;

        syncLockToken = token;
        syncLockHeartbeat = setInterval(() => {
            try {
                const current = JSON.parse(localStorage.getItem(lockKey) || '{}');
                if (current.token !== syncLockToken) return;
                localStorage.setItem(lockKey, JSON.stringify({ token, ts: Date.now() }));
            } catch { /* el lock expirará de forma segura */ }
        }, LOCK_HEARTBEAT);
        return true;
    } catch {
        // Si localStorage no está disponible, el Web Lock/in-process chain sigue
        // protegiendo la operación en los entornos que lo soportan.
        return true;
    }
}

function releaseSyncLock() {
    try {
        if (syncLockHeartbeat) clearInterval(syncLockHeartbeat);
        syncLockHeartbeat = null;
        const lockKey = getLockKey();
        const current = JSON.parse(localStorage.getItem(lockKey) || '{}');
        if (!syncLockToken || current.token === syncLockToken) {
            localStorage.removeItem(lockKey);
        }
    } catch { /* no bloquear la finalización del sync */ }
    syncLockToken = null;
}

function withTimeout(promise, ms) {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('SYNC_TIMEOUT')), ms)),
    ]);
}

function normalizeQueuePayload(payload, ownerUserId = null) {
    const localId = payload?.localId || payload?.local_sale_id || crypto.randomUUID();
    const idempotencyKey = isValidUUID(payload?.idempotency_key)
        ? payload.idempotency_key
        : crypto.randomUUID();

    return {
        ...(payload || {}),
        localId,
        local_sale_id: payload?.local_sale_id || localId,
        idempotency_key: idempotencyKey,
        owner_user_id: payload?.owner_user_id || ownerUserId || null,
    };
}

function dispatchSalesUpdate() {
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('app_storage_update', {
            detail: { key: SALES_KEY_BASE },
        }));
    }
}

async function reconcileLocalSale({ payload, result, status, errorDetail = null }) {
    try {
        const salesKey = scopedKey(SALES_KEY_BASE);
        const localSales = await localforage.getItem(salesKey) || [];
        const serverSaleId = result?.sale_id || result?.server_sale_id || result?.id || null;
        const serverSaleNumber = result?.sale_number ?? result?.server_sale_number ?? null;
        const localId = payload?.localId || payload?.local_sale_id;
        const idempotencyKey = payload?.idempotency_key;

        const index = localSales.findIndex(sale =>
            (localId && (sale.id === localId || sale.localId === localId || sale.local_sale_id === localId))
            || (serverSaleId && (sale.id === serverSaleId || sale.serverSaleId === serverSaleId || sale.server_sale_id === serverSaleId))
            || (idempotencyKey && sale.idempotency_key === idempotencyKey)
        );

        if (index < 0) return null;

        const current = localSales[index];
        const next = {
            ...current,
            localId: current.localId || localId || current.id,
            local_sale_id: current.local_sale_id || localId || current.id,
            idempotency_key: current.idempotency_key || idempotencyKey,
            sync_status: status === 'COMPLETADA' ? 'synced' : status,
            status,
            ...(serverSaleId ? { serverSaleId, server_sale_id: serverSaleId } : {}),
            ...(serverSaleNumber !== null && serverSaleNumber !== undefined
                ? { serverSaleNumber, server_sale_number: serverSaleNumber, saleNumber: serverSaleNumber }
                : {}),
            ...(status === 'COMPLETADA'
                ? { synced_at: new Date().toISOString(), sync_error: null }
                : { sync_error: errorDetail }),
        };

        localSales[index] = next;
        await localforage.setItem(salesKey, localSales);
        dispatchSalesUpdate();
        return next;
    } catch (error) {
        console.warn('[Offline Sync] No se pudo reconciliar la venta local:', error?.message);
        return null;
    }
}

async function syncPendingSalesInternal(force = false) {
    if (!acquireSyncLock()) {
        console.log('[Offline Sync] Otra pestaña está sincronizando. Saltando.');
        return { synced: 0, failed: 0, conflicts: 0, pending: 0 };
    }

    let synced = 0;
    let failed = 0;
    let conflicts = 0;

    try {
        const { data: { session } } = await supabase.auth.getSession();
        const queueKey = getQueueKey();
        const queue = await localforage.getItem(queueKey) || [];

        if (!session?.user?.id) {
            console.warn('[Offline Sync] No hay sesión activa — no se puede sincronizar.');
            return {
                synced: 0,
                failed: 0,
                conflicts: queue.filter(q => q.sync_status === 'conflict').length,
                pending: queue.filter(q => q.sync_status === 'pending').length,
            };
        }

        const ownerUserId = session.user.id;
        const now = Date.now();
        let updatedQueue = [...queue];

        // Las operaciones legacy sin dueño o pertenecientes a otra cuenta no se
        // envían a ciegas. Quedan visibles para reconciliación manual.
        updatedQueue = updatedQueue.map(item => {
            if (item.sync_status !== 'pending') return item;
            if (!item.owner_user_id || item.owner_user_id !== ownerUserId) {
                conflicts++;
                return {
                    ...item,
                    sync_status: 'conflict',
                    conflict_at: item.conflict_at || Date.now(),
                    last_error: !item.owner_user_id
                        ? 'LEGACY_QUEUE_OWNER_UNKNOWN: requiere reconciliación manual'
                        : 'QUEUE_OWNER_MISMATCH: la operación pertenece a otra cuenta',
                };
            }
            return item;
        });

        const pending = updatedQueue.filter(item =>
            item.sync_status === 'pending'
            && item.owner_user_id === ownerUserId
            && (force || !(item.next_retry_at && now < item.next_retry_at))
        );

        if (pending.length === 0) {
            // No borrar fallidos/conflictos: contienen evidencia financiera.
            await localforage.setItem(queueKey, updatedQueue);
            return {
                synced: 0,
                failed: 0,
                conflicts,
                pending: updatedQueue.filter(q => q.sync_status === 'pending').length,
            };
        }

        for (const item of pending) {
            const payload = normalizeQueuePayload(item.payload, ownerUserId);
            try {
                const cart = payload.cart || [];
                const recalcTotal = Math.round(
                    cart.reduce((sum, cartItem) => sum + (Number(cartItem.qty) * Number(cartItem.priceUsd)), 0) * 100
                ) / 100;
                const originalTotal = Number(payload.total) || 0;
                const saleTotal = cart.length > 0 ? recalcTotal : originalTotal;

                let adjustedPayments = [...(payload.payments || [])];
                const payTotal = adjustedPayments.reduce((sum, payment) => sum + (Number(payment.amountUsd) || 0), 0);
                const fiado = Number(payload.fiadoUsd) || 0;
                const excess = Math.round((payTotal + fiado - saleTotal) * 100) / 100;
                if (excess > 0.01 && adjustedPayments.length > 0) {
                    let remaining = excess;
                    for (let i = adjustedPayments.length - 1; i >= 0 && remaining > 0.01; i--) {
                        const reduction = Math.min(remaining, Number(adjustedPayments[i].amountUsd) || 0);
                        adjustedPayments[i] = {
                            ...adjustedPayments[i],
                            amountUsd: Math.round(((Number(adjustedPayments[i].amountUsd) || 0) - reduction) * 100) / 100,
                        };
                        remaining = Math.round((remaining - reduction) * 100) / 100;
                    }
                    adjustedPayments = adjustedPayments.filter(payment => Number(payment.amountUsd) > 0.01);
                }

                const finalPaySum = Math.round(
                    adjustedPayments.reduce((sum, payment) => sum + (Number(payment.amountUsd) || 0), 0) * 100
                ) / 100;
                const residual = Math.round((saleTotal - finalPaySum - fiado) * 100) / 100;
                if (Math.abs(residual) > 0.001 && adjustedPayments.length > 0) {
                    const lastIndex = adjustedPayments.length - 1;
                    adjustedPayments[lastIndex] = {
                        ...adjustedPayments[lastIndex],
                        amountUsd: Math.round(((Number(adjustedPayments[lastIndex].amountUsd) || 0) + residual) * 100) / 100,
                    };
                }

                const cleanVendedorId = isValidUUID(payload.vendedorId) ? payload.vendedorId : null;
                const cleanMeseroId = isValidUUID(payload.meseroId) ? payload.meseroId : null;
                const cleanCustomerId = isValidUUID(payload.customerId) ? payload.customerId : null;
                const payloadWithOrigin = {
                    ...payload,
                    total: saleTotal,
                    payments: adjustedPayments,
                    vendedorId: cleanVendedorId,
                    meseroId: cleanMeseroId,
                    customerId: cleanCustomerId,
                    idempotency_key: payload.idempotency_key,
                    owner_user_id: ownerUserId,
                    sync_origin: 'offline_sync',
                    original_created_at: item.created_at,
                };

                // Persistir la clave normalizada antes del RPC: aunque haya timeout,
                // el siguiente intento usará exactamente la misma identidad.
                updatedQueue = updatedQueue.map(q => q.id === item.id
                    ? { ...q, payload: payloadWithOrigin, owner_user_id: ownerUserId }
                    : q);
                await localforage.setItem(queueKey, updatedQueue);

                const { data, error } = await withTimeout(
                    supabase.rpc('process_checkout', { payload: payloadWithOrigin }),
                    RPC_TIMEOUT
                );
                if (error) throw error;

                updatedQueue = updatedQueue.map(q => q.id === item.id
                    ? {
                        ...q,
                        payload: { ...payloadWithOrigin, serverSaleId: data?.sale_id || null },
                        sync_status: 'synced',
                        synced_at: Date.now(),
                        last_error: null,
                    }
                    : q);
                await localforage.setItem(queueKey, updatedQueue);

                const reconciledSale = await reconcileLocalSale({
                    payload: payloadWithOrigin,
                    result: data,
                    status: 'COMPLETADA',
                });

                // El documento durable se publica después de conocer el ID canónico.
                // Broadcast sigue siendo acelerador; si falla, la cola se conserva como
                // synced y el pull/reconciliación puede volver a emitirlo.
                if (reconciledSale) {
                    try {
                        const { broadcastNewSale } = await import('../utils/salesSyncService');
                        await broadcastNewSale({
                            ...reconciledSale,
                            id: reconciledSale.serverSaleId || reconciledSale.id,
                            serverSaleId: reconciledSale.serverSaleId || data?.sale_id || null,
                            saleNumber: reconciledSale.serverSaleNumber || data?.sale_number || reconciledSale.saleNumber,
                            status: 'COMPLETADA',
                        }, ownerUserId);
                    } catch (broadcastError) {
                        console.warn('[Offline Sync] Venta confirmada, pero no se pudo publicar el documento:', broadcastError?.message);
                    }
                }

                synced++;
            } catch (error) {
                const errMsg = error?.message || 'Unknown error';
                const errCode = error?.code;
                const errDetails = error?.details || error?.hint || '';
                const attempts = (item.attempts || 0) + 1;
                const isTimeout = errMsg === 'SYNC_TIMEOUT';
                const isUnrecoverable = UNRECOVERABLE_CODES.has(errCode)
                    || (!isTimeout && !errCode && errMsg.includes('400'));
                const errorDetail = `${errCode || 'SYNC_ERROR'}: ${errMsg}${errDetails ? ` | ${errDetails}` : ''}`;

                console.error('[Offline Sync] Fallo al sincronizar venta offline:', {
                    message: errMsg,
                    code: errCode,
                    itemId: item.id,
                    idempotencyKey: item.payload?.idempotency_key,
                    attempts,
                });

                if (isUnrecoverable || attempts >= 10) {
                    updatedQueue = updatedQueue.map(q => q.id === item.id
                        ? {
                            ...q,
                            sync_status: isUnrecoverable ? 'conflict' : 'failed',
                            failed_at: Date.now(),
                            attempts,
                            last_error: errorDetail,
                        }
                        : q);
                    await reconcileLocalSale({
                        payload: normalizeQueuePayload(item.payload, ownerUserId),
                        result: null,
                        status: isUnrecoverable ? 'SYNC_ERROR' : 'SYNC_ERROR',
                        errorDetail,
                    });
                    failed++;
                } else {
                    const baseDelay = isTimeout ? 2_000 : 1_000;
                    const jitter = Math.floor(Math.random() * 500);
                    const nextRetryAt = Date.now() + Math.min(300_000, baseDelay * (2 ** attempts) + jitter);
                    updatedQueue = updatedQueue.map(q => q.id === item.id
                        ? { ...q, attempts, next_retry_at: nextRetryAt, last_error: errorDetail }
                        : q);
                }
            }
        }

        // Los elementos synced pueden limpiarse después de 24h porque ya tienen
        // copia local y remota. Fallidos/conflictos se conservan para auditoría.
        const retainedQueue = updatedQueue.filter(item => !(
            item.sync_status === 'synced'
            && item.synced_at
            && Date.now() - item.synced_at > 24 * 60 * 60 * 1000
        ));
        await localforage.setItem(queueKey, retainedQueue);

        return {
            synced,
            failed,
            conflicts,
            pending: retainedQueue.filter(item => item.sync_status === 'pending').length,
        };
    } finally {
        releaseSyncLock();
    }
}

async function reconcileLocalPendingSalesInternal() {
    const salesKey = scopedKey(SALES_KEY_BASE);
    const queueKey = getQueueKey();
    const [sales, queue] = await Promise.all([
        localforage.getItem(salesKey) || [],
        localforage.getItem(queueKey) || [],
    ]);
    const pendingSales = (sales || []).filter(sale =>
        sale?.status === 'PENDIENTE_SYNC' || sale?.status === 'PENDIENTE_VERIFICACION'
    );
    if (pendingSales.length === 0) return { pending: 0, conflicts: 0, reconciled: 0 };

    let conflicts = 0;
    let reconciled = 0;
    const orphanSaleIds = new Set();

    for (const sale of pendingSales) {
        const saleKey = sale.idempotency_key || sale.idempotencyKey;
        const saleLocalId = sale.localId || sale.local_sale_id || sale.id;
        const item = (queue || []).find(entry => {
            const payload = entry.payload || {};
            return (saleKey && payload.idempotency_key === saleKey)
                || (saleLocalId && (payload.localId === saleLocalId || payload.local_sale_id === saleLocalId));
        });

        if (!item) {
            orphanSaleIds.add(sale.id);
            conflicts++;
            continue;
        }

        if (item.sync_status === 'synced' && (item.payload?.serverSaleId || item.payload?.server_sale_id)) {
            const result = await reconcileLocalSale({
                payload: item.payload,
                result: {
                    sale_id: item.payload.serverSaleId || item.payload.server_sale_id,
                    sale_number: item.payload.serverSaleNumber || item.payload.server_sale_number,
                },
                status: 'COMPLETADA',
            });
            if (result) reconciled++;
        } else if (item.sync_status === 'failed' || item.sync_status === 'conflict') {
            const result = await reconcileLocalSale({
                payload: item.payload,
                result: null,
                status: 'SYNC_ERROR',
                errorDetail: item.last_error || 'La operación requiere reconciliación manual',
            });
            if (result) conflicts++;
        }
    }

    if (orphanSaleIds.size > 0) {
        const latestSales = await localforage.getItem(salesKey) || sales;
        const updatedSales = latestSales.map(sale => orphanSaleIds.has(sale.id)
            ? {
                ...sale,
                status: 'SYNC_CONFLICT',
                sync_status: 'conflict',
                sync_error: 'LOCAL_PENDING_WITHOUT_QUEUE: requiere reconciliación manual',
            }
            : sale);
        await localforage.setItem(salesKey, updatedSales);
        dispatchSalesUpdate();
    }

    return {
        pending: pendingSales.length - reconciled - conflicts,
        conflicts,
        reconciled,
    };
}

export const offlineQueueService = {
    reconcileLocalPendingSales() {
        return withQueueExclusive(reconcileLocalPendingSalesInternal);
    },

    addSaleToQueue(salePayload) {
        return withQueueExclusive(async () => {
            let ownerUserId = salePayload?.owner_user_id || null;
            if (!ownerUserId) {
                try {
                    const { data: { session } } = await supabase.auth.getSession();
                    ownerUserId = session?.user?.id || null;
                } catch { /* quedará como legacy y requerirá reconciliación */ }
            }

            const payload = normalizeQueuePayload(salePayload, ownerUserId);
            const queueKey = getQueueKey();
            const queue = await localforage.getItem(queueKey) || [];
            const duplicate = queue.find(item =>
                item.payload?.idempotency_key === payload.idempotency_key
                && !['failed', 'conflict'].includes(item.sync_status)
            );
            if (duplicate) {
                console.warn('[Offline Sync] Operación duplicada detectada, ignorando:', payload.idempotency_key);
                return duplicate;
            }

            const newEntry = {
                id: crypto.randomUUID(),
                payload,
                local_sale_id: payload.localId,
                owner_user_id: ownerUserId,
                created_at: new Date().toISOString(),
                sync_status: 'pending',
                attempts: 0,
            };
            await localforage.setItem(queueKey, [...queue, newEntry]);
            return newEntry;
        });
    },

    syncPendingSales(force = false) {
        return withQueueExclusive(() => syncPendingSalesInternal(force));
    },
};

let syncScheduled = false;
if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
        if (syncScheduled) return;
        syncScheduled = true;
        setTimeout(() => {
            syncScheduled = false;
            console.log('[Offline Sync] Internet restaurado. Sincronizando ventas pendientes...');
            offlineQueueService.syncPendingSales(true).catch(error => {
                console.warn('[Offline Sync] Error en sincronización automática:', error?.message);
            });
        }, 2_000);
    });
}
