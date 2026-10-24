import type { SlideDef } from '../types'
import { Slide, At } from '../components/Slide'
import { Img } from '../components/Img'
import { MapFrame, polyline, curve, type Proj, type LonLat } from '../components/MapFrame'
import { Header, Cite, C } from './common'
import { ActDivider } from './divider'
import rivers from '../data/geo/rivers.json'
import brazil from '../data/geo/brazil.json'
import americas from '../data/geo/americas.json'

/** Tordesillas meridian as conventionally drawn (Belém–Laguna); its true position was never agreed */
const TORD = -48.7
const BR_VIEW = { w: -75, s: -35, e: -33, n: 6.2 }

function Dot({ p, at, r = 5, fill = C.ink, label, dx = 9, dy = 4, cls = 'map-label sm', anchor = 'start' }: { p: Proj; at: LonLat; r?: number; fill?: string; label?: string; dx?: number; dy?: number; cls?: string; anchor?: 'start' | 'end' | 'middle' }) {
  const [x, y] = p(at[0], at[1])
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill={fill} stroke="#fff" strokeWidth={1.5} />
      {label && <text x={x + dx} y={y + dy} className={cls} textAnchor={anchor}>{label}</text>}
    </g>
  )
}

function Rivers({ p, names, width = 1.6, opacity = 0.9 }: { p: Proj; names?: string[]; width?: number; opacity?: number }) {
  const feats = (rivers as { features: { properties: { name: string; scalerank: number } }[] }).features
    .filter((f) => !names || names.includes(f.properties.name))
  return <g>{feats.map((f, i) => <path key={i} d={p.path(f)} fill="none" stroke="#6f9bb0" strokeWidth={f.properties.scalerank <= 2 ? width * 1.3 : width} opacity={opacity} strokeLinecap="round" />)}</g>
}

export function BrazilOutline({ p, stroke = '#1f1b16', width = 1.4, dash, fill = 'none', opacity = 1 }: { p: Proj; stroke?: string; width?: number; dash?: string; fill?: string; opacity?: number }) {
  return <path d={p.path(brazil)} fill={fill} stroke={stroke} strokeWidth={width} strokeDasharray={dash} opacity={opacity} strokeLinejoin="round" />
}

function Neighbors({ p }: { p: Proj }) {
  return <g>{(americas as { features: { properties: { ADM0_A3: string } }[] }).features.filter((f) => f.properties.ADM0_A3 !== 'BRA').map((f, i) => <path key={i} d={p.path(f)} fill="rgba(242,235,221,0.55)" stroke="rgba(31,27,22,0.25)" strokeWidth={0.8} />)}</g>
}

/* ===================== Divider ===================== */
const divider: SlideDef = {
  id: 'act1', act: 'I', short: 'Act I — The Making of Colonial Brazil',
  render: () => (
    <ActDivider numeral="I" title="The Making of Colonial Brazil" span="c. 1500 – 1808" image="postPernambuco" pos="50% 60%" highlight={[1500, 1808]} color="#a9c27f"
      question="Why did a small European kingdom build a vast slave society in the tropics — and why did it keep pushing inland?" />
  ),
  notes: (
    <>
      <p>Act I explains the foundations: a geography that channelled settlement, the Indigenous societies the Portuguese encountered and destroyed, the Atlantic strategy of a small kingdom, the sugar plantation as an economic machine, the South Atlantic slave trade that fed it, the founding of Rio, and the gold rush that dragged the colony’s centre of gravity south and made Rio its capital.</p>
      <p><strong>Image:</strong> Frans Post, <em>Landscape in Pernambuco</em> (17th century). Post travelled to Dutch-occupied Brazil in 1637 with Johan Maurits of Nassau-Siegen; his serene views of plantations and sugar mills — often with enslaved workers rendered as small figures — were painted largely after his return to Haarlem, for a European market hungry for images of the sugar colonies.</p>
    </>
  ),
}

/* ===================== Geography ===================== */
const escarpment: LonLat[] = [[-48.9, -26.3], [-48.4, -25.4], [-47.4, -24.6], [-46.4, -23.85], [-45.4, -23.45], [-44.4, -22.95], [-43.4, -22.55], [-42.4, -22.25], [-41.5, -21.5], [-40.9, -20.6]]
const tiete: LonLat[] = [[-46.63, -23.55], [-47.3, -23.25], [-47.95, -22.85], [-48.6, -22.55], [-49.3, -22.1], [-50.0, -21.55], [-50.7, -21.05], [-51.35, -20.7]]

const geography: SlideDef = {
  id: 'geography', act: 'I', short: 'Geography set the stage',
  render: () => (
    <Slide theme="paper">
      <Header n={5} kicker="Geography" title={<>A coast walled off from its interior — and rivers that ran <em>away</em> from the sea</>} w={640} size="md" />
      <At x={80} y={350} w={600}>
        {[
          ['The wall', 'Along the southeast, the Great Escarpment (Serra do Mar) rises 800–1,000 m within a few dozen kilometres of the shore. Good harbours behind it are rare — which is what made Guanabara Bay so valuable.'],
          ['Rivers that point inland', 'Behind the wall, the Tietê flows west, away from São Paulo’s coast, into the Paraná basin. It turned São Paulo into a launch pad for expeditions into the continent rather than a port.'],
          ['Two Brazils by sea', 'Winds and currents made the north coast (Maranhão, Pará) easier to reach from Lisbon than from Salvador. Until the 1770s it was governed as a separate colony.'],
        ].map(([h, b], i) => (
          <div key={i} className={`rise d${i + 2}`} style={{ display: 'flex', gap: 18, marginBottom: 22 }}>
            <div className="serif" style={{ fontSize: 40, color: C.brazilwood, lineHeight: 0.9, width: 26 }}>{i + 1}</div>
            <div>
              <div className="serif" style={{ fontSize: 24, fontWeight: 600, color: 'var(--text)' }}>{h}</div>
              <p className="body" style={{ margin: '4px 0 0', fontSize: 15.5 }}>{b}</p>
            </div>
          </div>
        ))}
      </At>
      <At x={720} y={0} w={880} h={900}>
        <MapFrame map="brazil" w={880} h={900} view={BR_VIEW} fit="contain">
          {(p) => (
            <>
              <BrazilOutline p={p} stroke="rgba(31,27,22,0.55)" width={1.2} />
              <Rivers p={p} />
              <path d={polyline(p, escarpment)} fill="none" stroke={C.brazilwood} strokeWidth={5} opacity={0.85} strokeDasharray="2 3" />
              <path d={polyline(p, tiete)} fill="none" stroke="#2f5d74" strokeWidth={3} markerEnd="url(#arrow)" />
              <text x={p(-49.4, -21.4)[0]} y={p(-49.4, -21.4)[1]} className="map-label sm" transform={`rotate(-30 ${p(-49.4, -21.4)[0]} ${p(-49.4, -21.4)[1]})`}>Tietê flows inland</text>
              <text x={p(-44.5, -24.6)[0]} y={p(-44.5, -24.6)[1]} className="map-label sm" fill={C.brazilwood}>Serra do Mar escarpment</text>
              <Dot p={p} at={[-43.17, -22.9]} label="Guanabara Bay" fill={C.brazilwood} />
              <Dot p={p} at={[-46.63, -23.55]} label="São Paulo" dx={-8} anchor="end" />
              <Dot p={p} at={[-38.5, -12.97]} label="Salvador" />
              <Dot p={p} at={[-34.88, -8.05]} label="Recife" />
              <Dot p={p} at={[-48.5, -1.45]} label="Belém" />
              <text {...pt(p, -61, -3.2)} className="map-label it">Amazon</text>
              <text {...pt(p, -43.6, -11.6)} className="map-label it" transform={rot(p, -43.6, -11.6, -62)}>São Francisco</text>
              <text {...pt(p, -54.5, -23.2)} className="map-label it" transform={rot(p, -54.5, -23.2, -62)}>Paraná</text>
              <text {...pt(p, -40.6, -8)} className="map-label caps">Sertão</text>
              <text {...pt(p, -50.5, -15.2)} className="map-label caps">Cerrado plateau</text>
              <text {...pt(p, -63, -7.2)} className="map-label caps">Amazon basin</text>
              <text {...pt(p, -36.6, -11.2)} className="map-label xs" transform={rot(p, -36.6, -11.2, -58)}>Atlantic forest &amp; sugar soils</text>
              <path d={curve(p(-35.1, -5.6), p(-33.6, -2.4), -0.15)} fill="none" stroke="#1f1b16" strokeWidth={1.4} markerEnd="url(#arrow)" />
              <text {...pt(p, -37.6, -3.0)} className="map-label xs" textAnchor="end">West Africa ≈ 3,000 km</text>
              <rect x={p(-48.6, -2.9)[0] - 4} y={p(-48.6, -2.9)[1] - 72} width={186} height={30} fill="rgba(242,235,221,0.85)" />
              <text {...pt(p, -48.6, -2.9)} dy={-52} className="map-label xs">Estado do Maranhão e Grão-Pará</text>
            </>
          )}
        </MapFrame>
      </At>
      <Cite x={740} y={862} w={840}>Shaded relief from AWS Terrain Tiles (SRTM/GMTED/ETOPO1); rivers: Natural Earth; escarpment and Tietê course drawn approximately.</Cite>
    </Slide>
  ),
  notes: (
    <>
      <p><strong>Why geography is the right place to start.</strong> Brazil’s colonial settlement hugged the coast for more than a century. Inland expansion followed a few gateways, and those gateways determined which cities mattered.</p>
      <h4>The escarpment and the harbours</h4>
      <p>From Santa Catarina to Espírito Santo the Brazilian Shield breaks off in the Great Escarpment. The Serra do Mar and, behind it, the Serra da Mantiqueira make the coastal strip narrow and the climb inland steep. For centuries goods moved up and down on mule trains (tropas). Natural harbours with sheltered deep water are scarce; Guanabara Bay — an enormous drowned river valley with a narrow mouth — is the outstanding exception, which is the geographic seed of Rio’s importance.</p>
      <h4>The Tietê paradox</h4>
      <p>São Paulo sits on the plateau just behind the escarpment. Its river, the Tietê, runs not to the nearby sea but 1,100 km inland to the Paraná. Paulista expeditions — the bandeiras and later the river convoys (monções) to Cuiabá — used it as a highway into the interior. São Paulo was for two centuries a poor, Tupi-speaking frontier town whose wealth came from raiding Indigenous people and, eventually, finding gold. Its later dominance came only with coffee and railways.</p>
      <h4>Two colonies</h4>
      <p>In 1621 the Crown created a separate Estado do Maranhão (later Maranhão e Grão-Pará), governed directly from Lisbon, because sailing from São Luís or Belém to Salvador against the prevailing winds and currents could take longer than sailing to Portugal. It was merged into a single Brazilian administration only in the 1770s — one reason Pará initially sided with Lisbon in 1822–23.</p>
      <h4>The Northeast bulge</h4>
      <p>Cape São Roque, near Natal, is about 3,000 km from Dakar. Pernambuco and Bahia were the closest points of the Americas to both Portugal’s sailing routes and West-Central Africa — the first reason sugar began there.</p>
    </>
  ),
  sources: ['furtado', 'hemming', 'boxerSeaborne', 'fgvAtlas', 'dean'],
}
function pt(p: Proj, lon: number, lat: number) { const [x, y] = p(lon, lat); return { x, y } }
function rot(p: Proj, lon: number, lat: number, deg: number) { const [x, y] = p(lon, lat); return `rotate(${deg} ${x} ${y})` }

