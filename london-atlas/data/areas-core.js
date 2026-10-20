/*
 * Neighbourhood entries — part 1: the areas closest to the brief (Westminster, Kensington &
 * Chelsea, and the north-west), written in more depth.
 *
 * Conventions
 *  - `ll` is the commonly understood centre (Wikipedia coordinates where available, nudged by hand
 *    toward the residential core in a few cases). London neighbourhoods have no official
 *    boundaries; `r` is a rough radius for the label halo only.
 *  - `route` describes the shape of the journey to each office using lines that exist in the
 *    transport data. It deliberately gives no minutes; use the TfL lookup in the panel.
 *  - `evidence.verified` lists claims backed by the cited sources; `evidence.impression` lists
 *    claims that rest on general local knowledge and should be checked on the ground.
 *  - `character` tags feed the optional Area character layer and are only drawn where `src` exists.
 *  - Budget lines quote ONS borough averages (all tenancies, not new lets). Anything else about
 *    price is labelled interpretation.
 */
window.ATLAS_AREAS = (window.ATLAS_AREAS || []).concat([
{
  id: 'pimlico', name: 'Pimlico', aka: 'incl. Eccleston & Warwick Squares, Dolphin Square', borough: 'Westminster', ll: [51.4900, -0.1420], r: 650, depth: 'deep',
  stations: ['Pimlico', 'Victoria'],
  character: [{ k: 'heritage', src: ['pimlico_pd', 'pimlico_ca'] }],
  glance: 'Thomas Cubitt’s 1830s–50s grid of cream stucco terraces between the Victoria railway lands and the Thames, nearly all of it cut into flats. It is one of the calmest residential districts this close to a main-line terminus — more “quiet and orderly” than lively.',
  within: [
    'Eccleston and Warwick Squares and the streets between them (St George’s Drive, Cambridge Street) are the classic Pimlico: long, uniform terraces, private keyholder gardens, very little through-traffic.',
    'Belgrave Road is the exception inside the grid — wall-to-wall small hotels of varying quality, more transient footfall and luggage-wheel noise.',
    'Warwick Way and Tachbrook Street are the local shopping spine (Tachbrook Street market on weekdays, cafés, a few decent restaurants, dry cleaners, the usual mini-supermarkets).',
    'Churchill Gardens (river side, west) and Lillington Gardens (east, by Vauxhall Bridge Road) are large, well-regarded post-war council estates; Dolphin Square is a huge 1930s block with its own gym and pool, mostly rented.',
    'The Pimlico Road / Ebury Street fringe to the west drifts upmarket toward Belgravia and Chelsea; east of Vauxhall Bridge Road (Vincent Square, Tate Britain, Millbank) is more institutional.'
  ],
  everyday: 'Very good for daily errands on foot and for a quiet night’s sleep on a side street. Pubs are proper neighbourhood pubs rather than destinations. Weekends are calm — residents, not visitors. Evening dining is limited; most people go to Chelsea, Victoria or across to Battersea for that.',
  drawbacks: [
    'Thin evening life: some will find it sleepy, especially after NYC.',
    'Vauxhall Bridge Road (east edge) and Grosvenor Road / the Embankment (river edge) carry heavy, constant traffic; flats facing them are a different proposition from those on a square.',
    'The Victoria rail approach along the western edge and Victoria station itself to the north bring train noise for a few streets and the station’s street problems (see Victoria) at the northern fringe.',
    'Housing stock is overwhelmingly period conversions: lifts are rare, lower-ground flats are common, and refurbishment quality varies widely behind identical facades.'
  ],
  connections: 'Pimlico station (Victoria line) sits in the east of the grid; Victoria station is on the northern edge. Chelsea Bridge takes you straight into Battersea Park; Vauxhall Bridge to Vauxhall. The rail lines into Victoria are a hard western barrier crossed only at a few points (Ebury Bridge, Pimlico Road), so Belgravia and Chelsea feel further than the map suggests. The Thames Path along Grosvenor Road is usable but traffic-loud.',
  edges: 'Stops applying at Victoria Street / Buckingham Palace Road to the north (station and offices), at Vauxhall Bridge Road to the east (more mixed, more estates and institutions), at the rail cutting to the west, and at the river.',
  fit: {
    strengths: 'The calmest residential option within walking distance of Bressenden Place. Victoria line access. Battersea Park and the river for running. Period flats in garden squares are exactly the “quiet residential, low-moderate density” brief.',
    tradeoffs: 'Portman Square needs a change (or a longish walk). Few large parks on this side of the river. Modern interiors exist but mean checking every refurbishment carefully; truly new-build is mostly at the expensive Chelsea Barracks / Grosvenor Waterside edges.',
    unknowns: 'Street-by-street noise (hotel streets vs squares); whether a given flat includes a garden-square key and what the fee is; heating and insulation in conversions.'
  },
  route: {
    portman: 'Victoria line from Pimlico or Victoria to Green Park, then one stop on the Jubilee line to Bond Street and a short walk north; or Victoria line to Oxford Circus and walk west. Buses also run up Park Lane from Victoria.',
    bressenden: 'Walkable from most of Pimlico (north along Wilton Road / Belgrave Road), or one stop on the Victoria line.'
  },
  cmp: {
    parks: 'No big park inside. Battersea Park across Chelsea Bridge; St James’s and Green Park via Victoria; river path. Private squares if the flat has a key.',
    cafes: 'Adequate and local (Warwick Way, Tachbrook St); good neighbourhood pubs; limited evening dining.',
    quiet: 'High in the squares and side streets; poor on Vauxhall Bridge Rd, Grosvenor Rd and Belgrave Rd.',
    bustle: 'Victoria station fringe, hotel strip on Belgrave Rd, main-road edges.',
    stock: 'Stucco conversions (often no lift), mansion blocks (Dolphin Square), post-war estates, small amount of new-build at the edges.',
    budget: 'Westminster ONS average (all tenancies, Aug 2026): 1-bed £2,548, 2-bed £3,305. Interpretation: £3–5k should cover a modernised 1-bed comfortably and many 2-beds; check SW1V in the ONS district table.'
  },
  evidence: {
    verified: 'Conservation-area designation; Eccleston Square garden history and keyholder status; Westminster rent averages; Victoria-fringe street ASB focus (council/BID).',
    impression: 'Street-level calm, hotel-strip character of Belgrave Road, evening dining quality.'
  },
  src: ['pimlico_pd', 'pimlico_ca', 'eccleston_lgt', 'ons_wsm', 'ons_adhoc', 'victoria_sbit'], wiki: [['Pimlico'], ['Dolphin_Square'], ['Churchill_Gardens'], ['Lillington_Gardens']]
},
{
  id: 'belgravia', name: 'Belgravia', borough: 'Westminster', ll: [51.4975, -0.1540], r: 600, depth: 'deep',
  stations: ['Sloane Square', 'Victoria', 'Hyde Park Corner', 'Knightsbridge'],
  character: [],
  glance: 'The Grosvenor estate’s grandest stucco — Belgrave and Eaton Squares, embassies, foundations and a lot of houses that are lit only part of the year. Immaculate and very quiet, with less everyday street life than its reputation implies.',
  within: [
    'Belgrave Square and Eaton Square: embassies, institutions and high-security residences; dignified but often lifeless after dark.',
    'Elizabeth Street and Motcomb Street / Halkin Arcade are the “village” bits — bakeries, delis, florists, very expensive small shops.',
    'The mews (Kinnerton Street, Wilton Row with the Grenadier pub, Eaton Mews) are where Belgravia is most liveable at human scale.',
    'Pimlico Road and Orange Square in the south-west: design showrooms and a small Saturday farmers’ market; closer to Chelsea in feel.',
    'The Ebury Street / Buckingham Palace Road end near Victoria Coach Station is noticeably busier and plainer.'
  ],
  everyday: 'Errands are possible but pricey; many residents shop in Chelsea or Pimlico. Mews pubs are good. It is the kind of place where you hear your own footsteps at 10pm on a weeknight.',
  drawbacks: [
    'High share of second homes and diplomatic/corporate occupancy makes some streets feel empty, especially in August and at weekends.',
    'Hyde Park Corner, Grosvenor Place and Sloane Square are traffic machines on the edges.',
    'Rents are at the very top of Westminster’s market; the budget buys a modest flat here, often lower-ground or top-floor without a lift.',
    'Security presence around embassies and some private houses.'
  ],
  connections: 'Hyde Park and Green Park are at Hyde Park Corner, a short walk north; Victoria and Bressenden Place a short walk east; Sloane Square (District/Circle) south-west. Buckingham Palace’s walled garden blocks the direct line to St James’s.',
  edges: 'Bleeds into Knightsbridge north of Motcomb Street, into Pimlico across the railway, and into Chelsea at Sloane Square.',
  fit: {
    strengths: 'Walk to Bressenden Place; Hyde Park on the doorstep; quiet.',
    tradeoffs: 'Budget pressure; fewer cafés/pubs than Marylebone or Belsize for the money; can feel like living in a museum district of houses.',
    unknowns: 'Whether a mews flat’s access lane is a service route; owner occupancy in the specific block.'
  },
  route: {
    portman: 'Walk across Hyde Park Corner and up Park Lane or through Hyde Park; or Piccadilly line Hyde Park Corner → Green Park and Jubilee one stop to Bond Street.',
    bressenden: 'Walk east past Grosvenor Gardens / Lower Grosvenor Place.'
  },
  cmp: {
    parks: 'Excellent: Hyde Park and Green Park at Hyde Park Corner. Private squares (keys rare for renters).',
    cafes: 'Few but good; mews pubs; expensive.',
    quiet: 'Very high off the main roads.',
    bustle: 'Hyde Park Corner, Grosvenor Place, Victoria Coach Station end, Sloane Square.',
    stock: 'Stucco houses and conversions, mews houses, a few mansion blocks; Grosvenor-refurbished lets.',
    budget: 'Westminster ONS average (Aug 2026): 1-bed £2,548, 2-bed £3,305 — Belgravia sits well above this. Interpretation: expect 1-beds and small 2-beds within £5k.'
  },
  evidence: { verified: 'Rents (borough level), park hours.', impression: 'Absentee occupancy, evening emptiness, shop mix.' },
  src: ['ons_wsm', 'rp_hyde'], wiki: [['Belgravia'], ['Grosvenor_Estate']]
},
{
  id: 'victoria', name: 'Victoria & Victoria Street', aka: 'incl. the Vincent Square / Smith Square pocket', borough: 'Westminster', ll: [51.4965, -0.1385], r: 600, depth: 'deep',
  stations: ['Victoria', 'St. James\'s Park'],
  character: [{ k: 'street', src: ['victoria_sbit', 'victoria_bid', 'grosvenor_gdns'] }, { k: 'office', src: ['verde'] }],
  glance: 'London’s busiest rail-and-coach interchange wrapped in a rebuilt office district (Cardinal Place, Nova, Bressenden Place). Functional and weekday-heavy, with a station frontage that has been a council and police focus for rough sleeping and street anti-social behaviour since 2025.',
  within: [
    'Victoria Street: glass offices, chain food, the Westminster Cathedral piazza; busy 8–7 on weekdays, quiet at weekends except for the station.',
    'The station front, Grosvenor Gardens and the Victoria Street colonnade are where rough sleeping, street drinking and begging concentrate; Westminster deployed a street-ASB intervention team here in 2025 and a 2026 complaint concerns Grosvenor Gardens.',
    'South of Victoria Street the Vincent Square / Horseferry Road pocket is quietly residential: mansion blocks, Westminster School’s playing field, Strutton Ground weekday street food, the Regency Café, Page Street’s chequerboard estates.',
    'Smith Square, Lord North Street and Cowley Street — Georgian streets used by politicians — are some of the quietest streets in central London.',
    'Theatre crowds at the Victoria Palace and Apollo Victoria in the evening.'
  ],
  everyday: 'Excellent for convenience (everything open, supermarkets, gyms), poor for neighbourhood feel unless you are in the Vincent Square pocket.',
  drawbacks: [
    'Station-area street disorder is documented, not anecdotal (council, BID and political sources all describe it).',
    'Very little residential stock right by the station; new-build towers here are corporate in feel.',
    'Crowds, coaches, constant buses.'
  ],
  connections: 'Victoria line, District/Circle, National Rail (Gatwick Express, Southern, Southeastern). St James’s Park is a few minutes north. Buckingham Palace grounds block the route west to Hyde Park — you go around via Grosvenor Place or through Green Park.',
  edges: 'Pimlico starts south of the station across Belgrave Road; Belgravia west of Grosvenor Gardens; Westminster’s government district east of Strutton Ground.',
  fit: {
    strengths: 'Bressenden Place is here. Vincent Square / Smith Square pocket is genuinely quiet and walkable to both St James’s Park and the river.',
    tradeoffs: 'Station-side flats are noisy and the street scene is rough; neighbourhood life is thin.',
    unknowns: 'How the 2025–26 interventions change the station frontage; what a given block is like at night.'
  },
  route: {
    portman: 'Victoria line to Green Park, Jubilee one stop to Bond Street; or Victoria line to Oxford Circus and walk west.',
    bressenden: 'Walk.'
  },
  cmp: {
    parks: 'St James’s Park and Green Park close; Hyde Park via Hyde Park Corner.',
    cafes: 'Plenty of chains; Strutton Ground/Regency Café; few good pubs.',
    quiet: 'Low near the station; high in the Vincent/Smith Square pocket.',
    bustle: 'Station, coaches, offices, theatres, rough-sleeping hotspots.',
    stock: 'Mansion blocks (Vincent Sq area), Georgian houses (Smith Sq), modern towers by the station.',
    budget: 'Westminster ONS (Aug 2026): 1-bed £2,548, 2-bed £3,305.'
  },
  evidence: { verified: 'Street ASB focus and rough sleeping (council, BID; political source for 2026 Grosvenor Gardens); Bressenden Place offices.', impression: 'Weekend emptiness, Vincent Square pocket character.' },
  src: ['victoria_sbit', 'victoria_bid', 'grosvenor_gdns', 'verde', 'ons_wsm', 'police_uk'], wiki: [['Victoria,_London', 'Victoria, London']]
},
{
  id: 'marylebone', name: 'Marylebone', aka: 'incl. Harley Street, Portman Village, Chiltern Street', borough: 'Westminster', ll: [51.5195, -0.1525], r: 800, depth: 'deep',
  stations: ['Bond Street', 'Baker Street', 'Marylebone', 'Regent\'s Park', 'Marble Arch'],
  character: [],
  glance: 'A Georgian and Victorian grid north of Oxford Street, owned largely by two great estates — Howard de Walden to the east, Portman to the west — which is why its high street is curated rather than chain-dominated. Busy but not frantic, and arguably the most liveable part of the West End, priced accordingly.',
  within: [
    'Marylebone High Street and Marylebone Lane: independent shops, Daunt Books, cafés, a Sunday farmers’ market; the estate actively chooses tenants (it revived the street from a third-vacant state in the 1990s).',
    'Harley Street / Wimpole Street: clinics and consulting rooms with flats above — dead quiet after 7pm and at weekends, which suits some people.',
    'The Portman side (Montagu and Bryanston Squares, Seymour Place, Crawford Street): mansion blocks and terraces, calmer and a little cheaper than the High Street core; Portman Square is here.',
    'Edgware Road (west edge): Arab restaurants, cafés and shisha places, busy late, especially in summer — a distinct community high street, not an extension of Marylebone village.',
    'Baker Street and Marylebone Road: heavy traffic, Sherlock Holmes tourists, Madame Tussauds queues.'
  ],
  everyday: 'Excellent for food shopping, cafés, gyms, pharmacies and doctors. Restaurants are good and busy. It feels like a neighbourhood during the day and early evening; quieter late.',
  drawbacks: [
    'Marylebone Road (A501) is six lanes and among the most polluted roads in London; flats on or near it are noisy.',
    'Oxford Street’s crowd and theft pressure reaches its southern fringe. Oxford Street is due to close to traffic from late October 2026 (Orchard Street to Great Portland Street), with buses and taxis rerouted to nearby streets — effects on Wigmore Street and parallel roads are unknown.',
    'Green space within the grid is mostly private squares; Regent’s Park is across Marylebone Road.',
    'Competitive, expensive, and much of the stock is period conversions.'
  ],
  connections: 'Bond Street (Central, Jubilee, Elizabeth line), Baker Street (five lines), Marylebone (Chiltern Railways). Regent’s Park via York Gate or Clarence Gate; Hyde Park via Marble Arch. Fitzrovia east across Great Portland Street.',
  edges: 'Character changes sharply at Edgware Road (west), at Marylebone Road (north), at Oxford Street (south), and fades into Fitzrovia at Great Portland Street.',
  fit: {
    strengths: 'Portman Square is in the area. Two big parks in reach. Best café/shop density on the list.',
    tradeoffs: 'Bressenden Place needs a change. Budget is tight for a modern 2-bed on a quiet street. Main roads are bad.',
    unknowns: 'Oxford Street traffic displacement; which streets will get rerouted buses.'
  },
  route: {
    portman: 'Walk.',
    bressenden: 'Jubilee line from Bond Street or Baker Street to Green Park, then one stop on the Victoria line to Victoria.'
  },
  cmp: {
    parks: 'Regent’s Park (north) and Hyde Park (south-west) both walkable.',
    cafes: 'Excellent.',
    quiet: 'Good on side streets; poor on Marylebone Rd, Baker St, Edgware Rd.',
    bustle: 'Oxford St fringe, Baker St tourists, Edgware Rd late evenings, Marylebone Rd traffic.',
    stock: 'Period conversions, red-brick mansion blocks, some estate-refurbished modern flats.',
    budget: 'Westminster ONS (Aug 2026): 1-bed £2,548, 2-bed £3,305 — prime W1 new lets run well above. Interpretation: 1-bed comfortable; modern 2-bed at the top of budget.'
  },
  evidence: { verified: 'Estate ownership and High Street revival; Oxford Street pedestrianisation timing and rerouting; borough rents.', impression: 'Edgware Road late-night character, Harley Street weekend emptiness.' },
  src: ['hdwe', 'mj_estates', 'oxst_ianvisits', 'oxst_gla', 'oxst_londonist', 'phone_theft', 'ons_wsm', 'rp_regents'], wiki: [['Marylebone'], ['Howard_de_Walden_Estate'], ['Marylebone_High_Street'], ['Edgware_Road']]
},
{
  id: 'lisson', name: 'Lisson Grove & Church Street', borough: 'Westminster', ll: [51.5240, -0.1680], r: 450, depth: 'full',
  stations: ['Edgware Road', 'Marylebone'],
  character: [{ k: 'regen', src: ['churchst_lse', 'churchst_2025'] }],
  glance: 'A council-estate district wedged between Edgware Road and Marylebone, with Church Street market and Alfies Antique Market at its heart. Socially very different from Marylebone a few hundred metres east, and in the middle of a long council-led regeneration.',
  within: [
    'Church Street market (weekday food and household stalls) and Alfies: the daytime focus.',
    'Large post-war estates on either side; a multicultural, lower-income population (Arab, Bangladeshi, Somali and other communities) described in LSE research as cohesive but economically marginalised.',
    'New mixed-tenure blocks at Luton Street / Fisherton Street — the first regeneration phase — plus more sites planned over 15–20 years.',
    'The Lisson Grove east side near Marylebone station and Dorset Square is effectively Marylebone.'
  ],
  everyday: 'Practical, cheap food shopping; few cafés or pubs that would draw you; quiet residential courts behind the main streets.',
  drawbacks: ['Residents have complained about drug dealing and rough sleeping around some blocks (2020 ward report — dated, and from a political source).', 'Feels different after dark from Marylebone; check specific streets in person.', 'Construction disruption for years.'],
  connections: 'Edgware Road (Bakerloo and Circle/District/H&C), Marylebone. Regent’s Park and the canal are close to the north-east; Portman Square is about a kilometre south.',
  edges: 'Stops at Edgware Road (west), Marylebone Road (south), and the Regent’s Canal / St John’s Wood Road (north).',
  fit: { strengths: 'Proximity to Portman Square and Regent’s Park at lower rents; new-build flats may meet the modern-interior brief.', tradeoffs: 'Neighbourhood amenities and street feel are well below the brief.', unknowns: 'Street-level safety at night; construction phasing.' },
  route: { portman: 'Walk south via Seymour Place or Gloucester Place.', bressenden: 'Bakerloo to Oxford Circus and Victoria line, or Jubilee from Baker Street to Green Park and Victoria line.' },
  cmp: { parks: 'Regent’s Park close.', cafes: 'Weak.', quiet: 'Mixed.', bustle: 'Market by day, Edgware Road edge.', stock: 'Council estates, new mixed-tenure blocks, some period houses near Dorset Sq.', budget: 'Westminster ONS (Aug 2026); likely below Marylebone (interpretation).' },
  evidence: { verified: 'Regeneration programme; community profile (LSE); past dealing complaints (political, 2020).', impression: 'After-dark feel.' },
  src: ['churchst_lse', 'churchst_2025', 'churchst_2020', 'ons_wsm', 'police_uk'], wiki: [['Lisson_Grove'], ['Church_Street_Market']]
},
{
  id: 'fitzrovia', name: 'Fitzrovia', borough: 'Westminster / Camden', ll: [51.5205, -0.1375], r: 450, depth: 'full',
  stations: ['Goodge Street', 'Warren Street', 'Great Portland Street', 'Oxford Circus', 'Tottenham Court Road'],
  character: [],
  glance: 'Restaurant streets and mid-rise offices between Great Portland Street and Tottenham Court Road, under the BT Tower. Media, tech and medical workers by day; a pleasant, compact, slightly anonymous place to live.',
  within: ['Charlotte Street and Goodge Street: dense restaurants and pubs, busy on weekday evenings.', 'Fitzroy Square: Georgian, quiet, pedestrianised.', 'Fitzroy Place (former Middlesex Hospital): modern flats around a courtyard.', 'Tottenham Court Road edge: traffic and chain retail.'],
  everyday: 'Very good for eating out; fine for errands; quiet weekends.',
  drawbacks: ['No meaningful park (Regent’s Park is a 10-minute walk north-west).', 'Office-led; weekends can feel empty.', 'Tottenham Court Road and Euston Road edges are loud.'],
  connections: 'Victoria line at Warren Street and Oxford Circus; Elizabeth line at Tottenham Court Road. Marylebone is directly west; Bloomsbury east across Tottenham Court Road.',
  edges: 'Bounded by Euston Road (north), Oxford Street (south), Great Portland Street (west), Tottenham Court Road (east).',
  fit: { strengths: 'Bressenden Place on one Victoria-line ride; Portman walkable; modern flats exist.', tradeoffs: 'Weak park access for running; not a residential-first area.', unknowns: 'Office-to-residential conversions vary.' },
  route: { portman: 'Walk west along Wigmore or New Cavendish Street, or Elizabeth line Tottenham Court Road → Bond Street.', bressenden: 'Victoria line from Warren Street or Oxford Circus direct to Victoria.' },
  cmp: { parks: 'Regent’s Park 10+ min walk.', cafes: 'Very good.', quiet: 'Moderate.', bustle: 'Offices, restaurants, TCR.', stock: 'Mansion blocks, conversions, new-build (Fitzroy Place).', budget: 'Westminster / Camden ONS averages.' },
  evidence: { verified: 'Borough rents.', impression: 'Character and weekend emptiness.' },
  src: ['ons_wsm', 'ons_cam'], wiki: [['Fitzrovia']]
},
{
  id: 'mayfair', name: 'Mayfair', borough: 'Westminster', ll: [51.5100, -0.1480], r: 650, depth: 'full',
  stations: ['Green Park', 'Bond Street', 'Marble Arch', 'Hyde Park Corner'],
  character: [],
  glance: 'Grosvenor estate red-brick and Georgian streets between Oxford Street and Piccadilly, now dominated by hedge funds, galleries, luxury retail and hotels. Some streets north of Mount Street are hushed and residential; most of it is a high-end commercial district.',
  within: ['Mount Street / South Audley Street: the residential and dining core.', 'Shepherd Market: small pubs and restaurants in a tight lane cluster near Piccadilly.', 'Grosvenor Square: former US embassy, now a hotel; offices around.', 'Bond Street / Savile Row / Dover Street: luxury retail, quiet at night.', 'Park Lane: hotels and six lanes of traffic.'],
  everyday: 'Superb restaurants at high prices; ordinary errands are harder than in Marylebone.',
  drawbacks: ['Many flats are corporate lets or second homes.', 'Expensive for what you get; small flats.', 'Edges (Oxford St, Park Lane, Piccadilly) are heavy.'],
  connections: 'Hyde Park across Park Lane; Green Park at the south. Bond Street (Elizabeth line), Green Park (Victoria, Jubilee, Piccadilly).',
  edges: 'Oxford Street, Regent Street, Piccadilly and Park Lane form hard edges.',
  fit: { strengths: 'Walk to Portman; walk through Green Park toward Bressenden; Hyde Park next door.', tradeoffs: 'Budget buys little; not a neighbourhood in the residential sense.', unknowns: 'Corporate occupancy of blocks.' },
  route: { portman: 'Walk.', bressenden: 'Walk through Green Park and past Buckingham Palace, or one stop on the Victoria line from Green Park.' },
  cmp: { parks: 'Excellent.', cafes: 'Good but expensive.', quiet: 'Moderate in the residential north-west, low elsewhere.', bustle: 'Retail, hotels, Park Lane.', stock: 'Period flats, mansion blocks, serviced flats.', budget: 'Westminster ONS (Aug 2026) — Mayfair far above average.' },
  evidence: { verified: 'Borough rents; Hyde Park hours.', impression: 'Occupancy and street character.' },
  src: ['ons_wsm', 'rp_hyde'], wiki: [['Mayfair']]
},
{
  id: 'stjames', name: 'St James’s', borough: 'Westminster', ll: [51.5070, -0.1365], r: 400, depth: 'full',
  stations: ['Green Park', 'Piccadilly Circus'],
  character: [],
  glance: 'Gentlemen’s clubs, art dealers, shirtmakers and offices between Piccadilly and The Mall. Almost no residents; dead at weekends.',
  within: ['Jermyn Street and St James’s Street: traditional shops.', 'Pall Mall clubs and institutions.', 'Piccadilly edge: tourists.'],
  everyday: 'Not a place to live for most people — included for orientation.',
  drawbacks: ['Tiny residential stock, mostly service apartments.', 'Weekends empty.'],
  connections: 'Green Park and St James’s Park on two sides; walk to Bressenden through St James’s Park.',
  edges: 'Piccadilly (north), Haymarket (east), The Mall/Green Park (south and west).',
  fit: { strengths: 'Location.', tradeoffs: 'No neighbourhood; little stock.', unknowns: '' },
  route: { portman: 'Walk via Mayfair, or Jubilee Green Park → Bond Street.', bressenden: 'Walk through St James’s Park.' },
  cmp: { parks: 'Excellent.', cafes: 'Business-oriented.', quiet: 'Quiet at night, empty at weekends.', bustle: 'Office day.', stock: 'Service apartments.', budget: 'n/a' },
  evidence: { verified: '', impression: 'All.' },
  src: [], wiki: [['St_James%27s', 'St James’s']]
},
{
  id: 'stjohnswood', name: 'St John’s Wood', borough: 'Westminster', ll: [51.5340, -0.1745], r: 850, depth: 'deep',
  stations: ['St. John\'s Wood', 'Swiss Cottage'],
  character: [{ k: 'heritage', src: ['sjw_pd'] }],
  glance: 'Low-density villas and large porter-staffed mansion blocks north of Regent’s Park, planned for the Victorian middle class and now home to wealthy families, diplomats and many American families (the American School in London is here). Leafy, very quiet and somewhat suburban, with a short high street.',
  within: [
    'St John’s Wood High Street: a compact strip of cafés, butchers, boutiques and estate agents — pleasant but not deep.',
    'The villa streets (Hamilton Terrace, Hall Road, Carlton Hill, Marlborough Place): detached and semi-detached houses in big gardens — the low-density townscape conservation documents describe.',
    'Mansion and porter blocks (along Prince Albert Road, Park Road, Abbey Road, Grove End Road): the bulk of the rental stock; many have lifts, porters and secure parking; interiors range from dated to fully modernised.',
    'Abbey Road: the studios and zebra crossing draw a constant trickle of tourists stopping traffic for photos.',
    'Lord’s Cricket Ground fills St John’s Wood Road and the Jubilee line station on match days.',
    'There is a long-established Jewish community (several synagogues), and the area’s school mix draws American and international families.'
  ],
  everyday: 'Calm, safe-feeling and well kept. You will cook at home or go to Marylebone/Belsize more often — evening options are limited and the pub choice is small.',
  drawbacks: [
    'Wellington Road / Finchley Road (A41) cuts north–south through the middle: loud and wide.',
    'Can feel staid and older; little evening street life.',
    'Lord’s match days and Abbey Road tourism are minor but real disruptions.',
    'The Church Street estates and Lisson Grove are a short walk south-west — a sharp social contrast.'
  ],
  connections: 'St John’s Wood (Jubilee) and Swiss Cottage at the north edge. Regent’s Park (Hanover Gate) and Primrose Hill walkable; the Regent’s Canal towpath along the southern edge. Maida Vale is continuous to the west via Hamilton Terrace.',
  edges: 'Stops at the canal / Lisson Grove (south), Maida Vale (west, roughly at Hamilton Terrace / Maida Vale road), Swiss Cottage’s busy junction (north), Regent’s Park (east).',
  fit: {
    strengths: 'Direct Jubilee line to Bond Street — one of the cleanest Portman commutes on the list. Regent’s Park, Primrose Hill and canal for running. Very quiet. Mansion blocks with lifts suit the modern-interior brief more often than conversions.',
    tradeoffs: 'Bressenden needs a change. Cafés/pubs thinner than Belsize or Marylebone. The vibe skews older and family.',
    unknowns: 'Interior quality block by block; porter/service charges absorbed into rent or not.'
  },
  route: {
    portman: 'Jubilee line St John’s Wood → Baker Street → Bond Street, then a short walk; or walk through Regent’s Park and down Baker Street.',
    bressenden: 'Jubilee line to Green Park, then one stop on the Victoria line to Victoria.'
  },
  cmp: {
    parks: 'Excellent: Regent’s Park, Primrose Hill, canal towpath.',
    cafes: 'Modest — High Street only.',
    quiet: 'Very high off the A41.',
    bustle: 'A41 traffic, Lord’s match days, Abbey Road tourists.',
    stock: 'Porter mansion blocks (lifts common), villas, some new-build.',
    budget: 'Westminster ONS (Aug 2026): 1-bed £2,548, 2-bed £3,305. Interpretation: 2-bed block flats appear within £3–5k more often than in SW1/W1; check NW8 district data.'
  },
  evidence: { verified: 'Conservation audit; villa-and-garden townscape; borough rents; Regent’s Park hours.', impression: 'Community mix, high street depth, tourist trickle.' },
  src: ['sjw_pd', 'alma_lgt', 'ons_wsm', 'ons_adhoc', 'rp_regents'], wiki: [['St_John%27s_Wood', 'St John’s Wood'], ['Lord%27s', 'Lord’s'], ['Abbey_Road_Studios']]
},
{
  id: 'maidavale', name: 'Maida Vale', borough: 'Westminster', ll: [51.5280, -0.1885], r: 800, depth: 'deep',
  stations: ['Maida Vale', 'Warwick Avenue', 'Kilburn Park'],
  character: [{ k: 'heritage', src: ['maida_pd', 'maida_ca'] }],
  glance: 'Late-Victorian and Edwardian red-brick mansion blocks lining wide avenues (Elgin Avenue, Randolph Avenue, Lauderdale Road), with large communal gardens behind. Calm, spacious and residential — one of the best “quiet and handsome” options for the money within reach of the West End.',
  within: [
    'The mansion-block avenues: very uniform, very calm; many blocks share large back gardens (access depends on the block).',
    'Clifton Road and Formosa Street near Warwick Avenue: a small, good village cluster of shops, cafés and pubs (shared with Little Venice).',
    'Elgin Avenue’s shops near Maida Vale station: a second, smaller cluster.',
    'West of roughly Shirland Road toward Harrow Road the character changes: larger council estates, more mixed streets, the Westway beyond.',
    'Edgware Road / Maida Vale road (A5) along the eastern edge: busy, buses, plainer.'
  ],
  everyday: 'A local life of cafés, a couple of good pubs, Paddington Recreation Ground (with a running track) and the canal. Quiet evenings.',
  drawbacks: [
    'The Bakerloo line is slow and its trains are old; journeys often need a change.',
    'Limited restaurants and nightlife — you go to Marylebone or Notting Hill.',
    'Mansion-block flats can be dark on lower floors; lifts are common but not universal.',
    'The western and northern fringes (Harrow Road, Kilburn High Road) feel noticeably rougher.'
  ],
  connections: 'Bakerloo at Maida Vale and Warwick Avenue; the southern part is walkable to Paddington (Elizabeth line). Regent’s Canal at Little Venice. St John’s Wood across the A5; Kilburn to the north.',
  edges: 'Little Venice to the south, Kilburn and Kilburn Park to the north, Harrow Road to the west, Edgware Road to the east.',
  fit: {
    strengths: 'Quiet, spacious flats, often within budget for 2 beds; communal gardens; good-enough local cafés.',
    tradeoffs: 'Both commutes typically need a change or a walk to Paddington. Hyde Park is a journey, not a jog.',
    unknowns: 'Block-by-block garden access and lift; heating in older blocks.'
  },
  route: {
    portman: 'Bakerloo to Baker Street and walk; or walk to Paddington and take the Elizabeth line one stop to Bond Street; or bus down Edgware Road to Marble Arch.',
    bressenden: 'Bakerloo to Oxford Circus, then Victoria line to Victoria.'
  },
  cmp: {
    parks: 'Paddington Rec (track), canal towpath; Regent’s Park and Hyde Park are 2–3 km.',
    cafes: 'Good, small clusters.',
    quiet: 'Very high in the avenues.',
    bustle: 'A5 and Harrow Road edges.',
    stock: 'Mansion blocks (lifts common), some conversions.',
    budget: 'Westminster ONS (Aug 2026): 1-bed £2,548, 2-bed £3,305. Interpretation: one of the more realistic areas for a modernised 2-bed within £3–5k; check W9 district data.'
  },
  evidence: { verified: 'Conservation area extent and listed buildings; mansion-block character; borough rents.', impression: 'Western-fringe contrast, local café quality.' },
  src: ['maida_pd', 'maida_ca', 'ons_wsm', 'ons_adhoc'], wiki: [['Maida_Vale'], ['Randolph_Avenue']]
},
{
  id: 'littlevenice', name: 'Little Venice', borough: 'Westminster', ll: [51.5215, -0.1830], r: 380, depth: 'full',
  stations: ['Warwick Avenue', 'Paddington'],
  character: [],
  glance: 'White stucco villas and terraces around the canal basin where the Regent’s Canal meets the Grand Union, with houseboats moored along Blomfield Road. Very pretty, mostly quiet; the southern edge is cut by the Westway and Harrow Road flyovers.',
  within: ['Blomfield Road and Maida Avenue along the canal.', 'Warwick Avenue / Clifton Gardens stucco.', 'The basin itself: café, puppet barge, weekend walkers.', 'South of Harrow Road: Paddington Basin’s office and new-build towers.'],
  everyday: 'Canal walks, Clifton Road shops, and Paddington’s Elizabeth line ten minutes’ walk away.',
  drawbacks: ['Westway / Harrow Road traffic noise at the south edge.', 'Weekend visitor traffic at the basin.', 'Small, expensive stock.'],
  connections: 'Warwick Avenue (Bakerloo); Paddington (Elizabeth line, Bakerloo, Circle, District, H&C, Heathrow Express). Canal towpath east to Regent’s Park and Camden.',
  edges: 'Continuous with Maida Vale north; Paddington south of the flyover.',
  fit: { strengths: 'Elizabeth line one stop from Paddington to Bond Street; canal running; quiet.', tradeoffs: 'Price; small high street.', unknowns: 'Flyover noise for specific addresses.' },
  route: { portman: 'Walk to Paddington, Elizabeth line one stop to Bond Street.', bressenden: 'Bakerloo to Oxford Circus + Victoria line; or Circle from Paddington round to Victoria.' },
  cmp: { parks: 'Canal; Hyde Park ~1.5 km south.', cafes: 'Small but good (Clifton Rd).', quiet: 'High except near flyovers.', bustle: 'Basin visitors, Westway.', stock: 'Stucco conversions, mansion blocks.', budget: 'Westminster ONS (Aug 2026).' },
  evidence: { verified: 'Location and canal geography.', impression: 'Character.' },
  src: ['ons_wsm'], wiki: [['Little_Venice,_London', 'Little Venice'], ['Regent%27s_Canal', 'Regent’s Canal']]
},
{
  id: 'paddington', name: 'Paddington', aka: 'incl. Paddington Basin, Sussex Gardens', borough: 'Westminster', ll: [51.5165, -0.1745], r: 500, depth: 'full',
  stations: ['Paddington', 'Edgware Road', 'Lancaster Gate'],
  character: [{ k: 'office', src: [] }],
  glance: 'A great railway terminus, St Mary’s Hospital, a band of budget hotels, and the glassy Paddington Basin office-and-flat cluster on the canal. Convenient and transient rather than residential.',
  within: ['Paddington Basin / Merchant Square: modern towers, concierge flats, canal-side offices — quiet at weekends.', 'Praed Street: scruffy, late-opening, the station’s shadow.', 'Sussex Gardens and Norfolk Square: hotel streets.', 'Connaught Village / Hyde Park Gardens to the south-east is effectively Bayswater’s nicest corner.'],
  everyday: 'Supreme connectivity, weak neighbourhood life.',
  drawbacks: ['Praed Street and the station fringe are rough-edged; transient population.', 'Basin is a managed estate that empties at weekends.'],
  connections: 'Elizabeth line (Bond Street one stop), Bakerloo, Circle, District, H&C, Heathrow Express. Hyde Park a few minutes south.',
  edges: 'Bayswater west and south, Little Venice north across the flyover, Marylebone east across Edgware Road.',
  fit: { strengths: 'Modern flats with lifts and concierges (the Basin) match the interior brief; Elizabeth line; Hyde Park close.', tradeoffs: 'Not quiet residential; little neighbourhood character.', unknowns: 'Service charges, short-let share in towers.' },
  route: { portman: 'Elizabeth line one stop to Bond Street, or walk via Connaught Street.', bressenden: 'Bakerloo to Oxford Circus + Victoria line, or Circle round to Victoria.' },
  cmp: { parks: 'Hyde Park/Kensington Gardens close.', cafes: 'Chains and station food.', quiet: 'Low–moderate.', bustle: 'Station, hospital, hotels.', stock: 'New-build towers, hotel conversions, stucco.', budget: 'Westminster ONS (Aug 2026).' },
  evidence: { verified: 'Transport.', impression: 'Street character.' },
  src: ['ons_wsm'], wiki: [['Paddington'], ['Paddington_Basin']]
},
{
  id: 'bayswater', name: 'Bayswater', aka: 'incl. Lancaster Gate, Queensway, Connaught Village', borough: 'Westminster', ll: [51.5120, -0.1850], r: 700, depth: 'deep',
  stations: ['Queensway', 'Bayswater', 'Lancaster Gate', 'Royal Oak'],
  character: [{ k: 'regen', src: ['queensway_2026', 'whiteley'] }],
  glance: 'Grand but uneven stucco squares and terraces along the north side of Hyde Park, with a heavy layer of hotels and short-lets and Queensway — a cosmopolitan, late-opening strip now in the middle of a large rebuild. Some of the best park access in London for the money, with big variation street to street.',
  within: [
    'Connaught Village / Hyde Park Gardens (east, by Marble Arch): quiet, polished, close to Portman Square — Bayswater at its best.',
    'Lancaster Gate and the Porchester / Leinster terraces: huge stucco conversions; a mix of fine flats and worn hotel buildings, many of which are converting to residential.',
    'Queensway: Chinese, Lebanese and Gulf-oriented restaurants and late shops; described in 2026 reporting as tired after decades of underinvestment, now reshaped by The Whiteley (former Whiteleys store: flats, shops, cinema, Six Senses hotel) and further schemes.',
    'Inverness Terrace / Kensington Gardens Square: hotel and hostel streets, more transient.',
    'Westbourne Grove (west end) shades into Notting Hill.'
  ],
  everyday: 'Hyde Park and Kensington Gardens across the road; groceries and late food on Queensway; a fair number of decent pubs. More anonymous than Notting Hill or Marylebone.',
  drawbacks: [
    'Transient population from hotels and short-lets; maintenance of big conversions varies a lot.',
    'Queensway construction for several more years.',
    'Bayswater Road traffic along the park edge.',
    'Summer: Hyde Park concerts (BST) and Middle Eastern summer visitors make the eastern end and Queensway busier.'
  ],
  connections: 'Central line (Queensway, Lancaster Gate, Marble Arch) runs straight to Portman’s doorstep; Bayswater (Circle line) goes direct to Victoria. Kensington Gardens is across Bayswater Road. Paddington (Elizabeth line) to the north-east.',
  edges: 'Notting Hill begins around Pembridge Square / Westbourne Grove; Paddington at Sussex Gardens; the Westway/Royal Oak to the north.',
  fit: {
    strengths: 'Both offices on one line each (Central to Marble Arch; Circle to Victoria). Best running access on the list. Widest range of stock and price near Hyde Park.',
    tradeoffs: 'Street quality is patchy; you must choose the building and street carefully. Less of a village.',
    unknowns: 'Hotel/short-let share in the specific building; construction near Queensway.'
  },
  route: {
    portman: 'Central line from Queensway or Lancaster Gate to Marble Arch, then a short walk; or walk along Bayswater Road / through Hyde Park.',
    bressenden: 'Circle line from Bayswater direct to Victoria (District trains here run to Earl’s Court, not Victoria); or walk across Hyde Park to Hyde Park Corner and down Grosvenor Place.'
  },
  cmp: {
    parks: 'Best on the list: Kensington Gardens / Hyde Park across the road.',
    cafes: 'Plentiful but uneven; Queensway late food; Connaught Village cafés.',
    quiet: 'Good on squares and in Connaught Village; poor on Queensway and Bayswater Rd.',
    bustle: 'Hotels, Queensway, construction, summer concerts.',
    stock: 'Stucco conversions, mansion blocks, hotel-to-flat conversions, new-build (The Whiteley, Park Modern).',
    budget: 'Westminster ONS (Aug 2026): 1-bed £2,548, 2-bed £3,305. Interpretation: wide spread — some of the best value for Hyde Park frontage, but quality varies.'
  },
  evidence: { verified: 'Queensway regeneration and its prior state; hotel concentration; park hours; BST licence.', impression: 'Transient feel, Connaught Village calm.' },
  src: ['queensway_2026', 'whiteley', 'kfh_bayswater', 'rp_hyde', 'rp_kg', 'bst_2026', 'ons_wsm'], wiki: [['Bayswater'], ['Queensway,_London', 'Queensway'], ['Lancaster_Gate']]
},
{
  id: 'nottinghill', name: 'Notting Hill', borough: 'Kensington and Chelsea', ll: [51.5130, -0.2025], r: 800, depth: 'deep',
  stations: ['Notting Hill Gate', 'Ladbroke Grove', 'Holland Park', 'Westbourne Park'],
  character: [],
  glance: 'Stucco crescents and very large communal gardens on the old Ladbroke estate, wrapped around Portobello Road and Westbourne Grove. Affluent, attractive and well served — with Saturday tourist weight on Portobello and the Carnival every August bank holiday.',
  within: [
    'The Ladbroke estate (Ladbroke Square, Lansdowne Road, Kensington Park Gardens): houses backing onto huge communal gardens — the image people have of Notting Hill.',
    'Portobello Road changes along its length: antiques and tourists at the south end on Saturdays, food and general market in the middle, then Golborne Road under the Westway (Moroccan and Portuguese cafés, Trellick Tower) — North Kensington proper.',
    'Westbourne Grove / Ledbury Road: boutiques and cafés, more local in the week.',
    'Notting Hill Gate: traffic, chains, two cinemas — a through-route rather than a centre.',
    'Colville and Powis: streets of conversions interleaved with social housing — more mixed, more lived-in.'
  ],
  everyday: 'Excellent cafés, pubs, restaurants and food shops; Holland Park and Kensington Gardens both walkable; plenty of gyms.',
  drawbacks: [
    'Notting Hill Carnival (late August): two days of very large crowds, road closures, noise and boarded-up shopfronts; the Met deploys thousands of officers and reports hundreds of arrests each year, with stabbings in some years.',
    'Saturday crowds on Portobello.',
    'Sharp contrasts with the estates north of the Westway (Lancaster West, the Grenfell area), where deprivation is high.',
    'Expensive; much of the stock is conversions without lifts.'
  ],
  connections: 'Notting Hill Gate (Central, Circle, District) is the key interchange; Ladbroke Grove and Westbourne Park (H&C/Circle) to the north. Kensington Gardens to the east and Holland Park to the south-west.',
  edges: 'North Kensington starts at the Westway; Bayswater east of Pembridge Square; Holland Park west of Ladbroke Grove’s southern end; Kensington south of Notting Hill Gate.',
  fit: {
    strengths: 'Both offices on single lines from Notting Hill Gate. Parks and cafés excellent.',
    tradeoffs: 'Rent pressure — new-let asking rents for 2-beds in Kensington & Holland Park sit near the top of the budget. Carnival weekend.',
    unknowns: 'Communal garden access for a specific flat; Carnival route relative to a street.'
  },
  route: {
    portman: 'Central line Notting Hill Gate → Marble Arch (three stops), then a short walk.',
    bressenden: 'Circle line Notting Hill Gate → Victoria direct (District trains from here go to Earl’s Court instead).'
  },
  cmp: {
    parks: 'Very good: Kensington Gardens, Holland Park; communal gardens if included.',
    cafes: 'Excellent.',
    quiet: 'Good in the Ladbroke estate; busy on Portobello/NHG.',
    bustle: 'Portobello Saturdays, Carnival, NHG traffic.',
    stock: 'Stucco conversions, mews, some mansion blocks; little new-build.',
    budget: 'RBKC ONS (Aug 2026): 1-bed £2,640, 2-bed £3,428. Asking medians (Kensington & Holland Park, to 16 Oct 2026): 1-bed £3,150, 2-bed £4,983.'
  },
  evidence: { verified: 'Carnival policing and arrests; rents (ONS and asking).', impression: 'Street character, Portobello segments.' },
  src: ['carnival_met', 'carnival_itv', 'ons_kc', 'rentreboot', 'rp_kg'], wiki: [['Notting_Hill'], ['Notting_Hill_Carnival'], ['Portobello_Road'], ['Golborne_Road']]
},
{
  id: 'hollandpark', name: 'Holland Park', borough: 'Kensington and Chelsea', ll: [51.5050, -0.2070], r: 550, depth: 'full',
  stations: ['Holland Park', 'Shepherd\'s Bush'],
  character: [],
  glance: 'Very large white stucco villas around the park of the same name — embassies, ambassadors’ residences and private wealth. Hushed, leafy and expensive.',
  within: ['Holland Park (the street) and Holland Villas Road: detached villas.', 'Holland Park Avenue: a short, good row of shops and cafés.', 'Royal Crescent and Norland: closer to Shepherd’s Bush, slightly cheaper.'],
  everyday: 'Quiet and green; limited shops.',
  drawbacks: ['Budget buys a flat in a converted villa at most.', 'Shepherd’s Bush roundabout and West Cross Route at the west edge.'],
  connections: 'Central line at Holland Park; Holland Park (the park) and Kensington High Street to the south.',
  edges: 'Notting Hill to the north-east, Shepherd’s Bush to the west, Kensington to the south-east.',
  fit: { strengths: 'Central line direct to Marble Arch; park for short runs; quiet.', tradeoffs: 'Price; Bressenden needs a change or a bus.', unknowns: '' },
  route: { portman: 'Central line Holland Park → Marble Arch (four stops).', bressenden: 'Walk to Notting Hill Gate, Circle line to Victoria.' },
  cmp: { parks: 'Holland Park; Kensington Gardens ~1.5 km.', cafes: 'Small strip.', quiet: 'Very high.', bustle: 'Holland Park Avenue traffic.', stock: 'Villa conversions.', budget: 'RBKC ONS (Aug 2026) + asking medians (Kensington & Holland Park).' },
  evidence: { verified: 'Rents.', impression: 'Character.' },
  src: ['ons_kc', 'rentreboot'], wiki: [['Holland_Park']]
},
{
  id: 'kensington', name: 'Kensington', aka: 'High Street Kensington, Phillimore, Kensington Square', borough: 'Kensington and Chelsea', ll: [51.5010, -0.1940], r: 700, depth: 'deep',
  stations: ['High Street Kensington', 'Gloucester Road', 'Earl\'s Court'],
  character: [],
  glance: 'A prosperous, orderly residential district around Kensington High Street, with Kensington Palace and the Gardens on its north-east edge. Family-oriented and established; quieter in the evening than its high street suggests.',
  within: [
    'Kensington High Street: big-name shopping (including the old Barkers department-store building), the Design Museum at the west end — busy by day, quiet at night.',
    'Phillimore Estate (north of the High Street): large houses on hilly, very quiet streets.',
    'Kensington Square and the streets off Kensington Church Street: Georgian, calm.',
    'Abingdon Road, Allen Street, Scarsdale Villas, Stratford Road: quieter mansion-block and terrace streets running south toward Earl’s Court — good rental territory.',
    'Earl’s Court Road (south edge): traffic and a step down in polish.'
  ],
  everyday: 'Everything you need on the High Street; good cafés in the side streets; Kensington Gardens for runs.',
  drawbacks: ['Kensington High Street (A315) traffic.', 'Evenings are quiet; nightlife minimal.', 'Expensive.'],
  connections: 'High Street Kensington (Circle line) direct to Victoria; Kensington Gardens a few minutes north-east; Holland Park west.',
  edges: 'Notting Hill north of Kensington Church Street’s top; Earl’s Court south of Cromwell Road; South Kensington east.',
  fit: {
    strengths: 'Direct line to Victoria; Kensington Gardens; quiet side streets; good stock of mansion blocks.',
    tradeoffs: 'Portman needs a bus or a walk up to Notting Hill Gate for the Central line. Budget pressure for 2 beds.',
    unknowns: 'Lift and refurbishment in the specific block.'
  },
  route: {
    portman: 'Walk or bus up to Notting Hill Gate, Central line to Marble Arch; or buses along Kensington Road / Park Lane.',
    bressenden: 'Circle line High Street Kensington → Victoria direct.'
  },
  cmp: { parks: 'Very good: Kensington Gardens, Holland Park.', cafes: 'Good.', quiet: 'High off the High Street.', bustle: 'High Street shopping, A315.', stock: 'Mansion blocks, terraces, conversions, some new-build at the High Street west end.', budget: 'RBKC ONS (Aug 2026): 1-bed £2,640, 2-bed £3,428. Asking medians (Kensington & Holland Park): 1-bed £3,150, 2-bed £4,983.' },
  evidence: { verified: 'Rents; Kensington Gardens hours.', impression: 'Street character.' },
  src: ['ons_kc', 'rentreboot', 'rp_kg'], wiki: [['Kensington'], ['Kensington_High_Street']]
},
{
  id: 'southken', name: 'South Kensington & Queen’s Gate', borough: 'Kensington and Chelsea', ll: [51.4945, -0.1775], r: 700, depth: 'deep',
  stations: ['South Kensington', 'Gloucester Road'],
  character: [],
  glance: 'White stucco squares and very wide Victorian streets around the museums, Imperial College and the French Lycée. Polished and convenient, with heavy tourist and school-group traffic along Exhibition Road and a strong French and international presence.',
  within: [
    'Queen’s Gate: enormous stucco houses, nearly all divided into flats, student residences, embassies and small hotels — grand but mixed in occupancy; the north end runs up to Kensington Gardens.',
    'Onslow, Thurloe, Pelham and Egerton: white-stucco squares and crescents, the quietest and most expensive residential core.',
    'Exhibition Road: V&A, Science Museum, Natural History Museum — rammed at weekends and school holidays; the station’s pedestrian subway is one of London’s busiest.',
    'Bute Street / Harrington Road: French cafés, bookshops and the Lycée Français Charles de Gaulle — the French community is visible and long-established.',
    'Gloucester Road: hotels and a plainer high street; Cromwell Road (A4) cuts the area east–west.'
  ],
  everyday: 'Good cafés and restaurants, especially French; easy errands; Kensington Gardens 10 minutes north for runs.',
  drawbacks: [
    'Cromwell Road is a major arterial road — loud and polluted.',
    'Tourist pressure around the station and museums.',
    'Student and short-let occupancy in Queen’s Gate conversions means variable neighbours.',
    'Budget pressure for modern 2-beds.'
  ],
  connections: 'South Kensington (District, Circle, Piccadilly) two stops to Victoria. Kensington Gardens via Exhibition Road / Queen’s Gate. Chelsea is directly south down Sloane Avenue / Fulham Road.',
  edges: 'Knightsbridge east of the Brompton Oratory; Earl’s Court west of Gloucester Road; Chelsea south of Fulham Road.',
  fit: {
    strengths: 'Very easy Bressenden commute; Kensington Gardens / Hyde Park; good cafés.',
    tradeoffs: 'Portman needs a change or a 3 km walk across Hyde Park. Tourist edges and main-road noise. Expensive.',
    unknowns: 'Who else lives in the building (students/short-lets); lift.'
  },
  route: {
    portman: 'Piccadilly line to Green Park, Jubilee one stop to Bond Street; or walk north across Kensington Gardens / Hyde Park to Marble Arch.',
    bressenden: 'District or Circle line South Kensington → Sloane Square → Victoria.'
  },
  cmp: { parks: 'Very good: Kensington Gardens / Hyde Park.', cafes: 'Very good.', quiet: 'High in the squares; low on Cromwell Rd, Exhibition Rd, Gloucester Rd.', bustle: 'Museums, students, hotels, A4.', stock: 'Stucco conversions (Queen’s Gate), mansion blocks, mews.', budget: 'RBKC ONS (Aug 2026): 1-bed £2,640, 2-bed £3,428. Asking medians (Chelsea & Earl’s Court): 1-bed £2,925, 2-bed £4,550.' },
  evidence: { verified: 'Museum crowding (agent + encyclopedic), rents.', impression: 'Occupancy mix in Queen’s Gate; French presence (well known, not quantified here).' },
  src: ['sk_marsh', 'ons_kc', 'rentreboot', 'rp_kg'], wiki: [['South_Kensington'], ['Exhibition_Road']]
},
{
  id: 'knightsbridge', name: 'Knightsbridge', borough: 'Kensington and Chelsea / Westminster', ll: [51.4995, -0.1640], r: 550, depth: 'full',
  stations: ['Knightsbridge', 'Hyde Park Corner', 'South Kensington'],
  character: [],
  glance: 'Harrods, luxury retail and some of the most expensive flats in the world, plus quiet red-brick “Pont Street Dutch” mansion blocks behind. Global wealth and seasonal tourism dominate the main roads; the back streets are calm.',
  within: ['Brompton Road / Sloane Street: luxury retail, crowds, supercars in summer.', 'Hans Town / Cadogan Square / Pont Street: tall red-brick mansion blocks — the best rental stock.', 'Ennismore Gardens / Montpelier Square: quiet garden squares.', 'One Hyde Park and the Mandarin Oriental on the park edge.'],
  everyday: 'Waitrose-level errands are fine; cafés are pricey; little pub life.',
  drawbacks: ['Absentee ownership leaves dark windows.', 'Main roads crowded; seasonal Gulf tourism in summer.', 'Price.'],
  connections: 'Hyde Park across Knightsbridge; Piccadilly line; walk to Belgravia and Victoria.',
  edges: 'Belgravia east of Sloane Street; South Kensington west of the Oratory; Chelsea south of Pont Street.',
  fit: { strengths: 'Hyde Park; Bressenden walkable or one change.', tradeoffs: 'Budget buys little; not a neighbourhood for everyday life.', unknowns: '' },
  route: { portman: 'Walk across Hyde Park, or Piccadilly to Green Park + Jubilee to Bond Street.', bressenden: 'Walk via Hyde Park Corner and Grosvenor Place.' },
  cmp: { parks: 'Excellent.', cafes: 'Expensive.', quiet: 'High behind main roads.', bustle: 'Retail, tourists.', stock: 'Mansion blocks, conversions, luxury new-build.', budget: 'RBKC/Westminster ONS — Knightsbridge well above average.' },
  evidence: { verified: 'Rents (borough).', impression: 'Seasonal tourism, occupancy.' },
  src: ['ons_kc', 'ons_wsm'], wiki: [['Knightsbridge']]
},
{
  id: 'chelsea', name: 'Chelsea', borough: 'Kensington and Chelsea', ll: [51.4870, -0.1690], r: 900, depth: 'full',
  stations: ['Sloane Square', 'South Kensington'],
  character: [],
  glance: 'Prosperous Cadogan-estate streets of brick and stucco between the King’s Road and the river. Pretty and well kept, with poor Tube coverage west of Sloane Square.',
  within: ['King’s Road: shops and cafés from Sloane Square to World’s End; Saturday crowds.', 'Cheyne Walk / Chelsea Embankment: river views and constant traffic.', 'Chelsea Green and the streets around it: village-scale shops.', 'World’s End: a large council estate and a more mixed western end.', 'Royal Hospital grounds and Chelsea Physic Garden (limited public access).'],
  everyday: 'Very good shops and cafés; Battersea Park across the bridges for running.',
  drawbacks: ['No Tube west of Sloane Square — buses only.', 'Embankment traffic.', 'Chelsea FC match days near Fulham Road / Stamford Bridge.', 'Price.'],
  connections: 'Sloane Square (District/Circle) one stop to Victoria. Albert and Chelsea bridges to Battersea Park.',
  edges: 'Fulham beyond Stamford Bridge / Lots Road; South Kensington north of Fulham Road; Belgravia/Pimlico east of Sloane Square.',
  fit: { strengths: 'One stop to Victoria from Sloane Square; Battersea Park.', tradeoffs: 'Western Chelsea is a long walk to any station; Portman needs a change.', unknowns: 'Bus reliability on King’s Road.' },
  route: { portman: 'District/Circle to Victoria, then Victoria line to Green Park + Jubilee to Bond Street; or bus up Sloane Street and Park Lane.', bressenden: 'District/Circle Sloane Square → Victoria, or walk.' },
  cmp: { parks: 'Battersea Park, Royal Hospital grounds (limited).', cafes: 'Very good.', quiet: 'High in side streets.', bustle: 'King’s Road, Embankment, match days.', stock: 'Terraces, mansion blocks, conversions; Chelsea Barracks new-build.', budget: 'RBKC ONS (Aug 2026) + asking medians (Chelsea & Earl’s Court): 1-bed £2,925, 2-bed £4,550.' },
  evidence: { verified: 'Rents.', impression: 'Street character, match-day effects.' },
  src: ['ons_kc', 'rentreboot'], wiki: [['Chelsea,_London', 'Chelsea'], ['King%27s_Road', 'King’s Road']]
},
{
  id: 'belsize', name: 'Belsize Park', borough: 'Camden', ll: [51.5480, -0.1690], r: 700, depth: 'deep',
  stations: ['Belsize Park', 'Swiss Cottage', 'Chalk Farm', 'Hampstead Heath'],
  character: [],
  glance: 'Victorian villas and red-brick mansion blocks on the slope between Swiss Cottage and Hampstead, mostly converted into flats. Calm streets, a lively strip on Haverstock Hill and England’s Lane, and both Primrose Hill and Hampstead Heath within walking distance.',
  within: [
    'Belsize Square / Belsize Park Gardens / Belsize Avenue: wide streets of white stucco villas, nearly all flats, very quiet.',
    'Belsize Village (Belsize Lane): a small, good cluster of cafés, a deli and pubs.',
    'England’s Lane: compact shopping street with good cafés and a well-known pub; feels local.',
    'Haverstock Hill (A502): the main road — buses, the Everyman cinema, restaurants, more noise.',
    'Pond Street / South End Green near the Royal Free Hospital: ambulance traffic; Hampstead Heath begins here.',
    'South of the station, toward Chalk Farm and Adelaide Road, council towers and plainer streets.'
  ],
  everyday: 'A strong neighbourhood life without tourist pressure: weekend brunch, the Heath, Primrose Hill, independent cafés. Competition for good flats is intense.',
  drawbacks: [
    'Northern line (Edgware branch) is crowded at peak and Belsize Park is a deep, lift-access station.',
    'Both offices typically involve a change — the longest commutes among the brief’s named areas.',
    'Conversion flats: lifts rare, lower-ground flats can be dark or damp, sound insulation between floors varies.',
    'Haverstock Hill traffic; Royal Free sirens near Pond Street.'
  ],
  connections: 'Belsize Park (Northern); western Belsize is within walking distance of Swiss Cottage (Jubilee) — which matters for Portman. Overground at Hampstead Heath and Finchley Road & Frognal. Primrose Hill to the south, the Heath to the north-east.',
  edges: 'Hampstead begins up Rosslyn Hill; Swiss Cottage at the Finchley Road junction; Chalk Farm / Camden south of Adelaide Road; Gospel Oak east of Fleet Road.',
  fit: {
    strengths: 'Running: Heath and Primrose Hill on foot. Cafés and pubs: excellent. Quiet streets. Budget fits 2 beds more often than W1/SW1.',
    tradeoffs: 'Commute: change needed for both offices. Modern interiors mean hunting for good refurbishments.',
    unknowns: 'Measured commute times from a specific street — use the TfL lookup; flat-by-flat insulation.'
  },
  route: {
    portman: 'From west Belsize: walk to Swiss Cottage, Jubilee line to Bond Street. From the east: Northern line (a Charing Cross-branch train) to Tottenham Court Road, then Elizabeth or Central line west to Bond Street.',
    bressenden: 'Northern line to Euston (either branch), then Victoria line to Victoria.'
  },
  cmp: {
    parks: 'Excellent: Hampstead Heath, Primrose Hill; Regent’s Park beyond.',
    cafes: 'Very good, local rather than destination.',
    quiet: 'High off Haverstock Hill.',
    bustle: 'Haverstock Hill, Royal Free, Finchley Road edge.',
    stock: 'Villa conversions (lifts rare), red-brick mansion blocks, some modern blocks near Swiss Cottage.',
    budget: 'Camden ONS average £2,800 (all sizes, Jul 2026). Interpretation: 2-bed conversions commonly fall within £3–5k; check NW3 district data.'
  },
  evidence: { verified: 'Amenity strips and conversion-heavy stock (agents); Camden rent average.', impression: 'Commute pain level, ambulance noise near Pond Street.' },
  src: ['belsize_foxtons', 'belsize_benhams', 'ons_cam', 'ons_adhoc'], wiki: [['Belsize_Park'], ['Haverstock_Hill'], ['England%27s_Lane', 'England’s Lane']]
},
{
  id: 'primrosehill', name: 'Primrose Hill', borough: 'Camden', ll: [51.5420, -0.1575], r: 400, depth: 'full',
  stations: ['Chalk Farm'],
  character: [],
  glance: 'Pastel Victorian terraces between the hill and the railway, with Regent’s Park Road as its single, very good shopping street. Small, pretty, sociable and expensive.',
  within: ['Regent’s Park Road: cafés, bookshop, pubs, delis.', 'Chalcot Square and Chalcot Crescent: the postcard streets.', 'Gloucester Avenue: pubs and restaurants backing onto the rail cutting.'],
  everyday: 'Hill repeats before breakfast, Regent’s Park next door, the canal for longer runs.',
  drawbacks: ['The West Coast Main Line out of Euston runs in a cutting along the north edge — train noise for streets that back onto it.', 'Small stock; high prices; summer-evening crowds on the hill.', 'Commutes need a change or a long walk.'],
  connections: 'Chalk Farm (Northern); walk through Regent’s Park to Marylebone; canal to Camden and Little Venice.',
  edges: 'Camden Town east of the railway bridge; Belsize Park north of Adelaide Road; Regent’s Park to the south.',
  fit: { strengths: 'Best running doorstep in the north-west; cafés; quiet.', tradeoffs: 'Commute; budget; rail noise for some streets.', unknowns: 'Which side of a street backs onto the cutting.' },
  route: { portman: 'Walk through Regent’s Park to Clarence Gate and down Baker Street; or Northern line (Charing Cross branch) to Tottenham Court Road + Elizabeth line.', bressenden: 'Northern line to Euston, Victoria line to Victoria.' },
  cmp: { parks: 'Excellent.', cafes: 'Very good.', quiet: 'High except by the railway.', bustle: 'Hill crowds in summer.', stock: 'Victorian terraces and conversions.', budget: 'Camden ONS £2,800 avg (Jul 2026); Primrose Hill well above.' },
  evidence: { verified: 'Park hours.', impression: 'Rail noise extent; street character.' },
  src: ['ons_cam', 'rp_regents'], wiki: [['Primrose_Hill']]
},
{
  id: 'hampstead', name: 'Hampstead', borough: 'Camden', ll: [51.5560, -0.1780], r: 800, depth: 'full',
  stations: ['Hampstead', 'Hampstead Heath', 'Finchley Road & Frognal'],
  character: [],
  glance: 'A hilltop village of Georgian lanes and big Victorian houses on the edge of the Heath. Beautiful, quiet and established, with weekend visitors on the High Street and the longest commute of the brief’s areas.',
  within: ['Hampstead High Street / Heath Street: shops (increasingly chains), cafés, weekend crowds.', 'Flask Walk, Church Row, Holly Bush: Georgian lanes.', 'Frognal and Redington Road: large houses and mansion flats on steep streets.', 'South End Green: the Heath’s southern gateway.'],
  everyday: 'The Heath is the reason to live here — swimming ponds, Parliament Hill, Kenwood.',
  drawbacks: ['Commute to both offices is long.', 'Hilly; the Tube station is the deepest on the network.', 'Expensive; weekend visitors.'],
  connections: 'Northern line (Hampstead), Overground (Hampstead Heath, Finchley Road & Frognal).',
  edges: 'Belsize Park south of Rosslyn Hill; West Hampstead downhill west of Finchley Road.',
  fit: { strengths: 'Running and nature.', tradeoffs: 'Commute; cost.', unknowns: '' },
  route: { portman: 'Northern line (Charing Cross branch) to Tottenham Court Road + Elizabeth line, or bus to Swiss Cottage + Jubilee.', bressenden: 'Northern line to Euston + Victoria line.' },
  cmp: { parks: 'Best in London.', cafes: 'Good.', quiet: 'High.', bustle: 'Weekend High Street.', stock: 'Period houses, mansion blocks, conversions.', budget: 'Camden ONS £2,800 avg (Jul 2026); Hampstead above.' },
  evidence: { verified: '', impression: 'All character notes.' },
  src: ['ons_cam'], wiki: [['Hampstead'], ['Hampstead_Heath'], ['Kenwood_House']]
},
{
  id: 'swisscottage', name: 'Swiss Cottage & South Hampstead', borough: 'Camden', ll: [51.5440, -0.1790], r: 550, depth: 'full',
  stations: ['Swiss Cottage', 'Finchley Road', 'South Hampstead'],
  character: [],
  glance: 'A traffic-dominated junction (the Finchley Road gyratory) with a library, theatre and leisure centre, surrounded by quieter streets of Victorian houses and mansion blocks in South Hampstead. Practical and well connected; not pretty at its centre.',
  within: ['Finchley Road (A41): shops, O2 Centre, heavy traffic.', 'South Hampstead (Fairhazel, Greencroft, Compayne Gardens): red-brick mansion flats and conversions, quiet.', 'Eton Avenue: links to Belsize.'],
  everyday: 'Supermarkets and the O2 Centre for errands; Swiss Cottage library and leisure centre.',
  drawbacks: ['The A41 is loud and hostile to walk along.', 'Limited café culture at the junction itself.'],
  connections: 'Jubilee line (Swiss Cottage, Finchley Road) direct to Bond Street; Metropolitan at Finchley Road; Overground at South Hampstead.',
  edges: 'Belsize Park east, West Hampstead west, St John’s Wood south.',
  fit: { strengths: 'Jubilee line to Bond Street; good-value mansion flats in South Hampstead; Primrose Hill walkable.', tradeoffs: 'Main-road environment at the centre.', unknowns: '' },
  route: { portman: 'Jubilee line Swiss Cottage → Bond Street.', bressenden: 'Jubilee to Green Park + Victoria line.' },
  cmp: { parks: 'Primrose Hill walkable; Heath beyond.', cafes: 'Moderate.', quiet: 'High in South Hampstead.', bustle: 'A41.', stock: 'Mansion blocks, conversions, some modern blocks.', budget: 'Camden ONS £2,800 avg (Jul 2026).' },
  evidence: { verified: 'Stations.', impression: 'Character.' },
  src: ['ons_cam'], wiki: [['Swiss_Cottage'], ['Finchley_Road']]
}
]);
