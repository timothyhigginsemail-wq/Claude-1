// Strategic management: capital allocation (which sets risk limits), hiring, technology, desk
// launches and management reviews.

import { fm, fpct } from '../engine/format';
import type { Decision, DeskId, GameState, Trader } from '../engine/types';
import { DESK_META, makeTrader } from './setup';

export const HURDLE = 0.12;
export const DESK_FIXED_COST = 10e6; // per unlocked desk per year (infrastructure, ops, sales coverage)
export const TECH_COST = 5e6; // per tech level per desk per year
export const VAR_PER_CAPITAL: Record<DeskId, number> = { eq: 0.01, rates: 0.0085, fx: 0.01, credit: 0.01, cmdty: 0.0115, exotics: 0.0165 };
const PRIMARY_PER_CAPITAL: Record<DeskId, number> = { eq: 0.005, rates: 0.001, fx: 0.00625, credit: 0.000625, cmdty: 0.0065, exotics: 0.004 };

export function log(s: GameState, text: string, tone: 'good' | 'bad' | 'neutral' = 'neutral') {
  s.log.push({ day: s.day, text, tone });
  if (s.log.length > 300) s.log.splice(0, s.log.length - 300);
}

export function allocated(s: GameState) {
  return Object.values(s.desks).reduce((a, d) => a + d.capital, 0);
}

export function setCapital(s: GameState, desk: DeskId, amount: number): string {
  const d = s.desks[desk];
  const free = s.firmCapital - allocated(s) + d.capital;
  const amt = Math.max(0, Math.min(free, amount));
  d.capital = amt;
  d.limits.var = amt * VAR_PER_CAPITAL[desk];
  d.limits.primary = amt * PRIMARY_PER_CAPITAL[desk];
  return `${d.name}: ${fm(amt)} capital → VaR limit ${fm(d.limits.var)}.`;
}

export function dailyCosts(s: GameState, days: number): { total: number; byDesk: Record<DeskId, number> } {
  const byDesk = {} as Record<DeskId, number>;
  let total = 0;
  for (const id of Object.keys(s.desks) as DeskId[]) {
    const d = s.desks[id];
    let c = 0;
    if (d.unlocked) c += DESK_FIXED_COST + TECH_COST * d.tech;
    for (const t of s.traders) if (t.desk === id) c += t.cost;
    c = (c * days) / 365;
    byDesk[id] = c;
    total += c;
  }
  total += (s.riskInfra * 4e6 * days) / 365;
  return { total, byDesk };
}

export function upgradeTech(s: GameState, desk: DeskId): string {
  const d = s.desks[desk];
  if (d.tech >= 3) return 'Already at the maximum technology level.';
  d.tech += 1;
  s.costsToday += 3e6; // one-off build cost
  log(s, `${d.name}: electronic trading platform upgraded to level ${d.tech} (+$3m build, +${fm(TECH_COST)}/yr).`);
  return `Upgraded to level ${d.tech}. More electronic flow from tomorrow; running cost ${fm(TECH_COST)}/yr higher.`;
}

export function hire(s: GameState, t: Trader): string {
  s.traders.push(t);
  s.costsToday += t.cost * 0.25; // sign-on / guarantee
  log(s, `Hired ${t.name} to ${DESK_META[t.desk].name} (${fm(t.cost)}/yr).`);
  return `${t.name} joins ${DESK_META[t.desk].name}.`;
}

export function fire(s: GameState, id: string): string {
  const t = s.traders.find((x) => x.id === id);
  if (!t) return '';
  s.traders = s.traders.filter((x) => x.id !== id);
  s.costsToday += t.cost * 0.5; // severance
  log(s, `Let go ${t.name} (severance ${fm(t.cost * 0.5)}).`);
  return `${t.name} has left. Severance ${fm(t.cost * 0.5)}.`;
}

export function candidates(s: GameState, desk: DeskId): Trader[] {
  const h = { rng: (s.seed + s.day * 7919 + desk.length * 104729) >>> 0 };
  return [0, 1, 2].map((i) => makeTrader(h, desk, undefined, i + 10));
}

// ---------------------------------------------------------------- decisions

export function decision(s: GameState, d: Omit<Decision, 'id' | 'day' | 'status'>): Decision {
  const x: Decision = { id: `D${s.nextId++}`, day: s.day, status: 'open', ...d };
  s.decisions.push(x);
  return x;
}

export function launchDecision(s: GameState, desk: DeskId) {
  const meta = DESK_META[desk];
  const blurbs: Partial<Record<DeskId, string>> = {
    credit: 'The board has approved a credit trading business: IG and high-yield bonds, single-name CDS and CDX indices. Credit is less liquid than rates — inventory is harder to exit and spreads gap in stress. How much capital do you commit?',
    cmdty: 'Commodities go live: oil, natural gas, gold, copper and corn futures and options for producer and consumer hedgers, with curve (contango/backwardation) risk. Physical delivery stays off for now.',
    exotics: 'Cross-asset & exotics launches: autocallable notes for the private bank and variance swaps for hedge funds. Big upfront margins, long-dated hedging exposures (vega, skew, gap risk).',
  };
  decision(s, {
    kind: 'launch',
    title: `Launch ${meta.name}`,
    body: blurbs[desk] ?? '',
    options: [
      { id: 'big', label: `Commit ${fm(desk === 'exotics' ? 400e6 : 400e6)}`, detail: 'Larger limits, more client flow, higher fixed costs and capital charge.', tone: 'primary' },
      { id: 'small', label: `Commit ${fm(200e6)}`, detail: 'A cautious start; tighter limits.' },
      { id: 'defer', label: 'Defer the launch', detail: 'Keep capital in the existing desks. You can launch later from Desk → Management.' },
    ],
    data: { desk },
  });
}

