import { describe, expect, it } from 'vitest';
import { FACTORS, NEUTRAL_CORR, REGIMES, bucketProbs, drawFactors, regimeCorrelation, transitionMatrix, filterStep, initialIndicators, stepIndicators, drawRegime } from '../src/engine/market';
import { bucketOf, buildFromTemplate, fvec, idioFor, neutralProbs, template, thresholdsFromProbs } from '../src/engine/instruments';
import { buildScenarios, quoteInstrument, scenarioCorr } from '../src/engine/risk';
import { isPSD } from '../src/engine/math';
import { Rng } from '../src/engine/rng';
import { advance, advanceMany, buyResearch, deserialize, drawMarket, evaluateExAnte, newGame, scenarioRegime, serialize, tradableIds, type GameConfig, type GameState } from '../src/engine/game';

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

  it('shared factor loading creates correlation between trades in scenarios; stress raises it', () => {
    const rng = new Rng('corr');
    const a = buildFromTemplate(rng, template('statarb'), { turn: 1, quality: 'good' }).pub;
    const b = buildFromTemplate(rng, template('factor_rev'), { turn: 1, quality: 'good' }).pub;
    const c = buildFromTemplate(rng, template('macro_rates'), { turn: 1, quality: 'good' }).pub;
    const params = [a, b, c].map((p) => ({ drift: p.estDrift, beta: p.betaEst, idio: p.idioEst }));
    const calm = scenarioCorr(buildScenarios([a, b, c], params, [{ from: 'normal', to: 'normal', w: 1 }], ['t', 1], 20000));
    const crisis = scenarioCorr(buildScenarios([a, b, c], params, [{ from: 'unwind', to: 'unwind', w: 1 }], ['t', 1], 20000));
    expect(calm[0][1]).toBeGreaterThan(0.1); // both liquidity providers
    expect(Math.abs(calm[0][2])).toBeLessThan(0.1); // unrelated
    expect(crisis[0][1]).toBeGreaterThan(calm[0][1]);
    expect(isPSD(calm)).toBe(true);
  });

  it('scenario subsets are consistent regardless of which instruments are included', () => {
    const rng = new Rng('subset');
    const a = buildFromTemplate(rng, template('statarb'), { turn: 1, quality: 'good' }).pub;
    const b = buildFromTemplate(rng, template('trend'), { turn: 1, quality: 'good' }).pub;
    const pa = { drift: a.estDrift, beta: a.betaEst, idio: a.idioEst };
    const pb = { drift: b.estDrift, beta: b.betaEst, idio: b.idioEst };
    const one = buildScenarios([a], [pa], [{ from: 'normal', to: 'normal', w: 1 }], ['x'], 500);
    const two = buildScenarios([b, a], [pb, pa], [{ from: 'normal', to: 'normal', w: 1 }], ['x'], 500);
    for (let s = 0; s < 500; s++) expect(two.R[s * 2 + 1]).toBe(one.R[s]);
  });

  it('desk quote has a CI that brackets the point estimate', () => {
    const rng = new Rng('quote');
    const { pub } = buildFromTemplate(rng, template('merger'), { turn: 1, quality: 'good' });
    const q = quoteInstrument(pub, [{ from: 'normal', to: 'normal', w: 1 }]);
    expect(q.winLo).toBeLessThanOrEqual(q.win);
    expect(q.winHi).toBeGreaterThanOrEqual(q.win);
    expect(q.probs.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
  });
});

const cfg = (level: 1 | 2 | 3, seed = 'test-seed'): GameConfig => ({ level, seed, turns: 12, mode: 'campaign', transparent: false, startNav: 1_000_000 });

function playPassive(s: GameState, turns: number): GameState {
  for (let i = 0; i < turns && s.status === 'playing'; i++) s = advance(s, []).state;
  return s;
}

