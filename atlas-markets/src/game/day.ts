import { attributeMove } from '../engine/attribution';
import { accrue, deskValue, emptyPnl, executeStreet, firmValue, pnlSum, processDefault, settleExpiries, settleVariationMargin } from '../engine/book';
import { accrualDays, nextBusinessDay } from '../engine/calendar';
import { fm, fpct } from '../engine/format';
import { pruneInstruments, refreshListings } from '../engine/instruments';
import { applyShock, combineShocks, drawShock, idioKeys, parYield, REGIMES, settleConditions, stepRegime, structuredCloneMarket, zeroShock, type Shock } from '../engine/market';
import { CLOSE_MIN, minuteOf } from '../engine/intraday';
import { positionValue } from '../engine/pricing';
import { chance, rand, randNormal } from '../engine/rng';
import { computeVaR, counterpartyExposure, deskCapital, runStress, STRESSES, summarise } from '../engine/risk';
import type { DayPlan, DayReport, DeskId, GameState, LogItem, MacroEvent, PnlParts } from '../engine/types';
import { advanceTo, syncMarket } from './live';
import { checkAchievements } from './achievements';
import { autoHedge, runFlow, runOrders } from './flow';
import { dailyCosts, HURDLE, launchDecision, log, randomDecisions, reviewDecision } from './manage';
import { generateRfqs, makeRfq, rfqEconomics } from './rfq';
import { DESK_META, newGame as newGameState } from './setup';

export const CAMPAIGN_DAYS = 30;
const DESKS: DeskId[] = ['eq', 'rates', 'fx', 'credit', 'cmdty', 'exotics'];

// ---------------------------------------------------------------- morning

export function startDay(s: GameState) {
  s.costsToday = 0;
  refreshListings(s);
  planDay(s);
  for (const id of DESKS) {
    s.desks[id].pnlToday = emptyPnl();
    s.openValue[id] = deskValue(s, s.desks[id]);
  }
  const unlocked = DESKS.filter((d) => s.desks[d].unlocked).length;
  const n = Math.min(14, Math.round(3 + unlocked * 1.3 + rand(s) * 2));
  s.rfqs = generateRfqs(s, n);
  scriptedMorning(s);
  s.opportunities = findOpportunities(s);
  randomDecisions(s, () => rand(s));
}

/**
 * Decide today's market path up front: the scripted narrative and regime (which apply from the
 * open), the diffuse daily shock (informed clients see a noisy part of it), and each scheduled
 * release's surprise, which hits prices at its release time.
 */
function planDay(s: GameState) {
  const zScript = zeroShock();
  const headlines = s.day <= CAMPAIGN_DAYS ? scriptedShock(s, zScript) : [];
  s.pendingShock = drawShock(s, s.market, idioKeys(s.market));
  s.pendingIdio = { ...s.pendingShock.idio, 'rates:term': s.pendingShock.inf * 0.6 + s.pendingShock.g * 0.4 };
  const events: DayPlan['events'] = [];
  for (const ev of s.events.filter((e) => e.day === s.day)) {
    const z = zeroShock();
    const notes: LogItem[] = [];
    eventShock(s, ev, z, notes);
    events.push({ id: ev.id, minute: minuteOf(ev.time), z, notes });
  }
  s.plan = { daySeed: (Math.imul(s.seed, 31) + s.day * 7919) >>> 0, base: combineShocks([[s.pendingShock, 1], [zScript, 1]]), events, headlines };
  s.openMarket = structuredCloneMarket(s.market);
  s.clock = 0;
  s.markClock = 0;
  s.news = headlines.map((h) => ({ minute: 0, text: h, tone: 'bad' as const }));
}

