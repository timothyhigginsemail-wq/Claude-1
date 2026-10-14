// Securities lending, rehypothecation and internalisation.
//
// Sources of shares for client shorts, in priority order:
//  1. Rehypothecation of OTHER clients' margin securities ("internalisation"). Under the US
//     customer-protection framework (SEC Rule 15c3-3 / Rule 15c2-1, approximated) a broker may
//     re-use customer margin securities only up to 140% of that customer's debit balance; the rest
//     ("excess margin securities") and all fully-paid securities must be segregated. Clients can
//     negotiate a lower cap.
//  2. Borrowing from lenders (the bank's affiliated AM programme or external agent lenders),
//     collateralised with cash at 102% of market value. The lender pays Atlas a rebate on that cash
//     (SOFR − fee), which is negative when the fee exceeds SOFR.
// Rehypothecated securities used to cover shorts cannot also be pledged in repo — each unit sits in
// exactly one bucket.

import { ACC, clientDebit, post } from './ledger';
import type { AllocationSnapshot, BorrowContract, Client, ClientId, GameState, SecId, Security } from './types';

export const COLLATERAL_MARGIN = 1.02;
export const GC_THRESHOLD_BPS = 50;
export const HAIRCUT: Record<string, number> = { A: 0.08, B: 0.15, C: 0.35, none: 1 };
export const REPO_SPREAD: Record<string, number> = { A: 25, B: 45, C: 120, none: 0 };
export const MAX_REHYP = 1.4;

export function sharesOut(sec: Security): number {
  return sec.marketCap / sec.refPrice;
}

export function lendableUnits(sec: Security): number {
  return sec.lendableFrac * sharesOut(sec);
}

export function streetShortUnits(sec: Security): number {
  return sec.streetShortFrac * sharesOut(sec);
}

export function atlasExternalUnits(s: GameState, secId: SecId, lenderId?: string): number {
  let q = 0;
  for (const b of s.borrows) if (b.secId === secId && (!lenderId || b.lenderId === lenderId)) q += b.qty;
  return q;
}

/** Market utilisation including Atlas's own external borrowing. */
export function utilisation(s: GameState, secId: SecId): number {
  const sec = s.securities[secId];
  const lend = lendableUnits(sec);
  if (lend <= 0) return 1;
  return Math.min(1.2, (streetShortUnits(sec) + atlasExternalUnits(s, secId)) / lend);
}

/** Borrow fee curve: GC (~8bp) at low utilisation, rising exponentially as supply tightens
 *  (≈100bp at 70%, ≈600bp at 87%, ≈1,800bp at 98%). Illustrative. */
export function feeFromUtilisation(u: number, squeeze = 0): number {
  const base = 8 + 25 * (Math.exp(10 * Math.max(0, u - 0.55)) - 1);
  return Math.min(9000, base * (1 + 2.5 * squeeze));
}

export function updateMarketFees(s: GameState) {
  for (const id in s.securities) {
    const sec = s.securities[id];
    if (sec.kind === 'future' || sec.lendableFrac <= 0) {
      sec.borrowFeeBps = sec.kind === 'future' ? 0 : 1000;
      continue;
    }
    sec.borrowFeeBps = Math.round(feeFromUtilisation(utilisation(s, id), sec.squeeze));
  }
}

export function lenderFee(s: GameState, lenderId: string, secId: SecId): number {
  const l = s.lenders[lenderId];
  return Math.max(5, Math.round(s.securities[secId].borrowFeeBps * l.feeMult));
}

/** Units a lender can still lend to Atlas. */
export function lenderFree(s: GameState, lenderId: string, secId: SecId): number {
  const sec = s.securities[secId];
  const l = s.lenders[lenderId];
  const free = l.shareOfSupply * Math.max(0, lendableUnits(sec) - streetShortUnits(sec));
  return Math.max(0, free - atlasExternalUnits(s, secId, lenderId));
}

export function borrowTier(sec: Security): 'GC' | 'Warm' | 'HTB' {
  if (sec.borrowFeeBps <= GC_THRESHOLD_BPS) return 'GC';
  if (sec.borrowFeeBps <= 300) return 'Warm';
  return 'HTB';
}

