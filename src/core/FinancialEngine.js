/**
 * FinancialEngine.js
 * 
 * Centralized, pure-function mathematical engine for POS calculations.
 * ALL financial logic across the app (profits, totals, discounts, breakdowns)
 * MUST route through these functions to guarantee 100% mathematical integrity
 * and shield against UI-side modifications.
 * 
 * v2.0 — Precision Overhaul: All arithmetic uses dinero.js round2/mulR/divR/sumR
 *         to eliminate IEEE 754 floating-point drift.
 */

import { round2, mulR, divR, subR, sumR } from '../utils/dinero';
import { useTablesStore } from '../hooks/store/useTablesStore';

export function getTaxRates() {
    try {
        const config = useTablesStore.getState().config;
        return {
            exento: 0,
            iva_19: (config?.taxRateIva ?? 19) / 100,
            impoconsumo_8: (config?.taxRateImpoconsumo ?? 8) / 100
        };
    } catch {
        return { exento: 0, iva_19: 0.19, impoconsumo_8: 0.08 };
    }
}

export const TAX_RATES = { exento: 0, iva_19: 0.19, impoconsumo_8: 0.08 };

export function computeItemTax(priceCop, taxType = 'exento', taxMode = 'inclusive') {
    const rates = getTaxRates();
    const rate = rates[taxType] || 0;
    if (rate === 0) return { base: priceCop, tax: 0, total: priceCop };
    if (taxMode === 'inclusive') {
        const base = priceCop / (1 + rate);
        const tax = priceCop - base;
        return { base, tax, total: priceCop };
    }
    // exclusive
    const tax = priceCop * rate;
    return { base: priceCop, tax, total: priceCop + tax };
}

// ── Labels de métodos de pago de fábrica (lookup puro, sin async) ──
// Resuelve el nombre legible de un methodId sin necesitar el módulo async.
const FACTORY_LABELS = {
    efectivo_bs:       'Efectivo Bs',
    pago_movil:        'Pago Móvil',
    punto_venta:       'Punto de Venta',
    efectivo_usd:      'Efectivo $',
    efectivo_cop:      'Efectivo COP',
    transferencia_cop: 'Transferencia COP',
    saldo_favor:       'Saldo a Favor',
    fiado:             'Fiado (Por Cobrar)',
};

function _resolveMethodLabel(methodId) {
    if (!methodId) return 'Método Desconocido';
    if (FACTORY_LABELS[methodId]) return FACTORY_LABELS[methodId];
    // Custom: 'custom_1712345678' → humanizar quitando prefijo
    if (methodId.startsWith('custom_')) return 'Método Personalizado';
    // Fallback: convertir snake_case a Title Case
    return methodId.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}


export class FinancialEngine {
    
    /**
     * Calculates the true net profit of a single sale.
     * Subtracts the global cart discount and evaluates margin per item.
     * 
     * @param {Object} sale - The sale object from database
     * @param {number} bcvRate - The active BCV rate for fallback comparisons
     * @param {Array} products - The global product dictionary to resolve unknown costs
     * @returns {number} Net Profit in Bs.
     */
    static calculateSaleProfit(sale, bcvRate, products) {
        if (!sale || !sale.items || sale.items.length === 0) return 0;
        
        // Sum the profit of each individual item (Revenue - Cost) in COP
        const itemProfits = sale.items.map(item => {
            const nameLower = (item.name || '').toLowerCase();
            // Exclude voluntary tips and card surcharges from store net profit calculations
            if (nameLower.includes('servicio voluntario') || nameLower.includes('recargo tdc')) {
                return 0;
            }

            const qty = Number(item.qty);
            if (qty === undefined || item.qty === null || isNaN(qty)) {
                console.warn(`[FinancialEngine] Item "${item.name || item.id}" has invalid qty (${item.qty}), treating as 0.`);
                return 0;
            }

            let costCop = 0;

            if (item.costUsd) {
                costCop = Number(item.costUsd);
            } else if (item.costBs) {
                costCop = Number(item.costBs);
            } else {
                // Fallback: Resolve cost dynamically from the products dictionary
                const p = products.find(p => p.id === item.id || p.id === item._originalId || p.name === item.name);
                if (p) {
                    costCop = p.costUsd ? Number(p.costUsd) : Number(p.costBs || 0);
                    if (item.id && typeof item.id === 'string' && item.id.endsWith('_unit')) {
                        costCop = costCop / (p.unitsPerPackage || 1);
                    }
                }
            }
            
            // Revenue and cost calculated directly in COP
            let priceBeforeTax = item.priceUsd || 0;
            const taxType = item.taxType || 'exento';
            const taxMode = item.taxMode || 'inclusive';
            if (taxType !== 'exento' && taxMode === 'inclusive') {
                const rate = getTaxRates()[taxType] || 0;
                priceBeforeTax = priceBeforeTax / (1 + rate);
            }
            const itemRevenueCop = mulR(priceBeforeTax, qty);
            const itemCostCop = mulR(costCop, qty);
            return subR(itemRevenueCop, itemCostCop);
        });

        const itemsProfit = sumR(itemProfits);
        const discountCop = sale.discountAmountUsd || 0;
        
        return subR(itemsProfit, discountCop);
    }

