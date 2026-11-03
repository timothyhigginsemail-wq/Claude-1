---
title: Information coefficient
type: concept
tags: [sample, signals, statistics]
status: evergreen
created: 2026-09-03
updated: 2026-10-30
aliases: [IC, rank IC]
---
# Information coefficient

The **information coefficient (IC)** is the cross-sectional correlation between a signal today and returns over the next period. Most desks use the *rank* IC (Spearman), which is robust to outliers.

> An IC of 0.03 sounds tiny, but applied across 500 stocks every day it can be a very good strategy.

## Why it matters
- It isolates *predictive power* from portfolio construction choices.
- The IC decays with horizon; plotting the decay tells you how fast to trade.
- The *fundamental law of active management*: IR ≈ IC × √breadth. See [[Fundamental law of active management]].

## Pitfalls
Daily ICs on overlapping 5-day returns are autocorrelated, so the naive t-stat is too high — use [[Newey-West standard errors]]. And make sure the signal only uses information available at the time ([[Look-ahead bias]]).

```python
ic = signal.rank(axis=1).corrwith(fwd_ret.rank(axis=1), axis=1)
```
