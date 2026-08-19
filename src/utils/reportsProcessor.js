import { FinancialEngine } from '../core/FinancialEngine';
import { round2 } from './dinero';
import { isNonProductSaleItem } from './calculatorUtils';
import { isTimestampInReportRange, timestampToMs, getDateKeyInTimeZone } from './reportRangeEngine';

const SALE_TYPES = new Set(['VENTA', 'VENTA_FIADA']);
const DEBT_TYPES = new Set(['COBRO_DEUDA']);
const CASH_FLOW_TYPES = new Set(['VENTA', 'VENTA_FIADA', 'COBRO_DEUDA', 'PAGO_PROVEEDOR']);
const CLOSING_TYPES = new Set(['APERTURA_CAJA', 'CIERRE_CAJA']);
const ADJUSTMENT_TYPES = new Set(['AJUSTE_ENTRADA', 'AJUSTE_SALIDA']);
const CONFIRMED_STATUSES = new Set(['COMPLETADA', 'CONFIRMADA', 'SYNCED']);

// Las ventas legacy sin status se consideran confirmadas para no romper datos
// históricos. Cualquier estado explícitamente pendiente/error/conflicto queda
// fuera de las métricas financieras hasta reconciliarse con el servidor.
export function isConfirmedReportOperation(sale) {
    return !sale?.status || CONFIRMED_STATUSES.has(String(sale.status).toUpperCase());
}

export function toReportNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

export function getReportItemQuantity(item) {
    const quantity = Number(item?.qty);
    return Number.isFinite(quantity) ? Math.max(0, quantity) : 0;
}

function getItemPrice(item) {
    const price = Number(item?.priceUsd ?? item?.price ?? item?.unit_price_usd);
    return Number.isFinite(price) ? Math.max(0, price) : 0;
}

/**
 * Devuelve las líneas de producto usando el snapshot guardado en la venta.
 * Los descuentos se asignan proporcionalmente a todas las líneas para que el
 * ingreso neto por artículo no supere el total neto de la operación.
 */
export function getReportProductLines(sale) {
    const items = (Array.isArray(sale?.items) ? sale.items : [])
        .filter(item => !isNonProductSaleItem(item));
    const grossAllItems = items.reduce((sum, item) => {
        return sum + getItemPrice(item) * getReportItemQuantity(item);
    }, 0);
    const discount = Math.max(0, toReportNumber(
        sale?.discountAmountUsd ?? sale?.discount_amount_usd ?? sale?.discountCop
    ));
    const netRatio = grossAllItems > 0
        ? Math.max(0, (grossAllItems - Math.min(discount, grossAllItems)) / grossAllItems)
        : 1;

    return items
        .map(item => {
            const qty = getReportItemQuantity(item);
            const grossRevenue = round2(getItemPrice(item) * qty);
            return {
                productId: item?._originalId
                    || item?.productId
                    || item?.product_id
                    || item?.id
                    || item?.name
                    || 'historical-product',
                name: item?.name || item?.product_name || 'Producto histórico',
                qty,
                isWeight: Boolean(item?.isWeight || item?.is_weight),
                grossRevenue,
                revenue: round2(grossRevenue * netRatio),
            };
        })
        .filter(item => item.qty > 0);
}

function getSaleTax(sale) {
    const directTax = sale?.ivaAmount ?? sale?.taxAmount ?? sale?.totalTax;
    if (directTax !== undefined && directTax !== null && Number.isFinite(Number(directTax))) {
        if (Number(directTax) > 0) return round2(Number(directTax));
    }
    const breakdownTotal = Object.values(sale?.taxBreakdown || {}).reduce(
        (sum, value) => sum + Math.max(0, toReportNumber(value)),
        0
    );
    return round2(Math.max(0, breakdownTotal || toReportNumber(directTax)));
}

function getCashSessionKey(entity) {
    const value = entity?.cashSessionId ?? entity?.cash_session_id;
    return value === null || value === undefined || value === '' ? null : String(value);
}

