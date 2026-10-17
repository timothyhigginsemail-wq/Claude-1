// Trade archetypes and the instrument model.
//
// Every instrument maps a latent variable
//     X = drift + βᵀZ + √idio · ε
// onto a discrete payoff table through fixed thresholds (a Gaussian copula).
// Thresholds are calibrated so that in the neutral environment (drift = 0,
// Z ~ N(0, C_neutral)) the outcome probabilities equal the template's base
// probabilities. Regimes then move the probabilities *mathematically*, by
// shifting the mean and variance of βᵀZ, and shared factor loadings create
// genuine joint dependence between trades.

import { FACTORS, NEUTRAL_CORR, bucketProbs, type FactorId, type RegimePair } from './market';
import { normCdf, normInv, quadForm } from './math';
import type { Rng } from './rng';

export type Archetype =
  | 'statarb' | 'factor' | 'trend' | 'carry' | 'longvol' | 'shortvol' | 'merger'
  | 'relval' | 'tailhedge' | 'macro' | 'event' | 'pod' | 'future';

export const ARCHETYPE_INFO: Record<Archetype, { name: string; color: string; short: string }> = {
  statarb: { name: 'Stat-arb mean reversion', short: 'STAT ARB', color: 'var(--c1)' },
  factor: { name: 'Equity factor', short: 'FACTOR', color: 'var(--c3)' },
  trend: { name: 'Momentum / trend', short: 'TREND', color: 'var(--c7)' },
  carry: { name: 'Carry', short: 'CARRY', color: 'var(--c4)' },
  longvol: { name: 'Long volatility', short: 'LONG VOL', color: 'var(--c5)' },
  shortvol: { name: 'Short volatility', short: 'SHORT VOL', color: 'var(--c5)' },
  merger: { name: 'Merger arbitrage', short: 'MERGER ARB', color: 'var(--c2)' },
  relval: { name: 'Relative value', short: 'REL VALUE', color: 'var(--c6)' },
  tailhedge: { name: 'Tail-risk hedge', short: 'TAIL HEDGE', color: 'var(--c8)' },
  macro: { name: 'Cross-asset macro', short: 'MACRO', color: 'var(--c7)' },
  event: { name: 'Event-driven bet', short: 'EVENT', color: 'var(--c2)' },
  pod: { name: 'Strategy pod', short: 'POD', color: 'var(--c1)' },
  future: { name: 'Index future', short: 'FUTURE', color: 'var(--c6)' },
};

export interface Outcome {
  label: string;
  /** Return per $1 of gross notional over one turn. */
  r: number;
  /** If drawn, the trade resolves and the position is closed. */
  terminal?: boolean;
}

export type Quality = 'good' | 'mediocre' | 'trap' | 'hedge';

/** Everything the player (and the desk's risk model) is allowed to see. */
export interface InstrumentPublic {
  id: string;
  archetype: Archetype;
  name: string;
  ticker: string;
  thesis: string;
  notes: string[];
  outcomes: Outcome[];
  /** Latent thresholds (public: they define how estimates map to probabilities). */
  thresholds: number[];
  /** Desk's estimate of the latent drift (edge). */
  estDrift: number;
  /** Stated standard error of that estimate. */
  statedSe: number;
  /** Stated standard error at creation (before live learning). */
  se0: number;
  /** Desk's estimated factor loadings. */
  betaEst: number[];
  idioEst: number;
  createdTurn: number;
  /** Turn after which the instrument stops existing (positions auto-close). */
  expiresTurn: number;
  /** Last turn at which new money can be put to work. */
  offerUntil: number;
  margin: number;
  tcBps: number;
  finBps: number;
  capacity: number;
  netFraction: number;
  allowShort: boolean;
  /** Hard max |notional| as a fraction of NAV (concentration limit). */
  maxPctNav: number;
  research: { signal: boolean; risk: boolean };
  researchCost: { signal: number; risk: number };
  /** Track record (pods): weekly returns before the game started. */
  track?: number[];
  manager?: string;
  alive: boolean;
  /** Group tag for scripted sets (e.g. the "ten strategies" experiment). */
  group?: string;
}

/** Hidden data-generating process. Never shown to the player during a campaign. */
export interface InstrumentTruth {
  id: string;
  drift0: number;
  decay: number;
  beta: number[];
  idio: number;
  /** Desk estimation error at creation (in latent units). */
  err0: number;
  /** Research multiplies the persistent error by this factor (1 = no research). */
  errScale: number;
  /** Noise introduced by the research itself. */
  resNoise: number;
  quality: Quality;
}

export const LEARN_SHRINK = 0.88;
/** Template capacities are quoted for a large fund; scale them to the game's $1M starting book. */
export const CAPACITY_SCALE = 0.05;

export function trueDrift(t: InstrumentTruth, pub: InstrumentPublic, turn: number): number {
  return t.drift0 * Math.exp(-t.decay * Math.max(0, turn - pub.createdTurn));
}

