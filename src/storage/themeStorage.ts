import { snapshotNative } from '../../modules/anor-telephony/src';
import { isAccent, type Accent, type ThemePreference } from '../theme/tokens';
let writes: Promise<void> = Promise.resolve();
export async function readTheme(): Promise<ThemePreference> {
  if (!snapshotNative) return 'system';
  await writes.catch(() => {});
  const value: unknown = await snapshotNative.readTheme();
  if (value === 'light' || value === 'dark' || value === 'system') return value;
  throw new Error('INVALID_THEME');
}
export function writeTheme(value: ThemePreference): Promise<void> {
  const native = snapshotNative;
  if (!native) return Promise.reject(new Error('MODULE_UNAVAILABLE'));
  writes = writes.catch(() => {}).then(() => native.writeTheme(value));
  return writes;
}

export async function readAccent(): Promise<Accent> {
  if (!snapshotNative) return 'blue';
  await writes.catch(() => {});
  const value: unknown = await snapshotNative.readAccent();
  if (isAccent(value)) return value;
  throw new Error('INVALID_ACCENT');
}
export function writeAccent(value: Accent): Promise<void> {
  const native = snapshotNative;
  if (!native) return Promise.reject(new Error('MODULE_UNAVAILABLE'));
  writes = writes.catch(() => {}).then(() => native.writeAccent(value));
  return writes;
}
