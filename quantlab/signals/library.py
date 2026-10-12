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
    family: str = "Volume"
    reference: str = ""
    tunable: bool = True          # do the sidebar lookback/window settings apply?


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


# ---------------------------------------------------------------- published signals
# Each is oriented so that the PUBLISHED prediction is a positive IC.

def _ret(mkt):
    return mkt.daily_returns("close")


def _mkt_ret(mkt):
    """Equal-weighted return of point-in-time index members (no universe filters)."""
    return _ret(mkt).where(mkt.member.shift(1, fill_value=False)).mean(axis=1)


def _roll_beta_var(mkt, n=60):
    r, m = _ret(mkt), _mkt_ret(mkt)
    mp = n // 2
    cov = r.mul(m, axis=0).rolling(n, min_periods=mp).mean() - \
        r.rolling(n, min_periods=mp).mean().mul(m.rolling(n, min_periods=mp).mean(), axis=0)
    var_m = m.rolling(n, min_periods=mp).var(ddof=0)
    beta = cov.div(var_m, axis=0)
    var_r = r.rolling(n, min_periods=mp).var(ddof=0)
    return beta, var_r, var_m


def _mom(mkt, window, skip=21):
    return past_return(mkt, window=window, skip=skip)


def _high52(mkt, **_):
    hi = mkt.close.rolling(252, min_periods=200).max()
    return mkt.close / hi


def _sector_mean(mkt, x):
    sec = mkt.sector.reindex(x.columns)
    means = x.T.groupby(sec.values).transform("mean").T
    return means


def _ind_mom(mkt, **_):
    m = _mom(mkt, 105).where(mkt.member)
    return _sector_mean(mkt, m)


def _ind_adj_rev(mkt, **_):
    r = past_return(mkt, window=5).where(mkt.member)
    return -(r - _sector_mean(mkt, r))


def _low_vol(mkt, **_):
    return -_ret(mkt).rolling(60, min_periods=40).std()


def _ivol(mkt, **_):
    beta, var_r, var_m = _roll_beta_var(mkt, 60)
    resid_var = (var_r - beta.pow(2).mul(var_m, axis=0)).clip(lower=0)
    return -np.sqrt(resid_var)


def _low_beta(mkt, **_):
    return -_roll_beta_var(mkt, 60)[0]


def _max(mkt, **_):
    return -_ret(mkt).rolling(21, min_periods=15).max()


def _amihud(mkt, **_):
    illiq = (_ret(mkt).abs() / mkt.dollar_volume.where(mkt.dollar_volume > 0)) * 1e9
    return np.log(illiq.rolling(21, min_periods=15).mean())


def _low_dvol(mkt, **_):
    return -np.log(mkt.dollar_volume.rolling(60, min_periods=40).mean())


def _neg_skew(mkt, **_):
    return -_ret(mkt).rolling(60, min_periods=40).skew()


def _overnight(mkt, **_):
    ovn = (mkt.open / mkt.close.shift(1) - 1).where(mkt.ret_valid)
    return np.log1p(ovn).rolling(21, min_periods=15).sum()


def _low_range(mkt, **_):
    return -np.log(mkt.high / mkt.low).rolling(21, min_periods=15).mean()


def _vol_of_volume(mkt, **_):
    return -log_volume(mkt).rolling(60, min_periods=40).std()


def _add(key, name, family, statement, mechanism, sign, fn, ref):
    HYPOTHESES[key] = Hypothesis(key=key, name=name, statement=statement, mechanism=mechanism,
                                 predicted_sign=sign, compute=fn, family=family,
                                 reference=ref, tunable=False)


