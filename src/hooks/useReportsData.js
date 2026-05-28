import { useState, useEffect, useMemo } from 'react';
import { storageService } from '../utils/storageService';
import { getLocalISODate, getDateRange } from '../utils/dateHelpers';
import { calculateReportsData, groupSalesByCierreId } from '../utils/reportsProcessor';

const SALES_KEY = 'bodega_sales_v1';

export function useReportsData({ isActive, products, bcvRate, selectedRange, customFrom, customTo, activeTab }) {
    const [allSales, setAllSales] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (isActive === false) return;
        let mounted = true;
        const load = async () => {
            const saved = await storageService.getItem(SALES_KEY, []);
            if (mounted) {
                setAllSales(saved);
                setIsLoading(false);
            }
        };
        load();

        // Pull incremental de ventas desde la nube (cierre marks, ventas nuevas)
        const pullFromCloud = async () => {
            try {
                const { supabaseCloud } = await import('../config/supabaseCloud');
                const { data: { session } } = await supabaseCloud.auth.getSession();
                if (session?.user?.id) {
                    const { pullNewSales } = await import('../utils/salesSyncService');
                    const count = await pullNewSales(session.user.id);
                    // Si hubo cambios, load() se dispara automáticamente vía app_storage_update
                    if (count > 0) console.log(`[ReportsData] Pull trajo ${count} actualización(es)`);
                }
            } catch (e) {
                // Non-fatal
            }
        };
        pullFromCloud();

        // Escuchar actualizaciones de ventas (broadcast P2P, pull incremental, cierres)
        const onStorageUpdate = (e) => {
            if (e.detail?.key === SALES_KEY) load();
        };
        window.addEventListener('app_storage_update', onStorageUpdate);
        return () => {
            mounted = false;
            window.removeEventListener('app_storage_update', onStorageUpdate);
        };
    }, [isActive]);

    const { from, to } = useMemo(() => {
        if (selectedRange === 'custom') {
            return {
                from: customFrom || getLocalISODate(new Date()),
                to: customTo || getLocalISODate(new Date()),
            };
        }
        return getDateRange(selectedRange);
    }, [selectedRange, customFrom, customTo]);

    const {
        salesForStats,
        salesForCashFlow,
        historySales,
        totalUsd,
        totalBs,
        totalItems,
        profit,
        paymentBreakdown,
        topProducts,
        salesByDay,
    } = useMemo(() => calculateReportsData(allSales, from, to, bcvRate, products), [allSales, from, to, bcvRate, products]);

    const groupedClosings = useMemo(() => {
        if (activeTab === 'history') {
            return groupSalesByCierreId(allSales, from, to);
        }
        return [];
    }, [allSales, from, to, activeTab]);

    const maxDayTotal = Math.max(...salesByDay.map(d => d.total), 1);

    return {
        allSales, setAllSales,
        isLoading,
        from, to,
        salesForStats, salesForCashFlow, historySales,
        totalUsd, totalBs, totalItems, profit,
        paymentBreakdown, topProducts, salesByDay,
        groupedClosings, maxDayTotal,
    };
}
