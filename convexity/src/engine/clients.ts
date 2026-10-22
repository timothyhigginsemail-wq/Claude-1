// Institutional clients, RFQ generation and the competitive quote-acceptance model.

import { ASSETS, AssetId, DAY, MarketView, SPECS, TICKS_PER_DAY, atmImplied, dayDrift, df, forward, parSwapRate } from './market';
import { AutocallInst, Instrument, unitPV, autocallMC, MC_PATHS_BOOK } from './pricing';
import { halfSpread } from './book';
import { Rng, clamp, hash32, normCdf, rngFor } from './math';
import { instrumentRisk } from './risk';

export type Family = 'delta1' | 'vanilla' | 'fx' | 'barrier' | 'digital' | 'swap' | 'autocall';
export type ClientType = 'pension' | 'privatebank' | 'macro' | 'volrv' | 'corporate' | 'insurer' | 'familyoffice';

export interface ClientSpec {
  id: string;
  name: string;
  type: ClientType;
  blurb: string;
  sophistication: number; // 0..1 – how sharply they compare prices
  tolerance: number; // max margin they accept, in multiples of street margin
  informed: number; // 0..1 – correlation of their direction with tomorrow's market
  templates: [Template, number][];
  size: [number, number]; // USD millions
}
export type Template = 'protect_put' | 'overwrite' | 'macro_option' | 'vol_seller' | 'kiput' | 'digital_call' | 'uo_call' | 'fx_forward' | 'fx_put' | 'irs' | 'autocall_note' | 'single_note';

export const CLIENTS: ClientSpec[] = [
  { id: 'northgate', name: 'Northgate Pension', type: 'pension', blurb: 'UK DB scheme. Buys protection, receives long swaps, rarely argues price but remembers who shows up.', sophistication: 0.35, tolerance: 1.6, informed: 0, templates: [['protect_put', 5], ['irs', 3], ['overwrite', 2]], size: [15, 60] },
  { id: 'aurelia', name: 'Aurelia Private Bank', type: 'privatebank', blurb: 'Swiss private bank distributing yield notes to wealthy clients. Wants the highest coupon on the street.', sophistication: 0.6, tolerance: 1.3, informed: 0, templates: [['autocall_note', 6], ['single_note', 3], ['protect_put', 1]], size: [10, 50] },
  { id: 'sable', name: 'Sable Macro', type: 'macro', blurb: 'Discretionary macro fund. Fast, sharp and often right — winning everything they show is a warning sign.', sophistication: 0.9, tolerance: 1.05, informed: 0.55, templates: [['macro_option', 6], ['digital_call', 2], ['kiput', 2], ['fx_put', 1]], size: [10, 45] },
  { id: 'cobalt', name: 'Cobalt Ridge', type: 'volrv', blurb: 'Volatility relative-value fund. Sells vol when it is rich, buys when it is cheap. Assume they ran the numbers.', sophistication: 0.95, tolerance: 1.0, informed: 0.25, templates: [['vol_seller', 7], ['uo_call', 1]], size: [10, 40] },
  { id: 'kestrel', name: 'Kestrel Industries', type: 'corporate', blurb: 'US manufacturer with large euro revenues. Hedges FX on a programme, values a reliable counterparty.', sophistication: 0.3, tolerance: 1.8, informed: 0, templates: [['fx_forward', 6], ['fx_put', 3], ['irs', 1]], size: [20, 120] },
  { id: 'meridian', name: 'Meridian Life', type: 'insurer', blurb: 'Insurer hedging variable-annuity guarantees: long-dated puts and duration.', sophistication: 0.5, tolerance: 1.4, informed: 0, templates: [['protect_put', 4], ['irs', 4], ['kiput', 1]], size: [20, 80] },
  { id: 'halcyon', name: 'Halcyon Family Office', type: 'familyoffice', blurb: 'Yield-hungry family office. Overwrites calls, buys capped upside, likes a story.', sophistication: 0.45, tolerance: 1.5, informed: 0.05, templates: [['overwrite', 4], ['uo_call', 3], ['single_note', 2], ['digital_call', 1]], size: [5, 30] },
];
export const clientById = (id: string) => CLIENTS.find((c) => c.id === id)!;

