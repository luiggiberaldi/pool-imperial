// Utilidades criptográficas para seguridad en frontend (offline-first)

/**
 * Hashea un texto (PIN) usando SHA-256 de la Web Crypto API.
 * @param {string} pin - El PIN en texto plano.
 * @returns {Promise<string>} - El hash en formato hexadecimal.
 */
export async function hashPin(pin) {
    if (!pin) return null;

    const encoder = new TextEncoder();
    const data = encoder.encode(pin.toString());
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Hashea un PIN con salt (userId) para evitar rainbow tables.
 * @param {string} pin - El PIN en texto plano.
 * @param {string|number} salt - Salt único por usuario (ej: userId).
 * @returns {Promise<string>} - El hash en formato hexadecimal.
 */
export async function hashPinWithSalt(pin, salt) {
    if (!pin) return null;
    return hashPin(`${salt}:${pin}`);
}

// PINs débiles conocidos que NO se deben permitir
const WEAK_PINS = new Set([
    '0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999',
    '1234', '4321', '1122', '2233', '0123', '3210', '1010', '2020',
]);

/**
 * Valida que un PIN cumpla requisitos mínimos de seguridad.
 * @param {string} pin
 * @returns {{ valid: boolean, reason?: string }}
 */
export function validatePin(pin) {
    if (!pin || typeof pin !== 'string') return { valid: false, reason: 'PIN requerido' };
    if (pin.length < 4) return { valid: false, reason: 'Mínimo 4 dígitos' };
    if (!/^\d+$/.test(pin)) return { valid: false, reason: 'Solo dígitos permitidos' };
    if (WEAK_PINS.has(pin)) return { valid: false, reason: 'PIN demasiado simple. Usa algo menos predecible.' };
    return { valid: true };
}
