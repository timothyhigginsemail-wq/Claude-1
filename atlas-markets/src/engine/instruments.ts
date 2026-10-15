// Instrument universe: listed contracts roll as they expire; OTC instruments (swaps, forwards,
// options, variance swaps, notes) are created on demand by trades.

import { CMDTYS, parYield, STOCKS } from './market';
import { autocallPayoffPV, cdsValue, eqForward, fxForward, futPrice, swapPar } from './pricing';
import type { AutocallInst, CdsInst, CmdtyFutInst, CmdtyOptInst, CorpInst, EqFutInst, EqOptInst, FxFwdInst, FxOptInst, GameState, Instrument, IrsInst, Issuer, MarketState, VarSwapInst } from './types';

export const ISSUERS: (Issuer & { spread: number; ig: boolean })[] = [
  { id: 'MDLH', name: 'Meridel Health', rating: 'AA', sector: 'Healthcare', beta: 0.6, recovery: 0.4, hy: false, spread: 45, ig: true },
  { id: 'ORBT', name: 'Orbital Systems', rating: 'A', sector: 'Tech', beta: 0.7, recovery: 0.4, hy: false, spread: 55, ig: true },
  { id: 'GRNB', name: 'Granite Bancorp', rating: 'A', sector: 'Financials', beta: 1.1, recovery: 0.35, hy: false, spread: 90, ig: true },
  { id: 'TTNA', name: 'Titan Aero', rating: 'BBB', sector: 'Industrials', beta: 1.0, recovery: 0.4, hy: false, spread: 120, ig: true },
  { id: 'PTVN', name: 'Petravon Energy', rating: 'BBB', sector: 'Energy', beta: 1.2, recovery: 0.4, hy: false, spread: 140, ig: true },
  { id: 'CLDR', name: 'Calder Logistics', rating: 'BB', sector: 'Transport', beta: 1.5, recovery: 0.35, hy: true, spread: 290, ig: false },
  { id: 'HLXS', name: 'Helix Semiconductor', rating: 'BB', sector: 'Semis', beta: 1.6, recovery: 0.35, hy: true, spread: 330, ig: false },
  { id: 'SRTL', name: 'Sorrel Telecom', rating: 'B', sector: 'Telecom', beta: 1.8, recovery: 0.3, hy: true, spread: 540, ig: false },
  { id: 'PNCR', name: 'Pinecrest Hospitals', rating: 'B', sector: 'Healthcare', beta: 1.7, recovery: 0.35, hy: true, spread: 610, ig: false },
  { id: 'MDRT', name: 'Meadow Retail', rating: 'CCC', sector: 'Retail', beta: 2.2, recovery: 0.25, hy: true, spread: 1150, ig: false },
];

export const EQ_OPT_MONEYNESS = [0.85, 0.9, 0.95, 1.0, 1.05, 1.1];

function roundTo(x: number, step: number) {
  return Math.round(x / step) * step;
}

function monthLabel(t: number) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const idx = Math.floor((t * 12) % 12);
  return `${months[idx]}${27 + Math.floor(t)}`;
}

