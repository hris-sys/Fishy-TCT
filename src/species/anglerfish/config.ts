import type { SpeciesConfig } from '../../tank'
import body from './body.svg'
import tail from './tail.svg'

export const anglerfish: SpeciesConfig = {
  id: 'anglerfish',
  label: 'Anglerfish',
  scale: 0.8,
  body,
  tail: { src: tail, pivot: { x: 46, y: 30 }, attach: { x: -55, y: 8 }, swing: 0.3 },
  // Under the glowing lure.
  faceSlot: { x: 30, y: 4, size: 64, rotation: 0 },
  // Flat-ish top under the lure, round chin.
  mask: {
    shape: 'path',
    d: 'M8 30 C8 12 30 6 50 6 C70 6 92 12 92 30 L92 58 C92 82 74 96 50 96 C26 96 8 82 8 58 Z',
    feather: 0.05,
  },
  swim: {
    speed: 16,
    turnRate: 0.8,
    depth: { top: 0.88, bottom: 1 },
    wiggleHz: 1.2,
    wander: 0.4,
    bob: 1.5,
    dart: 0,
    predator: false,
  },
  reaction: 'lure-flash',
}
