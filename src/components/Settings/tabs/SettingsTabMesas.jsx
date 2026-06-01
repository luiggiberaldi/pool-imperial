import React, { useState, useEffect } from 'react';
import { Layers, Check, Plus, Trash2, Edit2, X, DollarSign, AlertTriangle, Search, Clock, Trophy } from 'lucide-react';
import { SectionCard } from '../../SettingsShared';
import { useTablesStore } from '../../../hooks/store/useTablesStore';
import { useConfirm } from '../../../hooks/useConfirm';

const formatCOP = (val) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(val);
const formatCOPDecimals = (val) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);

export default function SettingsTabMesas({ showToast, triggerHaptic }) {
    const { config, updateConfig, tables, activeSessions, addTable, updateTable, deleteTable } = useTablesStore();
    const confirm = useConfirm();

    // Config State — synced from store config
    const [pricePerHour, setPricePerHour] = useState(config?.pricePerHour || 0);
    const [pricePina, setPricePina] = useState(config?.pricePina || 0);

    // Sync local state when external config changes (e.g., from another tab/device)
    const configPricePerHour = config?.pricePerHour;
    const configPricePina = config?.pricePina;
    useEffect(() => {
        const raf = requestAnimationFrame(() => {
            if (configPricePerHour != null) setPricePerHour(configPricePerHour);
            if (configPricePina != null) setPricePina(configPricePina);
        });
        return () => cancelAnimationFrame(raf);
    }, [configPricePerHour, configPricePina]);

    // Form State for adding new tables
    const [tableName, setTableName] = useState(() => {
        let maxNum = 0;
        const currentTables = useTablesStore.getState().tables;
        currentTables.forEach(t => {
            const match = t.name.match(/\d+/);
            if (match) {
                const num = parseInt(match[0], 10);
                if (num > maxNum) maxNum = num;
            }
        });
        return `Mesa ${maxNum + 1}`;
    });
    const [tableType, setTableType] = useState('POOL');
    const [isSaving, setIsSaving] = useState(false);

    // Inline edit state
    const [inlineEditId, setInlineEditId] = useState(null);
    const [inlineEditName, setInlineEditName] = useState('');
    const [inlineEditType, setInlineEditType] = useState('POOL');
    const [inlineEditSaving, setInlineEditSaving] = useState(false);

    // Inline delete confirmation
    const [deleteConfirmId, setDeleteConfirmId] = useState(null);

    // Search filter
    const [searchFilter, setSearchFilter] = useState('');

    const getNextTableName = () => {
        let maxNum = 0;
        const currentTables = useTablesStore.getState().tables;
        currentTables.forEach(t => {
            const match = t.name.match(/\d+/);
            if (match) {
                const num = parseInt(match[0], 10);
                if (num > maxNum) maxNum = num;
            }
        });
        return `Mesa ${maxNum + 1}`;
    };

    // Auto-fill next table name when tables change
    const tablesLength = tables.length;
    useEffect(() => {
        if (!inlineEditId) {
            const raf = requestAnimationFrame(() => {
                setTableName(getNextTableName());
            });
            return () => cancelAnimationFrame(raf);
        }
    }, [tablesLength]); // eslint-disable-line react-hooks/exhaustive-deps

    const hourVal = parseFloat(pricePerHour) || 0;
    const pinaVal = parseFloat(pricePina) || 0;
    const anyZero = hourVal <= 0 || pinaVal <= 0;

    const handleSaveConfig = async () => {
        if (anyZero) {
            const items = [];
            if (hourVal <= 0) items.push('Hora Libre (COP)');
            if (pinaVal <= 0) items.push('La Piña (COP)');
            showToast(`Tarifa en 0: ${items.join(', ')}. Todas las tarifas deben ser mayores a 0.`, 'error');
            triggerHaptic?.('error');
            return;
        }
        await updateConfig({
            pricePerHour: parseFloat(pricePerHour) || 0,
            pricePerHourBs: 0,
            pricePina: parseFloat(pricePina) || 0,
            pricePinaBs: 0,
        });
        showToast('Tarifas guardadas', 'success');
        triggerHaptic?.('light');
    };

    // Add new table
    const handleAddTable = async () => {
        if (!tableName.trim()) return;
        const duplicate = tables.some(t => t.name.trim().toLowerCase() === tableName.trim().toLowerCase());
        if (duplicate) { showToast('Ya existe una mesa con ese nombre', 'error'); return; }
        setIsSaving(true);
        try {
            await addTable(tableName, tableType);
            showToast('Mesa agregada', 'success');
            setTableName(getNextTableName());
            setTableType('POOL');
        } catch (e) {
            showToast('Error al agregar mesa', 'error');
        } finally {
            setIsSaving(false);
            triggerHaptic?.('light');
        }
    };

    // Inicializar mesas por defecto de acuerdo al plano del local (3 Pool + Normales/Stools)
    const handleInitializeDefaultTables = async () => {
        const ok = await confirm({
            title: "Inicializar Distribución del Local",
            message: "Esta acción registrará automáticamente las 3 mesas de pool (Pool 1, Pool 2, Pool 3) y las 26 mesas comedor y taburetes de barra (M1 a M11, B1 a B15) de acuerdo al plano arquitectónico de Pool Imperial. Las mesas existentes no se duplicarán.",
            confirmText: "Inicializar Local",
            cancelText: "Cancelar",
            variant: "warning"
        });
        if (!ok) return;

        setIsSaving(true);
        try {
            // 3 mesas de Pool
            const poolTables = ['Pool 1', 'Pool 2', 'Pool 3'];
            // Mesas normales comedor y taburetes redondos
            const normalTables = [];
            for (let i = 1; i <= 11; i++) {
                normalTables.push(`M${i}`);
            }
            // Taburetes de barra
            for (let i = 1; i <= 15; i++) {
                normalTables.push(`B${i}`);
            }

            let createdCount = 0;
            let skippedCount = 0;

            // Registrar mesas de Pool
            for (const name of poolTables) {
                const exists = tables.some(t => t.name.trim().toLowerCase() === name.toLowerCase());
                if (!exists) {
                    await addTable(name, 'POOL');
                    createdCount++;
                } else {
                    skippedCount++;
                }
            }

            // Registrar mesas normales
            for (const name of normalTables) {
                const exists = tables.some(t => t.name.trim().toLowerCase() === name.toLowerCase());
                if (!exists) {
                    await addTable(name, 'NORMAL');
                    createdCount++;
                } else {
                    skippedCount++;
                }
            }

            showToast(`Mesas inicializadas: ${createdCount} creadas, ${skippedCount} ya existían.`, 'success');
        } catch (e) {
            console.error(e);
            showToast('Error al inicializar mesas por defecto', 'error');
        } finally {
            setIsSaving(false);
            triggerHaptic?.('light');
        }
    };

    // Inline edit handlers
    const startInlineEdit = (t) => {
        setInlineEditId(t.id);
        setInlineEditName(t.name);
        setInlineEditType(t.type || 'POOL');
        setDeleteConfirmId(null);
    };
    const cancelInlineEdit = () => {
        setInlineEditId(null);
        setInlineEditName('');
        setInlineEditType('POOL');
    };
    const saveInlineEdit = async () => {
        if (!inlineEditName.trim()) return;
        const duplicate = tables.some(t => t.name.trim().toLowerCase() === inlineEditName.trim().toLowerCase() && t.id !== inlineEditId);
        if (duplicate) { showToast('Ya existe una mesa con ese nombre', 'error'); return; }
        setInlineEditSaving(true);
        try {
            await updateTable(inlineEditId, { name: inlineEditName, type: inlineEditType });
            showToast('Mesa actualizada', 'success');
            cancelInlineEdit();
        } catch (e) {
            showToast('Error al actualizar', 'error');
        } finally {
            setInlineEditSaving(false);
            triggerHaptic?.('light');
        }
    };

    // Inline delete handler
    const handleInlineDelete = async (id) => {
        const session = activeSessions.find(s => s.table_id === id);
        if (session) {
            const msg = session.status === 'CHECKOUT'
                ? 'No puedes borrar una mesa que está en cobro'
                : 'No puedes borrar una mesa que está abierta';
            showToast(msg, 'error');
            setDeleteConfirmId(null);
            return;
        }
        try {
            await deleteTable(id);
            showToast('Mesa eliminada', 'success');
            triggerHaptic?.('light');
        } catch (e) {
            showToast('Error al eliminar mesa', 'error');
        } finally {
            setDeleteConfirmId(null);
        }
    };

    // Filtered tables
    const filteredTables = searchFilter
        ? tables.filter(t => t.name.toLowerCase().includes(searchFilter.toLowerCase()))
        : tables;

    // Counters
    const poolCount = tables.filter(t => t.type !== 'NORMAL').length;
    const normalCount = tables.filter(t => t.type === 'NORMAL').length;


    return (
        <div className="space-y-6">
            {/* Tarifas */}
            <div data-tour="settings-mesas-rates">
            <SectionCard icon={DollarSign} title="Tarifas de Juego" subtitle="Precio en Pesos Colombianos (COP)" iconColor="text-emerald-500">

                <div className="space-y-4">
                    {/* Hora Libre Block */}
                    <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-3">
                            <div className="w-7 h-7 rounded-lg bg-sky-100 dark:bg-sky-900/30 flex items-center justify-center">
                                <Clock size={14} className="text-sky-600 dark:text-sky-400" />
                            </div>
                            <span className="text-xs font-black text-slate-700 dark:text-slate-200 uppercase tracking-wider">Hora Libre</span>
                        </div>
                        <div>
                            <label className="text-[10px] uppercase font-bold text-slate-400 mb-1 block">Pesos Colombianos (COP)</label>
                            <div className="relative">
                                <span className="absolute inset-y-0 left-0 pl-3 flex items-center font-bold text-slate-400">$</span>
                                <input
                                    type="number"
                                    value={pricePerHour}
                                    onChange={e => setPricePerHour(e.target.value)}
                                    onWheel={e => e.target.blur()}
                                    className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl pl-8 pr-3 py-2.5 text-sm font-bold focus:ring-2 focus:ring-sky-500/30 transition-all dark:text-white"
                                />
                            </div>
                        </div>
                        {/* Price per minute helper */}
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-bold text-slate-400">
                            {pricePerHour > 0 && (
                                <span className="flex items-center gap-1">
                                    <Clock size={10} /> {formatCOPDecimals(parseFloat(pricePerHour) / 60)}/min
                                </span>
                            )}
                        </div>
                    </div>

                    {/* La Piña Block */}
                    <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-3">
                            <div className="w-7 h-7 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                                <Trophy size={14} className="text-amber-600 dark:text-amber-400" />
                            </div>
                            <span className="text-xs font-black text-slate-700 dark:text-slate-200 uppercase tracking-wider">La Piña</span>
                        </div>
                        <div>
                            <label className="text-[10px] uppercase font-bold text-slate-400 mb-1 block">Pesos Colombianos (COP)</label>
                            <div className="relative">
                                <span className="absolute inset-y-0 left-0 pl-3 flex items-center font-bold text-slate-400">$</span>
                                <input
                                    type="number"
                                    value={pricePina}
                                    onChange={e => setPricePina(e.target.value)}
                                    onWheel={e => e.target.blur()}
                                    className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl pl-8 pr-3 py-2.5 text-sm font-bold focus:ring-2 focus:ring-amber-500/30 transition-all dark:text-white"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                <button
                    onClick={handleSaveConfig}
                    className={`w-full flex items-center justify-center gap-2 py-3 mt-4 font-bold text-xs uppercase tracking-wider rounded-xl transition-colors active:scale-[0.98] ${
                        anyZero
                            ? 'bg-rose-50 dark:bg-rose-900/20 text-rose-500 dark:text-rose-400 hover:bg-rose-100'
                            : 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100'
                    }`}
                >
                    {anyZero ? <><AlertTriangle size={16} /> Tarifas en 0</> : <><Check size={16} /> Guardar Tarifas</>}
                </button>
            </SectionCard>
            </div>

            {/* Administracion de Mesas */}
            <div data-tour="settings-mesas-add">
            <SectionCard icon={Layers} title="Infraestructura de Mesas" subtitle="Crea y gestiona las áreas del bar" iconColor="text-sky-500">
                {/* Add Form (only for new tables) */}
                <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 mb-6">
                    <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
                        Añadir Nueva Mesa
                    </h4>
                    <div className="flex flex-col gap-3">
                        <input
                            type="text"
                            placeholder="Nombre (ej. Mesa VIP)"
                            value={tableName}
                            onChange={(e) => setTableName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleAddTable()}
                            className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm font-medium dark:text-white focus:ring-2 focus:ring-sky-500/30 outline-none"
                        />
                        <div className="flex gap-2">
                            <div className="flex flex-1 rounded-lg overflow-hidden border border-slate-300 dark:border-slate-700 min-w-0">
                                <button
                                    type="button"
                                    onClick={() => setTableType('POOL')}
                                    className={`flex-1 text-xs font-bold py-2 px-2 transition-colors truncate ${tableType === 'POOL' ? 'bg-sky-500 text-white' : 'bg-white dark:bg-slate-950 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900'}`}
                                >
                                    Pool (Tiempo)
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setTableType('NORMAL')}
                                    className={`flex-1 text-xs font-bold py-2 px-2 transition-colors truncate border-l border-slate-300 dark:border-slate-700 ${tableType === 'NORMAL' ? 'bg-amber-500 text-white' : 'bg-white dark:bg-slate-950 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900'}`}
                                >
                                    Normal (Bar)
                                </button>
                            </div>
                            <button
                                onClick={handleAddTable}
                                disabled={!tableName.trim() || isSaving}
                                className="shrink-0 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white font-bold px-4 py-2 rounded-lg text-sm transition-colors flex items-center justify-center gap-1.5"
                            >
                                <Plus size={15} /> Agregar
                            </button>
                        </div>
                    </div>
                </div>

                {/* Botón de Inicialización Rápida en Lote */}
                <div className="bg-sky-50 dark:bg-sky-950/20 border border-sky-100 dark:border-sky-900/30 rounded-xl p-4 mb-6 text-center">
                    <p className="text-[11px] font-bold text-sky-700 dark:text-sky-300 mb-2 leading-relaxed">
                        ¿Quieres poblar la base de datos automáticamente? Inicializa todas las mesas del local (3 de Pool y 26 normales/bancos) de un solo golpe de acuerdo al plano.
                    </p>
                    <button
                        type="button"
                        onClick={handleInitializeDefaultTables}
                        disabled={isSaving}
                        className="bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-black px-4 py-2.5 rounded-lg text-xs tracking-wider uppercase transition-all active:scale-95 flex items-center justify-center gap-1.5 mx-auto shadow-sm shadow-sky-500/10"
                    >
                        ⚡ Inicializar Mesas del Local
                    </button>
                </div>

                {/* Counter */}
                {tables.length > 0 && (
                    <div className="flex items-center gap-2 mb-3 px-1">
                        <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                            {tables.length} {tables.length === 1 ? 'mesa' : 'mesas'}
                        </span>
                        <span className="text-[10px] text-slate-400">
                            ({poolCount} Pool, {normalCount} Normal)
                        </span>
                    </div>
                )}

                {/* Search (only if 8+ tables) */}
                {tables.length >= 8 && (
                    <div className="relative mb-3">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            value={searchFilter}
                            onChange={e => setSearchFilter(e.target.value)}
                            placeholder="Buscar mesa..."
                            className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl pl-9 pr-8 py-2 text-sm font-medium dark:text-white focus:ring-2 focus:ring-sky-500/30 outline-none transition-all"
                        />
                        {searchFilter && (
                            <button onClick={() => setSearchFilter('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                                <X size={14} />
                            </button>
                        )}
                    </div>
                )}

                {/* List with fixed height scroll */}
                <div className="max-h-[420px] overflow-y-auto space-y-2 pr-0.5">
                    {filteredTables.map(table => {
                        const isOccupied = activeSessions.some(s => s.table_id === table.id);
                        const isEditingThis = inlineEditId === table.id;
                        const isDeletingThis = deleteConfirmId === table.id;

                        // Inline delete confirmation row
                        if (isDeletingThis) {
                            return (
                                <div key={table.id} className="flex items-center justify-between p-3 border-2 border-rose-300 dark:border-rose-700 rounded-xl bg-rose-50 dark:bg-rose-900/20 animate-[fadeIn_0.15s_ease]">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <AlertTriangle size={16} className="text-rose-500 shrink-0" />
                                        <span className="text-sm font-bold text-rose-700 dark:text-rose-300 truncate">
                                            ¿Eliminar {table.name}?
                                        </span>
                                    </div>
                                    <div className="flex gap-2 shrink-0">
                                        <button
                                            onClick={() => handleInlineDelete(table.id)}
                                            className="px-3 py-1.5 bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold rounded-lg transition-colors active:scale-95"
                                        >
                                            Eliminar
                                        </button>
                                        <button
                                            onClick={() => setDeleteConfirmId(null)}
                                            className="px-3 py-1.5 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 text-xs font-bold rounded-lg transition-colors"
                                        >
                                            No
                                        </button>
                                    </div>
                                </div>
                            );
                        }

                        // Inline edit row
                        if (isEditingThis) {
                            return (
                                <div key={table.id} className="p-3 border-2 border-sky-300 dark:border-sky-700 rounded-xl bg-sky-50 dark:bg-sky-900/10 animate-[fadeIn_0.15s_ease]">
                                    <div className="flex flex-col gap-2">
                                        <input
                                            type="text"
                                            value={inlineEditName}
                                            onChange={e => setInlineEditName(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && saveInlineEdit()}
                                            autoFocus
                                            className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm font-bold dark:text-white focus:ring-2 focus:ring-sky-500/30 outline-none"
                                        />
                                        <div className="flex gap-2">
                                            <div className="flex flex-1 rounded-lg overflow-hidden border border-slate-300 dark:border-slate-700 min-w-0">
                                                <button
                                                    type="button"
                                                    onClick={() => setInlineEditType('POOL')}
                                                    className={`flex-1 text-[11px] font-bold py-1.5 px-2 transition-colors ${inlineEditType === 'POOL' ? 'bg-sky-500 text-white' : 'bg-white dark:bg-slate-950 text-slate-500 dark:text-slate-400'}`}
                                                >
                                                    Pool
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setInlineEditType('NORMAL')}
                                                    className={`flex-1 text-[11px] font-bold py-1.5 px-2 transition-colors border-l border-slate-300 dark:border-slate-700 ${inlineEditType === 'NORMAL' ? 'bg-amber-500 text-white' : 'bg-white dark:bg-slate-950 text-slate-500 dark:text-slate-400'}`}
                                                >
                                                    Normal
                                                </button>
                                            </div>
                                            <button
                                                onClick={saveInlineEdit}
                                                disabled={!inlineEditName.trim() || inlineEditSaving}
                                                className="shrink-0 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 active:scale-95"
                                            >
                                                {inlineEditSaving ? (
                                                    <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                                                ) : (
                                                    <><Check size={13} /> Guardar</>
                                                )}
                                            </button>
                                            <button
                                                onClick={cancelInlineEdit}
                                                className="shrink-0 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 px-2.5 py-1.5 rounded-lg transition-colors"
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        }

                        // Normal display row
                        return (
                            <div key={table.id} className="flex items-center justify-between p-3 border border-slate-100 dark:border-white/5 rounded-xl hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                                <div className="min-w-0">
                                    <h5 className="font-bold text-slate-800 dark:text-white text-sm truncate">{table.name}</h5>
                                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                                            table.type === 'NORMAL' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400'
                                        }`}>
                                            {table.type === 'NORMAL' ? 'NORMAL' : 'POOL'}
                                        </span>
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                            isOccupied
                                                ? 'bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400'
                                                : 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'
                                        }`}>
                                            {isOccupied ? 'OCUPADA' : 'LIBRE'}
                                        </span>
                                    </div>
                                </div>
                                <div className="flex gap-1.5 items-center shrink-0">
                                    <button onClick={() => startInlineEdit(table)} className="p-2 text-slate-400 hover:text-sky-500 hover:bg-sky-50 dark:hover:bg-sky-900/30 rounded-lg transition-all">
                                        <Edit2 size={16} />
                                    </button>
                                    <button onClick={() => { setDeleteConfirmId(table.id); setInlineEditId(null); }} className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded-lg transition-all" disabled={isOccupied} title={isOccupied ? 'No se puede eliminar una mesa ocupada' : 'Eliminar mesa'} style={isOccupied ? { opacity: 0.3, cursor: 'not-allowed' } : {}}>
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                    {tables.length === 0 && (
                        <p className="text-center text-sm text-slate-400 py-4">No hay mesas configuradas.</p>
                    )}
                    {tables.length > 0 && filteredTables.length === 0 && searchFilter && (
                        <p className="text-center text-sm text-slate-400 py-4">No se encontraron mesas con "{searchFilter}"</p>
                    )}
                </div>
            </SectionCard>
            </div>
        </div>
    );
}
