import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { slides, acts } from './slides'
import type { SlideDef } from './types'
import { SourceList } from './components/Sources'

const W = 1600
const H = 900

/** Renders one 1600×900 slide scaled to the width of its container. */
function ScaledSlide({ slide, step }: { slide: SlideDef; step: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.5)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setScale(el.clientWidth / W)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return (
    <div ref={ref} className="fig-frame" style={{ height: H * scale }}>
      <div className="fig-canvas" style={{ width: W, height: H, transform: `scale(${scale})` }}>
        <div className="slide-wrap" key={step}>{slide.render(step)}</div>
      </div>
    </div>
  )
}

function StepControls({ slide, step, setStep }: { slide: SlideDef; step: number; setStep: (n: number) => void }) {
  const n = slide.steps ?? 1
  if (n <= 1) return null
  return (
    <div className="steps" role="group" aria-label="Map steps">
      <button className="step-btn" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0} aria-label="Previous step">←</button>
      {Array.from({ length: n }).map((_, i) => (
        <button key={i} className={`step-dot ${i === step ? 'on' : ''}`} onClick={() => setStep(i)} aria-label={`Step ${i + 1}`}>{i + 1}</button>
      ))}
      <button className="step-btn" onClick={() => setStep(Math.min(n - 1, step + 1))} disabled={step === n - 1} aria-label="Next step">→</button>
    </div>
  )
}

/** Full-screen view of one figure, fitted to the screen (rotate a phone for the biggest view). */
function Lightbox({ slide, step, setStep, onClose }: { slide: SlideDef; step: number; setStep: (n: number) => void; onClose: () => void }) {
  const [scale, setScale] = useState(1)
  useLayoutEffect(() => {
    const update = () => setScale(Math.min((window.innerWidth - 16) / W, (window.innerHeight - 90) / H))
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const n = slide.steps ?? 1
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight' && step < n - 1) setStep(step + 1)
      if (e.key === 'ArrowLeft' && step > 0) setStep(step - 1)
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [slide, step, setStep, onClose])
  return (
    <div className="lightbox" onClick={onClose}>
      <div style={{ width: W * scale, height: H * scale, position: 'relative' }} onClick={(e) => e.stopPropagation()}>
        <div className="fig-canvas" style={{ width: W, height: H, transform: `scale(${scale})` }}>
          <div className="slide-wrap" key={step}>{slide.render(step)}</div>
        </div>
      </div>
      <div className="lightbox-bar" onClick={(e) => e.stopPropagation()}>
        <StepControls slide={slide} step={step} setStep={setStep} />
        <button className="close-btn" onClick={onClose}>Close</button>
      </div>
      <div className="rotate-hint">Turn your phone sideways for a bigger view</div>
    </div>
  )
}

function Figure({ slide, index }: { slide: SlideDef; index: number }) {
  const [step, setStep] = useState(0)
  const [open, setOpen] = useState(false)
  return (
    <figure className="fig" id={`s${index + 1}`}>
      <button className="fig-hit" onClick={() => setOpen(true)} aria-label={`Open “${slide.short}” full screen`}>
        <ScaledSlide slide={slide} step={step} />
        <span className="fig-zoom">⤢ Full screen</span>
      </button>
      <div className="fig-under">
        <StepControls slide={slide} step={step} setStep={setStep} />
        {(slide.steps ?? 1) > 1 && <span className="fig-hint">This map changes over time. Step through it.</span>}
        {slide.id === 'city-map' && <span className="fig-hint">Tap the numbered circles. Open full screen for the clearest view.</span>}
      </div>
      {open && <Lightbox slide={slide} step={step} setStep={setStep} onClose={() => setOpen(false)} />}
    </figure>
  )
}

function Deeper({ slide }: { slide: SlideDef }) {
  if (!slide.notes) return null
  return (
    <details className="deeper">
      <summary><span>Read the deeper explanation</span></summary>
      <div className="deeper-body">
        {slide.notes}
        {slide.sources && slide.sources.length > 0 && <SourceList keys={slide.sources} />}
      </div>
    </details>
  )
}

export function Article({ onPresent }: { onPresent: (i: number) => void }) {
  const [active, setActive] = useState('prologue')
  useEffect(() => {
    const els = acts.map((a) => document.getElementById(`act-${a.id}`)).filter(Boolean) as HTMLElement[]
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) setActive(en.target.id.replace('act-', '')) })
    }, { rootMargin: '-40% 0px -55% 0px' })
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])

  const titleSlide = slides[0]
  return (
    <div className="article">
      <nav className="art-nav" aria-label="Sections">
        <a href="#top" className="art-brand" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>How Brazil Became Brazil</a>
        <div className="art-nav-links">
          {acts.map((a) => (
            <a key={a.id} href={`#act-${a.id}`} className={active === a.id ? 'on' : ''} style={{ ['--c' as string]: a.color }}
              onClick={(e) => { e.preventDefault(); document.getElementById(`act-${a.id}`)?.scrollIntoView({ behavior: 'smooth' }) }}>
              <b>{a.numeral === '·' ? '' : a.numeral}</b> {a.id === 'prologue' ? 'Prologue' : a.id === 'coda' ? 'Coda' : a.title}
            </a>
          ))}
        </div>
        <button className="present-btn" onClick={() => onPresent(0)}>Present as slides</button>
      </nav>

      <header className="art-hero" id="top">
        <ScaledSlide slide={titleSlide} step={0} />
        <div className="art-intro">
          <p>A history of Brazil in five acts, with Rio de Janeiro as a recurring protagonist. Each section pairs a map, chart or historical image with a short argument. Under each one, <b>Read the deeper explanation</b> gives the evidence, the debates among historians and the sources.</p>
          <p className="art-meta">Facts and contemporary data checked 24 October 2026. Images from Wikimedia Commons, credited on each figure.</p>
        </div>
      </header>

      {acts.map((a) => {
        const actSlides = slides.map((s, i) => ({ s, i })).filter(({ s }) => s.act === a.id && s.id !== 'title')
        const divider = actSlides.find(({ s }) => /^act\d$/.test(s.id))
        const body = actSlides.filter(({ s }) => !/^act\d$/.test(s.id))
        return (
          <section key={a.id} id={`act-${a.id}`} className="art-act" style={{ ['--c' as string]: a.color }}>
            <div className="act-head">
              <div className="act-num">{a.id === 'prologue' ? 'Prologue' : a.id === 'coda' ? 'Coda' : `Act ${a.numeral}`}</div>
              <h2 className="act-title">{a.id === 'prologue' ? 'The question' : a.id === 'coda' ? 'What to carry with you' : a.title}</h2>
              <div className="act-span">{a.span}</div>
            </div>
            {divider && (
              <div className="act-divider">
                <Figure slide={divider.s} index={divider.i} />
                <Deeper slide={divider.s} />
              </div>
            )}
            {body.map(({ s, i }) => (
              <article key={s.id} className="art-item">
                <div className="item-label">
                  <span className="item-num">{String(i + 1).padStart(2, '0')}</span>
                  <h3>{s.short}</h3>
                  <button className="item-present" onClick={() => onPresent(i)} title="Open this in slide mode">Slide mode</button>
                </div>
                <Figure slide={s} index={i} />
                <Deeper slide={s} />
              </article>
            ))}
          </section>
        )
      })}
      <footer className="art-foot">
        <p>Built from the scholarship listed in the final section. All historical images are public-domain or openly licensed works from Wikimedia Commons. No AI-generated imagery is used.</p>
      </footer>
    </div>
  )
}
