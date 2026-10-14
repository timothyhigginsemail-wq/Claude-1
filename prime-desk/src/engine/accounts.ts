// Client account mechanics: valuation, trade settlement, deposits/withdrawals, marking shorts and
// futures to market. Customer securities positions are memo records; cash effects go through the
// double-entry ledger.

import { ACC, bal, clientCash, clientShortProceeds, post } from './ledger';
import type { Client, ClientId, GameState, SecId, Security } from './types';

export const CLEARING_BPS = 0.4; // clearing & settlement fee on traded notional (illustrative)
export const FUT_FEE_PER_CONTRACT = 1.5;

export function isCash(sec: Security): boolean {
  return sec.kind !== 'future';
}

export function notional(sec: Security, qty: number): number {
  return qty * sec.price * (sec.multiplier ?? 1);
}

export interface AccountValue {
  longMV: number;
  shortMV: number;
  gmv: number; // gross market value of cash positions
  nmv: number;
  futNotional: number; // signed
  futGross: number;
  cash: number; // client perspective (+credit)
  debit: number;
  credit: number;
  shortProceeds: number;
  equity: number;
  /** Gross leverage = (GMV + futures gross notional) / equity. */
  leverage: number;
  /** Cash-securities leverage = GMV / equity. */
  cashLeverage: number;
}

export function accountValue(s: GameState, c: Client): AccountValue {
  let longMV = 0;
  let shortMV = 0;
  let futNotional = 0;
  let futGross = 0;
  for (const id in c.positions) {
    const q = c.positions[id];
    if (!q) continue;
    const sec = s.securities[id];
    if (sec.kind === 'future') {
      const n = notional(sec, q);
      futNotional += n;
      futGross += Math.abs(n);
    } else if (q > 0) longMV += q * sec.price;
    else shortMV += -q * sec.price;
  }
  const cash = clientCash(s, c.id);
  const sp = clientShortProceeds(s, c.id);
  const equity = cash + sp + longMV - shortMV;
  const gmv = longMV + shortMV;
  return {
    longMV,
    shortMV,
    gmv,
    nmv: longMV - shortMV,
    futNotional,
    futGross,
    cash,
    debit: Math.max(0, -cash),
    credit: Math.max(0, cash),
    shortProceeds: sp,
    equity,
    leverage: equity > 0 ? (gmv + futGross) / equity : Infinity,
    cashLeverage: equity > 0 ? gmv / equity : Infinity,
  };
}

export function activeClients(s: GameState): Client[] {
  return Object.values(s.clients).filter((c) => c.status === 'active');
}

/** Client deposits cash into its Atlas account (wire in). */
export function deposit(s: GameState, id: ClientId, amount: number, memo = 'Client cash deposit') {
  if (amount <= 0) return;
  post(s, 'deposit', memo, [
    { account: ACC.cash, amount },
    { account: ACC.cliCash(id), amount: -amount },
  ], id);
}

/** Client withdraws cash (wire out). Withdrawals beyond a credit balance increase the margin loan. */
export function withdraw(s: GameState, id: ClientId, amount: number, memo = 'Client cash withdrawal') {
  if (amount <= 0) return;
  post(s, 'withdrawal', memo, [
    { account: ACC.cash, amount: -amount },
    { account: ACC.cliCash(id), amount },
  ], id);
}

/**
 * Settle a client trade at the current price. qty > 0 buys, qty < 0 sells. Splits into closing and
 * opening legs:
 *  - buy long:     Atlas pays the street; client cash debited (margin loan grows)
 *  - sell long:    Atlas receives from the street; client cash credited
 *  - sell short:   Atlas receives short-sale proceeds; credited to the client's short account (restricted)
 *  - buy to cover: Atlas pays the street out of the short account (proceeds released)
 * Futures settle no cash at trade; variation margin settles daily.
 * Returns traded notional.
 */
