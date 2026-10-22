// Positions, execution, lifecycle events and P&L accounting.
//
// Book value V = cash + Σ qty·unitPV. Every change in V is booked to exactly one P&L bucket:
//   edge (client trades vs mid) · costs (hedge execution vs mid) · carry (cash interest, dividends, swap float)
//   · market (re-marking existing positions). Lifecycle cash flows move value between a position and cash
//   without creating P&L. Conservation is unit-tested.

import { ASSETS, AssetId, DAY, MarketView, SPECS, df, shortRate } from './market';
import { AutocallInst, Instrument, describeInstrument, unitPV } from './pricing';
import { Risk, addRisk, instrumentRisk, zeroRisk } from './risk';

export type Source = 'client' | 'hedge' | 'interdesk' | 'forced' | 'initial';

export interface Position {
  id: string;
  inst: Instrument;
  qty: number;
  avgPx: number;
  realized: number;
  unitPv: number;
  risk: Risk | null; // per unit
  riskAt: number; // view.t when risk computed
  source: Source;
  client?: string;
  label: string;
  openedT: number;
  closedT?: number;
  edge: number; // day-one P&L booked at inception
  pnlDay: number; // P&L attributable to this position today
}

export interface Trade {
  id: string;
  t: number;
  day: number;
  tick: number;
  posId: string;
  label: string;
  qty: number;
  px: number;
  mid: number;
  source: Source;
  client?: string;
  edge: number; // (+) money made vs mid
}

export interface PnlBuckets {
  edge: number;
  costs: number;
  carry: number;
  market: number;
  // greek explain of `market`
  delta: number;
  gamma: number;
  vega: number;
  theta: number;
  rates: number;
  corr: number;
  cross: number;
}
export const zeroBuckets = (): PnlBuckets => ({ edge: 0, costs: 0, carry: 0, market: 0, delta: 0, gamma: 0, vega: 0, theta: 0, rates: 0, corr: 0, cross: 0 });
export const bucketTotal = (b: PnlBuckets) => b.edge + b.costs + b.carry + b.market;

export interface Book {
  cash: number;
  positions: Position[];
  closed: Position[];
  trades: Trade[];
  nextId: number;
  today: PnlBuckets;
  life: PnlBuckets;
  valueOpen: number; // book value at today's open
  intradayPnl: number[];
  dailyPnl: { day: number; pnl: number; b: PnlBuckets }[];
  risk: Risk;
  deltaByAssetPrev?: Record<AssetId, number>;
  lifecycle: { t: number; text: string }[];
}

export function newBook(): Book {
  return { cash: 0, positions: [], closed: [], trades: [], nextId: 1, today: zeroBuckets(), life: zeroBuckets(), valueOpen: 0, intradayPnl: [0], dailyPnl: [], risk: zeroRisk(), lifecycle: [] };
}

export const bookValue = (b: Book) => b.cash + b.positions.reduce((a, p) => a + p.qty * p.unitPv, 0);
export const instKey = (i: Instrument) => JSON.stringify(i.type === 'autocall' ? { ...i, next: 0, missed: 0 } : i);
export const positionPnl = (p: Position) => p.realized + p.qty * (p.unitPv - p.avgPx);

// ---------------------------------------------------------------- execution costs

const SIZE_REF: Record<AssetId, number> = { ORX: 250e6, NKT: 40e6, AUR: 180e6, EURUSD: 600e6 };
const VOL_SPREAD: Record<AssetId, number> = { ORX: 0.25, NKT: 0.55, AUR: 0.3, EURUSD: 0.15 };

