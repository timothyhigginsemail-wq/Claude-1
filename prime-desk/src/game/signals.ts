import type { Signals } from '../engine/types';

export function emptySignals(): Signals {
  return { htbWants: [], newMarginCalls: [], failedCalls: [], recalls: [], reprices: [], buyIns: [], liquidations: [] };
}
