import React from 'react';
import { Trash2, UserPlus, Phone, Send, Recycle } from 'lucide-react';
import { showToast } from '../Toast';
import { supabaseCloud } from '../../config/supabaseCloud';
import { storageService } from '../../utils/storageService';

const SALES_KEY = 'bodega_sales_v1';

export function TicketClientModal({
    ticketPendingSale, setTicketPendingSale,
    ticketClientName, setTicketClientName,
    ticketClientPhone, setTicketClientPhone,
    ticketClientDocument, setTicketClientDocument,
    onRegisterClient,
}) {
    if (!ticketPendingSale) return null;

    const clearAndClose = () => {
        setTicketPendingSale(null);
        setTicketClientName('');
        setTicketClientPhone('');
        setTicketClientDocument('');
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={clearAndClose}>
            <div className="bg-white w-full max-w-sm md:max-w-md rounded-[24px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-100" onClick={(e) => e.stopPropagation()}>
                <div className="p-6">
                    <div className="flex justify-center mb-4"><div className="w-16 h-16 bg-[#0EA5E9]/10 text-[#0EA5E9] rounded-full flex items-center justify-center"><UserPlus size={28} /></div></div>
                    <h3 className="text-lg font-black text-center text-slate-800 mb-1">Registrar Cliente</h3>
                    <p className="text-xs text-center text-slate-500 mb-5">Para enviar el ticket, registra los datos del cliente.</p>
                    <div className="space-y-3">
                        <div>
                            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Nombre del Cliente *</label>
                            <input type="text" value={ticketClientName} onChange={(e) => setTicketClientName(e.target.value)} placeholder="Ej: María García" autoFocus className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium text-slate-800 outline-none focus:ring-2 focus:ring-brand/50 focus:border-brand transition-all" />
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Cédula / RIF (Opcional)</label>
                            <input type="text" value={ticketClientDocument} onChange={(e) => setTicketClientDocument(e.target.value.toUpperCase())} placeholder="Ej: V-12345678" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium text-slate-800 outline-none focus:ring-2 focus:ring-brand/50 transition-all uppercase" />
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5 flex items-center gap-1"><Phone size={10} /> Teléfono / WhatsApp</label>
                            <input type="tel" value={ticketClientPhone} onChange={(e) => setTicketClientPhone(e.target.value)} placeholder="Ej: 0414-1234567" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium text-slate-800 outline-none focus:ring-2 focus:ring-brand/50 transition-all" />
                        </div>
                    </div>
                </div>
                <div className="p-4 border-t border-slate-100 bg-slate-50 flex gap-3">
                    <button onClick={clearAndClose} className="flex-1 py-3 bg-white border-2 border-slate-200 text-slate-700 font-bold rounded-xl active:scale-[0.98] transition-all">Cancelar</button>
                    <button onClick={onRegisterClient} disabled={!ticketClientName.trim()} className="flex-1 py-3 bg-brand disabled:bg-slate-300 text-white font-bold rounded-xl active:scale-[0.98] transition-all flex justify-center items-center gap-2 shadow-md shadow-brand/20"><Send size={16} /> Registrar y Enviar</button>
                </div>
            </div>
        </div>
    );
}