/**
 * Fee Atlas charges a client to borrow a security (bps). Borrow fees on open HTB shorts float
 * daily with the market; a negotiated per-name markup (feeMarkups) scales the market fee, while a
 * fixed fee (feeOverrides) is an explicit commitment that Atlas honours even if the market moves.
 */
export function clientFee(s: GameState, c: Client, secId: SecId): number {
  const o = c.terms.feeOverrides[secId];
  if (o !== undefined) return o;
  const sec = s.securities[secId];
  const mk = c.terms.feeMarkups?.[secId];
  if (sec.borrowFeeBps <= GC_THRESHOLD_BPS) return c.terms.gcFeeBps;
  if (mk !== undefined) return Math.max(c.terms.gcFeeBps, Math.round(sec.borrowFeeBps * mk));
  return Math.max(c.terms.gcFeeBps, Math.round(sec.borrowFeeBps * (1 + c.terms.htbMarkupPct)));
}

/** Rebate rate paid to the client on short proceeds (can be negative). */
export function clientRebateRate(s: GameState, c: Client, secId: SecId): number {
  return s.market.sofr - clientFee(s, c, secId) / 1e4;
}

function emptyAlloc(): AllocationSnapshot {
  return {
    rehypForShorts: {},
    rehypForRepo: {},
    rehypCap: {},
    shortDemand: {},
    internalCover: {},
    externalCover: {},
    shortfall: {},
    repoCapacity: 0,
    repoCollateralValue: 0,
  };
}

export function rehypCapValue(s: GameState, c: Client): number {
  return Math.min(MAX_REHYP, c.terms.rehypCapPct) * clientDebit(s, c.id);
}

/**
 * Allocate rehypothecable customer securities: first to cover other clients' shorts (most valuable
 * names first), then as repo collateral. Respects each client's rehypothecation cap in $ value.
 */
export function computeAllocation(s: GameState): AllocationSnapshot {
  const a = emptyAlloc();
  const clients = Object.values(s.clients).filter((c) => c.status === 'active');
  for (const c of clients) {
    for (const id in c.positions) {
      const q = c.positions[id];
      const sec = s.securities[id];
      if (q < 0 && sec.kind !== 'future') a.shortDemand[id] = (a.shortDemand[id] ?? 0) - q;
    }
  }
  const budget: Record<ClientId, number> = {};
  for (const c of clients) {
    budget[c.id] = rehypCapValue(s, c);
    a.rehypCap[c.id] = budget[c.id];
    a.rehypForShorts[c.id] = {};
    a.rehypForRepo[c.id] = {};
  }
  // 1. internalisation, most expensive borrows first
  const demandSecs = Object.keys(a.shortDemand).sort((x, y) => s.securities[y].borrowFeeBps - s.securities[x].borrowFeeBps);
  for (const secId of demandSecs) {
    const price = s.securities[secId].price;
    let remaining = a.shortDemand[secId];
    let covered = 0;
    // larger long holders first (deterministic order)
    const holders = clients
      .filter((c) => (c.positions[secId] ?? 0) > 0)
      .sort((x, y) => (y.positions[secId] ?? 0) - (x.positions[secId] ?? 0) || x.id.localeCompare(y.id));
    for (const h of holders) {
      if (remaining <= 1e-9) break;
      // positions are net per account, so a holder is never short the same name itself
      const maxByBudget = budget[h.id] / price;
      const units = Math.max(0, Math.min(remaining, h.positions[secId], maxByBudget));
      if (units <= 1e-9) continue;
      a.rehypForShorts[h.id][secId] = units;
      budget[h.id] -= units * price;
      remaining -= units;
      covered += units;
    }
    a.internalCover[secId] = covered;
  }
  // 2. repo collateral from what's left of each client's cap
  let capacity = 0;
  let collValue = 0;
  for (const c of clients) {
    const ids = Object.keys(c.positions)
      .filter((id) => c.positions[id] > 0 && s.securities[id].kind !== 'future' && s.securities[id].repoClass !== 'none')
      .sort((x, y) => s.securities[x].repoClass.localeCompare(s.securities[y].repoClass) || x.localeCompare(y));
    for (const id of ids) {
      if (budget[c.id] <= 1) break;
      const sec = s.securities[id];
      const avail = c.positions[id] - (a.rehypForShorts[c.id][id] ?? 0);
      const units = Math.max(0, Math.min(avail, budget[c.id] / sec.price));
      if (units <= 1e-9) continue;
      a.rehypForRepo[c.id][id] = units;
      const v = units * sec.price;
      budget[c.id] -= v;
      collValue += v;
      capacity += v * (1 - Math.min(0.95, HAIRCUT[sec.repoClass] * s.market.haircutMult));
    }
  }
  a.repoCollateralValue = collValue;
  a.repoCapacity = capacity * s.market.repoAppetite * s.desk.policy.repoUsage;
  // 3. external cover from current contracts
  for (const secId of Object.keys(a.shortDemand)) {
    const need = Math.max(0, a.shortDemand[secId] - (a.internalCover[secId] ?? 0));
    const have = atlasExternalUnits(s, secId);
    a.externalCover[secId] = Math.min(need, have);
    a.shortfall[secId] = Math.max(0, need - have);
  }
  return a;
}

