// Georeferencing for the model.
//
// The model is built in "grid metres": a local planar frame aligned with the
// 1811 Commissioners' Plan street grid, whose "north" (uptown) runs ~29° east
// of true north. Origin = centreline intersection of First Avenue and East
// 37th Street.
//
//   u  metres toward the East River (grid-east, along the cross streets)
//   v  metres uptown               (grid-north, along the avenues)
//
// Three.js world: x = u, y = up, z = -v.

export const ORIGIN = { lat: 40.7459, lon: -73.9713, label: 'First Avenue & East 37th Street (centrelines)' };
export const GRID_ROTATION_DEG = 29; // Manhattan grid north, clockwise from true north

const FT = 0.3048;
export const STREET_SPACING = 260 * FT; // 200 ft block + 60 ft street
export const STREET_WIDTH = 60 * FT;
export const AVENUE_WIDTH = 100 * FT;
export const AVENUE_SPACING = 750 * FT; // 650 ft block + 100 ft avenue (1st–2nd Ave)
export const LOT_WIDTH = 25 * FT;
export const LOT_DEPTH = 100 * FT;

const M_PER_DEG_LAT = 111132;
const M_PER_DEG_LON = 111320 * Math.cos((ORIGIN.lat * Math.PI) / 180);
const th = (GRID_ROTATION_DEG * Math.PI) / 180;

export function gridToLatLon(u, v) {
  // unit vectors of the grid axes in (east, north) components
  const east = u * Math.cos(th) + v * Math.sin(th);
  const north = -u * Math.sin(th) + v * Math.cos(th);
  return { lat: ORIGIN.lat + north / M_PER_DEG_LAT, lon: ORIGIN.lon + east / M_PER_DEG_LON };
}

export function latLonToGrid(lat, lon) {
  const north = (lat - ORIGIN.lat) * M_PER_DEG_LAT;
  const east = (lon - ORIGIN.lon) * M_PER_DEG_LON;
  return { u: east * Math.cos(th) - north * Math.sin(th), v: east * Math.sin(th) + north * Math.cos(th) };
}

// Street & avenue centrelines in grid metres.
export const streetV = (n) => (n - 37) * STREET_SPACING;
export const AVE = { second: -AVENUE_SPACING, first: 0 };

// Block (between two streets) north/south property lines.
export function blockV(south) {
  return [streetV(south) + STREET_WIDTH / 2, streetV(south + 1) - STREET_WIDTH / 2];
}
// Property line limits in u for the block between Second and First Avenues.
export const WEST_BLOCK_U = [AVE.second + AVENUE_WIDTH / 2, AVE.first - AVENUE_WIDTH / 2];
export const EAST_OF_FIRST_U = AVE.first + AVENUE_WIDTH / 2;

export const rect = (u0, u1, v0, v1) => [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];

export function centroid(poly) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x0, y0] = poly[i];
    const [x1, y1] = poly[(i + 1) % poly.length];
    const f = x0 * y1 - x1 * y0;
    a += f; cx += (x0 + x1) * f; cy += (y0 + y1) * f;
  }
  if (Math.abs(a) < 1e-9) return poly[0];
  return [cx / (3 * a), cy / (3 * a)];
}

export function area(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x0, y0] = poly[i];
    const [x1, y1] = poly[(i + 1) % poly.length];
    a += x0 * y1 - x1 * y0;
  }
  return Math.abs(a) / 2;
}

// Sutherland–Hodgman: clip any simple polygon by a CONVEX clip polygon.
export function clip(subject, convexClip) {
  let out = subject.slice();
  const ccw = signedArea(convexClip) > 0;
  for (let i = 0; i < convexClip.length && out.length; i++) {
    const a = convexClip[i];
    const b = convexClip[(i + 1) % convexClip.length];
    const inside = (p) => {
      const c = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
      return ccw ? c >= 0 : c <= 0;
    };
    const inter = (p, q) => {
      const x1 = p[0], y1 = p[1], x2 = q[0], y2 = q[1];
      const x3 = a[0], y3 = a[1], x4 = b[0], y4 = b[1];
      const d = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
      if (Math.abs(d) < 1e-12) return p;
      const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / d;
      return [x1 + t * (x2 - x1), y1 + t * (y2 - y1)];
    };
    const input = out;
    out = [];
    for (let j = 0; j < input.length; j++) {
      const cur = input[j];
      const prev = input[(j + input.length - 1) % input.length];
      if (inside(cur)) {
        if (!inside(prev)) out.push(inter(prev, cur));
        out.push(cur);
      } else if (inside(prev)) out.push(inter(prev, cur));
    }
  }
  return out;
}

function signedArea(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x0, y0] = poly[i];
    const [x1, y1] = poly[(i + 1) % poly.length];
    a += x0 * y1 - x1 * y0;
  }
  return a / 2;
}

export function overlapFraction(subject, convexFootprint) {
  const a = area(convexFootprint);
  if (!a) return 0;
  const c = clip(subject, convexFootprint);
  return c.length < 3 ? 0 : area(c) / a;
}

export function convexHull(points) {
  const p = points.map((q) => [q[0], q[1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [], upper = [];
  for (const q of p) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q); }
  for (const q of p.slice().reverse()) { while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q); }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

export const fmtLatLon = ({ lat, lon }) => `${lat.toFixed(5)}°N, ${Math.abs(lon).toFixed(5)}°W`;
