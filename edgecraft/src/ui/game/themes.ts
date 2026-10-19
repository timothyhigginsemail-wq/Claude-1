import type { FactorId } from '../../engine/market';

/**
 * Plain-English names for the latent factors. `bet` describes what you are
 * hoping for when your exposure is positive/negative; `risk` describes what
 * hurts you.
 */
export const THEMES: Record<FactorId, { up: { bet: string; risk: string }; down: { bet: string; risk: string } }> = {
  EQ: { up: { bet: 'stocks rising', risk: 'Stocks fall' }, down: { bet: 'stocks falling', risk: 'Stocks rally' } },
  RATES: { up: { bet: 'yields rising', risk: 'Yields fall' }, down: { bet: 'yields falling', risk: 'Yields jump' } },
  CREDIT: { up: { bet: 'credit holding up', risk: 'Credit spreads blow out' }, down: { bet: 'credit stress', risk: 'Credit spreads tighten' } },
  CARRY: { up: { bet: 'carry currencies holding', risk: 'Carry trades unwind' }, down: { bet: 'carry unwinding', risk: 'Carry currencies rally' } },
  VOL: { up: { bet: 'volatility rising', risk: 'Markets stay calm' }, down: { bet: 'calm markets', risk: 'Volatility spikes' } },
  MOM: { up: { bet: 'trends continuing', risk: 'Trends reverse' }, down: { bet: 'trends reversing', risk: 'Trends run further' } },
  VALUE: { up: { bet: 'cheap stocks catching up', risk: 'Value lags further' }, down: { bet: 'expensive stocks winning', risk: 'Value rallies' } },
  LIQ: { up: { bet: 'crowded trades holding up', risk: 'Crowded trades unwind / liquidity dries up' }, down: { bet: 'a liquidity squeeze', risk: 'Liquidity floods back' } },
  COMMOD: { up: { bet: 'commodities rising', risk: 'Commodities fall' }, down: { bet: 'commodities falling', risk: 'Commodities rally' } },
};

export function themeFor(f: FactorId, exposure: number) {
  return exposure >= 0 ? THEMES[f].up : THEMES[f].down;
}
