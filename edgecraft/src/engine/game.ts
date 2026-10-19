// The campaign engine: state, orders, costs, market resolution, risk rules,
// benchmarks and decision grading. Pure functions over a JSON-serialisable
// GameState. Hidden truth lives in `state.truth` and in fields marked HIDDEN;
// the UI only reads them after a campaign has ended (or in transparent sandbox).

import {
  FACTORS, NF, REGIMES, REGIME_SPECS, drawFactors, drawRegime, filterStep, initialIndicators, pairsFromBelief,
  pairsFromRegime, predictRegime, stepIndicators, transitionMatrix, type Indicators, type RegimeId, type RegimePair,
} from './market';
import {
  LEARN_SHRINK, bucketOf, capBeta, evOf, idioFor, outcomeProbs, trueDrift, winProb,
  type Archetype, type InstrumentPublic, type InstrumentTruth,
} from './instruments';
import { LEVELS, type Level, type LevelConfig } from './levels';
import { generateOffers, permanentInstruments, buildPods } from './offers';
import {
  buildScenarios, deskParams, latentSlope, losersDistribution, portfolioStats, quoteInstrument, riskContrib,
  scenarioCov, subsetScenarios, type Scenarios,
} from './risk';
import { optimizeLogPortfolio, scenarioLogGrowth, type CostFn } from './kelly';
import { clamp, goldenMax } from './math';
import { Rng } from './rng';

export const SAVE_VERSION = 3;

export type BenchId = 'growth' | 'diversified' | 'fixed' | 'cash';
export type GhostId = 'half' | 'double';
export const GHOSTS: { id: GhostId; k: number; name: string }[] = [
  { id: 'half', k: 0.5, name: 'Your trades at ½ size' },
  { id: 'double', k: 2, name: 'Your trades at 2× size' },
];
export const BENCH_IDS: BenchId[] = ['growth', 'diversified', 'fixed', 'cash'];
export const BENCH_INFO: Record<BenchId, { name: string; desc: string }> = {
  growth: { name: 'Half-Kelly growth', desc: 'Each turn: the log-optimal portfolio under the desk model (same information you had), scaled by ½ for estimation risk.' },
  diversified: { name: 'Risk-parity reference', desc: 'Equal risk contribution across every positive-EV opportunity, scaled to 10% annualised volatility.' },
  fixed: { name: 'Fixed-fraction baseline', desc: 'Every positive-EV trade sized so its worst modelled outcome costs 1% of NAV.' },
  cash: { name: 'Cash', desc: 'Earns the risk-free rate.' },
};

export interface GameConfig {
  level: Level;
  seed: string;
  turns: number | null;
  mode: 'campaign' | 'sandbox';
  /** Sandbox only: reveal true probabilities (disables scoring). */
  transparent: boolean;
  startNav: number;
  maxGross?: number;
  regimes?: 'auto' | 'calm' | 'full';
  label?: string;
  /** 'pct': positions are rebalanced each week to their % of NAV; 'usd': held at fixed dollar notional. */
  holdMode?: 'pct' | 'usd';
  /** Practice scenario that scripts the regime path and the opportunity mix. */
  scenario?: ScenarioId;
}

export type ScenarioId = 'none' | 'unwind' | 'carrycrash' | 'overconfident' | 'regimeshift';

export const SCENARIOS: Record<ScenarioId, { name: string; desc: string }> = {
  none: { name: 'Random market', desc: 'Regimes and opportunities follow the normal random process.' },
  unwind: { name: 'Crowded trade', desc: 'Quant strategies are popular and look great. Something is building underneath.' },
  carrycrash: { name: 'Picking up nickels', desc: 'A calm market full of carry, short-vol and relative-value trades with high win rates.' },
  overconfident: { name: 'Optimistic desk', desc: 'The desk is in a bullish mood: many quoted edges are overstated. Learn to be skeptical.' },
  regimeshift: { name: 'Trend to chop', desc: 'A strong trending market. Trends do not last forever.' },
};

/** Scripted true regime for a scenario week (null = random). Decision-independent by construction. */
export function scenarioRegime(sc: ScenarioId | undefined, t: number): RegimeId | null {
  switch (sc) {
    case 'unwind': return t <= 5 ? 'normal' : t <= 9 ? 'decay' : t <= 12 ? 'unwind' : t <= 14 ? 'liquidity' : null;
    case 'carrycrash': return t <= 9 ? 'normal' : t === 10 ? 'volspike' : t <= 12 ? 'liquidity' : t <= 14 ? 'volspike' : null;
    case 'regimeshift': return t <= 8 ? 'momentum' : t <= 16 ? 'meanrev' : null;
    case 'overconfident': return t <= 12 ? 'normal' : null;
    default: return null;
  }
}

export interface Position {
  id: string;
  notional: number;
  entryTurn: number;
  pnl: number;
  userProb?: number;
  /** Target size as a fraction of NAV (used when holdMode is 'pct'). */
  pct?: number;
}

export interface Order {
  id: string;
  target: number;
  userProb?: number;
}

export interface NewsItem {
  turn: number;
  tone: 'neg' | 'pos' | 'neu';
  text: string;
}

export interface Tape {
  EQX: number;
  UST10: number;
  USDX: number;
  OIL: number;
  rf: number; // annual
}

export interface BenchState {
  nav: number;
  peak: number;
  holdings: Record<string, number>;
  path: number[];
}

export interface PositionResult {
  id: string;
  name: string;
  archetype: Archetype;
  notional: number;
  r: number;
  pnl: number;
  outcome: string;
  terminal: boolean;
  quotedEv: number;
  quotedWin: number;
  quotedSd: number;
  userProb?: number;
  won: boolean;
  /** $ P&L explained by each factor (desk loadings × realised shocks). */
  factorPnl: number[];
  alphaPnl: number;
  residualPnl: number;
  /** HIDDEN until campaign end. */
  trueEv: number;
  trueWin: number;
  quality: string;
}

export interface ExAnte {
  er: number;
  vol: number;
  elog: number;
  var95: number;
  es95: number;
  pLoss5: number;
  pctl: number[];
  kStar: number;
  /** Your size as a multiple of the growth-optimal scale of your own portfolio (1 = full Kelly on your trades). */
  sizing: number;
  /** Growth captured at the best scale of your trades, as a share of the best available (trade selection). */
  selection: number;
  /** 1 inside the ¼–1× Kelly band, falling off on either side (sizing). */
  sizingQ: number;
  gOpt: number;
  gHalf: number;
  /** Expected log growth of closing everything and holding cash. */
  gCash: number;
  efficiency: number;
  wOpt: Record<string, number>;
  gross: number;
  net: number;
  margin: number;
  divRatio: number;
  maxRcShare: number;
  curve: { k: number; elog: number; er: number }[];
  losers: { joint: number[]; indep: number[] };
  heldIds: string[];
  breaches: string[];
  expCost: number;
}

export interface GameEvent {
  kind: 'forced-liquidation' | 'derisk' | 'closed' | 'terminal' | 'expiry' | 'jump' | 'ruin' | 'research';
  text: string;
}

export interface Grade {
  score: number;
  letter: string;
  quadrant: 'good-good' | 'good-bad' | 'bad-good' | 'bad-bad';
  verdict: string;
}

