import type { SpeciesConfig } from '../tank'
import { type Cropper, createCropper } from './cropper'
import { h, icon } from './dom'
import { exportFace, loadPhoto } from './photo'
import { type PickerInitial, type PickerValue, createSpeciesPicker } from './species-picker'

export interface NewFish {
  name: string
  species: string
  tint: number | null
  /** The 256 px face square, exactly as stored. */
  face: CanvasImageSource
  /** The newly encoded face file, or null when the face didn't change. */
  blob: Blob | null
  /** The blub ("O" mouth) face to show, if any. */
  blub: CanvasImageSource | null
  /** A newly encoded blub file; null when it was removed; undefined when it didn't change. */
  blubBlob?: Blob | null
}

interface FishSheetOptions {
  species: SpeciesConfig[]
  /** Editing an existing fish: opens on the species step with its current face. */
  existing?: { name: string; species: string; tint: number | null; face: CanvasImageSource; blub: CanvasImageSource | null }
  /** Name to suggest for a new fish. */
  suggestedName?: string
  /** Saves the fish. If it throws, the sheet stays open and shows `describeError`'s message. */
  onSave(fish: NewFish): Promise<void>
  /** Offered when editing. */
  onRemove?(): Promise<void>
  onClose(): void
  describeError?(error: unknown): string
}

/**
 * The fish sheet: pick a photo, line up the face, then species, name and colour. When editing,
 * it opens straight on species/name/colour, with a way to take a new photo or remove the fish.
 */
