import React from 'react';
import { CheckCircle, Wallet, Send, X, Printer } from 'lucide-react';
import { useTablesStore } from '../../hooks/store/useTablesStore';
import { formatCop, formatPaymentAmount } from '../../utils/calculatorUtils';
import { printThermalTicket } from '../../utils/ticketGenerator';

export default function ReceiptModal({ receipt, onClose, onShareWhatsApp }) {
    if (!receipt) return null;

    const priorAbonoPayments = (receipt.payments || []).filter(p => p.isAbonoPrevio === true);
    const hasPriorAbonos = priorAbonoPayments.length > 0;
    const priorAbonoTotal = hasPriorAbonos
        ? priorAbonoPayments.reduce((s, p) => s + (p.amountUsd || p.amountCOP || 0), 0)
        : 0;
    const netPaid = Math.max(0, receipt.totalUsd - priorAbonoTotal);

    return (
        <div className="fixed inset-0 z-[60] bg-slate-900/80 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="bg-white w-full sm:max-w-sm md:max-w-md sm:rounded-[2rem] rounded-t-[2rem] shadow-2xl animate-in zoom-in-95 duration-300 overflow-hidden relative flex flex-col max-h-[95vh] sm:max-h-[90vh]">

                {/* Botón X cerrar — siempre visible */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 z-30 w-8 h-8 bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-700 rounded-full flex items-center justify-center transition-all active:scale-90"
                    title="Cerrar"
                >
                    <X size={18} />
                </button>

                {/* Contenido scrollable */}
                <div className="flex-1 overflow-y-auto overscroll-contain">
                    {/* Bordes serrados efecto ticket */}
                    <div className="h-4 bg-white shrink-0" style={{ backgroundImage: 'radial-gradient(circle at 10px 0, transparent 10px, white 10px)', backgroundSize: '20px 20px' }}></div>

                    <div className="p-6 sm:p-8 pt-8 sm:pt-10 text-center bg-white border-b-2 border-dashed border-slate-200">
                        <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4 relative">
                            <CheckCircle size={36} className="text-emerald-500 relative z-10" />
                            <div className="absolute inset-0 bg-emerald-400 rounded-full animate-ping opacity-20"></div>
                        </div>
                        <h3 className="text-2xl font-black text-slate-800 tracking-tight mb-1">Orden #{receipt.saleNumber ? String(receipt.saleNumber).padStart(7, '0') : (receipt.id.substring(0, 6)).toUpperCase()}</h3>
                        {receipt.tableName && (
                            <p className="text-sm font-bold text-blue-500 mb-1">Mesa {receipt.tableName}</p>
                        )}
                        {receipt.customerName && <p className="text-sm font-bold text-slate-500 mb-0 uppercase tracking-tight">{receipt.customerName}</p>}
                        {receipt.customerDocument && (
                            <p className="text-xs font-bold text-slate-400 mb-2 uppercase tracking-wide">
                                NIT/C.C.: {receipt.customerDocument}
                            </p>
                        )}
                        {hasPriorAbonos ? (
                            <>
                                <p className="text-4xl font-black text-emerald-600 mb-1 tracking-tighter">{formatCop(netPaid)}</p>
                                <p className="text-xs font-black text-slate-400 uppercase tracking-wide">Neto Pagado en Cierre</p>
                                <div className="text-xs font-bold text-slate-500 mt-2">
                                    Consumo: {formatCop(receipt.totalUsd)} &nbsp;·&nbsp; Abonos: -{formatCop(priorAbonoTotal)}
                                </div>
                            </>
                        ) : (
                            <p className="text-4xl font-black text-slate-900 mb-1 tracking-tighter">{formatCop(receipt.totalUsd)}</p>
                        )}

                        <div className="inline-flex items-center flex-wrap justify-center gap-1.5 px-3 py-1 bg-slate-100 rounded-full text-xs font-bold text-slate-600 mt-3.5">
                            {receipt.payments && receipt.payments.map((p, i) => (
                                <span key={p.id} className="flex items-center gap-1">
                                    <Wallet size={12} className={p.isAbonoPrevio ? 'text-red-500' : 'text-slate-400'} />
                                    <span className={p.isAbonoPrevio ? 'text-red-600 font-bold' : ''}>{p.methodLabel}</span>
                                    {i < receipt.payments.length - 1 ? ' • ' : ''}
                                </span>
                            ))}
                        </div>
                    </div>

                    <div className="bg-slate-50 px-6 sm:px-8 py-6">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Detalle de Consumo</p>
                        <div className="space-y-3">
                            {receipt.items.map((item, i) => (
                                <div key={i} className="flex justify-between items-start text-sm border-b border-slate-200/50 pb-2 last:border-0 last:pb-0">
                                    <div className="flex-1 pr-4">
                                        <span className="font-bold text-slate-700 block leading-tight">{item.name}</span>
                                        <span className="text-xs text-slate-400">{item.isWeight ? `${item.qty.toFixed(3)} Kg` : `${item.qty} u`} × {formatCop(item.priceUsd)}</span>
                                    </div>
                                    <span className="font-black text-slate-900">{formatCop(item.priceUsd * item.qty)}</span>
                                </div>
                            ))}
                        </div>

                        {/* Descuento aplicado */}
                        {receipt.discountAmountUsd > 0 && (
                            <div className="mt-4 pt-3.5 border-t border-slate-200 text-xs text-slate-500 space-y-1.5">
                                <div className="flex justify-between">
                                    <span>Subtotal:</span>
                                    <span className="font-bold text-slate-600">{formatCop(receipt.cartSubtotalUsd || (receipt.totalUsd + receipt.discountAmountUsd))}</span>
                                </div>
                                <div className="flex justify-between font-black text-red-500">
                                    <span>{receipt.discountType === 'percentage' ? `Descuento (${receipt.discountValue}%):` : 'Descuento:'}</span>
                                    <span>-{formatCop(receipt.discountAmountUsd)}</span>
                                </div>
                            </div>
                        )}

                        {/* Desglose de IVA y otros impuestos dinámico */}
                        {receipt.ivaAmount > 0 && (
                            <div className="mt-4 pt-3.5 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500 space-y-1.5 select-none animate-in fade-in">
                                <div className="flex justify-between">
                                    <span>Subtotal Base (excl. Impuestos):</span>
                                    <span className="font-bold text-slate-600 dark:text-slate-400">{formatCop(receipt.totalUsd - receipt.ivaAmount)}</span>
                                </div>
                                {receipt.taxBreakdown && Object.entries(receipt.taxBreakdown).map(([taxKey, taxVal]) => {
                                    if (taxVal <= 0) return null;
                                    const config = useTablesStore.getState().config;
                                    const taxLabel = taxKey === 'iva_19' ? `IVA (${config?.taxRateIva ?? 19}%)` : taxKey === 'impoconsumo_8' ? `Impoconsumo (${config?.taxRateImpoconsumo ?? 8}%)` : taxKey;
                                    return (
                                        <div key={taxKey} className="flex justify-between font-black text-slate-700 dark:text-slate-300">
                                            <span>{taxLabel}:</span>
                                            <span>{formatCop(taxVal)}</span>
                                        </div>
                                    );
                                })}
                                {!receipt.taxBreakdown && (
                                    // Fallback retrocompatible para ventas antiguas
                                    <div className="flex justify-between font-black text-slate-700 dark:text-slate-300">
                                        <span>IVA ({receipt.ivaRate || 19}%):</span>
                                        <span>{formatCop(receipt.ivaAmount)}</span>
                                    </div>
                                )}
                            </div>
                        )}

                        {receipt.payments && receipt.payments.length > 0 && (
                            <div className="mt-4 pt-4 border-t border-slate-200 text-sm">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Pagos Recibidos</p>
                                {receipt.payments.map(p => (
                                    <div key={p.id} className={`flex justify-between mb-1 ${p.isAbonoPrevio ? 'text-red-600 font-semibold' : 'text-slate-600'}`}>
                                        <span className="flex items-center gap-1.5 flex-wrap">
                                            <span>{p.methodLabel}:</span>
                                            {p.reference && (
                                                <span className="text-[9px] font-mono bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-1.5 py-0.5 rounded leading-none">
                                                    Ref: {p.reference}
                                                </span>
                                            )}
                                        </span>
                                        <span className="font-bold">{formatPaymentAmount(p)}</span>
                                    </div>
                                ))}

                                {receipt.changeUsd > 0 && (
                                    <div className="mt-2 pt-2 border-t border-slate-200">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Vuelto Entregado</p>
                                        <div className="flex justify-between text-emerald-600 font-bold">
                                            <span>Cambio:</span>
                                            <span>{formatCop(receipt.changeUsd)}</span>
                                        </div>
                                    </div>
                                )}

                                {receipt.fiadoUsd > 0 && (
                                    <div className="flex justify-between text-amber-600 font-bold mt-2 pt-2 border-t border-slate-200">
                                        <span>Pendiente (Fiado):</span>
                                        <span>{formatCop(receipt.fiadoUsd)}</span>
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="mt-6 flex flex-col items-center gap-1">
                            <p className="text-center text-[10px] text-slate-400 uppercase tracking-wider font-bold">
                                {new Date(receipt.timestamp).toLocaleString()}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Botones de acción — diseño premium */}
                <div className="p-4 sm:p-5 bg-white flex gap-2.5 relative z-20 shrink-0 border-t border-slate-100">
                    {/* Imprimir */}
                    <button onClick={() => printThermalTicket(receipt, receipt.rate)}
                        className="flex-1 py-3.5 bg-gradient-to-b from-slate-700 to-slate-800 text-white font-bold rounded-2xl hover:from-slate-600 hover:to-slate-700 transition-all shadow-lg shadow-slate-800/20 hover:shadow-xl hover:shadow-slate-800/30 text-sm flex items-center justify-center gap-2 focus:outline-none active:scale-[0.97] hover:-translate-y-0.5">
                        <Printer size={17} strokeWidth={2.5} /> Imprimir
                    </button>

                    {/* WhatsApp */}
                    <button onClick={() => onShareWhatsApp(receipt)}
                        className="flex-1 py-3.5 bg-gradient-to-b from-emerald-500 to-emerald-600 text-white font-bold rounded-2xl hover:from-emerald-400 hover:to-emerald-500 transition-all shadow-lg shadow-emerald-500/25 hover:shadow-xl hover:shadow-emerald-500/35 text-sm flex items-center justify-center gap-2 focus:outline-none active:scale-[0.97] hover:-translate-y-0.5">
                        <Send size={17} strokeWidth={2.5} /> WhatsApp
                    </button>

                    {/* Nueva Venta — Primary CTA */}
                    <button onClick={onClose}
                        className="flex-[1.3] py-3.5 bg-gradient-to-b from-blue-500 to-blue-600 text-white font-extrabold rounded-2xl hover:from-blue-400 hover:to-blue-500 transition-all shadow-lg shadow-blue-500/25 hover:shadow-xl hover:shadow-blue-500/35 text-sm flex items-center justify-center gap-2 focus:outline-none active:scale-[0.97] hover:-translate-y-0.5 ring-2 ring-blue-400/30 ring-offset-2 ring-offset-white">
                        Nueva Venta
                    </button>
                </div>
            </div>
        </div>
    );
}
