# Edgecraft: The Portfolio Lab

A browser game about the judgement of a quantitative portfolio manager. You decide which trades to take, how big to make them, how much leverage to use and how to combine them. Then you live with the outcomes and find out whether your decisions were good or just lucky.

## Quick start

```bash
cd edgecraft
npm install
npm run dev        # http://localhost:5173
npm test           # 42 unit tests (math, simulation, engine)
npm run build      # typecheck + production build in dist/
npm run preview    # serve the production build
```

Requires Node 18+ (tested on Node 22). Campaigns autosave to `localStorage` after every turn. **Save** downloads a JSON save file and **Load save file…** on the home screen restores it.

## What's in it

**Campaign levels.** You can play any level straight away. New players are guided through Level 1 first.

| Level | You are | Mechanics |
|---|---|---|
| 1 | Single-trade risk manager | One one-week bet at a time (starts with the 55/45 coin), estimated vs. true probabilities, Kelly sizing, compounding |
| 2 | Quantitative PM | Concurrent multi-turn trades across 9 archetypes plus index futures, shared latent factors, leverage up to 6×, margin calls, forced de-risking at a 20% drawdown, fund closure at 40%, regime shifts, and the "ten strategies, one factor" set on turn 9 |
| 3 | Multistrategy CIO | Seven pods with 78-week track records (some survivorship-selected, some short-vol with hidden tails), capacity, overlay hedges, financing crises |

Campaigns run 20, 25, 30, 40 or 50 turns, or endlessly. A **sandbox** lets you set the mechanics, the regimes and the leverage cap yourself. It also has an optional transparent mode that reveals the true probabilities; scoring is disabled when that is on.

**Each turn**
- A market briefing: the tape, observable indicators, the desk's Bayesian regime read and news.
- An opportunity list showing each trade's estimated win probability with a 95% band, EV band, payoff shape and factor loadings.
- A sizing workspace:
  - You can size in $ notional, % NAV, capital at risk or volatility.
  - Charts are linked to the size: arithmetic return vs. log growth vs. volatility drag, marginal benefit vs. marginal drag, wealth-path fans and drawdown-breach probability. Each can be shown standalone or "with current book".
  - An optional sizing guide shows full, ½ and ¼ Kelly, uncertainty-adjusted Kelly, book-aware Kelly, vol target, fixed fraction and fixed dollar.
  - You can buy research to tighten an estimate or reveal hidden loadings.
- Risk analytics:
  - Before/after stats: E[R], volatility, expected log growth, VaR/ES and diversification ratio.
  - A gauge comparing your book's size to its growth-optimal size, and risk contributions.
  - Factor exposures in $ per 1σ, against limits.
  - Correlation heatmaps under the expected regime mix and under stress regimes.
  - Six deterministic stress tests.
  - A portfolio log-optimal optimizer, compared with summing standalone Kelly sizes.
- An animated resolution showing factor shocks, position outcomes and a NAV bridge, followed by a decision review:
  - Good/bad decision × good/bad outcome.
  - Attribution to expected edge, each factor, the residual and costs.
  - Ex-ante growth-vs-scale curve next to the hindsight counterfactual, clearly labelled as hindsight.
  - Joint vs. independent losers distribution.
  - Benchmarks and lesson cards, with **Why?** buttons that open interactive explanations.

**Benchmarks.** Each turn they are re-optimised using only the desk information you had: half-Kelly growth, risk-parity at 10% vol, fixed-fraction (1% at risk per trade) and cash.

**End-of-campaign investment-committee review**
- Separate scores for decisions, sizing, selection, risk control, diversification, calibration and growth.
- A memo listing strengths, weaknesses and recurring errors.
- Hidden information revealed: P&L split into quoted EV, estimation error and luck; true vs. quoted EV per strategy or pod; true regime path vs. the desk's read.
- Replays of the same seed overlaid on each other.

