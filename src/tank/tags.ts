import { Container, Graphics, Text } from 'pixi.js'
import type { Fish } from './fish'
import type { SceneLayer, TankWorld } from './layer'
import { clamp } from './util'

const NAME_SECONDS = 3.2
const FADE_IN = 0.15
const FADE_OUT = 0.45
const FONT = 'system-ui, -apple-system, Segoe UI, sans-serif'

interface Tag {
  view: Container
  fish: Fish
  ownerId: string
  kind: 'name' | 'speech'
  age: number
  life: number
}

export interface NameTags extends SceneLayer {
  /** Shows the fish owner's name above it for a few seconds. Showing it again restarts the timer. */
  show(fish: Fish): void
  /** Shows a speech bubble above the fish, with its owner's name and a message (e.g. from the chat). */
  say(fish: Fish, text: string): void
}

/** Name tags and speech bubbles that follow a fish around. */
export function createNameTags(): NameTags {
  const view = new Container()
  const tags: Tag[] = []
  let world: TankWorld | null = null
  const tagScale = () => clamp(world?.scale ?? 1, 1, 2)

  function buildName(name: string, scale: number) {
    const tag = new Container()
    const text = new Text({ text: name, style: { fontFamily: FONT, fontSize: 14 * scale, fontWeight: '600', fill: '#ffffff' } })
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

  /** A pale bubble with a little tail pointing down at the fish: the name, then the message. */
  function buildSpeech(name: string, message: string, scale: number) {
    const bubble = new Container()
    const nameText = new Text({ text: name, style: { fontFamily: FONT, fontSize: 11 * scale, fontWeight: '700', fill: '#2e6f96' } })
    const body = new Text({
      text: message,
      style: { fontFamily: FONT, fontSize: 14 * scale, fill: '#0b2238', wordWrap: true, breakWords: true, wordWrapWidth: 190 * scale, lineHeight: 18 * scale },
    })
    const padX = 10 * scale
    const padY = 7 * scale
    const width = Math.max(nameText.width, body.width) + padX * 2
    const height = nameText.height + body.height + padY * 2
    const tail = 7 * scale
    const background = new Graphics()
      .roundRect(-width / 2, -height / 2, width, height, 12 * scale)
      .poly([-tail, height / 2 - 1, tail, height / 2 - 1, 0, height / 2 + tail])
      .fill({ color: '#f4fbff', alpha: 0.94 })
    nameText.position.set(-width / 2 + padX, -height / 2 + padY)
    body.position.set(-width / 2 + padX, -height / 2 + padY + nameText.height)
    bubble.addChild(background, nameText, body)
    return bubble
  }

  function add(tag: Tag) {
    tag.view.alpha = 0
    view.addChild(tag.view)
    tags.push(tag)
  }

  function drop(index: number) {
    tags[index].view.destroy({ children: true })
    tags.splice(index, 1)
  }

  return {
    view,
    show(fish) {
      // While the owner is talking, their bubble already shows the name.
      if (tags.some((tag) => tag.ownerId === fish.owner.id && tag.kind === 'speech')) return
      const existing = tags.find((tag) => tag.ownerId === fish.owner.id && tag.kind === 'name')
      if (existing) {
        existing.fish = fish
        existing.age = Math.min(existing.age, FADE_IN)
        return
      }
      add({ view: buildName(fish.owner.name, tagScale()), fish, ownerId: fish.owner.id, kind: 'name', age: 0, life: NAME_SECONDS })
    },
    say(fish, text) {
      // One bubble per person: a new message replaces the old one, and the name tag steps aside.
      for (let i = tags.length - 1; i >= 0; i--) if (tags[i].ownerId === fish.owner.id) drop(i)
      const life = clamp(3 + text.length * 0.06, 3.5, 8)
      add({ view: buildSpeech(fish.owner.name, text, tagScale()), fish, ownerId: fish.owner.id, kind: 'speech', age: 0, life })
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
        if (tag.age > tag.life || tag.fish.view.destroyed) {
          drop(i)
          continue
        }
        const fadeOut = clamp((tag.life - tag.age) / FADE_OUT, 0, 1)
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
