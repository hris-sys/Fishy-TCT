import { Application } from 'pixi.js'
import { createAnemone } from './anemone'
import { createBubbles } from './bubbles'
import type { SceneLayer, TankWorld } from './layer'
import { createPlants } from './plants'
import { createRays } from './rays'
import { createSand } from './sand'
import { createSchool } from './school'
import { type SpeciesConfig, loadSpecies } from './species'
import { clamp } from './util'
import { createWater } from './water'

/** Phones report up to 3–4x; past 2x the extra pixels cost a lot of GPU and look the same. */
const MAX_RESOLUTION = 2
/** The short screen side, in CSS px, that counts as tank scale 1. */
const REFERENCE_SIZE = 480

export interface TankOptions {
  species: SpeciesConfig[]
  fishCount?: number
  /** Exposes the Pixi app as `__PIXI_APP__` for the PixiJS devtools extension and test scripts. */
  devtools?: boolean
}

export interface TankStats {
  fps: number
  width: number
  height: number
  resolution: number
  fish: number
}

export interface Tank {
  stats(): TankStats
  fishCount(): number
  setFishCount(count: number): void
  /** Call after changing a species' mask, so its faces are re-cut. Other config changes apply live. */
  refreshSpecies(id: string): void
  destroy(): void
}

function screenResolution() {
  return Math.min(window.devicePixelRatio || 1, MAX_RESOLUTION)
}

function layout(width: number, height: number): TankWorld {
  const scale = clamp(Math.min(width, height) / REFERENCE_SIZE, 0.7, 2.2)
  const sandHeight = Math.max(44 * scale, height * 0.1)
  const sandY = height - sandHeight
  return { width, height, scale, sandY, anemone: { x: width * 0.72, y: sandY + sandHeight * 0.3 } }
}

/** Mounts a fullscreen tank inside `host`, which should fill the viewport. */
export async function createTank(host: HTMLElement, options: TankOptions): Promise<Tank> {
  const app = new Application()
  await app.init({
    width: host.clientWidth,
    height: host.clientHeight,
    resolution: screenResolution(),
    autoDensity: true,
    antialias: true,
    background: '#0a2b4d',
  })

  const species = await loadSpecies(options.species)
  const school = createSchool(species)
  // Back to front.
  const layers: SceneLayer[] = [
    createWater(),
    createRays(),
    createPlants(),
    createSand(),
    createAnemone(),
    school,
    createBubbles(),
  ]
  for (const layer of layers) app.stage.addChild(layer.view)
  host.appendChild(app.canvas)
  if (options.devtools) Object.assign(globalThis, { __PIXI_APP__: app })

  // ResizeObserver catches window resizes, phone rotation and mobile toolbar changes alike.
  const resize = () => {
    const width = host.clientWidth
    const height = host.clientHeight
    if (width === 0 || height === 0) return
    app.renderer.resize(width, height, screenResolution())
    const world = layout(width, height)
    for (const layer of layers) layer.resize(world)
  }
  resize()
  school.setCount(options.fishCount ?? 15)
  const observer = new ResizeObserver(resize)
  observer.observe(host)

  // deltaMS is capped at 100 ms by the ticker, so a stalled frame can't teleport anything.
  let time = 0
  app.ticker.add((ticker) => {
    const dt = ticker.deltaMS / 1000
    time += dt
    for (const layer of layers) layer.update(dt, time)
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
      fish: school.count(),
    }),
    fishCount: () => school.count(),
    setFishCount: (count) => school.setCount(count),
    refreshSpecies: (id) => school.refreshSpecies(id),
    destroy() {
      observer.disconnect()
      document.removeEventListener('visibilitychange', onVisibilityChange)
      app.destroy(true, { children: true, texture: true })
    },
  }
}
