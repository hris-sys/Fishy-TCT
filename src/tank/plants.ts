import { Container, MeshRope, Point, Texture } from 'pixi.js'
import type { SceneLayer } from './layer'
import { makeCanvas, randomBetween, seededRandom } from './util'

const SEGMENTS = 14
const TINTS = ['#ffffff', '#d6efc4', '#b3e0bd', '#e6f3a6']
/** Plant clumps along the sand, as fractions of the width. The gap at 0.72 is the anemone's. */
const CLUMPS = [0.06, 0.2, 0.44, 0.9]

interface Blade {
  rope: MeshRope
  points: Point[]
  xFraction: number
  /** Length in art units. */
  length: number
  phase: number
  speed: number
  sway: number
}

/** Seaweed: tapered ribbons rooted in the sand that sway in a slow current. */
export function createPlants(): SceneLayer {
  const view = new Container()
  const texture = Texture.from(drawBladeTexture())
  const rand = seededRandom(5)
  const blades: Blade[] = []

  for (const clump of CLUMPS) {
    const count = 2 + Math.floor(rand() * 3)
    for (let i = 0; i < count; i++) {
      const points = Array.from({ length: SEGMENTS }, () => new Point())
      const rope = new MeshRope({ texture, points })
      rope.tint = TINTS[Math.floor(rand() * TINTS.length)]
      view.addChild(rope)
      blades.push({
        rope,
        points,
        xFraction: clump + randomBetween(-0.035, 0.035, rand),
        length: randomBetween(110, 230, rand),
        phase: rand() * Math.PI * 2,
        speed: randomBetween(0.7, 1.1, rand),
        sway: randomBetween(14, 26, rand),
      })
    }
  }

  return {
    view,
    resize(world) {
      for (const blade of blades) {
        blade.rope.position.set(blade.xFraction * world.width, world.sandY + 8 * world.scale)
        blade.rope.scale.set(world.scale)
      }
    },
    update(_dt, time) {
      for (const blade of blades) {
        for (let i = 0; i < SEGMENTS; i++) {
          const t = i / (SEGMENTS - 1)
          // The base stays put; the bend grows toward the tip and lags behind, like a wave.
          blade.points[i].set(
            Math.sin(time * blade.speed + blade.phase - t * 1.8) * blade.sway * t ** 1.4,
            -blade.length * t,
          )
        }
      }
    },
  }
}

/** A leaf shape lying along the x axis: wide at the root (left), tapering to a tip (right). */
function drawBladeTexture() {
  const { canvas, ctx } = makeCanvas(256, 32)
  const gradient = ctx.createLinearGradient(0, 0, 0, 32)
  gradient.addColorStop(0, '#2f7a3a')
  gradient.addColorStop(0.5, '#7fd27a')
  gradient.addColorStop(1, '#2f7a3a')
  ctx.fillStyle = gradient
  ctx.beginPath()
  ctx.moveTo(0, 5)
  ctx.quadraticCurveTo(150, -2, 256, 16)
  ctx.quadraticCurveTo(150, 34, 0, 27)
  ctx.closePath()
  ctx.fill()
  return canvas
}
