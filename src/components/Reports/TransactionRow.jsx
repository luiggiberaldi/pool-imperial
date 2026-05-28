import { useMemo } from 'react';
import { formatBs } from '../../utils/calculatorUtils';
import { getPaymentLabel, getPaymentMethod, PAYMENT_ICONS, toTitleCase, getPaymentIcon } from '../../config/paymentMethods';
import { generateTicketPDF } from '../../utils/ticketGenerator';
import { ChevronDown, ChevronUp, Send, Ban, Shuffle, Clock, Recycle, LockIcon, Printer, User, UserCheck } from 'lucide-react';

export default function TransactionRow({
    sale: s, bcvRate, isExpanded, onToggle, onVoidSale, onRecycleSale,
    onShareWhatsApp, onDownloadPDF, onRequestClientForTicket, onPrintTicket, isAdmin
}) {
    const d = new Date(s.timestamp);

    const { methodLabel, PayMethodIcon } = useMemo(() => {
        let label = 'Efectivo';
        let icon = PAYMENT_ICONS['efectivo_bs'];

        if (s.tipo === 'VENTA_FIADA') {
            label = 'Por Cobrar';
            icon = Clock;
        } else if (s.payments && s.payments.length === 1) {
            label = toTitleCase(s.payments[0].methodLabel);
            const m = getPaymentMethod(s.payments[0].methodId);
            if (m) icon = getPaymentIcon(m.id) || m.Icon || null;
        } else if (s.payments && s.payments.length > 1) {
            label = 'Pago Mixto';
            icon = Shuffle;
        } else if (s.paymentMethod) {
            const m = getPaymentMethod(s.paymentMethod);
            if (m) {
                label = toTitleCase(m.label);
                icon = getPaymentIcon(m.id) || m.Icon || null;
            }
        }

        return { methodLabel: label, PayMethodIcon: icon };
    }, [s.tipo, s.payments, s.paymentMethod]);

    const isCanceled = s.status === 'ANULADA';
    const dateLabel = d.toLocaleDateString('es-VE', { day: '2-digit', month: 'short' });
    const saleRate = s.rate || bcvRate;

    const handleShare = (e) => {
        e.stopPropagation();
        if (onShareWhatsApp) {
            if (!s.customerName || s.customerName === 'Consumidor Final') {
                if (onRequestClientForTicket) { onRequestClientForTicket(s); return; }
            }
            onShareWhatsApp(s);
            return;
        }
        let text = `*COMPROBANTE | PRECIOS AL DIA*\n`;
        text += `Orden: #${s.id.substring(0, 6).toUpperCase()}\n`;
        text += `Fecha: ${d.toLocaleString('es-VE')}\n`;
        text += `================================\n`;
        if (s.items && s.items.length > 0) {
            s.items.forEach(item => {
                const qty = item.isWeight ? `${item.qty.toFixed(3)}Kg` : `${item.qty} Und`;
                text += `- ${item.name} ${qty} x $${item.priceUsd.toFixed(2)} = *$${(item.priceUsd * item.qty).toFixed(2)}*\n`;
            });
        }
        text += `\n*TOTAL: $${(s.totalUsd || 0).toFixed(2)}*\n`;
        text += `Ref: ${formatBs(s.totalBs || 0)} Bs\n`;
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
    };

    const handlePDF = (e) => {
        e.stopPropagation();
        if (onDownloadPDF) { onDownloadPDF(s); return; }
        generateTicketPDF(s, bcvRate);
    };

    return (
        <div className={`rounded-xl border transition-all ${isCanceled ? 'bg-red-50/50 border-red-100/50 dark:bg-red-900/10 dark:border-red-900/20' : 'bg-white dark:bg-slate-800/50 border-slate-200/60 dark:border-slate-700/60'} overflow-hidden`}>
            {/* Collapsed row */}
            <div
                className="flex items-center gap-3 p-3 cursor-pointer select-none active:bg-slate-100 dark:active:bg-slate-800"
                onClick={onToggle}
            >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${isCanceled ? 'bg-red-100 opacity-50' : 'bg-slate-50 dark:bg-slate-700 shadow-sm'}`}>
                    {isCanceled ? <Ban size={20} className="text-red-400" /> : (PayMethodIcon ? <PayMethodIcon size={20} className="text-slate-500" /> : <span className="text-xl">$</span>)}
                </div>
                <div className="flex-1 min-w-0">
                    <p className={`text-sm font-bold flex items-center gap-1.5 truncate ${isCanceled ? 'line-through text-slate-400' : 'text-slate-800 dark:text-slate-200'}`}>
                        {s.customerName || 'Consumidor Final'}
                        {s.tipo === 'VENTA_FIADA' && <span className="text-[9px] bg-amber-100 text-amber-600 px-1 rounded uppercase">Fiado</span>}
                        {isCanceled && <span className="text-[9px] bg-red-100 text-red-500 px-1 rounded uppercase">Anulada</span>}
                    </p>
                    <p className="text-[11px] text-slate-500 flex items-center gap-1 flex-wrap">
                        {(() => { const n = Number(s.saleNumber); return (Number.isInteger(n) && n > 0 && n < 90000) ? <><span className="text-[#0EA5E9] font-black">{`#${String(n).padStart(7, '0')}`}</span><span>·</span></> : null; })()}
                        {s.tableName && <><span className="text-[9px] bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded font-bold uppercase">{s.tableName}</span><span>·</span></>}
                        <span>{dateLabel}</span> · <span>{d.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}</span> · <span>{methodLabel}</span>
                    </p>
                </div>
                <div className="text-right shrink-0">
                    <p className={`text-sm font-black ${isCanceled ? 'text-slate-400' : 'text-slate-800 dark:text-white'}`}>${(s.totalUsd || 0).toFixed(2)}</p>
                    <p className="text-[11px] text-slate-400 font-medium">{formatBs(s.totalBs || 0)} Bs</p>
                    <div className="flex justify-end mt-0.5">
                        {isExpanded ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
                    </div>
                </div>
            </div>

            {/* Expanded detail */}
            {isExpanded && (
                <div className="px-3 pb-3 pt-1 border-t border-slate-200 dark:border-slate-700/50 text-sm animate-in fade-in slide-in-from-top-1">

                    {/* PRODUCTOS */}
                    {s.items && s.items.length > 0 ? (
                        <div className="mb-3 pt-2">
                            <p className="text-[10px] font-bold uppercase text-slate-400 tracking-wider mb-1.5">Productos ({s.items.length})</p>
                            <div className="space-y-1">
                                {s.items.map((item, i) => (
                                    <div key={i} className={`flex justify-between items-center text-xs ${isCanceled ? 'text-slate-400 line-through' : 'text-slate-600 dark:text-slate-300'}`}>
                                        <span className="truncate pr-2">{item.isWeight ? `${item.qty.toFixed(3)}kg` : `${item.qty}u`} {item.name}</span>
                                        <span className="font-medium shrink-0">${(item.priceUsd * item.qty).toFixed(2)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <p className="text-xs text-slate-400 mb-3 pt-2">Pago de Deudas (Sin productos)</p>
                    )}

                    {/* RESUMEN DE COBRO */}
                    <div className="mb-3 bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-lg p-2.5">
                        <p className="text-[10px] font-bold uppercase text-slate-400 tracking-wider mb-1.5">Resumen de Cobro</p>
                        <div className="space-y-1 text-xs">
                            <div className="flex justify-between text-slate-600 dark:text-slate-300">
                                <span>Total en Bs</span>
                                <span className="font-bold">{formatBs(s.totalBs || 0)} Bs</span>
                            </div>
                            <div className="flex justify-between text-slate-400">
                                <span>Tasa BCV aplicada</span>
                                <span className="font-medium">{formatBs(saleRate)} Bs/$</span>
                            </div>
                            {s.tasaCop > 0 && (
                                <div className="flex justify-between text-slate-400">
                                    <span>Total en COP</span>
                                    <span className="font-medium">{(s.totalCop || (s.totalUsd * s.tasaCop)).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} COP</span>
                                </div>
                            )}
                            {s.discountAmountUsd > 0 && (
                                <div className="flex justify-between text-amber-500">
                                    <span>Descuento</span>
                                    <span className="font-bold">-${s.discountAmountUsd.toFixed(2)}</span>
                                </div>
                            )}
                            {(s.changeUsd > 0 || s.changeBs > 0) && (
                                <div className="flex justify-between text-emerald-500">
                                    <span>Vuelto entregado</span>
                                    <span className="font-bold">
                                        {s.changeUsd > 0 && `$${s.changeUsd.toFixed(2)}`}
                                        {s.changeUsd > 0 && s.changeBs > 0 && ' + '}
                                        {s.changeBs > 0 && `${formatBs(s.changeBs)} Bs`}
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* PAGOS RECIBIDOS */}
                    {s.payments && s.payments.length > 0 && (
                        <div className="mb-3">
                            <p className="text-[10px] font-bold uppercase text-slate-400 tracking-wider mb-1.5">Pagos Recibidos</p>
                            <div className="space-y-1 text-xs">
                                {s.payments.map((p, i) => {
                                    const label = toTitleCase(p.methodLabel || p.methodId);
                                    const isBs = p.currency === 'BS';
                                    const isCop = p.currency === 'COP';
                                    const amount = p.amountInput || p.amount || (isBs ? p.amountBs : isCop ? (p.amountInput || p.amountUsd * (s.tasaCop || 1)) : p.amountUsd);
                                    const suffix = isBs ? ' Bs' : isCop ? ' COP' : '';
                                    const prefix = (!isBs && !isCop) ? '$' : '';
                                    return (
                                        <div key={i} className="flex justify-between text-slate-600 dark:text-slate-300">
                                            <span>{label}</span>
                                            <span className="font-bold">{prefix}{isBs ? formatBs(amount) : isCop ? amount.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : (amount || 0).toFixed(2)}{suffix}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* ATENDIDO POR / FACTURADO POR */}
                    {(s.vendedorNombre || s.meseroNombre) && (
                        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                            {s.meseroNombre && (
                                <span className="flex items-center gap-1">
                                    <UserCheck size={12} className="text-indigo-400" />
                                    <span className="text-slate-400">Atendió:</span>
                                    <span className="font-bold text-slate-600 dark:text-slate-300">{s.meseroNombre}</span>
                                </span>
                            )}
                            {s.vendedorNombre && (
                                <span className="flex items-center gap-1">
                                    <User size={12} className="text-emerald-400" />
                                    <span className="text-slate-400">Facturó:</span>
                                    <span className="font-bold text-slate-600 dark:text-slate-300">{s.vendedorNombre}</span>
                                </span>
                            )}
                        </div>
                    )}

                    {/* ACTION BUTTONS */}
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                        <button
                            onClick={handleShare}
                            className="flex-1 min-w-[120px] whitespace-nowrap py-2 font-bold rounded-lg transition-colors flex justify-center items-center gap-1.5 text-xs shadow-sm bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-200 active:scale-95"
                        >
                            <Send size={14} /> Compartir
                        </button>
                        <button
                            onClick={handlePDF}
                            className="py-2 px-3 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 hover:bg-blue-200 font-bold rounded-lg transition-colors flex justify-center items-center gap-1.5 text-xs shadow-sm active:scale-95"
                        >
                            PDF
                        </button>
                        {onPrintTicket && (
                            <button
                                onClick={(e) => { e.stopPropagation(); onPrintTicket(s); }}
                                className="py-2 px-3 bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 hover:bg-violet-200 hover:dark:bg-violet-900/50 font-bold rounded-lg transition-colors flex justify-center items-center gap-1.5 text-xs shadow-sm active:scale-95"
                                title="Imprimir ticket"
                            >
                                <Printer size={14} />
                            </button>
                        )}
                        {!isCanceled && onVoidSale && !s.cajaCerrada && (isAdmin !== false) && (
                            <button
                                onClick={(e) => { e.stopPropagation(); onVoidSale(s); }}
                                className="py-2 px-3 bg-slate-100 dark:bg-slate-900 text-red-600 dark:text-red-400 hover:bg-red-50 hover:dark:bg-red-900/30 font-bold rounded-lg transition-colors flex justify-center items-center gap-1.5 text-xs border border-slate-200 dark:border-slate-800 shadow-sm active:scale-95"
                            >
                                <Ban size={14} /> Anular
                            </button>
                        )}
                        {!isCanceled && s.cajaCerrada && (
                            <div title="Venta protegida por Cierre de Caja" className="py-2 px-3 bg-slate-50 dark:bg-slate-900 text-slate-400 font-bold rounded-lg flex justify-center items-center gap-1.5 text-[10px] uppercase border border-slate-100 dark:border-slate-800 tracking-wider cursor-not-allowed">
                                <LockIcon size={12} /> Cerrada
                            </div>
                        )}
                        {onRecycleSale && s.items && s.items.length > 0 && (
                            <button
                                onClick={(e) => { e.stopPropagation(); onRecycleSale(s); }}
                                className="py-2 px-3 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 hover:bg-indigo-200 hover:dark:bg-indigo-900/50 font-bold rounded-lg transition-colors flex justify-center items-center gap-1.5 text-xs shadow-sm active:scale-95"
                            >
                                <Recycle size={14} />
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
