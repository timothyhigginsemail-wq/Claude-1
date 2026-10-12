"""Overfitting controls: parameter grids, multiple testing, placebo nulls,
walk-forward selection, and time-series factor regressions."""
from __future__ import annotations

import itertools
import warnings

import numpy as np
import pandas as pd

from quantlab.data.loader import Market
from quantlab.portfolio.construct import PortfolioSpec, held_weights, target_weights
from quantlab.research.analysis import sample_mask
from quantlab.research.returns import execution_params, forward_returns
from quantlab.research.stats import benjamini_hochberg, holm, mean_stats, newey_west_se, nw_lags, rank_ic
from quantlab.signals.library import compute_signal


def grid_ic(mkt: Market, key: str, universe: pd.DataFrame, lookbacks=(10, 20, 60),
            windows=(1, 5), horizons=(1, 5, 10, 20), execution: str = "open_t1"):
    """Daily IC series for every configuration in a parameter grid."""
    fwd = {h: forward_returns(mkt, h, execution) for h in horizons}
    series, rows = {}, []
    for lb, w in itertools.product(lookbacks, windows):
        sig = compute_signal(mkt, key, lookback=lb, window=w)
        for h in horizons:
            name = f"lb={lb} w={w} h={h}"
            series[name] = rank_ic(sig, fwd[h], universe)
            rows.append({"config": name, "lookback": lb, "window": w, "horizon": h})
    return pd.DataFrame(series), pd.DataFrame(rows).set_index("config")


def grid_summary(ics: pd.DataFrame, configs: pd.DataFrame, sample: str = "research",
                 lag: int = 1) -> pd.DataFrame:
    rows = []
    for c in ics:
        h = int(configs.loc[c, "horizon"])
        ic = ics[c][sample_mask(ics.index, sample, h, lag)]
        st = mean_stats(ic, horizon=h)
        rows.append({"config": c, **configs.loc[c].to_dict(), "mean_ic": st["mean"],
                     "t_nw": st["t_nw"], "p_nw": st["p_nw"]})
    out = pd.DataFrame(rows).set_index("config")
    out["p_holm"] = holm(out["p_nw"].values)
    out["p_bh"] = benjamini_hochberg(out["p_nw"].values)
    return out


def placebo_tstats(mkt: Market, universe: pd.DataFrame, horizon: int = 5,
                   n_sims: int = 200, execution: str = "open_t1", sample: str = "research",
                   seed: int = 123) -> np.ndarray:
    """t-stats of mean IC for `n_sims` pure-noise signals: the empirical null."""
    _, lag = execution_params(execution)
    fwd = forward_returns(mkt, horizon, execution).where(universe)
    mask = sample_mask(fwd.index, sample, horizon, lag).values
    F = fwd.values[mask]
    ok = np.isfinite(F)
    Fr = pd.DataFrame(F).rank(axis=1).values
    Fr = np.where(ok, Fr, np.nan)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)
        Fm = Fr - np.nanmean(Fr, axis=1, keepdims=True)
    Fs = np.sqrt(np.nansum(Fm ** 2, axis=1))
    rng = np.random.default_rng(seed)
    T, N = F.shape
    lags = nw_lags(T, horizon)
    out = np.empty(n_sims)
    with np.errstate(invalid="ignore", divide="ignore"), warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)
        for k in range(n_sims):
            z = rng.random((T, N))
            z = np.where(ok, z, np.nan)
            zr = pd.DataFrame(z).rank(axis=1).values
            zm = zr - np.nanmean(zr, axis=1, keepdims=True)
            ic = np.nansum(zm * Fm, axis=1) / (np.sqrt(np.nansum(zm ** 2, axis=1)) * Fs)
            ic = ic[np.isfinite(ic)]
            out[k] = ic.mean() / newey_west_se(ic, lags)
    return out


