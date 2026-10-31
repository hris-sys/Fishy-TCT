/** Photos are scaled down to at most this many pixels on their long side as soon as they load. */
const MAX_SIDE = 2048
/** Faces are stored as squares of this size (the tank masks them per species when drawing). */
export const FACE_PX = 256

/** A square region of the photo, in photo pixels. */
export interface CropRect {
  x: number
  y: number
  size: number
}

export interface FacePhoto {
  /** Exactly what gets stored: the encoded square, decoded back. */
  canvas: HTMLCanvasElement
  /** The encoded file: WebP where the browser can make it, otherwise JPEG. */
  blob: Blob
}

/**
 * Loads a picked photo into a canvas, upright and at most 2048 px on its long side.
 * Browsers apply the EXIF orientation when decoding and drawing, so phone photos taken sideways
 * come out the right way up. Drawing into a canvas also drops all metadata, including GPS.
 */
export async function loadPhoto(file: Blob): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    const scale = Math.min(1, MAX_SIDE / Math.max(image.naturalWidth, image.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
    const ctx = canvas.getContext('2d')!
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
    return canvas
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Cuts the crop out of the photo as a 256 px square, encodes it, and decodes it again. */
export async function exportFace(photo: HTMLCanvasElement, crop: CropRect): Promise<FacePhoto> {
  // Shrink in halving steps: sharper than one big jump from a large crop down to 256 px.
  let side = Math.round(Math.min(crop.size, 1024))
  let current = drawSquare(photo, crop.x, crop.y, crop.size, side)
  while (side / 2 >= FACE_PX) {
    side = Math.round(side / 2)
    current = drawSquare(current, 0, 0, current.width, side)
  }
  const square = drawSquare(current, 0, 0, current.width, FACE_PX)
  const blob = await encode(square)
  return { canvas: await decode(blob), blob }
}

function drawSquare(source: CanvasImageSource, x: number, y: number, size: number, to: number) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = to
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, x, y, size, size, 0, 0, to, to)
  return canvas
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality))
}

async function encode(canvas: HTMLCanvasElement): Promise<Blob> {
  const webp = await toBlob(canvas, 'image/webp', 0.85)
  if (webp?.type === 'image/webp') return webp
  // Safari can't encode WebP and quietly returns a PNG instead, so check the type and use JPEG.
  const jpeg = await toBlob(canvas, 'image/jpeg', 0.88)
  if (jpeg?.type === 'image/jpeg') return jpeg
  throw new Error('This browser could not save the photo.')
}

async function decode(blob: Blob): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(blob)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    return drawSquare(image, 0, 0, image.naturalWidth, FACE_PX)
  } finally {
    URL.revokeObjectURL(url)
  }
}
