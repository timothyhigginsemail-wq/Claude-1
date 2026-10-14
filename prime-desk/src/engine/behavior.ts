// Hedge fund behaviour: fund-level NAV & liquidity, daily trading toward the PM's target book
// within Atlas's limits, wallet-share migration, margin-call responses, liquidation and default.

import { accountValue, deposit, notional, trade, withdraw } from './accounts';
import { calc } from './explain';
import { ACC, clientCash, clientDebit, post } from './ledger';
import { borrowTier, clientFee, internalSupply, lenderFree } from './lending';
import { computeMargin } from './margin';
import { chance, rand, randNormal } from './rng';
import { liquidationCostFor } from './risk';
import type { Client, GameState, SecId } from './types';

export const RATING_SPREAD: Record<string, number> = { A: 0, BBB: 15, BB: 45, B: 110, CCC: 220 };

/** Best competing financing quote a client could get today (bps over SOFR). */
export function bestCompetitorQuote(s: GameState, c: Client): { competitorId: string; spread: number; marginMult: number } {
  let best = { competitorId: 'ironbridge', spread: 999, marginMult: 1 };
  const crisisAdd = s.market.regime === 'crisis' ? 60 : s.market.regime === 'stressed' ? 25 : 0;
  for (const comp of Object.values(s.competitors)) {
    if (comp.health < 0.35) continue;
    const quote = comp.baseSpreadBps + RATING_SPREAD[c.profile.rating] * (1.2 - comp.aggression * 0.5) - comp.aggression * 10 + crisisAdd * (1.3 - comp.balanceSheet);
    const sizeDiscount = c.fund.nav > 10e9 ? 10 : 0;
    const q = Math.round(quote - sizeDiscount);
    if (q < best.spread) best = { competitorId: comp.id, spread: q, marginMult: comp.marginMult };
  }
  return best;
}

/** Stylised "all-in" attractiveness of Atlas's terms vs the market, −1..1. */
export function termsScore(s: GameState, c: Client): number {
  const best = bestCompetitorQuote(s, c);
  const priceGap = (best.spread - c.terms.financingSpreadBps) / 40; // + if we are cheaper
  const marginGap = (best.marginMult - c.terms.imMultiplier) * 2; // + if we are more lenient
  const rehyp = (1.4 - c.terms.rehypCapPct) * 0.3; // funds like lower rehyp caps (asset safety)
  const lock = Math.min(c.terms.lockupDays, 90) / 90 * 0.3;
  const sens = c.profile.priceSensitivity;
  const raw = sens * priceGap + (1 - sens) * 0.6 * marginGap + rehyp + lock;
  return Math.max(-1, Math.min(1, raw / 2));
}

export function regimeGrossFactor(s: GameState, c: Client): number {
  const sd = c.profile.stressDeleverage;
  switch (s.market.regime) {
    case 'crisis':
      return 1 - 0.55 * sd;
    case 'stressed':
      return 1 - 0.3 * sd;
    case 'choppy':
      return 1 - 0.08 * sd;
    case 'bull':
      return 1.05;
    default:
      return 1;
  }
}

/** Evaluate Atlas's limits for hypothetical positions (equity is unchanged by trades at market). */
export function checkLimits(s: GameState, c: Client, positions: Record<SecId, number>) {
  const saved = c.positions;
  c.positions = positions;
  const m = computeMargin(s, c);
  const av = accountValue(s, c);
  c.positions = saved;
  // cash after trades ≈ equity − LMV (short proceeds track short MV) — ignore fees
  const debitAfter = Math.max(0, av.longMV - m.equity);
  return {
    margin: m,
    leverage: m.equity > 0 ? (av.gmv + av.futGross) / m.equity : Infinity,
    debit: debitAfter,
    okMargin: m.equity >= m.initial,
    okLev: m.equity > 0 && (av.gmv + av.futGross) / m.equity <= c.terms.maxGrossLeverage + 1e-9,
    okDebit: debitAfter <= c.terms.creditLimit + 1e-6,
  };
}

