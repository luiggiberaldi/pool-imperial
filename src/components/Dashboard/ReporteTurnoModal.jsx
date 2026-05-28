import React, { useMemo } from 'react';
import { X, Download, FileSpreadsheet, TrendingUp, ShoppingBag, CreditCard, Clock, Package } from 'lucide-react';
import { getPaymentLabel } from '../../config/paymentMethods';

function formatHora(ts) {
    if (!ts) return '—';
    return new Date(ts).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
}

function formatFecha(ts) {
    if (!ts) return '—';
    return new Date(ts).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function getSalePaymentLabel(s) {
    if (s.payments && s.payments.length > 1) return 'Pago Mixto';
    if (s.payments && s.payments.length === 1) return getPaymentLabel(s.payments[0].methodId, s.payments[0].methodLabel);
    if (s.paymentMethod) return getPaymentLabel(s.paymentMethod);
    return '—';
}

export default function ReporteTurnoModal({ isOpen, onClose, todaySales, todayTotalUsd, todayTotalBs, todayItemsSold, paymentBreakdown, activeCashSession, cajeroName, products = [], role = 'ADMIN' }) {
    if (!isOpen) return null;

    const isAdmin = role === 'ADMIN';

    const fecha = formatFecha(activeCashSession?.opened_at || new Date().toISOString());
    const horaApertura = formatHora(activeCashSession?.opened_at);

    // Desglose por método de pago — usa paymentBreakdown del FinancialEngine (neto de vuelto)
    const breakdown = useMemo(() => {
        if (!paymentBreakdown || Object.keys(paymentBreakdown).length === 0) return [];

        // Contar transacciones por methodId desde todaySales
        const countMap = {};
        todaySales.forEach(s => {
            if (s.payments?.length > 0) {
                s.payments.forEach(p => {
                    countMap[p.methodId] = (countMap[p.methodId] || 0) + 1;
                });
            } else if (s.paymentMethod) {
                countMap[s.paymentMethod] = (countMap[s.paymentMethod] || 0) + 1;
            }
        });

        return Object.entries(paymentBreakdown)
            .filter(([key]) => !key.startsWith('_vuelto') && key !== 'fiado')
            .map(([methodId, data]) => ({
                label: data.label || getPaymentLabel(methodId),
                total: data.total,
                currency: data.currency || 'BS',
                count: countMap[methodId] || 0,
            }))
            .filter(d => d.total > 0)
            .sort((a, b) => {
                const aUsd = a.currency === 'USD' ? a.total : a.total / 1;
                const bUsd = b.currency === 'USD' ? b.total : b.total / 1;
                return bUsd - aUsd;
            });
    }, [paymentBreakdown, todaySales]);

    const handleDownloadCSV = () => {
        const rows = [];
        const sep = ';';

        // Encabezado del reporte
        rows.push(['REPORTE DE TURNO - POOL IMPERIAL']);
        rows.push([`Fecha: ${fecha}`, `Cajero: ${cajeroName || '—'}`, `Apertura: ${horaApertura}`]);
        rows.push([]);

        // Resumen
        rows.push(['=== RESUMEN ===']);
        rows.push(['Total Ventas USD', `$${todayTotalUsd.toFixed(2)}`]);
        rows.push(['Total Ventas Bs', `Bs ${todayTotalBs.toFixed(2)}`]);
        rows.push(['Cantidad de Ventas', todaySales.length]);
        rows.push(['Productos Vendidos', todayItemsSold]);
        rows.push([]);

        // Desglose por método de pago
        rows.push(['=== MÉTODOS DE PAGO ===']);
        rows.push(['Método', 'Total', 'Moneda', 'Nº Transacciones']);
        breakdown.forEach(d => {
            rows.push([d.label, d.total.toFixed(2), d.currency, d.count]);
        });
        rows.push([]);

        // Detalle de ventas
        rows.push(['=== DETALLE DE VENTAS ===']);
        rows.push(['Hora', 'Cliente', 'Productos', 'Cant. Items', 'Total USD', 'Total Bs', 'Método de Pago']);
        todaySales.forEach(s => {
            const productos = s.items ? s.items.map(i => `${i.name} x${i.qty}`).join(' | ') : '—';
            rows.push([
                formatHora(s.timestamp),
                s.clientName || 'Público General',
                productos,
                s.items ? s.items.reduce((sum, i) => sum + i.qty, 0) : 0,
                `$${(s.totalUsd || 0).toFixed(2)}`,
                `Bs ${(s.totalBs || 0).toFixed(2)}`,
                getSalePaymentLabel(s),
            ]);
        });

        // Convertir a CSV
        const csv = rows.map(row =>
            row.map(cell => {
                const val = String(cell ?? '');
                return val.includes(sep) || val.includes('"') || val.includes('\n')
                    ? `"${val.replace(/"/g, '""')}"` : val;
            }).join(sep)
        ).join('\n');

        const bom = '\uFEFF'; // Para que Excel reconozca UTF-8
        const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `reporte_turno_${fecha.replace(/\//g, '-')}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const handleDownloadInventarioCSV = () => {
        const rows = [];
        const sep = ';';

        rows.push(['REPORTE DE INVENTARIO - POOL IMPERIAL']);
        rows.push([`Fecha: ${fecha}`, `Generado por: ${cajeroName || '—'}`]);
        rows.push([]);
        rows.push(['Producto', 'Categoría', 'Precio USD', 'Costo USD', 'Costo Bs', 'Stock', 'Stock Mínimo', 'Estado']);

        const sorted = [...products].sort((a, b) => (a.category || '').localeCompare(b.category || ''));
        sorted.forEach(p => {
            const stock = p.stock ?? 0;
            const minStock = p.lowStockAlert ?? 5;
            const estado = stock <= 0 ? 'SIN STOCK' : stock <= minStock ? 'STOCK BAJO' : 'OK';
            rows.push([
                p.name || '—',
                p.category || 'Sin categoría',
                `$${(p.priceUsdt || 0).toFixed(2)}`,
                `$${(p.costUsd || 0).toFixed(2)}`,
                `Bs ${(p.costBs || 0).toFixed(2)}`,
                stock,
                minStock,
                estado,
            ]);
        });

        rows.push([]);
        rows.push([`Total productos: ${products.length}`]);

        const csv = rows.map(row =>
            row.map(cell => {
                const val = String(cell ?? '');
                return val.includes(sep) || val.includes('"') || val.includes('\n')
                    ? `"${val.replace(/"/g, '""')}"` : val;
            }).join(sep)
        ).join('\n');

        const bom = '\uFEFF';
        const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `inventario_${fecha.replace(/\//g, '-')}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    return (
        <div
            className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200"
            onClick={onClose}
        >
            <div
                className="bg-white dark:bg-slate-900 w-full sm:max-w-md rounded-t-[2rem] sm:rounded-[2rem] shadow-2xl animate-in slide-in-from-bottom-6 duration-250 flex flex-col max-h-[90vh]"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-5 pb-4 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                            <FileSpreadsheet size={18} className="text-blue-600 dark:text-blue-400" />
                        </div>
                        <div>
                            <h2 className="text-base font-black text-slate-800 dark:text-white">Reporte de Turno</h2>
                            <p className="text-[10px] text-slate-400">{fecha} · Apertura {horaApertura}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all">
                        <X size={18} />
                    </button>
                </div>

                {/* Body scrollable */}
                <div className="overflow-y-auto flex-1 px-5 pb-2 space-y-4">

                    {/* Tarjetas de resumen — cajero solo ve conteos, no montos */}
                    <div className={`grid ${isAdmin ? 'grid-cols-2' : 'grid-cols-2'} gap-3`}>
                        {isAdmin && (
                        <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl p-3.5">
                            <div className="flex items-center gap-1.5 mb-1">
                                <TrendingUp size={12} className="text-emerald-500" />
                                <p className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Total USD</p>
                            </div>
                            <p className="text-xl font-black text-emerald-700 dark:text-emerald-300">${todayTotalUsd.toFixed(2)}</p>
                        </div>
                        )}
                        {isAdmin && (
                        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-2xl p-3.5">
                            <div className="flex items-center gap-1.5 mb-1">
                                <TrendingUp size={12} className="text-blue-500" />
                                <p className="text-[9px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">Total Bs</p>
                            </div>
                            <p className="text-xl font-black text-blue-700 dark:text-blue-300">Bs {todayTotalBs.toFixed(2)}</p>
                        </div>
                        )}
                        <div className="bg-violet-50 dark:bg-violet-900/20 rounded-2xl p-3.5">
                            <div className="flex items-center gap-1.5 mb-1">
                                <ShoppingBag size={12} className="text-violet-500" />
                                <p className="text-[9px] font-bold text-violet-600 dark:text-violet-400 uppercase tracking-wider">Ventas</p>
                            </div>
                            <p className="text-xl font-black text-violet-700 dark:text-violet-300">{todaySales.length}</p>
                        </div>
                        <div className="bg-amber-50 dark:bg-amber-900/20 rounded-2xl p-3.5">
                            <div className="flex items-center gap-1.5 mb-1">
                                <ShoppingBag size={12} className="text-amber-500" />
                                <p className="text-[9px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">Productos</p>
                            </div>
                            <p className="text-xl font-black text-amber-700 dark:text-amber-300">{todayItemsSold}</p>
                        </div>
                    </div>

                    {/* Desglose por método de pago — solo admin */}
                    {isAdmin && breakdown.length > 0 && (
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <CreditCard size={13} className="text-slate-400" />
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Métodos de Pago</p>
                            </div>
                            <div className="space-y-2">
                                {breakdown.map((d) => (
                                    <div key={d.label} className="flex items-center justify-between bg-slate-50 dark:bg-slate-800/50 rounded-xl px-3.5 py-2.5">
                                        <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{d.label}</p>
                                        <div className="text-right">
                                            <p className="text-sm font-black text-slate-800 dark:text-white">
                                                {d.currency === 'USD' ? `$${d.total.toFixed(2)}` : `Bs ${d.total.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                                            </p>
                                            {d.count > 0 && <p className="text-[9px] text-slate-400">{d.count} {d.count === 1 ? 'transacción' : 'transacciones'}</p>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Listado de ventas del turno — solo admin */}
                    {isAdmin && todaySales.length > 0 && (
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <Clock size={13} className="text-slate-400" />
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Ventas del Turno ({todaySales.length})</p>
                            </div>
                            <div className="space-y-1.5">
                                {todaySales.map(s => (
                                    <div key={s.id} className="flex items-center justify-between bg-slate-50 dark:bg-slate-800/50 rounded-xl px-3.5 py-2.5">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <p className="text-[10px] text-slate-400 font-mono">{formatHora(s.timestamp)}</p>
                                                <p className="text-[10px] text-slate-400">·</p>
                                                <p className="text-[10px] text-slate-500 truncate">{getSalePaymentLabel(s)}</p>
                                            </div>
                                            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                                                {s.items ? s.items.map(i => `${i.name} x${i.qty}`).join(', ') : '—'}
                                            </p>
                                        </div>
                                        <p className="text-sm font-black text-slate-800 dark:text-white ml-3 shrink-0">${(s.totalUsd || 0).toFixed(2)}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {isAdmin && todaySales.length === 0 && (
                        <div className="text-center py-8">
                            <p className="text-slate-400 text-sm font-bold">Sin ventas en este turno</p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-5 pt-3 shrink-0 space-y-2">
                    <button
                        onClick={handleDownloadCSV}
                        className="w-full flex items-center justify-center gap-2 py-3.5 bg-blue-500 hover:bg-blue-600 text-white font-black text-sm rounded-2xl active:scale-95 transition-all shadow-md shadow-blue-500/20"
                    >
                        <Download size={16} />
                        Descargar CSV (Excel)
                    </button>
                    <button
                        onClick={handleDownloadInventarioCSV}
                        className="w-full flex items-center justify-center gap-2 py-3.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-black text-sm rounded-2xl active:scale-95 transition-all"
                    >
                        <Package size={16} />
                        Descargar Inventario CSV
                    </button>
                </div>
            </div>
        </div>
    );
}
