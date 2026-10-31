import { Container, Sprite, type Texture } from 'pixi.js'
import { FACE_SIZE, bakeMaskedFace } from './face'
import type { LoadedSpecies, SpeciesConfig } from './species'
import { canvasTexture, clamp } from './util'

/** Seconds for a full left-to-right turn. */
const TURN_SECONDS = 0.45
/** Steepest nose-up or nose-down tilt, in radians. */
const MAX_PITCH = 0.4
const BOB_HZ = 0.3

/**
 * One fish: a body and tail that flip when it turns, plus a face that follows the head but is
 * never mirrored. Position and velocity are driven by the steering code; this class only draws.
 */
export class Fish {
  readonly view = new Container()
  readonly species: LoadedSpecies

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

  private readonly flip = new Container()
  private readonly tail: Sprite
  private readonly body: Sprite
  private readonly face: Sprite
  private readonly faceSource: HTMLCanvasElement

  /** 0 when facing right, π when facing left; scale.x is its cosine, so a turn squashes through 0. */
  private turn = 0
  private flipX = 1
  private facing: 1 | -1 = 1
  private pitch = 0
  private tailPhase = Math.random() * Math.PI * 2
  private bobPhase = Math.random() * Math.PI * 2

  constructor(species: LoadedSpecies, faceSource: HTMLCanvasElement) {
    this.species = species
    this.faceSource = faceSource
    this.tail = new Sprite(species.tail)
    this.body = new Sprite(species.body)
    this.body.anchor.set(0.5)
    this.face = new Sprite(this.bakeFace())
    this.face.anchor.set(0.5)
    this.flip.addChild(this.tail, this.body)
    this.view.addChild(this.flip, this.face)
  }

  get config(): SpeciesConfig {
    return this.species.config
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
    return ((front + back) / 2) * this.config.scale * worldScale
  }

  /**
   * How far the fish reaches left and right of its center right now, in px. Follows the turn
   * smoothly, so clamping to it never makes the fish jump.
   */
  extents(worldScale: number) {
    const { front, back } = this.reach()
    const s = this.config.scale * worldScale
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
    const s = this.config.scale * worldScale
    return this.facing === 1 ? { left: back * s, right: front * s } : { left: front * s, right: back * s }
  }

  halfHeight(worldScale: number) {
    return this.body.texture.height * 0.5 * this.config.scale * worldScale
  }

  /** Rough size for keeping fish apart, in px. */
  radius(worldScale: number) {
    return (this.halfWidth(worldScale) + this.halfHeight(worldScale)) * 0.5
  }

  setFacing(direction: 1 | -1) {
    this.facing = direction
    this.turn = direction === 1 ? 0 : Math.PI
    this.flipX = direction
  }

  /** Re-cuts the face after the species' mask changed. */
  refreshFace() {
    const old = this.face.texture
    this.face.texture = this.bakeFace()
    old.destroy(true)
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
  animate(dt: number, worldScale: number) {
    const { tail, faceSlot, swim } = this.config
    const cruise = swim.speed * worldScale
    const speed = Math.hypot(this.vx, this.vy)
    const flipX = this.flipX
    const side = flipX >= 0 ? 1 : -1
    this.flip.scale.x = flipX

    // Nose follows the climb or dive.
    const targetPitch = clamp(Math.atan2(this.vy, Math.abs(this.vx)), -MAX_PITCH, MAX_PITCH) * side
    this.pitch += (targetPitch - this.pitch) * (1 - Math.exp(-dt * 4))

    // Tail beats faster when swimming faster.
    this.tailPhase += dt * Math.PI * 2 * swim.wiggleHz * (0.6 + 0.6 * Math.min(speed / cruise, 2))
    this.tail.anchor.set(tail.pivot.x / this.tail.texture.width, tail.pivot.y / this.tail.texture.height)
    this.tail.position.set(tail.attach.x, tail.attach.y)
    this.tail.rotation = Math.sin(this.tailPhase) * tail.swing

    // The face moves with the head and squashes during a turn, but never mirrors.
    const faceScale = faceSlot.size / FACE_SIZE
    this.face.position.set(faceSlot.x * flipX, faceSlot.y)
    this.face.scale.set(Math.abs(flipX) * faceScale, faceScale)
    this.face.rotation = faceSlot.rotation * side

    this.bobPhase += dt * Math.PI * 2 * BOB_HZ
    this.view.scale.set(this.config.scale * worldScale)
    this.view.rotation = this.pitch
    this.view.position.set(this.x, this.y + Math.sin(this.bobPhase) * swim.bob * worldScale)
  }

  destroy() {
    this.face.texture.destroy(true)
    this.view.destroy({ children: true })
  }

  private bakeFace(): Texture {
    return canvasTexture(bakeMaskedFace(this.faceSource, this.config.mask))
  }
}
