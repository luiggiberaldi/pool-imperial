const ACTIVE_TRANSFER_STATUSES = new Set(['ACTIVE', 'CHECKOUT']);

export const TRANSFER_TYPES = Object.freeze({
    ALL: 'ALL',
    CONSUMPTION: 'CONSUMPTION',
});

export const POOL_TRANSFER_MODES = Object.freeze({
    FREE: 'FREE',
    PREPAID: 'PREPAID',
    PINA: 'PINA',
});

export const SEAT_TIME_POLICIES = Object.freeze({
    KEEP: 'KEEP',
    CLEAR: 'CLEAR',
});

const TRANSFER_OPERATION_TAG = 'TRANSFER_OPERATION_ID';
const HALF_HOUR_EPSILON = 0.000001;

/**
 * La sesión puede atravesar varios contextos tarifarios. Cada operación nueva
 * necesita una identidad de cargo distinta; un reintento conserva la misma.
 */
export function getFrozenTimeChargeProductId(sessionId, transferOperationId = null) {
    return `frozen-time-${transferOperationId || sessionId}`;
}

/**
 * Cada confirmación de transferencia necesita una clave nueva. La clave no
 * puede depender únicamente de origen/destino porque una mesa puede volver a
 * recorrer el mismo trayecto más adelante; los reintentos de una confirmación
 * concreta reutilizan la clave que la UI conserva en su estado.
 */
export function createTransferOperationId(sourceSessionId = 'session', targetTableId = 'table') {
    const randomId = typeof globalThis.crypto?.randomUUID === 'function'
        ? globalThis.crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return `table-transfer:${String(sourceSessionId)}:${String(targetTableId)}:${randomId}`;
}

export function isTransferSessionActive(session) {
    return !!session && ACTIVE_TRANSFER_STATUSES.has(session.status);
}

export function normalizeTableType(type) {
    if (type === 'NORMAL' || type === 'POOL') return type;
    return null;
}

export function getActiveSessionsForTable(sessions, tableId) {
    return (sessions || []).filter(session =>
        session.table_id === tableId && isTransferSessionActive(session)
    );
}

export function hasSeatTimeCharges(session) {
    return (session?.seats || []).some(seat =>
        Array.isArray(seat?.timeCharges) && seat.timeCharges.length > 0
    );
}

function assertHalfHourValue(value, label) {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0 || number > 24) {
        throw new Error(`${label} debe estar entre 30 minutos y 24 horas`);
    }
    if (Math.abs(number * 2 - Math.round(number * 2)) > HALF_HOUR_EPSILON) {
        throw new Error(`${label} debe estar expresado en incrementos de 30 minutos`);
    }
    return Number(number.toFixed(2));
}

/**
 * Normaliza la decisión comercial que inicia una sesión Pool después de
 * Normal→Pool. Nunca se debe caer silenciosamente a modo libre.
 */
export function normalizePoolTransferMode(poolMode) {
    const input = typeof poolMode === 'string' ? { type: poolMode } : (poolMode || {});
    const type = input.type;

    if (!Object.values(POOL_TRANSFER_MODES).includes(type)) {
        throw new Error('Debes seleccionar un modo de cobro válido para la mesa de Pool');
    }

    if (type === POOL_TRANSFER_MODES.FREE) {
        return { type, hoursPaid: 0, rounds: 0 };
    }

    if (type === POOL_TRANSFER_MODES.PREPAID) {
        return {
            type,
            hoursPaid: assertHalfHourValue(input.hoursPaid, 'Las horas prepagadas'),
            rounds: 0,
        };
    }

    const rounds = Number(input.rounds);
    if (!Number.isInteger(rounds) || rounds < 1 || rounds > 100) {
        throw new Error('La cantidad de jugadas debe ser un entero entre 1 y 100');
    }
    return { type, hoursPaid: 0, rounds };
}

function readTag(notes, tag) {
    const marker = `|||${tag}:`;
    const text = String(notes || '');
    const start = text.indexOf(marker);
    if (start < 0) return null;
    const valueStart = start + marker.length;
    const valueEnd = text.indexOf('|||', valueStart);
    return text.slice(valueStart, valueEnd < 0 ? undefined : valueEnd).trim();
}

export function getTransferOperationId(session) {
    return readTag(session?.notes, TRANSFER_OPERATION_TAG);
}

export function hasTransferOperation(session, operationId) {
    return !!operationId && getTransferOperationId(session) === String(operationId);
}

