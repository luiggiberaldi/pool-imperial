import { useEffect, useRef } from 'react';
import { storageService } from '../utils/storageService';
import { supabaseCloud as supabase } from '../config/supabaseCloud';

const BACKUP_INTERVAL_MS = 30 * 60 * 1000; // 30 minutos
const BACKUP_KEY = 'bodega_autobackup_v1';
const BACKUP_HASH_KEY = 'bodega_autobackup_hash_v1';

// Claves criticas que se respaldan
const CRITICAL_KEYS = [
    'bodega_products_v1',
    'bodega_customers_v1',
    'bodega_sales_v1',
    'bodega_payment_methods_v1',
    'monitor_rates_v12',
];

export function useAutoBackup(isPremium, isDemo, deviceId) {
    const intervalRef = useRef(null);

    useEffect(() => {
        const computeHash = (snapshot) => {
            // Hash liviano: cantidad total de ventas + timestamp del ultimo producto
            const salesLen = Array.isArray(snapshot['bodega_sales_v1']) ? snapshot['bodega_sales_v1'].length : 0;
            const prods = snapshot['bodega_products_v1'];
            const lastProdTs = Array.isArray(prods) && prods.length > 0 ? (prods[prods.length - 1].updatedAt || prods[prods.length - 1].createdAt || '') : '';
            return `${salesLen}|${lastProdTs}|${Object.keys(snapshot).length}`;
        };

        const performBackup = async () => {
            try {
                const snapshot = {};
                let hasData = false;

                for (const key of CRITICAL_KEYS) {
                    const val = await storageService.getItem(key, null);
                    if (val !== null) {
                        snapshot[key] = val;
                        hasData = true;
                    }
                }

                if (!hasData) return;

                await storageService.setItem(BACKUP_KEY, {
                    data: snapshot,
                    timestamp: Date.now(),
                    device: navigator.userAgent?.substring(0, 80),
                });

                // Si es usuario premium permanente y tiene deviceId, subir a la nube solo si los datos cambiaron
                if (isPremium && !isDemo && deviceId) {
                    const currentHash = computeHash(snapshot);
                    const lastHash = localStorage.getItem(BACKUP_HASH_KEY);
                    if (currentHash === lastHash) return; // Sin cambios, no subir
                    await supabase.from('device_backups').upsert({
                        device_id: deviceId,
                        product_id: 'bodega',
                        backup_data: snapshot,
                        updated_at: new Date().toISOString()
                    }, { onConflict: 'device_id' });
                    localStorage.setItem(BACKUP_HASH_KEY, currentHash);
                }

            } catch (e) {
                console.error('[AutoBackup] Error:', e);
            }
        };

        // Primer backup 2 minutos despues del arranque (no inmediato)
        const initialTimer = setTimeout(performBackup, 2 * 60 * 1000);

        // Backup cada 30 minutos
        intervalRef.current = setInterval(performBackup, BACKUP_INTERVAL_MS);

        return () => {
            clearTimeout(initialTimer);
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [isPremium, isDemo, deviceId]);
}

// Restaurar desde backup (para emergencias)
export async function restoreFromBackup() {
    const backup = await storageService.getItem('bodega_autobackup_v1', null);
    if (!backup?.data) return null;

    for (const [key, val] of Object.entries(backup.data)) {
        await storageService.setItem(key, val);
    }

    return {
        restoredKeys: Object.keys(backup.data),
        backupTime: new Date(backup.timestamp).toLocaleString('es-VE'),
    };
}
