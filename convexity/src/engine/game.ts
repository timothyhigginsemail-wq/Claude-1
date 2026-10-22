// The game orchestrator: one deterministic tick at a time.

import { ASSETS, AssetId, DAY, EQUITIES, MarketState, OVERNIGHT, REGIMES, RegimeId, SPECS, ScheduledEvent, TICKS_PER_DAY, atmImplied, clockLabel, initialMarket, rollDay, stepTick, viewOf, MarketView, EventKind, tickTime } from './market';
import { EVENT_INFO, NewsItem, applyEvent, ensureCalendar, newsForTick, rollShock } from './events';
import { Book, Position, PnlBuckets, accrueCarry, aggregateRisk, bookValue, bucketTotal, closeBookDay, executeTrade, fmtUsd, halfSpread, markToMarket, newBook, openBookDay, processLifecycle, tenorLabel } from './book';
import { CLIENTS, Family, Rfq, quoteForEdge, bookedInstrument, clientById, edgeAtQuote, generateRfq, nowTick, notionalPerUnit, pickRfq, realizedVolFromCloses, resolveQuote, Template } from './clients';
import { CareerState, LEVELS, Limits, Review, newCareer, weeklyReview } from './career';
import { NpcId } from './npc';
import { AutocallInst, Instrument, describeInstrument, isMC, unitPV } from './pricing';
import { STRESSES, applyStress, computeVaR, instrumentRisk } from './risk';
import { hedgeUniverse, listedOption, optionExpiries, freshen, fmtK } from './hedging';
import { clamp, hash32, rngFor } from './math';

export type Mode = 'career' | 'sandbox' | 'challenge';
export type SheetId = 'book' | 'risk' | 'markets' | 'lab' | 'hedge' | 'pnl' | 'learn' | 'rfq' | 'menu' | 'position';
export type Action =
  | { t: 'rfq'; id: string }
  | { t: 'sheet'; s: SheetId; arg?: string }
  | { t: 'hedgeDelta'; asset: AssetId }
  | { t: 'axe'; id: string }
  | { t: 'learn'; topic: string }
  | { t: 'lab'; preset?: string };

export interface FeedItem {
  id: number;
  day: number;
  tick: number;
  kind: 'msg' | 'rfq' | 'news' | 'event' | 'fill' | 'system' | 'life';
  from?: NpcId | string;
  text: string;
  tone?: 'pos' | 'neg' | 'neutral' | 'warn';
  rfqId?: string;
  actions?: { label: string; act: Action }[];
}

export interface Axe {
  id: string;
  asset: AssetId;
  theoBuys: boolean; // Theo buys vol from the desk (desk sells options)
  vega: number;
  inst: Instrument;
  volEdge: number; // vol points in the desk's favour vs mid (can be negative = small cost)
  expires: number;
  status: 'open' | 'done' | 'expired';
}

export type LimitKey = 'delta' | 'vega' | 'gamma' | 'var99' | 'stress';
export interface Breach {
  key: LimitKey;
  asset?: AssetId;
  since: number;
  deadline: number;
}

export interface DayReport {
  day: number;
  pnl: number;
  buckets: PnlBuckets;
  positions: { label: string; pnl: number; source: string }[];
  clientPnl: number;
  hedgePnl: number;
  moves: { asset: AssetId; ret: number; volChg: number; rv: number }[];
  gammaTheta: { asset: AssetId; gamma: number; breakeven: number; realized: number } | null;
  theta: number;
  rfq: { seen: number; quoted: number; won: number; edge: number };
  events: string[];
  notes: { tone: 'pos' | 'neg' | 'neutral'; text: string; topic?: string }[];
  breachesToday: number;
  value: number;
}

export interface Settings {
  speed: number;
  pauseOnTicket: boolean;
  autoHedge: Record<AssetId, { on: boolean; band: number }>;
}

export interface GameState {
  version: number;
  mode: Mode;
  seed: number;
  challengeId?: string;
  market: MarketState;
  book: Book;
  career: CareerState;
  rfqs: Rfq[];
  feed: FeedItem[];
  feedSeq: number;
  news: NewsItem[];
  rel: Record<string, number>;
  stats: { seen: number; quoted: number; won: number; passed: number; expired: number; edgeWon: number; dayStart: { seen: number; quoted: number; won: number; edge: number }; perClient: Record<string, { won: number; quoted: number; pnl: number }> };
  calendarTo: number;
  hidden: ScheduledEvent | null;
  settings: Settings;
  varRes: { var99: number; es975: number; hist: number[]; lo: number; hi: number };
  stress: { id: string; label: string; pnl: number }[];
  breaches: Breach[];
  axes: Axe[];
  phase: 'trading' | 'closed' | 'over';
  report: DayReport | null;
  review: Review | null;
  flags: Record<string, number>;
  limits?: Limits;
  families?: Family[];
  startDay: number;
  endDay?: number;
  dayEvents: string[];
  challengeScore?: { score: number; grade: string; lines: string[] };
  intradayDayMoves: Record<AssetId, number>;
}

export const absNow = (g: GameState) => nowTick(g.market.day, g.market.tick);
export const tickDt = ((1 - OVERNIGHT) * DAY) / TICKS_PER_DAY;

export function limitsOf(g: GameState): Limits {
  return g.limits ?? LEVELS[g.career.level].limits;
}
export function familiesOf(g: GameState): Set<Family> {
  return new Set(g.families ?? LEVELS[g.career.level].families);
}
export function liquidity(g: GameState): number {
  const m = g.market;
  return REGIMES[m.regime].liquidity * m.liqShock * (1 + 0.15 * Math.max(0, m.pressure));
}
export const view = (g: GameState) => viewOf(g.market);

// ---------------------------------------------------------------- feed

export function post(g: GameState, item: Omit<FeedItem, 'id' | 'day' | 'tick'>) {
  g.feed.push({ ...item, id: g.feedSeq++, day: g.market.day, tick: g.market.tick });
  if (g.feed.length > 260) g.feed.splice(0, g.feed.length - 260);
}
const say = (g: GameState, from: NpcId, text: string, tone?: FeedItem['tone'], actions?: FeedItem['actions']) => post(g, { kind: 'msg', from, text, tone, actions });

// ---------------------------------------------------------------- construction

export interface NewGameOpts {
  mode: Mode;
  seed: number;
  regime?: RegimeId;
  pressure?: number;
  level?: number;
  challengeId?: string;
}

export function newGame(o: NewGameOpts): GameState {
  const market = initialMarket(o.seed, o.regime ?? 'calm', o.pressure ?? -0.3);
  const g: GameState = {
    version: 1,
    mode: o.mode,
    seed: o.seed,
    challengeId: o.challengeId,
    market,
    book: newBook(),
    career: newCareer(o.level ?? 0),
    rfqs: [],
    feed: [],
    feedSeq: 1,
    news: [],
    rel: Object.fromEntries(CLIENTS.map((c) => [c.id, c.id === 'northgate' ? 58 : 50])),
    stats: { seen: 0, quoted: 0, won: 0, passed: 0, expired: 0, edgeWon: 0, dayStart: { seen: 0, quoted: 0, won: 0, edge: 0 }, perClient: {} },
    calendarTo: -1,
    hidden: null,
    settings: { speed: 1, pauseOnTicket: true, autoHedge: { ORX: { on: false, band: 150e3 }, NKT: { on: false, band: 80e3 }, AUR: { on: false, band: 120e3 }, EURUSD: { on: false, band: 100e3 } } },
    varRes: { var99: 0, es975: 0, hist: [], lo: 0, hi: 0 },
    stress: [],
    breaches: [],
    axes: [],
    phase: 'trading',
    report: null,
    review: null,
    flags: {},
    startDay: 0,
    dayEvents: [],
    intradayDayMoves: { ORX: 0, NKT: 0, AUR: 0, EURUSD: 0 },
  };
  if (o.mode === 'sandbox') g.families = ['delta1', 'vanilla', 'fx', 'barrier', 'digital', 'swap', 'autocall'];
  if (o.mode === 'sandbox') g.limits = LEVELS[3].limits;
  g.calendarTo = ensureCalendar(market, 6, g.calendarTo);
  g.hidden = rollShock(market);
  openBookDay(g.book);
  return g;
}

