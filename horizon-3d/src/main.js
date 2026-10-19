import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createWorld, ALL_FEATURES } from './world.js';
import { ERAS, TIMELINE_EVENTS, HORIZON_ID } from './data/features.js';
import { SOURCES, CONFIDENCE } from './data/sources.js';
import { shoreLabel } from './data/shoreline.js';
import { gridToLatLon, fmtLatLon, centroid, area, GRID_ROTATION_DEG } from './geo.js';
import { traceFootprint, footprintHull, describeRow, exists, YEAR_MIN, YEAR_MAX } from './trace.js';

// ───────────────────────────── renderer / scene ─────────────────────────────
const container = document.getElementById('viewport');
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#9fb7c9');
scene.fog = new THREE.Fog('#9fb7c9', 900, 2600);

const camera = new THREE.PerspectiveCamera(42, 1, 0.5, 6000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.screenSpacePanning = false; // pan across the ground plane
controls.maxPolarAngle = Math.PI / 2 - 0.01;
controls.minDistance = 4;
controls.maxDistance = 2200;
controls.zoomToCursor = true;

scene.add(new THREE.HemisphereLight('#dfeaf5', '#5b5040', 1.1));
const sun = new THREE.DirectionalLight('#fff3df', 2.4);
sun.position.set(-260, 420, 180); // afternoon sun from the south-west (in grid terms)
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
Object.assign(sun.shadow.camera, { left: -560, right: 560, top: 560, bottom: -560, near: 10, far: 1400 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.6;
scene.add(sun);

const world = createWorld(scene);

// ───────────────────────────── state ─────────────────────────────
const state = {
  mode: 'single', // single | split2 | split3 | swipe | ghost
  years: [1905, 2026, 2026],
  swipe: 0.5,
  playing: false,
  selected: null,
};

const $ = (id) => document.getElementById(id);
const sliders = [$('slider-a'), $('slider-b'), $('slider-c')];
const fmtYear = (y) => String(Math.floor(y + 1e-6));

// ───────────────────────────── camera views ─────────────────────────────
const VIEWS = {
  aerial: { pos: [-430, 330, 470], target: [10, 0, -40] },
  top: { pos: [0.01, 980, -39.99], target: [0, 0, -40] },
  street: { pos: [-6, 1.7, 6], target: [120, 30, -6] },
  river: { pos: [560, 70, 130], target: [0, 30, -40] },
};
let camAnim = null;
function setView(name, instant = false) {
  const v = VIEWS[name];
  document.querySelectorAll('[data-view]').forEach((b) => b.classList.toggle('on', b.dataset.view === name));
  const to = { pos: new THREE.Vector3(...v.pos), target: new THREE.Vector3(...v.target) };
  if (instant) {
    camera.position.copy(to.pos);
    controls.target.copy(to.target);
    controls.update();
    return;
  }
  camAnim = { from: { pos: camera.position.clone(), target: controls.target.clone() }, to, t0: performance.now(), dur: 900 };
}
document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
controls.addEventListener('start', () => {
  camAnim = null;
  document.querySelectorAll('[data-view]').forEach((b) => b.classList.remove('on'));
});

// ───────────────────────────── timeline ─────────────────────────────
const ticks = $('ticks');
const pct = (y) => (y - YEAR_MIN) / (YEAR_MAX - YEAR_MIN);
const tickLeft = (y) => `calc(8px + (100% - 16px) * ${pct(y)})`;
for (let y = 1750; y <= 2025; y += 25) {
  const t = document.createElement('div');
  t.className = 't';
  t.style.left = tickLeft(y);
  t.textContent = y;
  ticks.appendChild(t);
}
for (const e of TIMELINE_EVENTS) {
  const d = document.createElement('div');
  d.className = 'e';
  d.style.left = tickLeft(e.year);
  d.dataset.label = `${fmtYear(e.year)} · ${e.label}`;
  d.title = d.dataset.label;
  d.addEventListener('click', () => setYear(0, e.year));
  ticks.appendChild(d);
}

function setYear(i, y) {
  state.years[i] = Math.max(YEAR_MIN, Math.min(YEAR_MAX, y));
  sliders[i].value = state.years[i];
  updateReadouts();
}
sliders.forEach((s, i) => s.addEventListener('input', () => { state.years[i] = parseFloat(s.value); updateReadouts(); }));

function updateReadouts() {
  const [a, b, c] = state.years;
  $('year-a').textContent = fmtYear(a);
  const extra = { single: '', split2: `B ${fmtYear(b)}`, split3: `B ${fmtYear(b)} · C ${fmtYear(c)}`, swipe: `B ${fmtYear(b)}`, ghost: `ghost of ${fmtYear(a)} on ${fmtYear(b)}` }[state.mode];
  $('year-b-readout').textContent = extra;
  const y = state.mode === 'ghost' ? Math.max(a, b) : a;
  const era = ERAS.find((e) => y >= e.from && y < e.to) || ERAS[ERAS.length - 1];
  $('era-title').textContent = `${fmtYear(y)} — ${era.title}`;
  $('era-text').textContent = era.text;
  $('shore-text').textContent = `Shoreline: ${shoreLabel(y)}`;
  if (state.selected) refreshPanelYearMarkers();
  writeHash();
}

$('play').addEventListener('click', () => {
  state.playing = !state.playing;
  $('play').textContent = state.playing ? '❚❚' : '▶';
  if (state.playing && state.years[0] >= YEAR_MAX - 0.1) setYear(0, YEAR_MIN);
});

document.querySelectorAll('[data-year]').forEach((b) => b.addEventListener('click', () => {
  setMode('single');
  setYear(0, parseFloat(b.dataset.year));
}));
document.querySelectorAll('[data-cmp]').forEach((b) => b.addEventListener('click', () => {
  const [mode, ys] = b.dataset.cmp.split(':');
  ys.split(',').map(Number).forEach((y, i) => setYear(i, y));
  setMode(mode);
}));

// ───────────────────────────── compare modes ─────────────────────────────
function setMode(mode) {
  state.mode = mode;
  $('compare-mode').value = mode;
  sliders[1].hidden = mode === 'single';
  sliders[2].hidden = mode !== 'split3';
  $('swipe-handle').hidden = mode !== 'swipe';
  updateReadouts();
  layoutPaneLabels();
}
$('compare-mode').addEventListener('change', (e) => setMode(e.target.value));

function panes() {
  const w = container.clientWidth, h = container.clientHeight;
  const [a, b, c] = state.years;
  switch (state.mode) {
    case 'split2': return [{ x: 0, w: w / 2, year: a }, { x: w / 2, w: w / 2, year: b }].map((p) => ({ ...p, h }));
    case 'split3': return [a, b, c].map((year, i) => ({ x: (w / 3) * i, w: w / 3, h, year }));
    case 'swipe': return [{ x: 0, w, h, year: a, scissor: [0, w * state.swipe] }, { x: 0, w, h, year: b, scissor: [w * state.swipe, w] }];
    case 'ghost': return [{ x: 0, w, h, year: Math.max(a, b), compare: { year: Math.min(a, b) } }];
    default: return [{ x: 0, w, h, year: a }];
  }
}

function layoutPaneLabels() {
  const el = $('pane-labels');
  el.innerHTML = '';
  const colors = ['var(--a)', 'var(--b)', 'var(--c)'];
  const w = container.clientWidth;
  if (state.mode === 'split2' || state.mode === 'split3') {
    panes().forEach((p, i) => {
      const l = document.createElement('div');
      l.className = 'pl';
      l.style.left = `${p.x + p.w / 2}px`;
      l.style.color = colors[i];
      l.textContent = fmtYear(p.year);
      el.appendChild(l);
      if (i) { const d = document.createElement('div'); d.className = 'div'; d.style.left = `${p.x - 1}px`; el.appendChild(d); }
    });
  } else if (state.mode === 'swipe') {
    const [a, b] = state.years;
    for (const [x, y, c] of [[w * state.swipe * 0.5, a, colors[0]], [w * (state.swipe + (1 - state.swipe) * 0.5), b, colors[1]]]) {
      const l = document.createElement('div');
      l.className = 'pl'; l.style.left = `${x}px`; l.style.color = c; l.textContent = fmtYear(y);
      el.appendChild(l);
    }
    $('swipe-handle').style.left = `${w * state.swipe}px`;
  } else if (state.mode === 'ghost') {
    const [a, b] = state.years;
    const lo = fmtYear(Math.min(a, b)), hi = fmtYear(Math.max(a, b));
    const l = document.createElement('div');
    l.className = 'legend';
    l.innerHTML = `Showing <b>${hi}</b><i style="background:var(--ghost)"></i>gone since ${lo}<i style="background:var(--new)"></i>new since ${lo}`;
    el.appendChild(l);
  }
}
let lastLabelSig = '';

// swipe divider
{
  const h = $('swipe-handle');
  let drag = false;
  h.addEventListener('pointerdown', (e) => { drag = true; h.setPointerCapture(e.pointerId); });
  h.addEventListener('pointermove', (e) => { if (drag) { state.swipe = Math.min(0.95, Math.max(0.05, e.clientX / container.clientWidth)); layoutPaneLabels(); } });
  h.addEventListener('pointerup', () => (drag = false));
}

// ───────────────────────────── layers ─────────────────────────────
$('tools-toggle').addEventListener('click', () => {
  const open = $('toolbar').classList.toggle('open');
  $('tools-toggle').setAttribute('aria-expanded', String(open));
});
$('lyr-labels').addEventListener('change', (e) => (world.showLabels = e.target.checked));
$('lyr-inferred').addEventListener('change', (e) => (world.showInferred = e.target.checked));
$('lyr-grid').addEventListener('change', (e) => (world.showGrid = e.target.checked));
$('lyr-scope').addEventListener('change', (e) => (world.showScope = e.target.checked));

// ───────────────────────────── picking ─────────────────────────────
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
function paneAt(clientX) {
  const ps = panes();
  if (state.mode === 'swipe') return clientX < container.clientWidth * state.swipe ? ps[0] : ps[1];
  return ps.find((p) => clientX >= p.x && clientX < p.x + p.w) || ps[0];
}
function castAt(clientX, clientY, objects) {
  const p = paneAt(clientX);
  world.applyYear(p.year, p.compare);
  camera.aspect = p.w / p.h;
  camera.updateProjectionMatrix();
  scene.updateMatrixWorld();
  ndc.set(((clientX - p.x) / p.w) * 2 - 1, -(clientY / p.h) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  return { hits: raycaster.intersectObjects(objects, false).filter((h) => isShown(h.object)), pane: p };
}
const isShown = (o) => { for (; o; o = o.parent) if (!o.visible) return false; return true; };

let down = null;
renderer.domElement.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY }));
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
  const { hits, pane } = castAt(e.clientX, e.clientY, world.pickables);
  const f = hits.length ? world.featureAt(hits[0].object) : null;
  if (f) select(f, pane.year);
  else closePanel();
});
let hoverT = 0;
renderer.domElement.addEventListener('pointermove', (e) => {
  const now = performance.now();
  if (now - hoverT < 60) return;
  hoverT = now;
  const { hits } = castAt(e.clientX, e.clientY, [world.land, world.water]);
  if (hits.length) {
    const p = hits[0].point;
    $('coords').textContent = `${fmtLatLon(gridToLatLon(p.x, -p.z))} · ${hits[0].object.userData.ground}`;
  }
});

