import { createClient } from '@supabase/supabase-js';

// Instancia única para toda la app (auth, sync, backups, licenses)
// Las credenciales vienen del entorno (.env / Vercel env vars) — NUNCA hardcodeadas
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

let _instance = null;
function getSupabase() {
    if (!_instance) {
        _instance = createClient(supabaseUrl, supabaseKey);
        
        // Monkeypatch RealtimeChannel to avoid deprecation warnings when sending broadcasts offline
        try {
            const dummy = _instance.channel('__dummy_init_patch__');
            const RealtimeChannelProto = Object.getPrototypeOf(dummy);
            if (RealtimeChannelProto && typeof RealtimeChannelProto.send === 'function' && !RealtimeChannelProto.__patched) {
                const originalSend = RealtimeChannelProto.send;
                RealtimeChannelProto.send = function(args, opts) {
                    if (args && args.type === 'broadcast' && !this._canPush()) {
                        if (typeof this.httpSend === 'function') {
                            return this.httpSend(args.event, args.payload, opts)
                                .then(() => 'ok')
                                .catch(() => 'error');
                        }
                    }
                    return originalSend.call(this, args, opts);
                };
                RealtimeChannelProto.__patched = true;
            }
            _instance.removeChannel(dummy);
        } catch (e) {
            console.warn('[SupabasePatch] Failed to patch RealtimeChannel:', e);
        }
    }
    return _instance;
}

export const supabaseCloud = getSupabase();

// Mantener autenticado el WebSocket de Realtime tras la expiración horaria del
// access token. Sin esto, al caducar el token los canales entran en CHANNEL_ERROR
// permanente y disparan la tormenta de reconexión. setAuth re-inyecta el token
// nuevo en la conexión realtime existente.
try {
    supabaseCloud.auth.onAuthStateChange((event, session) => {
        if ((event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') && session?.access_token) {
            try {
                supabaseCloud.realtime.setAuth(session.access_token);
            } catch (e) {
                console.warn('[SupabaseAuth] realtime.setAuth falló:', e?.message);
            }
        }
    });
} catch (e) {
    console.warn('[SupabaseAuth] No se pudo enganchar el refresco de auth realtime:', e?.message);
}
