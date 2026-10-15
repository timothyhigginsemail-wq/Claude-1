// Trading books. Each desk holds multi-currency cash and positions. Trades move cash and positions;
// futures settle variation margin to cash daily; coupons, dividends, swap/CDS running legs and
// currency interest accrue to cash; funding and margin costs are charged to cash.
// Desk value = Σ cash (in USD) + Σ position PV, so every P&L component reconciles to Δ value.

import { pairCcys, PIP, usdPer } from './market';
import { annuity, cmdtyFwd, futMult, futPrice, isFuture, quotePrice, rpv01, unitValue, positionValue } from './pricing';
import type { BlotterEntry, Ccy, Desk, DeskId, GameState, Instrument, MarketState, PnlParts, Position } from './types';

export function emptyPnl(): PnlParts {
  return { spread: 0, flow: 0, execution: 0, time: 0, rates: 0, fx: 0, equity: 0, vol: 0, credit: 0, cmdty: 0, funding: 0, accrual: 0, fees: 0, defaults: 0, other: 0 };
}

export function pnlSum(p: PnlParts): number {
  let s = 0;
  for (const k in p) s += (p as any)[k];
  return s;
}

export function addPnl(d: Desk, k: keyof PnlParts, v: number) {
  d.pnlToday[k] += v;
}

export function cashUsd(d: Desk, m: MarketState): number {
  let v = 0;
  for (const c in d.cash) v += (d.cash[c as Ccy] ?? 0) * usdPer(m, c as Ccy);
  return v;
}

export function addCash(d: Desk, ccy: Ccy, amt: number) {
  d.cash[ccy] = (d.cash[ccy] ?? 0) + amt;
}

export function positionsValue(s: GameState, d: Desk, m: MarketState): number {
  let v = 0;
  for (const id in d.positions) v += positionValue(s.instruments[id], d.positions[id], m);
  return v;
}

export function deskValue(s: GameState, d: Desk, m: MarketState = s.market): number {
  return cashUsd(d, m) + positionsValue(s, d, m);
}

export function firmValue(s: GameState, m: MarketState = s.market) {
  let v = 0;
  for (const id in s.desks) v += deskValue(s, s.desks[id as DeskId], m);
  return v;
}

// ---------------------------------------------------------------- liquidity / costs

/** Average daily volume (USD notional) used for market impact. */
export function adv(inst: Instrument): number {
  switch (inst.kind) {
    case 'stock':
      return inst.adv;
    case 'etf':
      return inst.adv;
    case 'eqFut':
      return 150e9;
    case 'eqOpt':
      return 3e9;
    case 'ust':
      return inst.maturity < 3 ? 60e9 : inst.maturity < 8 ? 50e9 : inst.maturity < 15 ? 45e9 : 15e9;
    case 'bondFut':
      return 80e9;
    case 'sofrFut':
      return 300e9;
    case 'irs':
      return 25e9;
    case 'fxFwd':
    case 'fxOpt':
      return ['USDMXN', 'USDBRL'].includes((inst as any).pair) ? 4e9 : 60e9;
    case 'corp':
      return inst.adv;
    case 'cds':
      return inst.issuer.startsWith('CDX') ? 20e9 : 300e6;
    case 'cmdtyFut':
      return inst.cmdty === 'WTI' ? 40e9 : inst.cmdty === 'GOLD' ? 30e9 : 5e9;
    case 'cmdtyOpt':
      return 2e9;
    case 'varSwap':
      return 2e9;
    case 'autocall':
      return 5e8;
  }
}

/** USD notional of one unit (for sizing, impact and display). */
export function unitNotional(s: GameState, inst: Instrument, m: MarketState = s.market): number {
  if (isFuture(inst)) {
    if (inst.kind === 'sofrFut') return 1e6;
    if (inst.kind === 'bondFut') return 1e5;
    return futPrice(inst, m) * futMult(inst);
  }
  switch (inst.kind) {
    case 'stock':
    case 'etf':
      return unitValue(inst, m);
    case 'eqOpt':
      return m.eq.spot[inst.underlying] * inst.mult;
    case 'cmdtyOpt':
      return cmdtyFwd(m, inst.cmdty, Math.max(0, inst.futExpiry - m.t)) * inst.mult;
    case 'fxFwd':
    case 'fxOpt':
      return usdPer(m, pairCcys(inst.pair)[0]);
    default:
      return 1; // per $1 face / notional
  }
}