/** Called once after setup to post the opening messages. */
export function openingMessages(g: GameState) {
  morningBrief(g);
  if (g.mode === 'career' && g.market.day === 0) {
    say(g, 'margot', "Welcome to Cross-Asset Exotics. You start on the index vol book: small limits, real money. Sales will send you RFQs here. Price them, win the ones that make sense, and hedge what you take on.");
    say(g, 'margot', 'Watch the strip at the top — that is your risk. Delta is what you lose on a 1% move, gamma is how fast that changes, vega is a vol point, theta is a day. Tap any of them.', 'neutral', [
      { label: 'What is delta?', act: { t: 'learn', topic: 'delta' } },
      { label: 'Open risk', act: { t: 'sheet', s: 'risk' } },
    ]);
  }
}

// ---------------------------------------------------------------- morning

function morningBrief(g: GameState) {
  const m = g.market;
  const v = viewOf(m);
  const prev = m.closes[m.closes.length - 1];
  const lines: string[] = [];
  if (prev) {
    const moves = ASSETS.map((a) => `${SPECS[a].name} ${pct(m.assets[a].spot / prev.spot[a] - 1)}`).join(' · ');
    lines.push(`Overnight: ${moves}.`);
  }
  const v1 = atmImplied(v, 'ORX', 1 / 12);
  const v3 = atmImplied(v, 'ORX', 0.25);
  const slope = v3 - v1;
  const creditChg = prev ? m.credit - prev.credit : 0;
  lines.push(`ORX 1M vol ${(v1 * 100).toFixed(1)}, 3M ${(v3 * 100).toFixed(1)} (${slope < 0 ? 'INVERTED — near-term fear' : 'upward sloping'}). IG credit ${m.credit.toFixed(0)}bp${prev ? ` (${creditChg >= 0 ? '+' : ''}${creditChg.toFixed(1)})` : ''}. Implied correlation ${(v.eqCorr * 100).toFixed(0)}.`);
  const today = m.events.filter((e) => e.day === m.day && e.status === 'pending');
  for (const e of today) {
    const mv = Object.entries(e.moveStd).map(([a, s]) => `${a} ±${(s! * 100 * 0.8).toFixed(1)}%`).join(', ');
    lines.push(`Today: ${e.title}. Options imply ${mv} for the release.`);
  }
  const soon = m.events.filter((e) => e.day > m.day && e.day <= m.day + 3 && e.status === 'pending');
  if (soon.length) lines.push(`Coming up: ${soon.map((e) => `${e.title.split(' ·')[0]} (D${e.day + 1})`).join(', ')}.`);
  const read = readRegime(g);
  lines.push(read);
  say(g, 'jules', lines.join('\n'));
}

function readRegime(g: GameState): string {
  const m = g.market;
  const c = m.closes.slice(-5);
  const creditTrend = c.length >= 3 ? m.credit - c[0].credit : 0;
  const R = m.regime;
  if (R === 'crisis') return 'My read: this is a liquidation. Correlations go to one, liquidity disappears. Size down.';
  if (R === 'stressed') return creditTrend > 4 ? 'My read: stress is building — credit keeps leaking wider. Skew is not done repricing.' : 'My read: stressed but stabilising. Watch credit for the tell.';
  if (creditTrend > 6) return 'My read: calm on the surface, but credit has widened for days. I would not want to be short wings here.';
  if (R === 'trending') return 'My read: trending tape, realised vol is subdued. Directional flow will keep coming.';
  if (R === 'choppy') return 'My read: choppy, mean-reverting intraday — good for long gamma if you can scalp it.';
  return 'My read: benign. Implied is trading over realised, the usual premium. Vol sellers are being paid — until they are not.';
}

// ---------------------------------------------------------------- tick

export function tick(g: GameState) {
  if (g.phase !== 'trading') return;
  const m = g.market;
  if (m.tick >= TICKS_PER_DAY) {
    closeDay(g);
    return;
  }
  const prev = viewOf(m);
  stepTick(m);
  // scheduled and hidden events at this tick
  for (const e of m.events) {
    if (e.status === 'pending' && e.day === m.day && e.tick === m.tick) fireEvent(g, e, false);
  }
  if (g.hidden && g.hidden.status === 'pending' && g.hidden.day === m.day && g.hidden.tick === m.tick) fireEvent(g, g.hidden, true);
  const v = viewOf(m);
  afterMove(g, prev, v, tickDt);
  // news
  const n = newsForTick(m, g.hidden);
  if (n) {
    g.news.unshift(n);
    if (g.news.length > 60) g.news.pop();
    post(g, { kind: 'news', text: n.text, tone: n.tone === 'neg' ? 'neg' : n.tone === 'pos' ? 'pos' : 'neutral' });
  }
  rfqFlow(g, v);
  axes(g, v);
  npcTriggers(g, v);
  if (m.tick >= TICKS_PER_DAY) closeDay(g);
}

function fireEvent(g: GameState, e: ScheduledEvent, hidden: boolean) {
  const before = Object.fromEntries(ASSETS.map((a) => [a, g.market.assets[a].spot]));
  const text = applyEvent(g.market, e);
  const moves = ASSETS.map((a) => ({ a, r: g.market.assets[a].spot / before[a] - 1 })).filter((x) => Math.abs(x.r) > 0.0015);
  const mv = moves.map((x) => `${SPECS[x.a].name} ${pct(x.r)}`).join(' · ');
  g.dayEvents.push(text);
  post(g, { kind: 'event', text: `${hidden ? '⚠ ' : ''}${EVENT_INFO[e.kind].short}: ${text}${mv ? `\n${mv}` : ''}`, tone: hidden ? 'warn' : 'neutral' });
  g.flags[`ev-${e.kind}`] = absNow(g);
}

/** Everything that happens to the book when the market moves from prev to v over dt. */
function afterMove(g: GameState, prev: MarketView, v: MarketView, dt: number) {
  const b = g.book;
  accrueCarry(b, v, dt);
  const stagger = absNow(g);
  markToMarket(b, prev, v, {
    refreshRisk: (p) => {
      if (!isMC(p.inst)) return true;
      const ticksSince = (v.t - p.riskAt) / tickDt;
      return ticksSince >= 10 + (hash32(p.id) % 4) || (stagger % 10 === hash32(p.id) % 10 && ticksSince > 4);
    },
  });
  const msgs = processLifecycle(b, v, false);
  for (const t of msgs) post(g, { kind: 'life', text: t, tone: 'warn' });
  for (const p of b.positions) if (!p.risk) {
    p.risk = instrumentRisk(p.inst, v);
    p.riskAt = v.t;
  }
  aggregateRisk(b);
  autoHedge(g, v);
  const n = absNow(g);
  if (n % 6 === 0 || g.varRes.hist.length === 0) refreshVaR(g, v);
  if (n % 15 === 0 || g.stress.length === 0) refreshStress(g, v);
  checkLimits(g, v);
  b.intradayPnl.push(bucketTotal(b.today));
}

