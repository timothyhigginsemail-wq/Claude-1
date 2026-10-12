import numpy as np
import pandas as pd
import streamlit as st

from common import (HYPOTHESES, backtest, cost_controls, fm_table, grid, ic_series, ic_table,
                    lag_of, org_box, portfolio_controls, technical)
from quantlab.config import HOLDOUT_START
from quantlab.portfolio.backtest import performance
from quantlab.research import robustness as rb
from quantlab.research.analysis import sample_mask
from quantlab.research.decision import FAIL, PASS, evaluate
from quantlab.research.pipeline import restrict
from quantlab.research.stats import deflated_sharpe, holm

spec = st.session_state.spec
st.title("9 · Research decision")
st.markdown("The decision rules below were fixed **before** looking at results. Every "
            "number is recomputed from the research sample (2013–2016) for the "
            "specification in the sidebar.")
st.markdown(f"**Hypothesis:** {HYPOTHESES[spec.hypothesis].name} · lookback {spec.lookback} · "
            f"window {spec.window} · horizon {spec.horizon}d · {spec.execution} · "
            f"neutralisation: {spec.neutralization}")

h, lag = spec.horizon, lag_of(spec)
pspec, cspec = portfolio_controls(), cost_controls()
with st.spinner("Assembling the evidence…"):
    ic = ic_table(spec, "research").loc[h]
    s = ic_series(spec, h)
    s = s[sample_mask(s.index, "research", h, lag)]
    by_year = s.groupby(s.index.year).mean()
    sign = np.sign(ic.mean_ic) or 1
    fm = fm_table(spec, "research")
    ics, cfg = grid(spec)
    gs = rb.grid_summary(ics, cfg, "research", lag)
    key = f"lb={spec.lookback} w={spec.window} h={h}"
    if key in gs.index and spec.neutralization == "none":
        p_holm = float(gs.loc[key, "p_holm"])
    else:  # current spec is outside the grid: add it as one more test
        p_holm = float(holm(np.append(gs["p_nw"].values, ic.p_nw))[-1])
    wf = rb.walk_forward(ics, cfg, lag=lag, end=pd.Timestamp(HOLDOUT_START))
    bt = backtest(spec, pspec, cspec)
    g = restrict(bt.daily["gross"], "research", pspec.holding, lag)
    n = restrict(bt.daily["net"], "research", pspec.holding, lag)
    to = restrict(bt.daily["turnover"], "research", pspec.holding, lag).mean()
    tc = restrict(bt.daily["trading_cost"], "research", pspec.holding, lag).mean()
    n_trials = max(len(st.session_state.trials), len(gs))
    holdout = None
    if st.session_state.holdout_unlocked:
        ho = ic_table(spec, "holdout").loc[h]
        holdout = {"mean_ic": ho.mean_ic, "t_ic": ho.t_nw}
    ev = {
        "t_ic": ic.t_nw, "mean_ic": ic.mean_ic,
        "years_same_sign": int((np.sign(by_year) == sign).sum()), "n_years": len(by_year),
        "p_holm": p_holm,
        "t_wf_oos": wf["oos_stats"]["t_nw"], "net_sharpe": performance(n)["sharpe"],
        "breakeven_bps": g.mean() / to * 1e4 if to > 0 else np.nan,
        "assumed_cost_bps": tc / to * 1e4 if to > 0 else np.nan,
        "dsr": deflated_sharpe(n, n_trials)["dsr"], "holdout": holdout,
    }
    # FM t, signed so that the rule also checks the direction matches the raw IC.
    ev["t_fm_full"] = fm.iloc[-1].t_nw if np.sign(fm.iloc[-1].coef_bps) == sign else -abs(fm.iloc[-1].t_nw)
    res = evaluate(ev)

color = {"REJECT": "error", "REVISE": "warning", "ADVANCE": "success"}
kind = next(v for k, v in color.items() if res["verdict"].startswith(k))
getattr(st, kind)(f"### Verdict: {res['verdict']}\n{res['reason']}")

icon = {PASS: "✅", FAIL: "❌"}
for c in res["criteria"]:
    with st.expander(f"{icon.get(c.status, '❔')} {c.name} — {c.value}"):
        st.markdown(f"**Question.** {c.question}")
        st.markdown(f"**Rule.** {c.threshold}")
        st.markdown(f"**Why it matters.** {c.why}")

st.subheader("What this research establishes")
est = [f"On 2013–2016 S&P 500 survivors, the {h}-day rank IC of this specification is "
       f"{ic.mean_ic:+.4f} (Newey-West t = {ic.t_nw:+.2f}).",
       f"Its sign agrees with the full-period average in {ev['years_same_sign']} of "
       f"{ev['n_years']} years.",
       f"With all available controls, the Fama-MacBeth coefficient is "
       f"{fm.iloc[-1].coef_bps:+.2f} bps per s.d. (t = {fm.iloc[-1].t_nw:+.2f}).",
       f"Choosing parameters in real time (walk-forward) gave an out-of-sample IC t of "
       f"{ev['t_wf_oos']:+.2f}.",
       f"As a {pspec.holding}-day long/short portfolio at ${cspec.aum / 1e6:,.0f}m, the "
       f"net Sharpe is {ev['net_sharpe']:+.2f}, with break-even cost "
       f"{ev['breakeven_bps']:.1f} bps vs. {ev['assumed_cost_bps']:.1f} bps modelled."]
for e in est:
    st.markdown(f"- {e}")

st.subheader("What remains uncertain")
for u in [
    "Whether the result holds on the full, survivorship-free universe (delisted names "
    "are missing; their high-volume collapses are exactly the cases that matter).",
    "Whether the volume effect is distinct from earnings announcements and other news "
    "events — we have no event dates to separate them.",
    "True trading costs: spreads are assumed, not measured; opening-auction costs differ.",
    "Stability across regimes: 4 research years is too short to test 2008-type markets.",
    "Interaction with value, quality and other fundamental factors we cannot build here.",
]:
    st.markdown(f"- {u}")

st.subheader("Recommended next steps")
for x in [
    "Pre-register a *revised* hypothesis based on a mechanism (e.g. 'high-volume losers "
    "without news reverse'), not on the best cell of the grid.",
    "Obtain survivorship-free daily data (e.g. CRSP via WRDS, or a commercial vendor) "
    "and earnings dates; replicate this exact pipeline.",
    "Test the signal as a *conditioning variable* for short-term reversal rather than "
    "as a standalone strategy.",
    "Only after replication: paper-trade with pre-defined kill criteria.",
]:
    st.markdown(f"- {x}")

technical("""
**Why a rule-based scorecard?** It forces the decision to follow from evidence fixed in
advance, so we cannot rationalise a pleasing backtest after the fact. The thresholds are
illustrative house rules (see `quantlab/research/decision.py`); a real firm sets its own
and adds judgement — e.g. a modest standalone signal can still be valuable if it is
uncorrelated with the existing book.

**Verdict logic.** No statistical evidence → reject. Evidence that fails robustness →
revise the *hypothesis*. Robust but unprofitable → revise the *implementation*. All pass →
advance to replication on better data. The data-adequacy criterion always fails on this
dataset, which is why 'deploy' is not an available verdict.
""")
org_box("decide")
