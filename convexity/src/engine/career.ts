// Career ladder, permissions, limits and the weekly performance review.

import { Family } from './clients';
import { mean, stdev } from './math';

export interface Limits {
  delta: number; // max |delta$| per asset ($ per 1%)
  vega: number; // max Σ|vega$| ($ per vol pt)
  gamma: number; // max Σ|gamma$|
  var99: number;
  stress: number; // worst stress-test loss
}

export interface Level {
  id: number;
  title: string;
  families: Family[];
  limits: Limits;
  weeklyTarget: number;
  blurb: string;
}

export const LEVELS: Level[] = [
  { id: 0, title: 'Junior Trader', families: ['delta1', 'vanilla', 'fx'], limits: { delta: 450e3, vega: 150e3, gamma: 120e3, var99: 1.2e6, stress: 8e6 }, weeklyTarget: 300e3, blurb: 'Vanilla index and FX options, delta-one hedges.' },
  { id: 1, title: 'Trader', families: ['delta1', 'vanilla', 'fx', 'barrier', 'digital', 'swap'], limits: { delta: 1.1e6, vega: 350e3, gamma: 300e3, var99: 3e6, stress: 20e6 }, weeklyTarget: 750e3, blurb: 'Barriers, digitals, single stocks and rates.' },
  { id: 2, title: 'Senior Trader', families: ['delta1', 'vanilla', 'fx', 'barrier', 'digital', 'swap', 'autocall'], limits: { delta: 2.5e6, vega: 800e3, gamma: 700e3, var99: 7e6, stress: 45e6 }, weeklyTarget: 1.8e6, blurb: 'Structured notes: worst-of autocallables and quantos.' },
  { id: 3, title: 'Head of Desk', families: ['delta1', 'vanilla', 'fx', 'barrier', 'digital', 'swap', 'autocall'], limits: { delta: 6e6, vega: 1.8e6, gamma: 1.6e6, var99: 15e6, stress: 100e6 }, weeklyTarget: 4e6, blurb: 'The whole book. And the people.' },
];

export interface CareerState {
  level: number;
  reputation: number; // 0..100
  weekStartDay: number;
  breaches: number; // this week
  forced: number; // forced risk reductions this week
  reviews: Review[];
  fired: boolean;
  promotedAt: number[];
}

export interface Review {
  day: number;
  pnl: number;
  sharpe: number;
  edge: number;
  costs: number;
  hitRatio: number;
  relAvg: number;
  breaches: number;
  forced: number;
  maxDD: number;
  scores: { label: string; score: number; note: string }[];
  total: number;
  verdict: 'promoted' | 'held' | 'warning' | 'fired';
  text: string;
}

export const newCareer = (level = 0): CareerState => ({ level, reputation: 50, weekStartDay: 0, breaches: 0, forced: 0, reviews: [], fired: false, promotedAt: [] });

export function weeklyReview(c: CareerState, day: number, daily: number[], edge: number, costs: number, hit: { won: number; quoted: number }, relAvg: number): Review {
  const L = LEVELS[c.level];
  const pnl = daily.reduce((a, b) => a + b, 0);
  const sd = stdev(daily);
  const sharpe = sd > 0 ? (mean(daily) / sd) * Math.sqrt(252) : pnl > 0 ? 3 : 0;
  let peak = 0;
  let cum = 0;
  let maxDD = 0;
  for (const x of daily) {
    cum += x;
    peak = Math.max(peak, cum);
    maxDD = Math.max(maxDD, peak - cum);
  }
  const hitRatio = hit.quoted ? hit.won / hit.quoted : 0;
  const s = (x: number) => Math.round(Math.max(0, Math.min(100, x)));
  const scores = [
    { label: 'P&L vs target', score: s(50 + 50 * (pnl / L.weeklyTarget - 0.5)), note: `${(pnl / L.weeklyTarget * 100).toFixed(0)}% of the ${fmt(L.weeklyTarget)} target` },
    { label: 'Risk-adjusted', score: s(35 + 18 * Math.max(-2, Math.min(3.5, sharpe))), note: `annualised Sharpe of daily P&L ${sharpe.toFixed(1)}, max drawdown ${fmt(maxDD)}` },
    { label: 'Client franchise', score: s(25 + 120 * Math.min(0.5, hitRatio) * 0.6 + (relAvg - 50) * 0.8 + Math.min(30, (edge / L.weeklyTarget) * 30)), note: `hit ratio ${(hitRatio * 100).toFixed(0)}%, client edge ${fmt(edge)}` },
    { label: 'Risk discipline', score: s(100 - c.breaches * 22 - c.forced * 30), note: c.breaches || c.forced ? `${c.breaches} limit breach${c.breaches === 1 ? '' : 'es'}, ${c.forced} forced reduction${c.forced === 1 ? '' : 's'}` : 'no limit breaches' },
    { label: 'Execution', score: s(100 - Math.max(0, (-costs / Math.max(edge, 1)) * 100 - 20)), note: `hedging costs ate ${edge > 0 ? ((-costs / edge) * 100).toFixed(0) + '% of' : fmt(-costs) + ' against'} client edge` },
  ];
  const w = [0.25, 0.25, 0.2, 0.2, 0.1];
  const total = Math.round(scores.reduce((a, x, i) => a + x.score * w[i], 0));
  let verdict: Review['verdict'] = 'held';
  const prevWarn = c.reviews.length > 0 && c.reviews[c.reviews.length - 1].verdict === 'warning';
  if (total >= 62 && pnl > 0 && c.breaches <= 1 && c.level < 3) verdict = 'promoted';
  else if (total < 35 || pnl < -2.5 * L.weeklyTarget) verdict = prevWarn || pnl < -5 * L.weeklyTarget ? 'fired' : 'warning';
  const text =
    verdict === 'promoted'
      ? `Strong week. You're stepping up to ${LEVELS[c.level + 1].title}: ${LEVELS[c.level + 1].blurb}`
      : verdict === 'held'
        ? 'Solid enough. Same seat next week — show me consistency and discipline.'
        : verdict === 'warning'
          ? 'That was not good enough. One more week like that and we have a different conversation.'
          : 'We are letting you go. Take the lessons with you.';
  return { day, pnl, sharpe, edge, costs, hitRatio, relAvg, breaches: c.breaches, forced: c.forced, maxDD, scores, total, verdict, text };
}

function fmt(x: number) {
  const a = Math.abs(x);
  const s = x < 0 ? '−' : '';
  return a >= 1e6 ? `${s}$${(a / 1e6).toFixed(2)}m` : `${s}$${(a / 1e3).toFixed(0)}k`;
}
