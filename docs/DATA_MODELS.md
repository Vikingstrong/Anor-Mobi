# Контракты данных

Проект TS-контрактов, не реализация. Все числа проверяются в runtime: finite, нужный знак/целочисленность и безопасный диапазон. ISO-строки ниже валидируются, а не считаются безопасными только по типу `string`.

## Доменные модели

```ts
type Instant = string; // ISO 8601 UTC instant после проверки
type LocalDateTime = string; // YYYY-MM-DDTHH:mm:ss, без скрытой timezone
type TariffId = 'diyor-ultra' | 'diyor-lite';
type PackageKey = 'dayInternetMb' | 'nightInternetMb' | 'minutes' | 'sms';
type Source = 'ussd' | 'manual-sms';
type Money = { minorUnits: number; currency: 'TJS' }; // 100 дирам = 1 TJS

type Evidence = {
  source: Source;
  capturedAt: Instant; // когда приложение получило/импортировало текст
  operatorReceivedAt: Instant | null; // время SMS, если достоверно известно
  requestId: string | null;
  parserVersion: string;
};

type Reading<T> =
  | { kind: 'unknown'; reason: 'never-received' | 'context-reset' }
  | { kind: 'known'; value: T; evidence: Evidence };

type Expiry =
  | { kind: 'local-date-time'; value: LocalDateTime; timeZone: string | null }
  | { kind: 'unlimited' };

type TariffDefinition = {
  id: TariffId;
  name: string;
  fee: Money;
  periodDays: number;
  limits: Record<PackageKey, number>; // интернет в официальных МБ
  unlimitedOnNet: boolean;
  sourceUrl: string;
  verifiedOn: string; // YYYY-MM-DD, не время получения баланса
  revision: string;
};

type SelectedTariff = {
  tariffId: TariffId;
  selectedAt: Instant;
  source: 'manual';
  revision: string;
};

type AccountSnapshot = {
  contextId: string;
  balance: Reading<Money>;
  packages: Record<PackageKey, Reading<number>>;
  packageExpiresAt: Reading<Expiry>;
  operatorReportedTariff: Reading<string>;
  // Служебный блок SMS не подменяет packageExpiresAt.
  paidTrafficStopExpiry: Reading<Expiry>;
  comparisonBasis: { tariffId: TariffId; revision: string } | null;
};

type PersistedState = {
  schemaVersion: 1;
  selectedTariff: SelectedTariff | null;
  selectedSubscriptionId: number | null; // подсказка, обязательно revalidate
  snapshot: AccountSnapshot;
  savedAt: Instant;
};
```

У known-reading числовой ноль допустим и отличается от unknown. Минуты/SMS — неотрицательные целые; интернет — неотрицательные десятичные МБ; баланс может быть отрицательным, если это допускает подтверждённый текст. Денежную строку разбирать точно в minorUnits, не умножением float без проверки. Из образца `0.05TJS` получается 5 minorUnits, не 5 сомони.

Типы описывают текущие ULTRA/LITE, не универсальную схему всех тарифов. Неизвестный лимит в будущих тарифах потребует явного расширения контракта, а не записи нуля. `comparisonBasis = null` запрещает процент после смены тарифа/неясного соответствия источника. Текущее имя тарифа из SMS — отдельное наблюдение, не тихая замена ручного выбора.

## Частичные результаты и ошибки

```ts
type ErrorCode =
  | 'NO_ACTIVE_SIM' | 'SIM_CHANGED' | 'BUSY' | 'TIMEOUT'
  | 'PLATFORM_FAILURE' | 'PARSE_UNSUPPORTED' | 'PARSE_AMBIGUOUS'
  | 'INVALID_INPUT' | 'STORAGE_FAILED';

type Result<T> =
  | { kind: 'success'; data: T }
  | { kind: 'permission-required'; permission: 'CALL_PHONE' | 'READ_PHONE_STATE';
      canAskAgain: boolean }
  | { kind: 'unsupported'; feature: 'ussd' | 'subscriptions' | 'dialer'; reason: string }
  | { kind: 'error'; code: ErrorCode; retryable: boolean; nativeCode?: number };

type RefreshState =
  | { status: 'idle' }
  | { status: 'loading'; requestId: string; contextId: string; startedAt: Instant }
  | { status: 'success'; requestId: string; completedAt: Instant;
      fields: readonly string[] }
  | { status: 'error'; requestId: string; failedAt: Instant;
      reason: Exclude<Result<never>, { kind: 'success' }> };

type PackagePatch = {
  contextId: string;
  fields: Partial<Record<PackageKey, number>>;
  packageExpiresAt?: Expiry;
  operatorReportedTariff?: string;
  paidTrafficStopExpiry?: Expiry;
  evidence: Evidence;
};

type ParsePreview = {
  patch: PackagePatch;
  warnings: readonly ('UNKNOWN_MESSAGE_TIME' | 'DAY_BUCKET_UNCONFIRMED'
    | 'TARIFF_MISMATCH' | 'EXPIRY_TIMEZONE_UNKNOWN' | 'PARTIAL')[];
};
```

