import type { SlideDef } from '../types'
import { Slide, At } from '../components/Slide'
import { Img } from '../components/Img'
import { MapFrame, polyline, type LonLat, type Proj } from '../components/MapFrame'
import { Header, Cite, C } from './common'
import { ActDivider } from './divider'

/* ===================== Divider ===================== */
const divider: SlideDef = {
  id: 'act3', act: 'III', short: 'Act III — The Creation of Modern Brazil',
  render: () => (
    <ActDivider numeral="III" title="The Creation of Modern Brazil" span="1889 – 1954" image="avenidaCentral" pos="50% 45%" highlight={[1889, 1954]} color="#e3bd6a"
      question="How did a coffee republic run by a few thousand voters become an urban, industrial, mass society — and who was let in?" />
  ),
  notes: (
    <>
      <p>Act III covers the First Republic (1889–1930), the transformation of Rio into a Belle Époque capital, and the Vargas era (1930–1954), which built the modern Brazilian state and — alongside radio, samba and football — a modern national identity.</p>
      <p><strong>Image:</strong> Avenida Central (today Avenida Rio Branco), photographed by Marc Ferrez around 1906, shortly after it was driven through the colonial centre. Almost none of these façades survive: the avenue was rebuilt again with towers from the 1940s onward. The Theatro Municipal, the National Library and the Museum of Fine Arts at its southern end (Cinelândia) are the survivors.</p>
    </>
  ),
}

/* ===================== Old Republic & immigration ===================== */
const imm = [
  { d: '1872–79', v: 176 }, { d: '1880s', v: 449 }, { d: '1890s', v: 1198 }, { d: '1900s', v: 622 }, { d: '1910s', v: 815 }, { d: '1920s', v: 847 }, { d: '1930s', v: 333 }, { d: '1940s', v: 114 }, { d: '1950s', v: 583 },
]
const oldRepublic: SlideDef = {
  id: 'old-republic', act: 'III', short: 'A republic for coffee — and for Europeans',
  render: () => (
    <Slide theme="paper">
      <Header n={23} kicker="The First Republic · 1889–1930" title={<>A federation of coffee oligarchs chose European immigrants over Brazil’s own freed people</>} w={1180} size="md" />
      <svg width={700} height={380} style={{ position: 'absolute', left: 80, top: 320 }} className="chart">
        <text x={0} y={14} fontSize={11.5} fill="#7a6f60" fontWeight={600} letterSpacing="0.12em">IMMIGRANTS ARRIVING IN BRAZIL, BY DECADE (THOUSANDS)</text>
        {imm.map((d, i) => {
          const h = d.v * 0.24
          const x = i * 74
          const hi = i >= 1 && i <= 5
          return (
            <g key={d.d}>
              <rect x={x} y={330 - h} width={58} height={h} fill={hi ? C.industry : '#b7b0a3'} />
              <text x={x + 29} y={322 - h} textAnchor="middle" fontSize={13} fontFamily="IBM Plex Mono" fill="#1f1b16">{d.v}</text>
              <text x={x + 29} y={350} textAnchor="middle" fontSize={11.5} fill="#7a6f60" fontFamily="IBM Plex Mono">{d.d}</text>
            </g>
          )
        })}
        <text x={0} y={378} fontSize={12} fill="#4a4238">Mostly Italians, Portuguese and Spaniards; Japanese from 1908. São Paulo paid many passages.</text>
      </svg>
      <At x={830} y={300} w={330}>
        <Img id="emigrazione" style={{ width: 330, height: 440 }} contain className="paperbg" credit={false} />
      </At>
      <At x={1180} y={306} w={340}>
        <div className="caption" style={{ marginTop: 0 }}><b>“To Brazil! Free passage”</b> — 1886 poster recruiting Italian families for São Paulo’s coffee farms, where they replaced enslaved labour under the <em>colonato</em> system.</div>
        <div className="rule" style={{ margin: '18px 0' }} />
        <p className="body" style={{ fontSize: 15 }}>An 1890 decree opened Brazil to immigrants — except “natives of Asia and Africa,” who needed Congress’s approval. Elites spoke openly of <strong>“whitening”</strong> the nation.</p>
        <p className="body" style={{ fontSize: 15 }}>Politics was a pact of state oligarchies — São Paulo and Minas above all — resting on local bosses (<em>coronéis</em>) who delivered votes. Before 1930 no presidential election drew votes from more than about 6% of the population.</p>
      </At>
      <At x={80} y={736} w={700}>
        <div className="card" style={{ padding: '12px 16px' }}>
          <h5 style={{ fontSize: 20 }}>Canudos, 1896–97</h5>
          <p style={{ fontSize: 13.5 }}>The army destroyed a religious community of perhaps 20,000+ backlanders in Bahia led by Antônio Conselheiro, killing most of them. Returning soldiers settled on a Rio hillside they nicknamed <b>Morro da Favella</b> — see slide 25.</p>
        </div>
      </At>
      <Cite y={862} w={1000}>Immigration: IBGE / Levy (1974), entries by decade. Holloway (1980); Skidmore, Black into White (1974); Leal (1949).</Cite>
    </Slide>
  ),
  notes: (
    <>
      <h4>Who ruled</h4>
      <p>The 1891 constitution created a federal republic with powerful states that taxed their own exports, raised their own militias and ran their own elections. President Campos Sales (1898–1902) formalised the “politics of the governors”: the federal government supported each state’s dominant oligarchy; in return the state delivered loyal congressional delegations. At the base sat the <strong>coronel</strong> — a landowner, often holding a National Guard title, who controlled the votes of dependants (Victor Nunes Leal’s <em>Coronelismo, Enxada e Voto</em>, 1949, remains the classic analysis). Literacy requirements excluded most adults; fraud did the rest. The presidency often alternated between São Paulo and Minas Gerais — the “café com leite” pact — though historians now stress that the arrangement was less stable and more contested than the label implies.</p>
      <h4>Coffee policy as industrial policy</h4>
      <p>With coffee prices falling from overproduction, the coffee states agreed at Taubaté (1906) to buy and stockpile surplus coffee, financed by foreign loans — a commodity cartel run by the state. Brazil supplied the majority of the world’s coffee in this period, giving it unusual market power, and these “valorisation” schemes recurred until the 1930s. They established a long-lasting habit: the state as manager of producer interests.</p>
      <h4>Immigration and whitening</h4>
      <p>Some 4 million immigrants arrived between 1880 and 1930. São Paulo’s government (via the Sociedade Promotora de Imigração, 1886) subsidised family passages and received migrants at the Hospedaria dos Imigrantes before dispatching them to coffee estates. Planters preferred Europeans partly because families were thought more stable and controllable — and partly for openly racial reasons. Elite thinkers combined scientific racism with an optimistic twist: miscegenation plus European immigration would “whiten” Brazil (Thomas Skidmore’s <em>Black into White</em>; Lilia Schwarcz’s <em>O Espetáculo das Raças</em>). Decree 528 (1890) required congressional authorisation for immigrants from Africa and Asia. Japanese immigration began in 1908 (the <em>Kasato Maru</em>); Brazil now has the largest population of Japanese descent outside Japan.</p>
      <p>The consequence for freed people was severe: excluded from the best rural jobs in the most dynamic region, many moved to cities and to informal work. Florestan Fernandes later argued that abolition “threw the Black population into the free labour market” without preparation or protection.</p>
      <h4>Canudos</h4>
      <p>In the Bahian backlands, the preacher Antônio Conselheiro gathered a large community at Canudos. The new Republic saw monarchist subversion; three expeditions were defeated before a fourth, with artillery, destroyed it in October 1897. Euclides da Cunha’s <em>Os Sertões</em> (1902) — part reportage, part scientific racism, part tragedy — made it a founding text of Brazilian literature.</p>
    </>
  ),
  sources: ['leal', 'holloway', 'skidmoreBlack', 'schwarczRacas', 'levy', 'fernandes', 'fausto'],
}

