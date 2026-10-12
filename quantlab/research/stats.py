"""Statistics that respect time-series dependence.

Why this matters: daily ICs of a 5-day forward return overlap — consecutive
observations share 4 of 5 days — so they are strongly autocorrelated. Treating
them as independent overstates the t-stat roughly by sqrt(h). Newey-West
standard errors and block bootstraps fix this.
"""
from __future__ import annotations

import math
import warnings

import numpy as np
import pandas as pd
from scipy import stats as sps


def nw_lags(n: int, horizon: int = 1) -> int:
    """Lag choice: at least horizon-1 (overlap), and the Newey-West (1994) rule."""
    auto = int(math.floor(4 * (n / 100.0) ** (2.0 / 9.0)))
    return max(horizon - 1, auto, 1)


def newey_west_se(x, lags: int | None = None) -> float:
    """HAC standard error of the sample mean (Bartlett kernel)."""
    x = np.asarray(pd.Series(x).dropna(), dtype=float)
    n = len(x)
    if n < 3:
        return float("nan")
    if lags is None:
        lags = nw_lags(n)
    e = x - x.mean()
    lrv = e @ e / n
    for k in range(1, min(lags, n - 1) + 1):
        w = 1.0 - k / (lags + 1.0)
        lrv += 2.0 * w * (e[k:] @ e[:-k]) / n
    return float(np.sqrt(max(lrv, 0.0) / n))


def mean_stats(x, horizon: int = 1) -> dict:
    """Mean, naive t, Newey-West t and two-sided p-value of a time series."""
    s = pd.Series(x).dropna()
    n = len(s)
    if n < 3:
        return {"mean": np.nan, "se_nw": np.nan, "t_nw": np.nan, "t_naive": np.nan,
                "p_nw": np.nan, "n": n}
    lags = nw_lags(n, horizon)
    se = newey_west_se(s, lags)
    t = s.mean() / se if se > 0 else np.nan
    t_naive = s.mean() / (s.std(ddof=1) / np.sqrt(n))
    return {"mean": float(s.mean()), "se_nw": se, "t_nw": float(t), "t_naive": float(t_naive),
            "p_nw": float(2 * sps.norm.sf(abs(t))) if np.isfinite(t) else np.nan,
            "n": n, "lags": lags}


def rowwise_corr(a: pd.DataFrame, b: pd.DataFrame, min_obs: int = 20) -> pd.Series:
    """Pearson correlation between two wide frames, computed across columns per row."""
    a, b = a.align(b, join="inner")
    m = a.notna() & b.notna()
    A, B = a.where(m), b.where(m)
    n = m.sum(axis=1)
    am = A.sub(A.mean(axis=1), axis=0)
    bm = B.sub(B.mean(axis=1), axis=0)
    cov = (am * bm).sum(axis=1)
    den = np.sqrt((am ** 2).sum(axis=1) * (bm ** 2).sum(axis=1))
    c = cov / den.where(den > 0)
    return c.where(n >= min_obs)


def rank_ic(signal: pd.DataFrame, fwd: pd.DataFrame, universe: pd.DataFrame,
            min_obs: int = 20) -> pd.Series:
    """Daily Spearman rank information coefficient (IC)."""
    s = signal.where(universe)
    f = fwd.where(universe)
    m = s.notna() & f.notna()
    return rowwise_corr(s.where(m).rank(axis=1), f.where(m).rank(axis=1), min_obs)


def sharpe(r, periods: int = 252) -> float:
    r = pd.Series(r).dropna()
    sd = r.std(ddof=1)
    return float(r.mean() / sd * np.sqrt(periods)) if sd > 0 else float("nan")


def block_bootstrap_sharpe(r, block: int = 10, n_boot: int = 1000, seed: int = 0,
                           periods: int = 252) -> tuple[float, float]:
    """95% CI for the annualised Sharpe ratio using a circular block bootstrap.

    Resampling contiguous blocks keeps short-range autocorrelation (from
    overlapping holdings and volatility clustering) inside each sample.
    """
    x = np.asarray(pd.Series(r).dropna(), dtype=float)
    n = len(x)
    if n < 2 * block:
        return (np.nan, np.nan)
    rng = np.random.default_rng(seed)
    n_blocks = int(np.ceil(n / block))
    starts = rng.integers(0, n, size=(n_boot, n_blocks))
    idx = (starts[:, :, None] + np.arange(block)[None, None, :]) % n
    samp = x[idx.reshape(n_boot, -1)[:, :n]]
    sr = samp.mean(1) / samp.std(1, ddof=1) * np.sqrt(periods)
    lo, hi = np.nanpercentile(sr, [2.5, 97.5])
    return float(lo), float(hi)


