import { useTablesStore } from '../hooks/store/useTablesStore';
import { round2 } from './dinero';
import { getServerNow } from './serverClock';
import { getFrozenTimeChargeProductId } from './tableTransferEngine';

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

export function calculateElapsedTime(startTimeISO) {
    const start = new Date(startTimeISO);
    const now = new Date(getServerNow());
    const diffMs = now - start;
    const diffMinutes = Math.floor(diffMs / 60000);
    return diffMinutes;
}

/**
 * Elapsed de una sesión en minutos, CONSCIENTE de pausa. Fuente de verdad:
 *   1) mapa volátil pausedSessions (feedback instantáneo local), luego
 *   2) session.paused_at durable (fiable en todos los dispositivos y tras recargas),
 *   3) si no está pausada, tiempo corrido normal desde started_at.
 * Úsalo en todo cálculo de cobro/timer para que la pausa se respete en un solo lugar.
 */
export function getSessionElapsedMinutes(session, pausedMap = null, precise = false) {
    if (!session?.started_at) return 0;
    const p = pausedMap?.[session.id];
    if (p?.isPaused) return p.elapsedAtPause || 0;
    if (session.paused_at) {
        return Math.max(0, (new Date(session.paused_at).getTime() - new Date(session.started_at).getTime()) / 60000);
    }
    return precise ? calculateElapsedTimePrecise(session.started_at) : calculateElapsedTime(session.started_at);
}

// Igual que calculateElapsedTime pero sin redondear hacia abajo al minuto.
// Necesario para capturar el punto exacto de pausa: si se usa la versión
// redondeada, cada pausa "pierde" hasta 59s y el temporizador retrocede al reanudar.
export function calculateElapsedTimePrecise(startTimeISO) {
    const start = new Date(startTimeISO);
    const now = new Date(getServerNow());
    return (now - start) / 60000;
}

/**
 * Tiempo corrido pendiente después de descontar minutos ya pagados.
 * `paidElapsedOffset` es absoluto desde `started_at`, por eso se resta una
 * sola vez y únicamente afecta al componente de tiempo corrido (`libreCost`).
 */
export function getEffectiveElapsedMinutes(elapsedMinutes, paidElapsedOffset = 0) {
    const elapsed = Number(elapsedMinutes) || 0;
    const offset = Math.max(0, Number(paidElapsedOffset) || 0);
    return Math.max(0, elapsed - offset);
}

function createEmptyCostBreakdown() {
    return {
        pinaCost: 0,
        hourCost: 0,
        libreCost: 0,
        hasPinas: false,
        hasHours: false,
        isLibre: false,
        taxAmount: 0,
        total: 0,
    };
}

/**
 * Retorna los minutos facturables de tiempo libre según las reglas:
 *   - Mínimo de 30 minutos si no existen pagos previos (`hoursOffset` y `elapsedOffset` son 0).
 *   - Redondeo hacia arriba en bloques de 15 minutos.
 */
export function getRoundedLibreMinutes(elapsedMinutes, hoursOffset = 0, elapsedOffset = 0) {
    const rawMinutes = Math.max(
        0,
        (Number(elapsedMinutes) || 0)
            - (Math.max(0, Number(hoursOffset) || 0) * 60)
            - Math.max(0, Number(elapsedOffset) || 0)
    );
    if (rawMinutes <= 0) return 0;

    // Redondear al siguiente bloque de 15 minutos (ej. 31 min -> 45 min)
    const billedMinutes = Math.ceil(rawMinutes / 15) * 15;

    // La tarifa mínima solo aplica a una sesión sin pagos previos. Cuando existe
    // paidElapsedOffset, cobrar nuevamente 30 minutos inflaría el segundo ciclo.
    if ((Number(hoursOffset) || 0) === 0 && (Number(elapsedOffset) || 0) === 0 && billedMinutes < 30) {
        return 30;
    }

    return billedMinutes;
}

/**
 * Calcula el desglose de costos de una sesión (piñas + horas por separado).
 * Soporta modo mixto: cualquier sesión puede tener piñas Y horas simultáneamente.
 * Todos los valores son en COP (Pesos Colombianos).
 */
export function calculateSessionCostBreakdown(elapsedMinutes, gameMode, config, hoursPaid = 0, extendedTimes = null, hoursOffset = 0, roundsOffset = 0, seats = null, tableType = 'POOL', elapsedOffset = 0) {
    let pinaCost = 0;
    let hourCost = 0;
    let taxAmount = 0;

    // Piñas: PINA mode siempre tiene piñas.
    // Non-PINA: solo si extended_times > 0 (evita falso positivo por DB default 0).
    const hasPinas = gameMode === 'PINA' || (Number(extendedTimes) > 0);
    if (hasPinas) {
        const basePrice = config.pricePina || 0;
        let rounds = gameMode === 'PINA' ? (1 + (Number(extendedTimes) || 0)) : (Number(extendedTimes) || 0);
        const billableRounds = Math.max(0, rounds - roundsOffset);
        const taxed = computeItemTax(basePrice, config.tableTaxType || 'exento', config.tableTaxMode || 'inclusive');
        pinaCost = round2(taxed.total * billableRounds);
        taxAmount += round2(taxed.tax * billableRounds);
    }

    // Horas: cualquier sesión con hours_paid > 0 cobra por tiempo
    if (hoursPaid > 0) {
        const pricePerHour = config.pricePerHour || 0;
        const billableHours = Math.max(0, hoursPaid - hoursOffset);
        const taxed = computeItemTax(pricePerHour, config.tableTaxType || 'exento', config.tableTaxMode || 'inclusive');
        hourCost = round2(billableHours * taxed.total);
        taxAmount += round2(taxed.tax * billableHours);
    }

    // Modo libre: game_mode NORMAL sin horas prepagadas y sin seat-level hours
    const seatHasHours = (seats || []).some(s => (s.timeCharges || []).some(tc => tc.type === 'hora'));
    const effectiveElapsedMinutes = getEffectiveElapsedMinutes(elapsedMinutes, elapsedOffset);
    const isLibre = tableType === 'POOL' && gameMode === 'NORMAL' && hoursPaid === 0 && !seatHasHours;
    let libreCost = 0;
    if (isLibre && effectiveElapsedMinutes > 0) {
        const pricePerHour = config.pricePerHour || 0;
        const billedMinutes = getRoundedLibreMinutes(elapsedMinutes, hoursOffset, elapsedOffset);
        const billableHours = billedMinutes / 60;
        const taxed = computeItemTax(pricePerHour, config.tableTaxType || 'exento', config.tableTaxMode || 'inclusive');
        libreCost = round2(billableHours * taxed.total);
        taxAmount += round2(taxed.tax * billableHours);
    }

    return {
        pinaCost,
        hourCost,
        libreCost,
        hasPinas,
        hasHours: hoursPaid > 0,
        isLibre,
        taxAmount: round2(taxAmount),
        total: round2(pinaCost + hourCost + libreCost)
    };
}

