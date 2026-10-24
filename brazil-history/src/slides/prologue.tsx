import type { SlideDef } from '../types'
import { Slide, At } from '../components/Slide'
import { Img } from '../components/Img'
import { Header, C } from './common'

/* ---------------- Title ---------------- */
const title: SlideDef = {
  id: 'title', act: 'prologue', short: 'How Brazil Became Brazil',
  render: () => (
    <Slide theme="ink">
      <Img id="cidadeMaravilhosa" style={{ position: 'absolute', inset: 0, width: 1600, height: 900 }} pos="50% 55%" credit="br" />
      <div className="scrim-left" />
      <At x={96} y={170} w={760} className="rise">
        <div className="kicker" style={{ color: '#e0a080' }}><span className="k-rule" />An intellectual & visual history</div>
        <h1 className="title" style={{ fontSize: 104, lineHeight: 0.95, marginTop: 26, fontWeight: 500 }}>How Brazil<br />Became <em>Brazil</em></h1>
        <p className="dek" style={{ fontSize: 23, maxWidth: 600, marginTop: 30, color: '#d9cdb8' }}>
          Five centuries of geography, slavery, commodities, monarchy, migration and invention — told with Rio de Janeiro as a recurring protagonist.
        </p>
      </At>
      <At x={96} y={700} w={700} className="rise d3">
        <div className="rule" style={{ width: 80, background: '#c8865f', marginBottom: 18 }} />
        <div className="small" style={{ fontSize: 14, color: '#b9ae9b', lineHeight: 1.6 }}>
          Prologue · Five acts · Coda — about 50 minutes<br />
          Press <b style={{ color: '#efe7d6' }}>→</b> to advance, <b style={{ color: '#efe7d6' }}>N</b> for the deeper explanation behind any slide, <b style={{ color: '#efe7d6' }}>M</b> for sections.<br />
          Facts and contemporary data checked as of 24 October 2026.
        </div>
      </At>
    </Slide>
  ),
  notes: (
    <>
      <p>This presentation is built to be read at two levels. Each slide makes one argument visually and in a few sentences. The <strong>deeper explanation</strong> — this drawer — holds the reasoning, the evidence, the anecdotes and the scholarly disagreements, plus sources.</p>
      <h4>The organising question</h4>
      <p>How did Brazil become the country it is today, and why does Rio look, feel and function the way it does? The answer is built from a small number of forces that recur across five centuries: <strong>geography</strong> (a coast walled off by an escarpment, a giant interior reached by rivers), the <strong>South Atlantic</strong> (Brazil was assembled as much from Africa as from Portugal), <strong>export cycles</strong> that kept moving the economic centre of gravity, <strong>slavery</strong> as the operating system of society, and a political tradition of <strong>elite accommodation</strong> that changed regimes without changing hierarchies.</p>
      <h4>How to watch Rio</h4>
      <p>Rio is not a travel appendix. It returns whenever the city makes the national story physically visible: why the Portuguese chose Guanabara Bay, how gold made it the capital, what it meant for a European court to live there, where enslaved Africans landed, how the city was bulldozed into a Belle Époque capital, and why its mountains sort the classes. The final act turns all of this into a mental map of the city you are about to visit.</p>
      <p className="small">Cover image: Rio seen from Corcovado, with Botafogo, Sugarloaf and Guanabara Bay.</p>
    </>
  ),
}

