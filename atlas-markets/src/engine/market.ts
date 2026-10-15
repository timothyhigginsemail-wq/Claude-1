// Market simulation. Every daily move is driven by a small set of macro factors so that assets move
// together coherently (a hawkish inflation surprise lifts front-end yields, strengthens the dollar,
// pressures equities and widens credit), plus asset-specific idiosyncratic noise. Events add
// standardised surprises to the same factors. All levels are fictional and illustrative.

import { chance, rand, randNormal, type RngHolder } from './rng';
import type { Ccy, Curve, MarketState, Regime } from './types';

export const TENORS = [0.25, 0.5, 1, 2, 3, 5, 7, 10, 20, 30];

export function zeroAt(c: Curve, T: number): number {
  const { tenors, zeros } = c;
  if (T <= tenors[0]) return zeros[0];
  if (T >= tenors[tenors.length - 1]) return zeros[zeros.length - 1];
  for (let i = 1; i < tenors.length; i++) {
    if (T <= tenors[i]) {
      const w = (T - tenors[i - 1]) / (tenors[i] - tenors[i - 1]);
      return zeros[i - 1] * (1 - w) + zeros[i] * w;
    }
  }
  return zeros[zeros.length - 1];
}

function interp(xs: number[], ys: number[], x: number) {
  return zeroAt({ tenors: xs, zeros: ys }, x);
}

/** Treasury discount factor for a cash flow T years from now. */
export function ustDF(m: MarketState, T: number): number {
  if (T <= 0) return 1;
  return Math.exp(-zeroAt(m.rates.ust, T) * T);
}

/** SOFR (OIS) zero rate = Treasury zero + swap spread. */
export function sofrZero(m: MarketState, T: number): number {
  return zeroAt(m.rates.ust, T) + interp(m.rates.ust.tenors, m.rates.swapSpread, T) / 1e4;
}

export function sofrDF(m: MarketState, T: number): number {
  if (T <= 0) return 1;
  return Math.exp(-sofrZero(m, T) * T);
}

/** Discount factor in a currency (non-USD curves are flat at the short rate). */
export function ccyDF(m: MarketState, ccy: Ccy, T: number): number {
  if (T <= 0) return 1;
  if (ccy === 'USD') return sofrDF(m, T);
  return Math.exp(-m.rates.ccy[ccy] * T);
}

/** Simple-compounded SOFR forward rate between T1 and T2. */
export function sofrFwd(m: MarketState, T1: number, T2: number): number {
  return (sofrDF(m, T1) / sofrDF(m, T2) - 1) / (T2 - T1);
}

/** Par swap rate (annual fixed vs SOFR) for a spot-starting swap of tenor T. */
export function parSwapRate(m: MarketState, T: number): number {
  let ann = 0;
  for (let p = T; p > 1e-9; p -= 1) ann += Math.min(1, p) * sofrDF(m, p);
  return (1 - sofrDF(m, T)) / ann;
}

/** Par yield of a semi-annual Treasury of tenor T. */
export function parYield(m: MarketState, T: number): number {
  if (T < 0.5) return (1 / ustDF(m, T) - 1) / T; // bills: simple money-market yield
  let ann = 0;
  for (let p = T; p > 1e-9; p -= 0.5) ann += 0.5 * ustDF(m, p);
  return (1 - ustDF(m, T)) / ann;
}

// ---------------------------------------------------------------- FX helpers

export const PAIRS = ['EURUSD', 'USDJPY', 'GBPUSD', 'AUDUSD', 'USDCAD', 'USDMXN', 'USDBRL'] as const;

export function pairCcys(pair: string): [Ccy, Ccy] {
  return [pair.slice(0, 3) as Ccy, pair.slice(3, 6) as Ccy];
}

/** USD value of one unit of a currency. */
export function usdPer(m: MarketState, ccy: Ccy): number {
  if (ccy === 'USD') return 1;
  for (const p of PAIRS) {
    const [b, q] = pairCcys(p);
    if (b === ccy && q === 'USD') return m.fx.spot[p];
    if (q === ccy && b === 'USD') return 1 / m.fx.spot[p];
  }
  throw new Error(`No USD rate for ${ccy}`);
}

