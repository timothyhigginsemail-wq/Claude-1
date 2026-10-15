import { emptyPnl } from '../engine/book';
import { START_DATE } from '../engine/calendar';
import { buildUniverse, refreshListings } from '../engine/instruments';
import { initialMarket } from '../engine/market';
import type { Client, Competitor, Desk, DeskId, GameState, MacroEvent, Trader } from '../engine/types';
import { STOCKS } from '../engine/market';

export const SAVE_VERSION = 1;

export const DESK_META: Record<DeskId, { name: string; short: string; color: string; unlockDay: number }> = {
  eq: { name: 'Equities', short: 'EQ', color: '#7FA7D9', unlockDay: 1 },
  rates: { name: 'Rates', short: 'RATES', color: '#C9A86A', unlockDay: 1 },
  fx: { name: 'Foreign Exchange', short: 'FX', color: '#6FC2B0', unlockDay: 1 },
  credit: { name: 'Credit', short: 'CREDIT', color: '#D98F6F', unlockDay: 6 },
  cmdty: { name: 'Commodities', short: 'CMDTY', color: '#C9B26A', unlockDay: 13 },
  exotics: { name: 'Cross-Asset & Exotics', short: 'EXOTICS', color: '#B39DDB', unlockDay: 17 },
};

function desk(id: DeskId, capital: number, varLimit: number, primary: number, unlocked: boolean): Desk {
  return {
    id,
    name: DESK_META[id].name,
    unlocked,
    capital,
    limits: { var: varLimit, primary },
    tech: 1,
    flowSpread: 1,
    autoHedge: 0.75,
    cash: { USD: 0 },
    positions: {},
    breachDays: 0,
    restrictedUntil: 0,
    pnl: emptyPnl(),
    pnlToday: emptyPnl(),
  };
}

const C = (c: Omit<Client, 'rfqs' | 'wins' | 'noQuotes' | 'stressLiquidity' | 'revenue'>): Client => ({ rfqs: 0, wins: 0, noQuotes: 0, stressLiquidity: 0, revenue: 0, ...c });

export function roster(): Record<string, Client> {
  const list: Client[] = [
    C({ id: 'kestrel', name: 'Kestrel Lane Capital', type: 'hedgeFund', desks: ['eq', 'credit', 'exotics'], relationship: 50, informed: 0.55, priceSens: 0.85, sizeMult: 1.3, activity: 1.2, share: 0.08, credit: 'BB' }),
    C({ id: 'quadrant', name: 'Quadrant Quantitative', type: 'quant', desks: ['eq', 'fx'], relationship: 45, informed: 0.4, priceSens: 1, sizeMult: 0.4, activity: 1.6, share: 0.1, credit: 'BBB' }),
    C({ id: 'northfield', name: 'Northfield Teachers Pension', type: 'pension', desks: ['rates', 'eq', 'credit'], relationship: 60, informed: 0.03, priceSens: 0.45, sizeMult: 2.5, activity: 0.7, share: 0.12, credit: 'A' }),
    C({ id: 'harbourview', name: 'Harbourview Asset Management', type: 'assetMgr', desks: ['eq', 'credit', 'rates', 'fx'], relationship: 55, informed: 0.15, priceSens: 0.6, sizeMult: 1.2, activity: 1.1, share: 0.1, credit: 'A' }),
    C({ id: 'sentinel', name: 'Sentinel Life & Annuity', type: 'insurer', desks: ['rates', 'credit'], relationship: 55, informed: 0.05, priceSens: 0.5, sizeMult: 2, activity: 0.7, share: 0.1, credit: 'A' }),
    C({ id: 'gulf', name: 'Gulf Horizon Investment Authority', type: 'swf', desks: ['fx', 'eq', 'rates'], relationship: 50, informed: 0.2, priceSens: 0.5, sizeMult: 3, activity: 0.5, share: 0.06, credit: 'A' }),
    C({ id: 'voltaire', name: 'Voltaire Industries', type: 'corporate', desks: ['fx', 'rates'], relationship: 55, informed: 0, priceSens: 0.3, sizeMult: 1, activity: 0.6, share: 0.15, credit: 'BBB' }),
    C({ id: 'ironside', name: 'Ironside Airlines', type: 'corporate', desks: ['cmdty', 'fx'], relationship: 50, informed: 0, priceSens: 0.35, sizeMult: 1, activity: 0.6, share: 0.12, credit: 'BB' }),
    C({ id: 'cobalt', name: 'Cobalt Ridge Mining', type: 'corporate', desks: ['cmdty', 'fx'], relationship: 50, informed: 0.05, priceSens: 0.35, sizeMult: 1, activity: 0.5, share: 0.12, credit: 'BBB' }),
    C({ id: 'brightmoor', name: 'Brightmoor Macro', type: 'hedgeFund', desks: ['rates', 'fx', 'cmdty'], relationship: 50, informed: 0.45, priceSens: 0.8, sizeMult: 1.5, activity: 1, share: 0.07, credit: 'BBB' }),
    C({ id: 'stanhope', name: 'Stanhope Morrow (dealer)', type: 'dealer', desks: ['rates', 'fx', 'credit', 'eq'], relationship: 50, informed: 0.25, priceSens: 0.95, sizeMult: 1.2, activity: 0.8, share: 0.05, credit: 'A' }),
    C({ id: 'velocity', name: 'Velocity Markets (EMM)', type: 'emm', desks: ['eq', 'fx'], relationship: 40, informed: 0.65, priceSens: 1, sizeMult: 0.35, activity: 1.3, share: 0.05, credit: 'A' }),
    C({ id: 'privatebank', name: 'Atlas Private Bank (structured notes)', type: 'privateBank', desks: ['exotics'], relationship: 70, informed: 0, priceSens: 0.3, sizeMult: 1, activity: 0.8, share: 0.9, credit: 'A' }),
  ];
  return Object.fromEntries(list.map((c) => [c.id, c]));
}

