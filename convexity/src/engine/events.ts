// Scheduled macro/earnings calendar, unscheduled shocks and news flow.
// Outcomes are drawn from streams keyed on the event id — never on the player's book.

import { ASSETS, AssetId, EventKind, MarketState, REGIMES, ScheduledEvent, SPECS, TICKS_PER_DAY } from './market';
import { clamp, rngFor } from './math';

export interface NewsItem {
  id: string;
  day: number;
  tick: number;
  text: string;
  tone: 'pos' | 'neg' | 'neutral';
  tag: string;
}

export const EVENT_INFO: Record<EventKind, { label: string; short: string }> = {
  fed: { label: 'Federal Reserve decision', short: 'FED' },
  cpi: { label: 'US CPI release', short: 'CPI' },
  ecb: { label: 'ECB decision', short: 'ECB' },
  payrolls: { label: 'US payrolls', short: 'NFP' },
  earnings: { label: 'Northkite earnings', short: 'EARN' },
  shock_selloff: { label: 'Cross-asset selloff', short: 'SHOCK' },
  shock_single: { label: 'Single-name blow-up', short: 'SHOCK' },
  shock_liquidity: { label: 'Liquidity squeeze', short: 'SHOCK' },
  shock_vol_crush: { label: 'Relief rally', short: 'RALLY' },
  shock_fx: { label: 'FX dislocation', short: 'SHOCK' },
};

const tickAt = (hh: number, mm: number) => Math.round((hh * 60 + mm - 480) / 5);

/** Ensure the calendar contains scheduled events through `upTo` (inclusive). Deterministic in (seed, day). */
export function ensureCalendar(m: MarketState, upTo: number, generatedTo: number): number {
  for (let d = generatedTo + 1; d <= upTo; d++) {
    const k = d % 10;
    const add = (kind: EventKind, tick: number, moveStd: Partial<Record<AssetId, number>>, title: string) =>
      m.events.push({ id: `${kind}-${d}`, kind, day: d, tick, title, moveStd, status: 'pending' });
    if (k === 2) add('fed', tickAt(14, 0), { ORX: 0.008, NKT: 0.012, AUR: 0.005, EURUSD: 0.0045 }, 'Fed rate decision · 14:00');
    if (k === 5) add('cpi', tickAt(8, 30), { ORX: 0.005, NKT: 0.008, EURUSD: 0.003 }, 'US CPI · 08:30');
    if (k === 7) add('ecb', tickAt(13, 45), { AUR: 0.006, EURUSD: 0.0045 }, 'ECB decision · 13:45');
    if (k === 9) add('payrolls', tickAt(8, 30), { ORX: 0.004, EURUSD: 0.003 }, 'US payrolls · 08:30');
    if (d % 20 === 3) add('earnings', tickAt(16, 5), { NKT: 0.065 }, 'Northkite earnings · 16:05');
  }
  return Math.max(generatedTo, upTo);
}

/** Decide (at the open) whether an unscheduled shock hits today. Depends only on market state. */
export function rollShock(m: MarketState): ScheduledEvent | null {
  const r = rngFor(m.seed, m.day, 'shock');
  const R = REGIMES[m.regime];
  const base = { calm: 0.025, trending: 0.03, choppy: 0.05, stressed: 0.14, crisis: 0.22 }[m.regime];
  const p = clamp(base * Math.exp(0.55 * m.pressure), 0, 0.45);
  if (!r.chance(p)) return null;
  const kinds: EventKind[] = ['shock_selloff', 'shock_single', 'shock_liquidity', 'shock_vol_crush', 'shock_fx'];
  const w = R.stress > 0.5 ? [4, 2, 3, 1.5, 1] : [1.5, 2.5, 1, 2, 1.2];
  const kind = r.weighted(kinds, w);
  const tick = r.int(10, TICKS_PER_DAY - 8);
  return { id: `${kind}-${m.day}`, kind, day: m.day, tick, title: EVENT_INFO[kind].label, moveStd: {}, status: 'pending' };
}

