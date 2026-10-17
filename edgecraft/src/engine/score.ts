// End-of-campaign scorecard and investment-committee review. Separates
// decision quality (judged ex-ante) from realised performance, and — now that
// the campaign is over — reveals how much of the result came from estimation
// error versus pure luck.

import { BENCH_IDS, BENCH_INFO, type BenchId, type GameState } from './game';
import { ARCHETYPE_INFO, type Archetype } from './instruments';
import { maxDrawdown, mean, std } from './math';

export interface DimensionScore {
  key: string;
  name: string;
  score: number; // 0..100
  detail: string;
}

export interface Scorecard {
  turns: number;
  startNav: number;
  finalNav: number;
  totalReturn: number;
  cagr: number;
  annVol: number;
  sharpe: number;
  maxDD: number;
  worstWeek: number;
  es95Week: number;
  forcedLiquidations: number;
  derisks: number;
  avgDecision: number;
  decisionLetter: string;
  medianSizing: number;
  overbetShare: number;
  idleShare: number;
  avgSelection: number;
  avgDivRatio: number;
  avgMaxRc: number;
  avgExAnteLoss5: number;
  brierUser: number | null;
  brierDesk: number;
  userCount: number;
  deskBias: number;
  bench: Record<BenchId, { nav: number; ret: number; maxDD: number }>;
  decomposition: { quotedEv: number; trueEv: number; realised: number; estimationError: number; luck: number; costs: number };
  byArchetype: { archetype: Archetype; name: string; turns: number; pnl: number; quotedEv: number; trueEv: number; capitalAtRisk: number }[];
  trapShare: number;
  dimensions: DimensionScore[];
  strengths: string[];
  weaknesses: string[];
  recurring: string[];
  verdict: string;
}

const letter = (s: number) => (s >= 80 ? 'A' : s >= 65 ? 'B' : s >= 45 ? 'C' : s >= 25 ? 'D' : 'F');
export { letter as scoreLetter };

