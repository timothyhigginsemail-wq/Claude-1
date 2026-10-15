import { describe, expect, it } from 'vitest';
import { accrue, addCash, bookFxSpot, bookTrade, deskValue, executeStreet, firmValue, settleVariationMargin } from '../src/engine/book';
import { attributeMove } from '../src/engine/attribution';
import { frontFuture, newAutocall, newFxFwd, newSwap, newVarSwap } from '../src/engine/instruments';
import { applyShock, drawShock, idioKeys, structuredCloneMarket, usdPer } from '../src/engine/market';
import { autocallPayoffPV, black, bondClean, cdsValue, eqForward, futPrice, fxForward, quotePrice, rpv01, swapPar, swapValue, unitValue } from '../src/engine/pricing';
import { bump, computeVaR, runStress, STRESSES, summarise } from '../src/engine/risk';
import type { GameState } from '../src/engine/types';
import { newGame } from '../src/game/setup';

const near = (a: number, b: number, tol: number) => expect(Math.abs(a - b)).toBeLessThan(tol);
const fresh = () => newGame(7);

describe('pricing', () => {
  it('on-the-run Treasuries price near par and lose value when yields rise', () => {
    const s = fresh();
    const b = s.instruments.UST10Y as any;
    const p0 = quotePrice(b, s.market);
    near(p0, 100, 1.5);
    const up = bump(s.market, 'rates:usd', 0.001);
    expect(quotePrice(b, up)).toBeLessThan(p0);
    // DV01 of a 10Y ≈ 8–9 cents per 100 per bp
    const dv = (quotePrice(b, bump(s.market, 'rates:usd', 0.0001)) - p0);
    expect(dv).toBeLessThan(-0.07);
    expect(dv).toBeGreaterThan(-0.095);
  });
  it('a par swap is worth zero; a receiver loses when rates rise', () => {
    const s = fresh();
    const K = swapPar(s.market, 10);
    near(swapValue(s.market, K, 10), 0, 1e-10);
    const up = bump(s.market, 'rates:usd', 0.0001);
    const dv01 = swapValue(up, K, 10) - swapValue(s.market, K, 10);
    expect(dv01).toBeLessThan(0);
    near(dv01 * 1e6, -870, 120); // ≈ $870 per $1m per bp for a 10Y
  });
  it('long credit loses when spreads widen; CDS protection gains', () => {
    const s = fresh();
    const bond = s.instruments['TTNA-5Y'] as any;
    const v0 = unitValue(bond, s.market);
    const w = bump(s.market, 'cr:TTNA', 10);
    expect(unitValue(bond, w)).toBeLessThan(v0);
    const cds = s.instruments['CDS-TTNA'] as any;
    expect(unitValue(cds, w)).toBeGreaterThan(unitValue(cds, s.market));
    near(cdsValue(s.market, 100, 100, 0.4, 5), 0, 1e-12);
    expect(rpv01(s.market, 100, 0.4, 5)).toBeGreaterThan(4);
  });
  it('put-call parity holds for index options', () => {
    const s = fresh();
    const m = s.market;
    const T = 0.25;
    const F = eqForward(m, 'US500', T);
    const K = 5800;
    const v = 0.18;
    near(black(F, K, T, v, 'C') - black(F, K, T, v, 'P'), F - K, 1e-6);
  });
  it('FX forwards obey covered interest parity and are worth zero at inception', () => {
    const s = fresh();
    const m = s.market;
    const F = fxForward(m, 'USDMXN', 0.5);
    expect(F).toBeGreaterThan(m.fx.spot.USDMXN); // higher MXN rates → USD at a forward premium
    const fwd = newFxFwd(s, 'USDMXN', 0.5);
    near(unitValue(fwd, m), 0, 1e-12);
  });
  it('variance swaps struck at fair variance and autocalls price sensibly', () => {
    const s = fresh();
    const vs = newVarSwap(s, 0.25, s.market.eq.atmVol.US500 * 1.08);
    near(unitValue(vs, s.market), 0, 1e-9);
    const lo = newAutocall(s, 2, 0.015);
    const hi = newAutocall(s, 2, 0.03);
    const pLo = autocallPayoffPV(s.market, lo);
    const pHi = autocallPayoffPV(s.market, hi);
    expect(pLo).toBeGreaterThan(0.8);
    expect(pLo).toBeLessThan(1.02);
    expect(pHi).toBeGreaterThan(pLo);
  });
});