const fmtBp = (x: number) => `${x >= 0 ? '+' : ''}${(x * 1e4).toFixed(0)}bp`;
const fmtPct = (x: number) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}%`;

function bumpSpot(m: MarketState, id: AssetId, logRet: number) {
  m.assets[id].spot *= Math.exp(logRet);
}

/** Apply an event's market impact. Returns the headline. */
export function applyEvent(m: MarketState, e: ScheduledEvent): string {
  const r = rngFor(m.seed, e.id, 'surprise');
  const s = r.studentT(5);
  e.surprise = s;
  e.status = 'done';
  let text = '';
  const eq = (o: number, n: number, a: number) => {
    bumpSpot(m, 'ORX', o);
    bumpSpot(m, 'NKT', n);
    bumpSpot(m, 'AUR', a);
  };
  switch (e.kind) {
    case 'fed': {
      const db1 = 0.0012 * s;
      m.curve.b1 += db1;
      m.curve.b0 += 0.0005 * s;
      bumpSpot(m, 'EURUSD', -0.004 * s);
      const tail = Math.abs(s) > 1.5 ? -0.004 * Math.abs(s) : 0;
      eq(-0.0065 * s + tail, -0.01 * s + 1.4 * tail, -0.004 * s + tail * 0.7);
      m.volShock += 0.04 * Math.max(0, s) + (Math.abs(s) > 1.5 ? 0.08 : 0) - (Math.abs(s) < 0.5 ? 0.04 : 0);
      m.corr = clamp(m.corr + 0.03 * Math.abs(s), 0.05, 0.93);
      m.pressure += 0.25 * Math.max(0, s);
      text = s > 1 ? `Fed surprises hawkish — dots shift higher, 2Y ${fmtBp(db1 + 0.0005 * s)}` : s < -1 ? `Fed surprises dovish — signals cuts, 2Y ${fmtBp(db1 + 0.0005 * s)}` : `Fed holds, statement broadly as expected (2Y ${fmtBp(db1 + 0.0005 * s)})`;
      break;
    }
    case 'cpi': {
      m.curve.b1 += 0.0008 * s;
      m.curve.b0 += 0.0006 * s;
      bumpSpot(m, 'EURUSD', -0.0025 * s);
      eq(-0.004 * s, -0.007 * s, -0.002 * s);
      m.volShock += 0.025 * Math.max(0, s);
      text = s > 0.8 ? `US CPI hot: core +${(0.3 + 0.1 * s).toFixed(1)}% m/m vs 0.3% expected` : s < -0.8 ? `US CPI soft: core +${Math.max(0, 0.3 + 0.1 * s).toFixed(1)}% m/m, below consensus` : `US CPI in line with consensus`;
      break;
    }
    case 'ecb': {
      m.eurRate += 0.001 * s;
      bumpSpot(m, 'EURUSD', 0.004 * s);
      bumpSpot(m, 'AUR', -0.004 * s);
      text = s > 0.8 ? 'ECB hawkish: deposit rate path repriced higher, EUR bid' : s < -0.8 ? 'ECB dovish: Lagarde-style pivot, EUR offered' : 'ECB on hold, guidance unchanged';
      break;
    }
    case 'payrolls': {
      m.curve.b1 += 0.0008 * s;
      bumpSpot(m, 'EURUSD', -0.003 * s);
      eq(0.002 * s, 0.003 * s, 0.001 * s);
      text = `US payrolls ${s >= 0 ? '+' : ''}${Math.round(160 + 90 * s)}k vs 160k expected`;
      break;
    }
    case 'earnings': {
      const jump = 0.062 * s;
      bumpSpot(m, 'NKT', jump);
      bumpSpot(m, 'ORX', 0.06 * jump);
      m.assets.NKT.v *= 0.82;
      text = `Northkite results: ${jump > 0 ? 'beat and raise' : 'miss, guidance cut'} — stock ${fmtPct(Math.exp(jump) - 1)} after the bell`;
      break;
    }
    case 'shock_selloff': {
      const size = 0.03 + 0.018 * Math.abs(s);
      eq(-size, -size * 1.4, -size * 0.95);
      bumpSpot(m, 'EURUSD', -0.008);
      m.corr = clamp(m.corr + 0.2, 0.05, 0.93);
      m.volShock += 0.55;
      m.pressure += 1.3;
      m.liqShock = 2.5;
      m.curve.b0 -= 0.0015;
      m.curve.b1 -= 0.002;
      m.credit += 25;
      text = `Cross-asset liquidation: ORX ${fmtPct(-size)}, credit gaps wider, vol bid across the board`;
      break;
    }
    case 'shock_single': {
      const size = 0.12 + 0.05 * Math.abs(s);
      bumpSpot(m, 'NKT', -size);
      bumpSpot(m, 'ORX', -0.006);
      m.assets.NKT.v *= 1.6;
      m.corr = clamp(m.corr - 0.15, 0.05, 0.93);
      text = `Northkite halted then reopens ${fmtPct(-size)}: regulator opens probe into revenue recognition`;
      break;
    }
    case 'shock_liquidity': {
      m.liqShock = 3.5;
      m.volShock += 0.25;
      m.credit += 15;
      m.pressure += 0.6;
      eq(-0.01, -0.014, -0.009);
      text = 'Funding markets seize: repo rates spike, dealers pull bids, spreads blow out';
      break;
    }
    case 'shock_vol_crush': {
      eq(0.015, 0.022, 0.012);
      m.volShock -= 0.22;
      m.corr = clamp(m.corr - 0.05, 0.05, 0.93);
      m.pressure -= 0.5;
      text = 'Relief rally: trade-deal headlines spark short covering, vol sellers return';
      break;
    }
    case 'shock_fx': {
      const sign = s >= 0 ? 1 : -1;
      bumpSpot(m, 'EURUSD', 0.017 * sign);
      m.assets.EURUSD.v *= 1.5;
      text = `EURUSD ${sign > 0 ? 'squeezes higher' : 'collapses'} ${fmtPct(0.017 * sign)} on reserve-manager flows`;
      break;
    }
  }
  m.volShock = clamp(m.volShock, -0.3, 1.5);
  e.outcome = text;
  return text;
}

// ---------------------------------------------------------------- news flow

const STRESS_NEWS = [
  ['Prime brokers raise margin requirements on concentrated books', 'funding'],
  ['IG credit index widens for a fifth straight session', 'credit'],
  ['Repo haircuts on corporate collateral tick higher', 'funding'],
  ['Strategist: "positioning is the most crowded since 2021"', 'flows'],
  ['Large macro fund said to be cutting gross exposure', 'flows'],
  ['Regional lender delays results; shares indicated lower', 'credit'],
  ['VIX-style term structure flattens as hedging demand rises', 'vol'],
];
const CALM_NEWS = [
  ['Systematic vol sellers report record inflows', 'vol'],
  ['Corporate buybacks resume after blackout period', 'flows'],
  ['Credit primary market busy; deals 4x oversubscribed', 'credit'],
  ['Realised correlation drifts lower; dispersion trades in vogue', 'vol'],
  ['Structured note issuance hits quarterly record in Asia', 'flows'],
  ['Economists nudge up growth forecasts', 'macro'],
];
const SINGLE_RUMOUR = ['Chatter of a short-seller report on Northkite', 'Northkite: unusual put volume in the weeklies', 'Supplier warns on Northkite orders, per trade press'];
const LIQ_RUMOUR = ['Overnight funding prints wide of the policy rate', 'Treasury basis widens sharply; RV funds under pressure'];

export function newsForTick(m: MarketState, hiddenToday: ScheduledEvent | null): NewsItem | null {
  const r = rngFor(m.seed, m.day, m.tick, 'news');
  const id = `n-${m.day}-${m.tick}`;
  // precursors: rumours ahead of hidden shocks (sometimes) — and false alarms
  if (hiddenToday && hiddenToday.status === 'pending' && m.tick < hiddenToday.tick && hiddenToday.tick - m.tick < 30 && r.chance(0.045)) {
    if (hiddenToday.kind === 'shock_single') return { id, day: m.day, tick: m.tick, text: r.pick(SINGLE_RUMOUR), tone: 'neg', tag: 'rumour' };
    if (hiddenToday.kind === 'shock_liquidity' || hiddenToday.kind === 'shock_selloff') return { id, day: m.day, tick: m.tick, text: r.pick([...LIQ_RUMOUR, ...STRESS_NEWS.map((x) => x[0])]), tone: 'neg', tag: 'rumour' };
  }
  if (r.chance(0.004)) return { id, day: m.day, tick: m.tick, text: r.pick(SINGLE_RUMOUR), tone: 'neg', tag: 'rumour' };
  const pStress = 0.012 * Math.max(0, m.pressure);
  if (r.chance(pStress)) {
    const [t, tag] = r.pick(STRESS_NEWS);
    return { id, day: m.day, tick: m.tick, text: t, tone: 'neg', tag };
  }
  if (m.pressure < 0.2 && r.chance(0.01)) {
    const [t, tag] = r.pick(CALM_NEWS);
    return { id, day: m.day, tick: m.tick, text: t, tone: 'pos', tag };
  }
  return null;
}

export function assetMoveText(id: AssetId, ret: number): string {
  return `${SPECS[id].name} ${fmtPct(ret)}`;
}
export const allAssets = ASSETS;
