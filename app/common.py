"""Shared state, cached computations and UI helpers for the Streamlit app."""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
import plotly.graph_objects as go  # noqa: E402
import streamlit as st  # noqa: E402

from quantlab.config import HOLDOUT_START  # noqa: E402
from quantlab.content.org import STAGES  # noqa: E402
from quantlab.data.loader import load_market  # noqa: E402
from quantlab.portfolio.backtest import CostSpec, run_backtest  # noqa: E402
from quantlab.portfolio.construct import PortfolioSpec  # noqa: E402
from quantlab.research import analysis as an  # noqa: E402
from quantlab.research import robustness as rb  # noqa: E402
from quantlab.research.factors import characteristics  # noqa: E402
from quantlab.research.pipeline import (  # noqa: E402
    ResearchSpec, build_signal, build_universe, fm_progression,
)
from quantlab.research.returns import EXECUTION_LABELS, execution_params  # noqa: E402
from quantlab.research.stats import rank_ic  # noqa: E402
from quantlab.signals.library import HYPOTHESES  # noqa: E402

HORIZONS = (1, 2, 5, 10, 20)
COLORS = {"gross": "#2563eb", "net": "#dc2626", "long": "#059669", "short": "#d97706",
          "neutral": "#6b7280", "accent": "#7c3aed"}
SAMPLE_LABELS = {"research": "Research sample (2013–2016)", "full": "Full sample (2013–2018)",
                 "holdout": "Holdout vault (2017–2018)"}


# ---------------------------------------------------------------- state
def _init_state():
    ss = st.session_state
    ss.setdefault("trials", set())
    ss.setdefault("holdout_unlocked", False)
    ss.setdefault("holdout_views", 0)
    ss.setdefault("p", {})          # persisted page-level controls


def persist(widget, label, key, default, **kw):
    """A widget whose value survives page switches (Streamlit forgets widget state
    for widgets not drawn on the current page)."""
    _init_state()
    p = st.session_state["p"]
    val = p.get(key, default)
    if widget in (st.selectbox, st.radio):
        opts = list(kw["options"])
        kw["index"] = opts.index(val) if val in opts else 0
        out = widget(label, key=f"w_{key}", **kw)
    elif widget in (st.segmented_control, st.pills):
        out = widget(label, key=f"w_{key}", default=val, **kw)
        if out is None:
            out = val
    elif widget is st.toggle or widget is st.checkbox:
        out = widget(label, value=val, key=f"w_{key}", **kw)
    else:
        out = widget(label, value=val, key=f"w_{key}", **kw)
    p[key] = out
    return out


def sidebar_spec() -> tuple[ResearchSpec, str]:
    """Global research specification, shown in the sidebar on every page."""
    _init_state()
    with st.sidebar:
        st.markdown("### Research specification")
        keys = list(HYPOTHESES)
        hyp = persist(st.selectbox, "Hypothesis", "hyp", "abnormal_volume", options=keys,
                      format_func=lambda k: HYPOTHESES[k].name)
        c1, c2 = st.columns(2)
        with c1:
            lookback = persist(st.selectbox, "Baseline days", "lookback", 20,
                               options=[5, 10, 20, 60, 120],
                               help="Days of the stock's own history that define 'normal' volume.")
        with c2:
            window = persist(st.selectbox, "Recent window", "window", 1, options=[1, 2, 5, 10, 20],
                             help="Days averaged to measure 'recent' volume (or return).")
        horizon = persist(st.selectbox, "Prediction horizon (days)", "horizon", 5,
                          options=list(HORIZONS))
        execution = persist(st.selectbox, "Execution timing", "execution", "open_t1",
                            options=list(EXECUTION_LABELS), format_func=EXECUTION_LABELS.get)
        neutral = persist(st.selectbox, "Signal neutralisation", "neutral", "none",
                          options=["none", "sector", "factors"],
                          format_func={"none": "None (raw signal)", "sector": "Sector-demeaned",
                                       "factors": "Residual vs. factors + sector"}.get)
        samples = ["research", "full"] + (["holdout"] if st.session_state.holdout_unlocked else [])
        sample = persist(st.selectbox, "Sample", "sample", "research", options=samples,
                         format_func=SAMPLE_LABELS.get)
        with st.expander("Universe filters"):
            min_price = persist(st.number_input, "Min price ($)", "min_price", 5.0,
                                min_value=0.0, max_value=100.0, step=1.0)
            liq = persist(st.slider, "Drop least liquid (%)", "liq", 0, min_value=0, max_value=50,
                          step=10)
        spec = ResearchSpec(hypothesis=hyp, lookback=int(lookback), window=int(window),
                            horizon=int(horizon), execution=execution,
                            min_price=float(min_price), liquidity_pct=liq / 100.0,
                            neutralization=neutral)
        trial = (hyp, spec.signal_params().__repr__(), horizon, execution, neutral)
        st.session_state.trials.add(trial)
        n = len(st.session_state.trials)
        st.caption(f"🧪 **{n}** distinct configurations viewed this session. Every one "
                   "counts as a trial in the multiple-testing corrections.")
        if not st.session_state.holdout_unlocked:
            st.caption(f"🔒 Holdout ({HOLDOUT_START[:4]}+) is locked.")
    return spec, sample


