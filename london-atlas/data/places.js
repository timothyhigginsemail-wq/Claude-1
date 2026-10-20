/*
 * Curated point data. Coordinates come from Wikipedia article coordinates (fetched Oct 2026)
 * unless marked `approx: true`, in which case they were placed by hand and should be treated
 * as indicative to within ~100 m. Park gates are all approximate.
 */

/* Work anchors. Positions are approximate until you drag them to the exact entrance. */
window.ATLAS_OFFICES = [
  { id: 'portman', name: 'Portman Square', short: 'Portman Sq', ll: [51.5157, -0.1557], approx: true,
    note: 'Square centre from Wikipedia coordinates. Drag the marker to the actual building entrance once known. Nearest stations: Marble Arch (Central), Bond Street (Central, Jubilee, Elizabeth line).' },
  { id: 'bressenden', name: 'Bressenden Place', short: 'Bressenden Pl', ll: [51.4971, -0.1429], approx: true,
    note: 'Placed mid-street by hand (Bressenden Place runs between Victoria Street and Buckingham Palace Road beside Victoria station). Drag to the entrance once known. Nearest stations: Victoria (Victoria, District, Circle, National Rail), St James’s Park (District, Circle).' }
];

/*
 * Parks and gardens. access: 'public' | 'private' | 'restricted'.
 * The polygons on the map come from the base tiles; these markers carry the facts.
 */
