import { useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PackageCard, updatedLabel } from '../components/PackageCard';
import { RefreshButton } from '../components/RefreshButton';
import { DeliveryStatus } from '../components/DeliveryStatus';
import { InternetUsageCard } from '../components/InternetUsageCard';
import { SettingsSheet } from '../components/SettingsSheet';
import { TariffSelector } from '../components/TariffSelector';
import { HistorySheet } from '../components/HistorySheet';
import { useFreshnessClock } from '../hooks/useFreshnessClock';
import { SmsImportSheet } from '../components/SmsImportSheet';
import { dashboardDemo } from '../demo/dashboardDemo';
import { tariffView, visiblePackageKeys } from '../domain/tariffView';
import { tariffs, type PackageKey } from '../domain/account';
import { useAccount } from '../hooks/useAccount';
import { accentOptions, getPalette, type Accent, type Palette, type ThemePreference } from '../theme/tokens';

type Props = { accent: Accent; onAccentChange: (value: Accent) => void; themeError: string | null; colors: Palette; preference: ThemePreference; onPreferenceChange: (value: ThemePreference) => void };
const themes: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'Система' }, { value: 'light', label: 'Светлая' }, { value: 'dark', label: 'Тёмная' },
];
const moneyFormat = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function DashboardScreen({ colors, preference, onPreferenceChange, themeError, accent, onAccentChange }: Props) {
  useFreshnessClock();
  const [historyVisible, setHistoryVisible] = useState(false);
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [importVisible, setImportVisible] = useState(false);
  const [preview, setPreview] = useState(false);
  const [lastAction, setLastAction] = useState<'balance' | 'packages' | 'all' | null>(null);
  const { state, controller, nativeAvailable } = useAccount();
  const account = state.account;
  const selectedSim = state.sims.find((sim) => sim.subscriptionId === account.subscriptionId);
  const disabled = preview || state.busy || !state.hydrated || !nativeAvailable;
  const packagesWaiting = state.packageStatus.stage === 'waiting-sms' || state.packageStatus.stage === 'manual-import';
  const balance = preview ? dashboardDemo.balance : account.balance ? moneyFormat.format(account.balance.value / 100) : '—';
  const profile = account.tariffId ? tariffs[account.tariffId] : null;
  const view = tariffView(account);
  const visibleKeys = visiblePackageKeys(preview ? null : account.tariffId);
  function refresh(target: 'balance' | 'packages' | 'all') {
    setLastAction(target);
    void controller.refresh(target);
  }
  function card(key: PackageKey, label: string, unit: string, compact = false) {
    const reading = view.packages[key];
    const demo = dashboardDemo.packages[key];
    return <PackageCard key={key} colors={colors} preview={preview} compact={compact} warnWhenLow={key === 'day' || key === 'night'} label={label} unit={unit}
      remaining={preview ? demo.remaining : reading?.value ?? null}
      total={preview ? demo.total : profile && (account.comparisonReady || reading === null) && (key !== 'day' || profile.internetFieldComparable) ? profile.limits[key] : null}
      unlimited={!preview && key === 'night' && profile?.nightUnlimited}
      note={!preview && profile ? key === 'night' && profile.nightUnlimited ? 'По условиям тарифа — ночной безлимит' : key === 'day' && !profile.internetFieldComparable && profile.limits.day !== null ? 'В тарифе есть отдельный трафик для приложений' : undefined : undefined}
      updatedAt={preview ? dashboardDemo.updatedAt : reading?.updatedAt ?? null} source={preview ? undefined : reading?.source} />;
  }
  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View style={styles.brand}><Image source={require('../../assets/brand/mark-96.png')} style={styles.brandImage} accessible={false} /><Text style={styles.wordmark}>Anor<Text style={styles.wordmarkSuffix}> Mobi</Text></Text></View>
          <Pressable accessibilityRole="button" accessibilityLabel="Настройки" onPress={() => setSettingsVisible(true)} style={({ pressed }) => [styles.settingsButton, pressed && styles.pressed]}><Image source={require('../../assets/icons/settings.png')} style={[styles.settingsImage, { tintColor: colors.secondary }]} accessible={false} /></Pressable>
        </View>
        {preview && <View style={styles.previewBanner}><Text style={styles.previewTitle}>Пример данных</Text><Text style={styles.previewCopy}>Эти значения не связаны с вашим номером. Запросы отключены.</Text></View>}
        {!nativeAvailable && !preview && <View style={styles.previewBanner}><Text style={styles.previewTitle}>Нужна обновлённая сборка</Text><Text style={styles.previewCopy}>В установленном APK ещё нет USSD-модуля. Импорт SMS доступен уже сейчас.</Text></View>}
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <Text style={styles.eyebrow}>БАЛАНС СЧЁТА</Text>
            <RefreshButton label="Обновить баланс через *100#" colors={colors} disabled={disabled} loading={state.balanceStatus.stage === 'waiting-ussd'} onPress={() => refresh('balance')} />
          </View>
          <View style={styles.balanceRow} accessible accessibilityLabel={`Баланс: ${balance} сомони${preview ? ', пример' : ''}`}><Text style={styles.balance}>{balance}</Text><Text style={styles.currency}>сомони</Text></View>
          <Text style={styles.timestamp}>{updatedLabel(preview ? dashboardDemo.updatedAt : account.balance?.updatedAt ?? null, preview)}</Text>
          {!preview && <View style={styles.nearbyStatus}><DeliveryStatus label="" status={state.balanceStatus} colors={colors} />{state.error && lastAction === 'balance' && <Text style={styles.inlineError}>{state.error}</Text>}</View>}
          <View style={styles.accountLine}><Text style={styles.accountLabel}>Anor</Text><View style={styles.accountDot} /><Text style={styles.accountMeta}>{preview ? 'ДИЁР ULTRA · пример' : account.tariffSelection === 'manual' && profile ? `${profile.name} · вручную` : account.tariffName ?? profile?.name ?? 'Тариф пока не получен'}</Text></View>
          {!preview && <Text style={styles.timestamp}>{account.simSelection === 'auto' ? 'SIM: автоматически' : 'SIM: вручную'}{selectedSim ? ` · слот ${selectedSim.slotIndex + 1}` : ''}</Text>}
          {!preview && view.expiresLocal && <Text style={styles.timestamp}>{view.historical ? 'Сохранённый пакет до' : 'Пакет до'} {view.expiresLocal.replace('T', ' ')}</Text>}
        </View>
        <View style={styles.sectionHeader}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>Остатки пакетов</Text>
          <RefreshButton label="Запросить пакеты через *104#" colors={colors} disabled={disabled || packagesWaiting} loading={state.packageStatus.stage === 'waiting-ussd'} waiting={packagesWaiting} onPress={() => refresh('packages')} />
        </View>
        {!preview && <View style={styles.packageInlineStatus}><DeliveryStatus label="" status={state.packageStatus} colors={colors} />{state.error && lastAction !== 'balance' && <Text style={styles.inlineError}>{state.error}</Text>}</View>}
        {!preview && view.historical && <Text style={styles.requestHint}>Сохранённые данные выбранного тарифа. Запрос обновляет действующий тариф SIM; выбор в приложении его не меняет.</Text>}
        <View style={styles.cards}>
          {visibleKeys.includes('day') && card('day', 'Интернет', 'МБ')}
          {visibleKeys.includes('night') && card('night', 'Ночной интернет', 'МБ')}
          {visibleKeys.includes('minutes') && card('minutes', 'Минуты', 'мин', true)}
          {visibleKeys.includes('sms') && card('sms', 'Сообщения', 'SMS', true)}
        </View>
        {!preview && !view.historical && (!profile || profile.limits.day !== null || profile.limits.night !== null) && <InternetUsageCard account={account} nightUnlimited={profile?.nightUnlimited} colors={colors} now={Date.now()} />}
        <Pressable accessibilityRole="button" disabled={disabled || packagesWaiting} accessibilityState={{ disabled: disabled || packagesWaiting }} onPress={() => refresh('all')} style={({ pressed }) => [styles.checkButton, disabled && styles.disabled, pressed && styles.pressed]}><Image source={require('../../assets/icons/refresh.png')} accessible={false} style={[styles.checkImage, { tintColor: colors.background }]} /><Text style={styles.checkButtonText}>{state.busy ? 'Запрос выполняется…' : packagesWaiting ? 'Ожидаем SMS AnorINFO…' : 'Проверить всё'}</Text></Pressable>
        <Pressable accessibilityRole="button" disabled={preview} onPress={() => setImportVisible(true)} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>Вставить SMS AnorINFO</Text></Pressable>
        <Text style={styles.requestHint}>{preview ? 'Запросы отключены в режиме примера.' : state.smsListening ? 'Баланс приходит сразу. SMS с пакетами может задержаться на несколько минут. Автоприём работает и при закрытом приложении; новые остатки появятся при открытии.' : 'Для автоприёма новых SMS включите разрешение в настройках. История SMS не читается; можно вставить сообщение вручную.'}</Text>
        {state.storageError && <Text style={styles.requestNote}>Не удалось сохранить данные. Они доступны до закрытия приложения.</Text>}
        <Pressable accessibilityRole="button" onPress={() => setHistoryVisible(true)} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>История обновлений</Text></Pressable>
        <Text style={styles.footer}>Неофициальное приложение · данные на устройстве</Text>
      </ScrollView>
      <SettingsSheet visible={settingsVisible} colors={colors} onClose={() => setSettingsVisible(false)}>
        <ScrollView contentContainerStyle={styles.sheetContent}>
          <View style={styles.sheetHeader}><Text accessibilityRole="header" style={styles.sectionTitle}>Настройки</Text><Pressable accessibilityRole="button" accessibilityLabel="Закрыть настройки" onPress={() => setSettingsVisible(false)} style={styles.closeButton}><Text style={styles.closeText}>×</Text></Pressable></View>
          <Text style={styles.settingLabel}>ОФОРМЛЕНИЕ</Text>
          <View style={styles.themeChoices}>{themes.map((theme) => <Pressable key={theme.value} accessibilityRole="radio" accessibilityState={{ checked: preference === theme.value }} onPress={() => onPreferenceChange(theme.value)} style={[styles.themeChoice, preference === theme.value && styles.themeSelected]}><Text style={[styles.themeText, preference === theme.value && styles.themeSelectedText]}>{theme.label}</Text></Pressable>)}</View>
          <Text style={styles.settingLabel}>АКЦЕНТНЫЙ ЦВЕТ</Text>
          <View style={styles.accentChoices}>{accentOptions.map((option) => <Pressable key={option.value} accessibilityRole="radio" accessibilityLabel={option.label} accessibilityState={{ checked: accent === option.value }} onPress={() => onAccentChange(option.value)} style={[styles.accentChoice, { borderColor: accent === option.value ? colors.accent : colors.border, backgroundColor: accent === option.value ? colors.accentTint : colors.background }]}><View style={[styles.accentSwatch, { backgroundColor: getPalette('light', option.value).accent }]} /><Text style={[styles.accentLabel, { color: accent === option.value ? colors.accent : colors.secondary }]}>{option.label}</Text></Pressable>)}</View>
          {themeError && <Text accessibilityRole="alert" style={styles.requestNote}>{themeError}</Text>}
          <Text style={styles.settingLabel}>SIM ДЛЯ ANOR</Text>
          <Pressable accessibilityRole="radio" accessibilityState={{ checked: account.simSelection === 'auto', disabled: state.busy }} disabled={!nativeAvailable || state.busy || !state.hydrated} onPress={() => controller.chooseAutoSim()} style={[styles.simRow, account.simSelection === 'auto' && styles.themeSelected]}><Text style={[styles.themeText, account.simSelection === 'auto' && styles.themeSelectedText]}>Автоматически · Anor → SIM по умолчанию</Text></Pressable>
          <Pressable accessibilityRole="button" disabled={!nativeAvailable || state.busy} onPress={() => controller.loadSims()} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>Найти SIM-карты</Text></Pressable>
          {state.sims.map((sim) => <Pressable key={sim.subscriptionId} accessibilityRole="radio" disabled={state.busy} accessibilityState={{ checked: account.simSelection === 'manual' && account.subscriptionId === sim.subscriptionId, disabled: state.busy }} onPress={() => controller.chooseSim(sim.subscriptionId)} style={[styles.simRow, account.simSelection === 'manual' && account.subscriptionId === sim.subscriptionId && styles.themeSelected]}><Text style={[styles.themeText, account.simSelection === 'manual' && account.subscriptionId === sim.subscriptionId && styles.themeSelectedText]}>SIM {sim.slotIndex + 1} · {sim.displayName || 'Без названия'}</Text></Pressable>)}
          <Text style={styles.settingHint}>По умолчанию ищем Anor по имени оператора, иначе используем SIM для звонков по умолчанию. Можно выбрать SIM вручную. Данные разных SIM не смешиваются.</Text>
          <View style={styles.demoSetting}><View style={styles.demoSettingText}><Text style={styles.demoLabel}>Автоприём AnorINFO</Text><Text style={styles.settingHint}>Новые SMS выбранной SIM, включая фон. Тексты не сохраняются. Android запросит разрешение.</Text></View><Switch accessibilityLabel="Автоприём SMS AnorINFO" disabled={!nativeAvailable} value={account.autoSms} onValueChange={(value) => controller.enableSms(value)} trackColor={{ false: colors.track, true: colors.accent }} /></View>
          <Text style={styles.settingLabel}>ТАРИФ</Text>
          <TariffSelector colors={colors} selected={account.tariffId} mode={account.tariffSelection} observedName={account.tariffName} disabled={!state.hydrated} onSelect={(id) => controller.chooseTariff(id)} onAuto={() => controller.chooseAutoTariff()} />
          <View style={styles.demoSetting}><View style={styles.demoSettingText}><Text style={styles.demoLabel}>Показать пример</Text><Text style={styles.settingHint}>Синтетические числа, отдельно от вашей SIM.</Text></View><Switch accessibilityLabel="Показать демонстрационные данные" value={preview} onValueChange={setPreview} trackColor={{ false: colors.track, true: colors.accent }} /></View>
          {state.error && <Text style={styles.requestNote}>{state.error}</Text>}
          <Text style={styles.aboutTitle}>Anor Mobi · 0.4</Text><Text style={styles.settingHint}>Независимое приложение, не связано с оператором Anor.</Text>
        </ScrollView>
      </SettingsSheet>
      <HistorySheet visible={historyVisible} colors={colors} entries={account.history} snapshots={account.tariffSnapshots} onClose={() => setHistoryVisible(false)} onClear={() => controller.clearHistory()} />
      <SmsImportSheet visible={importVisible} colors={colors} contextId={account.subscriptionId} onClose={() => setImportVisible(false)} onCommit={(text) => { controller.importSms(text); }} />
    </SafeAreaView>
  );
}

