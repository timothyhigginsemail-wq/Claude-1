"""Run one research specification end-to-end and record it.

Every run is appended to experiments/registry.csv — a permanent trial log, so
the number of configurations tried (needed for multiple-testing corrections)
is never forgotten. Full results go to experiments/runs/<id>.json.

Usage:
    python scripts/run_experiment.py                       # H1 defaults
    python scripts/run_experiment.py --hypothesis volume_reversal --horizon 5
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

from quantlab.config import EXPERIMENTS_DIR, HOLDOUT_START  # noqa: E402
from quantlab.data.loader import load_market  # noqa: E402
from quantlab.portfolio.backtest import CostSpec, performance, run_backtest  # noqa: E402
from quantlab.portfolio.construct import PortfolioSpec  # noqa: E402
from quantlab.research import robustness as rb  # noqa: E402
from quantlab.research.analysis import ic_by_horizon, sample_mask  # noqa: E402
from quantlab.research.decision import evaluate  # noqa: E402
from quantlab.research.factors import characteristics  # noqa: E402
from quantlab.research.pipeline import (  # noqa: E402
    ResearchSpec, build_signal, build_universe, fm_progression, restrict,
)
from quantlab.research.returns import execution_params, forward_returns  # noqa: E402
from quantlab.research.stats import deflated_sharpe, holm, rank_ic  # noqa: E402


def git_rev() -> str:
    try:
        return subprocess.check_output(["git", "rev-parse", "--short", "HEAD"], cwd=ROOT,
                                       text=True).strip()
    except Exception:
        return "unknown"


def n_registered_trials() -> int:
    reg = EXPERIMENTS_DIR / "registry.csv"
    if not reg.exists():
        return 0
    return len(pd.read_csv(reg))


def run(spec: ResearchSpec, pspec: PortfolioSpec, cspec: CostSpec, unlock_holdout: bool) -> dict:
    mkt = load_market()
    u = build_universe(mkt, spec)
    chars = characteristics(mkt, u)
    sig = build_signal(mkt, spec, u, chars)
    _, lag = execution_params(spec.execution)
    h = spec.horizon

    ic_tab = ic_by_horizon(mkt, sig, u, (1, 2, 5, 10, 20), spec.execution, "research")
    ic = ic_tab.loc[h]
    s = rank_ic(sig, forward_returns(mkt, h, spec.execution), u)
    s = s[sample_mask(s.index, "research", h, lag)]
    by_year = s.groupby(s.index.year).mean()
    sign = np.sign(ic.mean_ic) or 1
    fm = fm_progression(mkt, sig, u, chars, h, spec.execution, "research")
    grid_key = spec.hypothesis if spec.hypothesis != "placebo" else "abnormal_volume"
    ics, cfg = rb.grid_ic(mkt, grid_key, u, execution=spec.execution)
    gs = rb.grid_summary(ics, cfg, "research", lag)
    key = f"lb={spec.lookback} w={spec.window} h={h}"
    p_holm = float(gs.loc[key, "p_holm"]) if (key in gs.index and spec.neutralization == "none") \
        else float(holm(np.append(gs["p_nw"].values, ic.p_nw))[-1])
    wf = rb.walk_forward(ics, cfg, lag=lag, end=pd.Timestamp(HOLDOUT_START))
    bt = run_backtest(mkt, sig, u, pspec, cspec, spec.execution, beta=chars["beta"])
    g = restrict(bt.daily["gross"], "research", pspec.holding, lag)
    n = restrict(bt.daily["net"], "research", pspec.holding, lag)
    to = restrict(bt.daily["turnover"], "research", pspec.holding, lag).mean()
    tc = restrict(bt.daily["trading_cost"], "research", pspec.holding, lag).mean()
    n_trials = max(n_registered_trials() + 1, len(gs))
    last = fm.iloc[-1]
    ev = {
        "t_ic": ic.t_nw, "mean_ic": ic.mean_ic,
        "years_same_sign": int((np.sign(by_year) == sign).sum()), "n_years": len(by_year),
        "p_holm": p_holm,
        "t_fm_full": last.t_nw if np.sign(last.coef_bps) == sign else -abs(last.t_nw),
        "t_wf_oos": wf["oos_stats"]["t_nw"], "net_sharpe": performance(n)["sharpe"],
        "breakeven_bps": g.mean() / to * 1e4 if to > 0 else np.nan,
        "assumed_cost_bps": tc / to * 1e4 if to > 0 else np.nan,
        "dsr": deflated_sharpe(n, n_trials)["dsr"], "holdout": None,
    }
    if unlock_holdout:
        ho = ic_by_horizon(mkt, sig, u, (h,), spec.execution, "holdout").loc[h]
        ev["holdout"] = {"mean_ic": float(ho.mean_ic), "t_ic": float(ho.t_nw)}
        hn = restrict(bt.daily["net"], "holdout", pspec.holding, lag)
        ev["holdout"]["net_sharpe"] = performance(hn)["sharpe"]
    decision = evaluate(ev)
    return {
        "spec": spec.as_dict(), "portfolio": pspec.__dict__, "costs": cspec.__dict__,
        "ic_by_horizon": ic_tab.reset_index().to_dict(orient="records"),
        "ic_by_year": {int(k): float(v) for k, v in by_year.items()},
        "fama_macbeth": fm.reset_index().to_dict(orient="records"),
        "walk_forward": {k: (float(v) if isinstance(v, (int, float, np.floating)) else v)
                         for k, v in wf["oos_stats"].items()},
        "gross": performance(g), "net": performance(n),
        "evidence": {k: (float(v) if isinstance(v, (int, float, np.floating, np.integer)) else v)
                     for k, v in ev.items()},
        "verdict": decision["verdict"],
        "criteria": [c.__dict__ for c in decision["criteria"]],
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--hypothesis", default="abnormal_volume")
    ap.add_argument("--lookback", type=int, default=20)
    ap.add_argument("--window", type=int, default=1)
    ap.add_argument("--horizon", type=int, default=5)
    ap.add_argument("--execution", default="open_t1")
    ap.add_argument("--neutralization", default="none")
    ap.add_argument("--direction", type=int, default=1, choices=[1, -1])
    ap.add_argument("--holding", type=int, default=None)
    ap.add_argument("--aum", type=float, default=100e6)
    ap.add_argument("--note", default="")
    ap.add_argument("--unlock-holdout", action="store_true",
                    help="Evaluate on the 2017-18 holdout. Use once, on a frozen spec.")
    a = ap.parse_args()
    spec = ResearchSpec(hypothesis=a.hypothesis, lookback=a.lookback, window=a.window,
                        horizon=a.horizon, execution=a.execution, neutralization=a.neutralization,
                        direction=a.direction)
    pspec = PortfolioSpec(holding=a.holding or a.horizon)
    cspec = CostSpec(aum=a.aum)
    res = run(spec, pspec, cspec, a.unlock_holdout)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    rid = hashlib.sha1(json.dumps(res["spec"], sort_keys=True).encode()).hexdigest()[:8]
    res.update({"run_id": f"{stamp}_{rid}", "git": git_rev(), "note": a.note,
                "holdout_used": a.unlock_holdout})
    out = EXPERIMENTS_DIR / "runs" / f"{res['run_id']}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(res, indent=2, default=float))
    reg = EXPERIMENTS_DIR / "registry.csv"
    new = not reg.exists()
    with open(reg, "a", newline="") as f:
        w = csv.writer(f)
        if new:
            w.writerow(["run_id", "git", "hypothesis", "lookback", "window", "horizon",
                        "execution", "neutralization", "direction", "mean_ic", "t_ic", "net_sharpe",
                        "verdict", "holdout_used", "note"])
        e = res["evidence"]
        w.writerow([res["run_id"], res["git"], spec.hypothesis, spec.lookback, spec.window,
                    spec.horizon, spec.execution, spec.neutralization, spec.direction, f"{e['mean_ic']:.5f}",
                    f"{e['t_ic']:.2f}", f"{e['net_sharpe']:.2f}", res["verdict"],
                    a.unlock_holdout, a.note])
    print(f"{res['run_id']}: IC={e['mean_ic']:+.4f} t={e['t_ic']:+.2f} "
          f"net Sharpe={e['net_sharpe']:+.2f} -> {res['verdict']}")
    for c in res["criteria"]:
        print(f"  [{c['status']:>12}] {c['name']}: {c['value']}")


if __name__ == "__main__":
    main()
