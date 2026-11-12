import { useEffect, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import type { Delivery } from '../application/AccountController';
import type { Palette } from '../theme/tokens';

export function DeliveryStatus({ label, status, colors }: { label: string; status: Delivery; colors: Palette }) {
  const [now, setNow] = useState(Date.now);
  const waiting = status.stage === 'waiting-ussd' || status.stage === 'waiting-sms' || status.stage === 'still-waiting';
  useEffect(() => {
    if (!waiting || status.startedAt === undefined) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    const update = (active: boolean) => {
      if (timer !== undefined) clearInterval(timer);
      timer = undefined;
      if (active) { setNow(Date.now()); timer = setInterval(() => setNow(Date.now()), 1000); }
    };
    update(AppState.currentState === 'active');
    const listener = AppState.addEventListener('change', (next) => update(next === 'active'));
    return () => { listener.remove(); if (timer !== undefined) clearInterval(timer); };
  }, [waiting, status.startedAt]);
  const seconds = status.startedAt === undefined ? 0 : Math.max(0, Math.floor((now - status.startedAt) / 1000));
  const elapsed = seconds < 60 ? `${seconds} с` : `${Math.floor(seconds / 60)} мин ${seconds % 60} с`;
  return (
    <View style={styles.row}>
      {label.length > 0 && <Text style={[styles.label, { color: colors.secondary }]}>{label}</Text>}
      <Text accessibilityLiveRegion="polite" style={[styles.message, { color: status.stage === 'error' ? colors.accent : colors.text }]}>
        {status.message}
      </Text>
      {waiting && <Text accessible={false} style={[styles.label, { color: colors.muted }]}>{elapsed}</Text>}
    </View>
  );
}
const styles = StyleSheet.create({
  row: { gap: 4 }, label: { fontSize: 11 }, message: { fontSize: 12, lineHeight: 19 },
});
