import { type ChatMessage, MESSAGE_MAX } from '../data/chat'
import { h, icon } from './dom'

const OPEN_KEY = 'tankmates-chat-open'

export interface Chat {
  /** Adds a message (ignored if it's already there). `fresh` messages count as unread while collapsed. */
  add(message: ChatMessage, fresh: boolean): void
  /** Hides or shows the whole chat, e.g. while a full-screen sheet is open. */
  setHidden(hidden: boolean): void
}

/** A stable, light colour per person, so names are easy to tell apart. */
function colorFor(id: string) {
  let hash = 0
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) | 0
  return `hsl(${Math.abs(hash) % 360} 85% 78%)`
}

function readOpen() {
  try {
    return localStorage.getItem(OPEN_KEY) !== '0'
  } catch {
    return true
  }
}

/**
 * A small see-through chat window in the bottom-left corner. It collapses to a round button with
 * an unread count, and remembers which way you left it.
 */
export function createChat(send: (body: string) => Promise<void>): Chat {
  const seen = new Set<string>()
  let unread = 0
  let open = readOpen()

  const log = h('ol', { class: 'chat-log', 'aria-live': 'polite', 'aria-label': 'Messages' })
  const empty = h('li', { class: 'chat-empty' }, 'No messages yet. Say hi!')
  log.append(empty)
  const input = h('input', {
    class: 'chat-input',
    type: 'text',
    maxLength: MESSAGE_MAX,
    placeholder: 'Say something…',
    autocomplete: 'off',
    enterKeyHint: 'send',
    'aria-label': 'Message',
  })
  const sendButton = h('button', { type: 'submit', class: 'chat-send', 'aria-label': 'Send' }, icon('send'))
  const form = h('form', { class: 'chat-form' }, input, sendButton)
  const hide = h('button', { type: 'button', class: 'chat-hide', 'aria-label': 'Hide chat' }, icon('down'))
  const panel = h('section', { class: 'chat', 'aria-label': 'Chat' }, h('header', { class: 'chat-head' }, h('span', {}, 'Chat'), hide), log, form)
  const badge = h('span', { class: 'chat-badge', hidden: true })
  const toggle = h('button', { type: 'button', class: 'chat-toggle', 'aria-label': 'Open chat' }, icon('chat'), badge)
  document.body.append(panel, toggle)

  function render() {
    panel.hidden = !open
    toggle.hidden = open
    badge.hidden = unread === 0
    badge.textContent = unread > 9 ? '9+' : String(unread)
    toggle.setAttribute('aria-label', unread ? `Open chat, ${unread} new` : 'Open chat')
  }

  function setOpen(next: boolean) {
    open = next
    if (open) {
      unread = 0
      log.scrollTop = log.scrollHeight
    }
    try {
      localStorage.setItem(OPEN_KEY, open ? '1' : '0')
    } catch {
      // Not remembered.
    }
    render()
  }

  hide.addEventListener('click', () => setOpen(false))
  toggle.addEventListener('click', () => {
    setOpen(true)
    input.focus()
  })

  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    const body = input.value.trim()
    if (!body) return
    sendButton.disabled = true
    try {
      await send(body)
      input.value = ''
    } catch {
      // The sender already said why; the text stays in the box to try again.
    } finally {
      sendButton.disabled = false
      input.focus()
    }
  })

  // Phones: keep the chat above the on-screen keyboard.
  const viewport = window.visualViewport
  const lift = () => {
    if (!viewport) return
    const keyboard = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
    panel.style.setProperty('--keyboard', `${keyboard}px`)
  }
  viewport?.addEventListener('resize', lift)
  viewport?.addEventListener('scroll', lift)

  render()

  return {
    add(message, fresh) {
      if (seen.has(message.id)) return
      seen.add(message.id)
      empty.remove()
      // Stay pinned to the newest message, unless someone has scrolled up to read.
      const pinned = log.scrollHeight - log.scrollTop - log.clientHeight < 24
      const time = new Date(message.createdAt)
      log.append(
        h(
          'li',
          { class: 'chat-line', title: Number.isNaN(time.getTime()) ? '' : time.toLocaleString() },
          h('strong', { style: `color:${colorFor(message.authorId)}` }, message.authorName),
          ' ',
          message.body,
        ),
      )
      while (log.children.length > 100) log.firstElementChild?.remove()
      if (pinned || !fresh) log.scrollTop = log.scrollHeight
      if (fresh && !open) {
        unread++
        render()
      }
    },
    setHidden(hidden) {
      panel.classList.toggle('away', hidden)
      toggle.classList.toggle('away', hidden)
    },
  }
}
