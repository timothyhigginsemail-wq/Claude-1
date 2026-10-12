import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from quantlab.data.loader import market_from_long  # noqa: E402


def make_panel(n_days=300, n_stocks=40, seed=0):
    rng = np.random.default_rng(seed)
    dates = pd.bdate_range("2015-01-01", periods=n_days)
    rows = []
    for j in range(n_stocks):
        r = rng.normal(0.0003, 0.015, n_days)
        close = 50 * np.exp(np.cumsum(r))
        open_ = close * np.exp(rng.normal(0, 0.004, n_days))
        high = np.maximum(open_, close) * 1.005
        low = np.minimum(open_, close) * 0.995
        vol = np.exp(rng.normal(14, 0.5, n_days))
        for i, d in enumerate(dates):
            rows.append((d, f"S{j:02d}", open_[i], high[i], low[i], close[i], vol[i]))
    return pd.DataFrame(rows, columns=["date", "ticker", "open", "high", "low", "close", "volume"])


@pytest.fixture(scope="session")
def panel():
    return make_panel()


@pytest.fixture(scope="session")
def mkt(panel):
    tick = sorted(panel.ticker.unique())
    sectors = pd.Series([f"Sec{i % 4}" for i in range(len(tick))], index=tick)
    return market_from_long(panel, sector=sectors)
