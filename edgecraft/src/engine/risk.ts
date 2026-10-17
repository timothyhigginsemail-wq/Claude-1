// The desk's risk model: Monte-Carlo scenarios built ONLY from public
// information (estimated drifts, estimated loadings, the filtered regime
// belief), plus the portfolio analytics computed from them.

import { FACTORS, NF, REGIMES, drawFactors, type FactorId, type RegimePair } from './market';
import { bucketOf, evOf, evSlope, neutralProbs, outcomeProbs, sdOf, winProb, type InstrumentPublic } from './instruments';
import { covToCorr, normInv, quantilesSorted, type Matrix } from './math';
import { Rng } from './rng';
import type { ScenarioSet } from './kelly';

export interface ModelParams {
  drift: number;
  beta: number[];
  idio: number;
}

export function deskParams(p: InstrumentPublic): ModelParams {
  return { drift: p.estDrift, beta: p.betaEst, idio: p.idioEst };
}

export interface Scenarios extends ScenarioSet {
  ids: string[];
  /** Factor draws, S×NF. */
  Z: Float64Array;
  /** Outcome index per scenario and instrument, S×N. */
  K: Uint8Array;
  regime: Uint8Array;
}

/**
 * Joint scenarios: regime ~ weights, factor shocks from that regime, then each
 * instrument's latent X mapped through its thresholds. Marginal outcome
 * probabilities equal outcomeProbs(...) by construction, and dependence comes
 * entirely from shared factor exposure.
 */
export function buildScenarios(
  insts: readonly InstrumentPublic[],
  params: readonly ModelParams[],
  pairs: readonly RegimePair[],
  seedParts: readonly (string | number)[],
  S = 3000,
): Scenarios {
  // Factor draws come from one stream and each instrument's idiosyncratic draws
  // from its own stream, so any subset of instruments sees identical scenarios.
  const N = insts.length;
  const R = new Float64Array(S * N);
  const K = new Uint8Array(S * N);
  const Z = new Float64Array(S * NF);
  const regime = new Uint8Array(S);
  const weights = pairs.map((p) => p.w);
  const frng = new Rng(seedParts[0], ...seedParts.slice(1), 'factors');
  for (let s = 0; s < S; s++) {
    const pi = frng.categorical(weights);
    const pr = pairs[pi];
    regime[s] = REGIMES.indexOf(pr.to);
    const fd = drawFactors(frng, pr.to, pr.from);
    for (let f = 0; f < NF; f++) Z[s * NF + f] = fd.Z[f];
  }
  for (let i = 0; i < N; i++) {
    const p = params[i];
    const sq = Math.sqrt(p.idio);
    const irng = new Rng(seedParts[0], ...seedParts.slice(1), 'idio', insts[i].id);
    // Stratified (Latin-hypercube) idiosyncratic draws: one draw per 1/S quantile
    // slice, randomly permuted, so each instrument's marginal is reproduced
    // almost exactly instead of with ±1/√S sampling noise.
    const perm = irng.shuffle(Array.from({ length: S }, (_, k) => k));
    for (let s = 0; s < S; s++) {
      let x = p.drift + sq * normInv((perm[s] + irng.next()) / S);
      for (let f = 0; f < NF; f++) x += p.beta[f] * Z[s * NF + f];
      const k = bucketOf(x, insts[i].thresholds);
      K[s * N + i] = k;
      R[s * N + i] = insts[i].outcomes[k].r;
    }
  }
  return { S, N, R, Z, K, regime, ids: insts.map((i) => i.id) };
}

/** Restrict a scenario set to a subset of its instruments (same draws). */
export function subsetScenarios(sc: Scenarios, ids: readonly string[]): Scenarios {
  const idx = ids.map((id) => sc.ids.indexOf(id));
  if (idx.some((i) => i < 0)) throw new Error('subsetScenarios: unknown id');
  const N = ids.length;
  const R = new Float64Array(sc.S * N);
  const K = new Uint8Array(sc.S * N);
  for (let s = 0; s < sc.S; s++)
    for (let j = 0; j < N; j++) {
      R[s * N + j] = sc.R[s * sc.N + idx[j]];
      K[s * N + j] = sc.K[s * sc.N + idx[j]];
    }
  return { S: sc.S, N, R, K, Z: sc.Z, regime: sc.regime, ids: ids.slice() };
}

export interface Quote {
  probs: number[];
  ev: number;
  sd: number;
  win: number;
  winLo: number;
  winHi: number;
  evLo: number;
  evHi: number;
  /** Worst modelled outcome (return per $). */
  worst: number;
  best: number;
  sharpe: number;
}

