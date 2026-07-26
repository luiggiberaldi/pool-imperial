import { storageService } from './storageService.js';
import { procesarImpactoCliente } from './financialLogic.js';
import { round2 } from './dinero.js';

export function cleanCopAmount(val) {
    if (typeof val === 'number') return round2(Math.max(0, val));
    if (!val) return 0;
    const cleaned = String(val).replace(/[^0-9]/g, '');
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : round2(parsed);
}

/**
 * Procesa la lógica de abonar o endeudar a un cliente desde el TransactionModal.
 * Guarda en `bodega_customers_v1` y añade un registro en `bodega_sales_v1`.
 */
export async function processCustomerTransaction({
    transactionAmount, 
    currencyMode: _currencyMode, 
    type, 
    customer, 
    paymentMethod, 
    bcvRate: _bcvRate, 
    tasaCop: _tasaCop, 
    copEnabled: _copEnabled
}) {
    // En Pool Imperial todo se maneja en COP
    const amountCop = cleanCopAmount(transactionAmount);

    if (amountCop <= 0) {
        return { updatedCustomer: customer, newCustomers: await storageService.getItem('bodega_customers_v1', []) };
    }

    // Lógica financiera
    let transaccionOpts = {};
    if (type === 'ABONO') {
        transaccionOpts = { costoTotal: 0, pagoReal: amountCop, vueltoParaMonedero: amountCop };
    } else if (type === 'CREDITO') {
        transaccionOpts = { esCredito: true, deudaGenerada: amountCop };
    }

    const updatedCustomer = procesarImpactoCliente(customer, transaccionOpts);

    // Actualizar clientes
    const customers = await storageService.getItem('bodega_customers_v1', []);
    const newCustomers = customers.map(c => c.id === customer.id ? updatedCustomer : c);
    await storageService.setItem('bodega_customers_v1', newCustomers);
    try {
        const { useCustomersStore } = await import('../hooks/store/useCustomersStore');
        await useCustomersStore.getState().refresh();
    } catch (_) {}

    // Actualizar ventas
    const sales = await storageService.getItem('bodega_sales_v1', []);

    // Calcular correlativo secuencial
    const numericNums = sales
        .map(s => Number(s.saleNumber))
        .filter(n => Number.isInteger(n) && n > 0 && n < 90000);
    const nextSaleNumber = (numericNums.length > 0 ? Math.max(...numericNums) : 0) + 1;

    let newRecord = null;
    const custName = customer?.name || customer?.clienteName || 'Cliente';
    const custId = customer?.id || customer?.clienteId || null;

    if (type === 'ABONO') {
        const cobroRecord = {
            id: crypto.randomUUID(),
            saleNumber: nextSaleNumber,
            timestamp: new Date().toISOString(),
            tipo: 'COBRO_DEUDA',
            customerId: custId,
            customerName: custName,
            clienteId: custId,
            clienteName: custName,
            totalBs: 0,
            totalUsd: amountCop, // En Pool Imperial totalUsd almacena COP (campo heredado)
            totalCop: amountCop,
            paymentMethod: paymentMethod || 'efectivo',
            payments: [{
                methodId: paymentMethod || 'efectivo',
                amount: amountCop,
                currency: 'COP',
                amountUsd: amountCop,
                amountBs: 0,
                methodLabel: (paymentMethod || 'efectivo').replace('_', ' ')
            }],
            items: [{ name: `Abono de deuda: ${custName}`, qty: 1, priceUsd: amountCop, costBs: 0 }]
        };
        sales.unshift(cobroRecord);
        newRecord = cobroRecord;
    } else if (type === 'CREDITO') {
        const fiadoRecord = {
            id: crypto.randomUUID(),
            saleNumber: nextSaleNumber,
            timestamp: new Date().toISOString(),
            tipo: 'VENTA_FIADA',
            customerId: custId,
            customerName: custName,
            clienteId: custId,
            clienteName: custName,
            totalBs: 0,
            totalUsd: amountCop, // En Pool Imperial totalUsd almacena COP (campo heredado)
            totalCop: amountCop,
            fiadoUsd: amountCop,
            items: [{ name: `Credito manual: ${custName}`, qty: 1, priceUsd: amountCop, costBs: 0 }]
        };
        sales.unshift(fiadoRecord);
        newRecord = fiadoRecord;
    }

    await storageService.setItem('bodega_sales_v1', sales);

    if (newRecord) {
        try {
            const { useAuthStore } = await import('../hooks/store/authStore');
            const userId = useAuthStore.getState().cloudSession?.user?.id;
            if (userId) {
                const { broadcastNewSale } = await import('./salesSyncService');
                await broadcastNewSale(newRecord, userId);
            }
        } catch (e) {
            console.error("[processCustomerTransaction] Failed to broadcast sale:", e);
        }
    }

    return { updatedCustomer, newCustomers };
}

/**
 * Limpia registros corruptos o huérfanos de $0 en bodega_sales_v1
 */
export async function cleanOrphanZeroSales() {
    try {
        const sales = await storageService.getItem('bodega_sales_v1', []);
        let modified = false;
        const cleanedSales = sales.filter(s => {
            const isZero = (s.totalCop || 0) <= 0.001 && (s.totalUsd || 0) <= 0.001;
            const isDebtOrNoItems = s.tipo === 'COBRO_DEUDA' || !s.items || s.items.length === 0;
            if (isZero && isDebtOrNoItems && s.status !== 'ANULADA') {
                modified = true;
                return false;
            }
            return true;
        });
        if (modified) {
            await storageService.setItem('bodega_sales_v1', cleanedSales);
            console.log('[CleanZeroSales] Registros corruptos de $0 eliminados del historial.');
        }
        return cleanedSales;
    } catch (_) {
        return [];
    }
}
