import numpy as np
import pandas as pd
import plotly.graph_objects as go
import streamlit as st

from common import (COLORS, HORIZONS, HYPOTHESES, backtest, cost_controls, ic_table,
                    portfolio_controls, sample_note, show, signal, style, uni)
from quantlab.portfolio.backtest import performance
from quantlab.research.pipeline import ResearchSpec, restrict
from quantlab.research.stats import rowwise_corr

spec, sample = st.session_state.spec, st.session_state.sample
st.title("🆚 Compare hypotheses")
st.markdown("Each hypothesis run with its own default parameters, the same universe, "
            "horizon, execution and portfolio settings. The **placebo** shows what pure "
            "noise looks like.")
sample_note(sample)

pspec, cspec = portfolio_controls(), cost_controls()
specs = {k: ResearchSpec(**{**spec.as_dict(), "hypothesis": k,
                            "lookback": 20 if k != "volume_trend" else 120,
                            "window": {"reversal": 5, "volume_trend": 20}.get(k, 1)})
         for k in HYPOTHESES}
rows, ic_rows = [], []
for k, s in specs.items():
    t = ic_table(s, sample)
    for h, r in t.iterrows():
        ic_rows.append({"hypothesis": HYPOTHESES[k].name, "horizon": h, "t": r.t_nw,
                        "ic": r.mean_ic})
    bt = backtest(s, pspec, cspec)
    lag = bt.meta["lag"]
    g = restrict(bt.daily["gross"], sample, pspec.holding, lag)
    n = restrict(bt.daily["net"], sample, pspec.holding, lag)
    rows.append({"hypothesis": HYPOTHESES[k].name,
                 f"IC {spec.horizon}d": t.loc[spec.horizon, "mean_ic"],
                 "t": t.loc[spec.horizon, "t_nw"], "gross Sharpe": performance(g)["sharpe"],
                 "net Sharpe": performance(n)["sharpe"],
                 "turnover/day": restrict(bt.daily["turnover"], sample, 1, lag).mean()})
st.dataframe(pd.DataFrame(rows).set_index("hypothesis").style.format(
    {f"IC {spec.horizon}d": "{:+.4f}", "t": "{:+.2f}", "gross Sharpe": "{:+.2f}",
     "net Sharpe": "{:+.2f}", "turnover/day": "{:.0%}"}))

df = pd.DataFrame(ic_rows)
piv = df.pivot(index="hypothesis", columns="horizon", values="t")
fig = go.Figure(go.Heatmap(z=piv.values, x=[f"{h}d" for h in piv.columns], y=piv.index,
                           colorscale="RdBu", zmid=0, text=np.round(piv.values, 1),
                           texttemplate="%{text}", showscale=False))
show(style(fig, 300, "IC t-stat (Newey-West) by horizon"))

st.subheader("How similar are the signals?")
u = uni(spec)
keys = list(HYPOTHESES)
S = {k: signal(specs[k]).where(u).rank(axis=1) for k in keys}
C = pd.DataFrame(index=[HYPOTHESES[k].name for k in keys],
                 columns=[HYPOTHESES[k].name for k in keys], dtype=float)
for a in keys:
    for b in keys:
        C.loc[HYPOTHESES[a].name, HYPOTHESES[b].name] = rowwise_corr(S[a], S[b]).mean()
fig = go.Figure(go.Heatmap(z=C.values, x=[k.split("·")[0] for k in C.columns], y=C.index,
                           colorscale="RdBu", zmid=0, zmin=-1, zmax=1,
                           text=np.round(C.values, 2), texttemplate="%{text}", showscale=False))
show(style(fig, 300, "Average daily cross-sectional rank correlation"))
st.caption("Two signals with high correlation are largely the same bet. A new signal is "
           "most valuable when it predicts returns *and* is uncorrelated with what you "
           "already have.")
st.info("To add your own hypothesis: describe it in chat (statement, mechanism, horizon) "
        "and it will be coded into `quantlab/signals/library.py` with look-ahead tests.")
