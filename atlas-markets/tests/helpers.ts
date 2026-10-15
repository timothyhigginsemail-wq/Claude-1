import { deskValue, executeStreet } from '../src/engine/book';
import type { DeskId, GameState } from '../src/engine/types';
import { computeVaR, summarise } from '../src/engine/risk';
import { autoHedge } from '../src/game/flow';
import { unwindFraction } from '../src/game/day';
import { closeDay } from '../src/game/day';
import { resolveDecision } from '../src/game/manage';
import { executeHedge, hedgeIdeas, sendQuote } from '../src/game/rfq';

export type Policy = 'fair' | 'tight' | 'wide' | 'nohedge';

/** Autoplayer: quote every RFQ at fair × k, hedge winners with the first idea, launch desks, close. */
export function playDay(s: GameState, policy: Policy = 'fair') {
  for (const d of s.decisions.filter((x) => x.status === 'open')) resolveDecision(s, d.id, d.options[0].id);
  const k = policy === 'tight' ? 0.7 : policy === 'wide' ? 1.6 : 1;
  for (const r of s.rfqs) {
    if (r.status !== 'open') continue;
    const res = sendQuote(s, r, r.refHalfSpread * k, { coupon: 0.02 });
    if (res.won && policy !== 'nohedge') {
      const ideas = hedgeIdeas(s, r.desk, r.instId, -r.clientQty);
      const pick = ideas.find((i) => !i.working) ?? ideas[0];
      if (pick) executeHedge(s, r.desk, pick);
    }
  }
  if (policy !== 'nohedge') manageRisk(s);
  return closeDay(s);
}

/** What a sensible desk head does before the close: bring desks back inside ~80% of limits. */
export function manageRisk(s: GameState) {
  const v = computeVaR(s);
  for (const id of Object.keys(s.desks) as DeskId[]) {
    const d = s.desks[id];
    if (!d.unlocked) continue;
    const r = summarise(s, id);
    if (v.byDesk[id].var99 > 0.8 * d.limits.var || r.primary > 0.8 * d.limits.primary) {
      autoHedge(s, id, 0.8);
      const v2 = computeVaR(s);
      if (v2.byDesk[id].var99 > 0.8 * d.limits.var) unwindFraction(s, id, 0.35);
    }
  }
}

export function totalValue(s: GameState) {
  return Object.values(s.desks).reduce((a, d) => a + deskValue(s, d), 0);
}

export { executeStreet };
