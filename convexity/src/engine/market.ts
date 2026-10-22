// Market state, smile/curve definitions and the stochastic dynamics of the simulated world.
//
// Everything that moves is driven by seeded random streams keyed on (seed, day, tick, purpose),
// so the market path is identical for a given seed no matter what the player trades.

import { Rng, cholesky, clamp, hash32, rngFor } from './math';

export const ASSETS = ['ORX', 'NKT', 'AUR', 'EURUSD'] as const;
export type AssetId = (typeof ASSETS)[number];
export const EQUITIES: AssetId[] = ['ORX', 'NKT', 'AUR'];

export const DAY = 1 / 252;
export const TICKS_PER_DAY = 102; // 08:00 → 16:30 in 5-minute steps
export const OVERNIGHT = 0.2; // share of a day's variance that arrives overnight
export const tickTime = (day: number, tick: number) => (day + OVERNIGHT + (1 - OVERNIGHT) * (tick / TICKS_PER_DAY)) * DAY;
export const clockLabel = (tick: number) => {
  const m = 480 + tick * 5;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

export interface AssetSpec {
  id: AssetId;
  name: string;
  long: string;
  ccy: 'USD' | 'EUR';
  kind: 'index' | 'stock' | 'fx';
  spot0: number;
  div: number; // continuous dividend yield (equities)
  baseVol: number; // calm-regime instantaneous vol target
  skew: number; // d(vol)/d(standardised moneyness)
  curv: number; // smile curvature
  volOfVol: number;
  spotVolCorr: number;
  jumpBeta: number;
  spreadBp: number; // half spread on delta-one hedges, bp, calm market
  decimals: number;
}

export const SPECS: Record<AssetId, AssetSpec> = {
  ORX: { id: 'ORX', name: 'ORX', long: 'Orion 500 Index', ccy: 'USD', kind: 'index', spot0: 5200, div: 0.014, baseVol: 0.135, skew: -0.03, curv: 0.006, volOfVol: 1.1, spotVolCorr: -0.75, jumpBeta: 1, spreadBp: 0.8, decimals: 1 },
  NKT: { id: 'NKT', name: 'NKT', long: 'Northkite Systems', ccy: 'USD', kind: 'stock', spot0: 184, div: 0.004, baseVol: 0.29, skew: -0.016, curv: 0.009, volOfVol: 0.9, spotVolCorr: -0.45, jumpBeta: 1.45, spreadBp: 3, decimals: 2 },
  AUR: { id: 'AUR', name: 'AUR', long: 'Aurora Europe 50', ccy: 'EUR', kind: 'index', spot0: 4850, div: 0.028, baseVol: 0.15, skew: -0.028, curv: 0.006, volOfVol: 1.0, spotVolCorr: -0.7, jumpBeta: 0.9, spreadBp: 1.2, decimals: 1 },
  EURUSD: { id: 'EURUSD', name: 'EURUSD', long: 'Euro / US Dollar', ccy: 'USD', kind: 'fx', spot0: 1.085, div: 0, baseVol: 0.072, skew: -0.004, curv: 0.006, volOfVol: 0.6, spotVolCorr: -0.2, jumpBeta: 0.25, spreadBp: 0.4, decimals: 4 },
};

export type RegimeId = 'calm' | 'trending' | 'choppy' | 'stressed' | 'crisis';
export interface RegimeSpec {
  id: RegimeId;
  label: string;
  volMult: number;
  vrp: number; // implied/realised premium (fraction of vol)
  corr: number; // realised equity correlation target
  jumpRate: number; // jumps per year
  liquidity: number; // spread multiplier
  stress: number; // 0..1+ — drives credit, skew, FX/equity correlation
  meanRev: number; // intraday pull to the open
}
export const REGIMES: Record<RegimeId, RegimeSpec> = {
  calm: { id: 'calm', label: 'Calm', volMult: 0.9, vrp: 0.13, corr: 0.42, jumpRate: 0.6, liquidity: 1, stress: 0, meanRev: 0 },
  trending: { id: 'trending', label: 'Trending', volMult: 1.0, vrp: 0.11, corr: 0.5, jumpRate: 0.8, liquidity: 1, stress: 0.1, meanRev: 0 },
  choppy: { id: 'choppy', label: 'Choppy', volMult: 1.2, vrp: 0.12, corr: 0.5, jumpRate: 1.2, liquidity: 1.3, stress: 0.2, meanRev: 2.5 },
  stressed: { id: 'stressed', label: 'Stressed', volMult: 1.7, vrp: 0.16, corr: 0.7, jumpRate: 5, liquidity: 2.4, stress: 0.6, meanRev: 0.5 },
  crisis: { id: 'crisis', label: 'Crisis', volMult: 2.9, vrp: 0.2, corr: 0.88, jumpRate: 16, liquidity: 5, stress: 1.2, meanRev: 0 },
};

export interface SmileParams {
  v: number; // instantaneous vol
  theta: number; // regime target vol
  lr: number; // long-run unconditional vol
  vrp: number;
  skew: number;
  curv: number;
  shift?: number; // parallel vol bump (risk scenarios)
}

export interface Curve {
  b0: number;
  b1: number;
  b2: number;
}

export interface ScheduledEvent {
  id: string;
  kind: EventKind;
  day: number;
  tick: number;
  title: string;
  /** expected absolute move std per affected asset (log-return), priced into implied vol */
  moveStd: Partial<Record<AssetId, number>>;
  status: 'pending' | 'done';
  outcome?: string;
  surprise?: number;
}
export type EventKind = 'fed' | 'cpi' | 'earnings' | 'ecb' | 'payrolls' | 'shock_selloff' | 'shock_single' | 'shock_liquidity' | 'shock_vol_crush' | 'shock_fx';

export interface AssetState {
  spot: number;
  v: number;
  theta: number;
  open: number;
  prevClose: number;
}

export interface MarketState {
  seed: number;
  day: number;
  tick: number;
  t: number;
  assets: Record<AssetId, AssetState>;
  curve: Curve;
  eurRate: number;
  credit: number; // IG credit index spread, bp
  pressure: number; // latent systemic stress (not directly observable)
  corr: number; // realised equity correlation level
  regime: RegimeId;
  regimeDays: number;
  trend: number; // annualised drift of the equity factor in trending regimes
  liqShock: number; // temporary liquidity shock multiplier (decays)
  volShock: number; // temporary additive vol (decays), fraction
  fundingSpread: number; // bank's issuance spread over the curve
  intraday: Record<AssetId, number[]>;
  intradayVol: number[]; // ORX 1M ATM implied, per tick
  closes: { day: number; spot: Record<AssetId, number>; atm: Record<AssetId, number>; r2: number; r10: number; credit: number; corr: number; regime: RegimeId }[];
  events: ScheduledEvent[];
  lastJumpTick: number;
  forced?: { regime?: RegimeId; pressure?: number };
}

export function initialMarket(seed: number, regime: RegimeId = 'calm', pressure = -0.3): MarketState {
  const rng = rngFor(seed, 'init');
  const assets = {} as Record<AssetId, AssetState>;
  const R = REGIMES[regime];
  for (const id of ASSETS) {
    const s = SPECS[id];
    const spot = s.spot0 * Math.exp((s.kind === 'fx' ? 0.01 : 0.03) * rng.normal());
    const v = s.baseVol * R.volMult * Math.exp(0.08 * rng.normal());
    assets[id] = { spot, v, theta: s.baseVol * R.volMult, open: spot, prevClose: spot };
  }
  const m: MarketState = {
    seed,
    day: 0,
    tick: 0,
    t: tickTime(0, 0),
    assets,
    curve: { b0: 0.041 + 0.002 * rng.normal(), b1: 0.004 + 0.002 * rng.normal(), b2: -0.006 },
    eurRate: 0.024,
    credit: 60,
    pressure,
    corr: R.corr,
    regime,
    regimeDays: 0,
    trend: 0,
    liqShock: 1,
    volShock: 0,
    fundingSpread: 0.0085,
    intraday: { ORX: [], NKT: [], AUR: [], EURUSD: [] },
    intradayVol: [],
    closes: [],
    events: [],
    lastJumpTick: -999,
  };
  m.credit = creditTarget(m);
  recordIntraday(m);
  return m;
}

// ---------------------------------------------------------------- curves

const NS_TAU = 2;
export function zeroRate(c: Curve, T: number): number {
  const x = Math.max(T, 1e-6) / NS_TAU;
  const f1 = (1 - Math.exp(-x)) / x;
  const f2 = f1 - Math.exp(-x);
  return c.b0 + c.b1 * f1 + c.b2 * f2;
}
export const df = (c: Curve, T: number) => Math.exp(-zeroRate(c, T) * Math.max(T, 0));
export const shortRate = (c: Curve) => c.b0 + c.b1;
/** Par rate of an annual-fixed swap starting now with tenor T years (single-curve). */
export function parSwapRate(c: Curve, T: number): number {
  let ann = 0;
  const n = Math.round(T);
  for (let i = 1; i <= n; i++) ann += df(c, i);
  return (1 - df(c, n)) / ann;
}

// ---------------------------------------------------------------- smile

export const vrpOf = (r: RegimeId) => REGIMES[r].vrp;

/** ATM implied vol for maturity T (years), ignoring event variance. */
export function atmVol(p: SmileParams, T: number): number {
  const kappa = 25;
  const Tc = Math.max(T, 1 / 365);
  const w = (1 - Math.exp(-kappa * Tc)) / (kappa * Tc);
  const blend = 1 - Math.exp(-Tc / 1.0);
  const thetaEff2 = p.theta * p.theta + (p.lr * p.lr - p.theta * p.theta) * blend;
  const vrp = p.vrp * (0.75 + 0.25 * Math.exp(-Tc / 0.5));
  return Math.sqrt(w * p.v * p.v + (1 - w) * thetaEff2) * (1 + vrp);
}

/** Smile vol at strike K, forward F, maturity T. Standardised moneyness x = ln(K/F)/(σatm√T). */
export function smileVol(p: SmileParams, K: number, F: number, T: number): number {
  const a = atmVol(p, T);
  const Tc = Math.max(T, 1 / 365);
  let x = Math.log(K / F) / (a * Math.sqrt(Tc));
  x = clamp(x, -3.5, 3.5);
  const s = a + p.skew * x + p.curv * x * x + (p.shift ?? 0);
  return Math.max(0.03, s);
}

// ---------------------------------------------------------------- correlation

export function corrMatrix(eqCorr: number, stress: number): number[][] {
  const r = clamp(eqCorr, -0.2, 0.97);
  const fxEq = clamp(0.12 + 0.25 * stress, -0.5, 0.6);
  // order: ORX, NKT, AUR, EURUSD
  return [
    [1, r * 0.95, Math.min(0.96, r + 0.15), fxEq],
    [r * 0.95, 1, r * 0.8, fxEq * 0.7],
    [Math.min(0.96, r + 0.15), r * 0.8, 1, fxEq * 0.4],
    [fxEq, fxEq * 0.7, fxEq * 0.4, 1],
  ];
}
export const IMPLIED_CORR_PREMIUM = 0.06;

// ---------------------------------------------------------------- pricing snapshot

export interface MarketView {
  t: number;
  spot: Record<AssetId, number>;
  smile: Record<AssetId, SmileParams>;
  curve: Curve;
  eurRate: number;
  corr: number[][]; // implied correlation for pricing
  eqCorr: number; // implied equity correlation level (for bump)
  stress: number;
  fundingSpread: number;
  events: { t: number; asset: AssetId; v: number }[]; // scheduled event variance still to come
}

export function smileOf(m: MarketState, id: AssetId): SmileParams {
  const s = SPECS[id];
  const R = REGIMES[m.regime];
  const stress = R.stress + 0.15 * Math.max(0, m.pressure);
  return {
    v: m.assets[id].v + m.volShock * s.baseVol,
    theta: m.assets[id].theta,
    lr: s.baseVol * 1.12,
    vrp: R.vrp,
    skew: s.skew * (1 + 0.55 * stress),
    curv: s.curv * (1 + 0.3 * stress),
  };
}

export function viewOf(m: MarketState): MarketView {
  const spot = {} as Record<AssetId, number>;
  const smile = {} as Record<AssetId, SmileParams>;
  for (const id of ASSETS) {
    spot[id] = m.assets[id].spot;
    smile[id] = smileOf(m, id);
  }
  const stress = REGIMES[m.regime].stress;
  const eqCorr = clamp(m.corr + IMPLIED_CORR_PREMIUM, -0.2, 0.97);
  const events: MarketView['events'] = [];
  for (const e of m.events) {
    if (e.status !== 'pending') continue;
    const te = tickTime(e.day, e.tick);
    if (te <= m.t) continue;
    for (const [a, sd] of Object.entries(e.moveStd)) events.push({ t: te, asset: a as AssetId, v: (sd! * 1.08) ** 2 });
  }
  return { t: m.t, spot, smile, curve: { ...m.curve }, eurRate: m.eurRate, corr: corrMatrix(eqCorr, stress), eqCorr, stress, fundingSpread: m.fundingSpread, events };
}

/** Rate used to grow an asset's forward (domestic minus carry). Returns [r_disc, q_carry] for the asset in its own currency. */
export function carryOf(view: MarketView, id: AssetId, T: number): { r: number; q: number } {
  const s = SPECS[id];
  if (s.kind === 'fx') return { r: zeroRate(view.curve, T), q: view.eurRate };
  const r = s.ccy === 'USD' ? zeroRate(view.curve, T) : view.eurRate;
  return { r, q: s.div };
}
export function forward(view: MarketView, id: AssetId, T: number): number {
  const { r, q } = carryOf(view, id, T);
  return view.spot[id] * Math.exp((r - q) * T);
}
/** Total implied vol at strike K and expiry T (years from view.t), including scheduled event variance. */
export function impliedVol(view: MarketView, id: AssetId, K: number, T: number): number {
  const F = forward(view, id, T);
  const base = smileVol(view.smile[id], K, F, T);
  let extra = 0;
  for (const e of view.events) if (e.asset === id && e.t > view.t && e.t <= view.t + T + 1e-9) extra += e.v;
  if (extra === 0) return base;
  const Tc = Math.max(T, 1 / 365);
  return Math.sqrt(base * base + extra / Tc);
}
export function atmImplied(view: MarketView, id: AssetId, T: number): number {
  return impliedVol(view, id, forward(view, id, T), T);
}

// ---------------------------------------------------------------- dynamics

function creditTarget(m: MarketState): number {
  return 52 * Math.exp(0.32 * m.pressure + 1.05 * REGIMES[m.regime].stress);
}

/** Correlation of the driving Brownians: [ORX, NKT, AUR, FX, b0, b1, eur]. */
function driverCorr(m: MarketState): number[][] {
  const stress = REGIMES[m.regime].stress;
  const c4 = corrMatrix(m.corr, stress);
  const rEq = 0.25 - 0.35 * stress; // rates rally with equities falling in risk-off
  const M: number[][] = Array.from({ length: 7 }, (_, i) => Array.from({ length: 7 }, (_, j) => (i === j ? 1 : 0)));
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) M[i][j] = c4[i][j];
  const setS = (i: number, j: number, v: number) => {
    M[i][j] = v;
    M[j][i] = v;
  };
  setS(0, 4, rEq);
  setS(1, 4, rEq * 0.8);
  setS(2, 4, rEq * 0.7);
  setS(3, 4, -0.25);
  setS(4, 5, -0.3);
  setS(4, 6, 0.55);
  setS(2, 6, rEq * 0.6);
  setS(3, 6, 0.3);
  return M;
}

