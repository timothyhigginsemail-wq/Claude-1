// Desk-level analytics and drill-down explanations.

import { accountValue, activeClients } from './accounts';
import { calc, sumCalc, type Calc } from './explain';
import {
  BUFFER_SPREAD_BPS,
  CCP_SPREAD_BPS,
  COMMITMENT_FEE_BPS,
  EMERGENCY_SPREAD_BPS,
  ftpRate,
  liquidityMetrics,
  projectClientAnnual,
  repoRate,
  reserveCalc,
  RESERVE_SPREAD_BPS,
  servicingAllocation,
  termRepoTotal,
} from './funding';
import { ACC, bal, balanceSheet } from './ledger';
import { clientFee, COLLATERAL_MARGIN, internalisationRate } from './lending';
import { clientEconomics, deskRisk, HURDLE } from './risk';
import type { DeskPnl, GameState } from './types';

export const PNL_KEYS: (keyof DeskPnl)[] = [
  'financing',
  'creditInterest',
  'shortRebate',
  'lenderRebate',
  'repoInterest',
  'treasuryInterest',
  'commitmentFee',
  'emergencyInterest',
  'bufferIncome',
  'reserveIncome',
  'ccpIncome',
  'clearing',
  'opex',
  'creditLoss',
];

export const PNL_LABEL: Record<keyof DeskPnl, string> = {
  financing: 'Margin financing interest',
  creditInterest: 'Interest paid on client credits',
  shortRebate: 'Short rebates (paid − / negative rebates received +)',
  lenderRebate: 'Rebates on stock-loan cash collateral',
  repoInterest: 'Repo funding cost',
  treasuryInterest: 'Treasury facility interest',
  commitmentFee: 'Facility commitment fee',
  emergencyInterest: 'Emergency funding interest',
  bufferIncome: 'Liquidity buffer income',
  reserveIncome: 'Customer reserve account income',
  ccpIncome: 'Interest on CCP margin',
  clearing: 'Clearing, settlement & give-up fees',
  opex: 'Operating costs',
  creditLoss: 'Credit losses / recoveries',
};

export function emptyDeskPnl(): DeskPnl {
  return Object.fromEntries(PNL_KEYS.map((k) => [k, 0])) as unknown as DeskPnl;
}

/** Income-positive view of the pnl:* ledger accounts. */
export function pnlFromLedger(s: GameState, base?: Record<string, number>): DeskPnl {
  const out = emptyDeskPnl();
  for (const k of PNL_KEYS) {
    const acc = ACC.pnl(k);
    out[k] = -(bal(s.ledger, acc) - (base?.[acc] ?? 0));
  }
  return out;
}

export function pnlTotal(p: DeskPnl): number {
  return PNL_KEYS.reduce((a, k) => a + p[k], 0);
}

export function revenueOf(p: DeskPnl): number {
  return p.financing + p.creditInterest + p.shortRebate + p.lenderRebate + p.clearing + p.repoInterest + p.treasuryInterest + p.commitmentFee + p.emergencyInterest + p.bufferIncome + p.reserveIncome + p.ccpIncome;
}

export function snapshotPnlBalances(s: GameState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of PNL_KEYS) out[ACC.pnl(k)] = bal(s.ledger, ACC.pnl(k));
  return out;
}

/** Annual funding P&L at current balances (income-positive). */
export function projectFundingAnnual(s: GameState) {
  const sofr = s.market.sofr;
  const repo = -bal(s.ledger, ACC.repo);
  const treasury = -bal(s.ledger, ACC.treasury);
  const emergency = -bal(s.ledger, ACC.emergency);
  const cash = Math.max(0, bal(s.ledger, ACC.cash));
  const reserve = bal(s.ledger, ACC.reserve);
  const ccp = bal(s.ledger, ACC.ccp);
  const items = {
    repo: -repo * repoRate(s),
    termRepo: -s.desk.termRepos.reduce((a, t) => a + t.amount * (sofr + t.spreadBps / 1e4), 0),
    treasury: -treasury * ftpRate(s),
    commitment: -Math.max(0, s.desk.facilityLimit - treasury) * COMMITMENT_FEE_BPS / 1e4,
    emergency: -emergency * (sofr + EMERGENCY_SPREAD_BPS / 1e4),
    buffer: cash * (sofr - BUFFER_SPREAD_BPS / 1e4),
    reserve: reserve * Math.max(0, sofr - RESERVE_SPREAD_BPS / 1e4),
    ccp: ccp * Math.max(0, sofr - CCP_SPREAD_BPS / 1e4),
  };
  const total = Object.values(items).reduce((a, b) => a + b, 0);
  return { ...items, total, balances: { repo, treasury, emergency, cash, reserve, ccp, termRepo: termRepoTotal(s) } };
}

