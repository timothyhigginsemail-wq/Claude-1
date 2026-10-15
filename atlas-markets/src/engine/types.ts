// Atlas Markets — core data model.
//
// Conventions
// - All values in USD unless a currency is named. Rates are decimals p.a., spreads in bps.
// - Market time `t` is in years since the game start (calendar days / 365). Option time uses the
//   same clock. Interest and coupon accruals use ACT/360 on calendar days.
// - Each desk owns multi-currency cash balances and positions. Desk value = Σ cash (converted to USD)
//   + Σ position PVs. Every P&L component (spread capture, execution cost, funding, carry, fees,
//   defaults, market moves) is either a cash flow or a change in PV, so the attribution reconciles
//   exactly to the change in desk value.

export type DeskId = 'eq' | 'rates' | 'fx' | 'credit' | 'cmdty' | 'exotics';
export type Ccy = 'USD' | 'EUR' | 'JPY' | 'GBP' | 'AUD' | 'CAD' | 'MXN' | 'BRL';
export type Regime = 'calm' | 'steady' | 'choppy' | 'stressed' | 'crisis' | 'recovery';

export interface Curve {
  tenors: number[]; // years
  zeros: number[]; // continuously-compounded zero rates
}

export interface MarketState {
  t: number;
  day: number;
  regime: Regime;
  /** Liquidity multiplier on bid/ask spreads and impact (1 = normal). */
  liquidity: number;
  /** Dealer balance-sheet / risk appetite of competitors (1 = normal, lower in stress). */
  dealerAppetite: number;
  rates: {
    /** US Treasury zero curve. */
    ust: Curve;
    /** SOFR (OIS) curve spread to Treasuries by tenor, bps (swap spreads). */
    swapSpread: number[];
    /** Policy/overnight rate (SOFR). */
    sofr: number;
    /** Short rates for non-USD currencies (flat curves). */
    ccy: Record<Ccy, number>;
    /** GC repo spread over SOFR (bps). */
    repoSpread: number;
    /** Treasury funds-transfer-pricing spread for unsecured funding (bps over SOFR). */
    ftpSpread: number;
    /** Normal (bp) volatility for rates options. */
    normalVol: number;
  };
  eq: {
    spot: Record<string, number>; // 'US500' index + single stocks
    div: Record<string, number>;
    atmVol: Record<string, number>; // 'US500' implied ATM vol; stocks via ratio
    skew: number; // vol change per unit log-moneyness (negative = put skew)
    etfPrem: number; // ETF premium/discount to NAV (fraction)
  };
  fx: {
    spot: Record<string, number>; // 'EURUSD', 'USDJPY', ...
    vol: Record<string, number>;
  };
  credit: {
    spread: Record<string, number>; // issuer → bps (CDX indices too)
    defaulted: Record<string, boolean>;
    recovery: Record<string, number>;
    basis: number; // CDS − bond basis, bps
  };
  cmdty: {
    spot: Record<string, number>;
    carry: Record<string, number>; // annualised curve slope: >0 contango, <0 backwardation
    vol: Record<string, number>;
  };
  /** Realised variance accumulators (sum of squared daily log returns) for variance swaps. */
  realised: Record<string, number>;
}

// ---------------------------------------------------------------- instruments

export type InstKind =
  | 'stock'
  | 'etf'
  | 'eqFut'
  | 'eqOpt'
  | 'ust'
  | 'bondFut'
  | 'sofrFut'
  | 'irs'
  | 'fxFwd'
  | 'fxOpt'
  | 'corp'
  | 'cds'
  | 'cmdtyFut'
  | 'cmdtyOpt'
  | 'varSwap'
  | 'autocall';

export interface InstBase {
  id: string;
  kind: InstKind;
  desk: DeskId;
  name: string;
  /** Dynamic instruments (client swaps, forwards, notes) are created by trades. */
  dynamic?: boolean;
}

