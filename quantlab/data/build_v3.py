"""Build dataset v3: ~20 years of daily data for every S&P 500 member since 2005.

Inputs (data/raw/, not committed; re-fetched by scripts/fetch_yahoo.py):
  yahoo/*.parquet                    Yahoo Finance daily OHLC, adjusted close, volume
  sp500_historical_components.csv    point-in-time membership (fja05680/sp500)
Outputs (data/processed/v3/):
  panel.parquet, membership.parquet, coverage.parquet, sectors.csv, quality_report.json

Validation of each ticker (Yahoo re-uses old symbols for new companies, and
renamed companies move to new symbols):
  * coverage — Yahoo prices on >= 80% of the days the ticker was an index member
  * size     — median dollar volume during membership >= $5m/day
Tickers failing either are dropped and listed in the quality report.
"""
from __future__ import annotations

import glob
import json

import numpy as np
import pandas as pd

from quantlab.config import RAW_DIR, REFERENCE_DIR
from quantlab.data.build import clean_prices

START = "2005-01-03"
MIN_COVERAGE = 0.80
MIN_DOLLAR_VOLUME = 5e6
BUFFER_BEFORE = 300      # trading days of history kept before first membership (signals)
BUFFER_AFTER = 30        # days kept after removal (positions still being held)


def load_yahoo() -> pd.DataFrame:
    frames = []
    for f in sorted(glob.glob(str(RAW_DIR / "yahoo" / "*.parquet"))):
        d = pd.read_parquet(f)
        if len(d):
            frames.append(d)
    y = pd.concat(frames, ignore_index=True)
    y["date"] = pd.to_datetime(y["date"]).dt.tz_localize(None).dt.normalize()
    y = y.rename(columns={"Open": "open", "High": "high", "Low": "low", "Close": "close",
                          "Adj Close": "adj_close", "Volume": "volume"})
    y = y.drop_duplicates(["ticker", "date"], keep="first")
    return y[["date", "ticker", "yahoo", "open", "high", "low", "close", "adj_close", "volume"]]


def membership_matrix(dates: pd.DatetimeIndex, tickers) -> pd.DataFrame:
    h = pd.read_csv(RAW_DIR / "sp500_historical_components.csv", parse_dates=["date"])
    h = h.sort_values("date").set_index("date")
    idx = h.index.searchsorted(dates, side="right") - 1
    lists = [set(h["tickers"].iloc[i].split(",")) for i in idx]
    mat = np.array([[t in s for t in tickers] for s in lists])
    n_members = np.array([len(s) for s in lists])
    return pd.DataFrame(mat, index=dates, columns=tickers), n_members, lists


