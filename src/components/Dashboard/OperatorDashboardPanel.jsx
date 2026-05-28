import React, { useEffect, useState, useMemo } from 'react';
import { useTablesStore } from '../../hooks/store/useTablesStore';
import { useOrdersStore } from '../../hooks/store/useOrdersStore';
import { useAuthStore } from '../../hooks/store/authStore';
import { Clock, AlertTriangle, Coffee, Timer, ArrowRight, CheckCircle2, ShoppingCart, Zap, TableProperties, CheckCircle, UtensilsCrossed, ClipboardList, Trophy, RotateCcw } from 'lucide-react';
import { calculateElapsedTime, calculateSessionCost } from '../../utils/tableBillingEngine';
import { storageService } from '../../utils/storageService';
import { useConfirm } from '../../hooks/useConfirm';
import { capitalizeName } from '../../utils/calculatorUtils';

function getGreeting() {
    const h = new Date().getHours();
    if (h < 12) return 'Buenos días';
    if (h < 19) return 'Buenas tardes';
    return 'Buenas noches';
}

function formatElapsed(startedAt) {
    const mins = calculateElapsedTime(startedAt);
    if (mins < 60) return `${Math.floor(mins)}min`;
    const h = Math.floor(mins / 60);
    const m = Math.floor(mins % 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export default function OperatorDashboardPanel({ onNavigate }) {
    const { tables, activeSessions, config, paidHoursOffsets, paidRoundsOffsets } = useTablesStore();
    const { orders, orderItems } = useOrdersStore();
    const { currentUser } = useAuthStore();
    const cachedUsers = useAuthStore(s => s.cachedUsers);
    const confirm = useConfirm();
    const role = currentUser?.role || currentUser?.rol;
    const isMesero = role === 'MESERO' || role === 'BARRA';
    const isBarra = role === 'BARRA';
    const [now, setNow] = useState(new Date());
    const [myStats, setMyStats] = useState({ cobros: 0, mesas: 0, pedidos: 0 });
    const [lastSale, setLastSale] = useState(null);
    const [topMeseros, setTopMeseros] = useState([]);
    const [rankingSince, setRankingSince] = useState(() => localStorage.getItem('ranking_meseros_since') || null);

    useEffect(() => {
        const interval = setInterval(() => setNow(new Date()), 30000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (!currentUser?.id) return;
        const load = async () => {
            const sales = await storageService.getItem('bodega_sales_v1', []);
            const todayStr = new Date().toISOString().slice(0, 10);
            const mySales = sales.filter(s => {
                if (s.status === 'ANULADA' || s.tipo === 'COBRO_DEUDA') return false;
                if (s.timestamp?.slice(0, 10) !== todayStr) return false;
                return isMesero ? s.meseroId === currentUser.id : s.vendedorId === currentUser.id;
            }).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

            // Para mesero: contar mesas únicas atendidas hoy
            const mesasHoy = isMesero ? new Set(mySales.map(s => s.tableId).filter(Boolean)).size : 0;
            // Para mesero: contar pedidos (items totales)
            const pedidosHoy = isMesero ? mySales.reduce((sum, s) => sum + (s.items?.reduce((is, i) => is + i.qty, 0) || 0), 0) : 0;

            setMyStats({ cobros: mySales.length, mesas: mesasHoy, pedidos: pedidosHoy });
            setLastSale(mySales[0] || null);

            // Ranking de meseros (solo para rol MESERO)
            if (isMesero) {
                const sinceDate = rankingSince || null;
                const meseroMap = {};
                sales.filter(s => {
                    if (s.status === 'ANULADA' || ['COBRO_DEUDA','AJUSTE_ENTRADA','AJUSTE_SALIDA','APERTURA_CAJA'].includes(s.tipo)) return false;
                    if (!s.meseroId) return false;
                    if (sinceDate && s.timestamp < sinceDate) return false;
                    return true;
                }).forEach(s => {
                    if (!meseroMap[s.meseroId]) meseroMap[s.meseroId] = { id: s.meseroId, name: capitalizeName(s.meseroNombre) || 'Desconocido', ventas: 0, revenue: 0 };
                    meseroMap[s.meseroId].ventas += 1;
                    meseroMap[s.meseroId].revenue += s.totalUsd || 0;
                });
                const ranked = Object.values(meseroMap).sort((a, b) => b.revenue - a.revenue || b.ventas - a.ventas).slice(0, 5);
                setTopMeseros(ranked);
            }
        };
        load();
        const onUpdate = (e) => { if (e.detail?.key === 'bodega_sales_v1') load(); };
        window.addEventListener('app_storage_update', onUpdate);
        return () => window.removeEventListener('app_storage_update', onUpdate);
    }, [currentUser?.id, isMesero, rankingSince]);

    const handleResetRanking = async () => {
        const ok = await confirm({ title: 'Reiniciar ranking', message: '¿Reiniciar el ranking de meseros? El conteo empezará desde cero.', confirmText: 'Reiniciar', variant: 'danger' });
        if (!ok) return;
        const now = new Date().toISOString();
        localStorage.setItem('ranking_meseros_since', now);
        setRankingSince(now);
        setTopMeseros([]);
    };

    const getStaffName = (staffId) => {
        if (!staffId || !cachedUsers?.length) return null;
        const u = cachedUsers.find(u => u.id === staffId);
        return u?.name || u?.nombre || null;
    };

    const activeTables = useMemo(() =>
        activeSessions
            .filter(s => s.status === 'ACTIVE')
            .map(s => ({
                ...s,
                tableName: tables.find(t => t.id === s.table_id)?.name || 'Mesa',
                elapsedMin: calculateElapsedTime(s.started_at),
                ownerName: getStaffName(s.opened_by),
            }))
            .sort((a, b) => b.elapsedMin - a.elapsedMin),
        [activeSessions, tables, now, cachedUsers] // eslint-disable-line react-hooks/exhaustive-deps
    );

    const checkoutTables = useMemo(() =>
        activeSessions
            .filter(s => s.status === 'CHECKOUT')
            .map(s => ({
                ...s,
                tableName: tables.find(t => t.id === s.table_id)?.name || 'Mesa',
            })),
        [activeSessions, tables]
    );

    const timeAlerts = useMemo(() =>
        activeSessions
            .filter(s => s.status === 'ACTIVE' && s.game_mode === 'NORMAL' && s.hours_paid > 0)
            .map(s => {
                const elapsedMin = calculateElapsedTime(s.started_at);
                const remainingMin = (s.hours_paid || 0) * 60 - elapsedMin;
                return { session: s, remainingMin };
            })
            .filter(d => d.remainingMin <= 15)
            .sort((a, b) => a.remainingMin - b.remainingMin),
        [activeSessions, now] // eslint-disable-line react-hooks/exhaustive-deps
    );

    const inactivityAlerts = useMemo(() => {
        const alerts = [];
        activeSessions.forEach(s => {
            if (s.status !== 'ACTIVE') return;
            const order = orders.find(o => o.table_session_id === s.id);
            const items = orderItems.filter(i => i.order_id === order?.id);
            let lastStr = s.started_at;
            if (items.length > 0) {
                const latest = items.reduce((l, i) => (!l || new Date(i.created_at || now) > new Date(l)) ? i.created_at : l, null);
                if (latest) lastStr = latest;
            }
            const diffMin = Math.floor((now - new Date(lastStr)) / 60000);
            if (diffMin >= 45) alerts.push({ session: s, idleMinutes: diffMin });
        });
        return alerts.sort((a, b) => b.idleMinutes - a.idleMinutes);
    }, [activeSessions, orders, orderItems, now]);

    const HIGH_BILL_THRESHOLD = 30;
    const highBillAlerts = useMemo(() =>
        activeSessions.map(s => {
            if (s.status !== 'ACTIVE') return null;
            const elapsedMin = calculateElapsedTime(s.started_at);
            const gameCost = calculateSessionCost(elapsedMin, s.game_mode, config, s.hours_paid, s.extended_times, s.paid_at, (paidHoursOffsets || {})[s.id] || 0, (paidRoundsOffsets || {})[s.id] || 0, s.seats);
            const order = orders.find(o => o.table_session_id === s.id);
            const consumptionCost = order
                ? orderItems.filter(i => i.order_id === order.id).reduce((sum, i) => sum + (i.unit_price_usd || 0) * i.qty, 0)
                : 0;
            const seatTimeCost = (s.seats || []).filter(st => !st.paid).reduce((sum, st) => {
                const tc = (st.timeCharges || []);
                const h = tc.filter(t => t.type === 'hora').reduce((a, t) => a + (Number(t.amount) || 0), 0);
                const p = tc.filter(t => t.type === 'pina').reduce((a, t) => a + (Number(t.amount) || 0), 0);
                return sum + (h * (config.pricePerHour || 0)) + (p * (config.pricePina || 0));
            }, 0);
            const totalUsd = gameCost + seatTimeCost + consumptionCost;
            return totalUsd >= HIGH_BILL_THRESHOLD ? { session: s, totalUsd } : null;
        }).filter(Boolean).sort((a, b) => b.totalUsd - a.totalUsd),
        [activeSessions, orders, orderItems, now, config] // eslint-disable-line react-hooks/exhaustive-deps
    );

    const hasAnyAlert = timeAlerts.length > 0 || inactivityAlerts.length > 0 || highBillAlerts.length > 0;
    const firstName = currentUser?.name?.split(' ')[0] || (isMesero ? 'Mesero' : 'Cajero');

    // ── Colores por rol ──
    const accent = isBarra
        ? { from: '#7C3AED', to: '#8B5CF6', glow: 'rgba(139,92,246,0.15)', text: 'text-violet-400', badge: 'bg-violet-500/80', badgeText: 'text-violet-100' }
        : isMesero
        ? { from: '#F97316', to: '#EA580C', glow: 'rgba(249,115,22,0.15)', text: 'text-orange-400', badge: 'bg-orange-500/80', badgeText: 'text-orange-100' }
        : { from: '#0D9488', to: '#14B8A6', glow: 'rgba(20,184,166,0.2)', text: 'text-teal-100', badge: 'bg-teal-800/60', badgeText: 'text-teal-100' };

    return (
        <div className="space-y-3 pt-1">

            {/* ── HERO SALUDO ── */}
            <div className="relative rounded-[1.5rem] overflow-hidden p-5 shadow-lg"
                style={{ background: `linear-gradient(135deg, ${accent.from} 0%, ${accent.to} 100%)` }}>
                <div className="absolute -right-8 -top-8 w-32 h-32 bg-white/10 rounded-full blur-2xl" />
                <div className="absolute -left-6 -bottom-6 w-24 h-24 bg-white/5 rounded-full blur-xl" />
                <div className="relative z-10">
                    <p className="text-white/80 text-[11px] font-bold uppercase tracking-widest mb-0.5">{getGreeting()}</p>
                    <h2 className="text-white text-2xl font-black tracking-tight mb-4">{firstName} {isMesero ? '🎱' : '👋'}</h2>
                    <div className="grid grid-cols-2 gap-3">
                        {isMesero ? (
                            <>
                                <div className="bg-white/15 rounded-2xl p-3">
                                    <p className="text-white/60 text-[10px] font-bold uppercase tracking-widest mb-1">Mesas activas</p>
                                    <p className="text-3xl font-black text-white leading-none">{activeTables.length + checkoutTables.length}</p>
                                </div>
                                <div className="bg-white/15 rounded-2xl p-3">
                                    <p className="text-white/60 text-[10px] font-bold uppercase tracking-widest mb-1">Pedidos hoy</p>
                                    <p className="text-3xl font-black text-white leading-none">{myStats.pedidos}</p>
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="bg-white/20 rounded-2xl p-3">
                                    <p className="text-white/80 text-[10px] font-bold uppercase tracking-widest mb-1">Mesas activas</p>
                                    <p className="text-3xl font-black text-white leading-none">{activeTables.length}</p>
                                </div>
                                <div className={`rounded-2xl p-3 ${checkoutTables.length > 0 ? 'bg-white/30' : 'bg-white/20'}`}>
                                    <p className="text-white/80 text-[10px] font-bold uppercase tracking-widest mb-1">
                                        {checkoutTables.length > 0 ? '⚡ Para cobrar' : 'Mis cobros hoy'}
                                    </p>
                                    <p className="text-3xl font-black leading-none text-white">
                                        {checkoutTables.length > 0 ? checkoutTables.length : myStats.cobros}
                                    </p>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* ── BOTÓN PRINCIPAL ── */}
            {isMesero ? (
                <button
                    onClick={() => onNavigate?.('mesas')}
                    className="w-full rounded-2xl p-4 flex items-center justify-between active:scale-[0.98] transition-all group"
                    style={{ background: `linear-gradient(135deg, ${accent.from}, ${accent.to})`, boxShadow: `0 6px 20px ${accent.glow}` }}>
                    <div className="flex items-center gap-3">
                        <div className="w-11 h-11 bg-white/20 rounded-xl flex items-center justify-center">
                            <UtensilsCrossed size={22} className="text-white" />
                        </div>
                        <div className="text-left">
                            <p className="text-sm font-black text-white">Mis Mesas</p>
                            <p className="text-[11px] text-white/70 font-medium">Ver y atender mesas activas</p>
                        </div>
                    </div>
                    <ArrowRight size={18} className="text-white/60 group-hover:translate-x-0.5 transition-transform" />
                </button>
            ) : (
                <button
                    onClick={() => onNavigate?.('ventas')}
                    className="w-full rounded-2xl p-4 flex items-center justify-between active:scale-[0.98] transition-all group"
                    style={{ background: 'linear-gradient(135deg, #0EA5E9, #0284C7)', boxShadow: '0 6px 20px rgba(14,165,233,0.3)' }}>
                    <div className="flex items-center gap-3">
                        <div className="w-11 h-11 bg-white/20 rounded-xl flex items-center justify-center">
                            <ShoppingCart size={22} className="text-white" />
                        </div>
                        <div className="text-left">
                            <p className="text-sm font-black text-white">Punto de Venta</p>
                            <p className="text-[11px] text-white/70 font-medium">Registrar ventas y cobros</p>
                        </div>
                    </div>
                    <ArrowRight size={18} className="text-white/60 group-hover:translate-x-0.5 transition-transform" />
                </button>
            )}

            {/* ── MESAS LISTAS PARA COBRAR (solo cajero) ── */}
            {!isMesero && checkoutTables.length > 0 && (
                <div>
                    <h3 className="text-[10px] font-bold text-orange-500 uppercase tracking-widest px-1 mb-2 flex items-center gap-1.5">
                        <Zap size={11} /> Listas para cobrar
                    </h3>
                    <div className="grid grid-cols-2 gap-2">
                        {checkoutTables.map(t => (
                            <button key={t.id}
                                onClick={() => onNavigate?.('ventas')}
                                className="rounded-xl p-3 border border-orange-300 bg-orange-50 text-left active:scale-95 transition-all shadow-sm">
                                <p className="text-xs font-black text-orange-800 leading-none mb-1">{t.tableName}</p>
                                <div className="flex items-center gap-1">
                                    <Clock size={10} className="text-orange-500" />
                                    <span className="text-[10px] font-bold text-orange-600">{formatElapsed(t.started_at)}</span>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* ── MESAS EN JUEGO ── */}
            {activeTables.length > 0 && (
                <div>
                    <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1 mb-2 flex items-center gap-1.5">
                        <TableProperties size={11} /> Mesas en juego
                    </h3>
                    <div className="grid grid-cols-2 gap-2">
                        {activeTables.map(t => {
                            const isLong = t.elapsedMin >= 90;
                            const isMine = t.opened_by === currentUser?.id;
                            return isMesero ? (
                                <button key={t.id}
                                    onClick={() => onNavigate?.('mesas')}
                                    className={`rounded-xl p-3 border text-left active:scale-95 transition-all ${isMine ? 'bg-sky-50 border-sky-200' : isLong ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-100'}`}>
                                    <p className={`text-xs font-black leading-none mb-1 ${isMine ? 'text-sky-800' : isLong ? 'text-amber-800' : 'text-slate-800'}`}>{t.tableName}</p>
                                    <div className="flex items-center gap-1">
                                        <Clock size={10} className={isMine ? 'text-sky-500' : isLong ? 'text-amber-500' : 'text-slate-400'} />
                                        <span className={`text-[10px] font-bold ${isMine ? 'text-sky-600' : isLong ? 'text-amber-600' : 'text-slate-500'}`}>{formatElapsed(t.started_at)}</span>
                                    </div>
                                    {t.ownerName && (
                                        <p className={`text-[9px] font-bold mt-1 ${isMine ? 'text-sky-500' : 'text-slate-400'}`}>{isMine ? 'Mi mesa' : t.ownerName}</p>
                                    )}
                                </button>
                            ) : (
                                <div key={t.id}
                                    className={`rounded-xl p-3 border ${isLong ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-100'}`}>
                                    <p className={`text-xs font-black leading-none mb-1 ${isLong ? 'text-amber-800' : 'text-slate-800'}`}>{t.tableName}</p>
                                    <div className="flex items-center gap-1">
                                        <Clock size={10} className={isLong ? 'text-amber-500' : 'text-slate-400'} />
                                        <span className={`text-[10px] font-bold ${isLong ? 'text-amber-600' : 'text-slate-500'}`}>{formatElapsed(t.started_at)}</span>
                                    </div>
                                    {t.ownerName && (
                                        <p className="text-[9px] font-bold text-slate-400 mt-1">{t.ownerName}</p>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ── ÚLTIMA VENTA (solo cajero) ── */}
            {!isMesero && lastSale && (() => {
                const mins = Math.floor((now - new Date(lastSale.timestamp)) / 60000);
                const timeAgo = mins < 1 ? 'ahora mismo' : mins < 60 ? `hace ${mins} min` : `hace ${Math.floor(mins/60)}h`;
                return (
                    <div className="bg-white border border-slate-100 rounded-2xl px-4 py-3 flex items-center gap-3 shadow-sm">
                        <div className="w-9 h-9 bg-teal-50 rounded-xl flex items-center justify-center shrink-0">
                            <CheckCircle size={18} className="text-teal-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Última venta</p>
                            <p className="text-sm font-black text-slate-800 truncate">
                                {lastSale.customerName || lastSale.items?.[0]?.name || 'Venta'}
                            </p>
                        </div>
                        <div className="text-right shrink-0">
                            <p className="text-sm font-black text-teal-600">${(lastSale.totalUsd || 0).toFixed(2)}</p>
                            <p className="text-[10px] text-slate-400 font-medium">{timeAgo}</p>
                        </div>
                    </div>
                );
            })()}

            {/* ── TOP MESEROS (solo mesero) ── */}
            {isMesero && topMeseros.length > 0 && (
                <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className={`text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5 ${isBarra ? 'text-violet-500' : 'text-orange-500'}`}>
                            <Trophy size={12} /> Ranking Meseros
                        </h3>
                    </div>
                    <div className="space-y-3">
                        {topMeseros.map((m, i) => {
                            const maxRev = topMeseros[0]?.revenue || 1;
                            const pct = Math.round((m.revenue / maxRev) * 100);
                            const isMe = m.id === currentUser?.id;
                            return (
                                <div key={m.id} className={`${isMe ? (isBarra ? 'bg-violet-50 border border-violet-200' : 'bg-orange-50 border border-orange-200') + ' rounded-xl p-2.5 -mx-1' : ''}`}>
                                    <div className="flex items-center justify-between mb-1">
                                        <div className="flex items-center gap-2.5 min-w-0">
                                            <span className={`text-sm font-black w-5 text-center shrink-0 ${i === 0 ? 'text-amber-500' : i === 1 ? 'text-slate-400' : i === 2 ? 'text-orange-400' : 'text-slate-300'}`}>
                                                {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}
                                            </span>
                                            <div className="min-w-0">
                                                <p className={`text-xs font-black truncate ${isMe ? (isBarra ? 'text-violet-700' : 'text-orange-700') : 'text-slate-700'}`}>
                                                    {m.name}{isMe ? ' (Tú)' : ''}
                                                </p>
                                                <p className="text-[10px] text-slate-400">{m.ventas} {m.ventas === 1 ? 'venta' : 'ventas'}</p>
                                            </div>
                                        </div>
                                        <span className={`text-sm font-black shrink-0 pl-2 ${isMe ? (isBarra ? 'text-violet-600' : 'text-orange-600') : 'text-emerald-600'}`}>${m.revenue.toFixed(2)}</span>
                                    </div>
                                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                        <div className={`h-1.5 rounded-full transition-all ${i === 0 ? 'bg-amber-400' : i === 1 ? 'bg-slate-300' : i === 2 ? 'bg-orange-300' : 'bg-slate-200'}`}
                                            style={{ width: `${pct}%` }} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    {topMeseros.length > 0 && !topMeseros.find(m => m.id === currentUser?.id) && (
                        <p className="text-[10px] text-slate-400 text-center mt-3 font-medium">¡Vende más para aparecer en el ranking!</p>
                    )}
                </div>
            )}

            {isMesero && topMeseros.length === 0 && (
                <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
                    <h3 className={`text-[10px] font-bold uppercase tracking-widest mb-3 flex items-center gap-1.5 ${isBarra ? 'text-violet-500' : 'text-orange-500'}`}>
                        <Trophy size={12} /> Ranking Meseros
                    </h3>
                    <div className="flex flex-col items-center justify-center py-3 gap-1.5">
                        <Trophy size={24} className="text-slate-200" />
                        <p className="text-xs text-slate-400 text-center">Aún no hay ventas registradas.<br/>¡Sé el primero en el ranking!</p>
                    </div>
                </div>
            )}

            {/* ── ALERTAS ── */}
            {!hasAnyAlert && (
                <div className="bg-white rounded-2xl border border-slate-100 p-6 flex flex-col items-center justify-center text-center shadow-sm">
                    <div className="w-14 h-14 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mb-3">
                        <CheckCircle2 size={28} />
                    </div>
                    <p className="font-black text-slate-800 mb-0.5">Todo bajo control</p>
                    <p className="text-[11px] text-slate-500 font-medium">Sin alertas urgentes. ¡Excelente servicio!</p>
                </div>
            )}

            {timeAlerts.length > 0 && (
                <div className="space-y-2">
                    <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1 flex items-center gap-1.5">
                        <Timer size={11} /> Tiempos Críticos
                    </h3>
                    {timeAlerts.map(({ session, remainingMin }) => {
                        const expired = remainingMin <= 0;
                        const tName = tables.find(t => t.id === session.table_id)?.name || 'Mesa';
                        return (
                            <div key={session.id} onClick={() => onNavigate?.(isMesero ? 'mesas' : 'ventas')}
                                className={`rounded-xl p-3 border shadow-sm flex items-center justify-between active:scale-95 transition-all cursor-pointer ${expired ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
                                <div className="flex items-center gap-3">
                                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${expired ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'}`}>
                                        <AlertTriangle size={16} strokeWidth={2.5} />
                                    </div>
                                    <div>
                                        <p className="text-sm font-black text-slate-800 leading-none mb-0.5">{tName}</p>
                                        <p className={`text-xs font-bold ${expired ? 'text-red-500' : 'text-amber-600'}`}>
                                            {expired ? `Vencido por ${Math.abs(remainingMin)} min` : `Quedan ${remainingMin} min`}
                                        </p>
                                    </div>
                                </div>
                                <ArrowRight size={15} className={expired ? 'text-red-300' : 'text-amber-300'} />
                            </div>
                        );
                    })}
                </div>
            )}

            {highBillAlerts.length > 0 && (
                <div className="space-y-2">
                    <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1 flex items-center gap-1.5">
                        <Zap size={11} /> Cuentas Altas (&gt;&nbsp;${HIGH_BILL_THRESHOLD})
                    </h3>
                    {highBillAlerts.map(({ session, totalUsd }) => {
                        const tName = tables.find(t => t.id === session.table_id)?.name || 'Mesa';
                        return (
                            <div key={session.id} onClick={() => onNavigate?.(isMesero ? 'mesas' : 'ventas')}
                                className="rounded-xl p-3 border border-pink-200 bg-pink-50 shadow-sm flex items-center justify-between active:scale-95 transition-all cursor-pointer">
                                <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 bg-pink-100 text-pink-600 rounded-lg flex items-center justify-center font-black text-sm">$</div>
                                    <div>
                                        <p className="text-sm font-black text-slate-800 leading-none mb-0.5">{tName}</p>
                                        <p className="text-xs font-bold text-pink-600">Cuenta: ${totalUsd.toFixed(2)}</p>
                                    </div>
                                </div>
                                <ArrowRight size={15} className="text-pink-300" />
                            </div>
                        );
                    })}
                </div>
            )}

            {inactivityAlerts.length > 0 && (
                <div className="space-y-2">
                    <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1 flex items-center gap-1.5">
                        <Coffee size={11} /> Sin Atención (+45min)
                    </h3>
                    {inactivityAlerts.map(({ session, idleMinutes }) => {
                        const tName = tables.find(t => t.id === session.table_id)?.name || 'Mesa';
                        return (
                            <div key={session.id} onClick={() => onNavigate?.(isMesero ? 'mesas' : 'ventas')}
                                className="rounded-xl p-3 border border-slate-200 bg-white shadow-sm flex items-center justify-between active:scale-95 transition-all cursor-pointer">
                                <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 bg-slate-100 text-slate-500 rounded-lg flex items-center justify-center">
                                        <Clock size={16} strokeWidth={2.5} />
                                    </div>
                                    <div>
                                        <p className="text-sm font-black text-slate-800 leading-none mb-0.5">{tName}</p>
                                        <p className="text-xs font-bold text-slate-500">
                                            {Math.floor(idleMinutes / 60) > 0 ? `${Math.floor(idleMinutes / 60)}h ${idleMinutes % 60}m` : `${idleMinutes}min`} sin atención
                                        </p>
                                    </div>
                                </div>
                                <ArrowRight size={15} className="text-slate-300" />
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