/* ===================== São Paulo overtakes Rio ===================== */
const rioPop: [number, number][] = [[1872, 0.275], [1890, 0.523], [1906, 0.811], [1920, 1.158], [1940, 1.764], [1950, 2.377], [1960, 3.307], [1970, 4.252], [1980, 5.091], [1991, 5.481], [2000, 5.858], [2010, 6.320], [2022, 6.211]]
const spPop: [number, number][] = [[1872, 0.031], [1890, 0.065], [1900, 0.240], [1920, 0.579], [1940, 1.326], [1950, 2.198], [1960, 3.781], [1970, 5.925], [1980, 8.493], [1991, 9.646], [2000, 10.434], [2010, 11.254], [2022, 11.451]]
const urban: [number, number][] = [[1940, 31.2], [1950, 36.2], [1960, 45.1], [1970, 55.9], [1980, 67.6], [1991, 75.6], [2000, 81.2], [2010, 84.4]]
const saoPaulo: SlideDef = {
  id: 'sao-paulo', act: 'III', short: 'São Paulo overtakes Rio',
  render: () => {
    const W = 860, H = 440
    const x = (y: number) => ((y - 1870) / 155) * W
    const yv = (v: number) => H - (v / 12) * H
    const line = (d: [number, number][]) => d.map(([a, b], i) => `${i ? 'L' : 'M'}${x(a)},${yv(b)}`).join(' ')
    return (
      <Slide theme="paper">
        <Header n={24} kicker="Two cities · 1870–2022" title={<>Rio stayed the capital — but coffee money made <em>São Paulo</em> the engine</>} w={1100} size="md" />
        <svg width={W + 190} height={H + 80} style={{ position: 'absolute', left: 50, top: 300 }} className="chart"><g transform="translate(40, 30)">
          {[0, 3, 6, 9, 12].map((v) => (
            <g key={v} className="axis"><line x1={0} x2={W} y1={yv(v)} y2={yv(v)} /><text x={-10} y={yv(v) + 4} textAnchor="end">{v}m</text></g>
          ))}
          {[1872, 1900, 1920, 1940, 1960, 1980, 2000, 2022].map((y) => <text key={y} x={x(y)} y={H + 22} textAnchor="middle" fontSize={12} fill="#7a6f60" fontFamily="IBM Plex Mono">{y}</text>)}
          <rect x={x(1950)} y={0} width={x(1960) - x(1950)} height={H} fill="rgba(162,62,39,0.08)" />
          <text x={x(1955)} y={16} textAnchor="middle" fontSize={11.5} fill={C.brazilwood} fontWeight={600}>crossover, 1950s</text>
          <path d={line(rioPop)} fill="none" stroke={C.brazilwood} strokeWidth={3.5} />
          <path d={line(spPop)} fill="none" stroke={C.industry} strokeWidth={3.5} />
          {rioPop.map(([a, b]) => <circle key={a} cx={x(a)} cy={yv(b)} r={3.5} fill={C.brazilwood} />)}
          {spPop.map(([a, b]) => <circle key={a} cx={x(a)} cy={yv(b)} r={3.5} fill={C.industry} />)}
          <text x={x(2022) + 10} y={yv(11.45) + 4} fontSize={15} fontWeight={700} fill={C.industry}>São Paulo 11.5m</text>
          <text x={x(2022) + 10} y={yv(6.21) + 4} fontSize={15} fontWeight={700} fill={C.brazilwood}>Rio 6.2m</text>
          <text x={x(1960) + 6} y={yv(3.3) + 22} fontSize={12} fill="#4a4238">1960: capital moves</text>
          <text x={x(1960) + 6} y={yv(3.3) + 37} fontSize={12} fill="#4a4238">to Brasília</text>
          <text x={0} y={-14} fontSize={11.5} fill="#7a6f60" fontWeight={600} letterSpacing="0.12em">POPULATION OF THE MUNICIPALITY (CENSUS YEARS)</text>
        </g></svg>
        <At x={1110} y={300} w={410}>
          <p className="body" style={{ fontSize: 15.5 }}>In 1872 São Paulo was a provincial town of 31,000. Its rise came from the coffee frontier to its west and three advantages Rio lacked: a <strong>British railway</strong> down the escarpment to Santos (1867), <strong>immigrant wage-earners</strong> who formed a consumer market, and planters who reinvested in <strong>industry</strong> and hydroelectric power.</p>
          <p className="body" style={{ fontSize: 15.5 }}>Rio kept politics, the navy, finance, the press and culture — until 1960.</p>
          <div className="label" style={{ marginTop: 20 }}>Brazil’s urban share</div>
          <svg width={410} height={110} style={{ marginTop: 6 }}>
            {urban.map(([y, v], i) => (
              <g key={y}>
                <rect x={i * 50} y={90 - v * 0.9} width={38} height={v * 0.9} fill={C.agro} opacity={0.75} />
                <text x={i * 50 + 19} y={86 - v * 0.9} textAnchor="middle" fontSize={11} fontFamily="IBM Plex Mono">{Math.round(v)}%</text>
                <text x={i * 50 + 19} y={106} textAnchor="middle" fontSize={10.5} fill="#7a6f60" fontFamily="IBM Plex Mono">{y}</text>
              </g>
            ))}
          </svg>
        </At>
        <Cite y={862} w={1100}>IBGE censuses 1872–2022 (Rio: Município Neutro / Distrito Federal / Guanabara / município; 1906 Rio census). Urban share: IBGE.</Cite>
      </Slide>
    )
  },
  notes: (
    <>
      <h4>Why São Paulo?</h4>
      <p>Western São Paulo’s red soils (<em>terra roxa</em>) were ideal for coffee. The São Paulo Railway (1867), a British-built cable-hauled line up the Serra do Mar, linked the plateau to the port of Santos; Paulista planters then financed a dense network of railways into the interior. Wage-earning immigrant families spent money, creating a market for textiles, food processing and construction materials; immigrant entrepreneurs (the Matarazzos, Crespis) and planter families reinvested coffee profits. The Canadian-owned São Paulo Light (1899) and its hydroelectric projects supplied cheap power. By the mid-20th century São Paulo state accounted for the largest share of national industrial output — a position it retains.</p>
      <h4>What Rio kept</h4>
      <p>As federal capital, Rio concentrated government, the diplomatic corps, the armed forces, the national press and radio, the largest stock exchange until the 1970s, and an outsized share of the country’s intellectual and artistic life. Its economy rested on public employment, services, commerce and the port — which is why the loss of the capital in 1960, and the merger of the city-state of Guanabara into Rio de Janeiro state in 1975, hit it so hard.</p>
      <h4>Data note</h4>
      <p>Figures are for the municipality (the city proper), not the metropolitan region; today greater São Paulo has about 21 million people and greater Rio about 12–13 million. Rio’s figure for the early 1900s uses the 1906 municipal census. Rio’s 2022 census count (6.21 million) was slightly below 2010 — the first decline recorded.</p>
    </>
  ),
  sources: ['ibgeCensus', 'summerhillRail', 'abreuMP', 'baer', 'lessa'],
}

