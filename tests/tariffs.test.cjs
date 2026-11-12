const { tariffs, tariffIds, matchTariffName, isTariffId } = require('../src/domain/tariffs.ts');
const { parsePackageSms } = require('../src/parsers/operator.ts');
const { emptyAccount, decodeAccount } = require('../src/domain/account.ts');
test.each([
  ['Диёр Ультра', 'ultra'], ['ДИЁР «ULTRA»', 'ultra'], ['  Диер  LITE ', 'lite'], ['Диёр Лайт', 'lite'],
  ['Диёр 55', 'diyor55'], ['Диёр 45', 'diyor45'], ['Диёр 35', 'diyor35'], ['Диёр 15', 'diyor15'],
])('catalog alias %s resolves explicitly to %s (synthetic naming coverage)', (name, expected) => {
  expect(matchTariffName(name)).toBe(expected);
  const parsed = parsePackageSms(`Тарофаи Шумо <<${name.replace(/[«»]/g, '')}>>\nДакикахои бокимонда: 10 дакика;`);
  expect(parsed.ok).toBe(true); expect(parsed.value.tariffId).toBe(expected);
});
test('unknown names are retained without guessing the closest tariff', () => {
  expect(matchTariffName('Диёр ULTRA PLUS')).toBeNull();
  const result = parsePackageSms('Тарофаи Шумо <<Новый 99>>\nСМС бокимонда: 4 адад;');
  expect(result.value.tariffName).toBe('Новый 99'); expect(result.value.tariffId).toBeUndefined();
});
test('published split traffic is not summed into a guessed SMS denominator, unspecified values stay null', () => {
  expect(tariffIds).toHaveLength(6);
  expect(tariffs.diyor55.limits.day).toBe(8000);
  expect(tariffs.diyor55.internetFieldComparable).toBe(false);
  expect(tariffs.diyor45.nightUnlimited).toBe(true);
  expect(tariffs.diyor15.limits).toEqual({ day: null, night: null, minutes: 300, sms: null });
  expect(isTariffId('toString')).toBe(false);
});
test('unsupported text field in a synthetic partial SMS cannot erase other numeric counters', () => {
  const result = parsePackageSms('Тарофаи Шумо <<Диёр 55>>\nИнтернети бокимонда: 7000 мб;\nТрафики шабона: неизвестный формат;\nСМС бокимонда: 10 адад;');
  expect(result).toEqual({ ok: true, value: { values: { day: 7000, sms: 10 }, tariffName: 'Диёр 55', tariffId: 'diyor55' } });
});
test('v4 snapshots migrate to auto tariff mode without losing readings/history; all manual IDs round-trip', () => {
  const old = { ...emptyAccount(7), schemaVersion: 4 }; delete old.tariffSelection;
  expect(decodeAccount(JSON.stringify(old)).tariffSelection).toBe('auto');
  for (const tariffId of tariffIds) {
    const value = { ...emptyAccount(7), tariffId, tariffSelection: 'manual' };
    expect(decodeAccount(JSON.stringify(value))).toEqual(value);
  }
  expect(decodeAccount(JSON.stringify({ ...emptyAccount(), tariffSelection: 'guess' }))).toBeNull();
});
