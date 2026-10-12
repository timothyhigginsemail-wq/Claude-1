"""How a systematic research organisation is commonly described as working.

Labels:
  [Public]       — practices widely described in public sources: academic
                   literature, practitioner books (e.g. Grinold & Kahn, 'Active
                   Portfolio Management'; López de Prado, 'Advances in Financial
                   Machine Learning'; Chincarini & Kim, 'Quantitative Equity
                   Portfolio Management'), conference talks and job descriptions.
  [Illustrative] — our own assumptions for teaching. No specific firm's
                   proprietary process is known or implied.
"""

ROLES = {
    "Quant researcher (QR)": (
        "Owns the hypothesis end to end: proposes the idea, designs the test, writes "
        "the research code, and argues for or against it in review. Expected to try "
        "hard to break their own result. [Public]"),
    "Data engineer": (
        "Acquires, cleans and maintains point-in-time datasets: corporate actions, "
        "delistings, symbol changes, vendor errors, timestamps of when each datum "
        "became available. Much of a fund's edge is in data hygiene. [Public]"),
    "Research / software engineer": (
        "Builds the shared research platform (backtester, factor library, risk model, "
        "compute) and the production code that turns approved signals into orders. "
        "Ensures research code and production code compute the same thing. [Public]"),
    "Portfolio manager (PM)": (
        "Decides which signals enter the combined portfolio and at what weight, "
        "judging marginal contribution to the whole book rather than standalone "
        "performance. Owns the P&L. [Public]"),
    "Execution researcher / trader": (
        "Models transaction costs and market impact from the firm's own fills, "
        "designs execution algorithms, and estimates capacity. Often vetoes fast "
        "signals whose edge is smaller than their cost. [Public]"),
    "Risk manager": (
        "Independent of the PM. Monitors factor exposures, concentration, liquidity, "
        "crowding and drawdowns; sets limits; can force de-risking. [Public]"),
    "Research review committee": (
        "Senior researchers who review a project before capital is allocated. The "
        "existence of formal review is public knowledge; its exact form here is "
        "[Illustrative]."),
}

# stage -> (teams involved, evidence demanded, typical reasons to reject)
STAGES = {
    "idea": (
        ["Quant researcher", "PM (prioritisation)"],
        ["A falsifiable statement with a predicted sign and horizon",
         "An economic mechanism: who is on the other side of the trade and why they "
         "accept a worse price [Public]",
         "Literature review: is this already known, and is it already in our book? [Public]"],
        ["No plausible mechanism ('the data said so')",
         "Duplicates an existing signal",
         "Horizon/capacity incompatible with the firm's business [Illustrative]"]),
    "data": (
        ["Data engineering", "Quant researcher"],
        ["Provenance, licence and point-in-time availability of every field [Public]",
         "Survivorship-free universe including delisted names [Public]",
         "Documented corporate-action handling and error checks"],
        ["Data not available point-in-time (look-ahead)",
         "Universe built from today's index members (survivorship)",
         "Vendor cannot be used in production (licensing, latency) [Illustrative]"]),
    "signal": (
        ["Quant researcher", "Research engineering (code review)"],
        ["Exact formula, parameters fixed in advance, unit tests for time alignment",
         "Distribution, coverage and turnover of the signal"],
        ["Signal uses information not known at the trade time",
         "Unstable definition (results flip with tiny parameter changes)"]),
    "predict": (
        ["Quant researcher", "Review committee"],
        ["IC / quantile spreads with dependence-robust standard errors [Public]",
         "Decay profile across horizons; behaviour across regimes and sub-periods",
         "Count of variants tried (for multiple-testing correction) [Public]"],
        ["t-stat below the house hurdle (often cited around 3 in the literature, "
         "Harvey-Liu-Zhu 2016) [Public]",
         "Effect concentrated in one period or a few stocks"]),
    "factor": (
        ["Quant researcher", "Risk"],
        ["Results after neutralising known risk factors with the firm's risk model [Public]",
         "Correlation with signals already in production"],
        ["Explained by known factors (e.g. short-term reversal, momentum)",
         "No incremental value over the existing book [Public]"]),
    "portfolio": (
        ["PM", "Quant researcher", "Risk"],
        ["Optimised portfolio under realistic constraints (neutrality, position "
         "limits, liquidity) [Public]", "Marginal contribution to the combined book"],
        ["Only works unconstrained, or concentrated in illiquid names",
         "Adds risk that the book cannot hold (e.g. sector or crowding risk)"]),
    "implement": (
        ["Execution research", "Trading", "Engineering"],
        ["Turnover, cost per unit turnover, break-even cost, capacity curve [Public]",
         "Execution-timing sensitivity (signal time vs trade time)"],
        ["Edge smaller than realistic costs",
         "Capacity too small to matter at the firm's scale [Illustrative]"]),
    "evaluate": (
        ["Review committee", "Risk", "PM"],
        ["Out-of-sample / walk-forward results; deflated Sharpe [Public]",
         "Drawdown analysis, factor attribution, robustness to parameters"],
        ["Results do not replicate out of sample", "Too dependent on chosen parameters"]),
    "decide": (
        ["Review committee", "PM"],
        ["A written research memo with a clear recommendation and evidence",
         "A plan for paper-trading / small-capital live test and kill criteria "
         "[Illustrative]"],
        ["Any unresolved red flag above"]),
}
