// Market environment: regime-switching factor model for prices, money-market conditions
// (SOFR, repo spreads, haircuts, treasury FTP) and securities-lending supply/demand.
// All numbers are fictional and illustrative.

import { chance, rand, randNormal } from './rng';
import { updateMarketFees } from './lending';
import type { GameState, Regime } from './types';

interface RegimeParams {
  mu: number;
  vol: number;
  vix: number;
  repoStress: number;
  haircut: number;
  appetite: number;
  ftp: number;
  credit: number;
  label: string;
}

export const REGIMES: Record<Regime, RegimeParams> = {
  bull: { mu: 0.0007, vol: 0.007, vix: 13, repoStress: 0, haircut: 1, appetite: 1, ftp: 55, credit: 350, label: 'Bull market' },
  steady: { mu: 0.0003, vol: 0.009, vix: 16, repoStress: 0, haircut: 1, appetite: 1, ftp: 60, credit: 400, label: 'Steady' },
  choppy: { mu: 0, vol: 0.013, vix: 21, repoStress: 5, haircut: 1.05, appetite: 0.95, ftp: 65, credit: 450, label: 'Choppy' },
  recovery: { mu: 0.0015, vol: 0.015, vix: 24, repoStress: 12, haircut: 1.1, appetite: 0.9, ftp: 75, credit: 520, label: 'Recovery' },
  stressed: { mu: -0.0025, vol: 0.022, vix: 31, repoStress: 30, haircut: 1.3, appetite: 0.8, ftp: 90, credit: 650, label: 'Stressed' },
  crisis: { mu: -0.008, vol: 0.035, vix: 46, repoStress: 85, haircut: 1.8, appetite: 0.55, ftp: 130, credit: 950, label: 'Crisis' },
};

const TRANSITIONS: Record<Regime, [Regime, number][]> = {
  bull: [['steady', 0.03], ['choppy', 0.01]],
  steady: [['bull', 0.03], ['choppy', 0.04]],
  choppy: [['steady', 0.08], ['stressed', 0.035]],
  stressed: [['crisis', 0.05], ['recovery', 0.1], ['choppy', 0.05]],
  crisis: [['recovery', 0.15]],
  recovery: [['steady', 0.1], ['bull', 0.04], ['choppy', 0.03]],
};

export function setRegime(s: GameState, r: Regime) {
  if (s.market.regime !== r) {
    s.market.regime = r;
    s.market.regimeAge = 0;
  }
}

function approach(cur: number, target: number, speed: number) {
  return cur + (target - cur) * speed;
}

export interface MarketMoveOpts {
  /** Force the market return for the day (scenario beats). */
  mktReturn?: number;
  /** Force idiosyncratic returns for specific securities. */
  secShocks?: Record<string, number>;
  /** Hold the regime fixed (no random transition today). */
  holdRegime?: boolean;
}

