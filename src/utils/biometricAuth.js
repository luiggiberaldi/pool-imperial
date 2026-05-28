/**
 * biometricAuth.js
 * WebAuthn-based biometric login (fingerprint / Face ID) for mobile devices.
 * Works as a "biometric gate" that protects the stored Supabase refresh token.
 */

const CRED_ID_KEY  = 'bio_credential_id';
const TOKEN_KEY    = 'bio_refresh_token';
const EMAIL_KEY    = 'bio_email';

/** True if the current device looks like a phone or tablet */
export const isMobileDevice = () =>
    /Android|iPhone|iPad|iPod|Mobile|Touch/i.test(navigator.userAgent);

/** True if the browser supports platform (on-device) biometrics via WebAuthn */
export const isBiometricSupported = async () => {
    try {
        if (!window.PublicKeyCredential) return false;
        if (!PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable) return false;
        return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    } catch {
        return false;
    }
};

/** True if the user has already registered a biometric credential on this device */
export const hasBiometricRegistered = () =>
    !!localStorage.getItem(CRED_ID_KEY);

/** Returns the email associated with the stored biometric credential */
export const getBiometricEmail = () =>
    localStorage.getItem(EMAIL_KEY) || '';

/**
 * Registers a new WebAuthn platform credential and stores the Supabase refresh token.
 * @param {string} email
 * @param {string} refreshToken  — Supabase session refresh_token
 */
export const registerBiometric = async (email, refreshToken) => {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const userId    = new TextEncoder().encode(email);

    const credential = await navigator.credentials.create({
        publicKey: {
            challenge,
            rp: { name: 'Pool Imperial', id: window.location.hostname },
            user: { id: userId, name: email, displayName: email },
            pubKeyCredParams: [
                { alg: -7,   type: 'public-key' }, // ES256
                { alg: -257, type: 'public-key' }, // RS256
            ],
            authenticatorSelection: {
                authenticatorAttachment: 'platform',
                userVerification: 'required',
                residentKey: 'preferred',
            },
            timeout: 60000,
        },
    });

    const credId = btoa(String.fromCharCode(...new Uint8Array(credential.rawId)));
    localStorage.setItem(CRED_ID_KEY, credId);
    localStorage.setItem(TOKEN_KEY,   refreshToken);
    localStorage.setItem(EMAIL_KEY,   email);
    return true;
};

/**
 * Authenticates with biometric and returns the stored refresh token on success.
 * Returns null if cancelled or failed.
 */
export const authenticateWithBiometric = async () => {
    const credIdB64 = localStorage.getItem(CRED_ID_KEY);
    if (!credIdB64) return null;

    const credId    = Uint8Array.from(atob(credIdB64), c => c.charCodeAt(0));
    const challenge = crypto.getRandomValues(new Uint8Array(32));

    const assertion = await navigator.credentials.get({
        publicKey: {
            challenge,
            allowCredentials: [{ id: credId, type: 'public-key' }],
            userVerification: 'required',
            timeout: 60000,
        },
    });

    if (!assertion) return null;
    return localStorage.getItem(TOKEN_KEY);
};

/** Removes all biometric data from this device */
export const clearBiometric = () => {
    localStorage.removeItem(CRED_ID_KEY);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(EMAIL_KEY);
};
