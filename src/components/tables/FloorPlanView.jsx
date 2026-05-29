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

/** Devuelve el estado semántico de una sesión: 'free' | 'occupied' | 'checkout' */
function statusOf(session) {
    if (!session) return 'free';
    if (session.status === 'CHECKOUT') return 'checkout';
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

/** Punto pulsante de estado en la esquina superior derecha del elemento. */
function StatusDot({ status }) {
    if (status === 'free') return null;
    return (
        <span
            className={`absolute top-[6%] right-[6%] w-2 h-2 rounded-full z-20
                ${status === 'checkout' ? 'bg-amber-400 animate-ping' : 'bg-emerald-400 animate-pulse'}`}
        />
    );
}

// ═══════════════════════════════════════════════════════
// ELEMENTOS DE PLANO — cada uno con identidad visual propia
// ═══════════════════════════════════════════════════════

/**
 * PoolTableEl — Mesa de billar.
 * Render: riel de madera > fieltro > líneas de textura > bolsillos > etiqueta + estado.
 * Los bolsillos se adaptan según orientación (portrait vs landscape).
 */
function PoolTableEl({ item, session, onClick }) {
    const st = statusOf(session);
    const isPortrait = item.h > item.w;

    // Colores del fieltro según estado
    const feltGradient = st === 'free'
        ? 'linear-gradient(160deg, #1a5c33 0%, #0e3b20 100%)'
        : st === 'checkout'
            ? 'linear-gradient(160deg, #92400e 0%, #78350f 100%)'
            : 'linear-gradient(160deg, #15803d 0%, #166534 100%)';

    // Sombra exterior según estado
    const shadow = st === 'occupied'
        ? '0 0 18px rgba(34,197,94,0.28), 0 4px 12px rgba(0,0,0,0.5)'
        : st === 'checkout'
            ? '0 0 18px rgba(245,158,11,0.4), 0 4px 12px rgba(0,0,0,0.5)'
            : '0 4px 12px rgba(0,0,0,0.5)';

    // Posiciones de los 6 bolsillos: 4 esquinas + 2 centrales (en el lado largo)
    const pocketBase = {
        position: 'absolute',
        width: 8, height: 8,
        borderRadius: '50%',
        background: '#050505',
        border: '1.5px solid #3d2210',
        zIndex: 15,
    };
    const cornerPockets = [
        { top: -4, left: -4 }, { top: -4, right: -4 },
        { bottom: -4, left: -4 }, { bottom: -4, right: -4 },
    ];
    const midPockets = isPortrait
        ? [{ top: 'calc(50% - 4px)', left: -4 }, { top: 'calc(50% - 4px)', right: -4 }]
        : [{ left: 'calc(50% - 4px)', top: -4 }, { left: 'calc(50% - 4px)', bottom: -4 }];

    return (
        <button
            onClick={onClick}
            style={{
                position: 'absolute',
                left: `${item.x}%`, top: `${item.y}%`,
                width: `${item.w}%`, height: `${item.h}%`,
                boxShadow: shadow,
            }}
            className="group transition-all duration-200 active:scale-95 cursor-pointer rounded-xl overflow-visible"
            title={item.label}
        >
            {/* Riel de madera (capa exterior) */}
            <div
                className="absolute inset-0 rounded-xl"
                style={{ background: 'linear-gradient(145deg, #7c4519 0%, #4a2610 50%, #5c321a 100%)' }}
            />

            {/* Superficie de fieltro (inset del riel) */}
            <div
                className="absolute rounded-lg overflow-hidden flex flex-col items-center justify-center"
                style={{ inset: '9%', background: feltGradient }}
            >
                {/* Textura de tela del fieltro */}
                <div
                    className="absolute inset-0 opacity-[0.06]"
                    style={{ backgroundImage: 'repeating-linear-gradient(0deg, rgba(255,255,255,0.8) 0px, rgba(255,255,255,0.8) 1px, transparent 1px, transparent 5px)' }}
                />

                {/* Línea central del campo */}
                <div
                    className="absolute opacity-10 bg-white/20"
                    style={isPortrait
                        ? { top: '50%', left: '10%', right: '10%', height: 1, transform: 'translateY(-50%)' }
                        : { left: '50%', top: '10%', bottom: '10%', width: 1, transform: 'translateX(-50%)' }
                    }
                />

                {/* Contenido: etiqueta + timer + cliente */}
                <div
                    className="relative z-10 flex flex-col items-center gap-0.5 px-1 text-center"
                    style={{ writingMode: isPortrait && item.h > 28 ? 'vertical-rl' : 'horizontal-tb' }}
                >
                    <span className="font-black text-white/90 leading-none text-[9px] sm:text-[11px] tracking-wide">
                        {item.label}
                    </span>
                    {st === 'occupied' && session?.started_at && (
                        <LiveTimer
                            startedAt={session.started_at}
                            className="font-mono font-bold text-white/70 text-[8px] sm:text-[10px]"
                        />
                    )}
                    {st === 'occupied' && session?.client_name && (
                        <span className="text-white/50 text-[7px] truncate max-w-full">{session.client_name}</span>
                    )}
                    {st === 'checkout' && (
                        <span className="font-black text-amber-200 text-[7px] sm:text-[8px] uppercase tracking-widest animate-pulse">
                            COBRAR
                        </span>
                    )}
                    {st === 'free' && (
                        <span className="text-white/20 text-[7px] uppercase tracking-wider font-semibold">libre</span>
                    )}
                </div>
            </div>

            {/* Bolsillos */}
            {[...cornerPockets, ...midPockets].map((pos, i) => (
                <div key={i} style={{ ...pocketBase, ...pos }} />
            ))}

            {/* Punto de estado */}
            <StatusDot status={st} />

            {/* Hover glow sutil cuando libre */}
            {st === 'free' && (
                <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                    style={{ background: 'linear-gradient(145deg, rgba(34,197,94,0.06), transparent)' }} />
            )}
        </button>
    );
}

/**
 * DiningTableEl — Mesa comedor/social (M1, M2, M3).
 * Render top-view: 4 sillas como rectángulos redondeados en N/S/E/W + superficie central.
 */
function DiningTableEl({ item, session, onClick }) {
    const st = statusOf(session);

    const colors = {
        free:     { table: '#3d2b1a', chair: '#2a1e12', border: '#6b4226', glow: 'transparent' },
        occupied: { table: '#4c1d95', chair: '#3b0764', border: '#8b5cf6', glow: 'rgba(139,92,246,0.25)' },
        checkout: { table: '#92400e', chair: '#78350f', border: '#f59e0b', glow: 'rgba(245,158,11,0.3)' },
    }[st];

    // Posición y dimensiones de las 4 sillas (en % del elemento)
    // Sillas N y S: horizontales (anchas), sillas E y W: verticales (altas)
    const chairs = [
        { key: 'n', style: { top: 0, left: '30%', width: '40%', height: '14%', borderRadius: '4px 4px 2px 2px' } },
        { key: 's', style: { bottom: 0, left: '30%', width: '40%', height: '14%', borderRadius: '2px 2px 4px 4px' } },
        { key: 'w', style: { left: 0, top: '22%', width: '12%', height: '40%', borderRadius: '4px 2px 2px 4px' } },
        { key: 'e', style: { right: 0, top: '22%', width: '12%', height: '40%', borderRadius: '2px 4px 4px 2px' } },
    ];

    return (
        <button
            onClick={onClick}
            style={{
                position: 'absolute',
                left: `${item.x}%`, top: `${item.y}%`,
                width: `${item.w}%`, height: `${item.h}%`,
            }}
            className="group transition-all duration-200 active:scale-95 cursor-pointer"
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
                        border: `1px solid ${colors.border}50`,
                        transition: 'background 0.2s',
                    }}
                />
            ))}

            {/* Superficie de la mesa */}
            <div
                className="absolute flex flex-col items-center justify-center"
                style={{
                    inset: '16%',
                    background: colors.table,
                    borderRadius: 6,
                    border: `1.5px solid ${colors.border}`,
                    boxShadow: `0 0 12px ${colors.glow}, 0 2px 6px rgba(0,0,0,0.4)`,
                    transition: 'all 0.2s',
                }}
            >
                <span className="font-black text-white/80 text-[8px] sm:text-[10px] leading-none text-center">
                    {item.label}
                </span>
                {st === 'occupied' && session?.client_name && (
                    <span className="text-white/45 text-[6px] truncate max-w-full px-0.5 mt-0.5">
                        {session.client_name}
                    </span>
                )}
                {st === 'checkout' && (
                    <span className="text-amber-200 text-[6px] font-black uppercase animate-pulse mt-0.5">COBRAR</span>
                )}
            </div>

            {/* Punto de estado */}
            <StatusDot status={st} />

            {/* Hover ring (libre) */}
            {st === 'free' && (
                <div
                    className="absolute opacity-0 group-hover:opacity-100 transition-opacity duration-200 rounded-lg pointer-events-none"
                    style={{ inset: '14%', border: `1px solid ${colors.border}60` }}
                />
            )}
        </button>
    );
}

