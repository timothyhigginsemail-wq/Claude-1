"""Build the cleaned research panel from raw sources.

Run with:  python scripts/build_data.py

Outputs (data/processed/):
  panel.parquet       long table: date, ticker, open, high, low, close, volume
  membership.parquet  wide bool table: was the ticker an S&P 500 member that day?
  sectors.csv         ticker -> GICS sector (+ provenance of each label)
  quality_report.json every cleaning action, counted, plus survivorship stats
"""
from __future__ import annotations

import json

import numpy as np
import pandas as pd

from quantlab.config import (
    MEMBERSHIP_PATH, PANEL_PATH, PROCESSED_DIR, QUALITY_PATH, REFERENCE_DIR, SECTORS_PATH,
)
from quantlab.data.sources import SOURCES, fetch

# The membership file records some companies under symbols adopted *after*
# 2018. Map dataset (2018) symbol -> membership-file symbol.
MEMBERSHIP_ALIASES = {
    "CBG": "CBRE", "DPS": "KDP", "HCN": "WELL", "LUK": "JEF", "PCLN": "BKNG", "WYN": "WYND",
}
# Dataset symbol -> current symbol, for looking up today's GICS sector.
SECTOR_ALIASES = {
    "CBG": "CBRE", "DPS": "KDP", "HCN": "WELL", "PCLN": "BKNG", "FB": "META", "ANTM": "ELV",
    "ABC": "COR", "JEC": "J", "FISV": "FI", "RE": "EG", "BLL": "BALL", "HRS": "LHX",
    "UTX": "RTX", "PKI": "RVTY", "FLIR": "TDY",
}
EXTREME_RETURN = 0.40  # flag (not delete) close-to-close moves larger than 40%
SPIKE = 0.25           # a >25% move that fully reverses next day is treated as a bad print


