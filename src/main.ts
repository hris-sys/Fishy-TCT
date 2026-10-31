import './style.css'
import { species } from './species'
import { createTank } from './tank'
import { showStats } from './ui/stats'

const host = document.getElementById('tank')!
const params = new URLSearchParams(location.search)
const fishCount = Number(params.get('fish') ?? 15)

try {
  const debug = params.has('debug')
  const tank = await createTank(host, {
    species,
    fishCount: Number.isFinite(fishCount) ? fishCount : 15,
    devtools: debug,
  })
  if (debug) {
    showStats(tank)
    const { showDebugPanel } = await import('./ui/debug-panel')
    showDebugPanel(tank, species)
  }
} catch (error) {
  console.error(error)
  host.innerHTML = '<p class="tank-error">This browser can’t show the tank. Try updating it, or open the link in Safari or Chrome.</p>'
}
