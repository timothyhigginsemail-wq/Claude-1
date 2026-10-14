// Margin methodologies.
//
// House (risk-based / portfolio) margin — Atlas's own model for institutional accounts:
//   base  = max(systematic + idiosyncratic, gross floor)
//   + concentration add-on + liquidity add-on + short-squeeze add-on + futures initial margin
//   initial = base × client IM multiplier; maintenance = initial × maintenance ratio
//
// Reg T-style (strategy-based) margin — for comparison and for clients on Reg T terms:
//   initial = 50% of long MV + 50% of short MV (i.e. 150% of short value incl. proceeds)
//   maintenance (FINRA 4210-style) = 25% of long MV + 30% of short MV
// Both are approximations of the real rule sets and are labelled as such in the UI.

import { accountValue, notional } from './accounts';
import { calc, type Calc } from './explain';
import type { Client, GameState, SecId } from './types';

export const REGT_INITIAL = 0.5;
export const REGT_MAINT_LONG = 0.25;
export const REGT_MAINT_SHORT = 0.3;
export const PARTICIPATION = 0.15; // fraction of ADV assumed tradable per day in liquidation

export function volScaler(s: GameState): number {
  return Math.min(2.5, Math.max(1, s.market.vol / 16));
}

export function idioShock(s: GameState, secId: SecId): number {
  const sec = s.securities[secId];
  return Math.max(0.03, sec.idioVol * Math.sqrt(10 / 252) * 2.33 * Math.sqrt(volScaler(s)));
}

export function liquidityDays(s: GameState, secId: SecId, mv: number): number {
  const sec = s.securities[secId];
  return Math.abs(mv) / Math.max(1, PARTICIPATION * sec.adv);
}

function floorRate(kind: string): number {
  if (kind === 'bond') return 0.15;
  if (kind === 'etf') return 0.03;
  return 0.05;
}

export const FUT_IM: Record<string, number> = { XFUT: 0.06, TYFUT: 0.025 };

export interface PositionMargin {
  secId: SecId;
  qty: number;
  mv: number; // signed
  idio: number;
  floor: number;
  conc: number;
  liq: number;
  squeeze: number;
  liqDays: number;
}

export interface MarginResult {
  method: 'house' | 'regT';
  systematic: number;
  idiosyncratic: number;
  grossFloor: number;
  base: number;
  concentration: number;
  liquidity: number;
  squeeze: number;
  futuresIM: number;
  houseInitial: number;
  houseMaint: number;
  regTInitial: number;
  regTMaint: number;
  initial: number;
  maintenance: number;
  equity: number;
  excess: number; // equity − initial (available to withdraw / trade)
  deficit: number; // max(0, maintenance − equity)
  callAmount: number; // amount needed to restore to initial if below maintenance
  lines: PositionMargin[];
}

export function computeMargin(s: GameState, c: Client): MarginResult {
  const av = accountValue(s, c);
  const t = c.terms;
  const shock = s.desk.houseMarketShock * volScaler(s);
  let betaNet = 0;
  let idioSq = 0;
  let grossFloor = 0;
  let concentration = 0;
  let liquidity = 0;
  let squeeze = 0;
  let futuresIM = 0;
  let longMV = 0;
  let shortMV = 0;
  const lines: PositionMargin[] = [];
  const concThreshold = t.concThresholdPct * Math.max(av.equity, 1);
  for (const id in c.positions) {
    const q = c.positions[id];
    if (!q) continue;
    const sec = s.securities[id];
    const mv = notional(sec, q);
    if (sec.kind === 'future') {
      futuresIM += Math.abs(mv) * (FUT_IM[id] ?? 0.06) * volScaler(s);
      betaNet += 0; // futures margined separately by the CCP-style IM
      continue;
    }
    if (q > 0) longMV += mv;
    else shortMV += -mv;
    const amv = Math.abs(mv);
    betaNet += sec.beta * mv;
    const idio = amv * idioShock(s, id);
    idioSq += idio * idio;
    const fl = amv * floorRate(sec.kind);
    grossFloor += fl;
    const conc = amv > concThreshold ? (amv - concThreshold) * s.desk.concAddonRate : 0;
    concentration += conc;
    const ld = liquidityDays(s, id, mv);
    const liq = amv * Math.min(0.35, 0.02 * Math.max(0, ld - 1));
    liquidity += liq;
    let sq = q < 0 && sec.borrowFeeBps > 300 ? amv * Math.min(0.25, 0.04 + sec.squeeze * 0.15 + sec.borrowFeeBps / 40000) : 0;
    if (q < 0 && s.desk.nameAddons[id]) sq += amv * s.desk.nameAddons[id];
    squeeze += sq;
    lines.push({ secId: id, qty: q, mv, idio, floor: fl, conc, liq, squeeze: sq, liqDays: ld });
  }
  const systematic = Math.abs(betaNet) * shock;
  const idiosyncratic = Math.sqrt(idioSq);
  const base = Math.max(systematic + idiosyncratic, grossFloor);
  const houseBase = base + concentration + liquidity + squeeze + futuresIM;
  const houseInitial = houseBase * t.imMultiplier;
  const houseMaint = houseInitial * t.maintRatio;
  const regTInitial = REGT_INITIAL * longMV + REGT_INITIAL * shortMV + futuresIM;
  const regTMaint = REGT_MAINT_LONG * longMV + REGT_MAINT_SHORT * shortMV + futuresIM;
  const initial = t.method === 'regT' ? regTInitial : houseInitial;
  const maintenance = t.method === 'regT' ? regTMaint : houseMaint;
  const equity = av.equity;
  const deficit = Math.max(0, maintenance - equity);
  return {
    method: t.method,
    systematic,
    idiosyncratic,
    grossFloor,
    base,
    concentration,
    liquidity,
    squeeze,
    futuresIM,
    houseInitial,
    houseMaint,
    regTInitial,
    regTMaint,
    initial,
    maintenance,
    equity,
    excess: equity - initial,
    deficit,
    callAmount: deficit > 0 ? initial - equity : 0,
    lines,
  };
}

