export type ThemePreference = 'system' | 'light' | 'dark';
export type Palette = {
  background: string;
  surface: string;
  text: string;
  secondary: string;
  muted: string;
  border: string;
  accent: string;
  accentTint: string;
  track: string;
  warning: string;
  warningTint: string;
};

export const palettes: Record<'light' | 'dark', Palette> = {
  light: {
    background: '#F3F6FA', surface: '#FFFFFF', text: '#10233F',
    secondary: '#526A83', muted: '#687D93', border: '#DCE5EF',
    accent: '#0756A5', accentTint: '#EAF4FF', track: '#DFE9F4', warning: '#805D00', warningTint: '#FFF3BE',
  },
  dark: {
    background: '#0B1420', surface: '#152131', text: '#EFF5FC',
    secondary: '#ADBFD2', muted: '#91A7BF', border: '#2A3A4D',
    accent: '#83BFF1', accentTint: '#103152', track: '#2B4058', warning: '#FFD43B', warningTint: '#352E12',
  },
};

export const accentOptions = [
  { value: 'blue', label: 'Синий' }, { value: 'green', label: 'Зелёный' },
  { value: 'orange', label: 'Оранжевый' }, { value: 'red', label: 'Красный' },
  { value: 'purple', label: 'Фиолетовый' }, { value: 'teal', label: 'Бирюзовый' },
  { value: 'pink', label: 'Розовый' },
] as const;
export type Accent = typeof accentOptions[number]['value'];
type AccentColors = Pick<Palette, 'accent' | 'accentTint'>;
const accents: Record<Accent, Record<'light' | 'dark', AccentColors>> = {
  blue: { light: palettes.light, dark: palettes.dark },
  green: { light: { accent: '#167044', accentTint: '#E9F6ED' }, dark: { accent: '#78D9A1', accentTint: '#17392B' } },
  orange: { light: { accent: '#A94B00', accentTint: '#FFF0E4' }, dark: { accent: '#FFB56B', accentTint: '#3F2B1B' } },
  red: { light: { accent: '#BE353B', accentTint: '#FDECEE' }, dark: { accent: '#FF9A9F', accentTint: '#402229' } },
  purple: { light: { accent: '#7047AF', accentTint: '#F1EBFA' }, dark: { accent: '#C9AAFA', accentTint: '#312442' } },
  teal: { light: { accent: '#067478', accentTint: '#E3F5F3' }, dark: { accent: '#74D7D5', accentTint: '#163A3B' } },
  pink: { light: { accent: '#AC3C7C', accentTint: '#FBEAF4' }, dark: { accent: '#F3A4CF', accentTint: '#3C2639' } },
};
export function isAccent(value: unknown): value is Accent {
  return accentOptions.some((option) => option.value === value);
}
export function getPalette(mode: 'light' | 'dark', accent: Accent): Palette {
  const selected = accents[accent][mode];
  return { ...palettes[mode], ...selected, track: accent === 'blue' ? palettes[mode].track : selected.accentTint };
}
