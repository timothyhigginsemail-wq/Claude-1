import numpy as np
import pandas as pd
import pytest
from scipy import stats as sps

from quantlab.research.factors import fama_macbeth, neutralize
from quantlab.signals.library import cs_zscore
from quantlab.research.stats import (benjamini_hochberg, deflated_sharpe, holm, mean_stats,
                                     newey_west_se, probabilistic_sharpe, rank_ic)


def test_nw_equals_iid_se_with_zero_lags():
    x = np.random.default_rng(0).normal(size=500)
    assert newey_west_se(x, lags=0) == pytest.approx(x.std(ddof=0) / np.sqrt(500))


def test_nw_inflates_for_overlapping_data():
    rng = np.random.default_rng(1)
    e = rng.normal(size=3000)
    x = pd.Series(e).rolling(10).sum().dropna().values   # overlapping 10-day sums
    naive = x.std() / np.sqrt(len(x))
    nw = newey_west_se(x, lags=9)
    assert nw > 2.5 * naive                              # theory: ~sqrt(10)=3.2


def test_nw_t_calibrated_under_null():
    """With overlap-induced dependence, NW t-stats should reject ~5% at |t|>1.96."""
    rng = np.random.default_rng(2)
    rej = 0
    for _ in range(300):
        x = pd.Series(rng.normal(size=1005)).rolling(5).mean().dropna()
        rej += abs(mean_stats(x, horizon=5)["t_nw"]) > 1.96
    assert 0.01 < rej / 300 < 0.11


def test_rank_ic_matches_scipy():
    rng = np.random.default_rng(3)
    s = pd.DataFrame(rng.normal(size=(5, 50)))
    f = s * 0.3 + pd.DataFrame(rng.normal(size=(5, 50)))
    u = pd.DataFrame(True, index=s.index, columns=s.columns)
    ic = rank_ic(s, f, u)
    for t in range(5):
        assert ic[t] == pytest.approx(sps.spearmanr(s.iloc[t], f.iloc[t])[0])


def test_multiple_testing_adjustments():
    p = np.array([0.01, 0.04, 0.03, 0.005])
    assert np.allclose(holm(p), [0.03, 0.06, 0.06, 0.02])
    assert np.allclose(benjamini_hochberg(p), [0.02, 0.04, 0.04, 0.02])


def test_psr_and_dsr_behave():
    assert probabilistic_sharpe(0.0, 0.0, 1000, 0, 3) == pytest.approx(0.5)
    r = pd.Series(np.random.default_rng(4).normal(0.001, 0.01, 1000))
    d1 = deflated_sharpe(r, n_trials=1)["dsr"]
    d100 = deflated_sharpe(r, n_trials=100)["dsr"]
    assert d100 < d1


def test_fama_macbeth_recovers_coefficient():
    rng = np.random.default_rng(5)
    T, N = 200, 300
    x = pd.DataFrame(rng.normal(size=(T, N)))
    c = pd.DataFrame(rng.normal(size=(T, N)))
    y = 0.02 * x - 0.01 * c + pd.DataFrame(rng.normal(scale=0.05, size=(T, N)))
    u = pd.DataFrame(True, index=x.index, columns=x.columns)
    fm = fama_macbeth(y, {"x": x, "c": c}, u)
    # regressors are z-scored (sd ≈ 1) so coefficients ≈ true betas
    assert fm["x"].mean() == pytest.approx(0.02, abs=0.002)
    assert fm["c"].mean() == pytest.approx(-0.01, abs=0.002)


def test_neutralized_signal_is_orthogonal():
    rng = np.random.default_rng(6)
    T, N = 20, 200
    c = pd.DataFrame(rng.normal(size=(T, N)))
    s = 2 * c + pd.DataFrame(rng.normal(size=(T, N)))
    u = pd.DataFrame(True, index=s.index, columns=s.columns)
    r = neutralize(s, {"c": c}, u)
    zc = cs_zscore(c, u)          # neutralisation is against the (clipped) z-score
    for t in range(T):
        assert abs(np.corrcoef(r.iloc[t], zc.iloc[t])[0, 1]) < 1e-8
