# Архитектура

Проект решения, 2026-11-10. Реализации пока нет.

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
