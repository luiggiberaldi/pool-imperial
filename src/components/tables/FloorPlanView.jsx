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

import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { useTablesStore } from '../../hooks/store/useTablesStore';
import { FLOOR_ITEMS } from '../../data/floorPlanData';
import { calculateElapsedTime } from '../../utils/tableBillingEngine';
import { showToast } from '../Toast';
import { useSharedTick } from '../../hooks/useSharedTick';
import mesaPoolSvg from '../../assets/mesa-pool.svg';
import mesasNormalesSvg from '../../assets/mesas-normales.svg';
import mesaRedondaSvg from '../../assets/mesa-redonda.svg';
import bancosSvg from '../../assets/bancos.svg';
import barraSvg from '../../assets/barra.svg';
import pisoMaderaPng from '../../assets/piso-madera-clara.webp';
import logoPng from '../../assets/logo.png';



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
/** Resuelve un FloorItem → mesa del store de forma robusta por nombre o código numérico. */
function resolveTable(item, tables) {
    if (!item.refName) return null;
    
    // 1. Coincidencia exacta
    let found = tables.find(t => t.name === item.refName);
    if (found) return found;
    
    // 2. Coincidencia exacta insensible a mayúsculas y espacios
    const cleanRef = item.refName.trim().toLowerCase();
    found = tables.find(t => t.name.trim().toLowerCase() === cleanRef);
    if (found) return found;

    // 3. Coincidencia para mesas de billar (POOL) por número (ej. "Pool 1" o "Mesa Pool 1")
    if (item.type === 'pool_table') {
        const itemDigits = item.refName.match(/\d+/)?.[0];
        if (itemDigits) {
            found = tables.find(t => t.type === 'POOL' && t.name.match(/\d+/)?.[0] === itemDigits);
            if (found) return found;
        }
    }

    // 4. Coincidencia para mesas normales (Bar/Comedor) por número (ej. "M1" o "Mesa 1")
    if (item.type === 'dining_table' || item.type === 'round_stool' || item.type === 'bar_table') {
        const itemDigits = item.refName.match(/\d+/)?.[0];
        if (itemDigits) {
            found = tables.find(t => {
                if (t.type !== 'NORMAL') return false;
                const tDigits = t.name.match(/\d+/)?.[0];
                if (tDigits !== itemDigits) return false;
                const nameLower = t.name.toLowerCase();
                // Evitar cruce con taburetes de barra (B1, B2)
                return !nameLower.includes('b') && !nameLower.includes('banco') && !nameLower.includes('barra');
            });
            if (found) return found;
        }
    }

    // 5. Coincidencia para bancos/taburetes de barra (B1, B2, etc.) por número
    if (item.type === 'bar_stool') {
        const itemDigits = item.refName.match(/\d+/)?.[0];
        if (itemDigits) {
            found = tables.find(t => {
                if (t.type !== 'NORMAL') return false;
                const tDigits = t.name.match(/\d+/)?.[0];
                if (tDigits !== itemDigits) return false;
                const nameLower = t.name.toLowerCase();
                return nameLower.includes('b') || nameLower.includes('banco') || nameLower.includes('barra');
            });
            if (found) return found;
        }
    }

    // 6. Último recurso: coincidencia genérica por tipo y dígito
    const itemDigits = item.refName.match(/\d+/)?.[0];
    if (itemDigits) {
        const expectedType = item.type === 'pool_table' ? 'POOL' : 'NORMAL';
        found = tables.find(t => t.type === expectedType && t.name.match(/\d+/)?.[0] === itemDigits);
        if (found) return found;
    }

    return null;
}

/** Devuelve el estado semántico de una sesión: 'free' | 'occupied' | 'checkout' | 'exceeded' */
function statusOf(session, now) {
    if (!session) return 'free';
    if (session.status === 'CHECKOUT') return 'checkout';
    
    // Validar si es un prepago excedido en tiempo real
    if (session.game_mode === 'NORMAL' && session.hours_paid > 0) {
        const started = new Date(session.started_at).getTime();
        const elapsedMinutes = (now - started) / 60000;
        const limitMinutes = session.hours_paid * 60;
        if (elapsedMinutes > limitMinutes) {
            return 'exceeded';
        }
    }
    
    return 'occupied';
}

/** Hook para calcular y actualizar el estado de una mesa en tiempo real */
function useTableStatus(session) {
    const baseStatus = !session ? 'free' : (session.status === 'CHECKOUT' ? 'checkout' : 'occupied');
    const [isExceeded, setIsExceeded] = useState(false);

    useEffect(() => {
        if (!session || session.status === 'CHECKOUT' || session.game_mode !== 'NORMAL' || session.hours_paid <= 0) {
            setIsExceeded(false);
            return;
        }

        const checkExceeded = () => {
            const started = new Date(session.started_at).getTime();
            const elapsedMinutes = (Date.now() - started) / 60000;
            const limitMinutes = session.hours_paid * 60;
            setIsExceeded(elapsedMinutes > limitMinutes);
        };

        checkExceeded();
        const interval = setInterval(checkExceeded, 5000); // Verificar cada 5 segundos
        return () => clearInterval(interval);
    }, [session]);

    return isExceeded ? 'exceeded' : baseStatus;
}

// ═══════════════════════════════════════════════════════
// SUBCOMPONENTES UTILITARIOS
// ═══════════════════════════════════════════════════════

/** Timer en vivo que actualiza cada segundo. */
function LiveTimer({ session, className = '' }) {
    const tick = useSharedTick();
    const pausedData = useTablesStore(state => session ? state.pausedSessions[session.id] : null);
    const isPaused = Boolean(session?.paused_at || pausedData?.isPaused);

    const elapsedSeconds = useMemo(() => {
        if (!session?.started_at) return 0;
        // Floor: elapsedAtPause son minutos con decimales; sin redondear se mostraría
        // como basura (ej. "3.2139999s") en el timer del mini-plano.
        if (isPaused) {
            const pauseSecs = session?.paused_at && session?.started_at
                ? Math.floor((new Date(session.paused_at).getTime() - new Date(session.started_at).getTime()) / 1000)
                : Math.floor((pausedData?.elapsedAtPause || 0) * 60);
            return Math.max(0, pauseSecs);
        }
        const start = new Date(session.started_at).getTime();
        const now = Date.now();
        return Math.max(0, Math.floor((now - start) / 1000));
    }, [session?.started_at, session?.paused_at, isPaused, pausedData, tick]);

    return <span className={className}>{fmtTimer(elapsedSeconds)}</span>;
}

/** Contador de cuenta regresiva en vivo para prepagos. */
function LiveCountdownTimer({ session, className = '' }) {
    const tick = useSharedTick();
    const pausedData = useTablesStore(state => session ? state.pausedSessions[session.id] : null);
    const isPaused = Boolean(session?.paused_at || pausedData?.isPaused);
    const hoursPaid = session?.hours_paid || 0;
    
    const paidHoursOffsets = useTablesStore(state => state.paidHoursOffsets);
    const paidElapsedOffsets = useTablesStore(state => state.paidElapsedOffsets);
    const hoursOffset = session ? (paidHoursOffsets[session.id] || 0) : 0;
    const elapsedOffset = session ? (paidElapsedOffsets[session.id] || 0) : 0;
    
    // Calcular en tiempo real usando segundos para máxima precisión
    const remainingSeconds = useMemo(() => {
        if (!session?.started_at) return 0;
        
        let elapsedSecs;
        if (isPaused) {
            elapsedSecs = session?.paused_at && session?.started_at
                ? Math.floor((new Date(session.paused_at).getTime() - new Date(session.started_at).getTime()) / 1000)
                : Math.floor((pausedData?.elapsedAtPause || 0) * 60);
            elapsedSecs = Math.max(0, elapsedSecs);
        } else {
            const start = new Date(session.started_at).getTime();
            const now = Date.now();
            elapsedSecs = Math.max(0, Math.floor((now - start) / 1000));
        }

        const limitSecs = hoursPaid * 3600;
        const offsetSecs = hoursOffset * 3600;
        const effectiveLimitSecs = Math.max(0, limitSecs - offsetSecs);
        
        const elapsedOffsetSecs = elapsedOffset * 60;
        const effectiveElapsedSecs = elapsedOffsetSecs > 0 ? Math.max(0, elapsedSecs - elapsedOffsetSecs) : elapsedSecs;

        return Math.max(0, effectiveLimitSecs - effectiveElapsedSecs);
    }, [session, isPaused, pausedData, hoursPaid, hoursOffset, elapsedOffset, tick]);

    if (remainingSeconds > 0) {
        const isLowTime = remainingSeconds < 600; // < 10 mins (600 seconds)
        return (
            <span className={`${className} ${isLowTime ? 'text-amber-400 animate-pulse font-black' : 'text-emerald-400 font-extrabold'}`}>
                ⌛ {fmtTimer(remainingSeconds)} rest.
            </span>
        );
    } else {
        return (
            <span className={`${className} text-rose-500 animate-pulse font-black text-[10px] sm:text-[11.5px] tracking-wide uppercase`}>
                ⚠️ Tiempo Cumplido
            </span>
        );
    }
}

/** Punto de estado plano y discreto. */
function StatusDot({ status }) {
    if (status === 'free') return null;
    return (
        <span
            className={`absolute top-[8%] right-[8%] w-2.5 h-2.5 rounded-full z-20 border border-white transition-all
                ${status === 'checkout' 
                    ? 'bg-amber-500 animate-pulse shadow-[0_0_8px_#f59e0b] shadow-amber-500/50' 
                    : status === 'exceeded'
                        ? 'bg-rose-500 shadow-[0_0_8px_#ef4444] shadow-rose-500/50'
                        : 'bg-sky-400 shadow-[0_0_8px_#38bdf8] shadow-sky-400/50'}`}
        />
    );
}

// ═══════════════════════════════════════════════════════
// ELEMENTOS DE PLANO — cada uno con identidad visual propia
// ═══════════════════════════════════════════════════════

/**
 * PoolTableEl — Mesa de billar.
 * Render: fieltro realístico cargando la imagen mesa-pool.svg, con soporte de rotación portrait
 * y capas de estado e información en tiempo real.
 */
const PoolTableEl = React.memo(function PoolTableEl({ item, table, session, isSelected, isCanvasRotated, onItemClick, ...props }) {
    const status = useTableStatus(session);
    const rotation = item.r || 0;
    const scale = (item.imgScale || 100) / 100;
    
    // Use imgDir if explicitly set, fallback to actual aspect-ratio on 16:9 canvas
    const imgDir = item.imgDir || (item.w * 16 > item.h * 9 ? 'horizontal' : 'vertical');
    const isPortrait = imgDir === 'vertical';

    // Borde y sombra de neón según el estado (Luces apagadas si está libre)
    let borderStyle = '2.5px solid transparent';
    let shadowStyle = {};

    if (status === 'occupied') {
        borderStyle = '3px solid #06b6d4'; // Cyan border
        shadowStyle = {
            boxShadow: '0 0 14px rgba(6, 182, 212, 0.85), inset 0 0 6px rgba(6, 182, 212, 0.35)'
        };
    } else if (status === 'checkout') {
        borderStyle = '3px dashed #f59e0b'; // Amber/naranja border
        shadowStyle = {
            boxShadow: '0 0 16px rgba(245, 158, 11, 0.95), inset 0 0 8px rgba(245, 158, 11, 0.45)'
        };
    } else if (status === 'exceeded') {
        borderStyle = '3px dashed #ef4444'; // Red border
        shadowStyle = {
            boxShadow: '0 0 16px rgba(239, 68, 68, 0.95), inset 0 0 8px rgba(239, 68, 68, 0.45)'
        };
    }

    // Filtro de brillo simulando encendido/apagado de focos
    const filterStyle = status === 'free'
        ? 'brightness(0.35) contrast(0.9) saturate(0.8)'
        : 'brightness(1.05) saturate(1.05)';

    // All pool tables use the same horizontal SVG image, rotated 90 degrees if the visual orientation is portrait
    const imgSrc = mesaPoolSvg;

    const imageStyle = isPortrait ? {
        position: 'absolute',
        left: '50%',
        top: '50%',
        width: `${(item.h / item.w) * 100}%`,
        height: `${(item.w / item.h) * 100}%`,
        transform: `translate(-50%, -50%) rotate(${90 + rotation}deg) scale(${scale})`,
        objectFit: 'fill',
    } : {
        position: 'absolute',
        left: 0,
        top: 0,
        width: '100%',
        height: '100%',
        transform: `rotate(${rotation}deg) scale(${scale})`,
        objectFit: 'fill',
    };

    // State tint overlay on top of the table image
    const overlayBg = status === 'free'
        ? 'rgba(0, 0, 0, 0)'
        : status === 'checkout'
            ? 'rgba(217, 119, 6, 0.15)' // Amber
            : status === 'exceeded'
                ? 'rgba(153, 27, 27, 0.25)' // Crimson
                : 'rgba(6, 182, 212, 0.08)'; // Cyan tint for occupied

    const handleClick = (e) => {
        if (onItemClick) {
            onItemClick(table, session);
        } else if (props.onClick) {
            props.onClick(e);
        }
    };

    return (
        <button
            {...props}
            onClick={handleClick}
            style={{
                position: 'absolute',
                left: `${item.x}%`, top: `${item.y}%`,
                width: `${item.w}%`, height: `${item.h}%`,
                background: 'transparent',
                border: borderStyle,
                borderRadius: '6px',
                outline: isSelected ? '3px solid #f97316' : undefined,
                outlineOffset: '2px',
                zIndex: isSelected ? 30 : undefined,
                filter: 'drop-shadow(0px 3.5px 5px rgba(0,0,0,0.5))',
                ...shadowStyle,
                ...props.style,
            }}
            className={`group transition-all duration-150 active:scale-[0.98] cursor-pointer overflow-hidden flex items-center justify-center touch-target-expand ${status === 'checkout' ? 'checkout-pulsing' : ''} ${props.className || ''}`}
            title={item.label}
        >
            {/* The high-fidelity pool table SVG */}
            <img
                src={imgSrc}
                alt={item.label}
                className="pointer-events-none select-none transition-all duration-300"
                style={{
                    ...imageStyle,
                    filter: filterStyle
                }}
                onError={() => console.error(`[FloorPlanView] Error loading PoolTable image (${imgSrc}) for: ${item.label}`)}
            />

            {/* Tint overlay for visual status feedback */}
            <div 
                className="absolute inset-0 z-10 pointer-events-none transition-colors duration-300"
                style={{ backgroundColor: overlayBg }}
            />

            {/* Contenido: etiqueta + timer + cliente */}
            <div
                className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-1 px-1 text-center bg-transparent transition-colors duration-200"
                style={isCanvasRotated ? { transform: 'rotate(90deg)', writingMode: 'horizontal-tb' } : { writingMode: 'horizontal-tb' }}
            >
                <span className="font-extrabold text-white leading-none text-[13px] sm:text-[14.5px] tracking-wide drop-shadow-[0_1.5px_1.5px_rgba(0,0,0,0.9)]">
                    {item.label}
                </span>

                {status === 'free' && (
                    <span className="text-white/45 text-[10px] uppercase tracking-wider font-extrabold drop-shadow-[0_1px_1px_rgba(0,0,0,0.7)] mt-0.5">
                        libre
                    </span>
                )}

                {status === 'checkout' && (
                    <span className="font-black text-amber-400 text-[10.5px] sm:text-[11.5px] uppercase tracking-wider drop-shadow-[0_1.5px_1.5px_rgba(0,0,0,0.9)] animate-pulse">
                        COBRAR
                    </span>
                )}

                {(status === 'occupied' || status === 'exceeded') && (
                    <>
                        {/* 1. MODO JUGADA */}
                        {session?.game_mode === 'PINA' ? (
                            <div className="flex flex-col items-center gap-0.5">
                                {(() => {
                                    const roundsCount = 1 + (Number(session.extended_times) || 0);
                                    return (
                                        <span className="font-black text-[10px] sm:text-[11px] text-white bg-slate-900/80 px-1.5 py-0.5 rounded border border-slate-700/60 flex items-center gap-1 drop-shadow-md">
                                            🎱 {roundsCount} {roundsCount === 1 ? 'Jugada' : 'Jugadas'}
                                        </span>
                                    );
                                })()}
                                {session.started_at && (
                                    <LiveTimer
                                        session={session}
                                        className="font-mono text-white/80 text-[9.5px] sm:text-[11px] drop-shadow-[0_1px_1.5px_rgba(0,0,0,0.9)]"
                                    />
                                )}
                            </div>
                        ) : session?.game_mode === 'NORMAL' && session?.hours_paid > 0 ? (
                            /* 2. MODO PREPAGO */
                            <div className="flex flex-col items-center">
                                <LiveCountdownTimer
                                    session={session}
                                    className="font-mono font-extrabold text-[11px] sm:text-[13px] drop-shadow-[0_1.5px_1.5px_rgba(0,0,0,0.9)]"
                                />
                            </div>
                        ) : (
                            /* 3. MODO LIBRE (POR MINUTO) */
                            <div className="flex flex-col items-center gap-0.5">
                                <span className="text-[9px] text-emerald-400 font-extrabold uppercase tracking-widest bg-emerald-950/70 border border-emerald-800/40 px-1 py-[1.5px] rounded leading-none">
                                    Libre
                                </span>
                                {session?.started_at && (
                                    <LiveTimer
                                        session={session}
                                        className="font-mono font-extrabold text-white text-[11px] sm:text-[13px] drop-shadow-[0_1.5px_1.5px_rgba(0,0,0,0.9)]"
                                    />
                                )}
                            </div>
                        )}

                        {/* Nombre del cliente */}
                        {session?.client_name && (
                            <span className="text-white/90 font-bold text-[10px] sm:text-[10.5px] truncate max-w-full drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)] mt-0.5">
                                {session.client_name}
                            </span>
                        )}
                    </>
                )}
            </div>
        </button>
    );
})

/**
 * DiningTableEl — Mesa comedor/social (M1, M2, M3).
 * Render top-view: 4 sillas simplificadas en los costados + superficie de mesa plana.
 */