/**
 * RoundStoolEl — Taburete alto redondo (M4-M11).
 * Render: círculo grande con inner ring decorativo.
 */
function RoundStoolEl({ item, session, onClick }) {
    const st = statusOf(session);

    const style = {
        free:     { outer: '#334155', inner: '#1e293b', border: '#475569', shadow: 'none', text: '#94a3b8' },
        occupied: { outer: '#5b21b6', inner: '#4c1d95', border: '#8b5cf6', shadow: '0 0 10px rgba(139,92,246,0.35)', text: '#e9d5ff' },
        checkout: { outer: '#b45309', inner: '#92400e', border: '#f59e0b', shadow: '0 0 10px rgba(245,158,11,0.4)', text: '#fde68a' },
    }[st];

    return (
        <button
            onClick={onClick}
            style={{
                position: 'absolute',
                left: `${item.x}%`, top: `${item.y}%`,
                width: `${item.w}%`, height: `${item.h}%`,
            }}
            className="group flex items-center justify-center transition-all duration-200 active:scale-95 cursor-pointer"
            title={item.label}
        >
            {/* Outer circle */}
            <div
                className="relative w-full h-full rounded-full flex items-center justify-center"
                style={{
                    background: `radial-gradient(circle at 35% 35%, ${style.outer}, ${style.inner})`,
                    border: `1.5px solid ${style.border}`,
                    boxShadow: style.shadow,
                }}
            >
                {/* Inner ring decorativo */}
                <div
                    className="absolute rounded-full"
                    style={{ inset: '18%', border: `1px solid ${style.border}40` }}
                />
                {/* Label */}
                <span
                    className="relative z-10 font-black leading-none text-center"
                    style={{
                        color: style.text,
                        fontSize: item.label.length > 2 ? '7px' : '8px',
                    }}
                >
                    {item.label}
                </span>
                {/* Estado */}
                <StatusDot status={st} />
            </div>
        </button>
    );
}

