# Atlas Markets

A mobile-first simulator of an investment bank's Global Markets trading floor. You are Head of Global Markets at Atlas Bank: quote client RFQs against competing dealers, hedge the risk you take on, stay inside your limits, allocate capital across desks, and earn more than the 12% cost of the capital you use.

Built with Expo / React Native / TypeScript. It runs in a phone browser, in Expo Go, or as a native build. Everything is a deterministic, seeded simulation, and every major number can be tapped to see how it is calculated.

## Play

```bash
cd atlas-markets
npm install
npm run web          # dev server → open the printed URL on your phone (same Wi-Fi)
npm start            # Expo Go on iPhone: scan the QR code
npm run web:export   # static build in dist/ (serve with any static web server)
```

Progress saves automatically on the device (browser local storage / AsyncStorage).

## The game

**Desks.** Equities, Rates and FX are live on day 1, with $800m of capital. Credit (day 6), Commodities (day 13) and Cross-Asset & Exotics (day 17) launch through board decisions. You choose how much capital to commit, or defer.

**Daily loop.**
1. **Desk:** morning briefing. Covers the regime, yesterday's moves, today's data calendar and management decisions.
2. **Trading:** client RFQs. Each one shows the client's type and history, the hedge cost at that size, a residual-risk charge, any axe against existing inventory, and an estimated win probability against the other dealers. Win, then hedge with suggested trades. The street ticket lets you put on or hedge any listed instrument directly.
3. **Book / Risk:** positions, sensitivities, VaR/ES, stress tests, limits, capital and counterparty exposure.
4. **Close the day.** Electronic flow, working orders, the market move (factor shocks plus event surprises), carry, funding, coupons, expiries and defaults are all booked. The Day Report attributes P&L factor by factor.

**Tabs:** Desk · Markets · Clients · Trading · Book · Risk · P&L.

**Clients** have different information and price sensitivity. Hedge funds, quants and electronic market makers trade on information correlated with the next day's move; pensions, insurers and corporates trade to hedge. Relationships rise when you quote reliably, especially in stress, and fall when you ignore them. **Competitors** (six dealers) quote around the full-cost spread, scaled by their aggressiveness and by risk appetite, which shrinks in stress.

**Limits have consequences.** A breach at the close is a warning. Two consecutive breaches and risk management cuts the desk's positions by half and blocks new client risk for three days.

**Management confidence** tracks your rolling economic profit against target, breaches and big losses. You are replaced at 0, or if losses exceed 25% of firm capital.

**Campaign.** The 30-day campaign is scripted around:
- a pension's $500m 10Y receive (day 3);
- a hedge fund's $150m block (day 5);
- desk launches;
- a surprise FOMC hike (day 12);
- an oil shock (day 15);
- the first structured-note issue (day 18);
- a crisis arc on days 21–25, with an issuer default and a hedge-fund counterparty default;
- an emergency cut, then recovery.

After day 30, career mode continues with randomly evolving regimes.

Difficulty: Normal / Advanced / Expert.

## Engine (src/engine)

| Area | Model |
|---|---|
| Market | Five macro factors (growth, inflation, risk-off, USD, oil) plus idiosyncratic shocks. Regimes (calm → crisis) scale volatility, spreads, liquidity and dealer appetite. UST zero curve plus swap spreads give the SOFR curve; flat short rates for other currencies. |
| Pricing | Black / Black-Scholes / Garman-Kohlhagen / Black-76 options with a sticky-moneyness skew. Fixed-coupon bonds (clean = dirty − accrued); single-curve OIS swaps; SOFR and bond futures; CDS with a flat hazard rate (spread / (1−R)); commodity forwards F = S·e^{carry·T}·seasonality; variance swaps (realised + implied); Monte-Carlo autocallables (fixed seeds, 1,500 paths). |
| Accounting | Multi-currency desk cash plus positions. Futures settle variation margin daily. Desk value = cash + Σ PV. P&L components: spread capture, flow, execution, time, rates, FX, equity, vol, credit, commodities, funding, accruals, fees, defaults. They reconcile to the change in desk value (tested). |
| Risk | Greeks by bump-and-revalue. Key-rate DV01, CS01, FX net open position, commodity delta. 1-day 99% VaR and 97.5% ES from 300 fixed-seed scenarios with full revaluation (autocallables use a delta-gamma-vega approximation). Six stress scenarios. |
| Capital | 3·√10·VaR + 25% of the worst stress loss + counterparty (8% × EAD) + 3% of cash inventory. Economic profit = P&L − costs − 12% × max(allocated, used) per day. |

## Simplifications (deliberate)

- **Rates:**
  - Single-curve OIS discounting; no separate projection curves or basis between them.
  - Non-USD curves are flat.
  - Bond futures are priced off a notional bond; there is no cheapest-to-deliver option.
  - Swaptions are not modelled; rates vol appears only through stress.
- **Credit:** flat hazard rates; recovery is fixed per issuer.
- **Equities:** dividends are a continuous yield.
- **Exotics:**
  - Variance swaps ignore the convexity of realised-variance sampling.
  - Autocallables use a single-asset lognormal model with skew-adjusted vol, not local or stochastic vol.
- **Execution:**
  - Market impact follows a square-root law: temporary impact is paid as cost, plus permanent impact in less liquid products.
  - Competitor quotes are statistical, not agent-based.
- **Regulation:** capital is an illustrative Basel-style formula, not FRTB.
- **Calendar:** weekends are skipped, but carry, funding and the capital charge still accrue over them.

## Tests

```bash
npm test          # pricing, accounting reconciliation, greeks, attribution, VaR/stress, determinism, full campaign
npm run sim       # day-by-day campaign report with an autoplayer that quotes at the ~50% win level
npm run typecheck
```
