"""Minimal direct client for Yahoo's public chart endpoint (no cookies/crumb needed)."""
import json
import time
import urllib.request

import pandas as pd

UA = {"User-Agent": "Mozilla/5.0 (QuantResearchLab research)"}


def chart(symbol, start="2004-01-01", end="2026-10-10", tries=3, _range=False):
    p1 = int(pd.Timestamp(start).timestamp())
    p2 = int(pd.Timestamp(end).timestamp())
    span = "range=max" if _range else f"period1={p1}&period2={p2}"
    url = (f"https://query2.finance.yahoo.com/v8/finance/chart/{symbol}?{span}"
           "&interval=1d&events=div%2Csplits&includeAdjustedClose=true")
    for k in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
                j = json.load(r)
            res = j["chart"]["result"]
            if not res:
                return None
            res = res[0]
            ts = res.get("timestamp")
            if not ts:
                # Yahoo sometimes answers a date range with no rows but serves full history
                return None if _range else chart(symbol, start, end, tries, _range=True)
            q = res["indicators"]["quote"][0]
            adj = res["indicators"].get("adjclose", [{}])[0].get("adjclose")
            idx = pd.to_datetime(ts, unit="s").normalize()
            df = pd.DataFrame({"Open": q["open"], "High": q["high"], "Low": q["low"],
                               "Close": q["close"], "Adj Close": adj, "Volume": q["volume"]},
                              index=idx)
            ev = res.get("events", {})
            dv, sp = ev.get("dividends") or {}, ev.get("splits") or {}
            dv = dv if isinstance(dv, dict) else {}
            sp = sp if isinstance(sp, dict) else {}
            div = pd.Series({pd.to_datetime(int(k), unit="s").normalize(): v["amount"]
                             for k, v in dv.items()}, dtype=float)
            spl = pd.Series({pd.to_datetime(int(k), unit="s").normalize():
                             v["numerator"] / v["denominator"]
                             for k, v in sp.items()}, dtype=float)
            div = div[~div.index.duplicated()]
            spl = spl[~spl.index.duplicated()]
            df["Dividends"] = div.reindex(df.index).fillna(0.0)
            df["Stock Splits"] = spl.reindex(df.index).fillna(0.0)
            df.index.name = "date"
            df = df[~df.index.duplicated()]
            return df[(df.index >= pd.Timestamp(start)) & (df.index <= pd.Timestamp(end))]
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            time.sleep(2 * (k + 1))
        except Exception:
            time.sleep(2 * (k + 1))
    return None
