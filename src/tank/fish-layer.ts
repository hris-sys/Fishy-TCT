import { Container, type Texture } from 'pixi.js'
import type { Effects } from './effects'
import { bakeMaskedFace, drawPlaceholderFace } from './face'
import { Fish, type Owner, type School } from './fish'
import type { SceneLayer, TankWorld } from './layer'
import type { LoadedSpecies } from './species'
import { depthBand, steer } from './steering'
import { canvasTexture, randomBetween } from './util'

/** Longest simulation step, in seconds. */
const MAX_STEP = 1 / 50
/** Falling through the air above the surface, in px/s² at tank scale 1. */
const GRAVITY = 900
/** Seconds between school members dropping in, so a school pours in one after another. */
const DROP_STAGGER = 0.08
/** Seconds for a fish to drift off to sleep, or wake up. */
const SLEEP_EASE = 1.2

const PLACEHOLDER_NAMES = ['Mira', 'Teo', 'Lina', 'Bo', 'Ari', 'Niko', 'Zoe', 'Ivo', 'Sana', 'Max', 'Ema', 'Dani', 'Rui', 'Kai', 'Lea', 'Tom', 'Vera', 'Omar', 'Yuki', 'Pia']

/** What the app knows about one person's fish. */
export interface ResidentInput {
  id: string
  name: string
  /** Species id; unknown ids fall back to the first species. */
  species: string
  /** Body colour multiplier as 0xRRGGBB, or null for natural colours. */
  tint?: number | null
  /** The unmasked square face crop. Each species cuts it to its own mask. */
  face: CanvasImageSource
}

/** One person in the tank: their face, and the fish wearing it (one, or a whole school). */
interface Resident {
  owner: Owner
  species: LoadedSpecies
  faceSource: CanvasImageSource
  face: Texture
  fish: Fish[]
  placeholder: boolean
  /** Removed, and swimming off-screen; gone for good once every fish has left. */
  leaving: boolean
  /** Seconds until the next "z" while asleep. */
  snoreTimer: number
}

export interface FishLayer extends SceneLayer {
  /** People in the tank, placeholders included. */
  count(): number
  /** Fish on screen; more than `count()` when someone is a school. */
  swimming(): number
  placeholderCount(): number
  /** Stand-in people with cartoon faces, for an empty tank and for stress tests. */
  setPlaceholders(count: number): void
  add(input: ResidentInput, dropIn: boolean): void
  /** Applies a change. Name and tint change in place; a new species or face rebuilds the fish where they are. */
  edit(id: string, changes: Partial<Omit<ResidentInput, 'id'>>): void
  /** With `swimAway`, the fish swim off the nearest side before disappearing. */
  remove(id: string, swimAway: boolean): void
  setAsleep(id: string, asleep: boolean): void
  /** Re-cuts every face of one species, after its mask was tuned. */
  refreshSpecies(id: string): void
  /** The fish nearest to a screen point, if the point is on or close to it. */
  fishAt(x: number, y: number): Fish | null
  firstFishOf(id: string): Fish | null
}

