import { it } from 'vitest';
import { newGame } from '../src/game/newGame';
import { resolveEvent } from '../src/game/events';
import { endDay } from '../src/game/day';
import { deskSummary } from '../src/engine/analytics';
import { computeScore } from '../src/game/scoring';
import { fm } from '../src/engine/format';
import { playDay, type Policy } from './helpers';
import { mulberry } from './rand';

const LAX = ['accept', 'approve', 'waive', 'grace', 'fill', 'allow', 'monitor', 'absorb', 'standard', 'extend', 'match'];
function laxDay(s: any) {
  for (const ev of s.events) {
    if (ev.status !== 'pending') continue;
    const id = ev.options.find((o: any) => LAX.includes(o.id))?.id ?? ev.options.find((o: any) => !o.usesAnalyst).id;
    resolveEvent(s, ev, id);
  }
  endDay(s);
}

it.skipIf(!process.env.BALANCE)('balance report', () => {
  for (const pol of ['prudent', 'primary', 'lax'] as const) {
    for (const seed of [2027, 1, 2, 3, 4]) {
      const s = newGame(seed);
      const rnd = mulberry(seed);
      for (let i = 0; i < 30 && s.status === 'playing'; i++) pol === 'lax' ? laxDay(s) : playDay(s, pol as Policy, rnd);
      const d = deskSummary(s);
      const act = Object.values(s.clients).filter((c) => c.status === 'active').map((c) => c.short).join(',');
      const dft = Object.values(s.clients).filter((c) => c.status === 'defaulted').map((c) => c.short).join(',');
      console.log(`${pol.padEnd(7)} seed ${String(seed).padEnd(5)} ${s.status.padEnd(7)} day ${s.day} conf ${s.desk.confidence.toFixed(0).padStart(3)} cumEP ${fm(s.cumEP).padStart(7)} loss ${fm(-s.pnlCum.creditLoss).padStart(7)} emerg ${s.desk.emergencyDays} capUtil ${(d.capitalUtil * 100).toFixed(0)}% run ${fm(d.revenueRunRate)} RoAC ${(d.roac * 100).toFixed(0)}% score ${computeScore(s).total.toFixed(0)} | ${act} | def: ${dft}`);
    }
  }
});
