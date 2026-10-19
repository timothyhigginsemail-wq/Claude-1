// The 3D world: terrain, water, streets, buildings and markers, all driven by
// a single applyYear(year) call so the same scene can be re-posed for any year
// (or several years in a split view) without rebuilding geometry.

import * as THREE from 'three';
import { EVENTS, STREETS } from './data/features.js';
import { ALL_FEATURES } from './data/index.js';
import { landPolygon, shoreU, V_MIN, V_MAX, U_WEST } from './data/shoreline.js';
import { centroid, AVE, streetV } from './geo.js';
import { exists } from './trace.js';

export { ALL_FEATURES };

const BUILD_YEARS = 1.5; // construction animation length
const DEMO_YEARS = 0.6;

const toV3 = (u, v, y = 0) => new THREE.Vector3(u, y, -v);

function shapeFromPoly(poly) {
  const s = new THREE.Shape();
  poly.forEach(([u, v], i) => (i ? s.lineTo(u, v) : s.moveTo(u, v)));
  s.closePath();
  return s;
}

function prismGeometry(poly, base, height) {
  const g = new THREE.ExtrudeGeometry(shapeFromPoly(poly), { depth: height, bevelEnabled: false });
  g.rotateX(-Math.PI / 2);
  g.translate(0, base, 0);
  return g;
}

function bounds(poly) {
  const us = poly.map((p) => p[0]), vs = poly.map((p) => p[1]);
  return { u0: Math.min(...us), u1: Math.max(...us), v0: Math.min(...vs), v1: Math.max(...vs) };
}

function gableGeometries(poly, base, height) {
  const { u0, u1, v0, v1 } = bounds(poly);
  const wall = height * 0.68;
  const roofH = height - wall;
  const walls = prismGeometry(poly, base, wall);
  // triangular prism roof along the longer axis
  const alongU = u1 - u0 >= v1 - v0;
  const w = alongU ? v1 - v0 : u1 - u0;
  const tri = new THREE.Shape();
  tri.moveTo(-w / 2, 0); tri.lineTo(w / 2, 0); tri.lineTo(0, roofH); tri.closePath();
  const roof = new THREE.ExtrudeGeometry(tri, { depth: alongU ? u1 - u0 : v1 - v0, bevelEnabled: false });
  if (alongU) {
    // profile in (v, y), extrude along u
    roof.rotateY(Math.PI / 2); // extrusion z → +x
    roof.translate(u0, base + wall, -(v0 + v1) / 2);
  } else {
    roof.translate((u0 + u1) / 2, base + wall, -v1);
  }
  return [walls, roof];
}

function partGeometries(part) {
  const base = part.base || 0;
  const h = part.height;
  const shape = part.shape || 'prism';
  if (shape === 'gable') return gableGeometries(part.poly, base, h);
  if (shape === 'cylinder' || shape === 'dome' || (shape === 'spire' && part.poly.length > 6)) {
    const [cu, cv] = centroid(part.poly);
    const r = Math.hypot(part.poly[0][0] - cu, part.poly[0][1] - cv);
    let g;
    if (shape === 'cylinder') g = new THREE.CylinderGeometry(r, r, h, Math.max(12, part.poly.length));
    else if (shape === 'dome') g = new THREE.SphereGeometry(r, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    else g = new THREE.ConeGeometry(r, h, 24);
    g.translate(cu, base + (shape === 'dome' ? 0 : h / 2), -cv);
    return [g];
  }
  if (shape === 'spire') {
    const { u0, u1, v0, v1 } = bounds(part.poly);
    const g = new THREE.ConeGeometry(Math.hypot(u1 - u0, v1 - v0) / 2, h, 4);
    g.rotateY(Math.PI / 4);
    g.translate((u0 + u1) / 2, base + h / 2, -(v0 + v1) / 2);
    return [g];
  }
  return [prismGeometry(part.poly, base, h)];
}

// ───────────────────────────── labels ─────────────────────────────

function textCanvas(text, { font = '600 30px Inter, system-ui, sans-serif', color = '#fff', bg = 'rgba(18,22,30,0.82)', pad = 14 } = {}) {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width) + pad * 2;
  const h = 46;
  c.width = w; c.height = h;
  ctx.font = font;
  if (bg) {
    ctx.fillStyle = bg;
    const r = 10;
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, r);
    ctx.fill();
  }
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, pad, h / 2 + 1);
  return c;
}

