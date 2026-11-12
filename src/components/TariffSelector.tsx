import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { tariffIds, tariffs, type TariffId } from '../domain/tariffs';
import type { Palette } from '../theme/tokens';
export function TariffSelector({ colors: c, selected, mode, observedName, disabled, onSelect, onAuto }: {
  colors: Palette; selected: TariffId | null; mode: 'auto' | 'manual'; observedName: string | null; disabled: boolean;
  onSelect: (id: TariffId) => void; onAuto: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const label = selected ? tariffs[selected].name : observedName ?? 'Ожидаем SMS AnorINFO';
  function close(action: () => void) { action(); setExpanded(false); }
  return <View style={styles.root}>
    <Pressable accessibilityRole="button" accessibilityLabel={`Тариф: ${mode === 'auto' ? 'автоматически' : 'вручную'}, ${label}`} accessibilityState={{ expanded, disabled }} disabled={disabled} onPress={() => setExpanded((value) => !value)} style={[styles.selector, { backgroundColor: c.background, borderColor: c.border }]}>
      <View style={styles.copy}><Text style={[styles.caption, { color: c.secondary }]}>{mode === 'auto' ? 'Автоматически по SMS' : 'Выбран вручную'}</Text><Text style={[styles.name, { color: c.text }]}>{label}</Text></View>
      <View style={[styles.chevron, { borderColor: c.secondary, transform: [{ rotate: expanded ? '225deg' : '45deg' }] }]} />
    </Pressable>
    {expanded && <View style={[styles.options, { borderColor: c.border }]}>
      <Pressable accessibilityRole="radio" accessibilityState={{ checked: mode === 'auto' }} disabled={disabled} onPress={() => close(onAuto)} style={[styles.option, { backgroundColor: mode === 'auto' ? c.accentTint : c.background }]}><Text style={[styles.name, { color: mode === 'auto' ? c.accent : c.text }]}>Автоматически по AnorINFO</Text><Text style={[styles.caption, { color: c.secondary }]}>Определять по названию тарифа в ответе оператора</Text></Pressable>
      {tariffIds.map((id) => <Pressable key={id} accessibilityRole="radio" accessibilityState={{ checked: mode === 'manual' && selected === id }} disabled={disabled} onPress={() => close(() => onSelect(id))} style={[styles.option, { backgroundColor: mode === 'manual' && selected === id ? c.accentTint : c.background }]}><Text style={[styles.name, { color: mode === 'manual' && selected === id ? c.accent : c.text }]}>{tariffs[id].name} · {tariffs[id].price} сомони / 30 дней</Text><Text style={[styles.caption, { color: c.secondary }]}>{tariffs[id].description}</Text></Pressable>)}
    </View>}
    <Text style={[styles.caption, { color: c.secondary }]}>Выбор действует только в приложении и не подключает тариф. {observedName ? `В последнем SMS: ${observedName}.` : 'Для определения нажмите проверку пакетов.'}</Text>
  </View>;
}
const styles = StyleSheet.create({
  root: { gap: 9 }, selector: { minHeight: 64, padding: 14, borderWidth: 1, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 16 },
  copy: { flex: 1, gap: 4 }, chevron: { width: 8, height: 8, borderBottomWidth: 1.5, borderRightWidth: 1.5, marginRight: 4 },
  name: { fontSize: 14, fontWeight: '600', lineHeight: 20 }, caption: { fontSize: 11, lineHeight: 17 },
  options: { gap: 1, borderWidth: 1, borderRadius: 12, overflow: 'hidden' }, option: { padding: 14, gap: 5, minHeight: 60 },
});
