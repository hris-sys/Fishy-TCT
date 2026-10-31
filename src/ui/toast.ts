import { h } from './dom'

const SHOW_MS = 2600
const MAX_TOASTS = 3

let host: HTMLElement | null = null

/** A short message at the top of the screen, e.g. "Ana poked Mira". */
export function toast(text: string, ms = SHOW_MS) {
  if (!host) {
    host = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' })
    document.body.append(host)
  }
  const item = h('div', { class: 'toast' }, text)
  host.append(item)
  while (host.children.length > MAX_TOASTS) host.firstElementChild?.remove()
  window.setTimeout(() => item.classList.add('leaving'), ms)
  window.setTimeout(() => item.remove(), ms + 400)
}
