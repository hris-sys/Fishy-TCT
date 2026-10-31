import type { Tank } from '../tank'

/** Small FPS and resolution readout, shown with ?debug in the URL. */
export function showStats(tank: Tank) {
  const el = document.createElement('div')
  el.className = 'stats'
  document.body.appendChild(el)

  const refresh = () => {
    const s = tank.stats()
    el.textContent = `${Math.round(s.fps)} fps · ${s.width}×${s.height} @${s.resolution}x`
  }
  refresh()
  setInterval(refresh, 500)
}
