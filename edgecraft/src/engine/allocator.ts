// Multi-manager allocator engine.
//
// You are the CIO of a multi-manager platform. Each round you give PMs a risk
// budget and a stop-loss, then the market runs forward 4–8 weeks. PMs keep
// their capital until they hit their stop or you redeem them.
//
// The whole market path (regimes, factor shocks, observable indicators) and
// every PM's weekly return are deterministic functions of the seed, so the
// path never depends on your decisions and counterfactual books ("your
// allocations without stops", "equal risk") are exact.

import {
  FACTORS, NF, REGIMES, drawFactors, drawRegime, filterStep, initialIndicators, stepIndicators, transitionMatrix,
  type FactorId, type Indicators, type RegimeId,
} from './market';
import { bucketOf, capBeta, driftForEv, evOf, idioFor, neutralProbs, sdOf, thresholdsFromProbs, type Outcome } from './instruments';
import { clamp, mean, std } from './math';
import { Rng } from './rng';

export const HISTORY = 104; // weeks of track record a PM brings to the pitch
const HORIZON = 800; // weeks of market path generated
const PRIOR_SR = 0.45; // what a typical pitching PM is worth (annual Sharpe)
const PRIOR_SD = 0.6; // spread of true Sharpe ratios across PMs

// ---------------------------------------------------------------------------
// Market path

export interface MarketWeek {
  regime: RegimeId;
  Z: number[];
  jump: string | null;
  ind: Indicators;
  belief: Record<RegimeId, number>;
}

const pathCache = new Map<string, MarketWeek[]>();

/** Index 0 is week −HISTORY; week w lives at index w + HISTORY. */
export function marketPath(seed: string): MarketWeek[] {
  const hit = pathCache.get(seed);
  if (hit) return hit;
  const T = transitionMatrix('full');
  const rng = new Rng(seed, 'market');
  let regime: RegimeId = 'normal';
  let ind = initialIndicators(regime);
  let belief = Object.fromEntries(REGIMES.map((r) => [r, r === 'normal' ? 0.82 : 0.18 / (REGIMES.length - 1)])) as Record<RegimeId, number>;
  const out: MarketWeek[] = [];
  for (let i = 0; i < HISTORY + HORIZON; i++) {
    const prev = regime;
    regime = drawRegime(rng, regime, T);
    const fd = drawFactors(rng, regime, prev);
    const next = stepIndicators(rng, ind, regime);
    belief = filterStep(belief, ind, next, T);
    ind = next;
    out.push({ regime, Z: fd.Z, jump: fd.jump, ind, belief });
  }
  pathCache.set(seed, out);
  return out;
}

export function weekOf(seed: string, w: number): MarketWeek {
  const p = marketPath(seed);
  return p[clamp(w + HISTORY, 0, p.length - 1)];
}

// ---------------------------------------------------------------------------
// PMs

type Shape = 'sym' | 'neg' | 'pos';
const SHAPES: Record<Shape, { x: number[]; p: number[] }> = {
  sym: { x: [-2.4, -1.3, -0.5, 0.1, 0.6, 1.3, 2.4], p: [0.03, 0.12, 0.22, 0.26, 0.22, 0.12, 0.03] },
  neg: { x: [-6.5, -2.2, -0.7, 0.2, 0.5, 0.9, 1.3], p: [0.015, 0.05, 0.12, 0.25, 0.3, 0.2, 0.065] },
  pos: { x: [-1.3, -0.8, -0.3, 0.2, 0.9, 2.2, 5.0], p: [0.08, 0.22, 0.25, 0.2, 0.15, 0.08, 0.02] },
};

interface StyleSpec {
  style: string;
  shape: Shape;
  vol: [number, number]; // weekly vol on allocated capital
  beta: Partial<Record<FactorId, [number, number]>>;
  blurb: string;
}