/* ===================== Indigenous Brazil ===================== */
const indigenous: SlideDef = {
  id: 'indigenous', act: 'I', short: 'Before Portugal',
  render: () => (
    <Slide theme="paper">
      <At x={0} y={0} w={560} h={900}>
        <div style={{ display: 'flex', height: 900 }}>
          <Img id="eckhoutTupinamba" style={{ width: 280, height: 900 }} pos="50% 30%" credit="bl" />
          <Img id="eckhoutTupiWoman" style={{ width: 280, height: 900 }} pos="50% 30%" credit="br" />
        </div>
      </At>
      <Header x={620} n={6} kicker="Before 1500" title={<>Millions of people, not an empty forest</>} w={900}
        dek="Portuguese ships met coastal Tupi-speaking peoples who had themselves recently expanded along the shore. Within a century, epidemics, war and enslavement had emptied much of the coast." />
      <At x={620} y={380} w={900}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 26 }}>
          <div className="rise d2">
            <div className="big-num" style={{ color: C.sugar, fontSize: 52 }}>2–4m+</div>
            <p className="body" style={{ fontSize: 14.5, marginTop: 8 }}>Plausible range for the population of what is now Brazil in 1500. Estimates are genuinely uncertain; Amazon floodplains were far more densely settled than once assumed.</p>
          </div>
          <div className="rise d3">
            <div className="big-num" style={{ color: C.sugar, fontSize: 52 }}>1563</div>
            <p className="body" style={{ fontSize: 14.5, marginTop: 8 }}>Smallpox and famine sweep the Jesuit villages of Bahia, killing tens of thousands — one reason planters turned to Africa for labour.</p>
          </div>
          <div className="rise d4">
            <div className="big-num" style={{ color: C.sugar, fontSize: 52 }}>1.69m</div>
            <p className="body" style={{ fontSize: 14.5, marginTop: 8 }}>Indigenous people counted in the 2022 census (0.8% of Brazil) — hundreds of peoples speaking well over 200 languages.</p>
          </div>
        </div>
      </At>
      <At x={620} y={640} w={900} className="rise d5">
        <div className="label" style={{ color: C.brazilwood, marginBottom: 10 }}>You will hear Tupi all over Rio</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px 26px', fontSize: 15 }}>
          {[['Guanabara', 'the bay'], ['Carioca', 'a native of Rio (likely “white man’s house”)'], ['Tijuca', '“marsh, mud”'], ['Ipanema', '“bad / barren water”'], ['Niterói', '“hidden water”'], ['Maracanã', 'a kind of macaw']].map(([w, m]) => (
            <div key={w}><span className="serif" style={{ fontSize: 22, fontWeight: 600, color: 'var(--text)' }}>{w}</span> <span className="small">— {m}</span></div>
          ))}
        </div>
        <p className="small" style={{ marginTop: 12 }}>Etymologies are traditional and some are disputed. <b>Copacabana</b> is the exception: the name comes from an Andean shrine to the Virgin of Copacabana on Lake Titicaca.</p>
      </At>
      <Cite x={620} y={862} w={900}>Paintings: Albert Eckhout, “Tupi man” and “Tupi woman”, 1641–43, painted in Dutch Brazil (National Museum of Denmark). Census: IBGE 2022.</Cite>
    </Slide>
  ),
  notes: (
    <>
      <h4>Who lived here</h4>
      <p>In 1500 the coast from roughly São Paulo to the Amazon was dominated by Tupi-Guarani-speaking peoples — Tupinambá, Tupiniquim, Potiguar, Tamoio, Caeté and others — who lived in villages of several hundred people in large communal longhouses, grew manioc by swidden agriculture, fished, and waged chronic war between villages. Ritual execution and consumption of war captives was central to their social and religious life. It is documented by eyewitnesses with very different agendas — the German gunner Hans Staden, a captive in 1554–55; the Calvinist Jean de Léry; Jesuits such as Manuel da Nóbrega — and modern anthropologists treat it as real while reading the sources critically.</p>
      <p>The interior was home to peoples the Portuguese lumped together as “Tapuia” (non-Tupi, often Macro-Jê speakers). In the Amazon, archaeology has transformed the picture: the Marajoara culture of Marajó Island (c. 400–1400 CE) built mound settlements and produced elaborate polychrome ceramics, and in the Upper Xingu researchers have mapped networks of fortified, planned settlements linked by roads, alongside anthropogenic “dark earths” (terra preta) that show long-term landscape engineering.</p>
      <div className="contested"><span className="contested-label">Contested numbers</span>Estimates of the Indigenous population of Brazil in 1500 range from about one million to five million or more. John Hemming’s widely cited figure is about 2.4 million; higher estimates weight Amazonian archaeology more heavily. What is not in dispute is the scale of collapse: epidemics (smallpox, measles, influenza), enslavement and war killed a large majority within a few generations of contact on the coast.</div>
      <h4>Why it matters for what followed</h4>
      <ul>
        <li><strong>Labour.</strong> The first sugar mills used enslaved and coerced Indigenous workers. Epidemics (notably 1562–63), flight into a terrain the locals knew, Jesuit and Crown restrictions on enslavement (a 1570 law, repeatedly evaded) and Indigenous resistance pushed planters toward African captives.</li>
        <li><strong>Alliances.</strong> Portuguese and French both depended on Indigenous allies. The founding of Rio was a war fought largely by Indigenous armies — the Temiminó leader Arariboia for the Portuguese, the Tamoio confederation for the French. Arariboia was rewarded with land across the bay: Niterói was founded in 1573 as his village.</li>
        <li><strong>Language and culture.</strong> A Tupi-based <em>língua geral</em> was the everyday language of São Paulo and the Amazon well into the 18th century until the Marquis of Pombal mandated Portuguese. Manioc flour (farinha), the hammock (rede) and countless place names are Tupi legacies.</li>
      </ul>
      <h4>An intellectual surprise</h4>
      <p>In 1550 the city of Rouen staged a “Brazilian village” with some fifty Tupinambá for King Henri II. In 1562 Montaigne met three Tupinambá in Rouen; the encounter became “Of Cannibals” (1580), the essay in which he argued that Europeans, with their wars of religion, had little claim to call others barbarous. Brazil entered European thought as a mirror for Europe’s own self-doubt.</p>
      <p className="small">Copacabana: the beach took its name from a chapel to Nossa Senhora de Copacabana, a devotion that originated at the shrine of Copacabana on Lake Titicaca (Bolivia).</p>
    </>
  ),
  sources: ['hemming', 'denevan', 'heckenberger', 'neves', 'staden', 'ibge2022'],
}

