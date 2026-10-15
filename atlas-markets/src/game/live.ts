// The live trading day: advancing the clock moves prices, releases news and brings in client RFQs.

import { attributeMove } from '../engine/attribution';
import { CLOSE_MIN, clockLabel, marketAt, minuteOf } from '../engine/intraday';
import { quotePrice } from '../engine/pricing';
import type { GameState, PnlParts } from '../engine/types';
import { rfqEconomics } from './rfq';

/** Market minutes an unanswered request stays live before the client goes elsewhere. */
export const RFQ_TTL = 30;

/**
 * Attribute the market move since the last mark to today's P&L, for the positions held over that
 * interval. Must run before positions change (any trade) so intraday P&L is explained exactly.
 */
export function syncMarket(s: GameState) {
  if (!s.plan || s.markClock === s.clock) return;
  const from = marketAt(s, s.markClock);
  const attr = attributeMove(s, from, s.market);
  for (const id in attr) {
    const d = s.desks[id as keyof GameState['desks']];
    for (const k in attr[id as keyof typeof attr]) (d.pnlToday as any)[k as keyof PnlParts] += (attr as any)[id][k];
  }
  s.markClock = s.clock;
}

/** Move the clock (and the live market) forward to `min`. Positions are untouched. */
export function advanceTo(s: GameState, min: number, holdRfq?: string | null) {
  const target = Math.max(s.clock, Math.min(CLOSE_MIN, min));
  if (s.plan) {
    for (const ev of s.plan.events) {
      if (ev.minute > s.clock && ev.minute <= target) for (const n of ev.notes) s.news.push({ minute: ev.minute, text: n.text, tone: n.tone });
    }
  }
  s.clock = target;
  s.market = marketAt(s, target);
  for (const r of s.rfqs) {
    if (r.status !== 'open') continue;
    const arr = minuteOf(r.time);
    if (arr > target) continue;
    if (!r.arrived) {
      r.arrived = true;
      r.mid = r.instId.startsWith('SPOT:') ? s.market.fx.spot[r.instId.slice(5)] : quotePrice(s.instruments[r.instId], s.market);
      r.refHalfSpread = rfqEconomics(s, r).fair;
    }
    if (target - arr > RFQ_TTL && r.id !== holdRfq) {
      r.status = 'expired';
      const c = s.clients[r.clientId];
      c.noQuotes++;
      c.relationship = Math.max(0, c.relationship - 0.5);
      s.stats.rfqPassed++;
    }
  }
}

export function rfqVisible(s: GameState, r: { time: string }) {
  return minuteOf(r.time) <= s.clock;
}

export function minutesLeft(s: GameState, r: { time: string }) {
  return Math.max(0, minuteOf(r.time) + RFQ_TTL - s.clock);
}

export { CLOSE_MIN, clockLabel };
