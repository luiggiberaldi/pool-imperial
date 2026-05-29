import React, { useState, useEffect, useRef } from 'react';
import { X, Check } from 'lucide-react';
import { formatCop } from '../../utils/calculatorUtils';

export default function CustomAmountModal({
    onClose,
    onConfirm,
    triggerHaptic
}) {
    const [amount, setAmount] = useState('');
    const inputRef = useRef(null);

    useEffect(() => {
        // Auto-focus on mount
        setTimeout(() => inputRef.current?.focus(), 100);
    }, []);

    const handleChange = (e) => {
        let v = e.target.value.replace(/\D/g, ''); // Solo números enteros para COP
        setAmount(v);
    };

    const handleConfirm = () => {
        const value = parseFloat(amount);
        if (value > 0) {
            triggerHaptic && triggerHaptic();
            // Enviamos 'USD' ya que internamente la base de datos almacena el valor en COP en la columna USD
            onConfirm(value, 'USD');
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleConfirm();
        }
    };

    const parsedValue = parseFloat(amount) || 0;
    const isValid = parsedValue > 0;

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-[24px] shadow-2xl overflow-hidden animate-in slide-in-from-bottom-8 sm:zoom-in-95 duration-200 border border-slate-100 dark:border-slate-800">
                
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-800">
                    <div>
                        <h2 className="text-lg font-black text-slate-800 dark:text-white">Monto Libre</h2>
                        <p className="text-xs font-bold text-slate-400">Venta rápida sin inventario</p>
                    </div>
                    <button onClick={onClose} className="p-2 -mr-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-full hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className="p-5">
                    <div className="mb-4">
                        <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-3 text-center">
                            Importe en COP
                        </label>

                        <div className="relative">
                            <input
                                ref={inputRef}
                                type="text"
                                inputMode="numeric"
                                value={amount}
                                onChange={handleChange}
                                onKeyDown={handleKeyDown}
                                placeholder="0"
                                className="w-full py-4 px-4 pr-16 text-center text-4xl font-black bg-slate-50 dark:bg-slate-950 border-2 border-slate-200 dark:border-slate-800 rounded-2xl text-slate-800 dark:text-white placeholder:text-slate-300 dark:placeholder:text-slate-800 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/20 transition-all"
                            />
                            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-black px-2 py-1 rounded-lg text-emerald-600 bg-emerald-50 dark:bg-emerald-900/40">
                                COP
                            </span>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 bg-slate-50 dark:bg-slate-950/50 border-t border-slate-100 dark:border-slate-800">
                    <button
                        onClick={handleConfirm}
                        disabled={!isValid}
                        className={`w-full py-4 rounded-xl font-black text-base flex items-center justify-center gap-2 transition-all ${
                            isValid 
                            ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/30 active:scale-[0.98]' 
                            : 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                        }`}
                    >
                        <Check size={20} />
                        Agregar a la Venta
                    </button>
                </div>
            </div>
        </div>
    );
}
