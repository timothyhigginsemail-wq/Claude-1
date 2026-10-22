// Closed-form and Monte Carlo pricers. All functions are pure.

import { AssetId, MarketView, SPECS, carryOf, df, forward, impliedVol, zeroRate } from './market';
import { Rng, cholesky, hash32, normCdf, normPdf } from './math';

// ---------------------------------------------------------------- Black–Scholes–Merton

export type CP = 'C' | 'P';
export interface BSGreeks {
  price: number;
  delta: number;
  gamma: number;
  vega: number; // per 1.00 vol
  theta: number; // per year (calendar-agnostic, dV/dt with T shrinking)
  rho: number; // per 1.00 rate
  vanna: number; // d delta / d vol
  volga: number; // d vega / d vol
}

/** Generalised BSM: spot S, strike K, maturity T, discount rate r, carry yield q, vol σ. */
export function bs(cp: CP, S: number, K: number, T: number, r: number, q: number, sigma: number): BSGreeks {
  if (T <= 1e-10 || sigma <= 1e-10) {
    const fwd = S * Math.exp((r - q) * Math.max(T, 0));
    const intrinsic = Math.max(cp === 'C' ? fwd - K : K - fwd, 0) * Math.exp(-r * Math.max(T, 0));
    const itm = cp === 'C' ? fwd > K : fwd < K;
    return { price: intrinsic, delta: itm ? (cp === 'C' ? 1 : -1) * Math.exp(-q * Math.max(T, 0)) : 0, gamma: 0, vega: 0, theta: 0, rho: 0, vanna: 0, volga: 0 };
  }
  const sq = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r - q + 0.5 * sigma * sigma) * T) / (sigma * sq);
  const d2 = d1 - sigma * sq;
  const eq = Math.exp(-q * T);
  const er = Math.exp(-r * T);
  const n1 = normPdf(d1);
  const phi = cp === 'C' ? 1 : -1;
  const price = phi * (S * eq * normCdf(phi * d1) - K * er * normCdf(phi * d2));
  const delta = phi * eq * normCdf(phi * d1);
  const gamma = (eq * n1) / (S * sigma * sq);
  const vega = S * eq * n1 * sq;
  const theta = -(S * eq * n1 * sigma) / (2 * sq) - phi * r * K * er * normCdf(phi * d2) + phi * q * S * eq * normCdf(phi * d1);
  const rho = phi * K * T * er * normCdf(phi * d2);
  const vanna = (-eq * n1 * d2) / sigma;
  const volga = (vega * d1 * d2) / sigma;
  return { price, delta, gamma, vega, theta, rho, vanna, volga };
}

export const bsPrice = (cp: CP, S: number, K: number, T: number, r: number, q: number, s: number) => bs(cp, S, K, T, r, q, s).price;

/** Black-76 on a forward F. */
export function black76(cp: CP, F: number, K: number, T: number, r: number, sigma: number): number {
  return bsPrice(cp, F, K, T, r, r, sigma);
}

/** Bachelier (normal) model on a forward with absolute vol σn. */
export function bachelier(cp: CP, F: number, K: number, T: number, r: number, sigmaN: number): number {
  const sd = sigmaN * Math.sqrt(Math.max(T, 1e-12));
  const d = (F - K) / sd;
  const phi = cp === 'C' ? 1 : -1;
  return Math.exp(-r * T) * (phi * (F - K) * normCdf(phi * d) + sd * normPdf(d));
}

export function impliedVolFromPrice(cp: CP, price: number, S: number, K: number, T: number, r: number, q: number): number {
  let lo = 1e-4;
  let hi = 5;
  for (let i = 0; i < 120; i++) {
    const mid = 0.5 * (lo + hi);
    if (bsPrice(cp, S, K, T, r, q, mid) > price) hi = mid;
    else lo = mid;
  }
  return 0.5 * (lo + hi);
}

// ---------------------------------------------------------------- digitals