/**
 * Market half-spread for a trade of `qty` units, in USD per unit, including size-dependent temporary
 * impact. This is what crossing the street costs, and what competing dealers price around.
 */
export function halfSpreadUnit(s: GameState, inst: Instrument, qty: number, m: MarketState = s.market): number {
  const L = m.liquidity;
  const notional = Math.abs(qty) * unitNotional(s, inst, m);
  const sizeFactor = 1 + 3 * Math.sqrt(notional / adv(inst));
  let h: number; // USD per unit at small size
  switch (inst.kind) {
    case 'stock':
      h = unitValue(inst, m) * (2.5 + 6 * inst.idioVol) / 1e4;
      break;
    case 'etf':
      h = unitValue(inst, m) * 0.6 / 1e4;
      break;
    case 'eqFut':
      h = 0.125 * inst.mult;
      break;
    case 'bondFut':
      h = (1 / 128) * inst.mult;
      break;
    case 'sofrFut':
      h = 0.0025 * inst.mult;
      break;
    case 'cmdtyFut': {
      const tick: Record<string, number> = { WTI: 0.01, NG: 0.001, GOLD: 0.1, COPPER: 0.0005, CORN: 0.0025 };
      h = tick[inst.cmdty] * inst.mult * 1.5;
      break;
    }
    case 'eqOpt':
    case 'cmdtyOpt':
    case 'fxOpt': {
      const v = unitValue(inst, m);
      const vega = vegaPerUnit(s, inst, m);
      h = Math.max(0.006 * v, 0.35 * vega) + 0.0005 * unitNotional(s, inst, m) * 0.01;
      break;
    }
    case 'ust': {
      const dur = Math.max(0.2, (inst.maturity - m.t) * 0.85);
      h = (0.15 * dur) / 1e4;
      break;
    }
    case 'corp': {
      const dur = Math.max(0.2, (inst.maturity - m.t) * 0.8);
      const sp = m.credit.spread[inst.issuer];
      h = ((sp > 250 ? 15 : 4) * dur) / 1e4;
      break;
    }
    case 'irs':
      h = (0.2 * annuity(m, inst.maturity - m.t)) / 1e4;
      break;
    case 'cds': {
      const idx = inst.issuer.startsWith('CDX');
      const sp = m.credit.spread[inst.issuer];
      h = ((idx ? (sp > 200 ? 1 : 0.25) : sp > 250 ? 4 : 1) * rpv01(m, sp, 0.4, inst.maturity - m.t)) / 1e4;
      break;
    }
    case 'fxFwd': {
      const em = ['USDMXN', 'USDBRL'].includes(inst.pair);
      const pips = em ? 15 : 0.8;
      h = (pips * PIP[inst.pair] * usdPer(m, pairCcys(inst.pair)[1]));
      break;
    }
    case 'varSwap':
      h = 2 * inst.strikeVol * 0.0035;
      break;
    case 'autocall':
      h = 0.0025;
      break;
  }
  return h * L * sizeFactor;
}

/** Spot FX half-spread in rate units (quote currency per base), size-dependent. */
export function fxSpotHalfSpread(m: MarketState, pair: string, baseQty: number): number {
  const em = ['USDMXN', 'USDBRL'].includes(pair);
  const usdNotional = Math.abs(baseQty) * usdPer(m, pairCcys(pair)[0]);
  const advv = em ? 4e9 : 80e9;
  return (em ? 10 : 0.4) * PIP[pair] * m.liquidity * (1 + 3 * Math.sqrt(usdNotional / advv));
}

export function vegaPerUnit(s: GameState, inst: Instrument, m: MarketState): number {
  const up = bumpVol(m, inst, 0.01);
  return Math.abs(unitValue(inst, up) - unitValue(inst, m));
}

