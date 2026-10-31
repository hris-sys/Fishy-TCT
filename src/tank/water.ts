import { Sprite, Texture } from 'pixi.js'
import type { SceneLayer } from './layer'
import { makeCanvas } from './util'

const GRADIENT: [offset: number, color: string][] = [
  [0, '#5ab9d6'],
  [0.25, '#2e93bf'],
  [0.6, '#16679a'],
  [1, '#0a2c4f'],
]

/** Vertical water gradient, drawn once into a 1 px wide texture and stretched to fill the screen. */
export function createWater(): SceneLayer {
  const { canvas, ctx } = makeCanvas(1, 256)
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height)
  for (const [offset, color] of GRADIENT) gradient.addColorStop(offset, color)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  const sprite = new Sprite(Texture.from(canvas))

  return {
    view: sprite,
    resize(world) {
      sprite.width = world.width
      sprite.height = world.height
    },
    update() {},
  }
}
