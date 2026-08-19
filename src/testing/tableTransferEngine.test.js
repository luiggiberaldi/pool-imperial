import assert from 'node:assert/strict';
import {
    TRANSFER_TYPES,
    POOL_TRANSFER_MODES,
    validateTableTransfer,
    buildTableTransferSessionPatch,
    buildConsumptionMergePayload,
    normalizePoolTransferMode,
    remapOrderItemSeatId,
    hasTransferOperation,
    createTransferOperationId,
} from '../utils/tableTransferEngine.js';

const sourceTable = { id: 'source-table', type: 'POOL' };
const targetTable = { id: 'target-table', type: 'NORMAL' };
const sourceSession = {
    id: 'source-session',
    table_id: sourceTable.id,
    status: 'ACTIVE',
    paid_at: '2026-08-18T11:00:00.000Z',
    seats: [{ id: 'seat-1', label: 'Ana', paid: false, timeCharges: [{ type: 'hora', amount: 1 }] }],
    guest_count: 1,
};
const nowISO = '2026-08-18T12:00:00.000Z';

const firstOperationId = createTransferOperationId('source-session', 'target-table');
const secondOperationId = createTransferOperationId('source-session', 'target-table');
assert.notEqual(firstOperationId, secondOperationId);
assert.match(firstOperationId, /^table-transfer:source-session:target-table:/);

const expectThrow = (fn, label) => {
    assert.throws(fn, undefined, label);
};

for (const [sourceType, targetType] of [
    ['POOL', 'POOL'],
    ['NORMAL', 'NORMAL'],
    ['POOL', 'NORMAL'],
]) {
    const patch = buildTableTransferSessionPatch({
        sourceSession,
        targetTableId: targetTable.id,
        sourceType,
        targetType,
        nowISO,
        transferOperationId: `op-${sourceType}-${targetType}`,
    });
    assert.equal(patch.table_id, targetTable.id);
    assert.match(patch.notes, /TRANSFER_OPERATION_ID/);
    if (sourceType === 'POOL' && targetType === 'NORMAL') {
        assert.deepEqual(patch.seats[0].timeCharges, []);
        assert.equal(patch.started_at, nowISO);
        assert.equal(patch.game_mode, 'NORMAL');
        assert.equal(patch.hours_paid, 0);
        assert.equal(patch.extended_times, 0);
        assert.equal(patch.paid_at, null);
        assert.equal(patch.paused_at, null);
    }
}

expectThrow(
    () => buildTableTransferSessionPatch({
        sourceSession,
        targetTableId: targetTable.id,
        sourceType: 'NORMAL',
        targetType: 'POOL',
        nowISO,
        preserveSeatTimeCharges: false,
    }),
    'Normal→Pool requiere modo explícito'
);
expectThrow(
    () => normalizePoolTransferMode({ type: POOL_TRANSFER_MODES.PREPAID, hoursPaid: 0 }),
    'prepago cero'
);
expectThrow(
    () => normalizePoolTransferMode({ type: POOL_TRANSFER_MODES.PREPAID, hoursPaid: 0.25 }),
    'prepago no múltiplo de 30 minutos'
);
expectThrow(
    () => normalizePoolTransferMode({ type: POOL_TRANSFER_MODES.PINA, rounds: 0 }),
    'jugadas cero'
);

const prepaidPatch = buildTableTransferSessionPatch({
    sourceSession,
    targetTableId: 'pool-destination',
    sourceType: 'NORMAL',
    targetType: 'POOL',
    nowISO,
    poolMode: { type: POOL_TRANSFER_MODES.PREPAID, hoursPaid: 0.5 },
    preserveSeatTimeCharges: false,
    transferOperationId: 'normal-pool-prepaid',
});
assert.equal(prepaidPatch.started_at, nowISO);
assert.equal(prepaidPatch.game_mode, 'NORMAL');
assert.equal(prepaidPatch.hours_paid, 0.5);
assert.equal(prepaidPatch.extended_times, 0);
assert.equal(prepaidPatch.paid_at, null);
assert.equal(prepaidPatch.paused_at, null);
assert.deepEqual(prepaidPatch.seats[0].timeCharges, []);
assert.equal(hasTransferOperation(prepaidPatch, 'normal-pool-prepaid'), true);

const freePatch = buildTableTransferSessionPatch({
    sourceSession: { ...sourceSession, seats: [] },
    targetTableId: 'pool-destination',
    sourceType: 'NORMAL',
    targetType: 'POOL',
    nowISO,
    poolMode: { type: POOL_TRANSFER_MODES.FREE },
    transferOperationId: 'normal-pool-free',
});
assert.equal(freePatch.game_mode, 'NORMAL');
assert.equal(freePatch.hours_paid, 0);

const pinaPatch = buildTableTransferSessionPatch({
    sourceSession: { ...sourceSession, seats: [] },
    targetTableId: 'pool-destination',
    sourceType: 'NORMAL',
    targetType: 'POOL',
    nowISO,
    poolMode: { type: POOL_TRANSFER_MODES.PINA, rounds: 3 },
    transferOperationId: 'normal-pool-pina',
});
assert.equal(pinaPatch.game_mode, 'PINA');
assert.equal(pinaPatch.hours_paid, 0);
assert.equal(pinaPatch.extended_times, 2); // una jugada base + dos adicionales

