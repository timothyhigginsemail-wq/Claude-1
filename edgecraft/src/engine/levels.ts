import type { RegimeSet } from './market';

export type Level = 1 | 2 | 3;

export interface LevelConfig {
  level: Level;
  title: string;
  subtitle: string;
  focus: string[];
  defaultTurns: number;
  regimeSet: RegimeSet;
  /** Turn from which non-calm regimes may occur. */
  fullRegimesFrom: number;
  /** Max simultaneous positions (L1 = one trade at a time). */
  maxPositions: number;
  /** Gross leverage cap (Σ|notional| / NAV). */
  maxGross: number;
  /** Drawdown at which the risk committee forces a 50% de-gross. */
  ddDerisk: number;
  /** Drawdown at which the fund is shut down. */
  ddStop: number;
  /** Max factor exposure, $ per 1σ, as a fraction of NAV. */
  factorLimit: number;
  /** Max share of total risk from one position (soft warning). */
  concentrationLimit: number;
}

export const LEVELS: Record<Level, LevelConfig> = {
  1: {
    level: 1,
    title: 'Single-Trade Risk Manager',
    subtitle: 'One bet at a time. Probability, payoffs, expected value, compounding and position sizing.',
    focus: ['Expected value vs. expected growth', 'Kelly and fractional Kelly', 'Estimated vs. true probabilities', 'Compounding and volatility drag'],
    defaultTurns: 25,
    regimeSet: 'calm',
    fullRegimesFrom: 1e9,
    maxPositions: 1,
    maxGross: 1.5,
    ddDerisk: 1,
    ddStop: 0.9,
    factorLimit: 10,
    concentrationLimit: 1,
  },
  2: {
    level: 2,
    title: 'Quantitative Portfolio Manager',
    subtitle: 'Many concurrent trades, shared factors, correlations, hedges, leverage, margin and regimes.',
    focus: ['Correlation and hidden common factors', 'Portfolio-level Kelly', 'Leverage, margin and forced deleveraging', 'Regime shifts and stale estimates'],
    defaultTurns: 40,
    regimeSet: 'full',
    fullRegimesFrom: 5,
    maxPositions: 14,
    maxGross: 6,
    ddDerisk: 0.2,
    ddStop: 0.4,
    factorLimit: 0.04,
    concentrationLimit: 0.4,
  },
  3: {
    level: 3,
    title: 'Free play',
    subtitle: 'Allocate risk across strategy pods, judge managers from noisy track records, survive financing crises.',
    focus: ['Evaluating track records', 'Risk budgets across pods', 'Shared exposures across "independent" managers', 'Liquidity and financing crises'],
    defaultTurns: 40,
    regimeSet: 'full',
    fullRegimesFrom: 3,
    maxPositions: 25,
    maxGross: 5,
    ddDerisk: 0.15,
    ddStop: 0.3,
    factorLimit: 0.035,
    concentrationLimit: 0.45,
  },
};
