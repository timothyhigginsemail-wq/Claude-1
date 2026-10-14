// Decision events: builders, resolvers and what-if previews. Every option mutates the persistent
// engine state (terms, positions, ledger, funding, relationships) — nothing is cosmetic.

import { accountValue, activeClients, deposit, trade, withdraw } from '../engine/accounts';
import {
  bestCompetitorQuote,
  checkLimits,
  clientTrading,
  closeAccount,
  fundSituation,
  liquidate,
  sourceableUnits,
  termsScore,
  writeOff,
} from '../engine/behavior';
import { deskSummary } from '../engine/analytics';
import { fm, fbps, fpct, fx } from '../engine/format';
import { ACC, clientDebit, post } from '../engine/ledger';
import { borrowTier, clientFee, externalSupply, internalSupply, lenderFee, rebalanceBorrows, utilisation } from '../engine/lending';
import { computeMargin } from '../engine/margin';
import { chance, rand } from '../engine/rng';
import { clientEconomics, effectivePD, stressClient } from '../engine/risk';
import { settleFunding, termRepoTotal } from '../engine/funding';
import type { Client, ClientTerms, GameEvent, GameState } from '../engine/types';
import { generateFund } from './funds';

// ---------------------------------------------------------------- helpers

export function newEvent(s: GameState, partial: Omit<GameEvent, 'id' | 'day' | 'status'>): GameEvent {
  return { id: `E${s.nextId++}`, day: s.day, status: 'pending', ...partial };
}

export function log(s: GameState, text: string, tone: 'good' | 'bad' | 'neutral' = 'neutral') {
  s.log.push({ day: s.day, text, tone });
  if (s.log.length > 400) s.log.splice(0, s.log.length - 400);
}

function rel(c: Client, d: number) {
  c.relationship = Math.max(0, Math.min(100, c.relationship + d));
}

function sigmoid(x: number) {
  return 1 / (1 + Math.exp(-x));
}

/** Re-source borrows and re-run the funding waterfall after any decision. */
export function postAction(s: GameState) {
  rebalanceBorrows(s);
  settleFunding(s);
}

export interface ResolveCtx {
  /** For previews: assume counterparties accept so the impact of the option itself is visible. */
  assumeAccept?: boolean;
  preview?: boolean;
}

function accepts(s: GameState, ctx: ResolveCtx, p: number): boolean {
  if (ctx.assumeAccept) return true;
  return rand(s) < p;
}

/** Banker's read on a probability (imperfect information). */
export function likelihoodLabel(p: number): string {
  if (p > 0.8) return 'Very likely';
  if (p > 0.6) return 'Likely';
  if (p > 0.4) return 'Uncertain';
  if (p > 0.2) return 'Unlikely';
  return 'Very unlikely';
}

function topPositions(s: GameState, c: Client, n = 4): string {
  const rows = Object.entries(c.profile.book)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, n)
    .map(([id, w]) => `${w > 0 ? '+' : '−'}${id} ${(Math.abs(w) * 100).toFixed(0)}%`);
  return rows.join(', ');
}

// ---------------------------------------------------------------- onboarding

export function onboardingAcceptProb(s: GameState, c: Client, terms: ClientTerms, round: number): number {
  const saved = c.terms;
  c.terms = terms;
  const sc = termsScore(s, c);
  c.terms = saved;
  const ask = c.ask ?? {};
  // distance from the fund's ask on the terms it cares most about
  const spreadGap = ((terms.financingSpreadBps - (ask.financingSpreadBps ?? terms.financingSpreadBps)) / 25) * c.profile.priceSensitivity;
  const imGap = ((terms.imMultiplier - (ask.imMultiplier ?? terms.imMultiplier)) / 0.1) * (1 - c.profile.priceSensitivity) * 0.8;
  const lockGap = Math.max(0, (ask.lockupDays ?? 0) - terms.lockupDays) / 30 * 0.3;
  const levGap = Math.max(0, (ask.maxGrossLeverage ?? 0) - terms.maxGrossLeverage) * 0.5;
  const x = 1.4 + sc * 1.5 - spreadGap - imGap - lockGap - levGap + (round > 1 ? 0.4 : 0) + (c.relationship - 50) / 25;
  return sigmoid(x);
}

export function proposalFromAsk(c: Client, day: number): ClientTerms {
  const t = { ...c.terms, feeOverrides: {}, feeMarkups: {}, termsDay: day };
  const a = c.ask ?? {};
  for (const k of Object.keys(a) as (keyof ClientTerms)[]) {
    if (k in t && (a as any)[k] !== undefined) (t as any)[k] = (a as any)[k];
  }
  return t;
}

export function makeOnboarding(s: GameState, c: Client, round = 1): GameEvent {
  const best = bestCompetitorQuote(s, c);
  const comp = s.competitors[best.competitorId];
  const ask = c.ask ?? {};
  const eq = ask.initialEquity ?? 0;
  const gross = eq * c.profile.targetGross;
  const expert = s.difficulty === 'expert';
  // round 1: Atlas standard terms at the client's asked spread (floored); round 2: their counter
  const proposal = round === 1 ? { ...c.terms, financingSpreadBps: Math.max(ask.financingSpreadBps ?? 90, 75), feeOverrides: {}, feeMarkups: {} } : proposalFromAsk(c, s.day);
  return newEvent(s, {
    time: '09:12',
    kind: 'onboarding',
    title: round === 1 ? `New mandate: ${c.name}` : `${c.name} counters`,
    clientId: c.id,
    body:
      round === 1
        ? `${c.pitch}\n\nThey are asking for: SOFR+${ask.financingSpreadBps}bp financing, ${(ask.imMultiplier ?? 1).toFixed(2)}× house margin${ask.lockupDays ? `, a ${ask.lockupDays}-day margin lock-up` : ''}${ask.rehypCapPct !== undefined && ask.rehypCapPct < 1.4 ? `, rehypothecation capped at ${Math.round(ask.rehypCapPct * 100)}% of debit` : ''}${ask.maxGrossLeverage ? `, up to ${ask.maxGrossLeverage}x gross` : ''}. ${comp.name} has quoted them around SOFR+${best.spread}bp.`
        : `${c.name} rejected your first proposal and came back with revised terms (shown as their ask). This is your last round — a second rejection sends the mandate to ${comp.name}.`,
    facts: [
      { label: 'Fund NAV', value: fm(c.fund.nav) },
      { label: 'Equity moving to Atlas', value: fm(eq) },
      { label: 'Strategy', value: c.profile.strategy },
      { label: 'Target gross leverage', value: expert ? `~${Math.round(c.profile.targetGross)}x` : fx(c.profile.targetGross) },
      { label: 'Expected gross at Atlas', value: expert ? `~${fm(Math.round(gross / 1e8) * 1e8)}` : fm(gross) },
      { label: 'Net bias', value: fpct(c.profile.netBias, 0) },
      { label: 'Largest weights', value: topPositions(s, c) },
      { label: 'Internal rating', value: expert ? 'Pending credit review' : `${c.profile.rating} (PD ${fpct(c.profile.basePD, 1)})`, tone: c.profile.rating.startsWith('B') && c.profile.rating !== 'BBB' ? 'warn' : undefined },
      { label: 'Best competing quote', value: `${comp.name}: SOFR+${best.spread}bp` },
    ],
    options: [
      { id: 'propose', label: 'Propose term sheet', detail: 'Send the terms in the term-sheet editor. The fund weighs price, margin leniency, lock-up and rehypothecation limits against its alternatives.', tone: 'primary' },
      { id: 'accept', label: 'Accept their ask', detail: 'Win the mandate on their terms. Fast — but you own the economics and the risk you just agreed to.' },
      { id: 'dd', label: 'Credit due diligence', detail: 'Risk analyst runs stress scenarios, checks the fund\'s other prime brokers and liquidity. Uses analyst capacity.', usesAnalyst: true },
      { id: 'decline', label: 'Decline', detail: 'Pass on the mandate.', tone: 'danger' },
    ],
    data: { clientId: c.id, round, proposal },
    learn: 'onboarding',
  });
}

export function onboard(s: GameState, c: Client, terms: ClientTerms) {
  c.terms = { ...terms, termsDay: s.day, feeOverrides: { ...terms.feeOverrides }, feeMarkups: { ...(terms.feeMarkups ?? {}) } };
  c.status = 'active';
  const eq = c.ask?.initialEquity ?? c.fund.nav * c.walletShare;
  c.walletShare = eq / c.fund.nav;
  deposit(s, c.id, eq, `${c.short}: equity transferred in from previous prime broker`);
  c.fund.anchorEquity = eq;
  // transfer the book in; shorts need Atlas to source a borrow first
  clientTrading(s, c, { pace: 1, autoLocate: true, noChurn: true, noDrift: true });
  rebalanceBorrows(s);
  settleFunding(s);
  c.equityHist = [accountValue(s, c).equity];
}

function onboardingDD(s: GameState, ev: GameEvent): string[] {
  const c = s.clients[ev.data.clientId];
  const clone = cloneState(s);
  const cc = clone.clients[c.id];
  onboard(clone, cc, ev.data.proposal);
  const st = stressClient(clone, cc);
  const e = clientEconomics(clone, cc);
  const av = accountValue(clone, cc);
  const m = computeMargin(clone, cc);
  const largest = Object.entries(cc.positions).map(([id, q]) => ({ id, v: Math.abs(q * clone.securities[id].price * (clone.securities[id].multiplier ?? 1)), q })).sort((a, b) => b.v - a.v)[0];
  const lines = [
    `Credit rating ${c.profile.rating}; benign-market PD ${fpct(c.profile.basePD, 1)}, today ${fpct(effectivePD(clone, cc), 1)}.`,
    `Under your proposed terms the book would be ${fm(av.gmv + av.futGross)} gross on ${fm(av.equity)} equity (${fx(av.leverage)}), margin requirement ${fm(m.initial)}, excess ${fm(m.excess)}.`,
    ...st.map((r) => `${r.name}: client P&L ${fm(r.pnl)}, liquidation cost ${fm(r.liquidationCost)} → Atlas shortfall ${fm(r.shortfall)}`),
    largest ? `Largest position ${largest.id}: ${fm(largest.v)} ≈ ${(largest.v / (0.15 * clone.securities[largest.id].adv)).toFixed(1)} days to exit at 15% of ADV.` : '',
    `Fund liquidity outside prime brokers ≈ ${fm(c.fund.freeCash)}; Atlas would hold ${fpct(c.walletShare, 0)} of its book. Other PBs: ${c.fund.otherPBs.map((o) => s.competitors[o.competitorId].name).join(', ')}.`,
    `Run-rate: revenue ${fm(e.revenue)}, capital ${fm(e.capital)} (${e.binding === 'CCR' ? 'credit' : 'leverage'}-bound), economic profit ${fm(e.economicProfit)}, RoAC ${fpct(e.roac)}.`,
    `Banker's read on acceptance of the current term sheet: ${likelihoodLabel(onboardingAcceptProb(s, c, ev.data.proposal, ev.data.round))}.`,
  ];
  return lines.filter(Boolean);
}

