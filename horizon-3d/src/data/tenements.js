// Procedural "inferred" layer: the 19th-century lot pattern.
//
// The Commissioners' grid was sold off in 25 × 100 ft lots, and between the
// 1850s and 1890s nearly every lot west of the industrial waterfront got a
// 4–6 storey rowhouse or tenement. Rather than invent hundreds of individual
// histories, this module generates that pattern deterministically and derives
// each lot's demolition from the documented features that later cleared it
// (tunnel, park, airline terminal, power plants, towers…). Every generated lot
// is flagged confidence: 'inferred'.

import { FEATURES } from './features.js';
import { blockV, WEST_BLOCK_U, EAST_OF_FIRST_U, LOT_WIDTH, LOT_DEPTH, rect, area, clip } from '../geo.js';
import { shoreU } from './shoreline.js';
import { IMPORTED, HAS_IMPORT } from './imported.js';

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BRICK = ['#8f5b48', '#9c6a52', '#7f5143', '#a87760', '#8a6450', '#6f4b3e', '#b08a6a', '#94705d'];

// Feature occupancy intervals that can block / clear lots.
function occupancies() {
  const out = [];
  for (const f of [...FEATURES.filter((g) => !(HAS_IMPORT && g.modern)), ...IMPORTED]) {
    if (f.clears === false || !f.parts) continue;
    const start = f.clearYear ?? f.built - 2;
    const end = f.demolished ?? Infinity;
    for (const p of f.parts) if (!p.base) out.push({ f, poly: p.poly, start, end });
  }
  return out;
}

function overlapsLot(lot, poly) {
  const c = clip(poly, lot); // lot rectangles are convex
  return c.length >= 3 && area(c) > 4; // any real overlap (> 4 m²) means the lot was taken
}

