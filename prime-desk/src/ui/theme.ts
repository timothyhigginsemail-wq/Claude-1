import { Platform, type TextStyle } from 'react-native';

export const C = {
  bg: '#0A0D12',
  surface: '#11151C',
  surface2: '#171C25',
  surface3: '#1E2430',
  border: '#232A36',
  borderStrong: '#2E3746',
  text: '#E9EDF2',
  textDim: '#9AA4B4',
  textFaint: '#5E6878',
  accent: '#C9A86A', // brass
  accentDim: '#8E7646',
  up: '#4CBF8C',
  down: '#E36B62',
  warn: '#D9A94A',
  info: '#6FA3D9',
  cash: '#C9A86A',
  sec: '#6FA3D9',
  overlay: 'rgba(0,0,0,0.6)',
};

export const S = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

const mono = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'ui-monospace, SFMono-Regular, Menlo, monospace' });
const sans = Platform.select({ ios: 'System', android: 'sans-serif', default: '-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, sans-serif' });

export const F = {
  sans,
  mono,
  num: { fontVariant: ['tabular-nums'] } as TextStyle,
};

export const R = { sm: 6, md: 10, lg: 14 };

export function toneColor(t?: string) {
  if (t === 'up' || t === 'good') return C.up;
  if (t === 'down' || t === 'bad') return C.down;
  if (t === 'warn') return C.warn;
  return C.text;
}

export function signColor(x: number) {
  if (x > 1e-9) return C.up;
  if (x < -1e-9) return C.down;
  return C.textDim;
}