/** Calibrate latent thresholds from base probabilities under unit variance. */
export function thresholdsFromProbs(p: readonly number[]): number[] {
  const out: number[] = [];
  let c = 0;
  for (let k = 0; k < p.length - 1; k++) {
    c += p[k];
    out.push(normInv(Math.min(1 - 1e-12, Math.max(1e-12, c))));
  }
  return out;
}

export function bucketOf(x: number, thresholds: readonly number[]): number {
  let k = 0;
  while (k < thresholds.length && x >= thresholds[k]) k++;
  return k;
}

export function idioFor(beta: readonly number[]): number {
  return Math.max(0.05, 1 - quadForm(beta, NEUTRAL_CORR));
}

/** Rescale loadings so their systematic variance under the neutral regime is at most `cap`. */
export function capBeta(beta: number[], cap = 0.92): number[] {
  const v = quadForm(beta, NEUTRAL_CORR);
  return v > cap ? beta.map((b) => b * Math.sqrt(cap / v)) : beta;
}

export function fvec(p: Partial<Record<FactorId, number>>): number[] {
  return FACTORS.map((f) => p[f] ?? 0);
}

/** Probabilities of each outcome given a drift and a regime distribution. */
export function outcomeProbs(
  pub: Pick<InstrumentPublic, 'thresholds'>,
  drift: number,
  beta: readonly number[],
  idio: number,
  pairs: readonly RegimePair[],
): number[] {
  return bucketProbs(pub.thresholds, drift, beta, idio, pairs);
}

export function evOf(outcomes: readonly Outcome[], probs: readonly number[]): number {
  return outcomes.reduce((s, o, k) => s + o.r * probs[k], 0);
}

export function sdOf(outcomes: readonly Outcome[], probs: readonly number[]): number {
  const m = evOf(outcomes, probs);
  return Math.sqrt(outcomes.reduce((s, o, k) => s + probs[k] * (o.r - m) ** 2, 0));
}

export function winProb(outcomes: readonly Outcome[], probs: readonly number[]): number {
  return outcomes.reduce((s, o, k) => s + (o.r > 0 ? probs[k] : 0), 0);
}

// ---------------------------------------------------------------------------
// Templates

export interface Template {
  archetype: Archetype;
  names: string[];
  thesis: (name: string) => string;
  notes: string[];
  outcomes: Outcome[];
  probs: number[];
  beta: Partial<Record<FactorId, number>>;
  /** Hidden loadings the desk tends to miss (added to truth only). */
  hiddenBeta?: Partial<Record<FactorId, number>>;
  life: [number, number];
  margin: number;
  tcBps: number;
  finBps: number;
  capacity: number;
  netFraction: number;
  allowShort?: boolean;
  maxPctNav: number;
  /** Target weekly Sharpe ranges for each quality class. */
  sharpe: Record<Exclude<Quality, 'hedge'>, [number, number]>;
}

