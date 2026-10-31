import type { SpeciesConfig } from '../../tank'
import body from './body.svg'
import tail from './tail.svg'

export const chromis: SpeciesConfig = {
  id: 'chromis',
  label: 'Blue chromis',
  scale: 0.5,
  body,
  tail: { src: tail, pivot: { x: 31, y: 22 }, attach: { x: -41, y: 0 }, swing: 0.38 },
  faceSlot: { x: 26, y: -1, size: 40, rotation: 0 },
  mask: { shape: 'circle', feather: 0.06 },
  swim: {
    speed: 42,
    turnRate: 1.8,
    depth: { top: 0.1, bottom: 0.55 },
    wiggleHz: 3.4,
    wander: 0.45,
    bob: 1.2,
    dart: 0,
    predator: false,
    // One person = a school of seven, all wearing their face.
    school: 7,
  },
  reaction: 'scatter',
}
