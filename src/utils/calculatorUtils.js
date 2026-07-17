// [CONFIGURACIÓN] Comisión de efectivo REMOVIDA
// La tasa de efectivo ahora depende exclusivamente de la calibración manual del usuario

// Formateadores
export const formatCop = (val) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(Math.round(val || 0));
export const formatBs = (val) => formatCop(val);
export const formatUsd = (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(val || 0);

export const formatPaymentAmount = (p) => {
    if (!p) return '$ 0 COP';
    const currency = (
        p.amountOriginalCurrency || 
        p.amountInputCurrency || 
        p.currency || 
        (p.methodId && p.methodId.toLowerCase().includes('usd') ? 'USD' : 'COP')
    ).toUpperCase();
    
    const isUsd = currency === 'USD';
    const amount = isUsd 
        ? (p.amountInput !== undefined ? p.amountInput : (p.amountOriginal !== undefined ? p.amountOriginal : (p.amount || p.amountUsd)))
        : (p.amountUsd !== undefined ? p.amountUsd : (p.amount || p.amountInput || 0));

    if (isUsd) {
        return `${formatUsd(amount)} USD`;
    }
    return `${formatCop(amount)} COP`;
};

export const copToUsd = (copAmount, rate) => {
    if (!rate || rate <= 0) return 0;
    return copAmount / rate;
};

export const usdToCop = (usdAmount, rate) => {
    return Math.round((usdAmount || 0) * (rate || 0));
};

/** Capitaliza la primera letra de cada palabra en un nombre */
export const capitalizeName = (str) => {
    if (!str || typeof str !== 'string') return str || '';
    return str.replace(/\b\w/g, c => c.toUpperCase());
};

// [REDONDEO INTELIGENTE PARA EFECTIVO]
// Regla: Si decimal <= 0.20 -> Redondeo abajo (Floor)
//        Si decimal > 0.20  -> Redondeo arriba (Ceil)
export const smartCashRounding = (amount) => {
    const integer = Math.floor(amount);
    const decimal = amount - integer;
    return decimal <= 0.2001 ? integer : integer + 1; // Usamos 0.2001 para margen de error flotante
};

import { MessageService } from '../services/MessageService';

// Re-export deprecated function referencing the new service
export const generatePaymentMessage = (params) => {
    return MessageService.buildPaymentMessage(params);
};

// Normaliza número colombiano al formato internacional para wa.me
// Acepta: 3001234567 → 573001234567
export const formatVzlaPhone = (raw) => {
    if (!raw) return null;
    const digits = raw.replace(/\D/g, '');
    if (digits.startsWith('57') && digits.length >= 12) return digits;
    if (digits.startsWith('0')) return '57' + digits.slice(1);
    if (digits.length === 10) return '57' + digits;
    if (digits.startsWith('58')) return '57' + digits.slice(2);
    return '57' + digits;
};

export function formatGameHours(hours) {
    if (!hours || hours <= 0) return '0 h';
    const totalMinutes = Math.round(hours * 60);
    if (totalMinutes < 1) {
        return '< 1 min';
    }
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    if (h > 0) {
        return m > 0 ? `${h}h ${m}m` : `${h} h`;
    }
    return `${m} min`;
}
