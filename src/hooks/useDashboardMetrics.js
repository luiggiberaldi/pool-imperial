import { useMemo } from 'react';
import { FinancialEngine } from '../core/FinancialEngine';
import { capitalizeName, isNonProductSaleItem } from '../utils/calculatorUtils';

export function getLocalISODate(d = new Date()) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export function useDashboardMetrics({ sales, customers, products, bcvRate, selectedChartDate, activeCashSession }) {
    const today = getLocalISODate();
    const sessionOpenedAt = activeCashSession?.opened_at || null;

    // Helper: filtra por período de sesión de caja
    const isInSessionPeriod = (s) => {
        if (s.cajaCerrada === true) return false;
        if (!sessionOpenedAt) return false; // sin caja abierta = sin datos de sesión
        
        if (s.tipo === 'APERTURA_CAJA') {
            const sTime = new Date(s.timestamp).getTime();
            const sessTime = new Date(sessionOpenedAt).getTime();
            return sTime >= sessTime - 10000;
        }
        
        return s.timestamp >= sessionOpenedAt;
    };

    // Helper: filtra solo por día calendario (incluye ventas cerradas del día)
    const isToday = (s) => {
        const saleLocalDay = s.timestamp ? getLocalISODate(new Date(s.timestamp)) : today;
        return saleLocalDay === today;
    };

    // ── Métricas de SESIÓN DE CAJA (default cuando hay caja abierta) ──
    const todaySales = useMemo(() =>
        sales.filter(s => {
            if (s.status === 'ANULADA') return false;
            if (s.tipo !== 'VENTA' && s.tipo !== 'VENTA_FIADA') return false;
            return isInSessionPeriod(s);
        }),
        [sales, today, sessionOpenedAt]
    );

    const todayAllSales = useMemo(() =>
        sales.filter(s => {
            if (s.tipo !== 'VENTA' && s.tipo !== 'VENTA_FIADA' && s.tipo !== 'COBRO_DEUDA') return false;
            return isInSessionPeriod(s);
        }),
        [sales, today, sessionOpenedAt]
    );

    const todayCashFlow = useMemo(() =>
        sales.filter(s => {
            if (s.status === 'ANULADA') return false;
            if (!['VENTA','VENTA_FIADA','COBRO_DEUDA','PAGO_PROVEEDOR','APERTURA_CAJA'].includes(s.tipo)) return false;
            if (s.tipo === 'PAGO_PROVEEDOR' && s.afectaCaja === false) return false;
            return isInSessionPeriod(s);
        }),
        [sales, today, sessionOpenedAt]
    );

    const todayApertura = useMemo(() =>
        sales.find(s => {
            if (s.tipo !== 'APERTURA_CAJA' || s.cajaCerrada) return false;
            if (sessionOpenedAt) {
                const sTime = new Date(s.timestamp).getTime();
                const sessTime = new Date(sessionOpenedAt).getTime();
                return sTime >= sessTime - 10000;
            }
            const saleLocalDay = s.timestamp ? getLocalISODate(new Date(s.timestamp)) : today;
            return saleLocalDay === today;
        }),
        [sales, today, sessionOpenedAt]
    );

    const todayAdjustments = useMemo(() =>
        sales.filter(s => {
            if (s.status === 'ANULADA') return false;
            if (s.tipo !== 'AJUSTE_ENTRADA' && s.tipo !== 'AJUSTE_SALIDA') return false;
            return isInSessionPeriod(s);
        }),
        [sales, today, sessionOpenedAt]
    );

    const todayTotalBs = useMemo(() => todaySales.reduce((sum, s) => sum + (s.totalBs || 0), 0), [todaySales]);
    const todayTotalUsd = useMemo(() => todaySales.reduce((sum, s) => sum + FinancialEngine.calculateSaleNetTotal(s), 0), [todaySales]);
    const todayItemsSold = useMemo(() =>
        todaySales.reduce((sum, s) => sum + (s.items ? s.items.reduce((is, i) => {
            if (isNonProductSaleItem(i)) return is;
            return is + i.qty;
        }, 0) : 0), 0),
        [todaySales]
    );

    const todayExpenses = useMemo(() =>
        sales.filter(s => {
            if (s.tipo !== 'PAGO_PROVEEDOR') return false;
            if (s.afectaCaja === false) return false;
            return isInSessionPeriod(s);
        }),
        [sales, today, sessionOpenedAt]
    );
    const todayExpensesUsd = useMemo(() =>
        todayExpenses.reduce((sum, s) => sum + Math.abs(s.totalUsd || 0), 0),
        [todayExpenses]
    );

    const todayProfit = useMemo(() =>
        FinancialEngine.calculateAggregateProfit(todaySales, bcvRate, products),
        [todaySales, bcvRate, products]
    );

    const todayTotalTax = useMemo(() => todaySales.reduce((sum, s) => sum + (s.ivaAmount || 0), 0), [todaySales]);
    const todayTaxBreakdown = useMemo(() => {
        const breakdown = {};
        todaySales.forEach(sale => {
            if (sale.taxBreakdown) {
                Object.entries(sale.taxBreakdown).forEach(([key, val]) => {
                    breakdown[key] = (breakdown[key] || 0) + (val || 0);
                });
            }
        });
        return breakdown;
    }, [todaySales]);

    // ── Métricas solo del DÍA CALENDARIO (para tab "Hoy") ──
    const daySales = useMemo(() =>
        sales.filter(s => {
            if (s.status === 'ANULADA') return false;
            if (s.tipo !== 'VENTA' && s.tipo !== 'VENTA_FIADA') return false;
            return isToday(s);
        }),
        [sales, today]
    );
    const dayTotalUsd = useMemo(() => daySales.reduce((sum, s) => sum + FinancialEngine.calculateSaleNetTotal(s), 0), [daySales]);
    const dayTotalBs = useMemo(() => daySales.reduce((sum, s) => sum + (s.totalBs || 0), 0), [daySales]);
    const dayItemsSold = useMemo(() =>
        daySales.reduce((sum, s) => sum + (s.items ? s.items.reduce((is, i) => {
            if (isNonProductSaleItem(i)) return is;
            return is + i.qty;
        }, 0) : 0), 0),
        [daySales]
    );
    const dayProfit = useMemo(() =>
        FinancialEngine.calculateAggregateProfit(daySales, bcvRate, products),
        [daySales, bcvRate, products]
    );

    const dayTotalTax = useMemo(() => daySales.reduce((sum, s) => sum + (s.ivaAmount || 0), 0), [daySales]);
    const dayTaxBreakdown = useMemo(() => {
        const breakdown = {};
        daySales.forEach(sale => {
            if (sale.taxBreakdown) {
                Object.entries(sale.taxBreakdown).forEach(([key, val]) => {
                    breakdown[key] = (breakdown[key] || 0) + (val || 0);
                });
            }
        });
        return breakdown;
    }, [daySales]);

    const recentSales = useMemo(() => {
        const validTypes = ['VENTA', 'VENTA_FIADA'];
        if (selectedChartDate) {
            return sales.filter(s => {
                if (!validTypes.includes(s.tipo) || s.status === 'ANULADA') return false;
                const saleLocalDay = s.timestamp ? getLocalISODate(new Date(s.timestamp)) : today;
                return saleLocalDay === selectedChartDate;
            });
        }
        return sales
            .filter(s => {
                if (!validTypes.includes(s.tipo) || s.status === 'ANULADA') return false;
                return activeCashSession ? isInSessionPeriod(s) : isToday(s);
            })
            .slice(0, 7);
    }, [sales, selectedChartDate, today, activeCashSession, isInSessionPeriod, isToday]);

    const weekData = useMemo(() => Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (6 - i));
        const dateStr = getLocalISODate(d);
        const daySales = sales.filter(s => {
            if (['COBRO_DEUDA','AJUSTE_ENTRADA','AJUSTE_SALIDA','VENTA_FIADA'].includes(s.tipo) || s.status === 'ANULADA') return false;
            const saleLocalDay = s.timestamp ? getLocalISODate(new Date(s.timestamp)) : today;
            return saleLocalDay === dateStr;
        });
        return { date: dateStr, total: daySales.reduce((sum, s) => sum + FinancialEngine.calculateSaleNetTotal(s), 0), count: daySales.length };
    }), [sales, today]);

    const lowStockProducts = useMemo(() =>
        products.filter(p => !p.isUnlimitedStock && (p.stock ?? 0) <= (p.lowStockAlert ?? 5))
            .sort((a, b) => (a.stock ?? 0) - (b.stock ?? 0)).slice(0, 6),
        [products]
    );

    const totalDeudas = useMemo(() => {
        const deudores = customers.filter(c => (c.deuda || 0) > 0.01);
        const totalUsd = deudores.reduce((sum, c) => sum + (c.deuda || 0), 0);
        return { count: deudores.length, totalUsd, top5: [...deudores].sort((a, b) => (b.deuda || 0) - (a.deuda || 0)).slice(0, 5) };
    }, [customers]);

    const topProducts = useMemo(() => {
        const map = {};
        const productIds = new Set((products || []).map(p => p.id));
        const productNames = new Set((products || []).map(p => p.name.toLowerCase()));
        // Perf: solo considerar ventas de los últimos 30 días
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const sinceStr = thirtyDaysAgo.toISOString();

        sales.filter(s => !['COBRO_DEUDA','AJUSTE_ENTRADA','AJUSTE_SALIDA','VENTA_FIADA'].includes(s.tipo) && s.status !== 'ANULADA' && (s.timestamp || '') >= sinceStr).forEach(s => {
            s.items?.forEach(item => {
                const nameLower = item.name?.toLowerCase();
                if (!productIds.has(item.id) && !productNames.has(nameLower)) return;
                if (!map[item.name]) map[item.name] = { name: item.name, qty: 0, revenue: 0 };
                map[item.name].qty += item.qty;
                map[item.name].revenue += item.priceUsd * item.qty;
            });
        });
        return Object.values(map).sort((a, b) => b.qty - a.qty).slice(0, 5);
    }, [sales, products]);

    const topStaff = useMemo(() => {
        // Fallback: si no hay fecha configurada, usar últimos 30 días
        const sinceDate = localStorage.getItem('ranking_meseros_since') || (() => {
            const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString();
        })();
        const map = {};
        sales.filter(s => {
            if (['COBRO_DEUDA','AJUSTE_ENTRADA','AJUSTE_SALIDA','APERTURA_CAJA'].includes(s.tipo) || s.status === 'ANULADA') return false;
            if (!s.meseroId) return false;
            if (sinceDate && s.timestamp < sinceDate) return false;
            return true;
        }).forEach(s => {
            if (!map[s.meseroId]) map[s.meseroId] = { id: s.meseroId, name: capitalizeName(s.meseroNombre) || 'Desconocido', rol: 'MESERO', ventas: 0, revenue: 0 };
            map[s.meseroId].ventas += 1;
            map[s.meseroId].revenue += s.totalUsd || 0;
        });
        return Object.values(map).sort((a, b) => b.revenue - a.revenue || b.ventas - a.ventas).slice(0, 5);
    }, [sales]);

    // Para el wizard de cierre: incluye apertura para reconciliación de efectivo
    const paymentBreakdown = useMemo(() =>
        FinancialEngine.calculatePaymentBreakdown(todayCashFlow),
        [todayCashFlow]
    );

    // Para el dashboard display: solo ventas reales, sin contar el monto de apertura
    const salesPaymentBreakdown = useMemo(() =>
        FinancialEngine.calculatePaymentBreakdown(todaySales),
        [todaySales]
    );

    const todayTopProducts = useMemo(() => {
        const map = {};

        todaySales.forEach(s => {
            s.items?.forEach(item => {
                if (isNonProductSaleItem(item)) return;
                if (!map[item.name]) map[item.name] = { name: item.name, qty: 0, revenue: 0 };
                map[item.name].qty += item.qty;
                map[item.name].revenue += item.priceUsd * item.qty;
            });
        });
        return Object.values(map).sort((a, b) => b.qty - a.qty);
    }, [todaySales]);

    return {
        today, todaySales, todayAllSales, todayCashFlow, todayApertura, todayAdjustments,
        todayTotalBs, todayTotalUsd, todayItemsSold,
        todayExpenses, todayExpensesUsd, todayProfit,
        todayTotalTax, todayTaxBreakdown,
        daySales, dayTotalUsd, dayTotalBs, dayItemsSold, dayProfit,
        dayTotalTax, dayTaxBreakdown,
        recentSales, weekData, lowStockProducts,
        totalDeudas, topProducts, topStaff,
        paymentBreakdown, salesPaymentBreakdown, todayTopProducts,
    };
}