export const FAMILY_OF: Record<Template, Family> = {
  protect_put: 'vanilla', overwrite: 'vanilla', macro_option: 'vanilla', vol_seller: 'vanilla', kiput: 'barrier', digital_call: 'digital', uo_call: 'barrier', fx_forward: 'fx', fx_put: 'fx', irs: 'swap', autocall_note: 'autocall', single_note: 'autocall',
};

export type QuoteKind = 'premium' | 'rate' | 'fwd' | 'coupon';

export interface Rfq {
  id: string;
  client: string;
  template: Template;
  day: number;
  tick: number;
  expires: number; // absolute tick index (day*TICKS + tick)
  inst: Instrument;
  deskQty: number; // units the desk would trade if it wins (+ desk buys)
  notional: number; // USD
  clientSide: 'buys' | 'sells' | 'receives' | 'pays';
  kind: QuoteKind;
  streetMargin: number; // typical dealer margin, fraction of notional
  note: string;
  status: 'open' | 'quoted' | 'won' | 'lost' | 'passed' | 'expired';
  quote?: number; // quoted metric (premium % / rate / fwd / coupon p.a.)
  quoteEdge?: number; // desk edge at quote, fraction of notional
  respondAt?: number;
  outcome?: string;
  coverEdge?: number;
  coverQuote?: number; // best competing level in quote terms, at quote time
  decided?: { won: boolean; reason: string }; // fixed when the quote is sent, revealed at respondAt
  big?: boolean;
}

const absTick = (day: number, tick: number) => day * (TICKS_PER_DAY + 1) + tick;
export const nowTick = absTick;

function roundStrike(a: AssetId, k: number) {
  const step = { ORX: 25, NKT: 1, AUR: 25, EURUSD: 0.0025 }[a];
  return Math.round(k / step) * step;
}
/** Expiry at the close of a trading day, `days` from today. */
const expiryIn = (day: number, days: number) => (day + days + 1) * DAY;
export const notionalPerUnit = (inst: Instrument, view: MarketView): number => {
  if (inst.type === 'swap' || inst.type === 'autocall') return 1;
  if (inst.type === 'digital') return SPECS[inst.asset].ccy === 'EUR' ? view.spot.EURUSD : 1; // notional = payout
  return unitPV({ type: 'spot', asset: inst.asset }, view);
};

// ---------------------------------------------------------------- quote metric ↔ desk edge

/** Desk edge (fraction of notional) earned if trading at quote metric q. */
export function edgeAtQuote(r: Rfq, q: number, view: MarketView): number {
  const npu = notionalPerUnit(r.inst, view);
  switch (r.kind) {
    case 'premium': {
      const mid = unitPV(r.inst, view);
      const px = (q / 100) * npu;
      return (r.deskQty * (mid - px)) / (Math.abs(r.deskQty) * npu);
    }
    case 'rate': {
      const inst = { ...(r.inst as Extract<Instrument, { type: 'swap' }>), fixed: q / 100 };
      return (r.deskQty * unitPV(inst, view)) / Math.abs(r.deskQty);
    }
    case 'fwd': {
      const inst = { ...(r.inst as Extract<Instrument, { type: 'forward' }>), strike: q };
      return (r.deskQty * unitPV(inst, view)) / (Math.abs(r.deskQty) * npu);
    }
    case 'coupon': {
      const inst = r.inst as AutocallInst;
      const ppy = 1 / (inst.obs[1] - inst.obs[0]);
      const res = autocallMC({ ...inst, coupon: q / 100 / ppy }, view, MC_PATHS_BOOK);
      return 1 - res.pv;
    }
  }
}

