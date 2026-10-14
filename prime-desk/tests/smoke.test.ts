import { describe, expect, it } from 'vitest';
import { deskSummary } from '../src/engine/analytics';
import { fm } from '../src/engine/format';
import { newGame } from '../src/game/newGame';
import { assertBooksBalance, playDay } from './helpers';

describe('smoke', () => {
  it('plays 45 days with the primary policy', () => {
    const s = newGame(42);
    for (let i = 0; i < 45 && s.status === 'playing'; i++) {
      const evs = s.events.map((e) => `${e.time} ${e.kind}: ${e.title}`);
      const r = playDay(s, 'prudent');
      assertBooksBalance(s);
      const d = deskSummary(s);
      console.log(`D${r.day} ${r.regime} mkt ${(r.marketReturn * 100).toFixed(1)}% NI ${fm(r.netIncome)} EP ${fm(r.economicProfit)} | run ${fm(d.revenueRunRate)} cap ${fm(d.capitalUsed)} gross ${fm(d.grossClientMV)} debit ${fm(d.debits)} SP ${fm(d.shortProceeds)} extC ${fm(d.extCollateral)} res ${fm(d.reserve)} repo ${fm(d.repo)} tsy ${fm(d.treasury)} em ${fm(d.emergency)} int ${(d.internalisation*100).toFixed(0)}% conf ${s.desk.confidence.toFixed(0)}\n   ${evs.join('\n   ')}\n   notes: ${r.notes.map(n=>n.text).join(' | ')}`);
    }
    expect(s.day).toBeGreaterThan(30);
  });
});
