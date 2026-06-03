import { useState, useEffect } from 'react';
import { ShoppingCart, Keyboard, DollarSign, Edit2, Check, X } from 'lucide-react';
import { useProductContext } from '../../context/ProductContext';
import { formatCop } from '../../utils/calculatorUtils';

export default function SalesHeader({
    setShowKeyboardHelp
}) {
    const { tasaCop, setTasaCopManual, copEnabled } = useProductContext();
    const [isEditing, setIsEditing] = useState(false);
    const [rateInput, setRateInput] = useState('');

    useEffect(() => {
        setRateInput(tasaCop ? tasaCop.toString() : '');
    }, [tasaCop]);

    const handleSave = () => {
        const val = parseFloat(rateInput);
        if (!isNaN(val) && val > 0) {
            setTasaCopManual(val);
            setIsEditing(false);
        } else {
            // Revert on invalid
            setRateInput(tasaCop ? tasaCop.toString() : '');
            setIsEditing(false);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            handleSave();
        } else if (e.key === 'Escape') {
            setRateInput(tasaCop ? tasaCop.toString() : '');
            setIsEditing(false);
        }
    };

    return (
        <div className="shrink-0 mb-3 bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl p-3 sm:p-4 shadow-sm border border-slate-100 dark:border-slate-800">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <h2 className="text-xl sm:text-2xl font-black text-slate-800 dark:text-white tracking-tight flex items-center gap-2">
                    <div className="bg-emerald-500 text-white p-1.5 sm:p-2 rounded-xl shadow-lg shadow-emerald-500/30">
                        <ShoppingCart size={20} className="sm:w-[22px] sm:h-[22px]" />
                    </div>
                    Punto de Venta
                </h2>

                <div className="flex items-center gap-2 self-stretch sm:self-auto justify-end">
                    {/* Tasa de Cambio Manual */}
                    {copEnabled && (
                        <div className="flex items-center bg-slate-50 dark:bg-slate-800/50 rounded-xl p-1 border border-slate-100 dark:border-slate-800/80">
                            {isEditing ? (
                                <div className="flex items-center gap-2 px-2 py-0.5 animate-in fade-in zoom-in-95 duration-150">
                                    <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 select-none">1 USD =</span>
                                    <div className="relative flex items-center">
                                        <input
                                            type="number"
                                            value={rateInput}
                                            onChange={(e) => setRateInput(e.target.value)}
                                            onKeyDown={handleKeyDown}
                                            onBlur={handleSave}
                                            className="w-24 bg-white dark:bg-slate-900 text-xs font-black text-slate-850 dark:text-white pl-2 pr-7 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 focus:border-emerald-500 dark:focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:focus:ring-emerald-500/20 transition-all text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                            placeholder="COP"
                                            autoFocus
                                            step="50"
                                        />
                                        <span className="absolute right-2 text-[9px] font-black text-slate-400 select-none pointer-events-none">COP</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <button
                                            onMouseDown={(e) => e.preventDefault()}
                                            onClick={handleSave}
                                            className="p-1.5 bg-emerald-50 hover:bg-emerald-500 hover:text-white dark:bg-emerald-950/30 dark:text-emerald-400 dark:hover:bg-emerald-500 dark:hover:text-white rounded-lg text-emerald-600 transition-all active:scale-90 shadow-sm"
                                            title="Guardar"
                                        >
                                            <Check size={13} strokeWidth={3} />
                                        </button>
                                        <button
                                            onMouseDown={(e) => e.preventDefault()}
                                            onClick={() => {
                                                setRateInput(tasaCop ? tasaCop.toString() : '');
                                                setIsEditing(false);
                                            }}
                                            className="p-1.5 bg-rose-50 hover:bg-rose-500 hover:text-white dark:bg-rose-950/30 dark:text-rose-400 dark:hover:bg-rose-500 dark:hover:text-white rounded-lg text-rose-600 transition-all active:scale-90 shadow-sm"
                                            title="Cancelar"
                                        >
                                            <X size={13} strokeWidth={3} />
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <button
                                    onClick={() => setIsEditing(true)}
                                    className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-all text-left group border border-transparent hover:border-slate-200 dark:hover:border-slate-700 shadow-sm hover:shadow-md hover:-translate-y-[1px] duration-150"
                                >
                                    <div className="bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 p-1.5 rounded-lg shadow-sm group-hover:scale-105 transition-all">
                                        <DollarSign size={14} className="animate-pulse" />
                                    </div>
                                    <div>
                                        <div className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest leading-none">Tasa de Cambio</div>
                                        <div className="text-xs font-black text-slate-700 dark:text-slate-200 flex items-center gap-1.5 mt-0.5">
                                            1 USD = {formatCop(tasaCop || 4150)}
                                            <Edit2 size={10} className="text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                                        </div>
                                    </div>
                                </button>
                            )}
                        </div>
                    )}

                    <button 
                        onClick={() => setShowKeyboardHelp(true)}
                        className="hidden md:flex items-center gap-1.5 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 px-3 py-1.5 rounded-xl transition-colors hover:bg-indigo-100 dark:hover:bg-indigo-900/40"
                    >
                        <Keyboard size={14} />
                        <span className="text-xs font-bold">Atajos (PC)</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