export function marginCalc(s: GameState, c: Client): Calc {
  const m = computeMargin(s, c);
  const av = accountValue(s, c);
  if (m.method === 'regT') {
    return calc('Initial margin requirement (Reg T-style)', m.initial, {
      formula: '50% × long MV + 50% × short MV + futures IM',
      note: 'Strategy-based margin approximating Regulation T (initial) and FINRA 4210 (maintenance: 25% long / 30% short). Real rules have many position-specific exceptions.',
      children: [
        calc('Long market value', av.longMV, { formula: 'Σ qty × price (longs)' }),
        calc('Short market value', av.shortMV, { formula: 'Σ |qty| × price (shorts)' }),
        calc('50% of long MV', 0.5 * av.longMV),
        calc('50% of short MV', 0.5 * av.shortMV),
        calc('Futures initial margin', m.futuresIM),
        calc('Maintenance requirement', m.maintenance, { formula: '25% × long MV + 30% × short MV' }),
      ],
    });
  }
  return calc('Initial margin requirement (house model)', m.initial, {
    formula: `(max(systematic + idiosyncratic, gross floor) + add-ons) × ${c.terms.imMultiplier.toFixed(2)} multiplier`,
    note: 'Atlas risk-based portfolio margin. Shocks are scaled by current market volatility. Illustrative model, not a regulatory TIMS calculation.',
    children: [
      calc('Systematic (beta-weighted net × market shock)', m.systematic, {
        formula: `|Σ β × MV| × ${(s.desk.houseMarketShock * volScaler(s) * 100).toFixed(1)}%`,
        note: 'A hedged (market-neutral) book has little systematic risk.',
      }),
      calc('Idiosyncratic (√Σ (|MV| × 10-day 99% shock)²)', m.idiosyncratic, {
        note: 'Diversification benefit: independent single-name risks add in quadrature.',
      }),
      calc('Gross floor (minimum % of gross)', m.grossFloor, { note: '5% equities, 3% ETFs, 15% distressed bonds. Applies when hedging would otherwise drive margin too low.' }),
      calc('Model base = max(sys + idio, floor)', m.base),
      calc('Concentration add-on', m.concentration, {
        formula: `${(s.desk.concAddonRate * 100).toFixed(0)}% × excess above ${(c.terms.concThresholdPct * 100).toFixed(0)}% of equity per name`,
      }),
      calc('Liquidity add-on', m.liquidity, { formula: '2% per day-of-ADV beyond 1 day (15% participation), capped at 35%' }),
      calc('Short-squeeze add-on (HTB shorts)', m.squeeze),
      calc('Futures initial margin', m.futuresIM),
      calc('× IM multiplier', c.terms.imMultiplier, { fmt: 'x' }),
      calc('Maintenance requirement', m.maintenance, { formula: `Initial × ${(c.terms.maintRatio * 100).toFixed(0)}%` }),
      calc('Reg T comparison (initial)', m.regTInitial, { note: 'What a strategy-based Reg T account would require for the same positions.' }),
    ],
  });
}