/** Inverse: the quote metric that gives desk edge e. */
export function quoteForEdge(r: Rfq, e: number, view: MarketView): number {
  const npu = notionalPerUnit(r.inst, view);
  switch (r.kind) {
    case 'premium': {
      const mid = unitPV(r.inst, view);
      const px = mid - (Math.sign(r.deskQty) * e * npu);
      return (px / npu) * 100;
    }
    case 'rate': {
      const s = r.inst as Extract<Instrument, { type: 'swap' }>;
      let ann = 0;
      for (let y = s.paid + 1; s.start + y <= s.end + 1e-9; y++) ann += df(view.curve, s.start + y - view.t);
      const flt = 1 - df(view.curve, s.end - view.t);
      // deskQty·(K·ann − flt) = e·|deskQty|
      const K = (Math.sign(r.deskQty) * e + flt) / ann;
      return K * 100;
    }
    case 'fwd': {
      const f = r.inst as Extract<Instrument, { type: 'forward' }>;
      const T = Math.max(0, f.expiry - view.t);
      const F = forward(view, 'EURUSD', T);
      const D = df(view.curve, T);
      return F - (Math.sign(r.deskQty) * e * npu) / D;
    }
    case 'coupon': {
      const inst = r.inst as AutocallInst;
      const ppy = 1 / (inst.obs[1] - inst.obs[0]);
      const res = autocallMC({ ...inst, coupon: 0 }, view, MC_PATHS_BOOK);
      const c = (1 - e - res.pvExCoupon) / Math.max(res.couponAnnuity, 1e-9);
      return Math.max(0, c * ppy * 100);
    }
  }
}

/** Instrument as it will be booked for a given quote. */
export function bookedInstrument(r: Rfq, q: number): { inst: Instrument; px: number } {
  switch (r.kind) {
    case 'premium':
      return { inst: r.inst, px: NaN };
    case 'rate':
      return { inst: { ...(r.inst as Extract<Instrument, { type: 'swap' }>), fixed: q / 100 }, px: 0 };
    case 'fwd':
      return { inst: { ...(r.inst as Extract<Instrument, { type: 'forward' }>), strike: q }, px: 0 };
    case 'coupon': {
      const inst = r.inst as AutocallInst;
      const ppy = 1 / (inst.obs[1] - inst.obs[0]);
      return { inst: { ...inst, coupon: q / 100 / ppy }, px: 1 };
    }
  }
}

// ---------------------------------------------------------------- competition

/** Dispersion of competing dealers' model values, as a fraction of street margin. Exotics disagree more. */
const NOISE = (r: Rfq) => (r.kind === 'coupon' ? 0.55 : r.inst.type === 'barrier' || r.inst.type === 'digital' ? 0.4 : 0.25);

interface Competition {
  best: number; // best competing dealer edge (fraction of notional) — lower is better for client
  reservation: number; // max edge the client will pay at all
  relBonus: number;
}

function competition(r: Rfq, seed: number, relationship: number, liq: number): Competition {
  const c = clientById(r.client);
  const rng = rngFor(seed, r.id, 'comp');
  const m = r.streetMargin;
  let best = Infinity;
  const nDealers = c.sophistication > 0.7 ? 4 : 3;
  for (let j = 0; j < nDealers; j++) {
    const aggr = rng.range(0.8, 1.6);
    const modelNoise = rng.normal() * m * NOISE(r);
    best = Math.min(best, m * aggr * Math.sqrt(liq) + modelNoise);
  }
  const reservation = m * c.tolerance * (1 + 0.25 * rng.normal()) * Math.sqrt(liq) + m * 0.3;
  const relBonus = ((relationship - 50) / 50) * 0.25 * m * (1 - c.sophistication * 0.6);
  return { best, reservation, relBonus };
}

/** Sales' honest estimate of hit probability for a given desk edge (uses the dealer distribution, not the draws). */
export function hitProbability(r: Rfq, edge: number, relationship: number, liq: number): number {
  const c = clientById(r.client);
  const m = r.streetMargin;
  const n = c.sophistication > 0.7 ? 4 : 3;
  // approximate each dealer's edge as normal(mean m·0.95·√liq, sd)
  const mu = m * 1.2 * Math.sqrt(liq);
  const sd = Math.sqrt((m * 0.231 * Math.sqrt(liq)) ** 2 + (m * NOISE(r)) ** 2);
  const relBonus = ((relationship - 50) / 50) * 0.25 * m * (1 - c.sophistication * 0.6);
  const eff = edge - relBonus;
  const pBeatOne = 1 - normCdf((eff - mu) / sd);
  const pBeatAll = Math.pow(pBeatOne, n);
  const resMu = m * c.tolerance * Math.sqrt(liq) + m * 0.3;
  const pRes = 1 - normCdf((eff - resMu) / (m * c.tolerance * 0.25 * Math.sqrt(liq) + 1e-12));
  return clamp(pBeatAll * pRes, 0, 1);
}

