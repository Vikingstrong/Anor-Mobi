import { ActivityIndicator, Image, Pressable, StyleSheet } from 'react-native';
import type { Palette } from '../theme/tokens';

type Props = { label: string; onPress: () => void; disabled?: boolean; loading?: boolean; waiting?: boolean; colors: Palette };
export function RefreshButton({ label, onPress, disabled = false, loading = false, waiting = false, colors }: Props) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label}
      accessibilityState={{ disabled, busy: loading || waiting }} disabled={disabled} onPress={onPress}
      style={({ pressed }) => [styles.button, { backgroundColor: colors.accentTint, borderColor: colors.border },
        disabled && !loading && !waiting && styles.disabled, pressed && styles.pressed]}>
      {loading ? <ActivityIndicator size="small" color={colors.accent} /> :
        <Image accessible={false} source={waiting ? require('../../assets/icons/clock.png') : require('../../assets/icons/refresh.png')}
          style={[styles.icon, { tintColor: colors.accent }]} />}
    </Pressable>
  );
}
const styles = StyleSheet.create({
  button: { width: 48, height: 48, borderRadius: 24, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  icon: { width: 22, height: 22 }, disabled: { opacity: 0.4 }, pressed: { opacity: 0.65 },
});