const STYLES: StyleSpec[] = [
  { style: 'Equity stat arb', shape: 'sym', vol: [0.011, 0.018], beta: { LIQ: [0.3, 0.6], MOM: [-0.3, 0] }, blurb: 'High-turnover market-neutral equity; earns liquidity premia.' },
  { style: 'Fundamental equity L/S', shape: 'sym', vol: [0.016, 0.026], beta: { EQ: [0.15, 0.45], VALUE: [0, 0.3] }, blurb: 'Concentrated stock picking with a net-long bias.' },
  { style: 'Quant equity factors', shape: 'sym', vol: [0.012, 0.02], beta: { VALUE: [0.1, 0.4], MOM: [0.1, 0.4], LIQ: [0.2, 0.5] }, blurb: 'Systematic value, momentum and quality.' },
  { style: 'Global macro', shape: 'sym', vol: [0.02, 0.03], beta: { RATES: [-0.3, 0.35], COMMOD: [0, 0.3], CARRY: [0, 0.3] }, blurb: 'Discretionary rates, FX and commodities.' },
  { style: 'Credit relative value', shape: 'neg', vol: [0.009, 0.015], beta: { CREDIT: [0.3, 0.5], LIQ: [0.2, 0.4] }, blurb: 'Levered capital-structure and basis trades.' },
  { style: 'Volatility arbitrage', shape: 'neg', vol: [0.011, 0.017], beta: { VOL: [-0.6, -0.3], EQ: [0, 0.2] }, blurb: 'Relative value in options; net short volatility.' },
  { style: 'Trend following', shape: 'pos', vol: [0.02, 0.028], beta: { MOM: [0.5, 0.8] }, blurb: 'Diversified futures trend.' },
  { style: 'Merger arbitrage', shape: 'neg', vol: [0.009, 0.014], beta: { CREDIT: [0.2, 0.4], EQ: [0.1, 0.2], LIQ: [0.1, 0.3] }, blurb: 'Announced deals; small spreads, rare large breaks.' },
  { style: 'Event-driven credit', shape: 'sym', vol: [0.012, 0.02], beta: { CREDIT: [0.3, 0.55], EQ: [0.1, 0.3] }, blurb: 'Restructurings and special situations.' },
];

const FIRST = ['A.', 'B.', 'C.', 'D.', 'E.', 'F.', 'G.', 'H.', 'J.', 'K.', 'L.', 'M.', 'N.', 'P.', 'R.', 'S.', 'T.', 'V.', 'W.', 'Y.'];
const LAST = ['Okafor', 'Brandt', 'Castellanos', 'Sørensen', 'Whitfield', 'Ito', 'Vance', 'Moreau', 'Haldane', 'Kapoor', 'Lindqvist', 'Nakamura', 'Osei', 'Petrov', 'Quintero', 'Rahman', 'Silva', 'Tanaka', 'Varga', 'Wexler', 'Achebe', 'Bianchi', 'Dufresne', 'Ekström', 'Farouk', 'Grieve', 'Hollis', 'Iversen', 'Juarez', 'Kowalski'];

export interface PMTruth {
  /** True annualised Sharpe when the edge is on. */
  sharpe: number;
  drift: number;
  offDrift: number;
  beta: number[];
  idio: number;
  /** Edge on (1) / off (0) by absolute week index. */
  edge: number[];
  /** Which survivorship attempt produced the pitched track record. */
  attempt: number;
}

export type PMStatus = 'candidate' | 'active' | 'stopped' | 'left';

export interface PM {
  id: string;
  name: string;
  style: string;
  blurb: string;
  pitchWeek: number;
  outcomes: Outcome[];
  thresholds: number[];
  capacity: number;
  /** Weekly returns for weeks pitchWeek−HISTORY … pitchWeek−1. */
  track: number[];
  /** Weekly returns since the pitch (observed whether or not you allocate). */
  live: number[];
  status: PMStatus;
  /** Stop level as a fraction of allocated capital (drawdown from the book's high-water mark). */
  stop: number;
  /** Your risk budget: annualised volatility in $ you are giving this PM. */
  riskBudget: number;
  stoppedWeek?: number;
  hiredWeek?: number;
}

