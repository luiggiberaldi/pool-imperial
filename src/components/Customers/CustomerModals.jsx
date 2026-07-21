import { useState } from 'react';
import { X, Pencil, Trash2, RefreshCw, CreditCard, Clock, Phone, Save, User, CheckCircle2, ArrowUpRight, ShoppingBag, ChevronDown, ChevronUp, Layers } from 'lucide-react';
import { getPaymentLabel, toTitleCase } from '../../config/paymentMethods';

const formatCOP = (val) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(Math.round(val || 0));

// ─── CustomerDetailSheet ─────────────────────────────────────
export function CustomerDetailSheet({ customer, isOpen, isAdmin, onClose, onAjustar, onReset, onEdit, onDelete, sales }) {
    const [expandedSaleId, setExpandedSaleId] = useState(null);
    if (!isOpen || !customer) return null;

    const createdDate = customer.createdAt
        ? new Date(customer.createdAt).toLocaleDateString('es-CO', { month: 'long', year: 'numeric' })
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
                    {/* Tarjeta Cliente */}
                    <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 text-center relative">
                        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 text-white flex items-center justify-center font-black text-2xl mx-auto shadow-md shadow-amber-500/20 mb-3">
                            {customer.name.charAt(0).toUpperCase()}
                        </div>
                        <h3 className="text-lg font-black text-slate-800 dark:text-white leading-tight">{customer.name}</h3>
                        {customer.phone && (
                            <p className="text-xs text-slate-400 flex items-center justify-center gap-1 mt-1 font-medium">
                                <Phone size={12} /> {customer.phone}
                            </p>
                        )}
                        {createdDate && (
                            <p className="text-[10px] text-slate-400 mt-0.5">Cliente desde {createdDate}</p>
                        )}

                        {/* Deuda Total Badge */}
                        <div className="mt-4 pt-3 border-t border-slate-200/60 dark:border-slate-800 flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-500">Saldo Pendiente:</span>
                            {(customer.debtUsd || 0) > 0 ? (
                                <span className="text-base font-black text-red-500 font-mono">
                                    {formatCOP(customer.debtUsd)}
                                </span>
                            ) : (
                                <span className="text-xs font-bold text-emerald-500 bg-emerald-50 dark:bg-emerald-900/30 px-2.5 py-1 rounded-full flex items-center gap-1">
                                    <CheckCircle2 size={12} /> Al día
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Botones de Acción */}
                    <div className="grid grid-cols-1 gap-2">
                        <button
                            onClick={onAjustar}
                            className="w-full py-3 px-4 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white rounded-2xl font-bold text-xs shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 transition-all active:scale-95"
                        >
                            <CreditCard size={16} /> Ajustar Cuenta
                        </button>
                    </div>

                    {/* Historial de Compras */}
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
                                    const dateStr = date.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: '2-digit' });
                                    const timeStr = date.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false });
                                    const isCobro = sale.tipo === 'COBRO_DEUDA';
                                    const isFiada = sale.tipo === 'VENTA_FIADA';
                                    const isAnulada = sale.status === 'ANULADA';
                                    const isExpanded = expandedSaleId === sale.id;
                                    const hasItems = sale.items && sale.items.length > 0;

                                    const validPayments = (sale.payments && sale.payments.length > 0)
                                        ? sale.payments.filter(p => !p.isAbonoPrevio)
                                        : (sale.paymentMethod || sale.tipo === 'COBRO_DEUDA' || sale.tipo === 'VENTA_FIADA'
                                            ? [{
                                                methodId: sale.paymentMethod || (sale.tipo === 'VENTA_FIADA' ? 'fiado' : 'efectivo'),
                                                methodLabel: sale.paymentMethod ? getPaymentLabel(sale.paymentMethod) : (sale.tipo === 'VENTA_FIADA' ? 'Fiado' : 'Efectivo'),
                                                amountUsd: sale.totalUsd || sale.totalCop || 0
                                              }]
                                            : []);
                                    const canExpand = hasItems || validPayments.length > 0;

                                    return (
                                        <div key={sale.id} className={`bg-slate-50 dark:bg-slate-950 rounded-xl overflow-hidden ${isAnulada ? 'opacity-50 grayscale' : ''}`}>
                                            <div
                                                className="flex items-start gap-2.5 py-2 px-2 cursor-pointer active:bg-slate-100 dark:active:bg-slate-800/50 transition-colors"
                                                onClick={() => canExpand && setExpandedSaleId(isExpanded ? null : sale.id)}
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
                                                                    {isCobro ? '+' : ''}{formatCOP(sale.totalUsd || 0)}
                                                                </p>
                                                            </div>
                                                            {canExpand && (
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
                                                        <p className="text-[10px] text-amber-500 font-bold mt-0.5">Deuda: {formatCOP(sale.fiadoUsd)}</p>
                                                    )}
                                                    <p className="text-[9px] text-slate-400 mt-0.5">{dateStr} • {timeStr}{sale.saleNumber ? ` • #${String(sale.saleNumber).padStart(4, '0')}` : ''}</p>
                                                </div>
                                            </div>
                                            {/* Expanded items & payments detail */}
                                            {isExpanded && canExpand && (
                                                <div className="px-3 pb-2.5 pt-0.5 border-t border-slate-100 dark:border-slate-800/50 animate-in fade-in slide-in-from-top-1 duration-150">
                                                    {hasItems && (
                                                        <>
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
                                                                            {formatCOP(item.priceUsd * item.qty)}
                                                                        </span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </>
                                                    )}
                                                    {sale.discountAmountUsd > 0 && (
                                                        <div className="flex justify-between items-center mt-1.5 pt-1 border-t border-dashed border-slate-200 dark:border-slate-800">
                                                            <span className="text-[10px] font-bold text-orange-500">Descuento</span>
                                                            <span className="text-[10px] font-black text-orange-500">-${formatCOP(sale.discountAmountUsd)}</span>
                                                        </div>
                                                    )}
                                                    {/* Desglose de Pagos Recibidos */}
                                                    {validPayments.length > 0 && (
                                                        <div className="mt-2 pt-2 border-t border-dashed border-slate-200 dark:border-slate-800">
                                                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1.5">Pagos Recibidos</p>
                                                            <div className="space-y-1">
                                                                {validPayments.map((p, pIdx) => {
                                                                    const label = toTitleCase(p.methodLabel || getPaymentLabel(p.methodId) || 'Efectivo');
                                                                    const amt = p.amountUsd !== undefined ? p.amountUsd : (p.amount || 0);
                                                                    return (
                                                                        <div key={pIdx} className="flex justify-between items-center text-[11px]">
                                                                            <span className="font-bold text-slate-600 dark:text-slate-300 flex items-center gap-1">
                                                                                <CreditCard size={11} className="text-emerald-500 shrink-0" />
                                                                                <span>{label}</span>
                                                                                {p.reference && (
                                                                                    <span className="text-[9px] font-mono text-slate-400">Ref: {p.reference}</span>
                                                                                )}
                                                                            </span>
                                                                            <span className="font-black text-slate-700 dark:text-slate-200">
                                                                                {formatCOP(amt)}
                                                                            </span>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
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
                        <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Cédula / NIT (Opcional)</label>
                        <input type="text" value={documentId} onChange={(e) => setDocumentId(e.target.value.toUpperCase())}
                            placeholder="123456789"
                            className="w-full form-input bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-slate-800 dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500/50 transition-all font-medium uppercase" />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Teléfono</label>
                        <div className="w-full flex items-center bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus-within:ring-2 focus-within:ring-blue-500/50 transition-all overflow-hidden">
                            <span className="px-3 py-3 text-sm font-black text-blue-500 border-r border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 shrink-0 select-none">+57</span>
                            <input type="tel" placeholder="300 1234567" value={phone}
                                onChange={(e) => setPhone(e.target.value.replace(/^\+?57/, ''))}
                                className="flex-1 bg-transparent px-3 py-3 text-slate-800 dark:text-white outline-none text-sm font-medium placeholder:text-slate-400" />
                        </div>
                        <p className="text-[9px] text-slate-400 mt-1 ml-1">Colombia · Ej: 300 1234567</p>
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
                        <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Cédula / NIT (Opcional)</label>
                        <input type="text" value={documentId} onChange={(e) => setDocumentId(e.target.value.toUpperCase())}
                            placeholder="123456789"
                            className="w-full form-input bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-slate-800 dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500/50 transition-all font-medium uppercase" />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Teléfono (opcional)</label>
                        <div className="w-full flex items-center bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus-within:ring-2 focus-within:ring-blue-500/50 transition-all overflow-hidden">
                            <span className="px-3 py-3 text-sm font-black text-blue-500 border-r border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 shrink-0 select-none">+57</span>
                            <input type="tel" placeholder="300 1234567" value={phone}
                                onChange={(e) => setPhone(e.target.value.replace(/^\+?57/, ''))}
                                className="flex-1 bg-transparent px-3 py-3 text-slate-800 dark:text-white outline-none text-sm font-medium placeholder:text-slate-400" />
                        </div>
                        <p className="text-[9px] text-slate-400 mt-1 ml-1">Colombia · Ej: 300 1234567</p>
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
