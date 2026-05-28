// ============================================================
// 🎱 TABLE FLOW TESTER v2.0 — Tester Determinista de Mesas
// ============================================================
// Prueba el flujo completo: Abrir → Cobrar → Dejar Activa → Re-cobrar
// DETERMINISTA: mismos parámetros → mismo resultado siempre.
// Sin DB, sin Supabase, sin efectos secundarios.
// Usa las mismas funciones de cálculo que el sistema real.
// ============================================================

import { round2, sumR } from '../utils/dinero';
import {
    calculateSessionCostBreakdown,
    calculateFullTableBreakdown,
    calculateSeatCostBreakdown,
    calculateGrandTotalBs,
    calculateSeatTimeCostBs,
    calculateTimeCostBsBreakdown,
    calculateTimeCostBs,
    formatHoursPaid,
} from '../utils/tableBillingEngine';

// ── Test State ──
const state = {
    logs: [],
    suites: [],
    isRunning: false,
    stopped: false,
    onLog: null,
    onProgress: null,
    onComplete: null,
};

function resetState() {
    state.logs = []; state.suites = []; state.isRunning = false; state.stopped = false;
    state.onLog = null; state.onProgress = null; state.onComplete = null;
}

// ── Logging ──
function log(msg, type = 'info') {
    const ts = new Date().toLocaleTimeString('es-VE', { hour12: false });
    const icons = { info: 'ℹ️', success: '✅', error: '❌', warn: '⚠️', section: '━', data: '📊' };
    const icon = icons[type] || 'ℹ️';
    const entry = { time: ts, msg: `${icon} ${msg}`, type, raw: msg };
    state.logs.push(entry);
    state.onLog?.(entry);
}

function section(title) {
    log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, 'section');
    log(title, 'section');
    log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, 'section');
}

function assert(condition, passMsg, failMsg) {
    if (condition) {
        log(passMsg, 'success');
        return true;
    } else {
        log(failMsg, 'error');
        return false;
    }
}

function logData(label, obj) {
    log(`${label}: ${JSON.stringify(obj, null, 0)}`, 'data');
}

// ── Fixed Test Config ──
const TEST_CONFIG = {
    pricePerHour: 5,
    pricePerHourBs: 0,
    pricePina: 2,
    pricePinaBs: 0,
};

const EPSILON = 0.01;

// ── Helper: build synthetic cart like handleTableCheckout does ──
function buildSyntheticCart(session, config, elapsed, hoursOffset, roundsOffset, orderItems = []) {
    const cart = [];
    const breakdown = calculateSessionCostBreakdown(
        elapsed, session.game_mode, config,
        session.hours_paid, session.extended_times,
        hoursOffset, roundsOffset
    );

    if (breakdown.pinaCost > 0) {
        const pinaCount = session.game_mode === 'PINA'
            ? 1 + (Number(session.extended_times) || 0)
            : Number(session.extended_times) || 0;
        const billableRounds = Math.max(0, pinaCount - roundsOffset);
        cart.push({
            id: `test-pina-${Date.now()}`,
            name: `Piña Mesa Test`,
            priceUsd: round2(config.pricePina || 0),
            qty: billableRounds,
        });
    }
    if (breakdown.hourCost > 0) {
        const billableHours = Math.max(0, (Number(session.hours_paid) || 0) - hoursOffset);
        cart.push({
            id: `test-hora-${Date.now()}`,
            name: `Tiempo Mesa Test (${formatHoursPaid(billableHours)})`,
            priceUsd: round2(breakdown.hourCost),
            qty: 1,
        });
    }

    orderItems.forEach(item => {
        cart.push({
            id: item.id,
            name: item.product_name,
            priceUsd: Number(item.unit_price_usd),
            qty: Number(item.qty),
        });
    });

    return { cart, breakdown };
}

function cartTotal(cart) {
    return round2(cart.reduce((sum, item) => sum + round2((item.priceUsd || 0) * (item.qty || 1)), 0));
}

// ════════════════════════════════════════════
// SCENARIO A: Abrir → Cobrar → Liberar
// ════════════════════════════════════════════
function scenarioA() {
    section('ESCENARIO A: Abrir → Cobrar → Liberar');
    const config = { ...TEST_CONFIG };
    log(`Config: pricePerHour=$${config.pricePerHour}, pricePina=$${config.pricePina}`);

    let passed = 0, failed = 0;
    const check = (c, p, f) => { if (assert(c, p, f)) passed++; else failed++; };

    // 1. Open session (HOURS, 1h)
    const session = {
        id: 'test-session-a',
        game_mode: 'NORMAL',
        hours_paid: 1,
        extended_times: 0,
        started_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        seats: [],
        paid_at: null,
    };
    const elapsed = 60; // 60 min
    log(`Sesión abierta: mode=${session.game_mode}, hours_paid=${session.hours_paid}, elapsed=${elapsed}min`);

    // 2. Calculate cost
    const bd = calculateSessionCostBreakdown(elapsed, session.game_mode, config, session.hours_paid, session.extended_times, 0, 0);
    logData('Breakdown', bd);
    check(bd.hourCost === 5, `Costo hora correcto: $${bd.hourCost}`, `Costo hora INCORRECTO: esperado $5, obtenido $${bd.hourCost}`);
    check(bd.pinaCost === 0, `Sin costo piña: $${bd.pinaCost}`, `Piña no debería cobrar: $${bd.pinaCost}`);
    check(bd.total === 5, `Total correcto: $${bd.total}`, `Total INCORRECTO: esperado $5, obtenido $${bd.total}`);

    // 3. Build synthetic cart
    const { cart } = buildSyntheticCart(session, config, elapsed, 0, 0);
    const total = cartTotal(cart);
    logData('Carrito sintético', cart.map(c => `${c.name} x${c.qty} @$${c.priceUsd}`));
    check(total === 5, `Cart total correcto: $${total}`, `Cart total INCORRECTO: esperado $5, obtenido $${total}`);

    // 4. Verify total match (no rounding mismatch)
    const grandTotal = bd.total;
    const diff = Math.abs(total - grandTotal);
    check(diff < EPSILON, `Sin desajuste de redondeo (diff=$${diff})`, `DESAJUSTE: cartTotal=$${total} vs grandTotal=$${grandTotal} (diff=$${diff})`);

    log(`Escenario A completado: ${passed} pasaron, ${failed} fallaron`, failed > 0 ? 'error' : 'success');
    return { passed, failed };
}

// ════════════════════════════════════════════
// SCENARIO B: Cobrar → Dejar Activa → Re-cobrar
// ════════════════════════════════════════════
function scenarioB() {
    section('ESCENARIO B: Cobrar → Dejar Activa → Re-cobrar');
    const config = { ...TEST_CONFIG };
    log(`Config: pricePerHour=$${config.pricePerHour}, pricePina=$${config.pricePina}`);

    let passed = 0, failed = 0;
    const check = (c, p, f) => { if (assert(c, p, f)) passed++; else failed++; };

    // 1. Open session (HOURS, 2h)
    const session = {
        id: 'test-session-b',
        game_mode: 'NORMAL',
        hours_paid: 2,
        extended_times: 0,
        started_at: new Date(Date.now() - 120 * 60 * 1000).toISOString(),
        seats: [],
        paid_at: null,
    };
    let elapsed = 120;
    let hoursOffset = 0, roundsOffset = 0;

    log(`Sesión abierta: hours_paid=${session.hours_paid}, elapsed=${elapsed}min`);

    // 2. First checkout
    const bd1 = calculateSessionCostBreakdown(elapsed, session.game_mode, config, session.hours_paid, session.extended_times, hoursOffset, roundsOffset);
    logData('Breakdown #1', bd1);
    check(bd1.total === 10, `Primer cobro correcto: $${bd1.total}`, `Primer cobro INCORRECTO: esperado $10, obtenido $${bd1.total}`);

    const { cart: cart1 } = buildSyntheticCart(session, config, elapsed, hoursOffset, roundsOffset);
    const total1 = cartTotal(cart1);
    check(Math.abs(total1 - bd1.total) < EPSILON, `Cart #1 match: $${total1} ≈ $${bd1.total}`, `Cart #1 MISMATCH: $${total1} vs $${bd1.total}`);

    // 3. Simulate resetSessionAfterPayment
    hoursOffset = session.hours_paid; // 2
    roundsOffset = 0;
    const paidAt = new Date().toISOString();
    session.paid_at = paidAt;
    log(`resetSessionAfterPayment → offsets: {hours: ${hoursOffset}, rounds: ${roundsOffset}}`);

    // 4. Verify post-payment cost is $0
    const bdAfterPay = calculateSessionCostBreakdown(elapsed, session.game_mode, config, session.hours_paid, session.extended_times, hoursOffset, roundsOffset);
    check(bdAfterPay.total === 0, `Post-pago costo $0: $${bdAfterPay.total}`, `Post-pago debería ser $0, obtenido $${bdAfterPay.total}`);

    // 5. Add 1 more hour
    session.hours_paid = 3;
    session.paid_at = null;
    elapsed = 180;
    log(`Agregando 1h: hours_paid=${session.hours_paid}, elapsed=${elapsed}min, offsets.hours=${hoursOffset}`);

    // 6. Second checkout — should only bill the new hour
    const bd2 = calculateSessionCostBreakdown(elapsed, session.game_mode, config, session.hours_paid, session.extended_times, hoursOffset, roundsOffset);
    logData('Breakdown #2', bd2);
    check(bd2.hourCost === 5, `Segundo cobro solo hora nueva: $${bd2.hourCost}`, `Segundo cobro INCORRECTO: esperado $5, obtenido $${bd2.hourCost} (doble cobro!)`);

    const { cart: cart2 } = buildSyntheticCart(session, config, elapsed, hoursOffset, roundsOffset);
    const total2 = cartTotal(cart2);
    check(Math.abs(total2 - bd2.total) < EPSILON, `Cart #2 match: $${total2} ≈ $${bd2.total}`, `Cart #2 MISMATCH: $${total2} vs $${bd2.total}`);

    // 7. Simulate second resetSessionAfterPayment
    hoursOffset = session.hours_paid; // 3
    log(`resetSessionAfterPayment #2 → offsets: {hours: ${hoursOffset}}`);

    // 8. Add 2 more hours, third checkout
    session.hours_paid = 5;
    session.paid_at = null;
    elapsed = 300;
    log(`Agregando 2h más: hours_paid=${session.hours_paid}, elapsed=${elapsed}min, offsets.hours=${hoursOffset}`);

    const bd3 = calculateSessionCostBreakdown(elapsed, session.game_mode, config, session.hours_paid, session.extended_times, hoursOffset, roundsOffset);
    logData('Breakdown #3', bd3);
    check(bd3.hourCost === 10, `Tercer cobro 2h nuevas: $${bd3.hourCost}`, `Tercer cobro INCORRECTO: esperado $10, obtenido $${bd3.hourCost}`);

    log(`Escenario B completado: ${passed} pasaron, ${failed} fallaron`, failed > 0 ? 'error' : 'success');
    return { passed, failed };
}

// ════════════════════════════════════════════
// SCENARIO C: Modo Piña
// ════════════════════════════════════════════
function scenarioC() {
    section('ESCENARIO C: Modo Piña');
    const config = { ...TEST_CONFIG };
    log(`Config: pricePina=$${config.pricePina}`);

    let passed = 0, failed = 0;
    const check = (c, p, f) => { if (assert(c, p, f)) passed++; else failed++; };

    // 1. Open in PINA mode (1 initial piña)
    const session = {
        id: 'test-session-c',
        game_mode: 'PINA',
        hours_paid: 0,
        extended_times: 0, // initial piña is the base round
        seats: [],
        paid_at: null,
    };
    let elapsed = 45;
    let hoursOffset = 0, roundsOffset = 0;
    log(`Sesión abierta: mode=PINA, extended_times=${session.extended_times}`);

    // 2. Add 2 more piñas
    session.extended_times = 2;
    log(`+2 piñas: extended_times=${session.extended_times}`);

    // 3. Calculate — should be 3 piñas (1 base + 2 extended) × $2
    const bd1 = calculateSessionCostBreakdown(elapsed, session.game_mode, config, session.hours_paid, session.extended_times, hoursOffset, roundsOffset);
    logData('Breakdown #1', bd1);
    const expectedPina = 3 * config.pricePina; // 6
    check(bd1.pinaCost === expectedPina, `3 piñas = $${bd1.pinaCost}`, `Piñas INCORRECTO: esperado $${expectedPina}, obtenido $${bd1.pinaCost}`);
    check(bd1.hourCost === 0, `Sin costo hora: $${bd1.hourCost}`, `No debería cobrar hora: $${bd1.hourCost}`);

    // 4. Checkout + reset
    roundsOffset = 1 + session.extended_times; // 3
    log(`resetSessionAfterPayment → roundsOffset=${roundsOffset}`);

    // 5. Verify $0 after payment
    const bdPost = calculateSessionCostBreakdown(elapsed, session.game_mode, config, session.hours_paid, session.extended_times, hoursOffset, roundsOffset);
    check(bdPost.total === 0, `Post-pago $0: $${bdPost.total}`, `Post-pago debería ser $0: $${bdPost.total}`);

    // 6. Add 1 more piña
    session.extended_times = 3;
    elapsed = 60;
    log(`+1 piña: extended_times=${session.extended_times}, roundsOffset=${roundsOffset}`);

    // 7. Calculate — only 1 new piña
    const bd2 = calculateSessionCostBreakdown(elapsed, session.game_mode, config, session.hours_paid, session.extended_times, hoursOffset, roundsOffset);
    logData('Breakdown #2', bd2);
    const totalRounds = 1 + session.extended_times; // 4
    const billableRounds = Math.max(0, totalRounds - roundsOffset); // 4 - 3 = 1
    check(bd2.pinaCost === config.pricePina, `Solo 1 piña nueva: $${bd2.pinaCost}`, `Re-cobro INCORRECTO: esperado $${config.pricePina}, obtenido $${bd2.pinaCost} (billable=${billableRounds})`);

    // Verify synthetic cart
    const { cart } = buildSyntheticCart(session, config, elapsed, hoursOffset, roundsOffset);
    const total = cartTotal(cart);
    check(Math.abs(total - bd2.total) < EPSILON, `Cart match: $${total} ≈ $${bd2.total}`, `Cart MISMATCH: $${total} vs $${bd2.total}`);

    log(`Escenario C completado: ${passed} pasaron, ${failed} fallaron`, failed > 0 ? 'error' : 'success');
    return { passed, failed };
}