function scriptedMorning(s: GameState) {
  const d = s.day;
  const add = (clientId: string, desk: DeskId, time: string, forced: any) => {
    const r = makeRfq(s, s.clients[clientId], desk, time, forced);
    if (r) s.rfqs.push(r);
  };
  if (d === 3) {
    // pension wants to receive fixed on $500m 10Y
    const r = makeRfq(s, s.clients.northfield, 'rates', '09:12', { instKind: 'irs' } as any);
    if (r) {
      r.clientQty = 500e6;
      r.notional = 500e6;
      r.note = 'Northfield wants to RECEIVE fixed on $500m 10-year (extending liability duration). Atlas would pay fixed: short ~$430k DV01 until hedged.';
      s.rfqs.push(r);
    }
  }
  if (d === 5) {
    const r = makeRfq(s, s.clients.kestrel, 'eq', '10:43', {});
    if (r) {
      r.instId = 'HLXS';
      const px = s.market.eq.spot.HLXS;
      r.clientQty = -Math.round(150e6 / px);
      r.notional = 150e6;
      r.mid = px;
      r.signal = Math.sign(s.pendingIdio['eq:HLXS'] ?? 0);
      r.note = 'Kestrel wants to SELL $150m of Helix Semiconductor immediately — about 1.7 days of 15% participation. Quote tight to win it, or wide to cover the risk?';
      r.refHalfSpread = rfqEconomics(s, r).fair;
      s.rfqs.push(r);
    }
  }
  if (d === 6) launchDecision(s, 'credit');
  if (d === 13) launchDecision(s, 'cmdty');
  if (d === 17) launchDecision(s, 'exotics');
  if (d === 18 && s.desks.exotics.unlocked) add('privatebank', 'exotics', '11:30', {});
  if (d === 10 || d === 20 || d === CAMPAIGN_DAYS || (d > CAMPAIGN_DAYS && d % 20 === 10)) {
    const pnl = s.stats.cumPnl;
    const days = Math.max(1, s.history.length);
    const cap = Object.values(s.desks).reduce((a, x) => a + x.capital, 0);
    reviewDecision(s, { pnl, ep: s.cumEP, roac: cap > 0 ? ((pnl - s.costsCum) / cap) * (252 / days) : 0 });
  }
  s.rfqs.sort((a, b) => a.time.localeCompare(b.time));
}

// ---------------------------------------------------------------- opportunities

function findOpportunities(s: GameState) {
  const m = s.market;
  const out: GameState['opportunities'] = [];
  if (Math.abs(m.eq.etfPrem) > 0.0003)
    out.push({ id: `OP${s.nextId++}`, desk: 'eq', title: `ETF ${m.eq.etfPrem > 0 ? 'premium' : 'discount'} of ${(Math.abs(m.eq.etfPrem) * 1e4).toFixed(1)}bp`, body: `USLC trades ${m.eq.etfPrem > 0 ? 'above' : 'below'} its NAV. ${m.eq.etfPrem > 0 ? 'Sell the ETF and buy index futures' : 'Buy the ETF and sell index futures'}: the premium tends to mean-revert (creation/redemption arbitrage), but you pay spreads on both legs.`, legs: [], status: 'open' });
  const s2 = parYield(m, 2);
  const s10 = parYield(m, 10);
  out.push({ id: `OP${s.nextId++}`, desk: 'rates', title: `2s10s at ${((s10 - s2) * 1e4).toFixed(0)}bp`, body: `A DV01-neutral steepener (buy 2Y, sell 10Y in DV01 terms) profits if the curve steepens and earns/pays the carry difference. Use the Trading ticket with the 2Y and 10Y Treasuries.`, legs: [], status: 'open' });
  if (s.desks.cmdty.unlocked) {
    const c = m.cmdty.carry.WTI;
    out.push({ id: `OP${s.nextId++}`, desk: 'cmdty', title: `WTI curve in ${c < 0 ? 'backwardation' : 'contango'} (${(c * 100).toFixed(1)}%/yr)`, body: c < 0 ? 'Backwardation: longs earn positive roll yield as futures converge up to spot; it signals tight prompt supply.' : 'Contango: longs pay roll cost each month; storage economics cap how steep it can get.', legs: [], status: 'open' });
  }
  return out;
}

// ---------------------------------------------------------------- events