export function calculateSessionCost(elapsedMinutes, gameMode, config, hoursPaid = 0, extendedTimes = null, paidAt = null, hoursOffset = 0, roundsOffset = 0, seats = null, tableType = 'POOL', elapsedOffset = 0) {
    // Si ya fue cobrada sin liberar, la deuda es $0
    if (paidAt) return 0;

    const breakdown = calculateSessionCostBreakdown(elapsedMinutes, gameMode, config, hoursPaid, extendedTimes, hoursOffset, roundsOffset, seats, tableType, elapsedOffset);
    return breakdown.total;
}

/**
 * Formats elapsed minutes into HH:MM or MM:SS depending on length
 */
export function formatElapsedTime(elapsedMinutes) {
    if (elapsedMinutes < 0) return "00:00";

    // Redondear a minutos enteros: elapsedAtPause puede llegar con decimales
    // (minutos exactos del punto de pausa) y sin esto se mostrarían como basura
    // (ej. "8.253999999m") al hacer toString() sobre un float.
    elapsedMinutes = Math.floor(elapsedMinutes);

    if (elapsedMinutes < 60) {
        return `${elapsedMinutes.toString().padStart(2, '0')} min`;
    }

    const hours = Math.floor(elapsedMinutes / 60);
    const mins = elapsedMinutes % 60;

    return `${hours}h ${mins.toString().padStart(2, '0')}m`;
}

/**
 * Formats hours_paid (decimal) into a human-readable string.
 * 0.5 → "1/2 h", 1 → "1 h", 1.5 → "1 1/2 h", 2 → "2 h"
 */
export function formatHoursPaid(hours) {
    if (!hours || hours <= 0) return "0 h";
    const whole = Math.floor(hours);
    const hasHalf = (hours - whole) >= 0.45; // tolerancia para 0.5

    if (whole === 0 && hasHalf) return '1/2 h';
    if (hasHalf) return `${whole} 1/2 h`;
    return `${whole} h`;
}

/**
 * Calcula el costo de timeCharges individuales de un seat.
 * timeCharges: [{ type: 'hora'|'pina', amount: number }]
 * Todos los valores son en COP.
 */
export function calculateSeatTimeChargesCost(timeCharges, config) {
    if (!timeCharges || timeCharges.length === 0) {
        return { pinaCost: 0, hourCost: 0, libreCost: 0, hasPinas: false, hasHours: false, isLibre: false, taxAmount: 0, total: 0 };
    }
    const totalHours = timeCharges.filter(tc => tc.type === 'hora').reduce((sum, tc) => sum + (Number(tc.amount) || 0), 0);
    const totalPinas = timeCharges.filter(tc => tc.type === 'pina').reduce((sum, tc) => sum + (Number(tc.amount) || 0), 0);
    
    const taxedHour = computeItemTax(config.pricePerHour || 0, config.tableTaxType || 'exento', config.tableTaxMode || 'inclusive');
    const taxedPina = computeItemTax(config.pricePina || 0, config.tableTaxType || 'exento', config.tableTaxMode || 'inclusive');
    
    const hourCost = round2(totalHours * taxedHour.total);
    const pinaCost = round2(totalPinas * taxedPina.total);
    const taxAmount = round2((totalHours * taxedHour.tax) + (totalPinas * taxedPina.tax));
    
    return {
        pinaCost,
        hourCost,
        libreCost: 0,
        hasPinas: totalPinas > 0,
        hasHours: totalHours > 0,
        isLibre: false,
        taxAmount,
        total: round2(hourCost + pinaCost)
    };
}

/**
 * Calcula el costo de UN seat según su gameMode individual.
 * Soporta nuevo estilo (timeCharges) y legacy (gameMode/hoursPaid/pinas).
 * seat: { timeCharges?, gameMode?, hoursPaid?, pinas? }
 */
export function calculateSeatCostBreakdown(seat, elapsedMinutes, config, tableType = 'POOL', elapsedOffset = 0) {
    if (!seat) {
        return { pinaCost: 0, hourCost: 0, libreCost: 0, hasPinas: false, hasHours: false, isLibre: false, total: 0 };
    }
    // Nuevo estilo: usa timeCharges si existen
    if (seat.timeCharges && seat.timeCharges.length > 0) {
        return calculateSeatTimeChargesCost(seat.timeCharges, config);
    }
    // Legacy: usa gameMode/hoursPaid/pinas
    if (!seat.gameMode || seat.gameMode === 'NONE') {
        return { pinaCost: 0, hourCost: 0, libreCost: 0, hasPinas: false, hasHours: false, isLibre: false, total: 0 };
    }
    if (seat.gameMode === 'PINA') {
        const pinas = seat.pinas || 1;
        return calculateSessionCostBreakdown(elapsedMinutes, 'PINA', config, 0, pinas - 1, 0, 0, null, tableType, elapsedOffset);
    }
    if (seat.gameMode === 'HOURS') {
        const hours = seat.hoursPaid || 0;
        return calculateSessionCostBreakdown(elapsedMinutes, 'NORMAL', config, hours, 0, 0, 0, null, tableType, elapsedOffset);
    }
    if (seat.gameMode === 'LIBRE') {
        return calculateSessionCostBreakdown(elapsedMinutes, 'NORMAL', config, 0, 0, 0, 0, null, tableType, elapsedOffset);
    }
    return { pinaCost: 0, hourCost: 0, libreCost: 0, hasPinas: false, hasHours: false, isLibre: false, total: 0 };
}

/**
 * Calcula el total de consumo en COP usando unit_price por item.
 * @param {Array} items - order items con product_id, unit_price_usd (ahora = price_cop), qty
 */
export function calculateConsumptionCOP(items) {
    if (!items || items.length === 0) return 0;
    return round2(items.reduce((acc, item) => {
        const qty = Number(item.qty) || 0;
        // unit_price_usd es ahora el precio en COP (campo heredado del esquema)
        return acc + (Number(item.unit_price_usd) || 0) * qty;
    }, 0));
}

/**
 * Los cargos congelados de transferencias anteriores son líneas de orden, pero
 * no son consumo de productos. Se identifican por el prefijo legacy/durable;
 * los ítems copiados con `transfer_operation_id` siguen siendo productos.
 */
export function isFrozenTransferChargeItem(item) {
    const productId = String(item?.product_id ?? item?.id ?? '');
    return productId.startsWith('frozen-time-') || item?.charge_type === 'POOL_TIME';
}

export function calculateTransferOrderBreakdown(items = []) {
    let productConsumptionTotal = 0;
    let previousTransferChargesTotal = 0;

    (items || []).forEach(item => {
        const lineTotal = round2((Number(item?.unit_price_usd) || 0) * (Number(item?.qty) || 0));
        if (isFrozenTransferChargeItem(item)) previousTransferChargesTotal += lineTotal;
        else productConsumptionTotal += lineTotal;
    });

    productConsumptionTotal = round2(productConsumptionTotal);
    previousTransferChargesTotal = round2(previousTransferChargesTotal);

    return {
        productConsumptionTotal,
        previousTransferChargesTotal,
        totalConserved: round2(productConsumptionTotal + previousTransferChargesTotal),
    };
}

