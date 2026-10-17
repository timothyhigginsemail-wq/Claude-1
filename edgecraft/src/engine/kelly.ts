// Position sizing: Kelly / log-optimal growth for binary bets, arbitrary
// discrete payoff tables, and correlated portfolios (numerical optimisation over
// Monte-Carlo scenarios).

import { goldenMax, solveSPD, type Matrix } from './math';

export interface PayoffOutcome {
  /** Return per $1 of exposure (e.g. +0.04 = +4%). */
  r: number;
  p: number;
}

/**
 * Classic Kelly for a bet that wins `b` per $1 staked with probability p and
 * loses `a` per $1 with probability 1-p:  f* = p/a − (1−p)/b.
 * For an even-money bet (a = b = 1) this is the familiar 2p − 1.
 */
export function kellyBinary(p: number, b: number, a = 1): number {
  return p / a - (1 - p) / b;
}

/** Expected log growth per period of wealth when a fraction f is exposed to the payoff table. */
export function expectedLogGrowth(f: number, outcomes: readonly PayoffOutcome[], cash = 0): number {
  let g = 0;
  for (const o of outcomes) {
    const w = 1 + cash + f * o.r;
    if (w <= 0) return -Infinity;
    g += o.p * Math.log(w);
  }
  return g;
}

export function expectedReturn(outcomes: readonly PayoffOutcome[]): number {
  return outcomes.reduce((s, o) => s + o.p * o.r, 0);
}

export function variance(outcomes: readonly PayoffOutcome[]): number {
  const m = expectedReturn(outcomes);
  return outcomes.reduce((s, o) => s + o.p * (o.r - m) ** 2, 0);
}

/** The largest exposure that keeps wealth strictly positive in every outcome. */
export function ruinBound(outcomes: readonly PayoffOutcome[]): number {
  const worst = Math.min(...outcomes.map((o) => o.r));
  return worst < 0 ? 1 / -worst : Infinity;
}

/**
 * Log-optimal (Kelly) exposure for an arbitrary discrete payoff table,
 * restricted to [0, fMax]. G(f) is strictly concave, so we bisect on G'(f).
 */
export function kellyDiscrete(outcomes: readonly PayoffOutcome[], fMax = 50): number {
  const deriv = (f: number) => outcomes.reduce((s, o) => s + (o.p * o.r) / (1 + f * o.r), 0);
  if (deriv(0) <= 0) return 0;
  const hi = Math.min(fMax, ruinBound(outcomes) * (1 - 1e-9));
  if (deriv(hi) >= 0) return hi;
  let lo = 0;
  let up = hi;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + up) / 2;
    if (deriv(mid) > 0) lo = mid;
    else up = mid;
  }
  return (lo + up) / 2;
}

/** Continuous (Gaussian) approximation: f* ≈ μ / σ². */
export function kellyGaussian(mu: number, sigma: number): number {
  return sigma > 0 ? mu / (sigma * sigma) : 0;
}

/**
 * Optimal shrinkage when the Kelly fraction is itself estimated with noise.
 * Near the optimum G(f) ≈ G* − ½σ²(f − f*)². If f̂ = f* + ε with Var(ε) = v and
 * you bet c·f̂, the expected growth loss is ½σ²[(c−1)²f*² + c²v], minimised at
 * c = f*² / (f*² + v).
 */
export function kellyShrinkage(fStar: number, fVar: number): number {
  if (fStar <= 0) return 0;
  return (fStar * fStar) / (fStar * fStar + fVar);
}

/** Unconstrained mean–variance Kelly for jointly Gaussian assets: w = Σ⁻¹ μ. */
export function kellyMeanVariance(mu: readonly number[], Sigma: Matrix): number[] {
  return solveSPD(Sigma, mu);
}

export interface ScenarioSet {
  /** Number of scenarios. */
  S: number;
  /** Number of assets. */
  N: number;
  /** Row-major S×N matrix of per-$ returns. */
  R: Float64Array;
  /** Optional scenario probabilities (default uniform). */
  w?: Float64Array;
}

export function portfolioReturns(sc: ScenarioSet, weights: readonly number[], cash = 0): Float64Array {
  const out = new Float64Array(sc.S);
  for (let s = 0; s < sc.S; s++) {
    let r = cash;
    const base = s * sc.N;
    for (let i = 0; i < sc.N; i++) if (weights[i] !== 0) r += weights[i] * sc.R[base + i];
    out[s] = r;
  }
  return out;
}

/** A deterministic per-period cost (transaction, financing...) as a function of weights, with its gradient. */
export type CostFn = (w: readonly number[]) => { c: number; g: number[] };

export function scenarioLogGrowth(sc: ScenarioSet, weights: readonly number[], cash = 0, costFn?: CostFn): number {
  const pr = portfolioReturns(sc, weights, cash);
  const tc = costFn ? costFn(weights).c : 0;
  let g = 0;
  let tot = 0;
  for (let s = 0; s < sc.S; s++) {
    const p = sc.w ? sc.w[s] : 1;
    const v = 1 + pr[s] - tc;
    if (v <= 0) return -Infinity;
    g += p * Math.log(v);
    tot += p;
  }
  return g / tot;
}

