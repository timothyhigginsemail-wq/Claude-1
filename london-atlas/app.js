/* London Atlas — map, research panels and rental shortlist. No build step, no framework. */
(function () {
  'use strict';

  /* ================================================================ data */
  var AREAS = window.ATLAS_AREAS || [];
  var SOURCES = window.ATLAS_SOURCES || {};
  var WIKI = window.ATLAS_WIKI;
  var PARKS = window.ATLAS_PARKS || [];
  var LANDMARKS = window.ATLAS_LANDMARKS || [];
  var BASE = window.ATLAS_BASE_PLACES || [];
  var PRESSURE = window.ATLAS_PRESSURE || [];
  var OFFICE_DEFAULTS = window.ATLAS_OFFICES || [];
  var ACCESSED = window.ATLAS_ACCESSED || '';
  var AREA_BY_ID = {};
  AREAS.forEach(function (a) { AREA_BY_ID[a.id] = a; });

  var LINE_COLORS = {
    'Bakerloo': '#B36305', 'Central': '#E32017', 'Circle': '#FFD300', 'District': '#00782A',
    'Hammersmith & City': '#F3A9BB', 'Jubilee': '#A0A5A9', 'Metropolitan': '#9B0056', 'Northern': '#000000',
    'Piccadilly': '#003688', 'Victoria': '#0098D4', 'Waterloo & City': '#95CDBA', 'Elizabeth line': '#6950A1',
    'London Overground': '#EE7C0E', 'DLR': '#00A4A7', 'Tramlink': '#84B817', 'IFS Cloud Cable Car': '#E21836', 'National Rail': '#888888'
  };
  var LINE_ORDER = ['Elizabeth line', 'Victoria', 'Jubilee', 'Central', 'Northern', 'Piccadilly', 'Bakerloo', 'District', 'Circle',
    'Hammersmith & City', 'Metropolitan', 'Waterloo & City', 'London Overground', 'DLR', 'Tramlink', 'IFS Cloud Cable Car'];
  /* Lines that run on the surface or in shallow cuttings somewhere in inner London. Deep-level tube lines are excluded. */
  var SURFACE_LINES = { 'Circle': 1, 'District': 1, 'Hammersmith & City': 1, 'Metropolitan': 1, 'London Overground': 1, 'DLR': 1, 'Tramlink': 1, 'Elizabeth line': 1 };

  var CHAR_KINDS = {
    heritage: { label: 'Conservation area (designated)', color: '#7a6a4f' },
    night: { label: 'Night-time economy pressure', color: '#8e3b5f' },
    street: { label: 'Street crime / ASB focus (police or council)', color: '#b0552f' },
    office: { label: 'Office district — empties evenings/weekends', color: '#4f5d75' },
    tourist: { label: 'Tourist pressure', color: '#b38b2e' },
    regen: { label: 'Major regeneration / construction', color: '#6d6d6d' },
    seasonal: { label: 'Seasonal event pressure', color: '#5b7f99' },
    crowds: { label: 'Crowds / phone-theft hotspot', color: '#b0552f' }
  };
  var STATUS = ['interested', 'viewing booked', 'viewed', 'applied', 'rejected'];
  var STATUS_COLOR = { 'interested': '#2e4a66', 'viewing booked': '#b38b2e', 'viewed': '#4f7a46', 'applied': '#8e3b5f', 'rejected': '#9a9a9a' };

  /* ================================================================ state */
  var STORE_KEY = 'london-atlas-v1';
  var DEFAULT_VIEW = { center: [51.5110, -0.1560], zoom: 13 };
  function defaults() {
    var offices = {};
    OFFICE_DEFAULTS.forEach(function (o) { offices[o.id] = { ll: o.ll.slice(), approx: true }; });
    return {
      version: 1, mode: 'explore', view: DEFAULT_VIEW,
      layers: { areas: true, transport: false, landmarks: false, character: false, roads: false, mine: true, boroughs: false },
      lines: LINE_ORDER.slice(), basemap: 'voyager', threshold: 25, offices: offices,
      shortlist: [], areaNotes: {}, commutes: {}, apartments: [], places: [], compareApts: [], showArchived: false, homeTab: 'shortlist'
    };
  }
  var S = load();
  function load() {
    var d = defaults();
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (raw) return merge(d, JSON.parse(raw));
    } catch (e) { /* storage unavailable: run with defaults */ }
    return d;
  }
  function merge(d, x) {
    if (!x || typeof x !== 'object') return d;
    Object.keys(d).forEach(function (k) {
      if (x[k] === undefined) return;
      if (d[k] && typeof d[k] === 'object' && !Array.isArray(d[k]) && k !== 'view') d[k] = Object.assign(d[k], x[k]);
      else d[k] = x[k];
    });
    return d;
  }
  var saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch (e) { toast('Could not save locally — export your data to keep it.'); }
    }, 150);
  }

  /* ================================================================ utils */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function blank(v) { return v === null || v === undefined || v === ''; }
  function show(v, fmt) { return blank(v) ? '<span class="small">—</span>' : esc(fmt ? fmt(v) : v); }
  function money(v) { return '£' + Number(v).toLocaleString('en-GB'); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function dist(a, b) {
    var R = 6371000, toR = Math.PI / 180;
    var dLat = (b[0] - a[0]) * toR, dLng = (b[1] - a[1]) * toR;
    var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a[0] * toR) * Math.cos(b[0] * toR) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.sqrt(s));
  }
  function fmtDist(m) { return m < 1000 ? Math.round(m / 10) * 10 + ' m' : (m / 1000).toFixed(m < 10000 ? 1 : 0) + ' km'; }
  /* distance from point to polyline, metres, local equirectangular projection (fine at city scale) */
  function distToLine(p, pts) {
    var k = Math.cos(51.5 * Math.PI / 180) * 111320, ky = 110540;
    var px = p[1] * k, py = p[0] * ky, best = Infinity;
    for (var i = 0; i < pts.length - 1; i++) {
      var ax = pts[i][1] * k, ay = pts[i][0] * ky, bx = pts[i + 1][1] * k, by = pts[i + 1][0] * ky;
      var dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy, t = L ? ((px - ax) * dx + (py - ay) * dy) / L : 0;
      t = Math.max(0, Math.min(1, t));
      var ex = ax + t * dx - px, ey = ay + t * dy - py, d = Math.sqrt(ex * ex + ey * ey);
      if (d < best) best = d;
    }
    return best;
  }
  function inRing(p, r) {
    var x = p[1], y = p[0], ins = false;
    for (var i = 0, j = r.length - 1; i < r.length; j = i++) {
      var xi = r[i][1], yi = r[i][0], xj = r[j][1], yj = r[j][0];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) ins = !ins;
    }
    return ins;
  }
  /* metres from a point to a polygon (0 inside); rings[0] is the outer ring */
  function distToPoly(p, rings) {
    var r0 = rings[0];
    if (Math.abs(r0[0][0] - p[0]) > .05 || Math.abs(r0[0][1] - p[1]) > .08) return Infinity;
    if (inRing(p, r0) && !rings.slice(1).some(function (h) { return inRing(p, h); })) return 0;
    return Math.min.apply(null, rings.map(function (r) { return distToLine(p, r.concat([r[0]])); }));
  }
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’'.]/g, '').replace(/&/g, 'and'); }
  function today() { return new Date().toISOString().slice(0, 10); }
  function nextWeekday() {
    var d = new Date(); d.setDate(d.getDate() + 1);
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
    return d;
  }
  function ymd(d) { return d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0'); }
  var toastTimer;
  function toast(msg) {
    var t = $('#toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, 3200);
  }
  function srcObj(id) { return SOURCES[id]; }
  function officeLL(id) { return S.offices[id] ? S.offices[id].ll : null; }
  function officeName(id) { var o = OFFICE_DEFAULTS.filter(function (x) { return x.id === id; })[0]; return o ? o.name : id; }

  /* ================================================================ map */
  var map = L.map('map', { zoomControl: false, minZoom: 10, maxZoom: 18, preferCanvas: false, worldCopyJump: false })
    .setView(S.view.center, S.view.zoom);
  map.setMaxBounds([[51.25, -0.6], [51.75, 0.35]]);
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  L.control.scale({ position: 'bottomleft', imperial: false, maxWidth: 140 }).addTo(map);
  var ResetCtl = L.Control.extend({
    options: { position: 'bottomright' },
    onAdd: function () {
      var c = L.DomUtil.create('div', 'leaflet-bar reset-control');
      c.innerHTML = '<a href="#" role="button" title="Reset to central London" aria-label="Reset to central London">Centre</a>';
      L.DomEvent.on(c, 'click', function (e) { L.DomEvent.stop(e); map.flyTo(DEFAULT_VIEW.center, DEFAULT_VIEW.zoom, { duration: .6 }); });
      return c;
    }
  });
  map.addControl(new ResetCtl());

  map.createPane('osbase').style.zIndex = 150;
  map.createPane('osparks').style.zIndex = 340;
  map.createPane('halos').style.zIndex = 350;
  map.createPane('oshi').style.zIndex = 410;
  map.createPane('lines').style.zIndex = 420;
  map.createPane('streetLabels').style.zIndex = 430;
  map.getPane('streetLabels').style.pointerEvents = 'none';
  map.createPane('labels').style.zIndex = 640;

  /* ------------------------------------------------ OS open-data vector base (works with no tile server) */
  function cssv(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#999'; }
  var OS = window.ATLAS_OS || { land: [], water: [], green: [], roads: [] };
  /* Natural Earth Thames centreline (coarse), extended to the GLA edges. Only used as a generous water corridor
     underneath the borough polygons, which exclude the river at mean high water — the river shows through the gap. */
  var THAMES_NE = [[51.413, -0.370], [51.404, -0.345], [51.4009, -0.3237], [51.4073, -0.3155], [51.419, -0.3082], [51.428, -0.3188], [51.4361, -0.3204], [51.4457, -0.3082],
    [51.4647, -0.3232], [51.4727, -0.3101], [51.4737, -0.271], [51.4758, -0.2596], [51.4852, -0.2471], [51.4873, -0.2365], [51.4842, -0.2261], [51.4706, -0.21], [51.4674, -0.1983],
    [51.4701, -0.1793], [51.4774, -0.1567], [51.4872, -0.1355], [51.5091, -0.1022], [51.5117, -0.0848], [51.5081, -0.0672], [51.5009, -0.0488], [51.4975, -0.0377], [51.4941, -0.0066],
    [51.5006, 0.0099], [51.5024, 0.0207], [51.4912, 0.0483], [51.4925, 0.072], [51.507, 0.11], [51.49, 0.17], [51.48, 0.215]];
  function corridor(pts, metres) {
    var ky = metres / 111000, kx = metres / 69400, left = [], right = [];
    pts.forEach(function (p, i) {
      var a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      var dx = (b[1] - a[1]) * 69400, dy = (b[0] - a[0]) * 111000, L = Math.sqrt(dx * dx + dy * dy) || 1;
      var nx = -dy / L, ny = dx / L;
      left.push([p[0] + ny * ky, p[1] + nx * kx]); right.push([p[0] - ny * ky, p[1] - nx * kx]);
    });
    return left.concat(right.reverse());
  }
  var osBaseRenderer = L.canvas({ pane: 'osbase', padding: .3 });
  var osParkRenderer = L.canvas({ pane: 'osparks', padding: .3 });
  var osHiRenderer = L.canvas({ pane: 'oshi', padding: .3 });
  var osLand = L.layerGroup(), osRoadsBase = L.layerGroup(), osParks = L.layerGroup(), osRoadsHi = L.layerGroup();
  var osShapes = { river: null, land: [], water: [], roadCase: [], roadFill: [], parks: [], hi: [] };
  osShapes.river = L.polygon(corridor(THAMES_NE, 2300), { renderer: osBaseRenderer, stroke: false, fillOpacity: 1, interactive: false });
  osLand.addLayer(osShapes.river);
  OS.land.forEach(function (b) {
    var p = L.polygon(b.r, { renderer: osBaseRenderer, weight: 1.2, fillOpacity: 1, interactive: false });
    p._inner = b.inner; osShapes.land.push(p); osLand.addLayer(p);
  });
  OS.water.forEach(function (w) { var p = L.polygon(w, { renderer: osBaseRenderer, stroke: false, fillOpacity: 1, interactive: false }); osShapes.water.push(p); osLand.addLayer(p); });
  OS.roads.forEach(function (r) {
    var c = L.polyline(r.p, { renderer: osBaseRenderer, interactive: false, lineCap: 'round', lineJoin: 'round' });
    var f = L.polyline(r.p, { renderer: osBaseRenderer, interactive: false, lineCap: 'round', lineJoin: 'round' });
    c._m = f._m = r.m; osShapes.roadCase.push(c); osShapes.roadFill.push(f);
  });
  osShapes.roadCase.forEach(function (l) { osRoadsBase.addLayer(l); });
  osShapes.roadFill.forEach(function (l) { osRoadsBase.addLayer(l); });
  /* OS names some park pieces differently (Battersea Park's main polygon is "Festival Pleasure Gardens"):
     where a researched park marker sits inside an OS outline, use the researched name */
  OS.green.forEach(function (g) {
    var cur = PARKS.filter(function (p) { return p.access !== 'private' && inRing(p.ll, g.r[0]); })[0];
    if (cur) { if (g.n && norm(g.n) !== norm(cur.name).replace(/^the /, '')) g.osName = g.n; g.n = cur.name; }
  });
  OS.green.forEach(function (g) {
    var p = L.polygon(g.r, { renderer: osParkRenderer, weight: 1 });
    p.bindTooltip(esc(g.n || 'Public park or garden') + ' <span class="small">' + g.ha + ' ha</span>', { className: 'atlas-tip', sticky: true });
    p.on('click', function (e) { L.DomEvent.stopPropagation(e); openGreen(g); });
    osShapes.parks.push(p); osParks.addLayer(p);
  });
  OS.roads.forEach(function (r) {
    var h = L.polyline(r.p, { renderer: osHiRenderer, lineCap: 'round', weight: 4 });
    h.bindTooltip(esc([r.no, r.n].filter(Boolean).join(' · ') || 'A road'), { className: 'atlas-tip', sticky: true });
    osShapes.hi.push(h); osRoadsHi.addLayer(h);
  });
  function styleOS() {
    var atlas = S.basemap === 'atlas', z = map.getZoom();
    var land = cssv('--map-land'), landIn = cssv('--map-land-inner'), water = cssv('--map-water');
    osShapes.river.setStyle({ fillColor: water });
    osShapes.land.forEach(function (p) { var c = p._inner ? landIn : land; p.setStyle({ fillColor: c, color: c }); });
    osShapes.water.forEach(function (p) { p.setStyle({ fillColor: water }); });
    var w = z >= 16 ? 7 : z >= 15 ? 5 : z >= 14 ? 3.6 : z >= 13 ? 2.4 : 1.4;
    var edge = cssv('--map-road-edge'), fill = cssv('--map-road'), mw = cssv('--map-motorway');
    osShapes.roadCase.forEach(function (l) { l.setStyle({ color: edge, weight: w + 1.6 }); });
    osShapes.roadFill.forEach(function (l) { l.setStyle({ color: l._m ? mw : fill, weight: w }); });
    var pf = cssv('--map-park'), pe = cssv('--map-park-edge');
    osShapes.parks.forEach(function (p) { p.setStyle({ fillColor: pf, color: pe, fillOpacity: atlas ? 1 : .35, opacity: atlas ? 1 : .6 }); });
    var hi = cssv('--map-highlight-road');
    osShapes.hi.forEach(function (l) { l.setStyle({ color: hi, opacity: .55, weight: Math.max(3, w * .9) }); });
  }
  map.getContainer().style.background = '';

  var BASEMAPS = {
    atlas: { attr: 'Contains OS data &copy; Crown copyright and database right (OGL) · Transport &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors via oobrien/vis' },
    voyager: { url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png', labels: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png', attr: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a> · parks &amp; roads: OS (OGL)' },
    positron: { url: 'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', labels: 'https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png', attr: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a> · parks &amp; roads: OS (OGL)' },
    osm: { url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', labels: null, attr: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · parks &amp; roads: OS (OGL)' }
  };
  var HOSTED = !!window.ATLAS_HOSTED;
  if (HOSTED || !BASEMAPS[S.basemap]) S.basemap = HOSTED ? 'atlas' : 'voyager';
  var baseLayer = null, streetLabelLayer = null, tileErrors = 0, attrCtl = map.attributionControl, lastAttr = null;
  function setBasemap(key) {
    var b = BASEMAPS[key] || BASEMAPS.atlas;
    if (baseLayer) map.removeLayer(baseLayer);
    if (streetLabelLayer) map.removeLayer(streetLabelLayer);
    baseLayer = streetLabelLayer = null; tileErrors = 0;
    if (lastAttr) attrCtl.removeAttribution(lastAttr);
    attrCtl.addAttribution(b.attr); lastAttr = b.attr;
    if (key === 'atlas') {
      osLand.addTo(map); osRoadsBase.addTo(map);
    } else {
      map.removeLayer(osLand); map.removeLayer(osRoadsBase);
      baseLayer = L.tileLayer(b.url, { subdomains: 'abcd', maxZoom: 19, className: key === 'osm' ? 'tiles-muted' : '' }).addTo(map);
      baseLayer.on('tileerror', function () {
        tileErrors++;
        if (tileErrors === 6) toast('Street tiles are not loading. Switch the base map to “London Atlas” under Layers — it needs no tile server.');
      });
      streetLabelLayer = b.labels ? L.tileLayer(b.labels, { subdomains: 'abcd', maxZoom: 19, minZoom: 15, pane: 'streetLabels', opacity: .85 }) : null;
      if (streetLabelLayer) streetLabelLayer.addTo(map);
    }
    osParks.addTo(map);
    S.basemap = key; save(); styleOS();
  }
  setBasemap(S.basemap);
  /* follow the viewer's theme: OS polygons are canvas-drawn, so restyle them on change */
  if (window.matchMedia) { var mq = window.matchMedia('(prefers-color-scheme: dark)'); (mq.addEventListener ? mq.addEventListener('change', styleOS) : mq.addListener(styleOS)); }
  new MutationObserver(styleOS).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  function zoomClass() {
    var c = map.getContainer(), z = Math.round(map.getZoom());
    c.className = c.className.replace(/\bz\d+\b/g, '').trim() + ' z' + z;
  }
  zoomClass();

  /* ------------------------------------------------ layers */
  var L_ = {
    areas: L.layerGroup(), halos: L.layerGroup(), parks: L.layerGroup(), gates: L.layerGroup(), transport: L.layerGroup(),
    stations: L.layerGroup(), landmarks: L.layerGroup(), character: L.layerGroup(), roads: osRoadsHi,
    mine: L.layerGroup(), boroughs: L.layerGroup(), offices: L.layerGroup(), base: L.layerGroup()
  };
  var labelMarkers = []; /* {marker, prio, text, cls} for collision */
  var areaMarkers = {}, areaHalos = {};

  function divLabel(cls, text) {
    return L.divIcon({ className: cls, html: '<span>' + esc(text) + '</span>', iconSize: [0, 0] });
  }

  /* neighbourhoods */
  AREAS.forEach(function (a) {
    var halo = L.circle(a.ll, { radius: a.r, pane: 'halos', stroke: false, fillColor: '#2e4a66', fillOpacity: 0, interactive: false });
    areaHalos[a.id] = halo; L_.halos.addLayer(halo);
    var m = L.marker(a.ll, { icon: divLabel('area-label ' + a.depth, a.name.replace(/ \(.*\)$/, '')), pane: 'labels', keyboard: true, title: a.name, riseOnHover: true });
    m.on('click', function () { openArea(a.id); });
    m.on('mouseover', function () { if (selected.kind !== 'area' || selected.id !== a.id) halo.setStyle({ fillOpacity: .07 }); });
    m.on('mouseout', function () { if (selected.kind !== 'area' || selected.id !== a.id) halo.setStyle({ fillOpacity: 0 }); });
    areaMarkers[a.id] = m; L_.areas.addLayer(m);
    labelMarkers.push({ marker: m, prio: a.depth === 'deep' ? 3 : 2, text: a.name.replace(/ \(.*\)$/, ''), cls: a.depth, id: a.id });
  });
  BASE.forEach(function (p) {
    var m = L.marker(p.ll, { icon: divLabel('area-label base', p.name), pane: 'labels', interactive: true, title: p.name + ' (base map only)' });
    m.on('click', function () { openBase(p); });
    L_.base.addLayer(m);
    labelMarkers.push({ marker: m, prio: 1, text: p.name, cls: 'base' });
  });
  function refreshAreaClasses() {
    AREAS.forEach(function (a) {
      var el = areaMarkers[a.id].getElement(); if (!el) return;
      el.classList.toggle('shortlisted', S.shortlist.indexOf(a.id) >= 0);
      el.classList.toggle('selected', selected.kind === 'area' && selected.id === a.id);
    });
  }

  /* parks — always on */
  function parkIcon(p) {
    var size = p.size === 'large' ? 11 : p.size === 'medium' ? 9 : 7;
    var style = p.access === 'public'
      ? 'background:var(--green);border:1.5px solid var(--field);border-radius:50%;'
      : p.access === 'restricted' ? 'background:var(--green-soft);border:1.5px solid var(--green);border-radius:50%;'
        : 'background:var(--field);border:1.5px dashed var(--estate-ink);border-radius:2px;';
    return L.divIcon({ className: '', html: '<i style="display:block;width:' + size + 'px;height:' + size + 'px;transform:translate(-50%,-50%);box-shadow:0 0 0 1px rgba(0,0,0,.08);' + style + '"></i>', iconSize: [0, 0] });
  }
  PARKS.forEach(function (p) {
    var m = L.marker(p.ll, { icon: parkIcon(p), title: p.name, keyboard: false });
    m.on('click', function () { openPark(p.id); });
    L_.parks.addLayer(m);
    var lab = L.marker(p.ll, { icon: divLabel('park-label ' + p.access + ' ' + p.size, p.name), pane: 'labels', title: p.name });
    lab.on('click', function () { openPark(p.id); });
    L_.parks.addLayer(lab);
    labelMarkers.push({ marker: lab, prio: p.size === 'large' ? 2.5 : 0.5, text: p.name, cls: 'park', park: p });
    (p.gates || []).forEach(function (g) {
      L_.gates.addLayer(L.circleMarker([g[1], g[2]], { radius: 3, color: '#fff', weight: 1, fillColor: '#3f6438', fillOpacity: 1 })
        .bindTooltip(esc(g[0]) + ' — ' + esc(p.name) + ' <span style="color:#6c7078">(approx.)</span>', { className: 'atlas-tip' }));
    });
  });
  L_.parks.addTo(map);

  /* transport */
  var STATIONS = groupStations(window.ATLAS_STATIONS ? window.ATLAS_STATIONS.features : []);
  function groupStations(features) {
    var out = [];
    features.forEach(function (f) {
      var p = f.properties, ll = [f.geometry.coordinates[1], f.geometry.coordinates[0]];
      var hit = out.filter(function (s) { return s.name === p.name && dist(s.ll, ll) < 350; })[0];
      if (hit) { p.lines.forEach(function (l) { if (hit.lines.indexOf(l) < 0) hit.lines.push(l); }); }
      else out.push({ name: p.name, ll: ll, lines: p.lines.slice(), zone: p.zone });
    });
    out.forEach(function (s) { s.lines.sort(function (a, b) { return lineRank(a) - lineRank(b); }); });
    return out;
  }
  function lineRank(l) { var i = LINE_ORDER.indexOf(l); return i < 0 ? 99 : i; }
  var LINES = window.ATLAS_LINES ? window.ATLAS_LINES.features : [];
  var lineRenderer = L.svg({ pane: 'lines' });
  function drawTransport() {
    L_.transport.clearLayers(); L_.stations.clearLayers();
    var sel = {}; S.lines.forEach(function (l) { sel[l] = 1; });
    var z = map.getZoom(), w = z >= 15 ? 4 : z >= 13 ? 3 : 2;
    LINES.forEach(function (f) {
      var ls = f.properties.lines.filter(function (l) { return sel[l]; }).sort(function (a, b) { return lineRank(a) - lineRank(b); });
      if (!ls.length) return;
      var pts = f.geometry.coordinates.map(function (c) { return [c[1], c[0]]; });
      ls.forEach(function (l, i) {
        L_.transport.addLayer(L.polyline(pts, { renderer: lineRenderer, color: LINE_COLORS[l] || '#777', weight: w * (ls.length - i) * (ls.length > 1 ? .75 : 1), opacity: .9, interactive: false, lineCap: 'round' }));
      });
    });
    STATIONS.forEach(function (s) {
      var on = s.lines.filter(function (l) { return sel[l]; });
      if (!on.length) return;
      var m = L.circleMarker(s.ll, { pane: 'lines', radius: on.length > 1 ? 4.5 : 3.2, color: '#1e2023', weight: 1.3, fillColor: '#fff', fillOpacity: 1 });
      m.bindTooltip(esc(s.name) + '<br><span style="color:#6c7078">' + esc(s.lines.join(', ')) + '</span>', { className: 'atlas-tip' });
      m.on('click', function () { openStation(s); });
      L_.stations.addLayer(m);
      L_.stations.addLayer(L.marker(s.ll, { icon: divLabel('station-label', s.name), interactive: false, pane: 'lines' }));
    });
  }

  /* landmarks */
  LANDMARKS.forEach(function (l) {
    var m = L.circleMarker(l.ll, { radius: 3.5, color: '#4a4e55', weight: 1.2, fillColor: '#fff', fillOpacity: 1 });
    m.bindTooltip('<b>' + esc(l.name) + '</b><br>' + esc(l.note), { className: 'atlas-tip' });
    m.on('click', function () { openLandmark(l); });
    L_.landmarks.addLayer(m);
    L_.landmarks.addLayer(L.marker(l.ll, { icon: divLabel('lm-label', l.name), interactive: false }));
  });

  /* area character — only tags/zones with sources */
  AREAS.forEach(function (a) {
    (a.character || []).forEach(function (c, i) {
      if (!c.src || !c.src.length) return;
      var k = CHAR_KINDS[c.k]; if (!k) return;
      var ring = L.circle(a.ll, { radius: a.r + i * 40, color: k.color, weight: 2, opacity: .8, fill: false, dashArray: c.k === 'regen' ? '6 5' : null, pane: 'halos' });
      ring.bindTooltip('<b>' + esc(a.name) + '</b><br>' + esc(k.label) + '<br><span style="color:#6c7078">' + c.src.map(function (s) { return esc(srcObj(s).t); }).join('<br>') + '</span>', { className: 'atlas-tip', sticky: true });
      L_.character.addLayer(ring);
    });
  });
  PRESSURE.forEach(function (z) {
    if (!z.src || !z.src.length) return;
    var k = CHAR_KINDS[z.kind] || CHAR_KINDS.night;
    var c = L.circle(z.ll, { radius: z.r, color: k.color, weight: 1, opacity: .6, fillColor: k.color, fillOpacity: .1, dashArray: z.kind === 'seasonal' ? '3 4' : null, pane: 'halos' });
    c.bindTooltip('<b>' + esc(z.name) + '</b><br><span style="color:#6c7078">' + z.src.map(function (s) { return esc(srcObj(s).t); }).join('<br>') + '</span>', { className: 'atlas-tip', sticky: true });
    L_.character.addLayer(c);
  });

  /* main roads (approximate) */

  /* boroughs */
  OS.land.forEach(function (b) {
    L_.boroughs.addLayer(L.polygon(b.r, { color: '#6c7078', weight: 1.2, opacity: .7, dashArray: '5 4', fill: false, interactive: true })
      .bindTooltip(esc(b.n) + ' <span class="small">(borough; river excluded)</span>', { className: 'atlas-tip', sticky: true }));
  });

  /* offices — always on */
  var officeMarkers = {};
  function drawOffices() {
    L_.offices.clearLayers();
    OFFICE_DEFAULTS.forEach(function (o) {
      var st = S.offices[o.id];
      var icon = L.divIcon({ className: 'office-marker' + (st.approx ? ' approx' : ''), html: '<div><b>' + o.name[0] + '</b>' + esc(o.short) + '</div>', iconSize: [0, 0] });
      var m = L.marker(st.ll, { icon: icon, pane: 'labels', zIndexOffset: 1000, draggable: false, title: o.name + ' (office)' });
      m.on('click', function () { openOffice(o.id); });
      m.on('dragend', function () {
        var p = m.getLatLng(); S.offices[o.id].ll = [+p.lat.toFixed(6), +p.lng.toFixed(6)]; save();
        toast(o.name + ' moved. Commute lookups made before the move are flagged as stale.');
        rerender();
      });
      officeMarkers[o.id] = m; L_.offices.addLayer(m);
    });
  }
  drawOffices();
  L_.offices.addTo(map);

  /* my places & apartments */
  function drawMine() {
    L_.mine.clearLayers();
    S.apartments.forEach(function (a) {
      if (!a.ll || (a.archived && !S.showArchived)) return;
      var col = a.archived ? '#9a9a9a' : (STATUS_COLOR[a.status] || '#2e4a66');
      if (!a.precise) L_.mine.addLayer(L.circle(a.ll, { radius: 120, color: col, weight: 1, dashArray: '3 4', fillColor: col, fillOpacity: .06, interactive: false }));
      var m = L.circleMarker(a.ll, { radius: 7, color: '#fff', weight: 2, fillColor: col, fillOpacity: a.precise ? 1 : .55 });
      m.bindTooltip(esc(a.title || a.address || 'Apartment') + (blank(a.rent) ? '' : ' · ' + money(a.rent)) + (a.precise ? '' : ' <span style="color:#6c7078">(approximate pin)</span>'), { className: 'atlas-tip' });
      m.on('click', function () { openApartment(a.id); });
      L_.mine.addLayer(m);
    });
    S.places.forEach(function (p) {
      var m = L.circleMarker(p.ll, { radius: 5, color: '#fff', weight: 1.5, fillColor: '#4f5d75', fillOpacity: 1 });
      m.bindTooltip(esc(p.name), { className: 'atlas-tip' });
      m.on('click', function () { openPlace(p.id); });
      L_.mine.addLayer(m);
    });
  }
  drawMine();

  function applyLayers() {
    var on = S.layers;
    toggle(L_.areas, on.areas); toggle(L_.base, on.areas); toggle(L_.halos, on.areas);
    toggle(L_.transport, on.transport); toggle(L_.stations, on.transport && map.getZoom() >= 12);
    toggle(L_.landmarks, on.landmarks); toggle(L_.character, on.character); toggle(L_.roads, on.roads);
    toggle(L_.mine, on.mine); toggle(L_.boroughs, on.boroughs);
    toggle(L_.gates, map.getZoom() >= 15);
    $('#line-picker').hidden = !on.transport;
    $all('#layers input[data-layer]').forEach(function (i) { i.checked = !!on[i.dataset.layer]; });
    renderLegend();
    setTimeout(declutter, 0);
  }
  function toggle(layer, on) { if (on && !map.hasLayer(layer)) layer.addTo(map); else if (!on && map.hasLayer(layer)) map.removeLayer(layer); }

  /* label collision: greedy by priority */
  var FONT = { deep: [11, 13, 15, 18, 18], full: [0, 11, 13, 15, 15], base: [0, 0, 11, 13, 13], park: [0, 12, 12, 12, 12] };
  function declutter() {
    var z = Math.round(map.getZoom()), zi = Math.max(0, Math.min(4, z - 11));
    var boxes = OFFICE_DEFAULTS.map(function (o) {
      var p = map.latLngToContainerPoint(officeLL(o.id));
      return [p.x - 60, p.y - 14, p.x + 60, p.y + 14];
    });
    labelMarkers.slice().sort(function (a, b) { return bonus(b) - bonus(a); }).forEach(function (l) {
      var el = l.marker.getElement(); if (!el) return;
      var fs = FONT[l.cls] ? FONT[l.cls][zi] : 12;
      if (z >= 16) fs = 15;
      if (!fs) { el.classList.remove('hidden'); return; } /* CSS hides it at this zoom */
      var p = map.latLngToContainerPoint(l.marker.getLatLng());
      var w = l.text.length * fs * .56 + 6, h = fs * 1.35;
      var box = l.cls === 'park' ? [p.x - w / 2, p.y + 4, p.x + w / 2, p.y + 4 + h] : [p.x - w / 2, p.y - h / 2, p.x + w / 2, p.y + h / 2];
      var clash = boxes.some(function (b) { return !(box[2] < b[0] || box[0] > b[2] || box[3] < b[1] || box[1] > b[3]); });
      el.classList.toggle('hidden', clash);
      if (!clash) boxes.push(box);
    });
  }
  function bonus(l) {
    var b = l.prio;
    if (l.id && selected.kind === 'area' && selected.id === l.id) b += 10;
    if (l.id && S.shortlist.indexOf(l.id) >= 0) b += 5;
    return b;
  }

  map.on('zoomend', function () { zoomClass(); styleOS(); if (S.layers.transport) drawTransport(); applyLayers(); });
  map.on('moveend', function () { S.view = { center: [map.getCenter().lat, map.getCenter().lng], zoom: map.getZoom() }; save(); declutter(); });

  /* ================================================================ panel */
  var selected = { kind: null, id: null };
  var panelBody = $('#panel-body');
  function openPanel(html, sel) {
    if (selected.kind === 'area' && areaHalos[selected.id]) areaHalos[selected.id].setStyle({ fillOpacity: 0, stroke: false });
    selected = sel || { kind: null, id: null };
    panelBody.innerHTML = html;
    panelBody.scrollTop = 0;
    document.body.classList.add('panel-open');
    setTimeout(function () { map.invalidateSize(); }, 0);
    if (selected.kind === 'area' && areaHalos[selected.id]) areaHalos[selected.id].setStyle({ fillOpacity: .06, stroke: true, color: '#2e4a66', weight: 1.5, dashArray: '4 4', opacity: .7 });
    refreshAreaClasses(); declutter();
  }
  function closePanel() {
    if (selected.kind === 'area' && areaHalos[selected.id]) areaHalos[selected.id].setStyle({ fillOpacity: 0, stroke: false });
    selected = { kind: null, id: null };
    document.body.classList.remove('panel-open');
    $('#panel').classList.remove('expanded');
    setTimeout(function () { map.invalidateSize(); }, 0);
    refreshAreaClasses();
  }
  $('#panel-close').addEventListener('click', closePanel);
  $('.panel-grip').addEventListener('click', function () { $('#panel').classList.toggle('expanded'); });
  function rerender() {
    drawMine();
    var s = selected;
    if (!document.body.classList.contains('panel-open')) return;
    if (s.kind === 'area') openArea(s.id, true);
    else if (s.kind === 'apt') openApartment(s.id, true);
    else if (s.kind === 'office') openOffice(s.id);
    else if (s.kind === 'home') openHome();
    else if (s.kind === 'place') openPlace(s.id);
  }
  function flyTo(ll, z) { map.flyTo(ll, Math.max(map.getZoom(), z || 14), { duration: .5 }); }
  /* on phones the bottom sheet covers the lower half: keep the selection in the visible top part */
  function keepVisible(ll) {
    if (window.innerWidth > 760) return;
    var size = map.getSize(), p = map.latLngToContainerPoint(ll), target = L.point(size.x / 2, size.y * .22);
    map.panBy(p.subtract(target), { animate: true, duration: .3 });
  }

  /* ------------------------------------------------ sources */
  function sourcesHtml(ids, wiki) {
    var items = (ids || []).map(srcObj).filter(Boolean);
    (wiki || []).forEach(function (w) { items.push(WIKI(w[0], w[1])); });
    if (!items.length) return '<p class="small">No specific sources: this entry rests on general knowledge only — treat it as an impression and verify on the ground.</p>';
    return '<details class="sources"><summary>Sources (' + items.length + ')</summary>' + items.map(function (s) {
      return '<div class="source"><a href="' + esc(s.u) + '" target="_blank" rel="noopener">' + esc(s.t) + '</a>' +
        '<div class="meta">' + esc(s.kind) + ' · accessed ' + esc(ACCESSED) + '</div><div>' + esc(s.notes) + '</div></div>';
    }).join('') + '<p class="small">Interested parties (agents, landlords, business groups, political parties) are cited for what they report, not for overall judgements.</p></details>';
  }

  /* ------------------------------------------------ commute block */
  function commuteKey(kind, id) { return kind + ':' + id; }
  function commuteHtml(kind, id, ll, routes) {
    var key = commuteKey(kind, id), rec = S.commutes[key] || {};
    var origin = kind === 'area' ? 'from the neighbourhood’s centre point — a specific address can differ a lot' : 'from this pin';
    return OFFICE_DEFAULTS.map(function (o) {
      var oll = officeLL(o.id), r = rec[o.id] || {}, d = dist(ll, oll);
      var t = r.tfl, stale = t && t.office && (Math.abs(t.office[0] - oll[0]) > 1e-5 || Math.abs(t.office[1] - oll[1]) > 1e-5);
      var best = !blank(r.manual) ? +r.manual : t ? t.min : null;
      var verdict = best == null ? '' : best <= S.threshold ? '<span class="badge ok">within ' + S.threshold + ' min target</span>' : '<span class="badge warn">over ' + S.threshold + ' min target</span>';
      return '<div class="commute" data-office="' + o.id + '">' +
        '<div class="head"><span class="office">' + esc(o.name) + '</span><span class="dist">' + fmtDist(d) + ' straight-line</span></div>' +
        (routes && routes[o.id] ? '<div class="route">' + esc(routes[o.id]) + '</div>' : '') +
        (!blank(r.manual) ? '<div class="row"><span class="time">' + esc(r.manual) + ' min</span><span class="note">measured by you</span></div>' : '') +
        '<div class="row">' + (t ? '<span class="' + (blank(r.manual) ? 'time' : 'note') + '">' + t.min + ' min</span><span class="note">TfL, arriving 08:45 on ' + esc(t.forDate) + (stale ? ' · <b>office moved since</b>' : '') + '</span>' : (blank(r.manual) ? '<span class="note">No measured time yet.</span>' : '')) + '</div>' +
        (t && t.summary ? '<div class="note">' + esc(t.summary) + '</div>' : '') +
        '<div class="row">' + (HOSTED ? '' : '<button data-tfl="' + o.id + '">' + (t ? 'Re-check with TfL' : 'Look up with TfL') + '</button>') +
        '<a href="' + gmaps(ll, oll) + '" target="_blank" rel="noopener">Google Maps</a> · <a href="' + citymapper(ll, oll) + '" target="_blank" rel="noopener">Citymapper</a></div>' +
        '<div class="row"><label class="note">My measured time <input type="number" min="1" max="180" data-manual="' + o.id + '" value="' + (blank(r.manual) ? '' : esc(r.manual)) + '"> min</label>' + verdict + '</div>' +
        '</div>';
    }).join('') + '<p class="small">Times are door-to-door ' + origin + '. ' + (HOSTED ? 'This hosted copy cannot call TfL directly: open a planner link, then type the time in. (The local version in the repo can look it up for you.)' : 'TfL lookups run from your browser against the public TfL Journey Planner; if it is unreachable, use the links and type the time in.') + '</p>';
  }
  function gmaps(a, b) { return 'https://www.google.com/maps/dir/?api=1&origin=' + a[0] + ',' + a[1] + '&destination=' + b[0] + ',' + b[1] + '&travelmode=transit'; }
  function citymapper(a, b) { return 'https://citymapper.com/directions?startcoord=' + a[0] + ',' + a[1] + '&endcoord=' + b[0] + ',' + b[1]; }
  function wireCommute(root, kind, id, ll) {
    var key = commuteKey(kind, id);
    $all('[data-tfl]', root).forEach(function (b) {
      b.addEventListener('click', function () {
        var oid = b.dataset.tfl; b.disabled = true; b.textContent = 'Asking TfL…';
        tflJourney(ll, officeLL(oid)).then(function (res) {
          S.commutes[key] = S.commutes[key] || {}; S.commutes[key][oid] = S.commutes[key][oid] || {};
          S.commutes[key][oid].tfl = res; save(); rerender();
        }).catch(function (err) {
          b.disabled = false; b.textContent = 'Look up with TfL';
          toast('TfL lookup failed (' + err.message + '). Use the Google Maps / Citymapper links and enter the time manually.');
        });
      });
    });
    $all('[data-manual]', root).forEach(function (inp) {
      inp.addEventListener('change', function () {
        var oid = inp.dataset.manual, v = inp.value.trim();
        S.commutes[key] = S.commutes[key] || {}; S.commutes[key][oid] = S.commutes[key][oid] || {};
        S.commutes[key][oid].manual = v === '' ? null : Math.max(1, Math.round(+v)); save(); rerender();
      });
    });
  }
  function tflJourney(from, to) {
    var d = nextWeekday();
    var url = 'https://api.tfl.gov.uk/Journey/JourneyResults/' + from[0].toFixed(5) + ',' + from[1].toFixed(5) + '/to/' + to[0].toFixed(5) + ',' + to[1].toFixed(5) +
      '?date=' + ymd(d) + '&time=0845&timeIs=Arriving&journeyPreference=LeastTime';
    return fetch(url, { headers: { Accept: 'application/json' } }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (j) {
      var js = (j.journeys || []).slice().sort(function (a, b) { return a.duration - b.duration; });
      if (!js.length) throw new Error('no journeys returned');
      var best = js[0];
      var summary = (best.legs || []).map(function (l) {
        var mode = l.mode && l.mode.id;
        var name = mode === 'walking' ? 'walk' : (l.routeOptions && l.routeOptions[0] && l.routeOptions[0].name) || (l.mode && l.mode.name) || '';
        return name + ' ' + l.duration + 'm';
      }).join(' → ');
      return { min: best.duration, summary: summary, forDate: d.toDateString(), fetchedAt: new Date().toISOString(), office: to.slice() };
    });
  }
  function bestTime(kind, id, oid) {
    var r = (S.commutes[commuteKey(kind, id)] || {})[oid];
    if (!r) return null;
    if (!blank(r.manual)) return { min: +r.manual, src: 'measured by you' };
    if (r.tfl) return { min: r.tfl.min, src: 'TfL ' + r.tfl.forDate };
    return null;
  }

  /* ------------------------------------------------ station helpers */
  function dotsHtml(lines) { return '<span class="dots">' + lines.map(function (l) { return '<i title="' + esc(l) + '" style="background:' + (LINE_COLORS[l] || '#888') + '"></i>'; }).join('') + '</span>'; }
  function stationByName(n) { return STATIONS.filter(function (s) { return s.name === n; }); }
  function nearestStations(ll, n) {
    return STATIONS.map(function (s) { return { s: s, d: dist(ll, s.ll) }; }).sort(function (a, b) { return a.d - b.d; }).slice(0, n || 4);
  }
  function wireStationChips(root) {
    $all('[data-station]', root).forEach(function (c) {
      c.addEventListener('click', function () {
        var s = STATIONS[+c.dataset.station]; if (!s) return;
        if (!S.layers.transport) { S.layers.transport = true; save(); drawTransport(); applyLayers(); }
        flyTo(s.ll, 15);
      });
    });
  }
  function stationChip(s, extra) { return '<span class="station-chip" data-station="' + STATIONS.indexOf(s) + '">' + dotsHtml(s.lines) + esc(s.name) + (extra ? ' <span class="small">' + extra + '</span>' : '') + '</span>'; }

  /* ------------------------------------------------ area panel */
  function list(arr) { return arr && arr.length ? '<ul>' + arr.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : ''; }
  function openArea(id, keepScroll) {
    var a = AREA_BY_ID[id]; if (!a) return;
    var y = panelBody.scrollTop;
    var inList = S.shortlist.indexOf(id) >= 0;
    var st = [];
    a.stations.forEach(function (n) { stationByName(n).forEach(function (s) { if (st.indexOf(s) < 0) st.push(s); }); });
    var charTags = (a.character || []).filter(function (c) { return c.src && c.src.length && CHAR_KINDS[c.k]; })
      .map(function (c) { return '<span class="badge" style="border-color:' + CHAR_KINDS[c.k].color + ';color:' + CHAR_KINDS[c.k].color + '">' + esc(CHAR_KINDS[c.k].label) + '</span>'; }).join('');
    var html =
      '<h1>' + esc(a.name) + '</h1>' +
      '<div class="sub">' + (a.aka ? esc(a.aka) + ' · ' : '') + esc(a.borough) + '</div>' +
      '<div class="badges"><span class="badge ' + (a.depth === 'deep' ? 'deep' : '') + '">' + (a.depth === 'deep' ? 'Researched in depth' : 'Full entry') + '</span>' + charTags + '</div>' +
      '<div class="actions"><button class="' + (inList ? '' : 'primary') + '" id="btn-shortlist">' + (inList ? 'Remove from shortlist' : 'Add to shortlist') + '</button>' +
      (S.shortlist.length ? '<button id="btn-cmp-areas">Compare shortlist (' + S.shortlist.length + ')</button>' : '') + '</div>' +
      '<h2>At a glance</h2><p class="glance">' + esc(a.glance) + '</p>' +
      '<h2>Within the area</h2>' + list(a.within) +
      '<h2>Everyday life</h2><p>' + esc(a.everyday) + '</p><h3>Drawbacks</h3>' + list(a.drawbacks) +
      '<h2>Connections</h2><p>' + esc(a.connections) + '</p>' +
      (st.length ? '<div class="stations">' + st.map(function (s) { return stationChip(s); }).join('') + '</div>' : '') +
      '<h3>Where this description stops applying</h3><p>' + esc(a.edges) + '</p>' +
      '<h2>Fit for us</h2><dl class="fit"><dt>Strengths</dt><dd>' + esc(a.fit.strengths) + '</dd><dt>Trade-offs</dt><dd>' + esc(a.fit.tradeoffs) + '</dd>' +
      (a.fit.unknowns ? '<dt>Unknowns</dt><dd>' + esc(a.fit.unknowns) + '</dd>' : '') + '</dl>' +
      '<dl class="kv"><dt>Parks</dt><dd>' + esc(a.cmp.parks) + '</dd><dt>Cafés & pubs</dt><dd>' + esc(a.cmp.cafes) + '</dd><dt>Housing stock</dt><dd>' + esc(a.cmp.stock) + '</dd><dt>Budget evidence</dt><dd>' + esc(a.cmp.budget) + '</dd></dl>' +
      '<h2>Commute</h2>' + commuteHtml('area', a.id, a.ll, a.route) +
      '<h2>Our notes</h2><textarea id="area-note" placeholder="Impressions from a visit, streets to check…">' + esc(S.areaNotes[a.id] || '') + '</textarea>' +
      '<h2>Evidence</h2><div class="evidence"><div><b>Backed by sources:</b> ' + esc(a.evidence.verified || 'nothing specific') + '</div><div><b>Impression / local knowledge:</b> ' + esc(a.evidence.impression || '—') + '</div></div>' +
      sourcesHtml(a.src, a.wiki);
    openPanel(html, { kind: 'area', id: id });
    if (keepScroll) panelBody.scrollTop = y; else setTimeout(function () { keepVisible(a.ll); }, 0);
    $('#btn-shortlist').addEventListener('click', function () {
      var i = S.shortlist.indexOf(id);
      if (i >= 0) S.shortlist.splice(i, 1); else S.shortlist.push(id);
      save(); openArea(id, true);
    });
    var bc = $('#btn-cmp-areas'); if (bc) bc.addEventListener('click', compareAreas);
    $('#area-note').addEventListener('input', function (e) { S.areaNotes[id] = e.target.value; save(); });
    wireCommute(panelBody, 'area', a.id, a.ll);
    wireStationChips(panelBody);
  }

  function openBase(p) {
    var near = AREAS.map(function (a) { return { a: a, d: dist(p.ll, a.ll) }; }).sort(function (x, y) { return x.d - y.d; })[0];
    openPanel('<h1>' + esc(p.name) + '</h1><div class="badges"><span class="badge base">Base map only</span></div>' +
      '<p>No researched entry. Shown for orientation so the map reads as a whole city; it is outside the core coverage or did not fit the brief closely enough to research in depth.</p>' +
      '<p class="small">Nearest researched entry: <button class="link" id="near-a">' + esc(near.a.name) + '</button> (' + fmtDist(near.d) + ').</p>', { kind: 'base', id: p.name });
    $('#near-a').addEventListener('click', function () { openArea(near.a.id); flyTo(near.a.ll, 14); });
  }

  /* ------------------------------------------------ park / landmark / station / office */
  function openPark(id) {
    var p = PARKS.filter(function (x) { return x.id === id; })[0]; if (!p) return;
    var acc = p.access === 'public' ? '<span class="badge public">Public</span>' : p.access === 'private' ? '<span class="badge private">Private — keyholders only</span>' : '<span class="badge warn">Restricted access</span>';
    openPanel('<h1>' + esc(p.name) + '</h1><div class="badges">' + acc + (p.approx ? '<span class="badge">position approximate</span>' : '') + '</div>' +
      (p.hours ? '<p><b>Hours:</b> ' + esc(p.hours) + '</p>' : '') + '<p>' + esc(p.note) + '</p>' +
      (p.gates && p.gates.length ? '<h3>Entrances (approximate positions)</h3><ul>' + p.gates.map(function (g) { return '<li>' + esc(g[0]) + '</li>'; }).join('') + '</ul><p class="small">Gates appear on the map from zoom 15.</p>' : '') +
      '<p class="small">The park outline is drawn by the base map; this marker carries the access facts.</p>' + sourcesHtml(p.src, []), { kind: 'park', id: id });
  }
  function curatedFor(name) {
    var n = norm(name).replace(/^the /, '');
    return PARKS.filter(function (p) { return p.access !== 'private' && norm(p.name).replace(/^the /, '') === n; })[0] || null;
  }
  function openGreen(g) {
    var c = curatedFor(g.n);
    if (c) { openPark(c.id); return; }
    openPanel('<h1>' + esc(g.n || 'Public park or garden') + '</h1><div class="badges"><span class="badge public">Public park or garden</span><span class="badge">' + g.ha + ' ha</span></div>' +
      '<p>' + (g.ha >= 20 ? 'Big enough for a proper run.' : g.ha >= 4 ? 'Good for short loops and a walk.' : 'A local green space: for sitting, not running.') + '</p>' +
      (g.osName ? '<p class="small">OS calls this piece “' + esc(g.osName) + '”.</p>' : '') +
      '<p class="small">Outline and name from OS Open Greenspace (public parks and gardens only; private squares, cemeteries and sports grounds are not in this set). Opening hours are not in the data — check the borough’s page.</p>', { kind: 'green', id: g.n });
  }
  function openLandmark(l) {
    openPanel('<h1>' + esc(l.name) + '</h1><div class="badges"><span class="badge">Landmark</span></div><p>' + esc(l.note) + '</p>', { kind: 'landmark', id: l.name });
  }
  function openStation(s) {
    var near = AREAS.map(function (a) { return { a: a, d: dist(s.ll, a.ll) }; }).sort(function (x, y) { return x.d - y.d; }).slice(0, 3);
    openPanel('<h1>' + esc(s.name) + '</h1><div class="sub">' + (s.zone ? 'Zone ' + esc(s.zone) : '') + '</div>' +
      '<div class="stations">' + s.lines.map(function (l) { return '<span class="station-chip">' + dotsHtml([l]) + esc(l) + '</span>'; }).join('') + '</div>' +
      '<h3>Nearby entries</h3><ul>' + near.map(function (n) { return '<li><button class="link" data-area="' + n.a.id + '">' + esc(n.a.name) + '</button> <span class="small">' + fmtDist(n.d) + '</span></li>'; }).join('') + '</ul>' +
      '<p class="small">Station and line data: OpenStreetMap-derived TfL dataset (oobrien/vis), filtered to 2026 services. Overground lines carry their pre-2024 single name in this data.</p>', { kind: 'station', id: s.name });
    $all('[data-area]', panelBody).forEach(function (b) { b.addEventListener('click', function () { openArea(b.dataset.area); }); });
  }
  function openOffice(id) {
    var o = OFFICE_DEFAULTS.filter(function (x) { return x.id === id; })[0], st = S.offices[id];
    var dragging = officeMarkers[id].dragging && officeMarkers[id].dragging.enabled();
    openPanel('<h1>' + esc(o.name) + '</h1><div class="badges"><span class="badge">Office</span>' + (st.approx ? '<span class="badge warn">approximate position</span>' : '<span class="badge ok">entrance set</span>') + '</div>' +
      '<p>' + esc(o.note) + '</p><dl class="kv"><dt>Position</dt><dd>' + st.ll[0].toFixed(5) + ', ' + st.ll[1].toFixed(5) + '</dd></dl>' +
      '<div class="actions"><button id="btn-drag" class="' + (dragging ? 'primary' : '') + '">' + (dragging ? 'Done moving' : 'Move marker to entrance') + '</button>' +
      '<label class="check"><input type="checkbox" id="chk-exact"' + (st.approx ? '' : ' checked') + '> This is the exact entrance</label>' +
      '<button id="btn-reset-office" class="ghost">Reset to default</button></div>' +
      '<p class="small">Straight-line distances and new TfL lookups use this position. Earlier lookups are flagged if the office moves.</p>', { kind: 'office', id: id });
    $('#btn-drag').addEventListener('click', function () {
      var m = officeMarkers[id];
      if (m.dragging.enabled()) m.dragging.disable(); else { m.dragging.enable(); toast('Drag the ' + o.short + ' marker to the entrance.'); }
      openOffice(id);
    });
    $('#chk-exact').addEventListener('change', function (e) { S.offices[id].approx = !e.target.checked; save(); drawOffices(); openOffice(id); });
    $('#btn-reset-office').addEventListener('click', function () { S.offices[id] = { ll: o.ll.slice(), approx: true }; save(); drawOffices(); rerender(); openOffice(id); });
  }

  /* ------------------------------------------------ pin analysis */
  function analyse(ll) {
    var out = {};
    var areas = AREAS.map(function (a) { return { a: a, d: dist(ll, a.ll) }; }).sort(function (x, y) { return x.d / x.a.r - y.d / y.a.r; });
    out.area = areas[0].d <= areas[0].a.r * 1.4 ? areas[0] : null;
    out.nearestArea = areas.slice().sort(function (x, y) { return x.d - y.d; })[0];
    out.stations = nearestStations(ll, 4);
    out.publicParks = [];
    PARKS.filter(function (p) { return p.access === 'public'; }).forEach(function (p) {
      var pts = (p.gates && p.gates.length) ? p.gates.map(function (g) { return { name: g[0], ll: [g[1], g[2]] }; }) : [{ name: 'marker (centre)', ll: p.ll }];
      var best = pts.map(function (g) { return { g: g, d: dist(ll, g.ll) }; }).sort(function (x, y) { return x.d - y.d; })[0];
      out.publicParks.push({ p: p, gate: best.g, d: best.d });
    });
    out.publicParks.sort(function (x, y) { return x.d - y.d; });
    out.publicParks = out.publicParks.filter(function (x, i) { return i < 3 || (x.p.size === 'large' && x.d < 2500); }).slice(0, 5);
    out.privateSquares = PARKS.filter(function (p) { return p.access === 'private' && dist(ll, p.ll) < 350; });
    var roads = {};
    OS.roads.forEach(function (r) {
      var b = r.p[0]; if (Math.abs(b[0] - ll[0]) > .02 || Math.abs(b[1] - ll[1]) > .03) return; /* cheap prefilter */
      var d = distToLine(ll, r.p); if (d > 150) return;
      var key = r.no || r.n || 'A road';
      if (!roads[key] || d < roads[key].d) roads[key] = { name: [r.no, r.n].filter(Boolean).join(' · ') || 'A road', motorway: r.m, d: d };
    });
    out.roads = Object.keys(roads).map(function (k) { return roads[k]; }).sort(function (a, b) { return a.d - b.d; }).slice(0, 4);
    out.greens = OS.green.map(function (g) { return { g: g, d: distToPoly(ll, g.r) }; }).sort(function (a, b) { return a.d - b.d; });
    out.nearGreen = out.greens.filter(function (x) { return x.g.ha >= 1; }).slice(0, 3);
    out.bigGreen = out.greens.filter(function (x) { return x.g.ha >= 20; })[0] || null;
    var lines = {};
    LINES.forEach(function (f) {
      var ls = f.properties.lines.filter(function (l) { return SURFACE_LINES[l]; });
      if (!ls.length) return;
      var d = distToLine(ll, f.geometry.coordinates.map(function (c) { return [c[1], c[0]]; }));
      if (d < 150) ls.forEach(function (l) { if (!lines[l] || d < lines[l]) lines[l] = d; });
    });
    out.rail = Object.keys(lines).map(function (l) { return { l: l, d: lines[l] }; }).sort(function (a, b) { return a.d - b.d; });
    out.pressure = PRESSURE.map(function (z) { return { z: z, d: dist(ll, z.ll) }; }).filter(function (x) { return x.d < x.z.r + 300; }).sort(function (a, b) { return a.d - b.d; });
    return out;
  }
  function analysisHtml(an, precise) {
    var h = '';
    if (!precise) h += '<p><span class="badge warn">Approximate pin</span> Everything below is relative to an approximate point. Confirm the exact building before relying on it.</p>';
    h += '<h3>Neighbourhood</h3><p>' + (an.area ? 'Within <button class="link" data-area="' + an.area.a.id + '">' + esc(an.area.a.name) + '</button>' + (an.area.d > an.area.a.r ? ' (towards its edge — read “where this stops applying”)' : '')
      : 'Not inside a researched entry. Nearest: <button class="link" data-area="' + an.nearestArea.a.id + '">' + esc(an.nearestArea.a.name) + '</button> (' + fmtDist(an.nearestArea.d) + ').') + '</p>';
    h += '<h3>Nearest stations (straight-line)</h3><div class="stations">' + an.stations.map(function (x) { return stationChip(x.s, fmtDist(x.d)); }).join('') + '</div>';
    h += '<h3>Nearest public green space (to its edge, straight-line)</h3><ul>' + an.nearGreen.map(function (x) {
      return '<li>' + esc(x.g.n || 'Public park or garden') + ' <span class="small">' + x.g.ha + ' ha</span> — ' + (x.d === 0 ? 'the pin is inside it' : fmtDist(x.d)) + '</li>';
    }).join('') + '</ul>' + (an.bigGreen ? '<p class="small">Nearest park of 20 ha or more (room for a proper run): <b>' + esc(an.bigGreen.g.n) + '</b>, ' + fmtDist(an.bigGreen.d) + ' to its edge.</p>' : '');
    h += '<h3>Royal Parks and big-park gates (straight-line)</h3><ul>' + an.publicParks.map(function (x) {
      return '<li><button class="link" data-park="' + x.p.id + '">' + esc(x.p.name) + '</button> — ' + esc(x.gate.name) + ', ' + fmtDist(x.d) + '</li>';
    }).join('') + '</ul>';
    if (an.privateSquares.length) h += '<p class="small">Private garden squares nearby: ' + an.privateSquares.map(function (p) { return esc(p.name); }).join(', ') + ' — keys only if the lease includes one.</p>';
    h += '<h3>A roads and motorways within 150 m</h3>' + (an.roads.length ? '<ul>' + an.roads.map(function (x) { return '<li>' + esc(x.name) + ' — about ' + fmtDist(x.d) + '</li>'; }).join('') + '</ul><p class="small">Measured to the road centreline (OS Open Roads). B roads and busy unclassified streets are not included.</p>' : '<p class="small">No A road or motorway within 150 m (OS Open Roads). B roads and busy side streets are not included.</p>');
    h += '<h3>Surface-capable rail within ~150 m</h3>' + (an.rail.length ? '<ul>' + an.rail.map(function (x) { return '<li>' + dotsHtml([x.l]) + ' ' + esc(x.l) + ' — about ' + fmtDist(x.d) + '</li>'; }).join('') + '</ul><p class="small">These lines run on the surface or in shallow cuttings in parts of inner London, but may be in tunnel here — the data does not say. Main-line National Rail tracks are not in this dataset.</p>' : '<p class="small">None in the dataset (deep-level Tube lines and National Rail are not counted).</p>');
    h += '<h3>Crowd, night-time and event pressure</h3>' + (an.pressure.length ? '<ul>' + an.pressure.map(function (x) {
      return '<li>' + esc(x.z.name) + ' — ' + (x.d < x.z.r ? 'inside the mapped zone' : fmtDist(x.d - x.z.r) + ' beyond its edge') + (x.z.src.length ? '' : ' <span class="small">(' + esc(x.z.basis) + ')</span>') + '</li>';
    }).join('') + '</ul>' : '<p class="small">None of the mapped zones.</p>');
    h += '<p class="small">Map proximity says nothing reliable about indoor noise, light or safety. Those need a visit at different times of day.</p>';
    return h;
  }
  function viewingQuestions(apt, an) {
    var q = [
      ['addr', 'Exact address and flat number confirmed (and pin updated to “precise”)'],
      ['epc', 'EPC rating and heating type; ask for typical winter energy bills'],
      ['ctax', 'Council tax band (check on the VOA site)'],
      ['damp', 'Signs of damp or mould: window reveals, bathroom ceiling, behind wardrobes'],
      ['glazing', 'Window type: single, secondary or double glazing — and which rooms face the street'],
      ['sound', 'Sound between floors: ask what is above and below; visit when neighbours are home'],
      ['water', 'Water pressure and hot water (run the shower)'],
      ['signal', 'Mobile signal indoors and broadband options/speeds'],
      ['bins', 'Bin store, deliveries/parcel handling, bike storage'],
      ['costs', 'What the rent includes (service charge, water, internet) and the deposit (capped at 5 weeks’ rent where annual rent is under £50k, 6 weeks above)'],
      ['rra', 'Tenancy terms under the Renters’ Rights Act (since 1 May 2026: periodic tenancy, no bidding above the advertised rent, advance rent capped at one month)'],
      ['furn', 'Furnished/unfurnished: what exactly stays, and its condition']
    ];
    if (blank(apt.lift) || apt.lift === 'no') q.push(['lift', 'Floor and stairs: is there a lift? How are deliveries and furniture brought up?']);
    if (an.roads.length) q.push(['road', 'Which rooms face ' + an.roads[0].name + '? Visit at rush hour with windows open and closed']);
    if (an.rail.length) q.push(['rail', 'Is the ' + an.rail[0].l + ' on the surface near here? Listen for trains (and vibration) during the viewing']);
    if (an.pressure.some(function (x) { return x.z.kind === 'night' || x.z.kind === 'street'; })) q.push(['night', 'Walk the street on a Friday or Saturday around 11pm, and ask the agent about late-night noise']);
    if (an.pressure.some(function (x) { return x.z.kind === 'seasonal'; })) q.push(['event', 'Ask how the building copes on event days (' + an.pressure.filter(function (x) { return x.z.kind === 'seasonal'; }).map(function (x) { return x.z.name.split(' (')[0]; }).join('; ') + ')']);
    if (an.privateSquares.length) q.push(['key', 'Does the tenancy include a key to ' + an.privateSquares[0].name + '? Annual fee?']);
    q.push(['light', 'Daylight: visit once in the afternoon; which way do the main rooms face?']);
    return q;
  }

  /* ------------------------------------------------ apartments */
  function aptById(id) { return S.apartments.filter(function (a) { return a.id === id; })[0]; }
  function openApartment(id, keepScroll) {
    var a = aptById(id); if (!a) return;
    var y = panelBody.scrollTop;
    var an = a.ll ? analyse(a.ll) : null;
    var checks = a.checks || {};
    var html = '<h1>' + esc(a.title || a.address || 'Apartment') + '</h1>' +
      '<div class="sub">' + (a.title && a.address ? esc(a.address) : '') + '</div>' +
      '<div class="badges"><span class="badge" style="border-color:' + (STATUS_COLOR[a.status] || '#ccc') + '">' + esc(a.status || 'interested') + '</span>' +
      (a.ll ? (a.precise ? '<span class="badge ok">precise pin</span>' : '<span class="badge warn">approximate pin</span>') : '<span class="badge warn">no pin yet</span>') +
      (a.archived ? '<span class="badge">archived</span>' : '') + '</div>' +
      '<div class="actions"><button id="apt-edit" class="primary">Edit</button>' +
      '<button id="apt-cmp">' + (S.compareApts.indexOf(id) >= 0 ? 'Remove from comparison' : 'Add to comparison') + '</button>' +
      '<button id="apt-arch">' + (a.archived ? 'Unarchive' : 'Archive') + '</button></div>' +
      '<dl class="kv"><dt>Rent</dt><dd>' + show(a.rent, function (v) { return money(v) + ' / month'; }) + '</dd>' +
      '<dt>Bedrooms</dt><dd>' + show(a.beds) + '</dd><dt>Furnished</dt><dd>' + show(a.furnished) + '</dd>' +
      '<dt>Floor</dt><dd>' + show(a.floor) + '</dd><dt>Lift</dt><dd>' + show(a.lift) + '</dd>' +
      '<dt>Outdoor space</dt><dd>' + show(a.outdoor) + '</dd><dt>Size</dt><dd>' + show(a.size) + '</dd>' +
      '<dt>Listing</dt><dd>' + (a.url ? '<a href="' + esc(safeUrl(a.url)) + '" target="_blank" rel="noopener">' + esc(a.url.replace(/^https?:\/\//, '').slice(0, 40)) + '</a>' : show('')) + '</dd>' +
      '<dt>Last checked</dt><dd>' + show(a.checked) + '</dd></dl>' +
      (a.notes ? '<h3>Listing notes</h3><p>' + esc(a.notes) + '</p>' : '') +
      (a.personal ? '<h3>Our notes</h3><p>' + esc(a.personal) + '</p>' : '');
    if (a.ll) {
      html += '<h2>Commute</h2>' + commuteHtml('apt', a.id, a.ll, null);
      html += '<h2>Around this pin</h2>' + analysisHtml(an, a.precise);
      html += '<h2>Questions for the viewing</h2><ul class="checklist">' + viewingQuestions(a, an).map(function (q) {
        return '<li><label><input type="checkbox" data-q="' + q[0] + '"' + (checks[q[0]] ? ' checked' : '') + '> <span>' + esc(q[1]) + '</span></label></li>';
      }).join('') + '</ul>' + sourcesHtml(['rra_rbkc', 'rra_gowling', 'police_uk'], []);
    } else {
      html += '<p>Place a pin to get commutes and the neighbourhood read-out: <button id="apt-pin" class="primary">Click the map to place pin</button></p>';
    }
    html += '<p class="small" style="margin-top:16px"><button class="link danger" id="apt-del">Delete this apartment</button></p>';
    openPanel(html, { kind: 'apt', id: id });
    if (keepScroll) panelBody.scrollTop = y; else if (a.ll) setTimeout(function () { keepVisible(a.ll); }, 0);
    $('#apt-edit').addEventListener('click', function () { aptForm(a); });
    $('#apt-cmp').addEventListener('click', function () {
      var i = S.compareApts.indexOf(id); if (i >= 0) S.compareApts.splice(i, 1); else S.compareApts.push(id); save(); openApartment(id, true);
    });
    $('#apt-arch').addEventListener('click', function () { a.archived = !a.archived; save(); drawMine(); openApartment(id, true); });
    $('#apt-del').addEventListener('click', function (e) {
      var b = e.currentTarget;
      if (!b.dataset.armed) { b.dataset.armed = '1'; b.textContent = 'Click again to delete permanently (Archive keeps it)'; return; }
      S.apartments = S.apartments.filter(function (x) { return x.id !== id; });
      S.compareApts = S.compareApts.filter(function (x) { return x !== id; });
      delete S.commutes[commuteKey('apt', id)]; save(); drawMine(); openHome();
    });
    var pinBtn = $('#apt-pin'); if (pinBtn) pinBtn.addEventListener('click', function () { startPlacing(id); });
    $all('[data-q]', panelBody).forEach(function (c) { c.addEventListener('change', function () { a.checks = a.checks || {}; a.checks[c.dataset.q] = c.checked; save(); }); });
    $all('[data-area]', panelBody).forEach(function (b) { b.addEventListener('click', function () { openArea(b.dataset.area); }); });
    $all('[data-park]', panelBody).forEach(function (b) { b.addEventListener('click', function () { openPark(b.dataset.park); }); });
    if (a.ll) wireCommute(panelBody, 'apt', a.id, a.ll);
    wireStationChips(panelBody);
  }
  function safeUrl(u) { return /^https?:\/\//i.test(u) ? u : 'https://' + u; }

  function aptForm(a, presetLL) {
    var isNew = !a;
    a = a || { id: uid(), status: 'interested', precise: false, ll: presetLL || null, created: today() };
    function sel(name, opts, val) { return '<select name="' + name + '"><option value="">—</option>' + opts.map(function (o) { return '<option' + (o === val ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('') + '</select>'; }
    var html = '<h1>' + (isNew ? 'Add apartment' : 'Edit apartment') + '</h1>' +
      '<p class="small">Leave anything you don’t know blank — blanks stay blank everywhere.</p>' +
      '<form id="aptf" class="form">' +
      '<label class="full">Listing URL<input type="url" name="url" value="' + esc(a.url || '') + '" placeholder="https://"></label>' +
      '<label class="full">Address<input type="text" name="address" value="' + esc(a.address || '') + '" placeholder="Street, postcode"></label>' +
      '<label class="full">Short name (optional)<input type="text" name="title" value="' + esc(a.title || '') + '"></label>' +
      '<label>Rent £/month<input type="number" name="rent" min="0" step="25" value="' + esc(blank(a.rent) ? '' : a.rent) + '"></label>' +
      '<label>Bedrooms<input type="number" name="beds" min="0" max="6" value="' + esc(blank(a.beds) ? '' : a.beds) + '"></label>' +
      '<label>Furnished' + sel('furnished', ['furnished', 'unfurnished', 'part-furnished', 'either'], a.furnished) + '</label>' +
      '<label>Floor<input type="text" name="floor" value="' + esc(a.floor || '') + '" placeholder="e.g. 3rd of 5, lower ground"></label>' +
      '<label>Lift' + sel('lift', ['yes', 'no'], a.lift) + '</label>' +
      '<label>Size<input type="text" name="size" value="' + esc(a.size || '') + '" placeholder="e.g. 62 m²"></label>' +
      '<label class="full">Outdoor space<input type="text" name="outdoor" value="' + esc(a.outdoor || '') + '" placeholder="balcony, terrace, communal garden…"></label>' +
      '<label>Viewing status' + sel('status', STATUS, a.status) + '</label>' +
      '<label>Last checked<input type="date" name="checked" value="' + esc(a.checked || '') + '"></label>' +
      '<label class="full">Listing notes<textarea name="notes">' + esc(a.notes || '') + '</textarea></label>' +
      '<label class="full">Our notes<textarea name="personal">' + esc(a.personal || '') + '</textarea></label>' +
      '<div class="full" style="grid-column:1/-1"><h3>Pin</h3><p class="small" id="pin-state">' + (a.ll ? 'Pinned at ' + a.ll[0].toFixed(5) + ', ' + a.ll[1].toFixed(5) : 'Not pinned yet.') + '</p>' +
      '<div class="actions"><button type="button" id="f-pin">Click map to place</button></div>' +
      (HOSTED ? '' : '<div class="actions"><input type="text" id="f-pcin" placeholder="Postcode" style="width:9em"><button type="button" id="f-pc">Locate postcode</button></div>') +
      '<label class="check"><input type="checkbox" name="precise"' + (a.precise ? ' checked' : '') + '> Precise pin (on the actual building)</label>' +
      (HOSTED ? '' : '<p class="small">Postcode lookup uses postcodes.io and gives the postcode centre — always approximate.</p>') + '</div>' +
      '<div class="actions full" style="grid-column:1/-1"><button type="submit" class="primary">Save</button><button type="button" id="f-cancel">Cancel</button></div>' +
      '</form>';
    openPanel(html, { kind: 'aptform', id: a.id });
    var f = $('#aptf');
    var draft = a;
    function read() {
      var fd = new FormData(f);
      ['url', 'address', 'title', 'furnished', 'floor', 'lift', 'size', 'outdoor', 'status', 'checked', 'notes', 'personal'].forEach(function (k) { draft[k] = (fd.get(k) || '').trim(); });
      ['rent', 'beds'].forEach(function (k) { var v = (fd.get(k) || '').trim(); draft[k] = v === '' ? null : +v; });
      draft.precise = !!fd.get('precise');
      if (!draft.status) draft.status = 'interested';
    }
    f.addEventListener('submit', function (e) {
      e.preventDefault(); read();
      if (isNew) S.apartments.push(draft);
      if (!draft.checked) draft.checked = today();
      save(); drawMine(); openApartment(draft.id);
      if (draft.ll) flyTo(draft.ll, 15);
    });
    $('#f-cancel').addEventListener('click', function () { if (isNew) openHome(); else openApartment(a.id); });
    $('#f-pin').addEventListener('click', function () { read(); startPlacing(null, function (ll) { draft.ll = ll; $('#pin-state').textContent = 'Pinned at ' + ll[0].toFixed(5) + ', ' + ll[1].toFixed(5) + ' — remember to save.'; }); });
    var pcBtn = $('#f-pc');
    if (pcBtn) pcBtn.addEventListener('click', function () {
      var m = (f.address.value.match(/[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}/i) || [])[0];
      var pc = $('#f-pcin').value.trim() || m;
      if (!pc) { toast('Type a postcode first.'); return; }
      fetch('https://api.postcodes.io/postcodes/' + encodeURIComponent(pc.trim())).then(function (r) { return r.json(); }).then(function (j) {
        if (!j.result) throw new Error(j.error || 'not found');
        draft.ll = [j.result.latitude, j.result.longitude]; f.precise.checked = false;
        $('#pin-state').textContent = 'Postcode centre for ' + j.result.postcode + ' (approximate) — remember to save.';
        flyTo(draft.ll, 16);
      }).catch(function (e) { toast('Postcode lookup failed: ' + e.message + '. Place the pin by clicking the map instead.'); });
    });
  }
  var placing = null;
  function startPlacing(aptId, cb) {
    placing = { aptId: aptId, cb: cb };
    map.getContainer().style.cursor = 'crosshair';
    toast('Click the map where the apartment is.');
    if (window.innerWidth < 760) $('#panel').classList.remove('expanded');
  }

  /* ------------------------------------------------ personal places */
  function openPlace(id) {
    var p = S.places.filter(function (x) { return x.id === id; })[0]; if (!p) return;
    openPanel('<h1>' + esc(p.name) + '</h1><div class="badges"><span class="badge">My place</span></div>' +
      '<label class="small">Name<input type="text" id="pl-name" value="' + esc(p.name) + '"></label>' +
      '<label class="small">Notes<textarea id="pl-note">' + esc(p.note || '') + '</textarea></label>' +
      '<h2>Commute</h2>' + commuteHtml('place', p.id, p.ll, null) +
      '<p><button class="link" id="pl-del">Delete place</button></p>', { kind: 'place', id: id });
    $('#pl-name').addEventListener('change', function (e) { p.name = e.target.value.trim() || p.name; save(); drawMine(); });
    $('#pl-note').addEventListener('input', function (e) { p.note = e.target.value; save(); });
    $('#pl-del').addEventListener('click', function () { S.places = S.places.filter(function (x) { return x.id !== id; }); save(); drawMine(); closePanel(); });
    wireCommute(panelBody, 'place', p.id, p.ll);
  }

  /* ------------------------------------------------ home (housing) dashboard */
  function openHome() {
    var tab = S.homeTab || 'shortlist';
    var tabs = '<div class="tabs" role="tablist">' + [['shortlist', 'Area shortlist (' + S.shortlist.length + ')'], ['apts', 'Apartments (' + S.apartments.filter(function (a) { return !a.archived; }).length + ')'], ['places', 'My places']].map(function (t) {
      return '<button role="tab" data-tab="' + t[0] + '" aria-selected="' + (tab === t[0]) + '">' + t[1] + '</button>';
    }).join('') + '</div>';
    var body = '';
    if (tab === 'shortlist') {
      body += S.shortlist.length ? '<ul class="list">' + S.shortlist.map(function (id) {
        var a = AREA_BY_ID[id]; if (!a) return '';
        var p = bestTime('area', id, 'portman'), b = bestTime('area', id, 'bressenden');
        return '<li><div class="grow"><div class="title" data-area="' + id + '">' + esc(a.name) + '</div><div class="small">' + esc(a.borough) + ' · Portman ' + (p ? p.min + ' min' : fmtDist(dist(a.ll, officeLL('portman'))) + ' straight-line') + ' · Bressenden ' + (b ? b.min + ' min' : fmtDist(dist(a.ll, officeLL('bressenden'))) + ' straight-line') + '</div></div><button class="ghost" data-unlist="' + id + '" aria-label="Remove">×</button></li>';
      }).join('') + '</ul><div class="actions"><button class="primary" id="h-cmp">Compare shortlisted areas</button></div>'
        : '<p>No areas shortlisted yet. Open any neighbourhood and choose “Add to shortlist”.</p>';
      var suggest = ['pimlico', 'southken', 'belsize', 'stjohnswood', 'marylebone', 'maidavale', 'bayswater', 'nottinghill', 'kensington', 'belgravia', 'littlevenice', 'swisscottage']
        .filter(function (id) { return S.shortlist.indexOf(id) < 0; });
      if (suggest.length) body += '<h3>From your brief</h3><div class="stations">' + suggest.map(function (id) { return '<span class="station-chip" data-add="' + id + '">+ ' + esc(AREA_BY_ID[id].name) + '</span>'; }).join('') + '</div>';
    } else if (tab === 'apts') {
      var apts = S.apartments.filter(function (a) { return S.showArchived || !a.archived; });
      body += '<div class="actions"><button class="primary" id="h-add">Add apartment</button>' + (S.compareApts.length ? '<button id="h-cmp-apts">Compare selected (' + S.compareApts.length + ')</button>' : '') + '</div>' +
        '<p class="small">Or click the map in Find a home mode to drop a pin first.</p>' +
        (apts.length ? '<ul class="list">' + apts.map(function (a) {
          var an = a.ll ? analyse(a.ll) : null;
          return '<li><input type="checkbox" data-cmp="' + a.id + '"' + (S.compareApts.indexOf(a.id) >= 0 ? ' checked' : '') + ' aria-label="Compare"><div class="grow"><div class="title" data-apt="' + a.id + '">' + esc(a.title || a.address || 'Untitled apartment') + '</div><div class="small">' +
            [blank(a.rent) ? null : money(a.rent), blank(a.beds) ? null : a.beds + ' bed', a.status, an && an.area ? an.area.a.name : null, a.archived ? 'archived' : null, a.ll ? (a.precise ? 'precise' : 'approx. pin') : 'no pin'].filter(Boolean).map(esc).join(' · ') + '</div></div></li>';
        }).join('') + '</ul>' : '<p>No apartments yet.</p>') +
        '<label class="check small"><input type="checkbox" id="h-arch"' + (S.showArchived ? ' checked' : '') + '> Show archived</label>';
    } else {
      body += '<p class="small">Gyms, friends, a favourite café, a doctor — anything you want commute and distance context for. Click the map in Find a home mode to add one.</p>' +
        (S.places.length ? '<ul class="list">' + S.places.map(function (p) { return '<li><div class="grow"><div class="title" data-place="' + p.id + '">' + esc(p.name) + '</div><div class="small">' + esc(p.note || '') + '</div></div></li>'; }).join('') + '</ul>' : '<p>No places yet.</p>');
    }
    openPanel('<h1>Find a home</h1><div class="sub">Shortlist areas, track apartments, compare.</div>' + tabs + body, { kind: 'home', id: null });
    $all('[data-tab]', panelBody).forEach(function (b) { b.addEventListener('click', function () { S.homeTab = b.dataset.tab; save(); openHome(); }); });
    $all('[data-area]', panelBody).forEach(function (b) { b.addEventListener('click', function () { var a = AREA_BY_ID[b.dataset.area]; openArea(a.id); flyTo(a.ll, 14); }); });
    $all('[data-unlist]', panelBody).forEach(function (b) { b.addEventListener('click', function () { S.shortlist = S.shortlist.filter(function (x) { return x !== b.dataset.unlist; }); save(); openHome(); }); });
    $all('[data-add]', panelBody).forEach(function (b) { b.addEventListener('click', function () { S.shortlist.push(b.dataset.add); save(); openHome(); }); });
    $all('[data-apt]', panelBody).forEach(function (b) { b.addEventListener('click', function () { var a = aptById(b.dataset.apt); openApartment(a.id); if (a.ll) flyTo(a.ll, 15); }); });
    $all('[data-place]', panelBody).forEach(function (b) { b.addEventListener('click', function () { openPlace(b.dataset.place); }); });
    $all('[data-cmp]', panelBody).forEach(function (c) { c.addEventListener('change', function () { var id = c.dataset.cmp; S.compareApts = S.compareApts.filter(function (x) { return x !== id; }); if (c.checked) S.compareApts.push(id); save(); openHome(); }); });
    var x;
    if ((x = $('#h-cmp'))) x.addEventListener('click', compareAreas);
    if ((x = $('#h-add'))) x.addEventListener('click', function () { aptForm(null); });
    if ((x = $('#h-cmp-apts'))) x.addEventListener('click', compareApts);
    if ((x = $('#h-arch'))) x.addEventListener('change', function (e) { S.showArchived = e.target.checked; save(); drawMine(); openHome(); });
  }

  /* ------------------------------------------------ comparisons */
  function commuteCell(kind, id, ll, oid) {
    var t = bestTime(kind, id, oid), d = dist(ll, officeLL(oid));
    return (t ? '<b>' + t.min + ' min</b> <span class="small">(' + esc(t.src) + ')</span>' + (t.min <= S.threshold ? ' <span class="badge ok">≤ ' + S.threshold + '</span>' : ' <span class="badge warn">> ' + S.threshold + '</span>') : '<span class="small">not measured</span>') +
      '<br><span class="small">' + fmtDist(d) + ' straight-line</span>';
  }
  function showCompare(title, cols, rows) {
    $('#compare-title').textContent = title;
    $('#compare-body').innerHTML = '<table><thead><tr><th></th>' + cols.map(function (c) { return '<th>' + c + '</th>'; }).join('') + '</tr></thead><tbody>' +
      rows.map(function (r) { return '<tr><td>' + esc(r[0]) + '</td>' + r[1].map(function (v) { return '<td>' + v + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>';
    $('#compare').hidden = false;
  }
  $('#compare-close').addEventListener('click', function () { $('#compare').hidden = true; });
  function compareAreas() {
    var as = S.shortlist.map(function (id) { return AREA_BY_ID[id]; }).filter(Boolean);
    if (!as.length) { toast('Shortlist some areas first.'); return; }
    function f(fn) { return as.map(fn); }
    showCompare('Shortlisted areas', f(function (a) { return esc(a.name); }), [
      ['Borough', f(function (a) { return esc(a.borough); })],
      ['→ Portman Square', f(function (a) { return commuteCell('area', a.id, a.ll, 'portman') + '<div class="small">' + esc(a.route.portman) + '</div>'; })],
      ['→ Bressenden Place', f(function (a) { return commuteCell('area', a.id, a.ll, 'bressenden') + '<div class="small">' + esc(a.route.bressenden) + '</div>'; })],
      ['Park access', f(function (a) { return esc(a.cmp.parks); })],
      ['Cafés & pubs', f(function (a) { return esc(a.cmp.cafes); })],
      ['Quiet / residential', f(function (a) { return esc(a.cmp.quiet); })],
      ['Sources of bustle', f(function (a) { return esc(a.cmp.bustle); })],
      ['Housing stock', f(function (a) { return esc(a.cmp.stock); })],
      ['Budget evidence', f(function (a) { return esc(a.cmp.budget); })],
      ['Trade-offs', f(function (a) { return esc(a.fit.tradeoffs); })],
      ['Unknowns', f(function (a) { return esc(a.fit.unknowns || '—'); })],
      ['Our notes', f(function (a) { return esc(S.areaNotes[a.id] || '—'); })]
    ]);
  }
  function compareApts() {
    var as = S.compareApts.map(aptById).filter(Boolean);
    if (!as.length) { toast('Tick apartments to compare first.'); return; }
    var an = as.map(function (a) { return a.ll ? analyse(a.ll) : null; });
    function f(fn) { return as.map(function (a, i) { return fn(a, an[i]); }); }
    function needPin(x, fn) { return x ? fn(x) : '<span class="small">no pin</span>'; }
    showCompare('Apartments', f(function (a) { return esc(a.title || a.address || 'Apartment'); }), [
      ['Address', f(function (a) { return show(a.address); })],
      ['Pin', f(function (a) { return a.ll ? (a.precise ? 'precise' : '<span class="badge warn">approximate</span>') : '—'; })],
      ['Area', f(function (a, x) { return needPin(x, function (x) { return x.area ? esc(x.area.a.name) : 'outside entries (near ' + esc(x.nearestArea.a.name) + ')'; }); })],
      ['Rent', f(function (a) { return show(a.rent, money); })],
      ['Beds', f(function (a) { return show(a.beds); })],
      ['Furnished', f(function (a) { return show(a.furnished); })],
      ['Floor / lift', f(function (a) { return show(a.floor) + ' / ' + show(a.lift); })],
      ['Outdoor', f(function (a) { return show(a.outdoor); })],
      ['Size', f(function (a) { return show(a.size); })],
      ['Status', f(function (a) { return esc(a.status) + (a.archived ? ' (archived)' : ''); })],
      ['→ Portman Square', f(function (a) { return a.ll ? commuteCell('apt', a.id, a.ll, 'portman') : '—'; })],
      ['→ Bressenden Place', f(function (a) { return a.ll ? commuteCell('apt', a.id, a.ll, 'bressenden') : '—'; })],
      ['Nearest station', f(function (a, x) { return needPin(x, function (x) { return esc(x.stations[0].s.name) + ' <span class="small">' + fmtDist(x.stations[0].d) + '</span>'; }); })],
      ['Nearest park entrance', f(function (a, x) { return needPin(x, function (x) { var p = x.publicParks[0]; return esc(p.p.name) + ' — ' + esc(p.gate.name) + ' <span class="small">' + fmtDist(p.d) + '</span>'; }); })],
      ['A roads ≤150 m', f(function (a, x) { return needPin(x, function (x) { return x.roads.length ? x.roads.map(function (r) { return esc(r.name) + ' <span class="small">' + fmtDist(r.d) + '</span>'; }).join('<br>') : 'none'; }); })],
      ['Nearest 20 ha+ park', f(function (a, x) { return needPin(x, function (x) { return x.bigGreen ? esc(x.bigGreen.g.n) + ' <span class="small">' + fmtDist(x.bigGreen.d) + '</span>' : '—'; }); })],
      ['Pressure zones', f(function (a, x) { return needPin(x, function (x) { return x.pressure.length ? x.pressure.map(function (p) { return esc(p.z.name.split(' (')[0]); }).join('; ') : 'none mapped'; }); })],
      ['Listing notes', f(function (a) { return show(a.notes); })],
      ['Our notes', f(function (a) { return show(a.personal); })],
      ['Last checked', f(function (a) { return show(a.checked); })],
      ['Link', f(function (a) { return a.url ? '<a href="' + esc(safeUrl(a.url)) + '" target="_blank" rel="noopener">listing</a>' : '—'; })]
    ]);
  }

  /* ------------------------------------------------ intro (explore, nothing selected) */
  function openIntro() {
    var deep = AREAS.filter(function (a) { return a.depth === 'deep'; }), full = AREAS.filter(function (a) { return a.depth !== 'deep'; });
    function chips(arr) { return '<div class="stations">' + arr.map(function (a) { return '<span class="station-chip" data-area="' + a.id + '">' + esc(a.name) + '</span>'; }).join('') + '</div>'; }
    openPanel('<h1>London Atlas</h1><div class="sub">A researched map of central and inner London, built for choosing where to rent.</div>' +
      '<p>Click any neighbourhood name for a candid write-up: what it is like, its pockets and edges, everyday drawbacks, how it connects, and how it fits a two-office commute. Switch to <b>Find a home</b> to shortlist areas, track apartments and compare them.</p>' +
      '<h2>Coverage</h2><p class="small">' + AREAS.length + ' researched entries. Italic grey names are base-map only.</p>' +
      '<h3>Researched in depth (' + deep.length + ')</h3>' + chips(deep) + '<h3>Full entries (' + full.length + ')</h3>' + chips(full) +
      '<h2>How to read it</h2><ul>' +
      '<li>Character write-ups combine cited sources with general local knowledge. Each entry separates the two under <b>Evidence</b>; impressions should be checked on the ground.</li>' +
      '<li>Rents quote ONS borough averages for all existing tenancies (August 2026). New-let asking rents run higher; budget lines marked “interpretation” are judgements, not data.</li>' +
      '<li>Commute minutes only appear when they come from TfL’s Journey Planner or from you. Distances are straight-line and never turned into times.</li>' +
      '<li>Office pins are approximate until you move them to the real entrances (click an office).</li></ul>' +
      '<p class="small">Sources accessed ' + esc(ACCESSED) + '. Contains OS data © Crown copyright and database right (OGL). Transport © OpenStreetMap contributors. Street tiles © CARTO.</p>', { kind: 'intro', id: null });
    $all('[data-area]', panelBody).forEach(function (b) { b.addEventListener('click', function () { var a = AREA_BY_ID[b.dataset.area]; openArea(a.id); flyTo(a.ll, 14); }); });
  }

  /* ================================================================ map clicks */
  map.on('click', function (e) {
    var ll = [+e.latlng.lat.toFixed(6), +e.latlng.lng.toFixed(6)];
    if (placing) {
      var p = placing; placing = null; map.getContainer().style.cursor = '';
      if (p.cb) { p.cb(ll); return; }
      var a = aptById(p.aptId); if (a) { a.ll = ll; save(); drawMine(); openApartment(a.id); }
      return;
    }
    if (S.mode === 'home') {
      var near = analyse(ll);
      var pop = L.popup({ maxWidth: 240 }).setLatLng(e.latlng).setContent(
        '<div class="actions"><button class="primary" data-act="apt">Add apartment here</button><input type="text" id="pop-place" placeholder="Place name, e.g. Gym"><button data-act="place">Add as personal place</button>' +
        (near.area ? '<button class="ghost" data-act="area">Open ' + esc(near.area.a.name) + '</button>' : '') + '</div>').openOn(map);
      var el = pop.getElement();
      $all('[data-act]', el).forEach(function (b) {
        b.addEventListener('click', function () {
          map.closePopup();
          if (b.dataset.act === 'apt') aptForm(null, ll);
          else if (b.dataset.act === 'place') {
            var name = (el.querySelector('#pop-place').value || '').trim() || 'My place';
            var pl = { id: uid(), name: name, ll: ll, note: '' }; S.places.push(pl); save(); drawMine(); openPlace(pl.id);
          } else openArea(near.area.a.id);
        });
      });
      return;
    }
    if (!S.layers.areas) return;
    var hit = AREAS.map(function (a) { return { a: a, k: dist(ll, a.ll) / a.r }; }).filter(function (x) { return x.k < 1; }).sort(function (x, y) { return x.k - y.k; })[0];
    if (hit) openArea(hit.a.id); else closePanel();
  });

  /* ================================================================ search */
  var INDEX = [];
  function buildIndex() {
    INDEX = [];
    AREAS.forEach(function (a) { INDEX.push({ t: a.name, s: a.aka || '', kind: 'Neighbourhood', go: function () { openArea(a.id); flyTo(a.ll, 14); } }); });
    BASE.forEach(function (p) { INDEX.push({ t: p.name, s: '', kind: 'Base map only', go: function () { openBase(p); flyTo(p.ll, 13); } }); });
    PARKS.forEach(function (p) { INDEX.push({ t: p.name, s: '', kind: p.access === 'private' ? 'Private garden' : 'Park', go: function () { openPark(p.id); flyTo(p.ll, 15); } }); });
    LANDMARKS.forEach(function (l) { INDEX.push({ t: l.name, s: '', kind: 'Landmark', go: function () { openLandmark(l); flyTo(l.ll, 15); } }); });
    STATIONS.forEach(function (s) { INDEX.push({ t: s.name, s: 'station', kind: 'Station', go: function () { openStation(s); if (!S.layers.transport) { S.layers.transport = true; save(); drawTransport(); applyLayers(); } flyTo(s.ll, 15); } }); });
    OFFICE_DEFAULTS.forEach(function (o) { INDEX.push({ t: o.name, s: 'office', kind: 'Office', go: function () { openOffice(o.id); flyTo(officeLL(o.id), 15); } }); });
    S.apartments.forEach(function (a) { INDEX.push({ t: a.title || a.address || 'Apartment', s: a.address || '', kind: 'My apartment', go: function () { openApartment(a.id); if (a.ll) flyTo(a.ll, 15); } }); });
    S.places.forEach(function (p) { INDEX.push({ t: p.name, s: '', kind: 'My place', go: function () { openPlace(p.id); flyTo(p.ll, 15); } }); });
  }
  var searchEl = $('#search'), resEl = $('#search-results'), results = [], cursor = -1;
  searchEl.addEventListener('input', function () {
    buildIndex();
    var q = norm(searchEl.value.trim());
    if (q.length < 2) { resEl.hidden = true; return; }
    results = INDEX.map(function (r) {
      var t = norm(r.t), s = norm(r.s), score = t.indexOf(q) === 0 ? 3 : t.indexOf(' ' + q) >= 0 ? 2 : t.indexOf(q) >= 0 ? 1.5 : s.indexOf(q) >= 0 ? 1 : 0;
      if (r.kind === 'Neighbourhood') score += .5;
      return { r: r, score: score };
    }).filter(function (x) { return x.score > 0; }).sort(function (a, b) { return b.score - a.score || a.r.t.length - b.r.t.length; }).slice(0, 12).map(function (x) { return x.r; });
    cursor = results.length ? 0 : -1; renderResults();
  });
  function renderResults() {
    resEl.innerHTML = results.length ? results.map(function (r, i) { return '<li role="option" data-i="' + i + '" aria-selected="' + (i === cursor) + '"><span>' + esc(r.t) + '</span><span class="kind">' + esc(r.kind) + '</span></li>'; }).join('') : '<li class="small">No matches</li>';
    resEl.hidden = false;
  }
  resEl.addEventListener('mousedown', function (e) {
    var li = e.target.closest('li[data-i]'); if (!li) return;
    e.preventDefault(); pick(+li.dataset.i);
  });
  searchEl.addEventListener('keydown', function (e) {
    if (resEl.hidden) return;
    if (e.key === 'ArrowDown') { cursor = Math.min(results.length - 1, cursor + 1); renderResults(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { cursor = Math.max(0, cursor - 1); renderResults(); e.preventDefault(); }
    else if (e.key === 'Enter' && cursor >= 0) { pick(cursor); e.preventDefault(); }
    else if (e.key === 'Escape') { resEl.hidden = true; }
  });
  searchEl.addEventListener('blur', function () { setTimeout(function () { resEl.hidden = true; }, 150); });
  function pick(i) { var r = results[i]; if (!r) return; resEl.hidden = true; searchEl.value = r.t; searchEl.blur(); r.go(); }

  /* ================================================================ controls */
  function setMode(m) {
    S.mode = m; save();
    $all('.mode button').forEach(function (b) { b.setAttribute('aria-selected', String(b.dataset.mode === m)); });
    if (m === 'home') openHome();
    else if (selected.kind === 'home' || selected.kind === 'aptform') openIntro();
  }
  $all('.mode button').forEach(function (b) { b.addEventListener('click', function () { setMode(b.dataset.mode); }); });

  function floater(btnSel, panelSel) {
    var btn = $(btnSel), pnl = $(panelSel);
    btn.addEventListener('click', function () {
      var open = pnl.hidden;
      $all('.floating').forEach(function (p) { p.hidden = true; });
      $all('.top-actions button').forEach(function (b) { b.setAttribute('aria-expanded', 'false'); });
      pnl.hidden = !open; btn.setAttribute('aria-expanded', String(open));
    });
  }
  floater('#btn-layers', '#layers'); floater('#btn-data', '#datapanel');
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { $all('.floating').forEach(function (p) { p.hidden = true; }); $('#compare').hidden = true; } });

  $all('#layers input[data-layer]').forEach(function (i) {
    i.addEventListener('change', function () {
      S.layers[i.dataset.layer] = i.checked; save();
      if (i.dataset.layer === 'transport' && i.checked) drawTransport();
      applyLayers();
    });
  });
  function renderLinePicker() {
    var lp = $('#line-picker');
    lp.innerHTML = '<div class="all"><button class="link" data-all="1">all</button><button class="link" data-all="0">none</button><button class="link" data-all="tube">Tube + Elizabeth only</button></div>' +
      LINE_ORDER.map(function (l) { return '<label><input type="checkbox" data-line="' + esc(l) + '"' + (S.lines.indexOf(l) >= 0 ? ' checked' : '') + '><span class="sw" style="background:' + LINE_COLORS[l] + '"></span>' + esc(l.replace('London ', '').replace('IFS Cloud ', '')) + '</label>'; }).join('');
    $all('[data-line]', lp).forEach(function (c) {
      c.addEventListener('change', function () { S.lines = S.lines.filter(function (x) { return x !== c.dataset.line; }); if (c.checked) S.lines.push(c.dataset.line); save(); drawTransport(); });
    });
    $all('[data-all]', lp).forEach(function (b) {
      b.addEventListener('click', function () {
        var v = b.dataset.all;
        S.lines = v === '1' ? LINE_ORDER.slice() : v === '0' ? [] : LINE_ORDER.filter(function (l) { return ['London Overground', 'DLR', 'Tramlink', 'IFS Cloud Cable Car'].indexOf(l) < 0; });
        save(); renderLinePicker(); drawTransport();
      });
    });
  }
  renderLinePicker();
  function renderLegend() {
    var h = '<div class="item"><span class="key" style="font:600 12px var(--serif)">Aa</span> Researched neighbourhood <i class="small">(italic grey = base map only)</i></div>' +
      '<div class="item"><span class="key"><i style="display:inline-block;width:10px;height:10px;border-radius:50%;background:var(--map-park);border:1.5px solid var(--green)"></i></span> Public park (OS outline) · <i style="display:inline-block;width:10px;height:10px;border-radius:50%;background:var(--green);border:1.5px solid var(--field)"></i> researched park</div>' +
      '<div class="item"><span class="key"><i style="display:inline-block;width:9px;height:9px;border:1.5px dashed var(--estate-ink);background:var(--field)"></i></span> Private garden square (keyholders)</div>' +
      '<div class="item"><span class="key"><i style="display:inline-block;background:#1e2023;color:#fff;font:600 9px/14px var(--sans);padding:0 3px;border-radius:2px">P</i></span> Office anchor (dashed = approximate)</div>';
    if (S.layers.character) h += Object.keys(CHAR_KINDS).filter(function (k) { return k !== 'crowds'; }).map(function (k) { return '<div class="item"><span class="key" style="border:2px solid ' + CHAR_KINDS[k].color + ';border-radius:50%"></span>' + esc(CHAR_KINDS[k].label) + '</div>'; }).join('');
    if (S.layers.roads) h += '<div class="item"><span class="key" style="height:5px;background:var(--map-highlight-road);opacity:.6"></span> A road / motorway (OS Open Roads)</div>';
    if (S.layers.mine) h += '<div class="item"><span class="key"><i style="display:inline-block;width:12px;height:12px;border-radius:50%;background:#2e4a66;border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.15)"></i></span> Apartment (colour = status; ring = approximate)</div>';
    $('#legend').innerHTML = h;
  }
  if (HOSTED) $all('#basemap option').forEach(function (o) { if (o.value !== 'atlas') o.remove(); });
  $('#basemap').value = S.basemap;
  $('#basemap').addEventListener('change', function (e) { setBasemap(e.target.value); });

  /* data panel */
  $('#threshold').value = S.threshold;
  $('#threshold').addEventListener('change', function (e) { var v = Math.round(+e.target.value); if (v >= 5 && v <= 90) { S.threshold = v; save(); rerender(); } });
  function renderOfficeSettings() {
    $('#office-settings').innerHTML = OFFICE_DEFAULTS.map(function (o) {
      var st = S.offices[o.id];
      return '<p><button class="link" data-office="' + o.id + '">' + esc(o.name) + '</button> <span class="small">' + (st.approx ? 'approximate — click to move it' : 'entrance set') + '</span></p>';
    }).join('');
    $all('[data-office]', $('#office-settings')).forEach(function (b) { b.addEventListener('click', function () { $('#datapanel').hidden = true; openOffice(b.dataset.office); flyTo(officeLL(b.dataset.office), 16); }); });
  }
  $('#btn-data').addEventListener('click', renderOfficeSettings);
  function exportJson() { return JSON.stringify({ app: 'london-atlas', exported: new Date().toISOString(), data: S }, null, 2); }
  $('#btn-export').addEventListener('click', function () {
    var txt = exportJson();
    $('#export-text').value = txt; $('#export-box').hidden = false;
    if (HOSTED) return; /* hosted pages cannot start downloads: copy instead */
    var blob = new Blob([txt], { type: 'application/json' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'london-atlas-' + today() + '.json';
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  });
  $('#btn-copy').addEventListener('click', function () {
    var t = $('#export-text');
    navigator.clipboard.writeText(t.value).then(function () { toast('Copied.'); }).catch(function () { t.focus(); t.select(); toast('Select-all is done — press copy on your keyboard.'); });
  });
  function offerImport(txt) {
    var d;
    try { var j = JSON.parse(txt); d = j && j.data ? j.data : j; if (!d || typeof d !== 'object' || !Array.isArray(d.apartments)) throw new Error('this is not a London Atlas export'); }
    catch (err) { toast('Import failed: ' + err.message); return; }
    var box = $('#import-choice');
    box.innerHTML = '<p class="small">Found ' + d.apartments.length + ' apartments, ' + (d.places || []).length + ' places, ' + (d.shortlist || []).length + ' shortlisted areas.</p>' +
      '<div class="confirm-row"><button class="primary" id="imp-merge">Merge into my data</button><button class="danger" id="imp-replace">Replace my data</button><button class="ghost" id="imp-cancel">Cancel</button></div>';
    box.hidden = false;
    function done() { box.hidden = true; save(); drawOffices(); drawMine(); applyLayers(); toast('Imported.'); if (S.mode === 'home') openHome(); }
    $('#imp-cancel').onclick = function () { box.hidden = true; };
    $('#imp-replace').onclick = function () { S = merge(defaults(), d); if (HOSTED) S.basemap = 'atlas'; done(); };
    $('#imp-merge').onclick = function () {
      var ids = {}; S.apartments.forEach(function (a) { ids[a.id] = 1; });
      d.apartments.forEach(function (a) { if (!ids[a.id]) S.apartments.push(a); });
      var pids = {}; S.places.forEach(function (p) { pids[p.id] = 1; });
      (d.places || []).forEach(function (p) { if (!pids[p.id]) S.places.push(p); });
      (d.shortlist || []).forEach(function (id) { if (S.shortlist.indexOf(id) < 0 && AREA_BY_ID[id]) S.shortlist.push(id); });
      Object.keys(d.commutes || {}).forEach(function (k) { if (!S.commutes[k]) S.commutes[k] = d.commutes[k]; });
      Object.keys(d.areaNotes || {}).forEach(function (k) { if (!S.areaNotes[k]) S.areaNotes[k] = d.areaNotes[k]; });
      done();
    };
  }
  $('#file-import').addEventListener('change', function (e) {
    var file = e.target.files[0]; if (!file) return;
    var r = new FileReader();
    r.onload = function () { offerImport(String(r.result)); e.target.value = ''; };
    r.readAsText(file);
  });
  $('#btn-paste-import').addEventListener('click', function () { offerImport($('#import-text').value); });
  $('#btn-wipe').addEventListener('click', function (e) {
    var b = e.currentTarget;
    if (!b.dataset.armed) { b.dataset.armed = '1'; b.textContent = 'Click again: delete everything in this browser'; return; }
    try { localStorage.removeItem(STORE_KEY); } catch (err) { /* ignore */ }
    S = defaults(); if (HOSTED) S.basemap = 'atlas'; save(); drawOffices(); drawMine(); applyLayers(); setMode('explore'); openIntro(); $('#datapanel').hidden = true;
    delete b.dataset.armed; b.textContent = 'Delete all local data…';
  });

  /* ================================================================ boot */
  if (S.layers.transport) drawTransport();
  applyLayers();
  $all('.mode button').forEach(function (b) { b.setAttribute('aria-selected', String(b.dataset.mode === S.mode)); });
  if (S.mode === 'home') openHome();
  else if (window.innerWidth > 760) openIntro();
  map.whenReady(function () { setTimeout(function () { refreshAreaClasses(); declutter(); }, 50); });
  window.__atlas = { state: function () { return S; }, map: map, analyse: analyse }; /* for debugging and tests */
})();
