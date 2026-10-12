import numpy as np
import pandas as pd

from quantlab.data.build import build_membership, clean_prices
from quantlab.research.analysis import sample_mask


def _raw(n=10):
    d = pd.bdate_range("2016-01-01", periods=n)
    close = np.full(n, 100.0)
    df = pd.DataFrame({"date": d.astype(str), "open": close, "high": close * 1.01,
                       "low": close * 0.99, "close": close.copy(), "volume": 1e6, "Name": "A"})
    return df


def test_bad_print_outside_range_removed():
    df = _raw()
    df.loc[4, "close"] = 50.0                 # close far below the day's low
    out, log = clean_prices(df)
    assert np.isnan(out.loc[4, "close"])
    assert len(log["bad_close_outside_range_set_missing"]) == 1


def test_spike_and_reverse_removed():
    df = _raw()
    df.loc[5, ["open", "high", "low", "close"]] = [70.0, 70.7, 69.3, 70.0]
    out, log = clean_prices(df)
    assert out.loc[5, ["open", "close"]].isna().all()
    assert log["spike_reversal_rows_set_missing"] == ["A 2016-01-08"]


def test_zero_volume_set_missing():
    df = _raw()
    df.loc[2, "volume"] = 0
    out, _ = clean_prices(df)
    assert np.isnan(out.loc[2, "volume"])


def test_point_in_time_membership():
    hist = pd.DataFrame({"date": ["2016-01-01", "2016-01-06"],
                         "tickers": ["A,B", "A,C"]})
    dates = pd.bdate_range("2016-01-04", periods=5)
    mem, cov, stats = build_membership(hist, dates, ["A", "B", "C"])
    assert mem.loc["2016-01-05"].tolist() == [True, True, False]
    assert mem.loc["2016-01-06"].tolist() == [True, False, True]


def test_research_sample_is_purged():
    dates = pd.bdate_range("2016-12-01", "2017-01-31")
    m = sample_mask(dates, "research", horizon=5, lag=1, holdout_start="2017-01-01")
    last = dates[m.values][-1]
    hs = dates.searchsorted(pd.Timestamp("2017-01-01"))
    # last research date + lag + horizon must be strictly before the holdout start index
    assert dates.get_loc(last) + 1 + 5 < hs
    assert not sample_mask(dates, "holdout", 5, 1, "2017-01-01")[:hs].any()