// ---------------------------------------------------------------- financing request

export function makeFinancingRequest(s: GameState, c: Client, amount: number, offerSpread: number, toLev: number): GameEvent {
  const av = accountValue(s, c);
  c.askCooldown.__financing = s.day;
  const debit = clientDebit(s, c.id);
  return newEvent(s, {
    time: '09:12',
    kind: 'financingRequest',
    title: `${c.short} wants ${fm(amount)} more financing`,
    clientId: c.id,
    body: `${c.name} wants to add ${fm(amount)} of margin financing, taking gross leverage from ${fx(av.leverage)} to about ${fx(toLev)}. They are offering SOFR+${offerSpread}bp across the whole debit balance (currently SOFR+${c.terms.financingSpreadBps}bp). More leverage means more revenue — and more gap risk, capital and funding.`,
    facts: [
      { label: 'Current debit', value: fm(debit) },
      { label: 'Requested increase', value: fm(amount) },
      { label: 'Credit limit', value: fm(c.terms.creditLimit) },
      { label: 'Gross leverage', value: `${fx(av.leverage)} → ${fx(toLev)}`, tone: toLev > 5 ? 'warn' : undefined },
      { label: 'Offered spread', value: `SOFR+${offerSpread}bp` },
      { label: 'Current equity', value: fm(av.equity) },
      { label: 'Rating / PD', value: `${c.profile.rating} / ${fpct(effectivePD(s, c), 1)}` },
    ],
    options: [
      { id: 'approve', label: 'Approve', detail: 'Raise the credit limit and leverage cap. Spread applies to the whole debit.', param: { key: 'spread', label: 'Financing spread', min: 30, max: 400, step: 5, value: offerSpread, unit: 'bps' }, tone: 'primary' },
      { id: 'collateral', label: 'Approve with more collateral', detail: 'Approve if they post 10% of the increase as extra equity and accept a +0.15× IM multiplier.' },
      { id: 'partial', label: 'Approve half', detail: 'Halve the increase and the leverage step-up.' },
      { id: 'analyze', label: 'Ask risk for analysis', detail: 'Stress the post-trade book. Uses analyst capacity.', usesAnalyst: true },
      { id: 'decline', label: 'Decline', detail: 'Keep limits unchanged. They will finance it elsewhere.', tone: 'danger' },
    ],
    data: { clientId: c.id, amount, offerSpread, toLev },
    learn: 'margin',
  });
}

function applyFinancing(s: GameState, c: Client, amount: number, toLev: number, spread: number, ctx: ResolveCtx) {
  const av = accountValue(s, c);
  const debit = clientDebit(s, c.id);
  c.terms.financingSpreadBps = spread;
  c.terms.creditLimit = Math.max(c.terms.creditLimit, debit + amount * 1.1);
  c.terms.maxGrossLeverage = Math.max(c.terms.maxGrossLeverage, toLev + 0.3);
  c.terms.termsDay = s.day;
  const curLev = Number.isFinite(av.leverage) ? av.leverage : c.profile.targetGross;
  c.profile.targetGross = Math.max(c.profile.targetGross, toLev * (c.profile.targetGross / Math.max(0.5, curLev)));
  c.fund.anchorEquity = Math.max(0, av.equity);
  clientTrading(s, c, { pace: 1, noChurn: true, noDrift: true });
  void ctx;
}

// ---------------------------------------------------------------- borrow request

export function makeBorrowRequest(s: GameState, c: Client, secId: string, qty: number): GameEvent {
  const sec = s.securities[secId];
  c.askCooldown[secId] = s.day;
  const value = qty * sec.price;
  const internal = internalSupply(s, secId, c.id);
  const intTotal = internal.reduce((a, r) => a + r.value, 0);
  const ext = externalSupply(s, secId);
  const extTotal = ext.reduce((a, r) => a + r.units * sec.price, 0);
  const suggested = Math.round(Math.max(c.terms.gcFeeBps, sec.borrowFeeBps * (1 + c.terms.htbMarkupPct)));
  return newEvent(s, {
    time: '10:43',
    kind: 'borrowRequest',
    title: `${c.short} needs ${fm(value)} of ${secId} to short`,
    clientId: c.id,
    secId,
    body: `${c.name} wants to short ${fm(value)} of ${sec.name} (${borrowTier(sec)}, market fee ${fbps(sec.borrowFeeBps)}, utilisation ${fpct(utilisation(s, secId), 0)}). Under Reg SHO you must locate shares before the sale. Internal supply: ${fm(intTotal)}. External lenders can supply ${fm(extTotal)}. The fund will pay up to about ${fbps(c.profile.maxBorrowFeeBps)} and can go to a competitor for the borrow.`,
    facts: [
      { label: 'Requested', value: `${fm(value)} (${(qty / 1e6).toFixed(2)}m sh)` },
      ...internal.filter((r) => r.value > 1e5).map((r) => ({ label: r.source === 'rehyp' ? `Internal: ${s.clients[r.clientId!].short} rehyp` : 'Internal: Atlas AM programme', value: fm(r.value) })),
      ...ext.slice(0, 4).map((r) => ({ label: `${r.name}`, value: `${fm(r.units * sec.price)} @ ${fbps(r.fee)}${r.recall > 1.2 ? ' · recall-prone' : ''}`, tone: r.recall > 1.2 ? ('warn' as const) : undefined })),
      { label: 'Current client fee', value: fbps(clientFee(s, c, secId)) },
      { label: 'Crowding', value: fpct(sec.crowding, 0), tone: sec.crowding > 0.7 ? 'warn' : undefined },
    ],
    options: [
      { id: 'fill', label: 'Fill: internal first, then cheapest lenders', detail: 'Internalise what you can; borrow the rest from whichever lenders are cheapest today.', param: { key: 'fee', label: 'Fee to client', min: 10, max: 4000, step: 10, value: suggested, unit: 'bps' }, tone: 'primary' },
      { id: 'stable', label: 'Fill using stable lenders only', detail: 'Exclude recall-prone lenders for this name. Costs more, but protects the short (and the client) from recalls.' },
      { id: 'internal', label: 'Internal supply only (partial)', detail: 'Only fill what can be internalised. No external collateral or lender fees.' },
      { id: 'decline', label: 'Decline the locate', detail: 'The fund will source it from another prime broker.', tone: 'danger' },
    ],
    data: { clientId: c.id, secId, qty, suggested },
    learn: 'secLending',
  });
}

function executeShort(s: GameState, c: Client, secId: string, qty: number, fee: number, ctx: ResolveCtx, opts: { internalOnly?: boolean; stable?: boolean }): string {
  const sec = s.securities[secId];
  const competitorFee = sec.borrowFeeBps * 1.15 + 20;
  const maxFee = Math.min(c.profile.maxBorrowFeeBps, competitorFee * (1 + (c.relationship - 50) / 200));
  if (fee > maxFee && !ctx.assumeAccept) {
    rel(c, -2);
    c.borrowFails += 1;
    return `${c.short} declined: ${fbps(fee)} is above what they can get elsewhere (~${fbps(competitorFee)}). They shorted through another prime broker.`;
  }
  if (opts.stable) s.lenderPrefs[secId] = ['keystone', 'ridgefield', 'bluewater'];
  let avail: number;
  if (opts.internalOnly) avail = internalSupply(s, secId, c.id).filter((r) => r.source === 'rehyp').reduce((a, r) => a + r.units, 0);
  else avail = sourceableUnits(s, secId, c.id);
  if (opts.stable) avail = Math.min(avail, internalSupply(s, secId, c.id).reduce((a, r) => a + r.units, 0) + externalSupply(s, secId).filter((r) => !['keystone', 'ridgefield', 'bluewater'].includes(r.lenderId)).reduce((a, r) => a + r.units, 0));
  const q = Math.min(qty, avail);
  // margin check: can the account carry the short?
  const hyp = { ...c.positions, [secId]: (c.positions[secId] ?? 0) - q };
  const lim = checkLimits(s, c, hyp);
  let fillQ = q;
  if (!lim.okMargin || !lim.okLev) {
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 7; i++) {
      const mid = (lo + hi) / 2;
      const ck = checkLimits(s, c, { ...c.positions, [secId]: (c.positions[secId] ?? 0) - q * mid });
      if (ck.okMargin && ck.okLev) lo = mid;
      else hi = mid;
    }
    fillQ = q * lo;
  }
  if (fillQ <= 0) {
    c.borrowFails += 1;
    return 'Nothing could be filled: no locatable supply within the account\'s margin limits.';
  }
  // the agreed fee floats with the market from here: store it as a markup on today's market fee
  if (sec.borrowFeeBps > 50) c.terms.feeMarkups[secId] = Math.max(0.5, fee / sec.borrowFeeBps);
  else c.terms.feeOverrides[secId] = fee;
  trade(s, c.id, secId, -fillQ, `${c.short} short ${secId} (located)`);
  const before = s.alloc.internalCover[secId] ?? 0;
  if (opts.internalOnly) {
    rebalanceBorrows(s, { allowNew: (id) => id !== secId });
  } else rebalanceBorrows(s);
  settleFunding(s);
  const intNow = s.alloc.internalCover[secId] ?? 0;
  rel(c, fillQ >= qty * 0.95 ? 3 : 0);
  if (fillQ < qty * 0.95) c.borrowFails += 0.5;
  const part = fillQ < qty * 0.95 ? ` Partial fill: ${fm(fillQ * sec.price)} of ${fm(qty * sec.price)}.` : '';
  return `Located and shorted ${fm(fillQ * sec.price)} of ${secId} at ${fbps(fee)} (client rebate ${fpct(s.market.sofr - fee / 1e4, 2)}). Internalised cover in ${secId} now ${fm(intNow * sec.price)} (was ${fm(before * sec.price)}).${part}`;
}