/** Cash-or-nothing paying 1 at T. Flat-vol price plus optional smile slope dσ/dK correction. */
export function digital(cp: CP, S: number, K: number, T: number, r: number, q: number, sigma: number, dSigmaDK = 0): number {
  if (T <= 1e-10) {
    const itm = cp === 'C' ? S > K : S < K;
    return itm ? 1 : 0;
  }
  const sq = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r - q + 0.5 * sigma * sigma) * T) / (sigma * sq);
  const d2 = d1 - sigma * sq;
  const er = Math.exp(-r * T);
  const vega = S * Math.exp(-q * T) * normPdf(d1) * sq;
  const callDig = er * normCdf(d2) - vega * dSigmaDK;
  const c = Math.min(er, Math.max(0, callDig));
  return cp === 'C' ? c : er - c;
}

// ---------------------------------------------------------------- barriers (Reiner–Rubinstein, continuous monitoring, no rebate)

export type BarrierDir = 'down' | 'up';
export type BarrierKind = 'in' | 'out';

export function barrierPrice(cp: CP, dir: BarrierDir, kind: BarrierKind, S: number, K: number, H: number, T: number, r: number, q: number, sigma: number): number {
  const vanilla = bsPrice(cp, S, K, T, r, q, sigma);
  const breached = dir === 'down' ? S <= H : S >= H;
  if (breached) return kind === 'in' ? vanilla : 0;
  if (T <= 1e-10) return kind === 'in' ? 0 : vanilla;
  const b = r - q;
  const sq = sigma * Math.sqrt(T);
  const mu = (b - 0.5 * sigma * sigma) / (sigma * sigma);
  const x1 = Math.log(S / K) / sq + (1 + mu) * sq;
  const x2 = Math.log(S / H) / sq + (1 + mu) * sq;
  const y1 = Math.log((H * H) / (S * K)) / sq + (1 + mu) * sq;
  const y2 = Math.log(H / S) / sq + (1 + mu) * sq;
  const phi = cp === 'C' ? 1 : -1;
  const eta = dir === 'down' ? 1 : -1;
  const eb = Math.exp((b - r) * T);
  const er = Math.exp(-r * T);
  const hs1 = Math.pow(H / S, 2 * (mu + 1));
  const hs = Math.pow(H / S, 2 * mu);
  const A = phi * S * eb * normCdf(phi * x1) - phi * K * er * normCdf(phi * x1 - phi * sq);
  const B = phi * S * eb * normCdf(phi * x2) - phi * K * er * normCdf(phi * x2 - phi * sq);
  const C = phi * S * eb * hs1 * normCdf(eta * y1) - phi * K * er * hs * normCdf(eta * y1 - eta * sq);
  const D = phi * S * eb * hs1 * normCdf(eta * y2) - phi * K * er * hs * normCdf(eta * y2 - eta * sq);
  const hi = K > H;
  let v: number;
  if (cp === 'C' && dir === 'down') v = kind === 'in' ? (hi ? C : A - B + D) : hi ? A - C : B - D;
  else if (cp === 'C' && dir === 'up') v = kind === 'in' ? (hi ? A : B - C + D) : hi ? 0 : A - B + C - D;
  else if (cp === 'P' && dir === 'down') v = kind === 'in' ? (hi ? B - C + D : A) : hi ? A - B + C - D : 0;
  else v = kind === 'in' ? (hi ? A - B + D : C) : hi ? B - D : A - C;
  return Math.max(0, Math.min(v, kind === 'in' ? vanilla : vanilla));
}

// ---------------------------------------------------------------- instruments

