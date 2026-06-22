import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { formatCop } from '../../utils/calculatorUtils';
import { EPSILON } from '../../hooks/useCheckoutPayments';
import { useBackdropClose } from '../../hooks/useBackdropClose';

export function FiarConfirmModal({
    confirmFiar, setConfirmFiar,
    remainingUsd,
    selectedCustomer, totalPaidUsd,
    handleConfirm,
}) {
    // Cierre agnóstico a mouse/táctil (pointerdown→pointerup sobre el fondo).
    const backdropClose = useBackdropClose(() => setConfirmFiar(false));

    if (!confirmFiar) return null;

    return (
        <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
            {...backdropClose}
        >
            <div
                className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 max-w-sm md:max-w-md w-full shadow-2xl border border-slate-200 dark:border-slate-800"
            >
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
                        <p className="text-3xl sm:text-4xl font-black text-amber-600">{formatCop(remainingUsd)}</p>
                    </div>
                    <div className="border-t border-amber-200/50 dark:border-amber-800/20 pt-3 space-y-2">
                        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300">
                            Se registrará como deuda a nombre de <span className="font-black text-slate-800 dark:text-white">{selectedCustomer?.name}</span>.
                        </p>
                        {totalPaidUsd > EPSILON && (
                            <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
                                El cliente abona <span className="font-bold text-emerald-600">{formatCop(totalPaidUsd)}</span> ahora y el restante queda pendiente.
                            </p>
                        )}
                        {totalPaidUsd <= EPSILON && (
                            <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
                                El monto total de la venta quedará como deuda del cliente.
                            </p>
                        )}
                        {selectedCustomer && (selectedCustomer.deuda || 0) > EPSILON && (
                            <div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/30 rounded-lg p-2.5 mt-2">
                                <p className="text-[11px] sm:text-xs font-bold text-red-600 dark:text-red-400">
                                    Este cliente ya tiene una deuda de {formatCop(selectedCustomer.deuda || 0)}. La deuda total pasará a ser {formatCop((selectedCustomer.deuda || 0) + remainingUsd)}.
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
    // Cierre agnóstico a mouse/táctil (pointerdown→pointerup sobre el fondo).
    const backdropClose = useBackdropClose(() => setOverpayAlertData(null));

    if (!overpayAlertData) return null;
    const d = overpayAlertData;

    const title    = '¿Monto correcto?';
    const subtitle = `El pago es ${d.ratio}× el total de la compra`;

    return (
        <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
            {...backdropClose}
        >
            <div
                className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 max-w-sm md:max-w-md w-full shadow-2xl border border-slate-200 dark:border-slate-800"
            >
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
                        <span className="text-base font-black text-slate-800 dark:text-white">{formatCop(cartTotalUsd)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-sm text-slate-500 dark:text-slate-400">Monto ingresado</span>
                        <span className="text-base font-black text-red-600">
                            {formatCop(totalPaidUsd)}
                        </span>
                    </div>
                    <div className="border-t border-red-200/50 dark:border-red-800/20 pt-3">
                        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 text-center">
                            ¿Seguro que el cliente pagó <span className="font-black text-red-600">{formatCop(totalPaidUsd)}</span> por una compra de <span className="font-black text-slate-800 dark:text-white">{formatCop(cartTotalUsd)}</span>?
                        </p>
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
