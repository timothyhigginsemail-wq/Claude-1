// Treasury & funding: customer reserve formula, funding waterfall, daily interest accruals and
// funds-transfer-pricing (FTP) attribution.
//
// Customer reserve (SEC Rule 15c3-3 style, simplified and computed daily rather than weekly):
//   credits = client free credit balances + client short-sale proceeds
//   debits  = client debit balances + cash collateral posted to borrow securities for customer shorts
//             + futures margin posted at the CCP (an approximation — futures funds are really
//             segregated under CEA rules)
//   requirement = max(0, credits − 97% × debits) must sit in a Special Reserve Bank Account.
// So customer cash (including short-sale proceeds) can fund customer debits, but never the firm's
// own activities. Any excess is locked up in the reserve account at a low rate.

import { accountValue, activeClients } from './accounts';
import { calc, type Calc } from './explain';
import { ACC, bal, clientCredit, clientDebit, post } from './ledger';
import { blendedRepoSpread, clientFee, computeAllocation, COLLATERAL_MARGIN, HAIRCUT, REPO_SPREAD } from './lending';
import { FUT_IM, volScaler } from './margin';
import type { Client, ClientPnl, GameState } from './types';

export const RESERVE_DEBIT_HAIRCUT = 0.97;
export const BUFFER_SPREAD_BPS = 10; // HQLA yield below SOFR
export const RESERVE_SPREAD_BPS = 35; // reserve bank account yield below SOFR
export const CCP_SPREAD_BPS = 25;
export const COMMITMENT_FEE_BPS = 15;
export const EMERGENCY_SPREAD_BPS = 500;
export const SERVICING_SHARE = 0.6; // share of desk opex allocated to clients by activity

export interface ReserveCalc {
  freeCredits: number;
  shortProceeds: number;
  credits: number;
  debitBalances: number;
  borrowCollateral: number;
  ccpMargin: number;
  debits: number;
  requirement: number;
}

export function reserveCalc(s: GameState): ReserveCalc {
  let freeCredits = 0;
  let shortProceeds = 0;
  let debitBalances = 0;
  for (const c of Object.values(s.clients)) {
    freeCredits += clientCredit(s, c.id);
    debitBalances += clientDebit(s, c.id);
    shortProceeds += -bal(s.ledger, ACC.cliSP(c.id));
  }
  const borrowCollateral = bal(s.ledger, ACC.sbc);
  const ccpMargin = bal(s.ledger, ACC.ccp);
  const credits = freeCredits + shortProceeds;
  const debits = debitBalances + borrowCollateral + ccpMargin;
  return {
    freeCredits,
    shortProceeds,
    credits,
    debitBalances,
    borrowCollateral,
    ccpMargin,
    debits,
    requirement: Math.max(0, credits - RESERVE_DEBIT_HAIRCUT * debits),
  };
}

export function reserveExplain(s: GameState): Calc {
  const r = reserveCalc(s);
  return calc('Customer reserve requirement', r.requirement, {
    formula: 'max(0, customer credits − 97% × customer debits)',
    note: 'Simplified SEC Rule 15c3-3 reserve formula. Customer cash can finance customer debits; any excess must be deposited in a Special Reserve Bank Account for the exclusive benefit of customers.',
    children: [
      calc('Customer credits', r.credits, {
        children: [
          calc('Free credit balances', r.freeCredits),
          calc('Short-sale proceeds (short account credits)', r.shortProceeds, { note: 'Restricted: these fund the stock borrow collateral or other customers\' debits — not the firm.' }),
        ],
      }),
      calc('Customer debits', r.debits, {
        children: [
          calc('Margin loans (debit balances)', r.debitBalances),
          calc('Cash collateral to stock lenders for customer shorts', r.borrowCollateral),
          calc('Futures margin at CCP (approximation)', r.ccpMargin),
        ],
      }),
      calc('97% of debits', RESERVE_DEBIT_HAIRCUT * r.debits),
    ],
  });
}

function futuresIMFor(s: GameState, c: Client): number {
  let im = 0;
  for (const id in c.positions) {
    const sec = s.securities[id];
    if (sec.kind !== 'future') continue;
    im += Math.abs(c.positions[id] * sec.price * (sec.multiplier ?? 1)) * (FUT_IM[id] ?? 0.06) * volScaler(s);
  }
  return im;
}