export function dayDrift(seed: number, day: number): number {
  // a latent "news of the day" shock to the equity factor, as a log-return over the day
  return rngFor(seed, day, 'dayshock').normal();
}

function stepCore(m: MarketState, dt: number, rng: Rng, opts: { dayShockShare: number }) {
  const R = REGIMES[m.regime];
  const L = cholesky(driverCorr(m));
  const z = Array.from({ length: 7 }, () => rng.normal());
  const w = L.map((row) => row.reduce((acc, l, k) => acc + l * z[k], 0));
  const sq = Math.sqrt(dt);
  const r = shortRate(m.curve);
  const dayShock = dayDrift(m.seed, m.day) * 0.35 * SPECS.ORX.baseVol * R.volMult * Math.sqrt(DAY) * opts.dayShockShare;

  // jumps (systemic, negatively skewed)
  let jump = 0;
  if (rng.next() < R.jumpRate * (1 + 0.3 * Math.max(0, m.pressure)) * dt) {
    jump = -0.012 - 0.012 * Math.abs(rng.normal());
    jump *= Math.sqrt(R.volMult);
    m.lastJumpTick = m.day * 1000 + m.tick;
  }

  for (let i = 0; i < ASSETS.length; i++) {
    const id = ASSETS[i];
    const s = SPECS[id];
    const a = m.assets[id];
    const vol = a.v + m.volShock * s.baseVol;
    let mu: number;
    let beta = 0;
    if (s.kind === 'fx') {
      mu = r - m.eurRate;
      beta = -0.15; // risk-off: USD bid
    } else {
      mu = (s.ccy === 'USD' ? r : m.eurRate) - s.div + 0.04 + m.trend * (id === 'NKT' ? 1.3 : 1);
      beta = id === 'NKT' ? 1.3 : id === 'AUR' ? 0.9 : 1;
    }
    const mr = R.meanRev > 0 ? -R.meanRev * Math.log(a.spot / a.open) * dt * 252 * 0.04 : 0;
    const dlog = (mu - 0.5 * vol * vol) * dt + vol * sq * w[i] + beta * dayShock + s.jumpBeta * jump * (s.kind === 'fx' ? -0.6 : 1) + mr;
    a.spot *= Math.exp(dlog);
    // volatility: log-OU with leverage, plus jump feedback
    const zv = s.spotVolCorr * w[i] + Math.sqrt(1 - s.spotVolCorr ** 2) * rng.normal();
    const kappa = 25;
    a.theta += (s.baseVol * R.volMult * (1 + 0.12 * Math.max(0, m.pressure)) - a.theta) * Math.min(1, 60 * dt);
    const lv = Math.log(a.v) + kappa * (Math.log(a.theta) - Math.log(a.v)) * dt + s.volOfVol * sq * zv - (jump !== 0 ? 6 * jump : 0);
    a.v = clamp(Math.exp(lv), s.baseVol * 0.35, s.baseVol * 6);
  }
  // rates
  m.curve.b0 += 0.0065 * sq * w[4] + 0.4 * (0.04 - m.curve.b0) * dt;
  m.curve.b1 += 0.0085 * sq * w[5] + 0.6 * (0.003 - m.curve.b1) * dt - (jump !== 0 ? 0.0015 : 0);
  m.eurRate += 0.005 * sq * w[6] + 0.4 * (0.024 - m.eurRate) * dt;
  // latent stress & correlation
  m.pressure += -1.6 * m.pressure * dt + 1.3 * sq * rng.normal() + (jump !== 0 ? 0.35 : 0);
  m.corr += (R.corr + 0.04 * Math.max(0, m.pressure) - m.corr) * Math.min(1, 35 * dt) + 0.35 * sq * rng.normal() + (jump !== 0 ? 0.04 : 0);
  m.corr = clamp(m.corr, 0.05, 0.93);
  m.credit += (creditTarget(m) - m.credit) * Math.min(1, 40 * dt) + 6 * sq * m.credit * 0.06 * rng.normal() + (jump !== 0 ? 4 : 0);
  m.liqShock = 1 + (m.liqShock - 1) * Math.exp(-80 * dt);
  m.volShock *= Math.exp(-40 * dt);
}

