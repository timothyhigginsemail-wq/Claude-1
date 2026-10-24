import type { SlideDef } from '../types'
import { Slide, At } from '../components/Slide'
import { Img } from '../components/Img'
import { Header, C } from './common'
import { bib, bibGroups } from '../data/bibliography'
import { images } from '../data/images'

const models = [
  { t: 'Brazil is a South Atlantic creation', b: 'It was built as much from Angola and the Bight of Benin as from Portugal. Its people, music, religion and food — and its wealth — came across that ocean.', c: C.brazilwood },
  { t: 'Export cycles move the centre of gravity', b: 'Brazilwood, sugar, gold, coffee, industry, soy and oil each created a new core and left an old one behind, with its elites and inequalities intact.', c: C.gold },
  { t: 'Slavery was the operating system', b: 'Not one sector but the organising principle of society for 350 years — and abolition came without land, schooling or rights. Its hierarchy outlived it.', c: C.coffee },
  { t: 'Change by accommodation', b: 'Independence by a prince, a republic by coup, amnesty for both sides, democracy by indirect election. Regimes change; elites negotiate; structures persist.', c: C.empire },
  { t: 'A strong state for insiders', b: 'From the Vargas labour code to pensions and public universities, the state protects those inside the formal system — and leaves a vast informal Brazil outside.', c: C.industry },
  { t: 'Booms on borrowed time', b: 'Growth spurts have depended on external prices or credit — coffee, foreign loans, China — and ended in busts, inflation or debt. Hence the cycles of promise and disappointment.', c: C.atlantic },
  { t: 'Rio was the national stage', b: 'Capital for two centuries, it was where Brazil performed itself — court, abolition, samba, carnival, football, bossa nova. Since 1960 it has been a stage without the state.', c: C.republic },
  { t: 'In Rio, geography is class', b: 'Mountain and sea, tunnels and railways, hills removed and shores filled: read the terrain and you can read the social order.', c: C.agro },
]
const mentalModels: SlideDef = {
  id: 'mental-models', act: 'coda', short: 'Eight mental models',
  render: () => (
    <Slide theme="ink">
      <Img id="rio1889" style={{ position: 'absolute', inset: 0, width: 1600, height: 900, opacity: 0.22 }} pos="50% 50%" credit="tr" />
      <Header n={42} kicker="Synthesis" title={<>Eight mental models to carry with you</>} w={1100} size="md" />
      <At x={80} y={220} w={1440}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px 56px' }}>
          {models.map((m, i) => (
            <div key={m.t} className={`rise d${Math.min(i + 1, 6)}`} style={{ display: 'flex', gap: 18, borderTop: `2px solid ${m.c}`, paddingTop: 12 }}>
              <div className="serif" style={{ fontSize: 44, lineHeight: 0.9, color: m.c, width: 30 }}>{i + 1}</div>
              <div>
                <div className="serif" style={{ fontSize: 25, fontWeight: 600, color: '#efe7d6', lineHeight: 1.1 }}>{m.t}</div>
                <p style={{ fontSize: 14.5, lineHeight: 1.45, color: '#c9bea9', margin: '6px 0 0' }}>{m.b}</p>
              </div>
            </div>
          ))}
        </div>
      </At>
    </Slide>
  ),
  notes: (
    <>
      <p>These are deliberately compressed. Each can be unfolded back into the evidence:</p>
      <ol>
        <li><strong>South Atlantic creation</strong> — slides 9–10, 19 (SlaveVoyages; Alencastro).</li>
        <li><strong>Moving centre of gravity</strong> — slides 3, 13, 24, 37.</li>
        <li><strong>Slavery as operating system</strong> — slides 8, 10, 18–20, 23, 38 (Klein & Luna; Nabuco’s warning).</li>
        <li><strong>Change by accommodation</strong> — slides 16, 21, 32, 34. The counter-examples matter too: Canudos, the Cabanagem, 1964 and the repression after 1968 show what happened when accommodation broke down or was refused.</li>
        <li><strong>A strong state for insiders</strong> — slides 27, 34, 38 (French; Souza).</li>
        <li><strong>Booms on borrowed time</strong> — slides 18, 23, 31–35.</li>
        <li><strong>Rio as stage</strong> — slides 11, 15, 19, 25, 28, 31.</li>
        <li><strong>Geography as class</strong> — slides 5, 11, 26, 39–41 (Abreu).</li>
      </ol>
      <p>A final caution against over-tidy stories: almost every turning point here could have gone otherwise — a regency that nearly lost the provinces, a Farroupilha that could have won foreign recognition, a coffee crash that brought Vargas rather than someone else, a 1985 transition nearly derailed by Tancredo Neves’s death, an election on 25 October 2026 whose outcome was unknown as this was written.</p>
    </>
  ),
}