window.ATLAS_PARKS = [
  { id: 'hyde', name: 'Hyde Park', ll: [51.5086, -0.1636], access: 'public', size: 'large', src: ['rp_hyde'],
    hours: 'Gates 05:00–midnight, all year (Royal Parks).',
    note: 'The default central London running ground. Serpentine and the Rotten Row/South Carriage Drive edge are the flat, lit-ish spines. Summer: BST Hyde Park concerts in the south-east corner; winter: Winter Wonderland on the same ground — both close large areas and bring evening crowds to Park Lane and Hyde Park Corner.',
    gates: [['Marble Arch', 51.5128, -0.1593], ['Grosvenor Gate (Park Lane)', 51.5103, -0.1567], ['Hyde Park Corner', 51.5030, -0.1515], ['Albert Gate (Knightsbridge)', 51.5022, -0.1600], ['Alexandra Gate', 51.5018, -0.1720], ['Victoria Gate (Bayswater Rd)', 51.5115, -0.1715]] },
  { id: 'kg', name: 'Kensington Gardens', ll: [51.5072, -0.1803], access: 'public', size: 'large', src: ['rp_kg'],
    hours: 'Opens 06:00; closes at dusk, so as early as ~16:30 in midwinter (Royal Parks).',
    note: 'Quieter, more formal western half of the Hyde Park pair. The dusk closure matters for after-work winter runs — Hyde Park itself stays open to midnight.',
    gates: [['Lancaster Gate', 51.5113, -0.1755], ['Black Lion Gate (Queensway)', 51.5103, -0.1878], ['Palace Gate', 51.5015, -0.1855], ['Queen’s Gate', 51.5015, -0.1795]] },
  { id: 'regents', name: 'The Regent’s Park', ll: [51.5322, -0.1567], access: 'public', size: 'large', src: ['rp_regents'],
    hours: 'Pedestrian gates 05:00 to dusk; the Outer Circle road stays open to midnight (Royal Parks).',
    note: 'Outer Circle is the classic loop (commonly quoted at about 4.5 km); the inner park closes at dusk but the Outer Circle pavement does not. London Zoo occupies the north-east. Sports pitches across the north.',
    gates: [['Clarence Gate', 51.5245, -0.1580], ['York Gate', 51.5233, -0.1530], ['Hanover Gate', 51.5280, -0.1650], ['Gloucester Gate', 51.5363, -0.1475], ['Park Square (Marylebone Rd)', 51.5240, -0.1470]] },
  { id: 'primrose', name: 'Primrose Hill', ll: [51.5394, -0.1608], access: 'public', size: 'medium', src: ['rp_regents'],
    hours: 'Royal Parks; check current hours (summit open late in practice).',
    note: 'Short, steep hill repeats and the best free skyline view in the north-west. Crowded on summer evenings.',
    gates: [['Regent’s Park Road', 51.5410, -0.1590]] },
  { id: 'green', name: 'Green Park', ll: [51.5042, -0.1436], access: 'public', size: 'medium', src: [],
    note: 'Lawns and plane trees, no flowerbeds. Useful as a walking link between Mayfair/Piccadilly and Victoria (via Buckingham Palace) rather than a running destination.',
    gates: [['Green Park station', 51.5070, -0.1420], ['Hyde Park Corner side', 51.5032, -0.1500]] },
  { id: 'stjames', name: 'St James’s Park', ll: [51.5025, -0.1350], access: 'public', size: 'medium', src: [],
    note: 'Lake, pelicans and heavy tourist traffic by day; quieter early morning. Five minutes’ walk from Bressenden Place.',
    gates: [['Birdcage Walk', 51.5010, -0.1340], ['Horse Guards', 51.5045, -0.1290]] },
  { id: 'battersea', name: 'Battersea Park', ll: [51.4793, -0.1573], access: 'public', size: 'large', src: [],
    note: 'Wandsworth council park on the south bank. Flat perimeter loop popular with runners and parkrun-style groups; riverside promenade faces Chelsea. Reached from Pimlico over Chelsea Bridge.',
    gates: [['Chelsea Bridge gate', 51.4835, -0.1510], ['Albert Bridge gate', 51.4815, -0.1660], ['Queen’s Circus', 51.4775, -0.1495]] },
  { id: 'heath', name: 'Hampstead Heath', ll: [51.5603, -0.1608], access: 'public', size: 'large', src: [],
    note: 'Rough, hilly, semi-wild — the best trail running in inner London. Parliament Hill, the ponds, Kenwood to the north. Managed by the City of London Corporation.',
    gates: [['South End Green', 51.5560, -0.1645], ['Parliament Hill / Gospel Oak', 51.5575, -0.1510]] },
  { id: 'hollandpark', name: 'Holland Park', ll: [51.5025, -0.2032], access: 'public', size: 'medium', approx: true, src: [],
    note: 'Woodland paths, Kyoto Garden, opera in summer. Too small and hilly-pathed for long runs; good for short loops.',
    gates: [['Holland Park Avenue', 51.5055, -0.2030], ['Kensington High Street', 51.5010, -0.2015]] },
  { id: 'clapham', name: 'Clapham Common', ll: [51.4578, -0.1494], access: 'public', size: 'large', src: [], note: 'Big, flat, open; perimeter loop is a common run. Busy with weekend sport and summer events.' },
  { id: 'victoriapark', name: 'Victoria Park', ll: [51.5364, -0.0398], access: 'public', size: 'large', approx: true, src: [], note: 'East London’s main park; long flat paths, canal on two sides.' },
  { id: 'highbury', name: 'Highbury Fields', ll: [51.5503, -0.1017], access: 'public', size: 'small', src: [], note: 'Islington’s largest open space — which says something about Islington. Short loops only.' },
  { id: 'burgess', name: 'Burgess Park', ll: [51.4836, -0.0818], access: 'public', size: 'large', src: [], note: 'Large, flat, post-war park in Walworth/Camberwell; less manicured than the Royal Parks.' },
  { id: 'kennington', name: 'Kennington Park', ll: [51.4842, -0.1089], access: 'public', size: 'small', src: [], note: 'Local park; small loops.' },
  { id: 'paddrec', name: 'Paddington Recreation Ground', ll: [51.5302, -0.1914], access: 'public', size: 'medium', src: [], note: 'Maida Vale’s local sports ground with a running track — a practical, unglamorous asset for Maida Vale and Kilburn Park.' },
  { id: 'brompton', name: 'Brompton Cemetery', ll: [51.4849, -0.1908], access: 'public', size: 'medium', src: [], note: 'Royal Parks cemetery between Earl’s Court and Fulham; a calm walking route, not a running track. Closes at dusk-ish.' },
  { id: 'greenwichpark', name: 'Greenwich Park', ll: [51.4769, -0.0005], access: 'public', size: 'large', approx: true, src: [], note: 'Steep hill to the Observatory; tourist-heavy at weekends.' },
  { id: 'londonfields', name: 'London Fields', ll: [51.5411, -0.0595], access: 'public', size: 'small', src: [], note: 'Hackney’s social park; lido; packed on sunny weekends.' },
  { id: 'stgeorges', name: 'St George’s Square Garden', ll: [51.4865, -0.1352], access: 'public', size: 'small', approx: true, src: [], note: 'Pimlico’s one public garden square, opening onto the river at Grosvenor Road. Small; for sitting, not running.' },
  { id: 'russellsq', name: 'Russell Square', ll: [51.5217, -0.1261], access: 'public', size: 'small', src: [], note: 'Public square, busy by day with students and visitors.' },
  { id: 'lincolns', name: 'Lincoln’s Inn Fields', ll: [51.5161, -0.1166], access: 'public', size: 'small', src: [], note: 'Largest public square in London; lawyers by day.' },
  { id: 'coram', name: 'Coram’s Fields', ll: [51.5247, -0.1197], access: 'restricted', size: 'small', src: [], note: 'Adults admitted only with a child — not usable by a couple without children.' },
  { id: 'kensalgreen', name: 'Kensal Green Cemetery', ll: [51.5286, -0.2241], access: 'public', size: 'medium', src: [], note: 'Large Victorian cemetery; quiet walking.' },
  /* private garden squares — keyholders only (some open on Open Garden Squares Weekend in June) */
  { id: 'eccleston', name: 'Eccleston Square', ll: [51.4921, -0.1441], access: 'private', size: 'small', src: ['eccleston_lgt'], note: 'Residents’ garden, laid out 1835; keys go with qualifying flats around the square. Ask any agent here whether the flat comes with a key and what the annual garden fee is.' },
  { id: 'warwick', name: 'Warwick Square', ll: [51.4907, -0.1413], access: 'private', size: 'small', src: [], note: 'Residents’ garden.' },
  { id: 'belgrave', name: 'Belgrave Square', ll: [51.4995, -0.1545], access: 'private', size: 'small', approx: true, src: [], note: 'Residents’ garden; the square is mostly embassies and institutions.' },
  { id: 'eaton', name: 'Eaton Square', ll: [51.4955, -0.1530], access: 'private', size: 'small', approx: true, src: [], note: 'Series of residents’ gardens split by the King’s Road traffic.' },
  { id: 'cadogan', name: 'Cadogan Square', ll: [51.4953, -0.1606], access: 'private', size: 'small', src: [], note: 'Residents’ garden.' },
  { id: 'onslow', name: 'Onslow Gardens', ll: [51.4895, -0.1770], access: 'private', size: 'small', approx: true, src: [], note: 'Communal garden for surrounding houses.' },
  { id: 'ladbroke', name: 'Ladbroke Square', ll: [51.5115, -0.2025], access: 'private', size: 'medium', approx: true, src: [], note: 'Very large residents’ garden behind Notting Hill Gate; one of several Ladbroke estate communal gardens.' },
  { id: 'portmansq', name: 'Portman Square garden', ll: [51.5160, -0.1560], access: 'private', size: 'small', src: [], note: 'Private garden at the office anchor.' },
  { id: 'manchester', name: 'Manchester Square', ll: [51.5167, -0.1527], access: 'private', size: 'small', src: [], note: 'Private garden; Wallace Collection on the north side.' },
  { id: 'bryanston', name: 'Bryanston Square', ll: [51.5180, -0.1617], access: 'private', size: 'small', approx: true, src: [], note: 'Residents’ garden (Portman Estate).' },
  { id: 'montagu', name: 'Montagu Square', ll: [51.5183, -0.1595], access: 'private', size: 'small', approx: true, src: [], note: 'Residents’ garden (Portman Estate).' },
  { id: 'bedford', name: 'Bedford Square', ll: [51.5189, -0.1301], access: 'private', size: 'small', src: [], note: 'Private garden; Georgian set piece.' },
  { id: 'kensq', name: 'Kensington Square', ll: [51.5010, -0.1897], access: 'private', size: 'small', approx: true, src: [], note: 'Residents’ garden just off Kensington High Street.' }
];

