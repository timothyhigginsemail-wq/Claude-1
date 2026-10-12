"""Time alignment of forward returns — the single most important property."""
import numpy as np
import pandas as pd
import pytest

from quantlab.data.loader import market_from_long
from quantlab.research.returns import compound_forward, forward_returns


@pytest.mark.parametrize("execution,price,lag", [("close_t", "close", 0), ("open_t1", "open", 1),
                                                 ("close_t1", "close", 1)])
@pytest.mark.parametrize("h", [1, 5, 20])
def test_forward_return_definition(mkt, execution, price, lag, h):
    """R^h_t = P_{t+lag+h} / P_{t+lag} - 1, exactly."""
    fwd = forward_returns(mkt, h, execution)
    P = getattr(mkt, price)
    expected = P.shift(-(lag + h)) / P.shift(-lag) - 1
    pd.testing.assert_frame_equal(fwd, expected, check_exact=False, rtol=1e-10, atol=1e-12)


def test_forward_return_nan_at_end(mkt):
    fwd = forward_returns(mkt, 5, "open_t1")
    assert fwd.iloc[-6:].isna().all().all()      # needs open of t+6
    assert fwd.iloc[-7].notna().all()


def test_invalid_return_propagates(panel):
    p = panel.copy()
    p["ret_valid"] = True
    bad_day = sorted(p.date.unique())[100]
    p.loc[(p.ticker == "S00") & (p.date == bad_day), "ret_valid"] = False
    m = market_from_long(p)
    fwd = forward_returns(m, 5, "close_t")
    i = m.dates.get_loc(bad_day)
    # Any 5-day window containing the invalid day-return must be NaN...
    assert fwd["S00"].iloc[i - 5:i].isna().all()
    # ...and windows that do not contain it are untouched.
    assert fwd["S00"].iloc[i].__class__ is not None and np.isfinite(fwd["S00"].iloc[i])
    assert np.isfinite(fwd["S00"].iloc[i - 6])


def test_compound_forward_simple():
    daily = pd.DataFrame({"a": [np.nan, 0.1, 0.1, -0.5, 0.2]})
    out = compound_forward(daily, 2, 0)
    assert out["a"].iloc[0] == pytest.approx(1.1 * 1.1 - 1)
    assert out["a"].iloc[1] == pytest.approx(1.1 * 0.5 - 1)
    assert out["a"].iloc[3:].isna().all()