export interface TurnRecord {
  turn: number;
  navBefore: number;
  navAfter: number;
  ret: number;
  logRet: number;
  pnlPositions: number;
  costs: { tc: number; fin: number; lev: number; cash: number; research: number; liquidation: number };
  positions: PositionResult[];
  Z: number[];
  jump: string | null;
  beliefBefore: Record<RegimeId, number>;
  beliefAfter: Record<RegimeId, number>;
  indicators: Indicators;
  exAnte: ExAnte;
  bench: Record<BenchId, { navBefore: number; navAfter: number }>;
  ghosts?: Record<GhostId, { navBefore: number; navAfter: number }>;
  events: GameEvent[];
  attribution: Record<string, number>;
  counterfactual: { k: number; ret: number }[];
  drawdown: number;
  grade: Grade;
  lessons: string[];
  /** HIDDEN */
  trueRegime: RegimeId;
}

export interface CalibrationEntry {
  turn: number;
  id: string;
  archetype: Archetype;
  quoted: number;
  user?: number;
  won: boolean;
  /** HIDDEN */
  truth: number;
}

export interface GameState {
  version: number;
  config: GameConfig;
  turn: number;
  status: 'playing' | 'ended' | 'closed';
  nav: number;
  peak: number;
  /** HIDDEN: the true current regime. */
  regime: RegimeId;
  belief: Record<RegimeId, number>;
  indicators: Indicators;
  tape: Tape;
  instruments: Record<string, InstrumentPublic>;
  /** HIDDEN */
  truth: Record<string, InstrumentTruth>;
  offered: string[];
  positions: Record<string, Position>;
  history: TurnRecord[];
  bench: Record<BenchId, BenchState>;
  /** Your own trades run at 0.5× and 2× your sizes, on the same market path. */
  ghosts: Record<GhostId, BenchState>;
  news: NewsItem[];
  calibration: CalibrationEntry[];
  pendingResearch: number;
  deriskActive: boolean;
  navPath: number[];
  closedReason?: string;
}

// ---------------------------------------------------------------------------

export function levelCfg(s: Pick<GameState, 'config'>): LevelConfig {
  const base = LEVELS[s.config.level];
  return { ...base, maxGross: s.config.maxGross ?? base.maxGross };
}

export function transitionFor(s: Pick<GameState, 'config'>, turn: number) {
  const lvl = levelCfg(s);
  const mode = s.config.regimes ?? 'auto';
  if (mode === 'calm') return transitionMatrix('calm');
  if (mode === 'full') return transitionMatrix('full');
  return transitionMatrix(turn >= lvl.fullRegimesFrom ? lvl.regimeSet : 'calm');
}

const FUNDED: Record<Archetype, number> = {
  statarb: 0.5, factor: 0.5, merger: 0.6, relval: 0.5, event: 1, longvol: 1, tailhedge: 1, shortvol: 0.25,
  pod: 1, trend: 0, macro: 0, carry: 0, future: 0,
};
export function fundedFrac(a: Archetype) {
  return FUNDED[a];
}

export function costMultBelief(belief: Record<RegimeId, number>): number {
  return REGIMES.reduce((s, r) => s + belief[r] * REGIME_SPECS[r].costMult, 0);
}
export function marginMultBelief(belief: Record<RegimeId, number>): number {
  return REGIMES.reduce((s, r) => s + belief[r] * REGIME_SPECS[r].marginMult, 0);
}

/** Per-$ transaction cost including square-root market impact relative to capacity. */
export function tcRate(p: InstrumentPublic, mult: number, dollars: number): number {
  return (p.tcBps / 1e4) * mult * (1 + Math.sqrt(Math.abs(dollars) / p.capacity));
}

export function fundingSpread(ind: Indicators): number {
  return Math.max(0, ind.FUND) / 1e4;
}

/** Holding cost per $ per turn (financing of the position's own legs). */
export function holdRate(p: InstrumentPublic, ind: Indicators): number {
  return (p.finBps / 1e4) * Math.max(0.5, ind.FUND / 20);
}

export function rfWeekly(s: Pick<GameState, 'tape'>): number {
  return s.tape.rf / 100 / 52;
}

/** Cost function for the optimiser and the ex-ante evaluation (weights = notional / NAV). */
export function makeCostFn(s: GameState, insts: InstrumentPublic[], current: number[]): CostFn {
  const mult = costMultBelief(s.belief);
  const tc = insts.map((p) => tcRate(p, mult, 0) * 1.3);
  const hold = insts.map((p) => holdRate(p, s.indicators));
  const ff = insts.map((p) => fundedFrac(p.archetype));
  const rf = rfWeekly(s);
  const lev = rf + fundingSpread(s.indicators) / 52;
  return (w) => {
    let c = 0;
    let funded = 0;
    const g = new Array(w.length).fill(0);
    for (let i = 0; i < w.length; i++) {
      const d = w[i] - current[i];
      c += Math.abs(d) * tc[i] + Math.abs(w[i]) * hold[i];
      g[i] = Math.sign(d) * tc[i] + Math.sign(w[i]) * hold[i];
      funded += ff[i] * Math.abs(w[i]);
    }
    if (funded > 1) {
      c += lev * (funded - 1);
      for (let i = 0; i < w.length; i++) g[i] += lev * ff[i] * Math.sign(w[i]);
    } else {
      c -= rf * (1 - funded);
      for (let i = 0; i < w.length; i++) g[i] -= rf * ff[i] * Math.sign(w[i]);
    }
    return { c, g };
  };
}

// ---------------------------------------------------------------------------
// New game

export function newGame(cfg: GameConfig): GameState {
  const regime: RegimeId = 'normal';
  const belief = Object.fromEntries(REGIMES.map((r) => [r, r === 'normal' ? 0.82 : 0.18 / (REGIMES.length - 1)])) as Record<RegimeId, number>;
  const s: GameState = {
    version: SAVE_VERSION,
    config: cfg,
    turn: 1,
    status: 'playing',
    nav: cfg.startNav,
    peak: cfg.startNav,
    regime,
    belief,
    indicators: initialIndicators(regime),
    tape: { EQX: 5000, UST10: 4.1, USDX: 100, OIL: 78, rf: 3.9 },
    instruments: {},
    truth: {},
    offered: [],
    positions: {},
    history: [],
    bench: Object.fromEntries(BENCH_IDS.map((b) => [b, { nav: cfg.startNav, peak: cfg.startNav, holdings: {}, path: [cfg.startNav] }])) as Record<BenchId, BenchState>,
    ghosts: { half: { nav: cfg.startNav, peak: cfg.startNav, holdings: {}, path: [cfg.startNav] }, double: { nav: cfg.startNav, peak: cfg.startNav, holdings: {}, path: [cfg.startNav] } },
    news: [],
    calibration: [],
    pendingResearch: 0,
    deriskActive: false,
    navPath: [cfg.startNav],
  };
  const perm = permanentInstruments(cfg.seed, cfg.level);
  const pods = cfg.level === 3 ? buildPods(cfg.seed) : [];
  for (const b of [...perm, ...pods]) {
    s.instruments[b.pub.id] = b.pub;
    s.truth[b.pub.id] = b.truth;
  }
  addOffers(s);
  s.news.push(...openingNews(cfg.level));
  return s;
}

function openingNews(level: Level): NewsItem[] {
  const base: NewsItem[] = [{ turn: 1, tone: 'neu', text: 'Markets open the period in an orderly state: volatility near average, funding ample.' }];
  if (level === 1) base.push({ turn: 1, tone: 'neu', text: 'Risk committee: one position at a time. Focus on getting the size right.' });
  if (level === 2) base.push({ turn: 1, tone: 'neu', text: 'You run a $1M multi-strategy book. Gross leverage up to 6×; a 20% drawdown triggers a forced de-gross, 40% closes the fund.' });
  if (level === 3) base.push({ turn: 1, tone: 'neu', text: 'Seven strategy pods are on offer alongside a fresh set of trades every week. Run as many positions as you like, within 5× gross leverage.' });
  return base;
}

