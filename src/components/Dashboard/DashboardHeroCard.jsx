import React from 'react';
import { TrendingUp, ArrowUpRight } from 'lucide-react';
import { formatBs } from '../../utils/calculatorUtils';
import AnimatedCounter from '../AnimatedCounter';
import OperatorDashboardPanel from './OperatorDashboardPanel';

export function DashboardHeroCard({
    isAdmin, dashTab, setDashTab, hasCashSession, activeCashSession,
    displayTotalUsd, displayTotalBs, displaySalesCount, displayItemsSold, displayProfit,
    bcvRate, useAutoRate, onNavigate,
}) {
    if (!isAdmin) return <OperatorDashboardPanel onNavigate={onNavigate} />;

    return (
        <>
        {/* ── HERO REVENUE CARD ── */}
        <div className="relative rounded-[1.5rem] overflow-hidden" style={{ background: dashTab === 'hoy' ? 'linear-gradient(135deg, #8B5CF6 0%, #7C3AED 50%, #A78BFA 100%)' : 'linear-gradient(135deg, #0EA5E9 0%, #06B6D4 50%, #5EEAD4 100%)' }}>
            <div className="absolute -right-10 -top-10 w-48 h-48 rounded-full bg-white/10" />
            <div className="absolute -left-8 -bottom-8 w-36 h-36 rounded-full bg-white/5" />
            <div className="relative z-10 p-5">
                <div className="flex items-start justify-between mb-2">
                    {/* Tabs */}
                    <div className="flex bg-white/15 rounded-full p-0.5 backdrop-blur-sm">
                        <button onClick={() => setDashTab('caja')}
                            className={`text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-full transition-all ${dashTab === 'caja' ? 'bg-white/30 text-white shadow-sm' : 'text-white/60'}`}>
                            {hasCashSession ? 'Caja' : 'Sesión'}
                        </button>
                        <button onClick={() => setDashTab('hoy')}
                            className={`text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-full transition-all ${dashTab === 'hoy' ? 'bg-white/30 text-white shadow-sm' : 'text-white/60'}`}>
                            Hoy
                        </button>
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-wider bg-white/20 text-white px-2.5 py-1 rounded-full backdrop-blur-sm">
                        {dashTab === 'hoy'
                            ? (() => { const d = new Date(); const days = ['DOM','LUN','MAR','MIÉ','JUE','VIE','SÁB']; const months = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC']; return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`; })()
                            : hasCashSession
                                ? `Desde ${new Date(activeCashSession.opened_at).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}`
                                : 'Sin caja abierta'
                        }
                    </span>
                </div>
                <p className="text-white/60 text-[10px] font-bold uppercase tracking-widest mb-3">
                    {dashTab === 'hoy' ? 'Ingresos de hoy' : 'Ingresos caja actual'}
                </p>
                <div className="flex items-end justify-between">
                    <div>
                        <div className="flex items-baseline gap-0.5">
                            <span className="text-white/80 text-xl font-black">$</span>
                            <span className="text-[2.6rem] font-black text-white tracking-tight leading-none"><AnimatedCounter value={displayTotalUsd} /></span>
                        </div>
                        <p className="text-white/60 text-xs font-semibold mt-1.5">{formatBs(displayTotalBs)} Bs</p>
                    </div>
                    <div className="text-right">
                        <div className="bg-white/20 backdrop-blur-sm rounded-2xl px-4 py-2.5 mb-1.5">
                            <p className="text-2xl font-black text-white leading-none"><AnimatedCounter value={displaySalesCount} /></p>
                            <p className="text-white/70 text-[10px] font-bold mt-0.5">{displaySalesCount === 1 ? 'VENTA' : 'VENTAS'}</p>
                        </div>
                        <p className="text-white/60 text-[10px] font-semibold"><AnimatedCounter value={displayItemsSold} /> artículos</p>
                    </div>
                </div>
            </div>
        </div>

        {/* ── KPIs ROW ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm relative overflow-hidden">
                <div className="absolute -right-3 -top-3 w-14 h-14 bg-emerald-50 rounded-full blur-xl" />
                <div className="relative z-10">
                    <div className="w-9 h-9 bg-emerald-100 rounded-xl flex items-center justify-center mb-2.5"><TrendingUp size={18} className="text-emerald-600" strokeWidth={2.5} /></div>
                    <p className={`text-xl font-black leading-none ${displayProfit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{displayProfit >= 0 ? '+' : ''}${bcvRate > 0 ? (displayProfit / bcvRate).toFixed(2) : '0.00'}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{formatBs(displayProfit)} Bs</p>
                    <p className="text-[10px] text-slate-400 mt-1.5 font-medium">Ganancia est.</p>
                </div>
            </div>
            <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm relative overflow-hidden">
                <div className="absolute -right-3 -top-3 w-14 h-14 bg-sky-50 rounded-full blur-xl" />
                <div className="relative z-10">
                    <div className="w-9 h-9 bg-sky-100 rounded-xl flex items-center justify-center mb-2.5"><ArrowUpRight size={18} className="text-sky-600" strokeWidth={2.5} /></div>
                    <p className="text-xl font-black text-slate-800 leading-none">{formatBs(bcvRate)}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">Bs por dólar</p>
                    <p className={`text-[10px] ${useAutoRate ? 'text-sky-500' : 'text-amber-500'} mt-1.5 font-bold uppercase tracking-wider`}>{useAutoRate ? 'Tasa BCV' : 'Tasa Manual'}</p>
                </div>
            </div>
        </div>
        </>
    );
}