function eventShock(s: GameState, ev: MacroEvent, z: Shock, notes: LogItem[]) {
  const u = randNormal(s);
  ev.surprise = u;
  const note = (t: string, tone: LogItem['tone'] = 'neutral') => notes.push({ day: s.day, text: t, tone });
  switch (ev.kind) {
    case 'cpi': {
      const actual = 0.3 + u * 0.12;
      z.inf += 2.2 * u;
      ev.outcome = `${actual.toFixed(1)}% vs 0.3% expected`;
      note(`CPI printed ${ev.outcome}: ${u > 0.5 ? 'hot — front-end yields jump, dollar firmer, equities lower' : u < -0.5 ? 'soft — yields fall, risk rallies' : 'in line'}.`, Math.abs(u) > 0.5 ? 'bad' : 'neutral');
      break;
    }
    case 'nfp': {
      const actual = Math.round(180 + u * 90);
      z.g += 1.6 * u;
      ev.outcome = `+${actual}k vs +180k expected`;
      note(`Payrolls ${ev.outcome}.`);
      break;
    }
    case 'fomc': {
      const scripted = s.day === 12 ? 'hike' : s.day === 25 ? 'cut50' : null;
      let decision: 'hike' | 'hold' | 'cut50' = scripted ?? (u > 0.85 ? 'hike' : 'hold');
      const expected = decision === 'cut50' ? -10 : 5; // market priced ~20% chance of a hike
      const actualBp = decision === 'hike' ? 25 : decision === 'cut50' ? -50 : 0;
      z.policyBp = actualBp - expected;
      if (decision === 'hike') z.inf += 0.5;
      ev.outcome = decision === 'hike' ? 'Surprise 25bp HIKE' : decision === 'cut50' ? 'Emergency 50bp CUT' : 'Hold, as expected';
      note(`FOMC: ${ev.outcome}. Policy surprise ${z.policyBp > 0 ? '+' : ''}${z.policyBp}bp vs pricing.`, decision === 'hold' ? 'neutral' : 'bad');
      break;
    }
    case 'ecb': {
      const bp = u > 1 ? 25 : u < -1 ? -25 : 0;
      z.idio['rates:EUR'] = (z.idio['rates:EUR'] ?? 0) + bp * 2;
      z.jumps = { ...(z.jumps ?? {}), 'fx:EURUSD': bp * 0.0002 + u * 0.002 };
      ev.outcome = bp ? `${bp > 0 ? 'Hike' : 'Cut'} ${Math.abs(bp)}bp` : `Hold; ${u > 0 ? 'hawkish' : 'dovish'} tone`;
      note(`ECB: ${ev.outcome}.`);
      break;
    }
    case 'earnings': {
      const t = ev.target!;
      const jump = u * 0.045;
      z.jumps = { ...(z.jumps ?? {}), [`eq:${t}`]: jump };
      ev.outcome = `${jump > 0 ? 'Beat' : 'Miss'}: stock ${jump > 0 ? '+' : ''}${(jump * 100).toFixed(1)}% after hours`;
      note(`${ev.title}: ${ev.outcome}.`, Math.abs(jump) > 0.05 ? 'bad' : 'neutral');
      break;
    }
    case 'opec': {
      z.oil += 1.4 * u;
      ev.outcome = u > 0.6 ? 'Surprise output cut' : u < -0.6 ? 'Output increase' : 'Quotas unchanged';
      note(`OPEC+: ${ev.outcome}.`);
      break;
    }
    case 'auction': {
      z.idio['rates:term'] = (z.idio['rates:term'] ?? 0) + u * 1.2;
      ev.outcome = `${u > 0 ? 'Tailed' : 'Stopped through'} by ${Math.abs(u).toFixed(1)}bp`;
      note(`10Y auction ${ev.outcome}.`);
      break;
    }
    case 'geopolitics': {
      z.ro += 2.5;
      z.oil += 2.5;
      ev.outcome = 'Risk-off: oil spikes, havens bid';
      note(`${ev.title}: ${ev.outcome}.`, 'bad');
      break;
    }
    default:
      break;
  }
}

