import type { SlideDef } from '../types'
import { Slide, At } from '../components/Slide'
import { Img } from '../components/Img'
import { MapFrame } from '../components/MapFrame'
import { Header, Cite, C } from './common'
import { ActDivider } from './divider'
import { Dot, BrazilOutline, Neighbors, pt, BR_VIEW } from './act1'

/* ===================== Divider ===================== */
const divider: SlideDef = {
  id: 'act2', act: 'II', short: 'Act II — An Empire in the Tropics',
  render: () => (
    <ActDivider numeral="II" title="An Empire in the Tropics" span="1808 – 1889" image="taunayGloria" pos="50% 50%" highlight={[1808, 1889]} color="#d39bbb"
      question="Why did Brazil become an independent monarchy rather than a republic — and why did it hold on to slavery longer than anyone else?" />
  ),
  notes: (
    <>
      <p>Act II runs from the arrival of the Portuguese court in Rio (1808) to the fall of the monarchy (1889). It is the period when Brazil acquired its territorial unity, its political class, its capital-city culture, and the coffee-and-slavery economy that underwrote the Empire.</p>
      <p><strong>Image:</strong> Nicolas-Antoine Taunay, <em>View of Glória beach and church</em> (1816–17). Taunay came with the French Artistic Mission of 1816. The baroque church of Nossa Senhora da Glória do Outeiro (1739) still crowns its hill above the Aterro do Flamengo — but the beach in the painting is gone, buried by 20th-century landfill.</p>
    </>
  ),
}

/* ===================== The court ===================== */
const court: SlideDef = {
  id: 'court', act: 'II', short: 'An empire ruled from its colony',
  render: () => (
    <Slide theme="paper">
      <Img id="aclamacaoJoao" style={{ position: 'absolute', left: 820, top: 0, width: 780, height: 560 }} pos="50% 50%" credit="br" />
      <At x={820} y={572} w={700}>
        <div className="caption"><b>Debret, the acclamation of João VI, Rio, 6 February 1818</b> — staged at the Paço on what is now Praça XV, the only time a reigning European monarch was acclaimed in the Americas.</div>
      </At>
      <Header n={15} kicker="Rio · 1808–1821" title={<>A European empire came to be governed <em>from its colony</em></>} w={680} size="md" />
      <At x={80} y={300} w={680}>
        <p className="body">In November 1807, as Napoleon’s army closed on Lisbon, the Prince Regent João sailed for Brazil under British naval escort with the royal family, the government and thousands of courtiers. In March 1808 they landed in Rio.</p>
        <p className="body">A colonial port became an imperial capital almost overnight. Its population roughly doubled in about a decade; the colony’s ports were opened to foreign — above all British — trade, ending three centuries of Portuguese monopoly.</p>
      </At>
      <At x={80} y={560} w={700}>
        <div className="label" style={{ marginBottom: 10 }}>Created in Rio by the court — most still exist</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 26px', fontSize: 15 }}>
          {[['1808', 'Banco do Brasil'], ['1808', 'Royal Press & first newspaper'], ['1808', 'Botanical Garden'], ['1810', 'Royal Library (now Biblioteca Nacional)'], ['1810', 'Military Academy'], ['1816', 'French Artistic Mission → Academy of Fine Arts']].map(([y, t]) => (
            <div key={t} style={{ display: 'flex', gap: 10 }}><span className="mono" style={{ color: C.empire, fontSize: 13, paddingTop: 2 }}>{y}</span><span>{t}</span></div>
          ))}
        </div>
      </At>
      <At x={820} y={660} w={700}>
        <div style={{ display: 'flex', gap: 30 }}>
          <div><div className="big-num" style={{ color: C.empire, fontSize: 46 }}>1815</div><div className="small" style={{ maxWidth: 200 }}>Brazil raised to a kingdom co-equal with Portugal</div></div>
          <div><div className="big-num" style={{ color: C.empire, fontSize: 46 }}>1820</div><div className="small" style={{ maxWidth: 260 }}>Liberals in Porto, furious at being “a colony of a colony,” demand the king’s return</div></div>
        </div>
      </At>
      <Cite y={862} w={700}>Dates: Wilcken (2004); Schultz (2001). Court size is contested — see notes.</Cite>
    </Slide>
  ),
  notes: (
    <>
      <h4>Why the court moved</h4>
      <p>Portugal was trapped between Napoleon’s Continental System and its old alliance with Britain. When French troops under Junot marched on Lisbon in November 1807, the Regent João (his mother, Queen Maria I, was mentally ill) carried out a plan discussed for decades: move the seat of the monarchy to Brazil, the empire’s richest part. The fleet left on 29 November 1807, escorted by the Royal Navy; Britain’s price was commercial access.</p>
      <div className="contested"><span className="contested-label">Contested numbers</span>The court is traditionally said to have brought 10,000–15,000 people. Nireu Cavalcanti and others argue from ship capacities and passenger lists that the figure was far smaller — perhaps a few thousand. Either way, the newcomers were a large, privileged and demanding minority in a city of perhaps 50,000–60,000.</div>
      <h4>What changed in Rio</h4>
      <ul>
        <li><strong>Housing.</strong> Officials requisitioned the best houses under the right of <em>aposentadoria</em>, marking doors “P.R.” (Príncipe Regente) — which cariocas read as “Ponha-se na Rua” (“Get out into the street”).</li>
        <li><strong>The palace.</strong> The court occupied the viceroy’s palace (the Paço, Praça XV) and then the Quinta da Boa Vista in São Cristóvão — donated by Elias Antônio Lopes, a merchant enriched by the slave trade. The palace later became the National Museum, devastated by fire in 2018.</li>
        <li><strong>Institutions.</strong> A bank, a press (printing had been banned in the colony), libraries, academies, a botanical garden where the imperial palms descend from a single “palma mater” planted by João in 1809.</li>
        <li><strong>Trade.</strong> The 1808 opening of the ports and the 1810 treaty with Britain — which gave British goods a 15% tariff, lower than Portugal’s own 16% — made Rio a commercial hub tied to London.</li>
      </ul>
      <h4>The inversion</h4>
      <p>In December 1815 Brazil became a kingdom within the United Kingdom of Portugal, Brazil and the Algarves. Portuguese at home now complained that Portugal had become a dependency of its colony. The Liberal Revolution in Porto (1820) demanded a constitution and the king’s return. João VI left in April 1821, reportedly advising his son Pedro to take the Brazilian crown himself rather than let “some adventurer” do it — a remark that may be apocryphal but captures the logic of what followed.</p>
    </>
  ),
  sources: ['wilcken', 'schultz', 'cavalcanti', 'barman', 'fausto'],
}

