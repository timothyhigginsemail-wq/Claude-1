"""Earnings-announcement dates from SEC EDGAR 8-K filings (Item 2.02 'Results of
Operations and Financial Condition').

Timing rule (point-in-time): the filing's acceptance time is converted to New York time.
  accepted before 09:30  -> the market can react the SAME trading day
  accepted 09:30-16:00   -> same trading day (intraday release)
  accepted after 16:00   -> the NEXT trading day is the first reaction day
Caveats: companies sometimes file the 8-K a little after the press release, so a few
dates may be a day late; 8-K 'items' tagging is reliable from about 2004 onward.
"""
from __future__ import annotations

import glob
import json

import numpy as np
import pandas as pd

from quantlab.config import RAW_DIR


def _filings(j: dict):
    blocks = [j.get("filings", {}).get("recent", {})] + list(j.get("_extra", []))
    for b in blocks:
        forms, items, acc = b.get("form", []), b.get("items", []), b.get("acceptanceDateTime", [])
        for f, it, a in zip(forms, items, acc):
            if f in ("8-K", "8-K/A") and "2.02" in (it or "") and f == "8-K":
                yield a


def earnings_events(dates: pd.DatetimeIndex, tickers, raw_dir=RAW_DIR / "sec") -> tuple[pd.DataFrame, dict]:
    cik_map = json.loads((raw_dir / "ticker_cik.json").read_text())
    ev = pd.DataFrame(False, index=dates, columns=list(tickers))
    sic = {}
    counts = {}
    for t in tickers:
        cik = cik_map.get(t)
        if cik is None:
            continue
        path = raw_dir / f"CIK{int(cik):010d}.json"
        if not path.exists():
            continue
        j = json.loads(path.read_text())
        sic[t] = (j.get("sic"), j.get("sicDescription"))
        stamps = pd.to_datetime(list(_filings(j)), utc=True, errors="coerce").dropna()
        if len(stamps) == 0:
            continue
        ny = stamps.tz_convert("America/New_York")
        day = ny.tz_localize(None).normalize()
        after_close = (ny.hour > 16) | ((ny.hour == 16) & (ny.minute > 0))
        # first trading day on/after the release day, then one more if after the close
        pos = dates.searchsorted(day)
        pos = np.where(after_close, pos + 1, pos)
        pos = pos[(pos >= 0) & (pos < len(dates))]
        if len(pos):
            ev.iloc[np.unique(pos), ev.columns.get_loc(t)] = True
            counts[t] = int(len(np.unique(pos)))
    return ev, {"tickers_with_events": len(counts), "events": int(ev.values.sum()), "sic": sic}