/* Curated landmarks — orientation points, not a tourist list. */
window.ATLAS_LANDMARKS = [
  ['Buckingham Palace', 51.5008, -0.1419, 'Its walled garden is a large blank on the map between Victoria and Hyde Park Corner — you walk around it, not through it.'],
  ['Houses of Parliament', 51.4992, -0.1247, 'Protests and security closures on Parliament Square are routine.'],
  ['British Museum', 51.5194, -0.1269, 'Anchors Bloomsbury.'],
  ['Natural History Museum', 51.4961, -0.1764, 'With the V&A and Science Museum, the reason South Kensington station is rammed on weekends and school holidays.'],
  ['Royal Albert Hall', 51.5011, -0.1774, 'Proms season (Jul–Sep) brings evening crowds to Kensington Gore.'],
  ['Tate Modern', 51.5078, -0.0994, 'Bankside.'],
  ['St Paul’s Cathedral', 51.5138, -0.0983, 'The City.'],
  ['Tower of London', 51.5081, -0.0761, 'East edge of the City.'],
  ['Trafalgar Square', 51.5081, -0.1281, 'Notional centre of London for road distances.'],
  ['Piccadilly Circus', 51.5100, -0.1344, 'West End crowd peak.'],
  ['Marble Arch', 51.5132, -0.1589, 'Big traffic junction; Portman Square is 300 m north-east.'],
  ['Lord’s Cricket Ground', 51.5294, -0.1727, 'Match days fill St John’s Wood Road and the Jubilee line station.'],
  ['The Shard', 51.5045, -0.0865, 'London Bridge.'],
  ['Battersea Power Station', 51.4817, -0.1447, 'Shopping and flats in the converted station; Northern line terminus.'],
  ['Selfridges', 51.5144, -0.1527, 'Oxford Street, five minutes from Portman Square.'],
  ['Harrods', 51.4994, -0.1633, 'Knightsbridge tourist magnet.'],
  ['Victoria and Albert Museum', 51.4966, -0.1722, 'South Kensington.'],
  ['Borough Market', 51.5055, -0.0910, 'Food market; very crowded weekends.'],
  ['Camden Market', 51.5413, -0.1466, 'Weekend crowds dominate Camden High Street and Chalk Farm Road.'],
  ['Coal Drops Yard', 51.5355, -0.1257, 'King’s Cross redevelopment retail.'],
  ['Abbey Road Studios crossing', 51.5320, -0.1780, 'Constant tourist photo stops on a working road in St John’s Wood.'],
  ['Kenwood House', 51.5712, -0.1675, 'North edge of Hampstead Heath.'],
  ['Tate Britain', 51.4910, -0.1275, 'Millbank, Pimlico’s river edge.'],
  ['Westfield London', 51.5072, -0.2210, 'Shepherd’s Bush / White City mall.'],
  ['Barbican Centre', 51.5200, -0.0939, 'Arts centre and estate.'],
  ['Portobello Road Market', 51.5167, -0.2050, 'Saturday crowds; antiques at the Notting Hill end.'],
  ['Columbia Road Flower Market', 51.5293, -0.0710, 'Sunday mornings only.'],
  ['Brick Lane', 51.5215, -0.0717, 'Spitalfields / Banglatown.']
].map(function (l) { return { name: l[0], ll: [l[1], l[2]], note: l[3] }; });

