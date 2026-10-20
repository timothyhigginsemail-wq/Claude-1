# London Atlas

An interactive 2D map of central and inner London with two jobs:

1. **Explore:** build a mental map of the city: neighbourhoods, how they connect, what they are like on the ground.
2. **Find a home:** shortlist areas for a couple moving from New York, then track and compare specific flats.
   Offices are at Portman Square and Bressenden Place; budget is £3–5k/month for 1–2 beds.

It is a static web app (Leaflet plus plain JavaScript), with no build step and no account. Your data stays in the browser's local storage and can be exported or imported as JSON.

## Run it

```bash
cd london-atlas
python3 -m http.server 8000      # then open http://localhost:8000
```

You can also open `index.html` directly. All data ships as `.js` files, so `file://` works.

Two kinds of base map, chosen under **Layers**:

- **CARTO street tiles** (local default): full street detail; needs an internet connection.
- **London Atlas** (OS open data, bundled): land, the Thames, real park outlines and the A-road network, drawn in the app. It needs no tile server and follows light/dark mode, but has no minor streets.

The optional lookups (TfL Journey Planner, postcodes.io) also need a connection. Everything researched is bundled.

### Hosted copy

`python3 scripts/build_hosted.py` writes `dist/london-atlas.html`, a single self-contained page for hosting as a claude.ai Artifact. Hosted pages can't load map tiles, call TfL or postcodes.io, start downloads or show browser dialogs, so the hosted build:

- uses the London Atlas base map only
- replaces the TfL button with planner links plus a box for the time you measure
- exports by copy-and-paste rather than a file download
- uses in-page confirmations

Saved data lives in that browser, separate from the local copy; move it across with export/import.

On a phone, serve it from a laptop on the same Wi-Fi and open `http://<laptop-ip>:8000`, or host the folder on any static host. The side panel becomes a bottom sheet; tap the grip to expand it.

## What's in it

