// Risk engine. Sensitivities are computed by bump-and-revalue on the full pricing models, so every
// Greek is consistent with how positions are actually valued. VaR/ES use full revaluation under
// simulated one-day factor shocks drawn from the current regime (fixed scenario seeds, so day-to-day
// changes reflect positions and conditions, not sampling noise). Stress tests apply named historical-
// style shocks.

import { applyShock, PAIRS, pairCcys, STOCKS, structuredCloneMarket, type Shock } from './market';
import { CMDTYS } from './market';
import { positionValue, unitValue } from './pricing';
import { cashUsd, unitNotional } from './book';
import type { Ccy, Desk, DeskId, GameState, Instrument, MarketState } from './types';

export type FactorKey = string;

/** Market risk factors an instrument is exposed to. */
export function factorKeys(inst: Instrument): FactorKey[] {
  switch (inst.kind) {
    case 'stock':
      return [`eq:${inst.id}`, 'rates:usd'];
    case 'etf':
    case 'eqFut':
      return ['eq:US500', 'rates:usd'];
    case 'eqOpt':
      return [`eq:${inst.underlying}`, `vol:${inst.underlying}`, 'rates:usd', 'time'];
    case 'ust':
    case 'bondFut':
    case 'sofrFut':
    case 'irs':
      return ['rates:usd', 'kr:2', 'kr:5', 'kr:10', 'kr:30', 'time'];
    case 'fxFwd': {
      const [b, q] = pairCcys(inst.pair);
      return [`fx:${b}`, `fx:${q}`, `ccy:${b}`, `ccy:${q}`, 'rates:usd', 'time'];
    }
    case 'fxOpt': {
      const [b, q] = pairCcys(inst.pair);
      return [`fx:${b}`, `fx:${q}`, `fxvol:${inst.pair}`, `ccy:${b}`, `ccy:${q}`, 'rates:usd', 'time'];
    }
    case 'corp':
      return [`cr:${inst.issuer}`, 'rates:usd', 'kr:2', 'kr:5', 'kr:10', 'time'];
    case 'cds':
      return [`cr:${inst.issuer}`, 'rates:usd', 'time'];
    case 'cmdtyFut':
      return [`cm:${inst.cmdty}`, 'rates:usd'];
    case 'cmdtyOpt':
      return [`cm:${inst.cmdty}`, `cmvol:${inst.cmdty}`, 'time'];
    case 'varSwap':
      return ['eq:US500', 'vol:US500', 'time'];
    case 'autocall':
      return ['eq:US500', 'vol:US500', 'rates:usd', 'time'];
  }
}

const KR_NODES: Record<string, number[]> = { '2': [2, 3], '5': [5, 7], '10': [10, 20], '30': [30] };

/** Return a bumped copy of the market for a factor. */
export function bump(m: MarketState, key: FactorKey, size: number): MarketState {
  const b = structuredCloneMarket(m);
  const [kind, id] = key.split(':');
  switch (kind) {
    case 'eq':
      if (id === 'US500') {
        b.eq.spot.US500 *= 1 + size;
      } else b.eq.spot[id] *= 1 + size;
      break;
    case 'vol':
      b.eq.atmVol[id] += size;
      break;
    case 'rates':
      b.rates.ust.zeros = b.rates.ust.zeros.map((z) => z + size);
      break;
    case 'kr': {
      const nodes = KR_NODES[id];
      b.rates.ust.zeros = b.rates.ust.zeros.map((z, i) => (nodes.includes(b.rates.ust.tenors[i]) ? z + size : z));
      break;
    }
    case 'ccy':
      if (id === 'USD') b.rates.ust.zeros = b.rates.ust.zeros.map((z) => z + size);
      else b.rates.ccy[id as Ccy] += size;
      break;
    case 'cr':
      b.credit.spread[id] += size;
      break;
    case 'fx': {
      // currency `id` appreciates by `size` against USD
      if (id === 'USD') break;
      for (const p of PAIRS) {
        const [base, quote] = pairCcys(p);
        if (base === id && quote === 'USD') b.fx.spot[p] *= 1 + size;
        if (quote === id && base === 'USD') b.fx.spot[p] /= 1 + size;
      }
      break;
    }
    case 'fxvol':
      b.fx.vol[id] += size;
      break;
    case 'cm':
      b.cmdty.spot[id] *= 1 + size;
      break;
    case 'cmvol':
      b.cmdty.vol[id] += size;
      break;
    case 'time':
      b.t += size;
      break;
  }
  return b;
}

