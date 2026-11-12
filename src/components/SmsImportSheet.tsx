import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { parsePackageSms, type PackagePatch } from '../parsers/operator';
import { packageKeys } from '../domain/account';
import type { Palette } from '../theme/tokens';

type Props = { visible: boolean; colors: Palette; contextId: number | null; onClose: () => void; onCommit: (text: string) => void };
export function SmsImportSheet({ visible, colors, contextId, onClose, onCommit }: Props) {
  const [text, setText] = useState('');
  const [patch, setPatch] = useState<PackagePatch | null>(null);
  const [previewContext, setPreviewContext] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const styles = useMemo(() => StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background }, content: { padding: 24, gap: 18 },
    title: { color: colors.text, fontSize: 25, fontWeight: '600' }, copy: { color: colors.secondary, fontSize: 13, lineHeight: 21 },
    input: { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 14, padding: 16, minHeight: 200, textAlignVertical: 'top', fontSize: 14 },
    button: { backgroundColor: colors.accent, padding: 16, borderRadius: 12, alignItems: 'center', minHeight: 48 },
    buttonText: { color: colors.background, fontWeight: '600', fontSize: 15 },
    close: { padding: 12, minHeight: 48, alignItems: 'center' }, value: { color: colors.text, fontSize: 15, lineHeight: 24 },
    error: { color: colors.accent, fontSize: 13, lineHeight: 20 },
  }), [colors]);
  function close() { setText(''); setPatch(null); setError(null); onClose(); }
  const labels = { day: 'Интернет, МБ', night: 'Ночной интернет, МБ', minutes: 'Минуты', sms: 'SMS' };
  return (
    <Modal visible={visible} animationType="none" onRequestClose={close}>
      <SafeAreaView style={styles.root}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
          <Text style={styles.title}>Импорт AnorINFO</Text>
          <Text style={styles.copy}>Вставьте SMS для выбранной SIM Anor. Сохранятся только распознанные остатки, без имени и исходного текста. Время обновления будет временем импорта.</Text>
          <TextInput accessibilityLabel="Текст SMS AnorINFO" style={styles.input} multiline maxLength={16384} value={text} onChangeText={(next) => { setText(next); setPatch(null); setError(null); }} placeholder="Вставьте текст SMS" placeholderTextColor={colors.muted} />
          <Pressable accessibilityRole="button" style={styles.button} onPress={() => {
            const result = parsePackageSms(text);
            if (result.ok) { setPatch(result.value); setPreviewContext(contextId); setError(null); }
            else { setPatch(null); setError(result.error); }
          }}><Text style={styles.buttonText}>Распознать</Text></Pressable>
          {error && <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text>}
          {patch && <>
            <Text style={styles.value}>{patch.tariffName ?? 'Тариф не указан'}</Text>
            {packageKeys.map((key) => patch.values[key] !== undefined && <Text key={key} style={styles.value}>{labels[key]}: {patch.values[key]}</Text>)}
            {patch.expiresLocal && <Text style={styles.value}>Пакет до {patch.expiresLocal.replace('T', ' ')}</Text>}
            <Text style={styles.copy}>Подтвердите, что сообщение относится к вашей текущей SIM и не старее уже показанных данных.</Text>
            <Pressable accessibilityRole="button" style={styles.button} onPress={() => {
              if (previewContext !== contextId) { setError('SIM изменилась. Распознайте сообщение заново.'); setPatch(null); return; }
              onCommit(text); close();
            }}><Text style={styles.buttonText}>Подтвердить и сохранить</Text></Pressable>
          </>}
          <Pressable accessibilityRole="button" style={styles.close} onPress={close}><Text style={styles.copy}>Закрыть</Text></Pressable>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