function addOffers(s: GameState) {
  const built = generateOffers(s.config.seed, s.config.level, s.turn, s.regime, s.config.scenario);
  s.offered = [];
  for (const b of built) {
    s.instruments[b.pub.id] = b.pub;
    s.truth[b.pub.id] = b.truth;
  }
  // everything that is alive and still open for new money
  for (const p of Object.values(s.instruments)) if (p.alive && p.offerUntil >= s.turn && p.createdTurn <= s.turn) s.offered.push(p.id);
}

// ---------------------------------------------------------------------------
// Queries

export function aliveInstruments(s: GameState): InstrumentPublic[] {
  return Object.values(s.instruments).filter((p) => p.alive);
}

/** Instruments the player may hold or trade this turn: offered ∪ currently held. */
export function tradableIds(s: GameState): string[] {
  const ids = new Set<string>(s.offered);
  for (const id of Object.keys(s.positions)) ids.add(id);
  return [...ids].filter((id) => s.instruments[id]?.alive);
}

/** The desk's view of next period's regime distribution. */
export function nextRegimeWeights(s: GameState): Record<RegimeId, number> {
  return predictRegime(s.belief, transitionFor(s, s.turn));
}

/** The desk's view of next period's (current → next) regime transitions. */
export function deskPairs(s: GameState): RegimePair[] {
  return pairsFromBelief(s.belief, transitionFor(s, s.turn));
}

export function deskScenarios(s: GameState, ids: string[], S = 3000): Scenarios {
  const insts = ids.map((id) => s.instruments[id]);
  return buildScenarios(insts, insts.map(deskParams), deskPairs(s), [s.config.seed, 'desk', s.turn], S);
}

export interface OrderCheck {
  errors: string[];
  warnings: string[];
  gross: number;
  net: number;
  margin: number;
  positions: number;
  tradeCost: number;
  maxGross: number;
}

export function checkOrders(s: GameState, targets: Record<string, number>): OrderCheck {
  const lvl = levelCfg(s);
  const errors: string[] = [];
  const warnings: string[] = [];
  const mm = marginMultBelief(s.belief);
  const cm = costMultBelief(s.belief);
  let gross = 0;
  let net = 0;
  let margin = 0;
  let count = 0;
  let tradeCost = 0;
  for (const [id, n] of Object.entries(targets)) {
    const p = s.instruments[id];
    if (!p) continue;
    const cur = s.positions[id]?.notional ?? 0;
    if (n !== cur) {
      if (!p.alive) errors.push(`${p.name} has resolved and can no longer be traded.`);
      else if (Math.abs(n) > Math.abs(cur) && !s.offered.includes(id) && !s.positions[id]) errors.push(`${p.name} is no longer open for new money.`);
      tradeCost += Math.abs(n - cur) * tcRate(p, cm, n - cur);
    }
    if (n < 0 && !p.allowShort) errors.push(`${p.name} cannot be shorted.`);
    if (Math.abs(n) > p.maxPctNav * s.nav + 1) errors.push(`${p.name}: position limit is ${(p.maxPctNav * 100).toFixed(0)}% of NAV.`);
    if (n !== 0) count++;
    gross += Math.abs(n);
    net += n * p.netFraction;
    margin += Math.abs(n) * p.margin * mm;
  }
  const maxGross = lvl.maxGross * (s.deriskActive ? 0.5 : 1);
  if (count > lvl.maxPositions) errors.push(lvl.maxPositions === 1 ? 'Level 1: one position at a time.' : `Maximum ${lvl.maxPositions} positions.`);
  if (gross > maxGross * s.nav + 1) errors.push(`Gross leverage ${(gross / s.nav).toFixed(2)}× exceeds the ${maxGross.toFixed(1)}× limit${s.deriskActive ? ' (halved while the risk committee de-risk order is active)' : ''}.`);
  if (margin > s.nav) errors.push(`Margin requirement $${fmtK(margin)} exceeds NAV — insufficient collateral.`);
  else if (margin > 0.75 * s.nav) warnings.push(`Margin usage ${((margin / s.nav) * 100).toFixed(0)}% of NAV: a haircut increase could force liquidation.`);
  return { errors, warnings, gross, net, margin, positions: count, tradeCost, maxGross };
}

function fmtK(x: number) {
  return Math.abs(x) >= 1e6 ? (x / 1e6).toFixed(2) + 'M' : (x / 1e3).toFixed(0) + 'k';
}

// ---------------------------------------------------------------------------
// Research

export function buyResearch(prev: GameState, id: string, kind: 'signal' | 'risk'): { state: GameState; message: string } {
  const s: GameState = structuredClone(prev);
  const p = s.instruments[id];
  const t = s.truth[id];
  if (!p || !t || p.research[kind]) return { state: prev, message: 'Research already purchased.' };
  const cost = p.researchCost[kind] * s.nav;
  s.nav -= cost;
  s.pendingResearch += cost;
  p.research[kind] = true;
  const rng = new Rng(s.config.seed, 'research', id, kind);
  let message: string;
  if (kind === 'signal') {
    const before = quoteInstrument(p, deskPairs(s));
    t.errScale = 0.3;
    t.resNoise = rng.normal() * 0.04;
    p.se0 = Math.max(0.02, p.se0 * 0.45);
    refreshEstimate(s, id);
    const after = quoteInstrument(p, deskPairs(s));
    const d = after.win - before.win;
    message = `Signal research: estimated win probability ${(before.win * 100).toFixed(1)}% → ${(after.win * 100).toFixed(1)}% (${d >= 0 ? '+' : ''}${(d * 100).toFixed(1)}pp); uncertainty band tightened.`;
  } else {
    const oldBeta = p.betaEst.slice();
    p.betaEst = capBeta(t.beta.map((b) => b + rng.normal() * 0.03));
    p.idioEst = idioFor(p.betaEst);
    let maxK = 0;
    let maxD = 0;
    p.betaEst.forEach((b, k) => {
      if (Math.abs(b - oldBeta[k]) > maxD) {
        maxD = Math.abs(b - oldBeta[k]);
        maxK = k;
      }
    });
    message = maxD > 0.15
      ? `Risk research: the trade's exposure to ${FACTORS[maxK]} is ${p.betaEst[maxK] > oldBeta[maxK] ? 'much larger' : 'much smaller'} than reported (${oldBeta[maxK].toFixed(2)} → ${p.betaEst[maxK].toFixed(2)}).`
      : 'Risk research: reported factor loadings confirmed (no material hidden exposure found).';
  }
  return { state: s, message };
}

function refreshEstimate(s: GameState, id: string) {
  const p = s.instruments[id];
  const t = s.truth[id];
  const age = Math.max(0, s.turn - p.createdTurn);
  const learn = Math.pow(LEARN_SHRINK, age);
  p.estDrift = trueDrift(t, p, s.turn) + (t.err0 * t.errScale + t.resNoise) * learn;
  p.statedSe = Math.max(0.02, p.se0 * Math.sqrt(learn));
}

// ---------------------------------------------------------------------------
// Benchmarks (computed from the same desk information the player had)

