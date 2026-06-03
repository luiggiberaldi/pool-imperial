import React, { useState } from 'react';
import { ShoppingCart, Plus, Minus, X, CheckCircle, Package, Trash2, DollarSign, Percent } from 'lucide-react';



// Formatea un número como peso colombiano: $ 12.500
const formatCOP = (val) => new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', minimumFractionDigits: 0
}).format(Math.round(val || 0));

export default function CartPanel({
    cart,
    effectiveRate,
    cartSubtotalUsd,
    cartTotalUsd,
    cartItemCount,
    discountData,
    onOpenDiscount,
    updateQty,
    removeFromCart,
    onCheckout,
    onClearCart,
    triggerHaptic,
    cartSelectedIndex,
    totalTax = 0,
    taxBreakdown = {},
}) {
    const [editingQtyId, setEditingQtyId] = React.useState(null);
    const [tempQty, setTempQty] = React.useState('');
    const inputRef = React.useRef(null);

    const getCartFinancialBreakdown = () => {
        let exemptBase = 0;
        let taxedBase = 0;

        cart.forEach(item => {
            const qty = Number(item.qty) || 0;
            const price = Number(item.priceUsd) || 0;
            const taxType = item.taxType || 'exento';
            const taxMode = item.taxMode || 'inclusive';

            let taxRate = 0;
            if (taxType === 'iva_19') taxRate = 0.19;
            else if (taxType === 'impoconsumo_8') taxRate = 0.08;

            let baseVal = price;
            if (taxType !== 'exento' && taxRate > 0) {
                if (taxMode === 'inclusive') {
                    baseVal = price / (1 + taxRate);
                }
            }

            const lineBase = baseVal * qty;

            if (taxType === 'exento' || taxRate === 0) {
                exemptBase += lineBase;
            } else {
                taxedBase += lineBase;
            }
        });

        // Apply discount ratio if active
        let discountAmountUsd = 0;
        const initialTotal = cart.reduce((sum, item) => {
            const qty = Number(item.qty) || 0;
            const price = Number(item.priceUsd) || 0;
            const taxType = item.taxType || 'exento';
            const taxMode = item.taxMode || 'inclusive';
            
            let taxRate = 0;
            if (taxType === 'iva_19') taxRate = 0.19;
            else if (taxType === 'impoconsumo_8') taxRate = 0.08;

            let totalVal = price;
            if (taxType !== 'exento' && taxRate > 0 && taxMode === 'exclusive') {
                totalVal = price * (1 + taxRate);
            }
            return sum + (totalVal * qty);
        }, 0);

        if (discountData && discountData.value > 0) {
            if (discountData.type === 'percentage') {
                discountAmountUsd = initialTotal * (discountData.value / 100);
            } else if (discountData.type === 'fixed') {
                discountAmountUsd = Number(discountData.value);
            }
        }

        if (discountAmountUsd > initialTotal) discountAmountUsd = initialTotal;
        const discountRatio = initialTotal > 0 ? (initialTotal - discountAmountUsd) / initialTotal : 0;

        exemptBase = Math.round(exemptBase * discountRatio);
        taxedBase = Math.round(taxedBase * discountRatio);

        return {
            exemptBase,
            taxedBase
        };
    };

    const handleQtyClick = (item) => {
        setEditingQtyId(item.id);
        setTempQty(item.qty.toString());
        setTimeout(() => inputRef.current?.focus(), 50);
    };

    const submitCustomQty = (item) => {
        setEditingQtyId(null);
        let parsed = parseFloat(tempQty.replace(',', '.'));
        if (isNaN(parsed) || parsed <= 0) return; // Ignore invalid values
        
        // Calculate difference and call updateQty (+ delta)
        const diff = parsed - item.qty;
        if (diff !== 0) {
            updateQty(item.id, diff);
        }
    };

    return (
        <>
        <div className="lg:flex-1 lg:min-h-0 flex flex-col bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm">

            {/* Header */}
            <div className="shrink-0 px-4 pb-2 pt-3 sm:py-3 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-950/50 rounded-t-2xl sm:rounded-t-3xl">
                <span className="text-[10px] sm:text-xs font-black text-slate-400 uppercase tracking-wider">Cesta de Compra</span>
                <div className="flex items-center gap-3">
                    {cart.length > 0 && (
                        <button onClick={onClearCart} className="text-[10px] sm:text-xs font-bold text-red-500 hover:text-red-700 flex items-center gap-1 transition-colors bg-red-50 dark:bg-red-900/20 px-2 py-1 rounded-lg">
                            <Trash2 size={12} /> Vaciar
                        </button>
                    )}
                    <span className="text-xs font-bold text-slate-500 bg-slate-200 dark:bg-slate-800 px-2 py-0.5 rounded-full">{cartItemCount} items</span>
                </div>
            </div>

            {/* Cart Items — scrollable area with touch support */}
            <div
                data-tour="cart-items"
                className="lg:flex-1 lg:min-h-0 lg:overflow-y-auto overscroll-contain p-2 sm:p-3"
                style={{ WebkitOverflowScrolling: 'touch' }}
            >
                {cart.length === 0 ? (
                    <div className="flex flex-col items-center justify-center text-slate-300 dark:text-slate-700 p-6 text-center h-full">
                        <ShoppingCart size={48} className="mb-4 opacity-50 sm:w-[72px] sm:h-[72px]" strokeWidth={1} />
                        <p className="text-sm sm:text-base font-bold text-slate-400">Cesta vacía</p>
                        <p className="text-xs text-slate-500 mt-1">Busca un producto para empezar a vender.</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {cart.map((item, idx) => {
                            const qtyDisplay = item.isWeight ? `${item.qty.toFixed(3)} Kg` : item.qty;
                            const isCustomProduct = item.id.toString().startsWith('custom_') || item.name === 'Venta Libre';
                            const isEditing = editingQtyId === item.id;
                            const isSelected = cartSelectedIndex === idx;

                            return (
                                <div key={item.id} className={`group bg-white dark:bg-slate-900 rounded-xl sm:rounded-2xl p-2 pr-6 sm:p-3 sm:pr-10 md:p-4 md:pr-12 border flex items-center justify-between gap-2 sm:gap-3 transition-colors relative ${
                                    isSelected 
                                        ? 'border-emerald-500 ring-2 ring-emerald-500/20 dark:border-emerald-400 dark:ring-emerald-400/20' 
                                        : 'border-slate-100 dark:border-slate-800/80 hover:border-emerald-200 dark:hover:border-emerald-800'
                                }`}>
                                    <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                                        <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl flex items-center justify-center shrink-0 overflow-hidden ${isCustomProduct ? 'bg-emerald-50 dark:bg-emerald-900/40 text-emerald-600' : 'bg-slate-50 dark:bg-slate-950'}`}>
                                            {item.image ? (
                                                <img src={item.image} className="w-full h-full object-contain mix-blend-multiply dark:mix-blend-normal" />
                                            ) : isCustomProduct ? (
                                                <DollarSign size={20} className="sm:w-[22px] sm:h-[22px]" />
                                            ) : (
                                                <Package size={16} className="text-slate-300 sm:w-[18px] sm:h-[18px]" strokeWidth={1.5} />
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0 pr-1">
                                            <p className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-100 leading-tight mb-0.5 sm:mb-1 truncate">{item.name}</p>
                                            <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
                                                <p className="text-[10px] sm:text-[11px] md:text-xs font-black text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 px-1 sm:px-1.5 rounded">{formatCOP(item.priceUsd)}</p>
                                                {item.taxType !== 'exento' && item.taxMode === 'exclusive' && (
                                                    <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800/80 px-1 py-0.5 rounded">
                                                        + {item.taxType === 'iva_19' ? '19% IVA' : '8% Impo.'}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex flex-col items-end shrink-0 gap-1.5 sm:gap-2">
                                        <p className="text-sm sm:text-base font-black text-slate-800 dark:text-white text-right leading-none">
                                            {formatCOP(item.priceUsd * item.qty)}
                                            {item.taxType !== 'exento' && item.taxMode === 'exclusive' && (
                                                <span className="text-[8px] text-slate-400 dark:text-slate-500 font-black block text-right mt-1">+ IVA</span>
                                            )}
                                        </p>
                                        <div className="flex items-center bg-slate-50 dark:bg-slate-800 rounded-lg p-0.5 border border-slate-100 dark:border-slate-700">
                                            <button onClick={() => updateQty(item.id, item.isWeight ? -0.1 : -1)} className="w-7 sm:w-8 h-7 sm:h-8 flex items-center justify-center text-slate-400 hover:text-red-500 transition-colors rounded-l-md active:bg-slate-200 dark:active:bg-slate-700"><Minus size={14} strokeWidth={3} /></button>
                                            
                                            {isEditing ? (
                                                <input
                                                    ref={inputRef}
                                                    type="number"
                                                    value={tempQty}
                                                    onChange={e => setTempQty(e.target.value)}
                                                    onBlur={() => submitCustomQty(item)}
                                                    onKeyDown={e => { if (e.key === 'Enter') submitCustomQty(item) }}
                                                    className="w-12 sm:w-16 h-7 sm:h-8 text-center font-black text-slate-700 bg-white dark:bg-slate-900 dark:text-white border border-emerald-500 rounded text-xs outline-none"
                                                    step={item.isWeight ? "0.01" : "1"}
                                                />
                                            ) : (
                                                <span 
                                                    onClick={() => handleQtyClick(item)} 
                                                    className="w-10 sm:w-12 text-center font-black text-slate-700 dark:text-white text-[11px] sm:text-xs cursor-pointer hover:text-emerald-500 transition-colors"
                                                >
                                                    {qtyDisplay}
                                                </span>
                                            )}

                                            <button onClick={() => updateQty(item.id, item.isWeight ? 0.1 : 1)} className="w-7 sm:w-8 h-7 sm:h-8 flex items-center justify-center text-slate-400 hover:text-emerald-500 transition-colors rounded-r-md active:bg-slate-200 dark:active:bg-slate-700"><Plus size={14} strokeWidth={3} /></button>
                                        </div>
                                    </div>
                                    <button onClick={() => removeFromCart(item.id)} className="absolute -top-1 -right-1 sm:top-2 sm:right-2 p-1.5 bg-red-50 dark:bg-red-900/40 text-red-500 sm:bg-transparent sm:text-slate-300 sm:hover:text-red-500 opacity-80 sm:opacity-0 group-hover:opacity-100 transition-opacity rounded-full sm:rounded-lg">
                                        <X size={12} className="sm:w-[14px] sm:h-[14px]" />
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Footer — shrink-0, always visible at bottom of flex container */}
            <div className="shrink-0 p-3 sm:p-4 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 rounded-b-2xl sm:rounded-b-3xl space-y-2 sm:space-y-3">
                
                {/* Botón de Descuento */}
                <button
                    data-tour="cart-discount"
                    onClick={() => { triggerHaptic && triggerHaptic(); onOpenDiscount(); }}
                    disabled={cart.length === 0}
                    className={`w-full py-2 sm:py-2.5 px-3 sm:px-4 rounded-xl sm:rounded-2xl flex items-center justify-between transition-all outline-none focus:ring-2 focus:ring-emerald-500/50 ${discountData?.active ? 'bg-amber-100/80 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/60' : 'bg-slate-50 dark:bg-slate-800/50 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 border border-slate-200 dark:border-slate-700 disabled:opacity-50 disabled:cursor-not-allowed'}`}
                >
                    <div className="flex items-center gap-2 sm:gap-3">
                        <Percent size={16} className={discountData?.active ? 'text-amber-600 dark:text-amber-500' : ''} />
                        <span className="text-[13px] sm:text-sm font-bold">
                            {discountData?.active ? 'Descuento Aplicado' : 'Añadir Descuento'}
                        </span>
                    </div>
                    {discountData?.active && (
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] sm:text-xs font-bold bg-amber-200 dark:bg-amber-800/80 px-2 py-0.5 rounded-md">
                                {discountData.type === 'percentage' ? `${discountData.value}%` : 'Fijo'}
                            </span>
                            <span className="font-black">-{formatCOP(discountData.amountUsd)}</span>
                        </div>
                    )}
                </button>

                {/* Desglose de impuestos en la cesta */}
                {totalTax > 0 && (() => {
                    const { exemptBase, taxedBase } = getCartFinancialBreakdown();
                    return (
                        <div className="px-1 py-1.5 border-t border-dashed border-slate-200 dark:border-slate-800 space-y-1.5 text-xs text-slate-500 dark:text-slate-400 select-none animate-in fade-in duration-200">
                            {exemptBase > 0 && (
                                <div className="flex justify-between font-medium">
                                    <span>Subtotal Exento:</span>
                                    <span className="text-slate-700 dark:text-slate-300">{formatCOP(exemptBase)}</span>
                                </div>
                            )}
                            {taxedBase > 0 && (
                                <div className="flex justify-between font-medium">
                                    <span>Base Gravable:</span>
                                    <span className="text-slate-700 dark:text-slate-300">{formatCOP(taxedBase)}</span>
                                </div>
                            )}
                            <div className="flex justify-between font-semibold border-t border-slate-100 dark:border-slate-800/40 pt-1">
                                <span>Subtotal (sin IVA):</span>
                                <span className="text-slate-700 dark:text-slate-300">{formatCOP(exemptBase + taxedBase)}</span>
                            </div>
                            {taxBreakdown && Object.entries(taxBreakdown).map(([taxKey, taxVal]) => {
                                if (taxVal <= 0) return null;
                                const taxLabel = taxKey === 'iva_19' ? 'IVA (19%)' : taxKey === 'impoconsumo_8' ? 'Impoconsumo (8%)' : taxKey;
                                return (
                                    <div key={taxKey} className="flex justify-between font-bold text-slate-650 dark:text-slate-300">
                                        <span>{taxLabel}:</span>
                                        <span>{formatCOP(taxVal)}</span>
                                    </div>
                                );
                            })}
                        </div>
                    );
                })()}

                <div data-tour="cart-total" className="flex justify-between items-end px-1 sm:px-0 pt-1">
                    <div className="flex flex-col">
                        <span className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-widest hidden sm:inline">Total Venta</span>
                        {discountData?.active && (
                            <div className="flex flex-col mt-0.5 fade-in slide-in-from-left-2 animate-in duration-300">
                                <span className="text-[11px] sm:text-xs font-bold text-slate-400 line-through decoration-red-400/70">
                                    Subtotal: {formatCOP(cartSubtotalUsd)}
                                </span>
                            </div>
                        )}
                    </div>
                    <div className="text-right">
                        <p className={`text-2xl sm:text-3xl font-black leading-none tracking-tight transition-colors ${discountData?.active ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-800 dark:text-white'}`}>
                            {formatCOP(cartTotalUsd)}
                        </p>
                    </div>
                </div>

                <button
                    data-tour="checkout-btn"
                    disabled={cart.length === 0}
                    onClick={onCheckout}
                    className="w-full relative group disabled:opacity-50 disabled:cursor-not-allowed">
                    <div className="absolute inset-0 bg-emerald-500 rounded-xl sm:rounded-2xl shadow-emerald-500/30 shadow-lg blur-[2px] opacity-70 group-active:opacity-100 group-hover:blur-[4px] transition-all"></div>
                    <div className="relative w-full py-3 sm:py-4 bg-emerald-500 text-white font-black text-sm sm:text-lg rounded-xl sm:rounded-2xl active:scale-[0.98] transition-all flex items-center justify-center gap-2 tracking-wide">
                        <CheckCircle size={18} className="sm:w-[22px] sm:h-[22px] opacity-80" />
                        PROCESAR COBRO
                    </div>
                </button>
            </div>
        </div>
        </>
    );
}
