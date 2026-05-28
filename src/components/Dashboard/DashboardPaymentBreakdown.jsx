import React from 'react';
import { formatBs } from '../../utils/calculatorUtils';
import { getPaymentLabel, PAYMENT_ICONS, getPaymentIcon, toTitleCase } from '../../config/paymentMethods';

export function DashboardPaymentBreakdown({ salesPaymentBreakdown, todayTotalBs, bcvRate, copEnabled, tasaCop }) {
    const entries = Object.entries(salesPaymentBreakdown).filter(([, d]) => d.total > 0);
    if (entries.length === 0) return null;

    const fmtCop = (v) => v.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const fiadoMethods = entries.filter(([, d]) => d.currency === 'FIADO');
    const bsMethods    = entries.filter(([, d]) => d.currency === 'BS' || (!d.currency));
    const usdMethods   = entries.filter(([, d]) => d.currency === 'USD');
    const copMethods   = entries.filter(([, d]) => d.currency === 'COP');
    const vueltoBs     = salesPaymentBreakdown['_vuelto_bs'];
    const vueltoUsd    = salesPaymentBreakdown['_vuelto_usd'];
    const subtotalBs   = bsMethods.reduce((s, [, d]) => s + d.total, 0)  + (vueltoBs?.total  || 0);
    const subtotalUsd  = usdMethods.reduce((s, [, d]) => s + d.total, 0) + (vueltoUsd?.total || 0);
    const subtotalCop  = copMethods.reduce((s, [, d]) => s + d.total, 0);

    const renderMethod = ([method, data]) => {
        const label = toTitleCase(getPaymentLabel(method, data.label));
        const PayIcon = getPaymentIcon(method) || PAYMENT_ICONS[method];
        let totalBsEquiv = data.total, pct = 0, displayAmount = `${formatBs(data.total)} Bs`;
        if (data.currency === 'FIADO') { totalBsEquiv = data.total * bcvRate; pct = todayTotalBs > 0 ? Math.min(100, totalBsEquiv / todayTotalBs * 100) : 0; displayAmount = `$ ${data.total.toFixed(2)}`; }
        else if (data.currency === 'USD') { totalBsEquiv = data.total * bcvRate; pct = todayTotalBs > 0 ? Math.min(100, totalBsEquiv / todayTotalBs * 100) : 0; displayAmount = `$ ${data.total.toFixed(2)}`; }
        else if (data.currency === 'COP') { totalBsEquiv = (data.total / (tasaCop || 1)) * bcvRate; pct = todayTotalBs > 0 ? Math.min(100, totalBsEquiv / todayTotalBs * 100) : 0; displayAmount = `${fmtCop(data.total)} COP`; }
        else { pct = todayTotalBs > 0 ? Math.min(100, data.total / todayTotalBs * 100) : 0; }
        return (
            <div key={method} className="mb-3">
                <div className="flex justify-between items-center mb-1.5">
                    <span className="text-slate-600 font-bold text-xs flex items-center gap-1.5">{PayIcon && <PayIcon size={14} className="text-[#0EA5E9]" />}{label}</span>
                    <div className="text-right flex items-center gap-2">
                        <div className="flex flex-col items-end">
                            <span className="font-black text-slate-800 text-sm">{displayAmount}</span>
                            {data.currency === 'FIADO' && <span className="text-[9px] text-slate-400">{formatBs(totalBsEquiv)} Bs</span>}
                        </div>
                        <span className="text-[10px] font-black w-8 text-right text-slate-400">{pct.toFixed(0)}%</span>
                    </div>
                </div>
                {data.currency !== 'FIADO' && <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-gradient-to-r from-[#0EA5E9] to-[#5EEAD4] rounded-full transition-all" style={{ width: `${pct}%` }} /></div>}
            </div>
        );
    };

    const renderVuelto = (entry, currency) => {
        if (!entry || entry.total === 0) return null;
        const abs = Math.abs(entry.total);
        const display = currency === 'USD' ? `- $${abs.toFixed(2)}` : `- ${formatBs(abs)} Bs`;
        const pct = todayTotalBs > 0 ? Math.min(100, abs * (currency === 'USD' ? bcvRate : 1) / todayTotalBs * 100) : 0;
        return (
            <div className="mb-3">
                <div className="flex justify-between items-center mb-1.5">
                    <span className="text-orange-500 font-bold text-xs flex items-center gap-1.5">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="7 17 17 7"/><polyline points="7 7 7 17 17 17"/></svg>
                        Vuelto Entregado
                    </span>
                    <div className="text-right flex items-center gap-2">
                        <span className="font-black text-orange-500 text-sm">{display}</span>
                        <span className="text-[10px] font-black w-8 text-right text-orange-300">{pct.toFixed(0)}%</span>
                    </div>
                </div>
                <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-orange-400 rounded-full transition-all" style={{ width: `${pct}%` }} /></div>
            </div>
        );
    };

    return (
        <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Medios de Pago</h3>
            {fiadoMethods.length > 0 && <div className="mb-4"><div className="flex justify-between items-end mb-2 pb-1 border-b border-rose-50"><span className="text-[10px] font-bold text-amber-500 uppercase tracking-wider">Por Cobrar</span><span className="text-xs font-black text-amber-600">${fiadoMethods.reduce((s, [,d]) => s + d.total, 0).toFixed(2)}</span></div><div className="pl-2 border-l-2 border-amber-200">{fiadoMethods.map(renderMethod)}</div></div>}
            {(bsMethods.length > 0 || (bsMethods.length === 0 && vueltoBs)) && <div className="mb-4"><div className="flex justify-between items-end mb-2 pb-1 border-b border-sky-50"><span className="text-[10px] font-bold text-sky-500 uppercase tracking-wider">Bolívares</span><span className="text-xs font-black text-sky-600">{formatBs(subtotalBs)} Bs neto</span></div><div className="pl-2 border-l-2 border-sky-200">{bsMethods.map(renderMethod)}{renderVuelto(vueltoBs, 'BS')}</div></div>}
            {usdMethods.length > 0 && <div className="mb-4"><div className="flex justify-between items-end mb-2 pb-1 border-b border-emerald-50"><span className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider">Dólares</span><span className="text-xs font-black text-emerald-600">${subtotalUsd.toFixed(2)} neto</span></div><div className="pl-2 border-l-2 border-emerald-200">{usdMethods.map(renderMethod)}{renderVuelto(vueltoUsd, 'USD')}</div></div>}
            {copEnabled && copMethods.length > 0 && <div><div className="flex justify-between items-end mb-2 pb-1 border-b border-amber-50"><span className="text-[10px] font-bold text-amber-500 uppercase tracking-wider">Pesos</span><span className="text-xs font-black text-amber-600">{fmtCop(subtotalCop)} COP</span></div><div className="pl-2 border-l-2 border-amber-200">{copMethods.map(renderMethod)}</div></div>}
        </div>
    );
}
