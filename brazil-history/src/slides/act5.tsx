import { useState } from 'react'
import type { SlideDef } from '../types'
import { Slide, At } from '../components/Slide'
import { Img } from '../components/Img'
import { MapFrame, type LonLat } from '../components/MapFrame'
import { Header, Cite, C } from './common'
import { ActDivider } from './divider'
import { BR_VIEW, Neighbors } from './act1'
import states from '../data/geo/brazil-states.json'

/* ===================== Divider ===================== */
const divider: SlideDef = {
  id: 'act5', act: 'V', short: 'Act V — Brazil and Rio Today',
  render: () => (
    <ActDivider numeral="V" title="Reading Brazil and Rio Today" span="the present, through the past" image="issNight" pos="50% 50%" highlight={[1985, 2026]} color="#e29a7c"
      question="Now that you know the history, what do the regions, the inequalities and the shape of Rio itself tell you?" />
  ),
  notes: (
    <>
      <p>Act V turns the history into tools for seeing: a mental map of Brazil’s regions, an account of why inequality is so durable, an explanation of Rio’s distinctive social geography, and an annotated map of the city that connects specific places to the story.</p>
      <p><strong>Image:</strong> Rio de Janeiro at night photographed from the International Space Station (Expedition 67, 2022; NASA, public domain). The dark shapes inside the lit city are the Tijuca and Pedra Branca massifs — the mountains that organise everything in the following slides.</p>
    </>
  ),
}

