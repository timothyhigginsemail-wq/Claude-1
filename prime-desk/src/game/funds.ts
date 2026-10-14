// Fictional hedge fund roster. Each fund has a strategy-driven target book, credit profile and
// negotiating stance. Names and data are invented.

import { normaliseBook } from '../engine/behavior';
import { emptyClientPnl } from '../engine/funding';
import { hashStr, rand, pick, type RngHolder } from '../engine/rng';
import type { Client, ClientTerms, FundProfile } from '../engine/types';

export function standardTerms(day = 0): ClientTerms {
  return {
    financingSpreadBps: 90,
    creditSpreadBps: 50,
    gcFeeBps: 30,
    htbMarkupPct: 0.2,
    imMultiplier: 1.0,
    maintRatio: 0.8,
    maxGrossLeverage: 6,
    creditLimit: 500e6,
    rehypCapPct: 1.4,
    method: 'house',
    concThresholdPct: 0.25,
    lockupDays: 0,
    termsDay: day,
    feeOverrides: {},
    feeMarkups: {},
  };
}

interface FundDef {
  id: string;
  name: string;
  short: string;
  color: string;
  arrivalDay: number;
  pitch: string;
  nav: number;
  walletShare: number;
  otherPBs: { competitorId: string; share: number }[];
  profile: FundProfile;
  ask: Partial<ClientTerms>;
}