export function advanceMarket(s: GameState, opts: MarketMoveOpts = {}) {
  const m = s.market;
  // regime transition
  if (!opts.holdRegime) {
    const u = rand(s);
    let acc = 0;
    for (const [to, p] of TRANSITIONS[m.regime]) {
      acc += p;
      if (u < acc) {
        setRegime(s, to);
        break;
      }
    }
  }
  m.regimeAge++;
  const rp = REGIMES[m.regime];
  const rm = opts.mktReturn ?? rp.mu + rp.vol * randNormal(s);
  m.lastReturn = rm;
  // money markets drift toward regime targets
  m.shockBps *= 0.94; // funding shocks fade over a few weeks
  if (m.shockBps < 1) m.shockBps = 0;
  m.repoStressBps = approach(m.repoStressBps, rp.repoStress + m.shockBps, 0.35);
  m.haircutMult = approach(m.haircutMult, rp.haircut, 0.25);
  m.repoAppetite = approach(m.repoAppetite, rp.appetite, 0.25);
  m.ftpSpreadBps = approach(m.ftpSpreadBps, rp.ftp + m.shockBps * 0.4, 0.3);
  const dSpread = (rp.credit - m.creditSpreadBps) * 0.25 + randNormal(s) * 8;
  m.creditSpreadBps = Math.max(250, m.creditSpreadBps + dSpread);
  const realisedVol = Math.abs(rm) * Math.sqrt(252) * 100 * 0.6;
  m.vol = Math.max(10, approach(m.vol, rp.vix * 0.7 + realisedVol * 0.3 + randNormal(s) * 0.8, 0.45));
  if (chance(s, 0.02)) m.sofr = Math.max(0.01, m.sofr + (rand(s) < 0.5 ? -0.0005 : 0.0005));

  // sector factors
  const sectors: Record<string, number> = {};
  const volMult = rp.vol / 0.009;
  for (const id in s.securities) {
    const sec = s.securities[id];
    if (!(sec.sector in sectors)) sectors[sec.sector] = randNormal(s) * 0.006 * Math.sqrt(volMult);
  }
  for (const id in s.securities) {
    const sec = s.securities[id];
    sec.prevPrice = sec.price;
    let r: number;
    if (sec.kind === 'future') {
      r = id === 'XFUT' ? rm : -0.18 * rm + randNormal(s) * 0.003 + (m.regime === 'crisis' ? 0.002 : 0);
    } else if (sec.kind === 'bond') {
      r = sec.beta * rm - (3 * dSpread) / 1e4 + randNormal(s) * (sec.idioVol / Math.sqrt(252)) * 0.6;
    } else if (id === 'USLC') {
      r = rm + randNormal(s) * 0.0004;
    } else if (id === 'TRSY') {
      r = -0.15 * rm + randNormal(s) * 0.003 + (m.regime === 'crisis' ? 0.0015 : 0);
    } else {
      const idio = randNormal(s) * (sec.idioVol / Math.sqrt(252)) * Math.sqrt(Math.max(1, volMult * 0.8));
      // crowded positions suffer in stress (hedge funds deleverage the same names)
      const crowd = m.regime === 'stressed' || m.regime === 'crisis' ? -0.004 * (sec.crowding - 0.5) * (rm < 0 ? 1 : 0) * (volMult / 2) : 0;
      r = sec.beta * rm + sectors[sec.sector] + idio + crowd;
      if (sec.squeeze > 0) r += sec.squeeze * (0.05 + 0.08 * rand(s));
    }
    if (opts.secShocks && opts.secShocks[id] !== undefined) r = opts.secShocks[id] + (sec.kind === 'equity' ? sec.beta * rm * 0.3 : 0);
    sec.price = Math.max(0.5, sec.price * Math.exp(r));
    sec.hist.push(sec.price);
    if (sec.hist.length > 120) sec.hist.shift();
    // securities lending supply/demand dynamics
    if (sec.kind !== 'future' && sec.lendableFrac > 0) {
      const base = (sec.crowding > 0.7 ? 0.8 : 0.3) * sec.lendableFrac;
      sec.streetShortFrac = Math.max(0, sec.streetShortFrac + (base - sec.streetShortFrac) * 0.002 + randNormal(s) * 0.0012 * sec.lendableFrac);
      sec.streetShortFrac = Math.min(sec.streetShortFrac, sec.lendableFrac * 0.985);
      if (sec.squeeze > 0) {
        // lenders recall into a squeeze; shorts are trapped
        sec.lendableFrac *= 1 - 0.03 * sec.squeeze;
        sec.squeeze *= 0.8;
        if (sec.squeeze < 0.05) sec.squeeze = 0;
      } else {
        sec.lendableFrac = approach(sec.lendableFrac, sec.baseLendableFrac, 0.05);
      }
    }
  }
  m.index = s.securities.USLC.price;
  m.indexHist.push(m.index);
  if (m.indexHist.length > 250) m.indexHist.shift();
  updateMarketFees(s);
}

export function regimeLabel(r: Regime) {
  return REGIMES[r].label;
}
