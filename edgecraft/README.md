# Edgecraft: The Portfolio Lab

A browser game about the judgement of a quantitative portfolio manager. You decide which trades to take, how big to make them, how much leverage to use and how to combine them. Then you live with the outcomes and find out whether your decisions were good or just lucky.

## Quick start

```bash
cd edgecraft
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (maths, market model, allocator engine)
npm run build      # typecheck + production build in dist/
npm run preview    # serve the production build
```

Requires Node 18+ (tested on Node 22). Campaigns autosave to `localStorage` after every turn. **Save** downloads a JSON save file and **Load save file…** on the home screen restores it.

## How it plays

You are the CIO of a $1bn multi-manager platform. The game is about one craft: **sizing PMs by conviction and risk**.

- **The allocation meeting.** Every round you see your PMs and new PMs pitching. Each shows:
  - a 2-year track record, plus results since the pitch;
  - a *shrunk* skill estimate (annual Sharpe, with a 90% range) that pulls the record toward what a typical pitching PM delivers, because you only meet managers whose records look good;
  - volatility, max drawdown, correlation to your platform, capacity, and a fat-tail warning for styles that win small and lose big.
- **Your decisions.**
  - Give each PM a **risk budget** (their annual volatility as % of NAV). Capital = budget ÷ the PM's estimated vol.
  - Set each PM's **stop** (drawdown from their book's peak). The row shows how likely that stop is to trigger in the next jump.
- **Run 4, 6 or 8 weeks.** PMs keep their capital until they hit their stop or you redeem them. Stopped PMs leave for good. If the platform's drawdown hits your risk-cut level, every allocation is halved and the round ends early.
- **Economics.** PMs are paid a share (default 18%) of their own profits yearly and when they leave, even when the platform as a whole lost money. Capital above a PM's capacity is diluted. Moving capital costs 5bp.
- **Feedback after every run.** Your result is split into four parts, using counterfactual books on the same market:
  - the pool at equal risk;
  - your **selection** (your PMs vs every PM);
  - your **sizing** (your budgets vs equal risk on your PMs);
  - your **stops** (your book vs the same allocations without stops).
- **Review.** At the end every PM's true skill is revealed, along with whether your risk weights lined up with it, which stopped PMs were genuinely good, and what the payouts cost.

Platform settings on the start screen: seed (same seed = same market and PMs), length, target volatility, PM payout and the platform risk-cut level.

## The simulation model (`src/engine`)

- **Randomness** (`rng.ts`): sfc32 streams keyed by `(seed, label…)`. The market path is generated from `(seed, turn)` and the instrument id, never from your decisions. Replaying a seed with a different strategy therefore faces identical regimes, factor shocks and idiosyncratic draws (tested).
- **Market** (`market.ts`): nine latent factors (equity, rates, credit, FX carry, volatility, momentum, value, liquidity/crowding, commodities) and nine hidden Markov regimes.
  - Regime correlation matrices are built as `normalise(BBᵀ + D)` from macro drivers, so they are positive semi-definite by construction. Stress regimes raise co-movement and volatility and add jumps.
  - Shocks are concentrated in regime *transitions*; persistent stress regimes mostly bring volatility and correlation, because their drift is priced in.
  - The desk observes noisy indicators and runs an HMM forward filter. Some regimes, such as structural alpha decay, can't be distinguished from normal markets.
- **Allocator** (`allocator.ts`): the platform engine.
  - Each PM's weekly return is their factor loadings on the shared market, plus idiosyncratic noise, plus true alpha. That alpha switches off and on along a hidden path (off ≈1.2%/week, back on ≈6%/week).
  - PMs pitch with survivorship-selected track records. The game draws records until one shows a Sharpe ≥ 0.7, otherwise it keeps the best of 60 draws. Records therefore flatter most PMs.
  - Estimates shrink each PM's record Sharpe toward a population prior (normal–normal, prior 0.45 ± 0.6) and report a 90% band.
  - **Sizing:** a risk budget is a fraction of NAV in annualised vol, and capital = budget ÷ the PM's estimated vol. Allocations are notional: platform cash equals NAV and earns the cash rate.
  - **Stops:** each PM is stopped from the high-water mark of their own book.
  - **Payouts:** the PM's share of profit above their high-water mark is paid yearly and when they leave. You pay winners while losers cost you in full (netting risk).
  - **Frictions:** capacity drag beyond each PM's capacity, a 5bp reallocation cost, and a platform drawdown limit that halves all risk.
  - **Counterfactual books:** "no stops", "equal risk to the same PMs" and "equal risk to every PM" run on the same path. Each round is attributed to base, selection, sizing and stops.
- **Kelly helpers** (`kelly.ts`, `math.ts`): closed-form and numeric Kelly sizing and the linear-algebra utilities.

Conventions:
- One week is one step, and rounds jump 4–8 weeks.
- Risk is annualised vol as a fraction of NAV.
- Cash earns 4% a year.

## Tests

`tests/math.test.ts`, `tests/market.test.ts` and `tests/allocator.test.ts` cover:
- Kelly identities and the portfolio optimiser.
- PSD regime correlations and simulated outcome frequencies matching analytic probabilities.
- A market path that doesn't depend on your decisions, and survivorship bias in pitched records.
- Shrinkage pulling estimates toward the prior, capital scaling with the risk budget, and stops firing at the right drawdown.
- The NAV accounting identity, payouts, and save/load (including the "no stop" setting).