const BUMP: Record<string, number> = { eq: 0.01, vol: 0.01, rates: 0.0001, kr: 0.0001, ccy: 0.0001, cr: 1, fx: 0.01, fxvol: 0.01, cm: 0.01, cmvol: 0.01, time: 1 / 365 };

export interface Greeks {
  /** ΔV for each factor bump (USD): eq/fx/cm per +1%, vol per +1 vol pt, rates per +1bp, cr per +1bp, time per day. */
  sens: Record<FactorKey, number>;
  /** Equity gamma: change in $delta(per 1%) for a 1% move, by underlying. */
  gamma: Record<string, number>;
}

function valueOfDesk(s: GameState, d: Desk, m: MarketState, filter?: (i: Instrument) => boolean, includeCash = true): number {
  let v = includeCash ? cashUsd(d, m) : 0;
  for (const id in d.positions) {
    const inst = s.instruments[id];
    if (filter && !filter(inst)) continue;
    v += positionValue(inst, d.positions[id], m);
  }
  return v;
}

export function deskGreeks(s: GameState, d: Desk, m: MarketState = s.market): Greeks {
  const sens: Record<string, number> = {};
  const gamma: Record<string, number> = {};
  const add = (k: string, v: number) => (sens[k] = (sens[k] ?? 0) + v);
  for (const id in d.positions) {
    const inst = s.instruments[id];
    const pos = d.positions[id];
    const base = positionValue(inst, pos, m);
    for (const k of factorKeys(inst)) {
      const size = BUMP[k.split(':')[0]];
      const up = positionValue(inst, pos, bump(m, k, size));
      add(k, up - base);
      if ((inst.kind === 'eqOpt' || inst.kind === 'autocall' || inst.kind === 'varSwap') && k.startsWith('eq:')) {
        const dn = positionValue(inst, pos, bump(m, k, -size));
        gamma[k.slice(3)] = (gamma[k.slice(3)] ?? 0) + (up + dn - 2 * base);
      }
    }
  }
  // non-USD cash balances are FX exposures (and carry)
  for (const c in d.cash) {
    if (c === 'USD') continue;
    const bal = d.cash[c as Ccy] ?? 0;
    if (!bal) continue;
    const before = cashUsd(d, m);
    const after = cashUsd(d, bump(m, `fx:${c}`, 0.01));
    add(`fx:${c}`, after - before);
  }
  return { sens, gamma };
}

/** Beta-weighted equity delta ($ per 1% move in the index). */
export function betaDelta(g: Greeks): number {
  let v = 0;
  for (const k in g.sens) {
    if (!k.startsWith('eq:')) continue;
    const id = k.slice(3);
    const beta = id === 'US500' ? 1 : STOCKS.find((x) => x.id === id)?.beta ?? 1;
    v += g.sens[k] * beta;
  }
  return v;
}

export function sumKeys(g: Greeks, prefix: string) {
  let v = 0;
  for (const k in g.sens) if (k.startsWith(prefix)) v += g.sens[k];
  return v;
}

export interface DeskRiskSummary {
  greeks: Greeks;
  eqDelta: number;
  gammaTotal: number;
  vega: number;
  theta: number;
  dv01: number; // $ per +1bp parallel (negative = long duration)
  keyRates: Record<string, number>;
  cs01: number;
  fxExposure: Record<string, number>; // USD-equivalent long position by currency
  fxNOP: number;
  cmdtyDelta: Record<string, number>;
  primary: number;
  primaryLabel: string;
  grossLong: number;
  grossShort: number;
}