export interface StockInst extends InstBase { kind: 'stock'; ticker: string; sector: string; beta: number; idioVol: number; adv: number }
export interface EtfInst extends InstBase { kind: 'etf'; ratio: number; adv: number }
export interface EqFutInst extends InstBase { kind: 'eqFut'; underlying: string; expiry: number; mult: number }
export interface EqOptInst extends InstBase { kind: 'eqOpt'; underlying: string; strike: number; expiry: number; cp: 'C' | 'P'; mult: number }
export interface UstInst extends InstBase { kind: 'ust'; coupon: number; maturity: number; tenorLabel: string }
export interface BondFutInst extends InstBase { kind: 'bondFut'; coupon: number; bondTenor: number; expiry: number; mult: number }
export interface SofrFutInst extends InstBase { kind: 'sofrFut'; start: number; end: number; mult: number }
export interface IrsInst extends InstBase { kind: 'irs'; fixed: number; maturity: number; tenorLabel: string }
export interface FxFwdInst extends InstBase { kind: 'fxFwd'; pair: string; strike: number; maturity: number }
export interface FxOptInst extends InstBase { kind: 'fxOpt'; pair: string; strike: number; expiry: number; cp: 'C' | 'P' }
export interface CorpInst extends InstBase { kind: 'corp'; issuer: string; coupon: number; maturity: number; adv: number }
export interface CdsInst extends InstBase { kind: 'cds'; issuer: string; coupon: number; maturity: number }
export interface CmdtyFutInst extends InstBase { kind: 'cmdtyFut'; cmdty: string; expiry: number; mult: number; label: string }
export interface CmdtyOptInst extends InstBase { kind: 'cmdtyOpt'; cmdty: string; futId: string; futExpiry: number; strike: number; expiry: number; cp: 'C' | 'P'; mult: number }
export interface VarSwapInst extends InstBase { kind: 'varSwap'; underlying: string; strikeVol: number; start: number; expiry: number; rv0: number }
export interface AutocallInst extends InstBase {
  kind: 'autocall';
  underlying: string;
  s0: number;
  start: number;
  obs: number[]; // observation times
  coupon: number; // per observation (fraction of notional)
  callLevel: number; // fraction of s0
  kiLevel: number; // knock-in barrier at maturity (fraction of s0)
  seed: number;
}

export type Instrument =
  | StockInst
  | EtfInst
  | EqFutInst
  | EqOptInst
  | UstInst
  | BondFutInst
  | SofrFutInst
  | IrsInst
  | FxFwdInst
  | FxOptInst
  | CorpInst
  | CdsInst
  | CmdtyFutInst
  | CmdtyOptInst
  | VarSwapInst
  | AutocallInst;

export interface Position {
  instId: string;
  qty: number;
  /** Futures: last settlement price (variation margin settles daily to cash). */
  ref?: number;
  /** Counterparty for OTC derivatives (client id), for credit exposure. */
  cpty?: string;
  openedDay: number;
}

// ---------------------------------------------------------------- issuers, clients

export interface Issuer {
  id: string;
  name: string;
  rating: 'AA' | 'A' | 'BBB' | 'BB' | 'B' | 'CCC';
  sector: string;
  beta: number; // sensitivity to the index spread factor
  recovery: number;
  hy: boolean;
}

export type ClientType = 'hedgeFund' | 'quant' | 'pension' | 'assetMgr' | 'insurer' | 'swf' | 'corporate' | 'dealer' | 'emm' | 'privateBank';

export interface Client {
  id: string;
  name: string;
  type: ClientType;
  desks: DeskId[];
  /** 0..100 relationship. */
  relationship: number;
  /** How informed the flow is (0 = uninformed, 1 = very informed). Hidden from the player. */
  informed: number;
  /** Price sensitivity 0..1. */
  priceSens: number;
  /** Typical trade size multiplier. */
  sizeMult: number;
  activity: number;
  /** Rolling stats. */
  rfqs: number;
  wins: number;
  noQuotes: number;
  stressLiquidity: number; // times Atlas quoted in stressed markets
  /** Our share of the client's wallet, 0..1. */
  share: number;
  revenue: number;
  credit: 'A' | 'BBB' | 'BB' | 'B';
  defaulted?: boolean;
}

