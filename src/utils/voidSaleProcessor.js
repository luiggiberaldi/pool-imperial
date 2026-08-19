import { storageService } from './storageService';
import { logEvent } from '../services/auditService';
import { useAuthStore } from '../hooks/store/authStore';
import { round2 } from './dinero';
import { supabaseCloud } from '../config/supabaseCloud';
import { isNonProductSaleItem } from './calculatorUtils';

const SALES_KEY = 'bodega_sales_v1';
const CUSTOMERS_KEY = 'bodega_customers_v1';

/**
 * Busca en el historial de abonos de una sesión la(s) entrada(s) que corresponden
 * a una venta de abono: mismo monto (±$1) y fecha dentro de ±5 minutos.
 * Retorna [{ entry, index }] — puede ser vacío (no es venta de abono) o tener
 * más de un match (ambiguo: NO adivinar cuál revertir).
 */
export function findAbonoHistorialEntries(historial, sale) {
    if (!Array.isArray(historial) || historial.length === 0) return [];
    const saleTotal = Number(sale.totalCop ?? sale.totalUsd) || 0;
    if (saleTotal <= 0) return [];
    const saleTs = sale.timestamp ? new Date(sale.timestamp).getTime() : 0;
    return historial
        .map((entry, index) => ({ entry, index }))
        .filter(({ entry }) => {
            const amt = Number(entry.amount) || 0;
            if (Math.abs(amt - saleTotal) > 1) return false;
            if (!entry.date || !saleTs) return true; // entradas legacy sin fecha: match por monto
            return Math.abs(new Date(entry.date).getTime() - saleTs) <= 5 * 60 * 1000;
        });
}

/**
 * Si la venta anulada era un ABONO de una mesa aún activa, revierte sus efectos:
 * quita la entrada del HISTORIAL_ABONOS (para que el cierre no descuente un abono
 * que ya no existe) y, si el abono había retirado items de la comanda, los
 * reinserta SIN tocar stock (el descuento original de la comanda sigue vigente).
 *
 * Best-effort con guardarraíles: si el match es ambiguo no se revierte nada y se
 * deja constancia en la bitácora para ajuste manual.
 */
async function revertAbonoOnVoid(sale, user) {
    if (!sale?.tableSessionId) return null;

    const { useTablesStore } = await import('../hooks/store/useTablesStore');
    const session = (useTablesStore.getState().activeSessions || []).find(s => s.id === sale.tableSessionId);
    if (!session || !session.notes || !session.notes.includes('|||HISTORIAL_ABONOS:')) {
        // Sesión cerrada o sin historial: nada que revertir (ajuste manual de caja)
        if (sale.tableSessionId) {
            logEvent('VENTA', 'ABONO_ANULADO_SIN_SESION', `Venta #${sale.saleNumber || '?'} anulada; la mesa ya no está activa — revisar caja manualmente si era un abono.`, user, { saleId: sale.id });
        }
        return null;
    }

    const { parseSessionNotes, serializeSessionNotes } = await import('./tableBillingEngine');
    const { cleanNotes, abono, abonoMonto, historial } = parseSessionNotes(session.notes);
    const matches = findAbonoHistorialEntries(historial, sale);
    if (matches.length === 0) return null;
    if (matches.length > 1) {
        logEvent('VENTA', 'ABONO_ANULADO_AMBIGUO', `Venta #${sale.saleNumber || '?'} anulada: ${matches.length} entradas del historial coinciden — revertir manualmente en la mesa.`, user, { saleId: sale.id, sessionId: session.id });
        return { reverted: false, ambiguous: true };
    }

    const { entry, index } = matches[0];
    const newHistorial = historial.filter((_, i) => i !== index);
    const newNotes = serializeSessionNotes(cleanNotes, abono, abonoMonto, newHistorial);
    await useTablesStore.getState().updateSessionMetadata(session.id, session.client_name, session.guest_count, session.client_id, newNotes);

    // Reinsertar items retirados por el abono (solo productos reales; de a 1 unidad,
    // los pesos fraccionados no aplican a abonos por items)
    let itemsRestored = 0;
    if (entry.itemsRemoved === true) {
        try {
            const { useOrdersStore } = await import('../hooks/store/useOrdersStore');
            const creatorId = user?.id || null;
            const productItems = (sale.items || []).filter(i => !isNonProductSaleItem(i));
            for (const it of productItems) {
                const qty = Math.max(1, Math.round(Number(it.qty) || 1));
                for (let k = 0; k < qty; k++) {
                    await useOrdersStore.getState().addItemToSession(
                        session.table_id, session.id, creatorId,
                        { id: it.id, name: it.name, priceUsd: it.priceUsd }
                    );
                }
                itemsRestored += qty;
            }
        } catch (e) {
            console.error('[VoidSale] Abono revertido pero falló la reinserción de items en la comanda:', e);
            logEvent('VENTA', 'ABONO_ANULADO_ITEMS_PENDIENTES', `Abono #${sale.saleNumber || '?'} revertido, pero los items no volvieron a la comanda — agregarlos manualmente.`, user, { saleId: sale.id, sessionId: session.id });
        }
    }

    logEvent('VENTA', 'ABONO_ANULADO', `Abono de venta #${sale.saleNumber || '?'} ($${Number(entry.amount) || 0}) revertido del historial de la mesa${itemsRestored > 0 ? ` · ${itemsRestored} items devueltos a la comanda` : ''}.`, user, { saleId: sale.id, sessionId: session.id, amount: entry.amount });
    return { reverted: true, ambiguous: false, amount: Number(entry.amount) || 0, itemsRestored };
}

