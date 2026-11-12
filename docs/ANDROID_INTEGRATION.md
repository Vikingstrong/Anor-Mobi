# Android integration: исследование и проверки

Проверено по документации 2026-11-10. Публичный API подтверждён документацией; работоспособность приложения на Anor пока не проверена. Ни зависимостей, ни native spike на этом этапе не создавалось.

## Известное устройство и каналы

Со слов владельца: A12, Android 12 (API 31), две SIM; Anor основная, физически во втором слоте. По контексту ожидается Samsung Galaxy A12, но точный model code и версия One UI ещё не получены. Не фиксировать Samsung-specific обходы без проверки.

Владелец подтвердил: баланс приходит в USSD-ответе, пакеты — отдельным SMS. Скриншот содержит `Тавозуни Шумо: 0.05TJS.`. Это реальное наблюдение системного dialer, не результат `sendUssdRequest` нашего приложения. Связь с `*100#` основана на описании владельца, программно не измерена. Пример USSD не содержит остатки пакетов.

## Что гарантирует API, а что нет

[TelephonyManager](https://developer.android.com/reference/android/telephony/TelephonyManager#sendUssdRequest(java.lang.String,%20android.telephony.TelephonyManager.UssdResponseCallback,%20android.os.Handler)) предоставляет `sendUssdRequest` с API 26, требует CALL_PHONE и telephony radio feature. Callback возвращает текст либо код неудачи. `createForSubscriptionId` привязывает менеджер к конкретной подписке.

Это техническое основание для spike, а не гарантия на A12/Anor. Ответ может оказаться меню, сообщением об ошибке или отличаться от показанного dialer. Публичный метод не предоставляет нам контракт управления многошаговой USSD-сессией или отмены уже отправленного запроса. В MVP поддерживаем одношаговый запрос, без Accessibility/private API/root. API ниже 26 — native automatic unsupported; реальный minSdk может быть выше по выбранному Expo SDK.

Наличие мобильного интернета не требуется самим приложением для USSD, но нужны SIM и обслуживание сетью. VoLTE/сеть/прошивка могут влиять на результат, это проверяется экспериментально. Не переключать режимы сети программно.

## Permissions

| Возможность | Доступ | Когда |
| --- | --- | --- |
| Cache, ручная вставка SMS | Без dangerous permissions | Всегда |
| Автоматический USSD | CALL_PHONE, runtime consent | По нажатию «Обновить баланс» |
| Список SIM | READ_PHONE_STATE | При настройке выбранной подписки |
| Dialer fallback | ACTION_DIAL, без CALL_PHONE | Отдельное действие пользователя |
| Новые SMS после MVP | RECEIVE_SMS + ограничения установщика | Только отдельный исследовательский этап |
| История SMS | READ_SMS | В MVP не запрашивается и не планируется без новой необходимости |

[SubscriptionManager.getActiveSubscriptionInfoList](https://developer.android.com/reference/android/telephony/SubscriptionManager#getActiveSubscriptionInfoList()) требует READ_PHONE_STATE либо carrier privileges. Наше приложение не имеет carrier privileges. Список может быть пустым/на старых API null, и не является достоверным источником номера телефона.

Отказ: показать ручной режим. После постоянного отказа — кнопка открытия настроек по инициативе пользователя, без циклического запроса. Повторно проверять доступ перед каждой операцией; grant не хранить в cache. SecurityException возможен при отзыве между проверкой и вызовом.

## Две SIM и Samsung

1. Получить активные подписки после разрешения, показать label и слот, без номера/ICCID.
2. Пользователь выбирает Anor в SIM 2. Нельзя полагаться на системную default SIM или имя оператора.
3. Перед запросом проверить subscriptionId и вызвать менеджер, привязанный к нему. slotIndex 1 означает второй слот; subscriptionId может быть любым валидным числом.
4. SIM отключена/удалена/набор изменился → остановить действие, попросить выбрать заново и сбросить контекст.
5. Если READ_PHONE_STATE отклонён, не угадывать слот автоматического запроса; оставить dialer, где SIM выбирается системными средствами.

Samsung/One UI не имеет в этой документации доказанного отдельного публичного API для обхода USSD-ограничений. На A12 проверить callback, показ системного диалога, корректную SIM, отсутствие ответа, возврат из dialer и повторные запросы. Не утверждать ни гарантированный сбой, ни гарантированную совместимость Samsung.

## Callback, потоки, ошибки

В Kotlin `AsyncFunction` открывает асинхронную операцию и возвращает Promise для JS. `Handler` с явным Looper задаёт обработку ответа; ожидание не блокирует JS/UI thread. Android callback преобразуется в JSON record, не передаётся сам в JS. Состояние pending и атомарное завершение предотвращают двойной resolve.

Отделять platform failure от parse error: ответ сети может быть успешным текстовым сообщением без суммы. Сохранять native code как необязательную диагностическую цифру; пользователю показывать безопасную причину. Ожидаемые исходы: permission denied, unsupported, no active SIM/SIM changed, busy, timeout, platform error, parser unsupported/ambiguous. Не назначать каждому platform error точную сетевую причину, если код этого не доказывает.

Таймер — первоначально 30 секунд; поздний callback игнорировать. Неизвестный native error не крашит приложение. Таймаут не отменяет запрос у оператора, не вызывает автоматическую повторную отправку. Проверить конкуренцию, уход в фон, поворот экрана, уничтожение JS runtime и смену SIM между отправкой и callback.

## Ручной fallback

Через [ACTION_DIAL с tel URI](https://developer.android.com/guide/components/intents-common#DialPhone) открыть набор `*100#` с корректным кодированием `#` (например, построением URI через `Uri.fromParts`). Проверять наличие обработчика, обрабатывать ActivityNotFoundException. Пользователь сам отправляет запрос и выбирает SIM. ACTION_DIAL не возвращает текст USSD нашему приложению; открытие dialer не обновляет cache и не считается успехом получения баланса. Для полностью ручного баланса отдельный ввод — возможный согласуемый fallback. Не заменять ACTION_DIAL скрытым ACTION_CALL.

## SMS: MVP и возможная автоматизация

MVP: обычное поле вставки, без фонового чтения clipboard, READ_SMS и RECEIVE_SMS. Реальный обезличенный образец и семантика блоков — в DATA_MODELS. Sender и SMS timestamp ещё неизвестны, поэтому фильтрацию отправителя пока нельзя настроить.

После MVP рассмотреть BroadcastReceiver для [SMS_RECEIVED_ACTION](https://developer.android.com/reference/android/provider/Telephony.Sms.Intents#SMS_RECEIVED_ACTION), сбор multipart через `getMessagesFromIntent`, ограничение размеров, проверку sender/формата/подписки и дедупликацию. BroadcastReceiver не гарантирует живой RN runtime: нужна ограниченная native обработка и безопасная очередь/хранилище после отдельного ADR. Не считать время близости к USSD достаточным доказательством принадлежности SMS запросу.

[RECEIVE_SMS и READ_SMS](https://developer.android.com/reference/android/Manifest.permission#RECEIVE_SMS) относятся к hard-restricted permissions: одного runtime consent недостаточно, важен allowlist установщика. Sideload APK друзьям не гарантирует их доступность. Проверить реальный путь установки. READ_SMS для приёма новых сообщений не требуется само по себе; не просить доступ к истории «на всякий случай».

[Правила Google Play для SMS](https://support.google.com/googleplay/android-developer/answer/10208820) требуют default-handler статуса либо применимого одобренного исключения. Неофициальное приложение не получает исключение оператора автоматически. Play не текущая цель; перед публикацией потребуется новая проверка актуальных правил.

[NotificationListenerService](https://developer.android.com/reference/android/service/notification/NotificationListenerService) — отдельный широкий доступ к уведомлениям, выдаваемый в настройках, не эквивалент SMS API. Содержимое может быть скрыто/обрезано/сгруппировано, sender и SIM могут быть ненадёжны; отключённые уведомления лишат источника. Это не гарантированный и не предпочтительный fallback, в MVP отсутствует. Не использовать сервис как обход permissions/policies.

## Проверки только на устройстве

| Проверка | Ожидаемое доказательство | Сейчас |
| --- | --- | --- |
| Ручной `*100#` Anor, SIM 2 | текст баланса + отдельное SMS | Подтверждено описанием/образцами владельца |
| Native USSD с Anor SIM 2 | callback содержит сопоставимую сумму | Не проверено |
| READ_PHONE_STATE и CALL_PHONE | grant/deny/revoke не крашат, SIM верна | Не проверено |
| Другая SIM по умолчанию | запрос всё равно уходит Anor | Не проверено |
| Повтор/timeout/поздний callback | один commit, нет самоповтора | Не проверено |
| Нет сети, авиарежим, SIM disabled | bounded error, cache сохранён | Не проверено |
| IP-интернет выключен, сеть есть | USSD, если сеть поддерживает | Не проверено |
| Отправитель, время, multipart SMS | обезличенные варианты и задержка | Не получены |
| Главный интернет = дневной ULTRA | подтверждение смысла поля | Предварительное соответствие |
| Фон/возврат из dialer | корректное состояние без ложного успеха | Не проверено |
| Подписанный APK без Metro | запуск, persistence, update same key | Не проверено |
| Телефон друга | отдельная модель/Android/installer matrix | Не проверено |

В протоколе spike фиксировать модель, Android/One UI, app build, выбранную SIM/условия сети, timestamp и результат без номера и сырого текста в постоянных логах. Успех на одном телефоне не переносить на все Android.

## Окружение и установки

Выбран путь локальной сборки **без обязательной Android Studio и без эмулятора**. IDE нужна только по желанию для native debugging; React Native пишется в текущем редакторе. Studio на Windows не считается настроенным Android toolchain текущей Linux-среды.

При осмотре Linux найдены Git 2.56.0, Node 24.19.0, npm 11.17.0, Java runtime 25.0.4.1. `javac`, `adb`, `sdkmanager`, `studio` в PATH отсутствуют; стандартные каталоги Android SDK/Studio не найдены. Это не доказывает отсутствие установки в произвольном месте. Java runtime не равен подтверждённому совместимому JDK.

После разрешения реализации:

1. Выбрать стабильный Expo SDK/RN и сверить требования Node, JDK, minSdk, compileSdk, Build Tools/Gradle. Не считать установленную Java 25 автоматически подходящей.
2. Найти существующий подходящий JDK либо установить его; настроить JAVA_HOME для проекта, не удалять системную Java.
3. Установить Android SDK Command-line Tools, Platform Tools (`adb`), необходимые SDK Platform/Build Tools, принять лицензии. NDK/CMake — только если выбранная сборка требует. Системный Gradle не нужен: используется wrapper проекта.
4. Настроить SDK path/PATH; проверить версии и `adb devices` с разрешением отладки на телефоне. На Linux при необходимости настроить USB/udev доступ.
5. Только после этого установить зависимости будущего проекта и собрать development APK; затем отдельный release APK со встроенным JS.

SDK и Gradle caches тоже занимают место, даже без IDE; конкретный объём зависит от выбранных версий. EAS Cloud — необязательная альтернатива с отправкой исходников на сборку и отдельными условиями сервиса. Никаких установок в текущем этапе не выполнялось. [Окружение Expo](https://docs.expo.dev/get-started/set-up-your-environment/), [локальные сборки Expo](https://docs.expo.dev/build-reference/local-builds/).

## Реализация: первая итерация, 2026-11-10

Разрешение владельца получено. Создан официальный blank TypeScript проект Expo SDK 58 с React Native 0.88.1, React 19.3.0, TypeScript 6.0.3; Node 24.19.0 и Temurin JDK 17.0.21. Установлены SDK Platform 37.0 и Build Tools 37.0.0. В SDK manager платформа называется `platforms;android-37.0` (вариант без `.0` не найден). Gradle wrapper создан Expo, вручную системный Gradle не устанавливался.

Expo Dev Client добавлен для будущего native-модуля; Safe Area Context — для системных отступов; Expo System UI — для светлой native-темы. Zustand/AsyncStorage/Jest пока не добавлены: нет состояния, хранения или бизнес-логики для тестирования. Выбраны system font и StyleSheet, без анимаций/blur/UI kit.

В shell агента JAVA_HOME/PATH из пользовательского `.bashrc` не подхватываются автоматически: для сборки явно задаются JAVA_HOME и ANDROID_HOME. В обычном пользовательском терминале JDK/adb уже настроены. ADB агентом проверен с доступом вне песочницы: телефон сейчас не подключён; владелец подключит его позже. Нативная установка/запуск и плавность ещё не проверены.

TypeScript (`npm run typecheck`), упаковка JS (`npx expo export --platform android`) и online-проверка зависимостей (`npm run check:dependencies`) прошли. JS bundle создан Hermes, около 1.6 MB; это не размер APK и не измерение памяти/производительности. Исходный manifest содержит allowBackup=false и исключения camera/audio/storage/overlay, без telephony/SMS permissions. Финальный merged manifest проверяется после native build.

Подтверждено конфигурацией первого Gradle build: minSdk 24, compileSdk 37, targetSdk 36, Build Tools 37.0.0, NDK 27.1.12297006, Kotlin plugin 2.2.10, Gradle 9.4.1. Android 12 целевого телефона выше минимального API; это совместимость версий, а не подтверждение USSD или производительности. NDK устанавливается Gradle при первой сборке.

## Прерывание первой сборки и снижение нагрузки

Первая native-сборка прервана аварийным выключением ноутбука по сообщению владельца (RAM заполнена, высокая CPU-нагрузка). APK не создан; запуск на телефоне не выполнен. После reboot процессов Gradle/Kotlin не найдено, MemAvailable ~6.8 GiB из 16 GiB, zram 8 GiB. Точный источник пикового расхода по логам не установлен.

Добавлены `scripts/build-android.sh` и `plugins/withLimitedBuildResources.js`. Повторная сборка автоматически не запускалась. Проверено без компиляции: Expo introspection выдаёт worker=1, parallel=false, daemon=false, Kotlin in-process и heap=1536 MiB. Лёгкий процесс в systemd scope подтвердил реальные cgroup значения memory.high=3221225472, memory.max=4294967296, cpu.max=150000/100000. Это ограничивает всё дерево сборки; исключает прежнее неограниченное потребление CPU/памяти сборкой, но не является успешной проверкой APK. Если 4 GiB недостаточно, сначала оценить ошибку/облачную сборку, не повышать лимит автоматически.

## Повторная сборка, 2026-11-11

Владелец явно разрешил повторную попытку. Запущена через `npm run build:android` с systemd-лимитами; фактический scope подтвердил MemoryMax=4 GiB, MemoryHigh=3 GiB, CPUQuota=150%, на этапе настройки потреблял около 1 GiB. Вчерашние Gradle-плагины переиспользуются из cache.

Исправлены два источника лишней работы: команда `prebuild:android` переименована в `generate:android`, поскольку npm трактовал её как автоматический pre-hook для `build:android`. В wrapper добавлен `--no-clean`: в установленном Expo SDK 58 prebuild по умолчанию пересоздаёт native-каталоги; существующий проект нужно обновлять без удаления build intermediates. Изменения относятся к последующим запускам, текущая компиляция не перезапущена.

### Результат повторной попытки

2026-11-11: `BUILD SUCCESSFUL in 18m 18s`, 483 actionable tasks (451 executed, 32 up-to-date). APK `android/app/build/outputs/apk/debug/app-debug.apk`, 90,498,966 bytes, v0.1.0 / versionCode 1 / package tj.anorbalance.app. aapt подтвердил minSdk 24, targetSdk 36 и имя Anor Balance; внутри две ARM ABI. apksigner verify: подпись v2 корректна. Во время замеров scope использовал ~1–3 GiB RAM; ограничения 3/4 GiB и CPU 150% проверены. После завершения Gradle неактивен, MemAvailable ~6.9 GiB. Предупреждение о JVM Metaspace не привело к ошибке; лимиты не повышались.

В дальнейшем wrapper вызывает `:app:assembleDebug`, а не неквалифицированную `assembleDebug`: вторая также запускала отдельную упаковку AAR библиотек после готовности APK. Новую полную сборку ради изменения селектора задач не запускали.

Проверка финального APK: нет CALL_PHONE/READ_PHONE_STATE/READ_SMS/RECEIVE_SMS/CAMERA/RECORD_AUDIO. При этом debug-manifest Expo Dev Client добавил SYSTEM_ALERT_WINDOW, несмотря на blockedPermissions основного manifest; также присутствуют INTERNET, VIBRATE, сетевые/multicast permissions и собственная non-exported receiver permission. Это debug-инструменты, приложением доступ к overlay не запрашивается. До release необходимо отдельно подтвердить чистый release manifest и убрать ненужные доступы; не считать эту dev-сборку окончательной проверкой минимальных разрешений.

Запуск на устройстве, внешний вид и производительность ещё не проверены. USSD и SMS логика отсутствуют.

### Подтверждения владельца при первом запуске

APK установлен через adb, установка вернула Success; USB reverse 8081 подключил Metro, MainActivity успешно стартовала. Владелец просмотрел приложение и подтвердил появление новой темы после Fast Refresh. Скриншот Dashboard и измерение плавности не являются завершёнными проверками; в системе параллельно открывались другие экраны телефона, поэтому личные снимки не сохраняются в проекте.

Владелец уточнил sender **AnorINFO** и задержку тарифного SMS до нескольких минут, при быстром USSD-балансе. Зафиксированная текущая ситуация «после *100# значения не меняются» ожидаема для dialer fallback: app не получает его текст. Кнопка переименована в «Открыть *100#», чтобы не обещать автоматическое чтение. `Linking.openURL('tel:*100%23')` открывается только по действию пользователя; не запускается CALL_PHONE, не читаются SMS, не меняются timestamps при возврате.

Следующая интеграционная итерация — локальный Kotlin Expo Module с sendUssdRequest и точным parser наблюдавшегося ответа. Она потребует обновлённого APK; новую тяжёлую сборку автоматически не запускать. SMS сначала импортируется вручную; sender allowlist AnorINFO сам по себе не предоставляет Android permission и не подтверждает номер/подписку вставленного текста.

Тема текущего installed APK первоначально native light-only. Для текущего preview runtime Appearance.setColorScheme('auto') снимает override и следует системной теме; app.json теперь automatic для следующей явно разрешённой сборки. Ручной выбор темы использует тот же публичный API. [React Native Appearance](https://reactnative.dev/docs/appearance), [Linking](https://reactnative.dev/docs/linking).

## Реальная интеграция, новая итерация 2026-11-11

Владелец подтвердил *104# для тарифа/пакетов; *100# возвращает только баланс. Native allowlist обновлён. Модуль использует sendUssdRequest на выбранном subscriptionId, CALL_PHONE + READ_PHONE_STATE по действию пользователя. Один pending request, 30-секундный timeout, late callback ignored, завершение Promise exactly once. Тайм-аут не отменяет modem session: автоматический следующий запрос после transport error запрещён.

RECEIVE_SMS запрашивается отдельным переключателем с объяснением широкого системного доступа. Dynamic receiver фильтрует AnorINFO, собирает multipart, передаёт subscriptionId и даты; не запрашивает READ_SMS и не пишет raw body. JS применяет событие только для выбранной SIM при foreground/opt-in, защищается от дублей и более старого timestamp SMS. При отсутствии subId автоматическое применение не выполняется. Если app закрыто/в фоне, SMS надо вставить вручную; нет обещаний фонового приёма.

Хранилище — AtomicFile в noBackupFilesDir через отдельный Expo Module. Снимок содержит только остатки, источник/время, тариф, локальное expiry и выбранную подписку; raw SMS/имя приветствия не сохраняются. При ошибке записи UI сообщает, что текущие значения могут не сохраниться.

До сборки: TypeScript прошёл; 36 Jest tests прошли; autolinking обнаружил оба native class. Это не заменяет Kotlin-компиляцию/проверку carrier callback. Владелец явно поручил собрать APK без дополнительных проверок; build запущен через wrapper, Metro остановлен. CPUQuota повышен пользователем до 800%, RAM cap 4 GiB сохранён. Итог компиляции и работы на устройстве фиксируются отдельно.

### Результат новой сборки

Нативная сборка успешно завершилась: BUILD SUCCESSFUL in 1m 58s, 357 задач (55 выполнено, 302 из cache). Оба Anor native modules включены, Kotlin скомпилирован. Дополнительные проверки после прямой просьбы владельца не запускались. Следующий шаг — обновление на A12, выдача runtime permissions пользователем, выбор SIM 2 и реальная проверка 100/104; успех оператора ещё не подтверждён.

Обновление APK установлено через adb install -r: Success. MainActivity запускается через USB Metro. Разрешения выдаёт пользователь в UI; agent не выдавал grants через adb и не отправлял USSD автоматически. Следующий пользовательский сценарий: выбрать SIM 2, разрешить Phone при проверке баланса, включить opt-in SMS для AnorINFO и выполнить 100/104.

### Подтверждение владельца, 2026-11-11

После установки нового APK и инструкции настройки владелец сообщил: «всё работает идеально», ответы приходят быстро. Это пользовательское подтверждение основного сценария на A12 / Android 12 / Anor SIM 2. Численные времена не измерялись; отдельная матрица отказа permissions, background, смены SIM, killed process и других устройств этим сообщением не закрывается. Ранее наблюдавшаяся задержка SMS до нескольких минут остаётся допустимым сценарием; ожидание/late SMS не удалять и не сокращать по одной быстрой проверке.

### Итерация Anor Mobi 2026-11-11

Добавлен manifest receiver AnorSmsReceiver для доставки AnorINFO при закрытом JS/process. Permission RECEIVE_SMS прежний и запрашивается только переключателем. Receiver защищён BROADCAST_SMS, фильтрует sender/subscription, сохраняет известные поля через goAsync/IO executor; постоянно работающего сервиса нет. При открытии JS забирает очередь, записывает снимок/историю и подтверждает обработанные IDs. UI не вызывает Android API. Foreground динамический receiver остаётся быстрым callback, дубли отбрасываются timestamp. После Android force-stop нужен ручной запуск приложения. Проверить на A12 Android 12: Home/закрытие процесса во время ожидания SMS; затем открыть и сравнить время/остатки/единственную запись истории; другая SIM/отключённый opt-in не меняют данные. Реальный background сценарий пока не подтверждён.

Сборка без Metro: `npm run build:android -- --standalone`, тот же systemd wrapper и RAM cap. APK: android/app/build/outputs/apk/release/app-release.apk. Частная тестовая подпись совместима с установленным debug APK; не считать ключ production signing. Для сборки телефон не требуется.

Источники Android, проверены 2026-11-11: [BroadcastReceiver/goAsync](https://developer.android.com/reference/android/content/BroadcastReceiver.html) — завершение короткой работы через PendingResult.finish, ограниченное время жизни receiver; [stopped packages](https://developer.android.com/reference/android/content/Intent#ACTION_PACKAGE_RESTARTED) — после force stop нужен явный запуск. Metro maxWorkers=1 закреплён в metro.config.js также для встроенного release bundle, не только команды dev server.

Результат 2026-11-11: автономная assembleRelease завершилась BUILD SUCCESSFUL за 8m 1s (609 tasks). TypeScript и 45 Jest tests прошли перед сборкой; Kotlin receiver скомпилирован. Копия частного APK: dist/Anor-Mobi-0.2.0.apk (~36 MiB). Ручная проверка фоновой доставки/темы на A12 не подменяется этими результатами.
Установка на A12 ([серийный номер скрыт], Android 12): adb install -r вернул Success; MainActivity открыта, am start Status: ok. Reverse tcp:8081 отсутствует — для standalone не нужен. Визуальная проверка/реальное получение фонового SMS остаются за владельцем.

2026-11-11, версия 0.3.0 (расход/прогноз): по прямому разрешению владельца `npm run build:android -- --standalone` завершилась BUILD SUCCESSFUL за 54s, 609 tasks: 36 executed, 573 up-to-date. Native и permissions не менялись. APK: dist/Anor-Mobi-0.3.0.apk. TypeScript и 60 Jest tests прошли до сборки; накопление реальных наблюдений для прогноза проверяется отдельно на устройстве.
Установка 0.3.0 на A12 Android 12: adb install -r вернул Success, обновление выполнено без удаления данных. Реальный расход/прогноз потребует новых проверок с контекстом пакета; 60 unit tests не заменяют наблюдение в течение суток.

### Автовыбор SIM — 2026-11-12, подготовка 0.3.1

getSubscriptions дополняет список полями carrierName, operatorName (SPN) и isDefaultVoice. Публичные [SubscriptionManager.getDefaultVoiceSubscriptionId](https://developer.android.com/reference/android/telephony/SubscriptionManager#getDefaultVoiceSubscriptionId()) и [TelephonyManager.getSimOperatorName](https://developer.android.com/reference/android/telephony/TelephonyManager#getSimOperatorName()) проверены 2026-11-12. Новых разрешений нет. Expo AsyncFunction читает metadata и возвращает JSON; существующий request callback/main-looper/timeout/lifecycle не менялся. JS application service выбирает subscription, синхронизирует receiver и отправляет allowlisted код только по кнопке. UI не обращается к Android API.

Ручная матрица на A12 Android 12 для нового APK: Anor SIM2/default calls SIM1 → запрос с Anor; Anor отсутствует → default voice; две SIM без default → ручной выбор, без запроса; manual SIM сохраняется после перезапуска; auto на той же SIM сохраняет историю; смена SIM не смешивает счета, позднее SMS старой subscription не применяется. Никаких автоматических USSD для проверки агент не отправляет. Новый native код ещё не собран/не подтверждён на телефоне. TypeScript и 85 Jest tests прошли.

### Сборка 0.3.2 — 2026-11-12

После прямого поручения владельца семь акцентных цветов и шестерёнка добавлены вместе с исправлениями роста МБ/авто SIM. TypeScript и 92 Jest tests прошли. Штатная автономная сборка завершилась BUILD SUCCESSFUL за 1m 15s, 609 tasks: 54 executed, 555 up-to-date. Native изменения метаданных SIM и preferences скомпилированы. APK: dist/Anor-Mobi-0.3.2.apk. Результаты установки/копирования отмечаются отдельно; автоматических USSD для проверки не выполняем.
Установка 0.3.2 на подключённый Samsung A12 / Android 12: adb install -r вернул Success, MainActivity — Status: ok. Готовый APK также скопирован в /sdcard/Download/Anor-Mobi-0.3.2.apk (36 915 745 bytes); SHA-256 телефона и dist-копии совпал. Проверки реального carrierName/default voice, сохранения выбранного цвета после перезапуска и поведения SMS остаются ручными, USSD агент не отправлял.

### Версия 0.4 — 2026-11-12

Каталог шести основных тарифов проверен по https://anor.mobi/ 2026-11-12 (подробности TARIFFS.md). Native extractor принимает подтверждённые числовые поля частично; неподдерживаемые единицы не превращаются в значения. Snapshot v6 хранит последние данные каждого тарифа, selector не выполняет операторский переход. При реальном новом периоде старые недостающие поля не копируются в активные; архив остаётся.

TypeScript и 114 Jest tests прошли. Разрешённая сборка `npm run build:android -- --standalone` завершилась BUILD SUCCESSFUL за 1m 4s, 609 tasks: 48 executed, 561 up-to-date. Копия APK — dist/Anor-Mobi-0.4.0.apk. Проверить вручную на A12: открытие/закрытие настроек (включая быстрый повтор), Reduce Motion, selector/прокрутку, 15→35→15 с сохранением значений/времени, историю других тарифов и их поля. Mock aliases других планов не подтверждают реальные SMS оператора.
Доставка 0.4 на Samsung A12 / Android 12: adb install -r — Success; MainActivity — Status: ok. /sdcard/Download/Anor-Mobi-0.4.0.apk скопирован, 36 928 641 байт; SHA-256 совпал с локальным dist-файлом. Визуальная оценка анимаций и новые реальные тарифные SMS остаются ручными; USSD агент не отправлял.
