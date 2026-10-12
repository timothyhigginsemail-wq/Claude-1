"""Load the processed panel into aligned wide matrices (dates x tickers)."""
from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache

import numpy as np
import pandas as pd

from quantlab.config import MEMBERSHIP_PATH, PANEL_PATH, PROCESSED_DIR, SECTORS_PATH


@dataclass
class Market:
    open: pd.DataFrame
    high: pd.DataFrame
    low: pd.DataFrame
    close: pd.DataFrame
    volume: pd.DataFrame
    ret_valid: pd.DataFrame   # False where the vendor price change is not an investor return
    member: pd.DataFrame      # point-in-time S&P 500 membership
    sector: pd.Series         # ticker -> sector
    coverage: pd.DataFrame    # daily: members in index vs members we have data for

    @property
    def dates(self) -> pd.DatetimeIndex:
        return self.close.index

    @property
    def tickers(self) -> pd.Index:
        return self.close.columns

    def daily_returns(self, price: str = "close") -> pd.DataFrame:
        """Simple daily return of the chosen price series, r_t = P_t / P_{t-1} - 1.

        Returns spanning a missing price are NaN (never bridged), and returns on
        unadjusted corporate-action dates are NaN.
        """
        p = getattr(self, price)
        r = p / p.shift(1) - 1.0
        return r.where(self.ret_valid)

    @property
    def dollar_volume(self) -> pd.DataFrame:
        return self.close * self.volume


def market_from_long(panel: pd.DataFrame, member: pd.DataFrame | None = None,
                     sector: pd.Series | None = None,
                     coverage: pd.DataFrame | None = None) -> Market:
    """Pivot a long panel to a Market. Also used by tests with synthetic data."""
    wide = {f: panel.pivot(index="date", columns="ticker", values=f).sort_index()
            for f in ["open", "high", "low", "close", "volume"]}
    if "ret_valid" in panel:
        rv = panel.pivot(index="date", columns="ticker", values="ret_valid")
        rv = rv.reindex_like(wide["close"]).fillna(True).astype(bool)
    else:
        rv = pd.DataFrame(True, index=wide["close"].index, columns=wide["close"].columns)
    for k in wide:
        wide[k] = wide[k].astype(float)
    idx, cols = wide["close"].index, wide["close"].columns
    if member is None:
        member = pd.DataFrame(True, index=idx, columns=cols)
    member = member.reindex(index=idx, columns=cols).fillna(False).astype(bool)
    if sector is None:
        sector = pd.Series("All", index=cols)
    sector = sector.reindex(cols).fillna("Unknown")
    if coverage is None:
        coverage = pd.DataFrame({"n_members": member.sum(axis=1), "n_with_data": member.sum(axis=1)})
    return Market(open=wide["open"], high=wide["high"], low=wide["low"], close=wide["close"],
                  volume=wide["volume"], ret_valid=rv, member=member, sector=sector,
                  coverage=coverage)


@lru_cache(maxsize=1)
def load_market() -> Market:
    panel = pd.read_parquet(PANEL_PATH)
    member = pd.read_parquet(MEMBERSHIP_PATH)
    member.index = pd.to_datetime(member.index)
    sectors = pd.read_csv(SECTORS_PATH).set_index("ticker")["sector"]
    coverage = pd.read_parquet(PROCESSED_DIR / "coverage.parquet")
    return market_from_long(panel, member, sectors, coverage)


def eligible_universe(mkt: Market, min_price: float = 5.0, min_history: int = 60,
                      liquidity_pct: float = 0.0) -> pd.DataFrame:
    """Which stocks may be used on each date, using only information known at t.

    - point-in-time index member on date t (removes 'joined the index later' bias)
    - price at t >= min_price
    - at least `min_history` days of volume history (needed for the signal)
    - optionally drop the least liquid `liquidity_pct` (by 20-day dollar volume)
    """
    has_hist = mkt.volume.notna().rolling(min_history, min_periods=1).sum() >= min_history
    ok = mkt.member & (mkt.close >= min_price) & has_hist & mkt.close.notna()
    if liquidity_pct > 0:
        adv = mkt.dollar_volume.rolling(20, min_periods=10).mean()
        pct = adv.where(ok).rank(axis=1, pct=True)
        ok &= pct > liquidity_pct
    return ok.fillna(False).astype(bool)