function scriptedShock(s: GameState, z: Shock): string[] {
  const d = s.day;
  const h: string[] = [];
  if (d === 15) {
    z.oil += 2.2;
    z.ro += 0.8;
    h.push('Strait closure fears: tanker attacked, oil spikes and the curve backwardates');
  }
  if (d === 21) {
    s.market.regime = 'stressed';
    z.g -= 2;
    z.ro += 1.5;
    h.push('Recession scare: ISM collapses, credit spreads gap wider');
  }
  if (d === 22) {
    s.market.regime = 'crisis';
    z.ro += 2.5;
    z.g -= 1.5;
    z.jumps = { ...(z.jumps ?? {}), 'cr:MDRT': 600, 'cr:SRTL': 150 };
    h.push('Liquidity crunch: dealers pull back, bid/ask spreads explode, funding spreads widen');
  }
  if (d === 23) {
    z.ro += 1.5;
    h.push('Meadow Retail files for bankruptcy; hedge fund Kestrel Lane gates redemptions');
  }
  if (d === 24) {
    z.ro += 0.5;
  }
  if (d === 25) {
    s.market.regime = 'recovery';
    z.ro -= 2.5;
    z.g += 1;
    h.push('Central bank emergency cut; markets rebound');
  }
  return h;
}

// ---------------------------------------------------------------- the close