/* ===================== Portugal & the Atlantic ===================== */
const ATL_VIEW = { w: -62, s: -40, e: 24, n: 44 }
const portugal: SlideDef = {
  id: 'portugal', act: 'I', short: 'Found on the way to India',
  render: () => (
    <Slide theme="paper">
      <At x={640} y={0} w={960} h={900}>
        <MapFrame map="atlantic" w={960} h={900} view={ATL_VIEW}>
          {(p) => {
            const tx = p(TORD, 0)[0]
            const route: LonLat[] = [[-9.14, 38.7], [-15.5, 28.3], [-23.5, 15.0], [-29, 2], [-33.5, -9], [-39.0, -16.4]]
            const route2: LonLat[] = [[-39.0, -16.4], [-30, -27], [-12, -35.5], [5, -37.5], [18.4, -34.6], [23.5, -34]]
            return (
              <>
                <line x1={tx} x2={tx} y1={0} y2={900} stroke={C.brazilwood} strokeWidth={2} strokeDasharray="8 6" />
                <text x={tx - 10} y={50} className="map-label" fill={C.brazilwood} textAnchor="end">Tordesillas line, 1494</text>
                <text x={tx - 10} y={68} className="map-label xs" textAnchor="end">370 leagues west of Cape Verde (position disputed)</text>
                <text x={tx - 14} y={120} className="map-label caps" textAnchor="end">← Spain</text>
                <text x={tx + 14} y={120} className="map-label caps">Portugal →</text>
                <path d={polyline(p, route)} fill="none" stroke="#1f1b16" strokeWidth={2.4} className="draw" />
                <path d={polyline(p, route2)} fill="none" stroke="#1f1b16" strokeWidth={2.4} strokeDasharray="1 5" strokeLinecap="round" markerEnd="url(#arrow)" />
                <text {...pt(p, -27.5, 8)} className="map-label sm">Cabral’s fleet, 1500</text>
                <text {...pt(p, -27.5, 6)} dy={14} className="map-label xs">the “volta do mar” swing west</text>
                <text {...pt(p, -6, -38)} className="map-label xs">… on to India</text>
                <Dot p={p} at={[-9.14, 38.7]} label="Lisbon" />
                <Dot p={p} at={[-16.9, 32.7]} label="Madeira — first sugar boom" fill={C.sugar} />
                <Dot p={p} at={[-23.5, 15.0]} label="Cape Verde" dx={-9} anchor="end" />
                <Dot p={p} at={[-1.35, 5.08]} label="Elmina, 1482" dy={-8} />
                <Dot p={p} at={[6.7, 0.33]} label="São Tomé — sugar + slavery" fill={C.sugar} />
                <Dot p={p} at={[13.23, -8.84]} label="Luanda, 1575" />
                <Dot p={p} at={[-39.06, -16.45]} label="Porto Seguro, Apr 1500" fill={C.brazilwood} dx={-9} anchor="end" />
              </>
            )
          }}
        </MapFrame>
      </At>
      <Header n={7} kicker="Portugal’s Atlantic" title={<>A small kingdom found Brazil <em>on the way to India</em></>} w={520} size="md" />
      <At x={80} y={300} w={510}>
        <p className="body">Portugal had perhaps 1–1.5 million people. Its fortune lay in Asian spices, and Brazil was a by-product: Cabral’s India fleet swung far west to catch the South Atlantic winds and struck the coast in April 1500.</p>
        <p className="body">For thirty years the only business was <strong>brazilwood</strong>, a red dye-wood (brasa = ember) that gave the land its name. Only French interlopers forced the Crown to settle — first by handing coastal strips to private “donatários” (1534), then by founding a royal capital at Salvador (1549).</p>
        <p className="body">The template already existed on the Atlantic islands: <strong>Madeira</strong> proved sugar; <strong>São Tomé</strong> proved sugar worked by enslaved Africans.</p>
      </At>
      <At x={80} y={668} w={250}>
        <Img id="cantino" style={{ width: 250, height: 150 }} pos="30% 50%" credit={false} />
      </At>
      <At x={345} y={672} w={260}>
        <div className="caption"><b>The Cantino planisphere, 1502</b> — smuggled from Lisbon to Italy. It already shows the Tordesillas line and a Brazilian coast decorated with parrots and trees.</div>
      </At>
      <Cite x={80} y={862} w={540}>Map: author’s reconstruction on shaded relief. Cantino map: Biblioteca Estense, Modena (public domain).</Cite>
    </Slide>
  ),
  notes: (
    <>
      <h4>Why Portugal, and why so thinly?</h4>
      <p>Portugal was a small, poor kingdom on Europe’s Atlantic edge with a precocious maritime state. From the 1410s it pushed down the African coast for gold, captives and a sea route to Asia; Vasco da Gama reached India in 1498. Pedro Álvares Cabral’s second India fleet (13 ships) made landfall near Porto Seguro on 22 April 1500. Whether the landfall was accidental or intentional is an old debate; most historians see it as the natural consequence of the wide westward arc (the <em>volta do mar</em>) needed to use the South Atlantic trade winds, and note that Portugal had insisted in 1494 on moving the demarcation line far enough west to cover any land there.</p>
      <h4>Tordesillas (1494)</h4>
      <p>Spain and Portugal divided the non-Christian world along a meridian 370 leagues west of the Cape Verde islands. Because the league and the starting island were never fixed, the line’s position was contested — cartographers placed it anywhere from about 42°W to 50°W; Brazilian textbooks conventionally draw it from near Belém to Laguna (about 48–49°W), as on these maps. On any reading, most of present-day Brazil lies west of it. How Brazil came to occupy that territory is a theme of the following slides.</p>
      <h4>Brazilwood and the French</h4>
      <p>The first three decades were a dye-wood trade carried on through coastal trading posts with Indigenous labour paid in tools and trinkets; in 1502 the Crown leased it to a consortium led by Fernão de Noronha. French traders from Normandy competed vigorously and allied with coastal peoples. To secure the coast the Crown in 1534 divided it into hereditary captaincies granted to private donatários who had to finance colonisation themselves. Most failed; Pernambuco (Duarte Coelho) and São Vicente prospered on sugar. In 1549 the Crown sent a governor-general, Tomé de Sousa, with the first Jesuits, to found Salvador.</p>
      <h4>A pattern that recurs</h4>
      <p>A Crown short of money and people delegated the costs and the profits of expansion to private actors — donatários, planters, merchants, bandeirantes — in exchange for loyalty and a share of revenue. Historians from Raymundo Faoro to Stuart Schwartz have debated whether this created a centralised “patrimonial” state or a weak state captured by local elites; arguably it created both: a state formally centralised but dependent on bargains with powerful private interests.</p>
    </>
  ),
  sources: ['boxerSeaborne', 'fausto', 'schwartz', 'hemming'],
}

/* ===================== Sugar engenho ===================== */
function Stage({ x, y, w, h, title, sub, color }: { x: number; y: number; w: number; h: number; title: string; sub: string; color: string }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={4} fill="#fbf7ee" stroke={color} strokeWidth={1.6} />
      <rect x={x} y={y} width={w} height={6} fill={color} />
      <text x={x + 14} y={y + 34} fontFamily="Cormorant Garamond" fontSize={23} fontWeight={600} fill="#1f1b16">{title}</text>
      <foreignObject x={x + 14} y={y + 42} width={w - 24} height={h - 46}>
        <div style={{ fontSize: 13, lineHeight: 1.4, color: '#4a4238', fontFamily: 'Inter' }}>{sub}</div>
      </foreignObject>
    </g>
  )
}
function Flow({ d, color = '#1f1b16', w = 2, dash }: { d: string; color?: string; w?: number; dash?: string }) {
  return <path d={d} fill="none" stroke={color} strokeWidth={w} strokeDasharray={dash} markerEnd="url(#arrowS)" />
}

const sugar: SlideDef = {
  id: 'sugar', act: 'I', short: 'The sugar machine',
  render: () => (
    <Slide theme="paper">
      <Header n={8} kicker="Political economy of sugar" title={<>Sugar made Brazil a business — and the business ran on <em>enslaved Africans</em></>} w={1100} size="md" />
      <svg width={1600} height={900} style={{ position: 'absolute', left: 0, top: 0 }}>
        <defs>
          <marker id="arrowS" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="context-stroke" /></marker>
        </defs>
        {/* inputs */}
        <text x={80} y={248} fontSize={11} letterSpacing="0.14em" fontWeight={700} fill="#7a6f60" fontFamily="Inter">INPUTS</text>
        {[
          ['Land', 'Huge royal grants (sesmarias) on fertile massapê clay near rivers & ports', C.sugar],
          ['Enslaved labour', 'Africans bought on credit; 18-hour shifts in the 8–9 month harvest', C.brazilwood],
          ['Firewood & oxen', 'Furnaces consumed forests; Atlantic forest cleared mile by mile', C.coffee],
          ['Credit', 'Merchants advanced captives & goods against the next crop', C.atlantic],
        ].map(([t, s, c], i) => (
          <g key={t}>
            <rect x={80 + i * 262} y={258} width={248} height={72} rx={3} fill="none" stroke={c} strokeDasharray="3 3" />
            <text x={92 + i * 262} y={280} fontFamily="Inter" fontSize={14} fontWeight={700} fill={c}>{t}</text>
            <foreignObject x={92 + i * 262} y={286} width={230} height={44}><div style={{ fontSize: 12, lineHeight: 1.3, color: '#4a4238', fontFamily: 'Inter' }}>{s}</div></foreignObject>
            <Flow d={`M${204 + i * 262},332 L${204 + i * 262 + (i < 2 ? 40 : -40)},372`} color={c as string} w={1.4} />
          </g>
        ))}
        {/* process */}
        <Stage x={80} y={380} w={200} h={150} title="Cane fields" sub="Planters & tenant cane growers (lavradores) who milled at the master’s engenho and split the sugar." color={C.sugar} />
        <Flow d="M282,455 L318,455" />
        <Stage x={322} y={380} w={200} h={150} title="The mill" sub="Water- or ox-driven rollers crush the cane within hours of cutting — the factory sets the pace." color={C.coffee} />
        <Flow d="M524,455 L560,455" />
        <Stage x={564} y={380} w={200} h={150} title="Boiling house" sub="Juice is boiled through a row of copper kettles: the most dangerous, most skilled work." color={C.brazilwood} />
        <Flow d="M766,455 L802,455" />
        <Stage x={806} y={380} w={200} h={150} title="Purging house" sub="Clay-topped conical moulds drain molasses, yielding white and brown (mascavo) sugar." color={C.gold} />
        <Flow d="M1008,455 L1044,455" />
        {/* outputs */}
        <Stage x={1048} y={380} w={210} h={150} title="Port & ship" sub="Crates (caixas) shipped from Salvador & Recife to Lisbon and Porto — and on to Amsterdam & Antwerp." color={C.atlantic} />
        <Flow d="M1260,455 L1296,455" />
        <Stage x={1300} y={380} w={220} h={150} title="Europe" sub="Dutch & Flemish refiners and distributors captured much of the value; Brazil exported raw sugar." color={C.industry} />
        {/* by-products */}
        <Flow d="M664,532 L664,580" color="#7a6f60" w={1.4} dash="3 3" />
        <text x={676} y={574} fontSize={12.5} fill="#4a4238" fontFamily="Inter">Molasses → cachaça → traded in Angola for captives</text>
        {/* surplus */}
        <text x={80} y={640} fontSize={11} letterSpacing="0.14em" fontWeight={700} fill="#7a6f60" fontFamily="Inter">WHERE THE SURPLUS WENT</text>
        {[
          ['Crown', 'tithe & duties', 0.16, C.empire],
          ['Merchants & creditors', 'interest, slave sales, freight', 0.24, C.atlantic],
          ['European refiners', 'refining & distribution margin', 0.26, C.industry],
          ['Planter class', 'land, status, and more slaves', 0.34, C.sugar],
        ].map(([t, s, f, c], i, arr) => {
          const x0 = 80 + arr.slice(0, i).reduce((a, r) => a + (r[2] as number) * 900, 0)
          const wdt = (f as number) * 900
          return (
            <g key={t as string}>
              <rect x={x0} y={652} width={wdt - 3} height={40} fill={c as string} opacity={0.88} />
              <text x={x0 + 10} y={677} fontSize={13.5} fill="#fff" fontWeight={600} fontFamily="Inter">{t as string}</text>
              <text x={x0 + 10} y={712} fontSize={12} fill="#4a4238" fontFamily="Inter">{s as string}</text>
            </g>
          )
        })}
        <text x={80} y={740} fontSize={11.5} fill="#7a6f60" fontFamily="Inter" fontStyle="italic">Shares are schematic, not measured — they show who had claims on the crop, not exact proportions.</text>
      </svg>
      <At x={1030} y={588} w={490}>
        <div className="serif" style={{ fontSize: 26, lineHeight: 1.2, fontStyle: 'italic', color: 'var(--text)' }}>“The slaves are the hands and the feet of the sugar-mill owner.”</div>
        <div className="small" style={{ marginTop: 8 }}>André João Antonil (the Jesuit Giovanni Antonio Andreoni), <em>Cultura e Opulência do Brasil</em>, 1711 — a planter’s manual the Crown suppressed for revealing too much about colonial wealth.</div>
      </At>
      <At x={80} y={770} w={1440}>
        <div className="body" style={{ fontSize: 15.5 }}>By around 1600 Brazil was the world’s largest sugar producer. The engenho was a <strong>factory in a field</strong>: capital-intensive, time-critical and dependent on a labour force that could be driven without limit. Status followed: “to be a senhor de engenho,” wrote Antonil, “is a title to which many aspire.”</div>
      </At>
    </Slide>
  ),
  notes: (
    <>
      <h4>Why sugar, why the Northeast</h4>
      <p>Sugar was the most valuable agricultural commodity in early modern Europe. Pernambuco and Bahia’s Recôncavo had the right soils (dark massapê clays), rainfall, rivers for transport and water power, and the shortest sailing times to Europe and Africa. The Portuguese brought the technology and the labour model from Madeira and São Tomé.</p>
      <h4>The economics of the mill</h4>
      <p>Cane must be crushed within a day or two of cutting, so the mill imposed an industrial rhythm on agriculture. A large engenho needed heavy investment — rollers, copper kettles, buildings, oxen, boats, and above all scores or hundreds of enslaved workers — which is why credit networks linking planters to merchants in Salvador, Recife, Lisbon and Amsterdam were essential. Many cane farmers (<em>lavradores de cana</em>) did not own mills; they brought cane to the master’s engenho and typically received about half the sugar it yielded, a relationship of dependence that made the senhor de engenho a local lord.</p>
      <h4>Why African rather than Indigenous labour</h4>
      <p>Stuart Schwartz’s classic account shows a transition between about 1570 and 1620. Indigenous workers died in epidemics, fled into a terrain they knew, and were protected (inconsistently) by Jesuits and royal law. Africans were already available through Portuguese trading posts in West-Central Africa, some came from societies with agricultural and iron-working skills that planters valued, and — crucially — merchants could finance their purchase. Planters paid two to three times more for an African than for an Indigenous captive, a price difference that reflects productivity expectations and survival rates, not benevolence.</p>
      <div className="contested"><span className="contested-label">Interpretation</span>Caio Prado Jr. (1942) argued that the “meaning of colonisation” was to supply Europe with tropical goods, so that colonial society was organised from outside. Later historians (e.g. João Fragoso, Manolo Florentino) stressed that much colonial wealth was accumulated and reinvested inside Brazil, by Brazilian merchants, especially in the slave trade. Both are true at different scales: the export sector set the rhythm, but the profits of trafficking and credit stayed substantially in Rio and Salvador.</div>
      <h4>The Dutch interlude (1630–1654)</h4>
      <p>The Dutch West India Company seized Pernambuco in 1630; under Johan Maurits of Nassau-Siegen (1637–44) Recife became a cosmopolitan town with a synagogue — the first in the Americas — and artists such as Frans Post and Albert Eckhout. Luso-Brazilian planters, many indebted to Dutch creditors, rebelled; victories at Guararapes (1648–49) — later mythologised as the birth of Brazilian nationhood — led to Dutch surrender in 1654. Expelled Dutch and Sephardic Jewish planters and merchants helped spread the sugar complex to the Caribbean, and Caribbean competition eroded Brazil’s dominance after the 1650s.</p>
      <h4>Resistance: Palmares</h4>
      <p>From about 1605 to 1694 the quilombo (maroon community) of Palmares in the hills of Alagoas sheltered thousands of escaped enslaved people. Repeated Dutch and Portuguese expeditions failed until paulista mercenaries under Domingos Jorge Velho destroyed it; its leader Zumbi was killed on 20 November 1695. That date is now the Day of Zumbi and Black Consciousness, a national holiday since 2024.</p>
    </>
  ),
  sources: ['schwartz', 'furtado', 'prado', 'alencastro', 'boxerSeaborne'],
}

