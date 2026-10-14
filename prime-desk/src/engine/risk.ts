// Credit risk, stress testing, capital and economic profit.
//
// Prime-broker credit exposure is NOT the client's gross position: it is the shortfall Atlas would
// suffer if the client defaulted after a stress move and Atlas had to liquidate the collateral it
// controls. Exposure = max(0, stress loss + liquidation cost − equity at Atlas).

import { accountValue, activeClients, notional } from './accounts';
import { calc, type Calc } from './explain';
import { clientDebit } from './ledger';
import { liquidityDays } from './margin';
import { projectClientAnnual, shortSourcing } from './funding';
import type { Client, GameState, Regime } from './types';

export interface ScenarioResult {
  id: string;
  name: string;
  pnl: number; // client P&L (negative = loss)
  liquidationCost: number;
  shortfall: number; // PB loss if client defaults: max(0, −(equity + pnl − liqCost))
}

export const SCENARIOS = [
  { id: 'crash', name: 'Equity crash (−25% market)' },
  { id: 'squeeze', name: 'Short squeeze in crowded/HTB shorts' },
  { id: 'unwind', name: 'Crowded-position unwind' },
  { id: 'gap', name: 'Largest position gaps 50% against client' },
  { id: 'credit', name: 'Credit crisis (distressed debt −35%)' },
] as const;

function scenarioReturn(s: GameState, scen: string, secId: string, qty: number, largestId: string | null): number {
  const sec = s.securities[secId];
  const adverse = qty > 0 ? -1 : 1;
  switch (scen) {
    case 'crash': {
      if (sec.id === 'TYFUT' || sec.id === 'TRSY') return 0.04;
      if (sec.kind === 'bond') return -0.2;
      const idio = sec.idioVol * Math.sqrt(10 / 252) * 0.5;
      return sec.beta * -0.25 + adverse * idio;
    }
    case 'squeeze': {
      if (qty < 0 && sec.kind !== 'future') {
        const htb = sec.borrowFeeBps > 300 ? 1 : 0;
        return 0.1 + 0.6 * Math.max(sec.crowding - 0.4, 0) + 0.3 * htb + 0.5 * sec.squeeze;
      }
      return sec.kind === 'future' ? 0.03 * sec.beta : -0.04;
    }
    case 'unwind': {
      if (sec.kind === 'future' || sec.kind === 'bond') return 0;
      return adverse * 0.3 * sec.crowding;
    }
    case 'gap':
      return secId === largestId ? adverse * 0.5 : 0;
    case 'credit': {
      if (sec.kind === 'bond') return -0.35;
      if (sec.id === 'TYFUT' || sec.id === 'TRSY') return 0.03;
      return sec.beta * -0.12;
    }
  }
  return 0;
}

export function liquidationCostFor(s: GameState, secId: string, mv: number): number {
  const sec = s.securities[secId];
  if (sec.kind === 'future') return Math.abs(mv) * 0.001;
  const ld = liquidityDays(s, secId, mv);
  const rate = Math.min(0.25, 0.002 + 0.012 * Math.pow(ld, 0.6) * Math.max(0.5, sec.idioVol / 0.3));
  return Math.abs(mv) * rate;
}

export function stressClient(s: GameState, c: Client): ScenarioResult[] {
  const av = accountValue(s, c);
  let largestId: string | null = null;
  let largest = 0;
  for (const id in c.positions) {
    const sec = s.securities[id];
    if (sec.kind === 'future') continue;
    const v = Math.abs(c.positions[id] * sec.price);
    if (v > largest) {
      largest = v;
      largestId = id;
    }
  }
  return SCENARIOS.map((sc) => {
    let pnl = 0;
    let liq = 0;
    for (const id in c.positions) {
      const q = c.positions[id];
      if (!q) continue;
      const sec = s.securities[id];
      const mv = notional(sec, q);
      const r = scenarioReturn(s, sc.id, id, q, largestId);
      pnl += mv * r;
      liq += liquidationCostFor(s, id, mv * (1 + r));
    }
    const shortfall = Math.max(0, -(av.equity + pnl - liq));
    return { id: sc.id, name: sc.name, pnl, liquidationCost: liq, shortfall };
  });
}

export function stressExposure(s: GameState, c: Client): number {
  return Math.max(0, ...stressClient(s, c).map((r) => r.shortfall));
}

const REGIME_PD: Record<Regime, number> = { bull: 0.7, steady: 1, choppy: 1.3, recovery: 1.5, stressed: 2.5, crisis: 5 };
export const RISK_WEIGHT: Record<string, number> = { A: 0.5, BBB: 0.75, BB: 1.0, B: 1.5, CCC: 2.5 };
export const LGD = 0.7;
export const HURDLE = 0.12;
export const CCR_CAPITAL_RATIO = 0.105;
export const LEVERAGE_CAPITAL_RATIO = 0.04;
export const OP_RISK_CAPITAL = 4e6;

export function effectivePD(s: GameState, c: Client): number {
  const av = accountValue(s, c);
  const levRatio = av.equity > 0 ? av.leverage / Math.max(1, c.profile.targetGross) : 3;
  const levFactor = 1 + Math.max(0, levRatio - 1) * 1.5;
  const dd = c.fund.peakNav > 0 ? 1 - c.fund.nav / c.fund.peakNav : 0;
  const ddFactor = 1 + Math.max(0, dd - 0.05) * 8;
  const callFactor = c.marginCall && c.marginCall.status === 'open' ? 4 : 1;
  const diff = s.difficulty === 'expert' ? 1.4 : s.difficulty === 'advanced' ? 1.15 : 1;
  return Math.min(0.95, c.profile.basePD * REGIME_PD[s.market.regime] * levFactor * ddFactor * callFactor * diff);
}

