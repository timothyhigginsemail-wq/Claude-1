# Atlas Prime — a prime brokerage desk simulator

A mobile management game in which you run the prime brokerage desk of a large bank. You start with
$100m of allocated capital, a $250m committed treasury facility, the bank's custody/settlement
plumbing, a small securities-lending network, and no hedge fund clients. You win mandates, set
margin and pricing, source stock borrow, fund the balance sheet and survive a market crisis. You are
scored on risk-adjusted economic profit, liquidity resilience, client relationships and controls —
not on revenue or leverage.

Built with Expo SDK 57 / React Native 0.86 / TypeScript. No backend, no API keys; all data is
fictional and saved locally on the device.

## Run it on your iPhone (Expo Go)

1. Install **Expo Go** from the App Store (it must support **SDK 57** — the current App Store build does).
2. On your computer (Node 20+):
   ```bash
   cd prime-desk
   npm install
   npx expo start
   ```
3. Scan the QR code with the iPhone Camera app; it opens in Expo Go.
   - Phone and computer must be on the same Wi-Fi. If they aren't (or your network blocks it), use
     `npx expo start --tunnel`.
4. Saves persist on the phone automatically (AsyncStorage). "Start a new game" is under the `…` menu on the Desk.

Everything the app uses ships inside Expo Go (react-native-svg, AsyncStorage, safe-area-context,
expo-haptics, vector icons), so no development build is needed. For a standalone install use
`npx eas-cli build --profile development --platform ios` (requires an Apple developer account).

Other ways to run:
- Browser preview: `npx expo start --web`
- Tests: `npm test` · Typecheck: `npm run typecheck` · Strategy balance report: `npm run balance`

## How to play

- **Desk** — your trading day. Events arrive with a time stamp (mandates, financing requests, locate
  requests, recalls, treasury calls, squeezes, margin calls, defaults, give-ups, competitor
  approaches, management reviews). Open one to see the facts, the cash & securities flow, an optional
  risk-analyst deep dive (limited per day), and a **what-if preview** of each option against your
  desk model. Then **Close the day**: the market moves, funds trade, borrows reprice, interest
  accrues, funding is rebalanced and margin is checked. Unanswered events take a default action.
- **Clients** — economic profit by client, then each client's account (equity, margin, rehypothecation
  capacity), book (with internal/external sourcing of every short), P&L build-up, **terms** (renegotiate
  spread, margin multiplier, maintenance, concentration threshold, leverage cap, credit limit,
  rehypothecation cap, lock-up, borrow fees — margin lock-ups are enforced), and risk (stress
  scenarios, control vs legal claims).
- **Book** — client longs/shorts by security, internalisation rate and its annual value, lender contracts.
- **Funding** — desk balance sheet (uses vs sources), customer reserve formula, repo capacity and
  haircuts, treasury facility, liquidity coverage, and funding policy (buffer, repo usage, funding
  order, term repo).
- **Risk** — margin status, counterparty exposure, desk-wide stress scenarios, crowding, liquidity and
  the desk-wide house margin parameters.
- **P&L** — cumulative and daily P&L by line, client contributions, franchise score, the full
  double-entry **ledger** and your decision history.

Almost every number can be tapped to show how it was calculated (balances × rates × accrual days, the
margin build-up, the reserve formula, capital, economic profit…). The `…` menu has a field guide to
every mechanism. The opening campaign runs 30 trading days (new desk → growth → funding squeeze →
short squeeze → a concentrated-fund crisis); the game continues procedurally afterwards.

## Architecture

```
src/engine/   pure TypeScript financial engine (no React)
  ledger.ts      double-entry ledger, desk balance sheet
  accounts.ts    trade settlement, deposits, marking shorts & futures VM
  margin.ts      house (risk-based) and Reg T-style margin
  lending.ts     borrow fees, lenders, rehypothecation/internalisation allocator, borrow contracts
  funding.ts     reserve formula, funding waterfall, ACT/360 accruals, FTP attribution, liquidity
  risk.ts        stress scenarios, exposure, PD/EL, capital, economic profit
  behavior.ts    hedge-fund behaviour: trading within limits, NAV/liquidity, wallet share, liquidation
  market.ts      regime-switching market, money markets, securities-lending supply/demand
  analytics.ts   desk summaries and "tap a number" explanation trees
src/game/     gameplay: fund roster, events & resolution, 30-day scenario, day cycle, scoring, education
src/ui/       React Native screens and components
tests/        vitest: accounting identities, mechanics, long-run invariants, determinism
```

