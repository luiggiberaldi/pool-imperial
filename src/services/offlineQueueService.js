import localforage from 'localforage';
import { supabaseCloud as supabase } from '../config/supabaseCloud';
import { scopedKey } from '../hooks/store/accountScope';

const SALES_KEY_BASE = 'bodega_sales_v1';

const QUEUE_KEY_BASE = 'offline_sales_queue';
const SYNC_LOCK_KEY_BASE = '_poolbar_offline_sync_lock';
const getQueueKey = () => scopedKey(QUEUE_KEY_BASE);
const getLockKey = () => scopedKey(SYNC_LOCK_KEY_BASE);
const LOCK_TTL = 30_000; // 30s — si un tab crashea, el lock expira
const RPC_TIMEOUT = 12_000; // 12s timeout para cada RPC

// Errores de PostgreSQL que NUNCA van a resolverse reintentando
const UNRECOVERABLE_CODES = new Set([
  '22P02', // invalid_text_representation
  '23505', // unique_violation (venta ya procesada)
  '23001', // restrict_violation
  '23502', // not_null_violation
  '23503', // foreign_key_violation
  '42501', // insufficient_privilege
  'P0001', // raise_exception (ej: double entry validation failed)
]);

// ─── Lock Multi-Tab ────────────────────────────────────────────────────────
function acquireSyncLock() {
    try {
        const lockKey = getLockKey();
        const raw = localStorage.getItem(lockKey);
        if (raw) {
            const existing = JSON.parse(raw);
            if (existing && Date.now() - existing.ts < LOCK_TTL) return false;
        }
        localStorage.setItem(lockKey, JSON.stringify({ ts: Date.now() }));
        return true;
    } catch { return true; }
}

function releaseSyncLock() {
    try { localStorage.removeItem(getLockKey()); } catch {}
}

// ─── Timeout wrapper ───────────────────────────────────────────────────────
function withTimeout(promise, ms) {
    return Promise.race([
        promise,
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error('SYNC_TIMEOUT')), ms)
        )
    ]);
}

