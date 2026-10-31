import { Container } from 'pixi.js'
import { drawPlaceholderFace } from './face'
import { Fish } from './fish'
import type { SceneLayer, TankWorld } from './layer'
import type { LoadedSpecies } from './species'
import { depthBand, steer } from './steering'
import { randomBetween } from './util'

/** Longest simulation step, in seconds. */
const MAX_STEP = 1 / 50

export interface School extends SceneLayer {
  count(): number
  setCount(count: number): void
  /** Re-cuts every face of one species, after its mask was tuned. */
  refreshSpecies(id: string): void
}

/** All the fish. Until iteration 2 they cycle through the species with placeholder faces. */
export function createSchool(species: LoadedSpecies[]): School {
  const view = new Container()
  view.sortableChildren = true
  const fishes: Fish[] = []
  let world: TankWorld | null = null
  let spawned = 0

  function place(fish: Fish, at: TankWorld) {
    const band = depthBand(fish, at)
    const direction = Math.random() < 0.5 ? 1 : -1
    fish.setFacing(direction)
    const reach = fish.targetExtents(at.scale)
    fish.x = randomBetween(reach.left, Math.max(reach.left, at.width - reach.right))
    fish.y = randomBetween(band.top, band.bottom)
    fish.vx = direction * fish.config.swim.speed * at.scale
    fish.vy = 0
  }

  function spawn() {
    const kind = species[spawned % species.length]
    const fish = new Fish(kind, drawPlaceholderFace(spawned + 1))
    spawned++
    // Big fish swim behind small ones.
    fish.view.zIndex = -kind.body.width * kind.body.height * kind.config.scale ** 2
    if (world) place(fish, world)
    fishes.push(fish)
    view.addChild(fish.view)
  }

  return {
    view,
    count: () => fishes.length,
    setCount(count) {
      while (fishes.length < count) spawn()
      while (fishes.length > count) fishes.pop()!.destroy()
    },
    refreshSpecies(id) {
      for (const fish of fishes) if (fish.config.id === id) fish.refreshFace()
    },
    resize(next) {
      if (world) {
        // Keep everyone at the same relative spot when the screen rotates.
        for (const fish of fishes) {
          fish.x *= next.width / world.width
          fish.y *= next.height / world.height
        }
      } else {
        for (const fish of fishes) place(fish, next)
      }
      world = next
    },
    update(dt) {
      if (!world) return
      // Long frames are split into short steps, so a slow phone swims the same as a fast one.
      const steps = Math.ceil(dt / MAX_STEP)
      const step = dt / steps
      for (let i = 0; i < steps; i++) {
        for (const fish of fishes) {
          fish.updateTurn(step, world.scale)
          steer(fish, fishes, world, step)
        }
      }
      for (const fish of fishes) fish.animate(dt, world.scale)
    },
  }
}
