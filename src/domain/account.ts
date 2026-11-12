import { isTariffId, matchTariffName, tariffIds, type TariffId } from './tariffs';
export { tariffs, type TariffId } from './tariffs';

export const packageKeys = ['day', 'night', 'minutes', 'sms'] as const;
export type PackageKey = typeof packageKeys[number];
export type Source = 'ussd' | 'sms' | 'manual-sms';
export type Reading = { value: number; updatedAt: string; source: Source };
export type Packages = Record<PackageKey, Reading | null>;
export type PackageContext = { expiresLocal: string | null; tariffId: TariffId | null; tariffName: string | null };
export type HistoryEntry = { context: PackageContext | null; at: string; kind: 'balance' | 'packages'; balance: Reading | null; packages: Packages };
export type TariffSnapshot = { capturedAt: string; tariffName: string | null; expiresLocal: string | null; packages: Packages };
export type Account = {
  tariffSnapshots: Partial<Record<TariffId, TariffSnapshot>>;
  history: HistoryEntry[];
  schemaVersion: 6;
  tariffSelection: 'auto' | 'manual';
  simSelection: 'auto' | 'manual';
  subscriptionId: number | null;
  tariffId: TariffId | null;
  tariffName: string | null;
  expiresLocal: string | null;
  autoSms: boolean;
  comparisonReady: boolean;
  lastSmsMessageTime: number | null;
  balance: Reading | null; // integer diram, not a floating-point TJS amount
  packages: Packages;
};
export function emptyAccount(subscriptionId: number | null = null): Account {
  return { history: [], tariffSnapshots: {}, schemaVersion: 6, tariffSelection: 'auto', simSelection: 'auto', subscriptionId, tariffId: null, tariffName: null, expiresLocal: null,
    autoSms: false, comparisonReady: false, lastSmsMessageTime: null, balance: null, packages: { day: null, night: null, minutes: null, sms: null } };
}
export function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function reading(value: unknown, money = false): Reading | null {
  if (!object(value) || typeof value.value !== 'number' || !Number.isFinite(value.value)
    || (money ? !Number.isSafeInteger(value.value) : value.value < 0)
    || typeof value.updatedAt !== 'string' || !Number.isFinite(Date.parse(value.updatedAt))
    || (value.source !== 'ussd' && value.source !== 'sms' && value.source !== 'manual-sms')) return null;
  return { value: value.value, updatedAt: value.updatedAt, source: value.source };
}
function decodePackages(value: unknown): Packages | null {
  if (!object(value)) return null;
  const packages: Packages = { day: null, night: null, minutes: null, sms: null };
  for (const key of packageKeys) {
    const input = value[key];
    packages[key] = input === null ? null : reading(input);
    if (input !== null && packages[key] === null) return null;
    if ((key === 'minutes' || key === 'sms') && packages[key] !== null && !Number.isSafeInteger(packages[key]?.value)) return null;
  }
  return packages;
}
function nullableText(value: unknown, max: number): value is string | null {
  return value === null || (typeof value === 'string' && value.length <= max);
}
export function decodeAccount(json: string): Account | null {
  let value: unknown;
  try { value = JSON.parse(json); } catch { return null; }
  if (!object(value) || ![1, 2, 3, 4, 5, 6].some((version) => version === value.schemaVersion)) return null;
  if (value.subscriptionId !== null && (typeof value.subscriptionId !== 'number' || !Number.isInteger(value.subscriptionId) || value.subscriptionId < 0)) return null;
  if (value.tariffId !== null && !isTariffId(value.tariffId)) return null;
  if (!nullableText(value.tariffName, 80) || !nullableText(value.expiresLocal, 40)) return null;
  if (typeof value.autoSms !== 'boolean' || typeof value.comparisonReady !== 'boolean') return null;
  const tariffSelection = value.tariffSelection ?? 'auto';
  if (tariffSelection !== 'auto' && tariffSelection !== 'manual') return null;
  const simSelection = value.simSelection ?? 'auto';
  if (simSelection !== 'auto' && simSelection !== 'manual') return null;
  const messageTime = value.lastSmsMessageTime ?? null;
  if (messageTime !== null && (typeof messageTime !== 'number' || !Number.isSafeInteger(messageTime) || messageTime <= 0)) return null;
  const balance = value.balance === null ? null : reading(value.balance, true);
  if (value.balance !== null && balance === null) return null;
  const packages = decodePackages(value.packages);
  if (!packages) return null;
  const history: HistoryEntry[] = [];
  if (value.history !== undefined) {
    if (!Array.isArray(value.history) || value.history.length > 30) return null;
    for (const entry of value.history) {
      if (!object(entry) || typeof entry.at !== 'string' || !Number.isFinite(Date.parse(entry.at)) || (entry.kind !== 'balance' && entry.kind !== 'packages')) return null;
      const savedBalance = entry.balance === null ? null : reading(entry.balance, true);
      const savedPackages = decodePackages(entry.packages);
      if ((entry.balance !== null && savedBalance === null) || !savedPackages) return null;
      let context: PackageContext | null = null;
      if (entry.context !== undefined && entry.context !== null) {
        const c = entry.context;
        if (!object(c) || !nullableText(c.expiresLocal, 40) || (c.tariffId !== null && !isTariffId(c.tariffId)) || !nullableText(c.tariffName, 80)) return null;
        context = { expiresLocal: c.expiresLocal, tariffId: c.tariffId, tariffName: c.tariffName };
      }
      history.push({ context, at: entry.at, kind: entry.kind, balance: savedBalance, packages: savedPackages });
    }
  }
  const tariffSnapshots: Partial<Record<TariffId, TariffSnapshot>> = {};
  if (value.tariffSnapshots !== undefined) {
    if (!object(value.tariffSnapshots) || Object.keys(value.tariffSnapshots).length > tariffIds.length) return null;
    for (const [id, input] of Object.entries(value.tariffSnapshots)) {
      if (!isTariffId(id) || !object(input) || typeof input.capturedAt !== 'string' || !Number.isFinite(Date.parse(input.capturedAt))
        || !nullableText(input.tariffName, 80) || !nullableText(input.expiresLocal, 40)) return null;
      const recognized = input.tariffName ? matchTariffName(input.tariffName) : null;
      if (recognized !== null && recognized !== id) return null;
      const saved = decodePackages(input.packages);
      if (!saved) return null;
      tariffSnapshots[id] = { capturedAt: input.capturedAt, tariffName: input.tariffName, expiresLocal: input.expiresLocal, packages: saved };
    }
  }
  // Seed older installations from their existing history without inventing readings.
  function keep(id: TariffId | null, snapshot: TariffSnapshot) {
    if (id === null) return;
    const previous = tariffSnapshots[id];
    if (!previous || Date.parse(previous.capturedAt) < Date.parse(snapshot.capturedAt)) tariffSnapshots[id] = snapshot;
  }
  for (const entry of history) {
    if (entry.kind !== 'packages' || entry.context === null) continue;
    const id = entry.context.tariffName ? matchTariffName(entry.context.tariffName) : entry.context.tariffId;
    keep(id, { capturedAt: entry.at, tariffName: entry.context.tariffName, expiresLocal: entry.context.expiresLocal, packages: entry.packages });
  }
  const latest = Object.values(packages).filter((item): item is Reading => item !== null).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0];
  if (latest && value.tariffName) keep(matchTariffName(value.tariffName), { capturedAt: latest.updatedAt, tariffName: value.tariffName, expiresLocal: value.expiresLocal, packages });
  return { history, tariffSnapshots, schemaVersion: 6, simSelection, tariffSelection, subscriptionId: value.subscriptionId, tariffId: value.tariffId,
    tariffName: value.tariffName, expiresLocal: value.expiresLocal, autoSms: value.autoSms, comparisonReady: value.comparisonReady, lastSmsMessageTime: messageTime, balance, packages };
}
