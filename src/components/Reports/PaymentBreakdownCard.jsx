import { formatBs } from '../../utils/calculatorUtils';
import { getPaymentLabel, PAYMENT_ICONS, toTitleCase, getPaymentIcon } from '../../config/paymentMethods';
import { DollarSign, ArrowDownLeft } from 'lucide-react';

export default function PaymentBreakdownCard({ paymentBreakdown, totalBs, bcvRate, tasaCop, copEnabled }) {
    if (Object.keys(paymentBreakdown).length === 0) return null;

    const entries = Object.entries(paymentBreakdown);
    const fiadoMethods = entries.filter(([, d]) => d.currency === 'FIADO');
    const bsMethods    = entries.filter(([, d]) => d.currency === 'BS' || (!d.currency));
    const usdMethods   = entries.filter(([, d]) => d.currency === 'USD');
    const copMethods   = entries.filter(([, d]) => d.currency === 'COP');
    const vueltoBs     = paymentBreakdown['_vuelto_bs'];
    const vueltoUsd    = paymentBreakdown['_vuelto_usd'];
    const fmtCop = (v) => v.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    // Section net totals (gross methods + negative vuelto)
    const subtotalBs  = bsMethods.reduce((s, [, d]) => s + d.total, 0)  + (vueltoBs?.total  || 0);
    const subtotalUsd = usdMethods.reduce((s, [, d]) => s + d.total, 0) + (vueltoUsd?.total || 0);

    const renderMethod = ([method, data]) => {
        const label = toTitleCase(getPaymentLabel(method, data.label));
        const PayIcon = getPaymentIcon(method) || PAYMENT_ICONS[method];
        let totalBsEquiv = data.total;
        let pct = 0;
        let displayAmount = `${formatBs(data.total)} Bs`;

        if (data.currency === 'FIADO') {
            totalBsEquiv = data.total * bcvRate;
            pct = totalBs > 0 ? Math.min(100, totalBsEquiv / totalBs * 100) : 0;
            displayAmount = `$ ${data.total.toFixed(2)}`;
        } else if (data.currency === 'USD') {
            totalBsEquiv = data.total * bcvRate;
            pct = totalBs > 0 ? Math.min(100, totalBsEquiv / totalBs * 100) : 0;
            displayAmount = `$ ${data.total.toFixed(2)}`;
        } else if (data.currency === 'COP') {
            totalBsEquiv = (data.total / (tasaCop || 1)) * bcvRate;
            pct = totalBs > 0 ? Math.min(100, totalBsEquiv / totalBs * 100) : 0;
            displayAmount = `${fmtCop(data.total)} COP`;
        } else {
            pct = totalBs > 0 ? Math.min(100, data.total / totalBs * 100) : 0;
        }

        return (
            <div key={method}>
                <div className="flex justify-between text-sm mb-1">
                    <span className="text-slate-600 dark:text-slate-300 font-medium flex items-center gap-1.5">
                        {PayIcon && <PayIcon size={14} className="text-slate-400" />}
                        {label}
                    </span>
                    <div className="text-right">
                        <span className="font-bold text-slate-700 dark:text-white">{displayAmount}</span>
                        {data.currency === 'FIADO' && (
                            <div className="text-[10px] text-slate-400 font-medium">{formatBs(totalBsEquiv)} Bs</div>
                        )}
                    </div>
                </div>
                {data.currency !== 'FIADO' && (
                    <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                )}
            </div>
        );
    };

    const renderVuelto = (entry, currency) => {
        if (!entry || entry.total === 0) return null;
        const abs = Math.abs(entry.total);
        const display = currency === 'USD' ? `- $${abs.toFixed(2)}` : `- ${formatBs(abs)} Bs`;
        const pct = totalBs > 0 ? Math.min(100, abs * (currency === 'USD' ? bcvRate : 1) / totalBs * 100) : 0;
        return (
            <div key={`vuelto_${currency}`}>
                <div className="flex justify-between text-sm mb-1">
                    <span className="text-orange-500 font-medium flex items-center gap-1.5">
                        <ArrowDownLeft size={14} className="text-orange-400" />
                        Vuelto Entregado
                    </span>
                    <span className="font-bold text-orange-500">{display}</span>
                </div>
                <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-orange-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
            </div>
        );
    };

    return (
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-100 dark:border-slate-800 shadow-sm">
            <h3 className="text-xs font-bold text-slate-400 uppercase mb-3 flex items-center gap-1">
                <DollarSign size={12} /> Desglose por Metodo de Pago
            </h3>

            {fiadoMethods.length > 0 && (
                <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-bold text-amber-500 uppercase tracking-wider">Por Cobrar</span>
                        <span className="text-xs font-black text-amber-600 dark:text-amber-400">${fiadoMethods.reduce((s, [,d]) => s + d.total, 0).toFixed(2)}</span>
                    </div>
                    <div className="space-y-3 pl-1 border-l-2 border-amber-200 dark:border-amber-800/40">
                        <div className="pl-3 space-y-3">{fiadoMethods.map(renderMethod)}</div>
                    </div>
                </div>
            )}

            {(bsMethods.length > 0 || (bsMethods.length === 0 && vueltoBs)) && (
                <div className="mb-3">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-bold text-blue-500 uppercase tracking-wider">Bolivares</span>
                        <span className="text-xs font-black text-blue-600 dark:text-blue-400">{formatBs(subtotalBs)} Bs neto</span>
                    </div>
                    <div className="space-y-3 pl-1 border-l-2 border-blue-200 dark:border-blue-800/40">
                        <div className="pl-3 space-y-3">
                            {bsMethods.map(renderMethod)}
                            {renderVuelto(vueltoBs, 'BS')}
                        </div>
                    </div>
                </div>
            )}

            {usdMethods.length > 0 && (
                <div className={copMethods.length > 0 ? 'mb-3' : ''}>
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider">Dolares</span>
                        <span className="text-xs font-black text-emerald-600 dark:text-emerald-400">${subtotalUsd.toFixed(2)} neto</span>
                    </div>
                    <div className="space-y-3 pl-1 border-l-2 border-emerald-200 dark:border-emerald-800/40">
                        <div className="pl-3 space-y-3">
                            {usdMethods.map(renderMethod)}
                            {renderVuelto(vueltoUsd, 'USD')}
                        </div>
                    </div>
                </div>
            )}

            {copEnabled && copMethods.length > 0 && (
                <div>
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-bold text-amber-500 uppercase tracking-wider">Pesos Colombianos</span>
                        <span className="text-xs font-black text-amber-600 dark:text-amber-400">{fmtCop(copMethods.reduce((s, [,d]) => s + d.total, 0))} COP</span>
                    </div>
                    <div className="space-y-3 pl-1 border-l-2 border-amber-200 dark:border-amber-800/40">
                        <div className="pl-3 space-y-3">{copMethods.map(renderMethod)}</div>
                    </div>
                </div>
            )}
        </div>
    );
}
