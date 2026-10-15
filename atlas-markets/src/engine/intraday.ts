// Intraday market: prices move continuously from the open to the close along a Brownian bridge
// pinned at both ends. The close is the pre-drawn daily shock, so the end-of-day market (and
// everything calibrated on it) is unchanged; scheduled news lands as a jump at its release time.

import { applyShock, combineShocks, type Shock } from './market';
import type { GameState, MarketState } from './types';

export const OPEN_HOUR = 7;
/** Minutes after 07:00 at which the trading day ends (16:00). */
export const CLOSE_MIN = 9 * 60;

export function minuteOf(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h - OPEN_HOUR) * 60 + m;
}

export function clockLabel(min: number): string {
  const t = OPEN_HOUR * 60 + Math.round(min);
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

/** Bridge noise for one day: per component, a path with B(0) = B(1) = 0, one point per market minute. */
const bridgeCache = new Map<number, { keys: string[]; paths: Float32Array[] }>();

function bridges(seed: number, keys: string[]) {
  const hit = bridgeCache.get(seed);
  if (hit && hit.keys.length === keys.length) return hit;
  let a = seed >>> 0 || 1;
  const u = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const nrm = () => Math.sqrt(-2 * Math.log(Math.max(1e-12, u()))) * Math.cos(2 * Math.PI * u());
  const N = CLOSE_MIN;
  const sd = Math.sqrt(1 / N);
  const paths = keys.map(() => {
    const w = new Float32Array(N + 1);
    for (let i = 1; i <= N; i++) w[i] = w[i - 1] + nrm() * sd;
    const end = w[N];
    for (let i = 0; i <= N; i++) w[i] -= (i / N) * end;
    return w;
  });
  const out = { keys, paths };
  if (bridgeCache.size > 4) bridgeCache.clear();
  bridgeCache.set(seed, out);
  return out;
}

const FACTORS = ['g', 'inf', 'ro', 'usd', 'oil'] as const;
/** Intraday wiggle size relative to a one-day standard deviation. */
const NOISE = 0.7;

/** The cumulative factor shock from the open to `min`. */
export function shockAt(s: GameState, min: number): Shock {
  const plan = s.plan;
  if (!plan) return combineShocks([]);
  const m = Math.max(0, Math.min(CLOSE_MIN, min));
  const f = m / CLOSE_MIN;
  const keys = [...FACTORS, ...Object.keys(plan.base.idio)];
  const b = bridges(plan.daySeed, keys);
  const i = Math.floor(m);
  const noise = combineShocks([]);
  keys.forEach((k, j) => {
    const v = b.paths[j][i] * NOISE;
    if ((FACTORS as readonly string[]).includes(k)) (noise as any)[k] = v;
    else noise.idio[k] = v;
  });
  const parts: [Shock, number][] = [[plan.base, f], [noise, 1]];
  for (const ev of plan.events) if (ev.minute <= m) parts.push([ev.z, 1]);
  return combineShocks(parts);
}

/** The live market at `min` minutes after the open (time does not advance intraday). */
export function marketAt(s: GameState, min: number): MarketState {
  if (!s.openMarket || !s.plan) return s.market;
  const m = Math.max(0, Math.min(CLOSE_MIN, min));
  return applyShock(s.openMarket, shockAt(s, m), { advanceTime: false, frac: m / CLOSE_MIN });
}
