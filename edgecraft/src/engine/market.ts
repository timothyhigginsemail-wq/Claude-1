// Latent-factor market model with hidden Markov regimes.
//
// Each period the market draws a regime r' from the transition matrix, then a
// vector of standardised factor shocks
//     Z = m_r' + diag(v_r') · L_r' · u  (+ jump J with prob p_J)
// where L_r' is the Cholesky factor of a regime-specific correlation matrix.
// Correlation matrices are built as normalise(B Bᵀ + D) from a small set of
// macro drivers, which guarantees they are valid (PSD) in every regime while
// letting stress regimes raise co-movement.

import { cholesky, normCdf, type Matrix } from './math';
import type { Rng } from './rng';

export const FACTORS = ['EQ', 'RATES', 'CREDIT', 'CARRY', 'VOL', 'MOM', 'VALUE', 'LIQ', 'COMMOD'] as const;
export type FactorId = (typeof FACTORS)[number];
export const NF = FACTORS.length;

export const FACTOR_INFO: Record<FactorId, { name: string; desc: string }> = {
  EQ: { name: 'Equity market', desc: 'Broad equity beta. Positive = stocks up.' },
  RATES: { name: 'Rates', desc: 'Interest-rate level. Positive = yields up / bonds down.' },
  CREDIT: { name: 'Credit', desc: 'Credit spreads. Positive = spreads tighten.' },
  CARRY: { name: 'FX carry', desc: 'High-yield vs funding currencies. Positive = carry pays.' },
  VOL: { name: 'Volatility', desc: 'Implied volatility. Positive = vol rises.' },
  MOM: { name: 'Momentum', desc: 'Cross-asset trend and momentum factor return.' },
  VALUE: { name: 'Value', desc: 'Cheap-minus-expensive factor return.' },
  LIQ: { name: 'Liquidity / crowding', desc: 'Return to liquidity provision and crowded quant books. Negative = de-grossing, forced selling.' },
  COMMOD: { name: 'Commodities', desc: 'Commodity complex. Positive = commodities up.' },
};

// Factor loadings on three macro drivers: [risk-on, liquidity, rates].
const DRIVER_LOADINGS: number[][] = [
  [0.6, 0.2, 0.0], // EQ
  [0.1, 0.0, 0.7], // RATES
  [0.5, 0.3, -0.2], // CREDIT
  [0.45, 0.25, 0.0], // CARRY
  [-0.6, -0.2, 0.0], // VOL
  [0.0, -0.1, 0.1], // MOM
  [0.1, 0.0, 0.3], // VALUE
  [0.15, 0.55, 0.0], // LIQ
  [0.3, 0.0, 0.1], // COMMOD
];

export type RegimeId = 'normal' | 'momentum' | 'meanrev' | 'volspike' | 'liquidity' | 'credit' | 'rates' | 'unwind' | 'decay';
export const REGIMES: RegimeId[] = ['normal', 'momentum', 'meanrev', 'volspike', 'liquidity', 'credit', 'rates', 'unwind', 'decay'];

export interface Jump {
  p: number;
  shift: Partial<Record<FactorId, number>>;
  label: string;
}

export interface RegimeSpec {
  id: RegimeId;
  name: string;
  blurb: string;
  mean: Partial<Record<FactorId, number>>;
  vol: Partial<Record<FactorId, number>>;
  /** Multipliers on the three macro-driver columns (raises/lowers co-movement). */
  driverScale: [number, number, number];
  jumps: Jump[];
  /** Persistence: probability of staying in the regime next period. */
  stay: number;
  /** Where it goes when it leaves (unnormalised). */
  exits: Partial<Record<RegimeId, number>>;
  /** Observable indicator targets: vol index, credit spread (bp), funding spread (bp), trend strength. */
  ind: { VLX: number; CDX: number; FUND: number; TRD: number };
  marginMult: number;
  costMult: number;
}

