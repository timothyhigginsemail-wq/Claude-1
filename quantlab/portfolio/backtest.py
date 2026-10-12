"""Daily backtest of a held-weight book with transaction costs.

Cost model (per name, per trade), all ILLUSTRATIVE defaults:
    cost_bps = half_spread_bps + impact_coef * sigma_daily * sqrt(trade_$ / ADV_$) * 1e4
The square-root impact law is a widely reported empirical regularity (e.g.
Almgren et al. 2005; Tóth et al. 2011); the coefficient is firm- and
period-specific and must be calibrated on real execution data.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from quantlab.data.loader import Market
from quantlab.portfolio.construct import PortfolioSpec, held_weights, target_weights
from quantlab.research.returns import execution_params


@dataclass
class CostSpec:
    half_spread_bps: float = 3.0     # half bid-ask spread + commission/fees
    impact_coef: float = 0.7         # Y in the square-root law
    aum: float = 100e6               # capital in USD
    borrow_bps_annual: float = 30.0  # stock-loan fee on shorts (general collateral)


@dataclass
class BacktestResult:
    daily: pd.DataFrame
    held: pd.DataFrame
    trades: pd.DataFrame
    returns_used: pd.DataFrame
    cost_bps: pd.DataFrame
    participation: pd.DataFrame
    spec: PortfolioSpec
    costs: CostSpec
    execution: str
    meta: dict = field(default_factory=dict)

    def contributions(self) -> pd.DataFrame:
        """Gross P&L contribution of each name each day (weight x return)."""
        return self.held * self.returns_used


def run_backtest(mkt: Market, signal: pd.DataFrame, universe: pd.DataFrame,
                 spec: PortfolioSpec, costs: CostSpec, execution: str = "open_t1",
                 beta: pd.DataFrame | None = None) -> BacktestResult:
    price, lag = execution_params(execution)
    target = target_weights(signal, universe, spec, mkt.sector, beta)
    H = held_weights(target, spec.holding, lag, spec.overlap)

    r_raw = mkt.daily_returns(price)
    missing_held = ((H != 0) & r_raw.isna()).sum().sum()
    r = r_raw.fillna(0.0)          # a held name with no valid return contributes 0
    contrib = H * r
    gross_ret = contrib.sum(axis=1)

    # Weights drift with prices during the interval; trades at point j move the
    # drifted book to the next interval's held weights.
    drifted = H * (1 + r)
    drifted = drifted.div(1 + gross_ret, axis=0)
    trades = H.shift(-1).fillna(0.0) - drifted
    trades.iloc[-1] = 0.0

    # Liquidity / volatility known before the trade (shifted by one day).
    close_r = mkt.daily_returns("close")
    sigma = close_r.rolling(20, min_periods=10).std().shift(1)
    adv = mkt.dollar_volume.rolling(20, min_periods=10).mean().shift(1)
    sigma = sigma.fillna(sigma.stack().median())
    adv = adv.fillna(adv.stack().median())
    trade_usd = trades.abs() * costs.aum
    participation = trade_usd / adv
    impact_bps = costs.impact_coef * sigma * np.sqrt(participation) * 1e4
    cost_bps = (costs.half_spread_bps + impact_bps).where(trades.abs() > 1e-12, 0.0)
    trade_cost = (trades.abs() * cost_bps / 1e4).sum(axis=1)
    borrow = (-H).clip(lower=0).sum(axis=1) * costs.borrow_bps_annual / 1e4 / 252

    daily = pd.DataFrame({
        "gross": gross_ret,
        "trading_cost": trade_cost,
        "borrow_cost": borrow,
    })
    daily["net"] = daily["gross"] - daily["trading_cost"] - daily["borrow_cost"]
    daily["long_leg"] = contrib.where(H > 0, 0).sum(axis=1)
    daily["short_leg"] = contrib.where(H < 0, 0).sum(axis=1)
    daily["turnover"] = trades.abs().sum(axis=1)
    daily["gross_exposure"] = H.abs().sum(axis=1)
    daily["net_exposure"] = H.sum(axis=1)
    daily["n_long"] = (H > 1e-9).sum(axis=1)
    daily["n_short"] = (H < -1e-9).sum(axis=1)
    if beta is not None:
        daily["beta_exposure"] = (H * beta.shift(lag + 1).reindex_like(H)).sum(axis=1)
    live = daily["gross_exposure"] > 0
    first = live.idxmax() if live.any() else daily.index[0]
    daily = daily.loc[first:]
    return BacktestResult(daily=daily, held=H.loc[first:], trades=trades.loc[first:],
                          returns_used=r.loc[first:], cost_bps=cost_bps.loc[first:],
                          participation=participation.loc[first:], spec=spec, costs=costs,
                          execution=execution,
                          meta={"held_with_missing_return": int(missing_held), "lag": lag})


def performance(r: pd.Series, periods: int = 252) -> dict:
    r = r.dropna()
    if len(r) < 2:
        return {}
    eq = (1 + r).cumprod()
    dd = eq / eq.cummax() - 1
    ann_ret = r.mean() * periods
    ann_vol = r.std(ddof=1) * np.sqrt(periods)
    downside = r[r < 0].std(ddof=1) * np.sqrt(periods)
    return {
        "ann_return": float(ann_ret),
        "ann_vol": float(ann_vol),
        "sharpe": float(ann_ret / ann_vol) if ann_vol > 0 else np.nan,
        "sortino": float(ann_ret / downside) if downside > 0 else np.nan,
        "max_drawdown": float(dd.min()),
        "calmar": float(ann_ret / -dd.min()) if dd.min() < 0 else np.nan,
        "hit_rate": float((r > 0).mean()),
        "skew": float(r.skew()),
        "kurtosis": float(r.kurt() + 3),
        "n_days": int(len(r)),
    }


def drawdown(r: pd.Series) -> pd.Series:
    eq = (1 + r.fillna(0)).cumprod()
    return eq / eq.cummax() - 1


def rescale_trading_cost(bt: BacktestResult, aum: float | None = None,
                         half_spread_bps: float | None = None,
                         impact_coef: float | None = None) -> pd.Series:
    """Daily trading cost under different cost assumptions WITHOUT re-running the backtest.

    Impact scales with sqrt(trade size / ADV), so with trades fixed as fractions of
    capital, impact_bps(AUM') = impact_bps(AUM) * sqrt(AUM' / AUM).
    """
    c = bt.costs
    aum = c.aum if aum is None else aum
    hs = c.half_spread_bps if half_spread_bps is None else half_spread_bps
    y = c.impact_coef if impact_coef is None else impact_coef
    traded = bt.trades.abs() > 1e-12
    impact = (bt.cost_bps - c.half_spread_bps).where(traded, 0.0)
    if c.impact_coef > 0:
        impact = impact * (y / c.impact_coef) * np.sqrt(aum / c.aum)
    bps = (hs + impact).where(traded, 0.0)
    return (bt.trades.abs() * bps / 1e4).sum(axis=1)
