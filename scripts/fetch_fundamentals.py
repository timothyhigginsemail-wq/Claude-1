"""Point-in-time fundamentals from SEC EDGAR company facts (XBRL, ~2009 onward).

For each company we keep EVERY filing of a few concepts with its filing date, so the
research can use only what was known at the time (first-reported values, no
restatements). Each company's JSON is parsed and discarded; only a compact table is
kept: data/raw/sec_facts.parquet (not committed)."""
import json
import sys
import time
import urllib.request
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
UA = {"User-Agent": "QuantResearchLab research-platform"}
CONCEPTS = {
    ("dei", "EntityCommonStockSharesOutstanding"): "shares",
    ("us-gaap", "StockholdersEquity"): "equity",
    ("us-gaap", "NetIncomeLoss"): "net_income",
    ("us-gaap", "Assets"): "assets",
}


def get(url):
    for k in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            time.sleep(3 * (k + 1))
        except Exception:
            time.sleep(3 * (k + 1))
    return None


if __name__ == "__main__":
    cik_map = json.loads((ROOT / "data/raw/sec/ticker_cik.json").read_text())
    out_path = ROOT / "data/raw/sec_facts.parquet"
    rows, done = [], set()
    if out_path.exists():
        old = pd.read_parquet(out_path)
        rows = old.to_dict("records")
        done = set(old["ticker"])
    for i, (t, cik) in enumerate(sorted(cik_map.items())):
        if t in done:
            continue
        j = get(f"https://data.sec.gov/api/xbrl/companyfacts/CIK{int(cik):010d}.json")
        time.sleep(0.12)
        if not j:
            continue
        facts = j.get("facts", {})
        for (tax, concept), name in CONCEPTS.items():
            units = facts.get(tax, {}).get(concept, {}).get("units", {})
            for unit, recs in units.items():
                for r in recs:
                    rows.append({"ticker": t, "concept": name, "unit": unit,
                                 "start": r.get("start"), "end": r.get("end"),
                                 "val": r.get("val"), "filed": r.get("filed"),
                                 "form": r.get("form"), "fp": r.get("fp")})
        if i % 50 == 0:
            pd.DataFrame(rows).to_parquet(out_path)
            print("companies", i, "rows", len(rows), flush=True)
    pd.DataFrame(rows).to_parquet(out_path)
    print("done", len(rows))