/** Añade un identificador idempotente sin destruir notas ni metadata existente. */
export function appendTransferOperationTag(notes, operationId) {
    if (!operationId) return String(notes || '').trim() || null;
    const clean = String(notes || '')
        .replace(/\|\|\|TRANSFER_OPERATION_ID:[^|]*\|\|\|/g, '')
        .trim();
    return `${clean}${clean ? ' ' : ''}|||TRANSFER_OPERATION_ID:${String(operationId)}|||`;
}

/**
 * Valida las invariantes que deben cumplirse antes de tocar órdenes o sesiones.
 * Transferir una sesión en CHECKOUT permitiría mover una cuenta que ya está siendo
 * cobrada; por eso CHECKOUT se considera ocupada, pero no transferible.
 */
export function validateTableTransfer({
    sourceSession,
    sourceTable,
    targetTable,
    allSessions = [],
    transferType,
}) {
    if (!sourceSession) throw new Error('Sesión origen no encontrada');
    if (!isTransferSessionActive(sourceSession)) {
        throw new Error('La sesión origen ya no está activa');
    }
    if (sourceSession.status === 'CHECKOUT') {
        throw new Error('Retira la solicitud de cobro antes de transferir la mesa');
    }
    if (!sourceTable) throw new Error('Mesa origen no encontrada');
    if (!targetTable) throw new Error('Mesa destino no encontrada');
    if (sourceSession.table_id !== sourceTable.id) {
        throw new Error('La sesión origen no corresponde a la mesa seleccionada');
    }
    if (sourceSession.table_id === targetTable.id) {
        throw new Error('La mesa de destino debe ser diferente a la mesa de origen');
    }
    if (!Object.values(TRANSFER_TYPES).includes(transferType)) {
        throw new Error(`Tipo de transferencia no soportado: ${transferType}`);
    }

    const sourceType = normalizeTableType(sourceTable.type);
    const targetType = normalizeTableType(targetTable.type);
    if (!sourceType || !targetType) {
        throw new Error('El tipo de la mesa origen o destino no es válido');
    }

    const sourceSessions = getActiveSessionsForTable(allSessions, sourceSession.table_id);
    if (!sourceSessions.some(session => session.id === sourceSession.id)) {
        throw new Error('La sesión origen no está en el estado sincronizado actual');
    }
    if (sourceSessions.length > 1) {
        throw new Error('La mesa de origen tiene más de una sesión activa; transferencia cancelada');
    }

    const targetSessions = getActiveSessionsForTable(allSessions, targetTable.id);
    if (targetSessions.length > 1) {
        throw new Error('La mesa de destino tiene más de una sesión activa; transferencia cancelada');
    }
    if (targetSessions.some(session => session.status === 'CHECKOUT')) {
        throw new Error('La mesa de destino está en caja; retira su solicitud antes de fusionar');
    }

    if (transferType === TRANSFER_TYPES.ALL && targetSessions.length > 0) {
        throw new Error('La mesa de destino ya está ocupada. Solo puedes transferir el consumo');
    }
    if (transferType === TRANSFER_TYPES.CONSUMPTION && targetSessions.length === 0) {
        throw new Error('La mesa de destino debe estar ocupada para poder recibir el consumo');
    }

    return {
        sourceType,
        targetType,
        targetSession: targetSessions[0] || null,
    };
}

function clearSeatTimeCharges(seat) {
    return { ...seat, timeCharges: [] };
}

/**
 * Construye únicamente el patch que se persiste en table_sessions al mover una
 * sesión completa. Los cambios de tipo son explícitos para no reinterpretar el
 * tiempo de la sesión en la mesa destino.
 */