export const REGIME_SPECS: Record<RegimeId, RegimeSpec> = {
  normal: {
    id: 'normal', name: 'Normal', blurb: 'Orderly markets, average volatility, ample liquidity.',
    mean: { EQ: 0.08, CREDIT: 0.05, CARRY: 0.05, LIQ: 0.05 }, vol: {}, driverScale: [1, 1, 1],
    jumps: [], stay: 0.82, exits: { momentum: 3, meanrev: 3, volspike: 1.2, rates: 1, credit: 0.6, unwind: 0.6, decay: 0.8 },
    ind: { VLX: 15, CDX: 65, FUND: 20, TRD: 0 }, marginMult: 1, costMult: 1,
  },
  momentum: {
    id: 'momentum', name: 'Strong momentum', blurb: 'Persistent trends; winners keep winning, spreads keep diverging.',
    mean: { EQ: 0.12, MOM: 0.7, VALUE: -0.25, LIQ: -0.1 }, vol: { MOM: 1.1 }, driverScale: [1, 1, 1],
    jumps: [], stay: 0.8, exits: { normal: 4, meanrev: 1, volspike: 1, unwind: 1 },
    ind: { VLX: 14, CDX: 60, FUND: 20, TRD: 1.6 }, marginMult: 1, costMult: 1,
  },
  meanrev: {
    id: 'meanrev', name: 'Mean reversion', blurb: 'Choppy, range-bound tape. Dislocations close quickly.',
    mean: { MOM: -0.5, LIQ: 0.3, VALUE: 0.15 }, vol: { EQ: 0.9 }, driverScale: [0.9, 0.9, 1],
    jumps: [], stay: 0.8, exits: { normal: 4, momentum: 1, volspike: 0.8 },
    ind: { VLX: 17, CDX: 68, FUND: 22, TRD: -1.3 }, marginMult: 1, costMult: 1,
  },
  volspike: {
    id: 'volspike', name: 'Volatility spike', blurb: 'Implied vol jumps, equities fall, correlations rise.',
    mean: { EQ: -0.7, VOL: 1.2, CREDIT: -0.4, CARRY: -0.5, LIQ: -0.3 }, vol: { EQ: 1.8, VOL: 1.8, CREDIT: 1.4, CARRY: 1.5, LIQ: 1.4 },
    driverScale: [1.6, 1.3, 1], jumps: [{ p: 0.15, shift: { EQ: -2, VOL: 2.5, CARRY: -1.5 }, label: 'Equity gap down' }],
    stay: 0.6, exits: { normal: 3, liquidity: 1, meanrev: 1.5, credit: 0.8 },
    ind: { VLX: 31, CDX: 95, FUND: 35, TRD: -0.3 }, marginMult: 1.25, costMult: 1.6,
  },
  liquidity: {
    id: 'liquidity', name: 'Liquidity crisis', blurb: 'Funding dries up, haircuts rise, everything correlated sells off.',
    mean: { EQ: -0.9, CREDIT: -0.9, CARRY: -0.8, VOL: 1.2, LIQ: -1.4, VALUE: -0.2 }, vol: { EQ: 2, CREDIT: 2, CARRY: 2, VOL: 1.8, LIQ: 2.2 },
    driverScale: [1.8, 2.2, 1], jumps: [{ p: 0.25, shift: { LIQ: -2.5, CREDIT: -1.5, CARRY: -2 }, label: 'Fire sale' }],
    stay: 0.55, exits: { volspike: 2, normal: 1.5, meanrev: 1.5 },
    ind: { VLX: 38, CDX: 150, FUND: 85, TRD: -0.5 }, marginMult: 1.6, costMult: 2.5,
  },
  credit: {
    id: 'credit', name: 'Credit stress', blurb: 'Spreads widen, defaults rise, deal financing gets pulled.',
    mean: { CREDIT: -1.0, EQ: -0.4, CARRY: -0.4, LIQ: -0.4, VOL: 0.6 }, vol: { CREDIT: 1.9, EQ: 1.3, CARRY: 1.3 },
    driverScale: [1.4, 1.5, 1], jumps: [{ p: 0.15, shift: { CREDIT: -2.5, EQ: -1 }, label: 'Default wave' }],
    stay: 0.7, exits: { normal: 2, liquidity: 1, volspike: 1 },
    ind: { VLX: 26, CDX: 140, FUND: 45, TRD: -0.2 }, marginMult: 1.2, costMult: 1.5,
  },
  rates: {
    id: 'rates', name: 'Rate shock', blurb: 'Yields gap higher; duration and rate-sensitive carry reprice.',
    mean: { RATES: 1.1, EQ: -0.3, VALUE: 0.4, CARRY: -0.2 }, vol: { RATES: 1.8, EQ: 1.2 },
    driverScale: [1.1, 1, 1.6], jumps: [{ p: 0.15, shift: { RATES: 2.5, EQ: -0.8 }, label: 'Central-bank surprise' }],
    stay: 0.7, exits: { normal: 3, volspike: 1, credit: 0.6 },
    ind: { VLX: 21, CDX: 80, FUND: 30, TRD: 0.4 }, marginMult: 1.1, costMult: 1.2,
  },
  unwind: {
    id: 'unwind', name: 'Crowded-position unwind', blurb: 'Quant books de-gross simultaneously. Low-correlation signals all lose together.',
    mean: { LIQ: -1.6, MOM: -0.6, VALUE: -0.5, EQ: -0.1 }, vol: { LIQ: 2.4, MOM: 1.6, VALUE: 1.5 },
    driverScale: [1, 2.4, 1], jumps: [{ p: 0.3, shift: { LIQ: -2.5, MOM: -1.2 }, label: 'Quant quake' }],
    stay: 0.5, exits: { normal: 2, meanrev: 2, liquidity: 0.6 },
    ind: { VLX: 20, CDX: 72, FUND: 38, TRD: -0.6 }, marginMult: 1.2, costMult: 1.8,
  },
  decay: {
    id: 'decay', name: 'Structural alpha decay', blurb: 'Signals are crowded; edge quietly erodes. Indicators look normal.',
    mean: { LIQ: -0.45, MOM: -0.15, VALUE: -0.15, EQ: 0.05 }, vol: {}, driverScale: [1, 1.1, 1],
    jumps: [], stay: 0.85, exits: { normal: 3, unwind: 1 },
    ind: { VLX: 15, CDX: 66, FUND: 21, TRD: 0 }, marginMult: 1, costMult: 1.1,
  },
};

