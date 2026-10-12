"""Forward returns with explicit execution timing.

THE most common error in backtests is misaligning signals and returns. Here
everything is defined relative to the signal date t (all data up to the CLOSE
of day t are known when the signal is computed):

  execution='close_t'   enter at close of t   (optimistic: the day's final volume
                        is not actually known until the close itself)
  execution='open_t1'   enter at the next open, t+1   (default; realistic)
  execution='close_t1'  enter at the next close, t+1  (conservative)

The h-day forward return of the trade opened from signal t is
    R^h_t = P_{t+L+h} / P_{t+L} - 1
where P is the entry price series (open or close) and L is the lag (0 or 1).
It is computed by compounding daily returns so that corporate-action days and
missing prices propagate as NaN instead of producing fake returns.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from quantlab.data.loader import Market

EXECUTION = {
    "close_t": ("close", 0),
    "open_t1": ("open", 1),
    "close_t1": ("close", 1),
}
EXECUTION_LABELS = {
    "open_t1": "Next open (t+1) — realistic default",
    "close_t1": "Next close (t+1) — conservative",
    "close_t": "Same close (t) — optimistic / leaky",
}


def execution_params(execution: str) -> tuple[str, int]:
    if execution not in EXECUTION:
        raise ValueError(f"unknown execution {execution!r}")
    return EXECUTION[execution]


def compound_forward(daily: pd.DataFrame, h: int, lag: int) -> pd.DataFrame:
    """R_t = prod_{k=1..h} (1 + r_{t+lag+k}) - 1, NaN if any component is NaN."""
    logr = np.log1p(daily)
    # sum of the next h log-returns starting after t+lag
    fwd = logr.rolling(h, min_periods=h).sum().shift(-(h + lag))
    return np.expm1(fwd)


def forward_returns(mkt: Market, h: int, execution: str = "open_t1") -> pd.DataFrame:
    price, lag = execution_params(execution)
    return compound_forward(mkt.daily_returns(price), h, lag)


def excess_over_universe(ret: pd.DataFrame, universe: pd.DataFrame) -> pd.DataFrame:
    """Subtract the equal-weighted cross-sectional mean (within the universe)."""
    r = ret.where(universe)
    return r.sub(r.mean(axis=1), axis=0)