export function reviewDecision(s: GameState, summary: { pnl: number; ep: number; roac: number }) {
  decision(s, {
    kind: 'review',
    title: 'Management review with the CEO',
    body: `Cumulative revenue ${fm(summary.pnl)}, economic profit ${fm(summary.ep)} after the 12% capital charge, return on allocated capital ${fpct(summary.roac)} annualised. Management confidence ${Math.round(s.confidence)}/100. You may request more capital — it is granted only if the business is earning it.`,
    options: [
      { id: 'request', label: 'Request +$400m firm capital', detail: 'Granted if RoAC beats the hurdle and confidence is solid; a weak ask costs credibility.', tone: 'primary' },
      { id: 'return', label: 'Return $200m of unused capital', detail: 'Improves returns on what remains; signals discipline.' },
      { id: 'steady', label: 'No change', detail: '' },
    ],
    data: {},
  });
}

export function resolveDecision(s: GameState, id: string, optionId: string): string {
  const d = s.decisions.find((x) => x.id === id);
  if (!d || d.status !== 'open') return '';
  let out = '';
  if (d.kind === 'launch') {
    const desk = d.data.desk as DeskId;
    if (optionId === 'defer') out = `${DESK_META[desk].name} launch deferred.`;
    else {
      const amt = optionId === 'big' ? 400e6 : 200e6;
      if (s.firmCapital - allocated(s) < amt) s.firmCapital = allocated(s) + amt;
      s.desks[desk].unlocked = true;
      setCapital(s, desk, amt);
      for (let i = 0; i < 2; i++) s.traders.push(makeTrader({ rng: (s.seed + s.day * 31 + i) >>> 0 }, desk, undefined, i + 50));
      out = `${DESK_META[desk].name} is live with ${fm(amt)} of capital and two traders.`;
      log(s, out, 'good');
    }
  } else if (d.kind === 'review') {
    if (optionId === 'request') {
      const roac = d.data.roac ?? 0;
      if (s.confidence >= 55 && (s.cumEP > 0 || roac > HURDLE)) {
        s.firmCapital += 400e6;
        s.confidence += 3;
        out = 'Approved: +$400m of capital. Allocate it from Desk → Management.';
      } else {
        s.confidence -= 5;
        out = 'Declined: "Earn your cost of capital first."';
      }
    } else if (optionId === 'return') {
      const free = s.firmCapital - allocated(s);
      if (free >= 200e6) {
        s.firmCapital -= 200e6;
        s.confidence += 3;
        out = 'Returned $200m to the group. Management notes the discipline.';
      } else out = 'Not enough unallocated capital to return — reduce desk allocations first.';
    } else out = 'No change.';
  } else if (d.kind === 'limit') {
    const desk = d.data.desk as DeskId;
    if (optionId === 'approve') {
      s.desks[desk].limits.var *= 1.3;
      s.desks[desk].limits.primary *= 1.3;
      out = `${DESK_META[desk].name} limits raised 30% (capital unchanged — more risk per dollar of capital).`;
    } else out = 'Limits unchanged. The trader is unhappy but compliant.';
  } else if (d.kind === 'poach') {
    const t = s.traders.find((x) => x.id === d.data.traderId);
    if (t) {
      if (optionId === 'match') {
        t.cost *= 1.35;
        out = `${t.name} stays on a ${fm(t.cost)} package.`;
      } else {
        s.traders = s.traders.filter((x) => x.id !== t.id);
        out = `${t.name} leaves for ${d.data.competitor}.`;
        log(s, out, 'bad');
      }
    }
  }
  d.status = 'done';
  d.outcome = out;
  return out;
}

export function randomDecisions(s: GameState, r: () => number) {
  if (s.day <= 3) return;
  const open = s.decisions.filter((d) => d.status === 'open').length;
  if (open >= 2) return;
  if (r() < 0.06) {
    const desks = (Object.keys(s.desks) as DeskId[]).filter((d) => s.desks[d].unlocked);
    const desk = desks[Math.floor(r() * desks.length)];
    decision(s, {
      kind: 'limit',
      title: `${DESK_META[desk].name}: request for higher limits`,
      body: `Your head of ${DESK_META[desk].name.toLowerCase()} argues the desk is turning away good client risk and asks for 30% higher VaR and sensitivity limits without extra capital.`,
      options: [
        { id: 'approve', label: 'Approve', detail: 'More risk capacity; more potential loss in a stress.' },
        { id: 'decline', label: 'Decline', detail: 'Keep risk proportional to capital.', tone: 'primary' },
      ],
      data: { desk },
    });
  } else if (r() < 0.05 && s.traders.length) {
    const best = [...s.traders].sort((a, b) => b.skill - a.skill)[0];
    const comp = Object.values(s.competitors)[Math.floor(r() * Object.keys(s.competitors).length)];
    decision(s, {
      kind: 'poach',
      title: `${comp.name} is trying to hire ${best.name}`,
      body: `${best.name} (${DESK_META[best.desk].name}, skill ${Math.round(best.skill * 100)}) has an offer at 35% above their current ${fm(best.cost)}.`,
      options: [
        { id: 'match', label: 'Match the offer', detail: `Pay ${fm(best.cost * 1.35)} a year.`, tone: 'primary' },
        { id: 'let', label: 'Let them go', detail: 'Save the cost; the desk loses skill.' },
      ],
      data: { traderId: best.id, competitor: comp.name },
    });
  }
}