export function competitors(): Record<string, Competitor> {
  const all: DeskId[] = ['eq', 'rates', 'fx', 'credit', 'cmdty', 'exotics'];
  const sh = (o: Partial<Record<DeskId, number>>) => Object.fromEntries(all.map((d) => [d, o[d] ?? 0.1])) as Record<DeskId, number>;
  const list: Competitor[] = [
    { id: 'ironbridge', name: 'Ironbridge', style: 'Largest balance sheet; dominant in rates and FX', tightness: 0.95, appetite: 1.1, strengths: ['rates', 'fx', 'credit'], share: sh({ eq: 0.12, rates: 0.16, fx: 0.15, credit: 0.14, cmdty: 0.12, exotics: 0.12 }) },
    { id: 'stanhope', name: 'Stanhope Morrow', style: 'Equities and derivatives powerhouse', tightness: 0.95, appetite: 1, strengths: ['eq', 'exotics'], share: sh({ eq: 0.15, rates: 0.1, fx: 0.08, credit: 0.1, cmdty: 0.08, exotics: 0.15 }) },
    { id: 'carraway', name: 'Carraway & Co', style: 'Premium franchise, strong in commodities and structured', tightness: 1.05, appetite: 1, strengths: ['cmdty', 'exotics', 'eq'], share: sh({ eq: 0.13, rates: 0.1, fx: 0.08, credit: 0.12, cmdty: 0.16, exotics: 0.14 }) },
    { id: 'helvetia', name: 'Helvetia Union', style: 'Global FX and wealth-management flow', tightness: 1, appetite: 0.85, strengths: ['fx'], share: sh({ eq: 0.06, rates: 0.06, fx: 0.11, credit: 0.06, cmdty: 0.05, exotics: 0.08 }) },
    { id: 'bayview', name: 'Bayview Securities', style: 'Large US bank, strong in credit and rates', tightness: 1, appetite: 0.95, strengths: ['credit', 'rates'], share: sh({ eq: 0.08, rates: 0.12, fx: 0.07, credit: 0.13, cmdty: 0.06, exotics: 0.05 }) },
    { id: 'velocity', name: 'Velocity Markets', style: 'Electronic market maker: tightest prices in liquid products, pulls back in stress', tightness: 0.7, appetite: 1.2, strengths: ['eq', 'fx'], share: sh({ eq: 0.12, rates: 0.05, fx: 0.12, credit: 0.01, cmdty: 0.02, exotics: 0 }) },
  ];
  return Object.fromEntries(list.map((c) => [c.id, c]));
}

const FIRST = ['Maya', 'Tom', 'Priya', 'Luca', 'Sofia', 'Daniel', 'Aisha', 'Ken', 'Elena', 'Marcus', 'Hana', 'Owen', 'Rafael', 'Ines', 'Jonah', 'Leila', 'Sam', 'Yuki'];
const LAST = ['Okafor', 'Brennan', 'Iyer', 'Moretti', 'Lindqvist', 'Cho', 'Haddad', 'Nakamura', 'Petrov', 'Alvarez', 'Fischer', 'Reyes', 'Mensah', 'Duarte', 'Wolfe', 'Tanaka'];

