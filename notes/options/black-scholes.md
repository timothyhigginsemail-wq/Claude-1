---
title: Black-Scholes
type: concept
tags: [sample, pricing, models]
status: evergreen
created: 2026-09-01
updated: 2026-10-02
aliases: [BS, Black-Scholes-Merton]
---
# Black-Scholes

Prices a European option assuming the underlying follows geometric Brownian motion with constant volatility σ.

For a call: **C = S·N(d₁) − K·e^(−rT)·N(d₂)**

The key insight is **replication**: a continuously rebalanced delta hedge removes all risk, so the option price can't depend on expected return — only on volatility.

The model's one unobservable input is σ, so the market quotes options in [[Implied volatility]]. Its sensitivities are [[The Greeks]]. Real markets violate the constant-σ assumption → [[Volatility smile]], and models like [[Heston model]] try to fix that.
