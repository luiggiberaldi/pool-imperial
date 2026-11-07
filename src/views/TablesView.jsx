import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTablesStore } from '../hooks/store/useTablesStore';
import { useAuthStore } from '../hooks/store/authStore';
import { useOrdersStore } from '../hooks/store/useOrdersStore';
import TableCard from '../components/tables/TableCard';
import FloorPlanView from '../components/tables/FloorPlanView';
import { Layers, PauseCircle, PlayCircle, LayoutGrid, Map, X, ArrowRight, AlertTriangle, ChevronDown } from 'lucide-react';
import { calculateElapsedTimePrecise, getSessionElapsedMinutes, buildFrozenTimeCharge, buildPoolToNormalPreview, calculateTransferOrderBreakdown } from '../utils/tableBillingEngine';
import {
    POOL_TRANSFER_MODES,
    SEAT_TIME_POLICIES,
    hasSeatTimeCharges,
    createTransferOperationId,
} from '../utils/tableTransferEngine';
import { showToast } from '../components/Toast';
import { Modal } from '../components/Modal';
import { useBackdropClose } from '../hooks/useBackdropClose';

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

function TransferDropdown({ label, value, placeholder, options, onChange, disabled = false }) {
    const [isOpen, setIsOpen] = useState(false);
    const [menuPosition, setMenuPosition] = useState(null);
    const dropdownRef = useRef(null);
    const triggerRef = useRef(null);
    const menuRef = useRef(null);
    const selectedOption = options.find(option => option.value === value);

    const calculateMenuPosition = useCallback(() => {
        const trigger = triggerRef.current;
        if (!trigger) return null;

        const rect = trigger.getBoundingClientRect();
        const viewportGap = 8;
        const desiredHeight = Math.min(220, options.length * 46 + 12);
        const spaceBelow = window.innerHeight - rect.bottom - viewportGap;
        const spaceAbove = rect.top - viewportGap;
        const opensUp = spaceBelow < desiredHeight && spaceAbove > spaceBelow;
        const availableSpace = opensUp ? spaceAbove : spaceBelow;
        const maxHeight = Math.max(96, Math.min(desiredHeight, availableSpace));
        const width = Math.min(rect.width, window.innerWidth - (viewportGap * 2));
        const left = Math.min(
            Math.max(viewportGap, rect.left),
            Math.max(viewportGap, window.innerWidth - width - viewportGap)
        );

        return {
            left,
            width,
            maxHeight,
            opensUp,
            top: rect.bottom + 6,
            bottom: window.innerHeight - rect.top + 6,
        };
    }, [options.length]);

    const closeDropdown = useCallback(() => {
        setIsOpen(false);
        setMenuPosition(null);
    }, []);

    const openDropdown = () => {
        if (disabled) return;
        setMenuPosition(calculateMenuPosition());
        setIsOpen(true);
    };

    useEffect(() => {
        if (!isOpen) return undefined;

        const closeOnOutsidePointer = (event) => {
            const clickedTrigger = triggerRef.current?.contains(event.target);
            const clickedMenu = menuRef.current?.contains(event.target);
            if (!clickedTrigger && !clickedMenu) closeDropdown();
        };
        const closeOnEscape = (event) => {
            if (event.key === 'Escape') closeDropdown();
        };

        document.addEventListener('pointerdown', closeOnOutsidePointer);
        document.addEventListener('keydown', closeOnEscape);
        return () => {
            document.removeEventListener('pointerdown', closeOnOutsidePointer);
            document.removeEventListener('keydown', closeOnEscape);
        };
    }, [isOpen, closeDropdown]);

    useEffect(() => {
        if (!isOpen) return undefined;

        const updatePosition = () => setMenuPosition(calculateMenuPosition());
        updatePosition();
        window.addEventListener('resize', updatePosition);
        // Capturar scroll solo para reposicionar el menú; el dropdown no fuerza
        // ningún scroll del modal porque vive en un portal con position: fixed.
        window.addEventListener('scroll', updatePosition, true);
        return () => {
            window.removeEventListener('resize', updatePosition);
            window.removeEventListener('scroll', updatePosition, true);
        };
    }, [isOpen, calculateMenuPosition]);

    const menu = isOpen && menuPosition ? createPortal(
        <div
            ref={menuRef}
            role="listbox"
            aria-label={label || placeholder}
            style={{
                position: 'fixed',
                left: `${menuPosition.left}px`,
                width: `${menuPosition.width}px`,
                maxHeight: `${menuPosition.maxHeight}px`,
                ...(menuPosition.opensUp
                    ? { bottom: `${menuPosition.bottom}px` }
                    : { top: `${menuPosition.top}px` }),
            }}
            className="z-[200] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl shadow-slate-900/15 dark:border-slate-700 dark:bg-slate-900"
        >
            {options.map(option => (
                <button
                    key={option.value || 'empty'}
                    type="button"
                    role="option"
                    aria-selected={option.value === value}
                    onClick={() => {
                        onChange(option.value);
                        closeDropdown();
                    }}
                    className={`block w-full rounded-xl px-3 py-2.5 text-left text-sm font-bold transition-colors ${
                        option.value === value
                            ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300'
                            : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'
                    }`}
                >
                    {option.label}
                </button>
            ))}
        </div>,
        document.body
    ) : null;

    return (
        <div ref={dropdownRef} className="relative min-w-0">
            {label && <span className="text-[11px] font-black text-slate-600 dark:text-slate-300">{label}</span>}
            <button
                ref={triggerRef}
                type="button"
                aria-haspopup="listbox"
                aria-expanded={isOpen}
                disabled={disabled}
                onClick={() => (isOpen ? closeDropdown() : openDropdown())}
                className={`mt-1 flex w-full min-h-11 items-center justify-between gap-3 rounded-2xl border bg-white px-3.5 py-2.5 text-left text-sm font-bold shadow-sm outline-none transition-all dark:bg-slate-900 ${
                    isOpen
                        ? 'border-indigo-400 ring-2 ring-indigo-400/20 dark:border-indigo-500'
                        : 'border-slate-200 hover:border-indigo-300 dark:border-slate-700 dark:hover:border-indigo-600'
                } disabled:cursor-not-allowed disabled:opacity-60`}
            >
                <span className={selectedOption ? 'text-slate-800 dark:text-white' : 'text-slate-400'}>
                    {selectedOption?.label || placeholder}
                </span>
                <ChevronDown size={17} className={`shrink-0 text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            {menu}
        </div>
    );
}

export default function TablesView({ triggerHaptic: _triggerHaptic, isActive }) {
    const { tables, activeSessions, loading, syncTablesAndSessions, transferSession } = useTablesStore();
    const { orders, orderItems } = useOrdersStore();
    const { role, currentUser } = useAuthStore();
    const isAdmin = role === 'ADMIN';

    const [typeFilter,   setTypeFilter]   = useState('Todas');
    const [statusFilter, setStatusFilter] = useState('Todas');
    const [ownerFilter, setOwnerFilter]   = useState('Todas');
    const [viewMode, setViewMode]         = useState('floor'); // 'grid' | 'floor'
    const [isEditingPlan, setIsEditingPlan] = useState(false);

    // When a table is selected from the floor plan, we open its TableCard via a mini panel
    const [selectedTableId, setSelectedTableId] = useState(null);
    // Cierre agnóstico a mouse/táctil del panel flotante de mesa ocupada
    // (pointerdown→pointerup sobre el fondo).
    const tableBackdropClose = useBackdropClose(() => setSelectedTableId(null));

    const [transferSourceTableId, setTransferSourceTableId] = useState(null);
    const [transferTargetTable, setTransferTargetTable] = useState(null);
    const [poolTransferMode, setPoolTransferMode] = useState('');
    const [poolTransferHours, setPoolTransferHours] = useState('0.5');
    const [poolTransferRounds, setPoolTransferRounds] = useState('1');
    const [seatTimePolicy, setSeatTimePolicy] = useState('');
    const [transferOperationId, setTransferOperationId] = useState(null);
    const [isMutating, setIsMutating] = useState(false);

    const resetTransferSelection = () => {
        setTransferSourceTableId(null);
        setTransferTargetTable(null);
        setPoolTransferMode('');
        setPoolTransferHours('0.5');
        setPoolTransferRounds('1');
        setSeatTimePolicy('');
        setTransferOperationId(null);
    };

    const handleConfirmTransfer = async () => {
        if (isMutating || !transferTargetTable) return;
        const sourceSession = activeSessions.find(s => s.table_id === transferSourceTableId);
        const sourceTable = tables.find(table => table.id === transferSourceTableId);
        const targetSession = activeSessions.find(
            s => s.table_id === transferTargetTable.id && (s.status === 'ACTIVE' || s.status === 'CHECKOUT')
        );
        const isTargetOccupied = !!targetSession;
        const isNormalToPool = sourceTable?.type === 'NORMAL' && transferTargetTable.type === 'POOL';
        const requiresPoolMode = isNormalToPool && !isTargetOccupied;
        const requiresSeatPolicy = isNormalToPool && hasSeatTimeCharges(sourceSession);

        if (!sourceSession) {
            showToast("No hay una sesión activa en la mesa de origen", "error");
            return;
        }
        if (targetSession?.status === 'CHECKOUT') {
            showToast('La mesa destino está en caja; retira esa solicitud antes de transferir', 'error');
            return;
        }
        if (requiresPoolMode && !poolTransferMode) {
            showToast('Selecciona el modo de cobro para iniciar la mesa de Pool', 'warning');
            return;
        }
        if (requiresSeatPolicy && !seatTimePolicy) {
            showToast('Indica qué hacer con los cargos manuales por asiento', 'warning');
            return;
        }

        const transferOptions = {};
        if (requiresPoolMode) {
            transferOptions.poolMode = {
                type: poolTransferMode,
                hoursPaid: poolTransferMode === POOL_TRANSFER_MODES.PREPAID ? Number(poolTransferHours) : 0,
                rounds: poolTransferMode === POOL_TRANSFER_MODES.PINA ? Number(poolTransferRounds) : 0,
            };
        }
        if (requiresSeatPolicy) {
            transferOptions.preserveSeatTimeCharges = seatTimePolicy === SEAT_TIME_POLICIES.KEEP;
        }
        if (transferOperationId) {
            transferOptions.transferOperationId = transferOperationId;
        }

        setIsMutating(true);
        try {
            const result = await transferSession(
                sourceSession.id,
                transferTargetTable.id,
                isTargetOccupied ? 'CONSUMPTION' : 'ALL',
                transferOptions
            );

            const queuedMessage = result?.queued
                ? ' Quedó encolada para sincronizar cuando vuelva la conexión.'
                : '';
            showToast(
                isTargetOccupied
                    ? `Fusión exitosa: consumos unificados en ${transferTargetTable.name}.${queuedMessage}`
                    : `Transferencia exitosa: sesión movida a ${transferTargetTable.name}.${queuedMessage}`,
                result?.queued ? 'warning' : 'success'
            );

            const targetId = transferTargetTable.id;
            resetTransferSelection();
            // Keep focus on the new table
            setSelectedTableId(targetId);
        } catch (error) {
            console.error(error);
            showToast(error.message || "Error al realizar la transferencia; no se aplicaron cambios", "error");
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
            const currentElapsed = calculateElapsedTimePrecise(s.started_at);
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


    // Handle floor plan table selection
    const handleFloorTableSelect = useCallback((table, session) => {
        if (isEditingPlan) return;
        if (transferSourceTableId) {
            if (table.id === transferSourceTableId) {
                showToast("No puedes transferir una mesa a sí misma. Selecciona otra mesa diferente.", "warning");
                return;
            }
            if (session?.status === 'CHECKOUT') {
                showToast('La mesa destino está en caja; retira esa solicitud antes de transferir', 'error');
                return;
            }
            setPoolTransferMode('');
            setPoolTransferHours('0.5');
            setPoolTransferRounds('1');
            setSeatTimePolicy('');
            setTransferOperationId(createTransferOperationId(transferSourceTableId, table.id));
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
                        <ViewToggle mode={viewMode} onChange={(mode) => {
                            if (mode === 'grid' && isEditingPlan) {
                                // El plano pide confirmación si hay cambios sin guardar; al salir cambia la vista
                                window.dispatchEvent(new CustomEvent('floorplan:request-exit', { detail: { onExited: () => setViewMode('grid') } }));
                                return;
                            }
                            setViewMode(mode);
                        }} />

                        {viewMode === 'floor' && isAdmin && (
                            <button
                                onClick={() => {
                                    if (isEditingPlan) {
                                        // El plano confirma si hay cambios sin guardar y llama a onExitEditing
                                        window.dispatchEvent(new Event('floorplan:request-exit'));
                                        return;
                                    }
                                    setSelectedTableId(null);
                                    setIsEditingPlan(true);
                                }}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs transition-all active:scale-95 shadow-sm border ${
                                    isEditingPlan
                                        ? 'bg-amber-500 hover:bg-amber-600 text-white border-amber-500 shadow-amber-500/20'
                                        : 'bg-white dark:bg-white/5 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-white/10 hover:border-slate-300'
                                }`}
                            >
                                <span>🔧 {isEditingPlan ? 'Salir Editor' : 'Editar Plano'}</span>
                            </button>
                        )}

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
                                            resetTransferSelection();
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
                                onEnterEditing={() => { setSelectedTableId(null); setIsEditingPlan(true); }}
                            />
                        </div>

                        {/* Centro Operativo Flotante (Table Card Hub) */}
                        {selectedTableId && (() => {
                            const table = tables.find(t => t.id === selectedTableId);
                            const session = activeSessions.find(s => s.table_id === selectedTableId);
                            if (!table) return null;

                            const isTableAvailable = !session || session.status === 'CLOSED';

                            // ⚠️ Render UNIFICADO (un solo return) para evitar que la TableCard
                            // se desmonte y vuelva a montar al pasar de libre→ocupada (causaba el
                            // flasheo). La TableCard queda SIEMPRE en la misma posición del árbol;
                            // solo cambian los envoltorios (fondo oscuro / botón ✕) según el estado.
                            // - Libre: el contenedor está `hidden` (solo se ve el portal del Wizard de Apertura).
                            // - Ocupada: se muestra el Centro Operativo Flotante con su fondo.
                            return (
                                <div className={isTableAvailable
                                    ? 'hidden'
                                    : 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200'}>
                                    {/* Click fuera para cerrar — agnóstico mouse/táctil. Solo cuando está ocupada. */}
                                    {!isTableAvailable && (
                                        <div
                                            className="absolute inset-0"
                                            {...tableBackdropClose}
                                        />
                                    )}

                                    {/* Contenedor de la Tarjeta — posición ESTABLE en ambos estados */}
                                    <div className={isTableAvailable ? '' : 'relative w-full max-w-sm z-10 animate-in zoom-in-95 duration-200'}>
                                        {!isTableAvailable && (
                                            <button
                                                onClick={() => setSelectedTableId(null)}
                                                className="absolute -top-3 -right-3 z-30 w-8 h-8 rounded-full bg-slate-900 hover:bg-slate-800 text-white flex items-center justify-center shadow-lg border border-slate-700/50 active:scale-95 transition-all text-sm font-bold animate-in zoom-in duration-300"
                                            >
                                                ✕
                                            </button>
                                        )}
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

                // ── Detección de cruce de tipo (Pool ↔ Normal) ──
                const sourceType = sourceTable.type || 'POOL';
                const targetType = transferTargetTable.type || 'POOL';
                const isCrossType = sourceType !== targetType;
                const isPoolToNormal = sourceType === 'POOL' && targetType === 'NORMAL';
                const isNormalToPool = sourceType === 'NORMAL' && targetType === 'POOL';
                const hasManualSeatCharges = hasSeatTimeCharges(sourceSession);
                const requiresPoolMode = isNormalToPool && !isTargetOccupied;
                const requiresSeatPolicy = isNormalToPool && hasManualSeatCharges;
                const selectedModeLabel = poolTransferMode === POOL_TRANSFER_MODES.FREE
                    ? 'Libre'
                    : poolTransferMode === POOL_TRANSFER_MODES.PREPAID
                        ? `Prepago ${poolTransferHours} h`
                        : poolTransferMode === POOL_TRANSFER_MODES.PINA
                            ? `${poolTransferRounds} jugada${Number(poolTransferRounds) === 1 ? '' : 's'}`
                            : 'Sin seleccionar';
                const transferBlocked = isMutating
                    || (requiresPoolMode && !poolTransferMode)
                    || (requiresSeatPolicy && !seatTimePolicy);

                const st = useTablesStore.getState();
                const sourceOrder = orders.find(order => order.table_session_id === sourceSession.id);
                const sourceItems = sourceOrder
                    ? orderItems.filter(item => item.order_id === sourceOrder.id)
                    : [];
                const sourceElapsed = getSessionElapsedMinutes(sourceSession, st.pausedSessions);
                const sourceHoursOffset = st.paidHoursOffsets?.[sourceSession.id] || 0;
                const sourceRoundsOffset = st.paidRoundsOffsets?.[sourceSession.id] || 0;
                const sourceElapsedOffset = st.paidElapsedOffsets?.[sourceSession.id] || 0;
                const frozen = sourceType === 'POOL' && (isPoolToNormal || isTargetOccupied)
                    ? buildFrozenTimeCharge(
                        sourceSession,
                        sourceElapsed,
                        st.config,
                        sourceType,
                        sourceHoursOffset,
                        sourceRoundsOffset,
                        transferOperationId,
                        sourceElapsedOffset
                    )
                    : null;
                const frozenTimeTotal = frozen?.total || 0;
                const poolToNormalPreview = isPoolToNormal
                    ? buildPoolToNormalPreview({
                        session: sourceSession,
                        elapsedMinutes: sourceElapsed,
                        config: st.config,
                        orderItems: sourceItems,
                        hasOrder: Boolean(sourceOrder),
                        hoursOffset: sourceHoursOffset,
                        roundsOffset: sourceRoundsOffset,
                        elapsedOffset: sourceElapsedOffset,
                    })
                    : null;
                const transferOrderBreakdown = calculateTransferOrderBreakdown(sourceItems);
                const fmtMoney = (n) => `$${Number(n || 0).toLocaleString('es-CO')}`;

                return (
                    <Modal 
                        isOpen={!!transferTargetTable} 
                        onClose={resetTransferSelection}
                        title={isTargetOccupied ? "Confirmar Fusión de Cuentas" : "Confirmar Transferencia de Mesa"}
                        maxWidthClass="max-w-md sm:max-w-lg"
                        className="max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-2rem)]"
                        bodyClassName="max-h-[calc(100dvh-4.5rem)] overflow-y-auto overscroll-contain custom-scrollbar p-3 sm:p-5 pb-4 sm:pb-5"
                    >
                        <div className="flex flex-col gap-2.5">
                            {/* Visual Flow Diagram */}
                            <div className="bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800 p-3 sm:p-4 rounded-2xl flex items-center justify-between gap-1 text-center relative overflow-hidden">
                                <div className="min-w-0 flex-1">
                                    <span className="text-[10px] text-slate-400 font-bold block uppercase">Origen</span>
                                    <span className="block truncate text-base font-black text-slate-800 dark:text-white mt-0.5">{sourceTable.name}</span>
                                    <span className="text-[10px] text-amber-500 font-extrabold bg-amber-500/10 px-2 py-0.5 rounded-full inline-block mt-1">Ocupada</span>
                                </div>
                                
                                <div className="flex shrink-0 flex-col items-center justify-center px-1.5 sm:px-2">
                                    <span className="text-[9px] text-slate-400 font-black uppercase tracking-wider">
                                        {isTargetOccupied ? "FUSIONAR" : "MOVER"}
                                    </span>
                                    <div className="w-8 h-8 bg-amber-500/10 rounded-full flex items-center justify-center text-amber-500 mt-1">
                                        <ArrowRight size={16} />
                                    </div>
                                </div>

                                <div className="min-w-0 flex-1">
                                    <span className="text-[10px] text-slate-400 font-bold block uppercase">Destino</span>
                                    <span className="block truncate text-base font-black text-slate-800 dark:text-white mt-0.5">{transferTargetTable.name}</span>
                                    <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full inline-block mt-1 ${
                                        isTargetOccupied 
                                            ? 'text-amber-500 bg-amber-500/10' 
                                            : 'text-emerald-500 bg-emerald-500/10'
                                    }`}>
                                        {isTargetOccupied ? "Ocupada" : "Libre"}
                                    </span>
                                </div>
                            </div>

                            {(isNormalToPool || (isTargetOccupied && sourceItems.length > 0)) && (
                                <div className="grid grid-cols-2 gap-x-3 gap-y-2 rounded-xl border border-slate-200 bg-white p-3 text-xs dark:border-slate-800 dark:bg-slate-900">
                                    <div>
                                        <span className="block font-bold text-slate-400">Productos conservados</span>
                                        <strong className="text-indigo-600 dark:text-indigo-400">{fmtMoney(transferOrderBreakdown.productConsumptionTotal)}</strong>
                                    </div>
                                    <div>
                                        <span className="block font-bold text-slate-400">Cargos fijos anteriores</span>
                                        <strong className="text-amber-600 dark:text-amber-400">{fmtMoney(transferOrderBreakdown.previousTransferChargesTotal)}</strong>
                                    </div>
                                    <div className="col-span-2 border-t border-slate-100 pt-2 dark:border-slate-800">
                                        <div className="flex items-center justify-between gap-3">
                                            <span className="font-black text-slate-600 dark:text-slate-300">Total conservado</span>
                                            <strong className="text-slate-800 dark:text-white">{fmtMoney(transferOrderBreakdown.totalConserved)}</strong>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {isPoolToNormal && poolToNormalPreview && (
                                <div className="grid grid-cols-2 gap-x-3 gap-y-2 rounded-xl border border-slate-200 bg-white p-3 text-xs dark:border-slate-800 dark:bg-slate-900">
                                    <div className="col-span-2">
                                        <span className="block font-black text-slate-600 dark:text-slate-300">{poolToNormalPreview.pendingChargeLabel}</span>
                                        <strong className="text-slate-800 dark:text-white">{fmtMoney(poolToNormalPreview.frozenTimeTotal)}</strong>
                                    </div>
                                    {poolToNormalPreview.sourceSessionBreakdown.libreCost > 0 && (
                                        <div>
                                            <span className="block font-bold text-slate-400">Tiempo corrido pendiente</span>
                                            <strong className="text-slate-800 dark:text-white">{fmtMoney(poolToNormalPreview.sourceSessionBreakdown.libreCost)}</strong>
                                        </div>
                                    )}
                                    {poolToNormalPreview.sourceSessionBreakdown.hourCost > 0 && (
                                        <div>
                                            <span className="block font-bold text-slate-400">Horas Pool pendientes</span>
                                            <strong className="text-slate-800 dark:text-white">{fmtMoney(poolToNormalPreview.sourceSessionBreakdown.hourCost)}</strong>
                                        </div>
                                    )}
                                    {poolToNormalPreview.sourceSessionBreakdown.pinaCost > 0 && (
                                        <div>
                                            <span className="block font-bold text-slate-400">Jugadas Pool pendientes</span>
                                            <strong className="text-slate-800 dark:text-white">{fmtMoney(poolToNormalPreview.sourceSessionBreakdown.pinaCost)}</strong>
                                        </div>
                                    )}
                                    {poolToNormalPreview.sourceSeatTimeTotal > 0 && (
                                        <div>
                                            <span className="block font-bold text-slate-400">Cargos por asiento pendientes</span>
                                            <strong className="text-slate-800 dark:text-white">{fmtMoney(poolToNormalPreview.sourceSeatTimeTotal)}</strong>
                                        </div>
                                    )}
                                    <div className="border-t border-slate-100 pt-2 dark:border-slate-800">
                                        <span className="block font-bold text-slate-400">Tiempo ya pagado</span>
                                        <strong className="text-emerald-600 dark:text-emerald-400">{fmtMoney(poolToNormalPreview.previouslyPaidTotal)}</strong>
                                    </div>
                                    <div className="border-t border-slate-100 pt-2 dark:border-slate-800">
                                        <span className="block font-black text-amber-600 dark:text-amber-400">Total que se trasladará</span>
                                        <strong className="text-amber-600 dark:text-amber-400">{fmtMoney(poolToNormalPreview.frozenTimeTotal)}</strong>
                                    </div>
                                    <div className="col-span-2 border-t border-slate-100 pt-2 dark:border-slate-800">
                                        <div className="flex items-center justify-between gap-3">
                                            <span className="font-bold text-slate-400">Productos conservados</span>
                                            <strong className="text-indigo-600 dark:text-indigo-400">{fmtMoney(poolToNormalPreview.productConsumptionTotal)}</strong>
                                        </div>
                                        <div className="mt-1 flex items-center justify-between gap-3">
                                            <span className="font-bold text-slate-400">Cargos fijos anteriores</span>
                                            <strong className="text-amber-600 dark:text-amber-400">{fmtMoney(poolToNormalPreview.previousTransferChargesTotal)}</strong>
                                        </div>
                                        <div className="mt-1 flex items-center justify-between gap-3">
                                            <span className="font-bold text-slate-400">Tiempo futuro en Normal</span>
                                            <strong className="text-emerald-600 dark:text-emerald-400">$0</strong>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Aviso de cruce de tipo (Pool ↔ Normal) */}
                            {isCrossType && (
                                <div className="bg-sky-50 border border-sky-200 text-sky-800 p-3 rounded-xl flex items-start gap-2.5 dark:bg-sky-950/20 dark:border-sky-900/30 dark:text-sky-300">
                                    <AlertTriangle className="shrink-0 mt-0.5 text-sky-500" size={18} />
                                    <div>
                                        <h4 className="font-bold text-sm">
                                            {isPoolToNormal ? 'Mesa de Pool → Mesa Normal (Bar)' : 'Mesa Normal (Bar) → Mesa de Pool'}
                                        </h4>
                                        {isPoolToNormal ? (
                                            <p className="text-xs opacity-90 mt-1 leading-relaxed">
                                                El pendiente Pool se convertirá en un cargo fijo
                                                {frozenTimeTotal > 0 ? <> (<strong>{fmtMoney(frozenTimeTotal)}</strong>)</> : ''}.
                                                El tiempo futuro en la mesa Normal no se cobrará.
                                            </p>
                                        ) : isTargetOccupied ? (
                                            <p className="text-xs opacity-90 mt-1 leading-relaxed">
                                                El destino ya tiene una sesión de Pool: no se crea otro reloj ni se cambia su modo.
                                                Solo se incorpora el consumo de la mesa Normal; su tiempo anterior no se cobra como Pool.
                                            </p>
                                        ) : (
                                            <p className="text-xs opacity-90 mt-1 leading-relaxed">
                                                El cronómetro de pool <strong>iniciará desde cero</strong> al mover la mesa.
                                                No se cobrará tiempo por el rato previo en el bar. El consumo actual se conserva.
                                            </p>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Selección obligatoria del nuevo contexto tarifario */}
                            {requiresPoolMode && (
                                <div className="bg-indigo-50 border border-indigo-200 text-indigo-900 p-3 rounded-xl dark:bg-indigo-950/20 dark:border-indigo-900/40 dark:text-indigo-200">
                                    <h4 className="text-sm font-black">
                                        Modo de cobro nuevo en Pool <span className="text-rose-500">*</span>
                                    </h4>
                                    <p className="text-xs opacity-80 mt-1 leading-relaxed">
                                        El tiempo usado en la mesa Normal vale $0 como Pool. Elige cómo comienza el cobro desde ahora.
                                    </p>
                                    <div className="mt-3">
                                        <TransferDropdown
                                            value={poolTransferMode}
                                            placeholder="Selecciona una opción..."
                                            options={[
                                                { value: '', label: 'Selecciona una opción...' },
                                                { value: POOL_TRANSFER_MODES.PREPAID, label: 'Prepago de horas' },
                                                { value: POOL_TRANSFER_MODES.PINA, label: 'Jugada / Piña' },
                                                { value: POOL_TRANSFER_MODES.FREE, label: 'Libre (sin cargo de tiempo)' },
                                            ]}
                                            onChange={setPoolTransferMode}
                                            disabled={isMutating}
                                        />
                                    </div>

                                    {poolTransferMode === POOL_TRANSFER_MODES.PREPAID && (
                                        <div className="mt-2">
                                            <TransferDropdown
                                                label="Cantidad prepagada"
                                                value={poolTransferHours}
                                                placeholder="Selecciona la cantidad..."
                                                options={[
                                                    { value: '0.5', label: '30 minutos' },
                                                    { value: '1', label: '1 hora' },
                                                    { value: '1.5', label: '1 hora 30 minutos' },
                                                    { value: '2', label: '2 horas' },
                                                    { value: '3', label: '3 horas' },
                                                ]}
                                                onChange={setPoolTransferHours}
                                                disabled={isMutating}
                                            />
                                        </div>
                                    )}

                                    {poolTransferMode === POOL_TRANSFER_MODES.PINA && (
                                        <div className="mt-2">
                                            <TransferDropdown
                                                label="Jugadas nuevas"
                                                value={poolTransferRounds}
                                                placeholder="Selecciona la cantidad..."
                                                options={[
                                                    { value: '1', label: '1 jugada' },
                                                    { value: '2', label: '2 jugadas' },
                                                    { value: '3', label: '3 jugadas' },
                                                    { value: '4', label: '4 jugadas' },
                                                ]}
                                                onChange={setPoolTransferRounds}
                                                disabled={isMutating}
                                            />
                                        </div>
                                    )}

                                    <p className="text-[11px] font-black mt-3 text-indigo-700 dark:text-indigo-300">
                                        Nuevo contexto: {selectedModeLabel}. Inicio: ahora, después de confirmar.
                                    </p>
                                </div>
                            )}

                            {/* Guardarraíl para cargos manuales heredados */}
                            {requiresSeatPolicy && (
                                <div className="bg-rose-50 border border-rose-200 text-rose-900 p-3 rounded-xl dark:bg-rose-950/20 dark:border-rose-900/40 dark:text-rose-200">
                                    <h4 className="font-black text-sm">Cargos manuales por asiento detectados</h4>
                                    <p className="text-xs opacity-90 mt-1 leading-relaxed">
                                        Una mesa Normal normalmente no factura tiempo por cliente. Debes decidir explícitamente si estos cargos siguen siendo válidos en Pool.
                                    </p>
                                    <div className="grid gap-2 mt-3">
                                        <label className="flex items-start gap-2 rounded-lg border border-rose-200 dark:border-rose-900/50 bg-white/70 dark:bg-slate-900/50 p-2 cursor-pointer">
                                            <input
                                                type="radio"
                                                name="seat-time-policy"
                                                value={SEAT_TIME_POLICIES.KEEP}
                                                checked={seatTimePolicy === SEAT_TIME_POLICIES.KEEP}
                                                onChange={(event) => setSeatTimePolicy(event.target.value)}
                                                disabled={isMutating}
                                                className="mt-0.5"
                                            />
                                            <span className="text-xs font-bold">Conservarlos como cargos válidos en Pool</span>
                                        </label>
                                        <label className="flex items-start gap-2 rounded-lg border border-rose-200 dark:border-rose-900/50 bg-white/70 dark:bg-slate-900/50 p-2 cursor-pointer">
                                            <input
                                                type="radio"
                                                name="seat-time-policy"
                                                value={SEAT_TIME_POLICIES.CLEAR}
                                                checked={seatTimePolicy === SEAT_TIME_POLICIES.CLEAR}
                                                onChange={(event) => setSeatTimePolicy(event.target.value)}
                                                disabled={isMutating}
                                                className="mt-0.5"
                                            />
                                            <span className="text-xs font-bold">Limpiarlos (recomendado si se originaron en Normal)</span>
                                        </label>
                                    </div>
                                </div>
                            )}

                            {/* Warning/Info Box */}
                            {isTargetOccupied ? (
                                <div className="bg-amber-50 border border-amber-200 text-amber-800 p-3 rounded-xl flex items-start gap-2.5 dark:bg-amber-950/20 dark:border-amber-900/30 dark:text-amber-300">
                                    <AlertTriangle className="shrink-0 mt-0.5 text-amber-500" size={17} />
                                    <div>
                                        <h4 className="font-bold text-sm">Fusión de Cuentas (Destino Ocupada)</h4>
                                        <p className="text-xs opacity-90 mt-1 leading-relaxed">
                                            Se sumará el consumo de <strong>{sourceTable.name}</strong> a la comanda activa de <strong>{transferTargetTable.name}</strong>.
                                        </p>
                                        {frozenTimeTotal > 0 && (
                                            <p className="text-xs opacity-90 mt-1 leading-relaxed">
                                                Tiempo jugado como cargo fijo: <strong>{fmtMoney(frozenTimeTotal)}</strong>.
                                            </p>
                                        )}
                                        <p className="text-xs opacity-90 mt-1 font-bold leading-relaxed">
                                            La sesión original quedará LIBRE.
                                        </p>
                                    </div>
                                </div>
                            ) : !isCrossType ? (
                                <div className="bg-amber-50 border border-amber-200 text-amber-800 p-3 rounded-xl flex items-start gap-2.5 dark:bg-amber-950/20 dark:border-amber-900/30 dark:text-amber-300">
                                    <ArrowRight className="shrink-0 mt-0.5 text-amber-500" size={17} />
                                    <div>
                                        <h4 className="font-bold text-sm">Transferencia Completa (Destino Libre)</h4>
                                        <p className="text-xs opacity-90 mt-1 leading-relaxed">
                                            Se moverá la sesión completa de <strong>{sourceTable.name}</strong> a <strong>{transferTargetTable.name}</strong>.
                                        </p>
                                        <ul className="text-xs opacity-90 mt-1 list-disc pl-4 space-y-0.5">
                                            <li>Se conservarán cliente, notas y comanda.</li>
                                            <li>La mesa {sourceTable.name} quedará LIBRE.</li>
                                        </ul>
                                    </div>
                                </div>
                            ) : null}

                            {/* Buttons */}
                            <div className="grid grid-cols-2 gap-3 mt-2">
                                <button
                                    type="button"
                                    onClick={resetTransferSelection}
                                    className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-550 dark:text-slate-400 font-bold hover:bg-slate-50 dark:hover:bg-slate-950/50 transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="button"
                                    disabled={transferBlocked}
                                    onClick={handleConfirmTransfer}
                                    className={`px-4 py-2.5 rounded-xl text-white font-black transition-all active:scale-95 shadow-md flex items-center justify-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-50 ${
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