function scaledTargets(s: GameState, c: Client, scale: number): Record<SecId, number> {
  const av = accountValue(s, c);
  const base = c.fund.anchorEquity > 0 ? Math.min(c.fund.anchorEquity, Math.max(0, av.equity) * 1.6) : Math.max(0, av.equity);
  const g = base * c.profile.targetGross * regimeGrossFactor(s, c) * scale;
  const out: Record<SecId, number> = {};
  for (const id in c.profile.book) {
    const sec = s.securities[id];
    out[id] = (c.profile.book[id] * g) / (sec.price * (sec.multiplier ?? 1));
  }
  return out;
}

export interface TradingResult {
  traded: number;
  constrained: number;
  wantedHTB: { secId: SecId; qty: number }[];
  fails: SecId[];
}

/** Units of `secId` Atlas could source today for new shorts (internal + any lender). */
export function sourceableUnits(s: GameState, secId: SecId, excludeClient?: string): number {
  const internal = internalSupply(s, secId, excludeClient).reduce((a, r) => a + r.units, 0);
  let ext = 0;
  for (const l of Object.keys(s.lenders)) ext += lenderFree(s, l, secId);
  return internal + ext;
}

/**
 * Daily trading: move toward the PM's target book. Large new shorts in HTB names are not
 * auto-located — they come to the desk as borrow requests. Increases are scaled back to fit
 * Atlas's margin, leverage and credit limits (which the fund notices).
 */
export function clientTrading(s: GameState, c: Client, opts: { pace?: number; autoLocate?: boolean; noChurn?: boolean; noDrift?: boolean } = {}): TradingResult {
  const res: TradingResult = { traded: 0, constrained: 0, wantedHTB: [], fails: [] };
  const av = accountValue(s, c);
  if (av.equity <= 0) return res;
  // drift the book: PMs rotate positions over time
  if (!opts.noDrift) {
    for (const id in c.profile.book) {
      const w = c.profile.book[id];
      c.profile.book[id] = w * (1 + randNormal(s) * 0.03);
    }
    normaliseBook(c);
  }
  // positions are sticky: low-turnover funds (activists, credit) barely trade day to day
  const pace = opts.pace ?? Math.min(0.6, 0.03 + c.profile.turnover * 4);
  const target = scaledTargets(s, c, 1);
  const desired: Record<SecId, number> = { ...c.positions };
  for (const id of new Set([...Object.keys(target), ...Object.keys(c.positions)])) {
    const cur = c.positions[id] ?? 0;
    const tgt = target[id] ?? 0;
    let next = cur + (tgt - cur) * pace;
    const sec = s.securities[id];
    if (next < cur && next < 0 && sec.kind !== 'future') {
      // increasing a short: needs a locate (Reg SHO) before Atlas lets the sale through
      const floorQty = cur < 0 ? cur : 0;
      const addUnits = floorQty - next;
      if (addUnits > 0) {
        const fee = clientFee(s, c, id);
        if (fee > c.profile.maxBorrowFeeBps) {
          next = floorQty;
        } else if (!opts.autoLocate && borrowTier(sec) === 'HTB' && addUnits * sec.price > 4e6) {
          res.wantedHTB.push({ secId: id, qty: addUnits });
          next = floorQty;
        } else {
          const avail = sourceableUnits(s, id, c.id);
          if (addUnits > avail) {
            res.fails.push(id);
            next = floorQty - avail;
          }
        }
      }
    }
    // existing HTB shorts the PM no longer wants to pay for
    if (next < 0 && sec.kind !== 'future' && clientFee(s, c, id) > c.profile.maxBorrowFeeBps) next = next * 0.7;
    desired[id] = next;
  }
  // scale back increases to fit Atlas limits
  let scale = 1;
  const build = (k: number) => {
    const out: Record<SecId, number> = {};
    for (const id in desired) {
      const cur = c.positions[id] ?? 0;
      const d = desired[id] - cur;
      const increasing = Math.abs(desired[id]) > Math.abs(cur);
      out[id] = increasing ? cur + d * k : desired[id];
    }
    return out;
  };
  let chk = checkLimits(s, c, build(1));
  if (!(chk.okMargin && chk.okLev && chk.okDebit)) {
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 7; i++) {
      const mid = (lo + hi) / 2;
      const ck = checkLimits(s, c, build(mid));
      if (ck.okMargin && ck.okLev && ck.okDebit) lo = mid;
      else hi = mid;
    }
    scale = lo;
    chk = checkLimits(s, c, build(scale));
    res.constrained = 1 - scale;
  }
  const final = build(scale);
  for (const id in final) {
    const q = final[id] - (c.positions[id] ?? 0);
    const sec = s.securities[id];
    const minUnits = sec.kind === 'future' ? 1 : 1000 / sec.price;
    if (Math.abs(q) < minUnits) continue;
    const qq = sec.kind === 'future' ? Math.round(q) : q;
    if (!qq) continue;
    res.traded += trade(s, c.id, id, qq, `${c.short} rebalance`);
  }
  // intraday churn (round-trips that net out) — generates clearing revenue
  const churn = opts.noChurn ? 0 : accountValue(s, c).gmv * c.profile.turnover;
  if (churn > 0) {
    const fee = (churn * 2 * 0.4) / 1e4;
    post(s, 'fee', `${c.short} intraday turnover clearing fees`, [
      { account: ACC.cliCash(c.id), amount: fee },
      { account: ACC.pnl('clearing'), amount: -fee },
    ], c.id);
    c.pnlToday.clearing += fee;
  }
  c.constrained = c.constrained * 0.7 + res.constrained * 0.3;
  return res;
}

