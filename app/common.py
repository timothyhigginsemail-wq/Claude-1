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

from quantlab.config import DATASETS, DEFAULT_DATASET, holdout_for  # noqa: E402
from quantlab.content import interpret  # noqa: E402,F401
from quantlab.content.glossary import GLOSSARY, help_text, stars  # noqa: E402,F401
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

# ---------------------------------------------------------------- tap-to-explain
# Streamlit's built-in `help=` tooltips open on HOVER, which phones don't have. Every
# metric's help text is instead shown behind a tappable "ⓘ Explain" button, and a
# table's column help behind one "ⓘ What do the columns mean?" button.
from streamlit.delta_generator import DeltaGenerator as _DG  # noqa: E402

_orig_metric = _DG.metric
_orig_dataframe = _DG.dataframe


def _explain(dg, text: str, label: str = "ⓘ Explain"):
    with dg.popover(label, type="tertiary"):
        st.markdown(text.replace("$", "\\$"))      # '$' would otherwise start maths


def _metric(self, label, value, *args, help=None, **kwargs):
    out = _orig_metric(self, label, value, *args, **kwargs)
    if help:
        _explain(self, help)
    return out


def _dataframe(self, data=None, *args, column_config=None, **kwargs):
    if column_config:
        notes = []
        for col, cfg in column_config.items():
            h = cfg.get("help") if isinstance(cfg, dict) else None
            if h:
                name = cfg.get("label") or col
                notes.append(f"##### {name}\n{h}")
                cfg = dict(cfg)
                cfg.pop("help")
                column_config = {**column_config, col: cfg}
        if notes:
            _explain(self, "\n\n---\n\n".join(notes), "ⓘ What do the columns mean?")
    return _orig_dataframe(self, data, *args, column_config=column_config, **kwargs)


if not getattr(_DG, "_tap_explain", False):
    _DG.metric, _DG.dataframe, _DG._tap_explain = _metric, _dataframe, True
    st.metric = lambda *a, **k: _metric(st._main, *a, **k)
    st.dataframe = lambda *a, **k: _dataframe(st._main, *a, **k)

HORIZONS = (1, 2, 5, 10, 20)
COLORS = {"gross": "#2563eb", "net": "#dc2626", "long": "#059669", "short": "#d97706",
          "neutral": "#6b7280", "accent": "#7c3aed"}
def periods(ds: str | None = None) -> dict:
    from quantlab.config import PERIODS
    return PERIODS[ds or current_dataset()]


class _SampleLabels(dict):
    """Sample names that follow the selected dataset."""
    def __getitem__(self, k):
        p = periods()
        return {"research": f"Research sample ({p['research']})",
                "full": f"Full sample ({p['full']})",
                "holdout": f"Holdout vault ({p['holdout']})"}[k]

    def get(self, k, default=None):
        return self[k]


SAMPLE_LABELS = _SampleLabels()


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
    help_md = kw.pop("help", None)          # shown via a tappable button, not a hover tooltip
    p = st.session_state["p"]
    val = p.get(key, default)
    if "options" in kw:
        opts = list(kw["options"])
        if val not in opts:          # e.g. a date outside the newly chosen sample
            val = default if default in opts else opts[0]
    if widget in (st.selectbox, st.radio):
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
    if help_md:
        _explain(st, help_md, f"ⓘ About “{label}”")
    return out