/** Atlas posts clients' futures initial margin at the CCP. */
export function settleCcpMargin(s: GameState) {
  let target = 0;
  for (const c of activeClients(s)) target += futuresIMFor(s, c);
  const d = target - bal(s.ledger, ACC.ccp);
  if (Math.abs(d) > 1e-6) {
    post(s, 'ccp', `Futures initial margin ${d > 0 ? 'posted to' : 'returned by'} CCP`, [
      { account: ACC.ccp, amount: d },
      { account: ACC.cash, amount: -d },
    ]);
  }
}

export function termRepoTotal(s: GameState): number {
  return -bal(s.ledger, ACC.termRepo);
}

export interface FundingResult {
  reserveMove: number;
  forcedRepoPaydown: number;
  repoDrawn: number;
  treasuryDrawn: number;
  emergencyDrawn: number;
  repaid: number;
}

/**
 * Funding waterfall: (1) top up / release the customer reserve, (2) repay repo that no longer has
 * eligible collateral, (3) restore the cash buffer from repo / treasury facility / emergency
 * funding, or repay the most expensive funding with any surplus cash.
 */
export function settleFunding(s: GameState): FundingResult {
  const res: FundingResult = { reserveMove: 0, forcedRepoPaydown: 0, repoDrawn: 0, treasuryDrawn: 0, emergencyDrawn: 0, repaid: 0 };
  settleCcpMargin(s);
  const rc = reserveCalc(s);
  const curReserve = bal(s.ledger, ACC.reserve);
  const dRes = rc.requirement - curReserve;
  if (Math.abs(dRes) > 1e-6) {
    post(s, 'reserve', dRes > 0 ? 'Deposit to Special Reserve Bank Account (15c3-3)' : 'Release from Special Reserve Bank Account', [
      { account: ACC.reserve, amount: dRes },
      { account: ACC.cash, amount: -dRes },
    ]);
    res.reserveMove = dRes;
  }
  s.alloc = computeAllocation(s);
  const overnightCap = Math.max(0, s.alloc.repoCapacity - termRepoTotal(s));
  let repo = -bal(s.ledger, ACC.repo);
  if (repo > overnightCap + 1e-6) {
    const pay = repo - overnightCap;
    post(s, 'funding', 'Repo paydown: insufficient eligible collateral / counterparty haircut increase', [
      { account: ACC.repo, amount: pay },
      { account: ACC.cash, amount: -pay },
    ]);
    res.forcedRepoPaydown = pay;
    repo -= pay;
  }
  const cash = bal(s.ledger, ACC.cash);
  const target = s.desk.policy.bufferTarget;
  let need = target - cash;
  const treasury = -bal(s.ledger, ACC.treasury);
  const emergency = -bal(s.ledger, ACC.emergency);
  if (need > 1e-6) {
    const draw = (account: string, room: number, label: string): number => {
      const amt = Math.max(0, Math.min(need, room));
      if (amt > 1e-6) {
        post(s, 'funding', label, [
          { account: ACC.cash, amount: amt },
          { account, amount: -amt },
        ]);
        need -= amt;
      }
      return amt;
    };
    const order: ('repo' | 'treasury')[] = s.desk.policy.repoFirst ? ['repo', 'treasury'] : ['treasury', 'repo'];
    for (const o of order) {
      if (o === 'repo') res.repoDrawn += draw(ACC.repo, overnightCap - repo, 'Overnight repo: pledge rehypothecated customer collateral');
      else res.treasuryDrawn += draw(ACC.treasury, s.desk.facilityLimit - treasury, 'Draw on committed treasury facility');
    }
    if (need > 1e-6) {
      res.emergencyDrawn = draw(ACC.emergency, Infinity, 'EMERGENCY overnight funding from bank treasury (penalty rate)');
    }
  } else if (need < -1e-6) {
    let surplus = -need;
    const repay = (account: string, outstanding: number, label: string) => {
      const amt = Math.min(surplus, outstanding);
      if (amt > 1e-6) {
        post(s, 'funding', label, [
          { account, amount: amt },
          { account: ACC.cash, amount: -amt },
        ]);
        surplus -= amt;
        res.repaid += amt;
      }
    };
    repay(ACC.emergency, emergency, 'Repay emergency funding');
    const order: ('repo' | 'treasury')[] = s.desk.policy.repoFirst ? ['treasury', 'repo'] : ['repo', 'treasury'];
    for (const o of order) {
      if (o === 'repo') repay(ACC.repo, repo, 'Repay overnight repo');
      else repay(ACC.treasury, treasury, 'Repay treasury facility');
    }
  }
  s.alloc = computeAllocation(s);
  return res;
}

