import React, { useState } from 'react';
import { Users, LogOut } from 'lucide-react';

// Formatea un número como peso colombiano: $ 12.500
const formatCOP = (val) => new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', minimumFractionDigits: 0
}).format(Math.round(val || 0));

export function BillSeatBreakdown({
    seatBreakdown, seats, unpaidSeatsCount,
    sharedDivisionType, setSharedDivisionType,
    customSharedAmounts, setCustomSharedAmounts,
    customDivisionMismatch,
    onProceedToPayment, discount, itemDiscounts,
    includeServiceCharge,
    includeTip = 0,
    onReleaseSeat,
}) {
    return (
        <>
            {seatBreakdown.seats.map((sb, idx) => {
                const seat = sb.seat;
                const label = seat.label || `Cliente ${idx + 1}`;
                const svcAmount = includeServiceCharge > 0 && !seat.paid ? Math.round(sb.subtotal * (includeServiceCharge / 100)) : 0;
                const tipAmount = includeTip > 0 && !seat.paid ? Math.round(sb.subtotal * (includeTip / 100)) : 0;
                const totalWithExtras = sb.subtotal + svcAmount + tipAmount;

                return (
                    <div key={seat.id} className={`border rounded-2xl overflow-hidden ${
                        seat.paid 
                            ? 'opacity-50 bg-slate-50 dark:bg-slate-900/30 border-slate-200 dark:border-slate-700' 
                            : seat.checkoutRequested
                                ? 'bg-amber-50/50 dark:bg-amber-955/20 border-amber-400 dark:border-amber-900/40 animate-pulse shadow-md'
                                : 'bg-sky-50 dark:bg-sky-955/20 border-sky-100 dark:border-sky-900/40'
                    }`}>
                        <div className="flex items-center justify-between px-4 py-2.5 border-b border-inherit">
                            <div className="flex items-center gap-2">
                                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${seat.paid ? 'bg-emerald-200 text-emerald-700' : seat.checkoutRequested ? 'bg-amber-500 text-white' : 'bg-sky-500 text-white'}`}>
                                    {label.charAt(0).toUpperCase()}
                                </div>
                                <span className="text-sm font-black text-slate-800 dark:text-white">{label}</span>
                                {seat.paid && <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">PAGADO</span>}
                                {!seat.paid && seat.checkoutRequested && <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 animate-pulse">COBRO SOLICITADO</span>}
                            </div>
                            {seat.paid && onReleaseSeat ? (
                                <button
                                    onClick={() => {
                                        if (window.confirm(`¿Retirar a ${label} de la mesa? Su slot quedará libre.`)) {
                                            onReleaseSeat(seat.id);
                                        }
                                    }}
                                    title="Liberar cliente"
                                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold text-rose-500 bg-rose-50 dark:bg-rose-950/30 hover:bg-rose-100 dark:hover:bg-rose-900/40 border border-rose-200 dark:border-rose-800/40 active:scale-95 transition-all"
                                >
                                    <LogOut size={11} />
                                    Liberar
                                </button>
                            ) : (
                                <span className="text-base font-black text-slate-800 dark:text-white">{formatCOP(seat.paid ? sb.subtotal : totalWithExtras)}</span>
                            )}
                        </div>
                        <div className="px-4 py-2 space-y-1 text-xs">
                            {/* Cargos de tiempo individuales */}
                            {seat.timeCharges && seat.timeCharges.length > 0 && sb.timeCost.total > 0 && (
                                <>
                                    {seat.timeCharges.filter(tc => tc.type === 'hora').length > 0 && (
                                        <div className="flex justify-between text-slate-600 dark:text-slate-300">
                                            <span>Horas ({seat.timeCharges.filter(tc => tc.type === 'hora').reduce((s, tc) => s + tc.amount, 0)}h)</span>
                                            <span className="font-bold">{formatCOP(sb.timeCost.hourCost)}</span>
                                        </div>
                                    )}
                                    {seat.timeCharges.filter(tc => tc.type === 'pina').length > 0 && (
                                        <div className="flex justify-between text-slate-600 dark:text-slate-300">
                                            <span>Jugadas ({seat.timeCharges.filter(tc => tc.type === 'pina').reduce((s, tc) => s + tc.amount, 0)})</span>
                                            <span className="font-bold">{formatCOP(sb.timeCost.pinaCost)}</span>
                                        </div>
                                    )}
                                </>
                            )}
                            {/* Legacy: tiempo por gameMode */}
                            {(!seat.timeCharges || seat.timeCharges.length === 0) && sb.timeCost.total > 0 && (
                                <div className="flex justify-between text-slate-600 dark:text-slate-300">
                                    <span>Tiempo</span>
                                    <span className="font-bold">{formatCOP(sb.timeCost.total)}</span>
                                </div>
                            )}
                            {sb.items.length > 0 && (
                                <div className="space-y-0.5">
                                    {sb.items.map((item, i) => {
                                        const lineTotal = Number(item.unit_price_usd) * Number(item.qty);
                                        return (
                                            <div key={i} className="flex justify-between text-slate-600 dark:text-slate-300">
                                                <span>{Number(item.qty)}x {item.product_name || 'Producto'}</span>
                                                <span className="font-bold">{formatCOP(lineTotal)}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                            {sb.sharedPortion > 0 && (
                                <div className="flex justify-between text-slate-400">
                                    <span>Compartido ({sharedDivisionType === 'equal' ? `÷${seatBreakdown.seats.filter(s => !s.seat.paid).length}` : 'manual'})</span>
                                    <span className="font-bold">{formatCOP(sb.sharedPortion)}</span>
                                </div>
                            )}
                            {sb.timeCost.total === 0 && sb.consumption === 0 && sb.sharedPortion === 0 && !seat.paid && (
                                <p className="text-slate-400 py-1">Sin cargos individuales</p>
                            )}
                            {includeServiceCharge > 0 && !seat.paid && sb.subtotal > 0 && (
                                <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-bold pt-1 border-t border-slate-100 dark:border-slate-800">
                                    <span>Servicio Voluntario ({includeServiceCharge}%)</span>
                                    <span>{formatCOP(svcAmount)}</span>
                                </div>
                            )}
                            {includeTip > 0 && !seat.paid && sb.subtotal > 0 && (
                                <div className={`flex justify-between text-indigo-600 dark:text-indigo-400 font-bold pt-1 ${includeServiceCharge <= 0 ? 'border-t border-slate-100 dark:border-slate-800' : ''}`}>
                                    <span>Propina ({includeTip}%)</span>
                                    <span>{formatCOP(tipAmount)}</span>
                                </div>
                            )}
                        </div>
                        {!seat.paid && (
                            <div className="px-4 pb-3">
                                <button
                                    disabled={customDivisionMismatch}
                                    onClick={() => onProceedToPayment(discount, itemDiscounts, seat.id, sb.subtotal, includeServiceCharge, includeTip)}
                                    className={`w-full py-2 rounded-xl text-xs font-black text-white flex items-center justify-center gap-1.5 active:scale-95 transition-all ${customDivisionMismatch ? 'opacity-40 cursor-not-allowed' : ''}`}
                                    style={{ background: customDivisionMismatch ? '#94a3b8' : 'linear-gradient(135deg, #F97316, #EA580C)' }}
                                >
                                    Cobrar {label} — {formatCOP(totalWithExtras)}
                                </button>
                            </div>
                        )}
                    </div>
                );
            })}

            {/* Sección Compartido */}
            {seatBreakdown.sharedTotal > 0 && (
                <div className="bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200 dark:border-slate-700">
                        <div className="flex items-center gap-2">
                            <Users size={12} className="text-slate-400" />
                            <p className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                Compartido · {formatCOP(seatBreakdown.sharedTotal)}
                            </p>
                        </div>
                        {/* Toggle división — solo si hay 2+ asientos sin pagar */}
                        {unpaidSeatsCount > 1 && (
                        <div className="flex items-center gap-1 bg-slate-200 dark:bg-slate-700 rounded-lg p-0.5">
                            <button
                                onClick={() => setSharedDivisionType('equal')}
                                className={`px-2 py-1 rounded-md text-[10px] font-bold transition-all ${sharedDivisionType === 'equal' ? 'bg-white dark:bg-slate-600 text-slate-700 dark:text-white shadow-sm' : 'text-slate-400'}`}
                            >
                                Igual
                            </button>
                            <button
                                onClick={() => setSharedDivisionType('custom')}
                                className={`px-2 py-1 rounded-md text-[10px] font-bold transition-all ${sharedDivisionType === 'custom' ? 'bg-white dark:bg-slate-600 text-slate-700 dark:text-white shadow-sm' : 'text-slate-400'}`}
                            >
                                Manual
                            </button>
                        </div>
                        )}
                    </div>
                    {/* Tiempo compartido (session-level) */}
                    {seatBreakdown.sharedTimeTotal > 0 && (
                        <div className="px-4 pt-2 pb-1">
                            <div className="flex justify-between text-xs text-slate-500">
                                <span>Tiempo de sesión</span>
                                <span className="font-bold">{formatCOP(seatBreakdown.sharedTimeTotal)}</span>
                            </div>
                        </div>
                    )}
                    {/* Items compartidos */}
                    {seatBreakdown.sharedItems.length > 0 && (
                        <div className="divide-y divide-slate-100 dark:divide-slate-800">
                            {seatBreakdown.sharedItems.map((item, i) => (
                                <div key={i} className="flex items-center justify-between px-4 py-2">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <span className="w-5 h-5 bg-slate-200 dark:bg-slate-700 rounded text-[10px] font-black text-slate-500 flex items-center justify-center">{item.qty}</span>
                                        <span className="text-xs font-bold text-slate-600 dark:text-slate-300 truncate">{item.product_name}</span>
                                    </div>
                                    <span className="text-xs font-bold text-slate-700 dark:text-white">{formatCOP(Number(item.unit_price_usd) * Number(item.qty))}</span>
                                </div>
                            ))}
                        </div>
                    )}
                    {/* División manual: inputs por cliente */}
                    {sharedDivisionType === 'custom' && (
                        <div className="px-4 py-3 space-y-3 border-t border-slate-200 dark:border-slate-700">
                            <div className="flex items-center justify-between">
                                <p className="text-[10px] text-slate-500 font-black uppercase tracking-wider">Asignar monto</p>
                                <button
                                    onClick={() => {
                                        const newAmounts = {};
                                        seatBreakdown.seats.filter(s => !s.seat.paid).forEach(sb => {
                                            newAmounts[sb.seat.id] = Math.round(seatBreakdown.sharedPerSeat).toString();
                                        });
                                        setCustomSharedAmounts(newAmounts);
                                    }}
                                    className="text-[10px] font-bold text-violet-500 hover:text-violet-600 px-2.5 py-1 bg-violet-50 dark:bg-violet-900/20 hover:bg-violet-100 rounded-lg transition-all active:scale-95"
                                >
                                    Repartir igual
                                </button>
                            </div>
                            {seatBreakdown.seats.filter(s => !s.seat.paid).map(sb => {
                                const rawVal = customSharedAmounts[sb.seat.id] ?? '';
                                const numVal = parseFloat(rawVal) || 0;
                                return (
                                    <div key={sb.seat.id} className="flex items-center gap-2.5">
                                        <div className="flex items-center gap-1.5 w-20 shrink-0">
                                            <div className="w-6 h-6 rounded-full bg-sky-500 flex items-center justify-center text-[10px] font-black text-white shrink-0">
                                                {(sb.seat.label || 'C').charAt(0).toUpperCase()}
                                            </div>
                                            <span className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">{sb.seat.label || 'Cliente'}</span>
                                        </div>
                                        <div className={`flex-1 flex items-center rounded-xl border-2 px-3 py-2 transition-all ${numVal > 0 ? 'border-sky-400 bg-sky-50 dark:bg-sky-950/30' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800'}`}>
                                            <span className="text-slate-400 text-xs font-bold mr-1">$</span>
                                            <input
                                                type="text"
                                                inputMode="decimal"
                                                placeholder={Math.round(seatBreakdown.sharedPerSeat).toString()}
                                                value={rawVal}
                                                onChange={e => {
                                                    const v = e.target.value.replace(',', '.');
                                                    if (!/^[0-9.]*$/.test(v)) return;
                                                    const dots = (v.match(/\./g) || []).length;
                                                    if (dots > 1) return;
                                                    setCustomSharedAmounts(prev => ({ ...prev, [sb.seat.id]: v }));
                                                }}
                                                onBlur={e => {
                                                    const parsed = parseFloat(e.target.value);
                                                    if (!isNaN(parsed)) setCustomSharedAmounts(prev => ({ ...prev, [sb.seat.id]: Math.round(parsed).toString() }));
                                                    else setCustomSharedAmounts(prev => ({ ...prev, [sb.seat.id]: '' }));
                                                }}
                                                className="flex-1 bg-transparent text-sm font-black text-slate-700 dark:text-white outline-none"
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                            {/* Estado de asignación */}
                            {(() => {
                                const assigned = Object.values(customSharedAmounts).reduce((s, v) => s + (parseFloat(v) || 0), 0);
                                const remaining = seatBreakdown.sharedTotal - assigned;
                                const isMatch = Math.abs(remaining) < 1; // 1 peso tolerancia
                                const isOver = remaining < -1;
                                return (
                                    <div className={`flex justify-between items-center text-xs font-bold px-3 py-2.5 rounded-xl ${isMatch ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600' : isOver ? 'bg-red-50 dark:bg-red-950/20 text-red-500' : 'bg-amber-50 dark:bg-amber-950/20 text-amber-600'}`}>
                                        <span>{isMatch ? '✓ Completo' : isOver ? '⚠ Excede el total' : `Falta asignar`}</span>
                                        <span className="font-black text-sm">{isMatch ? formatCOP(seatBreakdown.sharedTotal) : isOver ? `-${formatCOP(Math.abs(remaining))}` : formatCOP(remaining)}</span>
                                    </div>
                                );
                            })()}
                        </div>
                    )}
                    {sharedDivisionType === 'equal' && (
                        <div className="px-4 py-2 border-t border-slate-200 dark:border-slate-700 text-[10px] text-slate-400">
                            ÷{seatBreakdown.seats.filter(s => !s.seat.paid).length} clientes = {formatCOP(seatBreakdown.sharedPerSeat)} c/u
                        </div>
                    )}
                </div>
            )}
        </>
    );
}