export function summarise(s: GameState, deskId: DeskId, m: MarketState = s.market): DeskRiskSummary {
  const d = s.desks[deskId];
  const g = deskGreeks(s, d, m);
  const fxExposure: Record<string, number> = {};
  for (const k in g.sens) if (k.startsWith('fx:')) fxExposure[k.slice(3)] = (fxExposure[k.slice(3)] ?? 0) + g.sens[k] * 100;
  const cmdtyDelta: Record<string, number> = {};
  for (const k in g.sens) if (k.startsWith('cm:')) cmdtyDelta[k.slice(3)] = g.sens[k];
  const keyRates: Record<string, number> = {};
  for (const k in g.sens) if (k.startsWith('kr:')) keyRates[k.slice(3)] = g.sens[k];
  const eqDelta = betaDelta(g);
  const vega = sumKeys(g, 'vol:') + sumKeys(g, 'fxvol:') + sumKeys(g, 'cmvol:');
  const fxNOP = Object.values(fxExposure).reduce((a, b) => a + Math.abs(b), 0);
  let grossLong = 0;
  let grossShort = 0;
  for (const id in d.positions) {
    const inst = s.instruments[id];
    const n = d.positions[id].qty * unitNotional(s, inst, m);
    if (n > 0) grossLong += n;
    else grossShort -= n;
  }
  const res: DeskRiskSummary = {
    greeks: g,
    eqDelta,
    gammaTotal: Object.values(g.gamma).reduce((a, b) => a + b, 0),
    vega,
    theta: g.sens.time ?? 0,
    dv01: (g.sens['rates:usd'] ?? 0) + (g.sens['ccy:USD'] ?? 0),
    keyRates,
    cs01: sumKeys(g, 'cr:'),
    fxExposure,
    fxNOP,
    cmdtyDelta,
    primary: 0,
    primaryLabel: '',
    grossLong,
    grossShort,
  };
  const p = primaryMetric(deskId, res);
  res.primary = p.value;
  res.primaryLabel = p.label;
  return res;
}

export function primaryMetric(deskId: DeskId, r: Omit<DeskRiskSummary, 'primary' | 'primaryLabel'>): { value: number; label: string } {
  switch (deskId) {
    case 'eq':
      return { value: Math.abs(r.eqDelta), label: 'Beta-weighted delta ($ per 1%)' };
    case 'rates':
      return { value: Math.abs(r.dv01), label: 'DV01 ($ per bp)' };
    case 'fx':
      return { value: r.fxNOP / 100, label: 'FX net open position ($ per 1%)' };
    case 'credit':
      return { value: Math.abs(r.cs01), label: 'CS01 ($ per bp)' };
    case 'cmdty':
      return { value: Object.values(r.cmdtyDelta).reduce((a, b) => a + Math.abs(b), 0), label: 'Commodity delta ($ per 1%)' };
    case 'exotics':
      return { value: Math.abs(r.vega), label: 'Vega ($ per vol pt)' };
  }
}

// ---------------------------------------------------------------- VaR / ES

const VAR_SCENARIOS = 300;
let scenarioCache: { key: string; shocks: Shock[] } | null = null;

function scenarioShocks(m: MarketState): Shock[] {
  const key = `${m.regime}:${Object.keys(m.credit.spread).length}`;
  if (scenarioCache && scenarioCache.key === key) return scenarioCache.shocks;
  const h = { rng: 987654321 };
  const nrm = () => {
    let u = 0;
    while (u === 0) u = randU(h);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * randU(h));
  };
  const keys = ['vol:US500', 'etf', 'rates:term', 'rates:belly', 'rates:ss', ...STOCKS.map((x) => `eq:${x.id}`), ...Object.keys(m.credit.spread).map((x) => `cr:${x}`), ...PAIRS.map((p) => `fx:${p}`), ...Object.keys(CMDTYS).map((c) => `cm:${c}`)];
  const shocks: Shock[] = [];
  for (let i = 0; i < VAR_SCENARIOS; i++) {
    const idio: Record<string, number> = {};
    for (const k of keys) idio[k] = nrm();
    // fat tails: occasional joint stress draws
    const jump = randU(h) < 0.04 ? 2.2 : 1;
    shocks.push({ g: nrm() * jump, inf: nrm() * jump, ro: (nrm() + (jump > 1 ? 1 : 0)) * jump, usd: nrm(), oil: nrm() * 0.9 * jump, idio });
  }
  scenarioCache = { key, shocks };
  return shocks;
}

