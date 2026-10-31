import { Container, Sprite, Texture } from 'pixi.js'
import type { SceneLayer } from './layer'

const TEXTURE_SIZE = 64
const MIN_RADIUS = 3
const MAX_RADIUS = 11
/** Screen area (CSS px²) per bubble, so small phones and big TVs look equally busy. */
const AREA_PER_BUBBLE = 22_000
const MIN_BUBBLES = 12
const MAX_BUBBLES = 48

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
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = TEXTURE_SIZE
  const ctx = canvas.getContext('2d')!
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

const random = (min: number, max: number) => min + Math.random() * (max - min)

/** Bubbles rising from the bottom with a gentle side-to-side wobble. */
export function createBubbles(): SceneLayer {
  const view = new Container()
  const texture = drawBubbleTexture()
  const bubbles: Bubble[] = []
  let width = 0
  let height = 0
  let time = 0

  /** Puts a bubble at a fresh spot; `anywhere` scatters it over the whole height instead of the bottom. */
  function launch(bubble: Bubble, anywhere: boolean) {
    bubble.radius = random(MIN_RADIUS, MAX_RADIUS)
    bubble.sprite.scale.set((bubble.radius * 2) / TEXTURE_SIZE)
    bubble.xFraction = Math.random()
    bubble.y = anywhere ? random(0, height) : height + bubble.radius
    // Bigger bubbles rise faster, like real ones.
    bubble.speed = 20 + bubble.radius * 4
    bubble.wobbleAmp = random(2, 8)
    bubble.wobbleFreq = random(1, 2.5)
    bubble.phase = random(0, Math.PI * 2)
  }

  function setCount(count: number) {
    while (bubbles.length < count) {
      const sprite = new Sprite(texture)
      sprite.anchor.set(0.5)
      const bubble: Bubble = { sprite, radius: 0, xFraction: 0, y: 0, speed: 0, wobbleAmp: 0, wobbleFreq: 0, phase: 0 }
      launch(bubble, true)
      bubbles.push(bubble)
      view.addChild(sprite)
    }
    while (bubbles.length > count) {
      bubbles.pop()!.sprite.destroy()
    }
  }

  return {
    view,
    resize(w, h) {
      width = w
      height = h
      const count = Math.round((w * h) / AREA_PER_BUBBLE)
      setCount(Math.min(MAX_BUBBLES, Math.max(MIN_BUBBLES, count)))
    },
    update(dt) {
      time += dt
      for (const bubble of bubbles) {
        bubble.y -= bubble.speed * dt
        if (bubble.y < -bubble.radius) launch(bubble, false)
        const wobble = Math.sin(bubble.phase + time * bubble.wobbleFreq) * bubble.wobbleAmp
        bubble.sprite.position.set(bubble.xFraction * width + wobble, bubble.y)
      }
    },
  }
}