export function makeTrader(h: { rng: number }, deskId: DeskId, skill?: number, n = 0): Trader {
  const r = () => {
    let t = (h.rng = (h.rng + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const sk = skill ?? 0.35 + r() * 0.5;
  const styles = ['Patient risk-taker', 'Flow specialist', 'Fast hedger', 'Relationship trader', 'Quant-minded'];
  return {
    id: `T${Math.floor(r() * 1e9)}${n}`,
    name: `${FIRST[Math.floor(r() * FIRST.length)]} ${LAST[Math.floor(r() * LAST.length)]}`,
    desk: deskId,
    skill: Math.round(sk * 100) / 100,
    cost: Math.round((0.6 + sk * 2.4) * 10) / 10 * 1e6,
    style: styles[Math.floor(r() * styles.length)],
  };
}

export function calendar(): MacroEvent[] {
  const ev: MacroEvent[] = [];
  const add = (e: Omit<MacroEvent, 'id'>) => ev.push({ id: `M${ev.length + 1}`, ...e });
  for (let k = 0; k < 6; k++) {
    add({ day: 4 + 21 * k, time: '08:30', kind: 'cpi', title: 'US CPI (m/m)', consensus: '0.3%' });
    add({ day: 5 + 21 * k, time: '08:30', kind: 'nfp', title: 'US nonfarm payrolls', consensus: '+180k' });
    add({ day: 9 + 21 * k, time: '07:45', kind: 'ecb', title: 'ECB rate decision', consensus: 'Hold' });
    add({ day: 12 + 21 * k, time: '14:00', kind: 'fomc', title: 'FOMC decision', consensus: 'Hold (25bp hike priced at 20%)' });
    add({ day: 15 + 21 * k, time: '10:00', kind: 'opec', title: 'OPEC+ meeting', consensus: 'Quotas unchanged' });
    add({ day: 18 + 21 * k, time: '13:00', kind: 'auction', title: '10Y Treasury auction', consensus: 'Tail ±1bp' });
  }
  STOCKS.forEach((st, i) => add({ day: 3 + ((i * 3) % 27), time: '16:05', kind: 'earnings', title: `${st.name} earnings`, target: st.id, consensus: 'In line' }));
  return ev.sort((a, b) => a.day - b.day || a.time.localeCompare(b.time));
}

export function newGame(seed: number, difficulty: GameState['difficulty'] = 'normal'): GameState {
  const market = initialMarket();
  const { instruments, issuers } = buildUniverse(market);
  const h = { rng: seed >>> 0 };
  const desks: Record<DeskId, Desk> = {
    eq: desk('eq', 300e6, 3e6, 1.5e6, true),
    rates: desk('rates', 300e6, 2.55e6, 300e3, true),
    fx: desk('fx', 200e6, 2e6, 1.25e6, true),
    credit: desk('credit', 0, 4e6, 250e3, false),
    cmdty: desk('cmdty', 0, 3.5e6, 2e6, false),
    exotics: desk('exotics', 0, 5e6, 1.2e6, false),
  };
  const traders: Trader[] = [];
  for (const d of ['eq', 'rates', 'fx'] as DeskId[]) for (let i = 0; i < 3; i++) traders.push(makeTrader(h, d, undefined, i));
  const s: GameState = {
    version: SAVE_VERSION,
    seed,
    rng: h.rng,
    difficulty,
    day: 1,
    date: START_DATE,
    status: 'playing',
    market,
    instruments,
    issuers,
    clients: roster(),
    competitors: competitors(),
    desks,
    traders,
    rfqs: [],
    orders: [],
    events: calendar(),
    opportunities: [],
    blotter: [],
    history: [],
    log: [{ day: 1, text: 'You take over Global Markets at Atlas: equities, rates and FX desks, $800m of allocated capital (of $1bn available), a small client franchise.', tone: 'neutral' }],
    pendingIdio: {},
    confidence: 60,
    reputation: 50,
    achievements: [],
    cumEP: 0,
    firmCapital: 1e9,
    nextId: 1,
    techSpend: 0,
    riskInfra: 1,
    share: { eq: 0.06, rates: 0.06, fx: 0.05, credit: 0.04, cmdty: 0.03, exotics: 0.04 },
    openValue: { eq: 0, rates: 0, fx: 0, credit: 0, cmdty: 0, exotics: 0 },
    decisions: [],
    costsToday: 0,
    costsCum: 0,
    cleanDays: 0,
    stats: { rfqWon: 0, rfqLost: 0, rfqPassed: 0, crisisWins: 0, maxDrawdown: 0, peakPnl: 0, cumPnl: 0 },
    rank: { eq: 9, rates: 9, fx: 9, credit: 9, cmdty: 9, exotics: 9 },
  };
  refreshListings(s);
  return s;
}
