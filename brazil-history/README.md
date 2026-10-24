# How Brazil Became Brazil

*An intellectual and visual history — with Rio de Janeiro as a recurring protagonist.*

A 43-slide, browser-based presentation (about 50 minutes): a prologue, five acts and a coda, from Indigenous Brazil and the South Atlantic slave trade to the Brazil and Rio of October 2026. Every slide has a **deeper explanation** drawer with the reasoning, evidence, contested interpretations and sources behind it.

## Run it

Requires Node.js 18 or newer.

```bash
cd brazil-history
npm install
npm run fetch-images   # once, while online: caches the ~85 historical images locally (≈60 MB)
npm run dev            # open the printed URL, e.g. http://localhost:5173
```

If you skip `fetch-images`, the deck loads each image directly from Wikimedia Commons at runtime (an internet connection is then needed for images; maps, charts and text are always local).

To build a static copy: `npm run build` → open `dist/index.html` through any static server (`npm run preview`).

## Controls

| Key | Action |
| --- | --- |
| → / Space / PageDown | next step or slide (map slides 13 and 26 build in six steps) |
| ← / PageUp | previous |
| ↑ / ↓ | previous / next slide, skipping build steps |
| **N** | open/close the *deeper explanation* drawer for the current slide |
| **M** | section menu |
| **F** | full screen |
| Home / End | first / last slide |

Click the right or left edge of the slide to move forward or back. Slide 40 (the Rio city map) is interactive: hover or click the numbered sites. Every slide has a shareable URL (`#/26.3` = slide 26, step 3).

## Print / PDF

Open `http://localhost:5173/?print` and print to PDF (Chrome: *Save as PDF*, margins *None*, *Background graphics* on). Each slide is followed by its deeper-explanation notes; the last pages contain the full bibliography and image credits.

## What is inside

- `src/slides/` — the slides, one file per act (`prologue`, `act1` … `act5`, `coda`). Each slide is a React component plus its notes and source keys.
- `src/data/bibliography.ts` — the bibliography; `src/data/images.ts` — every image with its Commons file name, creator, date and licence.
- `public/maps/` — shaded-relief base maps (Brazil, the Atlantic, Rio) generated for this deck from AWS Terrain Tiles and IBGE / Natural Earth coastlines; overlays are drawn in SVG.
- `scripts/fetch-images.mjs` — downloads the images into `public/images/` and writes a manifest.

## Sources and standards

Historical claims are sourced in each slide's drawer and on the final slide. Quantitative data come from the SlaveVoyages estimates, IBGE censuses and historical statistics, IBGE/FGV price indices, Ipeadata and the World Bank. Contemporary facts (the 2026 election, interest rates, court cases) are dated **24 October 2026** and marked as provisional. All images are public-domain or openly licensed works from Wikimedia Commons, credited on-slide; no AI-generated imagery is used.

Stack: React 18, TypeScript, Vite, d3-geo/d3-scale; fonts (Cormorant Garamond, Inter, IBM Plex Mono) are bundled via Fontsource, so nothing else is fetched at runtime.
