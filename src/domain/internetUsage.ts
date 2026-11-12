import type { Account, PackageContext } from './account';
const DAY = 86400000;
export type UsageWindow = { consumedMb: number; from: number; to: number; checks: number };
export type Forecast =
  | { kind: 'empty' }
  | { kind: 'unavailable'; reason: 'samples' | 'stale' | 'expiry' | 'expired' }
  | { kind: 'enough'; dailyMb: number; remainingMb: number; expiresAt: number }
  | { kind: 'shortfall'; dailyMb: number; runsOutAt: number; expiresAt: number };
export type InternetUsage = { day: UsageWindow | null; week: UsageWindow | null; forecast: Forecast };
type Sample = { time: number; value: number; context: PackageContext | null; usageValue: number };
function sameContext(a: PackageContext | null, b: PackageContext | null): boolean {
  return a !== null && b !== null && a.expiresLocal === b.expiresLocal && a.tariffId === b.tariffId && a.tariffName === b.tariffName;
}
// Operator package dates are local Tajikistan time, independent of phone timezone.
export function packageExpiry(value: string | null): number | null {
  if (value === null || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(value)) return null;
  const time = Date.parse(`${value}+05:00`);
  // Date.parse normalizes some invalid calendar dates. Reject those as well.
  return Number.isFinite(time) && new Date(time + 5 * 3600000).toISOString().slice(0, 19) === value ? time : null;
}
function window(samples: Sample[], cutoff: number): UsageWindow | null {
  // Never apportion a gap across the time boundary: only whole observed intervals.
  const inside = samples.filter((sample) => sample.time >= cutoff);
  const first = inside[0];
  const last = inside[inside.length - 1];
  if (inside.length < 2 || !first || !last || last.time <= first.time) return null;
  return { consumedMb: Math.max(0, first.usageValue - last.usageValue), from: first.time, to: last.time, checks: inside.length };
}
export function analyzeInternetUsage(account: Account, key: 'day' | 'night', now: number): InternetUsage {
  const current: PackageContext = { expiresLocal: account.expiresLocal, tariffId: account.tariffId, tariffName: account.tariffName };
  const byTime = new Map<number, Sample>();
  const conflicts = new Set<number>();
  for (const entry of account.history) {
    if (entry.kind !== 'packages') continue;
    const reading = entry.packages[key];
    // A partial SMS retains old readings: those are not new observations.
    if (!reading || reading.updatedAt !== entry.at) continue;
    const time = Date.parse(reading.updatedAt);
    if (!Number.isFinite(time) || time > now || !Number.isFinite(reading.value) || reading.value < 0) continue;
    const previous = byTime.get(time);
    if (previous && (previous.value !== reading.value || !sameContext(previous.context, entry.context))) conflicts.add(time);
    else byTime.set(time, { time, value: reading.value, usageValue: reading.value, context: entry.context });
  }
  let segment: Sample[] = [];
  for (const sample of [...byTime.values()].sort((a, b) => a.time - b.time)) {
    // Unknown legacy context, a conflicting timestamp, or another billing period
    // is a barrier; do not bridge it to fabricate consumption.
    if (conflicts.has(sample.time) || !sameContext(sample.context, current)) { segment = []; continue; }
    const previous = segment[segment.length - 1];
    // Operator corrections must not erase earlier consumption or count twice
    // when the reported amount returns to its previous level. Keep a running
    // minimum for usage; retain the actual latest value for the balance/forecast.
    segment.push({ ...sample, usageValue: previous ? Math.min(previous.usageValue, sample.value) : sample.value });
  }
  const day = window(segment, now - DAY);
  const week = window(segment, now - 7 * DAY);
  const result = (forecast: Forecast): InternetUsage => ({ day, week, forecast });
  const expiry = packageExpiry(account.expiresLocal);
  if (expiry === null) return result({ kind: 'unavailable', reason: 'expiry' });
  if (expiry <= now) return result({ kind: 'unavailable', reason: 'expired' });
  const latest = segment[segment.length - 1];
  if (latest && now - latest.time >= DAY) return result({ kind: 'unavailable', reason: 'stale' });
  if (latest?.value === 0) return result({ kind: 'empty' });
  if (!week || week.checks < 3 || week.to - week.from < DAY || !latest) return result({ kind: 'unavailable', reason: 'samples' });
  const dailyMb = week.consumedMb / ((week.to - week.from) / DAY);
  const projected = latest.value - dailyMb * ((expiry - latest.time) / DAY);
  if (projected >= 0) return result({ kind: 'enough', dailyMb, remainingMb: projected, expiresAt: expiry });
  const runsOutAt = latest.time + (latest.value / dailyMb) * DAY;
  return result({ kind: 'shortfall', dailyMb, runsOutAt, expiresAt: expiry });
}
