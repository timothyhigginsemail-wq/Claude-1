import numpy as np
import pandas as pd
import plotly.graph_objects as go
import streamlit as st

from common import (COLORS, G, HORIZONS, backtest, market, interpret, reading, terms, cost_controls, factor_rets, fmt_pct, grid,
                    ic_table, lag_of, org_box, pitfalls, placebo, portfolio_controls,
                    sample_note, show, style, technical)
from quantlab.portfolio.backtest import drawdown, performance
from quantlab.research import robustness as rb
from quantlab.research.pipeline import restrict
from quantlab.research.stats import block_bootstrap_sharpe, deflated_sharpe

spec, sample = st.session_state.spec, st.session_state.sample
st.title("8 · Performance evaluation")
st.markdown("Attractive backtests are cheap. This stage asks **how much of the result is "
            "skill, how much is risk we already know, and how much is luck from trying "
            "many variants**.")
sample_note(sample)
terms("sharpe_ci", "dsr", "alpha", "placebo", "walk_forward", "holdout")
pspec, cspec = portfolio_controls(), cost_controls()
bt = backtest(spec, pspec, cspec)
lag = bt.meta["lag"]
R = lambda s: restrict(s, sample, pspec.holding, lag)  # noqa: E731
g, n = R(bt.daily["gross"]), R(bt.daily["net"])

tabs = st.tabs(["Returns & risk", "Factor attribution", "Overfitting", "Walk-forward",
                "🔒 Holdout"])

with tabs[0]:
    pg, pn = performance(g), performance(n)
    tab = pd.DataFrame({"Gross": pg, "Net": pn}).T
    st.dataframe(tab[["ann_return", "ann_vol", "sharpe", "sortino", "max_drawdown", "calmar",
                      "hit_rate", "skew", "kurtosis"]].style.format(
        {"ann_return": "{:+.2%}", "ann_vol": "{:.2%}", "sharpe": "{:+.2f}", "sortino": "{:+.2f}",
         "max_drawdown": "{:.1%}", "calmar": "{:+.2f}", "hit_rate": "{:.1%}", "skew": "{:+.2f}",
         "kurtosis": "{:.1f}"}))
    lo, hi = block_bootstrap_sharpe(n, block=max(10, 2 * pspec.holding))
    st.metric("Net Sharpe, 95% block-bootstrap interval", f"{pn['sharpe']:+.2f}",
              delta=f"[{lo:+.2f}, {hi:+.2f}]", delta_color="off", help=G("sharpe_ci"))
    reading(interpret.sharpe(pn["sharpe"], lo, hi, net=True))
    st.caption("With ~4 years of daily data, a Sharpe ratio's uncertainty is roughly "
               "±1.0 — even a true Sharpe of 1 can look like 0 or 2.")
    dd = drawdown(n)
    fig = go.Figure(go.Scatter(x=dd.index, y=dd * 100, fill="tozeroy",
                               line=dict(color=COLORS["net"])))
    show(style(fig, 240, "Net drawdown (%)"))
    roll = n.rolling(126).mean() / n.rolling(126).std() * np.sqrt(252)
    fig = go.Figure(go.Scatter(x=roll.index, y=roll, line=dict(color=COLORS["gross"])))
    fig.add_hline(y=0, line_color="#999")
    show(style(fig, 240, "Rolling 6-month net Sharpe"))
    yr = pd.DataFrame({"gross": g, "net": n}).groupby(g.index.year).agg(
        lambda x: x.mean() * 252)
    yr["net Sharpe"] = n.groupby(n.index.year).apply(
        lambda x: x.mean() / x.std() * np.sqrt(252))
    st.markdown("**By calendar year (annualised)**")
    st.dataframe(yr.style.format({"gross": "{:+.2%}", "net": "{:+.2%}", "net Sharpe": "{:+.2f}"}))

