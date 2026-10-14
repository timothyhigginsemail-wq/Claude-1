// Day cycle. Morning: events arrive. During the day: the player decides. Close: the end-of-day
// pipeline runs the market, clients, stock loan, accruals, funding, margin and scoring.

import { accountValue, activeClients, markShorts, settleVariationMargin, deposit } from '../engine/accounts';
import { deskSummary, pnlFromLedger, pnlTotal, revenueOf, snapshotPnlBalances } from '../engine/analytics';
import { clientTrading, liquidate, rebalanceWallet, updateFund, updateSatisfaction } from '../engine/behavior';
import { accrualDays, nextBusinessDay } from '../engine/calendar';
import { fm, fpct } from '../engine/format';
import { accrue, emptyClientPnl, liquidityMetrics, settleFunding } from '../engine/funding';
import { ACC, bal, post } from '../engine/ledger';
import { markBorrows, rebalanceBorrows, updateMarketFees } from '../engine/lending';
import { computeMargin } from '../engine/margin';
import { advanceMarket, regimeLabel } from '../engine/market';
import { chance, rand } from '../engine/rng';
import { deskRisk, HURDLE } from '../engine/risk';
import type { DayReport, GameEvent, GameState, LogItem } from '../engine/types';
import {
  buyIn,
  defaultCloseOut,
  expireEvent,
  log,
  makeBorrowRequest,
  makeCompetitorOffer,
  makeCrowding,
  makeFinancingRequest,
  makeFundingShock,
  makeGiveUp,
  makeMarginCall,
  makeMarginDefault,
  makeOnboarding,
  makeRecall,
  makeRedemption,
  makeReprice,
  makeReview,
  makeSqueezeAlert,
  makeTermFunding,
  makeCounterpartyNews,
} from './events';
import { generateFund } from './funds';
import { scriptedEvents, scriptedMarket } from './scenario';
import { computeScore } from './scoring';
import { emptySignals } from './signals';

export const CAMPAIGN_DAYS = 30;

export function pendingBlocking(s: GameState): GameEvent[] {
  return s.events.filter((e) => e.status === 'pending' && e.kind === 'marginDefault');
}

export function startDay(s: GameState, first = false) {
  s.desk.analystUsed = 0;
  for (const c of Object.values(s.clients)) c.pnlToday = emptyClientPnl();
  s.dayStartPnl = snapshotPnlBalances(s);
  s.centralToday = { residual: 0, overhead: 0 };
  // carry nothing over: yesterday's events are history
  s.events = [];
  const evs: GameEvent[] = [];
  const sig = s.signals;
  // urgent: failed margin calls
  for (const id of sig.failedCalls) {
    const c = s.clients[id];
    if (c && c.status === 'active') evs.push(makeMarginDefault(s, c));
  }
  for (const id of sig.newMarginCalls) {
    const c = s.clients[id];
    if (c && c.status === 'active' && !c.marginCall) evs.push(makeMarginCall(s, c));
  }
  // scheduled negotiation rounds
  for (const sch of s.scheduled.filter((x) => x.day <= s.day && x.kind === 'onboardingRound2')) {
    const c = s.clients[sch.clientId!];
    if (c && c.status === 'prospect') evs.push(makeOnboarding(s, c, 2));
  }
  s.scheduled = s.scheduled.filter((x) => !(x.day <= s.day && x.kind === 'onboardingRound2'));
  // recalls & reprices from last night
  for (const r of sig.recalls.slice(0, 2)) {
    const e = makeRecall(s, r.contractId);
    if (e) evs.push(e);
  }
  for (const r of sig.reprices.slice(0, 1)) evs.push(makeReprice(s, r.secId, r.from, r.to));
  // scripted beats (campaign)
  if (s.day <= CAMPAIGN_DAYS) {
    const before = sig.recalls.length;
    const sc = scriptedEvents(s);
    // recalls injected by the script
    for (const r of sig.recalls.slice(before)) {
      const e = makeRecall(s, r.contractId);
      if (e) sc.push(e);
    }
    evs.push(...sc);
  }
  // procedural events
  evs.push(...proceduralEvents(s, first, evs));
  // sort by time
  evs.sort((a, b) => a.time.localeCompare(b.time));
  s.events = evs;
  s.signals = emptySignals();
}

