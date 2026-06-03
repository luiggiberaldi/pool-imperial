import { supabaseCloud } from '../config/supabaseCloud';

let serverOffset = 0; // en milisegundos: serverTime - localTime
let initialized = false;

export async function initServerClock() {
    try {
        const start = Date.now();
        const { data, error } = await supabaseCloud.rpc('get_server_time');
        
        if (error) {
            console.warn('[ServerClock] RPC get_server_time no disponible o falló. Intentando fallback HTTP...', error);
            await fallbackHttpClock(start);
            return;
        }

        const end = Date.now();
        const latency = (end - start) / 2; // RTT aproximado
        const serverMs = new Date(data).getTime();
        
        // Ajustamos sumando la latencia estimada
        serverOffset = (serverMs + latency) - end;
        initialized = true;
        console.log(`[ServerClock] Sincronizado exitosamente vía RPC. Offset: ${serverOffset}ms (Latencia: ${latency}ms)`);
    } catch (e) {
        console.warn('[ServerClock] Error al sincronizar reloj:', e);
        // Intentar fallback si falla la rpc por excepción
        await fallbackHttpClock(Date.now());
    }
}

async function fallbackHttpClock(startTime) {
    try {
        const url = import.meta.env.VITE_SUPABASE_URL;
        // Hacemos una petición rápida HEAD a la url de Supabase
        const res = await fetch(url, { method: 'HEAD' });
        const dateHeader = res.headers.get('date');
        if (dateHeader) {
            const end = Date.now();
            const latency = (end - startTime) / 2;
            const serverMs = new Date(dateHeader).getTime();
            serverOffset = (serverMs + latency) - end;
            initialized = true;
            console.log(`[ServerClock] Sincronizado vía HTTP header 'date'. Offset: ${serverOffset}ms`);
        } else {
            console.warn('[ServerClock] Header Date no expuesto en CORS. Se usará el reloj local (offset = 0)');
            serverOffset = 0;
            initialized = true;
        }
    } catch (err) {
        console.warn('[ServerClock] Fallback HTTP falló. Se usará el reloj local (offset = 0)', err);
        serverOffset = 0;
        initialized = true;
    }
}

export function getServerNow() {
    return Date.now() + serverOffset;
}

export function isServerClockSynced() {
    return initialized;
}