const IND_KEYS = ['VLX', 'CDX', 'FUND', 'TRD'] as const;
export type IndKey = (typeof IND_KEYS)[number];
export const IND_INFO: Record<IndKey, { name: string; unit: string; kappa: number; sd: number }> = {
  VLX: { name: 'Vol index', unit: '', kappa: 0.45, sd: 2.6 },
  CDX: { name: 'Credit spread', unit: 'bp', kappa: 0.4, sd: 9 },
  FUND: { name: 'Funding spread', unit: 'bp', kappa: 0.45, sd: 7 },
  TRD: { name: 'Trend strength', unit: 'z', kappa: 0.5, sd: 0.55 },
};
export type Indicators = Record<IndKey, number>;

export function factorVec(p: Partial<Record<FactorId, number>>, dflt = 0): number[] {
  return FACTORS.map((f) => p[f] ?? dflt);
}

export function regimeCorrelation(r: RegimeId): Matrix {
  const s = REGIME_SPECS[r].driverScale;
  const B = DRIVER_LOADINGS.map((row) => row.map((x, j) => x * s[j]));
  const C: Matrix = B.map((bi) => B.map((bj) => bi.reduce((acc, x, k) => acc + x * bj[k], 0)));
  // idiosyncratic part chosen so the neutral-regime diagonal is exactly 1
  const d = DRIVER_LOADINGS.map((row) => Math.max(0.05, 1 - row.reduce((a, x) => a + x * x, 0)));
  const diag = C.map((row, i) => row[i] + d[i]);
  return C.map((row, i) => row.map((c, j) => (i === j ? 1 : c / Math.sqrt(diag[i] * diag[j]))));
}

export interface RegimeModel {
  id: RegimeId;
  /** The regime's characteristic factor drift (applied in full on entry, partially while it persists). */
  mean: number[];
  vol: number[];
  corr: Matrix;
  /** covariance of Z excluding jumps = diag(v) C diag(v) */
  cov: Matrix;
  chol: Matrix;
  jumps: { p: number; shift: number[]; label: string }[];
}

const modelCache = new Map<RegimeId, RegimeModel>();
export function regimeModel(r: RegimeId): RegimeModel {
  const hit = modelCache.get(r);
  if (hit) return hit;
  const spec = REGIME_SPECS[r];
  const mean = factorVec(spec.mean);
  const vol = factorVec(spec.vol, 1);
  const corr = regimeCorrelation(r);
  const cov = corr.map((row, i) => row.map((c, j) => c * vol[i] * vol[j]));
  const m: RegimeModel = {
    id: r, mean, vol, corr, cov, chol: cholesky(cov),
    jumps: spec.jumps.map((j) => ({ p: j.p, shift: factorVec(j.shift), label: j.label })),
  };
  modelCache.set(r, m);
  return m;
}

