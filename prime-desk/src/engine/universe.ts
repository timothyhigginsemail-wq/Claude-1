// Fictional securities, lenders and competing prime brokers. All names and data are invented and
// purely illustrative.

import type { Competitor, Lender, RepoClass, SecKind, Security } from './types';

interface SecDef {
  id: string;
  name: string;
  sector: string;
  kind?: SecKind;
  price: number;
  beta: number;
  idioVol: number;
  mcapBn: number;
  advM: number;
  repo: RepoClass;
  lend: number; // lendable fraction of market cap
  shortFrac: number; // street short interest fraction
  crowd: number;
  mult?: number;
}

const DEFS: SecDef[] = [
  { id: 'ORBT', name: 'Orbital Systems', sector: 'Software', price: 412, beta: 1.05, idioVol: 0.18, mcapBn: 2400, advM: 11000, repo: 'A', lend: 0.2, shortFrac: 0.006, crowd: 0.55 },
  { id: 'NMBS', name: 'Nimbus Cloud', sector: 'Software', price: 188, beta: 1.3, idioVol: 0.32, mcapBn: 140, advM: 1400, repo: 'A', lend: 0.18, shortFrac: 0.03, crowd: 0.6 },
  { id: 'HLXS', name: 'Helix Semiconductor', sector: 'Semis', price: 64, beta: 1.6, idioVol: 0.55, mcapBn: 18, advM: 620, repo: 'B', lend: 0.12, shortFrac: 0.104, crowd: 0.85 },
  { id: 'VNTG', name: 'Vantage Devices', sector: 'Hardware', price: 233, beta: 1.15, idioVol: 0.22, mcapBn: 980, advM: 6800, repo: 'A', lend: 0.2, shortFrac: 0.007, crowd: 0.5 },
  { id: 'PXLT', name: 'Pixelate Inc', sector: 'Internet', price: 27, beta: 1.5, idioVol: 0.6, mcapBn: 4.2, advM: 160, repo: 'B', lend: 0.1, shortFrac: 0.06, crowd: 0.4 },
  { id: 'CRVA', name: 'Corvia Therapeutics', sector: 'Biotech', price: 41, beta: 1.1, idioVol: 0.75, mcapBn: 6.5, advM: 210, repo: 'B', lend: 0.08, shortFrac: 0.066, crowd: 0.7 },
  { id: 'MDLH', name: 'Meridel Health', sector: 'Healthcare', price: 156, beta: 0.7, idioVol: 0.17, mcapBn: 310, advM: 1900, repo: 'A', lend: 0.21, shortFrac: 0.01, crowd: 0.35 },
  { id: 'GRNB', name: 'Granite Bancorp', sector: 'Banks', price: 58, beta: 1.2, idioVol: 0.24, mcapBn: 75, advM: 700, repo: 'A', lend: 0.2, shortFrac: 0.02, crowd: 0.3 },
  { id: 'LKSH', name: 'Lakeshore Insurance', sector: 'Insurance', price: 92, beta: 0.85, idioVol: 0.2, mcapBn: 48, advM: 380, repo: 'A', lend: 0.2, shortFrac: 0.015, crowd: 0.25 },
  { id: 'QRTL', name: 'Quanta Retail', sector: 'Retail', price: 18.5, beta: 1.4, idioVol: 0.9, mcapBn: 2.8, advM: 240, repo: 'B', lend: 0.1, shortFrac: 0.093, crowd: 0.9 },
  { id: 'BRWY', name: 'Brightway Foods', sector: 'Staples', price: 71, beta: 0.55, idioVol: 0.16, mcapBn: 62, advM: 420, repo: 'A', lend: 0.22, shortFrac: 0.012, crowd: 0.2 },
  { id: 'SLCE', name: 'Solace Apparel', sector: 'Retail', price: 34, beta: 1.1, idioVol: 0.38, mcapBn: 9, advM: 140, repo: 'B', lend: 0.14, shortFrac: 0.05, crowd: 0.45 },
  { id: 'PTVN', name: 'Petravon Energy', sector: 'Energy', price: 104, beta: 0.9, idioVol: 0.27, mcapBn: 210, advM: 1500, repo: 'A', lend: 0.2, shortFrac: 0.012, crowd: 0.4 },
  { id: 'RDGL', name: 'Ridgeline Oil', sector: 'Energy', price: 46, beta: 1.2, idioVol: 0.4, mcapBn: 14, advM: 260, repo: 'B', lend: 0.15, shortFrac: 0.04, crowd: 0.35 },
  { id: 'TTNA', name: 'Titan Aero', sector: 'Industrials', price: 212, beta: 1.0, idioVol: 0.21, mcapBn: 130, advM: 900, repo: 'A', lend: 0.2, shortFrac: 0.01, crowd: 0.3 },
  { id: 'KYRL', name: 'Keystone Rail', sector: 'Transport', price: 128, beta: 0.95, idioVol: 0.2, mcapBn: 85, advM: 520, repo: 'A', lend: 0.2, shortFrac: 0.012, crowd: 0.25 },
  { id: 'CLDR', name: 'Calder Logistics', sector: 'Transport', price: 52, beta: 1.1, idioVol: 0.42, mcapBn: 7.5, advM: 95, repo: 'B', lend: 0.12, shortFrac: 0.035, crowd: 0.3 },
  { id: 'EVRW', name: 'Everwell Pharma', sector: 'Healthcare', price: 77, beta: 0.8, idioVol: 0.35, mcapBn: 22, advM: 210, repo: 'B', lend: 0.15, shortFrac: 0.025, crowd: 0.3 },
  { id: 'STRM', name: 'Streamline Media', sector: 'Media', price: 23, beta: 1.25, idioVol: 0.5, mcapBn: 11, advM: 230, repo: 'B', lend: 0.12, shortFrac: 0.085, crowd: 0.65 },
  { id: 'NLPW', name: 'Northline Power', sector: 'Utilities', price: 68, beta: 0.45, idioVol: 0.15, mcapBn: 55, advM: 330, repo: 'A', lend: 0.22, shortFrac: 0.01, crowd: 0.15 },
  { id: 'VOLT', name: 'Voltaic Motors', sector: 'Autos', price: 39, beta: 1.8, idioVol: 0.65, mcapBn: 31, advM: 900, repo: 'B', lend: 0.15, shortFrac: 0.11, crowd: 0.75 },
  { id: 'HBRV', name: 'Harborview REIT', sector: 'Real Estate', price: 44, beta: 0.9, idioVol: 0.25, mcapBn: 16, advM: 120, repo: 'B', lend: 0.18, shortFrac: 0.05, crowd: 0.35 },
  { id: 'FRGE', name: 'Forge Industrial', sector: 'Industrials', price: 96, beta: 1.05, idioVol: 0.23, mcapBn: 41, advM: 290, repo: 'A', lend: 0.2, shortFrac: 0.015, crowd: 0.3 },
  { id: 'AURA', name: 'Aura Payments', sector: 'Fintech', price: 142, beta: 1.35, idioVol: 0.34, mcapBn: 95, advM: 1100, repo: 'A', lend: 0.19, shortFrac: 0.025, crowd: 0.6 },
  { id: 'USLC', name: 'US Large Cap Index ETF', sector: 'ETF', kind: 'etf', price: 520, beta: 1.0, idioVol: 0.01, mcapBn: 520, advM: 30000, repo: 'A', lend: 0.15, shortFrac: 0.02, crowd: 0.2 },
  { id: 'TRSY', name: 'US Treasury 7-10Y ETF', sector: 'ETF', kind: 'etf', price: 96, beta: -0.15, idioVol: 0.06, mcapBn: 40, advM: 2500, repo: 'A', lend: 0.15, shortFrac: 0.01, crowd: 0.1 },
  { id: 'SRTL29', name: 'Sorrel Telecom 7.5% 2029', sector: 'Distressed Debt', kind: 'bond', price: 58, beta: 0.35, idioVol: 0.4, mcapBn: 2.4, advM: 9, repo: 'C', lend: 0.02, shortFrac: 0.0, crowd: 0.1 },
  { id: 'PNCR28', name: 'Pinecrest Hospitals 9% 2028', sector: 'Distressed Debt', kind: 'bond', price: 71, beta: 0.3, idioVol: 0.32, mcapBn: 1.8, advM: 7, repo: 'C', lend: 0.02, shortFrac: 0.0, crowd: 0.1 },
  { id: 'MDRT27', name: 'Meadow Retail 6% 2027', sector: 'Distressed Debt', kind: 'bond', price: 44, beta: 0.4, idioVol: 0.55, mcapBn: 1.1, advM: 4, repo: 'none', lend: 0.0, shortFrac: 0.0, crowd: 0.1 },
  { id: 'XFUT', name: 'US500 Index Future (Mar)', sector: 'Futures', kind: 'future', price: 5200, beta: 1.0, idioVol: 0.005, mcapBn: 0, advM: 200000, repo: 'none', lend: 0, shortFrac: 0, crowd: 0.2, mult: 50 },
  { id: 'TYFUT', name: '10Y Note Future (Mar)', sector: 'Futures', kind: 'future', price: 110, beta: -0.2, idioVol: 0.05, mcapBn: 0, advM: 150000, repo: 'none', lend: 0, shortFrac: 0, crowd: 0.1, mult: 1000 },
];

