"""Fundamentals must be point-in-time: usable only after filing, first-reported values."""
import numpy as np
import pandas as pd

from quantlab.data.fundamentals import _pit_series


def test_value_available_only_after_filing_and_restatements_ignored():
    dates = pd.bdate_range("2020-01-01", "2020-12-31")
    recs = pd.DataFrame({
        "end": ["2019-12-31", "2019-12-31", "2020-03-31"],
        "filed": ["2020-02-14", "2021-02-12", "2020-05-01"],   # 2nd row = later restatement
        "val": [100.0, 999.0, 110.0],
    })
    s = _pit_series(recs, dates, "end")
    assert np.isnan(s.loc["2020-02-14"])                 # filing day itself: not yet usable
    assert s.loc["2020-02-17"] == 100.0                  # next trading day
    assert s.loc["2020-04-30"] == 100.0
    assert s.loc["2020-05-04"] == 110.0                  # newer period after its filing
    assert (s != 999.0).all()                            # restated value never used


def test_older_period_filed_late_does_not_override_newer():
    dates = pd.bdate_range("2020-01-01", "2020-12-31")
    recs = pd.DataFrame({"end": ["2020-03-31", "2019-12-31"],
                         "filed": ["2020-05-01", "2020-06-01"], "val": [110.0, 100.0]})
    s = _pit_series(recs, dates, "end")
    assert s.loc["2020-07-01"] == 110.0
