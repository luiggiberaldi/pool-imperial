import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { logEvent } from '../../services/auditService';
import { hashPin, hashPinWithSalt, validatePin } from '../../utils/crypto';

// Pre-computed SHA-256 hashes of default PINs (legacy — unsalted)
// These are detected at login to force a PIN change
const LEGACY_DEFAULT_HASHES = new Set([
    '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4', // "0000"
    '9af15b336e6a9619928537df30b2e6a2376569fcf9d7e773eccede65606529a0', // "1111"
]);

const DEFAULT_USERS = [
    { id: 1, nombre: 'Administrador', rol: 'ADMIN', pin_hash: '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4' },
    { id: 2, nombre: 'Cajero', rol: 'CAJERO', pin_hash: '9af15b336e6a9619928537df30b2e6a2376569fcf9d7e773eccede65606529a0' }
];

// Rate limiting constants
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 30_000; // 30 seconds

export const useAuthStore = create(
    persist(
        (set, get) => ({
            usuarioActivo: (() => {
                try {
                    const saved = localStorage.getItem('abasto-device-session');
                    return saved ? JSON.parse(saved) : null;
                } catch { return null; }
            })(),
            usuarios: DEFAULT_USERS,
            requireLogin: false, // Login opcional, por defecto desactivado

            // Rate limiting state
            failedAttempts: 0,
            lockoutUntil: null,


            // ACCIONES
            login: async (pinInput, userId) => {
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

                // Simular un pequeño retardo para feedback visual (UX)
                await new Promise(r => setTimeout(r, 400));

                const { usuarios } = get();

                // Try salted hash first (new format), then legacy unsalted
                let userEncontrado = null;

                for (const u of usuarios) {
                    if (userId && u.id !== userId) continue;

                    // New: salted hash
                    const saltedHash = await hashPinWithSalt(pinInput, u.id);
                    if (u.pin_hash === saltedHash) {
                        userEncontrado = u;
                        break;
                    }

                    // Legacy: unsalted hash (for migration)
                    const legacyHash = await hashPin(pinInput);
                    if (u.pin_hash === legacyHash) {
                        userEncontrado = u;
                        // Detect if using a weak default PIN
                        if (LEGACY_DEFAULT_HASHES.has(u.pin_hash)) {
                            userEncontrado = { ...u, _mustChangePin: true };
                        } else {
                            // Auto-migrate to salted hash
                            set((state) => ({
                                usuarios: state.usuarios.map(existing =>
                                    existing.id === u.id ? { ...existing, pin_hash: saltedHash } : existing
                                )
                            }));
                        }
                        break;
                    }
                }

                if (userEncontrado) {
                    set({ usuarioActivo: userEncontrado, failedAttempts: 0, lockoutUntil: null });
                    localStorage.setItem('abasto-device-session', JSON.stringify(userEncontrado));
                    logEvent('AUTH', 'LOGIN', `${userEncontrado.nombre} inicio sesion`, userEncontrado);
                    if (userEncontrado._mustChangePin) {
                        return { success: true, mustChangePin: true };
                    }
                    return true;
                }

                // Failed attempt — increment counter and possibly lock out
                const newFailedAttempts = get().failedAttempts + 1;
                if (newFailedAttempts >= MAX_FAILED_ATTEMPTS) {
                    const lockoutUntilTs = Date.now() + LOCKOUT_DURATION_MS;
                    set({ failedAttempts: newFailedAttempts, lockoutUntil: lockoutUntilTs });
                    logEvent('AUTH', 'LOCKOUT', `Cuenta bloqueada por ${LOCKOUT_DURATION_MS / 1000}s tras ${newFailedAttempts} intentos fallidos`);
                    const remainingSec = Math.ceil(LOCKOUT_DURATION_MS / 1000);
                    return { locked: true, remainingSec };
                } else {
                    set({ failedAttempts: newFailedAttempts });
                }

                return false;
            },

            logout: () => {
                const { usuarioActivo } = get();
                if (usuarioActivo) logEvent('AUTH', 'LOGOUT', `${usuarioActivo.nombre} cerro sesion`, usuarioActivo);
                set({ usuarioActivo: null });
                localStorage.removeItem('abasto-device-session');
            },

            cambiarPin: async (userId, nuevoPin) => {
                // Validar PIN antes de aceptarlo
                const validation = validatePin(nuevoPin);
                if (!validation.valid) {
                    return { success: false, error: validation.reason };
                }

                const nuevoPinHash = await hashPinWithSalt(nuevoPin, userId);
                set((state) => ({
                    usuarios: state.usuarios.map(u =>
                        u.id === userId ? { ...u, pin_hash: nuevoPinHash } : u
                    )
                }));

                // Si el usuario que cambió el PIN es el activo, actualizar su sesión local
                const { usuarioActivo } = get();
                if (usuarioActivo && usuarioActivo.id === userId) {
                    const nuevoActivo = { ...usuarioActivo, pin_hash: nuevoPinHash };
                    set({ usuarioActivo: nuevoActivo });
                    localStorage.setItem('abasto-device-session', JSON.stringify(nuevoActivo));
                }
                const target = get().usuarios.find(u => u.id === userId);
                logEvent('AUTH', 'PIN_CAMBIADO', `PIN cambiado para ${target?.nombre || 'usuario'}`, get().usuarioActivo);
                return { success: true };
            },

            agregarUsuario: async (nombre, rol, pin) => {
                const validation = validatePin(pin);
                if (!validation.valid) {
                    return { success: false, error: validation.reason };
                }

                const maxId = get().usuarios.reduce((max, u) => Math.max(max, u.id), 0);
                const newId = maxId + 1;
                const pinHash = await hashPinWithSalt(pin, newId);
                set((state) => ({
                    usuarios: [...state.usuarios, { id: newId, nombre, rol, pin_hash: pinHash }]
                }));
                logEvent('USUARIO', 'USUARIO_CREADO', `Usuario "${nombre}" (${rol}) creado`, get().usuarioActivo);
                return { success: true };
            },

            eliminarUsuario: (userId) => {
                const { usuarios, usuarioActivo } = get();
                // No permitir eliminar al último ADMIN
                const admins = usuarios.filter(u => u.rol === 'ADMIN');
                const target = usuarios.find(u => u.id === userId);
                if (target?.rol === 'ADMIN' && admins.length <= 1) return false;
                // No permitir eliminarse a sí mismo
                if (usuarioActivo?.id === userId) return false;

                set({ usuarios: usuarios.filter(u => u.id !== userId) });
                logEvent('USUARIO', 'USUARIO_ELIMINADO', `Usuario "${target.nombre}" (${target.rol}) eliminado`, usuarioActivo);
                return true;
            },

            editarUsuario: (userId, datos) => {
                // No permitir cambiar campos sensibles directamente
                const { id, pin_hash, ...safeDatos } = datos;
                set((state) => ({
                    usuarios: state.usuarios.map(u =>
                        u.id === userId ? { ...u, ...safeDatos } : u
                    )
                }));
                const { usuarioActivo } = get();
                if (usuarioActivo && usuarioActivo.id === userId) {
                    const nuevoActivo = { ...usuarioActivo, ...safeDatos };
                    set({ usuarioActivo: nuevoActivo });
                    localStorage.setItem('abasto-device-session', JSON.stringify(nuevoActivo));
                }
            },

            /**
             * Login directo sin PIN — solo llamar después de verificación biométrica exitosa.
             */
            loginWithBiometric: async (userId) => {
                const { usuarios } = get();
                const user = usuarios.find(u => u.id === userId);
                if (!user) return false;
                set({ usuarioActivo: user, failedAttempts: 0, lockoutUntil: null });
                localStorage.setItem('abasto-device-session', JSON.stringify(user));
                logEvent('AUTH', 'LOGIN_BIOMETRIC', `${user.nombre} inicio sesion con huella`, user);
                return true;
            },

            setRequireLogin: (val) => {
                set({ requireLogin: val });
                logEvent('CONFIG', 'LOGIN_REQUERIDO_MODIFICADO', `Login requerido establecido a ${val ? 'SI' : 'NO'}`);
            },
        }),
        {
            name: 'abasto-auth-storage', // Nombre para localStorage
            partialize: (state) => ({
                usuarios: state.usuarios,
                requireLogin: state.requireLogin,
            }),
            storage: {
                getItem: (name) => {
                    const str = localStorage.getItem(name);
                    if (!str) return null;
                    try { return JSON.parse(str); } catch (e) { return null; }
                },
                setItem: (name, value) => {
                    localStorage.setItem(name, JSON.stringify(value));
                    // Disparar a la nube para P2P (Lazy import para evitar ciclos)
                    import('../useCloudSync').then(({ pushCloudSync }) => {
                        pushCloudSync(name, value);
                    }).catch(err => console.warn('No se pudo inyectar Auth Cloud', err));
                },
                removeItem: (name) => localStorage.removeItem(name)
            }
        }
    )
);
