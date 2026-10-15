// Risk snapshot shared by screens: computed once per game-state version (VaR revalues the whole
// book under 300 scenarios, so screens must not each recompute it).

import { computeVaR, counterpartyExposure, deskCapital, runStress, STRESSES, summarise, type CapitalBreakdown, type DeskRiskSummary, type VarResult } from '../engine/risk';
import type { DeskId, GameState } from '../engine/types';
import { useGame } from './GameContext';

export const DESKS: DeskId[] = ['eq', 'rates', 'fx', 'credit', 'cmdty', 'exotics'];

export interface RiskSnap {
  v: VarResult;
  stress: { id: string; name: string; desc: string; total: number; byDesk: Record<DeskId, number> }[];
  worstByDesk: Record<DeskId, number>;
  sum: Record<DeskId, DeskRiskSummary>;
  cap: Record<DeskId, CapitalBreakdown>;
  capTotal: number;
  cpty: ReturnType<typeof counterpartyExposure>;
}

let cache: { key: string; snap: RiskSnap } | null = null;

export function riskSnapshot(s: GameState, key: string): RiskSnap {
  if (cache && cache.key === key) return cache.snap;
  const v = computeVaR(s);
  const stress = STRESSES.map((x) => ({ id: x.id, name: x.name, desc: x.desc, ...runStress(s, x.id) }));
  const worstByDesk = {} as Record<DeskId, number>;
  const sum = {} as Record<DeskId, DeskRiskSummary>;
  const cap = {} as Record<DeskId, CapitalBreakdown>;
  let capTotal = 0;
  for (const d of DESKS) {
    worstByDesk[d] = Math.min(0, ...stress.map((x) => x.byDesk[d]));
    sum[d] = summarise(s, d);
    cap[d] = deskCapital(s, d, v, worstByDesk[d]);
    capTotal += cap[d].total;
  }
  const snap = { v, stress, worstByDesk, sum, cap, capTotal, cpty: counterpartyExposure(s) };
  cache = { key, snap };
  return snap;
}

export function useRisk(): RiskSnap | null {
  const g = useGame();
  if (!g.s) return null;
  return riskSnapshot(g.s, `${g.s.seed}:${g.v}`);
}