function benchTargets(s: GameState, b: BenchId, sc: Scenarios, universe: string[], current: number[]): number[] {
  const lvl = levelCfg(s);
  const insts = universe.map((id) => s.instruments[id]);
  const n = universe.length;
  const zero = new Array(n).fill(0);
  if (b === 'cash' || n === 0) return zero;
  const quotes = insts.map((p) => quoteInstrument(p, deskPairs(s)));
  const lo = insts.map((p) => (p.allowShort ? -p.maxPctNav : 0));
  const hi = insts.map((p) => p.maxPctNav);
  if (b === 'growth') {
    if (lvl.maxPositions === 1) {
      let best = { g: 0, i: -1, w: 0 };
      insts.forEach((_, i) => {
        const one = subsetScenarios(sc, [universe[i]]);
        const opt = optimizeLogPortfolio(one, { lo: [0], hi: [Math.min(hi[i], lvl.maxGross)], maxGross: lvl.maxGross, costFn: makeCostFn(s, [insts[i]], [current[i]]) });
        const half = opt.weights[0] * 0.5;
        const g = scenarioLogGrowth(one, [half], 0, makeCostFn(s, [insts[i]], [current[i]]));
        if (g > best.g) best = { g, i, w: half };
      });
      const w = zero.slice();
      if (best.i >= 0) w[best.i] = best.w;
      return w;
    }
    const opt = optimizeLogPortfolio(sc, { lo, hi, maxGross: lvl.maxGross, costFn: makeCostFn(s, insts, current), init: current });
    return opt.weights.map((w) => w * 0.5);
  }
  const positive = quotes.map((q, i) => q.ev > 0 && insts[i].archetype !== 'future' && insts[i].archetype !== 'tailhedge');
  if (b === 'fixed') {
    let w = quotes.map((q, i) => (positive[i] ? Math.min(hi[i], 0.01 / Math.max(0.005, -q.worst)) : 0));
    if (lvl.maxPositions === 1) {
      let bi = -1;
      quotes.forEach((q, i) => {
        if (positive[i] && (bi < 0 || q.ev / -q.worst > quotes[bi].ev / -quotes[bi].worst)) bi = i;
      });
      w = w.map((x, i) => (i === bi ? x : 0));
    }
    return capGross(w, lvl.maxGross);
  }
  // diversified: equal risk contribution over positive-EV trades, 10% annual vol target
  const idx = positive.map((p, i) => (p ? i : -1)).filter((i) => i >= 0);
  if (!idx.length) return zero;
  let use = idx;
  if (lvl.maxPositions === 1) {
    use = [idx.reduce((a, i) => (quotes[i].sharpe > quotes[a].sharpe ? i : a), idx[0])];
  }
  const sub = subsetScenarios(sc, use.map((i) => universe[i]));
  const C = scenarioCov(sub);
  let w = use.map((_, j) => 1 / Math.sqrt(Math.max(C[j][j], 1e-10)));
  for (let it = 0; it < 60; it++) {
    const rc = riskContrib(C, w).rc;
    const target = rc.reduce((a, b2) => a + b2, 0) / rc.length;
    w = w.map((x, j) => x * Math.sqrt(target / Math.max(rc[j], 1e-14)));
  }
  const sig = riskContrib(C, w).sigma;
  const scale = sig > 0 ? 0.1 / Math.sqrt(52) / sig : 0;
  const out = zero.slice();
  use.forEach((i, j) => (out[i] = Math.min(hi[i], w[j] * scale)));
  return capGross(out, lvl.maxGross);
}

function capGross(w: number[], G: number): number[] {
  const g = w.reduce((a, x) => a + Math.abs(x), 0);
  return g > G ? w.map((x) => (x * G) / g) : w;
}

/** Largest multiple of w that keeps every scenario solvent (capped), so 1-D searches stay in the valid region. */
export function scaleBound(sc: Scenarios, w: readonly number[], cap = 25): number {
  let minR = 0;
  for (let s2 = 0; s2 < sc.S; s2++) {
    let r = 0;
    for (let i = 0; i < sc.N; i++) if (w[i]) r += w[i] * sc.R[s2 * sc.N + i];
    if (r < minR) minR = r;
  }
  return minR < 0 ? Math.min(cap, 0.995 / -minR) : cap;
}

// ---------------------------------------------------------------------------
// Ex-ante evaluation of the player's portfolio (desk model only)

export function evaluateExAnte(s: GameState, targets: Record<string, number>, sc?: Scenarios): ExAnte {
  const lvl = levelCfg(s);
  const universe = tradableIds(s);
  const scen = sc ? subsetScenarios(sc, universe) : deskScenarios(s, universe);
  const insts = universe.map((id) => s.instruments[id]);
  const cur = universe.map((id) => (s.positions[id]?.notional ?? 0) / s.nav);
  const w = universe.map((id) => (targets[id] ?? 0) / s.nav);
  const costFn = makeCostFn(s, insts, cur);
  const cost = costFn(w).c;
  const stats = portfolioStats(scen, w, -cost);
  const elog = stats.elog;
  const held = universe.map((_, i) => i).filter((i) => w[i] !== 0);

  // log-optimal benchmark under the same information and constraints
  let wOpt: number[];
  if (lvl.maxPositions === 1) {
    wOpt = new Array(universe.length).fill(0);
    let bestG = scenarioLogGrowth(scen, wOpt, 0, costFn);
    universe.forEach((_, i) => {
      const lo = insts.map(() => 0);
      const hi = insts.map((p, j) => (j === i ? Math.min(p.maxPctNav, lvl.maxGross) : 0));
      const o = optimizeLogPortfolio(scen, { lo, hi, maxGross: lvl.maxGross, costFn });
      if (o.growth > bestG) {
        bestG = o.growth;
        wOpt = o.weights;
      }
    });
  } else {
    wOpt = optimizeLogPortfolio(scen, {
      lo: insts.map((p) => (p.allowShort ? -p.maxPctNav : 0)),
      hi: insts.map((p) => p.maxPctNav),
      maxGross: lvl.maxGross,
      costFn,
      init: w,
    }).weights;
  }
  const gOpt = scenarioLogGrowth(scen, wOpt, 0, costFn);
  const gHalf = scenarioLogGrowth(scen, wOpt.map((x) => x * 0.5), 0, costFn);
  const g0 = scenarioLogGrowth(scen, cur.map(() => 0), 0, costFn);
  const gain = gOpt - g0;
  const efficiency = gain > 1e-7 ? clamp((elog - g0) / gain, -2, 1) : elog >= g0 - 1e-6 ? 1 : -1;

  const anyHeld = held.length > 0;
  const gk = (k: number) => {
    const v = scenarioLogGrowth(scen, w.map((x) => x * k), 0, costFn);
    return isFinite(v) ? v : -1e9;
  };
  // the best multiple of your book that respects solvency, the gross limit and position limits
  const grossNow = w.reduce((a, x) => a + Math.abs(x), 0);
  let kCap = scaleBound(scen, w);
  if (grossNow > 0) kCap = Math.min(kCap, (lvl.maxGross * (s.deriskActive ? 0.5 : 1)) / grossNow);
  insts.forEach((p, i) => { if (w[i]) kCap = Math.min(kCap, p.maxPctNav / Math.abs(w[i])); });
  kCap = Math.max(kCap, 1);
  const scale = anyHeld ? (() => { const k = goldenMax(gk, 0, kCap, 1e-5); return { k, growth: gk(k) }; })() : { k: 1, growth: g0 };
  const selection = anyHeld ? (gain > 1e-7 ? clamp((scale.growth - g0) / gain, 0, 1) : scale.growth > g0 - 1e-6 ? 1 : 0) : 0;
  const sz = anyHeld && scale.k > 0 ? 1 / scale.k : anyHeld ? 99 : 0;
  const sizingQ = !anyHeld ? 0 : sz < 0.25 ? 0.15 + 0.85 * (sz / 0.25) : sz <= 1 ? 1 : Math.max(0, 1 - (sz - 1) * 0.8);
  const curve: ExAnte['curve'] = [];
  for (let k = 0; k <= 3.0001; k += 0.125) {
    const st = portfolioStats(scen, w.map((x) => x * k), -costFn(w.map((x) => x * k)).c);
    curve.push({ k, elog: st.elog, er: st.er });
  }
  const C = scenarioCov(scen);
  const rcs = riskContrib(C, w);
  const totRc = rcs.rc.reduce((a, b) => a + Math.max(b, 0), 0);
  const maxRcShare = totRc > 0 ? Math.max(...rcs.rc.map((x) => Math.max(x, 0) / totRc)) : 0;
  const chk = checkOrders(s, targets);
  const breaches: string[] = [];
  if (held.length > 1 && maxRcShare > lvl.concentrationLimit) breaches.push(`One position supplies ${(maxRcShare * 100).toFixed(0)}% of portfolio risk (limit ${(lvl.concentrationLimit * 100).toFixed(0)}%).`);
  if (lvl.level > 1) {
    const fx = new Array(NF).fill(0);
    universe.forEach((id, i) => {
      if (!w[i]) return;
      const p = s.instruments[id];
      const b = latentSlope(p);
      for (let k = 0; k < NF; k++) fx[k] += w[i] * b * p.betaEst[k];
    });
    fx.forEach((x, k) => {
      if (Math.abs(x) > lvl.factorLimit) breaches.push(`${FACTORS[k]} exposure ${(x * 100).toFixed(1)}% of NAV per 1σ exceeds the ${(lvl.factorLimit * 100).toFixed(1)}% limit.`);
    });
  }
  return {
    er: stats.er,
    vol: stats.vol,
    elog,
    var95: stats.var95,
    es95: stats.es95,
    pLoss5: stats.pLoss5,
    pctl: stats.pctl,
    kStar: scale.k,
    sizing: sz,
    selection,
    sizingQ,
    gOpt,
    gHalf,
    gCash: g0,
    efficiency,
    wOpt: Object.fromEntries(universe.map((id, i) => [id, wOpt[i]])),
    gross: chk.gross / s.nav,
    net: chk.net / s.nav,
    margin: chk.margin / s.nav,
    divRatio: rcs.divRatio,
    maxRcShare,
    curve,
    losers: losersDistribution(scen, held),
    heldIds: held.map((i) => universe[i]),
    breaches,
    expCost: cost,
  };
}

