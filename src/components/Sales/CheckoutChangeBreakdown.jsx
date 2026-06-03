import React from 'react';

// Formatea un número como peso colombiano: $ 12.500
const formatCOP = (val) => new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', minimumFractionDigits: 0
}).format(Math.round(val || 0));

export default function CheckoutChangeBreakdown({
    isPaid,
    changeUsd,       // Almacena COP change (campo heredado)
    remainingUsd,    // Almacena COP remaining (campo heredado)
    tasaCop,
}) {
    // Para el vuelto (cambio), redondeamos al múltiplo de 50 COP más cercano (regla de efectivo en Colombia)
    const displayVal = isPaid ? Math.round(changeUsd / 50) * 50 : remainingUsd;
    const usdVal = tasaCop ? (displayVal / tasaCop) : (displayVal / 4150);

    return (
        <div data-tour="checkout-remaining" className="px-3 py-2">
            <div className={`p-3.5 rounded-xl border-2 transition-all ${isPaid
                ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800'
                : 'bg-orange-50 border-orange-200 dark:bg-orange-950/20 dark:border-orange-800'
                }`}>
                <p className={`text-[10px] font-black uppercase tracking-widest mb-1 ${isPaid ? 'text-emerald-500' : 'text-orange-500'}`}>
                    {isPaid ? 'Vuelto' : 'Falta por Cobrar'}
                </p>
                <div className="flex items-end justify-between gap-4">
                    <span className={`text-2xl font-black ${isPaid ? 'text-emerald-600 dark:text-emerald-400' : 'text-orange-600 dark:text-orange-400'}`}>
                        {formatCOP(displayVal)} <span className="text-xs font-black">COP</span>
                    </span>
                    {tasaCop > 0 && (
                        <span className="text-xs font-bold text-slate-500 dark:text-slate-400 pb-1 shrink-0">
                            ≈ ${usdVal.toFixed(2)} USD
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
}