export function normaliseBook(c: Client) {
  let g = 0;
  for (const id in c.profile.book) g += Math.abs(c.profile.book[id]);
  if (g <= 0) return;
  for (const id in c.profile.book) c.profile.book[id] /= g;
}

/** Fund-level NAV evolution and liquidity. Fund return ≈ return of its Atlas book plus alpha/noise. */
export function updateFund(s: GameState, c: Client) {
  const av = accountValue(s, c);
  let pnl = 0;
  for (const id in c.positions) {
    const sec = s.securities[id];
    pnl += c.positions[id] * (sec.price - sec.prevPrice) * (sec.multiplier ?? 1);
  }
  const eqPrev = Math.max(1, av.equity - pnl);
  const r = pnl / eqPrev + c.profile.alpha / 252 + randNormal(s) * 0.002;
  const f = c.fund;
  f.nav = Math.max(0, f.nav * (1 + r));
  f.peakNav = Math.max(f.peakNav, f.nav);
  f.anchorEquity += (Math.max(0, av.equity) - f.anchorEquity) * 0.08;
  f.recentReturn = f.recentReturn * 0.95 + r;
  // fund keeps some unencumbered cash outside prime brokers; replenishes slowly in calm markets
  const tgtLiq = (c.profile.style === 'credit' ? 0.05 : c.profile.style === 'activist' ? 0.04 : 0.08) * f.nav;
  const calm = s.market.regime === 'crisis' || s.market.regime === 'stressed' ? 0.02 : 0.08;
  f.freeCash = Math.max(0, f.freeCash + (tgtLiq - f.freeCash) * calm + f.freeCash * r * 0.5);
  // redemptions after poor performance
  if (f.recentReturn < -0.08 && f.redemptionsPending <= 0 && chance(s, 0.25)) {
    f.redemptionsPending = f.nav * (0.06 + rand(s) * 0.1);
  }
}

/** Move equity in/out of the Atlas account as the fund's wallet share or NAV changes. */
export function rebalanceWallet(s: GameState, c: Client) {
  const av = accountValue(s, c);
  const target = c.fund.nav * c.walletShare;
  const gap = target - av.equity;
  if (Math.abs(gap) < 0.01 * Math.max(av.equity, 1)) return;
  const move = gap * 0.15;
  if (move > 0) {
    const fromCash = Math.min(move, c.fund.freeCash * 0.5);
    if (fromCash > 0) {
      deposit(s, c.id, fromCash, `${c.short} moves balances to Atlas`);
      c.fund.freeCash -= fromCash;
    }
  } else {
    // withdraw only genuine excess (equity above initial requirement)
    const m = computeMargin(s, c);
    const amt = Math.min(-move, Math.max(0, m.excess * 0.5));
    if (amt > 0) {
      withdraw(s, c.id, amt, `${c.short} moves balances away from Atlas`);
      c.fund.freeCash += amt;
    }
  }
}

