import { useState, useEffect, useMemo } from 'react';
import { BarChart3, Calendar, Download, TrendingUp, ShoppingBag, DollarSign, Package, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Clock, Recycle, Search, X, LockIcon, ListOrdered, Percent, Trash2, AlertTriangle } from 'lucide-react';
import { useTablesStore } from '../hooks/store/useTablesStore';
import { formatCop, formatUsd, formatGameHours, computeGameStats } from '../utils/calculatorUtils';
import { FinancialEngine } from '../core/FinancialEngine';
import { generateTicketPDF, printThermalTicket } from '../utils/ticketGenerator';
import { generateMetricsReportPDF, generateSalesReportPDF, generateArticlesReportPDF, generateCierresListReportPDF } from '../utils/salesReportGenerator';
import { useProductContext } from '../context/ProductContext';
import { useCart } from '../context/CartContext';
import EmptyState from '../components/EmptyState';
import CustomSelect from '../components/CustomSelect';
import ConfirmModal from '../components/ConfirmModal';
import { processVoidSale, purgeAllAnnulledSales } from '../utils/voidSaleProcessor';
import { showToast } from '../components/Toast';
import CierreHistoryCard from '../components/Reports/CierreHistoryCard';
import TransactionRow from '../components/Reports/TransactionRow';
import PaymentBreakdownCard from '../components/Reports/PaymentBreakdownCard';
import { useReportsData } from '../hooks/useReportsData';
import { getReportRangeLabel } from '../utils/reportRangeEngine';
import { useAuthStore } from '../hooks/store/authStore';
import { useCashStore } from '../hooks/store/cashStore';
import { storageService } from '../utils/storageService';


const RANGE_OPTIONS = [
    { id: 'current_shift', label: 'Turno Actual' },
    { id: 'today', label: 'Hoy' },
    { id: 'yesterday', label: 'Ayer' },
    { id: 'week', label: 'Esta Semana' },
    { id: 'month', label: 'Este Mes' },
    { id: 'lastMonth', label: 'Mes Anterior' },
    { id: 'custom', label: 'Personalizado' },
];
const HIDDEN_REPORT_USERS = new Set(['sistema', 'super admin', 'administrador']);

function getSaleUserOptions(sale) {
    const options = [];
    if (sale?.meseroId) {
        options.push({
            key: `mesero:${sale.meseroId}`,
            label: `${sale.meseroNombre || 'Mesero'} (Mesero)`,
        });
    }
    if (sale?.vendedorId) {
        options.push({
            key: `vendedor:${sale.vendedorId}`,
            label: `${sale.vendedorNombre || 'Vendedor'} (Vendedor)`,
        });
    }
    if (options.length === 0) {
        const legacyName = sale?.meseroNombre || sale?.vendedorNombre;
        const normalizedName = legacyName ? String(legacyName).trim() : '';
        options.push({
            key: normalizedName ? `legacy:${normalizedName.toLowerCase()}` : 'system',
            label: normalizedName || 'Sistema',
        });
    }
    return options;
}

function saleMatchesUser(sale, selectedKey) {
    return getSaleUserOptions(sale).some(option => option.key === selectedKey);
}

