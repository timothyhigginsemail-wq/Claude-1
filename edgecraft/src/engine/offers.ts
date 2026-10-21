// Opportunity flow. Generated from (seed, turn) and the market's true regime
// path only — never from the player's decisions — so replays are fair.

import {
  EVENT_TEMPLATE_LIST, TEMPLATE_KEYS, buildFromTemplate, buildFuture, capBeta, driftForEv, evSlope, fvec,
  evOf, idioFor, neutralProbs, template, thresholdsFromProbs, type Built, type Outcome, type Quality,
} from './instruments';
import { FACTORS, NF, bucketProbs, drawFactors, drawRegime, transitionMatrix, type FactorId, type RegimeId } from './market';
import { mean, normInv, solveSPD, std } from './math';
import { Rng } from './rng';
import type { Level } from './levels';

/**
 * Portfolio levels: per-trade weekly volatility closer to real spread/factor
 * books and annualised Sharpe ratios of roughly 0.5–1.0 for genuinely good
 * trades, so that the growth-optimal book is levered but not absurdly so.
 */
const PORTFOLIO_SCALE = { scale: 1.5, sharpeScale: 0.55 };

function pickQuality(rng: Rng, mix: [number, number, number]): Quality {
  return (['good', 'mediocre', 'trap'] as const)[rng.categorical(mix)];
}

/** Quality mix shifts with the regime: dislocations create real opportunities, calm crowds them out. */
function qualityMix(regime: RegimeId): [number, number, number] {
  switch (regime) {
    case 'liquidity':
    case 'volspike':
    case 'credit':
      return [0.45, 0.3, 0.25];
    case 'decay':
    case 'unwind':
      return [0.2, 0.35, 0.45];
    default:
      return [0.35, 0.35, 0.3];
  }
}

export function coinFlip(turn: number, rng: Rng): Built {
  const tpl = EVENT_TEMPLATE_LIST[3];
  const b = buildFromTemplate(rng, tpl, { turn, quality: 'good', lifeOverride: 1, name: 'Coin-flip spread: 55/45', slot: 'coin' });
  b.pub.outcomes = [{ label: 'Loses', r: -0.2 }, { label: 'Wins', r: 0.2 }];
  b.pub.thresholds = [0];
  b.pub.betaEst = fvec({});
  b.pub.idioEst = 1;
  const d = normInv(0.55);
  b.pub.estDrift = d;
  b.pub.statedSe = 0.005;
  b.pub.thesis = 'A clean even-money bet from a perfectly calibrated signal: you win 20% of the notional with probability 55%, otherwise you lose 20%. The cleanest possible test of sizing.';
  b.truth.beta = fvec({});
  b.truth.idio = 1;
  b.truth.drift0 = d;
  b.truth.err0 = 0;
  b.truth.decay = 0;
  return b;
}

/**
 * Markets price the regime they are in: re-calibrate a new trade's true drift
 * (and the desk's estimate, by the same amount) so that its expected return
 * under the prevailing regime equals the edge it was designed with, instead of
 * handing out free money for convexity or drift that everyone can already see.
 */
export function priceForRegime(b: Built, regime: RegimeId): Built {
  const { pub, truth } = b;
  if (regime === 'normal') return b;
  const neutralEv = evOf(pub.outcomes, neutralProbs(pub.thresholds, truth.drift0));
  const pairs = [{ from: regime, to: regime, w: 1 }];
  const evAt = (d: number) => evOf(pub.outcomes, bucketProbs(pub.thresholds, d, truth.beta, truth.idio, pairs));
  let lo = truth.drift0 - 3;
  let hi = truth.drift0 + 3;
  for (let i = 0; i < 60; i++) {
    const m = (lo + hi) / 2;
    if (evAt(m) < neutralEv) lo = m;
    else hi = m;
  }
  const d = (lo + hi) / 2 - truth.drift0;
  truth.drift0 += d;
  pub.estDrift += d;
  return b;
}

export function generateOffers(seed: string, level: Level, turn: number, regime: RegimeId, scenario?: string): Built[] {
  return generateRaw(seed, level, turn, regime, scenario).map((b) => (b.pub.archetype === 'future' ? b : priceForRegime(b, regime)));
}

