import React from 'react';
import { X, ArrowDownRight, ArrowUpRight, CheckCircle2, Save } from 'lucide-react';
import { procesarImpactoCliente } from '../../utils/financialLogic';
import CustomSelect from '../CustomSelect';

export default function TransactionModal({
    transactionModal,
    setTransactionModal,
    transactionAmount,
    setTransactionAmount,
    paymentMethod,
    setPaymentMethod,
    activePaymentMethods,
    handleTransaction
}) {
    if (!transactionModal.isOpen || !transactionModal.customer) return null;

    // Calcular preview del saldo resultante en tiempo real
    const rawAmt = parseFloat(transactionAmount) || 0;
    const currentCustomer = transactionModal.customer;

    let previewCustomer = null;
    if (rawAmt > 0) {
        const opts = transactionModal.type === 'ABONO'
            ? { costoTotal: 0, pagoReal: rawAmt, vueltoParaMonedero: rawAmt }
            : { esCredito: true, deudaGenerada: rawAmt };
        previewCustomer = procesarImpactoCliente(currentCustomer, opts);
    }

    // Saldo actual legible
    const saldoActualUsd = (currentCustomer.favor || 0) - (currentCustomer.deuda || 0);
    const saldoPreviewUsd = previewCustomer ? (previewCustomer.favor || 0) - (previewCustomer.deuda || 0) : saldoActualUsd;

    const formatSaldo = (val) => {
        const formatted = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(Math.round(Math.abs(val)));
        if (val > 0.001) return { text: `+${formatted}`, label: 'a favor', color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800/30' };
        if (val < -0.001) return { text: `-${formatted}`, label: 'debe', color: 'text-red-500', bg: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/30' };
        return { text: '$ 0', label: 'al día', color: 'text-slate-500', bg: 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700' };
    };

    const saldoActual = formatSaldo(saldoActualUsd);
    const saldoPreview = formatSaldo(saldoPreviewUsd);

    const filteredMethods = activePaymentMethods.filter(m => m.currency === 'COP');

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-t-3xl sm:rounded-3xl shadow-xl overflow-hidden animate-in slide-in-from-bottom-10 sm:zoom-in-95 duration-200">
                <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
                    <h3 className="text-xl font-black text-slate-800 dark:text-white">Ajustar Cuenta</h3>
                    <button onClick={() => setTransactionModal({ isOpen: false, type: null, customer: null })} className="p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-5 space-y-4">
                    {/* Cliente + Saldo Actual */}
                    <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                            <strong className="text-slate-900 dark:text-white">{currentCustomer.name}</strong>
                        </p>
                        <span className={`text-sm font-black ${saldoActual.color}`}>{saldoActual.text} <span className="text-[10px] font-bold opacity-70">({saldoActual.label})</span></span>
                    </div>

                    {/* Tipo de operacion */}
                    <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                        <button
                            type="button"
                            onClick={() => { setTransactionModal(m => ({ ...m, type: 'CREDITO' })); setTransactionAmount(''); }}
                            className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${transactionModal.type === 'CREDITO' ? 'bg-white dark:bg-slate-900 shadow-sm text-red-500' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                        >
                            <ArrowDownRight size={16} /> Agregar Deuda
                        </button>
                        <button
                            type="button"
                            onClick={() => { setTransactionModal(m => ({ ...m, type: 'ABONO' })); setTransactionAmount(''); }}
                            className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${transactionModal.type === 'ABONO' ? 'bg-white dark:bg-slate-900 shadow-sm text-emerald-500' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                        >
                            <ArrowUpRight size={16} /> Recibir Abono
                        </button>
                    </div>

                    {/* Input de monto */}
                    <div>
                        <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-lg text-amber-500">$</span>
                            <input
                                type="number"
                                value={transactionAmount}
                                onChange={(e) => setTransactionAmount(e.target.value)}
                                placeholder="0"
                                className="w-full form-input bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-4 pl-10 text-2xl font-black text-slate-800 dark:text-white focus:ring-2 focus:ring-blue-500/50 transition-all"
                                autoFocus
                            />
                        </div>
                        {/* Boton Pagar Total — solo cuando hay deuda y es ABONO */}
                        {transactionModal.type === 'ABONO' && (currentCustomer.deuda || 0) > 0.01 && (
                            <button
                                type="button"
                                onClick={() => {
                                    setTransactionAmount(Math.round(currentCustomer.deuda).toString());
                                }}
                                className="mt-2 w-full py-2 text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/30 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-all active:scale-95 flex items-center justify-center gap-1.5"
                            >
                                <CheckCircle2 size={14} />
                                Pagar Total: {new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(Math.round(currentCustomer.deuda))}
                            </button>
                        )}
                    </div>

                    {/* Metodo de pago (solo para abonos) */}
                    {transactionModal.type === 'ABONO' && (
                        <div>
                            <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Método de Pago</label>
                            <CustomSelect
                                value={filteredMethods.some(m => m.id === paymentMethod) ? paymentMethod : (filteredMethods[0]?.id || '')}
                                onChange={(e) => setPaymentMethod(e.target.value)}
                                className="w-full form-select bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-sm font-bold text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-blue-500/50 transition-all"
                            >
                                {filteredMethods.map(method => {
                                    const emoji = typeof method.icon === 'string' && method.icon.length <= 2 ? method.icon : '';
                                    return (
                                    <option key={method.id} value={method.id}>
                                        {emoji ? `${emoji} ${method.label}` : method.label}
                                    </option>
                                    );
                                })}
                            </CustomSelect>
                        </div>
                    )}

                    {/* PREVIEW del saldo resultante */}
                    {rawAmt > 0 && previewCustomer && (
                        <div className={`border rounded-xl p-3 ${saldoPreview.bg} transition-all`}>
                            <p className="text-[10px] font-bold text-slate-400 uppercase mb-1.5">Cuenta después de esta operación</p>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-slate-400 line-through">{saldoActual.text}</span>
                                    <span className="text-slate-300 dark:text-slate-600">→</span>
                                </div>
                                <span className={`text-lg font-black ${saldoPreview.color}`}>
                                    {saldoPreview.text}
                                </span>
                            </div>
                        </div>
                    )}

                </div>

                <div className="p-5 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                    <button
                        onClick={handleTransaction}
                        disabled={!transactionAmount || parseFloat(transactionAmount) <= 0}
                        className={`w-full py-3.5 text-white font-bold rounded-xl active:scale-95 transition-all text-sm flex justify-center items-center gap-2 ${transactionModal.type === 'ABONO'
                            ? 'bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-500/50'
                            : 'bg-red-500 hover:bg-red-600 disabled:bg-red-500/50'
                            }`}
                    >
                        <Save size={18} />
                        {transactionModal.type === 'ABONO'
                            ? `Abonar ${new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(rawAmt)}`
                            : `Cargar Deuda ${new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(rawAmt)}`
                        }
                    </button>
                </div>
            </div>
        </div>
    );
}