/* Places shown on the base map only — no researched entry. */
window.ATLAS_BASE_PLACES = [
  ['Wimbledon', 51.4237, -0.2056], ['Putney', 51.46, -0.22], ['Wandsworth', 51.455, -0.192], ['Tooting', 51.428, -0.165],
  ['Walthamstow', 51.584, -0.021], ['Stratford', 51.5423, -0.0026], ['Highgate', 51.5716, -0.1448], ['Muswell Hill', 51.592, -0.143],
  ['Ealing', 51.5175, -0.2988], ['Acton', 51.5135, -0.2707], ['Lewisham', 51.461, -0.005], ['Dulwich', 51.4457, -0.0779],
  ['Crystal Palace', 51.4203, -0.0705], ['Richmond', 51.456, -0.301], ['Herne Hill', 51.4544, -0.0936], ['Barnes', 51.474, -0.236],
  ['Finsbury Park', 51.5712, -0.1009], ['Wembley', 51.5528, -0.2979], ['Dalston', 51.545, -0.07], ['Holborn', 51.5204, -0.1136],
  ['Stockwell', 51.4681, -0.1206], ['Canada Water', 51.498, -0.05], ['Camberwell', 51.474, -0.093], ['Golders Green', 51.5724, -0.1941],
  ['Stamford Hill', 51.570, -0.073], ['Tufnell Park', 51.5565, -0.138], ['Archway', 51.5655, -0.135], ['Kensal Rise', 51.5345, -0.22],
  ['Willesden', 51.5468, -0.2341], ['Barnsbury', 51.5418, -0.1106], ['Canonbury', 51.5439, -0.095], ['Westbourne Park', 51.521, -0.201]
].map(function (p) { return { name: p[0], ll: [p[1], p[2]] }; });