/**
 * Handles the logic of voiding a transaction, reverting stock, and reverting customer balances.
 */
export async function processVoidSale(sale, currentSales, currentProducts) {
    if (!sale) throw new Error("Sale object is required to void.");

    // 1. Marcar venta como ANULADA
    const updatedSales = currentSales.map(s => {
        if (s.id === sale.id) return { ...s, status: 'ANULADA' };
        return s;
    });

    // 2. Revertir Stock (misma lógica que checkoutProcessor pero invertida)
    // Ventas de mesa NUNCA descontaron stock en el checkout (lo hizo la comanda),
    // así que anularlas no debe restaurarlo. Fallback para ventas históricas sin
    // el campo skipStockDeduction: toda venta con tableSessionId es de mesa.
    const skipStockRestore = sale.skipStockDeduction ?? !!sale.tableSessionId;
    let updatedProducts = [...currentProducts];
    if (!skipStockRestore && sale.items && sale.items.length > 0) {
        // Calcular restauraciones por product ID (igual que deductions en checkout)
        const restorations = {};
        sale.items.forEach(item => {
            let restoration = 0;
            if (item.isWeight) restoration = item.qty;
            else if (item._mode === 'unit') restoration = (item.qty / (item._unitsPerPackage || 1));
            else restoration = item.qty;

            if (item.isCombo) {
                if (item.comboItems && item.comboItems.length > 0) {
                    // Multi-product combo: restaurar sub-productos
                    item.comboItems.forEach(ci => {
                        const ciRestoration = restoration * (ci.qty || 1);
                        restorations[ci.productId] = (restorations[ci.productId] || 0) + ciRestoration;
                    });
                } else if (item.linkedProductId) {
                    // Legacy single-product combo
                    const linkedRestoration = restoration * (item.linkedQty || 1);
                    restorations[item.linkedProductId] = (restorations[item.linkedProductId] || 0) + linkedRestoration;
                }
                // Combos no restauran su propio stock
            } else {
                const id = item._originalId || item.id;
                restorations[id] = (restorations[id] || 0) + restoration;
            }
        });

        updatedProducts = currentProducts.map(p => {
            if (restorations[p.id]) {
                if (p.isUnlimitedStock) return p;
                return { ...p, stock: round2((p.stock || 0) + restorations[p.id]) };
            }
            return p;
        });
    }

    // 3. Revertir Deuda Y Saldo a Favor del Cliente (por separado)
    const savedCustomers = await storageService.getItem(CUSTOMERS_KEY, []);
    let updatedCustomers = savedCustomers;

    if (sale.customerId) {
        // Monto que fue fiado (genera deuda) → revertir deuda
        const fiadoAmountUsd = sale.fiadoUsd || (sale.tipo === 'VENTA_FIADA' ? sale.totalUsd : 0) || 0;

        // Monto pagado con saldo a favor → restaurar favor
        const favorUsed = sale.payments
            ?.filter(p => p.methodId === 'saldo_favor')
            .reduce((sum, p) => sum + (p.amountUsd || 0), 0) || 0;

        if (fiadoAmountUsd > 0 || favorUsed > 0) {
            updatedCustomers = savedCustomers.map(c => {
                if (c.id !== sale.customerId) return c;

                let newDeuda = c.deuda || 0;
                let newFavor = c.favor || 0;

                // Revertir deuda (la venta fiada ya no existe)
                if (fiadoAmountUsd > 0) {
                    newDeuda = round2(Math.max(0, newDeuda - fiadoAmountUsd));
                }

                // Restaurar saldo a favor (el pago con favor se devuelve)
                if (favorUsed > 0) {
                    newFavor = round2(newFavor + favorUsed);
                }

                console.log(`[Anular] Cliente ${c.name}: deuda ${c.deuda}->${newDeuda}, favor ${c.favor}->${newFavor}`);
                return { ...c, deuda: newDeuda, favor: newFavor };
            });
        }
    }

    // 3.5 Revertir abono de mesa (historial + items de comanda) si aplica
    let abonoReversion = null;
    try {
        abonoReversion = await revertAbonoOnVoid(sale, useAuthStore.getState().usuarioActivo);
    } catch (e) {
        console.error('[VoidSale] Error revirtiendo abono de mesa:', e);
    }

    // 4. Guardar todo
    await storageService.setItem(SALES_KEY, updatedSales);
    await storageService.setItem(CUSTOMERS_KEY, updatedCustomers);

    // 5. Sincronizar y notificar anulación a otros dispositivos
    try {
        let userId = useAuthStore.getState().cloudSession?.user?.id;
        if (!userId) {
            const { data: { session } } = await supabaseCloud.auth.getSession().catch(() => ({ data: {} }));
            userId = session?.user?.id;
        }
        if (userId) {
            const { broadcastVoidSale } = await import('./salesSyncService');
            const voidedSale = { ...sale, status: 'ANULADA' };
            await Promise.all([
                broadcastVoidSale(voidedSale, userId),
                supabaseCloud.from('sales').update({ status: 'ANULADA' }).eq('id', sale.id)
            ]);
        }
    } catch (e) {
        console.error('[VoidSale] Error al sincronizar anulación:', e);
    }

    const user = useAuthStore.getState().usuarioActivo;
    logEvent('VENTA', 'VENTA_ANULADA', `Venta #${sale.saleNumber || '?'} anulada - $${sale.totalUsd?.toFixed(2)}`, user, { saleId: sale.id });

    return { updatedSales, updatedProducts, updatedCustomers, abonoReversion };
}

