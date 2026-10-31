import './style.css'
import './ui/ui.css'
import { species } from './species'
import { type Tank, createTank } from './tank'
import { openFishSheet } from './ui/add-fish'
import { h, icon, randomId } from './ui/dom'
import { FEED_ZONE, type TankHandlers } from './ui/handlers'
import { createMuteButton, createSound } from './ui/sound'
import { showStats } from './ui/stats'

const host = document.getElementById('tank')!
const params = new URLSearchParams(location.search)
const debug = params.has('debug')
/** ?demo: the tank on this phone only, with stand-in fish and nothing saved. */
const demo = params.has('demo')
const placeholderParam = Number(params.get('fish'))
const placeholders = Number.isFinite(placeholderParam) && params.has('fish') ? placeholderParam : demo ? 10 : 0
const invite = location.pathname.match(/^\/join\/([A-Za-z0-9-]{6,64})\/?$/)?.[1] ?? null

// Taps go to whichever mode is running; it fills these in.
const handlers: TankHandlers = {}
const sound = createSound()

try {
  const tank = await createTank(host, {
    species,
    placeholders,
    devtools: debug,
    onFishTap: (id) => handlers.fishTap?.(id),
    onFishLongPress: (id) => handlers.fishLongPress?.(id),
    onWaterTap: (x, y) => handlers.waterTap?.(x, y),
    onSound: (name, detail) => sound.play(name, detail),
  })
  document.body.append(createMuteButton(sound))
  if (debug) {
    showStats(tank)
    const { showDebugPanel } = await import('./ui/debug-panel')
    showDebugPanel(tank, species)
  }
  if (demo) startDemo(tank)
  else {
    const { startShared } = await import('./ui/shared-tank')
    await startShared(tank, invite, handlers)
  }
} catch (error) {
  console.error(error)
  host.innerHTML = '<p class="tank-error">This browser can’t show the tank. Try updating it, or open the link in Safari or Chrome.</p>'
}

/** Demo mode: add fish, poke and feed, all on this device only. Nothing is uploaded. */
function startDemo(tank: Tank) {
  handlers.fishTap = (id) => tank.react(id)
  handlers.waterTap = (x, y) => {
    if (y <= FEED_ZONE) tank.feed(x, Math.floor(Math.random() * 2 ** 31))
  }
  const button = h(
    'button',
    {
      type: 'button',
      class: 'add-fish',
      onclick: () => {
        button.hidden = true
        tank.setPaused(true)
        openFishSheet({
          species,
          onSave: async (fish) => {
            if (debug) Object.assign(globalThis, { __lastFace: fish })
            const id = randomId()
            tank.addResident({ id, name: fish.name, species: fish.species, tint: fish.tint, face: fish.face, blub: fish.blub }, { dropIn: true })
            setTimeout(() => tank.showTag(id), 1400)
          },
          onClose: () => {
            tank.setPaused(false)
            button.hidden = false
          },
        })
      },
    },
    icon('plus'),
    'Add your fish',
  )
  document.body.append(button)
}
