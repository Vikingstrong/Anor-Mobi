import { emptyAccount, packageKeys, type Account, type Source, type TariffId } from '../domain/account';
import { parseBalance, parsePackageSms, type PackagePatch } from '../parsers/operator';
import type { Subscription, TelephonyPort, Sms } from '../services/telephony';
import { matchTariffName } from '../domain/tariffs';
import { selectAutoSim } from '../domain/simSelection';
import type { PendingSms } from '../services/backgroundSms';
import type { AccountStorage } from '../storage/accountStorage';

export type Delivery = {
  stage: 'idle' | 'sending' | 'waiting-ussd' | 'waiting-sms' | 'received' | 'manual-import' | 'error' | 'still-waiting';
  message: string;
  startedAt?: number;
};
export type AccountState = {
  account: Account; hydrated: boolean; busy: boolean; sims: Subscription[];
  balanceStatus: Delivery; packageStatus: Delivery;
  smsListening: boolean; error: string | null; storageError: boolean;
};
const reason: Record<string, string> = {
  MODULE_UNAVAILABLE: 'Для USSD нужна обновлённая сборка приложения.',
  TIMEOUT: 'USSD не ответил за 30 секунд. Старые значения сохранены.',
  SIM_CHANGED: 'SIM недоступна или изменилась. Выберите Anor заново.',
  BUSY: 'Предыдущий USSD-запрос ещё выполняется.',
  UNSUPPORTED: 'USSD API недоступен на этом устройстве.',
  CALL_PHONE_REQUIRED: 'Нет разрешения для USSD-запросов.',
  READ_PHONE_STATE_REQUIRED: 'Нет разрешения на выбор SIM.',
  PERMISSION_REVOKED: 'Доступ к телефону отозван.',
  PLATFORM_FAILURE: 'Оператор или Android не выполнил USSD-запрос.',
};
const idleBalance: Delivery = { stage: 'idle', message: 'Ещё не проверялся' };
const idlePackages: Delivery = { stage: 'idle', message: 'Ещё не получены' };

