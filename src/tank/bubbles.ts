import { Container, Sprite, Texture } from 'pixi.js'
import type { SceneLayer, TankWorld } from './layer'
import { clamp, makeCanvas, randomBetween } from './util'

const TEXTURE_SIZE = 64
const MIN_RADIUS = 3
const MAX_RADIUS = 10
/** Screen area (CSS px²) per bubble, so small phones and big TVs look equally busy. */
const AREA_PER_BUBBLE = 26_000
const MIN_BUBBLES = 10
const MAX_BUBBLES = 40

interface Bubble {
  sprite: Sprite
  radius: number
  /** Horizontal position as a fraction of the screen width, so bubbles survive resizes. */
  xFraction: number
  y: number
  speed: number
  wobbleAmp: number
  wobbleFreq: number
  phase: number
}

function drawBubbleTexture(): Texture {
  const { canvas, ctx } = makeCanvas(TEXTURE_SIZE)
  const c = TEXTURE_SIZE / 2

  ctx.beginPath()
  ctx.arc(c, c, c - 3, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)'
  ctx.fill()
  ctx.lineWidth = 3
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)'
  ctx.stroke()

  ctx.beginPath()
  ctx.arc(c * 0.68, c * 0.68, c * 0.2, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.8)'
  ctx.fill()

  return Texture.from(canvas)
}

/** Bubbles rising from the sand with a gentle side-to-side wobble. */
export function createBubbles(): SceneLayer {
  const view = new Container()
  const texture = drawBubbleTexture()
  const bubbles: Bubble[] = []
  let world: TankWorld | null = null
  let time = 0

  /** Puts a bubble at a fresh spot; `anywhere` scatters it over the whole height instead of the sand. */
  function launch(bubble: Bubble, at: TankWorld, anywhere: boolean) {
    bubble.radius = randomBetween(MIN_RADIUS, MAX_RADIUS) * at.scale
    bubble.sprite.scale.set((bubble.radius * 2) / TEXTURE_SIZE)
    bubble.xFraction = Math.random()
    bubble.y = anywhere ? randomBetween(0, at.sandY) : at.sandY
    // Bigger bubbles rise faster, like real ones.
    bubble.speed = (20 + (bubble.radius / at.scale) * 4) * at.scale
    bubble.wobbleAmp = randomBetween(2, 8) * at.scale
    bubble.wobbleFreq = randomBetween(1, 2.5)
    bubble.phase = randomBetween(0, Math.PI * 2)
  }

  return {
    view,
    resize(next) {
      world = next
      const count = clamp(Math.round((next.width * next.height) / AREA_PER_BUBBLE), MIN_BUBBLES, MAX_BUBBLES)
      while (bubbles.length < count) {
        const sprite = new Sprite(texture)
        sprite.anchor.set(0.5)
        const bubble: Bubble = { sprite, radius: 0, xFraction: 0, y: 0, speed: 0, wobbleAmp: 0, wobbleFreq: 0, phase: 0 }
        launch(bubble, next, true)
        bubbles.push(bubble)
        view.addChild(sprite)
      }
      while (bubbles.length > count) bubbles.pop()!.sprite.destroy()
    },
    update(dt) {
      if (!world) return
      time += dt
      for (const bubble of bubbles) {
        bubble.y -= bubble.speed * dt
        if (bubble.y < -bubble.radius) launch(bubble, world, false)
        const wobble = Math.sin(bubble.phase + time * bubble.wobbleFreq) * bubble.wobbleAmp
        bubble.sprite.position.set(bubble.xFraction * world.width + wobble, bubble.y)
      }
    },
  }
}
