const { tariffView, visiblePackageKeys } = require('../src/domain/tariffView.ts');
const { AccountController } = require('../src/application/AccountController.ts');
const { emptyAccount, decodeAccount } = require('../src/domain/account.ts');
let now = Date.parse('2026-11-12T05:00:00Z');
const make = () => new AccountController({ available: false, onSms: () => () => {}, listenSms: async () => false }, { read: async () => null, write: async () => {} }, () => now);
test('manual 15→35→15 preserves the original readings, timestamps and history', async () => {
  const c = make(); await c.init();
  c.importSms('Тарофаи Шумо <<Диёр 15>>\nДакикахои бокимонда: 250 дакика;');
  const before = c.getSnapshot().account;
  c.chooseTariff('diyor35'); c.chooseTariff('diyor15');
  expect(c.getSnapshot().account.packages).toEqual(before.packages);
  expect(c.getSnapshot().account.history).toEqual(before.history);
  expect(tariffView(c.getSnapshot().account).packages.minutes.value).toBe(250);
  c.dispose();
});
test('switching to a genuinely different plan preserves MB in its own durable snapshot; selecting it restores a labelled archive view', async () => {
  const c = make(); await c.init();
  c.importSms('Тарофаи Шумо <<Диёр 35>>\nИнтернети бокимонда: 3800 мб;\nДакикахои бокимонда: 390 дакика;');
  const time = c.getSnapshot().account.packages.day.updatedAt;
  now += 1000;
  c.importSms('Тарофаи Шумо <<Диёр 15>>\nДакикахои бокимонда: 250 дакика;');
  expect(c.getSnapshot().account.packages.day).toBeNull();
  expect(c.getSnapshot().account.tariffSnapshots.diyor35.packages.day.value).toBe(3800);
  c.chooseTariff('diyor35');
  const restored = decodeAccount(JSON.stringify(c.getSnapshot().account));
  expect(tariffView(restored)).toMatchObject({ historical: true, packages: { day: { value: 3800, updatedAt: time } } });
  c.chooseTariff('diyor15');
  expect(tariffView(c.getSnapshot().account)).toMatchObject({ historical: false, packages: { minutes: { value: 250 } } });
  c.dispose();
});
test('tariff snapshots survive rolling history eviction; explicit clear removes past-plan archives', async () => {
  const c = make(); await c.init();
  c.importSms('Тарофаи Шумо <<Диёр 35>>\nИнтернети бокимонда: 3800 мб;');
  for (let i = 0; i < 35; i++) { now += 1000; c.importSms(`Тарофаи Шумо <<Диёр 15>>\nДакикахои бокимонда: ${300 - i} дакика;`); }
  expect(c.getSnapshot().account.history).toHaveLength(30);
  expect(decodeAccount(JSON.stringify(c.getSnapshot().account)).tariffSnapshots.diyor35.packages.day.value).toBe(3800);
  c.clearHistory();
  const restored = decodeAccount(JSON.stringify(c.getSnapshot().account));
  expect(restored.tariffSnapshots.diyor35).toBeUndefined();
  expect(restored.packages.minutes.value).toBe(266);
  c.dispose();
});
test('a new cycle of the same tariff does not restore missing counters from the previous cycle', async () => {
  const c = make(); await c.init();
  c.importSms('Тарофаи Шумо <<Диёр 35>>\nИнтернети бокимонда: 3800 мб;\nМухлати баста то 20.11.2026 18:00:00;'); now += 1000;
  c.importSms('Тарофаи Шумо <<Диёр 35>>\nДакикахои бокимонда: 400 дакика;\nМухлати баста то 20.12.2026 18:00:00;');
  const restored = decodeAccount(JSON.stringify(c.getSnapshot().account));
  expect(tariffView(restored).packages.day).toBeNull();
  expect(restored.tariffSnapshots.diyor35.packages.day).toBeNull();
  expect(restored.history.some((entry) => entry.packages.day?.value === 3800)).toBe(true);
  c.dispose();
});
test('visible fields follow the catalog; hiding a field never deletes it', () => {
  expect(visiblePackageKeys('diyor15')).toEqual(['minutes']);
  expect(visiblePackageKeys('diyor35')).toEqual(['day', 'minutes', 'sms']);
  expect(visiblePackageKeys('diyor55')).toEqual(['day', 'night', 'minutes', 'sms']);
  expect(visiblePackageKeys(null)).toHaveLength(4);
});
test('v5 migration seeds archives from existing history and rejects mismatched/unbounded snapshots', () => {
  const a = emptyAccount(); a.schemaVersion = 5; delete a.tariffSnapshots;
  const at = '2026-11-12T05:00:00Z';
  a.history = [{ at, kind: 'packages', balance: null, packages: { ...a.packages, day: { value: 123, source: 'sms', updatedAt: at } }, context: { tariffId: 'diyor35', tariffName: 'Диёр 35', expiresLocal: null } }];
  const restored = decodeAccount(JSON.stringify(a));
  expect(restored.schemaVersion).toBe(6); expect(restored.tariffSnapshots.diyor35.packages.day.value).toBe(123);
  restored.tariffSnapshots.diyor35.tariffName = 'Диёр 15';
  expect(decodeAccount(JSON.stringify(restored))).toBeNull();
});