export function updateSatisfaction(s: GameState, c: Client) {
  const ts = termsScore(s, c);
  const fails = Math.min(1, c.borrowFails / 5);
  const target = ts * 0.7 + (c.relationship - 50) / 100 - fails * 0.5 - c.constrained * 0.6;
  c.satisfaction = Math.max(-1, Math.min(1, c.satisfaction * 0.85 + target * 0.15));
  c.borrowFails = Math.max(0, c.borrowFails * 0.9);
  const delta = c.satisfaction > 0.15 ? 0.006 : c.satisfaction < -0.15 ? -0.012 : 0;
  c.walletShare = Math.max(0.03, Math.min(0.65, c.walletShare * (1 + delta)));
}

export interface LiquidationResult {
  proceeds: number;
  impactCost: number;
  units: Record<SecId, number>;
}

/** Liquidate a fraction of a client's positions with market impact (also moves prices for everyone). */
export function liquidate(s: GameState, c: Client, fraction: number, speed: 'fire' | 'orderly', memo: string): LiquidationResult {
  const res: LiquidationResult = { proceeds: 0, impactCost: 0, units: {} };
  for (const id of Object.keys(c.positions)) {
    const q = c.positions[id];
    const sec = s.securities[id];
    const sell = -q * fraction;
    if (Math.abs(sell) < 1e-9) continue;
    const mv = notional(sec, sell);
    const costRate = sec.kind === 'future' ? 0.0005 : liquidationCostFor(s, id, mv) / Math.max(1, Math.abs(mv)) * (speed === 'fire' ? 1.6 : 0.8);
    // selling longs below market, buying back shorts above market
    const px = sec.kind === 'future' ? sec.price : sec.price * (1 - Math.sign(q) * costRate);
    res.impactCost += Math.abs(mv) * costRate;
    res.units[id] = sell;
    trade(s, c.id, id, sell, memo, 0.4, px);
    // permanent impact on the market price (contagion to other holders)
    if (sec.kind !== 'future') {
      const perm = Math.min(0.15, costRate * 0.5);
      sec.price = Math.max(0.5, sec.price * (1 - Math.sign(q) * perm));
    }
  }
  return res;
}

/** Write off an unsecured client deficit after close-out. */
export function writeOff(s: GameState, c: Client, memo: string): number {
  const debit = clientDebit(s, c.id);
  if (debit <= 0) return 0;
  post(s, 'creditloss', memo, [
    { account: ACC.pnl('creditLoss'), amount: debit },
    { account: ACC.cliCash(c.id), amount: -debit },
  ], c.id);
  c.pnlToday.creditLoss -= debit;
  return debit;
}

/** Close the account: positions transferred out / closed at market and remaining credit wired out. */
export function closeAccount(s: GameState, c: Client, memo: string) {
  for (const id of Object.keys(c.positions)) {
    trade(s, c.id, id, -c.positions[id], memo, 0);
  }
  const cash = clientCash(s, c.id);
  if (cash > 0) withdraw(s, c.id, cash, `${c.short}: residual credit wired out`);
}

export function fundSituation(s: GameState, c: Client) {
  const av = accountValue(s, c);
  const m = computeMargin(s, c);
  const atlasShare = c.walletShare;
  const otherEquity = Math.max(0, c.fund.nav - av.equity - c.fund.freeCash);
  return {
    equityAtAtlas: av.equity,
    initial: m.initial,
    maintenance: m.maintenance,
    deficit: Math.max(0, m.initial - av.equity),
    fundNav: c.fund.nav,
    freeCash: c.fund.freeCash,
    otherPBEquity: otherEquity,
    atlasShare,
    explain: calc(`${c.short}: where the fund's money is`, c.fund.nav, {
      note: 'Atlas can only seize collateral it controls. Equity at other prime brokers is pledged to them first; Atlas would have an unsecured legal claim against the fund for any shortfall.',
      children: [
        calc('Equity in Atlas account (Atlas has a lien, immediate control)', av.equity),
        calc('Equity at other prime brokers (pledged to them, not available to Atlas)', otherEquity),
        calc('Unencumbered cash at the fund (available to meet calls)', c.fund.freeCash),
      ],
    }),
  };
}
