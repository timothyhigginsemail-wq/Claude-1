import numpy as np
import pandas as pd
import plotly.graph_objects as go
import streamlit as st

from common import (COLORS, backtest, cost_controls, fmt_pct, org_box, persist, pitfalls,
                    portfolio_controls, sample_note, show, style, technical)
from quantlab.portfolio.backtest import performance
from quantlab.research.pipeline import restrict

spec, sample = st.session_state.spec, st.session_state.sample
st.title("6 · Portfolio construction")
st.markdown("Turn the ranking into positions: **long** the stocks the signal likes, "
            "**short** the ones it dislikes, in equal dollar amounts so the market's "
            "direction largely cancels.")
sample_note(sample)

with st.expander("⚙️ Portfolio settings", expanded=True):
    c1, c2 = st.columns(2)
    with c1:
        persist(st.selectbox, "Weighting", "scheme", "quantile", options=["quantile", "rank"],
                format_func={"quantile": "Equal-weight top/bottom quantile",
                             "rank": "Proportional to signal rank"}.get)
        persist(st.slider, "Fraction of names per leg", "quantile", 0.2, min_value=0.05,
                max_value=0.5, step=0.05)
        persist(st.slider, "Holding period (days)", "holding", spec.horizon, min_value=1,
                max_value=20)
    with c2:
        persist(st.toggle, "Overlapping daily tranches", "overlap", True,
                help="On: each day re-form 1/H of the book (smooth). Off: re-form the "
                     "whole book every H days.")
        persist(st.slider, "Max weight per name (% of capital)", "max_weight", 2.0,
                min_value=0.5, max_value=10.0, step=0.5)
        persist(st.toggle, "Sector neutral", "sector_neutral", False)
        persist(st.toggle, "Beta neutral (hedge with market basket)", "beta_neutral", False)
pspec = portfolio_controls()
bt = backtest(spec, pspec, cost_controls())
d = bt.daily
lag = bt.meta["lag"]
g = restrict(d["gross"], sample, pspec.holding, lag)
L = restrict(d["long_leg"], sample, pspec.holding, lag)
S = restrict(d["short_leg"], sample, pspec.holding, lag)
perf = performance(g)

c1, c2, c3, c4 = st.columns(4)
c1.metric("Gross return (ann.)", fmt_pct(perf["ann_return"]))
c2.metric("Volatility (ann.)", fmt_pct(perf["ann_vol"]))
c3.metric("Gross Sharpe", f"{perf['sharpe']:.2f}")
c4.metric("Max drawdown", fmt_pct(perf["max_drawdown"]))
st.caption("Before trading costs — see stage 7 for net results.")

fig = go.Figure()
fig.add_scatter(x=g.index, y=g.cumsum() * 100, name="Long − short", line=dict(color=COLORS["gross"]))
fig.add_scatter(x=L.index, y=L.cumsum() * 100, name="Long leg", line=dict(color=COLORS["long"], width=1))
fig.add_scatter(x=S.index, y=S.cumsum() * 100, name="Short leg", line=dict(color=COLORS["short"], width=1))
show(style(fig, 320, "Cumulative gross return (% of capital, simple sum)"))
st.caption("The legs move with the market (long leg up, short leg down in a rising "
           "market); the spread is what the signal adds.")

st.subheader("Exposures")
fig = go.Figure()
dd = d.loc[g.index]
fig.add_scatter(x=dd.index, y=dd.gross_exposure, name="Gross", line=dict(color=COLORS["neutral"]))
fig.add_scatter(x=dd.index, y=dd.net_exposure, name="Net", line=dict(color=COLORS["gross"]))
if "beta_exposure" in dd:
    fig.add_scatter(x=dd.index, y=dd.beta_exposure, name="Beta", line=dict(color=COLORS["net"]))
show(style(fig, 260, "Exposure as a multiple of capital"))
tw_gross = dd.gross_exposure.max()
if tw_gross < 0.95 * pspec.gross:
    st.warning(f"The max-weight cap is infeasible: with this few names per leg, a "
               f"{pspec.max_weight:.1%} cap cannot reach {pspec.gross:.0f}× gross, so the "
               "book is smaller than intended. Raise the cap or the fraction of names.")
c1, c2, c3 = st.columns(3)
c1.metric("Avg names long / short", f"{dd.n_long.mean():.0f} / {dd.n_short.mean():.0f}")
c2.metric("Avg gross exposure", f"{dd.gross_exposure.mean():.2f}×")
c3.metric("Avg |beta|", f"{dd.beta_exposure.abs().mean():.2f}" if "beta_exposure" in dd else "–")

H = bt.held.loc[g.index]
from common import market  # noqa: E402
m = market()
by_sec = H.T.groupby(m.sector.reindex(H.columns).values).sum().T
avg = by_sec.mean().sort_values()
fig = go.Figure(go.Bar(x=avg.values * 100, y=avg.index, orientation="h",
                       marker_color=[COLORS["long"] if v > 0 else COLORS["short"] for v in avg]))
show(style(fig, 320, "Average net sector exposure (% of capital)"))
st.caption("Turn on *Sector neutral* to force these to ≈0 and see whether returns survive.")

technical(r"""
**Formation.** On each date t, rank eligible stocks by the signal. *Quantile* scheme: go
long the top fraction q with equal weights summing to +1, short the bottom q summing to
−1 (gross 2× capital = "100/100"). *Rank* scheme: weights proportional to the demeaned
rank. Weights are capped at the max-weight limit, redistributing the excess within the leg.

**Overlapping holdings (Jegadeesh & Titman, 1993).** With holding period H, the book on
any day is the average of the last H formations, each with 1/H of capital. This avoids
results depending on an arbitrary rebalance day, and is the natural way to hold an
H-day signal.

**Timing.** A formation using the close of t is held over the H return intervals after
the execution point (t+1 open by default). Unit tests verify a weight placed on date t
earns nothing before then.

**Sector neutral:** quantiles are taken *within* each sector, and each sector's legs
are scaled by its share of the universe. **Beta neutral:** the book's beta is hedged with
an equal-weighted basket of the universe.

**Simplifications:** no optimiser (a production book would use mean-variance
optimisation with a risk model), price returns only, no intraday drift within tranches.
""")
pitfalls([
    "A good-looking long leg in a bull market is mostly market exposure. Judge the spread.",
    "Gross exposure below 2× means overlapping tranches cancel each other (a stock long in "
    "one tranche and short in another): a sign of a fast-changing signal.",
    "Unconstrained books often hide sector bets. A volume signal can load on whichever "
    "sector had news that week.",
])
org_box("portfolio")