def walk_forward(ics: pd.DataFrame, configs: pd.DataFrame, lag: int = 1,
                 min_train: int = 252, step: int = 63, end: pd.Timestamp | None = None) -> dict:
    """Re-select the best configuration every `step` days using ONLY past data.

    Training uses an expanding window and is PURGED: an IC observation dated t
    is usable only if its return window (t+lag+h) ended before the test period
    starts. The chosen config's IC (with the sign learned in training) is then
    recorded on the next `step` days. Compare the stitched out-of-sample IC with
    the in-sample IC of the best configuration to measure selection optimism.
    """
    idx = ics.index if end is None else ics.index[ics.index < end]
    ics = ics.loc[idx]
    pos = np.arange(len(idx))
    oos = pd.Series(np.nan, index=idx)
    choices = []
    for start in range(min_train, len(idx), step):
        best, best_t, best_sign = None, -np.inf, 1
        for c in ics:
            h = int(configs.loc[c, "horizon"])
            train = ics[c].iloc[: start][pos[:start] + lag + h < start]
            st = mean_stats(train, horizon=h)
            if np.isfinite(st["t_nw"]) and abs(st["t_nw"]) > best_t:
                best, best_t, best_sign = c, abs(st["t_nw"]), np.sign(st["t_nw"])
        stop = min(start + step, len(idx))
        oos.iloc[start:stop] = best_sign * ics[best].iloc[start:stop]
        choices.append({"test_start": idx[start], "config": best, "sign": int(best_sign),
                        "train_t": float(best_t)})
    oos = oos.dropna()
    return {"oos_ic": oos, "choices": pd.DataFrame(choices),
            "oos_stats": mean_stats(oos, horizon=int(configs["horizon"].max()))}


def factor_returns(mkt: Market, chars: dict[str, pd.DataFrame], universe: pd.DataFrame,
                   holding: int, execution: str = "open_t1") -> pd.DataFrame:
    """Daily gross returns of characteristic long/short portfolios (top vs bottom 30%),
    built with the SAME holding period and execution timing as the strategy, plus
    the equal-weighted market."""
    price, lag = execution_params(execution)
    raw = mkt.daily_returns(price)
    r = raw.fillna(0.0)
    spec = PortfolioSpec(scheme="quantile", quantile=0.3, holding=holding, max_weight=0)
    # Equal-weighted market over the same interval, using names eligible at t-lag-1.
    out = {"market": raw.where(universe.shift(lag + 1, fill_value=False)).mean(axis=1)}
    for k, ch in chars.items():
        H = held_weights(target_weights(ch, universe, spec), holding, lag)
        out[k] = (H * r).sum(axis=1) / 2.0     # per $1 long and $1 short
    return pd.DataFrame(out)


def factor_regression(strategy: pd.Series, factors: pd.DataFrame, periods: int = 252) -> dict:
    """OLS of daily strategy returns on factor returns with Newey-West t-stats."""
    df = pd.concat([strategy.rename("y"), factors], axis=1).dropna()
    # drop factors with (near) zero variance — they make the regression singular
    keep = [c for c in factors.columns if df[c].std() > 1e-12]
    factors = factors[keep]
    y = df["y"].values
    X = np.column_stack([np.ones(len(df)), df[factors.columns].values])
    coef, *_ = np.linalg.lstsq(X, y, rcond=None)
    resid = y - X @ coef
    n, k = X.shape
    lags = nw_lags(n, 5)
    XtX_inv = np.linalg.pinv(X.T @ X)
    u = X * resid[:, None]
    S = u.T @ u
    for l in range(1, lags + 1):
        w = 1 - l / (lags + 1)
        G = u[l:].T @ u[:-l]
        S += w * (G + G.T)
    V = XtX_inv @ S @ XtX_inv
    se = np.sqrt(np.diag(V))
    names = ["alpha"] + list(factors.columns)
    tab = pd.DataFrame({"coef": coef, "t_nw": coef / se}, index=names)
    contrib = pd.Series(coef[1:] * df[factors.columns].mean().values * periods,
                        index=factors.columns)
    r2 = 1 - resid.var() / y.var() if y.var() > 0 else np.nan
    return {"table": tab, "alpha_annual": float(coef[0] * periods),
            "factor_contrib_annual": contrib, "total_annual": float(y.mean() * periods),
            "r2": float(r2), "n": n, "residual": pd.Series(resid, index=df.index)}
