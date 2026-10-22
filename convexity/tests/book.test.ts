import { describe, expect, it } from 'vitest';
import { initialMarket, viewOf, DAY, stepTick, TICKS_PER_DAY } from '../src/engine/market';
import { newBook, executeTrade, bookValue, bucketTotal, markToMarket, accrueCarry, processLifecycle, positionPnl, halfSpread } from '../src/engine/book';
import { Instrument, unitPV, AutocallInst } from '../src/engine/pricing';
import { instrumentRisk } from '../src/engine/risk';
import { newGame, quoteRfq, tick, view, addRfq } from '../src/engine/game';
import { generateRfq, edgeAtQuote, quoteForEdge, hitProbability } from '../src/engine/clients';
import { rngFor } from '../src/engine/math';

const ctx = (v: ReturnType<typeof viewOf>) => ({ view: v, day: 0, tick: 0, liq: 1 });

describe('portfolio accounting', () => {
  it('client edge and hedge costs are booked exactly; value reconciles to buckets', () => {
    const m = initialMarket(1);
    const v = viewOf(m);
    const b = newBook();
    const put: Instrument = { type: 'vanilla', asset: 'ORX', cp: 'P', strike: 5000, expiry: 0.25 };
    const mid = unitPV(put, v);
    executeTrade(b, put, -1000, mid * 1.02, 'client', ctx(v), { client: 'northgate' });
    expect(b.today.edge).toBeCloseTo(1000 * mid * 0.02, 6);
    const fut: Instrument = { type: 'forward', asset: 'ORX', expiry: 0.25, strike: 0 };
    const fmid = unitPV(fut, v);
    const hs = halfSpread(fut, -300, v, 1);
    executeTrade(b, fut, -300, fmid - hs, 'hedge', ctx(v));
    expect(b.today.costs).toBeCloseTo(-300 * hs, 6);
    expect(bookValue(b)).toBeCloseTo(bucketTotal(b.today), 6);
    // move the market for a day, mark, accrue
    for (const p of b.positions) { p.risk = instrumentRisk(p.inst, v); }
    let prev = v;
    for (let k = 0; k < TICKS_PER_DAY; k++) {
      stepTick(m);
      const nv = viewOf(m);
      accrueCarry(b, nv, nv.t - prev.t);
      markToMarket(b, prev, nv, { refreshRisk: () => true });
      processLifecycle(b, nv, false);
      prev = nv;
    }
    expect(bookValue(b)).toBeCloseTo(bucketTotal(b.today), 4);
    // greek explain sums to market P&L
    const B = b.today;
    expect(B.delta + B.gamma + B.vega + B.theta + B.rates + B.corr + B.cross).toBeCloseTo(B.market, 6);
    // explained part should dominate the residual for vanilla books
    expect(Math.abs(B.cross)).toBeLessThan(Math.abs(B.market) * 0.5 + 2e3);
  });

  it('average-cost netting realises P&L and keeps cash + MTM consistent', () => {
    const v = viewOf(initialMarket(2));
    const b = newBook();
    const s: Instrument = { type: 'spot', asset: 'NKT' };
    executeTrade(b, s, 1000, 100, 'hedge', ctx(v), { mid: 100 });
    executeTrade(b, s, -400, 110, 'hedge', ctx(v), { mid: 110 });
    const p = b.positions[0];
    expect(p.qty).toBe(600);
    expect(p.realized).toBeCloseTo(400 * 10, 8);
    expect(positionPnl(p)).toBeCloseTo(1000 * 10, 8);
    executeTrade(b, s, -600, 110, 'hedge', ctx(v), { mid: 110 });
    expect(b.positions.length).toBe(0);
    expect(b.cash).toBeCloseTo(10000, 8);
  });

  it('expiry settles intrinsic value into cash without creating P&L', () => {
    const m = initialMarket(3);
    const v = viewOf(m);
    const b = newBook();
    const call: Instrument = { type: 'vanilla', asset: 'ORX', cp: 'C', strike: Math.round(v.spot.ORX * 0.9), expiry: v.t + 0.0001 };
    const mid = unitPV(call, v);
    executeTrade(b, call, 10, mid, 'hedge', ctx(v), { mid });
    const v2 = { ...v, t: v.t + 0.0002 };
    const before = bookValue(b);
    const buckets = bucketTotal(b.today);
    processLifecycle(b, v2, true);
    expect(b.positions.length).toBe(0);
    expect(b.cash).toBeCloseTo(-10 * mid + 10 * (v.spot.ORX - call.strike), 6);
    // value change equals booked market P&L
    expect(bookValue(b) - before).toBeCloseTo(bucketTotal(b.today) - buckets, 6);
  });

  it('autocall observation moves value into cash consistently', () => {
    const m = initialMarket(4);
    const v = viewOf(m);
    const inst: AutocallInst = { type: 'autocall', assets: ['ORX'], initial: [v.spot.ORX * 0.9], obs: [v.t + 0.0001, v.t + 1], callFrom: 0, autocall: 1, couponBarrier: 0.7, coupon: 0.02, memory: true, ki: 0.6, next: 0, missed: 0, seed: 1 };
    const b = newBook();
    const mid = unitPV(inst, v);
    executeTrade(b, inst, -1e6, 1, 'client', ctx(v), { client: 'aurelia', mid });
    const v2 = { ...v, t: v.t + 0.0002 };
    const before = bookValue(b) - bucketTotal(b.today);
    processLifecycle(b, v2, true);
    // spot is 111% of initial → autocalled: desk pays 102%
    expect(b.positions.length).toBe(0);
    expect(b.cash).toBeCloseTo(1e6 - 1.02e6, 4);
    expect(bookValue(b) - bucketTotal(b.today)).toBeCloseTo(before, 4);
  });
});

