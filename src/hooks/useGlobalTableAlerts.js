import { useEffect, useRef } from 'react';
import { useTablesStore } from './store/useTablesStore';
import { useAuthStore } from './store/authStore';
import { getSessionElapsedMinutes, calculateSessionCost } from '../utils/tableBillingEngine';
import { useNotifications } from './useNotifications';
import { showToast } from '../components/Toast';
import { supabaseCloud } from '../config/supabaseCloud';
import { round2 } from '../utils/dinero';
import { useOrdersStore } from './store/useOrdersStore';
import { useProductContext } from '../context/ProductContext';
import { buildTableSyntheticCart } from '../utils/tableBillingEngine';
import { FinancialEngine } from '../core/FinancialEngine';
import { formatCOP } from '../utils/dinero';

/**
 * Hook global que corre en App.jsx — monitorea TODAS las sesiones activas
 * y dispara notificaciones + broadcast Supabase realtime para que TODOS
 * los dispositivos conectados reciban las alertas.
 *
 * Notificaciones manejadas:
 * - Tiempo agotado (cada 15s check + broadcast)
 * - Mesa enviada a cobrar (detecta status CHECKOUT + broadcast)
 * - Mesa pagada ociosa (cada 15s check + broadcast)
 * - Stock bajo (broadcast desde useSalesCheckout)
 */
