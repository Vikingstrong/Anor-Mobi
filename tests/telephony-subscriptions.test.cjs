jest.mock('react-native', () => ({ PermissionsAndroid: {} }));
jest.mock('../modules/anor-telephony/src', () => ({ telephonyNative: { getSubscriptions: jest.fn() } }));
const { telephonyNative } = require('../modules/anor-telephony/src');
const { telephony } = require('../src/services/telephony.ts');
const base = { subscriptionId: 7, slotIndex: 1, displayName: 'SIM 2' };
test('native subscription metadata is runtime validated before auto selection', async () => {
  const item = { ...base, carrierName: 'Anor', operatorName: 'ANOR', isDefaultVoice: true };
  telephonyNative.getSubscriptions.mockResolvedValue({ kind: 'success', data: [item] });
  expect(await telephony.subscriptions()).toEqual({ ok: true, value: [item] });
});
test('old APK subscription responses remain usable without guessing a default', async () => {
  telephonyNative.getSubscriptions.mockResolvedValue({ kind: 'success', data: [base] });
  expect(await telephony.subscriptions()).toEqual({ ok: true, value: [{ ...base, carrierName: '', operatorName: '', isDefaultVoice: false }] });
});
test.each([{ isDefaultVoice: 'true' }, { carrierName: 42 }, { operatorName: null }, { subscriptionId: -1 }])('malformed native metadata %p cannot choose a SIM', async (fields) => {
  telephonyNative.getSubscriptions.mockResolvedValue({ kind: 'success', data: [{ ...base, ...fields }] });
  expect(await telephony.subscriptions()).toEqual({ ok: false, code: 'INVALID_RESPONSE' });
});
