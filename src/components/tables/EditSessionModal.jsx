import React from 'react';
import { X, Users, Search, UserCheck, MessageSquare } from 'lucide-react';
import { SeatEditor } from './SeatEditor';
import { Modal } from '../Modal';
import { showToast } from '../Toast';

export function EditSessionModal({
    isOpen, onClose,
    editSeats, setEditSeats,
    editClientId, setEditClientId,
    editClientName, setEditClientName,
    editGuestCount,
    editNotes, setEditNotes,
    allCustomers,
    onSearchCustomerForSeat,
    onOpenCustomerSheet,
    isPoolTable,
    sessionId,
    updateSessionMetadata,
    updateSessionSeats,
}) {
    const handleSave = async () => {
        const name = editClientId ? (allCustomers.find(c => c.id === editClientId)?.name || editClientName) : editClientName.trim();
        const guestCount = editSeats.length > 0 ? editSeats.length : (parseInt(editGuestCount) || 0);
        await updateSessionMetadata(sessionId, name, guestCount, editClientId, editNotes.trim());
        await updateSessionSeats(sessionId, editSeats);
        onClose();
        showToast('Información actualizada', 'success');
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Editar Información de Mesa">
            <div className="flex flex-col gap-4 py-2">
                {/* Cliente clásico — solo si NO hay asientos multi-cliente */}
                {editSeats.length === 0 && (
                <div>
                    <label className="text-[10px] uppercase font-black tracking-widest text-slate-400 block mb-1.5">Cliente</label>
                    {editClientId ? (
                        <div className="flex items-center justify-between p-3 bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-700/40 rounded-xl">
                            <div className="flex items-center gap-2">
                                <UserCheck size={16} className="text-sky-600" />
                                <div>
                                    <p className="text-sm font-bold text-sky-800 dark:text-sky-300">
                                        {allCustomers.find(c => c.id === editClientId)?.name || editClientName}
                                    </p>
                                    {allCustomers.find(c => c.id === editClientId)?.documentId && (
                                        <p className="text-[11px] text-sky-500">{allCustomers.find(c => c.id === editClientId).documentId}</p>
                                    )}
                                </div>
                            </div>
                            <button onClick={() => { setEditClientId(null); setEditClientName(''); }} className="p-1 rounded-full text-sky-500 hover:bg-sky-200 dark:hover:bg-sky-800 transition-colors">
                                <X size={14} />
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={onOpenCustomerSheet}
                            className="w-full flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:border-sky-400 hover:bg-sky-50 dark:hover:bg-sky-900/10 transition-all text-left"
                        >
                            <div className="w-9 h-9 rounded-xl bg-slate-200 dark:bg-slate-700 flex items-center justify-center shrink-0">
                                <Users size={16} className="text-slate-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">Sin cliente asignado</p>
                                <p className="text-xs text-slate-400">Toca para buscar o crear</p>
                            </div>
                            <Search size={14} className="text-slate-400 shrink-0" />
                        </button>
                    )}
                </div>
                )}
                <div>
                    <SeatEditor
                        seats={editSeats}
                        onSeatsChange={setEditSeats}
                        onSearchCustomerForSeat={onSearchCustomerForSeat}
                        isPoolTable={isPoolTable}
                    />
                </div>
                <div>
                    <label className="text-[10px] uppercase font-black tracking-widest text-slate-400 block mb-1.5 flex items-center gap-1">
                        <MessageSquare size={10} /> Nota
                    </label>
                    <textarea
                        placeholder="Ej: Cumpleaños, mesa reservada, nota especial..."
                        value={editNotes}
                        onChange={e => setEditNotes(e.target.value)}
                        maxLength={200}
                        rows={2}
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500/30 resize-none"
                    />
                    <p className="text-[10px] text-slate-400 text-right mt-0.5">{editNotes.length}/200</p>
                </div>
                <button
                    onClick={handleSave}
                    className="w-full bg-sky-600 hover:bg-sky-500 text-white font-black py-3 rounded-xl shadow-md transition-all active:scale-95"
                >
                    Guardar
                </button>
            </div>
        </Modal>
    );
}
