import { describe, expect, it } from 'vitest';
import { newGame, tick, nextDay, quoteRfq, hedgeDelta, GameState, view, openingMessages } from '../src/engine/game';
import { bookValue, bucketTotal } from '../src/engine/book';
import { quoteForEdge } from '../src/engine/clients';
import { TICKS_PER_DAY, ASSETS } from '../src/engine/market';
import { CHALLENGES } from '../src/engine/scenarios';

function playDay(g: GameState, policy = true) {
  while (g.phase === 'trading') {
    if (policy) {
      for (const r of g.rfqs) if (r.status === 'open') quoteRfq(g, r.id, quoteForEdge(r, r.streetMargin * 0.9, view(g)));
      for (const a of ASSETS) if (Math.abs(g.book.risk.delta[a]) > 200e3) hedgeDelta(g, a);
    }
    tick(g);
  }
}

describe('game loop', () => {
  it('is deterministic for a seed and conserves value across P&L buckets', () => {
    const run = () => {
      const g = newGame({ mode: 'career', seed: 123 });
      g.career.level = 2;
      openingMessages(g);
      const t0 = performance.now();
      for (let d = 0; d < 4; d++) {
        playDay(g);
        if (g.phase === 'closed') nextDay(g);
      }
      return { g, ms: performance.now() - t0 };
    };
    const a = run();
    const b = run();
    expect(a.g.market.assets.ORX.spot).toBe(b.g.market.assets.ORX.spot);
    expect(bookValue(a.g.book)).toBeCloseTo(bookValue(b.g.book), 6);
    // conservation: book value == cumulative P&L (book started at zero)
    const life = a.g.book.life;
    expect(bookValue(a.g.book)).toBeCloseTo(bucketTotal(life), 2);
    const days = a.g.book.dailyPnl.reduce((s, d) => s + d.pnl, 0) + bucketTotal(a.g.book.today);
    expect(days).toBeCloseTo(bucketTotal(life), 2);
    console.log('4 days', a.ms.toFixed(0), 'ms; trades', a.g.book.trades.length, 'positions', a.g.book.positions.length, 'value', bookValue(a.g.book).toFixed(0), 'won', a.g.stats.won, '/', a.g.stats.quoted);
    expect(a.g.stats.quoted).toBeGreaterThan(5);
  });

  it('market path does not depend on what the player does', () => {
    const g1 = newGame({ mode: 'career', seed: 99 });
    const g2 = newGame({ mode: 'career', seed: 99 });
    playDay(g1, true);
    playDay(g2, false);
    nextDay(g1); nextDay(g2);
    for (let k = 0; k < 40; k++) { tick(g1); tick(g2); }
    for (const a of ASSETS) expect(g1.market.assets[a].spot).toBe(g2.market.assets[a].spot);
  });

  it('all challenges build and play to completion', () => {
    for (const c of CHALLENGES) {
      const g = c.build();
      let guard = 0;
      while (g.phase !== 'over' && guard++ < 10) {
        playDay(g, false);
        if (g.phase === 'closed') nextDay(g);
      }
      expect(g.phase).toBe('over');
      const s = c.score(g);
      expect(s.score).toBeGreaterThanOrEqual(0);
      console.log(c.id, s.grade, s.lines.join(' | '));
    }
  });
});
