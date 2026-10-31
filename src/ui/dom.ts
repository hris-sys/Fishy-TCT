type Child = Node | string | null | undefined | false
type Props = Record<string, unknown>

/**
 * Creates an element. Props starting with "on" become event listeners, `class` sets the class
 * name, known element properties are set directly and anything else becomes an attribute.
 */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue
    if (key === 'class') el.className = String(value)
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value as EventListener)
    else if (key in el) (el as unknown as Record<string, unknown>)[key] = value
    else el.setAttribute(key, value === true ? '' : String(value))
  }
  for (const child of children) if (child !== null && child !== undefined && child !== false) el.append(child)
  return el
}

/** Inline SVG icons, stroked in the current text colour. */
const ICONS = {
  camera:
    '<path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.6l1.4-2h5l1.4 2h1.6A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z"/><circle cx="12" cy="12.5" r="3.5"/>',
  image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="m4 17 5-5 4 4 2.5-2.5L20 18"/>',
  back: '<path d="M14.5 5 7.5 12l7 7"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  menu: '<circle cx="5.5" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="18.5" cy="12" r="1.3" fill="currentColor"/>',
  share: '<path d="M12 15V3.5M8 7.5l4-4 4 4"/><path d="M7 10.5H5.5v10h13v-10H17"/>',
  download: '<path d="M12 3.5V15M8 11l4 4 4-4"/><path d="M5 19.5h14"/>',
  phone: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
  chat: '<path d="M4.5 5.5h15a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5H10l-4.5 3.5V17.5h-1A1.5 1.5 0 0 1 3 16V7a1.5 1.5 0 0 1 1.5-1.5Z"/>',
  send: '<path d="M4 12 20 4l-4 16-4.5-6.5z"/><path d="m11.5 13.5 4-5"/>',
  down: '<path d="m6 9.5 6 6 6-6"/>',
  speaker: '<path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
  muted: '<path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z"/><path d="m16 9.5 5 5M21 9.5l-5 5"/>',
  fish: '<path d="M3 12c3-4.5 7.5-6 11-4.5 2 .9 3.5 2.6 4.5 4.5-1 1.9-2.5 3.6-4.5 4.5C10.5 18 6 16.5 3 12Z"/><path d="m18.5 12 2.5-3v6Z"/><circle cx="14" cy="11" r="1" fill="currentColor"/>',
} as const

export function icon(name: keyof typeof ICONS) {
  const span = h('span', { class: 'icon', 'aria-hidden': 'true' })
  span.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`
  return span
}

/** Short random id. Works without HTTPS, unlike crypto.randomUUID (e.g. a phone on the local network). */
export function randomId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
