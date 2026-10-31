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

/**
 * For anyone who isn't in a tank on this device: explains it's invite-only, and offers the two ways
 * in that don't need an invite link opened on this exact device: a code from your other device (for
 * example Safari, when this is the iPhone Home Screen app), or pasting an invite link.
 */
export function showWelcome(onCode: (code: string) => Promise<void>, describe: (error: unknown) => string) {
  const error = h('p', { class: 'form-error', role: 'alert', hidden: true })
  const codeInput = h('input', {
    class: 'text-input code-input',
    type: 'text',
    maxLength: 9,
    placeholder: 'ABCD-EFGH',
    autocomplete: 'one-time-code',
    autocapitalize: 'characters',
    spellcheck: false,
    enterKeyHint: 'go',
    'aria-label': 'Code from your other device',
  })
  const go = h('button', { type: 'submit', class: 'button primary' }, 'Continue')
  const codeForm = h(
    'form',
    {
      class: 'join-form',
      hidden: true,
      onsubmit: async (event: Event) => {
        event.preventDefault()
        const code = codeInput.value.replace(/[^A-Za-z0-9]/g, '')
        if (code.length !== 8) {
          error.textContent = 'The code has 8 letters and numbers.'
          error.hidden = false
          return
        }
        go.disabled = true
        go.textContent = 'Moving you over…'
        error.hidden = true
        try {
          await onCode(code)
        } catch (failure) {
          error.textContent = describe(failure)
          error.hidden = false
          go.disabled = false
          go.textContent = 'Continue'
        }
      },
    },
    h('p', { class: 'note' }, 'On your other device, open the menu ⋯ in the tank and choose “Use on another device” or “Add to Home Screen” to get a code.'),
    codeInput,
    go,
  )

  const linkInput = h('input', {
    class: 'text-input',
    type: 'url',
    placeholder: 'Paste the invite link',
    autocomplete: 'off',
    enterKeyHint: 'go',
    'aria-label': 'Invite link',
  })
  const linkForm = h(
    'form',
    {
      class: 'join-form',
      hidden: true,
      onsubmit: (event: Event) => {
        event.preventDefault()
        const code = linkInput.value.trim().match(/(?:\/join\/)?([A-Za-z0-9-]{6,64})\/?(?:[?#].*)?$/)?.[1]
        if (!code) {
          error.textContent = 'That doesn’t look like an invite link.'
          error.hidden = false
          return
        }
        location.href = `/join/${code}${location.search}`
      },
    },
    linkInput,
    h('button', { type: 'submit', class: 'button primary' }, 'Open invite'),
  )

  const showForm = (form: HTMLElement, other: HTMLElement, input: HTMLInputElement) => {
    form.hidden = false
    other.hidden = true
    error.hidden = true
    input.focus()
  }
  gate(
    h('h1', {}, 'Tankmates is invite\u2011only'),
    h('p', {}, 'Open the invite link from your group on this device, or:'),
    h(
      'div',
      { class: 'stack' },
      h('button', { type: 'button', class: 'button', onclick: () => showForm(codeForm, linkForm, codeInput) }, 'I have a code'),
      h('button', { type: 'button', class: 'button', onclick: () => showForm(linkForm, codeForm, linkInput) }, 'Paste an invite link'),
    ),
    codeForm,
    linkForm,
    error,
  )
}
