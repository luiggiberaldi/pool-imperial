import React, { useState, useEffect, useRef } from 'react';
import { X, Percent, DollarSign, Calculator, ShieldAlert, Delete } from 'lucide-react';
import { useAuthStore } from '../../hooks/store/authStore';
import { logEvent } from '../../services/auditService';

export default function DiscountModal({
    currentDiscount,
    onApply,
    onClose,
    cartSubtotalUsd,
    effectiveRate,
    tasaCop,
    copEnabled,
    userRole = 'ADMIN',
    maxDiscountPercent = 100,
}) {
    const [type, setType] = useState(currentDiscount?.type || 'percentage');
    const [value, setValue] = useState(currentDiscount?.value ? currentDiscount.value.toString() : '');
    const [screen, setScreen] = useState('discount'); // 'discount' | 'pin'
    const [adminPin, setAdminPin] = useState('');
    const [pinError, setPinError] = useState(false);
    const [pinProcessing, setPinProcessing] = useState(false);
    const inputRef = useRef(null);

    const { verifyAdminPin, currentUser } = useAuthStore();

    useEffect(() => {
        setTimeout(() => inputRef.current?.focus(), 150);
    }, []);

    const numValue = parseFloat(value) || 0;

    let discountAmountUsd = 0;
    if (type === 'percentage') {
        discountAmountUsd = cartSubtotalUsd * (numValue / 100);
    } else {
        discountAmountUsd = numValue;
    }
    if (discountAmountUsd > cartSubtotalUsd) discountAmountUsd = cartSubtotalUsd;

    const newTotalUsd = cartSubtotalUsd - discountAmountUsd;
    const newTotalBs = newTotalUsd * effectiveRate;
    const formatBs = (n) => new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

    // Check if this discount exceeds the limit for cashiers
    const effectivePct = type === 'percentage' ? numValue : (cartSubtotalUsd > 0 ? (numValue / cartSubtotalUsd) * 100 : 0);
    const needsApproval = userRole !== 'ADMIN' && maxDiscountPercent < 100 && effectivePct > maxDiscountPercent && numValue > 0;

    const handleSubmit = (e) => {
        e.preventDefault();
        if (needsApproval) {
            setScreen('pin');
            setAdminPin('');
            setPinError(false);
        } else {
            onApply({ type, value: numValue });
        }
    };

    const handleClear = () => onApply({ type: 'percentage', value: 0 });

    // PIN pad handlers
    const handlePinDigit = (d) => {
        if (adminPin.length >= 6 || pinProcessing) return;
        const next = adminPin + d;
        setAdminPin(next);
        if (next.length === 6) submitPin(next);
    };
    const handlePinDelete = () => { if (!pinProcessing) setAdminPin(p => p.slice(0, -1)); };

    const submitPin = async (pin) => {
        setPinProcessing(true);
        const ok = await verifyAdminPin(pin);
        if (ok) {
            logEvent('VENTA', 'DESCUENTO_APROBADO_ADMIN',
                `Descuento ${type === 'percentage' ? numValue + '%' : '$' + numValue} aprobado por admin para cajero ${currentUser?.name || ''}`,
                useAuthStore.getState().currentUser,
                { discountType: type, discountValue: numValue, cashier: currentUser?.name }
            );
            onApply({ type, value: numValue });
        } else {
            setPinError(true);
            setAdminPin('');
            setPinProcessing(false);
            setTimeout(() => setPinError(false), 600);
        }
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
            <div
                className="bg-white dark:bg-slate-900 w-full max-w-sm mx-4 sm:mx-6 md:mx-auto rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-100 dark:border-slate-800"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                    <h3 className="font-black text-slate-800 dark:text-white text-lg flex items-center gap-2">
                        {screen === 'pin'
                            ? <><ShieldAlert size={20} className="text-violet-500" /> Aprobación Admin</>
                            : <><Calculator size={20} className="text-blue-500" /> Descuento</>
                        }
                    </h3>
                    <button onClick={screen === 'pin' ? () => setScreen('discount') : onClose} className="p-2 -mr-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors active:scale-95">
                        <X size={18} />
                    </button>
                </div>

                {screen === 'discount' ? (
                    <form onSubmit={handleSubmit} className="p-4 sm:p-5 flex flex-col gap-5">
                        {/* Toggle Type */}
                        <div className="flex bg-slate-100 dark:bg-slate-950 p-1.5 rounded-2xl shadow-inner">
                            <button type="button" onClick={() => { setType('percentage'); setValue(''); inputRef.current?.focus(); }}
                                className={`flex flex-1 items-center justify-center gap-2 py-2.5 text-sm font-bold rounded-xl transition-all duration-300 ${type === 'percentage' ? 'bg-white dark:bg-slate-900 shadow-sm text-blue-600 dark:text-blue-400 scale-100 ring-1 ring-slate-900/5 dark:ring-white/10' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 scale-95 hover:scale-100'}`}>
                                <Percent size={16} /> Porcentaje
                            </button>
                            <button type="button" onClick={() => { setType('fixed'); setValue(''); inputRef.current?.focus(); }}
                                className={`flex flex-1 items-center justify-center gap-2 py-2.5 text-sm font-bold rounded-xl transition-all duration-300 ${type === 'fixed' ? 'bg-white dark:bg-slate-900 shadow-sm text-emerald-600 dark:text-emerald-400 scale-100 ring-1 ring-slate-900/5 dark:ring-white/10' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 scale-95 hover:scale-100'}`}>
                                <DollarSign size={16} /> Monto ($)
                            </button>
                        </div>

                        {/* Input */}
                        <div className="relative group">
                            <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                                {type === 'percentage'
                                    ? <Percent size={20} className="text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                                    : <DollarSign size={20} className="text-slate-400 group-focus-within:text-emerald-500 transition-colors" />}
                            </div>
                            <input
                                ref={inputRef}
                                type="number"
                                inputMode="decimal"
                                step="any"
                                min="0"
                                value={value}
                                onChange={(e) => {
                                    let val = e.target.value;
                                    if (type === 'percentage' && parseFloat(val) > 100) val = '100';
                                    setValue(val);
                                }}
                                className="w-full bg-white dark:bg-slate-950 border-2 border-slate-200 dark:border-slate-800 rounded-2xl py-4 pl-12 pr-4 text-2xl font-black text-slate-800 dark:text-white placeholder:text-slate-300 dark:placeholder:text-slate-700 focus:outline-none focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-center"
                                placeholder={type === 'percentage' ? "0%" : "0.00"}
                                autoFocus
                            />
                        </div>

                        {/* Limit warning */}
                        {needsApproval && (
                            <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 rounded-xl px-3 py-2">
                                <ShieldAlert size={14} className="text-amber-600 shrink-0" />
                                <p className="text-[11px] font-bold text-amber-700 dark:text-amber-400">
                                    Supera el límite de {maxDiscountPercent}% para cajeros. Se requerirá PIN de admin.
                                </p>
                            </div>
                        )}

                        {/* Preview */}
                        <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 space-y-2">
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-500 font-medium">Subtotal:</span>
                                <span className="text-slate-700 dark:text-slate-300 font-bold">${cartSubtotalUsd.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-red-500 font-medium tracking-tight">Descuento aplicado:</span>
                                <span className="text-red-500 font-black">-${discountAmountUsd.toFixed(2)}</span>
                            </div>
                            <div className="pt-2 mt-2 border-t border-slate-200 dark:border-slate-700 flex justify-between items-end">
                                <span className="text-sm font-bold text-slate-600 dark:text-slate-400">Total Final:</span>
                                <div className="text-right">
                                    <span className="text-xl font-black text-emerald-600 dark:text-emerald-400 leading-none block">${newTotalUsd.toFixed(2)}</span>
                                    <span className="text-xs font-bold text-slate-400">Bs {formatBs(newTotalBs)}</span>
                                    {copEnabled && tasaCop > 0 && (
                                        <span className="text-[10px] font-bold text-slate-400 block">
                                            {(newTotalUsd * tasaCop).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} COP
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="grid grid-cols-2 gap-3 pt-2">
                            <button type="button" onClick={handleClear}
                                className="py-3.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold rounded-xl active:scale-95 transition-all outline-none">
                                Quitar
                            </button>
                            <button type="submit"
                                className={`py-3.5 font-bold rounded-xl active:scale-95 transition-all outline-none shadow-lg text-white ${needsApproval ? 'bg-amber-500 hover:bg-amber-600 shadow-amber-500/30' : 'bg-blue-500 hover:bg-blue-600 shadow-blue-500/30'}`}>
                                {needsApproval ? 'Solicitar →' : 'Aplicar'}
                            </button>
                        </div>
                    </form>
                ) : (
                    /* PIN approval screen */
                    <div className="p-5 flex flex-col items-center gap-5">
                        <p className="text-sm text-slate-500 dark:text-slate-400 text-center">
                            El cajero quiere aplicar un <span className="font-black text-slate-800 dark:text-white">{type === 'percentage' ? `${numValue}%` : `$${numValue}`}</span> de descuento.<br />
                            <span className="text-[11px]">Un admin debe ingresar su PIN de 6 dígitos.</span>
                        </p>

                        {/* PIN dots */}
                        <div className={`flex justify-center gap-3 ${pinError ? 'animate-shake' : ''}`}>
                            {Array.from({ length: 6 }).map((_, i) => (
                                <div key={i} className={`w-3.5 h-3.5 rounded-full border-2 transition-all duration-150 ${
                                    pinError ? 'bg-red-500 border-red-500' :
                                    i < adminPin.length ? 'bg-violet-500 border-violet-500 scale-110' : 'bg-transparent border-slate-300'
                                }`} />
                            ))}
                        </div>

                        {/* Numpad */}
                        <div className="grid grid-cols-3 gap-2.5 w-full max-w-[240px]">
                            {[1,2,3,4,5,6,7,8,9].map(n => (
                                <button key={n} type="button" onClick={() => handlePinDigit(String(n))}
                                    className="h-12 rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-white text-lg font-bold hover:bg-slate-100 dark:hover:bg-slate-700 active:scale-95 border border-slate-200 dark:border-slate-700 transition-all">
                                    {n}
                                </button>
                            ))}
                            <div />
                            <button type="button" onClick={() => handlePinDigit('0')}
                                className="h-12 rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-white text-lg font-bold hover:bg-slate-100 dark:hover:bg-slate-700 active:scale-95 border border-slate-200 dark:border-slate-700 transition-all">
                                0
                            </button>
                            <button type="button" onClick={handlePinDelete}
                                className="h-12 rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-400 flex items-center justify-center hover:bg-red-50 hover:text-red-500 active:scale-95 border border-slate-200 dark:border-slate-700 transition-all">
                                <Delete size={20} />
                            </button>
                        </div>

                        {pinError && <p className="text-xs font-bold text-red-500">PIN incorrecto</p>}

                        <style>{`
                            @keyframes shake { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-8px)} 40%{transform:translateX(8px)} 60%{transform:translateX(-5px)} 80%{transform:translateX(5px)} }
                            .animate-shake{animation:shake 0.4s ease-in-out}
                        `}</style>
                    </div>
                )}
            </div>
        </div>
    );
}