/** The neutral reference distribution used to calibrate instrument thresholds. */
export const NEUTRAL_CORR = regimeCorrelation('normal');

/**
 * Factor mean for a period that transitions from one regime to another. The
 * surprise is concentrated in the transition: entering a regime delivers its
 * shock (and unwinds part of the previous regime's displacement), while
 * staying in it mostly brings its volatility and correlation, with only a
 * modest predictable drift.
 */
/** Fraction of a regime's drift that persists while it lasts. Stress drifts are priced in after the shock. */
export const STAY_FRACTION: Record<RegimeId, number> = {
  normal: 1, momentum: 0.4, meanrev: 0.4, decay: 0.6, volspike: 0, liquidity: 0, credit: 0, rates: 0, unwind: 0.15,
};

export function pairMean(from: RegimeId, to: RegimeId): number[] {
  const mt = regimeModel(to).mean;
  if (from === to) return mt.map((x) => STAY_FRACTION[to] * x);
  const mf = regimeModel(from).mean;
  return mt.map((x, i) => 1.5 * x - 0.5 * mf[i]);
}

export interface RegimePair {
  from: RegimeId;
  to: RegimeId;
  w: number;
}

export function pairsFromBelief(belief: Partial<Record<RegimeId, number>>, T: Record<RegimeId, Record<RegimeId, number>>): RegimePair[] {
  const out: RegimePair[] = [];
  for (const f of REGIMES) {
    const bf = belief[f] ?? 0;
    if (bf <= 1e-9) continue;
    for (const t of REGIMES) {
      const w = bf * T[f][t];
      if (w > 1e-9) out.push({ from: f, to: t, w });
    }
  }
  return out;
}

export function pairsFromRegime(r: RegimeId, T: Record<RegimeId, Record<RegimeId, number>>): RegimePair[] {
  return pairsFromBelief({ [r]: 1 }, T);
}

export type RegimeSet = 'calm' | 'full';

/** Transition matrix restricted to the regimes allowed at a given difficulty. */
export function transitionMatrix(set: RegimeSet): Record<RegimeId, Record<RegimeId, number>> {
  const allowed: RegimeId[] = set === 'calm' ? ['normal', 'momentum', 'meanrev'] : REGIMES;
  const out = {} as Record<RegimeId, Record<RegimeId, number>>;
  for (const r of REGIMES) {
    const spec = REGIME_SPECS[r];
    const row = {} as Record<RegimeId, number>;
    let exitTot = 0;
    for (const t of allowed) if (t !== r) exitTot += spec.exits[t] ?? 0;
    for (const t of REGIMES) row[t] = 0;
    if (!allowed.includes(r)) {
      row.normal = 1;
    } else if (exitTot === 0) {
      row[r] = 1;
    } else {
      row[r] = spec.stay;
      for (const t of allowed) if (t !== r) row[t] = ((1 - spec.stay) * (spec.exits[t] ?? 0)) / exitTot;
    }
    out[r] = row;
  }
  return out;
}

export interface FactorDraw {
  regime: RegimeId;
  Z: number[];
  jump: string | null;
}

export function drawRegime(rng: Rng, from: RegimeId, T: Record<RegimeId, Record<RegimeId, number>>): RegimeId {
  const row = T[from];
  return REGIMES[rng.categorical(REGIMES.map((r) => row[r]))];
}

export function drawFactors(rng: Rng, regime: RegimeId, from: RegimeId = regime): FactorDraw {
  const m = regimeModel(regime);
  const u = FACTORS.map(() => rng.normal());
  const Z = pairMean(from, regime);
  for (let i = 0; i < NF; i++) {
    let s = 0;
    for (let k = 0; k <= i; k++) s += m.chol[i][k] * u[k];
    Z[i] += s;
  }
  let jump: string | null = null;
  const uj = rng.next();
  let acc = 0;
  for (const j of m.jumps) {
    acc += j.p;
    if (uj < acc) {
      jump = j.label;
      for (let i = 0; i < NF; i++) Z[i] += j.shift[i];
      break;
    }
  }
  return { regime, Z, jump };
}