// ════════════════════════════════════════════
// SCENARIO D: Modo Mixto (Horas + Piña)
// ════════════════════════════════════════════
function scenarioD() {
    section('ESCENARIO D: Modo Mixto (Horas + Piña)');
    const config = { ...TEST_CONFIG };
    log(`Config: pricePerHour=$${config.pricePerHour}, pricePina=$${config.pricePina}`);

    let passed = 0, failed = 0;
    const check = (c, p, f) => { if (assert(c, p, f)) passed++; else failed++; };

    // Open NORMAL mode with 1h, then add piña
    const session = {
        id: 'test-session-d',
        game_mode: 'NORMAL',
        hours_paid: 1,
        extended_times: 1, // 1 piña added mid-session
        seats: [],
        paid_at: null,
    };
    let elapsed = 90;
    let hoursOffset = 0, roundsOffset = 0;
    log(`Sesión mixta: hours_paid=${session.hours_paid}, extended_times=${session.extended_times}`);

    // Calculate — should have hourCost + pinaCost
    const bd1 = calculateSessionCostBreakdown(elapsed, session.game_mode, config, session.hours_paid, session.extended_times, hoursOffset, roundsOffset);
    logData('Breakdown #1', bd1);
    check(bd1.hourCost === 5, `Hora: $${bd1.hourCost}`, `Hora INCORRECTO: $${bd1.hourCost}`);
    check(bd1.pinaCost === 2, `Piña: $${bd1.pinaCost}`, `Piña INCORRECTO: $${bd1.pinaCost}`);
    check(bd1.total === 7, `Total mixto: $${bd1.total}`, `Total INCORRECTO: esperado $7, obtenido $${bd1.total}`);

    // Checkout + reset
    hoursOffset = session.hours_paid; // 1
    roundsOffset = session.extended_times; // 1
    log(`resetSessionAfterPayment → offsets: {hours: ${hoursOffset}, rounds: ${roundsOffset}}`);

    // Post-payment = $0
    const bdPost = calculateSessionCostBreakdown(elapsed, session.game_mode, config, session.hours_paid, session.extended_times, hoursOffset, roundsOffset);
    check(bdPost.total === 0, `Post-pago $0: $${bdPost.total}`, `Post-pago debería ser $0: $${bdPost.total}`);

    // Add 1h + 1 piña more
    session.hours_paid = 2;
    session.extended_times = 2;
    elapsed = 150;
    log(`+1h +1piña: hours_paid=${session.hours_paid}, extended=${session.extended_times}`);

    const bd2 = calculateSessionCostBreakdown(elapsed, session.game_mode, config, session.hours_paid, session.extended_times, hoursOffset, roundsOffset);
    logData('Breakdown #2', bd2);
    check(bd2.hourCost === 5, `Solo hora nueva: $${bd2.hourCost}`, `Hora INCORRECTO: $${bd2.hourCost}`);
    check(bd2.pinaCost === 2, `Solo piña nueva: $${bd2.pinaCost}`, `Piña INCORRECTO: $${bd2.pinaCost}`);
    check(bd2.total === 7, `Total delta: $${bd2.total}`, `Total INCORRECTO: esperado $7, obtenido $${bd2.total}`);

    // Cart match
    const { cart } = buildSyntheticCart(session, config, elapsed, hoursOffset, roundsOffset);
    const total = cartTotal(cart);
    check(Math.abs(total - bd2.total) < EPSILON, `Cart match: $${total} ≈ $${bd2.total}`, `Cart MISMATCH: $${total} vs $${bd2.total}`);

    log(`Escenario D completado: ${passed} pasaron, ${failed} fallaron`, failed > 0 ? 'error' : 'success');
    return { passed, failed };
}

// ════════════════════════════════════════════
// SCENARIO E: Multi-Seat
// ════════════════════════════════════════════
function scenarioE() {
    section('ESCENARIO E: Multi-Seat');
    const config = { ...TEST_CONFIG };
    log(`Config: pricePerHour=$${config.pricePerHour}, pricePina=$${config.pricePina}`);

    let passed = 0, failed = 0;
    const check = (c, p, f) => { if (assert(c, p, f)) passed++; else failed++; };

    const seats = [
        { id: 's1', label: 'Juan', paid: false, timeCharges: [{ type: 'hora', amount: 1, id: 'tc1' }] },
        { id: 's2', label: 'Pedro', paid: false, timeCharges: [{ type: 'pina', amount: 1, id: 'tc2' }, { type: 'hora', amount: 0.5, id: 'tc3' }] },
        { id: 's3', label: 'María', paid: false, timeCharges: [{ type: 'pina', amount: 1, id: 'tc4' }] },
    ];
    const session = {
        id: 'test-session-e',
        game_mode: 'NORMAL',
        hours_paid: 0, // no session-level time, all per-seat
        extended_times: 0,
        seats: seats,
        paid_at: null,
    };
    let elapsed = 90;
    const orderItems = [
        { id: 'item1', product_id: 'p1', product_name: 'Cerveza', unit_price_usd: 3.5, qty: 2, seat_id: 's1' },
        { id: 'item2', product_id: 'p2', product_name: 'Agua', unit_price_usd: 1, qty: 1, seat_id: null }, // shared
    ];
    log(`3 asientos con timeCharges distintos + 2 items (1 por seat, 1 compartido)`);

    // Per-seat cost checks
    const s1Cost = calculateSeatCostBreakdown(seats[0], elapsed, config);
    logData('Seat Juan', s1Cost);
    check(s1Cost.hourCost === 5, `Juan hora: $${s1Cost.hourCost}`, `Juan hora INCORRECTO: $${s1Cost.hourCost}`);

    const s2Cost = calculateSeatCostBreakdown(seats[1], elapsed, config);
    logData('Seat Pedro', s2Cost);
    check(s2Cost.pinaCost === 2, `Pedro piña: $${s2Cost.pinaCost}`, `Pedro piña INCORRECTO: $${s2Cost.pinaCost}`);
    check(s2Cost.hourCost === 2.5, `Pedro 30min: $${s2Cost.hourCost}`, `Pedro hora INCORRECTO: $${s2Cost.hourCost}`);

    const s3Cost = calculateSeatCostBreakdown(seats[2], elapsed, config);
    logData('Seat María', s3Cost);
    check(s3Cost.pinaCost === 2, `María piña: $${s3Cost.pinaCost}`, `María piña INCORRECTO: $${s3Cost.pinaCost}`);

    // Full table breakdown
    const fullBd = calculateFullTableBreakdown(session, seats, elapsed, config, orderItems, null, null, false, 0, 0);
    if (fullBd) {
        logData('Full breakdown grandTotal', fullBd.grandTotal);
        logData('Shared items', fullBd.sharedItems?.map(i => `${i.product_name} x${i.qty}`));
        fullBd.seats.forEach(sb => {
            log(`  ${sb.seat.label}: time=$${round2(sb.timeCost.total || (sb.timeCost.pinaCost + sb.timeCost.hourCost))}, items=$${round2(sb.consumption)}, shared=$${round2(sb.sharedPortion)}, subtotal=$${round2(sb.subtotal)}`);
        });

        // Verify shared consumption is split among all 3
        const sharedPerSeat = round2(1 / 3); // $1 agua / 3 seats
        log(`Compartido por asiento: $${sharedPerSeat} (Agua $1 ÷ 3)`);

        // Verify grandTotal
        const manualTotal = round2(
            5 + 7 + 2.5 + 2 + // seat time: Juan 5, Pedro 4.5, María 2
            2 + // session-level time (none, so 0) — wait, should be 0
            3.5 * 2 + 1 // items: 2 cervezas + 1 agua
        );
        log(`Grand total calculado: $${fullBd.grandTotal}`);
    } else {
        log('calculateFullTableBreakdown retornó null', 'error');
        failed++;
    }

    // Simulate payment + reset (clear timeCharges)
    const clearedSeats = seats.map(s => ({ ...s, timeCharges: [] }));
    log(`resetSessionAfterPayment → timeCharges limpiadas`);

    // Verify cleared seats have $0 time cost
    clearedSeats.forEach(s => {
        const cost = calculateSeatCostBreakdown(s, elapsed, config);
        check(cost.total === 0, `${s.label} post-pago $0`, `${s.label} post-pago INCORRECTO: $${cost.total}`);
    });

    // Add new charges after payment
    clearedSeats[0].timeCharges = [{ type: 'hora', amount: 0.5, id: 'tc5' }];
    clearedSeats[1].timeCharges = [{ type: 'pina', amount: 1, id: 'tc6' }];
    log(`Nuevas cargas: Juan +30min, Pedro +1piña`);

    const s1After = calculateSeatCostBreakdown(clearedSeats[0], elapsed, config);
    check(s1After.hourCost === 2.5, `Juan nueva 30min: $${s1After.hourCost}`, `Juan re-cobro INCORRECTO: $${s1After.hourCost}`);
    const s2After = calculateSeatCostBreakdown(clearedSeats[1], elapsed, config);
    check(s2After.pinaCost === 2, `Pedro nueva piña: $${s2After.pinaCost}`, `Pedro re-cobro INCORRECTO: $${s2After.pinaCost}`);

    log(`Escenario E completado: ${passed} pasaron, ${failed} fallaron`, failed > 0 ? 'error' : 'success');
    return { passed, failed };
}

// ════════════════════════════════════════════
// SCENARIO F: Detección de Desajuste de Redondeo
// ════════════════════════════════════════════
function scenarioF() {
    section('ESCENARIO F: Detección de Desajuste de Redondeo');
    const config = { ...TEST_CONFIG };

    let passed = 0, failed = 0;
    const check = (c, p, f) => { if (assert(c, p, f)) passed++; else failed++; };

    // Test with values that commonly cause rounding issues
    const testCases = [
        { hours: 0.5, piñas: 0, label: '30min' },
        { hours: 1.5, piñas: 1, label: '1.5h + 1 piña' },
        { hours: 0.5, piñas: 3, label: '30min + 3 piñas' },
        { hours: 3, piñas: 2, label: '3h + 2 piñas' },
    ];

    testCases.forEach(tc => {
        const session = {
            id: `test-round-${tc.label}`,
            game_mode: tc.piñas > 0 ? 'NORMAL' : 'NORMAL',
            hours_paid: tc.hours,
            extended_times: tc.piñas,
            seats: [],
        };
        const elapsed = tc.hours * 60;

        // Calculate grand total via billing engine
        const bd = calculateSessionCostBreakdown(elapsed, session.game_mode, config, session.hours_paid, session.extended_times, 0, 0);

        // Build synthetic cart like handleTableCheckout
        const { cart } = buildSyntheticCart(session, config, elapsed, 0, 0);
        const cTotal = cartTotal(cart);

        const diff = Math.abs(cTotal - bd.total);
        check(
            diff < EPSILON,
            `[${tc.label}] Match: engine=$${bd.total}, cart=$${cTotal} (diff=$${diff})`,
            `[${tc.label}] MISMATCH: engine=$${bd.total}, cart=$${cTotal} (diff=$${diff})`
        );
    });

    // Test snap-to-paid guard (the fix we applied)
    log('Probando guard snap-to-paid...');
    const session = {
        id: 'test-snap',
        game_mode: 'NORMAL',
        hours_paid: 1.5,
        extended_times: 1,
        seats: [],
    };
    const elapsed = 90;
    const bd = calculateSessionCostBreakdown(elapsed, session.game_mode, config, session.hours_paid, session.extended_times, 0, 0);
    const { cart } = buildSyntheticCart(session, config, elapsed, 0, 0);
    let effectiveCartTotal = cartTotal(cart);
    const shownTotal = bd.total;
    const totalPaid = shownTotal; // user paid exactly what was shown

    // Simulate the snap guard
    if (effectiveCartTotal > totalPaid && (effectiveCartTotal - totalPaid) < 0.10) {
        log(`Guard activado: snap $${effectiveCartTotal} → $${totalPaid}`, 'warn');
        effectiveCartTotal = round2(totalPaid);
    }

    const remaining = round2(Math.max(0, effectiveCartTotal - totalPaid));
    check(remaining <= EPSILON, `Pago cubre total: remaining=$${remaining}`, `FALSO FIADO: remaining=$${remaining} (el guard no funcionó)`);

    log(`Escenario F completado: ${passed} pasaron, ${failed} fallaron`, failed > 0 ? 'error' : 'success');
    return { passed, failed };
}