/* ===================== Independence ===================== */
const independence: SlideDef = {
  id: 'independence', act: 'II', short: 'Independence by dynastic split',
  render: () => (
    <Slide theme="paper">
      <Img id="independenciaOuMorte" style={{ position: 'absolute', left: 0, top: 0, width: 760, height: 520 }} pos="50% 45%" credit="bl" />
      <At x={0} y={528} w={760} style={{ padding: '0 30px 0 80px' }}>
        <div className="caption"><b>Pedro Américo, <em>Independência ou Morte!</em> (1888)</b> — painted 66 years after the event as national myth. Witnesses suggest the prince, suffering from an upset stomach, was riding a mule.</div>
      </At>
      <Header x={820} n={16} kicker="1821–1825" title={<>Independence came as a <em>dynastic split</em>, not a revolution</>} w={700} size="sm" />
      <At x={820} y={258} w={700}>
        <p className="body" style={{ fontSize: 15.5 }}>When Lisbon’s new parliament tried to reverse Rio’s status, Brazil’s elites rallied around the heir who had stayed behind. On 7 September 1822 Pedro declared independence near São Paulo; in December he was crowned Emperor in Rio. Portugal recognised it in 1825 — after Britain brokered a deal in which Brazil took over £2 million of Portuguese debt.</p>
        <p className="body" style={{ fontSize: 15.5 }}>It was not bloodless — there was real fighting in Bahia, Maranhão and Pará — but the state, the dynasty and the social order survived intact.</p>
      </At>
      <At x={820} y={520} w={700}>
        <div className="label" style={{ marginBottom: 12 }}>Why the two empires ended so differently</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div className="card">
            <h5>Spanish America</h5>
            <p>1808: Napoleon captures the Spanish king. Legitimacy collapses; local juntas, civil wars (1810–25). Four viceroyalties and many audiencias become 18 republics.</p>
          </div>
          <div className="card" style={{ borderColor: C.empire }}>
            <h5 style={{ color: C.empire }}>Portuguese America</h5>
            <p>1808: the king escapes to Rio with the state. One court, one treasury, one army — and an heir in place to claim the whole territory as a single empire.</p>
          </div>
        </div>
        <p className="small" style={{ marginTop: 12 }}>Slaveholding elites also wanted continuity: a monarchy promised order at a time when Haiti’s revolution (1791–1804) haunted every plantation society.</p>
      </At>
      <Cite x={820} y={862} w={700}>Barman (1988); Carvalho, A Construção da Ordem; Fausto & Fausto (2014).</Cite>
    </Slide>
  ),
  notes: (
    <>
      <h4>The sequence</h4>
      <ul>
        <li><strong>1820–21:</strong> The Porto revolution convenes the Cortes in Lisbon; João VI returns (April 1821), leaving Pedro as regent.</li>
        <li><strong>Late 1821:</strong> The Cortes order Pedro home and begin dismantling the institutions created in Rio — which Brazilian elites read as “recolonisation.”</li>
        <li><strong>9 January 1822 — the “Fico”:</strong> petitioned by Rio, São Paulo and Minas notables, Pedro announces he will stay.</li>
        <li><strong>7 September 1822:</strong> on the banks of the Ipiranga stream near São Paulo, receiving dispatches from Lisbon, Pedro declares “Independence or death.”</li>
        <li><strong>12 October / 1 December 1822:</strong> acclaimed and then crowned Emperor in Rio.</li>
        <li><strong>1823:</strong> Portuguese garrisons expelled from Salvador (2 July — still Bahia’s great civic holiday), São Luís and Belém, with help from the British mercenary admiral Thomas Cochrane.</li>
        <li><strong>1825:</strong> Treaty of Rio de Janeiro, mediated by Britain: Portugal recognises independence; Brazil assumes Portuguese debt (about £1.4m to British creditors plus compensation to João VI, about £2m in all). Britain, in return, extracts a treaty (1826–27) committing Brazil to end the slave trade.</li>
      </ul>
      <h4>Why a monarchy?</h4>
      <p>José Murilo de Carvalho’s influential answer stresses the elite: Brazil’s ruling class was small, trained largely at Coimbra in law, and socialised into royal service. It saw the Braganza heir as the guarantor of unity, order and property — above all property in people. A republic risked regional fragmentation and popular mobilisation, and the Haitian Revolution made slaveholders fearful of both. The dynasty also offered legitimacy that no Brazilian strongman possessed.</p>
      <p>The constitution of 1824 — imposed by Pedro after he dissolved an elected constituent assembly — created a “moderating power” (inspired by Benjamin Constant) that let the emperor appoint ministers, dissolve the Chamber and choose senators for life from three-name lists. It lasted until 1889, longer than any Brazilian constitution since.</p>
      <h4>The painting</h4>
      <p>Pedro Américo’s canvas was commissioned for the Museu Paulista in São Paulo and finished in Florence in 1888. It gives the prince a heroic white horse and dragoons in dress uniform; accounts by members of the party suggest a smaller, dustier scene. It is a superb document — of how the late Empire wanted its founding remembered.</p>
    </>
  ),
  sources: ['barman', 'carvalhoOrdem', 'fausto', 'schwarcz'],
}

