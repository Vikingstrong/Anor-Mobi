# Архитектура

Целевая архитектура, 2026-11-10. Реализация начата с разрешения владельца: сейчас есть App.tsx, DashboardScreen и theme/tokens. Native-модуль, store, storage и парсеры пока не реализованы. Описанные ниже потоки — план следующих итераций.

## Границы и стек

Один Android-клиент для одного выбранного счёта Anor на устройстве. Установка друзьям не создаёт общих данных и не требует backend. Не вводим DI framework, базу истории, multi-operator engine или общий слой синхронизации.

React Native/strict TypeScript отвечают за UI и бизнес-логику. Zustand — небольшой store. AsyncStorage — версионированный cache. StyleSheet и несколько UI tokens вместо NativeWind: меньше инструментов для двух экранов. Jest — чистая логика. Совместимые Expo/RN/React/Node/JDK/Gradle версии фиксируются перед созданием проекта, без независимого выбора последних версий каждого пакета.

Expo Development Build + Prebuild с локальным Kotlin Expo Module. [Expo рекомендует локальные модули для native-кода одного приложения](https://docs.expo.dev/workflow/customizing/). Expo Go не включает наш модуль; Kotlin-изменения требуют пересборки. Источник native-кода — `modules/`, manifest-настройки — config/plugin; `android/` генерируется. Не хранить важные ручные правки только в генерируемом каталоге.

## Будущая структура

```text
App.tsx
src/
  components/         # cards, progress, status, buttons
  screens/            # Dashboard, Settings, ImportSms
  hooks/              # UI bindings, selectors
  application/        # refreshBalance, previewImport, commitImport
  services/           # UssdService, interfaces источников
  parsers/            # balanceResponseParser, packageSmsParser
  tariffs/            # ultra, lite, metadata источников
  state/              # Zustand + selectors
  storage/            # repository, validation, migrations
  types/              # domain contracts, operation results
  theme/              # цвета, интервалы, типографика
  __tests__/          # domain/service tests, обезличенные fixtures
modules/anor-telephony/
  android/src/main/java/…/  # Kotlin module + operation coordinator
  src/                     # TS facade, native payload validation
  expo-module.config.json
plugins/                    # reproducible Android settings
```

Это схема, не требование создавать пустые каталоги. Начать с двух экранов и простого переключения; навигационную библиотеку добавлять, только если потребуются stack/deep links.

## Зависимости и потоки

UI → hook → application service → UssdService/native adapter или чистый parser → validated patch → store → storage repository. UI не знает Kotlin API; парсер не знает React и permissions. Kotlin не интерпретирует тарифную бизнес-логику.

**Баланс:** нажатие → проверка выбранной SIM/permissions → один native `*100#` → callback с текстом → валидация payload → разбор суммы → patch только денежного баланса → сохранение → сообщение об успехе. Получение текста не равно успешному обновлению числа.

**Пакеты:** отдельное SMS приходит в системное приложение. В MVP Anor Balance не получает его автоматически. Пользователь вставляет текст → parser распознаёт подтверждённые метки/блоки → preview с предупреждениями → подтверждение счёта и свежести → patch распознанных полей. Нет дополнительной неизвестной команды для «Обновить пакеты».

**Refresh All:** только после проверки запускает тот же единственный `*100#`; баланс и SMS — независимые каналы. В MVP показывает «Баланс обновлён; импортируйте SMS для пакетов». Нельзя обещать автоматическое ожидание SMS или ставить пакетам timestamp USSD. Если в будущем один источник принесёт несколько полей, один patch обновляет их без повторного запроса.

## Native boundary

Kotlin экспортирует `getCapabilities`, `listSubscriptions`, `requestPermission`, `sendBalanceRequest`, `openBalanceDialer` через Expo Modules API. Набор permissions и контракт — в соседних документах. Ни UI, ни произвольный текст SMS не могут передать исполняемую USSD-команду: модуль сам выбирает `*100#`.

Запрос содержит requestId, contextId, subscriptionId и timeoutMs. Ответ содержит те же идентификаторы, текст и receivedAt либо типизированную причину отказа. Kotlin проверяет активную подписку непосредственно перед вызовом. Подписка определяется через Android subscriptionId, не `slot = 2`. В интерфейсе Android slotIndex 1 отображается как SIM 2.

Native coordinator держит единственную активную операцию. Завершение exactly once при callback/timeout/ошибке/lifecycle invalidation. TS повторно проверяет requestId и contextId перед commit. Удалённый UI-компонент не является владельцем модемной операции; service переживает переходы между экранами. После уничтожения процесса незавершённое состояние не восстанавливается как loading.

Плановый timeout 30 секунд, настраивается по измерениям. Это остановка ожидания приложением, не отмена операции в сети. Поздний callback игнорируется, автоматического retry нет. После timeout новая отправка доступна только по явному действию с предупреждением о возможной ещё активной сессии; интервал до повторной попытки определяется device spike.

## Хранение и контекст

Сохраняем один snapshot с schemaVersion и настройки. Очередь записи сохраняет порядок, одна сериализованная запись содержит весь snapshot. Loading, ошибки операций, raw SMS/USSD и permission grants не сохраняются. При hydration валидировать JSON и версию; неизвестная версия/повреждение даёт безопасный empty state и сообщение, без crash. Не перезаписывать cache дефолтами до завершения hydration. Ошибка записи оставляет данные в памяти с предупреждением «Не сохранено»; время получения не меняется.

Один локальный contextId привязан к текущей выбранной подписке в рамках установки. При смене подписки/обнаруженной смене набора SIM сбрасывать данные и незавершённые preview. subscriptionId не постоянный идентификатор SIM; не читать ICCID/IMSI/номер ради стабильного ключа. Если SIM заменена незаметно для доступных API, предложить пользователю явный сброс; абсолютную автоматическую идентификацию не обещаем.

Тариф выбирается отдельно: смена тарифа меняет определение, но не доказанные остатки; comparison с лимитами отключается до повторного подтверждения. Контекст captured в начале операции предотвращает попадание старого ответа в новые настройки.

## UI-derived данные

Проценты и форматированные строки вычисляются селекторами, не сохраняются. Каждый показатель имеет собственный источник и время. Не вычислять срок пакета из 30 дней, даты установки или времени импорта. Время импорта SMS отличается от времени его фактического получения. Детали контракта — [DATA_MODELS](DATA_MODELS.md).

## Расширение

Автоматический SMS-источник позже выдаёт такой же validated patch через application service; background lifecycle потребует отдельного решения о native persistence. Не рассчитывать на всегда запущенный JS в BroadcastReceiver. Другие операторы добавляются только после реальной потребности, без предварительного реестра плагинов.

### Реализованный UI preview, 2026-11-11

App владеет preference system/light/dark и подпиской useColorScheme; Dashboard получает палитру и callback. src/components/PackageCard рисует статическую полосу, максимум и независимое время. src/demo/dashboardDemo.ts — явно синтетические данные для opt-in preview, без cache и записи. Dashboard пока открывает только фиксированный tel URI по нажатию; это manual fallback без получения ответа. Настоящий UssdService будет подключён следующей итерацией. Новых native API/permissions для UI не добавлено, APK повторно не собирался.

### Native-интеграция, 2026-11-11

modules/anor-telephony содержит AnorTelephonyModule и независимый AnorSnapshotStorageModule. TelephonyPort валидирует unknown payload, управляет runtime permissions и передаёт события только AnorINFO. AccountController не зависит от React/Android: последовательность 100/104, busy, контекст SIM, ожидание, поздний SMS, partial patch и сохранение проверяются подменными портами. useAccount связывает controller с useSyncExternalStore и AppState. PackageCard получает реальные readings и отдельные timestamps, demo остаётся отдельным источником представления и никогда не записывается в cache.

Native receiver зарегистрирован динамически только в foreground после opt-in. Исходный SMS проходит в памяти в TS parser и не сохраняется. При фоне/убийстве процесса гарантии получения нет; manual import остаётся доступным. Snapshot adapter сериализует записи и валидирует schemaVersion, native AtomicFile записывает JSON в noBackupFilesDir. Runtime-зависимости AsyncStorage/Zustand не добавлялись.

2026-11-11: фоновая граница: системный SMS broadcast → AnorSmsReceiver (extract known fields) → AtomicFile inbox → backgroundSms adapter (runtime validation + существующий parser) → AccountController → snapshot/history → UI. Очередь подтверждается после durable write; native не запускает JS/service и USSD. Foreground callback остаётся отдельным быстрым каналом. Theme adapter использует отдельную preference; UI получает только тему/ошибку. История — часть v2 structured snapshot.

2026-11-11, расход/прогноз: domain/internetUsage зависит только от domain/account. Получает явный now для воспроизводимых расчётов; не использует React/native/storage. InternetUsageCard получает Account из application state, отображает результат; существующий foreground clock обновляет время. Контекст пакета сохраняется application service при приёме ответа. Native и permissions не менялись, новых зависимостей нет.

2026-11-12: native getSubscriptions поставляет carrierName/SPN/default-voice metadata; telephony adapter валидирует unknown, domain/simSelection решает выбор, AccountController применяет режим и эффективную subscription. Список/default не persist, режим auto/manual входит в snapshot v4. Контекст счёта переключается до query и sync SMS receiver, а при том же ID история сохраняется. UI показывает режим и слот после определения. В internetUsage убран рост как reset: running minimum отделён от фактического последнего остатка, хранение readings прежнее.

2026-11-12, 0.3.2: App выбирает resolved system/light/dark и accent; pure getPalette подставляет соответствующие accent/tint/track поверх нейтральной базы. Dashboard получает палитру и callback выбора; native storage доступен только через themeStorage adapter. Акцент — отдельная preference, не поле счёта; новых зависимостей/таймеров нет. Шестерёнка — code-native glyph assets/icons/settings.png, воспроизводимая scripts/generate-brand-assets.py.

2026-11-12, 0.4: domain/tariffs — проверенный каталог и exact name matcher; domain/tariffView — pure выбор активных/архивных readings и применимых полей. Application сохраняет отдельный снимок по фактическому названию тарифа, независимо от manual UI override. UI selector не исполняет активацию. SettingsSheet изолирует native-driven lifecycle открытия/закрытия. Хранилище мигрирует v1–v5 в v6, native contract JSON/permissions без расширения.
