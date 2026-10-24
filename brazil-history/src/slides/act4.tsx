import type { SlideDef } from '../types'
import { Slide, At } from '../components/Slide'
import { Img } from '../components/Img'
import { MapFrame, polyline, type LonLat } from '../components/MapFrame'
import { Header, Cite, C } from './common'
import { ActDivider } from './divider'
import { Dot, BrazilOutline } from './act1'

/* ===================== Divider ===================== */
const divider: SlideDef = {
  id: 'act4', act: 'IV', short: 'Act IV — Dictatorship, Democracy & the Economy',
  render: () => (
    <ActDivider numeral="IV" title="Dictatorship, Democracy & Economic Transformation" span="1955 – 2026" image="congresso1959" pos="50% 50%" highlight={[1955, 2026]} color="#a9bad3"
      question="Why has Brazil swung so often between developmental promise and crisis — and between authoritarian and democratic rule?" />
  ),
  notes: (
    <>
      <p>Act IV covers the developmentalist decades (Kubitschek and Brasília), the military regime (1964–85) and its “economic miracle,” the debt and hyperinflation crisis, the democratic transition and the 1988 Constitution, stabilisation with the Real Plan, the commodity boom and the political turbulence since 2013.</p>
      <p><strong>Image:</strong> construction of the National Congress on the Esplanada dos Ministérios, 1959 (Arquivo Público do Distrito Federal). The twin towers and bowls designed by Oscar Niemeyer were built in under three years on a site that had been empty savanna.</p>
    </>
  ),
}

/* ===================== Brasília ===================== */
const brasilia: SlideDef = {
  id: 'brasilia', act: 'IV', short: 'Brasília: the capital moves inland',
  render: () => (
    <Slide theme="paper">
      <Img id="brasilia1958" style={{ position: 'absolute', left: 0, top: 0, width: 760, height: 900 }} pos="50% 50%" credit="bl" />
      <Header x={820} n={31} kicker="Brasília · 1956–1960" title={<>A capital built in 41 months to pull Brazil inland — and away from Rio</>} w={700} size="sm" />
      <At x={820} y={258} w={420}>
        <p className="body" style={{ fontSize: 15.5 }}>The 1891 constitution had already reserved land on the central plateau for a new capital. President <strong>Juscelino Kubitschek</strong> (1956–61), promising “fifty years of progress in five,” built it: Lúcio Costa’s airplane-shaped plan, Oscar Niemeyer’s buildings, inaugurated on <strong>21 April 1960</strong>.</p>
        <p className="body" style={{ fontSize: 15.5 }}>Highways radiated to Belém and the west; the car industry arrived around São Paulo. The bill came as inflation and foreign debt.</p>
        <p className="body" style={{ fontSize: 15.5 }}>The planned city never housed its builders: migrant workers (<em>candangos</em>) settled in satellite towns that now hold most of the Federal District’s 2.8 million people.</p>
      </At>
      <At x={1250} y={250} w={300} h={380}>
        <MapFrame map="brazil" w={300} h={380} view={{ w: -62, s: -26, e: -34, n: 1 }} fit="contain">
          {(p) => (
            <>
              <BrazilOutline p={p} stroke="rgba(31,27,22,0.5)" width={1} />
              {([[[-47.88, -15.79], [-48.5, -1.45]], [[-47.88, -15.79], [-43.17, -22.9]], [[-47.88, -15.79], [-46.63, -23.55]], [[-47.88, -15.79], [-56.1, -15.6]], [[-47.88, -15.79], [-38.5, -12.97]], [[-47.88, -15.79], [-43.94, -19.92]]] as LonLat[][]).map((l, i) => (
                <path key={i} d={polyline(p, l)} stroke={C.industry} strokeWidth={2} strokeDasharray="5 3" fill="none" />
              ))}
              <Dot p={p} at={[-47.88, -15.79]} label="Brasília" fill={C.brazilwood} r={6} cls="map-label" />
              <Dot p={p} at={[-43.17, -22.9]} label="Rio" r={4} />
              <Dot p={p} at={[-48.5, -1.45]} label="Belém" r={4} />
            </>
          )}
        </MapFrame>
        <div className="small" style={{ marginTop: 4, fontSize: 11.5 }}>Brasília and the new trunk roads (schematic)</div>
      </At>
      <At x={820} y={680} w={700}>
        <div className="card" style={{ borderColor: C.brazilwood }}>
          <h5 style={{ fontSize: 21 }}>What it did to Rio</h5>
          <p style={{ fontSize: 14 }}>Rio became the city-state of Guanabara (1960–75), then was merged into Rio de Janeiro state. It lost federal jobs, political centrality and fiscal autonomy — the beginning of a long relative decline that shapes the city you will see.</p>
        </div>
      </At>
      <Cite x={820} y={862} w={700}>Left: aerial survey of Brasília, June 1958 (Arquivo Nacional). Holston (1989); CPDOC.</Cite>
    </Slide>
  ),
  notes: (
    <>
      <h4>Why move the capital?</h4>
      <p>The idea was old — the Inconfidentes of 1789 imagined an interior capital, José Bonifácio proposed one in 1823 and the 1891 Republic wrote it into the constitution; the Cruls Mission demarcated a site in 1892–94. Kubitschek, a Minas Gerais physician-politician elected in 1955, made it the “meta-síntese” (synthesis goal) of his Plano de Metas. The rationale was developmental — integrate the empty interior, project the state into the Centre-West and Amazon — and geopolitical. It was also political: a new capital insulated government from the pressure of Rio’s streets, press and garrisons, a feature the military later appreciated.</p>
      <h4>Building it</h4>
      <p>Lúcio Costa won the 1957 competition with a sketch plan crossing a curved residential axis (the “wings,” with superquadras) with the Monumental Axis of ministries; Niemeyer designed the palaces; Burle Marx the gardens. Some 60,000 workers built it in about 41 months. James Holston’s anthropology of Brasília shows how a plan meant to abolish class distinctions produced sharp segregation: the Plano Piloto for officials, satellite towns for workers.</p>
      <h4>The economic model</h4>
      <p>JK’s developmentalism (<em>desenvolvimentismo</em>), shaped by the UN’s ECLA/CEPAL and economists like Celso Furtado and Roberto Campos, used tariffs, exchange controls, state banks (BNDE) and foreign direct investment — Volkswagen, GM, Ford, Mercedes in the ABC region of São Paulo — to build heavy and consumer-durable industry. Growth averaged about 8% a year in 1956–61; so did deficits, and inflation accelerated, setting up the crisis of the early 1960s.</p>
      <h4>Rio after 1960</h4>
      <p>The city kept cultural prestige — bossa nova (born in Zona Sul apartments in 1958–59), TV Globo (1965), Petrobras and BNDES headquarters — but lost the federal government’s payroll and its role as the arena of national politics. The 1975 merger with Rio de Janeiro state, decided by the military government, joined a rich city to a poorer state; many cariocas date their city’s fiscal and political problems from that decision.</p>
    </>
  ),
  sources: ['holston', 'cpdoc', 'baer', 'abreuMP', 'lessa'],
}