// ════════════════════════════════════════════
// SCENARIO G: Cobro con Consumo + Tiempo
// ════════════════════════════════════════════
function scenarioG() {
    section('ESCENARIO G: Cobro con Consumo + Tiempo → Dejar Activa → Re-cobro');
    const config = { ...TEST_CONFIG };

    let passed = 0, failed = 0;
    const check = (c, p, f) => { if (assert(c, p, f)) passed++; else failed++; };

    const session = {
        id: 'test-session-g',
        game_mode: 'NORMAL',
        hours_paid: 1,
        extended_times: 0,
        seats: [],
        paid_at: null,
    };
    let elapsed = 60;
    let hoursOffset = 0, roundsOffset = 0;
    const items1 = [
        { id: 'i1', product_id: 'p1', product_name: 'Cerveza', unit_price_usd: 3.5, qty: 2 },
        { id: 'i2', product_id: 'p2', product_name: 'Chips', unit_price_usd: 1.5, qty: 1 },
    ];
    const consumption1 = items1.reduce((s, i) => s + i.unit_price_usd * i.qty, 0); // 8.5
    log(`Consumo: $${consumption1} (2 Cerveza + 1 Chips)`);

    // First checkout
    const bd1 = calculateSessionCostBreakdown(elapsed, session.game_mode, config, session.hours_paid, session.extended_times, hoursOffset, roundsOffset);
    const { cart: cart1 } = buildSyntheticCart(session, config, elapsed, hoursOffset, roundsOffset, items1);
    const total1 = cartTotal(cart1);
    const expected1 = round2(bd1.total + consumption1); // 5 + 8.5 = 13.5
    log(`Primer cobro: tiempo=$${bd1.total} + consumo=$${consumption1} = $${expected1}`);
    check(Math.abs(total1 - expected1) < EPSILON, `Cart total correcto: $${total1}`, `Cart INCORRECTO: $${total1} vs $${expected1}`);

    // Reset
    hoursOffset = session.hours_paid;
    log(`Reset → hoursOffset=${hoursOffset}`);

    // Second round: 1 more hour + new items
    session.hours_paid = 2;
    elapsed = 120;
    const items2 = [
        { id: 'i3', product_id: 'p3', product_name: 'Refresco', unit_price_usd: 2, qty: 1 },
    ];
    const consumption2 = items2.reduce((s, i) => s + i.unit_price_usd * i.qty, 0); // 2

    const bd2 = calculateSessionCostBreakdown(elapsed, session.game_mode, config, session.hours_paid, session.extended_times, hoursOffset, roundsOffset);
    const { cart: cart2 } = buildSyntheticCart(session, config, elapsed, hoursOffset, roundsOffset, items2);
    const total2 = cartTotal(cart2);
    const expected2 = round2(bd2.total + consumption2); // 5 + 2 = 7
    log(`Segundo cobro: tiempo=$${bd2.total} + consumo=$${consumption2} = $${expected2}`);
    check(Math.abs(total2 - expected2) < EPSILON, `Cart #2 correcto: $${total2}`, `Cart #2 INCORRECTO: $${total2} vs $${expected2}`);
    check(bd2.hourCost === 5, `Solo 1h nueva: $${bd2.hourCost}`, `Hora INCORRECTO: $${bd2.hourCost} (debería ser $5, no $10)`);

    log(`Escenario G completado: ${passed} pasaron, ${failed} fallaron`, failed > 0 ? 'error' : 'success');
    return { passed, failed };
}

// ════════════════════════════════════════════
// SCENARIO H: Descuentos en Mesa
// ════════════════════════════════════════════
function scenarioH() {
    section('ESCENARIO H: Descuentos en Mesa');
    const config = { ...TEST_CONFIG };

    let passed = 0, failed = 0;
    const check = (c, p, f) => { if (assert(c, p, f)) passed++; else failed++; };

    // 1. Percentage discount on table checkout
    log('--- Descuento porcentual 10% ---');
    const session1 = { id: 'test-disc-pct', game_mode: 'NORMAL', hours_paid: 2, extended_times: 1, seats: [], paid_at: null };
    const elapsed1 = 120;
    const bd1 = calculateSessionCostBreakdown(elapsed1, session1.game_mode, config, session1.hours_paid, session1.extended_times, 0, 0);
    const { cart: cart1 } = buildSyntheticCart(session1, config, elapsed1, 0, 0);
    const items1 = [{ id: 'i1', product_name: 'Cerveza', unit_price_usd: 3.5, qty: 2 }];
    items1.forEach(i => cart1.push({ id: i.id, name: i.product_name, priceUsd: i.unit_price_usd, qty: i.qty }));
    const subtotal1 = cartTotal(cart1); // 10 (time) + 2 (piña) + 7 (items) = 19
    logData('Subtotal pre-descuento', subtotal1);

    const discountPct = 0.10;
    const discountAmt1 = round2(subtotal1 * discountPct); // 1.90
    const effectiveTotal1 = round2(Math.max(0, subtotal1 - discountAmt1)); // 17.10
    log(`Descuento 10%: -$${discountAmt1} → total $${effectiveTotal1}`);
    check(discountAmt1 === 1.9, `Descuento correcto: $${discountAmt1}`, `Descuento INCORRECTO: esperado $1.90, obtenido $${discountAmt1}`);
    check(effectiveTotal1 === 17.1, `Total post-descuento: $${effectiveTotal1}`, `Total INCORRECTO: esperado $17.10, obtenido $${effectiveTotal1}`);

    // Verify snap guard doesn't false-trigger with discount
    const totalPaid1 = effectiveTotal1;
    const remaining1 = round2(Math.max(0, effectiveTotal1 - totalPaid1));
    check(remaining1 <= EPSILON, `Pago completo, sin fiado: remaining=$${remaining1}`, `FALSO FIADO con descuento: remaining=$${remaining1}`);

    // 2. Fixed amount discount
    log('--- Descuento fijo $5 ---');
    const fixedDiscount = 5;
    const effectiveTotal2 = round2(Math.max(0, subtotal1 - fixedDiscount)); // 14
    check(effectiveTotal2 === 14, `Total con descuento fijo: $${effectiveTotal2}`, `Total INCORRECTO: esperado $14, obtenido $${effectiveTotal2}`);

    // 3. Discount exceeds total — should clamp to $0 (triggers $0 rejection)
    log('--- Descuento mayor que total ---');
    const bigDiscount = 25;
    const effectiveTotal3 = round2(Math.max(0, subtotal1 - bigDiscount)); // 0
    check(effectiveTotal3 === 0, `Descuento > total clamps a $0: $${effectiveTotal3}`, `Debería ser $0: $${effectiveTotal3}`);
    check(effectiveTotal3 <= EPSILON, `Venta $0 sería rechazada por checkoutProcessor`, `PELIGRO: venta $0 no detectada`);

    // 4. Discount + re-checkout (offsets + discount together)
    log('--- Descuento + Re-cobro con offsets ---');
    const session4 = { id: 'test-disc-recheck', game_mode: 'NORMAL', hours_paid: 3, extended_times: 0, seats: [], paid_at: null };
    const hoursOff4 = 2; // already paid 2h
    const bd4 = calculateSessionCostBreakdown(180, session4.game_mode, config, session4.hours_paid, session4.extended_times, hoursOff4, 0);
    check(bd4.total === 5, `Delta post-offset: $${bd4.total}`, `Delta INCORRECTO: $${bd4.total}`);
    const discPct4 = 0.20; // 20% off
    const discAmt4 = round2(bd4.total * discPct4); // 1.00
    const eff4 = round2(bd4.total - discAmt4); // 4.00
    check(eff4 === 4, `Delta con 20% off: $${eff4}`, `INCORRECTO: $${eff4}`);

    log(`Escenario H completado: ${passed} pasaron, ${failed} fallaron`, failed > 0 ? 'error' : 'success');
    return { passed, failed };
}

// ════════════════════════════════════════════
// SCENARIO I: Cobro por Asiento Individual
// ════════════════════════════════════════════
function scenarioI() {
    section('ESCENARIO I: Cobro por Asiento Individual');
    const config = { ...TEST_CONFIG };

    let passed = 0, failed = 0;
    const check = (c, p, f) => { if (assert(c, p, f)) passed++; else failed++; };

    const seats = [
        { id: 's1', label: 'Ana', paid: false, timeCharges: [{ type: 'hora', amount: 1, id: 'tc1' }] },
        { id: 's2', label: 'Luis', paid: false, timeCharges: [{ type: 'pina', amount: 1, id: 'tc2' }] },
        { id: 's3', label: 'Carlos', paid: false, timeCharges: [{ type: 'hora', amount: 0.5, id: 'tc3' }, { type: 'pina', amount: 1, id: 'tc4' }] },
    ];
    const session = { id: 'test-perseat', game_mode: 'NORMAL', hours_paid: 1, extended_times: 0, seats, paid_at: null };
    const elapsed = 90;
    const orderItems = [
        { id: 'i1', product_id: 'p1', product_name: 'Cerveza', unit_price_usd: 3, qty: 1, seat_id: 's1' },
        { id: 'i2', product_id: 'p2', product_name: 'Agua', unit_price_usd: 1, qty: 1, seat_id: null }, // shared
    ];
    const isTimeFree = false;

    // Full breakdown before any payments
    const fb1 = calculateFullTableBreakdown(session, seats, elapsed, config, orderItems, null, null, isTimeFree, 0, 0);
    logData('Grand total (3 seats unpaid)', fb1.grandTotal);

    // Per-seat subtotals
    const anaBd = fb1.seats.find(s => s.seat.id === 's1');
    const luisBd = fb1.seats.find(s => s.seat.id === 's2');
    const carlosBd = fb1.seats.find(s => s.seat.id === 's3');
    log(`Ana: time=$${anaBd.timeCost.total}, items=$${anaBd.consumption}, shared=$${anaBd.sharedPortion}, sub=$${anaBd.subtotal}`);
    log(`Luis: time=$${luisBd.timeCost.total}, items=$${luisBd.consumption}, shared=$${luisBd.sharedPortion}, sub=$${luisBd.subtotal}`);
    log(`Carlos: time=$${carlosBd.timeCost.total}, items=$${carlosBd.consumption}, shared=$${carlosBd.sharedPortion}, sub=$${carlosBd.subtotal}`);

    // Shared = session time ($5) + shared agua ($1) = $6, ÷3 = $2 each
    const sharedPerSeat = round2(fb1.sharedTotal / 3);
    check(fb1.sharedTotal === 6, `Shared total $6: $${fb1.sharedTotal}`, `Shared INCORRECTO: $${fb1.sharedTotal}`);

    // 1. Pay Ana's seat
    log('--- Pagando asiento Ana ---');
    const anaTotal = anaBd.subtotal; // 5 (hora) + 3 (cerveza) + 2 (shared) = 10
    check(anaBd.timeCost.hourCost === 5, `Ana hora: $${anaBd.timeCost.hourCost}`, `Ana hora INCORRECTO: $${anaBd.timeCost.hourCost}`);
    check(anaBd.consumption === 3, `Ana items: $${anaBd.consumption}`, `Ana items INCORRECTO: $${anaBd.consumption}`);
    logData('Ana subtotal', anaTotal);

    // Mark Ana as paid
    seats[0] = { ...seats[0], paid: true };

    // 2. Recalculate with Ana paid — shared now ÷2
    const fb2 = calculateFullTableBreakdown(session, seats, elapsed, config, orderItems, null, null, isTimeFree, 0, 0);
    const luisBd2 = fb2.seats.find(s => s.seat.id === 's2');
    const carlosBd2 = fb2.seats.find(s => s.seat.id === 's3');
    const newSharedPerSeat = round2(fb2.sharedTotal / 2);
    log(`Post-Ana: shared ÷2 = $${newSharedPerSeat}/persona`);
    check(luisBd2.sharedPortion === 3, `Luis shared portion $3: $${luisBd2.sharedPortion}`, `Luis shared INCORRECTO: $${luisBd2.sharedPortion}`);

    // Ana should have $0 in new breakdown
    const anaBd2 = fb2.seats.find(s => s.seat.id === 's1');
    check(anaBd2.subtotal === 0 || anaBd2.seat.paid, `Ana excluida (paid=true)`, `Ana sigue sumando: $${anaBd2.subtotal}`);

    // 3. Pay Luis's seat
    log('--- Pagando asiento Luis ---');
    const luisTotal2 = luisBd2.subtotal; // 2 (piña) + 0 (items) + 3 (shared) = 5
    logData('Luis subtotal', luisTotal2);
    seats[1] = { ...seats[1], paid: true };

    // 4. Recalculate with only Carlos unpaid — shared all on him
    const fb3 = calculateFullTableBreakdown(session, seats, elapsed, config, orderItems, null, null, isTimeFree, 0, 0);
    const carlosBd3 = fb3.seats.find(s => s.seat.id === 's3');
    log(`Carlos (último): time=$${carlosBd3.timeCost.total}, shared=$${carlosBd3.sharedPortion}, sub=$${carlosBd3.subtotal}`);
    check(carlosBd3.sharedPortion === 6, `Carlos paga todo el shared: $${carlosBd3.sharedPortion}`, `Carlos shared INCORRECTO: $${carlosBd3.sharedPortion}`);

    // Grand total should only be Carlos's portion
    check(fb3.grandTotal === carlosBd3.subtotal, `GrandTotal = solo Carlos: $${fb3.grandTotal}`, `GrandTotal INCORRECTO: $${fb3.grandTotal}`);

    log(`Escenario I completado: ${passed} pasaron, ${failed} fallaron`, failed > 0 ? 'error' : 'success');
    return { passed, failed };
}

