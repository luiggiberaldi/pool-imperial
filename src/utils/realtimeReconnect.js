import { supabaseCloud } from '../config/supabaseCloud';

/**
 * Suscripción resiliente a un canal Realtime de Supabase.
 *
 * Corrige la "tormenta de reconexión" que se producía porque cada callback de
 * estado CHANNEL_ERROR/TIMED_OUT agendaba su propio setTimeout de reintento (sin
 * guard), y re-suscribía la MISMA instancia de canal ya marcada en error. Con
 * varios disparos, los loops se duplicaban (contadores en potencias de 2).
 *
 * Garantías:
 *  - UN solo reintento en vuelo (flag retryScheduled) → no se multiplican los loops.
 *  - Backoff exponencial 5s→10s→20s→40s→60s (tope), reseteado al lograr SUBSCRIBED.
 *  - Recreación LIMPIA: se elimina el canal viejo (removeChannel) y factory() crea
 *    una instancia nueva con sus handlers, en vez de re-suscribir la muerta.
 *  - Log una vez por transición (no en cada tick).
 *
 * @param {() => import('@supabase/supabase-js').RealtimeChannel} factory
 *        Crea una instancia NUEVA del canal ya con sus .on(...) registrados.
 * @param {object} opts
 * @param {string} [opts.label]        Prefijo para los logs (ej. '[SalesSync]').
 * @param {(ch) => void} [opts.onSubscribed]  Se llama con el canal vivo al conectar.
 * @param {() => void}   [opts.onClosed]      Se llama al entrar en error/cierre.
 * @returns {{ current: () => any, teardown: () => void }}
 */
export function subscribeResilient(factory, { label = '[Realtime]', onSubscribed, onClosed } = {}) {
    const BASE_DELAY = 5000;
    const MAX_DELAY = 60000;

    let channel = null;
    let retryScheduled = false;
    let retryTimer = null;
    let attempt = 0;
    let torndown = false;

    const cleanupChannel = () => {
        if (channel) {
            try { supabaseCloud.removeChannel(channel); } catch { /* ignore */ }
            channel = null;
        }
    };

    const scheduleRetry = () => {
        // Guard anti-tormenta: solo un reintento pendiente a la vez.
        if (retryScheduled || torndown) return;
        retryScheduled = true;
        const delay = Math.min(BASE_DELAY * 2 ** attempt, MAX_DELAY);
        attempt += 1;
        console.warn(`${label} canal desconectado, reintentando en ${Math.round(delay / 1000)}s...`);
        retryTimer = setTimeout(() => {
            retryScheduled = false;
            if (torndown) return;
            connect();
        }, delay);
    };

    const connect = () => {
        if (torndown) return;
        // Descartar cualquier instancia previa antes de crear una nueva.
        cleanupChannel();
        channel = factory();
        channel.subscribe((status) => {
            if (torndown) return;
            if (status === 'SUBSCRIBED') {
                attempt = 0; // reset backoff al conectar
                if (onSubscribed) { try { onSubscribed(channel); } catch { /* ignore */ } }
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
                if (onClosed) { try { onClosed(); } catch { /* ignore */ } }
                scheduleRetry();
            }
        });
    };

    connect();

    return {
        current: () => channel,
        teardown: () => {
            torndown = true;
            if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
            retryScheduled = false;
            cleanupChannel();
        },
    };
}
