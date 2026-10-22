// Bump-and-revalue sensitivities, VaR / expected shortfall and full-revaluation stress tests.

import { ASSETS, AssetId, DAY, EQUITIES, MarketView, SPECS, corrMatrix } from './market';
import { Instrument, MC_PATHS_BOOK, MC_PATHS_RISK, isMC, underlyings, unitPV } from './pricing';
import { Rng, clamp, hash32, quantile } from './math';

/** Sensitivities of one unit (or a whole book when scaled). $ amounts in USD. */
export interface Risk {
  pv: number;
  delta: Record<AssetId, number>; // $ P&L for a +1% move in the asset
  gamma: Record<AssetId, number>; // change in delta$ for a +1% move
  vega: Record<AssetId, number>; // $ per +1 vol point
  vanna: Record<AssetId, number>; // change in delta$ per +1 vol point
  volga: Record<AssetId, number>; // change in vega$ per +1 vol point
  theta: number; // $ for one trading day passing
  dv01: number; // $ per +1bp parallel USD curve shift
  corr01: number; // $ per +1 point of equity implied correlation
}

const zeroAssets = () => ({ ORX: 0, NKT: 0, AUR: 0, EURUSD: 0 }) as Record<AssetId, number>;
export const zeroRisk = (): Risk => ({ pv: 0, delta: zeroAssets(), gamma: zeroAssets(), vega: zeroAssets(), vanna: zeroAssets(), volga: zeroAssets(), theta: 0, dv01: 0, corr01: 0 });

export function cloneView(v: MarketView): MarketView {
  return {
    ...v,
    spot: { ...v.spot },
    smile: { ORX: { ...v.smile.ORX }, NKT: { ...v.smile.NKT }, AUR: { ...v.smile.AUR }, EURUSD: { ...v.smile.EURUSD } },
    curve: { ...v.curve },
    corr: v.corr.map((r) => [...r]),
    events: v.events,
  };
}
export function bumpSpot(v: MarketView, a: AssetId, rel: number): MarketView {
  const c = cloneView(v);
  c.spot[a] *= 1 + rel;
  return c;
}
export function bumpVol(v: MarketView, a: AssetId, pts: number): MarketView {
  const c = cloneView(v);
  c.smile[a].shift = (c.smile[a].shift ?? 0) + pts / 100;
  return c;
}
export function bumpCorr(v: MarketView, pts: number): MarketView {
  const c = cloneView(v);
  c.eqCorr = clamp(v.eqCorr + pts / 100, -0.2, 0.97);
  c.corr = corrMatrix(c.eqCorr, v.stress);
  return c;
}
export function bumpRates(v: MarketView, bp: number): MarketView {
  const c = cloneView(v);
  c.curve.b0 += bp / 1e4;
  return c;
}
export function bumpTime(v: MarketView, days: number): MarketView {
  const c = cloneView(v);
  c.t += days * DAY;
  return c;
}

/** Which risk factors an instrument depends on (keeps bumping cheap). */
function factorsOf(inst: Instrument): { assets: AssetId[]; rates: boolean; corr: boolean } {
  const und = underlyings(inst);
  const assets = new Set<AssetId>(und);
  const eur = und.some((a) => SPECS[a].ccy === 'EUR');
  if (eur || (inst.type === 'autocall' && und.includes('AUR'))) assets.add('EURUSD');
  if (inst.type === 'autocall' && !und.includes('AUR')) assets.delete('EURUSD');
  return { assets: [...assets], rates: true, corr: inst.type === 'autocall' && und.filter((a) => EQUITIES.includes(a)).length > 1 };
}

