import { Container, Sprite, Texture } from 'pixi.js'
import type { SceneLayer, TankWorld } from './layer'
import { makeCanvas, randomBetween } from './util'

interface Particle {
  sprite: Sprite
  kind: 'bubble' | 'foam' | 'z'
  x: number
  y: number
  vx: number
  vy: number
  age: number
  life: number
  size: number
  phase: number
}

export interface Effects extends SceneLayer {
  /** The underside of a splash at the surface: a flash of foam and a burst of bubbles. */
  splash(x: number, size: number): void
  /** A few bubbles at a point, e.g. trailing behind a fish that just dived in. */
  bubbles(x: number, y: number, count: number, size: number): void
  /** A "z" floating up from a sleeping fish. */
  snore(x: number, y: number): void
}

/** Short-lived particles: splashes and bubble bursts. Sprites are pooled and reused. */
export function createEffects(): Effects {
  const view = new Container()
  const bubbleTexture = Texture.from(drawBubble())
  const foamTexture = Texture.from(drawFoam())
  const zTexture = Texture.from(drawZ())
  const live: Particle[] = []
  const pool: Sprite[] = []
  let world: TankWorld | null = null

  function emit(kind: Particle['kind'], x: number, y: number, vx: number, vy: number, size: number, life: number) {
    const sprite = pool.pop() ?? new Sprite()
    sprite.texture = kind === 'bubble' ? bubbleTexture : kind === 'foam' ? foamTexture : zTexture
    sprite.rotation = 0
    sprite.anchor.set(0.5)
    sprite.visible = true
    view.addChild(sprite)
    live.push({ sprite, kind, x, y, vx, vy, age: 0, life, size, phase: Math.random() * 6 })
  }

  return {
    view,
    resize(next) {
      world = next
    },
    splash(x, size) {
      const s = world?.scale ?? 1
      emit('foam', x, 2 * s, 0, 0, size * 5, 0.9)
      const count = Math.round(14 + size / (2 * s))
      for (let i = 0; i < count; i++) {
        const angle = randomBetween(-1.2, 1.2) + Math.PI / 2
        const speed = randomBetween(60, 200) * s
        emit('bubble', x + randomBetween(-size, size) * 0.5, randomBetween(2, 10) * s, Math.cos(angle) * speed, Math.sin(angle) * speed, randomBetween(2, 5.5) * s, randomBetween(1.2, 2.4))
      }
    },
    bubbles(x, y, count, size) {
      const s = world?.scale ?? 1
      for (let i = 0; i < count; i++) {
        emit('bubble', x + randomBetween(-size, size) * 0.4, y + randomBetween(-size, size) * 0.3, randomBetween(-20, 20) * s, randomBetween(-10, 30) * s, randomBetween(1.5, 4) * s, randomBetween(0.8, 1.6))
      }
    },
    snore(x, y) {
      const s = world?.scale ?? 1
      emit('z', x, y, randomBetween(-4, 4) * s, -14 * s, randomBetween(14, 18) * s, 2.6)
    },
    update(dt) {
      const s = world?.scale ?? 1
      for (let i = live.length - 1; i >= 0; i--) {
        const p = live[i]
        p.age += dt
        const t = p.age / p.life
        if (t >= 1 || (p.kind === 'bubble' && p.y < -p.size)) {
          p.sprite.visible = false
          view.removeChild(p.sprite)
          pool.push(p.sprite)
          live.splice(i, 1)
          continue
        }
        if (p.kind === 'z') {
          // Drifts up, sways, grows a little, fades in and out.
          p.x += p.vx * dt
          p.y += p.vy * dt
          p.sprite.position.set(p.x + Math.sin(p.age * 2.2 + p.phase) * 4 * s, p.y)
          p.sprite.scale.set((p.size * (0.7 + t * 0.6)) / 32)
          p.sprite.rotation = Math.sin(p.age * 1.7 + p.phase) * 0.25
          p.sprite.alpha = Math.min(1, t * 6) * (1 - t) * 0.95
          continue
        }
        if (p.kind === 'foam') {
          p.sprite.position.set(p.x, p.y)
          p.sprite.scale.set((p.size * (0.6 + t * 0.8)) / 32, (p.size * (0.25 + t * 0.35)) / 32)
          p.sprite.alpha = 0.8 * (1 - t) ** 1.5
          continue
        }
        // Bubbles: shot out by the splash, slowed by the water, then float up with a wobble.
        const drag = Math.exp(-dt * 3.5)
        p.vx *= drag
        p.vy = p.vy * drag - 160 * s * dt
        p.x += p.vx * dt
        p.y += p.vy * dt
        p.sprite.position.set(p.x + Math.sin(p.age * 9 + p.phase) * 1.5 * s, p.y)
        p.sprite.scale.set((p.size * 2) / 32)
        p.sprite.alpha = Math.min(1, (1 - t) * 3) * 0.9
      }
    },
  }
}

function drawBubble() {
  const { canvas, ctx } = makeCanvas(32)
  ctx.beginPath()
  ctx.arc(16, 16, 14, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.12)'
  ctx.fill()
  ctx.lineWidth = 2
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)'
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(11, 11, 3.5, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)'
  ctx.fill()
  return canvas
}

function drawZ() {
  const { canvas, ctx } = makeCanvas(32)
  ctx.font = 'bold 26px system-ui, -apple-system, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineWidth = 4
  ctx.strokeStyle = 'rgba(6, 36, 61, 0.55)'
  ctx.strokeText('z', 16, 15)
  ctx.fillStyle = '#ffffff'
  ctx.fillText('z', 16, 15)
  return canvas
}

function drawFoam() {
  const { canvas, ctx } = makeCanvas(64)
  const glow = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
  glow.addColorStop(0, 'rgba(255, 255, 255, 1)')
  glow.addColorStop(0.5, 'rgba(230, 250, 255, 0.6)')
  glow.addColorStop(1, 'rgba(230, 250, 255, 0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, 64, 64)
  return canvas
}
