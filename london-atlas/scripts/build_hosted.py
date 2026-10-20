"""Assemble a single self-contained page for hosting as a claude.ai Artifact:
styles and data inlined, Leaflet from cdnjs, and hosted mode on (no tile servers, no TfL /
postcode calls, no file downloads or browser dialogs — the artifact sandbox blocks them).

    python3 london-atlas/scripts/build_hosted.py   ->  london-atlas/dist/london-atlas-explorer.html
"""
import pathlib, re

ROOT = pathlib.Path(__file__).resolve().parent.parent
html = (ROOT / "index.html").read_text()
head = html[html.index("<title>"):html.index("</head>")]
body = html[html.index("<body>") + len("<body>"):html.index("</body>")]

css = (ROOT / "vendor/leaflet.css").read_text() + "\n" + (ROOT / "styles.css").read_text()
head = re.sub(r'<link rel="stylesheet" href="vendor/leaflet.css">\s*', "", head)
head = head.replace('<link rel="stylesheet" href="styles.css">', "<style>\n" + css + "\n</style>")


def inline(m):
    src = m.group(1)
    if src == "vendor/leaflet.js":
        return '<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>\n<script>window.ATLAS_HOSTED = true;</script>'
    return "<script>\n" + (ROOT / src).read_text().replace("</script", "<\\/script") + "\n</script>"


body = re.sub(r'<script src="([^"]+)"></script>', inline, body)
out = ROOT / "dist" / "london-atlas-explorer.html"
out.parent.mkdir(exist_ok=True)
out.write_text(head.strip() + "\n" + body.strip() + "\n")
print(out, out.stat().st_size // 1024, "KB")
