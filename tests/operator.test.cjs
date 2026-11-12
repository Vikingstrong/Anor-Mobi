const { parseBalance, parsePackageSms } = require('../src/parsers/operator.ts');
const { sms } = require('./fixtures.cjs');

describe('USSD balance', () => {
  test('observed response is 5 diram, not 5 TJS', () => {
    expect(parseBalance('Тавозуни Шумо: 0.05TJS.')).toEqual({ ok: true, value: 5 });
  });
  test.each([['0', 0], ['-1.25', -125], ['4,2', 420]])('synthetic amount %s', (amount, minor) => {
    expect(parseBalance(`Тавозуни Шумо: ${amount}TJS.`)).toEqual({ ok: true, value: minor });
  });
  test.each(['Тариф: 65 TJS', 'Тавозуни Шумо: 0.005TJS.', 'Тавозуни Шумо: 1e5TJS.', '1'.repeat(17000)])('rejects unsupported text without guessing first number', (text) => {
    expect(parseBalance(text).ok).toBe(false);
  });
});

describe('AnorINFO packages', () => {
  test('observed anonymized ULTRA sample; service unlimited does not replace expiry', () => {
    expect(parsePackageSms(sms)).toEqual({ ok: true, value: {
      values: { day: 29938.09, night: 35000, minutes: 1000, sms: 50 },
      tariffName: 'Диёр Ультра', tariffId: 'ultra', expiresLocal: '2026-12-10T18:48:07',
    } });
  });
  test('zero remains known, missing fields remain absent', () => {
    expect(parsePackageSms('СМС бокимонда: 0 адад;')).toEqual({ ok: true, value: { values: { sms: 0 } } });
  });
  test.each([
    'Интернети бокимонда: 10 гб;',
    'Дакикахои бокимонда: -1 дакика;',
    'СМС бокимонда: 1.5 адад;',
    'СМС бокимонда: 50 адад;\nСМС бокимонда: 40 адад;',
    'Пардохт 65.05 TJS',
  ])('rejects bad units/counts/ambiguity/unrelated messages: %s', (text) => {
    expect(parsePackageSms(text).ok).toBe(false);
  });
  test('does not let JavaScript normalize impossible dates', () => {
    expect(parsePackageSms(sms.replace('10.12.2026', '31.02.2026')).ok).toBe(false);
  });
});
