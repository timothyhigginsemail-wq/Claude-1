import { describe, expect, it } from 'vitest';
import { accountValue } from '../src/engine/accounts';
import { pnlFromLedger, pnlTotal } from '../src/engine/analytics';
import { clientPnlTotal, reserveCalc } from '../src/engine/funding';
import { ACC, bal } from '../src/engine/ledger';
import { COLLATERAL_MARGIN, computeAllocation } from '../src/engine/lending';
import { newGame } from '../src/game/newGame';
import { resolveEvent } from '../src/game/events';
import { endDay } from '../src/game/day';
import { mulberry } from './rand';
import { assertBooksBalance, playDay, type Policy } from './helpers';

function runInvariants(seed: number, policy: Policy, days: number) {
  const s = newGame(seed, seed % 3 === 0 ? 'expert' : 'normal');
  const rnd = mulberry(seed);
  for (let i = 0; i < days && s.status === 'playing'; i++) {
    playDay(s, policy, rnd);
    assertBooksBalance(s);
    // stock-loan collateral = 102% × MV of every open borrow
    const coll = s.borrows.reduce((a, b) => a + b.qty * s.securities[b.secId].price * COLLATERAL_MARGIN, 0);
    expect(Math.abs(bal(s.ledger, ACC.sbc) - coll)).toBeLessThan(1);
    // reserve account holds exactly the reserve-formula requirement after the waterfall
    expect(Math.abs(bal(s.ledger, ACC.reserve) - reserveCalc(s).requirement)).toBeLessThan(1);
    // short-account credits equal short market value for every active client
    for (const c of Object.values(s.clients)) {
      if (c.status !== 'active') continue;
      const av = accountValue(s, c);
      expect(Math.abs(av.shortProceeds - av.shortMV)).toBeLessThan(1 + 1e-6 * av.shortMV);
    }
    // no security is pledged more than once
    const a = computeAllocation(s);
    for (const cid in a.rehypCap) {
      const c = s.clients[cid];
      for (const id in a.rehypForRepo[cid]) expect((a.rehypForRepo[cid][id] ?? 0) + (a.rehypForShorts[cid][id] ?? 0)).toBeLessThanOrEqual((c.positions[id] ?? 0) * (1 + 1e-9) + 1e-6);
    }
    // attribution reconciles with the ledger every day
    const h = s.history[s.history.length - 1];
    const attributed = Object.values(s.clients).reduce((x, c) => x + clientPnlTotal(c.pnl), 0) + s.centralCum.residual + s.centralCum.overhead;
    const desk = pnlTotal(pnlFromLedger(s));
    expect(Math.abs(attributed - desk)).toBeLessThan(1e-6 * Math.max(1, Math.abs(desk)) + 1);
    expect(Number.isFinite(h.equity)).toBe(true);
  }
  return s;
}

describe('long-run simulation invariants', () => {
  it.each([
    [1, 'primary'],
    [2, 'prudent'],
    [3, 'random'],
    [11, 'random'],
    [42, 'prudent'],
  ] as [number, Policy][])('seed %i with %s policy keeps the books consistent for 40 days', (seed, policy) => {
    const s = runInvariants(seed, policy, 40);
    expect(s.day).toBeGreaterThan(1);
  });

  it('is deterministic for a given seed and decisions', () => {
    const a = newGame(99);
    const b = newGame(99);
    for (let i = 0; i < 25; i++) {
      playDay(a, 'primary');
      playDay(b, 'primary');
    }
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('completes the 30-day campaign and continues beyond it', () => {
    const s = newGame(5);
    for (let i = 0; i < 60 && s.status === 'playing'; i++) playDay(s, 'prudent');
    expect(s.day).toBeGreaterThan(31);
  });
});

describe('a lax desk can lose real money', () => {
  it('lenient margin on the concentrated activist produces a default loss in the crisis', () => {
    // Accept every ask (lenient terms) and approve every leverage request
    let worst = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const s = newGame(seed);
      for (let i = 0; i < 28 && s.status === 'playing'; i++) {
        for (const ev of s.events) {
          if (ev.status !== 'pending') continue;
          const lax = ['accept', 'approve', 'waive', 'grace', 'fill', 'allow', 'monitor', 'absorb', 'standard', 'fire'];
          const id = ev.options.find((o) => lax.includes(o.id))?.id ?? ev.options.find((o) => !o.usesAnalyst)!.id;
          resolveEvent(s, ev, id);
        }
        endDay(s);
      }
      const loss = -(s.pnlCum.creditLoss);
      worst = Math.max(worst, loss);
    }
    expect(worst).toBeGreaterThan(1e6);
  });
});
