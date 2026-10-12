"""Point-in-time control characteristics ("factor exposures") and Fama-MacBeth.

With only price/volume data we can build: market beta, a size PROXY (dollar
volume — real size needs shares outstanding), short-term reversal, medium-term
momentum, volatility and sector. We CANNOT build value, profitability,
investment or quality factors (no fundamentals). Results that "survive factor
controls" here survive only THESE controls.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from quantlab.data.loader import Market
from quantlab.signals.library import cs_zscore, past_return

CONTROL_LABELS = {
    "beta": "Market beta (60d)",
    "size": "Size proxy: log $ volume (60d)",
    "rev5": "5-day return (reversal)",
    "rev1": "1-day return",
    "mom": "Momentum (6-1 month return)",
    "vol": "Volatility (20d)",
}


def market_return(mkt: Market, universe: pd.DataFrame, price: str = "close") -> pd.Series:
    """Equal-weighted average daily return of the universe (our 'market' proxy)."""
    r = mkt.daily_returns(price).where(universe.shift(1, fill_value=False))
    return r.mean(axis=1)


def rolling_beta(mkt: Market, universe: pd.DataFrame, window: int = 60) -> pd.DataFrame:
    r = mkt.daily_returns("close")
    m = market_return(mkt, universe)
    mp = min(window // 2, 20)
    rm = r.mul(m, axis=0).rolling(window, min_periods=mp).mean()
    mean_r = r.rolling(window, min_periods=mp).mean()
    mean_m = m.rolling(window, min_periods=mp).mean()
    var_m = m.rolling(window, min_periods=mp).var(ddof=0)
    cov = rm.sub(mean_r.mul(mean_m, axis=0))
    return cov.div(var_m, axis=0)


def characteristics(mkt: Market, universe: pd.DataFrame) -> dict[str, pd.DataFrame]:
    """All controls, each known at the close of day t."""
    r = mkt.daily_returns("close")
    return {
        "beta": rolling_beta(mkt, universe),
        "size": np.log(mkt.dollar_volume.rolling(60, min_periods=20).mean()),
        "rev5": past_return(mkt, window=5),
        "rev1": past_return(mkt, window=1),
        "mom": past_return(mkt, window=105, skip=21),
        "vol": r.rolling(20, min_periods=10).std(),
    }


def sector_dummies(mkt: Market) -> pd.DataFrame:
    return pd.get_dummies(mkt.sector).astype(float)


def _cross_section_ols(y: np.ndarray, X: np.ndarray, min_obs: int):
    ok = np.isfinite(y) & np.isfinite(X).all(axis=1)
    if ok.sum() < max(min_obs, X.shape[1] + 5):
        return None, ok
    coef, *_ = np.linalg.lstsq(X[ok], y[ok], rcond=None)
    return coef, ok


def fama_macbeth(y: pd.DataFrame, regressors: dict[str, pd.DataFrame],
                 universe: pd.DataFrame, sectors: pd.DataFrame | None = None,
                 min_obs: int = 50) -> pd.DataFrame:
    """Daily cross-sectional regressions; returns one row of coefficients per date.

    y_{i,t} = a_t + sum_k b_{k,t} z_{k,i,t} + sector effects + e_{i,t}
    Regressors are cross-sectionally z-scored, so b_{k,t} is the return (per unit
    of cross-sectional standard deviation) of a 'pure' characteristic portfolio.
    The time-series average of b_t and its Newey-West t-stat is the test.
    """
    names = list(regressors)
    Z = {k: cs_zscore(v, universe).reindex_like(y) for k, v in regressors.items()}
    Y = y.where(universe).values
    stack = np.stack([Z[k].values for k in names], axis=-1)  # T x N x K
    sec = sectors.reindex(y.columns).fillna(0).values if sectors is not None else None
    out = np.full((len(y), len(names)), np.nan)
    for t in range(len(y)):
        cols = [stack[t]]
        if sec is not None:
            cols.append(sec)          # sector dummies replace the intercept
        else:
            cols.append(np.ones((Y.shape[1], 1)))
        X = np.hstack(cols)
        coef, _ = _cross_section_ols(Y[t], X, min_obs)
        if coef is not None:
            out[t] = coef[: len(names)]
    return pd.DataFrame(out, index=y.index, columns=names)


def neutralize(signal: pd.DataFrame, controls: dict[str, pd.DataFrame],
               universe: pd.DataFrame, sectors: pd.DataFrame | None = None,
               min_obs: int = 50) -> pd.DataFrame:
    """Residual of the (z-scored) signal after regressing it on controls each day.

    The residual is the part of the signal NOT explained by known exposures.
    """
    s = cs_zscore(signal, universe)
    names = list(controls)
    Z = np.stack([cs_zscore(controls[k], universe).reindex_like(s).values for k in names], -1) \
        if names else np.zeros(s.shape + (0,))
    sec = sectors.reindex(s.columns).fillna(0).values if sectors is not None else None
    S = s.values
    out = np.full(S.shape, np.nan)
    for t in range(len(s)):
        cols = [Z[t]] + ([sec] if sec is not None else [np.ones((S.shape[1], 1))])
        X = np.hstack(cols)
        coef, ok = _cross_section_ols(S[t], X, min_obs)
        if coef is not None:
            out[t, ok] = S[t, ok] - X[ok] @ coef
    return pd.DataFrame(out, index=s.index, columns=s.columns)