// ---------------------------------------------------------------- treasury / funding

export function makeFundingShock(s: GameState, bps: number): GameEvent {
  const d = deskSummary(s);
  const yearly = (d.repo + d.termRepo) * bps / 1e4;
  return newEvent(s, {
    time: '11:30',
    kind: 'fundingShock',
    title: `Treasury: repo funding +${bps}bp`,
    body: `Treasury calls: dealer balance sheets are tight into quarter-end and overnight repo against equity collateral has widened ${bps}bp. Your FTP for unsecured treasury funding is also moving up. At current balances that costs about ${fm(yearly)} a year on repo alone. Decide whether to pass it on, absorb it, change the funding mix or shrink the book.`,
    facts: [
      { label: 'Overnight repo', value: fm(d.repo) },
      { label: 'Term repo', value: fm(d.termRepo) },
      { label: 'Treasury drawn', value: `${fm(d.treasury)} / ${fm(s.desk.facilityLimit)}` },
      { label: 'Repo capacity', value: fm(d.repoCapacity) },
      { label: 'Repo spread now', value: `SOFR+${Math.round(30 + s.market.repoStressBps)}bp (class A)` },
      { label: 'Treasury FTP', value: `SOFR+${Math.round(s.market.ftpSpreadBps)}bp` },
    ],
    options: [
      { id: 'pass', label: 'Pass through to clients', detail: 'Raise every client\'s financing spread. Price-sensitive funds will notice.', param: { key: 'bps', label: 'Spread increase', min: 5, max: 80, step: 5, value: Math.round(bps * 0.6), unit: 'bps' }, tone: 'primary' },
      { id: 'term', label: 'Lock 30-day term repo', detail: 'Term funding at today\'s wider level + 10bp. Protects against further widening and repo counterparties pulling lines.', param: { key: 'amount', label: 'Amount', min: 25e6, max: 400e6, step: 25e6, value: 100e6, unit: '$' } },
      { id: 'treasury', label: 'Shift to treasury facility first', detail: 'Draw unsecured FTP funding before repo. Cheaper only if FTP < repo.' },
      { id: 'shrink', label: 'Shrink the book', detail: 'Cut credit limits 15% and ask clients to de-lever. Less revenue, less funding.' },
      { id: 'absorb', label: 'Absorb it', detail: 'Keep client pricing unchanged.' },
    ],
    data: { bps },
    learn: 'funding',
  });
}

export function makeTermFunding(s: GameState): GameEvent {
  const spread = Math.round(30 + s.market.repoStressBps + 18);
  return newEvent(s, {
    time: '15:05',
    kind: 'termFunding',
    title: 'Treasury offers term funding',
    body: `Treasury can arrange 30-day term repo against your rehypothecated collateral at SOFR+${spread}bp — about ${spread - Math.round(30 + s.market.repoStressBps)}bp over overnight. Term funding is insurance: it does not disappear when repo desks pull back, but you pay for it every day.`,
    facts: [
      { label: 'Overnight repo', value: fm(-s.ledger.balances[ACC.repo] || 0) },
      { label: 'Repo capacity', value: fm(s.alloc.repoCapacity) },
      { label: 'Existing term repo', value: fm(termRepoTotal(s)) },
    ],
    options: [
      { id: 'lock', label: 'Lock term repo', detail: '30 days fixed spread.', param: { key: 'amount', label: 'Amount', min: 25e6, max: 300e6, step: 25e6, value: 75e6, unit: '$' }, tone: 'primary' },
      { id: 'decline', label: 'Stay overnight', detail: 'Cheaper today, exposed to roll risk.' },
    ],
    data: { spread },
    learn: 'funding',
  });
}

export function addTermRepo(s: GameState, amount: number, spreadBps: number, days = 30): string {
  const cap = Math.max(0, s.alloc.repoCapacity - termRepoTotal(s));
  const amt = Math.min(amount, cap);
  if (amt <= 0) return 'Not enough eligible collateral for term repo.';
  post(s, 'funding', `Term repo ${days}d @ SOFR+${spreadBps}bp`, [
    { account: ACC.cash, amount: amt },
    { account: ACC.termRepo, amount: -amt },
  ]);
  s.desk.termRepos.push({ id: `TR${s.nextId++}`, amount: amt, spreadBps, startDay: s.day, maturityDay: s.day + Math.round(days * 5 / 7) });
  settleFunding(s);
  return `Locked ${fm(amt)} of term repo for ${days} days at SOFR+${spreadBps}bp${amt < amount ? ` (limited by eligible collateral)` : ''}.`;
}

// ---------------------------------------------------------------- squeeze

export function makeSqueezeAlert(s: GameState, secId: string): GameEvent | null {
  const sec = s.securities[secId];
  const affected = activeClients(s).filter((c) => (c.positions[secId] ?? 0) < 0);
  if (!affected.length) return null;
  const facts = affected.map((c) => {
    const mv = -(c.positions[secId] ?? 0) * sec.price;
    const m = computeMargin(s, c);
    return { label: `${c.short} short ${fm(mv)}`, value: `excess ${fm(m.excess)}`, tone: m.excess < 0.25 * mv ? ('warn' as const) : undefined };
  });
  const lossAt50 = affected.reduce((a, c) => {
    const mv = -(c.positions[secId] ?? 0) * sec.price;
    const m = computeMargin(s, c);
    return a + Math.max(0, mv * 0.5 - m.equity);
  }, 0);
  const extBorrowed = s.borrows.filter((b) => b.secId === secId).reduce((a, b) => a + b.qty * sec.price, 0);
  return newEvent(s, {
    time: '14:15',
    kind: 'squeezeAlert',
    title: `Risk: short squeeze building in ${secId}`,
    secId,
    urgent: true,
    body: `${sec.name} is up ${fpct(sec.price / sec.prevPrice - 1)} on the day with retail call buying; borrow fee ${fbps(sec.borrowFeeBps)} and lenders are recalling. ${affected.length} client${affected.length > 1 ? 's are' : ' is'} short. You have ${fm(extBorrowed)} borrowed externally that could be recalled. If the stock gaps another 50%, client shortfalls would total about ${fm(lossAt50)}.`,
    facts: [
      ...facts,
      { label: 'External borrow at risk', value: fm(extBorrowed) },
      { label: 'Internal cover', value: fm((s.alloc.internalCover[secId] ?? 0) * sec.price) },
      { label: 'Atlas loss if +50% & defaults', value: fm(lossAt50), tone: lossAt50 > 0 ? 'down' : undefined },
    ],
    options: [
      { id: 'call', label: 'Intraday margin call', detail: 'Demand 15% of short value now from each affected fund. They pay if they have liquidity — or are forced to cover.', tone: 'primary' },
      { id: 'addon', label: `Raise house margin on ${secId} shorts`, detail: 'Add a 25% name-specific add-on. Calls arrive tonight through the normal process.' },
      { id: 'lock', label: 'Lock stable borrow', detail: 'Move the borrow to non-recalling lenders at a premium, protecting clients from buy-ins.' },
      { id: 'analyze', label: 'Ask risk for analysis', detail: 'Scenario analysis by client. Uses analyst capacity.', usesAnalyst: true },
      { id: 'monitor', label: 'Monitor only', detail: 'Squeezes often fade. Or not.' },
    ],
    data: { secId, clients: affected.map((c) => c.id) },
    learn: 'squeeze',
  });
}

// ---------------------------------------------------------------- margin call