export function closeDay(s: GameState): DayReport {
  const notes: LogItem[] = [];
  const note = (text: string, tone: LogItem['tone'] = 'neutral') => {
    notes.push({ day: s.day, text, tone });
    log(s, text, tone);
  };
  // 1. unanswered RFQs lapse (requests that never reached the desk simply don't happen)
  for (const r of s.rfqs) {
    if (r.status !== 'open') continue;
    r.status = 'expired';
    if (minuteOf(r.time) > s.clock) continue;
    const c = s.clients[r.clientId];
    c.noQuotes++;
    c.relationship = Math.max(0, c.relationship - 0.5);
    s.stats.rfqPassed++;
  }
  // 2. run the clock to the close, then intraday electronic flow and working orders at closing prices
  advanceTo(s, CLOSE_MIN);
  syncMarket(s);
  const flows = runFlow(s);
  for (const n of runOrders(s)) notes.push(n);
  // 3. overnight: today's full shock (diffuse move + every release, including after-hours ones) from the open
  const m0 = s.market;
  const mo = s.openMarket ?? m0;
  const plan = s.plan!;
  const z: Shock = combineShocks([[plan.base, 1], ...plan.events.map((e) => [e.z, 1] as [Shock, number])]);
  const todays = s.events.filter((e) => e.day === s.day);
  for (const e of plan.events) for (const n of e.notes) notes.push(n);
  const headlines = plan.headlines;
  if (s.day > CAMPAIGN_DAYS && stepRegime(s, mo)) note(`Market regime shifts to ${REGIMES[mo.regime].label.toLowerCase()}.`, mo.regime === 'crisis' || mo.regime === 'stressed' ? 'bad' : 'neutral');
  const days = accrualDays(s.date);
  const m1 = applyShock(mo, z, { days });
  m1.day = s.day + 1;
  settleConditions(m1);
  // 4. attribution of the market move with today's positions
  const attr = attributeMove(s, m0, m1);
  for (const id of DESKS) for (const k in attr[id]) (s.desks[id].pnlToday as any)[k] += (attr[id] as any)[k];
  s.prevMarket = mo;
  s.market = m1;
  s.markClock = s.clock;
  // 5. defaults
  if (s.day === 23 && !m1.credit.defaulted.MDRT) {
    const r = processDefault(s, 'MDRT', 0.25);
    note(`Meadow Retail defaulted (recovery 25%). Impact: ${Object.entries(r).map(([d, v]) => `${DESK_META[d as DeskId].short} ${fm(v)}`).join(', ') || 'no Atlas exposure'}.`, 'bad');
  }
  for (const id in s.issuers) {
    if (m1.credit.defaulted[id] || s.day <= CAMPAIGN_DAYS) continue;
    const sp = m1.credit.spread[id];
    const pd = (sp / 1e4 / (1 - s.issuers[id].recovery)) * (days / 365) * (m1.regime === 'crisis' ? 2 : 1);
    if (chance(s, pd)) {
      const r = processDefault(s, id, s.issuers[id].recovery);
      note(`${s.issuers[id].name} defaulted. Impact: ${Object.entries(r).map(([d, v]) => `${DESK_META[d as DeskId].short} ${fm(v)}`).join(', ') || 'none'}.`, 'bad');
    }
  }
  // client (counterparty) default: OTC positions are closed out; positive MTM recovered at 30%
  const cptyDefaults: string[] = [];
  if (s.day === 23) cptyDefaults.push('kestrel');
  if (s.day > CAMPAIGN_DAYS && m1.regime === 'crisis') for (const c of Object.values(s.clients)) if (!c.defaulted && (c.credit === 'BB' || c.credit === 'B') && chance(s, 0.01)) cptyDefaults.push(c.id);
  for (const cid of cptyDefaults) {
    const loss = closeOutCounterparty(s, cid, 0.3);
    note(`${s.clients[cid].name} defaulted on its derivatives. Close-out loss to Atlas ${fm(loss)} (positive MTM recovered at 30%).`, loss > 0 ? 'bad' : 'neutral');
  }
  // 6. accruals & funding, variation margin, expiries
  accrue(s, days);
  settleVariationMargin(s);
  for (const t of settleExpiries(s)) notes.push({ day: s.day, text: t, tone: 'neutral' });
  // 7. costs
  const costs = dailyCosts(s, days);
  s.costsToday += costs.total;
  s.costsCum += s.costsToday;
  // 8. reconcile: P&L components must explain the change in value
  const byDesk = {} as Record<DeskId, number>;
  let total = 0;
  const parts = emptyPnl();
  for (const id of DESKS) {
    const d = s.desks[id];
    const dv = deskValue(s, d) - s.openValue[id];
    const explained = pnlSum(d.pnlToday);
    d.pnlToday.other += dv - explained;
    for (const k in d.pnlToday) {
      (d.pnl as any)[k] += (d.pnlToday as any)[k];
      (parts as any)[k] += (d.pnlToday as any)[k];
    }
    byDesk[id] = dv;
    total += dv;
  }
  // 9. risk, limits, capital
  const v = computeVaR(s);
  const stress = STRESSES.map((st) => runStress(s, st.id));
  const breaches: string[] = [];
  let capitalUsed = 0;
  for (const id of DESKS) {
    const d = s.desks[id];
    if (!d.unlocked && !Object.keys(d.positions).length) continue;
    const worst = Math.min(0, ...stress.map((x) => x.byDesk[id]));
    capitalUsed += deskCapital(s, id, v, worst).total;
    const r = summarise(s, id);
    const varX = v.byDesk[id].var99;
    const over: string[] = [];
    if (varX > d.limits.var) over.push(`VaR ${fm(varX)} vs ${fm(d.limits.var)}`);
    if (r.primary > d.limits.primary) over.push(`${r.primaryLabel} ${fm(r.primary)} vs ${fm(d.limits.primary)}`);
    if (over.length) {
      d.breachDays++;
      breaches.push(`${d.name}: ${over.join('; ')}`);
      if (d.breachDays >= 2) {
        // risk management forces the desk back inside limits and restricts its authority
        const cost = forceDerisk(s, id);
        d.restrictedUntil = s.day + 3;
        note(`Risk management forced ${d.name} to cut risk (cost ${fm(cost)}); new client risk restricted for 3 days.`, 'bad');
        d.breachDays = 0;
      } else note(`${d.name} limit breach: ${over.join('; ')}. Fix it by tomorrow's close or risk will step in.`, 'bad');
    } else d.breachDays = 0;
  }
  s.cleanDays = breaches.length ? 0 : s.cleanDays + 1;
  // 10. economic profit, confidence, reputation, market share
  const allocatedCap = Object.values(s.desks).reduce((a, x) => a + x.capital, 0);
  const capCharge = (HURDLE * Math.max(allocatedCap, capitalUsed) * days) / 365;
  const ep = total - s.costsToday - capCharge;
  s.cumEP += ep;
  s.stats.cumPnl += total;
  s.stats.peakPnl = Math.max(s.stats.peakPnl, s.stats.cumPnl - s.costsCum);
  s.stats.maxDrawdown = Math.max(s.stats.maxDrawdown, s.stats.peakPnl - (s.stats.cumPnl - s.costsCum));
  const conf0 = s.confidence;
  // judged on a rolling week of risk-adjusted performance, not one day's noise
  const recent = [...s.history.slice(-4).map((h) => h.ep), ep];
  const avgEp = recent.reduce((a, b) => a + b, 0) / recent.length;
  const target = (Math.max(allocatedCap, 1) * 0.05) / 365;
  let dc = Math.max(-3, Math.min(1.5, (avgEp / target) * 0.4));
  dc += (55 - s.confidence) * 0.04;
  dc -= breaches.length * 1.0;
  if (capitalUsed > allocatedCap * 1.05) {
    dc -= 2;
    note(`Capital usage ${fm(capitalUsed)} exceeds the ${fm(allocatedCap)} allocated.`, 'bad');
  }
  if (total < -0.02 * allocatedCap) dc -= 8;
  s.confidence = Math.max(0, Math.min(100, s.confidence + dc));
  updateShares(s);
  const rels = Object.values(s.clients).filter((c) => !c.defaulted);
  s.reputation = rels.reduce((a, c) => a + c.relationship, 0) / Math.max(1, rels.length);
  if (s.confidence <= 0) {
    s.status = 'fired';
    s.firedReason = 'The board lost confidence in the trading business under your leadership.';
  }
  if (s.stats.cumPnl - s.costsCum < -0.25 * s.firmCapital) {
    s.status = 'fired';
    s.firedReason = `Cumulative losses of ${fm(s.costsCum - s.stats.cumPnl)} — more than a quarter of the division's capital.`;
  }
  checkAchievements(s, { flows, breaches, total });
  // 11. history & report
  const snap = {
    day: s.day,
    date: s.date,
    pnl: total,
    byDesk,
    parts,
    var: v.var99,
    capital: capitalUsed,
    confidence: s.confidence,
    us500: m1.eq.spot.US500,
    ust10: parYield(m1, 10),
    regime: m1.regime,
    ep,
  };
  s.history.push(snap);
  if (s.history.length > 250) s.history.shift();
  const report: DayReport = {
    day: s.day,
    date: s.date,
    total,
    byDesk,
    parts,
    notes,
    events: todays,
    moves: marketMoves(mo, m1),
    confidenceDelta: s.confidence - conf0,
    ep,
    breaches,
  };
  for (const h of headlines) notes.unshift({ day: s.day, text: h, tone: 'bad' });
  s.lastReport = report;
  s.day += 1;
  s.date = nextBusinessDay(s.date);
  pruneInstruments(s);
  if (s.status === 'playing') startDay(s);
  return report;
}