export interface ClientEconomics {
  revenue: number; // annualised run-rate of accounting P&L attributable (before credit losses)
  expectedLoss: number; // annual
  capital: number;
  capitalCCR: number;
  capitalLeverage: number;
  binding: 'CCR' | 'Leverage';
  costOfCapital: number;
  economicProfit: number;
  roac: number;
  exposure: number;
  ead: number;
  pd: number;
  leverageExposure: number;
}

/** Annualised run-rate economics at current balances and rates. */
export function clientEconomics(s: GameState, c: Client): ClientEconomics {
  const revenue = projectClientAnnual(s, c).total;
  const exposure = stressExposure(s, c);
  const pd = effectivePD(s, c);
  const expectedLoss = pd * LGD * exposure;
  const av = accountValue(s, c);
  const ext = shortSourcing(s, c).reduce((a, r) => a + r.extCollateral, 0);
  const ead = exposure + 0.05 * (av.gmv + av.futGross * 0.3);
  const capitalCCR = CCR_CAPITAL_RATIO * (RISK_WEIGHT[c.profile.rating] ?? 1) * ead;
  const leverageExposure = clientDebit(s, c.id) + ext + 0.05 * av.gmv + 0.02 * av.futGross;
  const capitalLeverage = LEVERAGE_CAPITAL_RATIO * leverageExposure;
  const capital = Math.max(capitalCCR, capitalLeverage);
  const costOfCapital = HURDLE * capital;
  const economicProfit = revenue - expectedLoss - costOfCapital;
  return {
    revenue,
    expectedLoss,
    capital,
    capitalCCR,
    capitalLeverage,
    binding: capitalCCR > capitalLeverage ? 'CCR' : 'Leverage',
    costOfCapital,
    economicProfit,
    roac: capital > 0 ? (revenue - expectedLoss) / capital : 0,
    exposure,
    ead,
    pd,
    leverageExposure,
  };
}

export function capitalExplain(s: GameState, c: Client): Calc {
  const e = clientEconomics(s, c);
  return calc(`Capital allocated to ${c.short}`, e.capital, {
    formula: 'max(counterparty-credit capital, leverage capital)',
    note: 'Illustrative Basel-style allocation. Prime brokerage is often constrained by leverage (balance-sheet) capital rather than risk-weighted capital, because well-margined loans have low risk but still consume balance sheet.',
    children: [
      calc('Counterparty credit capital', e.capitalCCR, {
        formula: `${(CCR_CAPITAL_RATIO * 100).toFixed(1)}% × risk weight ${(RISK_WEIGHT[c.profile.rating] * 100).toFixed(0)}% × EAD`,
        children: [
          calc('Stress exposure (shortfall after worst scenario)', e.exposure),
          calc('Potential future exposure add-on (5% of gross)', e.ead - e.exposure),
          calc('Exposure at default (EAD)', e.ead),
        ],
      }),
      calc('Leverage capital', e.capitalLeverage, {
        formula: `${(LEVERAGE_CAPITAL_RATIO * 100).toFixed(0)}% × leverage exposure`,
        children: [calc('Leverage exposure (debit + lender collateral + 5% gross + 2% futures)', e.leverageExposure)],
      }),
    ],
  });
}

export function economicProfitExplain(s: GameState, c: Client): Calc {
  const e = clientEconomics(s, c);
  return calc(`Economic profit — ${c.short} (annual run-rate)`, e.economicProfit, {
    formula: 'Net revenue − expected loss − 12% × allocated capital',
    children: [
      calc('Net revenue run-rate (current balances × current rates)', e.revenue),
      calc('Expected credit loss = PD × LGD × stress exposure', -e.expectedLoss, {
        children: [
          calc('Probability of default (annual)', e.pd, { fmt: 'pct' }),
          calc('Loss given default', LGD, { fmt: 'pct' }),
          calc('Stress exposure', e.exposure),
        ],
      }),
      calc('Cost of capital (12% hurdle)', -e.costOfCapital, { children: [capitalExplain(s, c)] }),
      calc('Return on allocated capital', e.roac, { fmt: 'pct' }),
    ],
  });
}

export interface DeskRisk {
  capitalUsed: number;
  clientCapital: number;
  opRisk: number;
  stressExposure: number;
  expectedLoss: number;
  largestExposure: { clientId: string; value: number } | null;
}

export function deskRisk(s: GameState): DeskRisk {
  let clientCapital = 0;
  let exposure = 0;
  let el = 0;
  let largest: { clientId: string; value: number } | null = null;
  for (const c of activeClients(s)) {
    const e = clientEconomics(s, c);
    clientCapital += e.capital;
    exposure += e.exposure;
    el += e.expectedLoss;
    if (!largest || e.exposure > largest.value) largest = { clientId: c.id, value: e.exposure };
  }
  return { capitalUsed: clientCapital + OP_RISK_CAPITAL, clientCapital, opRisk: OP_RISK_CAPITAL, stressExposure: exposure, expectedLoss: el, largestExposure: largest };
}

/** Desk-wide scenario: combined shortfall across clients if the scenario hit all books at once. */
export function deskScenario(s: GameState) {
  return SCENARIOS.map((sc) => {
    let pnl = 0;
    let shortfall = 0;
    const byClient: { clientId: string; pnl: number; shortfall: number; equity: number }[] = [];
    for (const c of activeClients(s)) {
      const r = stressClient(s, c).find((x) => x.id === sc.id)!;
      pnl += r.pnl;
      shortfall += r.shortfall;
      byClient.push({ clientId: c.id, pnl: r.pnl, shortfall: r.shortfall, equity: accountValue(s, c).equity });
    }
    return { ...sc, pnl, shortfall, byClient };
  });
}
