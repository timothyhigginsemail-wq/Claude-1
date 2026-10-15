// Client RFQs: generation, the economics of a quote, competition and execution, and hedge ideas.
//
// A quote's half-spread compensates the dealer for (1) the cost of hedging or unwinding the risk in
// the street at this size, and (2) a charge for residual risk it can't hedge cheaply (idiosyncratic,
// basis, liquidity or vol risk) — less any benefit if the trade offsets existing inventory (an "axe").
// Competing dealers price the same way, with their own appetite. Some clients are informed: their
// side is correlated with tomorrow's idiosyncratic move, so winning their flow carries adverse selection.

import { addCash, blot, bookFxSpot, bookTrade, executeStreet, fxSpotHalfSpread, halfSpreadUnit, unitNotional, vegaPerUnit } from '../engine/book';
import { frontFuture, newAutocall, newEqOpt, newFxFwd, newFxOpt, newSwap, newVarSwap, newCmdtyOpt } from '../engine/instruments';
import { ccyDF, CMDTYS, PAIRS, PIP, pairCcys, REGIMES, STOCKS, usdPer } from '../engine/market';
import { annuity, autocallPayoffPV, eqForward, fxForward, futMult, isFuture, quotePrice, rpv01, sofrDF, swapPar, unitValue, varSwapValue } from '../engine/pricing';
import { rand, randNormal, pick } from '../engine/rng';
import { factorKeys, bump } from '../engine/risk';
import type { Client, DeskId, GameState, Instrument, Rfq } from '../engine/types';
import { fm } from '../engine/format';

const lognormal = (s: GameState, sd: number) => Math.exp(randNormal(s) * sd);

// ---------------------------------------------------------------- generation

const TIMES = ['07:42', '08:05', '08:41', '09:12', '09:37', '10:05', '10:43', '11:18', '11:52', '12:30', '13:10', '13:45', '14:15', '14:50', '15:20', '15:47'];

function clientPool(s: GameState): Client[] {
  return Object.values(s.clients).filter((c) => !c.defaulted && c.desks.some((d) => s.desks[d].unlocked));
}

function weightedPick<T>(s: GameState, items: T[], w: (t: T) => number): T {
  const ws = items.map(w);
  const tot = ws.reduce((a, b) => a + b, 0);
  let u = rand(s) * tot;
  for (let i = 0; i < items.length; i++) {
    u -= ws[i];
    if (u <= 0) return items[i];
  }
  return items[items.length - 1];
}

/** Direction an informed client trades: + buys (expects price up). */
function informedSide(s: GameState, c: Client, key: string | null): number {
  const sig = key ? s.pendingIdio[key] ?? 0 : 0;
  if (key && rand(s) < c.informed * 0.8 && Math.abs(sig) > 0.2) return Math.sign(sig);
  return rand(s) < 0.5 ? 1 : -1;
}

/** RFQs being generated this morning (s.rfqs still holds yesterday's until generation finishes). */
let batch: Rfq[] = [];

export function generateRfqs(s: GameState, n: number): Rfq[] {
  const out: Rfq[] = [];
  batch = out;
  const pool = clientPool(s);
  if (!pool.length) return out;
  const idx = TIMES.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rand(s) * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  const times = idx.slice(0, n).sort((a, b) => a - b).map((i) => TIMES[i]);
  for (let i = 0; i < n; i++) {
    const c = weightedPick(s, pool, (x) => x.activity * (0.4 + x.share * 4) * (0.6 + x.relationship / 100));
    const desks = c.desks.filter((d) => s.desks[d].unlocked && s.desks[d].restrictedUntil <= s.day);
    if (!desks.length) continue;
    const desk = pick(s, desks);
    const r = makeRfq(s, c, desk, times[i % times.length]);
    if (r) out.push(r);
  }
  return out.sort((a, b) => a.time.localeCompare(b.time));
}

