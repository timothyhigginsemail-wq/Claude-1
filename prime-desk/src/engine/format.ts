// Number formatting shared by engine narratives and UI.

export function fm(x: number, digits?: number): string {
  if (!Number.isFinite(x)) return '—';
  const a = Math.abs(x);
  const sign = x < 0 ? '−' : '';
  if (a >= 1e9) return `${sign}$${(a / 1e9).toFixed(digits ?? 2)}bn`;
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(digits ?? (a >= 1e8 ? 0 : 1))}m`;
  if (a >= 1e3) return `${sign}$${(a / 1e3).toFixed(digits ?? 0)}k`;
  return `${sign}$${a.toFixed(0)}`;
}

export function fmSigned(x: number, digits?: number): string {
  return (x > 0 ? '+' : '') + fm(x, digits);
}

export function fpct(x: number, digits = 1): string {
  if (!Number.isFinite(x)) return '—';
  return `${(x * 100).toFixed(digits)}%`;
}

export function fbps(x: number): string {
  return `${Math.round(x)}bp`;
}

export function fx(x: number, digits = 1): string {
  if (!Number.isFinite(x)) return '∞';
  return `${x.toFixed(digits)}x`;
}
