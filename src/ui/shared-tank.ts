import { type FishRecord, createFish, describeError, errorDetail, listFish, loadFace, removeFish, signFaceUrls, updateFish } from '../data/fish'
import { type LiveTank, connectTank } from '../data/live'
import { currentUserId, ensureSignedIn } from '../data/session'
import { type MyTank, inviteTankName, joinTank, myTanks } from '../data/tanks'
import { species } from '../species'
import type { ResidentInput, Tank } from '../tank'
import { openFishSheet } from './add-fish'
import { h, icon } from './dom'
import { showJoin, showLoading, showMessage } from './screens'
import { FEED_ZONE, type TankHandlers } from './handlers'
import { toast } from './toast'

const HINT_KEY = 'tankmates-hint-play'

/** One fish's photos: the face, and the optional blub face. */
interface Faces {
  face: CanvasImageSource
  blub: CanvasImageSource | null
}

/** Drops /join/{code} from the address bar once it has done its job. */
function forgetInvite() {
  history.replaceState(null, '', `/${location.search}`)
}

/**
 * Decides where you land: the invite page, straight into your tank, or a polite "invite only".
 * `handlers` is filled in with what taps should do once you're in.
 */
export async function startShared(tank: Tank, invite: string | null, handlers: TankHandlers) {
  const loading = showLoading('Opening the tank…')
  try {
    // Only invited visitors get signed in; anyone else isn't worth an account.
    const userId = invite ? await ensureSignedIn() : await currentUserId()
    const tanks = userId ? await myTanks() : []
    loading.remove()

    if (invite && userId) {
      const already = tanks.find((info) => info.inviteCode === invite)
      if (already) {
        forgetInvite()
        return await openTank(tank, already, userId, handlers, false)
      }
      const name = await inviteTankName(invite)
      if (!name) {
        return showMessage('This invite link doesn’t work', 'It may be mistyped or out of date. Ask a friend in the tank for a fresh link.')
      }
      return showJoin(
        name,
        async (displayName) => {
          await joinTank(invite, displayName)
          const joined = (await myTanks()).find((info) => info.inviteCode === invite)
          if (!joined) throw new Error('Joined, but the tank could not be opened')
          forgetInvite()
          await openTank(tank, joined, userId, handlers, true)
        },
        describeError,
      )
    }

    if (!userId || tanks.length === 0) {
      return showMessage('Tankmates is invite\u2011only', 'Ask a friend in your group for the invite link, then open it on this phone.')
    }
    await openTank(tank, tanks[0], userId, handlers, false)
  } catch (error) {
    loading.remove()
    console.error(error)
    showMessage('Couldn’t open the tank', describeError(error), { label: 'Try again', run: () => location.reload() }, errorDetail(error))
  }
}

/**
 * Loads everyone's fish into the tank, keeps it live (new, changed and removed fish; who's online),
 * and wires up adding, editing and removing.
 */