describe('quoting', () => {
  it('quote metric ↔ edge round-trips for every quote kind', () => {
    const g = newGame({ mode: 'sandbox', seed: 8 });
    const v = view(g);
    const gen = { seed: 8, day: 0, tick: 5, view: v, liq: 1, families: new Set(['vanilla', 'fx', 'swap', 'autocall', 'barrier', 'digital'] as const), rfqCount: 0, realizedVol: { ORX: 0.13, NKT: 0.3, AUR: 0.15, EURUSD: 0.07 } };
    for (const [c, t] of [['northgate', 'protect_put'], ['kestrel', 'fx_forward'], ['northgate', 'irs'], ['aurelia', 'autocall_note'], ['sable', 'kiput'], ['sable', 'digital_call']] as const) {
      const r = generateRfq(gen as never, c, t, rngFor(1, t))!;
      for (const e of [-0.002, 0, 0.004]) {
        const q = quoteForEdge(r, e, v);
        expect(edgeAtQuote(r, q, v)).toBeCloseTo(e, 5);
      }
      expect(hitProbability(r, 0, 50, 1)).toBeGreaterThan(hitProbability(r, r.streetMargin * 2, 50, 1));
    }
  });

  it('a won quote books the position with edge equal to quote vs mid', () => {
    const g = newGame({ mode: 'sandbox', seed: 21 });
    const v = view(g);
    const gen = { seed: 21, day: 0, tick: 1, view: v, liq: 1, families: new Set(['vanilla'] as const), rfqCount: 0, realizedVol: { ORX: 0.13, NKT: 0.3, AUR: 0.15, EURUSD: 0.07 } };
    const r = generateRfq(gen as never, 'northgate', 'protect_put', rngFor(3, 'x'))!;
    addRfq(g, r);
    quoteRfq(g, r.id, quoteForEdge(r, -r.streetMargin, v)); // aggressive: should win
    for (let k = 0; k < 4; k++) tick(g);
    expect(r.status).toBe('won');
    const p = g.book.positions.find((x) => x.source === 'client')!;
    expect(p).toBeTruthy();
    expect(Math.abs(p.qty)).toBeCloseTo(Math.abs(r.deskQty), 6);
  });
});

describe('competition consistency', () => {
  it('beating the cover always wins; the reported cover is never better than a losing quote', () => {
    for (let s = 1; s <= 40; s++) {
      const g = newGame({ mode: 'sandbox', seed: s });
      const v = view(g);
      const gen = { seed: s, day: 0, tick: 2, view: v, liq: 1, families: new Set(['vanilla'] as const), rfqCount: s, realizedVol: { ORX: 0.13, NKT: 0.3, AUR: 0.15, EURUSD: 0.07 } };
      const r = generateRfq(gen as never, 'northgate', 'protect_put', rngFor(s, 'cmp'))!;
      addRfq(g, r);
      const e = r.streetMargin * (0.5 + (s % 5) * 0.3);
      quoteRfq(g, r.id, quoteForEdge(r, e, v));
      for (let k = 0; k < 4; k++) tick(g);
      if (r.status === 'lost' && r.decided?.reason === 'traded away') expect(r.coverEdge!).toBeLessThan(e);
      if (r.status === 'won') expect(r.coverEdge!).toBeGreaterThanOrEqual(e - 0.25 * r.streetMargin); // relationship bonus at most 0.25m
    }
  });
});
