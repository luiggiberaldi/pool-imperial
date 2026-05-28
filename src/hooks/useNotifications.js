import { useCallback, useRef } from 'react';

/**
 * Hook de notificaciones del navegador para PreciosAlDía.
 * 3 tipos: stock bajo, cierre de caja pendiente, venta completada.
 */
export function useNotifications() {
    const permissionRef = useRef(
        typeof window !== 'undefined' && 'Notification' in window
            ? Notification.permission
            : 'denied'
    );

    /** Solicitar permiso de notificaciones (call on user interaction) */
    const requestPermission = useCallback(async () => {
        if (!('Notification' in window)) return false;
        if (Notification.permission === 'granted') {
            permissionRef.current = 'granted';
            return true;
        }
        const result = await Notification.requestPermission();
        permissionRef.current = result;
        return result === 'granted';
    }, []);

    /** Enviar notificación nativa */
    const send = useCallback((title, body, tag) => {
        if (permissionRef.current !== 'granted' && Notification.permission !== 'granted') return;
        try {
            new Notification(title, {
                body,
                icon: '/apple-touch-icon.png',
                badge: '/apple-touch-icon.png',
                tag, // Evita duplicados con el mismo tag
                vibrate: [100, 50, 100],
            });
        } catch (_) { /* SW-only env or unsupported */ }
    }, []);

    // ── Notificaciones específicas ──

    /** Stock bajo: se llama tras completar una venta, pasando los productos actualizados */
    const notifyLowStock = useCallback((products) => {
        const lowItems = products.filter(p => {
            const stock = parseFloat(p.stock) || 0;
            const threshold = parseFloat(p.lowStockAlert) || 5;
            // Include 0 and negative stock as low stock too
            return stock <= threshold;
        });

        if (lowItems.length === 0) return;

        if (lowItems.length === 1) {
            const p = lowItems[0];
            send(
                '⚠️ Stock Bajo',
                `${p.name} tiene solo ${p.stock} ${p.unit === 'kg' ? 'kg' : p.unit === 'litro' ? 'lt' : 'unidad(es)'}`,
                `low-stock-${p.id}`
            );
        } else {
            send(
                `⚠️ ${lowItems.length} Productos con Stock Bajo`,
                lowItems.slice(0, 3).map(p => `${p.name}: ${p.stock}`).join(', '),
                'low-stock-batch'
            );
        }
    }, [send]);

    /** Venta completada */
    const notifySaleComplete = useCallback((saleNumber, totalUsd, totalBs) => {
        send(
            '✅ Venta Completada',
            `Venta #${saleNumber} — $${totalUsd.toFixed(2)} (${Math.round(totalBs).toLocaleString()} Bs)`,
            `sale-${saleNumber}`
        );
    }, [send]);

    /** Mesa enviada a cobrar */
    const notifyMesaCobrar = useCallback((tableName, totalUsd) => {
        send(
            '💳 Mesa lista para cobrar',
            `${tableName} — Total: $${totalUsd.toFixed(2)}`,
            `cobrar-${tableName}`
        );
    }, [send]);

    /** Tiempo prepagado excedido en una mesa */
    const notifyTiempoExcedido = useCallback((tableName) => {
        send(
            '⏰ Tiempo excedido',
            `${tableName} superó el tiempo prepagado`,
            `excedido-${tableName}`
        );
    }, [send]);

    /** Cierre de caja pendiente: se chequea al montar el Dashboard */
    const notifyCierrePendiente = useCallback((todaySalesCount) => {
        if (todaySalesCount < 5) return; // Mínimo 5 ventas para que tenga sentido notificar

        const now = new Date();
        const hour = now.getHours();

        // Solo notificar a partir de las 8pm
        if (hour < 20) return;

        // Evitar notificar más de una vez por día
        const lastNotified = localStorage.getItem('cierre_notified_date');
        const getLocalISODate = (d = new Date()) => {
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        };
        const todayStr = getLocalISODate(now);
        if (lastNotified === todayStr) return;

        localStorage.setItem('cierre_notified_date', todayStr);
        send(
            '🔔 Cierre de Caja Pendiente',
            `Tienes ${todaySalesCount} venta(s) hoy. No olvides hacer el cierre de caja.`,
            'cierre-pendiente'
        );
    }, [send]);

    /** Mesa pagada ociosa: lleva 15+ min pagada sin cerrar ni agregar cargos */
    const notifyMesaPagadaOciosa = useCallback((tableName) => {
        send(
            '💤 Mesa pagada sin actividad',
            `${tableName} lleva 15+ min pagada. ¿Liberar mesa o agregar más tiempo?`,
            `pagada-ociosa-${tableName}`
        );
    }, [send]);

    return {
        requestPermission,
        notifyLowStock,
        notifySaleComplete,
        notifyCierrePendiente,
        notifyMesaCobrar,
        notifyTiempoExcedido,
        notifyMesaPagadaOciosa,
    };
}