export function emptyClientPnl(): ClientPnl {
  return { financing: 0, creditInterest: 0, shortRebate: 0, lenderRebate: 0, internalLending: 0, ftp: 0, collateralCredit: 0, clearing: 0, servicing: 0, creditLoss: 0 };
}

export function clientPnlTotal(p: ClientPnl): number {
  return p.financing + p.creditInterest + p.shortRebate + p.lenderRebate + p.internalLending + p.ftp + p.collateralCredit + p.clearing + p.servicing + p.creditLoss;
}

export function ftpRate(s: GameState): number {
  return s.market.sofr + s.market.ftpSpreadBps / 1e4;
}

export function repoRate(s: GameState): number {
  return s.market.sofr + blendedRepoSpread(s, s.alloc) / 1e4;
}

/** Per-client attributable shares of external borrow collateral and internal cover by security. */
export function shortSourcing(s: GameState, c: Client) {
  const rows: { secId: string; units: number; internalUnits: number; externalUnits: number; extCollateral: number }[] = [];
  for (const id in c.positions) {
    const q = c.positions[id];
    const sec = s.securities[id];
    if (q >= 0 || sec.kind === 'future') continue;
    const units = -q;
    const demand = s.alloc.shortDemand[id] ?? units;
    const intShare = demand > 0 ? (s.alloc.internalCover[id] ?? 0) / demand : 0;
    const extShare = demand > 0 ? (s.alloc.externalCover[id] ?? 0) / demand : 0;
    rows.push({
      secId: id,
      units,
      internalUnits: units * intShare,
      externalUnits: units * extShare,
      extCollateral: units * extShare * sec.price * COLLATERAL_MARGIN,
    });
  }
  return rows;
}

export interface AccrualResult {
  days: number;
  centralResidual: number;
  overhead: number;
}