def probabilistic_sharpe(sr_obs: float, sr_benchmark: float, n: int, skew: float,
                         kurt: float) -> float:
    """Bailey & López de Prado (2012) PSR, using NON-annualised (per-period) Sharpe.

    Probability that the true Sharpe exceeds the benchmark, given track length,
    skewness and (non-excess) kurtosis of returns.
    """
    denom = np.sqrt(max(1 - skew * sr_obs + (kurt - 1) / 4.0 * sr_obs ** 2, 1e-12))
    return float(sps.norm.cdf((sr_obs - sr_benchmark) * np.sqrt(n - 1) / denom))


def expected_max_sharpe(n_trials: int, var_trials: float) -> float:
    """Expected maximum Sharpe among N independent unskilled trials (per period)."""
    if n_trials <= 1:
        return 0.0
    g = 0.5772156649
    z1 = sps.norm.ppf(1 - 1.0 / n_trials)
    z2 = sps.norm.ppf(1 - 1.0 / (n_trials * np.e))
    return float(np.sqrt(var_trials) * ((1 - g) * z1 + g * z2))


def deflated_sharpe(r, n_trials: int, var_trials_annual: float | None = None,
                    periods: int = 252) -> dict:
    """Deflated Sharpe Ratio (Bailey & López de Prado, 2014).

    The benchmark is the Sharpe you would expect from the BEST of `n_trials`
    strategies with zero true skill. var_trials_annual is the cross-trial variance
    of annualised Sharpes; if unknown we assume trial Sharpes are dispersed like
    pure noise over this sample length (variance ≈ periods / n).
    """
    x = pd.Series(r).dropna()
    n = len(x)
    sr = x.mean() / x.std(ddof=1)
    sk = float(sps.skew(x))
    ku = float(sps.kurtosis(x, fisher=False))
    if var_trials_annual is None:
        var_p = 1.0 / n
    else:
        var_p = var_trials_annual / periods
    sr0 = expected_max_sharpe(n_trials, var_p)
    return {
        "sharpe_annual": float(sr * np.sqrt(periods)),
        "benchmark_sharpe_annual": float(sr0 * np.sqrt(periods)),
        "psr_vs_zero": probabilistic_sharpe(sr, 0.0, n, sk, ku),
        "dsr": probabilistic_sharpe(sr, sr0, n, sk, ku),
        "skew": sk, "kurtosis": ku, "n": n, "n_trials": n_trials,
    }


def holm(pvals) -> np.ndarray:
    """Holm-Bonferroni adjusted p-values (controls family-wise error rate)."""
    p = np.asarray(pvals, dtype=float)
    m = len(p)
    order = np.argsort(p)
    adj = np.empty(m)
    run = 0.0
    for rank, i in enumerate(order):
        run = max(run, (m - rank) * p[i])
        adj[i] = min(run, 1.0)
    return adj


def benjamini_hochberg(pvals) -> np.ndarray:
    """BH adjusted p-values (controls false discovery rate)."""
    p = np.asarray(pvals, dtype=float)
    m = len(p)
    order = np.argsort(p)[::-1]
    adj = np.empty(m)
    run = 1.0
    for k, i in enumerate(order):
        rank = m - k
        run = min(run, p[i] * m / rank)
        adj[i] = run
    return adj


def reality_check(ic: pd.DataFrame, horizon: int = 5, n_boot: int = 500, block: int | None = None,
                  seed: int = 0) -> dict:
    """White's (2000) reality check on the BEST of many signals, two-sided.

    ic: dates x signals matrix of daily ICs. The statistic is the largest |t| across
    signals. The null distribution re-samples the (demeaned) IC matrix in circular
    blocks — rows are kept together, so correlation BETWEEN signals is preserved —
    and records the largest |t| each time. p = share of bootstrap maxima ≥ observed.
    """
    X = ic.dropna(how="all").dropna(axis=1, how="all")
    T, K = X.shape
    if T < 50 or K == 0:
        return {"p": float("nan"), "max_t": float("nan"), "best": None, "n": K}
    block = block or max(10, 2 * horizon)
    lags = nw_lags(T, horizon)
    means = X.mean()
    se = pd.Series({c: newey_west_se(X[c], lags) for c in X})
    t_obs = (means / se).abs()
    vals = X.values - means.values          # impose the null: every signal has mean 0
    rng = np.random.default_rng(seed)
    n_blocks = int(np.ceil(T / block))
    maxima = np.empty(n_boot)
    with np.errstate(invalid="ignore"), warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)
        for b in range(n_boot):
            starts = rng.integers(0, T, n_blocks)
            idx = ((starts[:, None] + np.arange(block)[None, :]) % T).ravel()[:T]
            m = np.nanmean(vals[idx], axis=0)
            maxima[b] = np.nanmax(np.abs(m / se.values))
    best = t_obs.idxmax()
    return {"p": float(np.mean(maxima >= t_obs.max())), "max_t": float(t_obs.max()),
            "best": best, "n": K, "null_95": float(np.quantile(maxima, 0.95))}