/* ===================== Passos ===================== */
const passos: SlideDef = {
  id: 'passos', act: 'III', short: 'Rio rebuilt as Paris',
  render: () => (
    <Slide theme="paper">
      <Img id="municipalFerrez" style={{ position: 'absolute', left: 0, top: 0, width: 620, height: 470 }} pos="50% 50%" credit="bl" />
      <Img id="casteloRuinas" style={{ position: 'absolute', left: 0, top: 478, width: 620, height: 422 }} pos="50% 50%" credit="bl" />
      <Header x={680} n={25} kicker="Rio · 1902–1922" title={<>Rio was rebuilt to look like Paris — and its poor were pushed <em>up the hills</em></>} w={840} size="md" />
      <At x={680} y={300} w={520}>
        <p className="body" style={{ fontSize: 15.5 }}>Around 1900 Rio was notorious for yellow fever and smallpox; foreign ships avoided it. President Rodrigues Alves gave the engineer-mayor <strong>Pereira Passos</strong> and the sanitarian <strong>Oswaldo Cruz</strong> a free hand. The “bota-abaixo” (knock-it-down) demolished hundreds of tenements to drive the Avenida Central through the colonial core and rebuild the port.</p>
        <p className="body" style={{ fontSize: 15.5 }}>In 1904 compulsory smallpox vaccination set off the <strong>Revolta da Vacina</strong>: a week of barricades in Saúde and the port, about 30 dead, hundreds deported to Acre.</p>
        <p className="body" style={{ fontSize: 15.5 }}>Evicted workers moved to the suburbs — or to the hills near their jobs. In 1920–22 the city went further and <strong>razed Morro do Castelo</strong>, its founding hill (left).</p>
      </At>
      <At x={1230} y={300} w={290}>
        <Img id="vacinaCartoon" style={{ width: 290, height: 210 }} contain className="paperbg" credit={false} />
        <div className="caption" style={{ fontSize: 12 }}><b>“Guerra Vaccino-Obrigateza!”</b> — Oswaldo Cruz as a lancer of vaccine, satirical cartoon, 1904.</div>
      </At>
      <At x={1230} y={600} w={290}>
        <div className="card" style={{ padding: '12px 14px', borderColor: C.brazilwood }}>
          <h5 style={{ fontSize: 19 }}>Why “favela”?</h5>
          <p style={{ fontSize: 13 }}>Canudos veterans, awaiting pay in 1897, camped on Morro da Providência and named it after the favela shrub of the Bahian hills. Hillside shacks existed earlier; the name stuck to them all.</p>
        </div>
      </At>
      <Cite x={680} y={862} w={840}>Left: Theatro Municipal (1909), Marc Ferrez; demolition of Morro do Castelo, 1922, Augusto Malta. Benchimol (1990); Sevcenko (1984); Valladares (2005).</Cite>
    </Slide>
  ),
  notes: (
    <>
      <h4>The reforms</h4>
      <p>Francisco Pereira Passos had studied in Paris during Haussmann’s transformation. As mayor (1902–06) he drove through the 1.8-km Avenida Central (inaugurated 1905), widened streets, built the Avenida Beira-Mar along the bay toward Botafogo, and banned practices from street vending of offal to cows being milked door to door. Federal engineers rebuilt the port with a new quay wall and landfill — burying the Valongo wharf. Cinelândia’s monumental trio followed: the Escola (now Museu) Nacional de Belas Artes (1908), the Theatro Municipal (1909, modelled loosely on the Paris Opéra) and the Biblioteca Nacional (1910).</p>
      <p>The demolitions targeted <em>cortiços</em> — crowded tenements, often converted colonial houses — which housed much of the working population near the port. An earlier mayor had already destroyed the most famous, the Cabeça de Porco, in 1893. Sidney Chalhoub argues that the war on cortiços fused public health with social control: the “dangerous classes” and the “sick classes” were treated as one.</p>
      <h4>The Vaccine Revolt (10–16 November 1904)</h4>
      <p>Oswaldo Cruz’s campaigns against yellow fever (mosquito brigades) and plague (rat bounties) were effective; compulsory smallpox vaccination, enforced by inspectors entering homes, was the spark. Grievances about evictions, rising rents and authoritarian methods fused with opposition politics, monarchist and positivist agitation, and a cadet revolt at the military school. Nicolau Sevcenko read the revolt as a popular protest against a modernisation imposed on the poor.</p>
      <div className="contested"><span className="contested-label">Contested origin story</span>The “Morro da Favella” story is well documented, but Licia Valladares shows how it became a myth of origin that obscures earlier hillside settlements (Morro de Santo Antônio was occupied by soldiers in the 1890s too) and the deeper cause: a city with no affordable housing near work. The first favela census (1948–50) counted roughly 7% of the city’s population in favelas.</div>
      <h4>The hill that vanished</h4>
      <p>Morro do Castelo — site of the 1567 city, the Jesuit college and the first cathedral — was demolished in 1920–22 with water jets and railway wagons, displacing several thousand poor residents; the spoil was used to fill land along the bay. The 1922 Centennial Exposition was built on part of the cleared site. Later, Morro de Santo Antônio was largely levelled (1950s) and its earth used to build the Aterro do Flamengo. Rio literally moved its hills into the sea.</p>
    </>
  ),
  sources: ['benchimol', 'needell', 'chalhoub', 'sevcenko', 'valladares', 'abreu'],
}

