import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Account } from '../domain/account';
import { analyzeInternetUsage, type Forecast, type UsageWindow } from '../domain/internetUsage';
import type { Palette } from '../theme/tokens';
const number = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });
const date = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
function duration(ms: number): string {
  const hours = ms / 3600000;
  return hours < 1 ? `${Math.max(1, Math.round(ms / 60000))} мин` : hours < 48 ? `${number.format(hours)} ч` : `${number.format(hours / 24)} дн`;
}
function forecastText(forecast: Forecast, now: number): { title: string; detail: string; warning: boolean } {
  switch (forecast.kind) {
    case 'empty': return { title: 'Остаток исчерпан', detail: 'По последнему ответу оператора осталось 0 МБ.', warning: true };
    case 'enough': return { title: 'При таком расходе хватит до конца пакета', detail: `В среднем ${number.format(forecast.dailyMb)} МБ/сутки. К ${date.format(forecast.expiresAt)} останется примерно ${number.format(forecast.remainingMb)} МБ.`, warning: false };
    case 'shortfall': return { title: forecast.runsOutAt <= now ? 'По прогнозу интернет уже мог закончиться' : `Может закончиться ${date.format(forecast.runsOutAt)}`, detail: `В среднем ${number.format(forecast.dailyMb)} МБ/сутки. Срок пакета — до ${date.format(forecast.expiresAt)}.${forecast.runsOutAt <= now ? ' Обновите остатки.' : ''}`, warning: true };
    case 'unavailable': {
      const reasons = {
        samples: 'Нужно минимум 3 проверки и сутки наблюдений в одном пакете.',
        stale: 'Обновите остатки: последнему замеру уже больше суток.',
        expiry: 'Для прогноза нужен срок пакета из SMS AnorINFO.',
        expired: 'Срок сохранённого пакета истёк. Обновите остатки.',
      };
      return { title: 'Прогноз пока недоступен', detail: reasons[forecast.reason], warning: false };
    }
  }
}
function WindowRow({ label, value, colors: c }: { label: string; value: UsageWindow | null; colors: Palette }) {
  return <View style={styles.window}>
    <View style={styles.row}><Text style={[styles.label, { color: c.secondary }]}>{label}</Text><Text style={[styles.amount, { color: c.text }]}>{value ? `${number.format(value.consumedMb)} МБ` : '—'}</Text></View>
    <Text style={[styles.caption, { color: c.muted }]}>{value ? `${duration(value.to - value.from)} наблюдений · ${date.format(value.from)} — ${date.format(value.to)}` : 'Недостаточно проверок в этом периоде'}</Text>
  </View>;
}
export function InternetUsageCard({ account, colors: c, now, nightUnlimited = false }: { account: Account; colors: Palette; now: number; nightUnlimited?: boolean }) {
  const [key, setKey] = useState<'day' | 'night'>('day');
  const usage = analyzeInternetUsage(account, key, now);
  const forecast = forecastText(usage.forecast, now);
  return <View style={[styles.card, { backgroundColor: c.surface }]}>
    <Text accessibilityRole="header" style={[styles.title, { color: c.text }]}>Расход и прогноз</Text>
    <View style={[styles.tabs, { backgroundColor: c.background }]}>{([{ key: 'day', label: 'Интернет' }, { key: 'night', label: 'Ночной' }] as const).map((tab) =>
      <Pressable key={tab.key} accessibilityRole="radio" accessibilityState={{ checked: key === tab.key }} onPress={() => setKey(tab.key)} style={[styles.tab, key === tab.key && { backgroundColor: c.accentTint }]}><Text style={[styles.label, { color: key === tab.key ? c.accent : c.secondary }]}>{tab.label}</Text></Pressable>)}</View>
    {!(key === 'night' && nightUnlimited) && <WindowRow label="За последние 24 часа" value={usage.day} colors={c} />}
    {!(key === 'night' && nightUnlimited) && <WindowRow label="За последние 7 дней" value={usage.week} colors={c} />}
    <View style={[styles.forecast, { borderColor: c.border }]}>
      <Text style={[styles.forecastTitle, { color: forecast.warning ? c.warning : c.text }]}>{key === 'night' && nightUnlimited ? 'Ночной безлимит по тарифу' : forecast.title}</Text>
      <Text style={[styles.caption, { color: c.secondary }]}>{key === 'night' && nightUnlimited ? 'Прогноз исчерпания для безлимитного пакета не рассчитывается.' : forecast.detail}</Text>
    </View>
    <Text style={[styles.caption, { color: c.muted }]}>Оценка по разнице остатков между проверками. Учитывается только показанный период наблюдений. Скачки остатка вверх не сбрасывают расход и не считаются повторно при возврате. Новый срок или тариф начинают новый расчёт. Прогноз предполагает прежний темп расхода.</Text>
  </View>;
}
const styles = StyleSheet.create({
  card: { padding: 20, borderRadius: 18, gap: 16, marginTop: 20 }, title: { fontSize: 20, fontWeight: '600', letterSpacing: -0.5 },
  tabs: { flexDirection: 'row', padding: 3, borderRadius: 11 }, tab: { flex: 1, minHeight: 44, justifyContent: 'center', alignItems: 'center', borderRadius: 9 },
  window: { gap: 4 }, row: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  label: { fontSize: 13, fontWeight: '500' }, amount: { fontSize: 16, fontWeight: '600', fontVariant: ['tabular-nums'] },
  caption: { fontSize: 11, lineHeight: 17 }, forecast: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 16, gap: 7 }, forecastTitle: { fontSize: 15, fontWeight: '600', lineHeight: 21 },
});
