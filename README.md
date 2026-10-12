# Quant Research Lab

An interactive, research-grade platform for taking an equity trading hypothesis through
the full lifecycle a systematic fund would use: **idea → data → signal → predictive
tests → factor adjustment → portfolio → costs & capacity → evaluation → decision**.
Every stage has working calculations on real historical data, a short intuitive
explanation, optional technical detail (formulas, assumptions), a list of pitfalls, and
a description of how a professional research organisation would handle it.

The first hypothesis under investigation:

> *Unusually high trading volume, relative to a stock's own recent history, contains
> information that predicts its subsequent five-day return.*

## Quick start

```bash
pip install -r requirements-dev.txt
streamlit run app/streamlit_app.py          # the web app
python -m pytest -m "not slow"              # unit tests (~5 s)
python -m pytest                            # + render every app page (~1 min)
python scripts/run_experiment.py --help     # run & log an experiment from the CLI
python scripts/build_data.py                # rebuild data/processed from pinned sources
python scripts/precompute_library.py        # refresh the leaderboard cache after signal changes
```

## Project structure

```
quantlab/                 research library (plain numpy/pandas, no black boxes)
  data/        sources.py   pinned raw sources (URL + SHA-256)
               build.py     cleaning rules, point-in-time membership, quality report
               loader.py    wide (date × ticker) matrices, eligible universe
  signals/     library.py   hypothesis registry: H1 abnormal volume, H2 volume-amplified
                            reversal, B1 reversal benchmark, H3 volume trend, P0 placebo
  research/    returns.py   forward returns with explicit execution timing
               stats.py     Newey-West, rank IC, block bootstrap, PSR/DSR, Holm, BH
               analysis.py  IC by horizon, quantiles, decay, double sorts, regimes, purging
               factors.py   point-in-time controls, Fama-MacBeth, neutralisation
               robustness.py parameter grid, placebo nulls, walk-forward, factor regression
               pipeline.py  one spec → all evidence (shared by app and CLI)
               decision.py  pre-registered decision rules → verdict
  portfolio/   construct.py long/short weights, caps, sector/beta neutrality, tranches
               backtest.py  drift-aware turnover, spread + √-impact costs, borrow, capacity
  content/     org.py       roles and stage-by-stage review process
app/                      Streamlit UI (streamlit_app.py + views/)
data/processed/           cleaned panel (committed so the app is reproducible offline)
data/reference/           hand-curated corrections (corporate actions, sector labels)
experiments/              registry.csv (every run = one trial) + runs/*.json
tests/                    time alignment, look-ahead, backtest mechanics, statistics, app
```

## Data: provenance and limitations