const DEFS: FundDef[] = [
  {
    id: 'northstar',
    name: 'Northstar Capital',
    short: 'Northstar',
    color: '#7FA7D9',
    arrivalDay: 1,
    pitch:
      'A $6bn diversified equity long/short manager. Stable, conservative leverage and a large, liquid long book — the kind of inventory that feeds a stock-loan desk. They want a third prime broker and tight pricing in exchange for a long-term relationship.',
    nav: 6e9,
    walletShare: 0.04,
    otherPBs: [
      { competitorId: 'stanhope', share: 0.55 },
      { competitorId: 'ironbridge', share: 0.41 },
    ],
    profile: {
      strategy: 'Fundamental equity long/short',
      style: 'longshort',
      targetGross: 2.2,
      netBias: 0.3,
      turnover: 0.03,
      rating: 'A',
      basePD: 0.004,
      priceSensitivity: 0.55,
      alpha: 0.06,
      stressDeleverage: 0.3,
      maxBorrowFeeBps: 800,
      book: { ORBT: 0.11, VNTG: 0.07, NMBS: 0.06, MDLH: 0.06, TTNA: 0.05, PTVN: 0.05, AURA: 0.05, HLXS: 0.06, VOLT: 0.03, CRVA: 0.03, GRNB: 0.04, KYRL: 0.04, BRWY: 0.03, PXLT: 0.02, USLC: -0.1, QRTL: -0.03, SLCE: -0.04, HBRV: -0.04, LKSH: -0.03, FRGE: -0.03, RDGL: -0.03 },
    },
    ask: { financingSpreadBps: 65, imMultiplier: 0.9, rehypCapPct: 1.0, lockupDays: 30, gcFeeBps: 20 },
  },
  {
    id: 'redwood',
    name: 'Redwood Capital',
    short: 'Redwood',
    color: '#D98F6F',
    arrivalDay: 1,
    pitch:
      'An $800m activist fund running a handful of very large positions — its flagship is a 38% weight in Calder Logistics. Pays well for flexibility: it offers SOFR+150 but wants lenient margin on concentrated, thinly traded names and a 60-day margin lock-up.',
    nav: 0.8e9,
    walletShare: 0.2,
    otherPBs: [
      { competitorId: 'kestrel', share: 0.45 },
      { competitorId: 'carraway', share: 0.35 },
    ],
    profile: {
      strategy: 'Activist / concentrated value',
      style: 'activist',
      targetGross: 2.4,
      netBias: 0.85,
      turnover: 0.005,
      rating: 'BB',
      basePD: 0.025,
      priceSensitivity: 0.3,
      alpha: 0.05,
      stressDeleverage: 0.1,
      maxBorrowFeeBps: 400,
      book: { CLDR: 0.38, EVRW: 0.22, FRGE: 0.14, SLCE: 0.1, USLC: -0.09, KYRL: -0.07 },
    },
    ask: { financingSpreadBps: 150, imMultiplier: 0.75, concThresholdPct: 0.45, lockupDays: 60, maxGrossLeverage: 4, creditLimit: 400e6 },
  },
  {
    id: 'vector',
    name: 'Vector Quant',
    short: 'Vector',
    color: '#9C8FD9',
    arrivalDay: 2,
    pitch:
      'A $3bn systematic market-neutral fund. Thousands of small positions (shown here as a representative basket), very high turnover and a short book skewed toward hard-to-borrow names. Extremely price-sensitive; lives and dies on borrow availability.',
    nav: 3e9,
    walletShare: 0.05,
    otherPBs: [
      { competitorId: 'stanhope', share: 0.5 },
      { competitorId: 'helvetia', share: 0.45 },
    ],
    profile: {
      strategy: 'Systematic equity market-neutral',
      style: 'quant',
      targetGross: 5.5,
      netBias: 0,
      turnover: 0.15,
      rating: 'BBB',
      basePD: 0.008,
      priceSensitivity: 0.85,
      alpha: 0.08,
      stressDeleverage: 0.6,
      maxBorrowFeeBps: 1600,
      book: {
        ORBT: 0.05, VNTG: 0.05, MDLH: 0.04, GRNB: 0.04, LKSH: 0.04, BRWY: 0.04, PTVN: 0.04, TTNA: 0.04, KYRL: 0.04, NLPW: 0.04, FRGE: 0.04, AURA: 0.03, NMBS: 0.03, EVRW: 0.03,
        HLXS: -0.06, VOLT: -0.05, QRTL: -0.04, CRVA: -0.04, STRM: -0.04, PXLT: -0.04, SLCE: -0.04, HBRV: -0.04, RDGL: -0.04, CLDR: -0.03, USLC: -0.06,
      },
    },
    ask: { financingSpreadBps: 70, htbMarkupPct: 0.1, gcFeeBps: 20, imMultiplier: 0.9, maxGrossLeverage: 8 },
  },
  {
    id: 'meridian',
    name: 'Meridian Partners',
    short: 'Meridian',
    color: '#6FC2B0',
    arrivalDay: 6,
    pitch:
      'A $30bn multi-manager platform with 120 pods. Starts with a trial allocation, but could become your largest client. High gross leverage, heavy daily turnover, demanding service and constant shopping of financing terms between its seven prime brokers.',
    nav: 30e9,
    walletShare: 0.012,
    otherPBs: [
      { competitorId: 'stanhope', share: 0.25 },
      { competitorId: 'carraway', share: 0.2 },
      { competitorId: 'ironbridge', share: 0.2 },
      { competitorId: 'bayview', share: 0.15 },
      { competitorId: 'helvetia', share: 0.1 },
    ],
    profile: {
      strategy: 'Multi-manager (pod) equities',
      style: 'multimanager',
      targetGross: 4.5,
      netBias: 0.08,
      turnover: 0.08,
      rating: 'A',
      basePD: 0.005,
      priceSensitivity: 0.75,
      alpha: 0.09,
      stressDeleverage: 0.7,
      maxBorrowFeeBps: 1200,
      book: {
        NMBS: 0.06, AURA: 0.06, ORBT: 0.05, HLXS: 0.04, VNTG: 0.04, MDLH: 0.04, TTNA: 0.04, GRNB: 0.03, PTVN: 0.03, CRVA: 0.03, EVRW: 0.03, KYRL: 0.03,
        VOLT: -0.05, STRM: -0.04, QRTL: -0.03, USLC: -0.1, SLCE: -0.04, HBRV: -0.03, LKSH: -0.03, BRWY: -0.04, NLPW: -0.04, PXLT: -0.03,
      },
    },
    ask: { financingSpreadBps: 60, imMultiplier: 0.85, maxGrossLeverage: 7, creditLimit: 900e6, lockupDays: 30 },
  },
  {
    id: 'vulture',
    name: 'Vulture Credit',
    short: 'Vulture',
    color: '#C9B26A',
    arrivalDay: 12,
    pitch:
      'A $1.2bn distressed-debt manager holding stressed bonds that trade by appointment. Offers fat spreads, but the collateral is hard to value, hard to repo, and one issuer (Meadow Retail) is not repo-eligible at all.',
    nav: 1.2e9,
    walletShare: 0.1,
    otherPBs: [{ competitorId: 'bayview', share: 0.9 }],
    profile: {
      strategy: 'Distressed credit',
      style: 'credit',
      targetGross: 1.5,
      netBias: 0.8,
      turnover: 0.004,
      rating: 'B',
      basePD: 0.04,
      priceSensitivity: 0.35,
      alpha: 0.04,
      stressDeleverage: 0.15,
      maxBorrowFeeBps: 600,
      book: { SRTL29: 0.34, PNCR28: 0.3, MDRT27: 0.18, HBRV: -0.1, SLCE: -0.08 },
    },
    ask: { financingSpreadBps: 225, imMultiplier: 0.9, concThresholdPct: 0.4, maxGrossLeverage: 2.5, creditLimit: 150e6 },
  },
  {
    id: 'orion',
    name: 'Orion Macro',
    short: 'Orion',
    color: '#D9789C',
    arrivalDay: 18,
    pitch:
      'An $8bn global macro fund trading index and rates futures plus ETFs. Wants Atlas to clear its futures and finance its cash book. Low credit risk but large futures notional, CCP margin to fund, and big collateral swings.',
    nav: 8e9,
    walletShare: 0.03,
    otherPBs: [
      { competitorId: 'ironbridge', share: 0.6 },
      { competitorId: 'helvetia', share: 0.37 },
    ],
    profile: {
      strategy: 'Global macro (futures & ETFs)',
      style: 'macro',
      targetGross: 5,
      netBias: 0.2,
      turnover: 0.05,
      rating: 'A',
      basePD: 0.005,
      priceSensitivity: 0.6,
      alpha: 0.05,
      stressDeleverage: 0.5,
      maxBorrowFeeBps: 300,
      book: { XFUT: 0.38, TYFUT: -0.27, TRSY: 0.14, USLC: 0.09, PTVN: 0.06, GRNB: -0.06 },
    },
    ask: { financingSpreadBps: 55, imMultiplier: 0.9, creditLimit: 300e6, maxGrossLeverage: 10 },
  },
];

