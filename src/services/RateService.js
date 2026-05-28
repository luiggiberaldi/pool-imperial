/**
 * RateService — Stub COP (moneda única)
 * 
 * Pool Imperial trabaja exclusivamente con Pesos Colombianos (COP).
 * Este servicio ya no realiza conversiones de moneda.
 * Se mantiene como stub para compatibilidad de importaciones existentes.
 */
export const RateService = {
    /**
     * Normaliza input de moneda. Pool Imperial solo usa COP.
     * @param {string} c
     * @returns {string} siempre 'COP'
     */
    normalizeCurrencyCode: (_c) => 'COP',

    /**
     * Contexto de cambio — siempre retorna tasa 1 (sin conversión).
     * @returns {{ rateUsed: 1, rateName: 'COP', target: 'COP' }}
     */
    getExchangeContext: (_currency, _target, _rates) => ({
        rateUsed: 1,
        rateName: 'COP',
        target: 'COP'
    })
};