const SCENARIO_KEYS: Record<string, string[]> = {
  unwind: ['statarb', 'factor_value', 'factor_mom', 'factor_rev', 'relval', 'factor_quality'],
  carrycrash: ['carry', 'shortvol', 'relval', 'macro_credit', 'merger', 'carry'],
  regimeshift: ['trend', 'factor_mom', 'trend', 'statarb', 'factor_rev', 'macro_cmd'],
};

function generateRaw(seed: string, level: Level, turn: number, regime: RegimeId, scenario?: string): Built[] {
  const rng = new Rng(seed, 'offers', turn);
  const out: Built[] = [];
  if (level === 1) {
    if (turn === 1) {
      out.push(coinFlip(turn, rng));
      return out;
    }
    const n = 3;
    for (let i = 0; i < n; i++) {
      const q = pickQuality(rng, [0.45, 0.37, 0.18]);
      if (rng.bernoulli(0.6)) {
        const tpl = rng.pick(EVENT_TEMPLATE_LIST);
        out.push(buildFromTemplate(rng, tpl, { turn, quality: q, lifeOverride: 1, slot: i }));
      } else {
        const key = rng.pick(['statarb', 'factor_mom', 'trend', 'carry', 'merger', 'longvol', 'shortvol', 'macro_rates']);
        out.push(buildFromTemplate(rng, template(key), { turn, quality: q, lifeOverride: 1, scale: 3.2, slot: i }));
      }
    }
    return out;
  }

  let mix = qualityMix(regime);
  if (scenario === 'overconfident') mix = [0.15, 0.25, 0.6];
  if (scenario === 'unwind' && turn <= 10) mix = [0.45, 0.35, 0.2];
  if (level === 2 && turn === 9) return tenStrategies(rng, turn);

  const n = level === 2 ? rng.int(4, 6) : rng.int(3, 5);
  const pool = scenario && SCENARIO_KEYS[scenario] ? [...SCENARIO_KEYS[scenario], ...SCENARIO_KEYS[scenario], ...TEMPLATE_KEYS] : TEMPLATE_KEYS.slice();
  const keys = rng.shuffle(pool);
  for (let i = 0; i < n; i++) {
    const key = keys[i % keys.length];
    out.push(buildFromTemplate(rng, template(key), { turn, quality: pickQuality(rng, mix), offerFor: rng.bernoulli(0.3) ? 2 : 1, slot: i, ...PORTFOLIO_SCALE, ...(scenario === 'unwind' ? { hidden: { LIQ: 0.4 } } : {}) }));
  }
  // a tail hedge is usually on the menu
  if (!out.some((b) => b.pub.archetype === 'tailhedge') && rng.bernoulli(0.5)) {
    out.push(buildFromTemplate(rng, template('tailhedge'), { turn, quality: pickQuality(rng, [0.5, 0.4, 0.1]), offerFor: 2, slot: 'h', ...PORTFOLIO_SCALE }));
  }
  return out;
}

/**
 * The "ten strategies" set: nominally different trades — different asset
 * classes, different stories, different reported loadings — that all secretly
 * load on the same liquidity/crowding factor.
 */
export function tenStrategies(rng: Rng, turn: number): Built[] {
  const keys = ['statarb', 'factor_value', 'factor_mom', 'factor_rev', 'merger', 'relval', 'carry', 'shortvol', 'macro_credit', 'factor_quality'];
  return keys.map((k, i) => {
    const tpl = template(k);
    const est: Partial<Record<FactorId, number>> = { ...tpl.beta, LIQ: 0.05 };
    const b = buildFromTemplate(rng, tpl, {
      turn, quality: rng.bernoulli(0.5) ? 'good' : 'mediocre', group: 'ten', offerFor: 2, slot: 't' + i, ...PORTFOLIO_SCALE,
      hidden: { LIQ: 0.75 }, betaEstOverride: est,
    });
    // The crowding loading dominates the truth; shrink the stated loadings so systematic variance stays valid.
    b.truth.beta = capBeta(b.truth.beta.map((x, i) => (FACTORS[i] === 'LIQ' ? x : x * 0.45)));
    b.truth.idio = idioFor(b.truth.beta);
    return b;
  });
}

export function permanentInstruments(seed: string, level: Level): Built[] {
  if (level === 1) return [];
  const rng = new Rng(seed, 'permanent');
  return [buildFuture(rng, 1, 'EQ'), buildFuture(rng, 1, 'RATES')];
}

// ---------------------------------------------------------------------------
// Level 3: strategy pods with track records

