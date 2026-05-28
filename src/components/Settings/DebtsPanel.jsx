import React, { useState, useEffect } from 'react';
import { useDebtsStore } from '../../hooks/store/useDebtsStore';
import { useAuthStore } from '../../hooks/store/authStore';
import { useProductContext } from '../../context/ProductContext';
import { AddDebtModal, DebtDetailModal } from './DebtModals';
import { ROLE_CONFIG } from './UserPinInput';
import { Plus, Receipt, ChevronDown, AlertCircle, StickyNote } from 'lucide-react';

const capitalize = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : '';
const fmtBs = (usd, rate) => rate > 0 ? (usd * rate).toFixed(2) : null;

export default function DebtsPanel() {
    const { debts, loading, fetchDebts } = useDebtsStore();
    const { cachedUsers } = useAuthStore();
    const { effectiveRate } = useProductContext();
    const [showAddModal, setShowAddModal] = useState(false);
    const [selectedDebt, setSelectedDebt] = useState(null);
    const [expandedStaff, setExpandedStaff] = useState(null);
    const [filter, setFilter] = useState('pending');

    useEffect(() => { fetchDebts(); }, []);

    const filteredDebts = filter === 'all' ? debts : debts.filter(d => d.status === filter);

    const staffMap = {};
    filteredDebts.forEach(d => {
        if (!staffMap[d.staff_id]) {
            const user = cachedUsers.find(u => u.id === d.staff_id);
            staffMap[d.staff_id] = {
                id: d.staff_id,
                name: user ? capitalize(user.name) : 'Desconocido',
                role: user?.role || '?',
                debts: [],
                totalPending: 0,
            };
        }
        staffMap[d.staff_id].debts.push(d);
        if (d.status === 'pending') staffMap[d.staff_id].totalPending += Number(d.remaining_usd);
    });

    const staffList = Object.values(staffMap).sort((a, b) => b.totalPending - a.totalPending);
    const toggleExpand = (id) => setExpandedStaff(expandedStaff === id ? null : id);

    const totalGlobal = debts.filter(d => d.status === 'pending').reduce((s, d) => s + Number(d.remaining_usd), 0);
    const pendingCount = debts.filter(d => d.status === 'pending').length;
    const totalBs = fmtBs(totalGlobal, effectiveRate);

    return (
        <div className="space-y-3">
            {/* Header */}
            <div className="bg-gradient-to-br from-rose-500 to-rose-600 rounded-2xl p-3 sm:p-4 text-white shadow-lg shadow-rose-500/20">
                <div className="flex items-center justify-between mb-2.5">
                    <div className="flex items-center gap-2 min-w-0">
                        <Receipt size={16} className="shrink-0" />
                        <p className="text-[10px] font-bold uppercase tracking-widest text-white/70 truncate">Deudas de Empleados</p>
                    </div>
                    <button onClick={() => setShowAddModal(true)}
                        className="w-8 h-8 bg-white/20 hover:bg-white/30 rounded-xl flex items-center justify-center transition-all active:scale-90 shrink-0">
                        <Plus size={16} strokeWidth={2.5} />
                    </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <div className="bg-white/15 rounded-xl p-2.5 sm:p-3">
                        <p className="text-[9px] sm:text-[10px] text-white/60 font-bold uppercase mb-0.5">Total pendiente</p>
                        <p className="text-xl sm:text-2xl font-black leading-tight">${totalGlobal.toFixed(2)}</p>
                        {totalBs && <p className="text-[10px] text-white/50 font-bold mt-0.5">Bs {totalBs}</p>}
                    </div>
                    <div className="bg-white/15 rounded-xl p-2.5 sm:p-3">
                        <p className="text-[9px] sm:text-[10px] text-white/60 font-bold uppercase mb-0.5">Deudas activas</p>
                        <p className="text-xl sm:text-2xl font-black leading-tight">{pendingCount}</p>
                        <p className="text-[10px] text-white/50 font-bold mt-0.5">
                            {staffList.length} {staffList.length === 1 ? 'empleado' : 'empleados'}
                        </p>
                    </div>
                </div>
            </div>

            {/* Filtros */}
            <div className="flex bg-slate-100 dark:bg-slate-800 rounded-xl p-1">
                {[
                    { id: 'pending', label: 'Pendientes' },
                    { id: 'paid', label: 'Pagadas' },
                    { id: 'all', label: 'Todas' },
                ].map(f => {
                    const count = f.id === 'all' ? debts.length : debts.filter(d => d.status === f.id).length;
                    return (
                        <button key={f.id} onClick={() => setFilter(f.id)}
                            className={`flex-1 py-2 text-[10px] sm:text-[11px] font-bold rounded-lg transition-all flex items-center justify-center gap-1 ${filter === f.id
                                ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm'
                                : 'text-slate-400 hover:text-slate-600'
                            }`}>
                            {f.label}
                            {count > 0 && (
                                <span className={`text-[8px] sm:text-[9px] min-w-[16px] px-1 py-0.5 rounded-full font-black text-center ${
                                    filter === f.id ? 'bg-rose-100 text-rose-600' : 'bg-slate-200 dark:bg-slate-600 text-slate-400'
                                }`}>
                                    {count}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* Lista */}
            {loading ? (
                <div className="flex items-center justify-center py-12">
                    <div className="w-6 h-6 border-2 border-rose-500 border-t-transparent rounded-full animate-spin" />
                </div>
            ) : staffList.length === 0 ? (
                <div className="text-center py-10">
                    <div className="w-14 h-14 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-3">
                        <Receipt size={24} className="text-slate-300" />
                    </div>
                    <p className="text-sm text-slate-400 font-medium">
                        {filter === 'pending' ? 'No hay deudas pendientes' : filter === 'paid' ? 'No hay deudas pagadas' : 'No hay deudas registradas'}
                    </p>
                    <button onClick={() => setShowAddModal(true)}
                        className="mt-3 px-4 py-2 bg-rose-50 text-rose-500 font-bold text-xs rounded-xl hover:bg-rose-100 transition-all">
                        + Registrar primera deuda
                    </button>
                </div>
            ) : (
                <div className="space-y-2">
                    {staffList.map(staff => {
                        const isOpen = expandedStaff === staff.id;
                        const conf = ROLE_CONFIG[staff.role] || ROLE_CONFIG.CAJERO;
                        const initial = (staff.name || 'U')[0].toUpperCase();
                        const pendingDebts = staff.debts.filter(d => d.status === 'pending').length;
                        const bsTotal = fmtBs(staff.totalPending, effectiveRate);

                        return (
                            <div key={staff.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden shadow-sm">
                                <button onClick={() => toggleExpand(staff.id)}
                                    className="w-full flex items-center gap-2.5 px-3 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                    {/* Avatar */}
                                    <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${conf.gradient} flex items-center justify-center shrink-0`}>
                                        <span className="text-white font-black text-xs">{initial}</span>
                                    </div>
                                    {/* Info */}
                                    <div className="text-left flex-1 min-w-0">
                                        <p className="text-sm font-black text-slate-800 dark:text-white truncate">{staff.name}</p>
                                        <p className="text-[10px] text-slate-400 font-medium truncate">
                                            {pendingDebts} {pendingDebts === 1 ? 'deuda' : 'deudas'}
                                            <span className={`ml-1 font-bold ${conf.text}`}>· {conf.label}</span>
                                        </p>
                                    </div>
                                    {/* Amount + chevron */}
                                    <div className="flex items-center gap-1.5 shrink-0">
                                        {staff.totalPending > 0 && (
                                            <div className="text-right">
                                                <span className="bg-rose-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full whitespace-nowrap">
                                                    ${staff.totalPending.toFixed(2)}
                                                </span>
                                                {bsTotal && (
                                                    <p className="text-[9px] text-slate-400 font-bold mt-0.5 text-right">Bs {bsTotal}</p>
                                                )}
                                            </div>
                                        )}
                                        <div className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}>
                                            <ChevronDown size={14} className="text-slate-300" />
                                        </div>
                                    </div>
                                </button>

                                {/* Deudas expandidas */}
                                {isOpen && (
                                    <div className="border-t border-slate-100 dark:border-slate-700 px-2.5 py-2 space-y-1.5 bg-slate-50/50 dark:bg-slate-800/30">
                                        {staff.debts.map(d => {
                                            const remBs = fmtBs(Number(d.remaining_usd), effectiveRate);
                                            const origBs = fmtBs(Number(d.amount_usd), effectiveRate);
                                            return (
                                                <button key={d.id} onClick={() => setSelectedDebt(d)}
                                                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition-all active:scale-[0.98] ${
                                                        d.status === 'paid'
                                                            ? 'bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200/60'
                                                            : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700'
                                                    }`}>
                                                    <div className="min-w-0 flex-1 mr-2">
                                                        <p className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">{d.concept}</p>
                                                        {d.note && (
                                                            <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5 truncate flex items-center gap-1">
                                                                <StickyNote size={8} className="shrink-0" /> {d.note}
                                                            </p>
                                                        )}
                                                        <p className="text-[9px] sm:text-[10px] text-slate-400 mt-0.5 truncate">
                                                            {new Date(d.created_at).toLocaleDateString('es-VE', { day: '2-digit', month: 'short' })}
                                                            {' · '}${Number(d.amount_usd).toFixed(2)}
                                                            {origBs && <span className="text-slate-300"> · Bs {origBs}</span>}
                                                        </p>
                                                    </div>
                                                    <div className="text-right shrink-0">
                                                        <span className={`text-xs font-black ${d.status === 'paid' ? 'text-emerald-500' : 'text-rose-600'}`}>
                                                            {d.status === 'paid' ? 'PAGADA' : `$${Number(d.remaining_usd).toFixed(2)}`}
                                                        </span>
                                                        {d.status !== 'paid' && remBs && (
                                                            <p className="text-[9px] text-slate-400 font-bold">Bs {remBs}</p>
                                                        )}
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            <AddDebtModal isOpen={showAddModal} onClose={() => setShowAddModal(false)} />
            <DebtDetailModal debt={selectedDebt} onClose={() => setSelectedDebt(null)} />
        </div>
    );
}