/* ===================== Regions ===================== */
const regions = [
  { id: '3', name: 'North', color: '#6f8f5a', pop: 8.5, gdp: 6, origin: 'Amazon frontier: missions, rubber boom (1879–1912), Manaus Free Trade Zone (1967), today’s deforestation frontier and largest Indigenous territories.', cities: 'Manaus · Belém' },
  { id: '4', name: 'Northeast', color: '#b8743f', pop: 26.9, gdp: 14, origin: 'The original sugar colony and Afro-Brazilian heartland; drought-prone sertão; for a century the great source of migrants to Rio and São Paulo. Lula’s electoral base.', cities: 'Salvador · Recife · Fortaleza' },
  { id: '2', name: 'Southeast', color: '#a23e27', pop: 41.8, gdp: 52, origin: 'Gold, coffee, industry and finance in succession. Holds both mega-cities, most of the country’s capital — and its largest urban peripheries.', cities: 'São Paulo · Rio · Belo Horizonte' },
  { id: '1', name: 'South', color: '#4b6a8a', pop: 14.7, gdp: 17, origin: 'Gaúcho cattle frontier facing the River Plate, then German and Italian smallholder colonies and cooperatives. Highest human-development scores.', cities: 'Porto Alegre · Curitiba' },
  { id: '5', name: 'Centre-West', color: '#a9a03e', pop: 8.0, gdp: 11, origin: 'Brasília, and since the 1970s the Cerrado agribusiness frontier — soy, corn, cotton, cattle — made possible by soil science. Fastest-growing region.', cities: 'Brasília · Goiânia · Cuiabá' },
]
const regionsSlide: SlideDef = {
  id: 'regions', act: 'V', short: 'A mental map of Brazil',
  render: () => (
    <Slide theme="paper">
      <At x={0} y={0} w={760} h={900}>
        <MapFrame map="brazil" w={760} h={900} view={BR_VIEW} fit="contain" imageOpacity={0.9}>
          {(p) => (
            <>
              <Neighbors p={p} />
              {(states as { features: { properties: { regiao_id: string; sigla: string } }[] }).features.map((f, i) => {
                const r = regions.find((x) => x.id === f.properties.regiao_id)!
                return <path key={i} d={p.path(f)} fill={r.color} fillOpacity={0.42} stroke="#f2ebdd" strokeWidth={1} />
              })}
              {([[[-62, -4.5], 'NORTH'], [[-41.5, -8], 'NORTHEAST'], [[-47.6, -21.6], 'SOUTHEAST'], [[-52.5, -28], 'SOUTH'], [[-54, -15], 'CENTRE-WEST']] as [LonLat, string][]).map(([at, t]) => {
                const [x, y] = p(at[0], at[1])
                return <text key={t} x={x} y={y} className="map-label big" textAnchor="middle" style={{ fontSize: 19 }}>{t}</text>
              })}
              {([[[-43.17, -22.9], 'Rio'], [[-46.63, -23.55], 'São Paulo'], [[-47.88, -15.79], 'Brasília'], [[-38.5, -12.97], 'Salvador'], [[-34.88, -8.05], 'Recife'], [[-60.02, -3.12], 'Manaus'], [[-43.94, -19.92], 'Belo Horizonte'], [[-51.23, -30.03], 'Porto Alegre']] as [LonLat, string][]).map(([at, t]) => {
                const [x, y] = p(at[0], at[1])
                const end = t === 'Recife' || t === 'Salvador'
                return <g key={t}><circle cx={x} cy={y} r={4.5} fill="#1f1b16" stroke="#fff" strokeWidth={1.5} /><text x={end ? x - 8 : x + 8} y={y + 4} className="map-label xs" textAnchor={end ? 'end' : 'start'}>{t}</text></g>
              })}
            </>
          )}
        </MapFrame>
      </At>
      <Header x={800} n={37} kicker="The Brazil mental map" title={<>Five regions, five histories — each the residue of a different cycle</>} w={720} size="sm" />
      <At x={800} y={250} w={720}>
        <div style={{ display: 'grid', gridTemplateColumns: '130px 70px 70px 1fr', gap: '0 12px', fontSize: 12, color: 'var(--muted)', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', paddingBottom: 6, borderBottom: '1px solid var(--rule)' }}>
          <span>Region</span><span>Pop.</span><span>GDP</span><span>Where it comes from</span>
        </div>
        {regions.map((r) => (
          <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '130px 70px 70px 1fr', gap: '0 12px', padding: '10px 0', borderBottom: '1px solid var(--rule)', alignItems: 'start' }}>
            <div>
              <div className="serif" style={{ fontSize: 22, fontWeight: 600, color: r.color, lineHeight: 1 }}>{r.name}</div>
              <div className="small" style={{ fontSize: 11.5, marginTop: 4 }}>{r.cities}</div>
            </div>
            <div className="mono" style={{ fontSize: 17 }}>{r.pop}%</div>
            <div className="mono" style={{ fontSize: 17 }}>≈{r.gdp}%</div>
            <div style={{ fontSize: 13.5, lineHeight: 1.4, color: 'var(--text-soft)' }}>{r.origin}</div>
          </div>
        ))}
        <p className="small" style={{ marginTop: 12 }}><b>Three capitals of three kinds:</b> Brasília governs, São Paulo produces and finances, Rio represents — the country’s showcase, oil-and-gas hub, media centre and the city through which most foreigners first meet Brazil. Salvador, the first capital (1549–1763), remains its Afro-Brazilian cultural capital.</p>
      </At>
      <Cite x={800} y={862} w={720}>Population: IBGE Censo 2022. GDP shares: IBGE Contas Regionais (c. 2021), rounded.</Cite>
    </Slide>
  ),
  notes: (
    <>
      <p>Brazil’s five official macro-regions are statistical conveniences, but they map remarkably well onto the historical cycles in this presentation. Each region carries the institutions, demography and elites of the era that made it.</p>
      <ul>
        <li><strong>Northeast</strong> — the colonial sugar core, then two centuries of relative decline. It has the highest share of Black and pardo population after the North, the lowest incomes, a powerful regional culture (forró, frevo, maracatu, Candomblé in Bahia, the literature of the sertão) and — after the great droughts and the rise of industry in the Southeast — supplied millions of migrants south. Rio’s Feira de São Cristóvão and São Paulo’s working-class districts are full of nordestinos. Since the 2000s cash transfers and minimum wage policy have made it the electoral bastion of Lula and the PT.</li>
        <li><strong>Southeast</strong> — Minas (gold, then dairy, mining and politics), Rio (court and capital), São Paulo (coffee, industry, finance), Espírito Santo. About 42% of the people and about half of GDP.</li>
        <li><strong>South</strong> — contested frontier with the Spanish world (hence the gaúcho cattle culture shared with Uruguay and Argentina), then 19th-century European colonisation on smallholdings. Higher equality and education than the national average.</li>
        <li><strong>Centre-West</strong> — almost empty until Brasília and the agricultural revolution of the Cerrado. Embrapa (the state agricultural research company, 1973) developed liming and soy varieties for acidic tropical soils; Brazil became the world’s largest soy exporter. The region is now one of the richest per capita — and a centre of conservative, agribusiness politics.</li>
        <li><strong>North</strong> — the Amazon. About 60% of the Amazon rainforest lies in Brazil; deforestation, mining and land-grabbing are its central political issues. Belém hosted the UN climate conference COP30 in November 2025.</li>
      </ul>
      <p className="small">Regional GDP shares vary year to year with commodity prices; the Centre-West’s share has risen steadily since 2000.</p>
    </>
  ),
  sources: ['ibgeCensus', 'fgvAtlas', 'baer'],
}