| Source | Content | Key limitation |
|---|---|---|
| Kaggle "S&P 500 stock data" (C. Nugent), via Plotly's public datasets repo | Daily OHLCV, 505 tickers, 2013-02-08 → 2018-02-07, split-adjusted | **Survivorship bias** (only 2018 members), price returns only, no spreads/earnings dates/shares outstanding |
| fja05680/sp500 (seeded from A. Clenow's *Trading Evolved*) | Point-in-time S&P 500 membership since 1996 | Community-maintained |
| datahub.io S&P 500 constituents | GICS sectors | Current, not point-in-time; 138 departed names hand-labelled |

Measured issues and fixes (all logged in `data/processed/quality_report.json`):
8 bad prints removed (closes outside the day's range, spike-and-reverse rows),
5 unadjusted spin-offs/share dividends invalidated (eBay/PayPal, NiSource/Columbia
Pipeline, Baxter/Baxalta, Discovery Class C), and **102 of 497** February-2013 index
members missing from the data entirely (survivorship). Stocks are only eligible on
dates they were actually in the index.

The sandbox used to build v1 could not reach Yahoo Finance, Stooq or the Kenneth French
data library, so v1 uses this GitHub-hosted dataset and builds price-based factors
itself. Conclusions are therefore capped at *"worth testing on institutional data"*.

## Methodology (where each pitfall is handled)

- **Look-ahead / leakage** — signals use data to the close of *t*; default execution at the
  *t+1* open; tests perturb all data after *t* and assert signals, controls, universe and
  regimes at *t* are unchanged.
- **Survivorship / corporate actions / point-in-time** — see Data above.
- **In-sample vs out-of-sample** — research sample 2013–2016; 2017–2018 holdout locked in
  the app, *purged* so no forward-return window crosses into it.
- **Walk-forward** — quarterly re-selection over a 24-configuration grid, expanding and purged.
- **Multiple testing** — trial counter (app session + `experiments/registry.csv`), Holm,
  Benjamini-Hochberg, 200-signal placebo null, deflated Sharpe ratio.
- **Factor exposure** — Fama-MacBeth with progressive controls (beta, size proxy,
  1d/5d reversal, momentum, volatility, sector); neutralised signals; time-series
  regression on factor portfolios with return attribution.
- **Overlapping holdings** — Jegadeesh-Titman tranches; Newey-West with lag ≥ h−1; block bootstrap.
- **Costs, turnover, capacity** — half-spread + square-root impact on 20-day ADV and
  volatility, borrow fees, break-even cost, capacity curve.
- **Statistical vs economic significance** — separate criteria in the decision scorecard.

## Version 1 findings (research sample 2013–2016, next-open execution, $100m, 3 bps + √-impact)

| Run | 5d/10d/20d IC | NW t | Net Sharpe | Verdict |
|---|---|---|---|---|
| **H1 pre-registered**: 1-day abnormal volume → 5d return | −0.003 | −0.93 | −3.4 | **Reject** |
| H2 volume-amplified reversal (−return × AV), 5d | +0.002 | +0.54 | −3.9 | Reject |
| B1 plain 5-day reversal (benchmark), 5d | +0.005 | +0.59 | −1.2 | Reject |
| H1 at 20d | −0.010 | −2.42 | −2.3 | Revise |
| *Post-hoc*: weekly (5-day) abnormal volume, 10d, **sign flipped** | +0.016 | +2.92 | −0.6 | Revise |
| *Post-hoc*, same, factor-neutralised | +0.007 | +1.91 | −1.5 | Reject |
| Placebo (noise) | −0.001 | −0.58 | −8.2 | Reject |

What this means:

1. **The hypothesis as stated is rejected.** There is no detectable relationship between a
   1-day volume shock and the next 5-day return in these large caps.
2. **The interesting pattern is the opposite of the "high-volume return premium".** Stocks
   with a *week* of abnormally high volume tended to **underperform** over the next
   10–20 days (t ≈ −2.9). It was found by searching a 24-cell grid, though, and it
   does not hold up: Holm-adjusted p ≈ 0.08, walk-forward out-of-sample t ≈ 1.0,
   and the t-stat falls to ≈ 1.5 once sector effects are controlled. After costs it
   loses money (break-even ≈ 3.7 bps vs ≈ 6 bps modelled). That makes it a candidate
   for a *new, pre-registered* hypothesis on better data, not a finding.
3. Even the textbook short-term reversal effect is not significant in 2013–16 S&P 500 names,
   consistent with reports that it has weakened in large, liquid stocks.
4. The placebo behaves as it should (|t| > 2 in ≈ 5–6% of noise signals), so the
   standard errors are calibrated.

The 2017–18 holdout has **not** been opened.

## Version 2: build and test your own signals

- **🧪 Signal lab.** Write a hypothesis card first: statement, mechanism, predicted
  direction, primary horizon and rejection rule. Build the signal by point-and-click, by
  formula, or from the library, then **lock** the card. Results appear only after locking:
  the verdict on the pre-registered test, all horizons, quantiles, the most similar known
  signals, and the *incremental* IC after removing standard factors and the three most
  similar library signals. One tap sends the idea through all nine stages. Export and
  import of cards as JSON, because the free host forgets files on restart.
- **Formula language** (`quantlab/signals/formula.py`), e.g.
  `-ret(5) * zscore(log(volume / mean(volume, 20)))`. It is parsed with an allow-list, never
  `eval`'d. Every function looks backward only, windows are literal integers from 1 to 252,
  and each locked formula also gets an automatic perturbation look-ahead check.
- **Signal library: 22 published price/volume signals** in momentum, reversal, risk,
  liquidity, intraday and volume families, each with its source paper and mechanism.
- **🏆 Signal leaderboard.** Every library signal and every locked hypothesis, with raw and
  Holm/BH-adjusted p-values across all signal × horizon tests, adjusted ★s, and a
  White (2000) **reality check** on the best of them. First result on 2013–16 data:
  the best |t| at 5 days is 1.4, while the luckiest of 22 noise signals would reach
  about 3.1 (p ≈ 0.88). No signal survives the adjustment.
- **Explanations everywhere.** ⓘ chips open a definition with four parts: what it is,
  how to read it, a rule of thumb, and the usual trap. Every headline number has a ?
  tooltip from the same glossary (`quantlab/content/glossary.py`), and each key result
  gets a 💬 plain-English reading generated from the actual numbers
  (`quantlab/content/interpret.py`). You can turn the readings off in the sidebar.
- **Speed:** library IC series are precomputed (`scripts/precompute_library.py`) for the
  default universe and timing.

## Putting it on your iPhone (Streamlit Community Cloud, free)

1. Go to <https://share.streamlit.io> and sign in with the GitHub account that owns this repo.
2. **Create app → Deploy a public app from GitHub** (the name is historical; apps from
   private repos stay private). Choose repository `timothyhigginsemail-wq/Claude-1`,
   branch `claude/quant-equity-research-platform-bdmp17` (or `main` after merging),
   main file `app/streamlit_app.py`.
3. Under **Advanced settings** pick Python **3.12** or newer (pandas 3 needs ≥ 3.11). No secrets are needed.
4. Deploy (first build ≈ 3–5 min). Open the URL in Safari → Share → *Add to Home Screen*.
5. **Restrict access:** app *Settings → Sharing* → make it private and invite only your
   email. If the repo is public, the code is public but the app can still be private.

Nothing in the app needs credentials; never put API keys in the repo — use Streamlit's
*Secrets* setting if a paid data source is added later.

## Roadmap

1. Better data: survivorship-free daily data with delisting returns, earnings dates, and
   Kenneth French factors (needs network access or a data subscription).
2. Earnings-announcement control — the most likely confound for any volume signal.
3. Mechanism-driven revisions of the hypothesis (e.g. volume as a *conditioning variable*
   for short-term reversal), each pre-registered before testing.
4. Risk-model-based optimiser for portfolio construction.
5. User-defined hypotheses from the app, intraday/weekly/monthly horizons.