export function useGlobalTableAlerts() {
    const { notifyTiempoExcedido, notifyMesaCobrar, notifyMesaPagadaOciosa, notifyLowStock } = useNotifications();
    const productContext = useProductContext();
    const products = productContext?.products || [];
    const notifiedRef = useRef(new Set());
    const channelRef = useRef(null);
    const prevCheckoutIdsRef = useRef(new Set());

    // Get userId to scope the channel per account
    const cloudSession = useAuthStore(s => s.cloudSession);
    const userId = cloudSession?.user?.id;

    // Subscribe to broadcast notifications from other devices (scoped by userId)
    useEffect(() => {
        if (!userId) return;

        const channel = supabaseCloud
            .channel(`pool_table_alerts:${userId}`)
            .on('broadcast', { event: 'tiempo_excedido' }, ({ payload }) => {
                if (!payload?.tableName) return;
                const key = `excedido-${payload.sessionId}`;
                if (notifiedRef.current.has(key)) return;
                notifiedRef.current.add(key);
                notifyTiempoExcedido(payload.tableName);
                showToast(`⏰ ${payload.tableName} — Tiempo agotado. Agregar más tiempo o cobrar.`, 'warning', 8000);
            })
            .on('broadcast', { event: 'mesa_cobrar' }, ({ payload }) => {
                if (!payload?.tableName) return;
                const key = `cobrar-${payload.sessionId}`;
                if (notifiedRef.current.has(key)) return;
                notifiedRef.current.add(key);
                notifyMesaCobrar(payload.tableName, payload.totalUsd || 0);
                showToast(`💳 ${payload.tableName} — Lista para cobrar (${formatCOP(payload.totalUsd || 0)})`, 'info', 6000);
            })
            .on('broadcast', { event: 'mesa_pagada_ociosa' }, ({ payload }) => {
                if (!payload?.tableName) return;
                const key = `ociosa-${payload.sessionId}`;
                if (notifiedRef.current.has(key)) return;
                notifiedRef.current.add(key);
                notifyMesaPagadaOciosa(payload.tableName);
                showToast(`💤 ${payload.tableName} — Mesa pagada sin actividad`, 'info', 6000);
            })
            .on('broadcast', { event: 'stock_bajo' }, ({ payload }) => {
                if (!payload?.products?.length) return;
                notifyLowStock(payload.products);
            })
            .subscribe();

        channelRef.current = channel;
        return () => {
            supabaseCloud.removeChannel(channel);
            channelRef.current = null;
        };
    }, [userId, notifyTiempoExcedido, notifyMesaCobrar, notifyMesaPagadaOciosa, notifyLowStock]);

    // Periodic check every 15s for expired tables, checkout status, and paid idle
    useEffect(() => {
        const check = () => {
            const { tables, activeSessions, config, pausedSessions, paidHoursOffsets, paidRoundsOffsets, paidElapsedOffsets } = useTablesStore.getState();
            if (!activeSessions?.length) {
                prevCheckoutIdsRef.current.clear();
                return;
            }

            // Track current CHECKOUT sessions to detect new ones
            const currentCheckoutIds = new Set();

            activeSessions.forEach(session => {
                const table = tables.find(t => t.id === session.table_id);
                if (!table) return;

                // Detect new CHECKOUT status (mesa enviada a cobrar)
                if (session.status === 'CHECKOUT') {
                    currentCheckoutIds.add(session.id);
                    if (!prevCheckoutIdsRef.current.has(session.id)) {
                        const key = `cobrar-${session.id}`;
                        if (!notifiedRef.current.has(key)) {
                            notifiedRef.current.add(key);
                            const elapsed = getSessionElapsedMinutes(session, pausedSessions);
                            const hoursOff = (paidHoursOffsets || {})[session.id] || 0;
                            const roundsOff = (paidRoundsOffsets || {})[session.id] || 0;
                            const isTimeFree = table.type === 'NORMAL';
                            const timeCost = isTimeFree ? 0 : calculateSessionCost(elapsed, session.game_mode, config, session.hours_paid, session.extended_times, session.paid_at, hoursOff, roundsOff, session.seats, table.type);

                            // Calculate actual checkout grand total (including products, seats, taxes, and tip)
                            const taxRate = config?.tableTaxType === 'iva_19'
                                ? (config?.taxRateIva ?? 19) / 100
                                : config?.tableTaxType === 'impoconsumo_8'
                                    ? (config?.taxRateImpoconsumo ?? 8) / 100
                                    : 0;
                            const isExclusive = config?.tableTaxMode === 'exclusive' && taxRate > 0;
                            const finalPina = isExclusive ? (config?.pricePina || 0) * (1 + taxRate) : (config?.pricePina || 0);
                            const finalHora = isExclusive ? (config?.pricePerHour || 0) * (1 + taxRate) : (config?.pricePerHour || 0);

                            const seatTimeCost = (session.seats || []).filter(s => !s.paid).reduce((sum, s) => {
                                const tc = (s.timeCharges || []);
                                const h = tc.filter(t => t.type === 'hora').reduce((a, t) => a + (Number(t.amount) || 0), 0);
                                const p = tc.filter(t => t.type === 'pina').reduce((a, t) => a + (Number(t.amount) || 0), 0);
                                return sum + (h * finalHora) + (p * finalPina);
                            }, 0);

                            const { orders, orderItems } = useOrdersStore.getState();
                            const order = orders.find(o => o.table_session_id === session.id);
                            const currentItems = order ? orderItems.filter(i => i.order_id === order.id) : [];
                            const totalConsumption = currentItems.reduce((acc, item) => acc + (Number(item.unit_price_usd) * Number(item.qty)), 0);

                            const baseTotal = round2(timeCost + seatTimeCost + totalConsumption);
                            let totalBuilt = baseTotal;

                            if (baseTotal > 0) {
                                try {
                                    const tableCheckoutData = {
                                        table,
                                        session,
                                        elapsed,
                                        timeCost,
                                        totalConsumption,
                                        currentItems,
                                        config,
                                        hoursOffset: hoursOff,
                                        roundsOffset: roundsOff,
                                        paidHoursOffsets: {},
                                        paidRoundsOffsets: {}
                                    };
                                    const result = buildTableSyntheticCart(tableCheckoutData, config, products);
                                    if (result && result.syntheticCart) {
                                        const totals = FinancialEngine.buildCartTotals(result.syntheticCart, null, 1, 1);
                                        totalBuilt = totals.totalUsd || 0;
                                    }
                                } catch (e) {
                                    console.error("Error calculating background grand total:", e);
                                }

                                const isTipEnabled = (() => {
                                    const match = (session.notes || '').match(/\|\|\|TIP_ENABLED:([01])\|\|\|/);
                                    if (match) return match[1] === '1';
                                    return config?.defaultTipEnabled ?? false;
                                })();

                                if (isTipEnabled) {
                                    const tipPercent = config?.defaultTipPercent ?? 8;
                                    const tipAmt = Math.round(totalBuilt * (tipPercent / 100));
                                    totalBuilt = round2(totalBuilt + tipAmt);
                                }
                            }

                            const totalUsd = totalBuilt;

                            notifyMesaCobrar(table.name, totalUsd);
                            showToast(`💳 ${table.name} — Lista para cobrar (${formatCOP(totalUsd)})`, 'info', 6000);
                            channelRef.current?.send({
                                type: 'broadcast',
                                event: 'mesa_cobrar',
                                payload: { sessionId: session.id, tableName: table.name, totalUsd }
                            });
                        }
                    }
                    return; // Don't check timers for CHECKOUT sessions
                }

                if (session.status !== 'ACTIVE') return;
                if (table.type === 'NORMAL') return;

                // Calculate total paid hours (session + seat level)
                const sessionHours = Number(session.hours_paid) || 0;
                const seatHours = (session.seats || []).reduce((sum, s) =>
                    sum + (s.timeCharges || []).filter(tc => tc.type === 'hora').reduce((a, tc) => a + (Number(tc.amount) || 0), 0), 0);
                const totalHours = sessionHours + seatHours;
                if (totalHours <= 0) return;

                const hoursOffset = (paidHoursOffsets || {})[session.id] || 0;
                const effectiveHours = Math.max(0, totalHours - hoursOffset);
                if (effectiveHours <= 0) return;

                // Elapsed consciente de pausa (mapa volátil o paused_at durable)
                const elapsedMin = getSessionElapsedMinutes(session, pausedSessions);

                const elapsedOffset = (paidElapsedOffsets || {})[session.id] || 0;
                const effectiveElapsed = elapsedOffset > 0 ? Math.max(0, elapsedMin - elapsedOffset) : elapsedMin;
                const remainingMins = (effectiveHours * 60) - effectiveElapsed;

                // Time exceeded
                if (remainingMins < 0) {
                    const key = `excedido-${session.id}`;
                    if (!notifiedRef.current.has(key)) {
                        notifiedRef.current.add(key);
                        const tableName = table.name;
                        notifyTiempoExcedido(tableName);
                        showToast(`⏰ ${tableName} — Tiempo agotado. Agregar más tiempo o cobrar.`, 'warning', 8000);
                        channelRef.current?.send({
                            type: 'broadcast',
                            event: 'tiempo_excedido',
                            payload: { sessionId: session.id, tableName }
                        });
                    }
                } else {
                    notifiedRef.current.delete(`excedido-${session.id}`);
                }

                // Paid idle check: 15+ min since paid_at without new charges
                if (session.paid_at) {
                    const paidAgo = (Date.now() - new Date(session.paid_at).getTime()) / 60000;
                    if (paidAgo >= 15) {
                        const key = `ociosa-${session.id}`;
                        if (!notifiedRef.current.has(key)) {
                            notifiedRef.current.add(key);
                            const tableName = table.name;
                            notifyMesaPagadaOciosa(tableName);
                            showToast(`💤 ${tableName} — Mesa pagada sin actividad`, 'info', 6000);
                            channelRef.current?.send({
                                type: 'broadcast',
                                event: 'mesa_pagada_ociosa',
                                payload: { sessionId: session.id, tableName }
                            });
                        }
                    }
                }
            });

            // Update previous checkout set
            prevCheckoutIdsRef.current = currentCheckoutIds;

            // Clean up notified refs for sessions that no longer exist
            const activeIds = new Set(activeSessions.map(s => s.id));
            for (const key of notifiedRef.current) {
                const sessionId = key.split('-').slice(1).join('-');
                if (!activeIds.has(sessionId)) {
                    notifiedRef.current.delete(key);
                }
            }
        };

        check(); // Run immediately
        const interval = setInterval(check, 15000); // Every 15 seconds
        return () => clearInterval(interval);
    }, [notifyTiempoExcedido, notifyMesaCobrar, notifyMesaPagadaOciosa, products]);

    // Expose broadcast for stock bajo (called from useSalesCheckout)
    return {
        broadcastStockBajo: (products) => {
            channelRef.current?.send({
                type: 'broadcast',
                event: 'stock_bajo',
                payload: { products: products.filter(p => !p.isUnlimitedStock && (parseFloat(p.stock) || 0) <= (parseFloat(p.lowStockAlert) || 5)).map(p => ({ id: p.id, name: p.name, stock: p.stock, unit: p.unit, lowStockAlert: p.lowStockAlert })) }
            });
        }
    };
}