/* ===================== Inequality ===================== */
const layers = [
  { era: '1530s–1850', name: 'Land', c: C.sugar, how: 'Royal land grants to the few; then the 1850 Land Law made land purchasable only for cash, just as the slave trade ended.', now: 'Land ownership remains among the most concentrated on earth (land Gini ≈ 0.86).' },
  { era: '1550–1888', name: 'Slavery without reconstruction', c: C.brazilwood, how: 'Four centuries of slavery; abolition with no land, schooling or compensation; subsidised European immigrants preferred for the new jobs.', now: 'Black and pardo Brazilians earn roughly 40% less than white Brazilians.' },
  { era: '1930s–', name: 'A dual labour state', c: C.coffee, how: 'Vargas protected urban formal workers; rural and domestic workers were excluded for decades.', now: 'About 4 in 10 workers are informal, outside the protections of the CLT.' },
  { era: '1964–1994', name: 'Inflation & indexation', c: C.military, how: 'Indexed accounts shielded the banked middle and upper classes; cash-holding poor paid the inflation tax.', now: 'A legacy of very high real interest rates that reward holders of public debt.' },
  { era: '1988–', name: 'Fiscal design', c: C.atlantic, how: 'Taxes lean on consumption; dividends were untaxed from 1996; generous public pensions; free public universities long dominated by the privately schooled.', now: 'The top 1% receive roughly a quarter of national income (tax data).' },
]
const inequality: SlideDef = {
  id: 'inequality', act: 'V', short: 'Why inequality endures',
  render: () => (
    <Slide theme="paper">
      <Header n={38} kicker="Political economy" title={<>Why inequality endures: five layers laid down over five centuries</>} w={1100} size="md" />
      <At x={80} y={268} w={1440}>
        <div style={{ display: 'grid', gridTemplateColumns: '150px 270px 1fr 1fr', gap: '0 24px', fontSize: 11.5, color: 'var(--muted)', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', paddingBottom: 8 }}>
          <span>Laid down</span><span>Layer</span><span>Mechanism</span><span>What you can still measure</span>
        </div>
        {layers.map((l, i) => (
          <div key={l.name} className={`rise d${i + 1}`} style={{ display: 'grid', gridTemplateColumns: '150px 270px 1fr 1fr', gap: '0 24px', alignItems: 'center', background: `${l.c}${['22', '1c', '18', '14', '10'][i]}`, borderLeft: `6px solid ${l.c}`, padding: '14px 16px', marginBottom: 6 }}>
            <span className="mono" style={{ fontSize: 14, color: l.c }}>{l.era}</span>
            <span className="serif" style={{ fontSize: 25, fontWeight: 600, lineHeight: 1.05 }}>{l.name}</span>
            <span style={{ fontSize: 14.5, lineHeight: 1.45, color: 'var(--text-soft)' }}>{l.how}</span>
            <span style={{ fontSize: 14.5, lineHeight: 1.45, color: 'var(--text)', fontWeight: 500 }}>{l.now}</span>
          </div>
        ))}
      </At>
      <At x={80} y={742} w={1440}>
        <div style={{ display: 'flex', gap: 40 }}>
          <p className="body" style={{ fontSize: 15, margin: 0, flex: 1 }}><strong>But inequality is not fate.</strong> Between 2001 and 2014 the Gini index fell by about six points — through a rising minimum wage, mass schooling, pensions and cash transfers — before stalling. A 2025 income-tax law, in force from 2026, exempts low earners and imposes a minimum tax on very high incomes, including dividends.</p>
          <p className="body" style={{ fontSize: 15, margin: 0, flex: 1 }}>Read the layers as <strong>sediment</strong>: each era added a mechanism without removing the earlier ones. That is why Brazil can be a high-tech agricultural power with world-class banks and, at the same time, a country where millions live without sewerage.</p>
        </div>
      </At>
      <Cite y={862} w={1400}>IBGE Censo Agropecuário 2017 (land Gini); PNAD Contínua (informality, income by colour); Souza (2018) on top incomes; Arretche (ed., 2015).</Cite>
    </Slide>
  ),
  notes: (
    <>
      <p>“Why is Brazil so unequal?” has no single answer. This slide organises the main explanations historically, because each was added at a particular moment and none was ever fully removed.</p>
      <ul>
        <li><strong>Land.</strong> Colonial sesmarias granted vast estates; squatting (posse) was common but insecure. The 1850 Land Law ended free occupation of public land precisely as free labour was about to replace slave labour, keeping freedpeople and immigrants landless. No significant land reform followed; the 2017 agricultural census shows a Gini of land ownership of about 0.86.</li>
        <li><strong>Race.</strong> Abolition without reconstruction, followed by state-subsidised European immigration and decades of “racial democracy” ideology that denied the problem. Measured gaps in income, education, wealth and exposure to violence remain large.</li>
        <li><strong>The dual labour state.</strong> Vargas-era labour rights created a protected formal sector; the informal majority — rural workers until 1963, domestic workers fully only in 2013, and today’s informal workers (roughly 38–40% of the employed in PNAD Contínua in 2024–25) — sat outside it.</li>
        <li><strong>Inflation.</strong> High inflation redistributed from the poor (who held cash) to those with indexed assets. The Real Plan’s end of high inflation was one of the most progressive policies in Brazilian history.</li>
        <li><strong>Fiscal design.</strong> Brazil’s tax burden is high for a middle-income country (about a third of GDP), but it falls heavily on goods and services rather than on incomes and wealth; dividends were exempt from personal income tax from 1996 until the 2025 reform; public spending on pensions is very large, and until affirmative action (2012) the free federal universities were dominated by graduates of private schools. Pedro Souza’s work with income-tax records shows the top 1% receiving roughly a quarter of national income — higher than household surveys suggest.</li>
      </ul>
      <h4>The other side</h4>
      <p>Between 2001 and 2014 the household-survey Gini fell from about 0.59 to about 0.52 — one of the largest declines recorded anywhere — thanks to the minimum wage (which also sets pensions), expanded schooling, Bolsa Família and formalisation. Progress stalled with the 2015–16 recession. The 2023 tax reform (on consumption taxes, phased in from 2026) and the 2025 income-tax law (Law 15.270/2025: exemption up to R$5,000 a month; minimum effective rate on annual incomes above R$600,000; withholding on large dividends) are the most significant attempts in decades to change the fiscal layer.</p>
      <div className="contested"><span className="contested-label">Interpretation</span>Economists disagree on weights. Some emphasise education (the skill premium: universal primary schooling came late — half of adults were illiterate in 1950); others institutions and political power (elites shaping taxes and spending); others race-specific discrimination. The historical layering suggests they reinforce one another.</div>
    </>
  ),
  sources: ['souza', 'arretche', 'wbGini', 'fernandes', 'french', 'ibge2022'],
}

/* ===================== Rio: mountain & sea ===================== */
const rioClass: SlideDef = {
  id: 'rio-class', act: 'V', short: 'Rio: the mountains sort the classes',
  render: () => (
    <Slide theme="ink">
      <Img id="ipanemaLeblon" style={{ position: 'absolute', left: 0, top: 0, width: 1600, height: 520 }} pos="50% 55%" credit="br" />
      <div style={{ position: 'absolute', left: 0, top: 380, width: 1600, height: 140, background: 'linear-gradient(0deg, #15120e, rgba(21,18,14,0))' }} />
      <Header x={80} y={470} n={39} kicker="Rio today" title={<>In Rio, favelas look down on the beach — and the true periphery is out of sight</>} w={1300} size="md" />
      <At x={80} y={630} w={1440}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 34 }}>
          <div>
            <div className="serif" style={{ fontSize: 23, fontWeight: 600, color: '#efe7d6' }}>Hills beside the jobs</div>
            <p className="body" style={{ fontSize: 14.5, marginTop: 6 }}>Steep, often publicly owned slopes were left out of the formal market; workers built there, a walk from the households, hotels and building sites of the Zona Sul. Rocinha — 72,021 people in 2022 — sits between Gávea and São Conrado.</p>
          </div>
          <div>
            <div className="serif" style={{ fontSize: 23, fontWeight: 600, color: '#efe7d6' }}>The periphery you won’t see</div>
            <p className="body" style={{ fontSize: 14.5, marginTop: 6 }}>Most poor cariocas live far from the beaches — in the North and West Zones and the Baixada Fluminense, with commutes of two hours or more. About 15% of greater Rio lives in favelas (2022 census).</p>
          </div>
          <div>
            <div className="serif" style={{ fontSize: 23, fontWeight: 600, color: '#efe7d6' }}>Policy swings</div>
            <p className="body" style={{ fontSize: 14.5, marginTop: 6 }}>Removals in the 1960s–70s (to Cidade de Deus and Vila Kennedy); upgrading from the 1990s; armed “pacification” from 2008; today drug factions and militias contest territory. A police raid in Penha and Alemão on 28 October 2025 killed more than 120 people — the deadliest in the city’s history.</p>
          </div>
        </div>
      </At>
      <Cite x={80} y={862} w={1400}>Top: Ipanema and Leblon from Dois Irmãos, with Lagoa and the Cantagalo hill (Wilfredor, 2024, CC0). IBGE Censo 2022; Perlman (2010); Valladares (2005); Rio Public Defender’s Office (2025).</Cite>
    </Slide>
  ),
  notes: (
    <>
      <h4>Why poverty sits in the middle of wealth</h4>
      <p>In most Latin American cities the poor live mainly at the urban edge. Rio has that pattern too — but it also has favelas in the heart of its richest districts. The reasons are geographic and historical: the Tijuca massif’s steep slopes were unattractive and often legally unbuildable for the formal market; they were close to employment in domestic service, construction and commerce; and from the 1890s onward (Act III) displacement from the centre pushed the poor uphill. Mid-20th-century migration from the Northeast and from the state’s interior swelled favelas in every zone.</p>
      <h4>Removal and its legacy</h4>
      <p>Under Governor Carlos Lacerda (1960–65) and the military regime, tens of thousands of residents were removed from Zona Sul favelas — Praia do Pinto (1969) and Catacumba (1970) by the Lagoa among them — to distant housing estates such as Vila Kennedy (1964, partly US-funded through the Alliance for Progress) and Cidade de Deus (1960s), later made famous by the 2002 film. Janice Perlman followed families from 1968 to the 2000s and found real gains in education and consumption but persistent stigma and, increasingly, violence. After redemocratisation, Leonel Brizola stopped removals; the Favela-Bairro programme (1994) upgraded infrastructure.</p>
      <h4>Violence and the state</h4>
      <p>From the 1980s drug-trafficking factions (Comando Vermelho, founded in the prison system in 1979, and rivals) controlled many favelas. From the late 1990s militias — groups often formed by police and ex-police — took over large parts of the West Zone and the Baixada, extorting fees for gas, transport, internet and property. The Pacifying Police Units (UPPs, 2008–) brought temporary reductions in violence before a fiscal collapse in the state (2016–17) undermined them. Police killings remain very high. On 28 October 2025 a large operation against the Comando Vermelho in the Penha and Alemão complexes killed, by official count, initially 64 and, by later tallies, more than 120 people, including four police officers; human-rights organisations called it a massacre, the state governor called it a success.</p>
      <h4>Data</h4>
      <p>Census 2022: 16.4 million Brazilians (8.1%) live in what IBGE now calls “favelas and urban communities”; for the Rio urban concentration the share is 14.8%. Rocinha (72,021) is the most populous single favela in Brazil; Rio das Pedras, in the militia-dominated West Zone, is second by number of households.</p>
      <p className="small">If you visit a favela, go with a resident-run organisation or guide; avoid “safari” tours. Conditions vary block by block and day by day.</p>
    </>
  ),
  sources: ['perlman', 'valladares', 'ibgeFavelas', 'rioOp2025', 'abreu'],
}

