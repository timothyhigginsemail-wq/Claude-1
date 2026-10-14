// Core data model for the Atlas prime brokerage simulation.
//
// Conventions
// - All money is in US dollars (not millions). Rates are decimals per annum, spreads/fees in bps.
// - Interest accrues ACT/360.
// - The ledger uses a single signed convention from the DESK's perspective: debit-positive.
//   Assets carry positive balances, liabilities/equity/income carry negative balances.
//   Every journal entry sums to zero, so the trial balance always sums to zero.
// - Customer securities (client longs held in custody, securities borrowed) are memo records,
//   not desk assets. Only cash-type claims (margin loans, credits, collateral posted) sit in the ledger.

export type SecId = string;
export type ClientId = string;
export type Difficulty = 'normal' | 'advanced' | 'expert';

export type SecKind = 'equity' | 'etf' | 'bond' | 'future';
/** Repo collateral class. A = liquid large cap/ETF, B = mid/small/HTB equity, C = distressed debt. */
export type RepoClass = 'A' | 'B' | 'C' | 'none';

export interface Security {
  id: SecId;
  ticker: string;
  name: string;
  sector: string;
  kind: SecKind;
  price: number;
  prevPrice: number;
  /** Price at game start (for charts). */
  refPrice: number;
  beta: number;
  /** Annualised idiosyncratic volatility. */
  idioVol: number;
  /** Average daily traded value, $. */
  adv: number;
  /** Units outstanding × price ≈ market cap ($). */
  marketCap: number;
  repoClass: RepoClass;
  /** Contract multiplier for futures (price × multiplier = notional per contract). */
  multiplier?: number;
  /** Street-wide lendable supply in the agent-lender market, $ at reference price (scaled with price). */
  lendableFrac: number;
  /** Normal lendable fraction; supply recovers toward it after squeezes/recalls. */
  baseLendableFrac: number;
  /** Street short interest as a fraction of market cap (demand from all borrowers, incl. other PBs). */
  streetShortFrac: number;
  /** Market borrow fee in bps (derived from utilisation each day). */
  borrowFeeBps: number;
  /** 0..1 crowding score among hedge funds (drives crowded-unwind stress). */
  crowding: number;
  /** Active squeeze intensity (0 = none). */
  squeeze: number;
  /** Recent price history (closing prices, last ~60 days). */
  hist: number[];
}

export type Regime = 'bull' | 'steady' | 'choppy' | 'stressed' | 'crisis' | 'recovery';

export interface MarketState {
  regime: Regime;
  regimeAge: number;
  /** Secured overnight financing rate (illustrative). */
  sofr: number;
  /** Additional repo spread from market conditions, bps. */
  repoStressBps: number;
  /** Persistent funding shock (bps) layered on top of regime conditions; decays slowly. */
  shockBps: number;
  /** Multiplier on repo haircuts (1 = normal). */
  haircutMult: number;
  /** Repo counterparties' appetite: fraction of normal capacity they will extend (0..1). */
  repoAppetite: number;
  /** Treasury funds-transfer-pricing spread over SOFR for unsecured drawn funding, bps. */
  ftpSpreadBps: number;
  /** Equity index level (USLC-like). */
  index: number;
  indexHist: number[];
  /** Realised daily market return of the last session. */
  lastReturn: number;
  /** Credit spread index, bps (drives distressed debt). */
  creditSpreadBps: number;
  /** Volatility index level (VIX-like). */
  vol: number;
  headlines: string[];
}

export interface Lender {
  id: string;
  name: string;
  type: string;
  /** Fraction of each security's street lendable supply that this lender controls. */
  shareOfSupply: number;
  /** Fee charged relative to market fee. */
  feeMult: number;
  /** Daily recall propensity multiplier. */
  recallPropensity: number;
  /** Lender is the bank's affiliated asset-management lending programme. */
  affiliate?: boolean;
  /** Securities this lender won't lend (e.g. policy exclusions). */
  description: string;
}

