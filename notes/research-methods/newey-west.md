---
title: Newey-West standard errors
type: concept
tags: [sample, statistics]
status: budding
created: 2026-09-10
updated: 2026-10-05
---
# Newey-West standard errors

A heteroskedasticity- and autocorrelation-consistent (HAC) estimator of the standard error of a mean. Use it when your observations overlap — e.g. daily [[Information coefficient]] values on 5-day forward returns.

Rule of thumb for the lag: at least the overlap length (h − 1), often `floor(4 (T/100)^(2/9))`.

TODO: compare with a block bootstrap.
