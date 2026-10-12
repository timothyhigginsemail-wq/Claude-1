"""Kenneth R. French Data Library daily factors (built from CRSP by the library).

Source: https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/data_library.html
Values are published in PERCENT per day; converted here to decimals.
"""
from __future__ import annotations

import io
import urllib.request
import zipfile

import pandas as pd

from quantlab.config import RAW_DIR

BASE = "https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/ftp/"
FILES = {
    "five": "F-F_Research_Data_5_Factors_2x3_daily_CSV.zip",
    "mom": "F-F_Momentum_Factor_daily_CSV.zip",
    "strev": "F-F_ST_Reversal_Factor_daily_CSV.zip",
}


def _read_csv_block(text: str) -> pd.DataFrame:
    lines = text.splitlines()
    start = next(i for i, l in enumerate(lines) if l.strip().startswith(",") or
                 l.strip().lower().startswith("date,") or (l[:1] == "," ))
    rows = []
    header = [c.strip() for c in lines[start].split(",")]
    for l in lines[start + 1:]:
        parts = [p.strip() for p in l.split(",")]
        if not parts[0].isdigit() or len(parts[0]) != 8:
            if rows:
                break
            continue
        rows.append(parts)
    df = pd.DataFrame(rows, columns=["date"] + header[1:])
    df["date"] = pd.to_datetime(df["date"], format="%Y%m%d")
    return df.set_index("date").astype(float) / 100.0


def fetch_french(raw_dir=RAW_DIR / "french", download: bool = True) -> pd.DataFrame:
    raw_dir.mkdir(parents=True, exist_ok=True)
    out = []
    for key, fname in FILES.items():
        path = raw_dir / fname
        if download and not path.exists():
            urllib.request.urlretrieve(BASE + fname, path)
        with zipfile.ZipFile(path) as z:
            name = [n for n in z.namelist() if n.lower().endswith(".csv")][0]
            text = z.read(name).decode("latin-1")
        out.append(_read_csv_block(text))
    df = pd.concat(out, axis=1, join="inner")
    df.columns = [c.replace("-", "_").replace(" ", "_").strip() for c in df.columns]
    return df.rename(columns={"Mom": "MOM", "ST_Rev": "STREV"})
