# Tankmates

- PLAN.md is the source of truth: concept, decisions, data model and per-iteration checklists. Tick checklist items there as they're done.
- Work one iteration at a time. Don't start the next one until the current "Done when" test has passed on a real phone (the user confirms this).
- `src/tank/` is the engine and must stay free of UI framework imports.
- Never stylize the faces; the joke is real photos on cartoon bodies.
- Schema, RLS and storage policies only change through `supabase/migrations/`.
- Only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` reach the frontend. Never the service-role key.
- Check work with `npm run build` (typecheck + build).
