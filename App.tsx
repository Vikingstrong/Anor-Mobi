import { useEffect, useMemo, useRef, useState } from 'react';
import { Appearance, useColorScheme } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { readTheme, writeTheme, readAccent, writeAccent } from './src/storage/themeStorage';
import { getPalette, type Accent, type ThemePreference } from './src/theme/tokens';

export default function App() {
  const [preference, setPreference] = useState<ThemePreference>('system');
  const [themeError, setThemeError] = useState<string | null>(null);
  const [accent, setAccent] = useState<Accent>('blue');
  const [accentError, setAccentError] = useState<string | null>(null);
  const accentRevision = useRef(0);
  const revision = useRef(0);
  useEffect(() => {
    const initial = revision.current;
    void readTheme().then((value) => { if (revision.current === initial) setPreference(value); })
      .catch(() => setThemeError('Не удалось загрузить оформление.'));
  }, []);
  useEffect(() => {
    const initial = accentRevision.current;
    void readAccent().then((value) => { if (accentRevision.current === initial) setAccent(value); })
      .catch(() => setAccentError('Не удалось загрузить цвет оформления.'));
  }, []);
  function changeAccent(value: Accent) {
    const current = ++accentRevision.current;
    setAccent(value);
    void writeAccent(value).then(() => { if (accentRevision.current === current) setAccentError(null); })
      .catch(() => { if (accentRevision.current === current) setAccentError('Не удалось сохранить цвет оформления.'); });
  }
  function changeTheme(value: ThemePreference) {
    const current = ++revision.current;
    setPreference(value);
    void writeTheme(value).then(() => { if (revision.current === current) setThemeError(null); })
      .catch(() => { if (revision.current === current) setThemeError('Не удалось сохранить оформление.'); });
  }
  const scheme = useColorScheme();
  const resolved = preference === 'system' ? (scheme ?? 'light') : preference;
  const colors = useMemo(() => getPalette(resolved, accent), [resolved, accent]);

  useEffect(() => {
    // Also releases the light-only override in the already installed development APK.
    Appearance.setColorScheme(preference === 'system' ? 'auto' : preference);
  }, [preference]);

  return (
    <SafeAreaProvider>
      <StatusBar style={resolved === 'dark' ? 'light' : 'dark'} />
      <DashboardScreen
        colors={colors}
        accent={accent}
        onAccentChange={changeAccent}
        preference={preference}
        onPreferenceChange={changeTheme}
        themeError={themeError ?? accentError}
      />
    </SafeAreaProvider>
  );
}
