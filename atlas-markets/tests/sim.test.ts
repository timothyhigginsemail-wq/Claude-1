import { it } from 'vitest';
import { fm } from '../src/engine/format';
import { startGame } from '../src/game/day';
import { playDay } from './helpers';

it.skipIf(!process.env.SIM)('sim report', () => {
  const s = startGame(2027);
  const t0 = Date.now();
  for (let i = 0; i < 32 && s.status === 'playing'; i++) {
    const t = Date.now();
    const nr = s.rfqs.length;
    const r = playDay(s, (process.env.POLICY as any) ?? 'fair');
    const p = r.parts;
    const top = Object.entries(p).filter(([, v]) => Math.abs(v) > 5e3).map(([k, v]) => `${k} ${fm(v)}`).join(' ');
    console.log(`D${r.day} ${s.history.at(-1)!.regime} rfq ${nr} pnl ${fm(r.total)} ep ${fm(r.ep)} var ${fm(s.history.at(-1)!.var)} cap ${fm(s.history.at(-1)!.capital)} conf ${s.confidence.toFixed(0)} ${Date.now() - t}ms | ${top} | breaches ${r.breaches.length}`);
  }
  console.log('total ms', Date.now() - t0, 'achievements', s.achievements.join(','));
});