type Shape = 'sym' | 'neg' | 'pos';
const SHAPES: Record<Shape, { x: number[]; p: number[] }> = {
  sym: { x: [-2.4, -1.3, -0.5, 0.1, 0.6, 1.3, 2.4], p: [0.03, 0.12, 0.22, 0.26, 0.22, 0.12, 0.03] },
  neg: { x: [-6.5, -2.2, -0.7, 0.2, 0.5, 0.9, 1.3], p: [0.015, 0.05, 0.12, 0.25, 0.3, 0.2, 0.065] },
  pos: { x: [-1.3, -0.8, -0.3, 0.2, 0.9, 2.2, 5.0], p: [0.08, 0.22, 0.25, 0.2, 0.15, 0.08, 0.02] },
};

interface PodSpec {
  name: string;
  manager: string;
  style: string;
  shape: Shape;
  vol: number;
  beta: Partial<Record<FactorId, number>>;
  /** True annualised Sharpe. */
  sharpe: number;
  quality: Quality;
  /** Rejection-sample the track record until it looks at least this good (survivorship). */
  minTrackSharpe?: number;
}

const POD_SPECS: PodSpec[] = [
  { name: 'Kestrel Equity Stat-Arb', manager: 'D. Okafor', style: 'High-turnover equity market-neutral; earns liquidity premia.', shape: 'sym', vol: 0.016, beta: { LIQ: 0.5, MOM: -0.2 }, sharpe: 1.4, quality: 'good' },
  { name: 'Northwind Quant Factors', manager: 'L. Brandt', style: 'Multi-factor equity: value, momentum, quality.', shape: 'sym', vol: 0.017, beta: { VALUE: 0.35, MOM: 0.35, LIQ: 0.45 }, sharpe: 0.5, quality: 'mediocre' },
  { name: 'Halcyon Volatility Premium', manager: 'R. Castellanos', style: 'Systematic option selling across indices.', shape: 'neg', vol: 0.014, beta: { VOL: -0.6, EQ: 0.2, LIQ: 0.2 }, sharpe: 0.3, quality: 'trap', minTrackSharpe: 2.0 },
  { name: 'Meridian Global Macro', manager: 'A. Sørensen', style: 'Discretionary rates, FX and commodities.', shape: 'sym', vol: 0.022, beta: { RATES: 0.3, COMMOD: 0.3, CARRY: 0.25 }, sharpe: 0.8, quality: 'good' },
  { name: 'Saltmarsh Credit RV', manager: 'J. Whitfield', style: 'Levered capital-structure and basis arbitrage.', shape: 'neg', vol: 0.012, beta: { CREDIT: 0.45, LIQ: 0.4 }, sharpe: 0.7, quality: 'mediocre' },
  { name: 'Ridgeback Trend (CTA)', manager: 'M. Ito', style: 'Diversified futures trend following.', shape: 'pos', vol: 0.022, beta: { MOM: 0.7 }, sharpe: 0.75, quality: 'good' },
  { name: 'Lucky Star Discretionary', manager: 'C. Vance', style: 'Concentrated discretionary equity long/short.', shape: 'sym', vol: 0.025, beta: { EQ: 0.45 }, sharpe: 0.0, quality: 'trap', minTrackSharpe: 1.8 },
];

/** Historical market path (before the game) shared by every pod's track record. */
function historyPath(seed: string, weeks: number): { regime: RegimeId; Z: number[] }[] {
  const T = transitionMatrix('full');
  const rng = new Rng(seed, 'history');
  let r: RegimeId = 'normal';
  const out: { regime: RegimeId; Z: number[] }[] = [];
  for (let t = 0; t < weeks; t++) {
    const prev = r;
    r = drawRegime(rng, r, T);
    out.push({ regime: r, Z: drawFactors(rng, r, prev).Z });
  }
  return out;
}

export const TRACK_WEEKS = 78;

