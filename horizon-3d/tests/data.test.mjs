import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gridToLatLon, latLonToGrid, area, clip } from '../src/geo.js';
import { FEATURES, HORIZON_ID, ERAS } from '../src/data/features.js';
import { LOTS } from '../src/data/tenements.js';
import { ALL_FEATURES } from '../src/data/index.js';
import { SOURCES, CONFIDENCE } from '../src/data/sources.js';
import { landPolygon, shoreU } from '../src/data/shoreline.js';
import { traceFootprint, footprintHull, exists } from '../src/trace.js';
import { convert } from '../scripts/import-footprints.mjs';

test('grid ↔ lat/lon round-trips and the grid is rotated 29°', () => {
  const { lat, lon } = gridToLatLon(123, -45);
  const { u, v } = latLonToGrid(lat, lon);
  assert.ok(Math.abs(u - 123) < 1e-6 && Math.abs(v + 45) < 1e-6);
  // walking 1 km "uptown" on the grid moves north-north-east
  const p = gridToLatLon(0, 1000);
  const o = gridToLatLon(0, 0);
  const north = (p.lat - o.lat) * 111132;
  const east = (p.lon - o.lon) * 111320 * Math.cos((o.lat * Math.PI) / 180);
  assert.ok(Math.abs((Math.atan2(east, north) * 180) / Math.PI - 29) < 0.01);
});

test('every feature is well-formed and cites known sources', () => {
  const ids = new Set();
  for (const f of ALL_FEATURES) {
    assert.ok(!ids.has(f.id), `duplicate id ${f.id}`);
    ids.add(f.id);
    assert.ok(CONFIDENCE[f.confidence], `${f.id}: confidence`);
    assert.ok(f.sources.length && f.sources.every((s) => SOURCES[s]), `${f.id}: sources`);
    assert.ok(f.demolished == null || f.demolished > f.built, `${f.id}: dates`);
    if (f.kind !== 'pier') for (const p of f.parts) assert.ok(p.poly.length >= 3 && p.height > 0, `${f.id}: part`);
  }
});

test('eras tile the whole timeline', () => {
  for (let y = 1750; y <= 2026; y++) assert.ok(ERAS.some((e) => y >= e.from && y < e.to), `no era for ${y}`);
});

test('shoreline only moves east (landfill never retreats)', () => {
  for (let v = -300; v <= 300; v += 25)
    for (let y = 1750; y < 2026; y += 5) assert.ok(shoreU(v, y + 5) >= shoreU(v, y) - 1e-9, `v=${v} y=${y}`);
});

test('documented/approximate buildings stand on land when built', () => {
  for (const f of FEATURES) {
    if (!f.parts || f.kind === 'infrastructure') continue;
    for (const p of f.parts) {
      if (p.base) continue;
      const a = area(p.poly);
      const onLand = clip(landPolygon(f.built), p.poly);
      assert.ok(area(onLand) / a > 0.95, `${f.id} is in the river in ${f.built}`);
    }
  }
});

test('no two buildings occupy the same ground at the same time', () => {
  const ground = (f) => (f.parts || []).filter((p) => !p.base && p.height > 1);
  const bs = ALL_FEATURES.filter((f) => f.kind !== 'infrastructure' && f.kind !== 'pier' && ground(f).length);
  const clashes = [];
  for (let i = 0; i < bs.length; i++)
    for (let j = i + 1; j < bs.length; j++) {
      const a = bs[i], b = bs[j];
      const lo = Math.max(a.built, b.built), hi = Math.min(a.demolished ?? 3000, b.demolished ?? 3000);
      if (lo >= hi) continue;
      for (const pa of ground(a))
        for (const pb of ground(b)) {
          const c = clip(pa.poly, pb.poly);
          if (c.length >= 3 && area(c) > 4) clashes.push(`${a.id} × ${b.id} (${lo}–${hi})`);
        }
    }
  assert.deepEqual([...new Set(clashes)], []);
});

test('The Horizon footprint traces water → fill → lots → brewery → gap → The Horizon', () => {
  const h = FEATURES.find((f) => f.id === HORIZON_ID);
  const rows = traceFootprint(footprintHull(h), ALL_FEATURES, { selfId: HORIZON_ID });
  assert.equal(rows[0].from, 1750);
  assert.equal(rows[0].water, 100);
  const order = rows.flatMap((r) => r.features.map((f) => f.id)).filter((id, i, a) => a.indexOf(id) === i);
  assert.deepEqual(order, ['kips-bay-brewery', 'horizon-gap', HORIZON_ID]);
  assert.ok(rows.some((r) => r.lots > 0 && r.from < 1888));
  assert.equal(rows.at(-1).to, 2026);
  assert.ok(rows.at(-1).features[0].self);
});

test('generated lots are cleared by the project that replaced them', () => {
  const gone = LOTS.filter((l) => l.demolishedBy);
  assert.ok(gone.length > 100);
  for (const l of gone) assert.equal(l.demolished, l.demolishedBy.clearYear ?? l.demolishedBy.built - 2);
  const park = FEATURES.find((f) => f.id === 'st-gabriels-park');
  assert.ok(LOTS.some((l) => l.demolishedBy === park && exists(l, 1900) && !exists(l, 1906)));
});

test('import-footprints converts NYC GeoJSON into grid metres inside the extent', () => {
  const ring = [[0, 0], [20, 0], [20, 30], [0, 30], [0, 0]].map(([u, v]) => { const { lat, lon } = gridToLatLon(u + 40, v + 15); return [lon, lat]; });
  const far = gridToLatLon(5000, 5000);
  const rows = convert({
    type: 'FeatureCollection',
    features: [
      { properties: { doitt_id: 7, cnstrct_yr: '1989', heightroof: '390' }, geometry: { type: 'Polygon', coordinates: [ring] } },
      { properties: { doitt_id: 8 }, geometry: { type: 'Polygon', coordinates: [[[far.lon, far.lat], [far.lon + 1e-4, far.lat], [far.lon, far.lat + 1e-4], [far.lon, far.lat]]] } },
    ],
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].built, 1989);
  assert.ok(Math.abs(rows[0].height - 118.9) < 0.1);
  assert.equal(rows[0].polys[0].length, 4);
  assert.ok(Math.abs(rows[0].polys[0][0][0] - 40) < 0.01 && Math.abs(rows[0].polys[0][0][1] - 15) < 0.01);
});
