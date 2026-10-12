import streamlit as st

st.title("📚 Methodology & glossary")
st.markdown("Where each classic research error is handled in this platform.")

ITEMS = [
    ("Look-ahead bias & data leakage",
     "Using information that was not available when the trade would have been made.",
     "Signals use data up to the close of t only; trades happen at the next open by "
     "default; forward returns start after execution; regimes and universes use trailing "
     "data; automated tests perturb future data and check signals do not change."),
    ("Survivorship bias",
     "Testing only on companies that survived, which excludes failures.",
     "Cannot be fixed with this dataset (only 2018 survivors). Measured on the Data page: "
     "about 100 of ~500 2013 members are missing. Point-in-time membership removes the "
     "related 'future index inclusion' bias."),
    ("Corporate actions",
     "Splits, spin-offs and special dividends change prices without changing wealth.",
     "Data are split-adjusted; unadjusted spin-offs and share dividends are listed and "
     "their returns invalidated; bad prints detected and removed."),
    ("Point-in-time data",
     "Every value must be what was known at that time, not later revisions.",
     "Prices/volumes are point-in-time; membership is point-in-time; sectors are current "
     "(disclosed as a mild violation)."),
    ("In-sample vs out-of-sample",
     "Results on data used to design the strategy are optimistic.",
     "Research sample (v3: 2005–2021; v1: 2013–2016) and a locked holdout (v3: 2022–2026; "
     "v1: 2017–2018), with purging at the boundary."),
    ("Walk-forward testing",
     "Re-estimating choices using only the past, then testing on the future.",
     "Quarterly re-selection over a 24-config grid with expanding, purged training windows."),
    ("Multiple hypothesis testing",
     "Trying many variants guarantees some look significant by luck.",
     "Session trial counter, Holm and Benjamini-Hochberg adjustments, placebo nulls, and "
     "the deflated Sharpe ratio."),
    ("Factor exposure & neutralisation",
     "Apparent alpha that is really a known risk premium.",
     "Fama-MacBeth with progressive controls, residualised signals, factor-portfolio "
     "time-series regression with attribution."),
    ("Execution timing & overlapping holdings",
     "Trading at prices you could not get; double-counting overlapping returns.",
     "Three explicit execution conventions; Jegadeesh-Titman tranches; Newey-West and "
     "block bootstrap for overlap-induced autocorrelation."),
    ("Transaction costs, turnover & capacity",
     "Paper profits that disappear when trading.",
     "Drift-aware turnover, spread + square-root impact, borrow fees, break-even cost, "
     "capacity curve."),
    ("Statistical vs economic significance",
     "A real but tiny effect can be unprofitable; a profitable backtest can be luck.",
     "Separate criteria in the decision scorecard for each."),
]
for title, what, how in ITEMS:
    with st.expander(title):
        st.markdown(f"**What it is.** {what}")
        st.markdown(f"**How this platform handles it.** {how}")

st.subheader("Glossary")
G = {
    "Rank IC": "Daily correlation between the ranking of stocks by signal and by subsequent "
               "return. 0 = no information; 0.03 is respectable for a daily equity signal.",
    "t-statistic": "Estimate divided by its standard error: how many 'noise units' away from "
                   "zero. |t|>2 ≈ 5% chance under no effect, *if* the test was the only one.",
    "Newey-West": "A standard-error formula that accounts for autocorrelation, e.g. from "
                  "overlapping multi-day returns.",
    "Sharpe ratio": "Annualised return / annualised volatility. For a dollar-neutral book no "
                    "risk-free rate is subtracted (the cash is roughly self-financing).",
    "Drawdown": "Fall from the previous peak of cumulative returns.",
    "Turnover": "Value traded per day as a fraction of capital.",
    "Basis point (bp)": "0.01%. Costs and small returns are quoted in bps.",
    "Long/short, dollar-neutral": "Equal dollars long and short, so market moves largely cancel.",
    "Beta": "Sensitivity of a stock's return to the market's return.",
    "Fama-MacBeth": "Run a regression across stocks each day; average the daily coefficients.",
    "Deflated Sharpe": "Probability the Sharpe is genuine after accounting for how many "
                       "strategies were tried.",
    "Holdout": "Data deliberately left untouched until the end, used once.",
    "Purging": "Removing observations whose outcome windows overlap the test period.",
    "Capacity": "How much capital a strategy can run before costs consume its edge.",
}
for k, v in G.items():
    st.markdown(f"**{k}** — {v}")

st.subheader("References")
st.markdown("""
- Bailey & López de Prado (2014), *The Deflated Sharpe Ratio*, J. Portfolio Management.
- Campbell, Grossman & Wang (1993), *Trading Volume and Serial Correlation in Stock Returns*, QJE.
- Fama & MacBeth (1973), *Risk, Return, and Equilibrium*, JPE.
- Gervais, Kaniel & Mingelgrin (2001), *The High-Volume Return Premium*, J. Finance.
- Grinold & Kahn (1999), *Active Portfolio Management*.
- Harvey, Liu & Zhu (2016), *… and the Cross-Section of Expected Returns*, RFS.
- Jegadeesh & Titman (1993), *Returns to Buying Winners and Selling Losers*, J. Finance.
- Lehmann (1990), *Fads, Martingales, and Market Efficiency*, QJE.
- Llorente, Michaely, Saar & Wang (2002), *Dynamic Volume-Return Relation of Individual Stocks*, RFS.
- López de Prado (2018), *Advances in Financial Machine Learning*.
- McLean & Pontiff (2016), *Does Academic Research Destroy Stock Return Predictability?*, J. Finance.
- Newey & West (1987, 1994), HAC covariance estimation and lag selection.
""")