const DiningTableEl = React.memo(function DiningTableEl({ item, table, session, isSelected, isCanvasRotated, onItemClick, ...props }) {
    const status = useTableStatus(session);
    const rotation = item.r || 0;
    const scale = (item.imgScale || 100) / 100;

    const overlayBg = status === 'free'
        ? 'rgba(0, 0, 0, 0)'
        : status === 'checkout'
            ? 'rgba(217, 119, 6, 0.25)' // Amber
            : status === 'exceeded'
                ? 'rgba(153, 27, 27, 0.35)' // Crimson
                : 'rgba(239, 68, 68, 0.15)'; // Red

    const borderStyle = status === 'free' 
        ? '2px solid transparent' 
        : status === 'checkout'
            ? '2.5px dashed #f59e0b'
            : status === 'exceeded'
                ? '2.5px dashed #ef4444'
                : '2.5px solid #ef4444';

    const shadowStyle = status === 'free' ? {} : {
        boxShadow: status === 'checkout' 
            ? '0 0 14px rgba(245, 158, 11, 0.75), inset 0 0 6px rgba(245, 158, 11, 0.35)' 
            : status === 'exceeded'
                ? '0 0 14px rgba(239, 68, 68, 0.8), inset 0 0 6px rgba(239, 68, 68, 0.4)'
                : '0 0 12px rgba(239, 68, 68, 0.65), inset 0 0 4px rgba(239, 68, 68, 0.3)'
    };

    const imgSrc = mesasNormalesSvg;

    const handleClick = (e) => {
        if (onItemClick) {
            onItemClick(table, session);
        } else if (props.onClick) {
            props.onClick(e);
        }
    };

    return (
        <button
            {...props}
            onClick={handleClick}
            style={{
                position: 'absolute',
                left: `${item.x}%`, top: `${item.y}%`,
                width: `${item.w}%`, height: `${item.h}%`,
                transform: rotation ? `rotate(${rotation}deg)` : undefined,
                outline: isSelected ? '3px solid #f97316' : undefined,
                outlineOffset: '2px',
                zIndex: isSelected ? 30 : undefined,
                background: 'transparent',
                border: borderStyle,
                borderRadius: '8px',
                filter: 'drop-shadow(0px 3.5px 5px rgba(0,0,0,0.5))',
                ...shadowStyle,
                ...props.style,
            }}
            className={`group transition-all duration-150 active:scale-[0.98] cursor-pointer overflow-hidden flex items-center justify-center touch-target-expand ${status === 'checkout' ? 'checkout-pulsing' : ''} ${props.className || ''}`}
            title={item.label}
        >
            {/* The high-fidelity dining table SVG */}
            <img
                src={imgSrc}
                alt={item.label}
                className="pointer-events-none select-none w-full h-full object-fill"
                style={{ transform: scale !== 1 ? `scale(${scale})` : undefined }}
                onError={() => console.error(`[FloorPlanView] Error loading DiningTable image (${imgSrc}) for: ${item.label}`)}
            />

            {/* Tint overlay for visual status feedback */}
            <div 
                className="absolute inset-0 z-10 pointer-events-none transition-colors duration-300"
                style={{ backgroundColor: overlayBg }}
            />

            {/* Contenido: etiqueta + cliente + estado */}
            <div
                className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-0.5 px-1 text-center bg-transparent transition-colors duration-200"
                style={{
                    transform: isCanvasRotated ? 'rotate(90deg)' : undefined,
                }}
            >
                <span className="font-extrabold text-white leading-none text-[9.5px] sm:text-[11px] drop-shadow-[0_1.5px_1.5px_rgba(0,0,0,0.95)]">
                    {item.label}
                </span>
                {(status === 'occupied' || status === 'exceeded') && session?.client_name && (
                    <span className="text-white font-extrabold text-[7.5px] sm:text-[8px] truncate max-w-full drop-shadow-[0_1.5px_1.5px_rgba(0,0,0,0.95)]">
                        {session.client_name}
                    </span>
                )}
                {status === 'checkout' && (
                    <span className="font-black text-amber-300 text-[7.5px] sm:text-[8px] uppercase tracking-wider drop-shadow-[0_1.5px_1.5px_rgba(0,0,0,0.95)]">
                        COBRAR
                    </span>
                )}
                {status === 'exceeded' && (
                    <span className="font-black text-rose-300 text-[7.5px] sm:text-[8px] uppercase tracking-wider animate-pulse drop-shadow-[0_1.5px_1.5px_rgba(0,0,0,0.95)]">
                        EXCEDIDO
                    </span>
                )}
            </div>
        </button>
    );
});

/**
 * RoundStoolEl — Taburete alto redondo / Mesa redonda (M4-M11).
 * Render: fieltro realístico cargando la imagen mesa-redonda.svg, con capas de estado e información en tiempo real.
 */
const RoundStoolEl = React.memo(function RoundStoolEl({ item, table, session, isSelected, isCanvasRotated, onItemClick, ...props }) {
    const status = useTableStatus(session);
    const rotation = item.r || 0;
    const scale = (item.imgScale || 100) / 100;

    const overlayBg = status === 'free'
        ? 'rgba(0, 0, 0, 0)'
        : status === 'checkout'
            ? 'rgba(217, 119, 6, 0.25)' // Amber/naranja cobro
            : status === 'exceeded'
                ? 'rgba(153, 27, 27, 0.35)' // Crimson/rojo excedido
                : 'rgba(239, 68, 68, 0.15)'; // Red tint for occupied

    const borderStyle = status === 'free' 
        ? '2px solid transparent' 
        : status === 'checkout'
            ? '2.5px dashed #f59e0b'
            : status === 'exceeded'
                ? '2.5px dashed #ef4444'
                : '2.5px solid #ef4444';

    const shadowStyle = status === 'free' ? {} : {
        boxShadow: status === 'checkout' 
            ? '0 0 14px rgba(245, 158, 11, 0.75), inset 0 0 6px rgba(245, 158, 11, 0.35)' 
            : status === 'exceeded'
                ? '0 0 14px rgba(239, 68, 68, 0.8), inset 0 0 6px rgba(239, 68, 68, 0.4)'
                : '0 0 12px rgba(239, 68, 68, 0.65), inset 0 0 4px rgba(239, 68, 68, 0.3)'
    };

    const imgSrc = mesaRedondaSvg;

    const handleClick = (e) => {
        if (onItemClick) {
            onItemClick(table, session);
        } else if (props.onClick) {
            props.onClick(e);
        }
    };

    return (
        <button
            {...props}
            onClick={handleClick}
            style={{
                position: 'absolute',
                left: `${item.x}%`, top: `${item.y}%`,
                width: `${item.w}%`, height: `${item.h}%`,
                outline: isSelected ? '3px solid #f97316' : undefined,
                outlineOffset: '2px',
                zIndex: isSelected ? 30 : undefined,
                background: 'transparent',
                border: 'none',
                filter: 'drop-shadow(0px 3.5px 5px rgba(0,0,0,0.5))',
                ...props.style,
            }}
            className={`group flex items-center justify-center transition-all duration-150 active:scale-[0.98] cursor-pointer touch-target-expand ${status === 'checkout' ? 'checkout-pulsing' : ''} ${props.className || ''}`}
            title={item.label}
        >
            <div
                className="relative overflow-hidden flex items-center justify-center transition-all duration-300"
                style={{
                    height: '100%',
                    aspectRatio: '1/1',
                    borderRadius: '50%',
                    border: borderStyle,
                    ...shadowStyle,
                }}
            >
                <img
                    src={imgSrc}
                    alt={item.label}
                    className="pointer-events-none select-none w-full h-full object-contain"
                    style={{ transform: `rotate(${rotation}deg) scale(${scale})` }}
                    onError={() => console.error(`[FloorPlanView] Error loading RoundStool image (${imgSrc}) for: ${item.label}`)}
                />
                <div 
                    className="absolute inset-0 z-10 pointer-events-none transition-colors duration-300 rounded-full"
                    style={{ backgroundColor: overlayBg }}
                />
                
                {/* Centered text container inside the circle */}
                <div
                    className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-0.5 text-center leading-none select-none px-1 pointer-events-none w-full"
                    style={{
                        transform: isCanvasRotated ? 'rotate(90deg)' : undefined,
                    }}
                >
                    <span className="font-black text-white text-[10px] sm:text-[11px] drop-shadow-[0_1.5px_1.5px_rgba(0,0,0,0.95)]">
                        {item.label}
                    </span>
                    {session?.client_name && (
                        <span className="text-white/95 font-extrabold text-[7.5px] sm:text-[8px] truncate max-w-full drop-shadow-[0_1.5px_1.5px_rgba(0,0,0,0.95)]">
                            {session.client_name}
                        </span>
                    )}
                </div>
            </div>
        </button>
    );
});

/**
 * BarStoolEl — Taburete de barra (B1-B15).
 * Render: círculo compacto plano con etiqueta. Enforce aspect-ratio to keep it a perfect circle.
 */
const BarStoolEl = React.memo(function BarStoolEl({ item, table, session, isSelected, isCanvasRotated, onItemClick, ...props }) {
    const status = useTableStatus(session);
    const rotation = item.r || 0;
    const scale = (item.imgScale || 100) / 100;

    const overlayBg = status === 'free'
        ? 'rgba(0, 0, 0, 0)'
        : status === 'checkout'
            ? 'rgba(217, 119, 6, 0.3)'
            : status === 'exceeded'
                ? 'rgba(239, 68, 68, 0.4)'
                : 'rgba(239, 68, 68, 0.2)'; // Red tint for occupied

    const borderStyle = status === 'free' 
        ? '2px solid transparent' 
        : status === 'checkout'
            ? '2.5px dashed #f59e0b'
            : status === 'exceeded'
                ? '2.5px dashed #ef4444'
                : '2.5px solid #ef4444';

    const shadowStyle = status === 'free' ? {} : {
        boxShadow: status === 'checkout' 
            ? '0 0 14px rgba(245, 158, 11, 0.75), inset 0 0 6px rgba(245, 158, 11, 0.35)' 
            : status === 'exceeded'
                ? '0 0 14px rgba(239, 68, 68, 0.8), inset 0 0 6px rgba(239, 68, 68, 0.4)'
                : '0 0 12px rgba(239, 68, 68, 0.65), inset 0 0 4px rgba(239, 68, 68, 0.3)'
    };

    const imgSrc = bancosSvg;

    const handleClick = (e) => {
        if (onItemClick) {
            onItemClick(table, session);
        } else if (props.onClick) {
            props.onClick(e);
        }
    };

    return (
        <button
            {...props}
            onClick={handleClick}
            style={{
                position: 'absolute',
                left: `${item.x}%`, top: `${item.y}%`,
                width: `${item.w}%`, height: `${item.h}%`,
                outline: isSelected ? '3px solid #f97316' : undefined,
                outlineOffset: '2px',
                zIndex: isSelected ? 30 : undefined,
                background: 'transparent',
                border: 'none',
                ...props.style,
            }}
            className={`group flex items-center justify-center transition-all duration-150 active:scale-[0.98] cursor-pointer touch-target-expand ${status === 'checkout' ? 'checkout-pulsing' : ''} ${props.className || ''}`}
            title={item.label}
        >
            <div
                className="relative overflow-hidden flex items-center justify-center transition-all duration-300"
                style={{
                    height: '90%',
                    aspectRatio: '1/1',
                    borderRadius: '50%',
                    border: borderStyle,
                    ...shadowStyle,
                }}
            >
                <img
                    src={imgSrc}
                    alt={item.label}
                    className="pointer-events-none select-none w-full h-full object-contain"
                    style={{ transform: `rotate(${rotation}deg) scale(${scale})` }}
                    onError={() => console.error(`[FloorPlanView] Error loading BarStool image (${imgSrc}) for: ${item.label}`)}
                />
                <div 
                    className="absolute inset-0 z-10 pointer-events-none transition-colors duration-300 rounded-full"
                    style={{ backgroundColor: overlayBg }}
                />
                
                {/* Centered text container inside the circle */}
                <div
                    className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-0.5 text-center leading-none select-none px-1 pointer-events-none w-full"
                    style={{
                        transform: isCanvasRotated ? 'rotate(90deg)' : undefined,
                    }}
                >
                    <span className="font-black text-white text-[9.5px] sm:text-[10px] drop-shadow-[0_1.5px_1.5px_rgba(0,0,0,0.95)]">
                        {item.label}
                    </span>
                    {session?.client_name && (
                        <span className="text-white/95 font-extrabold text-[7.5px] sm:text-[8px] truncate max-w-full drop-shadow-[0_1.5px_1.5px_rgba(0,0,0,0.95)]">
                            {session.client_name}
                        </span>
                    )}
                </div>
            </div>
        </button>
    );
});

/**
 * BarCounterEl — Mostrador de barra (Barra 1 y Barra 2).
 * Render: bloque plano y sólido sin gradientes ni vetas.
 */
const BarCounterEl = React.memo(function BarCounterEl({ item, isCanvasRotated, onItemClick, ...props }) {
    // Use imgDir if explicitly set, fallback to actual aspect-ratio on 16:9 canvas
    const imgDir = item.imgDir || (item.w * 16 > item.h * 9 ? 'horizontal' : 'vertical');
    const isPortrait = imgDir === 'vertical';
    const rotation = item.r || 0;
    const scale = (item.imgScale || 100) / 100;

    const imageStyle = isPortrait ? {
        position: 'absolute',
        left: 0,
        top: 0,
        width: '100%',
        height: '100%',
        transform: rotation ? `rotate(${rotation}deg) scale(${scale})` : (scale !== 1 ? `scale(${scale})` : undefined),
        objectFit: 'fill',
    } : {
        position: 'absolute',
        left: '50%',
        top: '50%',
        width: `${(item.h / item.w) * 100}%`,
        height: `${(item.w / item.h) * 100}%`,
        transform: `translate(-50%, -50%) rotate(${90 + rotation}deg) scale(${scale})`,
        objectFit: 'fill',
    };

    return (
        <div
            {...props}
            style={{
                position: 'absolute',
                left: `${item.x}%`, top: `${item.y}%`,
                width: `${item.w}%`, height: `${item.h}%`,
                background: 'transparent',
                border: 'none',
                transform: undefined,
                ...props.style,
            }}
            className={`overflow-hidden flex items-center justify-center ${props.className || ''}`}
        >
            <img 
                src={barraSvg} 
                alt={item.label} 
                className="pointer-events-none select-none"
                style={imageStyle}
                onError={() => console.error(`[FloorPlanView] Error loading BarCounter image (${barraSvg}) for: ${item.label || 'Bar'}`)}
            />
            {/* Etiqueta */}
            {item.label && (
                <span
                    className="absolute z-10 font-bold uppercase tracking-wider select-none text-[8.5px] sm:text-[9.5px] text-white font-black drop-shadow-[0_1.5px_1.5px_rgba(0,0,0,0.95)]"
                    style={{
                        writingMode: isPortrait ? 'vertical-rl' : 'horizontal-tb',
                        textOrientation: 'mixed',
                        transform: isPortrait ? 'rotate(180deg)' : undefined,
                    }}
                >
                    {item.label}
                </span>
            )}
        </div>
    );
});

/**
 * EntryEl — Marcador de entrada al local.
 * Render: bloque limpio y técnico de entrada.
 */
const EntryEl = React.memo(function EntryEl({ item, isCanvasRotated, onItemClick, ...props }) {
    const rotation = item.r || 0;
    const isHorizontal = item.w > item.h;
    return (
        <div
            {...props}
            style={{
                position: 'absolute',
                left: `${item.x}%`, top: `${item.y}%`,
                width: `${item.w}%`, height: `${item.h}%`,
                display: 'flex',
                flexDirection: isHorizontal ? 'row' : 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: isHorizontal ? 6 : 2,
                borderRadius: isHorizontal ? '6px 6px 0 0' : '0 6px 6px 0',
                background: '#2f1a05', // Rich dark mahogany wood matching tables M1/M2/M3
                border: '1.5px solid #d97706', // Gold frame border matching the canvas outline
                borderLeft: isHorizontal ? undefined : 'none',
                borderBottom: isHorizontal ? 'none' : undefined,
                transform: rotation ? `rotate(${rotation}deg)` : undefined,
                boxShadow: '0 4px 10px rgba(0,0,0,0.15)',
                ...props.style,
            }}
            className={props.className || ''}
        >
            {/* Flecha de entrada */}
            {isHorizontal ? (
                <div className="flex flex-col items-center gap-0.5">
                    <div style={{
                        width: 0, height: 0,
                        borderLeft: '3.5px solid transparent',
                        borderRight: '3.5px solid transparent',
                        borderBottom: '4.5px solid #f59e0b', // Warm brand gold
                    }} />
                    <div style={{ width: 1.5, height: 6, background: '#f59e0b', borderRadius: 1 }} />
                </div>
            ) : (
                <div className="flex items-center gap-0.5">
                    <div style={{ width: 6, height: 1.5, background: '#f59e0b', borderRadius: 1 }} />
                    <div style={{
                        width: 0, height: 0,
                        borderTop: '3.5px solid transparent',
                        borderBottom: '3.5px solid transparent',
                        borderLeft: '4.5px solid #f59e0b',
                    }} />
                </div>
            )}
            {/* Texto */}
            <span
                className="font-black uppercase select-none text-[8.5px] text-amber-100 tracking-widest drop-shadow-[0_1px_1.5px_rgba(0,0,0,0.85)]"
                style={{
                    writingMode: isHorizontal ? 'horizontal-tb' : 'vertical-rl',
                }}
            >
                Entrada
            </span>
        </div>
    );
});

/**
 * LogoEl — Área de marca central simplificada.
 */
const LogoEl = React.memo(function LogoEl({ item, isCanvasRotated, onItemClick, ...props }) {
    const rotation = item.r || 0;
    const scale = (item.imgScale || 100) / 100;
    return (
        <div
            {...props}
            style={{
                position: 'absolute',
                left: `${item.x}%`, top: `${item.y}%`,
                width: `${item.w}%`, height: `${item.h}%`,
                ...props.style,
            }}
            className={`flex items-center justify-center select-none overflow-hidden ${props.className || ''}`}
        >
            <img 
                src={logoPng} 
                alt="Pool Imperial" 
                className="h-full object-contain select-none pointer-events-none transition-transform duration-300"
                style={{ transform: `rotate(${rotation}deg) scale(${scale})` }}
                onError={() => console.error(`[FloorPlanView] Error loading Logo image (${logoPng})`)}
            />
        </div>
    );
});

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
        <div className="flex items-center gap-4 flex-wrap select-none bg-slate-900/5 px-4 py-2.5 rounded-2xl border border-slate-900/5">
            {[
                { 
                    bg: 'rgba(6, 182, 212, 0.1)', 
                    border: '1.5px solid #06b6d4', 
                    shadow: '0 0 6px rgba(6, 182, 212, 0.6)', 
                    label: 'Ocupada / Jugando' 
                },
                { 
                    bg: 'rgba(245, 158, 11, 0.15)', 
                    border: '1.5px dashed #f59e0b', 
                    shadow: '0 0 6px rgba(245, 158, 11, 0.5)', 
                    label: 'Por cobrar / Pre-cuenta' 
                },
                { 
                    bg: 'rgba(244, 63, 94, 0.2)', 
                    border: '1.5px dashed #f43f5e', 
                    shadow: '0 0 6px rgba(244, 63, 94, 0.6)', 
                    label: 'Tiempo Excedido' 
                },
            ].map(({ bg, border, shadow, label }) => (
                <div key={label} className="flex items-center gap-2">
                    <div 
                        className="w-3.5 h-3.5 rounded" 
                        style={{ 
                            background: bg, 
                            border: border,
                            boxShadow: shadow
                        }} 
                    />
                    <span className="text-[11px] font-bold text-slate-600">{label}</span>
                </div>
            ))}
        </div>
    );
}