function proceduralEvents(s: GameState, first: boolean, existing: GameEvent[]): GameEvent[] {
  const out: GameEvent[] = [];
  if (first) return out;
  const campaign = s.day <= CAMPAIGN_DAYS;
  const has = (k: string, cid?: string) => [...existing, ...out].some((e) => e.kind === k && (!cid || e.clientId === cid));
  const sig = s.signals;
  // HTB borrow requests from client trading
  const wants = [...sig.htbWants].sort((a, b) => b.qty * s.securities[b.secId].price - a.qty * s.securities[a.secId].price);
  for (const w of wants.slice(0, campaign ? 1 : 2)) {
    const c = s.clients[w.clientId];
    if (c?.status === 'active' && !has('borrowRequest', c.id) && s.day - (c.askCooldown[w.secId] ?? -99) >= 6) out.push(makeBorrowRequest(s, c, w.secId, w.qty));
  }
  // redemptions
  for (const c of activeClients(s)) {
    if (c.fund.redemptionsPending > 0 && !has('redemption', c.id) && chance(s, 0.6)) out.push(makeRedemption(s, c));
  }
  // squeezes building outside the script
  if (!campaign) {
    for (const id in s.securities) {
      const sec = s.securities[id];
      if (sec.squeeze > 0.3 && !has('squeezeAlert')) {
        const e = makeSqueezeAlert(s, id);
        if (e) out.push(e);
      }
    }
  }
  const rnd = (p: number) => chance(s, p * (s.difficulty === 'expert' ? 1.25 : 1));
  // competitor approaches where Atlas is expensive
  for (const c of activeClients(s)) {
    if (s.day - c.lastCompetitorDay < 10 || has('competitorOffer')) continue;
    if (c.satisfaction < -0.05 && rnd(campaign ? 0.15 : 0.25)) out.push(makeCompetitorOffer(s, c));
  }
  // clients hitting Atlas limits ask for more financing
  for (const c of activeClients(s)) {
    if (has('financingRequest')) break;
    if (c.constrained > 0.25 && s.day - (c.askCooldown.__financing ?? -99) >= 10 && rnd(0.3)) {
      const av = accountValue(s, c);
      out.push(makeFinancingRequest(s, c, Math.max(25e6, Math.min(400e6, av.gmv * 0.1)), c.terms.financingSpreadBps + 10, av.leverage * 1.12));
    }
  }
  if (!campaign) {
    if (rnd(0.12) && activeClients(s).length) {
      const c = activeClients(s)[Math.floor(rand(s) * activeClients(s).length)];
      const g = makeGiveUp(s, c);
      if (g) out.push(g);
    }
    if (rnd(0.05)) out.push(makeTermFunding(s));
    if (rnd(0.04)) {
      const cr = makeCrowding(s);
      if (cr) out.push(cr);
    }
    if (sig.regimeChanged && (sig.regimeChanged === 'stressed' || sig.regimeChanged === 'crisis')) out.push(makeFundingShock(s, sig.regimeChanged === 'crisis' ? 50 : 25));
    // new prospects
    if (rnd(0.14) && Object.values(s.clients).filter((c) => c.status === 'prospect').length < 2) {
      const f = generateFund(s, s.day, new Set(Object.values(s.clients).map((c) => c.name)));
      s.clients[f.id] = f;
    }
    // prospects whose arrival day is today
    for (const c of Object.values(s.clients)) if (c.status === 'prospect' && c.arrivalDay <= s.day && !has('onboarding', c.id)) out.push(makeOnboarding(s, c));
    if ((s.day - CAMPAIGN_DAYS) % 20 === 0 && !has('managementReview')) out.push(makeReview(s));
    // weak competitors fail in crises
    for (const comp of Object.values(s.competitors)) {
      if (comp.health < 0.4 && !s.milestones.includes(`cpty:${comp.id}`)) {
        s.milestones.push(`cpty:${comp.id}`);
        out.push(makeCounterpartyNews(s, comp.id));
      }
    }
  }
  return out.slice(0, 6);
}

