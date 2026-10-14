import { emptyDeskPnl, snapshotPnlBalances } from '../engine/analytics';
import { START_DATE } from '../engine/calendar';
import { ACC, newLedger, post } from '../engine/ledger';
import { computeAllocation, updateMarketFees } from '../engine/lending';
import { settleFunding } from '../engine/funding';
import { makeCompetitors, makeLenders, makeSecurities } from '../engine/universe';
import type { Difficulty, GameState } from '../engine/types';
import { rosterClients } from './funds';
import { startDay } from './day';
import { emptySignals } from './signals';

export const SAVE_VERSION = 3;


export function newGame(seed: number, difficulty: Difficulty = 'normal'): GameState {
  const s: GameState = {
    version: SAVE_VERSION,
    seed,
    rng: seed >>> 0,
    difficulty,
    day: 1,
    date: START_DATE,
    phase: 1,
    status: 'playing',
    market: {
      regime: 'steady',
      regimeAge: 0,
      sofr: 0.043,
      repoStressBps: 0,
      shockBps: 0,
      haircutMult: 1,
      repoAppetite: 1,
      ftpSpreadBps: 60,
      index: 520,
      indexHist: [520],
      lastReturn: 0,
      creditSpreadBps: 400,
      vol: 16,
      headlines: ['Markets steady; equity volatility near long-run lows', 'Hedge fund leverage at multi-year highs, regulators watching prime brokers'],
    },
    securities: makeSecurities(),
    lenders: makeLenders(),
    competitors: makeCompetitors(),
    clients: rosterClients(),
    ledger: newLedger(),
    borrows: [],
    desk: {
      name: 'Atlas Prime Services',
      allocatedCapital: 100e6,
      facilityLimit: 250e6,
      policy: { bufferTarget: 40e6, repoUsage: 0.8, repoFirst: true },
      termRepos: [],
      confidence: 60,
      compliance: 100,
      opexPerYear: difficulty === 'expert' ? 7e6 : difficulty === 'advanced' ? 6e6 : 5e6,
      analystCapacity: difficulty === 'expert' ? 1 : 2,
      analystUsed: 0,
      houseMarketShock: 0.12,
      concAddonRate: 0.15,
      nameAddons: {},
      lastReviewDay: 0,
      emergencyDays: 0,
      breaches: 0,
      capitalBreachDays: 0,
    },
    alloc: {
      rehypForShorts: {},
      rehypForRepo: {},
      rehypCap: {},
      shortDemand: {},
      internalCover: {},
      externalCover: {},
      shortfall: {},
      repoCapacity: 0,
      repoCollateralValue: 0,
    },
    events: [],
    scheduled: [],
    history: [],
    log: [],
    pnlToday: emptyDeskPnl(),
    pnlCum: emptyDeskPnl(),
    lastAccrualDays: 1,
    seenTopics: [],
    nextId: 1,
    dayStartPnl: {},
    centralToday: { residual: 0, overhead: 0 },
    centralCum: { residual: 0, overhead: 0 },
    accrualDaysCum: 0,
    signals: emptySignals(),
    lenderPrefs: {},
    cumEP: 0,
    milestones: [],
  };
  if (difficulty === 'expert') {
    for (const c of Object.values(s.clients)) c.profile.basePD *= 1.3;
  }
  // Allocated capital: treasury funds the desk's equity in cash.
  post(s, 'capital', 'Allocated capital from the bank (desk equity)', [
    { account: ACC.cash, amount: 100e6 },
    { account: ACC.capital, amount: -100e6 },
  ]);
  updateMarketFees(s);
  s.alloc = computeAllocation(s);
  settleFunding(s);
  s.dayStartPnl = snapshotPnlBalances(s);
  s.log.push({ day: 1, text: 'You take over as Head of Prime Brokerage at Atlas. $100m of capital, a $250m treasury facility, no clients.', tone: 'neutral' });
  startDay(s, true);
  return s;
}
