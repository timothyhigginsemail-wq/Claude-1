import { useMemo } from 'react';
import {
  checkOrders, deskPairs, deskScenarios, evaluateExAnte, levelCfg, tradableIds, trueProbs, type GameState,
} from '../../engine/game';
import { buildScenarios, deskParams, factorExposures, quoteInstrument, riskContrib, scenarioCorr, scenarioCov, type Quote, type Scenarios } from '../../engine/risk';
import type { RegimeId } from '../../engine/market';
import { covToCorr } from '../../engine/math';
import { useDebounced } from '../kit';

const STRESS: RegimeId[] = ['volspike', 'liquidity', 'credit', 'unwind'];

export interface Desk {
  universe: string[];
  sc: Scenarios;
  /** Same instruments, scenarios drawn only from stress-regime entries (for stressed correlations). */
  scStress: Scenarios;
  quotes: Record<string, Quote>;
  truth: Record<string, number[]> | null;
}

export function useDeskBase(state: GameState): Desk {
  return useMemo(() => {
    const universe = tradableIds(state);
    const sc = deskScenarios(state, universe);
    const pairs = deskPairs(state);
    const quotes: Record<string, Quote> = {};
    for (const id of universe) quotes[id] = quoteInstrument(state.instruments[id], pairs);
    const insts = universe.map((id) => state.instruments[id]);
    const scStress = buildScenarios(insts, insts.map(deskParams), STRESS.map((r) => ({ from: 'normal' as RegimeId, to: r, w: 1 })), [state.config.seed, 'stress', state.turn], 1500);
    const truth = state.config.transparent ? Object.fromEntries(universe.map((id) => [id, trueProbs(state, id)])) : null;
    return { universe, sc, scStress, quotes, truth };
  }, [state]);
}

export function usePortfolio(state: GameState, desk: Desk, targets: Record<string, number>) {
  const check = useMemo(() => checkOrders(state, targets), [state, targets]);
  const debounced = useDebounced(targets, 220);
  const exAnte = useMemo(() => {
    try {
      return evaluateExAnte(state, debounced, desk.sc);
    } catch {
      return null;
    }
  }, [state, debounced, desk.sc]);
  const current = useMemo(() => {
    const t: Record<string, number> = {};
    for (const [id, p] of Object.entries(state.positions)) t[id] = p.notional;
    return evaluateExAnte(state, t, desk.sc);
  }, [state, desk.sc]);

  const risk = useMemo(() => {
    const ids = desk.universe;
    const w = ids.map((id) => (debounced[id] ?? 0) / state.nav);
    const cov = scenarioCov(desk.sc);
    const rc = riskContrib(cov, w);
    const held = ids.map((_, i) => i).filter((i) => w[i] !== 0);
    const insts = ids.map((id) => state.instruments[id]);
    const fx = factorExposures(insts, ids.map((id) => debounced[id] ?? 0));
    const corrAll = covToCorr(cov);
    const corrStress = scenarioCorr(desk.scStress);
    return { ids, w, cov, rc, held, fx, corrAll, corrStress };
  }, [state, desk, debounced]);

  return { check, exAnte, current, risk, lvl: levelCfg(state) };
}
