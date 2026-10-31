import type { TankSound } from '../tank'
import { h, icon } from './dom'

const MUTED_KEY = 'tankmates-muted'

export interface Sound {
  play(name: TankSound, detail?: string): void
  isMuted(): boolean
  setMuted(muted: boolean): void
}

function readMuted() {
  try {
    return localStorage.getItem(MUTED_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * Little synthesized sounds: bubbles, splashes, chomps. No audio files. Phones only allow sound
 * after the first tap, so the audio starts on the first touch; until then everything stays quiet.
 */
export function createSound(): Sound {
  let ctx: AudioContext | null = null
  let master: GainNode | null = null
  let muted = readMuted()
  const lastPlayed = new Map<string, number>()

  const unlock = () => {
    if (!ctx) {
      const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Context) return
      ctx = new Context()
      master = ctx.createGain()
      master.gain.value = 0.6
      master.connect(ctx.destination)
    }
    // iOS suspends audio in the background; any touch wakes it again.
    if (ctx.state !== 'running') void ctx.resume()
  }
  document.addEventListener('pointerdown', unlock, { capture: true })

  function tone(type: OscillatorType, from: number, to: number, duration: number, volume: number, delay = 0) {
    if (!ctx || !master) return
    const at = ctx.currentTime + delay
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(from, at)
    osc.frequency.exponentialRampToValueAtTime(to, at + duration)
    gain.gain.setValueAtTime(0.0001, at)
    gain.gain.exponentialRampToValueAtTime(volume, at + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration)
    osc.connect(gain).connect(master)
    osc.start(at)
    osc.stop(at + duration + 0.02)
  }

  function noise(filter: BiquadFilterType, from: number, to: number, duration: number, volume: number) {
    if (!ctx || !master) return
    const at = ctx.currentTime
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
    const source = ctx.createBufferSource()
    source.buffer = buffer
    const shape = ctx.createBiquadFilter()
    shape.type = filter
    shape.frequency.setValueAtTime(from, at)
    shape.frequency.exponentialRampToValueAtTime(to, at + duration)
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(volume, at)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration)
    source.connect(shape).connect(gain).connect(master)
    source.start(at)
  }

  const bubble = (delay = 0, pitch = 1) => {
    tone('sine', 380 * pitch, 900 * pitch, 0.09, 0.16, delay)
    tone('sine', 600 * pitch, 1300 * pitch, 0.07, 0.1, delay + 0.05)
  }

  return {
    play(name, detail) {
      if (muted || !ctx || ctx.state !== 'running') return
      // A school splashing in at once shouldn't turn into a roar.
      const key = `${name}:${detail ?? ''}`
      const now = ctx.currentTime
      if (now - (lastPlayed.get(key) ?? -1) < 0.08) return
      lastPlayed.set(key, now)
      switch (name) {
        case 'splash':
          noise('lowpass', 2600, 300, 0.45, 0.32)
          tone('sine', 190, 80, 0.2, 0.14)
          break
        case 'feed':
          for (let i = 0; i < 3; i++) tone('triangle', 1250 - i * 120, 900 - i * 80, 0.04, 0.07, i * 0.06)
          break
        case 'eat':
          tone('square', 320, 180, 0.05, 0.05)
          tone('square', 360, 200, 0.05, 0.05, 0.06)
          break
        case 'react':
          if (detail === 'puff') {
            noise('bandpass', 400, 2200, 0.35, 0.22)
            tone('sine', 200, 520, 0.3, 0.1)
          } else if (detail === 'snap') {
            noise('highpass', 3000, 1500, 0.06, 0.3)
            tone('square', 160, 70, 0.09, 0.08)
          } else if (detail === 'lure-flash') {
            tone('sine', 880, 1320, 0.25, 0.1)
            tone('sine', 1320, 1760, 0.3, 0.07, 0.08)
          } else if (detail === 'hide-in-anemone') {
            tone('sine', 720, 300, 0.18, 0.12)
          } else {
            for (let i = 0; i < 4; i++) bubble(i * 0.05 + Math.random() * 0.03, 0.9 + Math.random() * 0.3)
          }
          bubble(0, 1.2)
          break
      }
    },
    isMuted: () => muted,
    setMuted(next) {
      muted = next
      try {
        localStorage.setItem(MUTED_KEY, next ? '1' : '0')
      } catch {
        // Private browsing: the choice just isn't remembered.
      }
    },
  }
}

/** The speaker button in the corner. */
export function createMuteButton(sound: Sound) {
  const button = h('button', { type: 'button', class: 'mute-button' })
  const render = () => {
    const muted = sound.isMuted()
    button.replaceChildren(icon(muted ? 'muted' : 'speaker'))
    button.setAttribute('aria-label', muted ? 'Sound off. Tap to turn it on' : 'Sound on. Tap to mute')
    button.setAttribute('aria-pressed', String(muted))
  }
  button.addEventListener('click', () => {
    sound.setMuted(!sound.isMuted())
    render()
  })
  render()
  return button
}