with tabs[1]:
    st.markdown("Regress the strategy's daily **gross** returns on factor portfolios built "
                "with the same holding period and execution. The intercept (alpha) is the "
                "part not explained by these factors.")
    fr = factor_rets(spec, pspec.holding)
    fx = rb.factor_regression(g, fr.loc[g.index.min():g.index.max()])
    c1, c2, c3 = st.columns(3)
    c1.metric("Alpha (ann.)", fmt_pct(fx["alpha_annual"]), help=G("alpha"))
    c2.metric("Alpha t-stat", f"{fx['table'].loc['alpha', 't_nw']:+.2f}", help=G("t_stat"))
    reading(interpret.alpha(fx["alpha_annual"], fx["table"].loc["alpha", "t_nw"], fx["r2"]))
    c3.metric("R² (variance explained)", f"{fx['r2']:.0%}")
    t = fx["table"].copy()
    t["coef"] = t["coef"].where(t.index != "alpha", t["coef"] * 252)
    st.dataframe(t.style.format({"coef": "{:+.3f}", "t_nw": "{:+.2f}"}))
    st.caption("Alpha row is annualised; other rows are betas (exposure per unit of factor).")
    contrib = fx["factor_contrib_annual"]
    parts = pd.concat([contrib, pd.Series({"alpha": fx["alpha_annual"]})])
    fig = go.Figure(go.Bar(x=parts.index, y=parts.values * 100,
                           marker_color=[COLORS["accent"] if i == "alpha" else COLORS["neutral"]
                                         for i in parts.index]))
    show(style(fig, 260, f"Return attribution (% per year); total {fx['total_annual']:+.2%}"))
    st.caption("A large bar on 'rev5' or 'rev1' means the strategy is mostly harvesting "
               "short-term reversal — a well-known, crowded effect.")
    ffac = market().factors
    if ffac is not None:
        st.markdown("#### Official Fama-French factors")
        cols = ["Mkt_RF", "SMB", "HML", "RMW", "CMA", "MOM", "STREV"]
        ff = ffac[cols].dropna()
        fx2 = rb.factor_regression(g, ff.loc[g.index.min():g.index.max()])
        c1, c2, c3 = st.columns(3)
        c1.metric("Alpha vs FF (ann.)", fmt_pct(fx2["alpha_annual"]), help=G("alpha"))
        c2.metric("t-stat", f"{fx2['table'].loc['alpha', 't_nw']:+.2f}", help=G("t_stat"))
        c3.metric("R²", f"{fx2['r2']:.0%}")
        st.dataframe(fx2["table"].style.format({"coef": "{:+.3f}", "t_nw": "{:+.2f}"}))
        reading(interpret.alpha(fx2["alpha_annual"], fx2["table"].loc["alpha", "t_nw"], fx2["r2"]))
        st.caption("Factors from the Kenneth French Data Library (CRSP-based, all US stocks): "
                   "market, size, value, profitability, investment, momentum, short-term "
                   "reversal. They are close-to-close; with next-open execution the timing "
                   "differs by part of a day, so treat exposures as approximate.")

