import { telephonyNative } from '../../modules/anor-telephony/src';
import { object, packageKeys } from '../domain/account';
import { parsePackageSms, type PackagePatch } from '../parsers/operator';
export type PendingSms = { id: string; subscriptionId: number; receivedAt: number; messageTime: number; patch: PackagePatch };
const units = { day: 'мб', night: 'мб', minutes: 'дакика', sms: 'адад' };
const labels = { day: 'Интернети бокимонда', night: 'Трафики шабона', minutes: 'Дакикахои бокимонда', sms: 'СМС бокимонда' };
export function decodePendingSms(input: unknown): PendingSms[] {
  if (typeof input !== 'string' || input.length > 131072) throw new Error('INVALID_INBOX');
  const events: unknown = JSON.parse(input);
  if (!Array.isArray(events) || events.length > 30) throw new Error('INVALID_INBOX');
  return events.map((event: unknown) => {
    if (!object(event) || typeof event.id !== 'string' || event.id.length > 80
      || typeof event.subscriptionId !== 'number' || !Number.isSafeInteger(event.subscriptionId) || event.subscriptionId < 0
      || typeof event.receivedAt !== 'number' || !Number.isSafeInteger(event.receivedAt) || event.receivedAt <= 0 || event.receivedAt >= 8.64e15
      || typeof event.messageTime !== 'number' || !Number.isSafeInteger(event.messageTime) || event.messageTime <= 0 || event.messageTime >= 8.64e15
      || !object(event.fields)) throw new Error('INVALID_INBOX');
    const lines: string[] = [];
    for (const key of packageKeys) {
      const field = event.fields[key];
      if (field === undefined) continue;
      if (typeof field !== 'string' || !new RegExp(`^\\d+(?:[.,]\\d+)? ${units[key]}$`, 'iu').test(field)) throw new Error('INVALID_INBOX');
      lines.push(`${labels[key]}: ${field};`);
    }
    if (event.fields.tariffName !== undefined) {
      if (typeof event.fields.tariffName !== 'string' || !/^[^<>\r\n]{1,80}$/u.test(event.fields.tariffName)) throw new Error('INVALID_INBOX');
      lines.push(`Тарофаи Шумо <<${event.fields.tariffName}>>`);
    }
    if (event.fields.expiry !== undefined) {
      if (typeof event.fields.expiry !== 'string' || !/^\d{2}\.\d{2}\.\d{4}\s+\d{2}:\d{2}:\d{2}$/u.test(event.fields.expiry)) throw new Error('INVALID_INBOX');
      lines.push(`Мухлати баста то ${event.fields.expiry};`);
    }
    // Reuse the same pure parser as foreground SMS; native only extracts fields.
    const parsed = parsePackageSms(lines.join('\n'));
    if (!parsed.ok) throw new Error('INVALID_INBOX');
    return { id: event.id, subscriptionId: event.subscriptionId, receivedAt: event.receivedAt, messageTime: event.messageTime, patch: parsed.value };
  });
}
export const backgroundSms = {
  async configure(enabled: boolean, subscriptionId: number | null) {
    if (telephonyNative) await telephonyNative.configureBackgroundSms(enabled && subscriptionId !== null, subscriptionId ?? -1);
  },
  async pending() { return telephonyNative ? decodePendingSms(await telephonyNative.readPendingSms()) : []; },
  async acknowledge(ids: string[]) { if (telephonyNative) await telephonyNative.acknowledgeSms(ids); },
};
