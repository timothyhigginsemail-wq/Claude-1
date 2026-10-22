// Listed hedge instruments and hedge-ratio solvers.

import { AssetId, DAY, EQUITIES, MarketView, SPECS, forward, parSwapRate } from './market';
import { Instrument } from './pricing';
import { Risk, instrumentRisk } from './risk';
import { Book, halfSpread } from './book';
import { tenorLabel } from './book';

export interface HedgeInst {
  key: string;
  label: string;
  group: 'Delta-one' | 'Options' | 'Rates';
  asset?: AssetId;
  inst: Instrument;
}

const futExpiry = (day: number) => Math.ceil((day + 8) / 63) * 63 * DAY;
const monthly = (day: number, minDays: number) => Math.ceil((day + minDays) / 21) * 21 * DAY;

export function listedStrike(a: AssetId, k: number) {
  const step = { ORX: 50, NKT: 2.5, AUR: 50, EURUSD: 0.005 }[a];
  return Math.round(k / step) * step;
}

export function optionExpiries(day: number) {
  return [monthly(day, 8), monthly(day, 55), monthly(day, 120)];
}

export function hedgeUniverse(view: MarketView, day: number): HedgeInst[] {
  const out: HedgeInst[] = [];
  const fe = futExpiry(day);
  out.push({ key: 'ORX-fut', label: `ORX future ${tenorLabel(fe - view.t)}`, group: 'Delta-one', asset: 'ORX', inst: { type: 'forward', asset: 'ORX', expiry: fe, strike: 0 } });
  out.push({ key: 'AUR-fut', label: `AUR future ${tenorLabel(fe - view.t)}`, group: 'Delta-one', asset: 'AUR', inst: { type: 'forward', asset: 'AUR', expiry: fe, strike: 0 } });
  out.push({ key: 'NKT-spot', label: 'NKT shares', group: 'Delta-one', asset: 'NKT', inst: { type: 'spot', asset: 'NKT' } });
  out.push({ key: 'EUR-spot', label: 'EURUSD spot', group: 'Delta-one', asset: 'EURUSD', inst: { type: 'spot', asset: 'EURUSD' } });
  for (const tenor of [2, 5, 10]) out.push({ key: `IRS-${tenor}`, label: `USD swap ${tenor}Y (receive)`, group: 'Rates', inst: { type: 'swap', start: view.t, end: view.t + tenor, fixed: parSwapRate(view.curve, tenor), paid: 0 } });
  return out;
}

/**
 * Index futures are modelled as prepaid forwards (strike 0): PV = F·DF, so all lots of one contract net into a
 * single position. Economically identical to a margined future once the financing of the cash is included.
 * Swaps are struck at par when traded.
 */
export function freshen(inst: Instrument, view: MarketView): Instrument {
  if (inst.type === 'swap') {
    const tenor = Math.round(inst.end - inst.start);
    return { ...inst, start: view.t, end: view.t + tenor, fixed: parSwapRate(view.curve, tenor) };
  }
  return inst;
}

export function listedOption(a: AssetId, cp: 'C' | 'P', moneyness: number, expiry: number, view: MarketView): Instrument {
  return { type: 'vanilla', asset: a, cp, strike: listedStrike(a, view.spot[a] * moneyness), expiry };
}

export interface HedgeLeg {
  inst: Instrument;
  qty: number;
  label: string;
}
export interface HedgeProposal {
  id: string;
  title: string;
  legs: HedgeLeg[];
  why: string;
  cost: number; // estimated crossing cost, USD (positive = cost)
  residual: Partial<Risk>;
}

function deltaOneFor(a: AssetId, view: MarketView, day: number): Instrument {
  if (a === 'NKT') return { type: 'spot', asset: 'NKT' };
  if (a === 'EURUSD') return { type: 'spot', asset: 'EURUSD' };
  return freshen({ type: 'forward', asset: a, expiry: futExpiry(day), strike: 0 }, view);
}

