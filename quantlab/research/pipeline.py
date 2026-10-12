"""One research specification -> all the evidence, end to end.

Used by the web app and by scripts/run_experiment.py, so the numbers on screen
and in saved experiment records come from exactly the same code.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field

import numpy as np
import pandas as pd

from quantlab.data.loader import Market, eligible_universe
from quantlab.portfolio.backtest import CostSpec, performance, run_backtest
from quantlab.portfolio.construct import PortfolioSpec
from quantlab.research.analysis import ic_by_horizon, sample_mask
from quantlab.research.factors import characteristics, fama_macbeth, neutralize, sector_dummies
from quantlab.research.returns import execution_params, forward_returns
from quantlab.research.stats import block_bootstrap_sharpe, deflated_sharpe, mean_stats, rank_ic
from quantlab.signals.library import compute_signal


@dataclass(frozen=True)
class ResearchSpec:
    hypothesis: str = "abnormal_volume"
    lookback: int = 20
    window: int = 1
    horizon: int = 5
    execution: str = "open_t1"
    min_price: float = 5.0
    liquidity_pct: float = 0.0
    neutralization: str = "none"     # 'none' | 'sector' | 'factors'

    def signal_params(self) -> dict:
        if self.hypothesis == "reversal":
            return {"window": self.window if self.window > 1 else 5}
        if self.hypothesis == "placebo":
            return {}
        if self.hypothesis == "volume_trend":
            return {"lookback": max(self.lookback, 60), "window": max(self.window, 5)}
        return {"lookback": self.lookback, "window": self.window}

    def as_dict(self) -> dict:
        return asdict(self)


def build_universe(mkt: Market, spec: ResearchSpec) -> pd.DataFrame:
    return eligible_universe(mkt, min_price=spec.min_price, liquidity_pct=spec.liquidity_pct)


def build_signal(mkt: Market, spec: ResearchSpec, universe: pd.DataFrame,
                 chars: dict | None = None) -> pd.DataFrame:
    raw = compute_signal(mkt, spec.hypothesis, **spec.signal_params())
    if spec.neutralization == "none":
        return raw
    if spec.neutralization == "sector":
        return neutralize(raw, {}, universe, sector_dummies(mkt))
    if spec.neutralization == "factors":
        chars = chars or characteristics(mkt, universe)
        return neutralize(raw, chars, universe, sector_dummies(mkt))
    raise ValueError(spec.neutralization)


def fm_progression(mkt: Market, signal: pd.DataFrame, universe: pd.DataFrame,
                   chars: dict, horizon: int, execution: str, sample: str = "research") -> pd.DataFrame:
    """Fama-MacBeth coefficient on the signal as controls are added step by step."""
    _, lag = execution_params(execution)
    y = forward_returns(mkt, horizon, execution)
    models = [
        ("Signal only", [], False),
        ("+ beta, size", ["beta", "size"], False),
        ("+ 1d & 5d reversal", ["beta", "size", "rev1", "rev5"], False),
        ("+ momentum, volatility", ["beta", "size", "rev1", "rev5", "mom", "vol"], False),
        ("+ sector effects", ["beta", "size", "rev1", "rev5", "mom", "vol"], True),
    ]
    rows = []
    for name, ctrl, sec in models:
        regs = {"signal": signal, **{k: chars[k] for k in ctrl}}
        fm = fama_macbeth(y, regs, universe, sector_dummies(mkt) if sec else None)
        fm = fm[sample_mask(fm.index, sample, horizon, lag)]
        st = mean_stats(fm["signal"], horizon=horizon)
        rows.append({"model": name, "coef_bps": st["mean"] * 1e4, "t_nw": st["t_nw"],
                     "n_days": st["n"]})
    return pd.DataFrame(rows).set_index("model")


def restrict(r: pd.Series, sample: str, horizon: int, lag: int) -> pd.Series:
    """Restrict a DAILY P&L series to a sample. P&L dated j is earned on interval j,
    so the research sample ends the day before the holdout starts."""
    from quantlab.config import HOLDOUT_START
    hs = pd.Timestamp(HOLDOUT_START)
    if sample == "research":
        return r[r.index < hs]
    if sample == "holdout":
        return r[r.index >= hs]
    return r


def evidence_summary(bt, sample: str, n_trials: int) -> dict:
    lag = bt.meta["lag"]
    g = restrict(bt.daily["gross"], sample, bt.spec.holding, lag)
    n = restrict(bt.daily["net"], sample, bt.spec.holding, lag)
    to = restrict(bt.daily["turnover"], sample, bt.spec.holding, lag)
    out = {
        "gross": performance(g), "net": performance(n),
        "avg_daily_turnover": float(to.mean()),
        "sharpe_ci_net": block_bootstrap_sharpe(n, block=max(10, 2 * bt.spec.holding)),
        "dsr": deflated_sharpe(n, n_trials=max(n_trials, 1)),
    }
    cost_per_day = (restrict(bt.daily["trading_cost"], sample, 1, lag)).mean()
    out["avg_cost_bps_per_turnover"] = float(cost_per_day / to.mean() * 1e4) if to.mean() > 0 else np.nan
    out["breakeven_cost_bps"] = float(g.mean() / to.mean() * 1e4) if to.mean() > 0 else np.nan
    return out