def clean_prices(raw: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    """Apply documented cleaning rules; return clean long panel and a log of actions."""
    log: dict[str, object] = {"raw_rows": int(len(raw))}
    df = raw.rename(columns={"Name": "ticker"}).copy()
    df["date"] = pd.to_datetime(df["date"])

    dup = df.duplicated(["date", "ticker"], keep="first")
    log["duplicate_rows_dropped"] = int(dup.sum())
    df = df[~dup]

    bad_close = ~(df["close"] > 0)
    log["rows_dropped_nonpositive_close"] = int(bad_close.sum())
    df = df[~bad_close]

    log["missing_open_high_low_cells"] = int(df[["open", "high", "low"]].isna().sum().sum())

    zero_vol = df["volume"] <= 0
    log["zero_volume_rows_set_to_missing"] = int(zero_vol.sum())
    df.loc[zero_vol, "volume"] = np.nan

    # OHLC consistency: high should be >= open/close, low <= open/close.
    hi_bad = df["high"] < df[["open", "close"]].max(axis=1) - 1e-9
    lo_bad = df["low"] > df[["open", "close"]].min(axis=1) + 1e-9
    log["ohlc_inconsistent_rows_flagged"] = int((hi_bad | lo_bad).sum())

    # Close printed far outside the day's own high/low range => bad print.
    outside = (df["close"] < df["low"] * 0.98) | (df["close"] > df["high"] * 1.02)
    log["bad_close_outside_range_set_missing"] = [
        f"{t} {d.date()}" for t, d in zip(df.loc[outside, "ticker"], df.loc[outside, "date"])
    ]
    df.loc[outside, "close"] = np.nan

    df = df.sort_values(["ticker", "date"]).reset_index(drop=True)
    # Spike-and-reversal: |r_t| > 25% and close_{t+1} within 5% of close_{t-1}.
    g = df.groupby("ticker")["close"]
    prev, nxt = g.shift(1), g.shift(-1)
    spike = ((df["close"] / prev - 1).abs() > SPIKE) & ((nxt / prev - 1).abs() < 0.05)
    log["spike_reversal_rows_set_missing"] = [
        f"{t} {d.date()}" for t, d in zip(df.loc[spike, "ticker"], df.loc[spike, "date"])
    ]
    df.loc[spike, ["open", "high", "low", "close"]] = np.nan

    # Corporate actions the vendor did not adjust for: the return INTO that date is
    # not an investor's return, so it is invalidated (excluded from signals and P&L).
    ca = pd.read_csv(REFERENCE_DIR / "corporate_actions.csv", parse_dates=["date"])
    key = set(zip(ca["ticker"], ca["date"]))
    df["ret_valid"] = [(t, d) not in key for t, d in zip(df["ticker"], df["date"])]
    log["corporate_action_returns_invalidated"] = int((~df["ret_valid"]).sum())

    ret = df.groupby("ticker")["close"].pct_change(fill_method=None)
    extreme = ret.abs() > EXTREME_RETURN
    log["extreme_return_flags"] = [
        {"ticker": t, "date": str(d.date()), "return": round(float(r), 4)}
        for t, d, r in zip(df.loc[extreme, "ticker"], df.loc[extreme, "date"], ret[extreme])
    ]

    # Gaps: trading dates on which a ticker is missing *within* its own life.
    all_dates = pd.Index(sorted(df["date"].unique()))
    gaps = {}
    for t, g in df.groupby("ticker"):
        life = all_dates[(all_dates >= g["date"].min()) & (all_dates <= g["date"].max())]
        n_missing = len(life) - len(g)
        if n_missing:
            gaps[t] = int(n_missing)
    log["tickers_with_internal_gaps"] = gaps
    log["clean_rows"] = int(len(df))
    log["n_tickers"] = int(df["ticker"].nunique())
    log["n_dates"] = int(len(all_dates))
    log["first_date"] = str(all_dates.min().date())
    log["last_date"] = str(all_dates.max().date())
    return df[["date", "ticker", "open", "high", "low", "close", "volume", "ret_valid"]], log


def build_membership(hist: pd.DataFrame, dates: pd.DatetimeIndex, tickers: list[str]):
    """Point-in-time membership matrix (dates x dataset tickers) and survivorship stats."""
    hist = hist.copy()
    hist["date"] = pd.to_datetime(hist["date"])
    hist = hist.sort_values("date").set_index("date")
    # For each trading date take the most recent membership list at or before it.
    idx = hist.index.searchsorted(dates, side="right") - 1
    if (idx < 0).any():
        raise ValueError("Membership file starts after price data")
    lists = [set(hist["tickers"].iloc[i].split(",")) for i in idx]

    member_symbol = {t: MEMBERSHIP_ALIASES.get(t, t) for t in tickers}
    mat = np.array([[member_symbol[t] in s for t in tickers] for s in lists])
    membership = pd.DataFrame(mat, index=dates, columns=tickers)

    dataset_syms = set(member_symbol.values())
    n_members = np.array([len(s) for s in lists])
    n_covered = np.array([len(s & dataset_syms) for s in lists])
    first, last = lists[0], lists[-1]
    stats = {
        "members_on_first_date": int(len(first)),
        "members_on_first_date_with_data": int(len(first & dataset_syms)),
        "members_on_first_date_missing": sorted(first - dataset_syms),
        "members_on_last_date": int(len(last)),
        "members_on_last_date_with_data": int(len(last & dataset_syms)),
        "avg_daily_coverage": float(np.mean(n_covered / n_members)),
        "dataset_tickers_never_members": sorted(t for t in tickers if not membership[t].any()),
    }
    coverage = pd.DataFrame({"n_members": n_members, "n_with_data": n_covered}, index=dates)
    return membership, coverage, stats


def build_sectors(current: pd.DataFrame, tickers: list[str]) -> pd.DataFrame:
    manual = pd.read_csv(REFERENCE_DIR / "sector_manual.csv").set_index("ticker")["sector"]
    cur = current.set_index("Symbol")["GICS Sector"]
    rows = []
    for t in tickers:
        sym = SECTOR_ALIASES.get(t, t)
        if sym in cur.index:
            rows.append((t, cur[sym], "datahub current GICS"))
        elif t in manual.index:
            rows.append((t, manual[t], "manual label (verify)"))
        else:
            rows.append((t, "Unknown", "missing"))
    return pd.DataFrame(rows, columns=["ticker", "sector", "sector_source"])


def build_all() -> dict:
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    raw = pd.read_csv(fetch("prices"))
    panel, log = clean_prices(raw)
    panel.to_parquet(PANEL_PATH, index=False)

    dates = pd.DatetimeIndex(sorted(panel["date"].unique()))
    tickers = sorted(panel["ticker"].unique())
    hist = pd.read_csv(fetch("membership"))
    membership, coverage, surv = build_membership(hist, dates, tickers)
    membership.to_parquet(MEMBERSHIP_PATH)
    coverage.to_parquet(PROCESSED_DIR / "coverage.parquet")

    sectors = build_sectors(pd.read_csv(fetch("sectors")), tickers)
    sectors.to_csv(SECTORS_PATH, index=False)

    report = {
        "cleaning": log,
        "survivorship": surv,
        "sector_sources": sectors["sector_source"].value_counts().to_dict(),
        "sources": {k: {"url": s.url, "sha256": s.sha256, "description": s.description,
                        "limitations": s.limitations} for k, s in SOURCES.items()},
    }
    QUALITY_PATH.write_text(json.dumps(report, indent=2))
    return report
