/**
 * salesSyncService.js
 *
 * Estrategia de mínimo egress para sincronización de ventas multi-dispositivo:
 *
 * 1. BROADCAST (Realtime P2P): notifica a dispositivos activos al instante — sin DB, sin egress.
 * 2. PERSIST por fila (sync_documents collection='sale'): cada venta es una fila individual,
 *    no el array completo. El pull incremental descarga solo las nuevas desde el último sync.
 * 3. PULL INCREMENTAL: al arrancar o al volver al primer plano, consulta solo las ventas
 *    con updated_at > last_pull → egress proporcional a ventas nuevas, no al historial total.
 */

import { supabaseCloud } from '../config/supabaseCloud';
import { storageService } from './storageService';
import { scopedKey } from '../hooks/store/accountScope';
import { subscribeResilient } from './realtimeReconnect';

const SALES_KEY = 'bodega_sales_v1';
const LAST_SALES_PULL_KEY_BASE = '_cloud_last_sales_pull_at';
const getLastSalesPullKey = () => scopedKey(LAST_SALES_PULL_KEY_BASE);
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);

let salesBroadcastChannel = null;
let salesBroadcastUserId = null;
let salesBroadcastSubscribed = false;

function getSalesBroadcastChannel(userId) {
    if (salesBroadcastChannel && salesBroadcastUserId === userId) {
        return salesBroadcastChannel;
    }
    if (salesBroadcastChannel) {
        salesBroadcastChannel.unsubscribe();
    }
    salesBroadcastChannel = supabaseCloud.channel(`sales_live:${userId}`);
    salesBroadcastUserId = userId;
    salesBroadcastSubscribed = false;
    return salesBroadcastChannel;
}

/**
 * Envía una venta a otros dispositivos.
 * - Broadcast Realtime (P2P, 0 egress DB) para dispositivos activos.
 * - Upsert en sync_documents como fila individual (recuperación offline).
 */
