import { useEffect, useCallback, useRef } from 'react';
import { useAuthStore } from './store/authStore';
import { logEvent } from '../services/auditService';

export function useAutoLock() {
    const { currentUser, role, logout } = useAuthStore();
    const timeoutRef = useRef(null);

    const performLock = useCallback((reason = 'manual') => {
        if (!currentUser || role !== 'ADMIN') return;
        
        logEvent('AUTH', 'SESION_BLOQUEADA', `Bloqueo de seguridad: ${reason}`, currentUser);
        logout();
    }, [currentUser, role, logout]);

    const resetTimer = useCallback(() => {
        if (!currentUser || role !== 'ADMIN') {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            return;
        }

        // Obtener timeout en minutos desde config, por defecto 3 min
        const minutesStr = localStorage.getItem('admin_auto_lock_minutes') || '3';
        const minutes = parseInt(minutesStr, 10);
        // Minimum timeout 1 minute
        const ms = (isNaN(minutes) || minutes < 1 ? 3 : minutes) * 60 * 1000;

        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
            performLock('inactividad');
        }, ms);
    }, [currentUser, role, performLock]);

    useEffect(() => {
        // Solo importa si es ADMIN
        if (!currentUser || role !== 'ADMIN') {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            return;
        }

        const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart'];
        
        // Función debounced para no saturar el event loop en scroll/mouse move
        let tick = false;
        const throttledResetTimer = () => {
            if (!tick) {
                requestAnimationFrame(() => {
                    resetTimer();
                    tick = false;
                });
                tick = true;
            }
        };

        events.forEach(e => window.addEventListener(e, throttledResetTimer, { passive: true }));

        const handleVisibilityChange = () => {
            if (document.hidden) {
                // Verificar si la funcion de bloqueo al minimizar esta activa
                const lockOnMinimize = localStorage.getItem('admin_auto_lock_on_minimize') !== 'false';
                
                if (lockOnMinimize) {
                    // Suspender sesión automáticamente si minimiza la app (ADMIN only)
                    performLock('app_minimizada');
                } else {
                    // Solo pausamos el temporizador, pero no bloqueamos de inmediato
                    if (timeoutRef.current) clearTimeout(timeoutRef.current);
                }
            } else {
                resetTimer();
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);

        resetTimer(); // Iniciar on mount

        return () => {
            events.forEach(e => window.removeEventListener(e, throttledResetTimer));
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
        };
    }, [currentUser, role, resetTimer, performLock]);

    return { manualLock: () => performLock('manual') };
}
