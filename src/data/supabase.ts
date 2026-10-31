import { type SupabaseClient, createClient } from '@supabase/supabase-js'

let client: SupabaseClient | null = null

/**
 * The Supabase client, created on first use. Only the public anon/publishable key ever reaches the
 * browser; Row Level Security does the protecting.
 */
export function db(): SupabaseClient {
  if (client) return client
  const url = import.meta.env.VITE_SUPABASE_URL
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to .env.local and fill them in.')
  }
  client = createClient(url, anonKey)
  return client
}
