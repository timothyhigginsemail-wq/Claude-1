"""Download daily OHLCV + dividends/splits from Yahoo Finance for every ticker that was an
S&P 500 member since 2005 (point-in-time list). Raw results are cached per batch in
data/raw/yahoo/ (not committed). Usage: python scripts/fetch_yahoo.py"""
import sys
import time
from pathlib import Path

import pandas as pd
import yfinance as yf

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "raw" / "yahoo"
START, END = "2004-01-01", "2026-10-10"


def tickers_since(start="2004-12-01"):
    h = pd.read_csv(ROOT / "data/raw/sp500_historical_components.csv", parse_dates=["date"])
    s = set()
    for t in h[h.date >= start].tickers:
        s |= set(t.split(","))
    return sorted(s)


def yahoo_symbol(t):
    return t.replace(".", "-")


def fetch(batch, tries=4):
    syms = [yahoo_symbol(t) for t in batch]
    for k in range(tries):
        try:
            df = yf.download(syms, start=START, end=END, auto_adjust=False, actions=True,
                             group_by="ticker", threads=True, progress=False)
            frames = []
            for t, s in zip(batch, syms):
                if s not in df.columns.get_level_values(0):
                    continue
                x = df[s].dropna(how="all", subset=["Close"])
                if len(x):
                    x = x.assign(ticker=t, yahoo=s)
                    frames.append(x)
            return pd.concat(frames) if frames else pd.DataFrame()
        except Exception as e:  # network hiccup / crumb error
            print("retry", k, e)
            time.sleep(5 * (k + 1))
    return pd.DataFrame()


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    tick = tickers_since()
    n = 40
    for i in range(0, len(tick), n):
        f = OUT / f"batch_{i // n:03d}.parquet"
        if f.exists():
            continue
        d = fetch(tick[i:i + n])
        d.reset_index().rename(columns={"Date": "date"}).to_parquet(f)
        print(f"batch {i // n}: {d['ticker'].nunique() if len(d) else 0}/{len(tick[i:i + n])} tickers", flush=True)
        time.sleep(1.5)
    print("done")
