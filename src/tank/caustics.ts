import { Container, Texture, TilingSprite } from 'pixi.js'
import type { SceneLayer, TankWorld } from './layer'
import { makeCanvas, seededRandom } from './util'

const TILE = 256

/**
 * Caustics: the dancing web of light that waves focus onto the sand. Two tiling layers of the
 * same pattern drift in different directions and add up, so the web keeps changing.
 */
export function createCaustics(): SceneLayer {
  const view = new Container()
  const texture = Texture.from(drawCausticTile())
  const layers = [
    { sprite: new TilingSprite({ texture }), vx: 9, vy: 3, alpha: 0.22 },
    { sprite: new TilingSprite({ texture }), vx: -6, vy: 5, alpha: 0.16 },
  ]
  for (const layer of layers) {
    layer.sprite.blendMode = 'add'
    layer.sprite.tint = '#e6fbff'
    layer.sprite.alpha = layer.alpha
    view.addChild(layer.sprite)
  }
  let world: TankWorld | null = null

  return {
    view,
    resize(next) {
      world = next
      // Starts just under the wavy sand edge; squashed vertically, as the floor is seen at an angle.
      const top = next.sandY + 5 * next.scale
      for (const [i, layer] of layers.entries()) {
        layer.sprite.position.set(0, top)
        layer.sprite.width = next.width
        layer.sprite.height = next.height - top
        layer.sprite.tileScale.set(0.7 * next.scale * (i ? 1.35 : 1), 0.28 * next.scale * (i ? 1.35 : 1))
      }
    },
    update(dt) {
      if (!world) return
      for (const layer of layers) {
        layer.sprite.tilePosition.x += layer.vx * dt * world.scale
        layer.sprite.tilePosition.y += layer.vy * dt * world.scale * 0.4
      }
    },
  }
}

/**
 * A seamless tile of bright, thin, wavy lines meeting in irregular cells, like real caustics.
 * The lines are the borders between Voronoi cells around random points; distances wrap around the
 * tile edges, and the wobble uses whole-number frequencies, so the tile repeats without seams.
 */
function drawCausticTile() {
  const rand = seededRandom(17)
  const points = Array.from({ length: 22 }, () => [rand() * TILE, rand() * TILE])
  const { canvas, ctx } = makeCanvas(TILE)
  const image = ctx.createImageData(TILE, TILE)
  const wrap = (d: number) => Math.min(Math.abs(d), TILE - Math.abs(d))
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const wx = x + 5 * Math.sin(((y / TILE) * 3 + 0.2) * Math.PI * 2)
      const wy = y + 5 * Math.sin(((x / TILE) * 2 + 0.7) * Math.PI * 2)
      let nearest = Infinity
      let second = Infinity
      for (const [px, py] of points) {
        const dx = wrap(wx - px)
        const dy = wrap(wy - py)
        const d = dx * dx + dy * dy
        if (d < nearest) {
          second = nearest
          nearest = d
        } else if (d < second) second = d
      }
      // Bright where two cells meet.
      const border = Math.sqrt(second) - Math.sqrt(nearest)
      const light = Math.max(0, 1 - border / 7) ** 2.2
      const i = (y * TILE + x) * 4
      image.data[i] = image.data[i + 1] = image.data[i + 2] = 255
      image.data[i + 3] = Math.round(light * 255)
    }
  }
  ctx.putImageData(image, 0, 0)
  return canvas
}
