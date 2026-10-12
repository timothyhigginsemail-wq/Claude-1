"""Plain-English readings of results, written from the actual numbers.

Each function returns one or two sentences a portfolio manager could read
without knowing the statistics. They are deliberately conservative: they never
call a result 'real' or 'tradeable' on their own.
"""
from __future__ import annotations

import math


def _ok(x) -> bool:
    return x is not None and isinstance(x, (int, float)) and math.isfinite(x)


def strength(t: float) -> str:
    a = abs(t)
    if a >= 3:
        return "strong"
    if a >= 2:
        return "suggestive"
    if a >= 1:
        return "weak, consistent with noise"
    return "indistinguishable from noise"


def ic(mean_ic: float, t: float, horizon: int) -> str:
    if not (_ok(mean_ic) and _ok(t)):
        return "Not enough data to assess this horizon."
    direction = ("stocks the signal ranked higher went on to do better"
                 if mean_ic > 0 else "stocks the signal ranked higher went on to do WORSE")
    size = abs(mean_ic)
    mag = ("negligible" if size < 0.01 else "weak" if size < 0.03 else
           "good" if size < 0.05 else "unusually large — check for errors")
    s = (f"Over {horizon} day(s), {direction} (IC {mean_ic:+.4f}, {mag} in size). "
         f"The evidence is {strength(t)} (t = {t:+.2f}).")
    if abs(t) >= 2 and size < 0.01:
        s += " Statistically detectable but economically tiny."
    if abs(t) < 2:
        s += " On its own this is not evidence of predictive power."
    return s


def spread(mean_bps: float, t: float, horizon: int) -> str:
    if not (_ok(mean_bps) and _ok(t)):
        return ""
    annual = mean_bps / horizon * 252 / 100
    return (f"Top-minus-bottom earned {mean_bps:+.1f} bps per {horizon} days before costs "
            f"(≈ {annual:+.1f}% a year on $1 long/$1 short); evidence {strength(t)} "
            f"(t = {t:+.2f}).")


def fm(first_bps: float, first_t: float, last_bps: float, last_t: float) -> str:
    if not all(_ok(x) for x in (first_bps, first_t, last_bps, last_t)):
        return ""
    if abs(first_t) < 2 and abs(last_t) < 2:
        return ("Not significant with or without controls: there is no effect here for "
                "the controls to explain.")
    if (first_bps > 0) != (last_bps > 0):
        return ("The sign flips once controls are added: the raw effect was a stand-in "
                "for known characteristics.")
    kept = last_bps / first_bps if first_bps else float("nan")
    if abs(last_t) < 2 <= abs(first_t):
        return (f"Significant alone (t = {first_t:+.2f}) but not after controls "
                f"(t = {last_t:+.2f}): mostly explained by known characteristics.")
    return (f"About {kept:.0%} of the raw effect survives all available controls "
            f"(t = {last_t:+.2f}). Value, quality and earnings controls are still untested.")


def sharpe(sr: float, lo: float | None = None, hi: float | None = None,
           net: bool = True) -> str:
    if not _ok(sr):
        return ""
    label = "after costs" if net else "before costs"
    if sr < 0:
        s = f"The strategy lost money {label} (Sharpe {sr:+.2f})."
    elif sr < 0.5:
        s = f"A weak risk-adjusted return {label} (Sharpe {sr:+.2f})."
    elif sr < 1.5:
        s = f"A decent risk-adjusted return {label} (Sharpe {sr:+.2f})."
    else:
        s = (f"A very high Sharpe {label} ({sr:+.2f}) — in a backtest this is more often a "
             "warning sign than a discovery.")
    if _ok(lo) and _ok(hi):
        if lo <= 0 <= hi:
            s += f" The 95% range [{lo:+.2f}, {hi:+.2f}] includes zero: skill is not established."
        else:
            s += f" The 95% range is [{lo:+.2f}, {hi:+.2f}]."
    return s


def costs(breakeven_bps: float, modelled_bps: float, turnover: float) -> str:
    if not (_ok(breakeven_bps) and _ok(modelled_bps)):
        return ""
    s = (f"The strategy trades {turnover:.0%} of capital a day. Each dollar traded earns "
         f"{breakeven_bps:.1f} bps gross; trading costs about {modelled_bps:.1f} bps. ")
    if breakeven_bps <= modelled_bps:
        s += "Costs exceed the edge: it loses money as specified."
    elif breakeven_bps < 2 * modelled_bps:
        s += "Profitable only with a thin margin of safety — fragile to cost errors."
    else:
        s += "A comfortable margin over modelled costs."
    return s


def alpha(alpha_annual: float, t: float, r2: float) -> str:
    if not (_ok(alpha_annual) and _ok(t)):
        return ""
    return (f"After removing exposure to the factor portfolios, the unexplained return is "
            f"{alpha_annual:+.1%} a year with t = {t:+.2f} ({strength(t)}). Factors explain "
            f"{r2:.0%} of the day-to-day variation.")


def dsr(value: float, n_trials: int) -> str:
    if not _ok(value):
        return ""
    if value >= 0.95:
        return (f"Even after accounting for {n_trials} trials, the Sharpe very probably "
                "beats lucky search.")
    if value >= 0.5:
        return (f"Given {n_trials} trials, it is uncertain whether this beats the best "
                "result luck alone would produce.")
    return (f"Given {n_trials} trials, a Sharpe this size is what the luckiest of many "
            "useless strategies would show.")


def correlation(r: float, other: str) -> str:
    if not _ok(r):
        return ""
    a = abs(r)
    if a > 0.5:
        return f"Largely the same bet as {other} (correlation {r:+.2f})."
    if a > 0.2:
        return f"Overlaps with {other} (correlation {r:+.2f})."
    return f"Mostly different from {other} (correlation {r:+.2f})."


def reality_check(p: float, n: int) -> str:
    if not _ok(p):
        return ""
    if p < 0.05:
        return (f"The best of the {n} signals tested is better than the best of {n} "
                f"useless signals would be (p = {p:.3f}).")
    return (f"The best of the {n} signals tested is no better than the best of {n} "
            f"useless signals would typically be (p = {p:.3f}). The 'winner' may be luck.")