/** A securities-borrow contract between Atlas and a lender (open, cash-collateralised at 102%). */
export interface BorrowContract {
  id: string;
  secId: SecId;
  lenderId: string;
  qty: number;
  feeBps: number;
  /** Day the contract was opened. */
  openedDay: number;
}

export interface Competitor {
  id: string;
  name: string;
  archetype: string;
  /** Financing spread they typically quote to a strong credit, bps over SOFR. */
  baseSpreadBps: number;
  /** Their typical initial-margin multiplier vs a standard house model (lower = more lenient). */
  marginMult: number;
  balanceSheet: number; // 0..1 appetite/capacity
  stockAvailability: number; // 0..1
  service: number; // 0..1
  capIntro: number; // 0..1
  reliability: number; // 0..1
  reputation: number; // 0..1
  coverage: string;
  /** Financial health 0..1; can deteriorate in crises. */
  health: number;
  /** Aggression: 0..1 — willingness to undercut to win mandates. */
  aggression: number;
}

export type MarginMethod = 'house' | 'regT';

export interface ClientTerms {
  /** Spread over SOFR charged on debit (margin loan) balances. */
  financingSpreadBps: number;
  /** Spread under SOFR paid on free credit balances (floored at 0%). */
  creditSpreadBps: number;
  /** Fee charged to the client for borrowing GC (general collateral) names. */
  gcFeeBps: number;
  /** Markup on market borrow fees for warm/HTB names (0.2 = +20%). */
  htbMarkupPct: number;
  /** Multiplier applied to the house risk-based margin model. */
  imMultiplier: number;
  /** Maintenance requirement as a fraction of initial requirement. */
  maintRatio: number;
  maxGrossLeverage: number;
  /** Maximum margin loan (debit balance) Atlas will extend, $. */
  creditLimit: number;
  /** Rehypothecation cap as a fraction of the debit balance (US limit 140%). */
  rehypCapPct: number;
  method: MarginMethod;
  /** Single-name concentration threshold as a fraction of account equity. */
  concThresholdPct: number;
  /** Days of notice Atlas must give before tightening margin terms (margin lock-up). */
  lockupDays: number;
  /** Day the current terms took effect. */
  termsDay: number;
  /** Fixed client-specific borrow fees by security (bps) — a commitment that doesn't float. */
  feeOverrides: Record<SecId, number>;
  /** Negotiated per-name multiplier on the floating market fee (e.g. 1.25 = market +25%). */
  feeMarkups: Record<SecId, number>;
}

export type ClientStatus = 'prospect' | 'active' | 'exited' | 'defaulted' | 'declined';

export interface FundProfile {
  strategy: string;
  style: 'longshort' | 'multimanager' | 'activist' | 'quant' | 'macro' | 'credit';
  /** Target gross leverage the PM wants to run (GMV / equity). */
  targetGross: number;
  /** Target net exposure as a fraction of gross (−1..1). */
  netBias: number;
  /** Fraction of gross traded per day. */
  turnover: number;
  rating: 'A' | 'BBB' | 'BB' | 'B' | 'CCC';
  /** Annual probability of default in benign markets. */
  basePD: number;
  /** 0..1, how much price matters vs service/relationship. */
  priceSensitivity: number;
  /** Securities the fund trades and target weights (signed: + long, − short) in gross terms. */
  book: Record<SecId, number>;
  /** Fund's expected alpha (annual, on equity) and P&L noise. */
  alpha: number;
  /** How quickly it de-levers in stress (0..1). */
  stressDeleverage: number;
  /** Max acceptable borrow fee before it abandons a short (bps). */
  maxBorrowFeeBps: number;
}

