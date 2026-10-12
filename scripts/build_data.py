"""Rebuild data/processed from pinned raw sources.  Usage: python scripts/build_data.py"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from quantlab.data.build import build_all  # noqa: E402

if __name__ == "__main__":
    rep = build_all()
    c, s = rep["cleaning"], rep["survivorship"]
    print(f"{c['clean_rows']} rows, {c['n_tickers']} tickers, {c['first_date']}..{c['last_date']}")
    print(f"Extreme-return flags: {len(c['extreme_return_flags'])}; "
          f"tickers with gaps: {len(c['tickers_with_internal_gaps'])}")
    print(f"Members on first date: {s['members_on_first_date']}, with data: "
          f"{s['members_on_first_date_with_data']}")
    print("Sector sources:", rep["sector_sources"])