function pmReturn(seed: string, pm: PM, t: PMTruth, w: number, stream: string, attempt = 0): number {
  const mk = weekOf(seed, w);
  const on = t.edge[clamp(w + HISTORY, 0, t.edge.length - 1)];
  let x = (on ? t.drift : t.offDrift) + Math.sqrt(t.idio) * new Rng(seed, 'pm', pm.id, stream, attempt, w).normal();
  for (let f = 0; f < NF; f++) x += t.beta[f] * mk.Z[f];
  return pm.outcomes[bucketOf(x, pm.thresholds)].r;
}

export function makePM(seed: string, idx: number, pitchWeek: number, nav0: number): { pm: PM; truth: PMTruth } {
  const rng = new Rng(seed, 'pmspec', idx);
  const spec = STYLES[rng.int(0, STYLES.length - 1)];
  const shape = SHAPES[spec.shape];
  const vol = rng.uniform(spec.vol[0], spec.vol[1]);
  const outcomes: Outcome[] = shape.x.map((x, k) => ({ label: ['Severe loss', 'Bad week', 'Down', 'Flat', 'Up', 'Good week', 'Exceptional'][k], r: x * vol }));
  const thresholds = thresholdsFromProbs(shape.p);
  const beta = capBeta(FACTORS.map((f) => {
    const r = spec.beta[f];
    return r ? rng.uniform(r[0], r[1]) : 0;
  }));
  const idio = idioFor(beta);
  // True skill: most PMs who pitch have modest or no edge.
  const sharpe = clamp(PRIOR_SR + PRIOR_SD * rng.normal(), -0.6, 2.2);
  const sd0 = sdOf(outcomes, neutralProbs(thresholds, 0));
  const drift = driftForEv(outcomes, thresholds, (sharpe / Math.sqrt(52)) * sd0);
  const offDrift = driftForEv(outcomes, thresholds, -0.15 * Math.abs(evOf(outcomes, neutralProbs(thresholds, drift))));
  const erng = new Rng(seed, 'edge', idx);
  const edge: number[] = [];
  let on = 1;
  for (let i = 0; i < HISTORY + HORIZON; i++) {
    edge.push(on);
    on = on ? (erng.bernoulli(0.012) ? 0 : 1) : erng.bernoulli(0.06) ? 1 : 0;
  }
  const id = `pm${idx}`;
  const pm: PM = {
    id,
    name: `${rng.pick(FIRST)} ${rng.pick(LAST)}`,
    style: spec.style,
    blurb: spec.blurb,
    pitchWeek,
    outcomes,
    thresholds,
    capacity: nav0 * rng.uniform(0.1, 0.35),
    track: [],
    live: [],
    status: 'candidate',
    stop: 0.075,
    riskBudget: 0,
  };
  const truth: PMTruth = { sharpe, drift, offDrift, beta, idio, edge, attempt: 0 };
  // Survivorship: you only meet PMs whose records look good. Keep the first
  // record above the bar (or the best of the attempts).
  let best = -Infinity;
  for (let a = 0; a < 60; a++) {
    const tr: number[] = [];
    for (let w = pitchWeek - HISTORY; w < pitchWeek; w++) tr.push(pmReturn(seed, pm, truth, w, 'track', a));
    const sh = (mean(tr) / (std(tr) || 1)) * Math.sqrt(52);
    if (sh > best) {
      best = sh;
      pm.track = tr;
      truth.attempt = a;
    }
    if (sh >= 0.7) break;
  }
  return { pm, truth };
}

// ---------------------------------------------------------------------------
// Estimates (public: track record + live results only)

export interface PMEstimate {
  n: number;
  /** Annualised vol estimate. */
  vol: number;
  /** Raw annualised Sharpe of everything observed. */
  srRaw: number;
  /** Standard error of the raw Sharpe. */
  se: number;
  /** Shrunk (posterior) Sharpe and a 90% interval. */
  sr: number;
  lo: number;
  hi: number;
  maxDD: number;
  worstWeek: number;
  /** Return since the pitch. */
  liveRet: number;
  liveT: number;
  negSkew: boolean;
}

