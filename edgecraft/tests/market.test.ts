import { describe, expect, it } from 'vitest';
import { FACTORS, NEUTRAL_CORR, REGIMES, bucketProbs, drawFactors, regimeCorrelation, transitionMatrix, filterStep, initialIndicators, stepIndicators } from '../src/engine/market';
import { bucketOf, buildFromTemplate, fvec, idioFor, neutralProbs, template, thresholdsFromProbs } from '../src/engine/instruments';
import { isPSD } from '../src/engine/math';
import { Rng } from '../src/engine/rng';

describe('regime model', () => {
  it('every regime correlation matrix is a valid correlation matrix', () => {
    for (const r of REGIMES) {
      const C = regimeCorrelation(r);
      expect(isPSD(C)).toBe(true);
      C.forEach((row, i) => {
        expect(row[i]).toBeCloseTo(1, 12);
        row.forEach((c, j) => {
          expect(Math.abs(c)).toBeLessThanOrEqual(1);
          expect(c).toBeCloseTo(C[j][i], 12);
        });
      });
    }
  });

  it('stress regimes raise the average factor correlation', () => {
    const avg = (r: (typeof REGIMES)[number]) => {
      const C = regimeCorrelation(r);
      let s = 0, n = 0;
      for (let i = 0; i < C.length; i++) for (let j = 0; j < i; j++) { s += Math.abs(C[i][j]); n++; }
      return s / n;
    };
    expect(avg('liquidity')).toBeGreaterThan(avg('normal') * 1.3);
    expect(avg('unwind')).toBeGreaterThan(avg('normal'));
  });

  it('transition matrix rows sum to 1', () => {
    for (const set of ['calm', 'full'] as const) {
      const T = transitionMatrix(set);
      for (const r of REGIMES) expect(REGIMES.reduce((s, q) => s + T[r][q], 0)).toBeCloseTo(1, 12);
    }
  });

  it('factor draws reproduce the regime covariance', () => {
    const rng = new Rng('cov');
    const n = 40000;
    const k = FACTORS.indexOf('LIQ');
    const j = FACTORS.indexOf('CREDIT');
    let sx = 0, sy = 0, sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < n; i++) {
      const z = drawFactors(rng, 'normal').Z;
      sx += z[k]; sy += z[j]; sxy += z[k] * z[j]; sxx += z[k] ** 2; syy += z[j] ** 2;
    }
    const cov = sxy / n - (sx / n) * (sy / n);
    const corr = cov / Math.sqrt((sxx / n - (sx / n) ** 2) * (syy / n - (sy / n) ** 2));
    expect(corr).toBeCloseTo(regimeCorrelation('normal')[k][j], 1);
  });

  it('the filter tracks a regime with a distinctive signature', () => {
    const T = transitionMatrix('full');
    let belief = Object.fromEntries(REGIMES.map((r) => [r, 1 / REGIMES.length])) as Record<(typeof REGIMES)[number], number>;
    let ind = initialIndicators('normal');
    const rng = new Rng('filter');
    for (let t = 0; t < 8; t++) {
      const next = stepIndicators(rng, ind, 'liquidity');
      belief = filterStep(belief, ind, next, T);
      ind = next;
    }
    expect(belief.liquidity).toBeGreaterThan(0.5);
  });
});

describe('instrument copula', () => {
  it('thresholds reproduce base probabilities in the neutral environment', () => {
    const p = [0.1, 0.25, 0.4, 0.25];
    const th = thresholdsFromProbs(p);
    neutralProbs(th, 0).forEach((x, i) => expect(x).toBeCloseTo(p[i], 10));
  });

  it('simulated outcome frequencies match the analytic (true) probabilities', () => {
    const rng = new Rng('freq');
    const b = buildFromTemplate(rng, template('carry'), { turn: 1, quality: 'good' });
    const { pub, truth } = b;
    const analytic = bucketProbs(pub.thresholds, truth.drift0, truth.beta, truth.idio, [{ from: 'normal', to: 'volspike', w: 1 }]);
    const counts = new Array(pub.outcomes.length).fill(0);
    const n = 60000;
    for (let i = 0; i < n; i++) {
      const z = drawFactors(rng, 'volspike', 'normal').Z;
      let x = truth.drift0 + Math.sqrt(truth.idio) * rng.normal();
      for (let f = 0; f < z.length; f++) x += truth.beta[f] * z[f];
      counts[bucketOf(x, pub.thresholds)]++;
    }
    counts.forEach((c, k) => expect(c / n).toBeCloseTo(analytic[k], 2));
  });

  it('regimes change outcome probabilities through factor exposure (carry crashes more in a vol spike)', () => {
    const rng = new Rng('regime-probs');
    const { pub, truth } = buildFromTemplate(rng, template('carry'), { turn: 1, quality: 'good' });
    const calm = bucketProbs(pub.thresholds, truth.drift0, truth.beta, truth.idio, [{ from: 'normal', to: 'normal', w: 1 }]);
    const stress = bucketProbs(pub.thresholds, truth.drift0, truth.beta, truth.idio, [{ from: 'normal', to: 'liquidity', w: 1 }]);
    expect(stress[0]).toBeGreaterThan(calm[0] * 3);
  });

  it('idiosyncratic variance keeps neutral latent variance at 1', () => {
    const beta = fvec({ LIQ: 0.5, MOM: -0.3 });
    const v = beta.reduce((s, bi, i) => s + beta.reduce((t, bj, j) => t + bi * NEUTRAL_CORR[i][j] * bj, 0), 0);
    expect(v + idioFor(beta)).toBeCloseTo(1, 10);
  });



});