Отсутствующее поле patch не меняет старое; `null`, NaN, Infinity и отрицательные пакеты не допускаются. Empty patch не успех. Ошибка не удаляет последний known reading и не обновляет его timestamp. ParsePreview остаётся в памяти и требует подтверждения перед commit. Контекст preview должен совпасть с текущим контекстом и выбранным тарифом; иначе пересоздать preview.

Свежесть: у каждого поля своя evidence; capturedAt — время импорта, не доказательство свежести SMS. При неизвестном времени SMS интерфейс явно пишет «Импортировано …; время сообщения неизвестно». Повторный импорт может не быть новым измерением. Старое SMS нельзя молча считать новее текущих данных по времени вставки: показать предупреждение/подтверждение. Общий timestamp — производный максимум успешного получения/импорта с корректной подписью, не timestamp всех карточек.

## Native JSON boundary

```ts
type Subscription = {
  subscriptionId: number;
  slotIndex: number; // Android zero-based
  displayName: string;
};
type UssdRequest = {
  requestId: string;
  contextId: string;
  subscriptionId: number;
  timeoutMs: number;
};
type UssdResponse = {
  requestId: string;
  contextId: string;
  subscriptionId: number;
  text: string;
  receivedAt: Instant;
};
type Capabilities = {
  apiLevel: number;
  ussdApiAvailable: boolean; // наличие API, НЕ доказанная работа Anor
  subscriptionApiAvailable: boolean;
};
interface TelephonyPort {
  getCapabilities(): Promise<Result<Capabilities>>;
  listSubscriptions(): Promise<Result<Subscription[]>>;
  requestPermission(permission: 'CALL_PHONE' | 'READ_PHONE_STATE'):
    Promise<Result<{ granted: true }>>;
  sendBalanceRequest(input: UssdRequest): Promise<Result<UssdResponse>>;
  openBalanceDialer(): Promise<Result<{ opened: true }>>;
}
```

Native adapter принимает payload как unknown и проверяет discriminant/поля/длины. Kotlin реализует allowlist `*100#`, валидирует timeout и идентификаторы, возвращает только JSON values. Throwable не попадает в JS. Неожиданный rejected Promise маппится в safe PLATFORM_FAILURE; обычные ожидаемые исходы возвращаются как Result. Метод requestPermission вызывается только по объяснённому пользовательскому действию. `opened: true` означает лишь открытый dialer.

## Реальные образцы, предоставлены владельцем 2026-11-10

Образцы предназначены для будущих тестов, не являются тестовым прогоном или текущими данными приложения. Приветствие обезличено. Sender и фактическое время получения SMS пока неизвестны.

Баланс из скриншота USSD:

```text
Тавозуни Шумо: 0.05TJS.
```

SMS пакетов:

```text
Шом ба хайр, [ИМЯ]!
Тарофаи Шумо <<Диёр Ультра>>
Зангхои бемахдуд дар дохили шабака;
Дакикахои бокимонда: 1000 дакика;
Интернети бокимонда: 29938.09 мб;
СМС бокимонда: 50 адад;
Трафики шабона: 35000мб;
Мухлати баста то 10.12.2026 18:48:07;

<< Стоп платный интернет трафик >>
Мухлати баста: (Бемахдуд);
```

Ожидаемая интерпретация для будущей реализации:

| Метка | Значение | Уверенность/условие |
| --- | --- | --- |
| Тавозуни Шумо | 0.05 TJS = 5 дирам | Подтверждённый пример денежного поля |
| Дакикахои бокимонда | 1000 минут | Подтверждено текстом |
| Интернети бокимонда | 29938.09 МБ | Поле «дневной» предварительно по структуре ULTRA; требуется подтверждение, до него warning и явное подтверждение preview |
| СМС бокимонда | 50 | Подтверждено текстом |
| Трафики шабона | 35000 МБ | Подтверждено текстом |
| Мухлати баста то | 2026-12-10T18:48:07 | Локальное операторское время, timezone в сообщении нет |
| Стоп платный интернет трафик | unlimited | Отдельная услуга; не означает бессрочные основные пакеты |

