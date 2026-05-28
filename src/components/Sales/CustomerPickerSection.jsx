import { useState, useRef, useEffect } from 'react';
import { Users, ChevronDown, UserPlus, Check, Wallet, Search, X, AlertCircle, TrendingUp, Phone, CreditCard } from 'lucide-react';
import { formatBs } from '../../utils/calculatorUtils';

// Color de avatar consistente por inicial
const AVATAR_COLORS = [
    ['bg-blue-100 dark:bg-blue-900/40', 'text-blue-600 dark:text-blue-400'],
    ['bg-violet-100 dark:bg-violet-900/40', 'text-violet-600 dark:text-violet-400'],
    ['bg-amber-100 dark:bg-amber-900/40', 'text-amber-600 dark:text-amber-400'],
    ['bg-rose-100 dark:bg-rose-900/40', 'text-rose-600 dark:text-rose-400'],
    ['bg-cyan-100 dark:bg-cyan-900/40', 'text-cyan-600 dark:text-cyan-400'],
    ['bg-emerald-100 dark:bg-emerald-900/40', 'text-emerald-600 dark:text-emerald-400'],
    ['bg-orange-100 dark:bg-orange-900/40', 'text-orange-600 dark:text-orange-400'],
    ['bg-pink-100 dark:bg-pink-900/40', 'text-pink-600 dark:text-pink-400'],
];
const avatarColor = (name = '') => AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];

function Highlight({ text = '', query = '' }) {
    if (!query.trim()) return <span>{text}</span>;
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return <span>{text}</span>;
    return (
        <span>
            {text.slice(0, idx)}
            <mark className="bg-emerald-200 dark:bg-emerald-700/60 text-emerald-800 dark:text-emerald-200 rounded px-0.5 not-italic font-bold">
                {text.slice(idx, idx + query.length)}
            </mark>
            {text.slice(idx + query.length)}
        </span>
    );
}

