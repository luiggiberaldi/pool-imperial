import { useState } from 'react';
import { X, Pencil, Trash2, RefreshCw, CreditCard, Clock, Phone, Save, User, CheckCircle2, ArrowUpRight, ShoppingBag, ChevronDown, ChevronUp, Layers } from 'lucide-react';
import { formatBs, formatUsd } from '../../utils/calculatorUtils';

// ─── CustomerDetailSheet ─────────────────────────────────────
export function CustomerDetailSheet({ customer, isOpen, isAdmin, onClose, onAjustar, onReset, onEdit, onDelete, bcvRate, tasaCop, copEnabled, sales }) {
    const [expandedSaleId, setExpandedSaleId] = useState(null);
    if (!isOpen || !customer) return null;

    const createdDate = customer.createdAt
        ? new Date(customer.createdAt).toLocaleDateString('es-VE', { month: 'long', year: 'numeric' })
        : null;

    return (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
            <div
                className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white dark:bg-slate-900 rounded-t-3xl max-h-[85vh] overflow-y-auto animate-in slide-in-from-bottom duration-300 shadow-2xl"
                onClick={e => e.stopPropagation()}
            >
                {/* Close + Drag Handle */}
                <div className="flex items-center justify-between px-4 pt-3 pb-2">
                    <div className="w-8" />
                    <div className="w-8 h-1 bg-slate-300 dark:bg-slate-700 rounded-full" />
                    <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
                        <X size={18} />
                    </button>
                </div>

                <div className="px-5 pb-6 space-y-5">
                    {/* Header */}
                    <div className="flex items-center gap-4">
                        <div className="w-14 h-14 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                            <span className="text-2xl font-black text-blue-600 dark:text-blue-400">
                                {customer.name.charAt(0).toUpperCase()}
                            </span>
                        </div>
                        <div>
                            <h3 className="text-lg font-black text-slate-800 dark:text-white">{customer.name}</h3>
                            <div className="flex items-center gap-2 mt-0.5">
                                {customer.documentId && (
                                    <p className="text-xs font-bold text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                                        {customer.documentId}
                                    </p>
                                )}
                                {customer.phone && (
                                    <p className="text-xs text-slate-400 flex items-center gap-1">
                                        <Phone size={12} /> {customer.phone}
                                    </p>
                                )}
                            </div>
                            {createdDate && (
                                <p className="text-[10px] text-slate-400 mt-1">Cliente desde {createdDate}</p>
                            )}
                        </div>
                    </div>

                    {/* Saldo */}
                    <div className="flex gap-2">
                        {customer.deuda > 0 ? (
                            <div className="flex-1 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30 rounded-xl px-3 py-2.5 text-center">
                                <p className="text-[10px] font-bold text-red-400 uppercase">Debe</p>
                                <p className="text-lg font-black text-red-500">-${formatUsd(customer.deuda)}</p>
                                {bcvRate > 0 && <p className="text-[10px] font-bold text-red-400/70">-{formatBs(customer.deuda * bcvRate)} Bs</p>}
                                {copEnabled && tasaCop > 0 && <p className="text-[10px] font-bold text-red-500/90">-{(customer.deuda * tasaCop).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} COP</p>}
                            </div>
                        ) : customer.favor > 0 ? (
                            <div className="flex-1 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/30 rounded-xl px-3 py-2.5 text-center">
                                <p className="text-[10px] font-bold text-emerald-400 uppercase">A favor</p>
                                <p className="text-lg font-black text-emerald-500">+${formatUsd(customer.favor)}</p>
                                {bcvRate > 0 && <p className="text-[10px] font-bold text-emerald-400/70">+{formatBs(customer.favor * bcvRate)} Bs</p>}
                                {copEnabled && tasaCop > 0 && <p className="text-[10px] font-bold text-emerald-500/90">+{(customer.favor * tasaCop).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} COP</p>}
                            </div>
                        ) : (
                            <div className="flex-1 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-center">
                                <p className="text-sm font-black text-slate-400 flex items-center justify-center gap-1">
                                    <CheckCircle2 size={14} className="text-emerald-400" /> Al día
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Acciones */}
                    <div className="grid grid-cols-2 gap-2">
                        <button
                            onClick={onAjustar}
                            className="flex flex-col items-center gap-1.5 py-3 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-xl text-xs font-bold hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors active:scale-95 col-span-1"
                        >
                            <CreditCard size={18} />
                            <span>Ajustar Cuenta</span>
                        </button>
                        {(customer.deuda !== 0 || customer.favor !== 0) && isAdmin && (
                            <button
                                onClick={onReset}
                                className="flex flex-col items-center gap-1.5 py-3 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-xl text-xs font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors active:scale-95"
                            >
                                <RefreshCw size={18} />
                                <span>Poner en 0</span>
                            </button>
                        )}
                    </div>

                    {/* Historial */}
                    <div>
                        <h4 className="text-xs font-black text-slate-400 uppercase tracking-wider flex items-center gap-1.5 mb-3">
                            <Clock size={12} /> Historial de Compras
                        </h4>
                        {(!sales || sales.length === 0) ? (
                            <p className="text-xs text-slate-400 text-center py-6">Sin registros aún</p>
                        ) : (
                            <div className="space-y-2">
                                {sales.slice(0, 20).map(sale => {
                                    const date = new Date(sale.timestamp);
                                    const dateStr = date.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: '2-digit' });
                                    const timeStr = date.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', hour12: false });
                                    const isCobro = sale.tipo === 'COBRO_DEUDA';
                                    const isFiada = sale.tipo === 'VENTA_FIADA';
                                    const isAnulada = sale.status === 'ANULADA';
                                    const isExpanded = expandedSaleId === sale.id;
                                    const hasItems = sale.items && sale.items.length > 0;
                                    return (
                                        <div key={sale.id} className={`bg-slate-50 dark:bg-slate-950 rounded-xl overflow-hidden ${isAnulada ? 'opacity-50 grayscale' : ''}`}>
                                            <div
                                                className="flex items-start gap-2.5 py-2 px-2 cursor-pointer active:bg-slate-100 dark:active:bg-slate-800/50 transition-colors"
                                                onClick={() => hasItems && setExpandedSaleId(isExpanded ? null : sale.id)}
                                            >
                                                <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${isAnulada ? 'bg-slate-200 dark:bg-slate-800' : isCobro ? 'bg-emerald-100 dark:bg-emerald-900/30' : isFiada ? 'bg-amber-100 dark:bg-amber-900/30' : 'bg-blue-100 dark:bg-blue-900/30'}`}>
                                                    {isCobro ? <ArrowUpRight size={14} className={isAnulada ? "text-slate-500" : "text-emerald-500"} /> : isFiada ? <CreditCard size={14} className={isAnulada ? "text-slate-500" : "text-amber-500"} /> : <ShoppingBag size={14} className={isAnulada ? "text-slate-500" : "text-blue-500"} />}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex justify-between items-start">
                                                        <div className="flex flex-col">
                                                            <p className={`text-xs font-bold ${isAnulada ? 'text-slate-500 line-through' : 'text-slate-700 dark:text-slate-200'}`}>
                                                                {isCobro ? 'Abono de deuda' : isFiada ? 'Venta fiada' : 'Venta'}
                                                            </p>
                                                            <div className="flex items-center gap-1.5 mt-0.5">
                                                                {isAnulada && <span className="text-[9px] font-black text-red-500 tracking-wider">ANULADA</span>}
                                                                {sale.tableName && (
                                                                    <span className="text-[9px] font-bold text-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                                                                        <Layers size={8} /> {sale.tableName}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <div className="text-right flex items-center gap-1.5">
                                                            <div>
                                                                <p className={`text-xs font-black ${isAnulada ? 'text-slate-400 line-through' : isCobro ? 'text-emerald-500' : isFiada ? 'text-amber-500' : 'text-slate-700 dark:text-white'}`}>
                                                                    {isCobro ? '+' : ''}${formatUsd(sale.totalUsd || 0)}
                                                                </p>
                                                                {bcvRate > 0 && !isAnulada && (
                                                                    <p className={`text-[9px] font-bold ${isCobro ? 'text-emerald-400/70' : isFiada ? 'text-amber-400/70' : 'text-slate-400'}`}>
                                                                        {isCobro ? '+' : ''}{formatBs((sale.totalUsd || 0) * bcvRate)} Bs
                                                                    </p>
                                                                )}
                                                            </div>
                                                            {hasItems && (
                                                                isExpanded
                                                                    ? <ChevronUp size={14} className="text-slate-400 shrink-0" />
                                                                    : <ChevronDown size={14} className="text-slate-400 shrink-0" />
                                                            )}
                                                        </div>
                                                    </div>
                                                    {!isExpanded && hasItems && (
                                                        <p className="text-[10px] text-slate-400 truncate mt-0.5">
                                                            {sale.items.map(i => `${i.qty}x ${i.name}`).join(', ')}
                                                        </p>
                                                    )}
                                                    {sale.fiadoUsd > 0 && (
                                                        <p className="text-[10px] text-amber-500 font-bold mt-0.5">Deuda: ${formatUsd(sale.fiadoUsd)}</p>
                                                    )}
                                                    <p className="text-[9px] text-slate-400 mt-0.5">{dateStr} • {timeStr}{sale.saleNumber ? ` • #${String(sale.saleNumber).padStart(4, '0')}` : ''}</p>
                                                </div>
                                            </div>
                                            {/* Expanded items detail */}
                                            {isExpanded && hasItems && (
                                                <div className="px-3 pb-2.5 pt-0.5 border-t border-slate-100 dark:border-slate-800/50 animate-in fade-in slide-in-from-top-1 duration-150">
                                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1.5 mt-1.5">Artículos</p>
                                                    <div className="space-y-1">
                                                        {sale.items.map((item, idx) => (
                                                            <div key={idx} className="flex justify-between items-center">
                                                                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                                                    <span className="text-[10px] font-black text-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 w-5 h-5 rounded flex items-center justify-center shrink-0">
                                                                        {item.isWeight ? item.qty.toFixed(1) : item.qty}
                                                                    </span>
                                                                    <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 truncate">{item.name}</span>
                                                                </div>
                                                                <span className="text-[11px] font-black text-slate-500 dark:text-slate-400 shrink-0 ml-2">
                                                                    ${formatUsd(item.priceUsd * item.qty)}
                                                                </span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                    {sale.discountAmountUsd > 0 && (
                                                        <div className="flex justify-between items-center mt-1.5 pt-1 border-t border-dashed border-slate-200 dark:border-slate-800">
                                                            <span className="text-[10px] font-bold text-orange-500">Descuento</span>
                                                            <span className="text-[10px] font-black text-orange-500">-${formatUsd(sale.discountAmountUsd)}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Editar / Eliminar */}
                    <div className="flex gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                        <button
                            onClick={onEdit}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors active:scale-95"
                        >
                            <Pencil size={14} /> Editar
                        </button>
                        {isAdmin && (
                            <button
                                onClick={onDelete}
                                className="flex items-center justify-center gap-1.5 py-2.5 px-4 bg-red-50 dark:bg-red-900/20 text-red-500 rounded-xl text-xs font-bold hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors active:scale-95"
                            >
                                <Trash2 size={14} />
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── EditCustomerModal ────────────────────────────────────────
export function EditCustomerModal({ customer, onClose, onSave }) {
    const [name, setName] = useState(customer.name);
    const [documentId, setDocumentId] = useState(customer.documentId || '');
    const [phone, setPhone] = useState(customer.phone || '');

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!name.trim()) return;
        onSave({ ...customer, name: name.trim(), documentId: documentId.trim(), phone: phone.trim() });
    };

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-t-3xl sm:rounded-3xl shadow-xl overflow-hidden animate-in slide-in-from-bottom-10 sm:zoom-in-95 duration-200">
                <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
                    <h3 className="text-xl font-black text-slate-800 dark:text-white flex items-center gap-2">
                        <Pencil size={20} className="text-blue-500" /> Editar Cliente
                    </h3>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors">
                        <X size={20} />
                    </button>
                </div>
                <form onSubmit={handleSubmit} className="p-5 space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Nombre *</label>
                        <input type="text" required value={name} onChange={(e) => setName(e.target.value)}
                            className="w-full form-input bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-slate-800 dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500/50 transition-all font-medium"
                            autoFocus />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Cédula / RIF (Opcional)</label>
                        <input type="text" value={documentId} onChange={(e) => setDocumentId(e.target.value.toUpperCase())}
                            placeholder="V-12345678"
                            className="w-full form-input bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-slate-800 dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500/50 transition-all font-medium uppercase" />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Teléfono</label>
                        <div className="w-full flex items-center bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus-within:ring-2 focus-within:ring-blue-500/50 transition-all overflow-hidden">
                            <span className="px-3 py-3 text-sm font-black text-blue-500 border-r border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 shrink-0 select-none">+58</span>
                            <input type="tel" placeholder="0412 1234567" value={phone}
                                onChange={(e) => setPhone(e.target.value.replace(/^\+?58/, ''))}
                                className="flex-1 bg-transparent px-3 py-3 text-slate-800 dark:text-white outline-none text-sm font-medium placeholder:text-slate-400" />
                        </div>
                        <p className="text-[9px] text-slate-400 mt-1 ml-1">Venezuela · Ej: 0412 1234567</p>
                    </div>
                    <button type="submit" disabled={!name.trim()}
                        className="w-full py-3.5 bg-blue-500 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white font-bold rounded-xl active:scale-95 transition-all mt-4 flex justify-center items-center gap-2">
                        <Save size={18} /> Guardar Cambios
                    </button>
                </form>
            </div>
        </div>
    );
}

// ─── AddCustomerModal ─────────────────────────────────────────
export function AddCustomerModal({ onClose, onSave }) {
    const [name, setName] = useState('');
    const [documentId, setDocumentId] = useState('');
    const [phone, setPhone] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!name.trim()) return;
        onSave({
            id: crypto.randomUUID(),
            name: name.trim(),
            documentId: documentId.trim(),
            phone: phone.trim(),
            deuda: 0,
            favor: 0,
            createdAt: new Date().toISOString()
        });
    };

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-t-3xl sm:rounded-3xl shadow-xl overflow-hidden animate-in slide-in-from-bottom-10 sm:zoom-in-95 duration-200">
                <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
                    <h3 className="text-xl font-black text-slate-800 dark:text-white flex items-center gap-2">
                        <User size={22} className="text-blue-500" /> Nuevo Cliente
                    </h3>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors">
                        <X size={20} />
                    </button>
                </div>
                <form onSubmit={handleSubmit} className="p-5 space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Nombre del Cliente *</label>
                        <input type="text" required value={name} onChange={(e) => setName(e.target.value)}
                            placeholder="Ej. María Pérez"
                            className="w-full form-input bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-slate-800 dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500/50 transition-all font-medium"
                            autoFocus />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Cédula / RIF (Opcional)</label>
                        <input type="text" value={documentId} onChange={(e) => setDocumentId(e.target.value.toUpperCase())}
                            placeholder="V-12345678"
                            className="w-full form-input bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-slate-800 dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500/50 transition-all font-medium uppercase" />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Teléfono (opcional)</label>
                        <div className="w-full flex items-center bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus-within:ring-2 focus-within:ring-blue-500/50 transition-all overflow-hidden">
                            <span className="px-3 py-3 text-sm font-black text-blue-500 border-r border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 shrink-0 select-none">+58</span>
                            <input type="tel" placeholder="0412 1234567" value={phone}
                                onChange={(e) => setPhone(e.target.value.replace(/^\+?58/, ''))}
                                className="flex-1 bg-transparent px-3 py-3 text-slate-800 dark:text-white outline-none text-sm font-medium placeholder:text-slate-400" />
                        </div>
                        <p className="text-[9px] text-slate-400 mt-1 ml-1">Venezuela · Ej: 0412 1234567</p>
                    </div>
                    <button type="submit" disabled={!name.trim()}
                        className="w-full py-3.5 bg-blue-500 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white font-bold rounded-xl active:scale-95 transition-all mt-4 flex justify-center items-center gap-2">
                        <Save size={18} /> Guardar Cliente
                    </button>
                </form>
            </div>
        </div>
    );
}
