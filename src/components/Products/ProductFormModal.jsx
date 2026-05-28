import React, { useRef, useState } from 'react';
import { Camera, X, AlertTriangle, Package, Tag, Scale, Droplets, ChevronDown, ChevronUp, Barcode, Banknote, CheckCircle, Clock, ShoppingBag, CreditCard, ArrowUpRight, Plus, Minus, Percent } from 'lucide-react';
import { Modal } from '../Modal';
import { useProductContext } from '../../context/ProductContext';
import SpotlightTour from '../SpotlightTour';

const PRODUCT_FORM_TOUR_KEY = 'pda_product_form_tour_done';

const PRODUCT_FORM_STEPS = [
    {
        target: '[data-tour="pf-name"]',
        title: 'Nombre del Producto',
        text: 'Escribe el nombre tal como aparecerá en el punto de venta y en los tickets.'
    },
    {
        target: '[data-tour="pf-cost"]',
        title: 'Costo ($)',
        text: 'El precio al que compraste el producto. Úsalo para calcular tu margen de ganancia.'
    },
    {
        target: '[data-tour="pf-lote"]',
        title: 'Calculadora de Lote',
        text: 'Si compras por bulto (ej: caja de 24), toca aquí para calcular el costo por unidad automáticamente.'
    },
    {
        target: '[data-tour="pf-price"]',
        title: 'Precio de Venta ($)',
        text: 'El precio al que le vendes al cliente. El equivalente en Bs se calcula solo con la tasa del día.'
    },
    {
        target: '[data-tour="pf-margin"]',
        title: 'Margen de Ganancia',
        text: 'Calculado automáticamente. En rojo = vendes a pérdida. Apunta a un margen positivo.'
    },
    {
        target: '[data-tour="pf-stock"]',
        title: 'Stock y Alerta Mínima',
        text: 'Ingresa cuántas unidades tienes disponibles. La alerta mínima te avisa cuando el stock esté bajo.'
    },
];

// PACKAGING_TYPES removed for Pool Bar mode

