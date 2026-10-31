import { Sprite, Texture } from 'pixi.js'
import type { SceneLayer, TankWorld } from './layer'
import { makeCanvas, seededRandom } from './util'

/** Reef ridges, far to near. Far ones are paler and closer to the water colour, like haze. */
const RIDGES = [
  { color: [38, 120, 150], alpha: 0.45, height: 0.95, bumps: 9 },
  { color: [24, 92, 124], alpha: 0.6, height: 0.7, bumps: 12 },
  { color: [16, 66, 96], alpha: 0.75, height: 0.42, bumps: 16 },
]

/** The distant reef: hazy silhouettes of rock and coral behind everything else. Redrawn on resize. */
export function createBackdrop(): SceneLayer {
  const sprite = new Sprite()
  let texture: Texture | null = null

  function draw(world: TankWorld) {
    const height = Math.round(world.height * 0.38)
    const width = Math.ceil(world.width)
    const { canvas, ctx } = makeCanvas(width, height)
    const rand = seededRandom(21)

    for (const ridge of RIDGES) {
      const peaks = Array.from({ length: ridge.bumps }, () => ({
        x: rand(),
        height: (0.35 + rand() * 0.65) * ridge.height,
        width: 0.03 + rand() * 0.09,
      }))
      ctx.beginPath()
      ctx.moveTo(0, height)
      for (let x = 0; x <= width; x += 4) {
        const u = x / width
        let lift = 0.12 * ridge.height
        for (const peak of peaks) lift = Math.max(lift, peak.height * Math.exp(-(((u - peak.x) / peak.width) ** 2)))
        // Small lumps along the top, like coral heads.
        lift += Math.sin(x * 0.09 + ridge.bumps) * 0.012 + Math.sin(x * 0.23) * 0.006
        ctx.lineTo(x, height - lift * height)
      }
      ctx.lineTo(width, height)
      ctx.closePath()
      const [r, g, b] = ridge.color
      const gradient = ctx.createLinearGradient(0, height * (1 - ridge.height), 0, height)
      gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${ridge.alpha * 0.35})`)
      gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, ${ridge.alpha})`)
      ctx.fillStyle = gradient
      ctx.fill()
    }

    texture?.destroy(true)
    texture = Texture.from(canvas)
    sprite.texture = texture
    sprite.position.set(0, world.sandY + 10 * world.scale - height)
  }

  return { view: sprite, resize: draw, update() {} }
}
