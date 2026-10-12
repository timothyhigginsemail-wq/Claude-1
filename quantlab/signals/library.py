"""Signal (hypothesis) library.

Every signal is a function of data known at the CLOSE of day t and returns a
wide DataFrame aligned to dates x tickers. Tests in tests/test_lookahead.py
verify that changing any data after t never changes the signal at t.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable

import numpy as np
import pandas as pd

from quantlab.data.loader import Market


def log_volume(mkt: Market) -> pd.DataFrame:
    return np.log(mkt.volume.where(mkt.volume > 0))


def abnormal_volume(mkt: Market, lookback: int = 20, window: int = 1,
                    standardize: bool = True) -> pd.DataFrame:
    """How unusual is recent volume relative to the stock's OWN history?

    recent_t   = mean of log(volume) over the last `window` days (t-window+1..t)
    baseline_t = mean of log(volume) over the `lookback` days BEFORE that window
    AV_t       = (recent_t - baseline_t) / std(baseline days)   if standardize

    Logs make the measure a ratio (AV = 0.69 unstandardised means volume doubled)
    and tame the extreme right skew of raw volume. The baseline excludes the
    recent window so a spike does not contaminate its own benchmark.
    """
    lv = log_volume(mkt)
    recent = lv.rolling(window, min_periods=window).mean()
    base = lv.shift(window).rolling(lookback, min_periods=max(5, lookback // 2))
    av = recent - base.mean()
    if standardize:
        sd = base.std()
        av = av / sd.where(sd > 1e-8)
    return av


def past_return(mkt: Market, window: int = 1, skip: int = 0) -> pd.DataFrame:
    """Close-to-close return over days t-skip-window+1 .. t-skip."""
    r = mkt.daily_returns("close")
    lr = np.log1p(r).rolling(window, min_periods=window).sum().shift(skip)
    return np.expm1(lr)


def cs_zscore(x: pd.DataFrame, universe: pd.DataFrame | None = None,
              clip: float = 3.0) -> pd.DataFrame:
    """Cross-sectional z-score each day (optionally within a universe), clipped."""
    if universe is not None:
        x = x.where(universe)
    z = x.sub(x.mean(axis=1), axis=0).div(x.std(axis=1), axis=0)
    return z.clip(-clip, clip)


@dataclass
class Hypothesis:
    key: str
    name: str
    statement: str
    mechanism: str
    predicted_sign: str
    compute: Callable[..., pd.DataFrame]
    params: dict = field(default_factory=dict)
    is_placebo: bool = False


def _av(mkt, lookback=20, window=1, **_):
    return abnormal_volume(mkt, lookback=lookback, window=window)


def _volume_reversal(mkt, lookback=20, window=1, **_):
    av = abnormal_volume(mkt, lookback=lookback, window=window)
    r = cs_zscore(past_return(mkt, window=window))
    return -r * av


def _reversal(mkt, window=5, **_):
    return -past_return(mkt, window=window)


def _volume_trend(mkt, lookback=120, window=20, **_):
    lv = log_volume(mkt)
    return lv.rolling(window, min_periods=window).mean() - \
        lv.rolling(lookback, min_periods=lookback // 2).mean()


def _placebo(mkt, seed=7, **_):
    rng = np.random.default_rng(seed)
    return pd.DataFrame(rng.standard_normal(mkt.close.shape), index=mkt.dates,
                        columns=mkt.tickers).where(mkt.close.notna())


HYPOTHESES: dict[str, Hypothesis] = {
    "abnormal_volume": Hypothesis(
        key="abnormal_volume",
        name="H1 · Abnormal volume",
        statement=("Stocks whose trading volume is unusually high relative to their own "
                   "recent history earn different subsequent returns than stocks with "
                   "unusually low volume."),
        mechanism=("Attention/visibility: a volume shock makes a stock visible to more "
                   "investors, raising demand and prices afterwards (Gervais, Kaniel & "
                   "Mingelgrin, 2001, 'The High-Volume Return Premium'). Alternatively, "
                   "volume may simply proxy for news, whose sign the signal ignores."),
        predicted_sign="Positive (high volume → higher future return)",
        compute=_av, params={"lookback": 20, "window": 1},
    ),
    "volume_reversal": Hypothesis(
        key="volume_reversal",
        name="H2 · Volume-amplified reversal",
        statement=("Price moves accompanied by abnormally high volume tend to reverse "
                   "more than moves on normal volume."),
        mechanism=("Liquidity provision: when some investors trade for non-informational "
                   "reasons (redemptions, hedging), prices move away from value and "
                   "market makers demand a premium to absorb the flow; the price later "
                   "reverts (Campbell, Grossman & Wang, 1993). Informed trading would "
                   "instead predict continuation (Llorente, Michaely, Saar & Wang, 2002)."),
        predicted_sign="Positive (signal = −return × abnormal volume)",
        compute=_volume_reversal, params={"lookback": 20, "window": 1},
    ),
    "reversal": Hypothesis(
        key="reversal",
        name="B1 · Short-term reversal (benchmark)",
        statement="Recent losers outperform recent winners over the following days.",
        mechanism=("Well-documented liquidity-provision effect (Lehmann 1990; Lo & "
                   "MacKinlay 1990). Used here as a known benchmark the volume signals "
                   "must beat or add to."),
        predicted_sign="Positive (signal = −past return)",
        compute=_reversal, params={"window": 5},
    ),
    "volume_trend": Hypothesis(
        key="volume_trend",
        name="H3 · Volume trend (slow)",
        statement="A sustained rise in volume over weeks predicts subsequent returns.",
        mechanism=("Slow-moving attention or changing investor base; possibly related to "
                   "the volume–momentum interaction (Lee & Swaminathan, 2000)."),
        predicted_sign="Unknown — exploratory",
        compute=_volume_trend, params={"lookback": 120, "window": 20},
    ),
    "placebo": Hypothesis(
        key="placebo",
        name="P0 · Placebo (pure noise)",
        statement="A random number. It cannot predict anything.",
        mechanism=("Calibration check: shows what 'no effect' looks like in this data, "
                   "including how often noise produces impressive-looking t-stats."),
        predicted_sign="Zero",
        compute=_placebo, params={"seed": 7}, is_placebo=True,
    ),
}


def compute_signal(mkt: Market, key: str, **params) -> pd.DataFrame:
    h = HYPOTHESES[key]
    p = {**h.params, **params}
    return h.compute(mkt, **p)
