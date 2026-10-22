// Seeded, replayable challenge scenarios with transparent scoring.

import { AssetId, DAY, ScheduledEvent, TICKS_PER_DAY, tickTime, viewOf } from './market';
import { ensureCalendar } from './events';
import { executeTrade, aggregateRisk, bucketTotal, fmtUsd, openBookDay } from './book';
import { GameState, newGame, post, refreshStress, refreshVaR, utilisation } from './game';
import { AutocallInst, Instrument, unitPV } from './pricing';
import { instrumentRisk } from './risk';
import { LEVELS } from './career';
import { hash32 } from './math';
import { listedStrike } from './hedging';

export interface Challenge {
  id: string;
  title: string;
  tagline: string;
  brief: string;
  objective: string;
  days: number;
  seed: number;
  build: () => GameState;
  score: (g: GameState) => { score: number; grade: string; lines: string[] };
}

type G = GameState & { forcedShocks?: ScheduledEvent[]; startValue?: number; peakDD?: number };

function book(g: GameState, inst: Instrument, qty: number, client = 'northgate') {
  const v = viewOf(g.market);
  const mid = unitPV(inst, v);
  const res = executeTrade(g.book, inst, qty, mid, 'initial', { view: v, day: g.market.day, tick: g.market.tick, liq: 1 }, { mid, net: false });
  res.pos.source = 'client';
  res.pos.client = client;
  res.pos.risk = instrumentRisk(inst, v);
  res.pos.riskAt = v.t;
  aggregateRisk(g.book);
  return res.pos;
}

function note(g: GameState, assets: AssetId[], years: number, cpnPa: number, ki: number, id: string): AutocallInst {
  const v = viewOf(g.market);
  const d = g.market.day;
  const obs: number[] = [];
  for (let k = 1; k <= years * 4; k++) obs.push((d + 63 * k + 1) * DAY);
  return { type: 'autocall', assets, initial: assets.map((a) => v.spot[a]), obs, callFrom: 1, autocall: 1, couponBarrier: 0.7, coupon: cpnPa / 4, memory: true, ki, next: 0, missed: 0, seed: hash32(g.seed, id) };
}

function start(g: G, days: number, level = 2) {
  g.career.level = level;
  g.endDay = g.market.day + days - 1;
  g.limits = LEVELS[level].limits;
  g.families = LEVELS[level].families;
  refreshVaR(g);
  refreshStress(g);
  openBookDay(g.book);
  g.book.valueOpen = 0;
  g.startValue = 0;
  g.book.today = { edge: 0, costs: 0, carry: 0, market: 0, delta: 0, gamma: 0, vega: 0, theta: 0, rates: 0, corr: 0, cross: 0 };
  g.book.life = { ...g.book.today };
}

function shockAt(g: G, kind: ScheduledEvent['kind'], day: number, tick: number) {
  const e: ScheduledEvent = { id: `${kind}-forced-${day}`, kind, day, tick, title: 'Shock', moveStd: {}, status: 'pending' };
  (g.forcedShocks ??= []).push(e);
  if (day === g.market.day) g.hidden = e;
}

const totalPnl = (g: GameState) => g.book.dailyPnl.reduce((a, d) => a + d.pnl, 0) + (g.phase === 'trading' ? bucketTotal(g.book.today) : 0);
function maxDD(g: GameState) {
  let peak = 0;
  let dd = 0;
  let cum = 0;
  for (const d of g.book.dailyPnl) {
    for (const x of [cum + d.pnl]) {
      peak = Math.max(peak, x);
      dd = Math.max(dd, peak - x);
    }
    cum += d.pnl;
  }
  return dd;
}
const grade = (s: number) => (s >= 90 ? 'S' : s >= 75 ? 'A' : s >= 60 ? 'B' : s >= 45 ? 'C' : s >= 30 ? 'D' : 'F');
const clamp100 = (x: number) => Math.round(Math.max(0, Math.min(100, x)));