export function refreshVaR(g: GameState, v = view(g)) {
  const r = computeVaR(g.book.risk, v, hash32(g.seed, g.market.day));
  const lo = r.pnl[0];
  const hi = r.pnl[r.pnl.length - 1];
  const bins = 36;
  const hist = new Array(bins).fill(0);
  for (const x of r.pnl) hist[Math.min(bins - 1, Math.floor(((x - lo) / Math.max(hi - lo, 1e-9)) * bins))]++;
  g.varRes = { var99: r.var99, es975: r.es975, hist, lo, hi };
}

export function refreshStress(g: GameState, v = view(g)) {
  g.stress = STRESSES.map((s) => {
    const sv = applyStress(v, s);
    let pnl = 0;
    for (const p of g.book.positions) pnl += p.qty * (unitPV(p.inst, sv, isMC(p.inst) ? 1024 : undefined) - (isMC(p.inst) ? unitPV(p.inst, v, 1024) : p.unitPv));
    return { id: s.id, label: s.label, pnl };
  });
}

// ---------------------------------------------------------------- trading actions

function ctx(g: GameState) {
  return { view: view(g), day: g.market.day, tick: g.market.tick, liq: liquidity(g) };
}

/** Street execution: the desk crosses the spread. */
export function streetTrade(g: GameState, inst0: Instrument, qty: number, source: 'hedge' | 'forced' = 'hedge', posId?: string) {
  if (!Number.isFinite(qty) || Math.abs(qty) < 1e-9) return null;
  const v = view(g);
  const inst = freshen(inst0, v);
  const mid = unitPV(inst, v);
  const hs = halfSpread(inst, qty, v, liquidity(g) * (source === 'forced' ? 2 : 1));
  const px = mid + Math.sign(qty) * hs;
  const res = executeTrade(g.book, inst, qty, px, source, ctx(g), { mid, posId });
  res.pos.risk = instrumentRisk(res.pos.inst, v);
  res.pos.riskAt = v.t;
  aggregateRisk(g.book);
  post(g, { kind: 'fill', text: `${qty > 0 ? 'Bought' : 'Sold'} ${fmtQty(inst, Math.abs(qty), v)} ${res.trade.label} · cost ${fmtUsd(Math.abs(res.trade.edge))}`, tone: source === 'forced' ? 'warn' : 'neutral' });
  g.book.intradayPnl[g.book.intradayPnl.length - 1] = bucketTotal(g.book.today);
  refreshVaR(g, v);
  return res;
}

export function closePosition(g: GameState, posId: string) {
  const p = g.book.positions.find((x) => x.id === posId);
  if (!p) return;
  streetTrade(g, p.inst, -p.qty, 'hedge', p.id);
  refreshStress(g);
}

export function fmtQty(inst: Instrument, q: number, v: MarketView): string {
  if (inst.type === 'swap' || inst.type === 'autocall') return fmtUsd(q).replace('$', '$') + ' notional';
  if (inst.type === 'digital') return `${fmtUsd(q)} payout`;
  const n = q * notionalPerUnit(inst, v);
  return `${fmtUsd(n)} notional of`;
}

export function quoteRfq(g: GameState, id: string, q: number) {
  const r = g.rfqs.find((x) => x.id === id);
  if (!r || r.status !== 'open') return;
  const v = view(g);
  r.quote = q;
  r.quoteEdge = edgeAtQuote(r, q, v);
  r.status = 'quoted';
  // the competition is decided against the market the quote was made in
  const res = resolveQuote(r, g.seed, g.rel[r.client], liquidity(g));
  r.decided = { won: res.won, reason: res.reason };
  r.coverEdge = res.cover;
  if (Number.isFinite(res.cover)) r.coverQuote = quoteForEdge(r, res.cover, v);
  const rng = rngFor(g.seed, r.id, 'resp');
  r.respondAt = absNow(g) + rng.int(1, 3);
  g.stats.quoted++;
  const pc = (g.stats.perClient[r.client] ??= { won: 0, quoted: 0, pnl: 0 });
  pc.quoted++;
  post(g, { kind: 'system', text: `Quoted ${clientById(r.client).name}: ${fmtQuote(r, q)} — waiting for the client…` });
}

export function passRfq(g: GameState, id: string) {
  const r = g.rfqs.find((x) => x.id === id);
  if (!r || r.status !== 'open') return;
  r.status = 'passed';
  g.stats.passed++;
  const stress = REGIMES[g.market.regime].stress > 0.5;
  g.rel[r.client] = clamp(g.rel[r.client] - (stress ? 5 : 2.5), 0, 100);
  g.flags.passStreak = (g.flags.passStreak ?? 0) + 1;
  if (g.flags.passStreak >= 3) {
    say(g, 'priya', `That's ${g.flags.passStreak} passes in a row. I can't keep telling clients the desk is "reviewing". Show them something, even if it's wide.`, 'warn');
    g.flags.passStreak = 0;
  }
}

export function fmtQuote(r: Rfq, q: number): string {
  switch (r.kind) {
    case 'premium':
      return `${q.toFixed(r.inst.type === 'digital' ? 1 : Math.abs(q) < 0.5 ? 3 : 2)}%`;
    case 'rate':
      return `${q.toFixed(3)}%`;
    case 'fwd':
      return q.toFixed(4);
    case 'coupon':
      return `${q.toFixed(2)}% p.a.`;
  }
}

function settleRfq(g: GameState, r: Rfq, v: MarketView) {
  const rel = g.rel[r.client];
  const res = { ...(r.decided ?? resolveQuote(r, g.seed, rel, liquidity(g))), cover: r.coverEdge ?? NaN };
  const c = clientById(r.client);
  const pc = (g.stats.perClient[r.client] ??= { won: 0, quoted: 0, pnl: 0 });
  const stress = REGIMES[g.market.regime].stress > 0.5;
  if (res.won) {
    r.status = 'won';
    const { inst, px: px0 } = bookedInstrument(r, r.quote!);
    const npu = notionalPerUnit(r.inst, v);
    const px = r.kind === 'premium' ? (r.quote! / 100) * npu : px0;
    const mid = unitPV(inst, v);
    const out = executeTrade(g.book, inst, r.deskQty, px, 'client', ctx(g), { client: r.client, mid });
    out.pos.risk = instrumentRisk(out.pos.inst, v);
    out.pos.riskAt = v.t;
    aggregateRisk(g.book);
    g.stats.won++;
    g.stats.edgeWon += out.trade.edge;
    pc.won++;
    g.rel[r.client] = clamp(rel + (stress ? 5 : 2), 0, 100);
    r.outcome = `Done — edge ${fmtUsd(out.trade.edge)}`;
    g.flags.passStreak = 0;
    post(g, { kind: 'fill', from: r.client, text: `DONE ✓ ${c.name} ${r.clientSide} ${fmtUsd(r.notional)} · ${out.pos.label} at ${fmtQuote(r, r.quote!)}. Day-one edge ${fmtUsd(out.trade.edge)}.`, tone: 'pos', actions: [{ label: 'See the risk', act: { t: 'sheet', s: 'position', arg: out.pos.id } }, { label: 'Hedge', act: { t: 'sheet', s: 'hedge' } }] });
    afterWinComment(g, r, out.pos);
    refreshVaR(g, v);
    refreshStress(g, v);
  } else {
    r.status = 'lost';
    r.outcome = res.reason;
    g.rel[r.client] = clamp(rel + 0.5, 0, 100);
    const tooWide = (r.quoteEdge ?? 0) > r.streetMargin * 2.2;
    if (tooWide) g.rel[r.client] = clamp(g.rel[r.client] - 2, 0, 100);
    const showCover = c.sophistication < 0.8 || rngFor(g.seed, r.id, 'cover').chance(0.4);
    const coverTxt = showCover && r.coverQuote !== undefined ? ` Cover was about ${fmtQuote(r, r.coverQuote)} (you: ${fmtQuote(r, r.quote!)}).` : '';
    say(g, 'priya', res.reason === 'traded away' ? `${c.name} traded away.${coverTxt}` : `${c.name} passed on the trade — ${res.reason.replace('client passed — ', '')}.${coverTxt}`, 'neutral');
  }
}


