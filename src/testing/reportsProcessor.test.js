import assert from 'node:assert/strict';
import { buildReportRange } from '../utils/reportRangeEngine.js';
const localStore = new Map();
globalThis.localStorage = {
    getItem: key => localStore.has(key) ? localStore.get(key) : null,
    setItem: (key, value) => localStore.set(key, String(value)),
    removeItem: key => localStore.delete(key),
};
globalThis.window = {
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {},
};
Object.defineProperty(globalThis, 'navigator', {
    value: { onLine: false },
    configurable: true,
});
globalThis.fetch = async () => new Response(JSON.stringify([]), {
    status: 200,
    headers: { 'content-type': 'application/json' },
});

const {
    aggregateProductSales,
    calculateReportsData,
    getReportProductLines,
    groupSalesByCierreId,
} = await import('../utils/reportsProcessor.js');

const now = new Date('2026-08-18T18:00:00.000Z');
const dayRange = buildReportRange({ kind: 'today', now });
const activeShift = buildReportRange({
    kind: 'current_shift',
    now,
    cashSession: { id: 'cash-1', opened_at: '2026-08-18T12:00:00.000Z' },
});

const saleWithTipAndDiscount = {
    id: 'sale-1',
    tipo: 'VENTA',
    status: 'COMPLETADA',
    timestamp: '2026-08-18T14:00:00.000Z',
    cashSessionId: 'cash-1',
    totalCop: 2300,
    totalUsd: 2300,
    discountAmountUsd: 200,
    ivaAmount: 200,
    taxBreakdown: { iva_19: 200 },
    payments: [{ methodId: 'efectivo_cop', amountUsd: 2300, currency: 'COP' }],
    items: [
        { id: 'prod-1', name: 'Bebida histórica', qty: 2, priceUsd: 1000, costUsd: 500 },
        { id: 'TIP-1', name: 'Propina del Personal (10%)', qty: 1, priceUsd: 100, isTip: true },
        { id: 'SERVICE-1', name: 'Servicio Voluntario (10%)', qty: 1, priceUsd: 100, isServiceCharge: true },
    ],
};

const renamedHistoricalSale = {
    id: 'sale-2',
    tipo: 'VENTA',
    status: 'COMPLETADA',
    timestamp: '2026-08-18T15:00:00.000Z',
    cashSessionId: 'cash-1',
    totalCop: 500,
    totalUsd: 500,
    payments: [{ methodId: 'pago_movil', amountUsd: 500, currency: 'COP' }],
    items: [{ _originalId: 'prod-1', id: 'legacy-copy', name: 'Bebida renombrada', qty: 0.5, priceUsd: 1000, costUsd: 500 }],
};

const voidedSale = {
    ...renamedHistoricalSale,
    id: 'sale-voided',
    status: 'ANULADA',
    timestamp: '2026-08-18T16:00:00.000Z',
};

const debtCollection = {
    id: 'debt-1',
    tipo: 'COBRO_DEUDA',
    status: 'COMPLETADA',
    timestamp: '2026-08-18T16:30:00.000Z',
    cashSessionId: 'cash-1',
    totalCop: 300,
    totalUsd: 300,
    payments: [{ methodId: 'efectivo_cop', amountUsd: 300, currency: 'COP' }],
};

const providerPayment = {
    id: 'provider-1',
    tipo: 'PAGO_PROVEEDOR',
    status: 'COMPLETADA',
    timestamp: '2026-08-18T16:45:00.000Z',
    cashSessionId: 'cash-1',
    totalCop: 100,
    totalUsd: 100,
    afectaCaja: true,
    payments: [{ methodId: 'efectivo_cop', amountUsd: 100, currency: 'COP' }],
};

const otherShiftSale = {
    ...renamedHistoricalSale,
    id: 'sale-other-shift',
    timestamp: '2026-08-18T17:00:00.000Z',
    cashSessionId: 'cash-2',
};

const products = [{ id: 'prod-1', name: 'Producto actual', costUsd: 500 }];
const allSales = [
    saleWithTipAndDiscount,
    renamedHistoricalSale,
    voidedSale,
    debtCollection,
    providerPayment,
    otherShiftSale,
];

const productLines = getReportProductLines(saleWithTipAndDiscount);
assert.equal(productLines.length, 1, 'propinas y servicio no son productos');
assert.equal(productLines[0].qty, 2);
assert.equal(productLines[0].revenue, 1800, 'el descuento se asigna sin inflar el artículo');