/** Half-spread (USD per unit) to cross for `qty` units of an instrument at liquidity multiplier `liq`. */
export function halfSpread(inst: Instrument, qty: number, view: MarketView, liq: number, risk?: Risk | null): number {
  const absQ = Math.abs(qty);
  switch (inst.type) {
    case 'spot':
    case 'forward': {
      const a = inst.asset;
      const px = unitPV({ type: 'spot', asset: a }, view);
      const notional = absQ * px;
      return px * (SPECS[a].spreadBp / 1e4) * liq * (1 + 0.8 * Math.sqrt(notional / SIZE_REF[a]));
    }
    case 'vanilla':
    case 'digital':
    case 'barrier': {
      const a = inst.asset;
      const r = risk ?? instrumentRisk(inst, view);
      const px = unitPV({ type: 'spot', asset: a }, view);
      const notional = absQ * px;
      const mult = inst.type === 'vanilla' ? 1 : 2.5;
      const volPts = VOL_SPREAD[a] * mult * liq * (1 + 0.6 * Math.sqrt(notional / (2 * SIZE_REF[a])));
      return Math.abs(r.vega[a]) * volPts + Math.abs(r.delta[a]) * 100 * (SPECS[a].spreadBp / 1e4) + (inst.type === 'digital' ? 0.002 * liq : 0);
    }
    case 'swap': {
      let ann = 0;
      for (let y = inst.paid + 1; inst.start + y <= inst.end + 1e-9; y++) ann += df(view.curve, inst.start + y - view.t);
      return ann * 0.25e-4 * liq * (1 + absQ / 1e9);
    }
    case 'autocall':
      return 0.0125 * liq;
  }
}

// ---------------------------------------------------------------- booking

export interface BookCtx {
  view: MarketView;
  day: number;
  tick: number;
  liq: number;
}

function newPosition(book: Book, inst: Instrument, qty: number, px: number, mid: number, source: Source, ctx: BookCtx, client?: string): Position {
  return {
    id: `P${book.nextId++}`,
    inst,
    qty,
    avgPx: px,
    realized: 0,
    unitPv: mid,
    risk: null,
    riskAt: -1,
    source,
    client,
    label: describeInstrument(inst, (t) => tenorLabel(t - ctx.view.t)),
    openedT: ctx.view.t,
    edge: qty * (mid - px),
    pnlDay: qty * (mid - px),
  };
}

/** Execute a trade of `qty` units at price `px` (USD per unit). Positive qty = the desk buys. */
export function executeTrade(book: Book, inst: Instrument, qty: number, px: number, source: Source, ctx: BookCtx, opts: { client?: string; net?: boolean; mid?: number; posId?: string } = {}): { pos: Position; trade: Trade } {
  const mid = opts.mid ?? unitPV(inst, ctx.view);
  const edge = qty * (mid - px);
  book.cash -= qty * px;
  if (source === 'client') {
    book.today.edge += edge;
    book.life.edge += edge;
  } else {
    book.today.costs += edge;
    book.life.costs += edge;
  }
  let pos: Position | undefined;
  if (opts.posId) pos = book.positions.find((p) => p.id === opts.posId);
  else if (opts.net !== false && source !== 'client') {
    const key = instKey(inst);
    pos = book.positions.find((p) => p.source !== 'client' && instKey(p.inst) === key);
  }
  if (pos) {
    // bring the existing units to the same mark first (any difference is market P&L)
    const d = pos.qty * (mid - pos.unitPv);
    book.today.market += d;
    book.life.market += d;
    book.today.cross += d;
    pos.pnlDay += d + edge;
    pos.unitPv = mid;
    // average-cost netting; realise on reduction
    if (Math.sign(pos.qty) === Math.sign(qty) || pos.qty === 0) {
      pos.avgPx = (pos.avgPx * pos.qty + px * qty) / (pos.qty + qty);
      pos.qty += qty;
    } else {
      const closing = Math.min(Math.abs(qty), Math.abs(pos.qty)) * Math.sign(qty);
      pos.realized += -closing * (px - pos.avgPx);
      pos.qty += closing;
      const rest = qty - closing;
      if (Math.abs(rest) > 1e-12) {
        pos.avgPx = px;
        pos.qty = rest;
      }
    }
    pos.unitPv = mid;
    if (Math.abs(pos.qty) < 1e-9) closePosition(book, pos, ctx.view.t);
  } else {
    pos = newPosition(book, inst, qty, px, mid, source, ctx, opts.client);
    book.positions.push(pos);
  }
  const trade: Trade = { id: `T${book.trades.length + 1}`, t: ctx.view.t, day: ctx.day, tick: ctx.tick, posId: pos.id, label: pos.label, qty, px, mid, source, client: opts.client, edge };
  book.trades.push(trade);
  if (book.trades.length > 300) book.trades.shift();
  return { pos, trade };
}