/** Per-unit risk of an instrument by central finite differences (common random numbers for MC products). */
export function instrumentRisk(inst: Instrument, view: MarketView, paths = isMC(inst) ? MC_PATHS_RISK : MC_PATHS_BOOK): Risk {
  const f = (v: MarketView) => unitPV(inst, v, paths);
  const r = zeroRisk();
  const base = f(view);
  r.pv = base;
  const { assets, corr } = factorsOf(inst);
  const hS = isMC(inst) ? 0.02 : 0.005;
  for (const a of assets) {
    const up = f(bumpSpot(view, a, hS));
    const dn = f(bumpSpot(view, a, -hS));
    r.delta[a] = ((up - dn) / (2 * hS)) * 0.01;
    r.gamma[a] = ((up - 2 * base + dn) / (hS * hS)) * 1e-4;
    const vu = f(bumpVol(view, a, 1));
    const vd = f(bumpVol(view, a, -1));
    r.vega[a] = (vu - vd) / 2;
    r.volga[a] = vu - 2 * base + vd;
    if (!isMC(inst)) {
      const uu = f(bumpVol(bumpSpot(view, a, hS), a, 1));
      const ud = f(bumpVol(bumpSpot(view, a, hS), a, -1));
      const du = f(bumpVol(bumpSpot(view, a, -hS), a, 1));
      const dd = f(bumpVol(bumpSpot(view, a, -hS), a, -1));
      r.vanna[a] = ((uu - ud - du + dd) / (4 * hS)) * 0.01;
    }
  }
  r.theta = f(bumpTime(view, 1)) - base;
  r.dv01 = (f(bumpRates(view, 1)) - f(bumpRates(view, -1))) / 2;
  if (corr) r.corr01 = (f(bumpCorr(view, 10)) - f(bumpCorr(view, -10))) / 20; // wide bump: MC payoffs are discontinuous
  return r;
}

export function addRisk(acc: Risk, r: Risk, w: number) {
  acc.pv += r.pv * w;
  for (const a of ASSETS) {
    acc.delta[a] += r.delta[a] * w;
    acc.gamma[a] += r.gamma[a] * w;
    acc.vega[a] += r.vega[a] * w;
    acc.vanna[a] += r.vanna[a] * w;
    acc.volga[a] += r.volga[a] * w;
  }
  acc.theta += r.theta * w;
  acc.dv01 += r.dv01 * w;
  acc.corr01 += r.corr01 * w;
}
export function scaleRisk(r: Risk, w: number): Risk {
  const o = zeroRisk();
  addRisk(o, r, w);
  return o;
}

// ---------------------------------------------------------------- VaR (delta-gamma-vega, fat-tailed factor simulation)

export interface VarResult {
  var99: number;
  es975: number;
  pnl: number[]; // sorted scenario P&L
}

export function computeVaR(risk: Risk, view: MarketView, seed: number, n = 2000): VarResult {
  const rng = new Rng(hash32(seed, 'var'));
  const vols = ASSETS.map((a) => {
    const s = view.smile[a];
    return Math.max(0.03, s.v + (s.shift ?? 0)) / Math.sqrt(252);
  });
  const L = view.corr.map((row) => [...row]);
  // Cholesky of the 4×4 correlation
  const chol: number[][] = [[], [], [], []];
  for (let i = 0; i < 4; i++)
    for (let j = 0; j <= i; j++) {
      let s = L[i][j];
      for (let k = 0; k < j; k++) s -= chol[i][k] * chol[j][k];
      chol[i][j] = i === j ? Math.sqrt(Math.max(s, 1e-9)) : s / chol[j][j];
    }
  const out: number[] = [];
  for (let k = 0; k < n; k++) {
    const z = [rng.normal(), rng.normal(), rng.normal(), rng.normal()];
    // common fat-tail scaling (Student-t with 4 dof, unit variance)
    let chi = 0;
    for (let i = 0; i < 4; i++) chi += rng.normal() ** 2;
    const scale = Math.sqrt(4 / Math.max(chi, 1e-6)) * Math.sqrt(0.5);
    let pnl = risk.theta;
    for (let i = 0; i < 4; i++) {
      let w = 0;
      for (let j = 0; j <= i; j++) w += chol[i][j] * z[j];
      const a = ASSETS[i];
      const ret = vols[i] * w * scale * 100; // in %
      const spec = SPECS[a];
      const dvol = (spec.spotVolCorr * w + Math.sqrt(1 - spec.spotVolCorr ** 2) * rng.normal()) * scale * spec.volOfVol * 0.45 * (view.smile[a].v * 100) / Math.sqrt(252);
      pnl += risk.delta[a] * ret + 0.5 * risk.gamma[a] * ret * ret + risk.vega[a] * dvol + risk.vanna[a] * ret * dvol + 0.5 * risk.volga[a] * dvol * dvol;
    }
    pnl += risk.dv01 * rng.normal() * 6 * scale;
    out.push(pnl);
  }
  out.sort((a, b) => a - b);
  const q = quantile(out, 0.01);
  const cut = Math.max(1, Math.floor(n * 0.025));
  const es = out.slice(0, cut).reduce((a, b) => a + b, 0) / cut;
  return { var99: Math.max(0, -q), es975: Math.max(0, -es), pnl: out };
}

