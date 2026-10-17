import { useState } from 'react';
import type { GameState } from '../../engine/game';
import { COACH_L1, type WhyTopic } from '../content';
import type { Prefs } from '../storage';

const COACH_L2: Record<number, { title: string; body: string }> = {
  1: { title: 'Level 2: a portfolio of correlated bets', body: 'Several trades at once, held for multiple turns. Each one loads on hidden factors — use the Factors and Correlation tabs to see how a new trade changes the whole book, and switch the growth chart to "with current book". Leverage is allowed, but margins rise in stress and the prime broker will sell for you.' },
  9: { title: 'Ten new strategies', body: 'The desk has ten new ideas this turn: different asset classes, different stories, low reported correlations. Before you fill the book with them, ask what they might have in common. Risk research reveals measured loadings.' },
};
const COACH_L3: Record<number, { title: string; body: string }> = {
  1: { title: 'Level 3: you are the CIO', body: 'Seven pods want capital. Each shows a real track record — but some were selected because they looked good, and Sharpe ratios hide tails. Allocate risk across pods, watch shared exposures, and use futures and tail hedges at the portfolio level.' },
};

export function Coach({ state, onWhy }: { state: GameState; prefs: Prefs; onDismiss: () => void; onWhy: (t: WhyTopic) => void }) {
  const [hidden, setHidden] = useState<number | null>(null);
  const table = state.config.level === 1 ? COACH_L1 : state.config.level === 2 ? COACH_L2 : COACH_L3;
  const step = table[state.turn];
  if (!step || hidden === state.turn) return null;
  return (
    <div className="panel p-3 fade-up" style={{ borderColor: 'var(--accent)', background: 'var(--accent-soft)' }}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="label" style={{ color: 'var(--accent)' }}>Coach</div>
          <div className="font-semibold text-[13.5px] mt-0.5">{step.title}</div>
          <p className="text-[12.5px] text-ink2 mt-1 leading-relaxed">{step.body}</p>
          {state.config.level === 1 && state.turn === 1 && (
            <button className="btn text-[11.5px] mt-2" onClick={() => onWhy('kelly')}>Show me why size matters →</button>
          )}
        </div>
        <button className="btn btn-ghost text-[11px]" onClick={() => setHidden(state.turn)} aria-label="Dismiss">✕</button>
      </div>
    </div>
  );
}