/* ===================== South Atlantic ===================== */
const SA_VIEW = { w: -58, s: -36, e: 30, n: 14 }
const dest = [
  { name: 'Brazil', v: 4.86, c: C.brazilwood },
  { name: 'British Caribbean', v: 2.32, c: '#8b7a66' },
  { name: 'Spanish Americas', v: 1.29, c: '#8b7a66' },
  { name: 'French Caribbean', v: 1.12, c: '#8b7a66' },
  { name: 'Dutch Americas', v: 0.44, c: '#8b7a66' },
  { name: 'Mainland North America', v: 0.39, c: C.atlantic },
  { name: 'Danish West Indies', v: 0.11, c: '#8b7a66' },
]
const brRegions = [
  { name: 'Southeast (Rio)', v: 2.26 }, { name: 'Bahia', v: 1.55 }, { name: 'Pernambuco', v: 0.85 }, { name: 'Amazonia', v: 0.14 },
]
const southAtlantic: SlideDef = {
  id: 'south-atlantic', act: 'I', short: 'Built from the South Atlantic',
  render: () => (
    <Slide theme="paper">
      <At x={0} y={0} w={940} h={900}>
        <MapFrame map="atlantic" w={940} h={900} view={SA_VIEW} fit="contain">
          {(p) => {
            const flow = (a: LonLat, b: LonLat, w: number, bend: number, color = C.brazilwood, op = 0.75) => (
              <path d={curve(p(a[0], a[1]), p(b[0], b[1]), bend)} fill="none" stroke={color} strokeWidth={w} opacity={op} strokeLinecap="round" markerEnd="url(#arrow)" />
            )
            return (
              <>
                {flow([12.5, -8.0], [-43.17, -22.9], 30, -0.12)}
                {flow([12.3, -7.0], [-38.5, -12.97], 16, -0.08)}
                {flow([2.4, 6.3], [-38.3, -12.6], 11, 0.08)}
                {flow([12.0, -6.5], [-34.9, -8.05], 9, -0.05)}
                {flow([22, -33.8], [-43.1, -23.2], 6, 0.1, C.brazilwood, 0.55)}
                {flow([-38.6, -13.6], [1.6, 5.6], 2.5, 0.22, '#1f1b16', 0.6)}
                <Dot p={p} at={[13.23, -8.84]} label="Luanda" />
                <Dot p={p} at={[13.4, -12.58]} label="Benguela" />
                <Dot p={p} at={[2.08, 6.36]} label="Ouidah (Bight of Benin)" />
                <Dot p={p} at={[-43.17, -22.9]} label="Rio de Janeiro" dx={-9} anchor="end" fill={C.brazilwood} />
                <Dot p={p} at={[-38.5, -12.97]} label="Salvador" dx={-9} anchor="end" fill={C.brazilwood} />
                <Dot p={p} at={[-34.88, -8.05]} label="Recife" dx={-9} anchor="end" fill={C.brazilwood} />
                <text {...pt(p, 3, -18)} className="map-label sm">West-Central Africa: ~70% of</text>
                <text {...pt(p, 3, -18)} dy={16} className="map-label sm">captives landed in Brazil</text>
                <text {...pt(p, 5, -29.5)} className="map-label xs">Mozambique, via the Cape (19th c.)</text>
                <text {...pt(p, -14, 1.5)} className="map-label xs">Bahian tobacco, cachaça & gold → Africa</text>
                <text {...pt(p, -22, -31)} className="map-label it">South Atlantic</text>
              </>
            )
          }}
        </MapFrame>
      </At>
      <Header x={990} n={9} kicker="The South Atlantic system" title={<>Brazil was built from the <em>South Atlantic</em>, not just from Europe</>} w={540} size="sm" />
      <At x={990} y={282} w={540}>
        <p className="body" style={{ fontSize: 15.5 }}>Winds and currents made Angola and Brazil a natural circuit. Ships owned in Rio and Salvador sailed direct to Africa with cachaça, tobacco and gold, and returned with captives — a bilateral trade that often bypassed Lisbon entirely.</p>
        <div className="label" style={{ marginTop: 14 }}>Enslaved Africans landed alive, 1501–1866 (millions)</div>
        <svg width={540} height={232} style={{ marginTop: 8 }}>
          {dest.map((d, i) => (
            <g key={d.name} transform={`translate(0, ${i * 32})`}>
              <text x={0} y={16} fontSize={13} fill="#1f1b16" fontFamily="Inter" fontWeight={d.name === 'Brazil' ? 700 : 400}>{d.name}</text>
              <rect x={176} y={3} width={d.v * 64} height={20} fill={d.c} />
              <text x={182 + d.v * 64} y={18} fontSize={13} fill="#1f1b16" fontFamily="IBM Plex Mono">{d.v.toFixed(2)}</text>
            </g>
          ))}
        </svg>
        <div className="label" style={{ marginTop: 6 }}>Within Brazil</div>
        <div style={{ display: 'flex', gap: 2, marginTop: 6, height: 28 }}>
          {brRegions.map((r, i) => (
            <div key={r.name} style={{ flex: r.v, background: [C.brazilwood, '#c0664a', '#d99a80', '#e6c2b2'][i], color: i < 2 ? '#fff' : '#3a2a20', fontSize: 11.5, fontWeight: 600, padding: '6px 6px', whiteSpace: 'nowrap', overflow: 'hidden' }}>{r.name} {r.v}</div>
          ))}
        </div>
        <p className="small" style={{ marginTop: 14 }}>About 12.5 million people were embarked in Africa; some 1.8 million died at sea. In 1648 an expedition <em>from Rio</em> retook Luanda from the Dutch — Rio’s merchants needed Angola.</p>
      </At>
      <Cite x={990} y={862} w={560}>Data: SlaveVoyages, Trans-Atlantic Slave Trade Database estimates (rounded). Flow widths are schematic.</Cite>
    </Slide>
  ),
  notes: (
    <>
      <h4>Scale</h4>
      <p>The SlaveVoyages estimates (Eltis, Richardson and collaborators) put total embarkations from Africa at about 12.5 million (1501–1866) and arrivals at about 10.7 million. Brazil received about 4.86 million — roughly 45%. Within Brazil, the Southeast (essentially Rio de Janeiro) received the most, about 2.3 million, most of them in the 18th and 19th centuries; Bahia about 1.5 million; Pernambuco about 0.85 million. Recent research suggests Rio was the single largest slave-trading port in the Americas.</p>
      <h4>The South Atlantic as one system</h4>
      <p>Luiz Felipe de Alencastro’s <em>O Trato dos Viventes</em> argues that Brazil was “formed outside Brazil”: the colony’s economy and society were constituted in a South Atlantic space that joined Portuguese America to Angola. The ocean’s clockwise gyre made voyages between Luanda and Rio or Salvador relatively quick and predictable. Brazilian goods — Bahian tobacco (prized on the Bight of Benin), cachaça (jeribita) in Angola, later gold and textiles — paid for captives. Brazilian-based merchants dominated the trade by the 18th century; some, like the great Rio traffickers of the early 19th century, were among the richest men in the Empire.</p>
      <p>Africa was not passive in this system: African states and merchants controlled the supply of captives in the interior, and the trade reshaped African politics, from the Kingdom of Kongo and Ndongo to Dahomey and Oyo.</p>
      <h4>The 1648 expedition</h4>
      <p>When the Dutch occupied Luanda (1641–48), sugar planters in Brazil lost their labour supply. Salvador Correia de Sá, governor of Rio de Janeiro, organised and largely financed from Rio a fleet that retook Luanda in 1648. It is a striking illustration of the argument: the defence of Angola was a Brazilian interest.</p>
      <h4>Cultural consequences</h4>
      <p>Bantu-speaking West-Central Africans (from Kongo, Ndongo, Benguela) predominated in Rio and the Southeast; West Africans from the Bight of Benin (Yoruba, Fon/Gbe, Hausa) were especially numerous in 19th-century Bahia, where they shaped Candomblé and led the 1835 Malê uprising. Many Brazilian words — samba, quilombo, moleque, caçula, cafuné — have Bantu origins.</p>
    </>
  ),
  sources: ['slavevoyages', 'eltis', 'alencastro', 'klein'],
}

