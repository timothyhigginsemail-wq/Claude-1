"""A small, safe formula language for building your own signals.

Example:   rank(-ret(5)) * zscore(volume / mean(volume, 20))

Safety and validity by construction:
  * The formula is parsed with Python's `ast` module and only an allow-list of
    node types, names and functions is accepted. Nothing is ever passed to
    eval/exec, so a formula cannot run arbitrary code.
  * Every time-series function looks BACKWARD only (rolling windows, positive
    lags). There is no way to express a future value, so look-ahead is
    impossible unless a building block itself is wrong — and the building
    blocks are unit-tested.
  * Windows must be literal integers between 1 and 252, so a formula is
    reproducible and its parameters are visible (every window is a choice
    that counts toward multiple testing).
"""
from __future__ import annotations

import ast
from dataclasses import dataclass

import numpy as np
import pandas as pd

from quantlab.data.loader import Market

MAX_WINDOW = 252
MAX_LEN = 400


class FormulaError(ValueError):
    pass


# --------------------------------------------------------------- documentation
FIELDS = {
    "close": "Closing price (split-adjusted)",
    "open": "Opening price",
    "high": "Daily high",
    "low": "Daily low",
    "volume": "Shares traded",
    "dvol": "Dollar volume = close × volume",
    "r": "Today's close-to-close return",
    "ovn": "Today's overnight return (open vs. previous close)",
    "intraday": "Today's intraday return (close vs. open)",
}
FUNCTIONS = {
    "ret(n)": "Return over the last n days (close to close)",
    "mean(x, n)": "Average of x over the last n days",
    "std(x, n)": "Standard deviation of x over the last n days",
    "sum(x, n)": "Sum of x over the last n days",
    "max(x, n)": "Highest value of x over the last n days",
    "min(x, n)": "Lowest value of x over the last n days",
    "lag(x, n)": "Value of x n days ago",
    "delta(x, n)": "x today minus x n days ago",
    "corr(x, y, n)": "Correlation of x and y over the last n days",
    "ts_rank(x, n)": "Where today's x ranks within its own last n days (0–1)",
    "skew(x, n)": "Skewness of x over the last n days",
    "rank(x)": "Rank across stocks today, scaled 0–1",
    "zscore(x)": "Standardise across stocks today (mean 0, sd 1, clipped at ±3)",
    "sector_demean(x)": "x minus its sector's average today",
    "log(x)": "Natural log (non-positive values become missing)",
    "abs(x)": "Absolute value",
    "sign(x)": "+1, 0 or −1",
    "clip(x, lo, hi)": "Limit x to the range [lo, hi]",
    "where(cond, a, b)": "a where the condition holds, otherwise b",
}
EXAMPLES = [
    ("Volume-confirmed reversal", "-ret(5) * zscore(log(volume / mean(volume, 20)))"),
    ("Quiet momentum", "rank(ret(105)) - rank(std(r, 60))"),
    ("Overnight vs intraday tug-of-war", "mean(ovn, 21) - mean(intraday, 21)"),
    ("Abnormal volume only on down days", "where(r < 0, log(volume / mean(lag(volume, 1), 20)), 0)"),
    ("Distance from 50-day average", "-(close / mean(close, 50) - 1)"),
    ("Sector-relative 1-month reversal", "-sector_demean(ret(21))"),
]

_BINOPS = {ast.Add: np.add, ast.Sub: np.subtract, ast.Mult: np.multiply, ast.Div: np.divide,
           ast.Pow: np.power}
_CMPOPS = {ast.Lt: np.less, ast.LtE: np.less_equal, ast.Gt: np.greater,
           ast.GtE: np.greater_equal}
# name -> (number of series args, number of window args)
_SIGNATURES = {
    "ret": (0, 1), "mean": (1, 1), "std": (1, 1), "sum": (1, 1), "max": (1, 1), "min": (1, 1),
    "lag": (1, 1), "delta": (1, 1), "corr": (2, 1), "ts_rank": (1, 1), "skew": (1, 1),
    "rank": (1, 0), "zscore": (1, 0), "sector_demean": (1, 0), "log": (1, 0), "abs": (1, 0),
    "sign": (1, 0), "clip": (1, 2), "where": (3, 0),
}


@dataclass
class Parsed:
    text: str
    tree: ast.Expression
    windows: list[int]
    fields: list[str]
    functions: list[str]

    @property
    def max_lookback(self) -> int:
        return sum(self.windows) if self.windows else 1