export function makeMarginCall(s: GameState, c: Client): GameEvent {
  const m = computeMargin(s, c);
  const av = accountValue(s, c);
  const sit = fundSituation(s, c);
  const worst = Object.entries(c.positions)
    .map(([id, q]) => ({ id, d: q * (s.securities[id].price - s.securities[id].prevPrice) * (s.securities[id].multiplier ?? 1) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 2)
    .filter((x) => x.d < 0)
    .map((x) => `${x.id} ${fm(x.d)}`)
    .join(', ');
  const lockup = c.terms.lockupDays > 0 && s.day - c.terms.termsDay < c.terms.lockupDays;
  return newEvent(s, {
    time: '08:05',
    kind: 'marginCall',
    title: `Margin deficit: ${c.short} ${fm(m.callAmount)}`,
    clientId: c.id,
    urgent: true,
    body: `${c.name}'s equity (${fm(av.equity)}) fell below maintenance (${fm(m.maintenance)}). Restoring to initial requires ${fm(m.callAmount)}. Biggest losses yesterday: ${worst || 'broad-based'}.${lockup ? ` Their ${c.terms.lockupDays}-day margin lock-up stops you changing terms, but not calling under existing terms.` : ''} Their unencumbered liquidity is about ${fm(sit.freeCash)}${s.market.regime === 'crisis' || s.market.regime === 'stressed' ? ' — and other prime brokers are likely calling too' : ''}.`,
    facts: [
      { label: 'Equity at Atlas', value: fm(av.equity) },
      { label: 'Maintenance / initial', value: `${fm(m.maintenance)} / ${fm(m.initial)}` },
      { label: 'Call amount', value: fm(m.callAmount), tone: 'down' },
      { label: 'Gross leverage', value: fx(av.leverage) },
      { label: 'Fund free cash (est.)', value: fm(sit.freeCash) },
      { label: 'Fund NAV / peak', value: `${fm(c.fund.nav)} / ${fm(c.fund.peakNav)}` },
    ],
    options: [
      { id: 'standard', label: 'Issue call (due T+1)', detail: 'Standard: cash or securities by tomorrow, or Atlas may liquidate.', tone: 'primary' },
      { id: 'grace', label: 'Issue call with 3-day grace', detail: 'Goodwill — the fund can raise cash in an orderly way. Prices can move a lot in three days.' },
      { id: 'liquidate', label: 'Liquidate to cure now', detail: 'Sell down positions immediately (market impact, relationship damage) until back to initial margin.', tone: 'danger' },
      { id: 'waive', label: 'Waive (risk exception)', detail: 'No call. Keeps the client happy; logged as a policy exception.' },
    ],
    data: { clientId: c.id, amount: m.callAmount },
    learn: 'marginCall',
  });
}

export function makeMarginDefault(s: GameState, c: Client): GameEvent {
  const sit = fundSituation(s, c);
  const av = accountValue(s, c);
  const m = computeMargin(s, c);
  let liqCost = 0;
  for (const id in c.positions) {
    const sec = s.securities[id];
    const mv = c.positions[id] * sec.price * (sec.multiplier ?? 1);
    liqCost += Math.abs(mv) * (sec.kind === 'future' ? 0.0005 : Math.min(0.25, 0.002 + 0.012 * Math.pow(Math.abs(mv) / (0.15 * sec.adv), 0.6) * Math.max(0.5, sec.idioVol / 0.3)) * 1.6);
  }
  const est = Math.max(0, liqCost - av.equity);
  return newEvent(s, {
    time: '07:40',
    kind: 'marginDefault',
    title: `${c.short} failed to meet margin call`,
    clientId: c.id,
    urgent: true,
    body: `${c.name} has not met its call. Equity at Atlas is ${fm(av.equity)} against a maintenance requirement of ${fm(m.maintenance)}. The fund's NAV is ${fm(c.fund.nav)} on paper, but most of it sits at other prime brokers who are calling too — Atlas only controls the collateral in its own account. A fire-sale would cost roughly ${fm(liqCost)} in market impact, which implies a loss to Atlas of about ${fm(est)} after using all of the client's equity. Anything unrecovered becomes an unsecured legal claim against the fund's estate.`,
    facts: [
      { label: 'Equity at Atlas', value: fm(av.equity), tone: av.equity < 0 ? 'down' : undefined },
      { label: 'Gross positions', value: fm(av.gmv + av.futGross) },
      { label: 'Fire-sale cost (est.)', value: fm(liqCost), tone: 'down' },
      { label: 'Implied Atlas loss now', value: fm(est), tone: est > 0 ? 'down' : undefined },
      { label: 'Fund NAV (all PBs)', value: fm(c.fund.nav) },
      { label: 'Fund free cash', value: fm(sit.freeCash) },
      { label: 'Other PBs', value: c.fund.otherPBs.map((o) => s.competitors[o.competitorId].name).join(', ') },
    ],
    options: [
      { id: 'fire', label: 'Default & liquidate now', detail: 'Declare an event of default, close out everything today. Certain, expensive, ends the relationship.', tone: 'danger' },
      { id: 'orderly', label: 'Default & liquidate over 3 days', detail: 'Lower impact, but you hold market risk on a defaulted book.' },
      { id: 'standstill', label: 'Negotiate a 5-day standstill', detail: 'Take a pledge over the fund\'s unencumbered assets and +200bp. If markets recover, everyone is whole. If not, the hole is deeper.' },
      { id: 'extend', label: 'Extend unsecured credit', detail: 'Convert the deficit into a term loan and keep the client. Maximum relationship, maximum risk.' },
      { id: 'analyze', label: 'Ask risk for recovery analysis', detail: 'Estimate loss distributions and the legal claim. Uses analyst capacity.', usesAnalyst: true },
    ],
    data: { clientId: c.id, liqCost },
    learn: 'default',
  });
}

/** Default close-out: liquidate and record a claim on the estate. */
export function defaultCloseOut(s: GameState, c: Client, fraction: number, speed: 'fire' | 'orderly'): { loss: number; impact: number } {
  const r = liquidate(s, c, fraction, speed, `${c.short} default close-out`);
  rebalanceBorrows(s);
  let loss = 0;
  if (Object.keys(c.positions).length === 0 || fraction >= 1) {
    // remaining credit balance (if any) is returned; any debit is written off
    const av = accountValue(s, c);
    if (av.cash < 0) loss = writeOff(s, c, `${c.short}: unsecured deficit written off after close-out`);
    else if (av.cash > 0) withdraw(s, c.id, av.cash, `${c.short}: surplus returned to fund administrator`);
    c.status = 'defaulted';
    c.closedDay = s.day;
    if (loss > 0) {
      const otherClaims = c.fund.nav * (1 - c.walletShare) * 0.15;
      const estate = Math.max(0, c.fund.freeCash * 0.6 + c.fund.nav * 0.1);
      const recov = Math.max(0.05, Math.min(0.5, estate / Math.max(1, loss + otherClaims)));
      c.claim = { amount: loss, expectedRecovery: recov, resolveDay: s.day + 15 };
    }
    s.signals.liquidations.push({ clientId: c.id, loss });
  }
  settleFunding(s);
  return { loss, impact: r.impactCost };
}

// ---------------------------------------------------------------- recall / reprice

export function makeRecall(s: GameState, contractId: string): GameEvent | null {
  const b = s.borrows.find((x) => x.id === contractId);
  if (!b) return null;
  const sec = s.securities[b.secId];
  const qty = b.qty * (0.4 + rand(s) * 0.6);
  const lender = s.lenders[b.lenderId];
  const shorts = activeClients(s).filter((c) => (c.positions[b.secId] ?? 0) < 0);
  const alt = externalSupply(s, b.secId).filter((r) => r.lenderId !== b.lenderId);
  const altValue = alt.reduce((a, r) => a + r.units * sec.price, 0);
  return newEvent(s, {
    time: '09:47',
    kind: 'recall',
    title: `Recall: ${lender.name} wants ${b.secId} back`,
    secId: b.secId,
    body: `${lender.name} has recalled ${fm(qty * sec.price)} of ${sec.name} (${lender.type.toLowerCase()}${lender.id === 'keystone' ? ', ahead of a proxy vote' : ''}). Shares must be returned by settlement. Clients short: ${shorts.map((c) => c.short).join(', ') || 'none'}. Alternative external supply: ${fm(altValue)} at ${alt[0] ? fbps(alt[0].fee) : 'n/a'}+.`,
    facts: [
      { label: 'Recalled', value: fm(qty * sec.price) },
      { label: 'Market fee', value: fbps(sec.borrowFeeBps) },
      { label: 'Alternative supply', value: fm(altValue), tone: altValue < qty * sec.price ? 'warn' : undefined },
      { label: 'Internal cover', value: fm((s.alloc.internalCover[b.secId] ?? 0) * sec.price) },
    ],
    options: [
      { id: 'resource', label: 'Re-source from other lenders', detail: 'Borrow replacements from the cheapest available lenders.', tone: 'primary' },
      { id: 'stable', label: 'Re-source from stable lenders only', detail: 'Pay up for lenders that rarely recall.' },
      { id: 'buyin', label: 'Buy in the clients', detail: 'Force affected clients to cover the recalled quantity. Cheap for Atlas, unpopular.', tone: 'danger' },
    ],
    data: { contractId, secId: b.secId, lenderId: b.lenderId, qty },
    learn: 'recall',
  });
}

function applyRecall(s: GameState, ev: GameEvent) {
  const b = s.borrows.find((x) => x.id === ev.data.contractId);
  if (!b) return;
  const q = Math.min(b.qty, ev.data.qty);
  b.qty -= q;
  post(s, 'secborrow', `Recall: return ${ev.data.secId} to ${s.lenders[b.lenderId].name}`, [
    { account: ACC.sbc, amount: -q * s.securities[b.secId].price * 1.02 },
    { account: ACC.cash, amount: q * s.securities[b.secId].price * 1.02 },
  ]);
  s.borrows = s.borrows.filter((x) => x.qty > 1e-9);
}

/** Force clients to cover a security pro rata (Reg SHO close-out / recall buy-in). */
export function buyIn(s: GameState, secId: string, units: number, premium = 0.02): { clientId: string; units: number }[] {
  const sec = s.securities[secId];
  const shorts = activeClients(s).filter((c) => (c.positions[secId] ?? 0) < 0);
  const total = shorts.reduce((a, c) => a - (c.positions[secId] ?? 0), 0);
  const out: { clientId: string; units: number }[] = [];
  if (total <= 0) return out;
  for (const c of shorts) {
    const share = -(c.positions[secId] ?? 0) / total;
    const u = Math.min(-(c.positions[secId] ?? 0), units * share);
    if (u <= 0) continue;
    trade(s, c.id, secId, u, `${c.short} buy-in ${secId}`, 0.4, sec.price * (1 + premium));
    rel(c, -4);
    out.push({ clientId: c.id, units: u });
  }
  return out;
}

export function makeReprice(s: GameState, secId: string, from: number, to: number): GameEvent {
  const sec = s.securities[secId];
  const ext = s.borrows.filter((b) => b.secId === secId).reduce((a, b) => a + b.qty * sec.price, 0);
  const shorts = activeClients(s).filter((c) => (c.positions[secId] ?? 0) < 0);
  const overrides = shorts.filter((c) => c.terms.feeOverrides[secId] !== undefined);
  return newEvent(s, {
    time: '10:05',
    kind: 'borrowReprice',
    title: `${secId} borrow repriced ${fbps(from)} → ${fbps(to)}`,
    secId,
    body: `Lenders have repriced open borrows in ${sec.name} from ${fbps(from)} to ${fbps(to)} as utilisation climbs to ${fpct(utilisation(s, secId), 0)}. You have ${fm(ext)} borrowed externally. ${overrides.length ? `${overrides.map((c) => `${c.short} (${fbps(c.terms.feeOverrides[secId])})`).join(', ')} ha${overrides.length > 1 ? 've' : 's'} a fixed fee below the new cost — Atlas pays the difference.` : 'Client fees float with the market, so clients feel the full increase — some will cover, and they will remember who passed it on.'}`,
    facts: [
      { label: 'External borrow', value: fm(ext) },
      { label: 'New market fee', value: fbps(to), tone: 'warn' },
      { label: 'Internal cover', value: fm((s.alloc.internalCover[secId] ?? 0) * sec.price) },
      ...shorts.map((c) => ({ label: `${c.short} pays`, value: fbps(clientFee(s, c, secId)) })),
    ],
    options: [
      { id: 'pass', label: 'Pass the new fee through', detail: 'Remove negotiated fees; clients pay market + markup. Some may cover.', tone: 'primary' },
      { id: 'absorb', label: 'Absorb (honour existing fees)', detail: 'Keep client fees where they are. Good for relationships; the spread may go negative.' },
      { id: 'move', label: 'Move to cheaper lenders', detail: 'Return the repriced borrow and re-source elsewhere if supply exists.' },
    ],
    data: { secId, from, to },
    learn: 'secLending',
  });
}

// ---------------------------------------------------------------- competitor offer

export function makeCompetitorOffer(s: GameState, c: Client): GameEvent {
  const best = bestCompetitorQuote(s, c);
  const comp = s.competitors[best.competitorId];
  const offer = Math.min(c.terms.financingSpreadBps - 10, best.spread);
  c.lastCompetitorDay = s.day;
  const e = clientEconomics(s, c);
  return newEvent(s, {
    time: '13:20',
    kind: 'competitorOffer',
    title: `${comp.name} pitching ${c.short}`,
    clientId: c.id,
    body: `${c.name}'s COO calls: ${comp.name} (${comp.archetype.toLowerCase()}) has offered SOFR+${offer}bp and ${best.marginMult.toFixed(2)}× margin to take over the balances held at Atlas. They'd rather stay — if you can get closer.`,
    facts: [
      { label: 'Your spread', value: `SOFR+${c.terms.financingSpreadBps}bp` },
      { label: `${comp.name} offer`, value: `SOFR+${offer}bp`, tone: 'warn' },
      { label: 'Your IM multiplier', value: `${c.terms.imMultiplier.toFixed(2)}×` },
      { label: 'Their margin', value: `${best.marginMult.toFixed(2)}×` },
      { label: 'Client economic profit', value: fm(e.economicProfit), tone: e.economicProfit < 0 ? 'down' : 'up' },
      { label: 'Client RoAC', value: fpct(e.roac) },
      { label: 'Relationship', value: `${Math.round(c.relationship)}/100` },
    ],
    options: [
      { id: 'match', label: 'Reprice', detail: 'Cut your financing spread.', param: { key: 'spread', label: 'New spread', min: 20, max: c.terms.financingSpreadBps, step: 5, value: offer, unit: 'bps' }, tone: 'primary' },
      { id: 'nonprice', label: 'Compete on service', detail: 'Offer a 30-day margin lock-up and lower the rehypothecation cap to 100%. Costs you flexibility and stock-loan inventory, not spread.' },
      { id: 'decline', label: 'Hold your price', detail: 'Let them decide. Some or all of the balances may move.', tone: 'danger' },
    ],
    data: { clientId: c.id, competitorId: comp.id, offer, marginMult: best.marginMult },
    learn: 'competition',
  });
}

// ---------------------------------------------------------------- give-up

const EBS = ['Kepler Execution', 'Northbank Securities', 'Delta Agency Brokers', 'Stanhope Morrow (execution desk)'];

export function makeGiveUp(s: GameState, c: Client): GameEvent | null {
  const ids = Object.keys(c.profile.book).filter((id) => s.securities[id].kind === 'equity' && c.profile.book[id] > 0);
  if (!ids.length) return null;
  const secId = ids[Math.floor(rand(s) * ids.length)];
  const sec = s.securities[secId];
  const av = accountValue(s, c);
  const value = Math.max(5e6, av.equity * (0.08 + rand(s) * 0.12));
  const qty = value / sec.price;
  const eb = EBS[Math.floor(rand(s) * EBS.length)];
  const hyp = { ...c.positions, [secId]: (c.positions[secId] ?? 0) + qty };
  const lim = checkLimits(s, c, hyp);
  return newEvent(s, {
    time: '16:10',
    kind: 'giveUp',
    title: `Give-up: ${c.short} bought ${fm(value)} ${secId} via ${eb}`,
    clientId: c.id,
    secId,
    body: `${c.name} executed a ${fm(value)} buy of ${sec.name} with ${eb} and wants it given up to Atlas for clearing, settlement and financing. ${eb} carried the execution risk; once you accept, Atlas becomes responsible for settling with ${eb} (paying ${fm(value)} at settlement whether or not the client pays), then finances the position as a margin loan and carries the client credit risk.`,
    facts: [
      { label: 'Trade', value: `Buy ${(qty / 1e3).toFixed(0)}k ${secId} @ ${sec.price.toFixed(2)}` },
      { label: 'Settlement obligation', value: fm(value) },
      { label: 'Post-trade margin', value: lim.okMargin ? `OK (excess ${fm(lim.margin.excess)})` : `Short ${fm(-lim.margin.excess)}`, tone: lim.okMargin ? undefined : 'down' },
      { label: 'Post-trade leverage', value: fx(lim.leverage) },
      { label: 'Give-up fee', value: '1.5bp + clearing' },
    ],
    options: [
      { id: 'accept', label: 'Accept the give-up', detail: 'Clear, settle and finance it.', tone: 'primary' },
      { id: 'conditional', label: 'Accept only if margin is OK', detail: 'Accept if the account stays within initial margin; otherwise DK (don\'t know) the trade.' },
      { id: 'reject', label: 'Reject (DK)', detail: 'The trade fails back to the executing broker and the client.', tone: 'danger' },
    ],
    data: { clientId: c.id, secId, qty, eb, okMargin: lim.okMargin && lim.okLev && lim.okDebit },
    learn: 'giveUp',
  });
}

// ---------------------------------------------------------------- redemption

export function makeRedemption(s: GameState, c: Client): GameEvent {
  const m = computeMargin(s, c);
  const amount = Math.min(c.fund.redemptionsPending * c.walletShare * 1.5, Math.max(0, m.excess));
  return newEvent(s, {
    time: '12:00',
    kind: 'redemption',
    title: `${c.short} faces redemptions`,
    clientId: c.id,
    body: `After a ${fpct(-c.fund.recentReturn)} drawdown, ${c.name}'s investors have submitted ${fm(c.fund.redemptionsPending)} of redemptions. The fund wants to withdraw ${fm(amount)} of excess equity from Atlas. Withdrawing excess raises leverage at Atlas unless they cut positions too.`,
    facts: [
      { label: 'Redemptions', value: fm(c.fund.redemptionsPending), tone: 'down' },
      { label: 'Requested withdrawal', value: fm(amount) },
      { label: 'Excess margin', value: fm(m.excess) },
      { label: 'Fund free cash', value: fm(c.fund.freeCash) },
    ],
    options: [
      { id: 'allow', label: 'Release the excess', detail: 'Contractually it is theirs. Leverage at Atlas rises toward the limit.', tone: 'primary' },
      { id: 'delever', label: 'Release, require de-leveraging', detail: 'Release cash but require a 15% cut in gross at Atlas.' },
      { id: 'restrict', label: 'Release only half', detail: 'Use your discretion under the agreement. Protects Atlas; signals distrust.', tone: 'danger' },
    ],
    data: { clientId: c.id, amount },
    learn: 'redemption',
  });
}

// ---------------------------------------------------------------- management review

export function makeReview(s: GameState): GameEvent {
  const d = deskSummary(s);
  return newEvent(s, {
    time: '17:30',
    kind: 'managementReview',
    title: 'Management review with the CFO',
    urgent: true,
    body: `Quarterly-style check-in. Senior management looks at risk-adjusted returns, capital use, liquidity and franchise momentum. Confidence in you: ${Math.round(s.desk.confidence)}/100. You can ask for more capital and funding — they will say yes only if the numbers earn it.`,
    facts: [
      { label: 'Revenue run-rate', value: fm(d.revenueRunRate) },
      { label: 'Economic profit run-rate', value: fm(d.economicProfitRunRate), tone: d.economicProfitRunRate < 0 ? 'down' : 'up' },
      { label: 'RoAC', value: fpct(d.roac) },
      { label: 'Capital used', value: `${fm(d.capitalUsed)} / ${fm(d.allocated)}`, tone: d.capitalUtil > 0.9 ? 'warn' : undefined },
      { label: 'Liquidity coverage', value: fx(d.lcr, 2), tone: d.lcr < 1 ? 'down' : undefined },
      { label: 'Cumulative EP', value: fm(s.cumEP) },
    ],
    options: [
      { id: 'capital', label: 'Request +$50m capital and +$150m facility', detail: 'Granted if returns justify it; asking with weak numbers costs credibility.', tone: 'primary' },
      { id: 'facility', label: 'Request +$250m treasury facility only', detail: 'Funding headroom without new capital.' },
      { id: 'steady', label: 'No new resources', detail: 'Show discipline.' },
    ],
    data: {},
    learn: 'capital',
  });
}

// ---------------------------------------------------------------- counterparty news & crowding

export function makeCounterpartyNews(s: GameState, competitorId: string): GameEvent {
  const comp = s.competitors[competitorId];
  return newEvent(s, {
    time: '07:55',
    kind: 'counterpartyNews',
    title: `${comp.name} in trouble`,
    urgent: false,
    body: `${comp.name} has taken large losses on hedge-fund defaults; its CDS has blown out and clients are pulling free credits and moving positions. Its funds need a new prime broker — fast. Flight-to-quality is an opportunity for balance-sheet-strong PBs, but onboarding stressed funds in a crisis is how risk sneaks in.`,
    facts: [
      { label: 'Competitor health', value: fpct(comp.health, 0), tone: 'down' },
      { label: 'Your capital used', value: fpct(deskSummary(s).capitalUtil, 0) },
    ],
    options: [
      { id: 'pursue', label: 'Pursue displaced clients', detail: 'Two funds will approach for onboarding.', tone: 'primary' },
      { id: 'selective', label: 'Be selective', detail: 'Take one meeting.' },
      { id: 'aside', label: 'Stand aside', detail: 'Protect the balance sheet.' },
    ],
    data: { competitorId },
    learn: 'competition',
  });
}

export function makeCrowding(s: GameState): GameEvent | null {
  // names held long or short by 2+ clients
  const hold: Record<string, { long: string[]; short: string[]; v: number }> = {};
  for (const c of activeClients(s)) {
    for (const id in c.positions) {
      const sec = s.securities[id];
      if (sec.kind !== 'equity') continue;
      const q = c.positions[id];
      hold[id] ??= { long: [], short: [], v: 0 };
      (q > 0 ? hold[id].long : hold[id].short).push(c.short);
      hold[id].v += Math.abs(q * sec.price);
    }
  }
  const crowded = Object.entries(hold)
    .filter(([id, h]) => (h.long.length >= 2 || h.short.length >= 2) && s.securities[id].crowding > 0.6)
    .sort((a, b) => b[1].v - a[1].v)
    .slice(0, 4);
  if (crowded.length < 2) return null;
  return newEvent(s, {
    time: '15:40',
    kind: 'crowding',
    title: 'Risk: crowded positions across your book',
    body: `Several clients hold the same crowded trades. In a de-grossing, they will all sell (or cover) at once — and your house model treats each account in isolation. Consider raising desk-wide margin parameters before markets force the issue.`,
    facts: crowded.map(([id, h]) => ({ label: id, value: `${h.long.length ? 'L: ' + h.long.join('/') : ''}${h.long.length && h.short.length ? ' · ' : ''}${h.short.length ? 'S: ' + h.short.join('/') : ''} (${fm(h.v)})` })),
    options: [
      { id: 'conc', label: 'Raise concentration add-on to 25%', detail: 'Desk-wide. Margin rises on concentrated names for every client.', tone: 'primary' },
      { id: 'shock', label: 'Raise market shock to 15%', detail: 'Desk-wide. Directional books need more margin.' },
      { id: 'none', label: 'No change', detail: 'Keep terms competitive.' },
    ],
    data: {},
    learn: 'crowding',
  });
}

// ---------------------------------------------------------------- resolution

export function resolveEvent(s: GameState, ev: GameEvent, optionId: string, param?: number, ctx: ResolveCtx = {}): string {
  const opt = ev.options.find((o) => o.id === optionId);
  if (!opt) throw new Error(`Unknown option ${optionId}`);
  if (opt.usesAnalyst) {
    if (s.desk.analystUsed >= s.desk.analystCapacity && !ctx.preview) return 'No analyst capacity left today.';
    s.desk.analystUsed++;
    ev.analysis = analyse(s, ev);
    return 'Analysis added.';
  }
  const c = ev.clientId ? s.clients[ev.clientId] : undefined;
  const value = param ?? opt.param?.value;
  let out = '';
  switch (ev.kind) {
    case 'onboarding': {
      const cl = c!;
      if (optionId === 'decline') {
        cl.status = 'declined';
        out = `You passed on ${cl.name}.`;
        break;
      }
      const terms: ClientTerms = optionId === 'accept' ? proposalFromAsk(cl, s.day) : { ...ev.data.proposal, termsDay: s.day };
      const p = optionId === 'accept' ? 1 : onboardingAcceptProb(s, cl, terms, ev.data.round);
      if (accepts(s, ctx, p)) {
        onboard(s, cl, terms);
        cl.relationship = 50 + Math.round(p * 15);
        const av = accountValue(s, cl);
        out = `${cl.name} signed. ${fm(av.equity)} of equity and ${fm(av.gmv + av.futGross)} of gross positions transferred in at SOFR+${terms.financingSpreadBps}bp, ${terms.imMultiplier.toFixed(2)}× house margin.`;
        log(s, `Onboarded ${cl.name}`, 'good');
      } else if (ev.data.round < 2) {
        const ask = cl.ask ?? {};
        cl.ask = {
          ...ask,
          financingSpreadBps: Math.round(((ask.financingSpreadBps ?? terms.financingSpreadBps) + terms.financingSpreadBps) / 2 / 5) * 5,
          imMultiplier: Math.round((((ask.imMultiplier ?? 1) + terms.imMultiplier) / 2) * 20) / 20,
          lockupDays: Math.round(((ask.lockupDays ?? 0) + terms.lockupDays) / 2),
        };
        s.scheduled.push({ day: s.day + 1, kind: 'onboardingRound2', clientId: cl.id, data: {} });
        out = `${cl.name} turned the term sheet down but are still talking — expect a counter-proposal tomorrow.`;
      } else {
        cl.status = 'declined';
        const best = bestCompetitorQuote(s, cl);
        out = `${cl.name} walked and signed with ${s.competitors[best.competitorId].name}.`;
        log(s, `Lost mandate: ${cl.name}`, 'bad');
      }
      break;
    }
    case 'financingRequest': {
      const cl = c!;
      const { amount, offerSpread, toLev } = ev.data;
      if (optionId === 'decline') {
        rel(cl, -8);
        cl.satisfaction -= 0.2;
        cl.walletShare *= 0.92;
        out = `Declined. ${cl.short} will finance the extra leverage elsewhere and has trimmed balances at Atlas.`;
        break;
      }
      if (optionId === 'approve') {
        const spread = value ?? offerSpread;
        const p = spread <= offerSpread ? 1 : sigmoid(2 - ((spread - offerSpread) / 15) * (0.5 + cl.profile.priceSensitivity));
        if (!accepts(s, ctx, p)) {
          rel(cl, -4);
          out = `${cl.short} rejected SOFR+${spread}bp and drew the financing at another PB.`;
          break;
        }
        applyFinancing(s, cl, amount, toLev, spread, ctx);
        rel(cl, 4);
        out = `Approved ${fm(amount)} at SOFR+${spread}bp. ${cl.short} is levering up today.`;
      } else if (optionId === 'collateral') {
        if (!accepts(s, ctx, 0.75 - cl.profile.priceSensitivity * 0.2)) {
          rel(cl, -3);
          out = `${cl.short} wouldn't accept the extra margin; the trade went elsewhere.`;
          break;
        }
        const extra = amount * 0.1;
        deposit(s, cl.id, Math.min(extra, cl.fund.freeCash), `${cl.short}: additional collateral posted`);
        cl.fund.freeCash = Math.max(0, cl.fund.freeCash - extra);
        cl.terms.imMultiplier += 0.15;
        applyFinancing(s, cl, amount, toLev, Math.max(offerSpread, cl.terms.financingSpreadBps), ctx);
        rel(cl, 1);
        out = `Approved with ${fm(extra)} of extra collateral and a ${cl.terms.imMultiplier.toFixed(2)}× multiplier.`;
      } else if (optionId === 'partial') {
        const av = accountValue(s, cl);
        applyFinancing(s, cl, amount / 2, (av.leverage + toLev) / 2, Math.max(offerSpread, cl.terms.financingSpreadBps), ctx);
        rel(cl, -1);
        out = `Approved ${fm(amount / 2)}. ${cl.short} placed the rest elsewhere.`;
      }
      break;
    }
    case 'borrowRequest': {
      const cl = c!;
      const { secId, qty, suggested } = ev.data;
      if (optionId === 'decline') {
        cl.borrowFails += 1;
        rel(cl, -3);
        out = `Declined the locate. ${cl.short} shorted ${secId} through another prime broker.`;
        break;
      }
      const fee = optionId === 'fill' ? value ?? suggested : suggested;
      out = executeShort(s, cl, secId, qty, fee, ctx, { internalOnly: optionId === 'internal', stable: optionId === 'stable' });
      break;
    }
    case 'fundingShock': {
      if (optionId === 'pass') {
        const bps = value ?? 20;
        for (const cl of activeClients(s)) {
          cl.terms.financingSpreadBps += bps;
          cl.satisfaction -= (bps / 60) * cl.profile.priceSensitivity;
          rel(cl, -2);
        }
        out = `All clients repriced +${bps}bp. Price-sensitive funds are unhappy.`;
      } else if (optionId === 'term') {
        out = addTermRepo(s, value ?? 100e6, Math.round(30 + s.market.repoStressBps + 10));
      } else if (optionId === 'treasury') {
        s.desk.policy.repoFirst = false;
        out = 'Funding policy changed: treasury facility first, repo second.';
      } else if (optionId === 'shrink') {
        for (const cl of activeClients(s)) {
          cl.terms.creditLimit *= 0.85;
          cl.profile.targetGross *= 0.9;
          rel(cl, -4);
          cl.satisfaction -= 0.15;
        }
        out = 'Credit limits cut 15%; clients are de-levering over the coming days.';
      } else out = 'Absorbed. Margins compress until funding normalises.';
      break;
    }
    case 'termFunding': {
      out = optionId === 'lock' ? addTermRepo(s, value ?? 75e6, ev.data.spread) : 'Stayed in overnight repo.';
      break;
    }
    case 'squeezeAlert': {
      const secId = ev.data.secId as string;
      const sec = s.securities[secId];
      if (optionId === 'call') {
        const parts: string[] = [];
        for (const id of ev.data.clients as string[]) {
          const cl = s.clients[id];
          if (cl.status !== 'active') continue;
          const need = 0.15 * -(cl.positions[secId] ?? 0) * sec.price;
          if (need <= 0) continue;
          const pay = Math.min(need, cl.fund.freeCash * 0.7);
          if (pay > 0) {
            deposit(s, id, pay, `${cl.short}: intraday margin call (${secId} squeeze)`);
            cl.fund.freeCash -= pay;
          }
          if (pay < need) {
            const coverUnits = Math.min(-(cl.positions[secId] ?? 0), ((need - pay) / 0.15) / sec.price);
            trade(s, id, secId, coverUnits, `${cl.short} forced cover (${secId})`, 0.4, sec.price * 1.03);
            parts.push(`${cl.short} paid ${fm(pay)} and covered ${fm(coverUnits * sec.price)}`);
          } else parts.push(`${cl.short} paid ${fm(pay)}`);
          rel(cl, -4);
        }
        out = `Intraday calls: ${parts.join('; ') || 'nothing due'}.`;
      } else if (optionId === 'addon') {
        s.desk.nameAddons[secId] = 0.25;
        out = `House margin on ${secId} shorts raised by 25% of short value. Deficits will be called tonight.`;
      } else if (optionId === 'lock') {
        s.lenderPrefs[secId] = ['keystone', 'ridgefield', 'bluewater'];
        // return borrows from recall-prone lenders and re-source
        for (const b of s.borrows.filter((x) => x.secId === secId && s.lenderPrefs[secId].includes(x.lenderId))) {
          post(s, 'secborrow', `Return ${secId} to ${s.lenders[b.lenderId].name} (moving to stable lender)`, [
            { account: ACC.sbc, amount: -b.qty * sec.price * 1.02 },
            { account: ACC.cash, amount: b.qty * sec.price * 1.02 },
          ]);
          b.qty = 0;
        }
        s.borrows = s.borrows.filter((x) => x.qty > 0);
        const r = rebalanceBorrows(s);
        const short = r.shortfall[secId] ?? 0;
        out = `Moved ${secId} borrows to stable lenders${short > 0 ? `; ${fm(short * sec.price)} could not be replaced and will be bought in` : ''}.`;
        if (short > 0) buyIn(s, secId, short, 0.04);
      } else out = 'Monitoring.';
      break;
    }
    case 'marginCall': {
      const cl = c!;
      const amount = ev.data.amount as number;
      if (optionId === 'standard' || optionId === 'grace') {
        cl.marginCall = { id: ev.id, amount, issuedDay: s.day, dueDay: s.day + (optionId === 'grace' ? 3 : 1), status: 'open', paid: 0 };
        if (optionId === 'grace') rel(cl, 3);
        out = `Call for ${fm(amount)} issued, due ${optionId === 'grace' ? 'in 3 days' : 'tomorrow'}.`;
      } else if (optionId === 'liquidate') {
        const m = computeMargin(s, cl);
        const frac = Math.min(1, (m.callAmount / Math.max(1, m.initial)) * 1.3 + 0.05);
        const r = liquidate(s, cl, frac, 'fire', `${cl.short} margin liquidation`);
        rel(cl, -18);
        cl.satisfaction -= 0.5;
        out = `Sold down ${fpct(frac, 0)} of ${cl.short}'s book (impact cost ${fm(r.impactCost)} borne by the client). Relationship badly damaged.`;
      } else {
        rel(cl, 3);
        s.desk.compliance = Math.max(0, s.desk.compliance - 4);
        out = `Waived. Logged as a risk-policy exception (compliance standing ${Math.round(s.desk.compliance)}).`;
      }
      break;
    }
    case 'marginDefault': {
      const cl = c!;
      if (optionId === 'fire') {
        const r = defaultCloseOut(s, cl, 1, 'fire');
        out = `Event of default declared. Book liquidated (impact ${fm(r.impact)}). ${r.loss > 0 ? `Atlas loss ${fm(r.loss)} — claim filed against the estate.` : 'Collateral covered the exposure: no loss to Atlas.'}`;
        log(s, `${cl.short} defaulted; loss ${fm(r.loss)}`, r.loss > 0 ? 'bad' : 'neutral');
      } else if (optionId === 'orderly') {
        cl.marginCall = undefined;
        s.scheduled.push({ day: s.day, kind: 'orderlyLiquidation', clientId: cl.id, data: { remaining: 3 } });
        cl.status = 'active';
        cl.profile.targetGross = 0;
        out = 'Event of default declared. Liquidating a third of the book at each of the next three closes.';
      } else if (optionId === 'standstill') {
        cl.terms.financingSpreadBps += 200;
        cl.marginCall = { id: ev.id, amount: computeMargin(s, cl).callAmount, issuedDay: s.day, dueDay: s.day + 5, status: 'open', paid: 0 };
        rel(cl, 6);
        out = 'Standstill agreed: 5 days, +200bp, pledge over unencumbered assets. You are now long the outcome.';
      } else if (optionId === 'extend') {
        cl.marginCall = undefined;
        cl.terms.imMultiplier = Math.max(0.5, computeMargin(s, cl).equity / Math.max(1, computeMargin(s, cl).houseInitial / cl.terms.imMultiplier) * 0.95);
        cl.terms.creditLimit = Math.max(cl.terms.creditLimit, clientDebit(s, cl.id) * 1.05);
        rel(cl, 15);
        s.desk.compliance = Math.max(0, s.desk.compliance - 10);
        out = `Margin terms relaxed to ${cl.terms.imMultiplier.toFixed(2)}× so the account is compliant. ${cl.short} survives at Atlas — on your credit.`;
      }
      break;
    }
    case 'recall': {
      applyRecall(s, ev);
      const secId = ev.data.secId as string;
      const sec = s.securities[secId];
      if (optionId === 'buyin') {
        const r = buyIn(s, secId, ev.data.qty, 0.02);
        out = `Bought in ${r.map((x) => `${s.clients[x.clientId].short} ${fm(x.units * sec.price)}`).join(', ') || 'nobody (no shorts)'}.`;
      } else {
        const r = rebalanceBorrows(s, { excludeLenders: optionId === 'stable' ? [ev.data.lenderId, 'keystone', 'ridgefield'] : [ev.data.lenderId] });
        const short = r.shortfall[secId] ?? 0;
        if (short > 0) {
          buyIn(s, secId, short, 0.03);
          out = `Re-sourced what was available; ${fm(short * sec.price)} could not be found and clients were bought in.`;
        } else out = `Re-sourced ${fm((r.borrowed[secId] ?? 0) * sec.price)} from other lenders at ${fbps(sec.borrowFeeBps)}+.`;
      }
      break;
    }
    case 'borrowReprice': {
      const secId = ev.data.secId as string;
      if (optionId === 'pass') {
        let n = 0;
        for (const cl of activeClients(s)) {
          if ((cl.positions[secId] ?? 0) >= 0) continue;
          if (cl.terms.feeOverrides[secId] !== undefined || (cl.terms.feeMarkups[secId] ?? 2) < 1 + cl.terms.htbMarkupPct) {
            delete cl.terms.feeOverrides[secId];
            delete cl.terms.feeMarkups[secId];
            n++;
          }
          cl.satisfaction -= 0.1;
        }
        out = `Clients now pay the new market fee plus markup${n ? ` (${n} negotiated fee${n === 1 ? '' : 's'} reset)` : ''}. Expect some covering.`;
      } else if (optionId === 'absorb') {
        for (const cl of activeClients(s)) if ((cl.positions[secId] ?? 0) < 0) {
          cl.terms.feeOverrides[secId] = cl.terms.feeOverrides[secId] ?? Math.round(ev.data.from * (cl.terms.feeMarkups[secId] ?? 1 + cl.terms.htbMarkupPct));
          rel(cl, 3);
        }
        out = 'Client fees fixed at the old level. Clients appreciate it — Atlas now carries the borrow-cost risk in this name.';
      } else {
        const expensive = Object.keys(s.lenders).filter((l) => lenderFee(s, l, secId) > s.securities[secId].borrowFeeBps);
        s.lenderPrefs[secId] = expensive;
        for (const b of s.borrows.filter((x) => x.secId === secId && expensive.includes(x.lenderId))) {
          const px = s.securities[secId].price;
          post(s, 'secborrow', `Return ${secId} to ${s.lenders[b.lenderId].name} (repriced)`, [
            { account: ACC.sbc, amount: -b.qty * px * 1.02 },
            { account: ACC.cash, amount: b.qty * px * 1.02 },
          ]);
          b.qty = 0;
        }
        s.borrows = s.borrows.filter((x) => x.qty > 0);
        const r = rebalanceBorrows(s);
        const short = r.shortfall[secId] ?? 0;
        if (short > 0) {
          delete s.lenderPrefs[secId];
          rebalanceBorrows(s);
        }
        out = `Moved borrow to cheaper lenders${short > 0 ? ' where supply allowed; the rest stayed with expensive lenders' : ''}.`;
      }
      break;
    }
    case 'competitorOffer': {
      const cl = c!;
      if (optionId === 'match') {
        cl.terms.financingSpreadBps = value ?? ev.data.offer;
        cl.satisfaction += 0.3;
        rel(cl, 3);
        out = `Repriced ${cl.short} to SOFR+${cl.terms.financingSpreadBps}bp. They're staying.`;
      } else if (optionId === 'nonprice') {
        cl.terms.lockupDays = Math.max(cl.terms.lockupDays, 30);
        cl.terms.termsDay = s.day;
        cl.terms.rehypCapPct = Math.min(cl.terms.rehypCapPct, 1.0);
        const p = 0.45 + (1 - cl.profile.priceSensitivity) * 0.5;
        if (accepts(s, ctx, p)) {
          rel(cl, 6);
          cl.satisfaction += 0.2;
          out = `${cl.short} values the lock-up and asset protection. They're staying at the current spread.`;
        } else {
          cl.walletShare *= 0.6;
          rel(cl, -5);
          out = `${cl.short} took the lock-up — and still moved 40% of balances to ${s.competitors[ev.data.competitorId].name}.`;
        }
      } else {
        const p = 0.25 + (1 - cl.profile.priceSensitivity) * 0.5 + (cl.relationship - 50) / 150;
        if (accepts(s, ctx, p) && !ctx.preview) {
          rel(cl, -2);
          out = `${cl.short} stayed. Your price held.`;
        } else if (chance(s, 0.4)) {
          closeAccount(s, cl, `${cl.short}: account transferred to ${s.competitors[ev.data.competitorId].name}`);
          rebalanceBorrows(s);
          cl.status = 'exited';
          cl.closedDay = s.day;
          out = `${cl.short} moved its entire account to ${s.competitors[ev.data.competitorId].name}.`;
          log(s, `${cl.name} left for ${s.competitors[ev.data.competitorId].name}`, 'bad');
        } else {
          cl.walletShare *= 0.55;
          rel(cl, -6);
          out = `${cl.short} moved roughly half its balances to ${s.competitors[ev.data.competitorId].name}.`;
        }
      }
      break;
    }
    case 'giveUp': {
      const cl = c!;
      const { secId, qty, eb, okMargin } = ev.data;
      if (optionId === 'reject' || (optionId === 'conditional' && !okMargin)) {
        rel(cl, optionId === 'reject' ? -4 : -2);
        out = `DK'd. The trade fails back to ${eb}; ${cl.short} must settle it elsewhere.`;
        break;
      }
      trade(s, cl.id, secId, qty, `${cl.short} give-up from ${eb}`, 1.9);
      rel(cl, 2);
      out = `Accepted. Atlas settles ${fm(qty * s.securities[secId].price)} with ${eb} and finances the position.`;
      break;
    }
    case 'redemption': {
      const cl = c!;
      const amount = ev.data.amount as number;
      cl.fund.redemptionsPending = Math.max(0, cl.fund.redemptionsPending - amount / Math.max(0.01, cl.walletShare));
      if (optionId === 'allow') {
        withdraw(s, cl.id, amount, `${cl.short}: excess equity withdrawn (redemptions)`);
        rel(cl, 3);
        out = `Released ${fm(amount)}.`;
      } else if (optionId === 'delever') {
        withdraw(s, cl.id, amount, `${cl.short}: excess equity withdrawn (redemptions)`);
        cl.profile.targetGross *= 0.85;
        clientTrading(s, cl, { pace: 0.6, noChurn: true, noDrift: true });
        out = `Released ${fm(amount)}; ${cl.short} cut gross at Atlas.`;
      } else {
        withdraw(s, cl.id, amount / 2, `${cl.short}: partial withdrawal (Atlas discretion)`);
        rel(cl, -10);
        cl.satisfaction -= 0.3;
        out = `Released ${fm(amount / 2)}. ${cl.short}'s CFO is furious and calling other prime brokers.`;
      }
      cl.fund.freeCash += amount;
      break;
    }
    case 'managementReview': {
      const d = deskSummary(s);
      s.desk.lastReviewDay = s.day;
      const strong = d.roac > 0.1 && s.desk.confidence > 50 && d.emergency <= 0;
      if (optionId === 'capital') {
        if (strong || ctx.assumeAccept) {
          s.desk.allocatedCapital += 50e6;
          s.desk.facilityLimit += 150e6;
          s.desk.opexPerYear *= 1.15;
          post(s, 'capital', 'Additional capital allocated', [
            { account: ACC.cash, amount: 50e6 },
            { account: ACC.capital, amount: -50e6 },
          ]);
          s.desk.confidence += 2;
          out = 'Approved: +$50m capital, +$150m facility. Headcount grows (opex +15%). Expectations rise too.';
        } else {
          s.desk.confidence -= 5;
          out = `Denied. "Show me returns above the hurdle first." (RoAC ${fpct(d.roac)})`;
        }
      } else if (optionId === 'facility') {
        if (s.desk.confidence > 35 || ctx.assumeAccept) {
          s.desk.facilityLimit += 250e6;
          out = 'Treasury facility increased by $250m.';
        } else out = 'Treasury declined: confidence in the desk is too low.';
      } else {
        s.desk.confidence += 3;
        out = 'Management notes your discipline.';
      }
      break;
    }
    case 'counterpartyNews': {
      const n = optionId === 'pursue' ? 2 : optionId === 'selective' ? 1 : 0;
      const used = new Set(Object.values(s.clients).map((x) => x.name));
      for (let i = 0; i < n; i++) {
        const f = generateFund(s, s.day + 1 + i, used, { displacedFrom: s.competitors[ev.data.competitorId].name });
        used.add(f.name);
        s.clients[f.id] = f;
      }
      out = n ? `${n} displaced fund${n > 1 ? 's' : ''} will come in for onboarding meetings.` : 'Standing aside.';
      break;
    }
    case 'crowding': {
      if (optionId === 'conc') {
        s.desk.concAddonRate = 0.25;
        out = 'Concentration add-on raised to 25% desk-wide.';
      } else if (optionId === 'shock') {
        s.desk.houseMarketShock = 0.15;
        out = 'House market shock raised to 15% desk-wide.';
      } else out = 'No change.';
      break;
    }
    default:
      out = 'Noted.';
  }
  postAction(s);
  ev.status = 'resolved';
  ev.chosen = optionId;
  ev.resolution = out;
  if (!ctx.preview) log(s, `${ev.title}: ${out}`, 'neutral');
  return out;
}

/** Default handling for events left pending at the close. */
export function expireEvent(s: GameState, ev: GameEvent): void {
  const defaults: Partial<Record<string, string>> = {
    onboarding: '__walk',
    financingRequest: 'decline',
    borrowRequest: 'decline',
    fundingShock: 'absorb',
    termFunding: 'decline',
    squeezeAlert: 'monitor',
    marginCall: 'standard',
    marginDefault: 'fire',
    recall: 'resource',
    borrowReprice: 'pass',
    competitorOffer: 'decline',
    giveUp: 'accept',
    redemption: 'allow',
    managementReview: 'steady',
    counterpartyNews: 'aside',
    crowding: 'none',
  };
  const d = defaults[ev.kind];
  if (d === '__walk') {
    const c = s.clients[ev.clientId!];
    c.status = 'declined';
    ev.status = 'expired';
    ev.resolution = `No response — ${c.name} signed elsewhere.`;
    log(s, ev.resolution, 'bad');
    return;
  }
  if (d && ev.options.some((o) => o.id === d)) {
    const out = resolveEvent(s, ev, d);
    ev.status = 'expired';
    ev.resolution = `Not actioned by the close — default applied: ${out}`;
    return;
  }
  ev.status = 'expired';
  ev.resolution = 'Expired.';
}

// ---------------------------------------------------------------- analysis (analyst)

function analyse(s: GameState, ev: GameEvent): string[] {
  const c = ev.clientId ? s.clients[ev.clientId] : undefined;
  switch (ev.kind) {
    case 'onboarding':
      return onboardingDD(s, ev);
    case 'financingRequest': {
      const clone = cloneState(s);
      const cc = clone.clients[c!.id];
      applyFinancing(clone, cc, ev.data.amount, ev.data.toLev, ev.data.offerSpread, { assumeAccept: true });
      postAction(clone);
      const before = clientEconomics(s, c!);
      const after = clientEconomics(clone, cc);
      const st = stressClient(clone, cc);
      return [
        `Post-trade gross ${fm(accountValue(clone, cc).gmv)} on ${fm(accountValue(clone, cc).equity)} equity.`,
        `Run-rate revenue ${fm(before.revenue)} → ${fm(after.revenue)}; capital ${fm(before.capital)} → ${fm(after.capital)}.`,
        `Stress exposure ${fm(before.exposure)} → ${fm(after.exposure)}; expected loss ${fm(before.expectedLoss)} → ${fm(after.expectedLoss)} p.a.`,
        `Economic profit ${fm(before.economicProfit)} → ${fm(after.economicProfit)}; RoAC ${fpct(before.roac)} → ${fpct(after.roac)}.`,
        `Worst scenario after: ${st.sort((a, b) => b.shortfall - a.shortfall)[0].name} (shortfall ${fm(Math.max(...st.map((x) => x.shortfall)))}).`,
        `PD today ${fpct(effectivePD(s, c!), 1)} → ${fpct(effectivePD(clone, cc), 1)} after levering up.`,
      ];
    }
    case 'squeezeAlert': {
      const secId = ev.data.secId as string;
      const sec = s.securities[secId];
      const out: string[] = [];
      for (const id of ev.data.clients as string[]) {
        const cl = s.clients[id];
        const mv = -(cl.positions[secId] ?? 0) * sec.price;
        const m = computeMargin(s, cl);
        for (const jump of [0.25, 0.5, 1.0]) {
          const eqAfter = m.equity - mv * jump;
          out.push(`${cl.short}: +${jump * 100}% → equity ${fm(eqAfter)}${eqAfter < 0 ? ` (Atlas loss ${fm(-eqAfter)} if it defaults)` : ''}; fund free cash ${fm(cl.fund.freeCash)}.`);
        }
      }
      out.push(`Recall risk: ${fpct(Math.min(0.9, 0.2 + sec.squeeze * 0.5))} chance of a recall in the next 3 days. External supply left: ${fm(externalSupply(s, secId).reduce((a, r) => a + r.units * sec.price, 0))}.`);
      return out;
    }
    case 'marginDefault': {
      const cl = c!;
      const av = accountValue(s, cl);
      const lc = ev.data.liqCost as number;
      const fire = Math.max(0, lc - av.equity);
      const orderly = Math.max(0, lc * 0.5 - av.equity);
      const vol = s.securities.USLC.idioVol + s.market.vol / 100;
      return [
        `Fire sale today: loss ≈ ${fm(fire)} (certain).`,
        `Orderly over 3 days: loss ≈ ${fm(orderly)} if prices hold (impact ≈ ${fm(lc * 0.5)}), plus market risk of ±${fm((av.gmv * vol * Math.sqrt(3 / 252)) * 1.65)} (95%) on the book.`,
        `Standstill: if the fund's NAV recovers 10%, the call is likely met; a further 10% fall adds ≈ ${fm(av.gmv * 0.1)} of losses with recovery dependent on the estate.`,
        `Legal position: Atlas has a first lien only over assets in its own account (${fm(Math.max(0, av.equity))} equity). Assets at ${cl.fund.otherPBs.map((o) => s.competitors[o.competitorId].name).join(', ')} are pledged to them. Unsecured claim recovery typically 10–50%, over months.`,
        `Estimated recovery on a claim today: ${fpct(Math.max(0.05, Math.min(0.5, (cl.fund.freeCash * 0.6 + cl.fund.nav * 0.1) / Math.max(1, fire + cl.fund.nav * 0.15))), 0)}.`,
      ];
    }
    default:
      return ['No further analysis available.'];
  }
}

// ---------------------------------------------------------------- previews

export function cloneState(s: GameState): GameState {
  return JSON.parse(JSON.stringify(s));
}

export interface PreviewResult {
  rows: { label: string; before: number; after: number; fmt: 'money' | 'pct' | 'x' }[];
  outcome: string;
}

export function previewOption(s: GameState, evId: string, optionId: string, param?: number): PreviewResult | null {
  const ev = s.events.find((e) => e.id === evId);
  if (!ev) return null;
  const opt = ev.options.find((o) => o.id === optionId);
  if (!opt || opt.usesAnalyst) return null;
  const clone = cloneState(s);
  const cev = clone.events.find((e) => e.id === evId)!;
  const before = deskSummary(s);
  let outcome = '';
  try {
    outcome = resolveEvent(clone, cev, optionId, param, { assumeAccept: true, preview: true });
  } catch (e) {
    return null;
  }
  const after = deskSummary(clone);
  const rows: PreviewResult['rows'] = [
    { label: 'Revenue run-rate', before: before.revenueRunRate, after: after.revenueRunRate, fmt: 'money' },
    { label: 'Economic profit run-rate', before: before.economicProfitRunRate, after: after.economicProfitRunRate, fmt: 'money' },
    { label: 'Capital used', before: before.capitalUsed, after: after.capitalUsed, fmt: 'money' },
    { label: 'Stress exposure', before: before.stressExposure, after: after.stressExposure, fmt: 'money' },
    { label: 'External borrow collateral', before: before.extCollateral, after: after.extCollateral, fmt: 'money' },
    { label: 'Wholesale funding', before: before.repo + before.termRepo + before.treasury + before.emergency, after: after.repo + after.termRepo + after.treasury + after.emergency, fmt: 'money' },
    { label: 'Liquidity coverage', before: before.lcr, after: after.lcr, fmt: 'x' },
  ];
  if (ev.clientId && s.clients[ev.clientId]?.status === 'active' || (ev.clientId && clone.clients[ev.clientId]?.status === 'active')) {
    const cb = s.clients[ev.clientId!];
    const ca = clone.clients[ev.clientId!];
    const eb = cb.status === 'active' ? clientEconomics(s, cb) : null;
    const ea = ca.status === 'active' ? clientEconomics(clone, ca) : null;
    rows.push({ label: `${cb.short} RoAC`, before: eb?.roac ?? 0, after: ea?.roac ?? 0, fmt: 'pct' });
  }
  return { rows, outcome };
}
