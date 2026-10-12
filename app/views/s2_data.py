import json

import pandas as pd
import plotly.graph_objects as go
import streamlit as st

from common import COLORS, ROOT, market, org_box, persist, pitfalls, show, style, technical, uni

spec = st.session_state.spec
rep = json.loads((ROOT / "data/processed/quality_report.json").read_text())
st.title("2 · Data")
st.markdown("Bad data produce confident, wrong answers. Before any modelling we document "
            "**where every number comes from**, what was changed, and what is missing.")

st.subheader("Sources")
for k, s in rep["sources"].items():
    with st.expander(f"📦 {k}: {s['description'][:70]}…"):
        st.markdown(f"**Description.** {s['description']}")
        st.markdown(f"**Limitations.** {s['limitations']}")
        st.code(f"{s['url']}\nsha256 {s['sha256']}", language=None)
st.caption("Each file is pinned by checksum: if the upstream file changes, the build stops "
           "rather than silently changing results. Rebuild with `python scripts/build_data.py`.")

st.subheader("Cleaning log")
c = rep["cleaning"]
log = pd.DataFrame([
    ["Raw rows", c["raw_rows"], "—"],
    ["Duplicate rows", c["duplicate_rows_dropped"], "dropped"],
    ["Missing open/high/low cells", c["missing_open_high_low_cells"], "left missing"],
    ["Zero-volume rows", c["zero_volume_rows_set_to_missing"], "volume set missing"],
    ["Close outside the day's high–low range", len(c["bad_close_outside_range_set_missing"]),
     "close set missing (bad print)"],
    ["Spike-and-reverse rows (>25% and back)", len(c["spike_reversal_rows_set_missing"]),
     "prices set missing (bad print)"],
    ["Unadjusted corporate actions", c["corporate_action_returns_invalidated"],
     "return invalidated"],
    ["Tickers with missing days mid-life", len(c["tickers_with_internal_gaps"]), "left missing"],
], columns=["Check", "Count", "Action"])
st.dataframe(log, hide_index=True)
with st.expander("Which rows were fixed, and why it matters"):
    st.markdown("**Bad prints:** " + ", ".join(c["bad_close_outside_range_set_missing"] +
                                               c["spike_reversal_rows_set_missing"]))
    ca = pd.read_csv(ROOT / "data/reference/corporate_actions.csv")
    st.markdown("**Corporate actions the vendor did not adjust for:**")
    st.dataframe(ca, hide_index=True)
    st.markdown(
        "Example: on 2015-07-20 eBay's price fell 57% because PayPal was spun off — "
        "shareholders received PayPal shares, so their actual return was roughly zero. "
        "Left in, this single row would look like one of the largest daily losses in the "
        "sample, and a high-volume one at that: exactly what a volume signal would trade on.")
    flags = pd.DataFrame(c["extreme_return_flags"])
    st.markdown("**Remaining moves > 40% (kept — verified as genuine news or handled "
                "above):**")
    st.dataframe(flags, hide_index=True)

st.subheader("Survivorship bias, measured")
s = rep["survivorship"]
m = market()
cov = m.coverage
c1, c2, c3 = st.columns(3)
c1.metric("Index members, Feb 2013", s["members_on_first_date"])
c2.metric("…of which in our data", s["members_on_first_date_with_data"])
c3.metric("Avg. daily coverage", f"{s['avg_daily_coverage']:.0%}")
fig = go.Figure()
fig.add_scatter(x=cov.index, y=cov.n_members, name="Actual S&P 500 members",
                line=dict(color=COLORS["neutral"]))
fig.add_scatter(x=cov.index, y=cov.n_with_data, name="Members we have data for",
                line=dict(color=COLORS["gross"]))
fig.add_scatter(x=cov.index, y=uni(spec).sum(axis=1), name="Eligible universe (after filters)",
                line=dict(color=COLORS["long"], dash="dot"))
show(style(fig, 300, "Coverage of the true point-in-time index"))
st.markdown(
    f"**{len(s['members_on_first_date_missing'])} companies** that were in the index in "
    "February 2013 are missing entirely — they were later removed, acquired or went "
    "bankrupt. Examples: " + ", ".join(s["members_on_first_date_missing"][:25]) + "…")
st.markdown(
    "**Why it matters for this hypothesis:** stocks that later failed often traded on "
    "abnormally high volume while falling. Their absence removes exactly the cases where "
    "a high-volume signal would have been most wrong (or most right on the short side). "
    "The direction of the bias is not knowable without the missing data — which is the "
    "point: *we cannot fix survivorship bias, only measure and disclose it.*")
st.markdown(
    "**What we can fix:** stocks are only eligible on dates when they were actually in "
    "the index (point-in-time membership). A stock added in 2017 after a big run-up is "
    "not allowed to contribute its 2013–2016 history, which would otherwise import "
    "'future index inclusion' as hidden information.")

st.subheader("Inspect one stock")
tick = persist(st.selectbox, "Ticker", "data_ticker", "EBAY", options=list(m.tickers))
df = pd.DataFrame({"open": m.open[tick], "high": m.high[tick], "low": m.low[tick],
                   "close": m.close[tick], "volume": m.volume[tick],
                   "return": m.daily_returns("close")[tick], "member": m.member[tick],
                   "sector": m.sector[tick]}).dropna(how="all", subset=["close", "volume"])
fig = go.Figure(go.Candlestick(x=df.index, open=df.open, high=df.high, low=df.low,
                               close=df.close, name=tick))
fig.update_layout(xaxis_rangeslider_visible=False)
show(style(fig, 300, f"{tick} daily prices (split-adjusted, not dividend-adjusted)"))
st.dataframe(df.sort_index(ascending=False).head(250), height=260)
st.caption(f"Sector: {m.sector[tick]}. Days in index: {int(m.member[tick].sum())} of {len(m.dates)}.")

technical("""
**Adjusted prices.** A 2-for-1 split halves the price without changing shareholder wealth.
Prices here are *split-adjusted* (history divided by the split ratio) and volumes are
adjusted the other way. They are **not** dividend-adjusted, so returns are price returns:
over 5 days this omits about 4 bp for a 2%-yield stock (0 for non-payers), small
relative to cross-sectional dispersion but not zero, and concentrated on ex-dividend days.

**Point-in-time.** Every input must be what was *known at the time*. Membership: the list
in force on that day. Sectors: we only have **current** GICS sectors (plus hand labels for
138 departed names — marked "verify"), which is a mild look-ahead; sector changes are rare.

**Rules applied, in order:** drop duplicates → drop non-positive closes → zero volume to
missing → close outside [0.98·low, 1.02·high] to missing → spike-and-reverse (>25% and back
within 5% next day) to missing → invalidate returns on listed corporate-action dates.
Returns are never computed across a missing price.

**What institutional data would add:** CRSP-style delisting returns, full history of
removed names, dividend-adjusted total returns, quotes (bid/ask), shares outstanding,
earnings dates, and as-of timestamps for each field.
""")
pitfalls([
    "Free data rarely documents its adjustments. Always check large moves by hand — two "
    "bad prints in this dataset were on the same day (2017-09-14) for three names, a "
    "typical vendor glitch.",
    "Yahoo-style data downloaded today only contains companies that still exist: the "
    "same survivorship problem, worse over longer histories.",
    "Filling missing prices forward creates fake zero returns and stale signals. We leave "
    "them missing.",
])
org_box("data")