const T: Record<string, Template> = {
  statarb: {
    archetype: 'statarb',
    names: ['Regional bank pair', 'Semis basket vs SOX', 'Dual-listed share line', 'Oil majors spread', 'Utilities cointegration basket', 'Rail duopoly pair', 'Payments pair'],
    thesis: (n) => `${n}: the spread is 2.4σ wide versus its 90-day cointegration relationship. Historically such gaps close within weeks — unless the relationship has broken.`,
    notes: ['Market-neutral: long cheap leg, short rich leg', 'Edge comes from liquidity provision to forced sellers', 'Convergence closes the trade early'],
    outcomes: [
      { label: 'Spread blows out', r: -0.065 },
      { label: 'Spread widens', r: -0.022 },
      { label: 'Flat', r: 0.001 },
      { label: 'Partial convergence', r: 0.016 },
      { label: 'Full convergence', r: 0.032, terminal: true },
    ],
    probs: [0.04, 0.26, 0.22, 0.3, 0.18],
    beta: { LIQ: 0.45, MOM: -0.3 },
    life: [5, 8], margin: 0.15, tcBps: 4, finBps: 0.8, capacity: 60e6, netFraction: 0, maxPctNav: 4,
    sharpe: { good: [0.17, 0.27], mediocre: [0.03, 0.08], trap: [-0.08, 0.0] },
  },
  factor_value: {
    archetype: 'factor',
    names: ['Global value L/S', 'Deep-value composite', 'Book-to-price sleeve'],
    thesis: (n) => `${n}: value spreads sit in the 85th percentile; cheap stocks look historically cheap relative to expensive ones.`,
    notes: ['Dollar-neutral long/short equity', 'Slow-moving; can underperform for long stretches', 'Shares holdings with other quant funds'],
    outcomes: [
      { label: 'Factor crash', r: -0.04 },
      { label: 'Underperforms', r: -0.012 },
      { label: 'Flat', r: 0.003 },
      { label: 'Outperforms', r: 0.014 },
      { label: 'Strong rally', r: 0.032 },
    ],
    probs: [0.05, 0.31, 0.28, 0.26, 0.1],
    beta: { VALUE: 0.65, LIQ: 0.2 },
    life: [6, 10], margin: 0.2, tcBps: 5, finBps: 0.6, capacity: 120e6, netFraction: 0, maxPctNav: 4,
    sharpe: { good: [0.12, 0.2], mediocre: [0.02, 0.06], trap: [-0.06, 0.0] },
  },
  factor_mom: {
    archetype: 'factor',
    names: ['Equity momentum L/S', '12-1 momentum sleeve', 'Industry momentum'],
    thesis: (n) => `${n}: dispersion is high and recent winners have strong earnings revisions. Momentum tends to persist — until it reverses violently.`,
    notes: ['Dollar-neutral long/short equity', 'Vulnerable to sharp reversals after drawdowns', 'Popular, crowded factor'],
    outcomes: [
      { label: 'Momentum crash', r: -0.05 },
      { label: 'Underperforms', r: -0.013 },
      { label: 'Flat', r: 0.003 },
      { label: 'Outperforms', r: 0.015 },
      { label: 'Strong trend', r: 0.03 },
    ],
    probs: [0.05, 0.3, 0.27, 0.27, 0.11],
    beta: { MOM: 0.7, LIQ: 0.15 },
    life: [6, 10], margin: 0.2, tcBps: 6, finBps: 0.6, capacity: 100e6, netFraction: 0, maxPctNav: 4,
    sharpe: { good: [0.12, 0.2], mediocre: [0.02, 0.06], trap: [-0.06, 0.0] },
  },
  factor_quality: {
    archetype: 'factor',
    names: ['Quality minus junk', 'Profitability tilt L/S'],
    thesis: (n) => `${n}: high-margin, low-leverage firms trade at only a modest premium. Defensive and historically resilient in drawdowns.`,
    notes: ['Defensive factor: tends to hold up when equities fall', 'Modest, steady alpha'],
    outcomes: [
      { label: 'Junk rally', r: -0.025 },
      { label: 'Underperforms', r: -0.008 },
      { label: 'Flat', r: 0.002 },
      { label: 'Outperforms', r: 0.01 },
      { label: 'Flight to quality', r: 0.026 },
    ],
    probs: [0.06, 0.3, 0.28, 0.27, 0.09],
    beta: { EQ: -0.2, VALUE: -0.2, VOL: 0.15, LIQ: 0.1 },
    life: [6, 10], margin: 0.2, tcBps: 5, finBps: 0.6, capacity: 120e6, netFraction: 0, maxPctNav: 4,
    sharpe: { good: [0.1, 0.17], mediocre: [0.02, 0.06], trap: [-0.05, 0.0] },
  },
  factor_rev: {
    archetype: 'factor',
    names: ['Short-term reversal', 'Intraday liquidity reversal', '5-day reversal basket'],
    thesis: (n) => `${n}: last week's losers bounce as liquidity providers are paid to absorb flows. High turnover, high capacity sensitivity.`,
    notes: ['High turnover: costs matter', 'Earns a liquidity premium — which vanishes when everyone needs liquidity at once'],
    outcomes: [
      { label: 'Liquidity vacuum', r: -0.05 },
      { label: 'Losers keep losing', r: -0.015 },
      { label: 'Flat', r: 0.002 },
      { label: 'Bounce', r: 0.014 },
      { label: 'Sharp reversal', r: 0.027 },
    ],
    probs: [0.04, 0.28, 0.24, 0.32, 0.12],
    beta: { MOM: -0.4, LIQ: 0.5 },
    life: [3, 6], margin: 0.2, tcBps: 9, finBps: 0.6, capacity: 40e6, netFraction: 0, maxPctNav: 4,
    sharpe: { good: [0.15, 0.24], mediocre: [0.03, 0.07], trap: [-0.07, 0.0] },
  },
  trend: {
    archetype: 'trend',
    names: ['Bund futures breakout', 'Copper trend', 'Yen trend follower', 'Gold breakout', 'Crude oil trend', 'Equity index trend'],
    thesis: (n) => `${n}: price has broken a 6-month range on rising volume. Most breakouts fail, but the ones that work run far.`,
    notes: ['Low hit rate, positively skewed payoff', 'Loses small and often in choppy markets', 'Directional futures exposure'],
    outcomes: [
      { label: 'Whipsaw', r: -0.02 },
      { label: 'Fades', r: -0.008 },
      { label: 'Grinds', r: 0.008 },
      { label: 'Trend runs', r: 0.035 },
      { label: 'Big trend', r: 0.085 },
    ],
    probs: [0.38, 0.23, 0.2, 0.14, 0.05],
    beta: { MOM: 0.7, VOL: 0.1 },
    life: [6, 12], margin: 0.08, tcBps: 2, finBps: 0.2, capacity: 300e6, netFraction: 1, maxPctNav: 4,
    sharpe: { good: [0.1, 0.18], mediocre: [0.02, 0.05], trap: [-0.05, 0.0] },
  },
  carry: {
    archetype: 'carry',
    names: ['MXN/JPY carry', 'BRL/CHF carry', 'EM high-yielder basket', 'TRY/EUR carry', 'Commodity-FX carry'],
    thesis: (n) => `${n}: a ~9% annualised rate differential pays you every week the exchange rate holds still. "Picking up nickels" — mind the steamroller.`,
    notes: ['High win rate, small gains', 'Rare, large losses when risk appetite collapses', 'Margin is low, which makes it tempting to lever'],
    outcomes: [
      { label: 'Carry crash', r: -0.2 },
      { label: 'Currency sells off', r: -0.035 },
      { label: 'Flat', r: 0.003 },
      { label: 'Carry earned', r: 0.0085 },
    ],
    probs: [0.018, 0.08, 0.28, 0.622],
    beta: { CARRY: 0.65, EQ: 0.1 },
    hiddenBeta: { VOL: -0.2, LIQ: 0.15 },
    life: [8, 14], margin: 0.05, tcBps: 1.5, finBps: 0.2, capacity: 400e6, netFraction: 1, maxPctNav: 5,
    sharpe: { good: [0.12, 0.18], mediocre: [0.04, 0.08], trap: [-0.04, 0.02] },
  },
  longvol: {
    archetype: 'longvol',
    names: ['Index straddle (3M)', 'VIX call spread', 'Single-stock vol dispersion (long)'],
    thesis: (n) => `${n}: implied vol is near its 1-year low. You pay theta every week for convex upside if realised volatility jumps.`,
    notes: ['Loses steadily when nothing happens', 'Convex: large payoffs in volatility spikes', 'Maximum loss per turn is bounded'],
    outcomes: [
      { label: 'Theta bleed', r: -0.028 },
      { label: 'Small loss', r: -0.01 },
      { label: 'Vol pops', r: 0.03 },
      { label: 'Vol spike', r: 0.12 },
      { label: 'Vol explosion', r: 0.32 },
    ],
    probs: [0.55, 0.2, 0.15, 0.07, 0.03],
    beta: { VOL: 0.75, EQ: -0.2 },
    life: [4, 8], margin: 1, tcBps: 15, finBps: 0, capacity: 30e6, netFraction: 0, maxPctNav: 1,
    sharpe: { good: [0.06, 0.12], mediocre: [0.0, 0.04], trap: [-0.08, -0.02] },
  },
  shortvol: {
    archetype: 'shortvol',
    names: ['Short index variance', 'Put-write program', 'Short VIX futures roll'],
    thesis: (n) => `${n}: implied volatility trades ~4 points over realised. Sell insurance, collect the premium. Historically a 90%+ weekly win rate.`,
    notes: ['Looks like a very high Sharpe strategy in calm periods', 'Payoff is concave: loses big when vol spikes', 'Tail loss is the business model'],
    outcomes: [
      { label: 'Volmageddon', r: -0.3 },
      { label: 'Vol spike', r: -0.1 },
      { label: 'Vol up', r: -0.02 },
      { label: 'Premium decays', r: 0.008 },
      { label: 'Full theta', r: 0.016 },
    ],
    probs: [0.015, 0.04, 0.1, 0.4, 0.445],
    beta: { VOL: -0.6, EQ: 0.15 },
    hiddenBeta: { LIQ: 0.2, VOL: -0.15 },
    life: [6, 12], margin: 0.25, tcBps: 6, finBps: 0, capacity: 80e6, netFraction: 0, maxPctNav: 2,
    sharpe: { good: [0.08, 0.14], mediocre: [0.02, 0.06], trap: [-0.05, 0.01] },
  },
  merger: {
    archetype: 'merger',
    names: ['Pharma takeover (cash)', 'Chipmaker stock deal', 'Telecom merger', 'Regional bank deal', 'Software LBO'],
    thesis: (n) => `${n}: the target trades 6% below the offer price. If the deal closes you earn the spread; if regulators or financing kill it, the target falls back toward its undisturbed price.`,
    notes: ['Modest upside, large downside on a deal break', 'Breaks cluster when credit tightens', 'Deal close or break ends the trade'],
    outcomes: [
      { label: 'Deal breaks', r: -0.22, terminal: true },
      { label: 'Spread widens', r: -0.015 },
      { label: 'Accrual', r: 0.004 },
      { label: 'Deal closes', r: 0.05, terminal: true },
    ],
    probs: [0.035, 0.17, 0.64, 0.155],
    beta: { CREDIT: 0.35, EQ: 0.15, LIQ: 0.15 },
    life: [6, 12], margin: 0.3, tcBps: 6, finBps: 0.8, capacity: 50e6, netFraction: 0.3, maxPctNav: 1.5,
    sharpe: { good: [0.1, 0.16], mediocre: [0.02, 0.05], trap: [-0.06, 0.0] },
  },
  relval: {
    archetype: 'relval',
    names: ['On/off-the-run Treasury', 'Swap-spread basis', 'Cash-futures basis', 'Convertible arb book', 'Covered-bond vs swap'],
    thesis: (n) => `${n}: two near-identical claims trade 6bp apart. Convergence is almost certain at maturity — the question is whether you can hold on until then.`,
    notes: ['Tiny returns per $; requires leverage to matter', 'Margin is low but haircuts jump in a liquidity crisis', 'Classic LTCM-style trade'],
    outcomes: [
      { label: 'Dislocation', r: -0.035 },
      { label: 'Basis widens', r: -0.006 },
      { label: 'Carry', r: 0.0015 },
      { label: 'Converges', r: 0.004 },
    ],
    probs: [0.025, 0.17, 0.55, 0.255],
    beta: { LIQ: 0.5, CREDIT: 0.2 },
    hiddenBeta: { LIQ: 0.15 },
    life: [8, 14], margin: 0.03, tcBps: 0.8, finBps: 0.6, capacity: 800e6, netFraction: 0, maxPctNav: 12,
    sharpe: { good: [0.14, 0.22], mediocre: [0.03, 0.08], trap: [-0.05, 0.01] },
  },
  tailhedge: {
    archetype: 'tailhedge',
    names: ['OTM index put ladder', 'CDX payer swaptions', 'Crash put spread'],
    thesis: (n) => `${n}: insurance against a crisis. Expect to lose a little most weeks; in a crash it can pay many times its cost — precisely when the rest of the book is losing.`,
    notes: ['Negative expected return in normal markets', 'Strong negative correlation to the book in stress', 'Value lies in what it does to portfolio growth, not standalone'],
    outcomes: [
      { label: 'Decays', r: -0.012 },
      { label: 'Small loss', r: -0.005 },
      { label: 'Pays a little', r: 0.03 },
      { label: 'Pays off', r: 0.16 },
      { label: 'Crisis payoff', r: 0.45 },
    ],
    probs: [0.72, 0.13, 0.08, 0.05, 0.02],
    beta: { VOL: 0.5, EQ: -0.35, CREDIT: -0.25, LIQ: -0.25 },
    life: [6, 10], margin: 1, tcBps: 12, finBps: 0, capacity: 40e6, netFraction: 0, maxPctNav: 0.5,
    sharpe: { good: [0.0, 0.03], mediocre: [-0.05, -0.01], trap: [-0.1, -0.06] },
  },
  macro_rates: {
    archetype: 'macro',
    names: ['Short 10Y Treasury futures', '2s10s steepener', 'Short Bund futures'],
    thesis: (n) => `${n}: inflation prints keep surprising upward while the curve prices cuts. Positioned for higher yields.`,
    notes: ['Directional rates exposure', 'Payoff roughly symmetric'],
    outcomes: [
      { label: 'Bond rally', r: -0.045 },
      { label: 'Yields drift lower', r: -0.015 },
      { label: 'Range', r: 0.002 },
      { label: 'Yields rise', r: 0.017 },
      { label: 'Yields gap higher', r: 0.045 },
    ],
    probs: [0.07, 0.26, 0.3, 0.26, 0.11],
    beta: { RATES: 0.75 },
    life: [4, 10], margin: 0.06, tcBps: 1, finBps: 0.1, capacity: 500e6, netFraction: 1, allowShort: true, maxPctNav: 6,
    sharpe: { good: [0.08, 0.14], mediocre: [0.01, 0.04], trap: [-0.05, 0.0] },
  },
  macro_cmd: {
    archetype: 'macro',
    names: ['Long copper vs gold', 'Long crude calendar spread', 'Long ags basket'],
    thesis: (n) => `${n}: inventories are drawing faster than seasonal norms and positioning is light.`,
    notes: ['Commodity exposure with a risk-on tilt'],
    outcomes: [
      { label: 'Supply glut', r: -0.06 },
      { label: 'Drifts lower', r: -0.02 },
      { label: 'Range', r: 0.003 },
      { label: 'Rallies', r: 0.022 },
      { label: 'Squeeze', r: 0.06 },
    ],
    probs: [0.07, 0.26, 0.29, 0.27, 0.11],
    beta: { COMMOD: 0.7, EQ: 0.15 },
    life: [4, 10], margin: 0.1, tcBps: 2, finBps: 0.2, capacity: 300e6, netFraction: 1, allowShort: true, maxPctNav: 4,
    sharpe: { good: [0.08, 0.14], mediocre: [0.01, 0.04], trap: [-0.05, 0.0] },
  },
  macro_credit: {
    archetype: 'macro',
    names: ['Long HY credit index', 'Long EM sovereign basket', 'Long CLO mezzanine'],
    thesis: (n) => `${n}: spreads look wide relative to default expectations; you are paid to bear credit risk.`,
    notes: ['Long credit risk: steady carry, gaps lower in stress', 'Highly correlated with carry and merger arb in a crisis'],
    outcomes: [
      { label: 'Spreads gap wider', r: -0.07 },
      { label: 'Widens', r: -0.012 },
      { label: 'Carry', r: 0.003 },
      { label: 'Tightens', r: 0.011 },
    ],
    probs: [0.03, 0.2, 0.42, 0.35],
    beta: { CREDIT: 0.7, EQ: 0.15 },
    hiddenBeta: { LIQ: 0.15 },
    life: [6, 12], margin: 0.1, tcBps: 3, finBps: 0.4, capacity: 200e6, netFraction: 1, maxPctNav: 4,
    sharpe: { good: [0.1, 0.16], mediocre: [0.02, 0.06], trap: [-0.04, 0.01] },
  },
};