export interface DeskSummary {
  revenueRunRate: number;
  clientRunRate: number;
  centralRunRate: number;
  overheadRunRate: number;
  capitalUsed: number;
  allocated: number;
  capitalUtil: number;
  stressExposure: number;
  expectedLoss: number;
  economicProfitRunRate: number;
  roac: number;
  grossClientMV: number;
  longMV: number;
  shortMV: number;
  debits: number;
  credits: number;
  shortProceeds: number;
  extCollateral: number;
  reserve: number;
  cash: number;
  repo: number;
  termRepo: number;
  treasury: number;
  emergency: number;
  repoCapacity: number;
  lcr: number;
  internalisation: number;
  clients: number;
  equity: number;
  netFundingNeed: number;
}

export function deskSummary(s: GameState): DeskSummary {
  const bs = balanceSheet(s);
  let clientRun = 0;
  let allocatedFunding = 0;
  let longMV = 0;
  let shortMV = 0;
  const clients = activeClients(s);
  for (const c of clients) {
    const p = projectClientAnnual(s, c);
    clientRun += p.total;
    allocatedFunding += p.ftp + p.collateralCredit;
    const av = accountValue(s, c);
    longMV += av.longMV;
    shortMV += av.shortMV;
  }
  const fund = projectFundingAnnual(s);
  // lender rebates are attributed to clients; the central residual is funding actual − allocated
  const centralRun = fund.total - allocatedFunding;
  const overheadRun = -(s.desk.opexPerYear - servicingAllocation(s).total);
  const revenueRunRate = clientRun + centralRun + overheadRun;
  const risk = deskRisk(s);
  const lm = liquidityMetrics(s);
  const capitalUsed = risk.capitalUsed;
  return {
    revenueRunRate,
    clientRunRate: clientRun,
    centralRunRate: centralRun,
    overheadRunRate: overheadRun,
    capitalUsed,
    allocated: s.desk.allocatedCapital,
    capitalUtil: capitalUsed / s.desk.allocatedCapital,
    stressExposure: risk.stressExposure,
    expectedLoss: risk.expectedLoss,
    economicProfitRunRate: revenueRunRate - risk.expectedLoss - HURDLE * capitalUsed,
    roac: capitalUsed > 0 ? (revenueRunRate - risk.expectedLoss) / capitalUsed : 0,
    grossClientMV: longMV + shortMV,
    longMV,
    shortMV,
    debits: bs.assets.marginLoans,
    credits: bs.liabilities.freeCredits,
    shortProceeds: bs.liabilities.shortProceeds,
    extCollateral: bs.assets.stockBorrowCollateral,
    reserve: bs.assets.reserve,
    cash: bs.assets.cash,
    repo: bs.liabilities.repo,
    termRepo: bs.liabilities.termRepo,
    treasury: bs.liabilities.treasury,
    emergency: bs.liabilities.emergency,
    repoCapacity: s.alloc.repoCapacity,
    lcr: lm.lcr,
    internalisation: internalisationRate(s),
    clients: clients.length,
    equity: bs.equity.total,
    netFundingNeed: bs.assets.marginLoans + bs.assets.stockBorrowCollateral + bs.assets.reserve + bs.assets.ccpMargin - bs.liabilities.freeCredits - bs.liabilities.shortProceeds,
  };
}

// ---------------- explanations ----------------