function getClosureKey(entity) {
    const value = entity?.closureId
        ?? entity?.closure_id
        ?? entity?.cierreId
        ?? entity?.cierre_id;
    return value === null || value === undefined || value === '' ? null : String(value);
}

function getClosureTimestamp(closureRecord, closureKey) {
    const direct = closureRecord?.closedAt
        || closureRecord?.closed_at
        || closureRecord?.closed_at_utc
        || closureRecord?.timestamp;
    if (timestampToMs(direct) !== null) return direct;

    const keyTimestamp = timestampToMs(closureKey);
    if (keyTimestamp !== null) return keyTimestamp;

    const numericId = Number(closureKey);
    return Number.isFinite(numericId) && numericId > 100000000000 ? numericId : null;
}

function isInReportRange(sale, range) {
    if (!isTimestampInReportRange(sale?.timestamp, range)) return false;
    if (range.kind === 'current_shift') {
        if (sale?.cajaCerrada === true) return false;
        const saleCashSessionId = getCashSessionKey(sale);
        if (
            range.cashSessionId
            && saleCashSessionId
            && saleCashSessionId !== String(range.cashSessionId)
        ) {
            return false;
        }
    }
    return true;
}

function calculateTaxBreakdown(sales) {
    const taxBreakdown = {};
    sales.forEach(sale => {
        const entries = sale.taxBreakdown && Object.keys(sale.taxBreakdown).length > 0
            ? Object.entries(sale.taxBreakdown)
            : [];
        if (entries.length === 0) {
            const tax = getSaleTax(sale);
            if (tax > 0) taxBreakdown.no_desglosado = round2((taxBreakdown.no_desglosado || 0) + tax);
            return;
        }
        entries.forEach(([key, value]) => {
            const amount = Math.max(0, toReportNumber(value));
            taxBreakdown[key] = round2((taxBreakdown[key] || 0) + amount);
        });
    });
    return taxBreakdown;
}

export function aggregateProductSales(sales, limit = null) {
    const productMap = {};
    sales.forEach(sale => {
        getReportProductLines(sale).forEach(line => {
            const key = String(line.productId);
            if (!productMap[key]) {
                productMap[key] = {
                    productId: line.productId,
                    name: line.name,
                    qty: 0,
                    revenue: 0,
                    grossRevenue: 0,
                    isWeight: line.isWeight,
                };
            }
            productMap[key].qty += line.qty;
            productMap[key].revenue = round2(productMap[key].revenue + line.revenue);
            productMap[key].grossRevenue = round2(productMap[key].grossRevenue + line.grossRevenue);
            productMap[key].isWeight = productMap[key].isWeight || line.isWeight;
        });
    });
    const result = Object.values(productMap)
        .sort((a, b) => b.revenue - a.revenue);
    return limit === null ? result : result.slice(0, limit);
}

/**
 * Calcula los datos de reportes para un rango ya normalizado.
 * `totalUsd` se conserva como alias histórico, pero representa COP.
 */