// ═══════════════════════════════════════════════════════
// EDITOR SUBCOMPONENT: FloorPlanEditorPanel
// ═══════════════════════════════════════════════════════

const ADD_ITEM_OPTIONS = [
    { type: 'pool_table',  icon: '🎱', label: 'Mesa de billar', interactive: true },
    { type: 'dining_table', icon: '🍽️', label: 'Mesa con sillas', interactive: true },
    { type: 'round_stool', icon: '⭕', label: 'Mesa redonda', interactive: true },
    { type: 'bar_stool',   icon: '🪑', label: 'Banco de barra', interactive: true },
    { type: 'bar_counter', icon: '🍸', label: 'Barra (decorativo)', interactive: false },
    { type: 'entry',       icon: '🚪', label: 'Entrada (decorativo)', interactive: false },
];

// Reglas para reconocer la numeración existente de cada categoría
const NAME_RULES = {
    pool_table:   { match: t => t.type === 'POOL', prefixDefault: 'Mesa Pool ' },
    dining_table: { match: t => t.type !== 'POOL' && /^m\s*\d+$/i.test(t.name.trim()), prefixDefault: 'M' },
    round_stool:  { match: t => t.type !== 'POOL' && /^m\s*\d+$/i.test(t.name.trim()), prefixDefault: 'M' },
    bar_stool:    { match: t => t.type !== 'POOL' && /^b\s*\d+$/i.test(t.name.trim()), prefixDefault: 'B' },
};

/**
 * Sugiere el nombre siguiente según lo que ya existe.
 * - unplaced: mesas que existen en el sistema pero no están en el plano (se sugieren primero).
 * - next: siguiente número libre manteniendo el prefijo más usado (M, B, "Mesa Pool ", "Barra "...).
 */
function suggestNames(type, tables, items, usedTableIds) {
    if (type === 'bar_counter' || type === 'entry') {
        const word = type === 'entry' ? 'Entrada' : 'Barra';
        const same = items.filter(i => i.type === type);
        const nums = same.map(i => parseInt((i.label || '').match(/(\d+)\s*$/)?.[1], 10)).filter(n => !isNaN(n));
        const max = nums.length ? Math.max(...nums) : same.length;
        return { unplaced: [], next: `${word} ${max + 1}` };
    }
    const rule = NAME_RULES[type];
    if (!rule) return { unplaced: [], next: '' };
    const parsed = tables.filter(rule.match).map(t => {
        const m = t.name.trim().match(/^(.*?)(\d+)\s*$/);
        return m ? { t, prefix: m[1], n: parseInt(m[2], 10) } : null;
    }).filter(Boolean);
    const counts = new Map();
    parsed.forEach(p => counts.set(p.prefix, (counts.get(p.prefix) || 0) + 1));
    const prefix = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? rule.prefixDefault;
    const max = parsed.length ? Math.max(...parsed.map(p => p.n)) : 0;
    const unplaced = parsed.filter(p => !usedTableIds.has(p.t.id)).sort((a, b) => a.n - b.n).map(p => p.t.name);
    return { unplaced, next: `${prefix}${max + 1}` };
}