export function fundingSourcesExplain(s: GameState): Calc {
  const bs = balanceSheet(s);
  const uses = sumCalc('Uses of cash', [
    calc('Margin loans to clients (debit balances)', bs.assets.marginLoans, { note: 'Atlas paid the street for client purchases beyond the client\'s own equity.' }),
    calc('Cash collateral posted to stock lenders (102%)', bs.assets.stockBorrowCollateral, { note: 'Needed to borrow shares externally for client shorts. Earns the lender\'s rebate.' }),
    calc('Special reserve account (15c3-3)', bs.assets.reserve, { note: 'Customer credits that exceed customer debits are locked up here.' }),
    calc('Futures initial margin at CCP', bs.assets.ccpMargin),
    calc('Liquidity buffer (HQLA / cash)', bs.assets.cash),
  ]);
  const sources = sumCalc('Sources of cash', [
    calc('Client free credit balances', bs.liabilities.freeCredits, { note: 'Customer cash: may fund customer debits only (reserve formula).' }),
    calc('Client short-sale proceeds', bs.liabilities.shortProceeds, { note: 'Restricted customer credits. When a short is covered internally they fund other customers\' debits; when borrowed externally they go to the lender as collateral.' }),
    calc('Overnight repo (rehypothecated customer collateral)', bs.liabilities.repo),
    calc('Term repo', bs.liabilities.termRepo),
    calc('Treasury facility (unsecured, FTP)', bs.liabilities.treasury),
    calc('Emergency funding', bs.liabilities.emergency),
    calc('Desk equity (allocated capital + retained P&L)', bs.equity.total),
  ]);
  return calc('Desk balance sheet', bs.assets.total, {
    note: 'Customer securities (client longs, borrowed shares) are off balance sheet: they belong to customers or lenders. Only cash claims appear here. Uses always equal sources.',
    children: [uses, sources],
  });
}

export function runRateExplain(s: GameState): Calc {
  const d = deskSummary(s);
  const fund = projectFundingAnnual(s);
  const sofr = s.market.sofr;
  const clientRows: Calc[] = activeClients(s).map((c) => {
    const p = projectClientAnnual(s, c);
    const av = accountValue(s, c);
    return calc(c.name, p.total, {
      children: [
        calc(`Financing: ${(av.debit / 1e6).toFixed(1)}m debit × (SOFR ${(sofr * 100).toFixed(2)}% + ${c.terms.financingSpreadBps}bp)`, p.financing),
        calc(`Credit interest on ${(av.credit / 1e6).toFixed(1)}m credits`, p.creditInterest),
        calc('Short rebates paid / negative rebates received', p.shortRebate, { children: shortRebateRows(s, c.id) }),
        calc('Lender rebate on attributable collateral', p.lenderRebate),
        calc('Internal lending transfer (+ supplier / − user)', p.internalLending),
        calc(`FTP on net funding use ${(p.netUse / 1e6).toFixed(1)}m @ ${(ftpRate(s) * 100).toFixed(2)}%`, p.ftp, { note: 'Net use = debit + lender collateral + CCP margin − credits − short proceeds. Negative net use (a funding provider) earns an FTP credit.' }),
        calc('Collateral credit (securities enabling repo)', p.collateralCredit),
        calc('Clearing & settlement fees', p.clearing),
        calc('Allocated servicing cost', p.servicing),
      ],
    });
  });
  return calc('Annual net revenue run-rate', d.revenueRunRate, {
    note: 'Current balances × current rates, annualised (ACT/360). It moves every day with balances, SOFR, borrow fees and funding spreads.',
    children: [
      sumCalc('Client contributions (after FTP)', clientRows),
      calc('Central treasury residual', d.centralRunRate, {
        formula: 'Actual funding P&L − FTP charged to clients',
        note: 'Positive when funding is cheaper than FTP (equity funding, cheap repo); negative from reserve drag, idle buffer and commitment fees.',
        children: [
          calc(`Overnight repo ${(fund.balances.repo / 1e6).toFixed(1)}m @ ${(repoRate(s) * 100).toFixed(2)}%`, fund.repo),
          calc(`Term repo ${(fund.balances.termRepo / 1e6).toFixed(1)}m`, fund.termRepo),
          calc(`Treasury ${(fund.balances.treasury / 1e6).toFixed(1)}m @ ${(ftpRate(s) * 100).toFixed(2)}%`, fund.treasury),
          calc('Commitment fee on undrawn facility', fund.commitment),
          calc('Emergency funding', fund.emergency),
          calc(`Buffer ${(fund.balances.cash / 1e6).toFixed(1)}m @ SOFR−${BUFFER_SPREAD_BPS}bp`, fund.buffer),
          calc(`Reserve account ${(fund.balances.reserve / 1e6).toFixed(1)}m @ SOFR−${RESERVE_SPREAD_BPS}bp`, fund.reserve),
          calc('CCP margin interest', fund.ccp),
          calc('Less: FTP & collateral credits charged to clients', d.centralRunRate - fund.total),
        ],
      }),
      calc('Unallocated desk overhead', d.overheadRunRate),
    ],
  });
}

