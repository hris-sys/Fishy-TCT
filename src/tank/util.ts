import { CanvasSource, Texture } from 'pixi.js'

export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t

export const randomBetween = (min: number, max: number, rand: () => number = Math.random) => min + rand() * (max - min)

/** Small seeded random generator, so decor stays in the same place across resizes. */
export function seededRandom(seed: number) {
  let state = seed | 0
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function makeCanvas(width: number, height = width) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return { canvas, ctx: canvas.getContext('2d')! }
}

/**
 * Wraps a canvas in a texture. Mipmaps keep it from shimmering when drawn much smaller than its
 * pixel size, which is the normal case for faces and fish art.
 */
export function canvasTexture(canvas: HTMLCanvasElement, resolution = 1) {
  return new Texture({ source: new CanvasSource({ resource: canvas, resolution, autoGenerateMipmaps: true }) })
}