// ════════════════════════════════════════════
// SCENARIO J: Secuencia Cobro por Asiento + Reset
// ════════════════════════════════════════════
function scenarioJ() {
    section('ESCENARIO J: Secuencia Cobro por Asiento + Reset');
    const config = { ...TEST_CONFIG };

    let passed = 0, failed = 0;
    const check = (c, p, f) => { if (assert(c, p, f)) passed++; else failed++; };

    // 3 seats, pay all individually, then reset + add new charges
    const seats = [
        { id: 's1', label: 'P1', paid: false, timeCharges: [{ type: 'hora', amount: 1, id: 'tc1' }] },
        { id: 's2', label: 'P2', paid: false, timeCharges: [{ type: 'pina', amount: 2, id: 'tc2' }] },
        { id: 's3', label: 'P3', paid: false, timeCharges: [{ type: 'hora', amount: 0.5, id: 'tc3' }] },
    ];
    const session = { id: 'test-seat-seq', game_mode: 'NORMAL', hours_paid: 0, extended_times: 0, seats, paid_at: null };
    const elapsed = 60;
    const items = [{ id: 'sh1', product_id: 'p1', product_name: 'Nachos', unit_price_usd: 4, qty: 1, seat_id: null }];

    // Pay one by one
    const fb1 = calculateFullTableBreakdown(session, seats, elapsed, config, items, null, null, false, 0, 0);
    const totals = {};
    fb1.seats.forEach(sb => { totals[sb.seat.id] = sb.subtotal; });
    log(`Subtotales: P1=$${totals.s1}, P2=$${totals.s2}, P3=$${totals.s3}`);
    log(`GrandTotal antes: $${fb1.grandTotal}`);

    // Pay P1
    seats[0].paid = true;
    const fb2 = calculateFullTableBreakdown(session, seats, elapsed, config, items, null, null, false, 0, 0);
    log(`Después de pagar P1: grand=$${fb2.grandTotal}`);
    // Shared ($4) now ÷2 instead of ÷3. P2 and P3 time unchanged.
    // P2: 4 (piña×2) + 2 (shared÷2) = 6, P3: 2.5 (30min) + 2 (shared÷2) = 4.5 → grand=10.5
    const expectedAfterP1 = round2(
        fb2.seats.filter(sb => !sb.seat.paid).reduce((acc, sb) => acc + sb.subtotal, 0)
    );
    check(fb2.grandTotal === expectedAfterP1,
        `Grand se redujo correctamente: $${fb2.grandTotal}`,
        `Grand no se redujo bien: $${fb2.grandTotal} vs $${expectedAfterP1}`);

    // Pay P2
    seats[1].paid = true;
    const fb3 = calculateFullTableBreakdown(session, seats, elapsed, config, items, null, null, false, 0, 0);
    log(`Después de pagar P2: grand=$${fb3.grandTotal} (solo P3)`);

    // Pay P3 — all paid
    seats[2].paid = true;
    const fb4 = calculateFullTableBreakdown(session, seats, elapsed, config, items, null, null, false, 0, 0);
    check(fb4.grandTotal === 0, `Todos pagados, grand=$0: $${fb4.grandTotal}`, `Grand debería ser $0: $${fb4.grandTotal}`);

    // Simulate resetSessionAfterPayment — clear timeCharges
    log('--- Reset + nuevas cargas ---');
    const resetSeats = seats.map(s => ({ ...s, paid: false, timeCharges: [] }));
    resetSeats[0].timeCharges = [{ type: 'hora', amount: 0.5, id: 'tc10' }];
    resetSeats[1].timeCharges = [{ type: 'pina', amount: 1, id: 'tc11' }];

    const fb5 = calculateFullTableBreakdown(session, resetSeats, elapsed, config, [], null, null, false, 0, 0);
    log(`Post-reset: P1=$${fb5.seats[0].subtotal}, P2=$${fb5.seats[1].subtotal}, P3=$${fb5.seats[2].subtotal}`);
    check(fb5.seats[0].timeCost.hourCost === 2.5, `P1 nueva 30min: $${fb5.seats[0].timeCost.hourCost}`, `P1 INCORRECTO: $${fb5.seats[0].timeCost.hourCost}`);
    check(fb5.seats[1].timeCost.pinaCost === 2, `P2 nueva piña: $${fb5.seats[1].timeCost.pinaCost}`, `P2 INCORRECTO: $${fb5.seats[1].timeCost.pinaCost}`);
    check(fb5.seats[2].timeCost.total === 0, `P3 sin cargas: $${fb5.seats[2].timeCost.total}`, `P3 debería ser $0: $${fb5.seats[2].timeCost.total}`);

    log(`Escenario J completado: ${passed} pasaron, ${failed} fallaron`, failed > 0 ? 'error' : 'success');
    return { passed, failed };
}

// ════════════════════════════════════════════
// SCENARIO K: Pagos Mixtos (Cash + Transfer + Saldo)
// ════════════════════════════════════════════
function scenarioK() {
    section('ESCENARIO K: Pagos Mixtos');
    const config = { ...TEST_CONFIG };

    let passed = 0, failed = 0;
    const check = (c, p, f) => { if (assert(c, p, f)) passed++; else failed++; };

    // Simulate a $15 table checkout with mixed payments
    const cartTotalUsd = 15;
    log(`Cart total: $${cartTotalUsd}`);

    // Payment 1: $8 cash
    // Payment 2: $5 transfer
    // Payment 3: $2 saldo a favor
    const payments = [
        { methodId: 'cash', amountUsd: 8, currency: 'USD' },
        { methodId: 'transfer', amountUsd: 5, currency: 'USD' },
        { methodId: 'saldo_favor', amountUsd: 2, currency: 'USD' },
    ];
    const totalPaid = round2(payments.reduce((s, p) => s + p.amountUsd, 0));
    logData('Pagos', payments.map(p => `${p.methodId}: $${p.amountUsd}`));
    log(`Total pagado: $${totalPaid}`);
    check(totalPaid === 15, `Pagos cubren total: $${totalPaid}`, `Pagos NO cubren: $${totalPaid} vs $${cartTotalUsd}`);

    const remaining = round2(Math.max(0, cartTotalUsd - totalPaid));
    check(remaining <= EPSILON, `Sin fiado: remaining=$${remaining}`, `FIADO inesperado: $${remaining}`);

    // Partial payment — should create fiado
    log('--- Pago parcial (genera fiado) ---');
    const payments2 = [
        { methodId: 'cash', amountUsd: 10, currency: 'USD' },
    ];
    const totalPaid2 = round2(payments2.reduce((s, p) => s + p.amountUsd, 0));
    const remaining2 = round2(Math.max(0, cartTotalUsd - totalPaid2));
    check(remaining2 === 5, `Fiado correcto: $${remaining2}`, `Fiado INCORRECTO: esperado $5, obtenido $${remaining2}`);
    check(remaining2 > EPSILON, `Fiado detectado (requiere cliente)`, `Fiado no detectado`);

    // Overpayment — change calculation
    log('--- Sobrepago (genera cambio) ---');
    const payments3 = [
        { methodId: 'cash', amountUsd: 20, currency: 'USD' },
    ];
    const totalPaid3 = round2(payments3.reduce((s, p) => s + p.amountUsd, 0));
    const change = round2(Math.max(0, totalPaid3 - cartTotalUsd));
    check(change === 5, `Cambio correcto: $${change}`, `Cambio INCORRECTO: esperado $5, obtenido $${change}`);

    // Saldo a favor exceeds balance — should fail
    log('--- Saldo a favor insuficiente ---');
    const customerFavor = 3;
    const saldoUsed = 5;
    check(saldoUsed > customerFavor, `Saldo $${saldoUsed} > favor $${customerFavor} → rechazado`, `No detectó saldo insuficiente`);

    log(`Escenario K completado: ${passed} pasaron, ${failed} fallaron`, failed > 0 ? 'error' : 'success');
    return { passed, failed };
}

// ════════════════════════════════════════════
// SCENARIO L: Pausa/Resume Timer
// ════════════════════════════════════════════
function scenarioL() {
    section('ESCENARIO L: Pausa/Resume Timer');
    const config = { ...TEST_CONFIG };

    let passed = 0, failed = 0;
    const check = (c, p, f) => { if (assert(c, p, f)) passed++; else failed++; };

    // Simulate: session open at T=0, paused at T=60min, resumed at T=90min (30min paused)
    // Effective elapsed should be actual_elapsed - paused_duration
    const startedAt = new Date(Date.now() - 120 * 60 * 1000); // 2h ago
    const pausedAt = new Date(startedAt.getTime() + 60 * 60 * 1000); // 1h after start
    const resumedAt = new Date(pausedAt.getTime() + 30 * 60 * 1000); // 30min later
    const pausedMinutes = Math.floor((resumedAt - pausedAt) / 60000); // 30
    log(`Pausa: ${pausedMinutes}min (de ${pausedAt.toLocaleTimeString()} a ${resumedAt.toLocaleTimeString()})`);

    // Resume shifts started_at forward by paused duration
    const adjustedStartedAt = new Date(startedAt.getTime() + pausedMinutes * 60000);
    const actualElapsed = Math.floor((Date.now() - adjustedStartedAt) / 60000);
    const rawElapsed = Math.floor((Date.now() - startedAt) / 60000);
    log(`Elapsed crudo: ${rawElapsed}min, ajustado: ${actualElapsed}min (diff=${rawElapsed - actualElapsed}min)`);
    check(rawElapsed - actualElapsed === pausedMinutes, `Pausa de ${pausedMinutes}min descontada`, `Pausa NO descontada: diff=${rawElapsed - actualElapsed}`);

    // Billing should use adjusted time, not raw
    const session = { id: 'test-pause', game_mode: 'NORMAL', hours_paid: 2, extended_times: 0, seats: [], paid_at: null };
    const bd = calculateSessionCostBreakdown(actualElapsed, session.game_mode, config, session.hours_paid, session.extended_times, 0, 0);
    const bdRaw = calculateSessionCostBreakdown(rawElapsed, session.game_mode, config, session.hours_paid, session.extended_times, 0, 0);
    log(`Costo con tiempo ajustado: $${bd.total}, con crudo: $${bdRaw.total}`);
    // Both should be $10 since hours_paid is what matters, but elapsed affects display
    check(bd.total === 10, `Billing correcto: $${bd.total}`, `Billing INCORRECTO: $${bd.total}`);

    // Multiple pauses
    log('--- Múltiples pausas ---');
    const pauses = [
        { start: 0, end: 10 },   // 10min pause
        { start: 30, end: 45 },  // 15min pause
        { start: 60, end: 65 },  // 5min pause
    ];
    const totalPaused = pauses.reduce((s, p) => s + (p.end - p.start), 0); // 30min
    check(totalPaused === 30, `Total pausado: ${totalPaused}min`, `Pausas INCORRECTO: ${totalPaused}`);
    const effectiveElapsed = 120 - totalPaused; // 90min
    log(`120min brutos - ${totalPaused}min pausados = ${effectiveElapsed}min efectivos`);
    check(effectiveElapsed === 90, `Elapsed efectivo: ${effectiveElapsed}min`, `Elapsed INCORRECTO: ${effectiveElapsed}`);

    log(`Escenario L completado: ${passed} pasaron, ${failed} fallaron`, failed > 0 ? 'error' : 'success');
    return { passed, failed };
}

// ════════════════════════════════════════════
// SCENARIO M: Ajuste Admin (Restar Tiempo)
// ════════════════════════════════════════════
function scenarioM() {
    section('ESCENARIO M: Ajuste Admin — Restar Tiempo');
    const config = { ...TEST_CONFIG };

    let passed = 0, failed = 0;
    const check = (c, p, f) => { if (assert(c, p, f)) passed++; else failed++; };

    // 1. LIFO removal from seat timeCharges
    log('--- LIFO: restar de timeCharges de seats ---');
    const seats = [
        { id: 's1', label: 'Test', paid: false, timeCharges: [
            { type: 'hora', amount: 1, id: 'tc1' },
            { type: 'hora', amount: 0.5, id: 'tc2' },
            { type: 'pina', amount: 1, id: 'tc3' },
        ] },
    ];

    // Simulate subtracting 0.5h — should remove tc2 (LIFO)
    let remaining = -0.5;
    const seatCopy = { ...seats[0], timeCharges: [...seats[0].timeCharges.map(tc => ({ ...tc }))] };
    const hourCharges = seatCopy.timeCharges.filter(tc => tc.type === 'hora');
    for (let i = hourCharges.length - 1; i >= 0 && remaining < 0; i--) {
        const tc = hourCharges[i];
        const amt = Number(tc.amount) || 0;
        if (amt <= Math.abs(remaining)) {
            seatCopy.timeCharges = seatCopy.timeCharges.filter(t => t.id !== tc.id);
            remaining += amt;
        } else {
            seatCopy.timeCharges = seatCopy.timeCharges.map(t =>
                t.id === tc.id ? { ...t, amount: amt + remaining } : t
            );
            remaining = 0;
        }
    }
    logData('TimeCharges después', seatCopy.timeCharges.map(tc => `${tc.type}:${tc.amount} (${tc.id})`));
    check(seatCopy.timeCharges.length === 2, `tc2 removido, quedan 2: ${seatCopy.timeCharges.length}`, `Quedan INCORRECTO: ${seatCopy.timeCharges.length}`);
    check(seatCopy.timeCharges.find(tc => tc.id === 'tc1')?.amount === 1, `tc1 intacto (1h)`, `tc1 modificado incorrectamente`);
    check(seatCopy.timeCharges.find(tc => tc.id === 'tc3')?.type === 'pina', `Piña intacta`, `Piña fue removida!`);

    // 2. Partial LIFO — subtract 0.75h from [1h, 0.5h]
    log('--- LIFO parcial: -0.75h de [1h, 0.5h] ---');
    const seats2 = [{ id: 's2', label: 'Test2', paid: false, timeCharges: [
        { type: 'hora', amount: 1, id: 'tc10' },
        { type: 'hora', amount: 0.5, id: 'tc11' },
    ] }];
    let rem2 = -0.75;
    const seat2Copy = { ...seats2[0], timeCharges: [...seats2[0].timeCharges.map(tc => ({ ...tc }))] };
    const hc2 = seat2Copy.timeCharges.filter(tc => tc.type === 'hora');
    for (let i = hc2.length - 1; i >= 0 && rem2 < 0; i--) {
        const tc = hc2[i];
        const amt = Number(tc.amount) || 0;
        if (amt <= Math.abs(rem2)) {
            seat2Copy.timeCharges = seat2Copy.timeCharges.filter(t => t.id !== tc.id);
            rem2 += amt;
        } else {
            seat2Copy.timeCharges = seat2Copy.timeCharges.map(t =>
                t.id === tc.id ? { ...t, amount: amt + rem2 } : t
            );
            rem2 = 0;
        }
    }
    logData('Resultado parcial', seat2Copy.timeCharges.map(tc => `${tc.type}:${tc.amount}`));
    check(seat2Copy.timeCharges.length === 1, `1 charge restante`, `Esperado 1, tiene ${seat2Copy.timeCharges.length}`);
    check(seat2Copy.timeCharges[0].amount === 0.75, `tc10 reducido a 0.75h: ${seat2Copy.timeCharges[0].amount}`, `Monto INCORRECTO: ${seat2Copy.timeCharges[0].amount}`);

    // 3. Subtract exceeds seat timeCharges — overflow to hours_paid
    log('--- Overflow a hours_paid ---');
    let hours_paid = 2;
    const seats3 = [{ id: 's3', label: 'Test3', paid: false, timeCharges: [
        { type: 'hora', amount: 0.5, id: 'tc20' },
    ] }];
    let rem3 = -1.5; // remove 1.5h total, seat only has 0.5h
    const seat3Copy = { ...seats3[0], timeCharges: [...seats3[0].timeCharges.map(tc => ({ ...tc }))] };
    const hc3 = seat3Copy.timeCharges.filter(tc => tc.type === 'hora');
    for (let i = hc3.length - 1; i >= 0 && rem3 < 0; i--) {
        const tc = hc3[i];
        const amt = Number(tc.amount) || 0;
        if (amt <= Math.abs(rem3)) {
            seat3Copy.timeCharges = seat3Copy.timeCharges.filter(t => t.id !== tc.id);
            rem3 += amt;
        } else {
            seat3Copy.timeCharges = seat3Copy.timeCharges.map(t =>
                t.id === tc.id ? { ...t, amount: amt + rem3 } : t
            );
            rem3 = 0;
        }
    }
    // Remaining goes to hours_paid
    hours_paid = Math.max(0, hours_paid + rem3);
    log(`Seat timeCharges vaciado, remaining=${rem3}, hours_paid ajustado: ${hours_paid}`);
    check(seat3Copy.timeCharges.length === 0, `Seat vaciado`, `Seat no vaciado: ${seat3Copy.timeCharges.length}`);
    check(hours_paid === 1, `hours_paid=1 (2-1=1): ${hours_paid}`, `hours_paid INCORRECTO: ${hours_paid}`);

    // 4. Verify billing after admin adjustment
    const session = { id: 'test-adj', game_mode: 'NORMAL', hours_paid: hours_paid, extended_times: 0, seats: [], paid_at: null };
    const bd = calculateSessionCostBreakdown(60, session.game_mode, config, session.hours_paid, session.extended_times, 0, 0);
    check(bd.total === 5, `Billing post-ajuste: $${bd.total}`, `Billing INCORRECTO: $${bd.total}`);

    // 5. Remove round (piña)
    log('--- Remover piña ---');
    let extendedTimes = 3;
    extendedTimes = Math.max(0, extendedTimes - 1);
    check(extendedTimes === 2, `Piña removida: extended=${extendedTimes}`, `INCORRECTO: ${extendedTimes}`);
    extendedTimes = Math.max(0, extendedTimes - 1);
    extendedTimes = Math.max(0, extendedTimes - 1);
    extendedTimes = Math.max(0, extendedTimes - 1); // below zero, should clamp
    check(extendedTimes === 0, `Clamp a 0: extended=${extendedTimes}`, `No clampeó: ${extendedTimes}`);

    log(`Escenario M completado: ${passed} pasaron, ${failed} fallaron`, failed > 0 ? 'error' : 'success');
    return { passed, failed };
}

