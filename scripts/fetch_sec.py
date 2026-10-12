"""Fetch SEC EDGAR filing histories (for earnings-announcement dates and SIC codes) for
every ticker in dataset v3. Raw JSON cached in data/raw/sec/ (not committed).
SEC fair-access policy: <= 10 requests/second with a descriptive User-Agent."""
import json
import sys
import time
import urllib.request
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "raw" / "sec"
UA = {"User-Agent": "QuantResearchLab research-platform"}


def get(url):
    for k in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            time.sleep(2 * (k + 1))
        except Exception:
            time.sleep(2 * (k + 1))
    return None


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    # Ticker -> CIK. www.sec.gov's ticker file requires a personal email in the request, so
    # we use the CIK column of the S&P 500 constituents list (current members) instead.
    cons = pd.read_csv(ROOT / "data/raw/sp500_constituents_current.csv")
    cik_of = {str(s).upper().replace(".", "-"): int(c) for s, c in zip(cons["Symbol"], cons["CIK"])}
    extra_ciks = ROOT / "data/reference/extra_ciks.csv"
    if extra_ciks.exists():
        for _, r in pd.read_csv(extra_ciks).iterrows():
            cik_of[str(r["ticker"]).upper()] = int(r["cik"])
    ren = pd.read_csv(ROOT / "data/reference/yahoo_renames.csv").dropna(subset=["yahoo_symbol"]) \
        .set_index("membership_ticker")["yahoo_symbol"].to_dict()
    tickers = pd.read_csv(ROOT / "data/processed/v3/sectors.csv")["ticker"].tolist()
    mapping, missing = {}, []
    for t in tickers:
        for cand in (t.replace(".", "-"), ren.get(t, ""), t.replace(".", "")):
            if cand and cand.upper() in cik_of:
                mapping[t] = cik_of[cand.upper()]
                break
        else:
            missing.append(t)
    (OUT / "ticker_cik.json").write_text(json.dumps(mapping))
    print(f"CIK found for {len(mapping)}/{len(tickers)}; missing: {missing[:30]}", flush=True)
    for i, (t, cik) in enumerate(sorted(mapping.items())):
        f = OUT / f"CIK{cik:010d}.json"
        if f.exists():
            continue
        j = get(f"https://data.sec.gov/submissions/CIK{cik:010d}.json")
        if j is None:
            continue
        extra = []
        for fl in j.get("filings", {}).get("files", []):
            e = get(f"https://data.sec.gov/submissions/{fl['name']}")
            if e:
                extra.append(e)
            time.sleep(0.15)
        j["_extra"] = extra
        f.write_text(json.dumps(j))
        time.sleep(0.15)
        if i % 100 == 0:
            print("fetched", i, flush=True)
    print("done")