// Level-1 single-period bets: simple, clean payoff tables.
const EVENT_TEMPLATES: Template[] = [
  {
    archetype: 'event', names: ['Earnings drift: mid-cap retailer', 'Earnings drift: software name'],
    thesis: (n) => `${n}: post-earnings announcement drift. The stock either continues its move or gives it back over the week.`,
    notes: ['One-week holding period', 'Two outcomes, roughly symmetric payoff'],
    outcomes: [{ label: 'Gives it back', r: -0.1 }, { label: 'Drift continues', r: 0.1 }],
    probs: [0.5, 0.5], beta: { EQ: 0.3, MOM: 0.3 }, life: [1, 1], margin: 1, tcBps: 8, finBps: 0, capacity: 30e6, netFraction: 1, maxPctNav: 1.5,
    sharpe: { good: [0.08, 0.14], mediocre: [0.0, 0.04], trap: [-0.06, -0.02] },
  },
  {
    archetype: 'event', names: ['Biotech binary: Phase III readout', 'FDA panel pair trade'],
    thesis: (n) => `${n}: a binary clinical event. A win triples the move of a loss — but wins are rarer.`,
    notes: ['Large asymmetric payoff', 'Mostly idiosyncratic risk'],
    outcomes: [{ label: 'Trial fails', r: -0.12 }, { label: 'Muted', r: -0.02 }, { label: 'Approval', r: 0.36 }],
    probs: [0.55, 0.2, 0.25], beta: { EQ: 0.1 }, life: [1, 1], margin: 1, tcBps: 15, finBps: 0, capacity: 15e6, netFraction: 1, maxPctNav: 1,
    sharpe: { good: [0.1, 0.16], mediocre: [0.0, 0.05], trap: [-0.08, -0.02] },
  },
  {
    archetype: 'event', names: ['Index inclusion front-run', 'Rebalance flow trade'],
    thesis: (n) => `${n}: forced index buyers must transact at the close. Usually a small, reliable gain — occasionally the trade is too crowded and reverses hard.`,
    notes: ['High win probability, small gain', 'Crowding risk produces a fat left tail'],
    outcomes: [{ label: 'Crowded reversal', r: -0.3 }, { label: 'Flat', r: -0.01 }, { label: 'Flow arrives', r: 0.05 }],
    probs: [0.07, 0.2, 0.73], beta: { LIQ: 0.4 }, life: [1, 1], margin: 1, tcBps: 6, finBps: 0, capacity: 40e6, netFraction: 1, maxPctNav: 1.5,
    sharpe: { good: [0.08, 0.14], mediocre: [0.0, 0.04], trap: [-0.06, -0.01] },
  },
  {
    archetype: 'event', names: ['Coin-flip spread: 55/45', 'Calibrated signal test'],
    thesis: (n) => `${n}: a clean, even-money bet from a well-calibrated signal. The cleanest possible test of sizing.`,
    notes: ['Win and loss are the same size', 'Edge is small but well measured'],
    outcomes: [{ label: 'Loses', r: -0.2 }, { label: 'Wins', r: 0.2 }],
    probs: [0.5, 0.5], beta: {}, life: [1, 1], margin: 1, tcBps: 2, finBps: 0, capacity: 100e6, netFraction: 1, maxPctNav: 1.5,
    sharpe: { good: [0.08, 0.12], mediocre: [0.03, 0.06], trap: [-0.04, 0.0] },
  },
  {
    archetype: 'event', names: ['Lottery ticket: deep OTM call', 'Takeover rumour calls'],
    thesis: (n) => `${n}: you lose your stake most of the time; occasionally it pays 8×. Positive EV on paper — but how much would you put on a ticket?`,
    notes: ['Low probability, huge payoff', 'Kelly fraction is small even with a large edge'],
    outcomes: [{ label: 'Expires worthless', r: -1 }, { label: 'Partial', r: 0.5 }, { label: 'Hits', r: 8 }],
    probs: [0.86, 0.04, 0.1], beta: { EQ: 0.15, VOL: 0.1 }, life: [1, 1], margin: 1, tcBps: 40, finBps: 0, capacity: 5e6, netFraction: 1, maxPctNav: 0.3,
    sharpe: { good: [0.06, 0.1], mediocre: [0.0, 0.03], trap: [-0.06, -0.02] },
  },
];

