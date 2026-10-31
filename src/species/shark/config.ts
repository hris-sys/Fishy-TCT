import type { SpeciesConfig } from '../../tank'
import body from './body.svg'
import tail from './tail.svg'

export const shark: SpeciesConfig = {
  id: 'shark',
  label: 'Shark',
  scale: 0.75,
  body,
  tail: { src: tail, pivot: { x: 66, y: 46 }, attach: { x: -93, y: 2 }, swing: 0.25 },
  // Front of the head, ahead of the gills.
  faceSlot: { x: 76, y: 0, size: 50, rotation: 0 },
  mask: { shape: 'oval', width: 1, height: 0.85, feather: 0.06 },
  swim: {
    speed: 85,
    turnRate: 0.9,
    depth: { top: 0.05, bottom: 0.85 },
    wiggleHz: 1,
    wander: 0.25,
    bob: 1,
    dart: 0,
    predator: true,
  },
  reaction: 'snap',
}
