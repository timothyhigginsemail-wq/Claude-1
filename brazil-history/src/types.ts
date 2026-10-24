import type { ReactNode } from 'react'

export type ActId = 'prologue' | 'I' | 'II' | 'III' | 'IV' | 'V' | 'coda'

export interface SlideDef {
  id: string
  act: ActId
  /** Short label for menus and the progress bar */
  short: string
  /** Number of internal build steps (arrow keys walk through them before advancing) */
  steps?: number
  render: (step: number) => ReactNode
  /** The "deeper explanation" — shown in the notes drawer and in print */
  notes?: ReactNode
  /** Short source keys shown in the drawer, resolved against the bibliography */
  sources?: string[]
}

export interface ActMeta {
  id: ActId
  numeral: string
  title: string
  span: string
  color: string
}