/* ===================== Demography paradox ===================== */
const demography: SlideDef = {
  id: 'demography', act: 'I', short: 'The demographic paradox',
  render: () => {
    const sx = (v: number) => v * 58 // millions to px
    const bars = [
      { label: 'United States, 1860', parts: [{ k: 'White', v: 26.92, c: '#cdbfa4' }, { k: 'Free Black', v: 0.49, c: '#6e8f86' }, { k: 'Enslaved', v: 3.95, c: C.brazilwood }], arrived: 0.39 },
      { label: 'Brazil, 1872', parts: [{ k: 'White', v: 3.79, c: '#cdbfa4' }, { k: 'Free Black & pardo', v: 4.25, c: '#6e8f86' }, { k: 'Enslaved', v: 1.51, c: C.brazilwood }, { k: 'Caboclo', v: 0.39, c: '#b9b08e' }], arrived: 4.86 },
    ]
    return (
      <Slide theme="paper">
        <Header n={10} kicker="A demographic paradox" title={<>Brazil received twelve times more Africans than the United States — and ended with <em>fewer</em> enslaved people</>} w={1300} size="md" />
        <At x={80} y={300} w={560}>
          <p className="body">Two mechanisms explain the paradox, and together they shaped modern Brazil’s racial order:</p>
          <p className="body"><strong>1. Death outpaced birth.</strong> Plantations and port cities killed enslaved people faster than they could reproduce; the captives imported were mostly young men. While the trade was open, owners replenished by purchase. The US enslaved population, by contrast, grew by natural increase after its trade ended in 1808.</p>
          <p className="body"><strong>2. Manumission was common.</strong> Many enslaved Brazilians — especially women and city dwellers — bought or were granted freedom. By 1872 free people of African descent outnumbered both the enslaved and the white population.</p>
          <p className="body" style={{ marginTop: 18, color: 'var(--text)' }}>The result was not a two-caste society but a <strong>graded colour hierarchy</strong>, with a large free population of colour — and slavery nonetheless intact.</p>
        </At>
        <svg width={860} height={520} style={{ position: 'absolute', left: 690, top: 300 }}>
          {bars.map((b, i) => {
            let acc = 0
            const y = 40 + i * 210
            return (
              <g key={b.label} transform={`translate(0, ${y})`}>
                <text x={0} y={0} fontFamily="Cormorant Garamond" fontSize={26} fontWeight={600} fill="#1f1b16">{b.label}</text>
                <text x={0} y={34} fontSize={12} fill="#7a6f60" fontFamily="Inter" letterSpacing="0.1em" fontWeight={600}>ARRIVED FROM AFRICA (ALL YEARS)</text>
                <rect x={260} y={21} width={sx(b.arrived)} height={18} fill="none" stroke={C.brazilwood} strokeWidth={2} strokeDasharray="4 2" />
                <text x={268 + sx(b.arrived)} y={35} fontSize={13} fontFamily="IBM Plex Mono" fill="#1f1b16">{b.arrived.toFixed(2)}m</text>
                <text x={0} y={72} fontSize={12} fill="#7a6f60" fontFamily="Inter" letterSpacing="0.1em" fontWeight={600}>POPULATION AT CENSUS</text>
                {i === 0 ? (
                  <>
                    {/* US: show enslaved + free black at scale; white truncated */}
                    <rect x={260} y={58} width={sx(3.95)} height={26} fill={C.brazilwood} />
                    <text x={266} y={76} fontSize={12.5} fill="#fff" fontWeight={600} fontFamily="Inter">Enslaved 3.95m</text>
                    <rect x={260 + sx(3.95) + 2} y={58} width={sx(0.49)} height={26} fill="#6e8f86" />
                    <text x={260} y={108} fontSize={12.5} fill="#4a4238" fontFamily="Inter">Free Black 0.49m · White 26.9m (not shown to scale)</text>
                  </>
                ) : (
                  <>
                    {b.parts.map((pp) => {
                      const x = 260 + sx(acc)
                      acc += pp.v
                      return (
                        <g key={pp.k}>
                          <rect x={x} y={58} width={sx(pp.v) - 2} height={26} fill={pp.c} />
                        </g>
                      )
                    })}
                    <text x={262} y={108} fontSize={12.5} fill="#4a4238" fontFamily="Inter">White 3.79m</text>
                    <text x={262 + sx(3.79)} y={108} fontSize={12.5} fill="#2d4a44" fontFamily="Inter" fontWeight={700}>Free Black & pardo 4.25m</text>
                    <text x={262 + sx(8.04)} y={128} fontSize={12.5} fill={C.brazilwood} fontFamily="Inter" fontWeight={700}>Enslaved 1.51m</text>
                  </>
                )}
              </g>
            )
          })}
          <text x={0} y={470} fontSize={12} fill="#7a6f60" fontFamily="Inter">Brazil 1872 also counted 0.39m “caboclos” (of Indigenous descent). Total population 9.93m.</text>
        </svg>
        <Cite y={862}>Sources: SlaveVoyages estimates (arrivals); US Census 1860; Recenseamento Geral do Império, 1872 (IBGE). Free Black & pardo = pretos + pardos counted minus enslaved.</Cite>
      </Slide>
    )
  },
  notes: (
    <>
      <h4>The numbers</h4>
      <p>About 389,000 enslaved Africans landed in mainland North America; by 1860 the US had about 3.95 million enslaved people and 0.49 million free Black people. About 4.86 million landed in Brazil; the first national census (1872) counted 1.51 million enslaved people among 9.93 million inhabitants, alongside 3.79 million whites, 3.80 million pardos (mixed) and 1.95 million pretos (Black) — of whom, once the enslaved are subtracted, about 4.25 million were free people of African descent.</p>
      <h4>Why mortality was so high</h4>
      <p>Sugar work, tropical disease in crowded ports, poor nutrition and brutal discipline produced high death rates; skewed sex ratios (often around two men for every woman among arrivals) and low fertility meant the enslaved population could not reproduce itself. Herbert Klein and Francisco Vidal Luna stress that this pattern varied by region and period: in some 19th-century coffee areas, and among creole (Brazilian-born) populations, natural growth was possible. The general rule held while cheap captives were available: reproduction was not where owners invested.</p>
      <h4>Manumission — and what it did and did not mean</h4>
      <p>Brazilian law and custom allowed enslaved people to purchase freedom (often in instalments) and owners to free individuals, frequently in wills. Freed people and their descendants could own property — including slaves. This created a large free population of colour and a society of fine colour gradations rather than the binary “one-drop” rule of the US South.</p>
      <div className="contested"><span className="contested-label">Contested interpretation</span>Frank Tannenbaum (1946) and Gilberto Freyre argued that Iberian law and Catholicism made Brazilian slavery milder. Since the 1960s historians have largely rejected this: mortality was higher in Brazil, and manumission functioned as an incentive that reinforced control, often freeing the old or the favoured while the system as a whole intensified. The debate matters because the “mild slavery” idea fed the later myth of racial democracy (see Act III).</div>
    </>
  ),
  sources: ['klein', 'slavevoyages', 'ibgeHist', 'freyre'],
}

