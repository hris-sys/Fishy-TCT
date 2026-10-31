import { type FishRecord, fromRow } from './fish'
import { db } from './supabase'

export interface LiveHandlers {
  /** A fish was added, changed or removed (removals arrive with `deletedAt` set). */
  fish(record: FishRecord): void
  /** Who's in the tank right now, as user ids. */
  presence(online: Set<string>): void
  /** The connection came back after dropping, so some changes may have been missed. */
  reconnected(): void
}

export interface LiveTank {
  /** Shows you as online (app open) or offline (app in the background). */
  setVisible(visible: boolean): void
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
  const channel = client.channel(`tank:${tankId}`, { config: { private: true, presence: { key: userId } } })

  channel.on('postgres_changes', { event: '*', schema: 'public', table: 'fish', filter: `tank_id=eq.${tankId}` }, (payload) => {
    const row = payload.new as Record<string, unknown> | undefined
    if (row && 'id' in row) handlers.fish(fromRow(row))
  })
  channel.on('presence', { event: 'sync' }, () => handlers.presence(new Set(Object.keys(channel.presenceState()))))

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
    close() {
      void client.removeChannel(channel)
    },
  }
}