export function recordIntraday(m: MarketState) {
  for (const id of ASSETS) m.intraday[id].push(m.assets[id].spot);
  m.intradayVol.push(atmImplied(viewOf(m), 'ORX', 1 / 12));
}

/** Advance one 5-minute tick within the trading day. */
export function stepTick(m: MarketState) {
  const rng = rngFor(m.seed, m.day, m.tick, 'mkt');
  m.tick += 1;
  m.t = tickTime(m.day, m.tick);
  stepCore(m, ((1 - OVERNIGHT) * DAY) / TICKS_PER_DAY, rng, { dayShockShare: 1 / TICKS_PER_DAY });
  recordIntraday(m);
}

const TRANSITIONS: Record<RegimeId, [RegimeId, number][]> = {
  calm: [['calm', 0.9], ['trending', 0.05], ['choppy', 0.04], ['stressed', 0.012]],
  trending: [['calm', 0.08], ['trending', 0.86], ['choppy', 0.03], ['stressed', 0.025]],
  choppy: [['calm', 0.09], ['trending', 0.04], ['choppy', 0.83], ['stressed', 0.04]],
  stressed: [['calm', 0.04], ['choppy', 0.13], ['stressed', 0.74], ['crisis', 0.06]],
  crisis: [['stressed', 0.24], ['crisis', 0.76]],
};