/** Daily interest, fee and cost accruals with client attribution. Uses the given accrual days (ACT/360). */
export function accrue(s: GameState, days: number): AccrualResult {
  const dt = days / 360;
  const sofr = s.market.sofr;
  const clients = activeClients(s);
  // --- client-facing interest
  for (const c of clients) {
    const t = c.terms;
    const debit = clientDebit(s, c.id);
    const credit = clientCredit(s, c.id);
    c.accum.days += days;
    c.accum.debit += debit * days;
    c.accum.credit += credit * days;
    c.accum.sp += -bal(s.ledger, ACC.cliSP(c.id)) * days;
    if (debit > 0) {
      const amt = debit * (sofr + t.financingSpreadBps / 1e4) * dt;
      post(s, 'interest', `Debit interest @ SOFR+${t.financingSpreadBps}bp`, [
        { account: ACC.cliCash(c.id), amount: amt },
        { account: ACC.pnl('financing'), amount: -amt },
      ], c.id);
      c.pnlToday.financing += amt;
    }
    if (credit > 0) {
      const rate = Math.max(0, sofr - t.creditSpreadBps / 1e4);
      const amt = credit * rate * dt;
      post(s, 'interest', `Credit interest @ SOFR−${t.creditSpreadBps}bp`, [
        { account: ACC.cliCash(c.id), amount: -amt },
        { account: ACC.pnl('creditInterest'), amount: amt },
      ], c.id);
      c.pnlToday.creditInterest -= amt;
    }
    for (const id in c.positions) {
      const q = c.positions[id];
      const sec = s.securities[id];
      if (q >= 0 || sec.kind === 'future') continue;
      const mv = -q * sec.price;
      const rate = sofr - clientFee(s, c, id) / 1e4;
      const amt = mv * rate * dt; // positive = Atlas pays rebate; negative = client pays (negative rebate)
      post(s, 'rebate', `Short rebate ${id} @ ${(rate * 100).toFixed(2)}%`, [
        { account: ACC.cliCash(c.id), amount: -amt },
        { account: ACC.pnl('shortRebate'), amount: amt },
      ], c.id);
      c.pnlToday.shortRebate -= amt;
    }
  }
  // --- lender rebates on cash collateral (attributed to shorting clients pro rata)
  const lenderBySec: Record<string, number> = {};
  for (const b of s.borrows) {
    const coll = b.qty * s.securities[b.secId].price * COLLATERAL_MARGIN;
    const amt = coll * (sofr - b.feeBps / 1e4) * dt;
    lenderBySec[b.secId] = (lenderBySec[b.secId] ?? 0) + amt;
  }
  for (const secId in lenderBySec) {
    const amt = lenderBySec[secId];
    post(s, 'rebate', `Lender rebate on ${secId} cash collateral`, [
      { account: ACC.cash, amount: amt },
      { account: ACC.pnl('lenderRebate'), amount: -amt },
    ]);
  }
  // --- internal lending transfer price (zero-sum across clients)
  for (const holderId in s.alloc.rehypForShorts) {
    const holder = s.clients[holderId];
    if (!holder) continue;
    for (const secId in s.alloc.rehypForShorts[holderId]) {
      const u = s.alloc.rehypForShorts[holderId][secId];
      const sec = s.securities[secId];
      holder.pnlToday.internalLending += (u * sec.price * sec.borrowFeeBps) / 1e4 * dt;
    }
  }
  // --- funding costs
  const repo = -bal(s.ledger, ACC.repo);
  const rRepo = repoRate(s);
  const fund = (k: string, amount: number, memo: string) => {
    if (Math.abs(amount) < 1e-9) return;
    post(s, 'funding', memo, [
      { account: ACC.pnl(k), amount },
      { account: ACC.cash, amount: -amount },
    ]);
  };
  fund('repoInterest', repo * rRepo * dt, `Overnight repo interest @ ${(rRepo * 100).toFixed(2)}%`);
  for (const tr of s.desk.termRepos) {
    fund('repoInterest', tr.amount * (sofr + tr.spreadBps / 1e4) * dt, `Term repo ${tr.id} interest @ SOFR+${tr.spreadBps}bp`);
  }
  const treasury = -bal(s.ledger, ACC.treasury);
  fund('treasuryInterest', treasury * ftpRate(s) * dt, `Treasury facility interest @ SOFR+${s.market.ftpSpreadBps}bp`);
  fund('commitmentFee', Math.max(0, s.desk.facilityLimit - treasury) * (COMMITMENT_FEE_BPS / 1e4) * dt, 'Commitment fee on undrawn facility');
  const emergency = -bal(s.ledger, ACC.emergency);
  fund('emergencyInterest', emergency * (sofr + EMERGENCY_SPREAD_BPS / 1e4) * dt, 'Emergency funding interest');
  const cash = bal(s.ledger, ACC.cash);
  fund('bufferIncome', -Math.max(0, cash) * (sofr - BUFFER_SPREAD_BPS / 1e4) * dt, 'Liquidity buffer (HQLA) income');
  const reserve = bal(s.ledger, ACC.reserve);
  fund('reserveIncome', -reserve * Math.max(0, sofr - RESERVE_SPREAD_BPS / 1e4) * dt, 'Special reserve account interest');
  const ccp = bal(s.ledger, ACC.ccp);
  fund('ccpIncome', -ccp * Math.max(0, sofr - CCP_SPREAD_BPS / 1e4) * dt, 'Interest on CCP initial margin');
  const opex = s.desk.opexPerYear * dt;
  fund('opex', opex, 'Desk operating costs (staff, technology, operations)');

  // --- attribution: lender rebate, internal lending charge, FTP, collateral credit, servicing
  const fRate = ftpRate(s);
  let allocatedFunding = 0;
  const actualFunding =
    -(repo * rRepo * dt) -
    s.desk.termRepos.reduce((a, tr) => a + tr.amount * (sofr + tr.spreadBps / 1e4) * dt, 0) -
    treasury * fRate * dt -
    Math.max(0, s.desk.facilityLimit - treasury) * (COMMITMENT_FEE_BPS / 1e4) * dt -
    emergency * (sofr + EMERGENCY_SPREAD_BPS / 1e4) * dt +
    Math.max(0, cash) * (sofr - BUFFER_SPREAD_BPS / 1e4) * dt +
    reserve * Math.max(0, sofr - RESERVE_SPREAD_BPS / 1e4) * dt +
    ccp * Math.max(0, sofr - CCP_SPREAD_BPS / 1e4) * dt;
  let lenderAllocated = 0;
  const totalRepoCap = s.alloc.repoCapacity;
  const repoUsed = totalRepoCap > 0 ? Math.min(1, (repo + termRepoTotal(s)) / totalRepoCap) : 0;
  let activityTotal = 0;
  const activity: Record<string, number> = {};
  for (const c of clients) {
    const av = accountValue(s, c);
    activity[c.id] = av.gmv + av.futGross * 0.2;
    activityTotal += activity[c.id];
  }
  for (const c of clients) {
    const rows = shortSourcing(s, c);
    let extColl = 0;
    for (const r of rows) {
      extColl += r.extCollateral;
      const ext = s.alloc.externalCover[r.secId] ?? 0;
      if (ext > 0 && lenderBySec[r.secId]) {
        const share = r.externalUnits / ext;
        const amt = lenderBySec[r.secId] * share;
        c.pnlToday.lenderRebate += amt;
        lenderAllocated += amt;
      }
      if (r.internalUnits > 0) {
        const sec = s.securities[r.secId];
        c.pnlToday.internalLending -= (r.internalUnits * sec.price * sec.borrowFeeBps) / 1e4 * dt;
      }
    }
    const av = accountValue(s, c);
    const ccpC = futuresIMFor(s, c);
    const netUse = av.debit + extColl + ccpC - av.credit - av.shortProceeds;
    const ftp = -netUse * fRate * dt;
    c.pnlToday.ftp += ftp;
    allocatedFunding += ftp;
    // collateral credit: securities this client lets Atlas pledge in repo save the unsecured rate
    let pledgedCash = 0;
    let spreadW = 0;
    for (const id in s.alloc.rehypForRepo[c.id] ?? {}) {
      const sec = s.securities[id];
      const v = s.alloc.rehypForRepo[c.id][id] * sec.price * (1 - Math.min(0.95, HAIRCUT[sec.repoClass] * s.market.haircutMult));
      pledgedCash += v;
      spreadW += v * (REPO_SPREAD[sec.repoClass] + s.market.repoStressBps);
    }
    if (pledgedCash > 0 && repoUsed > 0) {
      const avgSpread = spreadW / pledgedCash;
      const credit = pledgedCash * repoUsed * Math.max(0, s.market.ftpSpreadBps - avgSpread) / 1e4 * dt;
      c.pnlToday.collateralCredit += credit;
      allocatedFunding += credit;
    }
    const serv = activityTotal > 0 ? -opex * SERVICING_SHARE * (activity[c.id] / activityTotal) : 0;
    c.pnlToday.servicing += serv;
  }
  const unallocatedLender = Object.values(lenderBySec).reduce((a, b) => a + b, 0) - lenderAllocated;
  const servicingAllocated = activityTotal > 0 ? opex * SERVICING_SHARE : 0;
  return {
    days,
    centralResidual: actualFunding - allocatedFunding + unallocatedLender,
    overhead: -(opex - servicingAllocated),
  };
}

