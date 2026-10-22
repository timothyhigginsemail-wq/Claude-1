import { describe, expect, it } from 'vitest';
import { initialMarket, viewOf, DAY, MarketView, zeroRate, impliedVol, forward } from '../src/engine/market';
import { AutocallInst, autocallMC, solveCoupon, unitPV, bsPrice, digital } from '../src/engine/pricing';
import { instrumentRisk, bumpSpot, bumpVol, bumpCorr } from '../src/engine/risk';
import { normCdf } from '../src/engine/math';

function flatView(vol = 0.2): MarketView {
  const v = viewOf(initialMarket(11));
  for (const a of ['ORX', 'NKT', 'AUR', 'EURUSD'] as const) v.smile[a] = { v: vol, theta: vol, lr: vol, vrp: 0, skew: 0, curv: 0 };
  v.events = [];
  return v;
}
const note = (v: MarketView, over: Partial<AutocallInst> = {}): AutocallInst => ({
  type: 'autocall', assets: ['ORX', 'NKT'], initial: [v.spot.ORX, v.spot.NKT],
  obs: Array.from({ length: 12 }, (_, k) => v.t + (k + 1) * 0.25), callFrom: 1, autocall: 1, couponBarrier: 0.7,
  coupon: 0.02, memory: true, ki: 0.6, next: 0, missed: 0, seed: 5, ...over,
});

describe('autocallable Monte Carlo', () => {
  it('single-asset, no-call, no-coupon note matches the closed form (unsmoothed)', () => {
    const v = flatView(0.25);
    const T = 2;
    const inst = note(v, { assets: ['ORX'], initial: [v.spot.ORX], obs: [v.t + T], autocall: 99, couponBarrier: 99, coupon: 0, ki: 0.7 });
    const r = autocallMC(inst, v, 200000, { band: 0 });
    const rr = zeroRate(v.curve, T);
    const q = 0.014, s = 0.25, k = 0.7;
    const d1 = (Math.log(1 / k) + (rr - q + 0.5 * s * s) * T) / (s * Math.sqrt(T));
    const d2 = d1 - s * Math.sqrt(T);
    const analytic = Math.exp(-(rr + v.fundingSpread) * T) * (1 - normCdf(-d2) + Math.exp((rr - q) * T) * normCdf(-d1));
    expect(Math.abs(r.pv - analytic)).toBeLessThan(4 * r.stdErr + 1e-4);
  });

  it('respects payoff bounds and is linear in the coupon', () => {
    const v = flatView();
    const base = note(v);
    const r0 = autocallMC({ ...base, coupon: 0 }, v);
    const r1 = autocallMC({ ...base, coupon: 0.03 }, v);
    expect(r1.pv).toBeCloseTo(r0.pvExCoupon + 0.03 * r0.couponAnnuity, 10);
    expect(r1.pv).toBeGreaterThan(0);
    expect(r0.pv).toBeLessThan(1); // without coupons you can only lose
    const c = solveCoupon(base, v, 0.97);
    expect(autocallMC({ ...base, coupon: c }, v).pv).toBeCloseTo(0.97, 8);
    const probs = r1.callProb.reduce((a, b) => a + b, 0);
    expect(probs).toBeLessThanOrEqual(1 + 1e-9);
  });

  it('worst-of is cheaper than single-name; higher correlation makes the note worth more', () => {
    const v = flatView();
    const wo = autocallMC(note(v), v, 20000).pv;
    const single = autocallMC(note(v, { assets: ['ORX'], initial: [v.spot.ORX] }), v, 20000).pv;
    expect(wo).toBeLessThan(single);
    const lo = autocallMC(note(v), bumpCorr(v, -20), 20000).pv;
    const hi = autocallMC(note(v), bumpCorr(v, 20), 20000).pv;
    expect(hi).toBeGreaterThan(lo);
  });

  it('holder is long spot, short vol (bank short the note: short delta, long vega)', () => {
    const v = flatView();
    const r = instrumentRisk(note(v), v);
    expect(r.delta.ORX).toBeGreaterThan(0);
    expect(r.delta.NKT).toBeGreaterThan(0);
    expect(r.vega.ORX + r.vega.NKT).toBeLessThan(0);
    // finite-difference delta consistency with an independent bump size
    const up = autocallMC(note(v), bumpSpot(v, 'ORX', 0.03), 8192).pv;
    const dn = autocallMC(note(v), bumpSpot(v, 'ORX', -0.03), 8192).pv;
    expect(((up - dn) / 0.06) * 0.01).toBeCloseTo(r.delta.ORX, 3);
  });
});

describe('smile-consistent pricing', () => {
  it('vanilla put–call parity holds on the smile, digital call+put = DF', () => {
    const v = viewOf(initialMarket(3));
    const T = 0.5;
    const t = v.t;
    const K = Math.round(v.spot.ORX * 0.92);
    const c = unitPV({ type: 'vanilla', asset: 'ORX', cp: 'C', strike: K, expiry: t + T }, v);
    const p = unitPV({ type: 'vanilla', asset: 'ORX', cp: 'P', strike: K, expiry: t + T }, v);
    const F = forward(v, 'ORX', T);
    const D = Math.exp(-zeroRate(v.curve, T) * T);
    expect(c - p).toBeCloseTo(D * (F - K), 6);
    const dc = unitPV({ type: 'digital', asset: 'ORX', cp: 'C', strike: K, expiry: t + T }, v);
    const dp = unitPV({ type: 'digital', asset: 'ORX', cp: 'P', strike: K, expiry: t + T }, v);
    expect(dc + dp).toBeCloseTo(D, 10);
    // skew makes OTM puts richer than calls at the same distance
    expect(impliedVol(v, 'ORX', F * 0.9, T)).toBeGreaterThan(impliedVol(v, 'ORX', F * 1.1, T));
    void bsPrice; void digital;
  });
  it('scheduled event variance raises implied vol only for expiries after the event, then drains', () => {
    const v = viewOf(initialMarket(3));
    const base = impliedVol(v, 'NKT', v.spot.NKT, 0.1);
    const withEvent = { ...v, events: [{ t: v.t + 0.05, asset: 'NKT' as const, v: 0.065 ** 2 }] };
    expect(impliedVol(withEvent, 'NKT', v.spot.NKT, 0.1)).toBeGreaterThan(base + 0.05);
    expect(impliedVol(withEvent, 'NKT', v.spot.NKT, 0.04)).toBeCloseTo(impliedVol(v, 'NKT', v.spot.NKT, 0.04), 12);
    const after = { ...withEvent, t: v.t + 0.06 };
    expect(impliedVol(after, 'NKT', v.spot.NKT, 0.04)).toBeCloseTo(impliedVol({ ...v, t: v.t + 0.06 }, 'NKT', v.spot.NKT, 0.04), 12);
    void bumpVol; void DAY;
  });
});
