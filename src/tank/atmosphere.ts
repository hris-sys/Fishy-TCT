import { Container, Sprite, Texture, TilingSprite } from 'pixi.js'
import type { SceneLayer, TankWorld } from './layer'
import { clamp, makeCanvas, randomBetween } from './util'

/** Screen area (CSS px²) per speck of marine snow. */
const AREA_PER_SPECK = 7000

interface Speck {
  sprite: Sprite
  x: number
  y: number
  speed: number
  drift: number
  phase: number
}

/** Marine snow: tiny pale specks drifting slowly down through the water. */
export function createParticles(): SceneLayer {
  const view = new Container()
  const texture = Texture.from(drawDot())
  const specks: Speck[] = []
  let world: TankWorld | null = null
  let time = 0

  return {
    view,
    resize(next) {
      world = next
      const count = clamp(Math.round((next.width * next.height) / AREA_PER_SPECK), 30, 160)
      while (specks.length < count) {
        const sprite = new Sprite(texture)
        sprite.anchor.set(0.5)
        sprite.alpha = randomBetween(0.15, 0.45)
        view.addChild(sprite)
        specks.push({ sprite, x: Math.random(), y: Math.random(), speed: randomBetween(0.006, 0.018), drift: randomBetween(3, 10), phase: Math.random() * 6 })
      }
      while (specks.length > count) specks.pop()!.sprite.destroy()
      for (const speck of specks) speck.sprite.scale.set((randomBetween(0.6, 1.5) * next.scale) / 4)
    },
    update(dt) {
      if (!world) return
      time += dt
      for (const speck of specks) {
        speck.y += speck.speed * dt
        if (speck.y > 1) {
          speck.y = 0
          speck.x = Math.random()
        }
        speck.sprite.position.set(
          speck.x * world.width + Math.sin(time * 0.4 + speck.phase) * speck.drift * world.scale,
          speck.y * world.sandY,
        )
      }
    },
  }
}

/** The underside of the surface: a bright, rippling band of light along the top edge. */
export function createSurface(): SceneLayer {
  const sprite = new TilingSprite({ texture: Texture.from(drawSurfaceTile()) })
  sprite.blendMode = 'add'
  sprite.alpha = 0.35
  let scale = 1

  return {
    view: sprite,
    resize(world) {
      scale = world.scale
      sprite.width = world.width
      sprite.height = 26 * world.scale
      // The tile is a bit taller than the band, so its wrapped-around top never shows at the bottom.
      sprite.tileScale.set(world.scale * 0.8, (26 * world.scale * 1.25) / 32)
    },
    update(dt) {
      sprite.tilePosition.x += 10 * dt * scale
    },
  }
}

/** Darkens the corners a little, like looking through the glass of a real tank. */
export function createVignette(): SceneLayer {
  const sprite = new Sprite(Texture.from(drawVignette()))
  return {
    view: sprite,
    resize(world) {
      sprite.width = world.width
      sprite.height = world.height
    },
    update() {},
  }
}

function drawDot() {
  const { canvas, ctx } = makeCanvas(8)
  const glow = ctx.createRadialGradient(4, 4, 0, 4, 4, 4)
  glow.addColorStop(0, 'rgba(235, 245, 240, 1)')
  glow.addColorStop(1, 'rgba(235, 245, 240, 0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, 8, 8)
  return canvas
}

/** Seamless horizontally: bright wavy blobs at the top fading downward. */
function drawSurfaceTile() {
  const width = 256
  const height = 32
  const { canvas, ctx } = makeCanvas(width, height)
  const image = ctx.createImageData(width, height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const u = (x / width) * Math.PI * 2
      const wave = 0.5 + 0.25 * Math.sin(u * 3 + Math.sin(u * 2) * 1.5) + 0.25 * Math.sin(u * 7 + 1)
      const fade = Math.max(0, 1 - y / (height * (0.35 + wave * 0.65)))
      const i = (y * width + x) * 4
      image.data[i] = 220
      image.data[i + 1] = image.data[i + 2] = 255
      image.data[i + 3] = Math.round(255 * fade ** 2 * (0.4 + 0.6 * wave))
    }
  }
  ctx.putImageData(image, 0, 0)
  return canvas
}

function drawVignette() {
  const size = 256
  const { canvas, ctx } = makeCanvas(size)
  const shade = ctx.createRadialGradient(size / 2, size * 0.45, size * 0.3, size / 2, size / 2, size * 0.75)
  shade.addColorStop(0, 'rgba(2, 18, 34, 0)')
  shade.addColorStop(1, 'rgba(2, 18, 34, 0.5)')
  ctx.fillStyle = shade
  ctx.fillRect(0, 0, size, size)
  return canvas
}
