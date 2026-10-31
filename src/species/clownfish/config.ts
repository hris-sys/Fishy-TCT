import type { SpeciesConfig } from '../../tank'
import body from './body.svg'
import tail from './tail.svg'

export const clownfish: SpeciesConfig = {
  id: 'clownfish',
  label: 'Clownfish',
  scale: 0.8,
  body,
  tail: { src: tail, pivot: { x: 42, y: 28 }, attach: { x: -55, y: 0 }, swing: 0.4 },
  // In front of the first white stripe.
  faceSlot: { x: 46, y: 0, size: 46, rotation: 0 },
  mask: { shape: 'oval', width: 0.9, height: 1, feather: 0.06 },
  swim: {
    speed: 42,
    turnRate: 2.2,
    depth: { top: 0.55, bottom: 0.95 },
    wiggleHz: 2.8,
    wander: 0.9,
    bob: 2,
    dart: 2.6,
    predator: false,
    home: 'anemone',
  },
  reaction: 'hide-in-anemone',
}
