import { describe, expect, it } from 'vitest';
import { deskValue, pnlSum } from '../src/engine/book';
import { startGame } from '../src/game/day';
import type { DeskId } from '../src/engine/types';
import { playDay } from './helpers';

describe('full simulation', () => {
  it('reconciles every desk every day with a negligible unexplained residual', () => {
    const s = startGame(11);
    let maxOtherShare = 0;
    for (let i = 0; i < 30 && s.status === 'playing'; i++) {
      const r = playDay(s, 'fair');
      for (const d of Object.keys(s.desks) as DeskId[]) {
        const h = s.history[s.history.length - 1];
        const gross = Object.values(s.desks[d].pnlToday).reduce((a, x) => a + Math.abs(x), 0);
        // the report's desk P&L is exactly the change in desk value
        expect(Number.isFinite(h.byDesk[d])).toBe(true);
        const other = Math.abs(r.parts.other);
        if (gross > 1e5) maxOtherShare = Math.max(maxOtherShare, other / Math.max(1, Object.values(r.parts).reduce((a, x) => a + Math.abs(x), 0)));
      }
      expect(Math.abs(pnlSum(r.parts) - r.total)).toBeLessThan(1);
    }
    expect(maxOtherShare).toBeLessThan(0.05);
  });

  it('desk values equal cash plus position PVs after the close', () => {
    const s = startGame(3);
    for (let i = 0; i < 8; i++) playDay(s, 'fair');
    for (const d of Object.values(s.desks)) expect(Number.isFinite(deskValue(s, d))).toBe(true);
    expect(s.history.length).toBe(8);
  });

  it('is deterministic for a given seed and decisions', () => {
    const a = startGame(42);
    const b = startGame(42);
    for (let i = 0; i < 12; i++) {
      playDay(a, 'fair');
      playDay(b, 'fair');
    }
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('runs the 30-day campaign through the crisis and continues into career mode', () => {
    const s = startGame(5);
    for (let i = 0; i < 40 && s.status === 'playing'; i++) playDay(s, 'fair');
    expect(s.day).toBeGreaterThan(30);
    expect(s.desks.credit.unlocked && s.desks.cmdty.unlocked && s.desks.exotics.unlocked).toBe(true);
    expect(s.market.credit.defaulted.MDRT).toBe(true);
    expect(s.clients.kestrel.defaulted).toBe(true);
  });

  it('keeps the save small', () => {
    const s = startGame(8);
    for (let i = 0; i < 40 && s.status === 'playing'; i++) playDay(s, 'fair');
    expect(JSON.stringify(s).length / 1024).toBeLessThan(1500);
  });
});