describe('campaign engine', () => {
  it('Level 1 starts with the 55/45 coin and Kelly sizing scores well', () => {
    const s = newGame(cfg(1));
    expect(s.offered.length).toBe(1);
    const id = s.offered[0];
    // Kelly: f* = 0.1 of wealth at risk; the bet risks 20% of notional ⇒ notional = 50% of NAV.
    const ex = evaluateExAnte(s, { [id]: 500_000 });
    // stratified scenarios reproduce the 55% marginal almost exactly; costs trim the optimum slightly
    expect(ex.sizing).toBeGreaterThan(0.95);
    expect(ex.sizing).toBeLessThan(1.15);
    const over = evaluateExAnte(s, { [id]: 1_400_000 });
    expect(over.sizing).toBeGreaterThan(2);
    expect(over.elog).toBeLessThan(0);
  });

  it('desk Kelly for the coin is stable across seeds', () => {
    for (const seed of ['a', 'b', 'c', 'd', 'e']) {
      const s = newGame(cfg(1, seed));
      const ex = evaluateExAnte(s, { [s.offered[0]]: 500_000 });
      expect(ex.sizing).toBeGreaterThan(0.95);
      expect(ex.sizing).toBeLessThan(1.15);
    }
  });

  it('market path is independent of player decisions (fair replays)', () => {
    let a = newGame(cfg(2, 'fair'));
    let b = newGame(cfg(2, 'fair'));
    for (let t = 0; t < 6; t++) {
      const ids = tradableIds(b).filter((id) => b.instruments[id].archetype !== 'future' && !b.positions[id]).slice(0, 3);
      const orders = Object.keys(b.positions).length > 8 ? [] : ids.map((id) => ({ id, target: 0.1 * b.nav }));
      const da = drawMarket(a);
      const db = drawMarket(b);
      expect(db.regime).toBe(da.regime);
      expect(db.Z).toEqual(da.Z);
      a = advance(a, []).state;
      b = advance(b, orders).state;
      expect(Object.keys(b.instruments).sort()).toEqual(Object.keys(a.instruments).sort());
    }
    expect(b.history.map((h) => h.trueRegime)).toEqual(a.history.map((h) => h.trueRegime));
  });

  it('cash-only play earns roughly the risk-free rate and never draws down', () => {
    const s = playPassive(newGame(cfg(2, 'cash')), 12);
    expect(s.nav).toBeGreaterThan(1_000_000);
    expect(s.nav).toBeLessThan(1_000_000 * 1.02);
    expect(s.history.every((h) => h.positions.length === 0)).toBe(true);
  });

  it('orders beyond limits are rejected', () => {
    const s = newGame(cfg(2));
    const id = s.offered.find((x) => s.instruments[x].archetype !== 'future')!;
    expect(() => advance(s, [{ id, target: 50 * s.nav }])).toThrow();
  });

  it('accounting identity: NAV change = P&L − costs (+ cash interest)', () => {
    let s = newGame(cfg(2, 'acct'));
    for (let t = 0; t < 8 && s.status === 'playing'; t++) {
      const ids = tradableIds(s).filter((id) => s.instruments[id].archetype !== 'future').slice(0, 4);
      const orders = Object.keys(s.positions).length > 6 ? [] : ids.map((id) => ({ id, target: 0.15 * s.nav }));
      const { state, record } = advance(s, orders);
      const c = record.costs;
      const explained = record.pnlPositions - c.tc - c.fin - c.lev + c.cash - c.liquidation - c.research;
      const residual = record.navAfter - record.navBefore - explained;
      // only expiry exit costs are outside the identity
      expect(Math.abs(residual)).toBeLessThan(0.002 * record.navBefore);
      s = state;
    }
  });

  it('attribution sums to position P&L', () => {
    let s = newGame(cfg(2, 'attr'));
    const ids = tradableIds(s).filter((id) => s.instruments[id].archetype !== 'future').slice(0, 4);
    const { record } = advance(s, ids.map((id) => ({ id, target: 0.3 * s.nav })));
    const a = record.attribution;
    const sum = Object.entries(a).filter(([k]) => k !== 'costs').reduce((x, [, v]) => x + v, 0);
    expect(sum).toBeCloseTo(record.pnlPositions, 6);
    s = advance(s, []).state;
  });

  it('research costs money and tightens the estimate', () => {
    const s = newGame(cfg(2, 'research'));
    const id = s.offered.find((x) => s.instruments[x].archetype !== 'future')!;
    const se = s.instruments[id].statedSe;
    const { state } = buyResearch(s, id, 'signal');
    expect(state.nav).toBeLessThan(s.nav);
    expect(state.instruments[id].statedSe).toBeLessThan(se);
  });

  it('save/load round-trips', () => {
    let s = newGame(cfg(3, 'save'));
    s = advance(s, []).state;
    const back = deserialize(serialize(s));
    expect(back).toEqual(s);
    expect(() => deserialize('{"version":1}')).toThrow();
  });

  it('Level 3 pods carry track records and a campaign runs to completion', () => {
    let s = newGame(cfg(3, 'pods'));
    const pods = Object.values(s.instruments).filter((p) => p.archetype === 'pod');
    expect(pods.length).toBe(7);
    pods.forEach((p) => expect(p.track!.length).toBeGreaterThan(50));
    for (let t = 0; t < 12 && s.status === 'playing'; t++) {
      const orders = pods.map((p) => ({ id: p.id, target: 0.25 * s.nav }));
      s = advance(s, t === 0 ? orders : []).state;
    }
    expect(['ended', 'closed']).toContain(s.status);
    expect(s.history.length).toBeGreaterThan(0);
  });

  it('regime path draws are reproducible from the seed', () => {
    const T = transitionMatrix('full');
    const path = (seed: string) => {
      let r: (typeof REGIMES)[number] = 'normal';
      const out = [];
      for (let t = 0; t < 30; t++) { r = drawRegime(new Rng(seed, 'regime', t), r, T); out.push(r); }
      return out;
    };
    expect(path('a')).toEqual(path('a'));
  });
});

