import type { Fish } from './fish'
import type { TankWorld } from './layer'
import { clamp, lerp, randomBetween } from './util'

/** Gap kept free under the surface, in px at tank scale 1. */
const SURFACE_GAP = 10
/** Fish prefer swimming level: the vertical part of where they want to go is scaled by this. */
const LEVEL_BIAS = 0.35
/** How strongly the wander offset drifts back to straight ahead, per second. */
const WANDER_PULL = 0.8
/** Random push on the wander offset at wander = 1, in radians per √second. */
const WANDER_JITTER = 2.4
const MAX_WANDER = 1.1
/** Spring pulling a fish back into its depth band, per second². */
const BAND_PULL = 2
const WALL_PUSH = 3
const SEPARATION_PUSH = 4
const FLEE_PUSH = 6
/** A predator is noticed this many times its own size away. */
const FLEE_RANGE = 2.2
const HOME_RADIUS = 80

/** The vertical range a fish's center may use: below the surface and above the sand. */
export function waterColumn(fish: Fish, world: TankWorld) {
  const halfHeight = fish.halfHeight(world.scale)
  return { top: SURFACE_GAP * world.scale + halfHeight, bottom: world.sandY - halfHeight * 0.6 }
}

/** Where in the column this fish's species likes to be. */
export function depthBand(fish: Fish, world: TankWorld) {
  const column = waterColumn(fish, world)
  const { top, bottom } = fish.config.swim.depth
  return { top: lerp(column.top, column.bottom, top), bottom: lerp(column.top, column.bottom, bottom), column }
}

/**
 * Moves one fish for one frame. Forces add up to an acceleration: wander (meander along the
 * current heading), stay in the depth band, keep off the walls, keep a little space from
 * neighbours, flee predators, and for some species head home.
 */
export function steer(fish: Fish, school: readonly Fish[], world: TankWorld, dt: number) {
  const { swim } = fish.config
  const s = world.scale

  // Darting: a sudden burst of speed every few seconds that fades out quickly.
  if (swim.dart > 0) {
    fish.dartTimer -= dt
    if (fish.dartTimer <= 0) {
      fish.boost = Math.max(fish.boost, swim.dart - 1)
      fish.dartTimer = randomBetween(1.5, 4)
    }
  }
  fish.boost *= Math.exp(-dt * 2.5)

  const cruise = swim.speed * s * (1 + fish.boost)
  let ax = 0
  let ay = 0

  // Wander: aim slightly off the current heading, with the offset drifting smoothly at random.
  fish.wander += -fish.wander * WANDER_PULL * dt + (Math.random() * 2 - 1) * WANDER_JITTER * swim.wander * Math.sqrt(dt)
  fish.wander = clamp(fish.wander, -MAX_WANDER, MAX_WANDER)
  const heading = Math.atan2(fish.vy, fish.vx) + fish.wander
  ax += (Math.cos(heading) * cruise - fish.vx) * swim.turnRate
  ay += (Math.sin(heading) * LEVEL_BIAS * cruise - fish.vy) * swim.turnRate

  // Depth band: a soft spring back toward the preferred depth.
  const band = depthBand(fish, world)
  if (fish.y < band.top) ay += (band.top - fish.y) * BAND_PULL
  else if (fish.y > band.bottom) ay -= (fish.y - band.bottom) * BAND_PULL

  // Walls: push away from the sides, harder the closer the fish gets. Margins include the tail.
  const reach = fish.targetExtents(s)
  const gap = Math.min(40 * s, world.width * 0.08)
  const leftMargin = reach.left + gap
  const rightMargin = reach.right + gap
  const push = cruise * swim.turnRate * WALL_PUSH
  let wall = 0
  if (fish.x < leftMargin) wall = (leftMargin - fish.x) / leftMargin
  else if (fish.x > world.width - rightMargin) wall = -(fish.x - (world.width - rightMargin)) / rightMargin
  if (wall !== 0) {
    ax += wall * push
    // Curve up or down through the turn, toward the middle of the band, instead of reversing on the spot.
    const headingIntoWall = fish.vx * wall < 0
    if (headingIntoWall) {
      const bandMiddle = (band.top + band.bottom) / 2
      ay += Math.sign(bandMiddle - fish.y || 1) * Math.abs(wall) * push * 0.5
    }
  }

  // Neighbours: a light push apart, and a hard swerve away from nearby predators.
  const radius = fish.radius(s)
  for (const other of school) {
    if (other === fish) continue
    const dx = fish.x - other.x
    const dy = fish.y - other.y
    const distance = Math.hypot(dx, dy) || 0.001
    const otherRadius = other.radius(s)

    const personalSpace = radius + otherRadius
    if (distance < personalSpace) {
      const strength = (1 - distance / personalSpace) * cruise * SEPARATION_PUSH
      ax += (dx / distance) * strength
      ay += (dy / distance) * strength * 0.6
    }

    if (other.config.swim.predator && !swim.predator) {
      const range = otherRadius * FLEE_RANGE
      if (distance < range) {
        const fear = 1 - distance / range
        ax += (dx / distance) * fear * cruise * FLEE_PUSH
        ay += (dy / distance) * fear * cruise * FLEE_PUSH
        fish.boost = Math.max(fish.boost, fear * 1.2)
      }
    }
  }

  // Home: drift back toward the anemone once too far away from it.
  if (swim.home === 'anemone') {
    const homeX = world.anemone.x
    const homeY = clamp(world.anemone.y - 60 * s, band.top, band.bottom)
    const dx = homeX - fish.x
    const dy = homeY - fish.y
    const distance = Math.hypot(dx, dy) || 0.001
    const homeRadius = HOME_RADIUS * s
    if (distance > homeRadius) {
      const pull = Math.min((distance - homeRadius) / homeRadius, 1) * cruise * swim.turnRate * 1.5
      ax += (dx / distance) * pull
      ay += (dy / distance) * pull
    }
  }

  // Integrate, with a speed cap.
  fish.vx += ax * dt
  fish.vy += ay * dt
  const speed = Math.hypot(fish.vx, fish.vy)
  const maxSpeed = cruise * 1.6
  if (speed > maxSpeed) {
    fish.vx *= maxSpeed / speed
    fish.vy *= maxSpeed / speed
  }
  fish.x += fish.vx * dt
  fish.y += fish.vy * dt

  // Safety net: never leave the tank, whatever the forces did.
  const now = fish.extents(s)
  const minX = now.left
  const maxX = Math.max(minX, world.width - now.right)
  if (fish.x < minX) {
    fish.x = minX
    fish.vx = Math.max(0, fish.vx)
  } else if (fish.x > maxX) {
    fish.x = maxX
    fish.vx = Math.min(0, fish.vx)
  }
  if (fish.y < band.column.top) {
    fish.y = band.column.top
    fish.vy = Math.max(0, fish.vy)
  } else if (fish.y > band.column.bottom) {
    fish.y = band.column.bottom
    fish.vy = Math.min(0, fish.vy)
  }
}
