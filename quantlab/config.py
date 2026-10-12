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
HOLDOUT_START = "2017-01-01"