/* ===================== Military regime ===================== */
const gdp: [number, number][] = [[1950, 6.8], [1951, 4.9], [1952, 7.3], [1953, 4.7], [1954, 7.8], [1955, 8.8], [1956, 2.9], [1957, 7.7], [1958, 10.8], [1959, 9.8], [1960, 9.4], [1961, 8.6], [1962, 6.6], [1963, 0.6], [1964, 3.4], [1965, 2.4], [1966, 6.7], [1967, 4.2], [1968, 9.8], [1969, 9.5], [1970, 10.4], [1971, 11.3], [1972, 11.9], [1973, 14.0], [1974, 8.2], [1975, 5.2], [1976, 10.3], [1977, 4.9], [1978, 5.0], [1979, 6.8], [1980, 9.2], [1981, -4.3], [1982, 0.8], [1983, -2.9], [1984, 5.4], [1985, 7.8], [1986, 7.5], [1987, 3.5], [1988, -0.1], [1989, 3.2], [1990, -4.3], [1991, 1.0], [1992, -0.5], [1993, 4.9], [1994, 5.9], [1995, 4.2], [1996, 2.2], [1997, 3.4], [1998, 0.3], [1999, 0.5], [2000, 4.4], [2001, 1.4], [2002, 3.1], [2003, 1.1], [2004, 5.8], [2005, 3.2], [2006, 4.0], [2007, 6.1], [2008, 5.1], [2009, -0.1], [2010, 7.5], [2011, 4.0], [2012, 1.9], [2013, 3.0], [2014, 0.5], [2015, -3.5], [2016, -3.3], [2017, 1.3], [2018, 1.8], [2019, 1.2], [2020, -3.3], [2021, 4.8], [2022, 3.0], [2023, 3.2], [2024, 3.4]]
function regimeColor(y: number) {
  if (y < 1964) return '#5f8a7a'
  if (y < 1985) return C.military
  return C.atlantic
}
const military: SlideDef = {
  id: 'military', act: 'IV', short: 'The generals’ bargain',
  render: () => {
    const data = gdp.filter(([y]) => y <= 1990)
    const W = 900, H = 330, bw = W / data.length
    const y0 = H * (15 / 20) // zero line (range -5..15)
    const sy = (v: number) => (v / 20) * H
    return (
      <Slide theme="paper">
        <Header n={32} kicker="Military regime · 1964–1985" title={<>The generals’ bargain: rapid growth without democracy — and with rising inequality</>} w={1100} size="md" />
        <svg width={W + 60} height={H + 90} style={{ position: 'absolute', left: 50, top: 300 }}>
          <g transform="translate(40, 30)">
            <text x={0} y={-12} fontSize={11.5} fill="#7a6f60" fontWeight={600} letterSpacing="0.12em" fontFamily="Inter">REAL GDP GROWTH, % PER YEAR</text>
            <rect x={(1964 - 1950) * bw} y={0} width={(1985 - 1964) * bw} height={H} fill="rgba(90,82,70,0.08)" />
            <rect x={(1968 - 1950) * bw} y={0} width={6 * bw} height={H} fill="rgba(184,138,44,0.12)" />
            <text x={(1968 - 1950) * bw + 4} y={16} fontSize={12} fill="#7a5a14" fontWeight={600} fontFamily="Inter">“Miracle” 1968–73</text>
            <text x={(1981 - 1950) * bw + 2} y={H - 6} fontSize={12} fill={C.brazilwood} fontWeight={600} fontFamily="Inter">debt crisis</text>
            {[-5, 0, 5, 10, 15].map((v) => (
              <g key={v}><line x1={0} x2={W} y1={y0 - sy(v)} y2={y0 - sy(v)} stroke={v === 0 ? '#1f1b16' : 'rgba(31,27,22,0.1)'} /><text x={-8} y={y0 - sy(v) + 4} textAnchor="end" fontSize={11.5} fill="#7a6f60" fontFamily="Inter">{v}</text></g>
            ))}
            {data.map(([y, v]) => (
              <rect key={y} x={(y - 1950) * bw + 2} width={bw - 4} y={v >= 0 ? y0 - sy(v) : y0} height={Math.abs(sy(v))} fill={regimeColor(y)} />
            ))}
            {[1950, 1960, 1964, 1970, 1980, 1985, 1990].map((y) => <text key={y} x={(y - 1950) * bw + bw / 2} y={H + 20} textAnchor="middle" fontSize={11.5} fill="#7a6f60" fontFamily="IBM Plex Mono">{y}</text>)}
            <g transform={`translate(0, ${H + 40})`} fontFamily="Inter" fontSize={12}>
              {[['Democratic republic', '#5f8a7a'], ['Military regime', C.military], ['New Republic', C.atlantic]].map(([t, c], i) => (
                <g key={t} transform={`translate(${i * 190}, 0)`}><rect width={12} height={12} y={-10} fill={c} /><text x={18} fill="#4a4238">{t}</text></g>
              ))}
            </g>
          </g>
        </svg>
        <At x={1030} y={290} w={490}>
          <p className="body" style={{ fontSize: 15 }}>On 31 March–1 April 1964 the army deposed the elected president João Goulart, with support from much of the middle class, business, the press and the Church hierarchy — and a US naval task force on standby. The generals ruled for 21 years, keeping a tame Congress and rotating presidents.</p>
          <p className="body" style={{ fontSize: 15 }}>After the <strong>AI-5</strong> decree of December 1968 came censorship and systematic torture; the National Truth Commission (2014) documented <strong>434</strong> people killed or disappeared by the state.</p>
          <p className="body" style={{ fontSize: 15 }}>The “miracle” averaged over 10% growth in 1968–73, on wage restraint, state investment and foreign credit. When oil prices quadrupled in 1973 the regime kept growing on borrowed money; foreign debt passed $100 billion and the 1980s became a lost decade.</p>
        </At>
        <At x={90} y={720} w={420}><Img id="golpe1964" style={{ width: 420, height: 130 }} pos="50% 45%" credit="br" /></At>
        <At x={530} y={720} w={420}><Img id="ponteRioNiteroi" style={{ width: 420, height: 130 }} pos="50% 50%" credit="br" /></At>
        <Cite y={862} w={1400}>GDP: IBGE / Ipeadata (real growth). Left: troops in Rio, 2 April 1964; right: building the Rio–Niterói bridge (1971), a miracle-era megaproject. CNV (2014); Gaspari; Fishlow (1972).</Cite>
      </Slide>
    )
  },
  notes: (
    <>
      <h4>Why 1964?</h4>
      <p>João Goulart, Vargas’s political heir, took office in 1961 after the surprise resignation of Jânio Quadros, amid inflation approaching 80–90% a year, falling growth and Cold War polarisation after the Cuban Revolution. His push for “base reforms” (land reform, votes for illiterates, limits on profit remittances) and his flirtation with mutinous sergeants and sailors alarmed conservatives and the officer corps. Large “Marches of the Family with God for Liberty” preceded the coup. The US government had funded opposition groups and prepared Operation Brother Sam — a naval task force to support the plotters if civil war broke out; it was not needed. Many civilian backers expected a brief intervention; the military stayed.</p>
      <h4>Repression</h4>
      <p>Institutional Act No. 5 (13 December 1968) closed Congress, suspended habeas corpus for political crimes and enabled the worst repression of 1969–74, against armed left groups and many others. The National Truth Commission (2014) listed 434 dead and disappeared victims and named 377 state agents responsible; it also estimated that at least 8,350 Indigenous people died as a result of state action and omission, notably in Amazon development projects. In Rio, the DOI-CODI torture centre operated in an army barracks on Rua Barão de Mesquita in Tijuca. The 1979 Amnesty Law covered both opponents and torturers; the Supreme Court upheld it in 2010.</p>
      <h4>The miracle and its costs</h4>
      <p>Finance ministers Roberto Campos and Octávio Gouveia de Bulhões (1964–67) cut inflation and created institutions — a central bank (1964), monetary correction (indexation) of contracts and taxes, a mandatory severance fund (FGTS). Under Antônio Delfim Netto (1967–74), credit, exports and state investment produced growth above 10% a year. Real minimum wages were held down and unions repressed. Delfim is often quoted as saying the cake had to grow before it could be divided.</p>
      <div className="contested"><span className="contested-label">A famous debate</span>The 1970 census showed sharply rising inequality (the Gini index rose from about 0.50 in 1960 to about 0.57 in 1970). Albert Fishlow (1972) blamed regime policy — wage squeeze and repression of unions. Carlos Langoni (1973), defending the government, attributed it to market forces: rapid growth raised the premium on scarce educated labour. The debate founded modern Brazilian inequality research; most scholars now see both mechanisms at work.</div>
      <h4>Debt</h4>
      <p>After the 1973 oil shock (Brazil imported most of its oil), Geisel’s Second National Development Plan (1974) chose to “grow through” with heavy state investment financed by petrodollar loans — steel, petrochemicals, hydroelectricity (Itaipu), nuclear power, the alcohol fuel programme (Proálcool). When US interest rates soared in 1979–81 and Mexico defaulted in 1982, Brazil’s floating-rate debt became unpayable. The 1980s brought recession, IMF programmes, a 1987 moratorium — and inflation.</p>
    </>
  ),
  sources: ['gaspari', 'cnv', 'fico', 'fishlow', 'abreuMP', 'ipeadata', 'baer'],
}

