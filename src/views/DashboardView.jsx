import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { storageService } from '../utils/storageService';
import { showToast } from '../components/Toast';
import { BarChart3, TrendingUp, Package, AlertTriangle, ArrowUpRight, Users, ChevronDown, ChevronUp, Phone, FileText, Recycle, Key, Settings, LockIcon, Unlock, LogOut, Award, LineChart, ListChecks, RotateCcw, Bell, Clock, Wallet, X, Receipt } from 'lucide-react';
import { formatCop, formatGameHours, computeGameStats } from '../utils/calculatorUtils';
import SalesHistory from '../components/Dashboard/SalesHistory';
import SalesChart from '../components/Dashboard/SalesChart';
import ConfirmModal from '../components/ConfirmModal';
import CierreCajaWizard from '../components/Dashboard/CierreCajaWizard';
import AperturaCajaModal from '../components/Dashboard/AperturaCajaModal';
import ReporteTurnoModal from '../components/Dashboard/ReporteTurnoModal';
import OperatorDashboardPanel from '../components/Dashboard/OperatorDashboardPanel';
import { DashboardHeroCard } from '../components/Dashboard/DashboardHeroCard';
import { DashboardPaymentBreakdown } from '../components/Dashboard/DashboardPaymentBreakdown';
import { TicketClientModal, DeleteHistoryModal, RecycleModal } from '../components/Dashboard/DashboardModals';
import { generateTicketPDF, printThermalTicket } from '../utils/ticketGenerator';
import { generateDailyClosePDF } from '../utils/dailyCloseGenerator';
import { processVoidSale } from '../utils/voidSaleProcessor';
import { useNotifications } from '../hooks/useNotifications';
import AnimatedCounter from '../components/AnimatedCounter';
import SyncStatus from '../components/SyncStatus';
import { useProductContext } from '../context/ProductContext';
import { useCart } from '../context/CartContext';
import { useSecurity } from '../hooks/useSecurity';
import { useAuthStore as useLegacyAuthStore } from '../hooks/store/useAuthStore';
import { useAuthStore } from '../hooks/store/authStore';
import { useCashStore } from '../hooks/store/cashStore';
import { syncCierreMarks } from '../utils/salesSyncService';
import { useAudit } from '../hooks/useAudit';
import { supabaseCloud } from '../config/supabaseCloud';
import { useConfirm } from '../hooks/useConfirm.jsx';
import { shareSaleWhatsApp } from '../utils/dashboardActions';
import { useDashboardMetrics, getLocalISODate } from '../hooks/useDashboardMetrics';
import { useNotificationCenter } from '../hooks/useNotificationCenter';
import { useTablesStore } from '../hooks/store/useTablesStore';
import Skeleton from '../components/Skeleton';

const SALES_KEY = 'bodega_sales_v1';

