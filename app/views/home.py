import streamlit as st

from common import HYPOTHESES, SAMPLE_LABELS, ic_table, market, tstat_badge

spec, sample = st.session_state.spec, st.session_state.sample
st.title("📈 Quant Research Lab")
st.markdown(
    "A working research platform that walks one trading hypothesis through the full "
    "lifecycle a systematic fund would use — from idea to a defensible **reject / revise / "
    "advance** decision. Every number is computed live from real historical data.")

st.info("**Current hypothesis:** " + HYPOTHESES[spec.hypothesis].statement)

m = market()
c1, c2, c3 = st.columns(3)
c1.metric("Stocks", f"{m.close.shape[1]}")
c2.metric("Trading days", f"{m.close.shape[0]:,}")
c3.metric("Period", f"{m.dates[0]:%b %Y} – {m.dates[-1]:%b %Y}")

st.markdown("#### Headline (updates with the sidebar)")
tab = ic_table(spec, sample)
h = spec.horizon
row = tab.loc[h]
c1, c2 = st.columns(2)
c1.metric(f"Mean rank IC, {h}-day", f"{row.mean_ic:+.4f}")
c2.metric("Newey-West t-stat", tstat_badge(row.t_nw))
st.caption(f"{SAMPLE_LABELS[sample]}. IC = correlation between today's signal ranking and "
           "the next-h-day return ranking across stocks. See **4 · Predictive tests** for "
           "the full picture and **9 · Decision** for the verdict.")

st.markdown("#### How to use this")
st.markdown("""
1. **Open the sidebar** (☰ / › at top-left on iPhone) to set the hypothesis, parameters,
   horizon and execution timing. All pages update.
2. Work through **stages 1 → 9** in order. Each page has a short explanation, then
   optional 🔬 *technical details*, ⚠️ *pitfalls* and 🏛️ *how a fund would do it*.
3. Use **Trade inspector** to look at individual names and days, and **Compare
   hypotheses** to see the volume signals next to known benchmarks.
""")

st.warning(
    "**Read before trusting anything:** the free dataset covers only stocks that were in "
    "the S&P 500 in 2018 (survivorship bias), only 5 years, with no bid/ask spreads or "
    "earnings dates. The platform is built so that conclusions here are, at best, "
    "*'worth testing on institutional data'* — never *'ready to trade'*.")