function bumpVol(m: MarketState, inst: Instrument, dv: number): MarketState {
  const b: MarketState = { ...m, eq: { ...m.eq, atmVol: { ...m.eq.atmVol } }, fx: { ...m.fx, vol: { ...m.fx.vol } }, cmdty: { ...m.cmdty, vol: { ...m.cmdty.vol } } };
  if (inst.kind === 'eqOpt' || inst.kind === 'varSwap' || inst.kind === 'autocall') {
    const u = (inst as any).underlying;
    b.eq.atmVol[u] += dv;
  } else if (inst.kind === 'fxOpt') b.fx.vol[inst.pair] += dv;
  else if (inst.kind === 'cmdtyOpt') b.cmdty.vol[inst.cmdty] += dv;
  return b;
}

// ---------------------------------------------------------------- trade booking

export function getPos(d: Desk, instId: string, day: number): Position {
  if (!d.positions[instId]) d.positions[instId] = { instId, qty: 0, openedDay: day };
  return d.positions[instId];
}

function cleanup(d: Desk, instId: string) {
  const p = d.positions[instId];
  if (p && Math.abs(p.qty) < 1e-9) delete d.positions[instId];
}

let blotterSeq = 1;
export function blot(s: GameState, e: Omit<BlotterEntry, 'id'>) {
  s.blotter.push({ id: s.nextId++ || blotterSeq++, clock: s.clock, ...e });
  if (s.blotter.length > 400) s.blotter.splice(0, s.blotter.length - 400);
}

/**
 * Book a trade of `qty` units at `price` (in quotePrice units). Returns the P&L vs mid in USD
 * (positive = Atlas bought below / sold above mid).
 */
export function bookTrade(s: GameState, deskId: DeskId, inst: Instrument, qty: number, priceQuote: number, cpty: string, kind: BlotterEntry['kind']): number {
  const d = s.desks[deskId];
  const m = s.market;
  const mid = quotePrice(inst, m);
  const pos = getPos(d, inst.id, s.day);
  if (cpty !== 'street' && cpty !== 'flow') pos.cpty = cpty;
  let edge: number;
  if (isFuture(inst)) {
    const F = futPrice(inst, m);
    const mult = futMult(inst);
    // settle existing variation margin at the current price, then the new contracts vs trade price
    if (pos.qty && pos.ref !== undefined) addCash(d, 'USD', pos.qty * (F - pos.ref) * mult);
    addCash(d, 'USD', qty * (F - priceQuote) * mult);
    pos.qty += qty;
    pos.ref = F;
    edge = qty * (F - priceQuote) * mult;
  } else {
    const uv = unitValue(inst, m);
    const tradeUnit = uv + quoteToUnit(inst, priceQuote - mid, m);
    addCash(d, 'USD', -qty * tradeUnit);
    pos.qty += qty;
    edge = qty * (uv - tradeUnit);
  }
  cleanup(d, inst.id);
  blot(s, { day: s.day, desk: deskId, instId: inst.id, qty, price: priceQuote, mid, cpty, kind, pnl: edge });
  return edge;
}

/** Convert a difference in quoted units into USD per unit of the instrument. */
export function quoteToUnit(inst: Instrument, dq: number, m: MarketState): number {
  switch (inst.kind) {
    case 'ust':
    case 'corp':
    case 'cds':
      return dq / 100;
    case 'irs':
      // quoted as a swap rate (%): receiver value falls as the fixed rate… the trade uses dynamic fixed rates instead
      return -(dq / 100) * annuity(m, inst.maturity - m.t);
    case 'fxFwd':
      return dq * usdPer(m, pairCcys(inst.pair)[1]);
    default:
      return dq;
  }
}

export function unitToQuote(inst: Instrument, du: number, m: MarketState): number {
  switch (inst.kind) {
    case 'ust':
    case 'corp':
    case 'cds':
      return du * 100;
    case 'irs':
      return -(du * 100) / annuity(m, inst.maturity - m.t);
    case 'fxFwd':
      return du / usdPer(m, pairCcys(inst.pair)[1]);
    default:
      return du;
  }
}

/** Spot FX trade: buy `baseQty` of the base currency at `rate` (quote per base). Returns edge in USD. */
export function bookFxSpot(s: GameState, pair: string, baseQty: number, rate: number, cpty: string, kind: BlotterEntry['kind']): number {
  const d = s.desks.fx;
  const [b, q] = pairCcys(pair);
  addCash(d, b, baseQty);
  addCash(d, q, -baseQty * rate);
  const mid = s.market.fx.spot[pair];
  const edge = baseQty * (mid - rate) * usdPer(s.market, q);
  blot(s, { day: s.day, desk: 'fx', instId: `SPOT:${pair}`, qty: baseQty, price: rate, mid, cpty, kind, pnl: edge });
  return edge;
}