export function costOf(legs: HedgeLeg[], view: MarketView, liq: number) {
  return legs.reduce((a, l) => a + Math.abs(l.qty) * halfSpread(l.inst, l.qty, view, liq), 0);
}

export function proposeHedges(book: Book, view: MarketView, day: number, liq: number, label: (i: Instrument) => string): HedgeProposal[] {
  const R = book.risk;
  const out: HedgeProposal[] = [];
  const assets: AssetId[] = ['ORX', 'NKT', 'AUR', 'EURUSD'];
  const exp3m = optionExpiries(day)[1];
  for (const a of assets) {
    const d = R.delta[a];
    if (Math.abs(d) < 5e3) continue;
    const h = deltaOneFor(a, view, day);
    const hr = instrumentRisk(h, view);
    const qty = -d / hr.delta[a];
    const legs = [{ inst: h, qty, label: label(h) }];
    out.push({ id: `delta-${a}`, title: `Delta-neutral ${SPECS[a].name}`, legs, why: `Flattens ${fmtK(d)}/1% of ${SPECS[a].name} delta with ${label(h)}. Leaves gamma and vega untouched.`, cost: costOf(legs, view, liq), residual: { delta: { ...R.delta, [a]: 0 } as Risk['delta'] } });
  }
  for (const a of EQUITIES) {
    const g = R.gamma[a];
    if (Math.abs(g) < 3e3) continue;
    // gamma with a near-dated ATM option, then re-flatten delta
    const opt = listedOption(a, 'C', 1, optionExpiries(day)[0], view);
    const or = instrumentRisk(opt, view);
    const qo = -g / or.gamma[a];
    const h = deltaOneFor(a, view, day);
    const hr = instrumentRisk(h, view);
    const qd = -(R.delta[a] + qo * or.delta[a]) / hr.delta[a];
    const legs = [{ inst: opt, qty: qo, label: label(opt) }, { inst: h, qty: qd, label: label(h) }];
    out.push({ id: `gamma-${a}`, title: `Delta-gamma ${SPECS[a].name}`, legs, why: `Neutralises ${fmtK(g)} gamma with front-month ATM calls (adds ${fmtK(qo * or.vega[a])} vega, ${fmtK(qo * or.theta)}/day theta), then re-flattens delta.`, cost: costOf(legs, view, liq), residual: {} });
  }
  for (const a of assets) {
    const v = R.vega[a];
    if (Math.abs(v) < 5e3) continue;
    const opt = listedOption(a, 'C', 1, exp3m, view);
    const or = instrumentRisk(opt, view);
    const qo = -v / or.vega[a];
    const h = deltaOneFor(a, view, day);
    const hr = instrumentRisk(h, view);
    const qd = -(R.delta[a] + qo * or.delta[a]) / hr.delta[a];
    const legs = [{ inst: opt, qty: qo, label: label(opt) }, { inst: h, qty: qd, label: label(h) }];
    out.push({ id: `vega-${a}`, title: `Vega-neutral ${SPECS[a].name}`, legs, why: `Offsets ${fmtK(v)}/vol pt with 3M ATM options. Term-structure and skew exposure remain — exotics' vega sits at different strikes and maturities.`, cost: costOf(legs, view, liq), residual: {} });
  }
  if (Math.abs(R.dv01) > 2e3) {
    const sw = freshen({ type: 'swap', start: view.t, end: view.t + 5, fixed: 0, paid: 0 }, view);
    const sr = instrumentRisk(sw, view);
    const q = -R.dv01 / sr.dv01;
    const legs = [{ inst: sw, qty: q, label: label(sw) }];
    out.push({ id: 'dv01', title: 'Flatten DV01', legs, why: `Neutralises ${fmtK(R.dv01)}/bp of parallel rate risk with a 5Y swap. Curve-shape risk remains.`, cost: costOf(legs, view, liq), residual: {} });
  }
  return out;
}

export function fmtK(x: number) {
  const a = Math.abs(x);
  const s = x < 0 ? '−' : '+';
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(2)}m`;
  return `${s}$${(a / 1e3).toFixed(a >= 1e5 ? 0 : 1)}k`;
}