/* Zones of crowd / night-time / seasonal pressure. `src` points at evidence; `basis` says when it is impression only. */
window.ATLAS_PRESSURE = [
  { name: 'Soho late-night economy (West End Cumulative Impact Zone)', ll: [51.5130, -0.1320], r: 350, kind: 'night', src: ['soho_licensing'] },
  { name: 'Leicester Square / Covent Garden crowds (West End CIZ)', ll: [51.5110, -0.1280], r: 350, kind: 'night', src: ['soho_licensing'] },
  { name: 'Oxford Street / Regent Street crowds and phone theft hotspot', ll: [51.5152, -0.1440], r: 550, kind: 'crowds', src: ['phone_theft', 'oxst_ianvisits'] },
  { name: 'Shoreditch night-time economy (Hackney Special Policy Area)', ll: [51.5255, -0.0780], r: 450, kind: 'night', src: ['hackney_ente', 'hackney_spa'] },
  { name: 'Dalston night-time economy (Hackney Special Policy Area)', ll: [51.5480, -0.0750], r: 300, kind: 'night', src: ['hackney_spa'] },
  { name: 'Camden Town night-time economy and drugs market (Met priority)', ll: [51.5395, -0.1426], r: 380, kind: 'night', src: ['met_camdentown'] },
  { name: 'Brixton town centre (Met priority: dealing around Windrush Sq)', ll: [51.4620, -0.1145], r: 350, kind: 'night', src: ['met_brixton', 'lambeth_brixton'] },
  { name: 'Clapham High Street bars', ll: [51.4640, -0.1340], r: 250, kind: 'night', src: [], basis: 'Impression: weekend bar strip; no supporting source captured.' },
  { name: 'King’s Cross station surroundings (Met priority: drug-related ASB)', ll: [51.5310, -0.1235], r: 250, kind: 'street', src: ['met_kingscross'] },
  { name: 'Victoria station frontage / Victoria Street colonnade (rough sleeping, ASB)', ll: [51.4962, -0.1430], r: 260, kind: 'street', src: ['victoria_sbit', 'victoria_bid', 'grosvenor_gdns'] },
  { name: 'Kilburn High Road (Met priority: violent crime)', ll: [51.5395, -0.1940], r: 450, kind: 'street', src: ['met_kilburn', 'brent_kilburn'] },
  { name: 'Notting Hill Carnival footprint (August bank holiday weekend)', ll: [51.5180, -0.2050], r: 900, kind: 'seasonal', src: ['carnival_met', 'carnival_itv'] },
  { name: 'Hyde Park events: BST concerts (summer), Winter Wonderland (Nov–Jan)', ll: [51.5065, -0.1590], r: 450, kind: 'seasonal', src: ['bst_2026'] },
  { name: 'Lord’s match days', ll: [51.5294, -0.1727], r: 300, kind: 'seasonal', src: [], basis: 'Impression: match-day crowds on St John’s Wood Road and at the Jubilee station.' },
  { name: 'Stamford Bridge (Chelsea FC) match days', ll: [51.4817, -0.1910], r: 450, kind: 'seasonal', src: [], basis: 'Impression: Fulham Road closures and crowds on match days.' },
  { name: 'Emirates Stadium (Arsenal) match days', ll: [51.5549, -0.1084], r: 500, kind: 'seasonal', src: [], basis: 'Impression: Highbury/Holloway crowds and station queues on match days.' }
];
