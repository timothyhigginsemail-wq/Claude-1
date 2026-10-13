import json
from datetime import datetime, timezone

import numpy as np
import pandas as pd
import plotly.graph_objects as go
import streamlit as st

from common import (COLORS, G, HYPOTHESES, ch, ic_table, interpret, market, quantiles, reading,
                    show, stars, style, terms, uni)
from quantlab.research.factors import neutralize, sector_dummies
from quantlab.research.pipeline import ResearchSpec
from quantlab.research.stats import rowwise_corr
from quantlab.signals.formula import EXAMPLES, FIELDS, FUNCTIONS, FormulaError, evaluate, lookahead_check, parse
from quantlab.signals.library import compute_signal

spec = st.session_state.spec
ss = st.session_state
ss.setdefault("lab_cards", [])
ss.setdefault("lab_formula", EXAMPLES[0][1])

st.title("🧪 Signal lab")
st.markdown("Invent a hypothesis, turn it into a signal, and test it the way a research "
            "team would: **write down what you expect first, then look.**")
terms("pre_registration", "lookahead", "ic", "t_stat", "incremental")

tab_new, tab_res, tab_saved = st.tabs(["1 · New hypothesis", "2 · Results", "3 · Save / load"])

# ------------------------------------------------------------------ builder
INGREDIENTS = {
    "Past return": ("ret({n})", 5),
    "Abnormal volume": ("log(volume / mean(lag(volume, 1), {n}))", 20),
    "Volatility": ("std(r, {n})", 20),
    "Size proxy (dollar volume)": ("log(mean(dvol, {n}))", 60),
    "Distance from N-day high": ("close / max(close, {n})", 252),
    "Overnight return": ("sum(ovn, {n})", 21),
    "Intraday return": ("sum(intraday, {n})", 21),
    "Trading range": ("mean(log(high / low), {n})", 21),
}
TRANSFORMS = {"as is": "{x}", "rank across stocks": "rank({x})",
              "z-score across stocks": "zscore({x})", "relative to sector": "sector_demean({x})"}


def ingredient(prefix: str, default: str):
    c1, c2 = st.columns([3, 2])
    name = c1.selectbox("Ingredient", list(INGREDIENTS), index=list(INGREDIENTS).index(default),
                        key=f"{prefix}_ing")
    tmpl, n0 = INGREDIENTS[name]
    n = c2.number_input("Days", 1, 252, n0, key=f"{prefix}_n")
    tr = st.selectbox("Transform", list(TRANSFORMS), index=2, key=f"{prefix}_tr")
    flip = st.toggle("Flip sign (bet on the opposite)", key=f"{prefix}_neg")
    x = TRANSFORMS[tr].format(x=tmpl.format(n=int(n)))
    return f"-{x}" if flip else x