function afterWinComment(g: GameState, r: Rfq, p: Position) {
  const rk = p.risk;
  if (!rk) return;
  const f = (x: number) => fmtK(x * p.qty);
  const und = r.inst.type === 'autocall' ? r.inst.assets : r.inst.type === 'swap' ? [] : [r.inst.asset];
  const firstOfType = !g.flags[`type-${p.inst.type}`];
  g.flags[`type-${p.inst.type}`] = 1;
  if (r.inst.type === 'swap') {
    say(g, 'margot', `That swap is ${f(rk.dv01)}/bp of DV01. Rates move 5–10bp on a normal day.`, 'neutral', [{ label: 'Flatten DV01', act: { t: 'sheet', s: 'hedge' } }]);
  } else if (und.length) {
    const a = und[0];
    const parts = und.map((x) => `${SPECS[x].name} Δ ${f(rk.delta[x])}`).join(', ');
    const g0 = und.reduce((s, x) => s + rk.gamma[x] * p.qty, 0);
    const v0 = und.reduce((s, x) => s + rk.vega[x] * p.qty, 0);
    const text = `New risk: ${parts}; gamma ${fmtK(g0)}, vega ${fmtK(v0)}/pt, theta ${fmtK(rk.theta * p.qty)}/day.${g0 < 0 ? ' You are short gamma: you collect theta and lose on big moves.' : ' Long gamma: moves pay you, time costs you.'}`;
    say(g, 'margot', text, 'neutral', [{ label: `Delta-hedge ${SPECS[a].name}`, act: { t: 'hedgeDelta', asset: a } }, { label: 'Hedge options', act: { t: 'sheet', s: 'hedge' } }]);
  }
  if (firstOfType) {
    const topic = { vanilla: 'vanilla', barrier: 'barrier', digital: 'digital', autocall: 'autocall', swap: 'swap', forward: 'fxfwd', spot: 'delta' }[p.inst.type];
    const msgs: Record<string, string> = {
      barrier: 'Barrier booked. I price it with Reiner–Rubinstein under a flat vol taken at the strike, continuous monitoring. With skew a local-vol model usually makes down-and-ins dearer. Watch the risk near the barrier: gamma and vega flip sign and can get large.',
      digital: 'Digital booked. I include the smile slope: digital = flat-vol N(d2) minus vega × dσ/dK. With negative skew that makes calls cheaper than flat vol says. Near expiry at the strike, delta explodes. Most desks risk-manage these as tight call spreads.',
      autocall: 'Autocallable booked. Monte Carlo: correlated GBM, flat vol per name (smile at the spot/KI midpoint), quanto drift for euro names, issuer funding spread in discounting. Observations are quarterly at the close and the knock-in is European. Correlation and the KI region drive the risk. The Lab shows the paths.',
      vanilla: 'Vanilla booked. Black–Scholes on our smile: vol depends on strike and maturity, plus any scheduled event variance. Delta here is sticky-moneyness: the smile moves with spot.',
    };
    if (msgs[p.inst.type]) say(g, 'wen', msgs[p.inst.type], 'neutral', [{ label: 'Learn more', act: { t: 'learn', topic: topic ?? 'delta' } }]);
  }
  if (r.client === 'sable' && (g.stats.perClient.sable?.won ?? 0) >= 2 && !g.flags.sableWarn) {
    g.flags.sableWarn = 1;
    say(g, 'margot', 'Second Sable trade today. When the sharpest fund in the market keeps hitting your price, ask what they know. Informed flow costs more than the spread.', 'warn', [{ label: 'Adverse selection', act: { t: 'learn', topic: 'informed' } }]);
  }
}

// ---------------------------------------------------------------- RFQ flow

function rfqFlow(g: GameState, v: MarketView) {
  const n = absNow(g);
  for (const r of g.rfqs) {
    if (r.status === 'quoted' && (r.respondAt ?? 0) <= n) settleRfq(g, r, v);
    else if (r.status === 'open' && r.expires <= n) {
      r.status = 'expired';
      g.stats.expired++;
      g.rel[r.client] = clamp(g.rel[r.client] - 4, 0, 100);
      say(g, 'priya', `You left ${clientById(r.client).name} hanging — they traded elsewhere. That one hurts the relationship.`, 'warn');
    }
  }
  g.rfqs = g.rfqs.filter((r) => r.status === 'open' || r.status === 'quoted' || r.day >= g.market.day - 1).slice(-60);
  if (g.flags.blocked && g.flags.blocked > n) return;
  const m = g.market;
  const rng = rngFor(g.seed, m.day, m.tick, 'rfq');
  const scripted = g.mode === 'career' && m.day === 0 && m.tick === 3 && !g.flags.firstRfq;
  const R = REGIMES[m.regime];
  const rate = 0.085 * (1 + 0.6 * R.stress) * (g.mode === 'challenge' ? 0.7 : 1);
  const openCount = g.rfqs.filter((r) => r.status === 'open').length;
  if (!scripted && (openCount >= 3 || !rng.chance(rate) || (g.mode === 'career' && m.day === 0 && !g.flags.firstRfq))) return;
  const gen = { seed: g.seed, day: m.day, tick: m.tick, view: v, liq: liquidity(g), families: familiesOf(g), rfqCount: g.stats.seen, realizedVol: realizedVolFromCloses(m.closes, m.intraday) };
  let r: Rfq | null;
  if (g.flags.bigTicket === 1 && m.tick >= 24) {
    g.flags.bigTicket = 2;
    r = generateRfq(gen, 'aurelia', 'autocall_note', rngFor(g.seed, 'big'), true);
    if (r && r.inst.type === 'autocall') {
      const obs: number[] = [];
      for (let k = 1; k <= 12; k++) obs.push((m.day + 63 * k + 1) * DAY);
      r.inst = { ...r.inst, assets: ['ORX', 'NKT'], initial: [v.spot.ORX, v.spot.NKT], obs, ki: 0.6, couponBarrier: 0.7, memory: true };
      r.notional = 120e6;
      r.deskQty = -120e6;
      r.expires = n + 30;
      r.big = true;
      r.note = 'The big one: $120m 3Y worst-of ORX/NKT, 60% European KI, 70% coupon barrier with memory, quarterly autocall at 100%. Four dealers in competition.';
    }
    if (r) addRfq(g, r);
    return;
  }
  if (scripted) {
    g.flags.firstRfq = 1;
    r = generateRfq(gen, 'northgate', 'protect_put', rngFor(g.seed, 'first'));
    if (r && r.inst.type === 'vanilla') {
      r.inst.asset = 'ORX';
      r.inst.strike = Math.round((v.spot.ORX * 0.95) / 25) * 25;
      r.inst.expiry = (m.day + 63 + 1) * DAY;
      r.notional = 25e6;
      r.deskQty = -r.notional / v.spot.ORX;
      r.note = 'Northgate Pension wants 3M 95% puts on the Orion 500, $25m notional. Plain protection buying — a good first trade.';
      r.expires = n + 14;
    }
  } else r = pickRfq(gen, rng);
  if (!r) return;
  addRfq(g, r);
}