/* ===================== Rio founded ===================== */
const RIO_BAY = { w: -43.245, s: -22.985, e: -43.085, n: -22.85 }
const rioFounded: SlideDef = {
  id: 'rio-founded', act: 'I', short: 'Why Rio is where it is',
  render: () => (
    <Slide theme="paper">
      <At x={640} y={0} w={960} h={900}>
        <MapFrame map="rioCity" w={960} h={900} view={RIO_BAY}>
          {(p) => (
            <>
              <path d={polyline(p, [[-43.1575, -22.9455], [-43.1338, -22.9352]])} stroke={C.brazilwood} strokeWidth={2} strokeDasharray="5 4" />
              <text {...pt(p, -43.146, -22.946)} dy={22} className="map-label sm" fill={C.brazilwood}>the narrow mouth, covered by forts</text>
              <Dot p={p} at={[-43.1566, -22.9493]} label="Sugarloaf" dx={10} dy={14} />
              <Dot p={p} at={[-43.1605, -22.9435]} label="1565 — first camp, Estácio de Sá" fill={C.brazilwood} dx={-10} anchor="end" />
              <Dot p={p} at={[-43.1715, -22.9075]} label="1567 — city moved up Morro do Castelo (razed 1922)" fill={C.brazilwood} dx={-10} anchor="end" />
              <Dot p={p} at={[-43.1648, -22.9112]} label="Villegaignon Is. — French fort, 1555" dx={10} />
              <Dot p={p} at={[-43.1336, -22.9348]} label="Santa Cruz fortress" dx={10} />
              <Dot p={p} at={[-43.124, -22.894]} label="Niterói — Arariboia’s village, 1573" dx={10} />
              <Dot p={p} at={[-43.176, -22.932]} label="Carioca river mouth — fresh water" dx={-10} anchor="end" fill={C.atlantic} />
              <text {...pt(p, -43.155, -22.875)} className="map-label it">Guanabara Bay</text>
              <text {...pt(p, -43.13, -22.975)} className="map-label it">Atlantic</text>
              <text {...pt(p, -43.232, -22.946)} className="map-label caps">Tijuca massif</text>
            </>
          )}
        </MapFrame>
      </At>
      <Header n={11} kicker="Rio · 1555–1567" title={<>Rio was founded to keep the French out — on a bay built for defence</>} w={520} size="sm" />
      <At x={80} y={268} w={520}>
        <p className="body" style={{ fontSize: 15.5 }}>Guanabara is a vast, sheltered, deep-water bay behind a narrow entrance — rare on a coast walled by mountains. In 1555 the French got there first: Nicolas de Villegaignon founded <strong>“France Antarctique”</strong> on an island in the bay, allied with the Tamoio peoples.</p>
        <p className="body" style={{ fontSize: 15.5 }}>The Portuguese answered with Jesuit diplomacy, Indigenous allies and force. Estácio de Sá founded São Sebastião do Rio de Janeiro on <strong>1 March 1565</strong> at the foot of Sugarloaf; after his death from an arrow wound, the city was moved to a defensible hilltop — Morro do Castelo — in 1567.</p>
      </At>
      <At x={80} y={600} w={260}><Img id="franceAntarctique" style={{ width: 260, height: 210 }} contain className="paperbg" credit={false} /></At>
      <At x={360} y={606} w={240}><div className="caption"><b>“La France Antarctique, autrement le Rio Ianeiro”</b> — a French map after the voyages of Villegaignon and Jean de Léry (1557–58). The name means “River of January”: the bay was reportedly taken for a river mouth on 1 January 1502.</div></At>
      <Cite x={80} y={862} w={540}>Map: shaded relief (AWS Terrain Tiles) with IBGE coastline; site positions approximate.</Cite>
    </Slide>
  ),
  notes: (
    <>
      <h4>The site</h4>
      <p>Guanabara Bay is a drowned river valley about 30 km deep from mouth to head, studded with islands and fed by rivers draining the Serra do Mar. It offered what the escarpment coast lacked: anchorage protected from Atlantic swell, a mouth narrow enough to cover with artillery (the forts of Santa Cruz on the Niterói side and São João/Urca on the Rio side still stand), fresh water (the Carioca river), timber, and Indigenous villages to trade with. Its drawback — a narrow strip of flat land between granite hills, swamps and the water — has shaped the city ever since.</p>
      <h4>France Antarctique (1555–1567)</h4>
      <p>Nicolas Durand de Villegaignon, a Knight of Malta with Huguenot backers including Admiral Coligny, built Fort Coligny on the island that now bears his name. The colony mixed Catholics and Calvinists (Geneva sent pastors; Jean de Léry’s account is a classic of ethnography) and quarrelled itself apart over theology. The French relied on the Tupinambá/Tamoio, who were themselves at war with Portuguese-allied peoples.</p>
      <h4>The Portuguese response</h4>
      <p>Governor-general Mem de Sá destroyed Fort Coligny in 1560 but lacked men to hold the bay. The Jesuits Manuel da Nóbrega and José de Anchieta negotiated the Peace of Iperoig (1563) with part of the Tamoio confederation. Mem de Sá’s nephew, Estácio de Sá, established a fortified camp between Sugarloaf and the Cara de Cão hill on 1 March 1565 — the city’s official founding — and fought for two years with Temiminó allies under Arariboia. He was wounded by an arrow in the decisive battle of January 1567 and died weeks later. The city moved to Morro do Castelo, whose summit held the Jesuit college, the cathedral and the fort.</p>
      <h4>The hill that is gone</h4>
      <p>Over the next century the town crept down from the hill onto the flat strip by the water — the Rua Direita (now Rua Primeiro de Março) and what became Praça XV. Morro do Castelo itself was demolished in 1920–22, partly for sanitation and partly to clear space for the 1922 Centennial Exposition. When you stand in the Esplanada do Castelo you are standing where Rio’s founders lived, at the level of the hill’s base.</p>
      <p className="small">The 1 January 1502 naming story is traditional; the exact date and expedition (often attributed to Gaspar de Lemos, possibly with Amerigo Vespucci) are uncertain.</p>
    </>
  ),
  sources: ['abreu', 'hemming', 'staden', 'unescoRio', 'fausto'],
}

/* ===================== Gold ===================== */
const GOLD_VIEW = { w: -50.5, s: -25.2, e: -38.2, n: -16.6 }
const caminhoNovo: LonLat[] = [[-43.2, -22.9], [-43.25, -22.6], [-43.2, -22.45], [-43.29, -22.16], [-43.35, -21.76], [-43.6, -21.45], [-43.77, -21.22], [-43.7, -20.8], [-43.51, -20.39]]
const caminhoVelho: LonLat[] = [[-44.71, -23.22], [-45.0, -23.05], [-45.55, -23.02], [-45.2, -22.8], [-45.0, -22.3], [-44.6, -21.8], [-44.26, -21.13], [-43.85, -20.8], [-43.51, -20.39]]
const gold: SlideDef = {
  id: 'gold', act: 'I', short: 'Gold made Rio the capital',
  render: () => (
    <Slide theme="paper">
      <At x={620} y={0} w={980} h={900}>
        <MapFrame map="brazil" w={980} h={900} view={GOLD_VIEW}>
          {(p) => (
            <>
              <ellipse cx={p(-43.9, -20.4)[0]} cy={p(-43.9, -20.4)[1]} rx={150} ry={110} fill={C.gold} opacity={0.28} filter="url(#soft)" />
              <ellipse cx={p(-43.6, -18.3)[0]} cy={p(-43.6, -18.3)[1]} rx={60} ry={40} fill="#7d9bb5" opacity={0.3} filter="url(#soft)" />
              <path d={polyline(p, caminhoVelho)} fill="none" stroke="#7a6f60" strokeWidth={2.5} strokeDasharray="6 5" />
              <path d={polyline(p, caminhoNovo)} fill="none" stroke={C.brazilwood} strokeWidth={4} className="draw" />
              <text {...pt(p, -42.95, -22.2)} className="map-label sm" fill={C.brazilwood} transform={rot(p, -42.95, -22.2, -68)}>Caminho Novo (c. 1700–25)</text>
              <text {...pt(p, -45.6, -22.3)} className="map-label xs" transform={rot(p, -45.6, -22.3, -62)}>Caminho Velho via Paraty</text>
              <text {...pt(p, -46.3, -19.6)} className="map-label big" fill="#7a5a14">MINAS GERAIS</text>
              <text {...pt(p, -46.3, -19.6)} dy={20} className="map-label xs">gold strikes from the 1690s</text>
              <Dot p={p} at={[-43.51, -20.39]} label="Vila Rica (Ouro Preto)" fill={C.gold} dx={-10} anchor="end" dy={-6} />
              <Dot p={p} at={[-43.41, -20.38]} r={3.5} fill={C.gold} />
              <Dot p={p} at={[-43.81, -19.89]} label="Sabará" fill={C.gold} />
              <Dot p={p} at={[-44.26, -21.13]} label="São João del-Rei" fill={C.gold} dx={-9} anchor="end" />
              <Dot p={p} at={[-43.6, -18.24]} label="Diamantina — diamonds, 1720s" fill="#5d7fa0" />
              <Dot p={p} at={[-43.17, -22.9]} label="Rio de Janeiro — capital from 1763" fill={C.brazilwood} r={7} />
              <Dot p={p} at={[-44.71, -23.22]} label="Paraty" dx={-9} anchor="end" />
              <Dot p={p} at={[-46.63, -23.55]} label="São Paulo" dx={-9} anchor="end" />
              <path d={curve(p(-41.6, -18.0), p(-40.4, -17.0), 0)} stroke="#1f1b16" strokeWidth={1.5} markerEnd="url(#arrow)" />
              <text {...pt(p, -41.8, -17.4)} className="map-label xs" textAnchor="end">to Salvador (capital to 1763)</text>
              <path d={curve(p(-42.6, -23.3), p(-39.0, -24.6), 0.1)} stroke={C.gold} strokeWidth={4} markerEnd="url(#arrow)" />
              <text {...pt(p, -40.6, -23.4)} className="map-label sm" fill="#7a5a14">gold → Lisbon → London</text>
            </>
          )}
        </MapFrame>
      </At>
      <Header n={12} kicker="Gold · 1690s–1760s" title={<>Gold dragged Brazil south and inland — and made Rio the capital</>} w={500} size="sm" />
      <At x={80} y={270} w={500}>
        <p className="body" style={{ fontSize: 15.5 }}>São Paulo’s slave-raiding expeditions found gold in the 1690s in what became Minas Gerais. The result was the largest gold rush the world had yet seen: hundreds of thousands of Portuguese migrants and enslaved Africans poured inland.</p>
        <p className="body" style={{ fontSize: 15.5 }}>The fastest route to the sea ran to <strong>Rio</strong>. The Caminho Novo turned a modest port into the colony’s main outlet for gold and its main market for slaves, and in <strong>1763</strong> the capital moved from Salvador to Rio.</p>
        <p className="body" style={{ fontSize: 15.5 }}>Colonial Brazil’s population grew roughly tenfold over the century, to about 3 million.</p>
      </At>
      <At x={80} y={634} w={500} className="rise d3">
        <Img id="ouroPreto" style={{ width: 500, height: 190 }} pos="50% 55%" credit="br" />
      </At>
      <Cite x={80} y={862} w={520}>Ouro Preto (Vila Rica): baroque churches built on gold. Routes drawn approximately after FGV Atlas Histórico.</Cite>
    </Slide>
  ),
  notes: (
    <>
      <h4>Bandeirantes</h4>
      <p>The paulistas who found the gold were the bandeirantes — frontiersmen, often of mixed Portuguese-Indigenous descent and Tupi-speaking, whose expeditions (bandeiras) hunted Indigenous captives across the interior. In 1628–31 they destroyed the Jesuit missions of Guairá, enslaving tens of thousands of Guarani. São Paulo later celebrated them as heroic pathfinders (the enormous Monument to the Bandeiras in Ibirapuera Park dates from 1953); today their legacy is fiercely contested.</p>
      <h4>The rush</h4>
      <p>Strikes around Ouro Preto, Mariana and Sabará from the mid-1690s set off a rush that depopulated parts of Portugal and the sugar coast. The newcomers (emboabas) fought the paulistas in the War of the Emboabas (1707–09); the defeated paulistas pushed further west and found gold in Cuiabá (1719) and Goiás (1720s). Diamonds were found near Diamantina in the 1720s; the Crown made the district a closely policed monopoly.</p>
      <div className="contested"><span className="contested-label">Contested numbers</span>How much gold? Registered output (subject to the royal fifth, the <em>quinto</em>, collected at royal smelting houses) peaked around the 1730s–1750s. Virgílio Noya Pinto’s estimates imply roughly 800–1,000 tonnes over the century, with heavy smuggling making any figure a floor. The once-popular claim that Brazilian gold “financed the Industrial Revolution” is overstated; it certainly flowed in large quantities through Lisbon to London under the 1703 Methuen Treaty trade, strengthening Britain’s monetary base and trade balance.</div>
      <h4>Why the capital moved</h4>
      <p>By the mid-18th century Rio handled gold exports, slave imports for Minas, and the provisioning of the mining towns, and it was the military key to the contested southern frontier with Spain (the Colônia do Sacramento on the River Plate). The transfer of the viceroy’s seat from Salvador to Rio in 1763 recognised that the colony’s centre of gravity had moved south.</p>
      <h4>Gold and rebellion</h4>
      <p>As output fell, the Crown’s demands did not. The threat of a <em>derrama</em> — a forced levy to cover arrears in the gold tax — prompted the Inconfidência Mineira (1789), a conspiracy of Minas elites inspired partly by the American Revolution. It was betrayed; the one conspirator of modest status, the militia ensign Joaquim José da Silva Xavier, “Tiradentes,” was hanged in Rio on 21 April 1792. The Republic later made him a national martyr; 21 April is a national holiday, and Brasília was inaugurated on that date in 1960.</p>
      <h4>What you can see in Rio</h4>
      <p>Gold financed the gilded interiors of Rio’s colonial churches — the Mosteiro de São Bento and the Igreja de São Francisco da Penitência are among the most spectacular — and the Carioca Aqueduct (the Arcos da Lapa), completed around 1750 to bring water to a city that gold had made populous.</p>
    </>
  ),
  sources: ['boxerGold', 'russellWood', 'pinto', 'fausto', 'abreu'],
}

