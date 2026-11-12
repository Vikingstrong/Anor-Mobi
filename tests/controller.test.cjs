const { AccountController } = require('../src/application/AccountController.ts');
const { sms } = require('./fixtures.cjs');
const NOW = Date.parse('2026-11-11T05:00:00Z');
let controllers;
beforeEach(() => { jest.useFakeTimers(); controllers = []; });
afterEach(() => { controllers.forEach((c) => c.dispose()); jest.useRealTimers(); });
async function setup() {
  let smsListener = () => {};
  const port = {
    available: true,
    requestAccess: jest.fn(async () => true), smsPermissionGranted: jest.fn(async () => true),
    subscriptions: jest.fn(async () => ({ ok: true, value: [
      { subscriptionId: 7, slotIndex: 1, displayName: 'Anor', carrierName: 'Anor', operatorName: 'Anor', isDefaultVoice: false },
      { subscriptionId: 8, slotIndex: 0, displayName: 'Other', carrierName: 'Other', operatorName: 'Other', isDefaultVoice: true },
    ] })),
    query: jest.fn(async (requestId, kind, subscriptionId) => ({ ok: true, value: {
      requestId, subscriptionId, receivedAt: NOW,
      text: kind === 'balance' ? 'Тавозуни Шумо: 0.05TJS.' : 'Запрос принят. Ожидайте SMS.',
    } })),
    listenSms: jest.fn(async () => true), onSms: jest.fn((listener) => { smsListener = listener; return () => {}; }),
  };
  const storage = { read: jest.fn(async () => null), write: jest.fn(async () => {}) };
  const controller = new AccountController(port, storage, () => NOW);
  controllers.push(controller);
  await controller.init(); await controller.loadSims(); controller.chooseSim(7);
  const emit = (overrides = {}) => smsListener({ sender: 'AnorINFO', body: sms, subscriptionId: 7,
    receivedAt: NOW + 10000, messageTime: NOW + 5000, ...overrides });
  return { controller, port, storage, emit };
}
async function flush() { for (let i = 0; i < 15; i++) await Promise.resolve(); }