export function addRfq(g: GameState, r: Rfq) {
  const v = view(g);
  r.streetMargin = r.streetMargin || 0.002;
  g.rfqs.push(r);
  g.stats.seen++;
  const c = clientById(r.client);
  const desc = describeInstrument(r.inst, (t) => tenorLabel(t - v.t));
  post(g, { kind: 'rfq', from: 'priya', rfqId: r.id, text: `${c.name} ${r.clientSide} ${fmtUsd(r.notional)} ${desc}. ${r.note}` });
  if (g.mode === 'career' && g.market.day === 0 && !g.flags.tutRfq) {
    g.flags.tutRfq = 1;
    say(g, 'margot', 'Open the ticket. Our model mid is fair value. Your quote decides how much edge you keep. Too tight and you get paid nothing for the risk. Too wide and Northgate goes to another bank. The clock stops while you price.', 'neutral', [{ label: 'Open ticket', act: { t: 'rfq', id: r.id } }]);
  }
}

// ---------------------------------------------------------------- inter-desk axes (Theo)

function axes(g: GameState, v: MarketView) {
  const n = absNow(g);
  for (const a of g.axes) if (a.status === 'open' && a.expires <= n) a.status = 'expired';
  g.axes = g.axes.filter((a) => a.status === 'open' || n - a.expires < 30);
  const rng = rngFor(g.seed, g.market.day, g.market.tick, 'axe');
  if (g.market.tick < 6 || !rng.chance(0.012)) return;
  // Theo is axed in the direction that helps his book; more useful when it offsets ours
  const fam = familiesOf(g);
  const choices = (fam.has('barrier') ? EQUITIES : (['ORX', 'AUR'] as AssetId[]));
  const asset = rng.pick(choices);
  const ours = g.book.risk.vega[asset];
  const theoBuys = Math.abs(ours) > 20e3 ? ours > 0 && rng.chance(0.7) : rng.chance(0.5);
  const exp = optionExpiries(g.market.day)[1];
  const inst = listedOption(asset, 'C', 1, exp, v);
  const unit = instrumentRisk(inst, v);
  const vega = Math.round(rng.range(20, 80)) * 1e3;
  const axe: Axe = { id: `AX${n}`, asset, theoBuys, vega, inst, volEdge: rng.range(-0.05, 0.12), expires: n + 12, status: 'open' };
  g.axes.push(axe);
  const iv = atmImplied(v, asset, exp - v.t) * 100;
  say(g, 'theo', `Axed: I ${theoBuys ? 'BUY' : 'SELL'} ${fmtUsd(vega)} vega of ${SPECS[asset].name} 3M ATM at ${(iv + (theoBuys ? 1 : -1) * axe.volEdge).toFixed(2)} vol (mid ${iv.toFixed(2)}). Open for an hour. Way cheaper than the street if it helps you.`, 'neutral', [{ label: theoBuys ? 'Sell him vega' : 'Buy his vega', act: { t: 'axe', id: axe.id } }]);
  void unit;
}

export function acceptAxe(g: GameState, id: string) {
  const a = g.axes.find((x) => x.id === id);
  if (!a || a.status !== 'open') return;
  const v = view(g);
  const unit = instrumentRisk(a.inst, v);
  const qty = (a.theoBuys ? -1 : 1) * (a.vega / Math.max(unit.vega[a.asset], 1e-9));
  const mid = unitPV(a.inst, v);
  const px = mid - Math.sign(qty) * a.volEdge * unit.vega[a.asset];
  const res = executeTrade(g.book, a.inst, qty, px, 'interdesk', ctx(g), { mid, net: false });
  res.pos.risk = unit;
  res.pos.riskAt = v.t;
  aggregateRisk(g.book);
  a.status = 'done';
  post(g, { kind: 'fill', from: 'theo', text: `Inter-desk: ${qty > 0 ? 'bought' : 'sold'} ${fmtUsd(a.vega)} vega ${res.trade.label} from Theo. ${res.trade.edge >= 0 ? 'Edge' : 'Cost'} ${fmtUsd(Math.abs(res.trade.edge))}.`, tone: 'pos' });
  refreshVaR(g, v);
}

// ---------------------------------------------------------------- auto-hedging (band)

function deltaOne(a: AssetId, g: GameState): Instrument {
  const u = hedgeUniverse(view(g), g.market.day);
  return u.find((h) => h.group === 'Delta-one' && h.asset === a)!.inst;
}

export function hedgeDelta(g: GameState, a: AssetId, source: 'hedge' | 'forced' = 'hedge', target = 0) {
  const v = view(g);
  const inst = deltaOne(a, g);
  const r = instrumentRisk(inst, v);
  const need = target - g.book.risk.delta[a];
  if (Math.abs(need) < 1e3) return null;
  return streetTrade(g, inst, need / r.delta[a], source);
}

function autoHedge(g: GameState, v: MarketView) {
  for (const a of ASSETS) {
    const s = g.settings.autoHedge[a];
    if (!s.on) continue;
    if (Math.abs(g.book.risk.delta[a]) > s.band) {
      const inst = deltaOne(a, g);
      const r = instrumentRisk(inst, v);
      const qty = -g.book.risk.delta[a] / r.delta[a];
      const res = executeTrade(g.book, freshen(inst, v), qty, unitPV(freshen(inst, v), v) + Math.sign(qty) * halfSpread(inst, qty, v, liquidity(g)), 'hedge', ctx(g));
      res.pos.risk = instrumentRisk(res.pos.inst, v);
      aggregateRisk(g.book);
      g.flags.autoHedges = (g.flags.autoHedges ?? 0) + 1;
    }
  }
}

// ---------------------------------------------------------------- limits

export function utilisation(g: GameState): { key: LimitKey; label: string; value: number; limit: number; util: number; asset?: AssetId }[] {
  const L = limitsOf(g);
  const R = g.book.risk;
  const out: ReturnType<typeof utilisation> = [];
  for (const a of ASSETS) out.push({ key: 'delta', label: `Δ ${SPECS[a].name}`, value: R.delta[a], limit: L.delta, util: Math.abs(R.delta[a]) / L.delta, asset: a });
  const vegaAbs = ASSETS.reduce((s, a) => s + Math.abs(R.vega[a]), 0);
  const gammaAbs = EQUITIES.reduce((s, a) => s + Math.abs(R.gamma[a]), 0);
  out.push({ key: 'vega', label: 'Σ|vega|', value: vegaAbs, limit: L.vega, util: vegaAbs / L.vega });
  out.push({ key: 'gamma', label: 'Σ|gamma|', value: gammaAbs, limit: L.gamma, util: gammaAbs / L.gamma });
  out.push({ key: 'var99', label: 'VaR 99%', value: g.varRes.var99, limit: L.var99, util: g.varRes.var99 / L.var99 });
  const worst = Math.max(0, ...g.stress.map((s) => -s.pnl));
  out.push({ key: 'stress', label: 'Worst stress', value: worst, limit: L.stress, util: worst / L.stress });
  return out;
}