export interface SpotInst {
  type: 'spot';
  asset: AssetId;
}
export interface ForwardInst {
  type: 'forward';
  asset: AssetId;
  expiry: number;
  strike: number;
}
export interface VanillaInst {
  type: 'vanilla';
  asset: AssetId;
  cp: CP;
  strike: number;
  expiry: number;
}
export interface DigitalInst {
  type: 'digital';
  asset: AssetId;
  cp: CP;
  strike: number;
  expiry: number;
}
export interface BarrierInst {
  type: 'barrier';
  asset: AssetId;
  cp: CP;
  strike: number;
  expiry: number;
  barrier: number;
  dir: BarrierDir;
  kind: BarrierKind;
  hit?: boolean;
}
export interface SwapInst {
  type: 'swap';
  start: number;
  end: number;
  fixed: number; // annual fixed rate; PV per unit notional is RECEIVER fixed
  paid: number; // fixed coupons already paid
}
export interface AutocallInst {
  type: 'autocall';
  assets: AssetId[];
  initial: number[];
  obs: number[]; // absolute times of observation dates (last = maturity)
  callFrom: number; // first index at which autocall can trigger
  autocall: number; // trigger, fraction of initial on worst-of
  couponBarrier: number;
  coupon: number; // per observation period, fraction of notional
  memory: boolean;
  ki: number; // European knock-in barrier at maturity
  next: number; // index of next observation
  missed: number;
  seed: number;
  done?: boolean;
}
export type Instrument = SpotInst | ForwardInst | VanillaInst | DigitalInst | BarrierInst | SwapInst | AutocallInst;

export const MC_PATHS_BOOK = 4096;
export const MC_PATHS_RISK = 8192;

const toUsd = (view: MarketView, id: AssetId, v: number) => (SPECS[id].ccy === 'EUR' || SPECS[id].kind === 'fx' ? (SPECS[id].kind === 'fx' ? v : v * view.spot.EURUSD) : v);

/** PV in USD of ONE unit of the instrument. */
export function unitPV(inst: Instrument, view: MarketView, paths = MC_PATHS_BOOK): number {
  switch (inst.type) {
    case 'spot': {
      const s = view.spot[inst.asset];
      return SPECS[inst.asset].kind === 'fx' ? s : toUsd(view, inst.asset, s);
    }
    case 'forward': {
      const T = Math.max(0, inst.expiry - view.t);
      const F = forward(view, inst.asset, T);
      const { r } = carryOf(view, inst.asset, T);
      return toUsd(view, inst.asset, (F - inst.strike) * Math.exp(-r * T));
    }
    case 'vanilla': {
      const T = Math.max(0, inst.expiry - view.t);
      const { r, q } = carryOf(view, inst.asset, T);
      const sig = impliedVol(view, inst.asset, inst.strike, T);
      return toUsd(view, inst.asset, bsPrice(inst.cp, view.spot[inst.asset], inst.strike, T, r, q, sig));
    }
    case 'digital': {
      const T = Math.max(0, inst.expiry - view.t);
      const { r, q } = carryOf(view, inst.asset, T);
      const sig = impliedVol(view, inst.asset, inst.strike, T);
      const h = inst.strike * 0.002;
      const slope = T > 0 ? (impliedVol(view, inst.asset, inst.strike + h, T) - impliedVol(view, inst.asset, inst.strike - h, T)) / (2 * h) : 0;
      return toUsd(view, inst.asset, digital(inst.cp, view.spot[inst.asset], inst.strike, T, r, q, sig, slope));
    }
    case 'barrier': {
      const T = Math.max(0, inst.expiry - view.t);
      const { r, q } = carryOf(view, inst.asset, T);
      const sig = impliedVol(view, inst.asset, inst.strike, T);
      const S = view.spot[inst.asset];
      if (inst.hit) return inst.kind === 'in' ? toUsd(view, inst.asset, bsPrice(inst.cp, S, inst.strike, T, r, q, sig)) : 0;
      return toUsd(view, inst.asset, barrierPrice(inst.cp, inst.dir, inst.kind, S, inst.strike, inst.barrier, T, r, q, sig));
    }
    case 'swap': {
      let fixedLeg = 0;
      for (let i = inst.paid + 1; inst.start + i <= inst.end + 1e-9; i++) fixedLeg += inst.fixed * df(view.curve, inst.start + i - view.t);
      const floatLeg = 1 - df(view.curve, Math.max(0, inst.end - view.t));
      return fixedLeg - floatLeg;
    }
    case 'autocall':
      return autocallMC(inst, view, paths).pv;
  }
}