export function buildTableTransferSessionPatch({
    sourceSession,
    targetTableId,
    sourceType,
    targetType,
    nowISO,
    poolMode,
    preserveSeatTimeCharges,
    transferOperationId,
    transferMetadata,
}) {
    const patch = { table_id: targetTableId };
    const normalizedSourceType = normalizeTableType(sourceType);
    const normalizedTargetType = normalizeTableType(targetType);

    if (!normalizedSourceType || !normalizedTargetType) {
        throw new Error('El tipo de la mesa origen o destino no es válido');
    }

    if (normalizedSourceType === 'POOL' && normalizedTargetType === 'NORMAL') {
        if (!nowISO || Number.isNaN(new Date(nowISO).getTime())) {
            throw new Error('No se pudo obtener una hora válida para iniciar el contexto Normal');
        }
        // Normal no cobra tiempo, pero su reloj visual debe comenzar en el
        // traslado y no seguir mostrando el tiempo histórico de Pool.
        patch.started_at = nowISO;
        patch.game_mode = 'NORMAL';
        patch.hours_paid = 0;
        patch.extended_times = 0;
        patch.paid_at = null;
        patch.seats = (sourceSession?.seats || []).map(clearSeatTimeCharges);
        // Un estado de pausa de Pool no puede viajar a una mesa sin cronómetro.
        patch.paused_at = null;
    } else if (normalizedSourceType === 'NORMAL' && normalizedTargetType === 'POOL') {
        const normalizedMode = normalizePoolTransferMode(poolMode);
        const sourceHasSeatCharges = hasSeatTimeCharges(sourceSession);

        if (sourceHasSeatCharges && typeof preserveSeatTimeCharges !== 'boolean') {
            throw new Error('Confirma si los cargos manuales por asiento se conservan en Pool');
        }
        if (!nowISO || Number.isNaN(new Date(nowISO).getTime())) {
            throw new Error('No se pudo obtener una hora válida para iniciar el cobro de Pool');
        }

        // El tiempo del bar no se factura retroactivamente y el nuevo reloj debe
        // comenzar limpio, aunque la cuenta normal ya hubiera sido pagada.
        patch.started_at = nowISO;
        patch.game_mode = normalizedMode.type === POOL_TRANSFER_MODES.PINA ? 'PINA' : 'NORMAL';
        patch.hours_paid = normalizedMode.hoursPaid;
        // PINA ya incluye una jugada base; solo las adicionales van en extended_times.
        patch.extended_times = normalizedMode.type === POOL_TRANSFER_MODES.PINA
            ? normalizedMode.rounds - 1
            : 0;
        patch.paid_at = null;
        patch.paused_at = null;

        if (sourceHasSeatCharges && preserveSeatTimeCharges === false) {
            patch.seats = (sourceSession?.seats || []).map(clearSeatTimeCharges);
        }
    }

    if (transferOperationId) {
        patch.notes = appendTransferOperationTag(sourceSession?.notes, transferOperationId);
    }
    if (transferMetadata && typeof transferMetadata === 'object') {
        patch.transfer_metadata = transferMetadata;
    }

    return patch;
}

function makeUniqueSeatId(baseId, sourceSessionId, index, usedIds) {
    const original = String(baseId || `seat-${index + 1}`);
    if (!usedIds.has(original)) {
        usedIds.add(original);
        return original;
    }

    let suffix = 1;
    let candidate = `seat-transfer-${sourceSessionId || 'source'}-${index + 1}-${suffix}`;
    while (usedIds.has(candidate)) {
        suffix += 1;
        candidate = `seat-transfer-${sourceSessionId || 'source'}-${index + 1}-${suffix}`;
    }
    usedIds.add(candidate);
    return candidate;
}

/**
 * Conserva los IDs normales y remapea solo colisiones contra los asientos del
 * destino. Esto mantiene la atribución seat_id de los ítems al fusionar cuentas.
 */
export function remapTransferredSeats(targetSeats = [], sourceSeats = [], sourceSessionId = '') {
    const usedIds = new Set((targetSeats || []).map(seat => String(seat.id)));
    const seatIdMap = {};
    const seats = (sourceSeats || []).map((seat, index) => {
        const oldId = String(seat.id || `seat-${index + 1}`);
        const newId = makeUniqueSeatId(oldId, sourceSessionId, index, usedIds);
        seatIdMap[oldId] = newId;
        return { ...seat, id: newId };
    });

    return { seats, seatIdMap };
}

function parseJSONTag(notes, tag, fallback = null) {
    const raw = readTag(notes, tag);
    if (raw == null || raw === '') return fallback;
    try {
        return JSON.parse(raw);
    } catch {
        return fallback;
    }
}

function parseNumberTag(notes, tag) {
    const value = Number(readTag(notes, tag));
    return Number.isFinite(value) ? value : 0;
}

function appendCleanNote(notes, parts) {
    const clean = String(notes || '').split('|||')[0].trim();
    if (clean && !parts.includes(clean)) parts.push(clean);
}

/**
 * Une metadata de dos sesiones sin duplicar tags estructurados. En particular,
 * RETIRED_PAID_SHARED y los abonos por monto deben seguir a la cuenta destino:
 * perderlos al cerrar el origen produce doble cobro en el siguiente cierre.
 */
