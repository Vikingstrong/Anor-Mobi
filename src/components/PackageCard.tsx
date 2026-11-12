import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Palette } from '../theme/tokens';

type Props = {
  label: string;
  unit: string;
  remaining: number | null;
  total: number | null;
  updatedAt: string | null;
  preview: boolean;
  colors: Palette;
  compact?: boolean;
  note?: string;
  unlimited?: boolean;
  warnWhenLow?: boolean;
  source?: 'ussd' | 'sms' | 'manual-sms';
};

const numberFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
const timeFormat = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
});

export function updatedLabel(value: string | null, preview = false, imported = false) {
  if (value === null) return 'Ещё не обновлялось';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Время неизвестно';
  const elapsed = Math.max(0, Date.now() - date.getTime());
  const relative = elapsed < 60000 ? 'только что' : elapsed < 3600000 ? `${Math.floor(elapsed / 60000)} мин назад`
    : elapsed < 86400000 ? `${Math.floor(elapsed / 3600000)} ч назад` : timeFormat.format(date);
  return `${preview ? 'Пример' : imported ? 'Импортировано' : 'Обновлено'} · ${preview ? timeFormat.format(date) : relative}`;
}

export function PackageCard({ label, unit, remaining, total, updatedAt, preview, colors, compact = false, source, warnWhenLow = false, note, unlimited = false }: Props) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const percent = remaining !== null && total !== null && total > 0
    ? Math.max(0, Math.min(100, remaining / total * 100)) : null;

  const lowInternet = warnWhenLow && percent !== null && percent <= 10;
  return (
    <View style={[styles.card, compact && styles.compact]}>
      <Text style={styles.label}>{label}</Text>
      {note && <Text style={styles.timestamp}>{note}</Text>}
      <View style={styles.valueRow}>
        <Text style={[styles.value, compact && styles.compactValue]}>
          {remaining === null ? unlimited ? 'Безлимит' : '—' : numberFormat.format(remaining)}
        </Text>
        {(!unlimited || remaining !== null) && <Text style={styles.unit}>{unit}</Text>}
      </View>
      {!unlimited && <View
        accessibilityRole="progressbar"
        accessibilityLabel={label}
        accessibilityValue={percent === null ? { text: 'Нет данных' } : { min: 0, max: 100, now: Math.round(percent) }}
        style={[styles.track, percent === null && styles.unknownTrack]}
      >
        {percent !== null && <View style={[styles.fill, { width: `${percent}%`, backgroundColor: lowInternet ? colors.warning : colors.accent }]} />}
      </View>}
      {!unlimited && <View style={styles.limitRow}>
        <Text style={styles.percent}>{percent === null ? 'Нет данных' : `${Math.round(percent)}% осталось`}</Text>
        <Text
          style={styles.limit}
          accessibilityLabel={total === null ? 'Максимум неизвестен' : `Максимум: ${numberFormat.format(total)} ${unit}`}
        >
          {total === null ? '—' : `${numberFormat.format(total)} ${unit}`}
        </Text>
      </View>}
      {remaining !== null && total !== null && remaining > total && (
        <Text style={styles.timestamp}>Остаток превышает лимит тарифа</Text>
      )}
      {lowInternet && <Text style={[styles.lowWarning, { color: colors.warning }]}>Мало интернета · осталось не более 10%</Text>}
      <Text style={styles.timestamp}>{unlimited && updatedAt === null ? 'Условие выбранного тарифа' : updatedLabel(updatedAt, preview, source === 'manual-sms')}</Text>
    </View>
  );
}

function createStyles(c: Palette) {
  return StyleSheet.create({
    card: { backgroundColor: c.surface, padding: 20, borderRadius: 18, gap: 10 },
    compact: { paddingVertical: 14, paddingHorizontal: 20, gap: 7 },
    label: { color: c.secondary, fontSize: 14, fontWeight: '500' },
    valueRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 7 },
    value: { color: c.text, fontSize: 34, fontWeight: '600', letterSpacing: -1, fontVariant: ['tabular-nums'] },
    compactValue: { fontSize: 30 },
    unit: { color: c.secondary, fontSize: 14 },
    track: { height: 7, backgroundColor: c.track, borderRadius: 4, overflow: 'hidden' },
    unknownTrack: { backgroundColor: 'transparent', borderWidth: 1, borderColor: c.border, borderStyle: 'dashed' },
    fill: { height: '100%', borderRadius: 4, backgroundColor: c.accent },
    limitRow: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', columnGap: 8 },
    limit: { color: c.muted, fontSize: 11, textAlign: 'right' },
    percent: { color: c.secondary, fontSize: 11, fontWeight: '600', fontVariant: ['tabular-nums'] },
    lowWarning: { fontSize: 12, fontWeight: '600', lineHeight: 18 },
    timestamp: { color: c.muted, fontSize: 11, lineHeight: 16 },
  });
}