// ─── Bottom Sheet: Selector de cliente ───────────────────────────────────────
function CustomerPickerSheet({ customers, selectedCustomerId, onSelect, onClose, onNewClient, EPSILON }) {
    const [search, setSearch] = useState('');
    const searchRef = useRef(null);

    useEffect(() => {
        setTimeout(() => searchRef.current?.focus(), 120);
    }, []);

    const q = search.toLowerCase().trim();
    const filtered = q
        ? customers.filter(c =>
            c.name.toLowerCase().includes(q) ||
            (c.documentId && c.documentId.toLowerCase().includes(q)) ||
            (c.phone && c.phone.replace(/\D/g, '').includes(q.replace(/\D/g, '')))
          )
        : [...customers].sort((a, b) => {
            if (a.id === selectedCustomerId) return -1;
            if (b.id === selectedCustomerId) return 1;
            if (Math.abs(a.deuda || 0) > 0 && Math.abs(b.deuda || 0) === 0) return -1;
            if (Math.abs(b.deuda || 0) > 0 && Math.abs(a.deuda || 0) === 0) return 1;
            return a.name.localeCompare(b.name, 'es');
          });

    return (
        <div
            className="fixed inset-0 z-[200] flex items-end justify-center"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-150" />

            <div className="relative z-10 w-full sm:max-w-sm bg-white dark:bg-slate-900 rounded-t-3xl shadow-2xl animate-in slide-in-from-bottom-4 duration-200 flex flex-col max-h-[82vh]">

                {/* Handle */}
                <div className="flex justify-center pt-3 pb-1 shrink-0">
                    <div className="w-10 h-1 bg-slate-300 dark:bg-slate-700 rounded-full" />
                </div>

                {/* Header */}
                <div className="flex items-center justify-between px-5 pt-1 pb-3 shrink-0">
                    <div>
                        <h3 className="text-base font-black text-slate-800 dark:text-white">Seleccionar cliente</h3>
                        <p className="text-xs text-slate-400 mt-0.5">{customers.length} clientes registrados</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    >
                        <X size={16} />
                    </button>
                </div>

                {/* Buscador sticky */}
                <div className="px-4 pb-3 shrink-0">
                    <div className="flex items-center gap-2.5 px-4 py-3 bg-slate-100 dark:bg-slate-800 rounded-2xl">
                        <Search size={16} className="text-slate-400 shrink-0" />
                        <input
                            ref={searchRef}
                            type="text"
                            placeholder="Buscar por nombre, cédula o teléfono..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="flex-1 bg-transparent text-sm text-slate-800 dark:text-slate-100 outline-none placeholder:text-slate-400 font-medium"
                        />
                        {search && (
                            <button
                                onClick={() => setSearch('')}
                                className="w-5 h-5 bg-slate-300 dark:bg-slate-600 rounded-full flex items-center justify-center"
                            >
                                <X size={10} className="text-slate-600 dark:text-slate-200" />
                            </button>
                        )}
                    </div>
                </div>

                {/* Lista scrolleable */}
                <div className="overflow-y-auto overscroll-contain flex-1 pb-safe">

                    {/* Consumidor Final */}
                    {!q && (
                        <button
                            onClick={() => onSelect('')}
                            className={`w-full flex items-center gap-3 px-5 py-3.5 transition-colors ${
                                !selectedCustomerId
                                    ? 'bg-emerald-50 dark:bg-emerald-900/20'
                                    : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                            }`}
                        >
                            <div className="w-10 h-10 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                                <Users size={18} className="text-slate-400" />
                            </div>
                            <div className="flex-1 text-left">
                                <span className={`text-sm font-bold ${!selectedCustomerId ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-300'}`}>
                                    Consumidor Final
                                </span>
                                <p className="text-xs text-slate-400 mt-0.5">Sin datos de cliente</p>
                            </div>
                            {!selectedCustomerId && <Check size={16} className="text-emerald-500 shrink-0" />}
                        </button>
                    )}

                    {/* Nuevo cliente */}
                    <button
                        onClick={() => { onClose(); onNewClient(search); }}
                        className="w-full flex items-center gap-3 px-5 py-3.5 border-t border-slate-100 dark:border-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors"
                    >
                        <div className="w-10 h-10 rounded-2xl bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center shrink-0">
                            <UserPlus size={18} className="text-emerald-600 dark:text-emerald-400" />
                        </div>
                        <div className="flex-1 text-left">
                            <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                                {q ? `Crear "${search}"` : 'Nuevo cliente...'}
                            </span>
                            <p className="text-xs text-slate-400 mt-0.5">Agregar a la base de clientes</p>
                        </div>
                    </button>

                    {/* Separador */}
                    {filtered.length > 0 && (
                        <div className="flex items-center gap-3 px-5 py-2 border-t border-slate-100 dark:border-slate-800">
                            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                                {q ? `${filtered.length} resultado${filtered.length !== 1 ? 's' : ''}` : 'Clientes'}
                            </span>
                        </div>
                    )}

                    {/* Lista de clientes */}
                    {filtered.map(c => {
                        const [bgColor, textColor] = avatarColor(c.name);
                        const isSelected = selectedCustomerId === c.id;
                        const hasDebt = Math.abs(c.deuda || 0) > (EPSILON || 0.001);
                        return (
                            <button
                                key={c.id}
                                onClick={() => onSelect(c.id)}
                                className={`w-full flex items-center gap-3 px-5 py-3 transition-colors border-t border-slate-50 dark:border-slate-800/60 ${
                                    isSelected
                                        ? 'bg-emerald-50 dark:bg-emerald-900/20'
                                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                                }`}
                            >
                                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 text-base font-black ${bgColor} ${textColor}`}>
                                    {c.name.charAt(0).toUpperCase()}
                                </div>
                                <div className="min-w-0 flex-1 text-left">
                                    <div className={`text-sm font-semibold truncate ${isSelected ? 'text-emerald-700 dark:text-emerald-300 font-bold' : 'text-slate-800 dark:text-slate-200'}`}>
                                        <Highlight text={c.name} query={search} />
                                    </div>
                                    <div className="flex items-center gap-3 mt-0.5">
                                        {c.documentId && (
                                            <span className="text-[11px] text-slate-400 flex items-center gap-1">
                                                <CreditCard size={10} className="shrink-0" />
                                                <Highlight text={c.documentId} query={search} />
                                            </span>
                                        )}
                                        {c.phone && (
                                            <span className="text-[11px] text-slate-400 flex items-center gap-1">
                                                <Phone size={10} className="shrink-0" />
                                                <Highlight text={c.phone} query={search} />
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="flex flex-col items-end gap-1 shrink-0">
                                    {isSelected && <Check size={15} className="text-emerald-500" />}
                                    {hasDebt && (
                                        <div className={`flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full ${
                                            c.deuda > 0
                                                ? 'bg-red-50 dark:bg-red-900/20 text-red-500'
                                                : 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600'
                                        }`}>
                                            {c.deuda > 0 ? <AlertCircle size={10} /> : <TrendingUp size={10} />}
                                            ${Math.abs(c.deuda).toFixed(2)}
                                        </div>
                                    )}
                                </div>
                            </button>
                        );
                    })}

                    {/* Sin resultados */}
                    {q && filtered.length === 0 && (
                        <div className="px-5 py-10 text-center border-t border-slate-100 dark:border-slate-800">
                            <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-3">
                                <Search size={20} className="text-slate-400" />
                            </div>
                            <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                                Sin resultados para "{search}"
                            </p>
                            <p className="text-xs text-slate-400 mt-1">
                                Usa "Crear" para agregarlo como nuevo cliente
                            </p>
                        </div>
                    )}

                    <div className="h-4" /> {/* safe area bottom */}
                </div>
            </div>
        </div>
    );
}

// ─── Bottom Sheet: Nuevo cliente ─────────────────────────────────────────────
function NewClientModal({ onClose, onSave, initialName = '' }) {
    const [name, setName] = useState(initialName);
    const [document, setDocument] = useState('');
    const [phone, setPhone] = useState('');
    const [saving, setSaving] = useState(false);
    const nameRef = useRef(null);

    useEffect(() => {
        setTimeout(() => nameRef.current?.focus(), 80);
    }, []);

    const handleSave = async () => {
        if (!name.trim()) return;
        setSaving(true);
        try { await onSave(name.trim(), document.trim(), phone.trim()); }
        finally { setSaving(false); }
    };

    const handleKey = (e) => {
        if (e.key === 'Enter') handleSave();
        if (e.key === 'Escape') onClose();
    };

    return (
        <div
            className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-150" />
            <div className="relative z-10 w-full sm:max-w-sm bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-2xl shadow-2xl animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200">

                <div className="sm:hidden flex justify-center pt-3 pb-1">
                    <div className="w-10 h-1 bg-slate-300 dark:bg-slate-700 rounded-full" />
                </div>

                <div className="flex items-center justify-between px-5 pt-3 pb-4 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 bg-emerald-100 dark:bg-emerald-900/40 rounded-xl flex items-center justify-center">
                            <UserPlus size={16} className="text-emerald-600 dark:text-emerald-400" />
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-slate-800 dark:text-white">Nuevo Cliente</h3>
                            <p className="text-xs text-slate-400">Se guardará en tu base de clientes</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                        <X size={16} />
                    </button>
                </div>

                <div className="px-5 py-4 space-y-3">
                    <div>
                        <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                            Nombre <span className="text-red-400">*</span>
                        </label>
                        <input ref={nameRef} type="text" placeholder="Ej: Juan Pérez" value={name}
                            onChange={e => setName(e.target.value)} onKeyDown={handleKey}
                            className="w-full text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 font-medium text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-400 transition-all placeholder:text-slate-400"
                        />
                    </div>
                    <div>
                        <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                            Cédula / RIF <span className="text-slate-400 normal-case font-medium">(opcional)</span>
                        </label>
                        <input type="text" placeholder="Ej: V-12345678" value={document}
                            onChange={e => setDocument(e.target.value.toUpperCase())} onKeyDown={handleKey}
                            className="w-full text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 font-medium text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-400 transition-all placeholder:text-slate-400 uppercase"
                        />
                    </div>
                    <div>
                        <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                            Teléfono <span className="text-slate-400 normal-case font-medium">(opcional)</span>
                        </label>
                        <div className="flex items-center bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-emerald-500/40 focus-within:border-emerald-400 transition-all">
                            <span className="px-3 py-3 text-xs font-black text-blue-500 border-r border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 select-none shrink-0">+58</span>
                            <input type="tel" placeholder="0412 123 4567" value={phone}
                                onChange={e => setPhone(e.target.value.replace(/^\+?58/, ''))} onKeyDown={handleKey}
                                className="flex-1 bg-transparent px-3 py-3 text-sm text-slate-800 dark:text-white outline-none placeholder:text-slate-400 font-medium"
                            />
                        </div>
                    </div>
                </div>

                <div className="px-5 pb-5 flex gap-2.5">
                    <button onClick={onClose}
                        className="flex-1 py-3 text-sm font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-95 transition-all">
                        Cancelar
                    </button>
                    <button onClick={handleSave} disabled={!name.trim() || saving}
                        className="flex-1 py-3 text-sm font-bold text-white bg-emerald-500 hover:bg-emerald-600 rounded-xl disabled:opacity-40 active:scale-95 transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20">
                        {saving ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <Check size={16} />}
                        {saving ? 'Guardando...' : 'Crear y Usar'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function CustomerPickerSection({
    customers,
    selectedCustomerId,
    setSelectedCustomerId,
    selectedCustomer,
    effectiveRate,
    remainingUsd,
    onUseSaldoFavor,
    triggerHaptic,
    onCreateCustomer,
    EPSILON,
}) {
    const [showPicker, setShowPicker] = useState(false);
    const [showNewModal, setShowNewModal] = useState(false);
    const [newModalInitialName, setNewModalInitialName] = useState('');

    const handleSelect = (id) => {
        setSelectedCustomerId(id);
        setShowPicker(false);
    };

    const handleOpenNew = (prefill = '') => {
        setNewModalInitialName(prefill);
        setShowNewModal(true);
    };

    const handleCreateSave = async (name, doc, phone) => {
        if (!onCreateCustomer) return;
        const newCustomer = await onCreateCustomer(name, doc, phone);
        setSelectedCustomerId(newCustomer.id);
        setShowNewModal(false);
    };

    const handleSaldoFavor = () => {
        triggerHaptic?.();
        onUseSaldoFavor?.();
    };

    return (
        <>
            <div className="px-3 py-2">
                {/* Trigger */}
                <button
                    onClick={() => setShowPicker(true)}
                    className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${
                        selectedCustomer
                            ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800'
                            : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                    }`}
                >
                    <div className="flex items-center gap-2.5">
                        {selectedCustomer ? (
                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-sm font-black ${avatarColor(selectedCustomer.name)[0]} ${avatarColor(selectedCustomer.name)[1]}`}>
                                {selectedCustomer.name.charAt(0).toUpperCase()}
                            </div>
                        ) : (
                            <div className="w-8 h-8 rounded-xl bg-slate-200 dark:bg-slate-800 flex items-center justify-center shrink-0">
                                <Users size={14} className="text-slate-400" />
                            </div>
                        )}
                        <div className="text-left">
                            <span className={`text-sm font-bold ${selectedCustomer ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-600 dark:text-slate-300'}`}>
                                {selectedCustomer ? selectedCustomer.name : 'Consumidor Final'}
                            </span>
                            {!!selectedCustomer?.deuda && Math.abs(selectedCustomer.deuda) > (EPSILON || 0.001) && (
                                <div className={`text-xs font-semibold ${selectedCustomer.deuda > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                                    {selectedCustomer.deuda > 0
                                        ? `Debe $${selectedCustomer.deuda.toFixed(2)}`
                                        : `Favor $${Math.abs(selectedCustomer.deuda).toFixed(2)}`}
                                </div>
                            )}
                        </div>
                    </div>
                    <ChevronDown size={16} className="text-slate-400" />
                </button>

                {/* Saldo a Favor */}
                {selectedCustomer?.deuda < -(EPSILON || 0.001) && remainingUsd >= (EPSILON || 0.001) && (
                    <div className="mt-2">
                        <button
                            onClick={handleSaldoFavor}
                            className="w-full py-2.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-900/50 font-bold text-sm rounded-xl transition-all flex items-center justify-center gap-2 active:scale-98"
                        >
                            <Wallet size={16} />
                            Usar Saldo a Favor (${Math.abs(selectedCustomer.deuda).toFixed(2)})
                            {effectiveRate > 0 && (
                                <span className="text-xs font-medium opacity-70">
                                    · {formatBs(Math.abs(selectedCustomer.deuda) * effectiveRate)} Bs
                                </span>
                            )}
                        </button>
                    </div>
                )}
            </div>

            {/* Bottom sheet selector */}
            {showPicker && (
                <CustomerPickerSheet
                    customers={customers}
                    selectedCustomerId={selectedCustomerId}
                    onSelect={handleSelect}
                    onClose={() => setShowPicker(false)}
                    onNewClient={handleOpenNew}
                    EPSILON={EPSILON}
                />
            )}

            {/* Bottom sheet nuevo cliente */}
            {showNewModal && (
                <NewClientModal
                    initialName={newModalInitialName}
                    onClose={() => setShowNewModal(false)}
                    onSave={handleCreateSave}
                />
            )}
        </>
    );
}