function makeClient(d: FundDef, day: number): Client {
  const terms = standardTerms(day);
  const c: Client = {
    id: d.id,
    name: d.name,
    short: d.short,
    color: d.color,
    status: 'prospect',
    arrivalDay: d.arrivalDay,
    pitch: d.pitch,
    profile: JSON.parse(JSON.stringify(d.profile)),
    fund: {
      nav: d.nav,
      peakNav: d.nav,
      freeCash: d.nav * 0.07,
      otherPBs: d.otherPBs,
      redemptionsPending: 0,
      recentReturn: 0,
      anchorEquity: 0,
    },
    terms,
    ask: { ...d.ask, initialEquity: d.nav * d.walletShare },
    positions: {},
    walletShare: d.walletShare,
    relationship: 50,
    satisfaction: 0,
    pnl: emptyClientPnl(),
    pnlToday: emptyClientPnl(),
    equityHist: [],
    borrowFails: 0,
    notes: [],
    lastCompetitorDay: 0,
    constrained: 0,
    accum: { days: 0, debit: 0, credit: 0, sp: 0 },
    askCooldown: {},
  };
  normaliseBook(c);
  return c;
}

export function rosterClients(): Record<string, Client> {
  return Object.fromEntries(DEFS.map((d) => [d.id, makeClient(d, 0)]));
}

// ----- procedural funds for the open-ended game -----
const PREFIX = ['Ashgrove', 'Kingfisher', 'Larchmont', 'Tidewater', 'Halberd', 'Copperline', 'Wyvern', 'Silverleaf', 'Granary', 'Lodestar', 'Bramble', 'Saltmarsh', 'Fernhill', 'Obsidian', 'Quillon', 'Aldgate'];
const SUFFIX = ['Capital', 'Partners', 'Asset Management', 'Investors', 'Advisors', 'Fund Management'];
const COLORS = ['#8FB3A0', '#B39DDB', '#E0A96D', '#80B9D9', '#C58FA8', '#A3B86C', '#D9A07F', '#7FC7C0'];

const TEMPLATES: { style: FundProfile['style']; strategy: string; build: (h: RngHolder) => Partial<FundProfile> }[] = [
  {
    style: 'longshort',
    strategy: 'Fundamental equity long/short',
    build: () => ({ targetGross: 2.0, netBias: 0.35, turnover: 0.03, priceSensitivity: 0.5, stressDeleverage: 0.35, maxBorrowFeeBps: 700 }),
  },
  {
    style: 'quant',
    strategy: 'Statistical arbitrage',
    build: () => ({ targetGross: 6, netBias: 0, turnover: 0.2, priceSensitivity: 0.9, stressDeleverage: 0.65, maxBorrowFeeBps: 1500 }),
  },
  {
    style: 'multimanager',
    strategy: 'Multi-strategy platform',
    build: () => ({ targetGross: 4.2, netBias: 0.1, turnover: 0.07, priceSensitivity: 0.75, stressDeleverage: 0.6, maxBorrowFeeBps: 1100 }),
  },
  {
    style: 'activist',
    strategy: 'Event-driven / special situations',
    build: () => ({ targetGross: 2.1, netBias: 0.7, turnover: 0.01, priceSensitivity: 0.35, stressDeleverage: 0.15, maxBorrowFeeBps: 500 }),
  },
];

