/**
 * accountScope.js — Aísla claves de caché por cuenta cloud
 *
 * Todas las stores (cash, orders, tables) deben usar scopedKey()
 * para que los datos de una cuenta no se filtren a otra.
 */

const ACCOUNT_KEY = 'poolbar_cloud_email';

export function getAccountEmail() {
    return localStorage.getItem(ACCOUNT_KEY) || '';
}

/**
 * Retorna una clave prefijada con el email de la cuenta activa.
 * Ejemplo: scopedKey('active_cash_session') → 'active_cash_session__user@email.com'
 */
export function scopedKey(key) {
    const email = getAccountEmail();
    return email ? `${key}__${email}` : key;
}