/** Close the day: run the end-of-day pipeline and advance to the next business day. */
export function endDay(s: GameState): DayReport {
  const notes: LogItem[] = [];
  const note = (text: string, tone: LogItem['tone'] = 'neutral') => {
    notes.push({ day: s.day, text, tone });
    log(s, text, tone);
  };
  // 1. unresolved events take their default
  for (const ev of s.events) if (ev.status === 'pending') expireEvent(s, ev);
  const confBefore = s.desk.confidence;
  // 2. market move
  const prevRegime = s.market.regime;
  const mo = s.day <= CAMPAIGN_DAYS ? scriptedMarket(s) : {};
  advanceMarket(s, mo);
  if (s.market.regime !== prevRegime) s.signals.regimeChanged = s.market.regime;
  // competitors' health drifts with the regime
  for (const comp of Object.values(s.competitors)) {
    const target = s.market.regime === 'crisis' ? comp.reliability * 0.8 : comp.reliability;
    if (comp.id !== 'kestrel' || s.day > 30) comp.health = Math.max(0.1, Math.min(1, comp.health + (target - comp.health) * 0.05 + (rand(s) - 0.5) * 0.01));
  }
  // 3. marks: shorts, futures VM, stock-loan collateral
  for (const c of activeClients(s)) {
    markShorts(s, c);
    settleVariationMargin(s, c);
  }
  const feesBefore: Record<string, number> = Object.fromEntries(s.borrows.map((b) => [b.secId, s.securities[b.secId].borrowFeeBps]));
  markBorrows(s);
  // fund-level updates
  for (const c of activeClients(s)) updateFund(s, c);
  // 4. margin calls falling due
  for (const c of activeClients(s)) {
    const mc = c.marginCall;
    if (!mc || mc.status !== 'open' || mc.dueDay > s.day) continue;
    processCallDue(s, c, note);
  }
  // 5. orderly liquidations in progress
  for (const sch of s.scheduled.filter((x) => x.kind === 'orderlyLiquidation' && x.day <= s.day)) {
    const c = s.clients[sch.clientId!];
    const rem = sch.data.remaining as number;
    if (!c || c.status !== 'active') {
      sch.data.remaining = 0;
      continue;
    }
    const r = defaultCloseOut(s, c, rem <= 1 ? 1 : 1 / rem, 'orderly');
    sch.data.remaining = rem - 1;
    sch.day = s.day + 1;
    if (rem <= 1) note(`${c.short} close-out complete. ${r.loss > 0 ? `Loss ${fm(r.loss)}; claim filed.` : 'No loss to Atlas.'}`, r.loss > 0 ? 'bad' : 'neutral');
  }
  s.scheduled = s.scheduled.filter((x) => !(x.kind === 'orderlyLiquidation' && (x.data.remaining as number) <= 0));
  // 6. client trading
  for (const c of activeClients(s)) {
    if (c.marginCall?.status === 'open' || s.scheduled.some((x) => x.kind === 'orderlyLiquidation' && x.clientId === c.id)) continue;
    const r = clientTrading(s, c);
    for (const w of r.wantedHTB) s.signals.htbWants.push({ clientId: c.id, secId: w.secId, qty: w.qty });
    if (r.fails.length) c.borrowFails += r.fails.length * 0.5;
  }
  // 7. wallet share & satisfaction; displaced clients if a competitor is failing
  for (const c of activeClients(s)) {
    rebalanceWallet(s, c);
    updateSatisfaction(s, c);
  }
  // 8. random recalls & reprices; then re-source borrows, buy-ins for shortfalls
  for (const b of s.borrows) {
    const sec = s.securities[b.secId];
    const lender = s.lenders[b.lenderId];
    const p = lender.recallPropensity * (0.003 + 0.05 * sec.squeeze + (sec.borrowFeeBps > 500 ? 0.01 : 0));
    if (b.qty * sec.price > 2e6 && chance(s, p) && s.signals.recalls.length < 2) {
      s.signals.recalls.push({ contractId: b.id, secId: b.secId, lenderId: b.lenderId, qty: b.qty });
    }
  }
  updateMarketFees(s);
  for (const secId in feesBefore) {
    const now = s.securities[secId].borrowFeeBps;
    const was = feesBefore[secId];
    if (now > Math.max(150, was * 1.5) && s.signals.reprices.length < 1) s.signals.reprices.push({ secId, from: was, to: now });
  }
  const rb = rebalanceBorrows(s);
  for (const secId in rb.shortfall) {
    const units = rb.shortfall[secId];
    if (units * s.securities[secId].price < 1e5) continue;
    const r = buyIn(s, secId, units, 0.02);
    for (const x of r) s.signals.buyIns.push({ clientId: x.clientId, secId, qty: x.units });
    note(`Fail-to-deliver in ${secId}: no borrow available for ${fm(units * s.securities[secId].price)} — clients bought in (Reg SHO close-out).`, 'bad');
  }
  // 9. final marks after the day's trading (liquidations and buy-ins move prices)
  for (const c of activeClients(s)) markShorts(s, c);
  markBorrows(s);
  // accruals
  const days = accrualDays(s.date);
  s.lastAccrualDays = days;
  s.accrualDaysCum += days;
  // term repo maturities
  for (const tr of s.desk.termRepos.filter((t) => t.maturityDay <= s.day)) {
    post(s, 'funding', `Term repo ${tr.id} matures`, [
      { account: ACC.termRepo, amount: tr.amount },
      { account: ACC.cash, amount: -tr.amount },
    ]);
    note(`Term repo ${tr.id} (${fm(tr.amount)}) matured.`);
  }
  s.desk.termRepos = s.desk.termRepos.filter((t) => t.maturityDay > s.day);
  settleFunding(s);
  const acc = accrue(s, days);
  s.centralToday.residual += acc.centralResidual;
  s.centralToday.overhead += acc.overhead;
  // 10. claims & recoveries
  for (const c of Object.values(s.clients)) {
    if (c.claim && c.claim.amount > 0 && c.claim.resolveDay === s.day) {
      const rec = c.claim.amount * Math.max(0, Math.min(1, c.claim.expectedRecovery * (0.6 + rand(s) * 0.8)));
      post(s, 'recovery', `${c.short} estate distribution on Atlas claim`, [
        { account: ACC.cash, amount: rec },
        { account: ACC.pnl('creditLoss'), amount: -rec },
      ], c.id);
      c.pnlToday.creditLoss += rec;
      note(`Recovered ${fm(rec)} (${fpct(rec / c.claim.amount, 0)}) from the ${c.name} estate.`, 'good');
      c.claim = undefined;
    }
  }
  // 11. funding waterfall
  const fr = settleFunding(s);
  if (fr.forcedRepoPaydown > 1e6) note(`Repo counterparties cut lines/raised haircuts: ${fm(fr.forcedRepoPaydown)} of repo had to be repaid.`, 'bad');
  if (bal(s.ledger, ACC.emergency) < -1) {
    s.desk.emergencyDays++;
    s.desk.confidence -= 4;
    note(`Liquidity breach: ${fm(-bal(s.ledger, ACC.emergency))} of emergency funding drawn at SOFR+500bp. Treasury is not happy.`, 'bad');
  }
  // 12. margin checks for tomorrow
  for (const c of activeClients(s)) {
    if (s.scheduled.some((x) => x.kind === 'orderlyLiquidation' && x.clientId === c.id)) continue;
    const m = computeMargin(s, c);
    if (m.equity < m.maintenance && !(c.marginCall && c.marginCall.status === 'open')) s.signals.newMarginCalls.push(c.id);
    if (m.equity <= 0 && !s.signals.failedCalls.includes(c.id)) s.signals.failedCalls.push(c.id);
    c.equityHist.push(m.equity);
    if (c.equityHist.length > 120) c.equityHist.shift();
  }
  // 13. P&L, scoring, history
  const pnl = pnlFromLedger(s, s.dayStartPnl);
  const net = pnlTotal(pnl);
  s.pnlToday = pnl;
  for (const c of Object.values(s.clients)) {
    for (const k of Object.keys(c.pnlToday) as (keyof typeof c.pnlToday)[]) c.pnl[k] += c.pnlToday[k];
  }
  s.centralCum.residual += s.centralToday.residual;
  s.centralCum.overhead += s.centralToday.overhead;
  for (const k of Object.keys(s.pnlCum) as (keyof typeof s.pnlCum)[]) s.pnlCum[k] += pnl[k];
  const risk = deskRisk(s);
  const ep = net - (HURDLE * risk.capitalUsed * days) / 360;
  s.cumEP += ep;
  const d = deskSummary(s);
  if (d.capitalUtil > 1.0) {
    s.desk.capitalBreachDays++;
    s.desk.confidence -= d.capitalUtil > 1.1 ? 4 : 2;
    note(`Capital usage ${fpct(d.capitalUtil, 0)} of allocation — over limit.`, 'bad');
  }
  const lm = liquidityMetrics(s);
  // management confidence: risk-adjusted performance, losses, liquidity
  const conf = s.desk.confidence;
  let dc = 0;
  dc += Math.max(-3, Math.min(1.2, (ep / Math.max(1e5, s.desk.allocatedCapital * 0.0004)) * 0.6));
  if (pnl.creditLoss < -1e6) dc -= Math.min(25, (-pnl.creditLoss / s.desk.allocatedCapital) * 80);
  if (lm.lcr < 1) dc -= 1;
  if (d.clients >= 3) dc += 0.2;
  s.desk.confidence = Math.max(0, Math.min(100, conf + dc));
  const equity = d.equity;
  if (equity < s.desk.allocatedCapital * 0.45) {
    s.status = 'fired';
    s.firedReason = `Losses consumed more than half of the desk's capital (equity ${fm(equity)}).`;
  } else if (s.desk.confidence <= 0) {
    s.status = 'fired';
    s.firedReason = 'Senior management lost confidence in your leadership of the desk.';
  }
  const score = computeScore(s);
  s.history.push({
    day: s.day,
    date: s.date,
    pnl: net,
    revenue: revenueOf(pnl),
    netIncome: net,
    economicProfit: ep,
    equity,
    capitalUsed: risk.capitalUsed,
    grossClientMV: d.grossClientMV,
    debits: d.debits,
    credits: d.credits,
    shortProceeds: d.shortProceeds,
    extCollateral: d.extCollateral,
    reserve: d.reserve,
    cash: d.cash,
    repo: d.repo + d.termRepo,
    treasury: d.treasury,
    emergency: d.emergency,
    internalisation: d.internalisation,
    stressExposure: risk.stressExposure,
    confidence: s.desk.confidence,
    index: s.market.index,
    regime: s.market.regime,
    sofr: s.market.sofr,
    lcr: lm.lcr,
    score: score.total,
  });
  // phase progression
  const prevPhase = s.phase;
  if (s.phase === 1 && (d.clients >= 3 || s.day >= 6)) s.phase = 2;
  if (s.phase === 2 && (d.grossClientMV > 2.5e9 || s.day >= 16)) s.phase = 3;
  if (s.phase === 3 && s.day >= 20) s.phase = 4;
  if (s.phase === 4 && s.day >= CAMPAIGN_DAYS) s.phase = 5;
  if (s.phase !== prevPhase) note(`Phase ${s.phase}: ${PHASES[s.phase - 1].name}.`, 'good');
  // headlines
  s.market.headlines = headlines(s);
  const report: DayReport = {
    day: s.day,
    date: s.date,
    netIncome: net,
    revenue: revenueOf(pnl),
    pnl,
    marketReturn: s.market.lastReturn,
    regime: s.market.regime,
    headlines: s.market.headlines,
    notes,
    economicProfit: ep,
    confidenceDelta: s.desk.confidence - confBefore,
  };
  s.lastReport = report;
  // advance
  s.day += 1;
  s.date = nextBusinessDay(s.date);
  if (s.status === 'playing') startDay(s);
  return report;
}

