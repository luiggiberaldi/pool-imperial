import { getPaymentLabel, PAYMENT_ICONS, toTitleCase, getPaymentIcon } from '../../config/paymentMethods';
import { DollarSign } from 'lucide-react';

export default function PaymentBreakdownCard({ paymentBreakdown }) {
    if (Object.keys(paymentBreakdown).length === 0) return null;

    const entries = Object.entries(paymentBreakdown).filter(([k, d]) => d.total > 0 && !k.startsWith('_vuelto'));
    if (entries.length === 0) return null;

    const fmtCop = (v) => v.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 });

    // Calculate total COP of all payments
    const totalPaymentsCop = entries.reduce((acc, [, d]) => acc + d.total, 0);

    const renderMethod = ([method, data]) => {
        const label = toTitleCase(getPaymentLabel(method, data.label));
        const PayIcon = getPaymentIcon(method) || PAYMENT_ICONS[method];
        
        // Since we are strictly COP, percentage is total / totalPaymentsCop
        const pct = totalPaymentsCop > 0 ? Math.min(100, (data.total / totalPaymentsCop) * 100) : 0;
        const displayAmount = fmtCop(data.total);

        return (
            <div key={method}>
                <div className="flex justify-between text-sm mb-1">
                    <span className="text-slate-600 dark:text-slate-300 font-medium flex items-center gap-1.5">
                        {PayIcon && <PayIcon size={14} className="text-slate-400" />}
                        {label}
                    </span>
                    <div className="text-right">
                        <span className="font-bold text-slate-700 dark:text-white">{displayAmount}</span>
                    </div>
                </div>
                <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
            </div>
        );
    };

    return (
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-100 dark:border-slate-800 shadow-sm">
            <h3 className="text-xs font-bold text-slate-400 uppercase mb-3 flex items-center gap-1">
                <DollarSign size={12} /> Desglose por Método de Pago
            </h3>
            <div className="space-y-4">
                {entries.map(renderMethod)}
            </div>
        </div>
    );
}
