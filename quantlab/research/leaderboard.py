"""Every signal tried, on one table, with honest multiple-testing adjustments."""
from __future__ import annotations

import numpy as np
import pandas as pd

from quantlab.content.glossary import stars
from quantlab.research.analysis import sample_mask
from quantlab.research.stats import benjamini_hochberg, holm, mean_stats, reality_check


def summarize(ics: pd.DataFrame, names: dict[str, str], families: dict[str, str],
              sample: str = "research", lag: int = 1) -> pd.DataFrame:
    """ics columns are '<key>@<horizon>'. One row per signal, ICs per horizon, and
    p-values adjusted across EVERY (signal, horizon) cell in the table."""
    cells = []
    for col in ics:
        key, h = col.rsplit("@", 1)
        h = int(h)
        s = ics[col][sample_mask(ics.index, sample, h, lag)]
        st = mean_stats(s, horizon=h)
        cells.append({"key": key, "h": h, "ic": st["mean"], "t": st["t_nw"], "p": st["p_nw"]})
    c = pd.DataFrame(cells)
    ok = c["p"].notna()
    c["p_holm"] = np.nan
    c["p_bh"] = np.nan
    c.loc[ok, "p_holm"] = holm(c.loc[ok, "p"].values)
    c.loc[ok, "p_bh"] = benjamini_hochberg(c.loc[ok, "p"].values)
    rows = []
    for key, g in c.groupby("key", sort=False):
        g = g.set_index("h")
        if g["t"].notna().sum() == 0:      # no data for this signal on this dataset
            continue
        best_h = g["t"].abs().idxmax()
        row = {"key": key, "signal": names.get(key, key), "family": families.get(key, ""),
               "best_h": int(best_h), "best_t": g.loc[best_h, "t"],
               "p_raw": g.loc[best_h, "p"], "p_holm": g.loc[best_h, "p_holm"],
               "p_bh": g.loc[best_h, "p_bh"]}
        for h in g.index:
            row[f"IC {h}d"] = g.loc[h, "ic"]
            row[f"t {h}d"] = g.loc[h, "t"]
        row["stars_raw"] = stars(row["p_raw"])
        row["stars_adj"] = stars(row["p_holm"])
        rows.append(row)
    out = pd.DataFrame(rows).set_index("key")
    out.attrs["n_tests"] = int(ok.sum())
    return out.sort_values("best_t", key=lambda x: -x.abs())


def best_of_all(ics: pd.DataFrame, horizon: int = 5, sample: str = "research", lag: int = 1,
                n_boot: int = 500) -> dict:
    cols = [c for c in ics if c.endswith(f"@{horizon}")]
    X = ics[cols]
    X = X[sample_mask(X.index, sample, horizon, lag)]
    X.columns = [c.rsplit("@", 1)[0] for c in cols]
    return reality_check(X, horizon=horizon, n_boot=n_boot)
