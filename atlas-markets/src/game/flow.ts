// Electronic flow businesses. Each desk streams prices to clients electronically: high volume at a
// thin captured spread. The net imbalance of that flow lands in inventory — and part of it is
// informed, so it tends to be on the wrong side of tomorrow's move (adverse selection). Tighter
// pricing attracts more volume but also more toxic flow. A desk auto-hedges a share of the residual.

import { addCash, blot, bookFxSpot, bookTrade, executeStreet, unitNotional } from '../engine/book';
import { frontFuture } from '../engine/instruments';
import { pairCcys, PAIRS, REGIMES, STOCKS, usdPer } from '../engine/market';
import { quotePrice, unitValue } from '../engine/pricing';
import { bump, summarise } from '../engine/risk';
import { pick, rand, randNormal } from '../engine/rng';
import type { DeskId, GameState, LogItem } from '../engine/types';

const BASE_VOL: Partial<Record<DeskId, number>> = { eq: 2.6e9, rates: 5e9, fx: 9e9, credit: 5e8, cmdty: 6e8 };
const BASE_BP: Partial<Record<DeskId, number>> = { eq: 1.1, rates: 0.25, fx: 0.18, credit: 4, cmdty: 0.8 };

function deskSkill(s: GameState, d: DeskId) {
  const t = s.traders.filter((x) => x.desk === d);
  if (!t.length) return 0.2;
  return t.reduce((a, b) => a + b.skill, 0) / t.length;
}

export interface FlowResult {
  desk: DeskId;
  volume: number;
  capture: number;
  imbalance: number;
  hedged: number;
  internalised: number;
}

/** Instruments a desk's electronic flow trades — inventory in these can be offset against flow. */
function flowEligible(s: GameState, desk: DeskId, instId: string): boolean {
  const i = s.instruments[instId];
  if (!i) return false;
  if (desk === 'eq') return i.kind === 'stock' || i.kind === 'etf';
  if (desk === 'rates') return i.kind === 'ust';
  if (desk === 'credit') return i.kind === 'corp';
  if (desk === 'cmdty') return i.kind === 'cmdtyFut';
  return false;
}

/** Offset up to `capacity` USD of existing inventory against client flow (at mid: the spread is already in flow capture). */
export function internaliseInventory(s: GameState, desk: DeskId, capacity: number): number {
  const m = s.market;
  const d = s.desks[desk];
  let left = capacity;
  let done = 0;
  if (desk === 'fx') {
    for (const c of Object.keys(d.cash)) {
      if (c === 'USD' || left <= 0) continue;
      const bal = d.cash[c as keyof typeof d.cash] ?? 0;
      const usd = bal * usdPer(m, c as any);
      const take = Math.sign(usd) * Math.min(Math.abs(usd) * 0.5, left);
      if (Math.abs(take) < 1e5) continue;
      const pair = PAIRS.find((p) => p.includes(c))!;
      const [b] = pairCcys(pair);
      const baseQty = b === c ? -take / usdPer(m, c as any) : take;
      bookFxSpot(s, pair, baseQty, m.fx.spot[pair], 'flow', 'flow');
      left -= Math.abs(take);
      done += Math.abs(take);
    }
    return done;
  }
  const items = Object.values(d.positions)
    .filter((p) => flowEligible(s, desk, p.instId))
    .map((p) => ({ p, n: p.qty * unitNotional(s, s.instruments[p.instId], m) }))
    .sort((a, b) => Math.abs(b.n) - Math.abs(a.n));
  for (const { p, n } of items) {
    if (left <= 0) break;
    const take = Math.min(Math.abs(n) * 0.5, left);
    const inst = s.instruments[p.instId];
    let q = (-Math.sign(n) * take) / unitNotional(s, inst, m);
    if (inst.kind === 'cmdtyFut') q = Math.round(q);
    if (!q) continue;
    bookTrade(s, desk, inst, q, quotePrice(inst, m), 'flow', 'flow');
    left -= take;
    done += take;
  }
  return done;
}

