import pandas as pd
import streamlit as st

from quantlab.content.org import ROLES, STAGES

st.title("🏛️ How a systematic research organisation works")
st.markdown(
    "This page describes practices that are **widely discussed in public sources** — "
    "academic papers, practitioner books, conference talks and job descriptions — and "
    "marks clearly where we are making **illustrative assumptions**. It does not describe "
    "any specific firm's proprietary process.")

st.subheader("Roles")
for r, d in ROLES.items():
    with st.expander(r):
        st.markdown(d)

st.subheader("The research pipeline, stage by stage")
names = {"idea": "1 · Idea", "data": "2 · Data", "signal": "3 · Signal",
         "predict": "4 · Predictive tests", "factor": "5 · Factor adjustment",
         "portfolio": "6 · Portfolio", "implement": "7 · Costs & capacity",
         "evaluate": "8 · Evaluation", "decide": "9 · Decision"}
for k, (teams, ev, rej) in STAGES.items():
    with st.expander(names[k]):
        st.markdown(f"**Teams:** {', '.join(teams)}")
        st.markdown("**Evidence demanded:**\n" + "\n".join(f"- {e}" for e in ev))
        st.markdown("**Reasons to reject:**\n" + "\n".join(f"- {r}" for r in rej))

st.subheader("Recurring themes")
st.markdown("""
- **The researcher tries to kill their own idea.** Reviews are adversarial by design;
  a researcher who reports only supportive evidence loses credibility. [Public]
- **Shared infrastructure.** Signals are tested on a common platform with the same data,
  risk model and cost model, so results are comparable and bugs are found once. [Public]
- **Marginal contribution.** A new signal is judged by what it adds to the existing
  combined portfolio, after its correlation with existing signals, not standalone. [Public]
- **Signals are combined.** Individual equity signals are usually weak (ICs of 0.01–0.05);
  value comes from combining many weakly correlated ones (Grinold & Kahn's "fundamental
  law": IR ≈ IC × √breadth). [Public]
- **Production monitoring.** After launch, live performance is compared with backtest
  expectations; persistent shortfall triggers review or retirement. [Public]
- **Gating with paper trading and small capital** before full allocation. [Illustrative]
""")
st.subheader("The fundamental law, made concrete")
ic = st.slider("Information coefficient per bet", 0.005, 0.05, 0.02, 0.005)
breadth = st.slider("Independent bets per year", 100, 50000, 5000, 100)
st.metric("Implied information ratio (before costs)", f"{ic * breadth ** 0.5:.2f}")
st.caption("IR ≈ IC·√N assumes independent bets — overlapping holdings and correlated "
           "stocks make the real breadth far smaller than the number of trades.")