export function trade(s: GameState, id: ClientId, secId: SecId, qty: number, memo?: string, feeBps = CLEARING_BPS, pxOverride?: number): number {
  if (!qty) return 0;
  const c = s.clients[id];
  const sec = s.securities[secId];
  const before = c.positions[secId] ?? 0;
  const after = before + qty;
  const px = pxOverride ?? sec.price;
  if (sec.kind === 'future') {
    c.positions[secId] = after;
    if (Math.abs(after) < 1e-9) delete c.positions[secId];
    const fee = Math.abs(qty) * FUT_FEE_PER_CONTRACT;
    post(s, 'fee', `Futures clearing fee ${secId}`, [
      { account: ACC.cliCash(id), amount: fee },
      { account: ACC.pnl('clearing'), amount: -fee },
    ], id);
    c.pnlToday.clearing += fee;
    return Math.abs(notional(sec, qty));
  }
  const label = memo ?? `${qty > 0 ? 'Buy' : 'Sell'} ${secId}`;
  // closing leg
  let closeQty = 0;
  if (before > 0 && qty < 0) closeQty = Math.max(qty, -before); // selling long (negative)
  if (before < 0 && qty > 0) closeQty = Math.min(qty, -before); // covering short (positive)
  const openQty = qty - closeQty;
  if (closeQty) {
    const amt = closeQty * px;
    if (closeQty < 0) {
      // sell long: cash in
      post(s, 'trade', `${label}: sell long ${fmtQ(-closeQty)} @ ${px.toFixed(2)}`, [
        { account: ACC.cash, amount: -amt },
        { account: ACC.cliCash(id), amount: amt },
      ], id);
    } else {
      // buy to cover: pay street from short account
      post(s, 'trade', `${label}: buy to cover ${fmtQ(closeQty)} @ ${px.toFixed(2)}`, [
        { account: ACC.cash, amount: -amt },
        { account: ACC.cliSP(id), amount: amt },
      ], id);
    }
  }
  if (openQty) {
    const amt = openQty * px;
    if (openQty > 0) {
      post(s, 'trade', `${label}: buy ${fmtQ(openQty)} @ ${px.toFixed(2)}`, [
        { account: ACC.cash, amount: -amt },
        { account: ACC.cliCash(id), amount: amt },
      ], id);
    } else {
      post(s, 'trade', `${label}: sell short ${fmtQ(-openQty)} @ ${px.toFixed(2)}`, [
        { account: ACC.cash, amount: -amt },
        { account: ACC.cliSP(id), amount: amt },
      ], id);
    }
  }
  c.positions[secId] = after;
  if (Math.abs(after) < 1e-9) delete c.positions[secId];
  const tradedNotional = Math.abs(qty * px);
  const fee = (tradedNotional * feeBps) / 1e4;
  if (fee > 0) {
    post(s, 'fee', `Clearing & settlement fee ${secId}`, [
      { account: ACC.cliCash(id), amount: fee },
      { account: ACC.pnl('clearing'), amount: -fee },
    ], id);
    c.pnlToday.clearing += fee;
  }
  return tradedNotional;
}

/** Mark short positions to market: the short-account credit tracks the short's market value and the
 * difference moves between the short account and the margin (cash) account. */
export function markShorts(s: GameState, c: Client) {
  let shortMV = 0;
  for (const id in c.positions) {
    const q = c.positions[id];
    const sec = s.securities[id];
    if (q < 0 && sec.kind !== 'future') shortMV += -q * sec.price;
  }
  const sp = clientShortProceeds(s, c.id);
  const delta = shortMV - sp; // increase in short-account credit
  if (Math.abs(delta) > 1e-6) {
    post(s, 'mark', `Mark shorts to market (${delta >= 0 ? '+' : ''}${(delta / 1e6).toFixed(2)}m)`, [
      { account: ACC.cliSP(c.id), amount: -delta },
      { account: ACC.cliCash(c.id), amount: delta },
    ], c.id);
  }
}

/** Futures variation margin: settled daily in cash through the clearing house. */
export function settleVariationMargin(s: GameState, c: Client) {
  let vm = 0;
  for (const id in c.positions) {
    const sec = s.securities[id];
    if (sec.kind !== 'future') continue;
    vm += c.positions[id] * (sec.price - sec.prevPrice) * (sec.multiplier ?? 1);
  }
  if (Math.abs(vm) > 1e-6) {
    post(s, 'vm', `Futures variation margin ${vm >= 0 ? 'received' : 'paid'}`, [
      { account: ACC.cash, amount: vm },
      { account: ACC.cliCash(c.id), amount: -vm },
    ], c.id);
  }
}

export function fmtQ(q: number): string {
  if (Math.abs(q) >= 1e6) return (q / 1e6).toFixed(2) + 'm';
  if (Math.abs(q) >= 1e3) return (q / 1e3).toFixed(1) + 'k';
  return q.toFixed(0);
}

export function positionMV(s: GameState, secId: SecId, qty: number): number {
  const sec = s.securities[secId];
  return notional(sec, qty);
}

export function deskCash(s: GameState) {
  return bal(s.ledger, ACC.cash);
}
