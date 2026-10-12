"""Precompute library-signal IC series used by the leaderboard. Run after changing
signals or data:   python scripts/precompute_library.py"""
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from quantlab.data.loader import eligible_universe, load_market  # noqa: E402
from quantlab.research.library_cache import DEFAULT, cache_path, compute_library_ics  # noqa: E402

if __name__ == "__main__":
    t = time.time()
    ds = sys.argv[1] if len(sys.argv) > 1 else "v3"
    m = load_market(ds)
    u = eligible_universe(m, min_price=DEFAULT["min_price"], liquidity_pct=DEFAULT["liquidity_pct"])
    df = compute_library_ics(m, u, DEFAULT["execution"])
    df.astype("float32").to_parquet(cache_path(ds))
    print(f"{df.shape[1]} series -> {cache_path(ds)} ({time.time() - t:.0f}s)")
    # parameter grids for the tunable hypotheses, and placebo nulls per horizon
    import pandas as pd
    from quantlab.research import robustness as rb
    from quantlab.research.library_cache import grid_path, placebo_path
    for hyp in ("abnormal_volume", "volume_reversal", "reversal"):
        ics, _ = rb.grid_ic(m, hyp, u, execution=DEFAULT["execution"])
        ics.astype("float32").to_parquet(grid_path(ds, hyp))
        print("grid", hyp, f"({time.time() - t:.0f}s)", flush=True)
    for h in (1, 2, 5, 10, 20):
        tt = rb.placebo_tstats(m, u, h, 200, DEFAULT["execution"], "research")
        pd.DataFrame({"t": tt}).to_parquet(placebo_path(ds, h))
        print("placebo", h, f"({time.time() - t:.0f}s)", flush=True)