export function makeRfq(s: GameState, c: Client, desk: DeskId, time: string, forced?: Partial<Rfq> & { instKind?: string }): Rfq | null {
  const m = s.market;
  const size = c.sizeMult * lognormal(s, 0.5);
  let inst: Instrument | undefined;
  let instId: string;
  let clientQty: number;
  let signalKey: string | null = null;
  let note = '';
  const day = s.day;
  const optionsLive = day >= 8;
  switch (desk) {
    case 'eq': {
      const roll = rand(s);
      if (optionsLive && (c.type === 'hedgeFund' || c.type === 'assetMgr') && roll < 0.3) {
        const opts = Object.values(s.instruments).filter((i) => i.kind === 'eqOpt' && !i.dynamic && i.expiry > m.t + 10 / 365) as any[];
        if (opts.length) {
          inst = pick(s, opts);
          clientQty = Math.round(Math.max(50, 400 * size)) * (rand(s) < 0.65 ? 1 : -1);
          note = clientQty > 0 ? 'Client buying protection / convexity' : 'Client overwriting — selling volatility';
          break;
        }
      }
      if ((c.type === 'assetMgr' || c.type === 'quant' || c.type === 'emm') && roll < 0.55) {
        inst = s.instruments.USLC;
        signalKey = 'etf';
        const notional = Math.min(600e6, Math.max(10e6, 80e6 * size));
        clientQty = Math.round(notional / unitValue(inst, m)) * informedSide(s, c, null);
        note = 'ETF flow — hedgeable with index futures; watch the ETF premium/discount';
        break;
      }
      const st = weightedPick(s, STOCKS, (x) => Math.sqrt(x.adv));
      inst = s.instruments[st.id];
      signalKey = `eq:${st.id}`;
      const notional = Math.min(400e6, Math.max(5e6, (c.type === 'quant' || c.type === 'emm' ? 12e6 : 60e6) * size));
      clientQty = Math.round(notional / unitValue(inst, m)) * informedSide(s, c, signalKey);
      note = notional > 100e6 ? `Block: ${(notional / (0.15 * st.adv)).toFixed(1)} days of 15% participation to unwind` : 'Single-stock risk';
      break;
    }
    case 'rates': {
      const wantsSwap = c.type === 'pension' || c.type === 'insurer' || c.type === 'corporate' || (c.type === 'hedgeFund' && rand(s) < 0.5);
      if (wantsSwap || forced?.instKind === 'irs') {
        const tenor = c.type === 'insurer' ? pick(s, [20, 30]) : c.type === 'pension' ? pick(s, [10, 30]) : c.type === 'corporate' ? pick(s, [5, 7, 10]) : pick(s, [2, 5, 10]);
        inst = newSwap(s, tenor, swapPar(m, tenor), 'RFQ');
        const notional = Math.min(1.5e9, Math.max(50e6, (c.type === 'pension' || c.type === 'insurer' ? 300e6 : 120e6) * size));
        // pensions/insurers receive fixed (liability hedging); corporates pay fixed (hedge floating debt)
        const side = c.type === 'pension' || c.type === 'insurer' ? 1 : c.type === 'corporate' ? -1 : informedSide(s, c, 'rates:term') * -1;
        clientQty = Math.round(notional) * side;
        note = side > 0 ? 'Client receives fixed to extend duration (liability hedging). Atlas pays fixed: short duration until hedged.' : 'Client pays fixed to hedge floating-rate debt. Atlas receives fixed: long duration until hedged.';
        break;
      }
      const tenor = c.type === 'insurer' ? '30Y' : pick(s, ['2Y', '5Y', '10Y', '10Y', '30Y']);
      inst = s.instruments[`UST${tenor}`];
      const notional = Math.min(1e9, Math.max(25e6, 150e6 * size));
      clientQty = Math.round(notional) * informedSide(s, c, 'rates:term') * -1;
      note = 'Treasury cash — hedge with futures, swaps or the inter-dealer market';
      break;
    }
    case 'fx': {
      const pairPref = c.type === 'corporate' ? (c.id === 'cobalt' ? ['AUDUSD', 'USDCAD'] : c.id === 'ironside' ? ['EURUSD', 'GBPUSD'] : ['EURUSD', 'USDJPY', 'USDMXN']) : c.type === 'swf' ? ['EURUSD', 'USDJPY', 'GBPUSD'] : [...PAIRS];
      const pair = pick(s, pairPref);
      const notionalUsd = Math.min(800e6, Math.max(10e6, (c.type === 'quant' || c.type === 'emm' ? 20e6 : 120e6) * size));
      const base = notionalUsd / usdPer(m, pairCcys(pair)[0]);
      if (optionsLive && (c.type === 'hedgeFund' || c.type === 'corporate') && rand(s) < 0.25) {
        const T = pick(s, [1 / 12, 0.25]);
        const F = fxForward(m, pair, T);
        const cp = rand(s) < 0.5 ? 'C' : 'P';
        const K = F * (cp === 'C' ? 1.02 : 0.98);
        inst = newFxOpt(s, pair, T, K, cp);
        clientQty = Math.round(base); // clients mostly buy options
        note = 'Client buys optionality — Atlas is short vol and gamma';
        break;
      }
      if (c.type === 'corporate' && rand(s) < 0.6) {
        const T = pick(s, [0.25, 0.5, 1]);
        inst = newFxFwd(s, pair, T);
        clientQty = Math.round(base) * (rand(s) < 0.5 ? 1 : -1);
        note = 'Corporate hedge of a future foreign-currency cash flow (forward: spot + forward points)';
        break;
      }
      instId = `SPOT:${pair}`;
      clientQty = Math.round(base) * informedSide(s, c, `fx:${pair}`);
      return finalize(s, c, desk, time, null, instId, clientQty, 'Spot FX — risk can be offset in the inter-dealer market within seconds', `fx:${pair}`, forced);
    }
    case 'credit': {
      const roll = rand(s);
      if ((c.type === 'hedgeFund' || c.type === 'dealer') && roll < 0.45) {
        const id = rand(s) < 0.5 ? (rand(s) < 0.6 ? 'CDX-IG' : 'CDX-HY') : `CDS-${pick(s, Object.keys(s.issuers))}`;
        inst = s.instruments[id];
        if (!inst || m.credit.defaulted[(inst as any).issuer]) return null;
        const idx = id.startsWith('CDX');
        const notional = Math.min(1e9, Math.max(10e6, (idx ? 250e6 : 30e6) * size));
        signalKey = `cr:${(inst as any).issuer}`;
        // a client that expects widening BUYS protection
        clientQty = Math.round(notional) * informedSide(s, c, signalKey);
        note = idx ? 'Index CDS — the most liquid credit hedge' : 'Single-name CDS — protection buyer pays a running coupon plus upfront';
        break;
      }
      const bonds = Object.values(s.instruments).filter((i) => i.kind === 'corp' && !m.credit.defaulted[i.issuer]) as any[];
      inst = pick(s, bonds);
      signalKey = `cr:${(inst as any).issuer}`;
      const hy = m.credit.spread[(inst as any).issuer] > 250;
      const notional = Math.min(150e6, Math.max(3e6, (hy ? 12e6 : 25e6) * size));
      // client sells bonds when it expects spreads to widen
      clientQty = Math.round(notional) * -informedSide(s, c, signalKey);
      note = hy ? 'High-yield bond: wide bid/ask, thin liquidity, default risk' : 'Investment-grade corporate bond';
      break;
    }
    case 'cmdty': {
      const cm = c.id === 'ironside' ? 'WTI' : c.id === 'cobalt' ? pick(s, ['COPPER', 'GOLD']) : pick(s, Object.keys(CMDTYS));
      const futs = Object.values(s.instruments).filter((i) => i.kind === 'cmdtyFut' && i.cmdty === cm && i.expiry > m.t + 5 / 365).sort((a: any, b: any) => a.expiry - b.expiry) as any[];
      const fut = futs[Math.min(futs.length - 1, Math.floor(rand(s) * 4))];
      if (!fut) return null;
      const notional = Math.min(300e6, Math.max(5e6, 40e6 * size));
      const side = c.id === 'ironside' ? 1 : c.id === 'cobalt' ? -1 : informedSide(s, c, `cm:${cm}`);
      if (day >= 15 && c.type === 'corporate' && rand(s) < 0.35) {
        const F = quotePrice(fut, m);
        const cp = side > 0 ? 'C' : 'P';
        inst = newCmdtyOpt(s, fut.id, F * (cp === 'C' ? 1.1 : 0.9), cp);
        clientQty = Math.max(5, Math.round(notional / (F * fut.mult)));
        note = cp === 'C' ? 'Airline buys call protection against rising fuel costs' : 'Producer buys put protection on its output';
        break;
      }
      inst = fut;
      clientQty = Math.max(5, Math.round(notional / (quotePrice(fut, m) * fut.mult))) * side;
      note = c.type === 'corporate' ? (side > 0 ? 'Consumer hedge: locking in future purchase prices' : 'Producer hedge: selling future output forward') : 'Speculative futures flow';
      break;
    }
    case 'exotics': {
      const recentIssue = s.blotter.some((b) => b.desk === 'exotics' && b.kind === 'client' && s.instruments[b.instId]?.kind === 'autocall' && s.day - b.day < 4) || (s.rfqs !== batch && s.rfqs.some((r) => r.clientId === 'privatebank' && r.status === 'open')) || batch.some((r) => r.clientId === 'privatebank');
      if (c.type === 'privateBank' && recentIssue) return null;
      if (c.type === 'privateBank') {
        inst = newAutocall(s, 2, 0.02);
        const notional = Math.round(Math.min(200e6, Math.max(40e6, 80e6 * size)) / 1e6) * 1e6;
        clientQty = notional; // investors buy the note
        note = 'Private-bank clients buy a 2-year US500 autocallable. You set the coupon; the issuance margin is the gap between par and fair value.';
        break;
      }
      const T = 0.25;
      inst = newVarSwap(s, T, m.eq.atmVol.US500 * 1.08);
      const vegaNotional = Math.round(Math.min(400e3, Math.max(50e3, 120e3 * size)) / 1e3) * 1e3;
      const K = (inst as any).strikeVol;
      clientQty = Math.round(vegaNotional / (2 * K * 0.01)) * (rand(s) < 0.6 ? 1 : -1);
      note = 'Variance swap: pure exposure to realised vs implied volatility. Hedge with a strip of listed options.';
      break;
    }
  }
  if (!inst) return null;
  return finalize(s, c, desk, time, inst, inst.id, clientQty!, note, signalKey, forced);
}