describe('free-play mechanics', () => {
  const fp = (extra: Partial<GameConfig> = {}): GameConfig => ({ level: 3, seed: 'fp', turns: null, mode: 'sandbox', transparent: false, startNav: 1_000_000, ...extra });

  it('ghost books run your own trades at ½ and 2× on the same path', () => {
    let s = newGame(fp());
    const ids = tradableIds(s).filter((id) => s.instruments[id].archetype === 'pod').slice(0, 3);
    const { state, record } = advance(s, ids.map((id) => ({ id, target: 0.2 * s.nav })));
    s = state;
    const pnl = record.pnlPositions / record.navBefore;
    const half = record.ghosts!.half.navAfter / record.ghosts!.half.navBefore - 1;
    const dbl = record.ghosts!.double.navAfter / record.ghosts!.double.navBefore - 1;
    // ghost returns scale with size (up to costs and cash interest)
    expect(Math.sign(half - 0.0008)).toBe(Math.sign(dbl - 0.0008) || Math.sign(half - 0.0008));
    expect(Math.abs(dbl)).toBeGreaterThan(Math.abs(half));
    expect(Math.abs(dbl - 2 * pnl)).toBeLessThan(0.01);
    expect(s.ghosts.half.path.length).toBe(2);
  });

  it('advanceMany carries the book and rebalances to % of NAV in pct mode', () => {
    const s = newGame(fp({ holdMode: 'pct' }));
    const pods = tradableIds(s).filter((id) => s.instruments[id].archetype === 'pod').slice(0, 2);
    const { state, records } = advanceMany(s, pods.map((id) => ({ id, target: 0.3 * s.nav })), 4);
    expect(records.length).toBeGreaterThanOrEqual(1);
    for (const id of pods) {
      const p = state.positions[id];
      if (!p) continue;
      expect(p.notional / records[records.length - 1].navBefore).toBeCloseTo(0.3, 2);
    }
  });

  it('usd mode keeps dollar notionals fixed', () => {
    const s = newGame(fp({ holdMode: 'usd' }));
    const pod = tradableIds(s).find((id) => s.instruments[id].archetype === 'pod')!;
    const { state } = advanceMany(s, [{ id: pod, target: 300_000 }], 3);
    if (state.positions[pod]) expect(state.positions[pod].notional).toBe(300_000);
  });

  it('practice scenarios script the true regime path', () => {
    let s = newGame(fp({ scenario: 'carrycrash' }));
    for (let i = 0; i < 12; i++) s = advance(s, []).state;
    expect(s.history[9].trueRegime).toBe('volspike');
    expect(s.history[10].trueRegime).toBe('liquidity');
    expect(scenarioRegime('none', 5)).toBeNull();
  });
});