def sidebar_spec() -> tuple[ResearchSpec, str]:
    """Global research specification, shown in the sidebar on every page."""
    _init_state()
    with st.sidebar:
        st.markdown("### Research specification")
        ds = persist(st.selectbox, "Dataset", "dataset", DEFAULT_DATASET, options=list(DATASETS),
                     format_func=lambda k: DATASETS[k]["label"],
                     help="v3 (default): 2005–2026, 627 stocks, total returns, earnings dates "
                          "and fundamentals. v1: the original 2013–2018 data, kept for "
                          "comparison.")
        keys = list(HYPOTHESES)
        custom = st.session_state["p"].get("custom_formula")
        if custom:
            keys = ["custom"] + keys
        cname = st.session_state["p"].get("custom_name", "custom")
        label = (lambda k: f"★ My signal: {cname}"
                 if k == "custom" else f"{HYPOTHESES[k].family} · {HYPOTHESES[k].name}")
        hyp = persist(st.selectbox, "Hypothesis", "hyp", "abnormal_volume", options=keys,
                      format_func=label,
                      help="Pick any library signal, or build your own in 🧪 Signal lab.")
        tunable = hyp != "custom" and HYPOTHESES[hyp].tunable
        p_ = st.session_state["p"]
        if tunable:
            c1, c2 = st.columns(2)
            with c1:
                lookback = persist(st.selectbox, "Baseline days", "lookback", 20,
                                   options=[5, 10, 20, 60, 120],
                                   help="Days of the stock's own history that define 'normal' "
                                        "volume.")
            with c2:
                window = persist(st.selectbox, "Recent window", "window", 1,
                                 options=[1, 2, 5, 10, 20],
                                 help="Days averaged to measure 'recent' volume (or return).")
        else:
            lookback, window = p_.get("lookback", 20), p_.get("window", 1)
            st.caption("Parameters are fixed by the formula or the original paper — "
                       "changing them would be a new hypothesis.")
        horizon = persist(st.selectbox, "Prediction horizon (days)", "horizon", 5,
                          options=list(HORIZONS),
                          help="How many trading days ahead the signal tries to predict.")
        execution = persist(st.selectbox, "Execution timing", "execution", "open_t1",
                            options=list(EXECUTION_LABELS), format_func=EXECUTION_LABELS.get,
                            help=help_text("lookahead"))
        neutral = persist(st.selectbox, "Signal neutralisation", "neutral", "none",
                          options=["none", "sector", "factors"],
                          format_func={"none": "None (raw signal)", "sector": "Sector-demeaned",
                                       "factors": "Residual vs. factors + sector"}.get)
        flip = persist(st.toggle, "Flip direction (long LOW signal)", "flip", False,
                       help="Use when the evidence says the relationship is negative. "
                            "Choosing the sign after seeing the data is itself a trial.")
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
                            neutralization=neutral, direction=-1 if flip else 1,
                            formula=custom if hyp == "custom" else "", dataset=ds)
        trial = (ds, hyp, spec.signal_params().__repr__(), spec.formula, horizon, execution,
                 neutral, flip)
        st.session_state.trials.add(trial)
        n = len(st.session_state.trials)
        st.caption(f"🧪 **{n}** distinct configurations viewed this session. Every one "
                   "counts as a trial in the multiple-testing corrections.")
        persist(st.toggle, "Plain-English readings", "plain", True,
                help="Show a short interpretation under each result.")
        if not st.session_state.holdout_unlocked:
            st.caption(f"🔒 Holdout ({DATASETS[ds]['holdout'][:4]}+) is locked.")
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
def current_dataset() -> str:
    return st.session_state.get("p", {}).get("dataset", DEFAULT_DATASET)


@st.cache_resource(show_spinner="Loading market data (≈10 s the first time)…", max_entries=2)
def _market(ds: str):
    return load_market(ds)


def market(ds: str | None = None):
    return _market(ds or current_dataset())


@st.cache_resource(show_spinner=False, max_entries=4)
def universe(min_price: float, liq: float, ds: str | None = None):
    ds = ds or current_dataset()
    return build_universe(market(ds), ResearchSpec(min_price=min_price, liquidity_pct=liq,
                                                   dataset=ds))


@st.cache_resource(show_spinner="Computing factor exposures…", max_entries=2)
def chars(min_price: float, liq: float, ds: str | None = None):
    ds = ds or current_dataset()
    return characteristics(market(ds), universe(min_price, liq, ds))


def uni(spec: ResearchSpec):
    return universe(spec.min_price, spec.liquidity_pct, spec.dataset)


def ch(spec: ResearchSpec):
    return chars(spec.min_price, spec.liquidity_pct, spec.dataset)


@st.cache_resource(show_spinner="Computing signal…", max_entries=6)
def signal(spec: ResearchSpec):
    return build_signal(market(spec.dataset), spec, uni(spec), ch(spec) if spec.neutralization == "factors" else None)