function finalize(s: GameState, c: Client, desk: DeskId, time: string, inst: Instrument | null, instId: string, clientQty: number, note: string, signalKey: string | null, forced?: Partial<Rfq>): Rfq {
  const m = s.market;
  const notional = Math.abs(clientQty) * (inst ? unitNotional(s, inst, m) : usdPer(m, pairCcys(instId.slice(5))[0]));
  const nDealers = c.type === 'privateBank' ? 1 : c.type === 'corporate' ? 3 : c.type === 'pension' || c.type === 'insurer' ? 4 : 5;
  const rfq: Rfq = {
    id: `R${s.nextId++}`,
    time,
    clientId: c.id,
    instId,
    desk,
    clientQty,
    mid: inst ? quotePrice(inst, m) : m.fx.spot[instId.slice(5)],
    notional,
    urgency: c.type === 'hedgeFund' || c.type === 'quant' || c.type === 'emm' ? 'high' : 'normal',
    refHalfSpread: 0,
    nDealers,
    status: 'open',
    signal: signalKey ? Math.sign(s.pendingIdio[signalKey] ?? 0) : 0,
    note,
    ...forced,
  };
  rfq.refHalfSpread = rfqEconomics(s, rfq).fair;
  c.rfqs++;
  return rfq;
}

// ---------------------------------------------------------------- economics

export interface RfqEconomics {
  unitNotional: number;
  hedgeCost: number; // USD per unit
  riskCharge: number;
  axe: number; // reduction because the trade offsets inventory
  fair: number; // suggested half-spread, USD per unit
  invQty: number; // our existing position in this instrument (same units)
  atlasQty: number;
  lines: { label: string; value: string }[];
}

function residualRisk(s: GameState, rfq: Rfq): number {
  const m = s.market;
  const k = Math.sqrt(REGIMES[m.regime].k);
  if (rfq.instId.startsWith('SPOT:')) {
    const pair = rfq.instId.slice(5);
    return m.fx.spot[pair] * (m.fx.vol[pair] / Math.sqrt(252)) * 0.02 * usdPer(m, pairCcys(pair)[1]);
  }
  const inst = s.instruments[rfq.instId];
  const uv = isFuture(inst) ? 0 : unitValue(inst, m);
  switch (inst.kind) {
    case 'stock': {
      const s1d = (inst.idioVol / Math.sqrt(252)) * k * uv;
      const days = Math.max(1, rfq.notional / (0.15 * inst.adv));
      return 0.22 * s1d * Math.sqrt(days);
    }
    case 'etf':
      return uv * 0.00008;
    case 'ust':
      return 0;
    case 'irs':
      return (0.25 * annuity(m, inst.maturity - m.t)) / 1e4 * k; // swap spread / curve basis
    case 'corp': {
      const sp = m.credit.spread[inst.issuer];
      const dur = (inst.maturity - m.t) * 0.8;
      const s1d = (Math.sqrt(sp) * 0.35 * k * dur) / 1e4;
      const days = Math.max(1, rfq.notional / (0.1 * inst.adv));
      return 0.35 * s1d * Math.sqrt(days);
    }
    case 'cds': {
      const sp = m.credit.spread[inst.issuer];
      return (0.2 * Math.sqrt(sp) * 0.35 * k * rpv01(m, sp, 0.4, inst.maturity - m.t)) / 1e4;
    }
    case 'eqOpt':
    case 'fxOpt':
    case 'cmdtyOpt':
      return vegaPerUnit(s, inst, m) * 0.6 * k;
    case 'varSwap':
      return 2 * inst.strikeVol * 0.004 * k;
    case 'cmdtyFut':
      return 0;
    case 'fxFwd':
      return 0;
    case 'autocall':
      return 0.004;
    default:
      return 0;
  }
}

