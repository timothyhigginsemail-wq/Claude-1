// Footprint tracing: what occupied a given footprint in every year 1750–2026.

import { area, clip, convexHull } from './geo.js';
import { landPolygon } from './data/shoreline.js';

export const YEAR_MIN = 1750;
export const YEAR_MAX = 2026;

export const exists = (f, y) => y >= f.built && (f.demolished == null || y < f.demolished);

export function footprintHull(feature) {
  return convexHull(feature.parts.filter((p) => !p.base).flatMap((p) => p.poly));
}

function share(feature, hull, hullArea) {
  let best = 0;
  let sum = 0;
  for (const p of feature.parts) {
    if (p.base) continue;
    const c = clip(p.poly, hull);
    if (c.length >= 3) {
      const a = area(c);
      sum += a;
      best = Math.max(best, a);
    }
  }
  return Math.min(1, sum / hullArea);
}

export function traceFootprint(hull, features, { selfId = null, step = 1 } = {}) {
  const hullArea = area(hull);
  const overlapping = features
    .filter((f) => f.parts && f.kind !== 'infrastructure' && f.kind !== 'pier')
    .map((f) => ({ f, s: share(f, hull, hullArea) }))
    .filter((x) => x.s > 0.03);

  const rows = [];
  for (let y = YEAR_MIN; y <= YEAR_MAX; y += step) {
    const land = clip(landPolygon(y + 0.5), hull);
    const landShare = land.length >= 3 ? Math.min(1, area(land) / hullArea) : 0;
    const w = 1 - landShare;
    const water = w >= 0.85 ? 100 : w < 0.15 ? 0 : Math.round(w * 4) * 25; // coarse buckets keep the chronology readable
    const present = overlapping.filter((x) => exists(x.f, y + 0.5));
    const named = present.filter((x) => !x.f.generated).sort((a, b) => b.s - a.s);
    const lots = present.filter((x) => x.f.generated);
    const underway = overlapping.filter((x) => !x.f.generated && y + 0.5 >= x.f.built - 2 && y + 0.5 < x.f.built);
    const sig = `${water}|${named.map((x) => x.f.id).join(',')}|${lots.length ? 1 : 0}|${underway.map((x) => x.f.id).join(',')}`;
    const last = rows[rows.length - 1];
    if (last && last.sig === sig) {
      last.to = y;
      last.lots = Math.max(last.lots, lots.length);
      continue;
    }
    rows.push({
      sig,
      from: y,
      to: y,
      water,
      features: named.map((x) => ({ id: x.f.id, name: x.f.name, share: x.s, confidence: x.f.confidence, self: x.f.id === selfId })),
      lots: lots.length,
      underway: underway.map((x) => x.f.name),
      lotShare: lots.reduce((s, x) => s + x.s, 0),
    });
  }
  return rows;
}

export function describeRow(r) {
  const parts = [];
  if (r.water === 100) parts.push('East River (open water)');
  else if (r.water > 0) parts.push(`Shoreline being filled — roughly ${r.water}% still under water`);
  for (const f of r.features) parts.push(`${f.self ? '★ ' : ''}${f.name} (${Math.round(f.share * 100)}% of footprint)`);
  for (const n of r.underway || []) parts.push(`Construction site — ${n}`);
  if (r.lots) parts.push(`Inferred tenements / rowhouses (up to ${r.lots} lot${r.lots > 1 ? 's' : ''})`);
  if (!parts.length) parts.push('Open land — farm, new fill or vacant lots');
  return parts;
}