export const offlineQueueService = {
  async addSaleToQueue(salePayload) {
    const queue = await localforage.getItem(getQueueKey()) || [];

    // Deduplicación: si ya existe un item pending con la misma idempotency_key, no duplicar
    if (salePayload.idempotency_key) {
        const duplicate = queue.find(q =>
            q.sync_status === 'pending' &&
            q.payload?.idempotency_key === salePayload.idempotency_key
        );
        if (duplicate) {
            console.warn('[Offline Sync] Venta duplicada detectada, ignorando:', salePayload.idempotency_key);
            return duplicate;
        }
    }

    const newEntry = {
      id: crypto.randomUUID(),
      payload: salePayload,
      created_at: new Date().toISOString(),
      sync_status: 'pending',
      attempts: 0
    };
    await localforage.setItem(getQueueKey(), [...queue, newEntry]);
    return newEntry;
  },

  async syncPendingSales(force = false) {
    // Lock multi-tab: solo un tab sincroniza a la vez
    if (!acquireSyncLock()) {
        console.log('[Offline Sync] Otra pestaña está sincronizando. Saltando.');
        return { synced: 0, failed: 0, pending: 0 };
    }

    let synced = 0, failed = 0;

    try {
        // Verify active session before attempting RPC calls
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
            console.warn('[Offline Sync] No hay sesión activa — no se puede sincronizar.');
            const queue = await localforage.getItem(getQueueKey()) || [];
            const totalPending = queue.filter(q => q.sync_status === 'pending').length;
            return { synced: 0, failed: 0, pending: totalPending };
        }

        const queue = await localforage.getItem(getQueueKey()) || [];
        const now = Date.now();
        const totalPending = queue.filter(q => q.sync_status === 'pending').length;
        const pending = queue.filter(q =>
          q.sync_status === 'pending' &&
          (force || !(q.next_retry_at && now < q.next_retry_at))
        );

        if (pending.length === 0) {
          // Purgar items viejos: synced > 24h, failed > 7 días
          const purged = queue.filter(q => {
            if (q.sync_status === 'synced' && q.synced_at && now - q.synced_at > 24 * 60 * 60 * 1000) return false;
            if (q.sync_status === 'failed' && q.failed_at && now - q.failed_at > 7 * 24 * 60 * 60 * 1000) return false;
            return true;
          });
          if (purged.length !== queue.length) {
            await localforage.setItem(getQueueKey(), purged);
          }
          return { synced: 0, failed: 0, pending: totalPending };
        }

        let updatedQueue = [...queue];

        for (const item of pending) {
          try {
            // Recalcular total EXACTO desde los items del carrito.
            // El RPC del servidor calcula sum(qty * priceUsd) y compara con sum(pagos) + fiado.
            // Si usamos el total original (redondeado), puede haber diferencias de centésimas.
            const cart = item.payload.cart || [];
            const recalcTotal = Math.round(cart.reduce((s, ci) => s + (ci.qty * ci.priceUsd), 0) * 100) / 100;
            const originalTotal = item.payload.total || 0;
            const saleTotal = cart.length > 0 ? recalcTotal : originalTotal;

            // Ajustar pagos para que sum(pagos) + fiado == saleTotal exactamente
            let adjustedPayments = [...(item.payload.payments || [])];
            const payTotal = adjustedPayments.reduce((s, p) => s + (p.amountUsd || 0), 0);
            const fiado = item.payload.fiadoUsd || 0;
            const excess = Math.round((payTotal + fiado - saleTotal) * 100) / 100;
            if (excess > 0.01 && adjustedPayments.length > 0) {
              let rem = excess;
              for (let i = adjustedPayments.length - 1; i >= 0 && rem > 0.01; i--) {
                const red = Math.min(rem, adjustedPayments[i].amountUsd);
                adjustedPayments[i] = { ...adjustedPayments[i], amountUsd: Math.round((adjustedPayments[i].amountUsd - red) * 100) / 100 };
                rem = Math.round((rem - red) * 100) / 100;
              }
              adjustedPayments = adjustedPayments.filter(p => p.amountUsd > 0.01);
            }

            // Forzar último pago para absorber cualquier residuo de redondeo
            const finalPaySum = Math.round(adjustedPayments.reduce((s, p) => s + p.amountUsd, 0) * 100) / 100;
            const residual = Math.round((saleTotal - finalPaySum - fiado) * 100) / 100;
            if (Math.abs(residual) > 0.001 && adjustedPayments.length > 0) {
              const lastIdx = adjustedPayments.length - 1;
              adjustedPayments[lastIdx] = {
                ...adjustedPayments[lastIdx],
                amountUsd: Math.round((adjustedPayments[lastIdx].amountUsd + residual) * 100) / 100
              };
            }

            const payloadWithOrigin = {
              ...item.payload,
              total: saleTotal,
              payments: adjustedPayments,
              sync_origin: 'offline_sync',
              original_created_at: item.created_at
            };

            // RPC con timeout — no colgar indefinidamente
            const { data, error } = await withTimeout(
                supabase.rpc('process_checkout', { payload: payloadWithOrigin }),
                RPC_TIMEOUT
            );

            if (error) throw error;

            updatedQueue = updatedQueue.map(q => q.id === item.id ? { ...q, sync_status: 'synced', synced_at: Date.now() } : q);
            synced++;

            // Actualizar status en bodega_sales_v1 de PENDIENTE_SYNC → COMPLETADA
            try {
                const salesKey = scopedKey(SALES_KEY_BASE);
                const localSales = await localforage.getItem(salesKey) || [];
                const idToMatch = item.payload?.idempotency_key || item.payload?.localId;
                if (idToMatch) {
                    const updated = localSales.map(s => {
                        if ((s.idempotency_key === idToMatch || s.id === idToMatch) && s.status === 'PENDIENTE_SYNC') {
                            return { ...s, status: 'COMPLETADA', synced_at: new Date().toISOString() };
                        }
                        return s;
                    });
                    await localforage.setItem(salesKey, updated);
                }
            } catch (e) { /* no bloquear el sync si esto falla */ }
          } catch (err) {
            const errMsg = err?.message || 'Unknown error';
            const errCode = err?.code;
            const errDetails = err?.details || err?.hint || '';
            console.error(`[Offline Sync] Fallo al sincronizar venta offline:`, {
                message: errMsg,
                code: errCode,
                details: errDetails,
                hint: err?.hint,
                itemId: item.id,
                idempotencyKey: item.payload?.idempotency_key,
                attempts: item.attempts + 1,
                payloadTotal: item.payload?.total,
                cartLength: item.payload?.cart?.length,
                paymentsLength: item.payload?.payments?.length,
                fiadoUsd: item.payload?.fiadoUsd
            });
            const attempts = item.attempts + 1;
            const isTimeout = err?.message === 'SYNC_TIMEOUT';

            // Errores irrecuperables — no reintentar jamás
            // Incluye: códigos PG conocidos, o errores HTTP 400 sin código PG (payload inválido)
            const isUnrecoverable = UNRECOVERABLE_CODES.has(errCode) ||
                (!isTimeout && !errCode && err?.message?.includes('400'));
            if (isUnrecoverable) {
                const errorDetail = `${errCode || 'HTTP_400'}: ${errMsg}${errDetails ? ' | ' + errDetails : ''}`;
                console.warn(`[Offline Sync] Venta marcada como fallida (error irreparable): ${errorDetail}`);
                updatedQueue = updatedQueue.map(q => q.id === item.id ? { ...q, sync_status: 'failed', failed_at: Date.now(), last_error: errorDetail } : q);
                failed++;
            } else if (attempts >= 10) {
                console.warn(`[Offline Sync] Venta marcada como fallida tras ${attempts} intentos: ${errMsg}${errDetails ? ' | ' + errDetails : ''}`);
                updatedQueue = updatedQueue.map(q => q.id === item.id ? { ...q, sync_status: 'failed', failed_at: Date.now(), attempts, last_error: `${errMsg}${errDetails ? ' | ' + errDetails : ''}` } : q);
                failed++;
            } else {
                // Backoff exponencial: 2s, 4s, 8s, 16s... hasta max 5 min
                // Si fue timeout, backoff más agresivo (x2)
                const baseDelay = isTimeout ? 2000 : 1000;
                const nextRetryAt = Date.now() + Math.min(300_000, baseDelay * Math.pow(2, attempts));
                updatedQueue = updatedQueue.map(q => q.id === item.id ? { ...q, attempts, next_retry_at: nextRetryAt } : q);
            }
          }
        }

        // Purgar items viejos: synced > 24h, failed > 7 días
        const purgedQueue = updatedQueue.filter(q => {
          if (q.sync_status === 'synced' && q.synced_at && now - q.synced_at > 24 * 60 * 60 * 1000) return false;
          if (q.sync_status === 'failed' && q.failed_at && now - q.failed_at > 7 * 24 * 60 * 60 * 1000) return false;
          return true;
        });
        await localforage.setItem(getQueueKey(), purgedQueue);

        const remainingPending = purgedQueue.filter(q => q.sync_status === 'pending').length;
        return { synced, failed, pending: remainingPending };
    } finally {
        releaseSyncLock();
    }
  }
};

let syncScheduled = false;
window.addEventListener('online', () => {
    if (syncScheduled) return;
    syncScheduled = true;
    setTimeout(() => {
        syncScheduled = false;
        console.log("[Offline Sync] Internet restaurado. Sincronizando ventas pendientes...");
        offlineQueueService.syncPendingSales(true);
    }, 2000);
});
