import { Pane } from 'tweakpane'
import type { SpeciesConfig, Tank } from '../tank'

/**
 * Live tuning panel, shown with ?debug. It edits the species configs in place, and the tank reads
 * them every frame. "Copy config" puts the tuned numbers on the clipboard (and in the console),
 * ready to paste back into src/species/<id>/config.ts.
 */
export function showDebugPanel(tank: Tank, species: SpeciesConfig[]) {
  const pane = new Pane({ title: 'Tune', expanded: false })

  const tankParams = { people: tank.fishCount() }
  pane.addBinding(tankParams, 'people', { min: 0, max: 40, step: 1 }).on('change', (e) => tank.setFishCount(e.value))

  for (const config of species) {
    const folder = pane.addFolder({ title: config.label, expanded: false })
    folder.addBinding(config, 'scale', { min: 0.1, max: 1.5, step: 0.02 })

    const swim = folder.addFolder({ title: 'Swim' })
    swim.addBinding(config.swim, 'speed', { min: 5, max: 200, step: 1 })
    swim.addBinding(config.swim, 'turnRate', { label: 'turn rate', min: 0.2, max: 5, step: 0.1 })
    swim.addBinding(config.swim.depth, 'top', { label: 'depth top', min: 0, max: 1, step: 0.01 })
    swim.addBinding(config.swim.depth, 'bottom', { label: 'depth bottom', min: 0, max: 1, step: 0.01 })
    swim.addBinding(config.swim, 'wiggleHz', { label: 'wiggle Hz', min: 0.2, max: 6, step: 0.1 })
    swim.addBinding(config.swim, 'wander', { min: 0, max: 1.5, step: 0.05 })
    swim.addBinding(config.swim, 'bob', { min: 0, max: 15, step: 0.5 })
    swim.addBinding(config.swim, 'dart', { min: 0, max: 5, step: 0.1 })

    const face = folder.addFolder({ title: 'Face', expanded: false })
    face.addBinding(config.faceSlot, 'x', { min: -150, max: 150, step: 1 })
    face.addBinding(config.faceSlot, 'y', { min: -80, max: 80, step: 1 })
    face.addBinding(config.faceSlot, 'size', { min: 10, max: 160, step: 1 })
    face.addBinding(config.faceSlot, 'rotation', { min: -0.8, max: 0.8, step: 0.01 })
    face.addBinding(config.tail, 'swing', { label: 'tail swing', min: 0, max: 1, step: 0.01 })

    const recut = () => tank.refreshSpecies(config.id)
    face.addBinding(config.mask, 'feather', { min: 0, max: 0.3, step: 0.005 }).on('change', recut)
    if (config.mask.shape === 'oval') {
      face.addBinding(config.mask, 'width', { label: 'mask width', min: 0.3, max: 1, step: 0.01 }).on('change', recut)
      face.addBinding(config.mask, 'height', { label: 'mask height', min: 0.3, max: 1, step: 0.01 }).on('change', recut)
    }
  }

  pane.addButton({ title: 'Copy config' }).on('click', () => {
    const tuned = species.map(({ id, scale, tail, faceSlot, mask, swim }) => ({
      id,
      scale,
      tailSwing: tail.swing,
      faceSlot,
      mask,
      swim,
    }))
    const json = JSON.stringify(tuned, null, 2)
    console.log(json)
    navigator.clipboard?.writeText(json).catch(() => {})
  })
}
