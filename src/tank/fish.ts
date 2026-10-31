import { Container, Sprite, type Texture } from 'pixi.js'
import { FACE_SIZE } from './face'
import type { TankWorld } from './layer'
import type { LoadedSpecies, SpeciesConfig } from './species'
import { clamp, lerp, randomBetween } from './util'

/** Seconds for a full left-to-right turn. */
const TURN_SECONDS = 0.45
/** Steepest nose-up or nose-down tilt, in radians. */
const MAX_PITCH = 0.4
const BOB_HZ = 0.3
/** Water absorbs red light: fish near the sand are tinted toward this colour (bodies only, never faces). */
const DEEP_TINT = [150, 182, 210]
const DEEP_TINT_STRENGTH = 0.55

/** Overshoots a little before settling, like something springy. */
const easeOutBack = (t: number) => 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2

/** Who a fish belongs to. Shared by all of one person's fish, so an edit reaches the whole school. */
export interface Owner {
  id: string
  name: string
  /** Body colour multiplier as 0xRRGGBB, or null for the species' natural colours. */
  tint: number | null
  /** The owner is offline: their fish dozes. */
  asleep: boolean
  /** 1 when fully awake, 0 when fully asleep; eases toward `asleep` so changes look gradual. */
  awake: number
}

/** A group of fish wearing the same face, steering as one. */
export interface School {
  members: Fish[]
  /** Depth the school is heading for: 0 is the top of its band, 1 the bottom. Changes every few seconds. */
  depth: number
  /** Seconds until the school picks a new depth. */
  depthTimer: number
}

/**
 * One fish: a body and tail that flip when it turns, plus a face that follows the head but is
 * never mirrored. Position and velocity are driven by the steering code; this class only draws.
 * The face texture belongs to the owner and may be shared by a whole school.
 */
export class Fish {
  readonly view = new Container()
  readonly species: LoadedSpecies
  readonly owner: Owner

  x = 0
  y = 0
  vx = 0
  vy = 0
  /** Wander offset from the current heading, in radians. */
  wander = 0
  /** Extra speed from a dart or a scare, as a multiple of cruise speed. Decays to 0. */
  boost = 0
  /** Seconds until the next dart. */
  dartTimer = Math.random() * 3
  /** The school this fish belongs to; null for a fish that swims alone. */
  school: School | null = null
  /** Small per-fish speed difference, so a school doesn't move in lockstep. */
  readonly pace = randomBetween(0.9, 1.1)
  /**
   * Set while the fish is dropping in from above the surface. Until `delay` runs out it is hidden;
   * steering takes over once it has slowed down in the water.
   */
  entering: { delay: number; inWater: number; splashed: boolean } | null = null
  /** Set when the fish has been removed and is swimming off-screen toward this side. */
  leaving: { direction: 1 | -1 } | null = null
  /** The tap reaction playing right now (its species' `reaction`), and how long it has run. */
  reaction: { kind: string; t: number } | null = null
  /** 0 normally, 1 when tucked into the anemone (clownfish). */
  hiding = 0
  /** Seconds left showing the blub ("O" mouth) face, if there is one. */
  blub = 0
  /** Seconds left of a chomp, after eating a flake. */
  chomp = 0
  /** Extra size for this fish only (TV mode shows bigger fish without bigger scenery). */
  zoom = 1

  private readonly flip = new Container()
  private readonly tail: Sprite
  private readonly body: Sprite
  private readonly face: Sprite
  /** Optional light on the body, e.g. the anglerfish's lure. */
  private readonly glow: Sprite | null
  private faceTexture: Texture
  private blubTexture: Texture | null
  private glowPhase = Math.random() * Math.PI * 2

  /** 0 when facing right, π when facing left; scale.x is its cosine, so a turn squashes through 0. */
  private turn = 0
  private flipX = 1
  private facing: 1 | -1 = 1
  private pitch = 0
  private tailPhase = Math.random() * Math.PI * 2
  private bobPhase = Math.random() * Math.PI * 2