| Layer | Default | Source / notes |
|---|---|---|
| Neighbourhoods | on | 60 researched entries (11 in depth, 49 full). Italic grey names are base map only. Click a name, or click inside its halo. |
| Parks & gardens | always on | 791 public park and garden outlines from OS Open Greenspace (clickable), plus 36 researched markers: **public** (green dot), **private keyholder squares** (dashed square), **restricted** (Coram's Fields). Royal Parks hours are cited; gates are approximate. |
| Transport | off | Tube, Elizabeth line, Overground, DLR, tram and cable car, from an OSM-derived TfL dataset filtered to 2026 services. Each line can be toggled. |
| Landmarks | off | 28 orientation points, each with a one-line note on how it affects the area around it. |
| Area character | off | Drawn **only where a cited source supports it**: conservation areas, night-time economy zones, police/council street-crime priorities, regeneration sites, seasonal events. |
| A roads & motorways | off | OS Open Roads. Also used to flag any A road within 150 m of a pin. |
| My places & apartments | on | Your pins. Solid = precise, ringed = approximate; colour = viewing status. |
| Borough boundaries | off | London Datastore borough boundaries (excluding the river). |

**Search** covers neighbourhoods, base-map places, parks, landmarks, stations, offices and your saved flats and places.

### Neighbourhood panel

Each panel opens as a short card: a one-sentence summary, three 1–3 ratings (parks, quiet, cafés & pubs; our read of the write-up, in `data/ratings.js`) and the distance to each office with room for a measured time. The detail folds away underneath. In full, a panel covers:

- **At a glance**
- **Within the area** (pockets and contrasts)
- **Everyday life** and **Drawbacks**
- **Connections**, with station chips and **where the description stops applying**
- **Fit for us** (strengths, trade-offs, unknowns)
- **Commute** to each office, shown separately
- **Our notes**
- **Evidence**, which separates what the sources support from impressions
- **Sources**, collapsed, each with its kind and access date

### Find a home

- **Area shortlist** → **Compare shortlisted areas** puts them side by side. Rows: commute to each office (measured time if you have one, otherwise straight-line distance), route sketch, park access, cafés and pubs, quiet, sources of bustle, housing stock, budget evidence, trade-offs, unknowns and your notes.
- **Apartments:** click the map in Find a home mode, or use **Add apartment**.
  - Fields: URL, address, rent, beds, furnished, floor, lift, outdoor space, size, viewing status, listing notes, your notes, last-checked date.
  - Blanks stay blank everywhere.
  - Pins can be precise or approximate. The postcode lookup always gives an approximate pin.
  - You can archive, unarchive and delete.
- **Each pin shows:**
  - which entry it falls in
  - both commutes
  - the nearest stations and park entrances, and any private squares nearby
  - A roads and motorways within 150 m (OS Open Roads)
  - the nearest public green spaces by distance to their edge, and the nearest park of 20 ha or more
  - Overground/sub-surface/DLR lines within about 150 m
  - crowd, night-time and event zones
  - a viewing checklist tailored to the pin, saved per flat
- **Compare selected** puts apartments side by side.
- **Data:** export/import JSON (import can replace your data or merge into it), the commute target (default 25 min), and the office positions.

### Commutes: what is and isn't a time

- **Straight-line distance** is always shown, labelled as straight-line. It is never turned into minutes.
- **Route sketches** describe each journey by line and change. They come from the network data and give no minutes.
- **"Look up with TfL"** calls the public TfL Journey Planner API from your browser. It asks for the fastest door-to-door journey arriving at 08:45 on the next weekday. The result is stored with its date and flagged if you later move the office.
- **Google Maps and Citymapper links**, plus a **"My measured time"** box, cover cases where TfL is unreachable.
- Only TfL or self-entered times are compared against the target.
- **Office pins start approximate.** Click an office, choose **Move marker to entrance**, then tick **This is the exact entrance**.

## Coverage and sources

**In depth (11):** Pimlico, Belgravia, Victoria & Victoria Street, Marylebone, St John's Wood, Maida Vale, Bayswater, Notting Hill, Kensington, South Kensington & Queen's Gate, Belsize Park.

**Full entries (49):**

- **Rest of the West End and north-west:** Mayfair, St James's, Fitzrovia, Soho, Covent Garden, Bloomsbury, Lisson Grove & Church Street, Paddington, Little Venice, Holland Park, Knightsbridge, Chelsea, Primrose Hill, Hampstead, Swiss Cottage, West Hampstead, Kilburn, Queen's Park, North Kensington.
- **North and east:** Euston, King's Cross, Camden Town, Kentish Town, Islington, Highbury & Canonbury, Stoke Newington, Hackney, Clerkenwell, the City, Shoreditch, Bethnal Green, Whitechapel, Wapping, Canary Wharf, Greenwich.
- **South:** Waterloo & South Bank, Borough & Bermondsey, Elephant & Castle, Kennington, Vauxhall & Nine Elms, Battersea, Clapham, Brixton, Peckham.
- **West:** Earl's Court, Fulham, Hammersmith, Shepherd's Bush, Chiswick.

**Base map only (32):** e.g. Wimbledon, Putney, Highgate, Dalston, Walthamstow, Dulwich.

Sources live in `data/sources.js`. Each has a URL, a *kind* and a note on what it supports; all were accessed on 2026-10-20.

- **Rents:** ONS "Housing prices in [borough]" pages, August 2026 averages, plus the ONS London bulletin.
  - These are averages across **all existing tenancies**, not new lets.
  - RentReboot asking-rent medians are quoted for Kensington and Chelsea neighbourhoods.
  - Anything else about price is labelled *interpretation*.
- **Safety and street conditions:**
  - Met Police ward-priority pages (Camden Town, King's Cross, Brixton, Kilburn).
  - Westminster council and Victoria BID material on rough sleeping and street ASB at Victoria.
  - Hackney's night-time economy research and Special Policy Areas.
  - Westminster licensing records (Soho, West End Cumulative Impact Zone).
  - Met and press figures on Notting Hill Carnival.
  - Political-party pages are cited only for the figures they quote, and are labelled as such.
- **Character and housing:** conservation-area records (planning.data.gov.uk, Heritage Check), London Gardens Trust, the Marylebone estates, Royal Parks FAQs, regeneration sources (Earl's Court, Queensway, Elephant, Battersea Power Station, Church Street), and Oxford Street pedestrianisation (traffic removal from 26 Oct 2026, per IanVisits).
- **Demographics:** cited where they shape an area (e.g. Tower Hamlets' Census 2021 Bangladeshi share), described as observable patterns and not as judgements.
- **Renting law:** a council and a law-firm summary of Renters' Rights Act phase 1 (in force since 1 May 2026), used for the viewing checklist.
- **Wikipedia:** used for geography, history and coordinates, never as the only support for a judgement.

**About the writing.** The character write-ups combine these sources with general knowledge of London. They were written by an AI model, not by a resident, and are not based on recent visits. Every entry says which claims rest on sources and which are impressions. Treat the impressions as a briefing to check on foot, especially at night and at weekends.

## Material limitations

- **Park outlines cover public parks only.** OS Open Greenspace has no private squares, cemeteries or sports grounds, so those appear only as researched markers. Opening hours exist only for the researched parks, and gate positions are approximate.
- **No lakes or docks on the London Atlas base map.** The OS water layer I found sits 300–400 m out of position, so I left it out. The Thames is accurate: it is the gap in borough boundaries drawn at mean high water.
- **The London Atlas base map has no minor streets.** It shows A roads and motorways only; use the CARTO tiles locally for street-level detail.
- **Neighbourhoods have no boundaries.** Entries are centre points with a rough halo. "Within the area" and "where this stops applying" do the boundary work in words, and a pin is assigned to the nearest entry, scaled by its radius.
- **Crowd and night-time zones are hand-placed circles.** They tell you to *check*, not that a flat is noisy. Road proximity uses OS centrelines; B roads and busy side streets are not included. National Rail main lines aren't in the transport data, so rail noise near Victoria, Paddington, Euston and Clapham Junction is covered only in the text.
- **Commute times depend on TfL's public API being reachable from your browser.** If it isn't, and always in the hosted copy, use the links and type the time in. Nothing is estimated.
- **Rents are borough-level.** For district-level figures (SW1V, NW8, W9, NW3…), download the ONS ad-hoc London table linked in Sources.
- **The Overground's six 2024 line names** (Lioness, Mildmay, etc.) are shown as a single "London Overground" line, as in the source data.
- **Storage is per browser.** Export regularly, and import on another device.

## Files

```
index.html  styles.css  app.js        the app
data/areas-core.js, areas-rest.js     neighbourhood entries (edit these to add or correct areas)
data/places.js                        offices, parks, landmarks, base-map names, pressure zones
data/sources.js                       source register
data/transport-lines.js, stations.js  generated — scripts/build_geodata.py
data/osbase.js                        generated — scripts/build_osbase.py (OS open data via jreades/fsds, BNG→WGS84)
scripts/build_hosted.py               single-file hosted build → dist/ (git-ignored)
vendor/                               Leaflet 1.9.4
```

Contains OS data © Crown copyright and database right (OGL v3); borough boundaries © London Datastore/ONS (OGL). Transport © OpenStreetMap contributors (ODbL). Tiles © CARTO. Transport geometry via [oobrien/vis](https://github.com/oobrien/vis).