/** Proportional trading cost on |w − current| plus optional linear holding cost on |w|. */
export function linearCosts(tc: readonly number[], current: readonly number[], hold: readonly number[] = []): CostFn {
  return (w) => {
    let c = 0;
    const g = new Array(w.length).fill(0);
    for (let i = 0; i < w.length; i++) {
      const d = w[i] - (current[i] ?? 0);
      c += Math.abs(d) * tc[i] + Math.abs(w[i]) * (hold[i] ?? 0);
      g[i] = Math.sign(d) * tc[i] + Math.sign(w[i]) * (hold[i] ?? 0);
    }
    return { c, g };
  };
}

export interface LogOptOptions {
  lo?: readonly number[];
  hi?: readonly number[];
  /** Maximum Σ|w| (gross leverage). */
  maxGross?: number;
  costFn?: CostFn;
  /** Return on unallocated capital. */
  cash?: number;
  iters?: number;
  init?: readonly number[];
}

/** Project v onto {lo ≤ w ≤ hi, Σ|w| ≤ G}. Uses bisection on the soft-threshold multiplier. */
export function projectBoxL1(v: readonly number[], lo: readonly number[], hi: readonly number[], G: number): number[] {
  const clip = (x: number, i: number) => Math.min(hi[i], Math.max(lo[i], x));
  const at = (lam: number) => v.map((x, i) => clip(Math.sign(x) * Math.max(Math.abs(x) - lam, 0), i));
  const gross = (w: number[]) => w.reduce((s, x) => s + Math.abs(x), 0);
  const w0 = at(0);
  if (gross(w0) <= G) return w0;
  let a = 0;
  let b = Math.max(...v.map(Math.abs));
  for (let k = 0; k < 80; k++) {
    const m = (a + b) / 2;
    if (gross(at(m)) > G) a = m;
    else b = m;
  }
  return at(b);
}

/**
 * Maximise E[log(1 + cash + wᵀR − c(w))] over the scenario set, subject to box
 * and gross-leverage constraints. The objective is concave, so projected
 * gradient ascent with a diagonal-Hessian preconditioner and backtracking line
 * search converges to the constrained optimum.
 */
export function optimizeLogPortfolio(sc: ScenarioSet, opt: LogOptOptions = {}): { weights: number[]; growth: number } {
  const N = sc.N;
  const lo = opt.lo ?? new Array(N).fill(0);
  const hi = opt.hi ?? new Array(N).fill(10);
  const G = opt.maxGross ?? Infinity;
  const cash = opt.cash ?? 0;
  const iters = opt.iters ?? 300;
  const costFn = opt.costFn;
  let w = projectBoxL1(opt.init ?? new Array(N).fill(0), lo, hi, G);
  const f = (x: number[]) => scenarioLogGrowth(sc, x, cash, costFn);
  let fw = f(w);
  if (!isFinite(fw)) {
    w = projectBoxL1(new Array(N).fill(0), lo, hi, G);
    fw = f(w);
  }
  if (N === 0) return { weights: [], growth: fw };
  let tot = 0;
  for (let s = 0; s < sc.S; s++) tot += sc.w ? sc.w[s] : 1;

  for (let it = 0; it < iters; it++) {
    const pr = portfolioReturns(sc, w, cash);
    const cost = costFn ? costFn(w) : { c: 0, g: new Array(N).fill(0) };
    const grad = new Array(N).fill(0);
    const hdiag = new Array(N).fill(0);
    for (let s = 0; s < sc.S; s++) {
      const p = (sc.w ? sc.w[s] : 1) / tot;
      const inv = 1 / (1 + pr[s] - cost.c);
      const base = s * N;
      for (let i = 0; i < N; i++) {
        const r = sc.R[base + i] - cost.g[i];
        grad[i] += p * r * inv;
        hdiag[i] += p * r * r * inv * inv;
      }
    }
    let step = 1;
    let improved = false;
    for (let ls = 0; ls < 30; ls++) {
      const cand = projectBoxL1(
        w.map((x, i) => x + (step * grad[i]) / Math.max(hdiag[i], 1e-10)),
        lo,
        hi,
        G,
      );
      const fc = f(cand);
      if (isFinite(fc) && fc >= fw) {
        const moved = cand.reduce((s, x, i) => s + Math.abs(x - w[i]), 0);
        improved = fc > fw + 1e-13 && moved > 1e-10;
        w = cand;
        fw = fc;
        break;
      }
      step *= 0.5;
    }
    if (!improved) break;
  }
  return { weights: w, growth: fw };
}

/** Best scalar multiple k of a fixed portfolio direction (answers "right trades, wrong size?"). */
export function optimalScale(sc: ScenarioSet, weights: readonly number[], cash = 0, kMax = 20): { k: number; growth: number } {
  const g = (k: number) => {
    const v = scenarioLogGrowth(sc, weights.map((w) => w * k), cash);
    return isFinite(v) ? v : -1e9;
  };
  const pr = portfolioReturns(sc, weights, 0);
  let minR = 0;
  for (let s = 0; s < sc.S; s++) minR = Math.min(minR, pr[s]);
  const hi = minR < 0 ? Math.min(kMax, (0.995 * (1 + cash)) / -minR) : kMax;
  const k = goldenMax(g, 0, hi, 1e-5);
  return { k, growth: g(k) };
}
