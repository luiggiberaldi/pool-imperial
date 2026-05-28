import { useState, useEffect, useCallback } from 'react';

/**
 * useRates — Stub COP (moneda única)
 * 
 * Pool Imperial trabaja exclusivamente con Pesos Colombianos (COP).
 * No hay tasas de cambio, ni BCV, ni USD. 1 COP = 1 COP.
 * 
 * Este hook mantiene la misma interfaz que el original para
 * evitar romper componentes que dependían de él, pero retorna
 * un rate vacío/unitario.
 */
export function useRates() {
    const [loading] = useState(false);

    return {
        rates: {
            cop: { price: 1, source: 'COP', change: 0 },
            bcv: { price: 1, source: 'COP', change: 0 },   // alias compat
            euro: { price: 1, source: 'COP', change: 0 },  // alias compat
            lastUpdate: new Date().toISOString()
        },
        loading,
        isOffline: false,
        logs: [],
        updateData: () => {}
    };
}
