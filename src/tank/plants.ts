import { Container, MeshRope, Point, Texture } from 'pixi.js'
import type { SceneLayer } from './layer'
import { makeCanvas, randomBetween, seededRandom } from './util'

const SEGMENTS = 14

interface Clump {
  /** Position along the sand, as a fraction of the width. */
  x: number
  blades: number
  /** Blade length range, in art units. */
  length: [number, number]
}

/** Behind the fish: seagrass and kelp among the rocks. */
const BACK: Clump[] = [
  { x: 0.03, blades: 6, length: [90, 190] },
  { x: 0.27, blades: 5, length: [70, 150] },
  { x: 0.6, blades: 7, length: [120, 240] },
  { x: 0.79, blades: 4, length: [60, 120] },
]

/** In front of the fish: a few short tufts at the edges, for depth. They stay low so faces stay visible. */
const FRONT: Clump[] = [
  { x: 0.01, blades: 5, length: [35, 70] },
  { x: 0.985, blades: 5, length: [35, 75] },
]

const BACK_TINTS = ['#ffffff', '#dfeec0', '#c4e0b0', '#eae6a8', '#b9d4b4']
const FRONT_TINTS = ['#7d9a76', '#6e8c6c', '#8aa07a']

interface Blade {
  points: Point[]
  rope: MeshRope
  x: number
  length: number
  lean: number
  phase: number
  speed: number
  sway: number
}

/** Seagrass: thin tapered blades rooted in the sand, swaying in a slow current. */
export function createPlants(layer: 'back' | 'front'): SceneLayer {
  const view = new Container()
  const texture = Texture.from(drawBladeTexture())
  const rand = seededRandom(layer === 'back' ? 5 : 6)
  const tints = layer === 'back' ? BACK_TINTS : FRONT_TINTS
  const blades: Blade[] = []

  for (const clump of layer === 'back' ? BACK : FRONT) {
    for (let i = 0; i < clump.blades; i++) {
      const points = Array.from({ length: SEGMENTS }, () => new Point())
      const rope = new MeshRope({ texture, points })
      rope.tint = tints[Math.floor(rand() * tints.length)]
      view.addChild(rope)
      blades.push({
        points,
        rope,
        x: clump.x + randomBetween(-0.03, 0.03, rand),
        length: randomBetween(clump.length[0], clump.length[1], rand),
        lean: randomBetween(-12, 12, rand),
        phase: rand() * Math.PI * 2,
        speed: randomBetween(0.6, 1, rand),
        sway: randomBetween(10, 22, rand),
      })
    }
  }

  return {
    view,
    resize(world) {
      for (const blade of blades) {
        blade.rope.position.set(blade.x * world.width, world.sandY + 10 * world.scale)
        blade.rope.scale.set(world.scale)
      }
    },
    update(_dt, time) {
      for (const blade of blades) {
        for (let i = 0; i < SEGMENTS; i++) {
          const t = i / (SEGMENTS - 1)
          // The base stays put; the bend grows toward the tip and lags behind, like a wave.
          const bend = Math.sin(time * blade.speed + blade.phase - t * 1.8) * blade.sway + blade.lean
          blade.points[i].set(bend * t ** 1.5, -blade.length * t)
        }
      }
    },
  }
}

/** A grass blade lying along the x axis: root on the left, tip on the right, with a pale midrib. */
function drawBladeTexture() {
  const { canvas, ctx } = makeCanvas(256, 20)
  const across = ctx.createLinearGradient(0, 0, 0, 20)
  across.addColorStop(0, '#2d6630')
  across.addColorStop(0.5, '#79b866')
  across.addColorStop(1, '#2a5e2e')
  ctx.fillStyle = across
  ctx.beginPath()
  ctx.moveTo(0, 4)
  ctx.quadraticCurveTo(170, 1, 256, 10)
  ctx.quadraticCurveTo(170, 19, 0, 16)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = 'rgba(210, 240, 170, 0.35)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(0, 10)
  ctx.lineTo(240, 10)
  ctx.stroke()
  // Lighter toward the tip, where the sun reaches.
  const along = ctx.createLinearGradient(0, 0, 256, 0)
  along.addColorStop(0, 'rgba(0, 0, 0, 0.25)')
  along.addColorStop(1, 'rgba(255, 255, 200, 0.15)')
  ctx.globalCompositeOperation = 'source-atop'
  ctx.fillStyle = along
  ctx.fillRect(0, 0, 256, 20)
  return canvas
}