/** Probabilities under the neutral calibration distribution (Var X = 1, mean = drift). */
export function neutralProbs(thresholds: readonly number[], drift: number): number[] {
  // X ~ N(drift, 1) exactly by construction of idio.
  const K = thresholds.length + 1;
  const out: number[] = [];
  let prev = 0;
  for (let k = 0; k < K; k++) {
    const c = k < K - 1 ? normCdf(thresholds[k] - drift) : 1;
    out.push(c - prev);
    prev = c;
  }
  return out;
}

/** Find the drift that gives a target neutral EV/SD (weekly Sharpe). */
export function driftForSharpe(outcomes: readonly Outcome[], thresholds: readonly number[], target: number): number {
  const sharpeAt = (d: number) => {
    const p = neutralProbs(thresholds, d);
    const sd = sdOf(outcomes, p);
    return sd > 0 ? evOf(outcomes, p) / sd : 0;
  };
  let lo = -2;
  let hi = 2;
  for (let i = 0; i < 70; i++) {
    const m = (lo + hi) / 2;
    if (sharpeAt(m) < target) lo = m;
    else hi = m;
  }
  return (lo + hi) / 2;
}

/** Find the drift that gives a target neutral EV. */
export function driftForEv(outcomes: readonly Outcome[], thresholds: readonly number[], targetEv: number): number {
  let lo = -3;
  let hi = 3;
  for (let i = 0; i < 70; i++) {
    const m = (lo + hi) / 2;
    if (evOf(outcomes, neutralProbs(thresholds, m)) < targetEv) lo = m;
    else hi = m;
  }
  return (lo + hi) / 2;
}