function shuffle<T>(h: RngHolder, arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand(h) * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const EQUITIES = ['ORBT', 'NMBS', 'HLXS', 'VNTG', 'PXLT', 'CRVA', 'MDLH', 'GRNB', 'LKSH', 'QRTL', 'BRWY', 'SLCE', 'PTVN', 'RDGL', 'TTNA', 'KYRL', 'CLDR', 'EVRW', 'STRM', 'NLPW', 'VOLT', 'HBRV', 'FRGE', 'AURA'];

export function generateFund(h: RngHolder, day: number, usedNames: Set<string>, opts: { displacedFrom?: string } = {}): Client {
  // short names (first word) must be unique too — they label the client everywhere in the UI
  const usedPrefixes = new Set([...usedNames].map((n) => n.split(' ')[0]));
  const free = PREFIX.filter((p) => !usedPrefixes.has(p));
  const prefix = free.length ? pick(h, free) : `${pick(h, PREFIX)} ${String.fromCharCode(65 + Math.floor(rand(h) * 26))}.`;
  const name = `${prefix} ${pick(h, SUFFIX)}`;
  const tpl = pick(h, TEMPLATES);
  const ratingRoll = rand(h);
  const rating: FundProfile['rating'] = ratingRoll < 0.25 ? 'A' : ratingRoll < 0.6 ? 'BBB' : ratingRoll < 0.85 ? 'BB' : 'B';
  const pd = { A: 0.005, BBB: 0.009, BB: 0.022, B: 0.045, CCC: 0.1 }[rating];
  const base = tpl.build(h);
  const book: Record<string, number> = {};
  const n = tpl.style === 'activist' ? 5 : tpl.style === 'quant' ? 18 : 12;
  const names = shuffle(h, [...EQUITIES]).slice(0, n);
  const net = base.netBias ?? 0.2;
  names.forEach((id, i) => {
    const sideLong = i < Math.round(n * (0.5 + net / 2));
    const w = tpl.style === 'activist' && i === 0 ? 0.35 : 0.5 + rand(h);
    book[id] = sideLong ? w : -w;
  });
  if (tpl.style !== 'activist') book.USLC = -(0.3 + rand(h) * 0.5) * (net > 0.2 ? 1 : 0.4);
  const nav = (tpl.style === 'multimanager' ? 8e9 : tpl.style === 'activist' ? 1e9 : 2.5e9) * (0.5 + rand(h));
  const id = `f${hashStr(name + day).toString(36)}`;
  const c: Client = {
    id,
    name,
    short: prefix,
    color: pick(h, COLORS),
    status: 'prospect',
    arrivalDay: day,
    pitch: opts.displacedFrom
      ? `A ${tpl.strategy.toLowerCase()} fund looking for a new prime broker after problems at ${opts.displacedFrom}. They need to move quickly and value balance-sheet stability over price.`
      : `A ${tpl.strategy.toLowerCase()} manager adding a prime broker. ${rating === 'A' || rating === 'BBB' ? 'Solid institutional credit.' : 'Weaker credit profile — check the book carefully.'}`,
    profile: {
      strategy: tpl.strategy,
      style: tpl.style,
      targetGross: base.targetGross ?? 2,
      netBias: net,
      turnover: base.turnover ?? 0.03,
      rating,
      basePD: pd,
      priceSensitivity: opts.displacedFrom ? 0.3 : base.priceSensitivity ?? 0.5,
      alpha: 0.03 + rand(h) * 0.06,
      stressDeleverage: base.stressDeleverage ?? 0.4,
      maxBorrowFeeBps: base.maxBorrowFeeBps ?? 800,
      book,
    },
    fund: { nav, peakNav: nav, freeCash: nav * 0.07, otherPBs: [{ competitorId: 'stanhope', share: 0.5 }, { competitorId: 'bayview', share: 0.4 }], redemptionsPending: 0, recentReturn: 0, anchorEquity: 0 },
    terms: standardTerms(day),
    ask: { financingSpreadBps: 60 + Math.round(rand(h) * 60) + (rating === 'BB' ? 40 : rating === 'B' ? 90 : 0), imMultiplier: 0.8 + Math.round(rand(h) * 3) / 10, initialEquity: nav * (0.03 + rand(h) * 0.05), lockupDays: rand(h) < 0.4 ? 30 : 0 },
    positions: {},
    walletShare: 0.05,
    relationship: opts.displacedFrom ? 60 : 45,
    satisfaction: 0,
    pnl: emptyClientPnl(),
    pnlToday: emptyClientPnl(),
    equityHist: [],
    borrowFails: 0,
    notes: [],
    lastCompetitorDay: 0,
    constrained: 0,
    accum: { days: 0, debit: 0, credit: 0, sp: 0 },
    askCooldown: {},
  };
  c.walletShare = (c.ask!.initialEquity ?? 0) / nav;
  // normalise weights
  let g = 0;
  for (const k in c.profile.book) g += Math.abs(c.profile.book[k]);
  for (const k in c.profile.book) c.profile.book[k] /= g;
  return c;
}