/**
 * BarStoolEl — Taburete de barra (B1-B15).
 * Render: círculo compacto con label. Identidad diferenciada de RoundStoolEl.
 */
function BarStoolEl({ item, session, onClick }) {
    const st = statusOf(session);

    return (
        <button
            onClick={onClick}
            style={{
                position: 'absolute',
                left: `${item.x}%`, top: `${item.y}%`,
                width: `${item.w}%`, height: `${item.h}%`,
            }}
            className="group flex items-center justify-center transition-all duration-200 active:scale-95 cursor-pointer"
            title={item.label}
        >
            <div
                className={`relative w-full h-full rounded-full flex items-center justify-center transition-all duration-200
                    ${st === 'free'
                        ? 'group-hover:scale-110'
                        : ''
                    }`}
                style={{
                    background: st === 'free'
                        ? 'radial-gradient(circle at 35% 35%, #475569, #1e293b)'
                        : st === 'checkout'
                            ? 'radial-gradient(circle at 35% 35%, #d97706, #92400e)'
                            : 'radial-gradient(circle at 35% 35%, #0369a1, #0c4a6e)',
                    border: st === 'free' ? '1px solid #475569' : st === 'checkout' ? '1.5px solid #f59e0b' : '1.5px solid #38bdf8',
                    boxShadow: st === 'occupied' ? '0 0 6px rgba(56,189,248,0.3)'
                        : st === 'checkout' ? '0 0 8px rgba(245,158,11,0.35)' : 'none',
                }}
            >
                <span
                    className="font-black text-center leading-none"
                    style={{
                        color: st === 'free' ? '#64748b' : '#e0f2fe',
                        fontSize: item.label.length > 2 ? '6px' : '7px',
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
 * Render: superficie de madera oscura con veta y etiqueta rotada si es vertical.
 */
function BarCounterEl({ item }) {
    const isVertical = item.h > item.w * 1.5;

    return (
        <div
            style={{
                position: 'absolute',
                left: `${item.x}%`, top: `${item.y}%`,
                width: `${item.w}%`, height: `${item.h}%`,
            }}
            className="rounded-lg overflow-hidden"
        >
            {/* Base de madera */}
            <div
                className="absolute inset-0"
                style={{ background: 'linear-gradient(135deg, #6b3a1f 0%, #4a2710 35%, #5c3218 65%, #3d2010 100%)' }}
            />

            {/* Borde de encimera (canto brillante) */}
            <div className="absolute inset-0 rounded-lg"
                style={{ border: '1px solid rgba(200,130,60,0.25)', boxShadow: 'inset 0 1px 0 rgba(255,200,100,0.12)' }}
            />

            {/* Vetas de madera */}
            <div
                className="absolute inset-0 opacity-15"
                style={{
                    backgroundImage: isVertical
                        ? 'repeating-linear-gradient(0deg, transparent, transparent 10px, rgba(255,180,80,0.25) 10px, rgba(255,180,80,0.25) 11px)'
                        : 'repeating-linear-gradient(90deg, transparent, transparent 10px, rgba(255,180,80,0.25) 10px, rgba(255,180,80,0.25) 11px)',
                }}
            />

            {/* Etiqueta */}
            {item.label && (
                <div className="absolute inset-0 flex items-center justify-center">
                    <span
                        className="font-black uppercase tracking-widest select-none text-[8px] sm:text-[9px]"
                        style={{
                            color: 'rgba(255,185,100,0.45)',
                            writingMode: isVertical ? 'vertical-rl' : 'horizontal-tb',
                            textOrientation: 'mixed',
                            transform: isVertical ? 'rotate(180deg)' : undefined,
                        }}
                    >
                        {item.label}
                    </span>
                </div>
            )}
        </div>
    );
}

/**
 * EntryEl — Marcador de entrada al local.
 * Render: área translúcida con flecha y etiqueta "Entrada".
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
                gap: 4,
                borderRadius: '0 10px 10px 0',
                background: 'rgba(14,165,233,0.06)',
                borderTop: '1px solid rgba(14,165,233,0.2)',
                borderRight: '1px solid rgba(14,165,233,0.2)',
                borderBottom: '1px solid rgba(14,165,233,0.2)',
            }}
        >
            {/* Flecha de entrada */}
            <div className="flex items-center gap-0.5">
                <div style={{ width: 8, height: 1.5, background: 'rgba(56,189,248,0.5)', borderRadius: 1 }} />
                <div style={{
                    width: 0, height: 0,
                    borderTop: '3px solid transparent',
                    borderBottom: '3px solid transparent',
                    borderLeft: '4px solid rgba(56,189,248,0.5)',
                }} />
            </div>
            {/* Texto vertical */}
            <span
                className="font-bold uppercase select-none"
                style={{
                    fontSize: '6px',
                    color: 'rgba(56,189,248,0.4)',
                    writingMode: 'vertical-rl',
                    letterSpacing: '0.08em',
                }}
            >
                Entrada
            </span>
        </div>
    );
}

/**
 * LogoEl — Área de identidad/branding central.
 * Render: rectángulo sutil con ornamento decorativo y nombre del local.
 */
function LogoEl({ item }) {
    return (
        <div
            style={{
                position: 'absolute',
                left: `${item.x}%`, top: `${item.y}%`,
                width: `${item.w}%`, height: `${item.h}%`,
                background: 'linear-gradient(135deg, rgba(180,83,9,0.08) 0%, rgba(120,53,15,0.05) 100%)',
                border: '1px solid rgba(245,158,11,0.18)',
                borderRadius: 8,
            }}
            className="flex items-center justify-center"
        >
            <div className="flex flex-col items-center gap-0.5">
                {/* Ornamento superior */}
                <div className="flex items-center gap-1">
                    <div style={{ width: 12, height: 0.5, background: 'rgba(245,158,11,0.3)', borderRadius: 1 }} />
                    <div style={{ width: 3, height: 3, borderRadius: '50%', background: 'rgba(245,158,11,0.4)' }} />
                    <div style={{ width: 12, height: 0.5, background: 'rgba(245,158,11,0.3)', borderRadius: 1 }} />
                </div>
                {/* Nombre */}
                <span
                    className="font-black uppercase select-none tracking-widest"
                    style={{
                        fontSize: '7px',
                        color: 'rgba(251,191,36,0.5)',
                        letterSpacing: '0.15em',
                    }}
                >
                    POOL IMPERIAL
                </span>
                {/* Ornamento inferior */}
                <div style={{ width: 20, height: 0.5, background: 'rgba(245,158,11,0.2)', borderRadius: 1 }} />
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════
// ZONA BACKGROUNDS — indicadores sutiles de zonas
// ═══════════════════════════════════════════════════════

function ZoneBackgrounds() {
    return (
        <>
            {/* Zona de pool — aura verde muy sutil */}
            <div
                className="absolute pointer-events-none"
                style={{
                    left: '47%', top: '5%', width: '46%', height: '88%',
                    background: 'radial-gradient(ellipse 70% 60% at 50% 50%, rgba(16,85,47,0.07) 0%, transparent 70%)',
                    borderRadius: '40%',
                }}
            />
            {/* Zona Barra 1 — aura madera */}
            <div
                className="absolute pointer-events-none"
                style={{
                    left: '22%', top: '38%', width: '28%', height: '45%',
                    background: 'radial-gradient(ellipse 80% 70% at 50% 50%, rgba(107,58,31,0.08) 0%, transparent 70%)',
                    borderRadius: '30%',
                }}
            />
            {/* Zona Barra 2 — aura madera derecha */}
            <div
                className="absolute pointer-events-none"
                style={{
                    left: '80%', top: '12%', width: '18%', height: '76%',
                    background: 'radial-gradient(ellipse 80% 60% at 50% 50%, rgba(107,58,31,0.1) 0%, transparent 70%)',
                    borderRadius: '20%',
                }}
            />
        </>
    );
}

// ═══════════════════════════════════════════════════════
// LEYENDA
// ═══════════════════════════════════════════════════════

function Legend() {
    return (
        <div className="flex items-center gap-3 flex-wrap">
            {[
                { bg: '#1a5c33', border: '#4a2610', label: 'Libre' },
                { bg: '#15803d', border: '#86efac', label: 'Ocupada' },
                { bg: '#b45309', border: '#f59e0b', label: 'Por cobrar' },
            ].map(({ bg, border, label }) => (
                <div key={label} className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-sm" style={{ background: bg, border: `1.5px solid ${border}` }} />
                    <span className="text-[10px] font-medium text-slate-400">{label}</span>
                </div>
            ))}
        </div>
    );
}

// ═══════════════════════════════════════════════════════
// MAIN: FloorPlanView
// ═══════════════════════════════════════════════════════

export default function FloorPlanView({ onTableSelect }) {
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

        switch (item.type) {
            case 'pool_table':
                return <PoolTableEl   key={key} item={item} session={session} {...click} />;
            case 'dining_table':
                return <DiningTableEl key={key} item={item} session={session} {...click} />;
            case 'round_stool':
            case 'bar_table':   // compat retroactiva con tipo anterior
                return <RoundStoolEl  key={key} item={item} session={session} {...click} />;
            case 'bar_stool':
                return <BarStoolEl    key={key} item={item} session={session} {...click} />;
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
        <div className="flex flex-col h-full">

            {/* ── Barra de estadísticas ── */}
            <div className="flex items-center gap-4 px-4 py-2.5 border-b border-white/5 flex-shrink-0 flex-wrap">
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-400" />
                    <span className="text-xs font-bold text-slate-300">
                        {stats.occupied}/{stats.total} ocupadas
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-sky-400" />
                    <span className="text-xs font-bold text-slate-300">
                        Billar: {stats.occupiedPool}/{stats.totalPool}
                    </span>
                </div>
                {stats.checkout > 0 && (
                    <div className="flex items-center gap-2 animate-pulse">
                        <div className="w-2 h-2 rounded-full bg-amber-400" />
                        <span className="text-xs font-bold text-amber-400">
                            {stats.checkout} por cobrar
                        </span>
                    </div>
                )}
                <div className="ml-auto">
                    <Legend />
                </div>
            </div>

            {/* ── Canvas del plano ── */}
            <div className="flex-1 overflow-auto p-3 sm:p-4 flex items-center justify-center">
                <div
                    className="relative w-full rounded-2xl overflow-hidden"
                    style={{
                        aspectRatio: '16/9',
                        maxHeight: 'calc(100vh - 210px)',
                        background: 'linear-gradient(160deg, #18110a 0%, #0e0b07 55%, #1c1309 100%)',
                        borderWidth: 1,
                        borderStyle: 'solid',
                        borderColor: 'rgba(90,55,25,0.4)',
                    }}
                >
                    {/* Tablones del suelo (líneas verticales sutiles) */}
                    <div
                        className="absolute inset-0 opacity-[0.05]"
                        style={{
                            backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 55px, rgba(210,160,80,0.6) 55px, rgba(210,160,80,0.6) 56px)',
                        }}
                    />

                    {/* Luces de techo (radiales desde arriba) */}
                    {[16, 35, 54, 73, 90].map(x => (
                        <div
                            key={x}
                            className="absolute top-0 pointer-events-none"
                            style={{
                                left: `${x}%`,
                                width: '18%',
                                height: '50%',
                                transform: 'translateX(-50%)',
                                background: 'radial-gradient(ellipse 60% 100% at 50% 0%, rgba(255,220,130,0.07) 0%, transparent 70%)',
                            }}
                        />
                    ))}

                    {/* Fondos de zona */}
                    <ZoneBackgrounds />

                    {/* Marco de paredes */}
                    <div
                        className="absolute inset-0 rounded-2xl pointer-events-none"
                        style={{ boxShadow: 'inset 0 0 0 4px rgba(80,45,15,0.5)', border: '1px solid rgba(100,60,20,0.3)' }}
                    />

                    {/* Todos los elementos del plano */}
                    {resolvedItems.map(renderItem)}
                </div>
            </div>

            {/* Indicación de uso */}
            <p className="text-center text-[10px] text-slate-700 pb-2.5 select-none flex-shrink-0">
                Toca una mesa para gestionar · Pool Imperial
            </p>

        </div>
    );
}
