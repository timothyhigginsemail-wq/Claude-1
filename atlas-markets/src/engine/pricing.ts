// Valuation. Simplified but defensible models, each documented:
// - Equity & equity-index options: Black-Scholes on the forward, sticky-moneyness skew.
// - FX options: Garman-Kohlhagen. Commodity options: Black-76 on the futures price.
// - Treasuries & corporates: discounted cash flows on the Treasury zero curve (+ z-spread for credit).
// - Swaps: single-curve SOFR OIS valuation; running accruals are settled daily in cash, so the PV
//   is the clean value from today.
// - Bond futures: a notional 6% bond on the curve, priced forward to delivery (no CTD switch option).
// - CDS: reduced-form survival curve with flat hazard λ = S/(1−R), quarterly premium leg.
// - Variance swaps: realised variance to date + implied variance for the remainder.
// - Autocallable notes: Monte Carlo on GBM with fixed seeds (common random numbers) so revaluation
//   and Greeks are stable from day to day.

import { CMDTYS, ccyDF, pairCcys, sofrDF, sofrFwd, sofrZero, ustDF, usdPer } from './market';
import type { Instrument, MarketState, Position } from './types';

// ---------------------------------------------------------------- maths

export function ncdf(x: number): number {
  // Abramowitz & Stegun 7.1.26 via erf
  const t = 1 / (1 + 0.3275911 * Math.abs(x / Math.SQRT2));
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(x * x) / 2);
  return x >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}

