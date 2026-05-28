/**
 * biometricPinService.js
 *
 * WebAuthn biometric authentication para el login local por PIN.
 * Cada usuario tiene su propia credencial por dispositivo.
 *
 * Seguridad:
 * - La credencial se crea con authenticatorAttachment: 'platform', por lo que
 *   solo funciona con el sensor biométrico del dispositivo (no llaves de seguridad).
 * - userVerification: 'required' obliga al OS a verificar la huella/cara.
 * - allowCredentials filtra por el ID exacto de la credencial del usuario,
 *   por lo que otro usuario no puede usar su huella para acceder a otra cuenta.
 */

const CRED_KEY = (userId) => `bio_pin_cred_v1_${userId}`;

// ── Detección ─────────────────────────────────────────────────────────────────

/** Retorna true si el dispositivo es móvil/tablet */
export const isMobileDevice = () =>
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 1 && window.innerWidth <= 1024);

/** Retorna true si el browser soporta WebAuthn con autenticador de plataforma */
export const isBiometricAvailable = async () => {
    try {
        if (!window.PublicKeyCredential) return false;
        if (!PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable) return false;
        return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    } catch {
        return false;
    }
};

/** Retorna true si el usuario tiene una credencial registrada en este dispositivo */
export const isRegistered = (userId) =>
    !!localStorage.getItem(CRED_KEY(userId));

// ── Registro ──────────────────────────────────────────────────────────────────

/**
 * Registra la huella/cara del usuario actual para este dispositivo.
 * @param {number} userId  - ID del usuario local
 * @param {string} userName - Nombre visible (para el diálogo del OS)
 */
export const registerBiometric = async (userId, userName) => {
    if (!window.PublicKeyCredential) throw new Error('WebAuthn no soportado en este browser.');

    const challenge  = crypto.getRandomValues(new Uint8Array(32));
    const userIdBuf  = new TextEncoder().encode(`local_user_${userId}`);

    const credential = await navigator.credentials.create({
        publicKey: {
            challenge,
            rp: {
                name: 'Pool Imperial',
                id: window.location.hostname,
            },
            user: {
                id: userIdBuf,
                name: `usuario_${userId}`,
                displayName: userName,
            },
            pubKeyCredParams: [
                { alg: -7,   type: 'public-key' }, // ES256
                { alg: -257, type: 'public-key' }, // RS256
            ],
            authenticatorSelection: {
                authenticatorAttachment: 'platform',  // solo sensor del dispositivo
                userVerification: 'required',          // obliga biometría
                residentKey: 'preferred',
            },
            timeout: 60000,
        },
    });

    // Guardar solo el ID de la credencial (la clave privada queda en el enclave)
    const credId = btoa(String.fromCharCode(...new Uint8Array(credential.rawId)));
    localStorage.setItem(CRED_KEY(userId), credId);
    return true;
};

// ── Autenticación ─────────────────────────────────────────────────────────────

/**
 * Verifica la huella para el usuario dado.
 * Si el OS confirma la biometría, retorna true.
 * El allowCredentials filtra EXACTAMENTE la credencial de este usuario,
 * impidiendo que otro usuario use su huella para autenticarse como este.
 */
export const authenticateWithBiometric = async (userId) => {
    const credIdB64 = localStorage.getItem(CRED_KEY(userId));
    if (!credIdB64) throw new Error('Huella no registrada para este usuario en este dispositivo.');

    const credId    = Uint8Array.from(atob(credIdB64), c => c.charCodeAt(0));
    const challenge = crypto.getRandomValues(new Uint8Array(32));

    const assertion = await navigator.credentials.get({
        publicKey: {
            challenge,
            allowCredentials: [{
                id: credId,
                type: 'public-key',
                transports: ['internal'],
            }],
            userVerification: 'required',
            timeout: 60000,
        },
    });

    if (!assertion) throw new Error('No se recibió respuesta del autenticador.');
    return true;
};

// ── Gestión ───────────────────────────────────────────────────────────────────

/** Elimina la credencial biométrica de este usuario en este dispositivo */
export const clearBiometric = (userId) => {
    localStorage.removeItem(CRED_KEY(userId));
};
