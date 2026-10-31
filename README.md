# Tankmates

A private, always-on aquarium for one friend group: each friend is one fish wearing their own face. The full plan and iteration checklists are in [PLAN.md](PLAN.md).

Stack: Vite + TypeScript + PixiJS, hosted on Vercel, with Supabase for Postgres, Storage, Auth and Realtime.

Live: https://fishy-tct-wup5.vercel.app (add `?debug` for an FPS readout)

## Run it locally

```sh
npm install
npm run dev            # http://localhost:5173
npm run dev -- --host  # also reachable from your phone on the same Wi-Fi
```

Opening the app:

- `/join/{code}` is an invite link: pick a name, join, add your fish. The first person to open a new tank's link owns it.
- `/` takes returning visitors straight into their tank; everyone else sees "invite-only".

On a phone, add it to the home screen from the menu (⋯, top right). On an iPhone, the Home Screen app keeps its own sign-in, separate from Safari, so the menu shows a one-time code to type into it; the same code moves you to a new phone ("Use on another device"). For a TV or big screen, open the invite link with `?tv=1` on the end (join under a name like "Living room TV"); after that, `/?tv=1` shows the tank with bigger fish, rotating name tags and no buttons.

In the tank: tap a fish to poke it (everyone sees it react), tap near the surface to feed, and press and hold someone's fish to remove it if you own the tank. The speaker button in the corner mutes sounds.

URL options:

- `?debug` shows an FPS readout and the **Tune** panel for live species tuning. **Copy config** puts the tuned numbers on the clipboard, ready to paste into `src/species/<id>/config.ts`.
- `?demo` runs the tank on this device only, with stand-in fish and nothing saved.
- `?fish=30` adds that many placeholder people (default 10 in demo, 0 otherwise). Chromis people are a school of 7 fish each.

`npm run build` typechecks and builds to `dist/`. `npm run typecheck` only typechecks.

## One-time setup

### GitHub + Vercel

1. Create an empty GitHub repo and push this folder to it.
2. In Vercel, choose **Add New → Project** and import the repo. It detects Vite on its own (build `npm run build`, output `dist`).
3. Every branch you push now gets its own preview URL. Test on phones through those URLs, because the camera (iteration 6) only works over HTTPS.

### Supabase

1. Create a project at [supabase.com](https://supabase.com) (free tier).
2. Link this repo to it:
   ```sh
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   ```
3. The project URL and publishable key live in the committed `.env` file. Both are public by design (every visitor's browser receives them; Row Level Security protects the data), so Vercel needs no environment variables. To point a local copy at another project, put different values in `.env.local`, which overrides `.env` and stays out of git.

The service-role / secret key never goes into the frontend, any `.env` file or the repo.

4. Turn on **Authentication → Sign In / Providers → Allow anonymous sign-ins**. Joining needs it.

Schema changes go through `supabase/migrations/` (`npx supabase migration new <name>`, then `npm run db:push`), never by hand in the dashboard.

Database scripts (they use your `supabase login`; no keys needed):

- `npm run db:push` applies new migrations to the linked project.
- `npm run db:check` runs `supabase/tests/access.sql`: an owner, a member, an outsider and a signed-out visitor try everything, inside a transaction that is rolled back.
- `npm run check:outsider` signs in as a stranger through the public API and confirms they get zero rows and zero face images.
- `npm run tank:new -- "Tank name"` creates a tank with a random invite code and prints its link. The code is never stored in the repo.

## Keeping it running

- **Keep-alive.** Supabase pauses free projects after about a week without database activity. Vercel Cron calls `/api/keepalive` every day (see `vercel.json`), which runs a real query through `keepalive()`.
- **Backups.** `.github/workflows/backup.yml` dumps the schema and data every Sunday, encrypts them and keeps each file for 90 days (Actions → Database backup → Artifacts). It's off until you add two repository secrets: `SUPABASE_DB_URL` (Supabase → Connect → Session pooler connection string, with your database password) and `BACKUP_PASSPHRASE` (any long passphrase; keep it safe). Face photos live in Storage and aren't included. To read a backup: `gpg -d tankmates-DATE.tgz.gpg > backup.tgz && tar xzf backup.tgz`, then load `schema.sql` and `data.sql` with `psql`.

## Layout

```
src/
  tank/      engine: PixiJS scene, no UI framework imports
  species/   one folder per species: config.ts plus body/tail art
  ui/        screens and overlays
  data/      Supabase client, queries, realtime
supabase/
  config.toml
  migrations/
```
