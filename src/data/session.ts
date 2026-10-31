import { db } from './supabase'

/** The signed-in user's id, if this browser already has a session. Doesn't touch the network. */
export async function currentUserId(): Promise<string | null> {
  const { data } = await db().auth.getSession()
  return data.session?.user.id ?? null
}

/**
 * Makes sure this browser is signed in, anonymously if needed: no email, no password. The session
 * lives in this browser only, so clearing site data or switching phones starts over.
 */
export async function ensureSignedIn(): Promise<string> {
  const existing = await currentUserId()
  if (existing) return existing
  const { data, error } = await db().auth.signInAnonymously()
  if (error || !data.user) throw error ?? new Error('Sign-in failed')
  return data.user.id
}