for _k, _n, _f, _st, _me, _sg, _fn, _rf in [
    ("mom_12_1", "M1 · Momentum 12-1", "Momentum",
     "Stocks with high returns over the past year (skipping the last month) keep outperforming.",
     "Investor under-reaction to news, then slow diffusion; possibly compensation for crash risk.",
     "Positive", lambda m, **_: _mom(m, 231), "Jegadeesh & Titman (1993)"),
    ("mom_6_1", "M2 · Momentum 6-1", "Momentum",
     "Six-month winners (skipping the last month) outperform six-month losers.",
     "As 12-1 momentum, shorter formation window.", "Positive",
     lambda m, **_: _mom(m, 105), "Jegadeesh & Titman (1993)"),
    ("mom_3_1", "M3 · Momentum 3-1", "Momentum",
     "Three-month winners (skipping the last month) outperform.",
     "Short-window momentum; weaker and noisier in the literature.", "Positive",
     lambda m, **_: _mom(m, 42), "Jegadeesh & Titman (1993), shorter variant"),
    ("high_52w", "M4 · Near 52-week high", "Momentum",
     "Stocks trading close to their 52-week high outperform those far below it.",
     "Anchoring: investors treat the 52-week high as a reference point and under-react to "
     "news that pushes prices toward it.", "Positive", _high52, "George & Hwang (2004)"),
    ("ind_mom", "M5 · Industry momentum", "Momentum",
     "Stocks in sectors with strong past returns outperform.",
     "Information diffuses slowly across firms in the same industry.", "Positive",
     _ind_mom, "Moskowitz & Grinblatt (1999)"),
    ("rev_1d", "R1 · 1-day reversal", "Reversal",
     "Yesterday's losers outperform yesterday's winners over the next days.",
     "Liquidity provision and bid-ask bounce.", "Positive",
     lambda m, **_: -past_return(m, window=1), "Lehmann (1990); Lo & MacKinlay (1990)"),
    ("rev_21d", "R2 · 1-month reversal", "Reversal",
     "Last month's losers outperform last month's winners.",
     "Overreaction and liquidity effects at the monthly horizon.", "Positive",
     lambda m, **_: -past_return(m, window=21), "Jegadeesh (1990)"),
    ("ind_adj_rev", "R3 · Industry-adjusted reversal", "Reversal",
     "Stocks that fell relative to their own sector over the past week rebound.",
     "Removing the sector component isolates stock-specific (liquidity) moves, which "
     "reverse more reliably.", "Positive", _ind_adj_rev, "Da, Liu & Schaumburg (2014)"),
    ("low_vol", "V1 · Low volatility", "Risk",
     "Less volatile stocks earn higher risk-adjusted (and often raw) returns.",
     "Leverage constraints and lottery preferences push investors toward risky stocks, "
     "overpricing them.", "Positive", _low_vol, "Ang, Hodrick, Xing & Zhang (2006); Baker et al. (2011)"),
    ("ivol", "V2 · Low idiosyncratic volatility", "Risk",
     "Stocks with low stock-specific (non-market) volatility outperform.",
     "Same as low volatility; the 'idiosyncratic volatility puzzle'.", "Positive", _ivol,
     "Ang, Hodrick, Xing & Zhang (2006)"),
    ("low_beta", "V3 · Low beta (betting against beta)", "Risk",
     "Low-beta stocks earn more than CAPM predicts relative to high-beta stocks.",
     "Leverage-constrained investors buy high-beta stocks instead of borrowing.", "Positive",
     _low_beta, "Frazzini & Pedersen (2014)"),
    ("max_ret", "V4 · Lottery stocks (MAX)", "Risk",
     "Stocks with a very large recent one-day gain underperform.",
     "Investors overpay for lottery-like payoffs.", "Positive (signal = −max daily return)",
     _max, "Bali, Cakici & Whitelaw (2011)"),
    ("neg_skew", "V5 · Low skewness", "Risk",
     "Stocks with positively skewed recent returns underperform.",
     "Preference for skewness (lottery demand).", "Positive (signal = −skewness)",
     _neg_skew, "Boyer, Mitton & Vorkink (2010); Amaya et al. (2015)"),
    ("low_range", "V6 · Low high-low range", "Risk",
     "Stocks with narrow daily trading ranges outperform.",
     "Range is an efficient volatility estimator (Parkinson); tests the low-vol effect "
     "with a different measure.", "Positive", _low_range, "Parkinson (1980) estimator; low-vol literature"),
    ("amihud", "L1 · Illiquidity (Amihud)", "Liquidity",
     "Less liquid stocks — those whose price moves more per dollar traded — earn a premium.",
     "Investors demand compensation for holding hard-to-trade stocks.", "Positive",
     _amihud, "Amihud (2002)"),
    ("low_dvol", "L2 · Low dollar volume", "Liquidity",
     "Stocks with low trading activity outperform high-activity stocks.",
     "Liquidity premium; also a proxy for size and investor attention.", "Positive",
     _low_dvol, "Datar, Naik & Radcliffe (1998); Brennan, Chordia & Subrahmanyam (1998)"),
    ("vol_of_volume", "L3 · Stable volume", "Liquidity",
     "Stocks whose trading volume is more variable earn LOWER returns.",
     "Surprising result reported by Chordia, Subrahmanyam & Anshuman (2001); mechanism "
     "debated.", "Positive (signal = −variability of volume)", _vol_of_volume,
     "Chordia, Subrahmanyam & Anshuman (2001)"),
    ("overnight", "O1 · Overnight momentum", "Intraday",
     "Stocks with high recent overnight (close-to-open) returns keep earning high "
     "overnight returns.", "Different clienteles trade overnight vs. intraday; their "
     "persistent demand shows up in overnight returns.", "Positive", _overnight,
     "Lou, Polk & Skouras (2019)"),
]:
    _add(_k, _n, _f, _st, _me, _sg, _fn, _rf)

for _k in ("abnormal_volume", "volume_reversal", "volume_trend"):
    HYPOTHESES[_k].family = "Volume"
HYPOTHESES["abnormal_volume"].reference = "Gervais, Kaniel & Mingelgrin (2001)"
HYPOTHESES["volume_reversal"].reference = "Campbell, Grossman & Wang (1993)"
HYPOTHESES["volume_trend"].reference = "Lee & Swaminathan (2000)"
HYPOTHESES["reversal"].family = "Reversal"
HYPOTHESES["reversal"].reference = "Lehmann (1990)"
HYPOTHESES["reversal"].tunable = True
HYPOTHESES["placebo"].family = "Placebo"
HYPOTHESES["placebo"].tunable = False
HYPOTHESES["volume_trend"].tunable = False


def compute_signal(mkt: Market, key: str, **params) -> pd.DataFrame:
    h = HYPOTHESES[key]
    p = {**h.params, **params}
    out = h.compute(mkt, **p)
    return out.replace([np.inf, -np.inf], np.nan)
