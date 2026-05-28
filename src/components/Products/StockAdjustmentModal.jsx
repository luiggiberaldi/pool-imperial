import React, { useState, useMemo, useRef, useCallback } from 'react';
import { Modal } from '../Modal';
import { Search, TrendingUp, TrendingDown, Check, Package, X, AlertTriangle, Minus, Plus } from 'lucide-react';
import { showToast } from '../Toast';

function ProductRow({ p, qty, direction, isSelected, maxStock, onTapAdd, onSetQty }) {
    const stock = p.stock ?? 0;
    const lowAlert = p.lowStockAlert ?? 5;
    const isLow = stock <= lowAlert;
    const stockPct = Math.min(100, Math.max(0, (stock / maxStock) * 100));
    const newStock = direction === 'ingreso' ? stock + qty : Math.max(0, stock - qty);

    return (
        <div
            className={`flex items-center gap-3 px-3 py-3 transition-all ${
                isSelected
                    ? direction === 'ingreso'
                        ? 'bg-emerald-50/70 dark:bg-emerald-950/30'
                        : 'bg-red-50/70 dark:bg-red-950/30'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer active:bg-slate-100 dark:active:bg-slate-800'
            }`}
            onClick={!isSelected ? () => onTapAdd(p.id) : undefined}
        >
            <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-700 dark:text-slate-200 truncate">{p.name}</p>
                <div className="flex items-center gap-2 mt-1">
                    <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden max-w-[80px]">
                        <div
                            className={`h-full rounded-full transition-all ${isLow ? 'bg-amber-400' : 'bg-sky-400'}`}
                            style={{ width: `${stockPct}%` }}
                        />
                    </div>
                    <span className={`text-[11px] font-bold ${isLow ? 'text-amber-500' : 'text-slate-500 dark:text-slate-400'}`}>
                        {stock}
                    </span>
                    {isSelected && (
                        <span className={`text-[11px] font-black ${direction === 'ingreso' ? 'text-emerald-500' : 'text-red-500'}`}>
                            → {newStock}
                        </span>
                    )}
                </div>
            </div>

            {isSelected ? (
                <div className="flex items-center gap-1.5 shrink-0">
                    <button onClick={(e) => { e.stopPropagation(); onSetQty(p.id, qty - 1); }}
                        disabled={qty <= 0}
                        className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 hover:text-red-500 disabled:opacity-30 transition-all active:scale-90">
                        <Minus size={18} strokeWidth={2.5} />
                    </button>
                    <input type="number" value={qty || ''} placeholder="0"
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => onSetQty(p.id, e.target.value)}
                        className="w-14 h-10 text-center text-base font-black bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-600 rounded-xl outline-none focus:ring-2 focus:ring-brand/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                    <button onClick={(e) => { e.stopPropagation(); onSetQty(p.id, qty + 1); }}
                        className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 hover:text-emerald-500 transition-all active:scale-90">
                        <Plus size={18} strokeWidth={2.5} />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); onSetQty(p.id, 0); }}
                        className="w-10 h-10 rounded-xl bg-red-50 dark:bg-red-950/30 flex items-center justify-center text-red-400 hover:text-red-600 transition-all active:scale-90">
                        <X size={16} strokeWidth={2.5} />
                    </button>
                </div>
            ) : (
                <div className="shrink-0 w-10 h-10 rounded-xl bg-slate-50 dark:bg-slate-800 border-2 border-dashed border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-300 dark:text-slate-600">
                    <Plus size={16} />
                </div>
            )}
        </div>
    );
}

