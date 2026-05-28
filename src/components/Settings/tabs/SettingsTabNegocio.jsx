import React from 'react';
import { Store, Printer, Coins, Check } from 'lucide-react';
import { SectionCard, Toggle } from '../../SettingsShared';
import { useAudit } from '../../../hooks/useAudit';

export default function SettingsTabNegocio({
    businessName, setBusinessName,
    businessRif, setBusinessRif,
    paperWidth, setPaperWidth,
    copEnabled, setCopEnabled,
    autoCopEnabled, setAutoCopEnabled,
    tasaCopManual, setTasaCopManual,
    calculatedTasaCop,
    handleSaveBusinessData,
    forceHeartbeat,
    showToast,
    triggerHaptic,
}) {
    const { log } = useAudit();

    const handleSaveWithAudit = () => {
        handleSaveBusinessData();
        log('CONFIG', 'CONFIG_NEGOCIO_CAMBIADA', 'Configuración del negocio actualizada', { businessName, businessRif });
    };

    return (
        <>
            {/* Mi Negocio */}
            <SectionCard icon={Store} title="Mi Negocio" subtitle="Datos que aparecen en tickets" iconColor="text-indigo-500">
                <div>
                    <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1.5">RIF o Documento</label>
                    <input
                        type="text"
                        placeholder="Ej: J-12345678"
                        value={businessRif}
                        onChange={e => setBusinessRif(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 transition-all"
                    />
                </div>
                <button
                    onClick={handleSaveWithAudit}
                    className="w-full flex items-center justify-center gap-2 py-3 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 font-bold text-xs uppercase tracking-wider rounded-xl hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors active:scale-[0.98]"
                >
                    <Check size={16} /> Guardar
                </button>
            </SectionCard>
        </>
    );
}

