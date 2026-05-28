import { useCallback } from 'react';
import { storageService } from '../utils/storageService';
import { showToast } from '../components/Toast';
import { round2, sumR } from '../utils/dinero';
import { processSaleTransaction } from '../utils/checkoutProcessor';
import { useTablesStore } from './store/useTablesStore';
import { useOrdersStore } from './store/useOrdersStore';
import { useAuthStore } from './store/authStore';
import { calculateSessionCostBreakdown, formatHoursPaid, calculateSeatCostBreakdown, calculateFullTableBreakdown } from '../utils/tableBillingEngine';

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
            selectedCustomerId: '', customers, products, effectiveRate: 1, tasaCop: 1, copEnabled: true,
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
        setShowConfetti(true);
        notifyLowStock(result.updatedProducts);
        setCart([]);
        setShowCheckout(false);
        setSelectedCustomerId('');
        setCartSelectedIndex(-1);
    }, [cart, cartTotalUsd, cartSubtotalUsd, discountData, customers, products, setProductsAfterCheckout, setCustomers, setSalesData, setShowReceipt, playCheckout, setShowConfetti, notifyLowStock, setCart, setShowCheckout, setSelectedCustomerId, setCartSelectedIndex, playError, triggerHaptic]);

    const handleCheckoutWithCustomer = useCallback(async (payments, changeBreakdown, selectedCustomerId, splitMeta = null) => {
        triggerHaptic && triggerHaptic();
        const opts = {
            cart, cartTotalUsd, cartTotalBs: 0, cartSubtotalUsd, payments, changeBreakdown,
            selectedCustomerId, customers, products, effectiveRate: 1, tasaCop: 1, copEnabled: true,
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
        setShowConfetti(true);
        notifyLowStock(result.updatedProducts);
        setCart([]);
        setShowCheckout(false);
        setSelectedCustomerId('');
        setCartSelectedIndex(-1);
    }, [cart, cartTotalUsd, cartSubtotalUsd, discountData, customers, products, setProductsAfterCheckout, setCustomers, setSalesData, setShowReceipt, playCheckout, setShowConfetti, notifyLowStock, setCart, setShowCheckout, setSelectedCustomerId, setCartSelectedIndex, playError, triggerHaptic]);

    const handleTableCheckout = useCallback(async (payments, changeBreakdown, selectedCustomerId, shouldRelease = null, splitMeta = null) => {
        if (!tableCheckoutData) return;
        triggerHaptic && triggerHaptic();

        const seatId = tableCheckoutData.seatId || null;
        const snapshotSession = tableCheckoutData.session;
        const freshSession = useTablesStore.getState().activeSessions.find(s => s.id === snapshotSession?.id);
        const session = freshSession || snapshotSession;
        const seats = session?.seats || [];
        const config = useTablesStore.getState().config;
        const paidHoursOffsets = useTablesStore.getState().paidHoursOffsets || {};
        const paidRoundsOffsets = useTablesStore.getState().paidRoundsOffsets || {};
        const hoursOff = paidHoursOffsets[session?.id] || 0;
        const roundsOff = paidRoundsOffsets[session?.id] || 0;

        const syntheticCart = [];

        if (seatId && seats.length > 0) {
            // ═══ PER-SEAT CHECKOUT ═══
            const seat = seats.find(s => s.id === seatId);
            if (!seat) { showToast('Asiento no encontrado', 'error'); return; }

            const seatTimeCost = calculateSeatCostBreakdown(seat, tableCheckoutData.elapsed, config);
            const tableName = `${tableCheckoutData.table?.name || 'Mesa'} (${seat.label || 'Persona'})`;

            if (seatTimeCost.pinaCost > 0) {
                const pinaQty = seat.timeCharges
                    ? seat.timeCharges.filter(tc => tc.type === 'pina').reduce((s, tc) => s + (tc.amount || 1), 0)
                    : (seat.pinas || 1);
                syntheticCart.push({
                    id: crypto.randomUUID(),
                    name: `Piña ${tableName}`,
                    priceUsdt: round2(config.pricePina || 0), priceUsd: round2(config.pricePina || 0),
                    qty: pinaQty, costUsd: 0, costBs: 0, category: 'servicios', unit: 'servicio', stock: 9999
                });
            }
            if (seatTimeCost.hourCost > 0) {
                const horasQty = seat.timeCharges
                    ? seat.timeCharges.filter(tc => tc.type === 'hora').reduce((s, tc) => s + (tc.amount || 0), 0)
                    : (seat.hoursPaid || 0);
                syntheticCart.push({
                    id: crypto.randomUUID(),
                    name: `Tiempo ${tableName} (${formatHoursPaid(horasQty)})`,
                    priceUsdt: round2(seatTimeCost.hourCost), priceUsd: round2(seatTimeCost.hourCost),
                    qty: 1, costUsd: 0, costBs: 0, category: 'servicios', unit: 'servicio', stock: 9999
                });
            }

            const seatItems = (tableCheckoutData.currentItems || []).filter(i => i.seat_id === seatId);
            seatItems.forEach(item => {
                const p = products.find(p => p.id === item.product_id);
                syntheticCart.push(p
                    ? { ...p, priceUsdt: Number(item.unit_price_usd), priceUsd: Number(item.unit_price_usd), qty: Number(item.qty), costBs: 0, costUsd: p.costUsd || 0, exactBs: 0 }
                    : { id: item.product_id, name: item.product_name || 'Producto', priceUsdt: Number(item.unit_price_usd), priceUsd: Number(item.unit_price_usd), qty: Number(item.qty), costBs: 0, costUsd: 0, unit: 'unidad', category: 'otros', stock: 9999 }
                );
            });

            const frozenDivisor = tableCheckoutData.frozenDivisor || null;
            const isTimeFree = tableCheckoutData.table?.type === 'NORMAL';
            const fullBreakdown = calculateFullTableBreakdown(session, seats, tableCheckoutData.elapsed, config, tableCheckoutData.currentItems || [], null, frozenDivisor, isTimeFree, hoursOff, roundsOff);
            if (fullBreakdown) {
                const seatBd = fullBreakdown.seats.find(s => s.seat.id === seatId);
                if (seatBd && seatBd.sharedPortion > 0) {
                    syntheticCart.push({
                        id: crypto.randomUUID(),
                        name: `Compartido ${tableCheckoutData.table?.name || 'Mesa'} (÷${fullBreakdown.seats.filter(s => !s.seat.paid).length})`,
                        priceUsdt: round2(seatBd.sharedPortion), priceUsd: round2(seatBd.sharedPortion),
                        qty: 1, costUsd: 0, costBs: 0, category: 'servicios', unit: 'servicio', stock: 9999
                    });
                }
            }
        } else if (!seatId && seats.length > 0) {
            // ═══ COBRAR TODO CON CUANTAS DIVIDIDAS ═══
            const frozenDivisor = tableCheckoutData.frozenDivisor || null;
            const isTimeFreeAll = tableCheckoutData.table?.type === 'NORMAL';
            const fullBreakdown = calculateFullTableBreakdown(session, seats, tableCheckoutData.elapsed, config, tableCheckoutData.currentItems || [], null, frozenDivisor, isTimeFreeAll, hoursOff, roundsOff);
            if (fullBreakdown) {
                const unpaidSeatBds = fullBreakdown.seats.filter(sb => !sb.seat.paid);
                const divisorLabel = unpaidSeatBds.length;
                unpaidSeatBds.forEach(seatBd => {
                    const seat = seatBd.seat;
                    const seatLabel = `${tableCheckoutData.table?.name || 'Mesa'} (${seat.label || 'Persona'})`;
                    if (seatBd.timeCost.pinaCost > 0) {
                        const pinaQty = seat.timeCharges
                            ? seat.timeCharges.filter(tc => tc.type === 'pina').reduce((s, tc) => s + (tc.amount || 1), 0)
                            : (seat.pinas || 1);
                        syntheticCart.push({ id: crypto.randomUUID(), name: `Piña ${seatLabel}`, priceUsdt: round2(config.pricePina || 0), priceUsd: round2(config.pricePina || 0), qty: pinaQty, costUsd: 0, costBs: 0, category: 'servicios', unit: 'servicio', stock: 9999 });
                    }
                    if (seatBd.timeCost.hourCost > 0) {
                        const horasQty = seat.timeCharges
                            ? seat.timeCharges.filter(tc => tc.type === 'hora').reduce((s, tc) => s + (tc.amount || 0), 0)
                            : (seat.hoursPaid || 0);
                        syntheticCart.push({ id: crypto.randomUUID(), name: `Tiempo ${seatLabel} (${formatHoursPaid(horasQty)})`, priceUsdt: round2(seatBd.timeCost.hourCost), priceUsd: round2(seatBd.timeCost.hourCost), qty: 1, costUsd: 0, costBs: 0, category: 'servicios', unit: 'servicio', stock: 9999 });
                    }
                    seatBd.items.forEach(item => {
                        const p = products.find(p => p.id === item.product_id);
                        syntheticCart.push(p
                            ? { ...p, priceUsdt: Number(item.unit_price_usd), priceUsd: Number(item.unit_price_usd), qty: Number(item.qty), costBs: 0, costUsd: p.costUsd || 0, exactBs: 0 }
                            : { id: item.product_id, name: item.product_name || 'Producto', priceUsdt: Number(item.unit_price_usd), priceUsd: Number(item.unit_price_usd), qty: Number(item.qty), costBs: 0, costUsd: 0, unit: 'unidad', category: 'otros', stock: 9999 }
                        );
                    });
                    if (seatBd.sharedPortion > 0) {
                        syntheticCart.push({ id: crypto.randomUUID(), name: `Compartido ${tableCheckoutData.table?.name || 'Mesa'} (÷${divisorLabel})`, priceUsdt: round2(seatBd.sharedPortion), priceUsd: round2(seatBd.sharedPortion), qty: 1, costUsd: 0, costBs: 0, category: 'servicios', unit: 'servicio', stock: 9999 });
                    }
                });
            }
        } else {
            // ═══ CLASSIC (FULL TABLE) CHECKOUT ═══
            const breakdown = calculateSessionCostBreakdown(tableCheckoutData.elapsed, session?.game_mode, config, session?.hours_paid, session?.extended_times, hoursOff, roundsOff);

            if (breakdown.pinaCost > 0) {
                const pinaCount = session.game_mode === 'PINA' ? 1 + (Number(session.extended_times) || 0) : Number(session.extended_times) || 0;
                const billableRounds = Math.max(0, pinaCount - roundsOff);
                syntheticCart.push({
                    id: crypto.randomUUID(),
                    name: `Piña ${tableCheckoutData.table.name}`,
                    priceUsdt: round2(config.pricePina || 0), priceUsd: round2(config.pricePina || 0),
                    qty: billableRounds, costUsd: 0, costBs: 0, category: 'servicios', unit: 'servicio', stock: 9999
                });
            }
            if (breakdown.hourCost > 0) {
                const billableHours = Math.max(0, (Number(session.hours_paid) || 0) - hoursOff);
                syntheticCart.push({
                    id: crypto.randomUUID(),
                    name: `Tiempo ${tableCheckoutData.table.name} (${formatHoursPaid(billableHours)})`,
                    priceUsdt: round2(breakdown.hourCost), priceUsd: round2(breakdown.hourCost),
                    qty: 1, costUsd: 0, costBs: 0, category: 'servicios', unit: 'servicio', stock: 9999
                });
            }
            if (tableCheckoutData.currentItems?.length > 0) {
                tableCheckoutData.currentItems.forEach(item => {
                    const p = products.find(p => p.id === item.product_id);
                    if (p) {
                        syntheticCart.push({ ...p, id: p.id, priceUsdt: Number(item.unit_price_usd), priceUsd: Number(item.unit_price_usd), qty: Number(item.qty), costBs: 0, costUsd: p.costUsd || 0, exactBs: 0 });
                    } else {
                        syntheticCart.push({
                            id: item.product_id, _originalId: item.product_id,
                            name: item.product_name || 'Producto (sin catálogo)',
                            priceUsdt: Number(item.unit_price_usd), priceUsd: Number(item.unit_price_usd),
                            qty: Number(item.qty), costBs: 0, costUsd: 0, unit: 'unidad', category: 'otros', stock: 9999
                        });
                    }
                });
            }
        }

        const recalcCartTotal = round2(syntheticCart.reduce((sum, item) => sum + round2((item.priceUsd || 0) * (item.qty || 1)), 0));
        const discountAmt = tableCheckoutData.discountData?.active ? round2(tableCheckoutData.discountData.amountUsd || 0) : 0;
        let effectiveCartTotal = round2(Math.max(0, recalcCartTotal - discountAmt));

        const _totalPaidCheck = sumR(payments.map(p => p.amountUsd));
        const _shownTotal = round2(tableCheckoutData.grandTotal || 0);

        if (effectiveCartTotal > _totalPaidCheck && _totalPaidCheck >= _shownTotal - EPSILON) {
            effectiveCartTotal = round2(_totalPaidCheck);
        }
        if (effectiveCartTotal > _totalPaidCheck && Math.abs(effectiveCartTotal - _totalPaidCheck) <= 5) {
            effectiveCartTotal = round2(_totalPaidCheck);
        }

        const opts = {
            cart: syntheticCart,
            cartTotalUsd: effectiveCartTotal,
            cartTotalBs: 0,
            cartSubtotalUsd: effectiveCartTotal,
            payments, changeBreakdown, selectedCustomerId, customers, products,
            effectiveRate: 1, tasaCop: 1, copEnabled: true,
            discountData: tableCheckoutData.discountData ? { ...tableCheckoutData.discountData, amountBs: 0 } : { active: false, amountUsd: 0, amountBs: 0, type: 'percentage', value: 0 },
            useAutoRate: false, splitMeta,
            skipStockDeduction: true
        };

        opts.tableName = seatId
            ? `${tableCheckoutData.table?.name || 'Mesa'} (${seats.find(s => s.id === seatId)?.label || 'Persona'})`
            : (tableCheckoutData.table?.name || null);

        if (tableCheckoutData.session?.opened_by) {
            const cachedUsers = useAuthStore.getState().cachedUsers || [];
            let openerUser = cachedUsers.find(u => u.id === tableCheckoutData.session.opened_by) || null;
            if (!openerUser) {
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
            setShowConfetti(true);
            notifyLowStock(result.updatedProducts);
            setSelectedCustomerId('');
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
        setShowConfetti(true);
        notifyLowStock(result.updatedProducts);
        setSelectedCustomerId('');
    }, [tableCheckoutData, customers, products, setProductsAfterCheckout, setCustomers, setSalesData, setShowReceipt, setTableCheckoutData, setSelectedCustomerId, setShowConfetti, playCheckout, playError, notifyLowStock, triggerHaptic]);

    const handleCreateCustomer = useCallback(async (name, documentId, phone) => {
        const newCustomer = { id: crypto.randomUUID(), name, documentId: documentId || '', phone: phone || '', deuda: 0, favor: 0, createdAt: new Date().toISOString() };
        const updated = [...customers, newCustomer];
        setCustomers(updated);
        await storageService.setItem('pool_imperial_customers_v1', updated);
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
