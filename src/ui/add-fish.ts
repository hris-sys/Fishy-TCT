import type { SpeciesConfig } from '../tank'
import { type Cropper, createCropper } from './cropper'
import { h, icon } from './dom'
import { type FacePhoto, exportFace, loadPhoto } from './photo'
import { type PickerInitial, type PickerValue, createSpeciesPicker } from './species-picker'

export interface NewFish {
  name: string
  species: string
  tint: number | null
  /** The 256 px face square, exactly as stored. */
  face: CanvasImageSource
  /** The newly encoded face file, or null when the face didn't change. */
  blob: Blob | null
}

interface FishSheetOptions {
  species: SpeciesConfig[]
  /** Editing an existing fish: opens on the species step with its current face. */
  existing?: { name: string; species: string; tint: number | null; face: CanvasImageSource }
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
  let cropper: { photo: HTMLCanvasElement; cropper: Cropper } | null = null
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

  // Step 1: a selfie or a photo from the library. On phones, capture="user" opens the front camera.
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
    const back = editing && options.existing ? () => speciesStep({ canvas: options.existing!.face, blob: null }) : undefined
    show(
      h(
        'div',
        { class: 'step' },
        header('', back),
        h(
          'div',
          { class: 'intro' },
          h('h1', {}, editing ? 'New photo' : 'Add your fish'),
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
            const face = await exportFace(photo, crop.crop())
            speciesStep({ canvas: face.canvas, blob: face.blob })
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

  // Step 3: species, name and colour, with the face on every fish in a mini tank.
  function speciesStep(face: { canvas: CanvasImageSource; blob: FacePhoto['blob'] | null }) {
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
        await options.onSave({ ...chosen, face: face.canvas, blob: face.blob })
        close()
      } catch (error) {
        fail(error)
        save.disabled = false
        save.textContent = saveLabel
      }
    }

    const picker = createSpeciesPicker(
      face.canvas,
      options.species,
      (value) => {
        choices = value
        save.disabled = value.name.length === 0
      },
      choices,
    )

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
    const back = editing ? undefined : () => cropStep()
    show(
      h(
        'div',
        { class: 'step' },
        header(editing ? 'Your fish' : 'Pick your fish', back),
        picker.element,
        h('div', { class: 'step-footer' }, message, newPhoto, save, remove),
      ),
      () => picker.destroy(),
    )
    void picker.start()
  }

  if (options.existing) speciesStep({ canvas: options.existing.face, blob: null })
  else photoStep()
}
