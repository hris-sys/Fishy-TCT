/** What the browser offers for installing the app to the home screen. */

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferredPrompt: InstallPromptEvent | null = null

/** Chrome on Android (and desktop) offers an install prompt; it arrives early, so catch it at startup. */
export function listenForInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    deferredPrompt = event as InstallPromptEvent
  })
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
  })
}

/** Shows the browser's own install dialog, if it offered one. Returns false if there isn't one. */
export async function promptInstall(): Promise<boolean> {
  if (!deferredPrompt) return false
  const event = deferredPrompt
  deferredPrompt = null
  await event.prompt()
  return (await event.userChoice).outcome === 'accepted'
}

export const canPromptInstall = () => deferredPrompt !== null

/** Running as an installed app, from the home screen. */
export function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
}

/** iPhone or iPad (iPads report themselves as Macs with touch). */
export function isIOS() {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1)
}