/* ===================== The city you're about to visit ===================== */
type EraKey = 'colonial' | 'gold' | 'empire' | 'republic' | 'modern'
const eraMeta: Record<EraKey, { label: string; color: string }> = {
  colonial: { label: 'Colonial (1565–1808)', color: C.sugar },
  gold: { label: 'Gold & slave port (1700–1850)', color: C.gold },
  empire: { label: 'Court & Empire (1808–1889)', color: C.empire },
  republic: { label: 'Republic & Belle Époque (1889–1945)', color: C.republic },
  modern: { label: 'Modern Rio (1945–today)', color: C.atlantic },
}
interface Site { n: number; name: string; at: LonLat; era: EraKey; see: string; means: string; ref: string; dx?: number; dy?: number }
export const sites: Site[] = [
  { n: 1, name: 'Praça XV & Paço Imperial', at: [-43.1745, -22.9033], era: 'empire', see: 'A plain colonial palace on a square by the ferry docks; the Arco do Teles alley beside it.', means: 'The governors’ house (1743) became the royal palace in 1808. João VI was acclaimed here (1818); Princess Isabel signed the Golden Law here (1888). Brazil’s political centre for two centuries.', ref: 'Slides 15, 20' },
  { n: 2, name: 'Mosteiro de São Bento', at: [-43.1777, -22.8968], era: 'colonial', see: 'A severe façade on a hill; inside, walls carved and covered in gold leaf.', means: 'Founded on one of the four hills of the first city; its gilding is the money of sugar and Minas gold made visible.', ref: 'Slides 8, 12' },
  { n: 3, name: 'Valongo Wharf', at: [-43.1867, -22.8972], era: 'gold', see: 'An open excavation: two layers of stone paving below street level.', means: 'Where hundreds of thousands of enslaved Africans landed; buried twice, rediscovered in 2011, UNESCO site since 2017.', ref: 'Slide 19', dx: -16 },
  { n: 4, name: 'Pedra do Sal', at: [-43.1841, -22.8977], era: 'republic', see: 'A rock outcrop with carved steps; crowded samba on Monday nights.', means: 'Heart of “Little Africa,” where Bahian migrants and freed people settled after abolition and samba took shape.', ref: 'Slides 19, 28', dy: 16 },
  { n: 5, name: 'Morro da Providência', at: [-43.1925, -22.898], era: 'republic', see: 'The hill above Central do Brasil station and the port.', means: 'The “Morro da Favella” of the Canudos veterans (1897) — the name that became the word.', ref: 'Slide 25', dx: -14 },
  { n: 6, name: 'Museu do Amanhã & Praça Mauá', at: [-43.1794, -22.8945], era: 'modern', see: 'Calatrava’s museum on a pier; the MAR art museum; the waterfront Orla Conde.', means: 'Olympic-era Porto Maravilha (2009–16) demolished an elevated highway and remade the old port — the works that uncovered Valongo.', ref: 'Slides 19, 26', dy: -14 },
  { n: 7, name: 'Theatro Municipal & Cinelândia', at: [-43.1764, -22.909], era: 'republic', see: 'An opera house, national library and fine-arts museum around a square.', means: 'The showpiece of Pereira Passos’s Paris-on-the-tropics (1902–10). Nearby, the flat Esplanada do Castelo is the ghost of Rio’s founding hill.', ref: 'Slide 25' },
  { n: 8, name: 'Arcos da Lapa', at: [-43.1801, -22.913], era: 'gold', see: 'A white double-tiered aqueduct, now carrying the Santa Teresa tram; nightlife beneath.', means: 'Completed c. 1750 to water a city made populous by gold. The Selarón steps are nearby.', ref: 'Slides 12, 26', dx: -15 },
  { n: 9, name: 'Santa Teresa', at: [-43.1875, -22.921], era: 'empire', see: 'Hillside lanes, old chácara mansions, the yellow tram.', means: '19th-century retreat of the well-off above the hot centre; later artists’ quarter.', ref: 'Slide 26', dx: -15 },
  { n: 10, name: 'Catete Palace', at: [-43.1765, -22.9258], era: 'republic', see: 'A coffee baron’s palace, now the Museu da República, with a garden.', means: 'Presidential palace 1897–1960; Vargas shot himself in its bedroom in 1954.', ref: 'Slide 27' },
  { n: 11, name: 'Aterro do Flamengo', at: [-43.1705, -22.9335], era: 'modern', see: 'A long seaside park of lawns and palms with the Modern Art Museum.', means: 'Built in the 1960s on landfill from the demolished Morro de Santo Antônio; landscape by Burle Marx. The original shore is the road behind it.', ref: 'Slide 26' },
  { n: 12, name: 'Botafogo', at: [-43.1815, -22.9475], era: 'empire', see: 'A calm bay with Sugarloaf beyond; old mansions among offices and bars.', means: 'The aristocratic suburb of the 19th-century Empire, reached along the bay before tunnels opened the ocean beaches.', ref: 'Slide 26', dx: -15 },
  { n: 13, name: 'Sugarloaf & Urca', at: [-43.1566, -22.9493], era: 'colonial', see: 'The granite dome and its cable car (1912).', means: 'At its foot Estácio de Sá founded the city on 1 March 1565; forts on both sides of the narrow bay mouth.', ref: 'Slide 11' },
  { n: 14, name: 'Copacabana', at: [-43.184, -22.9705], era: 'republic', see: 'Four kilometres of beach, Burle Marx’s wave pavement, the Copacabana Palace (1923).', means: 'Opened by tunnels in 1892 and 1906; the Atlantic city of the 20th-century middle class; the 1922 Fort revolt began here.', ref: 'Slide 26' },
  { n: 15, name: 'Ipanema', at: [-43.205, -22.9855], era: 'modern', see: 'Beach “postos,” the Cantagalo hill above, the bossa nova bars.', means: 'Bossa nova’s neighbourhood (late 1950s–60s); also the clearest view of Rio’s hill-and-beach social geography.', ref: 'Slide 39' },
  { n: 16, name: 'Leblon', at: [-43.2235, -22.9835], era: 'empire', see: 'The city’s richest flat neighbourhood.', means: 'Site of the 1880s abolitionist “quilombo” where camellias — the movement’s symbol — were grown.', ref: 'Slide 20' },
  { n: 17, name: 'Jardim Botânico & Lagoa', at: [-43.2245, -22.9672], era: 'empire', see: 'The avenue of imperial palms; the lagoon below Corcovado.', means: 'Founded by João VI in 1808; Lagoa-side favelas were removed around 1969–70.', ref: 'Slides 15, 39' },
  { n: 18, name: 'Rocinha', at: [-43.248, -22.988], era: 'modern', see: 'A dense hillside city between Gávea and São Conrado.', means: 'Brazil’s most populous favela (72,021 in 2022).', ref: 'Slide 39' },
  { n: 19, name: 'Corcovado & Tijuca Forest', at: [-43.2105, -22.9519], era: 'republic', see: 'Christ the Redeemer (1931) above a rainforest.', means: 'The forest is a garden: replanted from 1861 after coffee had stripped the hills and threatened the water supply.', ref: 'Slides 18, 41' },
  { n: 20, name: 'Maracanã', at: [-43.2302, -22.9122], era: 'modern', see: 'The stadium (1950), rebuilt for 2014.', means: 'The 1950 World Cup defeat — and the North Zone’s football culture.', ref: 'Slide 29' },
  { n: 21, name: 'Quinta da Boa Vista', at: [-43.2264, -22.9058], era: 'empire', see: 'A park around the imperial palace, now the fire-damaged National Museum; the Northeastern fair nearby.', means: 'The emperors’ residence, donated by a slave-trading merchant in 1808.', ref: 'Slide 15', dy: 16 },
  { n: 22, name: 'Sambódromo', at: [-43.1965, -22.9115], era: 'modern', see: 'Niemeyer’s parade avenue (1984).', means: 'Built near the vanished Praça Onze, cradle of samba, destroyed for Avenida Presidente Vargas (1944).', ref: 'Slide 28', dy: 16 },
  { n: 23, name: 'Ilha Fiscal', at: [-43.1667, -22.8968], era: 'empire', see: 'A green neo-Gothic customs house on an islet.', means: 'Scene of the Empire’s last ball, 9 November 1889 — six days before the Republic.', ref: 'Slide 21' },
  { n: 24, name: 'Niterói', at: [-43.124, -22.894], era: 'colonial', see: 'The ferry across the bay; Niemeyer’s flying-saucer museum (MAC).', means: 'Founded in 1573 as the village of Arariboia, the Temiminó chief who fought for the Portuguese.', ref: 'Slides 6, 11' },
]
const CITY_VIEW = { w: -43.262, s: -23.0, e: -43.115, n: -22.885 }
function CityMap({ initial = 1 }: { initial?: number }) {
  const [sel, setSel] = useState(initial)
  const s = sites.find((x) => x.n === sel)!
  return (
    <Slide theme="paper">
      <At x={0} y={0} w={1040} h={900} className="interactive">
        <MapFrame map="rioCity" w={1040} h={900} view={CITY_VIEW}>
          {(p) => (
            <>
              {[['Guanabara Bay', [-43.15, -22.905]], ['Atlantic Ocean', [-43.2, -22.997]], ['Lagoa', [-43.2095, -22.972]]].map(([t, at]) => {
                const [x, y] = p((at as LonLat)[0], (at as LonLat)[1])
                return <text key={t as string} x={x} y={y} className="map-label it" textAnchor="middle">{t as string}</text>
              })}
              {[['TIJUCA MASSIF', [-43.245, -22.945]], ['CENTRO', [-43.183, -22.905]], ['ZONA SUL', [-43.195, -22.958]], ['ZONA NORTE', [-43.24, -22.892]]].map(([t, at]) => {
                const [x, y] = p((at as LonLat)[0], (at as LonLat)[1])
                return <text key={t as string} x={x} y={y} className="map-label caps" textAnchor="middle">{t as string}</text>
              })}
              {sites.map((st) => {
                const [x, y] = p(st.at[0], st.at[1])
                const on = st.n === sel
                return (
                  <g key={st.n} style={{ cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); setSel(st.n) }} onMouseEnter={() => setSel(st.n)}>
                    <circle cx={x} cy={y} r={on ? 16 : 12} fill={eraMeta[st.era].color} stroke="#fff" strokeWidth={on ? 3 : 2} />
                    <text x={x} y={y + 4.5} textAnchor="middle" fontSize={on ? 14 : 12} fontWeight={700} fill="#fff" fontFamily="Inter" style={{ pointerEvents: 'none' }}>{st.n}</text>
                  </g>
                )
              })}
            </>
          )}
        </MapFrame>
      </At>
      <At x={1080} y={56} w={460}>
        <div className="kicker"><span className="k-num">40</span><span className="k-rule" />The city you are about to visit</div>
        <h1 className="title sm" style={{ marginTop: 12, fontSize: 36 }}>Twenty-four places where Rio’s history is still visible</h1>
        <div className="small" style={{ marginTop: 8 }}>Hover or click a number.</div>
      </At>
      <At x={1080} y={250} w={460}>
        <div key={sel} className="fade-in card" style={{ background: '#fbf7ee', borderLeft: `5px solid ${eraMeta[s.era].color}`, minHeight: 330 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="mono" style={{ fontSize: 30, color: eraMeta[s.era].color, fontWeight: 500 }}>{s.n}</span>
            <span className="pill" style={{ color: eraMeta[s.era].color }}>{eraMeta[s.era].label}</span>
          </div>
          <div className="serif" style={{ fontSize: 30, fontWeight: 600, lineHeight: 1.05, marginTop: 8 }}>{s.name}</div>
          <div className="label" style={{ marginTop: 14 }}>What you’ll see</div>
          <p style={{ fontSize: 15, margin: '4px 0 0', lineHeight: 1.45 }}>{s.see}</p>
          <div className="label" style={{ marginTop: 12 }}>What it means</div>
          <p style={{ fontSize: 15, margin: '4px 0 0', lineHeight: 1.45, color: 'var(--text-soft)' }}>{s.means}</p>
          <div className="small" style={{ marginTop: 12 }}>{s.ref}</div>
        </div>
      </At>
      <At x={1080} y={640} w={460}>
        <div className="label" style={{ marginBottom: 8 }}>Layers</div>
        {(Object.keys(eraMeta) as EraKey[]).map((k) => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13.5, marginBottom: 6 }}>
            <span style={{ width: 14, height: 14, borderRadius: 7, background: eraMeta[k].color, display: 'inline-block' }} />{eraMeta[k].label}
          </div>
        ))}
      </At>
      <Cite x={1080} y={856} w={460}>Positions approximate. Relief: AWS Terrain Tiles; coastline IBGE.</Cite>
    </Slide>
  )
}
const cityMap: SlideDef = {
  id: 'city-map', act: 'V', short: 'The city you’re about to visit',
  render: () => <CityMap />,
  notes: (
    <>
      <p>A walking logic for the historical sites:</p>
      <ul>
        <li><strong>Centro & the port (one long morning):</strong> Praça XV and the Paço Imperial → Arco do Teles and Rua do Ouvidor → Candelária → Mosteiro de São Bento → Praça Mauá (MAR, Museu do Amanhã) → Valongo Wharf → Instituto Pretos Novos → Pedra do Sal. Add the Real Gabinete Português de Leitura and the Confeitaria Colombo (1894) for the Belle Époque.</li>
        <li><strong>Cinelândia, Lapa, Santa Teresa:</strong> Theatro Municipal, Biblioteca Nacional and Museu Nacional de Belas Artes; the Esplanada do Castelo; the Arcos da Lapa and the Selarón steps; the tram up to Santa Teresa.</li>
        <li><strong>The bay shore south:</strong> Glória church (1739) → Catete Palace (Museu da República) → the Aterro do Flamengo → Botafogo → Urca and Sugarloaf (the 1565 founding site).</li>
        <li><strong>The Atlantic city:</strong> Copacabana (fort, palace, promenade) → Ipanema → Leblon; Lagoa and Jardim Botânico; Corcovado through the Tijuca Forest.</li>
        <li><strong>North Zone:</strong> Quinta da Boa Vista and the São Cristóvão fair; Maracanã; for samba, Madureira (Portela, Império Serrano) on a rehearsal night.</li>
      </ul>
      <h4>All sites</h4>
      <ol>
        {sites.map((s) => <li key={s.n}><strong>{s.name}</strong> — {s.means}</li>)}
      </ol>
    </>
  ),
  sources: ['abreu', 'unescoRio', 'unescoValongo'],
}

