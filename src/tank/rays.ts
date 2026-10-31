import { Container, Sprite, Texture } from 'pixi.js'
import type { SceneLayer } from './layer'
import { makeCanvas, seededRandom } from './util'

const RAY_COUNT = 5

/** Soft shafts of light from the surface, slowly swaying and breathing. */
export function createRays(): SceneLayer {
  const view = new Container()
  const texture = Texture.from(drawRayTexture())
  const rand = seededRandom(3)
  const rays = Array.from({ length: RAY_COUNT }, (_, i) => {
    const sprite = new Sprite(texture)
    sprite.anchor.set(0.5, 0)
    sprite.blendMode = 'add'
    sprite.tint = '#e8fbff'
    view.addChild(sprite)
    return {
      sprite,
      xFraction: (i + 0.3 + rand() * 0.4) / RAY_COUNT,
      widthFraction: 0.07 + rand() * 0.08,
      phase: rand() * Math.PI * 2,
      speed: 0.15 + rand() * 0.2,
    }
  })

  return {
    view,
    resize(world) {
      for (const ray of rays) {
        ray.sprite.position.set(ray.xFraction * world.width, 0)
        ray.sprite.width = Math.max(40, ray.widthFraction * world.width)
        ray.sprite.height = world.sandY * 0.95
      }
    },
    update(_dt, time) {
      for (const ray of rays) {
        const wave = Math.sin(time * ray.speed + ray.phase)
        ray.sprite.alpha = 0.1 + 0.05 * wave
        ray.sprite.rotation = 0.2 + 0.05 * wave
      }
    },
  }
}

/** White glow: brightest at the top center, fading out sideways and downward. */
function drawRayTexture() {
  const width = 64
  const height = 256
  const { canvas, ctx } = makeCanvas(width, height)
  const image = ctx.createImageData(width, height)
  for (let y = 0; y < height; y++) {
    const fade = (1 - y / height) ** 1.6
    for (let x = 0; x < width; x++) {
      const across = Math.exp(-(((x - width / 2) / (width * 0.22)) ** 2))
      const i = (y * width + x) * 4
      image.data[i] = image.data[i + 1] = image.data[i + 2] = 255
      image.data[i + 3] = Math.round(255 * across * fade)
    }
  }
  ctx.putImageData(image, 0, 0)
  return canvas
}