/* ===================== Unity not destiny ===================== */
const revolts: { at: [number, number]; name: string; years: string; note: string; dx?: number; anchor?: 'start' | 'end'; dy?: number }[] = [
  { at: [-48.5, -1.45], name: 'Cabanagem', years: '1835–40', note: 'Pará; tens of thousands dead' },
  { at: [-43.36, -4.86], name: 'Balaiada', years: '1838–41', note: 'Maranhão', dy: 18 },
  { at: [-34.88, -8.05], name: 'Pernambuco', years: '1817 · 1824 · 1848', note: 'republican revolts', dx: -10, anchor: 'end' },
  { at: [-38.5, -12.97], name: 'Malês · Sabinada', years: '1835 · 1837–38', note: 'Salvador', dx: -10, anchor: 'end' },
  { at: [-53.1, -31.45], name: 'Farroupilha', years: '1835–45', note: '“Riograndense Republic”', dx: -10, anchor: 'end' },
  { at: [-56.17, -34.9], name: 'Cisplatina → Uruguay', years: '1828', note: 'the one that got away', dx: 10, dy: -14 },
]
const unity: SlideDef = {
  id: 'unity', act: 'II', short: 'Unity was not destiny',
  render: () => (
    <Slide theme="paper">
      <At x={0} y={0} w={760} h={900}>
        <MapFrame map="brazil" w={760} h={900} view={BR_VIEW} fit="contain">
          {(p) => (
            <>
              <Neighbors p={p} />
              <BrazilOutline p={p} stroke="rgba(31,27,22,0.6)" />
              {revolts.map((r) => {
                const [x, y] = p(r.at[0], r.at[1])
                const anchor = r.anchor ?? 'start'
                const dx = r.dx ?? 12
                return (
                  <g key={r.name}>
                    <circle cx={x} cy={y} r={16} fill={C.brazilwood} opacity={0.18} />
                    <circle cx={x} cy={y} r={6} fill={C.brazilwood} stroke="#fff" strokeWidth={1.5} />
                    <text x={x + dx} y={y + (r.dy ?? 0)} className="map-label" textAnchor={anchor}>{r.name}</text>
                    <text x={x + dx} y={y + (r.dy ?? 0) + 15} className="map-label xs" textAnchor={anchor}>{r.years} · {r.note}</text>
                  </g>
                )
              })}
              <Dot p={p} at={[-43.17, -22.9]} label="Rio — the Court" fill="#1f1b16" r={7} />
              <text {...pt(p, -73.5, 4.5)} className="map-label caps">Major revolts against Rio, 1817–1849</text>
            </>
          )}
        </MapFrame>
      </At>
      <Header x={820} n={17} kicker="The question of unity" title={<>Unity was not destiny: the Empire had to <em>hold</em> Brazil together</>} w={700} size="sm" />
      <At x={820} y={258} w={700}>
        <p className="body" style={{ fontSize: 15.5 }}>After Pedro I abdicated in 1831, leaving a five-year-old heir, a decade of regency nearly broke the country apart. Uruguay did break away. Historians weigh several explanations for why the rest held:</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 14 }}>
          {[
            ['An elite of one mould', 'Coimbra-trained magistrates and bureaucrats rotated across provinces, forming a national ruling class.'],
            ['Fear as glue', 'Provincial slaveholders needed a strong central army against slave revolt — as Salvador’s Malê uprising (1835) showed.'],
            ['A crown worth joining', 'Rio’s court distributed titles, offices and credit; the 1840 coronation of the 14-year-old Pedro II restored a symbol of unity.'],
            ['Force', 'The army and National Guard, under commanders like Caxias, crushed revolts one by one.'],
          ].map(([h, b]) => (
            <div key={h} className="card" style={{ padding: '12px 14px' }}>
              <h5 style={{ fontSize: 20 }}>{h}</h5>
              <p style={{ fontSize: 13.5 }}>{b}</p>
            </div>
          ))}
        </div>
      </At>
      <Cite x={820} y={862} w={700}>Carvalho, A Construção da Ordem; Barman (1988). Locations approximate.</Cite>
    </Slide>
  ),
  notes: (
    <>
      <p>Brazil’s territorial unity is often presented as inevitable. It was not. The 1830s saw revolts in almost every corner, with very different social bases:</p>
      <ul>
        <li><strong>Cabanagem (Pará, 1835–40)</strong> — the most radical: poor mestiços, Indigenous people and freed slaves briefly seized Belém. Repression and fighting killed perhaps 30,000–40,000 people, a large share of the province’s population (estimates vary widely).</li>
        <li><strong>Farroupilha (Rio Grande do Sul, 1835–45)</strong> — a ranchers’ revolt over taxes on jerked beef that declared an independent republic and lasted a decade. It ended in negotiated amnesty, not defeat. Giuseppe Garibaldi fought for it.</li>
        <li><strong>Revolt of the Malês (Salvador, 1835)</strong> — a carefully planned uprising led by Muslim enslaved and freed Africans, mostly Yoruba (Nagô) and Hausa. It was suppressed within hours, but it terrified slaveholders across Brazil.</li>
        <li><strong>Sabinada (Salvador, 1837–38)</strong> and <strong>Balaiada (Maranhão, 1838–41)</strong>, and in Pernambuco the republican revolts of 1817, the Confederation of the Equator (1824) and the Praieira (1848).</li>
        <li><strong>Cisplatina</strong> — the territory (today’s Uruguay) annexed by Portugal in 1821 rebelled, Argentina intervened, and after a stalemated war Britain mediated the creation of an independent Uruguay in 1828.</li>
      </ul>
      <div className="contested"><span className="contested-label">Competing explanations</span>
        <p>José Murilo de Carvalho emphasises elite homogeneity and the state’s capacity to train and circulate a national elite. Others stress slavery: decentralisation was attractive in theory, but regional elites recoiled from the social upheaval that separatist wars could unleash. Ilmar Rohloff de Mattos highlights how the Rio-based conservative coalition (the “Saquaremas”) built a centralised order after 1837 in alliance with the coffee planters of the Paraíba valley. Military force was decisive in specific cases. These are complementary rather than exclusive — but contingency mattered: had the Farroupilha won foreign backing, or the regency lasted longer, the map might look different.</p>
      </div>
      <h4>Pedro II</h4>
      <p>Liberals engineered the early declaration of Pedro II’s majority in 1840. He reigned for 49 years: bookish, scientifically curious (he corresponded with Pasteur, met Graham Bell at the 1876 Philadelphia exhibition), personally austere, and the pivot of a parliamentary system in which he used the moderating power to rotate Conservatives and Liberals in office. Stability under him was real — and inseparable from the slave economy that financed it.</p>
    </>
  ),
  sources: ['carvalhoOrdem', 'barman', 'fausto', 'schwarcz'],
}

