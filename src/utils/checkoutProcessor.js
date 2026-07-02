import { storageService } from './storageService';
import { procesarImpactoCliente } from './financialLogic';
import { logEvent } from '../services/auditService';
import { useAuthStore } from '../hooks/store/authStore';
import { round2, subR, sumR } from './dinero';
import { supabaseCloud as supabase } from '../config/supabaseCloud';
import { offlineQueueService } from '../services/offlineQueueService';
import { capitalizeName } from './calculatorUtils';
import { broadcastNewSale } from './salesSyncService';

// Pool Imperial — Moneda única COP
// Todos los totales, pagos y cálculos son en Pesos Colombianos (COP).
// Los campos con nombre "Usd" son heredados del esquema original y
// ahora almacenan valores COP directamente. NO renombrar — el RPC depende de ellos.

const SALES_KEY = 'bodega_sales_v1';
const EPSILON = 1; // 1 peso colombiano de tolerancia (antes era $0.01)

// UUID v4 regex - productos sin formato UUID no se envían al RPC de Supabase
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isValidUUID = (id) => UUID_REGEX.test(id);

export async function processSaleTransaction({
    cart,
    cartTotalCOP,          // Total en COP (campo: cartTotalUsd heredado → ahora COP)
    cartSubtotalCOP,       // Subtotal en COP antes de descuento
    payments,
    changeBreakdown,
    selectedCustomerId,
    customers,
    products,
    discountData,
    meseroId = null,
    meseroNombre = null,
    tableName = null,
    tableSessionId = null,
    splitMeta = null,
    skipStockDeduction = false,
    // Alias de compatibilidad (llamadores legacy pueden pasar cartTotalUsd)
    cartTotalUsd,
    cartSubtotalUsd,
    totalTax,
    taxBreakdown,
    tasaCop,
    ivaRate = 19,
}) {
    // Obtener usuario actual del store
    const currentUser = useAuthStore.getState().currentUser;

    // Compatibilidad con llamadores que aún usan el nombre legacy
    const totalCOP = cartTotalCOP ?? cartTotalUsd ?? 0;
    const subtotalCOP = cartSubtotalCOP ?? cartSubtotalUsd ?? 0;

    if (cart.length === 0) return { success: false, error: 'Carrito vacío' };

    const selectedCustomer = customers.find(c => c.id === selectedCustomerId);
    const totalPaid = sumR(payments.map(p => p.amountUsd));
    const remaining = round2(Math.max(0, subR(totalCOP, totalPaid)));

    console.log('[checkoutProcessor] totalCOP:', totalCOP, 'totalPaid:', totalPaid, 'remaining:', remaining, 'EPSILON:', EPSILON);
    if (!selectedCustomer && remaining > EPSILON) {
        console.warn('[checkoutProcessor] FIADO triggered! remaining:', remaining, '| cartTotal:', totalCOP, '- totalPaid:', totalPaid);
        return { success: false, error: 'Se requiere cliente para ventas fiadas' };
    }

    if (isNaN(totalCOP) || totalCOP < 0 || isNaN(totalPaid) || totalPaid < 0) {
        return { success: false, error: 'Integridad matemática comprometida' };
    }

    if (totalCOP <= EPSILON) {
        return { success: false, error: 'No se pueden generar ventas de $ 0' };
    }

    // Validar saldo a favor ANTES de persistir
    if (selectedCustomerId) {
        const saldoFavorUsed = payments.filter(p => p.methodId === 'saldo_favor').reduce((sum, p) => sum + p.amountUsd, 0);
        if (saldoFavorUsed > (selectedCustomer?.favor || 0) + EPSILON) {
            return { success: false, error: 'Saldo a favor insuficiente' };
        }
    }

    const fiadoAmount = remaining > EPSILON ? remaining : 0;

    // Preparar payload para RPC — solo productos con UUID válido
    const cartForRpc = cart.filter(i => isValidUUID(i._originalId || i.id));
    const hasRpcCompatibleItems = cartForRpc.length > 0;

    const rpcCartItems = cartForRpc.map(i => ({
        id: i._originalId || i.id,
        name: i.name || 'Producto',
        qty: i.qty,
        priceUsd: i.priceUsd,  // El RPC usa este campo — almacena precio COP
        price_usd: i.priceUsd, // Adicional para retrocompatibilidad segura
        isCombo: i.isCombo || false,
        linkedProductId: i.linkedProductId || null,
        linkedQty: i.linkedQty || 1,
        comboItems: i.comboItems || null
    }));
    const rpcTotal = round2(rpcCartItems.reduce((s, ci) => s + ci.qty * ci.priceUsd, 0));

    // Ajustar fiado proporcionalmente si el total RPC difiere del original
    const rpcFiado = rpcTotal !== totalCOP && fiadoAmount > 0
        ? round2(Math.max(0, rpcTotal - round2(totalCOP - fiadoAmount)))
        : fiadoAmount;

    // Ajustar pagos para el RPC: sum(pagos) + fiado == sum(qty*priceUsd)
    let rpcPayments = payments.map(p => ({
        methodId: p.methodId,
        amountUsd: p.amountUsd,
        currency: p.currency || 'COP',
        methodLabel: p.methodLabel || p.methodId,
        isAbonoPrevio: p.isAbonoPrevio || false
    }));

    const rpcPayTotal = rpcPayments.reduce((s, p) => s + (p.amountUsd || 0), 0);
    const rpcExcess = round2(rpcPayTotal + rpcFiado - rpcTotal);
    if (rpcExcess > EPSILON && rpcPayments.length > 0) {
        let remaining2 = rpcExcess;
        for (let i = rpcPayments.length - 1; i >= 0 && remaining2 > EPSILON; i--) {
            const reduction = Math.min(remaining2, rpcPayments[i].amountUsd);
            rpcPayments[i] = { ...rpcPayments[i], amountUsd: round2(rpcPayments[i].amountUsd - reduction) };
            remaining2 = round2(remaining2 - reduction);
        }
        rpcPayments = rpcPayments.filter(p => p.amountUsd > EPSILON);
    }

    // Absorber diferencia residual de redondeo en el último pago
    const finalPaySum = round2(rpcPayments.reduce((s, p) => s + p.amountUsd, 0));
    const residual = round2(rpcTotal - finalPaySum - rpcFiado);
    if (Math.abs(residual) > 0.001 && rpcPayments.length > 0) {
        rpcPayments[rpcPayments.length - 1] = {
            ...rpcPayments[rpcPayments.length - 1],
            amountUsd: round2(rpcPayments[rpcPayments.length - 1].amountUsd + residual)
        };
    }

    const rpcPayload = {
        total: rpcTotal,
        cart: rpcCartItems,
        payments: rpcPayments,
        fiadoUsd: rpcFiado,
        vendedorId: isValidUUID(currentUser?.id) ? currentUser.id : null,
        vendedorNombre: capitalizeName(currentUser?.nombre || currentUser?.name || 'Sistema'),
        vendedorRol: currentUser?.rol || currentUser?.role || null,
        meseroId: isValidUUID(meseroId) ? meseroId : null,
        meseroNombre: capitalizeName(meseroNombre) || null,
        tableName: tableName || null,
        customerId: isValidUUID(selectedCustomerId) ? selectedCustomerId : null
    };

    let saleMode = 'online';
    let finalSaleId = null;

    const idempotencyKey = crypto.randomUUID();
    rpcPayload.idempotency_key = idempotencyKey;

    if (!hasRpcCompatibleItems) {
        console.log('[Checkout] Carrito sin UUIDs válidos — usando MODO OFFLINE directamente.');
        saleMode = 'offline';
    } else if (navigator.onLine) {
        try {
            const rpcPromise = supabase.rpc('process_checkout', { payload: rpcPayload });
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 8000));
            const { data, error } = await Promise.race([rpcPromise, timeoutPromise]);
            if (error) throw error;
            finalSaleId = data.sale_id;
        } catch (err) {
            if (err.message === 'TIMEOUT') {
                console.warn('[Checkout] RPC timeout — cola de verificación pendiente', err);
                saleMode = 'pending_verification';
                await offlineQueueService.addSaleToQueue({ ...rpcPayload, _pendingVerification: true });
            } else {
                console.warn('[Checkout] Fallo RPC, cambiando a MODO OFFLINE', err);
                saleMode = 'offline';
            }
        }
    } else {
        saleMode = 'offline';
    }

    if (saleMode === 'offline') {
        await offlineQueueService.addSaleToQueue(rpcPayload);
    }

    // ── CACHÉ LOCAL ──
    const finalTaxAmount = totalTax !== undefined ? totalTax : Math.round(totalCOP - (totalCOP / (1 + ((ivaRate || 19) / 100))));

    const sale = {
        id: finalSaleId || crypto.randomUUID(),
        tipo: fiadoAmount > 0 ? 'VENTA_FIADA' : 'VENTA',
        status: saleMode === 'online' ? 'COMPLETADA' : (saleMode === 'pending_verification' ? 'PENDIENTE_VERIFICACION' : 'PENDIENTE_SYNC'),
        vendedorId: currentUser?.id || null,
        vendedorNombre: capitalizeName(currentUser?.nombre || currentUser?.name || 'Sistema'),
        vendedorRol: currentUser?.rol || currentUser?.role || null,
        meseroId: meseroId || null,
        meseroNombre: capitalizeName(meseroNombre) || null,
        tableName: tableName || null,
        tableSessionId: tableSessionId || null,
        // Campos de items — priceUsd almacena precio COP (campo heredado)
        items: cart.map(i => ({ id: i.id, name: i.name, qty: i.qty, priceUsd: i.priceUsd, costUsd: i.costUsd || 0, isWeight: i.isWeight, taxType: i.taxType || 'exento', taxMode: i.taxMode || 'inclusive', isTip: i.isTip || false, isServiceCharge: i.isServiceCharge || false })),
        cartSubtotalUsd: subtotalCOP,   // heredado — ahora COP
        discountType: discountData?.type || null,
        discountValue: discountData?.value || 0,
        discountAmountUsd: discountData?.amountUsd || 0,  // heredado — COP
        totalUsd: totalCOP,              // heredado — ahora COP
        totalBs: 0,                      // siempre 0 en Pool Imperial
        totalCop: totalCOP,              // campo explícito COP
        payments,
        rate: tasaCop || 1,
        rateSource: (tasaCop && tasaCop > 1) ? 'manual_cop' : 'COP',
        timestamp: new Date().toISOString(),
        changeUsd: fiadoAmount > 0 ? 0 : (changeBreakdown?.changeUsdGiven || 0),
        changeBs: 0,                     // siempre 0 en Pool Imperial
        customerId: selectedCustomerId || null,
        customerName: selectedCustomer ? selectedCustomer.name : 'Consumidor Final',
        customerDocument: selectedCustomer?.documentId || null,
        customerPhone: selectedCustomer?.phone || null,
        fiadoUsd: fiadoAmount,           // heredado — COP
        splitMeta: splitMeta || null,
        ivaRate: 0,
        ivaAmount: finalTaxAmount || 0,
        taxBreakdown: taxBreakdown || {},
    };

    const existingSales = await storageService.getItem(SALES_KEY, []);
    const numericNums = existingSales
        .map(s => Number(s.saleNumber))
        .filter(n => Number.isInteger(n) && n > 0 && n < 90000);
    const saleNumber = (numericNums.length > 0 ? Math.max(...numericNums) : 0) + 1;
    const finalPersistedSale = Object.freeze({ ...sale, saleNumber });

    await storageService.setItem(SALES_KEY, [finalPersistedSale, ...existingSales]);

    // Sincronizar a otros dispositivos vía Broadcast P2P
    supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.user?.id) {
            broadcastNewSale({ ...finalPersistedSale }, session.user.id).catch(() => {});
        }
    }).catch(() => {});

    // Audit log
    const tipo = fiadoAmount > 0 ? 'VENTA_FIADO' : 'VENTA_COMPLETADA';
    const totalFormatted = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(totalCOP);
    logEvent('VENTA', tipo, `Venta #${saleNumber} [${saleMode.toUpperCase()}] - ${totalFormatted} - ${cart.length} items - ${selectedCustomer?.name || 'Consumidor Final'}`, currentUser, { saleId: finalPersistedSale.id, total: totalCOP, items: cart.length });

    // ── DESCUENTO DE STOCK ──
    let updatedProducts = products;

    if (!skipStockDeduction) {
        const deductions = {};
        cart.forEach(item => {
            let deduction = 0;
            if (item.isWeight) deduction = item.qty;
            else if (item._mode === 'unit') deduction = (item.qty / (item._unitsPerPackage || 1));
            else deduction = item.qty;

            if (item.isCombo) {
                if (item.comboItems && item.comboItems.length > 0) {
                    item.comboItems.forEach(ci => {
                        const ciDeduction = deduction * (ci.qty || 1);
                        deductions[ci.productId] = (deductions[ci.productId] || 0) + ciDeduction;
                    });
                } else if (item.linkedProductId) {
                    const linkedDeduction = deduction * (item.linkedQty || 1);
                    deductions[item.linkedProductId] = (deductions[item.linkedProductId] || 0) + linkedDeduction;
                }
            } else {
                const id = item._originalId || item.id;
                deductions[id] = (deductions[id] || 0) + deduction;
            }
        });

        updatedProducts = products.map(p => {
            if (deductions[p.id]) {
                if (p.isUnlimitedStock) return p;
                const allowNeg = localStorage.getItem('allow_negative_stock') === 'true';
                const newStock = (p.stock ?? 0) - deductions[p.id];
                return { ...p, stock: allowNeg ? newStock : Math.max(0, newStock) };
            }
            return p;
        });

        await storageService.setItem('bodega_products_v1', updatedProducts);
    }

    let updatedCustomer = null;
    let updatedCustomers = customers;

    if (selectedCustomer) {
        const amount_favor_used = payments.filter(p => p.methodId === 'saldo_favor').reduce((sum, p) => sum + p.amountUsd, 0);

        const transaccionOpts = {
            usaSaldoFavor: amount_favor_used,
            esCredito: fiadoAmount > EPSILON,
            deudaGenerada: fiadoAmount,
            vueltoParaMonedero: 0
        };

        updatedCustomer = procesarImpactoCliente(selectedCustomer, transaccionOpts);
        updatedCustomers = customers.map(c => c.id === selectedCustomer.id ? updatedCustomer : c);

        await storageService.setItem('bodega_customers_v1', updatedCustomers);
        try {
            const { useCustomersStore } = await import('../hooks/store/useCustomersStore');
            await useCustomersStore.getState().refresh();
        } catch (_) {}
    }

    return {
        success: true,
        sale: finalPersistedSale,
        updatedProducts,
        updatedCustomers,
        syncMode: saleMode
    };
}
