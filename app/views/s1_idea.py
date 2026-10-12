import numpy as np
import pandas as pd
import plotly.graph_objects as go
import streamlit as st

from common import (COLORS, hyp_info, periods, in_sample_dates, market, org_box, persist, pitfalls,
                    show, signal, style, technical)

spec = st.session_state.spec
h = hyp_info(spec)
st.title("1 · Idea generation")
st.markdown("A research project starts with a **specific, falsifiable** claim and a reason "
            "it should be true. *Falsifiable* means we state in advance what result would "
            "prove us wrong.")

st.subheader(h.name)
st.markdown(f"**Hypothesis.** {h.statement}")
st.markdown(f"**Proposed mechanism.** {h.mechanism}")
st.markdown(f"**Predicted sign.** {h.predicted_sign}")
if getattr(h, "reference", ""):
    st.caption(f"Source: {h.reference}")

if spec.hypothesis in ("abnormal_volume", "volume_reversal"):
    st.markdown("#### Competing explanations — and what each predicts")
    st.markdown("A good test distinguishes between mechanisms, not just 'does it work'.")
    st.dataframe(pd.DataFrame([
        ["Attention / visibility", "High volume → more investors notice → buying pressure",
         "Positive, persistent for weeks", "Gervais, Kaniel & Mingelgrin (2001)"],
        ["Liquidity provision", "Volume from uninformed flows pushes price away from value",
         "High-volume moves REVERSE", "Campbell, Grossman & Wang (1993)"],
        ["Informed trading", "Volume reflects private information being traded on",
         "High-volume moves CONTINUE", "Llorente, Michaely, Saar & Wang (2002)"],
        ["News / earnings proxy", "Volume spikes on announcements; the sign depends on the news",
         "Weak unconditional effect; depends on return sign", "Earnings-announcement premium literature"],
    ], columns=["Mechanism", "Story", "Prediction", "Source"]), hide_index=True)

st.markdown("#### Pre-registered test (written before looking at results)")
st.markdown(f"""
- **Primary test:** mean daily Spearman rank IC between the signal and the next
  **{spec.horizon}-day** return, research sample {periods()['research']}, next-open execution.
- **Reject if:** |Newey-West t| < 2, *or* the effect disappears after controlling for
  short-term reversal and other price-based factors, *or* it fails out of sample.
- **Secondary questions:** does the sign depend on the accompanying price move? Does it
  survive realistic costs? Is it stable across years and volatility regimes?
- The {periods()['holdout']} data are **locked** until the specification is frozen.
""")

st.markdown("#### A concrete example")
m = market()
tick = persist(st.selectbox, "Stock", "idea_ticker", "AAPL", options=list(m.tickers))
keep = in_sample_dates(m.dates, st.session_state.sample)
sig = signal(spec)[tick].loc[keep]
vol = m.volume[tick].loc[keep]
px = m.close[tick].loc[keep]
fig = go.Figure()
fig.add_bar(x=vol.index, y=vol / 1e6, name="Volume (m shares)", marker_color=COLORS["neutral"],
            opacity=0.6, yaxis="y2")
fig.add_scatter(x=px.index, y=px, name="Price", line=dict(color=COLORS["gross"], width=1.5))
spikes = sig[sig > 2.5].index if spec.hypothesis == "abnormal_volume" else sig.nlargest(15).index
fig.add_scatter(x=spikes, y=px.reindex(spikes), mode="markers", name="Signal extreme",
                marker=dict(color=COLORS["net"], size=7))
style(fig, 340, f"{tick}: price, volume, and the days the signal flags",
      yaxis=dict(title="Price"), yaxis2=dict(overlaying="y", side="right", showgrid=False,
                                             title="Volume"))
show(fig)
st.caption("Red dots mark days with an extreme signal value. Ask: what happened on those "
           "days (earnings? index rebalancing? market crash?), and what happened next?")

technical("""
**What makes a hypothesis testable**

1. *A measurable quantity* (here: volume relative to the stock's own history).
2. *A target* (the return over the next h days, measured from a price we could
   actually have traded at).
3. *A predicted sign and horizon* — otherwise any result can be read as support.
4. *A decision rule* fixed in advance (see stage 9).

**Why 'relative to its own history'?** Raw volume mostly measures company size: Apple
always trades more than Hasbro. Comparing a stock with itself removes that and leaves
the *surprise* component.
""")
pitfalls([
    "Choosing the hypothesis *after* browsing charts like the one above is data mining. "
    "Use examples for intuition, never as evidence.",
    "Published anomalies tend to shrink after publication (McLean & Pontiff, 2016). The "
    "literature above is a reason to test, not a reason to believe.",
    "Volume spikes cluster around earnings announcements, index changes and market-wide "
    "stress. The signal may be a proxy for those events rather than for volume itself.",
])
org_box("idea")

st.markdown("#### Draft your own hypothesis")
with st.form("own"):
    st.text_area("Statement (what predicts what, over which horizon, with which sign?)",
                 key="own_stmt")
    st.text_area("Mechanism (who is on the other side of the trade, and why?)", key="own_mech")
    st.text_area("What result would make you reject it?", key="own_reject")
    if st.form_submit_button("Save draft to this session"):
        st.success("Saved. To test it, open 🧪 Signal lab: it turns a hypothesis card like "
                   "this into a signal you can lock and evaluate.")
