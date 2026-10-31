import { Container, type Texture } from 'pixi.js'
import { bakeMaskedFace, drawPlaceholderFace } from './face'
import { Fish, type School } from './fish'
import type { SceneLayer, TankWorld } from './layer'
import type { LoadedSpecies } from './species'
import { depthBand, steer } from './steering'
import { canvasTexture, randomBetween } from './util'

/** Longest simulation step, in seconds. */
const MAX_STEP = 1 / 50

/** One person in the tank: their face, and the fish wearing it (one, or a whole school). */
interface Resident {
  species: LoadedSpecies
  faceSource: HTMLCanvasElement
  face: Texture
  fish: Fish[]
}

export interface FishLayer extends SceneLayer {
  /** People in the tank. */
  count(): number
  /** Fish on screen; more than `count()` when someone is a school. */
  swimming(): number
  setCount(count: number): void
  /** Re-cuts every face of one species, after its mask was tuned. */
  refreshSpecies(id: string): void
}

function bakeFace(species: LoadedSpecies, source: HTMLCanvasElement) {
  return canvasTexture(bakeMaskedFace(source, species.config.mask))
}

/** All the fish. Until iteration 2 the residents cycle through the species with placeholder faces. */
export function createFishLayer(species: LoadedSpecies[]): FishLayer {
  const view = new Container()
  view.sortableChildren = true
  const residents: Resident[] = []
  const allFish: Fish[] = []
  const schools: School[] = []
  let world: TankWorld | null = null
  let spawned = 0

  /** Drops a resident's fish somewhere in their depth band; a school starts bunched together. */
  function place(resident: Resident, at: TankWorld) {
    const [lead] = resident.fish
    const band = depthBand(lead, at)
    const direction = Math.random() < 0.5 ? 1 : -1
    lead.setFacing(direction)
    const reach = lead.targetExtents(at.scale)
    const spread = resident.fish.length > 1 ? lead.radius(at.scale) * 2.5 : 0
    const centerX = randomBetween(reach.left + spread, Math.max(reach.left + spread, at.width - reach.right - spread))
    const centerY = randomBetween(band.top, band.bottom)
    for (const fish of resident.fish) {
      fish.setFacing(direction)
      fish.x = centerX + randomBetween(-spread, spread)
      fish.y = centerY + randomBetween(-spread, spread) * 0.5
      fish.vx = direction * fish.config.swim.speed * at.scale
      fish.vy = 0
    }
  }

  function spawn() {
    const kind = species[spawned % species.length]
    const faceSource = drawPlaceholderFace(spawned + 1)
    spawned++
    const face = bakeFace(kind, faceSource)
    const size = Math.max(1, Math.round(kind.config.swim.school ?? 1))
    const fish = Array.from({ length: size }, () => new Fish(kind, face))
    const resident: Resident = { species: kind, faceSource, face, fish }
    if (size > 1) {
      const school: School = { members: fish, depth: Math.random(), depthTimer: randomBetween(6, 14) }
      schools.push(school)
      for (const member of fish) member.school = school
    }
    for (const member of fish) {
      // Big fish swim behind small ones.
      member.view.zIndex = -kind.body.width * kind.body.height * kind.config.scale ** 2
      allFish.push(member)
      view.addChild(member.view)
    }
    if (world) place(resident, world)
    residents.push(resident)
  }

  function remove(resident: Resident) {
    const school = resident.fish[0].school
    if (school) schools.splice(schools.indexOf(school), 1)
    for (const fish of resident.fish) {
      allFish.splice(allFish.indexOf(fish), 1)
      fish.destroy()
    }
    resident.face.destroy(true)
  }

  return {
    view,
    count: () => residents.length,
    swimming: () => allFish.length,
    setCount(count) {
      while (residents.length < count) spawn()
      while (residents.length > count) remove(residents.pop()!)
    },
    refreshSpecies(id) {
      for (const resident of residents) {
        if (resident.species.config.id !== id) continue
        const old = resident.face
        resident.face = bakeFace(resident.species, resident.faceSource)
        for (const fish of resident.fish) fish.setFace(resident.face)
        old.destroy(true)
      }
    },
    resize(next) {
      if (world) {
        // Keep everyone at the same relative spot when the screen rotates.
        for (const fish of allFish) {
          fish.x *= next.width / world.width
          fish.y *= next.height / world.height
        }
      } else {
        for (const resident of residents) place(resident, next)
      }
      world = next
    },
    update(dt) {
      if (!world) return
      // Long frames are split into short steps, so a slow phone swims the same as a fast one.
      const steps = Math.ceil(dt / MAX_STEP)
      const step = dt / steps
      for (let i = 0; i < steps; i++) {
        // Schools rise and fall: every so often each one heads for a new depth in its band.
        for (const school of schools) {
          school.depthTimer -= step
          if (school.depthTimer <= 0) {
            school.depth = Math.random()
            school.depthTimer = randomBetween(6, 14)
          }
        }
        for (const fish of allFish) {
          fish.updateTurn(step, world.scale)
          steer(fish, allFish, world, step)
        }
      }
      for (const fish of allFish) fish.animate(dt, world)
    },
  }
}