/**
 * Etiqueta contextual del pendiente Pool para evitar llamar "tiempo" a una
 * jugada o esconder cargos manuales por asiento.
 */
export function getPoolTransferPendingLabel({ sessionBreakdown = {}, sourceSeatTimeTotal = 0 } = {}) {
    const hasTime = (Number(sessionBreakdown.hourCost) || 0) > 0
        || (Number(sessionBreakdown.libreCost) || 0) > 0;
    const hasRounds = (Number(sessionBreakdown.pinaCost) || 0) > 0;
    const hasSeatCharges = (Number(sourceSeatTimeTotal) || 0) > 0;
    const kinds = [hasTime, hasRounds, hasSeatCharges].filter(Boolean).length;

    if (kinds > 1) return 'Cargos Pool pendientes';
    if (hasRounds) return 'Jugadas Pool pendientes';
    if (hasSeatCharges) return 'Cargos por asiento pendientes';
    return 'Tiempo Pool pendiente';
}

// Alias de compatibilidad para código que aún use el nombre anterior
export const calculateConsumptionBs = calculateConsumptionCOP;

/**
 * Calcula el desglose completo de una mesa con seats/clientes.
 * Si seats está vacío, retorna null (usar cálculo legacy de sesión).
 * Todos los valores son en COP (Pesos Colombianos).
 */
export function calculateFullTableBreakdown(session, seats, elapsedMinutes, config, orderItems = [], sharedDivision = null, frozenDivisor = null, isTimeFree = false, hoursOffset = 0, roundsOffset = 0, tableType = 'POOL', elapsedOffset = 0) {
    if (!seats || seats.length === 0) return null;

    const activeSeats = seats.filter(s => !s.paid);
    const allSeats = seats;
    const sharedItems = orderItems.filter(i => !i.seat_id);
    const sharedConsumptionTotal = sharedItems.reduce((acc, i) => acc + (Number(i.unit_price_usd) * Number(i.qty)), 0);

    // Costo de tiempo compartido (session-level: piñas + horas sin seatId)
    const sessionTimeCost = isTimeFree
        ? { pinaCost: 0, hourCost: 0, libreCost: 0, hasPinas: false, hasHours: false, isLibre: false, total: 0 }
        : calculateSessionCostBreakdown(
            elapsedMinutes,
            session.game_mode,
            config,
            session.hours_paid || 0,
            session.extended_times || 0,
            hoursOffset,
            roundsOffset,
            seats,
            tableType,
            elapsedOffset
        );
    const sharedTimeTotal = sessionTimeCost.total;
    const sharedTotal = round2(sharedConsumptionTotal + sharedTimeTotal);

    // Extraer anterior retiredPaidShared de las notas de la sesión
    let retiredPaidShared = 0;
    if (session?.notes && session.notes.includes('|||RETIRED_PAID_SHARED:')) {
        const parts = session.notes.split('|||RETIRED_PAID_SHARED:')[1];
        if (parts) {
            const val = parseFloat(parts.split('|||')[0].trim());
            if (!isNaN(val)) retiredPaidShared = val;
        }
    }

    const paidSeatsCount = allSeats.filter(s => s.paid).length;
    const totalSeatsCount = allSeats.length;
    const netSharedTotal = Math.max(0, sharedTotal - retiredPaidShared);
    const paidSeatsShared = (totalSeatsCount > 0 && paidSeatsCount > 0)
        ? round2(netSharedTotal * (paidSeatsCount / totalSeatsCount))
        : 0;

    const remainingSharedTotal = Math.max(0, netSharedTotal - paidSeatsShared);
    const activeCount = (frozenDivisor !== null && frozenDivisor !== undefined && frozenDivisor > 0) ? frozenDivisor : activeSeats.length;

    const getSharedPortion = (seat) => {
        if (seat.paid) return 0;
        if (!sharedDivision || sharedDivision.type === 'equal') {
            return activeCount > 0 ? round2(remainingSharedTotal / activeCount) : 0;
        }
        if (sharedDivision.type === 'custom') {
            return round2(parseFloat(sharedDivision.amounts?.[seat.id]) || 0);
        }
        return activeCount > 0 ? round2(remainingSharedTotal / activeCount) : 0;
    };

    const seatBreakdowns = allSeats.map(seat => {
        const timeCost = calculateSeatCostBreakdown(seat, elapsedMinutes, config, tableType, elapsedOffset);
        const seatItems = orderItems.filter(i => i.seat_id === seat.id);
        const consumption = seatItems.reduce((acc, i) => acc + (Number(i.unit_price_usd) * Number(i.qty)), 0);
        const sharedPortion = getSharedPortion(seat);
        return {
            seat,
            timeCost,
            items: seatItems,
            consumption: round2(consumption),
            sharedPortion,
            subtotal: round2(timeCost.total + consumption + sharedPortion)
        };
    });

    const grandTotal = seatBreakdowns.filter(sb => !sb.seat.paid).reduce((acc, sb) => acc + sb.subtotal, 0);

    return {
        seats: seatBreakdowns,
        sharedItems,
        sharedConsumptionTotal: round2(sharedConsumptionTotal),
        sharedTimeTotal: round2(sharedTimeTotal),
        sharedTotal: round2(sharedTotal),
        retiredPaidShared: round2(retiredPaidShared),
        remainingSharedTotal: round2(remainingSharedTotal),
        sharedPerSeat: activeCount > 0 ? round2(remainingSharedTotal / activeCount) : 0,
        sessionTimeCost,
        grandTotal: round2(grandTotal)
    };
}

// ── STUBS DE COMPATIBILIDAD ────────────────────────────────────────────────
// Funciones que existían antes pero ya no realizan conversión de moneda.
// Se mantienen para evitar errores de importación en componentes no migrados aún.

/** @deprecated Pool Imperial usa COP únicamente. Retorna 0 siempre. */
export const calculateTimeCostBs = () => 0;
/** @deprecated Pool Imperial usa COP únicamente. Retorna objeto de 0s. */
export const calculateTimeCostBsBreakdown = () => ({ pinaCostBs: 0, hourCostBs: 0, libreCostBs: 0, totalBs: 0 });
/** @deprecated Pool Imperial usa COP únicamente. Retorna 0 siempre. */
export const calculateGrandTotalBs = () => 0;
/** @deprecated Pool Imperial usa COP únicamente. Retorna 0 siempre. */
export const calculateSeatTimeCostBs = () => 0;
/** @deprecated Pool Imperial usa COP únicamente. Retorna 0 siempre. */
export const calculateBreakdownTotalBs = () => 0;