/** The desk's quoted statistics for the next period (with a 95% band from estimation error). */
export function quoteInstrument(p: InstrumentPublic, pairs: readonly RegimePair[]): Quote {
  const probs = outcomeProbs(p, p.estDrift, p.betaEst, p.idioEst, pairs);
  const lo = outcomeProbs(p, p.estDrift - 1.96 * p.statedSe, p.betaEst, p.idioEst, pairs);
  const hi = outcomeProbs(p, p.estDrift + 1.96 * p.statedSe, p.betaEst, p.idioEst, pairs);
  const ev = evOf(p.outcomes, probs);
  const sd = sdOf(p.outcomes, probs);
  return {
    probs,
    ev,
    sd,
    win: winProb(p.outcomes, probs),
    winLo: winProb(p.outcomes, lo),
    winHi: winProb(p.outcomes, hi),
    evLo: evOf(p.outcomes, lo),
    evHi: evOf(p.outcomes, hi),
    worst: Math.min(...p.outcomes.map((o) => o.r)),
    best: Math.max(...p.outcomes.map((o) => o.r)),
    sharpe: sd > 0 ? ev / sd : 0,
  };
}

/** $ sensitivity of an instrument's return to a 1-unit move in its latent X (Stein: Cov(R,X)/Var X). */
export function latentSlope(p: InstrumentPublic): number {
  return evSlope(p.outcomes, p.thresholds, p.estDrift);
}

export interface PortfolioStats {
  er: number;
  vol: number;
  elog: number;
  var95: number;
  es95: number;
  pLoss5: number;
  pLoss10: number;
  pctl: number[]; // 1,5,25,50,75,95,99
}

export function portfolioStats(sc: ScenarioSet, w: readonly number[], deterministic = 0): PortfolioStats {
  const S = sc.S;
  const pr = new Float64Array(S);
  let m = 0;
  let elog = 0;
  for (let s = 0; s < S; s++) {
    let r = deterministic;
    for (let i = 0; i < sc.N; i++) if (w[i]) r += w[i] * sc.R[s * sc.N + i];
    pr[s] = r;
    m += r;
    elog += r > -1 ? Math.log(1 + r) : -50;
  }
  m /= S;
  elog /= S;
  let v = 0;
  let l5 = 0;
  let l10 = 0;
  for (let s = 0; s < S; s++) {
    v += (pr[s] - m) ** 2;
    if (pr[s] <= -0.05) l5++;
    if (pr[s] <= -0.1) l10++;
  }
  const sorted = Float64Array.from(pr).sort();
  const n5 = Math.max(1, Math.floor(S * 0.05));
  let es = 0;
  for (let s = 0; s < n5; s++) es += sorted[s];
  es /= n5;
  const pctl = quantilesSorted(sorted, [0.01, 0.05, 0.25, 0.5, 0.75, 0.95, 0.99]);
  return { er: m, vol: Math.sqrt(v / (S - 1)), elog, var95: -pctl[1], es95: -es, pLoss5: l5 / S, pLoss10: l10 / S, pctl };
}

export function scenarioCov(sc: ScenarioSet): Matrix {
  const N = sc.N;
  const S = sc.S;
  const mu = new Array(N).fill(0);
  for (let s = 0; s < S; s++) for (let i = 0; i < N; i++) mu[i] += sc.R[s * N + i];
  for (let i = 0; i < N; i++) mu[i] /= S;
  const C: Matrix = Array.from({ length: N }, () => new Array(N).fill(0));
  for (let s = 0; s < S; s++) {
    const b = s * N;
    for (let i = 0; i < N; i++) {
      const di = sc.R[b + i] - mu[i];
      if (di === 0) continue;
      for (let j = i; j < N; j++) C[i][j] += di * (sc.R[b + j] - mu[j]);
    }
  }
  for (let i = 0; i < N; i++)
    for (let j = i; j < N; j++) {
      C[i][j] /= S - 1;
      C[j][i] = C[i][j];
    }
  return C;
}

export function scenarioCorr(sc: ScenarioSet): Matrix {
  return covToCorr(scenarioCov(sc));
}

/** Correlation of returns conditional on a subset of scenarios (e.g. stressed regimes only). */
export function conditionalCorr(sc: Scenarios, keep: (s: number) => boolean): Matrix {
  const rows: number[] = [];
  for (let s = 0; s < sc.S; s++) if (keep(s)) rows.push(s);
  const R = new Float64Array(rows.length * sc.N);
  rows.forEach((s, j) => {
    for (let i = 0; i < sc.N; i++) R[j * sc.N + i] = sc.R[s * sc.N + i];
  });
  return rows.length > 20 ? scenarioCorr({ S: rows.length, N: sc.N, R }) : covToCorr(scenarioCov(sc));
}