export function makeSecurities(): Record<string, Security> {
  const out: Record<string, Security> = {};
  for (const d of DEFS) {
    out[d.id] = {
      id: d.id,
      ticker: d.id,
      name: d.name,
      sector: d.sector,
      kind: d.kind ?? 'equity',
      price: d.price,
      prevPrice: d.price,
      refPrice: d.price,
      beta: d.beta,
      idioVol: d.idioVol,
      adv: d.advM * 1e6,
      marketCap: d.mcapBn * 1e9,
      repoClass: d.repo,
      multiplier: d.mult,
      lendableFrac: d.lend,
      baseLendableFrac: d.lend,
      streetShortFrac: d.shortFrac,
      borrowFeeBps: 25,
      crowding: d.crowd,
      squeeze: 0,
      hist: [d.price],
    };
  }
  return out;
}

export function makeLenders(): Record<string, Lender> {
  const list: Lender[] = [
    { id: 'atlasAM', name: 'Atlas Asset Management', type: 'Affiliated lending programme', shareOfSupply: 0.04, feeMult: 0.85, recallPropensity: 0.3, affiliate: true, description: "The bank's own asset-management funds lend through Atlas. Stable and cheap, but small; beneficial owners keep a fee split." },
    { id: 'keystone', name: 'Keystone Public Pension', type: 'Pension fund (via agent)', shareOfSupply: 0.24, feeMult: 1.0, recallPropensity: 1.3, description: 'Large, cheap supply. Recalls shares ahead of proxy votes and when governance flags trip.' },
    { id: 'harbor', name: 'Harbor Sovereign Fund', type: 'Sovereign wealth fund', shareOfSupply: 0.18, feeMult: 1.12, recallPropensity: 0.4, description: 'Sticky, long-term lender that charges a premium for reliability.' },
    { id: 'bluewater', name: 'Bluewater Agent Lending', type: 'Custodian agent lender', shareOfSupply: 0.33, feeMult: 1.0, recallPropensity: 0.9, description: 'Pools supply from hundreds of mutual funds. Deep, but reallocates to the highest bidder.' },
    { id: 'ridgefield', name: 'Ridgefield Insurance', type: 'Insurance general account', shareOfSupply: 0.1, feeMult: 0.95, recallPropensity: 1.7, description: 'Cheap supply, but trades its own book actively and recalls frequently.' },
  ];
  return Object.fromEntries(list.map((l) => [l.id, l]));
}

