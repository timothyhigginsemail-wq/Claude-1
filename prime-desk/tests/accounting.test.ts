import { beforeEach, describe, expect, it } from 'vitest';
import { accountValue, deposit, markShorts, trade } from '../src/engine/accounts';
import { pnlFromLedger, pnlTotal, snapshotPnlBalances } from '../src/engine/analytics';
import { accrualDays } from '../src/engine/calendar';
import { accrue, clientPnlTotal, reserveCalc, settleFunding } from '../src/engine/funding';
import { ACC, bal, balanceSheet, clientDebit, post, trialBalance } from '../src/engine/ledger';
import { COLLATERAL_MARGIN, computeAllocation, rebalanceBorrows } from '../src/engine/lending';
import type { GameState } from '../src/engine/types';
import { addClient, bareGame, setPrice } from './fixtures';
import { assertBooksBalance } from './helpers';

const near = (a: number, b: number, tol = 1e-4) => expect(Math.abs(a - b)).toBeLessThan(tol * Math.max(1, Math.abs(b)));

describe('double-entry ledger', () => {
  it('rejects unbalanced entries', () => {
    const s = bareGame();
    expect(() => post(s, 'bad', 'bad', [{ account: ACC.cash, amount: 1 }])).toThrow();
  });
  it('a new game starts with a zero trial balance and A = L + E', () => {
    const s = bareGame();
    expect(trialBalance(s.ledger)).toBe(0);
    assertBooksBalance(s);
  });
});

describe('margin financing: $200m purchase with $80m equity', () => {
  let s: GameState;
  beforeEach(() => {
    s = bareGame();
    addClient(s, 'A');
    setPrice(s, 'ORBT', 400);
    deposit(s, 'A', 80e6);
    trade(s, 'A', 'ORBT', 200e6 / 400, 'buy', 0);
  });
  it('creates a $120m margin loan and $200m customer long held off balance sheet', () => {
    const av = accountValue(s, s.clients.A);
    near(av.longMV, 200e6);
    near(av.equity, 80e6);
    near(clientDebit(s, 'A'), 120e6);
    const bs = balanceSheet(s);
    near(bs.assets.marginLoans, 120e6);
    // the $200m of ORBT is customer property: no securities asset on the desk balance sheet
    expect(Object.keys(bs.assets)).not.toContain('securities');
  });
  it('the desk paid the street $200m and received $80m: net cash need $120m funded by repo/treasury', () => {
    // before funding the desk would be $120m overdrawn; the waterfall draws it
    settleFunding(s);
    const bs = balanceSheet(s);
    near(bs.liabilities.repo + bs.liabilities.treasury + bs.liabilities.emergency, 120e6);
    expect(bs.assets.cash).toBeGreaterThanOrEqual(-1e-6);
    assertBooksBalance(s);
  });
  it('rehypothecation is capped at 140% of the debit ($168m of the $200m)', () => {
    const a = computeAllocation(s);
    near(a.rehypCap.A, 168e6);
    const pledged = (a.rehypForRepo.A.ORBT ?? 0) * 400;
    near(pledged, 168e6);
  });
  it('repo capacity is the rehypothecable value less haircut, scaled by policy and market appetite', () => {
    const a = computeAllocation(s);
    near(a.repoCapacity, 168e6 * (1 - 0.08) * s.desk.policy.repoUsage * s.market.repoAppetite);
  });
});

describe('short sale with external borrow', () => {
  it('posts 102% cash collateral, restricts proceeds, and reserves the customer credit', () => {
    const s = bareGame();
    addClient(s, 'B');
    setPrice(s, 'GRNB', 50);
    deposit(s, 'B', 50e6);
    trade(s, 'B', 'GRNB', -100e6 / 50, 'short', 0);
    rebalanceBorrows(s);
    const bs = balanceSheet(s);
    near(bs.liabilities.shortProceeds, 100e6);
    near(bs.assets.stockBorrowCollateral, 100e6 * COLLATERAL_MARGIN);
    const r = reserveCalc(s);
    // credits: 50 (free credit) + 100 (short proceeds); debits: 102 (collateral at lenders)
    near(r.credits, 150e6);
    near(r.debits, 102e6);
    near(r.requirement, 150e6 - 0.97 * 102e6);
    settleFunding(s);
    near(bal(s.ledger, ACC.reserve), 150e6 - 0.97 * 102e6);
    assertBooksBalance(s);
  });
});