export interface FundState {
  /** Total fund NAV across all prime brokers. */
  nav: number;
  peakNav: number;
  /** Unencumbered cash held outside prime brokers, as $ (the fund's real liquidity). */
  freeCash: number;
  /** Other prime brokers and the share of the fund's book each holds. */
  otherPBs: { competitorId: string; share: number }[];
  /** Pending investor redemptions, $ (payable on a schedule). */
  redemptionsPending: number;
  /** Fund return over the last 20 days (for redemption behaviour). */
  recentReturn: number;
  /** Slow-moving equity base the PM sizes the book from (positions are sticky, so leverage
   *  rises when equity falls — the fund does not mechanically sell into a drawdown). */
  anchorEquity: number;
}

export interface MarginCall {
  id: string;
  amount: number;
  issuedDay: number;
  dueDay: number;
  status: 'open' | 'met' | 'partial' | 'failed' | 'waived';
  paid: number;
}

/** Cumulative profitability attribution for a client ($), accounting basis. */
export interface ClientPnl {
  financing: number; // debit interest received
  creditInterest: number; // interest paid on free credits (negative)
  shortRebate: number; // rebate paid (−) or negative rebate received (+) on short proceeds
  lenderRebate: number; // rebate earned (+) / paid (−) on cash collateral at external lenders
  internalLending: number; // internal transfer: + for supplying rehyp securities, − for using them
  ftp: number; // funds-transfer-pricing charge (−) / credit (+)
  collateralCredit: number; // FTP benefit for securities pledged in repo
  clearing: number; // clearing, settlement and give-up fees
  servicing: number; // allocated servicing costs (−)
  creditLoss: number; // realised credit losses (−) and recoveries (+)
}

export interface Client {
  id: ClientId;
  name: string;
  short: string;
  color: string;
  status: ClientStatus;
  arrivalDay: number;
  pitch: string;
  profile: FundProfile;
  fund: FundState;
  terms: ClientTerms;
  /** Proposed terms the client asked for during onboarding/negotiation. */
  ask?: Partial<ClientTerms> & { initialEquity?: number };
  /** Signed positions held at Atlas (units). */
  positions: Record<SecId, number>;
  /** Fraction of the fund's prime business Atlas holds. */
  walletShare: number;
  /** Relationship quality 0..100. */
  relationship: number;
  /** Rolling satisfaction −1..1 (pricing vs market, borrow fill, treatment). */
  satisfaction: number;
  marginCall?: MarginCall;
  pnl: ClientPnl;
  /** Today's attribution (reset each day). */
  pnlToday: ClientPnl;
  /** Day-by-day equity at Atlas. */
  equityHist: number[];
  /** Short requests Atlas couldn't fill (drives dissatisfaction). */
  borrowFails: number;
  /** Count of interactions for history. */
  notes: string[];
  /** Day the client last received a competitor approach. */
  lastCompetitorDay: number;
  /** Day the client defaulted / exited. */
  closedDay?: number;
  /** Outstanding legal claim against the fund's estate after default. */
  claim?: { amount: number; expectedRecovery: number; resolveDay: number };
  /** Fraction of desired trading the client is blocked from by Atlas limits. */
  constrained: number;
  /** Balance × accrual-day accumulators (for average balances and implied rates). */
  accum: { days: number; debit: number; credit: number; sp: number };
  /** Last day the client asked for a locate in each security (request cooldown). */
  askCooldown: Record<SecId, number>;
}

export type FundingKind = 'repo' | 'termRepo' | 'treasury' | 'emergency';

export interface TermRepo {
  id: string;
  amount: number;
  spreadBps: number;
  startDay: number;
  maturityDay: number;
}

export interface DeskPolicy {
  /** Target cash liquidity buffer held in HQLA ($). */
  bufferTarget: number;
  /** Max fraction of eligible rehypothecated collateral the desk will pledge in repo (0..1). */
  repoUsage: number;
  /** Prefer repo before drawing the treasury facility. */
  repoFirst: boolean;
}

