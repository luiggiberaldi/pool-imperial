import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useTablesStore } from '../hooks/store/useTablesStore';
import { useAuthStore } from '../hooks/store/authStore';
import TableCard from '../components/tables/TableCard';
import FloorPlanView from '../components/tables/FloorPlanView';
import { Layers, PauseCircle, PlayCircle, LayoutGrid, Map, X, ArrowRight, AlertTriangle } from 'lucide-react';
import { calculateElapsedTime } from '../utils/tableBillingEngine';
import { showToast } from '../components/Toast';
import { Modal } from '../components/Modal';

const TYPE_FILTERS   = ['Todas', 'Pool', 'Bar'];
const STATUS_FILTERS = ['Todas', 'Libres', 'Ocupadas'];

function FilterPill({ label, active, onClick }) {
    return (
        <button
            onClick={onClick}
            className={`shrink-0 px-3 py-1 rounded-full text-xs font-bold transition-all active:scale-95 border ${
                active
                    ? 'bg-[#D97706] text-white border-[#D97706] shadow-sm shadow-amber-500/30'
                    : 'bg-white dark:bg-white/5 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-white/10 hover:border-slate-300'
            }`}
        >
            {label}
        </button>
    );
}

// ─── View Mode Toggle ─────────────────────────────────────────────────────────
function ViewToggle({ mode, onChange }) {
    return (
        <div className="flex items-center bg-slate-100 dark:bg-white/5 rounded-xl p-0.5 gap-0.5">
            <button
                onClick={() => onChange('grid')}
                title="Vista cuadrícula"
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    mode === 'grid'
                        ? 'bg-white dark:bg-white/10 text-slate-800 dark:text-white shadow-sm'
                        : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                }`}
            >
                <LayoutGrid size={13} />
                <span className="hidden sm:inline">Grid</span>
            </button>
            <button
                onClick={() => onChange('floor')}
                title="Vista plano del local"
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    mode === 'floor'
                        ? 'bg-white dark:bg-white/10 text-slate-800 dark:text-white shadow-sm'
                        : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                }`}
            >
                <Map size={13} />
                <span className="hidden sm:inline">Plano</span>
            </button>
        </div>
    );
}

