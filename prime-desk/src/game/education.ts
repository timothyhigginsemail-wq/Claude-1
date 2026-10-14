// Educational layer: concise explanations of each mechanism, written for a financially literate
// reader. Shown on demand from events and screens, flagged "new" the first time a topic appears.

export interface Topic {
  title: string;
  summary: string;
  sections: { h: string; p: string }[];
}

export const TOPICS: Record<string, Topic> = {
  onboarding: {
    title: 'Winning a prime brokerage mandate',
    summary: 'A prime broker lends against a hedge fund’s portfolio, sources its shorts, clears its trades and holds its assets. The term sheet decides how much of that is profitable — and how much risk you are taking.',
    sections: [
      { h: 'What the fund is buying', p: 'Financing for longs (margin loans), stock to borrow for shorts, custody, clearing and settlement, reporting, and often capital introduction to investors. Large funds use 3–8 prime brokers and constantly compare them.' },
      { h: 'The levers', p: 'Financing spread over SOFR (price); the house margin multiplier, maintenance ratio, concentration threshold and leverage cap (credit risk); the credit limit (balance-sheet use); the rehypothecation cap (how many of their securities you may re-use); and margin lock-ups (a promise not to tighten terms at short notice).' },
      { h: 'Where the money comes from', p: 'Spread on debit balances over your funding cost, fees on borrowed stock over what lenders charge, the funding benefit of client credits and short proceeds you can internalise, and clearing fees.' },
      { h: 'Who bears the risk', p: 'You do, whenever the client’s losses exceed the equity in its account before you can liquidate. Lenient margin, long lock-ups and concentrated, illiquid books all increase that gap.' },
    ],
  },
  margin: {
    title: 'Margin financing and leverage',
    summary: 'When a fund buys $200m of stock with $80m of its own equity, the prime broker pays the street $200m and books a $120m margin loan (debit balance), secured by the $200m of securities it holds in custody.',
    sections: [
      { h: 'Initial vs maintenance', p: 'Initial margin is the equity required to put a position on; maintenance is the floor below which you call for more collateral. Calls restore the account to initial.' },
      { h: 'Reg T vs portfolio/house margin', p: 'US Regulation T (with FINRA 4210 maintenance) is strategy-based: roughly 50% initial for longs and shorts, 25–30% maintenance. Risk-based house or portfolio margin looks at the whole book — hedges offset — so it allows far more leverage for diversified, hedged books and much less for concentrated, illiquid ones.' },
      { h: 'What happens if prices fall', p: 'Equity falls dollar-for-dollar with the portfolio; the loan does not. Leverage rises until the account breaches maintenance and you call margin — or the gap is so large that liquidating the collateral no longer covers the loan.' },
      { h: 'How Atlas earns', p: 'Debit balance × (SOFR + financing spread), accrued ACT/360, against what it costs you to fund that loan — ideally cheap repo on the client’s own (rehypothecated) securities.' },
    ],
  },
  secLending: {
    title: 'Stock borrow, fees and rebates',
    summary: 'To short, a fund must borrow the shares. The prime broker locates them (Reg SHO), borrows them — from other clients’ margin securities or from institutional lenders — and delivers them to the buyer.',
    sections: [
      { h: 'The cash leg', p: 'Short-sale proceeds are credited to the client’s short account. When Atlas borrows externally, it posts that cash (102% of the value) to the lender as collateral. The lender pays Atlas a rebate on the cash: SOFR minus the borrow fee.' },
      { h: 'Rebates to the client', p: 'Atlas pays the client a rebate on its short proceeds: SOFR minus the fee Atlas charges. For general collateral (GC) the fee is small and the rebate positive. For hard-to-borrow names the fee can exceed SOFR — the rebate turns negative and the client pays.' },
      { h: 'The spread', p: 'On an external borrow Atlas earns the client fee minus the lender fee. On an internalised borrow it earns the whole fee and keeps the cash.' },
      { h: 'Risks', p: 'Lenders can recall shares at any time; fees reprice daily with utilisation; in a squeeze supply disappears just as client losses balloon. If Atlas cannot deliver, the short is bought in.' },
    ],
  },
  internalisation: {
    title: 'Internalisation and rehypothecation',
    summary: 'If Fund A is long Orbital on margin and Fund B wants to short it, Atlas can lend A’s shares to B. No external lender, no 102% cash collateral, and B’s short proceeds stay inside Atlas.',
    sections: [
      { h: 'What may be re-used', p: 'Only margin securities, and only up to 140% of that customer’s debit balance (Rule 15c3-3 / 15c2-1, approximated here). The rest — “excess margin securities” — and all fully-paid securities must be segregated. Funds can negotiate a lower cap.' },
      { h: 'Why it saves money', p: 'Externally, B’s proceeds go straight out as collateral. Internally, they can fund A’s debit balance, replacing repo or treasury funding — and Atlas keeps the entire borrow fee.' },
      { h: 'Why it is not free cash', p: 'Short proceeds are customer credits. Under the reserve formula, customer credits may only finance customer debits; any excess must be locked in a special reserve account. Internalisation removes the lender-collateral debit, so a client book with lots of credits can end up locking cash rather than freeing it.' },
      { h: 'Fragility', p: 'If A sells, or its debit shrinks, the rehypothecation capacity disappears and B’s short must be re-sourced externally — overnight, at whatever the market charges.' },
    ],
  },
  reserve: {
    title: 'Customer protection: the reserve formula',
    summary: 'A US broker-dealer must not use customer money to fund its own business. Each period it compares what it owes customers (credits) with what customers owe it (debits).',
    sections: [
      { h: 'Credits', p: 'Free credit balances and short-sale proceeds held for customers.' },
      { h: 'Debits', p: 'Margin loans to customers and collateral posted to borrow securities for customer shorts (reduced by 3% in the formula).' },
      { h: 'The requirement', p: 'If credits exceed debits, the difference goes into a Special Reserve Bank Account for the exclusive benefit of customers. It earns little and cannot fund the desk.' },
      { h: 'In this game', p: 'Computed daily and simplified (the real formula has many more line items and is computed weekly or daily depending on the firm).' },
    ],
  },
  funding: {
    title: 'Funding the prime brokerage balance sheet',
    summary: 'Every margin loan and every dollar of lender collateral must be funded. The cheapest money is customer money (within the reserve rules); then repo against rehypothecated collateral; then the bank’s unsecured treasury funding.',
    sections: [
      { h: 'Repo', p: 'Atlas pledges rehypothecated client securities to repo counterparties and receives cash minus a haircut. Cheap, but overnight: in stress, haircuts rise, spreads widen and lines shrink just when you need them.' },
      { h: 'Term funding', p: 'Locking term repo or treasury funding costs more every day but does not disappear in a crisis. It is insurance — you pay the premium in good times.' },
      { h: 'Treasury and FTP', p: 'The bank’s treasury lends to the desk at a funds-transfer price (SOFR + spread) and charges a fee on undrawn committed lines. Beyond the facility lies emergency funding — expensive and career-limiting.' },
      { h: 'Liquidity risk', p: 'Clients can withdraw free credits, cover shorts (removing short-proceeds funding) and draw unused margin lines all at once. Liquidity coverage measures whether your buffer survives that.' },
    ],
  },
  squeeze: {
    title: 'Short squeezes',
    summary: 'A crowded short with scarce borrow can gap violently higher. Shorts lose money, lenders recall shares, borrow fees explode and buying-in forces more buying.',
    sections: [
      { h: 'The prime broker’s exposure', p: 'Short losses are unbounded. Margin calls arrive while the price is still moving; if a fund cannot pay, Atlas must buy back the shares itself, at squeeze prices, and absorb any shortfall.' },
      { h: 'Defences', p: 'Name-specific short add-ons, intraday calls, limiting concentration in crowded HTB names and sourcing borrow from stable lenders.' },
    ],
  },
  marginCall: {
    title: 'Margin calls',
    summary: 'When equity falls below maintenance, the prime broker demands cash or securities to restore initial margin. Usually due T+1; if unpaid, the PB may liquidate.',
    sections: [
      { h: 'The judgement call', p: 'Calling hard protects Atlas but can push a fund into a fire sale (and to a competitor). Grace periods help good clients through noise — and let bad situations get worse.' },
      { h: 'Other prime brokers', p: 'In a market-wide sell-off every PB calls the same fund on the same morning. The fund pays the PBs it values most first. Your share of its liquidity depends on the relationship.' },
    ],
  },
  default: {
    title: 'Client default and recovery',
    summary: 'A fund can show a positive NAV and still default to you: what matters is the collateral you control and how fast you can turn it into cash.',
    sections: [
      { h: 'Control vs claims', p: 'Atlas has a lien over the assets in its own account and can liquidate them immediately after an event of default. Assets at other prime brokers are pledged to them. For any shortfall Atlas has only an unsecured claim against the fund’s estate, recovered months later and partially.' },
      { h: 'Liquidation costs', p: 'Selling a position worth many days of trading volume moves the price against you — and against every other fund holding the same stock. Fast liquidation is certain and expensive; slow liquidation is cheaper but leaves you holding market risk on a defaulted book.' },
    ],
  },
  recall: {
    title: 'Recalls and buy-ins',
    summary: 'Stock loans are typically open: lenders can recall at any time, for example to vote shares or because they sold them.',
    sections: [
      { h: 'Re-sourcing', p: 'Atlas must return the shares by settlement — by borrowing elsewhere (often at a higher fee), using internal supply, or buying the clients in (forcing them to cover).' },
      { h: 'Lender quality', p: 'Cheap supply from active traders and pension funds that vote proxies is recall-prone. Sovereign and long-term lenders charge more but rarely recall.' },
    ],
  },
  competition: {
    title: 'Competition between prime brokers',
    summary: 'Funds allocate balances across PBs based on financing price, margin leniency, stock availability, service, capital introduction, operational reliability and — after 2008 — the PB’s own creditworthiness.',
    sections: [
      { h: 'The trap', p: 'Matching the most aggressive competitor on margin wins mandates, and can be ruinous if that competitor is underpricing risk.' },
      { h: 'Flight to quality', p: 'When a PB gets into trouble, its clients move fast. Balance-sheet strength becomes the product.' },
    ],
  },
  giveUp: {
    title: 'Give-ups: execution vs prime brokerage',
    summary: 'A fund can execute with any executing broker and “give up” the trade to its prime broker for clearing, settlement and financing — if the PB accepts.',
    sections: [
      { h: 'Who carries what', p: 'The executing broker carries execution risk until the give-up is accepted. Once Atlas accepts, it is responsible for settling with the executing broker even if the client fails to pay. Then Atlas finances the position and bears the ongoing counterparty credit risk.' },
      { h: 'DK', p: 'A PB can decline (“don’t know”) a trade — for example if it would breach the client’s margin or credit limits.' },
    ],
  },
  redemption: {
    title: 'Investor redemptions',
    summary: 'After losses, investors redeem. The fund must raise cash: withdraw excess margin from PBs and sell positions.',
    sections: [
      { h: 'Your exposure', p: 'Releasing excess margin raises leverage in the account just as the fund weakens. Holding it back may be within your contractual rights but tells the fund (and others) that you are worried.' },
    ],
  },
  capital: {
    title: 'Capital, returns and economic profit',
    summary: 'Revenue is not the score. Each client consumes capital — either for counterparty credit risk or for balance-sheet (leverage) usage — and the bank expects a return above its cost of capital.',
    sections: [
      { h: 'Economic profit', p: 'Net revenue minus expected credit loss minus a 12% charge on allocated capital. Positive EP means the client creates value; negative means the bank would be better off without it.' },
      { h: 'Why leverage capital often binds', p: 'A well-margined loan has little credit risk but still sits on the balance sheet, so balance-sheet capital is charged regardless. That is why internalisation (which shrinks lender collateral) and pricing matter so much.' },
    ],
  },
  crowding: {
    title: 'Crowded positions',
    summary: 'When many funds own the same longs and short the same names, a de-grossing by one forces prices against all. House margin computed account by account misses this.',
    sections: [{ h: 'Desk-wide levers', p: 'Raise concentration add-ons or market-shock parameters across all clients; this protects Atlas at the cost of competitiveness.' }],
  },
};

export const EVENT_TOPIC: Record<string, string[]> = {
  onboarding: ['onboarding', 'margin'],
  financingRequest: ['margin', 'capital'],
  borrowRequest: ['secLending', 'internalisation'],
  fundingShock: ['funding', 'reserve'],
  termFunding: ['funding'],
  squeezeAlert: ['squeeze', 'secLending'],
  marginCall: ['marginCall', 'default'],
  marginDefault: ['default', 'marginCall'],
  recall: ['recall', 'secLending'],
  borrowReprice: ['secLending'],
  competitorOffer: ['competition', 'capital'],
  giveUp: ['giveUp'],
  redemption: ['redemption'],
  managementReview: ['capital'],
  counterpartyNews: ['competition'],
  crowding: ['crowding'],
};
