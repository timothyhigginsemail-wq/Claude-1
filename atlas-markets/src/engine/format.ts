export function fm(x: number, digits?: number): string {
  if (!Number.isFinite(x)) return '—';
  const a = Math.abs(x);
  const sign = x < 0 ? '−' : '';
  if (a >= 1e9) return `${sign}$${(a / 1e9).toFixed(digits ?? 2)}bn`;
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(digits ?? (a >= 1e8 ? 0 : 1))}m`;
  if (a >= 1e3) return `${sign}$${(a / 1e3).toFixed(digits ?? 0)}k`;
  return `${sign}$${a.toFixed(0)}`;
}
export const fmSigned = (x: number, d?: number) => (x > 0 ? '+' : '') + fm(x, d);
export const fpct = (x: number, d = 1) => (Number.isFinite(x) ? `${(x * 100).toFixed(d)}%` : '—');
export const fbp = (x: number, d = 0) => `${x.toFixed(d)}bp`;
export const fx = (x: number, d = 1) => (Number.isFinite(x) && x < 99 ? `${x.toFixed(d)}x` : '∞');
export function fnum(x: number, d = 2) {
  return x.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}
/** Compact signed quantity (shares, contracts, notional). */
export function fq(x: number): string {
  const a = Math.abs(x);
  const s = x < 0 ? '−' : '';
  if (a >= 1e9) return `${s}${(a / 1e9).toFixed(2)}bn`;
  if (a >= 1e6) return `${s}${(a / 1e6).toFixed(1)}m`;
  if (a >= 1e3) return `${s}${(a / 1e3).toFixed(1)}k`;
  return `${s}${a.toFixed(0)}`;
}
