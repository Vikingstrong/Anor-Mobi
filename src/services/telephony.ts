import { PermissionsAndroid } from 'react-native';
import { telephonyNative } from '../../modules/anor-telephony/src';
import { object } from '../domain/account';
import type { Subscription } from '../domain/simSelection';
export type { Subscription } from '../domain/simSelection';
export type Result<T> = { ok: true; value: T } | { ok: false; code: string };
export type Reply = { requestId: string; subscriptionId: number; text: string; receivedAt: number };
export type Sms = { sender: string; body: string; subscriptionId: number; receivedAt: number; messageTime: number | null };
export type Unsubscribe = () => void;
export interface TelephonyPort {
  available: boolean;
  requestAccess(kind: 'sim' | 'ussd' | 'sms'): Promise<boolean>;
  smsPermissionGranted(): Promise<boolean>;
  subscriptions(): Promise<Result<Subscription[]>>;
  query(id: string, kind: 'balance' | 'packages', subscriptionId: number): Promise<Result<Reply>>;
  listenSms(enabled: boolean): Promise<boolean>;
  onSms(listener: (sms: Sms) => void): Unsubscribe;
}
function time(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value < 8.64e15;
}
function id(value: unknown): value is number { return typeof value === 'number' && Number.isInteger(value) && value >= 0; }
function error(value: unknown): string {
  return object(value) && typeof value.code === 'string' ? value.code : 'INVALID_RESPONSE';
}
async function permission(name: typeof PermissionsAndroid.PERMISSIONS[keyof typeof PermissionsAndroid.PERMISSIONS], message: string) {
  if (await PermissionsAndroid.check(name)) return true;
  return await PermissionsAndroid.request(name, { title: 'Anor Mobi', message,
    buttonPositive: 'Продолжить', buttonNegative: 'Отмена' }) === PermissionsAndroid.RESULTS.GRANTED;
}
export const telephony: TelephonyPort = {
  available: telephonyNative !== null,
  async requestAccess(kind) {
    if (!telephonyNative) return false;
    if (kind === 'sms') return permission(PermissionsAndroid.PERMISSIONS.RECEIVE_SMS,
      'Android разрешает доступ ко всем новым SMS. Приложение обрабатывает только AnorINFO выбранной SIM, в том числе при закрытом приложении. История SMS не читается. Можно отказаться и вставлять сообщения вручную.');
    const sim = await permission(PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE, 'Нужен список SIM, чтобы запрос ушёл именно через Anor. Номер телефона не читается.');
    return sim && (kind === 'sim' || await permission(PermissionsAndroid.PERMISSIONS.CALL_PHONE,
      'Нужен доступ для USSD-запросов *100# и *104#. Запрос выполняется только по вашей кнопке, без открытия «Телефона».'));
  },
  smsPermissionGranted: () => PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECEIVE_SMS),
  async subscriptions() {
    if (!telephonyNative) return { ok: false, code: 'MODULE_UNAVAILABLE' };
    try {
      const r = await telephonyNative.getSubscriptions();
      if (!object(r) || r.kind !== 'success' || !Array.isArray(r.data)) return { ok: false, code: error(r) };
      const items: Subscription[] = [];
      for (const s of r.data) {
        if (!object(s) || !id(s.subscriptionId) || !id(s.slotIndex) || typeof s.displayName !== 'string') return { ok: false, code: 'INVALID_RESPONSE' };
        if ((s.carrierName !== undefined && typeof s.carrierName !== 'string')
          || (s.operatorName !== undefined && typeof s.operatorName !== 'string')
          || (s.isDefaultVoice !== undefined && typeof s.isDefaultVoice !== 'boolean')) return { ok: false, code: 'INVALID_RESPONSE' };
        items.push({ carrierName: typeof s.carrierName === 'string' ? s.carrierName : '',
          operatorName: typeof s.operatorName === 'string' ? s.operatorName : '', isDefaultVoice: s.isDefaultVoice === true, subscriptionId: s.subscriptionId, slotIndex: s.slotIndex, displayName: s.displayName });
      }
      return { ok: true, value: items };
    } catch { return { ok: false, code: 'PLATFORM_FAILURE' }; }
  },
  async query(requestId, kind, subscriptionId) {
    if (!telephonyNative) return { ok: false, code: 'MODULE_UNAVAILABLE' };
    try {
      const r = await telephonyNative.sendRequest(requestId, kind, subscriptionId);
      if (!object(r) || r.kind !== 'success' || !object(r.data)) return { ok: false, code: error(r) };
      const d = r.data;
      if (d.requestId !== requestId || d.subscriptionId !== subscriptionId || typeof d.text !== 'string'
        || d.text.length > 16384 || !time(d.receivedAt)) return { ok: false, code: 'INVALID_RESPONSE' };
      return { ok: true, value: { requestId, subscriptionId, text: d.text, receivedAt: d.receivedAt } };
    } catch { return { ok: false, code: 'PLATFORM_FAILURE' }; }
  },
  async listenSms(enabled) {
    if (!telephonyNative) return false;
    try { const r = await telephonyNative.setSmsListening(enabled); return object(r) && r.kind === 'success'; }
    catch { return false; }
  },
  onSms(listener) {
    if (!telephonyNative) return () => {};
    const subscription = telephonyNative.addListener('onOperatorSms', (r) => {
      if (!object(r) || typeof r.sender !== 'string' || r.sender.toUpperCase() !== 'ANORINFO'
        || typeof r.body !== 'string' || r.body.length > 16384 || !id(r.subscriptionId) || !time(r.receivedAt)) return;
      listener({ sender: r.sender, body: r.body, subscriptionId: r.subscriptionId, receivedAt: r.receivedAt, messageTime: time(r.messageTime) ? r.messageTime : null });
    });
    return () => subscription.remove();
  },
};