export interface Competitor {
  id: string;
  name: string;
  style: string;
  /** Relative spread aggressiveness (lower = tighter). */
  tightness: number;
  /** Risk appetite, shrinks in stress. */
  appetite: number;
  strengths: DeskId[];
  share: Record<DeskId, number>;
}

// ---------------------------------------------------------------- RFQs, orders, desks

export interface Rfq {
  id: string;
  time: string;
  clientId: string;
  instId: string;
  desk: DeskId;
  /** + client buys (Atlas sells), − client sells (Atlas buys). Units of the instrument. */
  clientQty: number;
  /** Mid at the time of request. */
  mid: number;
  /** Displayed notional in USD. */
  notional: number;
  urgency: 'low' | 'normal' | 'high';
  /** Market's typical half-spread for this size, in price units. */
  refHalfSpread: number;
  nDealers: number;
  status: 'open' | 'won' | 'lost' | 'passed' | 'expired';
  quotedHalfSpread?: number;
  tradePrice?: number;
  cover?: number; // next-best competitor price (shown after)
  /** Hidden: the direction the client's information points (+1 price up, −1 down, 0 none). */
  signal: number;
  note?: string;
  /** For dynamically created OTC instruments (swaps, forwards, notes): the template. */
  template?: Instrument;
  spreadCapture?: number;
  /** Set when the request reaches the desk on the intraday clock (mid and pricing refreshed then). */
  arrived?: boolean;
}

export interface WorkingOrder {
  id: string;
  instId: string;
  qtyRemaining: number;
  daysLeft: number;
  desk: DeskId;
  note: string;
}

export interface Trader {
  id: string;
  name: string;
  desk: DeskId;
  skill: number; // 0..1
  cost: number; // annual comp
  style: string;
}

export interface DeskLimits {
  var: number; // 1-day 99% VaR limit
  primary: number; // desk's main sensitivity limit (eq delta $/1%, DV01, FX NOP, CS01, cmdty delta, vega)
}

export interface Desk {
  id: DeskId;
  name: string;
  unlocked: boolean;
  capital: number; // allocated
  limits: DeskLimits;
  tech: number; // 0..3 electronic trading capability
  /** Flow pricing stance for electronic flow: 0.7 tight … 1.3 wide. */
  flowSpread: number;
  /** Share of residual flow risk hedged at the close (0..1). */
  autoHedge: number;
  cash: Partial<Record<Ccy, number>>;
  positions: Record<string, Position>;
  breachDays: number;
  restrictedUntil: number;
  /** Cumulative P&L by component. */
  pnl: PnlParts;
  pnlToday: PnlParts;
}

export interface PnlParts {
  spread: number; // spread captured vs mid on client trades
  flow: number; // electronic flow spread capture
  execution: number; // costs paid crossing the street (half-spread + impact)
  time: number; // theta, carry/roll-down from the passage of time
  rates: number;
  fx: number;
  equity: number;
  vol: number;
  credit: number;
  cmdty: number;
  funding: number; // funding, repo, margin funding, borrow fees
  accrual: number; // coupons, dividends, swap/CDS running payments, currency interest
  fees: number; // exchange & clearing fees
  defaults: number;
  other: number; // cross effects / residual
}

export interface MacroEvent {
  id: string;
  day: number;
  time: string;
  kind: 'cpi' | 'fomc' | 'nfp' | 'ecb' | 'earnings' | 'opec' | 'geopolitics' | 'default' | 'gdp' | 'boj' | 'auction' | 'storm';
  title: string;
  consensus?: string;
  /** Realised surprise (drawn at the close), standardised. */
  surprise?: number;
  outcome?: string;
  target?: string; // stock or issuer or commodity
}

export interface LogItem {
  day: number;
  text: string;
  tone?: 'good' | 'bad' | 'neutral';
}

export interface DaySnapshot {
  day: number;
  date: string;
  pnl: number;
  byDesk: Record<DeskId, number>;
  parts: PnlParts;
  var: number;
  capital: number;
  confidence: number;
  us500: number;
  ust10: number;
  regime: Regime;
  ep: number;
}

