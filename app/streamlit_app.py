"""Quant Research Lab — entry point.   Run:  streamlit run app/streamlit_app.py"""
import streamlit as st

st.set_page_config(page_title="Quant Research Lab", page_icon="📈", layout="wide",
                   initial_sidebar_state="auto")

from common import sidebar_spec  # noqa: E402

# Compact layout for phones: two metrics per row, smaller headings.
st.html("""
<style>
[data-testid="stMetricValue"] { font-size: 1.5rem; }
/* tap-to-explain panels and any remaining tooltips: fit the screen, wrap text */
[data-testid="stPopoverBody"] { max-width: min(92vw, 30rem) !important; }
[data-testid="stPopoverBody"] p, [data-testid="stPopoverBody"] li { white-space: normal; }
[data-testid="stTooltipContent"] { max-width: 85vw !important; white-space: normal !important; }
[data-testid="stPopover"] button[kind="tertiary"] { padding: 0 .2rem; min-height: 1.6rem;
  font-size: .82rem; color: #2563eb; }
[data-testid="stMetricLabel"] p { font-size: 0.85rem; }
@media (max-width: 640px) {
  h1 { font-size: 1.7rem !important; }
  h2 { font-size: 1.35rem !important; }
  h3 { font-size: 1.15rem !important; }
  .block-container { padding: 2.5rem 0.9rem 3rem 0.9rem !important; }
  [data-testid="stHorizontalBlock"]:has([data-testid="stMetric"]) {
    flex-wrap: wrap !important; gap: 0.5rem !important; }
  [data-testid="stHorizontalBlock"]:has([data-testid="stMetric"]) > [data-testid="stColumn"] {
    min-width: calc(50% - 0.5rem) !important; flex: 1 1 calc(50% - 0.5rem) !important; }
  [data-testid="stMetricValue"] { font-size: 1.2rem; }
}
</style>
""")

P = "views/"
pages = {
    "Start": [st.Page(P + "home.py", title="Overview", icon="🏠", default=True)],
    "Research lifecycle": [
        st.Page(P + "s1_idea.py", title="1 · Idea", icon="💡"),
        st.Page(P + "s2_data.py", title="2 · Data", icon="🗄️"),
        st.Page(P + "s3_signal.py", title="3 · Signal", icon="📶"),
        st.Page(P + "s4_predict.py", title="4 · Predictive tests", icon="🎯"),
        st.Page(P + "s5_factors.py", title="5 · Factor adjustment", icon="🧮"),
        st.Page(P + "s6_portfolio.py", title="6 · Portfolio", icon="⚖️"),
        st.Page(P + "s7_implement.py", title="7 · Costs & capacity", icon="💸"),
        st.Page(P + "s8_evaluate.py", title="8 · Evaluation", icon="🧪"),
        st.Page(P + "s9_decision.py", title="9 · Decision", icon="🧭"),
    ],
    "Tools": [
        st.Page(P + "t_lab.py", title="Signal lab", icon="🧪"),
        st.Page(P + "t_leaderboard.py", title="Signal leaderboard", icon="🏆"),
        st.Page(P + "t_inspect.py", title="Trade inspector", icon="🔍"),
        st.Page(P + "t_compare.py", title="Compare volume ideas", icon="🆚"),
    ],
    "Learn": [
        st.Page(P + "l_org.py", title="How quant firms work", icon="🏛️"),
        st.Page(P + "l_method.py", title="Methodology & glossary", icon="📚"),
    ],
}
pg = st.navigation(pages)
spec, sample = sidebar_spec()
st.session_state["spec"], st.session_state["sample"] = spec, sample
pg.run()
