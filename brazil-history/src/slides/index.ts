import type { ActMeta, SlideDef } from '../types'
import { prologueSlides } from './prologue'
import { act1Slides } from './act1'
import { act2Slides } from './act2'
import { act3Slides } from './act3'
import { act4Slides } from './act4'
import { act5Slides } from './act5'
import { codaSlides } from './coda'

export const acts: ActMeta[] = [
  { id: 'prologue', numeral: '·', title: 'Prologue', span: 'The question', color: '#c8865f' },
  { id: 'I', numeral: 'I', title: 'The Making of Colonial Brazil', span: 'c. 1500–1808', color: '#8fae63' },
  { id: 'II', numeral: 'II', title: 'An Empire in the Tropics', span: '1808–1889', color: '#b07196' },
  { id: 'III', numeral: 'III', title: 'The Creation of Modern Brazil', span: '1889–1954', color: '#d0a54a' },
  { id: 'IV', numeral: 'IV', title: 'Dictatorship, Democracy & the Economy', span: '1955–2026', color: '#7f93b0' },
  { id: 'V', numeral: 'V', title: 'Brazil and Rio Today', span: 'Reading the present', color: '#d27a5c' },
  { id: 'coda', numeral: '∴', title: 'Coda', span: 'Mental models & sources', color: '#c9b98f' },
]

export const slides: SlideDef[] = [
  ...prologueSlides, ...act1Slides, ...act2Slides, ...act3Slides, ...act4Slides, ...act5Slides, ...codaSlides,
]
