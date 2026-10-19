// East River shoreline as a function of time.
// Each keyframe lists control points [v, u]: the shore lies at grid-east
// coordinate u for uptown coordinate v. Between keyframes the shore is
// interpolated linearly, so landfill advances continuously as the slider moves.
// The natural shore and its Kips Bay inlet follow Viele (1865) / Mannahatta;
// the fill stages are schematic reconstructions from Perris and Bromley.

export const SHORE_KEYFRAMES = [
  {
    year: 1750,
    label: 'Natural shoreline (Kips Bay inlet and rocky upland shore)',
    pts: [[-320, -120], [-260, -175], [-215, -170], [-180, -140], [-150, -95], [-115, -40], [-80, 0], [-40, 18], [20, 26], [90, 38], [160, 44], [240, 50], [330, 58]],
  },
  { year: 1800, label: 'Natural shoreline', pts: null }, // same as 1750
  {
    year: 1845,
    label: 'Early cribbing and fill; Kips Bay inlet partly filled',
    pts: [[-320, -40], [-240, -60], [-170, -30], [-120, 15], [-60, 45], [0, 60], [100, 70], [200, 74], [330, 78]],
  },
  {
    year: 1870,
    label: 'Bulkhead line established; grid extended to the river',
    pts: [[-320, 140], [-160, 145], [0, 150], [160, 150], [330, 150]],
  },
  {
    year: 1902,
    label: 'Industrial waterfront fully built to the pierhead line',
    pts: [[-320, 192], [0, 196], [330, 196]],
  },
  {
    year: 1940,
    label: 'Industrial waterfront',
    pts: null,
  },
  {
    year: 1945,
    label: 'FDR (East River) Drive built on new fill along the bulkhead',
    pts: [[-320, 240], [0, 240], [330, 240]],
  },
  { year: 2026, label: 'FDR Drive and esplanade', pts: null },
];

// Resolve nulls to the previous keyframe's points.
for (let i = 0; i < SHORE_KEYFRAMES.length; i++) {
  if (!SHORE_KEYFRAMES[i].pts) SHORE_KEYFRAMES[i].pts = SHORE_KEYFRAMES[i - 1].pts;
}

export const V_MIN = -320, V_MAX = 330, U_WEST = -420;
const SAMPLES = 66;

function sample(pts, v) {
  if (v <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (v <= pts[i][0]) {
      const [v0, u0] = pts[i - 1], [v1, u1] = pts[i];
      return u0 + ((v - v0) / (v1 - v0)) * (u1 - u0);
    }
  }
  return pts[pts.length - 1][1];
}

export function shoreU(v, year) {
  const k = SHORE_KEYFRAMES;
  if (year <= k[0].year) return sample(k[0].pts, v);
  for (let i = 1; i < k.length; i++) {
    if (year <= k[i].year) {
      const t = (year - k[i - 1].year) / (k[i].year - k[i - 1].year);
      return sample(k[i - 1].pts, v) * (1 - t) + sample(k[i].pts, v) * t;
    }
  }
  return sample(k[k.length - 1].pts, v);
}

export function shoreLabel(year) {
  let lab = SHORE_KEYFRAMES[0].label;
  for (const k of SHORE_KEYFRAMES) if (year >= k.year) lab = k.label;
  return lab;
}

// Land polygon (grid metres, counter-clockwise) for a year.
export function landPolygon(year) {
  const poly = [[U_WEST, V_MIN]];
  for (let i = 0; i <= SAMPLES; i++) {
    const v = V_MIN + ((V_MAX - V_MIN) * i) / SAMPLES;
    poly.push([shoreU(v, year), v]);
  }
  poly.push([U_WEST, V_MAX]);
  return poly;
}

// Fraction of a polygon's vertices+centre that are on land (cheap test used by the generator).
export function onLand(u, v, year, margin = 0) {
  return u < shoreU(v, year) - margin;
}
