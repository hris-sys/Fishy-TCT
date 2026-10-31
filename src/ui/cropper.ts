import { h, icon } from './dom'
import type { CropRect } from './photo'

const MAX_ZOOM = 6
/** The face guide inside the crop square, as fractions of its size. Every species mask keeps about this much. */
const OVAL = { rx: 0.36, ry: 0.45 }
const SVG_NS = 'http://www.w3.org/2000/svg'

export interface Cropper {
  element: HTMLElement
  /** The square currently inside the guide, in photo pixels. */
  crop(): CropRect
  destroy(): void
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/**
 * The photo behind a square frame with an oval face guide. Drag to move, pinch (or scroll, or the
 * slider) to zoom. The photo always covers the whole square, so the crop never has empty edges.
 */
export function createCropper(photo: HTMLCanvasElement): Cropper {
  const width = photo.width
  const height = photo.height
  const short = Math.min(width, height)
  // Start zoomed out, centered; in portrait photos faces tend to sit in the upper part.
  let zoom = 1
  let centerX = width / 2
  let centerY = height > width ? height * 0.42 : height / 2
  // The crop square, in CSS px within the stage.
  let square = 0
  let left = 0
  let top = 0

  photo.className = 'crop-photo'
  photo.style.width = `${width}px`
  photo.style.height = `${height}px`

  const mask = document.createElementNS(SVG_NS, 'svg')
  mask.classList.add('crop-mask')
  const outside = document.createElementNS(SVG_NS, 'path')
  outside.setAttribute('fill', 'rgba(2, 16, 30, 0.72)')
  outside.setAttribute('fill-rule', 'evenodd')
  const aroundFace = document.createElementNS(SVG_NS, 'path')
  aroundFace.setAttribute('fill', 'rgba(2, 16, 30, 0.28)')
  aroundFace.setAttribute('fill-rule', 'evenodd')
  const frame = document.createElementNS(SVG_NS, 'rect')
  frame.setAttribute('fill', 'none')
  frame.setAttribute('stroke', 'rgba(255, 255, 255, 0.35)')
  frame.setAttribute('stroke-dasharray', '6 6')
  const guide = document.createElementNS(SVG_NS, 'ellipse')
  guide.setAttribute('fill', 'none')
  guide.setAttribute('stroke', 'rgba(255, 255, 255, 0.92)')
  guide.setAttribute('stroke-width', '2.5')
  mask.append(outside, aroundFace, frame, guide)

  const preview = h('canvas', { class: 'crop-preview', 'aria-label': 'Preview' })
  const previewCtx = preview.getContext('2d')!
  const stage = h('div', { class: 'crop-stage' }, photo, mask, preview)

  const slider = h('input', {
    type: 'range',
    min: '1',
    max: String(MAX_ZOOM),
    step: '0.01',
    value: '1',
    'aria-label': 'Zoom',
    oninput: () => zoomAt(Number(slider.value) / zoom, left + square / 2, top + square / 2),
  })
  const zoomButton = (name: 'minus' | 'plus', factor: number) =>
    h('button', { type: 'button', class: 'icon-button', 'aria-label': name === 'plus' ? 'Zoom in' : 'Zoom out', onclick: () => zoomAt(factor, left + square / 2, top + square / 2) }, icon(name))
  const element = h('div', { class: 'crop' }, stage, h('div', { class: 'zoom' }, zoomButton('minus', 1 / 1.25), slider, zoomButton('plus', 1.25)))

  /** CSS px per photo pixel. */
  const scale = () => (square / short) * zoom

  function crop(): CropRect {
    const size = square / scale()
    return { x: centerX - size / 2, y: centerY - size / 2, size }
  }

  let previewQueued = false
  function render() {
    if (square <= 0) return
    // Keep the square inside the photo.
    const half = square / (2 * scale())
    centerX = clamp(centerX, half, width - half)
    centerY = clamp(centerY, half, height - half)
    const k = scale()
    photo.style.transform = `translate(${left + square / 2 - centerX * k}px, ${top + square / 2 - centerY * k}px) scale(${k})`
    slider.value = String(zoom)
    if (!previewQueued) {
      previewQueued = true
      requestAnimationFrame(() => {
        previewQueued = false
        const r = crop()
        previewCtx.drawImage(photo, r.x, r.y, r.size, r.size, 0, 0, preview.width, preview.height)
      })
    }
  }

  /** Zooms by `factor`, keeping the photo point under (px, py) in place. */
  function zoomAt(factor: number, px: number, py: number) {
    const before = scale()
    const photoX = centerX + (px - (left + square / 2)) / before
    const photoY = centerY + (py - (top + square / 2)) / before
    zoom = clamp(zoom * factor, 1, MAX_ZOOM)
    const after = scale()
    centerX = photoX - (px - (left + square / 2)) / after
    centerY = photoY - (py - (top + square / 2)) / after
    render()
  }

  function pan(dx: number, dy: number) {
    centerX -= dx / scale()
    centerY -= dy / scale()
    render()
  }

  function layout() {
    const w = stage.clientWidth
    const hgt = stage.clientHeight
    square = Math.max(80, Math.min(w - 32, hgt - 32, 440))
    left = (w - square) / 2
    top = (hgt - square) / 2
    const cx = left + square / 2
    const cy = top + square / 2
    const rx = square * OVAL.rx
    const ry = square * OVAL.ry
    const squarePath = `M${left} ${top}h${square}v${square}h${-square}Z`
    const ovalPath = `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0Z`
    mask.setAttribute('viewBox', `0 0 ${w} ${hgt}`)
    outside.setAttribute('d', `M0 0H${w}V${hgt}H0Z${squarePath}`)
    aroundFace.setAttribute('d', squarePath + ovalPath)
    frame.setAttribute('x', String(left))
    frame.setAttribute('y', String(top))
    frame.setAttribute('width', String(square))
    frame.setAttribute('height', String(square))
    guide.setAttribute('cx', String(cx))
    guide.setAttribute('cy', String(cy))
    guide.setAttribute('rx', String(rx))
    guide.setAttribute('ry', String(ry))
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    preview.width = preview.height = Math.round(64 * dpr)
    render()
  }

  // One finger pans; two fingers pinch-zoom around their midpoint and pan with it.
  const pointers = new Map<number, { x: number; y: number }>()
  const local = (event: PointerEvent | WheelEvent) => {
    const rect = stage.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }
  stage.addEventListener('pointerdown', (event) => {
    stage.setPointerCapture(event.pointerId)
    pointers.set(event.pointerId, local(event))
  })
  stage.addEventListener('pointermove', (event) => {
    const previous = pointers.get(event.pointerId)
    if (!previous) return
    const now = local(event)
    if (pointers.size === 1) {
      pan(now.x - previous.x, now.y - previous.y)
    } else if (pointers.size === 2) {
      const [otherId] = [...pointers.keys()].filter((id) => id !== event.pointerId)
      const other = pointers.get(otherId)!
      const before = Math.hypot(previous.x - other.x, previous.y - other.y)
      const after = Math.hypot(now.x - other.x, now.y - other.y)
      const midBefore = { x: (previous.x + other.x) / 2, y: (previous.y + other.y) / 2 }
      const midAfter = { x: (now.x + other.x) / 2, y: (now.y + other.y) / 2 }
      pan(midAfter.x - midBefore.x, midAfter.y - midBefore.y)
      if (before > 0) zoomAt(after / before, midAfter.x, midAfter.y)
    }
    pointers.set(event.pointerId, now)
  })
  const release = (event: PointerEvent) => pointers.delete(event.pointerId)
  stage.addEventListener('pointerup', release)
  stage.addEventListener('pointercancel', release)
  stage.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault()
      const at = local(event)
      zoomAt(Math.exp(-event.deltaY * 0.0015), at.x, at.y)
    },
    { passive: false },
  )

  const observer = new ResizeObserver(layout)
  observer.observe(stage)

  return {
    element,
    crop,
    destroy: () => observer.disconnect(),
  }
}
