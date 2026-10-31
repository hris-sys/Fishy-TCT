import { type SpeciesConfig, type Tank, createTank } from '../tank'
import { h } from './dom'

export const NAME_MAX = 16

/** Body colours on offer. They multiply the fish's own colours, so they stay light. */
const TINTS: { value: number | null; label: string }[] = [
  { value: null, label: 'Natural' },
  { value: 0xffb0a8, label: 'Coral' },
  { value: 0xffe08a, label: 'Gold' },
  { value: 0xb6f0a6, label: 'Lime' },
  { value: 0x9fd6ff, label: 'Sky' },
  { value: 0xd6b0ff, label: 'Violet' },
  { value: 0xa8a8a8, label: 'Shadow' },
]

export interface PickerValue {
  species: string
  name: string
  tint: number | null
}

export interface PickerInitial {
  species?: string
  name?: string
  tint?: number | null
}

export interface SpeciesPicker {
  element: HTMLElement
  /** Starts the mini tank; call once the element is in the page. */
  start(): Promise<void>
  value(): PickerValue
  destroy(): void
}

const previewId = (speciesId: string) => `preview-${speciesId}`

/**
 * Your face on every species, swimming in a small tank, plus the species, name and colour choices.
 * Tapping a fish in the mini tank picks its species too.
 */
export function createSpeciesPicker(
  face: CanvasImageSource,
  species: SpeciesConfig[],
  onChange: (value: PickerValue) => void,
  initial: PickerInitial = {},
): SpeciesPicker {
  let selected = species.some((config) => config.id === initial.species) ? initial.species! : species[0].id
  let tint: number | null = initial.tint ?? null
  let tank: Tank | null = null
  let destroyed = false

  const tankHost = h('div', { class: 'mini-tank' })
  const chips = species.map((config) =>
    h('button', { type: 'button', class: 'chip', 'aria-pressed': 'false', onclick: () => select(config.id) }, config.label),
  )
  const nameInput = h('input', {
    class: 'text-input',
    type: 'text',
    maxLength: NAME_MAX,
    placeholder: 'Name your fish',
    autocomplete: 'off',
    enterKeyHint: 'done',
    'aria-label': 'Fish name',
    value: initial.name ?? '',
    oninput: () => onChange(value()),
  })
  const swatches = TINTS.map((option) =>
    h('button', {
      type: 'button',
      class: option.value === null ? 'swatch natural' : 'swatch',
      style: option.value === null ? '' : `background:#${option.value.toString(16).padStart(6, '0')}`,
      'aria-label': option.label,
      title: option.label,
      'aria-pressed': String(option.value === tint),
      onclick: () => pickTint(option.value),
    }),
  )

  const element = h(
    'div',
    { class: 'picker' },
    tankHost,
    h('div', { class: 'chips', role: 'group', 'aria-label': 'Species' }, ...chips),
    h('label', { class: 'field' }, 'Name', nameInput),
    h('div', { class: 'field' }, 'Body colour', h('div', { class: 'swatches' }, ...swatches)),
  )

  species.forEach((config, i) => chips[i].setAttribute('aria-pressed', String(config.id === selected)))

  function value(): PickerValue {
    return { species: selected, name: nameInput.value.trim().slice(0, NAME_MAX), tint }
  }

  function select(id: string) {
    selected = id
    species.forEach((config, i) => chips[i].setAttribute('aria-pressed', String(config.id === id)))
    tank?.showTag(previewId(id))
    onChange(value())
  }

  function pickTint(next: number | null) {
    tint = next
    TINTS.forEach((option, i) => swatches[i].setAttribute('aria-pressed', String(option.value === next)))
    for (const config of species) tank?.updateResident(previewId(config.id), { tint })
    onChange(value())
  }

  return {
    element,
    async start() {
      const created = await createTank(tankHost, {
        species,
        scenery: 'simple',
        zoom: 1.9,
        onFishTap: (id) => select(id.replace('preview-', '')),
      })
      // The step may have been left while the tank was loading.
      if (destroyed) return created.destroy()
      tank = created
      for (const config of species) {
        tank.addResident({ id: previewId(config.id), name: config.label, species: config.id, tint, face })
      }
      select(selected)
    },
    value,
    destroy() {
      destroyed = true
      tank?.destroy()
      tank = null
    },
  }
}
