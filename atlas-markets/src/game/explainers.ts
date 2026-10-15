// "Tap a number" trees: how an instrument is valued, how a P&L component arises, how VaR and
// capital are built.

import { cashUsd, deskValue, initialMargin, unitNotional } from '../engine/book';
import { calc, type Calc } from '../engine/explain';
import { fm, fpct } from '../engine/format';
import { pairCcys, sofrZero, usdPer } from '../engine/market';
import {
  accrued,
  annuity,
  autocallPayoffPV,
  bondClean,
  bondDirty,
  bondYield,
  cmdtyFwd,
  eqForward,
  eqVol,
  futPrice,
  fxForward,
  hazard,
  isFuture,
  positionValue,
  quotePrice,
  rpv01,
  swapPar,
  unitValue,
} from '../engine/pricing';
import { bump, deskCapital, factorKeys, type VarResult } from '../engine/risk';
import type { DeskId, GameState, Instrument, PnlParts } from '../engine/types';
import { dailyCosts, HURDLE } from './manage';

export function explainInstrument(s: GameState, inst: Instrument, qty = 1): Calc {
  const m = s.market;
  const kids: Calc[] = [];
  const n = (label: string, value: number, fmt: Calc['fmt'] = 'num', extra: Partial<Calc> = {}) => kids.push(calc(label, value, { fmt, ...extra }));
  let title = inst.name;
  let value = isFuture(inst) ? futPrice(inst, m) : unitValue(inst, m);
  let fmt: Calc['fmt'] = 'num';
  switch (inst.kind) {
    case 'stock':
      n('Spot price', m.eq.spot[inst.id]);
      n('Dividend yield', m.eq.div[inst.id], 'pct');
      n('Beta to US500', inst.beta, 'x');
      n('Idiosyncratic vol', inst.idioVol, 'pct');
      break;
    case 'ust': {
      const T = inst.maturity - m.t;
      const dirty = bondDirty(m, inst.coupon, T);
      n('Coupon', inst.coupon, 'pct');
      n('Years to maturity', T, 'num');
      n('Dirty price (Σ cash flows × Treasury discount factors)', dirty * 100);
      n('Accrued interest', accrued(inst.coupon, T) * 100);
      n('Clean price', bondClean(m, inst.coupon, T) * 100);
      n('Yield to maturity', bondYield(bondClean(m, inst.coupon, T), inst.coupon, T), 'rate');
      n('Price change for +1bp (per 100)', (unitValue(inst, bump(m, 'rates:usd', 0.0001)) - unitValue(inst, m)) * 100);
      value = quotePrice(inst, m);
      break;
    }
    case 'corp': {
      const T = inst.maturity - m.t;
      const sp = m.credit.spread[inst.issuer];
      n('Coupon', inst.coupon, 'pct');
      n('Credit spread (z-spread over Treasuries)', sp, 'bps');
      n('Clean price', bondClean(m, inst.coupon, T, sp) * 100);
      n('Yield', bondYield(bondClean(m, inst.coupon, T, sp), inst.coupon, T), 'rate');
      n('Risk-neutral default intensity', hazard(sp, m.credit.recovery[inst.issuer] ?? 0.4), 'pct');
      n('Price change for +1bp spread (CS01, per 100)', (unitValue(inst, bump(m, `cr:${inst.issuer}`, 1)) - unitValue(inst, m)) * 100);
      value = quotePrice(inst, m);
      break;
    }
    case 'irs': {
      const T = inst.maturity - m.t;
      const A = annuity(m, T);
      const par = swapPar(m, T);
      n('Fixed rate', inst.fixed, 'rate');
      n('Par swap rate today', par, 'rate');
      n('Annuity (Σ accrual × SOFR discount factor)', A);
      n('Value per $1 receiver = (fixed − par) × annuity', (inst.fixed - par) * A, 'num', { note: 'Equivalent to fixed × annuity − (1 − DF(T)) in a single-curve OIS world.' });
      n('DV01 per $1m receiver', (unitValue(inst, bump(m, 'rates:usd', 0.0001)) - unitValue(inst, m)) * 1e6, 'money');
      title = `${inst.name}`;
      value = unitValue(inst, m);
      break;
    }
    case 'fxFwd':
    case 'fxOpt': {
      const [b, q] = pairCcys(inst.pair);
      const T = Math.max(0, (inst.kind === 'fxFwd' ? inst.maturity : inst.expiry) - m.t);
      n('Spot', m.fx.spot[inst.pair]);
      n(`${b} interest rate`, b === 'USD' ? m.rates.sofr : m.rates.ccy[b], 'rate');
      n(`${q} interest rate`, q === 'USD' ? m.rates.sofr : m.rates.ccy[q], 'rate');
      n('Forward = spot × DF(base) / DF(quote)', fxForward(m, inst.pair, T));
      n('Strike', inst.strike);
      if (inst.kind === 'fxOpt') n('Implied vol (Garman-Kohlhagen)', m.fx.vol[inst.pair], 'pct');
      n('Value per unit of base, in USD', unitValue(inst, m), 'money');
      void usdPer;
      break;
    }
    case 'eqOpt': {
      const T = Math.max(0, inst.expiry - m.t);
      const F = eqForward(m, inst.underlying, T);
      n('Index level', m.eq.spot[inst.underlying]);
      n('Forward = S × e^((r − q)T)', F);
      n('Strike', inst.strike);
      n('Years to expiry', T);
      n('Implied vol at this strike (ATM + skew)', eqVol(m, inst.underlying, inst.strike, T), 'pct');
      n('Black-Scholes premium per index point', unitValue(inst, m) / inst.mult);
      n('Delta (per contract, index points)', (unitValue(inst, bump(m, `eq:${inst.underlying}`, 0.001)) - unitValue(inst, m)) / (m.eq.spot[inst.underlying] * 0.001) / inst.mult, 'num');
      n('Vega ($ per vol pt per contract)', unitValue(inst, bump(m, `vol:${inst.underlying}`, 0.01)) - unitValue(inst, m), 'money');
      break;
    }
    case 'cds': {
      const sp = m.credit.spread[inst.issuer];
      n('Market spread', sp + (inst.issuer.startsWith('CDX') ? 0 : m.credit.basis), 'bps');
      n('Standard running coupon', inst.coupon, 'bps');
      n('Risky PV01', rpv01(m, sp, 0.4, inst.maturity - m.t));
      n('Upfront (points paid by protection buyer)', unitValue(inst, m) * 100);
      value = quotePrice(inst, m);
      break;
    }
    case 'cmdtyFut':
    case 'cmdtyOpt': {
      const T = Math.max(0, ((inst as any).futExpiry ?? (inst as any).expiry) - m.t);
      n('Spot', m.cmdty.spot[inst.cmdty]);
      n('Curve carry (annualised, + contango / − backwardation)', m.cmdty.carry[inst.cmdty], 'pct');
      n('Futures price', cmdtyFwd(m, inst.cmdty, T));
      if (inst.kind === 'cmdtyOpt') n('Implied vol (Black-76)', m.cmdty.vol[inst.cmdty], 'pct');
      break;
    }
    case 'eqFut':
    case 'bondFut':
    case 'sofrFut':
      n('Futures price', futPrice(inst, m));
      if (inst.kind === 'eqFut') n('Fair basis = S × (e^((r−q)T) − 1)', futPrice(inst, m) - m.eq.spot.US500);
      if (inst.kind === 'sofrFut') n('Implied 3M SOFR forward', (100 - futPrice(inst, m)) / 100, 'rate');
      if (inst.kind === 'bondFut') n('Simplification', 0, 'num', { note: 'Priced as a notional 6% bond on the curve, carried forward to delivery; no cheapest-to-deliver switch option.' });
      break;
    case 'varSwap': {
      n('Strike vol', inst.strikeVol, 'pct');
      n('Implied vol (ATM × 1.08 for skew/convexity)', m.eq.atmVol.US500 * 1.08, 'pct');
      n('Realised variance accumulated (Σ r²)', (m.realised.US500 ?? 0) - inst.rv0, 'num');
      n('Value per unit variance notional', unitValue(inst, m), 'num');
      break;
    }
    case 'autocall': {
      n('Index at issue', inst.s0);
      n('Index now', m.eq.spot.US500);
      n('Coupon per quarter if called', inst.coupon, 'pct');
      n('Knock-in barrier at maturity', inst.kiLevel, 'pct');
      n('Remaining observations', inst.obs.filter((t) => t > m.t).length);
      n('Fair value per 100 (Monte Carlo, 1,500 paths)', autocallPayoffPV(m, inst) * 100);
      n('Note: Atlas is short the note', 0, 'num', { note: 'The bank owes the payoff. It gains when the note loses value (index falls, volatility rises) and hedges dynamically.' });
      break;
    }
  }
  const pos = s.desks[inst.desk].positions[inst.id];
  if (pos) kids.push(calc('Position value (USD)', positionValue(inst, pos, m), { note: isFuture(inst) ? 'Futures settle variation margin daily, so the position is worth only the move since the last settlement.' : undefined }));
  void qty;
  void unitNotional;
  void sofrZero;
  return calc(title, value, { fmt, children: kids, note: `Risk factors: ${factorKeys(inst).join(', ')}` });
}