def portfolio_controls(prefix: str = "") -> PortfolioSpec:
    p_ = st.session_state.get("p", {})
    return PortfolioSpec(
        scheme=p_.get("scheme", "quantile"), quantile=p_.get("quantile", 0.2),
        holding=int(p_.get("holding", p_.get("horizon", 5))), overlap=p_.get("overlap", True),
        gross=2.0, max_weight=p_.get("max_weight", 2.0) / 100.0,
        sector_neutral=p_.get("sector_neutral", False), beta_neutral=p_.get("beta_neutral", False))


def cost_controls() -> CostSpec:
    p_ = st.session_state.get("p", {})
    return CostSpec(half_spread_bps=p_.get("half_spread", 3.0), impact_coef=p_.get("impact", 0.7),
                    aum=p_.get("aum", 100.0) * 1e6, borrow_bps_annual=p_.get("borrow", 30.0))


# ---------------------------------------------------------------- cached data
@st.cache_resource(show_spinner="Loading market data…")
def market():
    return load_market()


@st.cache_resource(show_spinner=False)
def universe(min_price: float, liq: float):
    return build_universe(market(), ResearchSpec(min_price=min_price, liquidity_pct=liq))


@st.cache_resource(show_spinner="Computing factor exposures…")
def chars(min_price: float, liq: float):
    return characteristics(market(), universe(min_price, liq))


def uni(spec: ResearchSpec):
    return universe(spec.min_price, spec.liquidity_pct)


def ch(spec: ResearchSpec):
    return chars(spec.min_price, spec.liquidity_pct)


@st.cache_resource(show_spinner="Computing signal…", max_entries=12)
def signal(spec: ResearchSpec):
    return build_signal(market(), spec, uni(spec), ch(spec) if spec.neutralization == "factors" else None)


@st.cache_data(show_spinner="Testing predictive power…", max_entries=32)
def ic_table(spec: ResearchSpec, sample: str):
    return an.ic_by_horizon(market(), signal(spec), uni(spec), HORIZONS, spec.execution, sample)


@st.cache_data(show_spinner=False, max_entries=32)
def ic_series(spec: ResearchSpec, horizon: int):
    from quantlab.research.returns import forward_returns
    return rank_ic(signal(spec), forward_returns(market(), horizon, spec.execution), uni(spec))


@st.cache_data(show_spinner="Sorting stocks into quantiles…", max_entries=32)
def quantiles(spec: ResearchSpec, sample: str, n_q: int = 5):
    return an.quantile_spreads(market(), signal(spec), uni(spec), spec.horizon, n_q,
                               spec.execution, sample)


@st.cache_data(show_spinner="Measuring signal decay…", max_entries=16)
def decay(spec: ResearchSpec, sample: str):
    return an.ic_decay(market(), signal(spec), uni(spec), 20, spec.execution, sample)


@st.cache_data(show_spinner="Double-sorting on past returns…", max_entries=16)
def double_sort(spec: ResearchSpec, sample: str, cond_window: int):
    from quantlab.signals.library import past_return
    return an.double_sort(market(), signal(spec), past_return(market(), cond_window), uni(spec),
                          spec.horizon, 3, spec.execution, sample)