async function openTank(tank: Tank, info: MyTank, userId: string, handlers: TankHandlers, addRightAway: boolean) {
  const records = new Map<string, FishRecord>()
  const faces = new Map<string, Faces>()
  /** Who's online, by user id. Null until the first presence update: until then, nobody sleeps. */
  let online: Set<string> | null = null
  /** True while our own new fish is being saved, so its live "insert" doesn't add it twice. */
  let savingNew = false

  const isOnline = (ownerId: string) => ownerId === userId || online === null || online.has(ownerId)
  const toResident = (record: FishRecord, photos: Faces): ResidentInput => ({
    id: record.id,
    name: record.name,
    species: record.species,
    tint: record.tint,
    face: photos.face,
    blub: photos.blub,
  })

  /** Downloads a fish's face, and its blub face if it has one. A blub that fails is skipped. */
  async function loadPhotos(record: FishRecord, urls: Map<string, string>): Promise<Faces> {
    const faceUrl = urls.get(record.facePath)
    if (!faceUrl) throw new Error(`No face URL for fish ${record.id}`)
    const blubUrl = record.faceBlubPath ? urls.get(record.faceBlubPath) : undefined
    const [face, blub] = await Promise.all([loadFace(faceUrl), blubUrl ? loadFace(blubUrl).catch(() => null) : Promise.resolve(null)])
    return { face, blub }
  }
  const pathsOf = (record: FishRecord) => [record.facePath, ...(record.faceBlubPath ? [record.faceBlubPath] : [])]
  const photosFor = async (record: FishRecord) => loadPhotos(record, await signFaceUrls(pathsOf(record)))

  const rows = await listFish(info.id)
  const urls = await signFaceUrls(rows.flatMap(pathsOf))
  await Promise.all(
    rows.map(async (row) => {
      records.set(row.id, row)
      try {
        const photos = await loadPhotos(row, urls)
        faces.set(row.id, photos)
        tank.addResident(toResident(row, photos))
      } catch (error) {
        console.warn('A face could not be loaded', row.id, error)
      }
    }),
  )
  let mine = rows.find((row) => row.ownerId === userId) ?? null

  const button = h('button', { type: 'button', class: 'add-fish', onclick: () => openSheet() })
  const refreshButton = () => button.replaceChildren(icon(mine ? 'fish' : 'plus'), mine ? 'Your fish' : 'Add your fish')
  refreshButton()
  document.body.append(button)

  /** Removed fish swim off-screen. */
  function forget(id: string) {
    tank.removeResident(id, { swimAway: true })
    records.delete(id)
    faces.delete(id)
    if (mine?.id === id) {
      mine = null
      refreshButton()
    }
  }

  /** Brings the tank in line with one fish's latest state, from a live event or a refetch. */
  async function apply(record: FishRecord) {
    const known = records.get(record.id)
    if (record.deletedAt) {
      if (known) forget(record.id)
      return
    }
    if (!known) {
      if (record.ownerId === userId && savingNew) return
      const photos = await photosFor(record)
      if (records.has(record.id)) return
      records.set(record.id, record)
      faces.set(record.id, photos)
      tank.addResident(toResident(record, photos), { dropIn: true })
      tank.setAsleep(record.id, !isOnline(record.ownerId))
      // Your own fish, made on another device.
      if (record.ownerId === userId) {
        mine = record
        refreshButton()
      }
      return
    }
    // Our own saves already applied this change; older events are stale.
    if (Date.parse(record.updatedAt) <= Date.parse(known.updatedAt)) return
    records.set(record.id, record)
    const changes: Partial<Omit<ResidentInput, 'id'>> = { name: record.name, species: record.species, tint: record.tint }
    if (record.facePath !== known.facePath || record.faceBlubPath !== known.faceBlubPath) {
      const photos = await photosFor(record)
      faces.set(record.id, photos)
      changes.face = photos.face
      changes.blub = photos.blub
    }
    tank.updateResident(record.id, changes)
    if (mine?.id === record.id) mine = record
  }

  /** Fetches the whole list again and reconciles, to catch anything missed while away. */
  async function refetch() {
    const fresh = await listFish(info.id)
    const ids = new Set(fresh.map((record) => record.id))
    for (const [id, record] of [...records]) {
      if (!ids.has(id)) await apply({ ...record, deletedAt: new Date().toISOString() })
    }
    for (const record of fresh) await apply(record)
  }

  // Live changes are applied one at a time, in order, so a fish can't be added twice.
  let queue = Promise.resolve()
  const enqueue = (task: () => Promise<void>) => {
    queue = queue.then(task).catch((error) => console.warn('A live update failed', error))
  }

  const updateSleep = () => {
    for (const record of records.values()) tank.setAsleep(record.id, !isOnline(record.ownerId))
  }

  let live: LiveTank | null = null
  try {
    live = await connectTank(info.id, userId, {
      fish: (record) => enqueue(() => apply(record)),
      presence: (ids) => {
        online = ids
        updateSleep()
      },
      reconnected: () => enqueue(refetch),
      // Someone else poked a fish: it reacts here too, with a note saying who did it.
      poke: ({ fishId, by }) => {
        const record = records.get(fishId)
        if (!record) return
        tank.react(fishId)
        toast(record.ownerId === userId ? `${by} poked your fish` : `${by} poked ${record.name}`)
      },
      feed: ({ x, seed }) => tank.feed(x, seed),
    })
    const connection = live
    // In the background you count as offline; coming back, catch up on anything missed.
    document.addEventListener('visibilitychange', () => {
      connection.setVisible(!document.hidden)
      if (!document.hidden) enqueue(refetch)
    })
    window.addEventListener('pagehide', () => connection.setVisible(false))
  } catch (error) {
    // Without the live connection the tank still works; it just needs a refresh to update.
    console.warn('Live updates are unavailable', error)
  }

  function openSheet() {
    button.hidden = true
    actions.hide()
    tank.setPaused(true)
    const current = mine
    openFishSheet({
      species,
      describeError,
      suggestedName: info.displayName.slice(0, 16),
      existing: current
        ? {
            name: current.name,
            species: current.species,
            tint: current.tint,
            face: faces.get(current.id)?.face ?? blankFace(),
            blub: faces.get(current.id)?.blub ?? null,
          }
        : undefined,
      onSave: async (fish) => {
        if (current) {
          const updated = await updateFish(current, {
            name: fish.name,
            species: fish.species,
            tint: fish.tint,
            face: fish.blob,
            ...(fish.blubBlob !== undefined ? { blub: fish.blubBlob } : {}),
          })
          records.set(updated.id, updated)
          faces.set(updated.id, { face: fish.face, blub: fish.blub })
          tank.updateResident(updated.id, {
            name: updated.name,
            species: updated.species,
            tint: updated.tint,
            ...(fish.blob ? { face: fish.face } : {}),
            ...(fish.blubBlob !== undefined ? { blub: fish.blub } : {}),
          })
          mine = updated
        } else {
          if (!fish.blob) throw new Error('A photo is needed')
          savingNew = true
          try {
            const created = await createFish(info.id, userId, {
              name: fish.name,
              species: fish.species,
              tint: fish.tint,
              face: fish.blob,
              blub: fish.blubBlob ?? null,
            })
            const photos = { face: fish.face, blub: fish.blub }
            records.set(created.id, created)
            faces.set(created.id, photos)
            tank.addResident(toResident(created, photos), { dropIn: true })
            setTimeout(() => tank.showTag(created.id), 1400)
            mine = created
          } finally {
            savingNew = false
          }
        }
        refreshButton()
      },
      onRemove: current
        ? async () => {
            await removeFish(current)
            forget(current.id)
          }
        : undefined,
      onClose: () => {
        tank.setPaused(false)
        button.hidden = false
      },
    })
  }

  // Tap a fish to poke it: it reacts here, and on everyone else's screen.
  let lastPoke = 0
  handlers.fishTap = (id) => {
    if (!records.has(id)) return
    tank.react(id)
    const now = performance.now()
    if (now - lastPoke < 250) return
    lastPoke = now
    live?.poke(id, info.displayName)
  }

  // Tap near the surface to drop food, for everyone.
  let lastFeed = 0
  handlers.waterTap = (x, y) => {
    if (y > FEED_ZONE) return
    const now = performance.now()
    if (now - lastFeed < 600) return
    lastFeed = now
    const seed = Math.floor(Math.random() * 2 ** 31)
    tank.feed(x, seed)
    live?.feed(x, seed)
  }

  // The tank owner can remove anyone's fish: press and hold it, then tap Remove twice.
  const actions = createActionBar()
  handlers.fishLongPress = (id) => {
    const record = records.get(id)
    if (!info.isOwner || !record || record.ownerId === userId) return
    actions.show(record.name, async () => {
      await removeFish(record)
      forget(record.id)
    })
  }

  if (addRightAway && !mine) openSheet()
  else showPlayHint()
}

