jest.mock('../modules/anor-telephony/src', () => ({ telephonyNative: null }));
const { decodePendingSms } = require('../src/services/backgroundSms.ts');
const event = { id: 'event-1', subscriptionId: 7, receivedAt: 1794373200000, messageTime: 1794373199000,
  fields: { day: '29938.09 мб', night: '35000 мб', minutes: '1000 дакика', sms: '50 адад', tariffName: 'Диёр Ультра', expiry: '10.12.2026 18:48:07' } };
test('background fields use the same tariff, units and calendar validation as foreground SMS', () => {
  const [value] = decodePendingSms(JSON.stringify([event]));
  expect(value.patch).toEqual({ values: { day: 29938.09, night: 35000, minutes: 1000, sms: 50 }, tariffName: 'Диёр Ультра', tariffId: 'ultra', expiresLocal: '2026-12-10T18:48:07' });
});
test.each([{ sms: '1.5 адад' }, { day: '2 дакика' }, { expiry: '31.02.2026 18:48:07' }, { tariffName: 'injected\nСМС бокимонда: 0 адад;' }])('invalid background field never updates account: %p', (fields) => {
  expect(() => decodePendingSms(JSON.stringify([{ ...event, fields: { ...event.fields, ...fields } }]))).toThrow();
});