function makeSprite(text, opts) {
  const c = textCanvas(text, opts);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, sizeAttenuation: false });
  const s = new THREE.Sprite(mat);
  const k = 0.00036;
  s.scale.set(c.width * k, c.height * k, 1);
  s.center.set(0.5, 0);
  s.renderOrder = 10;
  return s;
}

function makeGroundText(text, size, color = 'rgba(255,255,255,0.78)') {
  const c = textCanvas(text, { font: '700 30px Inter, system-ui, sans-serif', color, bg: null, pad: 6 });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const aspect = c.width / c.height;
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(size * aspect, size),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })
  );
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 2;
  return m;
}

// ───────────────────────────── world ─────────────────────────────

export function createWorld(scene) {
  const world = {
    scene,
    features: new Map(), // id → { feature, group, meshes, label }
    pickables: [],
    showLabels: true,
    showInferred: true,
    showScope: true,
    showGrid: false,
    selectedId: null,
    trace: null,
  };

  // Materials shared by state
  const mats = {
    construction: new THREE.MeshStandardMaterial({ color: '#d9a441', transparent: true, opacity: 0.55, roughness: 0.9 }),
    ghost: new THREE.MeshStandardMaterial({ color: '#ff6a3d', transparent: true, opacity: 0.22, depthWrite: false, roughness: 1 }),
    ghostEdge: new THREE.LineBasicMaterial({ color: '#ff8a5c', transparent: true, opacity: 0.9 }),
    newer: new THREE.MeshStandardMaterial({ color: '#4fc3a1', roughness: 0.7, emissive: '#0d3b30', emissiveIntensity: 0.6 }),
    selected: new THREE.MeshStandardMaterial({ color: '#ffd166', roughness: 0.6, emissive: '#6b4b00', emissiveIntensity: 0.7 }),
  };
  world.mats = mats;
  const colorMats = new Map();
  const matFor = (hex, opts = {}) => {
    const key = hex + JSON.stringify(opts);
    if (!colorMats.has(key)) colorMats.set(key, new THREE.MeshStandardMaterial({ color: hex, roughness: 0.85, metalness: 0.02, ...opts }));
    return colorMats.get(key);
  };

  // ── water & ground
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(4000, 4000),
    new THREE.MeshStandardMaterial({ color: '#2f6378', roughness: 0.35, metalness: 0.15 })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = -0.8;
  water.receiveShadow = true;
  water.userData.ground = 'water';
  scene.add(water);
  world.water = water;

  const landMat = new THREE.MeshStandardMaterial({ color: '#6f8f55', roughness: 1 });
  const land = new THREE.Mesh(new THREE.BufferGeometry(), landMat);
  land.receiveShadow = true;
  land.userData.ground = 'land';
  scene.add(land);
  world.land = land;
  const landCache = new Map();
  const landGeo = (y) => {
    const key = Math.round(y * 2) / 2;
    if (!landCache.has(key)) {
      const g = new THREE.ExtrudeGeometry(shapeFromPoly(landPolygon(key)), { depth: 1.6, bevelEnabled: false });
      g.rotateX(-Math.PI / 2);
      g.translate(0, -1.6, 0);
      landCache.set(key, g);
    }
    return landCache.get(key);
  };

  // salt marsh fringe of the natural shore
  const marsh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ color: '#8c8a4e', roughness: 1, transparent: true, opacity: 0.9 }));
  marsh.position.y = 0.02;
  scene.add(marsh);
  const marshCache = new Map();
  const marshGeo = (y) => {
    const key = Math.round(y);
    if (!marshCache.has(key)) {
      const pts = [];
      for (let v = V_MIN; v <= -60; v += 10) pts.push([shoreU(v, key) - 2, v]);
      for (let v = -60; v >= V_MIN; v -= 10) pts.push([shoreU(v, key) - 2 - 30 * Math.min(1, (-60 - v) / 60 + 0.2), v]);
      const g = new THREE.ShapeGeometry(shapeFromPoly(pts));
      g.rotateX(-Math.PI / 2);
      marshCache.set(key, g);
    }
    return marshCache.get(key);
  };

  // ── streets
  const streetMat = new THREE.MeshStandardMaterial({ color: '#40444b', roughness: 0.95 });
  const dirtMat = new THREE.MeshStandardMaterial({ color: '#9b8466', roughness: 1 });
  const streetMeshes = [];
  for (const a of STREETS.avenues) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(a.width, 0.1, V_MAX - V_MIN), streetMat);
    m.position.set(a.u, 0.05, -(V_MIN + V_MAX) / 2);
    m.receiveShadow = true;
    scene.add(m);
    const lab = makeGroundText(a.name.toUpperCase(), 14);
    lab.rotation.z = Math.PI / 2;
    lab.position.set(a.u, 0.2, -streetV(37.5));
    scene.add(lab);
    streetMeshes.push({ kind: 'avenue', data: a, mesh: m, label: lab });
  }
  for (const s of STREETS.streets) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(1, 0.1, s.width), streetMat);
    m.receiveShadow = true;
    scene.add(m);
    const lab = makeGroundText(s.short.toUpperCase(), 11);
    lab.position.set(-115, 0.2, -s.v);
    scene.add(lab);
    streetMeshes.push({ kind: 'street', data: s, mesh: m, label: lab });
  }
  // colonial shore road (Kips Bay / Eastern Post Road branch, schematic)
  const lane = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([toV3(-420, 40, 0.06), toV3(-300, -40, 0.06), toV3(-230, -120, 0.06), toV3(-205, -165, 0.06)]), 40, 2.4, 4), dirtMat);
  lane.scale.y = 0.05;
  scene.add(lane);
  world.lane = lane;

  // ── 1811 grid overlay (future streets)
  const gridLines = new THREE.Group();
  const gridMat = new THREE.LineDashedMaterial({ color: '#ffe8a3', dashSize: 6, gapSize: 4, transparent: true, opacity: 0.7 });
  const addLine = (pts) => {
    const g = new THREE.BufferGeometry().setFromPoints(pts);
    const l = new THREE.Line(g, gridMat);
    l.computeLineDistances();
    gridLines.add(l);
  };
  for (const a of STREETS.avenues) for (const d of [-a.width / 2, a.width / 2]) addLine([toV3(a.u + d, V_MIN, 0.4), toV3(a.u + d, V_MAX, 0.4)]);
  for (const s of STREETS.streets) for (const d of [-s.width / 2, s.width / 2]) addLine([toV3(U_WEST, s.v + d, 0.4), toV3(250, s.v + d, 0.4)]);
  gridLines.visible = false;
  scene.add(gridLines);
  world.gridLines = gridLines;

  // ── study-area outline
  const scopePts = [toV3(AVE.second, streetV(35), 0.6), toV3(250, streetV(35), 0.6), toV3(250, streetV(40), 0.6), toV3(AVE.second, streetV(40), 0.6), toV3(AVE.second, streetV(35), 0.6)];
  const scope = new THREE.Line(new THREE.BufferGeometry().setFromPoints(scopePts), new THREE.LineDashedMaterial({ color: '#7fd1ff', dashSize: 10, gapSize: 6 }));
  scope.computeLineDistances();
  scene.add(scope);
  world.scope = scope;

  // ── trees
  const trees = [];
  {
    let s = 42;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    // pre-urban woods and orchards on the 1750 land
    for (let i = 0; i < 520; i++) {
      const u = -410 + r() * 440, v = V_MIN + r() * (V_MAX - V_MIN);
      if (u > shoreU(v, 1750) - 8) continue;
      const nearKip = Math.hypot(u - (AVE.second + 14), v - streetV(35)) < 30;
      if (nearKip) continue;
      trees.push({ u, v, from: 1600, to: 1815 + r() * 50, s: 0.8 + r() * 0.7, c: r() < 0.3 ? '#55703c' : '#3f5f35' });
    }
    // St. Gabriel's / St. Vartan Park
    for (let i = 0; i < 26; i++) trees.push({ u: -205 + r() * 180, v: -146 + r() * 54, from: 1912 + r() * 6, to: 9999, s: 0.7 + r() * 0.4, c: '#4d7a3a' });
    // post-1970s street trees
    for (const n of [35, 36, 37, 38, 39]) for (let u = -200; u < 0; u += 14 + r() * 10) trees.push({ u, v: streetV(n) + (r() < 0.5 ? 1 : -1) * 8, from: 1975 + r() * 30, to: 9999, s: 0.45 + r() * 0.2, c: '#5a8a45' });
  }
  const treeGeo = new THREE.ConeGeometry(4, 12, 7);
  treeGeo.translate(0, 8, 0);
  const treeMesh = new THREE.InstancedMesh(treeGeo, new THREE.MeshStandardMaterial({ roughness: 1 }), trees.length);
  trees.forEach((t, i) => treeMesh.setColorAt(i, new THREE.Color(t.c)));
  treeMesh.castShadow = true;
  scene.add(treeMesh);
  const tmp = new THREE.Object3D();

  // ── features
  const addFeature = (f) => {
    const group = new THREE.Group();
    group.userData.featureId = f.id;
    const meshes = [];
    if (f.kind === 'pier') {
      const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1.4, f.pierWidth || 14), matFor(f.color));
      m.castShadow = m.receiveShadow = true;
      m.userData.featureId = f.id;
      group.add(m);
      meshes.push(m);
      f.parts = null;
    } else if (f.parts) {
      for (const p of f.parts) {
        if (p.shape === 'deck') {
          const { u0, u1, v0, v1 } = bounds(p.poly);
          const deck = new THREE.Mesh(new THREE.BoxGeometry(u1 - u0, p.height, v1 - v0), matFor(f.color));
          deck.position.set((u0 + u1) / 2, p.base + p.height / 2, -(v0 + v1) / 2);
          deck.castShadow = true;
          deck.userData.featureId = f.id;
          group.add(deck);
          meshes.push(deck);
          const n = Math.floor((v1 - v0) / 15);
          const cols = new THREE.InstancedMesh(new THREE.BoxGeometry(0.8, p.base, 0.8), matFor(f.color), n * 2);
          for (let i = 0; i < n; i++)
            for (let k = 0; k < 2; k++) {
              tmp.position.set(k ? u1 - 1 : u0 + 1, p.base / 2, -(v0 + i * 15));
              tmp.updateMatrix();
              cols.setMatrixAt(i * 2 + k, tmp.matrix);
            }
          cols.castShadow = true;
          cols.userData.featureId = f.id;
          group.add(cols);
          meshes.push(cols);
          continue;
        }
        for (const g of partGeometries(p)) {
          const m = new THREE.Mesh(g, matFor(f.color));
          m.castShadow = true;
          m.receiveShadow = true;
          m.userData.featureId = f.id;
          group.add(m);
          meshes.push(m);
        }
      }
    }
    for (const m of meshes) m.userData.baseMat = m.material;
    // ghost outlines (edges) for comparison mode
    const edges = new THREE.Group();
    for (const m of meshes) if (m.isMesh && !m.isInstancedMesh) edges.add(new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 30), mats.ghostEdge));
    edges.visible = false;
    group.add(edges);

    let label = null;
    if (f.label) {
      label = makeSprite(f.name);
      const top = Math.max(...f.parts.map((p) => (p.base || 0) + p.height));
      const [cu, cv] = centroid(f.parts[0].poly);
      label.position.set(cu, top + 4, -cv);
      scene.add(label);
    }
    scene.add(group);
    world.features.set(f.id, { feature: f, group, meshes, edges, label });
    world.pickables.push(...meshes);
  };
  for (const f of ALL_FEATURES) addFeature(f);

  // ── 1776 event: warships, flatboats and landing arrow
  const event = EVENTS[0];
  const fleet = new THREE.Group();
  const hullMat = matFor('#3b2a1e');
  const sailMat = matFor('#efe6d2', { side: THREE.DoubleSide });
  const ship = (u, v, rot, scale = 1) => {
    const g = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(38, 6, 10), hullMat);
    hull.position.y = 2;
    g.add(hull);
    for (const [x, h] of [[-11, 26], [2, 32], [13, 22]]) {
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, h, 6), hullMat);
      mast.position.set(x, 4 + h / 2, 0);
      g.add(mast);
      const sail = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), sailMat);
      sail.scale.set(0.1, h * 0.55, 9);
      sail.position.set(x + 0.8, 6 + h * 0.45, 0);
      sail.rotation.y = Math.PI / 2;
      sail.scale.set(9, h * 0.55, 1);
      g.add(sail);
    }
    g.traverse((o) => { o.castShadow = true; o.userData.eventId = event.id; });
    g.position.set(u, 0, -v);
    g.rotation.y = rot;
    g.scale.setScalar(scale);
    fleet.add(g);
  };
  [[40, -215], [90, -250], [10, -290], [150, -205], [120, -300]].forEach(([u, v], i) => ship(u, v, 0.15 * i - 0.2));
  for (let i = 0; i < 14; i++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(8, 1.2, 3), hullMat);
    b.position.set(-90 + (i % 7) * 18, 0.2, -(-232 - Math.floor(i / 7) * 26 - (i % 3) * 4));
    b.userData.eventId = event.id;
    fleet.add(b);
  }
  const arrowShape = new THREE.Shape();
  arrowShape.moveTo(0, -6); arrowShape.lineTo(90, -6); arrowShape.lineTo(90, -16); arrowShape.lineTo(118, 0);
  arrowShape.lineTo(90, 16); arrowShape.lineTo(90, 6); arrowShape.lineTo(0, 6); arrowShape.closePath();
  const arrow = new THREE.Mesh(new THREE.ShapeGeometry(arrowShape), new THREE.MeshBasicMaterial({ color: '#ff4d4d', transparent: true, opacity: 0.75, side: THREE.DoubleSide }));
  arrow.rotation.x = -Math.PI / 2;
  arrow.rotation.z = Math.PI + 0.25;
  arrow.position.set(60, 0.6, 235);
  arrow.userData.eventId = event.id;
  fleet.add(arrow);
  const fleetLabel = makeSprite('British landing · 15 Sept 1776', { bg: 'rgba(140,20,20,0.88)' });
  fleetLabel.position.set(-40, 30, 250);
  fleet.add(fleetLabel);
  scene.add(fleet);
  world.fleet = fleet;
  world.pickables.push(...fleet.children.filter((c) => c.isMesh));
  fleet.traverse((o) => { if (o.isMesh) world.pickables.push(o); });

  const kipsBayLabel = makeGroundText('KIPS BAY', 22, 'rgba(230,245,255,0.65)');
  kipsBayLabel.position.set(-110, 0.3, 270);
  scene.add(kipsBayLabel);
  const riverLabel = makeGroundText('EAST RIVER', 26, 'rgba(230,245,255,0.55)');
  riverLabel.rotation.z = Math.PI / 2;
  riverLabel.position.set(330, -0.5, -40);
  scene.add(riverLabel);

  // ── footprint trace prism
  const traceGroup = new THREE.Group();
  traceGroup.visible = false;
  scene.add(traceGroup);

  world.setTrace = (poly) => {
    traceGroup.clear();
    world.trace = poly;
    if (!poly) { traceGroup.visible = false; return; }
    const g = prismGeometry(poly, -1, 190);
    const prism = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: '#ffd166', transparent: true, opacity: 0.08, depthWrite: false, side: THREE.DoubleSide }));
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(g), new THREE.LineBasicMaterial({ color: '#ffd166', transparent: true, opacity: 0.85 }));
    const floor = new THREE.Mesh(new THREE.ShapeGeometry(shapeFromPoly(poly)), new THREE.MeshBasicMaterial({ color: '#ffd166', transparent: true, opacity: 0.35, depthWrite: false }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.7;
    floor.renderOrder = 3;
    traceGroup.add(prism, edges, floor);
    traceGroup.visible = true;
  };

  // ───────────────────────── per-year posing ─────────────────────────
  // compare: null | { year: otherYear, mode: 'ghost' }  (ghost shows what changed vs. other year)
  world.applyYear = (year, compare = null) => {
    // terrain
    land.geometry = landGeo(year);
    const urban = THREE.MathUtils.smoothstep(year, 1830, 1900);
    landMat.color.setRGB(0.44 + (0.47 - 0.44) * urban, 0.56 + (0.46 - 0.56) * urban, 0.33 + (0.43 - 0.33) * urban);
    marsh.visible = year < 1850;
    if (marsh.visible) marsh.geometry = marshGeo(year);
    lane.visible = year < 1860;

    // streets: opened streets run from the west edge to the current shoreline
    for (const s of streetMeshes) {
      const open = year >= s.data.opened;
      s.mesh.visible = open;
      s.label.visible = open && world.showLabels;
      if (s.kind === 'street' && open) {
        const end = Math.min(shoreU(s.data.v, year) - 1, 250);
        s.mesh.scale.x = end - U_WEST;
        s.mesh.position.set((end + U_WEST) / 2, 0.05, -s.data.v);
      }
    }
    gridLines.visible = world.showGrid || (year >= 1811 && year < 1852);
    gridLines.children.forEach((l) => (l.material.opacity = world.showGrid ? 0.8 : 0.45));
    scope.visible = world.showScope;

    // trees
    trees.forEach((t, i) => {
      const alive = year >= t.from && year < t.to;
      tmp.position.set(t.u, 0, -t.v);
      tmp.scale.setScalar(alive ? t.s * (year < t.from + 3 ? (year - t.from) / 3 : 1) : 0.0001);
      tmp.updateMatrix();
      treeMesh.setMatrixAt(i, tmp.matrix);
    });
    treeMesh.instanceMatrix.needsUpdate = true;

    // buildings
    for (const { feature: f, group, meshes, edges, label } of world.features.values()) {
      let state = 'hidden';
      let scale = 1;
      const hideInferred = f.generated && !world.showInferred;
      if (!hideInferred) {
        if (year >= f.built && (f.demolished == null || year < f.demolished - DEMO_YEARS)) state = 'normal';
        else if (year >= f.built - BUILD_YEARS && year < f.built) { state = 'construction'; scale = Math.max(0.03, (year - (f.built - BUILD_YEARS)) / BUILD_YEARS); }
        else if (f.demolished != null && year >= f.demolished - DEMO_YEARS && year < f.demolished) { state = 'demolition'; scale = Math.max(0.03, (f.demolished - year) / DEMO_YEARS); }
        if (state === 'hidden' && compare && exists(f, compare.year)) state = 'ghost';
        else if (state === 'normal' && compare && !exists(f, compare.year) && compare.year < year) state = 'new';
      }
      group.visible = state !== 'hidden';
      if (f.kind === 'pier' && group.visible) {
        const shore = shoreU(f.pierV, Math.max(year, f.built));
        const len = f.pierLength || 62;
        const m = meshes[0];
        m.scale.x = len;
        m.position.set(shore + len / 2 - 2, 0.2, -f.pierV);
      }
      group.scale.y = state === 'ghost' ? 1 : scale;
      edges.visible = state === 'ghost';
      const mat = f.id === world.selectedId ? mats.selected
        : state === 'construction' || state === 'demolition' ? mats.construction
        : state === 'ghost' ? mats.ghost
        : state === 'new' ? mats.newer : null;
      for (const m of meshes) m.material = mat || m.userData.baseMat;
      if (label) label.visible = world.showLabels && (state === 'normal' || state === 'new' || f.id === world.selectedId) && scale > 0.9;
    }

    // 1776
    const inWar = year >= event.from && year < event.to;
    fleet.visible = inWar;
    fleetLabel.visible = inWar && world.showLabels;
    kipsBayLabel.visible = world.showLabels && year < 1870;
    riverLabel.visible = world.showLabels;
  };

  world.featureAt = (obj) => {
    while (obj) {
      if (obj.userData?.featureId) return world.features.get(obj.userData.featureId)?.feature;
      if (obj.userData?.eventId) return { ...EVENTS.find((e) => e.id === obj.userData.eventId), kind: 'event' };
      obj = obj.parent;
    }
    return null;
  };

  return world;
}
