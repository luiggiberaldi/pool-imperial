import React from 'react';
import { AlertTriangle, Users } from 'lucide-react';
import { formatBs } from '../../utils/calculatorUtils';
import { EPSILON } from '../../hooks/useCheckoutPayments';

export function FiarConfirmModal({
    confirmFiar, setConfirmFiar,
    remainingUsd, remainingBs,
    selectedCustomer, totalPaidUsd,
    handleConfirm,
}) {
    if (!confirmFiar) return null;
    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setConfirmFiar(false)}>
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 max-w-sm md:max-w-md w-full shadow-2xl border border-slate-200 dark:border-slate-800" onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-4 mb-5">
                    <div className="w-12 h-12 sm:w-14 sm:h-14 bg-amber-100 dark:bg-amber-900/30 rounded-2xl flex items-center justify-center shrink-0">
                        <AlertTriangle size={24} className="text-amber-600 sm:w-7 sm:h-7" />
                    </div>
                    <div>
                        <h3 className="text-lg sm:text-xl font-black text-slate-800 dark:text-white">Confirmar Fiado</h3>
                        <p className="text-xs sm:text-sm text-slate-400 mt-0.5">Revisa los detalles antes de continuar</p>
                    </div>
                </div>
                <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/30 rounded-2xl p-4 sm:p-5 mb-5">
                    <div className="text-center mb-3">
                        <p className="text-[11px] sm:text-xs font-bold text-amber-500 uppercase tracking-widest mb-1">Monto a fiar</p>
                        <p className="text-3xl sm:text-4xl font-black text-amber-600">${remainingUsd.toFixed(2)}</p>
                        <p className="text-sm sm:text-base font-bold text-amber-500/70 mt-0.5">{formatBs(remainingBs)} Bs</p>
                    </div>
                    <div className="border-t border-amber-200/50 dark:border-amber-800/20 pt-3 space-y-2">
                        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300">
                            Se registrara como deuda a nombre de <span className="font-black text-slate-800 dark:text-white">{selectedCustomer?.name}</span>.
                        </p>
                        {totalPaidUsd > EPSILON && (
                            <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
                                El cliente abona <span className="font-bold text-emerald-600">${totalPaidUsd.toFixed(2)}</span> ahora y el restante queda pendiente.
                            </p>
                        )}
                        {totalPaidUsd <= EPSILON && (
                            <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
                                El monto total de la venta quedara como deuda del cliente.
                            </p>
                        )}
                        {selectedCustomer && (selectedCustomer.deuda || 0) > EPSILON && (
                            <div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/30 rounded-lg p-2.5 mt-2">
                                <p className="text-[11px] sm:text-xs font-bold text-red-600 dark:text-red-400">
                                    Este cliente ya tiene una deuda de ${(selectedCustomer.deuda || 0).toFixed(2)}. La deuda total pasara a ser ${((selectedCustomer.deuda || 0) + remainingUsd).toFixed(2)}.
                                </p>
                            </div>
                        )}
                    </div>
                </div>
                <div className="flex gap-3">
                    <button onClick={() => setConfirmFiar(false)}
                        className="flex-1 py-3.5 sm:py-4 font-bold text-sm sm:text-base text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-95 transition-all">
                        Cancelar
                    </button>
                    <button onClick={() => { setConfirmFiar(false); handleConfirm(); }}
                        className="flex-1 py-3.5 sm:py-4 font-black text-sm sm:text-base text-white bg-amber-500 hover:bg-amber-600 rounded-xl shadow-lg shadow-amber-500/25 active:scale-95 transition-all">
                        Confirmar fiado
                    </button>
                </div>
            </div>
        </div>
    );
}

export function OverpayAlertModal({
    overpayAlertData, setOverpayAlertData,
    confirmOverpay, cartTotalUsd, totalPaidUsd,
}) {
    if (!overpayAlertData) return null;
    const d = overpayAlertData;
    const isCurrency = d.type === 'currency';
    const isRound    = d.type === 'round';

    const title    = isCurrency ? '¿Te equivocaste de campo?' : isRound ? '¿Número por error?' : '¿Monto correcto?';
    const subtitle = isCurrency
        ? `Parece que ingresaste bolívares en el campo de ${d.methodLabel}`
        : isRound
        ? 'El monto parece un número redondeado por error'
        : `El pago es ${d.ratio}× el total de la compra`;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setOverpayAlertData(null)}>
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 max-w-sm md:max-w-md w-full shadow-2xl border border-slate-200 dark:border-slate-800" onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-4 mb-5">
                    <div className="w-12 h-12 sm:w-14 sm:h-14 bg-red-100 dark:bg-red-900/30 rounded-2xl flex items-center justify-center shrink-0">
                        <AlertTriangle size={24} className="text-red-600 sm:w-7 sm:h-7" />
                    </div>
                    <div>
                        <h3 className="text-lg sm:text-xl font-black text-slate-800 dark:text-white">{title}</h3>
                        <p className="text-xs sm:text-sm text-slate-400 mt-0.5">{subtitle}</p>
                    </div>
                </div>

                <div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/30 rounded-2xl p-4 sm:p-5 mb-5 space-y-3">
                    <div className="flex justify-between items-center">
                        <span className="text-sm text-slate-500 dark:text-slate-400">Total de la compra</span>
                        <span className="text-base font-black text-slate-800 dark:text-white">${cartTotalUsd.toFixed(2)}</span>
                    </div>
                    {isCurrency && (
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-slate-500 dark:text-slate-400">Total en Bs</span>
                            <span className="text-base font-black text-slate-800 dark:text-white">{formatBs(d.expectedBs)}</span>
                        </div>
                    )}
                    <div className="flex justify-between items-center">
                        <span className="text-sm text-slate-500 dark:text-slate-400">Monto ingresado</span>
                        <span className="text-base font-black text-red-600">
                            {isCurrency ? formatBs(d.enteredAmount) : `$${totalPaidUsd.toFixed(2)}`}
                        </span>
                    </div>
                    <div className="border-t border-red-200/50 dark:border-red-800/20 pt-3">
                        {isCurrency ? (
                            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 text-center">
                                Ingresaste <span className="font-black text-red-600">{formatBs(d.enteredAmount)}</span> en el campo de dólares.
                                El total en Bs sería <span className="font-black text-slate-800 dark:text-white">{formatBs(d.expectedBs)}</span>.
                            </p>
                        ) : isRound ? (
                            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 text-center">
                                ¿Seguro que el cliente pagó <span className="font-black text-red-600">${totalPaidUsd.toFixed(2)}</span> por una compra de <span className="font-black text-slate-800 dark:text-white">${cartTotalUsd.toFixed(2)}</span>?
                            </p>
                        ) : (
                            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 text-center">
                                ¿Seguro que el cliente pagó <span className="font-black text-red-600">${totalPaidUsd.toFixed(2)}</span> por una compra de <span className="font-black text-slate-800 dark:text-white">${cartTotalUsd.toFixed(2)}</span>?
                            </p>
                        )}
                    </div>
                </div>

                <div className="flex gap-3">
                    <button onClick={() => setOverpayAlertData(null)}
                        className="flex-1 py-3.5 sm:py-4 font-bold text-sm sm:text-base text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-95 transition-all">
                        Corregir monto
                    </button>
                    <button onClick={confirmOverpay}
                        className="flex-1 py-3.5 sm:py-4 font-black text-sm sm:text-base text-white bg-red-500 hover:bg-red-600 rounded-xl shadow-lg shadow-red-500/25 active:scale-95 transition-all">
                        Sí, confirmar
                    </button>
                </div>
            </div>
        </div>
    );
}