export default function ReportsView({ rates: _rates, triggerHaptic, onNavigate, isActive }) {
    const { products, setProducts, effectiveRate: bcvRate, copEnabled, tasaCop } = useProductContext();
    const { loadCart } = useCart();
    const { role } = useAuthStore();
    const isAdmin = role === 'ADMIN';
    const activeCashSession = useCashStore(state => state.activeCashSession);
    const [cierreToDelete, setCierreToDelete] = useState(null);
    const [activeTab, setActiveTab] = useState('metrics');
    const [selectedRange, setSelectedRange] = useState('week');
    const [customFrom, setCustomFrom] = useState('');
    const [customTo, setCustomTo] = useState('');
    const [expandedSaleId, setExpandedSaleId] = useState(null);
    const [currentPage, setCurrentPage] = useState(1);
    const PAGE_SIZE = 20;
    const [historySearch, setHistorySearch] = useState('');
    const [historyFilter, setHistoryFilter] = useState('all');
    const [userFilter, setUserFilter] = useState('all');
    const [voidSaleTarget, setVoidSaleTarget] = useState(null);
    const [purgeTargetIds, setPurgeTargetIds] = useState(null);
    const [recycleOffer, setRecycleOffer] = useState(null);
    const [articleSearch, setArticleSearch] = useState('');
    const [articleSort, setArticleSort] = useState('qty'); // 'qty' | 'revenue' | 'name'

    const {
        allSales, setAllSales, isLoading,
        isSyncing, syncError, lastSyncedAt, pendingSalesCount, syncConflictCount, range,
        salesForStats, salesForCashFlow, historySales, productSales,
        totalUsd, totalBs, totalItems, profit,
        paymentBreakdown, topProducts, salesByDay,
        groupedClosings, maxDayTotal,
        avgRate, totalUsdReal, profitUsdReal,
        totalTax, taxBreakdown, netRevenue,
    } = useReportsData({
        isActive,
        products,
        bcvRate,
        selectedRange,
        customFrom,
        customTo,
        activeTab,
        tasaCop,
        activeCashSession,
    });

    const cierreNumbers = useMemo(() => {
        const allCierreIds = Array.from(new Set(
            allSales.map(sale => sale.cierreId ?? sale.closureId ?? sale.cierre_id ?? sale.closure_id).filter(Boolean)
        )).sort((a, b) => {
            const aNumber = Number(a);
            const bNumber = Number(b);
            if (Number.isFinite(aNumber) && Number.isFinite(bNumber)) return aNumber - bNumber;
            return String(a).localeCompare(String(b));
        });
        const numbers = {};
        allCierreIds.forEach((cId, index) => {
            numbers[cId] = index + 1;
        });
        return numbers;
    }, [allSales]);

    const tipsBreakdown = useMemo(() => {
        const tipsByUser = {};
        let totalTips = 0;
        
        salesForStats.forEach(s => {
            if (s.status === 'ANULADA') return;
            (s.items || []).forEach(item => {
                if (item.isTip || (item.name && item.name.toLowerCase().includes('propina'))) {
                    const user = s.meseroNombre || s.vendedorNombre || 'Sistema';
                    const amt = (item.priceUsd || 0) * (item.qty || 1);
                    if (amt > 0) {
                        tipsByUser[user] = (tipsByUser[user] || 0) + amt;
                        totalTips += amt;
                    }
                }
            });
        });
        
        return {
            users: Object.entries(tipsByUser)
                .map(([name, total]) => ({ name, total }))
                .sort((a, b) => b.total - a.total),
            total: totalTips
        };
    }, [salesForStats]);

    const gameStats = useMemo(() => computeGameStats(salesForStats), [salesForStats]);

    // ── Aggregated product sales for "Por Artículo" tab ──
    // Usa snapshots históricos de la venta, no el catálogo actual: un producto
    // eliminado o renombrado no desaparece del reporte.
    const allProductsSold = useMemo(() => {
        let list = (productSales || []).map(product => ({
            ...product,
            qty: Number(product.qty) || 0,
            revenue: Number(product.revenue) || 0,
        }));
        if (articleSearch.trim()) {
            const q = articleSearch.toLowerCase();
            list = list.filter(product => product.name.toLowerCase().includes(q));
        }
        if (articleSort === 'qty') list.sort((a, b) => b.qty - a.qty);
        else if (articleSort === 'revenue') list.sort((a, b) => b.revenue - a.revenue);
        else list.sort((a, b) => a.name.localeCompare(b.name));
        return list;
    }, [productSales, articleSearch, articleSort]);

    const confirmVoidSale = async () => {
        const sale = voidSaleTarget;
        if (!sale) return;
        setVoidSaleTarget(null);
        try {
            const { updatedSales, updatedProducts, abonoReversion } = await processVoidSale(sale, allSales, products);
            setProducts(updatedProducts);
            setAllSales(updatedSales);
            if (abonoReversion?.reverted) {
                showToast(`Abono revertido de la mesa${abonoReversion.itemsRestored > 0 ? ` (${abonoReversion.itemsRestored} items devueltos a la comanda)` : ''}`, 'success');
            } else if (abonoReversion?.ambiguous) {
                showToast('Hay varios abonos con el mismo monto: revierte el abono manualmente en la mesa', 'warning');
            }
            setRecycleOffer(sale);
        } catch (error) {
            console.error('Error anulando venta:', error);
        }
    };

    const handlePurgeAnnulledInReports = async () => {
        triggerHaptic && triggerHaptic();
        const saleIds = Array.from(new Set((purgeTargetIds || []).filter(Boolean)));
        setPurgeTargetIds(null);
        if (saleIds.length === 0) return;
        try {
            const res = await purgeAllAnnulledSales({ saleIds });
            if (res.count > 0) {
                setAllSales(res.sales);
                showToast(`Se eliminaron ${res.count} ventas anuladas del filtro visible`, 'success');
            } else {
                showToast('Las ventas anuladas visibles ya no están disponibles para purgar', 'info');
            }
        } catch (e) {
            console.error('Error purgando anuladas:', e);
            showToast(e?.message || 'No se pudieron purgar las ventas anuladas', 'error');
        }
    };

    const handleDeleteCierre = async (cierreId, shouldReopen = true) => {
        const closureKey = String(cierreId);
        const salesInCierre = allSales.filter(s => String(s.cierreId ?? s.closureId ?? s.cierre_id ?? s.closure_id ?? '') === closureKey);
        const cierreRecord = salesInCierre.find(s => s.tipo === 'CIERRE_CAJA');
        const cashSessionId = cierreRecord?.cashSessionId
            || cierreRecord?.cash_session_id
            || salesInCierre.find(s => s.cashSessionId || s.cash_session_id)?.cashSessionId
            || salesInCierre.find(s => s.cash_session_id)?.cash_session_id
            || null;

        if (salesInCierre.length === 0) {
            showToast('El cierre seleccionado ya no existe en este dispositivo', 'warning');
            return;
        }

        // Nunca inferir qué caja reabrir por "la última cerrada": dos cierres
        // cercanos pueden pertenecer a cuentas o turnos distintos.
        if (shouldReopen) {
            if (!cashSessionId) {
                showToast('Este cierre antiguo no tiene vínculo con una sesión de caja. Usa “Solo Borrar Cierre” o corrígelo manualmente.', 'warning');
                return;
            }
            if (activeCashSession?.id && String(activeCashSession.id) !== String(cashSessionId)) {
                showToast('Ya existe otro turno abierto; cierra ese turno antes de reabrir este cierre.', 'warning');
                return;
            }

            try {
                const { supabaseCloud } = await import('../config/supabaseCloud');
                const { data: { session } } = await supabaseCloud.auth.getSession();
                if (!session?.user?.id) throw new Error('Se requiere conexión con la cuenta para reabrir el turno.');

                const { data: targetSession, error: readError } = await supabaseCloud
                    .from('cash_sessions')
                    .select('id,status,closed_at')
                    .eq('id', cashSessionId)
                    .eq('user_id', session.user.id)
                    .maybeSingle();
                if (readError) throw readError;
                if (!targetSession || targetSession.status !== 'CLOSED') {
                    throw new Error('La sesión vinculada no está cerrada o ya fue modificada.');
                }

                const { data: reopenedRows, error: reopenError } = await supabaseCloud
                    .from('cash_sessions')
                    .update({ status: 'OPEN', closed_at: null, final_cash_usd: 0 })
                    .eq('id', cashSessionId)
                    .eq('user_id', session.user.id)
                    .eq('status', 'CLOSED')
                    .select('id');
                if (reopenError) throw reopenError;
                if (!reopenedRows?.length) throw new Error('La sesión cambió mientras se reabría; no se modificó el historial local.');
            } catch (error) {
                console.error('Error al reabrir la sesión vinculada:', error);
                showToast(error?.message || 'No se pudo reabrir la sesión de caja', 'error');
                return;
            }
        }

        const updatedSales = allSales.map(sale => {
            if (String(sale.cierreId ?? sale.closureId ?? sale.cierre_id ?? sale.closure_id ?? '') !== closureKey) return sale;
            return shouldReopen
                ? { ...sale, cajaCerrada: false, cierreId: null, closureId: null, cierre_id: null, closure_id: null }
                : { ...sale, cierreId: null, closureId: null, cierre_id: null, closure_id: null };
        });

        await storageService.setItem('bodega_sales_v1', updatedSales);
        setAllSales(updatedSales);
        window.dispatchEvent(new CustomEvent('app_storage_update', { detail: { key: 'bodega_sales_v1' } }));

        try {
            const { supabaseCloud } = await import('../config/supabaseCloud');
            const { data: { session } } = await supabaseCloud.auth.getSession();
            if (session?.user?.id) {
                const { syncCierreMarks } = await import('../utils/salesSyncService');
                const salesToSync = updatedSales.filter(sale => salesInCierre.some(previous => previous.id === sale.id));
                await syncCierreMarks(salesToSync, session.user.id);
            }
        } catch (error) {
            console.error('Error al sincronizar marcas de cierre a la nube:', error);
            showToast('El cambio quedó local; no se pudo sincronizar aún con la nube.', 'warning');
        }

        if (shouldReopen) {
            await useCashStore.getState().syncCashSession(true);
            showToast('Turno reabierto con la sesión vinculada', 'success');
        } else {
            showToast('Cierre eliminado; las ventas permanecen cerradas', 'success');
        }
    };

    const handleExportPDF = async () => {
        triggerHaptic && triggerHaptic();
        try {
            const rangeLabel = getReportRangeLabel(range);

            if (activeTab === 'metrics') {
                generateMetricsReportPDF({
                    totalCOP: totalUsd,
                    netRevenue,
                    totalTax,
                    taxBreakdown,
                    profit,
                    totalItems,
                    salesForStats,
                    paymentBreakdown,
                    topProducts,
                    salesByDay,
                }, {
                    rangeLabel,
                    businessName: localStorage.getItem('business_name') || 'Pool Imperial',
                });
            } else if (activeTab === 'articles') {
                generateArticlesReportPDF(allProductsSold, {
                    rangeLabel,
                    search: articleSearch,
                    businessName: localStorage.getItem('business_name') || 'Pool Imperial'
                });
            } else if (activeTab === 'sales') {
                const filterLabel = { all: 'Todas', completed: 'Completadas', voided: 'Anuladas' }[historyFilter] || 'Todas';
                generateSalesReportPDF(searchedSales, {
                    rangeLabel,
                    search: historySearch,
                    filterLabel,
                    userName: selectedUserLabel,
                    commission: userFilter !== 'all' ? selectedUserCommission : null,
                });
            } else if (activeTab === 'history') {
                generateCierresListReportPDF(groupedClosings, {
                    rangeLabel,
                    businessName: localStorage.getItem('business_name') || 'Pool Imperial'
                });
            }
        } catch (e) {
            console.error('Error generando PDF:', e);
        }
    };

    // ── Filtered sales for history (must be before early return to respect rules of hooks) ──
    const searchedSales = useMemo(() => historySales.filter(s => {
        const matchesFilter = historyFilter === 'all'
            || (historyFilter === 'completed' && s.status !== 'ANULADA')
            || (historyFilter === 'voided' && s.status === 'ANULADA');
        if (!matchesFilter) return false;
        // Filtro por usuario: prioriza ID (mesero/vendedor) y mantiene
        // compatibilidad con ventas antiguas que solo guardaban el nombre.
        if (userFilter !== 'all' && !saleMatchesUser(s, userFilter)) return false;
        if (!historySearch.trim()) return true;
        const q = historySearch.toLowerCase();
        if ((s.customerName || 'consumidor final').toLowerCase().includes(q)) return true;
        if (s.items && s.items.some(i => String(i?.name || '').toLowerCase().includes(q))) return true;
        if (String(s.id || '').toLowerCase().includes(q)) return true;
        // Búsqueda por número de factura (ej: "73", "#73", "0000073")
        if (s.saleNumber !== undefined && String(s.saleNumber).includes(q.replace('#', ''))) return true;
        if (s.saleNumber !== undefined && String(s.saleNumber).padStart(7, '0').includes(q.replace('#', ''))) return true;
        // Búsqueda por nombre de mesa
        if (s.tableName && String(s.tableName).toLowerCase().includes(q)) return true;
        // Búsqueda por nombre de usuario (mesero/vendedor que atendió)
        if (s.meseroNombre && String(s.meseroNombre).toLowerCase().includes(q)) return true;
        if (s.vendedorNombre && String(s.vendedorNombre).toLowerCase().includes(q)) return true;
        return false;
    }), [historySales, historyFilter, historySearch, userFilter]);

    const isDownloadDisabled = useMemo(() => {
        if (!range?.isValid) return true;
        if (activeTab === 'metrics') return salesForStats.length === 0 && salesForCashFlow.length === 0;
        if (activeTab === 'articles') return allProductsSold.length === 0;
        if (activeTab === 'sales') return searchedSales.length === 0;
        if (activeTab === 'history') return groupedClosings.length === 0;
        return true;
    }, [range, activeTab, salesForStats, salesForCashFlow, allProductsSold, searchedSales, groupedClosings]);

    const completedInList = searchedSales.filter(s => s.status !== 'ANULADA');
    const voidedInList = searchedSales.filter(s => s.status === 'ANULADA');
    const sumUsd = completedInList.reduce((total, sale) => total + FinancialEngine.calculateSaleNetTotal(sale), 0);

    // Lista de usuarios (meseros/vendedores) presentes en el periodo
    const usersInPeriod = useMemo(() => {
        const users = new Map();
        historySales.forEach(sale => {
            getSaleUserOptions(sale).forEach(({ key, label }) => {
                if (!label || HIDDEN_REPORT_USERS.has(label.toLowerCase())) return;
                if (!users.has(key)) users.set(key, { key, label });
            });
        });
        return Array.from(users.values()).sort((a, b) => a.label.localeCompare(b.label));
    }, [historySales]);

    const selectedUserLabel = useMemo(() => {
        if (userFilter === 'all') return '';
        return usersInPeriod.find(user => user.key === userFilter)?.label || '';
    }, [userFilter, usersInPeriod]);

    // Comisiones (propinas) generadas por el usuario seleccionado en el rango
    const selectedUserCommission = useMemo(() => {
        if (userFilter === 'all') return null;
        let total = 0;
        historySales.forEach(s => {
            if (s.status === 'ANULADA') return;
            if (!saleMatchesUser(s, userFilter)) return;
            (s.items || []).forEach(item => {
                if (item.isTip || (item.name && item.name.toLowerCase().includes('propina'))) {
                    total += (item.priceUsd || 0) * (item.qty || 1);
                }
            });
        });
        return total;
    }, [historySales, userFilter]);

    useEffect(() => {
        setCurrentPage(1);
        setExpandedSaleId(null);
    }, [
        selectedRange,
        customFrom,
        customTo,
        activeTab,
        historyFilter,
        userFilter,
        activeCashSession?.id,
        range?.fromDate,
        range?.toDate,
    ]);

    useEffect(() => {
        if (selectedRange !== 'custom') return;
        setUserFilter('all');
    }, [selectedRange, customFrom, customTo]);


    if (isLoading) {
        return (
            <div className="flex-1 p-3 sm:p-4 md:p-6 space-y-4">
                <div className="skeleton h-10 w-32" />
                <div className="flex gap-2">
                    <div className="skeleton h-9 w-20" />
                    <div className="skeleton h-9 w-24" />
                    <div className="skeleton h-9 w-20" />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="skeleton h-24" />
                    <div className="skeleton h-24" />
                    <div className="skeleton h-24" />
                    <div className="skeleton h-24" />
                </div>
                <div className="skeleton h-40" />
            </div>
        );
    }

    return (
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 space-y-4 md:space-y-5 pb-32 w-full max-w-5xl mx-auto">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <h2 className="text-xl md:text-2xl font-black text-slate-800 dark:text-white flex items-center gap-2">
                    <div className="bg-indigo-500 text-white p-1.5 md:p-2 rounded-xl shadow-lg shadow-indigo-500/30">
                        <BarChart3 size={20} />
                    </div>
                    Reportes
                </h2>
                <button
                        onClick={handleExportPDF}
                        disabled={isDownloadDisabled}
                        className="flex items-center gap-2 px-4 py-2.5 bg-indigo-500 hover:bg-indigo-600 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white font-bold rounded-xl text-sm shadow-md shadow-indigo-500/20 active:scale-95 transition-all"
                    >
                        <Download size={16} /> Descargar PDF
                    </button>
            </div>

            {/* Tab Selector */}
            <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl gap-0.5">
                {[
                    { id: 'metrics', label: 'Métricas', short: 'Métr.', icon: BarChart3, onClick: () => setActiveTab('metrics') },
                    { id: 'articles', label: 'Por Artículo', short: 'Artíc.', icon: ListOrdered, onClick: () => { setActiveTab('articles'); setArticleSearch(''); } },
                    { id: 'sales', label: 'Ventas', short: 'Ventas', icon: Clock, onClick: () => { setActiveTab('sales'); setCurrentPage(1); } },
                    { id: 'history', label: 'Cierres', short: 'Cierres', icon: LockIcon, onClick: () => setActiveTab('history') },
                ].map(tab => {
                    const Icon = tab.icon;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => { triggerHaptic && triggerHaptic(); tab.onClick(); }}
                            className={`flex-1 flex items-center justify-center gap-1 sm:gap-1.5 py-2 px-1 text-[11px] sm:text-sm font-bold rounded-lg transition-all ${activeTab === tab.id ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'}`}
                        >
                            <Icon size={15} className="shrink-0" />
                            <span className="sm:hidden truncate">{tab.short}</span>
                            <span className="hidden sm:inline truncate">{tab.label}</span>
                        </button>
                    );
                })}
            </div>

            {/* Range Selector */}
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-1">
                {RANGE_OPTIONS.map(opt => (
                    <button
                        key={opt.id}
                        onClick={() => { triggerHaptic && triggerHaptic(); setSelectedRange(opt.id); }}
                        className={`px-4 py-1.5 rounded-full text-sm font-bold whitespace-nowrap transition-colors active:scale-95 ${selectedRange === opt.id
                            ? 'bg-indigo-500 text-white shadow-sm shadow-indigo-500/30'
                            : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800'
                            }`}
                    >
                        {opt.label}
                    </button>
                ))}
            </div>
            {range?.isValid && (
                <p className="text-[10px] font-semibold text-slate-400 -mt-2">
                    Periodo efectivo: {getReportRangeLabel(range)} · Zona comercial: {range.timezone}
                </p>
            )}

            {!range?.isValid && !(selectedRange === 'current_shift' && !activeCashSession) && (
                <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 rounded-2xl p-3 flex items-center gap-3 animate-in fade-in duration-200">
                    <AlertTriangle className="text-red-500 shrink-0" size={18} />
                    <p className="text-xs font-bold text-red-700 dark:text-red-300">{range?.error || 'El rango seleccionado no es válido.'}</p>
                </div>
            )}

            {(isSyncing || syncError || lastSyncedAt || pendingSalesCount > 0 || syncConflictCount > 0) && (
                <div className={`rounded-xl px-3 py-2 text-[10px] font-bold flex items-center gap-2 ${syncError || pendingSalesCount > 0 || syncConflictCount > 0
                    ? 'bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-900/40'
                    : 'bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 border border-slate-100 dark:border-slate-800'}`}>
                    <span className={`w-2 h-2 rounded-full shrink-0 ${isSyncing ? 'bg-indigo-500 animate-pulse' : syncError || pendingSalesCount > 0 || syncConflictCount > 0 ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                    {isSyncing
                        ? 'Actualizando reportes desde la nube…'
                        : syncError
                            ? `Datos locales: ${syncError}`
                            : pendingSalesCount > 0
                                ? `${pendingSalesCount} venta(s) pendiente(s) de sincronización local`
                                : syncConflictCount > 0
                                    ? `${syncConflictCount} venta(s) requieren reconciliación manual`
                                    : `Última actualización: ${new Date(lastSyncedAt).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}`}
                </div>
            )}

            {/* Warning when Current Shift is selected but cash is closed */}
            {selectedRange === 'current_shift' && !activeCashSession && (
                <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 rounded-2xl p-4 flex items-center gap-3 mt-3 mb-1 animate-in fade-in duration-200">
                    <AlertTriangle className="text-amber-500 shrink-0" size={20} />
                    <div>
                        <p className="text-sm font-bold text-slate-700 dark:text-white">La caja está cerrada</p>
                        <p className="text-xs text-slate-400 mt-0.5">Abre la caja desde el panel principal para iniciar un turno y ver el acumulado de ventas del turno actual.</p>
                    </div>
                </div>
            )}

            {/* Custom Date Range */}
            {selectedRange === 'custom' && (
                <div className="flex flex-col sm:flex-row gap-3 bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-100 dark:border-slate-800">
                    <div className="flex-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Desde</label>
                        <input
                            type="date"
                            value={customFrom}
                            onChange={e => setCustomFrom(e.target.value)}
                            className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/30"
                        />
                    </div>
                    <div className="flex-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Hasta</label>
                        <input
                            type="date"
                            value={customTo}
                            onChange={e => setCustomTo(e.target.value)}
                            className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/30"
                        />
                    </div>
                </div>
            )}

            {activeTab === 'metrics' ? (
                <>
                    {/* Summary Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <StatCard icon={ShoppingBag} label="Ventas" value={salesForStats.length} color="emerald" />
                        <StatCard icon={DollarSign} label="Ingresos (Neto)" value={formatCop(netRevenue)} sub={`Bruto: ${formatCop(totalUsd)}`} color="blue" />
                        <StatCard icon={TrendingUp} label="Ganancia" value={formatCop(profit)} sub={`≈ ${formatUsd(profitUsdReal)}`} color="indigo" />
                        <StatCard icon={Package} label="Artículos" value={totalItems % 1 === 0 ? totalItems : Number(totalItems.toFixed(2))} color="amber" />
                    </div>

                    {/* Game Metrics */}
                    {(gameStats.totalHours > 0 || gameStats.totalRounds > 0 || gameStats.hoursRevenue > 0 || gameStats.roundsRevenue > 0 || gameStats.totalRevenue > 0) && (
                        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-100 dark:border-slate-800 shadow-sm mt-4">
                            <h3 className="text-xs font-bold text-slate-400 uppercase mb-3 flex items-center gap-1.5">
                                <Clock size={14} className="text-indigo-500" /> Actividad de Juego (Mesas y Partidas)
                            </h3>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div className="bg-emerald-50/40 dark:bg-emerald-950/10 rounded-xl p-3 border border-emerald-100/30 dark:border-emerald-900/20 flex flex-col">
                                    <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400 dark:text-slate-500">Tiempo de Juego Facturado</span>
                                    <span className="text-base font-black text-emerald-600 dark:text-emerald-400 mt-1">
                                        {formatGameHours(gameStats.totalHours)} <span className="text-xs font-medium text-slate-400">({formatCop(gameStats.hoursRevenue)})</span>
                                    </span>
                                </div>
                                <div className="bg-amber-50/40 dark:bg-amber-950/10 rounded-xl p-3 border border-amber-100/30 dark:border-amber-900/20 flex flex-col">
                                    <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400 dark:text-slate-500">Jugadas Facturadas</span>
                                    <span className="text-base font-black text-amber-600 dark:text-amber-400 mt-1">
                                        {gameStats.totalRounds} u <span className="text-xs font-medium text-slate-400">({formatCop(gameStats.roundsRevenue)})</span>
                                    </span>
                                </div>
                                <div className="bg-indigo-50/40 dark:bg-indigo-950/10 rounded-xl p-3 border border-indigo-100/30 dark:border-indigo-900/20 flex flex-col">
                                    <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400 dark:text-slate-500">Total Recaudo de Mesas</span>
                                    <span className="text-base font-black text-indigo-600 dark:text-indigo-400 mt-1">
                                        {formatCop(gameStats.totalRevenue)}
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Tax Breakdown */}
                    {totalTax > 0 && (
                        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-100 dark:border-slate-800 shadow-sm mt-4">
                            <h3 className="text-xs font-bold text-slate-400 uppercase mb-3 flex items-center gap-1.5">
                                <Percent size={14} className="text-indigo-500" /> Impuestos Recaudados
                            </h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                <div className="bg-indigo-50/40 dark:bg-indigo-950/10 rounded-xl p-3 border border-indigo-100/30 dark:border-indigo-900/20 flex flex-col">
                                    <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400 dark:text-slate-500">Total Impuestos</span>
                                    <span className="text-base font-black text-indigo-600 dark:text-indigo-400 mt-1">{formatCop(totalTax)}</span>
                                </div>
                                {Object.entries(taxBreakdown || {}).map(([key, val]) => {
                                    if (val <= 0) return null;
                                    const config = useTablesStore.getState().config;
                                    const label = key === 'iva_19' ? `IVA ${config?.taxRateIva ?? 19}%` : key === 'impoconsumo_8' ? `Impoconsumo ${config?.taxRateImpoconsumo ?? 8}%` : key;
                                    return (
                                        <div key={key} className="bg-slate-50 dark:bg-slate-800/40 rounded-xl p-3 border border-slate-100/50 dark:border-slate-800/50 flex flex-col">
                                            <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400 dark:text-slate-500">{label}</span>
                                            <span className="text-base font-black text-slate-700 dark:text-slate-300 mt-1">{formatCop(val)}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Mini bar chart per day */}
                    {salesByDay.length > 1 && (
                        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-100 dark:border-slate-800 shadow-sm mt-4">
                            <h3 className="text-xs font-bold text-slate-400 uppercase mb-3 flex items-center gap-1">
                                <Calendar size={12} /> Ventas por Día
                            </h3>
                            <div className="flex items-end gap-1 h-24">
                                {salesByDay.map((day) => {
                                    const pct = (day.total / maxDayTotal) * 100;
                                    const dayLabel = new Intl.DateTimeFormat('es-CO', {
                                        timeZone: range?.timezone,
                                        day: 'numeric',
                                        month: 'short',
                                    }).format(new Date(`${day.date}T12:00:00.000Z`));
                                    return (
                                        <div key={day.date} className="flex-1 flex flex-col items-center gap-0.5">
                                            <span className="text-[8px] font-bold text-slate-400">{formatCop(day.total)}</span>
                                            <div className="w-full flex justify-center">
                                                <div
                                                    className="w-full max-w-[24px] rounded-t-md bg-gradient-to-t from-indigo-500 to-indigo-400 transition-all duration-500"
                                                    style={{ height: `${Math.max(pct, 6)}%`, minHeight: '3px' }}
                                                />
                                            </div>
                                            <span className="text-[8px] text-slate-400 font-medium leading-none">{dayLabel}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Payment Breakdown */}
                    <PaymentBreakdownCard
                        paymentBreakdown={paymentBreakdown}
                        totalBs={totalBs}
                        bcvRate={bcvRate}
                        tasaCop={tasaCop}
                        copEnabled={copEnabled}
                    />

                    {/* Propinas del Personal */}
                    {tipsBreakdown.total > 0 && (
                        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-100 dark:border-slate-800 shadow-sm">
                            <h3 className="text-xs font-bold text-slate-400 uppercase mb-3 flex items-center gap-1.5">
                                <TrendingUp size={14} className="text-indigo-500" /> Propinas por Personal
                            </h3>
                            <div className="space-y-4">
                                {tipsBreakdown.users.map((d) => {
                                    const pct = tipsBreakdown.total > 0 ? (d.total / tipsBreakdown.total) * 100 : 0;
                                    return (
                                        <div key={d.name}>
                                            <div className="flex justify-between text-sm mb-1">
                                                <span className="text-slate-600 dark:text-slate-350 font-medium">{d.name}</span>
                                                <span className="font-bold text-slate-700 dark:text-white font-mono">{formatCop(d.total)}</span>
                                            </div>
                                            <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                                <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                                            </div>
                                        </div>
                                    );
                                })}
                                <div className="border-t border-slate-100 dark:border-slate-800 pt-3 flex items-center justify-between font-black text-sm text-indigo-650 dark:text-indigo-450">
                                    <span>Total Propinas</span>
                                    <span className="font-mono">{formatCop(tipsBreakdown.total)}</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Top Products */}
                    {topProducts.length > 0 && (
                        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-100 dark:border-slate-800 shadow-sm">
                            <h3 className="text-xs font-bold text-slate-400 uppercase mb-3 flex items-center gap-1">
                                <TrendingUp size={12} /> Top Productos
                            </h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                                {topProducts.map((p, i) => (
                                    <div key={p.productId || p.name} className="flex items-center gap-3 bg-slate-50 dark:bg-slate-800 rounded-xl p-2.5">
                                        <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black ${i < 3 ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400' : 'bg-slate-100 dark:bg-slate-700 text-slate-400'}`}>{i + 1}</span>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">{p.name}</p>
                                            <p className="text-[10px] text-slate-400">{p.qty} vendidos</p>
                                        </div>
                                        <span className="text-xs font-black text-indigo-600 dark:text-indigo-400">{formatCop(p.revenue)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}


                    {/* Empty state */}
                    {salesForStats.length === 0 && salesForCashFlow.length === 0 && (
                        <div className="mt-8">
                            <EmptyState
                                icon={BarChart3}
                                title="Sin ventas en este periodo"
                                description="Selecciona otro rango de fechas o usa el boton Personalizado para buscar mas atras."
                            />
                        </div>
                    )}
                </>
            ) : activeTab === 'articles' ? (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-3">
                    {/* Summary strip */}
                    <div className="flex items-center gap-3 bg-white dark:bg-slate-900 rounded-2xl px-4 py-3 border border-slate-100 dark:border-slate-800 shadow-sm">
                        <div className="w-8 h-8 bg-amber-100 dark:bg-amber-900/30 rounded-lg flex items-center justify-center">
                            <ListOrdered size={16} className="text-amber-600 dark:text-amber-400" />
                        </div>
                        <div className="flex-1">
                            <p className="text-xs font-bold text-slate-700 dark:text-white">Venta por Artículos</p>
                            <p className="text-[10px] text-slate-400">{allProductsSold.length} producto{allProductsSold.length !== 1 ? 's' : ''} vendidos en este periodo</p>
                        </div>
                        <div className="text-right">
                            <p className="text-sm font-black text-slate-800 dark:text-white">{Number(allProductsSold.reduce((a, p) => a + p.qty, 0).toFixed(2))} uds/kg</p>
                            <p className="text-[10px] font-bold text-indigo-500">{formatCop(allProductsSold.reduce((a, p) => a + p.revenue, 0))}</p>
                        </div>
                    </div>

                    {/* Search + Sort */}
                    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 p-3 space-y-2">
                        <div className="relative">
                            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="text"
                                value={articleSearch}
                                onChange={e => setArticleSearch(e.target.value)}
                                placeholder="Buscar producto..."
                                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg py-2 pl-9 pr-8 text-xs font-medium text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/30 transition-all"
                            />
                            {articleSearch && (
                                <button onClick={() => setArticleSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                                    <X size={14} />
                                </button>
                            )}
                        </div>
                        <div className="flex items-center gap-1.5">
                            {[{ id: 'qty', label: 'Más vendidos' }, { id: 'revenue', label: 'Mayor ingreso' }, { id: 'name', label: 'A-Z' }].map(s => (
                                <button
                                    key={s.id}
                                    onClick={() => setArticleSort(s.id)}
                                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${articleSort === s.id
                                        ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 shadow-sm'
                                        : 'bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-slate-600'}`}
                                >{s.label}</button>
                            ))}
                        </div>
                    </div>

                    {/* Product List */}
                    {allProductsSold.length > 0 ? (
                        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden">
                            {/* Header */}
                            <div className="grid grid-cols-[1fr_80px_80px] gap-2 px-4 py-2 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
                                <span className="text-[10px] font-bold text-slate-400 uppercase">Producto</span>
                                <span className="text-[10px] font-bold text-slate-400 uppercase text-right">Cant.</span>
                                <span className="text-[10px] font-bold text-slate-400 uppercase text-right">Ingreso</span>
                            </div>
                            {/* Rows */}
                            {allProductsSold.map((p, i) => (
                                <div
                                    key={p.productId || p.name}
                                    className={`grid grid-cols-[1fr_80px_80px] gap-2 px-4 py-2.5 items-center ${i % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-slate-50/50 dark:bg-slate-800/20'} ${i < allProductsSold.length - 1 ? 'border-b border-slate-50 dark:border-slate-800/50' : ''}`}
                                >
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <span className={`w-5 h-5 rounded-md flex items-center justify-center text-[9px] font-black shrink-0 ${i < 3 ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400' : 'bg-slate-100 dark:bg-slate-700 text-slate-400'}`}>{i + 1}</span>
                                        <p className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">{p.name}</p>
                                    </div>
                                    <p className="text-xs font-black text-slate-700 dark:text-white text-right">
                                        {p.isWeight ? p.qty.toFixed(2) + ' kg' : p.qty}
                                    </p>
                                    <p className="text-xs font-black text-indigo-600 dark:text-indigo-400 text-right">{formatCop(p.revenue)}</p>
                                </div>
                            ))}
                            {/* Footer totals */}
                            <div className="grid grid-cols-[1fr_80px_80px] gap-2 px-4 py-2.5 bg-indigo-50 dark:bg-indigo-900/20 border-t border-indigo-100 dark:border-indigo-800/30">
                                <span className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase">Total</span>
                                <span className="text-xs font-black text-indigo-600 dark:text-indigo-400 text-right">{Number(allProductsSold.reduce((a, p) => a + p.qty, 0).toFixed(2))}</span>
                                <span className="text-xs font-black text-indigo-600 dark:text-indigo-400 text-right">{formatCop(allProductsSold.reduce((a, p) => a + p.revenue, 0))}</span>
                            </div>
                        </div>
                    ) : (
                        <div className="mt-8">
                            <EmptyState
                                icon={ListOrdered}
                                title={articleSearch ? 'Sin resultados' : 'Sin ventas en este periodo'}
                                description={articleSearch ? 'No se encontraron productos con ese nombre.' : 'Selecciona otro rango de fechas para ver artículos vendidos.'}
                            />
                        </div>
                    )}
                </div>
            ) : activeTab === 'sales' ? (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-3">
                    {/* Header + Descargar PDF */}
                    <div className="flex items-center gap-3 bg-white dark:bg-slate-900 rounded-2xl px-4 py-3 border border-slate-100 dark:border-slate-800 shadow-sm">
                        <div className="w-8 h-8 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg flex items-center justify-center">
                            <Clock size={16} className="text-indigo-600 dark:text-indigo-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-slate-700 dark:text-white">Historial de Ventas</p>
                            <p className="text-[10px] text-slate-400">{historySales.length} {historySales.length === 1 ? 'venta' : 'ventas'} en este periodo</p>
                        </div>
                        <button
                            onClick={() => {
                                triggerHaptic && triggerHaptic();
                                if (searchedSales.length === 0) return;
                                const rangeLabel = getReportRangeLabel(range);
                                const filterLabel = { all: 'Todas', completed: 'Completadas', voided: 'Anuladas' }[historyFilter] || 'Todas';
                                generateSalesReportPDF(searchedSales, {
                                    rangeLabel,
                                    search: historySearch,
                                    filterLabel,
                                    userName: selectedUserLabel,
                                    commission: userFilter !== 'all' ? selectedUserCommission : null,
                                });
                            }}
                            disabled={searchedSales.length === 0}
                            className="shrink-0 flex items-center gap-1.5 px-3 py-2 bg-indigo-500 text-white text-xs font-bold rounded-xl shadow-sm shadow-indigo-500/30 active:scale-95 transition-all disabled:opacity-40 disabled:active:scale-100"
                        >
                            <Download size={14} /> PDF
                        </button>
                    </div>

                    {/* Search + Filter Bar */}
                    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 p-3 space-y-2">
                        <div className="relative">
                            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="text"
                                value={historySearch}
                                onChange={e => { setHistorySearch(e.target.value); setCurrentPage(1); }}
                                placeholder="Buscar por N° factura, mesa, cliente, usuario o producto..."
                                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg py-2 pl-9 pr-8 text-xs font-medium text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/30 transition-all"
                            />
                            {historySearch && (
                                <button onClick={() => setHistorySearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                                    <X size={14} />
                                </button>
                            )}
                        </div>
                        <div className="flex items-center flex-wrap gap-1.5">
                            {[{ id: 'all', label: 'Todas' }, { id: 'completed', label: 'Completadas' }, { id: 'voided', label: 'Anuladas' }].map(f => (
                                <button
                                    key={f.id}
                                    onClick={() => { setHistoryFilter(f.id); setCurrentPage(1); }}
                                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${historyFilter === f.id
                                        ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 shadow-sm'
                                        : 'bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-slate-600'}`}
                                >{f.label}</button>
                            ))}
                            <div className="flex-1 min-w-0" />
                            {isAdmin && voidedInList.length > 0 && (
                                <button
                                    onClick={() => setPurgeTargetIds(voidedInList.map(sale => sale.id))}
                                    className="px-2.5 py-1 bg-red-500 hover:bg-red-600 text-white text-[10px] font-bold rounded-lg flex items-center gap-1 transition-all shadow-sm active:scale-95 shrink-0"
                                    title="Eliminar únicamente las ventas anuladas visibles con estos filtros"
                                >
                                    <Trash2 size={12} /> Purgar {voidedInList.length} anulada{voidedInList.length !== 1 ? 's' : ''}
                                </button>
                            )}
                            <span className="text-[10px] font-bold text-slate-400 shrink-0">{searchedSales.length} resultado{searchedSales.length !== 1 ? 's' : ''}</span>
                        </div>

                        {/* Filtro por usuario */}
                        <div className="flex items-center gap-2 w-full sm:w-auto">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0">Usuario</span>
                            <div className="flex-1 sm:w-64 sm:flex-none">
                                <CustomSelect
                                    value={userFilter}
                                    onChange={e => { setUserFilter(e.target.value); setCurrentPage(1); }}
                                    className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg py-2 px-3 text-xs font-bold text-slate-700 dark:text-white"
                                >
                                    <option value="all">Todos los usuarios</option>
                                    {usersInPeriod.map(user => (
                                        <option key={user.key} value={user.key}>{user.label}</option>
                                    ))}
                                </CustomSelect>
                            </div>
                        </div>
                    </div>

                    {/* Mini Summary Strip */}
                    {searchedSales.length > 0 && (
                        <div className="flex items-center flex-wrap gap-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl px-3 py-2 text-[10px] font-bold text-slate-500">
                            <span className="flex items-center gap-1"><DollarSign size={12} className="text-emerald-500" /> {formatCop(sumUsd)}</span>
                            <span className="w-px h-3 bg-slate-300 dark:bg-slate-700" />
                            <span>{completedInList.length} venta{completedInList.length !== 1 ? 's' : ''}</span>
                            {voidedInList.length > 0 && (
                                <><span className="w-px h-3 bg-slate-300 dark:bg-slate-700" /><span className="text-red-400">{voidedInList.length} anulada{voidedInList.length !== 1 ? 's' : ''}</span></>
                            )}
                            {userFilter !== 'all' && selectedUserCommission > 0 && (
                                <><span className="w-px h-3 bg-slate-300 dark:bg-slate-700" /><span className="text-amber-500">Comisiones: {formatCop(selectedUserCommission)}</span></>
                            )}
                        </div>
                    )}

                    {/* Transaction Rows (paginadas) */}
                    {(() => {
                        const totalPages = Math.max(1, Math.ceil(searchedSales.length / PAGE_SIZE));
                        const page = Math.min(currentPage, totalPages);
                        const start = (page - 1) * PAGE_SIZE;
                        const pageSales = searchedSales.slice(start, start + PAGE_SIZE);
                        return (
                            <>
                                {pageSales.map(s => (
                                    <TransactionRow
                                        key={s.id}
                                        sale={s}
                                        bcvRate={bcvRate}
                                        isExpanded={expandedSaleId === s.id}
                                        onToggle={() => setExpandedSaleId(prev => prev === s.id ? null : s.id)}
                                        onVoidSale={setVoidSaleTarget}
                                        onRecycleSale={setRecycleOffer}
                                        onDownloadPDF={(sale) => generateTicketPDF(sale, bcvRate)}
                                        onPrintTicket={(sale) => printThermalTicket(sale, bcvRate)}
                                    />
                                ))}

                                {searchedSales.length === 0 && (
                                    <div className="mt-8">
                                        <EmptyState
                                            icon={Search}
                                            title={historySearch ? 'Sin resultados' : 'Sin ventas en este periodo'}
                                            description={historySearch ? 'No se encontraron ventas con ese criterio.' : 'Selecciona otro rango de fechas para ver el historial.'}
                                        />
                                    </div>
                                )}

                                {totalPages > 1 && (
                                    <div className="flex items-center justify-between gap-2 pt-1">
                                        <button
                                            onClick={() => { triggerHaptic && triggerHaptic(); setCurrentPage(p => Math.max(1, p - 1)); }}
                                            disabled={page <= 1}
                                            className="flex items-center gap-1 px-3 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl active:scale-95 transition-all disabled:opacity-40 disabled:active:scale-100"
                                        >
                                            <ChevronLeft size={14} /> Anterior
                                        </button>
                                        <span className="text-[11px] font-bold text-slate-500">
                                            Página {page} de {totalPages}
                                            <span className="text-slate-400 font-medium"> · {searchedSales.length} ventas</span>
                                        </span>
                                        <button
                                            onClick={() => { triggerHaptic && triggerHaptic(); setCurrentPage(p => Math.min(totalPages, p + 1)); }}
                                            disabled={page >= totalPages}
                                            className="flex items-center gap-1 px-3 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl active:scale-95 transition-all disabled:opacity-40 disabled:active:scale-100"
                                        >
                                            Siguiente <ChevronRight size={14} />
                                        </button>
                                    </div>
                                )}
                            </>
                        );
                    })()}
                </div>
            ) : (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                    {groupedClosings.length > 0 ? (
                        groupedClosings.map(cierre => (
                            <CierreHistoryCard 
                                key={cierre.cierreId} 
                                cierre={cierre} 
                                bcvRate={bcvRate} 
                                products={products} 
                                cierreNum={cierreNumbers[cierre.cierreId] || ''}
                                isAdmin={isAdmin}
                                onDeleteCierre={(cId) => setCierreToDelete(cId)}
                            />
                        ))
                    ) : (
                        <div className="mt-8">
                            <EmptyState
                                icon={LockIcon}
                                title="Sin cierres de caja registrados"
                                description="No se encontraron operaciones de cierre en el rango de fechas seleccionado."
                            />
                        </div>
                    )}
                </div>
            )}

            {/* Recycle Offer Modal */}
            {recycleOffer && (
                <div className="fixed inset-0 z-[100] bg-slate-950/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200"
                    onClick={() => setRecycleOffer(null)}>
                    <div className="bg-white dark:bg-slate-900 w-full sm:max-w-xs md:max-w-sm sm:rounded-2xl rounded-t-[2rem] p-5 shadow-2xl animate-in slide-in-from-bottom-4 duration-200"
                        onClick={e => e.stopPropagation()}>
                        <div className="flex flex-col items-center gap-2 mb-4">
                            <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center text-indigo-600">
                                <Recycle size={28} />
                            </div>
                            <h3 className="text-sm font-black text-slate-800 dark:text-white">Venta Anulada</h3>
                            <p className="text-[11px] text-slate-400 text-center">Puedes reciclar los productos de esta venta al carrito actual.</p>
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setRecycleOffer(null)}
                                className="flex-1 py-2.5 text-xs font-bold text-slate-500 bg-slate-100 dark:bg-slate-800 rounded-xl transition-all active:scale-95"
                            >Cerrar</button>
                            <button
                                onClick={() => {
                                    loadCart(recycleOffer.items);
                                    setRecycleOffer(null);
                                    if (onNavigate) onNavigate('ventas');
                                }}
                                className="flex-1 py-2.5 text-xs font-bold text-white bg-indigo-600 rounded-xl shadow-md shadow-indigo-500/20 transition-all active:scale-95 flex items-center justify-center gap-1.5"
                            ><Recycle size={16} /> Reciclar</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Confirm Void Modal */}
            <ConfirmModal
                isOpen={!!voidSaleTarget}
                onClose={() => setVoidSaleTarget(null)}
                onConfirm={confirmVoidSale}
                title={`Anular venta #${voidSaleTarget?.id?.substring(0, 6).toUpperCase() || ''}`}
                message={'Esta accion:\n- Marcara la venta como ANULADA\n- Devolvera el stock a la bodega\n- Revertira deudas o saldos a favor\n\nEsta accion no se puede deshacer.'}
                confirmText="Si, anular"
            />

            <ConfirmModal
                isOpen={Array.isArray(purgeTargetIds) && purgeTargetIds.length > 0}
                onClose={() => setPurgeTargetIds(null)}
                onConfirm={handlePurgeAnnulledInReports}
                title="Purgar ventas anuladas visibles"
                message={`Se eliminarán permanentemente ${purgeTargetIds?.length || 0} venta(s) anulada(s) que coinciden con el rango, búsqueda y filtros actuales. Las demás anuladas quedarán intactas.`}
                confirmText="Sí, purgar visibles"
                variant="danger"
            />

            {/* Custom Delete Cierre Modal with options */}
            {cierreToDelete && (
                <div className="fixed inset-0 z-[200] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
                    onClick={() => setCierreToDelete(null)}>
                    <div className="bg-white dark:bg-slate-900 rounded-[1.5rem] p-6 max-w-sm w-full shadow-2xl border border-slate-100 dark:border-slate-800 animate-in zoom-in-95 duration-200 relative"
                        onClick={e => e.stopPropagation()}>

                        {/* Close button */}
                        <button onClick={() => setCierreToDelete(null)} className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                            <X size={16} />
                        </button>

                        {/* Icon */}
                        <div className="w-14 h-14 bg-red-50 dark:bg-red-900/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                            <Trash2 size={28} className="text-red-500" />
                        </div>

                        {/* Title */}
                        <h3 className="text-lg font-black text-slate-800 dark:text-white text-center mb-2">Eliminar Cierre de Caja</h3>

                        {/* Message */}
                        <p className="text-xs text-slate-500 dark:text-slate-400 text-center leading-relaxed mb-6">
                            Elige cómo deseas proceder con este cierre de caja del historial:
                        </p>

                        {/* Actions */}
                        <div className="flex flex-col gap-2.5 w-full">
                            <button
                                onClick={async () => {
                                    const cId = cierreToDelete;
                                    setCierreToDelete(null);
                                    await handleDeleteCierre(cId, true);
                                }}
                                className="w-full py-3.5 text-xs font-black text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-lg shadow-indigo-600/20 active:scale-95 transition-all text-center"
                            >
                                Reabrir Turno y Activar Ventas
                            </button>
                            <button
                                onClick={async () => {
                                    const cId = cierreToDelete;
                                    setCierreToDelete(null);
                                    await handleDeleteCierre(cId, false);
                                }}
                                className="w-full py-3.5 text-xs font-black text-red-600 bg-red-50 hover:bg-red-100 dark:bg-red-950/20 dark:hover:bg-red-900/20 rounded-xl active:scale-95 transition-all text-center"
                            >
                                Solo Borrar Cierre (Ventas se quedan cerradas)
                            </button>
                            <button
                                onClick={() => setCierreToDelete(null)}
                                className="w-full py-3 text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors text-center"
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function StatCard({ icon: Icon, label, value, sub, color }) {
    const colors = {
        emerald: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400',
        blue: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
        indigo: 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400',
        amber: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400',
    };
    return (
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-3 md:p-4 border border-slate-100 dark:border-slate-800 shadow-sm">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${colors[color]}`}>
                <Icon size={16} />
            </div>
            <p className="text-[10px] font-bold text-slate-400 uppercase">{label}</p>
            <p className="text-lg md:text-xl font-black text-slate-800 dark:text-white mt-0.5">{value}</p>
            {sub && <p className="text-xs font-bold text-slate-400 mt-0.5">{sub}</p>}
        </div>
    );
}