@st.cache_data(show_spinner="Testing predictive power…", max_entries=32)
def ic_table(spec: ResearchSpec, sample: str):
    return an.ic_by_horizon(market(spec.dataset), signal(spec), uni(spec), HORIZONS, spec.execution, sample)


@st.cache_data(show_spinner=False, max_entries=32)
def ic_series(spec: ResearchSpec, horizon: int):
    from quantlab.research.returns import forward_returns
    return rank_ic(signal(spec), forward_returns(market(spec.dataset), horizon, spec.execution), uni(spec))


@st.cache_data(show_spinner="Sorting stocks into quantiles…", max_entries=32)
def quantiles(spec: ResearchSpec, sample: str, n_q: int = 5):
    return an.quantile_spreads(market(spec.dataset), signal(spec), uni(spec), spec.horizon, n_q,
                               spec.execution, sample)


@st.cache_data(show_spinner="Measuring signal decay…", max_entries=16)
def decay(spec: ResearchSpec, sample: str):
    return an.ic_decay(market(spec.dataset), signal(spec), uni(spec), 20, spec.execution, sample)


@st.cache_data(show_spinner="Double-sorting on past returns…", max_entries=16)
def double_sort(spec: ResearchSpec, sample: str, cond_window: int):
    from quantlab.signals.library import past_return
    return an.double_sort(market(spec.dataset), signal(spec), past_return(market(spec.dataset), cond_window), uni(spec),
                          spec.horizon, 3, spec.execution, sample)


@st.cache_resource(show_spinner=False, max_entries=2)
def regimes(min_price: float, liq: float, ds: str | None = None):
    ds = ds or current_dataset()
    return an.regime_labels(market(ds), universe(min_price, liq, ds))


@st.cache_data(show_spinner="Running Fama-MacBeth regressions…", max_entries=16)
def fm_table(spec: ResearchSpec, sample: str):
    return fm_progression(market(spec.dataset), signal(spec), uni(spec), ch(spec), spec.horizon,
                          spec.execution, sample)


@st.cache_data(show_spinner="Separating earnings days from the rest…", max_entries=8)
def earn_split(spec: ResearchSpec, sample: str):
    from quantlab.research.earnings_tools import earnings_split
    m = market(spec.dataset)
    if m.events is None:
        return None
    return earnings_split(m, signal(spec), uni(spec), spec.horizon, spec.execution, sample)


@st.cache_resource(show_spinner="Backtesting portfolio…", max_entries=4)
def backtest(spec: ResearchSpec, pspec: PortfolioSpec, cspec: CostSpec):
    return run_backtest(market(spec.dataset), signal(spec), uni(spec), pspec, cspec,
                        spec.execution, beta=ch(spec)["beta"], compact=spec.dataset != "v1")


@st.cache_data(show_spinner="Building factor portfolios…", max_entries=8)
def factor_rets(spec: ResearchSpec, holding: int):
    # continuous characteristics only: a 0/1 flag (recent earnings) cannot be sorted
    # into top/bottom 30% portfolios
    c = {k: v for k, v in ch(spec).items() if k != "earn"}
    return rb.factor_returns(market(spec.dataset), c, uni(spec), holding, spec.execution)


@st.cache_data(show_spinner="Testing the whole parameter grid (≈10 s)…", max_entries=8)
def grid(spec: ResearchSpec):
    """The family of tests to correct for. Tunable signals: their own parameter grid.
    Fixed signals and custom formulas: the whole signal library plus this signal."""
    key = spec.hypothesis
    if key != "custom" and key != "placebo" and HYPOTHESES[key].tunable:
        from quantlab.research.library_cache import is_default, load_grid
        if is_default(spec.min_price, spec.liquidity_pct, spec.execution):
            g = load_grid(spec.dataset, key)
            if g is not None:
                return g
        return rb.grid_ic(market(spec.dataset), key, uni(spec), execution=spec.execution)
    lib = library_ics(spec.min_price, spec.liquidity_pct, spec.execution, spec.dataset)
    from quantlab.research.returns import forward_returns
    ics = lib.copy()
    if key == "custom" or key == "placebo":
        sig = signal(spec)
        for h in (1, 5, 10, 20):
            ics[f"{key}@{h}"] = rank_ic(sig, forward_returns(market(spec.dataset), h, spec.execution),
                                        uni(spec))
    rows = [{"config": c, "lookback": c.rsplit("@", 1)[0], "window": 0,
             "horizon": int(c.rsplit("@", 1)[1])} for c in ics]
    return ics, pd.DataFrame(rows).set_index("config")