export function runFlow(s: GameState): FlowResult[] {
  const out: FlowResult[] = [];
  const m = s.market;
  if (s.desks.exotics.unlocked && s.desks.exotics.autoHedge > 0 && Object.keys(s.desks.exotics.positions).length) autoHedge(s, 'exotics', s.desks.exotics.autoHedge);
  for (const id of Object.keys(BASE_VOL) as DeskId[]) {
    const d = s.desks[id];
    if (!d.unlocked) continue;
    const skill = deskSkill(s, id);
    const stress = m.liquidity;
    const volume = BASE_VOL[id]! * (s.share[id] / 0.06) * (0.7 + 0.3 * d.tech) * Math.pow(d.flowSpread, -1.5) * Math.pow(stress, -0.3) * (0.8 + 0.4 * rand(s));
    const hbp = BASE_BP[id]! * stress * d.flowSpread * (0.85 + 0.3 * skill);
    const capture = (volume * hbp) / 1e4;
    // toxic share: tighter pricing and weaker traders attract more informed flow
    const tox = Math.min(0.6, (0.22 / d.flowSpread) * (1.2 - 0.6 * skill) * (m.regime === 'crisis' ? 1.5 : 1));
    const legs = 3;
    let imbalance = 0;
    addCash(d, 'USD', capture);
    d.pnlToday.flow += capture;
    // internalisation: skew prices so the day's two-way flow works down existing inventory
    const internalised = internaliseInventory(s, id, volume * 0.06 * (0.8 + 0.4 * skill));
    for (let i = 0; i < legs; i++) {
      const legNotional = (volume / legs) * Math.abs(0.025 * randNormal(s) + 0.008);
      let key: string;
      let instId: string;
      if (id === 'eq') {
        const st = pick(s, STOCKS);
        instId = rand(s) < 0.3 ? 'USLC' : st.id;
        key = instId === 'USLC' ? 'etf' : `eq:${st.id}`;
      } else if (id === 'rates') {
        instId = pick(s, ['UST2Y', 'UST5Y', 'UST10Y']);
        key = 'rates:term';
      } else if (id === 'fx') {
        const pair = pick(s, PAIRS as unknown as string[]);
        instId = `SPOT:${pair}`;
        key = `fx:${pair}`;
      } else if (id === 'credit') {
        const bonds = Object.values(s.instruments).filter((x) => x.kind === 'corp' && !m.credit.defaulted[x.issuer]);
        const b = pick(s, bonds) as any;
        instId = b.id;
        key = `cr:${b.issuer}`;
      } else {
        const f = frontFuture(s, (x) => x.kind === 'cmdtyFut' && (x as any).cmdty === pick(s, ['WTI', 'GOLD']));
        if (!f) continue;
        instId = f.id;
        key = `cm:${(f as any).cmdty}`;
      }
      // informed fraction trades with tomorrow's move; Atlas takes the other side
      const sig = Math.sign(s.pendingIdio[key] ?? (s.pendingShock ? s.pendingShock.g : 0)) || 1;
      let clientDir = rand(s) < 0.5 + tox * 0.5 ? sig : -sig;
      // bonds: clients *sell* bonds when spreads will widen (sig>0 means widening for credit keys)
      if (id === 'credit' || id === 'rates') clientDir = -clientDir;
      const atlasDir = -clientDir;
      if (instId.startsWith('SPOT:')) {
        const pair = instId.slice(5);
        const q = (atlasDir * legNotional) / usdPer(m, pairCcys(pair)[0]);
        bookFxSpot(s, pair, q, m.fx.spot[pair], 'flow', 'flow');
      } else {
        const inst = s.instruments[instId];
        const unit = unitNotional(s, inst, m);
        let q = (atlasDir * legNotional) / unit;
        if (inst.kind === 'cmdtyFut') q = Math.round(q);
        if (!q) continue;
        bookTrade(s, id, inst, q, quotePrice(inst, m), 'flow', 'flow');
      }
      imbalance += atlasDir * legNotional;
    }
    // auto-hedge a share of the day's net flow risk via the most liquid proxy
    let hedged = 0;
    if (d.autoHedge > 0) hedged = autoHedge(s, id, d.autoHedge);
    blot(s, { day: s.day, desk: id, instId: 'E-FLOW', qty: volume, price: 0, mid: 0, cpty: 'flow', kind: 'flow', pnl: capture });
    out.push({ desk: id, volume, capture, imbalance, hedged, internalised });
  }
  return out;
}

