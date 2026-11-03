#!/usr/bin/env node
/*
 * build-viewer.js — turn a folder of Markdown notes into one self-contained viewer.html
 *
 *   node build-viewer.js                 # scans ./notes, writes ./viewer.html
 *   node build-viewer.js path/to/notes   # scan another folder
 *   node build-viewer.js notes --out kb.html
 *
 * No npm install needed (plain Node >= 16). The generated page loads D3, marked and
 * DOMPurify from a CDN (pinned versions) and embeds every note as JSON, so it opens by
 * double-click with no server. The page also has an "Open folder" button that re-runs
 * the same parser in the browser on any notes folder you pick.
 */
'use strict';

const CDN = {
  d3: 'https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js',
  marked: 'https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js',
  purify: 'https://cdn.jsdelivr.net/npm/dompurify@3.1.6/dist/purify.min.js',
};

/* ------------------------------------------------------------------------------------
 * Core parser — runs in Node (build) AND in the browser (Open folder). Keep it free of
 * Node/DOM APIs: it is serialised with Function.prototype.toString into the page.
 * ---------------------------------------------------------------------------------- */
function kbCore() {
  const WIKI = /!?\[\[([^\[\]\n]+?)\]\]/g;

  function normKey(s) {
    return String(s == null ? '' : s).trim().toLowerCase()
      .replace(/\.md$/, '').replace(/[\s_\-]+/g, '-');
  }
  function unquote(v) {
    v = String(v).trim();
    if (v.length > 1 && ((v[0] === '"' && v.endsWith('"')) || (v[0] === "'" && v.endsWith("'")))) return v.slice(1, -1);
    return v;
  }
  function stripComment(v) {
    if (/^\s*["']/.test(v)) return v;
    const i = v.search(/\s#/);
    return i >= 0 ? v.slice(0, i) : v;
  }
  function scalar(v) {
    v = stripComment(v).trim();
    if (v.startsWith('[') && v.endsWith(']')) return v.slice(1, -1).split(',').map(unquote).filter(Boolean);
    return unquote(v);
  }

  /* Small YAML-frontmatter subset: `key: value`, `key: [a, b]`, and `key:` + `- item` lists. */
  function parseFrontmatter(text) {
    text = String(text).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
    const m = text.match(/^---[ \t]*\n([\s\S]*?)\n(?:---|\.\.\.)[ \t]*(?:\n|$)/);
    if (!m) return { data: {}, body: text };
    const data = {};
    let key = null;
    for (const line of m[1].split('\n')) {
      if (!line.trim() || line.trim().startsWith('#')) continue;
      const item = line.match(/^\s*-\s+(.*)$/);
      if (item && key) {
        if (!Array.isArray(data[key])) data[key] = data[key] ? [data[key]] : [];
        data[key].push(unquote(stripComment(item[1])));
        continue;
      }
      const kv = line.match(/^([A-Za-z0-9_\-]+)\s*:\s*(.*)$/);
      if (kv) { key = kv[1].toLowerCase(); data[key] = kv[2].trim() === '' ? '' : scalar(kv[2]); }
    }
    return { data, body: text.slice(m[0].length) };
  }

  function asList(v) {
    if (v == null || v === '') return [];
    const arr = Array.isArray(v) ? v : String(v).split(String(v).includes(',') ? ',' : /\s+/);
    return arr.map(s => String(s).trim().replace(/^#/, '')).filter(Boolean);
  }
  function normDate(v) {
    if (v == null || v === '') return '';
    if (typeof v === 'number') return new Date(v).toISOString().slice(0, 10);
    const m = String(v).match(/\d{4}-\d{2}-\d{2}/);
    if (m) return m[0];
    const d = new Date(String(v));
    return isNaN(d) ? '' : d.toISOString().slice(0, 10);
  }
  function prettify(slug) {
    return String(slug).replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  /* Apply fn to the parts of Markdown that are not fenced or inline code. */
  function mapOutsideCode(text, fn) {
    const lines = String(text).split('\n');
    const out = [];
    let buf = [], fence = null;
    const flush = () => {
      if (!buf.length) return;
      out.push(buf.join('\n').split(/(`[^`\n]*`)/).map((p, i) => (i % 2 ? p : fn(p))).join(''));
      buf = [];
    };
    for (const line of lines) {
      const m = line.match(/^\s{0,3}(`{3,}|~{3,})/);
      if (fence) {
        out.push(line);
        if (m && m[1][0] === fence[0] && m[1].length >= fence.length) fence = null;
        continue;
      }
      if (m) { flush(); fence = m[1]; out.push(line); continue; }
      buf.push(line);
    }
    flush();
    return out.join('\n');
  }

  /* [[target#heading|alias]] -> { target, heading, alias } */
  function parseLink(inner) {
    let [target, alias] = String(inner).split('|');
    let heading = '';
    target = (target || '').trim();
    const h = target.indexOf('#');
    if (h >= 0) { heading = target.slice(h + 1).trim(); target = target.slice(0, h).trim(); }
    return { target, heading, alias: (alias || '').trim() };
  }
  function resolve(index, target) {
    const k = normKey(target);
    if (index[k]) return index[k];
    const last = k.split('/').pop();
    return index[last] || null;
  }
  function ghostId(target) { return 'ghost:' + normKey(String(target).split('/').pop()); }

  function plain(md) {
    return String(md)
      .replace(/^(```|~~~)[\s\S]*?^\1.*$/gm, ' ')
      .replace(WIKI, (m, inner) => { const L = parseLink(inner); return L.alias || L.target; })
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/<[^>]+>/g, ' ')
      .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, '')
      .replace(/[*_`~|$]+/g, '')
      .replace(/\s+/g, ' ').trim();
  }

  /* files: [{ path: 'topic/note.md', content, mtime }] -> viewer data model */
  function build(files, meta) {
    meta = meta || {};
    files = files.filter(f => /\.md$/i.test(f.path))
      .map(f => Object.assign({}, f, { path: String(f.path).replace(/\\/g, '/').replace(/^\.\//, '') }))
      .sort((a, b) => a.path.localeCompare(b.path));

    const notes = files.map(f => {
      const { data, body } = parseFrontmatter(f.content);
      const parts = f.path.split('/');
      const file = parts.pop();
      const base = file.replace(/\.md$/i, '');
      const isIndex = base.toLowerCase() === '_index';
      const folder = parts.join('/');
      const h1 = body.match(/^#\s+(.+?)\s*#*\s*$/m);
      const title = String(data.title || (h1 && h1[1]) || (isIndex ? prettify(parts[parts.length - 1] || 'Home') : base)).trim();
      const txt = plain(body);
      return {
        id: f.path.replace(/\.md$/i, ''),
        path: f.path, folder, base, title, isIndex,
        topic: parts[0] || '',
        tags: asList(data.tags || data.tag),
        aliases: asList(data.aliases || data.alias),
        type: String(data.type || '').trim().toLowerCase(),
        status: String(data.status || '').trim().toLowerCase(),
        description: String(data.description || data.summary || '').trim(),
        created: normDate(data.created || data.date),
        updated: normDate(data.updated || data.modified) || normDate(f.mtime) || normDate(data.created || data.date),
        words: txt ? txt.split(' ').length : 0,
        body,
        out: [], in: [], ghostOut: [], degree: 0, orphan: false,
      };
    });

    // Name -> note id. Earlier passes win: path, file name, title, alias, folder (for _index).
    const index = {};
    const add = (k, id) => { k = normKey(k); if (k && !index[k]) index[k] = id; };
    notes.forEach(n => add(n.id, n.id));
    notes.forEach(n => { if (!n.isIndex) add(n.base, n.id); });
    notes.forEach(n => add(n.title, n.id));
    notes.forEach(n => n.aliases.forEach(a => add(a, n.id)));
    notes.forEach(n => { if (n.isIndex && n.folder) { add(n.folder, n.id); add(n.folder.split('/').pop(), n.id); } });

    const byId = new Map(notes.map(n => [n.id, n]));
    const ghosts = new Map();
    const edges = [];
    const seen = new Set();
    for (const n of notes) {
      mapOutsideCode(n.body, seg => {
        seg.replace(WIKI, (m, inner) => {
          const L = parseLink(inner);
          if (!L.target) return m;
          const id = resolve(index, L.target);
          let tid;
          if (id) { if (id === n.id) return m; tid = id; }
          else {
            tid = ghostId(L.target);
            if (!ghosts.has(tid)) ghosts.set(tid, { id: tid, title: L.target.split('/').pop(), ghost: true, refs: [] });
          }
          const key = n.id + '\u0000' + tid;
          if (seen.has(key)) return m;
          seen.add(key);
          edges.push({ source: n.id, target: tid, ghost: !id });
          if (id) { n.out.push(id); byId.get(id).in.push(n.id); }
          else { n.ghostOut.push(tid); ghosts.get(tid).refs.push(n.id); }
          return m;
        });
        return seg;
      });
    }
    for (const n of notes) {
      const real = new Set(n.out.concat(n.in));
      n.degree = new Set(n.out.concat(n.in, n.ghostOut)).size;
      n.orphan = real.size === 0;
    }
    for (const g of ghosts.values()) g.degree = g.refs.length;

    const topicIds = [...new Set(notes.map(n => n.topic))].sort((a, b) => (a === '') - (b === '') || a.localeCompare(b));
    const topics = topicIds.map(t => {
      const members = notes.filter(n => n.topic === t);
      const idx = members.find(n => n.isIndex && n.folder === t);
      const statusCounts = {};
      members.filter(n => !n.isIndex).forEach(n => { const s = n.status || 'unset'; statusCounts[s] = (statusCounts[s] || 0) + 1; });
      const tagCounts = {};
      members.forEach(n => n.tags.forEach(x => { tagCounts[x] = (tagCounts[x] || 0) + 1; }));
      let description = idx ? (idx.description || '') : '';
      if (idx && !description) {
        const para = idx.body.replace(/^#.*$/m, '').split(/\n\s*\n/).map(s => s.trim()).find(s => s && !/^([-*+]|\d+\.|#|>|\|)/.test(s));
        description = para ? plain(para) : '';
      }
      return {
        id: t, name: idx ? idx.title : (t ? prettify(t) : 'Unfiled'),
        indexId: idx ? idx.id : null, description,
        count: members.filter(n => !n.isIndex).length, statusCounts,
        topTags: Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).map(e => e[0]).slice(0, 6),
        updated: members.map(n => n.updated).sort().pop() || '',
      };
    });

    const tagCounts = {};
    notes.forEach(n => n.tags.forEach(t => { tagCounts[t] = (tagCounts[t] || 0) + 1; }));
    const statuses = [...new Set(notes.map(n => n.status).filter(Boolean))];
    const order = ['seed', 'budding', 'evergreen'];
    statuses.sort((a, b) => ((order.indexOf(a) + 1) || 99) - ((order.indexOf(b) + 1) || 99) || a.localeCompare(b));

    return {
      generatedAt: new Date().toISOString(),
      source: meta.source || '',
      origin: meta.origin || 'build',
      notes,
      ghosts: [...ghosts.values()].sort((a, b) => b.refs.length - a.refs.length || a.title.localeCompare(b.title)),
      edges, topics, index,
      tags: Object.entries(tagCounts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([tag, count]) => ({ tag, count })),
      statuses,
    };
  }

  return { WIKI, normKey, parseFrontmatter, mapOutsideCode, parseLink, resolve, ghostId, plain, build };
}

/* ------------------------------------------------------------------------------------
 * Page styles and markup
 * ---------------------------------------------------------------------------------- */
const CSS = String.raw`
:root{
  --bg:#f6f5f1; --surface:#ffffff; --surface-2:#efede7; --text:#1d2126; --muted:#6a6f77; --faint:#9a9ea5;
  --border:#e2dfd8; --accent:#3b5bdb; --accent-soft:rgba(59,91,219,.12);
  --edge:rgba(40,44,52,.16); --edge-hl:rgba(40,44,52,.6); --ghost:#a3a7ad; --orphan:#d6453d;
  --shadow:0 10px 30px rgba(30,30,40,.10), 0 2px 6px rgba(30,30,40,.06);
  --seed:#c08a1e; --budding:#4d9a4f; --evergreen:#1f7a5a;
  --ui:'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  --read:'Literata', 'Iowan Old Style', Charter, Georgia, serif;
  --mono:ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  --panel-w:min(480px, 44vw);
  color-scheme: light;
}
@media (prefers-color-scheme: dark){
  :root{
    --bg:#131518; --surface:#1b1e22; --surface-2:#24282d; --text:#e5e4df; --muted:#9a9ea6; --faint:#6e737b;
    --border:#2d3137; --accent:#8ea2ff; --accent-soft:rgba(142,162,255,.14);
    --edge:rgba(225,225,235,.13); --edge-hl:rgba(235,235,245,.6); --ghost:#6c7178; --orphan:#ff6b61;
    --shadow:0 10px 30px rgba(0,0,0,.45), 0 2px 6px rgba(0,0,0,.3);
    --seed:#e2b04a; --budding:#7cc47e; --evergreen:#4fc79a;
    color-scheme: dark;
  }
}
*{box-sizing:border-box}
html,body{margin:0;height:100%}
body{background:var(--bg);color:var(--text);font:14px/1.45 var(--ui);display:flex;flex-direction:column;height:100dvh;overflow:hidden;-webkit-font-smoothing:antialiased}
button,select,input{font:inherit;color:inherit}
button{cursor:pointer}
a{color:var(--accent)}
[hidden]{display:none!important}

/* ---------- top bar ---------- */
.topbar{display:flex;align-items:center;gap:12px;padding:10px 16px;background:var(--surface);border-bottom:1px solid var(--border);flex-wrap:wrap;position:relative;z-index:30}
.brand{display:flex;align-items:center;gap:8px;font-weight:600;font-size:15px;white-space:nowrap}
.brand svg{width:22px;height:22px;color:var(--accent)}
.search{position:relative;flex:1 1 260px;max-width:520px}
.search input{width:100%;height:36px;border-radius:10px;border:1px solid var(--border);background:var(--surface-2);padding:0 34px 0 34px;outline:none;transition:border-color .15s, background .15s}
.search input:focus{border-color:var(--accent);background:var(--surface)}
.search .ico{position:absolute;left:10px;top:9px;width:18px;height:18px;color:var(--faint);pointer-events:none}
.search input:not(:placeholder-shown) ~ kbd{display:none}
.search kbd{position:absolute;right:8px;top:8px;font:11px var(--mono);color:var(--faint);border:1px solid var(--border);border-radius:5px;padding:1px 6px}
.results{position:absolute;top:42px;left:0;right:0;background:var(--surface);border:1px solid var(--border);border-radius:12px;box-shadow:var(--shadow);max-height:min(60vh,460px);overflow:auto;padding:6px}
.res{display:flex;gap:10px;padding:8px 10px;border-radius:8px;cursor:pointer;align-items:flex-start}
.res:hover,.res.active{background:var(--accent-soft)}
.res .rt{font-weight:500}
.res .rs{color:var(--muted);font-size:12.5px;margin-top:2px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.res mark{background:rgba(255,200,0,.35);color:inherit;border-radius:2px;padding:0 1px}
.res-empty{padding:12px;color:var(--muted)}
.dot{width:10px;height:10px;border-radius:50%;background:var(--c, var(--ghost));flex:none;margin-top:5px}
.dot.ghost{background:transparent;border:1.5px dashed var(--ghost)}
.filters{display:flex;gap:6px}
.filters select{height:34px;border-radius:9px;border:1px solid var(--border);background:var(--surface);padding:0 8px;max-width:150px}
.btn{height:34px;border-radius:9px;border:1px solid var(--border);background:var(--surface);padding:0 12px;display:inline-flex;align-items:center;gap:6px;white-space:nowrap}
.btn:hover{background:var(--surface-2)}
.btn svg{width:16px;height:16px}
.btn.primary{background:var(--accent);border-color:var(--accent);color:#fff}
@media (prefers-color-scheme: dark){ .btn.primary{color:#111} }

.subbar{display:flex;align-items:center;gap:16px;padding:0 16px;background:var(--surface);border-bottom:1px solid var(--border);min-height:40px;flex-wrap:wrap}
.tabs{display:flex;gap:2px}
.tabs button{border:0;background:none;padding:10px 12px;color:var(--muted);font-weight:500;border-bottom:2px solid transparent;margin-bottom:-1px}
.tabs button.active{color:var(--text);border-bottom-color:var(--accent)}
.stats{display:flex;gap:14px;color:var(--muted);font-size:12.5px;margin-left:auto;flex-wrap:wrap}
.stats b{color:var(--text);font-weight:600}
.stats .s-orph b{color:var(--orphan)}
.source{color:var(--faint);font-size:12px}

/* ---------- main + views ---------- */
main{flex:1;position:relative;overflow:hidden}
.view{position:absolute;inset:0;overflow:auto}
.view.list{padding:24px clamp(16px,4vw,40px) 80px;transition:padding-right .25s}
main.panel-open .view.list{padding-right:calc(var(--panel-w) + 24px)}
#graph{width:100%;height:100%;display:block;touch-action:none;cursor:grab;background:radial-gradient(circle at 50% 40%, var(--surface) 0%, var(--bg) 70%)}
#graph:active{cursor:grabbing}
.link{stroke:var(--edge);stroke-width:1.1;transition:stroke .15s, opacity .15s}
.link.ghost{stroke-dasharray:3 3}
.link.hl{stroke:var(--edge-hl);stroke-width:1.6}
.link.dim{opacity:.25}
.node{cursor:pointer;transition:opacity .15s}
.node .dot-c{fill:var(--c);stroke:var(--surface);stroke-width:1.5}
.node.s-seed .dot-c{fill-opacity:.28;stroke:var(--c);stroke-dasharray:3 2;stroke-width:1.6}
.node.s-evergreen .dot-c{filter:url(#glow);stroke:var(--c);stroke-width:2;stroke-opacity:.5}
.node.ghost .dot-c{fill:var(--bg);stroke:var(--ghost);stroke-dasharray:2 2;stroke-width:1.4}
.node .ring{fill:none;stroke:none}
.node.orphan .ring{stroke:var(--orphan);stroke-width:1.5;stroke-dasharray:1.5 3}
.node.index .dot-c{stroke:var(--c);stroke-width:3;stroke-opacity:.35}
.node.selected .ring{stroke:var(--accent);stroke-width:2.5;stroke-dasharray:none}
.node text{font:500 11px var(--ui);fill:var(--muted);text-anchor:middle;pointer-events:none;opacity:0;transition:opacity .15s;paint-order:stroke;stroke:var(--bg);stroke-width:3px;stroke-linejoin:round}
.node.ghost text{font-style:italic}
.node.show-label text{opacity:1}
.node.focus text,.node.selected text{fill:var(--text);font-weight:600}
.node.dim{opacity:.18}
.node.dim text{opacity:0}

.graph-controls{position:absolute;top:12px;left:12px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;z-index:5}
.seg{display:inline-flex;background:var(--surface);border:1px solid var(--border);border-radius:9px;padding:2px;box-shadow:var(--shadow)}
.seg button{border:0;background:none;padding:5px 10px;border-radius:7px;color:var(--muted);font-size:13px}
.seg button.active{background:var(--accent-soft);color:var(--text);font-weight:500}
.chip-toggle{display:inline-flex;align-items:center;gap:6px;background:var(--surface);border:1px solid var(--border);border-radius:9px;padding:5px 10px;font-size:13px;color:var(--muted);box-shadow:var(--shadow);cursor:pointer}
.graph-controls .btn{height:31px;box-shadow:var(--shadow)}
.legend{position:absolute;left:12px;bottom:12px;background:var(--surface);border:1px solid var(--border);border-radius:12px;box-shadow:var(--shadow);font-size:12.5px;max-width:260px;z-index:5}
.legend summary{padding:8px 12px;cursor:pointer;color:var(--muted);font-weight:500;list-style:none}
.legend summary::-webkit-details-marker{display:none}
.legend .lg-body{padding:0 12px 10px}
.legend .lg-row{display:flex;align-items:center;gap:8px;padding:3px 4px;border-radius:6px;cursor:pointer}
.legend .lg-row:hover{background:var(--surface-2)}
.legend .lg-row.off{opacity:.4}
.legend .lg-row .n{margin-left:auto;color:var(--faint)}
.legend hr{border:0;border-top:1px solid var(--border);margin:6px 0}
.legend svg{flex:none}
.graph-hint{position:absolute;top:56px;left:12px;background:var(--surface);border:1px solid var(--border);border-radius:9px;padding:6px 10px;color:var(--muted);font-size:12.5px;box-shadow:var(--shadow)}
.lib-error{position:absolute;inset:0;display:grid;place-items:center;color:var(--muted);text-align:center;padding:24px}

/* ---------- side panel / bottom sheet ---------- */
.panel{position:absolute;top:0;right:0;bottom:0;width:var(--panel-w);background:var(--surface);border-left:1px solid var(--border);box-shadow:var(--shadow);transform:translateX(102%);transition:transform .25s ease, height .25s ease;display:flex;flex-direction:column;z-index:20}
.panel.open{transform:none}
.panel-head{display:flex;align-items:center;gap:4px;padding:8px 10px;border-bottom:1px solid var(--border)}
.panel-head .sp{flex:1}
.icon-btn{border:0;background:none;width:34px;height:34px;border-radius:8px;display:grid;place-items:center;color:var(--muted)}
.icon-btn:hover{background:var(--surface-2);color:var(--text)}
.icon-btn:disabled{opacity:.3;cursor:default;background:none}
.icon-btn svg{width:18px;height:18px}
.panel-head .btn{height:30px;font-size:12.5px}
.sheet-grip{display:none;padding:8px 0 2px;touch-action:none}
.sheet-grip span{display:block;width:40px;height:5px;border-radius:3px;background:var(--border);margin:0 auto}
.panel-body{overflow:auto;padding:20px 26px 60px;flex:1;overscroll-behavior:contain}
.crumbs{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:10px}
.chip{display:inline-flex;align-items:center;gap:6px;font-size:12px;padding:3px 9px;border-radius:999px;background:var(--surface-2);color:var(--muted);border:0}
.chip.topic{background:color-mix(in srgb, var(--c) 14%, transparent);color:var(--text)}
.chip.topic::before{content:'';width:8px;height:8px;border-radius:50%;background:var(--c)}
.chip.st-seed{color:var(--seed)} .chip.st-budding{color:var(--budding)} .chip.st-evergreen{color:var(--evergreen)}
.chip.ghost-chip{border:1px dashed var(--ghost);background:none}
.chip.orph{color:var(--orphan)}
button.chip{cursor:pointer}
button.chip:hover{color:var(--text)}
.note-title{font:600 clamp(24px,3vw,30px)/1.2 var(--read);margin:4px 0 8px;letter-spacing:-.01em}
.meta{color:var(--muted);font-size:12.5px;display:flex;gap:12px;flex-wrap:wrap}
.tags{display:flex;gap:6px;flex-wrap:wrap;margin:12px 0 0}
.tags .chip::before{content:'#';opacity:.6;margin-right:-4px}
.prose{font-family:var(--read);font-size:17px;line-height:1.68;margin-top:18px;overflow-wrap:break-word}
.prose h1,.prose h2,.prose h3,.prose h4{font-family:var(--read);line-height:1.3;margin:1.5em 0 .5em}
.prose h1{font-size:1.5em} .prose h2{font-size:1.25em} .prose h3{font-size:1.08em}
.prose p,.prose ul,.prose ol,.prose blockquote,.prose table,.prose pre{margin:0 0 1em}
.prose ul,.prose ol{padding-left:1.4em}
.prose li{margin:.2em 0}
.prose blockquote{border-left:3px solid var(--accent);padding:.2em 0 .2em 1em;color:var(--muted);font-style:italic}
.prose code{font:.85em var(--mono);background:var(--surface-2);padding:.15em .4em;border-radius:5px}
.prose pre{background:var(--surface-2);padding:12px 14px;border-radius:10px;overflow:auto;line-height:1.5}
.prose pre code{background:none;padding:0}
.prose table{border-collapse:collapse;font-family:var(--ui);font-size:14px;display:block;overflow:auto}
.prose th,.prose td{border:1px solid var(--border);padding:6px 10px;text-align:left}
.prose th{background:var(--surface-2)}
.prose img{max-width:100%;border-radius:8px}
.prose hr{border:0;border-top:1px solid var(--border);margin:2em 0}
a.wikilink{color:var(--accent);text-decoration:none;border-bottom:1px solid color-mix(in srgb, var(--accent) 35%, transparent);cursor:pointer}
a.wikilink:hover{border-bottom-color:var(--accent)}
a.wikilink.ghost{color:var(--muted);border-bottom:1px dashed var(--ghost)}
.links-sec{margin-top:28px;border-top:1px solid var(--border);padding-top:16px}
.links-sec h3{font:600 12px var(--ui);text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin:0 0 10px}
.bl{display:block;width:100%;text-align:left;background:var(--surface-2);border:0;border-radius:10px;padding:10px 12px;margin-bottom:8px}
.bl:hover{background:var(--accent-soft)}
.bl .t{display:flex;align-items:center;gap:8px;font-weight:500}
.bl .t .dot{margin-top:0}
.bl .s{color:var(--muted);font-size:12.5px;margin-top:4px;font-family:var(--read)}
.bl .s b{color:var(--text);font-weight:600}
.chips{display:flex;gap:6px;flex-wrap:wrap}
.muted{color:var(--muted)}

/* ---------- list views ---------- */
.view h2.vh{font:600 22px var(--read);margin:0 0 4px}
.view p.vsub{color:var(--muted);margin:0 0 20px}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px}
.card{background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:18px;position:relative;overflow:hidden;cursor:pointer;text-align:left;display:flex;flex-direction:column;gap:8px;transition:transform .15s, box-shadow .15s}
.card:hover{transform:translateY(-2px);box-shadow:var(--shadow)}
.card::before{content:'';position:absolute;left:0;top:0;right:0;height:4px;background:var(--c)}
.card h3{margin:4px 0 0;font:600 18px var(--read)}
.card .desc{color:var(--muted);font-size:13.5px;flex:1}
.card .count{font-size:28px;font-weight:600;line-height:1;color:var(--c)}
.card .count small{font-size:13px;color:var(--muted);font-weight:400}
.bar{display:flex;height:6px;border-radius:3px;overflow:hidden;background:var(--surface-2)}
.bar span{display:block}
.card .row{display:flex;justify-content:space-between;align-items:center;gap:8px}
.card .acts{display:flex;gap:6px}
.rows{display:flex;flex-direction:column;gap:2px;max-width:900px}
.nrow{display:grid;grid-template-columns:92px 1fr auto;gap:14px;align-items:center;padding:10px 12px;border-radius:10px;cursor:pointer;background:none;border:0;text-align:left;width:100%}
.nrow:hover{background:var(--surface)}
.nrow .d{color:var(--faint);font:12px var(--mono)}
.nrow .tt{font-weight:500;display:flex;align-items:center;gap:8px}
.nrow .tt .dot{margin-top:0}
.nrow .sn{color:var(--muted);font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px}
.nrow .r{display:flex;gap:6px}
.month{font:600 12px var(--ui);color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin:18px 12px 6px}
.garden{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px}
.gcol{background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:16px}
.gcol h3{margin:0 0 4px;font:600 16px var(--read);display:flex;align-items:center;gap:8px}
.gcol h3 .n{margin-left:auto;font:600 13px var(--ui);color:var(--muted);background:var(--surface-2);border-radius:999px;padding:1px 9px}
.gcol p{color:var(--muted);font-size:12.5px;margin:0 0 12px}
.gitem{display:block;width:100%;text-align:left;border:0;background:var(--surface-2);border-radius:10px;padding:9px 11px;margin-bottom:6px}
.gitem:hover{background:var(--accent-soft)}
.gitem .t{font-weight:500;display:flex;gap:8px;align-items:center}
.gitem .t .dot{margin-top:0}
.gitem .s{color:var(--muted);font-size:12px;margin-top:3px}
.empty{color:var(--muted);padding:20px;text-align:center;border:1px dashed var(--border);border-radius:12px}
.toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:var(--text);color:var(--bg);padding:10px 16px;border-radius:10px;box-shadow:var(--shadow);z-index:100;font-size:13px}

/* ---------- phone ---------- */
@media (max-width: 760px){
  .topbar{gap:8px;padding:8px 12px}
  .brand span{display:none}
  .search{flex:1 1 0;max-width:none;min-width:0}
  .search input{height:34px}
  .search kbd{display:none}
  .filters{order:4;flex-basis:100%;overflow-x:auto;scrollbar-width:none}
  .filters select{flex:1;min-width:0;max-width:none}
  .topbar .btn.of span{display:none}
  .topbar .sp{display:none}
  .subbar{padding:0 8px;gap:8px}
  .tabs{overflow-x:auto;scrollbar-width:none}
  .stats{display:none}
  .stats.mobile{display:flex;margin:0;gap:10px;font-size:12px}
  .source{display:none}
  .panel{position:fixed;left:0;right:0;top:auto;bottom:0;width:auto;height:55dvh;border-left:0;border-top:1px solid var(--border);border-radius:18px 18px 0 0;transform:translateY(102%)}
  .panel.expanded{height:92dvh}
  .sheet-grip{display:block}
  .panel-body{padding:14px 18px 60px}
  .prose{font-size:16.5px}
  main.panel-open .view.list{padding-right:clamp(16px,4vw,40px)}
  .legend{max-width:calc(100% - 24px)}
  .nrow{grid-template-columns:1fr;gap:4px}
  .nrow .r{display:none}
  .graph-controls{right:12px}
}
@media (min-width: 761px){ .stats.mobile{display:none} .topbar .sp{display:none} }
`;

const ICONS = {
  logo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="6" cy="7" r="2.6"/><circle cx="18" cy="6" r="2"/><circle cx="16" cy="17" r="3"/><circle cx="6" cy="17" r="1.8"/><path d="M8.4 7.6 16 6.5M7.7 8.9l6.6 6.3M7.8 17h5.2M17.5 8l-.9 6"/></svg>',
  search: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  folder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
  expand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 15l6-6 6 6"/></svg>',
  target: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8"/></svg>',
};

const BODY = `
<header class="topbar">
  <div class="brand">${ICONS.logo}<span>Knowledge Base</span></div>
  <div class="sp"></div>
  <div class="search">
    ${ICONS.search}
    <input id="q" type="search" placeholder="Search titles and content" autocomplete="off" spellcheck="false" aria-label="Search notes">
    <kbd>/</kbd>
    <div id="results" class="results" role="listbox" hidden></div>
  </div>
  <div class="filters">
    <select id="f-topic" aria-label="Filter by topic"></select>
    <select id="f-tag" aria-label="Filter by tag"></select>
    <select id="f-status" aria-label="Filter by status"></select>
  </div>
  <button id="open-folder" class="btn of" title="Load a notes folder from disk">${ICONS.folder}<span>Open folder</span></button>
  <input id="folder-input" type="file" webkitdirectory directory multiple hidden>
</header>
<div class="subbar">
  <nav class="tabs" role="tablist">
    <button data-view="graph" class="active" role="tab">Graph</button>
    <button data-view="topics" role="tab">Topics</button>
    <button data-view="recent" role="tab">Recent</button>
    <button data-view="garden" role="tab">Garden</button>
  </nav>
  <div class="stats mobile" id="stats-m"></div>
  <div class="stats" id="stats"></div>
  <span class="source" id="source"></span>
</div>
<main id="main">
  <section id="view-graph" class="view">
    <svg id="graph" aria-label="Note graph"></svg>
    <div class="graph-controls">
      <div class="seg" id="mode-seg"><button data-mode="full" class="active">Full graph</button><button data-mode="local">Local</button></div>
      <div class="seg" id="hops-seg" hidden><button data-hops="1" class="active">1 hop</button><button data-hops="2">2 hops</button></div>
      <label class="chip-toggle"><input type="checkbox" id="show-ghosts" checked> Ghosts</label>
      <button class="btn" id="fit" title="Fit graph to screen">Fit</button>
    </div>
    <div class="graph-hint" id="graph-hint" hidden></div>
    <details class="legend" id="legend"><summary>Legend</summary><div class="lg-body" id="legend-body"></div></details>
  </section>
  <section id="view-topics" class="view list" hidden></section>
  <section id="view-recent" class="view list" hidden></section>
  <section id="view-garden" class="view list" hidden></section>
  <aside id="panel" class="panel" aria-hidden="true">
    <div class="sheet-grip" id="grip"><span></span></div>
    <div class="panel-head">
      <button class="icon-btn" id="p-back" title="Back" disabled>${ICONS.back}</button>
      <button class="btn" id="p-local" title="Show this note's local graph">${ICONS.target}Local graph</button>
      <div class="sp"></div>
      <button class="icon-btn" id="p-expand" title="Expand" hidden>${ICONS.expand}</button>
      <button class="icon-btn" id="p-close" title="Close (Esc)">${ICONS.close}</button>
    </div>
    <div class="panel-body" id="panel-body"></div>
  </aside>
</main>
`;

/* ------------------------------------------------------------------------------------
 * Browser app (serialised into the page)
 * ---------------------------------------------------------------------------------- */
function clientApp() {
  const core = window.KBCore;
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const PALETTE = {
    light: ['#3b5bdb', '#e8590c', '#2b8a3e', '#ae3ec9', '#c2255c', '#0c8599', '#e67700', '#5f3dc4', '#5c940d', '#1971c2'],
    dark: ['#7c93ff', '#ff922b', '#51cf66', '#da77f2', '#f06595', '#3bc9db', '#fcc419', '#9775fa', '#94d82d', '#4dabf7'],
  };
  const STATUS_ICON = { seed: '🌱', budding: '🌿', evergreen: '🌳' };
  const LABEL_K = 1.25;
  const darkMq = matchMedia('(prefers-color-scheme: dark)');
  const phoneMq = matchMedia('(max-width: 760px)');

  let D, byId, adj, topicIdx, searchIdx;
  const S = { view: 'graph', mode: 'full', hops: 1, selected: null, hover: null, f: { topic: '', tag: '', status: '' }, ghosts: true, history: [], qMatch: null };

  /* ---------- data ---------- */
  function load(data) {
    D = data;
    byId = new Map();
    D.notes.forEach(n => { n.ghost = false; byId.set(n.id, n); });
    D.ghosts.forEach(g => { g.ghost = true; byId.set(g.id, g); });
    adj = new Map();
    const link = (a, b) => { if (!adj.has(a)) adj.set(a, new Set()); adj.get(a).add(b); };
    D.edges.forEach(e => { link(e.source, e.target); link(e.target, e.source); });
    topicIdx = new Map(D.topics.map((t, i) => [t.id, i]));
    searchIdx = D.notes.map(n => ({ n, t: n.title.toLowerCase(), extra: n.tags.concat(n.aliases).join(' ').toLowerCase(), plain: core.plain(n.body.replace(/^\s*#\s+.*\n/, '')) }))
      .concat(D.ghosts.map(g => ({ n: g, t: g.title.toLowerCase(), extra: '', plain: '' })));
    for (const k of Object.keys(S.f)) {
      const ok = k === 'topic' ? topicIdx.has(S.f.topic) : k === 'tag' ? D.tags.some(t => t.tag === S.f.tag) : D.statuses.includes(S.f.status);
      if (!ok) S.f[k] = '';
    }
    fillFilters();
    renderStats();
    const when = new Date(D.generatedAt);
    $('#source').textContent = (D.origin === 'browser' ? 'Opened ' : 'Built from ') + (D.source || 'notes') + ' · ' + when.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
    if (S.selected && !byId.has(S.selected)) closePanel();
    renderAll();
  }
  const topicOf = id => D.topics[topicIdx.get(id)];
  function color(n) {
    if (!n || n.ghost) return 'var(--ghost)';
    const pal = darkMq.matches ? PALETTE.dark : PALETTE.light;
    return pal[(topicIdx.get(n.topic) || 0) % pal.length];
  }
  const passes = n => !n.ghost && (!S.f.topic || n.topic === S.f.topic) && (!S.f.tag || n.tags.includes(S.f.tag)) && (!S.f.status || n.status === S.f.status);
  const fmtDate = d => d ? new Date(d + 'T12:00:00').toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' }) : '';
  const dotHtml = n => n.ghost ? '<span class="dot ghost"></span>' : `<span class="dot" style="--c:${color(n)}"></span>`;
  const statusChip = n => n.status ? `<span class="chip st-${esc(n.status)}">${STATUS_ICON[n.status] || '•'} ${esc(n.status)}</span>` : '';
  const topicChip = n => { const t = topicOf(n.topic); return t ? `<button class="chip topic" data-topic="${esc(t.id)}" style="--c:${color(n)}" title="Filter by topic">${esc(t.name)}</button>` : ''; };

  function fillFilters() {
    const opt = (v, label, cur) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(label)}</option>`;
    $('#f-topic').innerHTML = opt('', 'All topics', S.f.topic) + D.topics.map(t => opt(t.id, `${t.name} (${t.count})`, S.f.topic)).join('');
    $('#f-tag').innerHTML = opt('', 'All tags', S.f.tag) + D.tags.map(t => opt(t.tag, `#${t.tag} (${t.count})`, S.f.tag)).join('');
    $('#f-status').innerHTML = opt('', 'Any status', S.f.status) + D.statuses.map(s => opt(s, `${STATUS_ICON[s] || '•'} ${s}`, S.f.status)).join('');
  }
  function renderStats() {
    const links = D.edges.filter(e => !e.ghost).length;
    const orphans = D.notes.filter(n => n.orphan).length;
    const cnt = s => D.notes.filter(n => n.status === s).length;
    $('#stats').innerHTML = `<span><b>${D.notes.length}</b> notes</span><span><b>${links}</b> links</span>` +
      `<span class="s-orph"><b>${orphans}</b> orphan${orphans === 1 ? '' : 's'}</span><span><b>${D.ghosts.length}</b> to write</span>` +
      `<span title="seeds vs evergreen">🌱 <b>${cnt('seed')}</b> · 🌳 <b>${cnt('evergreen')}</b></span>`;
    $('#stats-m').innerHTML = `<span><b>${D.notes.length}</b> notes</span><span>🌱 <b>${cnt('seed')}</b> · 🌳 <b>${cnt('evergreen')}</b></span>`;
  }
  function renderAll() {
    renderGraph();
    renderLegend();
    renderTopics(); renderRecent(); renderGarden();
    if (S.selected) renderPanel();
  }

  /* ---------- graph ---------- */
  let svg, gRoot, gLinks, gNodes, zoom, sim, linkSel, nodeSel, curK = 1, firstLayout = true, fitTimer;
  const cache = new Map();
  const sid = x => (typeof x === 'object' ? x.id : x);
  const radius = n => n.ghost ? 4 + Math.min(4, n.refs.length) : Math.min(24, 5 + Math.sqrt(n.degree) * 3 + (n.isIndex ? 2 : 0));

  function initGraph() {
    if (!window.d3) {
      $('#view-graph').insertAdjacentHTML('beforeend', '<div class="lib-error"><div><b>Couldn\'t load the graph library (D3) from the CDN.</b><br>Check your internet connection and reload. The Topics, Recent and Garden tabs still work.</div></div>');
      return;
    }
    svg = d3.select('#graph');
    svg.append('defs').html('<filter id="glow" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="3.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>');
    gRoot = svg.append('g');
    gLinks = gRoot.append('g');
    gNodes = gRoot.append('g');
    zoom = d3.zoom().scaleExtent([0.1, 6]).on('zoom', e => {
      gRoot.attr('transform', e.transform);
      const was = curK > LABEL_K; curK = e.transform.k;
      if (was !== curK > LABEL_K) updateClasses();
    });
    svg.call(zoom).on('dblclick.zoom', null);
    svg.on('click', e => { if (e.target === svg.node() && S.hover) { S.hover = null; updateClasses(); } });
    const box = svg.node().getBoundingClientRect();
    svg.call(zoom.transform, d3.zoomIdentity.translate(box.width / 2, box.height / 2));
    sim = d3.forceSimulation()
      .force('link', d3.forceLink().id(d => d.id).distance(l => (l.ghost ? 45 : 75)).strength(0.45))
      .force('charge', d3.forceManyBody().strength(-240).distanceMax(700))
      .force('x', d3.forceX(0).strength(0.055))
      .force('y', d3.forceY(0).strength(0.055))
      .force('collide', d3.forceCollide(d => d.r + 7))
      .on('tick', ticked);
  }

  function visible() {
    const allowed = new Set(D.notes.filter(passes).map(n => n.id));
    let keep;
    if (S.mode === 'local' && S.selected) {
      keep = new Set([S.selected]);
      let frontier = [S.selected];
      for (let h = 0; h < S.hops; h++) {
        const next = [];
        for (const id of frontier) for (const nb of adj.get(id) || []) {
          if (keep.has(nb)) continue;
          const n = byId.get(nb);
          if (n.ghost ? !S.ghosts : !allowed.has(nb)) continue;
          keep.add(nb); next.push(nb);
        }
        frontier = next;
      }
    } else {
      keep = allowed;
      if (S.ghosts) D.ghosts.forEach(g => { if (g.refs.some(r => allowed.has(r))) keep.add(g.id); });
    }
    return { ids: [...keep], edges: D.edges.filter(e => keep.has(e.source) && keep.has(e.target)) };
  }

  function renderGraph() {
    $('#hops-seg').hidden = S.mode !== 'local';
    $$('#mode-seg button').forEach(b => b.classList.toggle('active', b.dataset.mode === S.mode));
    $$('#hops-seg button').forEach(b => b.classList.toggle('active', +b.dataset.hops === S.hops));
    const hint = $('#graph-hint');
    hint.hidden = !(S.mode === 'local' && !S.selected);
    hint.textContent = 'Select a note to see its local graph.';
    if (!svg) return;

    const { ids, edges } = visible();
    const nodes = ids.map(id => {
      const src = byId.get(id);
      let n = cache.get(id);
      if (!n) {
        n = { id };
        const nb = [...(adj.get(id) || [])].map(x => cache.get(x)).find(x => x && x.x != null);
        if (nb) { n.x = nb.x + (Math.random() - 0.5) * 50; n.y = nb.y + (Math.random() - 0.5) * 50; }
        cache.set(id, n);
      }
      n.src = src; n.r = radius(src);
      return n;
    });
    const links = edges.map(e => ({ key: e.source + '>' + e.target, source: e.source, target: e.target, ghost: e.ghost }));

    linkSel = gLinks.selectAll('line').data(links, d => d.key).join('line').attr('class', d => 'link' + (d.ghost ? ' ghost' : ''));
    nodeSel = gNodes.selectAll('g.node').data(nodes, d => d.id).join(enter => {
      const g = enter.append('g');
      g.append('circle').attr('class', 'ring');
      g.append('circle').attr('class', 'dot-c');
      g.append('text');
      g.on('mouseenter', (e, d) => { S.hover = d.id; updateClasses(); })
        .on('mouseleave', () => { S.hover = null; updateClasses(); })
        .on('click', (e, d) => { e.stopPropagation(); openNote(d.id, { from: 'graph' }); })
        .call(d3.drag()
          .on('start', (e, d) => { if (!e.active) sim.alphaTarget(0.25).restart(); d.fx = d.x; d.fy = d.y; })
          .on('drag', (e, d) => { d.fx = e.x; d.fy = e.y; })
          .on('end', (e, d) => { if (!e.active) sim.alphaTarget(0); d.fx = null; d.fy = null; }));
      return g;
    });
    nodeSel.attr('class', d => {
      const s = d.src;
      return 'node' + (s.ghost ? ' ghost' : ' s-' + (s.status || 'unset')) + (s.orphan ? ' orphan' : '') + (s.isIndex ? ' index' : '');
    }).style('--c', d => color(d.src));
    nodeSel.select('.dot-c').attr('r', d => d.r);
    nodeSel.select('.ring').attr('r', d => d.r + 4.5);
    nodeSel.select('text').attr('dy', d => d.r + 13).text(d => (d.src.title.length > 30 ? d.src.title.slice(0, 28) + '…' : d.src.title));

    sim.nodes(nodes);
    sim.force('link').links(links);
    if (firstLayout) {
      const n = Math.min(300, Math.max(80, Math.round(30000 / Math.max(1, nodes.length))));
      sim.alpha(1); for (let i = 0; i < n; i++) sim.tick();
      ticked(); fit(false); firstLayout = false;
      sim.alpha(0.05).restart();
    } else {
      sim.alpha(0.6).restart();
      clearTimeout(fitTimer);
      fitTimer = setTimeout(() => fit(true), 650);
    }
    updateClasses();
  }

  function ticked() {
    if (!linkSel) return;
    linkSel.attr('x1', d => d.source.x).attr('y1', d => d.source.y).attr('x2', d => d.target.x).attr('y2', d => d.target.y);
    nodeSel.attr('transform', d => `translate(${d.x},${d.y})`);
  }

  function updateClasses() {
    if (!nodeSel) return;
    const focus = S.hover || S.selected;
    const nbr = focus ? new Set([focus].concat([...(adj.get(focus) || [])])) : null;
    const q = S.qMatch;
    const many = nodeSel.size() > 60 || phoneMq.matches;
    nodeSel
      .classed('dim', d => (nbr ? !nbr.has(d.id) : q ? !q.has(d.id) : false))
      .classed('focus', d => d.id === focus)
      .classed('selected', d => d.id === S.selected)
      .classed('show-label', d => curK > LABEL_K || (nbr ? nbr.has(d.id) : q ? q.has(d.id) : (!many || d.r >= 11)));
    linkSel
      .classed('hl', d => !!focus && (sid(d.source) === focus || sid(d.target) === focus))
      .classed('dim', d => (focus ? !(sid(d.source) === focus || sid(d.target) === focus) : !!q));
  }

  function usableRect() {
    const box = svg.node().getBoundingClientRect();
    let w = box.width, h = box.height;
    if (panelOpen()) {
      const pr = $('#panel').getBoundingClientRect();
      if (phoneMq.matches) h = Math.max(120, pr.top - box.top); else w = Math.max(200, pr.left - box.left);
    }
    return { w, h };
  }
  function fit(animate) {
    if (!svg) return;
    const ns = sim.nodes();
    if (!ns.length) return;
    const { w, h } = usableRect();
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    ns.forEach(n => { x0 = Math.min(x0, n.x - n.r); y0 = Math.min(y0, n.y - n.r); x1 = Math.max(x1, n.x + n.r); y1 = Math.max(y1, n.y + n.r + 16); });
    const pad = phoneMq.matches ? 30 : 70;
    const k = Math.max(0.15, Math.min(1.8, Math.min((w - pad * 2) / (x1 - x0 || 1), (h - pad * 2) / (y1 - y0 || 1))));
    const t = d3.zoomIdentity.translate(w / 2 - k * (x0 + x1) / 2, h / 2 - k * (y0 + y1) / 2).scale(k);
    (animate ? svg.transition().duration(550) : svg).call(zoom.transform, t);
  }
  function centerOn(id) {
    const n = cache.get(id);
    if (!svg || !n || n.x == null || !sim.nodes().includes(n)) return;
    const { w, h } = usableRect();
    svg.transition().duration(500).call(zoom.translateTo, n.x, n.y, [w / 2, h / 2]);
  }

  function renderLegend() {
    const counts = new Map();
    D.notes.forEach(n => counts.set(n.topic, (counts.get(n.topic) || 0) + 1));
    const sw = (cls, extra) => `<svg width="18" height="18" viewBox="-9 -9 18 18"><circle r="6" ${extra}/></svg>`;
    const fg = darkMq.matches ? '#bbb' : '#666';
    $('#legend-body').innerHTML =
      D.topics.map(t => `<div class="lg-row${S.f.topic && S.f.topic !== t.id ? ' off' : ''}" data-topic="${esc(t.id)}"><span class="dot" style="--c:${color({ topic: t.id })};margin:0"></span>${esc(t.name)}<span class="n">${counts.get(t.id) || 0}</span></div>`).join('') +
      '<hr>' +
      `<div class="lg-row" style="cursor:default">${sw('', `fill="${fg}" fill-opacity=".28" stroke="${fg}" stroke-dasharray="3 2" stroke-width="1.5"`)} Seed — faded, dashed</div>` +
      `<div class="lg-row" style="cursor:default">${sw('', `fill="${fg}"`)} Budding</div>` +
      `<div class="lg-row" style="cursor:default">${sw('', `fill="${fg}" filter="url(#glow)" stroke="${fg}" stroke-opacity=".5" stroke-width="2"`)} Evergreen — glowing</div>` +
      `<div class="lg-row" style="cursor:default"><svg width="18" height="18" viewBox="-9 -9 18 18"><circle r="4" fill="${fg}"/><circle r="7.5" fill="none" stroke="var(--orphan)" stroke-dasharray="1.5 3" stroke-width="1.5"/></svg> Orphan — no links</div>` +
      `<div class="lg-row" style="cursor:default"><svg width="18" height="18" viewBox="-9 -9 18 18"><circle r="5" fill="none" stroke="var(--ghost)" stroke-dasharray="2 2" stroke-width="1.4"/></svg> Ghost — not written yet</div>` +
      '<div class="muted" style="padding:4px;font-size:11.5px">Size = number of links</div>';
  }

  /* ---------- panel ---------- */
  const panelOpen = () => $('#panel').classList.contains('open');
  function showPanel() {
    $('#panel').classList.add('open');
    $('#panel').setAttribute('aria-hidden', 'false');
    $('#main').classList.add('panel-open');
  }
  function closePanel() {
    $('#panel').classList.remove('open', 'expanded');
    $('#panel').setAttribute('aria-hidden', 'true');
    $('#main').classList.remove('panel-open');
    S.selected = null; S.history = [];
    setHash('');
    if (S.mode === 'local') renderGraph(); else updateClasses();
  }
  function setHash(id) {
    try { history.replaceState(null, '', id ? '#note=' + encodeURIComponent(id) : location.pathname + location.search); } catch (e) { /* file:// in some browsers */ }
  }

  function openNote(id, opts) {
    opts = opts || {};
    if (!byId.has(id)) return;
    if (S.selected && S.selected !== id && !opts.back) S.history.push(S.selected);
    S.selected = id;
    const wasOpen = panelOpen();
    renderPanel();
    showPanel();
    setHash(id);
    $('#panel-body').scrollTop = 0;
    if (S.mode === 'local') renderGraph();
    else {
      updateClasses();
      if ((opts.from !== 'graph' || phoneMq.matches) && S.view === 'graph') setTimeout(() => centerOn(id), wasOpen ? 0 : 280);
    }
  }

  function contextLine(src, targetId) {
    for (const line of src.body.split('\n')) {
      if (!line.includes('[[')) continue;
      let hit = false;
      const out = line.replace(core.WIKI, (m, inner) => {
        const L = core.parseLink(inner);
        const id = core.resolve(D.index, L.target) || core.ghostId(L.target);
        const label = esc(L.alias || L.target);
        if (id === targetId) { hit = true; return '\u0001' + label + '\u0002'; }
        return label;
      });
      if (hit) {
        const p = esc(core.plain(out.replace(/[\u0001\u0002]/g, m => (m === '\u0001' ? '@@B@@' : '@@/B@@'))));
        return p.replace(/@@B@@/g, '<b>').replace(/@@\/B@@/g, '</b>');
      }
    }
    return '';
  }

  function mdToHtml(n) {
    let body = n.body;
    const h1 = body.match(/^\s*#\s+(.+?)\s*\n/);
    if (h1 && core.normKey(h1[1]) === core.normKey(n.title)) body = body.slice(h1[0].length);
    body = core.mapOutsideCode(body, seg => seg.replace(core.WIKI, (m, inner) => {
      const L = core.parseLink(inner);
      if (!L.target) return m;
      const id = core.resolve(D.index, L.target);
      const label = esc(L.alias || (L.heading ? L.target + ' › ' + L.heading : L.target));
      return id
        ? `<a href="#" class="wikilink" data-id="${esc(id)}">${label}</a>`
        : `<a href="#" class="wikilink ghost" data-id="${esc(core.ghostId(L.target))}" title="Not written yet">${label}</a>`;
    }));
    let html = window.marked ? marked.parse(body, { gfm: true }) : '<pre style="white-space:pre-wrap">' + esc(body) + '</pre>';
    if (window.DOMPurify) html = DOMPurify.sanitize(html);
    return html;
  }

  function linkList(ids, targetId) {
    return ids.map(id => byId.get(id)).filter(Boolean).sort((a, b) => a.title.localeCompare(b.title)).map(s => {
      const ctx = targetId ? contextLine(s, targetId) : '';
      return `<button class="bl" data-id="${esc(s.id)}"><div class="t">${dotHtml(s)}${esc(s.title)}</div>${ctx ? `<div class="s">${ctx}</div>` : ''}</button>`;
    }).join('');
  }

  function renderPanel() {
    const n = byId.get(S.selected);
    if (!n) return;
    $('#p-back').disabled = !S.history.length;
    $('#p-local').hidden = S.mode === 'local';
    $('#p-expand').hidden = !phoneMq.matches;
    let h;
    if (n.ghost) {
      const tc = {};
      n.refs.forEach(r => { const t = byId.get(r).topic; tc[t] = (tc[t] || 0) + 1; });
      const topic = Object.entries(tc).sort((a, b) => b[1] - a[1])[0];
      const file = (topic && topic[0] ? topic[0] + '/' : '') + n.title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') + '.md';
      h = `<div class="crumbs"><span class="chip ghost-chip">✎ Not written yet</span></div>
        <h1 class="note-title">${esc(n.title)}</h1>
        <p class="muted" style="font-family:var(--read);font-size:16px">This note doesn't exist yet. ${n.refs.length} note${n.refs.length === 1 ? ' links' : 's link'} to it, so it's on your to-write list.</p>
        <p class="muted">Suggested file: <code style="font-family:var(--mono)">${esc(file)}</code></p>
        <section class="links-sec"><h3>Wanted by (${n.refs.length})</h3>${linkList(n.refs, n.id)}</section>`;
    } else {
      const meta = [n.created && `Created ${fmtDate(n.created)}`, n.updated && `Updated ${fmtDate(n.updated)}`, `${n.words} words`, n.type && n.type].filter(Boolean);
      h = `<div class="crumbs">${topicChip(n)}${statusChip(n)}${n.orphan ? '<span class="chip orph">○ orphan</span>' : ''}</div>
        <h1 class="note-title">${esc(n.title)}</h1>
        <div class="meta">${meta.map(m => `<span>${esc(m)}</span>`).join('')}</div>
        ${n.tags.length ? `<div class="tags">${n.tags.map(t => `<button class="chip" data-tag="${esc(t)}" title="Filter by tag">${esc(t)}</button>`).join('')}</div>` : ''}
        <article class="prose">${mdToHtml(n)}</article>
        <section class="links-sec"><h3>Linked from (${n.in.length})</h3>${n.in.length ? linkList(n.in, n.id) : '<p class="muted">No backlinks yet.</p>'}</section>
        ${n.out.length ? `<section class="links-sec"><h3>Links to (${n.out.length})</h3>${linkList(n.out)}</section>` : ''}
        ${n.ghostOut.length ? `<section class="links-sec"><h3>Not written yet (${n.ghostOut.length})</h3><div class="chips">${n.ghostOut.map(g => `<button class="chip ghost-chip" data-id="${esc(g)}">${esc(byId.get(g).title)}</button>`).join('')}</div></section>` : ''}
        <p class="muted" style="margin-top:28px;font-size:12px;font-family:var(--mono)">${esc(n.path)}</p>`;
    }
    $('#panel-body').innerHTML = h;
  }

  /* ---------- list views ---------- */
  function statusBar(sc) {
    const total = Object.values(sc).reduce((a, b) => a + b, 0) || 1;
    const col = { seed: 'var(--seed)', budding: 'var(--budding)', evergreen: 'var(--evergreen)' };
    return `<div class="bar" title="${esc(Object.entries(sc).map(([k, v]) => `${v} ${k}`).join(', '))}">` +
      ['seed', 'budding', 'evergreen', ...Object.keys(sc).filter(k => !col[k])].filter(k => sc[k]).map(k => `<span style="width:${(sc[k] / total) * 100}%;background:${col[k] || 'var(--faint)'}"></span>`).join('') + '</div>';
  }
  function renderTopics() {
    const cards = D.topics.map(t => {
      const c = color({ topic: t.id });
      const sc = t.statusCounts;
      return `<div class="card" role="button" tabindex="0" data-open-topic="${esc(t.id)}" style="--c:${c}">
        <div class="row"><div class="count">${t.count} <small>note${t.count === 1 ? '' : 's'}</small></div></div>
        <h3>${esc(t.name)}</h3>
        <div class="desc">${esc(t.description || (t.indexId ? '' : 'No _index.md in this folder yet.'))}</div>
        ${statusBar(sc)}
        <div class="row"><span class="muted" style="font-size:12px">${['seed', 'budding', 'evergreen'].filter(s => sc[s]).map(s => `${STATUS_ICON[s]} ${sc[s]}`).join('  ')}</span>
        <div class="acts"><button class="btn" data-graph-topic="${esc(t.id)}" style="height:28px;font-size:12px">Show in graph</button></div></div>
      </div>`;
    }).join('');
    $('#view-topics').innerHTML = `<h2 class="vh">Topics</h2><p class="vsub">One card per topic folder, from its <code>_index.md</code>.</p><div class="cards">${cards || '<div class="empty">No topics yet.</div>'}</div>`;
  }
  function noteRow(n, date) {
    const t = topicOf(n.topic);
    return `<button class="nrow" data-id="${esc(n.id)}"><span class="d">${esc(date || '')}</span>
      <span style="min-width:0"><span class="tt">${dotHtml(n)}${esc(n.title)}</span><div class="sn">${esc(core.plain(n.body).slice(0, 160))}</div></span>
      <span class="r">${t ? `<span class="chip topic" style="--c:${color(n)}">${esc(t.name)}</span>` : ''}${statusChip(n)}</span></button>`;
  }
  function filterNote() {
    const bits = [S.f.topic && topicOf(S.f.topic).name, S.f.tag && '#' + S.f.tag, S.f.status].filter(Boolean);
    return bits.length ? ` Filtered by ${bits.map(esc).join(', ')}.` : '';
  }
  function renderRecent() {
    const list = D.notes.filter(passes).slice().sort((a, b) => (b.updated || '').localeCompare(a.updated || '') || a.title.localeCompare(b.title));
    let html = '', month = '';
    for (const n of list) {
      const m = n.updated ? new Date(n.updated + 'T12:00:00').toLocaleDateString([], { year: 'numeric', month: 'long' }) : 'Undated';
      if (m !== month) { html += `<div class="month">${esc(m)}</div>`; month = m; }
      html += noteRow(n, n.updated);
    }
    $('#view-recent').innerHTML = `<h2 class="vh">Recent</h2><p class="vsub">Notes by last updated date.${filterNote()}</p><div class="rows">${html || '<div class="empty">No notes match the filters.</div>'}</div>`;
  }
  function renderGarden() {
    const vis = D.notes.filter(passes);
    const seeds = vis.filter(n => n.status === 'seed').sort((a, b) => (a.updated || '').localeCompare(b.updated || ''));
    const orphans = vis.filter(n => n.orphan);
    const visIds = new Set(vis.map(n => n.id));
    const ghosts = D.ghosts.filter(g => g.refs.some(r => visIds.has(r)));
    const item = (n, sub) => `<button class="gitem" data-id="${esc(n.id)}"><div class="t">${dotHtml(n)}${esc(n.title)}</div><div class="s">${sub}</div></button>`;
    const col = (title, icon, desc, items) => `<div class="gcol"><h3>${icon} ${title}<span class="n">${items.length}</span></h3><p>${desc}</p>${items.join('') || '<div class="empty">Nothing here — nice.</div>'}</div>`;
    $('#view-garden').innerHTML = `<h2 class="vh">Garden</h2><p class="vsub">What to tend next.${filterNote()}</p><div class="garden">
      ${col('Ghost links', '✎', 'Linked but not written yet — your to-write list, most-wanted first.', ghosts.map(g => item(g, `wanted by ${g.refs.map(r => esc(byId.get(r).title)).join(', ')}`)))}
      ${col('Seeds', '🌱', 'Rough notes to grow, oldest first.', seeds.map(n => item(n, `${esc(topicOf(n.topic) ? topicOf(n.topic).name : '')} · updated ${esc(fmtDate(n.updated))}`)))}
      ${col('Orphans', '○', 'No links in or out. Connect them to something.', orphans.map(n => item(n, `${esc(topicOf(n.topic) ? topicOf(n.topic).name : '')} · ${n.words} words`)))}
    </div>`;
  }

  function setView(v) {
    S.view = v;
    $$('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.view === v));
    ['graph', 'topics', 'recent', 'garden'].forEach(x => { $('#view-' + x).hidden = x !== v; });
  }
  function setFilter(k, v) {
    S.f[k] = v;
    $('#f-' + k).value = v;
    renderGraph(); renderLegend(); renderRecent(); renderGarden();
  }

  /* ---------- search ---------- */
  let resIdx = -1;
  function search(q) {
    q = q.trim().toLowerCase();
    if (q.length < 1) return [];
    const words = q.split(/\s+/);
    const out = [];
    for (const e of searchIdx) {
      let score = 0, pos = -1;
      for (const w of words) {
        let s = 0;
        if (e.t.startsWith(w)) s += 6; else if (e.t.includes(w)) s += 4;
        if (e.extra.includes(w)) s += 2;
        const p = e.plain.toLowerCase().indexOf(w);
        if (p >= 0) { s += 1; if (pos < 0) pos = p; }
        if (!s) { score = 0; break; }
        score += s;
      }
      if (score) out.push({ e, score, pos });
    }
    return out.sort((a, b) => b.score - a.score || a.e.n.title.localeCompare(b.e.n.title)).slice(0, 30);
  }
  function hl(text, q) {
    let h = esc(text);
    q.trim().split(/\s+/).filter(Boolean).forEach(w => {
      h = h.replace(new RegExp('(' + esc(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig'), '<mark>$1</mark>');
    });
    return h;
  }
  function renderResults() {
    const q = $('#q').value;
    const box = $('#results');
    if (!q.trim()) { box.hidden = true; S.qMatch = null; updateClasses(); return; }
    const res = search(q);
    S.qMatch = new Set(res.map(r => r.e.n.id));
    updateClasses();
    resIdx = res.length ? 0 : -1;
    box.innerHTML = res.length ? res.slice(0, 12).map((r, i) => {
      const n = r.e.n;
      let snip = n.ghost ? 'Not written yet' : '';
      if (!n.ghost) {
        const p = r.pos >= 0 ? r.pos : 0;
        snip = (p > 40 ? '…' : '') + r.e.plain.slice(Math.max(0, p - 40), p + 120);
      }
      return `<div class="res${i === 0 ? ' active' : ''}" data-id="${esc(n.id)}" role="option">${dotHtml(n)}<div><div class="rt">${hl(n.title, q)}</div><div class="rs">${hl(snip, q)}</div></div></div>`;
    }).join('') : '<div class="res-empty">No matches.</div>';
    box.hidden = false;
  }
  function pickResult(id) {
    $('#results').hidden = true;
    $('#q').blur();
    openNote(id, { from: 'search' });
  }

  /* ---------- open folder ---------- */
  async function loadFolder(fileList) {
    const files = [...fileList].filter(f => /\.md$/i.test(f.name));
    if (!files.length) { toast('No .md files found in that folder.'); return; }
    const root = (files[0].webkitRelativePath || '').split('/')[0];
    const items = await Promise.all(files.map(async f => {
      const parts = (f.webkitRelativePath || f.name).split('/');
      if (root && parts[0] === root) parts.shift();
      return { path: parts.join('/'), content: await f.text(), mtime: f.lastModified };
    }));
    const clean = items.filter(it => !it.path.split('/').some(s => s.startsWith('.') || s === 'node_modules'));
    const data = core.build(clean, { source: root ? root + '/' : 'selected files', origin: 'browser' });
    cache.clear(); firstLayout = true;
    S.history = [];
    if (panelOpen()) closePanel();
    load(data);
    toast(`Loaded ${data.notes.length} notes from ${root || 'selection'}.`);
  }
  let toastT;
  function toast(msg) {
    let t = $('.toast');
    if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 2600);
  }

  /* ---------- events ---------- */
  function wire() {
    $$('.tabs button').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
    $('#f-topic').addEventListener('change', e => setFilter('topic', e.target.value));
    $('#f-tag').addEventListener('change', e => setFilter('tag', e.target.value));
    $('#f-status').addEventListener('change', e => setFilter('status', e.target.value));
    $$('#mode-seg button').forEach(b => b.addEventListener('click', () => { S.mode = b.dataset.mode; if (panelOpen()) renderPanel(); renderGraph(); }));
    $$('#hops-seg button').forEach(b => b.addEventListener('click', () => { S.hops = +b.dataset.hops; renderGraph(); }));
    $('#show-ghosts').addEventListener('change', e => { S.ghosts = e.target.checked; renderGraph(); });
    $('#fit').addEventListener('click', () => fit(true));
    $('#legend-body').addEventListener('click', e => {
      const r = e.target.closest('[data-topic]');
      if (r) setFilter('topic', S.f.topic === r.dataset.topic ? '' : r.dataset.topic);
    });

    // Anything with data-id opens that note; data-topic/data-tag set filters.
    document.addEventListener('click', e => {
      const el = e.target.closest('[data-id],[data-topic],[data-tag],[data-graph-topic],[data-open-topic]');
      if (!el || el.closest('#legend-body') || el.closest('#results')) return;
      if (el.dataset.graphTopic != null) { e.stopPropagation(); setFilter('topic', el.dataset.graphTopic); setView('graph'); return; }
      if (el.dataset.openTopic != null) {
        const t = topicOf(el.dataset.openTopic);
        if (t && t.indexId) openNote(t.indexId, { from: 'list' }); else { setFilter('topic', el.dataset.openTopic); setView('recent'); }
        return;
      }
      e.preventDefault();
      if (el.dataset.id) openNote(el.dataset.id, { from: 'link' });
      else if (el.dataset.topic != null) setFilter('topic', el.dataset.topic);
      else if (el.dataset.tag != null) setFilter('tag', el.dataset.tag);
    });
    $('#view-topics').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.dataset.openTopic != null) e.target.click(); });
    // Relative Markdown links to other notes: [text](other-note.md)
    $('#panel-body').addEventListener('click', e => {
      const a = e.target.closest('.prose a[href]');
      if (!a || a.classList.contains('wikilink')) return;
      const href = decodeURIComponent(a.getAttribute('href') || '');
      if (/^[a-z]+:/i.test(href) || href.startsWith('#')) { if (/^https?:/i.test(href)) a.target = '_blank'; return; }
      const id = core.resolve(D.index, href.replace(/#.*$/, '').replace(/^\.?\//, ''));
      if (id) { e.preventDefault(); openNote(id, { from: 'link' }); }
    });

    $('#p-close').addEventListener('click', closePanel);
    $('#p-back').addEventListener('click', () => { const id = S.history.pop(); if (id) openNote(id, { back: true, from: 'link' }); });
    $('#p-local').addEventListener('click', () => { S.mode = 'local'; setView('graph'); renderPanel(); renderGraph(); });
    $('#p-expand').addEventListener('click', () => $('#panel').classList.toggle('expanded'));

    // Bottom-sheet drag (phone)
    const panel = $('#panel'), grip = $('#grip');
    let y0 = null, dy = 0;
    grip.addEventListener('pointerdown', e => { y0 = e.clientY; dy = 0; panel.style.transition = 'none'; grip.setPointerCapture(e.pointerId); });
    grip.addEventListener('pointermove', e => { if (y0 == null) return; dy = e.clientY - y0; panel.style.transform = `translateY(${Math.max(0, dy)}px)`; });
    const end = () => {
      if (y0 == null) return;
      panel.style.transition = ''; panel.style.transform = '';
      if (dy > 90) { if (panel.classList.contains('expanded')) panel.classList.remove('expanded'); else closePanel(); }
      else if (dy < -30) panel.classList.add('expanded');
      else if (Math.abs(dy) < 4) panel.classList.toggle('expanded');
      y0 = null;
    };
    grip.addEventListener('pointerup', end);
    grip.addEventListener('pointercancel', end);

    const q = $('#q');
    q.addEventListener('input', renderResults);
    q.addEventListener('focus', () => { if (q.value.trim()) renderResults(); });
    q.addEventListener('keydown', e => {
      const items = $$('#results .res');
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!items.length) return;
        resIdx = (resIdx + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        items.forEach((x, i) => x.classList.toggle('active', i === resIdx));
        items[resIdx].scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter' && items[resIdx]) { e.preventDefault(); pickResult(items[resIdx].dataset.id); }
    });
    $('#results').addEventListener('mousedown', e => { const r = e.target.closest('.res'); if (r) { e.preventDefault(); pickResult(r.dataset.id); } });
    document.addEventListener('click', e => { if (!e.target.closest('.search')) $('#results').hidden = true; });

    document.addEventListener('keydown', e => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
      if (e.key === '/' && !typing) { e.preventDefault(); q.focus(); q.select(); }
      else if (e.key === 'Escape') {
        if (document.activeElement === q) {
          if (!$('#results').hidden) $('#results').hidden = true;
          else { q.value = ''; renderResults(); q.blur(); }
        } else if (panelOpen()) closePanel();
      }
    });

    $('#open-folder').addEventListener('click', () => $('#folder-input').click());
    $('#folder-input').addEventListener('change', e => { loadFolder(e.target.files).catch(err => toast('Could not read folder: ' + err.message)); e.target.value = ''; });

    const recolor = () => { renderGraph(); renderLegend(); renderTopics(); renderRecent(); renderGarden(); if (S.selected) renderPanel(); };
    (darkMq.addEventListener ? darkMq.addEventListener('change', recolor) : darkMq.addListener(recolor));
    window.addEventListener('hashchange', () => {
      const m = location.hash.match(/^#note=(.+)$/);
      if (m && decodeURIComponent(m[1]) !== S.selected) openNote(decodeURIComponent(m[1]), { from: 'link' });
    });
  }

  /* ---------- boot ---------- */
  wire();
  if (!phoneMq.matches) $('#legend').open = true;
  initGraph();
  load(JSON.parse(document.getElementById('kb-data').textContent));
  const m = location.hash.match(/^#note=(.+)$/);
  if (m && byId.has(decodeURIComponent(m[1]))) openNote(decodeURIComponent(m[1]), { from: 'link' });
  window.KB = { get data() { return D; }, openNote, state: S };
}

/* ------------------------------------------------------------------------------------
 * Node build
 * ---------------------------------------------------------------------------------- */
function renderHtml(data) {
  const json = JSON.stringify(data).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<title>Knowledge Base</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Literata:opsz,wght@7..72,400;7..72,600&display=swap" rel="stylesheet">
<style>${CSS}</style>
</head>
<body>
${BODY}
<script id="kb-data" type="application/json">${json}</script>
<script src="${CDN.d3}"></script>
<script src="${CDN.marked}"></script>
<script src="${CDN.purify}"></script>
<script>window.KBCore = (${kbCore.toString()})();</script>
<script>(${clientApp.toString()})();</script>
</body>
</html>
`;
}

function scan(root) {
  const fs = require('fs'), path = require('path');
  const out = [];
  (function walk(dir) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ent.name.startsWith('.') || ent.name === 'node_modules') continue;
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (ent.isFile() && /\.md$/i.test(ent.name)) {
        out.push({ path: path.relative(root, p).split(path.sep).join('/'), content: fs.readFileSync(p, 'utf8'), mtime: fs.statSync(p).mtimeMs });
      }
    }
  })(root);
  return out;
}

function main(argv) {
  const fs = require('fs'), path = require('path');
  let dir = null, out = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out' || argv[i] === '-o') out = argv[++i];
    else if (argv[i] === '-h' || argv[i] === '--help') { console.log('usage: node build-viewer.js [notes-dir] [--out viewer.html]'); return; }
    else dir = argv[i];
  }
  dir = path.resolve(dir || path.join(__dirname, 'notes'));
  out = path.resolve(out || path.join(__dirname, 'viewer.html'));
  if (!fs.existsSync(dir)) { console.error(`Notes folder not found: ${dir}`); process.exit(1); }

  const files = scan(dir);
  const core = kbCore();
  const label = path.relative(process.cwd(), dir) || path.basename(dir);
  const data = core.build(files, { source: label.replace(/\\/g, '/') + '/', origin: 'build' });
  fs.writeFileSync(out, renderHtml(data));

  const cnt = s => data.notes.filter(n => n.status === s).length;
  console.log(`Scanned ${files.length} Markdown files in ${dir}`);
  console.log(`  ${data.notes.length} notes · ${data.edges.filter(e => !e.ghost).length} links · ${data.ghosts.length} ghost links · ${data.notes.filter(n => n.orphan).length} orphans`);
  console.log(`  topics: ${data.topics.map(t => `${t.name} (${t.count})`).join(', ')}`);
  console.log(`  status: ${cnt('seed')} seed · ${cnt('budding')} budding · ${cnt('evergreen')} evergreen`);
  console.log(`Wrote ${path.relative(process.cwd(), out) || out} (${(fs.statSync(out).size / 1024).toFixed(1)} KB)`);
}

if (typeof module !== 'undefined' && require.main === module) main(process.argv.slice(2));
if (typeof module !== 'undefined') module.exports = { kbCore, renderHtml, scan };