// ---------------------------------------------------------------------------
// Resolution

interface Draw {
  regime: RegimeId;
  Z: number[];
  jump: string | null;
  indicators: Indicators;
  outcomes: Record<string, number>; // outcome index per instrument
}

/** Market resolution for a turn. Depends only on seed, turn and the (decision-independent) market state. */
export function drawMarket(s: GameState): Draw {
  const seed = s.config.seed;
  const t = s.turn;
  const T = transitionFor(s, t);
  const drawn = drawRegime(new Rng(seed, 'regime', t), s.regime, T);
  const regime = scenarioRegime(s.config.scenario, t) ?? drawn;
  const fd = drawFactors(new Rng(seed, 'factors', t), regime, s.regime);
  const indicators = stepIndicators(new Rng(seed, 'ind', t), s.indicators, regime);
  const outcomes: Record<string, number> = {};
  for (const p of aliveInstruments(s)) {
    const tr = s.truth[p.id];
    const eps = new Rng(seed, 'idio', p.id, t).normal();
    let x = trueDrift(tr, p, t) + Math.sqrt(tr.idio) * eps;
    for (let f = 0; f < NF; f++) x += tr.beta[f] * fd.Z[f];
    outcomes[p.id] = bucketOf(x, p.thresholds);
  }
  return { regime, Z: fd.Z, jump: fd.jump, indicators, outcomes };
}

/** True next-period outcome probabilities (HIDDEN; used for end-of-campaign reveal and transparent mode). */
export function trueProbs(s: GameState, id: string): number[] {
  const p = s.instruments[id];
  const t = s.truth[id];
  const T = transitionFor(s, s.turn);
  return outcomeProbs(p, trueDrift(t, p, s.turn), t.beta, t.idio, pairsFromRegime(s.regime, T));
}

interface BookResult {
  pnl: number;
  tc: number;
  fin: number;
  lev: number;
  cash: number;
}

function runBook(s: GameState, before: Record<string, number>, after: Record<string, number>, draw: Draw, nav: number): BookResult {
  const cm = REGIME_SPECS[s.regime].costMult;
  let tc = 0;
  let fin = 0;
  let funded = 0;
  let pnl = 0;
  const ids = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const id of ids) {
    const p = s.instruments[id];
    const n0 = before[id] ?? 0;
    const n1 = after[id] ?? 0;
    if (n1 !== n0) tc += Math.abs(n1 - n0) * tcRate(p, cm, n1 - n0);
    if (!n1) continue;
    fin += Math.abs(n1) * holdRate(p, s.indicators);
    funded += Math.abs(n1) * fundedFrac(p.archetype);
    const k = draw.outcomes[id];
    pnl += n1 * p.outcomes[k].r;
  }
  const rf = rfWeekly(s);
  const navAfterTc = nav - tc;
  const lev = Math.max(0, funded - navAfterTc) * (rf + fundingSpread(s.indicators) / 52);
  const cash = Math.max(0, navAfterTc - funded) * rf;
  return { pnl, tc, fin, lev, cash };
}

