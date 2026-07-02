import { FinancialEngine } from '../core/FinancialEngine';
import { getLocalISODate } from './dateHelpers';

/**
 * Calcula los datos de reportes para Pool Imperial (COP único).
 * 
 * NOTA: Los campos totalUsd en las ventas ahora almacenan valores COP.
 * El parámetro bcvRate ya no se usa — se mantiene en la firma por compatibilidad.
 */
export function calculateReportsData(allSales, from, to, _bcvRate, products, tasaCop) {
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
        if (s.tipo === 'PAGO_PROVEEDOR' && s.afectaCaja === false) return false;
        const dateStr = getLocalISODate(new Date(s.timestamp));
        return dateStr >= from && dateStr <= to;
    });

    const historySales = allSales.filter(s => {
        if (s.tipo === 'AJUSTE_ENTRADA' || s.tipo === 'AJUSTE_SALIDA') return false;
        const dateStr = getLocalISODate(new Date(s.timestamp));
        return dateStr >= from && dateStr <= to;
    });

    // totalUsd ahora almacena COP en Pool Imperial
    const totalCOP = salesForStats.reduce((s, sale) => s + FinancialEngine.calculateSaleNetTotal(sale), 0);
    const totalTax = salesForStats.reduce((s, sale) => s + (sale.ivaAmount || 0), 0);
    const taxBreakdown = {};
    salesForStats.forEach(sale => {
        if (sale.taxBreakdown) {
            Object.entries(sale.taxBreakdown).forEach(([key, val]) => {
                taxBreakdown[key] = (taxBreakdown[key] || 0) + (val || 0);
            });
        }
    });

    const totalItems = salesForStats.reduce((s, sale) => s + (sale.items ? sale.items.reduce((is, i) => {
        const nameLower = (i.name || '').toLowerCase();
        if (i.isTip || nameLower.includes('propina') || nameLower.includes('servicio voluntario') || nameLower.includes('recargo tdc')) return is;
        return is + i.qty;
    }, 0) : 0), 0);
    const profit = FinancialEngine.calculateAggregateProfit(salesForStats, 1, products);
    const paymentBreakdown = FinancialEngine.calculatePaymentBreakdown(salesForCashFlow);

    // Calcular tasa promedio ponderada
    let totalCOPWithRate = 0;
    let totalCOPForRateAvg = 0;
    salesForStats.forEach(sale => {
        const rate = sale.rate || 1;
        const total = sale.totalCop || sale.totalUsd || 0;
        if (rate > 1) {
            totalCOPWithRate += total;
            totalCOPForRateAvg += total / rate;
        }
    });

    const avgRate = totalCOPForRateAvg > 0 ? (totalCOPWithRate / totalCOPForRateAvg) : (tasaCop || 4150);
    const totalUsdReal = totalCOP / avgRate;
    const profitUsdReal = profit / avgRate;

    // Top productos
    const productMap = {};
    const productIds = new Set((products || []).map(p => p.id));
    const productNames = new Set((products || []).map(p => p.name.toLowerCase()));

    salesForStats.forEach(s => {
        s.items?.forEach(item => {
            const nameLower = (item.name || '').toLowerCase();
            if (item.isTip || nameLower.includes('propina') || nameLower.includes('servicio voluntario') || nameLower.includes('recargo tdc')) return;
            if (!productIds.has(item.id) && !productNames.has(nameLower)) return;
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
        map[day].total += FinancialEngine.calculateSaleNetTotal(s);
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
        salesByDay,
        avgRate,
        totalUsdReal,
        profitUsdReal,
        totalTax,
        taxBreakdown,
        netRevenue: Math.max(0, totalCOP - totalTax)
    };
}

export function groupSalesByCierreId(allSales, from, to, products) {
    const cMap = {};
    allSales.forEach(entity => {
        if (!entity.cierreId) return;
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
        } else if (entity.tipo === 'CIERRE_CAJA') {
            cMap[cId].cierreRecord = entity;
        } else {
            cMap[cId].sales.push(entity);
        }
    });

    const result = Object.values(cMap)
        .filter(c => {
            const closureDateStr = getLocalISODate(new Date(c.cierreId));
            return closureDateStr >= from && closureDateStr <= to && c.sales.length > 0;
        })
        .map(c => {
            const dateObj = new Date(c.cierreId);

            const salesForStats = c.sales.filter(s => (s.tipo === 'VENTA' || s.tipo === 'VENTA_FIADA') && s.status !== 'ANULADA');
            const salesForCashFlow = c.sales.filter(s => (s.tipo === 'VENTA' || s.tipo === 'VENTA_FIADA' || s.tipo === 'COBRO_DEUDA' || s.tipo === 'PAGO_PROVEEDOR') && s.status !== 'ANULADA' && !(s.tipo === 'PAGO_PROVEEDOR' && s.afectaCaja === false));
            const adjustments = c.sales.filter(s => s.tipo === 'AJUSTE_ENTRADA' || s.tipo === 'AJUSTE_SALIDA');

            const totalCOP = salesForStats.reduce((acc, s) => acc + FinancialEngine.calculateSaleNetTotal(s), 0);
            const totalTax = salesForStats.reduce((acc, s) => acc + (s.ivaAmount || 0), 0);
            const taxBreakdown = {};
            salesForStats.forEach(sale => {
                if (sale.taxBreakdown) {
                    Object.entries(sale.taxBreakdown).forEach(([key, val]) => {
                        taxBreakdown[key] = (taxBreakdown[key] || 0) + (val || 0);
                    });
                }
            });
            const totalItems = salesForStats.reduce((acc, s) => acc + (s.items ? s.items.reduce((is, it) => {
                const nameLower = (it.name || '').toLowerCase();
                if (it.isTip || nameLower.includes('propina') || nameLower.includes('servicio voluntario') || nameLower.includes('recargo tdc')) return is;
                return is + it.qty;
            }, 0) : 0), 0);
            const profit = FinancialEngine.calculateAggregateProfit(salesForStats, 1, products);
            const paymentBreakdown = FinancialEngine.calculatePaymentBreakdown(salesForCashFlow);

            return {
                ...c,
                dateObj,
                salesForStats,
                salesForCashFlow,
                adjustments,
                totalCOP,
                totalUsd: totalCOP,  // alias de compatibilidad
                totalBs: 0,          // siempre 0 en Pool Imperial
                totalItems,
                profit,
                paymentBreakdown,
                totalTax,
                taxBreakdown,
                declaredCop: c.cierreRecord?.declaredCop,
                declaredUsd: c.cierreRecord?.declaredUsd,
                diffCop: c.cierreRecord?.diffCop,
                diffUsd: c.cierreRecord?.diffUsd,
                declaredOthers: c.cierreRecord?.declaredOthers || {}
            };
        })
        .sort((a, b) => b.cierreId - a.cierreId);

    return result;
}
