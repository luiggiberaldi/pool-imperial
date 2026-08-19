import assert from 'node:assert/strict';
import {
    REPORT_TIMEZONE,
    buildReportRange,
    dateKeyStartMs,
    getDateKeyInTimeZone,
    isTimestampInReportRange,
} from '../utils/reportRangeEngine.js';

const now = new Date('2026-08-18T15:00:00.000Z');
const today = buildReportRange({ kind: 'today', now });
assert.equal(today.isValid, true);
assert.equal(today.timezone, REPORT_TIMEZONE);
assert.equal(today.fromDate, '2026-08-18');
assert.equal(today.toDate, '2026-08-18');
assert.equal(today.fromInstantMs, Date.parse('2026-08-18T05:00:00.000Z'));
assert.equal(today.toInstantExclusiveMs, Date.parse('2026-08-19T05:00:00.000Z'));
assert.equal(isTimestampInReportRange('2026-08-18T04:59:59.999Z', today), false);
assert.equal(isTimestampInReportRange('2026-08-18T05:00:00.000Z', today), true);
assert.equal(isTimestampInReportRange('2026-08-19T05:00:00.000Z', today), false);

const yesterday = buildReportRange({ kind: 'yesterday', now });
assert.equal(yesterday.fromDate, '2026-08-17');
assert.equal(yesterday.toDate, '2026-08-17');

const week = buildReportRange({ kind: 'week', now });
assert.equal(week.fromDate, '2026-08-17'); // lunes
assert.equal(week.toDate, '2026-08-18');

const month = buildReportRange({ kind: 'month', now });
assert.equal(month.fromDate, '2026-08-01');
assert.equal(month.toDate, '2026-08-18');

const lastMonth = buildReportRange({
    kind: 'lastMonth',
    now: new Date('2026-01-10T15:00:00.000Z'),
});
assert.equal(lastMonth.fromDate, '2025-12-01');
assert.equal(lastMonth.toDate, '2025-12-31');

const custom = buildReportRange({
    kind: 'custom',
    customFrom: '2026-08-01',
    customTo: '2026-08-18',
    now,
});
assert.equal(custom.isValid, true);
assert.equal(custom.toInstantExclusiveMs, Date.parse('2026-08-19T05:00:00.000Z'));

for (const options of [
    { customFrom: '', customTo: '2026-08-18' },
    { customFrom: '2026-08-18', customTo: '' },
    { customFrom: '2026-08-19', customTo: '2026-08-18' },
    { customFrom: '2026-08-01', customTo: '2026-08-19' },
]) {
    assert.equal(buildReportRange({ kind: 'custom', ...options, now }).isValid, false);
}

const shift = buildReportRange({
    kind: 'current_shift',
    now,
    cashSession: { id: 'cash-1', opened_at: '2026-08-18T12:00:00.000Z' },
});
assert.equal(shift.isValid, true);
assert.equal(shift.cashSessionId, 'cash-1');
assert.equal(isTimestampInReportRange('2026-08-18T11:59:59.999Z', shift), false);
assert.equal(isTimestampInReportRange('2026-08-18T12:00:00.000Z', shift), true);
assert.equal(isTimestampInReportRange('2026-08-18T15:00:00.000Z', shift), false);
assert.equal(buildReportRange({ kind: 'current_shift', now }).isValid, false);

assert.equal(getDateKeyInTimeZone('2026-08-19T04:59:59.999Z'), '2026-08-18');
assert.equal(dateKeyStartMs('2026-08-18'), Date.parse('2026-08-18T05:00:00.000Z'));

console.log('report-range-tests: OK (timezone, límites, custom y turno)');