def parse(text: str) -> Parsed:
    """Validate a formula and return its parse tree. Raises FormulaError with a
    plain-English message on any problem."""
    text = (text or "").strip()
    if not text:
        raise FormulaError("The formula is empty.")
    if len(text) > MAX_LEN:
        raise FormulaError(f"Formulas are limited to {MAX_LEN} characters.")
    try:
        tree = ast.parse(text, mode="eval")
    except SyntaxError as e:
        raise FormulaError(f"Could not read the formula near character {e.offset}: check "
                           "brackets and commas.") from None
    windows, fields, funcs = [], [], []

    def check(node, ctx="series"):
        if isinstance(node, ast.Expression):
            return check(node.body)
        if isinstance(node, ast.Constant):
            if isinstance(node.value, bool) or not isinstance(node.value, (int, float)):
                raise FormulaError("Only numbers are allowed as constants.")
            return
        if isinstance(node, ast.Name):
            if node.id not in FIELDS:
                raise FormulaError(f"Unknown name '{node.id}'. Available data: "
                                   + ", ".join(FIELDS))
            fields.append(node.id)
            return
        if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.USub, ast.UAdd)):
            return check(node.operand)
        if isinstance(node, ast.BinOp) and type(node.op) in _BINOPS:
            check(node.left)
            check(node.right)
            return
        if isinstance(node, ast.Compare):
            if len(node.ops) != 1 or type(node.ops[0]) not in _CMPOPS:
                raise FormulaError("Use a single comparison: <, <=, > or >=.")
            check(node.left)
            check(node.comparators[0])
            return
        if isinstance(node, ast.Call):
            if not isinstance(node.func, ast.Name) or node.func.id not in _SIGNATURES:
                name = getattr(node.func, "id", "?")
                raise FormulaError(f"Unknown function '{name}'. Available: "
                                   + ", ".join(sorted(_SIGNATURES)))
            if node.keywords:
                raise FormulaError("Write arguments by position, e.g. mean(volume, 20).")
            name = node.func.id
            n_series, n_win = _SIGNATURES[name]
            if len(node.args) != n_series + n_win:
                raise FormulaError(f"{name}() takes {n_series + n_win} argument(s).")
            funcs.append(name)
            for a in node.args[:n_series]:
                check(a)
            for a in node.args[n_series:]:
                if name == "clip":
                    v = a.operand.value if (isinstance(a, ast.UnaryOp) and
                                            isinstance(a.operand, ast.Constant)) else \
                        getattr(a, "value", None)
                    if not isinstance(v, (int, float)):
                        raise FormulaError("clip() bounds must be numbers.")
                    continue
                if not (isinstance(a, ast.Constant) and isinstance(a.value, int)
                        and not isinstance(a.value, bool)):
                    raise FormulaError(f"The window in {name}() must be a whole number, "
                                       "e.g. 20.")
                lo = 0 if name == "lag" else 1
                if not lo <= a.value <= MAX_WINDOW:
                    raise FormulaError(f"Windows must be between {max(lo, 1)} and "
                                       f"{MAX_WINDOW} days.")
                if name in ("std", "corr", "skew", "ts_rank") and a.value < 3:
                    raise FormulaError(f"{name}() needs a window of at least 3 days.")
                windows.append(a.value)
            return
        raise FormulaError("That expression is not allowed. Use data names, numbers, "
                           "+ − × ÷, comparisons and the listed functions.")

    check(tree)
    if not fields and "ret" not in funcs:
        raise FormulaError("The formula must use some data (e.g. close, volume, ret(5)).")
    return Parsed(text, tree, windows, sorted(set(fields)), sorted(set(funcs)))


# --------------------------------------------------------------- evaluation
def _cs_rank(x):
    return x.rank(axis=1, pct=True)


def _cs_z(x):
    z = x.sub(x.mean(axis=1), axis=0).div(x.std(axis=1).replace(0, np.nan), axis=0)
    return z.clip(-3, 3)


def _roll(x, n, how):
    mp = max(2, int(np.ceil(n * 0.75))) if n > 1 else 1
    r = x.rolling(n, min_periods=mp)
    return getattr(r, how)()