/** Everybody's fish: steering, schools, and dropping new fish in. */
export function createFishLayer(species: LoadedSpecies[], effects: Effects): FishLayer {
  const view = new Container()
  view.sortableChildren = true
  const residents: Resident[] = []
  const allFish: Fish[] = []
  const schools: School[] = []
  let world: TankWorld | null = null
  let placeholdersMade = 0

  const findSpecies = (id: string) => species.find((kind) => kind.config.id === id) ?? species[0]
  const bake = (kind: LoadedSpecies, source: CanvasImageSource) => canvasTexture(bakeMaskedFace(source, kind.config.mask))

  /** Puts a resident's fish somewhere in their depth band; a school starts bunched together. */
  function place(resident: Resident, at: TankWorld, dropIn: boolean) {
    const [lead] = resident.fish
    const band = depthBand(lead, at)
    const direction = Math.random() < 0.5 ? 1 : -1
    lead.setFacing(direction)
    const reach = lead.targetExtents(at.scale)
    const spread = resident.fish.length > 1 ? lead.radius(at.scale) * 2.5 : 0
    const centerX = randomBetween(reach.left + spread, Math.max(reach.left + spread, at.width - reach.right - spread))
    const centerY = randomBetween(band.top, band.bottom)
    resident.fish.forEach((fish, i) => {
      fish.setFacing(direction)
      fish.x = centerX + randomBetween(-spread, spread)
      if (dropIn) {
        // Start above the surface, just out of sight, and fall in.
        fish.y = -fish.halfHeight(at.scale) - 6 * at.scale
        fish.vx = direction * fish.config.swim.speed * at.scale * 0.4
        fish.vy = 120 * at.scale
        fish.entering = { delay: i * DROP_STAGGER, inWater: 0, splashed: false }
      } else {
        fish.y = centerY + randomBetween(-spread, spread) * 0.5
        fish.vx = direction * fish.config.swim.speed * at.scale
        fish.vy = 0
      }
    })
  }

  /** Builds the fish for a resident and adds them to the scene. */
  function populate(resident: Resident) {
    const kind = resident.species
    const size = Math.max(1, Math.round(kind.config.swim.school ?? 1))
    resident.fish = Array.from({ length: size }, () => new Fish(kind, resident.face, resident.owner))
    if (size > 1) {
      const school: School = { members: resident.fish, depth: Math.random(), depthTimer: randomBetween(6, 14) }
      schools.push(school)
      for (const fish of resident.fish) fish.school = school
    }
    for (const fish of resident.fish) {
      // Big fish swim behind small ones.
      fish.view.zIndex = -kind.body.width * kind.body.height * kind.config.scale ** 2
      allFish.push(fish)
      view.addChild(fish.view)
    }
  }

  function unpopulate(resident: Resident) {
    const school = resident.fish[0]?.school
    if (school) schools.splice(schools.indexOf(school), 1)
    for (const fish of resident.fish) {
      allFish.splice(allFish.indexOf(fish), 1)
      fish.destroy()
    }
    resident.fish = []
  }

  function addResident(input: ResidentInput, placeholder: boolean, dropIn: boolean) {
    const kind = findSpecies(input.species)
    const resident: Resident = {
      owner: { id: input.id, name: input.name, tint: input.tint ?? null, asleep: false, awake: 1 },
      species: kind,
      faceSource: input.face,
      face: bake(kind, input.face),
      fish: [],
      placeholder,
      leaving: false,
      snoreTimer: randomBetween(0.5, 2.5),
    }
    populate(resident)
    if (world) place(resident, world, dropIn)
    residents.push(resident)
  }

  function removeResident(resident: Resident) {
    unpopulate(resident)
    resident.face.destroy(true)
    residents.splice(residents.indexOf(resident), 1)
  }

  /** Swims a removed fish off the side of the tank. Returns true once it is out of sight. */
  function swimAway(fish: Fish, at: TankWorld, dt: number) {
    const direction = fish.leaving!.direction
    const s = at.scale
    // Brisk, even for slow species, so a removal doesn't take ages.
    const cruise = Math.max(fish.config.swim.speed * 1.8, 110) * s
    fish.vx += (direction * cruise - fish.vx) * dt * 2.5
    fish.vy -= fish.vy * dt * 2
    fish.x += fish.vx * dt
    fish.y += fish.vy * dt
    const reach = fish.halfWidth(s) * 1.4
    return direction > 0 ? fish.x - reach > at.width : fish.x + reach < 0
  }

  function startLeaving(resident: Resident, at: TankWorld) {
    resident.leaving = true
    for (const fish of resident.fish) {
      fish.entering = null
      fish.leaving = { direction: fish.x < at.width / 2 ? -1 : 1 }
    }
  }

  /** The fall: through the air, a splash at the surface, then quickly slowed by the water. */
  function fall(fish: Fish, at: TankWorld, dt: number) {
    const entering = fish.entering!
    if (entering.delay > 0) {
      entering.delay -= dt
      return
    }
    const s = at.scale
    if (fish.y < 0) {
      fish.vy += GRAVITY * s * dt
    } else {
      if (!entering.splashed) {
        entering.splashed = true
        effects.splash(fish.x, fish.radius(s))
      }
      entering.inWater += dt
      const drag = Math.exp(-dt * 3)
      const cruise = fish.config.swim.speed * s
      fish.vy *= drag
      fish.vx += (Math.sign(fish.vx || 1) * cruise - fish.vx) * dt * 2
      if (Math.random() < dt * 14) effects.bubbles(fish.x, fish.y, 1, fish.radius(s))
      if (entering.inWater > 1.1) fish.entering = null
    }
    fish.x += fish.vx * dt
    fish.y += fish.vy * dt
  }

  return {
    view,
    count: () => residents.filter((resident) => !resident.leaving).length,
    swimming: () => allFish.length,
    placeholderCount: () => residents.filter((resident) => resident.placeholder).length,
    setPlaceholders(count) {
      const current = residents.filter((resident) => resident.placeholder)
      for (let i = current.length; i < count; i++) {
        const n = placeholdersMade++
        addResident(
          {
            id: `placeholder-${n}`,
            name: PLACEHOLDER_NAMES[n % PLACEHOLDER_NAMES.length],
            species: species[n % species.length].config.id,
            face: drawPlaceholderFace(n + 1),
          },
          true,
          false,
        )
      }
      for (const resident of current.slice(count).reverse()) removeResident(resident)
    },
    add(input, dropIn) {
      for (const existing of residents.filter((resident) => resident.owner.id === input.id)) removeResident(existing)
      addResident(input, false, dropIn)
    },
    edit(id, changes) {
      const resident = residents.find((r) => r.owner.id === id && !r.leaving)
      if (!resident) return
      if (changes.name !== undefined) resident.owner.name = changes.name
      if (changes.tint !== undefined) resident.owner.tint = changes.tint
      if (changes.species === undefined && changes.face === undefined) return
      // New species or face: rebuild the fish, keeping them roughly where they were.
      const anchor = resident.fish[0]
      const spot = anchor ? { x: anchor.x, y: anchor.y, vx: anchor.vx } : null
      unpopulate(resident)
      resident.face.destroy(true)
      if (changes.species !== undefined) resident.species = findSpecies(changes.species)
      if (changes.face !== undefined) resident.faceSource = changes.face
      resident.face = bake(resident.species, resident.faceSource)
      populate(resident)
      if (world) place(resident, world, false)
      if (spot) {
        for (const fish of resident.fish) {
          fish.x = spot.x + randomBetween(-10, 10)
          fish.y = spot.y + randomBetween(-6, 6)
          fish.vx = spot.vx
          fish.setFacing(spot.vx < 0 ? -1 : 1)
        }
      }
    },
    remove(id, swimAway) {
      const resident = residents.find((r) => r.owner.id === id && !r.leaving)
      if (!resident) return
      if (swimAway && world) startLeaving(resident, world)
      else removeResident(resident)
    },
    setAsleep(id, asleep) {
      const resident = residents.find((r) => r.owner.id === id && !r.leaving)
      if (resident) resident.owner.asleep = asleep
    },
    refreshSpecies(id) {
      for (const resident of residents) {
        if (resident.species.config.id !== id) continue
        const old = resident.face
        resident.face = bake(resident.species, resident.faceSource)
        for (const fish of resident.fish) fish.setFace(resident.face)
        old.destroy(true)
      }
    },
    fishAt(x, y) {
      if (!world) return null
      let best: Fish | null = null
      let bestDistance = Infinity
      for (const fish of allFish) {
        if (!fish.view.visible || fish.leaving) continue
        const distance = Math.hypot(fish.x - x, fish.y - y)
        // Generous reach, so small fish are easy to hit with a finger.
        const reach = Math.max(fish.radius(world.scale) * 1.3, 24)
        if (distance < reach && distance < bestDistance) {
          best = fish
          bestDistance = distance
        }
      }
      return best
    },
    firstFishOf(id) {
      return residents.find((r) => r.owner.id === id && !r.leaving)?.fish[0] ?? null
    },
    resize(next) {
      if (world) {
        // Keep everyone at the same relative spot when the screen rotates.
        for (const fish of allFish) {
          fish.x *= next.width / world.width
          fish.y *= next.height / world.height
        }
      } else {
        for (const resident of residents) place(resident, next, false)
      }
      world = next
    },
    update(dt) {
      if (!world) return
      // Long frames are split into short steps, so a slow phone swims the same as a fast one.
      const steps = Math.ceil(dt / MAX_STEP)
      const step = dt / steps
      for (let i = 0; i < steps; i++) {
        // Schools rise and fall: every so often each one heads for a clearly different depth.
        for (const school of schools) {
          school.depthTimer -= step
          if (school.depthTimer <= 0) {
            let next = Math.random()
            if (Math.abs(next - school.depth) < 0.35) next = (next + 0.5) % 1
            school.depth = next
            school.depthTimer = randomBetween(7, 14)
          }
        }
        for (const fish of allFish) {
          fish.updateTurn(step, world.scale)
          if (fish.leaving) swimAway(fish, world, step)
          else if (fish.entering) fall(fish, world, step)
          else steer(fish, allFish, world, step)
        }
      }
      for (const resident of [...residents]) {
        // Removed fish are deleted once every one of them has left the screen.
        if (resident.leaving) {
          const s = world.scale
          const gone = resident.fish.every((fish) => {
            const reach = fish.halfWidth(s) * 1.4
            return fish.x - reach > world!.width || fish.x + reach < 0
          })
          if (gone) removeResident(resident)
          continue
        }
        // Drift off to sleep, or wake up, gradually.
        const owner = resident.owner
        owner.awake += ((owner.asleep ? 0 : 1) - owner.awake) * (1 - Math.exp(-dt / SLEEP_EASE))
        // Sleepers blow a "z" every few seconds, from one fish of a school.
        if (owner.awake < 0.5) {
          resident.snoreTimer -= dt
          if (resident.snoreTimer <= 0) {
            resident.snoreTimer = randomBetween(2, 3.5)
            const fish = resident.fish[Math.floor(Math.random() * resident.fish.length)]
            if (fish && !fish.entering) effects.snore(fish.x + Math.sign(fish.vx || 1) * fish.halfWidth(world.scale) * 0.4, fish.y - fish.halfHeight(world.scale))
          }
        }
      }
      for (const fish of allFish) fish.animate(dt, world)
    },
  }
}