**Experiment Lab.** Twelve interactive lessons with sliders, charts, exact or seeded Monte Carlo numbers, and expandable maths: the Kelly coin, fixed $ vs. fixed %, equal ± returns, arithmetic vs. geometric, mean vs. median wealth, marginal edge vs. drag, unequal payoffs, estimation uncertainty and the winner's curse, correlated bets and hidden factors, leverage and ruin, repeated bets, and Sharpe ≠ allocation.

## The simulation model (`src/engine`)

- **Randomness** (`rng.ts`): sfc32 streams keyed by `(seed, label…)`. The market path is generated from `(seed, turn)` and the instrument id, never from your decisions. Replaying a seed with a different strategy therefore faces identical regimes, factor shocks and idiosyncratic draws (tested).
- **Market** (`market.ts`): nine latent factors (equity, rates, credit, FX carry, volatility, momentum, value, liquidity/crowding, commodities) and nine hidden Markov regimes.
  - Regime correlation matrices are built as `normalise(BBᵀ + D)` from macro drivers, so they are positive semi-definite by construction. Stress regimes raise co-movement and volatility and add jumps.
  - Shocks are concentrated in regime *transitions*; persistent stress regimes mostly bring volatility and correlation, because their drift is priced in.
  - The desk observes noisy indicators and runs an HMM forward filter. Some regimes, such as structural alpha decay, can't be distinguished from normal markets.
- **Instruments** (`instruments.ts`): each trade maps a latent variable `X = drift + βᵀZ + √idio·ε` onto a discrete payoff table through fixed thresholds (a Gaussian copula).
  - Regimes change outcome probabilities *mathematically*. True probabilities are computed analytically as a mixture over (current → next) regime transitions and jumps, and simulated frequencies match them (tested).
  - The desk's quote uses an estimated drift with a persistent error. Traps are biased upward and quoted with too-narrow bands. The desk also uses estimated loadings, which can miss hidden factors, and its regime belief.
  - New trades are priced for the prevailing regime.
- **Risk** (`risk.ts`): joint Monte Carlo scenarios built only from public information, with stratified idiosyncratic draws. They feed covariance and correlation matrices, risk contributions, factor exposures, stress tests and the loser-count distributions.
- **Sizing** (`kelly.ts`, `sizing.ts`):
  - Closed-form Kelly for binary bets.
  - A bisection solver for arbitrary payoff tables.
  - A projected-gradient log-optimal portfolio optimiser with box limits, a gross-leverage limit and costs.
  - Kelly shrinkage `f*²/(f*²+Var f̂)` for estimation error.
- **Game** (`game.ts`): orders and limits, transaction costs with square-root impact, financing and leverage interest, regime-dependent margin, forced liquidation, drawdown rules, benchmarks and decision grading. Grading looks at selection and at sizing relative to the growth-optimal scale within your limits, both judged on the desk model. The ex-ante evaluation never sees future draws.

Conventions:
- One turn is one week.
- Returns are per $ of gross notional.
- Exposures stay at their dollar notional until you resize them.
- Funded legs above NAV pay cash plus the funding spread; idle cash earns the cash rate.
- Expected log growth is reported per turn and annualised as `exp(52·g) − 1`.

## Tests

`tests/math.test.ts` and `tests/simulation.test.ts` cover:
- The 10% Kelly optimum for a 55/45 even-money bet, zero bet at zero edge, and ≈ zero growth at 2× Kelly.
- `f* = p/a − q/b`, the shrinkage formula and `w = Σ⁻¹μ`.
- The portfolio optimiser recovering single-bet Kelly, and correlation shrinking total log-optimal exposure (and the naive sum of standalone Kelly sizes overstating it).
- Portfolio variance `σ²(1/N + (1−1/N)ρ)`.
- Valid (PSD) correlation matrices in every regime; factor draws reproducing the regime covariance.
- Simulated outcome frequencies matching analytic true probabilities; regimes raising the odds of carry crashes; shared factors creating correlation that rises in stress.
- The filter detecting a liquidity crisis.
- Decision-independence of the market path, the NAV accounting identity, attribution summing to P&L, research, save/load, and a full Level 3 campaign.