/* ===================== Evolving map ===================== */
interface EraStep { year: string; title: string; text: string; metric: string; color: string; capital: LonLat; capitalName: string }
const eraSteps: EraStep[] = [
  { year: 'c. 1570', title: 'A coastal archipelago', text: 'A string of fortified sugar and brazilwood settlements, each closer to Lisbon than to its neighbours by land. Inland, Indigenous peoples still controlled almost everything.', metric: 'Colonists: a few tens of thousands', color: C.brazilwood, capital: [-38.5, -12.97], capitalName: 'Salvador' },
  { year: 'c. 1650', title: 'The sugar coast — and the Dutch', text: 'Pernambuco and Bahia make Brazil the world’s sugar giant. The Dutch hold the northeast coast 1630–54. From São Paulo, slave-raiding expeditions strike deep into Spanish-claimed land.', metric: 'Sugar dominates exports', color: C.sugar, capital: [-38.5, -12.97], capitalName: 'Salvador' },
  { year: 'c. 1760', title: 'Gold, and a claim to the west', text: 'Mining towns in Minas, Goiás and Mato Grosso. The Treaty of Madrid (1750) accepts Portuguese occupation far beyond Tordesillas. In 1763 the capital moves to Rio.', metric: 'Population ≈ 1.5–2 million (est.)', color: C.gold, capital: [-43.17, -22.9], capitalName: 'Rio de Janeiro' },
  { year: 'c. 1860', title: 'Coffee and the Court', text: 'Coffee climbs the Paraíba valley behind Rio, worked by enslaved Africans. Rio is an imperial capital; the old sugar northeast stagnates. The first railways run inland from Rio.', metric: 'Population 9.9 million (1872 census)', color: C.coffee, capital: [-43.17, -22.9], capitalName: 'Rio (imperial capital)' },
  { year: 'c. 1920', title: 'São Paulo’s railways — and the rubber bubble', text: 'Coffee pushes west across São Paulo on British-built railways, worked now by European immigrants. Manaus booms and busts on Amazon rubber. Brazil buys Acre from Bolivia (1903).', metric: 'Population 30.6 million (1920 census)', color: C.industry, capital: [-43.17, -22.9], capitalName: 'Rio (federal capital)' },
  { year: '2020s', title: 'Brasília, soy, and offshore oil', text: 'A planned inland capital (1960), an agribusiness frontier across the Cerrado, and deep-water “pre-salt” oil off Rio and São Paulo. But people and money remain concentrated in the southeast.', metric: 'Population 203 million (2022 census)', color: C.agro, capital: [-47.88, -15.79], capitalName: 'Brasília' },
]
const settlements1570: [LonLat, string][] = [[[-46.39, -23.96], 'São Vicente 1532'], [[-34.85, -8.01], 'Olinda 1535'], [[-38.5, -12.97], 'Salvador 1549'], [[-46.63, -23.55], 'São Paulo 1554'], [[-43.17, -22.9], 'Rio 1565'], [[-39.06, -16.45], 'Porto Seguro'], [[-39.05, -14.79], 'Ilhéus'], [[-40.34, -20.32], 'Vitória']]
const metros: [LonLat, string, number][] = [[[-46.63, -23.55], 'São Paulo', 21], [[-43.17, -22.9], 'Rio', 12.5], [[-43.94, -19.92], 'Belo Horizonte', 6], [[-47.88, -15.79], 'Brasília', 4.6], [[-51.23, -30.03], 'Porto Alegre', 4.3], [[-38.53, -3.73], 'Fortaleza', 4], [[-34.88, -8.05], 'Recife', 4], [[-38.5, -12.97], 'Salvador', 3.9], [[-49.27, -25.43], 'Curitiba', 3.7], [[-60.02, -3.12], 'Manaus', 2.6], [[-48.5, -1.45], 'Belém', 2.5], [[-49.25, -16.68], 'Goiânia', 2.6]]