export const PART_LABEL: Record<keyof PnlParts, string> = {
  spread: 'Client spread capture',
  flow: 'Electronic flow capture',
  execution: 'Execution costs (hedging & unwinds)',
  time: 'Time: carry, roll-down & theta',
  rates: 'Interest rates',
  fx: 'FX moves',
  equity: 'Equity moves',
  vol: 'Implied volatility',
  credit: 'Credit spreads',
  cmdty: 'Commodity prices',
  funding: 'Funding, repo & margin',
  accrual: 'Coupons, dividends & running payments',
  fees: 'Fees',
  defaults: 'Defaults & counterparty losses',
  other: 'Cross effects & residual',
};

export const PART_NOTE: Record<keyof PnlParts, string> = {
  spread: 'Edge vs mid on RFQs you won: half-spread × size, booked at trade time.',
  flow: 'Spread captured on electronic two-way flow (volume × captured spread).',
  execution: 'What you paid crossing the street to hedge or unwind (half-spread + temporary impact), net of the mark-up from your own permanent impact.',
  time: 'Revaluation from the passage of time alone: bond pull-to-par and roll-down, option theta, swap carry.',
  rates: 'Book revalued on today\'s yield curves vs yesterday\'s (≈ −DV01 × change in yields, plus convexity).',
  fx: 'Currency balances and FX derivatives revalued at today\'s spot rates.',
  equity: 'Shares, futures and option deltas revalued at today\'s prices.',
  vol: 'Options, variance swaps and notes revalued at today\'s implied volatilities.',
  credit: 'Bonds and CDS revalued at today\'s credit spreads.',
  cmdty: 'Futures and options revalued at today\'s commodity prices and curve shape.',
  funding: 'Interest on cash, repo and unsecured funding of inventory, borrow fees, initial-margin funding.',
  accrual: 'Coupons and dividends earned, swap and CDS running legs, interest on foreign-currency balances (carry).',
  fees: 'Exchange and clearing fees.',
  defaults: 'Jumps when an issuer or client defaults (bonds to recovery, CDS pays out, OTC close-outs).',
  other: 'Interaction terms of the step-wise revaluation and intraday market changes from events.',
};