function AddItemSection({ onAdd, tables = [], items = [], usedTableIds = new Set() }) {
    const [type, setType] = useState('pool_table');
    const [name, setName] = useState('');
    const [busy, setBusy] = useState(false);
    const opt = ADD_ITEM_OPTIONS.find(o => o.type === type);
    // Las mesas pendientes de crear (aún sin guardar) cuentan para la numeración
    const pendingTables = useMemo(
        () => items.filter(i => i.pendingCreate && i.refName).map(i => ({ id: `pending:${i.id}`, name: i.refName, type: i.type === 'pool_table' ? 'POOL' : 'NORMAL' })),
        [items]
    );
    const suggestion = useMemo(
        () => suggestNames(
            type,
            [...tables, ...pendingTables],
            items,
            new Set([...usedTableIds, ...pendingTables.map(t => t.id)])
        ),
        [type, tables, pendingTables, items, usedTableIds]
    );
    const primarySuggestion = suggestion.unplaced[0] || suggestion.next;

    // Prefija el campo con la sugerencia al cambiar de categoría o cuando cambia la numeración
    useEffect(() => { setName(primarySuggestion); }, [type, primarySuggestion]);

    const submit = async () => {
        if (busy) return;
        setBusy(true);
        try {
            await onAdd(type, name.trim());
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="p-4 flex flex-col gap-3 text-slate-800">
            <div>
                <h3 className="font-extrabold text-sm text-slate-900">Añadir al plano</h3>
                <p className="text-[10px] text-slate-500 font-semibold mt-0.5">O selecciona un elemento del plano para editarlo o eliminarlo.</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
                {ADD_ITEM_OPTIONS.map(o => (
                    <button
                        key={o.type}
                        onClick={() => setType(o.type)}
                        className={`py-2 px-2 border rounded-xl text-[10.5px] font-black transition-all active:scale-95 text-left flex items-center gap-1.5 ${type === o.type ? 'bg-amber-500 border-amber-600 text-white shadow-sm' : 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700'}`}
                    >
                        <span>{o.icon}</span><span>{o.label}</span>
                    </button>
                ))}
            </div>
            <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">
                    {opt.interactive ? 'Nombre de la mesa (obligatorio)' : 'Etiqueta (opcional)'}
                </label>
                <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
                    placeholder={opt.interactive ? 'Ej: Mesa Pool 4, M12, B16' : ''}
                    className="w-full bg-slate-50 border border-slate-250 rounded-xl px-3 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                {opt.interactive && (
                    <p className="text-[9.5px] text-slate-400 font-semibold mt-1">Si la mesa ya existe se vincula; si no, se crea una nueva.</p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="text-[9.5px] font-black uppercase tracking-wider text-slate-400">Sugerido:</span>
                    <button
                        onClick={() => setName(suggestion.next)}
                        className="px-2 py-0.5 rounded-full text-[10.5px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300 hover:bg-emerald-200 active:scale-95"
                        title="Siguiente número libre"
                    >
                        {suggestion.next} <span className="font-semibold opacity-70">(nuevo)</span>
                    </button>
                    {suggestion.unplaced.map(n => (
                        <button
                            key={n}
                            onClick={() => setName(n)}
                            className="px-2 py-0.5 rounded-full text-[10.5px] font-black bg-amber-100 text-amber-800 border border-amber-300 hover:bg-amber-200 active:scale-95"
                            title="Existe en el sistema pero no está en el plano"
                        >
                            {n} <span className="font-semibold opacity-70">(sin colocar)</span>
                        </button>
                    ))}
                </div>
            </div>
            <button
                onClick={submit}
                disabled={busy || (opt.interactive && !name.trim())}
                className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-extrabold text-xs px-3 py-2 rounded-xl shadow-sm transition-all active:scale-95"
            >
                {busy ? 'Añadiendo...' : '➕ Añadir al plano'}
            </button>
        </div>
    );
}

const TUTORIAL_STEPS = [
    {
        icon: '🖱️', title: 'Mover y editar un elemento',
        body: 'Arrastra cualquier mesa, banco o barra para moverla. Haz clic para seleccionarla: el panel derecho muestra su nombre, posición (X e Y en %), tamaño, orientación y la mesa real vinculada.',
        tip: 'Con las flechas del teclado la mueves 0,5% (Shift = 2%).',
    },
    {
        icon: '➕', title: 'Añadir mesas, bancos y barras',
        body: 'Haz clic en un área vacía para deseleccionar y verás "Añadir al plano". Elige el tipo; el sistema reconoce la numeración que ya tienes y sugiere el siguiente nombre (M16, B16, Pool 4…). Las mesas que existen pero no están en el plano salen como "sin colocar".',
        tip: 'Las mesas nuevas se crean en el sistema solo cuando pulsas Guardar Cambios.',
    },
    {
        icon: '🗑️', title: 'Quitar del plano',
        body: 'Selecciona el elemento y pulsa "Quitar del plano" o la tecla Supr. Al guardar, la mesa también se elimina de Ajustes → Mesas, así el plano y el sistema siempre coinciden. Una mesa con sesión activa no se puede quitar.',
        tip: 'Hasta que guardes puedes recuperar todo con Deshacer.',
    },
    {
        icon: '▭', title: 'Seleccionar un lote (zona)',
        body: 'Arrastra sobre un área vacía para dibujar un rectángulo y seleccionar todo lo que toque. Si empiezas encima de una mesa, mantén Ctrl (o Cmd) mientras arrastras para no agarrarla. Shift + clic suma o quita elementos.',
        tip: 'Arrastra uno del grupo para mover todo el grupo.',
    },
    {
        icon: '📄', title: 'Clonar con el nombre correcto',
        body: 'Con un elemento o un lote seleccionado pulsa "Clonar" (o Ctrl+D). Cada mesa recibe el siguiente nombre libre sin repetir: si hay hasta M15, el lote de 8 mesas sale como M16 a M23.',
        tip: 'Las copias quedan seleccionadas; muévelas a su sitio.',
    },
    {
        icon: '▦', title: 'Ordenar en cuadrícula',
        body: 'Con varios elementos seleccionados pulsa "Ordenar en cuadrícula". Se muestra en azul la ubicación sugerida (filas y columnas rectas, paralelas y con espacio uniforme). Si algo chocaría sale en rojo y se ofrece reducir el tamaño. Tú decides: Aplicar o Descartar.',
        tip: 'Funciona mejor con elementos parecidos: ordena un grupo cada vez.',
    },
    {
        icon: '📐', title: 'Alinear, distribuir y mover en conjunto',
        body: 'Con un lote seleccionado también puedes alinear (izquierda, centro, derecha, arriba, medio, abajo), distribuir en horizontal o vertical (3 o más) y moverlo con las flechas del panel.',
        tip: 'Todo se puede deshacer con ↩ Deshacer o Ctrl+Z.',
    },
    {
        icon: '💾', title: 'Guardar, cancelar y recuperar',
        body: 'Guardar Cambios sincroniza el plano con todos los dispositivos y crea o elimina las mesas necesarias (antes te muestra la lista para confirmar). Cancelar descarta los cambios. "Restaurar plano" carga el diseño original como borrador, sin perder nada hasta que guardes.',
        tip: 'Si cambias de sección sin guardar, el borrador se recupera al volver. "Sin guardar" indica cambios pendientes.',
    },
];

function FloorPlanTutorial({ onClose }) {
    const [step, setStep] = useState(0);
    const last = TUTORIAL_STEPS.length - 1;
    const cur = TUTORIAL_STEPS[step];

    useEffect(() => {
        const onKey = (e) => {
            if (e.key === 'Escape') onClose();
            else if (e.key === 'ArrowRight') setStep(s => Math.min(last, s + 1));
            else if (e.key === 'ArrowLeft') setStep(s => Math.max(0, s - 1));
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [last, onClose]);

    return (
        <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/55 p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-5 py-3 bg-amber-50 border-b border-amber-200">
                    <span className="text-[11px] font-black uppercase tracking-wider text-amber-800">Tutorial del editor · {step + 1} de {TUTORIAL_STEPS.length}</span>
                    <button onClick={onClose} className="p-1 rounded hover:bg-amber-100 text-amber-700" aria-label="Cerrar tutorial">✕</button>
                </div>
                <div className="p-5 min-h-[230px]">
                    <div className="text-3xl mb-2">{cur.icon}</div>
                    <h3 className="font-extrabold text-base text-slate-900 mb-2">{cur.title}</h3>
                    <p className="text-sm text-slate-700 leading-relaxed">{cur.body}</p>
                    <p className="mt-3 text-xs font-bold text-sky-800 bg-sky-50 border border-sky-200 rounded-lg px-3 py-2">💡 {cur.tip}</p>
                </div>
                <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100">
                    <div className="flex gap-1.5">
                        {TUTORIAL_STEPS.map((_, i) => (
                            <button
                                key={i}
                                onClick={() => setStep(i)}
                                className={`h-2 rounded-full transition-all ${i === step ? 'w-5 bg-amber-500' : 'w-2 bg-slate-300 hover:bg-slate-400'}`}
                                aria-label={`Paso ${i + 1}`}
                            />
                        ))}
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setStep(s => Math.max(0, s - 1))}
                            disabled={step === 0}
                            className="px-3 py-1.5 rounded-lg text-xs font-extrabold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 disabled:opacity-40 active:scale-95"
                        >
                            ← Anterior
                        </button>
                        {step < last ? (
                            <button onClick={() => setStep(s => s + 1)} className="px-3 py-1.5 rounded-lg text-xs font-extrabold bg-amber-500 hover:bg-amber-600 text-white active:scale-95">Siguiente →</button>
                        ) : (
                            <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-xs font-extrabold bg-emerald-600 hover:bg-emerald-700 text-white active:scale-95">Entendido</button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

/**
 * Propone una cuadrícula (filas y columnas paralelas) para los elementos g.
 * - Agrupa por cercanía de centros usando el tamaño de cada elemento (no mezcla tamaños distintos).
 * - Si el espacio uniforme provoca choques, usa solo el promedio de cada fila/columna.
 * - Los elementos que aun así chocarían se quedan en su sitio (kept).
 * - Si es viable (>=50 %), ofrece una variante reduciendo el tamaño del conjunto para que quepan.
 */
function buildGridProposal(g) {
    const EPS = 0.05;
    const cx = (i) => i.x + i.w / 2;
    const cy = (i) => i.y + i.h / 2;
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const orig = new Map(g.map(i => [i.id, i]));

    const clusters = (items, center, dim) => {
        const sorted = [...items].sort((a, b) => center(a) - center(b));
        const groups = [];
        sorted.forEach(it => {
            const lastGroup = groups[groups.length - 1];
            const prev = lastGroup && lastGroup[lastGroup.length - 1];
            if (prev && center(it) - center(prev) <= 0.5 * Math.min(dim(it), dim(prev))) lastGroup.push(it);
            else groups.push([it]);
        });
        return groups;
    };
    const centersOf = (groups, center, uniform) => {
        const means = groups.map(gr => gr.reduce((t, i) => t + center(i), 0) / gr.length);
        if (!uniform || means.length < 3) return means;
        const first = means[0], last = means[means.length - 1];
        return means.map((_, k) => first + ((last - first) * k) / (means.length - 1));
    };
    const place = (uniform) => {
        const cols = clusters(g, cx, i => i.w);
        const rows = clusters(g, cy, i => i.h);
        const colX = centersOf(cols, cx, uniform);
        const rowY = centersOf(rows, cy, uniform);
        const colOf = new Map(); cols.forEach((gr, k) => gr.forEach(i => colOf.set(i.id, colX[k])));
        const rowOf = new Map(); rows.forEach((gr, k) => gr.forEach(i => rowOf.set(i.id, rowY[k])));
        return g.map(i => ({
            id: i.id, w: i.w, h: i.h,
            x: parseFloat(clamp(colOf.get(i.id) - i.w / 2, 0, 100 - i.w).toFixed(2)),
            y: parseFloat(clamp(rowOf.get(i.id) - i.h / 2, 0, 100 - i.h).toFixed(2)),
        }));
    };
    const hit = (a, b) => a.x < b.x + b.w - EPS && a.x + a.w - EPS > b.x && a.y < b.y + b.h - EPS && a.y + a.h - EPS > b.y;
    // Choques nuevos: los que ya existían antes de ordenar no cuentan
    const newClashes = (list) => {
        const out = [];
        for (let a = 0; a < list.length; a++) {
            for (let b = a + 1; b < list.length; b++) {
                if (hit(list[a], list[b]) && !hit(orig.get(list[a].id), orig.get(list[b].id))) out.push([list[a], list[b]]);
            }
        }
        return out;
    };

    let items = place(true);
    if (newClashes(items).length) items = place(false);

    // Variante reduciendo tamaño (solo si hace falta y es razonable)
    let shrink = null;
    let shrinkPct = 100;
    const clashes0 = newClashes(items);
    if (clashes0.length) {
        const f = Math.min(...clashes0.map(([a, b]) => {
            const dx = Math.abs(cx(a) - cx(b)), dy = Math.abs(cy(a) - cy(b));
            return Math.max(dx / ((a.w + b.w) / 2), dy / ((a.h + b.h) / 2));
        }));
        if (f >= 0.5 && f < 1) {
            const factor = f * 0.97;
            const scaled = items.map(it => {
                const w = parseFloat((it.w * factor).toFixed(2));
                const h = parseFloat((it.h * factor).toFixed(2));
                return { id: it.id, w, h, x: parseFloat(clamp(cx(it) - w / 2, 0, 100 - w).toFixed(2)), y: parseFloat(clamp(cy(it) - h / 2, 0, 100 - h).toFixed(2)) };
            });
            if (!newClashes(scaled).length) { shrink = scaled; shrinkPct = Math.round(factor * 100); }
        }
    }

    // Los que seguirían chocando se quedan donde estaban
    const kept = new Set();
    for (let guard = 0; guard < g.length; guard++) {
        const pairs = newClashes(items);
        if (!pairs.length) break;
        const [a, b] = pairs[0];
        const disp = (it) => Math.hypot(it.x - orig.get(it.id).x, it.y - orig.get(it.id).y);
        const loser = disp(a) >= disp(b) ? a : b;
        const o = orig.get(loser.id);
        items = items.map(it => (it.id === loser.id ? { ...it, x: o.x, y: o.y } : it));
        kept.add(loser.id);
    }
    return { items, kept: [...kept], shrink, shrinkPct };
}

function MultiSelectionSection({ count, isRotated, onClone, onDelete, onClear, onAlign, onMove, hasPreview, previewInfo, onApplyPreview, onCancelPreview }) {
    const btn = "bg-slate-100 hover:bg-slate-200 py-1.5 border border-slate-200 rounded-lg text-[10.5px] font-black active:scale-95 text-slate-700";
    const arrow = "w-9 h-8 bg-slate-100 hover:bg-slate-200 border border-slate-200 active:scale-90 transition-all rounded-lg flex items-center justify-center text-xs font-bold";
    return (
        <div className="p-4 flex flex-col gap-4 text-slate-800 select-none">
            <div className="flex items-start justify-between">
                <div>
                    <h3 className="font-extrabold text-sm text-slate-900">{count} elementos seleccionados</h3>
                    <p className="text-[10px] text-slate-500 font-semibold mt-0.5">Arrastra uno para mover todo el grupo. Shift+clic suma o quita elementos.</p>
                </div>
                <button onClick={onClear} className="p-1 rounded hover:bg-slate-200 text-slate-400">✕</button>
            </div>

            <div className="grid grid-cols-2 gap-2">
                <button onClick={onClone} className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs px-3 py-2 rounded-xl shadow-sm active:scale-95">📄 Clonar</button>
                <button onClick={onDelete} className="bg-rose-100 hover:bg-rose-200 border border-rose-300 text-rose-800 font-extrabold text-xs px-3 py-2 rounded-xl active:scale-95">🗑️ Quitar</button>
            </div>
            <p className="text-[9.5px] text-slate-400 font-semibold -mt-2">Al clonar, cada mesa recibe el siguiente nombre libre (sin repetir). Las mesas nuevas se crean al guardar.</p>

            {hasPreview ? (
                <div className="bg-sky-50 border border-sky-300 rounded-xl p-3 flex flex-col gap-2">
                    <p className="text-[10.5px] font-bold text-sky-900">Ubicación sugerida (contorno azul en el plano): mismas filas y columnas que ya tienes, pero rectas, paralelas y con espacio uniforme.</p>
                    {previewInfo?.kept > 0 && (
                        <p className="text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2">
                            {previewInfo.kept} elemento(s) en rojo se quedan donde están porque, si no, chocarían con otro.
                            {previewInfo.shrinkPct ? ` Puedes reducir el tamaño al ${previewInfo.shrinkPct}% para que todos quepan en la cuadrícula.` : ' No caben ni reduciendo el tamaño al 50 %: sepáralos o quita alguno.'}
                        </p>
                    )}
                    {previewInfo?.shrinkPct && (
                        <button onClick={() => onApplyPreview(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs px-3 py-2 rounded-lg active:scale-95">↘ Reducir al {previewInfo.shrinkPct}% y ordenar todo</button>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                        <button onClick={() => onApplyPreview(false)} className="bg-sky-600 hover:bg-sky-700 text-white font-extrabold text-xs px-3 py-2 rounded-lg active:scale-95">✔ Aplicar</button>
                        <button onClick={onCancelPreview} className="bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 font-extrabold text-xs px-3 py-2 rounded-lg active:scale-95">Descartar</button>
                    </div>
                </div>
            ) : (
                <>
                    <button
                        onClick={() => onAlign('grid')}
                        className="bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-xs px-3 py-2.5 rounded-xl shadow-sm active:scale-95"
                        title="Sugiere filas y columnas paralelas con espacio uniforme, según cómo ya están"
                    >
                        ▦ Ordenar en cuadrícula
                    </button>
                    <p className="text-[9.5px] text-slate-400 font-semibold -mt-2">Primero muestra la ubicación sugerida, según cómo están ahora; tú decides si aplicarla.</p>
                </>
            )}

            <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-2">Distribuir (3 o más)</label>
                <div className="grid grid-cols-2 gap-2">
                    <button className={`${btn} disabled:opacity-40`} disabled={count < 3} onClick={() => onAlign(isRotated ? 'distY' : 'distX')}>↔ Horizontal</button>
                    <button className={`${btn} disabled:opacity-40`} disabled={count < 3} onClick={() => onAlign(isRotated ? 'distX' : 'distY')}>↕ Vertical</button>
                </div>
            </div>

            <div className="border-t border-slate-100 pt-3">
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-2">Mover en conjunto</label>
                <div className="flex flex-col items-center gap-1 w-full max-w-[130px] mx-auto">
                    <button className={arrow} onClick={() => onMove(0, -0.5)} title="Arriba 0.5%">▲</button>
                    <div className="flex items-center gap-3">
                        <button className={arrow} onClick={() => onMove(-0.5, 0)} title="Izquierda 0.5%">◄</button>
                        <button className={arrow} onClick={() => onMove(0.5, 0)} title="Derecha 0.5%">►</button>
                    </div>
                    <button className={arrow} onClick={() => onMove(0, 0.5)} title="Abajo 0.5%">▼</button>
                </div>
            </div>
        </div>
    );
}

function FloorPlanEditorPanel({ selectedItemId, items, setItems, onClose, onAdd, onDelete, onDuplicate, tables = [], linkedTable = null, usedTableIds = new Set(), multiCount = 0, onCloneSelection, onDeleteSelection, onClearSelection, onAlign, onMoveSelection, isRotated = false, hasPreview, previewInfo, onApplyPreview, onCancelPreview }) {
    const selectedItem = items.find(it => it.id === selectedItemId);

    const updateLink = (tableId) => {
        if (!selectedItemId) return;
        const t = tables.find(x => x.id === tableId);
        setItems(prev => prev.map(it => {
            if (it.id !== selectedItemId) return it;
            if (!t) {
                const { tableId: _drop, pendingCreate: _pc, ...rest } = it;
                return { ...rest, refName: '' };
            }
            const { pendingCreate: _pc2, ...keep } = it;
            return { ...keep, tableId: t.id, refName: t.name };
        }));
    };
    const isRatioLocked = selectedItem?.ratioLocked || false;

    const updateProp = (prop, val) => {
        if (!selectedItemId) return;
        setItems(prev => prev.map(it => {
            if (it.id !== selectedItemId) return it;
            if (prop === 'ratioLocked') {
                return { ...it, ratioLocked: !!val };
            }
            if (prop === 'label' || prop === 'imgDir') {
                return { ...it, [prop]: val };
            }
            const parsed = parseFloat(val);
            const safeVal = isNaN(parsed) ? 0 : parsed;

            // Mantiene el elemento dentro del lienzo (0–100 %) tras cualquier cambio.
            const fit = (next) => {
                const w = Math.max(1, Math.min(100, next.w));
                const h = Math.max(1, Math.min(100, next.h));
                return {
                    ...next, w, h,
                    x: parseFloat(Math.max(0, Math.min(100 - w, next.x)).toFixed(2)),
                    y: parseFloat(Math.max(0, Math.min(100 - h, next.y)).toFixed(2)),
                };
            };

            const isLocked = it.ratioLocked || false;
            if (prop === 'w' || prop === 'h') {
                const size = Math.max(1, Math.min(100, safeVal));
                if (isLocked) {
                    const ratio = (it.h || 1) / (it.w || 1);
                    const newW = prop === 'w' ? size : parseFloat((size / ratio).toFixed(2));
                    const newH = prop === 'h' ? size : parseFloat((size * ratio).toFixed(2));
                    if (newW > 100 || newH > 100 || newW < 1 || newH < 1) return it;
                    return fit({ ...it, w: newW, h: newH });
                }
                return fit({ ...it, [prop]: parseFloat(size.toFixed(2)) });
            }

            return fit({ ...it, [prop]: parseFloat(safeVal.toFixed(2)) });
        }));
    };

    // Flechas en términos de pantalla: con el plano girado, derecha/izquierda mueven Y y arriba/abajo mueven X (invertido)
    const nudgeScreen = (sx, sy) => {
        if (isRotated) {
            if (sy) nudge('x', -sy);
            if (sx) nudge('y', sx);
        } else {
            if (sx) nudge('x', sx);
            if (sy) nudge('y', sy);
        }
    };

    const nudge = (prop, delta) => {
        if (!selectedItem) return;
        const current = selectedItem[prop] || 0;
        const maxLimit = (prop === 'x' || prop === 'w') ? 100 - (prop === 'x' ? selectedItem.w : 0) : 100 - (prop === 'y' ? selectedItem.h : 0);
        const minLimit = (prop === 'w' || prop === 'h') ? 1 : 0;
        const nextVal = Math.max(minLimit, Math.min(maxLimit, current + delta));
        updateProp(prop, nextVal);
    };

    const setOrientation = (dir) => {
        if (!selectedItem) return;
        const w = selectedItem.w;
        const h = selectedItem.h;
        const isCurrentPortrait = w * 16 < h * 9;
        const wantPortrait = dir === 'vertical';
        
        if (isCurrentPortrait !== wantPortrait) {
            const nextW = h;
            const nextH = w;
            const newX = Math.max(0, Math.min(100 - nextW, selectedItem.x));
            const newY = Math.max(0, Math.min(100 - nextH, selectedItem.y));
            
            setItems(prev => prev.map(it => 
                it.id === selectedItemId ? {
                    ...it,
                    w: parseFloat(nextW.toFixed(2)),
                    h: parseFloat(nextH.toFixed(2)),
                    x: parseFloat(newX.toFixed(2)),
                    y: parseFloat(newY.toFixed(2)),
                    ...(it.type === 'pool_table' || it.type === 'dining_table' || it.type === 'logo' || it.type === 'bar_counter' ? { imgDir: dir } : {})
                } : it
            ));
        }
    };

    const handleRotate90 = () => {
        if (!selectedItem) return;
        const nextW = selectedItem.h;
        const nextH = selectedItem.w;
        const newX = Math.max(0, Math.min(100 - nextW, selectedItem.x));
        const newY = Math.max(0, Math.min(100 - nextH, selectedItem.y));
        const nextImgDir = nextH > nextW ? 'vertical' : 'horizontal';
        setItems(prev => prev.map(it => 
            it.id === selectedItemId ? {
                ...it,
                w: parseFloat(nextW.toFixed(2)),
                h: parseFloat(nextH.toFixed(2)),
                x: parseFloat(newX.toFixed(2)),
                y: parseFloat(newY.toFixed(2)),
                ...(it.type === 'pool_table' || it.type === 'dining_table' || it.type === 'logo' || it.type === 'bar_counter' ? { imgDir: nextImgDir } : {})
            } : it
        ));
    };

    if (multiCount > 1) {
        return <MultiSelectionSection count={multiCount} isRotated={isRotated} onClone={onCloneSelection} onDelete={onDeleteSelection} onClear={onClearSelection} onAlign={onAlign} onMove={onMoveSelection} hasPreview={hasPreview} previewInfo={previewInfo} onApplyPreview={onApplyPreview} onCancelPreview={onCancelPreview} />;
    }

    if (!selectedItem) {
        return <AddItemSection onAdd={onAdd} tables={tables} items={items} usedTableIds={usedTableIds} />;
    }

    return (
        <div className="flex flex-col h-full text-slate-800 select-none">
            {/* Header */}
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <div>
                    <h3 className="font-extrabold text-sm text-slate-900">Editar Propiedades</h3>
                    <p className="text-[9.5px] text-slate-500 font-bold uppercase tracking-wider mt-0.5">
                        {selectedItem.label || selectedItem.id} ({selectedItem.type.replace('_', ' ')})
                    </p>
                </div>
                <button 
                    onClick={onClose}
                    className="p-1 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-650 transition-colors"
                >
                    ✕
                </button>
            </div>

            {/* Fields */}
            <div className="p-4 flex flex-col gap-4 flex-1 overflow-y-auto">
                {/* Etiqueta / Nombre */}
                <div>
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">Nombre / Etiqueta</label>
                    <input 
                        type="text"
                        value={selectedItem.label || ''}
                        onChange={(e) => updateProp('label', e.target.value)}
                        className="w-full bg-slate-50 border border-slate-250 rounded-xl px-3 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                </div>

                {/* Mesa real vinculada (solo elementos interactivos) */}
                {selectedItem.interactive && (
                    <div>
                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">Mesa vinculada</label>
                        <select
                            value={linkedTable?.id || ''}
                            onChange={(e) => updateLink(e.target.value)}
                            className={`w-full bg-slate-50 border rounded-xl px-3 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-amber-500 ${(linkedTable || selectedItem.pendingCreate) ? 'border-slate-250' : 'border-rose-400'}`}
                        >
                            <option value="">— Sin vincular —</option>
                            {tables
                                .filter(t => selectedItem.type === 'pool_table' ? t.type === 'POOL' : t.type !== 'POOL')
                                .map(t => (
                                    <option key={t.id} value={t.id} disabled={usedTableIds.has(t.id) && t.id !== linkedTable?.id}>
                                        {t.name}{usedTableIds.has(t.id) && t.id !== linkedTable?.id ? ' (ya en el plano)' : ''}
                                    </option>
                                ))}
                        </select>
                        {!linkedTable && selectedItem.pendingCreate && (
                            <p className="text-[9.5px] text-emerald-700 font-bold mt-1">La mesa «{selectedItem.refName}» se creará al pulsar Guardar Cambios.</p>
                        )}
                        {!linkedTable && !selectedItem.pendingCreate && (
                            <p className="text-[9.5px] text-rose-600 font-bold mt-1">Este elemento no está vinculado a ninguna mesa: no se podrá abrir en el plano.</p>
                        )}
                    </div>
                )}

                {/* Posición X */}
                <div>
                    <div className="flex items-center justify-between mb-1">
                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Posición Horizontal (X)</label>
                        <div className="flex items-center gap-1">
                            <input 
                                type="number"
                                min="0"
                                max={(100 - selectedItem.w).toFixed(1)}
                                step="0.1"
                                value={selectedItem.x}
                                onChange={(e) => updateProp('x', e.target.value)}
                                className="w-16 text-right bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-xs font-bold font-mono focus:outline-none focus:ring-1 focus:ring-amber-500"
                            />
                            <span className="text-xs font-bold text-slate-500 font-mono">%</span>
                        </div>
                    </div>
                    <input 
                        type="range"
                        min="0"
                        max={(100 - selectedItem.w).toFixed(1)}
                        step="0.1"
                        value={selectedItem.x}
                        onChange={(e) => updateProp('x', e.target.value)}
                        className="w-full accent-amber-500"
                    />
                </div>

                {/* Posición Y */}
                <div>
                    <div className="flex items-center justify-between mb-1">
                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Posición Vertical (Y)</label>
                        <div className="flex items-center gap-1">
                            <input 
                                type="number"
                                min="0"
                                max={(100 - selectedItem.h).toFixed(1)}
                                step="0.1"
                                value={selectedItem.y}
                                onChange={(e) => updateProp('y', e.target.value)}
                                className="w-16 text-right bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-xs font-bold font-mono focus:outline-none focus:ring-1 focus:ring-amber-500"
                            />
                            <span className="text-xs font-bold text-slate-500 font-mono">%</span>
                        </div>
                    </div>
                    <input 
                        type="range"
                        min="0"
                        max={(100 - selectedItem.h).toFixed(1)}
                        step="0.1"
                        value={selectedItem.y}
                        onChange={(e) => updateProp('y', e.target.value)}
                        className="w-full accent-amber-500"
                    />
                </div>

                {/* Dimensiones con Candado de Proporción */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Tamaño del Elemento</span>
                        <button
                            onClick={() => updateProp('ratioLocked', !isRatioLocked)}
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[9.5px] font-black border transition-all active:scale-95 ${
                                isRatioLocked 
                                ? 'bg-amber-500 border-amber-600 text-white shadow-sm' 
                                : 'bg-slate-100 border-slate-250 text-slate-600 hover:bg-slate-200'
                            }`}
                            title={isRatioLocked ? "Proporción bloqueada (Clic para desbloquear)" : "Mantener proporción (Clic para bloquear)"}
                        >
                            <span>{isRatioLocked ? '🔒' : '🔓'}</span>
                            <span>{isRatioLocked ? 'Bloqueado' : 'Mantener'}</span>
                        </button>
                    </div>

                    {/* Ancho W */}
                    <div>
                        <div className="flex items-center justify-between mb-1">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Ancho (W)</label>
                            <div className="flex items-center gap-1">
                                <input 
                                    type="number"
                                    min="1"
                                    max="100"
                                    step="0.1"
                                    value={selectedItem.w}
                                    onChange={(e) => updateProp('w', e.target.value)}
                                    className="w-16 text-right bg-white border border-slate-250 rounded px-1.5 py-0.5 text-xs font-bold font-mono focus:outline-none focus:ring-1 focus:ring-amber-500"
                                />
                                <span className="text-xs font-bold text-slate-500 font-mono">%</span>
                            </div>
                        </div>
                        <input 
                            type="range"
                            min="1"
                            max="100"
                            step="0.1"
                            value={selectedItem.w}
                            onChange={(e) => updateProp('w', e.target.value)}
                            className="w-full accent-amber-500"
                        />
                    </div>

                    {/* Alto H */}
                    <div>
                        <div className="flex items-center justify-between mb-1">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Alto (H)</label>
                            <div className="flex items-center gap-1">
                                <input 
                                    type="number"
                                    min="1"
                                    max="100"
                                    step="0.1"
                                    value={selectedItem.h}
                                    onChange={(e) => updateProp('h', e.target.value)}
                                    className="w-16 text-right bg-white border border-slate-250 rounded px-1.5 py-0.5 text-xs font-bold font-mono focus:outline-none focus:ring-1 focus:ring-amber-500"
                                />
                                <span className="text-xs font-bold text-slate-500 font-mono">%</span>
                            </div>
                        </div>
                        <input 
                            type="range"
                            min="1"
                            max="100"
                            step="0.1"
                            value={selectedItem.h}
                            onChange={(e) => updateProp('h', e.target.value)}
                            className="w-full accent-amber-500"
                        />
                    </div>
                </div>

                {/* Nudge Arrow Pad (Mover) */}
                <div className="border-t border-slate-100 pt-3">
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-2">Desplazamiento Preciso</label>
                    <div className="flex flex-col items-center gap-1 w-full max-w-[130px] mx-auto">
                        <button 
                            onClick={() => nudgeScreen(0, -0.5)}
                            className="w-9 h-8 bg-slate-100 hover:bg-slate-200 border border-slate-200 active:scale-90 transition-all rounded-lg flex items-center justify-center text-xs font-bold"
                            title="Mover arriba 0.5%"
                        >
                            ▲
                        </button>
                        <div className="flex items-center gap-3">
                            <button 
                                onClick={() => nudgeScreen(-0.5, 0)}
                                className="w-9 h-8 bg-slate-100 hover:bg-slate-200 border border-slate-200 active:scale-90 transition-all rounded-lg flex items-center justify-center text-xs font-bold"
                                title="Mover izquierda 0.5%"
                            >
                                ◄
                            </button>
                            <button 
                                onClick={() => nudgeScreen(0.5, 0)}
                                className="w-9 h-8 bg-slate-100 hover:bg-slate-200 border border-slate-200 active:scale-90 transition-all rounded-lg flex items-center justify-center text-xs font-bold"
                                title="Mover derecha 0.5%"
                            >
                                ►
                            </button>
                        </div>
                        <button 
                            onClick={() => nudgeScreen(0, 0.5)}
                            className="w-9 h-8 bg-slate-100 hover:bg-slate-200 border border-slate-200 active:scale-90 transition-all rounded-lg flex items-center justify-center text-xs font-bold"
                            title="Mover abajo 0.5%"
                        >
                            ▼
                        </button>
                    </div>
                </div>

                {/* Dimension Adjustment Buttons */}
                <div className="border-t border-slate-100 pt-3">
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-2">Ajuste de Tamaño</label>
                    <div className="grid grid-cols-2 gap-2 text-xs font-bold">
                        <div className="flex flex-col gap-1">
                            <span className="text-[9px] font-black tracking-wide text-slate-400 uppercase text-center">Ancho</span>
                            <div className="flex items-center gap-1 justify-center">
                                <button 
                                    onClick={() => nudge('w', -0.5)}
                                    className="bg-slate-100 hover:bg-slate-200 py-1 border border-slate-200 rounded-lg active:scale-95 flex-1 text-center"
                                >
                                    -W
                                </button>
                                <button 
                                    onClick={() => nudge('w', 0.5)}
                                    className="bg-slate-100 hover:bg-slate-200 py-1 border border-slate-200 rounded-lg active:scale-95 flex-1 text-center"
                                >
                                    +W
                                </button>
                            </div>
                        </div>

                        <div className="flex flex-col gap-1">
                            <span className="text-[9px] font-black tracking-wide text-slate-400 uppercase text-center">Alto</span>
                            <div className="flex items-center gap-1 justify-center">
                                <button 
                                    onClick={() => nudge('h', -0.5)}
                                    className="bg-slate-100 hover:bg-slate-200 py-1 border border-slate-200 rounded-lg active:scale-95 flex-1 text-center"
                                >
                                    -H
                                </button>
                                <button 
                                    onClick={() => nudge('h', 0.5)}
                                    className="bg-slate-100 hover:bg-slate-200 py-1 border border-slate-200 rounded-lg active:scale-95 flex-1 text-center"
                                >
                                    +H
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Orientación y Rotación rápida */}
                <div className="border-t border-slate-100 pt-3">
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-2">Orientación y Rotación</label>
                    <div className="grid grid-cols-3 gap-2">
                        <button 
                            onClick={() => setOrientation('horizontal')}
                            className={`py-1.5 border rounded-lg text-[10.5px] font-black transition-all active:scale-95 text-center ${selectedItem.w * 16 >= selectedItem.h * 9 ? 'bg-amber-500 border-amber-600 text-white shadow-sm' : 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700'}`}
                            title="Ajustar como horizontal (Ancho > Alto)"
                        >
                            Horizontal
                        </button>
                        <button 
                            onClick={() => setOrientation('vertical')}
                            className={`py-1.5 border rounded-lg text-[10.5px] font-black transition-all active:scale-95 text-center ${selectedItem.w * 16 < selectedItem.h * 9 ? 'bg-amber-500 border-amber-600 text-white shadow-sm' : 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700'}`}
                            title="Ajustar como vertical (Alto > Ancho)"
                        >
                            Vertical
                        </button>
                        <button 
                            onClick={handleRotate90}
                            className="bg-slate-100 hover:bg-slate-200 py-1.5 border border-slate-200 rounded-lg text-[10.5px] font-black transition-all active:scale-95 text-center text-slate-700 flex items-center justify-center gap-1"
                            title="Rotar 90 grados (Intercambiar Ancho/Alto)"
                        >
                            🔄 Rotar
                        </button>
                    </div>
                </div>

                {/* Duplicar / Eliminar */}
                <div className="border-t border-slate-100 pt-3 grid grid-cols-2 gap-2">
                    {selectedItem.interactive ? (
                        <p className="col-span-2 text-[9.5px] text-slate-400 font-semibold">
                            Mesa: <strong>{selectedItem.refName || '—'}</strong>. Al quitarla del plano y guardar, también se elimina de Ajustes → Mesas.
                        </p>
                    ) : null}
                    <button
                        onClick={() => onDuplicate(selectedItem.id)}
                        className="bg-slate-100 hover:bg-slate-200 py-1.5 border border-slate-200 rounded-lg text-[10.5px] font-black active:scale-95 text-slate-700"
                        title="Clonar (Ctrl+D). Las mesas reciben el siguiente nombre libre."
                    >
                        📄 Clonar
                    </button>
                    <button
                        onClick={() => onDelete(selectedItem.id)}
                        className="bg-rose-100 hover:bg-rose-200 py-1.5 border border-rose-300 rounded-lg text-[10.5px] font-black active:scale-95 text-rose-800"
                    >
                        🗑️ Quitar del plano
                    </button>
                </div>

                {/* Orientación de la Imagen (Foto) - Solo para mesas de billar, logos y barras */}
                {(selectedItem.type === 'pool_table' || selectedItem.type === 'dining_table' || selectedItem.type === 'logo' || selectedItem.type === 'bar_counter') && (
                    <div className="border-t border-slate-100 pt-3">
                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-2">Orientación de la Imagen (Foto)</label>
                        <div className="grid grid-cols-2 gap-2">
                            <button 
                                onClick={() => updateProp('imgDir', 'horizontal')}
                                className={`py-1.5 border rounded-lg text-[10.5px] font-black transition-all active:scale-95 text-center ${
                                    (selectedItem.imgDir || (selectedItem.w * 16 > selectedItem.h * 9 ? 'horizontal' : 'vertical')) === 'horizontal' 
                                    ? 'bg-amber-500 border-amber-600 text-white shadow-sm' 
                                    : 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700'
                                }`}
                                title="Fijar orientación de imagen Horizontal"
                            >
                                🖼️ Horizontal
                            </button>
                            <button 
                                onClick={() => updateProp('imgDir', 'vertical')}
                                className={`py-1.5 border rounded-lg text-[10.5px] font-black transition-all active:scale-95 text-center ${
                                    (selectedItem.imgDir || (selectedItem.w * 16 > selectedItem.h * 9 ? 'horizontal' : 'vertical')) === 'vertical' 
                                    ? 'bg-amber-500 border-amber-600 text-white shadow-sm' 
                                    : 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700'
                                }`}
                                title="Fijar orientación de imagen Vertical"
                            >
                                🖼️ Vertical
                            </button>
                        </div>
                    </div>
                )}

                {/* Escala de la Imagen (Foto) - Solo para mesas de billar, logos y barras */}
                {(selectedItem.type === 'pool_table' || selectedItem.type === 'dining_table' || selectedItem.type === 'logo' || selectedItem.type === 'bar_counter') && (
                    <div className="border-t border-slate-100 pt-3">
                        <div className="flex items-center justify-between mb-1">
                            <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Tamaño / Escala de la Foto</label>
                            <div className="flex items-center gap-1">
                                <input 
                                    type="number"
                                    min="10"
                                    max="400"
                                    step="1"
                                    value={selectedItem.imgScale || 100}
                                    onChange={(e) => updateProp('imgScale', e.target.value)}
                                    className="w-16 text-right bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-xs font-bold font-mono focus:outline-none focus:ring-1 focus:ring-amber-500"
                                />
                                <span className="text-xs font-bold text-slate-500 font-mono">%</span>
                            </div>
                        </div>
                        <input 
                            type="range"
                            min="50"
                            max="300"
                            step="1"
                            value={selectedItem.imgScale || 100}
                            onChange={(e) => updateProp('imgScale', e.target.value)}
                            className="w-full accent-amber-500"
                        />
                    </div>
                )}
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════
// MAIN: FloorPlanView
// ═══════════════════════════════════════════════════════

/** Crea un resolvedor elemento-del-plano → mesa real (por id; si no, por nombre y número aproximado). */
function createTableResolver(tables) {
    // Pre-build O(1) maps for fast lookup
    const tablesByName = new Map();
    const poolTablesByDigit = new Map();
    const diningTablesByDigit = new Map();
    const barStoolsByDigit = new Map();
    const genericNormalByDigit = new Map();
    const genericPoolByDigit = new Map();

    tables.forEach(t => {
        const cleanName = t.name.trim().toLowerCase();
        if (!tablesByName.has(cleanName)) {
            tablesByName.set(cleanName, t);
        }
        
        const digits = t.name.match(/\d+/)?.[0];
        if (digits) {
            if (t.type === 'POOL') {
                if (!poolTablesByDigit.has(digits)) poolTablesByDigit.set(digits, t);
                if (!genericPoolByDigit.has(digits)) genericPoolByDigit.set(digits, t);
            } else if (t.type === 'NORMAL') {
                const nameLower = t.name.toLowerCase();
                const isBar = nameLower.includes('b') || nameLower.includes('banco') || nameLower.includes('barra');
                if (isBar) {
                    if (!barStoolsByDigit.has(digits)) barStoolsByDigit.set(digits, t);
                } else {
                    if (!diningTablesByDigit.has(digits)) diningTablesByDigit.set(digits, t);
                }
                if (!genericNormalByDigit.has(digits)) genericNormalByDigit.set(digits, t);
            }
        }
    });

    const tablesById = new Map(tables.map(t => [t.id, t]));

    const resolveTableFast = (item) => {
        // Vínculo explícito por id: inequívoco, tiene prioridad sobre cualquier coincidencia por nombre.
        if (item.tableId) {
            const byId = tablesById.get(item.tableId);
            if (byId) return byId;
        }
        if (!item.refName) return null;
        const cleanRef = item.refName.trim().toLowerCase();
        
        // 1 & 2. Exact or case-insensitive match
        let found = tablesByName.get(cleanRef);
        if (found) return found;
        // Mesa pendiente de crear (aún no existe): nunca se enlaza por número aproximado
        if (item.pendingCreate) return null;

        // 3. Pool table digit match
        if (item.type === 'pool_table') {
            const itemDigits = item.refName.match(/\d+/)?.[0];
            if (itemDigits) {
                found = poolTablesByDigit.get(itemDigits);
                if (found) return found;
            }
        }

        // 4. Dining table digit match
        if (item.type === 'dining_table' || item.type === 'round_stool' || item.type === 'bar_table') {
            const itemDigits = item.refName.match(/\d+/)?.[0];
            if (itemDigits) {
                found = diningTablesByDigit.get(itemDigits);
                if (found) return found;
            }
        }

        // 5. Bar stool digit match
        if (item.type === 'bar_stool') {
            const itemDigits = item.refName.match(/\d+/)?.[0];
            if (itemDigits) {
                found = barStoolsByDigit.get(itemDigits);
                if (found) return found;
            }
        }

        // 6. Generic fallback
        const itemDigits = item.refName.match(/\d+/)?.[0];
        if (itemDigits) {
            found = item.type === 'pool_table' ? genericPoolByDigit.get(itemDigits) : genericNormalByDigit.get(itemDigits);
            if (found) return found;
        }

        return null;
    };
    return resolveTableFast;
}

// Estilos de edición constantes: mantienen estable la identidad de las props y así React.memo evita
// repintar los elementos que no se mueven. 'transition: none' evita que el elemento "persiga" al cursor.
const EDIT_ITEM_STYLE = { cursor: 'move', transition: 'none' };
const EDIT_ITEM_STYLE_SELECTED = { ...EDIT_ITEM_STYLE, outline: '3.5px solid #f59e0b', outlineOffset: '2.5px', zIndex: 40 };

// Igualdad superficial de listas de elementos (planos): mucho más barata que serializar a JSON
const itemsEqual = (a, b) => {
    if (a === b) return true;
    if (!a || !b || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        const x = a[i], y = b[i];
        if (x === y) continue;
        const kx = Object.keys(x);
        if (kx.length !== Object.keys(y).length) return false;
        for (const k of kx) if (x[k] !== y[k]) return false;
    }
    return true;
};

const PLAN_LOCAL_KEY = 'custom_floor_plan_items';
const PLAN_DRAFT_KEY = 'floor_plan_draft';
// Marca que hay un plano guardado en este dispositivo que aún no llegó a la nube (sin conexión, etc.)
const PLAN_PENDING_KEY = 'floor_plan_pending_sync';
// JSON con claves ordenadas: jsonb de Postgres no conserva el orden de las claves
const stableStringify = (v) => JSON.stringify(v, (_k, val) => (
    val && typeof val === 'object' && !Array.isArray(val)
        ? Object.keys(val).sort().reduce((o, key) => { o[key] = val[key]; return o; }, {})
        : val
));
const readPlanFrom = (storage, key) => {
    try {
        const raw = storage.getItem(key);
        const parsed = raw ? JSON.parse(raw) : null;
        return Array.isArray(parsed) && parsed.length ? parsed : null;
    } catch (e) {
        console.error('Error loading floor plan layout', e);
        return null;
    }
};
const readLocalPlan = () => readPlanFrom(localStorage, PLAN_LOCAL_KEY);
const readDraftPlan = () => readPlanFrom(sessionStorage, PLAN_DRAFT_KEY);

export default function FloorPlanView({ onTableSelect, selectedTableId, isEditing, onExitEditing, onEnterEditing }) {
    const tables = useTablesStore(s => s.tables);
    const activeSessions = useTablesStore(s => s.activeSessions);

    // Auto-scaling responsive logic
    const canvasParentRef = useRef(null);
    const [dimensions, setDimensions] = useState(() => {
        try {
            const saved = sessionStorage.getItem('floor_plan_dimensions_cache');
            if (saved) return JSON.parse(saved);
        } catch (_) {}
        return { width: 1000, height: 562.5, scale: 1, isRotated: false };
    });
    const [isMeasured, setIsMeasured] = useState(() => {
        try {
            return sessionStorage.getItem('floor_plan_dimensions_cache') !== null;
        } catch (_) {
            return false;
        }
    });

    // Zoom & Pan states for Mobile & Touch optimization
    const wheelCommitRef = useRef(0);
    const [zoomLevel, setZoomLevel] = useState(1);
    const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });

    const zoomLevelRef = useRef(1);
    const panOffsetRef = useRef({ x: 0, y: 0 });
    const canvasWrapperRef = useRef(null);

    const isEditingRef = useRef(isEditing);
    useEffect(() => {
        isEditingRef.current = isEditing;
    }, [isEditing]);

    const dimensionsRef = useRef(dimensions);
    useEffect(() => {
        dimensionsRef.current = dimensions;
    }, [dimensions]);

    const zoomContainerRef = useRef(null);
    const lastPinchDistRef = useRef(null);
    const isPanningRef     = useRef(false);
    const panStartRef      = useRef({ x: 0, y: 0, ox: 0, oy: 0 });

    const MIN_ZOOM = 1;
    const MAX_ZOOM = 4;

    const updateTransformDOM = useCallback((zoom, pan) => {
        if (canvasWrapperRef.current) {
            canvasWrapperRef.current.style.transform = `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`;
            canvasWrapperRef.current.style.willChange = 'transform';
        }
    }, []);

    // Safe bounds clamp for panning
    const clampPan = useCallback((x, y, scaleVal) => {
        if (scaleVal <= 1) return { x: 0, y: 0 };
        const dims = dimensionsRef.current;
        const maxW = (scaleVal - 1) * dims.width / 2;
        const maxH = (scaleVal - 1) * dims.height / 2;
        return {
            x: Math.max(-maxW, Math.min(maxW, x)),
            y: Math.max(-maxH, Math.min(maxH, y))
        };
    }, []);

    const applyZoom = useCallback((newZoom, centerX, centerY) => {
        const clamped = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom));
        const prevZoom = zoomLevelRef.current;
        const prevPan = panOffsetRef.current;
        const dims = dimensionsRef.current;
        
        let nextPan = { x: 0, y: 0 };
        if (clamped > MIN_ZOOM) {
            const ratio = (clamped - prevZoom) / prevZoom;
            const cx = centerX !== undefined 
                ? centerX - (canvasParentRef.current?.getBoundingClientRect().left || 0) 
                : dims.width / 2;
            const cy = centerY !== undefined 
                ? centerY - (canvasParentRef.current?.getBoundingClientRect().top || 0) 
                : dims.height / 2;
            
            const newX = prevPan.x - ratio * (cx - prevPan.x);
            const newY = prevPan.y - ratio * (cy - prevPan.y);
            nextPan = clampPan(newX, newY, clamped);
        }

        zoomLevelRef.current = clamped;
        panOffsetRef.current = nextPan;
        
        updateTransformDOM(clamped, nextPan);
    }, [clampPan, updateTransformDOM]);

    const handleZoomIn  = () => {
        applyZoom(zoomLevelRef.current + 0.4);
        setZoomLevel(zoomLevelRef.current);
        setPanOffset(panOffsetRef.current);
    };
    const handleZoomOut = () => {
        applyZoom(zoomLevelRef.current - 0.4);
        setZoomLevel(zoomLevelRef.current);
        setPanOffset(panOffsetRef.current);
    };
    const handleZoomReset = () => {
        zoomLevelRef.current = 1;
        panOffsetRef.current = { x: 0, y: 0 };
        updateTransformDOM(1, { x: 0, y: 0 });
        setZoomLevel(1);
        setPanOffset({ x: 0, y: 0 });
    };

    // Pinch-to-zoom and drag/pan handlers with stable listener subscription
    useEffect(() => {
        const container = zoomContainerRef.current;
        if (!container) return;

        const handleTouchStart = (e) => {
            if (isEditingRef.current) return;
            if (e.touches.length === 2) {
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                lastPinchDistRef.current = Math.hypot(dx, dy);
                e.preventDefault();
            } else if (e.touches.length === 1) {
                isPanningRef.current = true;
                panStartRef.current = { 
                    x: e.touches[0].clientX, 
                    y: e.touches[0].clientY, 
                    ox: panOffsetRef.current.x, 
                    oy: panOffsetRef.current.y 
                };
            }
        };

        const handleTouchMove = (e) => {
            if (isEditingRef.current) return;
            if (e.touches.length === 2 && lastPinchDistRef.current !== null) {
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                const newDist = Math.hypot(dx, dy);
                const ratio = newDist / lastPinchDistRef.current;
                const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
                const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
                applyZoom(zoomLevelRef.current * ratio, midX, midY);
                lastPinchDistRef.current = newDist;
                e.preventDefault();
            } else if (e.touches.length === 1 && isPanningRef.current) {
                const dx = e.touches[0].clientX - panStartRef.current.x;
                const dy = e.touches[0].clientY - panStartRef.current.y;
                const clamped = clampPan(
                    panStartRef.current.ox + dx, 
                    panStartRef.current.oy + dy, 
                    zoomLevelRef.current
                );
                panOffsetRef.current = clamped;
                updateTransformDOM(zoomLevelRef.current, clamped);
                if (zoomLevelRef.current > 1.01) {
                    e.preventDefault();
                }
            }
        };

        const handleTouchEnd = (e) => {
            if (e.touches.length < 2) lastPinchDistRef.current = null;
            if (e.touches.length === 0) {
                isPanningRef.current = false;
                setZoomLevel(zoomLevelRef.current);
                setPanOffset(panOffsetRef.current);
            }
        };

        // Desktop Mouse Drag to Pan
        const handleMouseDown = (e) => {
            if (isEditingRef.current) return;
            if (e.button !== 0 || zoomLevelRef.current <= 1.01) return;
            isPanningRef.current = true;
            panStartRef.current = {
                x: e.clientX,
                y: e.clientY,
                ox: panOffsetRef.current.x,
                oy: panOffsetRef.current.y
            };
            container.style.cursor = 'grabbing';
            e.preventDefault();
        };

        const handleMouseMove = (e) => {
            if (isEditingRef.current || !isPanningRef.current) return;
            const dx = e.clientX - panStartRef.current.x;
            const dy = e.clientY - panStartRef.current.y;
            const clamped = clampPan(
                panStartRef.current.ox + dx,
                panStartRef.current.oy + dy,
                zoomLevelRef.current
            );
            panOffsetRef.current = clamped;
            updateTransformDOM(zoomLevelRef.current, clamped);
            e.preventDefault();
        };

        const handleMouseUp = () => {
            if (isPanningRef.current) {
                isPanningRef.current = false;
                container.style.cursor = zoomLevelRef.current > 1.01 ? 'grab' : 'default';
                setZoomLevel(zoomLevelRef.current);
                setPanOffset(panOffsetRef.current);
            }
        };

        const handleMouseLeave = () => {
            if (isPanningRef.current) {
                isPanningRef.current = false;
                container.style.cursor = zoomLevelRef.current > 1.01 ? 'grab' : 'default';
                setZoomLevel(zoomLevelRef.current);
                setPanOffset(panOffsetRef.current);
            }
        };

        // Desktop Mouse Wheel to Zoom
        const handleWheel = (e) => {
            if (isEditingRef.current) return;
            e.preventDefault();
            const zoomFactor = 1.1;
            const direction = e.deltaY < 0 ? 1 : -1;
            const nextZoom = direction > 0 
                ? zoomLevelRef.current * zoomFactor 
                : zoomLevelRef.current / zoomFactor;
            
            applyZoom(nextZoom, e.clientX, e.clientY);
            container.style.cursor = zoomLevelRef.current > 1.01 ? 'grab' : 'default';
            // El zoom ya se aplicó directo al DOM; el estado de React se sincroniza al terminar de girar la rueda
            clearTimeout(wheelCommitRef.current);
            wheelCommitRef.current = setTimeout(() => {
                setZoomLevel(zoomLevelRef.current);
                setPanOffset(panOffsetRef.current);
            }, 150);
        };

        // Touch Listeners
        container.addEventListener('touchstart', handleTouchStart, { passive: false });
        container.addEventListener('touchmove', handleTouchMove, { passive: false });
        container.addEventListener('touchend', handleTouchEnd, { passive: false });

        // Mouse Drag Listeners
        container.addEventListener('mousedown', handleMouseDown);
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        container.addEventListener('mouseleave', handleMouseLeave);

        // Wheel Zoom Listener
        container.addEventListener('wheel', handleWheel, { passive: false });

        return () => {
            container.removeEventListener('touchstart', handleTouchStart);
            container.removeEventListener('touchmove', handleTouchMove);
            container.removeEventListener('touchend', handleTouchEnd);

            container.removeEventListener('mousedown', handleMouseDown);
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            container.removeEventListener('mouseleave', handleMouseLeave);

            container.removeEventListener('wheel', handleWheel);
        };
    }, [clampPan, applyZoom, updateTransformDOM]);

    useEffect(() => {
        if (!canvasParentRef.current) return;
        const resizeObserver = new ResizeObserver((entries) => {
            for (let entry of entries) {
                const parentW = entry.contentRect.width;
                const parentH = entry.contentRect.height;
                if (parentW <= 0 || parentH <= 0) return;
                
                const isPortrait = parentW < parentH;
                const R_canvas = 16 / 9;
                
                let canvasW, canvasH, scale;
                if (isPortrait) {
                    // We fit a 9:16 rotated box inside parentW and parentH
                    const R_rotated = 9 / 16;
                    const R_parent = parentW / parentH;
                    if (R_parent > R_rotated) {
                        // Height is constraint
                        canvasH = parentH;
                        canvasW = parentH * R_rotated;
                    } else {
                        // Width is constraint
                        canvasW = parentW;
                        canvasH = parentW / R_rotated;
                    }
                    scale = canvasH / 1000;
                } else {
                    const R_parent = parentW / parentH;
                    if (R_parent > R_canvas) {
                        // Height is constraint
                        canvasH = parentH;
                        canvasW = parentH * R_canvas;
                    } else {
                        // Width is constraint
                        canvasW = parentW;
                        canvasH = parentW / R_canvas;
                    }
                    scale = canvasW / 1000;
                }
                
                const nextDims = {
                    width: canvasW,
                    height: canvasH,
                    scale,
                    isRotated: isPortrait
                };
                setDimensions(nextDims);
                setIsMeasured(true);
                try {
                    sessionStorage.setItem('floor_plan_dimensions_cache', JSON.stringify(nextDims));
                } catch (_) {}
            }
        });
        resizeObserver.observe(canvasParentRef.current);
        return () => resizeObserver.disconnect();
    }, []);

    // Carga de distribución de plano dinámica.
    // Orden: borrador sin guardar (sessionStorage) → copia local → plano original.
    // Después, al montar, se sincroniza con la nube (pool_config.floor_plan).
    const [dynamicItems, setDynamicItems] = useState(() => readDraftPlan() || readLocalPlan() || FLOOR_ITEMS);
    const savedItemsRef = useRef(null);
    if (savedItemsRef.current === null) savedItemsRef.current = readLocalPlan() || FLOOR_ITEMS;
    const hadDraftRef = useRef(!!readDraftPlan());

    // Elemento seleccionado en el editor
    const [selectedEditItemId, setSelectedEditItemIdRaw] = useState(null);
    const [multiIds, setMultiIds] = useState([]);
    const [marquee, setMarquee] = useState(null);
    const marqueeJustEndedRef = useRef(false);
    // Propuesta de cuadrícula pendiente de aplicar: [{ id, x, y, w, h }]
    const [alignPreview, setAlignPreview] = useState(null);
    const [showTutorial, setShowTutorial] = useState(false);

    // Panel lateral "sticky": se queda a la vista aunque la página haga scroll.
    // (position: sticky no funciona aquí porque hay contenedores con overflow entre el panel y el scroll real)
    const rootRef = useRef(null);
    const sidebarRef = useRef(null);
    useEffect(() => {
        if (!isEditing) return;
        const sb = sidebarRef.current;
        const root = rootRef.current;
        if (!sb || !root) return;
        const desktop = window.matchMedia('(min-width: 1024px)');
        // Scroll real: el ancestro más externo que de verdad desplaza contenido
        let scroller = null;
        for (let a = root.parentElement; a && a !== document.body; a = a.parentElement) {
            const cs = getComputedStyle(a);
            if (/(auto|scroll)/.test(cs.overflowY) && a.scrollHeight > a.clientHeight + 1) scroller = a;
        }
        const target = scroller || window;
        let raf = 0;
        const update = () => {
            raf = 0;
            if (!desktop.matches) { sb.style.transform = ''; sb.style.maxHeight = ''; return; }
            const viewTop = scroller ? scroller.getBoundingClientRect().top : 0;
            const viewH = scroller ? scroller.clientHeight : window.innerHeight;
            const rr = root.getBoundingClientRect();
            sb.style.maxHeight = `${viewH}px`;
            const maxOffset = Math.max(0, rr.height - sb.offsetHeight);
            const offset = Math.min(maxOffset, Math.max(0, viewTop - rr.top));
            sb.style.transform = `translateY(${offset}px)`;
        };
        const schedule = () => { if (!raf) raf = requestAnimationFrame(update); };
        target.addEventListener('scroll', schedule, { passive: true });
        window.addEventListener('resize', schedule);
        update();
        return () => {
            target.removeEventListener('scroll', schedule);
            window.removeEventListener('resize', schedule);
            if (raf) cancelAnimationFrame(raf);
            sb.style.transform = '';
            sb.style.maxHeight = '';
        };
    }, [isEditing]);
    // Selección única (limpia la multiselección)
    const setSelectedEditItemId = (id) => { setMultiIds([]); setSelectedEditItemIdRaw(id); };
    // Selección por lista de ids: 0 o 1 → única; 2 o más → grupo
    const setSelection = (ids) => {
        if (ids.length > 1) { setMultiIds(ids); setSelectedEditItemIdRaw(null); }
        else { setMultiIds([]); setSelectedEditItemIdRaw(ids[0] ?? null); }
    };
    const selectedSet = useMemo(() => new Set(multiIds), [multiIds]);

    // Diálogo de confirmación propio (window.confirm se bloquea en algunos webviews y devuelve false sin avisar)
    const [confirmState, setConfirmState] = useState(null);
    const askConfirm = (message, confirmLabel = 'Confirmar') =>
        new Promise(resolve => setConfirmState({ message, confirmLabel, resolve }));
    const answerConfirm = (value) => {
        confirmState?.resolve(value);
        setConfirmState(null);
    };

    // ¿Hay cambios sin guardar?
    const isDirty = useMemo(
        () => isEditing && !itemsEqual(dynamicItems, savedItemsRef.current),
        [isEditing, dynamicItems]
    );
    const isDirtyRef = useRef(false);
    isDirtyRef.current = isDirty;

    // ── Historial (deshacer / rehacer) ──
    const undoRef = useRef([]);
    const redoRef = useRef([]);
    const prevItemsRef = useRef(dynamicItems);
    const lastChangeRef = useRef(0);
    const [historySize, setHistorySize] = useState({ undo: 0, redo: 0 });

    useEffect(() => {
        if (!isEditing) { prevItemsRef.current = dynamicItems; return; }
        if (dynamicItems === prevItemsRef.current) return;
        const now = Date.now();
        // Una ráfaga de cambios (arrastre, slider) cuenta como un solo paso.
        if (now - lastChangeRef.current > 400) {
            undoRef.current.push(prevItemsRef.current);
            if (undoRef.current.length > 100) undoRef.current.shift();
            redoRef.current = [];
            setHistorySize({ undo: undoRef.current.length, redo: 0 });
        }
        lastChangeRef.current = now;
        prevItemsRef.current = dynamicItems;
    }, [dynamicItems, isEditing]);

    // Aplica un cambio sin registrarlo en el historial
    const applyWithoutHistory = (items) => {
        prevItemsRef.current = items;
        setDynamicItems(items);
    };

    const resetHistory = () => {
        undoRef.current = [];
        redoRef.current = [];
        lastChangeRef.current = 0;
        setHistorySize({ undo: 0, redo: 0 });
    };

    useEffect(() => { if (isEditing) resetHistory(); }, [isEditing]);

    const handleUndo = () => {
        const prev = undoRef.current.pop();
        if (!prev) return;
        redoRef.current.push(dynamicItems);
        applyWithoutHistory(prev);
        setSelectedEditItemId(null);
        setHistorySize({ undo: undoRef.current.length, redo: redoRef.current.length });
    };

    const handleRedo = () => {
        const next = redoRef.current.pop();
        if (!next) return;
        undoRef.current.push(dynamicItems);
        applyWithoutHistory(next);
        setSelectedEditItemId(null);
        setHistorySize({ undo: undoRef.current.length, redo: redoRef.current.length });
    };

    // Sincronización con otros dispositivos:
    //  - al montar, al volver a la pestaña, al recuperar conexión y al reconectar el tiempo real: se vuelve a traer el plano
    //  - cuando otro dispositivo guarda, llega un evento en tiempo real (floorplan:remote-update)
    //  - si este dispositivo guardó sin conexión, se reintenta subir antes de traer nada
    useEffect(() => {
        const store = () => useTablesStore.getState();

        const applyRemote = (items) => {
            if (!Array.isArray(items) || !items.length) return;
            if (localStorage.getItem(PLAN_PENDING_KEY)) return; // nuestros cambios locales mandan hasta subirlos
            if (stableStringify(items) === stableStringify(savedItemsRef.current)) return; // eco de nuestro propio guardado
            try { localStorage.setItem(PLAN_LOCAL_KEY, JSON.stringify(items)); } catch (_) {}
            savedItemsRef.current = items;
            if (isEditingRef.current && isDirtyRef.current) {
                showToast('Otro dispositivo guardó cambios en el plano. Si guardas ahora los sobrescribirás; cancela para ver los suyos.', 'info');
                return;
            }
            applyWithoutHistory(items);
            if (isEditingRef.current) {
                setSelectedEditItemId(null);
                showToast('El plano se actualizó desde otro dispositivo', 'info');
            }
        };

        const pull = async () => {
            if (isEditingRef.current && isDirtyRef.current) return; // no tocar un borrador en curso
            if (localStorage.getItem(PLAN_PENDING_KEY)) {
                const local = readLocalPlan();
                if (local) {
                    const r = await store().saveFloorPlan(local);
                    if (r.ok) localStorage.removeItem(PLAN_PENDING_KEY);
                } else {
                    localStorage.removeItem(PLAN_PENDING_KEY);
                }
                return;
            }
            const { ok, items } = await store().fetchFloorPlan();
            if (!ok) return;
            if (items && items.length) applyRemote(items);
            else {
                // La nube está vacía: sube la copia local si existe (migración automática)
                const local = readLocalPlan();
                if (local) store().saveFloorPlan(local);
            }
        };

        if (hadDraftRef.current) {
            onEnterEditing?.();
            showToast('Se recuperó un borrador del plano sin guardar', 'info');
        } else {
            pull();
        }

        const onRemote = (e) => applyRemote(e.detail?.items);
        const onVisible = () => { if (document.visibilityState === 'visible') pull(); };
        window.addEventListener('floorplan:remote-update', onRemote);
        window.addEventListener('floorplan:refetch', pull);
        window.addEventListener('online', pull);
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            window.removeEventListener('floorplan:remote-update', onRemote);
            window.removeEventListener('floorplan:refetch', pull);
            window.removeEventListener('online', pull);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, []);

    // Persistir borrador mientras se edita (sobrevive a cambiar de pestaña o recargar)
    // (con debounce: durante un arrastre no se serializa en cada movimiento)
    const latestItemsRef = useRef(dynamicItems);
    latestItemsRef.current = dynamicItems;
    useEffect(() => {
        if (!isEditing) return;
        const t = setTimeout(() => {
            try {
                if (isDirty) sessionStorage.setItem(PLAN_DRAFT_KEY, JSON.stringify(dynamicItems));
                else sessionStorage.removeItem(PLAN_DRAFT_KEY);
            } catch (_) {}
        }, 400);
        return () => clearTimeout(t);
    }, [isEditing, isDirty, dynamicItems]);
    // Al salir de la vista con cambios pendientes, el último estado no se pierde
    useEffect(() => () => {
        if (isDirtyRef.current) {
            try { sessionStorage.setItem(PLAN_DRAFT_KEY, JSON.stringify(latestItemsRef.current)); } catch (_) {}
        }
    }, []);

    // Aviso del navegador al cerrar/recargar con cambios sin guardar
    useEffect(() => {
        if (!isDirty) return;
        const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
        window.addEventListener('beforeunload', warn);
        return () => window.removeEventListener('beforeunload', warn);
    }, [isDirty]);

    // Salvar cambios (local + nube). Crea las mesas nuevas y elimina las que se quitaron del plano.
    const handleSaveLayout = async () => {
        const store = useTablesStore.getState();
        const resolver = createTableResolver(tables);

        // Fija el vínculo por id de las mesas que solo estaban enlazadas por nombre
        let pinned = dynamicItems.map(it => {
            if (!it.interactive || it.tableId) return it;
            const r = resolvedItems.find(x => x.item.id === it.id);
            return r?.table ? { ...it, tableId: r.table.id } : it;
        });

        // Mesas a crear (elementos nuevos/clonados) y a eliminar (estaban en el plano guardado y ya no)
        const toCreate = pinned.filter(it => it.interactive && it.pendingCreate && !it.tableId && it.refName);
        const keptIds = new Set(pinned.filter(it => it.interactive && it.tableId).map(it => it.tableId));
        const toDeleteMap = new Map();
        savedItemsRef.current.filter(it => it.interactive).forEach(it => {
            const t = resolver(it);
            if (t && !keptIds.has(t.id)) toDeleteMap.set(t.id, t);
        });
        const toDelete = [...toDeleteMap.values()];

        const busy = toDelete.filter(t => activeSessions.some(s => s.table_id === t.id));
        if (busy.length) {
            showToast(`No se puede eliminar ${busy.map(t => t.name).join(', ')}: tiene una sesión activa. Ciérrala o devuélvela al plano.`, 'error');
            return;
        }

        const unlinked = pinned.filter(it => it.interactive && !it.tableId && !it.pendingCreate).length;
        const lines = [];
        if (toCreate.length) lines.push(`Se crearán ${toCreate.length} mesa(s): ${toCreate.map(it => it.refName).join(', ')}.`);
        if (toDelete.length) lines.push(`Se eliminarán ${toDelete.length} mesa(s) de Ajustes → Mesas: ${toDelete.map(t => t.name).join(', ')}.`);
        if (unlinked) lines.push(`${unlinked} elemento(s) no están vinculados a ninguna mesa y no se podrán abrir.`);
        if (lines.length && !(await askConfirm(`${lines.join(' ')} ¿Guardar los cambios?`, 'Guardar'))) return;

        // 1) Crear mesas nuevas
        for (const it of toCreate) {
            try {
                const created = await store.addTable(it.refName, it.type === 'pool_table' ? 'POOL' : 'NORMAL');
                pinned = pinned.map(x => {
                    if (x.id !== it.id) return x;
                    const { pendingCreate: _pc, ...rest } = x;
                    return { ...rest, tableId: created.id, refName: created.name };
                });
            } catch (err) {
                console.error('Error creando mesa desde el editor:', err);
                setDynamicItems(pinned);
                showToast(`No se pudo crear la mesa "${it.refName}". Los cambios siguen sin guardar.`, 'error');
                return;
            }
        }

        // 2) Guardar el plano (local + nube)
        try { localStorage.setItem(PLAN_LOCAL_KEY, JSON.stringify(pinned)); } catch (_) {}
        savedItemsRef.current = pinned;
        applyWithoutHistory(pinned);
        try { sessionStorage.removeItem(PLAN_DRAFT_KEY); } catch (_) {}
        const res = await store.saveFloorPlan(pinned);
        try {
            if (res.ok) localStorage.removeItem(PLAN_PENDING_KEY);
            else localStorage.setItem(PLAN_PENDING_KEY, '1'); // se reintenta al recuperar conexión o al reabrir
        } catch (_) {}

        // 3) Eliminar las mesas que se quitaron del plano
        const failed = [];
        for (const t of toDelete) {
            try { await store.deleteTable(t.id); } catch (err) { console.error('Error eliminando mesa:', err); failed.push(t.name); }
        }

        if (failed.length) showToast(`Plano guardado, pero no se pudo eliminar: ${failed.join(', ')}`, 'error');
        else if (res.ok) showToast('Plano guardado y sincronizado con todos los dispositivos', 'success');
        else showToast('Plano guardado solo en este dispositivo (sin conexión o falta la columna floor_plan en Supabase)', 'info');

        setSelectedEditItemId(null);
        resetHistory();
        onExitEditing?.();
    };

    // Cancelar cambios
    const handleCancelLayout = () => {
        applyWithoutHistory(savedItemsRef.current);
        try { sessionStorage.removeItem(PLAN_DRAFT_KEY); } catch (_) {}
        setSelectedEditItemId(null);
        resetHistory();
        showToast("Cambios del plano descartados", "info");
        onExitEditing?.();
    };

    // Salida solicitada desde fuera (botón "Salir Editor", cambio de vista) con confirmación
    const askConfirmRef = useRef(askConfirm);
    askConfirmRef.current = askConfirm;
    const cancelRef = useRef(handleCancelLayout);
    cancelRef.current = handleCancelLayout;
    useEffect(() => {
        const onRequestExit = async (e) => {
            if (!isEditingRef.current) return;
            if (isDirtyRef.current && !(await askConfirmRef.current('Tienes cambios sin guardar en el plano. ¿Descartarlos?', 'Descartar'))) return;
            cancelRef.current();
            e.detail?.onExited?.();
        };
        window.addEventListener('floorplan:request-exit', onRequestExit);
        return () => window.removeEventListener('floorplan:request-exit', onRequestExit);
    }, []);

    // Atajos: Ctrl/Cmd+Z deshacer, Ctrl/Cmd+Shift+Z o Ctrl+Y rehacer
    useEffect(() => {
        if (!isEditing) return;
        const onKey = (e) => {
            const tag = e.target?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
            if (!(e.ctrlKey || e.metaKey)) return;
            const k = e.key.toLowerCase();
            if (k === 'z' && !e.shiftKey) { e.preventDefault(); handleUndo(); }
            else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); handleRedo(); }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    });

    // Restaurar plano original: se carga como borrador (se puede deshacer o cancelar)
    const handleResetLayout = async () => {
        if (await askConfirm("¿Cargar la distribución original del local? Se cargará como borrador: podrás deshacerlo o cancelar, y solo se aplica al pulsar Guardar Cambios.", 'Cargar original')) {
            setDynamicItems(FLOOR_ITEMS);
            setSelectedEditItemId(null);
            showToast("Plano original cargado como borrador. Guarda para aplicarlo.", "info");
        }
    };

    // Exportar configuración del plano
    const handleExportLayout = () => {
        try {
            const dataStr = JSON.stringify(dynamicItems, null, 2);
            
            // 1. Copiar al portapapeles
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(dataStr);
            }
            
            // 2. Descargar como archivo
            const blob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `distribucion_plano_pool_imperial_${new Date().toISOString().slice(0,10)}.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            
            showToast("Configuración copiada al portapapeles y descargada como JSON", "success");
        } catch (err) {
            console.error("Error exporting layout:", err);
            showToast("Error al exportar la configuración", "error");
        }
    };

    // Añadir elemento al plano. Si la mesa no existe, queda "pendiente de crear" y se crea al guardar.
    const handleAddItem = async (type, name) => {
        const opt = ADD_ITEM_OPTIONS.find(o => o.type === type);
        if (!opt) return false;
        const DEFAULTS = {
            pool_table:   { w: 11.7, h: 39.8, imgScale: 190, imgDir: 'vertical', ratioLocked: true, zone: 'pool' },
            dining_table: { w: 15,   h: 19.5, chairs: 4, ratioLocked: true, zone: 'salon' },
            round_stool:  { w: 11.5, h: 16.76, ratioLocked: true, zone: 'salon' },
            bar_stool:    { w: 5.5,  h: 11.75, ratioLocked: true, zone: 'barra1' },
            bar_counter:  { w: 15,   h: 8, zone: 'barra1' },
            entry:        { w: 12.1, h: 5.6, ratioLocked: true, zone: 'entrada' },
        };
        const base = DEFAULTS[type];
        let refName;
        let linkedId;
        let pending = false;
        let label = name;

        if (opt.interactive) {
            if (!name) { showToast('Escribe el nombre de la mesa', 'error'); return false; }
            const key = name.toLowerCase();
            if (dynamicItems.some(it => it.interactive && it.refName?.trim().toLowerCase() === key)) {
                showToast(`"${name}" ya está en el plano`, 'error');
                return false;
            }
            const existing = tables.find(t => t.name.trim().toLowerCase() === key);
            if (existing) {
                refName = existing.name;
                linkedId = existing.id;
            } else {
                refName = name;
                pending = true;
            }
            label = label || refName;
        }

        const id = `custom-${type}-${Date.now().toString(36)}`;
        const newItem = {
            id, type, label: label || (type === 'entry' ? 'Entrada' : ''),
            ...(refName ? { refName } : {}),
            x: parseFloat((50 - base.w / 2).toFixed(2)),
            y: parseFloat((50 - base.h / 2).toFixed(2)),
            interactive: opt.interactive,
            ...base,
        };
        if (linkedId) newItem.tableId = linkedId;
        if (pending) newItem.pendingCreate = true;
        setDynamicItems(prev => [...prev, newItem]);
        setSelectedEditItemId(id);
        showToast(pending ? 'Elemento añadido. La mesa se creará al guardar los cambios.' : 'Elemento añadido. Arrástralo a su lugar y guarda los cambios.', 'success');
        return true;
    };

    // Quitar uno o varios elementos. Las mesas reales se eliminan al guardar.
    const handleDeleteItems = async (ids) => {
        const list = dynamicItems.filter(it => ids.includes(it.id));
        if (!list.length) return;
        const resolver = createTableResolver(tables);
        const blocked = [];
        const realNames = [];
        list.forEach(it => {
            if (!it.interactive || it.pendingCreate) return;
            const t = resolver(it);
            if (!t) return;
            if (activeSessions.some(s => s.table_id === t.id)) blocked.push(t.name);
            else realNames.push(t.name);
        });
        if (blocked.length) {
            showToast(`${blocked.join(', ')} tiene(n) una sesión activa; ciérrala(s) antes de quitarla(s) del plano`, 'error');
            return;
        }
        const what = list.length === 1 ? `"${list[0].label || list[0].id}"` : `${list.length} elementos`;
        const extra = realNames.length ? ` Al guardar, también se eliminarán de Ajustes → Mesas: ${realNames.join(', ')}.` : '';
        if (!(await askConfirm(`¿Quitar ${what} del plano?${extra} Puedes deshacer hasta que guardes.`, 'Quitar'))) return;
        setDynamicItems(prev => prev.filter(it => !ids.includes(it.id)));
        setSelectedEditItemId(null);
    };
    const handleDeleteItem = (itemId) => handleDeleteItems([itemId]);

    // Clonar elementos asignando a cada mesa el siguiente nombre libre (sin repetir)
    const handleCloneItems = (ids) => {
        const src = dynamicItems.filter(it => ids.includes(it.id));
        if (!src.length) return;
        const numOf = (it) => parseInt(((it.refName || it.label || '').match(/(\d+)\s*$/) || [])[1], 10) || 0;
        const ordered = [...src].sort((a, b) => numOf(a) - numOf(b));
        const typeOf = (it) => (it.type === 'pool_table' ? 'POOL' : 'NORMAL');
        // Nombres ya ocupados: mesas reales + pendientes + los que se vayan generando ahora
        const taken = [
            ...tables,
            ...dynamicItems.filter(i => i.pendingCreate && i.refName).map(i => ({ id: `pending:${i.id}`, name: i.refName, type: typeOf(i) })),
        ];
        const stamp = Date.now().toString(36);
        const clones = [];
        ordered.forEach((it, idx) => {
            const id = `custom-${it.type}-${stamp}-${idx}`;
            const { tableId: _t, ...rest } = it;
            let extra = {};
            if (it.interactive) {
                const { next } = suggestNames(it.type, taken, [...dynamicItems, ...clones], new Set());
                taken.push({ id: `pending:${id}`, name: next, type: typeOf(it) });
                extra = { label: next, refName: next, pendingCreate: true };
            } else if (/\d+\s*$/.test(it.label || '')) {
                const { next } = suggestNames(it.type, [], [...dynamicItems, ...clones], new Set());
                extra = { label: next };
            }
            clones.push({
                ...rest, ...extra, id,
                x: parseFloat(Math.max(0, Math.min(100 - it.w, it.x + 3)).toFixed(2)),
                y: parseFloat(Math.max(0, Math.min(100 - it.h, it.y + 3)).toFixed(2)),
            });
        });
        setDynamicItems(prev => [...prev, ...clones]);
        setSelection(clones.map(c => c.id));
        const nuevas = clones.filter(c => c.pendingCreate).map(c => c.refName);
        showToast(nuevas.length ? `Clonado: ${nuevas.join(', ')}. Las mesas se crearán al guardar.` : 'Elemento clonado', 'success');
    };
    const handleDuplicateItem = (itemId) => handleCloneItems([itemId]);

    // Ids seleccionados (única o grupo)
    const currentSelectionIds = () => (multiIds.length > 1 ? multiIds : (selectedEditItemId ? [selectedEditItemId] : []));

    // Convierte un desplazamiento de pantalla (derecha/abajo positivos) a coordenadas del plano
    const screenToPlan = (sx, sy) => (dimensions.isRotated ? [-sy, sx] : [sx, sy]);

    // Mover elementos manteniendo todo el grupo dentro del lienzo
    const handleMoveSelection = (dx, dy, ids = currentSelectionIds()) => {
        const group = dynamicItems.filter(it => ids.includes(it.id));
        if (!group.length) return;
        const cdx = Math.max(-Math.min(...group.map(it => it.x)), Math.min(Math.min(...group.map(it => 100 - it.w - it.x)), dx));
        const cdy = Math.max(-Math.min(...group.map(it => it.y)), Math.min(Math.min(...group.map(it => 100 - it.h - it.y)), dy));
        setDynamicItems(prev => prev.map(it => ids.includes(it.id)
            ? { ...it, x: parseFloat((it.x + cdx).toFixed(2)), y: parseFloat((it.y + cdy).toFixed(2)) }
            : it));
    };

    const handleApplyPreview = (useShrink = false) => {
        if (!alignPreview) return;
        const list = useShrink && alignPreview.shrink ? alignPreview.shrink : alignPreview.items;
        const byId = new Map(list.map(p => [p.id, p]));
        setDynamicItems(prev => prev.map(it => {
            const p = byId.get(it.id);
            if (!p) return it;
            return useShrink ? { ...it, x: p.x, y: p.y, w: p.w, h: p.h } : { ...it, x: p.x, y: p.y };
        }));
        setAlignPreview(null);
    };

    // La propuesta deja de valer si cambia la selección o los elementos
    useEffect(() => { setAlignPreview(null); }, [multiIds, selectedEditItemId]);

    // Alinear / distribuir el grupo seleccionado
    const handleAlign = (mode) => {
        const ids = multiIds;
        const g = dynamicItems.filter(it => ids.includes(it.id));
        if (g.length < 2) return;
        const minX = Math.min(...g.map(i => i.x)), maxR = Math.max(...g.map(i => i.x + i.w));
        const minY = Math.min(...g.map(i => i.y)), maxB = Math.max(...g.map(i => i.y + i.h));
        const pos = new Map();
        if (mode === 'left') g.forEach(i => pos.set(i.id, { x: minX }));
        if (mode === 'right') g.forEach(i => pos.set(i.id, { x: maxR - i.w }));
        if (mode === 'centerX') g.forEach(i => pos.set(i.id, { x: (minX + maxR) / 2 - i.w / 2 }));
        if (mode === 'top') g.forEach(i => pos.set(i.id, { y: minY }));
        if (mode === 'bottom') g.forEach(i => pos.set(i.id, { y: maxB - i.h }));
        if (mode === 'middleY') g.forEach(i => pos.set(i.id, { y: (minY + maxB) / 2 - i.h / 2 }));
        if (mode === 'grid') {
            setAlignPreview(buildGridProposal(g));
            return;
        }
        if (mode === 'distX' && g.length >= 3) {
            const sorted = [...g].sort((a, b) => a.x - b.x);
            const gap = ((maxR - minX) - sorted.reduce((t, i) => t + i.w, 0)) / (sorted.length - 1);
            let cursor = minX;
            sorted.forEach(i => { pos.set(i.id, { x: cursor }); cursor += i.w + gap; });
        }
        if (mode === 'distY' && g.length >= 3) {
            const sorted = [...g].sort((a, b) => a.y - b.y);
            const gap = ((maxB - minY) - sorted.reduce((t, i) => t + i.h, 0)) / (sorted.length - 1);
            let cursor = minY;
            sorted.forEach(i => { pos.set(i.id, { y: cursor }); cursor += i.h + gap; });
        }
        setDynamicItems(prev => prev.map(it => {
            const np = pos.get(it.id);
            if (!np) return it;
            const x = np.x !== undefined ? Math.max(0, Math.min(100 - it.w, np.x)) : it.x;
            const y = np.y !== undefined ? Math.max(0, Math.min(100 - it.h, np.y)) : it.y;
            return { ...it, x: parseFloat(x.toFixed(2)), y: parseFloat(y.toFixed(2)) };
        }));
    };

    // Atajos: Supr quitar · Ctrl+D clonar · flechas mover (Shift = paso grande) · Esc deseleccionar
    useEffect(() => {
        if (!isEditing) return;
        const onKey = (e) => {
            const tag = e.target?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
            if (showTutorial) return;
            const ids = currentSelectionIds();
            if (e.key === 'Escape') { setSelectedEditItemId(null); return; }
            if (!ids.length) return;
            if (e.key === 'Delete') { handleDeleteItems(ids); return; }
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') { e.preventDefault(); handleCloneItems(ids); return; }
            const step = e.shiftKey ? 2 : 0.5;
            const arrows = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
            if (arrows[e.key] && !(e.ctrlKey || e.metaKey)) { e.preventDefault(); handleMoveSelection(...screenToPlan(...arrows[e.key]), ids); }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    });

    // Handler de Arrastre visual (Mouse & Touch)
    const handleDragStart = useCallback((e, itemId) => {
        if (!isEditing) return;
        e.preventDefault();

        // Shift+clic: suma o quita el elemento de la selección sin arrastrar
        if (e.shiftKey && !e.touches) {
            const base = multiIds.length > 1 ? multiIds : (selectedEditItemId ? [selectedEditItemId] : []);
            setSelection(base.includes(itemId) ? base.filter(id => id !== itemId) : [...base, itemId]);
            return;
        }

        // Si el elemento pertenece al grupo seleccionado se mueve todo el grupo
        const isGroup = multiIds.length > 1 && multiIds.includes(itemId);
        const movingIds = isGroup ? multiIds : [itemId];
        if (!isGroup) setSelectedEditItemId(itemId);

        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;

        const canvas = document.querySelector('.floor-plan-canvas');
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();

        const group = dynamicItems.filter(it => movingIds.includes(it.id));
        if (!group.length) return;
        const starts = new Map(group.map(it => [it.id, { x: it.x, y: it.y }]));
        // Margen disponible para que todo el grupo siga dentro del lienzo
        const minLeft = Math.min(...group.map(it => it.x));
        const minTop = Math.min(...group.map(it => it.y));
        const roomRight = Math.min(...group.map(it => 100 - it.w - it.x));
        const roomBottom = Math.min(...group.map(it => 100 - it.h - it.y));

        // Un solo cambio de estado por frame, sin importar cuántos eventos de ratón lleguen
        let pending = null;
        let raf = 0;
        const flushDrag = () => {
            raf = 0;
            if (!pending) return;
            const { dx, dy } = pending;
            pending = null;
            setDynamicItems(prev => prev.map(it => {
                const st = starts.get(it.id);
                return st ? { ...it, x: parseFloat((st.x + dx).toFixed(2)), y: parseFloat((st.y + dy).toFixed(2)) } : it;
            }));
        };

        const handleDragMove = (moveEvent) => {
            const currentX = moveEvent.touches ? moveEvent.touches[0].clientX : moveEvent.clientX;
            const currentY = moveEvent.touches ? moveEvent.touches[0].clientY : moveEvent.clientY;

            let deltaX, deltaY;
            if (dimensions.isRotated) {
                const screenDeltaX = currentX - clientX;
                const screenDeltaY = currentY - clientY;
                deltaY = (screenDeltaX / rect.width) * 100;
                deltaX = -(screenDeltaY / rect.height) * 100;
            } else {
                deltaX = ((currentX - clientX) / rect.width) * 100;
                deltaY = ((currentY - clientY) / rect.height) * 100;
            }

            const dx = Math.max(-minLeft, Math.min(roomRight, deltaX));
            const dy = Math.max(-minTop, Math.min(roomBottom, deltaY));

            pending = { dx, dy };
            if (!raf) raf = requestAnimationFrame(flushDrag);
        };

        const handleDragEnd = () => {
            if (raf) cancelAnimationFrame(raf);
            flushDrag(); // aplica la última posición pendiente
            window.removeEventListener('mousemove', handleDragMove);
            window.removeEventListener('mouseup', handleDragEnd);
            window.removeEventListener('touchmove', handleDragMove);
            window.removeEventListener('touchend', handleDragEnd);
        };

        window.addEventListener('mousemove', handleDragMove);
        window.addEventListener('mouseup', handleDragEnd);
        window.addEventListener('touchmove', handleDragMove, { passive: false });
        window.addEventListener('touchend', handleDragEnd);
    }, [isEditing, dynamicItems, dimensions.isRotated, multiIds, selectedEditItemId]);

    // Selección por zona: arrastrar sobre un área vacía del plano dibuja un rectángulo
    const itemsRef = useRef(dynamicItems);
    itemsRef.current = dynamicItems;
    const handleCanvasMouseDown = (e) => {
        if (!isEditing || e.button !== 0) return;
        e.preventDefault();
        const rect = e.currentTarget.getBoundingClientRect();
        const start = { x: e.clientX, y: e.clientY };
        const base = e.shiftKey ? currentSelectionIds() : [];
        const rotated = dimensions.isRotated;
        // Pantalla → % del plano (misma conversión que usa el arrastre cuando el plano está girado)
        const toPct = (cx, cy) => rotated
            ? { x: (1 - (cy - rect.top) / rect.height) * 100, y: ((cx - rect.left) / rect.width) * 100 }
            : { x: ((cx - rect.left) / rect.width) * 100, y: ((cy - rect.top) / rect.height) * 100 };
        let moved = false;

        const onMove = (ev) => {
            if (!moved && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 4) return;
            moved = true;
            setMarquee({ x1: start.x, y1: start.y, x2: ev.clientX, y2: ev.clientY });
            const a = toPct(start.x, start.y);
            const b = toPct(ev.clientX, ev.clientY);
            const bx1 = Math.min(a.x, b.x), bx2 = Math.max(a.x, b.x);
            const by1 = Math.min(a.y, b.y), by2 = Math.max(a.y, b.y);
            const hit = itemsRef.current
                .filter(it => it.x < bx2 && it.x + it.w > bx1 && it.y < by2 && it.y + it.h > by1)
                .map(it => it.id);
            setSelection([...new Set([...base, ...hit])]);
        };
        const onUp = () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
            setMarquee(null);
            if (moved) marqueeJustEndedRef.current = true;
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    };

    // Resuelve cada FloorItem dinámico con su mesa y sesión
    const resolvedItems = useMemo(() => {
        const resolveTableFast = createTableResolver(tables);
        const sessionsByTableId = new Map();
        activeSessions.forEach(s => {
            sessionsByTableId.set(s.table_id, s);
        });


        return dynamicItems.map(item => {
            const table = item.interactive ? resolveTableFast(item) : null;
            const session = table ? (sessionsByTableId.get(table.id) || null) : null;
            return { item, table, session };
        });
    }, [dynamicItems, tables, activeSessions]);

    // Ids de mesas ya colocadas en el plano (para no vincular dos elementos a la misma mesa)
    const usedTableIds = useMemo(
        () => new Set(resolvedItems.filter(r => r.table).map(r => r.table.id)),
        [resolvedItems]
    );

    // Estadísticas
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

    const handleClick = useCallback((table, session) => {
        if (table) onTableSelect?.(table, session);
    }, [onTableSelect]);

    // Handlers de edición con identidad estable: siempre llaman a la versión más reciente vía ref
    const editApiRef = useRef({});
    editApiRef.current = { handleDragStart, selectedSet, setSelectedEditItemId };
    const editHandlers = useMemo(() => ({
        onClick: (e) => {
            // Ctrl/Cmd: modo lote, el clic no toca elementos (lo gestiona el lienzo)
            if (e.ctrlKey || e.metaKey) return;
            e.stopPropagation();
            const id = e.currentTarget.dataset.itemId;
            const api = editApiRef.current;
            if (e.shiftKey || api.selectedSet.has(id)) return;
            api.setSelectedEditItemId(id);
        },
        onMouseDown: (e) => {
            // Ctrl/Cmd + arrastrar: ignora el elemento y deja que el lienzo dibuje la zona de selección
            if (e.ctrlKey || e.metaKey) return;
            e.stopPropagation();
            editApiRef.current.handleDragStart(e, e.currentTarget.dataset.itemId);
        },
        onTouchStart: (e) => {
            e.stopPropagation();
            editApiRef.current.handleDragStart(e, e.currentTarget.dataset.itemId);
        },
    }), []);

    /** Renderiza el elemento correcto según tipo, inyectando listeners de edición si aplica. */
    const renderItem = useCallback(({ item, table, session }) => {
        const key   = item.id;
        const isSelected = table && selectedTableId === table.id;
        const isEditSelected = isEditing && (selectedEditItemId === item.id || selectedSet.has(item.id));

        // Edición: handlers estables (leen el id del DOM) y estilos constantes → solo se repinta lo que cambia
        const editHighlight = isEditing ? {
            'data-item-id': item.id,
            ...editHandlers,
            style: isEditSelected ? EDIT_ITEM_STYLE_SELECTED : EDIT_ITEM_STYLE,
        } : {
            onItemClick: handleClick
        };

        const isCanvasRotated = dimensions.isRotated;
        switch (item.type) {
            case 'pool_table':
                return <PoolTableEl   key={key} item={item} table={table} session={session} isSelected={isEditing ? isEditSelected : isSelected} isCanvasRotated={isCanvasRotated} {...editHighlight} />;
            case 'dining_table':
                return <DiningTableEl key={key} item={item} table={table} session={session} isSelected={isEditing ? isEditSelected : isSelected} isCanvasRotated={isCanvasRotated} {...editHighlight} />;
            case 'round_stool':
            case 'bar_table':
                return <RoundStoolEl  key={key} item={item} table={table} session={session} isSelected={isEditing ? isEditSelected : isSelected} isCanvasRotated={isCanvasRotated} {...editHighlight} />;
            case 'bar_stool':
                return <BarStoolEl    key={key} item={item} table={table} session={session} isSelected={isEditing ? isEditSelected : isSelected} isCanvasRotated={isCanvasRotated} {...editHighlight} />;
            case 'bar_counter':
                return <BarCounterEl  key={key} item={item} isCanvasRotated={isCanvasRotated} {...editHighlight} />;
            case 'entry':
                return <EntryEl       key={key} item={item} isCanvasRotated={isCanvasRotated} {...editHighlight} />;
            case 'logo':
                return <LogoEl        key={key} item={item} isCanvasRotated={isCanvasRotated} {...editHighlight} />;
            default:
                return null;
        }
    }, [isEditing, selectedEditItemId, selectedSet, selectedTableId, handleClick, dimensions.isRotated, editHandlers]);

    return (
        <div ref={rootRef} className="flex flex-col lg:flex-row h-full bg-[#f4f3f0] overflow-hidden w-full select-none">
            {/* Left Column: Canvas and controls */}
            <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">

                {/* ── Barra de estadísticas estándar (Modo Visualización) ── */}
                {!isEditing && (
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
                )}

                {/* ── Barra de Control de Edición (Modo Edición) ── */}
                {isEditing && (
                    <div className="flex items-center gap-3 px-4 py-2.5 border-b border-amber-200 bg-amber-50 text-amber-900 select-none flex-shrink-0 flex-wrap">
                        <div className="flex items-center gap-2">
                            <span className="animate-pulse bg-amber-200 p-1.5 rounded-full text-amber-700 text-xs font-bold">
                                🔧
                            </span>
                            <span className="text-xs font-semibold">
                                <strong>Editor del Plano</strong>: Arrastra para mover · Ctrl + arrastrar (o arrastrar en un área vacía) selecciona un lote (Shift suma) · Supr quita · Ctrl+D clona.
                            </span>
                        </div>
                        <div className="ml-auto flex items-center gap-2">
                            <button
                                onClick={() => setShowTutorial(true)}
                                className="bg-sky-100 hover:bg-sky-200 text-sky-900 font-extrabold text-[11px] px-2.5 py-1.5 rounded-lg border border-sky-300 transition-all active:scale-95"
                                title="Cómo usar el editor de plano"
                            >
                                ❓ Tutorial
                            </button>
                            {isDirty && (
                                <span className="text-[10px] font-black text-amber-700 bg-amber-200 px-2 py-1 rounded-full">● Sin guardar</span>
                            )}
                            <button
                                onClick={handleUndo}
                                disabled={historySize.undo === 0}
                                className="bg-white hover:bg-amber-100 disabled:opacity-40 text-amber-900 font-extrabold text-[11px] px-2.5 py-1.5 rounded-lg border border-amber-300 transition-all active:scale-95"
                                title="Deshacer (Ctrl+Z)"
                            >
                                ↩ Deshacer
                            </button>
                            <button
                                onClick={handleRedo}
                                disabled={historySize.redo === 0}
                                className="bg-white hover:bg-amber-100 disabled:opacity-40 text-amber-900 font-extrabold text-[11px] px-2.5 py-1.5 rounded-lg border border-amber-300 transition-all active:scale-95"
                                title="Rehacer (Ctrl+Shift+Z)"
                            >
                                ↪ Rehacer
                            </button>
                            <button
                                onClick={handleExportLayout}
                                className="bg-amber-100 hover:bg-amber-250 text-amber-900 font-extrabold text-[11px] px-2.5 py-1.5 rounded-lg border border-amber-300 transition-all active:scale-95 flex items-center gap-1.5"
                                title="Exportar la distribución de mesas a un archivo JSON y al portapapeles"
                            >
                                📤 Exportar Configuración
                            </button>
                            <button
                                onClick={handleResetLayout}
                                className="bg-rose-100 hover:bg-rose-200 text-rose-800 font-extrabold text-[11px] px-2.5 py-1.5 rounded-lg border border-rose-350 transition-all active:scale-95"
                            >
                                Restaurar plano
                            </button>
                            <button
                                onClick={handleCancelLayout}
                                className="bg-slate-150 hover:bg-slate-200 text-slate-700 font-extrabold text-[11px] px-2.5 py-1.5 rounded-lg border border-slate-300 transition-all active:scale-95"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleSaveLayout}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[11px] px-3 py-1.5 rounded-lg shadow-sm transition-all active:scale-95"
                            >
                                Guardar Cambios
                            </button>
                        </div>
                    </div>
                )}

                {/* ── Canvas del plano ── */}
                <div 
                    ref={canvasParentRef}
                    className="flex-1 overflow-hidden p-3 sm:p-4 flex items-center justify-center bg-[#f4f3f0] w-full relative"
                    onClick={() => {
                        if (marqueeJustEndedRef.current) { marqueeJustEndedRef.current = false; return; }
                        setSelectedEditItemId(null);
                    }}
                >
                    {/* ── Botones Zoom flotantes (solo modo no-edición) ── */}
                    {!isEditing && (
                        <div
                            className="absolute bottom-4 right-4 z-50 flex flex-col gap-2 items-center"
                            onClick={e => e.stopPropagation()}
                        >
                            <button
                                onPointerDown={e => { e.stopPropagation(); handleZoomIn(); }}
                                className="w-12 h-12 rounded-full bg-white/95 backdrop-blur-sm shadow-xl border border-slate-200 text-slate-800 text-2xl font-black flex items-center justify-center active:scale-90 transition-all hover:bg-white select-none"
                                title="Acercar"
                            >+</button>
                            {zoomLevel > 1.05 && (
                                <button
                                    onPointerDown={e => { e.stopPropagation(); handleZoomReset(); }}
                                    className="w-10 h-10 rounded-full bg-slate-800/90 backdrop-blur-sm shadow-md text-white text-xs font-bold flex items-center justify-center active:scale-90 transition-all select-none"
                                    title="Restablecer zoom"
                                >⊙</button>
                            )}
                            <button
                                onPointerDown={e => { e.stopPropagation(); handleZoomOut(); }}
                                className="w-12 h-12 rounded-full bg-white/95 backdrop-blur-sm shadow-xl border border-slate-200 text-slate-800 text-2xl font-black flex items-center justify-center active:scale-90 transition-all hover:bg-white select-none"
                                title="Alejar"
                            >−</button>
                            {zoomLevel > 1.05 && (
                                <span className="text-[9px] font-black text-slate-500 bg-white/80 backdrop-blur-sm px-2 py-1 rounded-full shadow-sm select-none font-mono">
                                    {Math.round(zoomLevel * 100)}%
                                </span>
                            )}
                        </div>
                    )}
                    <style dangerouslySetInnerHTML={{__html: `
                        .canvas-wrapper {
                            position: relative;
                            flex-shrink: 0;
                            margin: auto;
                            box-sizing: border-box;
                        }
                        .floor-plan-canvas {
                            box-sizing: border-box;
                            position: absolute;
                            top: 0;
                            left: 0;
                            width: 1000px;
                            height: 562.5px;
                            background-image: url('${pisoMaderaPng}');
                            background-repeat: repeat;
                            background-size: 220px 220px;
                            border: 3.5px solid #d97706; /* Luxurious brass/gold frame */
                            border-radius: 0.75rem;
                            overflow: hidden;
                            box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.4), 0 8px 10px -6px rgba(0, 0, 0, 0.4);
                            flex-shrink: 0;
                            transition: border-color 300ms ease, border-style 300ms ease, box-shadow 300ms ease, ring 300ms ease;
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
                        .touch-target-expand {
                            position: relative;
                        }
                        .touch-target-expand::after {
                            content: '';
                            position: absolute;
                            top: -12px;
                            left: -12px;
                            right: -12px;
                            bottom: -12px;
                            cursor: pointer;
                            z-index: 5;
                        }
                        .floor-plan-canvas button {
                            outline: none;
                            box-shadow: none;
                        }
                        .floor-plan-canvas button:focus {
                            outline: none;
                            box-shadow: none;
                        }
                        .floor-plan-canvas button:active {
                            outline: none;
                            box-shadow: none;
                        }
                        .floor-plan-canvas img {
                            image-rendering: -moz-crisp-edges;
                            image-rendering: -webkit-optimize-contrast;
                            image-rendering: pixelated;
                            image-rendering: crisp-edges;
                            -ms-interpolation-mode: nearest-neighbor;
                        }
                    `}} />
                    {/* Zoom & Pan container */}
                    <div
                        ref={zoomContainerRef}
                        className="w-full h-full flex items-center justify-center overflow-hidden"
                        style={{ 
                            touchAction: isEditing ? 'none' : (zoomLevel > 1 ? 'none' : 'pan-x pan-y'),
                            cursor: isEditing ? 'default' : (zoomLevel > 1.01 ? 'grab' : 'default')
                        }}
                    >
                        <div 
                            ref={canvasWrapperRef}
                            className="canvas-wrapper"
                            style={{
                                width: `${dimensions.width}px`,
                                height: `${dimensions.height}px`,
                                opacity: isMeasured ? 1 : 0,
                                transition: 'opacity 150ms ease-in-out',
                                transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomLevel})`,
                                transformOrigin: 'center center',
                                willChange: (zoomLevel !== 1 || panOffset.x !== 0 || panOffset.y !== 0) ? 'transform' : 'auto',
                            }}
                        >
                            <div 
                                className={`floor-plan-canvas ${isEditing ? 'border-dashed border-amber-400 ring-4 ring-amber-400/20' : ''}`}
                                onMouseDown={handleCanvasMouseDown}
                                style={{
                                    transform: dimensions.isRotated 
                                        ? `scale(${dimensions.scale}) translate(0px, 1000px) rotate(-90deg)`
                                        : `scale(${dimensions.scale})`,
                                    transformOrigin: 'top left',
                                }}
                            >
                                {/* Cuadrícula sutil */}
                                <div
                                    className="absolute inset-0 transition-opacity duration-300"
                                    style={{
                                        opacity: isEditing ? 0.07 : 0.03,
                                        backgroundImage: `
                                            linear-gradient(to right, rgba(255,255,255,0.2) 1px, transparent 1px),
                                            linear-gradient(to bottom, rgba(255,255,255,0.2) 1px, transparent 1px)
                                        `,
                                        backgroundSize: isEditing ? '20px 20px' : '40px 40px',
                                    }}
                                />

                                {/* Ubicación sugerida (vista previa de la cuadrícula) */}
                                {isEditing && alignPreview && alignPreview.items.map(pv => {
                                    const isKept = alignPreview.kept.includes(pv.id);
                                    return (
                                    <div
                                        key={`ghost-${pv.id}`}
                                        style={{
                                            position: 'absolute',
                                            left: `${pv.x}%`, top: `${pv.y}%`,
                                            width: `${pv.w}%`, height: `${pv.h}%`,
                                            border: `2.5px dashed ${isKept ? '#e11d48' : '#0284c7'}`,
                                            background: isKept ? 'rgba(244,63,94,0.18)' : 'rgba(14,165,233,0.18)',
                                            borderRadius: 10,
                                            pointerEvents: 'none',
                                            zIndex: 60,
                                        }}
                                    />
                                    );
                                })}

                                {/* Todos los elementos del plano */}
                                {resolvedItems.map(({ item, table, session }) => {
                                    return renderItem({ item, table, session });
                                })}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Indicación de uso */}
                <p className="text-center text-[10px] text-slate-500 pb-2.5 select-none flex-shrink-0 bg-[#f4f3f0]">
                    {isEditing
                        ? 'Arrastra para mover · Pool Imperial'
                        : zoomLevel > 1.05
                            ? 'Arrastra con 1 dedo para moverte · Toca +/- para ajustar zoom'
                            : 'Toca una mesa para gestionar · Pellizca o usa + para acercar'
                    }
                </p>
            </div>

            {showTutorial && <FloorPlanTutorial onClose={() => setShowTutorial(false)} />}

            {marquee && (
                <div
                    className="fixed z-[150] pointer-events-none border-2 border-dashed border-amber-500 bg-amber-400/15"
                    style={{
                        left: Math.min(marquee.x1, marquee.x2),
                        top: Math.min(marquee.y1, marquee.y2),
                        width: Math.abs(marquee.x2 - marquee.x1),
                        height: Math.abs(marquee.y2 - marquee.y1),
                    }}
                />
            )}

            {confirmState && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4" onClick={() => answerConfirm(false)}>
                    <div className="bg-white rounded-2xl shadow-2xl p-5 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
                        <p className="text-sm font-bold text-slate-800 leading-relaxed">{confirmState.message}</p>
                        <div className="mt-4 flex justify-end gap-2">
                            <button onClick={() => answerConfirm(false)} className="px-3 py-1.5 rounded-lg text-xs font-extrabold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 active:scale-95">Cancelar</button>
                            <button autoFocus onClick={() => answerConfirm(true)} className="px-3 py-1.5 rounded-lg text-xs font-extrabold bg-rose-600 hover:bg-rose-700 text-white active:scale-95">{confirmState.confirmLabel}</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Right Column: Editor Sidebar (Desktop/Mobile responsive) */}
            {isEditing && (
                <div ref={sidebarRef} className="w-full lg:w-80 border-t lg:border-t-0 lg:border-l border-slate-200 bg-white flex flex-col h-72 lg:h-auto lg:self-start overflow-y-auto flex-shrink-0 shadow-2xl z-20 will-change-transform">
                    <FloorPlanEditorPanel 
                        selectedItemId={selectedEditItemId}
                        items={dynamicItems}
                        setItems={setDynamicItems}
                        onClose={() => setSelectedEditItemId(null)}
                        onAdd={handleAddItem}
                        onDelete={handleDeleteItem}
                        onDuplicate={handleDuplicateItem}
                        multiCount={multiIds.length}
                        onCloneSelection={() => handleCloneItems(multiIds)}
                        onDeleteSelection={() => handleDeleteItems(multiIds)}
                        onClearSelection={() => setSelectedEditItemId(null)}
                        onAlign={handleAlign}
                        onMoveSelection={(sx, sy) => handleMoveSelection(...screenToPlan(sx, sy), multiIds)}
                        isRotated={dimensions.isRotated}
                        hasPreview={!!alignPreview}
                        previewInfo={alignPreview ? { kept: alignPreview.kept.length, shrinkPct: alignPreview.shrink ? alignPreview.shrinkPct : null } : null}
                        onApplyPreview={handleApplyPreview}
                        onCancelPreview={() => setAlignPreview(null)}
                        tables={tables}
                        linkedTable={resolvedItems.find(r => r.item.id === selectedEditItemId)?.table || null}
                        usedTableIds={usedTableIds}
                    />
                </div>
            )}
        </div>
    );
}