// ---------------------------------------------------------------- worst-of autocallable, Monte Carlo

export interface AutocallResult {
  pv: number; // PV of the note per unit notional (what the holder owns)
  pvExCoupon: number; // A: PV of principal flows
  couponAnnuity: number; // B: PV of one coupon unit per expected coupon payment → pv = A + c·B
  callProb: number[]; // probability of autocall at each remaining date
  kiProb: number; // probability of losing capital at maturity
  expLife: number; // expected life in years from now
  stdErr: number;
  vols: number[];
  drifts: number[];
  paths?: number[][][]; // [path][asset][obs] performance, for visualisation
  payoffs?: number[]; // undiscounted total payoff per path (for distribution)
}

/** Flat vol per underlying used by the MC: smile vol at the midpoint between spot and the KI level. */
export function autocallVols(inst: AutocallInst, view: MarketView): number[] {
  const T = Math.max(1 / 252, inst.obs[inst.obs.length - 1] - view.t);
  return inst.assets.map((a, i) => {
    const S = view.spot[a];
    const kiLevel = inst.initial[i] * inst.ki;
    const K = 0.5 * (S + kiLevel);
    return impliedVol(view, a, K, T);
  });
}

/**
 * Barrier smoothing: each digital barrier (autocall, coupon, KI) is replaced by a linear ramp of width `band`
 * centred on the barrier. This is the usual desk "overhedge" that keeps Monte Carlo Greeks stable; settlement
 * always uses the hard contractual barrier.
 */
export const SMOOTH_BAND = 0.02;
const smoothStep = (x: number, b: number, w: number) => (w <= 0 ? (x >= b ? 1 : 0) : Math.min(1, Math.max(0, (x - (b - w / 2)) / w)));

