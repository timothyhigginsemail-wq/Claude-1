export function money(x: number, digits = 0): string {
  if (!isFinite(x)) return '—';
  const sign = x < 0 ? '−' : '';
  const a = Math.abs(x);
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(a >= 1e8 ? 0 : 2)}M`;
  if (a >= 1e4) return `${sign}$${(a / 1e3).toFixed(digits || (a >= 1e5 ? 0 : 1))}k`;
  return `${sign}$${a.toFixed(digits)}`;
}

export function signedMoney(x: number): string {
  return (x > 0 ? '+' : '') + money(x);
}

export function pct(x: number, digits = 1): string {
  if (!isFinite(x)) return '—';
  return `${x < 0 ? '−' : ''}${Math.abs(x * 100).toFixed(digits)}%`;
}

export function signedPct(x: number, digits = 1): string {
  if (!isFinite(x)) return '—';
  return `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x * 100).toFixed(digits)}%`;
}

export function bp(x: number, digits = 1): string {
  return `${(x * 1e4).toFixed(digits)}bp`;
}

export function num(x: number, digits = 2): string {
  if (!isFinite(x)) return '—';
  return (x < 0 ? '−' : '') + Math.abs(x).toFixed(digits);
}

export function mult(x: number, digits = 2): string {
  return `${num(x, digits)}×`;
}

export function toneClass(x: number): string {
  return x > 0 ? 'text-pos' : x < 0 ? 'text-neg' : 'text-ink2';
}

/** Annualise a weekly log growth rate into a compound annual growth rate. */
export function annualFromWeeklyLog(g: number): number {
  return Math.exp(g * 52) - 1;
}
