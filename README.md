# Anor Mobi · 0.4

Неофициальное Android-приложение для баланса и пакетов Anor. Каждый экземпляр работает локально, без сервера, аккаунтов, аналитики и облачной синхронизации. Личный проект, целевой телефон — Samsung A12 / Android 12 / Helio P35.

## Возможности

- Баланс через `*100#`, остатки и тариф через `*104#`/AnorINFO, только по кнопке пользователя.
- Автовыбор SIM Anor по операторскому имени, иначе системная SIM для звонков; ручной режим остаётся в настройках.
- Раздельные статусы ответа и время обновления каждого показателя; старые данные сохраняются при ошибках.
- Добровольный приём новых AnorINFO в foreground и фоне, без чтения истории SMS. Ручная вставка доступна без разрешения.
- Системная/светлая/тёмная тема, семь сохранённых акцентных цветов и лёгкое открытие/закрытие настроек с учётом Reduce Motion.
- Все шесть основных тарифов, опубликованных на [официальном сайте Anor](https://anor.mobi/) на 2026-11-12: ULTRA, LITE, Диёр 55, 45, 35 и 15. Автоопределение по названию в SMS и ручной селектор; выбор в приложении **не подключает тариф у оператора**.
- Карточки зависят от тарифа. Неизвестный объём не превращается в ноль; безлимит помечен как условие тарифа, а трафик для приложений не смешивается с основным.
- История последних 30 ответов и отдельный последний снимок каждого тарифа. Ручное переключение туда-обратно не удаляет данные; архивные показания обозначены и сохраняют исходное время.
- Расход интернета между проверками и приблизительный прогноз при прежнем темпе. Скачки вверх не сбрасывают расход и не считаются повторно при возврате.

## Ограничения

Прогноз требует минимум трёх замеров за сутки или дольше, свежих данных и срока пакета. При реальном пополнении без изменения срока оценка расхода консервативна. У тарифов с отдельным трафиком для приложений не выдумывается общий максимум неизвестного SMS-поля. Реальный SMS-корпус подтверждён для ULTRA; остальные названия и лимиты взяты из каталога, тесты прочих SMS-вариантов синтетические.

После Android force-stop фоновый приём возобновляется при ручном запуске. Сохранённые данные относятся только к выбранной SIM; при её смене не смешиваются с другой SIM. Снимки прежних тарифов остаются до явной очистки истории; текущий счёт при очистке сохраняется.

APK автономный, без Metro. Пока используется прежняя development signing identity для совместимого обновления установленного приложения; production signing и публикация в магазине не выполнялись. Ключи и личные данные не входят в Git.

## Разработка

Node.js 24 LTS, JDK 17, Android SDK CLI/Platform Tools; Android Studio и эмулятор необязательны. Expo SDK 58 / React Native 0.88.1 / React 19.3 / strict TypeScript. Точные версии — в package-lock.json. Native Expo-модули — в modules/, воспроизводимая конфигурация — app.json/plugins; сгенерированный android/ не коммитится. Zustand/AsyncStorage не требуются: useSyncExternalStore и небольшой AtomicFile adapter обслуживают локальное состояние.

```bash
npm ci
npm run typecheck
npm test
```

Автономный APK на Fedora/Linux с user systemd:

```bash
npm run build:android -- --standalone
```

Результат: `android/app/build/outputs/apk/release/app-release.apk`. Поддерживаемые ABI: armeabi-v7a и arm64-v8a. Передать на авторизованный телефон:

```bash
adb devices
adb install -r android/app/build/outputs/apk/release/app-release.apk
adb push android/app/build/outputs/apk/release/app-release.apk /sdcard/Download/Anor-Mobi-0.4.0.apk
```

Development APK: `npm run build:android`, затем `adb install -r android/app/build/outputs/apk/debug/app-debug.apk`. После окончания сборки — `npm start`; при USB нужен `adb reverse tcp:8081 tcp:8081`. Для отдельной генерации native-проекта — `npm run generate:android`.

## Ограничение ресурсов

После перегрузки ноутбука сборка разрешена только через scripts/build-android.sh: MemoryHigh=3 GiB, MemoryMax=4 GiB, CPUQuota=800%, nice 10. Gradle workers=1, parallel=false, Java heap 1536 MiB, Kotlin in-process; Metro maxWorkers=1. Wrapper останавливает наш Metro scope перед native build. Не запускать параллельно вторую сборку/Metro/export и не обходить wrapper. Остановить:

```bash
systemctl --user stop anor-balance-build.scope
```

Кеши SDK/Gradle/node_modules после прерывания сохраняются. Сборка не требует подключённого телефона. APK и dist/ локальны и не коммитятся.

## Документация

[Каталог тарифов и источники](docs/TARIFFS.md) · [Требования](docs/PRD.md) · [Архитектура](docs/ARCHITECTURE.md) · [Контракты](docs/DATA_MODELS.md) · [Android и проверки](docs/ANDROID_INTEGRATION.md) · [Решения](docs/DECISIONS.md) · [Безопасность](docs/SECURITY.md) · [Roadmap](docs/ROADMAP.md) · [AGENTS](AGENTS.md).
