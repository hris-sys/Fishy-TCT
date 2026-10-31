import { Container, Sprite, Texture } from 'pixi.js'
import type { SceneLayer, TankWorld } from './layer'
import { makeCanvas, randomBetween, seededRandom } from './util'

const FLAKES_PER_DROP = 12
const MAX_FLAKES = 60
/** Seconds a flake lasts if nobody eats it. */
const FLAKE_LIFE = 16

export interface Flake {
  sprite: Sprite
  x: number
  y: number
  vy: number
  phase: number
  age: number
  eaten: boolean
}

export interface Food extends SceneLayer {
  readonly flakes: Flake[]
  /**
   * Drops a pinch of flakes at a fraction of the tank's width. The same seed scatters them the
   * same way on every screen, so a shared feeding looks the same everywhere.
   */
  drop(xFraction: number, seed: number): void
  eat(flake: Flake): void
}

/** Fish food: flakes that flutter down from the surface and settle on the sand. */
export function createFood(): Food {
  const view = new Container()
  const textures = [0, 1, 2].map((seed) => Texture.from(drawFlake(seed)))
  const flakes: Flake[] = []
  let world: TankWorld | null = null
  let time = 0

  function removeFlake(index: number) {
    flakes[index].sprite.destroy()
    flakes.splice(index, 1)
  }

  return {
    view,
    flakes,
    resize(next) {
      world = next
    },
    drop(xFraction, seed) {
      if (!world) return
      const rand = seededRandom(seed)
      const s = world.scale
      const center = Math.min(Math.max(xFraction, 0.02), 0.98) * world.width
      for (let i = 0; i < FLAKES_PER_DROP; i++) {
        if (flakes.length >= MAX_FLAKES) removeFlake(0)
        const sprite = new Sprite(textures[i % textures.length])
        sprite.anchor.set(0.5)
        sprite.scale.set(randomBetween(0.55, 0.9, rand) * s)
        sprite.rotation = rand() * Math.PI * 2
        view.addChild(sprite)
        flakes.push({
          sprite,
          x: center + (rand() - 0.5) * 80 * s,
          y: -rand() * 40 * s - 4,
          vy: randomBetween(14, 28, rand) * s,
          phase: rand() * Math.PI * 2,
          age: 0,
          eaten: false,
        })
      }
    },
    eat(flake) {
      flake.eaten = true
    },
    update(dt) {
      if (!world) return
      time += dt
      const floor = world.sandY + 6 * world.scale
      for (let i = flakes.length - 1; i >= 0; i--) {
        const flake = flakes[i]
        flake.age += dt
        if (flake.eaten || flake.age > FLAKE_LIFE) {
          // Shrink away quickly once eaten, fade slowly when left over.
          flake.sprite.alpha -= dt * (flake.eaten ? 8 : 0.8)
          if (flake.sprite.alpha <= 0) removeFlake(i)
          continue
        }
        if (flake.y < floor) {
          flake.y += flake.vy * dt
          flake.sprite.rotation += Math.sin(time * 2 + flake.phase) * dt
        }
        const flutter = flake.y < floor ? Math.sin(time * 2.2 + flake.phase) * 6 * world.scale : 0
        flake.sprite.position.set(flake.x + flutter, Math.min(flake.y, floor))
        flake.sprite.alpha = Math.min(1, flake.age * 4)
      }
    },
  }
}

/** A small, irregular flake of fish food. */
function drawFlake(seed: number) {
  const rand = seededRandom(seed + 40)
  const { canvas, ctx } = makeCanvas(16)
  ctx.beginPath()
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2
    const r = randomBetween(3.5, 6.5, rand)
    ctx.lineTo(8 + Math.cos(a) * r, 8 + Math.sin(a) * r * 0.7)
  }
  ctx.closePath()
  ctx.fillStyle = ['#e8a24a', '#d9783a', '#f0c060'][seed % 3]
  ctx.fill()
  ctx.strokeStyle = 'rgba(255, 240, 200, 0.6)'
  ctx.lineWidth = 1
  ctx.stroke()
  return canvas
}
