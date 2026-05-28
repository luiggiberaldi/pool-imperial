import { ShoppingCart, Keyboard } from 'lucide-react';

export default function SalesHeader({
    setShowKeyboardHelp
}) {
    return (
        <div className="shrink-0 mb-3 bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl p-3 sm:p-4 shadow-sm border border-slate-100 dark:border-slate-800">
            <div className="flex justify-between items-center">
                <h2 className="text-xl sm:text-2xl font-black text-slate-800 dark:text-white tracking-tight flex items-center gap-2">
                    <div className="bg-emerald-500 text-white p-1.5 sm:p-2 rounded-xl shadow-lg shadow-emerald-500/30">
                        <ShoppingCart size={20} className="sm:w-[22px] sm:h-[22px]" />
                    </div>
                    Punto de Venta
                </h2>

                <button 
                    onClick={() => setShowKeyboardHelp(true)}
                    className="hidden md:flex items-center gap-1.5 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 px-3 py-1.5 rounded-xl transition-colors hover:bg-indigo-100 dark:hover:bg-indigo-900/40"
                >
                    <Keyboard size={14} />
                    <span className="text-xs font-bold">Atajos (PC)</span>
                </button>
            </div>
        </div>
    );
}
