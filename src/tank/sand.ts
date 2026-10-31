import { Sprite, Texture } from 'pixi.js'
import type { SceneLayer, TankWorld } from './layer'
import { makeCanvas, randomBetween, seededRandom } from './util'

/** Extra room above the sand line for its wavy top edge, in px at tank scale 1. */
const EDGE_ROOM = 10

/** Top edge of the sand at x, in px. Shared with the caustics so they line up. */
export function sandSurface(world: TankWorld, x: number) {
  const s = world.scale
  return world.sandY + Math.sin(x * 0.011 + 0.6) * 4 * s + Math.sin(x * 0.029 + 2) * 2 * s
}

/**
 * The sand floor, painted once per resize into a canvas: hazy at the back, warmer at the front,
 * with grain, ripples and a few pebbles.
 */
export function createSand(): SceneLayer {
  const sprite = new Sprite()
  let texture: Texture | null = null

  function draw(world: TankWorld) {
    const { width, height, scale: s, resolution } = world
    const top = world.sandY - EDGE_ROOM * s
    const h = height - top
    const { canvas, ctx } = makeCanvas(Math.ceil(width * resolution), Math.ceil(h * resolution))
    ctx.scale(resolution, resolution)
    const rand = seededRandom(11)
    const edge = (x: number) => sandSurface(world, x) - top

    // Shape: everything below the wavy edge.
    ctx.beginPath()
    ctx.moveTo(0, h)
    for (let x = 0; x <= width + 8; x += 8) ctx.lineTo(x, edge(x))
    ctx.lineTo(width, h)
    ctx.closePath()
    ctx.save()
    ctx.clip()

    const base = ctx.createLinearGradient(0, EDGE_ROOM * s, 0, h)
    base.addColorStop(0, '#a9b29a')
    base.addColorStop(0.25, '#cdbf93')
    base.addColorStop(1, '#d9b981')
    ctx.fillStyle = base
    ctx.fillRect(0, 0, width, h)

    // Ripples: wavy lines, closer together toward the back, like sand seen at an angle.
    ctx.lineWidth = 1.2 * s
    for (let i = 0, y = EDGE_ROOM * s + 4 * s; y < h; i++) {
      ctx.strokeStyle = `rgba(120, 95, 55, ${0.1 + rand() * 0.06})`
      ctx.beginPath()
      const phase = rand() * 10
      for (let x = 0; x <= width; x += 6) ctx.lineTo(x, y + Math.sin(x * 0.035 + phase) * 1.6 * s)
      ctx.stroke()
      y += (4 + (y / h) * 9) * s
    }

    // Grain.
    const grains = Math.round((width * h) / 9)
    for (let i = 0; i < grains; i++) {
      const light = rand() < 0.5
      ctx.fillStyle = light ? `rgba(255, 245, 220, ${0.1 + rand() * 0.25})` : `rgba(90, 70, 40, ${0.08 + rand() * 0.2})`
      const size = (0.6 + rand() * 0.9) * Math.max(1, s * 0.8)
      ctx.fillRect(rand() * width, rand() * h, size, size)
    }

    // Pebbles with a little shading and shadow.
    const pebbleCount = Math.round(width / (45 * s))
    for (let i = 0; i < pebbleCount; i++) {
      const x = rand() * width
      const y = randomBetween(edge(x) + 10 * s, h - 3 * s, rand)
      const rx = randomBetween(1.8, 4.5, rand) * s * (0.6 + (y / h) * 0.6)
      const ry = rx * 0.6
      ctx.fillStyle = 'rgba(60, 45, 25, 0.25)'
      ctx.beginPath()
      ctx.ellipse(x + rx * 0.2, y + ry * 0.6, rx, ry * 0.7, 0, 0, Math.PI * 2)
      ctx.fill()
      const shade = ctx.createRadialGradient(x - rx * 0.3, y - ry * 0.4, rx * 0.1, x, y, rx)
      const tone = 110 + Math.floor(rand() * 80)
      shade.addColorStop(0, `rgb(${tone + 50}, ${tone + 40}, ${tone + 25})`)
      shade.addColorStop(1, `rgb(${tone - 30}, ${tone - 38}, ${tone - 50})`)
      ctx.fillStyle = shade
      ctx.beginPath()
      ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2)
      ctx.fill()
    }

    // The back edge fades into the water.
    const haze = ctx.createLinearGradient(0, 0, 0, EDGE_ROOM * s + 26 * s)
    haze.addColorStop(0, 'rgba(40, 110, 140, 0.55)')
    haze.addColorStop(1, 'rgba(40, 110, 140, 0)')
    ctx.fillStyle = haze
    ctx.fillRect(0, 0, width, EDGE_ROOM * s + 26 * s)
    ctx.restore()

    texture?.destroy(true)
    texture = Texture.from(canvas)
    sprite.texture = texture
    sprite.position.set(0, top)
    sprite.width = width
    sprite.height = h
  }

  return { view: sprite, resize: draw, update() {} }
}