function closePosition(book: Book, pos: Position, t: number) {
  pos.closedT = t;
  pos.qty = 0;
  book.positions = book.positions.filter((p) => p !== pos);
  book.closed.unshift(pos);
  if (book.closed.length > 60) book.closed.pop();
}

/** Pay/receive a lifecycle cash flow for a position: value moves from position into cash. */
function settle(book: Book, pos: Position, cashPerUnit: number) {
  const amt = cashPerUnit * pos.qty;
  book.cash += amt;
  pos.realized += amt;
}
const addDay = (p: Position, d: number) => {
  p.pnlDay += d;
};

// ---------------------------------------------------------------- marking, carry, P&L explain

/** Re-mark positions to `view`. Attributes ΔV of existing positions to market buckets using per-unit risk from before the move. */
export function markToMarket(book: Book, prev: MarketView, view: MarketView, opts: { refreshRisk: (p: Position) => boolean }) {
  let dMarket = 0;
  const moves = ASSETS.map((a) => (view.spot[a] / prev.spot[a] - 1) * 100);
  const dvol = ASSETS.map((a) => {
    // ATM 3M vol change, points, as the vega driver
    const s0 = prev.smile[a];
    const s1 = view.smile[a];
    return (approxAtm(s1) - approxAtm(s0)) * 100;
  });
  const dr = (view.curve.b0 - prev.curve.b0) * 1e4;
  const dcorr = (view.eqCorr - prev.eqCorr) * 100;
  const dtDays = (view.t - prev.t) / DAY;
  for (const p of book.positions) {
    const pv1 = unitPV(p.inst, view);
    const d = p.qty * (pv1 - p.unitPv);
    dMarket += d;
    p.pnlDay += d;
    const r = p.risk;
    if (r) {
      let explained = 0;
      ASSETS.forEach((a, i) => {
        const de = p.qty * r.delta[a] * moves[i];
        const ga = p.qty * 0.5 * r.gamma[a] * moves[i] * moves[i];
        const ve = p.qty * r.vega[a] * dvol[i];
        const cr = p.qty * r.vanna[a] * moves[i] * dvol[i];
        book.today.delta += de;
        book.today.gamma += ga;
        book.today.vega += ve;
        book.today.cross += cr;
        explained += de + ga + ve + cr;
      });
      const th = p.qty * r.theta * dtDays;
      const ra = p.qty * r.dv01 * dr;
      const co = p.qty * r.corr01 * dcorr;
      book.today.theta += th;
      book.today.rates += ra;
      book.today.corr += co;
      explained += th + ra + co;
      book.today.cross += d - explained; // residual (higher order, smile dynamics, MC noise)
    } else book.today.cross += d;
    p.unitPv = pv1;
  }
  book.today.market += dMarket;
  book.life.market += dMarket;
  for (const p of book.positions) if (opts.refreshRisk(p) || !p.risk) {
    p.risk = instrumentRisk(p.inst, view);
    p.riskAt = view.t;
  }
  aggregateRisk(book);
}

function approxAtm(s: { v: number; theta: number; lr: number; vrp: number; shift?: number }) {
  const T = 0.25;
  const kappa = 25;
  const w = (1 - Math.exp(-kappa * T)) / (kappa * T);
  const blend = 1 - Math.exp(-T);
  const th2 = s.theta * s.theta + (s.lr * s.lr - s.theta * s.theta) * blend;
  return Math.sqrt(w * s.v * s.v + (1 - w) * th2) * (1 + s.vrp * (0.75 + 0.25 * Math.exp(-T / 0.5))) + (s.shift ?? 0);
}

export function aggregateRisk(book: Book) {
  const agg = zeroRisk();
  for (const p of book.positions) if (p.risk) addRisk(agg, p.risk, p.qty);
  agg.pv = book.positions.reduce((a, p) => a + p.qty * p.unitPv, 0);
  book.risk = agg;
}