/* ===================== Rio expansion (signature) ===================== */
const RIO_METRO = { w: -43.58, s: -23.04, e: -43.08, n: -22.78 }
interface RioEra { years: string; title: string; text: string; today: string; color: string; image: string; caption: string; halos: [LonLat, number][] }
const rioEras: RioEra[] = [
  { years: '1565–1700', title: 'A fortress town between four hills', text: 'The city descends from Morro do Castelo to a swampy strip of beach between the Castelo, São Bento, Santo Antônio and Conceição hills. Everything else is sugar mills, forest and Indigenous villages.', today: 'Praça XV, Rua 1º de Março, Mosteiro de São Bento', color: C.brazilwood, image: 'franceAntarctique', caption: 'La France Antarctique (16th–17th c.)', halos: [[[-43.176, -22.903], 34]] },
  { years: '1700–1808', title: 'The gold port', text: 'Gold from Minas makes Rio the colony’s capital (1763). An aqueduct brings water across the Lapa valley (c. 1750); the slave market moves to Valongo (1774); churches fill with gilding.', today: 'Arcos da Lapa, Valongo, Glória church, Candelária', color: C.gold, image: 'leandroArcos', caption: 'Leandro Joaquim, the Carioca Aqueduct, c. 1790', halos: [[[-43.181, -22.913], 26], [[-43.174, -22.921], 18], [[-43.19, -22.905], 22], [[-43.186, -22.897], 20]] },
  { years: '1808–1858', title: 'The court spreads out', text: 'The royal family settles at São Cristóvão; nobles and merchants build country houses (chácaras) in Catete, Flamengo, Botafogo and Laranjeiras; the Botanical Garden opens by the Lagoa. Coffee covers the Tijuca hills.', today: 'Quinta da Boa Vista, Catete Palace, Botafogo, Jardim Botânico', color: C.empire, image: 'paco1818', caption: 'The Paço and Praça XV, 1818', halos: [[[-43.222, -22.904], 24], [[-43.177, -22.927], 18], [[-43.183, -22.947], 20], [[-43.19, -22.935], 16], [[-43.224, -22.967], 18], [[-43.245, -22.932], 22]] },
  { years: '1858–1920', title: 'Rails north, trams south, the first favelas', text: 'The Central railway (1858) carries working Rio into the northern “subúrbios.” Trams open Tijuca and Vila Isabel; tunnels open Copacabana (1892, 1906). Passos rebuilds the centre; the evicted climb the hills.', today: 'Central do Brasil, Méier, Madureira, Providência', color: C.coffee, image: 'leuzinger1865', caption: 'Rio from Morro do Castelo, c. 1865', halos: [[[-43.282, -22.902], 22], [[-43.335, -22.877], 26], [[-43.25, -22.917], 20], [[-43.233, -22.925], 18], [[-43.18, -22.964], 16], [[-43.193, -22.898], 12]] },
  { years: '1920–1960', title: 'The Atlantic city', text: 'Copacabana, Ipanema and Leblon fill with apartment blocks; the beach replaces the bay as the city’s stage. Avenida Brasil (1946) pulls industry and migrants north into the Baixada. Favelas spread on Zona Sul hills, near the jobs.', today: 'Copacabana Palace (1923), Maracanã (1950), Rocinha', color: C.industry, image: 'copacabanaEarly', caption: 'Copacabana and Leme, 1920s', halos: [[[-43.187, -22.973], 22], [[-43.205, -22.984], 18], [[-43.224, -22.984], 16], [[-43.29, -22.842], 24], [[-43.255, -22.866], 20], [[-43.31, -22.795], 28], [[-43.248, -22.988], 12]] },
  { years: '1960–today', title: 'Capital lost; the city sprawls west', text: 'Brasília takes the capital. Landfill creates the Aterro; the Rebouças tunnel (1967) links north and south. Favela removals build Cidade de Deus. Barra da Tijuca grows as a car-based new city; militias dominate much of the west.', today: 'Aterro do Flamengo, Barra, Olympic Park, Porto Maravilha', color: C.atlantic, image: 'issNight', caption: 'Rio at night from the ISS, 2022 (NASA)', halos: [[[-43.365, -23.0], 30], [[-43.36, -22.955], 24], [[-43.47, -23.015], 22], [[-43.395, -22.977], 18], [[-43.172, -22.93], 12]] },
]
const railway: LonLat[] = [[-43.191, -22.903], [-43.222, -22.899], [-43.239, -22.905], [-43.262, -22.904], [-43.282, -22.902], [-43.294, -22.897], [-43.33, -22.882], [-43.339, -22.873], [-43.384, -22.856], [-43.43, -22.866], [-43.465, -22.877], [-43.53, -22.89], [-43.58, -22.905]]
const leopoldina: LonLat[] = [[-43.222, -22.899], [-43.245, -22.88], [-43.255, -22.866], [-43.275, -22.85], [-43.29, -22.842], [-43.305, -22.81], [-43.31, -22.785]]

function Lbl({ p, at, t, cls = 'map-label sm', anchor = 'start' as 'start' | 'middle' | 'end', dy = 0 }: { p: Proj; at: LonLat; t: string; cls?: string; anchor?: 'start' | 'middle' | 'end'; dy?: number }) {
  const [x, y] = p(at[0], at[1])
  return <text x={x} y={y + dy} className={cls} textAnchor={anchor}>{t}</text>
}