export function autocallMC(inst: AutocallInst, view: MarketView, nPaths = MC_PATHS_BOOK, opts: { keepPaths?: number; payoffs?: boolean; seed?: number; band?: number } = {}): AutocallResult {
  const n = inst.assets.length;
  const dates = inst.obs.slice(inst.next).map((t) => Math.max(0, t - view.t));
  if (inst.done || dates.length === 0) return { pv: 0, pvExCoupon: 0, couponAnnuity: 0, callProb: [], kiProb: 0, expLife: 0, stdErr: 0, vols: [], drifts: [] };
  const Tm = dates[dates.length - 1];
  const vols = autocallVols(inst, view);
  const idx = inst.assets.map((a) => ['ORX', 'NKT', 'AUR', 'EURUSD'].indexOf(a));
  const corr = idx.map((i) => idx.map((j) => view.corr[i][j]));
  const L = cholesky(corr);
  const sigFx = impliedVol(view, 'EURUSD', view.spot.EURUSD, Math.max(Tm, 1 / 52));
  const drifts = inst.assets.map((a, k) => {
    const s = SPECS[a];
    const T = Math.max(Tm, 1 / 252);
    if (s.ccy === 'USD') return zeroRate(view.curve, T) - s.div;
    // quanto: EUR asset paid in USD — drift r_EUR − q − ρ(S,FX)·σS·σFX
    const rhoFx = view.corr[idx[k]][3];
    return view.eurRate - s.div - rhoFx * vols[k] * sigFx;
  });
  const disc = dates.map((T) => Math.exp(-(zeroRate(view.curve, Math.max(T, 1e-6)) + view.fundingSpread) * Math.max(T, 0)));
  const perf0 = inst.assets.map((a, i) => view.spot[a] / inst.initial[i]);
  const rng = new Rng(hash32(opts.seed ?? inst.seed, 'ac'));
  const nd = dates.length;
  const band = opts.band ?? SMOOTH_BAND;
  const callCount = new Array(nd).fill(0);
  let sumA = 0;
  let sumB = 0;
  let sumPV = 0;
  let sumPV2 = 0;
  let ki = 0;
  let life = 0;
  const half = Math.ceil(nPaths / 2);
  const zbuf = new Float64Array(nd * n);
  const keep: number[][][] = [];
  const payoffs: number[] = [];
  const logp = new Float64Array(n);
  const corrZ = new Float64Array(n);
  for (let p = 0; p < half; p++) {
    for (let k = 0; k < zbuf.length; k++) zbuf[k] = rng.normal();
    for (let sgn = 1; sgn >= -1; sgn -= 2) {
      for (let i = 0; i < n; i++) logp[i] = Math.log(perf0[i]);
      let prevT = 0;
      let missed = inst.missed;
      let A = 0;
      let B = 0;
      let W = 1; // surviving weight (barrier smoothing splits a path between outcomes)
      let kiW = 0;
      const rec = keep.length < (opts.keepPaths ?? 0) ? inst.assets.map(() => [] as number[]) : null;
      for (let d = 0; d < nd && (W > 1e-12 || rec); d++) {
        const dt = Math.max(dates[d] - prevT, 0);
        prevT = Math.max(dates[d], 0);
        const sq = Math.sqrt(dt);
        for (let i = 0; i < n; i++) {
          let s = 0;
          for (let k = 0; k <= i; k++) s += L[i][k] * zbuf[d * n + k];
          corrZ[i] = sgn * s;
        }
        let worst = Infinity;
        for (let i = 0; i < n; i++) {
          logp[i] += (drifts[i] - 0.5 * vols[i] * vols[i]) * dt + vols[i] * sq * corrZ[i];
          const pf = Math.exp(logp[i]);
          if (rec) rec[i].push(pf);
          if (pf < worst) worst = pf;
        }
        const absIdx = inst.next + d;
        const isLast = d === nd - 1;
        const mult = 1 + (inst.memory ? missed : 0);
        if (absIdx >= inst.callFrom && !isLast) {
          const sc = smoothStep(worst, inst.autocall, band);
          if (sc > 0) {
            const w = W * sc;
            A += disc[d] * w;
            B += disc[d] * w * mult;
            callCount[d] += w;
            life += dates[d] * w;
            W -= w;
            if (W <= 1e-12 && !rec) break;
          }
        }
        const sp = smoothStep(worst, inst.couponBarrier, band);
        B += disc[d] * W * sp * mult;
        missed = inst.memory ? mult * (1 - sp) : 0;
        if (isLast) {
          const sk = smoothStep(worst, inst.ki, band);
          const principal = sk + (1 - sk) * Math.min(worst, 1);
          kiW += W * (1 - sk);
          if (worst >= inst.autocall) callCount[d] += W;
          A += disc[d] * W * principal;
          life += dates[d] * W;
        }
      }
      ki += kiW;
      if (rec) keep.push(rec);
      const pv = A + inst.coupon * B;
      if (opts.payoffs) payoffs.push(pv);
      sumA += A;
      sumB += B;
      sumPV += pv;
      sumPV2 += pv * pv;
    }
  }
  const N = half * 2;
  const mean = sumPV / N;
  const varPV = Math.max(0, sumPV2 / N - mean * mean);
  return {
    pv: mean,
    pvExCoupon: sumA / N,
    couponAnnuity: sumB / N,
    callProb: callCount.map((c) => c / N),
    kiProb: ki / N,
    expLife: life / N,
    stdErr: Math.sqrt(varPV / N),
    vols,
    drifts,
    paths: opts.keepPaths ? keep : undefined,
    payoffs: opts.payoffs ? payoffs : undefined,
  };
}