export function advance(prev: GameState, orders: Order[]): { state: GameState; record: TurnRecord } {
  if (prev.status !== 'playing') throw new Error('Campaign is over.');
  const s: GameState = structuredClone(prev);
  const lvl = levelCfg(s);
  const t = s.turn;
  const targets: Record<string, number> = {};
  for (const [id, pos] of Object.entries(s.positions)) targets[id] = pos.notional;
  for (const o of orders) {
    targets[o.id] = Math.abs(o.target) < 1 ? 0 : o.target;
  }
  const chk = checkOrders(s, targets);
  if (chk.errors.length) throw new Error(chk.errors.join(' '));

  // ---- ex-ante (information set at decision time) ----
  const universe = tradableIds(s);
  for (const b of BENCH_IDS) for (const id of Object.keys(s.bench[b].holdings)) if (s.instruments[id]?.alive && !universe.includes(id)) universe.push(id);
  const sc = deskScenarios(s, universe);
  const exAnte = evaluateExAnte(s, targets, sc);
  const nextW = deskPairs(s);
  const quotes: Record<string, ReturnType<typeof quoteInstrument>> = {};
  for (const id of universe) quotes[id] = quoteInstrument(s.instruments[id], nextW);

  // benchmark targets (same information)
  const benchTarget: Record<BenchId, Record<string, number>> = {} as never;
  for (const b of BENCH_IDS) {
    const bs = s.bench[b];
    const bu = [...new Set([...s.offered, ...Object.keys(bs.holdings)])].filter((id) => s.instruments[id]?.alive);
    const bsc = subsetScenarios(sc, bu.filter((id) => sc.ids.includes(id)));
    const cur = bsc.ids.map((id) => (bs.holdings[id] ?? 0) / bs.nav);
    const w = benchTargets(s, b, bsc, bsc.ids, cur);
    benchTarget[b] = Object.fromEntries(bsc.ids.map((id, i) => [id, w[i] * bs.nav]).filter(([, n]) => Math.abs(n as number) > 1));
  }

  // ---- resolve the market ----
  const draw = drawMarket(s);
  const navBefore = s.nav + s.pendingResearch; // research was charged at purchase time
  const before: Record<string, number> = {};
  for (const [id, pos] of Object.entries(s.positions)) before[id] = pos.notional;
  const book = runBook(s, before, targets, draw, s.nav);
  const events: GameEvent[] = [];
  if (draw.jump) events.push({ kind: 'jump', text: `Market shock: ${draw.jump}.` });

  // position results and attribution
  const positions: PositionResult[] = [];
  const attribution: Record<string, number> = { alpha: 0, residual: 0 };
  FACTORS.forEach((f) => (attribution[f] = 0));
  const T = transitionFor(s, t);
  for (const [id, n] of Object.entries(targets)) {
    if (!n) continue;
    const p = s.instruments[id];
    const k = draw.outcomes[id];
    const o = p.outcomes[k];
    const pnl = n * o.r;
    const q = quotes[id] ?? quoteInstrument(p, nextW);
    const slope = latentSlope(p);
    const factorPnl = FACTORS.map((_, f) => n * slope * p.betaEst[f] * draw.Z[f]);
    const fsum = factorPnl.reduce((a, b) => a + b, 0);
    const alphaPnl = n * q.ev;
    const residualPnl = pnl - alphaPnl - fsum;
    FACTORS.forEach((f, i) => (attribution[f] += factorPnl[i]));
    attribution.alpha += alphaPnl;
    attribution.residual += residualPnl;
    const tr = s.truth[id];
    const tp = outcomeProbs(p, trueDrift(tr, p, t), tr.beta, tr.idio, pairsFromRegime(s.regime, T));
    const userProb = orders.find((x) => x.id === id)?.userProb ?? s.positions[id]?.userProb;
    positions.push({
      id, name: p.name, archetype: p.archetype, notional: n, r: o.r, pnl, outcome: o.label, terminal: !!o.terminal,
      quotedEv: q.ev, quotedWin: q.win, quotedSd: q.sd, userProb, won: o.r > 0, factorPnl, alphaPnl, residualPnl,
      trueEv: evOf(p.outcomes, tp), trueWin: winProb(p.outcomes, tp), quality: tr.quality,
    });
    s.calibration.push({ turn: t, id, archetype: p.archetype, quoted: q.win, user: userProb, won: o.r > 0, truth: winProb(p.outcomes, tp) });
  }
  attribution.costs = -(book.tc + book.fin + book.lev) + book.cash;

  // NAV update
  let nav = s.nav - book.tc - book.fin - book.lev + book.cash + book.pnl;
  const newPositions: Record<string, Position> = {};
  for (const [id, n] of Object.entries(targets)) {
    if (!n) continue;
    const old = s.positions[id];
    const pr = positions.find((x) => x.id === id)!;
    newPositions[id] = {
      id,
      notional: n,
      entryTurn: old?.entryTurn ?? t,
      pnl: (old?.pnl ?? 0) + pr.pnl,
      userProb: orders.find((x) => x.id === id)?.userProb ?? old?.userProb,
      pct: n / prev.nav,
    };
  }

  // instrument lifecycle: terminal outcomes and expiry
  for (const p of aliveInstruments(s)) {
    const k = draw.outcomes[p.id];
    const terminal = p.outcomes[k].terminal;
    if (terminal || t >= p.expiresTurn) {
      p.alive = false;
      if (newPositions[p.id]) {
        events.push({ kind: terminal ? 'terminal' : 'expiry', text: terminal ? `${p.name}: ${p.outcomes[k].label} — position closed.` : `${p.name} reached the end of its holding period and was closed.` });
        nav -= Math.abs(newPositions[p.id].notional) * tcRate(p, REGIME_SPECS[draw.regime].costMult, newPositions[p.id].notional) * (terminal ? 0 : 1);
        delete newPositions[p.id];
      }
    }
  }

  // margin call with the new regime's haircuts
  let liqCost = 0;
  const mmNew = REGIME_SPECS[draw.regime].marginMult;
  const marginReq = () => Object.values(newPositions).reduce((a, pos) => a + Math.abs(pos.notional) * s.instruments[pos.id].margin * mmNew, 0);
  if (nav > 0 && marginReq() > nav) {
    const f = (0.75 * nav) / marginReq();
    for (const pos of Object.values(newPositions)) {
      const p = s.instruments[pos.id];
      const cut = pos.notional * (1 - f);
      const c = Math.abs(cut) * tcRate(p, REGIME_SPECS[draw.regime].costMult, cut) * 3;
      liqCost += c;
      pos.notional *= f;
    }
    nav -= liqCost;
    events.push({ kind: 'forced-liquidation', text: `MARGIN CALL: haircuts rose (${mmNew.toFixed(2)}× normal) and collateral fell short. The prime broker liquidated ${((1 - f) * 100).toFixed(0)}% of every position at fire-sale prices (cost $${fmtK(liqCost)}).` });
  }

  const peak = Math.max(s.peak, nav);
  const dd = peak > 0 ? 1 - nav / peak : 1;
  if (nav <= 0 || nav < 0.1 * s.config.startNav) {
    events.push({ kind: 'ruin', text: 'RUIN: capital exhausted. The fund is closed.' });
    s.status = 'closed';
    s.closedReason = 'Ruin — capital exhausted.';
    nav = Math.max(nav, 0);
    for (const k of Object.keys(newPositions)) delete newPositions[k];
  } else if (dd >= lvl.ddStop) {
    events.push({ kind: 'closed', text: `Drawdown of ${(dd * 100).toFixed(1)}% breached the ${(lvl.ddStop * 100).toFixed(0)}% stop. Investors redeem; the fund is closed.` });
    s.status = 'closed';
    s.closedReason = `Drawdown stop (${(lvl.ddStop * 100).toFixed(0)}%) breached.`;
    for (const pos of Object.values(newPositions)) nav -= Math.abs(pos.notional) * tcRate(s.instruments[pos.id], 2, pos.notional);
    for (const k of Object.keys(newPositions)) delete newPositions[k];
  } else if (dd >= lvl.ddDerisk && !s.deriskActive) {
    let cut = 0;
    for (const pos of Object.values(newPositions)) {
      const c = Math.abs(pos.notional) * 0.5 * tcRate(s.instruments[pos.id], 1.5, pos.notional * 0.5);
      cut += c;
      pos.notional *= 0.5;
    }
    nav -= cut;
    liqCost += cut;
    s.deriskActive = true;
    events.push({ kind: 'derisk', text: `Drawdown ${(dd * 100).toFixed(1)}% hit the ${(lvl.ddDerisk * 100).toFixed(0)}% risk-committee trigger: all positions halved and the gross limit is halved until you recover half the drawdown.` });
  } else if (s.deriskActive && dd < lvl.ddDerisk / 2) {
    s.deriskActive = false;
    events.push({ kind: 'derisk', text: 'Drawdown recovered: the risk committee lifts the de-risk order.' });
  }

  // ---- benchmarks and ghost books (same market draw) ----
  const benchRec = {} as TurnRecord['bench'];
  for (const b of BENCH_IDS) benchRec[b] = runShadow(s, s.bench[b], benchTarget[b], draw, mmNew);
  if (!s.ghosts) s.ghosts = initGhosts(prev.navPath, prev.config.startNav);
  const ghostRec = {} as NonNullable<TurnRecord['ghosts']>;
  for (const g of GHOSTS) {
    const gs = s.ghosts[g.id];
    const tgt: Record<string, number> = {};
    for (const [id, n] of Object.entries(targets)) if (n) tgt[id] = (n / prev.nav) * g.k * gs.nav;
    ghostRec[g.id] = runShadow(s, gs, tgt, draw, mmNew);
  }

  // ---- counterfactual sizing (hindsight) ----
  const grossPnlRet = book.pnl / s.nav;
  const varCost = (book.tc + book.fin + book.lev - book.cash) / s.nav;
  const counterfactual = [0, 0.25, 0.5, 1, 1.5, 2, 3].map((k) => ({ k, ret: Math.max(-1, k * (grossPnlRet - varCost)) }));

  // ---- market & desk update ----
  const beliefBefore = s.belief;
  const prevInd = s.indicators;
  s.regime = draw.regime;
  s.indicators = draw.indicators;
  s.belief = filterStep(s.belief, prevInd, draw.indicators, T);
  updateTape(s, draw.Z);
  s.positions = newPositions;
  s.nav = nav;
  s.peak = peak;
  s.navPath.push(nav);
  s.pendingResearch = 0;

  const ret = nav / navBefore - 1;
  const grade = gradeTurn(exAnte, ret, lvl);
  const record: TurnRecord = {
    turn: t,
    navBefore,
    navAfter: nav,
    ret,
    logRet: Math.log(Math.max(nav, 1e-9) / navBefore),
    pnlPositions: book.pnl,
    costs: { tc: book.tc, fin: book.fin, lev: book.lev, cash: book.cash, research: prev.pendingResearch, liquidation: liqCost },
    positions,
    Z: draw.Z,
    jump: draw.jump,
    beliefBefore,
    beliefAfter: s.belief,
    indicators: draw.indicators,
    exAnte,
    bench: benchRec,
    ghosts: ghostRec,
    events,
    attribution,
    counterfactual,
    drawdown: 1 - nav / peak,
    grade,
    lessons: [],
    trueRegime: draw.regime,
  };
  record.lessons = pickLessons(record, lvl);
  s.history.push(record);
  s.news = makeNews(s, record);

  // ---- next turn ----
  s.turn = t + 1;
  for (const p of aliveInstruments(s)) refreshEstimate(s, p.id);
  if (s.status === 'playing') {
    if (s.config.turns !== null && s.turn > s.config.turns) s.status = 'ended';
    else addOffers(s);
  }
  return { state: s, record };
}

