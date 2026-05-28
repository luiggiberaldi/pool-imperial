import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function AppVersionLock({ currentVersion, requiredVersion }) {
    const handleRefresh = () => {
        // Hard refresh para limpiar caché en la mayoría de navegadores y PWAs
        window.location.reload(true);
    };

    return (
        <div className="fixed inset-0 z-[9999] bg-slate-900 flex flex-col items-center justify-center p-6 text-center">
            <div className="bg-slate-800 p-8 rounded-3xl border border-rose-500/30 max-w-md w-full shadow-2xl shadow-rose-900/20">
                <div className="w-20 h-20 bg-rose-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                    <AlertTriangle className="w-10 h-10 text-rose-500" />
                </div>
                
                <h1 className="text-2xl font-bold text-white mb-2">
                    Actualización Requerida
                </h1>
                
                <p className="text-slate-300 mb-6 leading-relaxed">
                    Este dispositivo está ejecutando una versión obsoleta del sistema (v{currentVersion}). Para proteger la integridad de los datos de las mesas, es obligatorio actualizar a la versión más reciente (v{requiredVersion}).
                </p>

                <div className="bg-slate-900 rounded-xl p-4 mb-8 text-sm text-slate-400">
                    <p>Si la aplicación está instalada (PWA), intenta cerrarla deslizando hacia arriba y vuelve a abrirla.</p>
                </div>

                <button
                    onClick={handleRefresh}
                    className="w-full flex items-center justify-center gap-2 bg-rose-500 hover:bg-rose-600 text-white py-4 rounded-2xl font-semibold transition-all active:scale-[0.98]"
                >
                    <RefreshCw className="w-5 h-5" />
                    Forzar Actualización Ahora
                </button>
            </div>
        </div>
    );
}