export function makeCompetitors(): Record<string, Competitor> {
  const list: Competitor[] = [
    { id: 'ironbridge', name: 'Ironbridge', archetype: 'Fortress balance sheet', baseSpreadBps: 70, marginMult: 1.1, balanceSheet: 0.95, stockAvailability: 0.7, service: 0.75, capIntro: 0.6, reliability: 0.95, reputation: 0.9, coverage: 'Global', health: 0.97, aggression: 0.45 },
    { id: 'stanhope', name: 'Stanhope Morrow', archetype: '#1 equity prime, deepest stock-loan network', baseSpreadBps: 85, marginMult: 1.0, balanceSheet: 0.8, stockAvailability: 0.95, service: 0.9, capIntro: 0.8, reliability: 0.9, reputation: 0.92, coverage: 'Global', health: 0.93, aggression: 0.5 },
    { id: 'carraway', name: 'Carraway & Co', archetype: 'Premium, sophisticated, strong cap intro', baseSpreadBps: 95, marginMult: 0.95, balanceSheet: 0.75, stockAvailability: 0.88, service: 0.88, capIntro: 0.95, reliability: 0.9, reputation: 0.9, coverage: 'Global', health: 0.92, aggression: 0.4 },
    { id: 'helvetia', name: 'Helvetia Union', archetype: 'European universal bank, flexible terms', baseSpreadBps: 80, marginMult: 0.9, balanceSheet: 0.65, stockAvailability: 0.75, service: 0.7, capIntro: 0.55, reliability: 0.8, reputation: 0.72, coverage: 'Europe / APAC', health: 0.85, aggression: 0.55 },
    { id: 'bayview', name: 'Bayview Securities', archetype: 'Large US bank, value pricing', baseSpreadBps: 75, marginMult: 1.05, balanceSheet: 0.85, stockAvailability: 0.65, service: 0.65, capIntro: 0.45, reliability: 0.88, reputation: 0.8, coverage: 'Americas', health: 0.92, aggression: 0.5 },
    { id: 'kestrel', name: 'Kestrel Prime', archetype: 'Aggressive challenger: cheap and lenient', baseSpreadBps: 60, marginMult: 0.7, balanceSheet: 0.6, stockAvailability: 0.55, service: 0.6, capIntro: 0.35, reliability: 0.6, reputation: 0.5, coverage: 'Americas / Europe', health: 0.75, aggression: 0.9 },
  ];
  return Object.fromEntries(list.map((c) => [c.id, c]));
}
