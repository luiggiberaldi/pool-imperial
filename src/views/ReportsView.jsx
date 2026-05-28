import { useState, useMemo } from 'react';
import { BarChart3, Calendar, Download, TrendingUp, ShoppingBag, DollarSign, Package, ChevronDown, ChevronUp, Clock, Recycle, Search, X, LockIcon, ListOrdered } from 'lucide-react';
import { formatBs } from '../utils/calculatorUtils';
import { generateDailyClosePDF as _generateDailyClosePDF } from '../utils/dailyCloseGenerator';
import { generateTicketPDF, printThermalTicket } from '../utils/ticketGenerator';
import { useProductContext } from '../context/ProductContext';
import { useCart } from '../context/CartContext';
import EmptyState from '../components/EmptyState';
import ConfirmModal from '../components/ConfirmModal';
import { processVoidSale } from '../utils/voidSaleProcessor';
import CierreHistoryCard from '../components/Reports/CierreHistoryCard';
import TransactionRow from '../components/Reports/TransactionRow';
import PaymentBreakdownCard from '../components/Reports/PaymentBreakdownCard';
import { useReportsData } from '../hooks/useReportsData';

const RANGE_OPTIONS = [
    { id: 'today', label: 'Hoy' },
    { id: 'week', label: 'Esta Semana' },
    { id: 'month', label: 'Este Mes' },
    { id: 'lastMonth', label: 'Mes Anterior' },
    { id: 'custom', label: 'Personalizado' },
];