function checkLimits(g: GameState, v: MarketView) {
  const n = absNow(g);
  const u = utilisation(g);
  for (const x of u) {
    const existing = g.breaches.find((b) => b.key === x.key && b.asset === x.asset);
    if (x.util > 1) {
      if (!existing) {
        g.breaches.push({ key: x.key, asset: x.asset, since: n, deadline: n + 6 });
        say(g, 'dmitri', `Limit breach: ${x.label} at ${(x.util * 100).toFixed(0)}% of limit (${fmtUsd(Math.abs(x.value))} vs ${fmtUsd(x.limit)}). You have 30 minutes to bring it back inside, or I will do it for you — at a price.`, 'warn', [
          x.asset ? { label: `Hedge ${SPECS[x.asset].name} delta`, act: { t: 'hedgeDelta', asset: x.asset } } : { label: 'Open hedges', act: { t: 'sheet', s: 'hedge' } },
          { label: 'Risk', act: { t: 'sheet', s: 'risk' } },
        ]);
      } else if (n >= existing.deadline) {
        forceReduce(g, x.key, x.asset, v);
        g.breaches = g.breaches.filter((b) => b !== existing);
      }
    } else if (existing) {
      g.breaches = g.breaches.filter((b) => b !== existing);
      say(g, 'dmitri', `${x.label} back inside limits. Thank you.`, 'neutral');
    } else if (x.util > 0.85 && !g.flags[`warn-${x.key}-${x.asset}-${g.market.day}`]) {
      g.flags[`warn-${x.key}-${x.asset}-${g.market.day}`] = 1;
      say(g, 'dmitri', `Heads-up: ${x.label} at ${(x.util * 100).toFixed(0)}% of limit.`, 'neutral');
    }
  }
}

function forceReduce(g: GameState, key: LimitKey, asset: AssetId | undefined, v: MarketView) {
  g.career.forced++;
  g.career.breaches++;
  g.career.reputation = clamp(g.career.reputation - 6, 0, 100);
  const L = limitsOf(g);
  if (key === 'delta' && asset) {
    hedgeDelta(g, asset, 'forced', Math.sign(g.book.risk.delta[asset]) * L.delta * 0.5);
  } else {
    // cut the largest vega/gamma exposures with 3M ATM options, then flatten delta
    for (const a of ASSETS) {
      const vg = g.book.risk.vega[a];
      if (Math.abs(vg) > L.vega * 0.15) {
        const inst = listedOption(a, 'C', 1, optionExpiries(g.market.day)[1], v);
        const r = instrumentRisk(inst, v);
        streetTrade(g, inst, (-vg * 0.6) / r.vega[a], 'forced');
      }
    }
    for (const a of ASSETS) if (Math.abs(g.book.risk.delta[a]) > L.delta * 0.3) hedgeDelta(g, a, 'forced');
  }
  g.flags.blocked = absNow(g) + 12;
  say(g, 'dmitri', `Deadline passed. I've cut the ${key} exposure at twice the normal spread, and sales are blocked from sending you new risk for an hour. This goes in your review.`, 'neg');
  refreshVaR(g, v);
  refreshStress(g, v);
}

// ---------------------------------------------------------------- NPC triggers

function npcTriggers(g: GameState, v: MarketView) {
  const m = g.market;
  const R = g.book.risk;
  const n = absNow(g);
  // event previews (30 minutes ahead)
  for (const e of m.events) {
    if (e.status !== 'pending' || e.day !== m.day || e.tick - m.tick !== 6) continue;
    const und = Object.keys(e.moveStd) as AssetId[];
    const exposures = und.map((a) => ({ a, g: R.gamma[a], v: R.vega[a], d: R.delta[a] }));
    const shortG = exposures.filter((x) => x.g < -10e3);
    let text = `${e.title.split(' ·')[0]} in 30 minutes.`;
    if (shortG.length) text += ` You're short gamma in ${shortG.map((x) => SPECS[x.a].name).join(', ')} into it. A ${(Object.values(e.moveStd)[0]! * 200).toFixed(1)}% move would cost about ${fmtUsd(Math.abs(0.5 * shortG[0].g * (Object.values(e.moveStd)[0]! * 200) ** 2))} before delta.`;
    const ev = exposures.filter((x) => Math.abs(x.v) > 15e3);
    if (ev.length) text += ` Event vol drains out of implieds after the print: your ${SPECS[ev[0].a].name} vega is ${fmtK(ev[0].v)}/pt.`;
    say(g, 'margot', text, shortG.length ? 'warn' : 'neutral', [{ label: 'Event vol', act: { t: 'learn', topic: 'eventvol' } }, { label: 'Hedge', act: { t: 'sheet', s: 'hedge' } }]);
  }
  // tutorial nudges
  if (g.mode === 'career' && m.day === 0) {
    const hasClient = g.book.positions.some((p) => p.source === 'client');
    if (hasClient && !g.flags.tutHedge && Math.abs(R.delta.ORX) > 30e3) {
      g.flags.tutHedge = n;
      say(g, 'margot', `You're carrying ${fmtK(R.delta.ORX)} of ORX delta per 1%. Unless you have a view, flatten it with futures. The puts' gamma stays with you, and that's the risk you're paid to warehouse.`, 'neutral', [{ label: 'Flatten ORX delta', act: { t: 'hedgeDelta', asset: 'ORX' } }, { label: 'Delta & gamma', act: { t: 'learn', topic: 'gamma' } }]);
    }
    if (g.flags.tutHedge && !g.flags.tutTheta && n - g.flags.tutHedge > 18) {
      g.flags.tutTheta = 1;
      const be = R.gamma.ORX !== 0 && R.theta !== 0 ? Math.sqrt(Math.abs((2 * R.theta) / R.gamma.ORX)) : 0;
      say(g, 'margot', `Long options lose theta each day and earn on gamma when spot moves. Yours: theta ${fmtK(R.theta)}/day, gamma ${fmtK(R.gamma.ORX)}. Break-even daily move is about ${be.toFixed(2)}%. If ORX realises more than that, the gamma pays for the time decay.`, 'neutral', [{ label: 'Gamma vs theta', act: { t: 'learn', topic: 'theta' } }]);
    }
  }
  // big intraday moves
  for (const a of EQUITIES) {
    const r = m.assets[a].spot / m.assets[a].open - 1;
    const k = `move-${a}-${m.day}`;
    if (Math.abs(r) > 0.02 && !g.flags[k]) {
      g.flags[k] = 1;
      const pnl = R.delta[a] * r * 100;
      say(g, 'margot', `${SPECS[a].name} ${pct(r)} on the day. ${Math.abs(R.gamma[a]) > 5e3 ? `Your gamma (${fmtK(R.gamma[a])}) has moved delta to ${fmtK(R.delta[a])}. ` : ''}${Math.abs(pnl) > 50e3 ? 'Re-hedge or own it — decide.' : ''}`, 'warn', [{ label: `Hedge ${SPECS[a].name}`, act: { t: 'hedgeDelta', asset: a } }]);
    }
  }
  // structurer pitch
  if (familiesOf(g).has('autocall') && !g.flags[`tomas-${m.day}`] && m.tick === 20) {
    g.flags[`tomas-${m.day}`] = 1;
    say(g, 'tomas', 'Aurelia wants a new note for their clients: worst-of, 3Y, around 9% coupon. Want to build one in the Lab and pitch it? You set the coupon, so you decide the margin.', 'neutral', [{ label: 'Open the Lab', act: { t: 'lab', preset: 'pitch' } }]);
  }
  if (m.tick === 90 && g.mode !== 'sandbox' && !g.flags[`close-${m.day}`]) {
    g.flags[`close-${m.day}`] = 1;
    const ev = m.events.find((e) => e.status === 'pending' && e.day === m.day + 1);
    say(g, 'margot', `Forty minutes to the close. ${ev ? `Tomorrow: ${ev.title}. ` : ''}Anything you hold overnight is gap risk. Delta-hedging doesn't protect you from jumps.`, 'neutral');
  }
}