export interface RiskContrib {
  sigma: number;
  /** Marginal contribution ∂σ/∂w_i. */
  mrc: number[];
  /** Component contribution w_i · ∂σ/∂w_i (sums to σ). */
  rc: number[];
  /** Diversification ratio Σ|w_i|σ_i / σ_p. */
  divRatio: number;
}

export function riskContrib(C: Matrix, w: readonly number[]): RiskContrib {
  const N = w.length;
  const Cw = C.map((row) => row.reduce((s, c, j) => s + c * w[j], 0));
  const v = w.reduce((s, x, i) => s + x * Cw[i], 0);
  const sigma = Math.sqrt(Math.max(v, 0));
  const mrc = Cw.map((x) => (sigma > 0 ? x / sigma : 0));
  const rc = w.map((x, i) => x * mrc[i]);
  let stand = 0;
  for (let i = 0; i < N; i++) stand += Math.abs(w[i]) * Math.sqrt(Math.max(C[i][i], 0));
  return { sigma, mrc, rc, divRatio: sigma > 0 ? stand / sigma : 1 };
}

/**
 * Dollar factor exposures: expected $ P&L per +1σ move in each factor, using
 * the desk's estimated loadings and each trade's latent slope.
 */
export function factorExposures(insts: readonly InstrumentPublic[], notionals: readonly number[]): Record<FactorId, number> {
  const out = {} as Record<FactorId, number>;
  FACTORS.forEach((f) => (out[f] = 0));
  insts.forEach((p, i) => {
    if (!notionals[i]) return;
    const b = latentSlope(p);
    FACTORS.forEach((f, k) => (out[f] += notionals[i] * b * p.betaEst[k]));
  });
  return out;
}

export interface StressScenario {
  id: string;
  name: string;
  desc: string;
  Z: Partial<Record<FactorId, number>>;
}

export const STRESS_SCENARIOS: StressScenario[] = [
  { id: 'gfc', name: '2008-style liquidity crunch', desc: 'Funding withdrawn, credit gaps wider, equities crash.', Z: { LIQ: -4, CREDIT: -3.5, EQ: -3, VOL: 3.5, CARRY: -3, COMMOD: -2 } },
  { id: 'quake', name: 'Aug-2007 quant quake', desc: 'Crowded quant books de-gross; markets barely move.', Z: { LIQ: -4.5, MOM: -2.5, VALUE: -2 } },
  { id: 'volm', name: 'Volmageddon', desc: 'Volatility doubles overnight.', Z: { VOL: 5, EQ: -2.5, LIQ: -1 } },
  { id: 'taper', name: 'Taper tantrum', desc: 'Yields gap higher on a policy surprise.', Z: { RATES: 3.5, EQ: -1, CARRY: -1.5, CREDIT: -1 } },
  { id: 'momcrash', name: 'Momentum crash', desc: 'Junk rallies, winners collapse.', Z: { MOM: -4, VALUE: 2, EQ: 1.5 } },
  { id: 'carry', name: 'Carry unwind', desc: 'Funding currencies spike; high-yielders gap lower.', Z: { CARRY: -4, VOL: 2, EQ: -1 } },
];

/** Deterministic stress: set factors, zero idiosyncratic noise, map through each trade's payoff. */
export function stressPnl(insts: readonly InstrumentPublic[], notionals: readonly number[], params: readonly ModelParams[], z: Partial<Record<FactorId, number>>): { total: number; per: number[] } {
  const Z = FACTORS.map((f) => z[f] ?? 0);
  const per = insts.map((p, i) => {
    const x = params[i].drift + params[i].beta.reduce((s, b, k) => s + b * Z[k], 0);
    return notionals[i] * p.outcomes[bucketOf(x, p.thresholds)].r;
  });
  return { total: per.reduce((a, b) => a + b, 0), per };
}

/** Distribution of the number of losing positions (joint model vs. if they were independent). */
export function losersDistribution(sc: Scenarios, cols: readonly number[]): { joint: number[]; indep: number[] } {
  const n = cols.length;
  const joint = new Array(n + 1).fill(0);
  const pLose = cols.map(() => 0);
  for (let s = 0; s < sc.S; s++) {
    let c = 0;
    cols.forEach((i, j) => {
      if (sc.R[s * sc.N + i] < 0) {
        c++;
        pLose[j]++;
      }
    });
    joint[c]++;
  }
  for (let k = 0; k <= n; k++) joint[k] /= sc.S;
  // Poisson-binomial under independence
  let indep = [1];
  pLose.forEach((cnt) => {
    const p = cnt / sc.S;
    const next = new Array(indep.length + 1).fill(0);
    indep.forEach((v, k) => {
      next[k] += v * (1 - p);
      next[k + 1] += v * p;
    });
    indep = next;
  });
  return { joint, indep };
}

export { neutralProbs };
