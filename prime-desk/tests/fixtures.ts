// Minimal hand-built scenarios for testing accounting mechanics in isolation.
import { emptyClientPnl, settleFunding } from '../src/engine/funding';
import { ACC, post } from '../src/engine/ledger';
import { computeAllocation, updateMarketFees } from '../src/engine/lending';
import type { Client, GameState } from '../src/engine/types';
import { standardTerms } from '../src/game/funds';
import { newGame } from '../src/game/newGame';

/** A fresh game with the roster removed and a quiet desk (no buffer target, no events). */
export function bareGame(): GameState {
  const s = newGame(7);
  s.clients = {};
  s.events = [];
  s.desk.policy.bufferTarget = 0;
  // flatten the book so tests can reason about exact balances: give the capital back
  post(s, 'test', 'remove capital', [
    { account: ACC.capital, amount: 100e6 },
    { account: ACC.cash, amount: -100e6 },
  ]);
  updateMarketFees(s);
  s.alloc = computeAllocation(s);
  settleFunding(s);
  return s;
}

export function addClient(s: GameState, id: string, opts: Partial<Client['terms']> = {}): Client {
  const c: Client = {
    id,
    name: id,
    short: id,
    color: '#fff',
    status: 'active',
    arrivalDay: 1,
    pitch: '',
    profile: { strategy: 'test', style: 'longshort', targetGross: 2, netBias: 0, turnover: 0, rating: 'A', basePD: 0.005, priceSensitivity: 0.5, book: {}, alpha: 0, stressDeleverage: 0, maxBorrowFeeBps: 5000 },
    fund: { nav: 1e9, peakNav: 1e9, freeCash: 1e8, otherPBs: [], redemptionsPending: 0, recentReturn: 0, anchorEquity: 0 },
    terms: { ...standardTerms(), ...opts },
    positions: {},
    walletShare: 0.1,
    relationship: 50,
    satisfaction: 0,
    pnl: emptyClientPnl(),
    pnlToday: emptyClientPnl(),
    equityHist: [],
    borrowFails: 0,
    notes: [],
    lastCompetitorDay: 0,
    constrained: 0,
    accum: { days: 0, debit: 0, credit: 0, sp: 0 },
    askCooldown: {},
  };
  s.clients[id] = c;
  return c;
}

/** Set a security's price exactly (and prevPrice) for deterministic arithmetic. */
export function setPrice(s: GameState, id: string, px: number) {
  s.securities[id].price = px;
  s.securities[id].prevPrice = px;
}
