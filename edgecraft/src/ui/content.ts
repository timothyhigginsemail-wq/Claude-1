// Teaching content: lesson cards, "Why?" topics and onboarding coach steps.

export type WhyTopic = 'kelly' | 'volDrag' | 'correlation' | 'leverage' | 'estimation' | 'tail' | 'luck' | 'diversification' | 'logVsMean' | 'sharpeAlloc' | 'fixedVsPct' | 'repeated';

export const WHY_TEXT: Record<WhyTopic, { title: string; lead: string }> = {
  kelly: { title: 'Why is there an optimal size?', lead: 'Growth rises with exposure at first (edge accumulates linearly) and then falls (volatility drag grows with the square of exposure). The peak is the Kelly size; twice Kelly gives roughly zero growth.' },
  volDrag: { title: 'Why does volatility cost money?', lead: 'Compounded wealth grows at roughly μ − σ²/2. Double your exposure and the edge doubles, but the drag quadruples. That curvature is the entire reason size matters.' },
  correlation: { title: 'Why did they all lose together?', lead: 'Trades that look independent can share a factor. When that factor moves, every position moves with it, and diversification disappears precisely when you need it.' },
  leverage: { title: 'Why does more leverage eventually reduce growth?', lead: 'Leverage scales both the edge (linearly) and the variance (quadratically) and adds financing costs. Past the growth-optimal level, each extra turn of leverage lowers compound growth and raises the risk of a forced sale.' },
  estimation: { title: 'Why size below the estimated Kelly?', lead: 'Your Kelly fraction is computed from an estimated edge. If the estimate is noisy, sizing to it overbets half the time — and overbetting costs more than underbetting saves. Shrinking toward zero is optimal.' },
  tail: { title: 'How can a high-Sharpe trade be dangerous?', lead: 'A strategy that wins small 95% of the time can show a superb Sharpe ratio for years — while carrying a rare loss large enough to wipe out all those gains. Sharpe ignores skew and tails.' },
  luck: { title: 'Was it skill or luck?', lead: 'With a 55% edge, losing streaks are normal. Over a handful of bets, outcomes say very little about decision quality — judge the decision by the information you had.' },
  diversification: { title: 'Why does diversification let you carry more risk?', lead: 'Independent edges add linearly while their risks add in quadrature. The same total risk budget can therefore hold far more edge when the bets are uncorrelated.' },
  logVsMean: { title: 'Why is expected wealth misleading?', lead: 'The average outcome is pulled up by a few lucky paths. The typical (median) investor experiences the expected log growth, which can be negative even when expected wealth grows.' },
  sharpeAlloc: { title: 'Why not give the most capital to the best Sharpe?', lead: 'What matters is what a strategy adds to the portfolio. A lower-Sharpe strategy uncorrelated with the rest can deserve more capital than a high-Sharpe one that duplicates existing risk.' },
  fixedVsPct: { title: 'Fixed dollars or fixed fraction?', lead: 'Betting a fixed dollar amount ignores your current wealth: after losses the bet becomes a larger share of a smaller book. Fixed-fraction betting compounds and can never fully ruin you.' },
  repeated: { title: 'What does 55% actually mean?', lead: 'A 55% edge does not mean 55 wins in 100. The number of wins is a random variable with a wide spread, and there is a meaningful chance of finishing behind after many bets.' },
};

export interface Lesson {
  title: string;
  body: string;
  why?: WhyTopic;
}

export const LESSONS: Record<string, Lesson> = {
  forcedLiq: { title: 'Leverage turned a paper loss into a realised one', body: 'When haircuts rise and collateral falls, the prime broker sells for you — at the worst prices, at the worst time. A position that would have recovered is gone. Survivable leverage must be judged under stressed margins, not today\'s.', why: 'leverage' },
  derisk: { title: 'The drawdown limit bound', body: 'Risk limits exist because drawdowns compound: a 20% loss needs a 25% gain to recover, a 50% loss needs 100%. Being forced to cut at the low locks in losses — size so the limit is rarely tested.', why: 'volDrag' },
  overbetBeyondKelly: { title: 'More than twice past the growth optimum', body: 'Your book was sized well beyond the point where expected log growth peaks. Beyond about 2× Kelly, growth turns negative even though expected profit keeps rising: the typical outcome is ruin by attrition.', why: 'kelly' },
  aboveKelly: { title: 'Above full Kelly on your own estimates', body: 'Sizing above Kelly adds risk and subtracts growth. And these are estimated edges — the true edge is usually smaller than the quote, so the real optimum is lower still. Most professionals run ¼–½ Kelly.', why: 'estimation' },
  goodLoss: { title: 'A good decision that lost money', body: 'The trade had positive expected growth at the size you chose. Losing weeks are part of any edge. Changing a sound process because of one outcome is how good managers become bad ones.', why: 'luck' },
  luckyWin: { title: 'Profitable, but not a good decision', body: 'You made money, but the position size or selection was not justified by the information available. Repeated, this process destroys capital. Don\'t let a lucky outcome reinforce it.', why: 'kelly' },
  correlation: { title: 'Your diversification was smaller than it looked', body: 'More of your positions lost at the same time than independence would predict. They share a factor. Check the factor dashboard and the stressed correlation matrix before adding the next "uncorrelated" idea.', why: 'correlation' },
  tailHedgePaid: { title: 'The hedge earned its keep', body: 'A tail hedge loses a little most weeks. Its value is not its standalone return but what it does to the portfolio\'s worst outcomes — which lets you run the rest of the book at a higher, more productive size.', why: 'diversification' },
  hiddenTail: { title: 'The steamroller arrived', body: 'Carry and short-volatility trades collect small gains with high probability and give them back in rare, large losses. Their historical Sharpe overstates their safety. Size them by their tail, not their volatility.', why: 'tail' },
  regimeShift: { title: 'The regime changed', body: 'The desk\'s regime read moved. Correlations, volatilities and edges all depend on the regime, so estimates calibrated in the old regime may now be stale. Re-check exposures before adding risk.', why: 'correlation' },
  idleCash: { title: 'Standing aside had a cost', body: 'There were positive-growth opportunities on the menu. Holding cash is safe but is not free: compounding rewards consistently harvesting small, well-sized edges.', why: 'repeated' },
  tooTimid: { title: 'Right trades, too small to matter', body: 'Your positions were a small fraction of their growth-optimal size. Fractional Kelly is wise, but at under ~⅓ Kelly you give up most of the growth for little extra safety.', why: 'kelly' },
  diversification: { title: 'Diversification did real work', body: 'The sum of standalone risks was far larger than the portfolio\'s risk. That gap is the free lunch of diversification — it is what allows a multistrategy book to carry more total edge.', why: 'diversification' },
  limits: { title: 'Risk limits were breached', body: 'Concentration and factor limits exist because estimated correlations fail in stress. A book that leans heavily on one factor or one position is a single bet, whatever its line count.', why: 'correlation' },
  leverage: { title: 'Leverage amplified the loss', body: 'Gross leverage above 4× turns ordinary weekly moves into meaningful NAV losses. Net-zero market exposure does not make a levered book safe: spreads, basis and crowding all move.', why: 'leverage' },
  volDrag: { title: 'Mind the drag', body: 'Every unit of variance you carry costs about half of itself in compound growth. A position earns its place only if its marginal edge exceeds its marginal drag.', why: 'volDrag' },
  cashOption: { title: 'Cash is a position', body: 'With nothing compelling on offer, holding cash keeps your capital — and your option to act later — intact.', why: 'kelly' },
};