// ---------------------------------------------------------------- stress tests (full revaluation)

export interface StressScenario {
  id: string;
  label: string;
  note: string;
  eq: number; // equity move (log-return) applied to all equities, scaled by beta
  single?: { asset: AssetId; move: number };
  fx: number;
  vol: number; // vol points added to all assets
  corr: number; // implied correlation points
  rates: number; // bp
}

export const STRESSES: StressScenario[] = [
  { id: 'crash', label: 'Crash', note: 'Equities −20%, vol +25pts, correlation → highs, rates −60bp', eq: -0.2, fx: -0.03, vol: 25, corr: 25, rates: -60 },
  { id: 'selloff', label: 'Selloff', note: 'Equities −8%, vol +8, corr +10', eq: -0.08, fx: -0.012, vol: 8, corr: 10, rates: -20 },
  { id: 'dispersion', label: 'Dispersion', note: 'NKT −25% alone, index −1.5%, corr −20pts', eq: -0.015, single: { asset: 'NKT', move: -0.25 }, fx: 0, vol: 3, corr: -20, rates: 0 },
  { id: 'melt', label: 'Melt-up', note: 'Equities +10%, vol −4pts', eq: 0.1, fx: 0.01, vol: -4, corr: -5, rates: 25 },
  { id: 'volcrush', label: 'Vol crush', note: 'Spot flat, vol −5pts, corr −8', eq: 0, fx: 0, vol: -5, corr: -8, rates: 0 },
  { id: 'hawk', label: 'Hawkish shock', note: 'Rates +75bp, USD +3%, equities −5%', eq: -0.05, fx: -0.03, vol: 4, corr: 5, rates: 75 },
];

export function applyStress(view: MarketView, s: StressScenario): MarketView {
  let v = cloneView(view);
  const beta: Record<AssetId, number> = { ORX: 1, NKT: 1.35, AUR: 0.9, EURUSD: 0 };
  for (const a of EQUITIES) v.spot[a] *= Math.exp(s.eq * beta[a]);
  if (s.single) v.spot[s.single.asset] *= Math.exp(s.single.move);
  v.spot.EURUSD *= Math.exp(s.fx);
  for (const a of ASSETS) v.smile[a].shift = (v.smile[a].shift ?? 0) + (s.vol / 100) * (a === 'EURUSD' ? 0.4 : a === 'NKT' ? 1.3 : 1);
  v = bumpCorr(v, s.corr);
  v.curve.b0 += s.rates / 1e4;
  return v;
}

/** Spot × vol grid for one equity-like move applied to all equities. */
export const GRID_SPOT = [-0.2, -0.1, -0.05, 0, 0.05, 0.1];
export const GRID_VOL = [-5, 0, 5, 10, 20];
