const { emptyAccount, decodeAccount } = require('../src/domain/account.ts');

test('empty cache keeps unknown distinct from zero', () => {
  const a = emptyAccount();
  expect(decodeAccount(JSON.stringify(a))).toEqual(a);
  expect(a.packages.sms).toBeNull();
  a.packages.sms = { value: 0, source: 'sms', updatedAt: '2026-11-11T05:00:00Z' };
  expect(decodeAccount(JSON.stringify(a)).packages.sms.value).toBe(0);
});
test.each(['not json', '{"schemaVersion":99}', JSON.stringify({ ...emptyAccount(), subscriptionId: -1 })])('corrupt cache is rejected', (text) => {
  expect(decodeAccount(text)).toBeNull();
});
test('restore whitelists fields and never restores an injected raw SMS', () => {
  const raw = { ...emptyAccount(), rawSms: 'private message' };
  expect(decodeAccount(JSON.stringify(raw))).not.toHaveProperty('rawSms');
});
test('fractional SMS counts and invalid dates are rejected', () => {
  const a = emptyAccount();
  a.packages.sms = { value: 1.5, source: 'sms', updatedAt: '2026-11-11T05:00:00Z' };
  expect(decodeAccount(JSON.stringify(a))).toBeNull();
  a.packages.sms = { value: 1, source: 'sms', updatedAt: 'bad' };
  expect(decodeAccount(JSON.stringify(a))).toBeNull();
});

test('legacy snapshots migrate to an empty history, while malformed history is rejected', () => {
  const old = { ...emptyAccount(), schemaVersion: 1 }; delete old.history;
  expect(decodeAccount(JSON.stringify(old)).history).toEqual([]);
  expect(decodeAccount(JSON.stringify({ ...old, history: [{ at: 'bad' }] }))).toBeNull();
});

test('history context must be validated and raw nested metadata is not restored', () => {
  const a = emptyAccount();
  const entry = { at: '2026-11-11T05:00:00Z', kind: 'packages', balance: null, packages: a.packages, context: {} };
  a.history = [entry];
  expect(decodeAccount(JSON.stringify(a))).toBeNull();
  entry.context = { expiresLocal: null, tariffId: 'ultra', tariffName: 'Диёр Ультра', rawSms: 'private' };
  expect(decodeAccount(JSON.stringify(a)).history[0].context).not.toHaveProperty('rawSms');
});

test('v3 migrates to auto SIM mode without losing history; v4 validates saved manual mode', () => {
  const old = { ...emptyAccount(7), schemaVersion: 3 }; delete old.simSelection;
  const migrated = decodeAccount(JSON.stringify(old));
  expect(migrated.schemaVersion).toBe(6);
  expect(migrated.simSelection).toBe('auto');
  expect(migrated.subscriptionId).toBe(7);
  expect(decodeAccount(JSON.stringify({ ...migrated, simSelection: 'manual' })).simSelection).toBe('manual');
  expect(decodeAccount(JSON.stringify({ ...migrated, simSelection: 'random' }))).toBeNull();
});
