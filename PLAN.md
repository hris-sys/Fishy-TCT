# Tankmates — Implementation Plan

Oct 31, 2026 · @Hristiyan

## Concept

Tankmates (working name) is a private, always-on aquarium for one friend group, where each friend is exactly one fish (or one school of fish) wearing their own face.

Open the invite link, line your face up in an oval, and pick one of five species. Name it, and it drops into the tank with a splash.

The tank is shared and live: new fish appear on every screen at once, and your fish is awake while you're online. Pokes and feeding show up for everyone watching.

It runs in any phone browser, installs to the home screen, and has a fullscreen TV mode for when you're all in one room. The joke is real photographic faces on simple cartoon bodies, so never stylize the faces.

## Key decisions

Every choice favors a working MVP in about two weeks of evenings; flexibility you don't need yet is deferred.

| Decision | Choice | Why |
| --- | --- | --- |
| Capture | Oval guide plus manual pan/zoom; no ML in v1 | Lining the face up at capture beats detecting it afterwards, with no model downloads |
| Processing | All in the browser; upload only a 256 px square crop | Re-encoding strips EXIF/GPS, files stay around 20–30 KB, and the original photo never leaves the phone |
| Face shape | Store the crop unmasked; each species masks it when drawing | Retune masks or switch species without reprocessing photos; no transparency, so JPEG works |
| Species | Data, not code: one config entry per species | A sixth fish is new art plus one config object |
| Multiplayer | Each client simulates its own tank; only fish data and events are shared | Syncing positions is the expensive part of multiplayer and adds nothing here |
| Ownership | One fish per person per tank; `tank_id` in the schema from day one. A schooling species draws several fish from that one row | "You are your fish" is the core identity; multi-tank costs one column now instead of a migration later |
| Access | Invite code → anonymous auth → Row Level Security; private storage bucket | Faces are personal data: no signup friction, and nobody without the code sees anything |
| Stack | Vite + TypeScript + PixiJS; tank engine as a framework-free module | WebGL masks, tint and filters at 60 fps on phones; build the UI screens in whatever you're fastest in, Angular included |
| Hosting | Vercel (frontend) + Supabase (Postgres, Storage, Auth, Realtime) | Free tiers cover a friend group, HTTPS is built in, and realtime needs no server of your own |

## The five fish

Each species gets its own silhouette, depth band and swim style, so the tank uses its full height instead of looking like a dozen identical fish.

| Fish | Face placement | Depth band | Swims | Tap reaction |
| --- | --- | --- | --- | --- |
| Blue chromis (school) | Round face on the head; one person is a school of 7, all with their face | Upper to middle | Tight school that turns together; scatters from sharks and regroups | The school scatters and regroups |
| Clownfish | Head, in front of the first white stripe | Low to middle, near the anemone | Quick darts, keeps returning to its anemone | Ducks into the anemone |
| Pufferfish | The face is the whole body | Low to middle | Slow bobbing | Puffs to 2× size with spikes |
| Reef shark | Front of the head | Whole tank | Fast, long patrols; other fish swerve away | Jaw snap and lunge |
| Anglerfish | Under the glowing lure | Bottom | Creeps along the sand | Lure flashes |

Swap any species freely, as long as the silhouettes stay distinct. (The goldfish was swapped for the chromis school in iteration 1: a school was wanted, and the goldfish was the only freshwater fish in a sea tank.)

## Architecture

Phones do all the image work and run the simulation; Supabase stores fish and faces and pushes changes to every open tank.

_(Diagram in the original doc: phone browser ↔ Supabase, with Vercel serving the app.)_

Each phone simulates its own tank, so only writes, reads and live events cross the wire. Vercel serves the app and runs the keep-alive.

Data model:

