"""Turn a signal into target long/short weights for each formation date.

Weights are fractions of capital. gross=2.0 means $1 long and $1 short per $1
of capital (a typical 'dollar-neutral 100/100' book before extra leverage).
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd


@dataclass
class PortfolioSpec:
    scheme: str = "quantile"      # 'quantile' (equal-weight top/bottom) or 'rank'
    quantile: float = 0.2         # fraction of names in each leg (quantile scheme)
    holding: int = 5              # days each formation is held
    overlap: bool = True          # overlapping daily tranches vs. form every `holding` days
    gross: float = 2.0
    max_weight: float = 0.02      # cap per name (fraction of capital)
    sector_neutral: bool = False
    beta_neutral: bool = False


def _legs_quantile(s: pd.DataFrame, q: float) -> pd.DataFrame:
    pct = s.rank(axis=1, pct=True)
    n = s.notna().sum(axis=1)
    long = (pct > 1 - q).astype(float).where(s.notna(), 0.0)
    short = (pct <= q).astype(float).where(s.notna(), 0.0)
    nl, ns = long.sum(axis=1), short.sum(axis=1)
    w = long.div(nl.where(nl > 0), axis=0) - short.div(ns.where(ns > 0), axis=0)
    return w.where(n >= 10, 0.0).fillna(0.0)          # each leg sums to +/-1


def _legs_rank(s: pd.DataFrame) -> pd.DataFrame:
    r = s.rank(axis=1)
    d = r.sub(r.mean(axis=1), axis=0).fillna(0.0)
    pos = d.clip(lower=0)
    neg = (-d).clip(lower=0)
    return pos.div(pos.sum(axis=1).replace(0, np.nan), axis=0).fillna(0) - \
        neg.div(neg.sum(axis=1).replace(0, np.nan), axis=0).fillna(0)


def _cap(w: pd.DataFrame, cap: float, gross: float, iters: int = 20) -> pd.DataFrame:
    """Clip |w| <= cap while keeping each leg at gross/2 (water-filling)."""
    half = gross / 2.0
    for _ in range(iters):
        w = w.clip(-cap, cap)
        L = w.clip(lower=0).sum(axis=1)
        S = (-w).clip(lower=0).sum(axis=1)
        free_l = (w > 0) & (w < cap - 1e-12)
        free_s = (w < 0) & (w > -cap + 1e-12)
        fl = w.where(free_l, 0).sum(axis=1)
        fs = (-w).where(free_s, 0).sum(axis=1)
        sl = ((half - (L - fl)) / fl.replace(0, np.nan)).fillna(1.0)
        ss = ((half - (S - fs)) / fs.replace(0, np.nan)).fillna(1.0)
        w = w.where(~free_l, w.mul(sl, axis=0)).where(~free_s, w.mul(ss, axis=0))
        if (w.abs() <= cap + 1e-9).all().all():
            break
    return w


def target_weights(signal: pd.DataFrame, universe: pd.DataFrame, spec: PortfolioSpec,
                   sectors: pd.Series | None = None,
                   beta: pd.DataFrame | None = None) -> pd.DataFrame:
    """Target weights from the signal observed at the close of each date."""
    s = signal.where(universe)
    if spec.sector_neutral and sectors is not None:
        w = pd.DataFrame(0.0, index=s.index, columns=s.columns)
        n_all = s.notna().sum(axis=1).replace(0, np.nan)
        for sec in sectors.reindex(s.columns).fillna("Unknown").unique():
            cols = s.columns[sectors.reindex(s.columns).fillna("Unknown") == sec]
            sub = s[cols]
            legs = _legs_quantile(sub, spec.quantile) if spec.scheme == "quantile" \
                else _legs_rank(sub)
            share = (sub.notna().sum(axis=1) / n_all).fillna(0)
            w[cols] = legs.mul(share, axis=0)
        w = w * (spec.gross / 2.0)
    else:
        legs = _legs_quantile(s, spec.quantile) if spec.scheme == "quantile" else _legs_rank(s)
        w = legs * (spec.gross / 2.0)
    if spec.max_weight and spec.max_weight > 0:
        w = _cap(w, spec.max_weight, spec.gross)
    if spec.beta_neutral and beta is not None:
        b = (w * beta.reindex_like(w)).sum(axis=1)
        u = universe.reindex_like(w).astype(float)
        hedge = u.div(u.sum(axis=1).replace(0, np.nan), axis=0).fillna(0)
        bh = (hedge * beta.reindex_like(w)).sum(axis=1).replace(0, np.nan)
        w = w - hedge.mul((b / bh).fillna(0), axis=0)
    return w.fillna(0.0)


def held_weights(target: pd.DataFrame, holding: int, lag: int, overlap: bool = True) -> pd.DataFrame:
    """Weights actually HELD over each return interval.

    Row j of the result applies to the price change from point j-1 to j.
    A formation on signal date t is held over intervals t+lag+1 ... t+lag+holding.

    overlap=True  : Jegadeesh-Titman tranches — each day 1/holding of capital is
                    re-formed, so the book is the average of the last `holding`
                    formations (smoother, lower turnover per day).
    overlap=False : form on every `holding`-th date and hold the whole book.
    """
    if overlap:
        avg = target.rolling(holding, min_periods=1).sum() / holding
    else:
        pos = np.arange(len(target))
        keep = pd.Series(pos % holding == 0, index=target.index)
        avg = target.where(keep, np.nan)
        avg = avg.ffill(limit=holding - 1)
        avg.loc[~keep & avg.isna().all(axis=1)] = 0.0
    return avg.shift(lag + 1).fillna(0.0)
