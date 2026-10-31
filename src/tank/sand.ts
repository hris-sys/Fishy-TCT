import { Graphics } from 'pixi.js'
import type { SceneLayer, TankWorld } from './layer'
import { randomBetween, seededRandom } from './util'

const PEBBLES = ['#b89466', '#9c7b55', '#d8c19a', '#8f8a80', '#c4a77a']

/** The sand floor: a wavy top edge, a darker lower band and scattered pebbles. Redrawn on resize. */
export function createSand(): SceneLayer {
  const g = new Graphics()

  function draw(world: TankWorld) {
    const { width, height, sandY, scale } = world
    const rand = seededRandom(11)
    const surfaceAt = (x: number, lift = 0) =>
      sandY - lift + Math.sin(x * 0.011 + 0.6) * 5 * scale + Math.sin(x * 0.029 + 2) * 2.5 * scale

    const edge: number[] = []
    for (let x = 0; x <= width + 16; x += 16) edge.push(x, surfaceAt(x))

    g.clear()
    g.poly([...edge, width, height, 0, height]).fill('#e3c793')

    // Darker, deeper sand.
    const lowerTop = sandY + (height - sandY) * 0.45
    const lower: number[] = []
    for (let x = 0; x <= width + 16; x += 16) lower.push(x, lowerTop + Math.sin(x * 0.017 + 1) * 4 * scale)
    g.poly([...lower, width, height, 0, height]).fill('#cfac74')

    // Light lip along the top edge.
    g.moveTo(edge[0], edge[1])
    for (let i = 2; i < edge.length; i += 2) g.lineTo(edge[i], edge[i + 1])
    g.stroke({ width: 3 * scale, color: '#f3e2bb' })

    const pebbleCount = Math.round(width / (36 * scale))
    for (let i = 0; i < pebbleCount; i++) {
      const x = rand() * width
      const y = randomBetween(surfaceAt(x) + 8 * scale, height - 4 * scale, rand)
      const rx = randomBetween(2.5, 6.5, rand) * scale
      g.ellipse(x, y, rx, rx * 0.62).fill(PEBBLES[Math.floor(rand() * PEBBLES.length)])
    }
  }

  return { view: g, resize: draw, update() {} }
}
