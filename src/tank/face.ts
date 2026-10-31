import type { MaskConfig } from './species'
import { makeCanvas, seededRandom } from './util'

/** Faces are stored and drawn as unmasked squares of this size. */
export const FACE_SIZE = 256

/**
 * Cuts a square face crop to a species' mask shape, with a soft edge.
 * Baked once per fish (and again when the mask changes) instead of masking live every frame.
 */
export function bakeMaskedFace(face: CanvasImageSource, mask: MaskConfig): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(FACE_SIZE)
  ctx.drawImage(face, 0, 0, FACE_SIZE, FACE_SIZE)
  ctx.globalCompositeOperation = 'destination-in'
  ctx.drawImage(drawMask(mask, FACE_SIZE), 0, 0)
  return canvas
}

function drawMask(mask: MaskConfig, size: number): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(size)
  const blur = mask.feather * size
  const inset = blur * 0.6
  const c = size / 2

  // Feather trick: draw the shape off-canvas and keep only its blurred shadow. Works in every
  // browser, unlike ctx.filter. Shadow offsets ignore the transform, so the shadow lands at (0, 0).
  const offset = size * 2
  ctx.shadowColor = '#000'
  ctx.shadowBlur = blur
  ctx.shadowOffsetX = offset
  ctx.translate(-offset, 0)

  ctx.beginPath()
  switch (mask.shape) {
    case 'circle':
      ctx.arc(c, c, Math.max(1, c - inset), 0, Math.PI * 2)
      ctx.fill()
      break
    case 'oval':
      ctx.ellipse(c, c, Math.max(1, mask.width * c - inset), Math.max(1, mask.height * c - inset), 0, 0, Math.PI * 2)
      ctx.fill()
      break
    case 'path': {
      const scale = (size - inset * 2) / 100
      ctx.translate(inset, inset)
      ctx.scale(scale, scale)
      ctx.fill(new Path2D(mask.d))
      break
    }
  }
  return canvas
}

const SKIN = ['#f3cfb1', '#e2ad84', '#c68863', '#8d5a3b', '#5e3b27']
const HAIR = ['#24180f', '#5a3a1e', '#a8652d', '#dcb76e', '#151515', '#8a8a8a']
const BACKDROP = ['#a7bfd0', '#cdbca9', '#adc7a4', '#c9adbb', '#bdbdbd', '#d8cfa0']
const SHIRT = ['#3b6ea5', '#b44a4a', '#3f8f5b', '#6b4fa0', '#d08a2e', '#444444']

/**
 * A stand-in for a real face photo until iteration 2: a cartoon head on a plain backdrop, framed like
 * the capture oval frames a real one. The side-swept fringe is lopsided on purpose, so a mirrored
 * face would be easy to spot.
 */
export function drawPlaceholderFace(seed: number): HTMLCanvasElement {
  const rand = seededRandom(seed * 7919)
  const pick = <T>(list: readonly T[]) => list[Math.floor(rand() * list.length)]
  const skin = pick(SKIN)
  const { canvas, ctx } = makeCanvas(FACE_SIZE)

  ctx.fillStyle = pick(BACKDROP)
  ctx.fillRect(0, 0, FACE_SIZE, FACE_SIZE)
  // Fill the frame the way the capture oval will: face large, little backdrop.
  ctx.translate(128, 140)
  ctx.scale(1.15, 1.15)
  ctx.translate(-128, -140)

  // Shoulders and neck.
  ctx.fillStyle = pick(SHIRT)
  ctx.beginPath()
  ctx.ellipse(128, 270, 110, 48, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = skin
  ctx.fillRect(106, 196, 44, 40)

  // Ears, then the face.
  ctx.beginPath()
  ctx.ellipse(56, 142, 12, 18, 0, 0, Math.PI * 2)
  ctx.ellipse(200, 142, 12, 18, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.ellipse(128, 138, 72, 88, 0, 0, Math.PI * 2)
  ctx.fill()

  // Hair with a fringe swept toward the right.
  ctx.fillStyle = pick(HAIR)
  ctx.beginPath()
  ctx.moveTo(52, 150)
  ctx.bezierCurveTo(36, 56, 104, 34, 146, 40)
  ctx.bezierCurveTo(196, 48, 222, 98, 204, 150)
  ctx.bezierCurveTo(200, 122, 192, 104, 176, 96)
  ctx.bezierCurveTo(146, 120, 98, 104, 70, 122)
  ctx.bezierCurveTo(62, 130, 56, 140, 52, 150)
  ctx.fill()

  // Eyes, looking slightly right.
  for (const x of [100, 156]) {
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.ellipse(x, 144, 13, 10, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#2a1d16'
    ctx.beginPath()
    ctx.arc(x + 3, 145, 6, 0, Math.PI * 2)
    ctx.fill()
  }

  // Nose, mouth and cheeks.
  ctx.strokeStyle = 'rgba(90, 40, 30, 0.45)'
  ctx.lineWidth = 4
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(130, 152)
  ctx.quadraticCurveTo(136, 166, 126, 168)
  ctx.stroke()
  ctx.strokeStyle = '#8a3b2e'
  ctx.lineWidth = 5
  ctx.beginPath()
  ctx.arc(128, 172, 26, Math.PI * 0.18, Math.PI * 0.82)
  ctx.stroke()
  ctx.fillStyle = 'rgba(230, 90, 90, 0.18)'
  ctx.beginPath()
  ctx.ellipse(86, 172, 14, 9, 0, 0, Math.PI * 2)
  ctx.ellipse(170, 172, 14, 9, 0, 0, Math.PI * 2)
  ctx.fill()

  return canvas
}
