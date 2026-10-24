import type { ReactNode } from 'react'
import { Slide, At } from '../components/Slide'
import { Img } from '../components/Img'
import { MasterTimeline } from './prologue'

export function ActDivider({ numeral, title, span, question, image, pos, highlight, color, children }: {
  numeral: string; title: string; span: string; question: ReactNode; image: string; pos?: string; highlight: [number, number]; color: string; children?: ReactNode
}) {
  return (
    <Slide theme="ink">
      <Img id={image} style={{ position: 'absolute', inset: 0, width: 1600, height: 900 }} pos={pos} credit="tr" />
      <div className="scrim-left" />
      <div className="scrim-bottom" style={{ opacity: 0.7 }} />
      <At x={96} y={120} w={820} className="rise">
        <div style={{ fontFamily: 'var(--serif)', fontSize: 30, color, fontStyle: 'italic', letterSpacing: '0.02em' }}>Act {numeral}</div>
        <h1 className="title" style={{ fontSize: 88, marginTop: 8, lineHeight: 0.98 }}>{title}</h1>
        <div className="mono" style={{ fontSize: 15, color: '#b9ae9b', marginTop: 18 }}>{span}</div>
        <div style={{ width: 70, height: 2, background: color, margin: '34px 0 26px' }} />
        <div className="serif" style={{ fontSize: 33, lineHeight: 1.22, color: '#efe7d6', fontStyle: 'italic' }}>{question}</div>
        {children}
      </At>
      <div style={{ position: 'absolute', left: 0, top: 712, width: 1600, height: 160, background: 'rgba(242,235,221,0.93)' }} className="fade-in d3">
        <MasterTimeline highlight={highlight} compact />
      </div>
    </Slide>
  )
}
