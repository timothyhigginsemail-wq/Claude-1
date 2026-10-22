// Numerical primitives shared by every engine module.

/** Deterministic 32-bit hash of any mix of numbers and strings (FNV-1a + avalanche). */
export function hash32(...parts: (number | string)[]): number {
  let h = 0x811c9dc5;
  const s = parts.join('|');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Small, fast, seedable PRNG (mulberry32) with Gaussian helpers. */
export class Rng {
  private s: number;
  private spare: number | null = null;
  constructor(seed: number) {
    this.s = seed >>> 0 || 0x9e3779b9;
  }
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  normal(): number {
    if (this.spare !== null) {
      const v = this.spare;
      this.spare = null;
      return v;
    }
    let u = 0;
    while (u <= 1e-12) u = this.next();
    const v = this.next();
    const r = Math.sqrt(-2 * Math.log(u));
    this.spare = r * Math.sin(2 * Math.PI * v);
    return r * Math.cos(2 * Math.PI * v);
  }
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
  int(a: number, b: number): number {
    return Math.floor(this.range(a, b + 1));
  }
  pick<T>(xs: readonly T[]): T {
    return xs[Math.floor(this.next() * xs.length) % xs.length];
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  /** Student-t with nu degrees of freedom, scaled to unit variance (fat tails). */
  studentT(nu: number): number {
    let chi = 0;
    for (let i = 0; i < nu; i++) {
      const z = this.normal();
      chi += z * z;
    }
    return (this.normal() / Math.sqrt(chi / nu)) * Math.sqrt((nu - 2) / nu);
  }
  weighted<T>(items: readonly T[], w: readonly number[]): T {
    const tot = w.reduce((a, b) => a + b, 0);
    let x = this.next() * tot;
    for (let i = 0; i < items.length; i++) {
      x -= w[i];
      if (x <= 0) return items[i];
    }
    return items[items.length - 1];
  }
}

export const rngFor = (...parts: (number | string)[]) => new Rng(hash32(...parts));

/** Standard normal CDF (Hart / West double-precision approximation, |err| < 1e-14). */
export function normCdf(x: number): number {
  const z = Math.abs(x);
  let c: number;
  if (z > 37) c = 0;
  else {
    const e = Math.exp(-0.5 * z * z);
    if (z < 7.07106781186547) {
      let n = 3.52624965998911e-2 * z + 0.700383064443688;
      n = n * z + 6.37396220353165;
      n = n * z + 33.912866078383;
      n = n * z + 112.079291497871;
      n = n * z + 221.213596169931;
      n = n * z + 220.206867912376;
      let d = 8.83883476483184e-2 * z + 1.75566716318264;
      d = d * z + 16.064177579207;
      d = d * z + 86.7807322029461;
      d = d * z + 296.564248779674;
      d = d * z + 637.333633378831;
      d = d * z + 793.826512519948;
      d = d * z + 440.413735824752;
      c = (e * n) / d;
    } else {
      let b = z + 0.65;
      b = z + 4 / b;
      b = z + 3 / b;
      b = z + 2 / b;
      b = z + 1 / b;
      c = e / b / 2.506628274631;
    }
  }
  return x > 0 ? 1 - c : c;
}

export const normPdf = (x: number) => Math.exp(-0.5 * x * x) / 2.5066282746310002;

/** Cholesky factor L (lower) of a symmetric matrix; repairs mild non-PSD input by shrinking toward identity. */
export function cholesky(a: number[][]): number[][] {
  const n = a.length;
  for (let attempt = 0; attempt < 12; attempt++) {
    const shrink = attempt === 0 ? 0 : Math.min(1, 0.02 * 2 ** attempt);
    const m = a.map((row, i) => row.map((v, j) => (i === j ? v : v * (1 - shrink))));
    const L = Array.from({ length: n }, () => new Array(n).fill(0));
    let ok = true;
    for (let i = 0; i < n && ok; i++) {
      for (let j = 0; j <= i; j++) {
        let s = m[i][j];
        for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
        if (i === j) {
          if (s <= 1e-10) {
            ok = false;
            break;
          }
          L[i][i] = Math.sqrt(s);
        } else L[i][j] = s / L[j][j];
      }
    }
    if (ok) return L;
  }
  return a.map((_, i) => a.map((__, j) => (i === j ? 1 : 0)));
}

export const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
export const mean = (xs: number[]) => (xs.length ? sum(xs) / xs.length : 0);
export function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(sum(xs.map((x) => (x - m) ** 2)) / (xs.length - 1));
}
export function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return 0;
  const p = clamp(q, 0, 1) * (sorted.length - 1);
  const lo = Math.floor(p);
  const hi = Math.ceil(p);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (p - lo);
}

/** Bisection root finder on [a,b]; f must change sign. */
export function bisect(f: (x: number) => number, a: number, b: number, tol = 1e-10, maxIt = 200): number {
  let fa = f(a);
  for (let i = 0; i < maxIt; i++) {
    const m = 0.5 * (a + b);
    const fm = f(m);
    if (Math.abs(fm) < tol || b - a < tol) return m;
    if (fa * fm < 0) b = m;
    else {
      a = m;
      fa = fm;
    }
  }
  return 0.5 * (a + b);
}