// ───────────────────────────── info panel ─────────────────────────────
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function archiveLinks(q) {
  const e = encodeURIComponent(q);
  return [
    ['NYPL Digital Collections', `https://digitalcollections.nypl.org/search/index?keywords=${e}`],
    ['Library of Congress photos', `https://www.loc.gov/photos/?q=${e}`],
    ['Wikimedia Commons', `https://commons.wikimedia.org/w/index.php?search=${e}&title=Special:MediaSearch&type=image`],
    ['OldNYC (geocoded NYPL photos)', 'https://www.oldnyc.org/'],
    ['1940s tax photos', 'https://1940s.nyc/'],
    ['1980s tax photos', 'https://1980s.nyc/'],
  ];
}

function select(f, atYear) {
  state.selected = f;
  world.selectedId = f.kind === 'event' ? null : f.id;
  const panel = $('panel');
  panel.hidden = false;
  if (f.kind === 'event') {
    $('panel-body').innerHTML = `
      <h2>${esc(f.name)}</h2><div class="addr">${esc(f.date)}</div>
      <span class="badge documented">Documented event</span>
      <h3>History</h3>${f.notes.map((n) => `<p>${esc(n)}</p>`).join('')}
      <h3>Sources</h3>${sourcesHtml(f.sources)}
      <h3>Archival images</h3><ul>${archiveLinks('Kips Bay 1776 landing').map(([t, u]) => `<li><a href="${u}" target="_blank" rel="noopener">${t}</a></li>`).join('')}</ul>`;
    return;
  }
  const ground = f.parts ? f.parts.filter((p) => !p.base) : [];
  const [cu, cv] = ground.length ? centroid(ground[0].poly) : [0, f.pierV ?? 0];
  const height = f.parts ? Math.max(...f.parts.map((p) => (p.base || 0) + p.height)) : 1.4;
  const footprint = ground.reduce((s, p) => s + area(p.poly), 0);
  const conf = CONFIDENCE[f.confidence];
  const dates = `${esc(f.builtLabel || fmtYear(f.built))} – ${f.demolished == null ? 'standing' : esc(f.demolishedLabel || fmtYear(f.demolished))}`;
  $('panel-body').innerHTML = `
    <h2>${esc(f.name)}</h2>
    <div class="addr">${esc(f.address || '')}</div>
    <span class="badge ${f.confidence}" title="${esc(conf.desc)}">${conf.label}</span>
    <dl style="margin-top:10px">
      <dt>Dates</dt><dd>${dates}</dd>
      <dt>Use</dt><dd>${esc(f.use)}</dd>
      <dt>Height</dt><dd>${height < 2 ? 'at grade' : `≈ ${Math.round(height)} m (${Math.round(height / 0.3048)} ft)`}${f.floors ? ` · ${f.floors} storeys` : ''}</dd>
      ${footprint ? `<dt>Footprint</dt><dd>≈ ${Math.round(footprint).toLocaleString()} m² (${Math.round(footprint * 10.7639).toLocaleString()} ft²)</dd>` : ''}
      <dt>Location</dt><dd>${fmtLatLon(gridToLatLon(cu, cv))}</dd>
      ${f.demolishedBy ? `<dt>Replaced by</dt><dd><a href="#" data-goto="${f.demolishedBy.id}">${esc(f.demolishedBy.name)}</a></dd>` : ''}
    </dl>
    <div class="actions">
      <button data-jump="${f.built}">Go to ${fmtYear(f.built)}</button>
      ${f.demolished != null ? `<button data-jump="${f.demolished - 0.9}">Last year (${fmtYear(f.demolished - 1)})</button><button data-cmpdemo="1">Compare before/after</button>` : ''}
      ${ground.length ? '<button class="accent" data-trace="1">Trace footprint through time</button>' : ''}
      <button data-fly="1">Fly to</button>
    </div>
    <p style="font-size:12px;color:var(--muted)">${esc(conf.desc)}</p>
    <h3>History</h3>${f.notes.map((n) => `<p>${esc(n)}</p>`).join('')}
    <div id="trace-out"></div>
    <h3>Photos &amp; archival images</h3>
    <p style="font-size:12px;color:var(--muted)">No photographs are embedded (rights and exact catalogue records have not been cleared). These searches go straight to the collections most likely to hold them:</p>
    <ul>${archiveLinks(f.photoSearch || f.name).map(([t, u]) => `<li><a href="${u}" target="_blank" rel="noopener">${t}</a></li>`).join('')}</ul>
    <h3>Sources</h3>${sourcesHtml(f.sources)}`;
  const body = $('panel-body');
  body.querySelectorAll('[data-jump]').forEach((b) => b.addEventListener('click', () => { setMode('single'); setYear(0, parseFloat(b.dataset.jump)); }));
  body.querySelector('[data-cmpdemo]')?.addEventListener('click', () => { setYear(0, f.demolished - 1); setYear(1, f.demolished + 1); setMode('split2'); });
  body.querySelector('[data-trace]')?.addEventListener('click', () => showTrace(f));
  body.querySelector('[data-fly]')?.addEventListener('click', () => flyTo(cu, cv, height));
  body.querySelectorAll('[data-goto]').forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault();
    const g = world.features.get(a.dataset.goto).feature;
    setYear(0, g.built + 0.5); select(g);
  }));
  if (world.trace && state.traceFor === f.id) showTrace(f);
}