export interface BackgroundSmsPort {
  configure(enabled: boolean, subscriptionId: number | null): Promise<void>;
  pending(): Promise<PendingSms[]>;
  acknowledge(ids: string[]): Promise<void>;
}
export class AccountController {
  private state: AccountState = { account: emptyAccount(), hydrated: false, busy: false, sims: [],
    balanceStatus: idleBalance, packageStatus: idlePackages, smsListening: false, error: null, storageError: false };
  private listeners = new Set<() => void>();
  private disposed = false;
  private generation = 0;
  private sequence = 0;
  private receiverRevision = 0;
  private foreground = true;
  private unsubscribeSms: (() => void) | null = null;
  private smsDeadline: ReturnType<typeof setTimeout> | null = null;
  private attempt: { generation: number; received: boolean; startedAt: number } | null = null;
  private inboxBusy = false;
  private backgroundConfig: Promise<void> = Promise.resolve();
  private lastSmsKey: string | null = null;
  constructor(private port: TelephonyPort, private storage: AccountStorage, private now: () => number = Date.now, private background?: BackgroundSmsPort) {}
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(patch: Partial<AccountState>) {
    if (this.disposed) return;
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }
  private save(account: Account, kind?: 'balance' | 'packages', at = new Date(this.now()).toISOString()) {
    if (kind) account = { ...account, history: [{ at, kind, context: { expiresLocal: account.expiresLocal, tariffId: account.tariffId, tariffName: account.tariffName }, balance: account.balance, packages: { ...account.packages } }, ...account.history].slice(0, 30) };
    this.update({ account });
    void this.storage.write(account).then(() => this.update({ storageError: false }))
      .catch(() => this.update({ storageError: true }));
  }
  async init() {
    try {
      const account = await this.storage.read();
      if (this.disposed) return;
      if (account) this.update({ account,
        balanceStatus: account.balance ? { stage: 'idle', message: 'Сохранённый баланс' } : idleBalance,
        packageStatus: Object.values(account.packages).some(Boolean) ? { stage: 'idle', message: 'Сохранённые остатки' } : idlePackages });
    } catch { this.update({ error: 'Не удалось загрузить сохранённые данные.' }); }
    this.update({ hydrated: true });
    if (this.disposed) return;
    this.unsubscribeSms = this.port.onSms((sms) => this.receiveSms(sms));
    await this.syncReceiver();
  }
  private async syncReceiver() {
    const revision = ++this.receiverRevision;
    const granted = this.state.account.autoSms && await this.port.smsPermissionGranted();
    if (this.disposed || revision !== this.receiverRevision) return;
    if (!this.state.hydrated) return;
    const background = this.background;
    if (background) {
      const account = this.state.account;
      this.backgroundConfig = this.backgroundConfig.catch(() => {}).then(() => background.configure(account.autoSms && granted, account.subscriptionId));
      try { await this.backgroundConfig; }
      catch { this.update({ error: 'Не удалось настроить фоновый приём SMS.' }); }
    }
    if (this.disposed || revision !== this.receiverRevision) return;
    const enabled = this.foreground && this.state.account.autoSms && granted;
    const listening = await this.port.listenSms(enabled);
    if (revision === this.receiverRevision) this.update({ smsListening: enabled && listening });
    if (this.foreground && granted && this.state.account.autoSms) await this.restorePendingSms();
  }
  private async restorePendingSms() {
    const background = this.background;
    if (!background || this.inboxBusy || this.disposed) return;
    this.inboxBusy = true;
    const generation = this.generation;
    try {
      const events = await background.pending();
      if (this.disposed || generation !== this.generation || !this.state.account.autoSms) return;
      for (const event of events.sort((a, b) => a.messageTime - b.messageTime)) {
        if (event.subscriptionId !== this.state.account.subscriptionId) continue;
        const previous = this.state.account.lastSmsMessageTime;
        if (previous !== null && event.messageTime <= previous) continue;
        this.applyPackages(event.patch, 'sms', new Date(event.receivedAt).toISOString(), event.messageTime);
      }
      // Acknowledge only after durable snapshot/history writes. Crash/retry is idempotent.
      if (events.length) {
        await this.storage.write(this.state.account);
        this.update({ storageError: false });
        await background.acknowledge(events.map((event) => event.id));
      }
    } catch { this.update({ storageError: true, error: 'Не удалось сохранить фоновые SMS. Они будут прочитаны повторно.' }); }
    finally { this.inboxBusy = false; }
  }
  async setForeground(active: boolean) { this.foreground = active; await this.syncReceiver(); }
  async enableSms(enabled: boolean) {
    if (!this.port.available) { this.update({ error: reason.MODULE_UNAVAILABLE }); return; }
    if (enabled && !await this.port.requestAccess('sms')) {
      this.update({ error: 'Android не разрешил приём SMS. Доступен ручной импорт.' }); return;
    }
    this.save({ ...this.state.account, autoSms: enabled });
    await this.syncReceiver();
    if (enabled && !this.state.smsListening) this.update({ error: 'Автоприём SMS недоступен. Используйте вставку сообщения.' });
  }
  async loadSims() {
    if (this.state.busy || !this.state.hydrated || this.disposed) return;
    if (!this.port.available) { this.update({ error: reason.MODULE_UNAVAILABLE }); return; }
    if (!await this.port.requestAccess('sim')) { this.update({ error: 'Нужен доступ к списку SIM.' }); return; }
    const result = await this.port.subscriptions();
    if (this.state.busy || this.disposed) return;
    if (!result.ok) this.update({ error: reason[result.code] ?? 'Не удалось получить SIM.' });
    else {
      this.update({ sims: result.value, error: result.value.length ? null : 'Активные SIM не найдены.' });
      if (this.state.account.simSelection === 'auto') {
        const selected = selectAutoSim(result.value, this.state.account.subscriptionId);
        if (selected.kind === 'selected') {
          this.selectSubscription(selected.subscriptionId, 'auto');
          await this.syncReceiver();
        } else this.update({ error: 'Anor и SIM для звонков по умолчанию не найдены. Выберите SIM вручную.' });
      }
    }
  }
  private selectSubscription(subscriptionId: number, simSelection: 'auto' | 'manual') {
    if (this.state.account.subscriptionId === subscriptionId) {
      if (this.state.account.simSelection !== simSelection) this.save({ ...this.state.account, simSelection });
      return;
    }
    this.generation++;
    this.clearWaiting();
    this.lastSmsKey = null;
    const account = { ...emptyAccount(subscriptionId), simSelection, autoSms: this.state.account.autoSms };
    this.save(account);
    this.update({ balanceStatus: idleBalance, packageStatus: idlePackages, error: null });
  }
  chooseSim(subscriptionId: number) {
    if (this.state.busy || !this.state.hydrated || !this.state.sims.some((s) => s.subscriptionId === subscriptionId)) return;
    this.selectSubscription(subscriptionId, 'manual');
    void this.syncReceiver();
  }
  async chooseAutoSim() {
    if (this.state.busy || !this.state.hydrated) return;
    this.save({ ...this.state.account, simSelection: 'auto' });
    await this.loadSims();
  }
  clearHistory() { this.save({ ...this.state.account, history: [], tariffSnapshots: {} }); }
  chooseTariff(tariffId: TariffId) {
    if (!this.state.hydrated) return;
    // Manual selection affects the local comparison only, never the operator plan.
    this.save({ ...this.state.account, tariffId, tariffSelection: 'manual', comparisonReady: true });
  }
  chooseAutoTariff() {
    if (!this.state.hydrated) return;
    const name = this.state.account.tariffName;
    const tariffId = name ? matchTariffName(name) : null;
    this.save({ ...this.state.account, tariffSelection: 'auto', tariffId, comparisonReady: tariffId !== null });
  }
  private clearWaiting() {
    if (this.smsDeadline !== null) clearTimeout(this.smsDeadline);
    this.smsDeadline = null;
    this.attempt = null;
  }
  private applyPackages(patch: PackagePatch, source: Source, updatedAt: string, messageTime: number | null = null) {
    const current = this.state.account;
    const previousName = current.tariffName ? matchTariffName(current.tariffName) ?? current.tariffName.trim().toLocaleLowerCase('ru-RU') : null;
    const incomingName = patch.tariffName ? matchTariffName(patch.tariffName) ?? patch.tariffName.trim().toLocaleLowerCase('ru-RU') : null;
    const newPeriod = (current.expiresLocal !== null && patch.expiresLocal !== undefined && current.expiresLocal !== patch.expiresLocal)
      || (previousName !== null && incomingName !== null && previousName !== incomingName);
    const packages = newPeriod ? { ...emptyAccount().packages } : { ...current.packages };
    for (const key of packageKeys) {
      const value = patch.values[key];
      if (value !== undefined) packages[key] = { value, source, updatedAt };
    }
    const tariffId = current.tariffSelection === 'manual' ? current.tariffId
      : patch.tariffId ?? (patch.tariffName ? null : current.tariffId);
    const tariffName = patch.tariffName ?? current.tariffName;
    const expiresLocal = patch.expiresLocal ?? (newPeriod ? null : current.expiresLocal);
    const reportedId = tariffName ? matchTariffName(tariffName) : null;
    const tariffSnapshots = { ...current.tariffSnapshots };
    if (reportedId !== null) tariffSnapshots[reportedId] = { capturedAt: updatedAt, tariffName, expiresLocal, packages: { ...packages } };
    this.save({ ...current, packages, tariffName, tariffSnapshots,
      tariffId,
      expiresLocal,
      comparisonReady: tariffId !== null,
      lastSmsMessageTime: messageTime ?? current.lastSmsMessageTime }, 'packages', updatedAt);
    if (this.attempt) this.attempt.received = true;
    if (this.smsDeadline !== null) clearTimeout(this.smsDeadline);
    this.smsDeadline = null;
    this.update({ packageStatus: { stage: 'received', message: source === 'manual-sms' ? 'SMS импортировано' : source === 'ussd' ? 'Ответ получен · пакеты обновлены' : 'SMS получено · пакеты обновлены' }, error: null });
  }
  private receiveSms(sms: Sms) {
    if (!this.foreground || !this.state.account.autoSms || sms.sender.toUpperCase() !== 'ANORINFO'
      || sms.subscriptionId !== this.state.account.subscriptionId) return;
    if (sms.messageTime !== null && this.state.account.lastSmsMessageTime !== null
      && sms.messageTime <= this.state.account.lastSmsMessageTime) return;
    let hash = 2166136261;
    for (let i = 0; i < sms.body.length; i++) hash = Math.imul(hash ^ sms.body.charCodeAt(i), 16777619);
    const key = `${sms.subscriptionId}/${sms.messageTime ?? sms.receivedAt}/${hash}`;
    if (key === this.lastSmsKey) return;
    const parsed = parsePackageSms(sms.body);
    if (!parsed.ok) {
      this.update({ packageStatus: { stage: 'error', message: `SMS получено: ${parsed.error}` } }); return;
    }
    this.lastSmsKey = key;
    this.applyPackages(parsed.value, 'sms', new Date(sms.receivedAt).toISOString(), sms.messageTime);
  }
  importSms(text: string) {
    if (!this.state.hydrated) return { ok: false as const, error: 'Дождитесь загрузки данных' };
    const result = parsePackageSms(text);
    if (result.ok) this.applyPackages(result.value, 'manual-sms', new Date(this.now()).toISOString());
    return result;
  }
  async refresh(target: 'balance' | 'packages' | 'all') {
    if (this.state.busy || !this.state.hydrated || this.disposed) return;
    if (target !== 'balance' && (this.state.packageStatus.stage === 'waiting-sms' || this.state.packageStatus.stage === 'manual-import')) {
      this.update({ error: 'Запрос *104# уже отправлен. Ожидайте AnorINFO или вставьте SMS; баланс можно проверить отдельно.' }); return;
    }
    if (!this.port.available) { this.update({ error: reason.MODULE_UNAVAILABLE }); return; }
    this.update({ busy: true, error: null });
    try {
      if (!await this.port.requestAccess('ussd')) { this.update({ error: 'Нет разрешения для USSD.' }); return; }
      const sims = await this.port.subscriptions();
      if (!sims.ok) { this.update({ error: reason[sims.code] ?? 'SIM недоступны.' }); return; }
      this.update({ sims: sims.value });
      if (this.disposed) return;
      if (this.state.account.simSelection === 'auto') {
        const selected = selectAutoSim(sims.value, this.state.account.subscriptionId);
        if (selected.kind === 'unavailable') {
          this.update({ error: 'Anor и SIM для звонков по умолчанию не найдены. Выберите SIM вручную в настройках.' }); return;
        }
        this.selectSubscription(selected.subscriptionId, 'auto');
      }
      const subscriptionId = this.state.account.subscriptionId;
      if (subscriptionId === null || !sims.value.some((s) => s.subscriptionId === subscriptionId)) {
        this.update({ error: 'Выбранная SIM недоступна. Включите автоматический выбор или выберите SIM вручную.' }); return;
      }
      const generation = this.generation;
      await this.syncReceiver();
      if (this.disposed || generation !== this.generation) return;
      let transportCompleted = true;
      if (target === 'balance' || target === 'all') transportCompleted = await this.query('balance', subscriptionId, generation);
      if (!this.disposed && transportCompleted && generation === this.generation && (target === 'packages' || target === 'all')) {
        await this.syncReceiver();
        await this.query('packages', subscriptionId, generation);
      }
    } catch { this.update({ error: 'Не удалось выполнить запрос. Старые данные сохранены.' }); }
    finally { this.update({ busy: false }); }
  }
  private async query(kind: 'balance' | 'packages', subscriptionId: number, generation: number): Promise<boolean> {
    const requestId = `${this.now().toString(36)}-${++this.sequence}`;
    const startedAt = this.now();
    const statusKey = kind === 'balance' ? 'balanceStatus' : 'packageStatus';
    if (kind === 'packages') {
      this.clearWaiting();
      this.attempt = { generation, received: false, startedAt };
    }
    this.update({ [statusKey]: { stage: 'waiting-ussd', startedAt,
      message: kind === 'balance' ? 'Ожидаем ответ *100#' : 'Выполняем *104# · ожидаем ответ' } });
    const result = await this.port.query(requestId, kind, subscriptionId);
    if (this.disposed || generation !== this.generation || subscriptionId !== this.state.account.subscriptionId) return false;
    if (kind === 'balance') {
      if (!result.ok) { this.update({ balanceStatus: { stage: 'error', message: reason[result.code] ?? 'Ошибка USSD' } }); return false; }
      const parsed = parseBalance(result.value.text);
      if (!parsed.ok) { this.update({ balanceStatus: { stage: 'error', message: parsed.error } }); return true; }
      this.save({ ...this.state.account, balance: { value: parsed.value, source: 'ussd', updatedAt: new Date(result.value.receivedAt).toISOString() } }, 'balance', new Date(result.value.receivedAt).toISOString());
      this.update({ balanceStatus: { stage: 'received', message: 'Ответ получен · баланс обновлён' } });
      return true;
    }
    // A fast SMS may arrive before the USSD callback. Do not downgrade success.
    if (this.attempt?.received) return true;
    if (!result.ok) {
      this.update({ packageStatus: { stage: 'error', message: `${reason[result.code] ?? 'Ошибка USSD'}. Если пришло SMS AnorINFO, его можно импортировать.` } });
      return false;
    }
    // Some carrier/device combinations return the package text directly.
    const direct = parsePackageSms(result.value.text);
    if (direct.ok) { this.applyPackages(direct.value, 'ussd', new Date(result.value.receivedAt).toISOString()); return true; }
    this.update({ packageStatus: { stage: this.state.smsListening ? 'waiting-sms' : 'manual-import', startedAt,
      message: this.state.smsListening ? 'Ожидаем SMS AnorINFO' : 'Запрос выполнен. Вставьте SMS AnorINFO.' } });
    this.smsDeadline = setTimeout(() => {
      if (this.attempt?.generation === this.generation && !this.attempt.received) this.update({ packageStatus: {
        stage: 'still-waiting', startedAt, message: 'SMS пока нет. Продолжаем ждать; доступен ручной импорт.' } });
    }, 5 * 60 * 1000);
    return true;
  }
  dispose() {
    this.disposed = true;
    this.clearWaiting();
    this.unsubscribeSms?.();
    void this.port.listenSms(false);
    this.listeners.clear();
  }
}