const rioExpansion: SlideDef = {
  id: 'rio-expansion', act: 'III', short: 'Rio through time', steps: 6,
  render: (step) => {
    const e = rioEras[step]
    return (
      <Slide theme="paper">
        <At x={0} y={0} w={1600} h={900}>
          <MapFrame map="rioMetro" w={1600} h={900} view={RIO_METRO}>
            {(p) => (
              <>
                {rioEras.slice(0, step + 1).map((era, i) => (
                  <g key={i} opacity={i === step ? 0.68 : 0.26}>
                    {era.halos.map(([at, r], j) => {
                      const [x, y] = p(at[0], at[1])
                      return <circle key={j} cx={x} cy={y} r={r * 1.5} fill={era.color} filter="url(#soft6)" />
                    })}
                  </g>
                ))}
                {step >= 3 && <path d={polyline(p, railway)} fill="none" stroke="#1f1b16" strokeWidth={2.4} strokeDasharray="10 4" />}
                {step >= 3 && <path d={polyline(p, leopoldina)} fill="none" stroke="#1f1b16" strokeWidth={1.8} strokeDasharray="6 4" opacity={0.7} />}
                {step >= 3 && <Lbl p={p} at={[-43.384, -22.856]} t="Central railway, 1858" cls="map-label xs" dy={-10} />}
                {step >= 3 && [[-43.1885, -22.9605], [-43.1775, -22.958]].map((t, i) => { const [x, y] = p(t[0], t[1]); return <rect key={i} x={x - 5} y={y - 5} width={10} height={10} fill="#1f1b16" transform={`rotate(45 ${x} ${y})`} /> })}
                {step >= 3 && <Lbl p={p} at={[-43.172, -22.9605]} t="tunnels 1892 · 1906" cls="map-label xs" dy={4} />}
                {step >= 5 && (() => { const [x, y] = p(-43.205, -22.94); return <g><rect x={x - 5} y={y - 5} width={10} height={10} fill="#1f1b16" transform={`rotate(45 ${x} ${y})`} /><text x={x + 9} y={y + 4} className="map-label xs">Rebouças tunnel 1967</text></g> })()}
                {step >= 5 && <path d={polyline(p, [[-43.165, -22.915], [-43.17, -22.925], [-43.173, -22.935], [-43.177, -22.942]])} stroke={C.agro} strokeWidth={6} opacity={0.9} fill="none" />}
                {step >= 5 && <Lbl p={p} at={[-43.164, -22.928]} t="Aterro (landfill)" cls="map-label xs" />}
                {/* constant geography labels */}
                <Lbl p={p} at={[-43.285, -22.948]} t="TIJUCA MASSIF" cls="map-label caps" anchor="middle" />
                
                <Lbl p={p} at={[-43.17, -22.84]} t="Guanabara Bay" cls="map-label it" anchor="middle" />
                <Lbl p={p} at={[-43.33, -23.03]} t="Atlantic Ocean" cls="map-label it" anchor="middle" />
                <Lbl p={p} at={[-43.205, -22.975]} t="Lagoa" cls="map-label xs" anchor="middle" />
                <Lbl p={p} at={[-43.176, -22.903]} t="Centro" cls="map-label" />
                <Lbl p={p} at={[-43.188, -22.977]} t="Copacabana" cls="map-label sm" />
                <Lbl p={p} at={[-43.215, -22.99]} t="Ipanema · Leblon" cls="map-label xs" anchor="middle" dy={14} />
                <Lbl p={p} at={[-43.222, -22.904]} t="São Cristóvão" cls="map-label xs" dy={-8} anchor="middle" />
                <Lbl p={p} at={[-43.233, -22.92]} t="Tijuca" cls="map-label xs" anchor="end" />
                <Lbl p={p} at={[-43.335, -22.872]} t="Madureira" cls="map-label xs" dy={-8} />
                <Lbl p={p} at={[-43.365, -23.0]} t="Barra da Tijuca" cls="map-label sm" anchor="middle" dy={18} />
                <Lbl p={p} at={[-43.32, -22.8]} t="Baixada Fluminense →" cls="map-label xs" />
                <Lbl p={p} at={[-43.124, -22.894]} t="Niterói" cls="map-label sm" />
                <Lbl p={p} at={[-43.18, -22.95]} t="Botafogo" cls="map-label xs" anchor="end" />
                <Lbl p={p} at={[-43.25, -22.85]} t="ZONA NORTE" cls="map-label caps" anchor="middle" />
                <Lbl p={p} at={[-43.222, -22.958]} t="ZONA SUL" cls="map-label caps" anchor="middle" />
                <Lbl p={p} at={[-43.40, -22.925]} t="ZONA OESTE" cls="map-label caps" anchor="middle" />
              </>
            )}
          </MapFrame>
        </At>
        <div style={{ position: 'absolute', left: 0, top: 0, width: 560, height: 900, background: 'linear-gradient(90deg, rgba(242,235,221,0.97) 82%, rgba(242,235,221,0))' }} />
        <At x={70} y={56} w={470}>
          <div className="kicker"><span className="k-num">26</span><span className="k-rule" />Signature map · Rio through time</div>
          <h1 className="title sm" style={{ marginTop: 12, fontSize: 36 }}>The city grew in three directions — each with its own <em>class logic</em></h1>
          <div style={{ display: 'flex', gap: 5, margin: '22px 0 18px' }}>
            {rioEras.map((s, i) => <div key={i} style={{ flex: 1, height: 5, background: i === step ? s.color : i < step ? `${s.color}77` : 'rgba(0,0,0,0.1)' }} />)}
          </div>
          <div key={step} className="rise">
            <div className="mono" style={{ fontSize: 15, color: e.color, fontWeight: 500 }}>{e.years}</div>
            <div className="serif" style={{ fontSize: 31, fontWeight: 600, lineHeight: 1.05, marginTop: 4 }}>{e.title}</div>
            <p className="body" style={{ fontSize: 15, marginTop: 10 }}>{e.text}</p>
            <div style={{ display: 'flex', gap: 14, marginTop: 8, alignItems: 'flex-start' }}>
              <Img id={e.image} style={{ width: 210, height: 150, flexShrink: 0 }} credit={false} pos="50% 50%" />
              <div>
                <div className="label">See it today</div>
                <div style={{ fontSize: 14, marginTop: 4, lineHeight: 1.4 }}>{e.today}</div>
                <div className="small" style={{ marginTop: 8, fontSize: 11.5 }}>Image: {e.caption}</div>
              </div>
            </div>
          </div>
        </At>
        <Cite x={70} y={862} w={480}>Zones schematic, after Abreu, Evolução Urbana do Rio de Janeiro. Relief: AWS Terrain Tiles; coastline: IBGE. → steps through eras.</Cite>
      </Slide>
    )
  },
  notes: (
    <>
      <p>This map is the key to reading Rio. The granite massifs — <strong>Tijuca</strong> in the middle, <strong>Pedra Branca</strong> to the west — split the city into three zones, and each grew with a different class logic.</p>
      <ul>
        <li><strong>Centro (1565 onward)</strong> began on hills and grew onto reclaimed swamp. Several of the hills that defined it (Castelo, Santo Antônio, Senado) have been demolished; the colonial grid survives in the narrow streets around Praça XV, Rua do Ouvidor and the Saara market.</li>
        <li><strong>Zona Sul (from 1808)</strong>: the court and the rich moved south along the bay — Glória, Catete, Flamengo, Botafogo, Laranjeiras — into country houses. Once tunnels pierced the ridge (1892, 1906), Copacabana and then Ipanema and Leblon became the ocean-facing city of apartment blocks, built for the middle and upper classes. Maurício Abreu calls this the “self-segregation” of the elite along the coast.</li>
        <li><strong>Zona Norte (from 1858)</strong>: the Dom Pedro II railway (later Central do Brasil) and the Leopoldina line opened the flat lands north and west of the massif to cheap lots, workshops and factories — the <em>subúrbios</em>. (In Rio, “subúrbio” means working-class rail suburb, not affluent commuter town.) Madureira, Méier and Bangu became the heartland of samba schools, football clubs and the carioca working class. Avenida Brasil (1946) extended industry and housing into the Baixada Fluminense beyond the city limits.</li>
        <li><strong>Zona Oeste (from the 1970s)</strong>: Lúcio Costa’s 1969 plan for Barra da Tijuca imagined a modernist new town of towers and highways; it became a car-dependent, gated, mall-centred city that many compare to Miami. Further west, Jacarepaguá, Campo Grande and Santa Cruz grew as low-income peripheries — where militias (paramilitary groups often formed by off-duty and ex-police) now control much of daily life.</li>
      </ul>
      <h4>Hills and landfill</h4>
      <p>Two processes run through every era: hills were <em>removed</em> (Castelo 1922, Santo Antônio 1950s), and the sea was <em>filled</em> (port works 1904–11, the Aterro 1960s, Santos Dumont airport on land reclaimed from the bay). And hills that were not removed — too steep for formal construction, often publicly owned — were occupied informally, close to the jobs of the rich neighbourhoods below. That is why Rio, unlike most cities, has poverty both at its periphery and in its centre.</p>
      <p className="small">Halo positions and dates are approximate and meant to show the direction of growth rather than precise boundaries.</p>
    </>
  ),
  sources: ['abreu', 'lessa', 'needell', 'perlman', 'unescoRio'],
}

