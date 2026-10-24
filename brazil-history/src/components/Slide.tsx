import type { CSSProperties, ReactNode } from 'react'

export function Slide({ theme = 'paper', children, style }: { theme?: 'paper' | 'ink' | 'paper2'; children: ReactNode; style?: CSSProperties }) {
  return <div className={`slide ${theme}`} style={style}>{children}</div>
}

export function Kicker({ n, children }: { n?: string | number; children: ReactNode }) {
  return (
    <div className="kicker">
      {n !== undefined && <span className="k-num">{String(n).padStart(2, '0')}</span>}
      <span className="k-rule" />
      <span>{children}</span>
    </div>
  )
}

/** Absolutely positioned block helper */
export function At({ x, y, w, h, children, style, className }: { x: number; y: number; w?: number; h?: number; children: ReactNode; style?: CSSProperties; className?: string }) {
  return <div className={className} style={{ position: 'absolute', left: x, top: y, width: w, height: h, ...style }}>{children}</div>
}

export function Contested({ children, label = 'Contested interpretation' }: { children: ReactNode; label?: string }) {
  return <div className="contested"><span className="contested-label">{label}</span>{children}</div>
}
