import { Container, Graphics, Text } from 'pixi.js'
import type { Fish } from './fish'
import type { SceneLayer, TankWorld } from './layer'
import { clamp } from './util'

const SHOW_SECONDS = 3.2
const FADE_IN = 0.15
const FADE_OUT = 0.45

interface Tag {
  view: Container
  fish: Fish
  ownerId: string
  age: number
}

export interface NameTags extends SceneLayer {
  /** Shows the fish owner's name above it for a few seconds. Showing it again restarts the timer. */
  show(fish: Fish): void
}

/** Name tags that follow a fish around, shown when someone taps it. */
export function createNameTags(): NameTags {
  const view = new Container()
  const tags: Tag[] = []
  let world: TankWorld | null = null

  function build(name: string, scale: number) {
    const tag = new Container()
    const text = new Text({
      text: name,
      style: { fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif', fontSize: 14 * scale, fontWeight: '600', fill: '#ffffff' },
    })
    text.anchor.set(0.5)
    const padX = 9 * scale
    const padY = 4 * scale
    const width = text.width + padX * 2
    const height = text.height + padY * 2
    const background = new Graphics()
      .roundRect(-width / 2, -height / 2, width, height, height / 2)
      .fill({ color: '#06243d', alpha: 0.78 })
      .stroke({ color: '#ffffff', alpha: 0.35, width: 1 })
    tag.addChild(background, text)
    return tag
  }

  return {
    view,
    show(fish) {
      const existing = tags.find((tag) => tag.ownerId === fish.owner.id)
      if (existing) {
        existing.fish = fish
        existing.age = Math.min(existing.age, FADE_IN)
        return
      }
      const tagScale = clamp(world?.scale ?? 1, 1, 2)
      const tag: Tag = { view: build(fish.owner.name, tagScale), fish, ownerId: fish.owner.id, age: 0 }
      tag.view.alpha = 0
      view.addChild(tag.view)
      tags.push(tag)
    },
    resize(next) {
      world = next
    },
    update(dt) {
      if (!world) return
      for (let i = tags.length - 1; i >= 0; i--) {
        const tag = tags[i]
        tag.age += dt
        // Gone if its fish was removed, or its time is up.
        if (tag.age > SHOW_SECONDS || tag.fish.view.destroyed) {
          tag.view.destroy({ children: true })
          tags.splice(i, 1)
          continue
        }
        const fadeOut = clamp((SHOW_SECONDS - tag.age) / FADE_OUT, 0, 1)
        tag.view.alpha = Math.min(tag.age / FADE_IN, 1) * fadeOut
        // Above the fish, kept on screen; below it when the fish is near the surface.
        const bounds = tag.view.getLocalBounds()
        const halfWidth = bounds.width / 2
        const gap = tag.fish.halfHeight(world.scale) + 8 + bounds.height / 2
        const above = tag.fish.y - gap
        tag.view.position.set(
          clamp(tag.fish.x, halfWidth + 4, world.width - halfWidth - 4),
          above > bounds.height / 2 + 4 ? above : tag.fish.y + gap,
        )
      }
    },
  }
}
