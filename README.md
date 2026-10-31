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
3. Copy `.env.example` to `.env.local` and fill in the project URL and the public key from **Project Settings → API**. Use the anon key, or the publishable key (`sb_publishable_…`) if that's what the dashboard shows.
4. Add the same two variables in **Vercel → Project → Settings → Environment Variables**.

The service-role / secret key never goes into the frontend, `.env.local` or the repo.

5. Turn on **Authentication → Sign In / Providers → Allow anonymous sign-ins**. Joining needs it.

Schema changes go through `supabase/migrations/` (`npx supabase migration new <name>`, then `npm run db:push`), never by hand in the dashboard.

Database scripts (they use your `supabase login`; no keys needed):

- `npm run db:push` applies new migrations to the linked project.
- `npm run db:check` runs `supabase/tests/access.sql`: an owner, a member, an outsider and a signed-out visitor try everything, inside a transaction that is rolled back.
- `npm run check:outsider` signs in as a stranger through the public API and confirms they get zero rows and zero face images.
- `npm run tank:new -- "Tank name"` creates a tank with a random invite code and prints its link. The code is never stored in the repo.

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
