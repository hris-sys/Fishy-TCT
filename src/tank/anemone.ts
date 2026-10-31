import { Container, Graphics, MeshRope, Point, Texture } from 'pixi.js'
import type { SceneLayer } from './layer'
import { makeCanvas, randomBetween, seededRandom } from './util'

const TENTACLES = 15
const SEGMENTS = 8

interface Tentacle {
  points: Point[]
  root: { x: number; y: number }
  angle: number
  length: number
  phase: number
}

/** The clownfishes' home: a pink dome with a fan of swaying tentacles. */
export function createAnemone(): SceneLayer {
  const view = new Container()
  const texture = Texture.from(drawTentacleTexture())
  const rand = seededRandom(9)
  const tentacles: Tentacle[] = []

  for (let i = 0; i < TENTACLES; i++) {
    const spread = (i / (TENTACLES - 1)) * 2 - 1
    const angle = spread * 1.25 + randomBetween(-0.08, 0.08, rand)
    const points = Array.from({ length: SEGMENTS }, () => new Point())
    const rope = new MeshRope({ texture, points })
    view.addChild(rope)
    tentacles.push({
      points,
      root: { x: Math.sin(angle) * 30, y: -Math.cos(angle) * 12 - 6 },
      angle,
      length: randomBetween(34, 52, rand) * (1 - Math.abs(spread) * 0.25),
      phase: rand() * Math.PI * 2,
    })
  }

  const base = new Graphics()
    .ellipse(0, 0, 38, 18)
    .fill('#9b2c6a')
    .ellipse(-8, -6, 22, 8)
    .fill({ color: '#c24c8c', alpha: 0.8 })
  view.addChild(base)

  return {
    view,
    resize(world) {
      view.position.set(world.anemone.x, world.anemone.y)
      view.scale.set(world.scale)
    },
    update(_dt, time) {
      for (const tentacle of tentacles) {
        let { x, y } = tentacle.root
        const step = tentacle.length / (SEGMENTS - 1)
        for (let i = 0; i < SEGMENTS; i++) {
          tentacle.points[i].set(x, y)
          const t = i / (SEGMENTS - 1)
          const bend = tentacle.angle + Math.sin(time * 1.4 + tentacle.phase + t * 2) * 0.3 * t
          x += Math.sin(bend) * step
          y -= Math.cos(bend) * step
        }
      }
    },
  }
}

/** A pink tube along the x axis with a pale bulb at the tip. */
function drawTentacleTexture() {
  const { canvas, ctx } = makeCanvas(128, 20)
  const gradient = ctx.createLinearGradient(0, 0, 0, 20)
  gradient.addColorStop(0, '#c23b7f')
  gradient.addColorStop(0.5, '#ff94c6')
  gradient.addColorStop(1, '#c23b7f')
  ctx.fillStyle = gradient
  ctx.beginPath()
  ctx.moveTo(0, 3)
  ctx.lineTo(112, 5)
  ctx.arc(116, 10, 8, -Math.PI / 2, Math.PI / 2)
  ctx.lineTo(0, 17)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#ffd3e8'
  ctx.beginPath()
  ctx.arc(118, 10, 5.5, 0, Math.PI * 2)
  ctx.fill()
  return canvas
}
