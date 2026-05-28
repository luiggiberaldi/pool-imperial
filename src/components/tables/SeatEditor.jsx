import React, { useState } from 'react';
import { Plus, X, UserCheck, Search, Users } from 'lucide-react';

function generateSeatId() {
    return 'seat-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
}

function ClientRow({ seat, index, onUpdate, onRemove, onSearchCustomer, duplicateWarning }) {
    return (
        <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2.5">
                <div className="w-6 h-6 rounded-full bg-sky-500/20 text-sky-600 dark:text-sky-400 flex items-center justify-center text-[10px] font-black shrink-0">
                    {index + 1}
                </div>
                <input
                    type="text"
                    placeholder={`Cliente ${index + 1}`}
                    value={seat.label}
                    onChange={e => onUpdate({ ...seat, label: e.target.value })}
                    className="flex-1 bg-transparent text-sm font-semibold text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none min-w-0"
                />
                {seat.customerId ? (
                    <div className="flex items-center gap-1">
                        <UserCheck size={13} className="text-sky-500 shrink-0" />
                        {duplicateWarning && (
                            <span className="text-[8px] font-bold text-amber-600 bg-amber-100 dark:bg-amber-900/30 px-1 py-0.5 rounded-full leading-tight">
                                Dup
                            </span>
                        )}
                        <button
                            onClick={() => onUpdate({ ...seat, customerId: null })}
                            className="p-0.5 rounded text-slate-400 hover:text-red-400 transition-colors"
                        >
                            <X size={12} />
                        </button>
                    </div>
                ) : (
                    <button
                        onClick={() => onSearchCustomer(index)}
                        className="p-2 -m-1 rounded-lg text-slate-400 hover:text-sky-500 hover:bg-sky-100 dark:hover:bg-sky-900/20 transition-colors"
                        title="Vincular a cliente"
                    >
                        <Search size={16} />
                    </button>
                )}
                <button
                    onClick={onRemove}
                    className="p-2 -m-1 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                >
                    <X size={16} />
                </button>
            </div>
        </div>
    );
}

export function SeatEditor({ seats, onSeatsChange, onSearchCustomerForSeat }) {
    // Detectar clientes duplicados
    const customerIdCounts = {};
    seats.forEach(s => { if (s.customerId) customerIdCounts[s.customerId] = (customerIdCounts[s.customerId] || 0) + 1; });

    const addSeat = () => {
        const newSeat = {
            id: generateSeatId(),
            label: '',
            customerId: null,
            gameMode: 'NONE',
            hoursPaid: 0,
            pinas: 0,
            timeCharges: [],
            paid: false,
        };
        onSeatsChange([...seats, newSeat]);
    };

    const updateSeat = (index, updated) => {
        const next = [...seats];
        next[index] = updated;
        onSeatsChange(next);
    };

    const removeSeat = (index) => {
        onSeatsChange(seats.filter((_, i) => i !== index));
    };

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <label className="text-[10px] uppercase font-black tracking-widest text-slate-400 flex items-center gap-1">
                    <Users size={10} /> Clientes ({seats.length})
                </label>
            </div>

            {seats.length > 0 && (
                <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-0.5">
                    {seats.map((seat, i) => (
                        <ClientRow
                            key={seat.id}
                            seat={seat}
                            index={i}
                            onUpdate={(updated) => updateSeat(i, updated)}
                            onRemove={() => removeSeat(i)}
                            onSearchCustomer={onSearchCustomerForSeat || (() => {})}
                            duplicateWarning={seat.customerId && customerIdCounts[seat.customerId] > 1}
                        />
                    ))}
                </div>
            )}

            <button
                onClick={addSeat}
                className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600 text-slate-400 hover:border-sky-400 hover:text-sky-500 hover:bg-sky-50/50 dark:hover:bg-sky-900/10 transition-all text-xs font-bold"
            >
                <Plus size={14} />
                Agregar Cliente
            </button>
        </div>
    );
}
