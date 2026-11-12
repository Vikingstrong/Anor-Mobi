import { matchTariffName } from '../domain/tariffs';
import type { PackageKey, TariffId } from '../domain/account';
export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };
export type PackagePatch = {
  values: Partial<Record<PackageKey, number>>;
  tariffName?: string;
  tariffId?: TariffId;
  expiresLocal?: string;
};

export function parseBalance(text: string): ParseResult<number> {
  if (text.length > 16384) return { ok: false, error: 'Слишком длинный ответ' };
  const match = /^\s*Тавозуни\s+Шумо\s*:\s*(-?\d+(?:[.,]\d{1,2})?)\s*TJS\.?\s*$/iu.exec(text);
  if (!match) return { ok: false, error: 'Формат ответа баланса не распознан' };
  const raw = match[1].replace(',', '.');
  const [whole, fraction = ''] = raw.replace('-', '').split('.');
  const minor = (Number(whole) * 100 + Number(fraction.padEnd(2, '0'))) * (raw.startsWith('-') ? -1 : 1);
  return Number.isSafeInteger(minor) ? { ok: true, value: minor === 0 ? 0 : minor }
    : { ok: false, error: 'Недопустимая сумма' };
}

export function parsePackageSms(text: string): ParseResult<PackagePatch> {
  if (text.length > 16384 || text.trim().length === 0) return { ok: false, error: 'Пустое или слишком длинное SMS' };
  const main = text.replace(/\r/g, '').split(/<<\s*Стоп платный интернет трафик\s*>>/iu)[0];
  const fields: { key: PackageKey; label: string; unit: string; integer?: boolean }[] = [
    { key: 'day', label: 'Интернети бокимонда', unit: 'мб' },
    { key: 'night', label: 'Трафики шабона', unit: 'мб' },
    { key: 'minutes', label: 'Дакикахои бокимонда', unit: 'дакика', integer: true },
    { key: 'sms', label: 'СМС бокимонда', unit: 'адад', integer: true },
  ];
  const patch: PackagePatch = { values: {} };
  for (const field of fields) {
    const label = new RegExp(`(?:^|[\\n;])\\s*${field.label}\\s*:([^;\\n]*)`, 'giu');
    const matches = [...main.matchAll(label)];
    if (matches.length > 1) return { ok: false, error: `Повторное поле: ${field.label}` };
    if (matches.length === 0) continue;
    const number = new RegExp(`^\\s*(-?\\d+(?:[.,]\\d+)?)\\s*${field.unit}\\s*$`, 'iu').exec(matches[0][1]);
    if (!number) continue; // Unsupported field stays unknown; retain other confirmed numeric readings.
    const value = Number(number[1].replace(',', '.'));
    if (!Number.isFinite(value) || value < 0 || (field.integer && !Number.isSafeInteger(value))) {
      return { ok: false, error: `Некорректный остаток: ${field.label}` };
    }
    patch.values[field.key] = value;
  }
  if (Object.keys(patch.values).length === 0) return { ok: false, error: 'Остатки пакетов в SMS не найдены' };
  const names = [...main.matchAll(/(?:^|\n)\s*Тарофаи\s+Шумо\s*<<([^<>\n]{1,80})>>/giu)];
  if (names.length > 1) return { ok: false, error: 'В сообщении несколько тарифов' };
  if (names[0]) {
    patch.tariffName = names[0][1].trim();
    const tariffId = matchTariffName(patch.tariffName);
    if (tariffId !== null) patch.tariffId = tariffId;
  }
  const expiry = [...main.matchAll(/Мухлати\s+баста\s+то\s+(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/giu)];
  if (expiry.length > 1) return { ok: false, error: 'Неоднозначный срок пакета' };
  if (expiry[0]) {
    const [, d, m, y, h, min, sec] = expiry[0];
    const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
    if (date.getUTCFullYear() !== Number(y) || date.getUTCMonth() + 1 !== Number(m)
      || date.getUTCDate() !== Number(d) || Number(h) > 23 || Number(min) > 59 || Number(sec) > 59) {
      return { ok: false, error: 'Некорректная дата пакета' };
    }
    patch.expiresLocal = `${y}-${m}-${d}T${h}:${min}:${sec}`;
  }
  return { ok: true, value: patch };
}