План парсинга: разделить блоки по подтверждённым заголовкам, распознавать метки, числа и единицы, не выбирать произвольное первое число/последнюю дату. Приветствие не сохранять и не использовать как ключ. Неизвестные/противоречивые повторные поля дают warning либо PARSE_AMBIGUOUS без молчаливого overwrite. Ограничить вход (предлагается 16 KiB), использовать линейные простые шаблоны, нормализацию пробелов/переносов; дополнительные варианты языка/разделителей добавлять после примеров или как явно синтетические негативные тесты.

Только один SMS-пример ULTRA: LITE, нулевые/дробные/истёкшие пакеты, другая локаль и смена формата ещё не подтверждены. Не объявлять parser универсальным.

## Единицы и даты

Официальный каталог содержит 30000/35000 и 10000/25000 МБ. Сохранять МБ; не использовать 1024 автоматически и не смешивать MB/GiB. Пока коэффициент не подтверждён, UI может показывать МБ без конверсии. Для будущей даты с timezone Asia/Dushanbe значение из SMS соответствует UTC+05:00, но такая зона — предположение до подтверждения операторского смысла. До этого хранить local-date-time с timeZone null и показывать как указанное оператором, без выдуманного UTC instant. «30 дней» каталога не вычисляет фактическое expiry.

## Состояния получения: уточнение 2026-11-11

Это проект следующей интеграции, не текущая реализация native-событий. Два канала состояния независимы:

```ts
type BalanceDelivery =
  | { stage: 'idle' }
  | { stage: 'sending'; requestId: string; startedAt: Instant }
  | { stage: 'waiting-ussd'; requestId: string; startedAt: Instant }
  | { stage: 'received'; requestId: string; receivedAt: Instant }
  | { stage: 'failed'; requestId: string; reason: ErrorCode };

type PackageDelivery =
  | { stage: 'idle' }
  | { stage: 'waiting-sms'; requestId: string; waitingSince: Instant }
  | { stage: 'manual-import-required'; requestId: string | null }
  | { stage: 'sms-received'; receivedAt: Instant; sender: 'AnorINFO' }
  | { stage: 'updated'; updatedAt: Instant; fields: readonly PackageKey[] }
  | { stage: 'still-no-sms'; waitingSince: Instant }
  | { stage: 'parse-failed'; receivedAt: Instant; reason: 'unsupported' | 'ambiguous' };
```

`received` баланса означает успешное получение и разбор суммы, а не просто открытый dialer. `sms-received` ещё не означает успешно разобранные пакеты; `updated` возникает только после применения patch. Ошибки/тайм-ауты не стирают последние известные значения. В ручном MVP вместо утверждения о фоновом прослушивании показывать необходимость ручного импорта. Для dialer fallback отдельное локальное состояние `dialer-opened`; не превращать его в `sending`/`received` без доказательства.

Таймер ожидания относится к конкретной попытке и не подменяет evidence полей. Не хранить ticking counter; считать время из waitingSince, останавливать UI-обновления в фоне. SMS может прийти через несколько минут и после мягкого дедлайна; поздний корректный импорт не должен отбрасываться только из-за USSD-тайм-аута. Нельзя достоверно привязать SMS к requestId исключительно по близости времени.

## Текущий реализованный контракт

Авторитетный код: src/domain/account.ts, src/services/telephony.ts, src/application/AccountController.ts. Account.schemaVersion=1, subscriptionId nullable, balance Reading.value — целые дирамы. Packages day/night/minutes/sms — независимые nullable readings с value, source и updatedAt. Отсутствующее поле patch не меняет старое reading. Срок остаётся локальной операторской строкой без выдуманной timezone; бессрочность «Стоп платный интернет» его не заменяет.

comparisonReady запрещает неверный процент после смены определения тарифа. lastSmsMessageTime отсеивает более старые сообщения; requestId не выводится из SMS и не считается доказанным correlation ID. Состояния USSD и SMS раздельны. После пяти минут ожидания SMS — мягкое «пока нет», без автоповтора и без отбрасывания позднего валидного сообщения. Таймер UI работает только при ожидании/foreground в отдельном компоненте.

### Расширение 2026-11-11: снимок v2, тема и фоновая очередь

Account.schemaVersion=2, поле history: максимум 30 `{at: ISO string, kind: balance|packages, balance: Reading|null, packages: Packages}`. Снимки v1 читаются с пустой историей и записываются как v2; file name сохранён для миграции установленной версии. История содержит только показания и их источники, не SMS. Ошибка записи видна в UI. Тема — отдельная preference system|light|dark, по умолчанию system.