export interface DeskState {
  name: string;
  allocatedCapital: number;
  facilityLimit: number;
  policy: DeskPolicy;
  termRepos: TermRepo[];
  /** Senior management confidence 0..100; at 0 you are replaced. */
  confidence: number;
  /** Regulatory/compliance standing 0..100. */
  compliance: number;
  /** Fixed desk operating cost per year ($). */
  opexPerYear: number;
  /** Analyst capacity (risk deep-dives) per day. */
  analystCapacity: number;
  analystUsed: number;
  /** Desk-wide house parameters. */
  houseMarketShock: number;
  /** Desk-wide concentration add-on rate. */
  concAddonRate: number;
  /** Extra house margin on shorts in specific names (fraction of short MV). */
  nameAddons: Record<SecId, number>;
  /** Most recent capital review outcome. */
  lastReviewDay: number;
  /** Emergency funding days this game. */
  emergencyDays: number;
  /** Reserve-formula breaches / segregation issues. */
  breaches: number;
  /** Days spent over allocated capital. */
  capitalBreachDays: number;
}

export interface JournalPosting {
  account: string;
  amount: number; // signed, debit-positive
}

export interface JournalEntry {
  id: number;
  day: number;
  kind: string;
  memo: string;
  clientId?: ClientId;
  postings: JournalPosting[];
}

export interface Ledger {
  balances: Record<string, number>;
  journal: JournalEntry[];
  seq: number;
}

/** Output of the daily rehypothecation / internalisation allocation. */
export interface AllocationSnapshot {
  /** Per client per security: units rehypothecated and used to cover internal shorts. */
  rehypForShorts: Record<ClientId, Record<SecId, number>>;
  /** Per client per security: units rehypothecated and pledged as repo collateral. */
  rehypForRepo: Record<ClientId, Record<SecId, number>>;
  /** Per client: rehypothecation cap in $ (rehypCapPct × debit). */
  rehypCap: Record<ClientId, number>;
  /** Per security: total client short demand (units). */
  shortDemand: Record<SecId, number>;
  /** Per security: units covered internally (rehyp). */
  internalCover: Record<SecId, number>;
  /** Per security: units covered by external/affiliate borrow contracts. */
  externalCover: Record<SecId, number>;
  /** Per security: shortfall (units) that could not be sourced — fails. */
  shortfall: Record<SecId, number>;
  /** Repo capacity by class ($ cash obtainable). */
  repoCapacity: number;
  /** $ value of collateral pledged in repo. */
  repoCollateralValue: number;
}

export interface DailySnapshot {
  day: number;
  date: string;
  pnl: number;
  revenue: number;
  netIncome: number;
  economicProfit: number;
  equity: number;
  capitalUsed: number;
  grossClientMV: number;
  debits: number;
  credits: number;
  shortProceeds: number;
  extCollateral: number;
  reserve: number;
  cash: number;
  repo: number;
  treasury: number;
  emergency: number;
  internalisation: number; // fraction of short demand covered internally
  stressExposure: number;
  confidence: number;
  index: number;
  regime: Regime;
  sofr: number;
  lcr: number;
  score: number;
}

export interface OptionPreview {
  label: string;
  value: string;
}

export interface EventOption {
  id: string;
  label: string;
  detail: string;
  /** Whether choosing this option requires analyst capacity. */
  usesAnalyst?: boolean;
  /** Optional numeric parameter the player can adjust (e.g. spread). */
  param?: { key: string; label: string; min: number; max: number; step: number; value: number; unit: 'bps' | '$' | 'x' | '%' };
  tone?: 'primary' | 'neutral' | 'danger';
}

export type EventKind =
  | 'onboarding'
  | 'financingRequest'
  | 'borrowRequest'
  | 'fundingShock'
  | 'squeezeAlert'
  | 'marginCall'
  | 'marginDefault'
  | 'recall'
  | 'borrowReprice'
  | 'competitorOffer'
  | 'giveUp'
  | 'redemption'
  | 'managementReview'
  | 'termFunding'
  | 'crowding'
  | 'counterpartyNews'
  | 'withdrawal'
  | 'info';