@st.cache_resource(show_spinner=False)
def regimes(min_price: float, liq: float):
    return an.regime_labels(market(), universe(min_price, liq))


@st.cache_data(show_spinner="Running Fama-MacBeth regressions…", max_entries=16)
def fm_table(spec: ResearchSpec, sample: str):
    return fm_progression(market(), signal(spec), uni(spec), ch(spec), spec.horizon,
                          spec.execution, sample)


@st.cache_resource(show_spinner="Backtesting portfolio…", max_entries=8)
def backtest(spec: ResearchSpec, pspec: PortfolioSpec, cspec: CostSpec):
    return run_backtest(market(), signal(spec), uni(spec), pspec, cspec, spec.execution,
                        beta=ch(spec)["beta"])


@st.cache_data(show_spinner="Building factor portfolios…", max_entries=8)
def factor_rets(spec: ResearchSpec, holding: int):
    return rb.factor_returns(market(), ch(spec), uni(spec), holding, spec.execution)


@st.cache_data(show_spinner="Testing the whole parameter grid (≈10 s)…", max_entries=8)
def grid(spec: ResearchSpec):
    key = spec.hypothesis
    if key in ("placebo",):
        key = "abnormal_volume"
    ics, cfg = rb.grid_ic(market(), key, uni(spec), execution=spec.execution)
    return ics, cfg


@st.cache_data(show_spinner="Simulating noise signals (≈15 s)…", max_entries=4)
def placebo(spec: ResearchSpec, n_sims: int = 200):
    return rb.placebo_tstats(market(), uni(spec), spec.horizon, n_sims, spec.execution, "research")


# ---------------------------------------------------------------- UI helpers
def page_setup(title: str, stage: str | None = None, intro: str = ""):
    st.title(title)
    if intro:
        st.markdown(intro)


def technical(md: str, title: str = "Technical details"):
    with st.expander(f"🔬 {title}"):
        st.markdown(md)


def pitfalls(items: list[str]):
    with st.expander("⚠️ What could mislead you here"):
        for it in items:
            st.markdown(f"- {it}")


def org_box(stage: str):
    teams, evidence, reject = STAGES[stage]
    with st.expander("🏛️ Inside a systematic fund"):
        st.markdown(f"**Who is involved:** {', '.join(teams)}")
        st.markdown("**Evidence they demand**")
        for e in evidence:
            st.markdown(f"- {e}")
        st.markdown("**What gets a project rejected at this stage**")
        for r in reject:
            st.markdown(f"- {r}")
        st.caption("[Public] = widely described in public sources. [Illustrative] = our "
                   "teaching assumption. No specific firm's process is implied.")


def style(fig: go.Figure, height: int = 320, title: str | None = None, **kw) -> go.Figure:
    fig.update_layout(height=height, margin=dict(l=8, r=8, t=40 if title else 16, b=8),
                      title=dict(text=title, font=dict(size=13)) if title else None,
                      legend=dict(orientation="h", yanchor="top", y=-0.12, x=0,
                                  font=dict(size=11)),
                      hovermode="x unified", template="plotly_white", **kw)
    return fig


def show(fig: go.Figure):
    st.plotly_chart(fig, width="stretch", config={"displayModeBar": False})


def fmt_pct(x, d=1):
    return "–" if x is None or not np.isfinite(x) else f"{x * 100:.{d}f}%"


def fmt_num(x, d=2):
    return "–" if x is None or not np.isfinite(x) else f"{x:.{d}f}"


def tstat_badge(t: float) -> str:
    if not np.isfinite(t):
        return "–"
    a = abs(t)
    tag = "strong" if a >= 3 else ("significant" if a >= 2 else ("weak" if a >= 1 else "noise"))
    return f"{t:+.2f} ({tag})"


def sample_note(sample: str):
    if sample == "holdout":
        st.warning("You are looking at the HOLDOUT. Every look reduces its value as an "
                   "independent test — do not tune parameters on what you see here.")
    elif sample == "full":
        st.info("Full sample includes the holdout period. Use for description only, not "
                "for parameter choice.")


def lag_of(spec: ResearchSpec) -> int:
    return execution_params(spec.execution)[1]
