import { useCallback } from 'react';
import { storageService } from '../utils/storageService';
import { showToast } from '../components/Toast';
import { round2, sumR } from '../utils/dinero';
import { processSaleTransaction } from '../utils/checkoutProcessor';
import { useTablesStore } from './store/useTablesStore';
import { useOrdersStore } from './store/useOrdersStore';
import { useAuthStore } from './store/authStore';
import { calculateSessionCostBreakdown, formatHoursPaid, calculateSeatCostBreakdown, calculateFullTableBreakdown, buildTableSyntheticCart } from '../utils/tableBillingEngine';
import { FinancialEngine } from '../core/FinancialEngine';

const EPSILON = 1; // 1 peso colombiano de tolerancia

export function useSalesCheckout({
    cart, cartTotalUsd, cartSubtotalUsd,
    effectiveRate, tasaCop, copEnabled, discountData, useAutoRate,
    customers, setCustomers, products,
    setProductsAfterCheckout, setSalesData,
    setCart, setShowCheckout, setShowReceipt, setSelectedCustomerId, setCartSelectedIndex,
    setShowConfetti, tableCheckoutData, setTableCheckoutData,
    playCheckout, playError, triggerHaptic, notifyLowStock,
}) {
    const handleCheckout = useCallback(async (payments, changeBreakdown) => {
        triggerHaptic && triggerHaptic();
        const opts = {
            cart, cartTotalUsd, cartTotalBs: 0, cartSubtotalUsd, payments, changeBreakdown,
            selectedCustomerId: '', customers, products, effectiveRate, tasaCop, copEnabled,
            discountData: discountData ? { ...discountData, amountBs: 0 } : null, useAutoRate: false
        };
        const result = await processSaleTransaction(opts);
        if (!result.success) {
            showToast(result.error, result.error.includes('No se pueden') ? 'warning' : 'error');
            playError();
            return;
        }
        setProductsAfterCheckout(result.updatedProducts);
        if (result.updatedCustomers) setCustomers(result.updatedCustomers);
        setSalesData(prev => [result.sale, ...prev]);
        setShowReceipt(result.sale);
        playCheckout();
        setTimeout(() => {
            setShowConfetti(true);
            notifyLowStock(result.updatedProducts);
            setCart([]);
            setShowCheckout(false);
            setSelectedCustomerId('');
            setCartSelectedIndex(-1);
        }, 50);
    }, [cart, cartTotalUsd, cartSubtotalUsd, discountData, customers, products, setProductsAfterCheckout, setCustomers, setSalesData, setShowReceipt, playCheckout, setShowConfetti, notifyLowStock, setCart, setShowCheckout, setSelectedCustomerId, setCartSelectedIndex, playError, triggerHaptic, effectiveRate, tasaCop, copEnabled]);

    const handleCheckoutWithCustomer = useCallback(async (payments, changeBreakdown, selectedCustomerId, splitMeta = null) => {
        triggerHaptic && triggerHaptic();
        const opts = {
            cart, cartTotalUsd, cartTotalBs: 0, cartSubtotalUsd, payments, changeBreakdown,
            selectedCustomerId, customers, products, effectiveRate, tasaCop, copEnabled,
            discountData: discountData ? { ...discountData, amountBs: 0 } : null, useAutoRate: false, splitMeta
        };
        const result = await processSaleTransaction(opts);
        if (!result.success) {
            showToast(result.error, result.error.includes('No se pueden') ? 'warning' : 'error');
            playError();
            return;
        }
        setProductsAfterCheckout(result.updatedProducts);
        if (result.updatedCustomers) setCustomers(result.updatedCustomers);
        setSalesData(prev => [result.sale, ...prev]);
        setShowReceipt(result.sale);
        playCheckout();
        setTimeout(() => {
            setShowConfetti(true);
            notifyLowStock(result.updatedProducts);
            setCart([]);
            setShowCheckout(false);
            setSelectedCustomerId('');
            setCartSelectedIndex(-1);
        }, 50);
    }, [cart, cartTotalUsd, cartSubtotalUsd, discountData, customers, products, setProductsAfterCheckout, setCustomers, setSalesData, setShowReceipt, playCheckout, setShowConfetti, notifyLowStock, setCart, setShowCheckout, setSelectedCustomerId, setCartSelectedIndex, playError, triggerHaptic, effectiveRate, tasaCop, copEnabled]);

    const handleTableCheckout = useCallback(async (payments, changeBreakdown, selectedCustomerId, shouldRelease = null, splitMeta = null, surchargeData = null) => {
        if (!tableCheckoutData) return;
        triggerHaptic && triggerHaptic();

        const seatId = tableCheckoutData.seatId || null;
        const snapshotSession = tableCheckoutData.session;
        const freshSession = useTablesStore.getState().activeSessions.find(s => s.id === snapshotSession?.id);
        const session = freshSession || snapshotSession;
        const seats = session?.seats || [];
        const config = useTablesStore.getState().config;
        const includeServiceCharge = !!tableCheckoutData.includeServiceCharge;
        const paidHoursOffsets = useTablesStore.getState().paidHoursOffsets || {};
        const paidRoundsOffsets = useTablesStore.getState().paidRoundsOffsets || {};
        const hoursOff = paidHoursOffsets[session?.id] || 0;
        const roundsOff = paidRoundsOffsets[session?.id] || 0;

        const resultCart = buildTableSyntheticCart({
            ...tableCheckoutData,
            session,
            hoursOffset: hoursOff,
            roundsOffset: roundsOff,
            paidHoursOffsets,
            paidRoundsOffsets
        }, config, products);
        const syntheticCart = resultCart.syntheticCart || [];

        // 1. Calcular subtotal limpio (sin propina ni recargo TDC)
        const subtotalLimpio = round2(syntheticCart.reduce((sum, item) => sum + round2((item.priceUsd || 0) * (item.qty || 1)), 0));
        const discountAmt = tableCheckoutData.discountData?.active ? round2(tableCheckoutData.discountData.amountUsd || 0) : 0;
        const subtotalDespuesDescuentos = Math.max(0, subtotalLimpio - discountAmt);

        // 2. Inyectar Servicio Voluntario si está activo
        const svcPercent = tableCheckoutData.serviceChargePercent ?? (includeServiceCharge ? 10 : 0);
        if (includeServiceCharge && svcPercent > 0) {
            const serviceChargePrice = Math.round(subtotalDespuesDescuentos * (svcPercent / 100));
            if (serviceChargePrice > 0) {
                syntheticCart.push({
                    id: crypto.randomUUID(),
                    name: `Servicio Voluntario (${svcPercent}%)`,
                    priceUsdt: serviceChargePrice,
                    priceUsd: serviceChargePrice,
                    qty: 1,
                    costUsd: 0,
                    costBs: 0,
                    category: 'servicios',
                    unit: 'servicio',
                    stock: 9999
                });
            }
        }

        // 2.5 Inyectar Propina del Personal si está activa
        const includeTip = !!tableCheckoutData.includeTip;
        const tipPercent = tableCheckoutData.tipPercent ?? (includeTip ? 8 : 0);
        if (includeTip && tipPercent > 0) {
            const tipPrice = Math.round(subtotalDespuesDescuentos * (tipPercent / 100));
            if (tipPrice > 0) {
                syntheticCart.push({
                    id: crypto.randomUUID(),
                    name: `Propina del Personal (${tipPercent}%)`,
                    priceUsdt: tipPrice,
                    priceUsd: tipPrice,
                    qty: 1,
                    costUsd: 0,
                    costBs: 0,
                    category: 'servicios',
                    unit: 'servicio',
                    stock: 9999
                });
            }
        }

        // 3. Inyectar Recargo TDC si está presente en surchargeData
        if (surchargeData && surchargeData.tdcSurcharge > 0) {
            syntheticCart.push({
                id: crypto.randomUUID(),
                name: `Recargo TDC (${surchargeData.tdcSurchargePercent}%)`,
                priceUsdt: surchargeData.tdcSurcharge,
                priceUsd: surchargeData.tdcSurcharge,
                qty: 1,
                costUsd: 0,
                costBs: 0,
                category: 'servicios',
                unit: 'servicio',
                stock: 9999
            });
        }

        const discountData = tableCheckoutData.discountData || { active: false, amountUsd: 0, amountBs: 0, type: 'percentage', value: 0 };
        const totals = FinancialEngine.buildCartTotals(syntheticCart, discountData, effectiveRate, tasaCop);
        let finalTotalWithIva = totals.totalUsd;

        const _totalPaidCheck = sumR(payments.map(p => p.amountUsd));
        const _shownTotal = round2(tableCheckoutData.grandTotal || 0);

        if (finalTotalWithIva > _totalPaidCheck && _totalPaidCheck >= _shownTotal - EPSILON) {
            finalTotalWithIva = round2(_totalPaidCheck);
        }
        if (finalTotalWithIva > _totalPaidCheck && Math.abs(finalTotalWithIva - _totalPaidCheck) <= 5) {
            finalTotalWithIva = round2(_totalPaidCheck);
        }

        const opts = {
            cart: syntheticCart,
            cartTotalUsd: finalTotalWithIva,
            cartTotalBs: 0,
            cartSubtotalUsd: totals.subtotalUsd,
            payments, changeBreakdown, selectedCustomerId, customers, products,
            effectiveRate, tasaCop, copEnabled,
            discountData: discountData ? { ...discountData, amountBs: 0 } : { active: false, amountUsd: 0, amountBs: 0, type: 'percentage', value: 0 },
            useAutoRate: false, splitMeta,
            skipStockDeduction: true,
            totalTax: totals.totalTax,
            taxBreakdown: totals.taxBreakdown
        };

        opts.tableName = seatId
            ? `${tableCheckoutData.table?.name || 'Mesa'} (${seats.find(s => s.id === seatId)?.label || 'Persona'})`
            : (tableCheckoutData.table?.name || null);
        opts.tableSessionId = session?.id || null;

        if (tableCheckoutData.session?.opened_by) {
            const cachedUsers = useAuthStore.getState().cachedUsers || [];
            let openerUser = cachedUsers.find(u => u.id === tableCheckoutData.session.opened_by) || null;
            if (!openerUser && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tableCheckoutData.session.opened_by)) {
                try {
                    const { supabaseCloud } = await import('../config/supabaseCloud');
                    const { data } = await supabaseCloud.from('staff_users').select('id, name, role').eq('id', tableCheckoutData.session.opened_by).single();
                    if (data) openerUser = data;
                } catch (_) {}
            }
            const openerRole = (openerUser?.role || openerUser?.rol || '').toUpperCase();
            if (openerRole === 'MESERO' || openerRole === 'BARRA') {
                opts.meseroId = openerUser.id;
                opts.meseroNombre = openerUser.name || openerUser.nombre || null;
            }
        }

        const result = await processSaleTransaction(opts);
        if (!result.success) {
            showToast(result.error, result.error.includes('No se pueden') ? 'warning' : 'error');
            playError();
            return { success: false };
        }

        setProductsAfterCheckout(result.updatedProducts);
        if (result.updatedCustomers) setCustomers(result.updatedCustomers);
        setSalesData(prev => [result.sale, ...prev]);

        if (tableCheckoutData.isPartial) {
            try {
                const ordersStore = useOrdersStore.getState();
                if (tableCheckoutData.currentItems && tableCheckoutData.currentItems.length > 0) {
                    for (const item of tableCheckoutData.currentItems) {
                        const originalItem = ordersStore.orderItems.find(oi => oi.id === item.id);
                        if (originalItem) {
                            const remainingQty = Number(originalItem.qty) - Number(item.qty);
                            if (remainingQty <= 0) {
                                    await ordersStore.deleteItem(item.id);
                            } else {
                                    await ordersStore.updateItemQty(item.id, remainingQty);
                            }
                        }
                    }
                }

                // Parse, append to historial, and serialize new notes
                const parseSessionNotes = (notesStr) => {
                    if (!notesStr) return { cleanNotes: '', abono: null, abonoMonto: null, historial: [] };
                    let clean = notesStr;
                    let ab = null;
                    let abM = null;
                    let hist = [];
                    if (notesStr.includes('|||ABONO:')) {
                        try { ab = JSON.parse(notesStr.split('|||ABONO:')[1].split('|||')[0].trim()); } catch (_) {}
                    }
                    if (notesStr.includes('|||ABONO_MONTO:')) {
                        try { abM = JSON.parse(notesStr.split('|||ABONO_MONTO:')[1].split('|||')[0].trim()); } catch (_) {}
                    }
                    if (notesStr.includes('|||HISTORIAL_ABONOS:')) {
                        try { hist = JSON.parse(notesStr.split('|||HISTORIAL_ABONOS:')[1].split('|||')[0].trim()); } catch (_) {}
                    }
                    clean = notesStr.split('|||')[0].trim();
                    return { cleanNotes: clean, abono: ab, abonoMonto: abM, historial: hist };
                };

                const serializeSessionNotes = (clean, ab, abM, hist) => {
                    let res = clean ? clean.trim() : '';
                    if (ab && ab.length > 0) {
                        res += ` |||ABONO:${JSON.stringify(ab)}`;
                    }
                    if (abM) {
                        res += ` |||ABONO_MONTO:${JSON.stringify(abM)}`;
                    }
                    if (hist && hist.length > 0) {
                        res += ` |||HISTORIAL_ABONOS:${JSON.stringify(hist)}`;
                    }
                    return res.trim() || null;
                };

                const session = tableCheckoutData.session;
                const { cleanNotes, historial } = parseSessionNotes(session.notes);
                const payMethod = payments.map(p => (p.methodId || 'EFECTIVO').toUpperCase()).join('+') || 'EFECTIVO';
                const newHistorial = [...historial, {
                    amount: Number(finalTotalWithIva),
                    method: payMethod,
                    date: new Date().toISOString()
                }];
                const newNotes = serializeSessionNotes(cleanNotes, null, null, newHistorial);

                await useTablesStore.getState().updateSessionMetadata(session.id, session.client_name, session.guest_count, session.client_id, newNotes);

                // Revert session status to ACTIVE since it remains open!
                const { supabaseCloud } = await import('../config/supabaseCloud');
                await supabaseCloud.from('table_sessions').update({ status: 'ACTIVE' }).eq('id', session.id);

                // Sync tables and sessions
                await useTablesStore.getState().syncTablesAndSessions();

                showToast('Abono registrado y comanda actualizada', 'success');
            } catch (error) {
                console.error('[handleTableCheckout] Error updating items for partial checkout:', error);
                showToast('Abono procesado, pero falló al actualizar la comanda de la mesa.', 'warning');
            }

            setShowReceipt(result.sale);
            playCheckout();
            setTimeout(() => {
                setShowConfetti(true);
                notifyLowStock(result.updatedProducts);
                setSelectedCustomerId('');
                setTableCheckoutData(null);
            }, 50);
            return { success: true };
        }

        if (seatId && seats.length > 0) {
            try {
                const updatedSeats = seats.map(s => s.id === seatId ? { ...s, paid: true } : s);
                await useTablesStore.getState().updateSessionSeats(session.id, updatedSeats);
                const allPaid = updatedSeats.every(s => s.paid);
                if (!allPaid) {
                    setTableCheckoutData(prev => prev ? ({
                        ...prev,
                        session: { ...prev.session, seats: updatedSeats },
                        seatId: undefined,
                    }) : null);
                    showToast(`${seats.find(s => s.id === seatId)?.label || 'Persona'} pagado`, 'success');
                }
            } catch (e) {
                showToast("Venta completa, pero falló al marcar asiento como pagado.", "warning");
            }
            setShowReceipt(result.sale);
            playCheckout();
            setTimeout(() => {
                setShowConfetti(true);
                notifyLowStock(result.updatedProducts);
                setSelectedCustomerId('');
            }, 50);
            return;
        }

        if (shouldRelease !== null) {
            try {
                if (shouldRelease) {
                    await useTablesStore.getState().closeSession(tableCheckoutData.session.id);
                } else {
                    await useTablesStore.getState().resetSessionAfterPayment(tableCheckoutData.session.id);
                    await useOrdersStore.getState().cancelOrderBySessionId(tableCheckoutData.session.id);
                }
            } catch (error) {
                showToast("Venta completa, pero falló al actualizar la mesa.", "warning");
            }
            setTableCheckoutData(null);
        }

        setShowReceipt(result.sale);
        playCheckout();
        setTimeout(() => {
            setShowConfetti(true);
            notifyLowStock(result.updatedProducts);
            setSelectedCustomerId('');
        }, 50);
    }, [tableCheckoutData, customers, products, setProductsAfterCheckout, setCustomers, setSalesData, setShowReceipt, setTableCheckoutData, setSelectedCustomerId, setShowConfetti, playCheckout, playError, notifyLowStock, triggerHaptic, effectiveRate, tasaCop, copEnabled]);

    const handleCreateCustomer = useCallback(async (name, documentId, phone) => {
        const newCustomer = { id: crypto.randomUUID(), name, documentId: documentId || '', phone: phone || '', deuda: 0, favor: 0, createdAt: new Date().toISOString() };
        const updated = [...customers, newCustomer];
        setCustomers(updated);
        await storageService.setItem('bodega_customers_v1', updated);
        return newCustomer;
    }, [customers, setCustomers]);

    const handleAddCustomAmount = useCallback((amount, _currency, addToCart, setShowCustomAmountModal) => {
        const amountCop = round2(amount);
        if (amountCop <= 0) return;
        addToCart({ id: crypto.randomUUID(), name: 'Venta Libre', priceUsdt: amountCop, exactBs: 0, costBs: 0, costUsd: 0, unit: 'unidad', category: 'otros', stock: 9999 });
        setShowCustomAmountModal(false);
    }, []);

    return { handleCheckoutWithCustomer, handleTableCheckout, handleCreateCustomer, handleAddCustomAmount };
}
