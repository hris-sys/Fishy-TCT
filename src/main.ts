import './style.css'
import './ui/ui.css'
import { species } from './species'
import { type Tank, createTank } from './tank'
import { openFishSheet } from './ui/add-fish'
import { h, icon, randomId } from './ui/dom'
import { showStats } from './ui/stats'

const host = document.getElementById('tank')!
const params = new URLSearchParams(location.search)
const debug = params.has('debug')
/** ?demo: the tank on this phone only, with stand-in fish and nothing saved. */
const demo = params.has('demo')
const placeholderParam = Number(params.get('fish'))
const placeholders = Number.isFinite(placeholderParam) && params.has('fish') ? placeholderParam : demo ? 10 : 0
const invite = location.pathname.match(/^\/join\/([A-Za-z0-9-]{6,64})\/?$/)?.[1] ?? null

let tapHandler: ((id: string) => void) | null = null

try {
  const tank = await createTank(host, { species, placeholders, devtools: debug, onFishTap: (id) => tapHandler?.(id) })
  if (debug) {
    showStats(tank)
    const { showDebugPanel } = await import('./ui/debug-panel')
    showDebugPanel(tank, species)
  }
  if (demo) startDemo(tank)
  else {
    const { startShared } = await import('./ui/shared-tank')
    await startShared(tank, invite, (handler) => {
      tapHandler = handler
    })
  }
} catch (error) {
  console.error(error)
  host.innerHTML = '<p class="tank-error">This browser can’t show the tank. Try updating it, or open the link in Safari or Chrome.</p>'
}

/** Demo mode: add fish locally, as in iteration 2. Nothing is uploaded. */
function startDemo(tank: Tank) {
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
            tank.addResident({ id, name: fish.name, species: fish.species, tint: fish.tint, face: fish.face }, { dropIn: true })
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
