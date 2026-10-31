import type { Container } from 'pixi.js'

/** Screen-dependent layout shared by every layer. All values are CSS pixels. */
export interface TankWorld {
  width: number
  height: number
  /** Size multiplier so fish and decor look the same on a phone and on a TV. */
  scale: number
  /** Device pixels per CSS pixel, for layers that draw their own canvases. */
  resolution: number
  /** Top edge of the sand. */
  sandY: number
  /** Where the anemone sits; clownfish keep coming back to it. */
  anemone: { x: number; y: number }
}

/** One slice of the scene: it follows the screen size and animates every frame. */
export interface SceneLayer {
  view: Container
  resize(world: TankWorld): void
  update(dtSeconds: number, timeSeconds: number): void
}