export function buildUniverse(m: MarketState): { instruments: Record<string, Instrument>; issuers: Record<string, Issuer> } {
  const I: Record<string, Instrument> = {};
  const add = (i: Instrument) => (I[i.id] = i);
  for (const s of STOCKS) add({ id: s.id, kind: 'stock', desk: 'eq', name: s.name, ticker: s.id, sector: s.sector, beta: s.beta, idioVol: s.idioVol, adv: s.adv });
  add({ id: 'USLC', kind: 'etf', desk: 'eq', name: 'US Large Cap ETF', ratio: 10, adv: 30e9 });
  // Treasuries (on-the-run, coupons near par)
  for (const [T, label] of [[2, '2Y'], [5, '5Y'], [10, '10Y'], [30, '30Y']] as const) {
    const c = roundTo(parYield(m, T), 0.00125);
    add({ id: `UST${label}`, kind: 'ust', desk: 'rates', name: `UST ${(c * 100).toFixed(3)}% ${label}`, coupon: c, maturity: T, tenorLabel: label });
  }
  const issuers: Record<string, Issuer> = {};
  for (const is of ISSUERS) {
    const { spread, ig, ...rest } = is;
    issuers[is.id] = rest;
    m.credit.spread[is.id] = spread;
    m.credit.recovery[is.id] = is.recovery;
    for (const T of ig ? [5, 10] : [5]) {
      const c = roundTo(parYield(m, T) + spread / 1e4, 0.00125);
      add({ id: `${is.id}-${T}Y`, kind: 'corp', desk: 'credit', name: `${is.name} ${(c * 100).toFixed(2)}% ${T}Y`, issuer: is.id, coupon: c, maturity: T, adv: ig ? 250e6 : 60e6 } as CorpInst);
    }
    add({ id: `CDS-${is.id}`, kind: 'cds', desk: 'credit', name: `${is.name} 5Y CDS`, issuer: is.id, coupon: is.hy ? 500 : 100, maturity: 5 } as CdsInst);
  }
  m.credit.spread.CDXIG = 55;
  m.credit.spread.CDXHY = 330;
  m.credit.recovery.CDXIG = 0.4;
  m.credit.recovery.CDXHY = 0.3;
  add({ id: 'CDX-IG', kind: 'cds', desk: 'credit', name: 'CDX IG 5Y', issuer: 'CDXIG', coupon: 100, maturity: 5 });
  add({ id: 'CDX-HY', kind: 'cds', desk: 'credit', name: 'CDX HY 5Y', issuer: 'CDXHY', coupon: 500, maturity: 5 });
  return { instruments: I, issuers };
}

/** Keep listed contracts available: front/next futures, SOFR strip, listed index options, commodity months. */
export function refreshListings(s: GameState) {
  const m = s.market;
  const I = s.instruments;
  const live = (pred: (i: Instrument) => boolean) => Object.values(I).filter(pred);
  // US500 futures: quarterly; keep two contracts with > 5 days to expiry
  const esLive = live((i) => i.kind === 'eqFut' && i.expiry > m.t + 5 / 365);
  let last = Math.max(0.05, ...live((i) => i.kind === 'eqFut').map((i) => (i as EqFutInst).expiry));
  while (esLive.length < 2) {
    const exp = esLive.length === 0 && !live((i) => i.kind === 'eqFut').length ? 0.2 : last + 0.25;
    const f: EqFutInst = { id: `ES-${monthLabel(exp)}`, kind: 'eqFut', desk: 'eq', name: `US500 future ${monthLabel(exp)}`, underlying: 'US500', expiry: exp, mult: 50 };
    I[f.id] = f;
    esLive.push(f);
    last = exp;
  }
  // Bond futures (TY 10Y, US 30Y) — quarterly
  for (const [code, tenor] of [['TY', 9], ['US', 25]] as const) {
    const cur = live((i) => i.kind === 'bondFut' && i.id.startsWith(code) && i.expiry > m.t + 5 / 365);
    if (!cur.length) {
      const prev = live((i) => i.kind === 'bondFut' && i.id.startsWith(code)).map((i) => (i as any).expiry as number);
      const exp = prev.length ? Math.max(...prev) + 0.25 : 0.2;
      I[`${code}-${monthLabel(exp)}`] = { id: `${code}-${monthLabel(exp)}`, kind: 'bondFut', desk: 'rates', name: `${code === 'TY' ? '10Y note' : 'Bond'} future ${monthLabel(exp)}`, coupon: 0.06, bondTenor: tenor, expiry: exp, mult: 1000 };
    }
  }
  // SOFR futures strip: 6 quarterly contracts starting ahead
  const sr = live((i) => i.kind === 'sofrFut' && i.start > m.t + 2 / 365);
  let lastStart = Math.max(m.t + 0.05, ...live((i) => i.kind === 'sofrFut').map((i) => (i as any).start as number));
  if (!live((i) => i.kind === 'sofrFut').length) lastStart = 0.1 - 0.25;
  for (let n = sr.length; n < 6; n++) {
    lastStart += 0.25;
    const id = `SR3-${monthLabel(lastStart)}`;
    I[id] = { id, kind: 'sofrFut', desk: 'rates', name: `3M SOFR future ${monthLabel(lastStart)}`, start: lastStart, end: lastStart + 0.25, mult: 2500 };
  }
  // Commodity futures: 6 monthly contracts each
  for (const c in CMDTYS) {
    const cur = live((i) => i.kind === 'cmdtyFut' && i.cmdty === c && i.expiry > m.t + 2 / 365);
    let lastExp = Math.max(m.t, ...live((i) => i.kind === 'cmdtyFut' && i.cmdty === c).map((i) => (i as any).expiry as number));
    if (!live((i) => i.kind === 'cmdtyFut' && i.cmdty === c).length) lastExp = 0.04 - 1 / 12;
    for (let n = cur.length; n < 6; n++) {
      lastExp += 1 / 12;
      const lab = monthLabel(lastExp);
      const id = `${c}-${lab}`;
      const f: CmdtyFutInst = { id, kind: 'cmdtyFut', desk: 'cmdty', name: `${CMDTYS[c].name} ${lab}`, cmdty: c, expiry: lastExp, mult: CMDTYS[c].mult, label: lab };
      I[id] = f;
    }
  }
  // Listed US500 options: 1M and 3M series on a moneyness grid around spot
  for (const tenor of [1 / 12, 0.25]) {
    const have = live((i) => i.kind === 'eqOpt' && i.underlying === 'US500' && i.expiry > m.t + tenor * 0.5 && i.expiry < m.t + tenor * 1.6);
    if (have.length) continue;
    const exp = m.t + tenor;
    const S = m.eq.spot.US500;
    for (const k of EQ_OPT_MONEYNESS) {
      const K = roundTo(S * k, 25);
      for (const cp of ['P', 'C'] as const) {
        if ((cp === 'P' && k > 1.05) || (cp === 'C' && k < 0.95)) continue;
        const id = `SPX-${monthLabel(exp)}-${K}${cp}`;
        if (I[id]) continue;
        I[id] = { id, kind: 'eqOpt', desk: 'eq', name: `US500 ${monthLabel(exp)} ${K} ${cp === 'C' ? 'call' : 'put'}`, underlying: 'US500', strike: K, expiry: exp, cp, mult: 100 } as EqOptInst;
      }
    }
  }
}

