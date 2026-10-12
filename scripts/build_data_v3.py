"""Rebuild dataset v3 end to end (needs network access to Yahoo, SEC and Ken French).

    python scripts/build_data_v3.py            # uses cached raw downloads when present
Steps: Yahoo prices -> validated panel -> Fama-French factors -> SEC earnings dates ->
SEC point-in-time fundamentals -> precomputed caches for the web app.
"""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def run(script, *args):
    print(f"\n=== {script} {' '.join(args)}", flush=True)
    subprocess.run([sys.executable, str(ROOT / "scripts" / script), *args], check=True)


if __name__ == "__main__":
    run("fetch_yahoo.py")
    from quantlab.config import PROCESSED_DIR
    from quantlab.data.build_v3 import build_v3
    rep = build_v3(PROCESSED_DIR / "v3")
    print(f"panel: {rep['accepted']} tickers, coverage avg {rep['coverage_avg']:.0%}")

    from quantlab.data.french import fetch_french
    fetch_french().loc["2004":].to_parquet(PROCESSED_DIR / "v3" / "ff_factors.parquet")

    run("fetch_sec.py")
    import pandas as pd
    from quantlab.data.earnings import earnings_events
    from quantlab.data.loader import load_market
    m = load_market("v3")
    ev, info = earnings_events(m.dates, m.tickers)
    ev.to_parquet(PROCESSED_DIR / "v3" / "earnings_events.parquet")
    pd.DataFrame([(k,) + v for k, v in info["sic"].items()],
                 columns=["ticker", "sic", "sic_description"]).to_csv(
        PROCESSED_DIR / "v3" / "sic_codes.csv", index=False)

    run("fetch_fundamentals.py")
    from quantlab.data.fundamentals import build_fundamentals
    load_market.cache_clear()
    m = load_market("v3")
    for k, v in build_fundamentals(m.dates, m.tickers, m.close.astype(float)).items():
        v.to_parquet(PROCESSED_DIR / "v3" / f"fund_{k}.parquet")

    run("precompute_library.py", "v3")
    run("precompute_library.py", "v1")
    print("\nDone. Commit data/processed/v3 to update the app.")
