"""Precomputed daily IC series for every library signal (for speed on the web app).

Built by scripts/precompute_library.py for the DEFAULT universe and execution
(min price $5, no liquidity cut, next-open). Other settings are computed live.
"""
from __future__ import annotations

import pandas as pd

from quantlab.config import DATASETS, PROCESSED_DIR
from quantlab.data.loader import Market
from quantlab.research.returns import forward_returns
from quantlab.research.stats import rank_ic
from quantlab.signals.library import HYPOTHESES, compute_signal

CACHE_PATH = PROCESSED_DIR / "library_ics.parquet"   # v1 (legacy location)


def cache_path(dataset: str = "v1"):
    return DATASETS[dataset]["dir"] / "library_ics.parquet"
HORIZONS = (1, 5, 10, 20)
DEFAULT = {"min_price": 5.0, "liquidity_pct": 0.0, "execution": "open_t1"}


def library_keys() -> list[str]:
    return [k for k, h in HYPOTHESES.items() if not h.is_placebo]


def compute_library_ics(mkt: Market, universe: pd.DataFrame, execution: str = "open_t1",
                        horizons=HORIZONS) -> pd.DataFrame:
    fwd = {h: forward_returns(mkt, h, execution) for h in horizons}
    out = {}
    for k in library_keys():
        sig = compute_signal(mkt, k)
        for h in horizons:
            out[f"{k}@{h}"] = rank_ic(sig, fwd[h], universe)
    return pd.DataFrame(out)


def grid_path(dataset: str, hypothesis: str):
    return DATASETS[dataset]["dir"] / f"grid_{hypothesis}.parquet"


def placebo_path(dataset: str, horizon: int):
    return DATASETS[dataset]["dir"] / f"placebo_h{horizon}.parquet"


def load_grid(dataset: str, hypothesis: str):
    p = grid_path(dataset, hypothesis)
    if not p.exists():
        return None
    ics = pd.read_parquet(p).astype(float)
    ics.index = pd.to_datetime(ics.index)
    rows = []
    for c in ics:
        lb, w, h = (int(x.split("=")[1]) for x in c.split())
        rows.append({"config": c, "lookback": lb, "window": w, "horizon": h})
    return ics, pd.DataFrame(rows).set_index("config")


def load_placebo(dataset: str, horizon: int):
    p = placebo_path(dataset, horizon)
    return pd.read_parquet(p)["t"].values if p.exists() else None


def is_default(min_price: float, liquidity_pct: float, execution: str) -> bool:
    return (min_price, liquidity_pct, execution) == (DEFAULT["min_price"],
                                                     DEFAULT["liquidity_pct"],
                                                     DEFAULT["execution"])


def load_cached(dataset: str = "v1") -> pd.DataFrame | None:
    path = cache_path(dataset)
    if not path.exists():
        return None
    df = pd.read_parquet(path)
    df.index = pd.to_datetime(df.index)
    expected = {f"{k}@{h}" for k in library_keys() for h in HORIZONS}
    return df if expected <= set(df.columns) else None