const groupedProducts = aggregateProductSales([saleWithTipAndDiscount, renamedHistoricalSale]);
assert.equal(groupedProducts.length, 1, 'el producto se agrupa por ID histórico');
assert.equal(groupedProducts[0].productId, 'prod-1');
assert.equal(groupedProducts[0].qty, 2.5);
assert.equal(groupedProducts[0].revenue, 2300);

const report = calculateReportsData(allSales, dayRange, 1, products, 4150, null);
assert.equal(report.salesForStats.some(sale => sale.id === 'sale-voided'), false, 'las anuladas no impactan métricas');
assert.equal(report.salesForStats.length, 3);
assert.equal(report.historySales.length, 4, 'las anuladas se conservan para auditoría');
assert.equal(report.totalCOP, 3300);
assert.equal(report.totalTax, 200);
assert.equal(report.netRevenue, 3100);
assert.equal(report.totalItems, 3);
assert.equal(report.debtTotal, 300);
assert.equal(report.salesForCashFlow.length, 5, 'incluye deuda y egreso de proveedor, excluye anuladas');
assert.equal(report.productSales[0].revenue, 2800);
assert.equal(report.profit, 1300, 'la propina no se convierte en ganancia de inventario');

const pendingReport = calculateReportsData([{
    ...renamedHistoricalSale,
        id: 'sale-pending',
        status: 'PENDIENTE_SYNC',
        totalCop: 900,
        totalUsd: 900,
    },
], dayRange, 1, products, 4150, null);
assert.equal(pendingReport.salesForStats.length, 0, 'pendientes no impactan métricas financieras');
assert.equal(pendingReport.historySales.length, 1, 'pendientes siguen visibles en auditoría');

const breakdownOnlyReport = calculateReportsData([{
    id: 'tax-only',
    tipo: 'VENTA',
    status: 'COMPLETADA',
    timestamp: '2026-08-18T17:30:00.000Z',
    totalCop: 119,
    taxBreakdown: { iva_19: 19 },
    items: [],
}], dayRange, 1, [], 4150, null);
assert.equal(breakdownOnlyReport.totalTax, 19, 'el impuesto usa el desglose cuando falta ivaAmount');

const shiftReport = calculateReportsData(allSales, activeShift, 1, products, 4150, { id: 'cash-1' });
assert.equal(shiftReport.salesForStats.some(sale => sale.id === 'sale-other-shift'), false);
assert.equal(shiftReport.salesForStats.length, 2);

const closureId = 'closure-1';
const closureReport = groupSalesByCierreId([
    { id: 'open-1', tipo: 'APERTURA_CAJA', cierreId: closureId, timestamp: '2026-08-18T12:00:00.000Z', cashSessionId: 'cash-1' },
    { ...saleWithTipAndDiscount, cierreId: closureId },
    { ...debtCollection, cierreId: closureId },
    { id: 'close-1', tipo: 'CIERRE_CAJA', cierreId: closureId, closedAt: '2026-08-18T17:30:00.000Z', cashSessionId: 'cash-1' },
], dayRange, products);
assert.equal(closureReport.length, 1);
assert.equal(closureReport[0].cashSessionId, 'cash-1');
assert.equal(closureReport[0].salesForStats.length, 1);
assert.equal(closureReport[0].debtCollections.length, 1);
assert.equal(closureReport[0].totalCOP, 2300);

const wrongShiftClosure = groupSalesByCierreId([
    { id: 'wrong-sale', tipo: 'VENTA', status: 'COMPLETADA', timestamp: '2026-08-18T16:00:00.000Z', totalCop: 100, cashSessionId: 'cash-2', cierreId: 'closure-2', items: [] },
    { id: 'wrong-close', tipo: 'CIERRE_CAJA', cierreId: 'closure-2', closedAt: '2026-08-18T17:00:00.000Z', cashSessionId: 'cash-2' },
], activeShift, products);
assert.equal(wrongShiftClosure.length, 0, 'un cierre de otra caja no entra en Turno Actual');

assert.equal(getReportProductLines({ items: [{ id: 'bad-qty', name: 'Legacy', qty: 'not-a-number', priceUsd: 100 }] }).length, 0);

console.log('reports-processor-tests: OK (totales, impuestos, históricos, anulaciones, turnos y cierres)');
