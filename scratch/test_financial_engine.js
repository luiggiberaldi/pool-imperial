// Scratch test script for FinancialEngine.calculatePaymentBreakdown
// Stores a copy of the breakdown function to test behavior before and after the fix.

import { round2 } from '../src/utils/dinero.js';

// Humanize method lookup (stub)
function _resolveMethodLabel(methodId) {
    const labels = {
        efectivo: 'Efectivo',
        efectivo_usd: 'Efectivo USD',
        nequi: 'Nequi',
    };
    return labels[methodId] || methodId;
}

// ── CURRENT IMPLEMENTATION (BUGGY) ──
function calculatePaymentBreakdownCurrent(salesArray) {
    const breakdown = {};

    salesArray.forEach(sale => {
        if (sale.tipo === 'APERTURA_CAJA') {
            if (sale.openingUsd > 0) {
                if (!breakdown['efectivo']) breakdown['efectivo'] = { total: 0, currency: 'COP', label: 'Efectivo' };
                breakdown['efectivo'].total = round2(breakdown['efectivo'].total + round2(sale.openingUsd));
            }
            return;
        }

        if (!sale.payments || sale.payments.length === 0) {
            const method = sale.paymentMethod || 'efectivo';
            let currency = 'COP';
            let valueToSum = round2(sale.totalCop || sale.totalUsd || 0);

            if (!breakdown[method]) {
                breakdown[method] = { total: 0, currency: currency, label: _resolveMethodLabel(method) };
            }
            breakdown[method].total = round2(breakdown[method].total + valueToSum);
        } else {
            sale.payments.forEach(p => {
                if (p.isAbonoPrevio === true) return;
                const originalCurrency = p.amountOriginalCurrency || p.amountInputCurrency || p.currency || 'COP';

                if (!breakdown[p.methodId]) {
                    breakdown[p.methodId] = { 
                        total: 0, 
                        currency: originalCurrency, 
                        label: p.methodLabel || _resolveMethodLabel(p.methodId)
                    };
                }

                const valCop = p.amountUsd || 0;
                if (originalCurrency === 'USD') {
                    const valUsd = p.amountOriginal !== undefined ? p.amountOriginal : (valCop / (sale.rate || 4150));
                    breakdown[p.methodId].total = round2(breakdown[p.methodId].total + valUsd);
                } else {
                    breakdown[p.methodId].total = round2(breakdown[p.methodId].total + valCop);
                }
            });
        }

        let safeChangeUsd = round2(sale.changeUsd || 0);
        if (round2(sale.totalUsd || 0) === 0 && round2(sale.totalCop || 0) === 0) {
            safeChangeUsd = 0;
        }

        if (safeChangeUsd > 0) {
            if (!breakdown['_vuelto_cop']) breakdown['_vuelto_cop'] = { total: 0, currency: 'COP', label: 'Vuelto Entregado (COP)' };
            breakdown['_vuelto_cop'].total = round2(breakdown['_vuelto_cop'].total - safeChangeUsd);
        }
    });

    const finalBreakdown = {};
    Object.keys(breakdown).forEach(k => {
        const roundedTotal = round2(breakdown[k].total);
        if (roundedTotal !== 0) {
            finalBreakdown[k] = { ...breakdown[k], total: roundedTotal };
        }
    });

    return finalBreakdown;
}

