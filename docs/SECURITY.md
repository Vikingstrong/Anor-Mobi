# Безопасность и приватность

План требований, 2026-11-10. Проверка реализации будет после её создания.

## Данные и границы доверия

Приложение неофициальное, не связано с Anor и явно сообщает это в About. Оно показывает локальные последние известные данные, не проводит платежи и не подключает услуги. Телефон владельца или друга — самостоятельный экземпляр, без сервера/аккаунта и общей базы.

Входные SMS/USSD, native payload и JSON из storage считаются недоверенными. Вредоносное/неожиданное сообщение не должно запускать команды или разрушать cache. Приёмщик сообщения и parser не исполняют ссылки, HTML и USSD из текста.

## Минимальные разрешения

MVP: CALL_PHONE только для USSD по нажатию; READ_PHONE_STATE только для явного выбора SIM. Для отказавшего пользователя остаются cache, вставка SMS и dialer. Нет READ_SMS, RECEIVE_SMS, SEND_SMS, контактов, call log, геолокации, Accessibility, background USSD, boot receiver и постоянного foreground service.

Показывать назначение разрешения до системного диалога, не выдавать обычный permission за доступ «только к Anor»: Android grants шире нашей прикладной фильтрации. Не запрашивать всё при первом запуске. Отзыв проверять перед действием; никакого молчаливого выбора другой SIM.

## Хранение

Сохранять только значения, выбранный тариф/подписку, evidence и версию схемы. Не хранить raw SMS/USSD, имя из приветствия, номер, ICCID/IMSI/IMEI и чужие сообщения. Импортируемый текст живёт в памяти до закрытия формы/commit. Не читать clipboard в фоне.

[AsyncStorage не шифрует данные самостоятельно](https://docs.expo.dev/versions/latest/sdk/async-storage/). Для ограниченного набора балансов это осознанный MVP-компромисс с app sandbox и защитой устройства; не обещать защиту от root/компрометации ОС. При добавлении секретов/номеров пересмотреть storage отдельно. Предусмотреть «Удалить локальные данные»; удаление приложения обычно удаляет app data, но не уже сделанные пользователем скриншоты/копии.

[Android Auto Backup может отправлять app data в облако](https://developer.android.com/identity/data/autobackup). Поэтому требование «только локально» включает отключение cloud backup и явные exclusion rules для storage в backup/dataExtractionRules, включая device transfer. Одного allowBackup недостаточно считать проверкой всех OEM-сценариев; проверить merged manifest и реальное поведение на целевом телефоне. Не экспортировать snapshot по умолчанию.

## Передача и логи

Нет аналитики, crash SDK с upload, удалённых конфигов и OTA-проверок обновлений в release. Все assets встроены. Проверить merged manifest и транзитивные зависимости: INTERNET может требоваться dev build для Metro, это не разрешение отправлять пользовательские данные. В release отключить ненужные сетевые механизмы; если INTERNET остаётся, документировать конкретную необходимость и проверить отсутствие трафика приложения.

USSD идёт оператору через мобильную сеть — это необходимая операция, а не отправка на сторонний сервер приложения. EAS Cloud при выборе будет получать исходники для сборки, не пользовательские SMS; реальные образцы и ключи не загружать без необходимости. По умолчанию планируется локальная сборка.

Логи содержат только requestId, безопасный error code, длительность, app/API version. Не писать полный callback/SMS, номер и приветствие; screenshot и реальные fixtures не коммитить без обезличивания. В документации сохранён обезличенный предоставленный текст, исходное изображение не копируется в docs.

## Безопасный импорт

Ограничение размера, проверка единиц/диапазонов, безопасные regex без катастрофического backtracking, раздельный разбор блоков, preview и явный commit. Неизвестное поле не превращать в ноль, бессрочность отдельной услуги не применять ко всем пакетам. Неоднозначный источник/SIM/давность → предупреждение и подтверждение. Sender allowlist при будущей автоматизации — полезный фильтр, но не криптографическое доказательство подлинности SMS.

## Распространение

Подписанный release APK со встроенным JS; ключ и пароли вне Git, резервная копия ключа у владельца. Один ключ для обновлений, увеличиваемый versionCode; отдельные debug/release сборки. Друзья получают краткое объяснение разрешений, источников данных, ручного режима и ограниченной совместимости. Не публиковать APK и не отправлять его людям без поручения.

Для SMS automation [Android hard restrictions](https://developer.android.com/reference/android/Manifest.permission#RECEIVE_SMS) и [Google Play SMS policy](https://support.google.com/googleplay/android-developer/answer/10208820) — разные ограничения. APK вне магазина не отменяет первую группу; будущее размещение в Play требует самостоятельного анализа и возможного одобрения. Юридическая допустимость для всех способов распространения здесь не установлена. Не становиться default SMS app только ради чтения остатков. Notification access — отдельный широкий риск, в MVP отсутствует.

## Проверка перед release

Проверить итоговые permissions/backup rules, отсутствие raw логов и upload, очистку данных, deny/revoke, ошибочный импорт, подписанное обновление и запуск без Metro. Ничто из этого пока не выполнено: приложения ещё нет.

## Проверка зависимостей начального проекта

2026-11-10: npm audit сообщил 5 moderate записей в цепочках Expo CLI/fingerprint → glob/minimatch (0 high/critical). Два корневых advisory: [glob](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4), [minimatch](https://github.com/advisories/GHSA-g3hv-75wg-m249). Это зависимости Node-инструментов сборки, а не реализованный SMS parser. Автоматический `npm audit fix --force` предложил переход на Expo 53 и не применялся: он ломает выбранную совместимость. Предупреждения не скрыты; пересмотреть upstream-исправление перед release.

### Проверка debug APK, 2026-11-11

Подпись APK v2 проверена apksigner. aapt не обнаружил SMS/telephony/camera/audio permissions. Debug manifest Dev Client сохранил SYSTEM_ALERT_WINDOW и служебные сетевые/multicast permissions; удаление overlay через blockedPermissions main manifest не перекрыло debug declaration. Runtime-запроса overlay в нашем коде нет. До release отдельно проверить merged release manifest; текущая development-сборка не является production security approval.

### Новый native module

Manifest нового модуля декларирует CALL_PHONE, READ_PHONE_STATE и RECEIVE_SMS; READ_SMS/SEND_SMS отсутствуют. OS grants выдаёт пользователь, права не подменяются сохранённым флагом. SMS opt-in отдельно; Android/installer может отказать — manual import остаётся. Автоприём только foreground, только AnorINFO/выбранная SIM. Никаких Accessibility/notification-listener/private telephony API.

Структурированный cache пишется атомарно в noBackupFilesDir, без raw текстов. Demo не попадает в cache. На bridge запрет произвольных USSD: только balance→*100#, packages→*104#. Нативный код нового APK ещё требует device проверки; исходное предупреждение о debug overlay остаётся применимым до проверки release manifest.

2026-11-11: background SMS receiver добавлен по прямому поручению владельца. Системный BROADCAST_SMS guard + RECEIVE_SMS runtime opt-in + exact sender AnorINFO + выбранная subscription. Сохраняются только ограниченные известные поля, не текст SMS. Очередь/снимок/история в noBackupFilesDir, до 30 ответов, лимит файлов 128 KiB. Нет фонового USSD, постоянного сервиса, READ_SMS или новых runtime permissions. Частный standalone APK пока использует development signing identity; production signing и публикация не выполнялись.