/* ---------------- Four anomalies ---------------- */
const anomalies: SlideDef = {
  id: 'anomalies', act: 'prologue', short: 'Brazil is the anomaly of the Americas',
  render: () => {
    const cards = [
      { big: '1', unit: 'country', color: C.atlantic, head: 'Where Spanish America became eighteen', body: 'Spain’s American empire broke into 18 Spanish-speaking republics. Portuguese America stayed whole — and today covers 47% of South America.' },
      { big: '4.9m', unit: 'Africans', color: C.brazilwood, head: 'The heart of the Atlantic slave trade', body: 'About 4.9 million enslaved Africans arrived alive in Brazil — roughly 45% of everyone carried across the Atlantic, twelve times the number landed in what became the United States.' },
      { big: '1808', unit: '–1821', color: C.empire, head: 'An empire governed from its colony', body: 'Fleeing Napoleon, the Portuguese crown moved to Rio. For 13 years a South American port was the capital of a European empire. Independence came under a Portuguese prince — as a monarchy that lasted until 1889.' },
      { big: '1888', unit: '', color: C.coffee, head: 'The last to abolish slavery', body: 'Brazil was the final country in the Western Hemisphere to end slavery — 23 years after the United States, and with no land, compensation or schooling for the freed.' },
    ]
    return (
      <Slide theme="paper">
        <Header n={2} kicker="The puzzle" title={<>Brazil is the great <em>anomaly</em> of the Americas</>}
          dek="Four facts that do not fit the familiar story of the New World. Explaining them is the best way into Brazil." w={980} />
        <div style={{ position: 'absolute', left: 80, top: 330, width: 1440, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 28 }}>
          {cards.map((c, i) => (
            <div key={i} className={`rise d${i + 2}`} style={{ borderTop: `3px solid ${c.color}`, paddingTop: 22 }}>
              <div className="big-num" style={{ color: c.color, fontSize: 84 }}>{c.big}<span style={{ fontSize: 30, marginLeft: 6, color: 'var(--muted)', fontStyle: 'italic' }}>{c.unit}</span></div>
              <div className="serif" style={{ fontSize: 27, fontWeight: 600, lineHeight: 1.1, marginTop: 18, color: 'var(--text)' }}>{c.head}</div>
              <p className="body" style={{ marginTop: 12, fontSize: 16 }}>{c.body}</p>
            </div>
          ))}
        </div>
        <At x={80} y={742} w={1440}>
          <div className="rule" style={{ marginBottom: 20 }} />
          <div style={{ display: 'flex', gap: 40, alignItems: 'baseline' }}>
            <div className="label" style={{ color: C.brazilwood, whiteSpace: 'nowrap' }}>The question</div>
            <div className="serif" style={{ fontSize: 30, lineHeight: 1.2, color: 'var(--text)' }}>
              How did Brazil become the country it is — and why does Rio look, feel and function the way it does?
            </div>
          </div>
        </At>
        <div className="cite" style={{ position: 'absolute', left: 80, top: 860 }}>Sources: SlaveVoyages estimates 1501–1866 (4.86m disembarked in Brazil of 10.7m total); IBGE; Fausto & Fausto (2014).</div>
      </Slide>
    )
  },
  notes: (
    <>
      <p>Each anomaly is a thread the presentation follows:</p>
      <ul>
        <li><strong>Unity and size</strong> (Acts I–II): Brazil grew far beyond the line Portugal was granted in 1494, and then — against the regional pattern — did not fragment at independence. The explanation involves the 1808 transfer of the court, a slaveholding elite that feared disorder more than it wanted autonomy, and a good deal of force.</li>
        <li><strong>The slave trade</strong> (Acts I–II): the SlaveVoyages consortium estimates about 12.5 million people embarked in Africa between 1501 and 1866, of whom about 10.7 million survived the crossing. Brazil received about 4.86 million; mainland North America about 389,000. Brazil’s share is the single most important quantitative fact in its history.</li>
        <li><strong>The monarchy</strong> (Act II): the Braganza court’s move to Rio inverted the colonial relationship and made a negotiated, monarchical independence possible. Brazil was the only durable monarchy in post-colonial America.</li>
        <li><strong>Late abolition</strong> (Act II): the institutional, economic and demographic reasons slavery survived to 1888 — and why abolition without reform left a long shadow.</li>
      </ul>
      <p>“Eighteen republics” counts the sovereign Spanish-speaking states of the Americas: Mexico, Guatemala, Honduras, El Salvador, Nicaragua, Costa Rica, Panama, Cuba, the Dominican Republic, Colombia, Venezuela, Ecuador, Peru, Bolivia, Chile, Argentina, Uruguay and Paraguay. (Several broke away from each other after independence, and Uruguay was carved out of a war between Brazil and Argentina.)</p>
      <p>Brazil’s area is about 8.5 million km²; South America’s is about 17.8 million km².</p>
    </>
  ),
  sources: ['slavevoyages', 'eltis', 'fausto', 'ibgeCensus'],
}

/* ---------------- Master timeline ---------------- */
const X0 = 90, X1 = 1510
const yr = (y: number) => {
  // compress 1500–1800 into the first 28% of the axis
  const f = y <= 1800 ? ((y - 1500) / 300) * 0.28 : 0.28 + ((y - 1800) / 226) * 0.72
  return X0 + f * (X1 - X0)
}

