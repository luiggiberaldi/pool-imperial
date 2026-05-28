import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Gift, Search, X, Plus, Minus, Camera, Tag, Percent, Package, CheckCircle, Sparkles, AlertTriangle } from 'lucide-react';
import { Modal } from '../Modal';
import { mulR, divR, round2 } from '../../utils/dinero';

export default function ComboFormModal({
    isOpen, onClose,
    products, categories,    effectiveRate, copEnabled, tasaCop,
    onSave,
    editingCombo
}) {
    // ── Form state ──
    const [name, setName] = useState('');
    const [image, setImage] = useState(null);
    const [category] = useState('combo');
    const [comboItems, setComboItems] = useState([]); // [{ productId, qty, _product }]
    const [priceUsd, setPriceUsd] = useState('');
    const [priceBs, setPriceBs] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [isSearchFocused, setIsSearchFocused] = useState(false);
    const [isFormShaking, setIsFormShaking] = useState(false);

    const searchRef = useRef(null);
    const fileInputRef = useRef(null);

    // ── Derived ──
    const nonComboProducts = useMemo(() =>
        products?.filter(p => !p.isCombo) || [],
    [products]);

    const searchResults = useMemo(() => {
        if (!searchTerm.trim()) return [];
        const term = searchTerm.toLowerCase();
        const alreadyAdded = new Set(comboItems.map(ci => ci.productId));
        return nonComboProducts
            .filter(p => !alreadyAdded.has(p.id) && p.name.toLowerCase().includes(term))
            .slice(0, 6);
    }, [searchTerm, nonComboProducts, comboItems]);

    const individualTotal = useMemo(() =>
        comboItems.reduce((sum, ci) => sum + (ci._product?.priceUsdt || 0) * ci.qty, 0),
    [comboItems]);

    const parsedPrice = parseFloat(priceUsd) || 0;
    const savingsUsd = individualTotal > 0 && parsedPrice > 0 ? round2(individualTotal - parsedPrice) : 0;
    const savingsPct = individualTotal > 0 && parsedPrice > 0 ? ((savingsUsd / individualTotal) * 100) : 0;

    const availableCombos = useMemo(() => {
        if (comboItems.length === 0) return 0;
        const avails = comboItems.map(ci => {
            if (!ci._product || ci.qty <= 0) return 0;
            return Math.floor(ci._product.stock / ci.qty);
        });
        return Math.min(...avails);
    }, [comboItems]);

    // ── Edit mode init ──
    useEffect(() => {
        if (!isOpen) return;
        if (editingCombo) {
            setName(editingCombo.name || '');
            setImage(editingCombo.image || null);
            // category is always 'combo'
            setPriceUsd(editingCombo.priceUsdt ? String(editingCombo.priceUsdt) : '');
            setPriceBs(editingCombo.priceBs ? String(round2(editingCombo.priceBs)) : '');

            // Resolve combo items
            let items = [];
            if (editingCombo.comboItems?.length > 0) {
                items = editingCombo.comboItems.map(ci => ({
                    productId: ci.productId,
                    qty: ci.qty,
                    _product: products?.find(p => p.id === ci.productId) || null
                }));
            } else if (editingCombo.linkedProductId) {
                // Legacy single-product combo
                items = [{
                    productId: editingCombo.linkedProductId,
                    qty: editingCombo.linkedQty || 1,
                    _product: products?.find(p => p.id === editingCombo.linkedProductId) || null
                }];
            }
            setComboItems(items);
        } else {
            // Reset for new combo
            setName(''); setImage(null);
            setComboItems([]); setPriceUsd(''); setPriceBs('');
            setSearchTerm('');
        }
    }, [isOpen, editingCombo, products]);

    // ── Handlers ──
    const handlePriceUsdChange = (val) => setPriceUsd(val);
    const handlePriceBsChange = (val) => setPriceBs(val);

    const impliedRate = (parseFloat(priceBs) > 0 && parseFloat(priceUsd) > 0)
        ? (parseFloat(priceBs) / parseFloat(priceUsd)).toFixed(2)
        : null;
    const rateBelowBcv = impliedRate && effectiveRate && parseFloat(impliedRate) < effectiveRate;

    const handleImageUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_SIZE = 400;
                let w = img.width, h = img.height;
                if (w > h) { if (w > MAX_SIZE) { h *= MAX_SIZE / w; w = MAX_SIZE; } }
                else { if (h > MAX_SIZE) { w *= MAX_SIZE / h; h = MAX_SIZE; } }
                canvas.width = w; canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                setImage(canvas.toDataURL('image/webp', 0.7));
            };
        };
    };

    const addProduct = (product) => {
        setComboItems(prev => [...prev, { productId: product.id, qty: 1, _product: product }]);
        setSearchTerm('');
        setIsSearchFocused(false);
    };

    const updateQty = (productId, delta) => {
        setComboItems(prev => prev.map(ci =>
            ci.productId === productId ? { ...ci, qty: Math.max(1, ci.qty + delta) } : ci
        ));
    };

    const removeItem = (productId) => {
        setComboItems(prev => prev.filter(ci => ci.productId !== productId));
    };

    const applyDiscount = (pct) => {
        if (individualTotal <= 0) return;
        const suggested = round2(individualTotal * (1 - pct / 100));
        handlePriceUsdChange(String(suggested));
    };

    const handleSave = () => {
        if (!name.trim()) {
            setIsFormShaking(true);
            setTimeout(() => setIsFormShaking(false), 500);
            return;
        }
        if (comboItems.length === 0) {
            setIsFormShaking(true);
            setTimeout(() => setIsFormShaking(false), 500);
            return;
        }
        if (parsedPrice <= 0) {
            setIsFormShaking(true);
            setTimeout(() => setIsFormShaking(false), 500);
            return;
        }

        const formattedName = name.replace(/(^\w{1})|(\s+\w{1})/g, l => l.toUpperCase());
        const cleanItems = comboItems.map(ci => ({ productId: ci.productId, qty: ci.qty }));

        const comboProduct = {
            id: editingCombo?.id || crypto.randomUUID(),
            name: formattedName,
            image,
            category,
            priceUsdt: parsedPrice,
            priceBs: parseFloat(priceBs) || mulR(parsedPrice, effectiveRate),
            costUsd: 0,
            costBs: 0,
            stock: 0,
            unit: 'unidad',
            isCombo: true,
            comboItems: cleanItems,
            linkedProductId: cleanItems[0]?.productId || null,
            linkedQty: cleanItems[0]?.qty || 1,
            lowStockAlert: 0,
            createdAt: editingCombo?.createdAt || new Date().toISOString(),
        };

        onSave(comboProduct);
    };

    if (!isOpen) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="" maxWidthClass="max-w-md">
            <div className={`space-y-5 ${isFormShaking ? 'animate-[shake_0.5s_ease]' : ''}`}>

                {/* ── Header badge ── */}
                <div className="flex items-center gap-3 -mt-2">
                    <div className="w-10 h-10 bg-violet-100 dark:bg-violet-900/30 rounded-xl flex items-center justify-center">
                        <Gift size={20} className="text-violet-600 dark:text-violet-400" />
                    </div>
                    <div>
                        <h3 className="font-black text-slate-800 dark:text-white text-lg tracking-tight">
                            {editingCombo ? 'Editar Combo' : 'Crear Combo'}
                        </h3>
                        <p className="text-[11px] text-slate-400 font-bold">Agrupa varios productos en un solo precio</p>
                    </div>
                </div>

                {/* ── 1. Info basica ── */}
                <div className="space-y-3">
                    {/* Image + Name row */}
                    <div className="flex gap-3">
                        <button type="button" onClick={() => fileInputRef.current?.click()}
                            className="w-16 h-16 shrink-0 bg-violet-50 dark:bg-violet-900/20 border-2 border-dashed border-violet-300 dark:border-violet-700 rounded-xl flex items-center justify-center overflow-hidden hover:border-violet-500 transition-colors">
                            {image ? (
                                <img src={image} className="w-full h-full object-cover" alt="" />
                            ) : (
                                <Camera size={20} className="text-violet-400" />
                            )}
                        </button>
                        <input type="file" ref={fileInputRef} accept="image/*" className="hidden" onChange={handleImageUpload} />
                        <div className="flex-1">
                            <input
                                type="text"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                placeholder="Nombre del combo..."
                                className="w-full bg-slate-50 dark:bg-slate-800 p-3 rounded-xl font-bold text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-violet-500/50 transition-all"
                            />
                        </div>
                    </div>
                </div>

                {/* ── 2. Productos del combo ── */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <label className="text-[10px] font-bold text-slate-400 ml-1 block uppercase flex items-center gap-1.5">
                            <Package size={11} /> Productos del combo
                        </label>
                        {comboItems.length > 0 && (
                            <span className="text-[10px] font-black bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 px-2 py-0.5 rounded-full">
                                {comboItems.length} item{comboItems.length > 1 ? 's' : ''}
                            </span>
                        )}
                    </div>

                    {/* Search */}
                    <div className="relative">
                        <div className={`flex items-center bg-white dark:bg-slate-900 rounded-2xl border-2 transition-all ${isSearchFocused ? 'border-violet-400 dark:border-violet-500 shadow-lg shadow-violet-500/10' : 'border-slate-200 dark:border-slate-700'}`}>
                            <div className={`ml-3 p-1 rounded-lg transition-colors ${isSearchFocused ? 'bg-violet-100 dark:bg-violet-900/30' : ''}`}>
                                <Search size={15} className={`transition-colors ${isSearchFocused ? 'text-violet-500' : 'text-slate-400'}`} />
                            </div>
                            <input
                                ref={searchRef}
                                type="text"
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                onFocus={() => setIsSearchFocused(true)}
                                onBlur={() => setTimeout(() => setIsSearchFocused(false), 200)}
                                placeholder="Buscar producto para agregar..."
                                className="flex-1 bg-transparent p-3 font-bold text-slate-700 dark:text-white outline-none text-sm placeholder:text-slate-400/70"
                            />
                            {searchTerm && (
                                <button type="button" onClick={() => setSearchTerm('')} className="mr-2 p-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all">
                                    <X size={12} strokeWidth={3} />
                                </button>
                            )}
                        </div>

                        {/* Dropdown results */}
                        {isSearchFocused && searchResults.length > 0 && (
                            <div className="absolute z-50 left-0 right-0 mt-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl shadow-slate-900/10 dark:shadow-black/30 max-h-56 overflow-y-auto custom-scrollbar">
                                <div className="p-1.5">
                                    {searchResults.map((p, idx) => (
                                        <button key={p.id} type="button"
                                            onMouseDown={(e) => { e.preventDefault(); addProduct(p); }}
                                            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-all active:scale-[0.98] text-left ${idx > 0 ? '' : ''}`}>
                                            <div className="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-xl overflow-hidden shrink-0 flex items-center justify-center border border-slate-200/50 dark:border-slate-700/50">
                                                {p.image ? (
                                                    <img src={p.image} className="w-full h-full object-cover" alt="" />
                                                ) : (
                                                    <Tag size={16} className="text-slate-300 dark:text-slate-600" />
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-sm font-bold text-slate-700 dark:text-white truncate">{p.name}</div>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    <span className="text-[11px] font-black text-emerald-600 dark:text-emerald-400">${p.priceUsdt?.toFixed(2)}</span>
                                                    <span className="text-[10px] text-slate-400">·</span>
                                                    <span className={`text-[10px] font-bold ${(p.stock ?? 0) > 0 ? 'text-slate-400' : 'text-red-400'}`}>
                                                        {(p.stock ?? 0) > 0 ? `${p.stock} en stock` : 'Sin stock'}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="w-8 h-8 bg-violet-100 dark:bg-violet-900/30 rounded-lg flex items-center justify-center shrink-0">
                                                <Plus size={14} className="text-violet-600 dark:text-violet-400" strokeWidth={3} />
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {isSearchFocused && searchTerm.trim() && searchResults.length === 0 && (
                            <div className="absolute z-50 left-0 right-0 mt-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl p-5 text-center">
                                <Search size={20} className="mx-auto text-slate-300 dark:text-slate-600 mb-2" />
                                <p className="text-xs font-bold text-slate-400">No se encontró "{searchTerm}"</p>
                                <p className="text-[10px] text-slate-400/70 mt-1">Prueba con otro nombre</p>
                            </div>
                        )}
                    </div>

                    {/* Combo items list */}
                    {comboItems.length === 0 ? (
                        <div className="border-2 border-dashed border-violet-200 dark:border-violet-800/40 rounded-2xl p-8 text-center bg-violet-50/30 dark:bg-violet-950/10">
                            <div className="w-12 h-12 bg-violet-100 dark:bg-violet-900/30 rounded-xl flex items-center justify-center mx-auto mb-3">
                                <Gift size={22} className="text-violet-400" />
                            </div>
                            <p className="text-sm font-bold text-slate-500 dark:text-slate-400">Agrega productos al combo</p>
                            <p className="text-[11px] text-slate-400/70 mt-1">Usa el buscador de arriba para encontrar productos</p>
                        </div>
                    ) : comboItems.length > 0 && (
                        <div className="space-y-2">
                            {comboItems.map((ci, idx) => {
                                const p = ci._product;
                                if (!p) return null;
                                const subtotal = round2(p.priceUsdt * ci.qty);
                                return (
                                    <div key={ci.productId}
                                        className="flex items-center gap-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-3 group/item animate-in fade-in slide-in-from-top-1 duration-200 hover:border-violet-300 dark:hover:border-violet-700 transition-colors"
                                        style={{ animationDelay: `${idx * 50}ms` }}>
                                        {/* Number badge */}
                                        <div className="w-5 h-5 bg-violet-100 dark:bg-violet-900/30 rounded-md flex items-center justify-center shrink-0">
                                            <span className="text-[10px] font-black text-violet-600 dark:text-violet-400">{idx + 1}</span>
                                        </div>

                                        {/* Thumbnail */}
                                        <div className="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-xl overflow-hidden shrink-0 flex items-center justify-center border border-slate-200/50 dark:border-slate-700/50">
                                            {p.image ? (
                                                <img src={p.image} className="w-full h-full object-cover" alt="" />
                                            ) : (
                                                <Tag size={14} className="text-slate-300" />
                                            )}
                                        </div>

                                        {/* Name + price */}
                                        <div className="flex-1 min-w-0">
                                            <div className="text-xs font-bold text-slate-700 dark:text-white truncate">{p.name}</div>
                                            <div className="text-[10px] text-slate-400 font-bold">${p.priceUsdt?.toFixed(2)} c/u · <span className="text-emerald-500 font-black">${subtotal.toFixed(2)}</span></div>
                                        </div>

                                        {/* Qty controls */}
                                        <div className="flex items-center gap-0.5 shrink-0 bg-slate-50 dark:bg-slate-800/50 rounded-xl p-0.5">
                                            <button type="button" onClick={() => updateQty(ci.productId, -1)}
                                                className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 active:scale-90 transition-all">
                                                <Minus size={12} strokeWidth={3} />
                                            </button>
                                            <span className="w-7 text-center text-sm font-black text-violet-600 dark:text-violet-400">{ci.qty}</span>
                                            <button type="button" onClick={() => updateQty(ci.productId, 1)}
                                                className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-500 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 active:scale-90 transition-all">
                                                <Plus size={12} strokeWidth={3} />
                                            </button>
                                        </div>

                                        {/* Remove */}
                                        <button type="button" onClick={() => removeItem(ci.productId)}
                                            className="p-1.5 rounded-lg text-slate-300 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-all shrink-0">
                                            <X size={13} strokeWidth={3} />
                                        </button>
                                    </div>
                                );
                            })}

                            {/* Total individual */}
                            <div className="flex justify-between items-center px-3 py-2.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800">
                                <span className="text-[11px] font-bold text-slate-400 uppercase">Total individual ({comboItems.length} producto{comboItems.length > 1 ? 's' : ''})</span>
                                <span className="text-sm font-black text-slate-600 dark:text-slate-300">${individualTotal.toFixed(2)}</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* ── 3. Precio del combo ── */}
                {comboItems.length > 0 && (
                    <div className="space-y-3 animate-in fade-in duration-200">
                        <label className="text-[10px] font-bold text-slate-400 ml-1 block uppercase flex items-center gap-1.5">
                            <Sparkles size={11} /> Precio del combo
                        </label>

                        {/* Price inputs */}
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-[10px] font-bold text-slate-400 ml-1 mb-1 block uppercase">Precio del Combo USD</label>
                                <div className="relative">
                                    <input
                                        type="number" inputMode="decimal" step="0.01"
                                        value={priceUsd}
                                        onChange={e => handlePriceUsdChange(e.target.value)}
                                        placeholder="0.00"
                                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3 rounded-xl font-black text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-violet-500/50 text-lg"
                                    />
                                    {parsedPrice > 0 && (
                                        <CheckCircle size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500" />
                                    )}
                                </div>
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-slate-400 ml-1 mb-1 block uppercase">Precio del Combo Bs</label>
                                <input
                                    type="number" inputMode="decimal" step="0.01"
                                    value={priceBs}
                                    onChange={e => handlePriceBsChange(e.target.value)}
                                    placeholder="0.00"
                                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3 rounded-xl font-bold text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-violet-500/50"
                                />
                            </div>
                        </div>

                        {/* Implied rate indicator */}
                        {impliedRate && (
                            <div className={`flex items-center justify-between rounded-xl px-3 py-2 border ${rateBelowBcv
                                ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700/40'
                                : 'bg-slate-50 dark:bg-slate-800/50 border-slate-100 dark:border-slate-800'}`}>
                                <span className={`text-[11px] font-bold flex items-center gap-1 ${rateBelowBcv
                                    ? 'text-amber-600 dark:text-amber-400'
                                    : 'text-slate-400'}`}>
                                    {rateBelowBcv && <AlertTriangle size={11} />}
                                    Tasa implícita
                                </span>
                                <span className={`text-sm font-black ${rateBelowBcv
                                    ? 'text-amber-600 dark:text-amber-400'
                                    : 'text-slate-500 dark:text-slate-400'}`}>
                                    {impliedRate} Bs/$
                                    {rateBelowBcv && <span className="text-[10px] font-bold ml-1">(BCV: {effectiveRate})</span>}
                                </span>
                            </div>
                        )}

                        {/* Savings display */}
                        {savingsUsd > 0 && (
                            <div className="flex items-center justify-between bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700/40 rounded-xl px-3 py-2">
                                <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                                    <Percent size={11} /> Ahorro para el cliente
                                </span>
                                <span className="text-sm font-black text-emerald-600 dark:text-emerald-400">
                                    ${savingsUsd.toFixed(2)} (-{savingsPct.toFixed(0)}%)
                                </span>
                            </div>
                        )}
                    </div>
                )}

                {/* ── Preview card ── */}
                {comboItems.length > 0 && parsedPrice > 0 && (
                    <div className="bg-violet-50 dark:bg-violet-950/20 border border-violet-200 dark:border-violet-700/40 rounded-xl p-4 animate-in fade-in duration-200">
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-xs font-black text-violet-700 dark:text-violet-300 flex items-center gap-1.5">
                                <Gift size={13} /> Vista previa
                            </span>
                            {availableCombos > 0 && (
                                <span className="text-[10px] font-bold bg-violet-200 dark:bg-violet-800/50 text-violet-700 dark:text-violet-300 px-2 py-0.5 rounded-full">
                                    {availableCombos} disponible{availableCombos !== 1 ? 's' : ''}
                                </span>
                            )}
                        </div>

                        <div className="space-y-1.5">
                            {comboItems.map(ci => (
                                <div key={ci.productId} className="flex justify-between text-xs">
                                    <span className="text-slate-600 dark:text-slate-400">{ci.qty}x {ci._product?.name || '?'}</span>
                                    <span className="text-slate-400">${round2((ci._product?.priceUsdt || 0) * ci.qty).toFixed(2)}</span>
                                </div>
                            ))}
                            <div className="flex justify-between text-xs pt-2 border-t border-violet-200 dark:border-violet-700/40">
                                <span className="text-slate-400">Individual</span>
                                <span className="text-slate-400 line-through">${individualTotal.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="font-black text-violet-700 dark:text-violet-300">Precio combo</span>
                                <span className="font-black text-violet-700 dark:text-violet-300">${parsedPrice.toFixed(2)}</span>
                            </div>
                        </div>
                    </div>
                )}

                {/* ── Save button ── */}
                <button type="button" onClick={handleSave}
                    disabled={!name.trim() || comboItems.length === 0 || parsedPrice <= 0}
                    className="w-full py-4 rounded-2xl font-black text-white uppercase tracking-wider text-sm bg-violet-500 hover:bg-violet-600 shadow-lg shadow-violet-500/30 transition-all active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100">
                    {editingCombo ? 'Guardar Cambios' : 'Crear Combo'}
                </button>
            </div>
        </Modal>
    );
}