test('Refresh All sends balance then packages exactly once, through selected subscription', async () => {
  const { controller: c, port } = await setup();
  await c.refresh('all');
  expect(port.query.mock.calls.map((args) => [args[1], args[2]])).toEqual([['balance', 7], ['packages', 7]]);
  expect(c.getSnapshot().account.balance.value).toBe(5);
  expect(c.getSnapshot().account.packages.day).toBeNull();
  expect(c.getSnapshot().packageStatus.stage).toBe('manual-import');
});
test('two rapid clicks do not dispatch concurrent USSD', async () => {
  const { controller: c, port } = await setup();
  await Promise.all([c.refresh('balance'), c.refresh('balance')]);
  expect(port.query).toHaveBeenCalledTimes(1);
});
test('parse error preserves last balance and its timestamp', async () => {
  const { controller: c, port } = await setup();
  await c.refresh('balance'); const saved = c.getSnapshot().account.balance;
  port.query.mockResolvedValueOnce({ ok: true, value: { text: 'Тариф 65 TJS', receivedAt: NOW + 1000 } });
  await c.refresh('balance');
  expect(c.getSnapshot().account.balance).toEqual(saved);
  expect(c.getSnapshot().balanceStatus.stage).toBe('error');
});
test('SMS several minutes later updates only packages, with independent timestamp', async () => {
  const { controller: c, emit } = await setup();
  await c.enableSms(true); await c.refresh('all');
  expect(c.getSnapshot().packageStatus.stage).toBe('waiting-sms');
  const saved = c.getSnapshot().account.balance;
  emit({ receivedAt: NOW + 180000 });
  expect(c.getSnapshot().account.packages.day.value).toBe(29938.09);
  expect(c.getSnapshot().account.packages.day.updatedAt).toBe(new Date(NOW + 180000).toISOString());
  expect(c.getSnapshot().account.balance).toEqual(saved);
  expect(c.getSnapshot().account.expiresLocal).toBe('2026-12-10T18:48:07');
});
test('SMS arriving before the *104# callback cannot be downgraded by late timeout', async () => {
  const { controller: c, port, emit } = await setup();
  await c.enableSms(true);
  let resolve;
  port.query.mockImplementationOnce(() => new Promise((r) => { resolve = r; }));
  const run = c.refresh('packages'); await flush();
  expect(resolve).toBeDefined();
  emit(); resolve({ ok: false, code: 'TIMEOUT' }); await run;
  expect(c.getSnapshot().packageStatus.stage).toBe('received');
  expect(c.getSnapshot().account.packages.sms.value).toBe(50);
});
test('wrong sender/SIM, duplicate and older SMS do not overwrite readings', async () => {
  const { controller: c, emit } = await setup(); await c.enableSms(true);
  emit({ sender: 'AnorPAY' }); emit({ subscriptionId: 8 });
  expect(c.getSnapshot().account.packages.sms).toBeNull();
  emit(); const before = c.getSnapshot().account.packages.sms;
  emit({ receivedAt: NOW + 20000 });
  emit({ messageTime: NOW - 1000, body: sms.replace('50 адад', '1 адад') });
  expect(c.getSnapshot().account.packages.sms).toEqual(before);
});
test('late SMS for the old SIM is ignored after a context switch', async () => {
  const { controller: c, emit } = await setup(); await c.enableSms(true); await c.refresh('packages');
  c.chooseSim(8); emit();
  expect(c.getSnapshot().account.subscriptionId).toBe(8);
  expect(c.getSnapshot().account.packages.sms).toBeNull();
});
test('soft SMS deadline does not retry USSD and late valid SMS is still accepted', async () => {
  const { controller: c, port, emit } = await setup(); await c.enableSms(true); await c.refresh('packages');
  jest.advanceTimersByTime(300000);
  expect(c.getSnapshot().packageStatus.stage).toBe('still-waiting');
  expect(port.query).toHaveBeenCalledTimes(1);
  emit(); expect(c.getSnapshot().packageStatus.stage).toBe('received');
});
test('permission denial does not send USSD or erase data', async () => {
  const { controller: c, port } = await setup(); await c.refresh('balance');
  const before = c.getSnapshot().account.balance;
  port.requestAccess.mockResolvedValueOnce(false); await c.refresh('balance');
  expect(port.query).toHaveBeenCalledTimes(1); expect(c.getSnapshot().account.balance).toEqual(before);
});
test('partial manual import preserves other fields and stores no raw message', async () => {
  const { controller: c, storage } = await setup();
  c.importSms(sms); const before = c.getSnapshot().account.packages.day;
  expect(c.importSms('СМС бокимонда: 0 адад;').ok).toBe(true); await flush();
  expect(c.getSnapshot().account.packages.day).toEqual(before);
  expect(c.getSnapshot().account.packages.sms.value).toBe(0);
  const saved = JSON.stringify(storage.write.mock.lastCall[0]);
  expect(saved).not.toContain('Шом ба хайр'); expect(saved).not.toContain('[ИМЯ]'); expect(saved).not.toContain('body');
});
test('foreground-only SMS mode stops receiver and does not apply background events', async () => {
  const { controller: c, port, emit } = await setup(); await c.enableSms(true);
  await c.setForeground(false); emit();
  expect(port.listenSms).toHaveBeenLastCalledWith(false);
  expect(c.getSnapshot().account.packages.sms).toBeNull();
});

test('a balance timeout does not automatically start another modem session for *104#', async () => {
  const { controller: c, port } = await setup();
  port.query.mockResolvedValueOnce({ ok: false, code: 'TIMEOUT' });
  await c.refresh('all');
  expect(port.query).toHaveBeenCalledTimes(1);
  expect(c.getSnapshot().account.balance).toBeNull();
});
test('repeated package requests while waiting for SMS are blocked, balance remains available', async () => {
  const { controller: c, port } = await setup(); await c.enableSms(true);
  await c.refresh('packages'); await c.refresh('packages');
  expect(port.query).toHaveBeenCalledTimes(1);
  await c.refresh('balance');
  expect(port.query.mock.calls.map((args) => args[1])).toEqual(['packages', 'balance']);
});
test('explicit manual tariff selection preserves actual readings and selects a local comparison profile', async () => {
  const { controller: c } = await setup(); c.importSms(sms);
  const before = c.getSnapshot().account.packages.day;
  c.chooseTariff('lite');
  expect(c.getSnapshot().account.packages.day).toEqual(before);
  expect(c.getSnapshot().account.comparisonReady).toBe(true);
  expect(c.getSnapshot().account.tariffSelection).toBe('manual');
});