const regimes = [
  { a: 1500, b: 1815, label: 'Portuguese colony', color: '#5f7f3e' },
  { a: 1815, b: 1822, label: 'UK', color: '#8a6a9a' },
  { a: 1822, b: 1889, label: 'Empire of Brazil', color: C.empire },
  { a: 1889, b: 1930, label: 'First (“Old”) Republic', color: C.republic },
  { a: 1930, b: 1945, label: 'Vargas', color: '#8e5b2c' },
  { a: 1946, b: 1964, label: '1946 Republic', color: '#5f8a7a' },
  { a: 1964, b: 1985, label: 'Military', color: C.military },
  { a: 1985, b: 2026, label: 'New Republic', color: C.atlantic },
]
const sub = [
  { a: 1822, b: 1831, label: 'Pedro I' }, { a: 1831, b: 1840, label: 'Regency' }, { a: 1840, b: 1889, label: 'Pedro II' },
  { a: 1937, b: 1945, label: 'Estado Novo' },
]
const capitals = [
  { a: 1549, b: 1763, label: 'Salvador' }, { a: 1763, b: 1960, label: 'Rio de Janeiro' }, { a: 1960, b: 2026, label: 'Brasília' },
]
const cycles = [
  { a: 1500, b: 1560, label: 'brazilwood', color: C.brazilwood },
  { a: 1560, b: 1700, label: 'sugar', color: C.sugar },
  { a: 1700, b: 1770, label: 'gold', color: C.gold },
  { a: 1770, b: 1830, label: 'sugar · cotton', color: '#84935f' },
  { a: 1830, b: 1930, label: 'coffee', color: C.coffee },
  { a: 1930, b: 1985, label: 'industry', color: C.industry },
  { a: 1985, b: 2026, label: 'agribusiness · oil · services', color: C.agro },
]
const constitutions = [1824, 1891, 1934, 1937, 1946, 1967, 1988]
const turning = [
  { y: 1500, t: 'Cabral' }, { y: 1565, t: 'Rio founded' }, { y: 1695, t: 'Gold strikes' }, { y: 1808, t: 'Court to Rio' }, { y: 1822, t: 'Independence' },
  { y: 1850, t: 'Slave trade ends' }, { y: 1888, t: 'Abolition' }, { y: 1889, t: 'Republic' }, { y: 1930, t: 'Revolution' },
  { y: 1954, t: 'Vargas suicide' }, { y: 1964, t: 'Coup' }, { y: 1988, t: 'Constitution' }, { y: 1994, t: 'Real Plan' },
]

export function MasterTimeline({ highlight, compact = false }: { highlight?: [number, number]; compact?: boolean }) {
  const top = compact ? 0 : 0
  return (
    <svg width={1600} height={compact ? 150 : 520} style={{ position: 'absolute', left: 0, top }}>
      {/* axis */}
      {[1500, 1600, 1700, 1800, 1850, 1900, 1950, 2000].map((y) => (
        <g key={y}>
          <line x1={yr(y)} x2={yr(y)} y1={compact ? 18 : 10} y2={compact ? 140 : 470} stroke="rgba(0,0,0,0.07)" />
          <text x={yr(y)} y={compact ? 148 : 490} textAnchor="middle" fontSize={12} fill="#7a6f60" fontFamily="IBM Plex Mono">{y}</text>
        </g>
      ))}
      {!compact && <text x={yr(1500)} y={508} fontSize={10.5} fill="#a09583" fontFamily="Inter">Scale before 1800 compressed</text>}
      {highlight && <rect x={yr(highlight[0])} y={compact ? 10 : 0} width={yr(highlight[1]) - yr(highlight[0])} height={compact ? 128 : 470} fill="rgba(162,62,39,0.08)" stroke="rgba(162,62,39,0.5)" strokeDasharray="4 3" />}
      {/* regime band */}
      <g transform={`translate(0, ${compact ? 22 : 60})`}>
        {!compact && <text x={X0} y={-12} className="label" fontSize={11} fill="#7a6f60" letterSpacing="0.14em" fontWeight={600}>REGIME</text>}
        {regimes.map((r) => (
          <g key={r.label}>
            <rect x={yr(r.a)} y={0} width={yr(r.b) - yr(r.a) - 1} height={compact ? 34 : 54} fill={r.color} />
            {yr(r.b) - yr(r.a) > 40 && <text x={yr(r.a) + 7} y={compact ? 22 : 33} fontSize={compact ? 11.5 : 14} fill="#fff" fontWeight={600} fontFamily="Inter">{r.label}</text>}
          </g>
        ))}
        {!compact && sub.map((s) => (
          <g key={s.label}>
            <line x1={yr(s.a)} x2={yr(s.a)} y1={56} y2={s.label === 'Regency' ? 88 : 74} stroke="#7b3f61" />
            <text x={yr(s.a) + 4} y={s.label === 'Regency' ? 86 : 72} fontSize={11} fill="#7a6f60" fontFamily="Inter">{s.label}</text>
          </g>
        ))}
      </g>
      {!compact && (
        <>
          {/* capitals */}
          <g transform="translate(0, 175)">
            <text x={X0} y={-12} fontSize={11} fill="#7a6f60" letterSpacing="0.14em" fontWeight={600} fontFamily="Inter">CAPITAL</text>
            {capitals.map((c, i) => (
              <g key={c.label}>
                <rect x={yr(c.a)} y={0} width={yr(c.b) - yr(c.a) - 1} height={30} fill={['#c9b98f', '#a23e27', '#4b5a70'][i]} opacity={0.9} />
                <text x={yr(c.a) + 7} y={20} fontSize={13} fill="#fff" fontWeight={600} fontFamily="Inter">{c.label}</text>
              </g>
            ))}
          </g>
          {/* cycles */}
          <g transform="translate(0, 255)">
            <text x={X0} y={-12} fontSize={11} fill="#7a6f60" letterSpacing="0.14em" fontWeight={600} fontFamily="Inter">LEADING SECTOR</text>
            {cycles.map((c) => (
              <g key={c.label}>
                <rect x={yr(c.a)} y={0} width={yr(c.b) - yr(c.a) - 1} height={30} fill={c.color} opacity={0.85} />
                <text x={yr(c.a) + 6} y={20} fontSize={12.5} fill="#fff" fontWeight={600} fontFamily="Inter">{c.label}</text>
              </g>
            ))}
          </g>
          {/* constitutions */}
          <g transform="translate(0, 335)">
            <text x={X0} y={-12} fontSize={11} fill="#7a6f60" letterSpacing="0.14em" fontWeight={600} fontFamily="Inter">CONSTITUTIONS</text>
            <line x1={yr(1822)} x2={X1} y1={10} y2={10} stroke="#cbbfa8" />
            {constitutions.map((c) => (
              <g key={c}>
                <rect x={yr(c) - 5} y={5} width={10} height={10} transform={`rotate(45 ${yr(c)} 10)`} fill={c === 1988 ? '#a23e27' : '#1f1b16'} />
                 <text x={yr(c) + (c === 1934 ? -8 : c === 1937 ? 8 : 0)} y={34} textAnchor={c === 1934 ? 'end' : c === 1937 ? 'start' : 'middle'} fontSize={11} fill="#4a4238" fontFamily="IBM Plex Mono">{c}</text>
              </g>
            ))}
          </g>
          {/* turning points */}
          <g transform="translate(0, 400)">
            <text x={X0} y={-6} fontSize={11} fill="#7a6f60" letterSpacing="0.14em" fontWeight={600} fontFamily="Inter">TURNING POINTS</text>
            {turning.map((t, i) => (
              <g key={t.t}>
                <circle cx={yr(t.y)} cy={14} r={3.5} fill="#a23e27" />
                <text x={yr(t.y)} y={i % 2 ? 50 : 32} textAnchor="middle" fontSize={11.5} fill="#1f1b16" fontFamily="Inter" fontWeight={500}>{t.t}</text>
              </g>
            ))}
          </g>
        </>
      )}
    </svg>
  )
}