function initGhosts(path: number[], start: number): Record<GhostId, BenchState> {
  // older saves: ghosts start now, flat history before
  const p = path.map(() => start);
  return { half: { nav: start, peak: start, holdings: {}, path: p.slice() }, double: { nav: start, peak: start, holdings: {}, path: p.slice() } };
}

/** Run a shadow book (benchmark or ghost) through this week's draw, with margin calls. */
function runShadow(s: GameState, bs: BenchState, target: Record<string, number>, draw: Draw, mmNew: number) {
  const navB0 = bs.nav;
  const res = runBook(s, bs.holdings, target, draw, bs.nav);
  let navB = bs.nav - res.tc - res.fin - res.lev + res.cash + res.pnl;
  const hold: Record<string, number> = {};
  for (const [id, n] of Object.entries(target)) if (s.instruments[id].alive && n) hold[id] = n;
  const mreq = Object.entries(hold).reduce((a, [id, n]) => a + Math.abs(n) * s.instruments[id].margin * mmNew, 0);
  if (navB > 0 && mreq > navB) {
    const f = (0.75 * navB) / mreq;
    for (const id of Object.keys(hold)) {
      navB -= Math.abs(hold[id] * (1 - f)) * tcRate(s.instruments[id], REGIME_SPECS[draw.regime].costMult, hold[id]) * 3;
      hold[id] *= f;
    }
  }
  navB = Math.max(navB, 0);
  bs.nav = navB;
  bs.peak = Math.max(bs.peak, navB);
  bs.holdings = navB > 0 ? hold : {};
  bs.path.push(navB);
  return { navBefore: navB0, navAfter: navB };
}

/**
 * The book you would carry into next week: held positions at their current
 * dollar notional ('usd'), or rebalanced to their % of current NAV ('pct').
 */
export function carriedTargets(s: GameState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, p] of Object.entries(s.positions)) {
    out[id] = s.config.holdMode === 'pct' && p.pct !== undefined ? clampToLimit(s, id, p.pct * s.nav) : p.notional;
  }
  return out;
}

function clampToLimit(s: GameState, id: string, n: number): number {
  const lim = s.instruments[id].maxPctNav * s.nav;
  return Math.round(Math.max(-lim, Math.min(lim, n)));
}

export interface MultiResult {
  state: GameState;
  records: TurnRecord[];
  stoppedEarly?: string;
}

/**
 * Advance several weeks: the first week executes your orders, later weeks carry
 * the book forward (rebalancing in 'pct' mode). Stops early on a margin call,
 * a risk-committee de-risk, a market shock, or the end of the session, so you
 * can react.
 */
export function advanceMany(prev: GameState, orders: Order[], weeks: number): MultiResult {
  let s = prev;
  const records: TurnRecord[] = [];
  let ord = orders;
  for (let i = 0; i < weeks && s.status === 'playing'; i++) {
    if (i > 0) {
      const tg = carriedTargets(s);
      ord = Object.entries(tg).filter(([id, n]) => Math.abs(n - (s.positions[id]?.notional ?? 0)) >= 1).map(([id, target]) => ({ id, target }));
      // drop orders the limits would reject (e.g. gross cap after a loss) by scaling the whole book back
      const chk = checkOrders(s, { ...Object.fromEntries(Object.entries(s.positions).map(([id, p]) => [id, p.notional])), ...tg });
      if (chk.errors.length) ord = [];
    }
    const r = advance(s, ord);
    s = r.state;
    records.push(r.record);
    const alert = r.record.events.find((e) => e.kind === 'forced-liquidation' || e.kind === 'derisk' || e.kind === 'jump' || e.kind === 'closed' || e.kind === 'ruin');
    if (alert && i < weeks - 1) return { state: s, records, stoppedEarly: alert.text };
  }
  return { state: s, records };
}

function updateTape(s: GameState, Z: number[]) {
  const z = (f: string) => Z[FACTORS.indexOf(f as never)];
  s.tape.EQX *= 1 + 0.0012 + 0.018 * z('EQ');
  s.tape.UST10 = Math.max(0.2, s.tape.UST10 + 0.11 * z('RATES'));
  s.tape.USDX *= 1 - 0.006 * z('CARRY');
  s.tape.OIL *= 1 + 0.03 * z('COMMOD');
  s.tape.rf = clamp(s.tape.rf + 0.04 * z('RATES'), 0.25, 8);
}

// ---------------------------------------------------------------------------
// Grading (process, judged on information available before the outcome)

