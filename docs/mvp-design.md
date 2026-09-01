# Espresso Shot Tracker — MVP Design

Elaborates on [`mvp_spec.md`](./mvp_spec.md), resolving its three open questions
(done criteria, video storage, tech stack) and locking in the v1 architecture.

Status: agreed and implemented.

---

## 1. Definition of "done" for v1

A v1 MVP is done when a signed-up user can, end-to-end:

1. **Sign up / log in** (Google OAuth) and land in an account only they can see
   data for.
2. **Log a shot** in under 30 seconds from a phone — this is a data-entry UX
   target, not a limit on shot duration. Required core fields: grind setting,
   dose (g), yield (g), pull time (s, any value, uncapped). Bean/origin, roast
   date, rating, tasting note, and a pour video are all optional and never
   block save.
3. **Edit or delete** any past shot they logged.
4. **See a reverse-chronological list** of their own past shots (pagination
   is fine; no filtering/sorting required for v1).
5. **Open a single shot** and see every field, including video playback if
   one was attached.
6. **Log in from a different device** (or after clearing local state) and see
   the exact same data — proves persistence is server-side under their
   account, not local-only.
7. **Never see another user's data**, including via URL/ID tampering — this
   is an authorization test, not just a UI-hiding test, and should be
   verified explicitly (see RLS in §3).

Video uploads accept a generous soft cap — default **3 minutes / 500MB** —
purely to catch accidental uploads of the wrong file, not to constrain real
pours (a bad, channeling shot can legitimately run 45–90s+).

---

## 2. Video storage & linking

- **Video is its own entity** (`videos` table, §4), not columns on `shots`.
  Even though v1 is one video per shot, this means Phase 2 (CV analysis) adds
  a new table referencing `videos.id` for derived data — flow curves,
  extracted frames, channeling flags — with zero changes to `shots` or
  existing queries.
- **Storage location:** Supabase Storage (S3-compatible object storage), not
  the database. The `videos` row stores a key/reference and metadata, never
  the bytes.
- **Upload path:** direct-to-storage via a signed upload URL scoped to the
  user, requested through the Supabase client SDK from the browser. No app
  server sits in the request path for large file bodies.
- **Playback path:** signed, time-limited GET URLs, generated on demand and
  gated by the same RLS/storage policy as everything else — never a
  permanent public URL.
- **Key structure:** `{user_id}/{shot_id}/{uuid}.{ext}` — namespaced per
  user, so a future "export/delete all my data" is a prefix operation.
- **No transcoding in v1** — original bytes are preserved untouched, per the
  decision to keep full fidelity for future CV work. Known limitation: some
  phone-recorded formats (HEVC-in-.mov) don't play back in every browser
  (inconsistent in Chrome/Firefox; fine in Safari). Uploaded successfully and
  plays back for you can diverge occasionally in v1 — not fixed now, worth
  a compressed-preview follow-up in Phase 2 if it's a real pain point.

---

## 3. Architecture

**Backend: Supabase** (Postgres + Auth + Storage + Row-Level Security), free
tier.

- RLS enforces per-user isolation *inside the database*, not just in app
  code — the "never see another user's data" requirement holds even if a
  query forgets a `WHERE user_id = ...` clause. Storage bucket policies
  mirror the same rule against the key prefix.
- No custom backend/API layer for v1. The frontend talks to Supabase
  directly via its JS SDK (auth, queries, signed URLs) — nothing to host or
  keep in sync as a separate service. If a genuine server-side-only need
  shows up later (e.g. a Phase 2 webhook receiver), that's a small
  standalone function added at that point, not a reason to add a framework
  server now.
- Chosen over a hand-rolled backend (more code, isolation only as strong as
  the weakest query) and over Firebase (Firestore's document model is an
  awkward fit for relational/aggregate queries across shots, beans, and
  future video-analysis records — Postgres is the better fit here and for
  Phase 2/3).

**Frontend: React + Vite**, pure client-side SPA, no server-side rendering.

- The app has zero public/SEO surface (everything's behind login), which
  removes the usual reason to reach for a framework with SSR (Next.js,
  SvelteKit). A plain SPA is the least infrastructure for the same result.
- Deployed as a static build to **Vercel** (free tier, GitHub-push-to-deploy,
  preview deployments per branch).

**Auth: Google OAuth** via Supabase Auth. One-tap login on a device already
signed into Google; no password to manage or reset flow to build.

**Responsive design:** one codebase serves both mobile and desktop — no
separate mobile app, no separate mobile-specific routes. Exact styling
approach (e.g. Tailwind) is an implementation detail for the build plan, not
an architectural decision.

---

## 4. Data model

### `shots`

| column | type | notes |
|---|---|---|
| id | uuid, pk | |
| user_id | uuid, references `auth.users(id)` | RLS key |
| grind_setting | text | free-text — grinder conventions vary too much to constrain (integer dials, fractional/stepped notations) |
| dose_g | numeric, not null | |
| yield_g | numeric, not null | |
| pull_time_s | numeric, not null | uncapped |
| bean_name | text, nullable | inline field, not a normalized/reusable `beans` table — no autocomplete/reuse in v1; that's new scope beyond the spec, cheap to add via migration later if it starts to matter |
| roast_date | date, nullable | |
| rating | smallint, nullable | independently optional from tasting_note, not exclusive |
| tasting_note | text, nullable | |
| created_at | timestamptz, default now() | |
| updated_at | timestamptz, default now() | bumped on edit |

### `videos`

| column | type | notes |
|---|---|---|
| id | uuid, pk | |
| shot_id | uuid, references `shots(id)`, unique | 1:1 for v1; own table so Phase 2 can add analysis tables off `videos.id` without touching `shots` |
| user_id | uuid, references `auth.users(id)` | denormalized from `shots` so the RLS policy on `videos` checks `user_id = auth.uid()` directly, no join needed |
| storage_key | text | bucket path, see §2 |
| content_type | text | |
| size_bytes | bigint | |
| uploaded_at | timestamptz, default now() | |

**RLS policies** (both tables, and mirrored on the storage bucket): every
operation restricted to `user_id = auth.uid()`.

No `profiles` table in v1 — nothing in the app needs app-specific user data
beyond what `auth.users` already holds.

---

## 5. Out of scope for v1 (unchanged from spec)

CV analysis of pour video, any recommendations/ML, social features, milk
steaming/latte art modules, hardware integration. See `mvp_spec.md` for the
full roadmap.

---

## 6. Open items for the implementation plan

- Concrete styling approach (Tailwind vs. plain CSS vs. a component
  library) and how mobile/desktop breakpoints are handled.
- Exact Supabase project setup steps (RLS policy SQL, storage bucket
  config, Google OAuth app registration).
- Client-side video file-size/duration validation before upload starts
  (the 3min/500MB soft cap from §1).
- Test plan for the cross-user isolation requirement (item 7 in §1) —
  needs an explicit test, not just implicit trust in RLS.