```
tanks         id, name, invite_code, owner_id
tank_members  tank_id, user_id, display_name          PK (tank_id, user_id)
fish          id, tank_id, owner_id, name, species, tint,
              face_path, face_blub_path, deleted_at, updated_at
              UNIQUE (tank_id, owner_id) WHERE deleted_at IS NULL
storage       private bucket "faces": {tank_id}/{owner_id}/{file}.webp|jpg
```

_As built: faces live under `{tank_id}/{owner_id}/` (a fresh file name per upload), so storage rules can check both membership and "your own folder", and a face can be uploaded before its row exists. The tank's owner is whoever joins it first. Policy helper functions live in a `private` schema the API doesn't expose._

Members read their tank's fish and faces, you write only your own fish, and the tank owner can remove any fish. Joining goes through a security-definer RPC that checks the invite code, so clients never read `tanks` directly. Storage policies use the first path segment (the tank id) and check membership.

| Realtime feature | Carries |
| --- | --- |
| Postgres Changes on `fish` | New, edited and soft-deleted fish |
| Presence | Who's online, which wakes their fish |
| Broadcast | Pokes and food drops |

## Setup and conventions

One repo, one Supabase project, and every iteration ends deployed to a real URL.

Suggested repo layout:

```
src/
  tank/        engine: scene, fish entity, steering, species loader (no framework imports)
  species/     one config file and art folder per species
  ui/          screens: join, capture, crop, species picker, edit fish
  data/        Supabase client, queries, realtime subscriptions
supabase/
  migrations/  schema, RLS and storage policies as SQL (Supabase CLI)
```

The frontend gets exactly two env vars: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. The service-role key never goes into the frontend or the repo.

Each species config holds these fields:

| Field | Holds |
| --- | --- |
| `id`, `label` | Slug and display name, e.g. `goldfish`, Goldfish |
| `body`, `tail` | Sprite paths, plus the tail's pivot point |
| `faceSlot` | Position, size and rotation of the face relative to the body |
| `mask` | Shape (circle, oval or custom path) and edge feather |
| `swim` | Speed, turn rate, depth band, wiggle frequency, and an optional school size |
| `reaction` | Name of the tap animation |

Working rules:

- Schema changes go through migrations in the repo, never by hand in the dashboard.
- RLS is tested with a second, non-member session, never only through the UI.
- Each iteration is a branch with a Vercel preview; merge when its "Done when" passes on a real phone.

## Iteration overview

Iterations 0–3 (roughly two weeks of evenings) end at the MVP gate; 4–6 add the live, social layer on top.

_(Roadmap in the original doc: 7 iterations, MVP gate after iteration 3.)_

Each iteration below has its own checklist and a "Done when" test. Don't start the next one until that test passes on a real phone.

## Iteration 0 · Skeleton, live (1 evening)

Goal: a real URL on your phone from day one.

