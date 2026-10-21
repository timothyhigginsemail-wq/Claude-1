import { commonReturns, covariance, estimate, nav, type AllocState, type PM, type PMEstimate } from '../../engine/allocator';
import { Rng } from '../../engine/rng';

export interface Draft {
  /** Risk budget as a fraction of NAV (annualised volatility). */
  risk: number;
  /** Stop as a fraction of allocated capital; 1 = no stop. */
  stop: number;
}

export interface PMView {
  pm: PM;
  est: PMEstimate;
  draft: Draft;
  capital: number;
  /** Share of platform variance (can be negative for hedges). */
  riskShare: number;
  /** Correlation of this PM with the planned platform (excluding itself if not allocated). */
  corrToPlatform: number;
  /** Probability of hitting the stop within the next `weeks` weeks (bootstrap of the PM's history). */
  pStop: number;
}

export interface PlatformView {
  rows: PMView[];
  nav: number;
  gross: number;
  vol: number;
  expected: number;
  sharpe: number;
  divRatio: number;
  corr: number[][];
  ids: string[];
  maxPair: { a: string; b: string; c: number } | null;
}

export function availablePMs(s: AllocState): PM[] {
  return Object.values(s.pms)
    .filter((p) => p.status === 'active' || p.status === 'candidate')
    .sort((a, b) => (a.status === b.status ? a.pitchWeek - b.pitchWeek : a.status === 'active' ? -1 : 1));
}

/** Chance that a PM's book falls `stop` below its high-water mark within `weeks` weeks. */
export function stopProbability(pm: PM, est: PMEstimate, stop: number, weeks: number, paths = 500): number {
  if (!(stop < 1)) return 0;
  const xs = [...pm.track, ...pm.live];
  const m = xs.reduce((a, x) => a + x, 0) / xs.length;
  const drift = (est.sr * est.vol) / 52; // shrunk mean instead of the (flattering) sample mean
  const rng = new Rng('stopprob', pm.id, xs.length, Math.round(stop * 1000), weeks);
  let hit = 0;
  for (let p = 0; p < paths; p++) {
    let v = 1, hwm = 1;
    for (let w = 0; w < weeks; w++) {
      v *= 1 + xs[Math.floor(rng.next() * xs.length)] - m + drift;
      hwm = Math.max(hwm, v);
      if (1 - v / hwm >= stop) {
        hit++;
        break;
      }
    }
  }
  return hit / paths;
}

export function platformView(s: AllocState, drafts: Record<string, Draft>, weeks: number): PlatformView {
  const N = nav(s);
  const pms = availablePMs(s);
  const ests = pms.map((p) => estimate(p));
  const caps = pms.map((p, i) => ((drafts[p.id]?.risk ?? 0) * N) / Math.max(ests[i].vol, 1e-6));
  const C = covariance(commonReturns(pms, s.week));
  const w = caps.map((c) => c / N);
  const Cw = C.map((row) => row.reduce((a, c, j) => a + c * w[j], 0));
  const varW = w.reduce((a, x, i) => a + x * Cw[i], 0);
  const sdP = Math.sqrt(Math.max(varW, 0));
  const sd = C.map((row, i) => Math.sqrt(Math.max(row[i], 0)));
  const rows: PMView[] = pms.map((pm, i) => {
    const d = drafts[pm.id] ?? { risk: 0, stop: pm.stop };
    // correlation with the rest of the planned platform
    const restCw = Cw[i] - C[i][i] * w[i];
    const restVar = varW - 2 * w[i] * Cw[i] + w[i] * w[i] * C[i][i];
    const restSd = Math.sqrt(Math.max(restVar, 0));
    return {
      pm,
      est: ests[i],
      draft: d,
      capital: caps[i],
      riskShare: varW > 0 ? (w[i] * Cw[i]) / varW : 0,
      corrToPlatform: restSd > 0 && sd[i] > 0 ? restCw / (restSd * sd[i]) : 0,
      pStop: stopProbability(pm, ests[i], d.stop, weeks),
    };
  });
  const expected = rows.reduce((a, r) => a + (r.capital / N) * r.est.sr * r.est.vol, 0);
  const vol = sdP * Math.sqrt(52);
  const stand = rows.reduce((a, r) => a + (r.capital / N) * r.est.vol, 0);
  const corr = C.map((row, i) => row.map((c, j) => (sd[i] > 0 && sd[j] > 0 ? c / (sd[i] * sd[j]) : i === j ? 1 : 0)));
  let maxPair: PlatformView['maxPair'] = null;
  const live = rows.map((r, i) => (r.capital > 0 ? i : -1)).filter((i) => i >= 0);
  for (const i of live) for (const j of live) if (j > i && (!maxPair || corr[i][j] > maxPair.c)) maxPair = { a: pms[i].id, b: pms[j].id, c: corr[i][j] };
  return {
    rows,
    nav: N,
    gross: caps.reduce((a, c) => a + c, 0) / N,
    vol,
    expected,
    sharpe: vol > 0 ? expected / vol : 0,
    divRatio: vol > 0 ? stand / vol : 1,
    corr,
    ids: pms.map((p) => p.id),
    maxPair,
  };
}

export function verdict(t: number): { label: string; tone: string } {
  const a = Math.abs(t);
  if (a < 1.5) return { label: 'noise', tone: 'text-muted' };
  if (a < 2.5) return { label: 'weak evidence', tone: 'text-warn' };
  return { label: 'strong evidence', tone: t > 0 ? 'text-pos' : 'text-neg' };
}
