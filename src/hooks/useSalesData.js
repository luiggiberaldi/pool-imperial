import { useState, useCallback, useEffect } from 'react';
import { storageService } from '../utils/storageService';
import { getActivePaymentMethods } from '../config/paymentMethods';
import { FinancialEngine } from '../core/FinancialEngine';
import { getLocalISODate } from '../utils/dateHelpers';

const SALES_KEY = 'bodega_sales_v1';

export function useSalesData({ isActive, setProductsSilent, cart, cartRef, setCart }) {
    const [customers, setCustomers] = useState([]);
    const [paymentMethods, setPaymentMethods] = useState([]);
    const [salesData, setSalesData] = useState([]);
    const [isLoadingLocal, setIsLoadingLocal] = useState(true);

    const handleReloadContent = useCallback(() => {
        if (!isActive) return;
        Promise.all([
            storageService.getItem('bodega_products_v1', []),
            getActivePaymentMethods(),
            storageService.getItem('bodega_customers_v1', []),
            storageService.getItem(SALES_KEY, [])
        ]).then(([savedProducts, methods, savedCustomers, savedSales]) => {
            setProductsSilent(savedProducts);
            setPaymentMethods(methods);
            setCustomers(savedCustomers);
            setSalesData(savedSales);
        });
    }, [isActive, setProductsSilent]);

    // Initial load
    useEffect(() => {
        let mounted = true;
        const load = async () => {
            const [savedCustomers, methods, savedCart, savedSales] = await Promise.all([
                storageService.getItem('bodega_customers_v1', []),
                getActivePaymentMethods(),
                storageService.getItem('bodega_pending_cart_v1', []),
                storageService.getItem(SALES_KEY, [])
            ]);
            if (!mounted) return;
            setSalesData(savedSales);
            setCustomers(savedCustomers);
            setPaymentMethods(methods);
            if (savedCart && savedCart.length > 0 && cartRef.current.length === 0) {
                setCart(savedCart);
            }
            setIsLoadingLocal(false);
        };
        load();
        return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cartRef, setCart]);

    // Reload on visibility/focus/storage events
    useEffect(() => {
        handleReloadContent();
    }, [handleReloadContent]);

    useEffect(() => {
        const onVisibilityChange = () => {
            if (document.visibilityState === 'visible') handleReloadContent();
        };
        const onStorageUpdate = (e) => {
            if (e.detail && e.detail.key === SALES_KEY) setTimeout(handleReloadContent, 50);
        };
        document.addEventListener('visibilitychange', onVisibilityChange);
        window.addEventListener('focus', handleReloadContent);
        window.addEventListener('app_storage_update', onStorageUpdate);
        return () => {
            document.removeEventListener('visibilitychange', onVisibilityChange);
            window.removeEventListener('focus', handleReloadContent);
            window.removeEventListener('app_storage_update', onStorageUpdate);
        };
    }, [handleReloadContent]);

    const buildCurrentFloat = (todaySalesData) => {
        const todayStr = getLocalISODate(new Date());
        const todayOpen = todaySalesData.filter(s => {
            if (s.cajaCerrada) return false;
            const saleDay = s.timestamp ? getLocalISODate(new Date(s.timestamp)) : todayStr;
            return saleDay === todayStr;
        });
        const bd = FinancialEngine.calculatePaymentBreakdown(todayOpen);
        return { usd: bd['efectivo_usd']?.total ?? 0, bs: bd['efectivo_bs']?.total ?? 0 };
    };

    return {
        customers, setCustomers,
        paymentMethods,
        salesData, setSalesData,
        isLoadingLocal,
        buildCurrentFloat,
    };
}
