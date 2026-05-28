/**
 * CurrencyService — Moneda única COP
 * 
 * Pool Imperial trabaja exclusivamente con Pesos Colombianos (COP).
 * Los precios son enteros (sin centavos). No hay conversiones.
 */
export const CurrencyService = {
    /**
     * Parsea string o número a float.
     * @param {string|number} val
     * @returns {number}
     */
    safeParse: (val) => {
        if (!val || val === '.') return 0;
        if (typeof val === 'number') return val;
        return parseFloat(val.toString().replace(/,/g, '.'));
    },

    /**
     * Redondea al entero más cercano (COP no usa centavos en POS).
     * @param {number} value
     * @param {string} _currencyId - ignorado, siempre COP
     * @returns {string}
     */
    applyRoundingRule: (value, _currencyId) => {
        return Math.round(value).toString();
    },

    /**
     * Formatea un valor COP con separador de miles.
     * Resultado: "$ 12.500"
     * @param {number} value
     * @returns {string}
     */
    formatCOP: (value) => {
        if (!value && value !== 0) return '$ 0';
        return new Intl.NumberFormat('es-CO', {
            style: 'currency',
            currency: 'COP',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(Math.round(value || 0));
    },

    /**
     * Sin conversión — retorna el mismo valor (compatibilidad).
     * @param {number} amount
     * @returns {number}
     */
    calculateExchange: (amount, _rateFrom, _rateTo) => amount
};
