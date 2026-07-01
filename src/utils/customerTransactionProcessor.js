import { storageService } from './storageService';
import { procesarImpactoCliente } from './financialLogic';
import { round2 } from './dinero';

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
    const rawAmount = parseFloat(transactionAmount);
    const amountCop = round2(rawAmount);

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

    if (type === 'ABONO') {
        // No crear registro si el monto es 0
        if (amountCop <= 0) {
            return { updatedCustomer, newCustomers };
        }
        const cobroRecord = {
            id: crypto.randomUUID(),
            saleNumber: nextSaleNumber,
            timestamp: new Date().toISOString(),
            tipo: 'COBRO_DEUDA',
            clienteId: customer.id,
            clienteName: customer.name,
            totalBs: 0,
            totalUsd: amountCop, // En Pool Imperial totalUsd almacena COP (campo heredado)
            totalCop: amountCop,
            paymentMethod: paymentMethod,
            payments: [{
                methodId: paymentMethod,
                amount: amountCop,
                currency: 'COP',
                amountUsd: amountCop,
                amountBs: 0,
                methodLabel: paymentMethod.replace('_', ' ')
            }],
            items: [{ name: `Abono de deuda: ${customer.name}`, qty: 1, priceUsd: amountCop, costBs: 0 }]
        };
        sales.unshift(cobroRecord);
    } else if (type === 'CREDITO') {
        const fiadoRecord = {
            id: crypto.randomUUID(),
            saleNumber: nextSaleNumber,
            timestamp: new Date().toISOString(),
            tipo: 'VENTA_FIADA',
            clienteId: customer.id,
            clienteName: customer.name,
            totalBs: 0,
            totalUsd: amountCop, // En Pool Imperial totalUsd almacena COP (campo heredado)
            totalCop: amountCop,
            fiadoUsd: amountCop,
            items: [{ name: `Credito manual: ${customer.name}`, qty: 1, priceUsd: amountCop, costBs: 0 }]
        };
        sales.unshift(fiadoRecord);
    }

    await storageService.setItem('bodega_sales_v1', sales);

    const newRecord = type === 'ABONO' ? cobroRecord : fiadoRecord;
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