/** Blended overnight repo spread (bps) given the collateral classes pledged. */
export function blendedRepoSpread(s: GameState, a: AllocationSnapshot): number {
  let w = 0;
  let sum = 0;
  for (const cid in a.rehypForRepo) {
    for (const id in a.rehypForRepo[cid]) {
      const sec = s.securities[id];
      const v = a.rehypForRepo[cid][id] * sec.price;
      w += v;
      sum += v * REPO_SPREAD[sec.repoClass];
    }
  }
  return (w > 0 ? sum / w : REPO_SPREAD.A) + s.market.repoStressBps;
}

function newBorrow(s: GameState, secId: SecId, lenderId: string, qty: number): BorrowContract {
  const b: BorrowContract = { id: `B${s.nextId++}`, secId, lenderId, qty, feeBps: lenderFee(s, lenderId, secId), openedDay: s.day };
  s.borrows.push(b);
  return b;
}

/** Cash collateral moves with each borrow/return at 102% of current market value. */
function postCollateral(s: GameState, secId: SecId, qty: number, memo: string) {
  const amt = qty * s.securities[secId].price * COLLATERAL_MARGIN;
  post(s, 'secborrow', memo, [
    { account: ACC.sbc, amount: amt },
    { account: ACC.cash, amount: -amt },
  ]);
}

export interface BorrowOutcome {
  borrowed: Record<SecId, number>;
  returned: Record<SecId, number>;
  shortfall: Record<SecId, number>;
}

/**
 * Bring external borrow contracts in line with what internalisation can't cover: return surplus
 * (most expensive first) and borrow any deficit from the cheapest lenders with free supply.
 * `allowNew` restricts which securities may be newly borrowed (e.g. player-controlled sourcing).
 */
export function rebalanceBorrows(s: GameState, opts: { allowNew?: (secId: SecId) => boolean; excludeLenders?: string[] } = {}): BorrowOutcome {
  const out: BorrowOutcome = { borrowed: {}, returned: {}, shortfall: {} };
  const a = computeAllocation(s);
  const secs = new Set<SecId>([...Object.keys(a.shortDemand), ...s.borrows.map((b) => b.secId)]);
  for (const secId of secs) {
    const need = Math.max(0, (a.shortDemand[secId] ?? 0) - (a.internalCover[secId] ?? 0));
    let have = atlasExternalUnits(s, secId);
    if (have > need + 1e-6) {
      let excess = have - need;
      const contracts = s.borrows.filter((b) => b.secId === secId).sort((x, y) => y.feeBps - x.feeBps);
      for (const b of contracts) {
        if (excess <= 1e-9) break;
        const q = Math.min(b.qty, excess);
        b.qty -= q;
        excess -= q;
        postCollateral(s, secId, -q, `Return ${secId} to ${s.lenders[b.lenderId].name}; collateral released`);
        out.returned[secId] = (out.returned[secId] ?? 0) + q;
      }
      s.borrows = s.borrows.filter((b) => b.qty > 1e-9);
    } else if (need > have + 1e-6) {
      if (opts.allowNew && !opts.allowNew(secId)) {
        out.shortfall[secId] = need - have;
        continue;
      }
      let deficit = need - have;
      const excluded = [...(opts.excludeLenders ?? []), ...(s.lenderPrefs[secId] ?? [])];
      const lenders = Object.keys(s.lenders)
        .filter((l) => !excluded.includes(l))
        .sort((x, y) => lenderFee(s, x, secId) - lenderFee(s, y, secId) || x.localeCompare(y));
      for (const l of lenders) {
        if (deficit <= 1e-9) break;
        const free = lenderFree(s, l, secId);
        const q = Math.min(free, deficit);
        if (q <= 1e-9) continue;
        const existing = s.borrows.find((b) => b.secId === secId && b.lenderId === l);
        if (existing) existing.qty += q;
        else newBorrow(s, secId, l, q);
        postCollateral(s, secId, q, `Borrow ${secId} from ${s.lenders[l].name}; post 102% cash collateral`);
        deficit -= q;
        out.borrowed[secId] = (out.borrowed[secId] ?? 0) + q;
      }
      if (deficit > 1e-6) out.shortfall[secId] = deficit;
    }
  }
  s.alloc = computeAllocation(s);
  return out;
}

