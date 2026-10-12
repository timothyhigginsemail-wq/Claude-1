"""Separating 'volume' from 'earnings news'.

All measures use only what is known at the close of day t: whether the stock had an
earnings reaction day on t or within the previous k days (dates of past filings).
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from quantlab.data.loader import Market
from quantlab.research.analysis import sample_mask
from quantlab.research.returns import execution_params, forward_returns
from quantlab.research.stats import mean_stats, rank_ic


def recent_earnings(mkt: Market, window: int = 3) -> pd.DataFrame:
    """True if the stock had an earnings reaction day within the last `window` days (incl. t)."""
    ev = mkt.events.astype(float)
    return ev.rolling(window, min_periods=1).max().astype(bool)


def days_since_earnings(mkt: Market) -> pd.DataFrame:
    ev = mkt.events.values
    out = np.full(ev.shape, np.nan)
    last = np.full(ev.shape[1], -10_000)
    for t in range(ev.shape[0]):
        last = np.where(ev[t], t, last)
        out[t] = np.where(last >= 0, t - last, np.nan)
    return pd.DataFrame(out, index=mkt.dates, columns=mkt.tickers).where(lambda x: x < 5000)


def earnings_split(mkt: Market, signal: pd.DataFrame, universe: pd.DataFrame, horizon: int,
                   execution: str, sample: str = "research", window: int = 3) -> pd.DataFrame:
    """IC of the signal on all stocks, on stocks with recent earnings excluded, and on
    stocks with recent earnings only (pooled across days, since few report each day)."""
    _, lag = execution_params(execution)
    fwd = forward_returns(mkt, horizon, execution)
    rec = recent_earnings(mkt, window)
    rows = []
    for name, u in [("All stocks", universe), ("Excluding recent earnings", universe & ~rec)]:
        ic = rank_ic(signal, fwd, u)
        ic = ic[sample_mask(ic.index, sample, horizon, lag)]
        st = mean_stats(ic, horizon)
        rows.append({"group": name, "mean_ic": st["mean"], "t_nw": st["t_nw"],
                     "obs_per_day": float(u.sum(axis=1).mean())})
    # earnings-window stocks only: monthly pooled rank correlation (daily cross-sections
    # hold ~10-30 names, too few for a daily IC)
    s = signal.where(universe & rec)
    f = fwd.where(universe & rec)
    mask = sample_mask(s.index, sample, horizon, lag)
    s, f = s[mask], f[mask]
    sr = s.sub(s.mean(axis=1), axis=0).div(s.std(axis=1), axis=0)
    fr = f.sub(f.mean(axis=1), axis=0)
    month = s.index.to_period("M")
    vals = []
    for _, idx in pd.Series(range(len(s)), index=month).groupby(level=0):
        a = sr.iloc[idx.values].stack()
        b = fr.iloc[idx.values].stack()
        a, b = a.align(b, join="inner")
        if len(a) >= 30:
            vals.append(a.rank().corr(b.rank()))
    st = mean_stats(pd.Series(vals), max(1, horizon // 21))
    rows.append({"group": "Recent earnings only (monthly pooled)", "mean_ic": st["mean"],
                 "t_nw": st["t_nw"], "obs_per_day": float((universe & rec).sum(axis=1).mean())})
    return pd.DataFrame(rows).set_index("group")


def post_earnings_drift(mkt: Market, hold: int = 60) -> pd.DataFrame:
    """Return on the most recent earnings reaction day, carried forward for `hold` days.
    Price-based proxy for earnings surprise (Bernard & Thomas 1989; Chan, Jegadeesh &
    Lakonishok 1996): good news keeps being priced in."""
    r = mkt.daily_returns("close")
    er = r.where(mkt.events)
    return er.ffill(limit=hold)