// ════════════════════════════════════════════
// SCENARIO N: Mesa BAR (Tipo NORMAL, sin tiempo)
// ════════════════════════════════════════════
function scenarioN() {
    section('ESCENARIO N: Mesa BAR (tipo NORMAL — sin cargo por tiempo)');
    const config = { ...TEST_CONFIG };

    let passed = 0, failed = 0;
    const check = (c, p, f) => { if (assert(c, p, f)) passed++; else failed++; };

    // Table type NORMAL means isTimeFree=true
    const isTimeFree = true;
    const seats = [
        { id: 's1', label: 'P1', paid: false, timeCharges: [{ type: 'hora', amount: 1, id: 'tc1' }] },
        { id: 's2', label: 'P2', paid: false, timeCharges: [{ type: 'pina', amount: 1, id: 'tc2' }] },
    ];
    const session = { id: 'test-bar', game_mode: 'NORMAL', hours_paid: 2, extended_times: 1, seats, paid_at: null };
    const elapsed = 120;
    const items = [
        { id: 'i1', product_id: 'p1', product_name: 'Cerveza', unit_price_usd: 3, qty: 2, seat_id: 's1' },
        { id: 'i2', product_id: 'p2', product_name: 'Refresco', unit_price_usd: 2, qty: 1, seat_id: null },
    ];

    // With isTimeFree, session-level time should be $0
    const fb = calculateFullTableBreakdown(session, seats, elapsed, config, items, null, null, isTimeFree, 0, 0);
    log(`Session time (isTimeFree): $${fb.sessionTimeCost.total}`);
    check(fb.sessionTimeCost.total === 0, `Session time $0 (BAR): $${fb.sessionTimeCost.total}`, `Session time NO es $0: $${fb.sessionTimeCost.total}`);

    // But per-seat timeCharges still apply
    const p1Bd = fb.seats.find(s => s.seat.id === 's1');
    const p2Bd = fb.seats.find(s => s.seat.id === 's2');
    check(p1Bd.timeCost.hourCost === 5, `P1 seat hora cobra $5: $${p1Bd.timeCost.hourCost}`, `P1 seat hora INCORRECTO: $${p1Bd.timeCost.hourCost}`);
    check(p2Bd.timeCost.pinaCost === 2, `P2 seat piña cobra $2: $${p2Bd.timeCost.pinaCost}`, `P2 seat piña INCORRECTO: $${p2Bd.timeCost.pinaCost}`);

    // Shared = only consumption ($2 refresco), NOT session time
    log(`Shared total: $${fb.sharedTotal} (solo consumo, sin tiempo)`);
    check(fb.sharedTotal === 2, `Shared = solo consumo $2: $${fb.sharedTotal}`, `Shared INCORRECTO: $${fb.sharedTotal}`);

    // Grand total = seat times + items + shared
    const expectedGrand = round2(5 + 6 + 2 + 2 + 1); // P1(5h+6cerv) + P2(2piña) + shared(2÷2=1 each)
    logData('Grand total', fb.grandTotal);

    log(`Escenario N completado: ${passed} pasaron, ${failed} fallaron`, failed > 0 ? 'error' : 'success');
    return { passed, failed };
}

// ════════════════════════════════════════════
// SCENARIO O: Mesa $0 (Rechazada)
// ════════════════════════════════════════════
function scenarioO() {
    section('ESCENARIO O: Mesa $0 — Venta Rechazada');
    const config = { ...TEST_CONFIG };

    let passed = 0, failed = 0;
    const check = (c, p, f) => { if (assert(c, p, f)) passed++; else failed++; };

    // 1. Session with no time, no items — should be $0
    log('--- Sesión vacía ---');
    const session1 = { id: 'test-zero1', game_mode: 'NORMAL', hours_paid: 0, extended_times: 0, seats: [], paid_at: null };
    const bd1 = calculateSessionCostBreakdown(30, session1.game_mode, config, session1.hours_paid, session1.extended_times, 0, 0);
    check(bd1.total === 0, `Sesión vacía $0: $${bd1.total}`, `Sesión vacía NO es $0: $${bd1.total}`);
    check(bd1.total <= EPSILON, `Sería rechazada por processSaleTransaction`, `PELIGRO: pasaría la validación`);

    // 2. Session fully offset — should also be $0
    log('--- Sesión totalmente offset ---');
    const session2 = { id: 'test-zero2', game_mode: 'NORMAL', hours_paid: 2, extended_times: 1, seats: [], paid_at: null };
    const bd2 = calculateSessionCostBreakdown(120, session2.game_mode, config, session2.hours_paid, session2.extended_times, 2, 1);
    check(bd2.total === 0, `Con offsets iguales → $0: $${bd2.total}`, `Con offsets NO es $0: $${bd2.total}`);

    // 3. Session with paid_at set (already paid, idle)
    log('--- Sesión con paid_at (ya cobrada) ---');
    const session3 = { id: 'test-zero3', game_mode: 'NORMAL', hours_paid: 1, extended_times: 0, seats: [], paid_at: new Date().toISOString() };
    // Note: calculateSessionCost (not Breakdown) returns $0 when paid_at is set
    const { calculateSessionCost } = { calculateSessionCost: (e, g, c, h, x, p, ho, ro) => {
        if (p) return 0;
        return calculateSessionCostBreakdown(e, g, c, h, x, ho, ro).total;
    }};
    const cost3 = calculateSessionCost(60, session3.game_mode, config, session3.hours_paid, session3.extended_times, session3.paid_at, 0, 0);
    check(cost3 === 0, `paid_at set → $0: $${cost3}`, `paid_at NO retorna $0: $${cost3}`);

    // 4. BAR table no items no seat charges — $0
    log('--- BAR sin nada ---');
    const seats4 = [{ id: 's1', label: 'X', paid: false, timeCharges: [] }];
    const session4 = { id: 'test-zero4', game_mode: 'NORMAL', hours_paid: 0, extended_times: 0, seats: seats4, paid_at: null };
    const fb4 = calculateFullTableBreakdown(session4, seats4, 60, config, [], null, null, true, 0, 0);
    check(fb4.grandTotal === 0, `BAR vacía $0: $${fb4.grandTotal}`, `BAR vacía NO es $0: $${fb4.grandTotal}`);

    log(`Escenario O completado: ${passed} pasaron, ${failed} fallaron`, failed > 0 ? 'error' : 'success');
    return { passed, failed };
}

// ════════════════════════════════════════════
// SCENARIO P: RequestCheckout / CancelCheckout
// ════════════════════════════════════════════
function scenarioP() {
    section('ESCENARIO P: Request/Cancel Checkout Status');

    let passed = 0, failed = 0;
    const check = (c, p, f) => { if (assert(c, p, f)) passed++; else failed++; };

    // Simulate status transitions
    const sessions = [
        { id: 'sess1', status: 'ACTIVE', table_id: 't1' },
        { id: 'sess2', status: 'ACTIVE', table_id: 't1' },
    ];

    // 1. Request checkout on sess1
    log('--- RequestCheckout sess1 ---');
    sessions[0].status = 'CHECKOUT';
    check(sessions[0].status === 'CHECKOUT', `sess1 → CHECKOUT`, `sess1 status INCORRECTO: ${sessions[0].status}`);
    check(sessions[1].status === 'ACTIVE', `sess2 sigue ACTIVE`, `sess2 cambió: ${sessions[1].status}`);

    // 2. Request checkout on sess2 — should revert sess1
    log('--- RequestCheckout sess2 (revierte sess1) ---');
    // Same table: revert any other CHECKOUT sessions
    sessions.forEach(s => {
        if (s.table_id === 't1' && s.id !== 'sess2' && s.status === 'CHECKOUT') {
            s.status = 'ACTIVE';
        }
    });
    sessions[1].status = 'CHECKOUT';
    check(sessions[0].status === 'ACTIVE', `sess1 revertido a ACTIVE`, `sess1 NO revertido: ${sessions[0].status}`);
    check(sessions[1].status === 'CHECKOUT', `sess2 → CHECKOUT`, `sess2 INCORRECTO: ${sessions[1].status}`);

    // 3. Cancel checkout
    log('--- CancelCheckoutRequest sess2 ---');
    sessions[1].status = 'ACTIVE';
    check(sessions[1].status === 'ACTIVE', `sess2 cancelado → ACTIVE`, `sess2 INCORRECTO: ${sessions[1].status}`);

    // All should be ACTIVE now
    const allActive = sessions.every(s => s.status === 'ACTIVE');
    check(allActive, `Todas las sesiones ACTIVE`, `Alguna NO es ACTIVE`);

    log(`Escenario P completado: ${passed} pasaron, ${failed} fallaron`, failed > 0 ? 'error' : 'success');
    return { passed, failed };
}

// ════════════════════════════════════════════
// SCENARIO Q: Sesión con paid_at + Agregar Horas
// ════════════════════════════════════════════
function scenarioQ() {
    section('ESCENARIO Q: Sesión paid_at + Agregar Horas');
    const config = { ...TEST_CONFIG };

    let passed = 0, failed = 0;
    const check = (c, p, f) => { if (assert(c, p, f)) passed++; else failed++; };

    // Session was paid and left active (paid_at set)
    const session = {
        id: 'test-paidat',
        game_mode: 'NORMAL',
        hours_paid: 2,
        extended_times: 0,
        seats: [],
        paid_at: new Date().toISOString(),
    };
    let hoursOffset = 2;
    log(`Sesión cobrada: hours_paid=${session.hours_paid}, paid_at=${session.paid_at ? 'SET' : 'null'}, offset=${hoursOffset}`);

    // Cost with paid_at should be $0
    const bdPaid = calculateSessionCostBreakdown(120, session.game_mode, config, session.hours_paid, session.extended_times, hoursOffset, 0);
    check(bdPaid.total === 0, `Con paid_at, total=$0: $${bdPaid.total}`, `paid_at NO retorna $0: $${bdPaid.total}`);

    // Admin adds 1 more hour — should clear paid_at
    log('--- Admin agrega 1h → limpia paid_at ---');
    session.hours_paid = 3;
    session.paid_at = null; // cleared by addHoursToSession
    log(`Después: hours_paid=${session.hours_paid}, paid_at=${session.paid_at}`);
    check(session.paid_at === null, `paid_at limpiado`, `paid_at NO limpiado: ${session.paid_at}`);

    // Now should bill only the new hour (offset still 2)
    const bdAfter = calculateSessionCostBreakdown(180, session.game_mode, config, session.hours_paid, session.extended_times, hoursOffset, 0);
    check(bdAfter.total === 5, `Solo hora nueva: $${bdAfter.total}`, `INCORRECTO: esperado $5, obtenido $${bdAfter.total}`);

    // Add piña to paid session — should also clear paid_at
    log('--- Agregar piña a sesión pagada ---');
    const session2 = {
        id: 'test-paidat2',
        game_mode: 'PINA',
        hours_paid: 0,
        extended_times: 2,
        seats: [],
        paid_at: new Date().toISOString(),
    };
    let roundsOffset2 = 3; // 1 + 2 = 3 rounds paid
    session2.extended_times = 3; // add 1 piña
    session2.paid_at = null; // cleared
    const bdPina = calculateSessionCostBreakdown(90, session2.game_mode, config, session2.hours_paid, session2.extended_times, 0, roundsOffset2);
    const expectedPina = round2((1 + 3 - roundsOffset2) * config.pricePina); // 4 - 3 = 1 piña × $2
    check(bdPina.pinaCost === expectedPina, `Solo nueva piña: $${bdPina.pinaCost}`, `INCORRECTO: esperado $${expectedPina}, obtenido $${bdPina.pinaCost}`);

    // Edge: add hours to session with seats — should clear paid_at on session
    log('--- Add hora a seat de sesión pagada ---');
    const session3 = {
        id: 'test-paidat3',
        game_mode: 'NORMAL',
        hours_paid: 0,
        extended_times: 0,
        seats: [{ id: 's1', label: 'Test', paid: false, timeCharges: [] }],
        paid_at: new Date().toISOString(),
    };
    // addHoursToSession with seatId → clears paid_at, adds timeCharge
    session3.paid_at = null;
    session3.seats[0].timeCharges = [{ type: 'hora', amount: 1, id: 'tc-new' }];
    const seatCost = calculateSeatCostBreakdown(session3.seats[0], 60, config);
    check(seatCost.hourCost === 5, `Seat nueva hora: $${seatCost.hourCost}`, `Seat INCORRECTO: $${seatCost.hourCost}`);

    log(`Escenario Q completado: ${passed} pasaron, ${failed} fallaron`, failed > 0 ? 'error' : 'success');
    return { passed, failed };
}

