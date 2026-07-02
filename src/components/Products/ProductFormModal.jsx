import React, { useRef, useState } from 'react';
import { Camera, X, AlertTriangle, Package, CheckCircle, Clock, ShoppingBag, CreditCard, ArrowUpRight, Plus, Minus, ChevronUp, ChevronDown } from 'lucide-react';
import { useTablesStore } from '../../hooks/store/useTablesStore';
import { Modal } from '../Modal';
import { useProductContext } from '../../context/ProductContext';
import { formatCop } from '../../utils/calculatorUtils';
import CustomSelect from '../CustomSelect';

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
    costUsd, handleCostUsdChange,
    stock, setStock,
    lowStockAlert, setLowStockAlert,
    isUnlimitedStock, setIsUnlimitedStock,

    unitsPerPackage, setUnitsPerPackage: _setUnitsPerPackage,
    sellByUnit, setSellByUnit: _setSellByUnit,
    unitPriceUsd, setUnitPriceUsd: _setUnitPriceUsd,

    packagingType, setPackagingType: _setPackagingType,
    stockInLotes, setStockInLotes: _setStockInLotes,
    granelUnit, setGranelUnit: _setGranelUnit,
    isFormShaking,

    handleImageUpload,
    handleSave,
    categories,
    productMovements,
    products,
    linkedProductId,
    linkedQty,
    isCombo,
    tasaCop,
    taxType,
    setTaxType,
    taxMode,
    setTaxMode
}) {
    const fileInputRef = useRef(null);
    const [showSummary, setShowSummary] = useState(false);
    const [showMovements, setShowMovements] = useState(false);

    const [showLoteCalc, setShowLoteCalc] = useState(false);
    const [loteCost, setLoteCost] = useState('');
    const [loteUnits, setLoteUnits] = useState('');
    const [loteQty, setLoteQty] = useState('1');

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

    const mainMarginPct = parsedCost > 0 ? ((parsedPrice - parsedCost) / parsedCost * 100) : null;
    const mainMarginUsd = parsedPrice - parsedCost;

    const effectiveUnitPrice = unitPriceUsd ? parseFloat(unitPriceUsd) : (parsedUnits > 0 ? parsedPrice / parsedUnits : 0);
    const unitCost = parsedUnits > 0 && parsedCost > 0 ? parsedCost / parsedUnits : 0;
    const unitMarginPct = unitCost > 0 ? ((effectiveUnitPrice - unitCost) / unitCost * 100) : null;
    const unitMarginUsd = effectiveUnitPrice - unitCost;

    const granelLabel = granelUnit === 'kg' ? 'Kilo' : 'Litro';
    const priceSuffix = isLote ? ' / Lote' : isGranel ? ` / ${granelLabel}` : '';

    return (
        <>
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={isEditing ? "Editar Producto" : "Nuevo Producto"}
            maxWidthClass="max-w-lg md:max-w-xl"
            className={isFormShaking ? 'animate-shake border-red-500 shadow-xl shadow-red-500/20' : ''}
        >
            <div className="space-y-4">
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
                    <div className="relative" data-tour="pf-name">
                        <label className="text-xs font-bold text-slate-400 ml-1 mb-1 block uppercase">Nombre</label>
                        <input value={name} onChange={e => setName(e.target.value)} autoFocus placeholder="Ej: Harina PAN 1kg"
                            className="w-full bg-slate-50 dark:bg-slate-800 p-3.5 pr-10 rounded-xl font-bold text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500/50 capitalize" />
                        {name && name.trim().length >= 3 && (
                            <CheckCircle size={18} className="absolute right-3 top-[38px] text-emerald-500 transition-all duration-300" />
                        )}
                    </div>

                    <div>
                        <label className="text-xs font-bold text-slate-400 ml-1 mb-1 block uppercase">Cód. de Barras (Opcional)</label>
                        <input value={barcode} onChange={e => setBarcode(e.target.value)} placeholder="Ej: 7591111222233"
                            className="w-full bg-slate-50 dark:bg-slate-800 p-3.5 rounded-xl font-bold text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500/50" />
                    </div>

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
                            <CustomSelect value={category} onChange={e => setCategory(e.target.value)}
                                className="w-full bg-slate-50 dark:bg-slate-800 p-3.5 rounded-xl font-bold text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500/50">
                                {categories.filter(c => c.id !== 'todos').map(c => (
                                    <option key={c.id} value={c.id}>{c.label}</option>
                                ))}
                            </CustomSelect>
                        )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs font-bold text-slate-400 ml-1 mb-1 block uppercase">Impuesto</label>
                            <CustomSelect value={taxType} onChange={e => setTaxType(e.target.value)}
                                className="w-full bg-slate-50 dark:bg-slate-800 p-3.5 rounded-xl font-bold text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500/50">
                                <option value="exento">Exento (0%)</option>
                                <option value="iva_19">IVA ({useTablesStore.getState().config?.taxRateIva ?? 19}%)</option>
                                <option value="impoconsumo_8">Impoconsumo ({useTablesStore.getState().config?.taxRateImpoconsumo ?? 8}%)</option>
                            </CustomSelect>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-400 ml-1 mb-1 block uppercase">Modo Impuesto</label>
                            <CustomSelect value={taxMode} onChange={e => setTaxMode(e.target.value)}
                                className="w-full bg-slate-50 dark:bg-slate-800 p-3.5 rounded-xl font-bold text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500/50">
                                <option value="inclusive">Incluido en precio</option>
                                <option value="exclusive">Más impuesto</option>
                            </CustomSelect>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3" data-tour="pf-cost">
                        <div className="col-span-2 sm:col-span-1">
                            <label className="text-[10px] sm:text-xs font-bold text-slate-500 dark:text-slate-400 ml-1 mb-1 block uppercase tracking-wider">
                                Costo (COP){priceSuffix}
                            </label>
                            <input type="number" inputMode="numeric" value={costUsd} onChange={e => handleCostUsdChange(e.target.value)} onWheel={e => e.target.blur()} placeholder="0"
                                className="w-full bg-slate-50 dark:bg-slate-800 p-3.5 sm:p-4 rounded-xl font-bold text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-slate-500/50 transition-all text-sm sm:text-base" />
                        </div>
                        <div className="col-span-2 sm:col-span-1 flex items-end">
                            {!isCombo && (
                            <button
                                data-tour="pf-lote"
                                onClick={() => setShowLoteCalc(!showLoteCalc)}
                                className={`w-full flex items-center justify-center gap-1 py-3.5 sm:py-4 text-xs font-black rounded-xl transition-all active:scale-95 ${
                                    showLoteCalc
                                    ? 'bg-brand text-white'
                                    : 'bg-brand/10 dark:bg-brand/20 text-brand hover:bg-brand/20'
                                }`}
                            >
                                <Package size={14}/> Calculadora de Lote
                            </button>
                            )}
                        </div>
                    </div>

                    {showLoteCalc && !isCombo && (
                        <div className="bg-brand/5 dark:bg-brand/10 border border-brand/25 p-3.5 rounded-2xl space-y-3 animate-in slide-in-from-top-2 duration-200">
                            <div className="flex items-center justify-between">
                                <h4 className="text-[11px] font-black uppercase text-brand flex items-center gap-1.5">
                                    <Package size={12}/> Calculadora de Lote / Bulto
                                </h4>
                                {loteUnitCost && (
                                    <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/30 px-2 py-0.5 rounded-full">
                                        {formatCop(loteUnitCost)} / und
                                    </span>
                                )}
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                                <div>
                                    <label className="text-[10px] font-bold text-slate-500 block mb-1">Costo lote (COP)</label>
                                    <input
                                        autoFocus
                                        type="number"
                                        inputMode="numeric"
                                        value={loteCost}
                                        onChange={e => setLoteCost(e.target.value)}
                                        placeholder="0"
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
                            {(loteUnitCost || loteTotalUnits) && (
                                <div className="flex items-center justify-between bg-white dark:bg-slate-900 rounded-xl px-3 py-2 border border-slate-100 dark:border-slate-800">
                                    {loteUnitCost && (
                                        <span className="text-xs text-slate-500">
                                            Costo unitario: <strong className="text-slate-700 dark:text-white">{formatCop(loteUnitCost)}</strong>
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

                    <div className="grid grid-cols-1 gap-3" data-tour="pf-price">
                        <div className="relative">
                            <label className="text-[10px] sm:text-xs font-bold text-emerald-600 dark:text-emerald-400 ml-1 mb-1 block uppercase tracking-wider">
                                Precio de Venta (COP){priceSuffix}
                            </label>
                            <input type="number" inputMode="numeric" value={priceUsd} onChange={e => handlePriceUsdChange(e.target.value)} onWheel={e => e.target.blur()} placeholder="0"
                                className="w-full bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/30 p-3.5 pr-10 sm:p-4 sm:pr-10 rounded-xl font-black text-emerald-800 dark:text-emerald-400 outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all text-sm sm:text-base" />
                            {parseFloat(priceUsd) > 0 && (
                                <CheckCircle size={18} className="absolute right-3 top-[38px] sm:top-[42px] text-emerald-500 transition-all duration-300" />
                            )}
                            {parseFloat(priceUsd) > 0 && (
                                <div className="mt-1.5 ml-1 text-xs font-bold text-emerald-600 dark:text-emerald-400 flex flex-col gap-1.5 animate-in fade-in slide-in-from-top-1">
                                    <div className="flex items-center gap-1.5">
                                        <span>≈ ${(parseFloat(priceUsd) / (tasaCop || 4150)).toFixed(2)} USD</span>
                                        <span className="text-[9px] text-slate-400 font-medium">(tasa: {tasaCop || 4150})</span>
                                    </div>
                                    {(() => {
                                        const config = useTablesStore.getState().config;
                                        const taxRate = taxType === 'iva_19'
                                            ? (config?.taxRateIva ?? 19) / 100
                                            : taxType === 'impoconsumo_8'
                                                ? (config?.taxRateImpoconsumo ?? 8) / 100
                                                : 0;
                                        if (taxMode === 'exclusive' && taxRate > 0) {
                                            const label = taxType === 'iva_19' ? `${config?.taxRateIva ?? 19}% IVA` : `${config?.taxRateImpoconsumo ?? 8}% Impoconsumo`;
                                            return (
                                                <div className="bg-emerald-500/10 dark:bg-emerald-500/5 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 px-3 py-2 rounded-xl text-xs font-black mt-1 flex justify-between items-center w-full">
                                                    <span>Precio Final Cliente (+ {label}):</span>
                                                    <span className="text-sm">{formatCop(parseFloat(priceUsd) * (1 + taxRate))}</span>
                                                </div>
                                            );
                                        }
                                        return null;
                                    })()}
                                </div>
                            )}
                        </div>
                    </div>
                    
                    <div data-tour="pf-margin" className={`p-3 rounded-xl border space-y-1.5 min-h-[60px] ${mainMarginPct !== null && mainMarginPct < 0
                        ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800/30'
                        : mainMarginPct !== null && mainMarginPct === 0
                            ? 'bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800/30'
                            : 'bg-slate-50 dark:bg-slate-800/50 border-slate-100 dark:border-slate-800'
                        }`}>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Margen de Ganancia</p>
                        {parsedPrice > 0 && parsedCost > 0 ? (
                            <div className="space-y-1.5">
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-slate-500 font-medium">{isLote ? 'Margen Lote:' : isGranel ? `Margen / ${granelLabel}:` : 'Margen / Unidad:'}</span>
                                    <span className={`font-black ${mainMarginPct >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                        {mainMarginPct.toFixed(1)}%
                                        <span className="text-xs ml-1.5 opacity-80 font-bold">({formatCop(mainMarginUsd)})</span>
                                    </span>
                                </div>

                                {isLote && sellByUnit && parsedUnits > 1 && unitMarginPct !== null && (
                                    <div className="flex justify-between items-center text-sm border-t border-slate-200/50 dark:border-slate-700/50 pt-1.5">
                                        <span className="text-slate-500 font-medium">Margen Unidad:</span>
                                        <span className={`font-black ${unitMarginPct >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                            {unitMarginPct.toFixed(1)}%
                                            <span className="text-xs ml-1.5 opacity-80 font-bold">({formatCop(unitMarginUsd)})</span>
                                        </span>
                                    </div>
                                )}

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

                    <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-xl p-3 flex justify-between items-center">
                        <div>
                            <span className="text-xs font-bold text-slate-700 dark:text-slate-200 block">Stock Ilimitado</span>
                            <span className="text-[10px] text-slate-400 block mt-0.5">Útil para tragos, cócteles o servicios</span>
                        </div>
                        <button
                            type="button"
                            onClick={() => setIsUnlimitedStock(!isUnlimitedStock)}
                            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                isUnlimitedStock ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-700'
                            }`}
                        >
                            <span
                                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                    isUnlimitedStock ? 'translate-x-5' : 'translate-x-0'
                                }`}
                            />
                        </button>
                    </div>

                    {!isUnlimitedStock ? (
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
                    ) : (
                        <div className="bg-emerald-500/5 dark:bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 rounded-xl p-3.5 text-xs font-bold leading-normal flex items-start gap-2.5 animate-in fade-in zoom-in-95">
                            <CheckCircle size={16} className="text-emerald-500 shrink-0 mt-0.5" />
                            <div>
                                <span className="block font-black text-emerald-800 dark:text-emerald-400 mb-0.5">Control de stock desactivado</span>
                                Este artículo tendrá existencias infinitas y no aparecerá en el reporte de inventario en PDF.
                            </div>
                        </div>
                    )}

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
                                    <div className="flex justify-between"><span className="text-slate-400">Precio COP:</span><span className="font-bold text-emerald-600">{formatCop(parsedPrice)}</span></div>
                                    {parsedCost > 0 && <div className="flex justify-between"><span className="text-slate-400">Costo COP:</span><span className="font-bold text-slate-600">{formatCop(parsedCost)}</span></div>}
                                    {mainMarginPct !== null && <div className="flex justify-between"><span className="text-slate-400">Margen:</span><span className={`font-black ${mainMarginPct >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>{mainMarginPct.toFixed(1)}%</span></div>}
                                    {isCombo ? (
                                        <>
                                            <div className="flex justify-between"><span className="text-violet-500">Tipo:</span><span className="font-bold text-violet-600">Combo / Promo</span></div>
                                        </>
                                    ) : isUnlimitedStock ? (
                                        <div className="flex justify-between"><span className="text-slate-400">Stock:</span><span className="font-bold text-emerald-500">Ilimitado</span></div>
                                    ) : (
                                        <div className="flex justify-between"><span className="text-slate-400">Stock:</span><span className="font-bold text-slate-700 dark:text-white">{stock || 0}</span></div>
                                    )}
                                    {barcode && <div className="flex justify-between"><span className="text-slate-400">Código:</span><span className="font-bold text-slate-700 dark:text-white">{barcode}</span></div>}
                                </div>
                            )}
                        </div>
                    )}

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
                                            const dateStr = date.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit' });
                                            const timeStr = date.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false });
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
