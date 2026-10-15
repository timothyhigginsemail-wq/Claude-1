// Contextual explanations of how institutional trading desks work, shown alongside decisions.

export interface Topic {
  title: string;
  summary: string;
  sections: { h: string; p: string }[];
}

export const TOPICS: Record<string, Topic> = {
  marketMaking: {
    title: 'Market making and the bid/ask',
    summary: 'A dealer earns the bid/ask spread for providing immediacy: the client trades now, the dealer takes the risk until it can offset it.',
    sections: [
      { h: 'Where the money comes from', p: 'Buy at the bid, sell at the offer. Captured spread is booked against the mid immediately (day-one P&L), but it is only kept if the inventory is hedged or exited without the market moving against you.' },
      { h: 'What the spread must pay for', p: 'The cost of hedging or unwinding in the street at this size (half-spread plus market impact), a charge for risk that cannot be hedged cheaply, and — over many trades — the losses to better-informed clients.' },
      { h: 'Axes', p: 'If a client wants to buy what you already need to sell, the trade reduces risk. You can quote tighter and still be better off: that is internalisation.' },
    ],
  },
  adverseSelection: {
    title: 'Adverse selection and informed flow',
    summary: 'Some clients trade because they know something. If you win their business at a tight price, you tend to be on the wrong side of the next move.',
    sections: [
      { h: 'In the game', p: 'Hedge funds, quant funds and electronic market makers are more often informed: their side is correlated with tomorrow\'s idiosyncratic move. Pensions, insurers and corporates trade for hedging reasons and are mostly uninformed.' },
      { h: 'What dealers do', p: 'Price clients differently (tiering), hedge informed flow immediately, and watch post-trade mark-outs. Electronic flow at very tight spreads attracts the most toxic flow.' },
    ],
  },
  blocks: {
    title: 'Block trades and risk transfer',
    summary: 'A client selling $150m of one stock wants certainty. The dealer buys the block at a discount and owns the risk of unwinding it.',
    sections: [
      { h: 'The trade-offs', p: 'Unwind immediately and pay large market impact; work it over days and carry idiosyncratic risk; beta-hedge with index futures and keep only the stock-specific part.' },
      { h: 'Impact', p: 'Impact grows with the square root of size relative to daily volume. Part of it is temporary (paid as cost) and part permanent (it moves the price for everything you still hold).' },
    ],
  },
  dv01: {
    title: 'Duration, DV01 and curve risk',
    summary: 'DV01 is the dollar change in value for a one basis-point rise in yields. A long bond or a receive-fixed swap has negative DV01: it loses when rates rise.',
    sections: [
      { h: 'Hedging', p: 'Futures and swaps neutralise total DV01 cheaply, but a book can be DV01-flat and still lose if the curve twists: key-rate DV01s show where along the curve the risk sits.' },
      { h: 'Swap spreads', p: 'Hedging a swap with Treasuries leaves swap-spread risk (SOFR swaps vs Treasury yields), which widens in stress when balance sheet is scarce.' },
    ],
  },
  swaps: {
    title: 'Interest-rate swaps',
    summary: 'Exchange fixed for floating (SOFR) payments. Pensions and insurers receive fixed to lengthen duration; corporates pay fixed to hedge floating-rate debt.',
    sections: [
      { h: 'Valuation', p: 'Single-curve OIS: receiver value = fixed rate × annuity − (1 − discount factor at maturity). A par swap is worth zero; dealers embed their spread in the fixed rate they offer.' },
      { h: 'Counterparty risk', p: 'Uncollateralised client swaps create credit exposure equal to the positive mark-to-market plus potential future exposure — capital the desk must hold.' },
    ],
  },
  carry: {
    title: 'Carry, roll-down and funding',
    summary: 'Holding a position earns or pays something every day even if prices don\'t move: coupons and dividends, interest on currency balances, and the cost of financing.',
    sections: [
      { h: 'Funding', p: 'Long inventory is financed: Treasuries in repo near SOFR, equities and corporate bonds at wider secured spreads, the rest at the bank\'s unsecured transfer price. Shorts pay borrow fees. Derivatives need initial margin that costs the FTP spread.' },
      { h: 'Roll-down', p: 'As time passes, a bond rolls down an upward-sloping curve and gains value; options lose time value (theta).' },
    ],
  },
  fx: {
    title: 'FX spot, forwards and carry',
    summary: 'A forward is spot adjusted for the interest-rate differential (covered interest parity): high-yielding currencies trade at a forward discount.',
    sections: [
      { h: 'Market making vs directional', p: 'FX market making turns over huge volumes at fractions of a pip and offsets risk within seconds. A directional position in a currency earns (or pays) its interest-rate differential — carry — and is exposed to large moves, especially in emerging markets in risk-off.' },
      { h: 'Settlement', p: 'Spot settles in two days; forwards at their maturity. In the game, currency balances accrue interest daily at each currency\'s rate.' },
    ],
  },
  credit: {
    title: 'Credit: bonds, CDS and liquidity',
    summary: 'A corporate bond is rates risk plus credit risk. CDS isolates the credit risk; CDX indices are the liquid macro hedge.',
    sections: [
      { h: 'Liquidity', p: 'Corporate bonds trade a fraction of Treasury volumes; high-yield inventory can take days to exit and spreads gap wider in stress.' },
      { h: 'Valuation', p: 'Bonds are discounted at Treasury yields plus a spread; CDS use a survival curve with hazard rate ≈ spread / (1 − recovery). A default pays protection buyers (1 − recovery).' },
      { h: 'Basis', p: 'CDS and bond spreads differ (the basis); hedging bonds with CDS leaves basis risk.' },
    ],
  },
  commodities: {
    title: 'Futures curves, contango and backwardation',
    summary: 'Commodity futures prices depend on storage costs, financing and the convenience of holding physical supply.',
    sections: [
      { h: 'Contango', p: 'Futures above spot: plentiful supply, storage paid for by the curve. Long futures lose roll yield as they converge down to spot.' },
      { h: 'Backwardation', p: 'Futures below spot: prompt scarcity. A supply disruption inverts the front of the curve.' },
      { h: 'Hedgers', p: 'Airlines buy oil forward or buy calls; miners sell output forward or buy puts. Their flow is large and uninformed, but concentrated in the same direction.' },
    ],
  },
  options: {
    title: 'Options and the Greeks',
    summary: 'Delta is exposure to the underlying, gamma how fast delta changes, vega exposure to implied volatility, theta the daily time decay.',
    sections: [
      { h: 'Selling options', p: 'Short options collect premium (positive theta) but are short gamma and vega: delta-hedging after big moves locks in losses, and volatility spikes mark the position down.' },
      { h: 'Skew', p: 'Downside puts trade at higher implied vols than upside calls; in the game the surface uses a sticky-moneyness skew that steepens in stress.' },
    ],
  },
  exotics: {
    title: 'Autocallables and variance swaps',
    summary: 'Structured notes give investors a coupon in exchange for selling downside protection. The issuing bank earns an upfront margin and is left with long-dated, path-dependent risk.',
    sections: [
      { h: 'Autocallables', p: 'The note redeems early with coupons if the index is above its initial level on an observation date; at maturity investors lose if it has fallen below the barrier. The bank is short the note — effectively long downside volatility — and must hedge delta and vega dynamically. Priced by Monte Carlo here.' },
      { h: 'Variance swaps', p: 'Pay realised variance against a fixed strike. Value = realised variance so far plus implied variance for the remainder, minus the strike squared.' },
    ],
  },
  var: {
    title: 'VaR, Expected Shortfall and stress tests',
    summary: 'VaR is the loss not exceeded on 99% of days; Expected Shortfall is the average loss on the worst days beyond that. Stress tests ask what a specific crisis would do.',
    sections: [
      { h: 'Diversification', p: 'Firm VaR is below the sum of desk VaRs because risks offset — until a crisis correlates them. That is why stress tests matter.' },
      { h: 'In the game', p: 'Full revaluation of every position under 300 simulated one-day factor shocks drawn from the current regime (autocallables use a delta-gamma-vega approximation).' },
    ],
  },
  capital: {
    title: 'Capital and economic profit',
    summary: 'Revenue is not profit. Each desk consumes capital for market risk, counterparty risk and balance sheet; the bank charges 12% on the capital allocated.',
    sections: [
      { h: 'Economic profit', p: 'Trading P&L − costs (traders, technology, infrastructure) − 12% × capital. A desk with great revenue and huge capital usage can destroy value.' },
      { h: 'Business mix', p: 'Flow businesses are capital-light, high-volume, thin-margin. Structured derivatives book large upfront margins but tie up capital and leave long-dated hedging risk.' },
    ],
  },
  attribution: {
    title: 'P&L attribution',
    summary: 'Every day the book is revalued one market factor at a time — time, rates, FX, equity, vol, credit, commodities — so you can see exactly why you made or lost money.',
    sections: [
      { h: 'Components', p: 'Spread capture and flow (franchise revenue), execution costs (paying spreads to hedge), market moves by factor (risk P&L), carry and funding, defaults. The residual collects cross effects.' },
    ],
  },
};

export function topicsFor(kind: string): string[] {
  switch (kind) {
    case 'stock':
    case 'etf':
      return ['marketMaking', 'blocks', 'adverseSelection'];
    case 'ust':
    case 'bondFut':
    case 'sofrFut':
      return ['dv01', 'carry'];
    case 'irs':
      return ['swaps', 'dv01'];
    case 'spot':
    case 'fxFwd':
      return ['fx', 'marketMaking'];
    case 'fxOpt':
    case 'eqOpt':
    case 'cmdtyOpt':
      return ['options', 'marketMaking'];
    case 'corp':
    case 'cds':
      return ['credit', 'adverseSelection'];
    case 'cmdtyFut':
      return ['commodities'];
    case 'varSwap':
    case 'autocall':
      return ['exotics', 'options'];
    default:
      return ['marketMaking'];
  }
}
