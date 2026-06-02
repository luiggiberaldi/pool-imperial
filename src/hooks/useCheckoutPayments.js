import { useState, useCallback, useMemo, useRef } from 'react';
import { round2, sumR, subR } from '../utils/dinero';

const EPSILON = 1; // 1 peso colombiano de tolerancia

/**
 * Detecta si el cajero ingresó un monto absurdamente alto en COP.
 */
function detectPaymentAnomaly({ cartTotalUsd, totalPaidUsd }) {
    if (cartTotalUsd <= EPSILON) return null;

    const ratio = totalPaidUsd / cartTotalUsd;
    const diff = totalPaidUsd - cartTotalUsd;

    // Alerta si pagan más de 3 veces el total y la diferencia supera los 50.000 pesos
    if (ratio > 3 && diff > 50000) {
        return { type: 'overpay', ratio };
    }

    return null;
}

export function useCheckoutPayments({ paymentMethods, effectiveRate, tasaCop, cartTotalUsd, onConfirmSale, triggerHaptic, splitMeta = null, tdcSurchargePercent = 5, ivaRate = 19, tableContext = null }) {
    const [barValues, setBarValues] = useState({});
    const [changeUsdGiven, setChangeUsdGiven] = useState('');
    const [changeBsGiven, setChangeBsGiven] = useState(''); // Se mantiene por firma pero siempre es vacío
    const [confirmFiar, setConfirmFiar] = useState(false);
    const [overpayAlertData, setOverpayAlertData] = useState(null);
    const submittingRef = useRef(false);

    // Calcular la base imponible del IVA excluyendo el servicio voluntario si existe
    const baseParaIva = useMemo(() => {
        if (tableContext?.includeServiceCharge) {
            return Math.round(cartTotalUsd / 1.10);
        }
        return cartTotalUsd;
    }, [cartTotalUsd, tableContext]);

    // IVA exclusivo (se suma al total)
    const ivaAmount = useMemo(() => {
        return ivaRate > 0 ? Math.round(baseParaIva * (ivaRate / 100)) : 0;
    }, [baseParaIva, ivaRate]);

    // Calcular el monto base pagado con TDC para aplicar el recargo
    const tdcAmount = useMemo(() => {
        const val = parseFloat(barValues['tdc']) || 0;
        return Math.round(val);
    }, [barValues]);

    // Recargo calculado directamente sobre el monto base ingresado
    const tdcSurcharge = useMemo(() => {
        return tdcAmount > 0 ? Math.round(tdcAmount * (tdcSurchargePercent / 100)) : 0;
    }, [tdcAmount, tdcSurchargePercent]);

    const adjustedTotal = useMemo(() => {
        return cartTotalUsd + ivaAmount + tdcSurcharge;
    }, [cartTotalUsd, ivaAmount, tdcSurcharge]);

    // En Pool Imperial, cartTotalUsd almacena en realidad el total en COP.
    // Todos los inputs en barValues representan COP.
    const totalPaidUsd = useMemo(() => {
        const amounts = paymentMethods.map(m => {
            const val = parseFloat(barValues[m.id]) || 0;
            const amt = Math.round(val);
            if (m.id === 'tdc') {
                return amt + tdcSurcharge;
            }
            return amt;
        });
        return sumR(amounts);
    }, [barValues, paymentMethods, tdcSurcharge]);

    const totalPaidBs = 0; // muerta la moneda Bs

    const proportionPaid = useMemo(() => {
        if (adjustedTotal <= EPSILON) return 0;
        return totalPaidUsd / adjustedTotal;
    }, [totalPaidUsd, adjustedTotal]);

    const remainingUsd = useMemo(() => {
        return Math.max(0, Math.round(adjustedTotal - totalPaidUsd));
    }, [adjustedTotal, totalPaidUsd]);

    const remainingBs = 0;
    const changeUsd = useMemo(() => {
        return Math.max(0, Math.round(totalPaidUsd - adjustedTotal));
    }, [totalPaidUsd, adjustedTotal]);
    const changeBs = 0;

    const isPaid = adjustedTotal < EPSILON || totalPaidUsd >= (adjustedTotal - EPSILON);

    const remainingRef = useRef({ usd: remainingUsd });
    remainingRef.current = { usd: remainingUsd };

    const handleBarChange = useCallback((methodId, value) => {
        let v = value.replace(',', '.');
        if (!/^[0-9.]*$/.test(v)) return;
        const dots = v.match(/\./g);
        if (dots && dots.length > 1) return;
        setBarValues(prev => ({ ...prev, [methodId]: v }));
    }, []);

    const fillBar = useCallback((methodId, _currency, splitRemainingUsd = null) => {
        triggerHaptic && triggerHaptic();
        const curRemaining = remainingRef.current;
        let targetCOP = splitRemainingUsd != null ? splitRemainingUsd : curRemaining.usd;
        if (targetCOP > 0) {
            if (methodId === 'tdc') {
                targetCOP = Math.round(targetCOP * (1 + tdcSurchargePercent / 100));
            }
            setBarValues(prev => ({ ...prev, [methodId]: Math.round(targetCOP).toString() }));
        }
    }, [triggerHaptic, tdcSurchargePercent]);

    const _doConfirm = useCallback(async () => {
        if (submittingRef.current) return;
        submittingRef.current = true;
        try {
            triggerHaptic && triggerHaptic();
            const payments = paymentMethods
                .filter(m => parseFloat(barValues[m.id]) > 0)
                .map(m => {
                    const amount = Math.round(parseFloat(barValues[m.id]));
                    return {
                        id: crypto.randomUUID(),
                        methodId: m.id,
                        methodLabel: m.label,
                        currency: 'COP',
                        amountInput: amount,
                        amountInputCurrency: 'COP',
                        amountUsd: amount, // El RPC espera este campo heredado como COP
                        amountBs: 0,
                    };
                });

            const manualChangeGiven = changeUsdGiven ? Math.round(parseFloat(changeUsdGiven)) : changeUsd;

            await onConfirmSale(payments, {
                changeUsdGiven: Math.min(manualChangeGiven, changeUsd),
                changeBsGiven: 0,
            }, splitMeta, tdcSurchargePercent, tdcSurcharge, ivaRate);
        } finally {
            submittingRef.current = false;
        }
    }, [barValues, paymentMethods, onConfirmSale, triggerHaptic, changeUsdGiven, changeUsd, splitMeta, tdcSurchargePercent, tdcSurcharge, ivaRate]);

    const handleConfirm = useCallback(async () => {
        const anomaly = detectPaymentAnomaly({ cartTotalUsd: adjustedTotal, totalPaidUsd });
        if (anomaly) {
            setOverpayAlertData(anomaly);
            return;
        }
        await _doConfirm();
    }, [barValues, adjustedTotal, totalPaidUsd, _doConfirm]);

    const confirmOverpay = useCallback(async () => {
        setOverpayAlertData(null);
        await _doConfirm();
    }, [_doConfirm]);

    return {
        barValues, setBarValues, totalPaidUsd, totalPaidBs,
        remainingUsd, remainingBs, changeUsd, changeBs,
        isPaid, handleBarChange, fillBar, handleConfirm,
        changeUsdGiven, setChangeUsdGiven,
        changeBsGiven, setChangeBsGiven,
        confirmFiar, setConfirmFiar,
        overpayAlertData, setOverpayAlertData, confirmOverpay,
        tdcSurcharge, adjustedTotal, ivaAmount,
    };
}

export { EPSILON };
