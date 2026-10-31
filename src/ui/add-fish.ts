import type { SpeciesConfig } from '../tank'
import { type Cropper, createCropper } from './cropper'
import { h, icon } from './dom'
import { type FacePhoto, exportFace, loadPhoto } from './photo'
import { createSpeciesPicker } from './species-picker'

export interface NewFish {
  name: string
  species: string
  tint: number | null
  /** The 256 px face square, as it will be stored. */
  face: HTMLCanvasElement
  /** The encoded face file, for uploading (iteration 3). */
  blob: Blob
}

interface AddFishOptions {
  species: SpeciesConfig[]
  onDone(fish: NewFish): void
  onClose(): void
}

/**
 * The add-your-fish flow, as a full-screen sheet: pick a photo, line up the face, pick a species,
 * name and colour. Everything happens on the phone; nothing is uploaded yet.
 */
export function openAddFish(options: AddFishOptions) {
  const root = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Add your fish' })
  document.body.append(root)

  let leaveStep: (() => void) | null = null
  let cropper: { photo: HTMLCanvasElement; cropper: Cropper } | null = null

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

  // Step 1: a selfie or a photo from the library. No camera code yet: the file input opens the
  // front camera on phones when it has capture="user".
  function photoStep(error?: string) {
    const pick = (label: string, iconName: 'camera' | 'image', selfie: boolean) => {
      const input = h('input', {
        type: 'file',
        accept: 'image/*',
        capture: selfie ? 'user' : undefined,
        class: 'visually-hidden',
        onchange: () => {
          const file = input.files?.[0]
          input.value = ''
          if (file) choose(file)
        },
      })
      return h('label', { class: selfie ? 'button primary big' : 'button big' }, input, icon(iconName), label)
    }
    show(
      h(
        'div',
        { class: 'step' },
        header(''),
        h(
          'div',
          { class: 'intro' },
          h('h1', {}, 'Add your fish'),
          h('p', {}, 'Your face goes on a fish. Use a clear photo, looking straight at the camera.'),
          error ? h('p', { class: 'error', role: 'alert' }, error) : null,
          h('div', { class: 'stack' }, pick('Take a selfie', 'camera', true), pick('Choose a photo', 'image', false)),
          h('p', { class: 'note' }, 'Only a small square around your face is kept. The original photo never leaves your phone.'),
        ),
      ),
    )
  }

  async function choose(file: File) {
    show(h('div', { class: 'step' }, header('Line up your face', () => photoStep()), h('p', { class: 'loading' }, 'Opening photo…')))
    try {
      const photo = await loadPhoto(file)
      cropper?.cropper.destroy()
      cropper = { photo, cropper: createCropper(photo) }
      cropStep()
    } catch {
      photoStep('That photo could not be opened. Try a JPEG or PNG, or take a selfie.')
    }
  }

  // Step 2: line up the face in the oval.
  function cropStep() {
    if (!cropper) return photoStep()
    const { photo, cropper: crop } = cropper
    const use = h(
      'button',
      {
        type: 'button',
        class: 'button primary',
        onclick: async () => {
          use.disabled = true
          try {
            speciesStep(await exportFace(photo, crop.crop()))
          } catch {
            use.disabled = false
            photoStep('Something went wrong saving that photo. Please try again.')
          }
        },
      },
      'Use this photo',
    )
    show(
      h(
        'div',
        { class: 'step fill' },
        header('Line up your face', () => photoStep()),
        crop.element,
        h('div', { class: 'step-footer' }, h('p', { class: 'hint' }, 'Drag to move, pinch to zoom. Fit your face inside the oval.'), use),
      ),
    )
  }

  // Step 3: species, name and colour, with a live preview of the face on every fish.
  function speciesStep(face: FacePhoto) {
    const drop = h(
      'button',
      {
        type: 'button',
        class: 'button primary',
        disabled: true,
        onclick: () => {
          const chosen = picker.value()
          if (!chosen.name) return
          close()
          options.onDone({ ...chosen, face: face.canvas, blob: face.blob })
        },
      },
      'Drop it in',
    )
    const picker = createSpeciesPicker(face.canvas, options.species, (value) => {
      drop.disabled = value.name.length === 0
    })
    show(
      h('div', { class: 'step' }, header('Pick your fish', () => cropStep()), picker.element, h('div', { class: 'step-footer' }, drop)),
      () => picker.destroy(),
    )
    void picker.start()
  }

  photoStep()
}
