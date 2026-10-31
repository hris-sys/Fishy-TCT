import type { SpeciesConfig } from '../../tank'
import body from './body.svg'
import tail from './tail.svg'

export const goldfish: SpeciesConfig = {
  id: 'goldfish',
  label: 'Goldfish',
  scale: 0.85,
  body,
  tail: { src: tail, pivot: { x: 76, y: 45 }, attach: { x: -50, y: 2 }, swing: 0.35 },
  faceSlot: { x: 25, y: 0, size: 62, rotation: 0 },
  mask: { shape: 'circle', feather: 0.05 },
  swim: {
    speed: 38,
    turnRate: 1.2,
    depth: { top: 0.1, bottom: 0.5 },
    wiggleHz: 1.3,
    wander: 0.6,
    bob: 3,
    dart: 0,
    predator: false,
  },
  reaction: 'big-bubble',
}