/** Hedge a fraction of a desk's primary risk with its most liquid instrument. */
export function autoHedge(s: GameState, desk: DeskId, frac: number): number {
  const m = s.market;
  const r = summarise(s, desk);
  let cost = 0;
  if (desk === 'eq') {
    const es = frontFuture(s, (i) => i.kind === 'eqFut');
    if (es) {
      const per = quotePrice(es, m) * 50 * 0.01;
      const q = Math.round((-r.eqDelta * frac) / per);
      if (q) cost += executeStreet(s, desk, es.id, q, 'hedge');
    }
  } else if (desk === 'rates') {
    const ty = frontFuture(s, (i) => i.kind === 'bondFut' && i.id.startsWith('TY'));
    if (ty) {
      const per = 85; // ≈ $ per bp per 10Y note future
      const q = Math.round((r.dv01 * frac) / per);
      if (q) cost += executeStreet(s, desk, ty.id, q, 'hedge');
    }
  } else if (desk === 'fx') {
    for (const c in r.fxExposure) {
      if (c === 'USD') continue;
      const exp = r.fxExposure[c];
      const pair = PAIRS.find((p) => p.includes(c))!;
      const [b] = pairCcys(pair);
      const usdNotional = -exp * frac;
      const baseQty = b === c ? usdNotional / usdPer(m, c as any) : -usdNotional;
      if (Math.abs(usdNotional) > 1e6) cost += executeStreet(s, desk, `SPOT:${pair}`, baseQty, 'hedge');
    }
  } else if (desk === 'credit') {
    const cs = r.cs01;
    if (Math.abs(cs) > 1000) {
      const per = 4.6e-4; // ≈ CS01 per $1 of CDX IG 5Y protection
      cost += executeStreet(s, desk, 'CDX-IG', (-cs * frac) / per, 'hedge');
    }
  } else if (desk === 'exotics') {
    // vega first (option hedges carry delta), then re-measure and hedge the delta
    const vega = r.greeks.sens['vol:US500'] ?? 0;
    const atm = Object.values(s.instruments)
      .filter((i) => i.kind === 'eqOpt' && !i.dynamic && i.cp === 'C' && i.expiry > m.t + 0.12)
      .sort((a: any, b: any) => Math.abs(a.strike - m.eq.spot.US500) - Math.abs(b.strike - m.eq.spot.US500))[0];
    if (atm && Math.abs(vega) > 1e4) {
      const v1 = unitValue(atm, bump(m, 'vol:US500', 0.01)) - unitValue(atm, m);
      const q = Math.round((-vega * frac) / v1);
      if (q) cost += executeStreet(s, desk, atm.id, q, 'hedge');
    }
    const es = frontFuture(s, (i) => i.kind === 'eqFut');
    const eqD = summarise(s, desk).eqDelta;
    if (es && Math.abs(eqD) > 1e4) {
      const per = quotePrice(es, m) * 50 * 0.01;
      const q = Math.round((-eqD * Math.max(frac, 0.9)) / per);
      if (q) cost += executeStreet(s, desk, es.id, q, 'hedge');
    }
  } else if (desk === 'cmdty') {
    for (const c in r.cmdtyDelta) {
      const f = frontFuture(s, (i) => i.kind === 'cmdtyFut' && (i as any).cmdty === c);
      if (!f) continue;
      const per = quotePrice(f, m) * (f as any).mult * 0.01;
      const q = Math.round((-r.cmdtyDelta[c] * frac) / per);
      if (q) cost += executeStreet(s, desk, f.id, q, 'hedge');
    }
  }
  return cost;
}

/** Working orders execute a slice each day (smaller slices → less impact, more time risk). */
export function runOrders(s: GameState): LogItem[] {
  const notes: LogItem[] = [];
  for (const o of s.orders) {
    if (o.daysLeft <= 0 || !o.qtyRemaining) continue;
    const slice = o.qtyRemaining / o.daysLeft;
    const inst = s.instruments[o.instId];
    const q = inst && (inst.kind === 'eqFut' || inst.kind === 'cmdtyFut' || inst.kind === 'bondFut' || inst.kind === 'sofrFut') ? Math.round(slice) : slice;
    const cost = executeStreet(s, o.desk, o.instId, q, 'unwind');
    o.qtyRemaining -= q;
    o.daysLeft--;
    notes.push({ day: s.day, text: `Working order ${o.note}: executed ${Math.abs(q).toLocaleString(undefined, { maximumFractionDigits: 0 })} (${o.daysLeft} day${o.daysLeft === 1 ? '' : 's'} left), cost ${Math.round(cost).toLocaleString()}`, tone: 'neutral' });
  }
  s.orders = s.orders.filter((o) => o.daysLeft > 0 && Math.abs(o.qtyRemaining) > 1e-6);
  return notes;
}

export { REGIMES };
