import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Easing, Modal, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Palette } from '../theme/tokens';
export function SettingsSheet({ visible, onClose, colors, children }: { visible: boolean; onClose: () => void; colors: Palette; children: ReactNode }) {
  const [mounted, setMounted] = useState(visible);
  const [reduceMotion, setReduceMotion] = useState(true);
  const progress = useRef(new Animated.Value(0)).current;
  const revision = useRef(0);
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => { if (active) setReduceMotion(value); }).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => { active = false; subscription.remove(); };
  }, []);
  useEffect(() => {
    const current = ++revision.current;
    if (visible) setMounted(true);
    const animation = Animated.timing(progress, { toValue: visible ? 1 : 0, duration: reduceMotion ? 0 : visible ? 180 : 150,
      easing: Easing.out(Easing.cubic), useNativeDriver: true });
    animation.start(({ finished }) => { if (finished && current === revision.current && !visible) setMounted(false); });
    return () => animation.stop();
  }, [visible, reduceMotion, progress]);
  if (!mounted) return null;
  return <Modal transparent visible animationType="none" onRequestClose={onClose}>
    <View style={styles.root}>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: progress }]}><Pressable accessibilityRole="button" accessibilityLabel="Закрыть настройки" onPress={onClose} style={styles.backdrop} /></Animated.View>
      <Animated.View accessibilityViewIsModal onAccessibilityEscape={onClose} style={[styles.sheet, { backgroundColor: colors.surface, opacity: progress, transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [28, 0] }) }] }]}><SafeAreaView edges={['bottom']} style={{ flexShrink: 1 }}>{children}</SafeAreaView></Animated.View>
    </View>
  </Modal>;
}
const styles = StyleSheet.create({ root: { flex: 1, justifyContent: 'flex-end' }, backdrop: { flex: 1, backgroundColor: '#00000080' }, sheet: { maxHeight: '90%', borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' } });