export const CHALLENGES: Challenge[] = [
  {
    id: 'storm',
    title: 'Short Gamma Into the Storm',
    tagline: 'Inherited book, building stress, two days.',
    brief: 'You inherit a book that sold a lot of short-dated ORX and NKT optionality. It has paid steady theta all month. Credit is leaking wider and the strategist is nervous. Something is coming. You decide how much of the short gamma to keep.',
    objective: 'Finish the two days with the best P&L you can. Score: P&L relative to a do-nothing book, minus 30 points per limit breach.',
    days: 2,
    seed: 7101,
    build: () => {
      const g = newGame({ mode: 'challenge', seed: 7101, regime: 'stressed', pressure: 1.4, level: 2, challengeId: 'storm' }) as G;
      const v = viewOf(g.market);
      const exp = (g.market.day + 21) * DAY;
      book(g, { type: 'vanilla', asset: 'ORX', cp: 'P', strike: listedStrike('ORX', v.spot.ORX * 0.97), expiry: exp }, -120e6 / v.spot.ORX, 'cobalt');
      book(g, { type: 'vanilla', asset: 'ORX', cp: 'C', strike: listedStrike('ORX', v.spot.ORX * 1.02), expiry: exp }, -80e6 / v.spot.ORX, 'halcyon');
      book(g, { type: 'vanilla', asset: 'NKT', cp: 'P', strike: listedStrike('NKT', v.spot.NKT * 0.95), expiry: exp }, -40e6 / v.spot.NKT, 'cobalt');
      // pre-existing delta hedge
      const R = g.book.risk;
      const fut: Instrument = { type: 'forward', asset: 'ORX', expiry: 63 * DAY, strike: 0 };
      book(g, fut, -R.delta.ORX / instrumentRisk(fut, v).delta.ORX).source = 'hedge';
      book(g, { type: 'spot', asset: 'NKT' }, -g.book.risk.delta.NKT / instrumentRisk({ type: 'spot', asset: 'NKT' }, v).delta.NKT).source = 'hedge';
      shockAt(g, 'shock_selloff', 1, 34);
      start(g, 2);
      post(g, { kind: 'msg', from: 'margot', text: 'This book has been selling gamma for a month and it looked like genius. Read the room before deciding whether it still is.' });
      return g;
    },
    score: (g) => {
      const pnl = totalPnl(g);
      const breaches = g.career.breaches;
      const s = clamp100(50 + (pnl / 3e6) * 25 - breaches * 30);
      return { score: s, grade: grade(s), lines: [`P&L ${fmtUsd(pnl)}`, `Limit breaches ${breaches}`, 'Reference: the unhedged inherited book loses several million in the shock'] };
    },
  },
  {
    id: 'bigticket',
    title: 'The Big Ticket',
    tagline: '$120m worst-of. Your book is already short correlation.',
    brief: 'Aurelia wants $120m of a 3Y worst-of ORX/NKT autocallable, the largest note this year. You already hold two worst-of notes, so you are short correlation and long downside vega. Win the trade, earn proper margin, and close the day inside every limit.',
    objective: 'Score: client edge captured (target $1.5m) + 40 if won, −35 per limit breached at the close, minus hedging costs.',
    days: 1,
    seed: 4242,
    build: () => {
      const g = newGame({ mode: 'challenge', seed: 4242, regime: 'calm', pressure: 0.2, level: 2, challengeId: 'bigticket' }) as G;
      book(g, note(g, ['ORX', 'AUR'], 3, 0.085, 0.6, 'n1'), -45e6, 'aurelia');
      book(g, note(g, ['NKT', 'AUR'], 2, 0.11, 0.6, 'n2'), -30e6, 'aurelia');
      start(g, 1, 3);
      g.flags.bigTicket = 1;
      post(g, { kind: 'msg', from: 'priya', text: 'Aurelia is putting the $120m worst-of out to four dealers at 10:00. We need to be in it. Price it, then think about what it does to the book.' });
      return g;
    },
    score: (g) => {
      const won = g.rfqs.find((r) => r.big && r.status === 'won');
      const edge = g.book.dailyPnl.reduce((a, d) => a + d.b.edge, 0);
      const costs = g.book.dailyPnl.reduce((a, d) => a + d.b.costs, 0);
      const br = utilisation(g).filter((u) => u.util > 1).length;
      const s = clamp100((won ? 40 : 0) + (edge / 1.5e6) * 45 + (costs / 0.5e6) * 15 - br * 35 + 10);
      return { score: s, grade: grade(s), lines: [won ? 'Won the ticket' : 'Did not win the ticket', `Client edge ${fmtUsd(edge)}`, `Hedging costs ${fmtUsd(costs)}`, `Limits breached at close: ${br}`] };
    },
  },
  {
    id: 'fedday',
    title: 'Fed Day',
    tagline: 'Duration, dollar and downside into 14:00.',
    brief: 'The Fed decides at 14:00. Your book has accumulated receiver swaps from pensions, an EUR forward from Kestrel and short ORX puts from Halcyon. Options price a sizeable move. You can carry the event, hedge it, or reshape it.',
    objective: 'Score: P&L minus half of the worst intraday drawdown, scaled to $1m.',
    days: 1,
    seed: 2002,
    build: () => {
      const g = newGame({ mode: 'challenge', seed: 2002, regime: 'calm', pressure: 0.3, level: 2, challengeId: 'fedday' }) as G;
      const m = g.market;
      m.day = 2;
      m.t = tickTime(2, 0);
      m.events = [];
      g.calendarTo = ensureCalendar(m, 8, 1);
      g.hidden = null;
      g.startDay = 2;
      const v = viewOf(m);
      book(g, { type: 'swap', start: v.t, end: v.t + 10, fixed: 0.0405, paid: 0 }, 150e6, 'northgate');
      book(g, { type: 'forward', asset: 'EURUSD', expiry: (2 + 126 + 1) * DAY, strike: v.spot.EURUSD * 1.004 }, 80e6, 'kestrel');
      book(g, { type: 'vanilla', asset: 'ORX', cp: 'P', strike: listedStrike('ORX', v.spot.ORX * 0.97), expiry: (2 + 21 + 1) * DAY }, -60e6 / v.spot.ORX, 'halcyon');
      start(g, 1);
      return g;
    },
    score: (g) => {
      const pnl = totalPnl(g);
      const curve = g.book.dailyPnl.length ? g.book.dailyPnl[0] : null;
      let peak = 0;
      let dd = 0;
      for (const x of g.book.intradayPnl) {
        peak = Math.max(peak, x);
        dd = Math.max(dd, peak - x);
      }
      void curve;
      const s = clamp100(55 + ((pnl - 0.5 * dd) / 1e6) * 30);
      return { score: s, grade: grade(s), lines: [`P&L ${fmtUsd(pnl)}`, `Worst intraday drawdown ${fmtUsd(dd)}`, `Risk-adjusted ${fmtUsd(pnl - 0.5 * dd)}`] };
    },
  },
  {
    id: 'corrcrunch',
    title: 'Correlation Crunch',
    tagline: 'Three days to de-risk a worst-of book.',
    brief: 'The desk sold $120m of worst-of notes in the good times. Credit has widened five days running and correlation is creeping up. No listed instrument hedges correlation. You can delta and vega hedge, trade with Theo, recycle with client flow, or pay up to reduce.',
    objective: 'Score: P&L over three days (vs about −$4m for a passive book), +20 if correlation exposure is cut by half, −25 per breach.',
    days: 3,
    seed: 9090,
    build: () => {
      const g = newGame({ mode: 'challenge', seed: 9090, regime: 'calm', pressure: 1.6, level: 2, challengeId: 'corrcrunch' }) as G;
      book(g, note(g, ['ORX', 'NKT'], 3, 0.09, 0.6, 'c1'), -55e6, 'aurelia');
      book(g, note(g, ['ORX', 'NKT', 'AUR'], 3, 0.12, 0.55, 'c2'), -40e6, 'aurelia');
      book(g, note(g, ['NKT', 'AUR'], 2, 0.1, 0.6, 'c3'), -25e6, 'halcyon');
      g.flags.corr0 = g.book.risk.corr01;
      shockAt(g, 'shock_selloff', 2, 40);
      start(g, 3, 3);
      return g;
    },
    score: (g) => {
      const pnl = totalPnl(g);
      const c0 = Math.abs(g.flags.corr0 ?? 1);
      const c1 = Math.abs(g.book.risk.corr01);
      const cut = c1 < 0.5 * c0;
      const s = clamp100(55 + (pnl / 4e6) * 30 + (cut ? 20 : 0) - g.career.breaches * 25);
      return { score: s, grade: grade(s), lines: [`P&L ${fmtUsd(pnl)}`, `Correlation exposure ${fmtUsd(c0)} → ${fmtUsd(c1)} per pt`, `Breaches ${g.career.breaches}`] };
    },
  },
  {
    id: 'hellweek',
    title: 'Hell Week',
    tagline: 'Five days in a stressed tape. Stay positive.',
    brief: 'A full week in a stressed regime that may tip into crisis. Client flow keeps coming and liquidity is poor. Spreads are wide, both ways. Make money without blowing up.',
    objective: 'Score: positive risk-adjusted P&L: 50 + Sharpe×10 + P&L/$1m×10, −20 per breach, −25 if the drawdown exceeds $3m.',
    days: 5,
    seed: 6666,
    build: () => {
      const g = newGame({ mode: 'challenge', seed: 6666, regime: 'stressed', pressure: 1.0, level: 1, challengeId: 'hellweek' }) as G;
      start(g, 5, 1);
      return g;
    },
    score: (g) => {
      const d = g.book.dailyPnl.map((x) => x.pnl);
      const pnl = totalPnl(g);
      const mu = d.reduce((a, b) => a + b, 0) / Math.max(1, d.length);
      const sd = Math.sqrt(d.reduce((a, b) => a + (b - mu) ** 2, 0) / Math.max(1, d.length - 1)) || 1;
      const sharpe = (mu / sd) * Math.sqrt(252);
      const dd = maxDD(g);
      const s = clamp100(50 + Math.max(-4, Math.min(4, sharpe)) * 10 + (pnl / 1e6) * 10 - g.career.breaches * 20 - (dd > 3e6 ? 25 : 0));
      return { score: s, grade: grade(s), lines: [`P&L ${fmtUsd(pnl)}`, `Sharpe (ann.) ${sharpe.toFixed(2)}`, `Max drawdown ${fmtUsd(dd)}`, `Breaches ${g.career.breaches}`] };
    },
  },
];

export const challengeById = (id: string) => CHALLENGES.find((c) => c.id === id)!;
export const TICKS = TICKS_PER_DAY;
