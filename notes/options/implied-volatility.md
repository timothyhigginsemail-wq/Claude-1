---
title: Implied volatility
type: concept
tags: [sample, pricing, volatility]
status: evergreen
created: 2026-09-05
updated: 2026-10-27
---
# Implied volatility

The σ that makes [[Black-Scholes]] match the market price. It's a *quoting convention*: traders say "the 3-month 25-delta put is at 22 vol" rather than quoting dollars.

Plotting IV across strikes gives the [[Volatility smile]]; across strikes *and* expiries, the vol surface.

If realised vol ends up above implied, a delta-hedged long option makes money — the basis of [[Gamma scalping]].
