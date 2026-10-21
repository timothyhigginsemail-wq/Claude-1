import type { RoundRecord } from '../../engine/allocator';

/**
 * Decompose a round's return into the base (every PM at equal risk), your
 * selection, your sizing and your stops, using the counterfactual books.
 */
export function attribute(r: RoundRecord) {
  const ret = (x: { before: number; after: number }) => x.after / x.before - 1;
  const you = r.navAfter / r.navBefore - 1;
  const noStops = ret(r.shadows.noStops);
  const eq = ret(r.shadows.equalRisk);
  const all = ret(r.shadows.allEqual);
  return { you, base: all, selection: eq - all, sizing: noStops - eq, stops: you - noStops };
}

export function cumulative(rounds: RoundRecord[]) {
  let base = 0, selection = 0, sizing = 0, stops = 0;
  for (const r of rounds) {
    const a = attribute(r);
    base += Math.log1p(a.base);
    selection += Math.log1p(a.base + a.selection) - Math.log1p(a.base);
    sizing += Math.log1p(a.base + a.selection + a.sizing) - Math.log1p(a.base + a.selection);
    stops += Math.log1p(a.you) - Math.log1p(a.base + a.selection + a.sizing);
  }
  return { base, selection, sizing, stops, total: base + selection + sizing + stops };
}