describe('internalisation: Fund A long $100m, Fund B short $50m of the same stock', () => {
  function setup(internal: boolean) {
    const s = bareGame();
    addClient(s, 'A');
    addClient(s, 'B');
    setPrice(s, 'ORBT', 400);
    deposit(s, 'A', 40e6);
    trade(s, 'A', 'ORBT', internal ? 100e6 / 400 : 0, 'buy', 0);
    if (!internal) trade(s, 'A', 'VNTG', 100e6 / s.securities.VNTG.price, 'buy', 0);
    deposit(s, 'B', 25e6);
    trade(s, 'B', 'ORBT', -50e6 / 400, 'short', 0);
    rebalanceBorrows(s);
    settleFunding(s);
    return s;
  }
  it('covers the short from A\'s rehypothecated shares: no external borrow or lender collateral', () => {
    const s = setup(true);
    near(s.alloc.internalCover.ORBT * 400, 50e6);
    near(bal(s.ledger, ACC.sbc), 0);
    expect(s.borrows.length).toBe(0);
    near(s.alloc.rehypForShorts.A.ORBT * 400, 50e6);
  });
  const wholesale = (s: GameState) => {
    const b = balanceSheet(s);
    return b.liabilities.repo + b.liabilities.treasury + b.liabilities.emergency + b.liabilities.termRepo;
  };
  it('short proceeds fund A\'s debit — but the reserve formula claws back customer credits above debits', () => {
    const si = setup(true);
    const se = setup(false);
    // External: lender collateral 51 is a customer debit, so all customer credits (75) can be used:
    //   wholesale = 60 + 51 − 75 = 36.
    // Internal: no lender collateral; credits 75 exceed debits 60, so 75 − 0.97×60 = 16.8 is locked
    //   in the reserve account: wholesale = 60 + 16.8 − 75 = 1.8. Saving = 34.2, not 51.
    near(wholesale(se), 36e6);
    near(wholesale(si), 60e6 + (75e6 - 0.97 * 60e6) - 75e6);
    near(wholesale(se) - wholesale(si), 51e6 - (75e6 - 0.97 * 60e6));
    assertBooksBalance(si);
    assertBooksBalance(se);
  });
  it('when the long fund is more levered, the full saving (proceeds + 2% collateral margin) materialises', () => {
    const mk = (internal: boolean) => {
      const s = bareGame();
      addClient(s, 'A');
      addClient(s, 'B');
      setPrice(s, 'ORBT', 400);
      deposit(s, 'A', 10e6); // A debit 90
      trade(s, 'A', internal ? 'ORBT' : 'VNTG', 100e6 / (internal ? 400 : s.securities.VNTG.price), 'buy', 0);
      deposit(s, 'B', 25e6);
      trade(s, 'B', 'ORBT', -50e6 / 400, 'short', 0);
      rebalanceBorrows(s);
      settleFunding(s);
      return s;
    };
    near(wholesale(mk(false)) - wholesale(mk(true)), 51e6);
  });
  it('does not create unrestricted cash: customer credits beyond customer debits are locked in the reserve', () => {
    const s = setup(true);
    const r = reserveCalc(s);
    // credits = B free credit 25 + short proceeds 50 = 75; debits = A debit 60
    near(r.credits, 75e6);
    near(r.debits, 60e6);
    near(bal(s.ledger, ACC.reserve), 75e6 - 0.97 * 60e6);
    // the desk's own cash buffer is not increased by customer money
    expect(bal(s.ledger, ACC.cash)).toBeLessThan(1);
  });
  it('when B covers, internal cover disappears and A\'s debit must be funded wholesale again', () => {
    const s = setup(true);
    const before = balanceSheet(s);
    trade(s, 'B', 'ORBT', 50e6 / 400, 'cover', 0);
    rebalanceBorrows(s);
    settleFunding(s);
    const after = balanceSheet(s);
    near(after.liabilities.shortProceeds, 0);
    expect(after.liabilities.repo + after.liabilities.treasury - (before.liabilities.repo + before.liabilities.treasury)).toBeGreaterThan(30e6);
    assertBooksBalance(s);
  });
  it('when A sells its long, the short must be re-sourced externally', () => {
    const s = setup(true);
    trade(s, 'A', 'ORBT', -100e6 / 400, 'sell', 0);
    rebalanceBorrows(s);
    settleFunding(s);
    near(s.alloc.internalCover.ORBT ?? 0, 0);
    near(bal(s.ledger, ACC.sbc), 50e6 * COLLATERAL_MARGIN);
    assertBooksBalance(s);
  });
  it('never allocates the same share twice (shorts vs repo) and respects the 140% cap', () => {
    const s = setup(true);
    const a = computeAllocation(s);
    for (const cid in a.rehypCap) {
      let used = 0;
      const c = s.clients[cid];
      for (const id of new Set([...Object.keys(a.rehypForShorts[cid]), ...Object.keys(a.rehypForRepo[cid])])) {
        const units = (a.rehypForShorts[cid][id] ?? 0) + (a.rehypForRepo[cid][id] ?? 0);
        expect(units).toBeLessThanOrEqual((c.positions[id] ?? 0) + 1e-6);
        used += units * s.securities[id].price;
      }
      expect(used).toBeLessThanOrEqual(a.rehypCap[cid] + 1);
      expect(a.rehypCap[cid]).toBeLessThanOrEqual(1.4 * clientDebit(s, cid) + 1);
    }
  });
});

