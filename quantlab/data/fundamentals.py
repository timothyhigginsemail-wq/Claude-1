"""Point-in-time fundamentals from SEC XBRL company facts (2009 onward).

Rules (what an investor could have known on date t):
  * every value is used only from the day AFTER its filing date (filed + 1 trading day);
  * when a period is reported several times (e.g. restated in a later 10-K), the FIRST
    filing is used — later restatements are ignored;
  * annual net income comes from 10-K fiscal-year values (duration of 350–380 days);
  * share counts are the cover-page shares outstanding, converted to today's
    split-adjusted basis so they can be multiplied by Yahoo's split-adjusted prices.

Derived characteristics: market cap, book-to-market, return on equity, asset growth.
"""
from __future__ import annotations

import glob

import numpy as np
import pandas as pd

from quantlab.config import RAW_DIR


def split_factors(dates: pd.DatetimeIndex, tickers) -> pd.DataFrame:
    """F(t) = product of split ratios occurring AFTER date t (from Yahoo's split events).
    An unadjusted price on t = split-adjusted price × F(t)."""
    frames = []
    for f in sorted(glob.glob(str(RAW_DIR / "yahoo" / "*.parquet"))):
        d = pd.read_parquet(f)
        if len(d) and "Stock Splits" in d:
            frames.append(d[["date", "ticker", "Stock Splits"]])
    s = pd.concat(frames)
    s["date"] = pd.to_datetime(s["date"]).dt.tz_localize(None).dt.normalize()
    s = s[s["Stock Splits"] > 0].drop_duplicates(["ticker", "date"])
    out = pd.DataFrame(1.0, index=dates, columns=list(tickers))
    for t, g in s.groupby("ticker"):
        if t not in out:
            continue
        for d, ratio in zip(g["date"], g["Stock Splits"]):
            out.loc[out.index < d, t] *= ratio
    return out


def _pit_series(recs: pd.DataFrame, dates: pd.DatetimeIndex, key: str) -> pd.Series:
    """First-reported value per period `key`, effective from the trading day after filing,
    then carried forward (the latest period known at each date)."""
    recs = recs.dropna(subset=["val", "filed", key]).copy()
    recs["filed"] = pd.to_datetime(recs["filed"])
    recs["end_"] = pd.to_datetime(recs[key])
    first = recs.sort_values("filed").drop_duplicates("end_", keep="first")
    first = first.sort_values(["filed", "end_"])
    # In FILING order, a value becomes current only if its period is newer than every
    # period filed before it (a late filing about an older period never overrides).
    newest_before = first["end_"].cummax().shift(1)
    first = first[newest_before.isna() | (first["end_"] > newest_before)]
    pos = dates.searchsorted(first["filed"], side="right")      # strictly after filing day
    s = pd.Series(np.nan, index=dates)
    for p, v in zip(pos, first["val"]):
        if p < len(dates):
            s.iloc[p] = v
    return s.ffill(limit=400)


def build_fundamentals(dates: pd.DatetimeIndex, tickers, close: pd.DataFrame) -> dict:
    facts = pd.read_parquet(RAW_DIR / "sec_facts.parquet")
    facts = facts[facts["ticker"].isin(set(tickers))]
    out = {k: pd.DataFrame(np.nan, index=dates, columns=list(tickers))
           for k in ("shares", "equity", "net_income", "assets", "assets_lag")}
    F = split_factors(dates, tickers)
    for t, g in facts.groupby("ticker"):
        sh = g[(g["concept"] == "shares") & (g["unit"] == "shares")].copy()
        if t in F and len(sh):
            # Express each reported share count in TODAY's split-adjusted units, using the
            # splits that happened after that count's as-of date (so a count reported just
            # before a split is still correct after it).
            asof = pd.to_datetime(sh["end"])
            pos = np.clip(F.index.searchsorted(asof), 0, len(F) - 1)
            sh["val"] = sh["val"].values * F[t].values[pos]
        out["shares"][t] = _pit_series(sh, dates, "end")
        eq = g[(g["concept"] == "equity") & (g["unit"] == "USD") & g["form"].isin(["10-K", "10-Q"])]
        out["equity"][t] = _pit_series(eq, dates, "end")
        ni = g[(g["concept"] == "net_income") & (g["unit"] == "USD") & (g["form"] == "10-K")].copy()
        dur = (pd.to_datetime(ni["end"]) - pd.to_datetime(ni["start"])).dt.days
        out["net_income"][t] = _pit_series(ni[(dur > 350) & (dur < 380)], dates, "end")
        at = g[(g["concept"] == "assets") & (g["unit"] == "USD") & (g["form"] == "10-K")]
        out["assets"][t] = _pit_series(at, dates, "end")
    out["assets_lag"] = out["assets"].shift(252)
    mcap = out["shares"] * close          # both in today's split-adjusted units
    res = {
        "mcap": mcap,
        "book_to_market": out["equity"].where(out["equity"] > 0) / mcap,
        "roe": out["net_income"] / out["equity"].where(out["equity"] > 0),
        "asset_growth": out["assets"] / out["assets_lag"] - 1,
    }
    return {k: v.astype("float32") for k, v in res.items()}