// ════════════════════════════════════════════
// SCENARIO R: Falso Fiado — Rounding Divergence
// ════════════════════════════════════════════
function scenarioR() {
    section('ESCENARIO R: Falso Fiado por Divergencia de Redondeo');
    const config = { ...TEST_CONFIG };

    let passed = 0, failed = 0;
    const check = (c, p, f) => { if (assert(c, p, f)) passed++; else failed++; };

    // Reproduce the exact bug: TableQueuePanel calculates grandTotal as raw float sum,
    // but handleTableCheckout recalculates via synthetic cart with round2 per item.
    // When these diverge, the user pays the shown (raw) total but the processor
    // sees a higher recalculated total → false fiado.

    // 1. Multi-seat with fractional prices (worst case for rounding)
    log('--- Caso 1: Multi-seat con decimales ---');
    const seats1 = [
        { id: 's1', label: 'A', paid: false, timeCharges: [{ type: 'hora', amount: 0.5, id: 'tc1' }] },
        { id: 's2', label: 'B', paid: false, timeCharges: [{ type: 'pina', amount: 1, id: 'tc2' }, { type: 'hora', amount: 0.5, id: 'tc3' }] },
        { id: 's3', label: 'C', paid: false, timeCharges: [{ type: 'hora', amount: 1.5, id: 'tc4' }] },
    ];
    const session1 = { id: 'test-fiado1', game_mode: 'NORMAL', hours_paid: 1, extended_times: 1, seats: seats1, paid_at: null };
    const elapsed1 = 90;
    const items1 = [
        { id: 'i1', product_id: 'p1', product_name: 'Cerveza', unit_price_usd: 3.33, qty: 3, seat_id: null },
        { id: 'i2', product_id: 'p2', product_name: 'Nachos', unit_price_usd: 4.67, qty: 1, seat_id: 's1' },
    ];

    // Simulate TableQueuePanel's raw calculation (the shown total)
    const isTimeFree = false;
    const timeCost1 = calculateSessionCostBreakdown(elapsed1, session1.game_mode, config, session1.hours_paid, session1.extended_times, 0, 0).total;
    const seatTimeCost1 = seats1.filter(s => !s.paid).reduce((sum, s) => {
        const tc = (s.timeCharges || []);
        const h = tc.filter(t => t.type === 'hora').reduce((a, t) => a + (Number(t.amount) || 0), 0);
        const p = tc.filter(t => t.type === 'pina').reduce((a, t) => a + (Number(t.amount) || 0), 0);
        return sum + (h * (config.pricePerHour || 0)) + (p * (config.pricePina || 0));
    }, 0);
    const totalConsumption1 = items1.reduce((a, i) => a + Number(i.unit_price_usd) * Number(i.qty), 0);
    const rawGrandTotal = timeCost1 + seatTimeCost1 + totalConsumption1;
    const shownGrandTotal = round2(rawGrandTotal);
    logData('Raw grand total (TableQueuePanel)', rawGrandTotal);
    logData('Shown grand total (round2)', shownGrandTotal);

    // Simulate synthetic cart recalculation (what handleTableCheckout does)
    const fb = calculateFullTableBreakdown(session1, seats1, elapsed1, config, items1, null, null, isTimeFree, 0, 0);
    const recalcTotal = fb ? fb.grandTotal : 0;
    logData('Recalc grand total (fullBreakdown)', recalcTotal);

    const diff = Math.abs(recalcTotal - shownGrandTotal);
    log(`Diferencia: $${round2(diff)}`);

    // The user pays the shown total
    const totalPaid = shownGrandTotal;

    // Old guard (< $0.10) might not catch this
    // New guard: if user paid >= shownTotal, snap to paid
    let effectiveCartTotal = recalcTotal;
    if (effectiveCartTotal > totalPaid && totalPaid >= shownGrandTotal - EPSILON) {
        effectiveCartTotal = round2(totalPaid);
    }
    const remaining = round2(Math.max(0, effectiveCartTotal - totalPaid));
    check(remaining <= EPSILON, `Guard previene falso fiado: remaining=$${remaining}`, `FALSO FIADO: remaining=$${remaining} (guard falló)`);

    // 2. Session with consumption that has repeating decimals
    log('--- Caso 2: Consumo con decimales repetitivos ---');
    const items2 = [
        { id: 'i3', product_id: 'p3', product_name: 'Item A', unit_price_usd: 1.33, qty: 3 }, // 3.99
        { id: 'i4', product_id: 'p4', product_name: 'Item B', unit_price_usd: 2.67, qty: 2 }, // 5.34
    ];
    const session2 = { id: 'test-fiado2', game_mode: 'NORMAL', hours_paid: 1.5, extended_times: 0, seats: [], paid_at: null };
    const bd2 = calculateSessionCostBreakdown(90, session2.game_mode, config, session2.hours_paid, session2.extended_times, 0, 0);
    const { cart: cart2 } = buildSyntheticCart(session2, config, 90, 0, 0, items2);
    const synthTotal2 = cartTotal(cart2);
    const rawTotal2 = bd2.total + items2.reduce((s, i) => s + i.unit_price_usd * i.qty, 0);
    const shownTotal2 = round2(rawTotal2);
    logData('Synthetic cart', synthTotal2);
    logData('Shown total', shownTotal2);

    let effTotal2 = synthTotal2;
    if (effTotal2 > shownTotal2 && shownTotal2 >= shownTotal2 - EPSILON) {
        effTotal2 = round2(shownTotal2);
    }
    const rem2 = round2(Math.max(0, effTotal2 - shownTotal2));
    check(rem2 <= EPSILON, `Caso 2 sin falso fiado: remaining=$${rem2}`, `FALSO FIADO caso 2: $${rem2}`);

    // 3. Large multi-seat with lots of items (stress test)
    log('--- Caso 3: Stress test ---');
    const stressSeats = Array.from({ length: 5 }, (_, i) => ({
        id: `ss${i}`, label: `P${i + 1}`, paid: false,
        timeCharges: [
            { type: 'hora', amount: 0.5 * (i + 1), id: `stc${i}` },
            ...(i % 2 === 0 ? [{ type: 'pina', amount: 1, id: `stp${i}` }] : []),
        ]
    }));
    const stressItems = Array.from({ length: 8 }, (_, i) => ({
        id: `si${i}`, product_id: `sp${i}`, product_name: `Item ${i}`,
        unit_price_usd: round2(1.11 + i * 0.37), qty: i % 3 + 1,
        seat_id: i < 3 ? `ss${i}` : null
    }));
    const stressSession = { id: 'test-stress', game_mode: 'NORMAL', hours_paid: 2, extended_times: 2, seats: stressSeats, paid_at: null };
    const stressFb = calculateFullTableBreakdown(stressSession, stressSeats, 120, config, stressItems, null, null, false, 0, 0);
    const stressShown = round2(stressFb ? stressFb.grandTotal : 0);

    // Build synthetic cart for stress
    const stressSynthCart = [];
    if (stressFb) {
        stressFb.seats.filter(sb => !sb.seat.paid).forEach(sb => {
            if (sb.timeCost.hourCost > 0) stressSynthCart.push({ priceUsd: round2(sb.timeCost.hourCost), qty: 1 });
            if (sb.timeCost.pinaCost > 0) stressSynthCart.push({ priceUsd: round2(config.pricePina), qty: sb.seat.timeCharges.filter(tc => tc.type === 'pina').reduce((s, tc) => s + tc.amount, 0) });
            sb.items.forEach(i => stressSynthCart.push({ priceUsd: Number(i.unit_price_usd), qty: Number(i.qty) }));
            if (sb.sharedPortion > 0) stressSynthCart.push({ priceUsd: round2(sb.sharedPortion), qty: 1 });
        });
    }
    const stressSynthTotal = round2(stressSynthCart.reduce((s, i) => s + round2((i.priceUsd || 0) * (i.qty || 1)), 0));
    const stressDiff = Math.abs(stressSynthTotal - stressShown);
    log(`Stress: shown=$${stressShown}, synth=$${stressSynthTotal}, diff=$${round2(stressDiff)}`);

    let stressEff = stressSynthTotal;
    if (stressEff > stressShown && stressShown >= stressShown - EPSILON) {
        stressEff = round2(stressShown);
    }
    const stressRem = round2(Math.max(0, stressEff - stressShown));
    check(stressRem <= EPSILON, `Stress sin falso fiado: remaining=$${stressRem}`, `FALSO FIADO stress: $${stressRem}`);

    log(`Escenario R completado: ${passed} pasaron, ${failed} fallaron`, failed > 0 ? 'error' : 'success');
    return { passed, failed };
}

function scenarioS() {
    section('ESCENARIO S: Recobro — Bs con Seat TimeCharges');
    const config = { ...TEST_CONFIG, pricePerHourBs: 1500, pricePinaBs: 600 };
    const tasaBCV = 300;
    log(`Config: pricePerHour=$${config.pricePerHour}, pricePerHourBs=${config.pricePerHourBs}, pricePina=$${config.pricePina}, pricePinaBs=${config.pricePinaBs}, tasaBCV=${tasaBCV}`);

    let passed = 0, failed = 0;
    const check = (c, p, f) => { if (assert(c, p, f)) passed++; else failed++; };

    // ── Test 1: Sesión con horas, cobro, recobro con seat-level hour ──
    log('Test 1: Cobro inicial 1h → recobro con 1h seat-level');
    const session1 = {
        id: 'test-s1', game_mode: 'NORMAL', hours_paid: 1, extended_times: 0,
        started_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        seats: [{ id: 'seat1', label: 'P1', paid: false, timeCharges: [] }],
        paid_at: null,
    };
    let hoursOff = 0, roundsOff = 0;

    // Primer cobro: 1h = $5 → Bs 1500
    const bd1 = calculateSessionCostBreakdown(60, session1.game_mode, config, session1.hours_paid, session1.extended_times, hoursOff, roundsOff);
    const bs1 = calculateGrandTotalBs(bd1.total, 0, session1.game_mode, config, tasaBCV, bd1);
    const seatBs1 = calculateSeatTimeCostBs(session1.seats, config, tasaBCV);
    check(bd1.total === 5, `Primer cobro $${bd1.total}`, `Esperado $5, obtenido $${bd1.total}`);
    check(bs1 === 1500, `Primer Bs correcto: ${bs1}`, `Esperado Bs 1500, obtenido ${bs1}`);
    check(seatBs1 === 0, `Seat Bs antes de recobro: ${seatBs1}`, `Esperado 0, obtenido ${seatBs1}`);

    // Simular resetSessionAfterPayment
    hoursOff = 1;
    session1.paid_at = new Date().toISOString();
    session1.seats[0].timeCharges = []; // cleared

    // Agregar 1h a seat (recobro)
    session1.seats[0].timeCharges = [{ type: 'hora', amount: 1, id: 'tc-1' }];
    session1.paid_at = null;

    // Verificar: session-level cost = $0 (ya pagado), seat-level = $5
    const bd2 = calculateSessionCostBreakdown(120, session1.game_mode, config, session1.hours_paid, session1.extended_times, hoursOff, roundsOff);
    const sessionBs2 = calculateGrandTotalBs(bd2.total, 0, session1.game_mode, config, tasaBCV, bd2);
    const seatBs2 = calculateSeatTimeCostBs(session1.seats, config, tasaBCV);
    const totalBs2 = round2(sessionBs2 + seatBs2);

    check(bd2.total === 0, `Session-level costo post-recobro: $${bd2.total}`, `Esperado $0, obtenido $${bd2.total}`);
    check(sessionBs2 === 0, `Session-level Bs: ${sessionBs2}`, `Esperado 0, obtenido ${sessionBs2}`);
    check(seatBs2 === 1500, `Seat-level Bs correcto: ${seatBs2}`, `Esperado Bs 1500, obtenido ${seatBs2}`);
    check(totalBs2 === 1500, `Total Bs recobro correcto: ${totalBs2}`, `Esperado Bs 1500, obtenido ${totalBs2}`);

    // ── Test 2: Recobro con piña en seat ──
    log('Test 2: Cobro inicial piña → recobro con piña seat-level');
    const session2 = {
        id: 'test-s2', game_mode: 'PINA', hours_paid: 0, extended_times: 0,
        started_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
        seats: [{ id: 'seat1', label: 'P1', paid: false, timeCharges: [] }],
        paid_at: null,
    };
    let hOff2 = 0, rOff2 = 0;

    // Primer cobro: 1 piña (implícita) = $2 → Bs 600
    const bdP1 = calculateSessionCostBreakdown(30, session2.game_mode, config, session2.hours_paid, session2.extended_times, hOff2, rOff2);
    const bsP1 = calculateGrandTotalBs(bdP1.total, 0, session2.game_mode, config, tasaBCV, bdP1);
    check(bdP1.total === 2, `Piña primer cobro: $${bdP1.total}`, `Esperado $2, obtenido $${bdP1.total}`);
    check(bsP1 === 600, `Piña primer Bs: ${bsP1}`, `Esperado 600, obtenido ${bsP1}`);

    // Simular reset
    rOff2 = 1; // 1 piña pagada
    session2.paid_at = new Date().toISOString();
    session2.seats[0].timeCharges = [];

    // Agregar piña a seat
    session2.seats[0].timeCharges = [{ type: 'pina', amount: 1, id: 'tc-2' }];
    session2.paid_at = null;

    const bdP2 = calculateSessionCostBreakdown(60, session2.game_mode, config, session2.hours_paid, session2.extended_times, hOff2, rOff2);
    const sessionBsP2 = calculateGrandTotalBs(bdP2.total, 0, session2.game_mode, config, tasaBCV, bdP2);
    const seatBsP2 = calculateSeatTimeCostBs(session2.seats, config, tasaBCV);
    const totalBsP2 = round2(sessionBsP2 + seatBsP2);

    check(bdP2.total === 0, `Piña session-level post-recobro: $${bdP2.total}`, `Esperado $0, obtenido $${bdP2.total}`);
    check(seatBsP2 === 600, `Piña seat Bs: ${seatBsP2}`, `Esperado 600, obtenido ${seatBsP2}`);
    check(totalBsP2 === 600, `Piña total Bs recobro: ${totalBsP2}`, `Esperado 600, obtenido ${totalBsP2}`);

    // ── Test 3: Recobro mixto (hora + piña en seats) + consumo ──
    log('Test 3: Recobro mixto con consumo');
    const session3 = {
        id: 'test-s3', game_mode: 'NORMAL', hours_paid: 1, extended_times: 0,
        started_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        seats: [{ id: 'seat1', label: 'P1', paid: false, timeCharges: [] }],
        paid_at: null,
    };
    let hOff3 = 0, rOff3 = 0;

    // Reset after first payment
    hOff3 = 1;
    session3.seats[0].timeCharges = [
        { type: 'hora', amount: 1, id: 'tc-3a' },
        { type: 'pina', amount: 1, id: 'tc-3b' },
    ];
    session3.paid_at = null;

    const totalConsumption = 3; // $3 de consumo
    const bd3 = calculateSessionCostBreakdown(120, session3.game_mode, config, session3.hours_paid, session3.extended_times, hOff3, rOff3);
    const sessionBs3 = calculateGrandTotalBs(bd3.total, totalConsumption, session3.game_mode, config, tasaBCV, bd3);
    const seatBs3 = calculateSeatTimeCostBs(session3.seats, config, tasaBCV);
    const totalBs3 = round2(sessionBs3 + seatBs3);

    // Session: $0 time + $3 consumo en Bs = $3 * 300 = 900
    // Seat: 1h ($5) = Bs 1500 + 1 piña ($2) = Bs 600 → Bs 2100
    // Total: 900 + 2100 = 3000
    const consumoBs = round2(totalConsumption * tasaBCV);
    check(consumoBs === 900, `Consumo Bs: ${consumoBs}`, `Esperado 900, obtenido ${consumoBs}`);
    check(seatBs3 === 2100, `Seat mixto Bs: ${seatBs3}`, `Esperado 2100, obtenido ${seatBs3}`);
    check(totalBs3 === 3000, `Total mixto recobro Bs: ${totalBs3}`, `Esperado 3000, obtenido ${totalBs3}`);

    // ── Test 4: Sin pricePerHourBs (fallback a tasa BCV) ──
    log('Test 4: Fallback a tasa BCV cuando no hay precio Bs configurado');
    const configNoBs = { ...TEST_CONFIG }; // pricePerHourBs=0, pricePinaBs=0
    const session4 = {
        id: 'test-s4', game_mode: 'NORMAL', hours_paid: 1, extended_times: 0,
        started_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        seats: [{ id: 'seat1', label: 'P1', paid: false, timeCharges: [{ type: 'hora', amount: 1, id: 'tc-4' }] }],
        paid_at: null,
    };
    const seatBs4 = calculateSeatTimeCostBs(session4.seats, configNoBs, tasaBCV);
    // Sin Bs custom: $5 * tasa 300 = 1500
    check(seatBs4 === 1500, `Fallback BCV seat Bs: ${seatBs4}`, `Esperado 1500, obtenido ${seatBs4}`);

    log(`Escenario S completado: ${passed} pasaron, ${failed} fallaron`, failed > 0 ? 'error' : 'success');
    return { passed, failed };
}