// ---------------------------------------------------------------- end of day

export function closeDay(g: GameState) {
  if (g.phase !== 'trading') return;
  const v = view(g);
  const msgs = processLifecycle(g.book, v, true);
  for (const t of msgs) post(g, { kind: 'life', text: t, tone: 'warn' });
  g.book.intradayPnl.push(bucketTotal(g.book.today));
  refreshVaR(g, v);
  refreshStress(g, v);
  // EOD limit check: any breach still open counts
  const u = utilisation(g).filter((x) => x.util > 1);
  if (u.length) {
    g.career.breaches += 1;
    g.career.reputation = clamp(g.career.reputation - 4, 0, 100);
  }
  g.report = buildReport(g, v, u.length);
  closeBookDay(g.book, g.market.day);
  g.phase = 'closed';
  // weekly review (career)
  const d = g.market.day;
  if (g.mode === 'career' && (d + 1 - g.career.weekStartDay) % 5 === 0) {
    const days = g.book.dailyPnl.filter((x) => x.day >= g.career.weekStartDay).map((x) => x.pnl);
    const edge = g.book.dailyPnl.filter((x) => x.day >= g.career.weekStartDay).reduce((a, x) => a + x.b.edge, 0);
    const costs = g.book.dailyPnl.filter((x) => x.day >= g.career.weekStartDay).reduce((a, x) => a + x.b.costs, 0);
    const relAvg = Object.values(g.rel).reduce((a, b) => a + b, 0) / Object.keys(g.rel).length;
    const rev = weeklyReview(g.career, d, days, edge, costs, { won: g.stats.won - (g.flags.weekWon ?? 0), quoted: g.stats.quoted - (g.flags.weekQuoted ?? 0) }, relAvg);
    g.review = rev;
    g.career.reviews.push(rev);
    if (rev.verdict === 'promoted') {
      g.career.level += 1;
      g.career.promotedAt.push(d);
      g.career.reputation = clamp(g.career.reputation + 10, 0, 100);
    } else if (rev.verdict === 'fired') {
      g.career.fired = true;
      g.phase = 'over';
    }
    g.career.weekStartDay = d + 1;
    g.career.breaches = 0;
    g.career.forced = 0;
    g.flags.weekWon = g.stats.won;
    g.flags.weekQuoted = g.stats.quoted;
  }
  if (g.endDay !== undefined && d >= g.endDay) g.phase = 'over';
}

function buildReport(g: GameState, v: MarketView, breaches: number): DayReport {
  const b = g.book;
  const m = g.market;
  const day = m.day;
  const pnl = bucketTotal(b.today);
  const prevClose = m.closes[m.closes.length - 1];
  const all = [...b.positions, ...b.closed.filter((p) => p.closedT !== undefined && p.closedT >= day * DAY)];
  const positions = all.map((p) => ({ label: p.label, pnl: p.pnlDay, source: p.source === 'client' ? clientById(p.client!).name : p.source })).filter((x) => Math.abs(x.pnl) > 1).sort((a, c) => Math.abs(c.pnl) - Math.abs(a.pnl));
  const clientPnl = all.filter((p) => p.source === 'client').reduce((s, p) => s + p.pnlDay, 0);
  const hedgePnl = all.filter((p) => p.source !== 'client').reduce((s, p) => s + p.pnlDay, 0);
  const moves = ASSETS.map((a) => {
    const base = prevClose ? prevClose.spot[a] : m.intraday[a][0];
    const xs = m.intraday[a];
    let rv = 0;
    for (let i = 1; i < xs.length; i++) rv += Math.log(xs[i] / xs[i - 1]) ** 2;
    const atm0 = prevClose ? prevClose.atm[a] : atmImplied(v, a, 1 / 12);
    return { asset: a, ret: m.assets[a].spot / base - 1, volChg: (atmImplied(v, a, 1 / 12) - atm0) * 100, rv: Math.sqrt(rv) * 100 };
  });
  // gamma–theta on the most gamma-heavy name
  let gammaTheta: DayReport['gammaTheta'] = null;
  const ga = EQUITIES.slice().sort((x, y) => Math.abs(b.risk.gamma[y]) - Math.abs(b.risk.gamma[x]))[0];
  if (Math.abs(b.risk.gamma[ga]) > 2e3 && Math.abs(b.risk.theta) > 100) {
    const mv = moves.find((x) => x.asset === ga)!;
    gammaTheta = { asset: ga, gamma: b.risk.gamma[ga], breakeven: Math.sqrt(Math.abs((2 * b.risk.theta) / b.risk.gamma[ga])), realized: mv.rv };
  }
  const st = g.stats;
  const rfq = { seen: st.seen - st.dayStart.seen, quoted: st.quoted - st.dayStart.quoted, won: st.won - st.dayStart.won, edge: st.edgeWon - st.dayStart.edge };
  const notes = mentorNotes(g, b.today, pnl, rfq, moves, gammaTheta, clientPnl, hedgePnl, breaches);
  return { day, pnl, buckets: { ...b.today }, positions: positions.slice(0, 10), clientPnl, hedgePnl, moves, gammaTheta, theta: b.risk.theta, rfq, events: [...g.dayEvents], notes, breachesToday: breaches, value: bookValue(b) };
}

