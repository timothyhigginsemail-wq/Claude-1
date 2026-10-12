import numpy as np
import pandas as pd

from quantlab.data.loader import eligible_universe
from quantlab.research.analysis import ic_by_horizon
from quantlab.research.decision import evaluate
from quantlab.research.pipeline import ResearchSpec, build_signal


def test_direction_flips_ic_sign(mkt):
    u = eligible_universe(mkt, min_history=30)
    a = build_signal(mkt, ResearchSpec(direction=1), u)
    b = build_signal(mkt, ResearchSpec(direction=-1), u)
    ta = ic_by_horizon(mkt, a, u, (1, 5), "open_t1", "full")
    tb = ic_by_horizon(mkt, b, u, (1, 5), "open_t1", "full")
    assert np.allclose(ta["mean_ic"], -tb["mean_ic"])


def test_decision_rules():
    base = dict(t_ic=3.5, mean_ic=0.02, years_same_sign=4, n_years=4, p_holm=0.01,
                t_fm_full=3.0, t_wf_oos=2.5, net_sharpe=1.0, breakeven_bps=20,
                assumed_cost_bps=5, dsr=0.99, holdout=None)
    assert evaluate(base)["verdict"].startswith("ADVANCE")
    assert evaluate({**base, "t_ic": 1.0})["verdict"].startswith("REJECT")
    assert evaluate({**base, "p_holm": 0.2})["verdict"] == "REVISE"
    assert evaluate({**base, "net_sharpe": 0.1})["verdict"] == "REVISE (implementation)"
    # the data-adequacy criterion always fails on this dataset
    crit = {c.name: c.status for c in evaluate(base)["criteria"]}
    assert crit["Data adequacy"] == "fail"