describe('book accounting', () => {
  it('a trade at mid is value-neutral; off-mid trades capture exactly the edge', () => {
    const s = fresh();
    const inst = s.instruments.ORBT;
    const v0 = firmValue(s);
    bookTrade(s, 'eq', inst, 1000, quotePrice(inst, s.market), 'street', 'hedge');
    near(firmValue(s), v0, 1e-6);
    const edge = bookTrade(s, 'eq', inst, -1000, quotePrice(inst, s.market) + 0.5, 'kestrel', 'client');
    near(edge, 500, 1e-6);
    near(firmValue(s), v0 + 500, 1e-6);
  });
  it('futures settle variation margin to cash without changing value', () => {
    const s = fresh();
    const es = frontFuture(s, (i) => i.kind === 'eqFut')!;
    bookTrade(s, 'eq', es, 10, futPrice(es, s.market), 'street', 'hedge');
    const m2 = applyShock(s.market, { g: 1, inf: 0, ro: 0, usd: 0, oil: 0, idio: {} });
    const F0 = futPrice(es, s.market);
    s.market = m2;
    const v = deskValue(s, s.desks.eq);
    near(v, 10 * (futPrice(es, m2) - F0) * 50, 1e-6);
    settleVariationMargin(s);
    near(deskValue(s, s.desks.eq), v, 1e-6);
    expect(s.desks.eq.positions[es.id].ref).toBe(futPrice(es, m2));
  });
  it('spot FX creates currency balances; holding high-yielders earns carry', () => {
    const s = fresh();
    const m = s.market;
    bookFxSpot(s, 'USDMXN', -10e6, m.fx.spot.USDMXN, 'street', 'hedge'); // sell USD, buy MXN
    expect(s.desks.fx.cash.MXN).toBeGreaterThan(0);
    const before = s.desks.fx.cash.MXN!;
    accrue(s, 1);
    const carry = (s.desks.fx.cash.MXN! - before) * usdPer(m, 'MXN');
    near(carry, 10e6 * (0.085 - 0.001) / 360, 50);
  });
  it('street execution costs the half-spread and is recorded as execution P&L', () => {
    const s = fresh();
    const v0 = firmValue(s);
    const edge = executeStreet(s, 'eq', 'HLXS', 500000);
    expect(edge).toBeLessThan(0);
    // permanent impact lifts the mark on the shares just bought, partly offsetting the cost
    expect(s.desks.eq.pnlToday.execution).toBeGreaterThan(edge);
    expect(s.desks.eq.pnlToday.execution).toBeLessThan(0);
    near(firmValue(s) - v0, s.desks.eq.pnlToday.execution, 1e-3);
  });
});

describe('risk and attribution', () => {
  function bookOfEverything(): GameState {
    const s = fresh();
    const m = s.market;
    bookTrade(s, 'eq', s.instruments.ORBT, 100000, quotePrice(s.instruments.ORBT, m), 'street', 'hedge');
    bookTrade(s, 'rates', s.instruments.UST10Y, 50e6, quotePrice(s.instruments.UST10Y, m), 'street', 'hedge');
    const sw = newSwap(s, 5, swapPar(m, 5));
    bookTrade(s, 'rates', sw, 100e6, quotePrice(sw, m), 'street', 'hedge');
    bookTrade(s, 'credit', s.instruments['SRTL-5Y'], 20e6, quotePrice(s.instruments['SRTL-5Y'], m), 'street', 'hedge');
    bookFxSpot(s, 'EURUSD', 50e6, m.fx.spot.EURUSD, 'street', 'hedge');
    const opt = Object.values(s.instruments).find((i) => i.kind === 'eqOpt' && (i as any).cp === 'P')!;
    bookTrade(s, 'eq', opt, -200, quotePrice(opt, m), 'street', 'hedge');
    const cl = frontFuture(s, (i) => i.kind === 'cmdtyFut' && (i as any).cmdty === 'WTI')!;
    bookTrade(s, 'cmdty', cl, 50, quotePrice(cl, m), 'street', 'hedge');
    return s;
  }
  it('Greeks have the right signs', () => {
    const s = bookOfEverything();
    expect(summarise(s, 'eq').eqDelta).toBeGreaterThan(0);
    expect(summarise(s, 'rates').dv01).toBeLessThan(0); // long bond + receiver swap: lose when yields rise
    expect(summarise(s, 'credit').cs01).toBeLessThan(0);
    expect(summarise(s, 'fx').fxExposure.EUR).toBeGreaterThan(40e6);
    expect(summarise(s, 'cmdty').cmdtyDelta.WTI).toBeGreaterThan(0);
  });
  it('step-wise attribution sums exactly to the change in value', () => {
    const s = bookOfEverything();
    const h = { rng: 99 };
    const z = drawShock(h, s.market, idioKeys(s.market));
    const m2 = applyShock(s.market, z);
    const a = attributeMove(s, s.market, m2);
    for (const d of Object.keys(s.desks)) {
      const sum = Object.values(a[d as keyof typeof a]).reduce((x, y) => x + (y ?? 0), 0);
      const dv = deskValue(s, s.desks[d as keyof typeof s.desks], m2) - deskValue(s, s.desks[d as keyof typeof s.desks], s.market);
      near(sum, dv, 1e-4);
      near(a[d as keyof typeof a].other ?? 0, 0, 1e-4);
    }
  });
  it('VaR, ES and stress tests are computed and diversification helps', () => {
    const s = bookOfEverything();
    const v = computeVaR(s);
    expect(v.var99).toBeGreaterThan(0);
    expect(v.es975).toBeGreaterThanOrEqual(v.var99 * 0.9);
    expect(v.var99).toBeLessThanOrEqual(v.undiversified + 1);
    for (const st of STRESSES) expect(Number.isFinite(runStress(s, st.id).total)).toBe(true);
    // a long equity book loses in the crash scenario
    expect(runStress(s, 'crash').byDesk.eq).toBeLessThan(0);
  });
  it('a hawkish/inflation shock lowers a receiver swap, the dollar rises and equities fall', () => {
    const s = fresh();
    const m2 = applyShock(s.market, { g: 0, inf: 3, ro: 0, usd: 0, oil: 0, policyBp: 25, idio: {} });
    expect(swapValue(m2, swapPar(s.market, 10), 10)).toBeLessThan(0);
    expect(m2.fx.spot.EURUSD).toBeLessThan(s.market.fx.spot.EURUSD);
    expect(m2.eq.spot.US500).toBeLessThan(s.market.eq.spot.US500);
    expect(m2.credit.spread.CDXIG).toBeGreaterThanOrEqual(s.market.credit.spread.CDXIG - 0.5);
  });
  it('is deterministic', () => {
    const a = applyShock(fresh().market, drawShock({ rng: 5 }, fresh().market, idioKeys(fresh().market)));
    const b = applyShock(fresh().market, drawShock({ rng: 5 }, fresh().market, idioKeys(fresh().market)));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    void structuredCloneMarket;
    void addCash;
  });
});