export default function ProductFormModal({
    isOpen,
    onClose,
    isEditing,

    image, setImage,
    name, setName,
    barcode, setBarcode,
    category, setCategory,
    unit, setUnit,
    priceUsd, handlePriceUsdChange,
    priceBs, handlePriceBsChange,
    costUsd, handleCostUsdChange,
    costBs, handleCostBsChange,
    stock, setStock,
    lowStockAlert, setLowStockAlert,

    unitsPerPackage, setUnitsPerPackage: _setUnitsPerPackage,
    sellByUnit, setSellByUnit: _setSellByUnit,
    unitPriceUsd, setUnitPriceUsd: _setUnitPriceUsd,

    packagingType, setPackagingType: _setPackagingType,
    stockInLotes, setStockInLotes: _setStockInLotes,
    granelUnit, setGranelUnit: _setGranelUnit,
    effectiveRate,
    copEnabled,
    tasaCop,
    isFormShaking,

    handleImageUpload,
    handleSave,
    categories,
    productMovements,
    products,
    isCombo
}) {
    const fileInputRef = useRef(null);
    const [showSummary, setShowSummary] = useState(false);
    const [showMovements, setShowMovements] = useState(false);

    // Tour: solo en nuevo producto, solo la primera vez
    const [showFormTour, setShowFormTour] = useState(
        () => !isEditing && localStorage.getItem(PRODUCT_FORM_TOUR_KEY) !== 'true'
    );
    
    // Calculadora de Lote States
    const [showLoteCalc, setShowLoteCalc] = useState(false);
    const [loteCost, setLoteCost] = useState('');
    const [loteUnits, setLoteUnits] = useState('');
    const [loteQty, setLoteQty] = useState('1');

    // Live preview
    const loteUnitCost = (parseFloat(loteCost) > 0 && parseInt(loteUnits) > 0)
        ? (parseFloat(loteCost) / parseInt(loteUnits)).toFixed(3)
        : null;
    const loteTotalUnits = (parseInt(loteQty) > 0 && parseInt(loteUnits) > 0)
        ? parseInt(loteQty) * parseInt(loteUnits)
        : null;

    const handleApplyLote = () => {
        const cost = parseFloat(loteCost) || 0;
        const units = parseInt(loteUnits) || 1;
        const qty = parseInt(loteQty) || 1;
        
        if(cost > 0 && units > 0) {
            handleCostUsdChange((cost / units).toFixed(4));
        }
        if(qty > 0 && units > 0) {
            setStock(((parseInt(stock) || 0) + (qty * units)).toString());
        }
        setShowLoteCalc(false);
        setLoteCost('');
        setLoteUnits('');
        setLoteQty('1');
    };
    
    // Categorías en línea
    const { setCategories } = useProductContext();
    const [isAddingCategory, setIsAddingCategory] = useState(false);
    const [newCategoryName, setNewCategoryName] = useState("");

    const handleAddCategory = () => {
        if (!newCategoryName.trim()) return;
        const catId = newCategoryName.trim().toLowerCase().replace(/\s+/g, '_');
        
        setCategories(prev => {
            if(prev.find(c => c.id === catId)) return prev;
            return [...prev, { id: catId, label: newCategoryName.trim(), icon: '◆', color: 'emerald' }];
        });
        
        setCategory(catId);
        setIsAddingCategory(false);
        setNewCategoryName("");
    };

    if (!isOpen) return null;

    const isLote = packagingType === 'lote';
    const isGranel = packagingType === 'granel';
    const parsedUnits = parseInt(unitsPerPackage) || 0;
    const parsedPrice = parseFloat(priceUsd) || 0;
    const parsedCost = parseFloat(costUsd) || 0;

    // Margin for the main product (lote or suelto or granel)
    const mainMarginPct = parsedCost > 0 ? ((parsedPrice - parsedCost) / parsedCost * 100) : null;
    const mainMarginUsd = parsedPrice - parsedCost;

    // Unit margin for lote with sellByUnit
    const effectiveUnitPrice = unitPriceUsd ? parseFloat(unitPriceUsd) : (parsedUnits > 0 ? parsedPrice / parsedUnits : 0);
    const unitCost = parsedUnits > 0 && parsedCost > 0 ? parsedCost / parsedUnits : 0;
    const unitMarginPct = unitCost > 0 ? ((effectiveUnitPrice - unitCost) / unitCost * 100) : null;
    const unitMarginUsd = effectiveUnitPrice - unitCost;

    // Stock equivalence for lote (unused)
    // const parsedStockLotes = parseInt(stockInLotes) || 0;
    // const stockUnitsCalc = parsedStockLotes * (parsedUnits || 1);

    // Alert equivalence (unused)
    // const parsedAlert = parseInt(lowStockAlert) || 0;
    // const alertLotesCalc = parsedUnits > 0 ? (parsedAlert / parsedUnits) : 0;

    // Unit label for granel
    const granelLabel = granelUnit === 'kg' ? 'Kilo' : 'Litro';

    const priceSuffix = isLote ? ' / Lote' : isGranel ? ` / ${granelLabel}` : '';

    return (
        <>
        {showFormTour && (
            <SpotlightTour
                steps={PRODUCT_FORM_STEPS}
                onComplete={() => {
                    localStorage.setItem(PRODUCT_FORM_TOUR_KEY, 'true');
                    setShowFormTour(false);
                }}
                onSkip={() => {
                    localStorage.setItem(PRODUCT_FORM_TOUR_KEY, 'true');
                    setShowFormTour(false);
                }}
            />
        )}
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={isEditing ? "Editar Producto" : "Nuevo Producto"}
            maxWidthClass="max-w-lg md:max-w-xl"
            className={isFormShaking ? 'animate-shake border-red-500 shadow-xl shadow-red-500/20' : ''}
        >
            <div className="space-y-4">
                {/* Upload */}
                <div onClick={() => fileInputRef.current?.click()} className="h-28 bg-slate-50 dark:bg-slate-800 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl flex flex-col items-center justify-center cursor-pointer hover:border-emerald-500 transition-colors relative overflow-hidden">
                    {image ? <img src={image} className="w-full h-full object-cover" alt="Product preview" /> : (
                        <>
                            <Camera size={24} className="text-slate-400 mb-2" />
                            <span className="text-xs font-bold text-slate-500">Toca para subir foto</span>
                        </>
                    )}
                    <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleImageUpload} />
                    {image && <button onClick={(e) => { e.stopPropagation(); setImage(null); }} className="absolute top-2 right-2 p-1 bg-black/50 text-white rounded-full"><X size={12} /></button>}
                </div>

                <div className="space-y-3">
                    {/* Name */}
                    <div className="relative" data-tour="pf-name">
                        <label className="text-xs font-bold text-slate-400 ml-1 mb-1 block uppercase">Nombre</label>
                        <input value={name} onChange={e => setName(e.target.value)} autoFocus placeholder="Ej: Harina PAN 1kg"
                            className="w-full bg-slate-50 dark:bg-slate-800 p-3.5 pr-10 rounded-xl font-bold text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500/50 capitalize" />
                        {name && name.trim().length >= 3 && (
                            <CheckCircle size={18} className="absolute right-3 top-[38px] text-emerald-500 transition-all duration-300" />
                        )}
                    </div>

                    {/* Barcode */}
                    <div>
                        <label className="text-xs font-bold text-slate-400 ml-1 mb-1 block uppercase">Cód. de Barras (Opcional)</label>
                        <div className="relative">
                            <input value={barcode} onChange={e => setBarcode(e.target.value)} placeholder="Ej: 7591111222233"
                                className="w-full bg-slate-50 dark:bg-slate-800 p-3.5 pl-10 rounded-xl font-bold text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500/50" />
                            <Barcode size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        </div>
                    </div>

                    {/* Category (full width) */}
                    <div>
                        <div className="flex justify-between items-center mb-1">
                            <label className="text-xs font-bold text-slate-400 ml-1 block uppercase">Categoría</label>
                            <button 
                                onClick={() => setIsAddingCategory(!isAddingCategory)}
                                className="text-[10px] font-bold text-emerald-500 hover:text-emerald-600 flex items-center gap-1 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5 rounded-md transition-colors"
                            >
                                {isAddingCategory ? <X size={12} /> : <Plus size={12} />}
                                {isAddingCategory ? 'Cancelar' : 'Nueva'}
                            </button>
                        </div>
                        {isAddingCategory ? (
                            <div className="flex gap-2 animate-in fade-in slide-in-from-top-1">
                                <input 
                                    autoFocus
                                    value={newCategoryName}
                                    onChange={e => setNewCategoryName(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleAddCategory()}
                                    placeholder="Nombre de categoría..."
                                    className="flex-1 bg-slate-50 dark:bg-slate-800 p-3.5 rounded-xl font-bold text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500/50"
                                />
                                <button 
                                    onClick={handleAddCategory}
                                    disabled={!newCategoryName.trim()}
                                    className="bg-emerald-500 text-white px-4 rounded-xl font-bold disabled:opacity-50 hover:bg-emerald-600 transition-colors"
                                >
                                    Guardar
                                </button>
                            </div>
                        ) : (
                            <select value={category} onChange={e => setCategory(e.target.value)}
                                className="w-full bg-slate-50 dark:bg-slate-800 p-3.5 rounded-xl font-bold text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500/50">
                                {categories.filter(c => c.id !== 'todos').map(c => (
                                    <option key={c.id} value={c.id}>{c.label}</option>
                                ))}
                            </select>
                        )}
                    </div>

                    {/* Removed Packaging Type, Granel, and Lote UI blocks */}

                    {/* ─── COST SECTION (first) ─── */}
                    <div className="grid grid-cols-2 gap-3" data-tour="pf-cost">
                        <div>
                            <label className="text-[10px] sm:text-xs font-bold text-slate-500 dark:text-slate-400 ml-1 mb-1 block uppercase tracking-wider">
                                Costo ($){priceSuffix}
                            </label>
                            <input type="number" inputMode="decimal" value={costUsd} onChange={e => handleCostUsdChange(e.target.value)} onWheel={e => e.target.blur()} placeholder="1.00"
                                className="w-full bg-slate-50 dark:bg-slate-800 p-3.5 sm:p-4 rounded-xl font-bold text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-slate-500/50 transition-all text-sm sm:text-base" />
                        </div>
                        <div>
                            <div className="flex items-center justify-between mb-1">
                                <label className="text-[10px] sm:text-xs font-bold text-slate-500 dark:text-slate-400 ml-1 block uppercase tracking-wider">
                                    Costo (Bs){priceSuffix}
                                </label>
                                {!isCombo && (
                                <button
                                    data-tour="pf-lote"
                                    onClick={() => setShowLoteCalc(!showLoteCalc)}
                                    className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md transition-all active:scale-95 ${
                                        showLoteCalc
                                        ? 'bg-brand text-white'
                                        : 'bg-brand/10 dark:bg-brand/20 text-brand hover:bg-brand/20'
                                    }`}
                                >
                                    <Package size={10}/> Lote/Bulto
                                </button>
                                )}
                            </div>
                            <input type="number" inputMode="decimal" value={costBs} onChange={e => handleCostBsChange(e.target.value)} onWheel={e => e.target.blur()} placeholder="0.00"
                                className="w-full bg-slate-50 dark:bg-slate-800 p-3.5 sm:p-4 rounded-xl font-bold text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-slate-500/50 transition-all text-sm sm:text-base" />
                        </div>
                    </div>

                    {/* ─── CALCULADORA DE LOTE ─── */}
                    {showLoteCalc && !isCombo && (
                        <div className="bg-brand/5 dark:bg-brand/10 border border-brand/25 p-3.5 rounded-2xl space-y-3 animate-in slide-in-from-top-2 duration-200">
                            <div className="flex items-center justify-between">
                                <h4 className="text-[11px] font-black uppercase text-brand flex items-center gap-1.5">
                                    <Package size={12}/> Calculadora de Lote / Bulto
                                </h4>
                                {loteUnitCost && (
                                    <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/30 px-2 py-0.5 rounded-full">
                                        ${loteUnitCost} / und
                                    </span>
                                )}
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                                <div>
                                    <label className="text-[10px] font-bold text-slate-500 block mb-1">Costo lote ($)</label>
                                    <input
                                        autoFocus
                                        type="number"
                                        inputMode="decimal"
                                        value={loteCost}
                                        onChange={e => setLoteCost(e.target.value)}
                                        placeholder="20.00"
                                        className="w-full bg-white dark:bg-slate-900 px-2.5 py-2 rounded-xl text-sm font-bold outline-none border border-slate-200 dark:border-slate-700 focus:border-brand"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-slate-500 block mb-1">Uds por lote</label>
                                    <input
                                        type="number"
                                        inputMode="numeric"
                                        value={loteUnits}
                                        onChange={e => setLoteUnits(e.target.value)}
                                        placeholder="24"
                                        className="w-full bg-white dark:bg-slate-900 px-2.5 py-2 rounded-xl text-sm font-bold outline-none border border-slate-200 dark:border-slate-700 focus:border-brand"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-slate-500 block mb-1">Cant. lotes</label>
                                    <input
                                        type="number"
                                        inputMode="numeric"
                                        value={loteQty}
                                        onChange={e => setLoteQty(e.target.value)}
                                        className="w-full bg-white dark:bg-slate-900 px-2.5 py-2 rounded-xl text-sm font-bold outline-none border border-slate-200 dark:border-slate-700 focus:border-brand"
                                    />
                                </div>
                            </div>
                            {/* Live result preview */}
                            {(loteUnitCost || loteTotalUnits) && (
                                <div className="flex items-center justify-between bg-white dark:bg-slate-900 rounded-xl px-3 py-2 border border-slate-100 dark:border-slate-800">
                                    {loteUnitCost && (
                                        <span className="text-xs text-slate-500">
                                            Costo unitario: <strong className="text-slate-700 dark:text-white">${loteUnitCost}</strong>
                                        </span>
                                    )}
                                    {loteTotalUnits && (
                                        <span className="text-xs text-slate-500">
                                            Stock a sumar: <strong className="text-emerald-600">+{loteTotalUnits} uds</strong>
                                        </span>
                                    )}
                                </div>
                            )}
                            <button
                                onClick={handleApplyLote}
                                disabled={!loteCost || !loteUnits}
                                className="w-full py-2.5 bg-brand hover:bg-brand-dark disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-black rounded-xl transition-all active:scale-[0.98]"
                            >
                                Aplicar Costo y Sumar al Stock
                            </button>
                        </div>
                    )}

                    {/* LOTE: Auto unit cost removed */}
                    {/* ─── PRICE SECTION ─── */}
                    <div className="grid grid-cols-2 gap-3" data-tour="pf-price">
                        <div className="relative">
                            <label className="text-[10px] sm:text-xs font-bold text-emerald-600 dark:text-emerald-400 ml-1 mb-1 block uppercase tracking-wider">
                                Precio de Venta ($){priceSuffix}
                            </label>
                            <input type="number" inputMode="decimal" value={priceUsd} onChange={e => handlePriceUsdChange(e.target.value)} onWheel={e => e.target.blur()} placeholder="1.50"
                                className="w-full bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/30 p-3.5 pr-10 sm:p-4 sm:pr-10 rounded-xl font-black text-emerald-800 dark:text-emerald-400 outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all text-sm sm:text-base" />
                            {parseFloat(priceUsd) > 0 && (
                                <CheckCircle size={18} className="absolute right-3 top-[38px] sm:top-[42px] text-emerald-500 transition-all duration-300" />
                            )}
                        </div>
                        <div className="relative">
                            <label className="text-[10px] sm:text-xs font-bold text-indigo-600 dark:text-indigo-400 ml-1 mb-1 block uppercase tracking-wider">
                                Precio de Venta (Bs){priceSuffix}
                            </label>
                            <input type="number" inputMode="decimal" value={priceBs} onChange={e => handlePriceBsChange(e.target.value)} onWheel={e => e.target.blur()} placeholder="0.00"
                                className="w-full bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800/30 p-3.5 pr-10 sm:p-4 sm:pr-10 rounded-xl font-black text-indigo-800 dark:text-indigo-400 outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all text-sm sm:text-base" />
                            {parseFloat(priceBs) > 0 && (
                                <CheckCircle size={18} className="absolute right-3 top-[38px] sm:top-[42px] text-indigo-500 transition-all duration-300" />
                            )}
                        </div>
                    </div>
                    
                    {/* ─── COP PREVIEW ─── */}
                    {copEnabled && parsedPrice > 0 && (
                        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200/50 dark:border-amber-800/30 p-2.5 rounded-xl flex items-center justify-between text-sm animate-in fade-in slide-in-from-top-1">
                            <span className="text-amber-800 dark:text-amber-500 font-bold flex items-center gap-1.5 text-xs uppercase tracking-wider hidden sm:flex">
                                <Banknote size={16} /> Equivalente en COP
                            </span>
                            <span className="text-amber-800 dark:text-amber-500 font-bold flex items-center gap-1.5 text-xs uppercase tracking-wider sm:hidden">
                                <Banknote size={16} /> COP
                            </span>
                            <span className="font-black text-amber-600 dark:text-amber-400 text-lg">
                                {(parsedPrice * tasaCop).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                        </div>
                    )}

                    {/* LOTE: Unit Price removed */}
                    {/* ─── MARGIN PANEL ─── */}
                    <div data-tour="pf-margin" className={`p-3 rounded-xl border space-y-1.5 min-h-[60px] ${mainMarginPct !== null && mainMarginPct < 0
                        ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800/30'
                        : mainMarginPct !== null && mainMarginPct === 0
                            ? 'bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800/30'
                            : 'bg-slate-50 dark:bg-slate-800/50 border-slate-100 dark:border-slate-800'
                        }`}>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Margen de Ganancia</p>
                        {parsedPrice > 0 && parsedCost > 0 ? (
                            <div className="space-y-1.5">
                                {/* Main margin */}
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-slate-500 font-medium">{isLote ? 'Margen Lote:' : isGranel ? `Margen / ${granelLabel}:` : 'Margen / Unidad:'}</span>
                                    <span className={`font-black ${mainMarginPct >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                        {mainMarginPct.toFixed(1)}%
                                        <span className="text-xs ml-1.5 opacity-80 font-bold">(${mainMarginUsd.toFixed(2)})</span>
                                    </span>
                                </div>

                                {/* Unit margin for lote with sellByUnit */}
                                {isLote && sellByUnit && parsedUnits > 1 && unitMarginPct !== null && (
                                    <div className="flex justify-between items-center text-sm border-t border-slate-200/50 dark:border-slate-700/50 pt-1.5">
                                        <span className="text-slate-500 font-medium">Margen Unidad:</span>
                                        <span className={`font-black ${unitMarginPct >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                            {unitMarginPct.toFixed(1)}%
                                            <span className="text-xs ml-1.5 opacity-80 font-bold">(${unitMarginUsd.toFixed(2)})</span>
                                        </span>
                                    </div>
                                )}

                                {/* Warnings */}
                                {mainMarginPct < 0 && (
                                    <p className="text-[10px] font-bold text-rose-500 flex items-center gap-1 mt-1">
                                        <AlertTriangle size={11} /> Estás vendiendo a pérdida
                                    </p>
                                )}
                                {mainMarginPct === 0 && (
                                    <p className="text-[10px] font-bold text-amber-500 flex items-center gap-1 mt-1">
                                        <AlertTriangle size={11} /> Punto de equilibrio (sin ganancia)
                                    </p>
                                )}
                            </div>
                        ) : (
                            <div className="text-xs text-slate-400 italic">Ingresa Precio y Costo para calcular tu margen.</div>
                        )}
                    </div>

                    {/* ─── STOCK SECTION ─── */}
                    <div data-tour="pf-stock" className="bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-xl p-3">
                            <div className="grid grid-cols-2 gap-3 animate-in fade-in zoom-in-95">
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 ml-1 mb-1 block uppercase">Stock Físico</label>
                                    <input type="number" inputMode="numeric" value={stock} onChange={e => setStock(e.target.value)} placeholder="0"
                                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3.5 rounded-xl font-black text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-brand/50 text-lg" />
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-amber-500 ml-1 mb-1 block uppercase flex items-center gap-1">
                                        <AlertTriangle size={10} /> Alerta Mínima
                                    </label>
                                    <input type="number" inputMode="numeric" value={lowStockAlert} onChange={e => setLowStockAlert(e.target.value)} placeholder="5"
                                        className="w-full bg-amber-50 dark:bg-amber-900/10 border border-amber-200/50 dark:border-amber-800/30 p-3.5 rounded-xl font-bold text-amber-700 dark:text-amber-400 outline-none focus:ring-2 focus:ring-amber-500/50" />
                                </div>
                            </div>
                    </div>

                    {/* ─── PRE-SAVE SUMMARY ─── */}
                    {name && parsedPrice > 0 && (
                        <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                            <button onClick={() => setShowSummary(!showSummary)}
                                className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 dark:bg-slate-800/50 text-xs font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors">
                                <span>📋 Resumen antes de guardar</span>
                                {showSummary ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            </button>
                            {showSummary && (
                                <div className="px-3 py-2.5 space-y-1.5 text-xs bg-white dark:bg-slate-900 animate-in fade-in slide-in-from-top-1 duration-150">
                                    <div className="flex justify-between"><span className="text-slate-400">Nombre:</span><span className="font-bold text-slate-700 dark:text-white">{name}</span></div>
                                    <div className="flex justify-between"><span className="text-slate-400">Categoría:</span><span className="font-bold text-slate-700 dark:text-white">{categories.find(c => c.id === category)?.label || category}</span></div>
                                    <div className="flex justify-between"><span className="text-slate-400">Precio USD/BS:</span><span className="font-bold text-emerald-600">${parsedPrice.toFixed(2)} / {(parsedPrice * effectiveRate).toFixed(2)} Bs</span></div>
                                    {copEnabled && <div className="flex justify-between"><span className="text-amber-500/80">Precio COP:</span><span className="font-bold text-amber-600">{(parsedPrice * tasaCop).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} COP</span></div>}
                                    {parsedCost > 0 && <div className="flex justify-between"><span className="text-slate-400">Costo:</span><span className="font-bold text-slate-600">${parsedCost.toFixed(2)}</span></div>}
                                    {mainMarginPct !== null && <div className="flex justify-between"><span className="text-slate-400">Margen:</span><span className={`font-black ${mainMarginPct >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>{mainMarginPct.toFixed(1)}%</span></div>}
                                    {isCombo ? (
                                        <>
                                            <div className="flex justify-between"><span className="text-violet-500">Tipo:</span><span className="font-bold text-violet-600">Combo / Promo</span></div>
                                            {linkedProductId && <div className="flex justify-between"><span className="text-violet-500">Contiene:</span><span className="font-bold text-violet-600">{linkedQty}x {products?.find(p => p.id === linkedProductId)?.name || '—'}</span></div>}
                                        </>
                                    ) : (
                                        <div className="flex justify-between"><span className="text-slate-400">Stock:</span><span className="font-bold text-slate-700 dark:text-white">{stock || 0}</span></div>
                                    )}
                                    {barcode && <div className="flex justify-between"><span className="text-slate-400">Código:</span><span className="font-bold text-slate-700 dark:text-white">{barcode}</span></div>}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ─── KARDEX LITE: Movimientos Recientes ─── */}
                    {isEditing && productMovements && (
                        <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                            <button onClick={() => setShowMovements(!showMovements)}
                                className="w-full flex items-center justify-between px-3 py-2.5 bg-slate-50 dark:bg-slate-800/50 text-xs font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors">
                                <span className="flex items-center gap-1.5">
                                    <Clock size={13} className="text-blue-500" />
                                    Movimientos Recientes
                                    {productMovements.length > 0 && (
                                        <span className="bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-[9px] font-black px-1.5 py-0.5 rounded-full">{productMovements.length}</span>
                                    )}
                                </span>
                                {showMovements ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            </button>
                            {showMovements && (
                                <div className="bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800 max-h-56 overflow-y-auto animate-in fade-in slide-in-from-top-1 duration-150">
                                    {productMovements.length === 0 ? (
                                        <p className="text-xs text-slate-400 text-center py-6">Sin movimientos registrados</p>
                                    ) : (
                                        productMovements.map(mov => {
                                            const date = new Date(mov.timestamp);
                                            const dateStr = date.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit' });
                                            const timeStr = date.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', hour12: false });
                                            const isCobro = mov.tipo === 'COBRO_DEUDA';
                                            const isFiada = mov.tipo === 'VENTA_FIADA';
                                            const isEntrada = mov.tipo === 'AJUSTE_ENTRADA';
                                            const isSalida = mov.tipo === 'AJUSTE_SALIDA';
                                            const isAjuste = isEntrada || isSalida;
                                            return (
                                                <div key={mov.id} className="flex items-center gap-2.5 px-3 py-2">
                                                    <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                                                        isEntrada ? 'bg-emerald-100 dark:bg-emerald-900/30'
                                                        : isSalida ? 'bg-rose-100 dark:bg-rose-900/30'
                                                        : isCobro ? 'bg-emerald-100 dark:bg-emerald-900/30' 
                                                        : isFiada ? 'bg-amber-100 dark:bg-amber-900/30' 
                                                        : 'bg-blue-100 dark:bg-blue-900/30'}`}>
                                                        {isEntrada ? <Plus size={12} className="text-emerald-500" />
                                                        : isSalida ? <Minus size={12} className="text-rose-500" />
                                                        : isCobro ? <ArrowUpRight size={12} className="text-emerald-500" /> 
                                                        : isFiada ? <CreditCard size={12} className="text-amber-500" /> 
                                                        : <ShoppingBag size={12} className="text-blue-500" />}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex justify-between items-center">
                                                            <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
                                                                {isEntrada ? 'Entrada manual' : isSalida ? 'Salida manual' : isFiada ? 'Fiado' : isCobro ? 'Cobro' : 'Venta'}
                                                                {mov.qty && <span className="text-slate-400 font-medium"> {isAjuste ? (isEntrada ? '+' : '-') : 'x'}{mov.qty}</span>}
                                                            </span>
                                                            <span className="text-[10px] text-slate-400">{dateStr} {timeStr}</span>
                                                        </div>
                                                        {mov.clienteName && (
                                                            <p className="text-[9px] text-slate-400 truncate">{mov.clienteName}</p>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <button onClick={handleSave} className="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-4 rounded-2xl font-black uppercase tracking-wider shadow-lg shadow-emerald-500/20 active:scale-95 transition-all">
                    {isEditing ? "Actualizar Producto" : "Guardar Producto"}
                </button>
            </div>
        </Modal>
        </>
    );
}