export default function DashboardView({ rates, triggerHaptic, onNavigate, theme, toggleTheme, isActive, isDemo, demoTimeLeft, onLogoClick }) {
    const { notifyCierrePendiente, requestPermission } = useNotifications();
    const { deviceId } = useSecurity();
    const { currentUser: usuarioActivo, role, logout: authLogout } = useAuthStore();
    const isAdmin = role === 'ADMIN';
    const cajeroAbreCaja = localStorage.getItem('cajero_puede_abrir_caja') === 'true';
    const cajeroCierraCaja = localStorage.getItem('cajero_puede_cerrar_caja') === 'true';
    const { activeCashSession, openCashSession, closeCashSession } = useCashStore();
    const requireLogin = useLegacyAuthStore(s => s.requireLogin ?? false);
    const { log: auditLog } = useAudit();
    const confirm = useConfirm();
    const [sales, setSales] = useState([]);
    const { products, setProducts, isLoadingProducts, effectiveRate: bcvRate, useAutoRate, copEnabled, tasaCop } = useProductContext();
    const { loadCart } = useCart();
    const [customers, setCustomers] = useState([]);
    const [isLoadingLocal, setIsLoadingLocal] = useState(true);
    const isLoading = isLoadingProducts || isLoadingLocal;

    // UI state
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [deleteConfirmText, setDeleteConfirmText] = useState('');
    const [voidSaleTarget, setVoidSaleTarget] = useState(null);
    const [isCashReconOpen, setIsCashReconOpen] = useState(false);
    const [ticketPendingSale, setTicketPendingSale] = useState(null);
    const [ticketClientName, setTicketClientName] = useState('');
    const [ticketClientPhone, setTicketClientPhone] = useState('');
    const [ticketClientDocument, setTicketClientDocument] = useState('');
    const [recycleOffer, setRecycleOffer] = useState(null);
    const [pullDistance, setPullDistance] = useState(0);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [selectedChartDate, setSelectedChartDate] = useState(null);
    const [showTopDeudas, setShowTopDeudas] = useState(false);
    const [isAperturaOpen, setIsAperturaOpen] = useState(false);
    const [isReporteTurnoOpen, setIsReporteTurnoOpen] = useState(false);
    const [showNotifPanel, setShowNotifPanel] = useState(false);
    const touchStartY = useRef(0);
    const scrollRef = useRef(null);

    // Tables store for notification center
    const activeSessions = useTablesStore(s => s.activeSessions);
    const pausedSessions = useTablesStore(s => s.pausedSessions);
    const tables = useTablesStore(s => s.tables);

    // ── Métricas extraídas al hook ──
    const {
        today, todaySales, todayAllSales, todayCashFlow, todayApertura, todayAdjustments,
        todayTotalBs, todayTotalUsd, todayItemsSold,
        todayExpenses, todayExpensesUsd, todayProfit,
        todayTotalTax, todayTaxBreakdown,
        daySales, dayTotalUsd, dayTotalBs, dayItemsSold, dayProfit,
        dayTotalTax, dayTaxBreakdown,
        recentSales, weekData, lowStockProducts,
        totalDeudas, topProducts, topStaff,
        paymentBreakdown, salesPaymentBreakdown, todayTopProducts,
    } = useDashboardMetrics({ sales, customers, products, bcvRate, selectedChartDate, activeCashSession });

    // Tab state: 'caja' (session) or 'hoy' (calendar day)
    const [dashTab, setDashTab] = useState('caja');
    const hasCashSession = !!activeCashSession;

    // Resolved metrics based on active tab
    const displayTotalUsd = dashTab === 'hoy' ? dayTotalUsd : todayTotalUsd;
    const displayTotalBs = dashTab === 'hoy' ? dayTotalBs : todayTotalBs;
    const displaySalesCount = dashTab === 'hoy' ? daySales.length : todaySales.length;
    const displayItemsSold = dashTab === 'hoy' ? dayItemsSold : todayItemsSold;
    const displayProfit = dashTab === 'hoy' ? dayProfit : todayProfit;

    // Estadísticas de horas de mesa y jugadas facturadas
    const salesForGameStats = dashTab === 'hoy' ? daySales : todaySales;
    const gameStats = useMemo(() => computeGameStats(salesForGameStats), [salesForGameStats]);

    // Notification center
    const { notifications, urgentCount, totalCount } = useNotificationCenter({
        products, activeSessions, pausedSessions, activeCashSession, customers, tables
    });

    // ── Carga de datos ──
    useEffect(() => {
        if (!isActive) return;
        let mounted = true;
        const load = async () => {
            const [savedSales, savedCustomers] = await Promise.all([
                storageService.getItem(SALES_KEY, []),
                storageService.getItem('bodega_customers_v1', []),
            ]);
            if (mounted) {
                setSales(savedSales);
                setCustomers(savedCustomers);
                setIsLoadingLocal(false);
            }
        };
        load();
        requestPermission();
        return () => { mounted = false; };
    }, [isActive]);

    // ── Notificar cierre pendiente ──
    useEffect(() => {
        if (todaySales.length > 0) notifyCierrePendiente(todaySales.length);
    }, [todaySales.length, notifyCierrePendiente]);

    // ── Escuchar actualizaciones de la nube (debounced 1s) ──
    useEffect(() => {
        let salesTimer = null;
        let customersTimer = null;
        const handleCloudUpdate = (e) => {
            const key = e.detail?.key;
            if (key === SALES_KEY) {
                clearTimeout(salesTimer);
                salesTimer = setTimeout(async () => {
                    setSales(await storageService.getItem(SALES_KEY, []));
                }, 1000);
            }
            if (key === 'bodega_customers_v1') {
                clearTimeout(customersTimer);
                customersTimer = setTimeout(async () => {
                    setCustomers(await storageService.getItem('bodega_customers_v1', []));
                }, 1000);
            }
        };
        window.addEventListener('app_storage_update', handleCloudUpdate);
        return () => {
            window.removeEventListener('app_storage_update', handleCloudUpdate);
            clearTimeout(salesTimer);
            clearTimeout(customersTimer);
        };
    }, []);

    // ── Apertura de caja ──
    const handleSaveApertura = async (data) => {
        try {
            const aperturaRecord = {
                id: `apertura_${Date.now()}`,
                tipo: 'APERTURA_CAJA',
                openingUsd: data.openingUsd,
                openingBs: data.openingBs,
                timestamp: new Date().toISOString(),
                cajaCerrada: false
            };
            const existingSales = await storageService.getItem(SALES_KEY, []);
            const updatedSales = [...existingSales, aperturaRecord];
            await storageService.setItem(SALES_KEY, updatedSales);
            setSales(updatedSales);
            await openCashSession(data.openingUsd, data.openingBs, data.cashierName || usuarioActivo?.name, role, aperturaRecord.timestamp);
            auditLog('VENTA', 'APERTURA_CAJA', `Caja abierta por ${role === 'ADMIN' ? 'Administrador' : 'Cajero'}: ${usuarioActivo?.name || '—'} — Base: ${formatCop(data.openingUsd)}`, { role, openedBy: usuarioActivo?.name });
            setIsAperturaOpen(false);
            showToast('Turno de Caja Abierto', 'success');
            if (triggerHaptic) triggerHaptic();
        } catch (error) {
            console.error('Error al guardar apertura:', error);
            showToast('Error al abrir la caja', 'error');
        }
    };

    // ── Anular venta ──
    const handleVoidSale = (sale) => setVoidSaleTarget(sale);
    const confirmVoidSale = async () => {
        const sale = voidSaleTarget;
        if (!sale) return;
        setVoidSaleTarget(null);
        try {
            const { updatedSales, updatedProducts, updatedCustomers } = await processVoidSale(sale, sales, products);
            setSales(updatedSales);
            setProducts(updatedProducts);
            setCustomers(updatedCustomers);
            showToast('Venta anulada con éxito', 'success');
            setRecycleOffer(sale);
        } catch (error) {
            console.error('Error anulando venta:', error);
            showToast('Hubo un problema anulando la venta', 'error');
        }
    };

    const handleShareWhatsApp = (sale) => {
        const saleCustomer = sale.customerId ? customers.find(c => c.id === sale.customerId) : null;
        shareSaleWhatsApp(sale, saleCustomer, bcvRate);
    };
    const handleDownloadPDF = (sale) => { triggerHaptic(); generateTicketPDF(sale, bcvRate); };
    const handlePrintTicket = (sale) => { triggerHaptic(); printThermalTicket(sale, bcvRate); };

    // ── Registrar cliente para ticket ──
    const handleRegisterClientForTicket = async () => {
        if (!ticketClientName.trim() || !ticketPendingSale) return;
        const newCustomer = {
            id: crypto.randomUUID(),
            name: ticketClientName.trim(),
            documentId: ticketClientDocument.trim() || '',
            phone: ticketClientPhone.trim() || '',
            deuda: 0, favor: 0,
            createdAt: new Date().toISOString(),
        };
        const updatedCustomers = [...customers, newCustomer];
        setCustomers(updatedCustomers);
        await storageService.setItem('bodega_customers_v1', updatedCustomers);
        const updatedSale = { ...ticketPendingSale, customerId: newCustomer.id, customerName: newCustomer.name, customerPhone: newCustomer.phone };
        const updatedSales = sales.map(s => s.id === updatedSale.id ? updatedSale : s);
        setSales(updatedSales);
        await storageService.setItem(SALES_KEY, updatedSales);
        setTicketPendingSale(null); setTicketClientName(''); setTicketClientPhone(''); setTicketClientDocument('');
        handleShareWhatsApp(updatedSale);
    };

    // ── Cierre de caja ──
    const handleDailyClose = () => { triggerHaptic && triggerHaptic(); setIsCashReconOpen(true); };
    const handleConfirmCashRecon = async (reconData) => {
        const sessionOpenedAt = activeCashSession?.opened_at || null;
        const isInSession = (s) => {
            if (sessionOpenedAt) {
                if (s.tipo === 'APERTURA_CAJA') {
                    const sTime = new Date(s.timestamp).getTime();
                    const sessTime = new Date(sessionOpenedAt).getTime();
                    return sTime >= sessTime - 10000;
                }
                return s.timestamp >= sessionOpenedAt;
            }
            const saleLocalDay = s.timestamp ? getLocalISODate(new Date(s.timestamp)) : getLocalISODate(new Date());
            return saleLocalDay === today;
        };

        const currentCierreId = Date.now();
        const validTipos = ['VENTA','VENTA_FIADA','COBRO_DEUDA','PAGO_PROVEEDOR','APERTURA_CAJA','AJUSTE_ENTRADA','AJUSTE_SALIDA'];
        let updatedSales = sales.map(s =>
            !s.cajaCerrada && validTipos.includes(s.tipo || 'VENTA') && isInSession(s)
                ? { ...s, cajaCerrada: true, cierreId: currentCierreId }
                : s
        );

        // Crear registro especial de cierre para guardar metadatos de arqueo
        const cierreRecord = {
            id: `cierre_${currentCierreId}`,
            tipo: 'CIERRE_CAJA',
            cierreId: currentCierreId,
            timestamp: new Date().toISOString(),
            cajaCerrada: true,
            declaredCop: reconData.declaredCop || 0,
            declaredUsd: reconData.declaredUsd || 0,
            diffCop: reconData.diffCop || 0,
            diffUsd: reconData.diffUsd || 0,
            declaredOthers: reconData.declaredOthers || {}
        };
        updatedSales = [...updatedSales, cierreRecord];

        await storageService.setItem(SALES_KEY, updatedSales);
        setSales(updatedSales);
        await closeCashSession(reconData, usuarioActivo?.email || 'admin');
        showToast('Cierre de caja completado (Historial conservado)', 'success');
        auditLog('VENTA', 'CIERRE_CAJA', 'Cierre de caja completado');

        // Sincronizar marcas de cierre a la nube (no bloquea UI)
        const affectedSales = updatedSales.filter(s => s.cierreId === currentCierreId);
        supabaseCloud.auth.getSession().then(({ data: { session } }) => {
            if (session?.user?.id) syncCierreMarks(affectedSales, session.user.id);
        }).catch(() => {});

        return currentCierreId;
    };

    // ── Pull-to-refresh ──
    const handleTouchStart = (e) => {
        if (scrollRef.current?.scrollTop === 0) touchStartY.current = e.touches[0].clientY;
    };
    const handleTouchMove = (e) => {
        if (scrollRef.current?.scrollTop > 0) return;
        const diff = e.touches[0].clientY - touchStartY.current;
        if (diff > 0) setPullDistance(Math.min(diff * 0.4, 80));
    };
    const handleTouchEnd = async () => {
        if (pullDistance > 60) {
            setIsRefreshing(true);
            const [savedSales, savedProducts, savedCustomers] = await Promise.all([
                storageService.getItem(SALES_KEY, []),
                storageService.getItem('bodega_products_v1', []),
                storageService.getItem('bodega_customers_v1', []),
            ]);
            setSales(savedSales); setProducts(savedProducts); setCustomers(savedCustomers);
            setIsRefreshing(false);
        }
        setPullDistance(0);
    };

    if (isLoading) {
        return (
            <div className="flex-1 p-3 sm:p-4 md:p-6 lg:p-8 space-y-4">
                <Skeleton className="h-14 w-40 rounded-2xl" />
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <Skeleton className="h-24 rounded-2xl" /><Skeleton className="h-24 rounded-2xl" /><Skeleton className="h-24 rounded-2xl" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Skeleton className="h-32 rounded-3xl" /><Skeleton className="h-32 rounded-3xl" />
                </div>
                <Skeleton className="h-48 rounded-3xl" /><Skeleton className="h-24 rounded-2xl" />
            </div>
        );
    }

    return (
        <div ref={scrollRef} className="flex flex-col h-full bg-[#F8FAFC] overflow-y-auto scrollbar-hide"
            onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>

            {/* Pull-to-refresh indicator */}
            {(pullDistance > 0 || isRefreshing) && (
                <div className="flex justify-center pb-3 transition-all" style={{ height: pullDistance > 0 ? pullDistance : 40 }}>
                    <div className={`w-6 h-6 rounded-full border-2 border-slate-200 border-t-[#D97706] ${isRefreshing || pullDistance > 60 ? 'animate-spin-slow' : ''}`}
                        style={{ opacity: Math.min(pullDistance / 60, 1), transform: `rotate(${pullDistance * 4}deg)` }} />
                </div>
            )}

            {/* ── HEADER ── */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between px-3 sm:px-5 pt-3 sm:pt-4 pb-2 sm:pb-4 transition-all z-10 relative min-h-auto sm:min-h-[160px]">
                {/* Logo en móvil: centrado arriba */}
                <div className="flex sm:hidden justify-center w-full mb-3">
                    <img 
                        src="/logo.png" 
                        alt="Pool Imperial" 
                        onClick={onLogoClick} 
                        style={{ height: '100px' }} 
                        className="w-auto object-contain select-none drop-shadow-sm pointer-events-auto transition-transform active:scale-95 cursor-pointer" 
                        draggable={false} 
                    />
                </div>

                {/* Controles de la izquierda (izquierda en desktop, toda la fila en móvil) */}
                <div className="flex items-center justify-between sm:justify-start w-full sm:w-auto gap-2 sm:gap-3 z-20">
                    <div className="flex items-center gap-2 sm:gap-3">
                        <SyncStatus />
                        {usuarioActivo && (() => {
                            const r = usuarioActivo.role || usuarioActivo.rol;
                            const c = r === 'ADMIN' ? {bg:'bg-amber-50',border:'border-amber-100/50',ping:'bg-amber-400',dot:'bg-amber-500',text:'text-amber-800',btn:'text-amber-500 hover:bg-amber-100 hover:text-amber-700'}
                                    : r === 'MESERO' || r === 'BARRA' ? (r === 'BARRA'
                                        ? {bg:'bg-violet-50',border:'border-violet-100/50',ping:'bg-violet-400',dot:'bg-violet-500',text:'text-violet-800',btn:'text-violet-500 hover:bg-violet-100 hover:text-violet-700'}
                                        : {bg:'bg-orange-50',border:'border-orange-100/50',ping:'bg-orange-400',dot:'bg-orange-500',text:'text-orange-800',btn:'text-orange-500 hover:bg-orange-100 hover:text-orange-700'})
                                    : {bg:'bg-amber-50',border:'border-amber-100/50',ping:'bg-amber-400',dot:'bg-amber-500',text:'text-amber-800',btn:'text-amber-500 hover:bg-amber-100 hover:text-amber-700'};
                            return (
                                <div className={`flex items-center gap-1.5 ${c.bg} ${c.border} border rounded-full pl-2 pr-1 sm:pl-3 sm:pr-1.5 py-1 sm:py-1.5 shadow-sm`}>
                                    <div className="relative flex h-2 w-2 ml-1 sm:ml-0">
                                        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${c.ping}`}></span>
                                        <span className={`relative inline-flex rounded-full h-2 w-2 ${c.dot}`}></span>
                                    </div>
                                    <span className={`hidden sm:block text-xs font-black sm:max-w-[120px] truncate ${c.text}`}>{usuarioActivo.name.split(' ')[0]}</span>
                                    <button onClick={() => { triggerHaptic?.(); authLogout(); }} className={`p-1.5 ml-0.5 transition-all rounded-full active:scale-90 ${c.btn}`}>
                                        <LockIcon size={14} strokeWidth={2.5} />
                                    </button>
                                </div>
                            );
                        })()}
                    </div>

                    {/* Botones de acción en móvil (alineados a la derecha de la fila) */}
                    <div className="flex sm:hidden items-center gap-2">
                        {/* Bell notification icon */}
                        <div className="relative">
                            <button onClick={() => { triggerHaptic?.(); setShowNotifPanel(!showNotifPanel); }}
                                className={`p-2 flex items-center justify-center rounded-full shadow-sm border transition-all active:scale-95 ${totalCount > 0 ? 'bg-amber-50 border-amber-100 text-amber-600 hover:bg-amber-100' : 'bg-slate-50 border-slate-100 text-slate-400'}`}>
                                <Bell size={16} strokeWidth={2.5} />
                                {totalCount > 0 && (
                                    <span className={`absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-[10px] font-black text-white px-1 ${urgentCount > 0 ? 'bg-red-500 animate-pulse' : 'bg-amber-500'}`}>
                                        {totalCount}
                                    </span>
                                )}
                            </button>
                        </div>
                        {isAdmin && (
                            <button onClick={async () => {
                                const ok = await confirm({ title: 'Cerrar sesión', message: 'Se cerrará tu acceso a la nube.', confirmText: 'Cerrar sesión', cancelText: 'Cancelar', variant: 'logout' });
                                if (!ok) return;
                                await supabaseCloud.auth.signOut();
                                window.location.reload();
                            }} className="p-2 flex items-center bg-rose-50 border border-rose-100 text-rose-500 rounded-full shadow-sm hover:bg-rose-100 hover:text-rose-600 active:scale-95 transition-all">
                                <LogOut size={16} strokeWidth={2.5} />
                            </button>
                        )}
                    </div>
                </div>

                {/* Logo en Desktop: absoluto y centrado */}
                <div className="hidden sm:flex absolute z-0 pointer-events-none inset-x-0 top-2 justify-center">
                    <img src="/logo.png" alt="Pool Imperial" onClick={onLogoClick} style={{ height: '139px' }} className="w-auto object-contain select-none drop-shadow-sm pointer-events-auto transition-transform hover:scale-105 duration-300 cursor-pointer" draggable={false} />
                </div>

                {/* Botones de acción en Desktop */}
                <div className="hidden sm:flex items-center justify-end gap-2 z-20">
                    {/* Bell notification icon */}
                    <div className="relative">
                        <button onClick={() => { triggerHaptic?.(); setShowNotifPanel(!showNotifPanel); }}
                            className={`p-2 flex items-center justify-center rounded-full shadow-sm border transition-all active:scale-95 ${totalCount > 0 ? 'bg-amber-50 border-amber-100 text-amber-600 hover:bg-amber-100' : 'bg-slate-50 border-slate-100 text-slate-400'}`}>
                            <Bell size={16} strokeWidth={2.5} />
                            {totalCount > 0 && (
                                <span className={`absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-[10px] font-black text-white px-1 ${urgentCount > 0 ? 'bg-red-500 animate-pulse' : 'bg-amber-500'}`}>
                                    {totalCount}
                                </span>
                            )}
                        </button>
                    </div>
                    {isAdmin && (
                        <button onClick={async () => {
                            const ok = await confirm({ title: 'Cerrar sesión', message: 'Se cerrará tu acceso a la nube.', confirmText: 'Cerrar sesión', cancelText: 'Cancelar', variant: 'logout' });
                            if (!ok) return;
                            await supabaseCloud.auth.signOut();
                            window.location.reload();
                        }} className="p-2 sm:px-4 sm:py-2 flex items-center gap-1.5 bg-rose-50 border border-rose-100 text-rose-500 rounded-full shadow-sm hover:bg-rose-100 hover:text-rose-600 active:scale-95 transition-all">
                            <LogOut size={16} strokeWidth={2.5} />
                            <span className="hidden sm:block text-xs font-bold uppercase tracking-wider">Salir</span>
                        </button>
                    )}
                </div>
            </div>

            {/* ── NOTIFICATION PANEL ── */}
            {showNotifPanel && (
                <div className="absolute right-3 sm:right-5 top-[110px] sm:top-[150px] z-50 w-[calc(100%-24px)] sm:w-80 max-h-[60vh] overflow-y-auto bg-white rounded-2xl shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-150">
                    <div className="flex items-center justify-between p-3 border-b border-slate-100">
                        <h3 className="text-xs font-black text-slate-700 uppercase tracking-wider">Notificaciones</h3>
                        <button onClick={() => setShowNotifPanel(false)} className="p-1 rounded-full hover:bg-slate-100 text-slate-400 active:scale-90 transition-all">
                            <X size={14} />
                        </button>
                    </div>
                    {notifications.length === 0 ? (
                        <div className="flex flex-col items-center py-8 gap-2">
                            <Bell size={28} className="text-slate-200" />
                            <p className="text-xs text-slate-400 font-medium">Sin notificaciones</p>
                        </div>
                    ) : (
                        <div className="p-2 space-y-1.5">
                            {notifications.map(n => {
                                const colors = n.type === 'urgent' ? 'bg-red-50 border-red-100 text-red-600' : n.type === 'warning' ? 'bg-amber-50 border-amber-100 text-amber-600' : 'bg-amber-50 border-amber-100 text-amber-600';
                                const IconComp = n.icon === 'clock' ? Clock : n.icon === 'package' ? Package : n.icon === 'wallet' ? Wallet : Users;
                                return (
                                    <button key={n.id} onClick={() => { if (n.action && onNavigate) { triggerHaptic?.(); setShowNotifPanel(false); if (n.navFilter) { localStorage.setItem(n.navFilter.key, n.navFilter.value); window.dispatchEvent(new Event(n.navFilter.key)); } onNavigate(n.action); } }}
                                        className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all active:scale-[0.98] ${colors} ${n.action ? 'cursor-pointer' : 'cursor-default'}`}>
                                        <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-white/60 shrink-0">
                                            <IconComp size={16} strokeWidth={2.5} />
                                        </div>
                                        <div className="text-left min-w-0">
                                            <p className="text-[11px] font-black uppercase tracking-wider">{n.title}</p>
                                            <p className="text-[11px] font-medium opacity-80 truncate">{n.message}</p>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
            {showNotifPanel && <div className="fixed inset-0 z-40" onClick={() => setShowNotifPanel(false)} />}

            {/* ── SCROLL CONTENT ── */}
            <div className="flex flex-col gap-3 px-3 sm:px-4 md:px-6 lg:px-8 pt-2 pb-28">

            {/* Demo Banner */}
            {isDemo && demoTimeLeft && (
                <div className="rounded-2xl p-4 relative overflow-hidden text-white flex items-center justify-between" style={{ background: 'linear-gradient(135deg, #F59E0B, #F97316)' }}>
                    <div className="absolute right-0 top-0 w-28 h-28 bg-white/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
                    <div className="flex items-center gap-3 relative z-10">
                        <div className="w-10 h-10 bg-black/20 rounded-xl flex items-center justify-center"><Key size={20} className="text-amber-100" /></div>
                        <div><h3 className="text-[12px] font-bold text-amber-50">Licencia de Prueba</h3><p className="text-lg font-black">{demoTimeLeft}</p></div>
                    </div>
                    <div className="relative z-10">
                        <button className="text-[10px] font-black bg-white/25 hover:bg-white/35 px-3 py-1.5 rounded-lg active:scale-95 transition-colors"
                            onClick={() => window.open(`https://wa.me/584124051793?text=Hola! Quiero adquirir Pool Imperial. ID: ${deviceId || 'N/A'}`.replace(/\s+/g, '%20'), '_blank')}>
                            ADQUIRIR
                        </button>
                    </div>
                </div>
            )}

            {isAdmin ? (
                <>
                <DashboardHeroCard
                    isAdmin={isAdmin} dashTab={dashTab} setDashTab={setDashTab}
                    hasCashSession={hasCashSession} activeCashSession={activeCashSession}
                    displayTotalUsd={displayTotalUsd} displayTotalBs={displayTotalBs}
                    displaySalesCount={displaySalesCount} displayItemsSold={displayItemsSold}
                    displayProfit={displayProfit} bcvRate={bcvRate} useAutoRate={useAutoRate}
                    onNavigate={onNavigate}
                />
                </>
            ) : (
                <OperatorDashboardPanel onNavigate={onNavigate} />
            )}

            {/* ── ACCIONES RÁPIDAS ── */}
            {role !== 'MESERO' && role !== 'BARRA' && (
            <div className={`bg-white rounded-2xl p-3 border border-slate-100 shadow-sm ${!isAdmin ? 'mt-3' : ''}`}>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2.5 px-1">Acciones Rápidas</p>
                <div className="flex gap-2">
                    {isAdmin && (
                        <button onClick={() => { if (onNavigate) { triggerHaptic(); onNavigate('mesas'); } }}
                            className="flex-1 flex flex-col items-center gap-1.5 py-3.5 rounded-xl active:scale-95 transition-all"
                            style={{ background: 'linear-gradient(135deg, #F59E0B, #D97706)', boxShadow: '0 4px 12px rgba(217,119,6,0.25)' }}>
                            <ListChecks size={22} className="text-white" />
                            <span className="text-[11px] font-black text-white">Mesas</span>
                        </button>
                    )}
                    {isAdmin && (
                        <button onClick={() => { if (onNavigate) { triggerHaptic(); onNavigate('reportes'); } }}
                            className="flex-1 flex flex-col items-center gap-1.5 py-3.5 rounded-xl active:scale-95 transition-all"
                            style={{ background: 'linear-gradient(135deg, #334155, #1E293B)', boxShadow: '0 4px 12px rgba(51,65,85,0.15)' }}>
                            <LineChart size={22} className="text-white" />
                            <span className="text-[11px] font-black text-white">Reportes</span>
                        </button>
                    )}
                    {isAdmin && (
                        <button onClick={() => { if (onNavigate) { triggerHaptic(); localStorage.setItem('cuentas_open_tab', 'empleados'); onNavigate('clientes'); } }}
                            className="flex-1 flex flex-col items-center gap-1.5 py-3.5 rounded-xl active:scale-95 transition-all"
                            style={{ background: 'linear-gradient(135deg, #F43F5E, #E11D48)', boxShadow: '0 4px 12px rgba(244,63,94,0.25)' }}>
                            <Receipt size={22} className="text-white" />
                            <span className="text-[11px] font-black text-white">Empleados</span>
                        </button>
                    )}
                    {role !== 'MESERO' && role !== 'BARRA' && (
                        <button onClick={() => { if (onNavigate) { triggerHaptic(); onNavigate('clientes'); } }}
                            className="flex-1 flex flex-col items-center gap-1.5 py-3.5 rounded-xl active:scale-95 transition-all"
                            style={{ background: 'linear-gradient(135deg, #10B981, #059669)', boxShadow: '0 4px 12px rgba(16,185,129,0.2)' }}>
                            <Users size={22} className="text-white" />
                            <span className="text-[11px] font-black text-white">Cuentas</span>
                        </button>
                    )}
                </div>
            </div>
            )}
            {todayExpensesUsd > 0 && (
                <div className="bg-white rounded-2xl p-4 border border-orange-100 shadow-sm flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center"><Package size={18} className="text-orange-500" /></div>
                        <div>
                            <p className="text-[10px] font-bold text-orange-400 uppercase tracking-wider">Egresos del día</p>
                            <p className="text-lg font-black text-orange-600">-$<AnimatedCounter value={todayExpensesUsd} /></p>
                        </div>
                    </div>
                    <span className="text-xs font-bold text-orange-500 bg-orange-50 px-2.5 py-1 rounded-lg">{todayExpenses.length} {todayExpenses.length === 1 ? 'pago' : 'pagos'}</span>
                </div>
            )}

            {/* ── CERRAR / ABRIR CAJA ── */}
            {!activeCashSession ? (
                (isAdmin || cajeroAbreCaja) ? (
                    <button data-tour="apertura-caja" onClick={() => setIsAperturaOpen(true)}
                        className="w-full rounded-2xl p-4 flex items-center justify-between active:scale-[0.98] transition-all group mt-2"
                        style={{ background: 'linear-gradient(135deg, #10B981, #059669)', boxShadow: '0 6px 20px rgba(5,150,105,0.25)' }}>
                        <div className="flex items-center gap-3">
                            <div className="w-11 h-11 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm"><Unlock size={22} className="text-white" /></div>
                            <div className="text-left">
                                <p className="text-sm font-black text-white">Abrir Caja / Turno</p>
                                <p className="text-[11px] text-white/80 font-medium">Click para iniciar el día de ventas</p>
                            </div>
                        </div>
                    </button>
                ) : (
                    <div className="w-full bg-amber-50 rounded-2xl p-4 border border-amber-200 shadow-sm flex items-center gap-3 mt-4">
                        <div className="w-11 h-11 bg-amber-100 rounded-xl flex items-center justify-center border-2 border-white shadow-sm"><LockIcon size={22} className="text-amber-500" /></div>
                        <div>
                            <p className="text-sm font-black text-slate-800">Caja Cerrada</p>
                            <p className="text-[11px] font-semibold text-slate-500">Espera que un Administrador abra el turno para operar</p>
                        </div>
                    </div>
                )
            ) : (
                (isAdmin || cajeroCierraCaja) && (
                    <button data-tour="cierre-turno" onClick={handleDailyClose}
                        className="w-full rounded-2xl p-4 flex items-center justify-between active:scale-[0.98] transition-all group mt-2"
                        style={{ background: 'linear-gradient(135deg, #F97316, #EF4444)', boxShadow: '0 6px 20px rgba(239,68,68,0.25)' }}>
                        <div className="flex items-center gap-3">
                            <div className="w-11 h-11 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm"><LockIcon size={22} className="text-white" /></div>
                            <div className="text-left">
                                <p className="text-sm font-black text-white">Cerrar Caja</p>
                                <p className="text-[11px] text-white/70 font-medium">
                                    {activeCashSession?.opened_by ? `${activeCashSession.opened_by} · ` : ''}{todaySales.length === 0 && todayCashFlow.length === 0 ? 'Sin movimientos' : `${formatCop(todayTotalUsd)} · ${todaySales.length} ${todaySales.length === 1 ? 'venta' : 'ventas'}`}
                                </p>
                            </div>
                        </div>
                        <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center group-hover:translate-x-0.5 transition-transform"><ArrowUpRight size={18} className="text-white" /></div>
                    </button>
                )
            )}

            {/* ── REPORTE DE TURNO (cajero) ── */}
            {!isAdmin && role !== 'MESERO' && role !== 'BARRA' && activeCashSession && (
                <button
                    data-tour="cierre-turno"
                    onClick={() => setIsReporteTurnoOpen(true)}
                    className="w-full rounded-2xl p-4 flex items-center justify-between active:scale-[0.98] transition-all group mt-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                    <div className="flex items-center gap-3">
                        <div className="w-11 h-11 bg-amber-50 rounded-xl flex items-center justify-center"><FileText size={20} className="text-amber-500" /></div>
                        <div className="text-left">
                            <p className="text-sm font-black text-slate-700 dark:text-slate-200">Reporte de Turno</p>
                            <p className="text-[11px] text-slate-400">{todaySales.length} {todaySales.length === 1 ? 'venta' : 'ventas'} · {formatCop(todayTotalUsd)}</p>
                        </div>
                    </div>
                    <div className="w-9 h-9 bg-slate-100 dark:bg-slate-700 rounded-xl flex items-center justify-center group-hover:translate-x-0.5 transition-transform">
                        <ArrowUpRight size={16} className="text-slate-400" />
                    </div>
                </button>
            )}

            {/* Deudas Pendientes */}
            {totalDeudas.count > 0 && (
                <div onClick={() => { setShowTopDeudas(!showTopDeudas); triggerHaptic && triggerHaptic(); }}
                    className="bg-white rounded-2xl p-4 border border-rose-100 shadow-sm relative overflow-hidden cursor-pointer active:scale-[0.99] transition-all">
                    <div className="absolute -right-4 -top-4 w-16 h-16 bg-rose-50 rounded-full blur-2xl" />
                    <div className="flex items-center justify-between relative z-10">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-rose-50 rounded-xl flex items-center justify-center"><Users size={20} className="text-rose-500" /></div>
                            <div>
                                <p className="text-[10px] font-bold text-rose-400 uppercase tracking-widest">Deudas</p>
                                <p className="text-xl font-black text-rose-600">{formatCop(totalDeudas.totalUsd)}</p>
                            </div>
                        </div>
                        <div className="text-right flex items-center gap-2">
                            <div>
                                <p className="text-sm font-bold text-slate-500">{totalDeudas.count} {totalDeudas.count === 1 ? 'cliente' : 'clientes'}</p>
                            </div>
                            {showTopDeudas ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                        </div>
                    </div>
                    {showTopDeudas && (
                        <div className="mt-4 pt-3 border-t border-slate-100 space-y-2 relative z-10 animate-fade-in text-slate-700">
                            {totalDeudas.top5.map((c, i) => (
                                <div key={c.id} className="flex items-center justify-between py-1.5">
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <span className="text-[10px] font-black text-rose-300 w-4 text-center shrink-0">{i + 1}</span>
                                        <div className="w-7 h-7 rounded-full bg-rose-50 flex items-center justify-center shrink-0"><span className="text-xs font-black text-rose-500">{c.name.charAt(0).toUpperCase()}</span></div>
                                        <p className="text-xs font-bold truncate">{c.name}</p>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <p className="text-sm font-black text-rose-600">{formatCop(c.deuda || 0)}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Actividad de Juego (Mesas y Partidas) */}
            {(gameStats.totalHours > 0 || gameStats.totalRounds > 0 || gameStats.hoursRevenue > 0 || gameStats.roundsRevenue > 0 || gameStats.totalRevenue > 0) && (
                <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
                    <h3 className="text-xs font-bold text-slate-400 uppercase mb-3 flex items-center gap-1.5">
                        <Clock size={14} className="text-indigo-500" /> Actividad de Juego (Mesas y Partidas)
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="bg-emerald-50/40 rounded-xl p-3 border border-emerald-100/30 flex flex-col">
                            <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400">Tiempo de Juego Facturado</span>
                            <span className="text-base font-black text-emerald-600 mt-1">
                                {formatGameHours(gameStats.totalHours)} <span className="text-xs font-medium text-slate-400">({formatCop(gameStats.hoursRevenue)})</span>
                            </span>
                        </div>
                        <div className="bg-amber-50/40 rounded-xl p-3 border border-amber-100/30 flex flex-col">
                            <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400">Jugadas Facturadas</span>
                            <span className="text-base font-black text-amber-600 mt-1">
                                {gameStats.totalRounds} u <span className="text-xs font-medium text-slate-400">({formatCop(gameStats.roundsRevenue)})</span>
                            </span>
                        </div>
                        <div className="bg-indigo-50/40 rounded-xl p-3 border border-indigo-100/30 flex flex-col">
                            <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400">Total Recaudo de Mesas</span>
                            <span className="text-base font-black text-indigo-600 mt-1">
                                {formatCop(gameStats.totalRevenue)}
                            </span>
                        </div>
                    </div>
                </div>
            )}

            {/* Medios de Pago */}
            {isAdmin && Object.keys(salesPaymentBreakdown).length > 0 && (
                <DashboardPaymentBreakdown
                    salesPaymentBreakdown={salesPaymentBreakdown}
                    todayTotalBs={todayTotalBs}
                    bcvRate={bcvRate}
                    copEnabled={copEnabled}
                    tasaCop={tasaCop}
                />
            )}

            {/* Gráfica semanal */}
            {isAdmin && <SalesChart weekData={weekData} selectedDate={selectedChartDate} onDayClick={(date) => { triggerHaptic(); setSelectedChartDate(prev => prev === date ? null : date); setTimeout(() => { window.scrollBy({ top: 150, behavior: 'smooth' }); }, 50); }} />}

            {/* Bajo Stock */}
            {isAdmin && lowStockProducts.length > 0 && (
                <div className="bg-white rounded-2xl p-4 border border-amber-100 shadow-sm">
                    <h3 className="text-[10px] font-bold text-amber-500 uppercase tracking-widest mb-3 flex items-center gap-1.5"><AlertTriangle size={14} /> Bajo Stock</h3>
                    <div className="flex flex-wrap gap-2">
                        {lowStockProducts.map(p => (
                            <div key={p.id} className="flex items-center gap-2 bg-slate-50 border border-slate-100 px-3 py-1.5 rounded-xl">
                                <span className={`w-2 h-2 rounded-full ${(p.stock ?? 0) === 0 ? 'bg-red-500' : 'bg-amber-400'}`} />
                                <span className="text-xs font-bold text-slate-700 truncate max-w-[120px]">{p.name}</span>
                                <span className="text-[10px] font-black text-slate-400 ml-1">{p.stock ?? 0} {p.unit === 'kg' ? 'kg' : p.unit === 'litro' ? 'lt' : 'u'}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Top Productos */}
            {isAdmin && topProducts.length > 0 && (
                <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
                    <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-1.5"><TrendingUp size={14} /> Más Vendidos</h3>
                    <div className="space-y-3">
                        {topProducts.map((p, i) => (
                            <div key={p.name} className="flex items-center justify-between">
                                <div className="flex items-center gap-2 min-w-0">
                                    <span className={`text-[10px] font-black w-4 text-center shrink-0 ${i === 0 ? 'text-amber-500' : i === 1 ? 'text-slate-400' : i === 2 ? 'text-orange-400' : 'text-slate-300'}`}>{i + 1}</span>
                                    <p className="text-xs font-bold text-slate-700 truncate">{p.name}</p>
                                </div>
                                <span className="text-xs font-black text-[#D97706] shrink-0 pl-2">{p.qty} u</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}


            {/* Top Meseros — visible para admin con botón reiniciar */}
            {isAdmin && (
                <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-[10px] font-bold text-orange-500 uppercase tracking-widest flex items-center gap-1.5"><Award size={14} /> Ranking Meseros</h3>
                        {topStaff.length > 0 && (
                            <button onClick={async () => {
                                const ok = await confirm({ title: 'Reiniciar ranking', message: '¿Reiniciar el ranking de meseros? El conteo empezará desde cero.', confirmText: 'Reiniciar', variant: 'danger' });
                                if (!ok) return;
                                localStorage.setItem('ranking_meseros_since', new Date().toISOString());
                                window.location.reload();
                            }}
                                className="text-[10px] font-bold text-slate-400 hover:text-red-500 flex items-center gap-1 transition-colors active:scale-95">
                                <RotateCcw size={10} /> Reiniciar
                            </button>
                        )}
                    </div>
                    {topStaff.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-4 gap-1.5">
                            <Users size={24} className="text-slate-200" />
                            <p className="text-xs text-slate-400 text-center">Aún no hay ventas de meseros registradas.</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {topStaff.map((s, i) => {
                                const maxRevenue = topStaff[0]?.revenue || 1;
                                const pct = Math.round((s.revenue / maxRevenue) * 100);
                                return (
                                    <div key={s.id}>
                                        <div className="flex items-center justify-between mb-1">
                                            <div className="flex items-center gap-2.5 min-w-0">
                                                <span className={`text-sm font-black w-5 text-center shrink-0 ${i === 0 ? 'text-amber-500' : i === 1 ? 'text-slate-400' : i === 2 ? 'text-orange-400' : 'text-slate-300'}`}>
                                                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}
                                                </span>
                                                <div className="min-w-0">
                                                    <p className="text-xs font-bold text-slate-700 truncate">{s.name}</p>
                                                    <p className="text-[10px] text-slate-400">{s.ventas} {s.ventas === 1 ? 'venta' : 'ventas'}</p>
                                                </div>
                                            </div>
                                            <span className="text-sm font-black text-emerald-600 shrink-0 pl-2">${s.revenue.toFixed(2)}</span>
                                        </div>
                                        <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                                            <div className={`h-1 rounded-full ${i === 0 ? 'bg-amber-400' : i === 1 ? 'bg-slate-300' : i === 2 ? 'bg-orange-300' : 'bg-orange-200'}`} style={{ width: `${pct}%` }} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {isAdmin && (
                <SalesHistory sales={sales} recentSales={recentSales} bcvRate={bcvRate} totalSalesCount={sales.length} isAdmin={isAdmin}
                    onVoidSale={handleVoidSale} onShareWhatsApp={handleShareWhatsApp} onDownloadPDF={handleDownloadPDF}
                    onOpenDeleteModal={() => setIsDeleteModalOpen(true)}
                    onRequestClientForTicket={(sale) => { triggerHaptic && triggerHaptic(); setTicketPendingSale(sale); }}
                    onRecycleSale={(sale) => { triggerHaptic && triggerHaptic(); loadCart(sale.items); if (onNavigate) onNavigate('ventas'); }}
                    onPrintTicket={handlePrintTicket}
                />
            )}

            {isAdmin && sales.length === 0 && (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-300 py-10 space-y-3">
                    <BarChart3 size={64} strokeWidth={1} />
                    <p className="text-sm font-bold text-slate-500">Sin datos aún</p>
                    <p className="text-xs font-medium text-slate-400">Las estadísticas aparecerán con tu primera venta</p>
                </div>
            )}
            </div>

            {/* Modal Registrar Cliente para Ticket */}
            <TicketClientModal
                ticketPendingSale={ticketPendingSale} setTicketPendingSale={setTicketPendingSale}
                ticketClientName={ticketClientName} setTicketClientName={setTicketClientName}
                ticketClientPhone={ticketClientPhone} setTicketClientPhone={setTicketClientPhone}
                ticketClientDocument={ticketClientDocument} setTicketClientDocument={setTicketClientDocument}
                onRegisterClient={handleRegisterClientForTicket}
            />

            {/* Modal Borrar Historial */}
            <DeleteHistoryModal
                isOpen={isDeleteModalOpen} onClose={() => setIsDeleteModalOpen(false)}
                deleteConfirmText={deleteConfirmText} setDeleteConfirmText={setDeleteConfirmText}
                sales={sales} setSales={setSales}
            />

            {/* Modal Reciclar Venta */}
            <RecycleModal
                recycleOffer={recycleOffer} setRecycleOffer={setRecycleOffer}
                loadCart={loadCart} onNavigate={onNavigate}
            />

            <ConfirmModal isOpen={!!voidSaleTarget} onClose={() => setVoidSaleTarget(null)} onConfirm={confirmVoidSale}
                title={`Anular venta #${voidSaleTarget?.id?.substring(0, 6).toUpperCase() || ''}`}
                message={`Esta acción:\n• Marcará la venta como ANULADA\n• Devolverá el stock a la bodega\n• Revertirá deudas o saldos a favor\n\nEsta acción no se puede deshacer.`}
                confirmText="Sí, anular" variant="danger" />

            <CierreCajaWizard isOpen={isCashReconOpen} onClose={() => setIsCashReconOpen(false)} onConfirm={handleConfirmCashRecon}
                todaySales={todaySales} todayCashFlow={todayCashFlow} todayTotalUsd={todayTotalUsd} todayTotalBs={todayTotalBs} todayProfit={todayProfit}
                todayItemsSold={todayItemsSold} todayExpensesUsd={todayExpensesUsd} paymentBreakdown={paymentBreakdown}
                todayTopProducts={todayTopProducts} bcvRate={bcvRate} copEnabled={copEnabled} tasaCop={tasaCop} isAdmin={isAdmin}
                apertura={todayApertura} totalTax={dashTab === 'hoy' ? dayTotalTax : todayTotalTax} taxBreakdown={dashTab === 'hoy' ? dayTaxBreakdown : todayTaxBreakdown}
                allSales={todayAllSales} todayAdjustments={todayAdjustments} />

            <AperturaCajaModal isOpen={isAperturaOpen} onClose={() => setIsAperturaOpen(false)} onConfirm={handleSaveApertura} />

            <ReporteTurnoModal
                isOpen={isReporteTurnoOpen}
                onClose={() => setIsReporteTurnoOpen(false)}
                todaySales={todaySales}
                todayTotalUsd={todayTotalUsd}
                todayTotalBs={todayTotalBs}
                todayItemsSold={todayItemsSold}
                paymentBreakdown={paymentBreakdown}
                activeCashSession={activeCashSession}
                cajeroName={usuarioActivo?.name}
                products={products}
                role={role}
                allSales={todayAllSales}
            />
        </div>
    );
}
