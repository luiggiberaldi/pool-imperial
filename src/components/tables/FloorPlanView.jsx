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

import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useTablesStore } from '../../hooks/store/useTablesStore';
import { FLOOR_ITEMS } from '../../data/floorPlanData';
import { calculateElapsedTime } from '../../utils/tableBillingEngine';
import { showToast } from '../Toast';



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
 * Render: fieltro realístico cargando la imagen mesa-pool.svg, con soporte de rotación portrait
 * y capas de estado e información en tiempo real.
 */
/**
 * PoolTableEl — Mesa de billar.
 * Render: fieltro realístico cargando la imagen mesa-pool.svg, con soporte de rotación portrait
 * y capas de estado e información en tiempo real.
 */
function PoolTableEl({ item, session, onClick, isSelected, isCanvasRotated }) {
    const st = statusOf(session);
    const rotation = item.r || 0;
    const scale = (item.imgScale || 100) / 100;
    
    // Use imgDir if explicitly set, fallback to actual aspect-ratio on 16:9 canvas
    const imgDir = item.imgDir || (item.w * 16 > item.h * 9 ? 'horizontal' : 'vertical');
    const isPortrait = imgDir === 'vertical';

    // Si está ocupada o por cobrar, añadimos un borde de destaque claro
    const isOccupied = st === 'occupied';
    const borderStyle = isOccupied 
        ? '3.5px solid #3b82f6' 
        : st === 'checkout'
            ? '3.5px dashed #f59e0b'
            : st === 'exceeded'
                ? '3.5px dashed #ef4444'
                : '2.5px solid transparent'; // Borde transparente cuando está libre

    // All pool tables use the same horizontal SVG image, rotated 90 degrees if the visual orientation is portrait
    const imgSrc = '/mesa-pool.svg';

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
    const overlayBg = st === 'free'
        ? 'rgba(0, 0, 0, 0)'
        : st === 'checkout'
            ? 'rgba(217, 119, 6, 0.25)' // Amber/naranja cobro
            : st === 'exceeded'
                ? 'rgba(153, 27, 27, 0.35)' // Crimson/rojo excedido
                : 'rgba(59, 130, 246, 0.18)'; // Blue tint for occupied

    return (
        <button
            onClick={onClick}
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
            }}
            className={`group transition-all duration-150 active:scale-[0.98] cursor-pointer overflow-hidden flex items-center justify-center ${st === 'checkout' ? 'checkout-pulsing' : ''}`}
            title={item.label}
        >
            {/* The high-fidelity pool table SVG */}
            <img
                src={imgSrc}
                alt={item.label}
                className="pointer-events-none select-none"
                style={imageStyle}
            />

            {/* Tint overlay for visual status feedback */}
            <div 
                className="absolute inset-0 z-10 pointer-events-none transition-colors duration-300"
                style={{ backgroundColor: overlayBg }}
            />

            {/* Contenido: etiqueta + timer + cliente */}
            <div
                className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-0.5 px-1 text-center bg-transparent transition-colors duration-200"
                style={isCanvasRotated ? { transform: 'rotate(90deg)', writingMode: 'horizontal-tb' } : { writingMode: isPortrait && item.h > 28 ? 'vertical-rl' : 'horizontal-tb' }}
            >
                <span className="font-extrabold text-white leading-none text-[10px] sm:text-[11.5px] tracking-wide drop-shadow-[0_1.5px_1.5px_rgba(0,0,0,0.9)]">
                    {item.label}
                </span>
                {(st === 'occupied' || st === 'exceeded') && session?.started_at && (
                    <LiveTimer
                        startedAt={session.started_at}
                        className="font-mono font-extrabold text-white text-[8px] sm:text-[10px] drop-shadow-[0_1.5px_1.5px_rgba(0,0,0,0.9)]"
                    />
                )}
                {(st === 'occupied' || st === 'exceeded') && session?.client_name && (
                    <span className="text-white font-bold text-[7.5px] sm:text-[8px] truncate max-w-full drop-shadow-[0_1.5px_1.5px_rgba(0,0,0,0.9)]">
                        {session.client_name}
                    </span>
                )}
                {st === 'checkout' && (
                    <span className="font-black text-amber-300 text-[7.5px] sm:text-[8px] uppercase tracking-wider drop-shadow-[0_1.5px_1.5px_rgba(0,0,0,0.9)]">
                        COBRAR
                    </span>
                )}
                {st === 'exceeded' && (
                    <span className="font-black text-rose-300 text-[7.5px] sm:text-[8px] uppercase tracking-wider animate-pulse drop-shadow-[0_1.5px_1.5px_rgba(0,0,0,0.9)]">
                        EXCEDIDO
                    </span>
                )}
                {st === 'free' && (
                    <span className="text-white/55 text-[7px] uppercase tracking-wider font-extrabold drop-shadow-[0_1px_1px_rgba(0,0,0,0.7)]">
                        libre
                    </span>
                )}
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
function DiningTableEl({ item, session, onClick, isSelected, isCanvasRotated }) {
    const st = statusOf(session);
    const rotation = item.r || 0;
    const scale = (item.imgScale || 100) / 100;

    const overlayBg = st === 'free'
        ? 'rgba(0, 0, 0, 0)'
        : st === 'checkout'
            ? 'rgba(217, 119, 6, 0.25)' // Amber
            : st === 'exceeded'
                ? 'rgba(153, 27, 27, 0.35)' // Crimson
                : 'rgba(59, 130, 246, 0.18)'; // Blue

    const imgSrc = '/mesas-normales.svg';

    return (
        <button
            onClick={onClick}
            style={{
                position: 'absolute',
                left: `${item.x}%`, top: `${item.y}%`,
                width: `${item.w}%`, height: `${item.h}%`,
                transform: rotation ? `rotate(${rotation}deg)` : undefined,
                outline: isSelected ? '3px solid #f97316' : undefined,
                outlineOffset: '2px',
                zIndex: isSelected ? 30 : undefined,
                background: 'transparent',
                border: 'none',
                filter: 'drop-shadow(0px 3.5px 5px rgba(0,0,0,0.5))',
            }}
            className={`group transition-all duration-150 active:scale-[0.98] cursor-pointer overflow-hidden flex items-center justify-center ${st === 'checkout' ? 'checkout-pulsing' : ''}`}
            title={item.label}
        >
            {/* The high-fidelity dining table SVG */}
            <img
                src={imgSrc}
                alt={item.label}
                className="pointer-events-none select-none w-full h-full object-fill"
                style={{ transform: scale !== 1 ? `scale(${scale})` : undefined }}
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
                {(st === 'occupied' || st === 'exceeded') && session?.client_name && (
                    <span className="text-white font-extrabold text-[7.5px] sm:text-[8px] truncate max-w-full drop-shadow-[0_1.5px_1.5px_rgba(0,0,0,0.95)]">
                        {session.client_name}
                    </span>
                )}
                {st === 'checkout' && (
                    <span className="font-black text-amber-300 text-[7.5px] sm:text-[8px] uppercase tracking-wider drop-shadow-[0_1.5px_1.5px_rgba(0,0,0,0.95)]">
                        COBRAR
                    </span>
                )}
                {st === 'exceeded' && (
                    <span className="font-black text-rose-300 text-[7.5px] sm:text-[8px] uppercase tracking-wider animate-pulse drop-shadow-[0_1.5px_1.5px_rgba(0,0,0,0.95)]">
                        EXCEDIDO
                    </span>
                )}
            </div>

            {/* Punto de estado */}
            <StatusDot status={st} />
        </button>
    );
}