/* ===================== Inflation ===================== */
const infl: [number, number][] = [[1960, 30.5], [1961, 47.8], [1962, 51.6], [1963, 79.9], [1964, 92.1], [1965, 34.2], [1966, 39.1], [1967, 25.0], [1968, 25.5], [1969, 19.3], [1970, 19.3], [1971, 19.5], [1972, 15.7], [1973, 15.5], [1974, 34.5], [1975, 29.4], [1976, 46.3], [1977, 38.8], [1978, 40.8], [1979, 77.2], [1980, 99.3], [1981, 95.6], [1982, 104.8], [1983, 164.0], [1984, 215.3], [1985, 242.2], [1986, 79.7], [1987, 363.4], [1988, 980.2], [1989, 1972.9], [1990, 1621.0], [1991, 472.7], [1992, 1119.1], [1993, 2477.2], [1994, 916.5], [1995, 22.4], [1996, 9.6], [1997, 5.2], [1998, 1.7], [1999, 8.9], [2000, 6.0], [2001, 7.7], [2002, 12.5], [2003, 9.3], [2004, 7.6], [2005, 5.7], [2006, 3.1], [2007, 4.5], [2008, 5.9], [2009, 4.3], [2010, 5.9], [2011, 6.5], [2012, 5.8], [2013, 5.9], [2014, 6.4], [2015, 10.7], [2016, 6.3], [2017, 3.0], [2018, 3.7], [2019, 4.3], [2020, 4.5], [2021, 10.1], [2022, 5.8], [2023, 4.6], [2024, 4.8], [2025, 4.3]]
const plans: [number, string][] = [[1986, 'Cruzado'], [1987, 'Bresser'], [1989, 'Summer'], [1990, 'Collor I'], [1991, 'Collor II'], [1994, 'REAL']]
const inflation: SlideDef = {
  id: 'inflation', act: 'IV', short: 'Hyperinflation and the Real',
  render: () => {
    const W = 960, H = 380
    const x = (y: number) => ((y - 1960) / 65) * W
    const ly = (v: number) => H - (Math.log10(Math.max(v, 1)) / 4) * H
    const path = infl.map(([y, v], i) => `${i ? 'L' : 'M'}${x(y)},${ly(v)}`).join(' ')
    return (
      <Slide theme="paper">
        <Header n={33} kicker="Inflation · 1960–2025" title={<>Inflation became a way of life — until an ingenious plan broke it in 1994</>} w={1150} size="md" />
        <svg width={W + 100} height={H + 140} style={{ position: 'absolute', left: 30, top: 250 }}>
          <g transform="translate(70, 100)">
            <text x={0} y={-80} fontSize={11.5} fill="#7a6f60" fontWeight={600} letterSpacing="0.12em" fontFamily="Inter">CONSUMER PRICE INFLATION, % PER YEAR — LOGARITHMIC SCALE · FAILED STABILISATION PLANS MARKED</text>
            {[1, 10, 100, 1000, 10000].map((v) => (
              <g key={v}><line x1={0} x2={W} y1={ly(v)} y2={ly(v)} stroke="rgba(31,27,22,0.1)" /><text x={-8} y={ly(v) + 4} textAnchor="end" fontSize={11.5} fill="#7a6f60" fontFamily="Inter">{v.toLocaleString()}%</text></g>
            ))}
            <rect x={x(1964)} y={0} width={x(1985) - x(1964)} height={H} fill="rgba(90,82,70,0.07)" />
            {plans.map(([y, t]) => (
              <g key={t}>
                <line x1={x(y)} x2={x(y)} y1={ly(infl.find((d) => d[0] === y)![1])} y2={-4} stroke={t === 'REAL' ? C.brazilwood : '#7a6f60'} strokeDasharray="2 2" />
                <text x={x(y)} y={-8} transform={`rotate(-40 ${x(y)} -8)`} fontSize={t === 'REAL' ? 13 : 11.5} fontWeight={t === 'REAL' ? 700 : 500} fill={t === 'REAL' ? C.brazilwood : '#4a4238'} fontFamily="Inter">{t}</text>
              </g>
            ))}
            <path d={path} fill="none" stroke={C.brazilwood} strokeWidth={3} />
            {infl.map(([y, v]) => <circle key={y} cx={x(y)} cy={ly(v)} r={2.2} fill={C.brazilwood} />)}
            <text x={x(1995.5)} y={ly(2477) + 4} fontSize={12.5} fill="#1f1b16" fontWeight={600} fontFamily="Inter">← 1993: 2,477%</text>
            {[1960, 1970, 1980, 1990, 2000, 2010, 2020].map((y) => <text key={y} x={x(y)} y={H + 20} textAnchor="middle" fontSize={11.5} fill="#7a6f60" fontFamily="IBM Plex Mono">{y}</text>)}
            <text x={x(1974.5)} y={H - 8} textAnchor="middle" fontSize={11} fill="#7a6f60" fontFamily="Inter">military regime</text>
          </g>
        </svg>
        <At x={1090} y={280} w={430}>
          <div className="label" style={{ color: C.brazilwood }}>How the Real Plan worked</div>
          {[
            ['Indexation had become the disease', 'Wages, rents and contracts were all corrected for past inflation, so inflation reproduced itself (“inertial inflation”). Price freezes failed five times.'],
            ['A virtual currency first', 'From March 1994 every price was quoted in the URV — a unit of account worth about one dollar — while people still paid in cruzeiros reais. Prices realigned voluntarily, without a freeze.'],
            ['Then the switch', 'On 1 July 1994 the URV became the real (R$1 = CR$2,750). Inflation fell from about 2,500% to 22% in a year, then single digits.'],
          ].map(([h, b], i) => (
            <div key={i} style={{ marginTop: 14 }}>
              <div className="serif" style={{ fontSize: 21, fontWeight: 600 }}>{i + 1}. {h}</div>
              <p className="body" style={{ fontSize: 14, margin: '2px 0 0' }}>{b}</p>
            </div>
          ))}
          <p className="small" style={{ marginTop: 14 }}>Five currencies in eight years: cruzado (1986), cruzado novo (1989), cruzeiro (1990), cruzeiro real (1993), real (1994).</p>
        </At>
        <Cite y={862} w={1100}>IBGE IPCA (1980–2025); FGV IGP-DI (1960–79). Arida & Lara Resende (1985); Franco (1995).</Cite>
      </Slide>
    )
  },
  notes: (
    <>
      <h4>Why inflation became chronic</h4>
      <p>From the 1950s Brazil financed development and deficits with money creation. The military regime’s 1964 innovation — <em>correção monetária</em>, indexing contracts, taxes and savings to past inflation — made inflation tolerable for those with bank accounts and indexed assets, but it also built memory into prices: each period’s inflation became the floor for the next. After the oil shocks and the debt crisis, with deficits monetised and the exchange rate repeatedly devalued, inflation climbed from about 100% (1980) to over 200% (1983–85).</p>
      <h4>Five failed plans</h4>
      <p>The Cruzado Plan (February 1986) froze prices and created a new currency; inflation fell briefly, a consumption boom helped the government win the November 1986 elections, then shortages and black markets forced its abandonment. Bresser (1987) and Summer (1989) followed. Fernando Collor (March 1990) froze about 80% of financial assets — savings accounts above a small limit were blocked for 18 months — a trauma Brazilians still mention. Inflation returned each time.</p>
      <h4>The insight</h4>
      <p>Economists at PUC-Rio — Persio Arida and André Lara Resende (the “Larida” proposal, 1984), with Edmar Bacha, Gustavo Franco, Pedro Malan and others — argued that inertial inflation was a coordination problem. If everyone could simultaneously switch their price-setting to a stable unit, inertia would vanish without a freeze. The Real Plan, launched under finance minister Fernando Henrique Cardoso in President Itamar Franco’s government, did exactly that via the URV (Unidade Real de Valor), introduced 1 March 1994, accompanied by a fiscal adjustment fund, high interest rates and, initially, a strong exchange rate.</p>
      <h4>Consequences</h4>
      <ul>
        <li><strong>Distribution.</strong> Hyperinflation was a tax on the poor, who held cash and lacked indexed accounts. Poverty fell sharply in 1994–95.</li>
        <li><strong>Politics.</strong> Cardoso won the presidency in October 1994 in the first round and was re-elected in 1998.</li>
        <li><strong>The “tripod.”</strong> After a currency crisis forced the real to float in January 1999, Brazil adopted the macro framework it still uses: inflation targeting by the central bank, a floating exchange rate and primary fiscal surpluses (Fiscal Responsibility Law, 2000). The legacy: high real interest rates — the Selic policy rate stood at 13.75% in October 2026.</li>
      </ul>
      <p className="small">Data: IPCA (IBGE) from 1980; IGP-DI (FGV) for 1960–79, which measures a broader price index. 2025 IPCA: 4.26%.</p>
    </>
  ),
  sources: ['arida', 'franco', 'ipca', 'abreuMP', 'bcb2026'],
}