/* ===================== Coffee ===================== */
const decades = ['1821–30', '1831–40', '1841–50', '1851–60', '1861–70', '1871–80', '1881–90', '1891–00']
const series = [
  { k: 'Coffee', c: C.coffee, v: [18.4, 43.8, 41.4, 48.8, 45.5, 56.6, 61.5, 64.5] },
  { k: 'Sugar', c: C.sugar, v: [30.1, 24.0, 26.7, 21.2, 12.3, 11.8, 9.9, 6.0] },
  { k: 'Cotton', c: C.cotton, v: [20.6, 10.8, 7.5, 6.2, 18.3, 9.5, 4.2, 2.7] },
  { k: 'Rubber', c: C.rubber, v: [0.1, 0.3, 0.4, 2.3, 3.1, 5.5, 8.0, 15.0] },
  { k: 'Hides', c: C.hides, v: [13.6, 7.9, 8.5, 7.2, 6.0, 5.6, 3.2, 2.4] },
]
const coffee: SlideDef = {
  id: 'coffee', act: 'II', short: 'Coffee and the second slavery',
  render: () => {
    const cw = 760, ch = 400, bw = 70, gap = (cw - bw * decades.length) / (decades.length - 1)
    return (
      <Slide theme="paper">
        <Header n={18} kicker="Coffee · 1820s–1880s" title={<>Coffee rebuilt the economy around Rio — on the last great wave of the slave trade</>} w={1000} size="md" />
        <svg width={cw + 130} height={ch + 70} style={{ position: 'absolute', left: 80, top: 270 }} className="chart"><g transform="translate(0, 30)">
          <text x={0} y={-14} fontSize={11.5} fill="#7a6f60" fontWeight={600} letterSpacing="0.12em">SHARE OF BRAZIL’S EXPORT EARNINGS BY DECADE (%)</text>
          {decades.map((d, i) => {
            let acc = 0
            const x = i * (bw + gap)
            const other = 100 - series.reduce((a, s) => a + s.v[i], 0)
            return (
              <g key={d}>
                {series.map((s) => {
                  const h = (s.v[i] / 100) * ch
                  const y = ch - acc - h
                  acc += h
                  return <rect key={s.k} x={x} y={y} width={bw} height={Math.max(0, h - 1)} fill={s.c} opacity={0.92} />
                })}
                <rect x={x} y={0} width={bw} height={(other / 100) * ch - 1} fill="#d9cfbb" />
                {i % 1 === 0 && <text x={x + bw / 2} y={ch - (series[0].v[i] / 100) * ch / 2 + 5} textAnchor="middle" fontSize={13} fill="#fff" fontWeight={700}>{Math.round(series[0].v[i])}</text>}
                <text x={x + bw / 2} y={ch + 20} textAnchor="middle" fontSize={11.5} fill="#7a6f60" fontFamily="IBM Plex Mono">{d}</text>
              </g>
            )
          })}
          {/* legend */}
          {[...series, { k: 'Other (tobacco, cacao, mate…)', c: '#d9cfbb' }].map((s, i) => (
            <g key={s.k} transform={`translate(${cw + 14}, ${ch - 20 - i * 26})`}>
              <rect width={12} height={12} fill={s.c} y={-10} />
              <text x={18} y={0} fontSize={12.5} fill="#4a4238">{s.k.split(' (')[0]}</text>
            </g>
          ))}
          <text x={4 * (bw + gap) + bw / 2} y={ch - (series[0].v[4] + series[1].v[4] + series[2].v[4] / 2) / 100 * ch} textAnchor="middle" fontSize={10.5} fill="#fff" fontWeight={600}>US Civil</text>
          <text x={4 * (bw + gap) + bw / 2} y={ch - (series[0].v[4] + series[1].v[4] + series[2].v[4] / 2) / 100 * ch + 12} textAnchor="middle" fontSize={10.5} fill="#fff" fontWeight={600}>War</text>
        </g></svg>
        <At x={1010} y={250} w={510}>
          <Img id="ferrezCoffee" style={{ width: 510, height: 330 }} pos="50% 50%" credit="br" />
          <div className="caption"><b>Marc Ferrez, c. 1885:</b> enslaved workers on a coffee fazenda in the Paraíba valley, three years before abolition.</div>
        </At>
        <At x={1010} y={660} w={510}>
          <p className="body" style={{ fontSize: 15 }}>Coffee climbed from the hills of Rio up the <strong>Paraíba valley</strong> from the 1820s. It was planted by enslaved Africans: roughly <strong>2 million</strong> captives landed in Brazil in 1801–1850, more than in any earlier half-century — most of them through Rio, and much of it illegally after a ban of 1831 that was passed, as the phrase went, <em>“para inglês ver”</em> — for the English to see.</p>
        </At>
        <Cite y={862} w={900}>Export shares: IBGE, Estatísticas Históricas do Brasil (from Anuário Estatístico 1939/40), as reproduced in Fausto & Fausto. Arrivals: SlaveVoyages estimates.</Cite>
      </Slide>
    )
  },
  notes: (
    <>
      <h4>From Tijuca to the Paraíba</h4>
      <p>Coffee arrived in Pará in the 1720s (the story that Francisco de Melo Palheta obtained seedlings in French Guiana through a liaison with the governor’s wife is a cherished legend), and was grown in the hills around Rio — including the slopes of Tijuca — by the late 18th century. With collapsing Haitian production after 1791 and growing demand in the US and Europe, it spread from the 1820s along the Paraíba do Sul valley through Vassouras, Valença and Bananal. The planters who grew rich there — the “coffee barons,” many ennobled by Pedro II with non-hereditary titles — were the backbone of the Empire’s Conservative party.</p>
      <h4>The economics</h4>
      <p>Coffee needed land, cheap transport to the coast and, above all, labour. Forest was cleared by fire; soils were exhausted within a generation or two and planting moved on. Coffee went to Rio on mule trains, then on the Dom Pedro II railway (1858). The labour was enslaved: Rio’s great traffickers supplied the valley, and the trade surged as coffee boomed. Historians (Dale Tomich, Rafael Marquese) call this the <strong>“second slavery”</strong>: a 19th-century intensification of slavery tied to industrial-era commodities — Cuban sugar, US cotton, Brazilian coffee — rather than a survival of the old colonial order.</p>
      <h4>The illegal trade</h4>
      <p>An 1831 law declared the trade illegal and Africans landed thereafter free; it was flagrantly ignored. Between 1831 and 1850 several hundred thousand Africans — the best estimates exceed 700,000 — were smuggled into Brazil and held as slaves illegally, a fact abolitionists like Luís Gama later used in court to win freedom for individuals. British pressure culminated in the Aberdeen Act (1845), under which the Royal Navy seized Brazilian slavers, eventually even in Brazilian waters. In 1850 the Eusébio de Queirós law, this time enforced, ended the Atlantic trade.</p>
      <h4>Export structure</h4>
      <p>The chart shows the rise of coffee from about 18% of export earnings in the 1820s to about 65% in the 1890s. Note the spike in cotton during the US Civil War, when Union blockade cut off Confederate cotton, and the rise of Amazon rubber in the 1890s. Brazil became the world’s largest coffee producer in the 1840s and has remained so ever since.</p>
    </>
  ),
  sources: ['stein', 'ibgeHist', 'slavevoyages', 'bethellAbolition', 'dean', 'fausto'],
}