export default function ReportsView({ rates: _rates, triggerHaptic, onNavigate, isActive }) {
    const { products, setProducts, effectiveRate: bcvRate, copEnabled, tasaCop } = useProductContext();
    const { loadCart } = useCart();
    const [activeTab, setActiveTab] = useState('metrics');
    const [selectedRange, setSelectedRange] = useState('week');
    const [customFrom, setCustomFrom] = useState('');
    const [customTo, setCustomTo] = useState('');
    const [showHistory, setShowHistory] = useState(false);
    const [expandedSaleId, setExpandedSaleId] = useState(null);
    const [visibleCount, setVisibleCount] = useState(30);
    const [historySearch, setHistorySearch] = useState('');
    const [historyFilter, setHistoryFilter] = useState('all');
    const [voidSaleTarget, setVoidSaleTarget] = useState(null);
    const [recycleOffer, setRecycleOffer] = useState(null);
    const [articleSearch, setArticleSearch] = useState('');
    const [articleSort, setArticleSort] = useState('qty'); // 'qty' | 'revenue' | 'name'

    const {
        allSales, setAllSales, isLoading,
        salesForStats, salesForCashFlow, historySales,
        totalUsd, totalBs, totalItems, profit,
        paymentBreakdown, topProducts, salesByDay,
        groupedClosings, maxDayTotal,
    } = useReportsData({ isActive, products, bcvRate, selectedRange, customFrom, customTo, activeTab });

    // ── Aggregated product sales for "Por Artículo" tab ──
    const allProductsSold = useMemo(() => {
        const map = {};
        salesForStats.forEach(s => {
            s.items?.forEach(item => {
                const key = item.name;
                if (!map[key]) map[key] = { name: item.name, qty: 0, revenue: 0, isWeight: !!item.isWeight };
                map[key].qty += item.qty;
                map[key].revenue += item.priceUsd * item.qty;
            });
        });
        let list = Object.values(map);
        // Filter by search
        if (articleSearch.trim()) {
            const q = articleSearch.toLowerCase();
            list = list.filter(p => p.name.toLowerCase().includes(q));
        }
        // Sort
        if (articleSort === 'qty') list.sort((a, b) => b.qty - a.qty);
        else if (articleSort === 'revenue') list.sort((a, b) => b.revenue - a.revenue);
        else list.sort((a, b) => a.name.localeCompare(b.name));
        return list;
    }, [salesForStats, articleSearch, articleSort]);

    const confirmVoidSale = async () => {
        const sale = voidSaleTarget;
        if (!sale) return;
        setVoidSaleTarget(null);
        try {
            const { updatedSales, updatedProducts } = await processVoidSale(sale, allSales, products);
            setProducts(updatedProducts);
            setAllSales(updatedSales);
            setRecycleOffer(sale);
        } catch (error) {
            console.error('Error anulando venta:', error);
        }
    };

    const handleExportPDF = async () => {
        triggerHaptic && triggerHaptic();
        try {
            const { generateDailyClosePDF } = await import('../utils/dailyCloseGenerator');
            await generateDailyClosePDF({
                sales: salesForCashFlow,
                allSales: salesForStats,
                bcvRate,
                paymentBreakdown,
                topProducts,
                todayTotalUsd: totalUsd,
                todayTotalBs: totalBs,
                todayProfit: profit,
                todayItemsSold: totalItems,
            });
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
        if (!historySearch.trim()) return true;
        const q = historySearch.toLowerCase();
        if ((s.customerName || 'consumidor final').toLowerCase().includes(q)) return true;
        if (s.items && s.items.some(i => i.name.toLowerCase().includes(q))) return true;
        if (s.id.toLowerCase().includes(q)) return true;
        // Búsqueda por número de factura (ej: "73", "#73", "0000073")
        if (s.saleNumber !== undefined && String(s.saleNumber).includes(q.replace('#', ''))) return true;
        if (s.saleNumber !== undefined && String(s.saleNumber).padStart(7, '0').includes(q.replace('#', ''))) return true;
        // Búsqueda por nombre de mesa
        if (s.tableName && s.tableName.toLowerCase().includes(q)) return true;
        return false;
    }), [historySales, historyFilter, historySearch]);

    const completedInList = searchedSales.filter(s => s.status !== 'ANULADA');
    const voidedInList = searchedSales.filter(s => s.status === 'ANULADA');
    const sumUsd = completedInList.reduce((a, s) => a + (s.totalUsd || 0), 0);

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
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 space-y-4 md:space-y-5 pb-32">
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
                    disabled={salesForStats.length === 0 && salesForCashFlow.length === 0}
                    className="flex items-center gap-2 px-4 py-2.5 bg-indigo-500 hover:bg-indigo-600 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white font-bold rounded-xl text-sm shadow-md shadow-indigo-500/20 active:scale-95 transition-all"
                >
                    <Download size={16} /> Descargar PDF
                </button>
            </div>

            {/* Tab Selector */}
            <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                <button
                    onClick={() => { triggerHaptic && triggerHaptic(); setActiveTab('metrics'); }}
                    className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === 'metrics' ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'}`}
                >
                    <BarChart3 size={16} className="inline mr-1.5 align-text-bottom"/> Métricas
                </button>
                <button
                    onClick={() => { triggerHaptic && triggerHaptic(); setActiveTab('articles'); setArticleSearch(''); }}
                    className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === 'articles' ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'}`}
                >
                    <ListOrdered size={16} className="inline mr-1.5 align-text-bottom"/> Por Artículo
                </button>
                <button
                    onClick={() => { triggerHaptic && triggerHaptic(); setActiveTab('history'); }}
                    className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === 'history' ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'}`}
                >
                    <LockIcon size={16} className="inline mr-1.5 align-text-bottom"/> Cierres
                </button>
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
                        <StatCard icon={DollarSign} label="Ingresos" value={`$${totalUsd.toFixed(2)}`} sub={`${formatBs(totalBs)} Bs`} color="blue" />
                        <StatCard icon={TrendingUp} label="Ganancia" value={bcvRate > 0 ? `$${(profit / bcvRate).toFixed(2)}` : '$0.00'} sub={`${formatBs(profit)} Bs`} color="indigo" />
                        <StatCard icon={Package} label="Artículos" value={totalItems} color="amber" />
                    </div>

                    {/* Mini bar chart per day */}
                    {salesByDay.length > 1 && (
                        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-100 dark:border-slate-800 shadow-sm mt-4">
                            <h3 className="text-xs font-bold text-slate-400 uppercase mb-3 flex items-center gap-1">
                                <Calendar size={12} /> Ventas por Día
                            </h3>
                            <div className="flex items-end gap-1 h-24">
                                {salesByDay.map((day) => {
                                    const pct = (day.total / maxDayTotal) * 100;
                                    const dayLabel = new Date(day.date + 'T12:00:00').toLocaleDateString('es-VE', { day: 'numeric', month: 'short' });
                                    return (
                                        <div key={day.date} className="flex-1 flex flex-col items-center gap-0.5">
                                            <span className="text-[8px] font-bold text-slate-400">${day.total.toFixed(0)}</span>
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

                    {/* Top Products */}
                    {topProducts.length > 0 && (
                        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-100 dark:border-slate-800 shadow-sm">
                            <h3 className="text-xs font-bold text-slate-400 uppercase mb-3 flex items-center gap-1">
                                <TrendingUp size={12} /> Top Productos
                            </h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                                {topProducts.map((p, i) => (
                                    <div key={p.name} className="flex items-center gap-3 bg-slate-50 dark:bg-slate-800 rounded-xl p-2.5">
                                        <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black ${i < 3 ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400' : 'bg-slate-100 dark:bg-slate-700 text-slate-400'}`}>{i + 1}</span>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">{p.name}</p>
                                            <p className="text-[10px] text-slate-400">{p.qty} vendidos</p>
                                        </div>
                                        <span className="text-xs font-black text-indigo-600 dark:text-indigo-400">${p.revenue.toFixed(2)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Transaction List */}
                    {historySales.length > 0 && (
                        <div className="mt-2">
                            <button
                                onClick={() => { triggerHaptic && triggerHaptic(); setShowHistory(h => !h); setVisibleCount(30); setHistorySearch(''); setHistoryFilter('all'); }}
                                className="w-full flex items-center justify-between bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-100 dark:border-slate-800 shadow-sm active:scale-[0.99] transition-all"
                            >
                                <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg flex items-center justify-center">
                                        <Clock size={16} className="text-indigo-600 dark:text-indigo-400" />
                                    </div>
                                    <div className="text-left">
                                        <p className="text-xs font-bold text-slate-700 dark:text-white">Historial de Ventas</p>
                                        <p className="text-[10px] text-slate-400">{historySales.length} {historySales.length === 1 ? 'venta' : 'ventas'} en este periodo</p>
                                    </div>
                                </div>
                                {showHistory ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
                            </button>

                            {showHistory && (
                                <div className="mt-3 space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
                                    {/* Search + Filter Bar */}
                                    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 p-3 space-y-2">
                                        <div className="relative">
                                            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                            <input
                                                type="text"
                                                value={historySearch}
                                                onChange={e => { setHistorySearch(e.target.value); setVisibleCount(30); }}
                                                placeholder="Buscar por N° factura, mesa, cliente o producto..."
                                                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg py-2 pl-9 pr-8 text-xs font-medium text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/30 transition-all"
                                            />
                                            {historySearch && (
                                                <button onClick={() => setHistorySearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                                                    <X size={14} />
                                                </button>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            {[{ id: 'all', label: 'Todas' }, { id: 'completed', label: 'Completadas' }, { id: 'voided', label: 'Anuladas' }].map(f => (
                                                <button
                                                    key={f.id}
                                                    onClick={() => { setHistoryFilter(f.id); setVisibleCount(30); }}
                                                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${historyFilter === f.id
                                                        ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 shadow-sm'
                                                        : 'bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-slate-600'}`}
                                                >{f.label}</button>
                                            ))}
                                            <div className="flex-1" />
                                            <span className="text-[10px] font-bold text-slate-400">{searchedSales.length} resultado{searchedSales.length !== 1 ? 's' : ''}</span>
                                        </div>
                                    </div>

                                    {/* Mini Summary Strip */}
                                    {searchedSales.length > 0 && (
                                        <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl px-3 py-2 text-[10px] font-bold text-slate-500">
                                            <span className="flex items-center gap-1"><DollarSign size={12} className="text-emerald-500" /> ${sumUsd.toFixed(2)}</span>
                                            <span className="w-px h-3 bg-slate-300 dark:bg-slate-700" />
                                            <span>{completedInList.length} venta{completedInList.length !== 1 ? 's' : ''}</span>
                                            {voidedInList.length > 0 && (
                                                <><span className="w-px h-3 bg-slate-300 dark:bg-slate-700" /><span className="text-red-400">{voidedInList.length} anulada{voidedInList.length !== 1 ? 's' : ''}</span></>
                                            )}
                                        </div>
                                    )}

                                    {/* Transaction Rows */}
                                    {searchedSales.slice(0, visibleCount).map(s => (
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
                                        <div className="text-center py-6">
                                            <Search size={24} className="text-slate-300 mx-auto mb-2" />
                                            <p className="text-xs font-bold text-slate-400">Sin resultados para esta busqueda</p>
                                        </div>
                                    )}

                                    {visibleCount < searchedSales.length && (
                                        <button
                                            onClick={() => setVisibleCount(c => c + 30)}
                                            className="w-full py-3 text-xs font-bold text-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl hover:bg-indigo-100 dark:hover:bg-indigo-900/30 transition-colors active:scale-[0.98]"
                                        >
                                            Mostrar mas ({searchedSales.length - visibleCount} restantes)
                                        </button>
                                    )}
                                </div>
                            )}
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
                            <p className="text-sm font-black text-slate-800 dark:text-white">{allProductsSold.reduce((a, p) => a + p.qty, 0).toFixed(0)} uds</p>
                            <p className="text-[10px] font-bold text-indigo-500">${allProductsSold.reduce((a, p) => a + p.revenue, 0).toFixed(2)}</p>
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
                                    key={p.name}
                                    className={`grid grid-cols-[1fr_80px_80px] gap-2 px-4 py-2.5 items-center ${i % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-slate-50/50 dark:bg-slate-800/20'} ${i < allProductsSold.length - 1 ? 'border-b border-slate-50 dark:border-slate-800/50' : ''}`}
                                >
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <span className={`w-5 h-5 rounded-md flex items-center justify-center text-[9px] font-black shrink-0 ${i < 3 ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400' : 'bg-slate-100 dark:bg-slate-700 text-slate-400'}`}>{i + 1}</span>
                                        <p className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">{p.name}</p>
                                    </div>
                                    <p className="text-xs font-black text-slate-700 dark:text-white text-right">
                                        {p.isWeight ? p.qty.toFixed(2) + ' kg' : p.qty}
                                    </p>
                                    <p className="text-xs font-black text-indigo-600 dark:text-indigo-400 text-right">${p.revenue.toFixed(2)}</p>
                                </div>
                            ))}
                            {/* Footer totals */}
                            <div className="grid grid-cols-[1fr_80px_80px] gap-2 px-4 py-2.5 bg-indigo-50 dark:bg-indigo-900/20 border-t border-indigo-100 dark:border-indigo-800/30">
                                <span className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase">Total</span>
                                <span className="text-xs font-black text-indigo-600 dark:text-indigo-400 text-right">{allProductsSold.reduce((a, p) => a + p.qty, 0).toFixed(0)}</span>
                                <span className="text-xs font-black text-indigo-600 dark:text-indigo-400 text-right">${allProductsSold.reduce((a, p) => a + p.revenue, 0).toFixed(2)}</span>
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
            ) : (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                    {groupedClosings.length > 0 ? (
                        groupedClosings.map(cierre => (
                            <CierreHistoryCard key={cierre.cierreId} cierre={cierre} bcvRate={bcvRate} products={products} />
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
