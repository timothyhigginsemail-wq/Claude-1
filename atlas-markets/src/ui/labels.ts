// Display helpers shared by screens.

import { bondYield, quotePrice, unitValue } from '../engine/pricing';
import { PIP } from '../engine/market';
import type { ClientType, GameState, Instrument } from '../engine/types';

export const CLIENT_TYPE: Record<ClientType, { label: string; blurb: string }> = {
  hedgeFund: { label: 'Hedge fund', blurb: 'Price-sensitive and often informed: when they sell, the price frequently falls next. Big, lumpy, profitable if priced right.' },
  quant: { label: 'Quant fund', blurb: 'High-frequency, small tickets, extremely price-sensitive. Flow is mildly informed in aggregate.' },
  pension: { label: 'Pension fund', blurb: 'Large, patient, uninformed: trades to match liabilities. Values reliability over the last basis point.' },
  assetMgr: { label: 'Asset manager', blurb: 'Benchmark-driven rebalancing. Moderately price-sensitive, mostly uninformed.' },
  insurer: { label: 'Insurer', blurb: 'Long-duration buyer of bonds and receiver of swaps. Uninformed, relationship-driven.' },
  swf: { label: 'Sovereign wealth fund', blurb: 'Very large tickets, infrequent. Remembers who showed liquidity in stress.' },
  corporate: { label: 'Corporate', blurb: 'Hedging business exposures (FX, rates, commodities). Uninformed, least price-sensitive — but credit risk on derivatives.' },
  dealer: { label: 'Dealer', blurb: 'Another bank laying off risk. Knows the market as well as you do.' },
  emm: { label: 'Electronic market maker', blurb: 'Fastest, best-informed flow in liquid products. Winning their trades is often a loss.' },
  privateBank: { label: 'Private bank', blurb: 'Distributes structured notes to wealthy investors. Wants competitive coupons; you keep the margin and the hedging risk.' },
};

/** Market price in the instrument's natural quoting convention. */
export function priceLabel(s: GameState, instId: string): string {
  const m = s.market;
  if (instId.startsWith('SPOT:')) return spotLabel(instId.slice(5), m.fx.spot[instId.slice(5)]);
  const inst = s.instruments[instId];
  if (!inst) return '—';
  const p = quotePrice(inst, m);
  switch (inst.kind) {
    case 'stock':
    case 'etf':
      return `$${p.toFixed(2)}`;
    case 'ust':
    case 'corp': {
      const T = inst.maturity - m.t;
      return `${p.toFixed(3)} · ${(bondYield(p / 100, inst.coupon, T) * 100).toFixed(3)}%`;
    }
    case 'irs':
      return `${p.toFixed(3)}% par`;
    case 'cds':
      return `${(m.credit.spread[inst.issuer] ?? 0).toFixed(0)}bp`;
    case 'fxFwd':
      return spotLabel(inst.pair, p);
    case 'eqOpt':
    case 'cmdtyOpt':
      return `$${p.toFixed(2)}`;
    case 'fxOpt':
      return `${(p * 100).toFixed(3)}%`;
    case 'varSwap':
      return `${(inst.strikeVol * 100).toFixed(2)} vol`;
    case 'autocall':
      return `${(unitValue(inst, m) * 100).toFixed(2)}%`;
    case 'sofrFut':
      return `${p.toFixed(3)} (${(100 - p).toFixed(2)}%)`;
    default:
      return p.toFixed(p > 1000 ? 2 : 3);
  }
}

export function spotLabel(pair: string, x: number): string {
  const dp = Math.max(2, Math.round(-Math.log10(PIP[pair] ?? 1e-4)) + 1);
  return x.toFixed(dp);
}

export function kindLabel(inst: Instrument | undefined, instId: string): string {
  if (instId.startsWith('SPOT:')) return 'FX spot';
  if (!inst) return '';
  const k: Record<string, string> = { stock: 'Stock', etf: 'ETF', eqFut: 'Index future', eqOpt: 'Index option', ust: 'Treasury', bondFut: 'Bond future', sofrFut: 'SOFR future', irs: 'Swap', fxFwd: 'FX forward', fxOpt: 'FX option', corp: 'Corporate bond', cds: 'CDS', cmdtyFut: 'Commodity future', cmdtyOpt: 'Commodity option', varSwap: 'Variance swap', autocall: 'Autocallable' };
  return k[inst.kind] ?? inst.kind;
}

export function instName(s: GameState, instId: string): string {
  if (instId.startsWith('SPOT:')) return `${instId.slice(5)} spot`;
  if (instId.startsWith('NEWSWAP:')) return `${instId.slice(8)}Y par swap (D2D)`;
  return s.instruments[instId]?.name ?? instId;
}
