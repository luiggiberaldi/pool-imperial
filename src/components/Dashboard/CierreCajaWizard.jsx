import React, { useState, useMemo } from 'react';
import { X, CheckCircle2, AlertTriangle, TrendingUp, ShoppingBag, Package, ArrowRight, Coins, Wallet, Printer, Download } from 'lucide-react';
import { getPaymentLabel, getPaymentIcon, toTitleCase } from '../../config/paymentMethods';
import { round2 } from '../../utils/dinero';
import { printThermalDailyClose } from '../../utils/ticketGenerator';
import { generateDailyClosePDF } from '../../utils/dailyCloseGenerator';
import { computeIncomeBreakdown, isNonProductSaleItem } from '../../utils/calculatorUtils';

export default function CierreCajaWizard({
    isOpen,
    onClose,
    onConfirm,
    // Data from DashboardView
    todaySales = [],
    todayCashFlow = [],
    todayTotalUsd = 0,
    todayProfit = 0,
    todayItemsSold = 0,
    todayExpensesUsd = 0,
    paymentBreakdown = {},
    todayTopProducts = [],
    isAdmin = true,
    apertura = null,
    totalTax = 0,
    taxBreakdown = {},
    allSales = [],
    todayAdjustments = []
}) {
    const [step, setStep] = useState(1);
    const [actualCop, setActualCop] = useState('');
    const [actualUsd, setActualUsd] = useState('');
    const [declaredOthers, setDeclaredOthers] = useState({});
    const [cierreId, setCierreId] = useState(null);
    // Foto de los datos del día tomada ANTES de confirmar el cierre. Al confirmar,
    // onConfirm marca las ventas como cajaCerrada y las métricas (todaySales,
    // todayTotalUsd, paymentBreakdown, etc.) se vacían a 0. Sin esta foto, el ticket
    // y el PDF del paso 4 saldrían todos en $0.
    const [reportSnapshot, setReportSnapshot] = useState(null);

    // Initialize declaredOthers to empty values when paymentBreakdown is loaded
    React.useEffect(() => {
        if (paymentBreakdown && Object.keys(paymentBreakdown).length > 0) {
            const initial = {};
            Object.entries(paymentBreakdown).forEach(([methodId, data]) => {
                if (!['efectivo', 'efectivo_cop', 'efectivo_usd', '_vuelto_cop', 'vuelto_cop', 'vuelto_usd'].includes(methodId)) {
                    initial[methodId] = '';
                }
            });
            setDeclaredOthers(initial);
        }
    }, [paymentBreakdown]);

    const tipsBreakdown = React.useMemo(() => {
        const tipsByUser = {};
        let totalTips = 0;
        
        todaySales.forEach(s => {
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
    }, [todaySales]);

    const totalServicioVoluntario = React.useMemo(() => {
        let total = 0;
        const currentSales = reportSnapshot?.allSales || allSales || todaySales || [];
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
    }, [allSales, todaySales, reportSnapshot]);

    const otherPaymentEntries = React.useMemo(() => {
        return Object.entries(paymentBreakdown || {}).filter(([methodId, data]) => {
            return data.total > 0 && 
                   !['efectivo', 'efectivo_cop', 'efectivo_usd', '_vuelto_cop', 'vuelto_cop', 'vuelto_usd'].includes(methodId) &&
                   !data.currency?.startsWith('VUELTO');
        });
    }, [paymentBreakdown]);

    const currentCierreNum = React.useMemo(() => {
        const allCierreIds = Array.from(new Set(allSales.map(s => s.cierreId).filter(Boolean))).sort((a, b) => a - b);
        const matchIndex = allCierreIds.indexOf(cierreId);
        if (matchIndex !== -1) return matchIndex + 1;
        return allCierreIds.length + 1;
    }, [allSales, cierreId]);

    const prodMovements = React.useMemo(() => {
        const movements = {};
        
        // Process adjustments
        const currentAdjustments = reportSnapshot?.adjustments || todayAdjustments || [];
        currentAdjustments.forEach(adj => {
            if (adj.status === 'ANULADA') return;
            (adj.items || []).forEach(item => {
                if (isNonProductSaleItem(item)) return;

                const prodId = item.id;
                if (!movements[prodId]) {
                    movements[prodId] = { name: item.name || 'Producto', entrada: 0, salida: 0 };
                }
                if (adj.tipo === 'AJUSTE_ENTRADA') {
                    movements[prodId].entrada += item.qty;
                } else if (adj.tipo === 'AJUSTE_SALIDA') {
                    movements[prodId].salida += item.qty;
                }
            });
        });

        // Process sales (which are outgoing/salidas)
        const currentSales = reportSnapshot?.allSales || allSales || todaySales || [];
        currentSales.forEach(sale => {
            if (sale.status === 'ANULADA') return;
            (sale.items || []).forEach(item => {
                if (isNonProductSaleItem(item)) return;

                const prodId = item.id;
                if (!movements[prodId]) {
                    movements[prodId] = { name: item.name || 'Producto', entrada: 0, salida: 0 };
                }
                movements[prodId].salida += item.qty;
            });
        });

        return Object.entries(movements)
            .map(([id, data]) => ({ id, ...data }))
            .filter(m => m.entrada > 0 || m.salida > 0)
            .sort((a, b) => (b.salida + b.entrada) - (a.salida + a.entrada));
    }, [todayAdjustments, allSales, todaySales, reportSnapshot]);

    const incomeBreakdown = useMemo(() => {
        return computeIncomeBreakdown(allSales);
    }, [allSales]);

    if (!isOpen) return null;

    const openingCop = apertura?.openingCOP || apertura?.openingUsd || 0;
    const openingUsd = apertura?.openingBs || 0;

    // Expected COP cash = COP starting float + COP cash payments + COP change given (negative)
    const expectedCop = round2(
        openingCop +
        (paymentBreakdown['efectivo']?.total || 0) +
        (paymentBreakdown['efectivo_cop']?.total || 0) +
        (paymentBreakdown['_vuelto_cop']?.total || 0)
    );

    // Expected USD cash = USD starting float + USD cash payments
    const expectedUsd = round2(
        openingUsd +
        (paymentBreakdown['efectivo_usd']?.total || 0)
    );

    const declaredCop = parseFloat(actualCop) || 0;
    const declaredUsd = parseFloat(actualUsd) || 0;

    const diffCop = declaredCop - expectedCop;
    const diffUsd = declaredUsd - expectedUsd;

    // Total COP del dia
    const todayTotalCop = todayTotalUsd;

    // Semaforo
    const absDiffCop = Math.abs(diffCop);
    const absDiffUsd = Math.abs(diffUsd);

    const getSemaforo = () => {
        const hasMajorDiff = absDiffCop > 5000 || absDiffUsd > 1.00 || otherPaymentEntries.some(([methodId, data]) => {
            const expected = data.total;
            const declared = parseFloat(declaredOthers[methodId]) || 0;
            const diff = Math.abs(declared - expected);
            const isUsd = data.currency === 'USD';
            return diff > (isUsd ? 1.00 : 5000);
        });

        const hasMinorDiff = absDiffCop > 500 || absDiffUsd > 0.05 || otherPaymentEntries.some(([methodId, data]) => {
            const expected = data.total;
            const declared = parseFloat(declaredOthers[methodId]) || 0;
            const diff = Math.abs(declared - expected);
            const isUsd = data.currency === 'USD';
            return diff > (isUsd ? 0.05 : 500);
        });

        if (!hasMinorDiff) {
            return { color: 'emerald', label: 'Caja cuadrada', icon: CheckCircle2, bg: 'bg-emerald-500' };
        }
        if (!hasMajorDiff) {
            return { color: 'amber', label: 'Diferencia menor', icon: AlertTriangle, bg: 'bg-amber-500' };
        }
        return { color: 'red', label: 'Discrepancia significativa', icon: AlertTriangle, bg: 'bg-red-500' };
    };

    const handleConfirm = async () => {
        try {
            // Congelar los datos del día ANTES de confirmar: onConfirm marca las ventas
            // como cajaCerrada y las métricas se vacían. Estas referencias siguen
            // apuntando a los objetos originales (onConfirm no los muta, crea copias).
            setReportSnapshot({
                sales: todayCashFlow.filter(s => s.tipo !== 'APERTURA_CAJA'),
                allSales: allSales.length > 0 ? allSales : todaySales,
                adjustments: todayAdjustments,
                paymentBreakdown,
                topProducts: todayTopProducts,
                todayTotalCOP: todayTotalUsd,
                todayProfit,
                todayItemsSold,
                totalTax,
                taxBreakdown,
                apertura,
            });

            const currentCierreId = await onConfirm({
                declaredUsd: declaredUsd,
                declaredBs: 0,
                declaredCop,
                diffUsd: diffUsd,
                diffBs: 0,
                diffCop,
                declaredOthers
            });
            setCierreId(currentCierreId || Date.now());
            setStep(4);
        } catch (error) {
            console.error("Error al confirmar el cierre de caja:", error);
        }
    };

    const handleClose = () => {
        setStep(1);
        setActualCop('');
        setActualUsd('');
        setDeclaredOthers({});
        setCierreId(null);
        setReportSnapshot(null);
        onClose();
    };

    const paymentEntries = Object.entries(paymentBreakdown).filter(([, data]) => data.total > 0 && !data.currency?.startsWith('VUELTO'));

    // Helper: format COP display  
    const fmtCop = (v) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(Math.round(v || 0));
    const fmtUsd = (v) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(v || 0);

    return (
        <div className="fixed inset-0 z-[200] bg-slate-955/90 backdrop-blur-md flex items-end sm:items-center justify-center animate-in fade-in duration-200" onClick={handleClose}>
            <div
                className="bg-white dark:bg-slate-900 w-full sm:max-w-md sm:rounded-3xl rounded-t-3xl max-h-[92vh] flex flex-col shadow-2xl border-t border-slate-200 dark:border-slate-700 animate-in slide-in-from-bottom duration-300"
                onClick={e => e.stopPropagation()}
            >
                {/* Progress Bar */}
                <div className="px-6 pt-5 pb-3">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-black text-slate-800 dark:text-white">Cierre de Caja</h2>
                        <button onClick={handleClose} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                            <X size={18} />
                        </button>
                    </div>
                    <div className="flex gap-2">
                        {[1, 2, 3, 4].map(s => (
                            <div key={s} className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${s <= step ? 'bg-indigo-500' : 'bg-slate-200 dark:bg-slate-700'}`} />
                        ))}
                    </div>
                    <div className="flex justify-between mt-2">
                        <span className={`text-[10px] font-bold uppercase tracking-wider ${step >= 1 ? 'text-indigo-500' : 'text-slate-400'}`}>Resumen</span>
                        <span className={`text-[10px] font-bold uppercase tracking-wider ${step >= 2 ? 'text-indigo-500' : 'text-slate-400'}`}>Conteo</span>
                        <span className={`text-[10px] font-bold uppercase tracking-wider ${step >= 3 ? 'text-indigo-500' : 'text-slate-400'}`}>Resultado</span>
                        <span className={`text-[10px] font-bold uppercase tracking-wider ${step >= 4 ? 'text-indigo-500' : 'text-slate-400'}`}>Fin</span>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto px-6 pb-6 scrollbar-hide">

                    {/* ═══ STEP 1: Resumen del Dia ═══ */}
                    {step === 1 && (
                        <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                            {/* Totales principales */}
                            <div className="bg-gradient-to-br from-indigo-500 to-indigo-700 rounded-2xl p-5 text-white relative overflow-hidden">
                                <div className="absolute -right-6 -top-6 w-24 h-24 bg-white/10 rounded-full blur-2xl" />
                                <p className="text-xs font-bold text-indigo-200 uppercase tracking-widest mb-1">Ingresos brutos del dia</p>
                                <p className="text-3xl font-black">{fmtCop(todayTotalCop)}</p>
                                <div className="flex items-center gap-4 mt-3 pt-3 border-t border-white/20">
                                    <div className="flex items-center gap-1.5">
                                        <ShoppingBag size={14} className="text-indigo-200" />
                                        <span className="text-sm font-bold">{todaySales.length} {todaySales.length === 1 ? 'venta' : 'ventas'}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <Package size={14} className="text-indigo-200" />
                                        <span className="text-sm font-bold">{todayItemsSold} items</span>
                                    </div>
                                </div>
                                {(openingCop > 0 || openingUsd > 0) && (
                                    <div className="mt-2 pt-2 border-t border-white/20 flex items-center justify-between text-[11px] text-indigo-200 font-medium">
                                        <span>Fondo inicial de apertura:</span>
                                        <span className="font-bold text-white">
                                            {fmtCop(openingCop)}{openingUsd > 0 ? ` + ${fmtUsd(openingUsd)}` : ''}
                                        </span>
                                    </div>
                                )}
                                {totalServicioVoluntario > 0 && (
                                    <div className="mt-2 pt-2 border-t border-white/20 flex items-center justify-between text-[11px] text-indigo-200 font-medium">
                                        <span>Servicio Voluntario:</span>
                                        <span className="font-bold text-white">
                                            {fmtCop(totalServicioVoluntario)}
                                        </span>
                                    </div>
                                )}
                                {todaySales.length > 0 && (() => {
                                    const timestamps = todaySales.map(s => new Date(s.timestamp)).sort((a, b) => a - b);
                                    const fmt = (d) => d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' }) + ' ' + d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
                                    return (
                                        <div className="mt-2 pt-2 border-t border-white/20 flex justify-between text-[11px] text-indigo-200">
                                            <span>Primera: {fmt(timestamps[0])}</span>
                                            <span>Última: {fmt(timestamps[timestamps.length - 1])}</span>
                                        </div>
                                    );
                                })()}
                            </div>

                            {/* Ganancia + Egresos — solo admin */}
                            {isAdmin && (
                            <div className="grid grid-cols-2 gap-3">
                                <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/30 rounded-xl p-3">
                                    <div className="flex items-center gap-1.5 mb-1">
                                        <TrendingUp size={14} className="text-emerald-500" />
                                        <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase">Ganancia</span>
                                    </div>
                                    <p className={`text-lg font-black ${todayProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
                                        {fmtCop(todayProfit)}
                                    </p>
                                </div>
                                <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800/30 rounded-xl p-3">
                                    <div className="flex items-center gap-1.5 mb-1">
                                        <Package size={14} className="text-orange-500" />
                                        <span className="text-[10px] font-bold text-orange-600 dark:text-orange-400 uppercase">Egresos</span>
                                    </div>
                                    <p className="text-lg font-black text-orange-600 dark:text-orange-400">
                                        -{fmtCop(todayExpensesUsd)}
                                    </p>
                                </div>
                            </div>
                            )}

                            {/* Desglose General de Ingresos */}
                            <div>
                                <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2 pl-1">Desglose General de Ingresos</h4>
                                <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-700/50 p-3.5 space-y-2">
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="font-bold text-slate-600 dark:text-slate-300">🛒 Productos Físicos</span>
                                        <span className="font-black text-slate-800 dark:text-slate-100 font-mono">{fmtCop(incomeBreakdown.productosFisicos)}</span>
                                    </div>
                                    {incomeBreakdown.tiempoMesa > 0 && (
                                        <div className="flex items-center justify-between text-xs">
                                            <span className="font-bold text-slate-600 dark:text-slate-300">🎱 Tiempo de Mesa / Juegos</span>
                                            <span className="font-black text-indigo-600 dark:text-indigo-400 font-mono">+{fmtCop(incomeBreakdown.tiempoMesa)}</span>
                                        </div>
                                    )}
                                    {incomeBreakdown.propinasTotal > 0 && (
                                        <div className="flex items-center justify-between text-xs">
                                            <span className="font-bold text-slate-600 dark:text-slate-300">🤝 Servicio Voluntario (Propina)</span>
                                            <span className="font-black text-emerald-600 dark:text-emerald-400 font-mono">+{fmtCop(incomeBreakdown.propinasTotal)}</span>
                                        </div>
                                    )}
                                    {incomeBreakdown.abonosServicios > 0 && (
                                        <div className="flex items-center justify-between text-xs">
                                            <span className="font-bold text-slate-600 dark:text-slate-300">💳 Abonos / Servicios de Mesa</span>
                                            <span className="font-black text-slate-800 dark:text-slate-100 font-mono">+{fmtCop(incomeBreakdown.abonosServicios)}</span>
                                        </div>
                                    )}
                                    <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between text-xs">
                                        <span className="font-black text-slate-800 dark:text-white uppercase">Total Ingreso Bruto</span>
                                        <span className="font-black text-blue-600 dark:text-blue-400 font-mono text-sm">{fmtCop(todayTotalCop)}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Desglose por metodo de pago — solo admin */}
                            {isAdmin && paymentEntries.length > 0 && (
                                <div>
                                    <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2 pl-1">Desglose por metodo</h4>
                                    <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-700/50 divide-y divide-slate-100 dark:divide-slate-700/50">
                                        {paymentEntries.map(([methodId, data]) => {
                                            const IconComp = getPaymentIcon(methodId);
                                            const isUsd = data.currency === 'USD';
                                            return (
                                                <div key={methodId} className="flex items-center justify-between px-4 py-3">
                                                    <div className="flex items-center gap-2.5">
                                                        <div className="w-8 h-8 bg-white dark:bg-slate-700 rounded-lg flex items-center justify-center shadow-sm">
                                                            {IconComp ? <IconComp size={16} className="text-slate-600 dark:text-slate-300" /> : <Coins size={16} className="text-slate-600 dark:text-slate-300" />}
                                                        </div>
                                                        <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{toTitleCase(getPaymentLabel(methodId, data.label))}</span>
                                                    </div>
                                                    <span className="text-sm font-black text-slate-800 dark:text-white font-mono">
                                                        {isUsd ? fmtUsd(data.total) : fmtCop(data.total)}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Articulos vendidos */}
                            {todayTopProducts.length > 0 && (
                                <div>
                                    <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2 pl-1">Articulos vendidos hoy</h4>
                                    <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                                        {todayTopProducts.map((p, i) => (
                                            <div key={i} className="flex items-center justify-between bg-slate-50 dark:bg-slate-800/50 rounded-xl px-3 py-2 border border-slate-100 dark:border-slate-700/50">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate max-w-[180px]">{p.name}</span>
                                                </div>
                                                <span className="text-xs font-bold text-slate-500 bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded-md">{p.qty} uds</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Movimientos de Inventario (Entradas/Salidas) */}
                            {prodMovements.length > 0 && (
                                <div>
                                    <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2 pl-1">Movimiento de Productos</h4>
                                    <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-700/50 overflow-hidden divide-y divide-slate-100 dark:divide-slate-700/50 max-h-56 overflow-y-auto">
                                        {prodMovements.map((m, i) => (
                                            <div key={i} className="flex items-center justify-between px-4 py-2.5">
                                                <span className="text-sm font-bold text-slate-700 dark:text-slate-200 truncate max-w-[180px]">{m.name}</span>
                                                <div className="flex items-center gap-3">
                                                    {m.entrada > 0 && (
                                                        <span className="text-xs font-bold text-emerald-600 dark:text-emerald-450 bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded-md">
                                                            +{m.entrada} ent.
                                                        </span>
                                                    )}
                                                    {m.salida > 0 && (
                                                        <span className="text-xs font-bold text-rose-600 dark:text-rose-450 bg-rose-50 dark:bg-rose-955/50 px-2 py-0.5 rounded-md">
                                                            -{m.salida} sal.
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Propinas del Personal */}
                            {tipsBreakdown.total > 0 && (
                                <div>
                                    <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2 pl-1">Propinas por Personal</h4>
                                    <div className="bg-indigo-50/50 dark:bg-indigo-900/10 p-3.5 rounded-xl border border-indigo-100/30 dark:border-indigo-900/20 space-y-2">
                                        {tipsBreakdown.users.map((u) => (
                                            <div key={u.name} className="flex items-center justify-between text-xs font-bold">
                                                <span className="text-slate-600 dark:text-slate-350">{u.name}</span>
                                                <span className="text-slate-800 dark:text-white font-mono">{fmtCop(u.total)}</span>
                                            </div>
                                        ))}
                                        <div className="border-t border-indigo-100/50 dark:border-indigo-900/30 pt-2 flex items-center justify-between font-black text-xs text-indigo-600 dark:text-indigo-400">
                                            <span>Total Propinas</span>
                                            <span className="font-mono">{fmtCop(tipsBreakdown.total)}</span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* CTA */}
                            <button
                                onClick={() => setStep(2)}
                                className="w-full py-4 bg-indigo-500 hover:bg-indigo-600 text-white font-bold rounded-2xl shadow-lg shadow-indigo-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2 text-sm"
                            >
                                Continuar al Conteo <ArrowRight size={18} />
                            </button>
                        </div>
                    )}
                    {/* ═══ STEP 2: Conteo Fisico ═══ */}
                    {step === 2 && (
                        <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-300">
                            <div className="text-center py-2">
                                <div className="w-16 h-16 bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl flex items-center justify-center mx-auto mb-3">
                                    <Wallet size={32} className="text-indigo-500" />
                                </div>
                                <h3 className="text-lg font-black text-slate-800 dark:text-white">Conteo Fisico</h3>
                                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 leading-relaxed max-w-[280px] mx-auto">
                                    Cuenta el efectivo fisico que tienes en la gaveta en este momento
                                </p>
                                {(openingCop > 0 || openingUsd > 0) && (
                                    <p className="text-[11px] text-indigo-600 dark:text-indigo-400 font-semibold bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100/50 dark:border-indigo-900/30 rounded-xl px-3 py-2 mt-2 inline-block max-w-[320px]">
                                        Recuerda incluir el fondo inicial de apertura ({fmtCop(openingCop)}{openingUsd > 0 ? ` + ${fmtUsd(openingUsd)}` : ''}) en tu conteo físico.
                                    </p>
                                )}
                            </div>

                            {/* COP Input */}
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest pl-1 mb-1.5 block">Efectivo en pesos (COP)</label>
                                <div className="relative flex items-center">
                                    <Coins size={18} className="absolute left-4 text-amber-500" />
                                    <input
                                        type="number"
                                        step="any"
                                        inputMode="decimal"
                                        value={actualCop}
                                        onChange={e => setActualCop(e.target.value)}
                                        placeholder="0"
                                        autoFocus
                                        className="w-full bg-slate-50 dark:bg-slate-950 border-2 border-slate-200 dark:border-slate-700 rounded-2xl py-4 pl-12 pr-4 text-xl text-slate-800 dark:text-white font-black outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all font-mono"
                                    />
                                </div>
                                <p className="text-[11px] text-slate-400 mt-1.5 pl-1">
                                    {isAdmin ? (
                                        <>
                                            Sistema espera: <span className="font-bold text-indigo-500">{fmtCop(expectedCop)}</span>
                                            {openingCop > 0 && <span className="text-[10px] text-slate-400 ml-1">(Base: {fmtCop(openingCop)} + Ventas: {fmtCop(expectedCop - openingCop)})</span>}
                                        </>
                                    ) : 'Asegúrate de contar bien todo el efectivo de la gaveta'}
                                </p>
                            </div>

                            {/* USD Input */}
                            <div className="mt-4">
                                <label className="text-xs font-bold text-slate-550 uppercase tracking-widest pl-1 mb-1.5 block">Efectivo en dólares (USD)</label>
                                <div className="relative flex items-center">
                                    <Coins size={18} className="absolute left-4 text-emerald-500" />
                                    <input
                                        type="number"
                                        step="any"
                                        inputMode="decimal"
                                        value={actualUsd}
                                        onChange={e => setActualUsd(e.target.value)}
                                        placeholder="0.00"
                                        className="w-full bg-slate-50 dark:bg-slate-950 border-2 border-slate-200 dark:border-slate-700 rounded-2xl py-4 pl-12 pr-4 text-xl text-slate-800 dark:text-white font-black outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all font-mono"
                                    />
                                </div>
                                <p className="text-[11px] text-slate-400 mt-1.5 pl-1">
                                    {isAdmin ? (
                                        <>
                                            Sistema espera: <span className="font-bold text-emerald-500">{fmtUsd(expectedUsd)}</span>
                                            {openingUsd > 0 && <span className="text-[10px] text-slate-400 ml-1">(Base: {fmtUsd(openingUsd)} + Ventas: {fmtUsd(expectedUsd - openingUsd)})</span>}
                                        </>
                                    ) : 'Asegúrate de contar bien todo el efectivo de la gaveta'}
                                </p>
                            </div>

                            {otherPaymentEntries.map(([methodId, data]) => {
                                const IconComp = getPaymentIcon(methodId);
                                const isUsd = data.currency === 'USD';
                                return (
                                    <div key={methodId} className="mt-4">
                                        <label className="text-xs font-bold text-slate-550 uppercase tracking-widest pl-1 mb-1.5 block">
                                            {toTitleCase(getPaymentLabel(methodId, data.label))}
                                        </label>
                                        <div className="relative flex items-center">
                                            <div className="absolute left-4">
                                                {IconComp ? <IconComp size={18} className="text-slate-555" /> : <Coins size={18} className="text-slate-555" />}
                                            </div>
                                            <input
                                                type="number"
                                                step="any"
                                                inputMode="decimal"
                                                value={declaredOthers[methodId] ?? ''}
                                                onChange={e => setDeclaredOthers(prev => ({ ...prev, [methodId]: e.target.value }))}
                                                placeholder={isUsd ? '0.00' : '0'}
                                                className="w-full bg-slate-50 dark:bg-slate-950 border-2 border-slate-200 dark:border-slate-700 rounded-2xl py-4 pl-12 pr-4 text-xl text-slate-800 dark:text-white font-black outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all font-mono"
                                            />
                                        </div>
                                        <p className="text-[11px] text-slate-400 mt-1.5 pl-1">
                                            {isAdmin ? (
                                                <>
                                                    Sistema espera: <span className="font-bold text-indigo-500">{isUsd ? fmtUsd(data.total) : fmtCop(data.total)}</span>
                                                </>
                                            ) : 'Asegúrate de verificar y contar bien las transacciones'}
                                        </p>
                                    </div>
                                );
                            })}
                            {/* Actions */}
                            <div className="flex gap-3 pt-2">
                                <button onClick={() => setStep(1)} className="flex-1 py-3.5 text-sm font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">
                                    Atras
                                </button>
                                <button
                                    onClick={() => setStep(3)}
                                    className="flex-1 py-3.5 text-sm font-bold text-white bg-indigo-500 hover:bg-indigo-600 rounded-xl shadow-lg shadow-indigo-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                                >
                                    Calcular <ArrowRight size={16} />
                                </button>
                            </div>
                        </div>
                    )}

                    {/* ═══ STEP 3: Resultado ═══ */}
                    {step === 3 && (() => {
                        const sem = getSemaforo();
                        const SemIcon = sem.icon;
                        return (
                            <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-300">
                                {/* Semaforo e Información (Solo Admin) */}
                                {isAdmin ? (
                                    <>
                                        <div className={`${sem.bg} rounded-2xl p-5 text-white text-center relative overflow-hidden`}>
                                            <div className="absolute -right-6 -top-6 w-24 h-24 bg-white/10 rounded-full blur-2xl" />
                                            <SemIcon size={40} className="mx-auto mb-2" />
                                            <h3 className="text-xl font-black">{sem.label}</h3>
                                            <p className="text-sm font-medium text-white/80 mt-1">
                                                Dif. COP: {diffCop >= 0 ? '+' : ''}{fmtCop(diffCop)} | Dif. USD: {diffUsd >= 0 ? '+' : ''}{fmtUsd(diffUsd)}
                                            </p>
                                        </div>

                                        <div>
                                            <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2 pl-1">Comparativa de Arqueo</h4>
                                            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-700/50 overflow-hidden">
                                                {/* Header */}
                                                <div className="grid grid-cols-4 gap-1 px-3 py-2.5 bg-slate-100 dark:bg-slate-700/50 text-right">
                                                    <span className="text-[10px] font-bold text-slate-500 uppercase text-left">Método</span>
                                                    <span className="text-[10px] font-bold text-slate-500 uppercase font-mono">Esperado</span>
                                                    <span className="text-[10px] font-bold text-slate-500 uppercase font-mono">Declarado</span>
                                                    <span className="text-[10px] font-bold text-slate-500 uppercase font-mono">Diferencia</span>
                                                </div>
                                                {/* COP Row */}
                                                <div className="grid grid-cols-4 gap-1 px-3 py-3 border-b border-slate-100 dark:border-slate-700/50 text-right items-center">
                                                    <span className="text-xs font-bold text-slate-700 dark:text-slate-200 text-left">Efectivo COP</span>
                                                    <span className="text-xs font-mono text-slate-500">{fmtCop(expectedCop)}</span>
                                                    <span className="text-xs font-mono text-slate-700 dark:text-white font-bold">{fmtCop(declaredCop)}</span>
                                                    <span className={`text-xs font-mono font-black ${diffCop >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                                        {diffCop >= 0 ? '+' : ''}{fmtCop(diffCop)}
                                                    </span>
                                                </div>
                                                {/* USD Row */}
                                                <div className="grid grid-cols-4 gap-1 px-3 py-3 border-b border-slate-100 dark:border-slate-700/50 text-right items-center">
                                                    <span className="text-xs font-bold text-slate-700 dark:text-slate-200 text-left">Efectivo USD</span>
                                                    <span className="text-xs font-mono text-slate-500">{fmtUsd(expectedUsd)}</span>
                                                    <span className="text-xs font-mono text-slate-700 dark:text-white font-bold">{fmtUsd(declaredUsd)}</span>
                                                    <span className={`text-xs font-mono font-black ${diffUsd >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                                        {diffUsd >= 0 ? '+' : ''}{fmtUsd(diffUsd)}
                                                    </span>
                                                </div>
                                                {/* Other rows */}
                                                {otherPaymentEntries.map(([methodId, data]) => {
                                                    const expected = data.total;
                                                    const declared = parseFloat(declaredOthers[methodId]) || 0;
                                                    const diff = declared - expected;
                                                    const isUsd = data.currency === 'USD';
                                                    return (
                                                        <div key={methodId} className="grid grid-cols-4 gap-1 px-3 py-3 border-b border-slate-100 dark:border-slate-700/50 text-right items-center">
                                                            <span className="text-xs font-bold text-slate-700 dark:text-slate-200 text-left truncate">
                                                                {toTitleCase(getPaymentLabel(methodId, data.label))}
                                                            </span>
                                                            <span className="text-xs font-mono text-slate-500">
                                                                {isUsd ? fmtUsd(expected) : fmtCop(expected)}
                                                            </span>
                                                            <span className="text-xs font-mono text-slate-700 dark:text-white font-bold">
                                                                {isUsd ? fmtUsd(declared) : fmtCop(declared)}
                                                            </span>
                                                            <span className={`text-xs font-mono font-black ${diff >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                                                {diff >= 0 ? '+' : ''}{isUsd ? fmtUsd(diff) : fmtCop(diff)}
                                                            </span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-5 text-center relative overflow-hidden border border-slate-200 dark:border-slate-700">
                                        <CheckCircle2 size={40} className="mx-auto mb-2 text-indigo-500" />
                                        <h3 className="text-xl font-black text-slate-800 dark:text-white">Conteo Registrado</h3>
                                        <p className="text-sm font-medium text-slate-500 mt-2">
                                            Los totales ingresados han sido capturados para la auditoría de caja (Cierre Ciego). Puedes confirmar el cierre.
                                        </p>
                                    </div>
                                )}

                                {/* Actions */}
                                <div className="flex gap-3 pt-2">
                                    <button onClick={() => setStep(2)} className="flex-1 py-3.5 text-sm font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">
                                        Revisar
                                    </button>
                                    <button
                                        onClick={handleConfirm}
                                        className={`flex-1 py-3.5 text-sm font-bold text-white ${sem.bg} hover:brightness-110 rounded-xl shadow-lg active:scale-[0.98] transition-all flex items-center justify-center gap-2`}
                                    >
                                        <CheckCircle2 size={18} /> Confirmar Cierre
                                    </button>
                                </div>
                            </div>
                        );
                    })()}

                    {/* ═══ STEP 4: Imprimir / Finalizar ═══ */}
                    {step === 4 && (
                        <div className="space-y-6 text-center py-4 animate-in fade-in slide-in-from-right-4 duration-300">
                            <div className="w-20 h-20 bg-emerald-50 dark:bg-emerald-955/30 rounded-full flex items-center justify-center mx-auto mb-4 border-4 border-emerald-100 dark:border-emerald-900/50 shadow-inner">
                                <CheckCircle2 size={44} className="text-emerald-500" />
                            </div>
                            
                            <div>
                                <h3 className="text-xl font-black text-slate-800 dark:text-white">¡Cierre de Caja #{currentCierreNum} Registrado!</h3>
                                <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 leading-relaxed max-w-[280px] mx-auto">
                                    Los datos se guardaron y el turno se cerró correctamente. Puedes imprimir el ticket físico para control.
                                </p>
                            </div>

                            {/* Acciones principales */}
                            <div className="space-y-3 pt-2">
                                <button
                                    onClick={() => {
                                        // Usa la foto tomada antes del cierre (datos reales).
                                        // Fallback a props en vivo solo si la foto no existe.
                                        const snap = reportSnapshot || {
                                            sales: todayCashFlow.filter(s => s.tipo !== 'APERTURA_CAJA'),
                                            allSales: allSales.length > 0 ? allSales : todaySales,
                                            adjustments: todayAdjustments,
                                            paymentBreakdown,
                                            topProducts: todayTopProducts,
                                            todayTotalCOP: todayTotalUsd,
                                            todayProfit,
                                            todayItemsSold,
                                            totalTax,
                                            taxBreakdown,
                                            apertura,
                                        };
                                        printThermalDailyClose({
                                             ...snap,
                                             reconData: {
                                                 declaredCop,
                                                 declaredUsd,
                                                 diffCop,
                                                 diffUsd,
                                                 declaredOthers
                                             },
                                             cierreId: cierreId,
                                             cierreNum: currentCierreNum
                                         });
                                    }}
                                    className="w-full py-3.5 bg-indigo-500 hover:bg-indigo-600 text-white font-bold rounded-2xl shadow-lg shadow-indigo-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2 text-sm"
                                >
                                    <Printer size={18} /> Imprimir Ticket (58mm)
                                </button>

                                <button
                                    onClick={() => {
                                        const snap = reportSnapshot || {
                                            sales: todayCashFlow.filter(s => s.tipo !== 'APERTURA_CAJA'),
                                            allSales: allSales.length > 0 ? allSales : todaySales,
                                            adjustments: todayAdjustments,
                                            paymentBreakdown,
                                            topProducts: todayTopProducts,
                                            todayTotalCOP: todayTotalUsd,
                                            todayProfit,
                                            todayItemsSold,
                                            totalTax,
                                            taxBreakdown,
                                            apertura,
                                        };
                                        generateDailyClosePDF({
                                            ...snap,
                                            bcvRate: 0,
                                            todayTotalBs: 0,
                                            reconData: {
                                                declaredCop,
                                                declaredUsd,
                                                diffCop,
                                                diffUsd,
                                                declaredOthers
                                            },
                                            isReprint: false,
                                            cierreNum: currentCierreNum,
                                        });
                                    }}
                                    className="w-full py-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors active:scale-95"
                                >
                                    <Download size={16} /> Descargar Reporte PDF
                                </button>
                            </div>

                            <div className="border-t border-slate-100 dark:border-slate-800/80 pt-4">
                                <button
                                    onClick={handleClose}
                                    className="w-full py-3 text-sm font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
                                >
                                    Entendido y Finalizar
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