function randU(h: { rng: number }) {
  let t = (h.rng = (h.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export interface VarResult {
  var99: number;
  es975: number;
  byDesk: Record<DeskId, { var99: number; es975: number; pnl: number[] }>;
  undiversified: number;
  pnl: number[];
}

function quantileLoss(pnl: number[], q: number) {
  const sorted = [...pnl].sort((a, b) => a - b);
  const idx = Math.max(0, Math.floor((1 - q) * sorted.length) - 1);
  return -sorted[idx];
}

function esLoss(pnl: number[], q: number) {
  const sorted = [...pnl].sort((a, b) => a - b);
  const n = Math.max(1, Math.floor((1 - q) * sorted.length));
  return -sorted.slice(0, n).reduce((a, b) => a + b, 0) / n;
}

/** Delta-gamma-vega approximation for Monte-Carlo-priced notes (full MC per VaR scenario is too slow). */
interface ApproxPos {
  delta: number; // $ per 1% index move
  gamma: number; // change in delta per 1%
  vega: number; // $ per vol pt
  spot: number;
  vol: number;
}

function approxFor(s: GameState, d: Desk, m: MarketState): ApproxPos[] {
  const out: ApproxPos[] = [];
  for (const id in d.positions) {
    const inst = s.instruments[id];
    if (inst.kind !== 'autocall') continue;
    const p = d.positions[id];
    const b = positionValue(inst, p, m);
    const up = positionValue(inst, p, bump(m, 'eq:US500', 0.01));
    const dn = positionValue(inst, p, bump(m, 'eq:US500', -0.01));
    const vu = positionValue(inst, p, bump(m, 'vol:US500', 0.01));
    out.push({ delta: (up - dn) / 2, gamma: up + dn - 2 * b, vega: vu - b, spot: m.eq.spot.US500, vol: m.eq.atmVol.US500 });
  }
  return out;
}

const notAutocall = (i: Instrument) => i.kind !== 'autocall';

export function computeVaR(s: GameState, m: MarketState = s.market): VarResult {
  const shocks = scenarioShocks(m);
  const desks = Object.keys(s.desks) as DeskId[];
  const base: Record<string, number> = {};
  const approx: Record<string, ApproxPos[]> = {};
  for (const d of desks) {
    base[d] = valueOfDesk(s, s.desks[d], m, notAutocall);
    approx[d] = approxFor(s, s.desks[d], m);
  }
  const byDesk = {} as VarResult['byDesk'];
  for (const d of desks) byDesk[d] = { var99: 0, es975: 0, pnl: [] };
  const total: number[] = [];
  for (const z of shocks) {
    const sm = applyShock(m, z, { days: 1 });
    let t = 0;
    for (const d of desks) {
      const desk = s.desks[d];
      if (!Object.keys(desk.positions).length && Object.keys(desk.cash).every((c) => c === 'USD')) {
        byDesk[d].pnl.push(0);
        continue;
      }
      let v = valueOfDesk(s, desk, sm, notAutocall) - base[d];
      for (const a of approx[d]) {
        const r = (sm.eq.spot.US500 / a.spot - 1) * 100;
        v += a.delta * r + 0.5 * a.gamma * r * r + a.vega * (sm.eq.atmVol.US500 - a.vol) * 100;
      }
      byDesk[d].pnl.push(v);
      t += v;
    }
    total.push(t);
  }
  let undiv = 0;
  for (const d of desks) {
    byDesk[d].var99 = Math.max(0, quantileLoss(byDesk[d].pnl, 0.99));
    byDesk[d].es975 = Math.max(0, esLoss(byDesk[d].pnl, 0.975));
    undiv += byDesk[d].var99;
  }
  return { var99: Math.max(0, quantileLoss(total, 0.99)), es975: Math.max(0, esLoss(total, 0.975)), byDesk, undiversified: undiv, pnl: total };
}

// ---------------------------------------------------------------- stress tests

export const STRESSES: { id: string; name: string; desc: string; shock: Shock }[] = [
  { id: 'crash', name: 'Equity crash (2020-style)', desc: 'US500 −12%, vol +20pts, credit wider, flight to Treasuries', shock: { g: -3, inf: -1, ro: 5, usd: 1, oil: -2, idio: {}, jumps: { 'eq:US500': -0.07, 'cr:CDXHY': 120 } } },
  { id: 'rates', name: 'Inflation / rates shock (2022-style)', desc: 'Front end +60bp, curve bear-flattens, equities −5%, dollar up', shock: { g: -0.5, inf: 6, ro: 1, usd: 2, oil: 1, policyBp: 50, idio: {} } },
  { id: 'credit', name: 'Credit crunch (2008-style)', desc: 'IG +60bp, HY +350bp, equities −8%, liquidity collapses', shock: { g: -3, inf: -1, ro: 4, usd: 1.5, oil: -1, idio: {}, jumps: { 'cr:CDXIG': 45, 'cr:CDXHY': 250, 'eq:US500': -0.03 } } },
  { id: 'oil', name: 'Oil supply shock', desc: 'WTI +20%, curve into backwardation, inflation expectations up', shock: { g: -0.5, inf: 2, ro: 1, usd: 0.5, oil: 6, idio: {}, jumps: { 'cm:WTI': 0.08 } } },
  { id: 'em', name: 'EM / dollar squeeze', desc: 'Dollar +4%, BRL/MXN −8–10%, risk-off', shock: { g: -1, inf: 0.5, ro: 2.5, usd: 5, oil: -1, idio: {}, jumps: { 'fx:USDBRL': 0.06, 'fx:USDMXN': 0.05 } } },
  { id: 'rally', name: 'Melt-up & vol crush', desc: 'US500 +7%, vol −6pts, credit tighter, yields up', shock: { g: 4, inf: 1, ro: -4, usd: -1, oil: 1, idio: {}, jumps: { 'eq:US500': 0.03 } } },
];

export function runStress(s: GameState, id: string, m: MarketState = s.market): { total: number; byDesk: Record<DeskId, number> } {
  const st = STRESSES.find((x) => x.id === id)!;
  const calm = { ...structuredCloneMarket(m), regime: 'steady' as const };
  const sm = applyShock(calm, st.shock, { advanceTime: false });
  sm.regime = m.regime;
  const byDesk = {} as Record<DeskId, number>;
  let total = 0;
  for (const d of Object.keys(s.desks) as DeskId[]) {
    const v = valueOfDesk(s, s.desks[d], sm) - valueOfDesk(s, s.desks[d], m);
    byDesk[d] = v;
    total += v;
  }
  return { total, byDesk };
}

// ---------------------------------------------------------------- capital & counterparty

export interface CapitalBreakdown {
  marketRisk: number;
  stressAddon: number;
  counterparty: number;
  balanceSheet: number;
  total: number;
}

export function counterpartyExposure(s: GameState, m: MarketState = s.market): Record<string, { mtm: number; addon: number; ead: number }> {
  const out: Record<string, { mtm: number; addon: number; ead: number }> = {};
  for (const d of Object.values(s.desks)) {
    for (const id in d.positions) {
      const p = d.positions[id];
      if (!p.cpty) continue;
      const inst = s.instruments[id];
      if (!['irs', 'fxFwd', 'fxOpt', 'eqOpt', 'cmdtyOpt', 'varSwap', 'cds'].includes(inst.kind)) continue;
      const mtm = positionValue(inst, p, m);
      const notional = Math.abs(p.qty) * unitNotional(s, inst, m);
      const rateLike = inst.kind === 'irs' ? 0.005 * Math.sqrt(Math.max(0.1, inst.maturity - m.t)) : 0.03;
      const addon = notional * rateLike;
      const e = (out[p.cpty] ??= { mtm: 0, addon: 0, ead: 0 });
      e.mtm += mtm;
      e.addon += addon;
    }
  }
  for (const k in out) out[k].ead = Math.max(0, out[k].mtm) + out[k].addon;
  return out;
}

export function deskCapital(s: GameState, deskId: DeskId, v: VarResult, stressWorst: number, m: MarketState = s.market): CapitalBreakdown {
  const d = s.desks[deskId];
  const marketRisk = 3 * Math.sqrt(10) * (v.byDesk[deskId]?.var99 ?? 0);
  const stressAddon = 0.25 * Math.max(0, -stressWorst);
  let counterparty = 0;
  for (const id in d.positions) {
    const p = d.positions[id];
    if (!p.cpty) continue;
    const inst = s.instruments[id];
    const mtm = positionValue(inst, p, m);
    const notional = Math.abs(p.qty) * unitNotional(s, inst, m);
    counterparty += 0.08 * (Math.max(0, mtm) + notional * (inst.kind === 'irs' ? 0.005 : 0.02));
  }
  let bs = 0;
  for (const id in d.positions) {
    const inst = s.instruments[id];
    if (['stock', 'etf', 'ust', 'corp'].includes(inst.kind)) bs += Math.abs(d.positions[id].qty * unitValue(inst, m));
  }
  const balanceSheet = bs * 0.03;
  return { marketRisk, stressAddon, counterparty, balanceSheet, total: marketRisk + stressAddon + counterparty + balanceSheet };
}

export { valueOfDesk };