export default function TablesView({ triggerHaptic: _triggerHaptic, isActive }) {
    const { tables, activeSessions, loading, syncTablesAndSessions, transferSession } = useTablesStore();
    const { role, currentUser } = useAuthStore();
    const isAdmin = role === 'ADMIN';

    const [typeFilter,   setTypeFilter]   = useState('Todas');
    const [statusFilter, setStatusFilter] = useState('Todas');
    const [ownerFilter, setOwnerFilter]   = useState('Todas');
    const [viewMode, setViewMode]         = useState('floor'); // 'grid' | 'floor'
    const [isEditingPlan, setIsEditingPlan] = useState(false);

    // When a table is selected from the floor plan, we open its TableCard via a mini panel
    const [selectedTableId, setSelectedTableId] = useState(null);

    const [transferSourceTableId, setTransferSourceTableId] = useState(null);
    const [transferTargetTable, setTransferTargetTable] = useState(null);
    const [isMutating, setIsMutating] = useState(false);

    const handleConfirmTransfer = async () => {
        if (isMutating || !transferTargetTable) return;
        const sourceSession = activeSessions.find(s => s.table_id === transferSourceTableId);
        if (!sourceSession) {
            showToast("No hay una sesión activa en la mesa de origen", "error");
            return;
        }

        setIsMutating(true);
        try {
            const targetSession = activeSessions.find(
                s => s.table_id === transferTargetTable.id && (s.status === 'ACTIVE' || s.status === 'CHECKOUT')
            );
            const isTargetOccupied = !!targetSession;
            const type = isTargetOccupied ? 'CONSUMPTION' : 'ALL';
            
            await transferSession(sourceSession.id, transferTargetTable.id, type);
            
            showToast(
                isTargetOccupied 
                    ? `Fusión exitosa: Consumos unificados en ${transferTargetTable.name}`
                    : `Transferencia exitosa: Sesión movida a ${transferTargetTable.name}`,
                'success'
            );
            
            const targetId = transferTargetTable.id;
            setTransferSourceTableId(null);
            setTransferTargetTable(null);
            
            // Keep focus on the new table
            setSelectedTableId(targetId);
        } catch (error) {
            console.error(error);
            showToast(error.message || "Error al realizar la transferencia", "error");
        } finally {
            setIsMutating(false);
        }
    };

    const isMesero = role === 'MESERO' || role === 'BARRA';

    // Detectar si hay alguna sesión pausada (para el botón global)
    const pausableSessions = useMemo(() =>
        activeSessions.filter(s => s.game_mode !== 'PINA'),
        [activeSessions]
    );
    const pausedSessions = useTablesStore(state => state.pausedSessions);
    const { pauseSession, resumeSession } = useTablesStore();
    const anyPaused = useMemo(() =>
        pausableSessions.some(s => pausedSessions[s.id]?.isPaused),
        [pausableSessions, pausedSessions]
    );

    const handlePauseAll = () => {
        let count = 0;
        pausableSessions.forEach(s => {
            if (pausedSessions[s.id]?.isPaused) return;
            const currentElapsed = calculateElapsedTime(s.started_at);
            pauseSession(s.id, currentElapsed);
            count++;
        });
        showToast(`${count} mesa${count !== 1 ? 's' : ''} pausada${count !== 1 ? 's' : ''}`, 'success');
    };

    const handleResumeAll = async () => {
        let count = 0;
        for (const s of pausableSessions) {
            if (!pausedSessions[s.id]?.isPaused) continue;
            await resumeSession(s.id);
            count++;
        }
        showToast(`${count} mesa${count !== 1 ? 's' : ''} reanudada${count !== 1 ? 's' : ''}`, 'success');
    };

    useEffect(() => {
        if (isActive) {
            syncTablesAndSessions();
        }
    }, [isActive, syncTablesAndSessions]);

    // ── [SNIPER LOGS] ──
    useEffect(() => {
        console.log("%c[SNIPER: TablesView Mounted]", "color: #10b981; font-weight: bold;");
        return () => {
            console.log("%c[SNIPER: TablesView Unmounted]", "color: #ef4444; font-weight: bold;");
        };
    }, []);

    useEffect(() => {
        console.log("%c[SNIPER: selectedTableId changed]", "color: #f59e0b; font-weight: bold;", {
            to: selectedTableId
        });
    }, [selectedTableId]);

    // Handle floor plan table selection
    const handleFloorTableSelect = useCallback((table, session) => {
        if (isEditingPlan) return;
        if (transferSourceTableId) {
            if (table.id === transferSourceTableId) {
                showToast("No puedes transferir una mesa a sí misma. Selecciona otra mesa diferente.", "warning");
                return;
            }
            setTransferTargetTable(table);
            return;
        }
        setSelectedTableId(table.id);
    }, [transferSourceTableId, isEditingPlan]);

    const filteredTables = useMemo(() => {
        const filtered = tables.filter(table => {
            const session    = activeSessions.find(s => s.table_id === table.id);
            const isOccupied = !!session;

            if (typeFilter === 'Pool' && table.type !== 'POOL')   return false;
            if (typeFilter === 'Bar'  && table.type !== 'NORMAL') return false;

            if (statusFilter === 'Libres'   &&  isOccupied) return false;
            if (statusFilter === 'Ocupadas' && !isOccupied) return false;

            if (ownerFilter === 'Mis Mesas' && (!isOccupied || session.opened_by !== currentUser?.id)) return false;

            return true;
        });

        // Meseros: sus mesas primero, luego el resto
        if (isMesero && currentUser?.id) {
            filtered.sort((a, b) => {
                const sA = activeSessions.find(s => s.table_id === a.id);
                const sB = activeSessions.find(s => s.table_id === b.id);
                const aMine = sA?.opened_by === currentUser.id ? 1 : 0;
                const bMine = sB?.opened_by === currentUser.id ? 1 : 0;
                return bMine - aMine;
            });
        }

        return filtered;
    }, [tables, activeSessions, typeFilter, statusFilter, ownerFilter, currentUser, isMesero]);

    if (loading) {
        return (
            <div className="flex-1 flex flex-col p-6 gap-6 overflow-y-auto w-full">
                <div className="h-20 w-1/3 bg-slate-200 dark:bg-slate-800 animate-pulse rounded-2xl"></div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {[1, 2, 3, 4].map(k => (
                        <div key={k} className="h-64 bg-slate-200 dark:bg-slate-800 animate-pulse rounded-3xl" />
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col overflow-hidden w-full relative">

            {/* ── STICKY HEADER + FILTERS ── */}
            <div className="sticky top-0 z-20 bg-[#F8FAFC]/90 dark:bg-[#0f172a]/90 backdrop-blur-xl px-4 sm:px-6 pt-4 pb-3 border-b border-slate-200/50 dark:border-white/5 flex-shrink-0">
                <div className="flex items-center justify-between mb-2 gap-2">
                    <div>
                        <h2 className="text-xl sm:text-2xl font-black text-slate-800 dark:text-white tracking-tight flex items-center gap-2 sm:gap-3">
                            <Layers className="text-[#D97706]" size={22} />
                            Mesas de Pool
                        </h2>
                        <p className="text-xs sm:text-sm font-medium text-slate-500 mt-0.5">
                            {viewMode === 'floor'
                                ? `${tables.length} mesa${tables.length !== 1 ? 's' : ''} en el local`
                                : `${filteredTables.length} mesa${filteredTables.length !== 1 ? 's' : ''} mostrada${filteredTables.length !== 1 ? 's' : ''}`
                            }
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        {/* View Mode Toggle */}
                        <ViewToggle mode={viewMode} onChange={(mode) => { setViewMode(mode); if (mode === 'grid') setIsEditingPlan(false); }} />

                        {/* {viewMode === 'floor' && isAdmin && (
                            <button
                                onClick={() => {
                                    setSelectedTableId(null);
                                    setIsEditingPlan(!isEditingPlan);
                                }}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs transition-all active:scale-95 shadow-sm border ${
                                    isEditingPlan
                                        ? 'bg-amber-500 hover:bg-amber-600 text-white border-amber-500 shadow-amber-500/20'
                                        : 'bg-white dark:bg-white/5 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-white/10 hover:border-slate-300'
                                }`}
                            >
                                <span>🔧 {isEditingPlan ? 'Salir Editor' : 'Editar Plano'}</span>
                            </button>
                        )} */}

                        {/* Botón pausa general — solo admin, solo si hay sesiones activas */}
                        {isAdmin && pausableSessions.length > 0 && (
                            <button
                                onClick={anyPaused ? handleResumeAll : handlePauseAll}
                                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl font-black text-xs transition-all active:scale-95 shadow-sm ${
                                    anyPaused
                                        ? 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-500/20'
                                        : 'bg-rose-500 hover:bg-rose-600 text-white shadow-rose-500/20'
                                }`}
                            >
                                {anyPaused ? <PlayCircle size={14} /> : <PauseCircle size={14} />}
                                <span className="hidden sm:inline">{anyPaused ? 'Reanudar' : 'Pausar'}</span>
                            </button>
                        )}
                    </div>
                </div>

                {/* Filter rows — only shown in grid mode */}
                {viewMode === 'grid' && (
                    <div className="flex flex-col gap-1.5 mt-2">
                        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 shrink-0 w-10">Tipo</span>
                            {TYPE_FILTERS.map(f => (
                                <FilterPill key={f} label={f} active={typeFilter === f} onClick={() => setTypeFilter(f)} />
                            ))}
                        </div>
                        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 shrink-0 w-10">Est.</span>
                            {STATUS_FILTERS.map(f => (
                                <FilterPill key={f} label={f} active={statusFilter === f} onClick={() => setStatusFilter(f)} />
                            ))}
                        </div>
                        {isMesero && (
                        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 shrink-0 w-10">Mías</span>
                            {['Todas', 'Mis Mesas'].map(f => (
                                <FilterPill key={f} label={f} active={ownerFilter === f} onClick={() => setOwnerFilter(f)} />
                            ))}
                        </div>
                        )}
                    </div>
                )}
            </div>

            {/* ── CONTENT ── */}
            <div className="flex-1 overflow-hidden flex flex-row relative h-full">
                <style dangerouslySetInnerHTML={{__html: `
                    @keyframes slideUp {
                        from {
                            transform: translateY(100%);
                        }
                        to {
                            transform: translateY(0);
                        }
                    }
                `}} />
                {viewMode === 'floor' ? (
                    /* ── FLOOR PLAN VIEW WITH CONTEXT PANEL ── */
                    <div className="flex-1 flex flex-row overflow-hidden w-full relative">
                        {/* El plano a la izquierda */}
                        <div className="flex-1 overflow-auto h-full min-w-0 relative">
                            {transferSourceTableId && (
                                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 bg-amber-500 text-white font-black px-4 sm:px-6 py-3 rounded-2xl shadow-lg shadow-amber-500/20 flex items-center gap-4 border border-amber-400/30 animate-in slide-in-from-top-4 duration-300 w-[90%] sm:w-auto max-w-lg justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className="animate-pulse bg-white/20 p-1.5 rounded-full shrink-0">
                                            <Map size={16} />
                                        </span>
                                        <span className="text-xs sm:text-sm">
                                            Moviendo <strong>{tables.find(t => t.id === transferSourceTableId)?.name}</strong>. Elige destino en el plano.
                                        </span>
                                    </div>
                                    <button 
                                        onClick={() => {
                                            setTransferSourceTableId(null);
                                            showToast('Mover cancelado', 'info');
                                        }}
                                        className="bg-white hover:bg-white/90 text-amber-600 font-extrabold text-[11px] px-3 py-2 rounded-xl transition-all active:scale-95 shrink-0"
                                    >
                                        Cancelar
                                    </button>
                                </div>
                            )}

                            <FloorPlanView 
                                onTableSelect={handleFloorTableSelect} 
                                selectedTableId={selectedTableId}
                                isEditing={isEditingPlan}
                                onExitEditing={() => setIsEditingPlan(false)}
                            />
                        </div>

                        {/* Centro Operativo Flotante (Table Card Hub) */}
                        {selectedTableId && (() => {
                            const table = tables.find(t => t.id === selectedTableId);
                            const session = activeSessions.find(s => s.table_id === selectedTableId);
                            if (!table) return null;

                            const isTableAvailable = !session || session.status === 'CLOSED';

                            if (isTableAvailable) {
                                // Si está libre, ocultamos el contenedor flotante y su fondo
                                // para que no se superpongan dos fondos oscuros.
                                // Solo se verá el portal del Wizard de Apertura.
                                return (
                                    <div className="hidden">
                                        <TableCard 
                                            table={table} 
                                            session={session} 
                                            initialOpenMode={table.type === 'NORMAL' ? 'CONSUMPTION' : 'SHOW_MODE'}
                                            onClose={() => setSelectedTableId(null)}
                                            onStartTransfer={() => {
                                                setTransferSourceTableId(selectedTableId);
                                                setSelectedTableId(null);
                                                showToast("Selecciona la mesa de destino en el plano", "info");
                                            }}
                                        />
                                    </div>
                                );
                            }

                            // Si está ocupada, se muestra de forma estándar el Centro Operativo Flotante con su fondo
                            return (
                                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
                                    {/* Click fuera para cerrar */}
                                    <div className="absolute inset-0" onClick={() => setSelectedTableId(null)} />
                                    
                                    {/* Contenedor de la Tarjeta */}
                                    <div className="relative w-full max-w-sm z-10 animate-in zoom-in-95 duration-200">
                                        <button 
                                            onClick={() => setSelectedTableId(null)}
                                            className="absolute -top-3 -right-3 z-30 w-8 h-8 rounded-full bg-slate-900 hover:bg-slate-800 text-white flex items-center justify-center shadow-lg border border-slate-700/50 active:scale-95 transition-all text-sm font-bold animate-in zoom-in duration-300"
                                        >
                                            ✕
                                        </button>
                                        <TableCard 
                                            table={table} 
                                            session={session} 
                                            initialOpenMode={table.type === 'NORMAL' ? 'CONSUMPTION' : 'SHOW_MODE'}
                                            onClose={() => setSelectedTableId(null)}
                                            onStartTransfer={() => {
                                                setTransferSourceTableId(selectedTableId);
                                                setSelectedTableId(null); // Cerrar panel para ver plano con claridad
                                                showToast("Selecciona la mesa de destino en el plano", "info");
                                            }}
                                        />
                                    </div>
                                </div>
                            );
                        })()}
                    </div>
                ) : (
                    /* ── GRID VIEW ── */
                    <div className="flex-1 overflow-y-auto p-4 sm:p-6 h-full w-full">
                        {tables.length === 0 ? (
                            <div className="flex flex-col items-center justify-center p-12 text-center bg-white dark:bg-slate-900 rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-800 w-full">
                                <Layers size={48} className="text-slate-300 dark:text-slate-700 mb-4" />
                                <h3 className="text-lg font-bold text-slate-700 dark:text-slate-300">No hay mesas configuradas</h3>
                                <p className="text-slate-500 mt-2 text-sm max-w-sm">Contacte al administrador para registrar las mesas del negocio en la base de datos.</p>
                            </div>
                        ) : filteredTables.length === 0 ? (
                            <div className="flex flex-col items-center justify-center p-12 text-center bg-white dark:bg-slate-900 rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-800 w-full">
                                <Layers size={40} className="text-slate-300 dark:text-slate-700 mb-3" />
                                <h3 className="text-base font-bold text-slate-600 dark:text-slate-400">Sin resultados</h3>
                                <p className="text-slate-400 mt-1 text-sm">Prueba cambiando los filtros.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-6 w-full">
                                {filteredTables.map(table => {
                                    const session = activeSessions.find(s => s.table_id === table.id);
                                    return (
                                        <div
                                            key={table.id}
                                            id={`table-card-${table.id}`}
                                            className={`transition-all duration-300 ${
                                                selectedTableId === table.id
                                                    ? 'ring-2 ring-[#D97706] ring-offset-2 dark:ring-offset-slate-900 rounded-3xl'
                                                    : ''
                                            }`}
                                        >
                                            <TableCard 
                                                table={table} 
                                                session={session} 
                                                onStartTransfer={() => {
                                                    setTransferSourceTableId(table.id);
                                                    setViewMode('floor'); // Cambiar a plano automáticamente
                                                    showToast("Selecciona la mesa de destino en el plano", "info");
                                                }}
                                            />
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Modal de confirmación de transferencia de mesa (Fase 4) */}
            {transferTargetTable && (() => {
                const sourceTable = tables.find(t => t.id === transferSourceTableId);
                const sourceSession = activeSessions.find(s => s.table_id === transferSourceTableId);
                if (!sourceTable || !sourceSession) return null;

                const targetSession = activeSessions.find(
                    s => s.table_id === transferTargetTable.id && (s.status === 'ACTIVE' || s.status === 'CHECKOUT')
                );
                const isTargetOccupied = !!targetSession;

                return (
                    <Modal 
                        isOpen={!!transferTargetTable} 
                        onClose={() => setTransferTargetTable(null)} 
                        title={isTargetOccupied ? "Confirmar Fusión de Cuentas" : "Confirmar Transferencia de Mesa"}
                        maxWidthClass="max-w-md"
                    >
                        <div className="flex flex-col gap-4 py-2">
                            {/* Visual Flow Diagram */}
                            <div className="bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800 p-4 rounded-2xl flex items-center justify-between text-center relative overflow-hidden">
                                <div className="flex-1">
                                    <span className="text-[10px] text-slate-400 font-bold block uppercase">Origen</span>
                                    <span className="text-base font-black text-slate-800 dark:text-white block mt-0.5">{sourceTable.name}</span>
                                    <span className="text-[10px] text-amber-500 font-extrabold bg-amber-500/10 px-2 py-0.5 rounded-full inline-block mt-1">Ocupada</span>
                                </div>
                                
                                <div className="flex flex-col items-center justify-center px-2">
                                    <span className="text-[9px] text-slate-400 font-black uppercase tracking-wider">
                                        {isTargetOccupied ? "FUSIONAR" : "MOVER"}
                                    </span>
                                    <div className="w-8 h-8 bg-amber-500/10 rounded-full flex items-center justify-center text-amber-500 mt-1">
                                        <ArrowRight size={16} />
                                    </div>
                                </div>

                                <div className="flex-1">
                                    <span className="text-[10px] text-slate-400 font-bold block uppercase">Destino</span>
                                    <span className="text-base font-black text-slate-800 dark:text-white block mt-0.5">{transferTargetTable.name}</span>
                                    <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full inline-block mt-1 ${
                                        isTargetOccupied 
                                            ? 'text-amber-500 bg-amber-500/10' 
                                            : 'text-emerald-500 bg-emerald-500/10'
                                    }`}>
                                        {isTargetOccupied ? "Ocupada" : "Libre"}
                                    </span>
                                </div>
                            </div>

                            {/* Warning/Info Box */}
                            {isTargetOccupied ? (
                                <div className="bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-xl flex items-start gap-3 dark:bg-amber-950/20 dark:border-amber-900/30 dark:text-amber-300">
                                    <AlertTriangle className="shrink-0 mt-0.5 text-amber-500" size={18} />
                                    <div>
                                        <h4 className="font-bold text-sm">Fusión de Cuentas (Destino Ocupada)</h4>
                                        <p className="text-xs opacity-90 mt-1 leading-relaxed">
                                            La mesa de destino ya está jugando. Se sumará todo el consumo de bebidas/comida de <strong>{sourceTable.name}</strong> a la comanda activa de <strong>{transferTargetTable.name}</strong>.
                                        </p>
                                        <p className="text-xs opacity-90 mt-2 font-bold leading-relaxed">
                                            ⚠️ La sesión original en {sourceTable.name} se cerrará en $0 y quedará LIBRE.
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <div className="bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-xl flex items-start gap-3 dark:bg-amber-950/20 dark:border-amber-900/30 dark:text-amber-300">
                                    <ArrowRight className="shrink-0 mt-0.5 text-amber-500" size={18} />
                                    <div>
                                        <h4 className="font-bold text-sm">Transferencia Completa (Destino Libre)</h4>
                                        <p className="text-xs opacity-90 mt-1 leading-relaxed">
                                            Se moverá la sesión completa de <strong>{sourceTable.name}</strong> a <strong>{transferTargetTable.name}</strong>.
                                        </p>
                                        <ul className="text-xs opacity-90 mt-1.5 list-disc pl-4 space-y-0.5">
                                            <li>El temporizador de juego no se detendrá.</li>
                                            <li>Se conservará el cliente asignado, notas y comanda.</li>
                                            <li>La mesa {sourceTable.name} quedará completamente LIBRE.</li>
                                        </ul>
                                    </div>
                                </div>
                            )}

                            {/* Buttons */}
                            <div className="grid grid-cols-2 gap-3 mt-2">
                                <button
                                    type="button"
                                    onClick={() => setTransferTargetTable(null)}
                                    className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-550 dark:text-slate-400 font-bold hover:bg-slate-50 dark:hover:bg-slate-950/50 transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="button"
                                    disabled={isMutating}
                                    onClick={handleConfirmTransfer}
                                    className={`px-4 py-2.5 rounded-xl text-white font-black transition-all active:scale-95 shadow-md flex items-center justify-center gap-1.5 ${
                                        isTargetOccupied 
                                            ? 'bg-amber-500 hover:bg-amber-600 shadow-amber-500/20' 
                                            : 'bg-[#D97706] hover:bg-[#B45309] shadow-amber-500/20'
                                    }`}
                                >
                                    {isMutating ? "Procesando..." : isTargetOccupied ? "Fusionar Cuentas" : "Confirmar Mover"}
                                </button>
                            </div>
                        </div>
                    </Modal>
                );
            })()}
        </div>
    );
}
