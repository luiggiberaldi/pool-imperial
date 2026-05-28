import localforage from 'localforage';
import { pushCloudSync } from '../hooks/useCloudSync';
import { scopedKey } from '../hooks/store/accountScope';

localforage.config({
    name: 'BodegaApp',
    storeName: 'bodega_app_data',
    description: 'Almacenamiento local optimizado para PWA de Bodega'
});

/**
 * Servicio de almacenamiento que previene el límite de 5MB de localStorage
 * Migrando los datos pesados a IndexedDB a través de localforage.
 */
export const storageService = {
    /**
     * Obtiene un item de IndexedDB.
     * Si no existe, intenta leerlo de localStorage (Retrocompatibilidad),
     * lo guarda en IndexedDB y lo borra de localStorage.
     */
    async getItem(key, defaultValue = null) {
        const sk = scopedKey(key);
        try {
            // 1. Intentar leer de IndexedDB
            const value = await localforage.getItem(sk);

            if (value !== null) {
                return value;
            }

            // --- Migración: mover clave SIN scope a la cuenta actual (una sola vez) ---
            if (sk !== key) {
                const unscopedValue = await localforage.getItem(key);
                if (unscopedValue !== null) {
                    await localforage.setItem(sk, unscopedValue);
                    // Eliminar clave sin scope para que NO se copie a otra cuenta
                    await localforage.removeItem(key);
                    console.log(`[Migración Scope] ${key} -> ${sk} (original eliminado)`);
                    return unscopedValue;
                }
            }

            // --- INTENTO DE RECUPERAR DATOS ANTERIORES AUTOMÁTICAMENTE ---
            try {
                if (key === 'bodega_products_v1' || key === 'bodega_customers_v1' || key === 'bodega_accounts_v2') {
                    const oldKeyMap = {
                        'bodega_products_v1': 'my_products_v1',
                        'bodega_customers_v1': 'my_customers_v1',
                        'bodega_accounts_v2': 'my_accounts_v2',
                    };
                    const oldKey = oldKeyMap[key];
                    if (oldKey) {
                        const oldStore = localforage.createInstance({
                            name: 'TasasAlDiaApp',
                            storeName: 'app_data'
                        });
                        const oldVal = await oldStore.getItem(oldKey);
                        if (oldVal !== null) {
                            await localforage.setItem(sk, oldVal);
                            console.log(`[Migración Auto] Recuperado ${oldKey} -> ${sk}`);
                            return oldVal;
                        }
                    }
                }
            } catch(e) {
                console.error("Error intentando recuperar datos antiguos", e);
            }

            // 2. Si no existe, revisar LocalStorage (Migración al vuelo)
            const fallbackValue = localStorage.getItem(key);
            if (fallbackValue !== null) {
                let parsedValue;
                try {
                    parsedValue = JSON.parse(fallbackValue);
                } catch (e) {
                    parsedValue = fallbackValue;
                }
                await localforage.setItem(sk, parsedValue);
                localStorage.removeItem(key);
                return parsedValue;
            }

            // 3. No existe en ningún lado
            return defaultValue;

        } catch (error) {
            console.error(`[Storage Error] Leyendo ${key}:`, error);
            const backup = localStorage.getItem(key);
            if (backup) {
                try { return JSON.parse(backup); } catch (e) { return backup; }
            }
            return defaultValue;
        }
    },

    /**
     * Guarda un item directamente en IndexedDB
     */
    async setItem(key, value) {
        const sk = scopedKey(key);
        try {
            await localforage.setItem(sk, value);
            try { localStorage.removeItem(key); } catch(e) { /* ignore */ }
            if (typeof window !== "undefined") {
                window.dispatchEvent(new CustomEvent("app_storage_update", { detail: { key } }));
            }
            import('../hooks/useCloudSync').then(m => m.scheduleCloudPush(key, value));
        } catch (error) {
            console.error(`[Storage Error] Guardando ${key}:`, error);
            try {
                localStorage.setItem(sk, typeof value === 'string' ? value : JSON.stringify(value));
                if (typeof window !== "undefined") {
                    window.dispatchEvent(new CustomEvent("app_storage_update", { detail: { key } }));
                }
                import('../hooks/useCloudSync').then(m => m.scheduleCloudPush(key, value));
            } catch (e) {
                console.error(`[Storage Error CRÍTICO] Ni IndexedDB ni LocalStorage funcionan para ${key}`, e);
            }
        }
    },

    /**
     * Guarda un item en IndexedDB SIN disparar subida a la nube.
     * Usar EXCLUSIVAMENTE cuando el dato viene de la nube (para evitar re-subida en bucle).
     */
    async setItemSilent(key, value) {
        const sk = scopedKey(key);
        try {
            await localforage.setItem(sk, value);
            try { localStorage.removeItem(key); } catch(e) { /* ignore */ }
        } catch (error) {
            console.error(`[Storage Error Silent] Guardando ${key}:`, error);
        }
    },

    /**
     * Elimina un item
     */
    async removeItem(key) {
        const sk = scopedKey(key);
        try {
            await localforage.removeItem(sk);
            localStorage.removeItem(key);
            if (typeof window !== "undefined") {
                window.dispatchEvent(new CustomEvent("app_storage_update", { detail: { key } }));
            }
            pushCloudSync(key, []);
        } catch (error) {
            console.error(`[Storage Error] Borrando ${key}:`, error);
        }
    }
};
