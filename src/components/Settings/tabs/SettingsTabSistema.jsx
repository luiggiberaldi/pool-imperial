import React, { useState } from 'react';
import {
    Database, Palette, Upload, Download, Share2,
    Check, Sun, Moon, ChevronRight, Trash2, AlertTriangle, FileText, RotateCcw,
    Volume2
} from 'lucide-react';
import { SectionCard, Toggle } from '../../SettingsShared';
import AuditLogViewer from '../AuditLogViewer';
import WebSerialPanel from '../WebSerialPanel';

import { useAudit } from '../../../hooks/useAudit';
import { useConfirm } from '../../../hooks/useConfirm.jsx';
import { useProductContext } from '../../../context/ProductContext';
import { initialProducts } from '../../../config/initialProducts';
import { showToast } from '../../../components/Toast';

export default function SettingsTabSistema({
    theme, toggleTheme,
    deviceId, idCopied, setIdCopied,
    isAdmin,
    importStatus, statusMessage,
    handleExport, handleImportClick,
    setIsShareOpen,
    setShowDeleteConfirm,
    onFactoryReset,
    dangerZoneUnlocked,
    onDangerZoneClick,
    triggerHaptic,
}) {
    const { log } = useAudit();
    const confirm = useConfirm();
    const { setProducts } = useProductContext();

    const [posSoundsEnabled, setPosSoundsEnabled] = useState(() => localStorage.getItem('pos_sounds_enabled') !== 'false');

    const handleRestoreSeedWithAudit = async () => {
        if (!isAdmin) return;
        triggerHaptic && triggerHaptic();
        const ok = await confirm({
            title: '¿Restaurar Catálogo Base?',
            message: '¿Estás seguro que deseas restablecer el catálogo de productos al estado base del código? Esto reemplazará tu inventario actual en este dispositivo y se subirá de nuevo a la nube.',
            confirmText: 'Sí, restaurar',
            variant: 'warning'
        });
        if (ok) {
            try {
                await setProducts(initialProducts);
                log('CONFIG', 'CONFIG_SISTEMA_CAMBIADA', 'Catálogo semilla restaurado desde código', { count: initialProducts.length });
                showToast('Catálogo base restaurado con éxito', 'success');
            } catch (err) {
                showToast('Error al restaurar catálogo base', 'error');
            }
        }
    };

    const handleThemeToggleWithAudit = () => {
        const newTheme = theme === 'dark' ? 'light' : 'dark';
        toggleTheme();
        log('CONFIG', 'CONFIG_SISTEMA_CAMBIADA', `Tema cambiado a ${newTheme}`, { setting: 'theme', value: newTheme });
    };

    const handleExportWithAudit = () => {
        handleExport();
        log('CONFIG', 'CONFIG_SISTEMA_CAMBIADA', 'Backup exportado', { setting: 'export', value: 'backup' });
    };

    const handleImportWithAudit = () => {
        handleImportClick();
        log('CONFIG', 'CONFIG_SISTEMA_CAMBIADA', 'Importación de backup iniciada', { setting: 'import', value: 'backup' });
    };

    const handleShareWithAudit = () => {
        setIsShareOpen(true);
        log('CONFIG', 'CONFIG_SISTEMA_CAMBIADA', 'Compartir base de datos iniciado', { setting: 'share_db', value: true });
    };

    const handleDeleteConfirmWithAudit = () => {
        setShowDeleteConfirm(true);
        log('CONFIG', 'CONFIG_SISTEMA_CAMBIADA', 'Solicitud de borrado de historial de ventas', { setting: 'delete_sales_history', value: true });
    };

    return (
        <>
            {/* Datos y Respaldo */}
            <div data-tour="settings-backup">
            <SectionCard icon={Database} title="Datos y Respaldo" subtitle="Exportar, importar y compartir" iconColor="text-cyan-500">
                <div className="p-2.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/30 rounded-xl flex gap-2.5">
                    <AlertTriangle size={18} className="text-amber-600 dark:text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-[10px] text-amber-800 dark:text-amber-400 leading-relaxed font-bold">
                        PRECAUCION: Al restaurar un backup se sobrescribira por completo todo el historial de ventas, inventario, deudores y configuraciones de este dispositivo.
                    </p>
                </div>

                <div className="space-y-2">
                    <button onClick={handleExportWithAudit} className="w-full flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors group active:scale-[0.98]">
                        <div className="p-2 bg-blue-50 dark:bg-blue-900/30 rounded-lg"><Download size={18} className="text-blue-500" /></div>
                        <div className="text-left flex-1">
                            <p className="text-sm font-bold text-slate-700 dark:text-slate-200">Exportar Backup</p>
                            <p className="text-[10px] text-slate-400">Descargar archivo .json</p>
                        </div>
                        <ChevronRight size={16} className="text-slate-300" />
                    </button>

                    <button onClick={handleImportWithAudit} className="w-full flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors group active:scale-[0.98]">
                        <div className="p-2 bg-emerald-50 dark:bg-emerald-900/30 rounded-lg"><Upload size={18} className="text-emerald-500" /></div>
                        <div className="text-left flex-1">
                            <p className="text-sm font-bold text-slate-700 dark:text-slate-200">Importar Backup</p>
                            <p className="text-[10px] text-slate-400">Restaurar desde archivo</p>
                        </div>
                        <ChevronRight size={16} className="text-slate-300" />
                    </button>

                    {isAdmin && (
                        <button onClick={handleRestoreSeedWithAudit} className="w-full flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors group active:scale-[0.98]">
                            <div className="p-2 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg"><RotateCcw size={18} className="text-indigo-500" /></div>
                            <div className="text-left flex-1">
                                <p className="text-sm font-bold text-slate-700 dark:text-slate-200">Restaurar Catálogo Base</p>
                                <p className="text-[10px] text-slate-400">Recargar 23 productos semilla del código</p>
                            </div>
                            <ChevronRight size={16} className="text-slate-300" />
                        </button>
                    )}
                </div>

                {importStatus && (
                    <div className={`p-2.5 rounded-xl text-xs font-bold text-center flex items-center justify-center gap-2 ${importStatus === 'success' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                        {importStatus === 'success' ? <Check size={14} /> : <AlertTriangle size={14} />}
                        {statusMessage}
                    </div>
                )}
            </SectionCard>
            </div>

            {/* Impresora */}
            <WebSerialPanel />

            {/* Efectos de Sonido */}
            <SectionCard icon={Volume2} title="Efectos de Sonido" subtitle="Sonidos de interfaz y alertas" iconColor="text-pink-500">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-sm font-bold text-slate-700 dark:text-slate-200">Sonidos del Sistema</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">Emitir pitidos al agregar productos, cobrar y en alertas</p>
                    </div>
                    <Toggle
                        enabled={posSoundsEnabled}
                        onChange={() => {
                            const newVal = !posSoundsEnabled;
                            setPosSoundsEnabled(newVal);
                            localStorage.setItem('pos_sounds_enabled', newVal.toString());
                            showToast(newVal ? 'Efectos de sonido activados' : 'Efectos de sonido desactivados', 'success');
                            triggerHaptic?.();
                            log('CONFIG', 'CONFIG_SISTEMA_CAMBIADA', `Sonidos ${newVal ? 'activados' : 'desactivados'}`, { setting: 'pos_sounds_enabled', value: newVal });
                        }}
                    />
                </div>
            </SectionCard>

            {/* Zona de Peligro */}
            {(
            <SectionCard icon={AlertTriangle} title="Zona de Peligro" subtitle="Acciones irreversibles" iconColor="text-red-500">
                <div className="p-2.5 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800/30 rounded-xl mb-3">
                    <p className="text-[10px] text-red-700 dark:text-red-400 leading-relaxed font-bold">
                        Esta accion eliminara todo el historial de ventas y reportes estadisticos. El inventario NO sera afectado.
                    </p>
                </div>
                <button
                    onClick={handleDeleteConfirmWithAudit}
                    className="w-full flex items-center gap-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30 rounded-xl hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors group active:scale-[0.98]"
                >
                    <div className="p-2 bg-red-100 dark:bg-red-900/40 rounded-lg"><Trash2 size={18} className="text-red-600 dark:text-red-400" /></div>
                    <div className="text-left flex-1">
                        <p className="text-sm font-bold text-red-700 dark:text-red-400">Borrar Historial de Ventas</p>
                        <p className="text-[10px] text-red-500/80 dark:text-red-400/80">El inventario no se borrara</p>
                    </div>
                </button>

                <button
                    onClick={onFactoryReset}
                    className="w-full flex items-center gap-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30 rounded-xl hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors group active:scale-[0.98] mt-2"
                >
                    <div className="p-2 bg-red-100 dark:bg-red-900/40 rounded-lg"><RotateCcw size={18} className="text-red-600 dark:text-red-400" /></div>
                    <div className="text-left flex-1">
                        <p className="text-sm font-bold text-red-700 dark:text-red-400">Restablecer Fábrica</p>
                        <p className="text-[10px] text-red-500/80 dark:text-red-400/80">Borra todo: productos, ventas, caja, nube</p>
                    </div>
                </button>
            </SectionCard>
            )}
        </>
    );
}

