---
title: Gamma scalping
type: strategy
tags: [sample, strategies, volatility]
status: budding
created: 2026-09-20
updated: 2026-10-31
---
# Gamma scalping

Buy an option, delta-hedge it repeatedly. Each re-hedge sells high and buys low, harvesting **realised** volatility; you pay [[Implied volatility]] via theta.

P&L ≈ ½ Γ S² (σ²_realised − σ²_implied) dt

See [[The Greeks]] for the gamma/theta trade-off. Hedging costs — the [[Bid-ask spread]] — eat into the edge.