/** Interest on cash, dividends on equity holdings, EUR interest, swap floating legs. dt in years. */
export function accrueCarry(book: Book, view: MarketView, dt: number) {
  const interest = book.cash * shortRate(view.curve) * dt;
  let flows = 0;
  for (const p of book.positions) {
    const i = p.inst;
    let u = 0;
    if (i.type === 'spot') u = SPECS[i.asset].kind === 'fx' ? view.spot.EURUSD * view.eurRate * dt : unitPV(i, view) * SPECS[i.asset].div * dt;
    else if (i.type === 'swap' && view.t >= i.start && view.t < i.end) u = -shortRate(view.curve) * dt;
    if (u !== 0) {
      settle(book, p, u);
      flows += u * p.qty;
      p.pnlDay += u * p.qty;
    }
  }
  book.cash += interest;
  book.today.carry += interest + flows;
  book.life.carry += interest + flows;
}

// ---------------------------------------------------------------- lifecycle

export function processLifecycle(book: Book, view: MarketView, closeOfDay: boolean): string[] {
  const msgs: string[] = [];
  const t = view.t;
  for (const p of [...book.positions]) {
    const i = p.inst;
    const S = i.type !== 'swap' && i.type !== 'autocall' ? view.spot[i.asset] : 0;
    const conv = (a: AssetId, x: number) => (SPECS[a].ccy === 'EUR' ? x * view.spot.EURUSD : x);
    if (i.type === 'barrier' && !i.hit) {
      const breached = i.dir === 'down' ? S <= i.barrier : S >= i.barrier;
      if (breached) {
        const before = p.unitPv;
        i.hit = true;
        const after = unitPV(i, view);
        // the barrier event itself is a market move: re-mark at the continuous-monitoring value
        const d = p.qty * (after - before);
        book.today.market += d;
        book.life.market += d;
        book.today.cross += d;
        addDay(p, d);
        p.unitPv = after;
        p.risk = null;
        msgs.push(`${p.label}: barrier ${i.dir === 'down' ? 'breached' : 'touched'} — ${i.kind === 'in' ? 'knocked IN, now a vanilla' : 'knocked OUT, worthless'}`);
        if (i.kind === 'out') {
          closePosition(book, p, t);
          continue;
        }
      }
    }
    if ((i.type === 'vanilla' || i.type === 'digital' || i.type === 'barrier' || i.type === 'forward') && t >= i.expiry - 1e-9 && closeOfDay) {
      let pay = 0;
      if (i.type === 'vanilla' || i.type === 'barrier') {
        const alive = i.type === 'vanilla' || (i.kind === 'in' ? !!i.hit : !i.hit);
        pay = alive ? Math.max(i.cp === 'C' ? S - i.strike : i.strike - S, 0) : 0;
      } else if (i.type === 'digital') pay = (i.cp === 'C' ? S > i.strike : S < i.strike) ? 1 : 0;
      else pay = S - i.strike;
      const cashPerUnit = SPECS[i.asset].kind === 'fx' ? pay : conv(i.asset, pay);
      // final re-mark to intrinsic is market P&L; the payment itself is value-neutral
      const d = p.qty * (cashPerUnit - p.unitPv);
      book.today.market += d;
      book.life.market += d;
      book.today.cross += d;
      addDay(p, d);
      p.unitPv = cashPerUnit;
      settle(book, p, cashPerUnit);
      msgs.push(`${p.label} expired ${pay > 0 ? `in the money (${fmtUsd(cashPerUnit * p.qty)})` : 'worthless'}`);
      closePosition(book, p, t);
      continue;
    }
    if (i.type === 'swap') {
      while (i.start + i.paid + 1 <= t + 1e-9 && i.start + i.paid + 1 <= i.end + 1e-9) {
        i.paid += 1;
        settle(book, p, i.fixed);
        msgs.push(`${p.label}: fixed coupon ${fmtUsd(i.fixed * p.qty)}`);
      }
      if (t >= i.end - 1e-9) {
        p.unitPv = 0;
        closePosition(book, p, t);
        msgs.push(`${p.label} matured`);
      }
      continue;
    }
    if (i.type === 'autocall' && closeOfDay) {
      const res = observeAutocall(i, view);
      if (res) {
        const before = p.unitPv;
        settle(book, p, res.cash);
        // after the observation the note is worth its remaining value; value moved into cash
        const after = res.done ? 0 : unitPV(i, view);
        const d = p.qty * (after + res.cash - before);
        book.today.market += d;
        book.life.market += d;
        book.today.cross += d;
        addDay(p, d);
        p.unitPv = after;
        p.risk = null;
        msgs.push(`${p.label}: ${res.text}`);
        if (res.done) closePosition(book, p, t);
      }
    }
  }
  if (msgs.length) for (const m of msgs) book.lifecycle.unshift({ t, text: m });
  if (book.lifecycle.length > 50) book.lifecycle.length = 50;
  aggregateRisk(book);
  return msgs;
}

