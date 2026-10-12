import numpy as np
import pandas as pd
import plotly.graph_objects as go
import streamlit as st

from common import (COLORS, G, fm_table, interpret, reading, terms, ic_table, org_box, pitfalls, sample_note, show, style,
                    technical, tstat_badge)
from quantlab.research.pipeline import ResearchSpec

spec, sample = st.session_state.spec, st.session_state.sample
st.title("5 · Factor adjustment")
st.markdown(
    "Many 'new' signals are old risk factors in disguise. If high-volume stocks are simply "
    "high-beta stocks, or recent losers, then the signal earns returns we can already get "
    "cheaply. Here we ask what is **left over** after controlling for known effects.")
sample_note(sample)
terms("fama_macbeth", "neutralize", "t_stat")

st.subheader("Fama-MacBeth: the signal's return as controls are added")
fm = fm_table(spec, sample)
fig = go.Figure(go.Bar(
    x=fm["coef_bps"], y=fm.index, orientation="h",
    error_x=dict(array=1.96 * (fm["coef_bps"] / fm["t_nw"]).abs()),
    marker_color=[COLORS["gross"] if abs(t) >= 2 else COLORS["neutral"] for t in fm["t_nw"]]))
fig.update_yaxes(autorange="reversed")
show(style(fig, 300, f"{spec.horizon}-day return per 1 s.d. of signal (bps), 95% CI"))
st.dataframe(fm.style.format({"coef_bps": "{:+.2f}", "t_nw": "{:+.2f}", "n_days": "{:.0f}"}))
first, last = fm.iloc[0], fm.iloc[-1]
reading(interpret.fm(first.coef_bps, first.t_nw, last.coef_bps, last.t_nw))
if np.sign(first.coef_bps) != np.sign(last.coef_bps):
    st.warning("The sign **flips** once controls are added: the raw effect was a proxy for "
               "something else.")
elif abs(last.t_nw) < 2 <= abs(first.t_nw):
    st.warning("Significant alone, but not after controls: the raw effect is largely "
               "explained by known characteristics.")
elif abs(last.t_nw) >= 2:
    st.success("The coefficient remains significant with all available controls.")
else:
    st.info("Not significant with or without controls.")

st.subheader("Raw vs. neutralised signal")
rows = []
for neu, name in [("none", "Raw"), ("sector", "Sector-demeaned"),
                  ("factors", "Residual vs. factors + sector")]:
    t = ic_table(ResearchSpec(**{**spec.as_dict(), "neutralization": neu}), sample)
    for h, r in t.iterrows():
        rows.append({"signal": name, "horizon": f"{h}d", "mean_ic": r.mean_ic, "t": r.t_nw})
df = pd.DataFrame(rows)
fig = go.Figure()
for name, col in zip(df.signal.unique(), [COLORS["neutral"], COLORS["accent"], COLORS["gross"]]):
    d = df[df.signal == name]
    fig.add_bar(x=d.horizon, y=d.mean_ic, name=name, marker_color=col)
show(style(fig, 300, "Mean IC by horizon", barmode="group"))
piv = df.pivot(index="signal", columns="horizon", values="t")[[f"{h}d" for h in (1, 2, 5, 10, 20)]]
st.markdown("**Newey-West t-stats**")
st.dataframe(piv.style.format("{:+.2f}"))
st.caption("Tip: set *Signal neutralisation* in the sidebar to 'Residual vs. factors' to "
           "carry the neutralised signal through the portfolio and evaluation stages.")

technical(r"""
**Fama-MacBeth (1973).** Each day run a cross-sectional regression
$R^h_{i,t} = a_t + b_t\,z(S_{i,t}) + \sum_k c_{k,t}\,z(X_{k,i,t}) + \text{sector}_{i} + e_{i,t}$,
with returns winsorised at each day's 1st/99th percentile so single extreme moves cannot
dominate a regression, then test whether the *time-series average* of $b_t$ is zero, using Newey-West errors
(the $b_t$ overlap like the ICs do). $z(\cdot)$ is a daily cross-sectional z-score clipped
at ±3, so $b_t$ is the return to one standard deviation of signal holding the controls fixed.

**Controls available from price/volume data** (all point-in-time):
market beta (60-day, vs equal-weighted universe), size *proxy* (log 60-day dollar volume —
true size needs shares outstanding), 1-day and 5-day returns (short-term reversal),
6-1 month momentum, 20-day volatility, and GICS sector.

**Neutralisation.** The residual from regressing the signal on the controls each day is
uncorrelated with them by construction. Its IC measures the *incremental* information.

**Not controlled (data unavailable):** value, profitability, investment, quality,
analyst revisions, earnings announcements, short interest, and a proper commercial risk
model (e.g. Barra/Axioma-type). Survival here is necessary, not sufficient.
""")
pitfalls([
    "Our 'size' is dollar volume, which is mechanically related to the volume signal. "
    "Controlling for it may remove part of the genuine effect.",
    "The equal-weighted 'market' differs from the cap-weighted index; the beta estimates "
    "are noisy (60 days).",
    "Adding many controls with a few hundred stocks per day costs precision; a drop in "
    "t-stat can be partly lost power, not lost signal.",
])
org_box("factor")