/**
 * Distribution of the linear combination βᵀZ under a regime: a mixture of
 * Gaussians (no-jump + each jump). Returns components {w, mu, sd}.
 */
export function linearMixture(beta: readonly number[], from: RegimeId, r: RegimeId): { w: number; mu: number; var: number }[] {
  const m = regimeModel(r);
  const mean = pairMean(from, r);
  let mu = 0;
  for (let i = 0; i < NF; i++) mu += beta[i] * mean[i];
  let v = 0;
  for (let i = 0; i < NF; i++) for (let j = 0; j < NF; j++) v += beta[i] * m.cov[i][j] * beta[j];
  const pj = m.jumps.reduce((s, j) => s + j.p, 0);
  const comps = [{ w: 1 - pj, mu, var: v }];
  for (const j of m.jumps) comps.push({ w: j.p, mu: mu + beta.reduce((s, b, i) => s + b * j.shift[i], 0), var: v });
  return comps;
}

/** P(a ≤ X < b) for X = c + βᵀZ + √idio ε, mixed over (from → to) regime transitions. */
export function bucketProbs(
  thresholds: readonly number[],
  drift: number,
  beta: readonly number[],
  idioVar: number,
  pairs: readonly RegimePair[],
): number[] {
  const K = thresholds.length + 1;
  const out = new Array(K).fill(0);
  for (const pr of pairs) {
    const wr = pr.w;
    if (wr <= 0) continue;
    for (const c of linearMixture(beta, pr.from, pr.to)) {
      if (c.w <= 0) continue;
      const sd = Math.sqrt(c.var + idioVar);
      let prev = 0;
      for (let k = 0; k < K; k++) {
        const cdf = k < K - 1 ? normCdf((thresholds[k] - drift - c.mu) / sd) : 1;
        out[k] += wr * c.w * (cdf - prev);
        prev = cdf;
      }
    }
  }
  const tot = out.reduce((a, b) => a + b, 0);
  return out.map((x) => x / tot);
}

// ---------- Observable indicators and the desk's regime filter ----------

export function initialIndicators(r: RegimeId): Indicators {
  return { ...REGIME_SPECS[r].ind };
}

export function stepIndicators(rng: Rng, prev: Indicators, r: RegimeId): Indicators {
  const tgt = REGIME_SPECS[r].ind;
  const out = {} as Indicators;
  for (const k of IND_KEYS) {
    const info = IND_INFO[k];
    out[k] = prev[k] + info.kappa * (tgt[k] - prev[k]) + info.sd * rng.normal();
  }
  return out;
}

/**
 * One step of the HMM forward filter. The desk observes the indicators (never
 * the regime itself) and updates P(regime | observations). Regimes with
 * identical indicator signatures (e.g. "normal" and "structural alpha decay")
 * cannot be told apart — exactly the point.
 */
export function filterStep(
  belief: Record<RegimeId, number>,
  prevInd: Indicators,
  ind: Indicators,
  T: Record<RegimeId, Record<RegimeId, number>>,
): Record<RegimeId, number> {
  const post = {} as Record<RegimeId, number>;
  let tot = 0;
  for (const r of REGIMES) {
    let prior = 0;
    for (const q of REGIMES) prior += belief[q] * T[q][r];
    let ll = 0;
    const tgt = REGIME_SPECS[r].ind;
    for (const k of IND_KEYS) {
      const info = IND_INFO[k];
      const pred = prevInd[k] + info.kappa * (tgt[k] - prevInd[k]);
      const z = (ind[k] - pred) / info.sd;
      ll += -0.5 * z * z;
    }
    post[r] = prior * Math.exp(ll);
    tot += post[r];
  }
  for (const r of REGIMES) post[r] = tot > 0 ? post[r] / tot : 1 / REGIMES.length;
  return post;
}

/** Distribution of next period's regime given a belief over the current one. */
export function predictRegime(belief: Partial<Record<RegimeId, number>>, T: Record<RegimeId, Record<RegimeId, number>>): Record<RegimeId, number> {
  const out = {} as Record<RegimeId, number>;
  for (const r of REGIMES) {
    let s = 0;
    for (const q of REGIMES) s += (belief[q] ?? 0) * T[q][r];
    out[r] = s;
  }
  return out;
}