export function scorecard(s: GameState): Scorecard {
  const h = s.history;
  const start = s.config.startNav;
  const path = s.navPath;
  const rets = h.map((r) => r.ret);
  const rf = s.tape.rf / 100 / 52;
  const n = Math.max(1, h.length);
  const totalReturn = s.nav / start - 1;
  const cagr = Math.pow(Math.max(s.nav, 1e-9) / start, 52 / n) - 1;
  const sd = std(rets);
  const sharpe = sd > 0 ? ((mean(rets) - rf) / sd) * Math.sqrt(52) : 0;
  const sorted = rets.slice().sort((a, b) => a - b);
  const k5 = Math.max(1, Math.floor(sorted.length * 0.05));
  const es95Week = sorted.length ? -mean(sorted.slice(0, k5)) : 0;
  const maxDD = maxDrawdown(path);

  const decisions = h.map((r) => r.grade.score);
  const avgDecision = mean(decisions);
  const active = h.filter((r) => r.exAnte.heldIds.length > 0);
  const sizings = active.map((r) => r.exAnte.sizing).sort((a, b) => a - b);
  const medianSizing = sizings.length ? sizings[Math.floor(sizings.length / 2)] : 0;
  const overbetShare = active.length ? active.filter((r) => r.exAnte.sizing > 1.2).length / active.length : 0;
  const idleShare = h.length ? h.filter((r) => !r.exAnte.heldIds.length && r.exAnte.gOpt - r.exAnte.gCash > 0.0008).length / h.length : 0;
  const avgSelection = active.length ? mean(active.map((r) => r.exAnte.selection)) : 0;
  const multi = active.filter((r) => r.exAnte.heldIds.length >= 2);
  const avgDivRatio = multi.length ? mean(multi.map((r) => r.exAnte.divRatio)) : 1;
  const avgMaxRc = multi.length ? mean(multi.map((r) => r.exAnte.maxRcShare)) : 1;
  const avgExAnteLoss5 = active.length ? mean(active.map((r) => r.exAnte.pLoss5)) : 0;

  const cal = s.calibration;
  const userCal = cal.filter((c) => c.user !== undefined);
  const brier = (xs: { p: number; y: boolean }[]) => (xs.length ? mean(xs.map((x) => (x.p - (x.y ? 1 : 0)) ** 2)) : NaN);
  const brierUser = userCal.length ? brier(userCal.map((c) => ({ p: c.user!, y: c.won }))) : null;
  const brierDesk = brier(cal.map((c) => ({ p: c.quoted, y: c.won })));
  const deskBias = cal.length ? mean(cal.map((c) => c.quoted - c.truth)) : 0;

  const bench = {} as Scorecard['bench'];
  for (const b of BENCH_IDS) bench[b] = { nav: s.bench[b].nav, ret: s.bench[b].nav / start - 1, maxDD: maxDrawdown(s.bench[b].path) };

  let quotedEv = 0, trueEv = 0, realised = 0, costs = 0;
  const arch = new Map<string, { archetype: Archetype; name: string; turns: number; pnl: number; quotedEv: number; trueEv: number; car: number }>();
  let trapRisk = 0, allRisk = 0;
  for (const r of h) {
    costs += r.costs.tc + r.costs.fin + r.costs.lev - r.costs.cash + r.costs.research + r.costs.liquidation;
    for (const p of r.positions) {
      quotedEv += p.notional * p.quotedEv;
      trueEv += p.notional * p.trueEv;
      realised += p.pnl;
      // pods are reported one by one (each is a manager); trades by archetype
      const key = p.archetype === 'pod' ? p.name : p.archetype;
      const a = arch.get(key) ?? { archetype: p.archetype, name: p.archetype === 'pod' ? p.name : ARCHETYPE_INFO[p.archetype].name, turns: 0, pnl: 0, quotedEv: 0, trueEv: 0, car: 0 };
      a.turns++;
      a.pnl += p.pnl;
      a.quotedEv += p.notional * p.quotedEv;
      a.trueEv += p.notional * p.trueEv;
      const inst = s.instruments[p.id];
      const worst = inst ? -Math.min(...inst.outcomes.map((o) => o.r)) : 0;
      a.car += Math.abs(p.notional) * worst;
      arch.set(key, a);
      allRisk += Math.abs(p.notional) * worst;
      if (p.quality === 'trap') trapRisk += Math.abs(p.notional) * worst;
    }
  }
  const byArchetype = [...arch.values()]
    .map((a) => ({ archetype: a.archetype, name: a.name, turns: a.turns, pnl: a.pnl, quotedEv: a.quotedEv, trueEv: a.trueEv, capitalAtRisk: a.car }))
    .sort((x, y) => y.capitalAtRisk - x.capitalAtRisk);
  const trapShare = allRisk > 0 ? trapRisk / allRisk : 0;

  // --- dimension scores ---
  const sizingScore = active.length ? 100 * mean(active.map((r) => r.exAnte.sizingQ)) : 50;
  const selectionScore = active.length ? 100 * avgSelection : 50;
  const riskScore = Math.max(0, 100 - 220 * Math.max(0, maxDD - 0.08) - 25 * h.filter((r) => r.events.some((e) => e.kind === 'forced-liquidation')).length - 15 * h.filter((r) => r.events.some((e) => e.kind === 'derisk' && e.text.includes('trigger'))).length);
  const divScore = s.config.level === 1 ? 50 : Math.max(0, Math.min(100, 30 + 45 * (avgDivRatio - 1) + 40 * (1 - avgMaxRc)));
  const calScore = brierUser !== null ? Math.max(0, Math.min(100, 100 - 400 * Math.max(0, brierUser - 0.2))) : 50;
  const growthScore = Math.max(0, Math.min(100, 50 + 50 * (Math.log(Math.max(s.nav, 1) / Math.max(bench.growth.nav, 1)) / 0.15)));
  const dimensions: DimensionScore[] = [
    { key: 'decision', name: 'Decision quality', score: avgDecision, detail: `Average ex-ante grade ${avgDecision.toFixed(0)}/100 across ${h.length} turns.` },
    { key: 'sizing', name: 'Position sizing', score: sizingScore, detail: `Median size ${medianSizing.toFixed(2)}× your own growth-optimal scale; overbet (>1.2×) in ${(overbetShare * 100).toFixed(0)}% of active turns.` },
    { key: 'selection', name: 'Trade selection', score: selectionScore, detail: `Your trades captured ${(avgSelection * 100).toFixed(0)}% of the best available growth (at their best scale).` },
    { key: 'risk', name: 'Risk control', score: riskScore, detail: `Max drawdown ${(maxDD * 100).toFixed(1)}%, worst week ${((sorted[0] ?? 0) * 100).toFixed(1)}%.` },
    { key: 'div', name: 'Diversification', score: divScore, detail: s.config.level === 1 ? 'Not assessed at Level 1.' : `Average diversification ratio ${avgDivRatio.toFixed(2)}; largest single risk share ${(avgMaxRc * 100).toFixed(0)}%.` },
    { key: 'cal', name: 'Probability calibration', score: calScore, detail: brierUser !== null ? `Brier score ${brierUser.toFixed(3)} on ${userCal.length} of your own estimates (desk: ${brierDesk.toFixed(3)}; coin-flip: 0.250).` : 'You did not record your own probabilities — enter "Your estimate" on trades to be scored.' },
    { key: 'growth', name: 'Growth vs. half-Kelly', score: growthScore, detail: `Final NAV ${(s.nav / 1e6).toFixed(3)}M vs ${(bench.growth.nav / 1e6).toFixed(3)}M for the half-Kelly benchmark.` },
  ];

  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const recurring: string[] = [];
  if (sizingScore >= 70) strengths.push(`Disciplined sizing: you typically ran ${medianSizing.toFixed(2)}× of the growth-optimal scale, inside the fractional-Kelly band.`);
  if (overbetShare > 0.25) weaknesses.push(`Overbetting: in ${(overbetShare * 100).toFixed(0)}% of active turns your book was more than 1.2× its own Kelly size — more risk for less growth.`);
  if (medianSizing > 0 && medianSizing < 0.3) weaknesses.push(`Undersizing: at a median ${medianSizing.toFixed(2)}× Kelly you left most of the available growth unused.`);
  if (selectionScore >= 70) strengths.push(`Strong selection: your choice of trades captured ${(avgSelection * 100).toFixed(0)}% of the best achievable growth.`);
  else if (active.length && selectionScore < 45) weaknesses.push('Selection: you frequently chose trades whose best achievable growth was well below what else was available.');
  if (idleShare > 0.3) recurring.push(`Sat in cash on ${(idleShare * 100).toFixed(0)}% of turns despite attractive opportunities.`);
  if (maxDD > 0.25) weaknesses.push(`A ${(maxDD * 100).toFixed(0)}% drawdown: recovering needs a ${((1 / (1 - maxDD) - 1) * 100).toFixed(0)}% gain.`);
  else if (maxDD < 0.1 && totalReturn > 0) strengths.push(`Capital preservation: maximum drawdown held to ${(maxDD * 100).toFixed(1)}% while compounding ${(totalReturn * 100).toFixed(1)}%.`);
  const fl = h.filter((r) => r.events.some((e) => e.kind === 'forced-liquidation')).length;
  if (fl) recurring.push(`${fl} forced liquidation${fl > 1 ? 's' : ''}: margin usage left no room for a haircut increase.`);
  if (s.config.level > 1 && avgMaxRc > 0.55) recurring.push(`Concentration: on average one position supplied ${(avgMaxRc * 100).toFixed(0)}% of portfolio risk.`);
  if (s.config.level > 1 && avgDivRatio > 1.6) strengths.push(`Genuine diversification: standalone risks summed to ${avgDivRatio.toFixed(1)}× the portfolio's risk.`);
  if (trapShare > 0.3) weaknesses.push(`Estimation risk: ${(trapShare * 100).toFixed(0)}% of your capital-at-risk sat in trades whose quoted edge was materially overstated (revealed now). Look for narrow, too-good-to-be-true confidence bands and pay for research.`);
  else if (allRisk > 0 && trapShare < 0.12) strengths.push('You largely avoided the trades whose quoted edge was overstated.');
  const est = trueEv - quotedEv;
  if (quotedEv > 0 && est < -0.3 * Math.abs(quotedEv)) recurring.push(`Your positions' true expected P&L was ${((-est / Math.abs(quotedEv)) * 100).toFixed(0)}% below the desk's quotes — you trusted optimistic estimates.`);
  if (brierUser !== null && brierUser > brierDesk + 0.01) weaknesses.push('Your own probability estimates were less accurate than the desk\'s.');
  if (brierUser !== null && brierUser < brierDesk - 0.005) strengths.push('Your own probability estimates beat the desk\'s quotes — genuine calibration skill.');
  if (!strengths.length) strengths.push('Survived the campaign with the fund intact.');
  if (!weaknesses.length) weaknesses.push('No major structural weaknesses detected.');

  const overall = mean(dimensions.map((d) => d.score));
  const luck = realised - trueEv;
  let verdict: string;
  if (s.status === 'closed') verdict = `The fund was closed (${s.closedReason ?? 'risk limits'}). Whatever the edge, the book was not sized to survive the path it met.`;
  else if (avgDecision >= 65 && totalReturn < 0) verdict = 'A sound process that lost money: the committee would keep this manager. Realised P&L was dominated by luck, not judgement.';
  else if (avgDecision < 45 && totalReturn > 0.1) verdict = 'Profitable but undisciplined: the committee would not allocate more capital. The returns relied on luck that the process did not earn.';
  else if (overall >= 70 && avgDecision >= 65) verdict = 'Approved for a larger allocation: consistent, well-sized decisions with good risk control.';
  else if (overall >= 50 && avgDecision >= 45) verdict = 'Approved with conditions: the core process is reasonable, but the weaknesses below must be addressed before scaling capital.';
  else verdict = 'Not approved: sizing and risk control need fundamental work before this process can manage outside capital.';

  return {
    turns: h.length,
    startNav: start,
    finalNav: s.nav,
    totalReturn,
    cagr,
    annVol: sd * Math.sqrt(52),
    sharpe,
    maxDD,
    worstWeek: sorted[0] ?? 0,
    es95Week,
    forcedLiquidations: fl,
    derisks: h.filter((r) => r.events.some((e) => e.kind === 'derisk' && e.text.includes('trigger'))).length,
    avgDecision,
    decisionLetter: letter(avgDecision),
    medianSizing,
    overbetShare,
    idleShare,
    avgSelection,
    avgDivRatio,
    avgMaxRc,
    avgExAnteLoss5,
    brierUser,
    brierDesk,
    userCount: userCal.length,
    deskBias,
    bench,
    decomposition: { quotedEv, trueEv, realised, estimationError: est, luck, costs },
    byArchetype,
    trapShare,
    dimensions,
    strengths,
    weaknesses,
    recurring,
    verdict,
  };
}

export { BENCH_INFO };
