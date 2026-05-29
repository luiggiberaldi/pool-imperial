/**
 * FloorPlanView.jsx — Pool Imperial · Fase 1.1
 * ─────────────────────────────────────────────
 * Plano interactivo del local. Vista alternativa a la cuadrícula de mesas.
 *
 * ARQUITECTURA
 * ────────────
 * - Desacoplado de la lógica de negocio: solo lee `tables` y `activeSessions`.
 * - Cada tipo de elemento tiene su propio componente visual autónomo.
 * - `onTableSelect(table, session)` es el único punto de salida hacia el negocio.
 * - La integración con billing, comandas y panel operativo viene en Fase 2.
 *
 * PREPARADO PARA FASE 2
 * ──────────────────────
 * - Cada elemento interactivo recibe `table` y `session` completas.
 * - `onTableSelect` puede reemplazarse por un panel contextual lateral sin
 *   modificar la estructura del canvas.
 * - Los tipos de elemento están separados y son fácilmente extendibles.
 */

import React, { useMemo, useState, useEffect } from 'react';
import { useTablesStore } from '../../hooks/store/useTablesStore';
import { FLOOR_ITEMS } from '../../data/floorPlanData';
import { calculateElapsedTime } from '../../utils/tableBillingEngine';

// ═══════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════

function fmtTimer(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return h > 0
        ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
        : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Resuelve un FloorItem → mesa del store por nombre. */
function resolveTable(item, tables) {
    if (!item.refName) return null;
    return tables.find(t => t.name === item.refName) ?? null;
}

/** Devuelve el estado semántico de una sesión: 'free' | 'occupied' | 'checkout' | 'exceeded' */
function statusOf(session) {
    if (!session) return 'free';
    if (session.status === 'CHECKOUT') return 'checkout';
    
    // Validar si es un prepago excedido en tiempo real
    if (session.game_mode === 'NORMAL' && session.hours_paid > 0) {
        const started = new Date(session.started_at).getTime();
        const now = Date.now();
        const elapsedMinutes = (now - started) / 60000;
        const limitMinutes = session.hours_paid * 60;
        if (elapsedMinutes > limitMinutes) {
            return 'exceeded';
        }
    }
    
    return 'occupied';
}

// ═══════════════════════════════════════════════════════
// SUBCOMPONENTES UTILITARIOS
// ═══════════════════════════════════════════════════════

/** Timer en vivo que actualiza cada segundo. */
function LiveTimer({ startedAt, className = '' }) {
    const [elapsed, setElapsed] = useState(() => calculateElapsedTime(startedAt));
    useEffect(() => {
        const iv = setInterval(() => setElapsed(calculateElapsedTime(startedAt)), 1000);
        return () => clearInterval(iv);
    }, [startedAt]);
    return <span className={className}>{fmtTimer(elapsed)}</span>;
}

/** Punto de estado plano y discreto. */
function StatusDot({ status }) {
    if (status === 'free') return null;
    return (
        <span
            className={`absolute top-[8%] right-[8%] w-2.5 h-2.5 rounded-full z-20 border border-white
                ${status === 'checkout' 
                    ? 'bg-amber-500 animate-pulse' 
                    : status === 'exceeded'
                        ? 'bg-rose-500'
                        : 'bg-emerald-500'}`}
        />
    );
}

// ═══════════════════════════════════════════════════════
// ELEMENTOS DE PLANO — cada uno con identidad visual propia
// ═══════════════════════════════════════════════════════

/**
 * PoolTableEl — Mesa de billar.
 * Render: fieltro verde plano, riel de madera sólida mate y borde de destaque según estado.
 */
function PoolTableEl({ item, session, onClick, isSelected }) {
    const st = statusOf(session);
    const isPortrait = item.h > item.w;

    // Colores planos de fieltro según estado
    const feltBg = st === 'free'
        ? '#2d6a4f' // Verde plano libre
        : st === 'checkout'
            ? '#d97706' // Ámbar/Naranja cobro
            : st === 'exceeded'
                ? '#991b1b' // Rojo vino para tiempo excedido
                : '#1a7a4a'; // Verde ocupado plano

    const railColor = '#5c4d43'; // Riel marrón mate
    
    // Si está ocupada o por cobrar, añadimos un borde de destaque claro
    const isOccupied = st === 'occupied';
    const borderStyle = isOccupied 
        ? '3.5px solid #3b82f6' 
        : st === 'checkout'
            ? '3.5px dashed #f59e0b'
            : st === 'exceeded'
                ? '3.5px dashed #ef4444'
                : '2.5px solid #4b5563'; // Borde plano gris

    return (
        <button
            onClick={onClick}
            style={{
                position: 'absolute',
                left: `${item.x}%`, top: `${item.y}%`,
                width: `${item.w}%`, height: `${item.h}%`,
                background: railColor,
                border: borderStyle,
                borderRadius: '6px',
                outline: isSelected ? '3px solid #f97316' : undefined,
                outlineOffset: '2px',
                zIndex: isSelected ? 30 : undefined,
            }}
            className={`group transition-all duration-150 active:scale-[0.98] cursor-pointer overflow-hidden flex items-center justify-center ${st === 'checkout' ? 'checkout-pulsing' : ''}`}
            title={item.label}
        >
            {/* Superficie interna de fieltro plano */}
            <div
                className="w-[86%] h-[86%] flex flex-col items-center justify-center relative rounded-[3px]"
                style={{ background: feltBg }}
            >
                {/* Línea central técnica del campo */}
                <div
                    className="absolute opacity-10 bg-white"
                    style={isPortrait
                        ? { top: '50%', left: '5%', right: '5%', height: '1px' }
                        : { left: '50%', top: '5%', bottom: '5%', width: '1px' }
                    }
                />

                {/* Contenido: etiqueta + timer + cliente */}
                <div
                    className="relative z-10 flex flex-col items-center gap-0.5 px-1 text-center"
                    style={{ writingMode: isPortrait && item.h > 28 ? 'vertical-rl' : 'horizontal-tb' }}
                >
                    <span className="font-bold text-white leading-none text-[10px] sm:text-[11px] tracking-wide">
                        {item.label}
                    </span>
                    {(st === 'occupied' || st === 'exceeded') && session?.started_at && (
                        <LiveTimer
                            startedAt={session.started_at}
                            className="font-mono font-bold text-white/95 text-[8px] sm:text-[10px]"
                        />
                    )}
                    {(st === 'occupied' || st === 'exceeded') && session?.client_name && (
                        <span className="text-white/90 text-[7.5px] truncate max-w-full font-medium">{session.client_name}</span>
                    )}
                    {st === 'checkout' && (
                        <span className="font-extrabold text-white text-[7.5px] sm:text-[8px] uppercase tracking-wider">
                            COBRAR
                        </span>
                    )}
                    {st === 'exceeded' && (
                        <span className="font-extrabold text-white text-[7.5px] sm:text-[8px] uppercase tracking-wider animate-pulse">
                            EXCEDIDO
                        </span>
                    )}
                    {st === 'free' && (

                        <span className="text-white/35 text-[7px] uppercase tracking-wider font-semibold">libre</span>
                    )}
                </div>
            </div>

            {/* Punto de estado discreto */}
            <StatusDot status={st} />
        </button>
    );
}

/**
 * DiningTableEl — Mesa comedor/social (M1, M2, M3).
 * Render top-view: 4 sillas simplificadas en los costados + superficie de mesa plana.
 */
function DiningTableEl({ item, session, onClick, isSelected }) {
    const st = statusOf(session);

    const colors = {
        free:     { table: '#e2e8f0', chair: '#cbd5e1', border: '#94a3b8', text: '#475569' },
        occupied: { table: '#dbeafe', chair: '#93c5fd', border: '#3b82f6', text: '#1e40af' },
        checkout: { table: '#fef3c7', chair: '#fde68a', border: '#f59e0b', text: '#78350f' },
        exceeded: { table: '#fee2e2', chair: '#fca5a5', border: '#ef4444', text: '#991b1b' },
    }[st];

    const chairs = [
        { key: 'n', style: { top: 0, left: '25%', width: '50%', height: '14%', borderRadius: '2px' } },
        { key: 's', style: { bottom: 0, left: '25%', width: '50%', height: '14%', borderRadius: '2px' } },
        { key: 'w', style: { left: 0, top: '25%', width: '14%', height: '50%', borderRadius: '2px' } },
        { key: 'e', style: { right: 0, top: '25%', width: '14%', height: '50%', borderRadius: '2px' } },
    ];

    return (
        <button
            onClick={onClick}
            style={{
                position: 'absolute',
                left: `${item.x}%`, top: `${item.y}%`,
                width: `${item.w}%`, height: `${item.h}%`,
                outline: isSelected ? '3px solid #f97316' : undefined,
                outlineOffset: '2px',
                zIndex: isSelected ? 30 : undefined,
            }}
            className={`group transition-all duration-150 active:scale-[0.98] cursor-pointer ${st === 'checkout' ? 'checkout-pulsing' : ''}`}
            title={item.label}
        >
            {/* Sillas */}
            {chairs.map(({ key, style }) => (
                <div
                    key={key}
                    className="absolute"
                    style={{
                        ...style,
                        background: colors.chair,
                        border: `1px solid ${colors.border}`,
                    }}
                />
            ))}

            {/* Superficie de la mesa */}
            <div
                className="absolute flex flex-col items-center justify-center rounded"
                style={{
                    inset: '16%',
                    background: colors.table,
                    border: `2px solid ${colors.border}`,
                }}
            >
                <span className="font-bold text-[9px] sm:text-[10px] leading-none text-center" style={{ color: colors.text }}>
                    {item.label}
                </span>
                {(st === 'occupied' || st === 'exceeded') && session?.client_name && (
                    <span className="text-[7px] truncate max-w-full px-0.5 mt-0.5 font-medium" style={{ color: colors.text }}>
                        {session.client_name}
                    </span>
                )}
                {st === 'checkout' && (
                    <span className="text-[7.5px] font-extrabold uppercase mt-0.5" style={{ color: colors.text }}>COBRAR</span>
                )}
                {st === 'exceeded' && (
                    <span className="text-[7px] font-extrabold uppercase mt-0.5 animate-pulse" style={{ color: colors.text }}>EXCEDIDO</span>
                )}
            </div>

            {/* Punto de estado */}
            <StatusDot status={st} />
        </button>
    );
}

/**
 * RoundStoolEl — Taburete alto redondo (M4-M11).
 * Render: círculo plano sin gradientes con etiqueta. Enforce aspect-ratio to keep it a perfect circle.
 */
function RoundStoolEl({ item, session, onClick, isSelected }) {
    const st = statusOf(session);

    const style = {
        free:     { bg: '#8b9aaa', border: '#475569', text: '#ffffff' },
        occupied: { bg: '#3b82f6', border: '#1d4ed8', text: '#ffffff' },
        checkout: { bg: '#f59e0b', border: '#b45309', text: '#ffffff' },
        exceeded: { bg: '#ef4444', border: '#b91c1c', text: '#ffffff' },
    }[st];

    return (
        <button
            onClick={onClick}
            style={{
                position: 'absolute',
                left: `${item.x}%`, top: `${item.y}%`,
                width: `${item.w}%`, height: `${item.h}%`,
                outline: isSelected ? '3px solid #f97316' : undefined,
                outlineOffset: '2px',
                zIndex: isSelected ? 30 : undefined,
            }}
            className={`group flex items-center justify-center transition-all duration-150 active:scale-[0.98] cursor-pointer ${st === 'checkout' ? 'checkout-pulsing' : ''}`}
            title={item.label}
        >
            <div
                className="rounded-full flex items-center justify-center border-2 font-bold shadow-sm relative"
                style={{
                    height: '100%',
                    aspectRatio: '1/1',
                    background: style.bg,
                    borderColor: style.border,
                    color: style.text,
                }}
            >
                <span
                    className="leading-none text-center"
                    style={{
                        fontSize: item.label.length > 2 ? '7.5px' : '9px',
                    }}
                >
                    {item.label}
                </span>
                <StatusDot status={st} />
            </div>
        </button>
    );
}

/**
 * BarStoolEl — Taburete de barra (B1-B15).
 * Render: círculo compacto plano con etiqueta. Enforce aspect-ratio to keep it a perfect circle.
 */
function BarStoolEl({ item, session, onClick, isSelected }) {
    const st = statusOf(session);

    const style = {
        free:     { bg: '#8b9aaa', border: '#475569', text: '#ffffff' },
        occupied: { bg: '#3b82f6', border: '#1d4ed8', text: '#ffffff' },
        checkout: { bg: '#f59e0b', border: '#b45309', text: '#ffffff' },
        exceeded: { bg: '#ef4444', border: '#b91c1c', text: '#ffffff' },
    }[st];

    return (
        <button
            onClick={onClick}
            style={{
                position: 'absolute',
                left: `${item.x}%`, top: `${item.y}%`,
                width: `${item.w}%`, height: `${item.h}%`,
                outline: isSelected ? '3px solid #f97316' : undefined,
                outlineOffset: '2px',
                zIndex: isSelected ? 30 : undefined,
            }}
            className={`group flex items-center justify-center transition-all duration-150 active:scale-[0.98] cursor-pointer ${st === 'checkout' ? 'checkout-pulsing' : ''}`}
            title={item.label}
        >
            <div
                className="rounded-full flex items-center justify-center border font-bold relative"
                style={{
                    height: '85%',
                    aspectRatio: '1/1',
                    background: style.bg,
                    borderColor: style.border,
                    color: style.text,
                }}
            >
                <span
                    className="leading-none text-center"
                    style={{
                        fontSize: item.label.length > 2 ? '6px' : '7.5px',
                    }}
                >
                    {item.label}
                </span>
                <StatusDot status={st} />
            </div>
        </button>
    );
}

/**
 * BarCounterEl — Mostrador de barra (Barra 1 y Barra 2).
 * Render: bloque plano y sólido sin gradientes ni vetas.
 */
function BarCounterEl({ item }) {
    const isVertical = item.h > item.w * 1.5;

    return (
        <div
            style={{
                position: 'absolute',
                left: `${item.x}%`, top: `${item.y}%`,
                width: `${item.w}%`, height: `${item.h}%`,
                background: '#475569',
                border: '2px solid #334155',
                borderRadius: '4px',
            }}
            className="overflow-hidden flex items-center justify-center"
        >
            {/* Etiqueta */}
            {item.label && (
                <span
                    className="font-bold uppercase tracking-wider select-none text-[8.5px] sm:text-[9.5px] text-white/50"
                    style={{
                        writingMode: isVertical ? 'vertical-rl' : 'horizontal-tb',
                        textOrientation: 'mixed',
                        transform: isVertical ? 'rotate(180deg)' : undefined,
                    }}
                >
                    {item.label}
                </span>
            )}
        </div>
    );
}

/**
 * EntryEl — Marcador de entrada al local.
 * Render: bloque limpio y técnico de entrada.
 */
function EntryEl({ item }) {
    return (
        <div
            style={{
                position: 'absolute',
                left: `${item.x}%`, top: `${item.y}%`,
                width: `${item.w}%`, height: `${item.h}%`,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
                borderRadius: '0 4px 4px 0',
                background: '#cbd5e1',
                border: '1.5px solid #94a3b8',
                borderLeft: 'none',
            }}
        >
            {/* Flecha de entrada */}
            <div className="flex items-center gap-0.5">
                <div style={{ width: 6, height: 1.5, background: '#475569', borderRadius: 1 }} />
                <div style={{
                    width: 0, height: 0,
                    borderTop: '3px solid transparent',
                    borderBottom: '3px solid transparent',
                    borderLeft: '4px solid #475569',
                }} />
            </div>
            {/* Texto vertical */}
            <span
                className="font-bold uppercase select-none text-[7.5px] text-[#475569] tracking-wider"
                style={{
                    writingMode: 'vertical-rl',
                }}
            >
                Entrada
            </span>
        </div>
    );
}

/**
 * LogoEl — Área de marca central simplificada.
 */
function LogoEl({ item }) {
    return (
        <div
            style={{
                position: 'absolute',
                left: `${item.x}%`, top: `${item.y}%`,
                width: `${item.w}%`, height: `${item.h}%`,
            }}
            className="flex items-center justify-center select-none pointer-events-none"
        >
            <img 
                src="/logo.png" 
                alt="Pool Imperial" 
                className="h-full object-contain select-none pointer-events-none"
            />
        </div>
    );
}

// ═══════════════════════════════════════════════════════
// ZONA BACKGROUNDS — dummy (eliminada la representación visual)
// ═══════════════════════════════════════════════════════

function ZoneBackgrounds() {
    return null;
}

// ═══════════════════════════════════════════════════════
// LEYENDA
// ═══════════════════════════════════════════════════════

function Legend() {
    return (
        <div className="flex items-center gap-4 flex-wrap select-none">
            {[
                { bg: '#8b9aaa', border: '#475569', label: 'Stool Libre' },
                { bg: '#2d6a4f', border: '#4b5563', label: 'Pool Libre' },
                { bg: '#3b82f6', border: '#1d4ed8', label: 'Ocupada' },
                { bg: '#f59e0b', border: '#b45309', label: 'Por cobrar' },
            ].map(({ bg, border, label }) => (
                <div key={label} className="flex items-center gap-1.5">
                    <div className="w-3.5 h-3.5 rounded" style={{ background: bg, border: `1.5px solid ${border}` }} />
                    <span className="text-[11px] font-semibold text-slate-600">{label}</span>
                </div>
            ))}
        </div>
    );
}

// ═══════════════════════════════════════════════════════
// MAIN: FloorPlanView
// ═══════════════════════════════════════════════════════

export default function FloorPlanView({ onTableSelect, selectedTableId }) {
    const { tables, activeSessions } = useTablesStore();

    // Resuelve cada FloorItem con su mesa y sesión correspondientes
    const resolvedItems = useMemo(() => {
        return FLOOR_ITEMS.map(item => {
            const table = item.interactive ? resolveTable(item, tables) : null;
            const session = table ? activeSessions.find(s => s.table_id === table.id) : null;
            return { item, table, session };
        });
    }, [tables, activeSessions]);

    // Estadísticas del encabezado
    const stats = useMemo(() => {
        const interactive = resolvedItems.filter(r => r.item.interactive && r.table);
        const occupied    = interactive.filter(r => !!r.session);
        const checkout    = occupied.filter(r => r.session?.status === 'CHECKOUT');
        const pool        = resolvedItems.filter(r => r.item.type === 'pool_table');
        return {
            total:        interactive.length,
            occupied:     occupied.length,
            checkout:     checkout.length,
            totalPool:    pool.length,
            occupiedPool: pool.filter(r => !!r.session).length,
        };
    }, [resolvedItems]);

    const handleClick = (table, session) => {
        if (table) onTableSelect?.(table, session);
    };

    /** Renderiza el elemento correcto según tipo. */
    const renderItem = ({ item, table, session }) => {
        const key   = item.id;
        const click = { onClick: () => handleClick(table, session) };
        const isSelected = table && selectedTableId === table.id;

        switch (item.type) {
            case 'pool_table':
                return <PoolTableEl   key={key} item={item} session={session} isSelected={isSelected} {...click} />;
            case 'dining_table':
                return <DiningTableEl key={key} item={item} session={session} isSelected={isSelected} {...click} />;
            case 'round_stool':
            case 'bar_table':   // compat retroactiva con tipo anterior
                return <RoundStoolEl  key={key} item={item} session={session} isSelected={isSelected} {...click} />;
            case 'bar_stool':
                return <BarStoolEl    key={key} item={item} session={session} isSelected={isSelected} {...click} />;
            case 'bar_counter':
                return <BarCounterEl  key={key} item={item} />;
            case 'entry':
                return <EntryEl       key={key} item={item} />;
            case 'logo':
                return <LogoEl        key={key} item={item} />;
            default:
                return null;
        }
    };

    return (
        <div className="flex flex-col h-full bg-[#f4f3f0]">

            {/* ── Barra de estadísticas ── */}
            <div className="flex items-center gap-4 px-4 py-2.5 border-b border-slate-200 bg-white flex-shrink-0 flex-wrap">
                <div className="flex items-center gap-2 bg-slate-50 px-2 py-1 rounded border border-slate-100 select-none">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                    <span className="text-xs font-bold text-slate-700">
                        {stats.occupied}/{stats.total} ocupadas
                    </span>
                </div>
                <div className="flex items-center gap-2 bg-slate-50 px-2 py-1 rounded border border-slate-100 select-none">
                    <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                    <span className="text-xs font-bold text-slate-700">
                        Billar: {stats.occupiedPool}/{stats.totalPool}
                    </span>
                </div>
                {stats.checkout > 0 && (
                    <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 px-2 py-1 rounded animate-pulse select-none">
                        <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                        <span className="text-xs font-black text-amber-700">
                            {stats.checkout} por cobrar
                        </span>
                    </div>
                )}
                <div className="ml-auto">
                    <Legend />
                </div>
            </div>

            {/* ── Canvas del plano (Fase 2C: Responsividad Universal) ── */}
            <div className="flex-1 overflow-auto p-3 sm:p-4 flex items-start lg:items-center justify-start lg:justify-center bg-[#f4f3f0] w-full">
                <style dangerouslySetInnerHTML={{__html: `
                    .floor-plan-canvas {
                        width: 100%;
                        min-width: 1000px;
                        aspect-ratio: 16/9;
                        position: relative;
                        background: #faf9f6;
                        border: 2px solid #cbd5e1;
                        border-radius: 0.75rem;
                        overflow: hidden;
                        box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06);
                        flex-shrink: 0;
                    }
                    @media (min-width: 1024px) {
                        .floor-plan-canvas {
                            min-width: 0px;
                            max-height: calc(100vh - 210px);
                        }
                    }
                    @keyframes pulseBorder {
                        0% {
                            border-color: #f59e0b !important;
                            box-shadow: 0 0 4px #f59e0b, inset 0 0 4px #f59e0b !important;
                        }
                        100% {
                            border-color: #ef4444 !important;
                            box-shadow: 0 0 16px #ef4444, inset 0 0 10px #ef4444 !important;
                        }
                    }
                    .checkout-pulsing {
                        animation: pulseBorder 1.2s infinite alternate !important;
                    }
                `}} />
                <div className="floor-plan-canvas">
                    {/* Cuadrícula sutil */}
                    <div
                        className="absolute inset-0 opacity-[0.03]"
                        style={{
                            backgroundImage: `
                                linear-gradient(to right, #000 1px, transparent 1px),
                                linear-gradient(to bottom, #000 1px, transparent 1px)
                            `,
                            backgroundSize: '40px 40px',
                        }}
                    />

                    {/* Todos los elementos del plano */}
                    {resolvedItems.map(renderItem)}
                </div>
            </div>

            {/* Indicación de uso */}
            <p className="text-center text-[10px] text-slate-500 pb-2.5 select-none flex-shrink-0 bg-[#f4f3f0]">
                Toca una mesa para gestionar · Pool Imperial
            </p>

        </div>
    );
}