AnorTelephony: configureBackgroundSms(enabled:boolean, subscriptionId:number), readPendingSms(): JSON string, acknowledgeSms(ids:string[]): void. Очередь v1 содержит enabled (выбор пользователя, не permission grant), subscriptionId, events (до 30): id:string, subscriptionId:number, receivedAt/messageTime:number, fields: известные значения day/night/minutes/sms (строго число+единица), tariffName?, expiry?. JS adapter восстанавливает каноническое представление только известных полей и проверяет существующим parser. Raw SMS/приветствия/имена/номера не сохраняются. Pending IDs подтверждаются после durable snapshot write, новые broadcasts при этом не удаляются. Смена SIM/отключение opt-in очищают очередь. Atomic files ограничены 128 KiB и исключены из backup.

### Расширение 2026-11-11: снимок v3 и аналитика

Account.schemaVersion=3. HistoryEntry.context: null | {expiresLocal:string|null, tariffId:TariffId|null, tariffName:string|null}. Контекст фиксируется вместе с новым ответом; при чтении старых v1/v2 история сохраняется, отсутствующий context мигрирует в null. Старым строкам контекст не дорисовывается. Native file path и лимит 128 KiB прежние.

Чистая analyzeInternetUsage(account, day|night, now) возвращает day/week: null | {consumedMb, from, to, checks}, forecast: unavailable(reason:samples|stale|expiry|expired) | empty | enough(dailyMb, remainingMb, expiresAt) | shortfall(dailyMb, runsOutAt, expiresAt). Все времена результата — epoch milliseconds только внутри JS, native bridge не изменён. unknown/null не становится 0. Результаты вычисляются при отображении, не сохраняются и не запускают запросы. Даты срока валидируются календарно и интерпретируются как +05:00. Перенесённое поле частичного SMS считается наблюдением лишь когда reading.updatedAt===history.at.

### Исправления 2026-11-12: снимок v4 и metadata SIM

Account.schemaVersion=4; simSelection:auto|manual. Старые schema 1–3 мигрируют в auto; сохранённая subscriptionId и readings/history не меняются. Не сохраняем runtime-флаги/permissions/default voice metadata, они перечитываются перед пользовательским запросом. Режим manual сохраняет приоритет активной выбранной SIM.

AnorTelephony.getSubscriptions success.data[] расширен: subscriptionId:number, slotIndex:number, displayName:string, carrierName:string, operatorName:string, isDefaultVoice:boolean. Carrier/operator имена ограничены native до 80 символов; displayName до 60. Это JSON-совместимые runtime metadata. JS сначала валидирует unknown; для старого APK отсутствие новых полей = пустые имена и false, не выдуманный default. default voice определяется Android SubscriptionManager, не номером слота или SIM для интернета. Pure domain/simSelection выбирает Anor → default voice → единственную SIM; отсутствие однозначного выбора — unavailable. Контракт sendRequest и USSD allowlist прежние.

Аналитика расхода 0.3.1 использует виртуальное минимальное показание внутри контекста только для разницы расхода; raw structured Reading не меняется. Увеличение МБ больше не разрывает последовательность и не удаляет наблюдения. Настоящая смена контекста/конфликт времени по-прежнему разделяют расчёт. Структура результата analyzeInternetUsage не менялась.

### Preference акцентного цвета, 0.3.2 — 2026-11-12

AnorSnapshotStorage.readAccent(): Promise<unknown> (native строка); writeAccent(accent:string): Promise<void>, native allowlist blue|green|orange|red|purple|teal|pink. Значение anor_preferences.accent, отсутствующее = blue. JS isAccent сначала проверяет внешний unknown, invalid/read/write errors сообщаются в настройках. Тема system|light|dark хранится своим ключом. Общая последовательная JS очередь записи не позволяет более раннему цвету перезаписать поздний. Theme и accent initial read имеют независимые revision counters. Account schema v4, SMS/native telephony contracts и permissions не менялись.

### Версия 0.4: Account v6

Поддерживаемые входные schemaVersion 1–6, запись v6. tariffId расширен до ultra|lite|diyor55|diyor45|diyor35|diyor15. tariffSelection:auto|manual (legacy default auto). tariffSnapshots: Partial<Record<TariffId,{capturedAt:ISO,tariffName:string|null,expiresLocal:string|null,packages:Packages}>>, максимум шесть записей; только типизированные показания. Ключ и распознанное имя проверяются на согласованность. Native AtomicFile path/128 KiB cap прежние.

Миграция сохраняет history/readings, заполняет недостающий последний снимок по известному названию из старых history/current packages. tariffView выбирает активные readings или отдельный явно архивный снимок при ручном просмотре другого тарифа. visiblePackageKeys скрывает отсутствующие в каталоге поля без удаления. Архив не обнуляется при вытеснении строк из 30-элементной истории. clearHistory явно очищает прошлые снимки; текущий счёт доступен. Actual tariff/expiry change обнуляет лишь отсутствующие значения нового периода, не архив предыдущего плана.
