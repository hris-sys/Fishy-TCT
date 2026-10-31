import { db } from './supabase'

const BUCKET = 'faces'
const COLUMNS = 'id, tank_id, owner_id, name, species, tint, face_path, face_blub_path, deleted_at, updated_at'
/** Signed face URLs last this long. Faces are downloaded once, so this only needs to cover loading. */
const SIGNED_URL_SECONDS = 60 * 60

export interface FishRecord {
  id: string
  tankId: string
  ownerId: string
  name: string
  species: string
  tint: number | null
  facePath: string
  faceBlubPath: string | null
  deletedAt: string | null
  updatedAt: string
}

export interface FishChanges {
  name: string
  species: string
  tint: number | null
  /** A new face photo, or null to keep the current one. */
  face: Blob | null
}

function fromRow(row: Record<string, unknown>): FishRecord {
  return {
    id: String(row.id),
    tankId: String(row.tank_id),
    ownerId: String(row.owner_id),
    name: String(row.name),
    species: String(row.species),
    tint: typeof row.tint === 'number' ? row.tint : null,
    facePath: String(row.face_path),
    faceBlubPath: typeof row.face_blub_path === 'string' ? row.face_blub_path : null,
    deletedAt: typeof row.deleted_at === 'string' ? row.deleted_at : null,
    updatedAt: String(row.updated_at),
  }
}

/** Every live fish in a tank. */
export async function listFish(tankId: string): Promise<FishRecord[]> {
  const { data, error } = await db().from('fish').select(COLUMNS).eq('tank_id', tankId).is('deleted_at', null).order('created_at')
  if (error) throw error
  return (data ?? []).map(fromRow)
}

/** Signs all face URLs in one request. Paths that can't be signed are left out. */
export async function signFaceUrls(paths: string[]): Promise<Map<string, string>> {
  const urls = new Map<string, string>()
  if (paths.length === 0) return urls
  const { data, error } = await db().storage.from(BUCKET).createSignedUrls(paths, SIGNED_URL_SECONDS)
  if (error) throw error
  for (const entry of data ?? []) {
    if (entry.path && entry.signedUrl && !entry.error) urls.set(entry.path, entry.signedUrl)
  }
  return urls
}

/** Downloads a face. Loaded as CORS so the tank may draw it into WebGL. */
export async function loadFace(url: string): Promise<HTMLImageElement> {
  const image = new Image()
  image.crossOrigin = 'anonymous'
  image.src = url
  await image.decode()
  return image
}

/** A fresh file name for every upload, so a new face never collides with a cached old one. */
function newFacePath(tankId: string, ownerId: string, face: Blob) {
  const ext = face.type === 'image/webp' ? 'webp' : 'jpg'
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`
  return `${tankId}/${ownerId}/${id}.${ext}`
}

async function uploadFace(path: string, face: Blob) {
  const { error } = await db().storage.from(BUCKET).upload(path, face, { contentType: face.type, cacheControl: '31536000', upsert: false })
  if (error) throw error
}

/** Deletes face files through the Storage API (deleting their rows in SQL would leave the files behind). */
async function deleteFaces(paths: (string | null)[]) {
  const existing = paths.filter((path): path is string => Boolean(path))
  if (existing.length === 0) return
  const { error } = await db().storage.from(BUCKET).remove(existing)
  if (error) console.warn('Could not delete old face files', error)
}

/** Uploads the face, then adds the fish. */
export async function createFish(tankId: string, ownerId: string, fish: FishChanges & { face: Blob }): Promise<FishRecord> {
  const facePath = newFacePath(tankId, ownerId, fish.face)
  await uploadFace(facePath, fish.face)
  const { data, error } = await db()
    .from('fish')
    .insert({ tank_id: tankId, owner_id: ownerId, name: fish.name, species: fish.species, tint: fish.tint, face_path: facePath })
    .select(COLUMNS)
    .single()
  if (error) {
    await deleteFaces([facePath])
    throw error
  }
  return fromRow(data)
}

/** Saves changes to your fish. A new face is uploaded first; the old file is deleted afterwards. */
export async function updateFish(fish: FishRecord, changes: FishChanges): Promise<FishRecord> {
  const facePath = changes.face ? newFacePath(fish.tankId, fish.ownerId, changes.face) : null
  if (facePath && changes.face) await uploadFace(facePath, changes.face)
  const { data, error } = await db()
    .from('fish')
    .update({ name: changes.name, species: changes.species, tint: changes.tint, ...(facePath ? { face_path: facePath } : {}) })
    .eq('id', fish.id)
    .select(COLUMNS)
    .single()
  if (error) {
    if (facePath) await deleteFaces([facePath])
    throw error
  }
  if (facePath) await deleteFaces([fish.facePath])
  return fromRow(data)
}

/** Removes a fish (yours, or anyone's if you own the tank) and its face files. */
export async function removeFish(fish: FishRecord): Promise<void> {
  const { error } = await db().rpc('remove_fish', { fish_id: fish.id })
  if (error) throw error
  await deleteFaces([fish.facePath, fish.faceBlubPath])
}

/** A short, human message for errors from Supabase or the network. */
export function describeError(error: unknown): string {
  const e = error as { code?: string; message?: string } | null
  if (e?.code === '23505') return 'You already have a fish in this tank.'
  if (e?.code === 'P0002') return 'This invite link is not valid.'
  if (e?.code === '42501') return 'You are not allowed to do that.'
  if (e?.message?.toLowerCase().includes('anonymous sign-ins are disabled')) return 'Joining is switched off right now (anonymous sign-ins are disabled in Supabase).'
  if (e?.message?.toLowerCase().includes('fetch') || e?.message?.toLowerCase().includes('network')) return 'Could not reach the tank. Check your connection and try again.'
  return 'Something went wrong. Please try again.'
}
