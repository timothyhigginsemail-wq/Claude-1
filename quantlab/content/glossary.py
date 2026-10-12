"""One shared glossary: every tooltip, chip and the glossary page read from here.

Each entry answers four questions in a fixed order:
  what  — what it is, in one plain sentence
  read  — how to read the number
  guide — rough benchmarks (rules of thumb, not laws)
  trap  — the most common way it misleads
"""
from __future__ import annotations

GLOSSARY: dict[str, dict[str, str]] = {
    "ic": {
        "term": "Rank IC (information coefficient)",
        "what": "Each day, the correlation between how stocks rank on the signal and how "
                "they rank on their subsequent return. Averaged over all days.",
        "read": "+0.02 means stocks the signal liked did slightly better, on average. "
                "Negative means the signal points the wrong way.",
        "guide": "For daily equity signals: |IC| < 0.01 negligible · 0.01–0.03 weak but "
                 "potentially useful · 0.03–0.05 good · > 0.05 unusual — check for a bug "
                 "or look-ahead first.",
        "trap": "A tiny IC can still be statistically significant with many stocks and days, "
                "and still be too small to pay for trading.",
    },
    "t_stat": {
        "term": "t-statistic",
        "what": "The estimate divided by its uncertainty: how many 'noise widths' away "
                "from zero the result is.",
        "read": "t = 2.5 means the average is 2.5 standard errors above zero. The sign "
                "is the direction.",
        "guide": "|t| < 2 indistinguishable from noise · 2–3 suggestive · ≥ 3 strong "
                 "(Harvey, Liu & Zhu argue ~3 is the right bar given how many ideas the "
                 "industry has tested).",
        "trap": "The thresholds assume this was the ONLY test you ran. Try 20 variants and "
                "one will usually clear t = 2 by luck.",
    },
    "newey_west": {
        "term": "Newey-West standard errors",
        "what": "A way of measuring uncertainty that allows today's observation to be "
                "correlated with yesterday's.",
        "read": "Always use the Newey-West t, not the naive one, when returns overlap "
                "(a 5-day return measured every day shares 4 days with its neighbour).",
        "guide": "With h-day overlapping returns, the naive t is too large by roughly √h.",
        "trap": "Ignoring overlap is one of the most common ways backtests overstate "
                "significance.",
    },
    "naive_t": {
        "term": "Naive t-stat (shown for comparison only)",
        "what": "The t-stat you would get if every day were independent.",
        "read": "Compare it with the Newey-West t: the gap shows how much overlap inflates "
                "apparent significance.",
        "guide": "Never use it for decisions on multi-day horizons.",
        "trap": "Many published and internal backtests have quietly used this number.",
    },
    "p_value": {
        "term": "p-value",
        "what": "If the signal truly had no effect, the probability of seeing a result at "
                "least this strong by chance.",
        "read": "p = 0.03 means a 3% chance of a result this strong from noise alone.",
        "guide": "< 0.05 conventional 'significant' · < 0.01 strong · but see multiple "
                 "testing.",
        "trap": "It is NOT the probability the signal is real, and it says nothing about "
                "whether the effect is large enough to matter.",
    },
    "stars": {
        "term": "Significance stars",
        "what": "Shorthand for the p-value: * p < 0.10, ** p < 0.05, *** p < 0.01.",
        "read": "Raw stars treat each test alone. Adjusted stars account for every signal "
                "and variant you have tried.",
        "guide": "Trust adjusted stars. Raw stars across a long table are mostly decoration.",
        "trap": "A table full of stars after searching many variants is expected even if "
                "nothing is real.",
    },
    "holm": {
        "term": "Holm adjustment",
        "what": "Raises p-values to control the chance of even ONE false discovery among "
                "all tests run.",
        "read": "Holm-adjusted p < 0.05 means the result survives having tried everything "
                "in the family.",
        "guide": "Strict — appropriate when one false positive is costly (e.g. allocating "
                 "capital).",
        "trap": "It only corrects for the tests you counted. Unrecorded tries still inflate "
                "results.",
    },
    "bh": {
        "term": "Benjamini-Hochberg (false discovery rate)",
        "what": "Controls the expected FRACTION of false positives among the results you "
                "call discoveries.",
        "read": "BH-adjusted p < 0.05: among such discoveries, about 5% are expected to "
                "be false.",
        "guide": "More lenient than Holm — suited to screening many candidate signals.",
        "trap": "A 'discovery' under BH is a candidate for further testing, not a result.",
    },
    "reality_check": {
        "term": "Reality check (best-of-many test)",
        "what": "Asks whether the BEST signal you found is better than the best you would "
                "expect from the same number of useless signals (White, 2000).",
        "read": "p < 0.05: the top result is unlikely to be pure luck from searching.",
        "guide": "Use it whenever you report 'the best of' anything.",
        "trap": "Passing does not say WHICH signal is real, only that the best is not "
                "explained by search alone.",
    },
    "quantile_spread": {
        "term": "Quantile spread (top minus bottom)",
        "what": "Average return of the stocks the signal likes most minus those it likes "
                "least, before costs.",
        "read": "+10 bps over 5 days ≈ 5% a year before costs on $1 long / $1 short.",
        "guide": "Look for a roughly monotonic staircase across buckets, not just a big "
                 "difference at the ends.",
        "trap": "A spread driven by one bucket (often the shortest names) is fragile.",
    },
    "bps": {
        "term": "Basis point (bp)",
        "what": "One hundredth of a percent: 0.01%.",
        "read": "100 bps = 1%. Costs and small returns are quoted in bps.",
        "guide": "Trading large US stocks typically costs a few bps per trade; small caps "
                 "much more.",
        "trap": "A few bps per day adds up to many percent per year.",
    },
    "sharpe": {
        "term": "Sharpe ratio",
        "what": "Annualised return divided by annualised volatility: return per unit of risk.",
        "read": "1.0 means one unit of return per unit of risk each year.",
        "guide": "Net of costs, for a single stand-alone signal: < 0.5 weak · 0.5–1 decent · "
                 "> 1.5 excellent (and worth suspecting). Combined books aim higher.",
        "trap": "With 4 years of daily data, a Sharpe's uncertainty is roughly ±1. A "
                "backtest Sharpe of 1 can easily be luck.",
    },
    "sharpe_ci": {
        "term": "Sharpe confidence interval",
        "what": "The range the true Sharpe plausibly lies in, from a block bootstrap that "
                "respects day-to-day dependence.",
        "read": "If the interval includes 0, the data cannot rule out zero skill.",
        "guide": "Narrow intervals need long histories — decades for modest Sharpes.",
        "trap": "Intervals do not account for how many strategies you tried; see deflated "
                "Sharpe.",
    },
    "dsr": {
        "term": "Deflated Sharpe ratio",
        "what": "The probability the true Sharpe beats the best Sharpe you would expect from "
                "the same number of zero-skill attempts (Bailey & López de Prado, 2014).",
        "read": "0.97 means a 97% chance the strategy beats lucky search. 0.20 means it "
                "probably does not.",
        "guide": "≥ 0.95 is a common bar.",
        "trap": "Only as honest as the trial count you feed it.",
    },
    "drawdown": {
        "term": "Drawdown",
        "what": "Loss from the previous peak of cumulative performance.",
        "read": "-12% means the strategy is 12% below its best-ever level.",
        "guide": "Expect a maximum drawdown of roughly 2–3× annual volatility over long periods.",
        "trap": "Short backtests understate the worst drawdown you will eventually see.",
    },
    "turnover": {
        "term": "Turnover",
        "what": "How much is traded each day, as a fraction of capital (buys + sells).",
        "read": "60%/day on a 2× gross book means roughly a third of positions are "
                "replaced every day.",
        "guide": "Daily signals: 20–100%/day. Monthly signals: a few %/day.",
        "trap": "High turnover multiplies every cost assumption — a small error in cost "
                "per trade becomes a large error in net return.",
    },
    "breakeven": {
        "term": "Break-even cost",
        "what": "The all-in cost per dollar traded at which the strategy's profit is exactly "
                "zero.",
        "read": "If break-even is 4 bps and realistic costs are 6 bps, the strategy loses "
                "money.",
        "guide": "Want break-even at least 2× your cost estimate as a margin of safety.",
        "trap": "Free-data cost estimates are rough; a thin margin usually disappears in "
                "production.",
    },
    "capacity": {
        "term": "Capacity",
        "what": "How much capital a strategy can run before its own trading costs eat the "
                "edge.",
        "read": "Read the AUM where net Sharpe crosses your hurdle.",
        "guide": "Fast large-cap signals often have capacity in the tens to hundreds of $m.",
        "trap": "Impact models are calibrated on real fills; ours is an illustration.",
    },
    "impact": {
        "term": "Market impact (square-root law)",
        "what": "Your own trades push prices against you; the cost grows with the square "
                "root of trade size relative to daily volume.",
        "read": "Trading 1% of daily volume costs roughly coefficient × daily volatility × "
                "√0.01.",
        "guide": "Coefficients of ~0.5–1 are commonly reported.",
        "trap": "Impact dominates spread costs as the fund grows.",
    },
    "fama_macbeth": {
        "term": "Fama-MacBeth regression",
        "what": "Each day, regress returns across stocks on the signal and controls; then "
                "average the daily coefficients.",
        "read": "The coefficient is the return per 1 standard deviation of signal, holding "
                "the controls fixed.",
        "guide": "If the coefficient shrinks toward zero as controls are added, the signal "
                 "was a proxy for them.",
        "trap": "Only controls for what you include; missing factors (value, quality) are "
                "untested.",
    },
    "neutralize": {
        "term": "Neutralisation",
        "what": "Removing the part of a signal explained by known exposures (beta, size, "
                "sector…), keeping the remainder.",
        "read": "If the neutralised IC is near the raw IC, the signal is mostly new "
                "information.",
        "guide": "Standard before combining signals.",
        "trap": "Neutralising against a proxy that is mechanically related to your signal "
                "can remove the real effect.",
    },
    "alpha": {
        "term": "Alpha",
        "what": "Return not explained by the factor exposures in the regression.",
        "read": "Annualised % with its t-stat; the t-stat matters more than the level.",
        "guide": "Alpha t ≥ 2–3 after costs is the bar for something new.",
        "trap": "'Alpha' relative to a short list of factors may be beta to a factor you "
                "left out.",
    },
    "beta": {
        "term": "Beta",
        "what": "How much a stock (or portfolio) moves when the market moves 1%.",
        "read": "Beta 1.2 moves 1.2% for a 1% market move; a market-neutral book wants ≈ 0.",
        "guide": "Long/short books are often beta-neutralised so returns don't depend on "
                 "market direction.",
        "trap": "Betas estimated from 60 days are noisy.",
    },
    "survivorship": {
        "term": "Survivorship bias",
        "what": "Testing only on companies that still exist, which silently removes the "
                "failures.",
        "read": "Our data lacks ~100 of ~500 companies that were in the index in 2013.",
        "guide": "Institutional data (e.g. CRSP) includes delisted firms and their final "
                 "returns.",
        "trap": "It can bias results either way; you cannot know which without the missing "
                "data.",
    },
    "lookahead": {
        "term": "Look-ahead bias",
        "what": "Using information in a backtest that was not available at the time of the "
                "trade.",
        "read": "Every signal here uses data up to the close of day t; trades happen at the "
                "next open by default.",
        "guide": "If moving execution one day later destroys the result, suspect look-ahead.",
        "trap": "Subtle sources: final daily volume, revised data, today's index members.",
    },
    "holdout": {
        "term": "Holdout",
        "what": "Data deliberately left untouched until the specification is frozen, then "
                "used once.",
        "read": "Here: 2017–2018. A pass is the most credible evidence available on this data.",
        "guide": "Look once. Every extra look turns it into in-sample data.",
        "trap": "A short holdout can only catch large failures.",
    },
    "walk_forward": {
        "term": "Walk-forward test",
        "what": "Repeatedly choose parameters using only past data, then test on the next "
                "period.",
        "read": "Compare with the in-sample best: the gap is selection optimism.",
        "guide": "If walk-forward is much worse than in-sample, the parameters were fitted "
                 "to noise.",
        "trap": "Still uses the same history; it reduces but does not eliminate overfitting.",
    },
    "placebo": {
        "term": "Placebo signal",
        "what": "A random signal with no information, tested exactly like a real one.",
        "read": "Shows how often noise produces impressive-looking statistics here.",
        "guide": "About 5% of placebos should reach |t| > 2 if the statistics are honest.",
        "trap": "If placebos look good too, the testing method is broken.",
    },
    "decay": {
        "term": "Signal decay",
        "what": "How the predictive power is spread over the days after the signal.",
        "read": "Large early bars then nothing = fast signal (expensive to trade). Steady "
                "bars = slow signal.",
        "guide": "Match the holding period to where the information is realised.",
        "trap": "Bars that turn negative mean the effect reverses — holding too long gives it "
                "back.",
    },
    "persistence": {
        "term": "Signal persistence",
        "what": "How similar today's signal ranking is to yesterday's.",
        "read": "0.9 = rankings barely change (low turnover). 0.2 = rankings change "
                "almost completely.",
        "guide": "Low persistence + small IC is the classic untradeable combination.",
        "trap": "Smoothing a signal raises persistence but may also slow its information.",
    },
    "gross_net": {
        "term": "Gross vs net",
        "what": "Gross: before trading costs. Net: after spread, impact and borrow costs.",
        "read": "The gap is what implementation costs.",
        "guide": "Always judge strategies on net.",
        "trap": "Net is only as good as the cost model.",
    },
    "dollar_neutral": {
        "term": "Long/short, dollar-neutral",
        "what": "Equal dollars long and short, so broad market moves largely cancel.",
        "read": "Profit comes from longs beating shorts, not from the market rising.",
        "guide": "Usually combined with beta and sector neutrality.",
        "trap": "Dollar-neutral is not beta-neutral if longs are riskier than shorts.",
    },
    "pre_registration": {
        "term": "Pre-registration",
        "what": "Writing down the hypothesis, test and rejection rule BEFORE seeing results.",
        "read": "A locked hypothesis card here cannot be edited after results appear.",
        "guide": "Results of pre-registered tests deserve much more weight than post-hoc ones.",
        "trap": "Changing the hypothesis after seeing the data and re-testing on the same data "
                "is data mining.",
    },
    "incremental": {
        "term": "Incremental IC",
        "what": "The signal's IC after removing what known signals already explain.",
        "read": "If it stays close to the raw IC, the signal adds something new.",
        "guide": "This is what a portfolio manager cares about: marginal value to the book.",
        "trap": "A strong raw IC that collapses here is a known factor in disguise.",
    },
    "correlation": {
        "term": "Signal correlation",
        "what": "How similar two signals' daily rankings are, averaged over days.",
        "read": "> 0.5 largely the same bet · 0.2–0.5 overlapping · < 0.2 mostly different.",
        "guide": "Combining uncorrelated signals is how weak signals become a strategy.",
        "trap": "Low correlation of signals does not guarantee low correlation of returns.",
    },
}


def help_text(key: str) -> str:
    """Markdown for a tooltip (Streamlit `help=`)."""
    g = GLOSSARY[key]
    return (f"**{g['term']}** — {g['what']}\n\n**How to read it:** {g['read']}\n\n"
            f"**Rule of thumb:** {g['guide']}\n\n**Watch out:** {g['trap']}")


def stars(p: float) -> str:
    """Conventional significance stars from a p-value."""
    try:
        if p != p:   # NaN
            return ""
    except TypeError:
        return ""
    return "***" if p < 0.01 else "**" if p < 0.05 else "*" if p < 0.10 else ""
