"""Preliminary predictive tests: IC, quantile spreads, decay, conditioning, regimes."""
from __future__ import annotations

import numpy as np
import pandas as pd

from quantlab.config import holdout_for
from quantlab.data.loader import Market
from quantlab.research.returns import excess_over_universe, execution_params, forward_returns
from quantlab.research.stats import mean_stats, rank_ic


def sample_mask(dates: pd.DatetimeIndex, sample: str, horizon: int = 1, lag: int = 1,
                holdout_start: str | None = None) -> pd.Series:
    """Which signal dates belong to the sample.

    'research': dates before the holdout, PURGED so that no forward-return window
                reaches into the holdout (otherwise holdout prices leak in).
    'holdout' : dates from the holdout start onward.
    'full'    : everything.
    """
    d = pd.Series(np.arange(len(dates)), index=dates)
    holdout_start = holdout_start or holdout_for(dates)
    hs = dates.searchsorted(pd.Timestamp(holdout_start))
    if sample == "full":
        return pd.Series(True, index=dates)
    if sample == "research":
        return d + lag + horizon < hs
    if sample == "holdout":
        return d >= hs
    raise ValueError(sample)


def ic_by_horizon(mkt: Market, signal: pd.DataFrame, universe: pd.DataFrame,
                  horizons=(1, 2, 5, 10, 20), execution: str = "open_t1",
                  sample: str = "research") -> pd.DataFrame:
    _, lag = execution_params(execution)
    rows = []
    for h in horizons:
        fwd = forward_returns(mkt, h, execution)
        ic = rank_ic(signal, fwd, universe)
        ic = ic[sample_mask(ic.index, sample, h, lag)]
        st = mean_stats(ic, horizon=h)
        rows.append({"horizon": h, "mean_ic": st["mean"], "t_nw": st["t_nw"],
                     "t_naive": st["t_naive"], "p_nw": st["p_nw"],
                     "ic_ir_annual": st["mean"] / ic.std() * np.sqrt(252 / h),
                     "hit_rate": float((ic > 0).mean()), "n_days": st["n"],
                     "nw_lags": st.get("lags")})
    return pd.DataFrame(rows).set_index("horizon")


def quantile_spreads(mkt: Market, signal: pd.DataFrame, universe: pd.DataFrame,
                     horizon: int = 5, n_q: int = 5, execution: str = "open_t1",
                     sample: str = "research") -> tuple[pd.DataFrame, pd.DataFrame]:
    """Average forward EXCESS return (vs equal-weighted universe) by signal quantile.

    Returns (summary table in bps, daily quantile-return time series).
    """
    _, lag = execution_params(execution)
    fwd = excess_over_universe(forward_returns(mkt, horizon, execution), universe)
    s = signal.where(universe & fwd.notna())
    pct = s.rank(axis=1, pct=True)
    q = np.ceil(pct * n_q).clip(1, n_q)
    daily = {}
    for k in range(1, n_q + 1):
        daily[f"Q{k}"] = fwd.where(q == k).mean(axis=1)
    daily = pd.DataFrame(daily)
    daily[f"Q{n_q}-Q1"] = daily[f"Q{n_q}"] - daily["Q1"]
    daily = daily[sample_mask(daily.index, sample, horizon, lag)].dropna(how="all")
    rows = []
    for c in daily:
        st = mean_stats(daily[c], horizon=horizon)
        rows.append({"bucket": c, "mean_bps": st["mean"] * 1e4, "se_bps": st["se_nw"] * 1e4,
                     "t_nw": st["t_nw"], "bps_per_day": st["mean"] * 1e4 / horizon})
    return pd.DataFrame(rows).set_index("bucket"), daily


def ic_decay(mkt: Market, signal: pd.DataFrame, universe: pd.DataFrame, max_lag: int = 20,
             execution: str = "open_t1", sample: str = "research") -> pd.DataFrame:
    """IC between signal at t and the SINGLE-day return k days later.

    Shows when the predictive information is realised (and if it reverses).
    """
    price, lag = execution_params(execution)
    daily = mkt.daily_returns(price)
    rows = []
    for k in range(1, max_lag + 1):
        fwd = daily.shift(-(lag + k))
        ic = rank_ic(signal, fwd, universe)
        ic = ic[sample_mask(ic.index, sample, k, lag)]
        st = mean_stats(ic, horizon=1)
        rows.append({"day": k, "mean_ic": st["mean"], "t_nw": st["t_nw"]})
    out = pd.DataFrame(rows).set_index("day")
    out["cumulative_ic"] = out["mean_ic"].cumsum()
    return out


def double_sort(mkt: Market, signal: pd.DataFrame, conditioner: pd.DataFrame,
                universe: pd.DataFrame, horizon: int = 5, n: int = 3,
                execution: str = "open_t1", sample: str = "research") -> tuple[pd.DataFrame, pd.DataFrame]:
    """Independent n x n sort on signal and a conditioning variable (e.g. past return).

    Returns (mean excess forward return in bps, NW t-stats); rows = conditioner bucket.
    """
    _, lag = execution_params(execution)
    fwd = excess_over_universe(forward_returns(mkt, horizon, execution), universe)
    ok = universe & fwd.notna() & signal.notna() & conditioner.notna()
    qs = np.ceil(signal.where(ok).rank(axis=1, pct=True) * n).clip(1, n)
    qc = np.ceil(conditioner.where(ok).rank(axis=1, pct=True) * n).clip(1, n)
    mask = sample_mask(fwd.index, sample, horizon, lag)
    means = pd.DataFrame(index=range(1, n + 1), columns=range(1, n + 1), dtype=float)
    tst = means.copy()
    for i in range(1, n + 1):
        for j in range(1, n + 1):
            ts = fwd.where((qc == i) & (qs == j)).mean(axis=1)[mask]
            st = mean_stats(ts, horizon=horizon)
            means.loc[i, j] = st["mean"] * 1e4
            tst.loc[i, j] = st["t_nw"]
    return means, tst


def regime_labels(mkt: Market, universe: pd.DataFrame) -> pd.DataFrame:
    """Regime of each date, using ONLY information known at t."""
    from quantlab.research.factors import market_return
    m = market_return(mkt, universe)
    vol = m.rolling(20, min_periods=10).std() * np.sqrt(252)
    trend = np.expm1(np.log1p(m).rolling(60, min_periods=40).sum())
    # Terciles use an EXPANDING window so the cut-offs are also point-in-time.
    def expanding_tercile(x):
        lo = x.expanding(60).quantile(1 / 3)
        hi = x.expanding(60).quantile(2 / 3)
        return np.where(x.isna() | lo.isna(), None,
                        np.where(x <= lo, "Low", np.where(x >= hi, "High", "Mid")))
    return pd.DataFrame({
        "Year": mkt.dates.year.astype(str),
        "Market volatility": expanding_tercile(vol),
        "Market trend (60d)": np.where(trend.isna(), None, np.where(trend > 0, "Up", "Down")),
    }, index=mkt.dates)


def ic_by_regime(ic: pd.Series, labels: pd.Series, horizon: int) -> pd.DataFrame:
    rows = []
    for g, s in ic.groupby(labels.reindex(ic.index)):
        if g is None:
            continue
        st = mean_stats(s, horizon=horizon)
        rows.append({"regime": g, "mean_ic": st["mean"], "t_nw": st["t_nw"], "n_days": st["n"]})
    return pd.DataFrame(rows).set_index("regime")