export function resolveQuote(r: Rfq, seed: number, relationship: number, liq: number): { won: boolean; cover: number; reason: string } {
  const comp = competition(r, seed, relationship, liq);
  const eff = (r.quoteEdge ?? 0) - comp.relBonus;
  if (eff > comp.reservation) return { won: false, cover: comp.best, reason: 'client passed — level too wide for them' };
  if (eff <= comp.best) return { won: true, cover: comp.best, reason: 'best price' };
  return { won: false, cover: comp.best, reason: 'traded away' };
}

// ---------------------------------------------------------------- generation

export interface GenCtx {
  seed: number;
  day: number;
  tick: number;
  view: MarketView;
  liq: number;
  families: Set<Family>;
  rfqCount: number;
  realizedVol: Record<AssetId, number>;
}

export function streetMarginFor(inst: Instrument, deskQty: number, view: MarketView, liq: number): number {
  if (inst.type === 'autocall') return 0.0125 + 0.002 * inst.assets.length;
  if (inst.type === 'swap') {
    let ann = 0;
    for (let y = 1; inst.start + y <= inst.end + 1e-9; y++) ann += df(view.curve, inst.start + y - view.t);
    return ann * 0.6e-4;
  }
  if (inst.type === 'forward') return 2.5e-4;
  const npu = notionalPerUnit(inst, view);
  const risk = instrumentRisk(inst, view);
  return (halfSpread(inst, deskQty, view, 1, risk) / npu) * 1.3;
}