export function openFishSheet(options: FishSheetOptions) {
  const editing = Boolean(options.existing)
  const describe = options.describeError ?? (() => 'Something went wrong. Please try again.')
  const root = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': editing ? 'Your fish' : 'Add your fish' })
  document.body.append(root)

  let leaveStep: (() => void) | null = null
  let cropper: { photo: HTMLCanvasElement; cropper: Cropper; kind: 'face' | 'blub' } | null = null
  /** The face being used: the existing one, or a newly cropped one (with its file). */
  let face: { canvas: CanvasImageSource; blob: Blob | null } | null = options.existing ? { canvas: options.existing.face, blob: null } : null
  let blub: { canvas: CanvasImageSource; blob: Blob | null } | null = options.existing?.blub ? { canvas: options.existing.blub, blob: null } : null
  let blubChanged = false
  /** Which photo the photo and crop steps are taking. */
  type PhotoKind = 'face' | 'blub'
  // Choices survive going back to change the photo.
  let choices: PickerInitial = options.existing
    ? { name: options.existing.name, species: options.existing.species, tint: options.existing.tint }
    : { name: options.suggestedName ?? '' }

  function show(content: HTMLElement, onLeave?: () => void) {
    leaveStep?.()
    leaveStep = onLeave ?? null
    root.replaceChildren(content)
    root.scrollTop = 0
  }

  function close() {
    leaveStep?.()
    cropper?.cropper.destroy()
    document.removeEventListener('keydown', onKey)
    root.remove()
    options.onClose()
  }

  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') close()
  }
  document.addEventListener('keydown', onKey)

  const header = (title: string, back?: () => void) =>
    h(
      'header',
      { class: 'step-header' },
      back ? h('button', { type: 'button', class: 'icon-button', 'aria-label': 'Back', onclick: back }, icon('back')) : h('span'),
      h('h2', {}, title),
      h('button', { type: 'button', class: 'icon-button', 'aria-label': 'Close', onclick: close }, icon('close')),
    )

  /** A button that opens the photo library, or the phone's own camera app with capture="user". */
  const pick = (label: string, iconName: 'camera' | 'image', selfie: boolean, kind: PhotoKind, primary = selfie) => {
    const input = h('input', {
      type: 'file',
      accept: 'image/*',
      capture: selfie ? 'user' : undefined,
      class: 'visually-hidden',
      onchange: () => {
        const file = input.files?.[0]
        input.value = ''
        if (file) choose(file, kind)
      },
    })
    return h('label', { class: primary ? 'button primary big' : 'button big' }, input, icon(iconName), label)
  }

  // Step 1: a selfie or a photo from the library. Where the browser allows it (HTTPS), the selfie
  // uses the live camera with a countdown; otherwise the phone's camera app.
  function photoStep(error?: string, kind: PhotoKind = 'face') {
    const selfie = canUseCamera()
      ? h('button', { type: 'button', class: 'button primary big', onclick: () => cameraStep(kind) }, icon('camera'), 'Take a selfie')
      : pick('Take a selfie', 'camera', true, kind)
    const back = face ? () => speciesStep() : undefined
    const blubbing = kind === 'blub'
    show(
      h(
        'div',
        { class: 'step' },
        header('', back),
        h(
          'div',
          { class: 'intro' },
          h('h1', {}, blubbing ? 'Blub face' : editing ? 'New photo' : 'Add your fish'),
          h(
            'p',
            {},
            blubbing
              ? 'Make an “O” with your mouth, like a fish going blub. Your fish shows it while eating or when someone pokes it.'
              : 'Your face goes on a fish. Use a clear photo, looking straight at the camera.',
          ),
          error ? h('p', { class: 'error', role: 'alert' }, error) : null,
          h('div', { class: 'stack' }, selfie, pick('Choose a photo', 'image', false, kind)),
          h('p', { class: 'note' }, 'Only a small square around your face is kept. The original photo never leaves your phone.'),
        ),
      ),
    )
  }

  async function choose(file: File, kind: PhotoKind) {
    show(h('div', { class: 'step' }, header('Line up your face', () => photoStep(undefined, kind)), h('p', { class: 'loading' }, 'Opening photo…')))
    try {
      const photo = await loadPhoto(file)
      cropper?.cropper.destroy()
      cropper = { photo, cropper: createCropper(photo), kind }
      cropStep(kind)
    } catch {
      photoStep('That photo could not be opened. Try a JPEG or PNG, or take a selfie.', kind)
    }
  }

  // Step 1b: the live camera, mirrored like a mirror, with the oval guide and a 3-2-1 countdown.
  function cameraStep(kind: PhotoKind) {
    const video = h('video', { class: 'camera-video', autoplay: true, playsInline: true, muted: true })
    const count = h('div', { class: 'countdown', hidden: true, 'aria-live': 'assertive' })
    const flash = h('div', { class: 'camera-flash' })
    const guide = document.createElement('div')
    guide.className = 'camera-guide'
    guide.innerHTML =
      '<svg viewBox="0 0 100 100" preserveAspectRatio="none"><path fill="rgba(2,16,30,0.45)" fill-rule="evenodd" d="M0 0H100V100H0Z M14 50a36 45 0 1 0 72 0a36 45 0 1 0 -72 0Z"/><ellipse cx="50" cy="50" rx="36" ry="45" fill="none" stroke="white" stroke-width="0.8" vector-effect="non-scaling-stroke"/></svg>'
    const stage = h('div', { class: 'camera-stage' }, video, guide, count, flash)
    const message = h('p', { class: 'form-error', role: 'alert', hidden: true })
    const shoot = h('button', { type: 'button', class: 'button primary', disabled: true }, icon('camera'), 'Take photo')
    let stream: MediaStream | null = null
    let left = false
    const stop = () => {
      left = true
      stream?.getTracks().forEach((track) => track.stop())
      stream = null
    }

    show(
      h(
        'div',
        { class: 'step' },
        header(kind === 'blub' ? 'Blub face' : 'Take a selfie', () => photoStep(undefined, kind)),
        stage,
        h(
          'div',
          { class: 'step-footer' },
          h('p', { class: 'hint' }, kind === 'blub' ? 'Make an “O” with your mouth and fit your face in the oval.' : 'Fit your face in the oval and look at the camera.'),
          message,
          shoot,
          pick('Choose a photo instead', 'image', false, kind),
        ),
      ),
      stop,
    )

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 1280 } }, audio: false })
      .then(async (media) => {
        if (left) return media.getTracks().forEach((track) => track.stop())
        stream = media
        video.srcObject = media
        await video.play()
        shoot.disabled = false
      })
      .catch((error) => {
        message.textContent = cameraError(error)
        message.hidden = false
        shoot.hidden = true
        stage.classList.add('off')
      })

    shoot.addEventListener('click', async () => {
      shoot.disabled = true
      for (const n of [3, 2, 1]) {
        count.textContent = String(n)
        count.hidden = false
        count.classList.remove('tick')
        void count.offsetWidth
        count.classList.add('tick')
        await new Promise((resolve) => setTimeout(resolve, 800))
        if (left) return
      }
      count.hidden = true
      flash.classList.add('on')
      const photo = captureSquare(video)
      stop()
      cropper?.cropper.destroy()
      cropper = { photo, cropper: createCropper(photo), kind }
      cropStep(kind)
    })
  }

  // Step 2: line up the face in the oval.
  function cropStep(kind: PhotoKind = 'face') {
    if (!cropper) return photoStep(undefined, kind)
    const { photo, cropper: crop } = cropper
    const use = h(
      'button',
      {
        type: 'button',
        class: 'button primary',
        onclick: async () => {
          use.disabled = true
          try {
            const cropped = await exportFace(photo, crop.crop())
            if (kind === 'blub') {
              blub = { canvas: cropped.canvas, blob: cropped.blob }
              blubChanged = true
            } else {
              face = { canvas: cropped.canvas, blob: cropped.blob }
            }
            speciesStep()
          } catch {
            use.disabled = false
            photoStep('Something went wrong saving that photo. Please try again.', kind)
          }
        },
      },
      'Use this photo',
    )
    show(
      h(
        'div',
        { class: 'step fill' },
        header(kind === 'blub' ? 'Line up your blub face' : 'Line up your face', () => photoStep(undefined, kind)),
        crop.element,
        h('div', { class: 'step-footer' }, h('p', { class: 'hint' }, 'Drag to move, pinch to zoom. Fit your face inside the oval.'), use),
      ),
    )
  }

  // Step 3: species, name and colour, with the face on every fish in a mini tank.
  function speciesStep() {
    if (!face) return photoStep()
    const current = face
    const message = h('p', { class: 'form-error', role: 'alert', hidden: true })
    const saveLabel = editing ? 'Save changes' : 'Drop it in'
    const save = h('button', { type: 'button', class: 'button primary', disabled: !choices.name, onclick: () => void submit() }, saveLabel)

    const fail = (error: unknown) => {
      message.textContent = describe(error)
      message.hidden = false
    }

    async function submit() {
      const chosen: PickerValue = picker.value()
      if (!chosen.name) return
      save.disabled = true
      save.textContent = 'Saving…'
      message.hidden = true
      try {
        await options.onSave({
          ...chosen,
          face: current.canvas,
          blob: current.blob,
          blub: blub?.canvas ?? null,
          blubBlob: blubChanged ? (blub?.blob ?? null) : undefined,
        })
        close()
      } catch (error) {
        fail(error)
        save.disabled = false
        save.textContent = saveLabel
      }
    }

    const picker = createSpeciesPicker(
      current.canvas,
      options.species,
      (value) => {
        choices = value
        save.disabled = value.name.length === 0
      },
      choices,
      blub?.canvas ?? null,
    )

    // Optional blub face: a small preview, with buttons to add, change or remove it.
    const blubRow = h('div', { class: 'blub-row' })
    if (blub) {
      const thumb = h('canvas', { class: 'blub-thumb', width: 88, height: 88, 'aria-label': 'Your blub face' })
      thumb.getContext('2d')!.drawImage(blub.canvas, 0, 0, 88, 88)
      blubRow.append(
        thumb,
        h('button', { type: 'button', class: 'button small', onclick: () => photoStep(undefined, 'blub') }, 'Change'),
        h('button', {
          type: 'button',
          class: 'button small',
          onclick: () => {
            blub = null
            blubChanged = true
            speciesStep()
          },
        }, 'Remove'),
      )
    } else {
      blubRow.append(h('button', { type: 'button', class: 'button small', onclick: () => photoStep(undefined, 'blub') }, 'Add a blub face'))
    }
    const blubField = h('div', { class: 'field' }, 'Blub face (optional): an “O” mouth for eating and pokes', blubRow)

    // Removing takes two taps, so it can't happen by accident.
    let armed = false
    const remove = options.onRemove
      ? h(
          'button',
          {
            type: 'button',
            class: 'button danger',
            onclick: async () => {
              if (!armed) {
                armed = true
                remove!.textContent = 'Tap again to remove your fish'
                return
              }
              remove!.disabled = true
              remove!.textContent = 'Removing…'
              try {
                await options.onRemove!()
                close()
              } catch (error) {
                fail(error)
                armed = false
                remove!.disabled = false
                remove!.textContent = 'Remove my fish'
              }
            },
          },
          'Remove my fish',
        )
      : null

    const newPhoto = editing ? h('button', { type: 'button', class: 'button', onclick: () => photoStep() }, icon('camera'), 'New photo') : null
    const back = editing ? undefined : () => cropStep(cropper?.kind)
    show(
      h(
        'div',
        { class: 'step' },
        header(editing ? 'Your fish' : 'Pick your fish', back),
        picker.element,
        blubField,
        h('div', { class: 'step-footer' }, message, newPhoto, save, remove),
      ),
      () => picker.destroy(),
    )
    void picker.start()
  }

  if (face) speciesStep()
  else photoStep()
}

const canUseCamera = () => window.isSecureContext && Boolean(navigator.mediaDevices?.getUserMedia)

/** The square the camera stage shows (the middle of the video), mirrored as it was on screen. */
function captureSquare(video: HTMLVideoElement): HTMLCanvasElement {
  const width = video.videoWidth
  const height = video.videoHeight
  const side = Math.min(width, height)
  const size = Math.min(side, 2048)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.translate(size, 0)
  ctx.scale(-1, 1)
  ctx.drawImage(video, (width - side) / 2, (height - side) / 2, side, side, 0, 0, size, size)
  return canvas
}

function cameraError(error: unknown) {
  const name = (error as Error | null)?.name
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Camera access is blocked. Allow the camera for this site in your browser’s settings, or choose a photo instead.'
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No front camera was found. You can choose a photo instead.'
  if (name === 'NotReadableError') return 'The camera is busy in another app. Close it and try again, or choose a photo instead.'
  return 'The camera couldn’t start. You can choose a photo instead.'
}
