import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { tariffIds, tariffs, type TariffId } from '../domain/tariffs';
import type { HistoryEntry, TariffSnapshot } from '../domain/account';
import type { Palette } from '../theme/tokens';
const number = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
const date = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
export function HistorySheet({ visible, colors: c, entries, snapshots, onClose, onClear }: {
  visible: boolean; colors: Palette; entries: HistoryEntry[]; snapshots: Partial<Record<TariffId, TariffSnapshot>>; onClose: () => void; onClear: () => void;
}) {
  return <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
    <View style={styles.backdrop}><SafeAreaView edges={['bottom']} style={[styles.sheet, { backgroundColor: c.surface }]}>
      <View style={styles.header}><Text accessibilityRole="header" style={[styles.title, { color: c.text }]}>История обновлений</Text><Pressable accessibilityRole="button" accessibilityLabel="Закрыть историю" onPress={onClose} style={styles.button}><Text style={{ color: c.accent }}>Готово</Text></Pressable></View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.caption, { color: c.secondary }]}>Последние 30 ответов и последний снимок каждого тарифа для выбранной SIM. Данные хранятся на устройстве.</Text>
        {tariffIds.map((id) => {
          const snapshot = snapshots[id];
          return snapshot ? <View key={id} style={[styles.row, { borderColor: c.border }]}>
            <Text style={[styles.value, { color: c.text }]}>{tariffs[id].name}</Text><Text style={[styles.caption, { color: c.muted }]}>{date.format(new Date(snapshot.capturedAt))} · сохранённые данные</Text>
            <Text style={[styles.caption, { color: c.secondary }]}>Интернет {snapshot.packages.day ? number.format(snapshot.packages.day.value) : '—'} МБ · ночной {snapshot.packages.night ? number.format(snapshot.packages.night.value) : '—'} МБ</Text>
            <Text style={[styles.caption, { color: c.secondary }]}>{snapshot.packages.minutes ? number.format(snapshot.packages.minutes.value) : '—'} мин · {snapshot.packages.sms ? number.format(snapshot.packages.sms.value) : '—'} SMS</Text>
          </View> : null;
        })}
        {entries.length === 0 && <Text style={[styles.empty, { color: c.secondary }]}>История появится после обновления данных.</Text>}
        {entries.map((entry, index) => <View key={`${entry.at}/${index}`} style={[styles.row, { borderColor: c.border }]}>
          <Text style={[styles.caption, { color: c.muted }]}>{date.format(new Date(entry.at))}{entry.context?.tariffName ? ` · ${entry.context.tariffName}` : ''} · {entry.kind === 'balance' ? 'Баланс' : 'Пакеты'}</Text>
          {entry.kind === 'balance' ? <Text style={[styles.value, { color: c.text }]}>{entry.balance ? number.format(entry.balance.value / 100) : '—'} сомони</Text> : <>
            <Text style={[styles.value, { color: c.text }]}>Интернет {entry.packages.day ? number.format(entry.packages.day.value) : '—'} МБ</Text>
            <Text style={[styles.caption, { color: c.secondary }]}>Ночной {entry.packages.night ? number.format(entry.packages.night.value) : '—'} МБ · {entry.packages.minutes ? number.format(entry.packages.minutes.value) : '—'} мин · {entry.packages.sms ? number.format(entry.packages.sms.value) : '—'} SMS</Text>
          </>}
        </View>)}
        {(entries.length > 0 || Object.keys(snapshots).length > 0) && <Pressable accessibilityRole="button" style={styles.button} onPress={() => Alert.alert('Очистить историю?', 'История и снимки других тарифов будут удалены. Текущие остатки и баланс сохранятся.', [{ text: 'Отмена', style: 'cancel' }, { text: 'Очистить', style: 'destructive', onPress: onClear }])}><Text style={{ color: c.accent }}>Очистить историю</Text></Pressable>}
      </ScrollView>
    </SafeAreaView></View>
  </Modal>;
}
const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#00000080' },
  sheet: { maxHeight: '85%', borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  header: { paddingHorizontal: 22, paddingTop: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  title: { fontSize: 20, fontWeight: '600', flex: 1 }, button: { minHeight: 48, justifyContent: 'center', alignItems: 'center' },
  content: { padding: 22, gap: 16 }, row: { paddingVertical: 14, gap: 7, borderBottomWidth: StyleSheet.hairlineWidth },
  caption: { fontSize: 12, lineHeight: 19 }, value: { fontSize: 17, fontWeight: '500' }, empty: { paddingVertical: 28, fontSize: 14 },
});