/** Re-mark cash collateral at lenders to 102% of current market value; reprice open borrows. */
export function markBorrows(s: GameState) {
  let target = 0;
  for (const b of s.borrows) {
    target += b.qty * s.securities[b.secId].price * COLLATERAL_MARGIN;
    b.feeBps = lenderFee(s, b.lenderId, b.secId);
  }
  const cur = s.ledger.balances[ACC.sbc] ?? 0;
  const d = target - cur;
  if (Math.abs(d) > 1e-6) {
    post(s, 'collmark', `Stock-loan collateral marked to market (${d >= 0 ? 'Atlas posts' : 'lenders return'} ${(Math.abs(d) / 1e6).toFixed(2)}m)`, [
      { account: ACC.sbc, amount: d },
      { account: ACC.cash, amount: -d },
    ]);
  }
}

/** Internal supply (rehypothecable units from other clients + affiliate free supply) for a security. */
export function internalSupply(s: GameState, secId: SecId, excludeClient?: ClientId) {
  const sec = s.securities[secId];
  const a = s.alloc;
  const rows: { source: string; clientId?: ClientId; units: number; value: number; note: string }[] = [];
  for (const c of Object.values(s.clients)) {
    if (c.status !== 'active' || c.id === excludeClient) continue;
    const held = c.positions[secId] ?? 0;
    if (held <= 0) continue;
    const used = a.rehypForShorts[c.id]?.[secId] ?? 0;
    // budget remaining for this client after all other allocations (repo collateral can be substituted)
    const cap = a.rehypCap[c.id] ?? 0;
    let usedShortsValue = 0;
    for (const id in a.rehypForShorts[c.id] ?? {}) usedShortsValue += (a.rehypForShorts[c.id][id] ?? 0) * s.securities[id].price;
    const headroomUnits = Math.max(0, (cap - usedShortsValue) / sec.price);
    const units = Math.max(0, Math.min(held - used, headroomUnits));
    rows.push({
      source: 'rehyp',
      clientId: c.id,
      units,
      value: units * sec.price,
      note: `${c.short} holds ${(held * sec.price / 1e6).toFixed(1)}m; rehyp cap ${(cap / 1e6).toFixed(1)}m (${Math.round(c.terms.rehypCapPct * 100)}% of debit), ${(used * sec.price / 1e6).toFixed(1)}m already lent`,
    });
  }
  const aff = lenderFree(s, 'atlasAM', secId);
  rows.push({ source: 'affiliate', units: aff, value: aff * sec.price, note: 'Atlas Asset Management lending programme (fee split to beneficial owners)' });
  return rows;
}

export function externalSupply(s: GameState, secId: SecId) {
  return Object.values(s.lenders)
    .filter((l) => !l.affiliate)
    .map((l) => ({ lenderId: l.id, name: l.name, units: lenderFree(s, l.id, secId), fee: lenderFee(s, l.id, secId), recall: l.recallPropensity }))
    .sort((x, y) => x.fee - y.fee);
}

/** Fraction of client short demand covered by internalisation. */
export function internalisationRate(s: GameState): number {
  let d = 0;
  let i = 0;
  for (const id in s.alloc.shortDemand) {
    const p = s.securities[id].price;
    d += s.alloc.shortDemand[id] * p;
    i += (s.alloc.internalCover[id] ?? 0) * p;
  }
  return d > 0 ? i / d : 0;
}