// ── FIXED IMPLEMENTATION ──
function calculatePaymentBreakdownFixed(salesArray) {
    const breakdown = {};

    salesArray.forEach(sale => {
        if (sale.tipo === 'APERTURA_CAJA') {
            if (sale.openingUsd > 0) {
                if (!breakdown['efectivo']) breakdown['efectivo'] = { total: 0, currency: 'COP', label: 'Efectivo' };
                breakdown['efectivo'].total = round2(breakdown['efectivo'].total + round2(sale.openingUsd));
            }
            return;
        }

        if (!sale.payments || sale.payments.length === 0) {
            const method = sale.paymentMethod || 'efectivo';
            let currency = 'COP';
            let valueToSum = round2(sale.totalCop || sale.totalUsd || 0);

            if (!breakdown[method]) {
                breakdown[method] = { total: 0, currency: currency, label: _resolveMethodLabel(method) };
            }
            breakdown[method].total = round2(breakdown[method].total + valueToSum);
        } else {
            sale.payments.forEach(p => {
                if (p.isAbonoPrevio === true) return;
                const originalCurrency = p.amountOriginalCurrency || p.amountInputCurrency || p.currency || 'COP';

                if (!breakdown[p.methodId]) {
                    breakdown[p.methodId] = { 
                        total: 0, 
                        currency: originalCurrency, 
                        label: p.methodLabel || _resolveMethodLabel(p.methodId)
                    };
                }

                const valCop = p.amountUsd || 0;
                if (originalCurrency === 'USD') {
                    const valUsd = p.amountOriginal !== undefined ? p.amountOriginal : (valCop / (sale.rate || 4150));
                    breakdown[p.methodId].total = round2(breakdown[p.methodId].total + valUsd);
                } else {
                    breakdown[p.methodId].total = round2(breakdown[p.methodId].total + valCop);
                }
            });
        }

        let safeChangeUsd = round2(sale.changeUsd || 0);
        if (round2(sale.totalUsd || 0) === 0 && round2(sale.totalCop || 0) === 0) {
            safeChangeUsd = 0;
        }

        // Subtract change directly from the COP cash payment method
        if (safeChangeUsd > 0) {
            const cashMethod = breakdown['efectivo_cop'] ? 'efectivo_cop' : 'efectivo';
            if (!breakdown[cashMethod]) {
                breakdown[cashMethod] = { total: 0, currency: 'COP', label: cashMethod === 'efectivo_cop' ? 'Efectivo COP' : 'Efectivo' };
            }
            breakdown[cashMethod].total = round2(breakdown[cashMethod].total - safeChangeUsd);
        }
    });

    const finalBreakdown = {};
    Object.keys(breakdown).forEach(k => {
        const roundedTotal = round2(breakdown[k].total);
        if (roundedTotal !== 0) {
            finalBreakdown[k] = { ...breakdown[k], total: roundedTotal };
        }
    });

    return finalBreakdown;
}

// ── TEST CASE ──
// Scenario from video:
// Sale total is $305.723. Cashier registers payments:
// - Efectivo: $244.283 COP
// - Nequi: $88.740 COP
// - Total paid: $333.023 COP
// - Change returned in cash: $27.300 COP
const mockSales = [
    {
        id: 'sale_1',
        tipo: 'VENTA',
        totalCop: 305723,
        totalUsd: 305723,
        changeUsd: 27300,
        payments: [
            { methodId: 'efectivo', amountUsd: 244283, currency: 'COP' },
            { methodId: 'nequi', amountUsd: 88740, currency: 'COP' }
        ]
    }
];

console.log('--- TEST RUN ---');

console.log('\nRunning with CURRENT (buggy) implementation:');
const currentRes = calculatePaymentBreakdownCurrent(mockSales);
console.log(JSON.stringify(currentRes, null, 2));

console.log('\nRunning with FIXED implementation:');
const fixedRes = calculatePaymentBreakdownFixed(mockSales);
console.log(JSON.stringify(fixedRes, null, 2));

// Assertions for FIXED
const expectedEfectivo = 216983;
const expectedNequi = 88740;

if (fixedRes.efectivo?.total === expectedEfectivo && fixedRes.nequi?.total === expectedNequi && !fixedRes._vuelto_cop) {
    console.log('\n✅ TEST PASSED: Fixed implementation correctly calculates net cash and filters out vuelto!');
} else {
    console.log('\n❌ TEST FAILED: Fixed implementation returned incorrect values.');
    process.exit(1);
}