export function generateRfq(ctx: GenCtx, clientId: string, template: Template, rng: Rng, big = false): Rfq | null {
  const c = clientById(clientId);
  const { view, day } = ctx;
  const sizeM = big ? c.size[1] * rng.range(1.6, 2.4) : rng.range(c.size[0], c.size[1]);
  const notional = Math.round(sizeM) * 1e6;
  const id = `R${day}-${ctx.tick}-${ctx.rfqCount}`;
  let inst: Instrument;
  let deskQty: number;
  let clientSide: Rfq['clientSide'];
  let kind: QuoteKind = 'premium';
  let note = '';
  const drift = dayDrift(ctx.seed, day) + dayDrift(ctx.seed, day + 1) + rng.normal() * (1 - c.informed) * 1.6;
  const pickEq = (w: [number, number, number]) => rng.weighted(['ORX', 'NKT', 'AUR'] as AssetId[], w);
  const units = (a: AssetId) => notional / unitPV({ type: 'spot', asset: a }, view);
  switch (template) {
    case 'protect_put': {
      const a = pickEq([5, 0.6, 2.5]);
      const days = rng.pick([63, 126, 252]);
      const mny = rng.pick([0.9, 0.95, 0.95, 0.85]);
      inst = { type: 'vanilla', asset: a, cp: 'P', strike: roundStrike(a, view.spot[a] * mny), expiry: expiryIn(day, days) };
      deskQty = -units(a);
      clientSide = 'buys';
      note = `${c.name} adding downside protection on ${SPECS[a].long}.`;
      break;
    }
    case 'overwrite': {
      const a = pickEq([3, 3, 1.5]);
      const days = rng.pick([21, 42, 63]);
      inst = { type: 'vanilla', asset: a, cp: 'C', strike: roundStrike(a, view.spot[a] * rng.pick([1.04, 1.05, 1.08])), expiry: expiryIn(day, days) };
      deskQty = units(a);
      clientSide = 'sells';
      note = `Overwriting: ${c.name} sells upside on its ${SPECS[a].name} holdings for yield.`;
      break;
    }
    case 'macro_option': {
      const a = pickEq([3, 3, 1.5]);
      const bull = drift > 0;
      const days = rng.pick([10, 21, 21, 42]);
      inst = { type: 'vanilla', asset: a, cp: bull ? 'C' : 'P', strike: roundStrike(a, view.spot[a] * (bull ? rng.pick([1.02, 1.03, 1.05]) : rng.pick([0.98, 0.97, 0.95]))), expiry: expiryIn(day, days) };
      deskQty = -units(a);
      clientSide = 'buys';
      note = `${c.name} wants ${bull ? 'upside' : 'downside'} in ${SPECS[a].name}, short-dated. Fast money — they'll hit the best screen.`;
      break;
    }
    case 'vol_seller': {
      const a = pickEq([3, 2.5, 2]);
      const T = 21 / 252;
      const imp = atmImplied(view, a, T);
      const rv = ctx.realizedVol[a] || imp;
      const rich = imp / rv;
      // they sell when implied looks rich vs realised, buy when cheap
      const sell = rich > 1.08 ? true : rich < 0.95 ? false : rng.chance(0.6);
      const days = rng.pick([21, 42, 63]);
      inst = { type: 'vanilla', asset: a, cp: rng.chance(0.5) ? 'P' : 'C', strike: roundStrike(a, forward(view, a, days / 252)), expiry: expiryIn(day, days) };
      deskQty = sell ? units(a) : -units(a);
      clientSide = sell ? 'sells' : 'buys';
      note = `${c.name} ${sell ? 'selling' : 'buying'} ATM ${SPECS[a].name} vol. Implied ${(imp * 100).toFixed(1)} vs realised ${(rv * 100).toFixed(1)}.`;
      break;
    }
    case 'kiput': {
      const a = pickEq([4, 2, 2]);
      const days = rng.pick([63, 126]);
      const S = view.spot[a];
      inst = { type: 'barrier', asset: a, cp: 'P', strike: roundStrike(a, S * 0.97), barrier: roundStrike(a, S * rng.pick([0.85, 0.88, 0.9])), dir: 'down', kind: 'in', expiry: expiryIn(day, days) };
      deskQty = -units(a);
      clientSide = 'buys';
      note = `Cheap crash protection: a down-and-in put on ${SPECS[a].name}. Only pays if the barrier trades.`;
      break;
    }
    case 'uo_call': {
      const a = pickEq([3, 3, 1.5]);
      const days = rng.pick([63, 126]);
      const S = view.spot[a];
      inst = { type: 'barrier', asset: a, cp: 'C', strike: roundStrike(a, S * 1.0), barrier: roundStrike(a, S * rng.pick([1.12, 1.15, 1.2])), dir: 'up', kind: 'out', expiry: expiryIn(day, days) };
      deskQty = -units(a);
      clientSide = 'buys';
      note = `${c.name} wants capped upside in ${SPECS[a].name} — an up-and-out call, cheaper than vanilla.`;
      break;
    }
    case 'digital_call': {
      const a = pickEq([4, 2, 1]);
      const days = rng.pick([21, 42, 63]);
      const up = drift > -0.5;
      inst = { type: 'digital', asset: a, cp: up ? 'C' : 'P', strike: roundStrike(a, view.spot[a] * (up ? 1.03 : 0.97)), expiry: expiryIn(day, days) };
      // notional = payout; units = payout in asset ccy (1 per unit)
      const payout = notional / (SPECS[a].ccy === 'EUR' ? view.spot.EURUSD : 1);
      deskQty = -payout;
      clientSide = 'buys';
      note = `Binary bet: pays ${(notional / 1e6).toFixed(0)}m if ${SPECS[a].name} finishes ${up ? 'above' : 'below'} the strike.`;
      break;
    }
    case 'fx_forward': {
      const days = rng.pick([63, 126, 252]);
      const T = days / 252;
      const F = forward(view, 'EURUSD', T);
      inst = { type: 'forward', asset: 'EURUSD', expiry: expiryIn(day, days), strike: F };
      const eur = notional / view.spot.EURUSD;
      deskQty = eur; // client sells EUR forward → desk buys EUR forward
      clientSide = 'sells';
      kind = 'fwd';
      note = `${c.name} hedging euro receivables: sells EUR ${(eur / 1e6).toFixed(0)}m forward.`;
      break;
    }
    case 'fx_put': {
      const days = rng.pick([63, 126]);
      const S = view.spot.EURUSD;
      inst = { type: 'vanilla', asset: 'EURUSD', cp: 'P', strike: roundStrike('EURUSD', S * 0.98), expiry: expiryIn(day, days) };
      deskQty = -notional / S;
      clientSide = 'buys';
      note = `${c.name} buying EUR puts to protect the budget rate.`;
      break;
    }
    case 'irs': {
      const tenor = rng.pick([5, 10, 10, 20]);
      const receive = c.type !== 'corporate' && rng.chance(0.75);
      const start = Math.ceil(view.t / DAY) * DAY;
      inst = { type: 'swap', start: view.t, end: view.t + tenor, fixed: parSwapRate(view.curve, tenor), paid: 0 };
      void start;
      deskQty = receive ? -notional : notional; // client receives fixed → desk pays fixed (short receiver)
      clientSide = receive ? 'receives' : 'pays';
      kind = 'rate';
      note = receive ? `${c.name} extending duration: receives fixed ${tenor}Y.` : `${c.name} locking in funding: pays fixed ${tenor}Y.`;
      break;
    }
    case 'autocall_note':
    case 'single_note': {
      const worst = template === 'autocall_note';
      const combos: AssetId[][] = [['ORX', 'NKT'], ['ORX', 'AUR'], ['NKT', 'AUR'], ['ORX', 'NKT', 'AUR']];
      const assets = worst ? rng.weighted(combos, [4, 3, 2, 1.5]) : [rng.weighted(['ORX', 'NKT', 'AUR'] as AssetId[], [3, 3, 1])];
      const years = rng.pick([2, 3, 3]);
      const obs: number[] = [];
      for (let k = 1; k <= years * 4; k++) obs.push((day + k * 63 + 1) * DAY); // quarterly, at the close
      const ki = rng.pick([0.55, 0.6, 0.6, 0.65]);
      const inst0: AutocallInst = { type: 'autocall', assets, initial: assets.map((a) => view.spot[a]), obs, callFrom: 1, autocall: 1, couponBarrier: rng.pick([0.7, 0.7, 0.75, 0.8]), coupon: 0.02, memory: rng.chance(0.6), ki, next: 0, missed: 0, seed: hash32(ctx.seed, id) };
      inst = inst0;
      deskQty = -notional;
      clientSide = 'buys';
      kind = 'coupon';
      note = `${c.name} placing a ${years}Y ${worst ? 'worst-of ' : ''}${assets.map((a) => SPECS[a].name).join('/')} autocallable with its clients. Quote the coupon you'll pay at par.`;
      break;
    }
  }
  const r: Rfq = { id, client: clientId, template, day, tick: ctx.tick, expires: absTick(day, ctx.tick) + rng.int(5, 10) + (kind === 'coupon' ? 8 : 0), inst: inst!, deskQty: deskQty!, notional, clientSide: clientSide!, kind, streetMargin: 0, note, status: 'open', big };
  r.streetMargin = streetMarginFor(r.inst, r.deskQty, view, 1);
  return r;
}

export function pickRfq(ctx: GenCtx, rng: Rng): Rfq | null {
  const eligible: { c: ClientSpec; t: Template; w: number }[] = [];
  for (const c of CLIENTS) for (const [t, w] of c.templates) if (ctx.families.has(FAMILY_OF[t])) eligible.push({ c, t, w });
  if (!eligible.length) return null;
  const e = rng.weighted(eligible, eligible.map((x) => x.w));
  return generateRfq(ctx, e.c.id, e.t, rng);
}

export function realizedVolFromCloses(closes: { spot: Record<AssetId, number> }[], intraday: Record<AssetId, number[]>): Record<AssetId, number> {
  const out = {} as Record<AssetId, number>;
  for (const a of ASSETS) {
    const xs = closes.slice(-15).map((c) => c.spot[a]);
    const last = intraday[a][intraday[a].length - 1];
    if (last) xs.push(last);
    if (xs.length < 4) {
      out[a] = 0;
      continue;
    }
    let s = 0;
    for (let i = 1; i < xs.length; i++) s += Math.log(xs[i] / xs[i - 1]) ** 2;
    out[a] = Math.sqrt((s / (xs.length - 1)) * 252);
  }
  return out;
}
