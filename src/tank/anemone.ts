import { Container, Graphics, MeshRope, Point, Texture } from 'pixi.js'
import type { SceneLayer } from './layer'
import { makeCanvas, randomBetween, seededRandom } from './util'

const TENTACLES = 26
const SEGMENTS = 8

interface Tentacle {
  points: Point[]
  root: { x: number; y: number }
  angle: number
  length: number
  phase: number
}

/** The clownfishes' home: a bubble-tip anemone, with a fan of swaying pink-tipped tentacles. */
export function createAnemone(): SceneLayer {
  const view = new Container()
  const texture = Texture.from(drawTentacleTexture())
  const rand = seededRandom(9)
  const tentacles: Tentacle[] = []

  // Base column first, so the tentacles grow out over it.
  const base = new Graphics()
    .ellipse(0, 4, 34, 14)
    .fill('#6e3a4a')
    .ellipse(0, 0, 30, 10)
    .fill('#9a5a66')
    .ellipse(-6, -3, 16, 4)
    .fill({ color: '#c88a90', alpha: 0.6 })
  view.addChild(base)

  for (let i = 0; i < TENTACLES; i++) {
    const spread = (i / (TENTACLES - 1)) * 2 - 1
    const angle = spread * 1.3 + randomBetween(-0.1, 0.1, rand)
    const points = Array.from({ length: SEGMENTS }, () => new Point())
    const rope = new MeshRope({ texture, points })
    rope.tint = rand() < 0.5 ? '#ffffff' : '#f0d8e0'
    view.addChild(rope)
    tentacles.push({
      points,
      root: { x: Math.sin(angle) * 26 + randomBetween(-3, 3, rand), y: -Math.cos(angle) * 8 - 2 },
      angle,
      length: randomBetween(26, 44, rand) * (1 - Math.abs(spread) * 0.25),
      phase: rand() * Math.PI * 2,
    })
  }

  return {
    view,
    resize(world) {
      view.position.set(world.anemone.x, world.anemone.y)
      view.scale.set(world.scale * 0.9)
    },
    update(_dt, time) {
      for (const tentacle of tentacles) {
        let { x, y } = tentacle.root
        const step = tentacle.length / (SEGMENTS - 1)
        for (let i = 0; i < SEGMENTS; i++) {
          tentacle.points[i].set(x, y)
          const t = i / (SEGMENTS - 1)
          const bend = tentacle.angle + Math.sin(time * 1.3 + tentacle.phase + t * 2) * 0.28 * t
          x += Math.sin(bend) * step
          y -= Math.cos(bend) * step
        }
      }
    },
  }
}

/** A translucent tan tube along the x axis that swells into a pink bulb at the tip. */
function drawTentacleTexture() {
  const { canvas, ctx } = makeCanvas(128, 16)
  const tube = ctx.createLinearGradient(0, 0, 0, 16)
  tube.addColorStop(0, '#9d6b5e')
  tube.addColorStop(0.5, '#e6b9a4')
  tube.addColorStop(1, '#9d6b5e')
  ctx.fillStyle = tube
  ctx.beginPath()
  ctx.moveTo(0, 4)
  ctx.lineTo(104, 5)
  ctx.lineTo(104, 11)
  ctx.lineTo(0, 12)
  ctx.closePath()
  ctx.fill()
  const bulb = ctx.createRadialGradient(114, 6, 1, 114, 8, 9)
  bulb.addColorStop(0, '#ffd6e6')
  bulb.addColorStop(0.5, '#e36a9c')
  bulb.addColorStop(1, '#a8336a')
  ctx.fillStyle = bulb
  ctx.beginPath()
  ctx.ellipse(113, 8, 13, 7, 0, 0, Math.PI * 2)
  ctx.fill()
  return canvas
}
