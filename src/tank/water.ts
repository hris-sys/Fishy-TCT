import { Sprite, Texture } from 'pixi.js'
import type { SceneLayer } from './layer'

const GRADIENT: [offset: number, color: string][] = [
  [0, '#5cc3e0'],
  [0.45, '#1f7fae'],
  [1, '#0a2b4d'],
]

/** Vertical water gradient, drawn once into a 1 px wide texture and stretched to fill the screen. */
export function createWater(): SceneLayer {
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 256
  const ctx = canvas.getContext('2d')!
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height)
  for (const [offset, color] of GRADIENT) gradient.addColorStop(offset, color)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  const sprite = new Sprite(Texture.from(canvas))

  return {
    view: sprite,
    resize(width, height) {
      sprite.width = width
      sprite.height = height
    },
    update() {},
  }
}
