# Espresso Shot Tracker

Log espresso shots (what you controlled, what came out), review them over time,
and get on-demand advice on what to change next. Pour videos are attached to each
shot for future computer-vision analysis.

**Live app:** https://espressotracker-pearl.vercel.app (Google sign-in required)

Everything is behind login and each user's data is isolated to them, enforced in
the database with Postgres Row-Level Security rather than by application code.

## Features

**Log a shot**
- Grind setting (free text), dose in, yield out, pull time - the required core
- Bean/origin, roast date, rating, and a tasting note - all optional, never block save
- Attach a pour video recorded on your phone (uploaded straight to storage, kept untouched)
- A new shot starts as a copy of the bag's last shot, so logging is mostly nudging what changed

**Review**
- Reverse-chronological shot list, grouped under a heading per bag (bean + roast date)
- A dialed / dialing tag on each bag, judged against your targets when set and against
  shot-to-shot convergence otherwise
- Shot detail page with full field readout and video playback

**Dial-in targets** (optional, per bag)
- A target brew ratio (1:2 / 1:2.5 / 1:3, adjustable by 0.1)
- A target pull-time window (low/high seconds)
- Shown against each shot's actual numbers, drawn as goal lines on the trends charts,
  and used by the dialed tag and the barista assistant

**Trends**
- Ratio against pull time, pull-time consistency, and rating over a bag
- Computed client-side from your shots, drawn as hand-made SVG (no charting library)

**Barista assistant**
- On the shot detail page, "Analyze this shot" sends the shot, up to 8 prior same-bag
  shots, and the bag's targets to an LLM (Groq) and returns a diagnosis plus a single
  adjustment - or "dialed, repeat it"
- Runs in a Supabase Edge Function so the API key stays server-side, never in the browser
- Result is saved per shot as a historical record

## Stack

| Layer | Choice |
| --- | --- |
| Frontend | React 18 + Vite, TypeScript, React Router, Tailwind v4. Client-side SPA, no SSR. |
| Backend | Supabase (Postgres, Auth, Storage, Row-Level Security), free tier. No custom API layer - the frontend talks to Supabase directly. |
| Serverless | One Supabase Edge Function (`analyze-shot`) for the barista assistant. |
| Auth | Google OAuth via Supabase Auth. |
| Hosting | Vercel (static deploy, auto-redeploy on push to `main`). |

Why this shape: everything is behind login, so there is no SEO or public-content
need for a server. RLS enforces per-user isolation inside the database, so
correctness does not depend on every query remembering a `WHERE user_id` clause.
Full rationale in [`docs/mvp-design.md`](docs/mvp-design.md).

## Running locally

Prerequisites: Node 20 or newer, and a Supabase project (the free tier is enough).

```bash
git clone https://github.com/visva-murali/espresso_tracker.git
cd espresso_tracker
npm install
cp .env.example .env      # then fill in the two VITE_SUPABASE_* values
npm run dev
```

`.env` needs your Supabase project URL and anon key (Supabase dashboard:
Settings > API). `.env` is gitignored and must be recreated in every checkout.

```bash
npm test          # unit tests (Vitest)
npm run build     # type-check and production build
```

The integration tests under `tests/integration/` (RLS enforcement, the
`analyze-shot` history filter) run against a local Supabase instance started with
`npx supabase start` (needs Docker), not the hosted project. They need
`SUPABASE_LOCAL_SERVICE_ROLE_KEY` set - see `.env.example`.

## Supabase setup

To point a checkout at your own Supabase project:

1. Create the project, enable the Google auth provider.
2. Apply the schema: `npx supabase db push` (or `supabase migration up` locally).
   Migrations live in `supabase/migrations/` and create the `shots`, `videos`,
   `shot_analyses`, and `bag_targets` tables, all four with RLS, plus the storage
   bucket and its policies.
3. For the barista assistant, deploy the Edge Function and give it a Groq key:
   ```bash
   supabase functions deploy analyze-shot
   supabase secrets set GROQ_API_KEY=...   # from https://console.groq.com/keys
   ```
   See `supabase/functions/analyze-shot/.env.example` for the optional
   `GROQ_MODEL` / `GROQ_BASE_URL` settings.

After a merge to `main` that adds a migration or changes `supabase/functions/`,
run `npm run deploy:supabase` from the main checkout (the frontend redeploys on
its own via Vercel, the database and functions do not).

## Project layout

```
src/
  pages/        route components (shot list, new, detail, edit, trends, login)
  components/   form controls, shot-display pieces, the assistant panel
  lib/          Supabase data access and view logic (shots, videos, analyses,
                bagTargets, shotView, chartScale, format)
  context/      auth context
supabase/
  migrations/   the full schema, in order
  functions/    the analyze-shot Edge Function
docs/           spec, design, and rationale (see below)
```

## Documentation

| Document | What it covers |
| --- | --- |
| [`docs/mvp_spec.md`](docs/mvp_spec.md) | Product vision and the full Phase 2-7 roadmap |
| [`docs/mvp-design.md`](docs/mvp-design.md) | v1 architecture, the schema, and the stack trade-offs |
| [`docs/barista-assistant-design.md`](docs/barista-assistant-design.md) | How the assistant reads a shot and builds its prompt |
| [`docs/target-ratio-design.md`](docs/target-ratio-design.md) | Per-bag target ratio |
| [`docs/target-pull-time-design.md`](docs/target-pull-time-design.md) | Per-bag target pull-time window |
| [`docs/design/`](docs/design/) | The visual design schema (tokens, components, screen specs) |
| [`CLAUDE.md`](CLAUDE.md) | Working conventions and a condensed version of the above |

## Status

v1 is implemented and deployed. Current work is Phase 2: trends, the barista
assistant, and per-bag targets are in; computer-vision analysis of the pour
videos is the next major phase. Full roadmap in [`docs/mvp_spec.md`](docs/mvp_spec.md).

## License

[MIT](LICENSE)
