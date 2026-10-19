# Kips Bay Time Machine

An interactive **3D** reconstruction of the blocks around **The Horizon, 415 East 37th Street**: East 35th–40th Streets, Second Avenue to the East River, from **1750 to 2026**.

The page is one Three.js scene that stays in place. Buildings are extruded volumes on georeferenced footprints. Moving the time slider changes that same scene: the shoreline moves out as land is filled, streets open, tenements go up and are cleared, and power plants and towers rise and come down. The camera never moves on its own when the year changes.

```bash
cd horizon-3d
npm install
npm run dev        # http://localhost:5173
npm test           # data-integrity + footprint-trace tests
npm run build      # static build in dist/ (open from any static host)
```

## What you can do

| | |
|---|---|
| **Navigate in 3D** | Left-drag to orbit/tilt, right-drag (or two-finger drag) to pan across the ground, scroll or pinch to zoom toward the cursor. Preset cameras: *Aerial*, *Top-down*, *Street* (eye height at First Ave & 37th St, looking east) and *River*. |
| **Move through time** | Drag the slider (1750–2026). Labels are every 25 years and dots mark key events. ▶ plays the whole history. Buildings show a scaffold-coloured rising volume while under construction and shrink away when demolished. |
| **Inspect** | Click any building, pier, park or the 1776 fleet. The panel shows the name, address, dates, use, height, footprint area, lat/lon, history notes, the cited sources, a confidence rating, and archive search links for photos. |
| **Trace The Horizon** | *Trace The Horizon’s footprint* draws a gold prism over the tower’s footprint in every year. It lists everything that occupied that ground, computed by polygon overlap: East River → landfill → tenement lots → brewery → undocumented gap → The Horizon. Any other building can be traced the same way from its panel. |
| **Compare** | *Side by side* (2 or 3 years), *Swipe* (drag a divider across one view), or *Ghost overlay* (later year solid; buildings that are gone show as orange wireframes; new ones are tinted green). All of these use one shared camera, so the frame is identical. Presets: 1905 \| 2026, 1900 \| 1953 \| 2026, 1953 ghosted on 2026, swipe 1776 ↔ 2026. |
| **Share a view** | The URL hash keeps the year and compare mode, e.g. `#y=1953&m=split3&b=1900&c=2026`. |

## Geography

- **Frame.** The model uses local "grid metres": *u* runs toward the river along the cross streets and *v* runs uptown along the avenues. The origin is the centre-line intersection of First Avenue and East 37th Street (≈ 40.7459 °N, 73.9713 °W). The frame is rotated 29° from true north, like the Manhattan grid. The compass shows true north. `src/geo.js` converts both ways, and the cursor read-out shows the lat/lon of the ground under the pointer.
- **Dimensions** come from the Commissioners’ Plan: 60 ft streets on 260 ft centres, 100 ft avenues, 650 ft blocks between First and Second Avenues, and 25 × 100 ft lots.
- **Shoreline** (`src/data/shoreline.js`) is a set of dated keyframes that are interpolated year by year. The keyframes are: the natural shore with the Kips Bay inlet (Viele 1865 / Mannahatta), early fill (1845), the bulkhead line (1870), the industrial pierhead (1902), and FDR Drive fill (1945).

## How sure is each piece? (please read)

Each feature has a **confidence badge**:

- **Documented**: existence, place and dates are well attested. Examples: the Second Avenue El (1880–1942), Waterside Stations, the 1776 landing, American Copper Buildings, St. Vartan Cathedral.
- **Approximate**: the feature is attested, but its footprint, height or exact dates are estimates. Most named buildings are in this group: Kip house, St. Gabriel’s Church, the tunnel portal, East Side Airlines Terminal, The Corinthian, The Horizon, Bideawee.
- **Unverified**: research leads that have not been confirmed. These are the **Kips Bay Brewing & Malting Co.** on the Horizon block, the Con Edison facility on 35th–36th Streets, Manhattan Place’s exact lot, The Churchill’s dates, and the **1946–1987 use of the Horizon site**. That last one is shown as a grey "undocumented" slab rather than a made-up building.
- **Inferred**: the hundreds of 4–6 storey tenements and rowhouses. They are generated from the period lot pattern, not researched one by one (`src/data/tenements.js`). Each lot is demolished in the year a documented project cleared its ground, and its panel says which project. You can turn them off with the *Inferred tenements* layer.

The footprints are **massing models placed on the grid from the cited descriptions, not surveyed outlines.** This build had no network access to NYC Open Data, so no present-day footprints were downloaded. To make the modern city exact:

```bash
# download "Building Footprints" from data.cityofnewyork.us as GeoJSON, then
npm run import-footprints -- ~/Downloads/building_footprints.geojson
```

This writes `src/data/footprints.generated.js`. Imported buildings then replace the authored present-day massing, and each one keeps its real roof height and construction year. Old buildings that still stand absorb the inferred tenement on the same lot.

### Best next research steps

1. The Bromley atlas plates for 1899, 1916 and 1955, First Avenue at 37th–38th Streets. These would confirm the brewery and fill in the Horizon site after 1946.
2. The 1940s and 1980s tax photographs for the Horizon and Corinthian lots.
3. MapPLUTO, for the year built and floor counts of The Horizon, Manhattan Place, The Corinthian and The Churchill.

Every source is listed with notes in `src/data/sources.js` and in the in-app panels. No photographs are embedded, because rights and exact catalogue records were not cleared. Each panel links to the NYPL, Library of Congress, Wikimedia Commons, OldNYC and the 1940s/1980s tax-photo collections instead.

## Code map

```
index.html, src/style.css    UI shell (HUD, toolbar, timeline, info panel)
src/main.js                  renderer, camera/controls, compare modes, picking, panel, URL state
src/world.js                 3D scene: terrain, water, streets, buildings, trees, 1776 fleet; applyYear()
src/trace.js                 footprint-through-time analysis
src/geo.js                   grid ↔ lat/lon, block geometry, polygon clipping
src/data/features.js         authored historical features, events, eras, timeline markers
src/data/tenements.js        inferred lot-pattern generator
src/data/shoreline.js        time-varying East River shoreline
src/data/sources.js          bibliography and confidence definitions
src/data/imported.js         NYC footprint import adapter
scripts/import-footprints.mjs
tests/data.test.mjs          no overlapping buildings, buildings on land when built, eras cover the timeline,
                             Horizon trace order, importer
```

To add or correct a building, edit `src/data/features.js`. Give it a footprint built with `rect()` or `circle()` on the block helpers, plus `built` / `demolished`, `confidence` and `sources`. Then run `npm test`. The tests reject a building that overlaps another building at the same time, or one that sits in the river in its construction year.
