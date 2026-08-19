export const REPORT_TIMEZONE = 'America/Bogota';

const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const RANGE_LABELS = Object.freeze({
    current_shift: 'Turno Actual',
    today: 'Hoy',
    yesterday: 'Ayer',
    week: 'Esta Semana',
    month: 'Este Mes',
    lastMonth: 'Mes Anterior',
    custom: 'Personalizado',
});

function partsToObject(parts) {
    return parts.reduce((result, part) => {
        if (part.type !== 'literal') result[part.type] = part.value;
        return result;
    }, {});
}

function dateFormatter(timeZone, withTime = false) {
    return new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        ...(withTime ? {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hourCycle: 'h23',
        } : {}),
    });
}

export function timestampToMs(value) {
    if (value instanceof Date) {
        const ms = value.getTime();
        return Number.isFinite(ms) ? ms : null;
    }
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) return null;
        // Legacy records sometimes persist Unix seconds instead of milliseconds.
        return Math.abs(value) < 100_000_000_000 ? value * 1000 : value;
    }
    if (value === null || value === undefined || value === '') return null;
    const normalized = String(value).trim();
    if (/^\d{10,}$/.test(normalized)) {
        const numeric = Number(normalized);
        if (Number.isFinite(numeric)) {
            return numeric < 100_000_000_000 ? numeric * 1000 : numeric;
        }
    }
    const ms = new Date(normalized).getTime();
    return Number.isFinite(ms) ? ms : null;
}

export function getDateKeyInTimeZone(value, timeZone = REPORT_TIMEZONE) {
    const ms = timestampToMs(value);
    if (ms === null) return null;
    try {
        const parts = partsToObject(dateFormatter(timeZone).formatToParts(new Date(ms)));
        return `${parts.year}-${parts.month}-${parts.day}`;
    } catch {
        return null;
    }
}

export function isValidDateKey(dateKey) {
    const match = DATE_KEY_PATTERN.exec(String(dateKey || ''));
    if (!match) return false;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year
        && date.getUTCMonth() === month - 1
        && date.getUTCDate() === day;
}

function parseDateKey(dateKey) {
    if (!isValidDateKey(dateKey)) return null;
    const [, year, month, day] = DATE_KEY_PATTERN.exec(dateKey);
    return { year: Number(year), month: Number(month), day: Number(day) };
}