/** Apply an observation date if one has been reached. Returns cash per unit notional paid to the holder. */
export function observeAutocall(i: AutocallInst, view: MarketView): { cash: number; done: boolean; text: string } | null {
  if (i.done || i.next >= i.obs.length) return null;
  if (view.t < i.obs[i.next] - 1e-9) return null;
  const perf = i.assets.map((a, k) => view.spot[a] / i.initial[k]);
  const worst = Math.min(...perf);
  const isLast = i.next === i.obs.length - 1;
  const k = i.next;
  i.next += 1;
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  if (!isLast && k >= i.callFrom && worst >= i.autocall) {
    const c = i.coupon * (1 + (i.memory ? i.missed : 0));
    i.done = true;
    return { cash: 1 + c, done: true, text: `AUTOCALLED at worst-of ${pct(worst)} — pays 100% + ${pct(c)}` };
  }
  let cash = 0;
  let text: string;
  if (worst >= i.couponBarrier) {
    cash = i.coupon * (1 + (i.memory ? i.missed : 0));
    i.missed = 0;
    text = `observation ${k + 1}: worst-of ${pct(worst)}, coupon ${pct(cash)} paid`;
  } else {
    i.missed += 1;
    text = `observation ${k + 1}: worst-of ${pct(worst)} below coupon barrier — no coupon`;
  }
  if (isLast) {
    const principal = worst >= i.ki ? 1 : worst;
    cash += principal;
    i.done = true;
    text += worst >= i.ki ? ' · matured, capital returned' : ` · KNOCKED IN, holder receives ${pct(principal)}`;
    return { cash, done: true, text };
  }
  return { cash, done: false, text };
}

// ---------------------------------------------------------------- day roll

export function closeBookDay(book: Book, day: number) {
  const total = bucketTotal(book.today);
  book.dailyPnl.push({ day, pnl: total, b: { ...book.today } });
  if (book.dailyPnl.length > 400) book.dailyPnl.shift();
}
export function openBookDay(book: Book) {
  book.today = zeroBuckets();
  for (const p of book.positions) p.pnlDay = 0;
  book.valueOpen = bookValue(book);
  book.intradayPnl = [0];
}

// ---------------------------------------------------------------- formatting helpers (shared with UI)

export function tenorLabel(T: number): string {
  const d = Math.round(T / DAY);
  if (d <= 0) return 'exp';
  if (d < 21) return `${d}d`;
  if (d < 252) return `${Math.round(d / 21)}M`;
  const y = d / 252;
  return Math.abs(y - Math.round(y)) < 0.05 ? `${Math.round(y)}Y` : `${y.toFixed(1)}Y`;
}
export function fmtUsd(x: number, dp = 0): string {
  const s = x < 0 ? '−' : '';
  const a = Math.abs(x);
  if (a >= 1e9) return `${s}$${(a / 1e9).toFixed(2)}bn`;
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(a >= 1e8 ? 0 : 2)}m`;
  if (a >= 1e3) return `${s}$${(a / 1e3).toFixed(a >= 1e5 ? 0 : 1)}k`;
  return `${s}$${a.toFixed(dp)}`;
}
