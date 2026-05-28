import React from 'react';
import { Clock, Coffee, Percent, Tag, Trash2 } from 'lucide-react';
import { formatElapsedTime, formatHoursPaid } from '../../utils/tableBillingEngine';

// Formatea un número como peso colombiano: $ 12.500
const formatCOP = (val) => new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', minimumFractionDigits: 0
}).format(Math.round(val || 0));

function TargetIcon({size}) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>
        </svg>
    );
}

export function BillClassicBreakdown({
    session, elapsed, timeCost, currentItems, config,
    fullBreakdown, breakdown,
    hoursOffset, roundsOffset,
    pinaCount, canDiscount,
    itemDiscounts, setItemDiscounts,
    discountPopoverItem, setDiscountPopoverItem,
    discountCustomValue, setDiscountCustomValue,
}) {
    return (
        <>
        {/* Piñas — visible si la sesión tiene piñas */}
        {fullBreakdown.hasPinas && (
            <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/40 rounded-2xl overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-2 border-b border-amber-100 dark:border-amber-900/30">
                    <TargetIcon size={13} />
                    <p className="text-[10px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-wider">
                        Piñas jugadas
                    </p>
                </div>
                <div className="flex items-center justify-between px-4 py-3">
                    <div>
                        <p className="text-sm font-bold text-slate-700 dark:text-white">
                            {pinaCount} piña{pinaCount !== 1 ? 's' : ''}
                        </p>
                        <p className="text-[10px] text-slate-400 mt-0.5">{formatCOP(config.pricePina || 0)} por piña</p>
                    </div>
                    <div className="text-right">
                        <p className="text-base font-black text-slate-800 dark:text-white">{formatCOP(fullBreakdown.pinaCost)}</p>
                    </div>
                </div>
                {roundsOffset > 0 && (
                    <div className="flex items-center justify-between px-4 py-2 border-t border-amber-100 dark:border-amber-900/30 bg-amber-100/40 dark:bg-amber-900/20">
                        <p className="text-xs text-slate-500 dark:text-slate-400">Pagado ({roundsOffset} piña{roundsOffset !== 1 ? 's' : ''})</p>
                        <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400">-{formatCOP(roundsOffset * (config.pricePina || 0))}</p>
                    </div>
                )}
            </div>
        )}

        {/* Tiempo de sesión — visible si la sesión tiene horas */}
        {fullBreakdown.hasHours && (
            <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/40 rounded-2xl overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-2 border-b border-blue-100 dark:border-blue-900/30">
                    <Clock size={13} className="text-blue-500" />
                    <p className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-wider">
                        Tiempo de Juego
                    </p>
                </div>
                <div className="flex items-center justify-between px-4 py-3">
                    <div>
                        <p className="text-sm font-bold text-slate-700 dark:text-white">{formatElapsedTime(elapsed)}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">{formatCOP(config.pricePerHour || 0)}/hora · {formatHoursPaid(Number(session.hours_paid) || 0)} pagadas</p>
                    </div>
                    <div className="text-right">
                        <p className="text-base font-black text-slate-800 dark:text-white">{formatCOP(fullBreakdown.hourCost)}</p>
                    </div>
                </div>
                {hoursOffset > 0 && (
                    <div className="flex items-center justify-between px-4 py-2 border-t border-blue-100 dark:border-blue-900/30 bg-blue-100/40 dark:bg-blue-900/20">
                        <p className="text-xs text-slate-500 dark:text-slate-400">Pagado ({formatHoursPaid(hoursOffset)})</p>
                        <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400">-{formatCOP(hoursOffset * (config.pricePerHour || 0))}</p>
                    </div>
                )}
            </div>
        )}

        {/* Fallback: PREPAGO sin breakdown (backward compat) */}
        {timeCost > 0 && !breakdown.hasPinas && !breakdown.hasHours && session.game_mode !== 'NORMAL' && (
            <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/40 rounded-2xl overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-2 border-b border-blue-100 dark:border-blue-900/30">
                    <Clock size={13} className="text-blue-500" />
                    <p className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-wider">
                        Tiempo de Juego
                    </p>
                </div>
                <div className="flex items-center justify-between px-4 py-3">
                    <div>
                        <p className="text-sm font-bold text-slate-700 dark:text-white">{formatElapsedTime(elapsed)}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">Tarifa por hora</p>
                    </div>
                    <div className="text-right">
                        <p className="text-base font-black text-slate-800 dark:text-white">{formatCOP(timeCost)}</p>
                    </div>
                </div>
            </div>
        )}

        {/* Consumos */}
        {currentItems && currentItems.length > 0 && (
            <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/40 rounded-2xl overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-2 border-b border-amber-100 dark:border-amber-900/30">
                    <Coffee size={13} className="text-amber-500" />
                    <p className="text-[10px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-wider">
                        Consumos ({currentItems.length} {currentItems.length === 1 ? 'artículo' : 'artículos'})
                    </p>
                </div>
                <div className="divide-y divide-amber-100 dark:divide-amber-900/20">
                    {currentItems.map((item, i) => {
                        const lineTotal = Number(item.unit_price_usd) * Number(item.qty);
                        const disc = itemDiscounts[item.id];
                        const hasDisc = disc && disc.value > 0;
                        const discAmt = hasDisc ? (disc.type === 'percentage' ? lineTotal * (disc.value / 100) : Math.min(disc.value * Number(item.qty), lineTotal)) : 0;
                        const finalLine = lineTotal - discAmt;
                        const isOpen = discountPopoverItem === item.id;
                        return (
                            <div key={i}>
                                <div className="flex items-center justify-between px-4 py-3">
                                    <div className="flex items-center gap-3 min-w-0 flex-1">
                                        <span className="w-7 h-7 bg-amber-200 dark:bg-amber-800/60 rounded-lg flex items-center justify-center text-[11px] font-black text-amber-700 dark:text-amber-300 shrink-0">
                                            {item.qty}
                                        </span>
                                        <div className="min-w-0">
                                            <p className="text-sm font-bold text-slate-700 dark:text-white truncate">
                                                {item.product_name || item.name}
                                            </p>
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                <p className="text-[10px] text-slate-400">
                                                    {formatCOP(Number(item.unit_price_usd))} c/u
                                                </p>
                                                {hasDisc && (
                                                    <span className="inline-flex items-center gap-0.5 bg-rose-100 dark:bg-rose-900/30 text-rose-500 text-[9px] font-black px-1.5 py-0.5 rounded-full leading-none">
                                                        <Tag size={7} />
                                                        {disc.type === 'percentage' ? `${disc.value}%` : `${formatCOP(disc.value)}`}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0 pl-3">
                                        {canDiscount && (
                                            <button onClick={() => { setDiscountPopoverItem(isOpen ? null : item.id); setDiscountCustomValue(''); }}
                                                className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all active:scale-90 ${isOpen ? 'bg-rose-500 text-white shadow-md shadow-rose-500/25 scale-110' : hasDisc ? 'bg-rose-100 dark:bg-rose-900/30 text-rose-500 hover:bg-rose-200' : 'bg-slate-100 dark:bg-slate-800 text-slate-400 hover:bg-amber-100 hover:text-amber-500'}`}>
                                                <Percent size={12} />
                                            </button>
                                        )}
                                        <div className="text-right min-w-[60px]">
                                            {hasDisc ? (
                                                <>
                                                    <p className="text-[10px] line-through text-slate-400">{formatCOP(lineTotal)}</p>
                                                    <p className="text-sm font-black text-emerald-600 dark:text-emerald-400">{formatCOP(finalLine)}</p>
                                                </>
                                            ) : (
                                                <p className="text-sm font-black text-slate-800 dark:text-white">{formatCOP(lineTotal)}</p>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Per-item discount panel */}
                                {isOpen && (
                                    <div className="mx-3 mb-3 rounded-2xl overflow-hidden border border-rose-200 dark:border-rose-800/40 bg-gradient-to-b from-rose-50 to-white dark:from-rose-950/30 dark:to-slate-900 shadow-lg shadow-rose-500/5">
                                        {/* Header */}
                                        <div className="px-4 pt-3 pb-2 flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <div className="w-5 h-5 rounded-md bg-rose-500 flex items-center justify-center">
                                                    <Tag size={10} className="text-white" />
                                                </div>
                                                <p className="text-[11px] font-bold text-slate-600 dark:text-slate-300 truncate max-w-[160px]">
                                                    {item.product_name || item.name}
                                                </p>
                                            </div>
                                            {hasDisc && (
                                                <button onClick={() => {
                                                    setItemDiscounts(prev => { const next = { ...prev }; delete next[item.id]; return next; });
                                                    setDiscountPopoverItem(null);
                                                }}
                                                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-red-100 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-500 transition-colors active:scale-95">
                                                    <Trash2 size={10} />
                                                    <span className="text-[10px] font-bold">Quitar</span>
                                                </button>
                                            )}
                                        </div>

                                        {/* Preset percentage cards */}
                                        <div className="px-4 pb-2.5">
                                            <div className="grid grid-cols-4 gap-2">
                                                {[10, 15, 20, 50].map(pct => {
                                                    const isActive = disc?.type === 'percentage' && disc?.value === pct;
                                                    const saved = lineTotal * (pct / 100);
                                                    return (
                                                        <button key={pct} onClick={() => {
                                                            setItemDiscounts(prev => ({ ...prev, [item.id]: { type: 'percentage', value: pct } }));
                                                            setDiscountPopoverItem(null);
                                                        }}
                                                            className={`py-2.5 rounded-xl text-center transition-all active:scale-95 ${isActive
                                                                ? 'bg-rose-500 text-white shadow-md shadow-rose-500/25'
                                                                : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/20'}`}>
                                                            <span className="block text-sm font-black leading-none">{pct}%</span>
                                                            <span className={`block text-[9px] font-medium mt-1 ${isActive ? 'text-white/70' : 'text-slate-400'}`}>
                                                                -{formatCOP(saved)}
                                                            </span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        {/* Custom amount */}
                                        <div className="px-4 pb-3">
                                            <div className="flex gap-2 items-center">
                                                <div className="flex-1 flex items-center bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 focus-within:border-rose-400 focus-within:ring-2 focus-within:ring-rose-100 dark:focus-within:ring-rose-900/30 transition-all">
                                                    <span className="text-rose-400 text-sm font-black mr-1">$</span>
                                                    <input type="number" inputMode="decimal" step="any" min="0"
                                                        value={discountCustomValue}
                                                        onChange={e => setDiscountCustomValue(e.target.value)}
                                                        placeholder="Monto fijo por unidad"
                                                        className="flex-1 bg-transparent text-sm font-bold text-slate-700 dark:text-white py-2.5 outline-none placeholder-slate-300 dark:placeholder-slate-600" />
                                                </div>
                                                <button onClick={() => {
                                                    const v = parseFloat(discountCustomValue);
                                                    if (v > 0) {
                                                        setItemDiscounts(prev => ({ ...prev, [item.id]: { type: 'fixed', value: v } }));
                                                        setDiscountPopoverItem(null);
                                                    }
                                                }}
                                                    className="h-[42px] px-5 bg-rose-500 hover:bg-rose-600 text-white text-sm font-black rounded-xl active:scale-95 transition-all shadow-md shadow-rose-500/20">
                                                    OK
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        )}

        {/* Sin consumos */}
        {(!currentItems || currentItems.length === 0) && timeCost === 0 && (
            <div className="py-8 text-center text-slate-400">
                <Coffee size={28} className="mx-auto mb-2 opacity-40" />
                <p className="text-sm">Sin consumos registrados</p>
            </div>
        )}
        </>
    );
}