const timeline: SlideDef = {
  id: 'timeline', act: 'prologue', short: 'Five centuries on one line',
  render: () => (
    <Slide theme="paper">
      <Header n={3} kicker="The political spine" title={<>Colony, kingdom, empire, republics, dictatorships, democracy — <em>on one line</em></>} w={1200} size="md"
        dek="Seven constitutions and three capitals. Note how each regime change coincides with a shift in what Brazil sold to the world." />
      <div style={{ position: 'absolute', left: 0, top: 330 }} className="fade-in d2"><MasterTimeline /></div>
    </Slide>
  ),
  notes: (
    <>
      <p>The left third of the axis is compressed: three colonial centuries take up less room than the two centuries since 1808, because the pace of institutional change accelerates after the court arrives.</p>
      <h4>Reading the bands together</h4>
      <ul>
        <li><strong>Regime and economy move together.</strong> The Empire (1822–89) is the political shell of the coffee-and-slavery economy of the Paraíba valley; it falls within 18 months of abolition. The First Republic (1889–1930) is the political shell of São Paulo’s immigrant-coffee economy; it falls in 1930, a year after the coffee price collapses. Vargas’s state presides over import-substituting industrialisation; the military regime over the “miracle” and its debt; the New Republic over stabilisation and the commodity boom.</li>
        <li><strong>Capitals follow the centre of gravity — with a lag.</strong> Salvador was the capital of sugar; Rio became capital in 1763 because it was the port of gold; Brasília (1960) was a deliberate attempt to move the centre of gravity inland ahead of the economy.</li>
        <li><strong>Constitutions are frequent; continuity is deeper.</strong> Brazil has had seven constitutions (1824, 1891, 1934, 1937, 1946, 1967 — heavily amended in 1969 — and 1988), but many institutions survive across regimes: the labour code of 1943, the federal pact with powerful governors, a professional diplomatic service (Itamaraty), and an activist developmental state.</li>
      </ul>
      <p>The “leading sector” band simplifies: sugar remained important through the 19th century, and the Amazon rubber boom (c. 1879–1912) briefly made rubber the second export after coffee. Dates for cycles are approximate.</p>
    </>
  ),
  sources: ['fausto', 'schwarcz', 'fgvAtlas', 'ibgeHist'],
}

export const prologueSlides = [title, anomalies, timeline]
