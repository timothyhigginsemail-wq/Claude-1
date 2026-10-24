import { useState, type CSSProperties } from 'react'
import { images, imageSrc } from '../data/images'

interface Props {
  id: string
  style?: CSSProperties
  className?: string
  /** object-position for cover crops, e.g. "50% 30%" */
  pos?: string
  contain?: boolean
  credit?: 'br' | 'bl' | 'tr' | 'below' | false
  width?: number
}

/** A historical image with automatic attribution and a graceful offline fallback. */
export function Img({ id, style, className = '', pos, contain, credit = 'br', width = 1600 }: Props) {
  const meta = images[id]
  const [failed, setFailed] = useState(false)
  if (!meta) return <div className="img" style={style}>missing image: {id}</div>
  const creditEl = credit ? <div className={`credit ${credit}`}>{meta.credit}</div> : null
  return (
    <>
      <div className={`img ${contain ? 'contain' : ''} ${className}`} style={style}>
        {!failed ? (
          <img src={imageSrc(id, width)} alt={meta.alt} style={pos ? { objectPosition: pos } : undefined}
            loading="eager" decoding="async" onError={() => setFailed(true)} />
        ) : (
          <div className="img-fallback">
            {meta.alt}
            <small>Image unavailable offline — run <code>npm run fetch-images</code> once while online.</small>
          </div>
        )}
        {credit && credit !== 'below' && creditEl}
      </div>
      {credit === 'below' && creditEl}
    </>
  )
}