export function observed(pm: PM): number[] {
  return [...pm.track, ...pm.live];
}

export function estimate(pm: PM): PMEstimate {
  const xs = observed(pm);
  const n = xs.length;
  const m = mean(xs);
  const sd = std(xs) || 1e-6;
  const srRaw = (m / sd) * Math.sqrt(52);
  const se = Math.sqrt(52 / Math.max(n, 2)) * Math.sqrt(1 + 0.5 * (m / sd) ** 2);
  // normal–normal shrinkage toward the population of PMs who pitch
  const post = 1 / (1 / (se * se) + 1 / (PRIOR_SD * PRIOR_SD));
  const sr = post * (srRaw / (se * se) + PRIOR_SR / (PRIOR_SD * PRIOR_SD));
  const psd = Math.sqrt(post);
  let peak = 1, v = 1, maxDD = 0;
  for (const x of xs) {
    v *= 1 + x;
    peak = Math.max(peak, v);
    maxDD = Math.max(maxDD, 1 - v / peak);
  }
  const live = pm.live;
  const lm = mean(live);
  const ls = std(live);
  const worstR = Math.min(...pm.outcomes.map((o) => o.r));
  const typical = pm.outcomes.reduce((a, o) => a + Math.abs(o.r), 0) / pm.outcomes.length;
  return {
    n,
    vol: sd * Math.sqrt(52),
    srRaw,
    se,
    sr,
    lo: sr - 1.645 * psd,
    hi: sr + 1.645 * psd,
    maxDD,
    worstWeek: Math.min(...xs),
    liveRet: live.reduce((a, x) => a * (1 + x), 1) - 1,
    liveT: live.length > 1 && ls > 0 ? (lm / ls) * Math.sqrt(live.length) : 0,
    negSkew: worstR < -3 * typical,
  };
}

/** Weekly returns of several PMs over their common observed window (most recent `max` weeks). */
export function commonReturns(pms: PM[], now: number, max = 156): number[][] {
  if (!pms.length) return [];
  const start = Math.max(...pms.map((p) => p.pitchWeek - HISTORY), now - max);
  return pms.map((p) => {
    const xs = observed(p);
    const first = p.pitchWeek - HISTORY;
    return xs.slice(start - first, now - first);
  });
}

export function covariance(series: number[][]): number[][] {
  const n = series.length;
  const T = Math.min(...series.map((s) => s.length));
  const mu = series.map((s) => mean(s.slice(0, T)));
  const C = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++)
    for (let j = i; j < n; j++) {
      let c = 0;
      for (let t = 0; t < T; t++) c += (series[i][t] - mu[i]) * (series[j][t] - mu[j]);
      C[i][j] = C[j][i] = T > 1 ? c / (T - 1) : 0;
    }
  return C;
}

// ---------------------------------------------------------------------------
// Books (yours and the counterfactuals)

export interface BookPM {
  /** Capital currently in the PM's book. */
  V: number;
  /** High-water mark of the book since allocation (for the stop). */
  hwm: number;
  /** Cumulative P&L generated for you by this PM. */
  cum: number;
  /** Cumulative P&L level on which fees were last paid. */
  feeHwm: number;
  fees: number;
}

/**
 * A platform book. Allocations are notional (PMs post margin and run their own
 * leverage), so `cash` is the platform's NAV: it earns the cash rate, PM P&L is
 * added to it, and moving capital between PMs only costs the reallocation fee.
 */
export interface Book {
  cash: number;
  pms: Record<string, BookPM>;
  path: number[];
}

export function bookNav(b: Book): number {
  return b.cash;
}

export type ShadowId = 'noStops' | 'equalRisk' | 'allEqual';
export const SHADOW_INFO: Record<ShadowId, { name: string; desc: string; tests: string }> = {
  noStops: { name: 'Your allocations, no stops', desc: 'Same PMs, same sizes, but nobody is ever stopped out.', tests: 'What your stops cost or saved' },
  equalRisk: { name: 'Your PMs, equal risk', desc: 'The PMs you picked, each given the same risk budget (same total risk as you).', tests: 'Whether your conviction sizing added value' },
  allEqual: { name: 'Every PM, equal risk', desc: 'Every PM available at the start of each round, equal risk, same total risk as you.', tests: 'Whether your selection added value' },
};