const sourcesSlide: SlideDef = {
  id: 'sources', act: 'coda', short: 'Sources & image credits',
  render: () => (
    <Slide theme="paper">
      <Header n={43} kicker="Sources & credits" title="Bibliography, data and image credits" w={1200} size="sm" dek="Scroll within this panel. Every slide’s own sources are listed in its deeper-explanation drawer (N)." />
      <At x={80} y={230} w={1440} h={640} className="interactive" style={{ overflowY: 'auto', paddingRight: 20 }}>
        <div><div style={{ columns: 3, columnGap: 40, fontSize: 12, lineHeight: 1.45, color: 'var(--text-soft)' }}>
          {bibGroups.map((g) => (
            <div key={g} style={{ breakInside: 'avoid-column', marginBottom: 14 }}>
              <div className="label" style={{ color: C.brazilwood, marginBottom: 6 }}>{g}</div>
              {Object.values(bib).filter((r) => r.group === g).map((r) => <div key={r.text} style={{ marginBottom: 5 }}>{r.text}</div>)}
            </div>
          ))}
          <div style={{ breakInside: 'avoid-column', marginBottom: 14 }}>
            <div className="label" style={{ color: C.brazilwood, marginBottom: 6 }}>Maps & geodata</div>
            <div style={{ marginBottom: 5 }}>Shaded relief generated for this presentation from AWS Open Data Terrain Tiles (Mapzen; sources incl. SRTM, GMTED2010, ETOPO1). Coastlines and state boundaries: IBGE via click_that_hood / tbrugz geodata-br; world land and borders: Natural Earth via world-atlas; rivers: Natural Earth. Historical lines and zones are the author’s approximations after the FGV Atlas Histórico do Brasil and Abreu (1987).</div>
          </div>
          <div className="label" style={{ color: C.brazilwood, marginBottom: 6 }}>Image credits</div>
          {Object.entries(images).map(([k, m]) => <div key={k} style={{ marginBottom: 4 }}>{m.credit}</div>)}
        </div></div>
      </At>
    </Slide>
  ),
  notes: (
    <>
      <p>All historical images are public-domain works or openly licensed photographs from Wikimedia Commons; licences were checked against each file page in October 2026. Paintings and photographs are reproduced as historical documents — note that many (Debret, Rugendas, Pedro Américo) are interpretations by their makers, not neutral records.</p>
      <p>No AI-generated imagery is used anywhere in this presentation. Maps and charts were drawn for it from the data cited on each slide.</p>
      <h4>Recommended further reading</h4>
      <ul>
        <li>Lilia Schwarcz & Heloisa Starling, <em>Brazil: A Biography</em> — the best single-volume narrative.</li>
        <li>Boris & Sergio Fausto, <em>A Concise History of Brazil</em> — the best short analytical history.</li>
        <li>Luiz Felipe de Alencastro, <em>The Trade in the Living</em> — the South Atlantic thesis.</li>
        <li>Herbert Klein & Francisco Vidal Luna, <em>Slavery in Brazil</em>.</li>
        <li>Jeffrey Needell, <em>A Tropical Belle Époque</em>, and Maurício Abreu, <em>Evolução Urbana do Rio de Janeiro</em> — for the city.</li>
        <li>Janice Perlman, <em>Favela</em>.</li>
      </ul>
      <h4>Full bibliography</h4>
      {bibGroups.map((g) => (
        <div key={g}>
          <p><strong>{g}</strong></p>
          <ul>{Object.values(bib).filter((r) => r.group === g).map((r) => <li key={r.text}>{r.text}</li>)}</ul>
        </div>
      ))}
      <h4>Image credits</h4>
      <ul>{Object.entries(images).map(([k, m]) => <li key={k}>{m.credit} — file: {m.file}</li>)}</ul>
    </>
  ),
}

export const codaSlides = [mentalModels, sourcesSlide]
