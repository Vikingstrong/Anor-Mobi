import { requireOptionalNativeModule, type EventSubscription } from 'expo';

export type TelephonyNative = {
  configureBackgroundSms(enabled: boolean, subscriptionId: number): Promise<void>;
  readPendingSms(): Promise<unknown>;
  acknowledgeSms(ids: string[]): Promise<void>;
  getSubscriptions(): Promise<unknown>;
  sendRequest(id: string, kind: 'balance' | 'packages', subscriptionId: number): Promise<unknown>;
  setSmsListening(enabled: boolean): Promise<unknown>;
  addListener(event: 'onOperatorSms' | 'onRequestDispatched', listener: (event: unknown) => void): EventSubscription;
};
export type SnapshotNative = {
  readAccent(): Promise<unknown>;
  writeAccent(accent: string): Promise<void>;
  readTheme(): Promise<unknown>;
  writeTheme(theme: string): Promise<void>;
  readSnapshot(): Promise<string | null>;
  writeSnapshot(json: string): Promise<void>;
};
// Old development APKs remain usable: missing native code is an explicit state.
export const telephonyNative = requireOptionalNativeModule<TelephonyNative>('AnorTelephony');
export const snapshotNative = requireOptionalNativeModule<SnapshotNative>('AnorSnapshotStorage');
