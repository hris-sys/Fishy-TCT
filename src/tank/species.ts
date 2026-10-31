import { CanvasSource, Rectangle, Texture } from 'pixi.js'
import { makeCanvas } from './util'

/**
 * Mask shapes, in the face slot's own space. Oval sizes are fractions of the slot (1 = full width);
 * a custom path is SVG path data in a 100×100 box that covers the slot.
 */
export type MaskShape =
  | { shape: 'circle' }
  | { shape: 'oval'; width: number; height: number }
  | { shape: 'path'; d: string }

/** `feather` is the soft edge width, as a fraction of the slot size. */
export type MaskConfig = MaskShape & { feather: number }

export interface SwimConfig {
  /** Cruise speed, in art units per second (scaled with the tank). */
  speed: number
  /** How quickly the fish steers toward where it wants to go, per second. Higher is twitchier. */
  turnRate: number
  /** Preferred depth range: 0 is the surface, 1 is the sand. */
  depth: { top: number; bottom: number }
  /** Tail beats per second at cruise speed. */
  wiggleHz: number
  /** 0 swims straight, 1 meanders a lot. */
  wander: number
  /** Up-and-down bob, in art units. */
  bob: number
  /** 0 swims steadily; above 0 it darts every few seconds, at this many times its cruise speed. */
  dart: number
  /** Other fish swerve away from predators. */
  predator: boolean
  /** Keeps returning to this spot. */
  home?: 'anemone'
  /** When set, one person's fish is a school of this many, all wearing their face. */
  school?: number
}

/** One species, as data. Art faces right; all positions are in the body art's units, relative to its center. */
export interface SpeciesConfig {
  id: string
  label: string
  /** Display size on top of the tank's own scale. */
  scale: number
  /** Body sprite (SVG or PNG), drawn centered. */
  body: string
  tail: {
    src: string
    /** Hinge point inside the tail art, in tail art units. */
    pivot: { x: number; y: number }
    /** Where that hinge sits on the body. */
    attach: { x: number; y: number }
    /** Tail swing either side, in radians. */
    swing: number
  }
  faceSlot: { x: number; y: number; size: number; rotation: number }
  mask: MaskConfig
  /** Optional soft light on the body (the anglerfish's lure), in body art units; it flashes when tapped. */
  glow?: { x: number; y: number; size: number }
  swim: SwimConfig
  /** What happens when the fish is tapped: 'scatter', 'hide-in-anemone', 'puff', 'snap' or 'lure-flash'. */
  reaction: string
}

export interface LoadedSpecies {
  config: SpeciesConfig
  body: Texture
  tail: Texture
}

/** Art is rasterized at this multiple of its size, so it stays sharp on big screens. */
const ART_RESOLUTION = 3

/** Room around each picture in the atlas, so the smaller mipmap levels don't bleed into neighbours. */
const ATLAS_PADDING = 16
const ATLAS_WIDTH = 2048

async function rasterize(src: string): Promise<HTMLCanvasElement> {
  const image = new Image()
  image.src = src
  await image.decode()
  const { canvas, ctx } = makeCanvas(
    Math.ceil(image.naturalWidth * ART_RESOLUTION),
    Math.ceil(image.naturalHeight * ART_RESOLUTION),
  )
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
  return canvas
}

/** Packs pictures into rows of one big canvas, tallest first. Returns where each one went. */
function packAtlas(pictures: HTMLCanvasElement[]) {
  const spots = new Map<HTMLCanvasElement, { x: number; y: number }>()
  let x = ATLAS_PADDING
  let y = ATLAS_PADDING
  let rowHeight = 0
  for (const picture of [...pictures].sort((a, b) => b.height - a.height)) {
    if (x + picture.width + ATLAS_PADDING > ATLAS_WIDTH) {
      x = ATLAS_PADDING
      y += rowHeight + ATLAS_PADDING
      rowHeight = 0
    }
    spots.set(picture, { x, y })
    x += picture.width + ATLAS_PADDING
    rowHeight = Math.max(rowHeight, picture.height)
  }
  const height = 2 ** Math.ceil(Math.log2(y + rowHeight + ATLAS_PADDING))
  const { canvas, ctx } = makeCanvas(ATLAS_WIDTH, height)
  for (const [picture, spot] of spots) ctx.drawImage(picture, spot.x, spot.y)
  return { canvas, spots }
}

/**
 * Loads every species' body and tail art into one texture atlas, so all fish draw from a single
 * image on the GPU instead of ten.
 */
export async function loadSpecies(configs: SpeciesConfig[]): Promise<LoadedSpecies[]> {
  const art = await Promise.all(
    configs.map(async (config) => {
      const [body, tail] = await Promise.all([rasterize(config.body), rasterize(config.tail.src)])
      return { config, body, tail }
    }),
  )
  const { canvas, spots } = packAtlas(art.flatMap(({ body, tail }) => [body, tail]))
  const source = new CanvasSource({ resource: canvas, resolution: ART_RESOLUTION, autoGenerateMipmaps: true })
  const frame = (picture: HTMLCanvasElement) => {
    const spot = spots.get(picture)!
    return new Texture({
      source,
      frame: new Rectangle(spot.x / ART_RESOLUTION, spot.y / ART_RESOLUTION, picture.width / ART_RESOLUTION, picture.height / ART_RESOLUTION),
    })
  }
  return art.map(({ config, body, tail }) => ({ config, body: frame(body), tail: frame(tail) }))
}
