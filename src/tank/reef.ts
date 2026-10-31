import { Container, Sprite, type Texture } from 'pixi.js'
import type { SceneLayer } from './layer'
import { canvasTexture, makeCanvas, randomBetween, seededRandom } from './util'

/** Decor is painted at this multiple of its art size, so it stays sharp on big screens. */
const RES = 3

type Paint = (ctx: CanvasRenderingContext2D, rand: () => number) => void

/** Paints a piece of decor into a texture. Sizes are art units; scaled with the tank. */
function paint(width: number, height: number, seed: number, draw: Paint): Texture {
  const { canvas, ctx } = makeCanvas(width * RES, height * RES)
  ctx.scale(RES, RES)
  draw(ctx, seededRandom(seed))
  return canvasTexture(canvas, RES)
}

/** A lumpy rock lit from above, with speckles and patches of algae. Its bottom sinks into the sand. */
function rock(width: number, height: number, seed: number) {
  return paint(width, height, seed, (ctx, rand) => {
    const cx = width / 2
    const cy = height * 0.62
    const points = Array.from({ length: 11 }, (_, i) => {
      const a = (i / 11) * Math.PI * 2
      const r = randomBetween(0.82, 1.04, rand)
      return { x: cx + Math.cos(a) * width * 0.48 * r, y: Math.min(height, cy + Math.sin(a) * height * 0.6 * r) }
    })
    const shape = new Path2D()
    const mid = (i: number) => {
      const p = points[i % points.length]
      const q = points[(i + 1) % points.length]
      return { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }
    }
    const start = mid(0)
    shape.moveTo(start.x, start.y)
    for (let i = 1; i <= points.length; i++) {
      const p = points[i % points.length]
      const m = mid(i)
      shape.quadraticCurveTo(p.x, p.y, m.x, m.y)
    }
    const light = ctx.createRadialGradient(width * 0.38, height * 0.22, 2, width * 0.45, height * 0.5, width * 0.7)
    light.addColorStop(0, '#a7a495')
    light.addColorStop(0.45, '#6e6a5f')
    light.addColorStop(1, '#34322d')
    ctx.fillStyle = light
    ctx.fill(shape)
    ctx.save()
    ctx.clip(shape)
    for (let i = 0; i < (width * height) / 18; i++) {
      ctx.fillStyle = rand() < 0.5 ? 'rgba(230, 225, 210, 0.16)' : 'rgba(25, 22, 18, 0.18)'
      ctx.beginPath()
      ctx.arc(rand() * width, rand() * height, 0.4 + rand() * 1.2, 0, Math.PI * 2)
      ctx.fill()
    }
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = rand() < 0.5 ? 'rgba(92, 120, 55, 0.35)' : 'rgba(150, 70, 90, 0.25)'
      ctx.beginPath()
      ctx.ellipse(rand() * width, height * (0.15 + rand() * 0.5), 4 + rand() * 10, 2 + rand() * 5, rand() * 3, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  })
}

/** Staghorn coral: forked branches, thick at the base, with pale growing tips. */
function staghorn(seed: number) {
  const width = 130
  const height = 110
  return paint(width, height, seed, (ctx, rand) => {
    ctx.lineCap = 'round'
    const tips: { x: number; y: number }[] = []
    const branch = (x: number, y: number, angle: number, length: number, thickness: number, depth: number) => {
      const ex = x + Math.sin(angle) * length
      const ey = y - Math.cos(angle) * length
      const tone = 0.35 + depth * 0.14
      ctx.strokeStyle = `rgb(${Math.round(150 + 90 * tone)}, ${Math.round(70 + 80 * tone)}, ${Math.round(130 + 70 * tone)})`
      ctx.lineWidth = thickness
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.quadraticCurveTo(x + Math.sin(angle + 0.3) * length * 0.5, y - Math.cos(angle + 0.3) * length * 0.5, ex, ey)
      ctx.stroke()
      if (depth >= 4) return tips.push({ x: ex, y: ey })
      const spread = randomBetween(0.3, 0.55, rand)
      branch(ex, ey, angle - spread, length * 0.78, thickness * 0.72, depth + 1)
      branch(ex, ey, angle + spread, length * 0.78, thickness * 0.72, depth + 1)
    }
    for (const angle of [-0.55, -0.05, 0.5]) branch(width / 2, height, angle, 26, 9, 0)
    ctx.fillStyle = '#f6d3ea'
    for (const tip of tips) {
      ctx.beginPath()
      ctx.arc(tip.x, tip.y, 1.8, 0, Math.PI * 2)
      ctx.fill()
    }
  })
}

/** Sea fan (gorgonian): a flat, lacy fan of thin red-orange branches. */
function seaFan(seed: number) {
  const width = 130
  const height = 130
  return paint(width, height, seed, (ctx, rand) => {
    ctx.lineCap = 'round'
    ctx.globalAlpha = 0.85
    const branch = (x: number, y: number, angle: number, length: number, thickness: number, depth: number) => {
      const ex = x + Math.sin(angle) * length
      const ey = y - Math.cos(angle) * length
      ctx.strokeStyle = depth < 2 ? '#a8381c' : '#e0663a'
      ctx.lineWidth = thickness
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(ex, ey)
      ctx.stroke()
      if (depth >= 6) return
      const forks = rand() < 0.75 ? 2 : 1
      for (let i = 0; i < forks; i++) {
        const turn = forks === 1 ? randomBetween(-0.15, 0.15, rand) : (i ? 1 : -1) * randomBetween(0.15, 0.35, rand)
        branch(ex, ey, angle + turn, length * randomBetween(0.72, 0.88, rand), Math.max(0.6, thickness * 0.75), depth + 1)
      }
    }
    for (const angle of [-0.9, -0.45, 0, 0.45, 0.9]) branch(width / 2, height, angle, 22, 3.2, 0)
  })
}

/** Brain coral: a low dome covered in winding grooves. */
function brainCoral(seed: number) {
  const width = 100
  const height = 56
  return paint(width, height, seed, (ctx, rand) => {
    const dome = new Path2D()
    dome.ellipse(width / 2, height, width * 0.48, height * 0.95, 0, Math.PI, 0)
    const shade = ctx.createRadialGradient(width * 0.4, height * 0.25, 3, width / 2, height * 0.8, width * 0.6)
    shade.addColorStop(0, '#e4d58e')
    shade.addColorStop(0.6, '#b9a557')
    shade.addColorStop(1, '#6f6230')
    ctx.fillStyle = shade
    ctx.fill(dome)
    ctx.save()
    ctx.clip(dome)
    ctx.strokeStyle = 'rgba(95, 80, 30, 0.55)'
    ctx.lineWidth = 1.6
    for (let i = 0; i < 26; i++) {
      let x = rand() * width
      let y = height * (0.1 + rand() * 0.9)
      let angle = rand() * Math.PI * 2
      ctx.beginPath()
      ctx.moveTo(x, y)
      for (let step = 0; step < 14; step++) {
        angle += randomBetween(-0.9, 0.9, rand)
        x += Math.cos(angle) * 3
        y += Math.sin(angle) * 3
        ctx.lineTo(x, y)
      }
      ctx.stroke()
    }
    ctx.restore()
  })
}

/** Tube sponges: a few orange tubes with dark openings. */
function tubeSponge(seed: number) {
  const width = 60
  const height = 90
  return paint(width, height, seed, (ctx, rand) => {
    const tubes = [
      { x: 14, w: 13, h: 60 },
      { x: 30, w: 15, h: 86 },
      { x: 46, w: 12, h: 48 },
    ]
    for (const tube of tubes) {
      const top = height - tube.h
      const left = tube.x - tube.w / 2
      const side = ctx.createLinearGradient(left, 0, left + tube.w, 0)
      side.addColorStop(0, '#9c4a1c')
      side.addColorStop(0.45, '#eb9a52')
      side.addColorStop(1, '#a5521f')
      ctx.fillStyle = side
      ctx.beginPath()
      ctx.roundRect(left, top, tube.w, tube.h + 4, [tube.w / 2, tube.w / 2, 2, 2])
      ctx.fill()
      ctx.fillStyle = '#4a2410'
      ctx.beginPath()
      ctx.ellipse(tube.x, top + 3, tube.w * 0.36, 2.4 + rand(), 0, 0, Math.PI * 2)
      ctx.fill()
    }
  })
}

interface Piece {
  sprite: Sprite
  /** Center, as a fraction of the screen width. */
  x: number
  /** How far the bottom sinks below the sand line, in art units. */
  sink: number
  size: number
  sway?: { speed: number; amount: number; phase: number }
}

/**
 * Rocks and corals sitting on the sand. Their bottoms tuck under the sand layer, which is drawn
 * after this one. The open stretch around 0.72 is left for the anemone.
 */
export function createReef(): SceneLayer {
  const view = new Container()
  const pieces: Piece[] = []
  const add = (texture: Texture, x: number, sink: number, size = 1, sway?: Piece['sway']) => {
    const sprite = new Sprite(texture)
    sprite.anchor.set(0.5, 1)
    view.addChild(sprite)
    pieces.push({ sprite, x, sink, size, sway })
  }

  add(seaFan(4), 0.86, 6, 1, { speed: 0.5, amount: 0.035, phase: 1 })
  add(staghorn(2), 0.13, -28, 0.9)
  add(rock(110, 62, 1), 0.12, 14)
  add(rock(70, 40, 7), 0.5, 10)
  add(brainCoral(3), 0.42, 6, 0.9)
  add(rock(90, 52, 9), 0.88, 12)
  add(tubeSponge(5), 0.96, 6, 0.85)

  return {
    view,
    resize(world) {
      for (const piece of pieces) {
        piece.sprite.position.set(piece.x * world.width, world.sandY + piece.sink * world.scale)
        piece.sprite.scale.set(piece.size * world.scale)
      }
    },
    update(_dt, time) {
      for (const piece of pieces) {
        if (piece.sway) piece.sprite.rotation = Math.sin(time * piece.sway.speed + piece.sway.phase) * piece.sway.amount
      }
    },
  }
}