with tabs[2]:
    st.markdown("#### 1. How lucky could noise get?")
    with st.spinner():
        pt = placebo(spec, 200)
    ic = ic_table(spec, "research").loc[spec.horizon]
    fig = go.Figure(go.Histogram(x=pt, nbinsx=30, marker_color=COLORS["neutral"], name="Noise"))
    fig.add_vline(x=ic.t_nw, line_color=COLORS["net"], line_width=3,
                  annotation_text="your signal", annotation_position="top")
    show(style(fig, 260, f"t-stats of 200 random signals ({spec.horizon}-day IC, research sample)"))
    share = float(np.mean(np.abs(pt) >= abs(ic.t_nw)))
    st.markdown(f"**{share:.1%}** of pure-noise signals produced a |t| at least as large as "
                f"yours ({ic.t_nw:+.2f}). About {np.mean(np.abs(pt) > 2):.0%} of noise "
                "signals clear |t| > 2 — close to the 5% you'd expect if our standard "
                "errors are honest.")
    st.markdown("#### 2. The parameter grid you could have searched")
    ics, cfg = grid(spec)
    gs = rb.grid_summary(ics, cfg, "research", lag)
    family_mode = (gs["window"] == 0).all()
    if family_mode:
        from common import HYPOTHESES
        st.caption("This signal has fixed parameters, so the family of tests is the whole "
                   "signal library plus this signal.")
        hm = gs.pivot_table(index="lookback", columns="horizon", values="t_nw")
        hm.index = [HYPOTHESES[k].name if k in HYPOTHESES else f"★ {k}" for k in hm.index]
    else:
        hm = gs.pivot_table(index=["lookback", "window"], columns="horizon", values="t_nw")
        hm.index = [f"L={a}, w={b}" for a, b in hm.index]
    fig = go.Figure(go.Heatmap(z=hm.values, x=[f"{c}d" for c in hm.columns], y=hm.index,
                               colorscale="RdBu", zmid=0, text=np.round(hm.values, 1),
                               texttemplate="%{text}", showscale=False))
    show(style(fig, max(320, 26 * len(hm) + 60), "Newey-West t-stat of IC across the family of tests"))
    n_raw = int((gs.p_nw < 0.05).sum())
    n_holm = int((gs.p_holm < 0.05).sum())
    n_bh = int((gs.p_bh < 0.05).sum())
    st.markdown(f"Of **{len(gs)}** configurations, **{n_raw}** are 'significant' at 5% "
                f"individually, **{n_bh}** after Benjamini-Hochberg (false-discovery "
                f"control), and **{n_holm}** after Holm (family-wise control). A smooth "
                "region of similar t-stats is more trustworthy than an isolated hot cell.")
    st.dataframe(gs.sort_values("p_nw").head(8)[["mean_ic", "t_nw", "p_nw", "p_bh", "p_holm"]]
                 .style.format({"mean_ic": "{:+.4f}", "t_nw": "{:+.2f}", "p_nw": "{:.4f}",
                                "p_bh": "{:.3f}", "p_holm": "{:.3f}"}))
    st.markdown("#### 3. Deflated Sharpe ratio")
    n_trials = max(len(st.session_state.trials), len(gs))
    ds = deflated_sharpe(n, n_trials=n_trials)
    c1, c2, c3 = st.columns(3)
    c1.metric("Trials counted", n_trials)
    c2.metric("Sharpe needed to beat luck", f"{ds['benchmark_sharpe_annual']:.2f}")
    c3.metric("Deflated Sharpe (prob.)", f"{ds['dsr']:.2f}", help=G("dsr"))
    reading(interpret.dsr(ds["dsr"], n_trials))

with tabs[3]:
    st.markdown("Every quarter, pick the configuration with the best t-stat using **only "
                "past data** (purged), then trade it next quarter. This mimics what you "
                "would actually have done.")
    ics, cfg = grid(spec)
    wf = rb.walk_forward(ics, cfg, lag=lag, end=pd.Timestamp(market().holdout_start))
    gs = rb.grid_summary(ics, cfg, "research", lag)
    best = gs["t_nw"].abs().idxmax()
    c1, c2 = st.columns(2)
    c1.metric("Best in-sample config", best, delta=f"t = {gs.loc[best, 't_nw']:+.2f}",
              delta_color="off")
    c2.metric("Walk-forward OOS IC t-stat", f"{wf['oos_stats']['t_nw']:+.2f}",
              delta=f"mean IC {wf['oos_stats']['mean']:+.4f}", delta_color="off")
    oos = wf["oos_ic"].cumsum()
    best_ic = np.sign(gs.loc[best, "t_nw"]) * ics[best].loc[oos.index].fillna(0).cumsum()
    fig = go.Figure()
    fig.add_scatter(x=best_ic.index, y=best_ic, name="Best config chosen with hindsight",
                    line=dict(color=COLORS["neutral"], dash="dot"))
    fig.add_scatter(x=oos.index, y=oos, name="Walk-forward (real-time choice)",
                    line=dict(color=COLORS["net"]))
    show(style(fig, 280, "Cumulative IC"))
    st.markdown("The gap between the two lines is **selection optimism**: the part of the "
                "in-sample result that came from choosing parameters after seeing the data.")
    st.dataframe(wf["choices"].assign(test_start=lambda x: x.test_start.dt.date), hide_index=True)

