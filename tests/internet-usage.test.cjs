const { analyzeInternetUsage, packageExpiry } = require('../src/domain/internetUsage.ts');
const { emptyAccount, decodeAccount } = require('../src/domain/account.ts');
const NOW = Date.parse('2026-11-11T12:00:00Z');
const HOUR = 3600000;
const context = { expiresLocal: '2026-11-20T17:00:00', tariffId: 'ultra', tariffName: 'Диёр Ультра' };
function entry(hoursAgo, day, night = null, overrides = {}) {
  const at = new Date(NOW - hoursAgo * HOUR).toISOString();
  const reading = (value) => value === null ? null : { value, updatedAt: at, source: 'sms' };
  return { at, context, kind: 'packages', balance: null, packages: { day: reading(day), night: reading(night), minutes: null, sms: null }, ...overrides };
}
function account(history, overrides = {}) { return { ...emptyAccount(7), ...context, history, ...overrides }; }
function analyze(history, key = 'day', overrides = {}) { return analyzeInternetUsage(account(history, overrides), key, NOW); }

test('24h and 7d use observed endpoints, average is weighted by elapsed time', () => {
  const result = analyze([entry(0, 400), entry(12, 700), entry(24, 900), entry(30, 1000)]);
  expect(result.day).toMatchObject({ consumedMb: 500, checks: 3, from: NOW - 24 * HOUR, to: NOW });
  expect(result.week).toMatchObject({ consumedMb: 600, checks: 4 });
  expect(result.forecast.kind).toBe('shortfall');
  expect(result.forecast.dailyMb).toBe(480);
  expect(result.forecast.runsOutAt).toBe(NOW + 20 * HOUR);
});
test('does not invent a daily total by splitting an interval crossing the boundary', () => {
  const result = analyze([entry(0, 400), entry(30, 1000)]);
  expect(result.day).toBeNull();
  expect(result.week.consumedMb).toBe(600);
  expect(result.forecast).toEqual({ kind: 'unavailable', reason: 'samples' });
});
test('operator increases preserve consumption and do not double-count return to the earlier level', () => {
  const result = analyze([entry(0, 29000), entry(12, 30000), entry(24, 100), entry(48, 1000)]);
  expect(result.week).toMatchObject({ consumedMb: 900, checks: 4 });
  expect(result.forecast.kind).toBe('enough');
});
test('billing period change resets even if the new balance is lower', () => {
  const result = analyze([entry(0, 400), entry(12, 500), entry(24, 600, null, { context: { ...context, expiresLocal: '2026-11-12T17:00:00' } }), entry(48, 1000)]);
  expect(result.week).toMatchObject({ consumedMb: 100, checks: 2 });
  expect(result.forecast.kind).toBe('unavailable');
});
test('stale fields carried by a partial SMS are not additional observations', () => {
  const old = entry(30, 1000);
  const partial = entry(12, null);
  partial.packages.day = old.packages.day;
  const result = analyze([entry(0, 400), partial, old]);
  expect(result.week.checks).toBe(2);
  expect(result.forecast).toEqual({ kind: 'unavailable', reason: 'samples' });
});
test('three checks within minutes cannot produce a forecast', () => {
  expect(analyze([entry(0, 400), entry(0.1, 500), entry(0.2, 600)]).forecast).toEqual({ kind: 'unavailable', reason: 'samples' });
});
test('unchanged positive readings over a day mean observed zero consumption, unknown stays unknown', () => {
  const result = analyze([entry(0, 400), entry(12, 400), entry(24, 400)]);
  expect(result.day.consumedMb).toBe(0);
  expect(result.forecast).toMatchObject({ kind: 'enough', dailyMb: 0, remainingMb: 400 });
  expect(analyze([entry(0, null), entry(24, null)]).day).toBeNull();
  expect(analyze([entry(0, 0)]).forecast).toEqual({ kind: 'empty' });
});
test('freshness, expiry and missing expiry are explicit forecast conditions', () => {
  const readings = [entry(24, 400), entry(36, 500), entry(48, 600)];
  expect(analyze(readings).forecast).toEqual({ kind: 'unavailable', reason: 'stale' });
  expect(analyze([], 'day', { expiresLocal: null }).forecast.reason).toBe('expiry');
  expect(analyze([], 'day', { expiresLocal: '2026-11-11T17:00:00' }).forecast.reason).toBe('expired');
});
test('forecast includes time since last observation rather than starting consumption at opening time', () => {
  const result = analyze([entry(12, 1000), entry(24, 1100), entry(36, 1200)]);
  expect(result.forecast).toMatchObject({ kind: 'shortfall', dailyMb: 200, runsOutAt: NOW - 12 * HOUR + 5 * 24 * HOUR });
});
test('day and night have independent rates while upward corrections preserve both histories', () => {
  const records = [entry(0, 400, 34000), entry(12, 500, 35000), entry(24, 600, 100)];
  expect(analyze(records).week.checks).toBe(3);
  expect(analyze(records, 'night').week).toMatchObject({ consumedMb: 0, checks: 3 });
});
test('legacy observations with no cycle metadata are retained but not guessed into a forecast', () => {
  const previous = { ...account([entry(0, 400), entry(12, 500), entry(24, 600)]), schemaVersion: 2 };
  previous.history.forEach((item) => { delete item.context; });
  const migrated = decodeAccount(JSON.stringify(previous));
  expect(migrated.schemaVersion).toBe(6);
  expect(migrated.history).toHaveLength(3);
  expect(migrated.history[0].context).toBeNull();
  expect(analyzeInternetUsage(migrated, 'day', NOW).week).toBeNull();
});
test('clock anomalies, duplicate and conflicting timestamps do not fabricate a drop', () => {
  const normal = [entry(0, 400), entry(12, 500), entry(24, 600)];
  expect(analyze([entry(-1, 0), ...normal, entry(12, 500)]).week.checks).toBe(3);
  expect(analyze([...normal, entry(12, 100)]).week).toBeNull();
});
test('expiry validates calendar and interprets Tajik local time consistently', () => {
  expect(packageExpiry('2026-11-11T17:00:00')).toBe(NOW);
  expect(packageExpiry('2026-02-30T17:00:00')).toBeNull();
  expect(packageExpiry('2028-02-29T17:00:00')).not.toBeNull();
  expect(packageExpiry('2026-11-11T25:00:00')).toBeNull();
});

