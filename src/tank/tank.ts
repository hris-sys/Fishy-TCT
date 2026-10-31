import { Application, type Container, Graphics, Text } from 'pixi.js'
import { createAnemone } from './anemone'
import { createParticles, createSurface, createVignette } from './atmosphere'
import { createBackdrop } from './backdrop'
import { createBubbles } from './bubbles'
import { createCaustics } from './caustics'
import { createEffects } from './effects'
import { type ResidentInput, createFishLayer } from './fish-layer'
import type { SceneLayer, TankWorld } from './layer'
import { createPlants } from './plants'
import { createRays } from './rays'
import { createReef } from './reef'
import { createSand } from './sand'
import { type SpeciesConfig, loadSpecies } from './species'
import { createNameTags } from './tags'
import { clamp } from './util'
import { createWater } from './water'

/** Phones report up to 3–4x; past 2x the extra pixels cost a lot of GPU and look the same. */
const MAX_RESOLUTION = 2
/** The short screen side, in CSS px, that counts as tank scale 1. */
const REFERENCE_SIZE = 480

export interface TankOptions {
  species: SpeciesConfig[]
  /** Stand-in people with cartoon faces. Defaults to 0. */
  placeholders?: number
  /** 'full' is the main tank; 'simple' (water, sand, anemone, bubbles) suits small previews. */
  scenery?: 'full' | 'simple'
  /** Makes everything bigger (above 1) or smaller, on top of the automatic screen-size scale. */
  zoom?: number
  /** Tapping a fish shows its name tag. On by default. */
  interactive?: boolean
  /** Called with the owner's id when a fish is tapped. */
  onFishTap?: (id: string) => void
  /** Exposes the Pixi app as `__PIXI_APP__` for the PixiJS devtools extension and test scripts. */
  devtools?: boolean
}

export interface TankStats {
  fps: number
  width: number
  height: number
  resolution: number
  /** People in the tank. */
  people: number
  /** Fish on screen; schools make this larger than `people`. */
  fish: number
}

export interface Tank {
  stats(): TankStats
  /** Adds someone's fish. With `dropIn`, it falls in from above the surface with a splash. */
  addResident(input: ResidentInput, options?: { dropIn?: boolean }): void
  /** Name and tint change in place; a new species or face rebuilds the fish where it swims. */
  updateResident(id: string, changes: Partial<Omit<ResidentInput, 'id'>>): void
  removeResident(id: string): void
  placeholderCount(): number
  setPlaceholders(count: number): void
  /** Shows someone's name tag, as if their fish was tapped. */
  showTag(id: string): void
  /** Stops animating (e.g. while a full-screen dialog covers the tank). */
  setPaused(paused: boolean): void
  /** Call after changing a species' mask, so its faces are re-cut. Other config changes apply live. */
  refreshSpecies(id: string): void
  destroy(): void
}

function screenResolution() {
  return Math.min(window.devicePixelRatio || 1, MAX_RESOLUTION)
}

function layout(width: number, height: number, zoom: number): TankWorld {
  const scale = clamp(Math.min(width, height) / REFERENCE_SIZE, 0.7, 2.2) * zoom
  const sandHeight = Math.max(44 * scale, height * 0.1)
  const sandY = height - sandHeight
  return {
    width,
    height,
    scale,
    resolution: screenResolution(),
    sandY,
    anemone: { x: width * 0.72, y: sandY + sandHeight * 0.3 },
  }
}

/** Mounts a tank that fills `host`, and follows its size. */
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
  const effects = createEffects()
  const fish = createFishLayer(species, effects)
  const tags = createNameTags()
  // Back to front. Rocks and corals come before the sand so their bases sink into it.
  const layers: SceneLayer[] =
    options.scenery === 'simple'
      ? [createWater(), createSand(), createCaustics(), createAnemone(), fish, effects, createBubbles(), tags]
      : [
          createWater(),
          createBackdrop(),
          createRays(),
          createPlants('back'),
          createReef(),
          createSand(),
          createCaustics(),
          createAnemone(),
          fish,
          effects,
          createPlants('front'),
          createParticles(),
          createBubbles(),
          createSurface(),
          createVignette(),
          tags,
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
    const world = layout(width, height, options.zoom ?? 1)
    for (const layer of layers) layer.resize(world)
  }
  resize()
  fish.setPlaceholders(options.placeholders ?? 0)
  const observer = new ResizeObserver(resize)
  observer.observe(host)

  // Tapping a fish shows its owner's name. The tap may land a little off a small fish.
  if (options.interactive !== false) {
    app.stage.eventMode = 'static'
    app.stage.hitArea = app.screen
    app.stage.on('pointertap', (event) => {
      const tapped = fish.fishAt(event.global.x, event.global.y)
      if (!tapped) return
      tags.show(tapped)
      options.onFishTap?.(tapped.owner.id)
    })
  }

  // deltaMS is capped at 100 ms by the ticker, so a stalled frame can't teleport anything.
  let time = 0
  app.ticker.add((ticker) => {
    const dt = ticker.deltaMS / 1000
    time += dt
    for (const layer of layers) layer.update(dt, time)
  })

  // Stop simulating and rendering while hidden or paused; resuming starts from a fresh timestamp.
  let paused = false
  const sync = () => {
    if (document.hidden || paused) app.ticker.stop()
    else app.ticker.start()
  }
  document.addEventListener('visibilitychange', sync)

  return {
    stats: () => ({
      fps: app.ticker.FPS,
      width: app.screen.width,
      height: app.screen.height,
      resolution: app.renderer.resolution,
      people: fish.count(),
      fish: fish.swimming(),
    }),
    addResident: (input, addOptions) => fish.add(input, addOptions?.dropIn ?? false),
    updateResident: (id, changes) => fish.edit(id, changes),
    removeResident: (id) => fish.remove(id),
    placeholderCount: () => fish.placeholderCount(),
    setPlaceholders: (count) => fish.setPlaceholders(count),
    showTag(id) {
      const first = fish.firstFishOf(id)
      if (first) tags.show(first)
    },
    setPaused(next) {
      paused = next
      sync()
    },
    refreshSpecies: (id) => fish.refreshSpecies(id),
    destroy() {
      observer.disconnect()
      document.removeEventListener('visibilitychange', sync)
      // Shapes and text go first, without their textures: shape fills use Pixi's white texture,
      // which every tank on the page shares. Everything else owns its textures and frees them.
      const detachShared = (parent: Container) => {
        for (const child of [...parent.children]) {
          if (child instanceof Graphics || child instanceof Text) child.destroy()
          else detachShared(child)
        }
      }
      detachShared(app.stage)
      // `{ removeView: true }`, not `true`: plain `true` also releases Pixi's global pools, which
      // breaks any other tank still running on the page.
      app.destroy({ removeView: true }, { children: true, texture: true, textureSource: true })
    },
  }
}
