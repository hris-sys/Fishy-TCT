import type { SpeciesConfig } from '../../tank'
import body from './body.svg'
import tail from './tail.svg'

export const pufferfish: SpeciesConfig = {
  id: 'pufferfish',
  label: 'Pufferfish',
  scale: 0.4,
  body,
  tail: { src: tail, pivot: { x: 32, y: 20 }, attach: { x: -38, y: 1 }, swing: 0.5 },
  // The face is the whole body.
  faceSlot: { x: 2, y: 1, size: 78, rotation: 0 },
  mask: { shape: 'circle', feather: 0.04 },
  swim: {
    speed: 16,
    turnRate: 1,
    depth: { top: 0.3, bottom: 0.75 },
    wiggleHz: 2.8,
    wander: 0.5,
    bob: 3.5,
    dart: 0,
    predator: false,
  },
  reaction: 'puff',
}
