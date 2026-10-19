// Bibliography. Every feature cites ids from this list. These are real,
// well-known works and archives; page/plate numbers are deliberately not
// invented — where a plate still needs to be located the feature says so.

export const SOURCES = {
  viele1865: {
    title: 'Egbert L. Viele, Sanitary & Topographical Map of the City and Island of New York (1865)',
    note: 'Original shoreline, marsh and stream courses under the street grid; used for the pre-fill shoreline.',
  },
  ratzer1767: {
    title: 'Bernard Ratzer, Plan of the City of New York (surveyed 1766–67)',
    note: 'Pre-Revolution shoreline, farm roads and estates north of the city.',
  },
  britishHQ: {
    title: 'British Headquarters Map of New York and environs (c. 1782), The National Archives (UK) / facsimile editions',
    note: 'Wartime survey showing Kips Bay, the shore road and farm buildings.',
  },
  mannahatta: {
    title: 'Eric W. Sanderson, Mannahatta: A Natural History of New York City (2009) and the Welikia Project map',
    note: 'Reconstructed 1609 shoreline, wetlands and ecology; basis for the natural-shore keyframe.',
  },
  randel: {
    title: 'John Randel Jr., Farm Maps of Manhattan (1818–1820), Manhattan Borough President’s Office',
    note: 'Grid as surveyed against existing farms and shoreline.',
  },
  commissioners1811: {
    title: 'Commissioners’ Plan of 1811 (map by William Bridges)',
    note: 'Defines the street/avenue dimensions used to place every footprint.',
  },
  perris: {
    title: 'William Perris, Maps of the City of New York (1850s–60s), NYPL Map Division',
    note: 'Fire-insurance atlas showing lot-by-lot construction east of First Avenue.',
  },
  bromley: {
    title: 'G. W. Bromley & Co., Atlas of the City of New York, Borough of Manhattan (1897/99, 1916, 1921, 1930, 1955 editions), NYPL Map Division',
    note: 'Primary lot-level evidence for 1900–1955 footprints (brewery, plants, piers, tenements).',
  },
  sanborn: {
    title: 'Sanborn Map Company, Insurance Maps of the Borough of Manhattan (various years), Library of Congress / NYPL',
    note: 'Building materials, heights and uses lot by lot.',
  },
  taxphotos1940: {
    title: 'NYC Municipal Archives, 1940s Tax Department Photographs (every lot, c. 1939–41) — browsable at 1940s.nyc',
    note: 'Ground-level photo of every building standing c. 1940; use to verify tenement massing.',
    url: 'https://1940s.nyc/',
  },
  taxphotos1980: {
    title: 'NYC Municipal Archives, 1980s Tax Department Photographs (c. 1983–88) — browsable at 1980s.nyc',
    note: 'Shows the lots immediately before the late-1980s towers were built.',
    url: 'https://1980s.nyc/',
  },
  nypl: {
    title: 'NYPL Digital Collections (Milstein Division photographs; mapped at OldNYC.org)',
    note: 'Street photographs, many geocoded to intersections.',
    url: 'https://www.oldnyc.org/',
  },
  mcny: {
    title: 'Museum of the City of New York Collections Portal (Wurts Bros., Berenice Abbott, Gottscho-Schleisner)',
    note: 'Architectural photographs of the power plants, airline terminal and tunnel.',
    url: 'https://collections.mcny.org/',
  },
  nycFootprints: {
    title: 'NYC Open Data — Building Footprints (DoITT), with construction year and roof height',
    note: 'Authoritative present-day footprints. Run `npm run import-footprints` on an export to replace the authored modern massing.',
    url: 'https://data.cityofnewyork.us/',
  },
  pluto: {
    title: 'NYC Department of City Planning — MapPLUTO (tax lots, year built, floors)',
    note: 'Present-day lot lines, year built and number of floors.',
    url: 'https://www.nyc.gov/site/planning/data-maps/open-data.page',
  },
  encyclopedia: {
    title: 'Kenneth T. Jackson (ed.), The Encyclopedia of New York City, 2nd ed. (Yale, 2010)',
    note: 'Entries: Kips Bay; Queens–Midtown Tunnel; elevated railways; Consolidated Edison.',
  },
  schecter: {
    title: 'Barnet Schecter, The Battle for New York (2002); David McCullough, 1776 (2005)',
    note: 'Narrative of the 15 September 1776 Kips Bay landing and the ships involved.',
  },
  stokes: {
    title: 'I. N. Phelps Stokes, The Iconography of Manhattan Island, 1498–1909 (6 vols., 1915–28)',
    note: 'Chronology of the Kip family farm and the Kip house (demolished 1851).',
  },
  conEd: {
    title: 'Consolidated Edison corporate history; NYC Landmarks/press coverage of the Waterside sale and demolition (2000s)',
    note: 'Waterside Generating Station dates and the 2005–08 demolition.',
  },
  tbta: {
    title: 'New York City Tunnel Authority / MTA Bridges & Tunnels — Queens–Midtown Tunnel history',
    note: 'Construction 1936–40, Manhattan portal and approaches.',
  },
  nytimes: {
    title: 'The New York Times archive (TimesMachine), incl. Christopher Gray’s “Streetscapes” columns',
    note: 'Contemporary reporting on the airline terminal (1953), tunnel clearances and 1980s towers.',
  },
  nycparks: {
    title: 'NYC Parks — St. Vartan Park history page',
    note: 'Origin as St. Gabriel’s Park and later renaming.',
    url: 'https://www.nycgovparks.org/parks/st-vartan-park/history',
  },
  bideawee: {
    title: 'Bideawee (founded 1903) — organisational history; Manhattan campus at 410 East 38th Street',
    note: 'Animal shelter on the Horizon block.',
    url: 'https://www.bideawee.org/',
  },
  ctbuh: {
    title: 'CTBUH Skyscraper Center / Emporis-derived listings',
    note: 'Heights and completion years of post-1960 towers (verify against DOB/PLUTO).',
    url: 'https://www.skyscrapercenter.com/',
  },
};

export const CONFIDENCE = {
  documented: { label: 'Documented', desc: 'Existence, location and dates are well attested in the cited sources.' },
  approximate: { label: 'Approximate', desc: 'Feature is attested; its exact footprint, height or dates are estimated and should be checked against the cited atlas plates.' },
  inferred: { label: 'Inferred', desc: 'Generated from the typical lot pattern of the period (25×100 ft lots, 4–6 storey tenements). Not individually researched.' },
  unverified: { label: 'Unverified', desc: 'Recalled from secondary references; location or dates have not been confirmed. Treat as a research lead.' },
};