    /**
     * Aggregates total profit for an array of sales.
     */
    static calculateAggregateProfit(salesArray, bcvRate, products) {
        const profits = salesArray.map(sale => this.calculateSaleProfit(sale, bcvRate, products));
        return sumR(profits);
    }

    /**
     * Calculates the breakdown of payments received across multiple sales,
     * deducting the change returned (`changeUsd` or `changeBs`) to find the True Net Receipts.
     * 
     * @param {Array} salesArray - Array of sales to aggregate
     * @returns {Object} A dictionary mapping methodId to total amounts.
     */
    static calculatePaymentBreakdown(salesArray) {
        const breakdown = {};

        salesArray.forEach(sale => {
            // ── APERTURA DE CAJA: Ignore completely in payment breakdown ──
            if (sale.tipo === 'APERTURA_CAJA') {
                return;
            }

            // Debt collection reduces the outstanding fiado balance for the period (using USD to prevent exchange rate drift)
            if (sale.tipo === 'COBRO_DEUDA') {
                if (!breakdown['fiado']) {
                    breakdown['fiado'] = { total: 0, currency: 'FIADO', label: 'Fiado (Por Cobrar)' };
                }
                breakdown['fiado'].total = round2(breakdown['fiado'].total - round2(sale.totalUsd || 0));
                // Continue execution below to register the actual cash/transfer received
            }

            if (!sale.payments || sale.payments.length === 0) {
                // V1 Legacy Sales & Cobro Deudas
                if (sale.tipo === 'VENTA_FIADA') {
                    if (!breakdown['fiado']) {
                        breakdown['fiado'] = { total: 0, currency: 'FIADO', label: 'Fiado (Por Cobrar)' };
                    }
                    breakdown['fiado'].total = round2(breakdown['fiado'].total + round2(sale.totalUsd || 0));
                    return; // Skip normal payment processing and change deduction
                }

                // V1 Legacy Sales & Cobro Deudas
                const method = sale.paymentMethod || 'efectivo';
                let currency = 'COP';
                let valueToSum = round2(sale.totalCop || sale.totalUsd || 0);

                if (method.includes('usd') || method.includes('zelle') || method.includes('binance')) {
                    currency = 'USD';
                    valueToSum = round2(sale.totalUsd || 0); // En legacy se guardaba COP
                    // Pero si el método es USD, intentemos convertirlo usando tasa si es posible
                    if (currency === 'USD' && sale.rate > 1) {
                        valueToSum = round2(valueToSum / sale.rate);
                    }
                }

                if (!breakdown[method]) {
                    breakdown[method] = { total: 0, currency: currency, label: _resolveMethodLabel(method) };
                }
                breakdown[method].total = round2(breakdown[method].total + valueToSum);
            } else {
                // V2 VENTA_FIADA (credit sale with optional partial payments)
                if (sale.fiadoUsd && sale.fiadoUsd > 0) {
                    if (!breakdown['fiado']) {
                        breakdown['fiado'] = { total: 0, currency: 'FIADO', label: 'Fiado (Por Cobrar)' };
                    }
                    breakdown['fiado'].total = round2(breakdown['fiado'].total + round2(sale.fiadoUsd));
                }

                // Aggregate incoming payments (V2 sales)
                sale.payments.forEach(p => {
                    // Skip prior-abono payments — already counted in their own abono receipt
                    if (p.isAbonoPrevio === true) return;

                    const resolvedLabel = (p.methodLabel && p.methodLabel !== p.methodId)
                        ? p.methodLabel
                        : _resolveMethodLabel(p.methodId);

                    const originalCurrency = p.amountOriginalCurrency || p.amountInputCurrency || p.currency || 'COP';

                    if (!breakdown[p.methodId]) {
                        breakdown[p.methodId] = { 
                            total: 0, 
                            currency: originalCurrency, 
                            label: resolvedLabel
                        };
                    }

                    // Use pre-computed amountUsd (which is COP in database)
                    const valCop = p.amountUsd || 0;

                    if (originalCurrency === 'USD') {
                        // For USD methods, accumulate USD value
                        const valUsd = p.amountOriginal !== undefined ? p.amountOriginal : (valCop / (sale.rate || 4150));
                        breakdown[p.methodId].total = round2(breakdown[p.methodId].total + valUsd);
                    } else {
                        // For COP methods, accumulate COP value directly
                        breakdown[p.methodId].total = round2(breakdown[p.methodId].total + valCop);
                    }
                });
            }

            // Deduct outgoing change to find True Net Income (vuelto is in COP)
            let safeChangeUsd = round2(sale.changeUsd || 0);
            
            // If the sale was completely free/zero, any outgoing change is a glitch
            if (round2(sale.totalUsd || 0) === 0 && round2(sale.totalCop || 0) === 0) {
                safeChangeUsd = 0;
            }

            // Subtract change directly from the COP cash payment method (efectivo or efectivo_cop)
            if (safeChangeUsd > 0) {
                const cashMethod = breakdown['efectivo_cop'] ? 'efectivo_cop' : 'efectivo';
                if (!breakdown[cashMethod]) {
                    breakdown[cashMethod] = { 
                        total: 0, 
                        currency: 'COP', 
                        label: cashMethod === 'efectivo_cop' ? 'Efectivo COP' : 'Efectivo' 
                    };
                }
                breakdown[cashMethod].total = round2(breakdown[cashMethod].total - safeChangeUsd);
            }
        });

        // Final pass: round all totals strictly and filter out zeroes.
        const finalBreakdown = {};
        Object.keys(breakdown).forEach(k => {
            const roundedTotal = round2(breakdown[k].total);
            if (roundedTotal !== 0) {
                finalBreakdown[k] = { ...breakdown[k], total: roundedTotal };
            }
        });

        return finalBreakdown;
    }