export const PIP: Record<string, number> = { EURUSD: 1e-4, USDJPY: 0.01, GBPUSD: 1e-4, AUDUSD: 1e-4, USDCAD: 1e-4, USDMXN: 1e-4, USDBRL: 1e-4 };

// ---------------------------------------------------------------- regimes

export interface RegimeParams {
  k: number; // volatility scale
  label: string;
  drift: number; // daily equity drift
  riskOffMean: number;
  liquidity: number;
  appetite: number;
  ftp: number;
  repo: number;
  vix: number;
}

export const REGIMES: Record<Regime, RegimeParams> = {
  calm: { k: 0.7, label: 'Calm', drift: 0.0006, riskOffMean: -0.1, liquidity: 0.85, appetite: 1.1, ftp: 40, repo: 3, vix: 13 },
  steady: { k: 1, label: 'Steady', drift: 0.0003, riskOffMean: 0, liquidity: 1, appetite: 1, ftp: 45, repo: 5, vix: 16 },
  choppy: { k: 1.35, label: 'Choppy', drift: 0, riskOffMean: 0.1, liquidity: 1.25, appetite: 0.9, ftp: 50, repo: 8, vix: 21 },
  recovery: { k: 1.5, label: 'Recovery', drift: 0.0012, riskOffMean: -0.2, liquidity: 1.4, appetite: 0.85, ftp: 60, repo: 12, vix: 24 },
  stressed: { k: 2.1, label: 'Stressed', drift: -0.002, riskOffMean: 0.45, liquidity: 2, appetite: 0.65, ftp: 80, repo: 25, vix: 32 },
  crisis: { k: 3.2, label: 'Crisis', drift: -0.006, riskOffMean: 1.0, liquidity: 3.5, appetite: 0.4, ftp: 140, repo: 60, vix: 48 },
};

const TRANSITIONS: Record<Regime, [Regime, number][]> = {
  calm: [['steady', 0.04]],
  steady: [['calm', 0.03], ['choppy', 0.04]],
  choppy: [['steady', 0.08], ['stressed', 0.03]],
  stressed: [['crisis', 0.05], ['recovery', 0.1], ['choppy', 0.05]],
  crisis: [['recovery', 0.15]],
  recovery: [['steady', 0.1], ['choppy', 0.04]],
};

// ---------------------------------------------------------------- initial market

export const STOCKS = [
  { id: 'ORBT', name: 'Orbital Systems', sector: 'Tech', px: 412, beta: 1.1, idioVol: 0.2, adv: 9e9 },
  { id: 'NMBS', name: 'Nimbus Cloud', sector: 'Tech', px: 188, beta: 1.35, idioVol: 0.3, adv: 1.6e9 },
  { id: 'HLXS', name: 'Helix Semiconductor', sector: 'Semis', px: 64, beta: 1.6, idioVol: 0.45, adv: 6e8 },
  { id: 'GRNB', name: 'Granite Bancorp', sector: 'Financials', px: 58, beta: 1.2, idioVol: 0.22, adv: 7e8 },
  { id: 'PTVN', name: 'Petravon Energy', sector: 'Energy', px: 104, beta: 0.9, idioVol: 0.25, adv: 1.4e9 },
  { id: 'MDLH', name: 'Meridel Health', sector: 'Healthcare', px: 156, beta: 0.7, idioVol: 0.17, adv: 1.9e9 },
  { id: 'TTNA', name: 'Titan Aero', sector: 'Industrials', px: 212, beta: 1.0, idioVol: 0.2, adv: 9e8 },
  { id: 'BRWY', name: 'Brightway Foods', sector: 'Staples', px: 71, beta: 0.55, idioVol: 0.15, adv: 4e8 },
  { id: 'AURA', name: 'Aura Payments', sector: 'Fintech', px: 142, beta: 1.3, idioVol: 0.32, adv: 1.1e9 },
  { id: 'CLDR', name: 'Calder Logistics', sector: 'Transport', px: 52, beta: 1.1, idioVol: 0.38, adv: 1.2e8 },
];

