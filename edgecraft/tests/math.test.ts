import { describe, expect, it } from 'vitest';
import {
  expectedLogGrowth, kellyBinary, kellyDiscrete, kellyGaussian, kellyMeanVariance, kellyShrinkage,
  optimizeLogPortfolio, optimalScale, scenarioLogGrowth, projectBoxL1, type ScenarioSet,
} from '../src/engine/kelly';
import { binomPmf, cholesky, isPSD, normCdf, normInv, quadForm, solveSPD } from '../src/engine/math';
import { Rng } from '../src/engine/rng';

describe('normal distribution', () => {
  it('cdf/inverse round-trip', () => {
    for (const p of [1e-6, 0.01, 0.2, 0.5, 0.55, 0.9, 0.999]) expect(normCdf(normInv(p))).toBeCloseTo(p, 9);
    expect(normCdf(0)).toBeCloseTo(0.5, 12);
    expect(normCdf(1.959963985)).toBeCloseTo(0.975, 8);
  });
});

describe('seeded rng', () => {
  it('is reproducible and label-separated', () => {
    const a = new Rng('seed', 'x', 1);
    const b = new Rng('seed', 'x', 1);
    const c = new Rng('seed', 'x', 2);
    const xa = [a.next(), a.next(), a.normal()];
    expect([b.next(), b.next(), b.normal()]).toEqual(xa);
    expect(c.next()).not.toEqual(xa[0]);
  });
  it('normal draws have mean 0, variance 1', () => {
    const r = new Rng(42);
    let s = 0, s2 = 0;
    const n = 200000;
    for (let i = 0; i < n; i++) {
      const x = r.normal();
      s += x;
      s2 += x * x;
    }
    expect(s / n).toBeCloseTo(0, 2);
    expect(s2 / n).toBeCloseTo(1, 1);
  });
});

describe('Kelly sizing', () => {
  it('55/45 even-money bet: Kelly fraction is 10%', () => {
    expect(kellyBinary(0.55, 1)).toBeCloseTo(0.1, 12);
    const f = kellyDiscrete([{ r: 1, p: 0.55 }, { r: -1, p: 0.45 }]);
    expect(f).toBeCloseTo(0.1, 6);
    // and growth there: 0.55 ln 1.1 + 0.45 ln 0.9 ≈ 0.005008
    expect(expectedLogGrowth(0.1, [{ r: 1, p: 0.55 }, { r: -1, p: 0.45 }])).toBeCloseTo(0.005008, 5);
  });

  it('zero edge ⇒ zero bet; negative edge ⇒ zero bet (long-only)', () => {
    expect(kellyBinary(0.5, 1)).toBeCloseTo(0, 12);
    expect(kellyDiscrete([{ r: 1, p: 0.5 }, { r: -1, p: 0.5 }])).toBeCloseTo(0, 8);
    expect(kellyDiscrete([{ r: 1, p: 0.45 }, { r: -1, p: 0.55 }])).toBe(0);
  });

  it('betting twice Kelly gives ~zero growth (overbetting destroys compounding)', () => {
    const o = [{ r: 1, p: 0.55 }, { r: -1, p: 0.45 }];
    expect(Math.abs(expectedLogGrowth(0.2, o))).toBeLessThan(0.0003);
    expect(expectedLogGrowth(0.3, o)).toBeLessThan(0);
  });

  it('unequal payoffs: f* = p/a − q/b', () => {
    const p = 0.4, b = 2, a = 1;
    expect(kellyDiscrete([{ r: b, p }, { r: -a, p: 1 - p }])).toBeCloseTo(kellyBinary(p, b, a), 6);
    expect(kellyBinary(p, b, a)).toBeCloseTo(0.1, 12);
  });

  it('Gaussian approximation μ/σ²', () => {
    expect(kellyGaussian(0.05, 0.2)).toBeCloseTo(1.25, 12);
  });

  it('shrinkage for estimation noise', () => {
    expect(kellyShrinkage(0.1, 0)).toBe(1);
    expect(kellyShrinkage(0.1, 0.01)).toBeCloseTo(0.5, 12);
    expect(kellyShrinkage(0, 0.01)).toBe(0);
  });
});

function coinScenarios(n: number, rho: number, p = 0.55, S = 40000, seed = 1): ScenarioSet {
  // Correlated binary bets via a one-factor Gaussian copula.
  const rng = new Rng(seed);
  const R = new Float64Array(S * n);
  const thr = normInv(1 - p);
  for (let s = 0; s < S; s++) {
    const m = rng.normal();
    for (let i = 0; i < n; i++) {
      const x = Math.sqrt(rho) * m + Math.sqrt(1 - rho) * rng.normal();
      R[s * n + i] = x > thr ? 1 : -1;
    }
  }
  return { S, N: n, R };
}

