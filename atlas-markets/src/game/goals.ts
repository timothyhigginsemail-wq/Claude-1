// The day's scorecard: what the desk has to make to cover its costs and the capital charge.

import { accrualDays } from '../engine/calendar';
import type { GameState } from '../engine/types';
import { allocated, dailyCosts, HURDLE } from './manage';

export function dailyTarget(s: GameState): { breakEven: number; costs: number; capital: number; strong: number } {
  const days = accrualDays(s.date);
  const costs = dailyCosts(s, days).total;
  const capital = (HURDLE * allocated(s) * days) / 365;
  const breakEven = costs + capital;
  return { breakEven, costs, capital, strong: breakEven * 2 };
}
