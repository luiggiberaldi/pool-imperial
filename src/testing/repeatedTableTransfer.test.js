import assert from 'node:assert/strict';
import { getFrozenTimeChargeProductId } from '../utils/tableTransferEngine.js';

// tableBillingEngine importa el store de mesas, cuyo sincronizador instala un
// interceptor de localStorage al cargar. El test le da un adaptador mínimo para
// mantenerse aislado del navegador y no ejecutar sincronización real.
const localStorageData = new Map();
globalThis.localStorage = {
    getItem: (key) => localStorageData.get(key) ?? null,
    setItem: (key, value) => localStorageData.set(key, String(value)),
    removeItem: (key) => localStorageData.delete(key),
    clear: () => localStorageData.clear(),
};

const {
    buildFrozenTimeCharge,
    buildPoolToNormalPreview,
    getRoundedLibreMinutes,
} = await import('../utils/tableBillingEngine.js');

const sessionId = 'session-reused-across-transfers';
const firstOperationId = 'transfer-1';
const secondOperationId = 'transfer-2';

const firstProductId = getFrozenTimeChargeProductId(sessionId, firstOperationId);
const retryFirstProductId = getFrozenTimeChargeProductId(sessionId, firstOperationId);
const secondProductId = getFrozenTimeChargeProductId(sessionId, secondOperationId);

assert.equal(firstProductId, 'frozen-time-transfer-1');
assert.equal(retryFirstProductId, firstProductId);
assert.notEqual(secondProductId, firstProductId);

const existingOrderProductIds = new Set([firstProductId]);
assert.equal(existingOrderProductIds.has(firstProductId), true);
assert.equal(existingOrderProductIds.has(secondProductId), false);

// La compatibilidad legacy conserva el ID basado en sesión cuando no hay
// operation_id explícito; las transferencias nuevas siempre deben proporcionarlo.
assert.equal(
    getFrozenTimeChargeProductId(sessionId),
    'frozen-time-session-reused-across-transfers'
);

const config = {
    pricePerHour: 10000,
    pricePina: 5000,
    tableTaxType: 'exento',
    tableTaxMode: 'inclusive',
};
const freePoolSession = {
    id: sessionId,
    game_mode: 'NORMAL',
    hours_paid: 0,
    extended_times: 0,
    paid_at: null,
    seats: [],
};

// El primer cobro conserva la tarifa mínima; después de pagar, el offset
// absoluto evita volver a aplicar esos 30 minutos mínimos al segundo ciclo.
assert.equal(getRoundedLibreMinutes(10, 0, 0), 30);
assert.equal(getRoundedLibreMinutes(40, 0, 30), 15);
assert.equal(
    buildFrozenTimeCharge(freePoolSession, 40, config, 'POOL', 0, 0, firstOperationId, 30)?.total,
    2500
);

const preview = buildPoolToNormalPreview({
    session: freePoolSession,
    elapsedMinutes: 40,
    elapsedOffset: 30,
    config,
    orderItems: [
        { product_id: 'drink-1', unit_price_usd: 10000, qty: 1 },
        { product_id: firstProductId, unit_price_usd: 3000, qty: 1 },
    ],
    hasOrder: true,
});

assert.equal(preview.frozenTimeTotal, 2500);
assert.equal(preview.productConsumptionTotal, 10000);
assert.equal(preview.previousTransferChargesTotal, 3000);
assert.equal(preview.currentConsumptionTotal, 13000);
assert.equal(preview.previouslyPaidTotal, 5000);
assert.equal(preview.elapsedOffsetMinutes, 30);
assert.equal(preview.pendingChargeLabel, 'Tiempo Pool pendiente');

console.log('repeated-table-transfer-tests: OK (cargos por operación, offsets y desglose financiero)');
