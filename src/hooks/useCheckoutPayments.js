import { useState, useCallback, useMemo, useRef } from 'react';
import { round2, sumR, subR } from '../utils/dinero';

const EPSILON_COP = 1; // Tolerancia base cuando se paga solo en COP
// Cuando hay pagos en USD, la tolerancia sube a 1 centavo USD = tasaCop/100 COP
// (máxima diferencia posible al redondear 2 decimales USD × tasa)

/**
 * Detecta si el cajero ingresó un monto absurdamente alto en COP.
 */
function detectPaymentAnomaly({ cartTotalUsd, totalPaidUsd }) {
    if (cartTotalUsd <= EPSILON_COP) return null;

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
    const [isSubmitting, setIsSubmitting] = useState(false);
    const submittingRef = useRef(false);

    const ivaAmount = totalTax || 0;

    // ── Detectar abonos previos de la sesión de mesa ──
    const priorAbonoTotal = useMemo(() => {
        if (!tableContext || tableContext.isPartial) return 0; // En abonos parciales no hay previos
        const notes = tableContext.session?.notes || '';
        if (!notes.includes('|||HISTORIAL_ABONOS:')) return 0;
        try {
            const hist = JSON.parse(notes.split('|||HISTORIAL_ABONOS:')[1].split('|||')[0].trim());
            if (!Array.isArray(hist) || hist.length === 0) return 0;
            return hist.reduce((sum, h) => sum + (Number(h.netAmount ?? h.amount) || 0), 0);
        } catch (_) { return 0; }
    }, [tableContext]);

    // ── Historial de abonos previos (para inyectar en payments al confirmar) ──
    const priorAbonoHistory = useMemo(() => {
        if (priorAbonoTotal <= 0) return [];
        const notes = tableContext?.session?.notes || '';
        try {
            const hist = JSON.parse(notes.split('|||HISTORIAL_ABONOS:')[1].split('|||')[0].trim());
            return Array.isArray(hist) ? hist : [];
        } catch (_) { return []; }
    }, [priorAbonoTotal, tableContext]);

    const adjustedTotal = useMemo(() => {
        return cartTotalUsd + tdcSurcharge;
    }, [cartTotalUsd, tdcSurcharge]);

    // Neto real a cobrar en este cierre (descontando abonos previos)
    const netTotalToPay = useMemo(() => {
        return Math.max(0, adjustedTotal - priorAbonoTotal);
    }, [adjustedTotal, priorAbonoTotal]);

    // En Pool Imperial, cartTotalUsd almacena en realidad el total en COP.
    // Los inputs de métodos en USD se multiplican por la tasa.
    // Para USD: usar Math.floor para no inflar el monto pagado más allá del billete.
    const totalPaidUsd = useMemo(() => {
        const amounts = paymentMethods.map(m => {
            const val = parseFloat(barValues[m.id]) || 0;
            const amt = m.currency === 'USD' ? Math.floor(val * tasaCop) : Math.round(val);
            return amt;
        });
        return sumR(amounts);
    }, [barValues, paymentMethods, tasaCop]);

    // Epsilon dinámico: si hay algún método USD activo, tolerar hasta 1 centavo USD
    // para absorber el redondeo inevitable entre COP y USD.
    const epsilon = useMemo(() => {
        const hasUsd = paymentMethods.some(m => m.currency === 'USD' && parseFloat(barValues[m.id]) > 0);
        return hasUsd ? Math.ceil((tasaCop || 4150) / 100) : EPSILON_COP;
    }, [paymentMethods, barValues, tasaCop]);

    const totalPaidBs = 0; // muerta la moneda Bs

    const proportionPaid = useMemo(() => {
        if (adjustedTotal <= EPSILON_COP) return 0;
        return totalPaidUsd / adjustedTotal;
    }, [totalPaidUsd, adjustedTotal]);

    // remainingUsd: cuánto falta por cobrar. Se considera 0 si la diferencia
    // está dentro del epsilon (brecha de redondeo USD↔COP aceptable).
    const remainingUsd = useMemo(() => {
        const diff = netTotalToPay - totalPaidUsd;
        return diff > epsilon ? Math.round(diff) : 0;
    }, [netTotalToPay, totalPaidUsd, epsilon]);

    const remainingBs = 0;
    // changeUsd: vuelto. Solo se muestra si el pago supera el total real (no el epsilon).
    const changeUsd = useMemo(() => {
        return Math.max(0, Math.round(totalPaidUsd - netTotalToPay));
    }, [totalPaidUsd, netTotalToPay]);
    const changeBs = 0;

    const hasUnappliedTdcSurcharge = useMemo(() => {
        return (parseFloat(barValues['tdc']) > 0) && (tdcSurchargePercent > 0) && !applyTdcSurcharge;
    }, [barValues, tdcSurchargePercent, applyTdcSurcharge]);

    // isPaid: se permite una brecha de hasta epsilon COP (1 centavo USD en pagos mixtos)
    const isPaid = (netTotalToPay < EPSILON_COP || totalPaidUsd >= (netTotalToPay - epsilon)) && !hasUnappliedTdcSurcharge;

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
                // USD: redondeo normal a 2 decimales.
                // La brecha restante (< 1 centavo USD ≈ 42 COP) queda absorbida por
                // el epsilon dinámico, así el sistema marca la venta como pagada
                // sin mostrar "vuelto" ni "falta por cobrar".
                const rawUsd = currentValue + (targetCOP / (tasaCop || 4150));
                const value = isUsd 
                    ? round2(rawUsd).toFixed(2)
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
        setIsSubmitting(true);
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

            // Inyectar abonos previos con flag isAbonoPrevio antes de confirmar
            const priorPayments = priorAbonoHistory.map(h => ({
                id: crypto.randomUUID(),
                methodId: (h.method || 'efectivo').toLowerCase(),
                methodLabel: `${(h.method || 'Efectivo')} (Abono)`,
                currency: 'COP',
                amountInput: Number(h.amount),
                amountInputCurrency: 'COP',
                amountUsd: Number(h.amount),
                amountOriginal: Number(h.amount),
                amountOriginalCurrency: 'COP',
                amountBs: 0,
                isAbonoPrevio: true,
            }));

            const allPayments = [...priorPayments, ...payments];

            const manualChangeGiven = changeUsdGiven ? Math.round(parseFloat(changeUsdGiven)) : changeUsd;

            await onConfirmSale(allPayments, {
                changeUsdGiven: Math.min(manualChangeGiven, changeUsd),
                changeBsGiven: 0,
            }, splitMeta, tdcSurchargePercent, tdcSurcharge, totalTax);
        } finally {
            submittingRef.current = false;
            setIsSubmitting(false);
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
        tdcSurcharge, adjustedTotal, netTotalToPay, priorAbonoTotal, ivaAmount,
        applyTdcSurcharge, setApplyTdcSurcharge,
        tdcSurchargePercent, setTdcSurchargePercent,
        toggleTdcSurcharge, handleSurchargePercentChange,
        hasUnappliedTdcSurcharge,
        isSubmitting,
    };
}

export { EPSILON_COP as EPSILON };
