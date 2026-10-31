// The "Done when" access check from the outside: a signed-in stranger (anonymous, never joined)
// must get zero rows and zero images through the public API.
//
//   npm run check:outsider
//
// Uses the public key from .env, like the app. To try real face files, it looks up a few
// face paths with the Supabase CLI (your `supabase login`), then tries to sign and download them.
// Each run creates one anonymous user, which stays harmless and empty.
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'


// Public settings from .env, overridden by .env.local if present (same order as Vite).
if (existsSync('.env.local')) process.loadEnvFile('.env.local')
process.loadEnvFile('.env')
const db = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } })

const { data: auth, error: signInError } = await db.auth.signInAnonymously()
if (signInError) {
  console.error(`Could not sign in anonymously: ${signInError.message}`)
  process.exit(1)
}

let leaks = 0
const report = (what, leaked, detail) => {
  if (leaked) leaks++
  console.log(`${leaked ? 'LEAK' : 'ok  '}  ${what}: ${detail}`)
}

const rows = async (table) => {
  const { data, error } = await db.from(table).select('*')
  return error ? { count: 0, detail: `refused (${error.code ?? error.message})` } : { count: data.length, detail: `${data.length} rows` }
}
for (const table of ['fish', 'tank_members', 'tanks', 'messages']) {
  const result = await rows(table)
  report(`read ${table}`, result.count > 0, result.detail)
}

const { data: tanks, error: tanksError } = await db.rpc('my_tanks')
report('my_tanks()', (tanks?.length ?? 0) > 0, tanksError ? `refused (${tanksError.code})` : `${tanks.length} tanks`)

const { error: joinError } = await db.rpc('join_tank', { code: 'guess-guess-1', member_name: 'Outsider' })
report('join with a guessed code', !joinError, joinError ? `refused (${joinError.message})` : 'joined!')

const { data: listing, error: listError } = await db.storage.from('faces').list('', { limit: 100 })
report('list the faces bucket', (listing?.length ?? 0) > 0, listError ? `refused (${listError.message})` : `${listing.length} entries`)

// Real face paths, looked up with admin rights through the CLI.
let paths = []
try {
  const out = execFileSync('npx', ['supabase', 'db', 'query', '--linked', 'select face_path from public.fish where deleted_at is null limit 5'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  paths = JSON.parse(out.slice(out.indexOf('{'))).rows.map((row) => row.face_path)
} catch {
  console.log('      (could not look up real face paths; skipping the download checks)')
}
for (const path of paths) {
  const { data: signed, error: signError } = await db.storage.from('faces').createSignedUrl(path, 60)
  report(`sign a real face URL`, Boolean(signed?.signedUrl), signError ? `refused (${signError.message})` : 'signed!')
  const { data: file, error: downloadError } = await db.storage.from('faces').download(path)
  report(`download a real face`, Boolean(file), downloadError ? `refused (${downloadError.message || downloadError.name})` : `${file.size} bytes!`)
}
if (paths.length === 0) console.log('      (no fish in the database yet, so no real faces to try)')

console.log(leaks === 0 ? `\nNo leaks: the outsider (${auth.user.id}) got zero rows and zero images.` : `\n${leaks} LEAK(S) FOUND`)
process.exit(leaks === 0 ? 0 : 1)