function processCallDue(s: GameState, c: import('../engine/types').Client, note: (t: string, tone?: LogItem['tone']) => void) {
  const mc = c.marginCall!;
  const m = computeMargin(s, c);
  if (m.equity >= m.initial) {
    mc.status = 'met';
    c.marginCall = undefined;
    note(`${c.short}'s margin call cured by market moves.`);
    return;
  }
  const need = m.initial - m.equity;
  const stressed = s.market.regime === 'stressed' || s.market.regime === 'crisis';
  // other prime brokers call the same fund at the same time in stress
  const otherCalls = stressed ? need * ((1 - c.walletShare) / Math.max(0.03, c.walletShare)) * 0.7 : 0;
  const priority = 0.5 + c.relationship / 200; // funds pay PBs they value first
  const share = otherCalls > 0 ? Math.min(1, (need * priority * 1.5) / (need + otherCalls)) : 1;
  const pay = Math.min(need, c.fund.freeCash * share);
  if (pay > 0) {
    deposit(s, c.id, pay, `${c.short}: margin call payment`);
    c.fund.freeCash -= pay;
    mc.paid += pay;
  }
  // fund also de-grosses at Atlas
  const after = computeMargin(s, c);
  if (after.equity < after.initial && after.equity > 0) {
    const frac = Math.min(0.6, c.profile.stressDeleverage * 0.6 + 0.15);
    liquidate(s, c, frac, 'orderly', `${c.short} de-grossing to meet call`);
    rebalanceBorrows(s);
  }
  const fin = computeMargin(s, c);
  if (fin.equity >= fin.maintenance && fin.equity > 0) {
    mc.status = pay >= need ? 'met' : 'partial';
    c.marginCall = undefined;
    note(`${c.short} met its margin call (${fm(pay)} cash${fin.equity < fin.initial ? ', plus selling positions' : ''}).`, 'good');
  } else {
    mc.status = 'failed';
    c.marginCall = undefined;
    s.signals.failedCalls.push(c.id);
    note(`${c.short} FAILED to meet its margin call (paid ${fm(pay)} of ${fm(need)}).`, 'bad');
  }
}

