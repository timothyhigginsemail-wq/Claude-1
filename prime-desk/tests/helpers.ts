import { balanceSheet, trialBalance } from '../src/engine/ledger';
import { endDay } from '../src/game/day';
import { resolveEvent } from '../src/game/events';
import type { GameState } from '../src/engine/types';
import { deskSummary } from '../src/engine/analytics';

/** Autoplayer: resolves every pending event with a policy, then closes the day. */
export type Policy = 'primary' | 'first' | 'random' | 'prudent';

/** Deterministic (seeded) autoplayer used by tests and balancing runs. */
export function playDay(s: GameState, policy: Policy = 'primary', rnd: () => number = Math.random) {
  for (const ev of s.events) {
    if (ev.status !== 'pending') continue;
    const opts = ev.options.filter((o) => !o.usesAnalyst);
    let opt = opts[0];
    if (policy === 'primary') opt = opts.find((o) => o.tone === 'primary') ?? opts[0];
    if (policy === 'random') opt = opts[Math.floor(rnd() * opts.length)];
    if (policy === 'prudent') {
      const util = deskSummary(s).capitalUtil;
      const pickId = (id: string) => opts.find((o) => o.id === id) ?? opts[0];
      switch (ev.kind) {
        case 'onboarding':
          opt = util > 0.75 && ev.data.round === 1 ? pickId('decline') : pickId(ev.data.round === 2 ? 'accept' : 'propose');
          break;
        case 'financingRequest':
          opt = util > 0.7 ? pickId('decline') : pickId('collateral');
          break;
        case 'marginDefault':
          opt = pickId('fire');
          break;
        case 'squeezeAlert':
          opt = pickId('addon');
          break;
        case 'competitorOffer':
          opt = pickId('match');
          break;
        case 'managementReview':
          opt = pickId('capital');
          break;
        case 'fundingShock':
          opt = pickId('term');
          break;
        default:
          opt = opts.find((o) => o.tone === 'primary') ?? opts[0];
      }
    }
    resolveEvent(s, ev, opt.id);
  }
  return endDay(s);
}

export function assertBooksBalance(s: GameState) {
  const tb = trialBalance(s.ledger);
  const bs = balanceSheet(s);
  const scale = Math.max(1, bs.assets.total);
  if (Math.abs(tb) > 1e-6 * scale) throw new Error(`Trial balance ${tb}`);
  const diff = bs.assets.total - bs.liabilities.total - bs.equity.total;
  if (Math.abs(diff) > 1e-6 * scale) throw new Error(`A != L + E by ${diff}`);
}