export default function StockAdjustmentModal({
    isOpen, onClose, products, adjustStock, triggerHaptic,
}) {
    const [direction, setDirection] = useState('egreso');
    const [search, setSearch] = useState('');
    const [adjustments, setAdjustments] = useState({});
    const [note, setNote] = useState('');
    const [isApplying, setIsApplying] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const listRef = useRef(null);

    const allProducts = useMemo(() =>
        (products || []).filter(p => !p.isCombo),
    [products]);

    const selectedProducts = useMemo(() =>
        allProducts.filter(p => (adjustments[p.id] || 0) > 0)
            .sort((a, b) => a.name.localeCompare(b.name)),
    [allProducts, adjustments]);

    const unselectedProducts = useMemo(() => {
        const term = search.toLowerCase().trim();
        return allProducts
            .filter(p => (adjustments[p.id] || 0) === 0)
            .filter(p => !term || p.name.toLowerCase().includes(term))
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [allProducts, search, adjustments]);

    const activeAdjustments = useMemo(() =>
        Object.entries(adjustments).filter(([, qty]) => qty > 0),
    [adjustments]);

    const totalItems = activeAdjustments.reduce((sum, [, qty]) => sum + qty, 0);

    const setQty = (productId, val) => {
        const num = Math.max(0, parseInt(val) || 0);
        setAdjustments(prev => ({ ...prev, [productId]: num }));
    };

    const tapAdd = useCallback((productId) => {
        triggerHaptic?.('light');
        setAdjustments(prev => ({ ...prev, [productId]: (prev[productId] || 0) + 1 }));
    }, [triggerHaptic]);

    const needsNote = direction === 'egreso' && !note.trim();

    const handleApply = async () => {
        if (activeAdjustments.length === 0) return;
        if (needsNote) {
            showToast('Escribe un motivo para el egreso', 'error');
            triggerHaptic?.('error');
            return;
        }
        if (!showConfirm) {
            setShowConfirm(true);
            return;
        }
        setIsApplying(true);
        triggerHaptic?.();

        try {
            for (const [productId, qty] of activeAdjustments) {
                const delta = direction === 'ingreso' ? qty : -qty;
                await adjustStock(productId, delta);
            }

            showToast(
                `${direction === 'ingreso' ? 'Ingreso' : 'Egreso'} aplicado: ${activeAdjustments.length} productos, ${totalItems} unidades`,
                'success'
            );

            setAdjustments({});
            setNote('');
            setSearch('');
            setShowConfirm(false);
            onClose();
        } catch (e) {
            showToast('Error al aplicar ajuste: ' + e.message, 'error');
        } finally {
            setIsApplying(false);
        }
    };

    const handleClose = () => {
        setAdjustments({});
        setSearch('');
        setNote('');
        setShowConfirm(false);
        onClose();
    };

    const maxStock = useMemo(() =>
        Math.max(1, ...allProducts.map(p => p.stock ?? 0)),
    [allProducts]);

    if (!isOpen) return null;

    // Confirm view
    if (showConfirm) {
        return (
            <Modal isOpen={isOpen} onClose={() => setShowConfirm(false)} title="Confirmar Ajuste" maxWidthClass="max-w-lg">
                <div className="flex flex-col gap-3 -mt-2">
                    <div className={`p-4 rounded-xl border-2 ${
                        direction === 'ingreso'
                            ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800'
                            : 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800'
                    }`}>
                        <div className="flex items-center gap-2 mb-3">
                            {direction === 'ingreso'
                                ? <TrendingUp size={20} className="text-emerald-500" />
                                : <TrendingDown size={20} className="text-red-500" />
                            }
                            <span className={`font-black text-sm uppercase tracking-wider ${
                                direction === 'ingreso' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                            }`}>
                                {direction === 'ingreso' ? 'Ingreso' : 'Egreso'} — {activeAdjustments.length} productos, {totalItems} unidades
                            </span>
                        </div>
                        <div className="space-y-1.5">
                            {activeAdjustments.map(([id, qty]) => {
                                const p = products.find(x => x.id === id);
                                const stock = p?.stock ?? 0;
                                const newStock = direction === 'ingreso' ? stock + qty : Math.max(0, stock - qty);
                                return (
                                    <div key={id} className="flex items-center justify-between text-sm">
                                        <span className="font-bold text-slate-700 dark:text-slate-200">{p?.name || '?'}</span>
                                        <span className="text-xs font-bold text-slate-500">
                                            {stock} <span className={direction === 'ingreso' ? 'text-emerald-500' : 'text-red-500'}>→ {newStock}</span>
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                        {note.trim() && (
                            <div className="mt-3 pt-2 border-t border-slate-200 dark:border-slate-700">
                                <p className="text-xs text-slate-500"><span className="font-bold">Motivo:</span> {note}</p>
                            </div>
                        )}
                    </div>

                    <div className="flex gap-2">
                        <button onClick={() => setShowConfirm(false)}
                            className="flex-1 py-3 rounded-xl font-bold text-sm bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 transition-colors active:scale-[0.98]">
                            Volver
                        </button>
                        <button onClick={handleApply} disabled={isApplying}
                            className={`flex-[2] py-3 rounded-xl font-bold text-sm text-white transition-all active:scale-[0.98] disabled:opacity-50 ${
                                direction === 'ingreso'
                                    ? 'bg-emerald-500 hover:bg-emerald-600 shadow-lg shadow-emerald-500/20'
                                    : 'bg-red-500 hover:bg-red-600 shadow-lg shadow-red-500/20'
                            }`}>
                            {isApplying ? 'Aplicando...' : (
                                <><Check size={16} className="inline mr-1" /> Confirmar {direction === 'ingreso' ? 'Ingreso' : 'Egreso'}</>
                            )}
                        </button>
                    </div>
                </div>
            </Modal>
        );
    }

    return (
        <Modal isOpen={isOpen} onClose={handleClose} title="Ajuste de Inventario" maxWidthClass="max-w-lg">
            <div className="flex flex-col gap-3 -mt-2">

                {/* Direction Toggle */}
                <div className="flex gap-2">
                    <button onClick={() => setDirection('ingreso')}
                        className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all ${
                            direction === 'ingreso'
                                ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                        }`}>
                        <TrendingUp size={18} /> Ingreso
                    </button>
                    <button onClick={() => setDirection('egreso')}
                        className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all ${
                            direction === 'egreso'
                                ? 'bg-red-500 text-white shadow-md shadow-red-500/20'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                        }`}>
                        <TrendingDown size={18} /> Egreso
                    </button>
                </div>

                {/* Search */}
                <div className="relative">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input type="text" placeholder="Buscar producto..." value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-2.5 pl-9 pr-4 text-sm text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-brand/50" />
                </div>

                {/* Product List */}
                <div ref={listRef} className="max-h-[45vh] overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                    {/* Selected products (sticky top, max 3 visible then scroll) */}
                    {selectedProducts.length > 0 && (
                        <div className="sticky top-0 z-10 border-b-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                            <div className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-widest ${
                                direction === 'ingreso'
                                    ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400'
                                    : 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400'
                            }`}>
                                Seleccionados ({selectedProducts.length})
                            </div>
                            <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[25vh] overflow-y-auto">
                                {selectedProducts.map(p => (
                                    <ProductRow key={p.id} p={p} qty={adjustments[p.id] || 0} direction={direction} isSelected maxStock={maxStock} onTapAdd={tapAdd} onSetQty={setQty} />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Unselected products */}
                    {selectedProducts.length > 0 && unselectedProducts.length > 0 && (
                        <div className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest bg-slate-50 dark:bg-slate-800/50 text-slate-400 border-b border-slate-100 dark:border-slate-800">
                            Toca para agregar
                        </div>
                    )}
                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                        {unselectedProducts.length === 0 && selectedProducts.length === 0 ? (
                            <div className="py-8 text-center text-sm text-slate-400">
                                <Package size={24} className="mx-auto mb-2 opacity-50" />
                                Sin resultados
                            </div>
                        ) : unselectedProducts.map(p => (
                            <ProductRow key={p.id} p={p} qty={0} direction={direction} isSelected={false} maxStock={maxStock} onTapAdd={tapAdd} onSetQty={setQty} />
                        ))}
                    </div>
                </div>

                {/* Note */}
                <div className="relative">
                    <input type="text" value={note} onChange={(e) => setNote(e.target.value)}
                        placeholder={direction === 'egreso' ? 'Motivo del egreso (obligatorio)' : 'Nota / motivo (opcional)'}
                        className={`w-full bg-white dark:bg-slate-800 border rounded-xl py-2.5 px-3 text-sm text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-brand/50 ${
                            direction === 'egreso' && !note.trim() && activeAdjustments.length > 0
                                ? 'border-red-300 dark:border-red-700 focus:ring-red-500/30'
                                : 'border-slate-200 dark:border-slate-700'
                        }`} />
                    {direction === 'egreso' && !note.trim() && activeAdjustments.length > 0 && (
                        <p className="text-[10px] text-red-400 font-bold mt-1 ml-1 flex items-center gap-1">
                            <AlertTriangle size={10} /> Escribe un motivo para aplicar el egreso
                        </p>
                    )}
                </div>

                {/* Apply Button */}
                <button onClick={handleApply}
                    disabled={activeAdjustments.length === 0 || isApplying}
                    className={`w-full py-3.5 rounded-xl font-bold text-white transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed text-sm ${
                        direction === 'ingreso'
                            ? 'bg-emerald-500 hover:bg-emerald-600 shadow-lg shadow-emerald-500/20'
                            : 'bg-red-500 hover:bg-red-600 shadow-lg shadow-red-500/20'
                    }`}>
                    {isApplying ? 'Aplicando...' : (
                        <>
                            <Check size={16} className="inline mr-1.5" />
                            {activeAdjustments.length === 0
                                ? `Selecciona productos`
                                : `Aplicar ${direction === 'ingreso' ? 'Ingreso' : 'Egreso'} (${totalItems} uds)`
                            }
                        </>
                    )}
                </button>
            </div>
        </Modal>
    );
}