/** A small bar along the bottom offering to remove a tapped fish. Hides itself after a few seconds. */
function createActionBar() {
  const label = h('span', { class: 'action-label' })
  const remove = h('button', { type: 'button', class: 'button danger small' }, 'Remove')
  const bar = h('div', { class: 'action-bar', hidden: true, role: 'status' }, label, remove)
  document.body.append(bar)
  let timer = 0
  let run: (() => Promise<void>) | null = null
  let armed = false

  const hide = () => {
    bar.hidden = true
    window.clearTimeout(timer)
  }
  const keepOpen = () => {
    window.clearTimeout(timer)
    timer = window.setTimeout(hide, 5000)
  }

  remove.addEventListener('click', async () => {
    if (!run) return
    if (!armed) {
      armed = true
      remove.textContent = 'Tap again'
      keepOpen()
      return
    }
    remove.disabled = true
    try {
      await run()
      hide()
    } catch (error) {
      label.textContent = describeError(error)
      keepOpen()
    } finally {
      remove.disabled = false
    }
  })

  return {
    show(name: string, action: () => Promise<void>) {
      run = action
      armed = false
      label.textContent = `${name}’s fish`
      remove.textContent = 'Remove'
      bar.hidden = false
      keepOpen()
    },
    hide,
  }
}

/** Stand-in face when someone's photo failed to load, so they can still edit or replace it. */
function blankFace() {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 256
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#8fa3b3'
  ctx.fillRect(0, 0, 256, 256)
  return canvas
}

/** Explains the taps once, the first time someone opens a tank after this arrived. */
function showPlayHint() {
  try {
    if (localStorage.getItem(HINT_KEY)) return
    localStorage.setItem(HINT_KEY, '1')
  } catch {
    return
  }
  window.setTimeout(() => toast('Tap a fish to poke it · tap near the surface to feed everyone', 5000), 1200)
}