test('enough forecast projects the remaining amount at expiry using elapsed-time average', () => {
  const result = analyze([entry(0, 29000), entry(12, 29500), entry(24, 30000)]);
  expect(result.forecast).toMatchObject({ kind: 'enough', dailyMb: 1000, remainingMb: 20000, expiresAt: NOW + 9 * 24 * HOUR });
});

test('a temporary rise preserves forecast and returning to the same balance is not new usage', () => {
  const before = [entry(12, 800), entry(24, 900), entry(36, 1000)];
  const rise = entry(6, 1200); const returned = entry(0, 800);
  const result = analyze([returned, rise, ...before]);
  expect(result.week).toMatchObject({ consumedMb: 200, checks: 5 });
  expect(result.forecast.kind).not.toBe('unavailable');
  expect(result.forecast.dailyMb).toBeCloseTo(200 / 1.5);
});
test('repeated upward corrections do not double-count drops and true new lows still add usage', () => {
  const records = [entry(0, 700), entry(3, 1100), entry(6, 800), entry(9, 1200), entry(12, 800), entry(24, 900), entry(36, 1000)];
  const result = analyze(records);
  expect(result.week.consumedMb).toBe(300);
  expect(result.day.consumedMb).toBe(200);
});
test('upward correction remains the actual reported value for projection, not a fabricated cache value', () => {
  const records = [entry(0, 30000), entry(12, 800), entry(24, 1000)];
  const a = account(records);
  const original = JSON.stringify(a);
  const result = analyzeInternetUsage(a, 'day', NOW);
  expect(result.week.consumedMb).toBe(200);
  expect(result.forecast).toMatchObject({ kind: 'enough', dailyMb: 200, remainingMb: 28200 });
  expect(JSON.stringify(a)).toBe(original);
});