The simulation is deterministic: a seeded RNG lives in the save, so a seed plus the same decisions
replays identically (tested).

### Ledger conventions
Desk perspective, debit-positive: assets > 0, liabilities/equity/income < 0. Every journal entry must
sum to zero (unbalanced entries throw). Customer securities (client longs in custody, shares
borrowed) are **memo records, not desk assets**; only cash claims are on the balance sheet:

| Assets | Liabilities & equity |
|---|---|
| Cash / HQLA buffer | Client free credit balances |
| Special reserve bank account | Client short-sale proceeds (restricted) |
| Margin loans (client debit balances) | Overnight & term repo |
| Cash collateral posted to stock lenders (102%) | Treasury facility / emergency funding |
| Futures initial margin at the CCP | Desk equity (allocated capital + retained P&L) |

Tests assert, every simulated day across seeds: trial balance = 0, A = L + E, lender collateral =
102% × MV of open borrows, reserve account = reserve-formula requirement, short-account credits =
short MV, no security is pledged twice (shorts vs repo) and the 140% cap holds, and client
attribution + central residual + overhead = desk P&L.

## Financial model — what is modelled and what is approximated

Modelled mechanically:
- Margin loans: buying $200m with $80m equity creates a $120m debit balance funded by the desk.
- Shorts: proceeds credited to a restricted short account, marked to market daily; external borrows
  collateralised with cash at 102%; lender rebate = SOFR − lender fee; client rebate = SOFR − client
  fee (negative for hard-to-borrow names).
- Internalisation: other clients' **margin** securities are re-used up to each client's
  rehypothecation cap (≤ 140% of its debit); fully-paid and excess margin securities are segregated.
  Internalised proceeds fund other customers' debits — subject to the reserve formula.
- Customer reserve (SEC Rule 15c3-3 style): credits − 97% × debits locked in a reserve account, so
  customer cash never funds the firm. *Approximation:* computed daily with a handful of line items.
- Funding waterfall: reserve → repo against rehypothecated collateral (haircuts by class, counterparty
  appetite) → committed treasury facility (FTP, commitment fee) → emergency funding.
- Margin: Atlas house model (systematic + idiosyncratic shocks, gross floor, concentration, liquidity
  and squeeze add-ons, futures IM) and a Reg T / FINRA 4210-style comparison. *Approximation:* not
  TIMS/OCC portfolio margin; Reg T/4210 exceptions are omitted.
- Credit: stress scenarios produce the shortfall Atlas would bear after liquidation costs; defaults
  liquidate with market impact (which also moves prices for other holders); deficits become an
  unsecured claim on the fund's estate with delayed, partial recovery. Other prime brokers call the
  same fund simultaneously in stress.
- Capital: max(counterparty-credit capital, leverage capital). *Approximation:* illustrative
  Basel-style ratios, not a regulatory calculation.
- Profitability: funds-transfer pricing on each client's net funding use, internal transfer price for
  internalised borrow, repo-collateral credit, variable servicing cost; the remainder is a central
  funding residual and unallocated overhead.

Simplifications (labelled in the app where relevant): same-day settlement; interest posted daily
rather than monthly; holidays ignored; futures customer funds are treated within the reserve
computation although they are really segregated under CEA rules; the fund roster's "thousands of
positions" are represented by a basket of ~25 names; all rates, prices and institutions are fictional.

Not yet modelled: synthetic prime (total return swaps) and multi-jurisdiction booking — Phase 5 is
currently the open-ended continuation with procedurally generated funds and events.

## Verification status
- `npm test` — 27 passing tests (accounting identities, mechanics, invariants over 40-day runs,
  determinism, save size, a lax desk losing money); the strategy balance report is skipped by default
  (`npm run balance`).
- The web build was driven in headless Chromium at iPhone 390×844 through 26 trading days (all tabs,
  drill-downs, decisions, the crisis) with no console errors.
- The iOS (Hermes) bundle compiles via `expo export --platform ios`.
- **Not yet run on a physical iPhone or the iOS Simulator** — please report anything that looks off.