function createStyles(c: Palette) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.background },
    content: { width: '100%', maxWidth: 560, alignSelf: 'center', paddingHorizontal: 22, paddingTop: 8, paddingBottom: 24 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
    brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    brandImage: { width: 32, height: 32, borderRadius: 8 },
    settingsImage: { width: 24, height: 24 },
    checkImage: { width: 20, height: 20 },
    nearbyStatus: { marginTop: 10 },
    packageInlineStatus: { marginTop: -4, marginBottom: 15 },
    inlineError: { color: c.warning, fontSize: 12, lineHeight: 19, marginTop: 6 },
    wordmark: { color: c.text, fontSize: 23, fontWeight: '700', letterSpacing: -1 },
    wordmarkAccent: { color: c.accent },
    wordmarkSuffix: { fontWeight: '400' },
    settingsButton: { width: 48, height: 48, justifyContent: 'center', alignItems: 'flex-end' },
    settingsIcon: { color: c.secondary, fontSize: 21, letterSpacing: 2 },
    pressed: { opacity: 0.6 }, disabled: { opacity: 0.45 },
    previewBanner: { backgroundColor: c.accentTint, borderRadius: 12, padding: 14, gap: 4, marginBottom: 20 },
    previewTitle: { color: c.accent, fontSize: 13, fontWeight: '600' },
    previewCopy: { color: c.secondary, fontSize: 12, lineHeight: 18 },
    hero: { paddingBottom: 24, borderBottomColor: c.border, borderBottomWidth: StyleSheet.hairlineWidth },
    heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    eyebrow: { color: c.secondary, fontSize: 11, fontWeight: '600', letterSpacing: 1.5 },
    refresh: { width: 48, height: 48, borderRadius: 24, backgroundColor: c.surface, justifyContent: 'center', alignItems: 'center' },
    refreshIcon: { color: c.accent, fontSize: 29, lineHeight: 34 },
    balanceRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: 10, marginTop: 3, marginBottom: 4 },
    balance: { color: c.text, fontSize: 64, fontWeight: '400', letterSpacing: -2.5, fontVariant: ['tabular-nums'] },
    currency: { color: c.secondary, fontSize: 17 },
    timestamp: { color: c.muted, fontSize: 12, lineHeight: 19 },
    accountLine: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: 8, marginTop: 22 },
    accountLabel: { color: c.text, fontSize: 13, fontWeight: '600' },
    accountDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: c.muted },
    accountMeta: { color: c.secondary, fontSize: 12 },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8, marginTop: 25, marginBottom: 15 },
    sectionTitle: { color: c.text, fontSize: 20, fontWeight: '600', letterSpacing: -0.5 },
    sectionCaption: { color: c.muted, fontSize: 11 },
    secondaryButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', padding: 12 },
    secondaryButtonText: { color: c.accent, fontSize: 14, fontWeight: '600' },
    simRow: { padding: 14, minHeight: 48, borderRadius: 10, backgroundColor: c.background },
    cards: { gap: 12 }, twoColumns: { flexDirection: 'row', gap: 12 },
    updateStatus: { gap: 10, marginTop: 24, paddingHorizontal: 2 },
    statusRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', columnGap: 10, rowGap: 4 },
    statusLabel: { color: c.secondary, fontSize: 12 },
    statusValue: { color: c.text, fontSize: 12, fontWeight: '500' },
    checkButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, minHeight: 52, padding: 12, borderRadius: 14, backgroundColor: c.accent, marginTop: 22 },
    checkIcon: { color: c.background, fontSize: 24, lineHeight: 27 },
    checkButtonText: { color: c.background, fontSize: 15, fontWeight: '700' },
    requestHint: { color: c.secondary, fontSize: 12, lineHeight: 19, marginTop: 11 },
    requestNote: { color: c.text, fontSize: 13, lineHeight: 20, marginTop: 12 },
    footer: { color: c.muted, fontSize: 10, textAlign: 'center', lineHeight: 16, marginTop: 28 },
    modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#00000080' },
    sheet: { backgroundColor: c.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '90%' },
    sheetContent: { padding: 24, gap: 12 },
    sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    closeButton: { minWidth: 48, minHeight: 48, alignItems: 'flex-end', justifyContent: 'center' },
    closeText: { color: c.secondary, fontSize: 30 },
    settingLabel: { color: c.secondary, fontSize: 11, letterSpacing: 1.1, fontWeight: '600' },
    accentChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    accentChoice: { minHeight: 68, width: '30%', flexGrow: 1, maxWidth: '34%', borderRadius: 12, borderWidth: 1, padding: 8, alignItems: 'center', justifyContent: 'center', gap: 6 },
    accentSwatch: { width: 24, height: 24, borderRadius: 12 }, accentLabel: { fontSize: 11, fontWeight: '500', textAlign: 'center' },
    themeChoices: { flexDirection: 'row', backgroundColor: c.background, borderRadius: 12, padding: 4, gap: 3 },
    themeChoice: { flex: 1, minHeight: 46, justifyContent: 'center', alignItems: 'center', borderRadius: 9, padding: 4 },
    themeSelected: { backgroundColor: c.text },
    themeText: { color: c.secondary, fontSize: 13, fontWeight: '500' },
    themeSelectedText: { color: c.background },
    settingHint: { color: c.secondary, fontSize: 12, lineHeight: 19 },
    demoSetting: { flexDirection: 'row', alignItems: 'center', gap: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border, paddingTop: 20, marginTop: 8 },
    demoSettingText: { flex: 1, gap: 5 }, demoLabel: { color: c.text, fontSize: 15 },
    aboutTitle: { color: c.text, fontSize: 13, fontWeight: '600', marginTop: 20 },
  });
}