// ---------------------------------------------------------------------------
// Game state

export interface AllocConfig {
  seed: string;
  nav0: number;
  /** Target platform volatility (annual, fraction of NAV). */
  targetVol: number;
  /** Share of each PM's profits paid to the PM (above their high-water mark). */
  payout: number;
  /** Platform drawdown at which the risk committee halves every allocation. */
  platformStop: number;
  /** Max total capital allocated, as a multiple of NAV. */
  maxGross: number;
  rounds: number | null;
}

export interface PMRoundResult {
  id: string;
  start: number;
  end: number;
  pnl: number;
  fee: number;
  stopped: boolean;
  stoppedWeek?: number;
}

export interface RoundRecord {
  round: number;
  fromWeek: number;
  toWeek: number;
  navBefore: number;
  navAfter: number;
  pms: PMRoundResult[];
  fees: number;
  costs: number;
  events: string[];
  shadows: Record<ShadowId, { before: number; after: number }>;
  /** Your risk budget by PM at the start of the round ($ annual vol). */
  budgets: Record<string, number>;
  /** Weekly NAV inside the round. */
  weekly: number[];
  /** Ex-ante expected platform return over the round (desk view). */
  expected: number;
  regimes: RegimeId[];
}

export interface AllocState {
  version: number;
  config: AllocConfig;
  week: number;
  round: number;
  status: 'playing' | 'ended';
  pms: Record<string, PM>;
  /** HIDDEN until the review. */
  truth: Record<string, PMTruth>;
  nextIdx: number;
  book: Book;
  shadows: Record<ShadowId, Book>;
  peak: number;
  rounds: RoundRecord[];
  riskCut: boolean;
}

export const ALLOC_VERSION = 1;

export function newAllocGame(cfg: AllocConfig): AllocState {
  const s: AllocState = {
    version: ALLOC_VERSION,
    config: cfg,
    week: 0,
    round: 0,
    status: 'playing',
    pms: {},
    truth: {},
    nextIdx: 0,
    book: { cash: cfg.nav0, pms: {}, path: [cfg.nav0] },
    shadows: {
      noStops: { cash: cfg.nav0, pms: {}, path: [cfg.nav0] },
      equalRisk: { cash: cfg.nav0, pms: {}, path: [cfg.nav0] },
      allEqual: { cash: cfg.nav0, pms: {}, path: [cfg.nav0] },
    },
    peak: cfg.nav0,
    rounds: [],
    riskCut: false,
  };
  for (let i = 0; i < 9; i++) addPM(s, 0);
  return s;
}

function addPM(s: AllocState, week: number) {
  const { pm, truth } = makePM(s.config.seed, s.nextIdx++, week, s.config.nav0);
  s.pms[pm.id] = pm;
  s.truth[pm.id] = truth;
}

export function nav(s: AllocState): number {
  return bookNav(s.book);
}

export function rfWeekly(s: AllocState): number {
  void s;
  return 0.04 / 52;
}

/** Capital needed for a risk budget: $ annual vol ÷ estimated annual vol. */
export function capitalFor(pm: PM, riskBudget: number): number {
  const e = estimate(pm);
  return e.vol > 0 ? riskBudget / e.vol : 0;
}

export interface Plan {
  id: string;
  riskBudget: number;
  stop: number;
}

export interface PlanCheck {
  errors: string[];
  warnings: string[];
  capital: Record<string, number>;
  gross: number;
}

