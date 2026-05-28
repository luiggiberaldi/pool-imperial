import { useMemo } from 'react';
import { FinancialEngine } from '../core/FinancialEngine';
import { capitalizeName } from '../utils/calculatorUtils';

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

    const todayCashFlow = useMemo(() =>
        sales.filter(s => {
            if (s.status === 'ANULADA') return false;
            if (!['VENTA','VENTA_FIADA','COBRO_DEUDA','PAGO_PROVEEDOR','APERTURA_CAJA'].includes(s.tipo)) return false;
            return isInSessionPeriod(s);
        }),
        [sales, today, sessionOpenedAt]
    );

    const todayApertura = useMemo(() =>
        sales.find(s => {
            if (s.tipo !== 'APERTURA_CAJA' || s.cajaCerrada) return false;
            if (sessionOpenedAt) return s.timestamp >= sessionOpenedAt;
            const saleLocalDay = s.timestamp ? getLocalISODate(new Date(s.timestamp)) : today;
            return saleLocalDay === today;
        }),
        [sales, today, sessionOpenedAt]
    );

    const todayTotalBs = useMemo(() => todaySales.reduce((sum, s) => sum + (s.totalBs || 0), 0), [todaySales]);
    const todayTotalUsd = useMemo(() => todaySales.reduce((sum, s) => sum + (s.totalUsd || 0), 0), [todaySales]);
    const todayItemsSold = useMemo(() =>
        todaySales.reduce((sum, s) => sum + (s.items ? s.items.reduce((is, i) => is + i.qty, 0) : 0), 0),
        [todaySales]
    );

    const todayExpenses = useMemo(() =>
        sales.filter(s => {
            if (s.tipo !== 'PAGO_PROVEEDOR') return false;
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

    // ── Métricas solo del DÍA CALENDARIO (para tab "Hoy") ──
    const daySales = useMemo(() =>
        sales.filter(s => {
            if (s.status === 'ANULADA') return false;
            if (s.tipo !== 'VENTA' && s.tipo !== 'VENTA_FIADA') return false;
            return isToday(s);
        }),
        [sales, today]
    );
    const dayTotalUsd = useMemo(() => daySales.reduce((sum, s) => sum + (s.totalUsd || 0), 0), [daySales]);
    const dayTotalBs = useMemo(() => daySales.reduce((sum, s) => sum + (s.totalBs || 0), 0), [daySales]);
    const dayItemsSold = useMemo(() =>
        daySales.reduce((sum, s) => sum + (s.items ? s.items.reduce((is, i) => is + i.qty, 0) : 0), 0),
        [daySales]
    );
    const dayProfit = useMemo(() =>
        FinancialEngine.calculateAggregateProfit(daySales, bcvRate, products),
        [daySales, bcvRate, products]
    );

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
            .filter(s => validTypes.includes(s.tipo) && s.status !== 'ANULADA')
            .slice(0, 7);
    }, [sales, selectedChartDate, today]);

    const weekData = useMemo(() => Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (6 - i));
        const dateStr = getLocalISODate(d);
        const daySales = sales.filter(s => {
            if (['COBRO_DEUDA','AJUSTE_ENTRADA','AJUSTE_SALIDA','VENTA_FIADA'].includes(s.tipo) || s.status === 'ANULADA') return false;
            const saleLocalDay = s.timestamp ? getLocalISODate(new Date(s.timestamp)) : today;
            return saleLocalDay === dateStr;
        });
        return { date: dateStr, total: daySales.reduce((sum, s) => sum + (s.totalUsd || 0), 0), count: daySales.length };
    }), [sales, today]);

    const lowStockProducts = useMemo(() =>
        products.filter(p => (p.stock ?? 0) <= (p.lowStockAlert ?? 5))
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
        sales.filter(s => !['COBRO_DEUDA','AJUSTE_ENTRADA','AJUSTE_SALIDA','VENTA_FIADA'].includes(s.tipo) && s.status !== 'ANULADA').forEach(s => {
            s.items?.forEach(item => {
                if (item.category === 'servicios') return;
                if (!map[item.name]) map[item.name] = { name: item.name, qty: 0, revenue: 0 };
                map[item.name].qty += item.qty;
                map[item.name].revenue += item.priceUsd * item.qty;
            });
        });
        return Object.values(map).sort((a, b) => b.qty - a.qty).slice(0, 5);
    }, [sales]);

    const topStaff = useMemo(() => {
        const sinceDate = localStorage.getItem('ranking_meseros_since') || null;
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
                if (item.category === 'servicios') return;
                if (!map[item.name]) map[item.name] = { name: item.name, qty: 0, revenue: 0 };
                map[item.name].qty += item.qty;
                map[item.name].revenue += item.priceUsd * item.qty;
            });
        });
        return Object.values(map).sort((a, b) => b.qty - a.qty).slice(0, 10);
    }, [todaySales]);

    return {
        today, todaySales, todayCashFlow, todayApertura,
        todayTotalBs, todayTotalUsd, todayItemsSold,
        todayExpenses, todayExpensesUsd, todayProfit,
        daySales, dayTotalUsd, dayTotalBs, dayItemsSold, dayProfit,
        recentSales, weekData, lowStockProducts,
        totalDeudas, topProducts, topStaff,
        paymentBreakdown, salesPaymentBreakdown, todayTopProducts,
    };
}
