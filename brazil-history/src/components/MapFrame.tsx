import type { ReactNode } from 'react'
import { geoPath, geoTransform } from 'd3-geo'
import { mapsMeta } from '../data/mapsMeta'

export type MapKey = keyof typeof mapsMeta
export type LonLat = [number, number]
export interface Proj {
  (lon: number, lat: number): [number, number]
  path: (g: unknown) => string
  k: number
}

const mx = (lon: number) => (lon + 180) / 360
const my = (lat: number) => {
  const r = (lat * Math.PI) / 180
  return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2
}

export function makeProj(view: { w: number; s: number; e: number; n: number }, W: number, H: number, fit: 'cover' | 'contain' = 'cover'): Proj {
  const x0 = mx(view.w), x1 = mx(view.e), y0 = my(view.n), y1 = my(view.s)
  // cover: scale so the view fills W×H, centered
  const k = fit === 'cover' ? Math.max(W / (x1 - x0), H / (y1 - y0)) : Math.min(W / (x1 - x0), H / (y1 - y0))
  const ox = (W - (x1 - x0) * k) / 2, oy = (H - (y1 - y0) * k) / 2
  const p = ((lon: number, lat: number) => [ox + (mx(lon) - x0) * k, oy + (my(lat) - y0) * k]) as Proj
  const t = geoTransform({
    point(this: { stream: { point: (x: number, y: number) => void } }, lon: number, lat: number) {
      const [x, y] = p(lon, lat)
      this.stream.point(x, y)
    },
  })
  const gp = geoPath(t)
  p.path = (g: unknown) => gp(g as never) || ''
  p.k = k
  return p
}

interface Props {
  map: MapKey
  w: number
  h: number
  view?: { w: number; s: number; e: number; n: number }
  children?: (p: Proj) => ReactNode
  imageOpacity?: number
  className?: string
  defs?: ReactNode
  fit?: 'cover' | 'contain'
}

/** A shaded-relief raster with an aligned SVG overlay in Web Mercator. */
export function MapFrame({ map, w, h, view, children, imageOpacity = 1, className, defs, fit = 'cover' }: Props) {
  const m = mapsMeta[map]
  const v = view ?? { w: m.w, s: m.s, e: m.e, n: m.n }
  const p = makeProj(v, w, h, fit)
  const [ix0, iy0] = p(m.w, m.n)
  const [ix1, iy1] = p(m.e, m.s)
  return (
    <svg className={className} width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: 'block', overflow: 'hidden' }}>
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="12" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="context-stroke" />
        </marker>
        <filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="14" /></filter>
        <filter id="soft6" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6" /></filter>
        {defs}
      </defs>
      <rect width={w} height={h} fill="var(--water)" />
      <image href={`maps/${fileFor(map)}`} x={ix0} y={iy0} width={ix1 - ix0} height={iy1 - iy0} preserveAspectRatio="none" opacity={imageOpacity} />
      {children?.(p)}
    </svg>
  )
}

function fileFor(map: MapKey) {
  return ({ rioMetro: 'rio-metro.jpg', rioCity: 'rio-city.jpg', brazil: 'brazil-relief.jpg', atlantic: 'atlantic-relief.jpg' } as const)[map]
}

/** Quadratic curve between two points, bulging by `bend` (fraction of distance, signed) */
export function curve(a: [number, number], b: [number, number], bend = 0.2) {
  const mx_ = (a[0] + b[0]) / 2, my_ = (a[1] + b[1]) / 2
  const dx = b[0] - a[0], dy = b[1] - a[1]
  const cx = mx_ - dy * bend, cy = my_ + dx * bend
  return `M${a[0]},${a[1]} Q${cx},${cy} ${b[0]},${b[1]}`
}

export function polyline(p: Proj, pts: LonLat[]) {
  return pts.map((q, i) => `${i ? 'L' : 'M'}${p(q[0], q[1]).map((v) => v.toFixed(1)).join(',')}`).join(' ')
}