with tab_new:
    st.subheader("Step 1 · The hypothesis card")
    st.caption("Fill this in before you see any results. Once locked it cannot be edited — "
               "that is what makes the test honest.")
    name = st.text_input("Short name", key="lab_name", placeholder="e.g. Quiet losers rebound")
    statement = st.text_area("Hypothesis — what predicts what?", key="lab_statement",
                             placeholder="Stocks that fell over the past week on unusually high "
                                         "volume outperform over the next 5 days.")
    mechanism = st.text_area("Mechanism — who is on the other side, and why do they accept "
                             "a worse price?", key="lab_mechanism",
                             placeholder="Forced sellers (fund redemptions) push prices below "
                                         "value; liquidity providers are paid to absorb them.")
    c1, c2 = st.columns(2)
    sign = c1.selectbox("Predicted direction", ["Positive", "Negative"], key="lab_sign")
    horizon = c2.selectbox("Primary horizon (days)", [1, 2, 5, 10, 20], index=2, key="lab_h")
    st.caption("Positive = a higher signal value should mean a higher future return. The "
               "primary horizon is the ONE your decision rests on; others are secondary.")
    reject = st.text_input("I will reject this if…", key="lab_reject",
                           value="|t| < 2 at the primary horizon, or the sign is wrong, or it "
                                 "vanishes after controlling for known signals")

    st.subheader("Step 2 · The signal")
    mode = st.segmented_control("Build it with", ["Point and click", "Formula", "Library"],
                                default="Point and click", key="lab_mode")
    if mode == "Point and click":
        first = ingredient("a", "Past return")
        combine = st.selectbox("Combine with a second ingredient?",
                               ["No", "Multiply", "Add", "Only when first is negative",
                                "Only when first is positive"], key="lab_combine")
        if combine != "No":
            second = ingredient("b", "Abnormal volume")
            formula = {"Multiply": f"{first} * {second}", "Add": f"{first} + {second}",
                       "Only when first is negative": f"where({first} < 0, {second}, 0)",
                       "Only when first is positive": f"where({first} > 0, {second}, 0)"}[combine]
        else:
            formula = first
        st.code(formula, language=None)
    elif mode == "Formula":
        ex = st.selectbox("Start from an example", ["—"] + [e[0] for e in EXAMPLES], key="lab_ex")
        if ex != ss.get("lab_ex_prev", "—"):
            ss.lab_ex_prev = ex
            if ex != "—":
                ss.lab_formula = dict(EXAMPLES)[ex]
        formula = st.text_area("Formula", key="lab_formula", height=90)
        with st.expander("What can I use?"):
            st.markdown("**Data**")
            st.dataframe(pd.DataFrame(FIELDS.items(), columns=["name", "meaning"]),
                         hide_index=True)
            st.markdown("**Functions** — windows are trading days, always looking backward")
            st.dataframe(pd.DataFrame(FUNCTIONS.items(), columns=["function", "meaning"]),
                         hide_index=True)
            st.markdown("Operators: `+ - * /`, comparisons `< <= > >=` (inside `where`).")
    else:
        lib = [k for k, h in HYPOTHESES.items() if not h.is_placebo]
        key = st.selectbox("Library signal", lib, key="lab_lib",
                           format_func=lambda k: f"{HYPOTHESES[k].family} · {HYPOTHESES[k].name}")
        h = HYPOTHESES[key]
        st.markdown(f"**{h.statement}**  \n{h.mechanism}  \n*{h.reference}*")
        formula = None

    parsed, err = None, None
    if formula is not None:
        try:
            parsed = parse(formula)
            st.success(f"Valid formula · data used: {', '.join(parsed.fields) or 'returns'} · "
                       f"longest window {max(parsed.windows) if parsed.windows else 1} days · "
                       f"{len(parsed.windows)} chosen number(s) of days")
        except FormulaError as e:
            err = str(e)
            st.error(err)

    st.subheader("Step 3 · Lock and test")
    missing = [n for n, v in [("name", name), ("hypothesis", statement), ("mechanism", mechanism)]
               if not v.strip()]
    if missing:
        st.caption("To lock, fill in: " + ", ".join(missing) + ".")
    can_lock = not missing and (formula is None or parsed is not None)
    if st.button("🔒 Lock hypothesis and show results", type="primary", disabled=not can_lock):
        card = {"name": name.strip(), "statement": statement.strip(),
                "mechanism": mechanism.strip(), "predicted_sign": sign, "horizon": int(horizon),
                "reject_if": reject.strip(), "locked_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                "source": mode, "formula": formula, "library_key": None if formula else key}
        if formula:
            with st.spinner("Checking for look-ahead…"):
                card["lookahead_ok"] = lookahead_check(formula, market(spec.dataset))
        else:
            card["lookahead_ok"] = True
        ss.lab_cards.append(card)
        ss.trials.add(("lab", card["name"], formula or key, int(horizon)))
        ss.lab_selected = len(ss.lab_cards) - 1
        st.success("Locked. Open the **Results** tab.")


# ------------------------------------------------------------------ results
def card_spec(card) -> ResearchSpec:
    if card.get("formula"):
        return ResearchSpec(hypothesis="custom", formula=card["formula"], horizon=card["horizon"],
                            min_price=spec.min_price, liquidity_pct=spec.liquidity_pct,
                            execution=spec.execution, dataset=spec.dataset)
    return ResearchSpec(hypothesis=card["library_key"], horizon=card["horizon"],
                        min_price=spec.min_price, liquidity_pct=spec.liquidity_pct,
                        execution=spec.execution, dataset=spec.dataset)


@st.cache_resource(show_spinner="Computing library signals for comparison…")
def library_ranks_sampled(min_price, liq, ds):
    """Daily ranks of every library signal on every 5th day (for fast correlations)."""
    m = market(ds)
    u = uni(ResearchSpec(min_price=min_price, liquidity_pct=liq, dataset=ds))
    out = {}
    for k, h in HYPOTHESES.items():
        if h.is_placebo:
            continue
        out[k] = compute_signal(m, k).where(u).iloc[::5].rank(axis=1).astype("float32")
    return out


@st.cache_data(show_spinner="Measuring overlap with known signals…", max_entries=16)
def overlap(formula, library_key, min_price, liq, ds):
    s = card_signal(formula, library_key, min_price, liq, ds)
    u = uni(ResearchSpec(min_price=min_price, liquidity_pct=liq, dataset=ds))
    r = s.where(u).iloc[::5].rank(axis=1)
    rows = []
    for k, R in library_ranks_sampled(min_price, liq, ds).items():
        if k == library_key:
            continue
        rows.append({"key": k, "signal": HYPOTHESES[k].name,
                     "corr": float(rowwise_corr(r, R.astype(float)).mean())})
    return pd.DataFrame(rows).sort_values("corr", key=np.abs, ascending=False)


@st.cache_resource(show_spinner="Computing your signal…", max_entries=16)
def card_signal(formula, library_key, min_price, liq, ds):
    m = market(ds)
    return evaluate(formula, m) if formula else compute_signal(m, library_key)


@st.cache_data(show_spinner="Testing what is new about it…", max_entries=16)
def incremental(formula, library_key, min_price, liq, execution, top_keys, ds):
    from quantlab.research.analysis import ic_by_horizon
    m = market(ds)
    u = uni(ResearchSpec(min_price=min_price, liquidity_pct=liq, dataset=ds))
    s = card_signal(formula, library_key, min_price, liq, ds)
    controls = dict(ch(ResearchSpec(min_price=min_price, liquidity_pct=liq, dataset=ds)))
    for k in top_keys:
        controls[f"lib_{k}"] = compute_signal(m, k)
    resid = neutralize(s, controls, u, sector_dummies(m))
    return ic_by_horizon(m, resid, u, (1, 2, 5, 10, 20), execution, "research")


with tab_res:
    cards = ss.lab_cards
    if not cards:
        st.info("No locked hypotheses yet. Fill in a card on the first tab and lock it.")
    else:
        idx = st.selectbox("Hypothesis", range(len(cards)), index=ss.get("lab_selected", len(cards) - 1),
                           format_func=lambda i: f"{i + 1}. {cards[i]['name']}", key="lab_pick")
        card = cards[idx]
        cs = card_spec(card)
        h = card["horizon"]
        with st.container(border=True):
            st.markdown(f"**{card['name']}** · locked {card['locked_at'][:16].replace('T', ' ')} UTC")
            st.markdown(f"*Hypothesis:* {card['statement']}  \n*Mechanism:* {card['mechanism']}  \n"
                        f"*Predicted:* {card['predicted_sign']} at {h} days · "
                        f"*Reject if:* {card['reject_if']}")
            if card.get("formula"):
                st.code(card["formula"], language=None)
            st.caption("✅ Passed the automatic look-ahead check" if card.get("lookahead_ok")
                       else "⚠️ Failed the look-ahead check — results are not valid.")

        tab = ic_table(cs, "research")
        row = tab.loc[h]
        want = 1 if card["predicted_sign"] == "Positive" else -1
        right_sign = np.sign(row.mean_ic) == want
        passed = right_sign and abs(row.t_nw) >= 2
        st.subheader("Verdict on the pre-registered test")
        c1, c2, c3 = st.columns(3)
        c1.metric(f"IC at {h} days", f"{row.mean_ic:+.4f}", help=G("ic"))
        c2.metric("t-stat", f"{row.t_nw:+.2f} {stars(row.p_nw)}", help=G("t_stat"))
        c3.metric("Direction", "as predicted" if right_sign else "OPPOSITE", help=G("ic"))
        if passed:
            st.success("Passes the primary test on the research sample. Next: check the "
                       "adjusted significance on the Leaderboard and the incremental test below.")
        elif not right_sign and abs(row.t_nw) >= 2:
            st.warning("Significant, but in the OPPOSITE direction to your prediction. Under "
                       "pre-registration this is a rejection; the reverse idea would be a new "
                       "hypothesis to test on new data.")
        else:
            st.error("Rejected as specified: not distinguishable from noise at the primary horizon.")
        reading(interpret.ic(row.mean_ic, row.t_nw, h))

        st.markdown("**All horizons** (secondary — do not re-choose the horizon after seeing these)")
        t2 = tab[["mean_ic", "t_nw", "p_nw"]].copy()
        t2["stars"] = t2["p_nw"].map(stars)
        st.dataframe(t2, column_config={
            "mean_ic": st.column_config.NumberColumn("Mean IC", format="%+.4f", help=G("ic")),
            "t_nw": st.column_config.NumberColumn("t (Newey-West)", format="%+.2f", help=G("newey_west")),
            "p_nw": st.column_config.NumberColumn("p", format="%.3f", help=G("p_value")),
            "stars": st.column_config.TextColumn("raw stars", help=G("stars"))})

        qt, _ = quantiles(cs, "research", 5)
        b = [x for x in qt.index if "-" not in x]
        fig = go.Figure(go.Bar(x=b, y=qt.loc[b, "mean_bps"], marker_color=COLORS["gross"],
                               error_y=dict(array=1.96 * qt.loc[b, "se_bps"])))
        show(style(fig, 240, f"{h}-day return vs. universe by signal quintile (bps)"))
        reading(interpret.spread(qt.iloc[-1].mean_bps, qt.iloc[-1].t_nw, h))

        st.subheader("Is it new?")
        terms("correlation", "incremental", "neutralize")
        ov = overlap(card.get("formula"), card.get("library_key"), spec.min_price, spec.liquidity_pct,
                     spec.dataset)
        top = ov.head(5)
        fig = go.Figure(go.Bar(x=top["corr"], y=top["signal"], orientation="h",
                               marker_color=[COLORS["long"] if v > 0 else COLORS["short"] for v in top["corr"]]))
        fig.update_yaxes(autorange="reversed")
        show(style(fig, 230, "Most similar known signals (avg. daily rank correlation)"))
        reading(interpret.correlation(top.iloc[0]["corr"], top.iloc[0]["signal"]))
        inc = incremental(card.get("formula"), card.get("library_key"), spec.min_price,
                          spec.liquidity_pct, spec.execution, tuple(top.head(3)["key"]),
                          spec.dataset)
        cmp = pd.DataFrame({"raw IC": tab["mean_ic"], "raw t": tab["t_nw"],
                            "incremental IC": inc["mean_ic"], "incremental t": inc["t_nw"]})
        st.dataframe(cmp.style.format("{:+.4f}"))
        st.caption("Incremental = after removing beta, size, reversal, momentum, volatility, "
                   "sector AND the three most similar library signals.")
        ri = inc.loc[h]
        if abs(row.t_nw) >= 2 and abs(ri.t_nw) < 2:
            reading("Most of the effect is already captured by known signals — a known factor "
                    "in a new wrapper.")
        elif abs(ri.t_nw) >= 2:
            reading(f"Something survives beyond known signals (incremental t = {ri.t_nw:+.2f}). "
                    "Check the Leaderboard's adjusted significance before getting excited.")
        else:
            reading("Neither the raw nor the incremental signal is distinguishable from noise.")

        st.subheader("Take it further")
        st.caption("Makes this the active hypothesis in the sidebar and opens stage 4.")
        if st.button("▶ Run it through all 9 stages (portfolio, costs, evaluation, decision)"):
            ss.p["custom_formula"] = card.get("formula")
            ss.p["custom_name"] = card["name"]
            ss.p["hyp"] = "custom" if card.get("formula") else card["library_key"]
            ss.p["horizon"] = h
            for k in ("w_hyp", "w_horizon"):   # re-initialise the sidebar from ss.p
                ss.pop(k, None)
            st.switch_page("views/s4_predict.py")

with tab_saved:
    st.markdown("The free hosting service forgets everything when the app restarts. Download "
                "your hypotheses to keep them, and upload the file next time.")
    if ss.lab_cards:
        st.download_button("⬇️ Download my hypotheses (.json)",
                           json.dumps(ss.lab_cards, indent=2), file_name="my_hypotheses.json",
                           mime="application/json")
        st.dataframe(pd.DataFrame(ss.lab_cards)[["name", "predicted_sign", "horizon", "locked_at",
                                                 "formula"]], hide_index=True)
    up = st.file_uploader("Load hypotheses", type="json")
    if up is not None and st.button("Add them to this session"):
        try:
            loaded = json.loads(up.read())
            good = []
            for c in loaded:
                if c.get("formula"):
                    parse(c["formula"])          # re-validate: uploaded text is untrusted
                elif c.get("library_key") not in HYPOTHESES:
                    continue
                good.append(c)
            ss.lab_cards.extend(good)
            for c in good:
                ss.trials.add(("lab", c["name"], c.get("formula") or c.get("library_key"), c["horizon"]))
            st.success(f"Loaded {len(good)} hypotheses. They count as trials in this session.")
        except (ValueError, KeyError, TypeError, FormulaError) as e:
            st.error(f"Could not read that file: {e}")
