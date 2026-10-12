import numpy as np
import pandas as pd
import plotly.graph_objects as go
import streamlit as st

from common import (COLORS, G, backtest, interpret, reading, terms, cost_controls, fmt_pct, org_box, persist, pitfalls,
                    portfolio_controls, sample_note, show, style, technical)
from quantlab.portfolio.backtest import performance, rescale_trading_cost
from quantlab.portfolio.construct import PortfolioSpec
from quantlab.research.pipeline import ResearchSpec, restrict

spec, sample = st.session_state.spec, st.session_state.sample
st.title("7 · Implementation: costs, turnover, capacity")
st.markdown("A signal is only worth something if its edge exceeds the cost of trading it. "
            "Fast signals trade a lot; every trade pays the bid-ask spread and pushes the "
            "price against you (market impact), and bigger funds push harder.")
sample_note(sample)
terms("turnover", "breakeven", "impact", "capacity", "gross_net")

with st.expander("⚙️ Cost assumptions", expanded=True):
    c1, c2 = st.columns(2)
    with c1:
        persist(st.slider, "Half-spread + fees (bps per trade)", "half_spread", 3.0,
                min_value=0.0, max_value=20.0, step=0.5)
        persist(st.slider, "Impact coefficient Y", "impact", 0.7, min_value=0.0, max_value=2.0,
                step=0.1, help="cost = Y · daily vol · √(trade / ADV)")
    with c2:
        persist(st.select_slider, "Capital (AUM, $m)", "aum", 100.0,
                options=[10.0, 25.0, 50.0, 100.0, 250.0, 500.0, 1000.0, 2500.0])
        persist(st.slider, "Borrow fee on shorts (bps/yr)", "borrow", 30.0, min_value=0.0,
                max_value=200.0, step=5.0)

pspec, cspec = portfolio_controls(), cost_controls()
bt = backtest(spec, pspec, cspec)
d = bt.daily
lag = bt.meta["lag"]
R = lambda s: restrict(s, sample, pspec.holding, lag)  # noqa: E731
g, n = R(d["gross"]), R(d["net"])
pg, pn = performance(g), performance(n)
to = R(d["turnover"])

c1, c2, c3, c4 = st.columns(4)
c1.metric("Gross Sharpe", f"{pg['sharpe']:.2f}", help=G("sharpe"))
c2.metric("Net Sharpe", f"{pn['sharpe']:.2f}", help=G("gross_net"))
c3.metric("Net return (ann.)", fmt_pct(pn["ann_return"]))
c4.metric("Cost drag (ann.)", fmt_pct((g.mean() - n.mean()) * 252))

fig = go.Figure()
fig.add_scatter(x=g.index, y=g.cumsum() * 100, name="Gross", line=dict(color=COLORS["gross"]))
fig.add_scatter(x=n.index, y=n.cumsum() * 100, name="Net of costs", line=dict(color=COLORS["net"]))
show(style(fig, 300, "Cumulative return, % of capital"))

c1, c2, c3 = st.columns(3)
c1.metric("Turnover / day", f"{to.mean():.0%} of capital", help=G("turnover"))
hold = 2 * d["gross_exposure"].mean() / to.mean() if to.mean() > 0 else np.nan
c2.metric("Implied avg holding", f"{hold:.1f} days")
be = g.mean() / to.mean() * 1e4 if to.mean() > 0 else np.nan
paid = R(d["trading_cost"]).mean() / to.mean() * 1e4 if to.mean() > 0 else np.nan
c3.metric("Break-even cost", f"{be:.1f} bps", delta=f"vs {paid:.1f} bps modelled",
          delta_color="off", help=G("breakeven"))
reading(interpret.costs(be, paid, to.mean()) + " " + interpret.sharpe(pn["sharpe"], net=True))
st.caption("Break-even cost = gross return per $ traded. If realistic all-in costs exceed "
           "it, the strategy loses money no matter how good its IC looks.")

st.subheader("Capacity: what happens as the fund gets bigger?")
aums = [10e6, 25e6, 50e6, 100e6, 250e6, 500e6, 1e9, 2.5e9, 5e9]
rows = []
for a in aums:
    tc = R(rescale_trading_cost(bt, aum=a))
    net = g - tc.reindex(g.index).fillna(0) - R(d["borrow_cost"])
    p = performance(net)
    rows.append({"AUM ($m)": a / 1e6, "net Sharpe": p["sharpe"], "net return": p["ann_return"],
                 "net P&L ($m/yr)": p["ann_return"] * a / 1e6})