/**
 * Elimina permanentemente del almacenamiento todas las ventas marcadas con status: 'ANULADA'.
 */
export async function purgeAllAnnulledSales({ saleIds = null } = {}) {
    const sales = await storageService.getItem(SALES_KEY, []);
    const hasExplicitScope = Array.isArray(saleIds);
    const scopedIds = new Set((saleIds || []).filter(Boolean).map(id => String(id)));
    const annulled = sales.filter(s => s
        && s.status === 'ANULADA'
        && s.id !== null
        && s.id !== undefined
        && (!hasExplicitScope || scopedIds.has(String(s.id)))
    );
    if (annulled.length === 0) {
        return { count: 0, sales };
    }

    const ids = annulled.map(s => String(s.id)).filter(Boolean);

    let userId = useAuthStore.getState().cloudSession?.user?.id;
    if (!userId) {
        const { data: { session } } = await supabaseCloud.auth.getSession().catch(() => ({ data: {} }));
        userId = session?.user?.id;
    }
    if (userId && typeof navigator !== 'undefined' && navigator.onLine === false) {
        throw new Error('Conéctate a internet para purgar anuladas sin que vuelvan a aparecer en el reporte.');
    }

    if (userId && ids.length > 0) {
        const { error: salesError } = await supabaseCloud
            .from('sales')
            .delete()
            .eq('user_id', userId)
            .eq('status', 'ANULADA')
            .in('id', ids);
        if (salesError) {
            throw new Error(`No se pudo purgar la copia cloud de ventas: ${salesError.message}`);
        }

        const { error: syncError } = await supabaseCloud
            .from('sync_documents')
            .delete()
            .eq('user_id', userId)
            .eq('collection', 'sale')
            .in('doc_id', ids);
        if (syncError) {
            throw new Error(`No se pudo purgar la copia de sincronización: ${syncError.message}`);
        }
    }

    const removedIds = new Set(ids);
    const cleanedSales = sales.filter(s => !removedIds.has(String(s?.id)));
    await storageService.setItem(SALES_KEY, cleanedSales);

    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('app_storage_update', { detail: { key: SALES_KEY } }));
    }
    logEvent(
        'VENTA',
        'VENTAS_ANULADAS_PURGADAS',
        `${annulled.length} venta(s) anulada(s) purgada(s)${hasExplicitScope ? ' dentro del filtro confirmado' : ''}.`,
        useAuthStore.getState().usuarioActivo,
        { saleIds: ids, scoped: hasExplicitScope }
    );
    return { count: annulled.length, sales: cleanedSales, scoped: hasExplicitScope };
}