/* ===================== Vargas ===================== */
const vargasInst = [
  ['1930', 'Ministry of Labour, Industry & Commerce'],
  ['1932', 'Secret ballot; votes for women; the work card (carteira)'],
  ['1936', 'IBGE, the statistics bureau'],
  ['1940', 'National minimum wage'],
  ['1941', 'CSN steelworks at Volta Redonda (with US credit)'],
  ['1942', 'Vale do Rio Doce (now Vale)'],
  ['1943', 'CLT — the Consolidated Labour Laws'],
  ['1952–53', 'BNDE development bank; Petrobras (“O petróleo é nosso”)'],
]
const vargas: SlideDef = {
  id: 'vargas', act: 'III', short: 'Vargas builds the state',
  render: () => (
    <Slide theme="paper">
      <Img id="vargas1930" style={{ position: 'absolute', left: 0, top: 0, width: 470, height: 900 }} pos="50% 25%" credit="bl" />
      <Header x={530} n={27} kicker="The Vargas era · 1930–1954" title={<>Vargas built the modern Brazilian state — and much of it still runs on his blueprint</>} w={990} size="md" />
      <At x={530} y={300} w={500}>
        <p className="body" style={{ fontSize: 15.5 }}>The 1929 crash shattered the coffee republic. Getúlio Vargas, a gaúcho politician, took power in the <strong>Revolution of 1930</strong>; in 1937 he closed Congress and ruled as dictator of the <strong>Estado Novo</strong> until 1945, with censorship, a political police and propaganda. Elected again in 1950, he shot himself in the Catete Palace in 1954 rather than be deposed.</p>
        <p className="body" style={{ fontSize: 15.5 }}>His bargain: <strong>urban formal workers</strong> received rights, minimum wages and state-supervised unions; rural and domestic workers were left out. The divide between the protected formal sector and the informal majority dates from here.</p>
      </At>
      <At x={1070} y={300} w={450}>
        <div className="label" style={{ marginBottom: 10 }}>Institutions of the Vargas years — all still exist</div>
        {vargasInst.map(([y, t]) => (
          <div key={t} style={{ display: 'flex', gap: 14, padding: '7px 0', borderBottom: '1px solid var(--rule)' }}>
            <span className="mono" style={{ fontSize: 13, color: '#8e5b2c', minWidth: 62 }}>{y}</span>
            <span style={{ fontSize: 14.5 }}>{t}</span>
          </div>
        ))}
      </At>
      <At x={530} y={700} w={990}>
        <div style={{ display: 'flex', gap: 26, alignItems: 'center' }}>
          <div className="serif" style={{ fontSize: 26, fontStyle: 'italic', lineHeight: 1.2, maxWidth: 560 }}>“I leave life to enter history.”</div>
          <div className="small" style={{ maxWidth: 400 }}>Vargas’s farewell letter, 24 August 1954. His bedroom in the Catete Palace — now the Museu da República in Flamengo — is preserved as it was.</div>
        </div>
      </At>
      <Cite x={530} y={862} w={990}>French, Drowning in Laws (2004); Williams (2001); Abreu (ed.), A Ordem do Progresso (2014); CPDOC.</Cite>
    </Slide>
  ),
  notes: (
    <>
      <h4>The road to 1930</h4>
      <p>By the late 1920s the First Republic faced revolts by junior officers (the <em>tenentes</em>: Copacabana Fort 1922, São Paulo 1924, the Prestes Column 1925–27), an urban middle class shut out of politics, and a coffee economy dependent on price support. When the Paulista president Washington Luís broke the informal rotation by backing another Paulista, Júlio Prestes, for the 1930 election, Minas Gerais, Rio Grande do Sul and Paraíba backed Vargas. Prestes won a fraud-ridden election; after the assassination of Vargas’s running mate João Pessoa, a revolt led from Rio Grande do Sul toppled the government. Vargas’s gaúcho troops famously tied their horses to the obelisk at the end of Avenida Rio Branco.</p>
      <h4>From provisional government to dictatorship</h4>
      <p>São Paulo rose in the Constitutionalist Revolution of 1932 and was defeated. A 1934 constitution gave women the vote. After a failed communist uprising in 1935, Vargas used a forged plan of communist revolution (the Plano Cohen) to justify the 1937 coup. The Estado Novo — corporatist, nationalist, influenced by Salazar’s Portugal and Mussolini’s Italy but never fascist in mass-party form — persecuted communists and integralists alike; the German-Jewish communist Olga Benário Prestes was deported to Nazi Germany and murdered. Vargas bargained between the US and Germany before joining the Allies in 1942; Brazil sent 25,000 troops (the FEB) to Italy in 1944–45, and US Export-Import Bank credit built the Volta Redonda steelworks.</p>
      <h4>The labour bargain</h4>
      <p>The Consolidação das Leis do Trabalho (CLT, 1943) gathered a decade of decrees into a code: the 8-hour day, paid holidays, job security rules, labour courts, and unions recognised by — and dependent on — the Ministry of Labour, funded by a compulsory union tax. John French’s <em>Drowning in Laws</em> argues that the laws were often unenforced and functioned as aspirations that workers then fought to make real. The exclusions were telling: rural workers gained comparable rights only in 1963, and <strong>domestic workers obtained full labour rights only in 2013</strong> — a direct line from the slave household to the present.</p>
      <h4>Populism</h4>
      <p>Vargas created the template of Brazilian populism: a leader who speaks directly to urban workers (“trabalhadores do Brasil!” on the radio), with a party machine (the PTB) built on the labour bureaucracy. Admirers call him “father of the poor”; critics stress dictatorship, co-optation and the subordination of unions to the state. Both are right. His suicide letter, read on radio, turned an imminent military ouster into a popular backlash that shaped politics for a decade.</p>
      <h4>Rio links</h4>
      <p>The Palácio Gustavo Capanema (Ministry of Education and Health, 1936–45), designed by a team including Lúcio Costa and Oscar Niemeyer with Le Corbusier as consultant and gardens by Burle Marx, is a landmark of modern architecture — and of the Vargas state’s ambition. Avenida Presidente Vargas (1944) was cut through the old centre, destroying Praça Onze, the cradle of samba.</p>
    </>
  ),
  sources: ['french', 'williams', 'abreuMP', 'cpdoc', 'vargasLetter', 'fausto'],
}