/** Close the day and roll to the next open (overnight gap + regime transition). */
export function rollDay(m: MarketState) {
  const view = viewOf(m);
  m.closes.push({
    day: m.day,
    spot: Object.fromEntries(ASSETS.map((a) => [a, m.assets[a].spot])) as Record<AssetId, number>,
    atm: Object.fromEntries(ASSETS.map((a) => [a, atmImplied(view, a, 1 / 12)])) as Record<AssetId, number>,
    r2: parSwapRate(m.curve, 2),
    r10: parSwapRate(m.curve, 10),
    credit: m.credit,
    corr: m.corr,
    regime: m.regime,
  });
  if (m.closes.length > 400) m.closes.shift();
  for (const id of ASSETS) m.assets[id].prevClose = m.assets[id].spot;

  m.day += 1;
  m.tick = 0;
  // regime transition (pressure makes stress more likely)
  const rr = rngFor(m.seed, m.day, 'regime');
  const prev = m.regime;
  if (m.forced?.regime) {
    m.regime = m.forced.regime;
  } else {
    const opts = TRANSITIONS[m.regime];
    const boost = Math.exp(0.9 * m.pressure);
    const w = opts.map(([id, p]) => (id === 'stressed' || id === 'crisis') && id !== m.regime ? p * boost : p);
    m.regime = rr.weighted(opts.map((o) => o[0]), w);
  }
  if (m.regime !== prev) {
    m.regimeDays = 0;
    m.trend = m.regime === 'trending' ? (rr.chance(0.55) ? 1 : -1) * rr.range(0.25, 0.5) : 0;
  } else m.regimeDays += 1;

  const rng = rngFor(m.seed, m.day, 'overnight');
  m.t = tickTime(m.day, 0);
  stepCore(m, OVERNIGHT * DAY, rng, { dayShockShare: 0 });
  for (const id of ASSETS) m.assets[id].open = m.assets[id].spot;
  for (const id of ASSETS) m.intraday[id] = [];
  m.intradayVol = [];
  recordIntraday(m);
}

export function seedFrom(text: string | number): number {
  if (typeof text === 'number') return text >>> 0;
  const n = Number(text);
  return Number.isFinite(n) && text.trim() !== '' ? n >>> 0 : hash32(text);
}
