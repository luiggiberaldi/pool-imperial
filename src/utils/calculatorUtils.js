import { FinancialEngine } from '../core/FinancialEngine';

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

/**
 * Determina si un item de venta NO es un producto real del negocio:
 * propinas, servicio voluntario, recargos, abonos parciales y cargos de mesa
 * (tiempo, jugadas, compartidos). Se usa para excluirlos de Top Productos,
 * conteos de artículos vendidos y estadísticas de inventario.
 */
export function isNonProductSaleItem(item) {
    const nameLower = (item?.name || '').toLowerCase();
    return item?.isTip === true ||
        nameLower.includes('propina') ||
        nameLower.includes('servicio voluntario') ||
        nameLower.includes('recargo tdc') ||
        nameLower.startsWith('compartido') ||
        nameLower.startsWith('tiempo') ||
        nameLower.startsWith('jugada') ||
        nameLower.startsWith('abono') ||
        item?.id === 'abono-monto-libre';
}

/**
 * Calcula las estadísticas de actividad de juego (horas de mesa + jugadas/piñas)
 * a partir de una lista de ventas ya filtradas (sin ANULADAS).
 *
 * Clasificación por nombre de item:
 * - "tiempo…"     → horas (qty en horas decimales) + recaudo por tiempo
 * - "jugada…"     → jugadas (qty en unidades) + recaudo por jugadas
 * - "compartido…" → usa item.gameMeta (porción exacta de horas/piñas/recaudo de
 *   esa línea); ventas viejas sin gameMeta suman solo el monto al recaudo por
 *   tiempo, sin inflar el conteo de horas.
 */
export function computeGameStats(visibleSales) {
    let totalHours = 0;
    let hoursRevenue = 0;
    let totalRounds = 0;
    let roundsRevenue = 0;

    (visibleSales || []).forEach(s => {
        (s.items || []).forEach(item => {
            const nameLower = (item.name || '').toLowerCase();
            const qty = Number(item.qty) || 0;
            const revenue = (Number(item.priceUsd) || 0) * qty;

            if (nameLower.startsWith('tiempo')) {
                totalHours += qty;
                hoursRevenue += revenue;
            } else if (nameLower.startsWith('jugada')) {
                totalRounds += qty;
                roundsRevenue += revenue;
            } else if (nameLower.startsWith('compartido')) {
                const meta = item.gameMeta;
                if (meta && (meta.hoursRevenue !== undefined || meta.hoursQty !== undefined)) {
                    const hRev = Number(meta.hoursRevenue) || 0;
                    const hQty = Number(meta.hoursQty) || (hRev > 0 ? hRev / 10000 : 0);
                    totalHours += hQty;
                    hoursRevenue += hRev;
                    totalRounds += Number(meta.roundsQty) || 0;
                    roundsRevenue += Number(meta.roundsRevenue) || 0;
                } else {
                    // Fallback para ventas sin gameMeta: aislar porción de tiempo real ($11.250 por seat en B2/Pool)
                    const sharedTime = (nameLower.includes('b2') || nameLower.includes('pool')) ? (11250 * qty) : revenue;
                    hoursRevenue += sharedTime;
                    totalHours += sharedTime / 10000;
                }
            }
        });
    });

    // Si hubo recaudo por tiempo y totalHours es 0: calcular horas reales equivalentes ($10.000 COP/h)
    if (hoursRevenue > 0 && totalHours === 0) {
        totalHours = hoursRevenue / 10000;
    }

    return {
        totalHours,
        hoursRevenue,
        totalRounds,
        roundsRevenue,
        totalRevenue: hoursRevenue + roundsRevenue
    };
}

/**
 * Calcula el Desglose General de Ingresos de un turno sin duplicar abonos ni consumos compartidos.
 */
export function computeIncomeBreakdown(salesArray) {
    let productosContado = 0;
    let tiempoMesas = 0;
    let propinas = 0;
    let abonosEfectivo = 0;
    let ventasFiadas = 0;

    // Clasifica los items de una venta en buckets y los suma escalados a `amount`
    // (lo realmente recibido por esa venta): así los abonos previos y descuentos
    // no se cuentan dos veces y la suma de buckets siempre cuadra con el neto.
    const classifyItems = (s, amount) => {
        if (amount <= 0) return;
        let prod = 0, tiempo = 0, tips = 0;
        (s.items || []).forEach(item => {
            const nameLower = (item.name || '').toLowerCase();
            const qty = Number(item.qty) || 0;
            const itemTotal = (Number(item.priceUsd) || Number(item.price) || 0) * qty;

            if (item.isTip || nameLower.includes('propina') || nameLower.includes('servicio voluntario')) {
                tips += itemTotal;
            } else if (nameLower.startsWith('tiempo') || nameLower.startsWith('jugada')) {
                tiempo += itemTotal;
            } else if (nameLower.startsWith('compartido')) {
                const meta = item.gameMeta;
                const sharedTime = meta && meta.hoursRevenue !== undefined
                    ? Number(meta.hoursRevenue) || 0
                    : ((nameLower.includes('b2') || nameLower.includes('pool')) ? (11250 * qty) : itemTotal);
                tiempo += sharedTime;
                prod += Math.max(0, itemTotal - sharedTime);
            } else {
                prod += itemTotal;
            }
        });
        const gross = prod + tiempo + tips;
        if (gross <= 0) {
            productosContado += amount;
            return;
        }
        const scale = amount / gross;
        productosContado += prod * scale;
        tiempoMesas += tiempo * scale;
        propinas += tips * scale;
    };

    (salesArray || []).forEach(s => {
        if (s.status === 'ANULADA' || s.tipo === 'APERTURA_CAJA') return;

        const isFiadoSale = s.tipo === 'VENTA_FIADA' || (s.fiadoUsd && s.fiadoUsd > 0);
        const netSaleTotal = FinancialEngine.calculateSaleNetTotal(s);

        if (isFiadoSale) {
            const fiado = Number(s.fiadoUsd) || 0;
            if (fiado > 0) {
                ventasFiadas += fiado;
                // Venta fiada mixta: la parte pagada (efectivo/nequi) no se pierde
                classifyItems(s, Math.max(0, netSaleTotal - fiado));
            } else {
                ventasFiadas += netSaleTotal;
            }
        } else if (s.items && s.items.length === 1 && (s.items[0].id === 'abono-monto-libre' || (s.items[0].name || '').toLowerCase().startsWith('abono'))) {
            abonosEfectivo += netSaleTotal;
        } else {
            classifyItems(s, netSaleTotal);
        }
    });

    const totalCalculado = productosContado + tiempoMesas + propinas + abonosEfectivo + ventasFiadas;

    return {
        productosContado,
        tiempoMesas,
        propinas,
        abonosEfectivo,
        ventasFiadas,
        totalCalculado
    };
}