// ---------------------------------------------------------------- OTC creation

function uid(s: GameState, prefix: string) {
  return `${prefix}${s.nextId++}`;
}

export function newSwap(s: GameState, tenor: number, fixed: number, label?: string): IrsInst {
  const m = s.market;
  const inst: IrsInst = { id: uid(s, 'IRS'), kind: 'irs', desk: 'rates', name: `${tenor}Y SOFR swap @ ${(fixed * 100).toFixed(3)}%${label ? ` (${label})` : ''}`, fixed, maturity: m.t + tenor, tenorLabel: `${tenor}Y`, dynamic: true };
  s.instruments[inst.id] = inst;
  return inst;
}

export function newFxFwd(s: GameState, pair: string, tenor: number, strike?: number): FxFwdInst {
  const m = s.market;
  const K = strike ?? fxForward(m, pair, tenor);
  const months = Math.round(tenor * 12);
  const inst: FxFwdInst = { id: uid(s, 'FWD'), kind: 'fxFwd', desk: 'fx', name: `${pair} ${months}M forward @ ${K.toFixed(pair.includes('JPY') ? 2 : 4)}`, pair, strike: K, maturity: m.t + tenor, dynamic: true };
  s.instruments[inst.id] = inst;
  return inst;
}

export function newFxOpt(s: GameState, pair: string, tenor: number, strike: number, cp: 'C' | 'P'): FxOptInst {
  const months = Math.round(tenor * 12);
  const inst: FxOptInst = { id: uid(s, 'FXO'), kind: 'fxOpt', desk: 'fx', name: `${pair} ${months}M ${strike.toFixed(pair.includes('JPY') ? 1 : 3)} ${cp === 'C' ? 'call' : 'put'}`, pair, strike, expiry: s.market.t + tenor, cp, dynamic: true };
  s.instruments[inst.id] = inst;
  return inst;
}

