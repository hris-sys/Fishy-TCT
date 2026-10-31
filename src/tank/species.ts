import type { Texture } from 'pixi.js'
import { canvasTexture, makeCanvas } from './util'

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
  swim: SwimConfig
  /** Tap animation, played from iteration 5. */
  reaction: string
}

export interface LoadedSpecies {
  config: SpeciesConfig
  body: Texture
  tail: Texture
}

/** Art is rasterized at this multiple of its size, so it stays sharp on big screens. */
const ART_RESOLUTION = 3

async function loadArt(src: string): Promise<Texture> {
  const image = new Image()
  image.src = src
  await image.decode()
  const { canvas, ctx } = makeCanvas(
    Math.ceil(image.naturalWidth * ART_RESOLUTION),
    Math.ceil(image.naturalHeight * ART_RESOLUTION),
  )
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
  return canvasTexture(canvas, ART_RESOLUTION)
}

export async function loadSpecies(configs: SpeciesConfig[]): Promise<LoadedSpecies[]> {
  return Promise.all(
    configs.map(async (config) => {
      const [body, tail] = await Promise.all([loadArt(config.body), loadArt(config.tail.src)])
      return { config, body, tail }
    }),
  )
}