export async function broadcastNewSale(sale, userId) {
    if (!userId) return;

    // 1. Broadcast P2P — instantáneo, sin pasar por la DB
    try {
        const ch = getSalesBroadcastChannel(userId);
        await ch.send({
            type: 'broadcast',
            event: 'new_sale',
            payload: sale,
        });
    } catch (e) {
        // Non-fatal: el persist en DB actúa como fallback
        console.warn('[SalesSync] Broadcast P2P falló:', e?.message);
    }

    // 2. Persistir fila individual — fallback para dispositivos offline
    try {
        await supabaseCloud.from('sync_documents').upsert({
            user_id: userId,
            collection: 'sale',
            doc_id: sale.id,
            data: { payload: sale },
            updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,collection,doc_id' });
    } catch (e) {
        console.warn('[SalesSync] Persist en DB falló:', e?.message);
    }
}

/**
 * Envía la anulación de una venta a otros dispositivos.
 * - Broadcast Realtime (P2P, 0 egress DB) para dispositivos activos.
 * - Re-upsert en sync_documents con el nuevo estado 'ANULADA'.
 */
export async function broadcastVoidSale(sale, userId) {
    if (!userId || !sale) return;

    // 1. Broadcast P2P — solo si el canal ya está suscrito
    if (salesBroadcastSubscribed && salesBroadcastChannel) {
        try {
            await salesBroadcastChannel.send({
                type: 'broadcast',
                event: 'void_sale',
                payload: sale,
            });
            console.log(`[SalesSync] Broadcast void_sale enviado para venta ${sale.id}`);
        } catch (e) {
            console.warn('[SalesSync] Broadcast void_sale P2P falló:', e?.message);
        }
    } else {
        console.warn('[SalesSync] Canal P2P no suscrito aún — void_sale solo irá por DB');
    }

    // 2. Persistir fila individual en sync_documents — fallback para dispositivos offline
    try {
        await supabaseCloud.from('sync_documents').upsert({
            user_id: userId,
            collection: 'sale',
            doc_id: sale.id,
            data: { payload: sale },
            updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,collection,doc_id' });
        console.log(`[SalesSync] Venta #${sale.saleNumber || '?'} marcada como ANULADA en sync_documents ✓`);
    } catch (e) {
        console.warn('[SalesSync] Persist void_sale en sync_documents falló:', e?.message);
    }
}

/**
 * Identidad estable para mergear una venta local con su copia canónica.
 * El ID local y el ID del servidor pueden ser distintos después de un timeout;
 * la idempotency_key es la identidad de negocio que une ambos registros.
 */
function getSaleIdentity(sale) {
    return sale?.idempotency_key || sale?.idempotencyKey || null;
}

function findSaleIndex(sales, incoming) {
    const incomingKey = getSaleIdentity(incoming);
    const incomingServerId = incoming?.serverSaleId || incoming?.server_sale_id;
    const incomingLocalId = incoming?.localId || incoming?.local_sale_id;

    return sales.findIndex(existing =>
        existing?.id === incoming?.id
        || (incomingServerId && (existing.id === incomingServerId || existing.serverSaleId === incomingServerId || existing.server_sale_id === incomingServerId))
        || (incomingLocalId && (existing.id === incomingLocalId || existing.localId === incomingLocalId || existing.local_sale_id === incomingLocalId))
        || (incomingKey && getSaleIdentity(existing) === incomingKey)
    );
}

function mergeSale(existing, incoming) {
    const incomingId = incoming?.id;
    const isDifferentId = existing?.id && incomingId && existing.id !== incomingId;
    const serverId = incoming?.serverSaleId
        || incoming?.server_sale_id
        || (isDifferentId ? incomingId : existing?.serverSaleId || existing?.server_sale_id);

    const merged = {
        ...existing,
        ...incoming,
        ...(serverId ? { serverSaleId: serverId, server_sale_id: serverId } : {}),
        idempotency_key: getSaleIdentity(existing) || getSaleIdentity(incoming) || undefined,
    };

    // Mantener el ID local como clave de UI; el servidor queda explícito aparte.
    if (existing?.localId || existing?.local_sale_id) {
        merged.id = existing.id;
        merged.localId = existing.localId || existing.id;
        merged.local_sale_id = existing.local_sale_id || existing.localId || existing.id;
    }
    return merged;
}

async function fetchSaleDocuments(userId, since) {
    const pageSize = 500;
    const documents = [];
    let offset = 0;
    let hasMore = true;
    const sinceMs = since ? Date.parse(since) : NaN;

    while (hasMore) {
        let query = supabaseCloud
            .from('sync_documents')
            .select('doc_id, data, updated_at')
            .eq('user_id', userId)
            .eq('collection', 'sale')
            .order('updated_at', { ascending: true })
            .order('doc_id', { ascending: true })
            .range(offset, offset + pageSize - 1);

        if (Number.isFinite(sinceMs)) {
            query = query.gte(
                'updated_at',
                new Date(Math.max(0, sinceMs - 1000)).toISOString()
            );
        }

        const { data, error } = await query;
        if (error) throw error;
        const page = data || [];
        documents.push(...page);
        hasMore = page.length === pageSize;
        offset += pageSize;
    }
    return documents;
}

/**
 * Descarga ventas nuevas desde la nube (solo las que el dispositivo no tiene).
 * Usa last_pull timestamp → egress proporcional a ventas nuevas, no al historial.
 */
export async function pullNewSales(userId) {
    if (!userId) return 0;

    try {
        const sinceTimestamp = localStorage.getItem(getLastSalesPullKey());
        const sinceMs = sinceTimestamp ? Date.parse(sinceTimestamp) : NaN;

        // Solapamiento + paginación: no perder filas con el mismo timestamp ni
        // depender del límite implícito de PostgREST.
        const docs = await fetchSaleDocuments(userId, sinceTimestamp);
        if (!docs?.length) {
            // No avanzar el cursor cuando ya existía uno: un documento atrasado
            // debe seguir siendo elegible en el próximo intento.
            if (!Number.isFinite(sinceMs)) {
                localStorage.setItem(getLastSalesPullKey(), new Date().toISOString());
            }
            return 0;
        }

        const existingSales = await storageService.getItem(SALES_KEY, []);
        const mergedSales = [...existingSales];
        const newSales = [];
        let cierreUpdates = 0;

        for (const doc of docs) {
            const sale = doc.data?.payload;
            if (!sale) continue;

            const existingIndex = findSaleIndex(mergedSales, sale);
            if (existingIndex < 0) {
                newSales.push(sale);
                mergedSales.push(sale);
                continue;
            }

            const mergedSale = mergeSale(mergedSales[existingIndex], sale);
            if (JSON.stringify(mergedSale) !== JSON.stringify(mergedSales[existingIndex])) {
                mergedSales[existingIndex] = mergedSale;
                cierreUpdates++;
            }
        }

        if (newSales.length > 0 || cierreUpdates > 0) {
            mergedSales.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            await storageService.setItem(SALES_KEY, mergedSales);
            window.dispatchEvent(new CustomEvent('app_storage_update', { detail: { key: SALES_KEY } }));
            if (newSales.length > 0) console.log(`[SalesSync] Merged ${newSales.length} venta(s) nueva(s) desde la nube`);
            if (cierreUpdates > 0) console.log(`[SalesSync] Actualizadas ${cierreUpdates} venta(s) desde la nube`);
        }

        const maxUpdatedAtMs = docs.reduce((max, doc) => {
            const updatedAtMs = Date.parse(doc?.updated_at || '');
            return Number.isFinite(updatedAtMs) ? Math.max(max, updatedAtMs) : max;
        }, Number.isFinite(sinceMs) ? sinceMs : 0);
        if (maxUpdatedAtMs > 0) {
            localStorage.setItem(getLastSalesPullKey(), new Date(maxUpdatedAtMs).toISOString());
        }
        return newSales.length + cierreUpdates;
    } catch (e) {
        console.warn('[SalesSync] pullNewSales falló:', e?.message);
        throw e;
    }
}

/**
 * Sincroniza marcas de cierre (cajaCerrada, cierreId) a la nube para las ventas afectadas.
 * Esto asegura que otros dispositivos vean el historial de cierres correctamente.
 */
export async function syncCierreMarks(affectedSales, userId) {
    if (!userId || !affectedSales?.length) return;

    // 1. Broadcast P2P — otros dispositivos activos reciben al instante
    try {
        const ch = getSalesBroadcastChannel(userId);
        await ch.send({
            type: 'broadcast',
            event: 'cierre_marks',
            payload: affectedSales.map(s => ({
                id: s.id,
                cajaCerrada: s.cajaCerrada,
                cierreId: s.cierreId,
                closureId: s.closureId || null,
                cierre_id: s.cierre_id || null,
                closure_id: s.closure_id || null,
                cashSessionId: s.cashSessionId || s.cash_session_id || null,
            })),
        });
    } catch (e) {
        console.warn('[SalesSync] Broadcast cierre marks falló:', e?.message);
    }

    // 2. Re-upsert cada venta afectada en sync_documents con las marcas de cierre
    try {
        const rows = affectedSales.map(sale => ({
            user_id: userId,
            collection: 'sale',
            doc_id: sale.id,
            data: { payload: sale },
            updated_at: new Date().toISOString(),
        }));

        // Upsert en lotes de 50 para no saturar
        for (let i = 0; i < rows.length; i += 50) {
            const batch = rows.slice(i, i + 50);
            const { error } = await supabaseCloud.from('sync_documents').upsert(batch, {
                onConflict: 'user_id,collection,doc_id',
            });
            if (error) console.warn(`[SalesSync] Error sincronizando cierre batch ${i}:`, error.message);
        }
        console.log(`[SalesSync] ${affectedSales.length} ventas actualizadas con marcas de cierre en la nube ✓`);
    } catch (e) {
        console.warn('[SalesSync] Persist cierre marks falló:', e?.message);
    }
}

/**
 * Aplica una venta recibida por Broadcast/Realtime al estado local.
 * Mergea por ID canónico, ID local o idempotency_key para no duplicar una
 * venta que primero llegó offline y luego llegó desde Supabase.
 */
export async function applyIncomingSale(sale) {
    if (!sale?.id && !getSaleIdentity(sale)) return;
    try {
        const existingSales = await storageService.getItem(SALES_KEY, []);
        const existingIdx = findSaleIndex(existingSales, sale);

        if (existingIdx >= 0) {
            const updated = mergeSale(existingSales[existingIdx], sale);
            if (JSON.stringify(updated) === JSON.stringify(existingSales[existingIdx])) return;
            existingSales[existingIdx] = updated;
            await storageService.setItem(SALES_KEY, existingSales);
            window.dispatchEvent(new CustomEvent('app_storage_update', { detail: { key: SALES_KEY } }));
            console.log(`[SalesSync] Venta ${sale.id || getSaleIdentity(sale)} actualizada en tiempo real`);
            return;
        }

        const merged = [
            { ...sale, serverSaleId: sale.serverSaleId || sale.server_sale_id || sale.id },
            ...existingSales,
        ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        await storageService.setItem(SALES_KEY, merged);
        window.dispatchEvent(new CustomEvent('app_storage_update', { detail: { key: SALES_KEY } }));
        console.log(`[SalesSync] Venta recibida en tiempo real: ${sale.id || getSaleIdentity(sale)}`);
    } catch (e) {
        console.warn('[SalesSync] Error aplicando venta entrante:', e?.message);
    }
}

/**
 * Aplica marcas de cierre recibidas por Broadcast a ventas locales.
 */
export async function applyCierreMarks(marks) {
    if (!marks?.length) return;
    try {
        const existingSales = await storageService.getItem(SALES_KEY, []);
        const marksMap = new Map(marks.map(m => [m.id, m]));
        let changed = false;

        const updated = existingSales.map(s => {
            const mark = marksMap.get(s.id);
            if (mark && (
                s.cajaCerrada !== mark.cajaCerrada
                || String(s.cierreId ?? s.closureId ?? s.cierre_id ?? s.closure_id ?? '')
                    !== String(mark.cierreId ?? mark.closureId ?? mark.cierre_id ?? mark.closure_id ?? '')
                || (hasOwn(mark, 'cashSessionId') && s.cashSessionId !== mark.cashSessionId)
            )) {
                changed = true;
                return {
                    ...s,
                    cajaCerrada: mark.cajaCerrada,
                    cierreId: mark.cierreId ?? null,
                    closureId: mark.closureId ?? null,
                    cierre_id: mark.cierre_id ?? null,
                    closure_id: mark.closure_id ?? null,
                    cashSessionId: mark.cashSessionId || s.cashSessionId || null,
                };
            }
            return s;
        });

        if (changed) {
            await storageService.setItem(SALES_KEY, updated);
            window.dispatchEvent(new CustomEvent('app_storage_update', { detail: { key: SALES_KEY } }));
            console.log(`[SalesSync] Marcas de cierre aplicadas: ${marks.length} ventas`);
        }
    } catch (e) {
        console.warn('[SalesSync] Error aplicando marcas de cierre:', e?.message);
    }
}

/**
 * Suscribe al canal Broadcast para recibir ventas en tiempo real.
 * También escucha postgres_changes como capa de seguridad adicional.
 * Retorna función de cleanup.
 */
/**
 * Suscribe a postgres_changes en la tabla 'sales' para detectar cambios de status
 * (principalmente ANULADA). Esta es la capa más confiable de sincronización porque
 * funciona directamente a nivel de base de datos sin depender del broadcast P2P.
 */
export function subscribeSalesStatusChanges(userId, onStatusChange) {
    if (!userId) return () => {};

    console.log('[SalesSync] Suscribiendo a cambios de status de ventas (postgres_changes)...');

    const factory = () => {
        const ch = supabaseCloud
            .channel(`sales_status:${userId}`)
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'sales',
                    filter: `user_id=eq.${userId}`,
                },
                (payload) => {
                    const updated = payload.new;
                    if (!updated?.id) return;
                    console.log(`[SalesSync] postgres_changes UPDATE sales: id=${updated.id} status=${updated.status}`);
                    // Notificar para aplicar en IndexedDB local
                    onStatusChange(updated.id, updated.status);
                }
            );
        return ch;
    };

    const handle = subscribeResilient(factory, {
        label: '[SalesSync status]',
        onSubscribed: () => {
            console.log('[SalesSync] ✅ postgres_changes sales activo — anulaciones se propagan en tiempo real');
        },
    });

    return () => {
        handle.teardown();
    };
}

export function subscribeSalesRealtime(userId, onSaleReceived) {
    if (!userId) return () => {};

    // Factory: crea SIEMPRE una instancia nueva del canal con sus handlers, y la
    // publica como el canal cacheado de envío (broadcastNewSale usa esa referencia).
    const factory = () => {
        const ch = supabaseCloud.channel(`sales_live:${userId}`);
        ch.on('broadcast', { event: 'new_sale' }, ({ payload }) => {
            if (payload) onSaleReceived(payload);
        }).on('broadcast', { event: 'void_sale' }, ({ payload }) => {
            if (payload) onSaleReceived(payload);
        }).on('broadcast', { event: 'cierre_marks' }, ({ payload }) => {
            if (payload) applyCierreMarks(payload);
        });
        salesBroadcastChannel = ch;
        salesBroadcastUserId = userId;
        salesBroadcastSubscribed = false;
        return ch;
    };

    const handle = subscribeResilient(factory, {
        label: '[SalesSync]',
        onSubscribed: () => {
            salesBroadcastSubscribed = true;
            console.log('[SalesSync] Canal Broadcast de ventas activo');
        },
        onClosed: () => { salesBroadcastSubscribed = false; },
    });

    return () => {
        handle.teardown();
        salesBroadcastChannel = null;
        salesBroadcastUserId = null;
        salesBroadcastSubscribed = false;
    };
}

/**
 * Aplica un cambio de status de una venta al IndexedDB local.
 * Usado por subscribeSalesStatusChanges cuando llega un UPDATE de postgres_changes.
 */
export async function applySaleStatusChange(saleId, newStatus) {
    if (!saleId || !newStatus) return;
    try {
        const existingSales = await storageService.getItem(SALES_KEY, []);
        const idx = existingSales.findIndex(s =>
            s.id === saleId || s.serverSaleId === saleId || s.server_sale_id === saleId
        );
        if (idx < 0) {
            console.log(`[SalesSync] Venta ${saleId} no encontrada localmente — se actualizará en el próximo pull`);
            return;
        }
        const existing = existingSales[idx];
        if (existing.status === newStatus) return; // Ya está actualizada

        existingSales[idx] = { ...existing, status: newStatus };
        await storageService.setItem(SALES_KEY, existingSales);
        window.dispatchEvent(new CustomEvent('app_storage_update', { detail: { key: SALES_KEY } }));
        console.log(`[SalesSync] ✅ Venta ${saleId} actualizada localmente a status=${newStatus}`);
    } catch (e) {
        console.warn('[SalesSync] Error aplicando cambio de status:', e?.message);
    }
}