@st.cache_data(show_spinner="Scoring the signal library (can take a minute)…", max_entries=4)
def library_ics(min_price: float, liq: float, execution: str, ds: str | None = None):
    from quantlab.research.library_cache import compute_library_ics, is_default, load_cached
    ds = ds or current_dataset()
    if is_default(min_price, liq, execution):
        cached = load_cached(ds)
        if cached is not None:
            return cached.astype(float)
    return compute_library_ics(market(ds), universe(min_price, liq, ds), execution)


@st.cache_data(show_spinner="Simulating noise signals (≈15 s)…", max_entries=4)
def placebo(spec: ResearchSpec, n_sims: int = 200):
    from quantlab.research.library_cache import is_default, load_placebo
    if is_default(spec.min_price, spec.liquidity_pct, spec.execution) and n_sims == 200:
        cached = load_placebo(spec.dataset, spec.horizon)
        if cached is not None:
            return cached
    return rb.placebo_tstats(market(spec.dataset), uni(spec), spec.horizon, n_sims, spec.execution, "research")


# ---------------------------------------------------------------- UI helpers
def page_setup(title: str, stage: str | None = None, intro: str = ""):
    st.title(title)
    if intro:
        st.markdown(intro)


def hyp_info(spec: ResearchSpec):
    """Name/statement/mechanism of the active hypothesis, including lab-built ones."""
    from types import SimpleNamespace
    if spec.hypothesis != "custom":
        return HYPOTHESES[spec.hypothesis]
    name = st.session_state.get("p", {}).get("custom_name", "My signal")
    card = next((c for c in reversed(st.session_state.get("lab_cards", []))
                 if c.get("formula") == spec.formula), None)
    return SimpleNamespace(
        key="custom", name=f"★ {name}", family="Mine",
        statement=card["statement"] if card else f"Custom formula: {spec.formula}",
        mechanism=card["mechanism"] if card else "Not recorded.",
        predicted_sign=card["predicted_sign"] if card else "Unknown",
        reference="Your own hypothesis (Signal lab)", tunable=False, is_placebo=False)


def terms(*keys: str):
    """A row of tappable chips, each opening a plain-English definition."""
    with st.container(horizontal=True, gap="small"):
        for k in keys:
            g = GLOSSARY[k]
            with st.popover(g["term"], icon=":material/info:", type="tertiary"):
                esc = lambda x: x.replace("$", "\\$")  # noqa: E731
                st.markdown(f"**{esc(g['term'])}**")
                st.markdown(esc(g["what"]))
                st.markdown(f"**How to read it.** {esc(g['read'])}")
                st.markdown(f"**Rule of thumb.** {esc(g['guide'])}")
                st.markdown(f"**Watch out.** {esc(g['trap'])}")


def reading(text: str):
    """A plain-English interpretation line (hidden when the user turns them off)."""
    if text and st.session_state.get("p", {}).get("plain", True):
        st.markdown(f"<div style='border-left:3px solid #2563eb;padding:.35rem .7rem;"
                    f"margin:.2rem 0 .8rem 0;font-size:.92rem'>💬 {text}</div>",
                    unsafe_allow_html=True)


def G(key: str) -> str:
    return help_text(key)


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


def in_sample_dates(index: pd.DatetimeIndex, sample: str) -> pd.DatetimeIndex:
    """Dates a page may DISPLAY for the chosen sample (keeps the holdout unseen)."""
    hs = pd.Timestamp(holdout_for(index))
    if sample == "research":
        return index[index < hs]
    if sample == "holdout":
        return index[index >= hs]
    return index


def lag_of(spec: ResearchSpec) -> int:
    return execution_params(spec.execution)[1]
