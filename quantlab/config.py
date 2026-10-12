"""Project paths and global constants."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
RAW_DIR = DATA_DIR / "raw"
PROCESSED_DIR = DATA_DIR / "processed"
REFERENCE_DIR = DATA_DIR / "reference"
EXPERIMENTS_DIR = ROOT / "experiments"

PANEL_PATH = PROCESSED_DIR / "panel.parquet"
MEMBERSHIP_PATH = PROCESSED_DIR / "membership.parquet"
SECTORS_PATH = PROCESSED_DIR / "sectors.csv"
QUALITY_PATH = PROCESSED_DIR / "quality_report.json"

TRADING_DAYS = 252

# Last ~20% of the sample is reserved as an untouched holdout ("the vault").
# Fixed in advance so that it cannot be tuned after looking at results.
HOLDOUT_START = "2017-01-01"          # dataset v1 (kept for backward compatibility)

DATASETS = {
    "v3": {"label": "S&P 500 2005–2026 · Yahoo · 627 stocks",
           "dir": PROCESSED_DIR / "v3", "holdout": "2022-01-01",
           "short": "2005–2026"},
    "v1": {"label": "S&P 500 2013–2018 · Kaggle · 505 stocks (original)",
           "dir": PROCESSED_DIR, "holdout": "2017-01-01", "short": "2013–2018"},
}
DEFAULT_DATASET = "v3"

PERIODS = {   # human-readable sample names per dataset
    "v3": {"research": "2005–2021", "holdout": "2022–2026", "full": "2005–2026",
           "years": "17", "data_note": "17 research years, survivors only (~77% of index)"},
    "v1": {"research": "2013–2016", "holdout": "2017–2018", "full": "2013–2018",
           "years": "4", "data_note": "4 research years, survivors only (~89% of index)"},
}


def holdout_for(index) -> str:
    """Holdout start for the dataset a date index belongs to (v1 ends in Feb 2018)."""
    import pandas as pd
    last = pd.Timestamp(max(index)) if len(index) else pd.Timestamp("2000-01-01")
    return DATASETS["v1"]["holdout"] if last <= pd.Timestamp("2018-12-31") \
        else DATASETS["v3"]["holdout"]