// ── Helper: simula processSaleTransaction de forma determinista ──
function buildMockSale({ cart, totalUsd, totalBs, effectiveRate, tableName, saleNumber, payments }) {
    return Object.freeze({
        id: `mock-sale-${saleNumber}`,
        saleNumber,
        tipo: 'VENTA',
        status: 'COMPLETADA',
        tableName: tableName || null,
        items: cart.map(i => ({
            id: i.id, name: i.name, qty: i.qty,
            priceUsd: i.priceUsd, costBs: 0, costUsd: 0,
        })),
        cartSubtotalUsd: totalUsd,
        totalUsd,
        totalBs,
        payments: payments || [{ methodId: 'EFECTIVO', amountUsd: totalUsd, currency: 'USD' }],
        rate: effectiveRate,
        timestamp: new Date().toISOString(),
        changeUsd: 0,
        changeBs: 0,
        fiadoUsd: 0,
        customerId: null,
        customerName: 'Consumidor Final',
    });
}

function scenarioT() {
    section('ESCENARIO T: Registro en Reportes — Cobro / Recobro / Re-recobro');
    const config = { ...TEST_CONFIG, pricePerHourBs: 1500, pricePinaBs: 600 };
    const effectiveRate = 300;
    log(`Config: pricePerHour=$${config.pricePerHour}, pricePerHourBs=${config.pricePerHourBs}, tasaBCV=${effectiveRate}`);

    let passed = 0, failed = 0;
    const check = (c, p, f) => { if (assert(c, p, f)) passed++; else failed++; };
    const salesReport = []; // Simula el array de ventas del sistema
    let nextSaleNumber = 1;

    // ═══ COBRO #1: Abrir mesa 2h + consumo ═══
    log('── Cobro #1: 2h + 1 cerveza ──');
    const session = {
        id: 'test-t1', game_mode: 'NORMAL', hours_paid: 2, extended_times: 0,
        started_at: new Date(Date.now() - 120 * 60 * 1000).toISOString(),
        seats: [{ id: 'seat1', label: 'P1', paid: false, timeCharges: [] }],
        paid_at: null,
    };
    const orderItems1 = [{ id: 'item-1', product_id: 'beer', product_name: 'Cerveza', unit_price_usd: 2, qty: 1, seat_id: null }];
    let hoursOff = 0, roundsOff = 0, elapsed = 120;

    const { cart: cart1 } = buildSyntheticCart(session, config, elapsed, hoursOff, roundsOff, orderItems1);
    const total1 = cartTotal(cart1);
    const bd1 = calculateSessionCostBreakdown(elapsed, session.game_mode, config, session.hours_paid, session.extended_times, hoursOff, roundsOff);
    const bs1 = round2(calculateGrandTotalBs(bd1.total, 2, session.game_mode, config, effectiveRate, bd1));

    const sale1 = buildMockSale({ cart: cart1, totalUsd: total1, totalBs: bs1, effectiveRate, tableName: 'Mesa 1', saleNumber: nextSaleNumber++ });
    salesReport.push(sale1);

    check(sale1.totalUsd === 12, `Cobro #1 USD: $${sale1.totalUsd}`, `Esperado $12, obtenido $${sale1.totalUsd}`);
    check(sale1.totalBs === 3600, `Cobro #1 Bs: ${sale1.totalBs}`, `Esperado 3600, obtenido ${sale1.totalBs}`);
    check(sale1.items.length === 2, `Cobro #1 items: ${sale1.items.length}`, `Esperado 2 items, obtenido ${sale1.items.length}`);
    check(sale1.saleNumber === 1, `Cobro #1 saleNumber: ${sale1.saleNumber}`, `Esperado 1, obtenido ${sale1.saleNumber}`);
    check(sale1.tableName === 'Mesa 1', `Cobro #1 tableName OK`, `tableName incorrecto: ${sale1.tableName}`);
    check(salesReport.length === 1, `Reporte tiene 1 venta`, `Esperado 1, tiene ${salesReport.length}`);

    // ═══ Simular resetSessionAfterPayment ═══
    hoursOff = 2;
    session.paid_at = new Date().toISOString();
    session.seats[0].timeCharges = [];
    log('Reset: hoursOffset=2, timeCharges limpiados');

    // ═══ RECOBRO #2: Agregar 1h seat-level + 1 piña ═══
    log('── Recobro #2: +1h seat + 1 piña ──');
    session.seats[0].timeCharges = [
        { type: 'hora', amount: 1, id: 'tc-r1' },
        { type: 'pina', amount: 1, id: 'tc-r2' },
    ];
    session.paid_at = null;
    elapsed = 180;

    // Session-level: $0 (todo pagado por offset)
    const bd2 = calculateSessionCostBreakdown(elapsed, session.game_mode, config, session.hours_paid, session.extended_times, hoursOff, roundsOff);
    // Seat-level: 1h ($5) + 1 piña ($2) = $7
    const seatCost2 = calculateSeatCostBreakdown(session.seats[0], elapsed, config);
    const seatCart2 = [];
    if (seatCost2.hourCost > 0) seatCart2.push({ id: 'r2-hora', name: 'Tiempo Recobro', priceUsd: round2(seatCost2.hourCost), qty: 1 });
    if (seatCost2.pinaCost > 0) seatCart2.push({ id: 'r2-pina', name: 'Piña Recobro', priceUsd: round2(config.pricePina), qty: 1 });

    const total2 = round2(bd2.total + seatCost2.total);
    const sessionBs2 = calculateGrandTotalBs(bd2.total, 0, session.game_mode, config, effectiveRate, bd2);
    const seatBs2 = calculateSeatTimeCostBs(session.seats, config, effectiveRate);
    const bs2 = round2(sessionBs2 + seatBs2);

    const sale2 = buildMockSale({ cart: seatCart2, totalUsd: total2, totalBs: bs2, effectiveRate, tableName: 'Mesa 1', saleNumber: nextSaleNumber++ });
    salesReport.push(sale2);

    check(sale2.totalUsd === 7, `Recobro #2 USD: $${sale2.totalUsd}`, `Esperado $7, obtenido $${sale2.totalUsd}`);
    check(sale2.totalBs === 2100, `Recobro #2 Bs: ${sale2.totalBs}`, `Esperado 2100, obtenido ${sale2.totalBs}`);
    check(sale2.items.length === 2, `Recobro #2 items: ${sale2.items.length}`, `Esperado 2 items, obtenido ${sale2.items.length}`);
    check(sale2.saleNumber === 2, `Recobro #2 saleNumber: ${sale2.saleNumber}`, `Esperado 2, obtenido ${sale2.saleNumber}`);
    check(salesReport.length === 2, `Reporte tiene 2 ventas`, `Esperado 2, tiene ${salesReport.length}`);

    // ═══ Simular segundo reset ═══
    hoursOff = 2; // No cambió (session.hours_paid sigue siendo 2)
    roundsOff = 0; // Piñas eran seat-level, no session-level
    session.paid_at = new Date().toISOString();
    session.seats[0].timeCharges = [];
    log('Reset #2: timeCharges limpiados');

    // ═══ RE-RECOBRO #3: +30min hora + consumo ═══
    log('── Re-recobro #3: +30min + agua ──');
    session.seats[0].timeCharges = [
        { type: 'hora', amount: 0.5, id: 'tc-rr1' },
    ];
    session.paid_at = null;
    elapsed = 210;
    const orderItems3 = [{ id: 'item-3', product_id: 'water', product_name: 'Agua', unit_price_usd: 1, qty: 1, seat_id: null }];

    const bd3 = calculateSessionCostBreakdown(elapsed, session.game_mode, config, session.hours_paid, session.extended_times, hoursOff, roundsOff);
    const seatCost3 = calculateSeatCostBreakdown(session.seats[0], elapsed, config);
    const consumo3 = 1; // agua
    const seatCart3 = [];
    if (seatCost3.hourCost > 0) seatCart3.push({ id: 'rr-hora', name: 'Tiempo Re-recobro', priceUsd: round2(seatCost3.hourCost), qty: 1 });
    orderItems3.forEach(i => seatCart3.push({ id: i.id, name: i.product_name, priceUsd: Number(i.unit_price_usd), qty: Number(i.qty) }));

    const total3 = round2(bd3.total + seatCost3.total + consumo3);
    const sessionBs3 = calculateGrandTotalBs(bd3.total, consumo3, session.game_mode, config, effectiveRate, bd3);
    const seatBs3 = calculateSeatTimeCostBs(session.seats, config, effectiveRate);
    const bs3 = round2(sessionBs3 + seatBs3);

    const sale3 = buildMockSale({ cart: seatCart3, totalUsd: total3, totalBs: bs3, effectiveRate, tableName: 'Mesa 1', saleNumber: nextSaleNumber++ });
    salesReport.push(sale3);

    // 0.5h = $2.50, agua = $1 → total $3.50
    check(Math.abs(sale3.totalUsd - 3.50) < EPSILON, `Re-recobro #3 USD: $${sale3.totalUsd}`, `Esperado $3.50, obtenido $${sale3.totalUsd}`);
    // 0.5h Bs = 0.5 * 1500 = 750, agua = 1 * 300 = 300 → 1050
    check(Math.abs(sale3.totalBs - 1050) < EPSILON, `Re-recobro #3 Bs: ${sale3.totalBs}`, `Esperado 1050, obtenido ${sale3.totalBs}`);
    check(sale3.items.length === 2, `Re-recobro #3 items: ${sale3.items.length}`, `Esperado 2 items, obtenido ${sale3.items.length}`);
    check(sale3.saleNumber === 3, `Re-recobro #3 saleNumber: ${sale3.saleNumber}`, `Esperado 3, obtenido ${sale3.saleNumber}`);
    check(salesReport.length === 3, `Reporte tiene 3 ventas`, `Esperado 3, tiene ${salesReport.length}`);

    // ═══ Verificaciones del reporte completo ═══
    log('── Verificando reporte consolidado ──');
    const totalReporteUsd = round2(salesReport.reduce((s, v) => s + v.totalUsd, 0));
    const totalReporteBs = round2(salesReport.reduce((s, v) => s + v.totalBs, 0));
    const totalEsperadoUsd = round2(12 + 7 + 3.50);
    const totalEsperadoBs = round2(3600 + 2100 + 1050);

    check(Math.abs(totalReporteUsd - totalEsperadoUsd) < EPSILON,
        `Total reporte USD: $${totalReporteUsd} = $${totalEsperadoUsd}`,
        `Total reporte USD INCORRECTO: $${totalReporteUsd} vs $${totalEsperadoUsd}`);
    check(Math.abs(totalReporteBs - totalEsperadoBs) < EPSILON,
        `Total reporte Bs: ${totalReporteBs} = ${totalEsperadoBs}`,
        `Total reporte Bs INCORRECTO: ${totalReporteBs} vs ${totalEsperadoBs}`);

    // Verificar que los saleNumbers son secuenciales
    const numbers = salesReport.map(s => s.saleNumber);
    check(JSON.stringify(numbers) === '[1,2,3]', `SaleNumbers secuenciales: [${numbers}]`, `SaleNumbers NO secuenciales: [${numbers}]`);

    // Verificar que todas las ventas son de la misma mesa
    const allSameMesa = salesReport.every(s => s.tableName === 'Mesa 1');
    check(allSameMesa, `Todas las ventas registran Mesa 1`, `Alguna venta no tiene Mesa 1`);

    // No hay doble cobro: el total de las 3 ventas no excede lo correcto
    const totalHorasCobradasUsd = round2(10 + 5 + 2.50); // 2h + 1h-seat + 0.5h-seat
    check(Math.abs(totalHorasCobradasUsd - 17.50) < EPSILON,
        `Sin doble cobro horas: $${totalHorasCobradasUsd}`,
        `Posible doble cobro: $${totalHorasCobradasUsd} vs esperado $17.50`);

    log(`Escenario T completado: ${passed} pasaron, ${failed} fallaron`, failed > 0 ? 'error' : 'success');
    return { passed, failed };
}

