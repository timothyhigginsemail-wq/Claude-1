// Achievements tied to genuine trading skill, checked at each close.

import { summarise } from '../engine/risk';
import type { DeskId, GameState } from '../engine/types';
import type { FlowResult } from './flow';
import { log } from './manage';

export const ACHIEVEMENTS: Record<string, { title: string; desc: string }> = {
  block: { title: 'Risk transfer', desc: 'Won a $100m+ equity block and closed the day inside your equity delta limit.' },
  dv01: { title: 'Duration-neutral', desc: 'Won a $250m+ swap and closed with rates DV01 under $50k.' },
  carry: { title: 'Carry trade', desc: 'FX desk earned $50k+ of currency carry in a single day.' },
  crisis: { title: 'Liquidity provider', desc: 'Won 5 client trades while markets were stressed or in crisis.' },
  clean10: { title: 'Disciplined', desc: '10 consecutive closes without a limit breach.' },
  ep5: { title: 'Earning the hurdle', desc: 'Five consecutive days of positive economic profit.' },
  structurer: { title: 'Structurer', desc: 'Issued an autocallable and closed the day equity-delta-neutral on the exotics desk.' },
  protected: { title: 'Protected', desc: 'Held CDS protection on an issuer that defaulted.' },
  survivor: { title: 'Survivor', desc: 'Completed the 30-day campaign with confidence of 50 or more.' },
  diversified: { title: 'Diversified franchise', desc: 'Five desks profitable on the same day.' },
};

function award(s: GameState, id: string) {
  if (s.achievements.includes(id)) return;
  s.achievements.push(id);
  log(s, `Achievement: ${ACHIEVEMENTS[id].title} — ${ACHIEVEMENTS[id].desc}`, 'good');
}

export function checkAchievements(s: GameState, ctx: { flows: FlowResult[]; breaches: string[]; total: number }) {
  const won = s.rfqs.filter((r) => r.status === 'won');
  if (won.some((r) => r.desk === 'eq' && r.notional >= 100e6)) {
    const r = summarise(s, 'eq');
    if (r.primary <= s.desks.eq.limits.primary) award(s, 'block');
  }
  if (won.some((r) => r.desk === 'rates' && s.instruments[r.instId]?.kind === 'irs' && r.notional >= 250e6)) {
    if (Math.abs(summarise(s, 'rates').dv01) < 50e3) award(s, 'dv01');
  }
  if (s.desks.fx.pnlToday.accrual > 50e3) award(s, 'carry');
  if (s.stats.crisisWins >= 5) award(s, 'crisis');
  if (s.cleanDays >= 10) award(s, 'clean10');
  const last5 = s.history.slice(-5);
  if (last5.length === 5 && last5.every((h) => h.ep > 0)) award(s, 'ep5');
  if (won.some((r) => r.desk === 'exotics' && s.instruments[r.instId]?.kind === 'autocall') && Math.abs(summarise(s, 'exotics').eqDelta) < 0.25 * s.desks.exotics.limits.primary * 10) award(s, 'structurer');
  if (Object.values(s.desks).some((d) => d.pnlToday.defaults > 0)) award(s, 'protected');
  if (s.day >= 30 && s.confidence >= 50) award(s, 'survivor');
  const profitable = (Object.keys(s.desks) as DeskId[]).filter((d) => s.desks[d].unlocked && s.history.length && (s.history[s.history.length - 1]?.byDesk?.[d] ?? 0) > 0).length;
  if (profitable >= 5) award(s, 'diversified');
}