/* ===================== 1988 & democracy ===================== */
const constitution: SlideDef = {
  id: 'constitution', act: 'IV', short: 'Democracy by negotiation',
  render: () => (
    <Slide theme="paper">
      <Img id="diretas" style={{ position: 'absolute', left: 0, top: 0, width: 640, height: 500 }} pos="50% 50%" credit="bl" />
      <At x={0} y={508} w={640} style={{ padding: '0 30px 0 80px' }}>
        <div className="caption"><b>Diretas Já, 1984:</b> rallies of up to a million people — including at Candelária in Rio — demanded direct presidential elections. Congress voted the amendment down.</div>
      </At>
      <At x={80} y={612} w={530}>
        {[['1974', 'Geisel announces a “slow, gradual and secure” opening'], ['1979', 'Amnesty — for exiles and for torturers'], ['1985', 'Civilian president chosen indirectly'], ['1988', 'New constitution (5 October)'], ['1989', 'First direct presidential vote since 1960']].map(([y, t]) => (
          <div key={y} style={{ display: 'flex', gap: 14, padding: '5px 0', borderBottom: '1px solid var(--rule)', fontSize: 14.5 }}><span className="mono" style={{ color: C.atlantic, minWidth: 44 }}>{y}</span>{t}</div>
        ))}
      </At>
      <Header x={700} n={34} kicker="Redemocratisation · 1974–1988" title={<>Democracy returned by negotiation — with a constitution that promised more than the state could pay for</>} w={820} size="sm" />
      <At x={700} y={290} w={820}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
          <div className="card">
            <h5>What 1988 created</h5>
            <p>A universal public health system (SUS); pensions and social assistance as rights; votes from 16 and for the illiterate; Indigenous and quilombola land rights; an independent public prosecution service; strong judicial review.</p>
          </div>
          <div className="card">
            <h5>How the system works</h5>
            <p>A powerful president who governs through decrees and coalitions; a Congress fragmented among a dozen-plus parties, with a pragmatic “Centrão” that trades votes for posts and budget amendments; a Supreme Court that often arbitrates politics.</p>
          </div>
        </div>
        <svg width={820} height={250} style={{ marginTop: 16 }}>
          <text x={0} y={14} fontSize={11.5} fill="#7a6f60" fontWeight={600} letterSpacing="0.12em" fontFamily="Inter">COALITIONAL PRESIDENTIALISM (SCHEMATIC)</text>
          <rect x={300} y={40} width={220} height={52} rx={4} fill={C.atlantic} />
          <text x={410} y={63} textAnchor="middle" fill="#fff" fontFamily="Cormorant Garamond" fontSize={22} fontWeight={600}>President</text>
          <text x={410} y={82} textAnchor="middle" fill="#e6eef2" fontFamily="Inter" fontSize={11.5}>decrees · budget · dozens of ministries</text>
          {[['Governing party', 60], ['Allied parties', 240], ['“Centrão”', 420], ['Opposition', 600]].map(([t, x], i) => (
            <g key={t as string}>
              <rect x={x as number} y={150} width={150} height={44} rx={4} fill={i === 3 ? '#d9cfbb' : '#e9e1cf'} stroke="rgba(31,27,22,0.25)" />
              <text x={(x as number) + 75} y={177} textAnchor="middle" fontFamily="Inter" fontSize={13} fill="#1f1b16" fontWeight={600}>{t as string}</text>
              {i < 3 && <path d={`M${(x as number) + 75},148 Q${(x as number) + 75},110 ${360 + i * 50},94`} stroke={C.atlantic} strokeWidth={1.6} fill="none" strokeDasharray="4 3" />}
            </g>
          ))}
          <text x={240} y={124} fontFamily="Inter" fontSize={11.5} fill="#4a4238">posts & amendments ⇄ votes</text>
          <rect x={60} y={210} width={690} height={32} rx={4} fill="none" stroke={C.empire} />
          <text x={405} y={231} textAnchor="middle" fontFamily="Inter" fontSize={12.5} fill={C.empire} fontWeight={600}>Supreme Court (STF) · state governors · Public Prosecution · Federal Audit Court — veto players</text>
        </svg>
        <p className="small" style={{ marginTop: 6 }}>Since 1988: two presidents impeached (Collor 1992, Rousseff 2016) and more than 130 constitutional amendments.</p>
      </At>
      <Cite x={700} y={862} w={820}>Abranches (1988, 2018); Fausto & Fausto (2014); Constitution of 1988.</Cite>
    </Slide>
  ),
  notes: (
    <>
      <h4>A transition controlled from above — then pushed from below</h4>
      <p>President Ernesto Geisel (1974–79) began a liberalisation meant to return power to civilians on the military’s terms, against resistance from the hard-line security apparatus. Pressure from below grew: the 1978–80 metalworkers’ strikes in São Bernardo do Campo, led by Luiz Inácio Lula da Silva, the Catholic Church’s base communities, the press, lawyers’ and scientists’ associations. The 1979 amnesty let exiles return; party reform produced the PT (1980) and other parties; in 1982 opposition governors were elected in major states (Leonel Brizola in Rio).</p>
      <p>In 1984 the <strong>Diretas Já</strong> campaign filled squares across the country — a rally at Candelária in Rio on 10 April drew perhaps a million people — but on 25 April the Dante de Oliveira amendment for direct elections fell 22 votes short. In January 1985 the electoral college chose the moderate opposition leader Tancredo Neves; he fell ill on the eve of inauguration and died on 21 April. His vice-president José Sarney, a former regime ally, governed through hyperinflation.</p>
      <h4>The “Citizen Constitution”</h4>
      <p>The 1987–88 Constituent Assembly, presided over by Ulysses Guimarães, wrote a long, detailed, rights-heavy document: universal health care (SUS), social security as a right, a guaranteed minimum pension equal to the minimum wage, labour protections, decentralisation of revenue to states and municipalities, a strengthened Ministério Público, and a Supreme Court with broad powers of review. Many spending commitments were constitutionally earmarked, which makes fiscal adjustment hard and explains why so many reforms (pensions 2019, tax 2023) require constitutional amendments.</p>
      <h4>Coalitional presidentialism</h4>
      <p>Sérgio Abranches coined the term in 1988: a directly elected president, a fragmented Congress elected by open-list proportional representation, and federalism. Presidents assemble broad coalitions by distributing ministries, state-company posts and budget amendments. The system has been remarkably resilient — it survived two impeachments — but it rewards patronage and has been at the heart of corruption scandals (the <em>mensalão</em> vote-buying case of 2005; the Lava Jato investigations of 2014–21 into Petrobras contracts). Since the 2010s Congress has captured a growing share of the discretionary budget through mandatory amendments, shifting power away from the presidency.</p>
    </>
  ),
  sources: ['abranches', 'fausto', 'schwarcz', 'gaspari'],
}