/** Coupon (per period) that makes the note worth `target` per unit notional. Exact given the MC paths (PV is linear in c). */
export function solveCoupon(inst: AutocallInst, view: MarketView, target: number, nPaths = MC_PATHS_BOOK): number {
  const r = autocallMC({ ...inst, coupon: 0 }, view, nPaths);
  if (r.couponAnnuity <= 1e-9) return 0;
  return Math.max(0, (target - r.pvExCoupon) / r.couponAnnuity);
}

// ---------------------------------------------------------------- generic Monte Carlo for single-asset payoffs (used in tests & Lab)

export function mcSingle(payoff: (path: number[]) => number, S: number, T: number, r: number, q: number, sigma: number, steps: number, nPaths: number, seed = 7): { price: number; se: number } {
  const rng = new Rng(seed);
  const dt = T / steps;
  let s1 = 0;
  let s2 = 0;
  const path = new Array(steps + 1);
  for (let p = 0; p < nPaths; p++) {
    path[0] = S;
    let x = S;
    for (let k = 1; k <= steps; k++) {
      x *= Math.exp((r - q - 0.5 * sigma * sigma) * dt + sigma * Math.sqrt(dt) * rng.normal());
      path[k] = x;
    }
    const v = payoff(path) * Math.exp(-r * T);
    s1 += v;
    s2 += v * v;
  }
  const m = s1 / nPaths;
  return { price: m, se: Math.sqrt(Math.max(0, s2 / nPaths - m * m) / nPaths) };
}

export function describeInstrument(inst: Instrument, fmtT: (t: number) => string): string {
  const name = (a: AssetId) => SPECS[a].name;
  switch (inst.type) {
    case 'spot':
      return SPECS[inst.asset].kind === 'fx' ? 'EUR cash vs USD' : `${name(inst.asset)} ${SPECS[inst.asset].kind === 'stock' ? 'shares' : 'index units'}`;
    case 'forward':
      return SPECS[inst.asset].kind === 'fx' ? `EURUSD fwd ${fmtT(inst.expiry)} @ ${inst.strike.toFixed(4)}` : `${name(inst.asset)} future ${fmtT(inst.expiry)}`;
    case 'vanilla':
      return `${name(inst.asset)} ${fmtT(inst.expiry)} ${fmtStrike(inst.asset, inst.strike)} ${inst.cp === 'C' ? 'call' : 'put'}`;
    case 'digital':
      return `${name(inst.asset)} ${fmtT(inst.expiry)} ${fmtStrike(inst.asset, inst.strike)} digital ${inst.cp === 'C' ? 'call' : 'put'}`;
    case 'barrier':
      return `${name(inst.asset)} ${fmtT(inst.expiry)} ${fmtStrike(inst.asset, inst.strike)} ${inst.cp === 'C' ? 'call' : 'put'} ${inst.dir}-and-${inst.kind} @ ${fmtStrike(inst.asset, inst.barrier)}${inst.hit ? ' (hit)' : ''}`;
    case 'swap':
      return `USD IRS ${Math.round(inst.end - inst.start)}Y @ ${(inst.fixed * 100).toFixed(3)}%`;
    case 'autocall':
      return `${inst.assets.length > 1 ? 'Worst-of ' : ''}${inst.assets.map(name).join('/')} autocall ${(inst.coupon * periodsPerYear(inst) * 100).toFixed(2)}% p.a. KI ${(inst.ki * 100).toFixed(0)}%`;
  }
}
export const periodsPerYear = (inst: AutocallInst) => 1 / (inst.obs.length > 1 ? inst.obs[1] - inst.obs[0] : 0.25);
export function fmtStrike(a: AssetId, k: number): string {
  return k.toFixed(SPECS[a].kind === 'fx' ? 4 : SPECS[a].kind === 'stock' ? 1 : 0);
}
export const underlyings = (inst: Instrument): AssetId[] => (inst.type === 'autocall' ? inst.assets : inst.type === 'swap' ? [] : [inst.asset]);
export const isMC = (inst: Instrument) => inst.type === 'autocall';
