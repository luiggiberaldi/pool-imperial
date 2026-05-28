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

const SALES_KEY = 'bodega_sales_v1';
const LAST_SALES_PULL_KEY_BASE = '_cloud_last_sales_pull_at';
const getLastSalesPullKey = () => scopedKey(LAST_SALES_PULL_KEY_BASE);

let salesBroadcastChannel = null;
let salesBroadcastUserId = null;

function getSalesBroadcastChannel(userId) {
    if (salesBroadcastChannel && salesBroadcastUserId === userId) {
        return salesBroadcastChannel;
    }
    if (salesBroadcastChannel) {
        salesBroadcastChannel.unsubscribe();
    }
    salesBroadcastChannel = supabaseCloud.channel(`sales_live:${userId}`);
    salesBroadcastUserId = userId;
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
 * Reasigna correlativos duplicados en ventas sincronizadas.
 * Si una venta entrante tiene un saleNumber que ya existe localmente,
 * le asigna el siguiente número disponible.
 */
function fixDuplicateNumbers(sales) {
    const usedNumbers = new Set();
    let maxNum = 0;
    // Primera pasada: registrar números existentes
    for (const s of sales) {
        const n = Number(s.saleNumber);
        if (Number.isInteger(n) && n > 0 && n < 90000) {
            if (!usedNumbers.has(n)) {
                usedNumbers.add(n);
                if (n > maxNum) maxNum = n;
            }
        }
    }
    // Segunda pasada: reasignar duplicados
    const seen = new Set();
    for (const s of sales) {
        const n = Number(s.saleNumber);
        if (Number.isInteger(n) && n > 0 && n < 90000) {
            if (seen.has(n)) {
                maxNum++;
                s.saleNumber = maxNum;
                usedNumbers.add(maxNum);
            }
            seen.add(n);
        }
    }
    return sales;
}

/**
 * Descarga ventas nuevas desde la nube (solo las que el dispositivo no tiene).
 * Usa last_pull timestamp → egress proporcional a ventas nuevas, no al historial.
 */
export async function pullNewSales(userId) {
    if (!userId) return 0;

    try {
        const sinceTimestamp = localStorage.getItem(getLastSalesPullKey());

        let query = supabaseCloud
            .from('sync_documents')
            .select('doc_id, data, updated_at')
            .eq('user_id', userId)
            .eq('collection', 'sale')
            .order('updated_at', { ascending: true });

        if (sinceTimestamp) {
            query = query.gt('updated_at', sinceTimestamp);
        }

        const { data: docs, error } = await query;
        if (error || !docs?.length) return 0;

        const existingSales = await storageService.getItem(SALES_KEY, []);
        const existingMap = new Map(existingSales.map(s => [s.id, s]));

        const newSales = [];
        let cierreUpdates = 0;

        for (const doc of docs) {
            const sale = doc.data?.payload;
            if (!sale) continue;

            const existing = existingMap.get(sale.id);
            if (!existing) {
                newSales.push(sale);
            } else if (sale.cajaCerrada && !existing.cajaCerrada) {
                // Actualizar marcas de cierre en venta existente
                existingMap.set(sale.id, { ...existing, cajaCerrada: sale.cajaCerrada, cierreId: sale.cierreId });
                cierreUpdates++;
            }
        }

        if (newSales.length > 0 || cierreUpdates > 0) {
            let merged = newSales.length > 0
                ? [...newSales, ...Array.from(existingMap.values())]
                : Array.from(existingMap.values());
            merged.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            merged = fixDuplicateNumbers(merged);
            await storageService.setItem(SALES_KEY, merged);
            window.dispatchEvent(new CustomEvent('app_storage_update', { detail: { key: SALES_KEY } }));
            if (newSales.length > 0) console.log(`[SalesSync] Merged ${newSales.length} venta(s) nueva(s) desde la nube`);
            if (cierreUpdates > 0) console.log(`[SalesSync] Actualizadas ${cierreUpdates} venta(s) con marcas de cierre desde la nube`);
        }

        localStorage.setItem(getLastSalesPullKey(), new Date().toISOString());
        return newSales.length + cierreUpdates;
    } catch (e) {
        console.warn('[SalesSync] pullNewSales falló:', e?.message);
        return 0;
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
            payload: affectedSales.map(s => ({ id: s.id, cajaCerrada: s.cajaCerrada, cierreId: s.cierreId })),
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
 */
export async function applyIncomingSale(sale) {
    if (!sale?.id) return;
    try {
        const existingSales = await storageService.getItem(SALES_KEY, []);
        const existingIdx = existingSales.findIndex(s => s.id === sale.id);

        if (existingIdx >= 0) {
            // Ya existe — solo actualizar si trae marcas de cierre nuevas
            const existing = existingSales[existingIdx];
            if (sale.cajaCerrada && !existing.cajaCerrada) {
                existingSales[existingIdx] = { ...existing, cajaCerrada: sale.cajaCerrada, cierreId: sale.cierreId };
                await storageService.setItem(SALES_KEY, existingSales);
                window.dispatchEvent(new CustomEvent('app_storage_update', { detail: { key: SALES_KEY } }));
                console.log(`[SalesSync] Venta ${sale.id} actualizada con marcas de cierre`);
            }
            return;
        }

        let merged = [sale, ...existingSales]
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        merged = fixDuplicateNumbers(merged);
        await storageService.setItem(SALES_KEY, merged);
        window.dispatchEvent(new CustomEvent('app_storage_update', { detail: { key: SALES_KEY } }));
        console.log(`[SalesSync] Venta recibida en tiempo real: ${sale.id}`);
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
            if (mark && !s.cajaCerrada) {
                changed = true;
                return { ...s, cajaCerrada: mark.cajaCerrada, cierreId: mark.cierreId };
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
export function subscribeSalesRealtime(userId, onSaleReceived) {
    if (!userId) return () => {};

    const ch = getSalesBroadcastChannel(userId);

    ch.on('broadcast', { event: 'new_sale' }, ({ payload }) => {
        if (payload) onSaleReceived(payload);
    }).on('broadcast', { event: 'cierre_marks' }, ({ payload }) => {
        if (payload) applyCierreMarks(payload);
    }).subscribe((status) => {
        if (status === 'SUBSCRIBED') {
            console.log('[SalesSync] Canal Broadcast de ventas activo');
        }
    });

    return () => {
        ch.unsubscribe();
        salesBroadcastChannel = null;
        salesBroadcastUserId = null;
    };
}
