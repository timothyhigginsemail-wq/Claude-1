import numpy as np
import pandas as pd
import plotly.graph_objects as go
import streamlit as st

from common import (COLORS, backtest, cost_controls, market, persist, portfolio_controls, show,
                    signal, style)
from quantlab.research.returns import forward_returns

spec = st.session_state.spec
st.title("🔍 Trade inspector")
st.markdown("Aggregate statistics hide what the strategy actually does. Inspect specific "
            "days and stocks to check the positions make sense.")
m = market()
pspec, cspec = portfolio_controls(), cost_controls()
bt = backtest(spec, pspec, cspec)
d = bt.daily

st.subheader("Best and worst days")
c1, c2 = st.columns(2)
c1.markdown("**Worst 8 days (net)**")
c1.dataframe(d["net"].nsmallest(8).to_frame("net return").style.format("{:+.2%}"))
c2.markdown("**Best 8 days (net)**")
c2.dataframe(d["net"].nlargest(8).to_frame("net return").style.format("{:+.2%}"))

st.subheader("One day's book")
dates = list(d.index)
default = d["net"].idxmin()
day = persist(st.select_slider, "Date", "insp_day", default, options=dates,
              format_func=lambda x: f"{x:%Y-%m-%d}")
w = bt.held.loc[day]
contrib = bt.contributions().loc[day]
sig = signal(spec)
pos = dates.index(day)
sig_day = dates[max(pos - 1 - bt.meta["lag"], 0)]
fr = forward_returns(m, pspec.holding, spec.execution).loc[sig_day]
book = pd.DataFrame({"weight %": w * 100, "P&L today (bps)": contrib * 1e4,
                     "signal (formation day)": sig.loc[sig_day],
                     "sector": m.sector, "return today": bt.returns_used.loc[day]})
book = book[book["weight %"].abs() > 1e-6]
st.caption(f"P&L dated {day:%Y-%m-%d} is earned on the interval ending that day, by "
           f"positions formed on signals up to {sig_day:%Y-%m-%d} and earlier (overlapping "
           "tranches).")
c1, c2 = st.columns(2)
c1.metric("Day's gross return", f"{d.loc[day, 'gross']:+.2%}")
c2.metric("Positions", f"{(w > 0).sum()} long / {(w < 0).sum()} short")
st.markdown("**Biggest contributors**")
st.dataframe(book.reindex(book["P&L today (bps)"].abs().sort_values(ascending=False).index)
             .head(15).style.format({"weight %": "{:+.2f}", "P&L today (bps)": "{:+.1f}",
                                     "signal (formation day)": "{:+.2f}",
                                     "return today": "{:+.2%}"}))
sec = book.groupby("sector")[["weight %", "P&L today (bps)"]].sum().sort_values("P&L today (bps)")
st.markdown("**By sector**")
st.dataframe(sec.style.format("{:+.2f}"))

st.subheader("One stock through time")
tick = persist(st.selectbox, "Ticker", "insp_tick", book.index[0] if len(book) else "AAPL",
               options=list(m.tickers))
px = m.close[tick]
wt = bt.held[tick]
cum = bt.contributions()[tick].cumsum()
fig = go.Figure()
fig.add_scatter(x=px.index, y=px, name="Price", line=dict(color=COLORS["neutral"]))
fig.add_bar(x=wt.index, y=wt * 100, name="Weight %", yaxis="y2",
            marker_color=np.where(wt > 0, COLORS["long"], COLORS["short"]))
style(fig, 320, f"{tick}: price and position", yaxis2=dict(overlaying="y", side="right",
                                                         showgrid=False, title="weight %"))
show(fig)
fig = go.Figure(go.Scatter(x=cum.index, y=cum * 1e4, line=dict(color=COLORS["gross"])))
show(style(fig, 220, f"Cumulative P&L contribution of {tick} (bps of capital)"))
tot = bt.contributions().sum().sort_values()
c1, c2 = st.columns(2)
c1.markdown("**Biggest losers (whole sample, bps)**")
c1.dataframe((tot.head(10) * 1e4).to_frame("bps").style.format("{:+.1f}"))
c2.markdown("**Biggest winners**")
c2.dataframe((tot.tail(10)[::-1] * 1e4).to_frame("bps").style.format("{:+.1f}"))
st.caption("If a handful of names drive the result, it is a bet on those names, not a "
           "diversified signal.")