function mentorNotes(g: GameState, B: PnlBuckets, pnl: number, rfq: DayReport['rfq'], moves: DayReport['moves'], gt: DayReport['gammaTheta'], clientPnl: number, hedgePnl: number, breaches: number): DayReport['notes'] {
  const out: DayReport['notes'] = [];
  const locked = B.edge + B.costs;
  const market = B.market;
  if (Math.abs(pnl) > 1000) out.push({ tone: 'neutral', text: `Of today's ${fmtUsd(pnl)}, ${fmtUsd(locked)} came from pricing and execution (edge minus costs). That part is skill. ${fmtUsd(market)} came from exposures meeting market moves. Ask whether you chose those exposures.`, topic: 'pnlexplain' });
  if (B.edge > 0 && B.costs < -0.5 * B.edge) out.push({ tone: 'neg', text: `Hedging costs (${fmtUsd(B.costs)}) ate ${((-B.costs / B.edge) * 100).toFixed(0)}% of client edge. Wider hedge bands, or netting flows before hedging, would keep more of it.`, topic: 'hedgecost' });
  if (gt) {
    const short = gt.gamma < 0;
    const won = short ? gt.realized < gt.breakeven : gt.realized > gt.breakeven;
    out.push({ tone: won ? 'pos' : 'neg', text: `${SPECS[gt.asset].name}: you were ${short ? 'short' : 'long'} gamma. Break-even move ${gt.breakeven.toFixed(2)}%, realised ${gt.realized.toFixed(2)}%. ${won ? (short ? 'The market stayed quieter than your theta paid for. You earned the premium.' : 'Realised beat implied. Your gamma paid for the decay.') : short ? 'Realised beat the theta you collected. That is the bill for being short gamma.' : 'Not enough movement to pay for the time decay.'}`, topic: 'theta' });
  }
  if (Math.abs(B.delta) > Math.max(30e3, 0.4 * Math.abs(pnl)) && Math.abs(B.delta) > Math.abs(B.gamma)) out.push({ tone: B.delta > 0 ? 'pos' : 'neg', text: `Delta was ${B.delta > 0 ? 'the hero' : 'the problem'}: ${fmtUsd(B.delta)}. If that was a view, fine. If it was an accident, it was luck, and luck mean-reverts.`, topic: 'delta' });
  if (Math.abs(B.vega) > 25e3) {
    const vm = moves.filter((x) => x.asset !== 'EURUSD').map((x) => `${SPECS[x.asset].name} ${x.volChg >= 0 ? '+' : ''}${x.volChg.toFixed(1)}`).join(', ');
    out.push({ tone: B.vega > 0 ? 'pos' : 'neg', text: `Vega P&L ${fmtUsd(B.vega)}. 1M implied moves: ${vm}.${g.dayEvents.length ? ' Event days move implieds twice: up into the print, then a crush after.' : ''}`, topic: 'vega' });
  }
  if (Math.abs(B.corr) > 15e3) out.push({ tone: B.corr > 0 ? 'pos' : 'neg', text: `Correlation P&L ${fmtUsd(B.corr)}. Worst-of notes leave you short correlation, so you lose when correlation rises. Listed products don't hedge it. Recycle it, or limit the size.`, topic: 'correlation' });
  if (Math.abs(B.cross) > Math.max(25e3, 0.25 * Math.abs(market))) out.push({ tone: 'neutral', text: `${fmtUsd(B.cross)} is unexplained by first- and second-order Greeks: jumps, barrier events, smile dynamics and MC noise. Big unexplained P&L means your risk measures missed something.`, topic: 'pnlexplain' });
  if (rfq.quoted >= 3 && rfq.won / rfq.quoted < 0.2) out.push({ tone: 'neg', text: `You won ${rfq.won} of ${rfq.quoted} quotes. Sales will stop calling if you're never in the market. Check the covers Priya passes you.` });
  if (rfq.quoted >= 3 && rfq.won / rfq.quoted > 0.75) out.push({ tone: 'neutral', text: `You won ${rfq.won} of ${rfq.quoted}. A hit ratio that high usually means money left on the table, or flow that knows more than you.`, topic: 'informed' });
  if (breaches) out.push({ tone: 'neg', text: `You closed outside ${breaches} limit${breaches > 1 ? 's' : ''}. That counts against you in the review, whatever the P&L.` });
  if (Math.abs(clientPnl) > 20e3 && Math.abs(hedgePnl) > 20e3 && Math.sign(clientPnl) !== Math.sign(hedgePnl)) out.push({ tone: 'neutral', text: `Client book ${fmtUsd(clientPnl)}, hedges ${fmtUsd(hedgePnl)}. The hedges did their job: net ${fmtUsd(clientPnl + hedgePnl)}.` });
  if (!out.length) out.push({ tone: 'neutral', text: 'Quiet day. Use them to study the book, and the gap between implied and realised.' });
  return out;
}

export function nextDay(g: GameState) {
  if (g.phase !== 'closed') return;
  const m = g.market;
  openBookDay(g.book);
  const prev = viewOf(m);
  rollDay(m);
  g.calendarTo = ensureCalendar(m, m.day + 6, g.calendarTo);
  const sh = rollShock(m);
  g.hidden = g.flags[`forcedShock-${m.day}`] ? g.hidden : sh;
  const forced = (g as GameState & { forcedShocks?: ScheduledEvent[] }).forcedShocks?.find((e) => e.day === m.day);
  if (forced) g.hidden = forced;
  g.dayEvents = [];
  g.report = null;
  g.review = null;
  g.stats.dayStart = { seen: g.stats.seen, quoted: g.stats.quoted, won: g.stats.won, edge: g.stats.edgeWon };
  const v = viewOf(m);
  afterMove(g, prev, v, OVERNIGHT * DAY);
  g.phase = 'trading';
  morningBrief(g);
  const gap = bucketTotal(g.book.today);
  if (Math.abs(gap) > 20e3) say(g, 'margot', `Overnight gap: ${fmtUsd(gap)} before you touched anything.`, gap < 0 ? 'warn' : 'neutral');
  if (g.mode === 'career' && g.career.promotedAt.includes(m.day - 1)) {
    const L = LEVELS[g.career.level];
    say(g, 'margot', `Congratulations, ${L.title}. New permissions: ${L.blurb} Limits roughly doubled. Don't make me regret it.`, 'pos');
  }
}

// ---------------------------------------------------------------- sandbox controls

export function forceRegime(g: GameState, r: RegimeId | null) {
  g.market.forced = r ? { regime: r } : undefined;
  if (r) {
    g.market.regime = r;
    g.market.regimeDays = 0;
  }
}
export function triggerEvent(g: GameState, kind: EventKind) {
  const e: ScheduledEvent = { id: `${kind}-manual-${absNow(g)}`, kind, day: g.market.day, tick: g.market.tick, title: EVENT_INFO[kind].label, moveStd: {}, status: 'pending' };
  const prev = view(g);
  fireEvent(g, e, kind.startsWith('shock'));
  afterMove(g, prev, view(g), 0);
}

// ---------------------------------------------------------------- structuring: pitch a note

export function pitchNote(g: GameState, inst: AutocallInst, notional: number, couponPa: number): Rfq {
  const v = view(g);
  const id = `PITCH${absNow(g)}`;
  const r: Rfq = { id, client: 'aurelia', template: inst.assets.length > 1 ? 'autocall_note' : 'single_note', day: g.market.day, tick: g.market.tick, expires: absNow(g) + 10, inst: { ...inst, seed: hash32(g.seed, id) }, deskQty: -notional, notional, clientSide: 'buys', kind: 'coupon', streetMargin: 0.0125 + 0.002 * inst.assets.length, note: 'Your pitch.', status: 'open' };
  addRfq(g, r);
  quoteRfq(g, id, couponPa);
  return r;
}

export function bookSandbox(g: GameState, inst: Instrument, qty: number, priceAtMid: boolean) {
  const v = view(g);
  if (priceAtMid) {
    const mid = unitPV(inst, v);
    const res = executeTrade(g.book, inst, qty, mid, 'client', ctx(g), { mid, client: 'halcyon' });
    res.pos.risk = instrumentRisk(inst, v);
    res.pos.riskAt = v.t;
    aggregateRisk(g.book);
    refreshVaR(g, v);
    refreshStress(g, v);
    post(g, { kind: 'fill', text: `Booked at mid: ${res.trade.label}` });
    return res;
  }
  return streetTrade(g, inst, qty);
}

export const pct = (x: number, dp = 2) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(dp)}%`;
export const timeLabel = (g: GameState) => `D${g.market.day + 1} ${clockLabel(g.market.tick)}`;
export { tickTime, TICKS_PER_DAY };
export type { Template };
