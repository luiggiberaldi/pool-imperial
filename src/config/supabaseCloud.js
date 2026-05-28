import { createClient } from '@supabase/supabase-js';

// Instancia única para toda la app (auth, sync, backups, licenses)
// Las credenciales vienen del entorno (.env / Vercel env vars) — NUNCA hardcodeadas
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Singleton — se crea UNA sola vez para evitar múltiples GoTrueClient
let _instance = null;
function getSupabase() {
    if (!_instance) {
        _instance = createClient(supabaseUrl, supabaseKey);
    }
    return _instance;
}

export const supabaseCloud = getSupabase();