with tabs[4]:
    st.markdown(f"The data from **{market().holdout_start}** onward have been excluded from every "
                "number above (including the purge of overlapping returns). Open it once, "
                "after freezing the specification.")
    if not st.session_state.holdout_unlocked:
        ok = st.checkbox("I have frozen my specification and will not tune it on what I see.")
        if st.button("🔓 Unlock holdout", disabled=not ok, type="primary"):
            st.session_state.holdout_unlocked = True
            st.session_state.holdout_spec = spec
            st.rerun()
    else:
        st.session_state.holdout_views += 1
        frozen = st.session_state.get("holdout_spec", spec)
        if frozen != spec:
            st.warning("The specification has changed since unlocking — these numbers are no "
                       "longer a clean out-of-sample test.")
        ih, ir = ic_table(spec, "holdout"), ic_table(spec, "research")
        cmp = pd.DataFrame({"research IC": ir.mean_ic, "research t": ir.t_nw,
                            "holdout IC": ih.mean_ic, "holdout t": ih.t_nw})
        st.dataframe(cmp.style.format("{:+.4f}"))
        hn = restrict(bt.daily["net"], "holdout", pspec.holding, lag)
        hg = restrict(bt.daily["gross"], "holdout", pspec.holding, lag)
        c1, c2 = st.columns(2)
        c1.metric("Holdout gross Sharpe", f"{performance(hg)['sharpe']:+.2f}")
        c2.metric("Holdout net Sharpe", f"{performance(hn)['sharpe']:+.2f}")
        st.caption("A holdout of a few years can catch large failures but cannot confirm a "
                   "modest edge.")

technical(r"""
**Block bootstrap.** Resample the daily return series in contiguous blocks (length
max(10, 2H) days) to preserve autocorrelation from overlapping positions; recompute the
Sharpe 1,000 times; report the 2.5–97.5 percentiles.

**Deflated Sharpe ratio** (Bailey & López de Prado 2014). With N trials whose Sharpe
ratios have variance V, the expected maximum Sharpe under zero skill is approximately
$\sqrt V\left[(1-\gamma)\Phi^{-1}(1-\tfrac1N)+\gamma\Phi^{-1}(1-\tfrac1{Ne})\right]$.
DSR is the probability that the observed Sharpe exceeds that benchmark, adjusting for
sample length, skewness and kurtosis. We assume V equals the sampling variance of a
zero-skill Sharpe (1/T per day) — conservative only if your trials were nearly independent.

**Holm vs. Benjamini-Hochberg.** Holm controls the probability of *any* false positive
among the m tests (strict). BH controls the expected *fraction* of false positives among
the discoveries (lenient, suited to screening).

**Walk-forward purge.** An IC observed on date t uses returns up to t+L+h; it may only be
used for selection if t+L+h is before the test period begins.

**Factor regression** uses Newey-West (HAC) standard errors on daily data; factor
portfolios are top-30% minus bottom-30% equal-weighted, same holding and timing.
""")
pitfalls([
    "Every slider you moved on earlier pages was a trial. The counter in the sidebar "
    "feeds the deflated Sharpe ratio — be honest with yourself about it.",
    "Five years contains one market regime of note (2015–16 sell-off, low-vol 2017). "
    "Robustness across regimes cannot really be established here.",
    "Opening the holdout repeatedly turns it into more in-sample data.",
])
org_box("evaluate")
