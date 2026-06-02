import React, { useState } from 'react';
import { X, Receipt, Zap, Clock, Coffee, Layers, Users } from 'lucide-react';
import { PAYMENT_ICONS, ICON_COMPONENTS } from '../../config/paymentMethods';
import { divR } from '../../utils/dinero';
import { useCheckoutPayments, EPSILON } from '../../hooks/useCheckoutPayments';
import CustomerPickerSection from './CustomerPickerSection';
import CheckoutChangeBreakdown from './CheckoutChangeBreakdown';
import { FiarConfirmModal, OverpayAlertModal } from './CheckoutConfirmModals';
import SpotlightTour from '../SpotlightTour';

const CHECKOUT_TOUR_KEY = 'pda_checkout_tour_done';

const CHECKOUT_STEPS = [
    {
        target: '[data-tour="checkout-total"]',
        title: 'Total a Pagar',
        text: 'Este es el monto total de la venta en pesos colombianos (COP).'
    },
    {
        target: '[data-tour="checkout-remaining"]',
        title: 'Falta / Vuelto',
        text: 'En naranja = falta por cobrar. En verde = hay vuelto. Al cubirse con exactitud, el botón de confirmar se activa.'
    },
    {
        target: '[data-tour="checkout-confirm"]',
        title: 'Confirmar Venta',
        text: 'Una vez cubierto el total, puedes pulsar este botón para completar la venta.'
    },
];

const sectionStyles = {
    COP: {
        bg: 'bg-amber-50/50 dark:bg-amber-950/20',
        border: 'border-amber-100 dark:border-amber-900/50',
        title: 'text-amber-800 dark:text-amber-300',
        titleBg: 'bg-amber-100 dark:bg-amber-900/50',
        titleIcon: 'text-amber-600 dark:text-amber-400',
        inputBorder: 'border-amber-200 dark:border-amber-800 focus:border-amber-500 focus:ring-amber-500/20',
        inputActive: 'border-amber-400 dark:border-amber-600 bg-amber-50 dark:bg-amber-950/30',
        btnBg: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 hover:bg-amber-200 active:bg-amber-300',
    },
};

// Formatea un número como peso colombiano: $ 12.500
const formatCOP = (val) => new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', minimumFractionDigits: 0
}).format(Math.round(val || 0));