def evaluate(text_or_parsed, mkt: Market) -> pd.DataFrame:
    """Compute a formula on the market. Output aligned to dates x tickers, known at the
    close of each date."""
    p = text_or_parsed if isinstance(text_or_parsed, Parsed) else parse(text_or_parsed)
    r = mkt.daily_returns("close")
    data = {
        "close": mkt.close, "open": mkt.open, "high": mkt.high, "low": mkt.low,
        "volume": mkt.volume.where(mkt.volume > 0), "dvol": mkt.dollar_volume,
        "r": r,
        "ovn": (mkt.open / mkt.close.shift(1) - 1).where(mkt.ret_valid),
        "intraday": mkt.close / mkt.open - 1,
    }
    sector = mkt.sector

    def ev(node):
        if isinstance(node, ast.Expression):
            return ev(node.body)
        if isinstance(node, ast.Constant):
            return float(node.value)
        if isinstance(node, ast.Name):
            return data[node.id]
        if isinstance(node, ast.UnaryOp):
            v = ev(node.operand)
            return -v if isinstance(node.op, ast.USub) else v
        if isinstance(node, ast.BinOp):
            a, b = ev(node.left), ev(node.right)
            with np.errstate(all="ignore"):
                if isinstance(node.op, ast.Div) and isinstance(b, pd.DataFrame):
                    b = b.where(b != 0)
                return _BINOPS[type(node.op)](a, b)
        if isinstance(node, ast.Compare):
            a, b = ev(node.left), ev(node.comparators[0])
            out = _CMPOPS[type(node.ops[0])](a, b)
            if not isinstance(out, pd.DataFrame):
                return float(out)
            out = out.astype(float)
            # a comparison involving missing data is unknown, not False
            for v in (a, b):
                if isinstance(v, pd.DataFrame):
                    out = out.where(v.notna())
            return out
        name = node.func.id
        n_series, _ = _SIGNATURES[name]
        xs = [ev(a) for a in node.args[:n_series]]
        ws = [a.value if isinstance(a, ast.Constant) else -a.operand.value
              for a in node.args[n_series:]]
        x = xs[0] if xs else None
        if name == "ret":
            n = ws[0]
            return np.expm1(np.log1p(r).rolling(n, min_periods=n).sum())
        if name in ("mean", "std", "sum", "max", "min", "skew"):
            return _roll(x, ws[0], name)
        if name == "lag":
            return x.shift(ws[0])
        if name == "delta":
            return x - x.shift(ws[0])
        if name == "corr":
            n = ws[0]
            return xs[0].rolling(n, min_periods=max(3, int(n * 0.75))).corr(xs[1])
        if name == "ts_rank":
            return x.rolling(ws[0], min_periods=max(3, int(ws[0] * 0.75))).rank(pct=True)
        if name == "rank":
            return _cs_rank(x)
        if name == "zscore":
            return _cs_z(x)
        if name == "sector_demean":
            sec = sector.reindex(x.columns).values
            return x - x.T.groupby(sec).transform("mean").T
        if name == "log":
            return np.log(x.where(x > 0)) if isinstance(x, pd.DataFrame) else np.log(x)
        if name == "abs":
            return x.abs() if isinstance(x, pd.DataFrame) else abs(x)
        if name == "sign":
            return np.sign(x)
        if name == "clip":
            return x.clip(ws[0], ws[1])
        if name == "where":
            cond, a, b = xs
            base = next(v for v in (cond, a, b) if isinstance(v, pd.DataFrame))
            def full(v):
                return v if isinstance(v, pd.DataFrame) else pd.DataFrame(v, index=base.index,
                                                                          columns=base.columns)
            c = full(cond)
            return full(a).where(c > 0.5, full(b)).where(c.notna())
        raise FormulaError(name)

    out = ev(p.tree)
    if not isinstance(out, pd.DataFrame):
        raise FormulaError("The formula must depend on stock data, not only numbers.")
    return out.astype(float).replace([np.inf, -np.inf], np.nan)


def lookahead_check(text: str, mkt: Market, n_tickers: int = 60, seed: int = 0) -> bool:
    """Empirical check: perturb all data after a cut date and confirm the signal before
    the cut is unchanged. True = passes."""
    from quantlab.data.loader import Market as M
    cols = mkt.tickers[:n_tickers]
    cut = len(mkt.dates) // 2
    rng = np.random.default_rng(seed)

    def sub(df):
        return df[cols].copy()

    fields = ["open", "high", "low", "close", "volume"]
    a = M(**{f: sub(getattr(mkt, f)) for f in fields}, ret_valid=sub(mkt.ret_valid),
          member=sub(mkt.member), sector=mkt.sector.reindex(cols), coverage=mkt.coverage)
    b = M(**{f: sub(getattr(mkt, f)) for f in fields}, ret_valid=sub(mkt.ret_valid),
          member=sub(mkt.member), sector=mkt.sector.reindex(cols), coverage=mkt.coverage)
    noise = np.exp(rng.normal(0, 0.3, b.close.iloc[cut + 1:].shape))
    for f in ["open", "high", "low", "close"]:
        getattr(b, f).iloc[cut + 1:] *= noise
    b.volume.iloc[cut + 1:] *= np.exp(rng.normal(0, 1, b.volume.iloc[cut + 1:].shape))
    sa, sb = evaluate(text, a), evaluate(text, b)
    return bool(np.allclose(sa.iloc[: cut + 1].values, sb.iloc[: cut + 1].values,
                            equal_nan=True))