export function explainParts(title: string, p: PnlParts): Calc {
  const rows = (Object.keys(PART_LABEL) as (keyof PnlParts)[]).filter((k) => Math.abs(p[k]) > 1).map((k) => calc(PART_LABEL[k], p[k], { note: PART_NOTE[k] }));
  return calc(title, rows.reduce((a, r) => a + r.value, 0), { formula: 'Σ components = change in desk value (cash + mark-to-market)', children: rows });
}

export function explainDeskValue(s: GameState, desk: DeskId): Calc {
  const d = s.desks[desk];
  const m = s.market;
  const kids: Calc[] = [calc('Cash (all currencies, in USD)', cashUsd(d, m))];
  for (const id in d.positions) kids.push(calc(s.instruments[id].name, positionValue(s.instruments[id], d.positions[id], m)));
  return calc(`${d.name}: book value`, deskValue(s, d), { formula: 'Cash + Σ position PVs', children: kids });
}

export function explainCapital(s: GameState, desk: DeskId, v: VarResult, worstStress: number): Calc {
  const c = deskCapital(s, desk, v, worstStress);
  return calc(`${s.desks[desk].name}: capital used`, c.total, {
    formula: 'market risk + stress add-on + counterparty + balance sheet (illustrative Basel-style)',
    children: [
      calc('Market risk: 3 × √10 × 1-day 99% VaR', c.marketRisk, { children: [calc('Desk VaR (99%, 1-day)', v.byDesk[desk].var99)] }),
      calc('Stress add-on: 25% of worst stress loss', c.stressAddon),
      calc('Counterparty: 8% × (positive MTM + potential future exposure) on client derivatives', c.counterparty),
      calc('Balance sheet: 3% of cash inventory', c.balanceSheet),
      calc('Initial margin posted (funded at FTP)', initialMargin(s, s.desks[desk], s.market)),
    ],
  });
}

export function explainEP(s: GameState): Calc {
  const last = s.history[s.history.length - 1];
  const alloc = Object.values(s.desks).reduce((a, d) => a + d.capital, 0);
  const costs = dailyCosts(s, 1);
  return calc('Economic profit (last close)', last?.ep ?? 0, {
    formula: 'Trading P&L − costs − 12% × capital (annual rate, per calendar day)',
    children: [
      calc('Trading P&L', last?.pnl ?? 0),
      calc('Daily costs (traders, desks, technology, risk infrastructure)', -costs.total, { note: 'Weekends cost money too: Friday closes carry three days of costs and capital charge.' }),
      calc(`Capital charge: ${fpct(HURDLE, 0)} × ${fm(alloc)} allocated / 365`, -(HURDLE * alloc) / 365),
    ],
  });
}
