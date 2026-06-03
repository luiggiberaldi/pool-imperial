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

export function useCheckoutPayments({ paymentMethods, effectiveRate, tasaCop, cartTotalUsd, onConfirmSale, triggerHaptic, splitMeta = null, tdcSurchargePercent: initialSurchargePercent = 5, totalTax = 0, tableContext = null }) {
    const [barValues, setBarValues] = useState({});
    const [changeUsdGiven, setChangeUsdGiven] = useState('');
    const [changeBsGiven, setChangeBsGiven] = useState(''); // Se mantiene por firma pero siempre es vacío
    const [confirmFiar, setConfirmFiar] = useState(false);
    const [overpayAlertData, setOverpayAlertData] = useState(null);
    const [tdcSurchargePercent, setTdcSurchargePercent] = useState(initialSurchargePercent);
    const [applyTdcSurcharge, setApplyTdcSurcharge] = useState(false);
    const [tdcSurcharge, setTdcSurcharge] = useState(0);
    const submittingRef = useRef(false);

    const ivaAmount = totalTax || 0;

    const adjustedTotal = useMemo(() => {
        return cartTotalUsd + tdcSurcharge;
    }, [cartTotalUsd, tdcSurcharge]);

    // En Pool Imperial, cartTotalUsd almacena en realidad el total en COP.
    // Los inputs de métodos en USD se multiplican por la tasa.
    const totalPaidUsd = useMemo(() => {
        const amounts = paymentMethods.map(m => {
            const val = parseFloat(barValues[m.id]) || 0;
            const amt = m.currency === 'USD' ? Math.round(val * tasaCop) : Math.round(val);
            return amt;
        });
        return sumR(amounts);
    }, [barValues, paymentMethods, tasaCop]);

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

    const hasUnappliedTdcSurcharge = useMemo(() => {
        return (parseFloat(barValues['tdc']) > 0) && (tdcSurchargePercent > 0) && !applyTdcSurcharge;
    }, [barValues, tdcSurchargePercent, applyTdcSurcharge]);

    const isPaid = (adjustedTotal < EPSILON || totalPaidUsd >= (adjustedTotal - EPSILON)) && !hasUnappliedTdcSurcharge;

    const remainingRef = useRef({ usd: remainingUsd });
    remainingRef.current = { usd: remainingUsd };

    const toggleTdcSurcharge = useCallback(() => {
        triggerHaptic && triggerHaptic();
        if (applyTdcSurcharge) {
            // Remove surcharge
            const currentTdcVal = parseFloat(barValues['tdc']) || 0;
            const newTdcVal = Math.max(0, Math.round(currentTdcVal - tdcSurcharge));
            setBarValues(prev => ({ ...prev, tdc: newTdcVal > 0 ? newTdcVal.toString() : '' }));
            setTdcSurcharge(0);
            setApplyTdcSurcharge(false);
        } else {
            // Add surcharge
            const currentTdcVal = parseFloat(barValues['tdc']) || 0;
            if (currentTdcVal > 0) {
                const surcharge = Math.round(currentTdcVal * (tdcSurchargePercent / 100));
                const newTdcVal = Math.round(currentTdcVal + surcharge);
                setTdcSurcharge(surcharge);
                setBarValues(prev => ({ ...prev, tdc: newTdcVal.toString() }));
                setApplyTdcSurcharge(true);
            }
        }
    }, [applyTdcSurcharge, barValues, tdcSurcharge, tdcSurchargePercent, triggerHaptic]);

    const handleSurchargePercentChange = useCallback((newPercent) => {
        setTdcSurchargePercent(newPercent);
        if (applyTdcSurcharge) {
            const currentTdcVal = parseFloat(barValues['tdc']) || 0;
            const netAmount = Math.max(0, Math.round(currentTdcVal - tdcSurcharge));
            const newSurcharge = Math.round(netAmount * (newPercent / 100));
            const newTdcVal = Math.round(netAmount + newSurcharge);
            setTdcSurcharge(newSurcharge);
            setBarValues(prev => ({ ...prev, tdc: newTdcVal.toString() }));
        }
    }, [applyTdcSurcharge, barValues, tdcSurcharge]);

    const handleBarChange = useCallback((methodId, value) => {
        let v = value.replace(',', '.');
        if (!/^[0-9.]*$/.test(v)) return;
        const dots = v.match(/\./g);
        if (dots && dots.length > 1) return;
        setBarValues(prev => ({ ...prev, [methodId]: v }));
        if (methodId === 'tdc') {
            setApplyTdcSurcharge(false);
            setTdcSurcharge(0);
        }
    }, []);

    const fillBar = useCallback((methodId, currency, splitRemainingUsd = null) => {
        triggerHaptic && triggerHaptic();
        const curRemaining = remainingRef.current;
        let targetCOP = splitRemainingUsd != null ? splitRemainingUsd : curRemaining.usd;
        if (targetCOP > 0) {
            const isUsd = currency === 'USD';
            setBarValues(prev => {
                const currentValue = parseFloat(prev[methodId]) || 0;
                const value = isUsd 
                    ? (currentValue + (targetCOP / (tasaCop || 4150))).toFixed(2) 
                    : Math.round(currentValue + targetCOP).toString();
                return { ...prev, [methodId]: value };
            });
            if (methodId === 'tdc') {
                setApplyTdcSurcharge(false);
                setTdcSurcharge(0);
            }
        }
    }, [triggerHaptic, tasaCop]);

    const _doConfirm = useCallback(async () => {
        if (submittingRef.current) return;
        submittingRef.current = true;
        try {
            triggerHaptic && triggerHaptic();
            const payments = paymentMethods
                .filter(m => parseFloat(barValues[m.id]) > 0)
                .map(m => {
                    const inputValue = parseFloat(barValues[m.id]);
                    const isUsd = m.currency === 'USD';
                    const convertedCOP = isUsd ? Math.round(inputValue * tasaCop) : Math.round(inputValue);
                    return {
                        id: crypto.randomUUID(),
                        methodId: m.id,
                        methodLabel: m.label,
                        currency: 'COP', // Seguir enviando COP para no romper el RPC
                        amountInput: inputValue,
                        amountInputCurrency: m.currency || 'COP',
                        amountUsd: convertedCOP, // El RPC espera este campo heredado como COP
                        amountOriginal: inputValue,
                        amountOriginalCurrency: m.currency || 'COP',
                        amountBs: 0,
                    };
                });

            const manualChangeGiven = changeUsdGiven ? Math.round(parseFloat(changeUsdGiven)) : changeUsd;

            await onConfirmSale(payments, {
                changeUsdGiven: Math.min(manualChangeGiven, changeUsd),
                changeBsGiven: 0,
            }, splitMeta, tdcSurchargePercent, tdcSurcharge, totalTax);
        } finally {
            submittingRef.current = false;
        }
    }, [barValues, paymentMethods, onConfirmSale, triggerHaptic, changeUsdGiven, changeUsd, splitMeta, tdcSurchargePercent, tdcSurcharge, totalTax, tasaCop]);

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
        applyTdcSurcharge, setApplyTdcSurcharge,
        tdcSurchargePercent, setTdcSurchargePercent,
        toggleTdcSurcharge, handleSurchargePercentChange,
        hasUnappliedTdcSurcharge,
    };
}

export { EPSILON };
