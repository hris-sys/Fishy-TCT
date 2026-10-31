import { createDeviceCode, formatDeviceCode } from '../data/devices'
import { describeError } from '../data/fish'
import type { MyTank } from '../data/tanks'
import { h, icon } from './dom'
import { canPromptInstall, isIOS, isStandalone, promptInstall } from './install'
import { toast } from './toast'

/**
 * The menu button (top right) and its sheet: invite a friend, add the app to the home screen,
 * or move to another device. `onOpenChange` pauses the tank while the sheet is up.
 */
export function createMenu(info: MyTank, onOpenChange: (open: boolean) => void) {
  const button = h('button', { type: 'button', class: 'menu-button', 'aria-label': 'Menu' }, icon('menu'))
  button.addEventListener('click', () => open())

  function sheet(title: string, ...content: (HTMLElement | null)[]) {
    const root = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title })
    const close = () => {
      document.removeEventListener('keydown', onKey)
      root.remove()
      onOpenChange(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKey)
    root.append(
      h(
        'div',
        { class: 'step' },
        h(
          'header',
          { class: 'step-header' },
          h('span'),
          h('h2', {}, title),
          h('button', { type: 'button', class: 'icon-button', 'aria-label': 'Close', onclick: close }, icon('close')),
        ),
        h('div', { class: 'menu-body' }, ...content),
      ),
    )
    document.body.append(root)
    onOpenChange(true)
    return { root, close }
  }

  function open() {
    const { close } = sheet(
      info.name,
      h('button', { type: 'button', class: 'button big', onclick: () => void invite() }, icon('share'), 'Invite a friend'),
      isStandalone() ? null : h('button', { type: 'button', class: 'button big', onclick: () => { close(); installGuide() } }, icon('download'), 'Add to Home Screen'),
      h('button', { type: 'button', class: 'button big', onclick: () => { close(); moveGuide() } }, icon('phone'), 'Use on another device'),
      h('p', { class: 'note' }, 'You’re in this tank as “', info.displayName, '”.'),
    )
  }

  /** Shares the invite link (the phone's share sheet), or copies it. */
  async function invite() {
    const url = `${location.origin}/join/${info.inviteCode}`
    const text = `Come be a fish in our tank, “${info.name}”!`
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Tankmates', text, url })
        return
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError') return
    }
    try {
      await navigator.clipboard.writeText(url)
      toast('Invite link copied')
    } catch {
      toast(url, 8000)
    }
  }

  /** A code for the other device, made on the spot. */
  function codeBlock() {
    const code = h('p', { class: 'device-code', 'aria-live': 'polite' }, '…')
    createDeviceCode()
      .then((value) => {
        code.textContent = formatDeviceCode(value)
      })
      .catch((error) => {
        code.textContent = '—'
        toast(describeError(error))
      })
    return h('div', { class: 'code-box' }, code, h('p', { class: 'note' }, 'Works once, for 30 minutes.'))
  }

  function installGuide() {
    if (isIOS()) {
      // The Home Screen app on iPhone has its own storage: the code carries you over to it.
      sheet(
        'Add to Home Screen',
        h(
          'ol',
          { class: 'steps' },
          h('li', {}, 'Tap ', h('strong', {}, 'Share'), ' ', icon('share'), ' in Safari’s toolbar.'),
          h('li', {}, 'Choose ', h('strong', {}, 'Add to Home Screen'), ', then ', h('strong', {}, 'Add'), '.'),
          h('li', {}, 'Open Tankmates from your Home Screen and enter this code:'),
        ),
        codeBlock(),
        h('p', { class: 'note' }, 'The Home Screen app keeps its own sign-in, separate from Safari. The code moves you and your fish across.'),
      )
      return
    }
    if (canPromptInstall()) {
      const { close } = sheet(
        'Add to Home Screen',
        h('p', { class: 'menu-text' }, 'Install Tankmates for a full-screen tank that opens from your home screen.'),
        h(
          'button',
          {
            type: 'button',
            class: 'button primary big',
            onclick: async () => {
              await promptInstall()
              close()
            },
          },
          icon('download'),
          'Install',
        ),
      )
      return
    }
    sheet(
      'Add to Home Screen',
      h(
        'ol',
        { class: 'steps' },
        h('li', {}, 'Open your browser’s menu (', h('strong', {}, '⋮'), ' or ', h('strong', {}, '⋯'), ').'),
        h('li', {}, 'Choose ', h('strong', {}, 'Install app'), ' or ', h('strong', {}, 'Add to Home screen'), '.'),
      ),
      h('p', { class: 'note' }, 'You stay signed in: the installed app shares this browser’s sign-in.'),
    )
  }

  function moveGuide() {
    sheet(
      'Use on another device',
      h(
        'ol',
        { class: 'steps' },
        h('li', {}, 'On the other device, open ', h('strong', {}, location.host), '.'),
        h('li', {}, 'Choose ', h('strong', {}, 'I have a code'), ' and enter:'),
      ),
      codeBlock(),
      h('p', { class: 'note' }, 'Your fish and your place in the tank move to the other device. This one stops being signed in to the tank.'),
    )
  }

  return { button, open }
}
