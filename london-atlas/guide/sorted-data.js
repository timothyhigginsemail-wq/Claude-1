/*
 * "London, sorted": the city in seven kinds of place, and the spots that fit the brief.
 * Kinds and ratings are our read of the researched entries in ../data. Prices are RentReboot
 * median ASKING rents (whole-home listings first seen in the 90 days to mid-October 2026),
 * quoted for RentReboot's neighbourhood grouping named in `priceArea`.
 */
window.SORTED = {
  kinds: {
    grand:   { name: 'Grand west', line: 'Stucco, Royal Parks, embassies. Polished and pricey.' },
    central: { name: 'Quiet central', line: 'Garden squares and mansion blocks within reach of work.' },
    north:   { name: 'North villages', line: 'Hills, the Heath, independent high streets. Further out.' },
    core:    { name: 'The core', line: 'Offices, stations, shops, tourists. Busy by day, patchy to live in.' },
    lively:  { name: 'Lively & creative', line: 'Markets, bars, music. Fun, loud, rougher edges.' },
    river:   { name: 'New riverside', line: 'Glass towers and concierge blocks on rebuilt land.' },
    south:   { name: 'South & west', line: 'Terraces, commons, families. More space for the money.' }
  },
  areaKind: {
    mayfair: 'grand', belgravia: 'grand', knightsbridge: 'grand', chelsea: 'grand', southken: 'grand', kensington: 'grand', hollandpark: 'grand', nottinghill: 'grand',
    marylebone: 'central', pimlico: 'central', bayswater: 'central', maidavale: 'central', littlevenice: 'central', stjohnswood: 'central', fitzrovia: 'central', bloomsbury: 'central',
    belsize: 'north', primrosehill: 'north', hampstead: 'north', swisscottage: 'north', westhampstead: 'north', kentishtown: 'north', highbury: 'north', islington: 'north', stokenewington: 'north', queenspark: 'north',
    soho: 'core', coventgarden: 'core', stjames: 'core', victoria: 'core', paddington: 'core', euston: 'core', city: 'core', clerkenwell: 'core', southbank: 'core', lisson: 'core',
    shoreditch: 'lively', hackney: 'lively', bethnalgreen: 'lively', whitechapel: 'lively', camdentown: 'lively', brixton: 'lively', peckham: 'lively',
    nineelms: 'river', canarywharf: 'river', wapping: 'river', kingscross: 'river', elephant: 'river', earlscourt: 'river',
    battersea: 'south', clapham: 'south', kennington: 'south', fulham: 'south', hammersmith: 'south', shepherdsbush: 'south', chiswick: 'south', kilburn: 'south', northken: 'south', bermondsey: 'south', greenwich: 'south'
  },
  /* commute: [to Portman Square, to Bressenden Place] — 3 walk or one line, 2 one change, 1 longer */
  spots: [
    { id: 'marylebone', line: 'Best high street in central London. Walk to Portman.', price: [3077, 4962], priceArea: 'Marylebone & Fitzrovia', commute: [3, 2] },
    { id: 'pimlico', line: 'Quiet stucco squares. Walk to Bressenden. Sleepy evenings.', price: [2700, 3500], priceArea: 'Pimlico & Victoria', commute: [2, 3] },
    { id: 'belgravia', line: 'Immaculate and hushed, Hyde Park close. Tight on budget.', price: [3575, 7995], priceArea: 'Belgravia & Knightsbridge (small 2-bed sample)', commute: [2, 3] },
    { id: 'bayswater', line: 'Faces Kensington Gardens. One line to each office. Uneven streets.', price: [3100, 4500], priceArea: 'Paddington & Bayswater', commute: [3, 3] },
    { id: 'nottinghill', line: 'Cafés and communal gardens. One line to each office.', price: [2708, 3868], priceArea: 'Notting Hill & Ladbroke Grove', commute: [3, 3] },
    { id: 'kensington', line: 'Orderly and green. Easy to Victoria, awkward to Portman.', price: [3150, 4983], priceArea: 'Kensington & Holland Park', commute: [2, 3] },
    { id: 'southken', line: 'Museums and French cafés. Two stops to Victoria.', price: [2925, 4550], priceArea: 'Chelsea & Earl’s Court (nearest grouping)', commute: [2, 3] },
    { id: 'maidavale', line: 'Mansion blocks and shared gardens. Calm and roomy; slower Tube.', price: [2500, 3300], priceArea: 'Maida Vale & St John’s Wood', commute: [2, 2] },
    { id: 'stjohnswood', line: 'Leafy and quiet. Jubilee line straight to Bond Street.', price: [2500, 3300], priceArea: 'Maida Vale & St John’s Wood', commute: [3, 2] },
    { id: 'belsize', line: 'Heath and Primrose Hill on foot, great cafés. Longer commute.', price: [2500, 3350], priceArea: 'Hampstead & Belsize Park', commute: [2, 2] },
    { id: 'primrosehill', line: 'The hill and Regent’s Park on the doorstep. Small and sought-after.', price: [2498, 3500], priceArea: 'Camden Town & Primrose Hill (includes Camden)', commute: [2, 2] },
    { id: 'islington', line: 'Lively Upper Street. Victoria line straight to Bressenden. Few parks.', price: [2750, 3400], priceArea: 'Islington & Angel', commute: [2, 3] },
    { id: 'battersea', line: 'Mansion blocks facing Battersea Park. Train into Victoria.', price: [2946, 4008], priceArea: 'Battersea & Nine Elms (includes new towers)', commute: [1, 3] }
  ],
  /* other priced groupings, shown when you tap a zone */
  otherPrices: {
    mayfair: [3600, 4983], soho: [3467, 6000], coventgarden: [3467, 6000], bloomsbury: [2750, 3500], kingscross: [2750, 3500], clerkenwell: [2701, 3500],
    city: [2750, 4000], southbank: [2750, 3350], fulham: [2572, 3600], shoreditch: [2530, 3300], hackney: [2000, 2675], canarywharf: [2645, 3626],
    brixton: [1950, 2400], clapham: [2200, 2701], chelsea: [2925, 4550], earlscourt: [2925, 4550], hollandpark: [3150, 4983], knightsbridge: [3575, 7995],
    victoria: [2700, 3500], paddington: [3100, 4500], littlevenice: [3100, 4500], hampstead: [2500, 3350], camdentown: [2498, 3500], nineelms: [2946, 4008],
    hammersmith: [2167, null], shepherdsbush: [2250, null], chiswick: [2000, null], westhampstead: [2000, null], kilburn: [2000, null],
    highbury: [2250, null], stokenewington: [2100, null], whitechapel: [2100, null]
  },
  priceSource: { t: 'RentReboot — Average rent in London by neighbourhood', u: 'https://rentreboot.com/london/average' }
};
