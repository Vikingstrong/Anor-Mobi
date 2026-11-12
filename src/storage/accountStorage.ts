import { snapshotNative } from '../../modules/anor-telephony/src';
import { decodeAccount, type Account } from '../domain/account';
export interface AccountStorage {
  read(): Promise<Account | null>;
  write(value: Account): Promise<void>;
}
let writes: Promise<void> = Promise.resolve();
export const accountStorage: AccountStorage = {
  async read() {
    if (!snapshotNative) return null;
    await writes.catch(() => {});
    const json = await snapshotNative.readSnapshot();
    if (json === null) return null;
    const value = decodeAccount(json);
    if (!value) throw new Error('INVALID_SNAPSHOT');
    return value;
  },
  async write(value) {
    if (!snapshotNative) return; // Old preview APK has session-only data.
    const json = JSON.stringify(value);
    if (!decodeAccount(json)) throw new Error('INVALID_SNAPSHOT');
    const native = snapshotNative;
    writes = writes.catch(() => {}).then(() => native.writeSnapshot(json));
    await writes;
  },
};