    /**
     * Generates standard Checkout Cart Totals (Gross -> Discount -> Net -> Bs / COP equivalent)
     * Used exclusively BEFORE persisting a sale.
     * 
     * @param {Array} cartItems - Array of live cart items
     * @param {Object} discountData - { type: 'percentage'|'fixed', value: number }
     * @param {number} bcvRate - Exchange rate
     * @param {number} copRate - USD to COP Exchange rate
     * @returns {Object} Complete financial summary for the receipt.
     */
    static buildCartTotals(cartItems, discountData, bcvRate, copRate = 0) {
        let subtotalUsd = 0;
        let totalTax = 0;
        let totalUsd = 0;
        const taxBreakdown = { iva_19: 0, impoconsumo_8: 0 };

        cartItems.forEach(item => {
            const qty = Number(item.qty) || 0;
            const price = Number(item.priceUsd) || 0;
            const taxType = item.taxType || 'exento';
            const taxMode = item.taxMode || 'inclusive';

            const computed = computeItemTax(price, taxType, taxMode);
            const base = mulR(computed.base, qty);
            const tax = mulR(computed.tax, qty);
            const total = mulR(computed.total, qty);

            subtotalUsd = round2(subtotalUsd + base);
            totalTax = round2(totalTax + tax);
            totalUsd = round2(totalUsd + total);

            if (taxType !== 'exento') {
                taxBreakdown[taxType] = round2((taxBreakdown[taxType] || 0) + tax);
            }
        });

        let discountAmountUsd = 0;
        if (discountData && discountData.value > 0) {
            if (discountData.type === 'percentage') {
                discountAmountUsd = mulR(totalUsd, (discountData.value / 100));
            } else if (discountData.type === 'fixed') {
                discountAmountUsd = round2(discountData.value);
            }
        }
        
        if (discountAmountUsd > totalUsd) discountAmountUsd = totalUsd;
        
        const discountRatio = totalUsd > 0 ? (totalUsd - discountAmountUsd) / totalUsd : 0;
        
        // Adjust the bases, taxes, and totals based on discount ratio
        subtotalUsd = round2(subtotalUsd * discountRatio);
        totalTax = round2(totalTax * discountRatio);
        totalUsd = round2(Math.max(0, totalUsd - discountAmountUsd));

        // Adjust the breakdown based on discount ratio
        Object.keys(taxBreakdown).forEach(key => {
            taxBreakdown[key] = round2(taxBreakdown[key] * discountRatio);
        });

        const subtotalBs = round2(subtotalUsd * bcvRate);
        const discountAmountBs = round2(discountAmountUsd * bcvRate);
        const totalBs = round2(totalUsd * bcvRate);
        const totalCop = copRate > 0 ? mulR(totalUsd, copRate) : totalUsd;

        return {
            subtotalUsd,
            subtotalBs,
            discountAmountUsd,
            discountAmountBs,
            totalUsd,
            totalBs,
            totalCop,
            totalTax,
            taxBreakdown
        };
    }
}
