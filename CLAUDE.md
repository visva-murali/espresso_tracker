# CLAUDE.md

## What this is

Espresso Shot Tracker - a web app for logging espresso shots (inputs like
grind/dose, outputs like yield/time) and reviewing them over time, with pour
videos attached for future computer-vision analysis. Full vision and
roadmap: `docs/mvp_spec.md`. Full v1 design and rationale:
`docs/mvp-design.md`.

## Status

v1 implemented and deployed.

## Stack

- Backend: Supabase (Postgres + Auth + Storage + Row-Level Security), free
  tier. No custom backend/API layer - the frontend talks to Supabase
  directly.
- Frontend: React + Vite, client-side SPA, no server-side rendering.
- Hosting: Vercel (static deploy).
- Auth: Google OAuth via Supabase Auth.

Why this stack: everything's behind login (no SEO/public-content need for
SSR), and RLS enforces per-user isolation inside the database instead of
relying on every app query getting a `WHERE user_id` clause right. Full
trade-off discussion in `docs/mvp-design.md`.

## Deploying

The frontend redeploys automatically on push to `main` (Vercel). The
database and Edge Functions do not: after a merge that adds a migration
or changes `supabase/functions/`, run `npm run deploy:supabase` from the
main checkout (`supabase db push` then `supabase functions deploy
analyze-shot`). It prompts before applying, so read what it lists.
Function env vars (`GROQ_API_KEY` etc.) are set once with
`supabase secrets set` and are not part of this script.

## Data model

- `shots`: one row per logged shot. `user_id`, `grind_setting` (text),
  `dose_g`, `yield_g`, `pull_time_s` (all required), `bean_name`,
  `roast_date`, `rating`, `tasting_note` (all optional), `created_at`,
  `updated_at`.
- `videos`: one row per uploaded pour video, referencing `shots.id` (unique,
  1:1 for v1). Its own table, not columns on `shots`, so Phase 2 CV analysis
  can attach data to `videos.id` without touching `shots`. Holds
  `storage_key`, `content_type`, `size_bytes`, `uploaded_at`, and a
  denormalized `user_id` for simpler RLS.
- `shot_analyses`: one row per shot (unique `shot_id`, 1:1), holding
  the barista assistant's `diagnosis`, `adjustment`, the `model` that
  produced them, and `history_count`. Denormalized `user_id` for RLS,
  mirroring `videos`. Written only by the `analyze-shot` Edge Function.
- `bag_targets`: optional per-bag target brew ratio. One row per bag,
  keyed by `user_id` + `bean_name` + `roast_date` (the same pairing
  `groupShotsByBag` uses), plus a `target_ratio` numeric. No row means
  the bag has no target. Set only from the shot form (New or Edit),
  persisted when the shot is saved.
- RLS on all four tables restricts every operation to `user_id = auth.uid()`.
  Storage bucket policies mirror the same rule against the key prefix
  (`{user_id}/{shot_id}/{uuid}.{ext}`).
- The shot list's dialed/dialing tag (`src/lib/shotView.ts` `bagState`)
  compares the last two shots to the bag's `target_ratio` when one is
  set, and falls back to shot-to-shot ratio convergence when it is not.
- No `profiles` table in v1 - nothing needs app-specific user data beyond
  `auth.users`.
- `bean_name` and `roast_date` are plain fields on `shots`, not a normalized
  reusable `beans` table - no autocomplete/reuse in v1, that's scope beyond
  the spec.
- `grind_setting` is free-text, not numeric - grinder conventions vary too
  much to constrain.

## Video handling

- Upload via file picker (user records with their phone's native camera
  app), not in-browser recording.
- Direct-to-storage upload using a signed URL from Supabase Storage,
  requested client-side.
- Original video preserved untouched, no transcoding in v1.
- Soft cap: 3 minutes / 500MB, to catch accidental uploads, not to
  constrain real pours.
- Known limitation: some phone video formats (HEVC-in-.mov) may not play
  back in every browser.

## Barista assistant

On-demand shot troubleshooting on the shot detail page. The
`analyze-shot` Supabase Edge Function reads the shot plus up to 8 prior
same-bag shots through the caller's JWT (RLS enforces ownership), calls
Groq (free tier, key held server-side in the function's env, never in
the client), and upserts a `shot_analyses` row. Design and rationale:
`docs/barista-assistant-design.md`. No CV dependency; this is Phase 2
piece B from `docs/mvp_spec.md`.

## Definition of done for v1

Full checklist in `docs/mvp-design.md` section 1. Summary: sign up/log in,
log a shot in under 30 seconds (data-entry time, not pull time), edit/delete
shots, see a shot list, open a shot with video playback, data persists
across devices, and one user's data is never visible to another including
via URL tampering - that last one needs an explicit test, not just trust in
RLS.

## Explicitly out of scope for v1

CV analysis of pour video, recommendations/ML, social features, milk
steaming/latte art, hardware integration. Full roadmap in
`docs/mvp_spec.md`.

## Working conventions

- No em dashes anywhere in written output (code comments, docs, commit
  messages, chat responses) - use a regular hyphen or restructure the
  sentence instead.
- Do not estimate or emphasize how long development will take. Scope and
  correctness matter here, not speed of delivery - leave time estimates out
  of plans, docs, and status updates.

## For subagents

This file plus `docs/mvp_spec.md` and `docs/mvp-design.md` cover all
standing project context: why decisions were made, the full schema, the
full roadmap. A subagent given a specific implementation task should still
be handed that task's detail directly from the implementation plan, not
expected to infer it from these docs alone.