function sourcesHtml(ids) {
  return ids.map((id) => SOURCES[id]).filter(Boolean).map((s) => `<div class="src">${s.url ? `<a href="${s.url}" target="_blank" rel="noopener">${esc(s.title)}</a>` : esc(s.title)}<br><em>${esc(s.note)}</em></div>`).join('');
}

function showTrace(f) {
  const hull = footprintHull(f);
  world.setTrace(hull);
  state.traceFor = f.id;
  $('trace-horizon').classList.toggle('on', f.id === HORIZON_ID);
  const rows = traceFootprint(hull, ALL_FEATURES, { selfId: f.id });
  const out = $('trace-out');
  out.innerHTML = `<h3>Footprint through time</h3>
    <p style="font-size:12px;color:var(--muted)">Everything in this dataset that occupied the outlined footprint (gold prism in the 3D view), computed by polygon overlap with the time-varying shoreline and every feature. Click a row to go there.</p>
    ${rows.map((r) => `<div class="trace-row" data-from="${r.from}" data-to="${r.to}"><div class="yrs">${r.from}${r.to !== r.from ? `–${r.to}` : ''}</div><div class="what">${describeRow(r).map(esc).join('<br>')}</div></div>`).join('')}`;
  out.querySelectorAll('.trace-row').forEach((el) => el.addEventListener('click', () => {
    setMode('single');
    setYear(0, (parseFloat(el.dataset.from) + parseFloat(el.dataset.to)) / 2 + 0.5);
  }));
  refreshPanelYearMarkers();
  out.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function refreshPanelYearMarkers() {
  const y = state.years[0];
  document.querySelectorAll('.trace-row').forEach((el) => el.classList.toggle('now', y >= +el.dataset.from && y < +el.dataset.to + 1));
}

function closePanel() {
  $('panel').hidden = true;
  state.selected = null;
  world.selectedId = null;
}
$('panel-close').addEventListener('click', closePanel);

$('trace-horizon').addEventListener('click', () => {
  const h = world.features.get(HORIZON_ID).feature;
  if (state.traceFor === HORIZON_ID && world.trace) {
    world.setTrace(null); state.traceFor = null; $('trace-horizon').classList.remove('on');
    return;
  }
  select(h);
  showTrace(h);
});

function flyTo(u, v, h) {
  const target = new THREE.Vector3(u, Math.min(h, 120) * 0.4, -v);
  const dir = camera.position.clone().sub(controls.target).normalize();
  const dist = Math.max(160, h * 2.6);
  camAnim = { from: { pos: camera.position.clone(), target: controls.target.clone() }, to: { pos: target.clone().add(dir.multiplyScalar(dist)), target }, t0: performance.now(), dur: 900 };
}

// ───────────────────────────── URL state ─────────────────────────────
function writeHash() {
  const [a, b, c] = state.years.map((y) => y.toFixed(1));
  const h = `y=${a}` + (state.mode !== 'single' ? `&m=${state.mode}&b=${b}&c=${c}` : '');
  try {
    history.replaceState(null, '', `#${h}`);
  } catch {
    // sandboxed hosts may refuse URL updates; the view still works
  }
}
function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  if (p.get('y')) setYear(0, parseFloat(p.get('y')));
  if (p.get('b')) setYear(1, parseFloat(p.get('b')));
  if (p.get('c')) setYear(2, parseFloat(p.get('c')));
  setMode(p.get('m') || 'single');
}

