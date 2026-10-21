import { describe, expect, it } from 'vitest';
import {
  HISTORY, afterStop, bookNav, checkPlan, covariance, commonReturns, deserializeAlloc, estimate, marketPath, nav, newAllocGame,
  runRound, serializeAlloc, type AllocConfig, type AllocState, type Plan,
} from '../src/engine/allocator';

const cfg = (seed = 'alloc', extra: Partial<AllocConfig> = {}): AllocConfig => ({ seed, nav0: 1e9, targetVol: 0.08, payout: 0.18, platformStop: 0.12, maxGross: 3, rounds: null, ...extra });
const available = (s: AllocState) => Object.values(s.pms).filter((p) => p.status === 'candidate' || p.status === 'active');
const equalRisk = (s: AllocState, stop = 0.1, risk = 0.08): Plan[] => {
  const pms = available(s);
  return pms.map((p) => ({ id: p.id, riskBudget: (risk * nav(s)) / pms.length, stop }));
};

describe('allocator engine', () => {
  it('market path and PM returns are deterministic from the seed', () => {
    expect(marketPath('x')[50].Z).toEqual(marketPath('x')[50].Z);
    const a = runRound(newAllocGame(cfg('det')), equalRisk(newAllocGame(cfg('det'))), 6).state;
    const b = runRound(newAllocGame(cfg('det')), [], 6).state;
    for (const id of Object.keys(a.pms)) expect(a.pms[id].live).toEqual(b.pms[id].live);
  });

  it('PMs pitch with full track records, survivorship-filtered', () => {
    const s = newAllocGame(cfg());
    const pms = Object.values(s.pms);
    expect(pms.length).toBe(9);
    pms.forEach((p) => expect(p.track.length).toBe(HISTORY));
    // most pitched records look decent even though true skill is modest on average
    const looks = pms.filter((p) => estimate(p).srRaw > 0.6).length;
    expect(looks).toBeGreaterThanOrEqual(6);
  });

  it('risk budgets convert to capital through estimated vol', () => {
    const s = newAllocGame(cfg());
    const p = available(s)[0];
    const chk = checkPlan(s, [{ id: p.id, riskBudget: 1e7, stop: 0.1 }]);
    expect(chk.capital[p.id] * estimate(p).vol).toBeCloseTo(1e7, -2);
  });

  it('stops cut PMs and return their capital; the no-stop shadow keeps them', () => {
    let s = newAllocGame(cfg('stops'));
    let stopped = 0;
    for (let r = 0; r < 8 && s.status === 'playing'; r++) {
      const { state, record } = runRound(s, equalRisk(s, 0.02), 6);
      stopped += record.pms.filter((x) => x.stopped).length;
      s = state;
    }
    expect(stopped).toBeGreaterThan(0);
    const st = Object.values(s.pms).find((p) => p.status === 'stopped')!;
    expect(s.book.pms[st.id].V).toBe(0);
    expect(afterStop(st, 4)).not.toBeNull();
  });

  it('accounting: NAV equals cash plus PM books, fees only on PM profits', () => {
    let s = newAllocGame(cfg('acct'));
    for (let r = 0; r < 5; r++) {
      const { state, record } = runRound(s, equalRisk(s), 4);
      s = state;
      expect(nav(s)).toBeCloseTo(bookNav(s.book), 6);
      expect(Object.values(s.book.pms).every((p) => p.V >= 0)).toBe(true);
      const winners = record.pms.filter((x) => x.pnl > 0).reduce((a, x) => a + x.pnl, 0);
      expect(record.fees).toBeLessThanOrEqual(winners * s.config.payout + 1);
    }
  });

  it('covariance from common windows is symmetric with non-negative variances', () => {
    const s = newAllocGame(cfg());
    const C = covariance(commonReturns(available(s), s.week));
    C.forEach((row, i) => {
      expect(row[i]).toBeGreaterThanOrEqual(0);
      row.forEach((c, j) => expect(c).toBeCloseTo(C[j][i], 12));
    });
  });

  it('rejects plans above the gross limit', () => {
    const s = newAllocGame(cfg());
    const p = available(s)[0];
    expect(() => runRound(s, [{ id: p.id, riskBudget: 5 * nav(s), stop: 0.1 }], 4)).toThrow();
  });

  it('save/load round-trips', () => {
    const s = runRound(newAllocGame(cfg()), [], 4).state;
    expect(deserializeAlloc(serializeAlloc(s))).toEqual(s);
  });
});

describe('allocator persistence edge cases', () => {
  it('"no stop" (1) survives a save/load and never triggers', () => {
    let s = newAllocGame(cfg('nostop'));
    const pms = available(s);
    const plan = pms.map((p) => ({ id: p.id, riskBudget: 0.01 * nav(s), stop: 1 }));
    s = deserializeAlloc(serializeAlloc(runRound(s, plan, 6).state));
    const { record } = runRound(s, plan.filter((p) => s.pms[p.id].status !== 'stopped'), 8);
    expect(record.pms.every((x) => !x.stopped)).toBe(true);
  });
});
