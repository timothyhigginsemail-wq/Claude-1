// Step-wise P&L attribution. Starting from yesterday's market, the market is moved to today's one
// factor group at a time (time → rates → FX → equity → volatility → credit → commodities) and the
// whole book is revalued after each step. Each step's change is that factor's P&L; together they
// sum exactly to the mark-to-market change. Cross effects (e.g. vanna) land in whichever group moves
// later — the usual convention for sequential attribution.

import { structuredCloneMarket } from './market';
import { valueOfDesk } from './risk';
import type { DeskId, GameState, MarketState, PnlParts } from './types';

export const ATTR_STEPS: { key: keyof PnlParts; label: string; apply: (h: MarketState, to: MarketState) => void }[] = [
  {
    key: 'time',
    label: 'Time (theta, carry, roll-down)',
    apply: (h, to) => {
      h.t = to.t;
      h.day = to.day;
    },
  },
  {
    key: 'rates',
    label: 'Interest rates',
    apply: (h, to) => {
      h.rates = structuredCloneMarket(to).rates;
    },
  },
  {
    key: 'fx',
    label: 'FX spot',
    apply: (h, to) => {
      h.fx.spot = { ...to.fx.spot };
    },
  },
  {
    key: 'equity',
    label: 'Equity prices',
    apply: (h, to) => {
      h.eq.spot = { ...to.eq.spot };
      h.eq.div = { ...to.eq.div };
      h.eq.etfPrem = to.eq.etfPrem;
      h.realised = { ...to.realised };
    },
  },
  {
    key: 'vol',
    label: 'Implied volatility',
    apply: (h, to) => {
      h.eq.atmVol = { ...to.eq.atmVol };
      h.eq.skew = to.eq.skew;
      h.fx.vol = { ...to.fx.vol };
      h.cmdty.vol = { ...to.cmdty.vol };
    },
  },
  {
    key: 'credit',
    label: 'Credit spreads',
    apply: (h, to) => {
      h.credit = structuredCloneMarket(to).credit;
    },
  },
  {
    key: 'cmdty',
    label: 'Commodities',
    apply: (h, to) => {
      h.cmdty.spot = { ...to.cmdty.spot };
      h.cmdty.carry = { ...to.cmdty.carry };
    },
  },
];

/** Attribute the change in each desk's value from market `from` to market `to` (positions fixed). */
export function attributeMove(s: GameState, from: MarketState, to: MarketState): Record<DeskId, Partial<PnlParts>> {
  const out = {} as Record<DeskId, Partial<PnlParts>>;
  const desks = Object.keys(s.desks) as DeskId[];
  let h = structuredCloneMarket(from);
  let prev: Record<string, number> = {};
  for (const d of desks) {
    prev[d] = valueOfDesk(s, s.desks[d], h);
    out[d] = {};
  }
  for (const step of ATTR_STEPS) {
    step.apply(h, to);
    const now: Record<string, number> = {};
    for (const d of desks) {
      now[d] = valueOfDesk(s, s.desks[d], h);
      (out[d] as any)[step.key] = now[d] - prev[d];
    }
    prev = now;
  }
  // anything not covered by the groups (regime/liquidity fields have no PV effect)
  h = structuredCloneMarket(to);
  for (const d of desks) {
    const final = valueOfDesk(s, s.desks[d], h);
    out[d].other = final - prev[d];
  }
  return out;
}
