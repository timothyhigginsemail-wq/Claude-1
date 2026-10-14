// Franchise score: rewards risk-adjusted economic profit, franchise strength, liquidity resilience,
// client relationships and control standards — not raw revenue or leverage.

import { activeClients } from '../engine/accounts';
import { deskSummary } from '../engine/analytics';
import type { GameState } from '../engine/types';

export interface Score {
  total: number;
  parts: { key: string; label: string; value: number; weight: number; note: string }[];
}

const clamp = (x: number) => Math.max(0, Math.min(100, x));

export function computeScore(s: GameState): Score {
  const d = deskSummary(s);
  const clients = activeClients(s);
  // risk-adjusted profit: cumulative EP relative to allocated capital, plus forward EP run-rate
  const epScore = clamp(50 + (s.cumEP / s.desk.allocatedCapital) * 1500 + (d.economicProfitRunRate / s.desk.allocatedCapital) * 120);
  const franchise = clamp(Math.min(60, clients.length * 12) + Math.min(40, (d.grossClientMV / 8e9) * 40));
  const liquidity = clamp(Math.min(1.5, d.lcr) / 1.5 * 70 + (s.desk.emergencyDays === 0 ? 30 : Math.max(0, 30 - s.desk.emergencyDays * 10)));
  const rel = clients.length ? clients.reduce((a, c) => a + c.relationship, 0) / clients.length : 40;
  const relationships = clamp(rel * 0.8 + (clients.length ? (clients.reduce((a, c) => a + c.satisfaction, 0) / clients.length) * 20 + 10 : 0));
  const controls = clamp(s.desk.compliance - s.desk.capitalBreachDays * 3 - s.desk.breaches * 10);
  const parts = [
    { key: 'ep', label: 'Risk-adjusted profit', value: epScore, weight: 0.35, note: 'Cumulative economic profit (after 12% cost of capital) and forward EP run-rate.' },
    { key: 'franchise', label: 'Franchise strength', value: franchise, weight: 0.2, note: 'Active clients and client balances.' },
    { key: 'liquidity', label: 'Liquidity resilience', value: liquidity, weight: 0.2, note: 'Liquidity coverage and avoiding emergency funding.' },
    { key: 'relationships', label: 'Client relationships', value: relationships, weight: 0.15, note: 'Average relationship and satisfaction.' },
    { key: 'controls', label: 'Risk controls', value: controls, weight: 0.1, note: 'Policy exceptions, capital breaches.' },
  ];
  return { total: parts.reduce((a, p) => a + p.value * p.weight, 0), parts };
}
