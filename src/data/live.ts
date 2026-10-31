import { type ChatMessage, messageFromRow } from './chat'
import { type FishRecord, fromRow } from './fish'
import { db } from './supabase'

export interface LiveHandlers {
  /** A fish was added, changed or removed (removals arrive with `deletedAt` set). */
  fish(record: FishRecord): void
  /** Who's in the tank right now, as user ids. */
  presence?(online: Set<string>): void
  /** The connection came back after dropping, so some changes may have been missed. */
  reconnected(): void
  /** Someone tapped a fish. */
  poke(poke: { fishId: string; by: string }): void
  /** Someone dropped food: `x` is a fraction of the width, `seed` scatters the flakes. */
  feed(feed: { x: number; seed: number }): void
  /** A new chat message. */
  message(message: ChatMessage): void
}

export interface LiveTank {
  /** Shows you as online (app open) or offline (app in the background). */
  setVisible(visible: boolean): void
  /** Tells everyone else you tapped a fish. */
  poke(fishId: string, by: string): void
  /** Tells everyone else you dropped food. */
  feed(x: number, seed: number): void
  close(): void
}

/**
 * Joins the tank's private channel, "tank:{id}": fish changes (Postgres Changes, filtered by tank)
 * and Presence (who's online). Only members may join; others are refused by the channel policies.
 */
export async function connectTank(tankId: string, userId: string, handlers: LiveHandlers): Promise<LiveTank> {
  const client = db()
  // Private channels check the signed-in user, so the socket needs the session's token.
  await client.realtime.setAuth()
  // Broadcasts don't echo back to the sender: the app plays its own pokes and feeds right away.
  const channel = client.channel(`tank:${tankId}`, { config: { private: true, presence: { key: userId }, broadcast: { self: false } } })

  channel.on('postgres_changes', { event: '*', schema: 'public', table: 'fish', filter: `tank_id=eq.${tankId}` }, (payload) => {
    const row = payload.new as Record<string, unknown> | undefined
    if (row && 'id' in row) handlers.fish(fromRow(row))
  })
  channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `tank_id=eq.${tankId}` }, (payload) => {
    const row = payload.new as Record<string, unknown> | undefined
    if (row && 'id' in row) handlers.message(messageFromRow(row))
  })
  channel.on('presence', { event: 'sync' }, () => handlers.presence?.(new Set(Object.keys(channel.presenceState()))))

  // Broadcasts come from other members' phones: check their shape before using them.
  channel.on('broadcast', { event: 'poke' }, ({ payload }) => {
    const fishId = payload?.fishId
    const by = payload?.by
    if (typeof fishId === 'string' && fishId.length <= 64 && typeof by === 'string') handlers.poke({ fishId, by: by.slice(0, 24) })
  })
  channel.on('broadcast', { event: 'feed' }, ({ payload }) => {
    const x = Number(payload?.x)
    const seed = Number(payload?.seed)
    if (Number.isFinite(x) && x >= 0 && x <= 1 && Number.isInteger(seed)) handlers.feed({ x, seed })
  })

  let visible = !document.hidden
  let connected = false
  let dropped = false
  const announce = () => void channel.track({ since: new Date().toISOString() })

  channel.subscribe((status, error) => {
    if (status === 'SUBSCRIBED') {
      if (visible) announce()
      if (dropped) handlers.reconnected()
      connected = true
      dropped = false
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
      if (connected) dropped = true
      if (error) console.warn('Live connection problem:', status, error.message)
    }
  })

  return {
    setVisible(next) {
      visible = next
      if (!connected) return
      if (next) announce()
      else void channel.untrack()
    },
    poke(fishId, by) {
      if (connected) void channel.send({ type: 'broadcast', event: 'poke', payload: { fishId, by } })
    },
    feed(x, seed) {
      if (connected) void channel.send({ type: 'broadcast', event: 'feed', payload: { x, seed } })
    },
    close() {
      void client.removeChannel(channel)
    },
  }
}