/**
 * Execute in the street (exchange / inter-dealer) at mid ± half-spread incl. impact. Moves the mid
 * for less liquid underlyings (permanent impact = half of the temporary cost).
 */
export function executeStreet(s: GameState, deskId: DeskId, instId: string, qty: number, kind: BlotterEntry['kind'] = 'hedge'): number {
  if (!qty) return 0;
  const m = s.market;
  if (instId.startsWith('SPOT:')) {
    const pair = instId.slice(5);
    const h = fxSpotHalfSpread(m, pair, qty);
    const rate = m.fx.spot[pair] + Math.sign(qty) * h;
    const edge = bookFxSpot(s, pair, qty, rate, 'street', kind);
    s.desks.fx.pnlToday.execution += edge;
    return edge;
  }
  const inst = s.instruments[instId];
  const hu = halfSpreadUnit(s, inst, qty, m);
  const mid = quotePrice(inst, m);
  const price = isFuture(inst) ? mid + (Math.sign(qty) * hu) / futMult(inst) : mid + unitToQuote(inst, Math.sign(qty) * hu, m);
  const edge = bookTrade(s, deskId, inst, qty, price, 'street', kind);
  s.desks[deskId].pnlToday.execution += edge;
  permanentImpact(s, inst, qty, hu);
  return edge;
}

/** Permanent price impact of our own trading in less liquid markets (affects our remaining inventory). */
export function permanentImpact(s: GameState, inst: Instrument, qty: number, hu: number) {
  const m = s.market;
  if (!['stock', 'corp', 'cds', 'cmdtyFut'].includes(inst.kind)) return;
  const before = firmValue(s);
  const frac = isFuture(inst) ? 0 : (0.5 * hu) / Math.max(1e-9, Math.abs(unitValue(inst, m)) || 1);
  const sgn = Math.sign(qty);
  if (inst.kind === 'stock') m.eq.spot[inst.id] *= 1 + sgn * Math.min(0.05, frac);
  else if (inst.kind === 'corp') m.credit.spread[inst.issuer] -= sgn * Math.min(50, frac * 1e4 / Math.max(0.5, (inst.maturity - m.t) * 0.8));
  else if (inst.kind === 'cds') m.credit.spread[inst.issuer] += sgn * Math.min(20, (0.5 * hu) / Math.max(0.1, rpv01(m, m.credit.spread[inst.issuer], 0.4, inst.maturity - m.t)) * 1e4);
  else if (inst.kind === 'cmdtyFut') m.cmdty.spot[inst.cmdty] *= 1 + sgn * Math.min(0.03, (0.5 * hu) / (futPrice(inst, m) * inst.mult));
  else return;
  const after = firmValue(s);
  // attribute the inventory revaluation caused by our own impact to execution costs of the trading desk
  if (Math.abs(after - before) > 1e-6) s.desks[inst.desk].pnlToday.execution += after - before;
}

// ---------------------------------------------------------------- end-of-day mechanics

/** Settle futures variation margin into cash (value-neutral). */
export function settleVariationMargin(s: GameState) {
  for (const id in s.desks) {
    const d = s.desks[id as DeskId];
    for (const pid in d.positions) {
      const inst = s.instruments[pid];
      if (!isFuture(inst)) continue;
      const p = d.positions[pid];
      const F = futPrice(inst, s.market);
      if (p.ref !== undefined) addCash(d, 'USD', p.qty * (F - p.ref) * futMult(inst));
      p.ref = F;
    }
  }
}

export interface AccrualBreakdown {
  funding: number;
  accrual: number;
  lines: { desk: DeskId; label: string; amount: number; cat: 'funding' | 'accrual' }[];
}