export function buildTableSyntheticCart(tableCheckoutData, config, products) {
    const isPartial = !!tableCheckoutData.isPartial;
    const seatId = isPartial ? null : (tableCheckoutData.seatId || null);
    const session = tableCheckoutData.session;
    const seats = isPartial ? [] : (session?.seats || []);
    const paidHoursOffsets = tableCheckoutData.paidHoursOffsets || {};
    const paidRoundsOffsets = tableCheckoutData.paidRoundsOffsets || {};
    const paidElapsedOffsets = tableCheckoutData.paidElapsedOffsets || {};
    const hoursOff = paidHoursOffsets[session?.id] || 0;
    const roundsOff = paidRoundsOffsets[session?.id] || 0;
    const elapsedOffset = paidElapsedOffsets[session?.id] || 0;

    // Los offsets de abonos son a nivel sesión y primero los absorben las
    // horas/piñas de la sesión (calculateSessionCostBreakdown ya los resta).
    // A los cargos de asiento solo les llega el REMANENTE: aplicar el offset
    // completo otra vez a cada asiento regalaba el tiempo nuevo (doble descuento).
    const isTimeFreeTable = tableCheckoutData.table?.type === 'NORMAL';
    const sessionHoursCap = isTimeFreeTable ? 0 : (Number(session?.hours_paid) || 0);
    const sessionRoundsCap = isTimeFreeTable ? 0 :
        (session?.game_mode === 'PINA' ? 1 + (Number(session?.extended_times) || 0) : (Number(session?.extended_times) || 0));
    const seatHoursOff = Math.max(0, hoursOff - sessionHoursCap);
    const seatRoundsOff = Math.max(0, roundsOff - sessionRoundsCap);

    // Metadata de juego para una línea "Compartido": porción exacta de horas,
    // piñas y recaudo de tiempo que contiene esa línea (excluye el consumo
    // compartido de productos). Los reportes de cierre la usan para no inflar
    // las horas jugadas ni el recaudo por tiempo.
    const buildSharedGameMeta = (fullBreakdown, divisor, sharedPortion) => {
        const stc = fullBreakdown?.sessionTimeCost || {};
        const sharedTotal = fullBreakdown?.sharedTotal || 0;
        const sharedTimeTotal = fullBreakdown?.sharedTimeTotal || 0;
        if (!divisor || divisor <= 0 || sharedTotal <= 0 || sharedTimeTotal <= 0) {
            return { hoursQty: 0, hoursRevenue: 0, roundsQty: 0, roundsRevenue: 0 };
        }
        // Fracción de la porción compartida que corresponde a tiempo (no productos)
        const timeRatio = Math.min(1, sharedTimeTotal / sharedTotal);
        const lineTimeRevenue = round2((sharedPortion || 0) * timeRatio);

        // Reparto del tiempo entre horas (hourCost + libreCost) y piñas (pinaCost)
        const timeTotal = stc.total || 0;
        const hoursShare = timeTotal > 0 ? ((stc.hourCost || 0) + (stc.libreCost || 0)) / timeTotal : 0;

        // Cantidades facturables a nivel sesión (offsets de abonos ya descontados)
        let sessionHours = 0;
        if ((stc.hourCost || 0) > 0) {
            sessionHours = Math.max(0, (Number(session?.hours_paid) || 0) - hoursOff);
        } else if ((stc.libreCost || 0) > 0) {
            sessionHours = getRoundedLibreMinutes(tableCheckoutData.elapsed, hoursOff, elapsedOffset) / 60;
        }

        let sessionRounds = 0;
        if ((stc.pinaCost || 0) > 0) {
            const rounds = session?.game_mode === 'PINA'
                ? 1 + (Number(session?.extended_times) || 0)
                : (Number(session?.extended_times) || 0);
            sessionRounds = Math.max(0, rounds - roundsOff);
        }

        return {
            hoursQty: round2(sessionHours / divisor),
            hoursRevenue: round2(lineTimeRevenue * hoursShare),
            roundsQty: round2(sessionRounds / divisor),
            roundsRevenue: round2(lineTimeRevenue * (1 - hoursShare))
        };
    };

    const syntheticCart = [];
    const tableName = tableCheckoutData.table?.name || 'Mesa';

    if (seatId && seats.length > 0) {
        // PER-SEAT
        const seat = seats.find(s => s.id === seatId);
        if (seat) {
            const seatTimeCost = calculateSeatCostBreakdown(seat, tableCheckoutData.elapsed, config, tableCheckoutData.table?.type || 'POOL', elapsedOffset);
            const seatLabel = `${tableName} (${seat.label || 'Persona'})`;

            if (seatTimeCost.pinaCost > 0) {
                const pinaQty = seat.timeCharges
                    ? seat.timeCharges.filter(tc => tc.type === 'pina').reduce((s, tc) => s + (tc.amount || 1), 0)
                    : (seat.pinas || 1);
                const billablePinas = Math.max(0, pinaQty - seatRoundsOff);
                syntheticCart.push({
                    id: crypto.randomUUID(),
                    name: `Jugada ${seatLabel}`,
                    priceUsdt: round2(config.pricePina || 0), priceUsd: round2(config.pricePina || 0),
                    qty: billablePinas, costUsd: 0, costBs: 0, category: 'servicios', unit: 'servicio', stock: 9999,
                    taxType: config.tableTaxType || 'exento',
                    taxMode: config.tableTaxMode || 'inclusive'
                });
            }
            if (seatTimeCost.hourCost > 0) {
                const horasQty = seat.timeCharges
                    ? seat.timeCharges.filter(tc => tc.type === 'hora').reduce((s, tc) => s + (tc.amount || 0), 0)
                    : (seat.hoursPaid || 0);
                const billableHours = Math.max(0, horasQty - seatHoursOff);
                syntheticCart.push({
                    id: crypto.randomUUID(),
                    name: `Tiempo ${seatLabel} (${formatHoursPaid(horasQty)})`,
                    priceUsdt: round2(config.pricePerHour || 0), priceUsd: round2(config.pricePerHour || 0),
                    qty: billableHours, costUsd: 0, costBs: 0, category: 'servicios', unit: 'servicio', stock: 9999,
                    taxType: config.tableTaxType || 'exento',
                    taxMode: config.tableTaxMode || 'inclusive'
                });
            }
            if (seatTimeCost.libreCost > 0) {
                const billedMinutes = getRoundedLibreMinutes(tableCheckoutData.elapsed, hoursOff, elapsedOffset);
                const billableHours = billedMinutes / 60;
                syntheticCart.push({
                    id: crypto.randomUUID(),
                    name: `Tiempo libre ${seatLabel} (${formatElapsedTime(Math.round(billedMinutes))})`,
                    priceUsdt: round2(config.pricePerHour || 0), priceUsd: round2(config.pricePerHour || 0),
                    qty: round2(billableHours), costUsd: 0, costBs: 0, category: 'servicios', unit: 'servicio', stock: 9999,
                    taxType: config.tableTaxType || 'exento',
                    taxMode: config.tableTaxMode || 'inclusive'
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

            const isTimeFree = tableCheckoutData.table?.type === 'NORMAL';
            const fullBreakdown = calculateFullTableBreakdown(session, seats, tableCheckoutData.elapsed, config, tableCheckoutData.currentItems || [], null, tableCheckoutData.frozenDivisor || null, isTimeFree, hoursOff, roundsOff, tableCheckoutData.table?.type || 'POOL', elapsedOffset);
            if (fullBreakdown) {
                const seatBd = fullBreakdown.seats.find(s => s.seat.id === seatId);
                if (seatBd && seatBd.sharedPortion > 0) {
                    const unpaidSeats = seats.filter(s => !s.paid);
                    const unpaidCount = unpaidSeats.length || 1;
                    const totalSeatsCount = seats.length || 1;
                    const isLastPayment = unpaidCount <= 1;

                    if (!isLastPayment) {
                        // PAGOS INTERMEDIOS (Persona 1 a N-1):
                        // Emitir ítem de cuota limpia por el monto asignado (ej. $47.000)
                        // SIN fraccionar productos en decimales (1.5u) ni descontar stock.
                        const cuotaIndex = totalSeatsCount - unpaidCount + 1;
                        const percent = Math.round((1 / totalSeatsCount) * 100);
                        syntheticCart.push({
                            id: crypto.randomUUID(),
                            name: `Cuota Persona ${cuotaIndex} (${percent}% Mesa ${tableName})`,
                            priceUsdt: round2(seatBd.sharedPortion), priceUsd: round2(seatBd.sharedPortion),
                            qty: 1, costUsd: 0, costBs: 0, category: 'servicios', unit: 'servicio', stock: 9999,
                            isQuotaItem: true,
                            gameMeta: buildSharedGameMeta(fullBreakdown, totalSeatsCount, seatBd.sharedPortion)
                        });
                    } else {
                        // PAGO FINAL (Última Persona que cierra la mesa):
                        // Incluir los productos físicos ENTEROS (ej. 3u Tequila) de la mesa
                        // para que la última venta efectúe el descuento completo de stock en unidades enteras.
                        const timeRatio = fullBreakdown.sharedTotal > 0
                            ? Math.min(1, fullBreakdown.sharedTimeTotal / fullBreakdown.sharedTotal)
                            : 1;
                        const timePortion = round2(seatBd.sharedPortion * timeRatio);
                        if (timePortion > 0) {
                            syntheticCart.push({
                                id: crypto.randomUUID(),
                                name: `Compartido ${tableName} (÷${totalSeatsCount})`,
                                priceUsdt: timePortion, priceUsd: timePortion,
                                qty: 1, costUsd: 0, costBs: 0, category: 'servicios', unit: 'servicio', stock: 9999,
                                gameMeta: buildSharedGameMeta(fullBreakdown, totalSeatsCount, seatBd.sharedPortion)
                            });
                        }

                        if (fullBreakdown.sharedItems && fullBreakdown.sharedItems.length > 0) {
                            fullBreakdown.sharedItems.forEach(item => {
                                const p = products.find(prod => prod.id === item.product_id);
                                syntheticCart.push(p
                                    ? { ...p, priceUsdt: Number(item.unit_price_usd), priceUsd: Number(item.unit_price_usd), qty: Number(item.qty), costBs: 0, costUsd: p.costUsd || 0, exactBs: 0 }
                                    : { id: item.product_id, name: item.product_name || 'Producto', priceUsdt: Number(item.unit_price_usd), priceUsd: Number(item.unit_price_usd), qty: Number(item.qty), costBs: 0, costUsd: 0, unit: 'unidad', category: 'otros', stock: 9999 }
                                );
                            });
                        }
                    }
                }
            }
        }
    } else if (!seatId && seats.length > 0) {
        // COBRAR TODO CON CUANTAS DIVIDIDAS
        const isTimeFreeAll = tableCheckoutData.table?.type === 'NORMAL';
        const fullBreakdown = calculateFullTableBreakdown(session, seats, tableCheckoutData.elapsed, config, tableCheckoutData.currentItems || [], null, tableCheckoutData.frozenDivisor || null, isTimeFreeAll, hoursOff, roundsOff, tableCheckoutData.table?.type || 'POOL', elapsedOffset);
        if (fullBreakdown) {
            const unpaidSeatBds = fullBreakdown.seats.filter(sb => !sb.seat.paid);
            const divisorLabel = unpaidSeatBds.length;
            // Los productos compartidos solo se itemizan a precio completo cuando
            // nadie ha pagado parte del pot compartido; si un asiento retirado ya
            // pagó su porción (fusionada), itemizarlos completos los cobraría doble.
            const sharedFullyUnpaid = (fullBreakdown.retiredPaidShared || 0) === 0
                && fullBreakdown.seats.every(sb => !sb.seat.paid);
            // Solo el remanente del offset (tras absorberlo la sesión) llega a los
            // asientos, y se consume secuencialmente entre ellos (no restarse
            // completo a cada uno, que subfactura).
            let remainingRoundsOff = seatRoundsOff;
            let remainingHoursOff = seatHoursOff;
            unpaidSeatBds.forEach(seatBd => {
                const seat = seatBd.seat;
                const seatLabel = `${tableName} (${seat.label || 'Persona'})`;
                if (seatBd.timeCost.pinaCost > 0) {
                    const pinaQty = seat.timeCharges
                        ? seat.timeCharges.filter(tc => tc.type === 'pina').reduce((s, tc) => s + (tc.amount || 1), 0)
                        : (seat.pinas || 1);
                    const roundsDeduct = Math.min(pinaQty, remainingRoundsOff);
                    remainingRoundsOff -= roundsDeduct;
                    const billablePinas = pinaQty - roundsDeduct;
                    // Con qty 0 el subtotal la cobraría como 1 (qty || 1): no insertar
                    if (billablePinas > 0) syntheticCart.push({
                        id: crypto.randomUUID(),
                        name: `Jugada ${seatLabel}`,
                        priceUsdt: round2(config.pricePina || 0), priceUsd: round2(config.pricePina || 0),
                        qty: billablePinas, costUsd: 0, costBs: 0, category: 'servicios', unit: 'servicio', stock: 9999,
                        taxType: config.tableTaxType || 'exento',
                        taxMode: config.tableTaxMode || 'inclusive'
                    });
                }
                if (seatBd.timeCost.hourCost > 0) {
                    const horasQty = seat.timeCharges
                        ? seat.timeCharges.filter(tc => tc.type === 'hora').reduce((s, tc) => s + (tc.amount || 0), 0)
                        : (seat.hoursPaid || 0);
                    const hoursDeduct = Math.min(horasQty, remainingHoursOff);
                    remainingHoursOff -= hoursDeduct;
                    const billableHours = horasQty - hoursDeduct;
                    // Con qty 0 el subtotal la cobraría como 1 (qty || 1): no insertar
                    if (billableHours > 0) syntheticCart.push({
                        id: crypto.randomUUID(),
                        name: `Tiempo ${seatLabel} (${formatHoursPaid(horasQty)})`,
                        priceUsdt: round2(config.pricePerHour || 0), priceUsd: round2(config.pricePerHour || 0),
                        qty: billableHours, costUsd: 0, costBs: 0, category: 'servicios', unit: 'servicio', stock: 9999,
                        taxType: config.tableTaxType || 'exento',
                        taxMode: config.tableTaxMode || 'inclusive'
                    });
                }
                if (seatBd.timeCost.libreCost > 0) {
                    const billedMinutes = getRoundedLibreMinutes(tableCheckoutData.elapsed, hoursOff, elapsedOffset);
                    const billableHours = billedMinutes / 60;
                    syntheticCart.push({
                        id: crypto.randomUUID(),
                        name: `Tiempo libre ${seatLabel} (${formatElapsedTime(Math.round(billedMinutes))})`,
                        priceUsdt: round2(config.pricePerHour || 0), priceUsd: round2(config.pricePerHour || 0),
                        qty: round2(billableHours), costUsd: 0, costBs: 0, category: 'servicios', unit: 'servicio', stock: 9999,
                        taxType: config.tableTaxType || 'exento',
                        taxMode: config.tableTaxMode || 'inclusive'
                    });
                }
                seatBd.items.forEach(item => {
                    const p = products.find(p => p.id === item.product_id);
                    syntheticCart.push(p
                        ? { ...p, priceUsdt: Number(item.unit_price_usd), priceUsd: Number(item.unit_price_usd), qty: Number(item.qty), costBs: 0, costUsd: p.costUsd || 0, exactBs: 0 }
                        : { id: item.product_id, name: item.product_name || 'Producto', priceUsdt: Number(item.unit_price_usd), priceUsd: Number(item.unit_price_usd), qty: Number(item.qty), costBs: 0, costUsd: 0, unit: 'unidad', category: 'otros', stock: 9999 }
                    );
                });
                if (seatBd.sharedPortion > 0) {
                    if (sharedFullyUnpaid) {
                        // La línea Compartido representa SOLO la porción de tiempo;
                        // los productos compartidos salen itemizados aparte (abajo).
                        const timeRatio = fullBreakdown.sharedTotal > 0
                            ? Math.min(1, fullBreakdown.sharedTimeTotal / fullBreakdown.sharedTotal)
                            : 1;
                        const timePortion = round2(seatBd.sharedPortion * timeRatio);
                        if (timePortion > 0) {
                            syntheticCart.push({
                                id: crypto.randomUUID(),
                                name: `Compartido ${tableName} (÷${divisorLabel})`,
                                priceUsdt: timePortion, priceUsd: timePortion,
                                qty: 1, costUsd: 0, costBs: 0, category: 'servicios', unit: 'servicio', stock: 9999,
                                gameMeta: buildSharedGameMeta(fullBreakdown, divisorLabel, seatBd.sharedPortion)
                            });
                        }
                    } else {
                        // Pot compartido parcialmente pagado: mantener la línea fusionada
                        // (remainingSharedTotal ya descuenta lo pagado por retirados).
                        syntheticCart.push({
                            id: crypto.randomUUID(),
                            name: `Compartido ${tableName} (÷${divisorLabel})`,
                            priceUsdt: round2(seatBd.sharedPortion), priceUsd: round2(seatBd.sharedPortion),
                            qty: 1, costUsd: 0, costBs: 0, category: 'servicios', unit: 'servicio', stock: 9999,
                            gameMeta: buildSharedGameMeta(fullBreakdown, divisorLabel, seatBd.sharedPortion)
                        });
                    }
                }
            });

            // Productos compartidos (sin asiento) itemizados UNA sola vez, con su
            // product_id real: visibles en ticket, cierre y auditoría por artículo.
            // El stock NO se toca aquí: ya se descontó al agregarlos a la comanda
            // (OrderPanel) y el checkout de mesas usa skipStockDeduction.
            if (sharedFullyUnpaid && fullBreakdown.sharedItems && fullBreakdown.sharedItems.length > 0) {
                fullBreakdown.sharedItems.forEach(item => {
                    const p = products.find(prod => prod.id === item.product_id);
                    syntheticCart.push(p
                        ? { ...p, priceUsdt: Number(item.unit_price_usd), priceUsd: Number(item.unit_price_usd), qty: Number(item.qty), costBs: 0, costUsd: p.costUsd || 0, exactBs: 0 }
                        : { id: item.product_id, name: item.product_name || 'Producto', priceUsdt: Number(item.unit_price_usd), priceUsd: Number(item.unit_price_usd), qty: Number(item.qty), costBs: 0, costUsd: 0, unit: 'unidad', category: 'otros', stock: 9999 }
                    );
                });
            }
        }
    } else {
        // CLASSIC FULL TABLE
        const breakdown = calculateSessionCostBreakdown(tableCheckoutData.elapsed, session?.game_mode, config, session?.hours_paid, session?.extended_times, hoursOff, roundsOff, null, tableCheckoutData.table?.type || 'POOL', elapsedOffset);
        if (!isPartial && breakdown.pinaCost > 0) {
            const pinaCount = session.game_mode === 'PINA' ? 1 + (Number(session.extended_times) || 0) : Number(session.extended_times) || 0;
            const billableRounds = Math.max(0, pinaCount - roundsOff);
            syntheticCart.push({
                id: crypto.randomUUID(),
                name: `Jugada ${tableName}`,
                priceUsdt: round2(config.pricePina || 0), priceUsd: round2(config.pricePina || 0),
                qty: billableRounds, costUsd: 0, costBs: 0, category: 'servicios', unit: 'servicio', stock: 9999,
                taxType: config.tableTaxType || 'exento',
                taxMode: config.tableTaxMode || 'inclusive'
            });
        }
        if (!isPartial && breakdown.hourCost > 0) {
            const billableHours = Math.max(0, (Number(session.hours_paid) || 0) - hoursOff);
            syntheticCart.push({
                id: crypto.randomUUID(),
                name: `Tiempo ${tableName} (${formatHoursPaid(billableHours)})`,
                priceUsdt: round2(config.pricePerHour || 0), priceUsd: round2(config.pricePerHour || 0),
                qty: billableHours, costUsd: 0, costBs: 0, category: 'servicios', unit: 'servicio', stock: 9999,
                taxType: config.tableTaxType || 'exento',
                taxMode: config.tableTaxMode || 'inclusive'
            });
        }
        if (!isPartial && breakdown.libreCost > 0) {
            const billedMinutes = getRoundedLibreMinutes(tableCheckoutData.elapsed, hoursOff, elapsedOffset);
            const billableHours = billedMinutes / 60;
            syntheticCart.push({
                id: crypto.randomUUID(),
                name: `Tiempo libre ${tableName} (${formatElapsedTime(Math.round(billedMinutes))})`,
                priceUsdt: round2(config.pricePerHour || 0), priceUsd: round2(config.pricePerHour || 0),
                qty: round2(billableHours), costUsd: 0, costBs: 0, category: 'servicios', unit: 'servicio', stock: 9999,
                taxType: config.tableTaxType || 'exento',
                taxMode: config.tableTaxMode || 'inclusive'
            });
        }
        if (isPartial && session?.notes?.includes('|||ABONO_MONTO:')) {
            let abonoMontoVal = 0;
            try {
                abonoMontoVal = JSON.parse(session.notes.split('|||ABONO_MONTO:')[1].split('|||')[0].trim()).amount;
            } catch (_) { /* malformed legacy metadata is ignored */ }
            if (abonoMontoVal > 0) {
                syntheticCart.push({
                    id: 'abono-monto-libre',
                    name: 'Abono Parcial (Monto Libre)',
                    priceUsdt: abonoMontoVal, priceUsd: abonoMontoVal,
                    qty: 1, costUsd: 0, costBs: 0, category: 'servicios', unit: 'servicio', stock: 9999,
                    taxType: 'exento',
                    taxMode: 'inclusive'
                });
            }
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

    return { syntheticCart, subtotalLimpio: round2(syntheticCart.reduce((sum, item) => sum + round2((item.priceUsd || 0) * (item.qty || 1)), 0)) };
}

/**
 * Calcula el monto TOTAL de tiempo/jugadas de una sesión POOL, tal como se vería
 * en la tarjeta de mesa (timeCost de sesión + seatTimeCost de asientos, ambos
 * tax-inclusive). Se usa para "congelar" el tiempo al mover una mesa de Pool a
 * una mesa Normal: el cobro por tiempo no viaja con el tipo de mesa destino, así
 * que se materializa aquí como un cargo fijo.
 *
 * Devuelve { productInfo, qty, total, label } listo para addItemToSession, o null
 * si no hay nada que cobrar (sesión sin tiempo, o mesa que ya es Normal).
 */
export function buildFrozenTimeCharge(session, elapsedMinutes, config, tableType = 'POOL', hoursOffset = 0, roundsOffset = 0, transferOperationId = null, elapsedOffset = 0) {
    // Mesa Normal no cobra tiempo: nada que congelar.
    if (!session || tableType === 'NORMAL') return null;

    // 1) Costo de tiempo a nivel sesión (piñas + horas + modo libre), con offsets.
    // El offset de minutos solo afecta el tiempo corrido; horas y piñas conservan
    // sus offsets independientes.
    const effectiveElapsedMinutes = getEffectiveElapsedMinutes(elapsedMinutes, elapsedOffset);
    const sessionBreakdown = session.paid_at
        ? createEmptyCostBreakdown()
        : calculateSessionCostBreakdown(
            elapsedMinutes,
            session.game_mode,
            config,
            Number(session.hours_paid) || 0,
            session.extended_times,
            hoursOffset,
            roundsOffset,
            session.seats,
            tableType,
            elapsedOffset
        );
    const sessionTotal = round2(sessionBreakdown.total);

    // 2) Costo de cargos de tiempo por asiento (horas/piñas asignadas a clientes),
    //    solo de los asientos aún no pagados — igual que seatTimeCost en TableCard.
    const seatTotal = (session.seats || [])
        .filter(s => !s.paid)
        .reduce((sum, s) => sum + calculateSeatTimeChargesCost(s.timeCharges, config).total, 0);

    const total = round2(sessionTotal + seatTotal);
    if (total <= 0) return null;

    // Etiqueta legible para ticket/comanda. Solo describe cargos pendientes.
    const unpaidSeats = (session.seats || []).filter(s => !s.paid);
    const parts = [];
    const isLibre = sessionBreakdown.libreCost > 0;
    if (isLibre) parts.push(formatElapsedTime(Math.round(effectiveElapsedMinutes)));
    if (sessionBreakdown.hourCost > 0) parts.push(formatHoursPaid(
        Math.max(0, (Number(session.hours_paid) || 0) - (Number(hoursOffset) || 0))
    ));
    const hasPinas = sessionBreakdown.pinaCost > 0
        || unpaidSeats.some(s => (s.timeCharges || []).some(tc => tc.type === 'pina'));
    if (hasPinas) parts.push('jugadas');
    if (seatTotal > 0) parts.push('asientos');
    const detail = parts.length ? ` (${parts.join(' + ')})` : '';
    const label = `Cargo Pool trasladado${detail}`;

    return {
        total,
        sessionTotal,
        sessionBreakdown,
        seatTotal,
        effectiveElapsedMinutes,
        elapsedOffsetMinutes: Math.max(0, Number(elapsedOffset) || 0),
        pendingChargeLabel: getPoolTransferPendingLabel({
            sessionBreakdown,
            sourceSeatTimeTotal: seatTotal,
        }),
        label,
        qty: 1,
        productInfo: {
            // product_id sintético: order_items.product_id es TEXT, no requiere catálogo.
            // Cada traslado confirmado necesita su propia identidad. Reutilizar
            // solo session.id hace que el segundo ciclo Pool→Normal reemplace o
            // ignore el cargo nuevo en vez de agregarlo.
            id: getFrozenTimeChargeProductId(session.id, transferOperationId),
            name: label,
            // El monto ya incluye impuesto; se cobra tal cual sin re-gravar.
            priceUsd: total,
        },
    };
}

/**
 * Preview sin efectos secundarios para Pool→Normal. Usa exactamente la misma
 * lógica de buildFrozenTimeCharge y separa el tiempo pendiente de los cargos
 * por asiento para que el modal no invente un total distinto al checkout.
 */
export function buildPoolToNormalPreview({
    session,
    elapsedMinutes,
    config = {},
    orderItems = [],
    hasOrder = false,
    hoursOffset = 0,
    roundsOffset = 0,
    elapsedOffset = 0,
}) {
    const frozen = buildFrozenTimeCharge(
        session,
        elapsedMinutes,
        config,
        'POOL',
        hoursOffset,
        roundsOffset,
        null,
        elapsedOffset
    );
    const unpaidSeatIds = new Set(
        (session?.seats || []).filter(seat => !seat.paid).map(seat => seat.id)
    );
    const allSeatTotal = (session?.seats || []).reduce(
        (sum, seat) => sum + calculateSeatTimeChargesCost(seat.timeCharges, config).total,
        0
    );
    const effectiveElapsedMinutes = getEffectiveElapsedMinutes(elapsedMinutes, elapsedOffset);
    const sourceSessionBreakdown = session?.paid_at
        ? createEmptyCostBreakdown()
        : calculateSessionCostBreakdown(
            elapsedMinutes,
            session?.game_mode,
            config,
            Number(session?.hours_paid) || 0,
            session?.extended_times,
            hoursOffset,
            roundsOffset,
            session?.seats,
            'POOL',
            elapsedOffset
        );
    const sourceTimeTotal = round2(sourceSessionBreakdown.total);
    const sourceSeatTimeTotal = (session?.seats || [])
        .filter(seat => unpaidSeatIds.has(seat.id))
        .reduce(
            (sum, seat) => sum + calculateSeatTimeChargesCost(seat.timeCharges, config).total,
            0
        );
    const grossSessionTotal = calculateSessionCost(
        elapsedMinutes,
        session?.game_mode,
        config,
        Number(session?.hours_paid) || 0,
        session?.extended_times,
        null,
        0,
        0,
        session?.seats,
        'POOL'
    );
    const consumptionBreakdown = calculateTransferOrderBreakdown(orderItems);
    const currentConsumptionTotal = consumptionBreakdown.totalConserved;
    const frozenTimeTotal = round2(frozen?.total || 0);
    const previouslyPaidTotal = round2(Math.max(
        0,
        grossSessionTotal + allSeatTotal - frozenTimeTotal
    ));

    return {
        sourceElapsedMinutes: round2(Number(elapsedMinutes) || 0),
        effectiveElapsedMinutes: round2(effectiveElapsedMinutes),
        elapsedOffsetMinutes: Math.max(0, Number(elapsedOffset) || 0),
        sourceTimeTotal: round2(sourceTimeTotal),
        sourceSessionBreakdown,
        sourceSeatTimeTotal: round2(sourceSeatTimeTotal),
        frozenTimeTotal,
        previouslyPaidTotal,
        productConsumptionTotal: consumptionBreakdown.productConsumptionTotal,
        previousTransferChargesTotal: consumptionBreakdown.previousTransferChargesTotal,
        currentConsumptionTotal,
        pendingChargeLabel: getPoolTransferPendingLabel({
            sessionBreakdown: sourceSessionBreakdown,
            sourceSeatTimeTotal,
        }),
        targetWillChargeTime: false,
        hasOrder: Boolean(hasOrder || orderItems.length > 0),
        hasUnpaidSeatCharges: sourceSeatTimeTotal > 0,
        hasPendingElapsedTime: sourceSessionBreakdown.libreCost > 0,
        hasPendingHours: sourceSessionBreakdown.hourCost > 0,
        hasPendingRounds: sourceSessionBreakdown.pinaCost > 0,
        productInfo: frozen?.productInfo || null,
    };
}

/**
 * Desglosa un item del HISTORIAL_ABONOS en { net, service }.
 * Soporta el formato nuevo (netAmount/serviceAmount) y el legacy
 * (solo amount, con inferencia por factores de servicio comunes).
 */
export function getAbonoBreakdown(item) {
    if (item.netAmount !== undefined) {
        return {
            net: Number(item.netAmount) || 0,
            service: Number(item.serviceAmount) || 0
        };
    }
    const amt = Number(item.amount) || 0;
    const commonFactors = [1.10, 1.08, 1.05];
    for (const factor of commonFactors) {
        const net = Math.round(amt / factor);
        if (net > 0 && Math.abs(net * factor - amt) < 2 && net % 100 === 0) {
            return { net, service: amt - net };
        }
    }
    return { net: amt, service: 0 };
}

/**
 * Descompone el string `session.notes` en sus partes estructuradas.
 */
export function parseSessionNotes(notesStr) {
    if (!notesStr) return { cleanNotes: '', abono: null, abonoMonto: null, historial: [] };
    let ab = null, abM = null, hist = [];
    if (notesStr.includes('|||ABONO:'))
        try { ab = JSON.parse(notesStr.split('|||ABONO:')[1].split('|||')[0].trim()); } catch (_) { /* malformed legacy metadata is ignored */ }
    if (notesStr.includes('|||ABONO_MONTO:'))
        try { abM = JSON.parse(notesStr.split('|||ABONO_MONTO:')[1].split('|||')[0].trim()); } catch (_) { /* malformed legacy metadata is ignored */ }
    if (notesStr.includes('|||HISTORIAL_ABONOS:'))
        try { hist = JSON.parse(notesStr.split('|||HISTORIAL_ABONOS:')[1].split('|||')[0].trim()); } catch (_) { /* malformed legacy metadata is ignored */ }
    const cleanNotes = notesStr.split('|||')[0].trim();
    return { cleanNotes, abono: ab, abonoMonto: abM, historial: Array.isArray(hist) ? hist : [] };
}

/**
 * Reensambla el string `session.notes` desde sus partes.
 * Pasar null/[] en ab/abM/hist para eliminar ese tag del resultado.
 */
export function serializeSessionNotes(clean, ab, abM, hist) {
    let res = clean ? clean.trim() : '';
    if (ab && ab.length > 0) res += ` |||ABONO:${JSON.stringify(ab)}`;
    if (abM) res += ` |||ABONO_MONTO:${JSON.stringify(abM)}`;
    if (hist && hist.length > 0) res += ` |||HISTORIAL_ABONOS:${JSON.stringify(hist)}`;
    return res.trim() || null;
}

/**
 * Retorna el total de abonos que SÍ deben descontarse del grandTotal.
 *
 * Regla semántica:
 *   - itemsRemoved === false  → Abono por monto (artículos PERMANECEN en la comanda).
 *                               El pago fue un adelanto → SÍ restar del grandTotal.
 *   - itemsRemoved === true   → Abono por items (artículos ELIMINADOS de la comanda).
 *                               El grandTotal ya los excluyó → NO restar (doble deducción).
 *   - itemsRemoved === undefined (entradas legacy sin el campo) → Tratar como item-removed
 *                               para ser conservadores con las finanzas → NO restar.
 */
export function getDeductibleAbonoTotal(historial) {
    if (!Array.isArray(historial)) return 0;
    return historial
        .filter(h => h.itemsRemoved === false)
        .reduce((sum, h) => sum + (Number(h.netAmount ?? h.amount) || 0), 0);
}

/**
 * Contexto de abonos previos para un cobro de mesa. ÚNICA fuente de verdad de
 * las reglas de descuento — usada por CashierPaymentModal y useCheckoutPayments
 * para que no vuelvan a divergir:
 *
 *   - Los abonos previos SOLO se descuentan en el cierre definitivo de la mesa
 *     completa. En cobros por asiento (seatId) o abonos parciales (isPartial)
 *     no aplican: descontarlos ahí los acreditaría dos veces.
 *   - El descuento es NETO (netAmount, sin propina/servicio del abono), y los
 *     pagos isAbonoPrevio se inyectan escalados a ese neto para preservar el
 *     invariante: Σ(pagos) + fiado == totalCop de la venta.
 *
 * @returns {{ deductibleTotal: number, entries: Array, injectablePayments: Array }}
 */
export function getPriorAbonoContext(session, { seatId = null, isPartial = false } = {}) {
    const empty = { deductibleTotal: 0, entries: [], injectablePayments: [] };
    if (!session || seatId || isPartial) return empty;

    const { historial } = parseSessionNotes(session.notes || '');
    const entries = historial.filter(h => h.itemsRemoved === false);
    if (entries.length === 0) return empty;

    const deductibleTotal = entries.reduce((s, h) => s + (Number(h.netAmount ?? h.amount) || 0), 0);

    const mkPayment = (methodId, amount) => ({
        id: crypto.randomUUID(),
        methodId: (methodId || 'efectivo').toLowerCase(),
        methodLabel: `${(methodId || 'Efectivo').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} (Abono)`,
        currency: 'COP',
        amountInput: amount,
        amountInputCurrency: 'COP',
        amountUsd: amount,
        amountOriginal: amount,
        amountOriginalCurrency: 'COP',
        amountBs: 0,
        isAbonoPrevio: true,
    });

    const injectablePayments = entries.flatMap(h => {
        const gross = Number(h.amount) || 0;
        const net = Number(h.netAmount ?? h.amount) || 0;
        if (net <= 0) return [];
        // methods guarda montos brutos por método: escalar al neto deducible
        const factor = gross > 0 ? net / gross : 1;
        if (Array.isArray(h.methods) && h.methods.length > 0) {
            return h.methods
                .map(m => mkPayment(m.methodId, round2((Number(m.amountUsd) || 0) * factor)))
                .filter(p => p.amountUsd > 0);
        }
        return [mkPayment(h.method, round2(net))];
    });

    return { deductibleTotal, entries, injectablePayments };
}
