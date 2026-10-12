"""Portfolio construction and backtest mechanics."""
import numpy as np
import pandas as pd
import pytest

from quantlab.data.loader import eligible_universe
from quantlab.portfolio.backtest import CostSpec, rescale_trading_cost, run_backtest
from quantlab.portfolio.construct import PortfolioSpec, held_weights, target_weights
from quantlab.research.returns import forward_returns


def test_held_weights_timing():
    """A formation on date t is held exactly over intervals t+lag+1 .. t+lag+h."""
    idx = pd.RangeIndex(20)
    target = pd.DataFrame(0.0, index=idx, columns=["A"])
    target.loc[5, "A"] = 1.0
    for lag in (0, 1):
        H = held_weights(target, holding=3, lag=lag, overlap=True)
        nz = H.index[H["A"] != 0].tolist()
        assert nz == [5 + lag + 1, 5 + lag + 2, 5 + lag + 3]
        assert H["A"].max() == pytest.approx(1 / 3)


def test_held_weights_no_overlap():
    idx = pd.RangeIndex(12)
    target = pd.DataFrame({"A": np.arange(12, dtype=float)})
    H = held_weights(target, holding=4, lag=1, overlap=False)
    # formations at 0, 4, 8 -> held over (2..5), (6..9), (10..13)
    assert H["A"].tolist()[:2] == [0, 0]
    assert H["A"].tolist()[2:6] == [0, 0, 0, 0]
    assert H["A"].tolist()[6:10] == [4, 4, 4, 4]
    assert H["A"].tolist()[10:] == [8, 8]


def test_target_weights_dollar_neutral_and_capped(mkt):
    u = eligible_universe(mkt, min_history=20)
    sig = mkt.volume.pct_change(fill_method=None)
    for scheme in ("quantile", "rank"):
        spec = PortfolioSpec(scheme=scheme, quantile=0.2, max_weight=0.15, gross=2.0)
        w = target_weights(sig, u, spec, mkt.sector)
        live = w.abs().sum(axis=1) > 0
        assert np.allclose(w[live].sum(axis=1), 0, atol=1e-9)
        assert np.allclose(w[live].abs().sum(axis=1), 2.0, atol=1e-6)
        assert (w.abs() <= 0.15 + 1e-9).all().all()
        assert (w.where(~u, 0) == 0).all().all()      # never hold non-eligible names


def test_infeasible_cap_reduces_gross_not_breaks_cap(mkt):
    """8 names per leg x 6% cap can only reach 48% per leg: the cap wins."""
    u = eligible_universe(mkt, min_history=20)
    sig = mkt.volume.pct_change(fill_method=None)
    w = target_weights(sig, u, PortfolioSpec(quantile=0.2, max_weight=0.06), mkt.sector)
    live = w.abs().sum(axis=1) > 0
    assert (w.abs() <= 0.06 + 1e-9).all().all()
    assert np.allclose(w[live].abs().sum(axis=1), 0.96)


def test_sector_neutral(mkt):
    u = eligible_universe(mkt, min_history=20)
    sig = mkt.volume.pct_change(fill_method=None)
    w = target_weights(sig, u, PortfolioSpec(sector_neutral=True, max_weight=0), mkt.sector)
    by_sec = w.T.groupby(mkt.sector).sum().T
    live = w.abs().sum(axis=1) > 0
    assert np.allclose(by_sec[live], 0, atol=1e-9)


def test_perfect_foresight_is_profitable_and_correctly_timed(mkt):
    """Signal = the realised next-interval return. Correct alignment => the book makes
    money EVERY day; any off-by-one error would make it look random."""
    u = eligible_universe(mkt, min_history=20)
    fwd = forward_returns(mkt, 1, "open_t1")
    spec = PortfolioSpec(holding=1, quantile=0.2, max_weight=0)
    bt = run_backtest(mkt, fwd, u, spec, CostSpec(half_spread_bps=0, impact_coef=0,
                                                  borrow_bps_annual=0), "open_t1")
    g = bt.daily["gross"][bt.daily["gross_exposure"] > 0].iloc[:-3]
    assert (g > 0).all()


def test_shifted_foresight_is_useless(mkt):
    """Using yesterday's realised return (information already in prices) should not
    produce the perfect-foresight result — guards against double-shifting."""
    u = eligible_universe(mkt, min_history=20)
    past = forward_returns(mkt, 1, "open_t1").shift(3)
    bt = run_backtest(mkt, past, u, PortfolioSpec(holding=1, max_weight=0),
                      CostSpec(0, 0, 1e6, 0), "open_t1")
    assert (bt.daily["gross"] > 0).mean() < 0.65


def test_turnover_and_costs(mkt):
    u = eligible_universe(mkt, min_history=20)
    sig = mkt.volume.pct_change(fill_method=None)
    c = CostSpec(half_spread_bps=5, impact_coef=0.0, aum=1e8, borrow_bps_annual=0)
    bt = run_backtest(mkt, sig, u, PortfolioSpec(holding=1, max_weight=0), c, "open_t1")
    d = bt.daily
    # With zero impact, cost = turnover * half-spread.
    assert np.allclose(d["trading_cost"], d["turnover"] * 5e-4)
    assert np.allclose(d["net"], d["gross"] - d["trading_cost"])
    # Impact rescaling: doubling AUM multiplies impact by sqrt(2).
    c2 = CostSpec(half_spread_bps=0, impact_coef=1.0, aum=1e8, borrow_bps_annual=0)
    bt2 = run_backtest(mkt, sig, u, PortfolioSpec(holding=1, max_weight=0), c2, "open_t1")
    big = rescale_trading_cost(bt2, aum=4e8)
    assert np.allclose(big, bt2.daily["trading_cost"] * 2.0)


def test_constant_book_has_only_drift_turnover(mkt):
    u = eligible_universe(mkt, min_history=20)
    const = pd.DataFrame(np.tile(np.arange(mkt.close.shape[1], dtype=float), (len(mkt.dates), 1)),
                         index=mkt.dates, columns=mkt.tickers)
    bt = run_backtest(mkt, const, u, PortfolioSpec(holding=1, max_weight=0),
                      CostSpec(0, 0, 1e6, 0), "open_t1")
    steady = bt.daily["turnover"].iloc[30:-2]
    assert steady.mean() < 0.1          # only re-balancing price drift


def test_cost_formula_square_root(mkt):
    u = eligible_universe(mkt, min_history=20)
    sig = mkt.volume.pct_change(fill_method=None)
    c = CostSpec(half_spread_bps=1.0, impact_coef=0.5, aum=5e7, borrow_bps_annual=0)
    bt = run_backtest(mkt, sig, u, PortfolioSpec(holding=1, max_weight=0), c, "open_t1")
    sigma = mkt.daily_returns("close").rolling(20, min_periods=10).std().shift(1)
    adv = mkt.dollar_volume.rolling(20, min_periods=10).mean().shift(1)
    j, t = bt.trades.index[60], bt.trades.columns[3]
    tr = abs(bt.trades.loc[j, t])
    if tr > 0:
        exp = 1.0 + 0.5 * sigma.loc[j, t] * np.sqrt(tr * 5e7 / adv.loc[j, t]) * 1e4
        assert bt.cost_bps.loc[j, t] == pytest.approx(exp)
