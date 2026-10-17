// Sizing analytics used by the interactive sizing workspace: growth curves,
// marginal benefit vs. marginal drag, terminal-wealth fans and drawdown risk,
// for a single trade either standalone or on top of the existing book.

import { Rng } from './rng';

export interface JointSample {
  /** Return of the rest of the book (as a fraction of NAV) in each scenario. */
  rest: Float64Array;
  /** Return per $ of the new trade in each scenario. */
  r: Float64Array;
  /** Deterministic per-period cost/financing as a fraction of NAV for the rest of the book. */
  restCost: number;
  /** Proportional cost per unit of new exposure (fraction of NAV per unit). */
  unitCost: number;
}

export function sampleFromTable(outcomes: { r: number; p: number }[], S = 4000, seed = 'table'): JointSample {
  const rng = new Rng(seed);
  const r = new Float64Array(S);
  const w = outcomes.map((o) => o.p);
  // stratified sampling: exact proportions, shuffled
  let idx = 0;
  const counts = w.map((p) => Math.round(p * S));
  for (let k = 0; k < outcomes.length && idx < S; k++) for (let c = 0; c < counts[k] && idx < S; c++) r[idx++] = outcomes[k].r;
  while (idx < S) r[idx++] = outcomes[rng.categorical(w)].r;
  for (let i = S - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    const t = r[i];
    r[i] = r[j];
    r[j] = t;
  }
  return { rest: new Float64Array(S), r, restCost: 0, unitCost: 0 };
}

export interface CurvePoint {
  f: number;
  er: number;
  elog: number;
  drag: number;
  dragApprox: number;
  mBenefit: number;
  mCost: number;
  pRuin: number;
}

export function growthCurve(js: JointSample, fMax: number, steps = 60): CurvePoint[] {
  const S = js.r.length;
  let mr = 0, mrest = 0;
  for (let s = 0; s < S; s++) {
    mr += js.r[s];
    mrest += js.rest[s];
  }
  mr /= S;
  mrest /= S;
  let cov = 0, vr = 0;
  for (let s = 0; s < S; s++) {
    vr += (js.r[s] - mr) ** 2;
    cov += (js.r[s] - mr) * (js.rest[s] - mrest);
  }
  vr /= S;
  cov /= S;
  const pts: CurvePoint[] = [];
  const elogAt = (f: number) => {
    let g = 0;
    let bust = 0;
    const c = js.restCost + js.unitCost * f;
    for (let s = 0; s < S; s++) {
      const v = 1 + js.rest[s] + f * js.r[s] - c;
      if (v <= 0.0001) {
        bust++;
        g += Math.log(0.0001);
      } else g += Math.log(v);
    }
    return { g: g / S, bust: bust / S };
  };
  const base = elogAt(0).g;
  const erBase = mrest - js.restCost;
  for (let i = 0; i <= steps; i++) {
    const f = (fMax * i) / steps;
    const { g, bust } = elogAt(f);
    const er = erBase + f * mr - js.unitCost * f;
    const h = Math.max(fMax / steps / 2, 1e-4);
    const gU = elogAt(f + h).g;
    const gD = elogAt(Math.max(0, f - h)).g;
    const dG = (gU - gD) / (f + h - Math.max(0, f - h));
    const mBenefit = mr - js.unitCost;
    pts.push({
      f,
      er,
      elog: g,
      drag: er - g - (erBase - base),
      // quadratic approximation: incremental variance (own + 2·cov with the book) / 2
      dragApprox: (f * f * vr) / 2 + f * cov,
      mBenefit,
      mCost: mBenefit - dG,
      pRuin: bust,
    });
  }
  return pts;
}

export interface FanPoint {
  t: number;
  p5: number;
  p25: number;
  p50: number;
  p75: number;
  p95: number;
  mean: number;
}

/**
 * Monte-Carlo wealth paths when the same bet is repeated every turn at a fixed
 * fraction of current wealth (rebalanced), drawing joint scenarios i.i.d.
 */
export function wealthFan(js: JointSample, f: number, T = 26, paths = 600, seed = 'fan'): { fan: FanPoint[]; terminal: number[]; ddProb: (thr: number) => number } {
  const rng = new Rng(seed);
  const S = js.r.length;
  const W = new Float64Array(paths).fill(1);
  const peak = new Float64Array(paths).fill(1);
  const mdd = new Float64Array(paths);
  const fan: FanPoint[] = [{ t: 0, p5: 1, p25: 1, p50: 1, p75: 1, p95: 1, mean: 1 }];
  const c = js.restCost + js.unitCost * f;
  for (let t = 1; t <= T; t++) {
    for (let p = 0; p < paths; p++) {
      if (W[p] <= 0) continue;
      const s = Math.floor(rng.next() * S);
      const ret = Math.max(-1, js.rest[s] + f * js.r[s] - c);
      W[p] *= 1 + ret;
      if (W[p] > peak[p]) peak[p] = W[p];
      const dd = 1 - W[p] / peak[p];
      if (dd > mdd[p]) mdd[p] = dd;
    }
    const sorted = Float64Array.from(W).sort();
    const q = (x: number) => sorted[Math.min(paths - 1, Math.floor(x * paths))];
    let m = 0;
    for (let p = 0; p < paths; p++) m += W[p];
    fan.push({ t, p5: q(0.05), p25: q(0.25), p50: q(0.5), p75: q(0.75), p95: q(0.95), mean: m / paths });
  }
  return { fan, terminal: Array.from(W), ddProb: (thr) => mdd.reduce((a, d) => a + (d >= thr ? 1 : 0), 0) / paths };
}

/** P(max drawdown over T turns ≥ thr) as a function of exposure, with common random numbers across f. */
export function drawdownCurve(js: JointSample, fMax: number, thr: number, T = 26, paths = 400, steps = 30, seed = 'dd'): { f: number; p: number }[] {
  const rng = new Rng(seed);
  const S = js.r.length;
  const idx = new Uint32Array(paths * T);
  for (let i = 0; i < idx.length; i++) idx[i] = Math.floor(rng.next() * S);
  const out: { f: number; p: number }[] = [];
  for (let k = 0; k <= steps; k++) {
    const f = (fMax * k) / steps;
    const c = js.restCost + js.unitCost * f;
    let hit = 0;
    for (let p = 0; p < paths; p++) {
      let w = 1, pk = 1, breached = false;
      for (let t = 0; t < T; t++) {
        const s = idx[p * T + t];
        w *= 1 + Math.max(-1, js.rest[s] + f * js.r[s] - c);
        if (w > pk) pk = w;
        if (1 - w / pk >= thr || w <= 0) {
          breached = true;
          break;
        }
      }
      if (breached) hit++;
    }
    out.push({ f, p: hit / paths });
  }
  return out;
}