/* ===================== Samba ===================== */
const samba: SlideDef = {
  id: 'samba', act: 'III', short: 'Samba becomes the nation’s sound',
  render: () => (
    <Slide theme="ink">
      <Img id="portela2014" style={{ position: 'absolute', left: 800, top: 0, width: 800, height: 900 }} pos="50% 40%" credit="br" />
      <div style={{ position: 'absolute', left: 800, top: 0, width: 300, height: 900, background: 'linear-gradient(90deg, #15120e, rgba(21,18,14,0))' }} />
      <Header n={28} kicker="Culture · 1900s–1940s" title={<>Samba began as a <em>policed</em> Afro-Brazilian practice — and became the nation’s sound</>} w={700} size="md" />
      <At x={80} y={318} w={680}>
        <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
          {[['tiaCiata', 'Tia Ciata'], ['donga', 'Donga'], ['pixinguinha', 'Pixinguinha'], ['heitorPrazeres', 'Heitor dos Prazeres'], ['cartola', 'Cartola']].map(([id, n]) => (
            <div key={id} style={{ width: 128 }}>
              <Img id={id} style={{ width: 128, height: 150 }} pos="50% 25%" credit={false} />
              <div className="small" style={{ marginTop: 4, fontSize: 12, color: '#cfc4b0' }}>{n}</div>
            </div>
          ))}
        </div>
        <p className="body" style={{ fontSize: 15.5 }}>Bahian migrants in “Little Africa” — around Pedra do Sal and Praça Onze — hosted the gatherings where samba took shape; the house of the Candomblé priestess <strong>Tia Ciata</strong> was the most famous. <em>Pelo Telefone</em>, registered by Donga in 1916, became the first hit recorded as “samba.”</p>
        <p className="body" style={{ fontSize: 15.5 }}>In 1928 sambistas of Estácio founded <strong>Deixa Falar</strong>, the first “samba school”; parades began in 1932 and the city made them official in 1935. Radio, records and the Vargas state turned a music once associated with vagrancy into the national rhythm.</p>
      </At>
      <At x={80} y={770} w={680}>
        <div className="small" style={{ color: '#cfc4b0', fontSize: 13.5 }}><b style={{ color: '#efe7d6' }}>Where:</b> Pedra do Sal (Monday nights) · Madureira — Portela & Império Serrano · Mangueira · the Sambódromo (1984), near the vanished Praça Onze.</div>
      </At>
      <Cite x={80} y={862} w={700}>Right: Portela at the Sambódromo, 2014 (Agência Brasil). Vianna (1995); Sandroni (2001); McCann (2004).</Cite>
    </Slide>
  ),
  notes: (
    <>
      <h4>Little Africa</h4>
      <p>After abolition, Afro-Bahian families settled in Saúde, Gamboa and Cidade Nova (around Praça Onze). The <em>tias baianas</em> — older women, often Candomblé priestesses and food sellers — hosted parties where religious drumming, the polka-derived <em>maxixe</em>, choro and partido-alto improvisation mixed. Tia Ciata (Hilária Batista de Almeida, 1854–1924) is the emblematic figure; musicians such as Pixinguinha, Donga and João da Baiana frequented her house. The painter and composer Heitor dos Prazeres is credited with calling the area “Pequena África.”</p>
      <h4>“Pelo Telefone” (1916–17)</h4>
      <p>Registered at the National Library by Ernesto dos Santos, “Donga,” in November 1916 and recorded early in 1917, it is conventionally the first samba recording. Its authorship was disputed at once — others claimed it was a collective improvisation from Tia Ciata’s gatherings — and its rhythm is closer to maxixe than to later samba. Carlos Sandroni shows that the “Estácio paradigm” of the late 1920s (Ismael Silva, Bide, Marçal) created the rhythm associated with modern samba, better suited to marching in parades.</p>
      <h4>From repression to national symbol</h4>
      <p>Capoeira was outlawed in the 1890 Penal Code, Afro-Brazilian religions were policed, and sambistas could be arrested for vagrancy. João da Baiana told of having his pandeiro confiscated by police — and of Senator Pinheiro Machado presenting him with an inscribed one. Hermano Vianna’s <em>O Mistério do Samba</em> argues that samba did not simply rise from the hills to conquer the elite: it was “nationalised” through a long process of mediation among intellectuals (Gilberto Freyre and Sérgio Buarque de Holanda heard Pixinguinha in 1926), radio, the record industry and the state. Under the Estado Novo samba schools were encouraged — and required to celebrate national themes. Carmen Miranda, born in Portugal, took a stylised version to Hollywood.</p>
      <h4>Carnival</h4>
      <p>Rio’s carnival evolved from the rowdy colonial <em>entrudo</em>, through elite “great societies” and the <em>corso</em> of decorated cars along Avenida Central (Malta photographed it), to the ranchos and then the samba schools of the hills and suburbs. The parade moved to the purpose-built Sambódromo designed by Oscar Niemeyer in 1984. The schools are neighbourhood institutions rooted in the North Zone and the favelas — Portela (Madureira), Mangueira, Salgueiro, Império Serrano, Beija-Flor (Nilópolis, Baixada) — and today are also big businesses, entangled at times with illegal gambling (the <em>jogo do bicho</em>).</p>
    </>
  ),
  sources: ['vianna', 'sandroni', 'mccann', 'schwarcz'],
}

