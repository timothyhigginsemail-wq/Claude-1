import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { slides, acts } from './slides'
import { SourceList } from './components/Sources'

const W = 1600
const H = 900

function readHash(): { i: number; s: number } {
  const m = window.location.hash.match(/#\/(\d+)(?:\.(\d+))?/)
  if (!m) return { i: 0, s: 0 }
  const i = Math.min(Math.max(parseInt(m[1], 10) - 1, 0), slides.length - 1)
  return { i, s: m[2] ? parseInt(m[2], 10) : 0 }
}

function useScale(ref: React.RefObject<HTMLDivElement>) {
  const [scale, setScale] = useState(1)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => {
      const r = el.getBoundingClientRect()
      setScale(Math.min(r.width / W, r.height / H))
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return scale
}

export default function App() {
  const printMode = useMemo(() => new URLSearchParams(window.location.search).has('print'), [])
  if (printMode) return <PrintDeck />
  return <Deck />
}

function Deck() {
  const init = readHash()
  const [index, setIndex] = useState(init.i)
  const [step, setStep] = useState(init.s)
  const [notesOpen, setNotesOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [chromeVisible, setChromeVisible] = useState(true)
  const stageRef = useRef<HTMLDivElement>(null)
  const scale = useScale(stageRef)
  const slide = slides[index]
  const steps = slide.steps ?? 1

  const go = useCallback((i: number, s = 0) => {
    const clamped = Math.min(Math.max(i, 0), slides.length - 1)
    setIndex(clamped)
    setStep(s)
  }, [])

  const next = useCallback(() => {
    if (step < steps - 1) setStep(step + 1)
    else if (index < slides.length - 1) go(index + 1, 0)
  }, [step, steps, index, go])

  const prev = useCallback(() => {
    if (step > 0) setStep(step - 1)
    else if (index > 0) {
      const p = slides[index - 1]
      go(index - 1, (p.steps ?? 1) - 1)
    }
  }, [step, index, go])

  useEffect(() => {
    const h = `#/${index + 1}${step ? '.' + step : ''}`
    if (window.location.hash !== h) history.replaceState(null, '', h)
  }, [index, step])

  useEffect(() => {
    const onHash = () => {
      const r = readHash()
      setIndex(r.i)
      setStep(r.s)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const k = e.key
      if (k === 'ArrowRight' || k === 'PageDown' || (k === ' ' && !notesOpen)) {
        e.preventDefault(); next()
      } else if (k === 'ArrowLeft' || k === 'PageUp') {
        e.preventDefault(); prev()
      } else if (k === 'ArrowDown' && !notesOpen) {
        e.preventDefault(); if (index < slides.length - 1) go(index + 1)
      } else if (k === 'ArrowUp' && !notesOpen) {
        e.preventDefault(); if (index > 0) go(index - 1)
      } else if (k === 'Home') go(0)
      else if (k === 'End') go(slides.length - 1)
      else if (k === 'n' || k === 'N') setNotesOpen((v) => !v)
      else if (k === 'm' || k === 'M') setMenuOpen((v) => !v)
      else if (k === 'f' || k === 'F') toggleFullscreen()
      else if (k === 'Escape') { setMenuOpen(false); setNotesOpen(false) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [next, prev, go, index, notesOpen])

  // Auto-hide the chrome after a few seconds without mouse movement
  useEffect(() => {
    let t: number | undefined
    const wake = () => {
      setChromeVisible(true)
      window.clearTimeout(t)
      t = window.setTimeout(() => setChromeVisible(false), 3200)
    }
    wake()
    window.addEventListener('mousemove', wake)
    return () => { window.removeEventListener('mousemove', wake); window.clearTimeout(t) }
  }, [])

  const act = acts.find((a) => a.id === slide.act)!
  const actStarts = useMemo(() => acts.map((a) => ({ a, first: slides.findIndex((s) => s.act === a.id), count: slides.filter((s) => s.act === a.id).length })), [])

  return (
    <div className={`app ${notesOpen ? 'notes-open' : ''}`}>
      <div className="stage" ref={stageRef} onClick={(e) => {
        // Click on left/right thirds of the stage background navigates
        const target = e.target as HTMLElement
        if (target.closest('button, a, .interactive, .notes')) return
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
        const x = e.clientX - r.left
        if (x > r.width * 0.82) next()
        else if (x < r.width * 0.12) prev()
      }}>
        <div className="canvas" style={{ width: W, height: H, transform: `translate(-50%, -50%) scale(${scale})` }}>
          <div key={slide.id} className="slide-wrap">
            {slide.render(step)}
          </div>
          {steps > 1 && (
            <div className="step-dots" aria-hidden>
              {Array.from({ length: steps }).map((_, i) => <span key={i} className={i === step ? 'on' : i < step ? 'past' : ''} />)}
            </div>
          )}
        </div>
      </div>

      <div className={`chrome ${chromeVisible || menuOpen ? 'visible' : ''}`}>
        <div className="progress">
          {actStarts.map(({ a, first, count }) => (
            <div key={a.id} className="progress-act" style={{ flex: count }} title={`${a.numeral} ${a.title}`}>
              {Array.from({ length: count }).map((_, j) => {
                const gi = first + j
                return (
                  <button key={gi} className={`tick ${gi === index ? 'cur' : gi < index ? 'past' : ''}`}
                    style={{ ['--c' as string]: a.color }}
                    onClick={() => go(gi)} aria-label={`Slide ${gi + 1}: ${slides[gi].short}`} />
                )
              })}
            </div>
          ))}
        </div>
        <div className="bar">
          <button className="ctl" onClick={() => setMenuOpen((v) => !v)} title="Sections (M)">☰ <span>Sections</span></button>
          <div className="where">
            <span className="where-act" style={{ color: act.color }}>{act.numeral}</span>
            <span className="where-title">{act.title}</span>
            <span className="where-sep">·</span>
            <span className="where-slide">{slide.short}</span>
          </div>
          <div className="bar-right">
            <span className="count">{index + 1} / {slides.length}</span>
            <button className="ctl" onClick={prev} title="Previous (←)">←</button>
            <button className="ctl" onClick={next} title="Next (→)">→</button>
            {slide.notes && <button className={`ctl deeper ${notesOpen ? 'on' : ''}`} onClick={() => setNotesOpen((v) => !v)} title="Deeper explanation (N)">Deeper <span>N</span></button>}
            <button className="ctl" onClick={toggleFullscreen} title="Full screen (F)">⤢</button>
          </div>
        </div>
      </div>

      {slide.notes && !notesOpen && (
        <button className="deeper-tab" onClick={() => setNotesOpen(true)}>Deeper explanation <kbd>N</kbd></button>
      )}

      <aside className={`notes ${notesOpen ? 'open' : ''}`} aria-hidden={!notesOpen}>
        <div className="notes-head">
          <div>
            <div className="notes-kicker" style={{ color: act.color }}>{act.numeral} · {act.title}</div>
            <div className="notes-title">{slide.short}</div>
          </div>
          <button className="ctl" onClick={() => setNotesOpen(false)} aria-label="Close notes">✕</button>
        </div>
        <div className="notes-body">
          {slide.notes}
          {slide.sources && slide.sources.length > 0 && <SourceList keys={slide.sources} />}
        </div>
      </aside>

      {menuOpen && (
        <div className="menu" onClick={() => setMenuOpen(false)}>
          <div className="menu-inner interactive" onClick={(e) => e.stopPropagation()}>
            <div className="menu-head">
              <div className="menu-title">How Brazil Became Brazil</div>
              <div className="menu-keys">← → move · N deeper notes · M sections · F full screen · ?print for PDF</div>
            </div>
            <div className="menu-cols">
              {actStarts.map(({ a, first, count }) => (
                <div key={a.id} className="menu-act">
                  <div className="menu-act-head" style={{ borderColor: a.color }}>
                    <span style={{ color: a.color }}>{a.numeral}</span> {a.title}
                    <div className="menu-span">{a.span}</div>
                  </div>
                  <ol start={first + 1}>
                    {Array.from({ length: count }).map((_, j) => {
                      const gi = first + j
                      return <li key={gi} className={gi === index ? 'cur' : ''}><button onClick={() => { go(gi); setMenuOpen(false) }}>{slides[gi].short}</button></li>
                    })}
                  </ol>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function toggleFullscreen() {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen?.()
  else document.exitFullscreen?.()
}

/** Print / PDF mode: every slide at full size, each followed by its deeper notes. */
/** ?print = 16:9 pages for a laptop or printer; ?print=phone = tall iPhone-shaped pages, slide on top, notes in large type below */
function PrintDeck() {
  const phone = new URLSearchParams(window.location.search).get('print') === 'phone'
  return (
    <div className={`print-deck ${phone ? 'phone' : ''}`}>
      <style>{phone ? '@page { size: 1600px 3460px; margin: 0; }' : '@page { size: 1600px 900px; margin: 0; }'}</style>
      {slides.map((s, i) => {
        const last = (s.steps ?? 1) - 1
        return (
          <section key={s.id}>
            <div className="print-page">
              <div className="canvas print-canvas" style={{ width: W, height: H }}>
                <div className="slide-wrap">{s.render(last)}</div>
              </div>
            </div>
            {s.notes && (
              <div className="print-notes">
                <div className="notes-kicker">Slide {i + 1} · {s.short}</div>
                {s.notes}
                {s.sources && <SourceList keys={s.sources} />}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}
