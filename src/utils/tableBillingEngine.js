import { round2 } from './dinero';

export function calculateElapsedTime(startTimeISO) {
    const start = new Date(startTimeISO);
    const now = new Date();
    const diffMs = now - start;
    const diffMinutes = Math.floor(diffMs / 60000);
    return diffMinutes;
}

/**
 * Calcula el desglose de costos de una sesión (piñas + horas por separado).
 * Soporta modo mixto: cualquier sesión puede tener piñas Y horas simultáneamente.
 * Todos los valores son en COP (Pesos Colombianos).
 */
export function calculateSessionCostBreakdown(elapsedMinutes, gameMode, config, hoursPaid = 0, extendedTimes = null, hoursOffset = 0, roundsOffset = 0, seats = null) {
    let pinaCost = 0;
    let hourCost = 0;

    // Piñas: PINA mode siempre tiene piñas.
    // Non-PINA: solo si extended_times > 0 (evita falso positivo por DB default 0).
    const hasPinas = gameMode === 'PINA' || (Number(extendedTimes) > 0);
    if (hasPinas) {
        const basePrice = config.pricePina || 0;
        let rounds;
        if (gameMode === 'PINA') {
            // PINA: la primera piña es implícita → rounds = 1 + extended_times
            rounds = 1 + (Number(extendedTimes) || 0);
        } else {
            // Non-PINA con piñas agregadas: extended_times ES el conteo directo
            rounds = Number(extendedTimes) || 0;
        }
        const billableRounds = Math.max(0, rounds - roundsOffset);
        pinaCost = round2(basePrice * billableRounds);
    }

    // Horas: cualquier sesión con hours_paid > 0 cobra por tiempo
    if (hoursPaid > 0) {
        const pricePerHour = config.pricePerHour || 0;
        const billableHours = Math.max(0, hoursPaid - hoursOffset);
        hourCost = round2(billableHours * pricePerHour);
    }

    // Modo libre eliminado — archivado en ARCHIVED_LIBRE_MODE.md
    const libreCost = 0;
    const isLibre = false;

    return {
        pinaCost,
        hourCost,
        libreCost,
        hasPinas,
        hasHours: hoursPaid > 0,
        isLibre,
        total: round2(pinaCost + hourCost)
    };
}

export function calculateSessionCost(elapsedMinutes, gameMode, config, hoursPaid = 0, extendedTimes = null, paidAt = null, hoursOffset = 0, roundsOffset = 0, seats = null) {
    // Si ya fue cobrada sin liberar, la deuda es $0
    if (paidAt) return 0;

    const breakdown = calculateSessionCostBreakdown(elapsedMinutes, gameMode, config, hoursPaid, extendedTimes, hoursOffset, roundsOffset, seats);
    return breakdown.total;
}

/**
 * Formats elapsed minutes into HH:MM or MM:SS depending on length
 */
export function formatElapsedTime(elapsedMinutes) {
    if (elapsedMinutes < 0) return "00:00";

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
        return { pinaCost: 0, hourCost: 0, libreCost: 0, hasPinas: false, hasHours: false, isLibre: false, total: 0 };
    }
    const totalHours = timeCharges.filter(tc => tc.type === 'hora').reduce((sum, tc) => sum + (Number(tc.amount) || 0), 0);
    const totalPinas = timeCharges.filter(tc => tc.type === 'pina').reduce((sum, tc) => sum + (Number(tc.amount) || 0), 0);
    const hourCost = round2(totalHours * (config.pricePerHour || 0));
    const pinaCost = round2(totalPinas * (config.pricePina || 0));
    return {
        pinaCost,
        hourCost,
        libreCost: 0,
        hasPinas: totalPinas > 0,
        hasHours: totalHours > 0,
        isLibre: false,
        total: round2(hourCost + pinaCost)
    };
}

/**
 * Calcula el costo de UN seat según su gameMode individual.
 * Soporta nuevo estilo (timeCharges) y legacy (gameMode/hoursPaid/pinas).
 * seat: { timeCharges?, gameMode?, hoursPaid?, pinas? }
 */
export function calculateSeatCostBreakdown(seat, elapsedMinutes, config) {
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
        return calculateSessionCostBreakdown(elapsedMinutes, 'PINA', config, 0, pinas - 1);
    }
    if (seat.gameMode === 'HOURS') {
        const hours = seat.hoursPaid || 0;
        return calculateSessionCostBreakdown(elapsedMinutes, 'NORMAL', config, hours, 0);
    }
    // gameMode LIBRE eliminado — retorna $0
    if (seat.gameMode === 'LIBRE') {
        return { pinaCost: 0, hourCost: 0, libreCost: 0, hasPinas: false, hasHours: false, isLibre: false, total: 0 };
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

// Alias de compatibilidad para código que aún use el nombre anterior
export const calculateConsumptionBs = calculateConsumptionCOP;

/**
 * Calcula el desglose completo de una mesa con seats/clientes.
 * Si seats está vacío, retorna null (usar cálculo legacy de sesión).
 * Todos los valores son en COP (Pesos Colombianos).
 */
export function calculateFullTableBreakdown(session, seats, elapsedMinutes, config, orderItems = [], sharedDivision = null, frozenDivisor = null, isTimeFree = false, hoursOffset = 0, roundsOffset = 0) {
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
            seats
        );
    const sharedTimeTotal = sessionTimeCost.total;
    const sharedTotal = round2(sharedConsumptionTotal + sharedTimeTotal);
    const activeCount = (frozenDivisor !== null && frozenDivisor !== undefined && frozenDivisor > 0) ? frozenDivisor : activeSeats.length;

    const getSharedPortion = (seat) => {
        if (seat.paid) return 0;
        if (!sharedDivision || sharedDivision.type === 'equal') {
            return activeCount > 0 ? round2(sharedTotal / activeCount) : 0;
        }
        if (sharedDivision.type === 'custom') {
            return round2(parseFloat(sharedDivision.amounts?.[seat.id]) || 0);
        }
        return activeCount > 0 ? round2(sharedTotal / activeCount) : 0;
    };

    const seatBreakdowns = allSeats.map(seat => {
        const timeCost = calculateSeatCostBreakdown(seat, elapsedMinutes, config);
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
        sharedPerSeat: activeCount > 0 ? round2(sharedTotal / activeCount) : 0,
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