export const CMDTYS: Record<string, { name: string; unit: string; mult: number; spot: number; carry: number; vol: number; season: number }> = {
  WTI: { name: 'WTI crude oil', unit: '$/bbl', mult: 1000, spot: 75, carry: -0.06, vol: 0.32, season: 0 },
  NG: { name: 'Henry Hub natural gas', unit: '$/MMBtu', mult: 10000, spot: 3.1, carry: 0.18, vol: 0.55, season: 0.18 },
  GOLD: { name: 'Gold', unit: '$/oz', mult: 100, spot: 2400, carry: 0.045, vol: 0.15, season: 0 },
  COPPER: { name: 'Copper', unit: '$/lb', mult: 25000, spot: 4.3, carry: 0.02, vol: 0.22, season: 0 },
  CORN: { name: 'Corn', unit: '$/bu', mult: 5000, spot: 4.5, carry: 0.08, vol: 0.25, season: 0.05 },
};

export function initialMarket(): MarketState {
  const spot: Record<string, number> = { US500: 5800 };
  const div: Record<string, number> = { US500: 0.014 };
  const atm: Record<string, number> = { US500: 0.16 };
  for (const s of STOCKS) {
    spot[s.id] = s.px;
    div[s.id] = 0.012;
    atm[s.id] = Math.sqrt(0.16 * 0.16 * s.beta * s.beta + s.idioVol * s.idioVol);
  }
  return {
    t: 0,
    day: 1,
    regime: 'steady',
    liquidity: 1,
    dealerAppetite: 1,
    rates: {
      ust: { tenors: [...TENORS], zeros: [0.043, 0.0425, 0.041, 0.039, 0.0385, 0.039, 0.04, 0.0415, 0.0445, 0.044] },
      swapSpread: [0, -2, -5, -12, -15, -20, -25, -32, -45, -55],
      sofr: 0.0433,
      ccy: { USD: 0.0433, EUR: 0.02, JPY: 0.005, GBP: 0.04, AUD: 0.036, CAD: 0.0275, MXN: 0.085, BRL: 0.14 },
      repoSpread: 5,
      ftpSpread: 45,
      normalVol: 95,
    },
    eq: { spot, div, atmVol: atm, skew: -0.45, etfPrem: 0 },
    fx: {
      spot: { EURUSD: 1.085, USDJPY: 150, GBPUSD: 1.27, AUDUSD: 0.66, USDCAD: 1.37, USDMXN: 18.5, USDBRL: 5.6 },
      vol: { EURUSD: 0.07, USDJPY: 0.09, GBPUSD: 0.08, AUDUSD: 0.1, USDCAD: 0.06, USDMXN: 0.12, USDBRL: 0.15 },
    },
    credit: { spread: {}, defaulted: {}, recovery: {}, basis: 5 },
    cmdty: {
      spot: Object.fromEntries(Object.entries(CMDTYS).map(([k, v]) => [k, v.spot])),
      carry: Object.fromEntries(Object.entries(CMDTYS).map(([k, v]) => [k, v.carry])),
      vol: Object.fromEntries(Object.entries(CMDTYS).map(([k, v]) => [k, v.vol])),
    },
    realised: { US500: 0 },
  };
}

// ---------------------------------------------------------------- daily shocks

export interface Shock {
  g: number; // growth
  inf: number; // inflation
  ro: number; // risk-off
  usd: number; // dollar
  oil: number; // oil supply (+ = supply disruption)
  /** Front-end policy surprise in bps (FOMC). */
  policyBp?: number;
  /** Idiosyncratic shocks keyed 'eq:ID', 'cr:ID', 'fx:PAIR', 'cm:ID' (standard normals) */
  idio: Record<string, number>;
  /** Extra direct moves (e.g. earnings jumps), keyed like idio, as returns or bp. */
  jumps?: Record<string, number>;
}