test('history is bounded, persisted and clears without erasing current readings', async () => {
  const { controller: c, storage } = await setup();
  for (let i = 0; i < 35; i++) c.importSms(`СМС бокимонда: ${i} адад;`);
  expect(c.getSnapshot().account.history).toHaveLength(30);
  expect(c.getSnapshot().account.history[0].packages.sms.value).toBe(34);
  const current = c.getSnapshot().account.packages.sms;
  c.clearHistory(); await flush();
  expect(storage.write.mock.lastCall[0].history).toEqual([]);
  expect(c.getSnapshot().account.packages.sms).toEqual(current);
});

test('closed-process SMS is recovered once, wrong SIM ignored, and no USSD is sent on startup', async () => {
  const { emptyAccount } = require('../src/domain/account.ts');
  const { port } = await setup();
  const snapshot = { ...emptyAccount(7), autoSms: true };
  const events = [
    { id: 'other', subscriptionId: 8, receivedAt: NOW, messageTime: NOW, patch: { values: { sms: 99 } } },
    { id: 'ours', subscriptionId: 7, receivedAt: NOW + 1000, messageTime: NOW + 1000, patch: { values: { sms: 40 } } },
  ];
  const storage = { read: jest.fn(async () => snapshot), write: jest.fn(async () => {}) };
  const background = { configure: jest.fn(async () => {}), pending: jest.fn(async () => events), acknowledge: jest.fn(async () => {}) };
  const c = new AccountController(port, storage, () => NOW, background); controllers.push(c);
  await c.init();
  expect(c.getSnapshot().account.packages.sms.value).toBe(40);
  expect(c.getSnapshot().account.history).toHaveLength(1);
  expect(background.acknowledge).toHaveBeenCalledWith(['other', 'ours']);
  expect(port.query).not.toHaveBeenCalled();
  await c.setForeground(false); await c.setForeground(true);
  expect(c.getSnapshot().account.history).toHaveLength(1);
});

test('background inbox is not acknowledged when durable snapshot write fails; retry preserves data', async () => {
  const { emptyAccount } = require('../src/domain/account.ts');
  const { port } = await setup();
  const storage = { read: async () => ({ ...emptyAccount(7), autoSms: true }), write: jest.fn(async () => { throw new Error('disk full'); }) };
  const background = { configure: async () => {}, pending: async () => [{ id: 'ours', subscriptionId: 7, receivedAt: NOW, messageTime: NOW, patch: { values: { sms: 0 } } }], acknowledge: jest.fn(async () => {}) };
  const c = new AccountController(port, storage, () => NOW, background); controllers.push(c);
  await c.init();
  expect(background.acknowledge).not.toHaveBeenCalled();
  expect(c.getSnapshot().storageError).toBe(true);
  storage.write.mockResolvedValue(undefined);
  await c.setForeground(true);
  expect(background.acknowledge).toHaveBeenCalledWith(['ours']);
  expect(c.getSnapshot().account.packages.sms.value).toBe(0);
  expect(c.getSnapshot().account.history).toHaveLength(1);
});

