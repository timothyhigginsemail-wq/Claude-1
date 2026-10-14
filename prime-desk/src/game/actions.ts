// Player actions outside of events: renegotiating client terms, funding policy, desk margin
// parameters and term funding. Margin lock-ups are enforced.

import { settleFunding } from '../engine/funding';
import { fm } from '../engine/format';
import { computeMargin } from '../engine/margin';
import type { ClientTerms, DeskPolicy, GameState } from '../engine/types';
import { addTermRepo, log, postAction } from './events';

type TermKey = keyof Omit<ClientTerms, 'feeOverrides' | 'feeMarkups' | 'termsDay'>;

/** Which direction is "tighter" (adverse to the client) for each margin term. */
const ADVERSE: Partial<Record<TermKey, 1 | -1>> = {
  imMultiplier: 1,
  maintRatio: 1,
  maxGrossLeverage: -1,
  creditLimit: -1,
  concThresholdPct: -1,
  rehypCapPct: 1,
};

export function lockupRemaining(s: GameState, clientId: string): number {
  const c = s.clients[clientId];
  return Math.max(0, c.terms.termsDay + c.terms.lockupDays - s.day);
}

export interface TermsChangeResult {
  ok: boolean;
  message: string;
}

export function changeTerms(s: GameState, clientId: string, patch: Partial<ClientTerms>): TermsChangeResult {
  const c = s.clients[clientId];
  if (!c || c.status !== 'active') return { ok: false, message: 'Client is not active.' };
  const t = c.terms;
  const lock = lockupRemaining(s, clientId);
  const m = computeMargin(s, c);
  const inBreach = m.equity < m.maintenance;
  const adverse: string[] = [];
  for (const k of Object.keys(patch) as TermKey[]) {
    const dir = ADVERSE[k];
    const nv = patch[k] as number;
    const ov = t[k] as number;
    if (dir && typeof nv === 'number' && (nv - ov) * dir > 1e-9) adverse.push(k);
    if (k === 'method' && patch.method === 'regT' && t.method !== 'regT') adverse.push('method');
  }
  if (adverse.length && lock > 0 && !inBreach) {
    return { ok: false, message: `${c.short} has a margin lock-up: you cannot tighten ${adverse.join(', ')} for another ${lock} day${lock === 1 ? '' : 's'} (unless the account is in deficit).` };
  }
  // pricing reaction
  const dSpread = (patch.financingSpreadBps ?? t.financingSpreadBps) - t.financingSpreadBps;
  const dGc = (patch.gcFeeBps ?? t.gcFeeBps) - t.gcFeeBps;
  c.satisfaction -= (dSpread / 40 + dGc / 40) * c.profile.priceSensitivity;
  if (adverse.length) {
    c.relationship = Math.max(0, c.relationship - 3 * adverse.length);
    c.satisfaction -= 0.1 * adverse.length;
  }
  if ((patch.lockupDays ?? t.lockupDays) > t.lockupDays) c.relationship = Math.min(100, c.relationship + 3);
  const before = { ...t };
  Object.assign(t, patch);
  if (adverse.length || (patch.lockupDays ?? before.lockupDays) !== before.lockupDays) t.termsDay = s.day;
  postAction(s);
  const after = computeMargin(s, c);
  const changes = Object.keys(patch)
    .filter((k) => (patch as any)[k] !== (before as any)[k])
    .map((k) => `${k} ${fmtTerm(k, (before as any)[k])} → ${fmtTerm(k, (patch as any)[k])}`)
    .join(', ');
  const msg = `${c.short}: ${changes || 'no change'}.${after.equity < after.maintenance ? ` Account is now below maintenance — expect a margin call tonight (deficit ${fm(after.maintenance - after.equity)}).` : ''}`;
  log(s, `Renegotiated ${msg}`, adverse.length ? 'bad' : 'neutral');
  return { ok: true, message: msg };
}

export function fmtTerm(k: string, v: any): string {
  if (typeof v !== 'number') return String(v);
  if (k.endsWith('Bps')) return `${Math.round(v)}bp`;
  if (k === 'creditLimit') return fm(v);
  if (k === 'imMultiplier' || k === 'maxGrossLeverage') return `${v.toFixed(2)}×`;
  if (k.endsWith('Pct') || k === 'maintRatio') return `${Math.round(v * 100)}%`;
  if (k === 'lockupDays') return `${v}d`;
  return String(v);
}

export function setPolicy(s: GameState, patch: Partial<DeskPolicy>): string {
  Object.assign(s.desk.policy, patch);
  settleFunding(s);
  log(s, `Funding policy updated: buffer ${fm(s.desk.policy.bufferTarget)}, repo usage ${Math.round(s.desk.policy.repoUsage * 100)}%, ${s.desk.policy.repoFirst ? 'repo first' : 'treasury first'}.`);
  return 'Funding policy updated.';
}

export function setDeskMargin(s: GameState, patch: { houseMarketShock?: number; concAddonRate?: number }): string {
  if (patch.houseMarketShock !== undefined) s.desk.houseMarketShock = patch.houseMarketShock;
  if (patch.concAddonRate !== undefined) s.desk.concAddonRate = patch.concAddonRate;
  log(s, `House margin parameters: market shock ${Math.round(s.desk.houseMarketShock * 100)}%, concentration add-on ${Math.round(s.desk.concAddonRate * 100)}%.`);
  return 'House margin model updated. Deficits created by the change are called tonight.';
}

export function lockTermRepo(s: GameState, amount: number): string {
  const spread = Math.round(25 + s.market.repoStressBps + 15);
  const out = addTermRepo(s, amount, spread);
  log(s, out);
  return out;
}

export function clearNameAddon(s: GameState, secId: string): string {
  delete s.desk.nameAddons[secId];
  return `Removed the ${secId} short add-on.`;
}