export function DeleteHistoryModal({
    isOpen, onClose,
    deleteConfirmText, setDeleteConfirmText,
    sales, setSales,
}) {
    if (!isOpen) return null;

    const handleDelete = async () => {
        if (deleteConfirmText.trim().toUpperCase() === 'BORRAR') {
            setSales([]);
            await storageService.removeItem(SALES_KEY);
            localStorage.removeItem('cierre_notified_date');
            try {
                const { data: { session } } = await supabaseCloud.auth.getSession();
                if (session?.user?.id) await supabaseCloud.from('sync_documents').delete().eq('user_id', session.user.id).eq('doc_id', SALES_KEY);
            } catch { /* sin nube */ }
            onClose();
            setDeleteConfirmText('');
            showToast('Historial y reportes eliminados', 'success');
            setTimeout(() => window.location.reload(), 800);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-sm rounded-[24px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-100">
                <div className="p-6 flex flex-col items-center text-center">
                    <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-4"><Trash2 size={32} /></div>
                    <h3 className="text-xl font-black text-slate-800 mb-2">¿Estás absolutamente seguro?</h3>
                    <p className="text-sm text-slate-500 mb-4 px-2">Esta acción borrará permanentemente <strong className="text-red-500">TODO el historial de ventas y reportes estadísticos</strong>. (No afectará tu inventario de productos).</p>
                    <div className="w-full bg-slate-50 p-4 rounded-xl border border-slate-200 mb-2 mt-2">
                        <p className="text-xs font-bold text-slate-600 mb-2 uppercase tracking-wide">Escribe "BORRAR" para confirmar:</p>
                        <input type="text" value={deleteConfirmText} onChange={(e) => setDeleteConfirmText(e.target.value)} placeholder="Ej. BORRAR" className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-center font-black text-red-500 uppercase tracking-widest focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-all outline-none" />
                    </div>
                </div>
                <div className="p-4 border-t border-slate-100 bg-slate-50 flex gap-3">
                    <button onClick={() => { onClose(); setDeleteConfirmText(''); }} className="flex-1 py-3.5 bg-white border-2 border-slate-200 text-slate-700 font-bold rounded-xl active:scale-[0.98] transition-all">Cancelar</button>
                    <button onClick={handleDelete} disabled={deleteConfirmText.trim().toUpperCase() !== 'BORRAR'} className="flex-1 py-3.5 bg-red-500 disabled:bg-slate-300 disabled:text-slate-500 text-white font-bold rounded-xl active:scale-[0.98] transition-all flex justify-center items-center gap-2"><Trash2 size={18} /> Borrar Historial</button>
                </div>
            </div>
        </div>
    );
}

export function RecycleModal({ recycleOffer, setRecycleOffer, loadCart, onNavigate }) {
    if (!recycleOffer) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setRecycleOffer(null)}>
            <div className="bg-white w-full max-w-sm rounded-[24px] shadow-xl border border-slate-100 overflow-hidden animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
                <div className="p-6 text-center">
                    <div className="flex justify-center mb-4"><div className="w-16 h-16 bg-[#0EA5E9]/10 text-[#0EA5E9] rounded-full flex items-center justify-center"><Recycle size={28} /></div></div>
                    <h3 className="text-xl font-black text-slate-800 mb-2">¿Reciclar Venta?</h3>
                    <p className="text-sm text-slate-500 mb-6">¿Quieres copiar los productos de esta venta anulada a tu caja actual?</p>
                    <div className="text-left bg-slate-50 border border-slate-100 rounded-xl p-3 mb-2">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 px-1">Productos a reciclar</p>
                        <div className="space-y-1.5 max-h-32 overflow-y-auto scrollbar-hide pr-1">
                            {recycleOffer.items?.slice(0, 5).map((item, i) => (
                                <div key={i} className="flex justify-between text-xs bg-white border border-slate-100 p-2 rounded-lg items-center">
                                    <span className="font-bold text-slate-700 truncate pr-2 mr-2">{item.qty}{item.isWeight ? 'kg' : 'u'} {item.name}</span>
                                    <span className="text-slate-500 font-medium shrink-0">${(item.priceUsd * item.qty).toFixed(2)}</span>
                                </div>
                            ))}
                        </div>
                        {recycleOffer.items?.length > 5 && <p className="text-[10px] text-slate-400 text-center font-bold mt-2">+{recycleOffer.items.length - 5} productos más...</p>}
                    </div>
                </div>
                <div className="p-4 border-t border-slate-100 bg-slate-50 flex gap-3">
                    <button onClick={() => setRecycleOffer(null)} className="flex-1 py-3 bg-white border-2 border-slate-200 text-slate-700 font-bold rounded-xl active:scale-[0.98] transition-all">No, gracias</button>
                    <button onClick={() => { loadCart(recycleOffer.items); setRecycleOffer(null); if (onNavigate) onNavigate('ventas'); }} className="flex-1 py-3 bg-[#0EA5E9] hover:bg-[#0284C7] text-white font-bold rounded-xl active:scale-[0.98] transition-all flex justify-center items-center gap-2 shadow-md shadow-[#0EA5E9]/20"><Recycle size={16} /> Reciclar</button>
                </div>
            </div>
        </div>
    );
}
