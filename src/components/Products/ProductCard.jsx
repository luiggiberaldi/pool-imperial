import React, { useState, useRef } from 'react';
import { Tag, AlertTriangle, Minus, Plus, Pencil, Trash2, Package, Layers, Clock, Printer, Check, Gift } from 'lucide-react';
import { CATEGORY_COLORS, CATEGORY_ICONS, UNITS } from '../../config/categories';
import { formatUsd, formatBs, smartCashRounding } from '../../utils/calculatorUtils';

export default function ProductCard({
    product: p,
    effectiveRate,
    streetRate,
    categories,
    onAdjustStock,
    onConfirmStock,   // NEW: called when user confirms staged changes, triggers immediate cloud push
    copEnabled,
    tasaCop,
    daysRemaining,
    isSelected,
    onToggleSelect,
    onPrint,
    readOnly = false,
    onEdit,
    onDelete,
    allProducts
}) {
    // Staged delta: tracks uncommitted stock changes before the user confirms
    const [delta, setDelta] = useState(0);
    const [isConfirming, setIsConfirming] = useState(false);
    // baseStockRef: captura el stock EN EL MOMENTO que el usuario empieza a editar.
    // Esto evita que actualizaciones de fondo (sync entre dispositivos) cambien el
    // número mostrado en el botón de confirmar mientras el usuario está editando.
    const baseStockRef = useRef(null);

    const valBs = p.priceBs > 0 ? p.priceBs : p.priceUsdt * effectiveRate;
    const valCop = p.priceUsdt * tasaCop;
    // Si hay una edición en curso, usar el stock base capturado; si no, el actual del contexto
    const currentBase = baseStockRef.current !== null ? baseStockRef.current : (p.stock ?? 0);
    const stagedStock = currentBase + delta;
    const isLowStock = stagedStock <= (p.lowStockAlert ?? 5);
    const margin = p.costBs > 0 ? ((valBs - p.costBs) / p.costBs * 100) : null;
    const catInfo = categories.find(c => c.id === p.category);
    const unitInfo = UNITS.find(u => u.id === p.unit);
    const _efectivoPrecio = streetRate > 0 ? `$${smartCashRounding(valBs / streetRate)}` : null;

    const handleMinus = () => {
        // Capturar base la primera vez que se toca +/-
        if (baseStockRef.current === null) baseStockRef.current = p.stock ?? 0;
        setDelta(prev => prev - 1);
    };
    const handlePlus = () => {
        if (baseStockRef.current === null) baseStockRef.current = p.stock ?? 0;
        setDelta(prev => prev + 1);
    };

    const handleConfirm = async () => {
        if (delta === 0) return;
        setIsConfirming(true);
        try {
            if (onConfirmStock) {
                await onConfirmStock(p.id, delta);
            } else {
                onAdjustStock(p.id, delta);
            }
            setDelta(0);
            baseStockRef.current = null; // Liberar el bloqueo
        } finally {
            setIsConfirming(false);
        }
    };

    const handleCancel = () => {
        setDelta(0);
        baseStockRef.current = null; // Liberar el bloqueo
    };

    return (
        <div className={`bg-white dark:bg-slate-900 rounded-2xl shadow-sm border flex flex-col overflow-hidden group transition-all ${isLowStock && delta === 0 ? 'border-amber-300 dark:border-amber-700' : delta !== 0 ? 'border-brand ring-2 ring-brand/30 shadow-brand/10' : 'border-slate-100 dark:border-slate-800'} ${isSelected ? 'ring-2 ring-brand border-brand shadow-brand/20 bg-brand/5 dark:bg-brand/10' : ''}`}>
            {/* Image */}
            <div className="w-full h-20 sm:h-24 md:h-28 bg-slate-100 dark:bg-slate-800 overflow-hidden relative shrink-0">
                {/* Select Checkbox */}
                <div className="absolute top-1 left-1 z-10 w-6 h-6 flex items-center justify-center bg-white/80 dark:bg-slate-900/80 rounded backdrop-blur-sm">
                    <input type="checkbox" checked={isSelected} onChange={onToggleSelect} className="w-4 h-4 rounded border-slate-300 text-brand focus:ring-brand cursor-pointer shadow-sm" />
                </div>
                {p.image ? (
                    <img src={p.image} className="w-full h-full object-contain p-1" alt={p.name} loading="lazy" />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-300 dark:text-slate-600">
                        <Tag size={24} />
                    </div>
                )}
                {/* Category badge */}
                {catInfo && catInfo.id !== 'otros' && (
                    <div className={`absolute top-1 left-8 text-[9px] sm:text-xs font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5 ${CATEGORY_COLORS[catInfo.color] || ''}`}>
                        {(() => { const CatIcon = CATEGORY_ICONS[catInfo.id]; return CatIcon ? <CatIcon size={9} /> : catInfo.icon; })()} {catInfo.label}
                    </div>
                )}
                {/* Low stock alert */}
                {isLowStock && delta === 0 && (
                    <div className="absolute top-1 right-1 bg-amber-500/90 backdrop-blur-sm text-white text-[9px] sm:text-xs font-black px-1.5 py-0.5 rounded flex items-center gap-0.5">
                        <AlertTriangle size={9} /> Bajo
                    </div>
                )}
                {/* Staging indicator */}
                {delta !== 0 && (
                    <div className={`absolute top-1 right-1 backdrop-blur-sm text-white text-[9px] sm:text-xs font-black px-1.5 py-0.5 rounded flex items-center gap-0.5 ${delta > 0 ? 'bg-brand/90' : 'bg-rose-500/90'}`}>
                        {delta > 0 ? '+' : ''}{delta}
                    </div>
                )}
            </div>

            {/* Info */}
            <div className="p-3 flex flex-col flex-1">
                <h3 className="font-bold text-slate-700 dark:text-slate-200 text-[13px] sm:text-sm leading-tight line-clamp-2 mb-2">{p.name}</h3>

                {p.isCombo && (() => {
                    // Resolve combo items (new multi-product format or legacy)
                    const items = p.comboItems?.length > 0
                        ? p.comboItems.map(ci => ({
                            product: allProducts?.find(lp => lp.id === ci.productId),
                            qty: ci.qty
                        }))
                        : p.linkedProductId
                            ? [{ product: allProducts?.find(lp => lp.id === p.linkedProductId), qty: p.linkedQty }]
                            : [];

                    const availQty = items.length > 0 && items.every(i => i.product && i.qty > 0)
                        ? Math.min(...items.map(i => Math.floor(i.product.stock / i.qty)))
                        : null;

                    return (
                        <div className="text-[10px] sm:text-xs font-bold text-violet-600 dark:text-violet-400 mb-2 mt-[-4px] space-y-0.5">
                            <div className="flex items-center gap-1.5">
                                <Gift size={11} />
                                <span>Combo{items.length > 1 ? ` · ${items.length} productos` : ''}</span>
                                {availQty !== null && <span className="text-slate-400 ml-auto">({availQty} disp)</span>}
                            </div>
                            {items.map((item, idx) => (
                                <div key={idx} className="ml-4 text-violet-500/70 dark:text-violet-400/60">
                                    {item.qty}x {item.product?.name || '?'}
                                </div>
                            ))}
                        </div>
                    );
                })()}

                {p.unit === 'paquete' && p.unitsPerPackage && (
                    <div className="flex items-center gap-1 text-[10px] sm:text-xs font-bold text-indigo-500 dark:text-indigo-400 mb-2 mt-[-4px]">
                        <Package size={11} /> Lote · {p.unitsPerPackage} uds
                    </div>
                )}

                <div className="flex justify-between items-end mb-3">
                    <div>
                        <p className="text-lg font-black text-emerald-600 dark:text-emerald-400 leading-none">
                            {formatUsd(p.priceUsdt)} <span className="text-[10px] sm:text-xs font-bold text-emerald-600/50 dark:text-emerald-400/50">USD {(p.unit === 'kg' || p.unit === 'litro') ? `/ ${unitInfo?.short || 'ud'}` : ''}</span>
                        </p>
                        <p className="text-[11px] sm:text-xs font-bold text-slate-400 mt-1">{formatBs(valBs)} Bs</p>
                        {copEnabled && (
                            <p className="text-[11px] sm:text-xs font-bold text-amber-500/80 mt-0.5">{valCop.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} COP</p>
                        )}
                        {p.unit === 'paquete' && p.sellByUnit && (
                            <p className="text-[10px] sm:text-xs font-bold text-indigo-500 dark:text-indigo-400 mt-0.5 flex items-center gap-0.5">
                                <Layers size={10} />
                                ${(p.unitPriceUsd ?? p.priceUsdt / (p.unitsPerPackage || 1)).toFixed(2)} / ud
                            </p>
                        )}
                    </div>
                    {!readOnly && margin !== null && (
                        <span className={`text-[10px] sm:text-xs font-black px-2 py-1 rounded-lg ${margin >= 0 ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400' : 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400'}`}>
                            {margin >= 0 ? '+' : ''}{margin.toFixed(0)}%
                        </span>
                    )}
                </div>

                {/* Stock Control — oculto para combos (su stock se calcula de los componentes) */}
                {p.isCombo ? (
                    <div className="mt-auto pt-2 border-t border-slate-100 dark:border-slate-800">
                        {(() => {
                            const items = p.comboItems?.length > 0
                                ? p.comboItems.map(ci => ({
                                    product: allProducts?.find(lp => lp.id === ci.productId),
                                    qty: ci.qty
                                }))
                                : p.linkedProductId
                                    ? [{ product: allProducts?.find(lp => lp.id === p.linkedProductId), qty: p.linkedQty }]
                                    : [];
                            const availQty = items.length > 0 && items.every(i => i.product && i.qty > 0)
                                ? Math.min(...items.map(i => Math.floor((i.product.stock ?? 0) / i.qty)))
                                : null;
                            const isLow = availQty !== null && availQty <= 5;
                            return (
                                <div className="flex flex-col items-center justify-center py-2 gap-1">
                                    <span className={`text-base font-black leading-none ${availQty === 0 ? 'text-red-500' : isLow ? 'text-amber-500' : 'text-violet-600 dark:text-violet-400'}`}>
                                        {availQty !== null ? availQty : '?'}
                                    </span>
                                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">DISPONIBLES</span>
                                    {availQty === 0 && <span className="text-[9px] font-bold text-red-500">Agotado</span>}
                                </div>
                            );
                        })()}
                    </div>
                ) : (
                <div className="mt-auto pt-2 border-t border-slate-100 dark:border-slate-800">
                    <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-800/50 rounded-xl p-1">
                        {!readOnly && (
                            <button
                                onClick={handleMinus}
                                className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-white dark:bg-slate-700 flex items-center justify-center text-slate-500 hover:text-red-500 shadow-sm active:scale-95 transition-all"
                            >
                                <Minus size={18} strokeWidth={2.5} />
                            </button>
                        )}
                        <div className="flex flex-col items-center justify-center px-2 text-center min-w-[50px]">
                            <span className={`text-base font-black leading-none mb-0.5 transition-colors ${delta !== 0 ? 'text-brand dark:text-brand' : isLowStock ? 'text-amber-500' : 'text-slate-700 dark:text-slate-200'}`}>
                                {stagedStock}
                            </span>
                            <span className="text-[9px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider leading-none">{(p.unit === 'kg' || p.unit === 'litro') ? unitInfo?.short : 'UND'}</span>
                            {p.unit === 'paquete' && p.unitsPerPackage > 0 && Math.floor(stagedStock / p.unitsPerPackage) > 0 && (
                                <span className="text-[8px] sm:text-[10px] text-slate-400 leading-none">= {Math.floor(stagedStock / p.unitsPerPackage)} lotes</span>
                            )}
                        </div>
                        {!readOnly && (
                            <button
                                onClick={handlePlus}
                                className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-white dark:bg-slate-700 flex items-center justify-center text-slate-500 hover:text-emerald-500 shadow-sm active:scale-95 transition-all"
                            >
                                <Plus size={18} strokeWidth={2.5} />
                            </button>
                        )}
                    </div>

                    {/* Confirm / Cancel — premium mobile-optimized */}
                    {delta !== 0 && !readOnly && (
                        <div className="mt-2 flex flex-col gap-1.5 animate-[fadeIn_0.15s_ease]">
                            <button
                                onClick={handleConfirm}
                                disabled={isConfirming}
                                className="w-full h-12 rounded-2xl text-sm sm:text-base font-bold text-white bg-brand active:scale-[0.97] transition-all flex items-center justify-center gap-2 shadow-lg shadow-brand/30 disabled:opacity-60 overflow-hidden"
                            >
                                {isConfirming ? (
                                    <span className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                                ) : (
                                    <>
                                        <div className="bg-white/20 p-1 rounded-lg">
                                            <Check size={14} strokeWidth={4} />
                                        </div>
                                        <span className="whitespace-nowrap">
                                            Confirmar ({delta > 0 ? '+' : ''}{delta})
                                        </span>
                                    </>
                                )}
                            </button>
                            <button
                                onClick={handleCancel}
                                className="w-full py-2 text-[11px] sm:text-xs font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors text-center uppercase tracking-widest"
                            >
                                Cancelar
                            </button>
                        </div>
                    )}

                    {/* Days Remaining Badge */}
                    {daysRemaining !== null && daysRemaining !== undefined && delta === 0 && (
                        <div className={`flex items-center justify-center gap-1 mt-1.5 py-1 rounded-lg text-[10px] sm:text-xs font-bold ${
                            daysRemaining <= 3
                                ? 'bg-red-50 dark:bg-red-900/20 text-red-500'
                                : daysRemaining <= 7
                                    ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-500'
                                    : 'bg-blue-50 dark:bg-blue-900/20 text-blue-500'
                        }`}>
                            <Clock size={10} />
                            {daysRemaining <= 3
                                ? `Agotado en ~${daysRemaining}d`
                                : `~${daysRemaining} dias de stock`
                            }
                        </div>
                    )}
                </div>
            )}
            </div>

            {/* Actions */}
            <div className="flex border-t border-slate-100 dark:border-slate-800">
                <button onClick={onPrint} className="flex-1 py-1.5 flex items-center justify-center text-slate-300 dark:text-slate-600 hover:text-brand hover:bg-brand/10 transition-colors" title="Imprimir Etiqueta"><Printer size={12} /></button>
                {!readOnly && <button onClick={() => onEdit(p)} className="flex-1 py-1.5 flex items-center justify-center text-slate-300 dark:text-slate-600 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"><Pencil size={12} /></button>}
                {!readOnly && <button onClick={() => onDelete(p.id)} className="flex-1 py-1.5 flex items-center justify-center text-slate-300 dark:text-slate-600 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors"><Trash2 size={12} /></button>}
            </div>
        </div>
    );
}
