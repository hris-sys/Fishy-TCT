import './style.css'
import { createTank } from './tank'
import { showStats } from './ui/stats'

const host = document.getElementById('tank')!

try {
  const tank = await createTank(host)
  if (new URLSearchParams(location.search).has('debug')) showStats(tank)
} catch (error) {
  console.error(error)
  host.innerHTML = '<p class="tank-error">This browser can’t show the tank. Try updating it, or open the link in Safari or Chrome.</p>'
}
