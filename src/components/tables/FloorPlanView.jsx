import React, { useMemo, useRef, useState, useEffect } from 'react';
import { useTablesStore } from '../../hooks/store/useTablesStore';
import { useAuthStore } from '../../hooks/store/authStore';
import { FLOOR_ITEMS } from '../../data/floorPlanData';
import { calculateElapsedTime } from '../../utils/tableBillingEngine';

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtTimer(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// Resolve floor item → table from the store by name
function resolveTable(item, tables) {
    if (!item.refName) return null;
    return tables.find(t => t.name === item.refName) || null;
}

// ─── LiveTimer ──────────────────────────────────────────────────────────────
function LiveTimer({ startedAt }) {
    const [elapsed, setElapsed] = useState(() => calculateElapsedTime(startedAt));
    useEffect(() => {
        const iv = setInterval(() => setElapsed(calculateElapsedTime(startedAt)), 1000);
        return () => clearInterval(iv);
    }, [startedAt]);
    return <span>{fmtTimer(elapsed)}</span>;
}

// ─── Pool Table Element ──────────────────────────────────────────────────────
function PoolTableEl({ item, table, session, onClick, isAdmin }) {
    const isOccupied = !!session;
    const isCheckout = session?.status === 'CHECKOUT';

    const bg = isOccupied
        ? isCheckout
            ? 'from-amber-500 to-orange-500'
            : 'from-emerald-600 to-teal-600'
        : 'from-slate-700 to-slate-800';

    return (
        <button
            onClick={onClick}
            className={`
                absolute flex flex-col items-center justify-center
                rounded-xl border-2 cursor-pointer transition-all duration-200
                active:scale-95 group
                ${isOccupied
                    ? isCheckout
                        ? 'border-amber-400 shadow-amber-500/40 shadow-lg'
                        : 'border-emerald-400/60 shadow-emerald-600/30 shadow-lg'
                    : 'border-slate-600/50 hover:border-sky-500/60 hover:shadow-sky-500/20 hover:shadow-md'
                }
                bg-gradient-to-br ${bg}
            `}
            style={{
                left: `${item.x}%`,
                top: `${item.y}%`,
                width: `${item.w}%`,
                height: `${item.h}%`,
            }}
            title={item.label}
        >
            {/* Felt texture overlay */}
            <div className="absolute inset-1 rounded-lg opacity-20 bg-[repeating-linear-gradient(45deg,transparent,transparent_2px,rgba(255,255,255,0.1)_2px,rgba(255,255,255,0.1)_4px)]" />

            {/* Corner pockets */}
            {['-top-0.5 -left-0.5', '-top-0.5 -right-0.5', '-bottom-0.5 -left-0.5', '-bottom-0.5 -right-0.5'].map((pos, i) => (
                <div key={i} className={`absolute w-1.5 h-1.5 rounded-full bg-slate-900 border border-slate-600 ${pos}`} />
            ))}
            {/* Side pockets */}
            <div className="absolute top-1/2 -left-1 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-slate-900 border border-slate-600" />
            <div className="absolute top-1/2 -right-1 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-slate-900 border border-slate-600" />

            {/* Content */}
            <div className="relative z-10 flex flex-col items-center gap-0.5 px-1">
                <span className={`font-black text-white leading-tight text-center
                    ${item.h > 20 ? 'text-xs sm:text-sm' : 'text-[9px] sm:text-xs'}`}>
                    {item.label}
                </span>
                {isOccupied && session?.started_at && (
                    <span className="text-[9px] font-mono text-white/80 font-bold">
                        <LiveTimer startedAt={session.started_at} />
                    </span>
                )}
                {isOccupied && session?.client_name && (
                    <span className="text-[8px] text-white/70 truncate max-w-full px-1 text-center">
                        {session.client_name}
                    </span>
                )}
                {!isOccupied && (
                    <span className="text-[9px] text-white/40 font-medium">LIBRE</span>
                )}
                {isCheckout && (
                    <span className="text-[8px] font-black text-amber-200 uppercase tracking-wide animate-pulse">
                        COBRAR
                    </span>
                )}
            </div>

            {/* Occupied pulse ring */}
            {isOccupied && !isCheckout && (
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            )}
        </button>
    );
}

// ─── Bar/Normal Table Element ─────────────────────────────────────────────────
function BarTableEl({ item, table, session, onClick }) {
    const isOccupied = !!session;
    const isCheckout = session?.status === 'CHECKOUT';

    return (
        <button
            onClick={onClick}
            className={`
                absolute flex flex-col items-center justify-center
                rounded-xl border cursor-pointer transition-all duration-200 active:scale-95
                ${isOccupied
                    ? isCheckout
                        ? 'bg-amber-500/80 border-amber-400 text-white shadow-amber-500/30 shadow-md'
                        : 'bg-violet-600/80 border-violet-400/60 text-white shadow-violet-500/20 shadow-md'
                    : 'bg-slate-800/70 border-slate-600/40 text-slate-300 hover:bg-slate-700/80 hover:border-slate-500'
                }
            `}
            style={{
                left: `${item.x}%`,
                top: `${item.y}%`,
                width: `${item.w}%`,
                height: `${item.h}%`,
            }}
            title={item.label}
        >
            <span className={`font-black leading-none text-center
                ${item.w < 6 ? 'text-[8px]' : 'text-[10px] sm:text-xs'}`}>
                {item.label}
            </span>
            {isOccupied && session?.client_name && (
                <span className="text-[7px] opacity-80 truncate max-w-full px-0.5 text-center">
                    {session.client_name}
                </span>
            )}
            {isOccupied && !isCheckout && (
                <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            )}
            {isCheckout && (
                <span className="text-[7px] font-black text-amber-200 uppercase animate-pulse">
                    COBRAR
                </span>
            )}
        </button>
    );
}

// ─── Bar Counter Element (decorative) ────────────────────────────────────────
function BarCounterEl({ item }) {
    const isVertical = item.h > item.w;
    return (
        <div
            className="absolute rounded-lg bg-gradient-to-br from-amber-900/60 to-amber-800/40 border border-amber-700/40 flex items-center justify-center"
            style={{
                left: `${item.x}%`,
                top: `${item.y}%`,
                width: `${item.w}%`,
                height: `${item.h}%`,
            }}
        >
            {item.label && (
                <span
                    className="text-amber-300/70 font-black text-[9px] sm:text-[10px] tracking-widest uppercase select-none"
                    style={{ writingMode: isVertical ? 'vertical-rl' : 'horizontal-tb' }}
                >
                    {item.label}
                </span>
            )}
        </div>
    );
}

// ─── Entry Element ────────────────────────────────────────────────────────────
function EntryEl({ item }) {
    return (
        <div
            className="absolute flex items-center justify-center rounded-r-lg bg-sky-900/30 border-y border-r border-sky-500/30"
            style={{
                left: `${item.x}%`,
                top: `${item.y}%`,
                width: `${item.w}%`,
                height: `${item.h}%`,
            }}
        >
            <div className="flex flex-col items-center gap-0.5 rotate-0">
                <div className="w-3 h-0.5 bg-sky-400/60 rounded" />
                <div className="w-2 h-0.5 bg-sky-400/40 rounded" />
                <span className="text-sky-400/60 text-[7px] font-bold uppercase tracking-wider mt-0.5 leading-none text-center">
                    Entrada
                </span>
            </div>
        </div>
    );
}

// ─── Logo Area Element ────────────────────────────────────────────────────────
function LogoEl({ item }) {
    return (
        <div
            className="absolute flex items-center justify-center rounded-lg border border-dashed border-sky-500/20"
            style={{
                left: `${item.x}%`,
                top: `${item.y}%`,
                width: `${item.w}%`,
                height: `${item.h}%`,
            }}
        >
            <span className="text-sky-400/30 font-black text-[8px] sm:text-[9px] uppercase tracking-widest select-none">
                Pool Imperial
            </span>
        </div>
    );
}

// ─── Legend ──────────────────────────────────────────────────────────────────
function Legend() {
    return (
        <div className="flex items-center gap-3 flex-wrap">
            {[
                { color: 'bg-slate-700 border-slate-600', label: 'Libre' },
                { color: 'bg-emerald-600 border-emerald-400', label: 'Ocupada' },
                { color: 'bg-amber-500 border-amber-400', label: 'Por cobrar' },
            ].map(({ color, label }) => (
                <div key={label} className="flex items-center gap-1.5">
                    <div className={`w-3 h-3 rounded-sm border ${color}`} />
                    <span className="text-[10px] font-medium text-slate-400">{label}</span>
                </div>
            ))}
        </div>
    );
}

// ─── Main FloorPlanView ───────────────────────────────────────────────────────
export default function FloorPlanView({ onTableSelect }) {
    const { tables, activeSessions } = useTablesStore();
    const containerRef = useRef(null);

    // Map each floor item to its resolved table + session
    const resolvedItems = useMemo(() => {
        return FLOOR_ITEMS.map(item => {
            const table = item.interactive ? resolveTable(item, tables) : null;
            const session = table ? activeSessions.find(s => s.table_id === table.id) : null;
            return { item, table, session };
        });
    }, [tables, activeSessions]);

    // Count stats
    const stats = useMemo(() => {
        const pool = resolvedItems.filter(r => r.item.type === 'pool_table');
        const all = resolvedItems.filter(r => r.item.interactive && r.table);
        const occupied = all.filter(r => !!r.session);
        const checkout = occupied.filter(r => r.session?.status === 'CHECKOUT');
        return {
            totalPool: pool.length,
            occupiedPool: pool.filter(r => !!r.session).length,
            total: all.length,
            occupied: occupied.length,
            checkout: checkout.length,
        };
    }, [resolvedItems]);

    const handleItemClick = (table, session) => {
        if (!table) return;
        onTableSelect?.(table, session);
    };

    return (
        <div className="flex flex-col h-full">
            {/* Stats bar */}
            <div className="flex items-center gap-4 px-4 py-2 border-b border-white/5 flex-shrink-0">
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-400" />
                    <span className="text-xs font-bold text-slate-300">
                        {stats.occupied}/{stats.total} ocupadas
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-sky-400" />
                    <span className="text-xs font-bold text-slate-300">
                        Pool: {stats.occupiedPool}/{stats.totalPool}
                    </span>
                </div>
                {stats.checkout > 0 && (
                    <div className="flex items-center gap-2 ml-auto">
                        <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                        <span className="text-xs font-bold text-amber-400">
                            {stats.checkout} por cobrar
                        </span>
                    </div>
                )}
                <div className="ml-auto">
                    <Legend />
                </div>
            </div>

            {/* Floor Plan Canvas */}
            <div className="flex-1 overflow-auto p-3 sm:p-4">
                <div
                    ref={containerRef}
                    className="relative w-full mx-auto rounded-2xl border border-white/10 overflow-hidden"
                    style={{
                        /* Aspect ratio 16:9 approximates the physical room layout */
                        aspectRatio: '16/9',
                        maxHeight: 'calc(100vh - 220px)',
                        background: 'linear-gradient(135deg, #1a1208 0%, #0f0c06 50%, #1a1208 100%)',
                        boxShadow: 'inset 0 0 60px rgba(0,0,0,0.5)',
                    }}
                >
                    {/* Wood floor texture */}
                    <div
                        className="absolute inset-0 opacity-10"
                        style={{
                            backgroundImage: `repeating-linear-gradient(
                                90deg,
                                transparent,
                                transparent 40px,
                                rgba(255,200,100,0.15) 40px,
                                rgba(255,200,100,0.15) 41px
                            )`,
                        }}
                    />

                    {/* Ambient lighting (ceiling lights effect) */}
                    {[20, 40, 60, 80].map(x => (
                        <div
                            key={x}
                            className="absolute top-0 pointer-events-none"
                            style={{
                                left: `${x}%`,
                                width: '120px',
                                height: '80px',
                                transform: 'translateX(-50%)',
                                background: 'radial-gradient(ellipse at top, rgba(255,220,150,0.12) 0%, transparent 70%)',
                            }}
                        />
                    ))}

                    {/* Walls */}
                    <div className="absolute inset-0 border-4 border-amber-900/40 rounded-2xl pointer-events-none" />

                    {/* Render all floor items */}
                    {resolvedItems.map(({ item, table, session }) => {
                        if (item.type === 'pool_table') {
                            return (
                                <PoolTableEl
                                    key={item.id}
                                    item={item}
                                    table={table}
                                    session={session}
                                    onClick={() => handleItemClick(table, session)}
                                />
                            );
                        }
                        if (item.type === 'bar_table' || item.type === 'bar_stool') {
                            return (
                                <BarTableEl
                                    key={item.id}
                                    item={item}
                                    table={table}
                                    session={session}
                                    onClick={() => handleItemClick(table, session)}
                                />
                            );
                        }
                        if (item.type === 'bar_counter') {
                            return <BarCounterEl key={item.id} item={item} />;
                        }
                        if (item.type === 'entry') {
                            return <EntryEl key={item.id} item={item} />;
                        }
                        if (item.type === 'logo') {
                            return <LogoEl key={item.id} item={item} />;
                        }
                        return null;
                    })}
                </div>

                {/* Hint */}
                <p className="text-center text-[10px] text-slate-600 mt-2 select-none">
                    Toca cualquier mesa para abrir el panel de gestión
                </p>
            </div>
        </div>
    );
}