- [x] Create the Vite + TypeScript + PixiJS repo and connect GitHub to Vercel, with a preview deploy per branch. _(Live at https://fishy-tct-wup5.vercel.app)_
- [x] Create the Supabase project and link it with the Supabase CLI; only the anon key reaches the client. _(Project ref `jtynlyyetesmggfnbyik`; client in `src/data/supabase.ts`.)_
- [x] Build a fullscreen canvas that handles resize and rotation, caps devicePixelRatio at 2, and pauses when the tab is hidden.

**Done when:** the URL shows an empty animated tank on iOS Safari and Android Chrome.

## Iteration 1 · The tank (2–3 evenings)

Goal: a tank that's pleasant to stare at, with placeholder faces.

- [x] Scene layers: gradient water, light rays, sand, swaying plants, bubbles and an anemone.
- [x] Species configs and placeholder art, with body and tail as separate layers and the face slot left empty. Kenney.nl's free CC0 packs or simple SVGs are fine for now. _(Hand-drawn SVGs in `src/species/<id>/`; placeholder cartoon faces until iteration 2.)_
- [x] Fish entity with a sine-driven tail wiggle and bob. Turn by tweening `scale.x` through 0; flip the body but never the face, or it jumps on every turn.
- [x] Movement from steering behaviors (wander, soft wall avoidance, light separation) inside each species' depth band. Other fish flee from nearby sharks.
- [x] A Tweakpane debug panel to tune species parameters live. _(Open with `?debug`; "Copy config" exports the tuned numbers.)_
- [x] Added after the first phone test: a schooling species (blue chromis, 7 fish per person, replacing the goldfish), a realism pass on fish and scenery (shaded bodies, depth tint, distant reef, rocks and corals, sand caustics, marine snow, surface shimmer), and all fish at half the size.

**Done when:** 15 placeholder fish swim for 5 minutes without clumping, jittering or escaping, at 60 fps on a mid-range phone.

_Headless soak test (5 simulated minutes, 15 people = 33 fish with three schools): no fish past an edge, schools stay within ~25 px of their middle, simulation about 0.2 ms per frame. Passed on a real phone (Oct 31, 2026); merged to main._

## Iteration 2 · Make your fish, local only (2–3 evenings)

Goal: photo to fish entirely in the browser, no backend yet.

- [x] Two file inputs: one with `capture="user"` that opens the front camera, and one without for the photo library. No camera code yet.
- [x] Crop screen with the photo behind the oval guide: drag to pan, pinch or slider to zoom, live preview.
- [x] Export through an offscreen canvas to a 256×256 square, as WebP with a JPEG fallback. Check the blob's actual type, because some browsers silently return PNG.
- [x] Species picker that shows your face on all five fish in a mini-tank, plus a name (up to 16 characters) and an optional body tint.
- [x] Tap any fish to show its name tag.
- [x] Drop-in animation: the fish falls from the surface with a splash and a burst of bubbles.

_UI screens are plain TypeScript (`src/ui/`), no framework. Photos are scaled to at most 2048 px on load; the face shown in the tank is the encoded file decoded again, so it matches what will be uploaded. Nothing is saved yet: a refresh forgets your fish until iteration 3._

**Done when:** a phone photo becomes a fish in under 30 s, and portrait, landscape and iPhone photos all come out upright and sit correctly in all five masks.

_Headless check: portrait, landscape and a sideways-stored photo with EXIF orientation 6 all export upright as 256 px WebP; drag, wheel, slider and two-finger pinch zoom verified with real input events. Passed on a real phone (Oct 31, 2026); merged to main._

## Iteration 3 · Private, persistent, shared: the MVP (2–3 evenings)

Goal: send the link to the group chat. Iterations 0–3 add up to roughly two weeks of evenings.

- [x] Schema, RLS and storage policies as migrations (see Architecture), with anonymous sign-ins enabled.
- [x] Join flow: `/join/{code}` → anonymous sign-in → join RPC → display name → create fish. Returning visitors land straight in the tank.
- [x] Upload the face and insert the fish row. On load, fetch the fish and sign all face URLs in one batch with `createSignedUrls`.
- [x] Edit your own fish (re-shoot, rename, change species) and delete it; the tank owner can remove anyone's.
- [x] Bucket limits: about 200 KB per file, WebP and JPEG only.
- [x] Seed your group's tank and keep the invite code out of the repo. _(`npm run tank:new -- "Name"`; the code exists only in the database and the link.)_

**Done when:** three friends on different phones each add a fish via the link and all see each other after a refresh. A non-member session gets zero rows and zero images when you query the API directly.

_Checks: `npm run db:check` plays owner, member, outsider and signed-out visitor in a rolled-back transaction (all pass). A headless end-to-end run with two people (join, add, refresh, owner removes, edit, remove) passed 18/18, and `npm run check:outsider` found no leaks with real faces in the bucket. Merged to main and passed with three people on different phones (Oct 31, 2026)._

## Iteration 4 · Live tank (1–2 evenings)

Goal: the tank feels inhabited.

- [x] Add `fish` to the realtime publication and subscribe filtered by tank. New fish splash in, edited fish change in place, and soft-deleted fish swim off-screen.
- [x] Presence: online friends' fish are bright and active, while offline ones slow down, sink a little and blow "z" bubbles.
- [x] Use a private channel (Realtime Authorization) so only members can join Presence and Broadcast.
- [x] Refetch the fish list on reconnect or when the tab comes back, to catch missed events.

_One private channel per tank, `tank:{tank_id}`, carries Postgres Changes and Presence (Broadcast joins it in iteration 5). Putting the app in the background counts as going offline. Note: the first private channel on a fresh project failed once with `MissingPartition` until Realtime created its daily message partitions; it has worked since._

**Done when:** a fish created on one phone appears on another within about 2 s, and closing the app on one phone puts its owner's fish to sleep on the other.

_Headless end-to-end with two browsers against the real project: a new fish appeared on the other screen 1.5 s after tapping Drop it in (upload included); backgrounding put that person's fish to sleep in ~3.4 s and waking took ~3.9 s; a species change, an owner removal and a change missed while disconnected all came through. Outsiders are refused the channel. Still to confirm on real phones._

## Iteration 5 · Play (2–3 evenings)

Goal: reasons to open it every day.

- [ ] Tap reactions per species, as listed in the five fish table.
- [ ] Pokes: tapping a friend's fish plays its reaction on every open screen, with an "A poked B" toast sent over Broadcast.
- [ ] Feeding: tap the surface to drop flakes and nearby fish race for them. Drops are broadcast so everyone sees the same feeding.
- [ ] Blub mode: an optional second photo with an "O" mouth, stored as `face_blub_path`. Fish switch between the two faces while eating or when poked.
- [ ] Sound: bubbles and splashes, off until the first tap because of mobile autoplay rules, plus a mute toggle.

**Done when:** a poke or a feed on one phone shows up on the others in under a second.

## Iteration 6 · Polish and keep-alive (1–2 evenings)

Goal: it still works in three months without babysitting.

- [ ] Web app manifest and icons for home-screen install.
- [ ] TV mode (`?tv=1`): no UI, rotating name tags, bigger fish.
- [ ] Live camera with getUserMedia, the oval overlay and a 3-2-1 countdown, keeping file upload as the fallback.
- [ ] Error states for camera denied, upload failed and a bad invite link.
- [ ] A daily keep-alive job that runs a real database query, plus a regular `pg_dump` backup.
- [ ] Stress test with 30 fish, and pack the species art into a texture atlas.

**Done when:** it installs on iOS and Android, survives a week of nobody opening it, and a new friend joins without you explaining anything.

## Gotchas

Four known traps, each already handled in the plan.

- Free-tier pausing: Supabase pauses free projects after 7 days of low database activity, and a few real queries a day prevent it ([Supabase docs](https://supabase.com/docs/guides/platform/free-project-pausing)). The keep-alive must query a table, not just ping an auth endpoint.
- Realtime deletes: Postgres Changes can't filter DELETE events, so the schema soft-deletes with `deleted_at` and removals arrive as filterable UPDATEs. Remove the image through the Storage API at the same time; deleting `storage.objects` rows in SQL leaves the file behind.
- Anonymous sessions live in one browser: clearing site data or switching phones loses control of your fish. Fine for v1; later, let people link an email to their anonymous account.
- The live camera needs HTTPS: getUserMedia only works in a secure context, so test on phones through the Vercel preview URL, not your local network IP.

## Backlog

Next ideas after iteration 6, roughly in order of fun per effort.

- MediaPipe face detection to auto-center the crop.
- Selfie segmentation to replace the oval with a real head cutout.
- A day/night cycle on local time, where the anglerfish lights up the dark tank.
- Hats and glasses layered on the face slot.
- Seasonal decorations.
- A button to share a snapshot of the tank.
