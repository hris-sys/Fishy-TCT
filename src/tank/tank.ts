import { Application, type Container, Graphics, Text } from 'pixi.js'
import { createAnemone } from './anemone'
import { createParticles, createSurface, createVignette } from './atmosphere'
import { createBackdrop } from './backdrop'
import { createBubbles } from './bubbles'
import { createCaustics } from './caustics'
import { createEffects } from './effects'
import { type ResidentInput, type TankSound, createFishLayer } from './fish-layer'
import { createFood } from './food'
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
/** Holding a finger down this long, without moving, is a long press instead of a tap. */
const LONG_PRESS_MS = 550
const TAP_SLOP = 12

export interface TankOptions {
  species: SpeciesConfig[]
  /** Stand-in people with cartoon faces. Defaults to 0. */
  placeholders?: number
  /** 'full' is the main tank; 'simple' (water, sand, anemone, bubbles) suits small previews. */
  scenery?: 'full' | 'simple'
  /** Makes everything bigger (above 1) or smaller, on top of the automatic screen-size scale. */
  zoom?: number
  /** Makes only the fish bigger (above 1) or smaller. */
  fishZoom?: number
  /** Tapping a fish shows its name tag. On by default. */
  interactive?: boolean
  /** Called with the owner's id when a fish is tapped. */
  onFishTap?: (id: string) => void
  /** Called with the owner's id when a fish is held down. */
  onFishLongPress?: (id: string) => void
  /** Called when open water is tapped, with the spot as fractions of the tank's width and height. */
  onWaterTap?: (x: number, y: number) => void
  /** The tank wants a sound played; the app decides whether and how. */
  onSound?: (name: TankSound, detail?: string) => void
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
  /** With `swimAway`, the fish swim off-screen first instead of vanishing. */
  removeResident(id: string, options?: { swimAway?: boolean }): void
  /** Offline people's fish doze: dimmer, slower, a little lower, blowing "z"s. */
  setAsleep(id: string, asleep: boolean): void
  placeholderCount(): number
  setPlaceholders(count: number): void
  /** Shows someone's name tag, as if their fish was tapped. */
  showTag(id: string): void
  /** Shows a speech bubble above someone's fish, with their name and the message. */
  say(id: string, text: string): void
  /** Plays the tap reaction of someone's fish (the whole school, for a school). */
  react(id: string): void
  /** Drops food at a fraction of the width. The same seed scatters it the same way on every screen. */
  feed(xFraction: number, seed: number): void
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
  const food = createFood()
  const sound = (name: TankSound, detail?: string) => options.onSound?.(name, detail)
  const fish = createFishLayer(species, effects, food, sound, options.fishZoom ?? 1)
  const tags = createNameTags()
  // Back to front. Rocks and corals come before the sand so their bases sink into it.
  const layers: SceneLayer[] =
    options.scenery === 'simple'
      ? [createWater(), createSand(), createCaustics(), createAnemone(), fish, food, effects, createBubbles(), tags]
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
          food,
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

  // Tap a fish: its name tag shows and the app hears about it. Hold a fish: a long press, fired
  // while still holding. Tap open water: the app hears where. The fish is picked when the finger
  // goes down, so a fish swimming away mid-press still counts, and taps may land a little off.
  if (options.interactive !== false) {
    app.stage.eventMode = 'static'
    app.stage.hitArea = app.screen
    let press: { x: number; y: number; target: ReturnType<typeof fish.fishAt>; timer: number; done: boolean } | null = null
    const cancel = () => {
      if (press) window.clearTimeout(press.timer)
      press = null
    }
    app.stage.on('pointerdown', (event) => {
      cancel()
      const { x, y } = event.global
      const target = fish.fishAt(x, y)
      const current = { x, y, target, timer: 0, done: false }
      if (target) {
        current.timer = window.setTimeout(() => {
          current.done = true
          options.onFishLongPress?.(target.owner.id)
        }, LONG_PRESS_MS)
      }
      press = current
    })
    app.stage.on('pointermove', (event) => {
      if (press && Math.hypot(event.global.x - press.x, event.global.y - press.y) > TAP_SLOP) cancel()
    })
    app.stage.on('pointerupoutside', cancel)
    app.stage.on('pointerup', (event) => {
      const current = press
      cancel()
      if (!current || current.done) return
      if (current.target) {
        tags.show(current.target)
        options.onFishTap?.(current.target.owner.id)
      } else {
        options.onWaterTap?.(event.global.x / app.screen.width, event.global.y / app.screen.height)
      }
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
    removeResident: (id, removeOptions) => fish.remove(id, removeOptions?.swimAway ?? false),
    setAsleep: (id, asleep) => fish.setAsleep(id, asleep),
    placeholderCount: () => fish.placeholderCount(),
    setPlaceholders: (count) => fish.setPlaceholders(count),
    showTag(id) {
      const first = fish.firstFishOf(id)
      if (first) tags.show(first)
    },
    say(id, text) {
      const first = fish.firstFishOf(id)
      if (first) tags.say(first, text)
    },
    react: (id) => fish.react(id),
    feed(xFraction, seed) {
      food.drop(xFraction, seed)
      sound('feed')
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
