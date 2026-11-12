const { selectAutoSim } = require('../src/domain/simSelection.ts');
const sim = (id, overrides = {}) => ({ subscriptionId: id, slotIndex: id - 1, displayName: 'SIM', carrierName: '', operatorName: '', isDefaultVoice: false, ...overrides });
test('Anor carrier in slot 2 wins over the system default in slot 1', () => {
  expect(selectAutoSim([sim(1, { carrierName: 'Other', isDefaultVoice: true }), sim(2, { carrierName: 'Anor Mobi' })], null))
    .toEqual({ kind: 'selected', subscriptionId: 2, reason: 'anor' });
});
test.each(['ANOR', 'Анор', 'Anor (TJ)'])('operator alias %s is recognized without guessed network codes', (operatorName) => {
  expect(selectAutoSim([sim(1, { operatorName })], null).reason).toBe('anor');
});
test('user-renamed SIM does not override a known different carrier', () => {
  const result = selectAutoSim([sim(1, { carrierName: 'Other', displayName: 'Anor' }), sim(2, { carrierName: 'Other 2', isDefaultVoice: true })], null);
  expect(result).toEqual({ kind: 'selected', subscriptionId: 2, reason: 'default' });
});
test('old preview displayName is a fallback only without operator names', () => {
  expect(selectAutoSim([sim(1, { displayName: 'Anor' }), sim(2, { isDefaultVoice: true })], null).subscriptionId).toBe(1);
});
test('matching requires a whole operator name, not an unrelated substring', () => {
  expect(selectAutoSim([sim(1, { carrierName: 'Another' }), sim(2, { isDefaultVoice: true })], null).reason).toBe('default');
});
test('without Anor use the actual default voice SIM, never arbitrary first slot', () => {
  expect(selectAutoSim([sim(1), sim(2, { isDefaultVoice: true })], 1)).toEqual({ kind: 'selected', subscriptionId: 2, reason: 'default' });
  expect(selectAutoSim([sim(1), sim(2)], null)).toEqual({ kind: 'unavailable' });
  expect(selectAutoSim([], null)).toEqual({ kind: 'unavailable' });
  expect(selectAutoSim([sim(2)], null)).toEqual({ kind: 'selected', subscriptionId: 2, reason: 'only' });
});
test('multiple Anor SIMs prefer default voice, then existing selection, then stable slot order', () => {
  const first = sim(1, { carrierName: 'Anor' }); const second = sim(2, { carrierName: 'Anor' });
  expect(selectAutoSim([second, first], 2).subscriptionId).toBe(2);
  expect(selectAutoSim([second, first], null).subscriptionId).toBe(1);
  expect(selectAutoSim([{ ...first, isDefaultVoice: true }, second], 2).subscriptionId).toBe(1);
});
