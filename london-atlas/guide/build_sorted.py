"""Build "London, sorted": one static illustrated map plus a spot list.

    python3 london-atlas/guide/build_sorted.py
      -> london-atlas/guide/index.html          (open locally)
      -> london-atlas/dist/london-atlas.html     (fragment for the claude.ai Artifact)

Zones are Voronoi cells around each researched area's centre, capped at ~1.5 km and clipped to land:
indicative only — London neighbourhoods have no official boundaries.
"""
import json, math, pathlib, re, sys

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT / "scripts"))
from gpkg import dp  # noqa: E402

LNG0, LNG1, LAT0, LAT1 = -0.27, 0.03, 51.448, 51.572
UNIT = 20.0  # metres per SVG unit
KX = 111320 * math.cos(math.radians((LAT0 + LAT1) / 2)) / UNIT
KY = 111130 / UNIT
W, H = round((LNG1 - LNG0) * KX), round((LAT1 - LAT0) * KY)


def P(ll):
    return ((ll[1] - LNG0) * KX, (LAT1 - ll[0]) * KY)


def js_data(path, var):
    s = (ROOT / path).read_text()
    m = re.search(r"window\." + var + r"\s*=\s*", s)
    return json.loads(s[m.end():].rstrip().rstrip(";"))


def path_d(rings, tol):
    out = []
    for r in rings:
        pts = dp([P(p) for p in r], tol)
        if len(pts) < 3:
            continue
        out.append("M" + "L".join(f"{x:.0f} {y:.0f}" for x, y in pts) + "Z")
    return "".join(out)


def visible(r):
    xs = [P(p)[0] for p in r]; ys = [P(p)[1] for p in r]
    return max(xs) > -50 and min(xs) < W + 50 and max(ys) > -50 and min(ys) < H + 50


os_ = js_data("data/osbase.js", "ATLAS_OS")
land = path_d([r for b in os_["land"] for r in b["r"] if visible(r)], 1.2)
parks = path_d([g["r"][0] for g in os_["green"] if g["ha"] >= 4 and visible(g["r"][0])], 1.0)

# areas from the researched entries (plain JS object literals -> evaluate with node)
import subprocess  # noqa: E402
areas = json.loads(subprocess.check_output(["node", "-e", """
global.window={};require('%s/data/areas-core.js');require('%s/data/areas-rest.js');
console.log(JSON.stringify(window.ATLAS_AREAS.map(a=>({id:a.id,name:a.name.replace(/ \\(.*\\)$/,''),ll:a.ll}))))""" % (ROOT, ROOT)]))


def clip(poly, a, b, c):  # keep a*x + b*y <= c
    out = []
    for i in range(len(poly)):
        p, q = poly[i], poly[(i + 1) % len(poly)]
        fp, fq = a * p[0] + b * p[1] - c, a * q[0] + b * q[1] - c
        if fp <= 0:
            out.append(p)
        if fp * fq < 0:
            t = fp / (fp - fq); out.append((p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])))
    return out


CAP = 1500 / UNIT
cells, pos = {}, {}
for a in areas:
    x0, y0 = P(a["ll"]); pos[a["id"]] = [round(x0), round(y0)]
    poly = [(x0 + CAP * math.cos(k * math.pi / 16), y0 + CAP * math.sin(k * math.pi / 16)) for k in range(32)]
    for b in areas:
        if b is a:
            continue
        x1, y1 = P(b["ll"])
        poly = clip(poly, x1 - x0, y1 - y0, ((x1 ** 2 + y1 ** 2) - (x0 ** 2 + y0 ** 2)) / 2)
        if not poly:
            break
    cells[a["id"]] = "M" + "L".join(f"{x:.0f} {y:.0f}" for x, y in poly) + "Z" if poly else ""

geo = {"w": W, "h": H, "cells": cells, "pos": pos, "names": {a["id"]: a["name"] for a in areas},
       "proj": {"lng0": LNG0, "lat1": LAT1, "kx": KX, "ky": KY}}
tpl = (HERE / "sorted-template.html").read_text()
page = (tpl.replace("{{W}}", str(W)).replace("{{H}}", str(H)).replace("{{LAND}}", land).replace("{{PARKS}}", parks)
        .replace("{{GEO}}", json.dumps(geo, separators=(",", ":")))
        .replace("{{DATA}}", (HERE / "sorted-data.js").read_text() + "\n" + (ROOT / "data/ratings.js").read_text()))
out = ROOT / "dist" / "london-atlas.html"
out.parent.mkdir(exist_ok=True)
out.write_text(page)
head, body = page.split("<!--body-->", 1)
(HERE / "index.html").write_text("<!doctype html>\n<html lang=\"en-GB\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1, viewport-fit=cover\">\n"
                                 + head + "</head>\n<body>\n" + body + "</body>\n</html>\n")
print(f"{W}x{H} land {len(land)//1024}KB parks {len(parks)//1024}KB page {out.stat().st_size//1024}KB")
