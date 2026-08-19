import { useState, useEffect, useMemo } from 'react';
import { storageService } from '../utils/storageService';
import { calculateReportsData, groupSalesByCierreId } from '../utils/reportsProcessor';
import { buildReportRange } from '../utils/reportRangeEngine';

const SALES_KEY = 'bodega_sales_v1';

export function useReportsData({
    isActive,
    products,
    bcvRate,
    selectedRange,
    customFrom,
    customTo,
    activeTab,
    tasaCop,
    activeCashSession,
}) {
    const [allSales, setAllSales] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncError, setSyncError] = useState(null);
    const [lastSyncedAt, setLastSyncedAt] = useState(null);
    const [clockTick, setClockTick] = useState(() => Date.now());

    useEffect(() => {
        if (isActive === false) return undefined;
        let mounted = true;

        const load = async () => {
            const saved = await storageService.getItem(SALES_KEY, []);
            if (mounted) {
                setAllSales(Array.isArray(saved) ? saved : []);
                setIsLoading(false);
            }
        };

        const pullFromCloud = async () => {
            if (!mounted) return;
            setIsSyncing(true);
            setSyncError(null);
            try {
                const { supabaseCloud } = await import('../config/supabaseCloud');
                const { data: { session } } = await supabaseCloud.auth.getSession();
                if (session?.user?.id) {
                    const { pullNewSales } = await import('../utils/salesSyncService');
                    const count = await pullNewSales(session.user.id);
                    if (count > 0) console.log(`[ReportsData] Pull trajo ${count} actualización(es)`);
                }
                if (mounted) setLastSyncedAt(new Date().toISOString());
            } catch (error) {
                if (mounted) setSyncError(error?.message || 'No se pudo actualizar el reporte desde la nube');
            } finally {
                if (mounted) setIsSyncing(false);
            }
        };

        const refresh = async () => {
            // Clasificar pendientes legacy sin entrada de outbox antes de pintar
            // Reportes; nunca se reenvían automáticamente por falta de identidad.
            try {
                const { offlineQueueService } = await import('../services/offlineQueueService');
                await offlineQueueService.reconcileLocalPendingSales();
            } catch (error) {
                console.warn('[ReportsData] No se pudo reconciliar pendientes locales:', error?.message);
            }
            // Primero hidratar local, luego pull; finalmente volver a leer para
            // evitar que una carga iniciada antes del pull sobrescriba el resultado.
            await load();
            await pullFromCloud();
            await load();
        };
        refresh();

        const onStorageUpdate = (event) => {
            if (event.detail?.key === SALES_KEY) load();
        };
        window.addEventListener('app_storage_update', onStorageUpdate);
        return () => {
            mounted = false;
            window.removeEventListener('app_storage_update', onStorageUpdate);
        };
    }, [isActive]);

    useEffect(() => {
        if (isActive === false) return undefined;
        // Mantener el rango vivo también al cruzar medianoche: de lo contrario
        // "Hoy", "Esta Semana" y "Mes" quedan con la fecha del montaje.
        const refreshClock = () => setClockTick(Date.now());
        refreshClock();
        const interval = setInterval(refreshClock, 30_000);
        return () => clearInterval(interval);
    }, [isActive, selectedRange]);

    const activeCashSessionId = activeCashSession?.id || null;
    const activeCashSessionOpenedAt = activeCashSession?.opened_at || null;
    const activeCashSessionClosedAt = activeCashSession?.closed_at || null;

    const range = useMemo(() => buildReportRange({
        kind: selectedRange,
        customFrom,
        customTo,
        now: clockTick,
        cashSession: activeCashSessionId
            ? {
                id: activeCashSessionId,
                opened_at: activeCashSessionOpenedAt,
                closed_at: activeCashSessionClosedAt,
            }
            : null,
    }), [
        selectedRange,
        customFrom,
        customTo,
        clockTick,
        activeCashSessionId,
        activeCashSessionOpenedAt,
        activeCashSessionClosedAt,
    ]);

    const reportData = useMemo(() => calculateReportsData(
        allSales,
        range,
        bcvRate,
        products,
        tasaCop,
        activeCashSessionId ? { id: activeCashSessionId } : null
    ), [allSales, range, bcvRate, products, tasaCop, activeCashSessionId]);

    const groupedClosings = useMemo(() => {
        if (activeTab !== 'history') return [];
        return groupSalesByCierreId(allSales, range, products);
    }, [allSales, range, activeTab, products]);

    const maxDayTotal = Math.max(...(reportData.salesByDay || []).map(day => day.total), 1);
    const pendingSalesCount = allSales.filter(sale =>
        sale?.status === 'PENDIENTE_SYNC' || sale?.status === 'PENDIENTE_VERIFICACION'
    ).length;
    const syncConflictCount = allSales.filter(sale =>
        sale?.status === 'SYNC_ERROR' || sale?.status === 'SYNC_CONFLICT'
    ).length;

    return {
        allSales,
        setAllSales,
        isLoading,
        isSyncing,
        syncError,
        lastSyncedAt,
        pendingSalesCount,
        syncConflictCount,
        range,
        salesForStats: reportData.salesForStats,
        saleTransactions: reportData.saleTransactions,
        debtCollections: reportData.debtCollections,
        debtTotal: reportData.debtTotal,
        salesForCashFlow: reportData.salesForCashFlow,
        cashFlowEntries: reportData.cashFlowEntries,
        historySales: reportData.historySales,
        productSales: reportData.productSales,
        allOperations: reportData.allOperations,
        adjustments: reportData.adjustments,
        closingOperations: reportData.closingOperations,
        totalUsd: reportData.totalUsd,
        totalBs: reportData.totalBs,
        totalItems: reportData.totalItems,
        profit: reportData.profit,
        paymentBreakdown: reportData.paymentBreakdown,
        topProducts: reportData.topProducts,
        salesByDay: reportData.salesByDay,
        groupedClosings,
        maxDayTotal,
        avgRate: reportData.avgRate,
        totalUsdReal: reportData.totalUsdReal,
        profitUsdReal: reportData.profitUsdReal,
        totalTax: reportData.totalTax,
        taxBreakdown: reportData.taxBreakdown,
        netRevenue: reportData.netRevenue,
    };
}
