import { db } from './supabase'

export interface MyTank {
  id: string
  name: string
  inviteCode: string
  isOwner: boolean
  /** Your name in this tank. */
  displayName: string
}

/** The tanks you're in, oldest first. Tanks are only ever read through these functions. */
export async function myTanks(): Promise<MyTank[]> {
  const { data, error } = await db().rpc('my_tanks')
  if (error) throw error
  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: String(row.id),
    name: String(row.name),
    inviteCode: String(row.invite_code),
    isOwner: Boolean(row.is_owner),
    displayName: String(row.display_name),
  }))
}

/** The name of the tank behind an invite code, or null if the code is wrong. */
export async function inviteTankName(code: string): Promise<string | null> {
  const { data, error } = await db().rpc('invite_tank_name', { code })
  if (error) throw error
  return typeof data === 'string' ? data : null
}

/** Joins (or renames you in) the tank behind an invite code. The first person to join owns it. */
export async function joinTank(code: string, name: string): Promise<string> {
  const { data, error } = await db().rpc('join_tank', { code, member_name: name })
  if (error) throw error
  return String(data)
}
