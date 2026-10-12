import numpy as np
import pandas as pd
import plotly.graph_objects as go
import streamlit as st

from common import (COLORS, HORIZONS, SAMPLE_LABELS, decay, double_sort, ic_series, ic_table,
                    lag_of, org_box, persist, pitfalls, quantiles, regimes, sample_note, show,
                    style, technical, tstat_badge)
from quantlab.research.analysis import ic_by_regime, sample_mask
from quantlab.research.pipeline import ResearchSpec

spec, sample = st.session_state.spec, st.session_state.sample
st.title("4 · Preliminary research")
st.markdown("Does the signal **rank** stocks by their future returns? We check every "
            "horizon, look at the whole distribution (not just the extremes), and see "
            "whether the effect depends on price moves or market conditions.")
sample_note(sample)

tab = ic_table(spec, sample)
h = spec.horizon
st.subheader("Information coefficient by horizon")
fig = go.Figure()
err = 1.96 * tab["mean_ic"] / tab["t_nw"].replace(0, np.nan)
fig.add_bar(x=[f"{i}d" for i in tab.index], y=tab["mean_ic"], error_y=dict(array=err.abs()),
            marker_color=[COLORS["gross"] if i == h else COLORS["neutral"] for i in tab.index])
show(style(fig, 280, "Mean daily rank IC with 95% Newey-West interval"))
show_tab = tab[["mean_ic", "t_nw", "t_naive", "ic_ir_annual", "hit_rate", "n_days"]].copy()
show_tab.columns = ["Mean IC", "t (Newey-West)", "t (naive, WRONG)", "IC IR (ann.)",
                    "% days IC>0", "Days"]
st.dataframe(show_tab.style.format({"Mean IC": "{:+.4f}", "t (Newey-West)": "{:+.2f}",
                                    "t (naive, WRONG)": "{:+.2f}", "IC IR (ann.)": "{:+.2f}",
                                    "% days IC>0": "{:.0%}", "Days": "{:.0f}"}))
st.caption("Compare the two t-stat columns at long horizons: ignoring overlap between "
           "consecutive h-day returns inflates significance roughly by √h.")

st.subheader(f"Quantile returns, {h}-day horizon")
nq = persist(st.segmented_control, "Buckets", "nq", 5, options=[3, 5, 10])
qt, qdaily = quantiles(spec, sample, int(nq))
buckets = [b for b in qt.index if "-" not in b]
fig = go.Figure(go.Bar(x=buckets, y=qt.loc[buckets, "mean_bps"],
                       error_y=dict(array=1.96 * qt.loc[buckets, "se_bps"]),
                       marker_color=COLORS["gross"]))
show(style(fig, 280, f"Average {h}-day return vs. universe (bps), Q1 = lowest signal"))
ls = qt.iloc[-1]
c1, c2 = st.columns(2)
c1.metric(f"Top − bottom ({h}d)", f"{ls.mean_bps:+.1f} bps", help="Before any costs.")
c2.metric("t-stat", tstat_badge(ls.t_nw))

st.subheader("When is the information realised?")
dc = decay(spec, sample)
fig = go.Figure()
fig.add_bar(x=dc.index, y=dc["mean_ic"], name="IC with the single day k ahead",
            marker_color=COLORS["neutral"])
fig.add_scatter(x=dc.index, y=dc["cumulative_ic"], name="Cumulative", line=dict(color=COLORS["net"]))
show(style(fig, 280, "IC decay: signal at t vs. return on day t+k"))
st.caption("A positive early bar followed by negative bars means a short-lived effect that "
           "partly reverses — common for liquidity effects, and expensive to trade.")