export function gradeTurn(ex: ExAnte, ret: number, lvl: LevelConfig): Grade {
  const gain = ex.gOpt - ex.gCash;
  // How much was at stake this turn? Small opportunity sets matter less.
  const stakes = clamp(gain / 0.0015, 0, 1);
  let score: number;
  if (!ex.heldIds.length) {
    score = stakes * 0 + (1 - stakes) * 85;
    if (gain < 1e-5) score = 90;
  } else {
    const raw = 100 * ex.selection * ex.sizingQ;
    score = stakes * raw + (1 - stakes) * Math.max(raw, ex.elog >= ex.gCash - 1e-5 ? 75 : 40);
  }
  score -= 12 * ex.breaches.length;
  if (lvl.level > 1 && ex.heldIds.length > 2 && ex.maxRcShare > 0.85) score -= 10;
  score = clamp(score, 0, 100);
  const letter = score >= 80 ? 'A' : score >= 65 ? 'B' : score >= 45 ? 'C' : score >= 25 ? 'D' : 'F';
  const goodDecision = score >= 60;
  const goodOutcome = ret >= 0;
  const quadrant = goodDecision ? (goodOutcome ? 'good-good' : 'good-bad') : goodOutcome ? 'bad-good' : 'bad-bad';
  const verdict = {
    'good-good': 'Sound decision, rewarded this time.',
    'good-bad': 'Sound decision, unlucky outcome. Keep doing this.',
    'bad-good': 'Profitable — but the risk taken was not justified by the information you had. Luck, not skill.',
    'bad-bad': 'Poor decision and a poor outcome. The loss was a predictable consequence of the risk taken.',
  }[quadrant];
  return { score, letter, quadrant, verdict };
}

function pickLessons(r: TurnRecord, lvl: LevelConfig): string[] {
  const out: string[] = [];
  const ex = r.exAnte;
  const held = ex.heldIds.length;
  if (r.events.some((e) => e.kind === 'forced-liquidation')) out.push('forcedLiq');
  if (r.events.some((e) => e.kind === 'derisk' && e.text.includes('trigger'))) out.push('derisk');
  if (held && ex.sizing > 1.6) out.push('overbetBeyondKelly');
  else if (held && ex.sizing > 1.05) out.push('aboveKelly');
  if (r.grade.quadrant === 'good-bad') out.push('goodLoss');
  if (r.grade.quadrant === 'bad-good') out.push('luckyWin');
  if (held >= 3) {
    const losers = r.positions.filter((p) => p.r < 0).length;
    const pj = ex.losers.joint.slice(losers).reduce((a, b) => a + b, 0);
    const pi = ex.losers.indep.slice(losers).reduce((a, b) => a + b, 0);
    if (losers >= Math.ceil(held * 0.6) && pi < 0.1 && pj > 1.8 * pi) out.push('correlation');
  }
  if (r.positions.some((p) => p.archetype === 'tailhedge' && p.r > 0.05)) out.push('tailHedgePaid');
  if (r.positions.some((p) => (p.archetype === 'carry' || p.archetype === 'shortvol') && p.r < -0.08)) out.push('hiddenTail');
  const topBefore = topRegime(r.beliefBefore);
  const topAfter = topRegime(r.beliefAfter);
  if (topBefore !== topAfter && lvl.level > 1) out.push('regimeShift');
  if (!held && ex.gOpt - 0 > 0.0008) out.push('idleCash');
  if (held && ex.sizing < 0.12 && ex.gOpt > 0.0008) out.push('tooTimid');
  if (held >= 3 && ex.divRatio > 1.7) out.push('diversification');
  if (ex.breaches.length) out.push('limits');
  if (ex.gross > 4 && r.ret < -0.03) out.push('leverage');
  if (!out.length) out.push(held ? 'volDrag' : 'cashOption');
  return out.slice(0, 3);
}

export function topRegime(b: Record<RegimeId, number>): RegimeId {
  return REGIMES.reduce((a, r) => (b[r] > b[a] ? r : a), REGIMES[0]);
}

function makeNews(s: GameState, r: TurnRecord): NewsItem[] {
  const t = s.turn + 1;
  const rng = new Rng(s.config.seed, 'news', s.turn);
  const z = (f: string) => r.Z[FACTORS.indexOf(f as never)];
  const out: NewsItem[] = [];
  if (r.jump) out.push({ turn: t, tone: 'neg', text: `${r.jump}: violent moves across risk assets.` });
  const eq = 0.0012 + 0.018 * z('EQ');
  out.push({ turn: t, tone: eq >= 0 ? 'pos' : 'neg', text: `Equities ${eq >= 0 ? 'rose' : 'fell'} ${(Math.abs(eq) * 100).toFixed(1)}% on the week; 10Y yield ${z('RATES') >= 0 ? 'up' : 'down'} ${Math.abs(11 * z('RATES')).toFixed(0)}bp.` });
  if (Math.abs(z('LIQ')) > 1.4) out.push({ turn: t, tone: z('LIQ') < 0 ? 'neg' : 'pos', text: z('LIQ') < 0 ? 'Prime brokers report heavy de-grossing by systematic funds; crowded longs and shorts both moved against holders.' : 'Liquidity provision paid handsomely; dislocated spreads snapped back.' });
  if (Math.abs(z('MOM')) > 1.4) out.push({ turn: t, tone: 'neu', text: z('MOM') > 0 ? 'Trend followers enjoy a strong week as moves extend.' : 'Sharp reversal: last month’s winners sold off hard.' });
  if (z('CREDIT') < -1.4) out.push({ turn: t, tone: 'neg', text: 'High-yield spreads gapped wider; two pending deals face financing questions.' });
  if (z('VOL') > 1.4) out.push({ turn: t, tone: 'neg', text: `Implied volatility jumped; the vol index closed at ${r.indicators.VLX.toFixed(1)}.` });
  if (z('CARRY') < -1.6) out.push({ turn: t, tone: 'neg', text: 'Funding currencies spiked as carry positions were unwound.' });
  // weak, noisy information about the hidden regime
  const reg = s.regime;
  if (reg === 'decay' ? rng.bernoulli(0.45) : rng.bernoulli(0.06)) out.push({ turn: t, tone: 'neg', text: 'Industry chatter: several quant funds quietly report signals "not working as well as backtests suggested".' });
  if (reg === 'unwind' ? rng.bernoulli(0.5) : rng.bernoulli(0.05)) out.push({ turn: t, tone: 'neg', text: 'Rumour: a large multi-manager platform is cutting gross exposure across pods.' });
  if ((reg === 'liquidity' || reg === 'credit') ? rng.bernoulli(0.55) : rng.bernoulli(0.05)) out.push({ turn: t, tone: 'neg', text: 'Repo desks are tightening haircuts on less-liquid collateral.' });
  if (reg === 'rates' ? rng.bernoulli(0.5) : rng.bernoulli(0.06)) out.push({ turn: t, tone: 'neu', text: 'Central-bank speakers sound noticeably more hawkish.' });
  if (r.indicators.FUND > 50) out.push({ turn: t, tone: 'neg', text: `Funding spreads at ${r.indicators.FUND.toFixed(0)}bp: leverage is getting expensive and margins may rise.` });
  for (const e of r.events) if (e.kind === 'terminal') out.push({ turn: t, tone: 'neu', text: e.text });
  return out.slice(0, 6);
}

/** Stop an open-ended session and go to the review (positions stay marked at their last value). */
export function endSession(prev: GameState): GameState {
  return { ...prev, status: 'ended' };
}

// ---------------------------------------------------------------------------
// Persistence

export function serialize(s: GameState): string {
  return JSON.stringify(s);
}

export function deserialize(json: string): GameState {
  const s = JSON.parse(json) as GameState;
  if (!s || typeof s !== 'object' || s.version !== SAVE_VERSION || !s.config || !s.instruments) throw new Error('Save file is from an incompatible version.');
  if (!s.ghosts) s.ghosts = initGhosts(s.navPath, s.config.startNav);
  return s;
}