export function checkPlan(s: AllocState, plan: Plan[]): PlanCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  const capital: Record<string, number> = {};
  const N = nav(s);
  let gross = 0;
  for (const p of plan) {
    const pm = s.pms[p.id];
    if (!pm || pm.status === 'stopped' || pm.status === 'left') {
      if (p.riskBudget > 0) errors.push(`${pm?.name ?? p.id} is no longer available.`);
      continue;
    }
    const c = p.riskBudget > 0 ? capitalFor(pm, p.riskBudget) : 0;
    capital[p.id] = c;
    gross += c;
    if (c > pm.capacity * 1.5) warnings.push(`${pm.name}: $${(c / 1e6).toFixed(0)}M is well above capacity ($${(pm.capacity / 1e6).toFixed(0)}M); returns will be diluted.`);
  }
  if (gross > s.config.maxGross * N) errors.push(`Total allocated capital ${(gross / N).toFixed(2)}× NAV exceeds the ${s.config.maxGross}× limit.`);
  return { errors, warnings, capital, gross };
}

const REALLOC_COST = 0.0005; // 5bp of capital moved
const CAPACITY_DRAG = 0.0015; // weekly drag on capital above capacity

function setAllocations(book: Book, target: Record<string, number>): number {
  let cost = 0;
  const ids = new Set([...Object.keys(book.pms), ...Object.keys(target)]);
  for (const id of ids) {
    const want = target[id] ?? 0;
    const bp = book.pms[id] ?? (book.pms[id] = { V: 0, hwm: 0, cum: 0, feeHwm: 0, fees: 0 });
    const d = want - bp.V;
    if (Math.abs(d) < 1) continue;
    cost += Math.abs(d) * REALLOC_COST;
    // keep the drawdown-from-HWM percentage when resizing
    bp.hwm = bp.V > 0 && bp.hwm > 0 ? bp.hwm * (want / bp.V) : want;
    bp.V = want;
  }
  book.cash -= cost;
  return cost;
}

function weekStep(s: AllocState, book: Book, w: number, stops: Record<string, number> | null, events: string[] | null, stoppedOut: Record<string, number> | null, pnlAcc: Record<string, number> | null) {
  for (const [id, bp] of Object.entries(book.pms)) {
    if (bp.V <= 0) continue;
    const pm = s.pms[id];
    let r = pm.live[w - pm.pitchWeek];
    if (bp.V > pm.capacity) r -= (CAPACITY_DRAG * (bp.V - pm.capacity)) / bp.V;
    const pnl = bp.V * r;
    bp.V += pnl;
    bp.cum += pnl;
    book.cash += pnl;
    if (pnlAcc) pnlAcc[id] = (pnlAcc[id] ?? 0) + pnl;
    bp.hwm = Math.max(bp.hwm, bp.V);
    const stopAt = stops?.[id];
    if (stops && typeof stopAt === 'number' && stopAt < 1 && bp.hwm > 0 && 1 - bp.V / bp.hwm >= stopAt) {
      bp.V = 0;
      if (stoppedOut) stoppedOut[id] = w;
      events?.push(`Week ${w + 1}: ${pm.name} (${pm.style}) hit the ${(stopAt * 100).toFixed(1)}% stop and was cut.`);
    }
  }
  book.cash += book.cash * rfWeekly(s);
}

/** Pay PMs their share of profits above their high-water mark (all PMs, or only `only`). */
function chargeFees(s: AllocState, book: Book, only?: Set<string>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, bp] of Object.entries(book.pms)) {
    if (only && !only.has(id)) continue;
    const profit = bp.cum - bp.feeHwm;
    if (profit > 0) {
      const fee = profit * s.config.payout;
      book.cash -= fee;
      bp.fees += fee;
      out[id] = fee;
      bp.feeHwm = bp.cum;
    }
  }
  return out;
}