/* ===================== Valongo ===================== */
const valongo: SlideDef = {
  id: 'valongo', act: 'II', short: 'Valongo: where the captives landed',
  render: () => (
    <Slide theme="ink">
      <Img id="rugendasMercado" style={{ position: 'absolute', left: 0, top: 0, width: 900, height: 560 }} pos="50% 50%" credit="bl" />
      <Img id="valongoRuins" style={{ position: 'absolute', left: 0, top: 568, width: 446, height: 332 }} pos="50% 50%" credit="bl" />
      <Img id="pedraDoSal" style={{ position: 'absolute', left: 454, top: 568, width: 446, height: 332 }} pos="50% 40%" credit="br" />
      <Header x={960} y={64} n={19} kicker="Rio · Valongo, 1774–1831" title={<>The largest slave port in the Americas — buried, and rediscovered</>} w={570} size="sm" />
      <At x={960} y={290} w={570}>
        <p className="body" style={{ fontSize: 15.5 }}>In 1774 the viceroy moved Rio’s slave market from the centre to <strong>Valongo</strong>, a cove just beyond the city, to keep the sick and dying newly arrived out of sight. A wharf was built in 1811. UNESCO estimates that some <strong>900,000</strong> enslaved Africans were landed through the Valongo complex — warehouses, a quarantine house, and a cemetery for those who died on arrival.</p>
        <p className="body" style={{ fontSize: 15.5 }}>In 1843 the wharf was paved over for the arrival of an empress; in the 1900s it vanished under landfill. Excavations for the 2016 Olympics found it again in 2011. It became a UNESCO World Heritage Site in 2017.</p>
        <div style={{ display: 'flex', gap: 28, marginTop: 18 }}>
          <div><div className="big-num" style={{ color: '#e09577', fontSize: 50 }}>41%</div><div className="small" style={{ maxWidth: 230 }}>of Rio’s 266,466 people were enslaved in the 1849 census — the largest urban slave population in the Americas</div></div>
        </div>
      </At>
      <At x={960} y={720} w={570}>
        <div className="label" style={{ color: '#d98a6c' }}>When you go</div>
        <div className="small" style={{ marginTop: 6, color: '#cfc4b0', fontSize: 14 }}>Valongo Wharf → Instituto Pretos Novos (the cemetery, on Rua Pedro Ernesto) → Pedra do Sal (right): a 15-minute walk through “Little Africa.”</div>
      </At>
      <Cite x={960} y={862} w={600}>Top: Rugendas, <i>Marché aux nègres</i> (Rua do Valongo), 1835. UNESCO WHC 1548; 1849 census (Karasch 1987).</Cite>
    </Slide>
  ),
  notes: (
    <>
      <h4>The Valongo complex</h4>
      <p>Until 1774 captives were sold in the Rua Direita near the palace (today’s Rua Primeiro de Março). The Marquis of Lavradio moved the market to the Valongo cove on hygienic and moral grounds: the sight of emaciated arrivals was thought to spread disease and offend. What grew up there was an industrial-scale reception system: shops (armazéns) where captives were fattened, shaved and oiled for sale — the scene in Rugendas’ and Debret’s images — a lazaretto, and the <strong>Cemitério dos Pretos Novos</strong> (“cemetery of new blacks”), where perhaps tens of thousands of people who died soon after arrival were dumped in shallow pits and burned. It was rediscovered in 1996 when a family renovating their house in Gamboa found bones; the Instituto Pretos Novos now operates there.</p>
      <h4>Burial by landfill</h4>
      <p>The stone wharf (Cais do Valongo) was built in 1811. In 1843 it was overlaid by a more elegant landing stage, the Cais da Imperatriz, to receive Teresa Cristina of Bourbon-Two Sicilies, Pedro II’s bride. The port works of 1904–11 (Passos era) pushed the shoreline out by hundreds of metres and buried both. During the Porto Maravilha redevelopment in 2011, archaeologists led by Tânia Andrade Lima exposed both pavements and recovered hundreds of thousands of objects — amulets, cowries, pipes, beads — the material culture of the people who came ashore here.</p>
      <h4>How big was Rio’s trade?</h4>
      <p>UNESCO’s inscription estimates that some 900,000 Africans arrived through Valongo; other estimates for the city as a whole range up to around 2 million over the full history of the trade, which would make Rio the largest single slave port in the history of the Atlantic world. The exact figure depends on how illegal post-1831 landings, often made on beaches outside the city, are counted.</p>
      <h4>The slave city</h4>
      <p>The 1849 census of the Corte counted 266,466 inhabitants, 110,602 of them enslaved. Mary Karasch’s classic study shows a city whose streets were run by enslaved labour: <em>escravos de ganho</em> hired out by their owners as porters, water carriers, barbers, vendors and musicians, keeping a share of earnings; women selling food (quitandeiras); Bantu-speaking communities with their own brotherhoods, healers and fighting arts. Capoeira was a persistent concern of the police and was criminalised in the 1890 Penal Code.</p>
      <h4>Pequena África</h4>
      <p>After abolition, migrants from Bahia and freed people settled the cheap rooming houses of Saúde, Gamboa and the area around Pedra do Sal — the neighbourhoods later called “Little Africa.” Pedra do Sal, a rock outcrop with steps carved into it where salt was once unloaded, is now the site of crowded Monday-night samba sessions. The story continues in Act III.</p>
    </>
  ),
  sources: ['unescoValongo', 'pereiraValongo', 'karasch', 'census1849', 'slavevoyages'],
}

