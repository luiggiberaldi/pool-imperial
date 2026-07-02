import React, { useState } from 'react';
import { ChevronDown, ChevronUp, LockIcon, Printer, DollarSign, CheckCircle2, Trash2, Download } from 'lucide-react';
import { formatCop } from '../../utils/calculatorUtils';
import { getPaymentLabel, getPaymentIcon, toTitleCase, PAYMENT_ICONS } from '../../config/paymentMethods';
import { generateDailyClosePDF } from '../../utils/dailyCloseGenerator';
import { printThermalDailyClose } from '../../utils/ticketGenerator';

export default function CierreHistoryCard({ cierre, products: _products, cierreNum, isAdmin, onDeleteCierre }) {
    const [isExpanded, setIsExpanded] = useState(false);

    const totalServicioVoluntario = React.useMemo(() => {
        let total = 0;
        const currentSales = cierre.sales || [];
        currentSales.forEach(s => {
            if (s.status === 'ANULADA') return;
            (s.items || []).forEach(item => {
                const nameLower = (item.name || '').toLowerCase();
                if (nameLower.includes('servicio voluntario')) {
                    total += (item.priceUsd || item.price || 0) * (item.qty || 1);
                }
            });
        });
        return total;
    }, [cierre]);

    const dateLabel = new Date(cierre.cierreId).toLocaleString('es-CO', { 
        weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit' 
    });

    const handlePrintPDF = (e) => {
        e.stopPropagation();
        
        const todayProductMap = {};
        const prodList = _products || [];
        const productIds = new Set(prodList.map(p => p.id));
        const productNames = new Set(prodList.map(p => p.name.toLowerCase()));

        cierre.salesForStats.forEach(s => {
            if (s.items) {
                s.items.forEach(item => {
                    const nameLower = item.name?.toLowerCase();
                    if (!productIds.has(item.id) && !productNames.has(nameLower)) return;
                    if (!todayProductMap[item.name]) todayProductMap[item.name] = { name: item.name, qty: 0, revenue: 0 };
                    todayProductMap[item.name].qty += item.qty;
                    todayProductMap[item.name].revenue += item.priceUsd * item.qty;
                });
            }
        });
        const todayTopProducts = Object.values(todayProductMap).sort((a, b) => b.qty - a.qty).slice(0, 10);

        generateDailyClosePDF({
            sales: cierre.salesForCashFlow.filter(s => s.tipo !== 'APERTURA_CAJA'),
            allSales: cierre.salesForStats,
            adjustments: cierre.adjustments || [],
            bcvRate: 0,
            paymentBreakdown: cierre.paymentBreakdown,
            topProducts: todayTopProducts,
            todayTotalUsd: cierre.totalUsd,
            todayTotalBs: 0,
            todayProfit: cierre.profit || 0,
            todayItemsSold: cierre.totalItems,
            reconData: cierre.declaredCop !== undefined ? {
                declaredCop: cierre.declaredCop || 0,
                declaredUsd: cierre.declaredUsd || 0,
                diffCop: cierre.diffCop || 0,
                diffUsd: cierre.diffUsd || 0,
                declaredOthers: cierre.declaredOthers || {}
            } : null,
            apertura: cierre.apertura,
            isReprint: true,
            totalTax: cierre.totalTax || 0,
            taxBreakdown: cierre.taxBreakdown || {},
            cierreNum: cierreNum,
        });
    };

    const handlePrintReceipt = (e) => {
        e.stopPropagation();
        
        const todayProductMap = {};
        const prodList = _products || [];
        const productIds = new Set(prodList.map(p => p.id));
        const productNames = new Set(prodList.map(p => p.name.toLowerCase()));

        cierre.salesForStats.forEach(s => {
            if (s.items) {
                s.items.forEach(item => {
                    const nameLower = (item.name || '').toLowerCase();
                    if (item.isTip || nameLower.includes('propina') || nameLower.includes('servicio voluntario') || nameLower.includes('recargo tdc')) return;
                    if (!productIds.has(item.id) && !productNames.has(nameLower)) return;
                    if (!todayProductMap[item.name]) todayProductMap[item.name] = { name: item.name, qty: 0, revenue: 0 };
                    todayProductMap[item.name].qty += item.qty;
                    todayProductMap[item.name].revenue += item.priceUsd * item.qty;
                });
            }
        });
        const todayTopProducts = Object.values(todayProductMap).sort((a, b) => b.qty - a.qty).slice(0, 10);

        printThermalDailyClose({
            sales: cierre.salesForCashFlow.filter(s => s.tipo !== 'APERTURA_CAJA'),
            allSales: cierre.salesForStats,
            adjustments: cierre.adjustments || [],
            paymentBreakdown: cierre.paymentBreakdown,
            topProducts: todayTopProducts,
            todayTotalCOP: cierre.totalUsd,
            todayProfit: cierre.profit || 0,
            todayItemsSold: cierre.totalItems,
            reconData: {
                declaredCop: cierre.declaredCop || cierre.declaredCOP || 0,
                declaredUsd: cierre.declaredUsd || cierre.declaredUSD || 0,
                diffCop: cierre.diffCop || cierre.diffCOP || 0,
                diffUsd: cierre.diffUsd || cierre.diffUSD || 0,
                declaredOthers: cierre.declaredOthers || {}
            },
            apertura: cierre.apertura,
            totalTax: cierre.totalTax || 0,
            taxBreakdown: cierre.taxBreakdown || {},
            cierreId: cierre.cierreId,
            cierreNum: cierreNum,
        });
    };

    const hasApertura = !!cierre.apertura;
    const openingCop = hasApertura ? (cierre.apertura.openingCOP || cierre.apertura.openingUsd || cierre.apertura.totalUsd || 0) : 0;
    const openingUsd = hasApertura ? (cierre.apertura.openingBs || 0) : 0;
    const formatUsd = (v) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(v || 0);

    return (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden mb-3 transition-all active:scale-[0.99] cursor-pointer" onClick={() => setIsExpanded(!isExpanded)}>
            <div className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                        <LockIcon size={20} className="text-slate-500" />
                    </div>
                    <div>
                        <p className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-2">
                             Cierre de Caja #{cierreNum}
                            <span className="text-[9px] bg-slate-100 dark:bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded uppercase font-black">{cierre.sales.length} ops</span>
                        </p>
                        <p className="text-[11px] text-slate-400 capitalize">{dateLabel}</p>
                    </div>
                </div>
                <div className="text-right flex items-center gap-3">
                    <div>
                        <p className="text-sm font-black text-emerald-600 dark:text-emerald-400">{formatCop(cierre.totalUsd)}</p>
                    </div>
                    {isExpanded ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
                </div>
            </div>

            {isExpanded && (
                <div className="px-4 pb-4 border-t border-slate-100 dark:border-slate-800/50 cursor-auto animate-in fade-in slide-in-from-top-1" onClick={e => e.stopPropagation()}>
                    
                    {hasApertura && (openingCop > 0 || openingUsd > 0) && (
                        <div className="flex justify-between items-center py-3 border-b border-slate-100 dark:border-slate-800/50">
                            <span className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1.5"><DollarSign size={14}/> Fondo de Apertura</span>
                            <span className="text-sm font-black text-slate-700 dark:text-slate-300">
                                {formatCop(openingCop)}{openingUsd > 0 ? ` + ${formatUsd(openingUsd)}` : ''}
                            </span>
                        </div>
                    )}

                    {totalServicioVoluntario > 0 && (
                        <div className="flex justify-between items-center py-3 border-b border-slate-100 dark:border-slate-800/50">
                            <span className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1.5"><DollarSign size={14}/> Servicio Voluntario</span>
                            <span className="text-sm font-black text-slate-700 dark:text-slate-300">
                                {formatCop(totalServicioVoluntario)}
                            </span>
                        </div>
                    )}

                    <div className="py-3 space-y-2">
                        <p className="text-[10px] font-bold uppercase text-slate-400 tracking-wider mb-2">Desglose de Ingresos</p>
                        {Object.keys(cierre.paymentBreakdown).length === 0 && (
                            <p className="text-xs text-slate-400">Sin movimientos</p>
                        )}
                        {Object.entries(cierre.paymentBreakdown).map(([method, data]) => {
                            const PayIcon = getPaymentIcon(method) || PAYMENT_ICONS[method] || CheckCircle2;
                            const label = toTitleCase(getPaymentLabel(method, data.label));
                            return (
                                <div key={method} className="flex justify-between items-center text-xs">
                                    <span className="text-slate-600 dark:text-slate-350 flex items-center gap-1.5">
                                        <PayIcon size={12} className="text-slate-400" /> {label}
                                    </span>
                                    <span className="font-bold text-slate-700 dark:text-slate-200">{formatCop(data.total)}</span>
                                </div>
                            );
                        })}
                    </div>

                    {cierre.declaredCop !== undefined && (
                        <div className="py-3 mt-2 border-t border-slate-100 dark:border-slate-800/50 space-y-2">
                            <p className="text-[10px] font-bold uppercase text-slate-400 tracking-wider mb-2">Cuadre / Reconciliación</p>
                            <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-850 rounded-xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-800/50 text-xs">
                                <div className="grid grid-cols-4 gap-1 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 text-[10px] font-bold text-slate-500 text-right">
                                    <span className="text-left">Método</span>
                                    <span>Esperado</span>
                                    <span>Declarado</span>
                                    <span>Dif.</span>
                                </div>
                                <div className="grid grid-cols-4 gap-1 px-3 py-2 text-right items-center">
                                    <span className="text-left font-semibold text-slate-600 dark:text-slate-300">COP (Efe.)</span>
                                    <span className="font-mono text-slate-500">{formatCop(openingCop + (cierre.paymentBreakdown['efectivo']?.total || 0) + (cierre.paymentBreakdown['efectivo_cop']?.total || 0) + (cierre.paymentBreakdown['_vuelto_cop']?.total || 0))}</span>
                                    <span className="font-mono text-slate-700 dark:text-white font-bold">{formatCop(cierre.declaredCop)}</span>
                                    <span className={`font-mono font-black ${cierre.diffCop >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{cierre.diffCop >= 0 ? '+' : ''}{formatCop(cierre.diffCop)}</span>
                                </div>
                                {(openingUsd > 0 || (cierre.paymentBreakdown['efectivo_usd']?.total || 0) > 0 || cierre.declaredUsd > 0) && (
                                    <div className="grid grid-cols-4 gap-1 px-3 py-2 text-right items-center">
                                        <span className="text-left font-semibold text-slate-600 dark:text-slate-300">USD (Efe.)</span>
                                        <span className="font-mono text-slate-500">{formatUsd(openingUsd + (cierre.paymentBreakdown['efectivo_usd']?.total || 0))}</span>
                                        <span className="font-mono text-slate-700 dark:text-white font-bold">{formatUsd(cierre.declaredUsd)}</span>
                                        <span className={`font-mono font-black ${cierre.diffUsd >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{cierre.diffUsd >= 0 ? '+' : ''}{formatUsd(cierre.diffUsd)}</span>
                                    </div>
                                )}
                                {Object.entries(cierre.paymentBreakdown || {}).filter(([m, d]) => {
                                    return d.total > 0 && !['efectivo', 'efectivo_cop', 'efectivo_usd', '_vuelto_cop', 'vuelto_cop', 'vuelto_usd'].includes(m) && !d.currency?.startsWith('VUELTO');
                                }).map(([method, data]) => {
                                    const expected = data.total;
                                    const declared = parseFloat(cierre.declaredOthers?.[method]) || 0;
                                    const diff = declared - expected;
                                    const isUsd = data.currency === 'USD';
                                    return (
                                        <div key={method} className="grid grid-cols-4 gap-1 px-3 py-2 text-right items-center">
                                            <span className="text-left font-semibold text-slate-600 dark:text-slate-300 truncate">{toTitleCase(getPaymentLabel(method, data.label))}</span>
                                            <span className="font-mono text-slate-500">{isUsd ? formatUsd(expected) : formatCop(expected)}</span>
                                            <span className="font-mono text-slate-700 dark:text-white font-bold">{isUsd ? formatUsd(declared) : formatCop(declared)}</span>
                                            <span className={`font-mono font-black ${diff >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{diff >= 0 ? '+' : ''}{isUsd ? formatUsd(diff) : formatCop(diff)}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    <div className="pt-3 mt-1 flex gap-2">
                        <button 
                            onClick={handlePrintReceipt}
                            className="flex-1 py-2.5 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors active:scale-95"
                        >
                            <Printer size={16} /> Re-imprimir Ticket
                        </button>
                        <button 
                            onClick={handlePrintPDF}
                            className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors active:scale-95"
                        >
                            <Download size={16} /> Descargar PDF
                        </button>
                        {isAdmin && onDeleteCierre && (
                            <button 
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onDeleteCierre(cierre.cierreId);
                                }}
                                className="py-2.5 px-4 bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-450 hover:bg-rose-100 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors active:scale-95"
                                title="Eliminar / Reabrir Cierre"
                            >
                                <Trash2 size={16} />
                                <span>Eliminar</span>
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
