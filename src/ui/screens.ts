import { h } from './dom'

/** A panel over the (empty) tank, for everything that happens before you're in. */
function gate(...content: (HTMLElement | null)[]) {
  const root = h('div', { class: 'sheet gate', role: 'dialog', 'aria-modal': 'true' }, h('div', { class: 'gate-card' }, ...content))
  document.body.append(root)
  return root
}

export function showLoading(text: string) {
  return gate(h('p', { class: 'loading' }, text))
}

export function showMessage(title: string, body: string, action?: { label: string; run(): void }, detail?: string) {
  return gate(
    h('h1', {}, title),
    h('p', {}, body),
    action ? h('button', { type: 'button', class: 'button primary', onclick: action.run }, action.label) : null,
    detail ? h('p', { class: 'detail' }, detail) : null,
  )
}

/** The invite page: the tank's name, your name, and a join button. */
export function showJoin(tankName: string, onJoin: (name: string) => Promise<void>, describe: (error: unknown) => string) {
  const error = h('p', { class: 'form-error', role: 'alert', hidden: true })
  const join = h('button', { type: 'submit', class: 'button primary', disabled: true }, 'Join the tank')
  const input = h('input', {
    class: 'text-input',
    type: 'text',
    maxLength: 24,
    placeholder: 'Your name',
    autocomplete: 'given-name',
    enterKeyHint: 'go',
    'aria-label': 'Your name',
    oninput: () => {
      join.disabled = input.value.trim().length === 0
    },
  })
  const form = h(
    'form',
    {
      class: 'join-form',
      onsubmit: async (event: Event) => {
        event.preventDefault()
        const name = input.value.trim()
        if (!name) return
        join.disabled = true
        join.textContent = 'Joining…'
        error.hidden = true
        try {
          await onJoin(name)
          root.remove()
        } catch (failure) {
          error.textContent = describe(failure)
          error.hidden = false
          join.disabled = false
          join.textContent = 'Join the tank'
        }
      },
    },
    input,
    error,
    join,
  )
  const strong = h('strong', {}, tankName)
  const root = gate(
    h('h1', {}, 'You’re invited'),
    h('p', {}, 'Join ', strong, ': a private tank where everyone is a fish wearing their own face.'),
    form,
    h('p', { class: 'note' }, 'No sign-up. This phone remembers you; clearing your browser data means joining again.'),
  )
}