/** Slope dEV/dDrift around a drift (used to convert EV uncertainty to drift uncertainty). */
export function evSlope(outcomes: readonly Outcome[], thresholds: readonly number[], d: number): number {
  const h = 1e-3;
  return (evOf(outcomes, neutralProbs(thresholds, d + h)) - evOf(outcomes, neutralProbs(thresholds, d - h))) / (2 * h);
}

export interface Built {
  pub: InstrumentPublic;
  truth: InstrumentTruth;
}

export interface BuildOpts {
  turn: number;
  quality: Quality;
  scale?: number;
  lifeOverride?: number;
  idSuffix?: string;
  name?: string;
  group?: string;
  /** Extra hidden beta to inject (e.g. a shared crowding factor). */
  hidden?: Partial<Record<FactorId, number>>;
  /** Override the loadings the desk reports. */
  betaEstOverride?: Partial<Record<FactorId, number>>;
  offerFor?: number;
  /** Multiplier on the template's Sharpe ranges. */
  sharpeScale?: number;
  /** Deterministic slot used for the id (keeps ids reproducible across games). */
  slot?: string | number;
}

let uid = 0;
export function resetUid(n = 0) {
  uid = n;
}

function tickerFrom(name: string, rng: Rng): string {
  const letters = name.replace(/[^A-Za-z]/g, '').toUpperCase();
  return (letters.slice(0, 3) || 'TRD') + '-' + rng.int(10, 99);
}

