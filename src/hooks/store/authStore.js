/**
 * authStore.js — Secure PIN Auth Store (SHA-256 + localforage)
 * 
 * API pública:
 *   isAuthenticated  — boolean
 *   role             — 'ADMIN' | 'CAJERO' | null
 *   currentUser      — objeto usuario activo completo
 *   cachedUsers      — lista de usuarios desde Supabase (para el login screen)
 *   login(userId, pin)  — verifica PIN con SHA-256 y activa sesión
 *   logout()            — limpia sesión activa
 *   syncUsers()         — baja usuarios desde Supabase y los guarda en localforage
 *
 * Aliases de compatibilidad (legacy):
 *   usuarioActivo    → currentUser
 *   usuarios         → cachedUsers
 *   nombre           → currentUser?.name
 *   rol              → role
 */

import { create } from 'zustand';
import { supabaseCloud } from '../../config/supabaseCloud';
import { capitalizeName } from '../../utils/calculatorUtils';

// Helper: obtener user_id del usuario Supabase autenticado
const getAuthUserId = async () => {
    try {
        const { data: { session } } = await supabaseCloud.auth.getSession();
        return session?.user?.id || null;
    } catch { return null; }
};

// ── Helpers ─────────────────────────────────────────────────────────────────

async function sha256(text) {
    const msgBuffer = new TextEncoder().encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// LocalForage lazy import para evitar problemas de SSR/hydration
async function getLocalForage() {
    const lf = await import('localforage');
    return lf.default;
}

const SESSION_KEY_BASE = 'poolbar_active_session';
const USERS_CACHE_KEY_BASE = 'poolbar_users_cache';
const ACCOUNT_KEY = 'poolbar_cloud_email';

// Claves vinculadas al email de la cuenta cloud para aislar datos entre cuentas
function getSessionKey() {
    const email = localStorage.getItem(ACCOUNT_KEY) || '';
    return email ? `${SESSION_KEY_BASE}_${email}` : SESSION_KEY_BASE;
}
function getUsersCacheKey() {
    const email = localStorage.getItem(ACCOUNT_KEY) || '';
    return email ? `${USERS_CACHE_KEY_BASE}_${email}` : USERS_CACHE_KEY_BASE;
}

// ── Rate limiting ────────────────────────────────────────────────────────────
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 30_000; // 30 seconds

// ── Cargar sesión persistida al iniciar ──────────────────────────────────────

async function loadPersistedSession() {
    try {
        const lf = await getLocalForage();
        const session = await lf.getItem(getSessionKey());
        return session || null;
    } catch {
        return null;
    }
}

async function loadCachedUsers() {
    try {
        const lf = await getLocalForage();
        const users = await lf.getItem(getUsersCacheKey());
        return Array.isArray(users) ? users : [];
    } catch {
        return [];
    }
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useAuthStore = create((set, get) => ({
    // ── Estado ───────────────────────────────────────────────────────────────
    isAuthenticated: false,
    currentUser: null,
    role: null,
    cachedUsers: [],
    _hydrated: false,
    failedAttempts: 0,
    lockoutUntil: null,

    // ── Aliases legados (compatibilidad con componentes no migrados) ──────────
    get usuarioActivo() { return get().currentUser; },
    get usuarios()      { return get().cachedUsers; },
    get nombre()        { return get().currentUser?.name || null; },
    get rol()           { return get().role; },

    // ── Hidratación: carga sesión y caché al montar ───────────────────────────
    hydrate: async () => {
        if (get()._hydrated) return;
        const [session, users] = await Promise.all([loadPersistedSession(), loadCachedUsers()]);
        if (session?.name) session.name = capitalizeName(session.name);
        set({
            currentUser:     session,
            isAuthenticated: !!session,
            role:            session?.role || null,
            cachedUsers:     users.map(u => ({ ...u, name: capitalizeName(u.name) })),
            _hydrated:       true,
        });
    },

    // ── Sincronizar usuarios desde Supabase ───────────────────────────────────
    syncUsers: async () => {
        try {
            const userId = await getAuthUserId();
            let query = supabaseCloud
                .from('staff_users')
                .select('id, name, role, pin_hash, active')
                .eq('active', true)
                .order('role', { ascending: true });
            if (userId) query = query.eq('user_id', userId);

            const { data, error } = await query;

            if (error) throw error;

            const users = (data || []).map(u => ({ ...u, name: capitalizeName(u.name) }));
            const lf = await getLocalForage();
            await lf.setItem(getUsersCacheKey(), users);
            set({ cachedUsers: users });
            return users;
        } catch (err) {
            console.warn('[authStore] syncUsers error:', err);
            // Si falla la red, usamos el caché que ya tenemos
            return get().cachedUsers;
        }
    },

    // ── Verificar PIN sin activar sesión (para flujo biométrico) ───────────────
    verifyPin: async (userId, pin) => {
        // Check lockout
        const { lockoutUntil } = get();
        if (lockoutUntil && Date.now() < lockoutUntil) {
            const remainingSec = Math.ceil((lockoutUntil - Date.now()) / 1000);
            return { locked: true, remainingSec };
        }
        if (lockoutUntil && Date.now() >= lockoutUntil) {
            set({ lockoutUntil: null, failedAttempts: 0 });
        }

        const { cachedUsers } = get();
        const user = cachedUsers.find(u => u.id === userId);
        if (!user) return false;
        const hashedPin = await sha256(pin);
        if (hashedPin === user.pin_hash) {
            set({ failedAttempts: 0, lockoutUntil: null });
            return true;
        }
        // Failed
        const newFailed = get().failedAttempts + 1;
        if (newFailed >= MAX_FAILED_ATTEMPTS) {
            set({ failedAttempts: newFailed, lockoutUntil: Date.now() + LOCKOUT_DURATION_MS });
            return { locked: true, remainingSec: Math.ceil(LOCKOUT_DURATION_MS / 1000) };
        }
        set({ failedAttempts: newFailed });
        return false;
    },

    // ── Login: verifica SHA-256 con rate limiting ─────────────────────────────
    login: async (userId, pin) => {
        // Check lockout
        const { lockoutUntil } = get();
        if (lockoutUntil && Date.now() < lockoutUntil) {
            const remainingSec = Math.ceil((lockoutUntil - Date.now()) / 1000);
            return { locked: true, remainingSec };
        }
        // Clear expired lockout
        if (lockoutUntil && Date.now() >= lockoutUntil) {
            set({ lockoutUntil: null, failedAttempts: 0 });
        }

        await new Promise(r => setTimeout(r, 350)); // feedback visual mínimo

        const { cachedUsers } = get();
        const user = cachedUsers.find(u => u.id === userId);
        if (!user) return false;

        const hashedPin = await sha256(pin);
        if (hashedPin !== user.pin_hash) {
            // Failed attempt
            const newFailed = get().failedAttempts + 1;
            if (newFailed >= MAX_FAILED_ATTEMPTS) {
                set({ failedAttempts: newFailed, lockoutUntil: Date.now() + LOCKOUT_DURATION_MS });
                return { locked: true, remainingSec: Math.ceil(LOCKOUT_DURATION_MS / 1000) };
            }
            set({ failedAttempts: newFailed });
            return false;
        }

        // Success — reset attempts
        const session = { ...user, name: capitalizeName(user.name) };

        try {
            const lf = await getLocalForage();
            await lf.setItem(getSessionKey(), session);
        } catch { /* continúa aunque falle la persistencia */ }

        set({
            isAuthenticated: true,
            currentUser:     session,
            role:            session.role,
            failedAttempts:  0,
            lockoutUntil:    null,
        });

        return true;
    },

    // ── Logout ────────────────────────────────────────────────────────────────
    logout: async () => {
        try {
            const lf = await getLocalForage();
            await lf.removeItem(getSessionKey());
        } catch { /* ignorar */ }

        set({
            isAuthenticated: false,
            currentUser:     null,
            role:            null,
        });
    },

    // ── Limpiar caché de usuarios (al cerrar sesión cloud) ──────────────────
    clearUsersCache: async () => {
        try {
            const lf = await getLocalForage();
            await lf.removeItem(getUsersCacheKey());
        } catch { /* ignorar */ }
        set({ cachedUsers: [] });
    },

    // ── Registrar email de cuenta cloud (para aislar caché) ─────────────────
    setCloudEmail: (email) => {
        if (email) localStorage.setItem(ACCOUNT_KEY, email.toLowerCase());
        else localStorage.removeItem(ACCOUNT_KEY);
    },

    // ── Login biométrico (sin PIN — solo tras verificación WebAuthn exitosa) ──
    loginWithBiometric: async (userId) => {
        const { cachedUsers } = get();
        const user = cachedUsers.find(u => u.id === userId);
        if (!user) return false;

        const session = { ...user, name: capitalizeName(user.name) };

        try {
            const lf = await getLocalForage();
            await lf.setItem(getSessionKey(), session);
        } catch { /* continúa aunque falle la persistencia */ }

        set({
            isAuthenticated: true,
            currentUser:     session,
            role:            session.role,
        });

        return true;
    },

    // ── Métodos legados (por compatibilidad con SettingsView / DashboardView) ──

    setRequireLogin: () => {},
    setAdminCredentials: () => {},

    // ── Verificar PIN de admin sin cambiar sesión activa ─────────────────────
    verifyAdminPin: async (pin) => {
        const admins = get().cachedUsers.filter(u => u.role === 'ADMIN');
        if (!admins.length) return false;
        const hashedPin = await sha256(pin);
        return admins.some(u => u.pin_hash === hashedPin);
    },

    // ── Lock automático (lo llama useAutoLock) ────────────────────────────────
    lockSession: async () => {
        try {
            const lf = await getLocalForage();
            await lf.removeItem(getSessionKey());
        } catch { /* ignorar */ }

        set({
            isAuthenticated: false,
            currentUser:     null,
            role:            null,
        });
    },

    // ── Login super admin (acceso de emergencia por contraseña maestra) ────────
    loginAsSuperAdmin: async (password) => {
        const SUPER_ADMIN_HASH = '61b9237617f079e2241b2ffddec6a3bf5dd1b767ab8beab10d32050f651f0d1d'; // sha256('794848')
        const hashed = await sha256(password);
        if (hashed !== SUPER_ADMIN_HASH) return false;

        const superSession = {
            id:   'superadmin',
            name: 'Super Admin',
            role: 'ADMIN',
            pin_hash: null,
            active: true,
        };

        try {
            const lf = await getLocalForage();
            await lf.setItem(getSessionKey(), superSession);
        } catch { /* continúa */ }

        set({
            isAuthenticated: true,
            currentUser:     superSession,
            role:            'ADMIN',
            failedAttempts:  0,
            lockoutUntil:    null,
        });

        return true;
    },
}));

// ── Auto-hidratación al importar el módulo ────────────────────────────────────
useAuthStore.getState().hydrate();
