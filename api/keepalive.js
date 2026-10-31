// Daily keep-alive, run by Vercel Cron (see vercel.json). Supabase pauses free projects after about
// a week without database activity; this runs a real table query through the public API.
// The URL and publishable key are public (the same values as in .env).
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://jtynlyyetesmggfnbyik.supabase.co'
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_L0T4QjazByigTyOFfKG2Ug_NZrY59ll'

export async function GET() {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/keepalive`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, 'content-type': 'application/json' },
    body: '{}',
  })
  const ok = response.ok && (await response.json()) === true
  return Response.json({ ok, status: response.status, at: new Date().toISOString() }, { status: ok ? 200 : 502 })
}
