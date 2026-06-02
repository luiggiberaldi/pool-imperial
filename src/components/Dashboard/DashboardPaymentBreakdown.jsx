import React from 'react';
import { getPaymentLabel, PAYMENT_ICONS, getPaymentIcon, toTitleCase } from '../../config/paymentMethods';

export function DashboardPaymentBreakdown({ salesPaymentBreakdown }) {
    // Filter out vuelto and keep methods with totals > 0
    const entries = Object.entries(salesPaymentBreakdown).filter(([k, d]) => d.total > 0 && !k.startsWith('_vuelto'));
    if (entries.length === 0) return null;

    const fmtCop = (v) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(Math.round(v || 0));

    // Calculate total COP of all payments
    const totalPaymentsCop = entries.reduce((acc, [, d]) => acc + d.total, 0);

    const renderMethod = ([method, data]) => {
        const label = toTitleCase(getPaymentLabel(method, data.label));
        const PayIcon = getPaymentIcon(method) || PAYMENT_ICONS[method];
        
        // Since we are strictly COP, percentage is total / totalPaymentsCop
        const pct = totalPaymentsCop > 0 ? Math.min(100, (data.total / totalPaymentsCop) * 100) : 0;
        const displayAmount = fmtCop(data.total);

        return (
            <div key={method} className="mb-3">
                <div className="flex justify-between items-center mb-1.5">
                    <span className="text-slate-600 font-bold text-xs flex items-center gap-1.5">{PayIcon && <PayIcon size={14} className="text-[#D97706]" />}{label}</span>
                    <div className="text-right flex items-center gap-2">
                        <div className="flex flex-col items-end">
                            <span className="font-black text-slate-800 text-sm">{displayAmount}</span>
                        </div>
                        <span className="text-[10px] font-black w-8 text-right text-slate-400">{pct.toFixed(0)}%</span>
                    </div>
                </div>
                <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-[#F59E0B] to-[#D97706] rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
            </div>
        );
    };

    return (
        <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Medios de Pago</h3>
            <div className="space-y-1">
                {entries.map(renderMethod)}
            </div>
        </div>
    );
}