describe('portfolio log-optimisation', () => {
  it('recovers the 10% Kelly for a single 55/45 coin', () => {
    const sc = coinScenarios(1, 0, 0.55, 200000);
    const { weights } = optimizeLogPortfolio(sc, { hi: [1] });
    expect(weights[0]).toBeCloseTo(0.1, 2);
  });

  it('allocates ~nothing at zero edge', () => {
    const sc = coinScenarios(3, 0, 0.5, 100000);
    const { weights } = optimizeLogPortfolio(sc, { hi: [1, 1, 1] });
    for (const w of weights) expect(w).toBeLessThan(0.01);
  });

  it('correlation shrinks the total log-optimal exposure', () => {
    const indep = optimizeLogPortfolio(coinScenarios(5, 0), { hi: [1, 1, 1, 1, 1] }).weights;
    const corr = optimizeLogPortfolio(coinScenarios(5, 0.6), { hi: [1, 1, 1, 1, 1] }).weights;
    const sum = (w: number[]) => w.reduce((a, b) => a + b, 0);
    // independent bets: each close to standalone 10% (slightly less), total ≈ 0.48
    expect(sum(indep)).toBeGreaterThan(0.4);
    // highly correlated: the five bets behave like ~one bet; total exposure much smaller
    expect(sum(corr)).toBeLessThan(0.75 * sum(indep));
    // naive sum of standalone Kelly (5 × 10%) overstates both
    expect(sum(corr)).toBeLessThan(0.5);
  });

  it('respects the gross leverage constraint', () => {
    const sc = coinScenarios(5, 0, 0.6);
    const { weights } = optimizeLogPortfolio(sc, { hi: [1, 1, 1, 1, 1], maxGross: 0.3 });
    expect(weights.reduce((a, b) => a + Math.abs(b), 0)).toBeLessThanOrEqual(0.3 + 1e-9);
  });

  it('optimal scale of a direction equals its Kelly multiple', () => {
    const sc = coinScenarios(1, 0, 0.55, 200000);
    const { k } = optimalScale(sc, [0.05]);
    expect(k).toBeCloseTo(2, 1);
    expect(scenarioLogGrowth(sc, [0.1])).toBeGreaterThan(scenarioLogGrowth(sc, [0.2]));
  });

  it('box/L1 projection is feasible', () => {
    const w = projectBoxL1([2, -3, 0.5], [-1, -1, 0], [1, 1, 1], 1.5);
    expect(w.reduce((a, b) => a + Math.abs(b), 0)).toBeLessThanOrEqual(1.5 + 1e-9);
    w.forEach((x) => expect(Math.abs(x)).toBeLessThanOrEqual(1));
  });
});

describe('covariance algebra', () => {
  it('portfolio variance of equal-weight correlated assets: σ²(1/N + (1−1/N)ρ)', () => {
    const N = 10, rho = 0.3, sig = 0.2;
    const C = Array.from({ length: N }, (_, i) => Array.from({ length: N }, (_, j) => (i === j ? sig * sig : rho * sig * sig)));
    const w = new Array(N).fill(1 / N);
    expect(quadForm(w, C)).toBeCloseTo(sig * sig * (1 / N + (1 - 1 / N) * rho), 12);
    // diversification floor: with ρ > 0 variance never falls below ρσ²
    expect(quadForm(w, C)).toBeGreaterThan(rho * sig * sig);
  });

  it('Cholesky reconstructs and detects non-PSD matrices', () => {
    const A = [[4, 2, 0.4], [2, 3, 0.5], [0.4, 0.5, 1]];
    const L = cholesky(A);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) expect(L[i].reduce((s, x, k) => s + x * L[j][k], 0)).toBeCloseTo(A[i][j], 12);
    expect(isPSD([[1, 0.9, -0.9], [0.9, 1, 0.9], [-0.9, 0.9, 1]])).toBe(false);
  });

  it('mean–variance Kelly w = Σ⁻¹μ', () => {
    const S = [[0.04, 0.01], [0.01, 0.09]];
    const mu = [0.05, 0.04];
    const w = kellyMeanVariance(mu, S);
    const back = [S[0][0] * w[0] + S[0][1] * w[1], S[1][0] * w[0] + S[1][1] * w[1]];
    expect(back[0]).toBeCloseTo(mu[0], 12);
    expect(back[1]).toBeCloseTo(mu[1], 12);
    solveSPD([[2, 0], [0, 4]], [2, 2]).forEach((x, i) => expect(x).toBeCloseTo([1, 0.5][i], 12));
  });

  it('binomial pmf sums to one', () => {
    let s = 0;
    for (let k = 0; k <= 100; k++) s += binomPmf(k, 100, 0.55);
    expect(s).toBeCloseTo(1, 10);
    expect(binomPmf(55, 100, 0.55)).toBeCloseTo(0.0795, 3);
  });
});
