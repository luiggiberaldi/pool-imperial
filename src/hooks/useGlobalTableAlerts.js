import { useEffect, useRef } from 'react';
import { useTablesStore } from './store/useTablesStore';
import { useAuthStore } from './store/authStore';
import { calculateElapsedTime, calculateSessionCost } from '../utils/tableBillingEngine';
import { useNotifications } from './useNotifications';
import { showToast } from '../components/Toast';
import { supabaseCloud } from '../config/supabaseCloud';
import { round2 } from '../utils/dinero';

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
                showToast(`💳 ${payload.tableName} — Lista para cobrar ($${(payload.totalUsd || 0).toFixed(2)})`, 'info', 6000);
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
                            const elapsed = session.started_at ? calculateElapsedTime(session.started_at) : 0;
                            const hoursOff = (paidHoursOffsets || {})[session.id] || 0;
                            const roundsOff = (paidRoundsOffsets || {})[session.id] || 0;
                            const isTimeFree = table.type === 'NORMAL';
                            const timeCost = isTimeFree ? 0 : calculateSessionCost(elapsed, session.game_mode, config, session.hours_paid, session.extended_times, session.paid_at, hoursOff, roundsOff, session.seats);
                            const totalUsd = round2(timeCost);
                            notifyMesaCobrar(table.name, totalUsd);
                            showToast(`💳 ${table.name} — Lista para cobrar`, 'info', 6000);
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

                // Check if paused
                const paused = pausedSessions?.[session.id];
                let elapsedMin;
                if (paused?.isPaused) {
                    elapsedMin = paused.elapsedAtPause || 0;
                } else {
                    elapsedMin = calculateElapsedTime(session.started_at);
                }

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
    }, [notifyTiempoExcedido, notifyMesaCobrar, notifyMesaPagadaOciosa]);

    // Expose broadcast for stock bajo (called from useSalesCheckout)
    return {
        broadcastStockBajo: (products) => {
            channelRef.current?.send({
                type: 'broadcast',
                event: 'stock_bajo',
                payload: { products: products.filter(p => (parseFloat(p.stock) || 0) <= (parseFloat(p.lowStockAlert) || 5)).map(p => ({ id: p.id, name: p.name, stock: p.stock, unit: p.unit, lowStockAlert: p.lowStockAlert })) }
            });
        }
    };
}