  constructor(species: LoadedSpecies, face: Texture, blub: Texture | null, owner: Owner, glowTexture: Texture) {
    this.species = species
    this.owner = owner
    this.faceTexture = face
    this.blubTexture = blub
    this.tail = new Sprite(species.tail)
    this.body = new Sprite(species.body)
    this.body.anchor.set(0.5)
    this.face = new Sprite(face)
    this.face.anchor.set(0.5)
    this.flip.addChild(this.tail, this.body)
    const glow = species.config.glow
    this.glow = glow ? new Sprite(glowTexture) : null
    if (this.glow && glow) {
      this.glow.anchor.set(0.5)
      this.glow.blendMode = 'add'
      this.glow.tint = '#fff1a0'
      this.glow.position.set(glow.x, glow.y)
      this.flip.addChild(this.glow)
    }
    this.view.addChild(this.flip, this.face)
  }

  get config(): SpeciesConfig {
    return this.species.config
  }

  setFace(face: Texture, blub: Texture | null) {
    this.faceTexture = face
    this.blubTexture = blub
  }

  /** 1 when facing right, -1 when facing left. */
  get facingSign() {
    return this.facing
  }

  /** Art units from the center to the nose, and to the tail tip. */
  private reach() {
    const front = this.body.texture.width / 2
    const back = Math.max(front, Math.abs(this.config.tail.attach.x) + this.config.tail.pivot.x)
    return { front, back }
  }

  /** Half the fish's on-screen length, tail included, in px. */
  halfWidth(worldScale: number) {
    const { front, back } = this.reach()
    return ((front + back) / 2) * this.config.scale * this.zoom * worldScale
  }

  halfHeight(worldScale: number) {
    return this.body.texture.height * 0.5 * this.config.scale * this.zoom * worldScale
  }

  /** Rough size for keeping fish apart, in px. */
  radius(worldScale: number) {
    return (this.halfWidth(worldScale) + this.halfHeight(worldScale)) * 0.5
  }

  /**
   * How far the fish reaches left and right of its center right now, in px. Follows the turn
   * smoothly, so clamping to it never makes the fish jump.
   */
  extents(worldScale: number) {
    const { front, back } = this.reach()
    const s = this.config.scale * this.zoom * worldScale
    // A tilted fish sticks out a little further sideways.
    const tilt = Math.abs(Math.sin(this.pitch)) * this.body.texture.height * 0.5 * s
    const f = Math.abs(this.flipX)
    return this.flipX >= 0
      ? { left: back * s * f + tilt, right: front * s * f + tilt }
      : { left: front * s * f + tilt, right: back * s * f + tilt }
  }

  /** Like `extents`, but for the direction the fish is turning toward. Used to start turning early. */
  targetExtents(worldScale: number) {
    const { front, back } = this.reach()
    const s = this.config.scale * this.zoom * worldScale
    return this.facing === 1 ? { left: back * s, right: front * s } : { left: front * s, right: back * s }
  }

  setFacing(direction: 1 | -1) {
    this.facing = direction
    this.turn = direction === 1 ? 0 : Math.PI
    this.flipX = direction
  }

  /** Turns toward the swim direction. Runs every simulation step, before steering. */
  updateTurn(dt: number, worldScale: number) {
    // Slack, so a fish swimming nearly vertically doesn't flip back and forth.
    const cruise = this.config.swim.speed * worldScale
    if (this.vx * this.facing < -0.25 * cruise) this.facing = this.facing === 1 ? -1 : 1
    const step = (Math.PI / TURN_SECONDS) * dt
    this.turn += clamp((this.facing === 1 ? 0 : Math.PI) - this.turn, -step, step)
    this.flipX = Math.cos(this.turn)
  }