function addCalendarDays(dateKey, amount) {
    const parts = parseDateKey(dateKey);
    if (!parts) return null;
    const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
    date.setUTCDate(date.getUTCDate() + amount);
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function timeZoneOffsetMs(utcGuessMs, timeZone) {
    const parts = partsToObject(dateFormatter(timeZone, true).formatToParts(new Date(utcGuessMs)));
    let hour = Number(parts.hour);
    // h23 normally returns 00–23, but some engines can still expose 24 at
    // midnight. Treat it as the beginning of the displayed calendar day.
    if (hour === 24) hour = 0;
    const asUtc = Date.UTC(
        Number(parts.year),
        Number(parts.month) - 1,
        Number(parts.day),
        hour,
        Number(parts.minute),
        Number(parts.second)
    );
    return asUtc - utcGuessMs;
}

/** Converts a local calendar midnight in `timeZone` to an absolute instant. */
export function dateKeyStartMs(dateKey, timeZone = REPORT_TIMEZONE) {
    const parts = parseDateKey(dateKey);
    if (!parts) return null;

    const wallClockGuess = Date.UTC(parts.year, parts.month - 1, parts.day);
    const firstOffset = timeZoneOffsetMs(wallClockGuess, timeZone);
    let utcMs = wallClockGuess - firstOffset;
    const secondOffset = timeZoneOffsetMs(utcMs, timeZone);
    if (secondOffset !== firstOffset) utcMs = wallClockGuess - secondOffset;
    return utcMs;
}

function invalidRange(kind, error, timeZone, label = RANGE_LABELS[kind] || kind) {
    return {
        kind,
        timezone: timeZone,
        fromDate: null,
        toDate: null,
        fromInstantMs: null,
        toInstantExclusiveMs: null,
        cashSessionId: null,
        isValid: false,
        error,
        label,
    };
}

function validCalendarRange(kind, fromDate, toDate, timeZone, label) {
    const fromInstantMs = dateKeyStartMs(fromDate, timeZone);
    const nextDate = addCalendarDays(toDate, 1);
    const toInstantExclusiveMs = dateKeyStartMs(nextDate, timeZone);
    if (fromInstantMs === null || toInstantExclusiveMs === null) {
        return invalidRange(kind, 'No se pudo construir el rango de fechas', timeZone, label);
    }
    return {
        kind,
        timezone: timeZone,
        fromDate,
        toDate,
        fromInstantMs,
        toInstantExclusiveMs,
        cashSessionId: null,
        isValid: fromInstantMs < toInstantExclusiveMs,
        error: fromInstantMs < toInstantExclusiveMs ? null : 'El rango de fechas no es válido',
        label,
    };
}

export function buildReportRange({
    kind = 'today',
    customFrom = '',
    customTo = '',
    now = new Date(),
    timeZone = REPORT_TIMEZONE,
    cashSession = null,
} = {}) {
    const nowMs = timestampToMs(now);
    if (nowMs === null) return invalidRange(kind, 'La hora actual no es válida', timeZone);

    if (kind === 'current_shift') {
        const fromInstantMs = timestampToMs(cashSession?.opened_at);
        const sessionCloseMs = timestampToMs(cashSession?.closed_at);
        const toInstantExclusiveMs = Math.min(
            sessionCloseMs ?? nowMs,
            nowMs
        );
        if (fromInstantMs === null) {
            return invalidRange(kind, 'No hay una caja activa para este turno', timeZone);
        }
        if (fromInstantMs >= toInstantExclusiveMs) {
            return invalidRange(kind, 'El intervalo de la caja no es válido', timeZone);
        }
        return {
            kind,
            timezone: timeZone,
            fromDate: getDateKeyInTimeZone(fromInstantMs, timeZone),
            toDate: getDateKeyInTimeZone(Math.max(fromInstantMs, toInstantExclusiveMs - 1), timeZone),
            fromInstantMs,
            toInstantExclusiveMs,
            cashSessionId: cashSession.id || null,
            isValid: true,
            error: null,
            label: RANGE_LABELS.current_shift,
        };
    }

    const today = getDateKeyInTimeZone(nowMs, timeZone);
    if (!today) return invalidRange(kind, 'No se pudo determinar el día comercial', timeZone);

    if (kind === 'custom') {
        if (!customFrom || !customTo) {
            return invalidRange(kind, 'Selecciona las fechas Desde y Hasta', timeZone);
        }
        if (!isValidDateKey(customFrom) || !isValidDateKey(customTo)) {
            return invalidRange(kind, 'Las fechas seleccionadas no son válidas', timeZone);
        }
        if (customFrom > customTo) {
            return invalidRange(kind, 'La fecha Desde no puede ser posterior a Hasta', timeZone);
        }
        if (customTo > today) {
            return invalidRange(kind, 'La fecha Hasta no puede ser futura', timeZone);
        }
        return validCalendarRange(kind, customFrom, customTo, timeZone, RANGE_LABELS.custom);
    }

    let fromDate = today;
    let toDate = today;
    if (kind === 'yesterday') {
        fromDate = addCalendarDays(today, -1);
        toDate = fromDate;
    } else if (kind === 'week') {
        const todayParts = parseDateKey(today);
        const todayUtc = new Date(Date.UTC(todayParts.year, todayParts.month - 1, todayParts.day));
        const mondayOffset = (todayUtc.getUTCDay() + 6) % 7;
        fromDate = addCalendarDays(today, -mondayOffset);
    } else if (kind === 'month') {
        const todayParts = parseDateKey(today);
        fromDate = `${todayParts.year}-${String(todayParts.month).padStart(2, '0')}-01`;
    } else if (kind === 'lastMonth') {
        const todayParts = parseDateKey(today);
        const firstCurrentMonth = `${todayParts.year}-${String(todayParts.month).padStart(2, '0')}-01`;
        toDate = addCalendarDays(firstCurrentMonth, -1);
        const endParts = parseDateKey(toDate);
        fromDate = `${endParts.year}-${String(endParts.month).padStart(2, '0')}-01`;
    } else if (kind !== 'today') {
        return invalidRange(kind, 'Rango de reportes no soportado', timeZone);
    }

    return validCalendarRange(kind, fromDate, toDate, timeZone, RANGE_LABELS[kind] || kind);
}

export function isTimestampInReportRange(timestamp, range) {
    const timestampMs = timestampToMs(timestamp);
    if (!range?.isValid || timestampMs === null) return false;
    return timestampMs >= range.fromInstantMs && timestampMs < range.toInstantExclusiveMs;
}

export function getReportRangeLabel(range) {
    if (!range) return '';
    if (range.kind === 'current_shift') return range.label || RANGE_LABELS.current_shift;
    if (range.kind === 'custom' && range.fromDate && range.toDate) {
        return `${range.fromDate} a ${range.toDate}`;
    }
    return range.label || RANGE_LABELS[range.kind] || '';
}
