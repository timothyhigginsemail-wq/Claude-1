"""Raw data sources, with provenance and integrity checks.

Each source is pinned by a SHA-256 checksum of the file we built the
research on. If the upstream file changes, the build stops instead of
silently producing different results (reproducibility).
"""
from __future__ import annotations

import hashlib
import urllib.request
from dataclasses import dataclass
from pathlib import Path

from quantlab.config import RAW_DIR


@dataclass(frozen=True)
class Source:
    key: str
    filename: str
    url: str
    sha256: str
    description: str
    limitations: str


SOURCES = {
    "prices": Source(
        key="prices",
        filename="all_stocks_5yr.csv",
        url="https://raw.githubusercontent.com/plotly/datasets/master/all_stocks_5yr.csv",
        sha256="6aea253cd19de60b568143991aaf1fa482456565c389205658d236e595e716cf",
        description=(
            "Daily open/high/low/close/volume for the 505 tickers that were S&P 500 "
            "members in Feb 2018, covering 2013-02-08 to 2018-02-07. Originally "
            "published on Kaggle ('S&P 500 stock data', C. Nugent) and mirrored in "
            "Plotly's public datasets repository."
        ),
        limitations=(
            "SURVIVORSHIP BIAS: only stocks still in the index in 2018 are included; "
            "companies that were removed, acquired or went bankrupt during 2013-2018 are "
            "missing. Prices and volumes appear split-adjusted but NOT dividend-adjusted "
            "(returns are price returns). No bid/ask, no intraday data, no shares "
            "outstanding (so no market capitalisation), no earnings dates. Vendor and "
            "exact adjustment method are undocumented."
        ),
    ),
    "membership": Source(
        key="membership",
        filename="sp500_historical_components.csv",
        url=(
            "https://raw.githubusercontent.com/fja05680/sp500/master/"
            "S%26P%20500%20Historical%20Components%20%26%20Changes%20(Updated).csv"
        ),
        sha256="36326709d46d6cd25834de5df457b16f5f96fad3a06b9beac28f7b88aa0b0d54",
        description=(
            "Point-in-time S&P 500 membership lists since 1996 (one row per change date), "
            "maintained by F. Jacobs, seeded from data accompanying A. Clenow's "
            "'Trading Evolved'."
        ),
        limitations=(
            "Community-maintained, not an official S&P Dow Jones Indices file. Some "
            "tickers are recorded under later symbols (e.g. PCLN appears as BKNG)."
        ),
    ),
    "sectors": Source(
        key="sectors",
        filename="sp500_constituents_current.csv",
        url="https://raw.githubusercontent.com/datasets/s-and-p-500-companies/main/data/constituents.csv",
        sha256="a8045f043ea7e68d4254a07470a5e95ca5759ded4656657eac514162e6e82e06",
        description="Current S&P 500 constituents with GICS sector (datahub.io / Wikipedia).",
        limitations=(
            "CURRENT classifications, not point-in-time. Companies that left the index "
            "are missing and were hand-labelled (data/reference/sector_manual.csv)."
        ),
    ),
}


def sha256_of(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def fetch(key: str, raw_dir: Path = RAW_DIR, verify: bool = True) -> Path:
    """Download a source (if not cached) and verify its checksum."""
    src = SOURCES[key]
    raw_dir.mkdir(parents=True, exist_ok=True)
    path = raw_dir / src.filename
    if not path.exists():
        print(f"Downloading {src.url}")
        urllib.request.urlretrieve(src.url, path)
    if verify:
        digest = sha256_of(path)
        if digest != src.sha256:
            raise ValueError(
                f"Checksum mismatch for {key}: expected {src.sha256}, got {digest}. "
                "The upstream file changed; review it before updating the pin."
            )
    return path
