---
title: Look-ahead bias
type: concept
tags: [sample, pitfalls, backtesting]
status: evergreen
created: 2026-09-04
updated: 2026-10-12
---
# Look-ahead bias

Using information in a backtest that would not have been available at the time of the trade.

Classic sources:
1. Using the **close** price to compute a signal and also trade at that close.
2. Index membership taken from *today's* list → survivorship bias.
3. Restated fundamentals instead of point-in-time data.

The fix is explicit execution timing: signal at *t*, trade at the open of *t+1*. [[Walk-forward validation]] won't save you if the data itself leaks the future.

Related: [[Information coefficient]], [[Survivorship bias]].