function marketMoves(a: GameState['market'], b: GameState['market']): DayReport['moves'] {
  const pct = (x: number, y: number) => (y / x - 1) * 100;
  const mv = (label: string, v: number, unit: string, inv = false) => ({ label, value: `${v >= 0 ? '+' : ''}${v.toFixed(unit === 'bp' ? 1 : 2)}${unit}`, tone: (inv ? -v : v) >= 0 ? ('up' as const) : ('down' as const) });
  return [
    mv('US500', pct(a.eq.spot.US500, b.eq.spot.US500), '%'),
    mv('UST 2Y', (parYield(b, 2) - parYield(a, 2)) * 1e4, 'bp', true),
    mv('UST 10Y', (parYield(b, 10) - parYield(a, 10)) * 1e4, 'bp', true),
    mv('EURUSD', pct(a.fx.spot.EURUSD, b.fx.spot.EURUSD), '%'),
    mv('USDJPY', pct(a.fx.spot.USDJPY, b.fx.spot.USDJPY), '%'),
    mv('CDX IG', b.credit.spread.CDXIG - a.credit.spread.CDXIG, 'bp', true),
    mv('WTI', pct(a.cmdty.spot.WTI, b.cmdty.spot.WTI), '%'),
    mv('Gold', pct(a.cmdty.spot.GOLD, b.cmdty.spot.GOLD), '%'),
    mv('Implied vol', (b.eq.atmVol.US500 - a.eq.atmVol.US500) * 100, 'pts', true),
  ];
}

