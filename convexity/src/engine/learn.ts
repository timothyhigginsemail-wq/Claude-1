// Educational layer: every concept has three depths and a live reading of the player's own book.

import type { GameState } from './game';
import { EQUITIES, SPECS, atmImplied, viewOf, parSwapRate, forward, impliedVol } from './market';
import { fmtUsd } from './book';
import { realizedVolFromCloses } from './clients';

export interface Topic {
  id: string;
  title: string;
  group: 'Greeks' | 'Volatility' | 'Exotics' | 'Book' | 'Markets';
  intuition: string;
  trader: string;
  quant: string;
  live?: (g: GameState) => string | null;
}

const k = (x: number) => fmtUsd(x);

export const TOPICS: Topic[] = [
  {
    id: 'delta',
    title: 'Delta',
    group: 'Greeks',
    intuition: 'Delta is how much your book makes or loses when the underlying moves. Here it is quoted in dollars per 1% move: Δ = +$200k means ORX up 1% makes you $200k. Down 1% loses it.',
    trader: 'Delta is the cheapest risk to remove: index futures cost a fraction of a basis point. So carrying delta should be a decision, not an accident. Desks hedge to a band rather than to zero, because hedging every wiggle burns spread. A delta you didn\'t choose is a bet you didn\'t mean to make.',
    quant: 'Δ$ = ∂V/∂S · S · 1%, computed by central bump-and-revalue (±0.5%, ±2% for Monte Carlo). The smile here is sticky-moneyness: the vol at a fixed strike moves when spot moves. So our delta includes a skew term,\n<math>Δ_sm = Δ_BS + Vega · ∂σ/∂K · K/S\nWith negative equity skew this makes put deltas less negative than Black–Scholes says.</math>',
    live: (g) => {
      const R = g.book.risk;
      const parts = (['ORX', 'NKT', 'AUR', 'EURUSD'] as const).filter((a) => Math.abs(R.delta[a]) > 1000).map((a) => `${SPECS[a].name} ${k(R.delta[a])}/1%`);
      return parts.length ? `Your book right now: ${parts.join(', ')}.` : 'Your book is delta-flat right now.';
    },
  },
  {
    id: 'gamma',
    title: 'Gamma',
    group: 'Greeks',
    intuition: 'Gamma is how fast your delta changes as the market moves. Long gamma: you get longer as it rallies and shorter as it falls, so moves help you. Short gamma: every move pushes you the wrong way.',
    trader: 'Short gamma books earn steadily and then lose in a hurry. Hedging delta does not remove gamma. It only resets the starting point. Big gaps such as earnings, central banks or crashes jump past your hedges, and that is where short gamma hurts. You cut gamma by buying options, not futures.',
    quant: 'Γ$ = ∂(Δ$)/∂(1%). The second-order P&L for a move of m% is\n<math>P&L ≈ Δ$·m + ½·Γ$·m²</math>\nso a −$50k gamma loses $50k·½·4² = $400k on a 4% move even if delta was flat. For worst-of products, cross-gamma ∂²V/∂S₁∂S₂ matters as much as the diagonal terms.',
    live: (g) => {
      const R = g.book.risk;
      const a = EQUITIES.slice().sort((x, y) => Math.abs(R.gamma[y]) - Math.abs(R.gamma[x]))[0];
      if (Math.abs(R.gamma[a]) < 1000) return 'You have no meaningful gamma right now.';
      return `${SPECS[a].name} gamma ${k(R.gamma[a])} per 1%. A 3% move gives about ${k(0.5 * R.gamma[a] * 9)} from gamma alone, whichever direction it goes.`;
    },
  },
  {
    id: 'theta',
    title: 'Theta & the gamma–theta trade',
    group: 'Greeks',
    intuition: 'Theta is what one day passing does to your book. Long options lose a little every day and short options earn it. That money is the market paying the option seller to take gamma risk.',
    trader: 'Theta and gamma are two sides of one bet: will the market realise more or less volatility than the option price implies? The break-even daily move is about √(2θ/Γ). If the market moves more than that, long gamma wins. If less, the theta collector wins.',
    quant: 'Under Black–Scholes with zero rates, θ = −½·Γ_S·S²·σ²: theta exactly pays for the expected gamma P&L at the implied vol. The daily P&L of a delta-hedged option is\n<math>P&L_day ≈ ½·Γ_S·S²·(r_realised² − σ_implied²·Δt)</math>\nso the edge of a delta-hedged option book is realised minus implied variance, weighted by gamma.',
    live: (g) => {
      const R = g.book.risk;
      const a = EQUITIES.slice().sort((x, y) => Math.abs(R.gamma[y]) - Math.abs(R.gamma[x]))[0];
      if (Math.abs(R.gamma[a]) < 1000 || Math.abs(R.theta) < 10) return null;
      const be = Math.sqrt(Math.abs((2 * R.theta) / R.gamma[a]));
      return `Theta ${k(R.theta)}/day vs ${SPECS[a].name} gamma ${k(R.gamma[a])}: break-even daily move ≈ ${be.toFixed(2)}%.`;
    },
  },
  {
    id: 'vega',
    title: 'Vega',
    group: 'Greeks',
    intuition: 'Vega is your exposure to implied volatility, the price of options. Long vega makes money when options get more expensive, for example when fear rises.',
    trader: 'Vega is not one number. A 1M option and a 1Y option react differently: short-dated vol jumps in a selloff, long-dated vol moves less. Equity vol also jumps when spot falls, so short vega and long delta lose together in a crash. Event vol builds into a release and drains out after it.',
    quant: 'ν$ = ∂V/∂σ per vol point, for a parallel shift of the whole smile. Vega of an ATM option grows like √T. In the P&L explain we use the 3M ATM move as the vol driver, so term-structure and skew changes land in the residual.',
    live: (g) => {
      const R = g.book.risk;
      const parts = (['ORX', 'NKT', 'AUR', 'EURUSD'] as const).filter((a) => Math.abs(R.vega[a]) > 1000).map((a) => `${SPECS[a].name} ${k(R.vega[a])}/pt`);
      return parts.length ? `Vega by name: ${parts.join(', ')}.` : 'No meaningful vega in the book.';
    },
  },
  {
    id: 'vanna',
    title: 'Vanna & volga',
    group: 'Greeks',
    intuition: 'Vanna is how your delta changes when vol moves. Volga is how your vega changes when vol moves. They\'re second-order, but they show up exactly when markets get violent.',
    trader: 'In an equity selloff spot falls and vol rises together. Vanna turns that into extra delta at the worst time. Long volga, like long wings, gets longer vega as vol rises. That is why OTM options trade at a premium in the smile.',
    quant: 'Vanna = ∂²V/∂S∂σ, volga = ∂²V/∂σ². Market practitioners price exotics by vanna-volga: adjust the BS price by the cost of hedging the exotic\'s vanna and volga with 25-delta risk reversals and butterflies. Our P&L explain books the vanna × dS × dσ cross term explicitly.',
    live: (g) => {
      const R = g.book.risk;
      const a = EQUITIES.slice().sort((x, y) => Math.abs(R.vanna[y]) - Math.abs(R.vanna[x]))[0];
      return Math.abs(R.vanna[a]) > 500 ? `${SPECS[a].name} vanna ${k(R.vanna[a])} of delta per vol point; volga ${k(R.volga[a])}.` : null;
    },
  },
  {
    id: 'skew',
    title: 'Skew & the smile',
    group: 'Volatility',
    intuition: 'Options at different strikes trade at different implied vols. Equity puts are dearer than calls, because crashes happen faster than rallies and everyone wants protection.',
    trader: 'Skew decides what your exotics are worth. A down-and-in put or a worst-of autocall\'s knock-in lives on the downside wing. Skew steepens in stress. Barrier and digital prices depend on the slope of the smile, not just its level.',
    quant: 'Our smile is quadratic in standardised moneyness x = ln(K/F)/(σ_ATM√T):\n<math>σ(K,T) = σ_ATM(T) + skew·x + curv·x²</math>\nwith σ_ATM(T) from the instantaneous-vol mean-reversion term structure plus any scheduled event variance. Skew and curvature scale with the stress regime. A full local-vol or SLV model would make the barrier products consistent with the whole surface. We use a flat vol at a chosen strike, and say so.',
    live: (g) => {
      const v = viewOf(g.market);
      const T = 0.25;
      const F = forward(v, 'ORX', T);
      const iv = (m: number) => (impliedVol(v, 'ORX', F * m, T) * 100).toFixed(1);
      return `ORX 3M smile right now: 90% strike ${iv(0.9)} · ATM ${iv(1)} · 110% ${iv(1.1)}. The gap between the 90% and 110% strikes is the skew.`;
    },
  },
  {
    id: 'vrp',
    title: 'The volatility risk premium',
    group: 'Volatility',
    intuition: 'On average, implied vol is higher than the vol the market actually realises. Option sellers collect that gap as payment for carrying crash risk.',
    trader: 'Selling options is profitable most of the time. Then a crash hands back a year of premium in a week. The premium is real, and so is the risk. A good vol seller sizes for the crash, not for the average day.',
    quant: 'In this world implied ATM = √(E[average variance]) × (1 + VRP), with VRP depending on the regime (≈11–20% of vol). Realised vol follows a mean-reverting log-vol process with −0.75 spot-vol correlation and negatively skewed jumps.',
    live: (g) => {
      const rv = realizedVolFromCloses(g.market.closes, g.market.intraday);
      const v = viewOf(g.market);
      const iv = atmImplied(v, 'ORX', 1 / 12);
      return rv.ORX ? `ORX: 1M implied ${(iv * 100).toFixed(1)} vs ~15-day realised ${(rv.ORX * 100).toFixed(1)}.` : `ORX 1M implied ${(iv * 100).toFixed(1)}. Realised needs a few days of history.`;
    },
  },
  {
    id: 'eventvol',
    title: 'Event volatility',
    group: 'Volatility',
    intuition: 'Before a central-bank decision or earnings, options price in the jump. Expiries just after the event cost more. Once the news is out, that premium vanishes. This is the vol crush.',
    trader: 'Long event vol pays if the move beats what was priced. Short event vol earns the crush if it doesn\'t. Either way, delta-hedging can\'t protect you inside the jump. Size your gamma for the implied move, and assume the realised move can be twice that.',
    quant: 'Each scheduled event adds variance v_e to every expiry after it:\n<math>σ_total(T)² · T = σ_diffusive(T)² · T + Σ v_e</math>\nThe implied move for an event is √v_e (≈0.8·√v_e as a mean absolute move). After the event, v_e drops out of every expiry. That is the crush.',
    live: (g) => {
      const e = g.market.events.find((x) => x.status === 'pending' && x.day >= g.market.day);
      if (!e) return null;
      const mv = Object.entries(e.moveStd).map(([a, s]) => `${a} ±${(s! * 100).toFixed(1)}%`).join(', ');
      return `Next: ${e.title} (D${e.day + 1}), priced at ${mv} (1σ).`;
    },
  },
  {
    id: 'vanilla',
    title: 'Vanilla options',
    group: 'Exotics',
    intuition: 'A call pays if the underlying ends above the strike, a put if it ends below. The premium you charge should cover the expected cost of hedging, plus a margin for the risk you can\'t hedge.',
    trader: 'Clients buy puts for protection and sell calls for yield. That natural flow leaves dealers short downside and long upside. Price the wing you are already short with more care.',
    quant: 'Generalised Black–Scholes–Merton with strike-dependent smile vol:\n<math>C = S·e^(−qT)·N(d₁) − K·e^(−rT)·N(d₂),  d₁ = [ln(S/K) + (r−q+σ²/2)T] / σ√T</math>\nFX options use Garman–Kohlhagen (q = r_EUR). Put–call parity holds exactly on the smile (tested).',
  },
  {
    id: 'barrier',
    title: 'Barrier options',
    group: 'Exotics',
    intuition: 'A barrier option switches on (knock-in) or off (knock-out) if the underlying ever touches a level. A down-and-in put is cheap crash protection: it only works if the market falls through the barrier.',
    trader: 'Barriers concentrate risk near the barrier. Close to it, delta, gamma and vega change sign and get large. A knock-out you are short becomes a nightmare at the barrier, because a tiny move wipes out your hedge requirement. Desks shift barriers in their own favour for hedging. The sales term is "barrier shift".',
    quant: 'Closed-form Reiner–Rubinstein (continuous monitoring, no rebate), all eight types. In + out = vanilla is tested, and so is agreement with a Broadie–Glasserman-corrected Monte Carlo. Simplification: flat vol at the strike. With equity skew, a local-vol model makes down-and-in puts dearer. Lifecycle checks the barrier every 5 minutes.',
  },
  {
    id: 'digital',
    title: 'Digital options',
    group: 'Exotics',
    intuition: 'A digital pays a fixed amount if the underlying finishes beyond the strike, and nothing otherwise. It is a pure bet on direction.',
    trader: 'Digitals are easy to price and nasty to hedge. Near expiry at the strike, delta becomes enormous. Desks book them as tight call spreads ("overhedge") and charge for the spread width.',
    quant: 'A digital is the negative strike-derivative of a call. With a smile this includes a skew term:\n<math>D = e^(−rT)·N(d₂) − Vega(K)·∂σ/∂K</math>\nWith negative skew (∂σ/∂K < 0) a digital call is worth more than the flat-vol price. Our pricer includes the slope (tested against a call spread on the smile).',
  },
  {
    id: 'autocall',
    title: 'Worst-of autocallables',
    group: 'Exotics',
    intuition: 'Investors buy a note paying a big coupon. If all underlyings are above their start levels on an observation date, the note repays early ("autocalls"). If the worst one ends below the knock-in barrier at maturity, the investor takes that loss. The coupon is paid for by the investor selling the bank a worst-of put.',
    trader: 'Selling autocalls leaves the desk long downside vega, short correlation, and with gamma that flips sign around the barriers. As one name falls toward the knock-in, risk piles up on it: delta swells, vega jumps. Correlation is the hidden risk. Worst-of products are worth more to the investor when names move together, so the desk is short correlation, and nothing listed hedges it.',
    quant: 'Monte Carlo on observation dates only (exact for GBM): correlated log-normal paths, flat vol per name from the smile at the spot/KI midpoint, quanto drift r_EUR − q − ρ_S,FX·σ_S·σ_FX for euro names, and discounting at the curve plus the bank\'s funding spread. Barriers are smoothed over a 2% band so Greeks stay stable. PV is linear in the coupon, PV = A + c·B, so the fair coupon is solved exactly on the same paths. Simplifications: European KI, no stochastic vol or local vol, flat correlation.',
    live: (g) => {
      const n = g.book.positions.filter((p) => p.inst.type === 'autocall');
      return n.length ? `You hold ${n.length} note${n.length > 1 ? 's' : ''}, total correlation exposure ${k(g.book.risk.corr01)} per correlation point.` : 'No notes in the book yet.';
    },
  },
  {
    id: 'correlation',
    title: 'Correlation risk',
    group: 'Exotics',
    intuition: 'Worst-of products depend on how the underlyings move together. If they move in lockstep, the worst-of behaves like a single stock. If they diverge, the worst one drags everything down.',
    trader: 'Desks that sell worst-of notes are structurally short correlation. Normally falling correlation (dispersion) helps them and rising correlation hurts. In a crash correlation spikes, but so does everything else. The real killer is a single-name blow-up: one stock collapses alone, correlation falls, and the worst-of knocks in. You can recycle correlation by trading the opposite product with other clients, but you can\'t buy it on screen.',
    quant: 'corr01 = ∂V/∂ρ per correlation point, bumping all equity pairs together (±10 points, because MC payoffs are discontinuous). Implied correlation = realised + premium. The correlation matrix is rebuilt from the level and kept positive-definite by Cholesky with shrinkage.',
    live: (g) => `Book correlation exposure: ${k(g.book.risk.corr01)} per +1 correlation point. Implied equity correlation is ${(viewOf(g.market).eqCorr * 100).toFixed(0)}.`,
  },
  {
    id: 'quanto',
    title: 'Quanto',
    group: 'Exotics',
    intuition: 'A quanto pays the performance of a foreign asset in your own currency, with no FX conversion. The investor gets AUR\'s performance in dollars without taking euro risk.',
    trader: 'Someone has to hold the FX risk, and that is the desk. If euro stocks and the euro fall together (positive correlation), hedging costs you money. The quanto drift adjustment charges for it.',
    quant: 'Under the USD measure a EUR asset paid in USD drifts at\n<math>μ = r_EUR − q − ρ(S, EURUSD) · σ_S · σ_FX</math>\nso positive correlation lowers the forward. Our autocall MC applies this to AUR.',
  },
  {
    id: 'pnlexplain',
    title: 'P&L explain',
    group: 'Book',
    intuition: 'Every dollar of P&L should have a reason: client edge, a move times a Greek, time passing, or something your risk numbers missed.',
    trader: 'The daily explain is how traders learn. Big "unexplained" P&L means your risk measures don\'t describe your book. Usually that is a barrier, a jump or the smile moving. Edge minus costs is skill you locked in. Greeks times moves is the outcome of exposures you chose, or didn\'t.',
    quant: 'At every tick, per position:\n<math>ΔV = Σ Δ·m + ½Γ·m² + ν·dσ + vanna·m·dσ + θ·dt + DV01·dr + corr01·dρ + residual</math>\nusing the Greeks from before the move. Buckets always reconcile exactly to the change in book value (cash + Σ qty·PV). That is unit-tested.',
  },
  {
    id: 'var',
    title: 'VaR, ES and stress',
    group: 'Book',
    intuition: 'VaR 99% is the loss you expect to exceed only one day in a hundred. Expected shortfall is the average loss on those bad days. Stress tests revalue the whole book under named disasters.',
    trader: 'VaR is calibrated on normal-ish days and misses jumps and regime breaks. Stress tests tell you what kills you. Risk managers watch both. A book that looks fine on VaR and terrible on "crash" is a short-gamma, short-wing book.',
    quant: 'VaR here is delta-gamma-vega: 2,000 correlated, fat-tailed (Student-t, 4 dof) one-day factor scenarios applied to the book\'s Greeks, including vanna and volga terms. Stress tests are full revaluation, Monte Carlo included, under six named scenarios plus a spot × vol grid.',
  },
  {
    id: 'hedgecost',
    title: 'Hedging costs',
    group: 'Book',
    intuition: 'Every hedge crosses a bid-offer spread. Hedge too often and the costs eat your edge. Hedge too little and you carry risk you aren\'t paid for.',
    trader: 'Desks hedge to bands: re-hedge when delta leaves a range, not on every tick. Net client flows against each other before going to the street. Theo\'s inter-desk axes are cheaper than screen prices. Spreads widen with size (square-root impact) and with stress. Forced liquidations cost double.',
    quant: 'Half-spread = base(bp or vol pts) × liquidity(regime, shocks) × (1 + k·√(size/ADV)). Hedge costs are booked separately from market P&L, so you can see exactly what execution cost you.',
  },
  {
    id: 'informed',
    title: 'Adverse selection',
    group: 'Markets',
    intuition: 'Some clients know more than you. If the sharpest fund in the market keeps buying from you, they probably know something you don\'t.',
    trader: 'Price informed flow wider, or hedge it immediately. A high hit ratio with sophisticated clients usually means your price is wrong, not that you are popular. Relationship clients such as pensions and corporates trade for hedging needs, and that flow is the valuable kind.',
    quant: 'In this world each client has an "informedness" parameter: the direction of their trades is correlated with the next two days\' latent market drift. Sable Macro is the most informed. Cobalt Ridge trades on implied vs realised vol.',
  },
  {
    id: 'funding',
    title: 'Issuer funding',
    group: 'Markets',
    intuition: 'When a bank issues a note, it borrows the investor\'s money. The bank\'s credit spread is part of what pays for the coupon.',
    trader: 'Wider bank funding spreads mean juicier coupons. That also means the note is only as good as the bank. Treasury charges desks for the funding benefit they use.',
    quant: 'Note cash flows are discounted at r(T) + funding spread (currently 85bp). That lowers the note\'s fair value, and the gap is part of the issuer\'s margin.',
  },
  {
    id: 'swap',
    title: 'Interest rate swaps',
    group: 'Markets',
    intuition: 'A swap exchanges fixed interest for floating interest. Receiving fixed is like owning a bond: you win when rates fall.',
    trader: 'Pensions and insurers receive long-dated fixed to match their liabilities, which leaves the desk paying fixed: short duration. DV01 is your $ P&L per 1bp. Rates move 5–10bp on normal days and 20bp+ on central-bank surprises.',
    quant: 'Single-curve, annual fixed leg; the floating leg accrues the short rate continuously, so its value is 1 − DF(T). Par rate S = (1 − DF(T)) / Σ DF(tᵢ). The curve is Nelson–Siegel (level/slope/curvature) with stochastic level and slope.',
    live: (g) => `USD 2Y ${(parSwapRate(g.market.curve, 2) * 100).toFixed(3)}%, 10Y ${(parSwapRate(g.market.curve, 10) * 100).toFixed(3)}%. Book DV01 ${k(g.book.risk.dv01)}/bp.`,
  },
  {
    id: 'fxfwd',
    title: 'FX forwards',
    group: 'Markets',
    intuition: 'A forward locks in an exchange rate for a future date. The forward differs from spot by the interest-rate differential, not by anyone\'s view.',
    trader: 'Corporates sell their foreign revenues forward. You price off spot plus forward points and hedge with spot and rates. Your margin is a fraction of a pip times big notionals.',
    quant: 'Covered interest parity: F = S·e^((r_USD − r_EUR)T). PV of a long EUR forward = N·(F − K)·DF_USD(T).',
  },
];

export const topicById = (id: string) => TOPICS.find((t) => t.id === id) ?? TOPICS[0];