/* ===================== Boom, bust & 2026 ===================== */
const gini: [number, number][] = [[1995, 60], [2001, 58], [2005, 56], [2009, 54], [2014, 52], [2019, 53], [2020, 49], [2022, 52], [2023, 52]]
const boom: SlideDef = {
  id: 'boom-bust', act: 'IV', short: 'Boom, bust — and October 2026',
  render: () => {
    const data = gdp.filter(([y]) => y >= 1995)
    const W = 820, H = 230, bw = W / data.length
    const sy = (v: number) => (v / 12) * H
    const y0 = H * (8 / 12)
    const gx = (y: number) => ((y - 1995) / 30) * W
    return (
      <Slide theme="paper">
        <Header n={35} kicker="1995–2026" title={<>A commodity boom, real social gains — then a decade of crisis and polarisation</>} w={1150} size="md" />
        <svg width={W + 70} height={540} style={{ position: 'absolute', left: 50, top: 290 }}>
          <g transform="translate(46, 24)">
            <text x={0} y={-8} fontSize={11.5} fill="#7a6f60" fontWeight={600} letterSpacing="0.12em" fontFamily="Inter">REAL GDP GROWTH, %</text>
            <rect x={gx(2003)} y={0} width={gx(2011) - gx(2003)} height={H} fill="rgba(140,154,60,0.12)" />
            <text x={gx(2003) + 4} y={14} fontSize={11.5} fill="#5c6a1c" fontWeight={600} fontFamily="Inter">China boom · Lula I–II</text>
            {[-4, 0, 4, 8].map((v) => <g key={v}><line x1={0} x2={W} y1={y0 - sy(v)} y2={y0 - sy(v)} stroke={v === 0 ? '#1f1b16' : 'rgba(31,27,22,0.1)'} /><text x={-8} y={y0 - sy(v) + 4} textAnchor="end" fontSize={11.5} fill="#7a6f60" fontFamily="Inter">{v}</text></g>)}
            {data.map(([y, v]) => <rect key={y} x={(y - 1995) * bw + 2} width={bw - 4} y={v >= 0 ? y0 - sy(v) : y0} height={Math.abs(sy(v))} fill={v < 0 ? C.brazilwood : C.atlantic} />)}
            {[1995, 2000, 2005, 2010, 2015, 2020, 2024].map((y) => <text key={y} x={(y - 1995) * bw + bw / 2} y={H + 18} textAnchor="middle" fontSize={11.5} fill="#7a6f60" fontFamily="IBM Plex Mono">{y}</text>)}
            <g transform="translate(0, 300)">
              <text x={0} y={-12} fontSize={11.5} fill="#7a6f60" fontWeight={600} letterSpacing="0.12em" fontFamily="Inter">INCOME INEQUALITY — GINI INDEX (ROUNDED)</text>
              {[45, 50, 55, 60].map((v) => <g key={v}><line x1={0} x2={W} y1={(62 - v) * 12} y2={(62 - v) * 12} stroke="rgba(31,27,22,0.1)" /><text x={-8} y={(62 - v) * 12 + 4} textAnchor="end" fontSize={11.5} fill="#7a6f60" fontFamily="Inter">{v}</text></g>)}
              <path d={gini.map(([y, v], i) => `${i ? 'L' : 'M'}${gx(y)},${(62 - v) * 12}`).join(' ')} fill="none" stroke={C.empire} strokeWidth={3} />
              {gini.map(([y, v]) => <g key={y}><circle cx={gx(y)} cy={(62 - v) * 12} r={4} fill={C.empire} /><text x={gx(y)} y={(62 - v) * 12 - 9} textAnchor="middle" fontSize={11} fill="#4a4238" fontFamily="IBM Plex Mono">{v}</text></g>)}
              <text x={gx(2020)} y={(62 - 49) * 12 + 22} textAnchor="middle" fontSize={11} fill="#4a4238" fontFamily="Inter">pandemic aid</text>
            </g>
          </g>
        </svg>
        <At x={960} y={280} w={560}>
          <p className="body" style={{ fontSize: 14.5 }}>Stable money (FHC, 1995–2002) and then Chinese demand for iron ore, soy and oil financed the <strong>Lula</strong> years (2003–10): real minimum-wage gains, the Bolsa Família cash-transfer programme, credit, and a historic fall in poverty and inequality.</p>
          <p className="body" style={{ fontSize: 14.5 }}>From 2013: mass street protests, the <strong>Lava Jato</strong> corruption probe, the worst recession on record (2015–16), the impeachment of Dilma Rousseff (2016) and the election of the far-right Jair Bolsonaro (2018). After a riot stormed Congress, the presidential palace and the Supreme Court on 8 January 2023, the Court convicted Bolsonaro in 2025 of plotting a coup.</p>
          <div className="card" style={{ marginTop: 12, borderColor: C.brazilwood, background: '#fbf7ee' }}>
            <div className="label" style={{ color: C.brazilwood }}>As of 24 October 2026</div>
            <p style={{ fontSize: 13.5, marginTop: 6 }}><b>Election:</b> first round (4 Oct) — Flávio Bolsonaro 47.0%, President Lula 45.2%; the runoff is on <b>25 October</b>, result not known at writing. Jair Bolsonaro is serving a 27-year sentence under house arrest.</p>
            <p style={{ fontSize: 13.5, marginTop: 6 }}><b>Economy:</b> policy rate (Selic) 13.75% after September’s cut; inflation expected near 5% for 2026; growth forecasts below 2%.</p>
          </div>
        </At>
        <Cite y={862} w={1400}>GDP: IBGE / Ipeadata through 2024. Gini: World Bank PIP / IBGE PNAD, rounded. Election: TSE count via Al Jazeera & Washington Post (Oct 2026); Selic: BCB Copom (Sept 2026); STF AP 2668. Contemporary figures provisional.</Cite>
      </Slide>
    )
  },
  notes: (
    <>
      <h4>The good decade</h4>
      <p>Cardoso (1995–2002) consolidated stabilisation, privatised telecoms, steel and Vale, and created early cash-transfer programmes. Lula (2003–10), the former metalworker, kept the macro tripod while raising the real minimum wage, expanding Bolsa Família (conditional cash transfers reaching over 13 million families), widening credit and university access. The commodity super-cycle driven by China — now Brazil’s largest trading partner — boosted terms of trade. Poverty fell sharply, and the Gini index declined from roughly 0.58 in 2001 to about 0.52 by 2014, one of the largest sustained declines anywhere. Brazil left the UN hunger map in 2014; pre-salt oil discoveries (2006–07), the 2014 World Cup and the 2016 Rio Olympics crowned a mood of arrival.</p>
      <h4>The bad decade</h4>
      <p>Growth slowed after 2011; Dilma Rousseff’s interventionist “New Economic Matrix” (subsidised credit, price controls on fuel and electricity, tax breaks) coincided with falling commodity prices. The June 2013 protests began over bus fares and became a broad revolt against the political class. Lava Jato, launched in 2014, exposed a cartel of construction firms paying kickbacks on Petrobras contracts to parties in the governing coalition; it convicted dozens of politicians and executives — including Lula in 2017 (jailed 2018–19) — before the Supreme Court annulled his convictions in 2021 on jurisdictional grounds and found the lead judge, Sergio Moro, biased. Rousseff was impeached in 2016 for budget manoeuvres. GDP fell about 7% in 2015–16.</p>
      <h4>Polarisation</h4>
      <p>Jair Bolsonaro, a former army captain and long-time backbencher, won in 2018 on anti-PT, anti-corruption, pro-gun and socially conservative platforms, with strong evangelical support. His government passed a pension reform (2019); Brazil suffered one of the world’s highest COVID-19 death tolls (over 700,000). Lula narrowly beat him in October 2022. On 8 January 2023 Bolsonaro supporters ransacked the buildings of the three branches of government in Brasília. In September 2025 the Supreme Court’s First Panel convicted Bolsonaro and senior aides of attempting a coup, sentencing him to 27 years and 3 months; he has been held under humanitarian house arrest since March 2026.</p>
      <h4>Where things stand (24 October 2026)</h4>
      <ul>
        <li><strong>Election:</strong> in the first round on 4 October 2026 Senator Flávio Bolsonaro (PL), the former president’s son, led with 47.03% of valid votes to Lula’s 45.16%; the PL also won the most seats in both chambers. Final polls had shown Lula ahead, and late runoff polls showed a near tie. The runoff is on 25 October 2026 — its result was not known when this deck was prepared.</li>
        <li><strong>Economy:</strong> GDP grew 3.4% in 2024; 2025 inflation (IPCA) was 4.26%. In September 2026 the central bank cut the Selic to 13.75% (the latest in a series of cuts from a peak of 15% reached in 2025), with market (Focus) expectations of inflation around 5% and growth below 2% for 2026. These figures are provisional and should be re-checked.</li>
      </ul>
      <div className="contested"><span className="contested-label">Interpretation</span>Is Brazil stuck in a “middle-income trap”? Its income per head relative to the United States is roughly where it was around 1980. Explanations stress low investment and savings, weak productivity growth, a complex tax system, poor basic education, high real interest rates and an economy re-concentrated in commodities. Others point to genuine institutional gains: an independent central bank (formally since 2021), a sophisticated financial system and agribusiness that leads the world in productivity.</div>
    </>
  ),
  sources: ['wbGini', 'ipeadata', 'arretche', 'tse2026', 'bcb2026', 'stf2025', 'souza'],
}

export const act4Slides = [divider, brasilia, military, inflation, constitution, boom]