const evolving: SlideDef = {
  id: 'evolving-map', act: 'I', short: 'The centre of gravity keeps moving', steps: 6,
  render: (step) => {
    const e = eraSteps[step]
    return (
      <Slide theme="paper">
        <At x={0} y={0} w={900} h={900}>
          <MapFrame map="brazil" w={900} h={900} view={BR_VIEW} fit="contain">
            {(p) => (
              <>
                <Neighbors p={p} />
                <BrazilOutline p={p} stroke="rgba(31,27,22,0.5)" width={1.2} dash="4 3" />
                {step <= 1 && <line x1={p(TORD, 0)[0]} x2={p(TORD, 0)[0]} y1={0} y2={900} stroke={C.brazilwood} strokeWidth={1.6} strokeDasharray="8 6" opacity={0.8} />}
                {step <= 1 && <text x={p(TORD, 0)[0] + 8} y={40} className="map-label sm" fill={C.brazilwood}>Tordesillas (approx.)</text>}
                {step === 0 && (
                  <>
                    {settlements1570.map(([at, n]) => <Dot key={n} p={p} at={at} label={n} r={4.5} fill={C.brazilwood} dx={-8} anchor="end" dy={n.startsWith('São Vicente') ? 16 : n.startsWith('São Paulo') ? -4 : 4} />)}
                    <text {...pt(p, -55, -10)} className="map-label caps">Indigenous Brazil</text>
                  </>
                )}
                {step === 1 && (
                  <>
                    <ellipse cx={p(-36.5, -9.5)[0]} cy={p(-36.5, -9.5)[1]} rx={70} ry={150} fill={C.sugar} opacity={0.35} filter="url(#soft)" transform={rot(p, -36.5, -9.5, -25)} />
                    <path d={polyline(p, [[-44.3, -2.5], [-40, -2.9], [-37.3, -4.7], [-35.2, -5.6], [-34.9, -8.0], [-35.7, -9.7], [-37.0, -10.9]])} fill="none" stroke="#e08a2b" strokeWidth={6} opacity={0.75} />
                    <text {...pt(p, -40.6, -5.5)} className="map-label sm" fill="#a35a10">Dutch Brazil 1630–54</text>
                    <Dot p={p} at={[-34.88, -8.05]} label="Recife" fill={C.sugar} />
                    <Dot p={p} at={[-38.5, -12.97]} label="Salvador" fill={C.sugar} />
                    <Dot p={p} at={[-48.5, -1.45]} label="Belém 1616" />
                    <Dot p={p} at={[-44.3, -2.53]} label="São Luís" />
                    <Dot p={p} at={[-46.63, -23.55]} label="São Paulo" dx={-8} anchor="end" />
                    <path d={curve(p(-46.6, -23.5), p(-53.5, -24.2), 0.2)} stroke="#1f1b16" strokeWidth={2} fill="none" markerEnd="url(#arrow)" />
                    <path d={curve(p(-46.6, -23.5), p(-49.5, -15.5), -0.2)} stroke="#1f1b16" strokeWidth={2} fill="none" markerEnd="url(#arrow)" />
                    <text {...pt(p, -53.5, -21)} className="map-label xs">bandeiras: slave raids</text>
                  </>
                )}
                {step === 2 && (
                  <>
                    <path d={p.path(brazil)} fill={C.gold} opacity={0.08} />
                    <ellipse cx={p(-44, -20)[0]} cy={p(-44, -20)[1]} rx={90} ry={70} fill={C.gold} opacity={0.45} filter="url(#soft)" />
                    <Dot p={p} at={[-43.51, -20.39]} label="Ouro Preto" fill={C.gold} />
                    <Dot p={p} at={[-56.1, -15.6]} label="Cuiabá 1719" fill={C.gold} />
                    <Dot p={p} at={[-50.14, -15.93]} label="Vila Boa (Goiás)" fill={C.gold} />
                    <Dot p={p} at={[-57.84, -34.47]} label="Colônia do Sacramento" dx={-8} anchor="end" />
                    <path d={polyline(p, [[-46.6, -23.5], [-48.5, -22.8], [-51.3, -20.7], [-53.5, -19.5], [-55.5, -17.5], [-56.1, -15.7]])} fill="none" stroke="#2f5d74" strokeWidth={2} strokeDasharray="4 3" />
                    <text {...pt(p, -55, -20.2)} className="map-label xs">river convoys (monções)</text>
                    <text {...pt(p, -64, -12.5)} className="map-label sm">Treaty of Madrid 1750:</text>
                    <text {...pt(p, -64, -12.5)} dy={16} className="map-label xs">“uti possidetis” — land to whoever occupies it</text>
                  </>
                )}
                {step === 3 && (
                  <>
                    <ellipse cx={p(-44, -22.4)[0]} cy={p(-44, -22.4)[1]} rx={80} ry={38} fill={C.coffee} opacity={0.5} filter="url(#soft)" transform={rot(p, -44, -22.4, -20)} />
                    <text {...pt(p, -46.2, -21.1)} className="map-label sm" fill={C.coffee}>Paraíba valley coffee</text>
                    <ellipse cx={p(-36.5, -9.5)[0]} cy={p(-36.5, -9.5)[1]} rx={50} ry={110} fill={C.sugar} opacity={0.18} filter="url(#soft)" />
                    <text {...pt(p, -40.8, -9.5)} className="map-label xs">declining sugar NE</text>
                    <path d={polyline(p, [[-43.17, -22.9], [-43.5, -22.6], [-43.7, -22.45], [-44.1, -22.4]])} stroke="#1f1b16" strokeWidth={2.5} fill="none" />
                    <text {...pt(p, -54, -30.5)} className="map-label xs">Farroupilha revolt 1835–45</text>
                  </>
                )}
                {step === 4 && (
                  <>
                    <ellipse cx={p(-48.5, -21.8)[0]} cy={p(-48.5, -21.8)[1]} rx={110} ry={60} fill={C.coffee} opacity={0.45} filter="url(#soft)" />
                    {[[[-46.33, -23.96], [-46.63, -23.55], [-47.06, -22.9], [-47.81, -21.18]], [[-46.63, -23.55], [-48.5, -22.5], [-49.06, -22.31], [-51.4, -22.1]], [[-47.06, -22.9], [-47.4, -22.3], [-48.6, -21.0]], [[-43.17, -22.9], [-43.35, -21.76], [-43.94, -19.92]], [[-43.17, -22.9], [-44.5, -22.5], [-45.5, -23.0], [-46.63, -23.55]]].map((l, i) => (
                      <path key={i} d={polyline(p, l as LonLat[])} stroke="#1f1b16" strokeWidth={2} fill="none" />
                    ))}
                    <text {...pt(p, -52.2, -21.0)} className="map-label sm" fill={C.coffee}>São Paulo coffee frontier</text>
                    <Dot p={p} at={[-60.02, -3.12]} label="Manaus — rubber boom" fill={C.rubber} />
                    <Dot p={p} at={[-67.8, -9.97]} label="Acre, 1903" />
                    <Dot p={p} at={[-51.18, -29.17]} label="Italian & German colonies" r={4} fill={C.industry} />
                    <Dot p={p} at={[-46.63, -23.55]} label="São Paulo" fill={C.industry} r={6} dx={-9} anchor="end" />
                  </>
                )}
                {step === 5 && (
                  <>
                    <ellipse cx={p(-54.5, -13.5)[0]} cy={p(-54.5, -13.5)[1]} rx={130} ry={90} fill={C.agro} opacity={0.4} filter="url(#soft)" />
                    <text {...pt(p, -58.5, -12.2)} className="map-label sm" fill="#5c6a1c">soy & cattle frontier</text>
                    <ellipse cx={p(-42.3, -24.8)[0]} cy={p(-42.3, -24.8)[1]} rx={60} ry={22} fill="#1f1b16" opacity={0.35} filter="url(#soft6)" />
                    <text {...pt(p, -42.3, -25.9)} className="map-label xs" textAnchor="middle">pre-salt oil</text>
                    {metros.map(([at, n, v]) => {
                      const [x, y] = p(at[0], at[1])
                      return (
                        <g key={n}>
                          <circle cx={x} cy={y} r={Math.sqrt(v) * 5.2} fill={C.brazilwood} opacity={0.35} stroke={C.brazilwood} />
                          <text x={x + Math.sqrt(v) * 5.2 + 3} y={y + 4} className="map-label xs">{n}</text>
                        </g>
                      )
                    })}
                    <text {...pt(p, -73.5, -31.5)} className="map-label xs">circles: metro populations, millions (approx.)</text>
                  </>
                )}
                {/* capital star */}
                {(() => {
                  const [x, y] = p(e.capital[0], e.capital[1])
                  return (
                    <g>
                      <circle cx={x} cy={y} r={11} fill="none" stroke="#1f1b16" strokeWidth={2} />
                      <circle cx={x} cy={y} r={4} fill="#1f1b16" />
                    </g>
                  )
                })()}
              </>
            )}
          </MapFrame>
        </At>
        <At x={960} y={64} w={570}>
          <div className="kicker"><span className="k-num">13</span><span className="k-rule" />Signature map · step {step + 1} of 6</div>
          <h1 className="title sm" style={{ marginTop: 12 }}>The centre of gravity kept moving — <em>and Brazil followed it</em></h1>
        </At>
        <At x={960} y={290} w={570}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 26 }}>
            {eraSteps.map((s, i) => (
              <div key={i} style={{ flex: 1, height: 5, background: i === step ? s.color : i < step ? `${s.color}88` : 'rgba(0,0,0,0.1)' }} />
            ))}
          </div>
          <div key={step} className="rise">
            <div className="mono" style={{ fontSize: 16, color: e.color, fontWeight: 500 }}>{e.year}</div>
            <div className="serif" style={{ fontSize: 40, fontWeight: 600, lineHeight: 1.05, marginTop: 6, color: 'var(--text)' }}>{e.title}</div>
            <p className="body" style={{ fontSize: 17, marginTop: 16 }}>{e.text}</p>
            <div style={{ display: 'flex', gap: 30, marginTop: 22 }}>
              <div><div className="label">Capital</div><div className="serif" style={{ fontSize: 22, fontWeight: 600 }}>◎ {e.capitalName}</div></div>
              <div><div className="label">Scale</div><div style={{ fontSize: 15, marginTop: 4 }}>{e.metric}</div></div>
            </div>
          </div>
        </At>
        <At x={960} y={790} w={570}><div className="small">Press → to step through six moments. Dashed outline: today’s borders, for orientation. Zones are schematic.</div></At>
      </Slide>
    )
  },
  notes: (
    <>
      <p>This map makes one argument: <strong>each export cycle created a new core region, and political power followed the money with a lag</strong>. Old cores did not disappear; they became the regions with the deepest inequality and the most entrenched elites.</p>
      <ul>
        <li><strong>c. 1570.</strong> Settlement was coastal and discontinuous. Each captaincy faced the sea.</li>
        <li><strong>c. 1650.</strong> The sugar Northeast is the economic heart; Salvador is the capital. The Dutch period shows how contested the coast was. Paulista bandeiras push inland, ignoring Tordesillas, mostly to capture Indigenous people.</li>
        <li><strong>c. 1760.</strong> Gold relocates the economy to Minas Gerais and the capital to Rio (1763). Portuguese diplomacy — led by the Brazilian-born Alexandre de Gusmão — wins the Treaty of Madrid (1750), which replaced Tordesillas with the principle that land belongs to whoever effectively occupies it. Gusmão used maps that, conveniently, understated how far west Portuguese settlements lay. Later treaties (1761, 1777) partly unwound Madrid, but the broad outline held.</li>
        <li><strong>c. 1860.</strong> Coffee, grown by enslaved Africans in the Paraíba valley between Rio and São Paulo, is the Empire’s economic base. The sugar Northeast declines relatively; it begins exporting enslaved people south through an internal slave trade after 1850.</li>
        <li><strong>c. 1920.</strong> The coffee frontier has moved into western São Paulo along railways; immigrants replace enslaved workers. São Paulo becomes the industrial centre. The Amazon rubber boom (c. 1879–1912) made Manaus briefly one of the richest cities in the Americas until Asian plantations, grown from seeds taken from Brazil in 1876, undercut it. The Baron of Rio Branco’s diplomacy settled almost all remaining borders by negotiation and arbitration, including the purchase of Acre from Bolivia (Treaty of Petrópolis, 1903).</li>
        <li><strong>Today.</strong> Brasília (1960) and the agricultural conquest of the Cerrado — made possible by Embrapa’s soil science from the 1970s — moved activity into the Centre-West. Offshore “pre-salt” oil since 2006 has made the Southeast coast an energy province. Yet the Southeast still holds about 42% of the population and roughly half of GDP.</li>
      </ul>
      <p className="small">Population estimates before 1872 are reconstructions with wide margins (Indigenous people outside colonial society were rarely counted).</p>
    </>
  ),
  sources: ['fgvAtlas', 'cortesao', 'boxerGold', 'furtado', 'ibgeCensus'],
}

export const act1Slides = [divider, geography, indigenous, portugal, sugar, southAtlantic, demography, rioFounded, gold, evolving]
export { Dot, Rivers, Neighbors, pt, rot, BR_VIEW }