// ───────────────────────────── render loop ─────────────────────────────
function resize() {
  renderer.setSize(container.clientWidth, container.clientHeight);
  layoutPaneLabels();
}
window.addEventListener('resize', resize);

const needle = $('needle');
const trueNorth = new THREE.Vector3(-Math.sin((GRID_ROTATION_DEG * Math.PI) / 180), 0, -Math.cos((GRID_ROTATION_DEG * Math.PI) / 180));
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (state.playing) {
    const y = state.years[0] + dt * 9;
    setYear(0, y);
    if (y >= YEAR_MAX) { state.playing = false; $('play').textContent = '▶'; }
  }
  if (camAnim) {
    const t = Math.min(1, (now - camAnim.t0) / camAnim.dur);
    const k = t * t * (3 - 2 * t);
    camera.position.lerpVectors(camAnim.from.pos, camAnim.to.pos, k);
    controls.target.lerpVectors(camAnim.from.target, camAnim.to.target, k);
    if (t >= 1) camAnim = null;
  }
  controls.update();

  // compass
  const fwd = controls.target.clone().sub(camera.position).setY(0).normalize();
  if (fwd.lengthSq() < 1e-6) camera.getWorldDirection(fwd).setY(0).normalize();
  if (camera.position.y > 900 && Math.abs(camera.position.x - controls.target.x) < 1) fwd.set(0, 0, -1).applyQuaternion(camera.quaternion).setY(0).normalize();
  const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
  const ang = Math.atan2(trueNorth.dot(right), trueNorth.dot(fwd));
  needle.style.transform = `rotate(${ang}rad)`;

  // render panes
  const W = container.clientWidth, H = container.clientHeight;
  renderer.setScissorTest(true);
  for (const p of panes()) {
    world.applyYear(p.year, p.compare);
    camera.aspect = p.w / p.h;
    camera.updateProjectionMatrix();
    if (p.scissor) {
      renderer.setViewport(0, 0, W, H);
      renderer.setScissor(p.scissor[0], 0, p.scissor[1] - p.scissor[0], H);
    } else {
      renderer.setViewport(p.x, 0, p.w, H);
      renderer.setScissor(p.x, 0, p.w, H);
    }
    renderer.render(scene, camera);
  }
  renderer.setScissorTest(false);

  const sig = state.mode + state.years.map(fmtYear).join() + W;
  if (sig !== lastLabelSig) { lastLabelSig = sig; layoutPaneLabels(); }
  requestAnimationFrame(frame);
}

resize();
setView('aerial', true);
readHash();
updateReadouts();
requestAnimationFrame(frame);

// test / automation handle
window.__timeMachine = { state, world, setYear, setMode, setView, select: (id) => select(world.features.get(id).feature), showTrace: (id) => showTrace(world.features.get(id).feature), exists };