/** Initial margin a desk must post (futures, OTC derivatives), funded at the FTP spread. */
export function initialMargin(s: GameState, d: Desk, m: MarketState): number {
  let im = 0;
  for (const id in d.positions) {
    const inst = s.instruments[id];
    const q = Math.abs(d.positions[id].qty);
    const n = q * unitNotional(s, inst, m);
    switch (inst.kind) {
      case 'eqFut':
      case 'cmdtyFut':
        im += n * 0.06;
        break;
      case 'bondFut':
      case 'sofrFut':
        im += n * (inst.kind === 'bondFut' ? 0.025 : 0.003);
        break;
      case 'irs':
        im += n * 0.004 * Math.sqrt(Math.max(0.1, inst.maturity - m.t));
        break;
      case 'cds':
        im += n * 0.02;
        break;
      case 'eqOpt':
      case 'fxOpt':
      case 'cmdtyOpt':
        if (d.positions[id].qty < 0) im += n * 0.1;
        break;
      case 'fxFwd':
        im += n * 0.02;
        break;
      case 'varSwap':
        im += q * 0.02;
        break;
    }
  }
  return im;
}

/**
 * Daily accruals and funding for `days` calendar days (ACT/360 for money-market interest; coupon,
 * dividend and running-leg accruals use the same year fraction as the valuation clock).
 */
export function accrue(s: GameState, days: number): AccrualBreakdown {
  const m = s.market;
  const dt360 = days / 360;
  const dtYr = days / 365;
  const out: AccrualBreakdown = { funding: 0, accrual: 0, lines: [] };
  const sofr = m.rates.sofr;
  const post = (d: Desk, ccy: Ccy, amt: number, label: string, cat: 'funding' | 'accrual') => {
    if (!amt) return;
    addCash(d, ccy, amt);
    const usd = amt * usdPer(m, ccy);
    d.pnlToday[cat] += usd;
    out[cat] += usd;
    out.lines.push({ desk: d.id, label, amount: usd, cat });
  };
  for (const id in s.desks) {
    const d = s.desks[id as DeskId];
    // position-level accruals
    let secured = 0;
    let securedCost = 0;
    for (const pid in d.positions) {
      const inst = s.instruments[pid];
      const q = d.positions[pid].qty;
      if (!q) continue;
      switch (inst.kind) {
        case 'stock':
        case 'etf': {
          const uv = unitValue(inst, m);
          const div = inst.kind === 'stock' ? m.eq.div[inst.id] : m.eq.div.US500;
          post(d, 'USD', q * uv * div * dtYr, `Dividends ${inst.id}`, 'accrual');
          if (q > 0) {
            secured += q * uv * 0.8;
            securedCost += q * uv * 0.8 * (sofr + (m.rates.repoSpread + 30) / 1e4);
          } else post(d, 'USD', -Math.abs(q * uv) * 0.003 * dt360 * (inst.kind === 'stock' && inst.idioVol > 0.35 ? 4 : 1), `Stock borrow fee ${inst.id}`, 'funding');
          break;
        }
        case 'ust':
        case 'corp': {
          if (inst.kind === 'corp' && m.credit.defaulted[inst.issuer]) break;
          post(d, 'USD', q * inst.coupon * dtYr, `Coupon accrual ${inst.name}`, 'accrual');
          const mv = q * unitValue(inst, m);
          if (q > 0) {
            const hc = inst.kind === 'ust' ? 0.98 : 0.85;
            const spr = inst.kind === 'ust' ? m.rates.repoSpread : m.rates.repoSpread + 45;
            secured += mv * hc;
            securedCost += mv * hc * (sofr + spr / 1e4);
          } else post(d, 'USD', -Math.abs(mv) * (inst.kind === 'ust' ? 0.0015 : 0.006) * dt360, `Repo specialness / borrow ${inst.name}`, 'funding');
          break;
        }
        case 'irs':
          post(d, 'USD', q * (inst.fixed - sofr) * dtYr, `Swap net accrual ${inst.name}`, 'accrual');
          break;
        case 'cds':
          if (!m.credit.defaulted[inst.issuer]) post(d, 'USD', -q * (inst.coupon / 1e4) * dtYr, `CDS premium ${inst.name}`, 'accrual');
          break;
      }
    }
    // currency balances
    for (const c in d.cash) {
      const ccy = c as Ccy;
      const bal = d.cash[ccy] ?? 0;
      if (Math.abs(bal) < 1) continue;
      if (ccy === 'USD') {
        if (bal >= 0) post(d, 'USD', bal * Math.max(0, sofr - 0.001) * dt360, 'Interest on USD cash', 'funding');
        else {
          const need = -bal;
          const sec = Math.min(need, secured);
          const secRate = secured > 0 ? securedCost / secured : sofr;
          post(d, 'USD', -sec * secRate * dt360, 'Secured financing (repo / equity finance)', 'funding');
          post(d, 'USD', -(need - sec) * (sofr + m.rates.ftpSpread / 1e4) * dt360, 'Unsecured treasury funding (FTP)', 'funding');
        }
      } else {
        const r = m.rates.ccy[ccy];
        const rate = bal >= 0 ? Math.max(0, r - 0.001) : r + 0.001;
        post(d, ccy, bal * rate * dt360, `Interest on ${ccy} balance`, 'accrual');
      }
    }
    // margin funding: posting initial margin earns ~SOFR at the CCP but costs FTP
    const im = initialMargin(s, d, m);
    post(d, 'USD', -im * (m.rates.ftpSpread / 1e4) * dt360, 'Initial margin funding (MVA)', 'funding');
  }
  return out;
}