/* ===================== Race & football ===================== */
const raceData = [
  { k: 'Pardo (mixed)', v: 45.3, c: '#b07a52' },
  { k: 'White', v: 43.5, c: '#d6c7a8' },
  { k: 'Black (preto)', v: 10.2, c: '#5b3a28' },
  { k: 'Indigenous', v: 0.6, c: C.sugar },
  { k: 'Asian-descent', v: 0.4, c: C.atlantic },
]
const race: SlideDef = {
  id: 'race', act: 'III', short: '“Racial democracy” and its critics',
  render: () => (
    <Slide theme="paper">
      <Header n={29} kicker="Race, football and national identity" title={<>“Racial democracy” was a powerful national myth — the data have never matched it</>} w={1200} size="md" />
      <At x={80} y={300} w={640}>
        <p className="body" style={{ fontSize: 15.5 }}>In 1933 Gilberto Freyre’s <em>Casa-Grande & Senzala</em> turned the old elite fear of race-mixing upside down: miscegenation was Brazil’s genius. In the 1930s–50s football and samba seemed to prove it, and “racial democracy” became official self-image.</p>
        <p className="body" style={{ fontSize: 15.5 }}>Researchers sent by UNESCO in the 1950s expecting harmony found pervasive discrimination; from the 1970s statisticians showed that colour, not just class, shapes life chances. Since 2012 federal universities reserve places for Black, pardo and Indigenous students.</p>
        <div className="label" style={{ marginTop: 20 }}>How Brazilians identify, 2022 census</div>
        <div style={{ display: 'flex', height: 34, marginTop: 8 }}>
          {raceData.map((d) => <div key={d.k} style={{ flex: d.v, background: d.c }} title={d.k} />)}
        </div>
        <div style={{ display: 'flex', gap: 16, marginTop: 8, flexWrap: 'wrap', fontSize: 13 }}>
          {raceData.map((d) => <span key={d.k}><span style={{ display: 'inline-block', width: 10, height: 10, background: d.c, marginRight: 5 }} />{d.k} <b>{d.v}%</b></span>)}
        </div>
        <p className="small" style={{ marginTop: 12 }}>Black and pardo Brazilians — 55% of the population — earn on average roughly 40% less than white Brazilians and account for around three-quarters of homicide victims.</p>
      </At>
      <At x={790} y={300} w={330}>
        <Img id="respostaHistorica" style={{ width: 330, height: 470 }} contain className="paperbg" credit={false} />
      </At>
      <At x={1150} y={300} w={370}>
        <div className="serif" style={{ fontSize: 24, fontWeight: 600, lineHeight: 1.15 }}>Football’s colour line</div>
        <p className="body" style={{ fontSize: 14.5, marginTop: 8 }}>Early clubs like Fluminense (1902) were elite and white. In 1923 <strong>Vasco da Gama</strong>, a club of Portuguese shopkeepers, won Rio’s league with Black and working-class players. Told to drop twelve of them to join the new elite league, Vasco refused in the <strong>“Resposta Histórica”</strong> of 7 April 1924 (left).</p>
        <p className="body" style={{ fontSize: 14.5 }}>Professionalism (1933) opened the game. Yet when Brazil lost the 1950 World Cup final to Uruguay before some 200,000 at the Maracanã, the blame fell disproportionately on Black players, especially the goalkeeper Barbosa.</p>
      </At>
      <Cite y={862} w={1400}>IBGE Censo 2022 (identificação étnico-racial); IBGE, Desigualdades Sociais por Cor ou Raça; Atlas da Violência (IPEA/FBSP). Freyre (1933); Fernandes (1964); Hasenbalg (1979); Mário Filho (1947).</Cite>
    </Slide>
  ),
  notes: (
    <>
      <h4>Freyre’s inversion</h4>
      <p>Gilberto Freyre, a Pernambucan trained at Columbia under Franz Boas, wrote <em>Casa-Grande & Senzala</em> (1933) as a sensuous history of the sugar plantation household. Against the scientific racism and “whitening” doctrines of the First Republic, he presented African and Indigenous contributions and racial mixture as the creative core of Brazilian civilisation. It was a liberating book in 1933 — and it also romanticised slavery as intimate and paternal, minimising violence. Under Vargas and the military, “racial democracy” became a national ideology; to name racism could be called un-Brazilian.</p>
      <h4>The critique</h4>
      <p>A UNESCO research programme (1950s), conceived after the Holocaust in hope of finding a model of harmony, produced the opposite: studies by Florestan Fernandes, Roger Bastide and others in São Paulo documented systematic prejudice. Fernandes argued that abolition without integration left Black Brazilians at the bottom of a competitive class society. Carlos Hasenbalg and Nelson do Valle Silva (1979 onward) used census data to show that even controlling for origins and education, non-white Brazilians had lower mobility and earnings — racism, not just the legacy of slavery or class. The Unified Black Movement (MNU, 1978) carried this into politics.</p>
      <div className="contested"><span className="contested-label">Ongoing debate</span>Scholars still debate how Brazil’s colour continuum works. The census categories (branco, pardo, preto, amarelo, indígena) are self-declared; many Brazilians shift category over their lives or by context, and the share identifying as pardo or preto has risen as stigma declined. Some argue the continuum softens boundaries; others that it fragments solidarity and lets discrimination hide behind “colour” rather than “race.” Affirmative action — university quotas (federal law 12.711 of 2012, upheld by the Supreme Court) — moved policy decisively toward the critics’ view.</div>
      <h4>Football</h4>
      <p>Introduced to São Paulo by Charles Miller in 1894 and to Rio’s elite clubs soon after, football was initially a marker of anglophile distinction. Mário Filho’s <em>O Negro no Futebol Brasileiro</em> (1947) narrated its democratisation — Vasco’s 1923 title, the “Resposta Histórica” signed by club president José Augusto Prestes, professionalisation in 1933 — as a parable of national integration; historians have since complicated that story. The 16 July 1950 defeat to Uruguay (the <em>Maracanazo</em>), with a crowd officially counted at about 174,000 paying spectators and perhaps 200,000 present, was experienced as national trauma. Then came 1958: Pelé and Garrincha, “futebol-arte,” and a new national self-image that was explicitly mixed-race.</p>
      <h4>The numbers on the slide</h4>
      <p>2022 census: pardo 45.3%, white 43.5%, preto 10.2%, Indigenous 0.6%, amarelo 0.4% — the first census since 1991 in which pardos outnumbered whites. Income gaps from IBGE’s PNAD Contínua: average labour income of white workers has been roughly 70% higher than that of Black and pardo workers (equivalently, Black and pardo workers earn roughly 40% less). Homicide: IPEA’s Atlas da Violência reports that about three-quarters of victims are Black or pardo.</p>
    </>
  ),
  sources: ['freyre', 'fernandes', 'hasenbalg', 'filho', 'ibge2022', 'schwarczRacas'],
}

export const act3Slides = [divider, oldRepublic, saoPaulo, passos, rioExpansion, vargas, samba, race]
