---
title: Walk-forward validation
type: method
tags: [sample, backtesting]
status: budding
created: 2026-09-15
updated: 2026-10-25
---
# Walk-forward validation

Fit on a rolling (or expanding) window, then evaluate on the following, unseen window. Repeat. Concatenate only the out-of-sample segments.

- Add a **purge gap** between train and test equal to the label horizon.
- Keep the parameter-selection procedure itself inside the loop.

Guards against overfitting but not against [[Look-ahead bias]] or [[Multiple testing]] across many walk-forward runs.
