"""The formula language: safety, correctness of building blocks, and no look-ahead."""
import numpy as np
import pandas as pd
import pytest

from quantlab.signals.formula import EXAMPLES, FormulaError, evaluate, lookahead_check, parse
from quantlab.signals.library import abnormal_volume, past_return


@pytest.mark.parametrize("bad", [
    "__import__('os').system('ls')", "open.__class__", "close[0]", "lambda x: x",
    "[close]", "mean(close, n)", "mean(close, 1000)", "lag(close, -1)", "foo(close)",
    "close if r > 0 else open", "'text'", "mean(close)", "mean(x=close, n=5)", "", "5 + 3",
    "std(close, 2)", "close == open",
])
def test_rejects_unsafe_or_invalid(bad):
    with pytest.raises(FormulaError):
        parse(bad)


@pytest.mark.parametrize("name,text", EXAMPLES)
def test_examples_parse_and_run(mkt, name, text):
    out = evaluate(text, mkt)
    assert out.shape == mkt.close.shape
    assert out.iloc[100:].notna().any().any()


def test_ret_matches_library(mkt):
    a = evaluate("ret(5)", mkt)
    b = past_return(mkt, window=5)
    pd.testing.assert_frame_equal(a, b, check_exact=False, rtol=1e-12)


def test_lag_is_backward(mkt):
    a = evaluate("lag(close, 3)", mkt)
    pd.testing.assert_frame_equal(a, mkt.close.shift(3))


def test_rank_and_zscore_are_cross_sectional(mkt):
    rk = evaluate("rank(close)", mkt)
    assert rk.max(axis=1).max() <= 1.0 and rk.min(axis=1).min() > 0
    z = evaluate("zscore(volume)", mkt)
    assert np.allclose(z.mean(axis=1).iloc[5:], 0, atol=0.2)


def test_where_and_compare(mkt):
    out = evaluate("where(r > 0, 1, -1)", mkt)
    r = mkt.daily_returns("close")
    exp = pd.DataFrame(np.where(r > 0, 1.0, -1.0), index=r.index, columns=r.columns).where(r.notna())
    pd.testing.assert_frame_equal(out, exp)


def test_abnormal_volume_reproducible_by_formula(mkt):
    """The H1 signal, unstandardised, written as a formula."""
    f = evaluate("log(volume) - mean(lag(log(volume), 1), 20)", mkt)
    lib = abnormal_volume(mkt, lookback=20, window=1, standardize=False)
    pd.testing.assert_frame_equal(f.iloc[40:], lib.iloc[40:], check_exact=False, rtol=1e-9,
                                  atol=1e-12, check_names=False)


@pytest.mark.parametrize("name,text", EXAMPLES)
def test_examples_have_no_lookahead(mkt, name, text):
    assert lookahead_check(text, mkt, n_tickers=20)