export function generateLots() {
  const R = rng(1811);
  const occ = occupancies();
  const lots = [];
  const [W0, W1] = WEST_BLOCK_U;
  const E0 = EAST_OF_FIRST_U;

  // front: which edge of the lot faces the street ('u0' | 'u1' | 'v0' | 'v1');
  // the building covers 65–90 % of the lot depth, leaving a rear yard.
  const push = (id, lot, front, frontage, blockName, eraFrom, eraTo, floorsMin, floorsMax) => {
    const k = 0.65 + R() * 0.25;
    const [[a0, b0], , [a1, b1]] = lot;
    const d = (front[0] === 'u' ? a1 - a0 : b1 - b0) * k;
    const poly = front === 'u0' ? rect(a0, a0 + d, b0, b1) : front === 'u1' ? rect(a1 - d, a1, b0, b1)
      : front === 'v0' ? rect(a0, a1, b0, b0 + d) : rect(a0, a1, b1 - d, b1);
    let built = Math.round(eraFrom + R() * (eraTo - eraFrom));
    const floors = floorsMin + Math.floor(R() * (floorsMax - floorsMin + 1));
    const color = BRICK[Math.floor(R() * BRICK.length)];
    const eastEdge = Math.max(...poly.map((p) => p[0]));
    const midV = poly.reduce((s, p) => s + p[1], 0) / poly.length;
    // wait for landfill
    while (built < 1900 && eastEdge > shoreU(midV, built) - 6) built += 1;

    const hits = occ.filter((o) => overlapsLot(lot, o.poly));
    // an imported present-day footprint that is about as old as the lot *is* that building
    if (hits.some((o) => o.f.imported && o.f.built <= built + 5)) return;
    // if a feature occupies the lot when it would be built, postpone until it is gone
    for (let guard = 0; guard < 4; guard++) {
      const blocker = hits.find((o) => built >= o.start && built < o.end);
      if (!blocker) break;
      built = blocker.end + 2;
    }
    if (!Number.isFinite(built) || built > 1930) return;
    const later = hits.filter((o) => o.start > built).sort((a, b) => a.start - b.start)[0];
    lots.push({
      id,
      name: frontage.includes('Avenue') ? `Tenement, ${frontage}` : `Rowhouse / tenement, ${frontage}`,
      address: `${frontage} (${blockName})`,
      kind: 'lot-building',
      use: frontage.includes('Avenue') ? 'Tenement with ground-floor shops' : 'Tenement / rowhouse dwelling',
      built,
      demolished: later ? later.start : null,
      demolishedBy: later ? later.f : null,
      builtLabel: `c. ${built}`,
      parts: [{ poly, height: floors * 3.4 + 1.2, shape: 'prism' }],
      floors,
      color,
      confidence: 'inferred',
      notes: [
        `Typical ${floors}-storey building on a 25 × 100 ft lot, generated from the period lot pattern rather than individually researched.`,
        later
          ? `Cleared c. ${later.start} for ${later.f.name}.`
          : 'Not displaced by any documented project in this dataset, so it is shown standing to the present — many Second Avenue tenements do survive.',
      ],
      sources: ['perris', 'bromley', 'sanborn', 'taxphotos1940'],
      photoSearch: frontage,
      generated: true,
    });
  };

  const ord = (n) => `${n}th`;
  for (const s of [35, 36, 37, 38, 39]) {
    const [v0, v1] = blockV(s);
    const blockName = `E ${ord(s)}–${ord(s + 1)} Sts`;
    // Second Avenue frontage (east side) — the earliest built-up edge
    for (let v = v0, i = 0; v + LOT_WIDTH <= v1 + 0.01; v += LOT_WIDTH, i++)
      push(`lot-${s}-2av-${i}`, rect(W0, W0 + LOT_DEPTH, v, v + LOT_WIDTH), 'u0', 'Second Avenue', blockName, 1850, 1872, 4, 6);
    // First Avenue frontage (west side)
    for (let v = v0, i = 0; v + LOT_WIDTH <= v1 + 0.01; v += LOT_WIDTH, i++)
      push(`lot-${s}-1avw-${i}`, rect(W1 - LOT_DEPTH, W1, v, v + LOT_WIDTH), 'u1', 'First Avenue', blockName, 1855, 1880, 4, 6);
    // Side-street frontages, both sides
    for (let u = W0 + LOT_DEPTH, i = 0; u + LOT_WIDTH <= W1 - LOT_DEPTH + 0.01; u += LOT_WIDTH, i++) {
      push(`lot-${s}-s-${i}`, rect(u, u + LOT_WIDTH, v0, v0 + LOT_DEPTH), 'v0', `East ${ord(s)} Street, north side`, blockName, 1856, 1895, 3, 5);
      push(`lot-${s}-n-${i}`, rect(u, u + LOT_WIDTH, v1 - LOT_DEPTH, v1), 'v1', `East ${ord(s + 1)} Street, south side`, blockName, 1856, 1895, 3, 5);
    }
    // East of First Avenue: avenue frontage and the first lots along the streets
    for (let v = v0, i = 0; v + LOT_WIDTH <= v1 + 0.01; v += LOT_WIDTH, i++)
      push(`lot-${s}-1ave-${i}`, rect(E0, E0 + LOT_DEPTH, v, v + LOT_WIDTH), 'u0', 'First Avenue', `${blockName}, east of First Ave`, 1858, 1885, 4, 5);
    for (let u = E0 + LOT_DEPTH, i = 0; u + LOT_WIDTH <= E0 + 150; u += LOT_WIDTH, i++) {
      push(`lot-${s}-es-${i}`, rect(u, u + LOT_WIDTH, v0, v0 + LOT_DEPTH), 'v0', `East ${ord(s)} Street, north side`, `${blockName}, east of First Ave`, 1862, 1892, 3, 5);
      push(`lot-${s}-en-${i}`, rect(u, u + LOT_WIDTH, v1 - LOT_DEPTH, v1), 'v1', `East ${ord(s + 1)} Street, south side`, `${blockName}, east of First Ave`, 1862, 1892, 3, 5);
    }
  }
  return lots;
}

export const LOTS = generateLots();