export interface GameEvent {
  id: string;
  day: number;
  time: string; // "09:12"
  kind: EventKind;
  title: string;
  clientId?: ClientId;
  secId?: SecId;
  /** Narrative body. */
  body: string;
  /** Structured facts shown as a grid. */
  facts: { label: string; value: string; tone?: 'up' | 'down' | 'warn' }[];
  options: EventOption[];
  /** Arbitrary payload for the resolver. */
  data: Record<string, any>;
  status: 'pending' | 'resolved' | 'expired';
  resolution?: string;
  chosen?: string;
  /** Analysis unlocked by the risk team. */
  analysis?: string[];
  urgent?: boolean;
  /** Education topic key. */
  learn?: string;
}

export interface ScheduledEffect {
  day: number;
  kind: string;
  clientId?: ClientId;
  secId?: SecId;
  data: Record<string, any>;
}

export interface LogItem {
  day: number;
  text: string;
  tone?: 'good' | 'bad' | 'neutral';
}

export interface DeskPnl {
  financing: number;
  creditInterest: number;
  shortRebate: number;
  lenderRebate: number;
  repoInterest: number;
  treasuryInterest: number;
  commitmentFee: number;
  emergencyInterest: number;
  bufferIncome: number;
  reserveIncome: number;
  ccpIncome: number;
  clearing: number;
  opex: number;
  creditLoss: number;
}

export interface GameState {
  version: number;
  seed: number;
  rng: number;
  difficulty: Difficulty;
  day: number;
  date: string;
  phase: number;
  status: 'playing' | 'fired';
  firedReason?: string;
  market: MarketState;
  securities: Record<SecId, Security>;
  lenders: Record<string, Lender>;
  competitors: Record<string, Competitor>;
  clients: Record<ClientId, Client>;
  ledger: Ledger;
  borrows: BorrowContract[];
  desk: DeskState;
  alloc: AllocationSnapshot;
  events: GameEvent[];
  scheduled: ScheduledEffect[];
  history: DailySnapshot[];
  log: LogItem[];
  pnlToday: DeskPnl;
  pnlCum: DeskPnl;
  /** Accrual days used for today's interest (for explanations). */
  lastAccrualDays: number;
  /** Learned topics (education layer "first encounter"). */
  seenTopics: string[];
  nextId: number;
  /** pnl:* ledger balances at the start of the day (desk P&L = change). */
  dayStartPnl: Record<string, number>;
  /** Unattributed P&L: central funding residual and unallocated overhead. */
  centralToday: { residual: number; overhead: number };
  centralCum: { residual: number; overhead: number };
  accrualDaysCum: number;
  /** Signals gathered at end of day that drive next morning's events. */
  signals: Signals;
  lastReport?: DayReport;
  /** Lender restrictions by security chosen by the desk (e.g. stable lenders only). */
  lenderPrefs: Record<SecId, string[]>;
  /** Cumulative economic profit (net income − cost of capital). */
  cumEP: number;
  /** Rolling achievements / milestones. */
  milestones: string[];
}

export interface Signals {
  htbWants: { clientId: ClientId; secId: SecId; qty: number }[];
  newMarginCalls: ClientId[];
  failedCalls: ClientId[];
  recalls: { contractId: string; secId: SecId; lenderId: string; qty: number }[];
  reprices: { secId: SecId; from: number; to: number }[];
  buyIns: { clientId: ClientId; secId: SecId; qty: number }[];
  regimeChanged?: Regime;
  liquidations: { clientId: ClientId; loss: number }[];
}

export interface DayReport {
  day: number;
  date: string;
  netIncome: number;
  revenue: number;
  pnl: DeskPnl;
  marketReturn: number;
  regime: Regime;
  headlines: string[];
  notes: LogItem[];
  economicProfit: number;
  confidenceDelta: number;
}