export function buildPods(seed: string): Built[] {
  const hist = historyPath(seed, TRACK_WEEKS);
  return POD_SPECS.map((spec, idx) => {
    const rng = new Rng(seed, 'pod', idx);
    const shape = SHAPES[spec.shape];
    const outcomes: Outcome[] = shape.x.map((x, k) => ({ label: ['Severe loss', 'Bad week', 'Down', 'Flat', 'Up', 'Good week', 'Exceptional'][k], r: x * spec.vol }));
    const thresholds = thresholdsFromProbs(shape.p);
    const beta = capBeta(fvec(spec.beta));
    const idio = idioFor(beta);
    // true drift: EV such that annualised Sharpe hits target under neutral conditions
    const sd0 = Math.sqrt(outcomes.reduce((s, o, k) => s + shape.p[k] * o.r * o.r, 0));
    const drift0 = driftForEv(outcomes, thresholds, (spec.sharpe / Math.sqrt(52)) * sd0);
    const slope = evSlope(outcomes, thresholds, drift0);

    // Track record, rejection-sampled for survivorship where specified.
    let track: number[] = [];
    let bestSh = -Infinity;
    for (let attempt = 0; attempt < 400; attempt++) {
      const cand = hist.map((h) => {
        let x = drift0 + Math.sqrt(idio) * rng.normal();
        for (let f = 0; f < NF; f++) x += beta[f] * h.Z[f];
        let k = 0;
        while (k < thresholds.length && x >= thresholds[k]) k++;
        return outcomes[k].r;
      });
      const sh = (mean(cand) / (std(cand) || 1)) * Math.sqrt(52);
      // survivorship: keep the best-looking record seen (stop once it clears the bar)
      if (sh > bestSh) {
        bestSh = sh;
        track = cand;
      }
      if (!spec.minTrackSharpe || sh >= spec.minTrackSharpe) {
        track = cand;
        break;
      }
    }

    // Desk estimates come from the track record itself.
    const m = mean(track);
    const s = std(track);
    const estDrift = driftForEv(outcomes, thresholds, m);
    const statedSe = Math.max(0.03, s / Math.sqrt(track.length) / Math.max(slope, 1e-6));
    const betaEst = capBeta(regressBetas(track, hist.map((h) => h.Z)).map((b) => b / Math.max(slope, 1e-6)));
    const id = `pod-${idx}`;
    // hidden edge path: managers' alpha switches off for stretches and sometimes comes back
    const erng = new Rng(seed, 'edge', idx);
    const edgePath: number[] = [];
    let on = 1;
    for (let w = 0; w < 600; w++) {
      edgePath.push(on);
      on = on ? (erng.bernoulli(0.015) ? 0 : 1) : erng.bernoulli(0.08) ? 1 : 0;
    }
    const offDrift = driftForEv(outcomes, thresholds, -0.3 * Math.abs(evOf(outcomes, neutralProbs(thresholds, drift0))));
    const built: Built = {
      pub: {
        id, archetype: 'pod', name: spec.name, ticker: spec.name.split(' ')[0].slice(0, 4).toUpperCase(),
        thesis: spec.style, manager: spec.manager,
        notes: [`${TRACK_WEEKS}-week track record`, 'Allocate capital; the pod runs its own book', 'Pods have capacity: big tickets cost more to deploy'],
        outcomes, thresholds, estDrift, estDrift0: estDrift, statedSe, se0: statedSe, betaEst, idioEst: idioFor(betaEst),
        createdTurn: 1, expiresTurn: 1e9, offerUntil: 1e9, margin: 0.25, tcBps: 20, finBps: 0.3,
        capacity: 1e6 * rng.uniform(0.3, 0.6), netFraction: 0.1, allowShort: false, maxPctNav: 1,
        research: { signal: false, risk: false }, researchCost: { signal: 0.0015, risk: 0.0008 },
        track, alive: true,
      },
      truth: { id, drift0, decay: spec.quality === 'trap' ? 0.0 : 0.004, beta, idio, err0: estDrift - drift0, errScale: 1, resNoise: 0, quality: spec.quality, edgePath, offDrift },
    };
    return built;
  });
}

/** OLS of returns on factor shocks with a light ridge penalty (52–78 noisy observations, 9 factors). */
function regressBetas(y: number[], Z: number[][]): number[] {
  const n = y.length;
  const ym = mean(y);
  const zm = FACTORS.map((_, k) => mean(Z.map((z) => z[k])));
  const A = FACTORS.map(() => new Array(NF).fill(0));
  const b = new Array(NF).fill(0);
  for (let t = 0; t < n; t++) {
    for (let i = 0; i < NF; i++) {
      const zi = Z[t][i] - zm[i];
      b[i] += zi * (y[t] - ym);
      for (let j = 0; j < NF; j++) A[i][j] += zi * (Z[t][j] - zm[j]);
    }
  }
  for (let i = 0; i < NF; i++) A[i][i] += n * 0.15;
  return solveSPD(A, b);
}

