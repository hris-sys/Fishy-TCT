import { Application } from 'pixi.js'
import { createBubbles } from './bubbles'
import type { SceneLayer } from './layer'
import { createWater } from './water'

/** Phones report up to 3–4x; past 2x the extra pixels cost a lot of GPU and look the same. */
const MAX_RESOLUTION = 2

export interface TankStats {
  fps: number
  width: number
  height: number
  resolution: number
}

export interface Tank {
  stats(): TankStats
  destroy(): void
}

function screenResolution() {
  return Math.min(window.devicePixelRatio || 1, MAX_RESOLUTION)
}

/** Mounts a fullscreen tank inside `host`, which should fill the viewport. */
export async function createTank(host: HTMLElement): Promise<Tank> {
  const app = new Application()
  await app.init({
    width: host.clientWidth,
    height: host.clientHeight,
    resolution: screenResolution(),
    autoDensity: true,
    antialias: true,
    background: '#0a2b4d',
  })
  host.appendChild(app.canvas)

  const layers: SceneLayer[] = [createWater(), createBubbles()]
  for (const layer of layers) app.stage.addChild(layer.view)

  // ResizeObserver catches window resizes, phone rotation and mobile toolbar changes alike.
  const resize = () => {
    const width = host.clientWidth
    const height = host.clientHeight
    if (width === 0 || height === 0) return
    app.renderer.resize(width, height, screenResolution())
    for (const layer of layers) layer.resize(width, height)
  }
  resize()
  const observer = new ResizeObserver(resize)
  observer.observe(host)

  // deltaMS is capped at 100 ms by the ticker, so a stalled frame can't teleport anything.
  app.ticker.add((ticker) => {
    const dt = ticker.deltaMS / 1000
    for (const layer of layers) layer.update(dt)
  })

  // Stop simulating and rendering while the tab is hidden; resuming starts from a fresh timestamp.
  const onVisibilityChange = () => {
    if (document.hidden) app.ticker.stop()
    else app.ticker.start()
  }
  document.addEventListener('visibilitychange', onVisibilityChange)

  return {
    stats: () => ({
      fps: app.ticker.FPS,
      width: app.screen.width,
      height: app.screen.height,
      resolution: app.renderer.resolution,
    }),
    destroy() {
      observer.disconnect()
      document.removeEventListener('visibilitychange', onVisibilityChange)
      app.destroy(true, { children: true, texture: true })
    },
  }
}
