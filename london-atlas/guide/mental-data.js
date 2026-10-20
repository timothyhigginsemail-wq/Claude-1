/*
 * "London, sorted": the city in eight kinds of place, plus flags for pockets worth knowing about.
 * Kinds are our read of the researched entries in ../data (character, not price).
 * Flags: `watch` = a specific problem named by police or a council (or Met figures);
 * `people` = an established community centre, as described by the cited page;
 * `event` = recurring crowds. Each flag carries its sources; [] means general knowledge.
 */
window.MENTAL = {
  kinds: {
    royal:     { name: 'Stucco & Royal Parks', line: 'White terraces, garden squares, embassies and the big parks. Polished, international, quiet at night.' },
    squares:   { name: 'Squares & mansion blocks', line: 'Georgian squares and red-brick blocks: the central streets people actually live on.' },
    villages:  { name: 'Hill villages', line: 'Hills, heath and high streets with their own life. Leafy, a little removed.' },
    terraces:  { name: 'Terraces & commons', line: 'Victorian terraces around big commons. Families, brunch, pubs, weekend sport.' },
    core:      { name: 'Working core', line: 'Offices, stations, shops and tourists. Busy by day, thin after hours.' },
    nightlife: { name: 'Markets & nightlife', line: 'Markets, music and bars. Young, loud at weekends, rough edges.' },
    towers:    { name: 'New towers', line: 'Glass towers and concierge blocks on old railway and industrial land.' },
    estates:   { name: 'Estates & high streets', line: 'Large council estates and busy local high streets. Mixed, working, strong local identity.' }
  },
  areaKind: {
    mayfair: 'royal', belgravia: 'royal', knightsbridge: 'royal', kensington: 'royal', southken: 'royal', hollandpark: 'royal', nottinghill: 'royal', bayswater: 'royal', chelsea: 'royal',
    marylebone: 'squares', pimlico: 'squares', maidavale: 'squares', littlevenice: 'squares', stjohnswood: 'squares', fitzrovia: 'squares', bloomsbury: 'squares', kennington: 'squares', islington: 'squares',
    hampstead: 'villages', belsize: 'villages', primrosehill: 'villages', swisscottage: 'villages', westhampstead: 'villages', stokenewington: 'villages',
    highbury: 'terraces', kentishtown: 'terraces', queenspark: 'terraces', fulham: 'terraces', battersea: 'terraces', clapham: 'terraces', chiswick: 'terraces', greenwich: 'terraces', hammersmith: 'terraces',
    coventgarden: 'core', stjames: 'core', victoria: 'core', paddington: 'core', euston: 'core', city: 'core', clerkenwell: 'core', southbank: 'core',
    soho: 'nightlife', shoreditch: 'nightlife', hackney: 'nightlife', camdentown: 'nightlife', brixton: 'nightlife', peckham: 'nightlife',
    nineelms: 'towers', canarywharf: 'towers', kingscross: 'towers', earlscourt: 'towers', wapping: 'towers', elephant: 'towers',
    kilburn: 'estates', northken: 'estates', shepherdsbush: 'estates', lisson: 'estates', bethnalgreen: 'estates', whitechapel: 'estates', bermondsey: 'estates'
  },
  flagTypes: {
    watch: { name: 'Watch out', line: 'A specific problem named by police or the council.' },
    people: { name: 'Communities', line: 'Long-established centres of a community.' },
    event: { name: 'Events & crowds', line: 'Recurring days when an area fills up.' }
  },
  flags: [
    { t: 'watch', name: 'Victoria station front', ll: [51.4944, -0.1482], note: 'Rough sleeping, street drinking and begging along Victoria Street; council street team since 2025.',
      src: [['Westminster Council', 'https://westminster.gov.uk/news/new-front-line-team-tackle-street-based-anti-social-behaviour-asb-westminster'], ['Victoria BID report 2025', 'https://london-hq.co.uk/wp-content/uploads/2025/10/LHQ_AR_2025_VictoriaWestminster-8.pdf']] },
    { t: 'watch', name: 'King’s Cross station fringe', ll: [51.5308, -0.1232], note: 'Drug-related anti-social behaviour around the stations is a local police priority.',
      src: [['Met Police ward priorities', 'https://www.met.police.uk/area/your-area/met/camden/kings-cross/contact-us/our-priorities']] },
    { t: 'watch', name: 'Camden High Street', ll: [51.5392, -0.1426], note: 'Street dealing tied to the nightlife and persistent shoplifting are police priorities.',
      src: [['Met Police ward priorities', 'https://www.met.police.uk/area/your-area/met/camden/camden-town2/on-the-team/our-priorities']] },
    { t: 'watch', name: 'Brixton town centre', ll: [51.4625, -0.1140], note: 'Open dealing around Windrush Square; targeted police patrols and a council street team.',
      src: [['Met Police ward priorities', 'https://www.met.police.uk/area/your-area/met/lambeth/brixton-windrush/about-us/our-priorities'], ['Lambeth Council', 'https://love.lambeth.gov.uk/brixton-focus-on-addressing-town-centre-social-issues']] },
    { t: 'watch', name: 'Kilburn High Road', ll: [51.5385, -0.1935], note: 'Violent crime on the High Road is a stated police priority; street rebuild funded in 2025.',
      src: [['Met Police ward priorities', 'https://www.met.police.uk/area/your-area/met/camden/kilburn/contact-us/our-priorities'], ['Brent Council', 'https://www.brent.gov.uk/news-in-brent/2025/june/millions-in-funding-for-a-better-and-safer-kilburn']] },
    { t: 'watch', name: 'Oxford & Regent Street', ll: [51.5152, -0.1440], note: 'London’s worst streets for phone snatching: about 6,500 thefts on Oxford Street alone in 2024.',
      src: [['Met figures via Westminster Conservatives', 'https://www.westminsterconservatives.com/news/mobile-phone-snatches-soar-westminsters-theft-end']] },
    { t: 'watch', name: 'Soho late at night', ll: [51.5138, -0.1335], note: 'The densest cluster of late licences in Westminster; crowds and disorder after midnight.',
      src: [['Westminster licensing record', 'https://westminster.moderngov.co.uk/documents/g6164/Printed%20minutes%2027th-Apr-2023%2010.00%20Licensing%20Sub-Committee%201.pdf?T=1']] },
    { t: 'watch', name: 'Shoreditch late at night', ll: [51.5255, -0.0780], note: 'Hackney’s main hotspot for night-time crime and ambulance call-outs, Thursday to Sunday.',
      src: [['Hackney Council research', 'https://hackney.moderngov.co.uk/documents/s61609/Appendix%204%20-%20Hackney%20ENTE%20Behaviour%20Research%20Summary%20Report.pdf']] },
    { t: 'watch', name: 'Church Street estates', ll: [51.5245, -0.1690], note: 'Low-income estates by Edgware Road with past complaints of dealing; long regeneration under way.',
      src: [['LSE research', 'https://csar.lse.ac.uk/en/articles/36'], ['Ward report (2020)', 'https://www.westminsterlabour.org.uk/ward-news/2020/09/26/church-street-ward-labour-action-report-september-2020/']] },

    { t: 'people', name: 'Bangladeshi: Brick Lane', ll: [51.5215, -0.0717], note: 'Heart of British Bangladeshi life. Tower Hamlets is 35% Bangladeshi (2021 Census).',
      src: [['Wikipedia: Brick Lane', 'https://en.wikipedia.org/wiki/Brick_Lane'], ['Tower Hamlets profile', 'https://towerhamlets.gov.uk/Documents/Borough_statistics/Tower-Hamlets-Borough-Profile-2024.pdf']] },
    { t: 'people', name: 'Arab: Edgware Road', ll: [51.5180, -0.1645], note: 'Lebanese and Middle Eastern restaurants, shisha cafés and late nights south of the flyover.',
      src: [['Wikipedia: Edgware Road', 'https://en.wikipedia.org/wiki/Edgware_Road']] },
    { t: 'people', name: 'Caribbean: Brixton', ll: [51.4592, -0.1188], note: 'Centre of Black British and Caribbean London since the Windrush generation; markets on Electric Avenue.',
      src: [['Wikipedia: Brixton', 'https://en.wikipedia.org/wiki/Brixton']] },
    { t: 'people', name: 'Haredi Jewish: Stamford Hill', ll: [51.5690, -0.0730], note: 'One of the largest Hasidic communities outside Israel and New York.',
      src: [['Wikipedia: Stamford Hill', 'https://en.wikipedia.org/wiki/Stamford_Hill']] },
    { t: 'people', name: 'Nigerian: Peckham', ll: [51.4700, -0.0690], note: 'Large British Nigerian community around Rye Lane, sometimes called Little Lagos.',
      src: [['Wikipedia: Peckham', 'https://en.wikipedia.org/wiki/Peckham']] },
    { t: 'people', name: 'Turkish, Kurdish & Vietnamese: Dalston', ll: [51.5500, -0.0750], note: 'Turkish and Kurdish grocers and grills up to Stoke Newington; Vietnamese cafés on Kingsland Road.',
      src: [['Wikipedia: Dalston', 'https://en.wikipedia.org/wiki/Dalston'], ['Wikipedia: Stoke Newington', 'https://en.wikipedia.org/wiki/Stoke_Newington']] },
    { t: 'people', name: 'Chinese: Chinatown', ll: [51.5110, -0.1300], note: 'Gerrard Street and around: restaurants, bakeries, supermarkets.',
      src: [['Wikipedia: Chinatown, London', 'https://en.wikipedia.org/wiki/Chinatown,_London']] },
    { t: 'people', name: 'French: South Kensington', ll: [51.4940, -0.1745], note: 'Lycée, Institut français and French cafés around Bute Street.',
      src: [['Wikipedia: South Kensington', 'https://en.wikipedia.org/wiki/South_Kensington']] },
    { t: 'people', name: 'Portuguese: Stockwell', ll: [51.4770, -0.1230], note: '“Little Portugal” along South Lambeth Road: cafés, bakeries, Madeiran clubs.',
      src: [['Wikipedia: Stockwell', 'https://en.wikipedia.org/wiki/Stockwell']] },
    { t: 'people', name: 'Moroccan & Portuguese: Golborne Road', ll: [51.5238, -0.2085], note: 'Known as Little Morocco, with two famous Portuguese pastry shops.',
      src: [['Wikipedia: Golborne Road', 'https://en.wikipedia.org/wiki/Golborne_Road']] },
    { t: 'people', name: 'Irish: Kilburn', ll: [51.5425, -0.1985], note: 'London’s largest Irish population historically; Irish pubs along the High Road.',
      src: [['Wikipedia: Kilburn', 'https://en.wikipedia.org/wiki/Kilburn,_London']] },
    { t: 'people', name: 'Polish: Hammersmith', ll: [51.4935, -0.2315], note: 'POSK, the Polish cultural centre, on King Street since 1967.',
      src: [['Wikipedia: POSK', 'https://en.wikipedia.org/wiki/Polish_Social_and_Cultural_Association']] },

    { t: 'event', name: 'Notting Hill Carnival', ll: [51.5180, -0.2050], note: 'August bank holiday weekend: two days of huge crowds, road closures and boarded-up shops.',
      src: [['Met Police', 'https://news.met.police.uk/pressreleases/met-sets-out-policing-plan-ahead-of-notting-hill-carnival-3400571'], ['ITV News 2026', 'https://www.itv.com/news/london/2026-08-30/police-arrest-169-at-notting-hill-carnival-but-mood-overwhelmingly-positive']] },
    { t: 'event', name: 'Hyde Park concerts & Winter Wonderland', ll: [51.5068, -0.1590], note: 'Big summer concerts (up to 70,000 a night) and a winter fair on the same corner of the park.',
      src: [['Time Out', 'https://www.timeout.com/london/news/bst-hyde-park-central-london-music-festival-is-getting-much-bigger-061126']] },
    { t: 'event', name: 'Lord’s match days', ll: [51.5294, -0.1727], note: 'Cricket crowds fill St John’s Wood in summer.', src: [] },
    { t: 'event', name: 'Stamford Bridge match days', ll: [51.4817, -0.1910], note: 'Chelsea home games close parts of Fulham Road.', src: [] },
    { t: 'event', name: 'Emirates match days', ll: [51.5549, -0.1084], note: 'Arsenal home games pack Highbury and Holloway.', src: [] }
  ]
};