export interface LiquidityMetrics {
  buffer: number;
  undrawnFacility: number;
  overnightRepo: number;
  stressedOutflows: number;
  sources: number;
  lcr: number;
  survivalDays: number;
  lines: Calc;
}

/** Internal 30-day liquidity stress (LCR-style, illustrative). */
export function liquidityMetrics(s: GameState): LiquidityMetrics {
  const rc = reserveCalc(s);
  const buffer = Math.max(0, bal(s.ledger, ACC.cash));
  const treasury = -bal(s.ledger, ACC.treasury);
  const undrawn = Math.max(0, s.desk.facilityLimit - treasury);
  const overnightRepo = -bal(s.ledger, ACC.repo);
  let undrawnLines = 0;
  for (const c of activeClients(s)) undrawnLines += Math.max(0, c.terms.creditLimit - clientDebit(s, c.id));
  const outCredits = 0.3 * rc.freeCredits;
  const outShorts = 0.15 * rc.shortProceeds;
  const outRepo = 0.25 * overnightRepo;
  const outLines = 0.1 * undrawnLines;
  const stressed = outCredits + outShorts + outRepo + outLines;
  const sources = buffer + 0.5 * undrawn;
  const lcr = stressed > 0 ? sources / stressed : 9.99;
  return {
    buffer,
    undrawnFacility: undrawn,
    overnightRepo,
    stressedOutflows: stressed,
    sources,
    lcr,
    survivalDays: stressed > 0 ? Math.min(90, (30 * sources) / stressed) : 90,
    lines: calc('Liquidity coverage (30-day stress)', lcr, {
      fmt: 'x',
      formula: '(cash buffer + 50% undrawn facility) / stressed outflows',
      note: 'Internal stress test, illustrative weights. Prime brokerage liquidity risk comes from clients pulling free credits, covering shorts (removing short-proceeds funding), repo counterparties not rolling, and clients drawing on unused margin lines.',
      children: [
        calc('Sources: cash buffer (HQLA)', buffer),
        calc('Sources: 50% of undrawn treasury facility', 0.5 * undrawn),
        calc('Outflow: 30% of free credits withdrawn', outCredits),
        calc('Outflow: 15% of short proceeds lost as shorts cover', outShorts),
        calc('Outflow: 25% of overnight repo not rolled', outRepo),
        calc('Outflow: 10% of undrawn client margin lines drawn', outLines),
      ],
    }),
  };
}