describe('marking to market', () => {
  it('short-account credit tracks short MV; the loss moves into the margin account', () => {
    const s = bareGame();
    addClient(s, 'B');
    setPrice(s, 'GRNB', 50);
    deposit(s, 'B', 50e6);
    trade(s, 'B', 'GRNB', -2e6, 'short', 0);
    const eq0 = accountValue(s, s.clients.B).equity;
    s.securities.GRNB.price = 60; // +20%
    markShorts(s, s.clients.B);
    const av = accountValue(s, s.clients.B);
    near(av.shortProceeds, 120e6);
    near(av.equity, eq0 - 20e6);
    near(av.cash, 50e6 - 20e6);
  });
});

describe('interest accrual (ACT/360)', () => {
  it('charges debit interest at SOFR + spread for the accrual days, 3 days over a weekend', () => {
    const s = bareGame();
    addClient(s, 'A', { financingSpreadBps: 100 });
    setPrice(s, 'ORBT', 400);
    deposit(s, 'A', 80e6);
    trade(s, 'A', 'ORBT', 500000, 'buy', 0);
    settleFunding(s);
    s.date = '2027-01-08'; // Friday
    expect(accrualDays(s.date)).toBe(3);
    const d0 = clientDebit(s, 'A');
    accrue(s, 3);
    near(s.clients.A.pnlToday.financing, d0 * (s.market.sofr + 0.01) * 3 / 360);
    near(clientDebit(s, 'A') - d0, d0 * (s.market.sofr + 0.01) * 3 / 360);
  });
  it('pays negative rebates when the borrow fee exceeds SOFR (client pays Atlas)', () => {
    const s = bareGame();
    const c = addClient(s, 'B');
    setPrice(s, 'QRTL', 20);
    s.securities.QRTL.borrowFeeBps = 1500;
    c.terms.feeOverrides.QRTL = 1500;
    deposit(s, 'B', 20e6);
    trade(s, 'B', 'QRTL', -1e6, 'short', 0);
    accrue(s, 1);
    // rebate rate = SOFR − 15% < 0 → client pays: shortRebate attribution positive for Atlas
    expect(s.clients.B.pnlToday.shortRebate).toBeGreaterThan(0);
    near(s.clients.B.pnlToday.shortRebate, 20e6 * (0.15 - s.market.sofr) / 360);
  });
});

describe('profitability attribution', () => {
  it('client contributions + central residual + overhead equal desk accounting P&L', () => {
    const s = bareGame();
    addClient(s, 'A', { financingSpreadBps: 80 });
    addClient(s, 'B');
    setPrice(s, 'ORBT', 400);
    deposit(s, 'A', 60e6);
    trade(s, 'A', 'ORBT', 400000, 'buy', 0);
    trade(s, 'A', 'HLXS', 1e6, 'buy', 0);
    deposit(s, 'B', 40e6);
    trade(s, 'B', 'ORBT', -100000, 'short', 0);
    trade(s, 'B', 'HLXS', -2e6, 'short', 0);
    rebalanceBorrows(s);
    s.desk.policy.bufferTarget = 10e6;
    settleFunding(s);
    const base = snapshotPnlBalances(s);
    for (const c of Object.values(s.clients)) for (const k in c.pnlToday) (c.pnlToday as any)[k] = 0;
    const r = accrue(s, 1);
    const desk = pnlTotal(pnlFromLedger(s, base));
    const clients = Object.values(s.clients).reduce((a, c) => a + clientPnlTotal(c.pnlToday), 0);
    near(clients + r.centralResidual + r.overhead, desk, 1e-6);
  });
});
