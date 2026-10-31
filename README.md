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

URL options:

- `?debug` shows an FPS readout and the **Tune** panel for live species tuning. **Copy config** puts the tuned numbers on the clipboard, ready to paste into `src/species/<id>/config.ts`.
- `?fish=30` sets how many placeholder people swim (default 10). Chromis people are a school of 7 fish each.

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

Schema changes go through `supabase/migrations/` (`npx supabase migration new <name>`, then `npx supabase db push`), never by hand in the dashboard.

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