export interface ClientProjection extends ClientPnl {
  total: number;
  netUse: number;
  extCollateral: number;
}

/**
 * Forward-looking annualised economics for a client at today's balances and rates (no postings).
 * Used for profitability run-rates and for "what-if" previews of decisions.
 */
export function projectClientAnnual(s: GameState, c: Client): ClientProjection {
  const sofr = s.market.sofr;
  const t = c.terms;
  const av = accountValue(s, c);
  const p = { ...emptyClientPnl(), total: 0, netUse: 0, extCollateral: 0 };
  p.financing = av.debit * (sofr + t.financingSpreadBps / 1e4);
  p.creditInterest = -av.credit * Math.max(0, sofr - t.creditSpreadBps / 1e4);
  let extColl = 0;
  for (const r of shortSourcing(s, c)) {
    const sec = s.securities[r.secId];
    const mv = r.units * sec.price;
    p.shortRebate -= mv * (sofr - clientFee(s, c, r.secId) / 1e4);
    extColl += r.extCollateral;
    if (r.externalUnits > 0) {
      const contracts = s.borrows.filter((b) => b.secId === r.secId);
      const q = contracts.reduce((a, b) => a + b.qty, 0);
      const avgFee = q > 0 ? contracts.reduce((a, b) => a + b.qty * b.feeBps, 0) / q : sec.borrowFeeBps;
      p.lenderRebate += r.extCollateral * (sofr - avgFee / 1e4);
    }
    p.internalLending -= (r.internalUnits * sec.price * sec.borrowFeeBps) / 1e4;
  }
  for (const secId in s.alloc.rehypForShorts[c.id] ?? {}) {
    const sec = s.securities[secId];
    p.internalLending += (s.alloc.rehypForShorts[c.id][secId] * sec.price * sec.borrowFeeBps) / 1e4;
  }
  const ccpC = futuresIMFor(s, c);
  const netUse = av.debit + extColl + ccpC - av.credit - av.shortProceeds;
  p.ftp = -netUse * ftpRate(s);
  const repo = -bal(s.ledger, ACC.repo) + termRepoTotal(s);
  const repoUsed = s.alloc.repoCapacity > 0 ? Math.min(1, repo / s.alloc.repoCapacity) : 0;
  for (const id in s.alloc.rehypForRepo[c.id] ?? {}) {
    const sec = s.securities[id];
    const v = s.alloc.rehypForRepo[c.id][id] * sec.price * (1 - Math.min(0.95, HAIRCUT[sec.repoClass] * s.market.haircutMult));
    p.collateralCredit += v * repoUsed * Math.max(0, s.market.ftpSpreadBps - REPO_SPREAD[sec.repoClass] - s.market.repoStressBps) / 1e4;
  }
  p.clearing = ((av.gmv + av.futGross * 0.05) * c.profile.turnover * 252 * 0.4) / 1e4;
  let actTotal = 0;
  for (const o of activeClients(s)) {
    const v = accountValue(s, o);
    actTotal += v.gmv + v.futGross * 0.2;
  }
  const act = av.gmv + av.futGross * 0.2;
  p.servicing = actTotal > 0 ? -s.desk.opexPerYear * SERVICING_SHARE * (act / actTotal) : 0;
  p.total = clientPnlTotal(p);
  p.netUse = netUse;
  p.extCollateral = extColl;
  return p;
}