export const PHASES = [
  { name: 'New Desk', blurb: 'One or two clients. Learn every transaction: margin loans, shorts, stock borrow.' },
  { name: 'Growing Franchise', blurb: 'More clients, internalisation, external lenders, funding choices and negotiations.' },
  { name: 'Institutional Prime Broker', blurb: 'Billions of client positions, capital constraints and competitors.' },
  { name: 'Market Stress', blurb: 'Margin disputes, recalls, liquidity squeezes and counterparty failures.' },
  { name: 'Global Franchise', blurb: 'Open-ended: grow, defend and optimise the franchise.' },
];

function headlines(s: GameState): string[] {
  const m = s.market;
  const r = m.lastReturn;
  const h: string[] = [];
  h.push(`US500 ${r >= 0 ? '+' : ''}${(r * 100).toFixed(1)}% · ${regimeLabel(m.regime)} · VIX-style vol ${m.vol.toFixed(0)}`);
  const movers = Object.values(s.securities)
    .filter((x) => x.kind === 'equity')
    .map((x) => ({ id: x.id, r: x.price / x.prevPrice - 1, name: x.name }))
    .sort((a, b) => Math.abs(b.r) - Math.abs(a.r))
    .slice(0, 2);
  for (const mv of movers) if (Math.abs(mv.r) > 0.04) h.push(`${mv.name} ${mv.r > 0 ? 'jumps' : 'slides'} ${(Math.abs(mv.r) * 100).toFixed(0)}%`);
  if (m.repoStressBps > 30) h.push(`Repo markets tight: equity repo +${m.repoStressBps.toFixed(0)}bp, haircuts up`);
  if (s.day === 21) h.push('Short-seller report alleges accounting irregularities at Calder Logistics');
  if (s.day === 22) h.push('SEC opens probe into Calder Logistics; hedge funds de-gross across crowded longs');
  if (s.day === 24) h.push('Kestrel Prime hit by client defaults, CDS widens sharply');
  if (s.day === 25) h.push('Central bank signals liquidity support; equities rebound');
  if (s.day === 15) h.push('Retail traders pile into Quanta Retail calls; heavily shorted names spike');
  return h;
}