export function drawShock(h: RngHolder, m: MarketState, idioKeys: string[], pending?: Record<string, number>): Shock {
  const rp = REGIMES[m.regime];
  const idio: Record<string, number> = {};
  for (const k of idioKeys) idio[k] = pending?.[k] ?? randNormal(h);
  return {
    g: randNormal(h),
    inf: randNormal(h),
    ro: rp.riskOffMean + randNormal(h),
    usd: randNormal(h),
    oil: randNormal(h) * 0.9,
    idio,
  };
}

/** Apply one day's factor shock to a market. Returns a new market (input unchanged). */
export function applyShock(m0: MarketState, z: Shock, opts: { days?: number; advanceTime?: boolean } = {}): MarketState {
  const m: MarketState = structuredCloneMarket(m0);
  const rp = REGIMES[m.regime];
  const k = rp.k;
  const j = z.jumps ?? {};
  // --- equities
  const rm = rp.drift + 0.0095 * k * (0.55 * z.g - 0.7 * z.ro - 0.25 * z.inf + 0.1 * z.oil * -0.5);
  const oldIdx = m.eq.spot.US500;
  m.eq.spot.US500 = oldIdx * Math.exp(rm + (j['eq:US500'] ?? 0));
  const idxRet = Math.log(m.eq.spot.US500 / oldIdx);
  m.realised.US500 = (m.realised.US500 ?? 0) + idxRet * idxRet;
  for (const s of STOCKS) {
    const sectorOil = s.sector === 'Energy' ? 0.012 * k * z.oil : 0;
    const r = s.beta * idxRet + (s.idioVol / Math.sqrt(252)) * Math.sqrt(k) * (z.idio[`eq:${s.id}`] ?? 0) + sectorOil + (j[`eq:${s.id}`] ?? 0);
    m.eq.spot[s.id] *= Math.exp(r);
  }
  // implied vol: rises when the market falls (leverage effect), mean-reverts to the regime level
  const target = rp.vix / 100;
  const dv = -2.2 * idxRet + 0.004 * Math.sqrt(k) * (z.idio['vol:US500'] ?? 0) + 0.12 * (target - m.eq.atmVol.US500);
  m.eq.atmVol.US500 = Math.max(0.08, m.eq.atmVol.US500 + dv);
  for (const s of STOCKS) {
    const base = Math.sqrt(m.eq.atmVol.US500 ** 2 * s.beta * s.beta + s.idioVol * s.idioVol);
    m.eq.atmVol[s.id] = base;
  }
  m.eq.skew = Math.min(-0.2, Math.max(-1.2, m.eq.skew - 0.05 * z.ro * k * 0.3 + 0.05 * (-0.45 - m.eq.skew)));
  m.eq.etfPrem = m.eq.etfPrem * 0.4 + 0.0004 * k * (z.idio['etf'] ?? 0);
  // --- rates (bp moves): front end driven by policy expectations, long end by growth/inflation/term premium
  const front = 5 * k * (0.75 * z.inf + 0.3 * z.g - 0.45 * z.ro) + (z.policyBp ?? 0) * 0.8;
  const long = 4.2 * k * (0.45 * z.inf + 0.4 * z.g - 0.55 * z.ro) + 1.2 * k * (z.idio['rates:term'] ?? 0) + (z.policyBp ?? 0) * 0.15;
  const belly = 1.0 * k * (z.idio['rates:belly'] ?? 0);
  m.rates.ust.zeros = m.rates.ust.tenors.map((T, i) => {
    const wFront = Math.exp(-T / 2.5);
    const wBelly = (T / 5) * Math.exp(1 - T / 5);
    const dz = front * wFront + long * (1 - wFront) + belly * wBelly + (j[`rates:${T}`] ?? 0);
    return Math.max(-0.005, m.rates.ust.zeros[i] + dz / 1e4);
  });
  m.rates.sofr = Math.max(0, m.rates.sofr + (z.policyBp ?? 0) / 1e4);
  m.rates.ccy.USD = m.rates.sofr;
  // anchor the very front of the Treasury curve to policy
  m.rates.ust.zeros[0] += (m.rates.sofr - 0.0003 - m.rates.ust.zeros[0]) * 0.3;
  m.rates.swapSpread = m.rates.swapSpread.map((s, i) => s + (-0.5 * z.ro * k - 0.15 * (s - [0, -2, -5, -12, -15, -20, -25, -32, -45, -55][i])) * (i > 2 ? 1 : 0.3) + 0.3 * (z.idio['rates:ss'] ?? 0));
  m.rates.normalVol = Math.max(50, m.rates.normalVol + 2 * k * Math.abs(z.inf) * 0.5 + 0.1 * (95 * Math.sqrt(k) - m.rates.normalVol));
  // foreign short rates drift with global inflation
  for (const c of ['EUR', 'GBP', 'AUD', 'CAD'] as Ccy[]) m.rates.ccy[c] = Math.max(0, m.rates.ccy[c] + (0.8 * k * z.inf * 0.4 + 0.5 * (z.idio[`rates:${c}`] ?? 0)) / 1e4);
  // --- credit (bp): risk-off and weak growth widen spreads; high yield moves ~4x investment grade
  const ig = 1.6 * k * (0.85 * z.ro - 0.35 * z.g) + (j['cr:CDXIG'] ?? 0);
  m.credit.spread.CDXIG = Math.max(30, (m.credit.spread.CDXIG ?? 55) + ig + 0.4 * (z.idio['cr:CDXIG'] ?? 0));
  m.credit.spread.CDXHY = Math.max(200, (m.credit.spread.CDXHY ?? 330) + 4.2 * ig + 2.5 * (z.idio['cr:CDXHY'] ?? 0) + (j['cr:CDXHY'] ?? 0));
  for (const id in m.credit.spread) {
    if (id.startsWith('CDX') || m.credit.defaulted[id]) continue;
    const lvl = m.credit.spread[id];
    const beta = lvl / 120; // wider names move more
    m.credit.spread[id] = Math.max(15, lvl + beta * ig * 1.2 + Math.sqrt(lvl) * 0.35 * Math.sqrt(k) * (z.idio[`cr:${id}`] ?? 0) + (j[`cr:${id}`] ?? 0));
  }
  m.credit.basis = m.credit.basis + 0.3 * z.ro * k * 0.5 - 0.1 * (m.credit.basis - 5);
  // --- FX (% moves): dollar factor, risk-off (JPY up, commodity/EM currencies down), oil for CAD
  const d = 0.0042 * k * (0.65 * z.usd + 0.3 * z.ro + 0.25 * z.inf) + (z.policyBp ?? 0) * 0.0004;
  const fxMove: Record<string, number> = {
    EURUSD: -0.9 * d + 0.0025 * k * (z.idio['fx:EURUSD'] ?? 0),
    GBPUSD: -0.8 * d + 0.003 * k * (z.idio['fx:GBPUSD'] ?? 0),
    AUDUSD: -0.8 * d - 0.004 * k * z.ro + 0.002 * k * z.g + 0.0035 * k * (z.idio['fx:AUDUSD'] ?? 0),
    USDJPY: 0.7 * d - 0.004 * k * z.ro + 0.003 * k * (z.idio['fx:USDJPY'] ?? 0),
    USDCAD: 0.55 * d - 0.0015 * k * z.oil + 0.002 * k * (z.idio['fx:USDCAD'] ?? 0),
    USDMXN: 0.8 * d + 0.006 * k * z.ro + 0.004 * k * (z.idio['fx:USDMXN'] ?? 0),
    USDBRL: 1.0 * d + 0.008 * k * z.ro + 0.006 * k * (z.idio['fx:USDBRL'] ?? 0),
  };
  for (const p of PAIRS) {
    m.fx.spot[p] *= Math.exp(fxMove[p] + (j[`fx:${p}`] ?? 0));
    const base = { EURUSD: 0.07, USDJPY: 0.09, GBPUSD: 0.08, AUDUSD: 0.1, USDCAD: 0.06, USDMXN: 0.12, USDBRL: 0.15 }[p]!;
    m.fx.vol[p] = Math.max(0.03, m.fx.vol[p] + 0.15 * (base * Math.sqrt(k) - m.fx.vol[p]) + 1.5 * Math.abs(fxMove[p]));
  }
  // --- commodities: oil supply shocks move oil and flatten/invert its curve; gold is a haven
  const cm: Record<string, number> = {
    WTI: 0.019 * k * (0.65 * z.oil + 0.3 * z.g - 0.2 * z.ro) + 0.006 * (z.idio['cm:WTI'] ?? 0),
    NG: 0.03 * k * (0.25 * z.oil + 0.9 * (z.idio['cm:NG'] ?? 0)),
    GOLD: 0.009 * k * (0.5 * z.ro - 0.4 * z.usd + 0.25 * z.inf) + 0.004 * (z.idio['cm:GOLD'] ?? 0),
    COPPER: 0.014 * k * (0.7 * z.g - 0.25 * z.usd - 0.2 * z.ro) + 0.006 * (z.idio['cm:COPPER'] ?? 0),
    CORN: 0.013 * k * (0.9 * (z.idio['cm:CORN'] ?? 0) + 0.1 * z.inf),
  };
  for (const c in cm) {
    m.cmdty.spot[c] *= Math.exp(cm[c] + (j[`cm:${c}`] ?? 0));
    const baseCarry = CMDTYS[c].carry;
    // supply disruptions push the curve into backwardation (scarcity of prompt barrels)
    const dCarry = c === 'WTI' ? -0.02 * z.oil * k : 0;
    m.cmdty.carry[c] += dCarry + 0.08 * (baseCarry - m.cmdty.carry[c]);
    m.cmdty.vol[c] = Math.max(0.08, m.cmdty.vol[c] + 0.12 * (CMDTYS[c].vol * Math.sqrt(k) - m.cmdty.vol[c]) + 1.2 * Math.abs(cm[c]));
  }
  if (opts.advanceTime !== false) {
    const days = opts.days ?? 1;
    m.t += days / 365;
  }
  return m;
}