export interface Opportunity {
  id: string;
  desk: DeskId;
  title: string;
  body: string;
  legs: { instId: string; qty: number }[];
  status: 'open' | 'taken' | 'ignored';
}

export interface GameState {
  version: number;
  seed: number;
  rng: number;
  difficulty: 'normal' | 'advanced' | 'expert';
  day: number;
  date: string;
  status: 'playing' | 'fired';
  firedReason?: string;
  market: MarketState;
  prevMarket?: MarketState;
  instruments: Record<string, Instrument>;
  issuers: Record<string, Issuer>;
  clients: Record<string, Client>;
  competitors: Record<string, Competitor>;
  desks: Record<DeskId, Desk>;
  traders: Trader[];
  rfqs: Rfq[];
  orders: WorkingOrder[];
  events: MacroEvent[];
  opportunities: Opportunity[];
  blotter: BlotterEntry[];
  history: DaySnapshot[];
  log: LogItem[];
  /** Pre-drawn idiosyncratic shocks for tomorrow (what informed clients "know"). */
  pendingIdio: Record<string, number>;
  confidence: number;
  reputation: number;
  achievements: string[];
  cumEP: number;
  firmCapital: number;
  nextId: number;
  lastReport?: DayReport;
  /** Fixed costs. */
  techSpend: number;
  riskInfra: number;
  /** Atlas market share by desk. */
  share: Record<DeskId, number>;
  /** Tomorrow's pre-drawn factor shock (event surprises are added at the close). */
  pendingShock?: import('./market').Shock;
  /** Desk values at the open, for P&L reconciliation. */
  openValue: Record<DeskId, number>;
  decisions: Decision[];
  costsToday: number;
  costsCum: number;
  /** Consecutive days without a limit breach. */
  cleanDays: number;
  stats: { rfqWon: number; rfqLost: number; rfqPassed: number; crisisWins: number; maxDrawdown: number; peakPnl: number; cumPnl: number };
  /** Best rank achieved in the league table per desk. */
  rank: Record<DeskId, number>;
  /** Intraday clock: market minutes since 07:00 (the close is CLOSE_MIN). */
  clock: number;
  /** Clock time up to which intraday market moves have been attributed to P&L. */
  markClock: number;
  /** Market at today's open; the live market is rebuilt from it and the day plan. */
  openMarket?: MarketState;
  plan?: DayPlan;
  /** News released so far today. */
  news: { minute: number; text: string; tone?: 'good' | 'bad' | 'neutral' }[];
}

export interface DayPlan {
  daySeed: number;
  /** Diffuse part of today's move (macro factors, idiosyncratic moves, scripted narrative). */
  base: import('./market').Shock;
  /** Scheduled releases: a jump at their minute (after-hours ones land at the close). */
  events: { id: string; minute: number; z: import('./market').Shock; notes: LogItem[] }[];
  headlines: string[];
}

export interface Decision {
  id: string;
  day: number;
  title: string;
  body: string;
  options: { id: string; label: string; detail: string; tone?: 'primary' | 'danger' }[];
  status: 'open' | 'done';
  outcome?: string;
  kind: string;
  data: Record<string, any>;
}

export interface BlotterEntry {
  id: number;
  day: number;
  desk: DeskId;
  instId: string;
  qty: number;
  price: number;
  mid: number;
  cpty: string; // client id or 'street' or 'flow'
  kind: 'client' | 'hedge' | 'flow' | 'unwind' | 'expiry' | 'default';
  pnl: number; // spread capture (+) or execution cost (−) vs mid
}

export interface DayReport {
  day: number;
  date: string;
  total: number;
  byDesk: Record<DeskId, number>;
  parts: PnlParts;
  notes: LogItem[];
  events: MacroEvent[];
  moves: { label: string; value: string; tone?: 'up' | 'down' }[];
  confidenceDelta: number;
  ep: number;
  breaches: string[];
}
