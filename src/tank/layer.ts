import type { Container } from 'pixi.js'

/** One slice of the scene: it follows the screen size and animates every frame. */
export interface SceneLayer {
  view: Container
  resize(width: number, height: number): void
  update(dtSeconds: number): void
}
