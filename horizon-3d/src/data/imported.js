// Present-day footprints imported from NYC Open Data (see scripts/import-footprints.mjs).
import RAW from './footprints.generated.js';

export const IMPORTED = RAW.map((b) => ({
  id: `nyc-${b.id}`,
  name: b.name || `Building BIN ${b.bin ?? b.id}`,
  address: b.bin ? `BIN ${b.bin}` : '',
  kind: 'building',
  use: 'Existing building (NYC Building Footprints)',
  built: b.built,
  demolished: null,
  builtLabel: b.builtRaw ? String(b.builtRaw) : 'unknown — shown from 1900',
  parts: b.polys.map((poly) => ({ poly, height: b.height, shape: 'prism' })),
  color: b.built < 1940 ? '#9c6a52' : '#c8c2b4',
  confidence: 'documented',
  notes: [
    'Exact present-day footprint and roof height from NYC Building Footprints. Construction year is DoITT’s recorded value (often approximate for pre-war buildings).',
  ],
  sources: ['nycFootprints', 'pluto'],
  photoSearch: b.name || 'East 37th Street Manhattan',
  imported: true,
}));

export const HAS_IMPORT = IMPORTED.length > 0;