def build_v3(out_dir) -> dict:
    out_dir.mkdir(parents=True, exist_ok=True)
    y = load_yahoo()
    cal = y.loc[y["ticker"] == "AAPL", "date"]
    dates = pd.DatetimeIndex(sorted(cal[cal >= START].unique()))
    y = y[y["date"].isin(dates)]

    h = pd.read_csv(RAW_DIR / "sp500_historical_components.csv", parse_dates=["date"])
    ever = set()
    for t in h[h["date"] >= "2004-12-01"]["tickers"]:
        ever |= set(t.split(","))
    member_all, n_members, lists = membership_matrix(dates, sorted(ever))

    report = {"n_candidate_tickers": len(ever), "dropped": {}, "dropped_spells": {},
              "accepted": 0}
    keep, frames = [], []
    accepted_member = pd.DataFrame(False, index=dates, columns=sorted(ever))
    for t, g in y.groupby("ticker"):
        if t not in member_all:
            continue
        mem = member_all[t].values
        if not mem.any():
            continue
        g = g.set_index("date").reindex(dates)
        g.index.name = "date"
        # Validate each membership SPELL separately: the same symbol can belong to
        # different companies in different periods (e.g. CEG, DOW).
        spells, i, n = [], 0, len(mem)
        while i < n:
            if mem[i]:
                j = i
                while j + 1 < n and (mem[j + 1] or (j + 22 < n and mem[j + 1:j + 22].any())):
                    j += 1
                spells.append((i, j))
                i = j + 1
            else:
                i += 1
        ok_spells = []
        for a, b in spells:
            days = dates[a:b + 1][mem[a:b + 1]]
            cov = g.loc[days, "close"].notna().mean()
            dv = (g["close"] * g["volume"]).loc[days].median()
            label = f"{t} {dates[a].date()}..{dates[b].date()}"
            if cov < MIN_COVERAGE:
                report["dropped_spells"][label] = f"coverage {cov:.0%} (symbol reused or history missing)"
            elif not np.isfinite(dv) or dv < MIN_DOLLAR_VOLUME:
                report["dropped_spells"][label] = f"median $ volume {dv / 1e6:.1f}m (not S&P-size)"
            else:
                ok_spells.append((a, b))
        if not ok_spells:
            report["dropped"][t] = "no membership period covered by Yahoo data"
            continue
        keep_rows = np.zeros(n, dtype=bool)
        for a, b in ok_spells:
            accepted_member.iloc[a:b + 1, accepted_member.columns.get_loc(t)] = mem[a:b + 1]
            keep_rows[max(a - BUFFER_BEFORE, 0):min(b + BUFFER_AFTER, n - 1) + 1] = True
        g = g[keep_rows].dropna(subset=["close"]).reset_index()
        g["ticker"] = t
        frames.append(g)
        keep.append(t)
    report["accepted"] = len(keep)
    raw = pd.concat(frames, ignore_index=True)

    # Yahoo's Close is split-adjusted; Adj Close also reinvests dividends. Keep both:
    # 'close' for price filters and dollar volume, 'adj_close' for total returns.
    panel, log = clean_prices(raw.rename(columns={"ticker": "Name"})[
        ["date", "open", "high", "low", "close", "volume", "Name"]].assign(
        date=lambda d: d["date"].astype(str)))
    adj = raw.set_index(["date", "ticker"])["adj_close"]
    panel = panel.join(adj, on=["date", "ticker"])
    panel.loc[panel["close"].isna(), "adj_close"] = np.nan
    for c in ["open", "high", "low", "close", "adj_close", "volume"]:
        panel[c] = panel[c].astype("float32")
    panel.to_parquet(out_dir / "panel.parquet", index=False)

    tickers = sorted(keep)
    member = accepted_member[tickers]
    member.to_parquet(out_dir / "membership.parquet")
    n_cov = member.sum(axis=1).values
    pd.DataFrame({"n_members": n_members, "n_with_data": n_cov}, index=dates).to_parquet(
        out_dir / "coverage.parquet")

    # Sectors: current GICS where known, hand labels for the 2013-18 set, else Unknown.
    from quantlab.data.build import SECTOR_ALIASES
    cur = pd.read_csv(RAW_DIR / "sp500_constituents_current.csv").set_index("Symbol")["GICS Sector"]
    manual = pd.read_csv(REFERENCE_DIR / "sector_manual.csv").set_index("ticker")["sector"]
    ren = pd.read_csv(REFERENCE_DIR / "yahoo_renames.csv").dropna(subset=["yahoo_symbol"]) \
        .set_index("membership_ticker")["yahoo_symbol"]
    rows = []
    for t in tickers:
        for cand in (t, ren.get(t), SECTOR_ALIASES.get(t)):
            if cand is not None and cand in cur.index:
                rows.append((t, cur[cand], "datahub current GICS"))
                break
        else:
            if t in manual.index:
                rows.append((t, manual[t], "manual label (verify)"))
            else:
                rows.append((t, "Unknown", "missing"))
    sectors = pd.DataFrame(rows, columns=["ticker", "sector", "sector_source"])
    sectors.to_csv(out_dir / "sectors.csv", index=False)

    ratio = n_cov / n_members
    report.update({
        "cleaning": {k: v for k, v in log.items() if k != "extreme_return_flags"},
        "n_extreme_return_flags": len(log["extreme_return_flags"]),
        "extreme_return_flags": log["extreme_return_flags"][:200],
        "first_date": str(dates[0].date()), "last_date": str(dates[-1].date()),
        "n_dates": len(dates),
        "coverage_first_date": float(ratio[0]), "coverage_last_date": float(ratio[-1]),
        "coverage_avg": float(ratio.mean()),
        "coverage_by_year": {str(yr): float(ratio[dates.year == yr].mean())
                             for yr in sorted(set(dates.year))},
        "sector_sources": sectors["sector_source"].value_counts().to_dict(),
        "never_found_on_yahoo": sorted(ever - set(y["ticker"].unique())),
        "sources": {
            "prices": "Yahoo Finance chart API via yfinance 1.7 / direct client (scripts/fetch_yahoo.py)",
            "membership": "github.com/fja05680/sp500 (point-in-time S&P 500 lists)",
            "limitations": (
                "Companies that were delisted, acquired or went bankrupt are mostly ABSENT "
                "(Yahoo keeps only live symbols) — survivorship bias remains, measured above. "
                "Adjusted closes include dividends and splits, but spin-offs are not "
                "reliably adjusted. Volume is split-adjusted. Sectors are current, not "
                "point-in-time."),
        },
    })
    (out_dir / "quality_report.json").write_text(json.dumps(report, indent=2, default=str))
    return report
