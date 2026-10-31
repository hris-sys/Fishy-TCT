import { db } from './supabase'

/** Longest chat message, in characters (the database enforces it too). */
export const MESSAGE_MAX = 200
const HISTORY = 50
const COLUMNS = 'id, tank_id, author_id, author_name, body, created_at'

export interface ChatMessage {
  id: string
  tankId: string
  authorId: string
  /** The author's name in the tank when they wrote it (set by the database, not the sender). */
  authorName: string
  body: string
  createdAt: string
}

export function messageFromRow(row: Record<string, unknown>): ChatMessage {
  return {
    id: String(row.id),
    tankId: String(row.tank_id),
    authorId: String(row.author_id),
    authorName: String(row.author_name),
    body: String(row.body),
    createdAt: String(row.created_at),
  }
}

/** The latest messages in a tank, oldest first. */
export async function listMessages(tankId: string): Promise<ChatMessage[]> {
  const { data, error } = await db().from('messages').select(COLUMNS).eq('tank_id', tankId).order('created_at', { ascending: false }).limit(HISTORY)
  if (error) throw error
  return (data ?? []).map(messageFromRow).reverse()
}

export async function sendMessage(tankId: string, body: string): Promise<ChatMessage> {
  const { data, error } = await db().from('messages').insert({ tank_id: tankId, body: body.slice(0, MESSAGE_MAX) }).select(COLUMNS).single()
  if (error) throw error
  return messageFromRow(data)
}
