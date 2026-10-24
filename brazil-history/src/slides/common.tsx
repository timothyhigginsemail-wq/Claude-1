import type { ReactNode } from 'react'
import { Kicker } from '../components/Slide'

export function Header({ n, kicker, title, dek, x = 80, y = 64, w = 760, size }: {
  n?: number; kicker: ReactNode; title: ReactNode; dek?: ReactNode; x?: number; y?: number; w?: number; size?: 'lg' | 'md' | 'sm'
}) {
  return (
    <div style={{ position: 'absolute', left: x, top: y, width: w }} className="rise">
      <Kicker n={n}>{kicker}</Kicker>
      <h1 className={`title ${size ?? ''}`}>{title}</h1>
      {dek && <p className="dek">{dek}</p>}
    </div>
  )
}

export function Cite({ children, x = 80, y = 856, w = 1100, style }: { children: ReactNode; x?: number; y?: number; w?: number; style?: React.CSSProperties }) {
  return <div className="cite" style={{ position: 'absolute', left: x, top: y, width: w, ...style }}>{children}</div>
}

export const fmt = (n: number, d = 0) => n.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d })

/** Era colors used consistently across maps, charts and timelines */
export const C = {
  brazilwood: '#a23e27',
  sugar: '#5f7f3e',
  gold: '#b88a2c',
  coffee: '#6e4529',
  atlantic: '#2f5d74',
  industry: '#4b5a70',
  agro: '#8c9a3c',
  empire: '#7b3f61',
  republic: '#3d6a5a',
  military: '#5a5246',
  ink: '#1f1b16',
  muted: '#7a6f60',
  paper: '#f2ebdd',
  rubber: '#9a6b3c',
  cotton: '#8d8fa0',
  hides: '#a99b80',
}