const targetSession = {
    id: 'target-session',
    table_id: targetTable.id,
    status: 'ACTIVE',
    seats: [{ id: 'seat-1', label: 'Luis', paid: false, timeCharges: [] }],
    guest_count: 1,
};
const targetTablePool = { id: targetTable.id, type: 'POOL' };

assert.equal(
    validateTableTransfer({
        sourceSession,
        sourceTable,
        targetTable: targetTablePool,
        allSessions: [sourceSession],
        transferType: TRANSFER_TYPES.ALL,
    }).targetSession,
    null
);
expectThrow(
    () => validateTableTransfer({ sourceSession, sourceTable, targetTable: targetTablePool, allSessions: [sourceSession, targetSession], transferType: TRANSFER_TYPES.ALL }),
    'ALL hacia destino ocupado'
);
assert.equal(
    validateTableTransfer({ sourceSession, sourceTable, targetTable: targetTablePool, allSessions: [sourceSession, targetSession], transferType: TRANSFER_TYPES.CONSUMPTION }).targetSession.id,
    targetSession.id
);
expectThrow(
    () => validateTableTransfer({ sourceSession, sourceTable, targetTable: targetTablePool, allSessions: [sourceSession], transferType: TRANSFER_TYPES.CONSUMPTION }),
    'CONSUMPTION hacia destino libre'
);
expectThrow(
    () => validateTableTransfer({ sourceSession: { ...sourceSession, status: 'CHECKOUT' }, sourceTable, targetTable: targetTablePool, allSessions: [sourceSession], transferType: TRANSFER_TYPES.ALL }),
    'origen CHECKOUT'
);
expectThrow(
    () => validateTableTransfer({ sourceSession, sourceTable, targetTable: { id: 'missing', type: 'POOL' }, allSessions: [sourceSession], transferType: 'INVALID' }),
    'tipo inválido'
);
expectThrow(
    () => validateTableTransfer({ sourceSession, sourceTable, targetTable: sourceTable, allSessions: [sourceSession], transferType: TRANSFER_TYPES.ALL }),
    'misma mesa'
);
expectThrow(
    () => validateTableTransfer({
        sourceSession,
        sourceTable,
        targetTable: targetTablePool,
        allSessions: [sourceSession, { ...sourceSession, id: 'duplicate-source' }],
        transferType: TRANSFER_TYPES.ALL,
    }),
    'sesiones duplicadas en origen'
);
expectThrow(
    () => validateTableTransfer({
        sourceSession,
        sourceTable,
        targetTable: targetTablePool,
        allSessions: [sourceSession, targetSession, { ...targetSession, id: 'duplicate-target' }],
        transferType: TRANSFER_TYPES.CONSUMPTION,
    }),
    'sesiones duplicadas en destino'
);

const mergePlan = buildConsumptionMergePayload({
    targetSession,
    sourceSession: {
        ...sourceSession,
        notes: 'Origen |||RETIRED_PAID_SHARED:3||| |||HISTORIAL_ABONOS:[{"id":"source"}]',
    },
    sourceType: 'POOL',
    targetType: 'POOL',
    transferOperationId: 'merge-pool-pool',
});
const movedSeat = mergePlan.payload.seats.find(seat => seat.label === 'Ana');
assert.notEqual(movedSeat.id, 'seat-1');
assert.deepEqual(movedSeat.timeCharges, []);
assert.equal(remapOrderItemSeatId({ seat_id: 'seat-1' }, mergePlan.seatIdMap), movedSeat.id);
assert.match(mergePlan.payload.notes, /RETIRED_PAID_SHARED:3/);
assert.match(mergePlan.payload.notes, /source/);
assert.match(mergePlan.payload.notes, /TRANSFER_OPERATION_ID:merge-pool-pool/);

const normalMerge = buildConsumptionMergePayload({
    targetSession,
    sourceSession: {
        ...sourceSession,
        seats: [{ id: 'bar-seat', label: 'Bar', paid: false, timeCharges: [{ type: 'hora', amount: 0.5 }] }],
    },
    sourceType: 'NORMAL',
    targetType: 'POOL',
    preserveSeatTimeCharges: true,
});
assert.equal(normalMerge.payload.seats.find(seat => seat.label === 'Bar').timeCharges.length, 1);

const clearedNormalMerge = buildConsumptionMergePayload({
    targetSession,
    sourceSession: {
        ...sourceSession,
        seats: [{ id: 'bar-seat-2', label: 'Bar 2', paid: false, timeCharges: [{ type: 'hora', amount: 0.5 }] }],
    },
    sourceType: 'NORMAL',
    targetType: 'POOL',
    preserveSeatTimeCharges: false,
});
assert.deepEqual(clearedNormalMerge.payload.seats.find(seat => seat.label === 'Bar 2').timeCharges, []);
expectThrow(
    () => buildConsumptionMergePayload({
        targetSession,
        sourceSession,
        sourceType: 'NORMAL',
        targetType: 'POOL',
    }),
    'fusión Normal→Pool requiere política de asiento'
);

console.log('table-transfer-tests: OK (Pool/Normal, modos, guardrails, fusiones y validaciones)');