cap = pd.DataFrame(rows)
fig = go.Figure()
fig.add_scatter(x=cap["AUM ($m)"], y=cap["net Sharpe"], mode="lines+markers",
                line=dict(color=COLORS["net"]), name="Net Sharpe")
fig.update_xaxes(type="log", title="AUM ($m, log scale)")
show(style(fig, 280, "Net Sharpe vs. capital deployed"))
st.dataframe(cap.style.format({"AUM ($m)": "{:,.0f}", "net Sharpe": "{:+.2f}",
                               "net return": "{:+.2%}", "net P&L ($m/yr)": "{:+,.1f}"}),
             hide_index=True)
part = R(bt.participation.where(bt.trades.abs() > 1e-12).max(axis=1)).dropna()
st.caption(f"At ${cspec.aum / 1e6:,.0f}m the largest single trade each day averages "
           f"{part.mean():.2%} of that stock's 20-day average dollar volume "
           f"(95th percentile {part.quantile(.95):.2%}). Above ~5–10% of ADV, the "
           "square-root model becomes unreliable and trades would need to be spread over days.")

st.subheader("Ways to cut costs — compared")
rows = []
variants = [
    ("Current settings", spec, pspec),
    ("Hold 2× longer", spec, PortfolioSpec(**{**pspec.__dict__, "holding": min(pspec.holding * 2, 20)})),
    ("Rebalance every H days (no overlap)", spec, PortfolioSpec(**{**pspec.__dict__, "overlap": False})),
    ("Smoother signal (5-day window)", ResearchSpec(**{**spec.as_dict(), "window": 5}), pspec),
]
for name, s, p in variants:
    b = backtest(s, p, cspec)
    gg, nn = R(b.daily["gross"]), R(b.daily["net"])
    rows.append({"variant": name, "gross Sharpe": performance(gg)["sharpe"],
                 "net Sharpe": performance(nn)["sharpe"], "turnover/day": R(b.daily["turnover"]).mean()})
st.dataframe(pd.DataFrame(rows).set_index("variant").style.format(
    {"gross Sharpe": "{:+.2f}", "net Sharpe": "{:+.2f}", "turnover/day": "{:.0%}"}))
st.caption("Each variant is another trial: choosing the best one here should be counted "
           "in the multiple-testing adjustment.")

technical(r"""
**Turnover.** Weights drift between trades as prices move. On each day we compute the
drifted book $\tilde w_{i}=w_{i}(1+r_i)/(1+r_p)$ and trade to the next target:
$\text{turnover}_t=\sum_i |w_{i,t+1}-\tilde w_{i,t}|$.

**Cost per name:** $c_i = s + Y\,\sigma_i\sqrt{|\Delta w_i|\cdot AUM/ADV_i}$ where s is the
half-spread plus fees, $\sigma_i$ the 20-day daily volatility and $ADV_i$ the 20-day average
dollar volume, both measured *before* the trade. Total daily cost $=\sum_i|\Delta w_i|\,c_i$.

**Why square root?** Empirically, the price impact of a large order grows roughly with
the square root of its size relative to daily volume (Almgren et al. 2005; Tóth et al.
2011; Kyle & Obizhaeva). Y of order 0.5–1 is commonly reported, but it is specific to
the market, period and execution method.

**Borrow fee:** shorting S&P 500 names usually costs a "general collateral" fee of
roughly 0.25–0.5%/yr; hard-to-borrow names can cost far more (not modelled per name).

**Defaults are illustrative.** Without bid/ask data we cannot measure spreads. Typical
quoted half-spreads for large US stocks in 2013–2018 were on the order of 1–3 bps; we
use 3 bps including fees. Opening auctions can have wider effective costs.
""")
pitfalls([
    "Costs scale with turnover, and turnover is usually the first thing to explode when "
    "a fast signal is traded naively.",
    "A strategy with high gross Sharpe but break-even cost of 2–3 bps is a *research "
    "finding*, not a trading strategy.",
    "Capacity estimates from free data are rough; real execution teams calibrate impact "
    "on the firm's own fills.",
])
org_box("implement")