export function buildFromTemplate(rng: Rng, tpl: Template, o: BuildOpts): Built {
  const scale = o.scale ?? 1;
  const outcomes = tpl.outcomes.map((x) => ({ ...x, r: Math.max(-1, x.r * scale * rng.uniform(0.85, 1.15)) }));
  // probabilities jitter a little so instances differ
  const jp = tpl.probs.map((p) => p * rng.uniform(0.85, 1.15));
  const tot = jp.reduce((a, b) => a + b, 0);
  const probs = jp.map((p) => p / tot);
  const thresholds = thresholdsFromProbs(probs);

  const betaPublicRaw = fvec(tpl.beta).map((b) => b * rng.uniform(0.8, 1.2));
  const hidden = fvec({ ...(tpl.hiddenBeta ?? {}) });
  const extra = fvec(o.hidden ?? {});
  const betaTrue = capBeta(betaPublicRaw.map((b, i) => b + hidden[i] + extra[i]));
  let betaEst = o.betaEstOverride ? fvec(o.betaEstOverride) : betaPublicRaw.map((b) => b + rng.normal() * 0.05);
  betaEst = capBeta(betaEst);
  const idio = idioFor(betaTrue);
  const idioEst = idioFor(betaEst);

  const quality = o.quality;
  const sh = quality === 'hedge' ? tpl.sharpe.good : tpl.sharpe[quality];
  const targetSharpe = rng.uniform(sh[0], sh[1]) * (o.sharpeScale ?? 1);
  const drift0 = driftForSharpe(outcomes, thresholds, targetSharpe);

  // Desk estimation error (latent units). Traps are systematically overstated
  // and quoted with an overconfident standard error.
  const seTrue = quality === 'trap' ? 0.12 : rng.uniform(0.08, 0.16);
  const bias = (quality === 'trap' ? rng.uniform(0.14, 0.24) : quality === 'mediocre' ? 0.04 : 0) * Math.sqrt(o.sharpeScale ?? 1);
  const err0 = bias + seTrue * rng.normal();
  const statedSe = quality === 'trap' ? seTrue * 0.6 : seTrue;

  const life = o.lifeOverride ?? rng.int(tpl.life[0], tpl.life[1]);
  const name = o.name ?? rng.pick(tpl.names);
  const id = `${tpl.archetype}-${o.turn}-${o.slot ?? 'u' + uid++}${o.idSuffix ?? ''}`;
  const pub: InstrumentPublic = {
    id,
    archetype: tpl.archetype,
    name,
    ticker: tickerFrom(name, rng),
    thesis: tpl.thesis(name),
    notes: tpl.notes,
    outcomes,
    thresholds,
    estDrift: drift0 + err0,
    statedSe,
    se0: statedSe,
    betaEst,
    idioEst,
    createdTurn: o.turn,
    expiresTurn: o.turn + life - 1,
    offerUntil: o.turn + (o.offerFor ?? 1) - 1,
    margin: tpl.margin,
    tcBps: tpl.tcBps,
    finBps: tpl.finBps,
    capacity: tpl.capacity * CAPACITY_SCALE * rng.uniform(0.6, 1.4),
    netFraction: tpl.netFraction,
    allowShort: !!tpl.allowShort,
    maxPctNav: tpl.maxPctNav,
    research: { signal: false, risk: false },
    researchCost: { signal: 0.0012, risk: 0.0006 },
    alive: true,
    group: o.group,
  };
  const truth: InstrumentTruth = {
    id,
    drift0,
    decay: quality === 'trap' ? rng.uniform(0.04, 0.12) : rng.uniform(0.0, 0.05),
    beta: betaTrue,
    idio,
    err0,
    errScale: 1,
    resNoise: 0,
    quality,
  };
  return { pub, truth };
}