/* ===================== Abolition ===================== */
const steps = [
  { y: '1831', t: 'Trade banned — and ignored', c: '#8b7a66' },
  { y: '1850', t: 'Atlantic trade ends (British pressure)', c: C.atlantic },
  { y: '1850', t: 'Land Law: land only by purchase', c: C.coffee },
  { y: '1871', t: 'Free Womb Law', c: C.empire },
  { y: '1880s', t: 'Abolitionist movement; mass flights', c: C.brazilwood },
  { y: '1884', t: 'Ceará and Amazonas abolish', c: C.brazilwood },
  { y: '1885', t: 'Sexagenarian Law', c: C.empire },
  { y: '13 May 1888', t: 'Lei Áurea: unconditional abolition', c: '#1f1b16' },
]
const abolition: SlideDef = {
  id: 'abolition', act: 'II', short: 'Slavery slowly strangled',
  render: () => (
    <Slide theme="paper">
      <Header n={20} kicker="Abolition · 1831–1888" title={<>Slavery was not so much abolished as <em>slowly strangled</em> — and the freed received nothing</>} w={1100} size="md" />
      <At x={80} y={300} w={640}>
        <div style={{ position: 'relative', paddingLeft: 26 }}>
          <div style={{ position: 'absolute', left: 6, top: 8, bottom: 10, width: 2, background: 'var(--rule)' }} />
          {steps.map((s, i) => (
            <div key={i} className={`rise d${Math.min(i + 1, 6)}`} style={{ position: 'relative', marginBottom: 12, display: 'flex', gap: 16, alignItems: 'baseline' }}>
              <span style={{ position: 'absolute', left: -25, top: 6, width: 12, height: 12, borderRadius: 6, background: s.c, border: '2px solid #f2ebdd' }} />
              <span className="mono" style={{ fontSize: 14, color: s.c, minWidth: 104 }}>{s.y}</span>
              <span style={{ fontSize: 16.5, color: 'var(--text)' }}>{s.t}</span>
            </div>
          ))}
        </div>
        <div className="card" style={{ marginTop: 18, background: '#fbf7ee' }}>
          <div className="label" style={{ marginBottom: 6 }}>The entire Golden Law</div>
          <div className="serif" style={{ fontSize: 20, lineHeight: 1.3, color: 'var(--text)' }}>Art. 1. Slavery in Brazil is declared extinct from the date of this law.<br />Art. 2. All provisions to the contrary are revoked.</div>
        </div>
      </At>
      <At x={790} y={290} w={730}>
        <Img id="povoPaco1888" style={{ width: 730, height: 330 }} pos="50% 50%" credit="br" />
        <div className="caption"><b>13 May 1888, Paço Imperial (Praça XV):</b> crowds outside the palace as Princess Isabel signs the law, in Pedro II’s absence abroad.</div>
      </At>
      <svg width={730} height={170} style={{ position: 'absolute', left: 790, top: 690 }}>
        <text x={0} y={12} fontSize={11.5} fill="#7a6f60" fontWeight={600} letterSpacing="0.12em" fontFamily="Inter">ENSLAVED POPULATION (MILLIONS)</text>
        {[{ y: '1872', v: 1.51 }, { y: '1887', v: 0.72 }, { y: '1888', v: 0 }].map((d, i) => (
          <g key={d.y} transform={`translate(${i * 150}, 0)`}>
            <rect x={0} y={140 - d.v * 58} width={90} height={d.v * 58} fill={C.brazilwood} />
            <text x={45} y={134 - d.v * 58} textAnchor="middle" fontSize={14} fontFamily="IBM Plex Mono" fill="#1f1b16">{d.v ? d.v.toFixed(2) : '0'}</text>
            <text x={45} y={158} textAnchor="middle" fontSize={12} fontFamily="IBM Plex Mono" fill="#7a6f60">{d.y}</text>
          </g>
        ))}
        <foreignObject x={460} y={30} width={270} height={130}>
          <div style={{ fontSize: 13.5, lineHeight: 1.45, color: '#4a4238', fontFamily: 'Inter' }}>No compensation to owners — and none to the freed: no land, no schooling, no wages guaranteed. Many planters turned republican overnight.</div>
        </foreignObject>
      </svg>
      <Cite y={862} w={700}>Census 1872; 1887 slave registry (matrícula). Conrad (1972); Machado (1994).</Cite>
    </Slide>
  ),
  notes: (
    <>
      <h4>Why so late?</h4>
      <p>Slavery was everywhere in Brazilian society — not just plantations but cities, small farms, the households of modest families, even freed people. Coffee profits in the Paraíba valley depended on it, and the planters of Rio, Minas and São Paulo dominated the Empire’s Conservative governments. Without a civil war or a foreign occupation to force the issue, abolition proceeded by gradual laws designed to manage the transition on owners’ terms.</p>
      <h4>The stages</h4>
      <ul>
        <li><strong>1850 — end of the trade.</strong> After the Royal Navy began seizing slavers in Brazilian ports, the government enforced the Eusébio de Queirós law. Prices of enslaved people rose sharply, and an internal trade moved perhaps 200,000 people from the Northeast and the South to the coffee regions.</li>
        <li><strong>1850 — the Land Law</strong> (passed two weeks later): public land could henceforth be acquired only by purchase, not by occupation. Combined with the end of the trade, it was designed to keep future free workers — immigrants and freedpeople — from becoming independent smallholders. Compare the US Homestead Act of 1862.</li>
        <li><strong>1871 — Free Womb (Rio Branco) Law:</strong> children born to enslaved mothers were free, but owners could keep their labour until age 21.</li>
        <li><strong>1880s — mobilisation.</strong> Joaquim Nabuco, André Rebouças (a Black engineer), José do Patrocínio (a Black journalist) and Luís Gama — born free in Bahia, sold into slavery by his father, self-taught lawyer who won freedom in court for hundreds — led a genuinely popular movement. Ceará’s jangadeiros (raft fishermen) refused to carry captives south (1881); Ceará and Amazonas abolished slavery in 1884.</li>
        <li><strong>1885 — Sexagenarian Law:</strong> freed people over 60 — after three more years of “compensatory” labour.</li>
        <li><strong>1887–88 — collapse.</strong> In São Paulo enslaved people fled plantations en masse, helped by abolitionist networks (the caifazes); the army’s officers asked not to be used to hunt fugitives. The system was disintegrating before the law caught up with it.</li>
      </ul>
      <h4>13 May 1888</h4>
      <p>The Lei Áurea, signed by Princess Isabel as regent at the Paço Imperial, consisted of two articles. Rio celebrated for days; an open-air mass at São Cristóvão on 17 May drew an enormous crowd (photographs survive). In Leblon, the abolitionist José de Seixas Magalhães had sheltered fugitives in a <strong>quilombo</strong> where camellias were grown — the camellia became the movement’s badge.</p>
      <p>Joaquim Nabuco had warned in 1883 that slavery would long remain “the national characteristic of Brazil”: its effects would outlast its legal abolition. The absence of land reform, education or any transitional support, together with the state’s subsidy of European immigration (Act III), shaped racial inequality for the following century.</p>
    </>
  ),
  sources: ['conrad', 'bethellAbolition', 'machado', 'nabuco', 'klein'],
}

