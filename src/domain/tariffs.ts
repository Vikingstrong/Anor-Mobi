// Published base plans at https://anor.mobi/; checked 2026-11-12.
// Add-on packages are not base tariffs. No activation codes are executed here.
export const tariffIds = ['ultra', 'lite', 'diyor55', 'diyor45', 'diyor35', 'diyor15'] as const;
export type TariffId = typeof tariffIds[number];
type Tariff = {
  name: string; price: number; description: string; aliases: string[];
  limits: { day: number | null; night: number | null; minutes: number | null; sms: number | null };
  nightUnlimited: boolean;
  internetFieldComparable: boolean;
};
export const tariffs: Record<TariffId, Tariff> = {
  ultra: { name: 'ДИЁР ULTRA', price: 65, description: '30 000 МБ днём · 35 000 МБ ночью · 1000 мин · 50 SMS',
    aliases: ['диер ultra', 'диер ультра'], limits: { day: 30000, night: 35000, minutes: 1000, sms: 50 }, nightUnlimited: false, internetFieldComparable: true },
  lite: { name: 'ДИЁР LITE', price: 35, description: '10 000 МБ днём · 25 000 МБ ночью · 500 мин · 50 SMS',
    aliases: ['диер lite', 'диер лайт'], limits: { day: 10000, night: 25000, minutes: 500, sms: 50 }, nightUnlimited: false, internetFieldComparable: true },
  diyor55: { name: 'ДИЁР 55', price: 55, description: '8000 МБ основных + 6000 МБ для приложений · ночной безлимит · 1000 мин · 50 SMS',
    aliases: ['диер 55'], limits: { day: 8000, night: null, minutes: 1000, sms: 50 }, nightUnlimited: true, internetFieldComparable: false },
  diyor45: { name: 'ДИЁР 45', price: 45, description: '6000 МБ основных + 6000 МБ для приложений · ночной безлимит · 500 мин · 50 SMS',
    aliases: ['диер 45'], limits: { day: 6000, night: null, minutes: 500, sms: 50 }, nightUnlimited: true, internetFieldComparable: false },
  diyor35: { name: 'ДИЁР 35', price: 35, description: '4000 МБ основных + 4000 МБ для приложений · 400 мин · 50 SMS',
    aliases: ['диер 35'], limits: { day: 4000, night: null, minutes: 400, sms: 50 }, nightUnlimited: false, internetFieldComparable: false },
  diyor15: { name: 'ДИЁР 15', price: 15, description: '300 мин на другие сети · безлимит внутри Anor; интернет и SMS в описании не указаны',
    aliases: ['диер 15'], limits: { day: null, night: null, minutes: 300, sms: null }, nightUnlimited: false, internetFieldComparable: false },
};
export function isTariffId(value: unknown): value is TariffId {
  return tariffIds.some((id) => id === value);
}
export function matchTariffName(name: string): TariffId | null {
  const normalized = name.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').replace(/[«»<>"']/g, '').replace(/\s+/g, ' ').trim();
  return tariffIds.find((id) => tariffs[id].aliases.includes(normalized)) ?? null;
}