export function mergeTransferNotes(targetNotes = '', sourceNotes = '') {
    const cleanParts = [];
    appendCleanNote(targetNotes, cleanParts);
    appendCleanNote(sourceNotes, cleanParts);

    const result = cleanParts.join(' · ');
    const targetTip = readTag(targetNotes, 'TIP_ENABLED');
    const sourceTip = readTag(sourceNotes, 'TIP_ENABLED');
    let merged = result;

    const targetAbono = parseJSONTag(targetNotes, 'ABONO');
    const sourceAbono = parseJSONTag(sourceNotes, 'ABONO');
    const abono = targetAbono ?? sourceAbono;
    if (abono != null) merged += ` |||ABONO:${JSON.stringify(abono)}`;

    const targetAbonoMonto = parseJSONTag(targetNotes, 'ABONO_MONTO');
    const sourceAbonoMonto = parseJSONTag(sourceNotes, 'ABONO_MONTO');
    const abonoMonto = targetAbonoMonto ?? sourceAbonoMonto;
    if (abonoMonto != null) merged += ` |||ABONO_MONTO:${JSON.stringify(abonoMonto)}`;

    const targetHistory = parseJSONTag(targetNotes, 'HISTORIAL_ABONOS', []);
    const sourceHistory = parseJSONTag(sourceNotes, 'HISTORIAL_ABONOS', []);
    const history = [
        ...(Array.isArray(targetHistory) ? targetHistory : []),
        ...(Array.isArray(sourceHistory) ? sourceHistory : []),
    ].filter((entry, index, entries) => {
        const key = entry?.id || JSON.stringify(entry);
        return entries.findIndex(candidate => (candidate?.id || JSON.stringify(candidate)) === key) === index;
    });
    if (history.length > 0) merged += ` |||HISTORIAL_ABONOS:${JSON.stringify(history)}`;

    const retiredShared = Number((
        parseNumberTag(targetNotes, 'RETIRED_PAID_SHARED')
        + parseNumberTag(sourceNotes, 'RETIRED_PAID_SHARED')
    ).toFixed(2));
    if (retiredShared > 0) merged += ` |||RETIRED_PAID_SHARED:${retiredShared}|||`;

    const tip = targetTip ?? sourceTip;
    if (tip != null) merged += ` |||TIP_ENABLED:${tip === '1' ? '1' : '0'}|||`;

    return merged.trim() || null;
}

/**
 * Prepara la sesión destino para una fusión. Los cargos de tiempo de una fuente
 * Pool ya se materializan como frozen-time en la orden; dejarlos en seats los
 * volvería a cobrar al cerrar la mesa destino.
 */
export function buildConsumptionMergePayload({
    targetSession,
    sourceSession,
    sourceType,
    targetType,
    preserveSeatTimeCharges,
    transferOperationId,
}) {
    const targetSeats = Array.isArray(targetSession?.seats) ? targetSession.seats : [];
    const sourceSeats = Array.isArray(sourceSession?.seats) ? sourceSession.seats : [];
    const sourceHasSeatCharges = hasSeatTimeCharges(sourceSession);
    const normalizedSourceType = normalizeTableType(sourceType);
    const normalizedTargetType = normalizeTableType(targetType);

    if (!normalizedSourceType || !normalizedTargetType) {
        throw new Error('El tipo de la mesa origen o destino no es válido');
    }
    if (
        normalizedSourceType === 'NORMAL'
        && normalizedTargetType === 'POOL'
        && sourceHasSeatCharges
        && typeof preserveSeatTimeCharges !== 'boolean'
    ) {
        throw new Error('Confirma si los cargos manuales por asiento se conservan en Pool');
    }

    const { seats: remappedSourceSeats, seatIdMap } = remapTransferredSeats(
        targetSeats,
        sourceSeats,
        sourceSession?.id
    );
    const sourceSeatsForTarget = normalizedSourceType === 'POOL'
        || (normalizedSourceType === 'NORMAL' && normalizedTargetType === 'POOL' && preserveSeatTimeCharges === false)
        ? remappedSourceSeats.map(clearSeatTimeCharges)
        : remappedSourceSeats;
    const mergedSeats = [...targetSeats, ...sourceSeatsForTarget];
    const sourceGuests = Number(sourceSession?.guest_count) || 0;
    const targetGuests = Number(targetSession?.guest_count) || 0;
    const notes = appendTransferOperationTag(
        mergeTransferNotes(targetSession?.notes, sourceSession?.notes),
        transferOperationId
    );

    return {
        payload: {
            seats: mergedSeats,
            guest_count: Math.max(mergedSeats.length, targetGuests + sourceGuests),
            client_name: targetSession?.client_name || sourceSession?.client_name || null,
            client_id: targetSession?.client_id || sourceSession?.client_id || null,
            notes,
        },
        seatIdMap,
    };
}

export function remapOrderItemSeatId(item, seatIdMap) {
    if (!item?.seat_id) return item?.seat_id || null;
    return seatIdMap[item.seat_id] || item.seat_id;
}
