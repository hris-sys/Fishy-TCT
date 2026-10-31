import { type FishRecord, createFish, describeError, errorDetail, listFish, loadFace, removeFish, signFaceUrls, updateFish } from '../data/fish'
import { currentUserId, ensureSignedIn } from '../data/session'
import { type MyTank, inviteTankName, joinTank, myTanks } from '../data/tanks'
import { species } from '../species'
import type { Tank } from '../tank'
import { openFishSheet } from './add-fish'
import { h, icon } from './dom'
import { showJoin, showLoading, showMessage } from './screens'

type TapHandler = (id: string) => void

/** Drops /join/{code} from the address bar once it has done its job. */
function forgetInvite() {
  history.replaceState(null, '', `/${location.search}`)
}

/**
 * Decides where you land: the invite page, straight into your tank, or a polite "invite only".
 * `setTapHandler` receives the function to call when a fish is tapped.
 */
export async function startShared(tank: Tank, invite: string | null, setTapHandler: (handler: TapHandler) => void) {
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
        return await openTank(tank, already, userId, setTapHandler, false)
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
          await openTank(tank, joined, userId, setTapHandler, true)
        },
        describeError,
      )
    }

    if (!userId || tanks.length === 0) {
      return showMessage('Tankmates is invite\u2011only', 'Ask a friend in your group for the invite link, then open it on this phone.')
    }
    await openTank(tank, tanks[0], userId, setTapHandler, false)
  } catch (error) {
    loading.remove()
    console.error(error)
    showMessage('Couldn’t open the tank', describeError(error), { label: 'Try again', run: () => location.reload() }, errorDetail(error))
  }
}

/** Loads everyone's fish into the tank, then wires up adding, editing and removing. */
async function openTank(tank: Tank, info: MyTank, userId: string, setTapHandler: (handler: TapHandler) => void, addRightAway: boolean) {
  const records = new Map<string, FishRecord>()
  const faces = new Map<string, CanvasImageSource>()

  const rows = await listFish(info.id)
  const urls = await signFaceUrls(rows.map((row) => row.facePath))
  await Promise.all(
    rows.map(async (row) => {
      records.set(row.id, row)
      const url = urls.get(row.facePath)
      if (!url) return
      try {
        const face = await loadFace(url)
        faces.set(row.id, face)
        tank.addResident({ id: row.id, name: row.name, species: row.species, tint: row.tint, face })
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
        ? { name: current.name, species: current.species, tint: current.tint, face: faces.get(current.id) ?? blankFace() }
        : undefined,
      onSave: async (fish) => {
        if (current) {
          const updated = await updateFish(current, { name: fish.name, species: fish.species, tint: fish.tint, face: fish.blob })
          records.set(updated.id, updated)
          if (fish.blob) faces.set(updated.id, fish.face)
          tank.updateResident(updated.id, {
            name: updated.name,
            species: updated.species,
            tint: updated.tint,
            ...(fish.blob ? { face: fish.face } : {}),
          })
          mine = updated
        } else {
          if (!fish.blob) throw new Error('A photo is needed')
          const created = await createFish(info.id, userId, { name: fish.name, species: fish.species, tint: fish.tint, face: fish.blob })
          records.set(created.id, created)
          faces.set(created.id, fish.face)
          tank.addResident({ id: created.id, name: created.name, species: created.species, tint: created.tint, face: fish.face }, { dropIn: true })
          setTimeout(() => tank.showTag(created.id), 1400)
          mine = created
        }
        refreshButton()
      },
      onRemove: current
        ? async () => {
            await removeFish(current)
            forget(current.id)
            mine = null
            refreshButton()
          }
        : undefined,
      onClose: () => {
        tank.setPaused(false)
        button.hidden = false
      },
    })
  }

  function forget(id: string) {
    tank.removeResident(id)
    records.delete(id)
    faces.delete(id)
  }

  // The tank owner can remove anyone's fish: tap it, then tap Remove twice.
  const actions = createActionBar()
  setTapHandler((id) => {
    const record = records.get(id)
    if (!info.isOwner || !record || record.ownerId === userId) return
    actions.show(record.name, async () => {
      await removeFish(record)
      forget(record.id)
    })
  })

  if (addRightAway && !mine) openSheet()
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
