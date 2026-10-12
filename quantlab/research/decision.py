"""Pre-registered decision rules: evidence in, verdict out.

The thresholds are written down BEFORE looking at results (that is the point:
moving the goalposts after seeing the data is a form of overfitting). They are
illustrative house rules, not an industry standard; real firms set their own.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np

PASS, FAIL, UNCLEAR = "pass", "fail", "inconclusive"


@dataclass
class Criterion:
    name: str
    question: str
    threshold: str
    value: str
    status: str
    why: str


def _fmt(x, f="{:.2f}"):
    return "n/a" if x is None or (isinstance(x, float) and not np.isfinite(x)) else f.format(x)


def evaluate(ev: dict) -> dict:
    """ev keys (all research-sample unless noted):
    t_ic, mean_ic, years_same_sign, n_years, p_holm, t_fm_full, t_neutral_ic,
    t_wf_oos, wf_sign_agrees, net_sharpe, breakeven_bps, assumed_cost_bps, dsr,
    holdout (None or dict with mean_ic, t_ic)
    """
    c: list[Criterion] = []
    t = ev.get("t_ic", np.nan)
    sign = np.sign(ev.get("mean_ic", 0.0)) or 1.0

    c.append(Criterion(
        "Statistical evidence", "Is the average IC distinguishable from zero after "
        "accounting for overlapping returns?", "|Newey-West t| ≥ 2 (≥ 3 for 'strong')",
        _fmt(t), PASS if abs(t) >= 2 else FAIL,
        "Below 2, the result is consistent with noise; Harvey, Liu & Zhu (2016) argue "
        "for ~3 given how many factors have been tried in the literature."))

    p_holm = ev.get("p_holm", np.nan)
    c.append(Criterion(
        "Multiple-testing adjusted", "Does it survive the number of variants we tried?",
        "Holm-adjusted p < 0.05 across the parameter grid", _fmt(p_holm, "{:.3f}"),
        PASS if p_holm < 0.05 else FAIL,
        "Searching many lookbacks and horizons and reporting the best one inflates "
        "significance; Holm controls the chance of ANY false discovery."))

    ys, ny = ev.get("years_same_sign", 0), ev.get("n_years", 0)
    c.append(Criterion(
        "Stability over time", "Does the effect have the same sign in most years?",
        "Same sign as full-sample IC in ≥ 75% of years", f"{ys}/{ny}",
        PASS if ny and ys / ny >= 0.75 else FAIL,
        "An effect driven by one episode is a story about that episode, not a "
        "repeatable signal."))

    tfm = ev.get("t_fm_full", np.nan)
    c.append(Criterion(
        "Survives factor controls", "Is it more than beta, size, reversal, momentum, "
        "volatility and sector?", "Fama-MacBeth t ≥ 2 with all controls, same sign",
        _fmt(tfm), PASS if np.sign(tfm) == sign and abs(tfm) >= 2 else FAIL,
        "If known factors explain the signal, it is a repackaging of cheap, "
        "already-owned exposures, not new alpha."))

    two = ev.get("t_wf_oos", np.nan)
    c.append(Criterion(
        "Out-of-sample (walk-forward)", "Does re-selecting parameters using only past "
        "data still work on the next quarter?", "Walk-forward OOS IC t ≥ 2",
        _fmt(two), PASS if two >= 2 else (UNCLEAR if two >= 1 else FAIL),
        "In-sample selection always looks better than reality; this is the closest "
        "we get to live trading without spending the holdout."))

    ns = ev.get("net_sharpe", np.nan)
    c.append(Criterion(
        "Economic significance", "After realistic costs, does the portfolio earn a "
        "worthwhile risk-adjusted return?", "Net Sharpe ≥ 0.5 at the assumed AUM",
        _fmt(ns), PASS if ns >= 0.5 else FAIL,
        "A statistically significant IC can still be too small, or too fast-decaying, "
        "to pay for trading."))

    be, ac = ev.get("breakeven_bps", np.nan), ev.get("assumed_cost_bps", np.nan)
    c.append(Criterion(
        "Cost margin of safety", "How wrong can our cost model be before profits vanish?",
        "Break-even cost ≥ 2 × modelled cost", f"{_fmt(be, '{:.1f}')} vs {_fmt(ac, '{:.1f}')} bps",
        PASS if np.isfinite(be) and np.isfinite(ac) and be >= 2 * ac else FAIL,
        "Cost models for free data are rough; strategies that only work with "
        "optimistic costs usually fail in production."))

    dsr = ev.get("dsr", np.nan)
    c.append(Criterion(
        "Deflated Sharpe", "Is the Sharpe higher than the best of N lucky trials?",
        "DSR ≥ 0.95", _fmt(dsr), PASS if dsr >= 0.95 else FAIL,
        "Corrects the Sharpe for the number of configurations tried and for "
        "non-normal returns (Bailey & López de Prado, 2014)."))

    ho = ev.get("holdout")
    labels = ev.get("period_labels") or {"holdout": "holdout", "data_note": "survivors only"}
    hold = labels["holdout"]
    if ho is None:
        c.append(Criterion("Holdout confirmation", f"Does it work on untouched {hold} data?",
                           "Same sign and |t| ≥ 1.5 on the holdout", "locked", UNCLEAR,
                           "The holdout is opened once, after the specification is frozen."))
    else:
        ok = np.sign(ho["mean_ic"]) == sign and abs(ho["t_ic"]) >= 1.5
        c.append(Criterion("Holdout confirmation", f"Does it work on untouched {hold} data?",
                           "Same sign and |t| ≥ 1.5 on the holdout", _fmt(ho["t_ic"]),
                           PASS if ok else FAIL,
                           "A one-shot test the specification could not have been tuned on."))

    c.append(Criterion(
        "Data adequacy", "Is the dataset good enough for a production decision?",
        "Survivorship-free, ≥ 10 years, point-in-time, with spreads & events",
        labels["data_note"], FAIL,
        "Free data caps how far ANY conclusion can go: at best 'worth testing on "
        "institutional data'."))

    stat = c[0].status == PASS
    robust = all(x.status == PASS for x in c[1:5])
    econ = c[5].status == PASS and c[6].status == PASS
    if not stat:
        verdict = "REJECT (as specified)"
        reason = ("The core predictive relationship is not statistically distinguishable "
                  "from zero. Revising parameters until it is would be data mining; a "
                  "revision needs a new economic reason, recorded before testing.")
    elif not robust:
        verdict = "REVISE"
        reason = ("There is some statistical evidence, but it does not survive the "
                  "robustness checks (multiple testing, stability, factor controls or "
                  "out-of-sample). Refine the hypothesis — e.g. condition on the "
                  "mechanism — and pre-register the new test.")
    elif not econ:
        verdict = "REVISE (implementation)"
        reason = ("The signal looks real but does not pay for its trading costs. Options: "
                  "slower variants, combining with other signals, or using it as an "
                  "execution/timing overlay rather than a standalone strategy.")
    else:
        verdict = "ADVANCE to validation on institutional data"
        reason = ("All tests available on this data pass. Because the data are "
                  "survivorship-biased and short, the next step is replication on a "
                  "point-in-time, survivorship-free dataset — never direct deployment.")
    return {"criteria": c, "verdict": verdict, "reason": reason}
