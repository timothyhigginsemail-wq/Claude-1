import numpy as np
import pandas as pd
import pytest

from quantlab.content import interpret
from quantlab.content.glossary import GLOSSARY, help_text, stars
from quantlab.research.leaderboard import summarize
from quantlab.research.stats import reality_check


def _ics(T=800, K=15, strong=None, seed=0):
    rng = np.random.default_rng(seed)
    X = pd.DataFrame(rng.normal(0, 0.05, (T, K)), index=pd.bdate_range("2014-01-01", periods=T),
                     columns=[f"s{k}" for k in range(K)])
    if strong is not None:
        X[strong] += 0.012
    return X


def test_reality_check_noise_is_not_significant():
    ps = [reality_check(_ics(seed=s), horizon=1, n_boot=300, seed=s)["p"] for s in range(8)]
    assert np.mean(np.array(ps) < 0.05) <= 0.25


def test_reality_check_detects_a_real_signal():
    r = reality_check(_ics(strong="s3"), horizon=1, n_boot=300)
    assert r["best"] == "s3" and r["p"] < 0.05


def test_best_of_many_needs_higher_t():
    r = reality_check(_ics(K=30), horizon=1, n_boot=300)
    assert r["null_95"] > 2.5          # the luckiest of 30 noise signals beats |t| = 2


def test_leaderboard_adjusts_across_all_cells():
    X = _ics(K=6)
    ics = pd.concat({f"{c}@{h}": X[c] for c in X for h in (1, 5)}, axis=1)
    tab = summarize(ics, {}, {}, sample="full")
    assert tab.attrs["n_tests"] == 12
    assert (tab["p_holm"] >= tab["p_raw"] - 1e-12).all()


def test_glossary_entries_complete():
    for k, g in GLOSSARY.items():
        assert {"term", "what", "read", "guide", "trap"} <= set(g), k
        assert g["term"] in help_text(k)


def test_stars():
    assert stars(0.005) == "***" and stars(0.03) == "**" and stars(0.08) == "*"
    assert stars(0.5) == "" and stars(float("nan")) == ""


@pytest.mark.parametrize("fn,args", [
    (interpret.ic, (float("nan"), 1.0, 5)), (interpret.ic, (0.02, 3.5, 5)),
    (interpret.spread, (5.0, 1.0, 5)), (interpret.fm, (1.0, 2.5, 0.2, 0.5)),
    (interpret.sharpe, (0.8, -0.2, 1.8)), (interpret.costs, (3.0, 6.0, 0.5)),
    (interpret.alpha, (0.02, 1.1, 0.3)), (interpret.dsr, (0.4, 20)),
    (interpret.correlation, (0.6, "momentum")), (interpret.reality_check, (0.4, 22)),
])
def test_interpretations_are_text(fn, args):
    assert isinstance(fn(*args), str)


def test_interpretation_is_conservative():
    assert "not evidence" in interpret.ic(0.004, 1.2, 5)
    assert "includes zero" in interpret.sharpe(0.9, -0.1, 1.9)
    assert "exceed" in interpret.costs(3.0, 6.0, 0.6)
