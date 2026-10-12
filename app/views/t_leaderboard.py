import numpy as np
import pandas as pd
import plotly.graph_objects as go
import streamlit as st

from common import (COLORS, G, HYPOTHESES, interpret, lag_of, library_ics, market, reading,
                    sample_note, show, style, terms, uni)
from quantlab.research.leaderboard import best_of_all, summarize
from quantlab.research.returns import forward_returns
from quantlab.research.stats import rank_ic
from quantlab.signals.formula import evaluate

spec, sample = st.session_state.spec, st.session_state.sample
st.title("🏆 Signal leaderboard")
st.markdown("Every published signal in the library, plus every hypothesis you have locked in "
            "the Signal lab, tested the same way on the same data — with significance "
            "**adjusted for how many things were tried**.")
terms("ic", "stars", "holm", "bh", "reality_check")
sample_note(sample)

lib = library_ics(spec.min_price, spec.liquidity_pct, spec.execution)
ics = lib.copy()
names = {k: h.name for k, h in HYPOTHESES.items()}
fams = {k: h.family for k, h in HYPOTHESES.items()}


@st.cache_data(show_spinner="Scoring your hypotheses…", max_entries=32)
def custom_ics(formula, min_price, liq, execution):
    from quantlab.research.pipeline import ResearchSpec
    m = market()
    s = evaluate(formula, m)
    u = uni(ResearchSpec(min_price=min_price, liquidity_pct=liq))
    return pd.DataFrame({f"@{h}": rank_ic(s, forward_returns(m, h, execution), u)
                         for h in (1, 5, 10, 20)})


for i, c in enumerate(st.session_state.get("lab_cards", [])):
    if not c.get("formula"):
        continue
    key = f"my{i}"
    ci = custom_ics(c["formula"], spec.min_price, spec.liquidity_pct, spec.execution)
    for col in ci:
        ics[f"{key}{col}"] = ci[col]
    names[key] = f"★ {c['name']}"
    fams[key] = "Mine"

lag = lag_of(spec)
tab = summarize(ics, names, fams, sample, lag)
n_sig, n_tests = len(tab), tab.attrs["n_tests"]
rc = best_of_all(ics, 5, sample, lag)

c1, c2, c3 = st.columns(3)
c1.metric("Signals tested", n_sig)
c2.metric("Tests (signal × horizon)", n_tests, help=G("holm"))
c3.metric("Survive Holm adjustment", int((tab["p_holm"] < 0.05).sum()), help=G("holm"))
c1, c2 = st.columns(2)
c1.metric("Best |t| at 5 days", f"{rc['max_t']:.2f}", help=G("reality_check"))
c2.metric("…luck would give (95th pct.)", f"{rc['null_95']:.2f}", help=G("reality_check"))
reading(interpret.reality_check(rc["p"], rc["n"]))

st.subheader("The table")
fam_opts = sorted(set(tab["family"]))
pick = st.pills("Families", fam_opts, selection_mode="multi", default=fam_opts, key="lb_fam")
view = tab[tab["family"].isin(pick or fam_opts)]
cols = ["signal", "family", "IC 1d", "IC 5d", "IC 20d", "best_h", "best_t", "stars_raw",
        "p_holm", "stars_adj"]
st.dataframe(view[cols], hide_index=True, height=min(38 * (len(view) + 1), 620), column_config={
    "signal": st.column_config.TextColumn("Signal", pinned=True),
    "IC 1d": st.column_config.NumberColumn(format="%+.4f", help=G("ic")),
    "IC 5d": st.column_config.NumberColumn(format="%+.4f", help=G("ic")),
    "IC 20d": st.column_config.NumberColumn(format="%+.4f", help=G("ic")),
    "best_h": st.column_config.NumberColumn("Best horizon", format="%dd",
                                            help="The horizon with the largest |t|. Choosing "
                                                 "it after looking is itself a test, which "
                                                 "the adjusted columns account for."),
    "best_t": st.column_config.NumberColumn("t at best", format="%+.2f", help=G("t_stat")),
    "stars_raw": st.column_config.TextColumn("Raw ★", help=G("stars")),
    "p_holm": st.column_config.NumberColumn("Adjusted p", format="%.3f", help=G("holm")),
    "stars_adj": st.column_config.TextColumn("Adjusted ★", help=G("stars")),
})
st.caption("★ p<0.10, ★★ p<0.05, ★★★ p<0.01. Raw stars treat each cell as the only test; "
           f"adjusted stars account for all {n_tests} tests on this page.")

st.subheader("t-stats across horizons")
hs = [1, 5, 10, 20]
z = view[[f"t {h}d" for h in hs]].values
fig = go.Figure(go.Heatmap(z=z, x=[f"{h}d" for h in hs], y=view["signal"], colorscale="RdBu",
                           zmid=0, zmin=-4, zmax=4, text=np.round(z, 1), texttemplate="%{text}",
                           showscale=False))
fig.update_yaxes(autorange="reversed")
show(style(fig, 28 * len(view) + 80))
st.caption("Blue = predicted direction (positive IC as oriented by the paper). Notice how few "
           "cells clear ±2, and that the famous effects are weak in 2013–16 large caps.")

st.subheader("The signals")
for fam in fam_opts:
    if fam == "Mine":
        continue
    with st.expander(f"{fam} ({sum(1 for h in HYPOTHESES.values() if h.family == fam)})"):
        for k, h in HYPOTHESES.items():
            if h.family != fam:
                continue
            st.markdown(f"**{h.name}** — {h.statement}  \n*Why it might work:* {h.mechanism}  \n"
                        f"*Source:* {h.reference or '—'} · *Published direction:* {h.predicted_sign}")
st.info("Published effects often shrink after publication and differ across samples (McLean "
        "& Pontiff, 2016). A library signal failing here is not proof it never worked — this "
        "sample is short, large-cap and survivorship-biased.")