export function rfqEconomics(s: GameState, rfq: Rfq): RfqEconomics {
  const m = s.market;
  const atlasQty = -rfq.clientQty;
  let unitNot: number;
  let hedgeCost: number;
  let invQty = 0;
  if (rfq.instId.startsWith('SPOT:')) {
    const pair = rfq.instId.slice(5);
    const [b, q] = pairCcys(pair);
    unitNot = usdPer(m, b);
    hedgeCost = fxSpotHalfSpread(m, pair, rfq.clientQty) * usdPer(m, q);
    invQty = s.desks.fx.cash[b] ?? 0;
  } else {
    const inst = s.instruments[rfq.instId];
    unitNot = unitNotional(s, inst, m);
    // hedging via the most liquid proxy is cheaper than unwinding the instrument itself
    const own = halfSpreadUnit(s, inst, rfq.clientQty, m);
    hedgeCost = inst.kind === 'stock' ? Math.min(own, own * 0.35 + halfSpreadUnit(s, inst, rfq.clientQty * 0.3, m) * 0.3) : own;
    invQty = s.desks[rfq.desk].positions[rfq.instId]?.qty ?? 0;
  }
  const risk = residualRisk(s, rfq);
  // axe: if Atlas already holds the opposite position, the trade reduces risk instead of adding it
  const offset = invQty !== 0 && Math.sign(invQty) !== Math.sign(atlasQty) ? Math.min(1, Math.abs(invQty) / Math.abs(atlasQty)) : 0;
  const axe = offset * (risk + hedgeCost * 0.7);
  const fair = Math.max(hedgeCost * 0.25, hedgeCost + risk - axe);
  const lines = [
    { label: 'Hedge / unwind cost at this size', value: displaySpread(s, rfq, hedgeCost) },
    { label: 'Residual-risk charge', value: displaySpread(s, rfq, risk) },
  ];
  if (axe > 0) lines.push({ label: `Axe: offsets ${(offset * 100).toFixed(0)}% of existing inventory`, value: `−${displaySpread(s, rfq, axe)}` });
  lines.push({ label: 'Full-cost half-spread (hedge + risk − axe)', value: displaySpread(s, rfq, fair) });
  return { unitNotional: unitNot, hedgeCost, riskCharge: risk, axe, fair, invQty, atlasQty, lines };
}

/** Express a USD-per-unit half-spread in the market's natural quoting units. */
export function displaySpread(s: GameState, rfq: Rfq, hUnit: number): string {
  const m = s.market;
  if (rfq.instId.startsWith('SPOT:')) {
    const pair = rfq.instId.slice(5);
    return `${(hUnit / usdPer(m, pairCcys(pair)[1]) / PIP[pair]).toFixed(1)} pips`;
  }
  const inst = s.instruments[rfq.instId];
  switch (inst.kind) {
    case 'stock':
    case 'etf':
      return `${((hUnit / unitValue(inst, m)) * 1e4).toFixed(1)}bp (${(hUnit * 100).toFixed(1)}¢)`;
    case 'ust':
      return `${(hUnit * 100 * 32).toFixed(2)}/32`;
    case 'corp': {
      const dur = Math.max(0.2, (inst.maturity - m.t) * 0.8);
      return `${((hUnit / dur) * 1e4).toFixed(1)}bp spread (${(hUnit * 100).toFixed(3)} pts)`;
    }
    case 'irs':
      return `${((hUnit / annuity(m, inst.maturity - m.t)) * 1e4).toFixed(2)}bp`;
    case 'cds':
      return `${((hUnit / rpv01(m, m.credit.spread[inst.issuer], 0.4, inst.maturity - m.t)) * 1e4).toFixed(2)}bp running`;
    case 'fxFwd':
      return `${(hUnit / usdPer(m, pairCcys(inst.pair)[1]) / PIP[inst.pair]).toFixed(1)} pips`;
    case 'eqOpt':
    case 'fxOpt':
    case 'cmdtyOpt': {
      const v = vegaPerUnit(s, inst, m);
      return `${(hUnit / Math.max(1e-9, v)).toFixed(2)} vol (${fm(hUnit)}/unit)`;
    }
    case 'varSwap':
      return `${((hUnit / (2 * inst.strikeVol)) * 100).toFixed(2)} vol pts`;
    case 'autocall':
      return `${(hUnit * 100).toFixed(2)}% of notional`;
    default:
      if (isFuture(inst)) return `${(hUnit / futMult(inst)).toFixed(inst.kind === 'sofrFut' ? 4 : 3)} pts`;
      return fm(hUnit);
  }
}

// ---------------------------------------------------------------- competition

function competitorQuotes(s: GameState, rfq: Rfq, draw: () => number, nrm: () => number): number[] {
  const m = s.market;
  const comps = Object.values(s.competitors);
  const quotes: number[] = [];
  const fair = rfq.refHalfSpread;
  const liquidSmall = (rfq.desk === 'eq' || rfq.desk === 'fx') && rfq.notional < 60e6;
  for (let i = 0; i < rfq.nDealers - 1; i++) {
    const c = comps[Math.floor(draw() * comps.length)];
    if (c.id === 'velocity' && !liquidSmall) continue;
    const strong = c.strengths.includes(rfq.desk) ? 0.9 : 1.05;
    const appetite = Math.max(0.25, c.appetite * m.dealerAppetite);
    quotes.push(fair * c.tightness * strong * (1 / appetite) * Math.exp(nrm() * 0.25));
  }
  return quotes;
}

