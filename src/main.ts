import './style.css'
import './ui/ui.css'
import { species } from './species'
import { createTank } from './tank'
import { openAddFish } from './ui/add-fish'
import { h, icon, randomId } from './ui/dom'
import { showStats } from './ui/stats'

const host = document.getElementById('tank')!
const params = new URLSearchParams(location.search)
const debug = params.has('debug')
const placeholderCount = Number(params.get('fish') ?? 10)

try {
  const tank = await createTank(host, {
    species,
    placeholders: Number.isFinite(placeholderCount) ? placeholderCount : 10,
    devtools: debug,
  })

  const addButton = h(
    'button',
    {
      type: 'button',
      class: 'add-fish',
      onclick: () => {
        addButton.hidden = true
        // The sheet covers the tank and runs its own mini tank, so pause the big one.
        tank.setPaused(true)
        openAddFish({
          species,
          onClose: () => {
            tank.setPaused(false)
            addButton.hidden = false
          },
          onDone: (fish) => {
            if (debug) Object.assign(globalThis, { __lastFace: fish })
            const id = randomId()
            tank.addResident({ id, name: fish.name, species: fish.species, tint: fish.tint, face: fish.face }, { dropIn: true })
            // Say hello once it has landed.
            setTimeout(() => tank.showTag(id), 1400)
          },
        })
      },
    },
    icon('plus'),
    'Add your fish',
  )
  document.body.append(addButton)

  if (debug) {
    showStats(tank)
    const { showDebugPanel } = await import('./ui/debug-panel')
    showDebugPanel(tank, species)
  }
} catch (error) {
  console.error(error)
  host.innerHTML = '<p class="tank-error">This browser can’t show the tank. Try updating it, or open the link in Safari or Chrome.</p>'
}