/** Close out OTC positions facing a defaulted client. Returns the loss to Atlas. */
export function closeOutCounterparty(s: GameState, clientId: string, recovery: number): number {
  const c = s.clients[clientId];
  c.defaulted = true;
  let loss = 0;
  for (const id of DESKS) {
    const d = s.desks[id];
    for (const pid of Object.keys(d.positions)) {
      const p = d.positions[pid];
      if (p.cpty !== clientId) continue;
      const inst = s.instruments[pid];
      if (!['irs', 'fxFwd', 'fxOpt', 'eqOpt', 'cmdtyOpt', 'varSwap', 'cds'].includes(inst.kind)) continue;
      const mtm = positionValue(inst, p, s.market);
      // Atlas receives recovery on what it is owed; pays in full what it owes
      const settle = mtm > 0 ? mtm * recovery : mtm;
      d.cash.USD = (d.cash.USD ?? 0) + settle;
      d.pnlToday.defaults += settle - mtm;
      loss += mtm - settle;
      delete d.positions[pid];
    }
  }
  return loss;
}

/** Forced de-risking imposed by risk management: halve every position in the market, then re-hedge. */
function forceDerisk(s: GameState, desk: DeskId): number {
  return unwindFraction(s, desk, 0.5) + autoHedge(s, desk, 0.7);
}

/** Unwind a fraction of every position on a desk in the street (including currency balances). */
export function unwindFraction(s: GameState, desk: DeskId, frac: number): number {
  const d = s.desks[desk];
  let cost = 0;
  for (const id of Object.keys(d.positions)) {
    const inst = s.instruments[id];
    if (inst.kind === 'autocall') continue; // issued notes can't be bought back; hedge them instead
    const q = d.positions[id].qty * frac;
    const qq = ['eqFut', 'bondFut', 'sofrFut', 'cmdtyFut', 'eqOpt'].includes(inst.kind) ? Math.round(q) : q;
    if (qq) cost += executeStreet(s, desk, id, -qq, 'unwind');
  }
  if (desk === 'fx') {
    const m = s.market;
    for (const c of Object.keys(d.cash)) {
      if (c === 'USD') continue;
      const bal = d.cash[c as keyof typeof d.cash] ?? 0;
      const pair = ['EURUSD', 'USDJPY', 'GBPUSD', 'AUDUSD', 'USDCAD', 'USDMXN', 'USDBRL'].find((p) => p.includes(c))!;
      const base = pair.slice(0, 3);
      const q = base === c ? -bal * frac : (bal * frac) / m.fx.spot[pair];
      if (Math.abs(q) > 1) cost += executeStreet(s, 'fx', `SPOT:${pair}`, q, 'unwind');
    }
  }
  return cost;
}

function updateShares(s: GameState) {
  for (const id of DESKS) {
    const won = s.rfqs.filter((r) => r.desk === id && r.status === 'won').length;
    const seen = s.rfqs.filter((r) => r.desk === id).length;
    if (!seen) continue;
    const hit = won / seen;
    s.share[id] = Math.max(0.01, Math.min(0.25, s.share[id] * (1 + 0.04 * (hit - 0.3))));
  }
  for (const r of s.rfqs) {
    if (r.status === 'won') s.stats.rfqWon++;
    else if (r.status === 'lost') s.stats.rfqLost++;
  }
}

export function totalPnlToday(s: GameState): number {
  return DESKS.reduce((a, id) => a + deskValue(s, s.desks[id]) - s.openValue[id], 0);
}

export function deskFirmValue(s: GameState) {
  return firmValue(s);
}

export { fpct, executeStreet, counterpartyExposure, CAMPAIGN_DAYS as CAMPAIGN };

export function startGame(seed: number, difficulty: GameState['difficulty'] = 'normal'): GameState {
  const s = newGameState(seed, difficulty);
  startDay(s);
  return s;
}
