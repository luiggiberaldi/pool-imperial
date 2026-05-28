import React from 'react';
import { Users } from 'lucide-react';
import { Modal } from '../Modal';

export function AttributionModal({
    isOpen, onClose,
    pendingCharge,
    isProcessingCharge,
    seats,
    onAttributeCharge,
}) {
    const activeSeats = (seats || []).filter(s => !s.paid);
    const title = pendingCharge?.type === 'hora'
        ? 'Agregar Hora — ¿A quién cobrar?'
        : 'Nueva Piña — ¿A quién cobrar?';

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={title}>
            <div className="flex flex-col gap-2 py-2">
                <p className="text-xs text-slate-500 mb-1">Selecciona el cliente que paga este tiempo, o elige Compartido para dividirlo entre todos.</p>
                {activeSeats.map(seat => (
                    <button
                        key={seat.id}
                        disabled={isProcessingCharge}
                        onClick={() => onAttributeCharge(seat.id)}
                        className="w-full flex items-center gap-3 p-3 bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800/40 rounded-xl hover:bg-sky-100 dark:hover:bg-sky-900/40 transition-all text-left active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
                    >
                        <div className="w-8 h-8 rounded-full bg-sky-500 text-white flex items-center justify-center text-xs font-black shrink-0">
                            {(seat.label || 'C').charAt(0).toUpperCase()}
                        </div>
                        <span className="font-bold text-sky-700 dark:text-sky-300 text-sm">{seat.label || `Cliente ${(seats || []).indexOf(seat) + 1}`}</span>
                    </button>
                ))}
                <button
                    disabled={isProcessingCharge}
                    onClick={() => onAttributeCharge(null)}
                    className="w-full flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 transition-all text-left active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
                >
                    <div className="w-8 h-8 rounded-full bg-slate-400 text-white flex items-center justify-center text-xs font-black shrink-0">
                        <Users size={14} />
                    </div>
                    <div>
                        <p className="font-bold text-slate-700 dark:text-slate-300 text-sm">Compartido</p>
                        <p className="text-[10px] text-slate-400">Se divide entre todos al cobrar</p>
                    </div>
                </button>
            </div>
        </Modal>
    );
}