st.subheader("Does it depend on the recent price move?")
cw = persist(st.segmented_control, "Past-return window (days)", "cond_w", 1, options=[1, 5, 20])
means, tst = double_sort(spec, sample, int(cw))
lab_c = {1: "Fell most", 2: "Middle", 3: "Rose most"}
lab_s = {1: "Low signal", 2: "Mid", 3: "High signal"}
z = means.values.astype(float)
txt = [[f"{z[i, j]:+.1f}<br>t={tst.values[i, j]:+.1f}" for j in range(3)] for i in range(3)]
fig = go.Figure(go.Heatmap(z=z, x=[lab_s[j] for j in means.columns],
                           y=[lab_c[i] for i in means.index], text=txt, texttemplate="%{text}",
                           colorscale="RdBu", zmid=0, showscale=False))
show(style(fig, 300, f"{h}-day excess return (bps) by signal × past {cw}-day return"))
st.caption("Read across a row: within stocks that moved similarly, does a higher signal "
           "predict higher returns? If the pattern differs by row, the effect depends on "
           "the accompanying price move.")

st.subheader("Across regimes")
ic = ic_series(spec, h)
ic = ic[sample_mask(ic.index, sample, h, lag_of(spec))]
lab = regimes(spec.min_price, spec.liquidity_pct)
cols = st.columns(3)
for col, name in zip(cols, lab.columns):
    t = ic_by_regime(ic, lab[name], h)
    col.markdown(f"**{name}**")
    col.dataframe(t.style.format({"mean_ic": "{:+.4f}", "t_nw": "{:+.2f}", "n_days": "{:.0f}"}))
cum = ic.fillna(0).cumsum()
fig = go.Figure(go.Scatter(x=cum.index, y=cum, line=dict(color=COLORS["gross"])))
show(style(fig, 260, "Cumulative IC over time (a straight line = consistent effect)"))

st.subheader("Execution timing — a look-ahead demonstration")
rows = []
for ex in ["close_t", "open_t1", "close_t1"]:
    alt = ic_table(ResearchSpec(**{**spec.as_dict(), "execution": ex}), sample).loc[h]
    rows.append({"execution": ex, "mean IC": alt.mean_ic, "t": alt.t_nw})
st.dataframe(pd.DataFrame(rows).set_index("execution").style.format("{:+.4f}"))
st.caption("'close_t' assumes you trade at the same close whose volume you used — "
           "impossible in practice. If results look much better under it, the 'edge' is "
           "information you would not have had.")

technical(r"""
**Rank IC.** Each day t, rank stocks by the signal and by their forward return
$R^h_{i,t}=P_{i,t+L+h}/P_{i,t+L}-1$ (P = entry price, L = execution lag), and take the
Pearson correlation of the ranks (Spearman correlation). Ranks make the measure robust to
outliers. Typical *good* daily ICs in equities are small: 0.02–0.05.

**Why Newey-West.** Consecutive 5-day returns share 4 days, so daily ICs are
autocorrelated. The Newey-West estimator adds weighted autocovariances to the variance:
$\widehat{\mathrm{Var}}(\bar x)=\frac1T\left[\hat\gamma_0+2\sum_{k=1}^{q}\left(1-\frac{k}{q+1}\right)\hat\gamma_k\right]$,
with $q=\max(h-1,\lfloor4(T/100)^{2/9}\rfloor)$.

**Quantile spreads.** Forward returns are measured *in excess of the equal-weighted
universe* each day, so market moves cancel. Q5−Q1 is the return of a $1-long/$1-short
portfolio before costs.

**Regimes** are classified using only information available at t (trailing 20-day market
volatility, trailing 60-day market return, terciles from an expanding window) so they
could have been known in real time.

**Purging.** In the research sample, signal dates whose return window would reach into
the holdout are dropped, so not a single holdout price influences these numbers.
""")
pitfalls([
    "Look at all horizons before choosing one. Picking the horizon with the best t-stat "
    "is a multiple-testing problem (see stage 8).",
    "A significant IC can come from the *middle* of the distribution while the extremes "
    "(which a portfolio actually trades) are flat — check the quantile chart.",
    "Regime splits shrink the sample; a t-stat of 2 in one regime and 0 in another is "
    "usually not evidence of a regime-dependent effect.",
])
org_box("predict")
