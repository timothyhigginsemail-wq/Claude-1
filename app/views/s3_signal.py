import numpy as np
import pandas as pd
import plotly.graph_objects as go
import streamlit as st

from common import (COLORS, G, ch, hyp_info, in_sample_dates, market, org_box, persist, pitfalls,
                    show, signal, style, technical, terms, uni)
from quantlab.research.factors import CONTROL_LABELS
from quantlab.research.stats import rowwise_corr

spec = st.session_state.spec
st.title("3 · Signal construction")
st.markdown("Translate the words of the hypothesis into one number per stock per day, "
            "using **only information available at that day's close**.")

if spec.hypothesis == "abnormal_volume":
    st.latex(r"AV_{i,t}=\frac{\overline{\log V}_{i,[t-w+1,\,t]}-\overline{\log V}_{i,[t-w-L+1,\,t-w]}}"
             r"{\mathrm{sd}\left(\log V_{i,[t-w-L+1,\,t-w]}\right)}")
    st.markdown(f"With your settings: recent window **w = {spec.window}** day(s), baseline "
                f"**L = {spec.lookback}** days. AV = 2 means recent log-volume is two of the "
                "stock's own standard deviations above its normal level.")
elif spec.hypothesis == "volume_reversal":
    st.latex(r"S_{i,t} = -\,z\!\left(r_{i,[t-w+1,t]}\right)\times AV_{i,t}")
    st.markdown("Positive when a stock **fell on high volume** (bet: bounce) or rose on low "
                "volume. z(·) is the cross-sectional z-score of the recent return.")
elif spec.hypothesis == "reversal":
    st.latex(r"S_{i,t} = -\,r_{i,[t-w+1,t]}")
elif spec.hypothesis == "custom":
    st.markdown("Your own formula (from 🧪 Signal lab):")
    st.code(spec.formula, language=None)
else:
    h_ = hyp_info(spec)
    st.markdown(f"**{h_.name}.** {h_.statement}  \n*Source:* {h_.reference}")
    st.caption("The exact calculation is in `quantlab/signals/library.py`.")
terms("persistence", "correlation", "lookahead")

m = market()
sig = signal(spec)
u = uni(spec)
s_u = sig.where(u)

c1, c2, c3 = st.columns(3)
c1.metric("Coverage (avg names/day)", f"{s_u.notna().sum(axis=1).mean():.0f}")
ac = rowwise_corr(s_u, s_u.shift(1)).mean()
c2.metric("Day-to-day rank persistence", f"{ac:.2f}", help=G("persistence"))
ac5 = rowwise_corr(s_u, s_u.shift(5)).mean()
c3.metric("5-day persistence", f"{ac5:.2f}", help=G("persistence"))

st.subheader("Distribution")
dates = in_sample_dates(s_u.dropna(how="all").index, st.session_state.sample)
d = persist(st.select_slider, "Cross-section on date", "sig_date", dates[len(dates) // 2],
            options=list(dates), format_func=lambda x: f"{x:%Y-%m-%d}")
x = s_u.loc[d].dropna()
fig = go.Figure()
fig.add_histogram(x=x, nbinsx=50, name=f"{d:%Y-%m-%d}", marker_color=COLORS["gross"], opacity=0.75)
show(style(fig, 260, f"Signal across {len(x)} stocks on {d:%Y-%m-%d}"))
top = pd.DataFrame({"signal": x, "sector": m.sector.reindex(x.index),
                    "volume (m)": m.volume.loc[d, x.index] / 1e6,
                    "return that day": m.daily_returns("close").loc[d, x.index]})
c1, c2 = st.columns(2)
c1.markdown("**Highest**")
c1.dataframe(top.nlargest(8, "signal").round(3))
c2.markdown("**Lowest**")
c2.dataframe(top.nsmallest(8, "signal").round(3))

st.subheader("What else is the signal measuring?")
st.markdown("Average daily cross-sectional rank correlation with known characteristics. "
            "Large values mean the 'new' signal partly repackages something known.")
C = ch(spec)
rows = []
for k, v in C.items():
    r = rowwise_corr(s_u.rank(axis=1), v.where(u).rank(axis=1)).mean()
    rows.append({"characteristic": CONTROL_LABELS[k], "avg rank corr": r})
cor = pd.DataFrame(rows)
fig = go.Figure(go.Bar(x=cor["avg rank corr"], y=cor["characteristic"], orientation="h",
                       marker_color=[COLORS["long"] if v > 0 else COLORS["short"]
                                     for v in cor["avg rank corr"]]))
show(style(fig, 260))

technical(f"""
**Why logs?** Volume is extremely right-skewed: a day with 10× normal volume is far from
the mean in levels but log(10) ≈ 2.3 in logs. Differences of logs are (approximately)
percentage changes, so the measure is comparable across stocks of any size.

**Why exclude the recent window from the baseline?** If today's spike were in its own
baseline it would raise the mean and the standard deviation, muting itself. Lagging the
baseline (`shift(w)`) prevents this.

**Minimum history:** the baseline needs at least max(5, L/2) valid days, and a stock
must have 60 days of volume history to enter the universe.

**Look-ahead test:** `tests/test_lookahead.py` perturbs all data *after* date t and
asserts the signal at t is unchanged, for every signal in the library.

**Persistence and turnover:** if the signal's rank correlation with yesterday is ρ, a
daily-rebalanced portfolio replaces roughly a fraction proportional to √(1−ρ) of its
positions each day. Persistence here: {ac:.2f} (1 day), {ac5:.2f} (5 days).
""")
pitfalls([
    "Using the *full day's* volume and then trading at that day's close is look-ahead: "
    "the final volume is only known after the close. Compare 'Same close' vs 'Next "
    "open' execution in the sidebar.",
    "A volume spike on day t is often caused by a big price move on day t. The signal "
    "therefore inherits exposure to short-term reversal — see the bar chart above and "
    "stage 5.",
    "Volume has strong day-of-week and holiday patterns (e.g. half-days before "
    "Thanksgiving). They affect all stocks equally, so cross-sectional ranking removes "
    "them — but time-series uses of volume would need to adjust.",
])
org_box("signal")
