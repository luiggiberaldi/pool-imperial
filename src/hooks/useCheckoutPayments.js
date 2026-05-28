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

export function useCheckoutPayments({ paymentMethods, effectiveRate, tasaCop, cartTotalUsd, onConfirmSale, triggerHaptic, splitMeta = null }) {
    const [barValues, setBarValues] = useState({});
    const [changeUsdGiven, setChangeUsdGiven] = useState('');
    const [changeBsGiven, setChangeBsGiven] = useState(''); // Se mantiene por firma pero siempre es vacío
    const [confirmFiar, setConfirmFiar] = useState(false);
    const [overpayAlertData, setOverpayAlertData] = useState(null);
    const submittingRef = useRef(false);

    // En Pool Imperial, cartTotalUsd almacena en realidad el total en COP.
    // Todos los inputs en barValues representan COP.
    const totalPaidUsd = useMemo(() => {
        const amounts = paymentMethods.map(m => {
            const val = parseFloat(barValues[m.id]) || 0;
            return Math.round(val);
        });
        return sumR(amounts);
    }, [barValues, paymentMethods]);

    const totalPaidBs = 0; // muerta la moneda Bs

    const proportionPaid = useMemo(() => {
        if (cartTotalUsd <= EPSILON) return 0;
        return totalPaidUsd / cartTotalUsd;
    }, [totalPaidUsd, cartTotalUsd]);

    const remainingUsd = useMemo(() => {
        return Math.max(0, Math.round(cartTotalUsd - totalPaidUsd));
    }, [cartTotalUsd, totalPaidUsd]);

    const remainingBs = 0;
    const changeUsd = useMemo(() => {
        return Math.max(0, Math.round(totalPaidUsd - cartTotalUsd));
    }, [totalPaidUsd, cartTotalUsd]);
    const changeBs = 0;

    const isPaid = cartTotalUsd < EPSILON || totalPaidUsd >= (cartTotalUsd - EPSILON);

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
        const targetCOP = splitRemainingUsd != null ? splitRemainingUsd : curRemaining.usd;
        if (targetCOP > 0) {
            setBarValues(prev => ({ ...prev, [methodId]: Math.round(targetCOP).toString() }));
        }
    }, [triggerHaptic]);

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
            }, splitMeta);
        } finally {
            submittingRef.current = false;
        }
    }, [barValues, paymentMethods, onConfirmSale, triggerHaptic, changeUsdGiven, changeUsd, splitMeta]);

    const handleConfirm = useCallback(async () => {
        const anomaly = detectPaymentAnomaly({ cartTotalUsd, totalPaidUsd });
        if (anomaly) {
            setOverpayAlertData(anomaly);
            return;
        }
        await _doConfirm();
    }, [barValues, cartTotalUsd, totalPaidUsd, _doConfirm]);

    const confirmOverpay = useCallback(async () => {
        setOverpayAlertData(null);
        await _doConfirm();
    }, [_doConfirm]);

    return {
        barValues, totalPaidUsd, totalPaidBs,
        remainingUsd, remainingBs, changeUsd, changeBs,
        isPaid, handleBarChange, fillBar, handleConfirm,
        changeUsdGiven, setChangeUsdGiven,
        changeBsGiven, setChangeBsGiven,
        confirmFiar, setConfirmFiar,
        overpayAlertData, setOverpayAlertData, confirmOverpay,
    };
}

export { EPSILON };