/* ===================== Republic ===================== */
const republic: SlideDef = {
  id: 'republic', act: 'II', short: 'A republic by coup',
  render: () => (
    <Slide theme="ink">
      <Img id="calixtoRepublica" style={{ position: 'absolute', inset: 0, width: 1600, height: 900 }} pos="50% 50%" credit="tr" />
      <div className="scrim-bottom" />
      <div className="scrim-left" style={{ opacity: 0.85 }} />
      <Header n={21} kicker="15 November 1889" title={<>The Republic arrived as a military coup the public barely noticed</>} w={760} size="md" y={330} />
      <At x={80} y={560} w={720}>
        <p className="body" style={{ fontSize: 16 }}>The monarchy fell within 18 months of abolition. It had lost the <strong>planters</strong> (no compensation), the <strong>Church</strong> (a clash over Freemasonry in the 1870s), and the <strong>army</strong>, whose officers — veterans of the Paraguayan War, steeped in Comte’s positivism — resented civilian politicians. São Paulo’s coffee elite wanted federal autonomy. Marshal Deodoro, a monarchist, led the troops. The emperor sailed into exile two days later.</p>
      </At>
      <At x={860} y={560} w={660}>
        <div className="serif" style={{ fontSize: 28, lineHeight: 1.25, fontStyle: 'italic', color: '#efe7d6' }}>“The people watched it all stupefied, astonished, surprised, without knowing what it meant. Many sincerely believed they were watching a parade.”</div>
        <div className="small" style={{ marginTop: 10 }}>Aristides Lobo, a republican, 18 November 1889</div>
        <div className="small" style={{ marginTop: 18, color: '#cfc4b0' }}>Six days earlier the court had held its last great ball on <b>Ilha Fiscal</b>, the neo-Gothic customs island in the bay. The flag’s motto, <b>Ordem e Progresso</b>, is Comte’s.</div>
      </At>
      <Cite x={80} y={862} w={900}>Painting: Benedito Calixto, <i>Proclamação da República</i>, 1893 (Pinacoteca de São Paulo). Carvalho, Os Bestializados (1987).</Cite>
    </Slide>
  ),
  notes: (
    <>
      <h4>Why the monarchy fell</h4>
      <ul>
        <li><strong>The Paraguayan War (1864–70)</strong>, fought by Brazil, Argentina and Uruguay against Paraguay, was the bloodiest interstate war in South American history. It built a professional officer corps with grievances against the politicians who ran the Empire, and recruited enslaved men who were promised freedom. Paraguay’s losses were catastrophic (estimates of the share of its population killed vary widely and remain debated).</li>
        <li><strong>Positivism.</strong> Young officers trained at the Military School of Praia Vermelha absorbed Auguste Comte’s doctrine of scientific, authoritarian progress through their teacher Benjamin Constant Botelho de Magalhães. “Order and Progress” on the flag is the positivist motto.</li>
        <li><strong>The Religious Question (1872–75)</strong>: the imprisonment of two bishops who had acted against Freemasons alienated the Church.</li>
        <li><strong>Abolition without compensation</strong> turned many slaveholders into “13th of May republicans.”</li>
        <li><strong>São Paulo.</strong> The Paulista Republican Party (founded 1873) represented western coffee planters who wanted to control their own taxes, railways and immigration policy — which a federal republic would give them.</li>
        <li><strong>Succession.</strong> The heir, Isabel, was a woman, devoutly Catholic and married to a French prince (the Count d’Eu) who was unpopular; few relished a Third Reign.</li>
      </ul>
      <p>On the morning of 15 November 1889 troops gathered at the Campo de Santana (now Praça da República) and Deodoro forced the cabinet out; a republic was proclaimed that afternoon at Rio’s city council. The imperial family sailed for Europe on 17 November. Pedro II died in Paris in 1891.</p>
      <h4>The “bestialised” people</h4>
      <p>José Murilo de Carvalho took Aristides Lobo’s word — <em>bestializado</em> — as the title of a classic book arguing that the Republic was made without, and largely against, the people of Rio: the new regime restricted the vote to literate men (a small minority), and the city’s popular classes had little stake in it. Ironically the monarchy, with Pedro II and Isabel “the Redeemer,” had been popular among freed people in Rio.</p>
      <h4>See it in Rio</h4>
      <p>Ilha Fiscal (visits by the Navy’s cultural centre from the Espaço Cultural da Marinha near Praça XV); the Campo de Santana park, opposite Central do Brasil; and the Catete Palace, which became the presidential residence in 1897.</p>
    </>
  ),
  sources: ['carvalhoBestializados', 'lobo', 'barman', 'fausto', 'schwarcz'],
}

export const act2Slides = [divider, court, independence, unity, coffee, valongo, abolition, republic]