/** Estimated probability of winning at half-spread q (dealer's hit-ratio model; uses its own noise). */
export function hitRatio(s: GameState, rfq: Rfq, q: number): number {
  let a = 12345 + rfq.id.length * 77 + Math.round(rfq.notional) % 1000;
  const draw = () => {
    a = (a * 1103515245 + 12345) & 0x7fffffff;
    return a / 0x7fffffff;
  };
  const nrm = () => {
    const u = Math.max(1e-9, draw());
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * draw());
  };
  const c = s.clients[rfq.clientId];
  let wins = 0;
  const N = 200;
  for (let i = 0; i < N; i++) {
    const qs = competitorQuotes(s, rfq, draw, nrm);
    const best = qs.length ? Math.min(...qs) : Infinity;
    if (q <= best * relBonus(c)) wins++;
  }
  return wins / N;
}

/** Half-spread (USD/unit) at which the estimated win probability is about `target`. */
export function priceForHit(s: GameState, rfq: Rfq, target: number): number {
  let lo = 0;
  let hi = Math.max(1e-12, rfq.refHalfSpread * 3);
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    if (hitRatio(s, rfq, mid) > target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

function relBonus(c: Client) {
  return 1 + 0.18 * ((c.relationship - 50) / 50);
}

// ---------------------------------------------------------------- execution

export interface QuoteResult {
  won: boolean;
  cover: number | null;
  edge: number;
  message: string;
  newInstId?: string;
}

export function sendQuote(s: GameState, rfq: Rfq, q: number, opts: { coupon?: number } = {}): QuoteResult {
  const m = s.market;
  const c = s.clients[rfq.clientId];
  rfq.quotedHalfSpread = q;
  const stressed = m.regime === 'stressed' || m.regime === 'crisis';
  let won: boolean;
  let cover: number | null = null;
  if (rfq.desk === 'exotics' && s.instruments[rfq.instId]?.kind === 'autocall') {
    // private bank compares the coupon with competing issuers' indicative coupons
    const ac = s.instruments[rfq.instId] as any;
    const coupon = opts.coupon ?? ac.coupon;
    const need = autocallWinCoupon(s, rfq);
    won = coupon >= need * 0.999;
    cover = need;
    if (won) {
      const inst = newAutocall(s, 2, coupon);
      inst.seed = ac.seed;
      const N = rfq.clientQty;
      // investors pay par; Atlas owes the note payoff
      addCash(s.desks.exotics, 'USD', N);
      const pos = (s.desks.exotics.positions[inst.id] = { instId: inst.id, qty: -N, openedDay: s.day, cpty: undefined });
      void pos;
      const edge = N * (1 - autocallPayoffPV(m, inst));
      s.desks.exotics.pnlToday.spread += edge;
      blot(s, { day: s.day, desk: 'exotics', instId: inst.id, qty: -N, price: 100, mid: autocallPayoffPV(m, inst) * 100, cpty: c.id, kind: 'client', pnl: edge });
      rfq.status = 'won';
      rfq.spreadCapture = edge;
      rfq.instId = inst.id;
      c.wins++;
      c.revenue += edge;
      c.relationship = Math.min(100, c.relationship + 2);
      return { won, cover, edge, message: `Issued ${fm(N)} of notes at par with a ${(coupon * 400).toFixed(2)}% p.a. coupon. Fair value ${(autocallPayoffPV(m, inst) * 100).toFixed(2)}% → issuance margin ${fm(edge)}. You are now short the note's embedded options.`, newInstId: inst.id };
    }
    rfq.status = 'lost';
    c.relationship = Math.max(0, c.relationship - 2);
    return { won, cover, edge: 0, message: 'The private bank placed the issue with another dealer offering a richer coupon.' };
  }
  const qs = competitorQuotes(s, rfq, () => rand(s), () => randNormal(s));
  const best = qs.length ? Math.min(...qs) : Infinity;
  won = q <= best * relBonus(c);
  cover = Number.isFinite(best) ? best : null;
  rfq.cover = cover ?? undefined;
  if (!won) {
    rfq.status = 'lost';
    if (cover !== null && q > cover * 2) c.relationship = Math.max(0, c.relationship - 1.5);
    else c.relationship = Math.max(0, c.relationship - 0.3);
    return { won, cover, edge: 0, message: `Lost. Best competing price was ${displaySpread(s, rfq, cover ?? 0)} vs your ${displaySpread(s, rfq, q)}.` };
  }
  const edge = executeClient(s, rfq, q);
  rfq.status = 'won';
  rfq.spreadCapture = edge;
  c.wins++;
  c.revenue += edge;
  c.relationship = Math.min(100, c.relationship + (stressed ? 3 : 1));
  if (stressed) {
    c.stressLiquidity++;
    s.stats.crisisWins++;
  }
  s.desks[rfq.desk].pnlToday.spread += edge;
  return { won, cover, edge, message: `Done. Spread captured vs mid ${fm(edge)} (cover was ${cover !== null ? displaySpread(s, rfq, cover) : 'n/a'}).`, newInstId: rfq.instId };
}

/** Book the client trade on Atlas's side at mid ± q. Returns the edge captured. */
function executeClient(s: GameState, rfq: Rfq, q: number): number {
  const m = s.market;
  const atlasQty = -rfq.clientQty;
  const sgn = Math.sign(atlasQty);
  if (rfq.instId.startsWith('SPOT:')) {
    const pair = rfq.instId.slice(5);
    const rate = m.fx.spot[pair] - sgn * (q / usdPer(m, pairCcys(pair)[1]));
    return bookFxSpot(s, pair, atlasQty, rate, rfq.clientId, 'client');
  }
  let inst = s.instruments[rfq.instId];
  // OTC instruments are struck off-market so the client's rate embeds Atlas's spread
  if (inst.kind === 'irs') {
    const T = inst.maturity - m.t;
    const K = swapPar(m, T) + (sgn * q) / annuity(m, T);
    inst = newSwap(s, Math.round(T), K, s.clients[rfq.clientId].name.split(' ')[0]);
  } else if (inst.kind === 'fxFwd') {
    const T = inst.maturity - m.t;
    const [, qc] = pairCcys(inst.pair);
    const K = fxForward(m, inst.pair, T) - (sgn * q) / (usdPer(m, qc) * ccyDF(m, qc, T));
    inst = newFxFwd(s, inst.pair, T, K);
  } else if (inst.kind === 'varSwap') {
    const T = inst.expiry - m.t;
    const fairK2 = inst.strikeVol * inst.strikeVol;
    const K = Math.sqrt(Math.max(0.0001, fairK2 - (sgn * q) / sofrDF(m, T)));
    inst = newVarSwap(s, Math.round(T * 12) / 12, K);
  }
  if (inst.id !== rfq.instId) {
    const pos = { instId: inst.id, qty: atlasQty, openedDay: s.day, cpty: rfq.clientId };
    s.desks[rfq.desk].positions[inst.id] = pos;
    const edge = atlasQty * unitValue(inst, m);
    blot(s, { day: s.day, desk: rfq.desk, instId: inst.id, qty: atlasQty, price: quotePrice(inst, m), mid: quotePrice(inst, m), cpty: rfq.clientId, kind: 'client', pnl: edge });
    rfq.instId = inst.id;
    return edge;
  }
  const mid = quotePrice(inst, m);
  const price = isFuture(inst) ? mid - (sgn * q) / futMult(inst) : mid - sgn * unitToQuoteSafe(inst, q, m);
  const edge = bookTrade(s, rfq.desk, inst, atlasQty, price, rfq.clientId, 'client');
  if (['eqOpt', 'fxOpt', 'cmdtyOpt', 'cds'].includes(inst.kind)) s.desks[rfq.desk].positions[inst.id] && (s.desks[rfq.desk].positions[inst.id].cpty = rfq.clientId);
  return edge;
}

function unitToQuoteSafe(inst: Instrument, du: number, m: GameState['market']): number {
  switch (inst.kind) {
    case 'ust':
    case 'corp':
    case 'cds':
      return du * 100;
    default:
      return du;
  }
}

export function passRfq(s: GameState, rfq: Rfq) {
  rfq.status = 'passed';
  const c = s.clients[rfq.clientId];
  c.noQuotes++;
  c.relationship = Math.max(0, c.relationship - (s.market.regime === 'crisis' || s.market.regime === 'stressed' ? 3 : 1));
}

/** Issuance margin competing issuers work on; a strong relationship lets Atlas keep a little more. */
export function autocallWinMargin(s: GameState, rfq: Rfq): number {
  const c = s.clients[rfq.clientId];
  return 0.01 + 0.008 * Math.max(0, (c.relationship - 40) / 60);
}

/** Lowest coupon (per quarter) the private bank accepts. */
export function autocallWinCoupon(s: GameState, rfq: Rfq): number {
  return solveAutocallCoupon(s, s.instruments[rfq.instId], autocallWinMargin(s, rfq));
}

/** Coupon (per quarter) that makes the autocall's fair value = 1 − margin. */
export function solveAutocallCoupon(s: GameState, ac: any, margin: number): number {
  let lo = 0.002;
  let hi = 0.15;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    const pv = autocallPayoffPV(s.market, { ...ac, coupon: mid });
    if (pv < 1 - margin) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// ---------------------------------------------------------------- hedging

export interface HedgeIdea {
  label: string;
  instId: string;
  qty: number;
  rationale: string;
  cost: number; // estimated execution cost
  working?: boolean;
}

function sensPerUnit(s: GameState, instId: string, key: string): number {
  const m = s.market;
  if (instId.startsWith('SPOT:')) {
    const pair = instId.slice(5);
    const [b, q] = pairCcys(pair);
    // +1 base, −S quote: exposure to `key` (fx:CCY)
    const val = (mm: typeof m) => usdPer(mm, b) - mm.fx.spot[pair] * usdPer(mm, q) * (m.fx.spot[pair] / mm.fx.spot[pair]);
    return val(bump(m, key, 0.01)) - val(m);
  }
  const inst = s.instruments[instId];
  const pos = { instId, qty: 1, openedDay: s.day, ref: isFuture(inst) ? quotePrice(inst, m) : undefined };
  const base = isFuture(inst) ? 0 : unitValue(inst, m);
  const size = key.startsWith('cr:') ? 1 : key.startsWith('rates') || key.startsWith('kr') ? 0.0001 : 0.01;
  const up = bump(m, key, size);
  const v = isFuture(inst) ? (quotePrice(inst, up) - (pos.ref ?? 0)) * futMult(inst) : unitValue(inst, up);
  return v - base;
}

/** Sensitivity of an Atlas-side quantity of an instrument to a factor. */
function tradeSens(s: GameState, instId: string, qty: number, key: string): number {
  return sensPerUnit(s, instId, key) * qty;
}

export function hedgeIdeas(s: GameState, desk: DeskId, instId: string, atlasQty: number): HedgeIdea[] {
  const m = s.market;
  const out: HedgeIdea[] = [];
  const cost = (id: string, q: number) => {
    if (id.startsWith('NEWSWAP:')) return ((0.2 * annuity(m, Number(id.slice(8)))) / 1e4) * m.liquidity * Math.abs(q);
    if (id.startsWith('SPOT:')) return fxSpotHalfSpread(m, id.slice(5), q) * usdPer(m, pairCcys(id.slice(5))[1]) * Math.abs(q);
    return halfSpreadUnit(s, s.instruments[id], q, m) * Math.abs(q);
  };
  const add = (label: string, id: string, q: number, rationale: string, working = false) => {
    if (!Number.isFinite(q) || Math.abs(q) < 1e-9) return;
    out.push({ label, instId: id, qty: q, rationale, cost: working ? cost(id, q / 3) * 3 * 0.8 : cost(id, q), working });
  };
  if (instId.startsWith('SPOT:')) {
    add('Offset in the inter-dealer market', instId, -atlasQty, 'Flattens the currency position immediately at the inter-dealer spread.');
    return out;
  }
  const inst = s.instruments[instId];
  const es = frontFuture(s, (i) => i.kind === 'eqFut');
  const ty = frontFuture(s, (i) => i.kind === 'bondFut' && i.id.startsWith('TY'));
  switch (inst.kind) {
    case 'stock': {
      add('Unwind now in the market', instId, -atlasQty, 'Removes all risk today but pays full market impact for the size.');
      add('Work the unwind over 3 days', instId, -atlasQty, 'Lower impact per slice; you carry the remaining risk overnight.', true);
      if (es) {
        const d = tradeSens(s, instId, atlasQty, `eq:${instId}`) * inst.beta;
        const per = sensPerUnit(s, es.id, 'eq:US500');
        add('Beta-hedge with index futures', es.id, Math.round(-d / per), `Neutralises market (beta ${inst.beta}) exposure; leaves the stock-specific risk on.`);
      }
      break;
    }
    case 'etf': {
      if (es) add('Hedge with index futures', es.id, Math.round(-tradeSens(s, instId, atlasQty, 'eq:US500') / sensPerUnit(s, es.id, 'eq:US500')), 'ETF and futures track the same index: near-perfect hedge, small basis/premium risk.');
      add('Offset in the ETF market', instId, -atlasQty, 'Trade out on exchange.');
      break;
    }
    case 'eqOpt':
    case 'varSwap':
    case 'autocall': {
      if (es) add('Delta-hedge with index futures', es.id, Math.round(-tradeSens(s, instId, atlasQty, 'eq:US500') / sensPerUnit(s, es.id, 'eq:US500')), 'Removes first-order equity exposure; gamma and vega remain — re-hedge as the market moves.');
      const atm = Object.values(s.instruments).filter((i) => i.kind === 'eqOpt' && !i.dynamic && i.cp === 'C' && i.expiry > m.t + 0.15).sort((a: any, b: any) => Math.abs(a.strike - m.eq.spot.US500) - Math.abs(b.strike - m.eq.spot.US500))[0];
      if (atm) {
        const v = tradeSens(s, instId, atlasQty, 'vol:US500');
        const per = sensPerUnit(s, atm.id, 'vol:US500');
        if (Math.abs(per) > 1e-9) add('Vega-hedge with listed 3M options', atm.id, Math.round(-v / per), 'Offsets volatility exposure with listed calls (adds delta: re-hedge with futures).');
      }
      break;
    }
    case 'ust':
    case 'irs': {
      const dv = tradeSens(s, instId, atlasQty, 'rates:usd');
      if (ty) add('DV01-hedge with 10Y note futures', ty.id, Math.round(-dv / sensPerUnit(s, ty.id, 'rates:usd')), 'Cheapest duration hedge; leaves curve and swap-spread risk.');
      const T = inst.kind === 'irs' ? Math.round(inst.maturity - m.t) : Math.round(inst.maturity - m.t);
      const bond = Object.values(s.instruments).filter((i) => i.kind === 'ust').sort((a: any, b: any) => Math.abs(a.maturity - m.t - T) - Math.abs(b.maturity - m.t - T))[0];
      if (inst.kind === 'irs' && bond) add(`DV01-hedge with the ${(bond as any).tenorLabel} Treasury`, bond.id, Math.round(-dv / sensPerUnit(s, bond.id, 'rates:usd')), 'Matches maturity; leaves you exposed to swap spreads.');
      if (inst.kind === 'ust') add('Sell/buy back in the inter-dealer market', instId, -atlasQty, 'Clean exit at the D2D spread.');
      if (inst.kind === 'irs') {
        add('Offset with a par swap in the inter-dealer market', `NEWSWAP:${T}`, -atlasQty, 'Eliminates rate risk entirely; locks in the spread you charged.');
      }
      break;
    }
    case 'fxFwd':
    case 'fxOpt': {
      const [b, q] = pairCcys(inst.pair);
      const nonUsd = b === 'USD' ? q : b;
      const d = tradeSens(s, instId, atlasQty, `fx:${nonUsd}`);
      const per = sensPerUnit(s, `SPOT:${inst.pair}`, `fx:${nonUsd}`);
      add(inst.kind === 'fxOpt' ? 'Delta-hedge in spot' : 'Hedge spot exposure in the inter-dealer market', `SPOT:${inst.pair}`, -d / per, inst.kind === 'fxOpt' ? 'Removes FX delta; vega and gamma remain.' : 'Removes FX risk; forward-point (interest-rate differential) risk remains.');
      break;
    }
    case 'corp':
    case 'cds': {
      const issuer = (inst as any).issuer as string;
      const cs = tradeSens(s, instId, atlasQty, `cr:${issuer}`);
      const hy = m.credit.spread[issuer] > 250;
      const idx = hy ? 'CDX-HY' : 'CDX-IG';
      const beta = m.credit.spread[issuer] / m.credit.spread[hy ? 'CDXHY' : 'CDXIG'];
      if (!issuer.startsWith('CDX')) add(`Beta-hedge with ${idx}`, idx, -cs * beta / sensPerUnit(s, idx, `cr:${hy ? 'CDXHY' : 'CDXIG'}`), 'Liquid macro credit hedge; leaves issuer-specific (idiosyncratic and default) risk.');
      if (inst.kind === 'corp' && s.instruments[`CDS-${issuer}`]) add('Hedge with single-name CDS', `CDS-${issuer}`, -cs / sensPerUnit(s, `CDS-${issuer}`, `cr:${issuer}`), 'Covers default risk too; you keep bond-CDS basis risk.');
      if (inst.kind === 'corp') {
        add('Work the bond out over 3 days', instId, -atlasQty, 'Corporate bonds are illiquid: slicing reduces impact.', true);
        const dv = tradeSens(s, instId, atlasQty, 'rates:usd');
        if (ty) add('Hedge the interest-rate component with 10Y futures', ty.id, Math.round(-dv / sensPerUnit(s, ty.id, 'rates:usd')), 'A corporate bond is rates risk plus credit risk.');
      } else add('Offset in the inter-dealer market', instId, -atlasQty, 'Exit the CDS position.');
      break;
    }
    case 'cmdtyFut': {
      add('Offset on exchange (same month)', instId, -atlasQty, 'Exact hedge.');
      const next = Object.values(s.instruments).filter((i) => i.kind === 'cmdtyFut' && i.cmdty === inst.cmdty && i.expiry > inst.expiry).sort((a: any, b: any) => a.expiry - b.expiry)[0];
      if (next) add('Hedge in the next month (calendar spread risk remains)', next.id, -atlasQty, 'Often more liquid; you take curve (contango/backwardation) risk.');
      break;
    }
    case 'cmdtyOpt': {
      const d = tradeSens(s, instId, atlasQty, `cm:${inst.cmdty}`);
      const fut = s.instruments[inst.futId];
      if (fut) add('Delta-hedge with the underlying future', fut.id, Math.round(-d / sensPerUnit(s, fut.id, `cm:${inst.cmdty}`)), 'Removes price delta; vega and gamma remain.');
      break;
    }
    default:
      if (isFuture(inst)) add('Offset on exchange', instId, -atlasQty, 'Exact hedge.');
  }
  return out;
}

/** Execute a hedge idea (street) or create a working order. */
export function executeHedge(s: GameState, desk: DeskId, idea: HedgeIdea): number {
  let instId = idea.instId;
  if (instId.startsWith('NEWSWAP:')) {
    const T = Number(instId.slice(8));
    instId = newSwap(s, T, swapPar(s.market, T), 'D2D hedge').id;
  }
  if (idea.working) {
    s.orders.push({ id: `O${s.nextId++}`, instId, qtyRemaining: idea.qty, daysLeft: 3, desk, note: idea.label });
    return 0;
  }
  const qty = isFuture(s.instruments[instId] ?? ({} as any)) ? Math.round(idea.qty) : idea.qty;
  return executeStreet(s, desk, instId, qty, 'hedge');
}

export { eqForward, varSwapValue, CMDTYS };

// ---------------------------------------------------------------- quoting units for the UI

/** How a half-spread is entered in the UI: label, USD-per-unit per 1 display unit, step and decimals. */
export function quoteScale(s: GameState, rfq: Rfq): { unit: string; perDisplay: number; step: number; dp: number } {
  const m = s.market;
  if (rfq.instId.startsWith('SPOT:')) {
    const pair = rfq.instId.slice(5);
    return { unit: 'pips', perDisplay: PIP[pair] * usdPer(m, pairCcys(pair)[1]), step: pair === 'USDMXN' || pair === 'USDBRL' ? 1 : 0.1, dp: 1 };
  }
  const inst = s.instruments[rfq.instId];
  switch (inst.kind) {
    case 'stock':
    case 'etf':
      return { unit: 'bp', perDisplay: unitValue(inst, m) / 1e4, step: 0.5, dp: 1 };
    case 'ust':
      return { unit: '/32', perDisplay: 1 / 32 / 100, step: 0.125, dp: 3 };
    case 'corp':
      return { unit: 'bp spread', perDisplay: Math.max(0.2, (inst.maturity - m.t) * 0.8) / 1e4, step: 0.5, dp: 1 };
    case 'irs':
      return { unit: 'bp', perDisplay: annuity(m, inst.maturity - m.t) / 1e4, step: 0.05, dp: 2 };
    case 'cds':
      return { unit: 'bp running', perDisplay: rpv01(m, m.credit.spread[inst.issuer], 0.4, inst.maturity - m.t) / 1e4, step: 0.1, dp: 2 };
    case 'fxFwd':
      return { unit: 'pips', perDisplay: PIP[inst.pair] * usdPer(m, pairCcys(inst.pair)[1]), step: 0.5, dp: 1 };
    case 'eqOpt':
    case 'fxOpt':
    case 'cmdtyOpt':
      return { unit: 'vol', perDisplay: Math.max(1e-9, vegaPerUnit(s, inst, m)), step: 0.05, dp: 2 };
    case 'varSwap':
      return { unit: 'vol pts', perDisplay: (2 * inst.strikeVol) / 100, step: 0.05, dp: 2 };
    case 'autocall':
      return { unit: '% p.a. coupon', perDisplay: 1, step: 0.1, dp: 2 };
    default:
      if (isFuture(inst)) {
        const tick = inst.kind === 'sofrFut' ? 0.0025 : inst.kind === 'bondFut' ? 1 / 64 : inst.kind === 'eqFut' ? 0.25 : 0.01;
        return { unit: 'pts', perDisplay: futMult(inst), step: tick, dp: 4 };
      }
      return { unit: '$', perDisplay: 1, step: 0.01, dp: 2 };
  }
}

/** Human description of what the client wants. */
export function rfqSummary(s: GameState, rfq: Rfq): string {
  const buy = rfq.clientQty > 0;
  if (rfq.instId.startsWith('SPOT:')) {
    const pair = rfq.instId.slice(5);
    return `${buy ? 'Buys' : 'Sells'} ${fm(rfq.notional)} ${pair.slice(0, 3)} vs ${pair.slice(3)} spot`;
  }
  const inst = s.instruments[rfq.instId];
  switch (inst.kind) {
    case 'irs':
      return `${buy ? 'Receives' : 'Pays'} fixed on ${fm(rfq.notional)} ${inst.tenorLabel} SOFR swap`;
    case 'cds':
      return `${buy ? 'Buys' : 'Sells'} ${fm(rfq.notional)} protection on ${inst.name}`;
    case 'autocall':
      return `Wants ${fm(rfq.notional)} of a 2Y autocallable note`;
    case 'varSwap':
      return `${buy ? 'Buys' : 'Sells'} US500 3M variance (vega ${fm(Math.abs(rfq.clientQty) * 2 * inst.strikeVol * 0.01)}/vol)`;
    case 'fxFwd':
      return `${buy ? 'Buys' : 'Sells'} ${fm(rfq.notional)} ${inst.pair.slice(0, 3)} ${Math.round((inst.maturity - s.market.t) * 12)}M forward`;
    default:
      return `${buy ? 'Buys' : 'Sells'} ${fm(rfq.notional)} ${inst.name}`;
  }
}
