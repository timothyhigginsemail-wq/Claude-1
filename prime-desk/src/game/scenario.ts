// The opening campaign: a 30-day arc from an empty desk through growth, a funding squeeze, a short
// squeeze and a concentrated-fund crisis. Beats set conditions (new prospects, market shocks,
// funding shocks); outcomes come from the same engine mechanics as every other day.
// After day 30 the game continues procedurally.

import { activeClients } from '../engine/accounts';
import { clientDebit } from '../engine/ledger';
import type { MarketMoveOpts } from '../engine/market';
import { setRegime } from '../engine/market';
import { rand } from '../engine/rng';
import type { GameEvent, GameState } from '../engine/types';
import {
  makeBorrowRequest,
  makeCompetitorOffer,
  makeCounterpartyNews,
  makeCrowding,
  makeFinancingRequest,
  makeFundingShock,
  makeGiveUp,
  makeOnboarding,
  makeReview,
  makeSqueezeAlert,
  makeTermFunding,
} from './events';
import { accountValue } from '../engine/accounts';

/** Market conditions forced for today's close (applied before the random model). */
export function scriptedMarket(s: GameState): MarketMoveOpts {
  const d = s.day;
  switch (d) {
    case 14:
      return { secShocks: { QRTL: 0.12 } };
    case 15:
      s.securities.QRTL.squeeze = 1.0;
      return { secShocks: { QRTL: 0.35 } };
    case 16:
      return { secShocks: { QRTL: 0.22 } };
    case 17:
      return { secShocks: { QRTL: -0.18 } };
    case 21:
      setRegime(s, 'stressed');
      return { holdRegime: true, mktReturn: -0.021, secShocks: { CLDR: -0.13 } };
    case 22:
      setRegime(s, 'crisis');
      s.competitors.kestrel.health = 0.45;
      return { holdRegime: true, mktReturn: -0.038, secShocks: { CLDR: -0.7, VOLT: 0.08, HLXS: 0.06 } };
    case 23:
      return { holdRegime: true, mktReturn: -0.042, secShocks: { CLDR: -0.16 } };
    case 24:
      s.competitors.kestrel.health = 0.25;
      return { holdRegime: true, mktReturn: -0.016 };
    case 25:
      setRegime(s, 'recovery');
      return { holdRegime: true, mktReturn: 0.031 };
    case 26:
      return { holdRegime: true, mktReturn: 0.012 };
  }
  if (d < 21 && d > 2 && (s.market.regime === 'stressed' || s.market.regime === 'crisis')) {
    // keep the opening calm enough to build a book; the scripted crisis arrives on day 21
    setRegime(s, 'choppy');
  }
  return d < 21 ? { holdRegime: s.market.regime === 'choppy' && d < 8 } : {};
}

/** Scripted morning events for the opening campaign. */
export function scriptedEvents(s: GameState): GameEvent[] {
  const d = s.day;
  const ev: GameEvent[] = [];
  const cl = s.clients;
  const active = (id: string) => cl[id] && cl[id].status === 'active';
  // new prospects arriving
  for (const c of Object.values(cl)) {
    if (c.status === 'prospect' && c.arrivalDay === d) {
      const e = makeOnboarding(s, c);
      e.time = ev.length === 0 ? '09:12' : '11:05';
      ev.push(e);
    }
  }
  if (d === 3) {
    if (active('vector')) ev.push(makeBorrowRequest(s, cl.vector, 'HLXS', 80e6 / s.securities.HLXS.price));
    else if (active('northstar')) ev.push(makeBorrowRequest(s, cl.northstar, 'STRM', 20e6 / s.securities.STRM.price));
  }
  if (d === 4) {
    const c = active('northstar') ? cl.northstar : activeClients(s)[0];
    if (c) {
      const g = makeGiveUp(s, c);
      if (g) ev.push(g);
    }
    ev.push(makeTermFunding(s));
  }
  if (d === 8) {
    s.market.shockBps += 40;
    s.market.repoStressBps += 40;
    s.market.ftpSpreadBps += 15;
    ev.push(makeFundingShock(s, 40));
  }
  if (d === 9 && active('northstar')) ev.push(makeCompetitorOffer(s, cl.northstar));
  if (d === 10) {
    if (active('redwood')) {
      const av = accountValue(s, cl.redwood);
      ev.push(makeFinancingRequest(s, cl.redwood, Math.max(40e6, av.equity * 0.6), 160, av.leverage + 0.8));
    }
    ev.push(makeReview(s));
  }
  if (d === 11 && active('meridian')) {
    ev.push(makeFinancingRequest(s, cl.meridian, 150e6, 125, 5.2));
  }
  if (d === 13) {
    const b = [...s.borrows].filter((x) => ['HLXS', 'VOLT', 'CRVA', 'STRM'].includes(x.secId) && x.lenderId !== 'harbor').sort((a, c) => c.qty * s.securities[c.secId].price - a.qty * s.securities[a.secId].price)[0];
    if (b) s.signals.recalls.push({ contractId: b.id, secId: b.secId, lenderId: b.lenderId, qty: b.qty });
  }
  if (d === 15) {
    const sq = makeSqueezeAlert(s, 'QRTL');
    if (sq) ev.push(sq);
  }
  if (d === 16) {
    const cr = makeCrowding(s);
    if (cr) ev.push(cr);
  }
  if (d === 17 && active('redwood')) {
    const av = accountValue(s, cl.redwood);
    if (av.leverage < 5) ev.push(makeFinancingRequest(s, cl.redwood, Math.max(40e6, av.equity * 0.8), 175, av.leverage + 1.0));
  }
  if (d === 20) ev.push(makeReview(s));
  if (d === 22) {
    s.market.shockBps += 60;
    s.market.repoStressBps += 60;
    s.market.haircutMult = Math.max(s.market.haircutMult, 1.6);
    s.market.repoAppetite = Math.min(s.market.repoAppetite, 0.6);
    ev.push(makeFundingShock(s, 60));
  }
  if (d === 24) ev.push(makeCounterpartyNews(s, 'kestrel'));
  if (d === 30) ev.push(makeReview(s));
  void clientDebit;
  void rand;
  return ev;
}