export function newEqOpt(s: GameState, underlying: string, tenor: number, strike: number, cp: 'C' | 'P'): EqOptInst {
  const inst: EqOptInst = { id: uid(s, 'EQO'), kind: 'eqOpt', desk: 'eq', name: `${underlying} ${Math.round(tenor * 12)}M ${strike.toFixed(0)} ${cp === 'C' ? 'call' : 'put'}`, underlying, strike, expiry: s.market.t + tenor, cp, mult: underlying === 'US500' ? 100 : 100, dynamic: true };
  s.instruments[inst.id] = inst;
  return inst;
}

export function newCmdtyOpt(s: GameState, futId: string, strike: number, cp: 'C' | 'P'): CmdtyOptInst {
  const f = s.instruments[futId] as CmdtyFutInst;
  const inst: CmdtyOptInst = { id: uid(s, 'CMO'), kind: 'cmdtyOpt', desk: 'cmdty', name: `${f.name} ${strike.toFixed(f.cmdty === 'GOLD' ? 0 : 2)} ${cp === 'C' ? 'call' : 'put'}`, cmdty: f.cmdty, futId, futExpiry: f.expiry, strike, expiry: Math.max(s.market.t + 5 / 365, f.expiry - 5 / 365), cp, mult: f.mult, dynamic: true };
  s.instruments[inst.id] = inst;
  return inst;
}

export function newVarSwap(s: GameState, tenor: number, strikeVol: number): VarSwapInst {
  const m = s.market;
  const inst: VarSwapInst = { id: uid(s, 'VAR'), kind: 'varSwap', desk: 'exotics', name: `US500 ${Math.round(tenor * 12)}M variance swap @ ${(strikeVol * 100).toFixed(1)}`, underlying: 'US500', strikeVol, start: m.t, expiry: m.t + tenor, rv0: m.realised.US500 ?? 0, dynamic: true };
  s.instruments[inst.id] = inst;
  return inst;
}

export function newAutocall(s: GameState, years: number, coupon: number, kiLevel = 0.6): AutocallInst {
  const m = s.market;
  const obs: number[] = [];
  for (let q = 1; q <= years * 4; q++) obs.push(m.t + q / 4);
  const inst: AutocallInst = { id: uid(s, 'AC'), kind: 'autocall', desk: 'exotics', name: `US500 ${years}Y autocallable, ${(coupon * 400).toFixed(1)}% p.a., ${Math.round(kiLevel * 100)}% barrier`, underlying: 'US500', s0: m.eq.spot.US500, start: m.t, obs, coupon, callLevel: 1, kiLevel, seed: 1000 + s.nextId, dynamic: true };
  s.instruments[inst.id] = inst;
  return inst;
}

export function frontFuture(s: GameState, pred: (i: Instrument) => boolean): Instrument | undefined {
  return Object.values(s.instruments)
    .filter((i) => pred(i) && (i as any).expiry > s.market.t + 3 / 365)
    .sort((a, b) => (a as any).expiry - (b as any).expiry)[0];
}

/** Dynamic instruments that no desk holds any more can be dropped to keep saves small. */
export function pruneInstruments(s: GameState) {
  const held = new Set<string>();
  for (const d of Object.values(s.desks)) for (const id in d.positions) held.add(id);
  for (const r of s.rfqs) held.add(r.instId);
  for (const o of s.orders) held.add(o.instId);
  for (const id of Object.keys(s.instruments)) {
    const i = s.instruments[id];
    const exp = (i as any).expiry ?? (i as any).maturity ?? (i as any).start;
    const expired = typeof exp === 'number' && exp < s.market.t - 1 / 365 && i.kind !== 'stock';
    if ((i.dynamic || expired) && !held.has(id) && (i.dynamic ? true : expired)) delete s.instruments[id];
  }
}

export { swapPar, eqForward, fxForward, futPrice, cdsValue, autocallPayoffPV };