export function calculateReportsData(
    allSales = [],
    range,
    _bcvRate,
    products = [],
    tasaCop,
    activeCashSession = null
) {
    const sales = Array.isArray(allSales) ? allSales : [];
    const inRange = sale => isInReportRange(sale, range);

    // El historial conserva anuladas para que el usuario pueda auditarlas;
    // las métricas y el flujo de caja las excluyen de forma explícita.
    const saleHistory = sales.filter(sale => SALE_TYPES.has(sale?.tipo) && inRange(sale));
    const saleTransactions = saleHistory.filter(sale =>
        sale?.status !== 'ANULADA' && isConfirmedReportOperation(sale)
    );
    const debtCollections = sales.filter(sale =>
        DEBT_TYPES.has(sale?.tipo)
        && sale?.status !== 'ANULADA'
        && isConfirmedReportOperation(sale)
        && inRange(sale)
    );
    // Mantener la condición legible y evitar precedencia accidental al incluir
    // egresos: los pagos a proveedores también son flujo si afectan caja.
    const salesForCashFlow = sales.filter(sale => {
        if (!CASH_FLOW_TYPES.has(sale?.tipo)) return false;
        if (sale.status === 'ANULADA' || !isConfirmedReportOperation(sale)) return false;
        if (sale.tipo === 'PAGO_PROVEEDOR' && sale.afectaCaja === false) return false;
        return inRange(sale);
    });

    const allOperations = sales.filter(sale => inRange(sale));
    const adjustments = allOperations.filter(sale => ADJUSTMENT_TYPES.has(sale?.tipo));
    const closingOperations = allOperations.filter(sale => CLOSING_TYPES.has(sale?.tipo));

    const totalCOP = round2(saleTransactions.reduce(
        (sum, sale) => sum + FinancialEngine.calculateSaleNetTotal(sale),
        0
    ));
    const totalTax = round2(saleTransactions.reduce((sum, sale) => sum + getSaleTax(sale), 0));
    const taxBreakdown = calculateTaxBreakdown(saleTransactions);
    const totalItems = saleTransactions.reduce((sum, sale) => {
        return sum + getReportProductLines(sale).reduce((items, line) => items + line.qty, 0);
    }, 0);
    const profit = FinancialEngine.calculateAggregateProfit(saleTransactions, 1, products);
    const paymentBreakdown = FinancialEngine.calculatePaymentBreakdown(salesForCashFlow);

    let totalCOPWithRate = 0;
    let totalCOPForRateAvg = 0;
    saleTransactions.forEach(sale => {
        const rate = toReportNumber(sale?.rate, 1);
        const total = toReportNumber(sale?.totalCop ?? sale?.totalUsd);
        if (rate > 1 && total > 0) {
            totalCOPWithRate += total;
            totalCOPForRateAvg += total / rate;
        }
    });
    const avgRate = totalCOPForRateAvg > 0
        ? totalCOPWithRate / totalCOPForRateAvg
        : (toReportNumber(tasaCop, 4150) || 4150);
    const totalUsdReal = avgRate > 0 ? totalCOP / avgRate : 0;
    const profitUsdReal = avgRate > 0 ? profit / avgRate : 0;
    const productSales = aggregateProductSales(saleTransactions);
    const topProducts = productSales.slice(0, 8);

    const salesByDayMap = {};
    saleTransactions.forEach(sale => {
        const day = getDateKeyInTimeZone(sale.timestamp, range?.timezone);
        if (!day) return;
        if (!salesByDayMap[day]) salesByDayMap[day] = { date: day, total: 0, count: 0 };
        salesByDayMap[day].total = round2(
            salesByDayMap[day].total + FinancialEngine.calculateSaleNetTotal(sale)
        );
        salesByDayMap[day].count += 1;
    });

    const debtTotal = round2(debtCollections.reduce(
        (sum, sale) => sum + FinancialEngine.calculateSaleNetTotal(sale),
        0
    ));

    return {
        range,
        salesForStats: saleTransactions,
        saleTransactions,
        debtCollections,
        debtTotal,
        salesForCashFlow,
        cashFlowEntries: salesForCashFlow,
        historySales: saleHistory,
        productSales,
        allOperations,
        adjustments,
        closingOperations,
        totalCOP,
        totalUsd: totalCOP,
        totalBs: 0,
        totalItems,
        profit,
        paymentBreakdown,
        topProducts,
        salesByDay: Object.values(salesByDayMap).sort((a, b) => a.date.localeCompare(b.date)),
        avgRate,
        totalUsdReal,
        profitUsdReal,
        totalTax,
        taxBreakdown,
        netRevenue: round2(totalCOP - totalTax),
        activeCashSessionId: activeCashSession?.id || range?.cashSessionId || null,
    };
}

