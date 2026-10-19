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

## How it plays

Edgecraft is a single free-play mode: you run a multi-strategy book with as many positions as you like.

- **Every week** a fresh set of trades arrives (stat arb, factor, trend, carry, vol, merger arb, relative value, macro, tail hedges). Seven strategy pods with track records and two index futures are always available.
- **Trade blotter**: one row per instrument with win probability (and its estimation band), EV per week, worst case and weeks left.
  - Size with chips (5/10/25/50% of NAV), − / +, or by typing. **Scale book** ×0.5 … ×2 resizes everything at once.
  - Every pending order shows its **impact on the whole book**: change in portfolio vol, change in expected growth, and the factor exposure it adds.
  - **Kelly guide** (optional) shows each trade's growth-optimal size given the rest of your book, with a one-click ½-Kelly.
  - **Details** opens the full sizing analysis.
- **Keyboard**: ↑/↓ choose a row · 1–4 set 5/10/25/50% · +/− step · 0 close · D details · Enter advances one week · Shift+Enter four weeks.
- **Multi-week advance**: 4w / 13w / 26w carry your book forward and stop early on a margin call, risk-committee de-gross or market shock. **Holding style**: fixed % of NAV (rebalanced weekly) or fixed dollars (left to drift).
- **Feedback while you play**:
  - *Skill vs luck*: cumulative expected growth of the books you chose vs. realised, with a ±1σ luck band.
  - *Same trades, other sizes*: ghost books run your exact trades at ½× and 2× your size on the same market path.
  - *Vs benchmarks*: half-Kelly, risk-parity, fixed-fraction and cash, all using the same information you had.
- **Practice drills** (start screen): Crowded trade, Picking up nickels, Optimistic desk, Trend to chop. Each scripts the hidden regime path and the opportunity mix around one lesson; timing isn't shown.
- **Rules**: gross leverage cap (default 5×, adjustable), regime-dependent margin with forced liquidation, a risk-committee de-gross at a 15% drawdown, and fund closure at 30%.
- **Finish & review** at any time (or pick a fixed length) for the investment-committee review, with the hidden true probabilities and regimes revealed. The same seed always produces the same market.

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