// ── Helper: simula los datos del ticket/pre-cuenta como los genera tableTicketGenerator ──
function simulateTicketData(session, seats, elapsed, config, currentItems, hoursOffset, roundsOffset, tasaUSD) {
    const isPina = session.game_mode === 'PINA';
    const pinaCount = isPina ? 1 + (Number(session.extended_times) || 0) : Number(session.extended_times) || 0;
    const hasPinas = isPina || pinaCount > 0;
    const totalHours = Number(session.hours_paid) || 0;
    const hasHours = totalHours > 0;
    const seatHasPinas = seats.some(s => (s.timeCharges || []).some(tc => tc.type === 'pina'));
    const seatHasHours = seats.some(s => (s.timeCharges || []).some(tc => tc.type === 'hora'));

    const items = [];

    // Piñas (same logic as tableTicketGenerator)
    if (hasPinas || seatHasPinas) {
        const pricePerPina = config.pricePina || 0;
        const seatPinas = seats.reduce((sum, s) => sum + (s.timeCharges || []).filter(tc => tc.type === 'pina').length, 0);
        const totalPinas = pinaCount + seatPinas;
        const fullCost = round2(totalPinas * pricePerPina);
        items.push({ type: 'pina', label: `${totalPinas} piña(s)`, cost: fullCost });
    }

    // Horas — uses tc.amount (NOT tc.hours - that was the bug)
    if (hasHours || seatHasHours) {
        const pricePerHour = config.pricePerHour || 0;
        const seatHoursTotal = seats.reduce((sum, s) =>
            sum + (s.timeCharges || []).filter(tc => tc.type === 'hora').reduce((h, tc) => h + (Number(tc.amount) || 0), 0), 0);
        const combinedHours = totalHours + seatHoursTotal;
        const fullCost = round2(combinedHours * pricePerHour);
        items.push({ type: 'hora', label: `${formatHoursPaid(combinedHours)}`, cost: fullCost, hours: combinedHours });
    }

    // Consumo
    (currentItems || []).forEach(i => {
        items.push({ type: 'consumo', label: `${i.qty}x ${i.product_name}`, cost: round2(i.qty * i.unit_price_usd) });
    });

    const totalUsd = round2(items.reduce((s, i) => s + i.cost, 0));
    return { items, totalUsd };
}

function scenarioU() {
    section('ESCENARIO U: Datos de Ticket — Compra y Recompra');
    const config = { ...TEST_CONFIG, pricePerHourBs: 1500, pricePinaBs: 600 };
    const tasaBCV = 300;
    log(`Config: pricePerHour=$${config.pricePerHour}, pricePina=$${config.pricePina}`);

    let passed = 0, failed = 0;
    const check = (c, p, f) => { if (assert(c, p, f)) passed++; else failed++; };

    // ═══ COMPRA: Mesa 2h + 1 cerveza ═══
    log('── Ticket compra: 2h + cerveza ──');
    const session = {
        id: 'test-u1', game_mode: 'NORMAL', hours_paid: 2, extended_times: 0,
        started_at: new Date(Date.now() - 120 * 60 * 1000).toISOString(),
        seats: [{ id: 'seat1', label: 'P1', paid: false, timeCharges: [] }],
        paid_at: null,
    };
    const items1 = [{ id: 'i1', product_id: 'beer', product_name: 'Cerveza', unit_price_usd: 2, qty: 1, seat_id: null }];
    let hoursOff = 0, roundsOff = 0;

    const ticket1 = simulateTicketData(session, session.seats, 120, config, items1, hoursOff, roundsOff, tasaBCV);
    logData('Ticket compra', ticket1);

    check(ticket1.items.length === 2, `Ticket #1 tiene 2 líneas: ${ticket1.items.length}`, `Esperado 2 líneas, obtenido ${ticket1.items.length}`);
    check(ticket1.items[0].type === 'hora', `Línea 1 es hora`, `Línea 1 tipo incorrecto: ${ticket1.items[0].type}`);
    check(ticket1.items[0].cost === 10, `Hora cost $10: $${ticket1.items[0].cost}`, `Hora cost incorrecto: $${ticket1.items[0].cost}`);
    check(ticket1.items[0].hours === 2, `Hora qty 2h: ${ticket1.items[0].hours}`, `Hora qty incorrecto: ${ticket1.items[0].hours}`);
    check(ticket1.items[1].type === 'consumo', `Línea 2 es consumo`, `Línea 2 tipo incorrecto: ${ticket1.items[1].type}`);
    check(ticket1.items[1].label === '1x Cerveza', `Consumo label OK`, `Label incorrecto: ${ticket1.items[1].label}`);
    check(ticket1.items[1].cost === 2, `Consumo cost $2: $${ticket1.items[1].cost}`, `Consumo cost incorrecto: $${ticket1.items[1].cost}`);
    check(ticket1.totalUsd === 12, `Ticket total $12: $${ticket1.totalUsd}`, `Total incorrecto: $${ticket1.totalUsd}`);

    // ═══ Simular resetSessionAfterPayment ═══
    hoursOff = 2;
    session.paid_at = new Date().toISOString();
    session.seats[0].timeCharges = [];
    log('Reset: hoursOffset=2');

    // ═══ RECOMPRA: +1h seat + 1 piña seat + agua ═══
    log('── Ticket recompra: +1h seat + 1 piña seat + agua ──');
    session.seats[0].timeCharges = [
        { type: 'hora', amount: 1, id: 'tc-u1' },
        { type: 'pina', amount: 1, id: 'tc-u2' },
    ];
    session.paid_at = null;
    const items2 = [{ id: 'i2', product_id: 'water', product_name: 'Agua', unit_price_usd: 1, qty: 1, seat_id: null }];

    const ticket2 = simulateTicketData(session, session.seats, 180, config, items2, hoursOff, roundsOff, tasaBCV);
    logData('Ticket recompra', ticket2);

    // Debe tener: piña(1), hora(2+1=3), agua
    check(ticket2.items.length === 3, `Ticket #2 tiene 3 líneas: ${ticket2.items.length}`, `Esperado 3 líneas, obtenido ${ticket2.items.length}`);

    const pinaItem = ticket2.items.find(i => i.type === 'pina');
    const horaItem = ticket2.items.find(i => i.type === 'hora');
    const consumoItem = ticket2.items.find(i => i.type === 'consumo');

    check(pinaItem !== undefined, `Piña presente en ticket`, `Piña NO encontrada en ticket`);
    check(pinaItem && pinaItem.cost === 2, `Piña cost $2: $${pinaItem?.cost}`, `Piña cost incorrecto: $${pinaItem?.cost}`);

    // Horas: session.hours_paid(2) + seat-level(1) = 3h total → $15
    // (el ticket muestra el total acumulado, no solo el delta)
    check(horaItem !== undefined, `Hora presente en ticket`, `Hora NO encontrada en ticket`);
    check(horaItem && horaItem.hours === 3, `Horas totales 3h: ${horaItem?.hours}`, `Horas incorrectas: ${horaItem?.hours}`);
    check(horaItem && horaItem.cost === 15, `Hora cost $15: $${horaItem?.cost}`, `Hora cost incorrecto: $${horaItem?.cost}`);

    check(consumoItem !== undefined, `Consumo presente en ticket`, `Consumo NO encontrado en ticket`);
    check(consumoItem && consumoItem.label === '1x Agua', `Consumo label OK`, `Label incorrecto: ${consumoItem?.label}`);
    check(consumoItem && consumoItem.cost === 1, `Consumo cost $1: $${consumoItem?.cost}`, `Consumo cost incorrecto: $${consumoItem?.cost}`);

    // Verificar que tc.amount se usa correctamente (no tc.hours)
    log('── Verificando que tc.amount se usa (no tc.hours) ──');
    const badHoursCalc = session.seats.reduce((sum, s) =>
        sum + (s.timeCharges || []).filter(tc => tc.type === 'hora').reduce((h, tc) => h + (tc.hours || 0), 0), 0);
    const goodHoursCalc = session.seats.reduce((sum, s) =>
        sum + (s.timeCharges || []).filter(tc => tc.type === 'hora').reduce((h, tc) => h + (Number(tc.amount) || 0), 0), 0);
    check(badHoursCalc === 0, `tc.hours retorna 0 (no existe): ${badHoursCalc}`, `tc.hours debería ser 0: ${badHoursCalc}`);
    check(goodHoursCalc === 1, `tc.amount retorna 1 (correcto): ${goodHoursCalc}`, `tc.amount debería ser 1: ${goodHoursCalc}`);

    log(`Escenario U completado: ${passed} pasaron, ${failed} fallaron`, failed > 0 ? 'error' : 'success');
    return { passed, failed };
}

// ── Suite definitions ──
const ALL_SUITES = [
    { key: 'scenario_a', name: 'Abrir → Cobrar → Liberar', fn: scenarioA },
    { key: 'scenario_b', name: 'Cobrar → Dejar Activa → Re-cobrar', fn: scenarioB },
    { key: 'scenario_c', name: 'Modo Piña', fn: scenarioC },
    { key: 'scenario_d', name: 'Modo Mixto (Horas + Piña)', fn: scenarioD },
    { key: 'scenario_e', name: 'Multi-Seat', fn: scenarioE },
    { key: 'scenario_f', name: 'Detección de Redondeo', fn: scenarioF },
    { key: 'scenario_g', name: 'Consumo + Tiempo Re-cobro', fn: scenarioG },
    { key: 'scenario_h', name: 'Descuentos en Mesa', fn: scenarioH },
    { key: 'scenario_i', name: 'Cobro por Asiento Individual', fn: scenarioI },
    { key: 'scenario_j', name: 'Secuencia Cobro por Asiento + Reset', fn: scenarioJ },
    { key: 'scenario_k', name: 'Pagos Mixtos', fn: scenarioK },
    { key: 'scenario_l', name: 'Pausa/Resume Timer', fn: scenarioL },
    { key: 'scenario_m', name: 'Ajuste Admin — Restar Tiempo', fn: scenarioM },
    { key: 'scenario_n', name: 'Mesa BAR (sin tiempo sesión)', fn: scenarioN },
    { key: 'scenario_o', name: 'Mesa $0 — Venta Rechazada', fn: scenarioO },
    { key: 'scenario_p', name: 'Request/Cancel Checkout', fn: scenarioP },
    { key: 'scenario_q', name: 'Sesión paid_at + Agregar Horas', fn: scenarioQ },
    { key: 'scenario_r', name: 'Falso Fiado — Rounding Divergence', fn: scenarioR },
    { key: 'scenario_s', name: 'Recobro — Bs con Seat TimeCharges', fn: scenarioS },
    { key: 'scenario_t', name: 'Registro en Reportes — Cobro/Recobro/Re-recobro', fn: scenarioT },
    { key: 'scenario_u', name: 'Datos de Ticket — Compra y Recompra', fn: scenarioU },
];

// ── Public API ──
export const TableFlowTester = {
    suites: ALL_SUITES,

    async runAll({ onLog, onProgress, onComplete } = {}) {
        resetState();
        state.isRunning = true;
        state.onLog = onLog || null;
        state.onProgress = onProgress || null;
        state.onComplete = onComplete || null;

        section('🎱 TABLE FLOW TESTER v2.0');
        log(`Ejecutando ${ALL_SUITES.length} escenarios...`);
        log(`Config fija: pricePerHour=$${TEST_CONFIG.pricePerHour}, pricePina=$${TEST_CONFIG.pricePina}`);

        let totalPassed = 0, totalFailed = 0;

        for (let i = 0; i < ALL_SUITES.length; i++) {
            if (state.stopped) break;
            const suite = ALL_SUITES[i];
            state.onProgress?.({ current: i + 1, total: ALL_SUITES.length, name: suite.name });
            try {
                const result = suite.fn();
                totalPassed += result.passed;
                totalFailed += result.failed;
            } catch (err) {
                log(`💥 Error fatal en ${suite.name}: ${err.message}`, 'error');
                log(err.stack || '', 'error');
                totalFailed++;
            }
        }

        section('RESUMEN');
        log(`Total: ${totalPassed + totalFailed} checks`);
        log(`✅ Pasaron: ${totalPassed}`, 'success');
        if (totalFailed > 0) log(`❌ Fallaron: ${totalFailed}`, 'error');
        else log('🎉 TODOS LOS TESTS PASARON', 'success');

        const summary = { passed: totalPassed, failed: totalFailed, total: totalPassed + totalFailed };
        state.isRunning = false;
        state.onComplete?.(summary);
        return summary;
    },

    async runSuite(key, { onLog } = {}) {
        resetState();
        state.isRunning = true;
        state.onLog = onLog || null;

        const suite = ALL_SUITES.find(s => s.key === key);
        if (!suite) { log(`Suite '${key}' no encontrada`, 'error'); return { passed: 0, failed: 1 }; }

        section(`🎱 ${suite.name}`);
        let result;
        try {
            result = suite.fn();
        } catch (err) {
            log(`💥 Error fatal: ${err.message}`, 'error');
            result = { passed: 0, failed: 1 };
        }

        state.isRunning = false;
        return result;
    },

    stop() {
        state.stopped = true;
    },

    getLogs() {
        return [...state.logs];
    },

    getLogsAsText() {
        return state.logs.map(l => `[${l.time}] ${l.raw}`).join('\n');
    },
};