  /** Updates the sprites from the simulated state. Runs once per frame. */
  animate(dt: number, world: TankWorld) {
    const { tail, faceSlot, swim } = this.config
    const cruise = swim.speed * world.scale
    const speed = Math.hypot(this.vx, this.vy)
    const flipX = this.flipX
    const side = flipX >= 0 ? 1 : -1

    // Tap reactions that change the shape: puff up, snap, flash the lure.
    let grow = 1
    let stretch = 1
    let flash = 0
    if (this.reaction) {
      const t = (this.reaction.t += dt)
      const kind = this.reaction.kind
      if (kind === 'puff') {
        grow = 1 + (t < 0.3 ? easeOutBack(t / 0.3) : t < 1.7 ? 1 + Math.sin(t * 9) * 0.03 : Math.max(0, 1 - (t - 1.7) / 0.6))
      } else if (kind === 'snap') {
        stretch = 1 + 0.2 * Math.sin(t * Math.PI * 7) * Math.max(0, 1 - t / 0.6)
      } else if (kind === 'lure-flash') {
        flash = Math.max(0, 1 - t / 1.4)
      }
      const length = kind === 'puff' ? 2.3 : kind === 'hide-in-anemone' ? 4.5 : kind === 'lure-flash' ? 1.6 : 1.2
      if (t > length) this.reaction = null
    }
    if (this.chomp > 0) {
      this.chomp = Math.max(0, this.chomp - dt)
      grow *= 1 + 0.14 * Math.sin((1 - this.chomp / 0.3) * Math.PI)
    }
    this.blub = Math.max(0, this.blub - dt)
    this.face.texture = this.blub > 0 && this.blubTexture ? this.blubTexture : this.faceTexture
    this.flip.scale.x = flipX * stretch
    if (this.glow && this.config.glow) {
      this.glowPhase += dt * 1.7
      const size = this.config.glow.size / 64
      this.glow.alpha = Math.min(1, 0.45 + 0.15 * Math.sin(this.glowPhase) + flash)
      this.glow.scale.set(size * (1 + flash * 2.5))
    }

    // Nose follows the climb or dive.
    const targetPitch = clamp(Math.atan2(this.vy, Math.abs(this.vx)), -MAX_PITCH, MAX_PITCH) * side
    this.pitch += (targetPitch - this.pitch) * (1 - Math.exp(-dt * 4))

    // Tail beats faster when swimming faster, and lazily when asleep.
    const drowsy = 0.35 + 0.65 * this.owner.awake
    this.tailPhase += dt * Math.PI * 2 * swim.wiggleHz * drowsy * (0.6 + 0.6 * Math.min(speed / cruise, 2))
    this.tail.anchor.set(tail.pivot.x / this.tail.texture.width, tail.pivot.y / this.tail.texture.height)
    this.tail.position.set(tail.attach.x, tail.attach.y)
    this.tail.rotation = Math.sin(this.tailPhase) * tail.swing

    // The face moves with the head and squashes during a turn, but never mirrors.
    const faceScale = faceSlot.size / FACE_SIZE
    this.face.position.set(faceSlot.x * flipX, faceSlot.y)
    this.face.scale.set(Math.abs(flipX) * faceScale, faceScale)
    this.face.rotation = faceSlot.rotation * side

    // Deeper water looks bluer; the owner's colour choice multiplies on top.
    const depth = clamp(this.y / world.sandY, 0, 1) * DEEP_TINT_STRENGTH
    let r = lerp(255, DEEP_TINT[0], depth)
    let g = lerp(255, DEEP_TINT[1], depth)
    let b = lerp(255, DEEP_TINT[2], depth)
    const own = this.owner.tint
    if (own !== null) {
      r *= ((own >> 16) & 255) / 255
      g *= ((own >> 8) & 255) / 255
      b *= (own & 255) / 255
    }
    // Asleep: the body dims. The face is left alone.
    const dim = 0.55 + 0.45 * this.owner.awake
    r *= dim
    g *= dim
    b *= dim
    const tint = (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b)
    this.body.tint = tint
    this.tail.tint = tint
    this.view.visible = !this.entering || this.entering.delay <= 0

    this.bobPhase += dt * Math.PI * 2 * BOB_HZ
    this.view.scale.set(this.config.scale * this.zoom * world.scale * grow)
    this.view.alpha = 1 - 0.7 * this.hiding
    this.view.rotation = this.pitch
    this.view.position.set(this.x, this.y + Math.sin(this.bobPhase) * swim.bob * world.scale)
  }

  /** Removes the sprites. The face texture is left alone; its owner destroys it. */
  destroy() {
    this.view.destroy({ children: true })
  }
}
