import { useState, useCallback, useEffect } from 'react';
import { ROLE_WELCOME_STEPS, TAB_STEPS } from '../config/tourSteps';

const KEY_ROLE = (role) => `pda_tour_done_${role}`;
const KEY_TAB  = (tabId, role) => `pda_tab_tour_${tabId}_${role}`;

/**
 * useOnboardingTour
 *
 * Maneja el estado de los tours de onboarding:
 *  - Tour de bienvenida por rol (una vez, después del primer login)
 *  - Mini-tour por pestaña (una vez por pestaña por rol)
 *
 * @param {string|null} role  - Rol actual: 'ADMIN' | 'CAJERO' | 'MESERO' | null
 * @param {boolean}     ready - true cuando el usuario está autenticado y la UI está lista
 */
export function useOnboardingTour(role, ready) {
    // Tour activo: { steps, onComplete } | null
    const [activeTour, setActiveTour] = useState(null);
    // Pestaña pendiente de tour (encolada mientras el role tour está activo)
    const [pendingTabTour, setPendingTabTour] = useState(null);
    // Si el tour de rol ya fue completado esta sesión
    const [roleTourDone, setRoleTourDone] = useState(false);

    // ── Dispara tour de bienvenida por rol ──────────────────────
    useEffect(() => {
        if (!ready || !role) return;
        if (localStorage.getItem(KEY_ROLE(role)) === 'true') {
            setRoleTourDone(true);
            return;
        }
        const steps = ROLE_WELCOME_STEPS[role];
        if (!steps || steps.length === 0) {
            setRoleTourDone(true);
            return;
        }
        // Pequeño delay para que la UI se monte completamente
        const t = setTimeout(() => {
            setActiveTour({
                steps,
                onComplete: () => {
                    localStorage.setItem(KEY_ROLE(role), 'true');
                    setActiveTour(null);
                    setRoleTourDone(true);
                }
            });
        }, 600);
        return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ready, role]);

    // ── Dispara tour de pestaña pendiente cuando el rol tour termina ──
    useEffect(() => {
        if (!roleTourDone || !pendingTabTour || activeTour) return;
        const { tabId, role: tabRole, steps, key } = pendingTabTour;
        setPendingTabTour(null);
        const t = setTimeout(() => {
            setActiveTour({
                steps,
                onComplete: () => {
                    localStorage.setItem(key, 'true');
                    setActiveTour(null);
                }
            });
        }, 400);
        return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [roleTourDone, pendingTabTour, activeTour]);

    // ── Notificar cambio de pestaña ─────────────────────────────
    const onTabChange = useCallback((tabId) => {
        if (!role) return;
        const key = KEY_TAB(tabId, role);
        if (localStorage.getItem(key) === 'true') return;
        const steps = TAB_STEPS[tabId]?.[role];
        if (!steps || steps.length === 0) return;

        if (!roleTourDone || activeTour) {
            // Encolar para después
            setPendingTabTour({ tabId, role, steps, key });
            return;
        }

        const t = setTimeout(() => {
            setActiveTour({
                steps,
                onComplete: () => {
                    localStorage.setItem(key, 'true');
                    setActiveTour(null);
                }
            });
        }, 400);
        // No retornamos cleanup aquí para evitar cancelarlo si el tab cambia rápido
        // (el effect cleanup del componente en App.jsx lo maneja)
    }, [role, roleTourDone, activeTour]);

    // ── Reset cuando el rol cambia (logout → otro usuario) ──────
    useEffect(() => {
        if (!role) {
            setActiveTour(null);
            setRoleTourDone(false);
            setPendingTabTour(null);
        }
    }, [role]);

    /**
     * Salta y marca como completado el tour activo.
     */
    const skipTour = useCallback(() => {
        if (!activeTour) return;
        activeTour.onComplete();
    }, [activeTour]);

    /**
     * Resetea todos los tours del rol actual (útil para debug o re-demostración).
     */
    const resetTours = useCallback((targetRole = role) => {
        if (!targetRole) return;
        localStorage.removeItem(KEY_ROLE(targetRole));
        Object.keys(TAB_STEPS).forEach(tabId => {
            localStorage.removeItem(KEY_TAB(tabId, targetRole));
        });
        setRoleTourDone(false);
        setActiveTour(null);
        setPendingTabTour(null);
    }, [role]);

    return {
        activeTour,       // { steps, onComplete } | null — pasar a SpotlightTour
        onTabChange,      // llamar cuando el usuario cambia de pestaña
        skipTour,         // saltar el tour activo
        resetTours,       // para debugging / re-demo
    };
}
