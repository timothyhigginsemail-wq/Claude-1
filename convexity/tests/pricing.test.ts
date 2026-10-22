import { describe, expect, it } from 'vitest';
import { barrierPrice, bs, bsPrice, digital, mcSingle, bachelier, black76, impliedVolFromPrice } from '../src/engine/pricing';

const S = 100, T = 0.75, r = 0.04, q = 0.015, sig = 0.22;

describe('Black–Scholes', () => {
  it('satisfies put–call parity', () => {
    for (const K of [70, 90, 100, 115, 140]) {
      const c = bsPrice('C', S, K, T, r, q, sig);
      const p = bsPrice('P', S, K, T, r, q, sig);
      expect(c - p).toBeCloseTo(S * Math.exp(-q * T) - K * Math.exp(-r * T), 10);
    }
  });
  it('respects no-arbitrage bounds', () => {
    for (const K of [50, 100, 200]) {
      const c = bsPrice('C', S, K, T, r, q, sig);
      expect(c).toBeGreaterThanOrEqual(Math.max(0, S * Math.exp(-q * T) - K * Math.exp(-r * T)) - 1e-12);
      expect(c).toBeLessThanOrEqual(S * Math.exp(-q * T));
    }
  });
  it('analytic Greeks match finite differences', () => {
    for (const cp of ['C', 'P'] as const) {
      const g = bs(cp, S, 105, T, r, q, sig);
      const h = 1e-3;
      const fd = (f: (x: number) => number, x: number, hh: number) => (f(x + hh) - f(x - hh)) / (2 * hh);
      expect(g.delta).toBeCloseTo(fd((s) => bsPrice(cp, s, 105, T, r, q, sig), S, h), 6);
      expect(g.gamma).toBeCloseTo(fd((s) => bs(cp, s, 105, T, r, q, sig).delta, S, h), 6);
      expect(g.vega).toBeCloseTo(fd((v) => bsPrice(cp, S, 105, T, r, q, v), sig, 1e-5), 4);
      expect(g.rho).toBeCloseTo(fd((rr) => bsPrice(cp, S, 105, T, rr, q, sig), r, 1e-6), 3);
      expect(g.theta).toBeCloseTo(-fd((t) => bsPrice(cp, S, 105, t, r, q, sig), T, 1e-6), 3);
      expect(g.vanna).toBeCloseTo(fd((v) => bs(cp, S, 105, T, r, q, v).delta, sig, 1e-5), 4);
      expect(g.volga).toBeCloseTo(fd((v) => bs(cp, S, 105, T, r, q, v).vega, sig, 1e-5), 3);
    }
  });
  it('implied vol inverts the price', () => {
    const p = bsPrice('C', S, 110, T, r, q, 0.31);
    expect(impliedVolFromPrice('C', p, S, 110, T, r, q)).toBeCloseTo(0.31, 8);
  });
  it('Black-76 equals BS on the forward; Bachelier ≈ Black near the money', () => {
    const F = S * Math.exp((r - q) * T);
    expect(black76('C', F, 100, T, r, sig)).toBeCloseTo(bsPrice('C', S, 100, T, r, q, sig), 10);
    expect(bachelier('C', F, F, T, r, sig * F)).toBeCloseTo(black76('C', F, F, T, r, sig), 1);
  });
});

describe('digitals', () => {
  it('call + put digital = discount factor; matches call-spread limit', () => {
    const c = digital('C', S, 100, T, r, q, sig);
    const p = digital('P', S, 100, T, r, q, sig);
    expect(c + p).toBeCloseTo(Math.exp(-r * T), 10);
    const h = 0.01;
    const spread = (bsPrice('C', S, 100 - h, T, r, q, sig) - bsPrice('C', S, 100 + h, T, r, q, sig)) / (2 * h);
    expect(c).toBeCloseTo(spread, 5);
  });
  it('smile slope correction matches a call spread priced on the smile', () => {
    const slope = -0.002; // vol falls 0.2pt per unit strike
    const vol = (K: number) => sig + slope * (K - 100);
    const h = 0.01;
    const spread = (bsPrice('C', S, 100 - h, T, r, q, vol(100 - h)) - bsPrice('C', S, 100 + h, T, r, q, vol(100 + h))) / (2 * h);
    expect(digital('C', S, 100, T, r, q, sig, slope)).toBeCloseTo(spread, 4);
  });
});

describe('barriers', () => {
  const cases: [('C' | 'P'), ('down' | 'up'), number, number][] = [
    ['C', 'down', 100, 90], ['C', 'down', 85, 90], ['C', 'up', 100, 120], ['C', 'up', 125, 120],
    ['P', 'down', 100, 85], ['P', 'down', 80, 85], ['P', 'up', 100, 115], ['P', 'up', 120, 115],
  ];
  it('in + out = vanilla for all eight types', () => {
    for (const [cp, dir, K, H] of cases) {
      const vin = barrierPrice(cp, dir, 'in', S, K, H, T, r, q, sig);
      const vout = barrierPrice(cp, dir, 'out', S, K, H, T, r, q, sig);
      expect(vin + vout).toBeCloseTo(bsPrice(cp, S, K, T, r, q, sig), 8);
      expect(vin).toBeGreaterThanOrEqual(0);
      expect(vout).toBeGreaterThanOrEqual(0);
    }
  });
  it('agrees with a finely-monitored Monte Carlo (Broadie–Glasserman corrected)', () => {
    const steps = 250;
    const beta = 0.5826 * sig * Math.sqrt(T / steps);
    for (const [cp, dir, K, H] of [cases[0], cases[4], cases[2], cases[7]]) {
      // discrete monitoring ≈ continuous with barrier shifted away from spot
      const Hc = dir === "down" ? H * Math.exp(beta) : H * Math.exp(-beta);
      const pay = (path: number[]) => {
        const hit = path.some((x) => (dir === 'down' ? x <= Hc : x >= Hc));
        const ST = path[path.length - 1];
        const v = Math.max(cp === 'C' ? ST - K : K - ST, 0);
        return hit ? 0 : v;
      };
      const mc = mcSingle(pay, S, T, r, q, sig, steps, 40000, 11);
      const an = barrierPrice(cp, dir, 'out', S, K, H, T, r, q, sig);
      expect(Math.abs(mc.price - an)).toBeLessThan(4 * mc.se + 0.02);
    }
  });
  it('knocked-in barrier is worth the vanilla; knocked-out is worthless', () => {
    expect(barrierPrice('P', 'down', 'in', 80, 100, 85, T, r, q, sig)).toBeCloseTo(bsPrice('P', 80, 100, T, r, q, sig), 10);
    expect(barrierPrice('P', 'down', 'out', 80, 100, 85, T, r, q, sig)).toBe(0);
  });
});
