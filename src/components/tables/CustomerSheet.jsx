import React, { useState, useEffect, useRef } from 'react';
import { X, Search, Users, UserPlus, Check, CreditCard, Phone } from 'lucide-react';
import { showToast } from '../Toast';

export function CustomerSheet({ customers, selectedId, onSelect, onClose, onCreateCustomer }) {
    const [search, setSearch] = useState('');
    const [showCreate, setShowCreate] = useState(false);
    const [newName, setNewName] = useState('');
    const [newPhone, setNewPhone] = useState('');
    const [newDoc, setNewDoc] = useState('');
    const [saving, setSaving] = useState(false);
    const searchRef = useRef(null);
    const nameRef = useRef(null);

    useEffect(() => {
        if (showCreate) setTimeout(() => nameRef.current?.focus(), 80);
        else setTimeout(() => searchRef.current?.focus(), 80);
    }, [showCreate]);

    const q = search.toLowerCase().trim();
    const filtered = q
        ? customers.filter(c =>
            (c.name || '').toLowerCase().includes(q) ||
            (c.phone && c.phone.replace(/\D/g, '').includes(q.replace(/\D/g, ''))) ||
            (c.documentId && c.documentId.toLowerCase().includes(q))
          )
        : [...customers].sort((a, b) => {
            if (a.id === selectedId) return -1;
            if (b.id === selectedId) return 1;
            return (a.name || '').localeCompare(b.name || '', 'es');
          });

    const handleCreate = async () => {
        if (!newName.trim() || saving) return;
        setSaving(true);
        try {
            const created = await onCreateCustomer(newName.trim(), newPhone.trim(), newDoc.trim());
            onSelect(created.id);
            onClose();
        } catch { showToast('Error al crear cliente', 'error'); }
        finally { setSaving(false); }
    };

    return (
        <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center" onClick={e => e.target === e.currentTarget && onClose()}>
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in duration-150" onClick={onClose} />
            <div className="relative z-10 w-full sm:max-w-sm bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-2xl shadow-2xl max-h-[85vh] sm:max-h-[75vh] flex flex-col animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200">

                {/* Handle (móvil) */}
                <div className="sm:hidden flex justify-center pt-3 pb-1 shrink-0">
                    <div className="w-10 h-1 bg-slate-200 dark:bg-slate-700 rounded-full" />
                </div>

                {/* Header */}
                <div className="flex items-center justify-between px-5 pt-3 pb-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
                    <div>
                        <h3 className="text-base font-black text-slate-800 dark:text-white">
                            {showCreate ? 'Nuevo Cliente' : 'Seleccionar Cliente'}
                        </h3>
                        {!showCreate && <p className="text-xs text-slate-400 mt-0.5">{customers.length} clientes registrados</p>}
                    </div>
                    <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                        <X size={16} />
                    </button>
                </div>

                {showCreate ? (
                    /* ── Formulario crear cliente ── */
                    <div className="flex flex-col flex-1 overflow-y-auto">
                        <div className="px-5 py-4 space-y-3">
                            <div>
                                <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                                    Nombre <span className="text-red-400">*</span>
                                </label>
                                <input
                                    ref={nameRef}
                                    type="text"
                                    placeholder="Ej: Juan Pérez"
                                    value={newName}
                                    onChange={e => setNewName(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleCreate()}
                                    className="w-full text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 font-medium text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-sky-500/40 focus:border-sky-400 transition-all placeholder:text-slate-400"
                                />
                            </div>
                            <div>
                                <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                                    Cédula / RIF <span className="text-slate-400 normal-case font-medium">(opcional)</span>
                                </label>
                                <input
                                    type="text"
                                    placeholder="Ej: V-12345678"
                                    value={newDoc}
                                    onChange={e => setNewDoc(e.target.value.toUpperCase())}
                                    onKeyDown={e => e.key === 'Enter' && handleCreate()}
                                    className="w-full text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 font-medium text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-sky-500/40 focus:border-sky-400 transition-all uppercase"
                                />
                            </div>
                            <div>
                                <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                                    Teléfono <span className="text-slate-400 normal-case font-medium">(opcional)</span>
                                </label>
                                <div className="flex items-center bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-sky-500/40 focus-within:border-sky-400 transition-all">
                                    <span className="px-3 py-3 text-xs font-black text-blue-500 border-r border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 select-none shrink-0">+58</span>
                                    <input
                                        type="tel"
                                        placeholder="0412 123 4567"
                                        value={newPhone}
                                        onChange={e => setNewPhone(e.target.value.replace(/^\+?58/, ''))}
                                        onKeyDown={e => e.key === 'Enter' && handleCreate()}
                                        className="flex-1 bg-transparent px-3 py-3 text-sm text-slate-800 dark:text-white outline-none placeholder:text-slate-400 font-medium"
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="px-5 pb-6 flex gap-2.5 shrink-0">
                            <button
                                onClick={() => { setShowCreate(false); setNewName(''); setNewDoc(''); setNewPhone(''); }}
                                className="flex-1 py-3 text-sm font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-xl hover:bg-slate-200 active:scale-95 transition-all"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleCreate}
                                disabled={!newName.trim() || saving}
                                className="flex-1 py-3 text-sm font-bold text-white bg-sky-500 hover:bg-sky-600 rounded-xl disabled:opacity-40 active:scale-95 transition-all flex items-center justify-center gap-2 shadow-lg shadow-sky-500/20"
                            >
                                {saving ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <Check size={16} />}
                                {saving ? 'Guardando...' : 'Crear y Usar'}
                            </button>
                        </div>
                    </div>
                ) : (
                    /* ── Lista de clientes ── */
                    <>
                        {/* Buscador */}
                        <div className="px-4 py-3 shrink-0">
                            <div className="flex items-center gap-2.5 px-4 py-3 bg-slate-100 dark:bg-slate-800 rounded-2xl">
                                <Search size={15} className="text-slate-400 shrink-0" />
                                <input
                                    ref={searchRef}
                                    type="text"
                                    placeholder="Buscar por nombre, cédula o teléfono..."
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    className="flex-1 bg-transparent text-sm text-slate-800 dark:text-slate-100 outline-none placeholder:text-slate-400 font-medium"
                                />
                                {search && (
                                    <button onClick={() => setSearch('')} className="w-5 h-5 bg-slate-300 dark:bg-slate-600 rounded-full flex items-center justify-center">
                                        <X size={10} className="text-slate-600 dark:text-slate-200" />
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="overflow-y-auto flex-1 pb-safe">
                            {/* Sin cliente */}
                            {!q && (
                                <button
                                    onClick={() => { onSelect(null); onClose(); }}
                                    className={`w-full flex items-center gap-3 px-5 py-3.5 transition-colors ${!selectedId ? 'bg-sky-50 dark:bg-sky-900/20' : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'}`}
                                >
                                    <div className="w-10 h-10 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                                        <Users size={18} className="text-slate-400" />
                                    </div>
                                    <div className="flex-1 text-left">
                                        <span className={`text-sm font-bold ${!selectedId ? 'text-sky-700 dark:text-sky-400' : 'text-slate-700 dark:text-slate-300'}`}>Sin cliente asignado</span>
                                        <p className="text-xs text-slate-400 mt-0.5">Mesa sin nombre de cliente</p>
                                    </div>
                                    {!selectedId && <Check size={16} className="text-sky-500 shrink-0" />}
                                </button>
                            )}

                            {/* Nuevo cliente */}
                            <button
                                onClick={() => setShowCreate(true)}
                                className="w-full flex items-center gap-3 px-5 py-3.5 border-t border-slate-100 dark:border-slate-800 hover:bg-sky-50 dark:hover:bg-sky-900/20 transition-colors"
                            >
                                <div className="w-10 h-10 rounded-2xl bg-sky-100 dark:bg-sky-900/40 flex items-center justify-center shrink-0">
                                    <UserPlus size={18} className="text-sky-600 dark:text-sky-400" />
                                </div>
                                <div className="flex-1 text-left">
                                    <span className="text-sm font-bold text-sky-600 dark:text-sky-400">
                                        {q ? `Crear "${search}"` : 'Nuevo cliente...'}
                                    </span>
                                    <p className="text-xs text-slate-400 mt-0.5">Agregar a la base de clientes</p>
                                </div>
                            </button>

                            {/* Separador */}
                            {filtered.length > 0 && (
                                <div className="px-5 py-2 border-t border-slate-100 dark:border-slate-800">
                                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                                        {q ? `${filtered.length} resultado${filtered.length !== 1 ? 's' : ''}` : 'Clientes'}
                                    </span>
                                </div>
                            )}

                            {/* Lista */}
                            {filtered.map(c => {
                                const isSelected = selectedId === c.id;
                                return (
                                    <button
                                        key={c.id}
                                        onClick={() => { onSelect(c.id); onClose(); }}
                                        className={`w-full flex items-center gap-3 px-5 py-3 transition-colors border-t border-slate-50 dark:border-slate-800/60 ${isSelected ? 'bg-sky-50 dark:bg-sky-900/20' : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'}`}
                                    >
                                        <div className="w-10 h-10 rounded-2xl bg-sky-100 dark:bg-sky-900/40 flex items-center justify-center shrink-0 text-base font-black text-sky-600 dark:text-sky-400">
                                            {(c.name || '?').charAt(0).toUpperCase()}
                                        </div>
                                        <div className="min-w-0 flex-1 text-left">
                                            <p className={`text-sm font-semibold truncate ${isSelected ? 'text-sky-700 dark:text-sky-300 font-bold' : 'text-slate-800 dark:text-slate-200'}`}>
                                                {c.name}
                                            </p>
                                            <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                                                {c.documentId && (
                                                    <span className="text-[11px] text-slate-400 flex items-center gap-1">
                                                        <CreditCard size={10} className="shrink-0" />{c.documentId}
                                                    </span>
                                                )}
                                                {c.phone && (
                                                    <span className="text-[11px] text-slate-400 flex items-center gap-1">
                                                        <Phone size={10} className="shrink-0" />{c.phone}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        {isSelected && <Check size={15} className="text-sky-500 shrink-0" />}
                                    </button>
                                );
                            })}

                            {q && filtered.length === 0 && (
                                <div className="px-5 py-10 text-center border-t border-slate-100 dark:border-slate-800">
                                    <p className="text-sm font-semibold text-slate-500">Sin resultados para "{search}"</p>
                                    <button onClick={() => setShowCreate(true)} className="mt-3 text-sm font-bold text-sky-600 dark:text-sky-400 underline">
                                        Crear "{search}" como nuevo cliente
                                    </button>
                                </div>
                            )}
                            <div className="h-4" />
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