/**
 * RoundStoolEl — Taburete alto redondo / Mesa redonda (M4-M11).
 * Render: fieltro realístico cargando la imagen mesa-redonda.svg, con capas de estado e información en tiempo real.
 */
function RoundStoolEl({ item, session, onClick, isSelected, isCanvasRotated }) {
    const st = statusOf(session);
    const rotation = item.r || 0;
    const scale = (item.imgScale || 100) / 100;

    const overlayBg = st === 'free'
        ? 'rgba(0, 0, 0, 0)'
        : st === 'checkout'
            ? 'rgba(217, 119, 6, 0.25)' // Amber/naranja cobro
            : st === 'exceeded'
                ? 'rgba(153, 27, 27, 0.35)' // Crimson/rojo excedido
                : 'rgba(59, 130, 246, 0.18)'; // Blue tint for occupied

    const imgSrc = '/mesa-redonda.svg';

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
                background: 'transparent',
                border: 'none',
                filter: 'drop-shadow(0px 3.5px 5px rgba(0,0,0,0.5))',
            }}
            className={`group flex items-center justify-center transition-all duration-150 active:scale-[0.98] cursor-pointer ${st === 'checkout' ? 'checkout-pulsing' : ''}`}
            title={item.label}
        >
            <div
                className="relative overflow-hidden flex items-center justify-center"
                style={{
                    height: '100%',
                    aspectRatio: '1/1',
                    borderRadius: '50%',
                }}
            >
                <img
                    src={imgSrc}
                    alt={item.label}
                    className="pointer-events-none select-none w-full h-full object-contain"
                    style={{ transform: `rotate(${rotation}deg) scale(${scale})` }}
                />
                <div 
                    className="absolute inset-0 z-10 pointer-events-none transition-colors duration-300 rounded-full"
                    style={{ backgroundColor: overlayBg }}
                />
                <span
                    className="absolute z-20 leading-none text-center font-black text-white drop-shadow-[0_1.5px_1.5px_rgba(0,0,0,0.95)]"
                    style={{
                        fontSize: item.label.length > 2 ? '7.5px' : '9px',
                        transform: isCanvasRotated ? 'rotate(90deg)' : undefined,
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
function BarStoolEl({ item, session, onClick, isSelected, isCanvasRotated }) {
    const st = statusOf(session);
    const rotation = item.r || 0;
    const scale = (item.imgScale || 100) / 100;

    const overlayBg = st === 'free'
        ? 'rgba(0, 0, 0, 0)'
        : st === 'checkout'
            ? 'rgba(217, 119, 6, 0.3)'
            : st === 'exceeded'
                ? 'rgba(239, 68, 68, 0.4)'
                : 'rgba(59, 130, 246, 0.25)'; // Blue tint for occupied

    const imgSrc = '/bancos.svg';

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
                background: 'transparent',
                border: 'none',
            }}
            className={`group flex items-center justify-center transition-all duration-150 active:scale-[0.98] cursor-pointer ${st === 'checkout' ? 'checkout-pulsing' : ''}`}
            title={item.label}
        >
            <div
                className="relative overflow-hidden flex items-center justify-center"
                style={{
                    height: '90%',
                    aspectRatio: '1/1',
                    borderRadius: '50%',
                }}
            >
                <img
                    src={imgSrc}
                    alt={item.label}
                    className="pointer-events-none select-none w-full h-full object-contain"
                    style={{ transform: `rotate(${rotation}deg) scale(${scale})` }}
                />
                <div 
                    className="absolute inset-0 z-10 pointer-events-none transition-colors duration-300 rounded-full"
                    style={{ backgroundColor: overlayBg }}
                />
                <span
                    className="absolute z-20 leading-none text-center font-black text-white drop-shadow-[0_1.5px_1.5px_rgba(0,0,0,0.95)]"
                    style={{
                        fontSize: item.label.length > 2 ? '6px' : '7.5px',
                        transform: isCanvasRotated ? 'rotate(90deg)' : undefined,
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
function BarCounterEl({ item, isCanvasRotated, ...props }) {
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
                src="/barra.svg" 
                alt={item.label} 
                className="pointer-events-none select-none"
                style={imageStyle}
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
}

/**
 * EntryEl — Marcador de entrada al local.
 * Render: bloque limpio y técnico de entrada.
 */
function EntryEl({ item, ...props }) {
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
}

/**
 * LogoEl — Área de marca central simplificada.
 */
function LogoEl({ item, isCanvasRotated, ...props }) {
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
                src="/logo.png" 
                alt="Pool Imperial" 
                className="h-full object-contain select-none pointer-events-none transition-transform duration-300"
                style={{ transform: `rotate(${rotation}deg) scale(${scale})` }}
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
                { bg: '#f8fafc', border: '#d97706', label: 'Stool Libre' },
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
// EDITOR SUBCOMPONENT: FloorPlanEditorPanel
// ═══════════════════════════════════════════════════════

function FloorPlanEditorPanel({ selectedItemId, items, setItems, onClose }) {
    const selectedItem = items.find(it => it.id === selectedItemId);
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

            const isLocked = it.ratioLocked || false;
            if (isLocked && (prop === 'w' || prop === 'h')) {
                const currentW = it.w || 1;
                const currentH = it.h || 1;
                const ratio = currentH / currentW;

                if (prop === 'w') {
                    const newW = safeVal;
                    const newH = parseFloat((newW * ratio).toFixed(2));
                    if (newH > 100 || newW > 100) return it;
                    return { ...it, w: newW, h: newH };
                } else {
                    const newH = safeVal;
                    const newW = parseFloat((newH / ratio).toFixed(2));
                    if (newW > 100 || newH > 100) return it;
                    return { ...it, w: newW, h: newH };
                }
            }

            return { ...it, [prop]: parseFloat(safeVal.toFixed(2)) };
        }));
    };

    const nudge = (prop, delta) => {
        if (!selectedItem) return;
        const current = selectedItem[prop] || 0;
        const maxLimit = (prop === 'x' || prop === 'w') ? 100 - (prop === 'x' ? selectedItem.w : 0) : 100 - (prop === 'y' ? selectedItem.h : 0);
        const nextVal = Math.max(0, Math.min(maxLimit, current + delta));
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

    if (!selectedItem) {
        return (
            <div className="p-6 text-center flex flex-col items-center justify-center h-full text-slate-400 select-none">
                <span className="text-3xl mb-2">👈</span>
                <p className="text-xs font-bold leading-relaxed">Selecciona una mesa, taburete o barra en el plano para ajustar su tamaño y ubicación.</p>
            </div>
        );
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
                            max="50"
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
                            max="50"
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
                            onClick={() => nudge('y', -0.5)}
                            className="w-9 h-8 bg-slate-100 hover:bg-slate-200 border border-slate-200 active:scale-90 transition-all rounded-lg flex items-center justify-center text-xs font-bold"
                            title="Mover arriba 0.5%"
                        >
                            ▲
                        </button>
                        <div className="flex items-center gap-3">
                            <button 
                                onClick={() => nudge('x', -0.5)}
                                className="w-9 h-8 bg-slate-100 hover:bg-slate-200 border border-slate-200 active:scale-90 transition-all rounded-lg flex items-center justify-center text-xs font-bold"
                                title="Mover izquierda 0.5%"
                            >
                                ◄
                            </button>
                            <button 
                                onClick={() => nudge('x', 0.5)}
                                className="w-9 h-8 bg-slate-100 hover:bg-slate-200 border border-slate-200 active:scale-90 transition-all rounded-lg flex items-center justify-center text-xs font-bold"
                                title="Mover derecha 0.5%"
                            >
                                ►
                            </button>
                        </div>
                        <button 
                            onClick={() => nudge('y', 0.5)}
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

export default function FloorPlanView({ onTableSelect, selectedTableId, isEditing, onExitEditing }) {
    const { tables, activeSessions } = useTablesStore();

    // Auto-scaling responsive logic
    const canvasParentRef = useRef(null);
    const [dimensions, setDimensions] = useState({ width: 1000, height: 562.5, scale: 1, isRotated: false });
    const [isMeasured, setIsMeasured] = useState(false);

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
                
                setDimensions({
                    width: canvasW,
                    height: canvasH,
                    scale,
                    isRotated: isPortrait
                });
                setIsMeasured(true);
            }
        });
        resizeObserver.observe(canvasParentRef.current);
        return () => resizeObserver.disconnect();
    }, []);

    // Carga de distribución de plano dinámica
    const [dynamicItems, setDynamicItems] = useState(() => {
        const saved = localStorage.getItem('custom_floor_plan_items');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                // Migración: Forzar que el entry-1 esté debajo de M1 de forma predeterminada
                return parsed.map(it => {
                    if (it.id === 'entry-1') {
                        return {
                            ...it,
                            x: 4.25,
                            y: 96.5,
                            w: 7.5,
                            h: 3.5
                        };
                    }
                    return it;
                });
            } catch (e) {
                console.error("Error loading custom floor plan layout", e);
            }
        }
        return FLOOR_ITEMS;
    });

    // Elemento seleccionado en el editor
    const [selectedEditItemId, setSelectedEditItemId] = useState(null);

    // Salvar cambios
    const handleSaveLayout = () => {
        localStorage.setItem('custom_floor_plan_items', JSON.stringify(dynamicItems));
        showToast("Distribución del plano guardada con éxito", "success");
        onExitEditing?.();
    };

    // Cancelar cambios
    const handleCancelLayout = () => {
        const saved = localStorage.getItem('custom_floor_plan_items');
        if (saved) {
            try {
                setDynamicItems(JSON.parse(saved));
            } catch (e) {
                setDynamicItems(FLOOR_ITEMS);
            }
        } else {
            setDynamicItems(FLOOR_ITEMS);
        }
        setSelectedEditItemId(null);
        showToast("Cambios del plano descartados", "info");
        onExitEditing?.();
    };

    // Restaurar por defecto
    const handleResetLayout = () => {
        if (window.confirm("¿Estás seguro de que deseas restaurar la distribución original del local? Se borrarán todos los cambios de tamaño y ubicación personalizados.")) {
            localStorage.removeItem('custom_floor_plan_items');
            setDynamicItems(FLOOR_ITEMS);
            setSelectedEditItemId(null);
            showToast("Distribución restaurada por defecto", "success");
            onExitEditing?.();
        }
    };

    // Handler de Arrastre visual (Mouse & Touch)
    const handleDragStart = (e, itemId) => {
        if (!isEditing) return;
        e.preventDefault();
        
        setSelectedEditItemId(itemId);
        
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        
        const canvas = document.querySelector('.floor-plan-canvas');
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        
        const targetItem = dynamicItems.find(it => it.id === itemId);
        if (!targetItem) return;

        const startX = targetItem.x;
        const startY = targetItem.y;
        
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
            
            const newX = Math.max(0, Math.min(100 - targetItem.w, startX + deltaX));
            const newY = Math.max(0, Math.min(100 - targetItem.h, startY + deltaY));
            
            setDynamicItems(prev => prev.map(it => 
                it.id === itemId ? { ...it, x: parseFloat(newX.toFixed(2)), y: parseFloat(newY.toFixed(2)) } : it
            ));
        };
        
        const handleDragEnd = () => {
            window.removeEventListener('mousemove', handleDragMove);
            window.removeEventListener('mouseup', handleDragEnd);
            window.removeEventListener('touchmove', handleDragMove);
            window.removeEventListener('touchend', handleDragEnd);
        };
        
        window.addEventListener('mousemove', handleDragMove);
        window.addEventListener('mouseup', handleDragEnd);
        window.addEventListener('touchmove', handleDragMove, { passive: false });
        window.addEventListener('touchend', handleDragEnd);
    };

    // Resuelve cada FloorItem dinámico con su mesa y sesión
    const resolvedItems = useMemo(() => {
        return dynamicItems.map(item => {
            const table = item.interactive ? resolveTable(item, tables) : null;
            const session = table ? activeSessions.find(s => s.table_id === table.id) : null;
            return { item, table, session };
        });
    }, [dynamicItems, tables, activeSessions]);

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

    const handleClick = (table, session) => {
        if (table) onTableSelect?.(table, session);
    };

    /** Renderiza el elemento correcto según tipo, inyectando listeners de edición si aplica. */
    const renderItem = ({ item, table, session }) => {
        const key   = item.id;
        const isSelected = table && selectedTableId === table.id;
        const isEditSelected = isEditing && selectedEditItemId === item.id;

        // Asignación de Click & Drag según estado de edición
        const clickHandlers = isEditing ? {
            onClick: (e) => {
                e.stopPropagation();
                setSelectedEditItemId(item.id);
            },
            onMouseDown: (e) => handleDragStart(e, item.id),
            onTouchStart: (e) => handleDragStart(e, item.id),
            style: { cursor: 'move' }
        } : {
            onClick: () => handleClick(table, session)
        };

        const editHighlight = isEditing ? {
            ...clickHandlers,
            style: {
                ...clickHandlers.style,
                ...(isEditSelected ? {
                    outline: '3.5px solid #f59e0b',
                    outlineOffset: '2.5px',
                    zIndex: 40,
                } : {})
            }
        } : clickHandlers;

        const isCanvasRotated = dimensions.isRotated;
        switch (item.type) {
            case 'pool_table':
                return <PoolTableEl   key={key} item={item} session={session} isSelected={isEditing ? isEditSelected : isSelected} isCanvasRotated={isCanvasRotated} {...editHighlight} />;
            case 'dining_table':
                return <DiningTableEl key={key} item={item} session={session} isSelected={isEditing ? isEditSelected : isSelected} isCanvasRotated={isCanvasRotated} {...editHighlight} />;
            case 'round_stool':
            case 'bar_table':
                return <RoundStoolEl  key={key} item={item} session={session} isSelected={isEditing ? isEditSelected : isSelected} isCanvasRotated={isCanvasRotated} {...editHighlight} />;
            case 'bar_stool':
                return <BarStoolEl    key={key} item={item} session={session} isSelected={isEditing ? isEditSelected : isSelected} isCanvasRotated={isCanvasRotated} {...editHighlight} />;
            case 'bar_counter':
                return <BarCounterEl  key={key} item={item} isCanvasRotated={isCanvasRotated} {...editHighlight} />;
            case 'entry':
                return <EntryEl       key={key} item={item} isCanvasRotated={isCanvasRotated} {...editHighlight} />;
            case 'logo':
                return <LogoEl        key={key} item={item} isCanvasRotated={isCanvasRotated} {...editHighlight} />;
            default:
                return null;
        }
    };

    return (
        <div className="flex flex-col lg:flex-row h-full bg-[#f4f3f0] overflow-hidden w-full select-none">
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
                                <strong>Editor del Plano</strong>: Arrastra las mesas para moverlas, o selecciónalas para ajustar su tamaño y etiqueta en el panel derecho.
                            </span>
                        </div>
                        <div className="ml-auto flex items-center gap-2">

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
                    className="flex-1 overflow-hidden p-3 sm:p-4 flex items-center justify-center bg-[#f4f3f0] w-full"
                    onClick={() => setSelectedEditItemId(null)}
                >
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
                            background-image: url('/piso-madera-clara.png');
                            background-repeat: repeat;
                            background-size: 220px 220px;
                            border: 3.5px solid #d97706; /* Luxurious brass/gold frame */
                            border-radius: 0.75rem;
                            overflow: hidden;
                            box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.4), 0 8px 10px -6px rgba(0, 0, 0, 0.4);
                            flex-shrink: 0;
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
                    <div 
                        className="canvas-wrapper"
                        style={{
                            width: `${dimensions.width}px`,
                            height: `${dimensions.height}px`,
                            opacity: isMeasured ? 1 : 0,
                            transition: 'opacity 150ms ease-in-out',
                        }}
                    >
                        <div 
                            className={`floor-plan-canvas transition-all duration-300 ${isEditing ? 'border-dashed border-amber-400 ring-4 ring-amber-400/20' : ''}`}
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

                            {/* Todos los elementos del plano */}
                            {resolvedItems.map(renderItem)}
                        </div>
                    </div>
                </div>

                {/* Indicación de uso */}
                <p className="text-center text-[10px] text-slate-500 pb-2.5 select-none flex-shrink-0 bg-[#f4f3f0]">
                    {isEditing ? 'Haz arrastre (drag) en cualquier elemento para moverlo de posición' : 'Toca una mesa para gestionar · Pool Imperial'}
                </p>
            </div>

            {/* Right Column: Editor Sidebar (Desktop/Mobile responsive) */}
            {isEditing && (
                <div className="w-full lg:w-80 border-t lg:border-t-0 lg:border-l border-slate-200 bg-white flex flex-col h-72 lg:h-full overflow-y-auto flex-shrink-0 shadow-2xl z-20">
                    <FloorPlanEditorPanel 
                        selectedItemId={selectedEditItemId}
                        items={dynamicItems}
                        setItems={setDynamicItems}
                        onClose={() => setSelectedEditItemId(null)}
                    />
                </div>
            )}
        </div>
    );
}