/** Settle expired/matured instruments at their terminal value (value-neutral). */
export function settleExpiries(s: GameState): string[] {
  const notes: string[] = [];
  const m = s.market;
  for (const id in s.desks) {
    const d = s.desks[id as DeskId];
    for (const pid of Object.keys(d.positions)) {
      const inst = s.instruments[pid];
      const T = expiryOf(inst);
      if (T === null || T > m.t + 1e-9) continue;
      const p = d.positions[pid];
      if (isFuture(inst)) {
        const F = futPrice(inst, m);
        if (p.ref !== undefined) addCash(d, 'USD', p.qty * (F - p.ref) * futMult(inst));
      } else if (inst.kind === 'ust' || inst.kind === 'corp') {
        if (!(inst.kind === 'corp' && m.credit.defaulted[inst.issuer])) addCash(d, 'USD', p.qty);
      } else {
        addCash(d, 'USD', positionValue(inst, p, m));
      }
      notes.push(`${inst.name} expired/matured: ${p.qty > 0 ? 'long' : 'short'} ${Math.abs(p.qty).toLocaleString()} settled.`);
      delete d.positions[pid];
    }
  }
  return notes;
}

export function expiryOf(inst: Instrument): number | null {
  switch (inst.kind) {
    case 'eqFut':
    case 'bondFut':
    case 'cmdtyFut':
    case 'eqOpt':
    case 'fxOpt':
    case 'cmdtyOpt':
    case 'varSwap':
      return inst.expiry;
    case 'sofrFut':
      return inst.start;
    case 'ust':
    case 'corp':
    case 'irs':
    case 'cds':
    case 'fxFwd':
      return inst.maturity;
    case 'autocall':
      return inst.obs[inst.obs.length - 1];
    default:
      return null;
  }
}

/** Process an issuer default: bonds fall to recovery, CDS protection pays (1 − R). Returns ΔV by desk. */
export function processDefault(s: GameState, issuer: string, recovery: number): Record<string, number> {
  const out: Record<string, number> = {};
  const m = s.market;
  for (const id in s.desks) {
    const d = s.desks[id as DeskId];
    const before = deskValue(s, d);
    for (const pid of Object.keys(d.positions)) {
      const inst = s.instruments[pid];
      if (inst.kind === 'cds' && inst.issuer === issuer) {
        addCash(d, 'USD', d.positions[pid].qty * (1 - recovery));
        delete d.positions[pid];
      }
    }
    m.credit.defaulted[issuer] = true;
    m.credit.recovery[issuer] = recovery;
    const after = deskValue(s, d);
    m.credit.defaulted[issuer] = false;
    if (Math.abs(after - before) > 1e-6) {
      d.pnlToday.defaults += after - before;
      out[id] = after - before;
    }
  }
  m.credit.defaulted[issuer] = true;
  return out;
}

export function fxNetPositions(s: GameState): Record<string, number> {
  // currency exposure of the FX desk (cash balances + forward/option deltas are computed in risk)
  const out: Record<string, number> = {};
  for (const c in s.desks.fx.cash) if (c !== 'USD') out[c] = s.desks.fx.cash[c as Ccy] ?? 0;
  return out;
}

export { quotePrice, unitValue, positionValue, isFuture, futPrice, futMult };
