import { FinancialEngine } from '../core/FinancialEngine';
import { getLocalISODate } from './dateHelpers';

/**
 * Calcula los datos de reportes para Pool Imperial (COP único).
 * 
 * NOTA: Los campos totalUsd en las ventas ahora almacenan valores COP.
 * El parámetro bcvRate ya no se usa — se mantiene en la firma por compatibilidad.
 */
export function calculateReportsData(allSales, from, to, _bcvRate, products) {
    // Ventas de Mercancía (para Totales, Profit, Top Productos)
    const salesForStats = allSales.filter(s => {
        if (s.status === 'ANULADA' || (s.tipo !== 'VENTA' && s.tipo !== 'VENTA_FIADA')) return false;
        const dateStr = getLocalISODate(new Date(s.timestamp));
        return dateStr >= from && dateStr <= to;
    });

    // Flujo de Dinero (incluye pagos de deudas y proveedores)
    const salesForCashFlow = allSales.filter(s => {
        if (s.status === 'ANULADA') return false;
        if (s.tipo !== 'VENTA' && s.tipo !== 'VENTA_FIADA' && s.tipo !== 'COBRO_DEUDA' && s.tipo !== 'PAGO_PROVEEDOR') return false;
        const dateStr = getLocalISODate(new Date(s.timestamp));
        return dateStr >= from && dateStr <= to;
    });

    const historySales = allSales.filter(s => {
        if (s.tipo === 'AJUSTE_ENTRADA' || s.tipo === 'AJUSTE_SALIDA') return false;
        const dateStr = getLocalISODate(new Date(s.timestamp));
        return dateStr >= from && dateStr <= to;
    });

    // totalUsd ahora almacena COP en Pool Imperial
    const totalCOP = salesForStats.reduce((s, sale) => s + (sale.totalCop || sale.totalUsd || 0), 0);
    const totalItems = salesForStats.reduce((s, sale) => s + (sale.items ? sale.items.reduce((is, i) => is + i.qty, 0) : 0), 0);
    const profit = FinancialEngine.calculateAggregateProfit(salesForStats, 1, products);
    const paymentBreakdown = FinancialEngine.calculatePaymentBreakdown(salesForCashFlow);

    // Top productos
    const productMap = {};
    salesForStats.forEach(s => {
        s.items?.forEach(item => {
            if (item.category === 'servicios') return;
            if (!productMap[item.name]) productMap[item.name] = { name: item.name, qty: 0, revenue: 0 };
            productMap[item.name].qty += item.qty;
            productMap[item.name].revenue += (item.priceUsd || 0) * item.qty; // priceUsd ahora = COP
        });
    });
    const topProducts = Object.values(productMap).sort((a, b) => b.revenue - a.revenue).slice(0, 8);

    // Ventas por día para mini gráfica
    const map = {};
    salesForStats.forEach(s => {
        const day = s.timestamp ? getLocalISODate(new Date(s.timestamp)) : getLocalISODate(new Date());
        if (!map[day]) map[day] = { date: day, total: 0, count: 0 };
        map[day].total += s.totalCop || s.totalUsd || 0;
        map[day].count++;
    });
    const salesByDay = Object.values(map).sort((a, b) => a.date.localeCompare(b.date));

    return {
        salesForStats,
        salesForCashFlow,
        historySales,
        totalCOP,
        totalUsd: totalCOP,   // alias de compatibilidad
        totalBs: 0,           // siempre 0 en Pool Imperial
        totalItems,
        profit,
        paymentBreakdown,
        topProducts,
        salesByDay
    };
}

export function groupSalesByCierreId(allSales, from, to) {
    const entitiesInDateRange = allSales.filter(s => {
        const dateStr = getLocalISODate(new Date(s.timestamp));
        return dateStr >= from && dateStr <= to && s.cierreId;
    });

    const cMap = {};
    entitiesInDateRange.forEach(entity => {
        const cId = entity.cierreId;
        if (!cMap[cId]) {
            cMap[cId] = {
                cierreId: cId,
                timestamp: cId,
                apertura: null,
                sales: [],
            };
        }
        if (entity.tipo === 'APERTURA_CAJA') {
            cMap[cId].apertura = entity;
        } else {
            cMap[cId].sales.push(entity);
        }
    });

    const result = Object.values(cMap)
        .filter(c => c.sales.length > 0)
        .map(c => {
            const dateObj = new Date(c.cierreId);

            const salesForStats = c.sales.filter(s => s.tipo === 'VENTA' || s.tipo === 'VENTA_FIADA');
            const salesForCashFlow = c.sales.filter(s => s.tipo === 'VENTA' || s.tipo === 'VENTA_FIADA' || s.tipo === 'COBRO_DEUDA' || s.tipo === 'PAGO_PROVEEDOR');

            const totalCOP = salesForStats.reduce((acc, s) => acc + (s.totalCop || s.totalUsd || 0), 0);
            const totalItems = salesForStats.reduce((acc, s) => acc + (s.items ? s.items.reduce((is, it) => is + it.qty, 0) : 0), 0);
            const paymentBreakdown = FinancialEngine.calculatePaymentBreakdown(salesForCashFlow);

            return {
                ...c,
                dateObj,
                salesForStats,
                salesForCashFlow,
                totalCOP,
                totalUsd: totalCOP,  // alias de compatibilidad
                totalBs: 0,          // siempre 0 en Pool Imperial
                totalItems,
                paymentBreakdown,
            };
        })
        .sort((a, b) => b.cierreId - a.cierreId);

    return result;
}
