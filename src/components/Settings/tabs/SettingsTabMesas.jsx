import React, { useState, useEffect } from 'react';
import { Layers, Check, Plus, Trash2, Edit2, X, DollarSign, AlertTriangle, Search, Clock, Trophy } from 'lucide-react';
import { SectionCard } from '../../SettingsShared';
import { useTablesStore } from '../../../hooks/store/useTablesStore';

function useBcvRate() {
    const getEffectiveRate = () => {
        try {
            const useAuto = JSON.parse(localStorage.getItem('bodega_use_auto_rate') ?? 'true');
            if (!useAuto) {
                const manual = parseFloat(localStorage.getItem('bodega_custom_rate'));
                if (manual > 0) return { rate: manual, isManual: true };
            }
            const saved = JSON.parse(localStorage.getItem('monitor_rates_v12'));
            return { rate: saved?.bcv?.price || 1, isManual: false };
        } catch { return { rate: 1, isManual: false }; }
    };
    const [data, setData] = useState(getEffectiveRate);
    useEffect(() => {
        const handleStorage = () => setData(getEffectiveRate());
        window.addEventListener('storage', handleStorage);
        return () => window.removeEventListener('storage', handleStorage);
    }, []);
    return data;
}

export default function SettingsTabMesas({ showToast, triggerHaptic }) {
    const { config, updateConfig, tables, activeSessions, addTable, updateTable, deleteTable } = useTablesStore();
    const { rate: bcvRate, isManual: isManualRate } = useBcvRate();
    const rateLabel = isManualRate ? 'Tasa Manual' : 'Tasa BCV';

    // Config State — synced from store config
    const [pricePerHour, setPricePerHour] = useState(config?.pricePerHour || 0);
    const [pricePina, setPricePina] = useState(config?.pricePina || 0);
    // Bs prices — independent, not auto-converted
    const [pricePerHourBs, setPricePerHourBs] = useState(config?.pricePerHourBs || '');
    const [pricePinaBs, setPricePinaBs] = useState(config?.pricePinaBs || '');

    // Implied rates (informational)
    const impliedRateHour = (parseFloat(pricePerHourBs) > 0 && parseFloat(pricePerHour) > 0)
        ? (parseFloat(pricePerHourBs) / parseFloat(pricePerHour)).toFixed(2)
        : null;
    const impliedRatePina = (parseFloat(pricePinaBs) > 0 && parseFloat(pricePina) > 0)
        ? (parseFloat(pricePinaBs) / parseFloat(pricePina)).toFixed(2)
        : null;

    // Sync local state when external config changes (e.g., from another tab/device)
    const configPricePerHour = config?.pricePerHour;
    const configPricePina = config?.pricePina;
    const configPricePerHourBs = config?.pricePerHourBs;
    const configPricePinaBs = config?.pricePinaBs;
    useEffect(() => {
        const raf = requestAnimationFrame(() => {
            if (configPricePerHour != null) setPricePerHour(configPricePerHour);
            if (configPricePina != null) setPricePina(configPricePina);
            if (configPricePerHourBs != null) setPricePerHourBs(configPricePerHourBs || '');
            if (configPricePinaBs != null) setPricePinaBs(configPricePinaBs || '');
        });
        return () => cancelAnimationFrame(raf);
    }, [configPricePerHour, configPricePina, configPricePerHourBs, configPricePinaBs]);

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

    // Check if implied rate is below BCV (would cause payment issues)
    const hourBsVal = parseFloat(pricePerHourBs) || 0;
    const hourUsdVal = parseFloat(pricePerHour) || 0;
    const pinaBsVal = parseFloat(pricePinaBs) || 0;
    const pinaUsdVal = parseFloat(pricePina) || 0;
    const hourRateBelow = hourBsVal > 0 && hourUsdVal > 0 && (hourBsVal / hourUsdVal) < bcvRate;
    const pinaRateBelow = pinaBsVal > 0 && pinaUsdVal > 0 && (pinaBsVal / pinaUsdVal) < bcvRate;
    const hourBsMissing = hourUsdVal > 0 && hourBsVal <= 0;
    const pinaBsMissing = pinaUsdVal > 0 && pinaBsVal <= 0;
    const anyZero = hourBsVal <= 0 || hourUsdVal <= 0 || pinaBsVal <= 0 || pinaUsdVal <= 0;
    const anyRateBelow = hourRateBelow || pinaRateBelow;
    const anyBsMissing = hourBsMissing || pinaBsMissing;
    const hasError = anyZero;

    const handleSaveConfig = async () => {
        if (anyZero) {
            const items = [];
            if (hourUsdVal <= 0) items.push('Hora Libre (USD)');
            if (hourBsVal <= 0) items.push('Hora Libre (Bs)');
            if (pinaUsdVal <= 0) items.push('La Piña (USD)');
            if (pinaBsVal <= 0) items.push('La Piña (Bs)');
            showToast(`Tarifa en 0: ${items.join(', ')}. Todas las tarifas deben ser mayores a 0.`, 'error');
            triggerHaptic?.('error');
            return;
        }
        if (anyRateBelow) {
            const items = [];
            if (hourRateBelow) items.push(`Hora Libre: ${(hourBsVal / hourUsdVal).toFixed(0)} Bs/$`);
            if (pinaRateBelow) items.push(`La Piña: ${(pinaBsVal / pinaUsdVal).toFixed(0)} Bs/$`);
            showToast(`Tasa implícita (${items.join(', ')}) menor que ${rateLabel} (${bcvRate.toFixed(0)} Bs/$). Al cobrar en Bs no cubrirá el monto en USD.`, 'warning');
            triggerHaptic?.('warning');
        }
        await updateConfig({
            pricePerHour: parseFloat(pricePerHour) || 0,
            pricePerHourBs: parseFloat(pricePerHourBs) || 0,
            pricePina: parseFloat(pricePina) || 0,
            pricePinaBs: parseFloat(pricePinaBs) || 0,
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
            <SectionCard icon={DollarSign} title="Tarifas de Juego" subtitle="Precio en $ y Bs por separado" iconColor="text-emerald-500">
                {/* Rate Reference */}
                {bcvRate > 0 && (
                    <div className="flex items-center gap-2 mb-4 px-3 py-2 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
                        <DollarSign size={13} className="text-slate-400 shrink-0" />
                        <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">{rateLabel}: <span className="text-emerald-600 dark:text-emerald-400">{bcvRate.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs/$</span></span>
                        {isManualRate && <span className="text-[10px] text-amber-500 ml-auto">manual</span>}
                    </div>
                )}

                <div className="space-y-4">
                    {/* Hora Libre Block */}
                    <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-3">
                            <div className="w-7 h-7 rounded-lg bg-sky-100 dark:bg-sky-900/30 flex items-center justify-center">
                                <Clock size={14} className="text-sky-600 dark:text-sky-400" />
                            </div>
                            <span className="text-xs font-black text-slate-700 dark:text-slate-200 uppercase tracking-wider">Hora Libre</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="flex-1">
                                <label className="text-[10px] uppercase font-bold text-slate-400 mb-1 block">USD</label>
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
                            <Plus size={14} className="text-slate-300 dark:text-slate-600 mt-5 shrink-0" />
                            <div className="flex-1">
                                <label className="text-[10px] uppercase font-bold text-emerald-500 mb-1 block">Bolívares</label>
                                <div className="relative">
                                    <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center font-bold text-emerald-500 text-xs">Bs</span>
                                    <input
                                        type="number"
                                        value={pricePerHourBs}
                                        onChange={e => setPricePerHourBs(e.target.value)}
                                        onWheel={e => e.target.blur()}
                                        placeholder="0"
                                        className="w-full bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl pl-9 pr-3 py-2.5 text-sm font-bold focus:ring-2 focus:ring-emerald-500/30 transition-all text-emerald-700 dark:text-emerald-300"
                                    />
                                </div>
                            </div>
                        </div>
                        {/* Implied rate + price per minute */}
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-bold text-slate-400">
                            {pricePerHour > 0 && (
                                <span className="flex items-center gap-1">
                                    <Clock size={10} /> ${(parseFloat(pricePerHour) / 60).toFixed(4)}/min
                                </span>
                            )}
                            {impliedRateHour && (
                                <span className={`px-1.5 py-0.5 rounded-full ${
                                    hourRateBelow
                                        ? 'bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400'
                                        : Math.abs(parseFloat(impliedRateHour) - bcvRate) / bcvRate < 0.1
                                            ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'
                                            : 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400'
                                }`}>
                                    Tasa: {parseFloat(impliedRateHour).toLocaleString('es-VE')} Bs/$
                                    {bcvRate > 0 && <span className="opacity-60"> ({rateLabel}: {bcvRate.toLocaleString('es-VE')})</span>}
                                </span>
                            )}
                        </div>
                        {hourRateBelow && (
                            <div className="mt-1.5 flex items-center gap-1.5 text-[10px] font-bold text-rose-500 bg-rose-50 dark:bg-rose-900/20 px-2.5 py-1.5 rounded-lg border border-rose-200 dark:border-rose-800">
                                <AlertTriangle size={12} className="shrink-0" />
                                <span>Tasa menor que {rateLabel} — al cobrar en Bs no cubrirá el monto en USD</span>
                            </div>
                        )}
                        {hourBsMissing && (
                            <div className="mt-1.5 flex items-center gap-1.5 text-[10px] font-bold text-rose-500 bg-rose-50 dark:bg-rose-900/20 px-2.5 py-1.5 rounded-lg border border-rose-200 dark:border-rose-800">
                                <AlertTriangle size={12} className="shrink-0" />
                                <span>Falta precio en Bs — coloca el precio en Bolívares para la Hora Libre</span>
                            </div>
                        )}
                    </div>

                    {/* La Piña Block */}
                    <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-3">
                            <div className="w-7 h-7 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                                <Trophy size={14} className="text-amber-600 dark:text-amber-400" />
                            </div>
                            <span className="text-xs font-black text-slate-700 dark:text-slate-200 uppercase tracking-wider">La Piña</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="flex-1">
                                <label className="text-[10px] uppercase font-bold text-slate-400 mb-1 block">USD</label>
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
                            <Plus size={14} className="text-slate-300 dark:text-slate-600 mt-5 shrink-0" />
                            <div className="flex-1">
                                <label className="text-[10px] uppercase font-bold text-emerald-500 mb-1 block">Bolívares</label>
                                <div className="relative">
                                    <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center font-bold text-emerald-500 text-xs">Bs</span>
                                    <input
                                        type="number"
                                        value={pricePinaBs}
                                        onChange={e => setPricePinaBs(e.target.value)}
                                        onWheel={e => e.target.blur()}
                                        placeholder="0"
                                        className="w-full bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl pl-9 pr-3 py-2.5 text-sm font-bold focus:ring-2 focus:ring-emerald-500/30 transition-all text-emerald-700 dark:text-emerald-300"
                                    />
                                </div>
                            </div>
                        </div>
                        {/* Implied rate for Pi\u00f1a */}
                        {impliedRatePina && (
                            <div className="mt-2 text-[10px] font-bold">
                                <span className={`px-1.5 py-0.5 rounded-full ${
                                    pinaRateBelow
                                        ? 'bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400'
                                        : Math.abs(parseFloat(impliedRatePina) - bcvRate) / bcvRate < 0.1
                                            ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'
                                            : 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400'
                                }`}>
                                    Tasa: {parseFloat(impliedRatePina).toLocaleString('es-VE')} Bs/$
                                    {bcvRate > 0 && <span className="opacity-60"> (BCV: {bcvRate.toLocaleString('es-VE')})</span>}
                                </span>
                            </div>
                        )}
                        {pinaRateBelow && (
                            <div className="mt-1.5 flex items-center gap-1.5 text-[10px] font-bold text-rose-500 bg-rose-50 dark:bg-rose-900/20 px-2.5 py-1.5 rounded-lg border border-rose-200 dark:border-rose-800">
                                <AlertTriangle size={12} className="shrink-0" />
                                <span>Tasa menor que {rateLabel} — al cobrar en Bs no cubrirá el monto en USD</span>
                            </div>
                        )}
                        {pinaBsMissing && (
                            <div className="mt-1.5 flex items-center gap-1.5 text-[10px] font-bold text-rose-500 bg-rose-50 dark:bg-rose-900/20 px-2.5 py-1.5 rounded-lg border border-rose-200 dark:border-rose-800">
                                <AlertTriangle size={12} className="shrink-0" />
                                <span>Falta precio en Bs — coloca el precio en Bolívares para La Piña</span>
                            </div>
                        )}
                    </div>
                </div>

                <button
                    onClick={handleSaveConfig}
                    className={`w-full flex items-center justify-center gap-2 py-3 mt-4 font-bold text-xs uppercase tracking-wider rounded-xl transition-colors active:scale-[0.98] ${
                        anyZero
                            ? 'bg-rose-50 dark:bg-rose-900/20 text-rose-500 dark:text-rose-400 hover:bg-rose-100'
                            : anyRateBelow
                            ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 hover:bg-amber-100'
                            : 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100'
                    }`}
                >
                    {anyZero ? <><AlertTriangle size={16} /> Tarifas en 0</> : anyRateBelow ? <><AlertTriangle size={16} /> Guardar con tasa menor</> : <><Check size={16} /> Guardar Tarifas</>}
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