function shortRebateRows(s: GameState, clientId: string): Calc[] {
  const c = s.clients[clientId];
  const rows: Calc[] = [];
  for (const id in c.positions) {
    const q = c.positions[id];
    const sec = s.securities[id];
    if (q >= 0 || sec.kind === 'future') continue;
    const mv = -q * sec.price;
    const fee = clientFee(s, c, id);
    const rate = s.market.sofr - fee / 1e4;
    rows.push(calc(`${id}: ${(mv / 1e6).toFixed(1)}m × rebate ${(rate * 100).toFixed(2)}% (SOFR − ${fee}bp fee)`, -mv * rate));
  }
  return rows;
}

/** Cumulative (period) net financing revenue with balances, rates and accrual days. */
export function periodFinancingExplain(s: GameState): Calc {
  const p = pnlFromLedger(s);
  const rows: Calc[] = Object.values(s.clients)
    .filter((c) => c.accum.days > 0)
    .map((c) => {
      const avgDebit = c.accum.debit / c.accum.days;
      const avgCredit = c.accum.credit / c.accum.days;
      const avgSP = c.accum.sp / c.accum.days;
      const impliedRate = c.accum.debit > 0 ? c.pnl.financing / (c.accum.debit / 360) : 0;
      return calc(c.name, c.pnl.financing + c.pnl.creditInterest + c.pnl.shortRebate + c.pnl.lenderRebate, {
        children: [
          calc(`Debit interest: avg ${(avgDebit / 1e6).toFixed(1)}m × ${(impliedRate * 100).toFixed(2)}% × ${c.accum.days}/360 days`, c.pnl.financing),
          calc(`Credit interest: avg credits ${(avgCredit / 1e6).toFixed(1)}m`, c.pnl.creditInterest),
          calc(`Short rebates: avg short proceeds ${(avgSP / 1e6).toFixed(1)}m`, c.pnl.shortRebate),
          calc('Lender rebates attributed', c.pnl.lenderRebate),
        ],
      });
    });
  const net = p.financing + p.creditInterest + p.shortRebate + p.lenderRebate + p.repoInterest + p.treasuryInterest + p.commitmentFee + p.emergencyInterest + p.bufferIncome + p.reserveIncome + p.ccpIncome;
  return calc('Net financing revenue (since you took over)', net, {
    note: `Accrued ACT/360 over ${s.accrualDaysCum} calendar days (weekends accrue on Fridays).`,
    children: [
      sumCalc('Client interest & rebates', rows),
      calc('Funding costs', p.repoInterest + p.treasuryInterest + p.commitmentFee + p.emergencyInterest, {
        children: [
          calc('Repo interest', p.repoInterest),
          calc('Treasury facility interest', p.treasuryInterest),
          calc('Commitment fee', p.commitmentFee),
          calc('Emergency funding', p.emergencyInterest),
        ],
      }),
      calc('Carry on buffer, reserve account and CCP margin', p.bufferIncome + p.reserveIncome + p.ccpIncome),
    ],
  });
}

export function capitalExplainDesk(s: GameState): Calc {
  const r = deskRisk(s);
  return calc('Capital used', r.capitalUsed, {
    children: [
      ...activeClients(s).map((c) => {
        const e = clientEconomics(s, c);
        return calc(`${c.short} (${e.binding === 'CCR' ? 'credit' : 'leverage'}-bound)`, e.capital);
      }),
      calc('Operational risk capital', r.opRisk),
    ],
  });
}

export function reserveCheck(s: GameState) {
  return reserveCalc(s);
}

export { COLLATERAL_MARGIN };
