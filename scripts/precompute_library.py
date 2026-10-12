"""Precompute library-signal IC series used by the leaderboard. Run after changing
signals or data:   python scripts/precompute_library.py"""
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from quantlab.data.loader import eligible_universe, load_market  # noqa: E402
from quantlab.research.library_cache import CACHE_PATH, DEFAULT, compute_library_ics  # noqa: E402

if __name__ == "__main__":
    t = time.time()
    m = load_market()
    u = eligible_universe(m, min_price=DEFAULT["min_price"], liquidity_pct=DEFAULT["liquidity_pct"])
    df = compute_library_ics(m, u, DEFAULT["execution"])
    df.astype("float32").to_parquet(CACHE_PATH)
    print(f"{df.shape[1]} series -> {CACHE_PATH} ({time.time() - t:.0f}s)")