test('a fresh install selects Anor automatically on user refresh, no requests at startup', async () => {
  const { port, storage } = await setup();
  const c = new AccountController(port, storage, () => NOW); controllers.push(c);
  await c.init(); expect(port.query).not.toHaveBeenCalled();
  await c.refresh('all');
  expect(c.getSnapshot().account.simSelection).toBe('auto');
  expect(c.getSnapshot().account.subscriptionId).toBe(7);
  expect(port.query.mock.calls.map((call) => [call[1], call[2]])).toEqual([['balance', 7], ['packages', 7]]);
});
test('auto mode falls back to default voice SIM without Anor, synchronizing background subscription before dispatch', async () => {
  const { port, storage } = await setup();
  port.subscriptions.mockResolvedValue({ ok: true, value: [{ subscriptionId: 8, slotIndex: 0, displayName: 'Other', carrierName: 'Other', operatorName: 'Other', isDefaultVoice: true }] });
  const background = { configure: jest.fn(async () => {}), pending: async () => [], acknowledge: async () => {} };
  const c = new AccountController(port, storage, () => NOW, background); controllers.push(c); await c.init();
  await c.refresh('balance');
  expect(c.getSnapshot().account.subscriptionId).toBe(8);
  expect(background.configure).toHaveBeenLastCalledWith(false, 8);
  expect(port.query.mock.calls[0][2]).toBe(8);
});
test('returning to auto on the same SIM preserves readings, history and forecast context', async () => {
  const { controller: c, port } = await setup(); c.importSms(sms);
  const before = c.getSnapshot().account;
  await c.chooseAutoSim();
  expect(c.getSnapshot().account.history).toEqual(before.history);
  expect(c.getSnapshot().account.packages).toEqual(before.packages);
  expect(c.getSnapshot().account.simSelection).toBe('auto');
  expect(port.query).not.toHaveBeenCalled();
});
test('manual selection overrides detection and remains after refresh', async () => {
  const { controller: c, port } = await setup(); c.chooseSim(8);
  await c.refresh('balance');
  expect(c.getSnapshot().account.simSelection).toBe('manual');
  expect(port.query.mock.calls[0][2]).toBe(8);
});
test('when auto mode must change SIM, old readings never mix with the other account', async () => {
  const { controller: c, port } = await setup(); c.importSms(sms); await c.chooseAutoSim();
  port.subscriptions.mockResolvedValue({ ok: true, value: [{ subscriptionId: 8, slotIndex: 0, displayName: 'Other', carrierName: 'Other', operatorName: 'Other', isDefaultVoice: true }] });
  await c.refresh('balance');
  expect(c.getSnapshot().account.subscriptionId).toBe(8);
  expect(c.getSnapshot().account.packages.day).toBeNull();
  expect(c.getSnapshot().account.history.every((entry) => entry.kind === 'balance')).toBe(true);
});
test('multiple non-Anor SIMs without a default do not cause a guessed USSD call', async () => {
  const { port, storage } = await setup();
  port.subscriptions.mockResolvedValue({ ok: true, value: [7, 8].map((id) => ({ subscriptionId: id, slotIndex: id - 7, displayName: 'Other', carrierName: 'Other', operatorName: 'Other', isDefaultVoice: false })) });
  const c = new AccountController(port, storage, () => NOW); controllers.push(c); await c.init();
  await c.refresh('all');
  expect(port.query).not.toHaveBeenCalled();
  expect(c.getSnapshot().error).toContain('Выберите SIM вручную');
});

test('auto tariff mode recognizes every published plan with supported numeric SMS fields', async () => {
  const { controller: c } = await setup();
  for (const [name, id] of [['Диёр Ультра', 'ultra'], ['Диёр LITE', 'lite'], ['Диёр 55', 'diyor55'], ['Диёр 45', 'diyor45'], ['Диёр 35', 'diyor35'], ['Диёр 15', 'diyor15']]) {
    c.importSms(`Тарофаи Шумо <<${name}>>\nДакикахои бокимонда: 10 дакика;`);
    expect(c.getSnapshot().account.tariffId).toBe(id);
    expect(c.getSnapshot().account.tariffSelection).toBe('auto');
  }
});
test('manual tariff survives incoming SMS, auto resumes from the last observed operator name without USSD', async () => {
  const { controller: c, port } = await setup(); c.chooseTariff('diyor35'); c.importSms(sms);
  expect(c.getSnapshot().account.tariffId).toBe('diyor35');
  expect(c.getSnapshot().account.tariffName).toBe('Диёр Ультра');
  const readings = c.getSnapshot().account.packages;
  c.chooseAutoTariff();
  expect(c.getSnapshot().account.tariffId).toBe('ultra');
  expect(c.getSnapshot().account.tariffSelection).toBe('auto');
  expect(c.getSnapshot().account.packages).toEqual(readings);
  expect(port.query).not.toHaveBeenCalled();
});
test('a new confirmed tariff/period clears only missing package readings instead of carrying the old plan', async () => {
  const { controller: c } = await setup(); c.importSms(sms);
  c.importSms('Тарофаи Шумо <<Диёр 15>>\nДакикахои бокимонда: 300 дакика;');
  expect(c.getSnapshot().account.packages.minutes.value).toBe(300);
  expect(c.getSnapshot().account.packages.day).toBeNull();
  expect(c.getSnapshot().account.packages.sms).toBeNull();
  expect(c.getSnapshot().account.history).toHaveLength(2);
});

test('a tariff change without a new expiry does not reuse the previous package deadline', async () => {
  const { controller: c } = await setup(); c.importSms(sms);
  c.importSms('Тарофаи Шумо <<Диёр 15>>\nДакикахои бокимонда: 300 дакика;');
  expect(c.getSnapshot().account.expiresLocal).toBeNull();
});
