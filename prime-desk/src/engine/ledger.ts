// Double-entry ledger. Desk perspective, debit-positive: assets > 0, liabilities/equity/income < 0.
// Every entry must balance to zero; post() throws otherwise, so an unbalanced transaction can
// never enter the books.

import type { ClientId, GameState, JournalPosting, Ledger } from './types';

export const ACC = {
  cash: 'desk:cash',
  reserve: 'desk:reserve',
  sbc: 'desk:sbc', // cash collateral posted to securities lenders
  ccp: 'desk:ccp', // futures initial margin posted at the clearing house
  repo: 'desk:repo',
  termRepo: 'desk:termrepo',
  treasury: 'desk:treasury',
  emergency: 'desk:emergency',
  capital: 'desk:capital',
  cliCash: (id: ClientId) => `cli:${id}:cash`,
  cliSP: (id: ClientId) => `cli:${id}:sp`,
  pnl: (k: string) => `pnl:${k}`,
} as const;

export const MAX_JOURNAL = 900; // keep saves small (Android AsyncStorage rows are size-limited)
const EPS = 1e-6;

export function newLedger(): Ledger {
  return { balances: {}, journal: [], seq: 1 };
}

export function bal(l: Ledger, account: string): number {
  return l.balances[account] ?? 0;
}

export function post(
  s: GameState,
  kind: string,
  memo: string,
  postings: JournalPosting[],
  clientId?: ClientId,
): void {
  const clean = postings.filter((p) => Math.abs(p.amount) > EPS);
  if (clean.length === 0) return;
  let sum = 0;
  for (const p of clean) {
    if (!Number.isFinite(p.amount)) throw new Error(`Non-finite posting to ${p.account} in ${kind}`);
    sum += p.amount;
  }
  const scale = Math.max(1, ...clean.map((p) => Math.abs(p.amount)));
  if (Math.abs(sum) > 1e-7 * scale + EPS) {
    throw new Error(`Unbalanced journal entry ${kind}: ${sum}`);
  }
  const l = s.ledger;
  for (const p of clean) l.balances[p.account] = (l.balances[p.account] ?? 0) + p.amount;
  l.journal.push({ id: l.seq++, day: s.day, kind, memo, clientId, postings: clean });
  if (l.journal.length > MAX_JOURNAL) l.journal.splice(0, l.journal.length - MAX_JOURNAL);
}

/** Two-legged convenience: debit `dr`, credit `cr` by a positive (or negative) amount. */
export function transfer(s: GameState, kind: string, memo: string, dr: string, cr: string, amount: number, clientId?: ClientId) {
  post(s, kind, memo, [
    { account: dr, amount },
    { account: cr, amount: -amount },
  ], clientId);
}

export function trialBalance(l: Ledger): number {
  let s = 0;
  for (const k in l.balances) s += l.balances[k];
  return s;
}

export interface BalanceSheet {
  assets: {
    cash: number;
    reserve: number;
    marginLoans: number;
    stockBorrowCollateral: number;
    ccpMargin: number;
    total: number;
  };
  liabilities: {
    freeCredits: number;
    shortProceeds: number;
    repo: number;
    termRepo: number;
    treasury: number;
    emergency: number;
    total: number;
  };
  equity: {
    capital: number;
    retained: number;
    total: number;
  };
}

/** Classify ledger balances into a desk balance sheet (customer securities are off balance sheet). */
export function balanceSheet(s: GameState): BalanceSheet {
  const b = s.ledger.balances;
  let marginLoans = 0;
  let freeCredits = 0;
  let shortProceeds = 0;
  let retained = 0;
  for (const k in b) {
    const v = b[k];
    if (k.startsWith('cli:') && k.endsWith(':cash')) {
      if (v > 0) marginLoans += v;
      else freeCredits += -v;
    } else if (k.startsWith('cli:') && k.endsWith(':sp')) {
      shortProceeds += -v;
    } else if (k.startsWith('pnl:')) {
      retained += -v;
    }
  }
  const cash = b[ACC.cash] ?? 0;
  const reserve = b[ACC.reserve] ?? 0;
  const sbc = b[ACC.sbc] ?? 0;
  const ccp = b[ACC.ccp] ?? 0;
  const repo = -(b[ACC.repo] ?? 0);
  const termRepo = -(b[ACC.termRepo] ?? 0);
  const treasury = -(b[ACC.treasury] ?? 0);
  const emergency = -(b[ACC.emergency] ?? 0);
  const capital = -(b[ACC.capital] ?? 0);
  return {
    assets: {
      cash,
      reserve,
      marginLoans,
      stockBorrowCollateral: sbc,
      ccpMargin: ccp,
      total: cash + reserve + marginLoans + sbc + ccp,
    },
    liabilities: {
      freeCredits,
      shortProceeds,
      repo,
      termRepo,
      treasury,
      emergency,
      total: freeCredits + shortProceeds + repo + termRepo + treasury + emergency,
    },
    equity: { capital, retained, total: capital + retained },
  };
}

/** Client cash from the client's perspective: + credit balance (Atlas owes client), − debit (margin loan). */
export function clientCash(s: GameState, id: ClientId): number {
  return -bal(s.ledger, ACC.cliCash(id));
}

export function clientDebit(s: GameState, id: ClientId): number {
  return Math.max(0, bal(s.ledger, ACC.cliCash(id)));
}

export function clientCredit(s: GameState, id: ClientId): number {
  return Math.max(0, -bal(s.ledger, ACC.cliCash(id)));
}

export function clientShortProceeds(s: GameState, id: ClientId): number {
  return -bal(s.ledger, ACC.cliSP(id));
}
