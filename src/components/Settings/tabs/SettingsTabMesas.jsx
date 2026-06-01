import React, { useState, useEffect, useMemo } from 'react';
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

    // Search & Bento-Grid Category Pagination States
    const [searchFilter, setSearchFilter] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('TODAS'); // 'TODAS' | 'POOL' | 'MESAS' | 'BANCOS'
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 12;

    // Reset page to 1 when filters change to avoid out of bounds view
    useEffect(() => {
        setCurrentPage(1);
    }, [searchFilter, categoryFilter]);

    // Categorization counts helper
    const counts = useMemo(() => {
        let pool = 0;
        let mesas = 0;
        let bancos = 0;
        tables.forEach(t => {
            if (t.type === 'POOL') pool++;
            else {
                const nameLower = t.name.toLowerCase();
                if (nameLower.startsWith('b') || nameLower.includes('banco') || nameLower.includes('barra')) bancos++;
                else mesas++;
            }
        });
        return { total: tables.length, pool, mesas, bancos };
    }, [tables]);

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

    // Filtered tables by search query AND category tabs
    const filteredTables = useMemo(() => {
        return tables.filter(t => {
            // 1. Filtro por query de búsqueda
            if (searchFilter && !t.name.toLowerCase().includes(searchFilter.toLowerCase())) {
                return false;
            }
            // 2. Filtro por categoría táctil
            const nameLower = t.name.toLowerCase();
            if (categoryFilter === 'POOL' && t.type !== 'POOL') return false;
            if (categoryFilter === 'MESAS' && (t.type === 'POOL' || nameLower.startsWith('b') || nameLower.includes('banco') || nameLower.includes('barra'))) return false;
            if (categoryFilter === 'BANCOS' && (t.type === 'POOL' || (!nameLower.startsWith('b') && !nameLower.includes('banco') && !nameLower.includes('barra')))) return false;
            
            return true;
        });
    }, [tables, searchFilter, categoryFilter]);

    // Paginated subset of tables to prevent DOM overload and scroll fatigue
    const paginatedTables = useMemo(() => {
        const startIndex = (currentPage - 1) * itemsPerPage;
        return filteredTables.slice(startIndex, startIndex + itemsPerPage);
    }, [filteredTables, currentPage]);

    const totalPages = Math.ceil(filteredTables.length / itemsPerPage);

    // Counters for legacy display
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
                {tables.length < 5 && (
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
                )}

                {/* Control Center: Search & Horizontal Category Pills */}
                {tables.length > 0 && (
                    <div className="space-y-4 mb-4">
                        {/* Permanent modern search bar */}
                        <div className="relative">
                            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="text"
                                value={searchFilter}
                                onChange={e => setSearchFilter(e.target.value)}
                                placeholder="Buscar mesa por nombre..."
                                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl pl-9.5 pr-8 py-2.5 text-sm font-semibold dark:text-white focus:ring-2 focus:ring-sky-500/20 outline-none transition-all"
                            />
                            {searchFilter && (
                                <button
                                    onClick={() => setSearchFilter('')}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                                >
                                    <X size={15} />
                                </button>
                            )}
                        </div>

                        {/* Category Pills Slider */}
                        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-800">
                            <button
                                type="button"
                                onClick={() => { setCategoryFilter('TODAS'); triggerHaptic?.('light'); }}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap active:scale-95 ${
                                    categoryFilter === 'TODAS'
                                        ? 'bg-sky-500 text-white shadow-sm shadow-sky-500/20'
                                        : 'bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/80'
                                }`}
                            >
                                Todas <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${categoryFilter === 'TODAS' ? 'bg-white/20 text-white' : 'bg-slate-200/60 dark:bg-slate-800 text-slate-600 dark:text-slate-400'}`}>{counts.total}</span>
                            </button>

                            <button
                                type="button"
                                onClick={() => { setCategoryFilter('POOL'); triggerHaptic?.('light'); }}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap active:scale-95 ${
                                    categoryFilter === 'POOL'
                                        ? 'bg-sky-500 text-white shadow-sm shadow-sky-500/20'
                                        : 'bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/80'
                                }`}
                            >
                                Pool <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${categoryFilter === 'POOL' ? 'bg-white/20 text-white' : 'bg-slate-200/60 dark:bg-slate-800 text-slate-600 dark:text-slate-400'}`}>{counts.pool}</span>
                            </button>

                            <button
                                type="button"
                                onClick={() => { setCategoryFilter('MESAS'); triggerHaptic?.('light'); }}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap active:scale-95 ${
                                    categoryFilter === 'MESAS'
                                        ? 'bg-sky-500 text-white shadow-sm shadow-sky-500/20'
                                        : 'bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/80'
                                }`}
                            >
                                Mesas <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${categoryFilter === 'MESAS' ? 'bg-white/20 text-white' : 'bg-slate-200/60 dark:bg-slate-800 text-slate-600 dark:text-slate-400'}`}>{counts.mesas}</span>
                            </button>

                            <button
                                type="button"
                                onClick={() => { setCategoryFilter('BANCOS'); triggerHaptic?.('light'); }}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap active:scale-95 ${
                                    categoryFilter === 'BANCOS'
                                        ? 'bg-sky-500 text-white shadow-sm shadow-sky-500/20'
                                        : 'bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/80'
                                }`}
                            >
                                Bancos <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${categoryFilter === 'BANCOS' ? 'bg-white/20 text-white' : 'bg-slate-200/60 dark:bg-slate-800 text-slate-600 dark:text-slate-400'}`}>{counts.bancos}</span>
                            </button>
                        </div>
                    </div>
                )}

                {/* Bento Grid layout containing the responsive cards */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 min-h-[80px]">
                    {paginatedTables.map(table => {
                        const isOccupied = activeSessions.some(s => s.table_id === table.id);
                        const isEditingThis = inlineEditId === table.id;
                        const isDeletingThis = deleteConfirmId === table.id;

                        // 1. Inline delete confirmation inside the Bento Card itself
                        if (isDeletingThis) {
                            return (
                                <div
                                    key={table.id}
                                    className="relative flex flex-col justify-between p-2.5 bg-rose-50/60 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 rounded-xl text-center animate-[fadeIn_0.12s_ease] h-[110px]"
                                >
                                    <div className="text-[11px] font-black text-rose-700 dark:text-rose-300 leading-tight pt-1">
                                        ¿Eliminar {table.name}?
                                    </div>
                                    <div className="flex gap-1.5 justify-center pb-1">
                                        <button
                                            onClick={() => handleInlineDelete(table.id)}
                                            className="px-3 py-1.5 bg-rose-500 hover:bg-rose-600 text-white text-[10px] font-bold rounded-lg transition-colors active:scale-95"
                                        >
                                            Eliminar
                                        </button>
                                        <button
                                            onClick={() => setDeleteConfirmId(null)}
                                            className="px-3 py-1.5 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 text-[10px] font-bold rounded-lg transition-colors"
                                        >
                                            No
                                        </button>
                                    </div>
                                </div>
                            );
                        }

                        // 2. Inline edit inside the Bento Card itself
                        if (isEditingThis) {
                            return (
                                <div
                                    key={table.id}
                                    className="relative flex flex-col justify-between p-2.5 bg-sky-50/50 dark:bg-sky-950/20 border-2 border-sky-400/50 dark:border-sky-850 rounded-xl animate-[fadeIn_0.12s_ease] h-[110px]"
                                >
                                    <input
                                        type="text"
                                        value={inlineEditName}
                                        onChange={e => setInlineEditName(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && saveInlineEdit()}
                                        autoFocus
                                        className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-1 text-xs font-bold dark:text-white outline-none"
                                    />
                                    <div className="flex items-center justify-between gap-1.5">
                                        <div className="flex rounded-md overflow-hidden border border-slate-200 dark:border-slate-800 text-[9px] font-bold">
                                            <button
                                                type="button"
                                                onClick={() => setInlineEditType('POOL')}
                                                className={`px-2 py-1 transition-colors ${inlineEditType === 'POOL' ? 'bg-sky-500 text-white' : 'bg-white dark:bg-slate-950 text-slate-500 dark:text-slate-400'}`}
                                            >
                                                Pool
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setInlineEditType('NORMAL')}
                                                className={`px-2 py-1 transition-colors border-l border-slate-200 dark:border-slate-800 ${inlineEditType === 'NORMAL' ? 'bg-amber-500 text-white' : 'bg-white dark:bg-slate-950 text-slate-500 dark:text-slate-400'}`}
                                            >
                                                Normal
                                            </button>
                                        </div>
                                        <div className="flex gap-1">
                                            <button
                                                onClick={saveInlineEdit}
                                                disabled={!inlineEditName.trim() || inlineEditSaving}
                                                className="bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white p-1.5 rounded-lg transition-colors flex items-center justify-center"
                                                title="Guardar"
                                            >
                                                <Check size={11} className="stroke-[3]" />
                                            </button>
                                            <button
                                                onClick={cancelInlineEdit}
                                                className="bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 p-1.5 rounded-lg transition-colors flex items-center justify-center"
                                                title="Cancelar"
                                            >
                                                <X size={11} className="stroke-[3]" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        }

                        // Helper to find exact category details
                        const isPool = table.type === 'POOL';
                        const nameLower = table.name.toLowerCase();
                        const isBanco = !isPool && (nameLower.startsWith('b') || nameLower.includes('banco') || nameLower.includes('barra'));
                        
                        // 3. Normal Bento card view (premium tactile, grid space efficient)
                        return (
                            <div
                                key={table.id}
                                className="relative flex flex-col justify-between p-3.5 bg-white dark:bg-slate-900/60 border border-slate-150 dark:border-slate-800 hover:border-sky-500/40 dark:hover:border-sky-500/40 rounded-xl hover:shadow-md transition-all duration-200 group h-[110px]"
                            >
                                {/* Active Session Glow Indicator (Top-Right) */}
                                {isOccupied ? (
                                    <span className="absolute top-3.5 right-3.5 flex h-2.5 w-2.5">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-450 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500"></span>
                                    </span>
                                ) : (
                                    <span className="absolute top-3.5 right-3.5 flex h-2 w-2">
                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                    </span>
                                )}

                                {/* Card Header with name */}
                                <div className="min-w-0 pr-5">
                                    <h5 className="font-extrabold text-slate-800 dark:text-white text-sm truncate select-none">
                                        {table.name}
                                    </h5>
                                </div>

                                {/* Category Badge */}
                                <div className="flex items-center">
                                    {isPool && (
                                        <span className="text-[9px] font-black px-2 py-0.5 rounded-md bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400 border border-sky-100 dark:border-sky-900/20 tracking-wider">
                                            POOL
                                        </span>
                                    )}
                                    {!isPool && isBanco && (
                                        <span className="text-[9px] font-black px-2 py-0.5 rounded-md bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 border border-purple-100 dark:border-purple-900/20 tracking-wider">
                                            BANCO
                                        </span>
                                    )}
                                    {!isPool && !isBanco && (
                                        <span className="text-[9px] font-black px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-100 dark:border-amber-900/20 tracking-wider">
                                            MESA
                                        </span>
                                    )}
                                </div>

                                {/* Card Footer Actions & Status Text */}
                                <div className="flex items-center justify-between border-t border-slate-50 dark:border-slate-800/40 pt-2 mt-1">
                                    <span className={`text-[9px] font-black tracking-widest ${isOccupied ? 'text-rose-500' : 'text-emerald-500'}`}>
                                        {isOccupied ? 'OCUPADA' : 'LIBRE'}
                                    </span>
                                    <div className="flex items-center gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
                                        <button
                                            onClick={() => startInlineEdit(table)}
                                            className="p-1 text-slate-400 hover:text-sky-500 hover:bg-sky-50 dark:hover:bg-slate-800 rounded-md transition-all"
                                            title="Editar mesa"
                                        >
                                            <Edit2 size={13} />
                                        </button>
                                        <button
                                            onClick={() => { setDeleteConfirmId(table.id); setInlineEditId(null); }}
                                            className="p-1 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-slate-800 rounded-md transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                                            disabled={isOccupied}
                                            title={isOccupied ? 'No se puede eliminar una mesa ocupada' : 'Eliminar mesa'}
                                        >
                                            <Trash2 size={13} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Empty State message */}
                {tables.length === 0 && (
                    <p className="text-center text-sm text-slate-400 py-6">No hay mesas configuradas.</p>
                )}
                {tables.length > 0 && filteredTables.length === 0 && (
                    <p className="text-center text-sm text-slate-400 py-6">
                        No se encontraron mesas que coincidan con la búsqueda.
                    </p>
                )}

                {/* Premium Pagination controls footer */}
                {totalPages > 1 && (
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-100 dark:border-slate-800/60 pt-4 mt-5 text-xs font-bold text-slate-500 dark:text-slate-400 select-none">
                        <div>
                            Mostrando <span className="text-slate-800 dark:text-white">{(currentPage - 1) * itemsPerPage + 1}</span> - <span className="text-slate-800 dark:text-white">{Math.min(filteredTables.length, currentPage * itemsPerPage)}</span> de <span className="text-slate-800 dark:text-white">{filteredTables.length}</span> mesas
                        </div>
                        <div className="flex items-center gap-1">
                            <button
                                disabled={currentPage === 1}
                                onClick={() => { setCurrentPage(p => Math.max(1, p - 1)); triggerHaptic?.('light'); }}
                                className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900 disabled:opacity-40 transition-colors text-[11px]"
                            >
                                Ant.
                            </button>
                            
                            {Array.from({ length: totalPages }).map((_, i) => {
                                const pageNum = i + 1;
                                const isCurrent = pageNum === currentPage;
                                return (
                                    <button
                                        key={pageNum}
                                        onClick={() => { setCurrentPage(pageNum); triggerHaptic?.('light'); }}
                                        className={`w-7 h-7 rounded-lg text-xs font-bold flex items-center justify-center transition-all ${
                                            isCurrent
                                                ? 'bg-sky-500 text-white shadow-sm shadow-sky-500/20'
                                                : 'border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900'
                                        }`}
                                    >
                                        {pageNum}
                                    </button>
                                );
                            })}

                            <button
                                disabled={currentPage === totalPages}
                                onClick={() => { setCurrentPage(p => Math.min(totalPages, p + 1)); triggerHaptic?.('light'); }}
                                className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900 disabled:opacity-40 transition-colors text-[11px]"
                            >
                                Sig.
                            </button>
                        </div>
                    </div>
                )}
            </SectionCard>
            </div>
        </div>
    );
}
