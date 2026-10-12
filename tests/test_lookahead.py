"""Changing anything AFTER date t must never change what we know AT date t."""
import numpy as np
import pandas as pd
import pytest

from quantlab.data.loader import eligible_universe, market_from_long
from quantlab.research.analysis import regime_labels
from quantlab.research.factors import characteristics
from quantlab.signals.library import HYPOTHESES, compute_signal

CUT = 200


def perturbed_market(panel):
    p = panel.copy()
    dates = sorted(p.date.unique())
    after = p.date > dates[CUT]
    rng = np.random.default_rng(99)
    for c in ["open", "high", "low", "close"]:
        p.loc[after, c] *= np.exp(rng.normal(0, 0.2, after.sum()))
    p.loc[after, "volume"] *= np.exp(rng.normal(0, 1.0, after.sum()))
    return market_from_long(p)


@pytest.fixture(scope="module")
def pair(panel):
    return market_from_long(panel), perturbed_market(panel)


@pytest.mark.parametrize("key", [k for k in HYPOTHESES])
@pytest.mark.parametrize("window", [1, 5])
def test_signals_have_no_lookahead(pair, key, window):
    a, b = pair
    sa = compute_signal(a, key, window=window)
    sb = compute_signal(b, key, window=window)
    pd.testing.assert_frame_equal(sa.iloc[: CUT + 1], sb.iloc[: CUT + 1])
    if not HYPOTHESES[key].is_placebo:
        # sanity: the perturbation does change the future, so the test has power
        assert not sa.iloc[CUT + 5:].equals(sb.iloc[CUT + 5:])


def test_controls_have_no_lookahead(pair):
    a, b = pair
    ua, ub = eligible_universe(a, min_history=20), eligible_universe(b, min_history=20)
    pd.testing.assert_frame_equal(ua.iloc[: CUT + 1], ub.iloc[: CUT + 1])
    ca, cb = characteristics(a, ua), characteristics(b, ub)
    for k in ca:
        pd.testing.assert_frame_equal(ca[k].iloc[: CUT + 1], cb[k].iloc[: CUT + 1])


def test_regimes_have_no_lookahead(pair):
    a, b = pair
    ra = regime_labels(a, eligible_universe(a, min_history=20))
    rb = regime_labels(b, eligible_universe(b, min_history=20))
    pd.testing.assert_frame_equal(ra.iloc[: CUT + 1], rb.iloc[: CUT + 1])


def test_abnormal_volume_excludes_today_from_baseline(mkt):
    from quantlab.signals.library import abnormal_volume
    m2 = market_from_long(
        pd.DataFrame({"date": mkt.dates.repeat(1), "ticker": "X", "open": 1.0, "high": 1.0,
                      "low": 1.0, "close": 1.0, "volume": 1e6}))
    m2.volume.iloc[50] = 1e7          # a 10x spike on day 50
    m2.volume.iloc[:50] *= np.exp(np.random.default_rng(0).normal(0, 0.1, 50))[:, None]
    av = abnormal_volume(m2, lookback=20, window=1, standardize=False)
    # Unstandardised AV equals log(10) minus the baseline's mean log deviation (~0).
    assert av.iloc[50, 0] == pytest.approx(np.log(10), abs=0.1)