export default function CheckoutModal({
    onClose,
    cartSubtotalUsd,  // Almacena subtotal COP (campo heredado)
    cartTotalUsd,     // Almacena total COP (campo heredado)
    discountData,
    effectiveRate,
    customers,
    selectedCustomerId,
    setSelectedCustomerId,
    paymentMethods,
    onConfirmSale,
    onUseSaldoFavor,
    triggerHaptic,
    onCreateCustomer,
    copEnabled,
    tasaCop,
    currentFloatUsd = 0,
    tableContext = null,
}) {
    const [tdcSurchargePercent, setTdcSurchargePercent] = useState(5);
    const [ivaRate, setIvaRate] = useState(19);
    const [showCheckoutTour, setShowCheckoutTour] = useState(
        () => localStorage.getItem(CHECKOUT_TOUR_KEY) !== 'true'
    );
    const [splitPeople, setSplitPeople] = useState(null);
    const [splitCustomInput, setSplitCustomInput] = useState('');
    const [activeMethodId, setActiveMethodId] = useState(null);

    const splitMeta = splitPeople ? { people: splitPeople, perPerson: [] } : null;

    const {
        barValues, setBarValues, totalPaidUsd,
        remainingUsd, changeUsd,
        isPaid, handleBarChange, fillBar, handleConfirm,
        changeUsdGiven, setChangeUsdGiven,
        confirmFiar, setConfirmFiar,
        overpayAlertData, setOverpayAlertData, confirmOverpay,
        tdcSurcharge, adjustedTotal, ivaAmount
    } = useCheckoutPayments({ paymentMethods, effectiveRate: 1, tasaCop: 1, cartTotalUsd, onConfirmSale, triggerHaptic, splitMeta, tdcSurchargePercent, ivaRate, tableContext });

    const handleSurchargePercentChange = (newPercent) => {
        const oldPercent = tdcSurchargePercent;
        setTdcSurchargePercent(newPercent);
        const currentTdcVal = parseFloat(barValues['tdc']) || 0;
        if (currentTdcVal > 0) {
            const baseAmount = currentTdcVal / (1 + (oldPercent / 100));
            const newTdcVal = Math.round(baseAmount * (1 + (newPercent / 100)));
            setBarValues(prev => ({
                ...prev,
                tdc: newTdcVal.toString()
            }));
        }
    };

    const selectedCustomer = customers.find(c => c.id === selectedCustomerId);
    const activePaymentMethods = paymentMethods.filter(m => m.isEnabled !== false);

    const renderPaymentBar = (method, styles) => {
        const val = barValues[method.id] || '';
        const hasValue = parseFloat(val) > 0;

        return (
            <div key={method.id} className="mb-3 last:mb-0">
                <div className="flex items-center gap-2 mb-1 ml-0.5">
                    {(() => { const MIcon = method.Icon || PAYMENT_ICONS[method.id] || ICON_COMPONENTS[method.icon]; return MIcon ? <MIcon size={16} className={hasValue ? styles.titleIcon : 'text-slate-700 dark:text-slate-400'} /> : <span className="text-base">{method.icon}</span>; })()}
                    <span className={`text-[11px] font-black uppercase tracking-wide ${hasValue ? styles.title : 'text-slate-700 dark:text-slate-300'}`}>
                        {method.label}
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                        <input
                            type="text"
                            inputMode="decimal"
                            value={val}
                            onChange={e => handleBarChange(method.id, e.target.value)}
                            onFocus={() => setActiveMethodId(method.id)}
                            placeholder="0"
                            className={`w-full py-3 px-4 pr-14 rounded-xl border-2 text-lg font-bold outline-none transition-all ${hasValue
                                ? styles.inputActive
                                : `bg-white dark:bg-slate-900 ${styles.inputBorder}`
                                } text-slate-800 dark:text-white placeholder:text-slate-300 dark:placeholder:text-slate-700 focus:ring-4`}
                        />
                        <span className={`absolute right-3 top-1/2 -translate-y-1/2 text-xs font-black px-2 py-0.5 rounded-md border ${hasValue
                            ? `${styles.titleBg} ${styles.title} ${styles.border}`
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-400 border-slate-200 dark:border-slate-700'
                            }`}>
                            $
                        </span>
                    </div>
                    <button
                        onClick={() => fillBar(method.id, 'COP')}
                        className={`shrink-0 py-3 px-3.5 rounded-xl font-black text-xs transition-all active:scale-95 flex items-center gap-1 ${styles.btnBg}`}
                    >
                        <Zap size={14} fill="currentColor" /> Total
                    </button>
                </div>
                {method.id === 'tdc' && hasValue && (
                    <div className="mt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-gradient-to-r from-slate-50 to-white dark:from-slate-900 dark:to-slate-950 px-3.5 py-3 rounded-2xl border border-slate-200/60 dark:border-slate-800/60 animate-in fade-in slide-in-from-top-2 duration-250 select-none shadow-sm">
                        <div className="flex items-center justify-between flex-1">
                            <span className="text-xs font-black text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                                💳 Recargo de Tarjeta (TDC)
                            </span>
                            {tdcSurcharge > 0 && (
                                <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 px-2 py-0.5 rounded-lg border border-emerald-100 dark:border-emerald-900/20">
                                    +{formatCOP(tdcSurcharge)}
                                </span>
                            )}
                        </div>
                        <div className="flex items-center justify-end gap-2">
                            <button
                                onClick={() => handleSurchargePercentChange(Math.max(0, tdcSurchargePercent - 1))}
                                className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 hover:scale-105 active:scale-95 flex items-center justify-center text-sm font-black text-slate-700 dark:text-slate-300 transition-all border border-slate-200/40 dark:border-slate-700/40 shadow-sm"
                            >
                                -
                            </button>
                            <div className="flex items-center justify-center bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-200/40 dark:border-slate-700/40 shadow-inner">
                                <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    value={tdcSurchargePercent}
                                    onChange={(e) => {
                                        const v = parseInt(e.target.value);
                                        handleSurchargePercentChange(isNaN(v) ? 0 : Math.max(0, Math.min(100, v)));
                                    }}
                                    className="w-6 text-center text-xs font-black bg-transparent text-slate-800 dark:text-white focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                />
                                <span className="text-xs font-black text-slate-400 dark:text-slate-500">%</span>
                            </div>
                            <button
                                onClick={() => handleSurchargePercentChange(Math.min(100, tdcSurchargePercent + 1))}
                                className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 hover:scale-105 active:scale-95 flex items-center justify-center text-sm font-black text-slate-700 dark:text-slate-300 transition-all border border-slate-200/40 dark:border-slate-700/40 shadow-sm"
                            >
                                +
                            </button>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    return (
        <>
        {showCheckoutTour && (
            <SpotlightTour
                steps={CHECKOUT_STEPS}
                onComplete={() => { localStorage.setItem(CHECKOUT_TOUR_KEY) === 'true'; setShowCheckoutTour(false); }}
                onSkip={() => { localStorage.setItem(CHECKOUT_TOUR_KEY) === 'true'; setShowCheckoutTour(false); }}
            />
        )}
        <div className="fixed inset-0 z-50 bg-white dark:bg-slate-950 flex flex-col overflow-hidden">

            {/* --- HEADER --- */}
            <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                <button onClick={onClose} className="p-2 -ml-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                    <X size={22} />
                </button>
                <h2 className="text-base font-black text-slate-800 dark:text-white tracking-wide">COBRAR VENTA</h2>
                <div className="w-6 h-6"></div> {/* Spacer for alignment */}
            </div>

            {/* --- SCROLLABLE BODY --- */}
            <div className="flex-1 overflow-y-auto overscroll-contain pb-28">

                {/* -- MESA BREAKDOWN -- */}
                {tableContext && (
                    <div className="mx-3 mb-3 bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800/40 rounded-2xl overflow-hidden">
                        <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-orange-100 dark:border-orange-800/30 bg-orange-100/50 dark:bg-orange-900/20">
                            <div className="w-7 h-7 bg-orange-500 rounded-lg flex items-center justify-center shrink-0">
                                <Layers size={13} className="text-white" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-xs font-black text-orange-700 dark:text-orange-400">{tableContext.table.name}</p>
                                {tableContext.seatId && (() => {
                                    const seat = (tableContext.session?.seats || []).find(s => s.id === tableContext.seatId);
                                    const allUnpaid = (tableContext.session?.seats || []).filter(s => !s.paid).length;
                                    return (
                                        <p className="text-[10px] text-orange-500 dark:text-orange-400/70 font-bold mt-0.5">
                                            Cobro individual: {seat?.label || 'Persona'} · porción de {allUnpaid} persona{allUnpaid !== 1 ? 's' : ''}
                                        </p>
                                    );
                                })()}
                            </div>
                        </div>
                        <div className="divide-y divide-orange-100 dark:divide-orange-800/20">
                            {tableContext.seatDisplayInfo ? (() => {
                                const di = tableContext.seatDisplayInfo;
                                return (
                                    <>
                                        {di.timeCost.total > 0 && (
                                            <div className="flex items-center justify-between px-3 py-2">
                                                <span className="flex items-center gap-1.5 text-xs text-slate-500">
                                                    <Clock size={11} className="text-blue-400" />
                                                    {di.timeCost.pinaCost > 0 && di.timeCost.hourCost > 0 ? 'Tiempo + Piñas' : di.timeCost.pinaCost > 0 ? 'Piñas' : `Tiempo · ${tableContext.elapsed || 0} min`}
                                                </span>
                                                <span className="text-xs font-black text-slate-700 dark:text-white">{formatCOP(di.timeCost.total)}</span>
                                            </div>
                                        )}
                                        {di.items.map((item, i) => (
                                            <div key={i} className="flex items-center justify-between px-3 py-1.5">
                                                <span className="flex items-center gap-1.5 text-xs text-slate-500 truncate pr-2">
                                                    <Coffee size={11} className="text-amber-400 shrink-0" />
                                                    <span className="font-bold text-slate-600">{item.qty}x</span> {item.product_name || item.name}
                                                </span>
                                                <span className="text-xs font-black text-slate-700 dark:text-white shrink-0">{formatCOP(Number(item.unit_price_usd) * Number(item.qty))}</span>
                                            </div>
                                        ))}
                                        {di.sharedPortion > 0 && (
                                            <div className="flex items-center justify-between px-3 py-1.5 bg-slate-50 dark:bg-slate-900/30">
                                                <span className="flex items-center gap-1.5 text-xs text-slate-400">
                                                    <Users size={11} className="text-slate-400 shrink-0" />
                                                    Compartido ÷{di.divisor}
                                                    {(di.sharedItems?.length > 0 || di.sharedTimeTotal > 0) && (
                                                        <span className="text-[10px] text-slate-300">
                                                            ({[di.sharedTimeTotal > 0 && 'tiempo', di.sharedItems?.length > 0 && `${di.sharedItems.length} ítem${di.sharedItems.length !== 1 ? 's' : ''}`].filter(Boolean).join(' + ')})
                                                        </span>
                                                    )}
                                                </span>
                                                <span className="text-xs font-black text-slate-600 dark:text-slate-300 shrink-0">{formatCOP(di.sharedPortion)}</span>
                                            </div>
                                        )}
                                    </>
                                );
                            })() : (
                                <>
                                    {tableContext.timeCost > 0 && (
                                        <div className="flex items-center justify-between px-3 py-2">
                                            {tableContext.session?.game_mode === 'PINA' ? (() => {
                                                const count = 1 + (Number(tableContext.session?.extended_times) || 0);
                                                return (
                                                    <span className="flex items-center gap-1.5 text-xs text-slate-500">
                                                        🎱 {count} piña{count !== 1 ? 's' : ''}
                                                    </span>
                                                );
                                            })() : (() => {
                                                const mins = tableContext.elapsed || 0;
                                                const timeLabel = mins < 60
                                                    ? `${Math.ceil(mins)} min`
                                                    : `${(mins / 60).toFixed(1).replace('.0', '')}h`;
                                                return (
                                                    <span className="flex items-center gap-1.5 text-xs text-slate-500">
                                                        <Clock size={11} className="text-blue-400" /> Tiempo de juego · {timeLabel}
                                                    </span>
                                                );
                                            })()}
                                            <span className="text-xs font-black text-slate-700 dark:text-white">
                                                {splitPeople > 1 ? (
                                                    <><span className="text-slate-400 line-through mr-1">{formatCOP(tableContext.timeCost)}</span>{formatCOP(divR(tableContext.timeCost, splitPeople))}<span className="text-[9px] font-bold text-violet-500 ml-0.5">÷{splitPeople}</span></>
                                                ) : formatCOP(tableContext.timeCost)}
                                            </span>
                                        </div>
                                    )}
                                    {tableContext.currentItems?.map((item, i) => (
                                        <div key={i} className="flex items-center justify-between px-3 py-1.5">
                                            <span className="flex items-center gap-1.5 text-xs text-slate-500 truncate pr-2">
                                                <Coffee size={11} className="text-amber-400 shrink-0" />
                                                <span className="font-bold text-slate-600">{item.qty}x</span> {item.product_name || item.name}
                                            </span>
                                            <div className="flex items-center gap-1.5 shrink-0">
                                                {splitPeople > 1 && (
                                                    <span className="text-[10px] text-slate-400 line-through">{formatCOP(Number(item.unit_price_usd) * Number(item.qty))}</span>
                                                )}
                                                <span className="text-xs font-black text-slate-700 dark:text-white">
                                                    {splitPeople > 1 ? formatCOP(divR(Number(item.unit_price_usd) * Number(item.qty), splitPeople)) : formatCOP(Number(item.unit_price_usd) * Number(item.qty))}
                                                    {splitPeople > 1 && <span className="text-[9px] font-bold text-violet-500 ml-0.5">÷{splitPeople}</span>}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </>
                            )}
                        </div>
                    </div>
                )}

                {/* -- TOTAL -- */}
                <div data-tour="checkout-total" className="px-4 py-4 bg-gradient-to-b from-slate-50 to-white dark:from-slate-900 dark:to-slate-950">
                    {(discountData?.active || tdcSurcharge > 0) && (
                        <div className="flex flex-col items-center justify-center space-y-1.5 mb-3 pb-3 border-b border-slate-200/50 dark:border-slate-800/50">
                            {discountData?.active && (
                                <div className="flex items-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-400">
                                    <span>Subtotal:</span>
                                    <span>{formatCOP(cartSubtotalUsd)}</span>
                                    <span className="text-amber-600 dark:text-amber-500 bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 rounded ml-1">
                                        -{formatCOP(discountData.amountUsd)} ({discountData.type === 'percentage' ? `${discountData.value}%` : 'Fijo'})
                                    </span>
                                </div>
                            )}
                            {tdcSurcharge > 0 && (
                                <div className="flex items-center gap-2 text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/20 px-3 py-1 rounded-xl">
                                    <span>Recargo TDC ({tdcSurchargePercent}%):</span>
                                    <span>+{formatCOP(tdcSurcharge)}</span>
                                </div>
                            )}
                        </div>
                    )}
                    <p className={`text-[11px] font-bold uppercase tracking-widest text-center mb-1 ${discountData?.active || tdcSurcharge > 0 ? 'text-emerald-500' : 'text-slate-400'}`}>
                        {discountData?.active || tdcSurcharge > 0 ? 'Total Final' : 'Total a Pagar'}
                    </p>
                    <div className="text-center">
                        <span className={`text-4xl sm:text-5xl font-black ${discountData?.active || tdcSurcharge > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-900 dark:text-white'}`}>
                            {formatCOP(adjustedTotal)}
                        </span>
                    </div>

                    {/* Desglose reactivo de IVA */}
                    {ivaRate > 0 && (() => {
                        const baseParaIva = tableContext?.includeServiceCharge ? Math.round(cartTotalUsd / 1.10) : cartTotalUsd;
                        return (
                            <div className="flex flex-col items-center justify-center space-y-0.5 mt-2.5 pt-2.5 border-t border-slate-200/40 dark:border-slate-800/40">
                                <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-wider">
                                    <span>Base Gravable: {formatCOP(baseParaIva)}</span>
                                    <span className="text-slate-300 dark:text-slate-700">•</span>
                                    <span className="text-blue-500">IVA ({ivaRate}%): {formatCOP(ivaAmount)}</span>
                                </div>
                            </div>
                        );
                    })()}
                </div>

                {/* -- DIVIDIR CUENTA (Calculadora visual) -- */}
                <div className="mx-3 mb-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 flex items-center gap-1">
                        <Users size={11} /> Dividir cuenta
                    </p>
                    <div className="flex gap-1.5 flex-wrap items-center">
                        {[2, 3, 4, 5, 6, 8].map(n => (
                            <button
                                key={n}
                                onClick={() => { setSplitPeople(splitPeople === n ? null : n); setSplitCustomInput(''); }}
                                className={`w-9 h-9 rounded-xl text-xs font-black transition-all border ${
                                    splitPeople === n
                                        ? 'bg-violet-500 text-white border-violet-500 shadow-md shadow-violet-500/30'
                                        : 'bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-violet-400'
                                }`}
                            >
                                {n}
                            </button>
                        ))}
                        <div className="flex items-center gap-1 ml-1">
                            <input
                                type="number"
                                min="2"
                                max="99"
                                placeholder="?"
                                value={splitCustomInput}
                                onChange={e => {
                                    const v = e.target.value;
                                    setSplitCustomInput(v);
                                    const n = parseInt(v);
                                    if (n >= 2) setSplitPeople(n);
                                    else if (v === '') setSplitPeople(null);
                                }}
                                className="w-12 h-9 rounded-xl text-xs font-black text-center border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-300 focus:outline-none focus:border-violet-400"
                            />
                        </div>
                    </div>

                    {/* Resultado visual simple */}
                    {splitPeople && cartTotalUsd > 0 && (() => {
                        const perPersonCOP = divR(cartTotalUsd, splitPeople);
                        return (
                            <div className="mt-2 p-3 bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-700/40 rounded-xl flex items-center justify-between">
                                <div>
                                    <p className="text-[10px] font-bold text-violet-600 dark:text-violet-400 uppercase tracking-widest">
                                        Cada persona ({splitPeople})
                                    </p>
                                </div>
                                <div className="flex flex-col items-end">
                                    <span className="text-xl font-black text-violet-700 dark:text-violet-300 leading-none">
                                        {formatCOP(perPersonCOP)}
                                    </span>
                                </div>
                            </div>
                        );
                    })()}
                </div>

                {/* -- IVA CONFIG (Impuesto ajustable) -- */}
                <div className="mx-3 mb-3 bg-slate-50 dark:bg-slate-900/40 border border-slate-200/50 dark:border-slate-800/50 rounded-2xl p-3 flex items-center justify-between select-none">
                    <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 bg-blue-100 dark:bg-blue-950/40 rounded-xl flex items-center justify-center text-blue-600 dark:text-blue-400">
                            <span className="font-extrabold text-sm">%</span>
                        </div>
                        <div>
                            <p className="text-xs font-bold text-slate-700 dark:text-slate-200">Impuesto IVA ({ivaRate}%)</p>
                            <p className="text-[10px] text-slate-400 mt-0.5">Desglosado en el ticket de venta</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5 border border-slate-200/50 dark:border-slate-700/50">
                        {[0, 8, 19].map(pct => (
                            <button
                                key={pct}
                                onClick={() => setIvaRate(pct)}
                                className={`px-2 py-0.5 rounded-md text-[10px] font-black transition-all ${ivaRate === pct ? 'bg-white dark:bg-slate-600 text-slate-700 dark:text-white shadow-sm' : 'text-slate-400 hover:text-slate-500'}`}
                            >
                                {pct}%
                            </button>
                        ))}
                        <div className="flex items-center w-10 border-l border-slate-200 dark:border-slate-700 pl-1.5 ml-0.5">
                            <input
                                type="number"
                                min="0"
                                max="100"
                                value={ivaRate}
                                onChange={e => {
                                    const v = parseInt(e.target.value);
                                    setIvaRate(isNaN(v) ? 0 : Math.max(0, Math.min(100, v)));
                                }}
                                className="w-full text-center text-[10px] font-black bg-transparent text-slate-700 dark:text-white focus:outline-none"
                            />
                        </div>
                    </div>
                </div>

                {/* -- SECCIÓN MÉTODOS DE PAGO -- */}
                {activePaymentMethods.length > 0 && (
                    <div className={`mx-3 mb-3 rounded-2xl border ${sectionStyles.COP.bg} ${sectionStyles.COP.border} p-3`}>
                        <div className="flex items-center justify-between mb-3">
                            <h3 className={`text-[11px] font-black uppercase tracking-widest flex items-center gap-2 ${sectionStyles.COP.title}`}>
                                <span className={`p-1 rounded-lg ${sectionStyles.COP.titleBg}`}>💵</span>
                                Métodos de Pago (COP)
                            </h3>
                        </div>
                        {activePaymentMethods.map(m => renderPaymentBar(m, sectionStyles.COP))}
                    </div>
                )}

                {/* -- BANNER VUELTO / RESTANTE -- */}
                <CheckoutChangeBreakdown
                    isPaid={isPaid}
                    changeUsd={changeUsd}
                    remainingUsd={remainingUsd}
                />

                {/* -- CLIENTE -- */}
                <CustomerPickerSection
                    customers={customers}
                    selectedCustomerId={selectedCustomerId}
                    setSelectedCustomerId={setSelectedCustomerId}
                    selectedCustomer={selectedCustomer}
                    effectiveRate={1}
                    remainingUsd={remainingUsd}
                    onUseSaldoFavor={onUseSaldoFavor}
                    triggerHaptic={triggerHaptic}
                    onCreateCustomer={onCreateCustomer}
                    EPSILON={EPSILON}
                />
            </div>

            {/* --- BOTÓN CTA FIJO --- */}
            <div data-tour="checkout-confirm" className="shrink-0 px-4 py-3 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-950 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                <button
                    onClick={() => {
                        if (!isPaid && selectedCustomerId && remainingUsd >= EPSILON) {
                            triggerHaptic && triggerHaptic();
                            setConfirmFiar(true);
                        } else {
                            handleConfirm();
                        }
                    }}
                    disabled={!selectedCustomerId && remainingUsd >= EPSILON}
                    className={`w-full py-4 text-white font-black text-base rounded-2xl shadow-lg transition-all tracking-wide flex items-center justify-center gap-2 ${isPaid
                        ? 'bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/25 active:scale-[0.98]'
                        : selectedCustomerId
                            ? 'bg-rose-500 hover:bg-rose-600 shadow-rose-500/25 active:scale-[0.98]'
                            : 'bg-slate-300 dark:bg-slate-800 text-slate-500 shadow-none cursor-not-allowed'
                        }`}
                >
                    {isPaid ? (
                        <><Receipt size={18} /> CONFIRMAR COBRO</>
                    ) : selectedCustomerId ? (
                        <><Users size={18} /> FIAR RESTANTE ({formatCOP(remainingUsd)})</>
                    ) : (
                        <><Receipt size={18} /> INGRESA LOS PAGOS</>
                    )}
                </button>
            </div>

            {/* --- MODALES DE CONFIRMACIÓN --- */}
            <FiarConfirmModal
                confirmFiar={confirmFiar} setConfirmFiar={setConfirmFiar}
                remainingUsd={remainingUsd} remainingBs={0}
                selectedCustomer={selectedCustomer} totalPaidUsd={totalPaidUsd}
                handleConfirm={handleConfirm}
            />
            <OverpayAlertModal
                overpayAlertData={overpayAlertData} setOverpayAlertData={setOverpayAlertData}
                confirmOverpay={confirmOverpay} cartTotalUsd={cartTotalUsd}
                totalPaidUsd={totalPaidUsd}
            />
        </div>
        </>
    );
}