export const TEMPLATE_KEYS = Object.keys(T);
export function template(key: string): Template {
  return T[key];
}
export const EVENT_TEMPLATE_LIST = EVENT_TEMPLATES;

// ---------------------------------------------------------------------------
// Permanent hedging instruments

export function buildFuture(_rng: Rng, turn: number, kind: 'EQ' | 'RATES'): Built {
  const sym = [-2.4, -1.3, -0.5, 0.1, 0.6, 1.3, 2.4];
  const probs = [0.03, 0.12, 0.22, 0.26, 0.22, 0.12, 0.03];
  const vol = kind === 'EQ' ? 0.021 : 0.009;
  const outcomes: Outcome[] = sym.map((x, k) => ({ label: ['Crash', 'Sell-off', 'Down', 'Flat', 'Up', 'Rally', 'Melt-up'][k], r: x * vol }));
  const thresholds = thresholdsFromProbs(probs);
  const beta = kind === 'EQ' ? fvec({ EQ: 0.95 }) : fvec({ RATES: -0.95 });
  const idio = idioFor(beta);
  const ev = kind === 'EQ' ? 0.0011 : 0.0003;
  const drift0 = driftForEv(outcomes, thresholds, ev);
  const id = `future-${kind}`;
  const name = kind === 'EQ' ? 'Equity index future (EQX)' : '10Y Treasury future (long)';
  return {
    pub: {
      id, archetype: 'future', name, ticker: kind === 'EQ' ? 'EQX-F' : 'TY-F',
      thesis: kind === 'EQ'
        ? 'Liquid equity index future. Go long for equity premium, or short to hedge the equity beta of the rest of the book.'
        : 'Long 10-year Treasury futures. Profits when yields fall; a classic (but not always reliable) hedge for risk assets.',
      notes: ['Always available', 'Can be shorted', 'Very liquid, cheap to trade'],
      outcomes, thresholds, estDrift: drift0, statedSe: 0.03, se0: 0.03, betaEst: beta.slice(), idioEst: idio,
      createdTurn: turn, expiresTurn: 1e9, offerUntil: 1e9, margin: 0.08, tcBps: 0.5, finBps: 0,
      capacity: 2.5e8, netFraction: 1, allowShort: true, maxPctNav: 3,
      research: { signal: true, risk: true }, researchCost: { signal: 0, risk: 0 }, alive: true,
    },
    truth: { id, drift0, decay: 0, beta, idio, err0: 0, errScale: 1, resNoise: 0, quality: 'hedge' },
  };
}

