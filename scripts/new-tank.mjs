// Creates a tank with a fresh random invite code and prints its join link. The code exists only in
// the database and in that link, never in the repo. Uses your `supabase login`; no keys needed.
//
//   npm run tank:new -- "Tank name"
//   npm run tank:new -- "Tank name" https://my-preview.vercel.app
//
// Whoever opens the link first becomes the tank's owner, so open it yourself before sharing it.
import { execFileSync } from 'node:child_process'
import { randomInt } from 'node:crypto'

const name = (process.argv[2] ?? '').trim()
const appUrl = (process.argv[3] ?? process.env.APP_URL ?? 'https://fishy-tct-wup5.vercel.app').replace(/\/$/, '')
if (!name || name.length > 40) {
  console.error('Usage: npm run tank:new -- "Tank name (1-40 characters)" [app url]')
  process.exit(1)
}

// No look-alike characters (0/o, 1/l/i), so the link survives being read out loud.
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'
const code = Array.from({ length: 12 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('')
const quote = (text) => `'${text.replaceAll("'", "''")}'`

execFileSync('npx', ['supabase', 'db', 'query', '--linked', `insert into public.tanks (name, invite_code) values (${quote(name)}, ${quote(code)})`], {
  stdio: ['ignore', 'ignore', 'inherit'],
})
console.log(`Created "${name}". Invite link:\n${appUrl}/join/${code}`)