/** Advance the platform `weeks` weeks with the given plan. */
export function runRound(prev: AllocState, plan: Plan[], weeks: number): { state: AllocState; record: RoundRecord } {
  if (prev.status !== 'playing') throw new Error('Session is over.');
  const chk = checkPlan(prev, plan);
  if (chk.errors.length) throw new Error(chk.errors.join(' '));
  const s: AllocState = structuredClone(prev);
  const N0 = nav(s);
  const fromWeek = s.week;

  // apply your plan
  const target: Record<string, number> = {};
  const stops: Record<string, number> = {};
  const budgets: Record<string, number> = {};
  const redeemed: string[] = [];
  for (const p of plan) {
    const pm = s.pms[p.id];
    if (!pm || pm.status === 'stopped' || pm.status === 'left') continue;
    pm.riskBudget = p.riskBudget;
    pm.stop = p.stop;
    const c = chk.capital[p.id] ?? 0;
    if (c > 0) {
      target[p.id] = c;
      stops[p.id] = p.stop;
      budgets[p.id] = p.riskBudget;
      if (pm.status === 'candidate') {
        pm.status = 'active';
        pm.hiredWeek = s.week;
      }
    } else if (pm.status === 'active') {
      pm.status = 'candidate'; // redeemed; can be re-hired later
      redeemed.push(p.id);
    }
  }
  const costs = setAllocations(s.book, target);

  // ex-ante expected return over the round (desk estimates)
  let expected = 0;
  for (const [id, c] of Object.entries(target)) {
    const e = estimate(s.pms[id]);
    expected += c * (e.sr * e.vol) * (weeks / 52);
  }

  // counterfactual books, rebalanced to their rules at the start of each round
  const yourW = Object.fromEntries(Object.entries(target).map(([id, c]) => [id, c / N0]));
  const totalRisk = Object.values(budgets).reduce((a, b) => a + b, 0) / N0; // risk per $ NAV
  const shadowTargets: Record<ShadowId, Record<string, number>> = { noStops: {}, equalRisk: {}, allEqual: {} };
  const chosen = Object.keys(target);
  const avail = Object.values(s.pms).filter((p) => p.status === 'candidate' || p.status === 'active').map((p) => p.id);
  for (const sid of Object.keys(s.shadows) as ShadowId[]) {
    const b = s.shadows[sid];
    const Nb = bookNav(b);
    const t: Record<string, number> = {};
    if (sid === 'noStops') for (const [id, w] of Object.entries(yourW)) t[id] = w * Nb;
    else {
      const set = sid === 'equalRisk' ? chosen : avail;
      for (const id of set) if (set.length) t[id] = ((totalRisk / set.length) * Nb) / Math.max(estimate(s.pms[id]).vol, 1e-6);
    }
    shadowTargets[sid] = t;
    setAllocations(b, t);
  }
  const shadowBefore = Object.fromEntries((Object.keys(s.shadows) as ShadowId[]).map((k) => [k, bookNav(s.shadows[k])])) as Record<ShadowId, number>;

  const events: string[] = [];
  const stoppedOut: Record<string, number> = {};
  const pnlAcc: Record<string, number> = {};
  const startV: Record<string, number> = Object.fromEntries(Object.entries(s.book.pms).map(([id, bp]) => [id, bp.V]));
  const weekly: number[] = [];
  const regimes: RegimeId[] = [];
  for (let i = 0; i < weeks; i++) {
    const w = s.week;
    const mk = weekOf(s.config.seed, w);
    regimes.push(mk.regime);
    // every PM's result this week is public (and needed by the books)
    for (const pm of Object.values(s.pms)) {
      if (pm.status === 'left') continue;
      pm.live.push(pmReturn(s.config.seed, pm, s.truth[pm.id], w, 'live'));
    }
    if (mk.jump) events.push(`Week ${w + 1}: market shock — ${mk.jump}.`);
    weekStep(s, s.book, w, stops, events, stoppedOut, pnlAcc);
    for (const sid of Object.keys(s.shadows) as ShadowId[]) weekStep(s, s.shadows[sid], w, null, null, null, null);
    s.week++;
    const N = nav(s);
    s.peak = Math.max(s.peak, N);
    weekly.push(N);
    s.book.path.push(N);
    for (const sid of Object.keys(s.shadows) as ShadowId[]) s.shadows[sid].path.push(bookNav(s.shadows[sid]));
    if (!s.riskCut && 1 - N / s.peak >= s.config.platformStop) {
      s.riskCut = true;
      for (const bp of Object.values(s.book.pms)) {
        bp.V /= 2;
        bp.hwm /= 2;
      }
      events.push(`Week ${w + 1}: platform drawdown reached ${(s.config.platformStop * 100).toFixed(0)}%. The risk committee halved every allocation. The round ends early so you can respond.`);
      break;
    }
    if (s.riskCut && 1 - N / s.peak < s.config.platformStop / 2) s.riskCut = false;
  }
  for (const [id, wk] of Object.entries(stoppedOut)) {
    s.pms[id].status = 'stopped';
    s.pms[id].stoppedWeek = wk;
  }

  // PMs are paid on their own profits, round by round, regardless of the platform's total
  // Payouts crystallise once a year, and when a PM leaves the platform (stopped or redeemed).
  // A PM who made money is paid even if the platform as a whole lost (netting risk).
  const yearEnd = Math.floor(fromWeek / 52) !== Math.floor(s.week / 52);
  const leaving = new Set([...Object.keys(stoppedOut), ...redeemed]);
  const feeBy = chargeFees(s, s.book, yearEnd ? undefined : leaving);
  const fees = Object.values(feeBy).reduce((a, b) => a + b, 0);
  for (const sid of Object.keys(s.shadows) as ShadowId[]) chargeFees(s, s.shadows[sid], yearEnd ? undefined : new Set<string>());

  const pmResults: PMRoundResult[] = Object.entries(startV)
    .filter(([, v]) => v > 0)
    .map(([id, v]) => ({ id, start: v, end: s.book.pms[id].V, pnl: pnlAcc[id] ?? 0, fee: feeBy[id] ?? 0, stopped: stoppedOut[id] !== undefined, stoppedWeek: stoppedOut[id] }));

  s.round++;
  const record: RoundRecord = {
    round: s.round,
    fromWeek,
    toWeek: s.week,
    navBefore: N0,
    navAfter: nav(s),
    pms: pmResults,
    fees,
    costs,
    events,
    shadows: Object.fromEntries((Object.keys(s.shadows) as ShadowId[]).map((k) => [k, { before: shadowBefore[k], after: bookNav(s.shadows[k]) }])) as RoundRecord['shadows'],
    budgets,
    weekly,
    expected,
    regimes,
  };
  s.rounds.push(record);

  // the pitch pipeline: 1–2 new PMs; candidates who have waited 3 rounds move on
  const prng = new Rng(s.config.seed, 'pipeline', s.round);
  for (const pm of Object.values(s.pms)) if (pm.status === 'candidate' && pm.hiredWeek === undefined && s.week - pm.pitchWeek > 18 && prng.bernoulli(0.5)) pm.status = 'left';
  const k = prng.int(1, 2);
  for (let i = 0; i < k; i++) addPM(s, s.week);

  if (s.config.rounds !== null && s.round >= s.config.rounds) return { state: endAllocSession(s), record };
  return { state: s, record };
}

/** End the session: outstanding payouts are settled. */
export function endAllocSession(prev: AllocState): AllocState {
  const s: AllocState = structuredClone(prev);
  chargeFees(s, s.book);
  for (const sid of Object.keys(s.shadows) as ShadowId[]) chargeFees(s, s.shadows[sid]);
  s.status = 'ended';
  return s;
}

/** What a stopped PM did in the weeks after you cut them (public once the weeks have passed). */
export function afterStop(pm: PM, weeks = 8): number | null {
  if (pm.stoppedWeek === undefined) return null;
  const from = pm.stoppedWeek + 1 - pm.pitchWeek;
  const xs = pm.live.slice(from, from + weeks);
  if (!xs.length) return null;
  return xs.reduce((a, x) => a * (1 + x), 1) - 1;
}

export function serializeAlloc(s: AllocState): string {
  return JSON.stringify(s);
}

export function deserializeAlloc(json: string): AllocState {
  const s = JSON.parse(json) as AllocState;
  if (!s || s.version !== ALLOC_VERSION || !s.config || !s.pms) throw new Error('Save file is from an incompatible version.');
  return s;
}