export function npdf(x: number) {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

/** Black-76: undiscounted option on a forward. */
export function black(F: number, K: number, T: number, vol: number, cp: 'C' | 'P'): number {
  if (T <= 1e-9 || vol <= 1e-9) return Math.max(0, cp === 'C' ? F - K : K - F);
  const sd = vol * Math.sqrt(T);
  const d1 = (Math.log(F / K) + 0.5 * sd * sd) / sd;
  const d2 = d1 - sd;
  return cp === 'C' ? F * ncdf(d1) - K * ncdf(d2) : K * ncdf(-d2) - F * ncdf(-d1);
}

// ---------------------------------------------------------------- equity

export function eqForward(m: MarketState, u: string, T: number): number {
  return m.eq.spot[u] * Math.exp((sofrZero(m, Math.max(T, 0.01)) - (m.eq.div[u] ?? 0)) * T);
}

export function eqVol(m: MarketState, u: string, K: number, T: number): number {
  const F = eqForward(m, u, T);
  const atm = m.eq.atmVol[u] ?? 0.25;
  const skew = u === 'US500' ? m.eq.skew : m.eq.skew * 0.5;
  // term structure: short-dated vol reacts more; skew flattens with maturity
  const v = atm + skew * Math.log(K / F) / Math.sqrt(Math.max(T, 0.08) / 0.25) * 0.5;
  return Math.max(0.05, v);
}

export function etfPrice(m: MarketState, ratio: number) {
  return (m.eq.spot.US500 / ratio) * (1 + m.eq.etfPrem);
}

// ---------------------------------------------------------------- bonds

export function bondDirty(m: MarketState, coupon: number, maturityFromNow: number, spreadBp = 0): number {
  let pv = 0;
  for (let p = maturityFromNow; p > 1e-9; p -= 0.5) {
    const cf = coupon / 2 + (Math.abs(p - maturityFromNow) < 1e-9 ? 1 : 0);
    pv += cf * ustDF(m, p) * Math.exp((-spreadBp / 1e4) * p);
  }
  return pv;
}

export function accrued(coupon: number, maturityFromNow: number): number {
  const sinceLast = 0.5 - (maturityFromNow % 0.5 || 0.5);
  return coupon * Math.max(0, sinceLast);
}

/** Clean price per 1 face. */
export function bondClean(m: MarketState, coupon: number, maturityFromNow: number, spreadBp = 0): number {
  if (maturityFromNow <= 0) return 1;
  return bondDirty(m, coupon, maturityFromNow, spreadBp) - accrued(coupon, maturityFromNow);
}

/** Yield-to-maturity (semi-annual) of a clean price, by bisection. */
export function bondYield(clean: number, coupon: number, T: number): number {
  const acc = accrued(coupon, T);
  let lo = -0.02;
  let hi = 0.3;
  for (let i = 0; i < 60; i++) {
    const y = (lo + hi) / 2;
    let pv = 0;
    for (let p = T; p > 1e-9; p -= 0.5) pv += (coupon / 2 + (Math.abs(p - T) < 1e-9 ? 1 : 0)) / Math.pow(1 + y / 2, 2 * p);
    if (pv - acc > clean) lo = y;
    else hi = y;
  }
  return (lo + hi) / 2;
}

export function bondFutPrice(m: MarketState, coupon: number, bondTenor: number, expiryFromNow: number): number {
  const T = Math.max(0, expiryFromNow);
  let pv = 0;
  for (let p = T + bondTenor; p > T + 1e-9; p -= 0.5) pv += (coupon / 2 + (Math.abs(p - T - bondTenor) < 1e-9 ? 1 : 0)) * ustDF(m, p);
  return (100 * pv) / ustDF(m, T);
}

// ---------------------------------------------------------------- swaps

/** Annuity of an annual fixed leg from now to maturity (first period is a stub). */
export function annuity(m: MarketState, T: number): number {
  let a = 0;
  let prev = T;
  for (let p = T; p > 1e-9; p -= 1) {
    const start = Math.max(0, p - 1);
    a += (p - start) * sofrDF(m, p);
    prev = start;
  }
  void prev;
  return a;
}

/** Receiver-fixed swap value per 1 notional. */
export function swapValue(m: MarketState, fixed: number, T: number): number {
  if (T <= 0) return 0;
  return fixed * annuity(m, T) - (1 - sofrDF(m, T));
}

export function swapPar(m: MarketState, T: number): number {
  return (1 - sofrDF(m, T)) / annuity(m, T);
}

// ---------------------------------------------------------------- FX

export function fxForward(m: MarketState, pair: string, T: number): number {
  const [b, q] = pairCcys(pair);
  return (m.fx.spot[pair] * ccyDF(m, b, T)) / ccyDF(m, q, T);
}

/** USD per unit of quote currency of a pair. */
export function quoteUsd(m: MarketState, pair: string) {
  return usdPer(m, pairCcys(pair)[1]);
}

// ---------------------------------------------------------------- credit

export function hazard(spreadBp: number, recovery: number) {
  return spreadBp / 1e4 / (1 - recovery);
}

/** Risky PV01 (quarterly premium) per 1 notional. */
export function rpv01(m: MarketState, spreadBp: number, recovery: number, T: number): number {
  const lam = hazard(spreadBp, recovery);
  let a = 0;
  for (let p = T; p > 1e-9; p -= 0.25) {
    const start = Math.max(0, p - 0.25);
    a += (p - start) * sofrDF(m, p) * Math.exp(-lam * p);
  }
  return a;
}

/** Value to a protection BUYER per 1 notional of a CDS paying `coupon` bps running. */
export function cdsValue(m: MarketState, spreadBp: number, coupon: number, recovery: number, T: number): number {
  if (T <= 0) return 0;
  return ((spreadBp - coupon) / 1e4) * rpv01(m, spreadBp, recovery, T);
}

// ---------------------------------------------------------------- commodities

export function cmdtyFwd(m: MarketState, c: string, T: number): number {
  const def = CMDTYS[c];
  const S = m.cmdty.spot[c];
  const season = def.season ? 1 + def.season * Math.cos(2 * Math.PI * (m.t + T)) : 1; // winter premium for gas
  const season0 = def.season ? 1 + def.season * Math.cos(2 * Math.PI * m.t) : 1;
  return S * Math.exp(m.cmdty.carry[c] * T) * (season / season0);
}

// ---------------------------------------------------------------- variance swaps & autocalls

export function varSwapValue(m: MarketState, inst: { underlying: string; strikeVol: number; start: number; expiry: number; rv0?: number }): number {
  const total = inst.expiry - inst.start;
  const rem = Math.max(0, inst.expiry - m.t);
  const realised = (m.realised[inst.underlying] ?? 0) - (inst.rv0 ?? 0);
  const impl = m.eq.atmVol[inst.underlying] * 1.08; // variance swaps strike above ATM vol (skew/convexity)
  const expVar = (realised * (365 / 252) + impl * impl * rem) / total;
  return sofrDF(m, rem) * (expVar - inst.strikeVol * inst.strikeVol);
}

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MC_PATHS = 1500;
const normCache: Record<number, Float64Array> = {};

function normals(seed: number, n: number): Float64Array {
  const key = seed * 1000 + n;
  if (normCache[key]) return normCache[key];
  const r = mulberry(seed);
  const out = new Float64Array(n * MC_PATHS);
  for (let i = 0; i < out.length; i += 2) {
    const u1 = Math.max(1e-12, r());
    const u2 = r();
    const rad = Math.sqrt(-2 * Math.log(u1));
    out[i] = rad * Math.cos(2 * Math.PI * u2);
    if (i + 1 < out.length) out[i + 1] = rad * Math.sin(2 * Math.PI * u2);
  }
  normCache[key] = out;
  return out;
}

/** Value of the autocallable payoff per 1 notional (what the bank owes the note holder). */
export function autocallPayoffPV(m: MarketState, a: { underlying: string; s0: number; obs: number[]; coupon: number; callLevel: number; kiLevel: number; seed: number }): number {
  const remaining = a.obs.filter((t) => t > m.t + 1e-9);
  if (!remaining.length) return 0;
  const S = m.eq.spot[a.underlying];
  const q = m.eq.div[a.underlying] ?? 0;
  const T = remaining[remaining.length - 1] - m.t;
  const vol = eqVol(m, a.underlying, a.s0 * a.kiLevel, T) * 0.6 + eqVol(m, a.underlying, S, T) * 0.4;
  const z = normals(a.seed, remaining.length);
  const nObsTotal = a.obs.length;
  const done = nObsTotal - remaining.length;
  let sum = 0;
  for (let p = 0; p < MC_PATHS; p++) {
    let s = S;
    let tPrev = m.t;
    let pv = 0;
    let called = false;
    for (let k = 0; k < remaining.length; k++) {
      const tk = remaining[k];
      const dt = tk - tPrev;
      const r = sofrZero(m, Math.max(tk - m.t, 0.01));
      s *= Math.exp((r - q - 0.5 * vol * vol) * dt + vol * Math.sqrt(dt) * z[p * remaining.length + k]);
      tPrev = tk;
      const df = sofrDF(m, tk - m.t);
      const nObs = done + k + 1;
      if (s >= a.callLevel * a.s0) {
        pv = df * (1 + a.coupon * nObs);
        called = true;
        break;
      }
      if (k === remaining.length - 1) pv = df * (s >= a.kiLevel * a.s0 ? 1 : s / a.s0);
    }
    void called;
    sum += pv;
  }
  return sum / MC_PATHS;
}

// ---------------------------------------------------------------- unified valuation

export function isFuture(inst: Instrument) {
  return inst.kind === 'eqFut' || inst.kind === 'bondFut' || inst.kind === 'sofrFut' || inst.kind === 'cmdtyFut';
}

/** Quoted price of a futures contract. */
export function futPrice(inst: Instrument, m: MarketState): number {
  switch (inst.kind) {
    case 'eqFut':
      return eqForward(m, inst.underlying, Math.max(0, inst.expiry - m.t));
    case 'bondFut':
      return bondFutPrice(m, inst.coupon, inst.bondTenor, inst.expiry - m.t);
    case 'sofrFut': {
      const s = Math.max(0.0001, inst.start - m.t);
      return 100 - 100 * sofrFwd(m, s, Math.max(s + 0.01, inst.end - m.t));
    }
    case 'cmdtyFut':
      return cmdtyFwd(m, inst.cmdty, Math.max(0, inst.expiry - m.t));
    default:
      throw new Error('not a future');
  }
}

export function futMult(inst: Instrument): number {
  return (inst as any).mult ?? 1;
}

/**
 * USD value of one unit of a non-futures instrument (shares, $1 face, 1 contract, $1 notional,
 * 1 unit of base currency…).
 */
export function unitValue(inst: Instrument, m: MarketState): number {
  switch (inst.kind) {
    case 'stock':
      return m.eq.spot[inst.id];
    case 'etf':
      return etfPrice(m, inst.ratio);
    case 'eqOpt': {
      const T = Math.max(0, inst.expiry - m.t);
      const F = eqForward(m, inst.underlying, T);
      return black(F, inst.strike, T, eqVol(m, inst.underlying, inst.strike, T), inst.cp) * sofrDF(m, T) * inst.mult;
    }
    case 'ust':
      return bondClean(m, inst.coupon, inst.maturity - m.t);
    case 'corp': {
      if (m.credit.defaulted[inst.issuer]) return m.credit.recovery[inst.issuer] ?? 0.4;
      return bondClean(m, inst.coupon, inst.maturity - m.t, m.credit.spread[inst.issuer]);
    }
    case 'irs':
      return swapValue(m, inst.fixed, inst.maturity - m.t);
    case 'fxFwd': {
      const T = Math.max(0, inst.maturity - m.t);
      const [b, q] = pairCcys(inst.pair);
      const v = m.fx.spot[inst.pair] * ccyDF(m, b, T) - inst.strike * ccyDF(m, q, T);
      return v * quoteUsd(m, inst.pair);
    }
    case 'fxOpt': {
      const T = Math.max(0, inst.expiry - m.t);
      const [, q] = pairCcys(inst.pair);
      const F = fxForward(m, inst.pair, T);
      return black(F, inst.strike, T, m.fx.vol[inst.pair], inst.cp) * ccyDF(m, q, T) * quoteUsd(m, inst.pair);
    }
    case 'cds': {
      if (m.credit.defaulted[inst.issuer]) return 0;
      const rec = m.credit.recovery[inst.issuer] ?? 0.4;
      return cdsValue(m, m.credit.spread[inst.issuer] + (inst.issuer.startsWith('CDX') ? 0 : m.credit.basis), inst.coupon, rec, inst.maturity - m.t);
    }
    case 'cmdtyOpt': {
      const T = Math.max(0, inst.expiry - m.t);
      const futT = Math.max(T, inst.futExpiry - m.t);
      const F = cmdtyFwd(m, inst.cmdty, futT);
      return black(F, inst.strike, T, m.cmdty.vol[inst.cmdty], inst.cp) * sofrDF(m, T) * inst.mult;
    }
    case 'varSwap':
      return varSwapValue(m, inst);
    case 'autocall':
      return autocallPayoffPV(m, inst); // value to the note holder per 1 notional
    default:
      throw new Error(`unitValue: ${inst.kind}`);
  }
}

/** USD PV of a position. Futures are worth their unsettled variation margin. */
export function positionValue(inst: Instrument, pos: Position, m: MarketState): number {
  if (!pos.qty) return 0;
  if (isFuture(inst)) return pos.qty * (futPrice(inst, m) - (pos.ref ?? futPrice(inst, m))) * futMult(inst);
  return pos.qty * unitValue(inst, m);
}

/** Quoted "price" per unit used for RFQs and tickets (natural market units). */
export function quotePrice(inst: Instrument, m: MarketState): number {
  if (isFuture(inst)) return futPrice(inst, m);
  switch (inst.kind) {
    case 'ust':
    case 'corp':
      return unitValue(inst, m) * 100;
    case 'irs':
      return swapPar(m, inst.maturity - m.t) * 100;
    case 'cds':
      return unitValue(inst, m) * 100; // points upfront paid by protection buyer
    case 'fxFwd':
      return fxForward(m, inst.pair, inst.maturity - m.t);
    default:
      return unitValue(inst, m);
  }
}

/** Instruments whose value is denominated per $1 face/notional (vs per share/contract). */
export function perNotional(inst: Instrument) {
  return ['ust', 'corp', 'irs', 'cds', 'fxFwd', 'fxOpt', 'varSwap', 'autocall'].includes(inst.kind);
}

export { sofrDF, ustDF };
