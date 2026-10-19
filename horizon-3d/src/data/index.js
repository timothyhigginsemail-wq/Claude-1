// Single list of everything the scene and the footprint tracer know about.
import { FEATURES } from './features.js';
import { LOTS } from './tenements.js';
import { IMPORTED, HAS_IMPORT } from './imported.js';

// When exact NYC footprints have been imported they replace the authored
// present-day massing (features flagged `modern`); historical features stay.
export const ALL_FEATURES = [...FEATURES.filter((f) => !(HAS_IMPORT && f.modern)), ...IMPORTED, ...LOTS];