/* ===================== What you'll notice ===================== */
const notices = [
  { img: 'morroCastelo', t: 'Flat ground where hills used to be', b: 'The Esplanada do Castelo and the area around Largo da Carioca are the sites of demolished hills — including the one the city was founded on.' },
  { img: 'aterro', t: 'A shoreline that is mostly man-made', b: 'The Aterro, Santos Dumont airport and the port all stand on landfill — much of it made from those hills. Glória church once stood by the water.' },
  { img: 'pacoImperial', t: 'A palace that is just a big house', b: 'The Paço is modest because it was a colonial governor’s residence improvised into the seat of an empire.' },
  { img: 'valongoRuins2', t: 'Africa underfoot in the port', b: 'In Saúde and Gamboa the Valongo stones, the Pretos Novos cemetery and Pedra do Sal mark the largest slave port in the Americas.' },
  { img: 'capanema', t: 'Three cities on one walk', b: 'Colonial churches, Passos’s Parisian façades and Vargas-era modernism (the Capanema Palace) stand within a few blocks — each era rebuilt the centre in its own image.' },
  { img: 'rocinhaAerial', t: 'The mountain is a class line', b: 'Zona Sul faces the ocean; the Zona Norte lies behind the massif along the railway. Tunnels, not distance, separate them. Favelas climb the slopes in between.' },
  { img: 'calcadao', t: 'The beach is the public square', b: 'Since the 1920s the beach replaced the bay as Rio’s stage — the one space everyone shares, subdivided by posto, tribe and neighbourhood.' },
  { img: 'tijucaForest', t: 'The rainforest is a 19th-century garden', b: 'Coffee stripped the Tijuca hills; from 1861 the Empire replanted them to save the water supply — one of the first large reforestations anywhere.' },
]
const notice: SlideDef = {
  id: 'notice', act: 'V', short: 'What you’ll notice now',
  render: () => (
    <Slide theme="paper">
      <Header n={41} kicker="The payoff" title={<>Eight things you will now notice in Rio — and what they mean</>} w={1200} size="md" />
      <At x={80} y={230} w={1440}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '22px 22px' }}>
          {notices.map((n, i) => (
            <div key={n.t} className={`rise d${Math.min(i + 1, 6)}`}>
              <Img id={n.img} style={{ width: '100%', height: 140 }} credit={false} pos="50% 50%" />
              <div className="serif" style={{ fontSize: 20.5, fontWeight: 600, lineHeight: 1.1, marginTop: 10 }}>{n.t}</div>
              <p style={{ fontSize: 13.2, lineHeight: 1.42, color: 'var(--text-soft)', margin: '6px 0 0' }}>{n.b}</p>
            </div>
          ))}
        </div>
      </At>
      <Cite y={866} w={1400}>Photographs: Augusto Malta (Morro do Castelo, 1921); Pppires; Fulviusbsas; Ian Storni Machado; Henrique Liberal; Chensiyuan; Mteixeira62; Halley Pacheco de Oliveira — via Wikimedia Commons (see credits).</Cite>
    </Slide>
  ),
  notes: (
    <>
      <p>A few more things to look for:</p>
      <ul>
        <li><strong>Street names are a history lesson.</strong> Rua Primeiro de Março (end of the Paraguayan War, 1 March 1870) was the colonial Rua Direita; Avenida Presidente Vargas; Rua Visconde de Pirajá in Ipanema (an independence-war hero); Praça Tiradentes, where the Inconfidência martyr was executed in 1792.</li>
        <li><strong>Portuguese tiles (azulejos) and the Portuguese pavement</strong> (black-and-white calçada) — including Burle Marx’s Copacabana waves (1970), an expansion of an older Portuguese design.</li>
        <li><strong>“Subúrbio” means working-class</strong>: the rail suburbs of the North Zone (Madureira, Méier, Bangu) are where samba schools, big football fan bases and much of the city’s popular culture live.</li>
        <li><strong>Nordestino Rio:</strong> the Feira de São Cristóvão, forró, carne-de-sol — the imprint of 20th-century migration from the Northeast.</li>
        <li><strong>Religion in plain sight:</strong> baroque Catholic churches; offerings to Iemanjá on the beach at New Year (Afro-Brazilian religion); and, increasingly, Pentecostal churches in the suburbs — evangelicals are now around a quarter or more of Brazilians, reshaping politics.</li>
        <li><strong>Football colours as class and neighbourhood:</strong> Flamengo (the most popular club in Brazil), Fluminense (historically elite), Vasco (Portuguese immigrants and the 1924 “Resposta Histórica”), Botafogo.</li>
      </ul>
      <p>The Tijuca reforestation (1861–) was directed by Major Manuel Gomes Archer, who planted some 100,000 seedlings with a small team that included enslaved workers. Today the Tijuca National Park is one of the largest urban forests in the world.</p>
    </>
  ),
  sources: ['abreu', 'dean_tijuca', 'unescoRio', 'needell'],
}

export const act5Slides = [divider, regionsSlide, inequality, rioClass, cityMap, notice]