export function structuredCloneMarket(m: MarketState): MarketState {
  return JSON.parse(JSON.stringify(m));
}

export function stepRegime(h: RngHolder, m: MarketState) {
  const u = rand(h);
  let acc = 0;
  for (const [to, p] of TRANSITIONS[m.regime]) {
    acc += p;
    if (u < acc) {
      m.regime = to;
      return true;
    }
  }
  return false;
}

/** Move liquidity, dealer appetite and funding spreads toward regime levels. */
export function settleConditions(m: MarketState) {
  const rp = REGIMES[m.regime];
  m.liquidity += (rp.liquidity - m.liquidity) * 0.4;
  m.dealerAppetite += (rp.appetite - m.dealerAppetite) * 0.4;
  m.rates.ftpSpread += (rp.ftp - m.rates.ftpSpread) * 0.3;
  m.rates.repoSpread += (rp.repo - m.rates.repoSpread) * 0.4;
}

export function idioKeys(m: MarketState): string[] {
  const keys = ['vol:US500', 'etf', 'rates:term', 'rates:belly', 'rates:ss', 'rates:EUR', 'rates:GBP', 'rates:AUD', 'rates:CAD'];
  for (const s of STOCKS) keys.push(`eq:${s.id}`);
  for (const id in m.credit.spread) keys.push(`cr:${id}`);
  for (const p of PAIRS) keys.push(`fx:${p}`);
  for (const c in CMDTYS) keys.push(`cm:${c}`);
  return keys;
}

export { chance };
