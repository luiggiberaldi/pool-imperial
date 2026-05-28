import { useMemo } from 'react';
import { calculateElapsedTime } from '../utils/tableBillingEngine';

/**
 * Generates in-app notification items for the bell icon.
 * Pure computation — no side effects, no browser notifications.
 */
export function useNotificationCenter({ products, activeSessions, pausedSessions, activeCashSession, customers, tables }) {
    const notifications = useMemo(() => {
        const items = [];

        // 1. Stock bajo (agrupado en una sola notificación)
        const lowStock = (products || []).filter(p => {
            const stock = p.stock ?? Infinity;
            const threshold = p.lowStockAlert ?? 5;
            return stock <= threshold && stock >= 0;
        });
        if (lowStock.length > 0) {
            const names = lowStock.slice(0, 3).map(p => p.name);
            const extra = lowStock.length > 3 ? ` y ${lowStock.length - 3} más` : '';
            items.push({
                id: 'stock-low',
                type: 'warning',
                icon: 'package',
                title: `Stock bajo (${lowStock.length})`,
                message: `${names.join(', ')}${extra}`,
                action: 'catalogo',
                navFilter: { key: 'nav_inventory_filter', value: 'bajo-stock' },
            });
        }

        // 2. Mesas con tiempo vencido (agrupado)
        const expiredTables = [];
        (activeSessions || []).forEach(session => {
            if (session.status !== 'ACTIVE') return;
            if (!session.hours_paid || session.hours_paid <= 0) return;

            // También considerar horas en seat timeCharges
            const seatHours = (session.seats || []).reduce((sum, s) =>
                sum + (s.timeCharges || []).filter(tc => tc.type === 'hora').reduce((a, tc) => a + (Number(tc.amount) || 0), 0), 0);
            const totalHours = (Number(session.hours_paid) || 0) + seatHours;
            if (totalHours <= 0) return;

            const paused = pausedSessions?.[session.id];
            let elapsedMin;
            if (paused?.isPaused) {
                elapsedMin = paused.elapsedAtPause || 0;
            } else {
                elapsedMin = calculateElapsedTime(session.started_at);
            }
            const paidMinutes = totalHours * 60;
            if (elapsedMin >= paidMinutes) {
                const table = (tables || []).find(t => t.id === session.table_id);
                const tableName = table?.name || `Mesa ${session.table_id?.substring(0, 4) || '?'}`;
                expiredTables.push(tableName);
            }
        });
        if (expiredTables.length > 0) {
            items.push({
                id: 'time-expired',
                type: 'urgent',
                icon: 'clock',
                title: `Tiempo vencido (${expiredTables.length})`,
                message: expiredTables.slice(0, 3).join(', ') + (expiredTables.length > 3 ? ` y ${expiredTables.length - 3} más` : ''),
                action: 'mesas',
            });
        }

        // 3. Caja abierta mucho tiempo (>12 horas)
        if (activeCashSession?.opened_at) {
            const hoursOpen = (Date.now() - new Date(activeCashSession.opened_at).getTime()) / 3600000;
            if (hoursOpen >= 12) {
                items.push({
                    id: 'cash-long',
                    type: 'info',
                    icon: 'wallet',
                    title: 'Caja abierta',
                    message: `Lleva ${Math.floor(hoursOpen)}h abierta sin cerrar`,
                    action: null,
                });
            }
        }

        // 4. Deudas pendientes
        const deudores = (customers || []).filter(c => (c.deuda || 0) > 0.01);
        if (deudores.length > 0) {
            const totalDeuda = deudores.reduce((sum, c) => sum + (c.deuda || 0), 0);
            items.push({
                id: 'debts',
                type: 'info',
                icon: 'users',
                title: 'Deudas pendientes',
                message: `${deudores.length} cliente${deudores.length > 1 ? 's' : ''} · $${totalDeuda.toFixed(2)}`,
                action: 'clientes',
            });
        }

        return items;
    }, [products, activeSessions, pausedSessions, activeCashSession, customers]);

    const urgentCount = notifications.filter(n => n.type === 'urgent').length;
    const totalCount = notifications.length;

    return { notifications, urgentCount, totalCount };
}