export function groupSalesByCierreId(allSales = [], range, products = []) {
    const cMap = {};
    (Array.isArray(allSales) ? allSales : []).forEach(entity => {
        const closureKey = getClosureKey(entity);
        if (!closureKey) return;
        if (!cMap[closureKey]) {
            cMap[closureKey] = {
                closureId: closureKey,
                cierreId: entity.cierreId ?? entity.closureId ?? closureKey,
                timestamp: null,
                closedAt: null,
                cashSessionId: getCashSessionKey(entity),
                apertura: null,
                cierreRecord: null,
                sales: [],
            };
        }
        const group = cMap[closureKey];
        group.cashSessionId = group.cashSessionId || getCashSessionKey(entity);
        if (entity.tipo === 'APERTURA_CAJA') {
            group.apertura = entity;
        } else if (entity.tipo === 'CIERRE_CAJA') {
            group.cierreRecord = entity;
            group.closedAt = entity.closedAt || entity.closed_at || entity.timestamp || null;
            group.timestamp = group.closedAt;
        } else {
            group.sales.push(entity);
        }
    });

    return Object.values(cMap)
        .filter(group => {
            const latestSaleTimestamp = group.sales.reduce((latest, sale) => {
                const timestamp = timestampToMs(sale?.timestamp);
                return timestamp !== null && (latest === null || timestamp > latest) ? timestamp : latest;
            }, null);
            const closureTimestamp = getClosureTimestamp(group.cierreRecord, group.closureId)
                ?? latestSaleTimestamp;
            group.closedAt = group.closedAt || closureTimestamp;
            group.timestamp = group.timestamp || closureTimestamp;
            const matchesRange = isTimestampInReportRange(closureTimestamp, range);
            const matchesShift = range?.kind !== 'current_shift'
                || !range.cashSessionId
                || !group.cashSessionId
                || group.cashSessionId === String(range.cashSessionId);
            return Boolean(group.cierreRecord || group.sales.length > 0)
                && matchesRange
                && matchesShift;
        })
        .map(group => {
            const operations = group.sales;
            const salesForStats = operations.filter(sale =>
                SALE_TYPES.has(sale?.tipo)
                && sale?.status !== 'ANULADA'
                && isConfirmedReportOperation(sale)
            );
            const debtCollections = operations.filter(sale =>
                DEBT_TYPES.has(sale?.tipo)
                && sale?.status !== 'ANULADA'
                && isConfirmedReportOperation(sale)
            );
            const salesForCashFlow = operations.filter(sale => {
                if (!CASH_FLOW_TYPES.has(sale?.tipo)
                    || sale?.status === 'ANULADA'
                    || !isConfirmedReportOperation(sale)) return false;
                return !(sale.tipo === 'PAGO_PROVEEDOR' && sale.afectaCaja === false);
            });
            const adjustments = operations.filter(sale => ADJUSTMENT_TYPES.has(sale?.tipo));
            const totalCOP = round2(salesForStats.reduce(
                (sum, sale) => sum + FinancialEngine.calculateSaleNetTotal(sale),
                0
            ));
            const totalTax = round2(salesForStats.reduce((sum, sale) => sum + getSaleTax(sale), 0));
            const totalItems = salesForStats.reduce((sum, sale) => {
                return sum + getReportProductLines(sale).reduce((items, line) => items + line.qty, 0);
            }, 0);
            const profit = FinancialEngine.calculateAggregateProfit(salesForStats, 1, products);

            return {
                ...group,
                dateObj: timestampToMs(group.closedAt) !== null
                    ? new Date(timestampToMs(group.closedAt))
                    : null,
                salesForStats,
                debtCollections,
                salesForCashFlow,
                adjustments,
                totalCOP,
                totalUsd: totalCOP,
                totalBs: 0,
                totalItems,
                profit,
                paymentBreakdown: FinancialEngine.calculatePaymentBreakdown(salesForCashFlow),
                totalTax,
                taxBreakdown: calculateTaxBreakdown(salesForStats),
                declaredCop: group.cierreRecord?.declaredCop,
                declaredUsd: group.cierreRecord?.declaredUsd,
                diffCop: group.cierreRecord?.diffCop,
                diffUsd: group.cierreRecord?.diffUsd,
                declaredOthers: group.cierreRecord?.declaredOthers || {},
            };
        })
        .sort((a, b) => (timestampToMs(b.closedAt) || 0) - (timestampToMs(a.closedAt) || 0));
}
