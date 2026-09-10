# Espresso Shot Tracker - Project Spec

## Vision
A tool for dialing in espresso shots by logging inputs (grind, dose) against outputs (yield, time), paired eventually with computer-vision analysis of the pour itself - growing into a broader coffee companion (milk steaming, latte art) that other espresso lovers can use too.

---

## MVP (v1)

### Core Loop
Log what you controlled, measure what came out, see the pattern over time:
- **Inputs:** grind setting, dose (g in)
- **Outputs:** yield (g out), pull time (s)
- **Context:** bean/origin, roast date, rating or tasting note - all optional
- **Media:** a video of the pour, attached to the shot record (stored, not yet analyzed)

### Who it's for
Multi-user from day one - anyone can sign up and get their own private shot log. This is just auth + a `user_id` on the data, not a "feature" to build later. No sharing, feeds, or social features in v1; everyone's data is isolated to them.

### What "done" looks like for v1
*(Still open - worth nailing down before build starts.)* Rough shape: log a shot in under 30 seconds from a phone, see a list of past shots, and the data is still there tomorrow from any device.

### Explicitly Out of Scope for v1
- Any CV analysis of the pour video (channeling detection, flow/color curves)
- Recommendations or ML of any kind
- Social features - friend connections, shared feeds, leaderboards
- Milk steaming or latte art modules
- Hardware/grinder integration

---

## Future Roadmap

### Phase 2 - Make the Data Work For You
Two independent pieces, on a design-foundation pass first. All decided in a 2026-09-01 planning conversation, reordering CV ahead of the original roadmap (see reasoning below).

**0. Design foundation:** a complete visual and structural schema for the app, specified in `docs/design/` - tokens (color, type, spacing), an app-specific component vocabulary, layout rules, and full high-fidelity specs for the shot list, log-a-shot, and shot detail screens plus the new trends screen. Originally scoped narrower (tokens and a handful of primitives only, deferring a retrofit of existing v1 pages) but widened in a 2026-09-04 planning conversation, once the schema was already drafted at full-page fidelity, to redesign the shot list, log-a-shot, edit-shot, and shot detail screens now (plus the new trends screen), rather than splitting it into a foundation pass plus a later cleanup pass. Pieces A and B below build on it from day one.

**A. Trends:** reads shot data that already exists, no new capability needed. The three views specified as the design's trends screen - ratio against pull time, pull-time consistency, and rating by shot on a bag - narrowed in the same 2026-09-04 conversation from an earlier four-view "Analytics dashboard" concept (which also proposed grind setting vs. outcome and a per-bean breakdown); those two are dropped, not deferred, unless the three prove insufficient. All three compute client-side from the shots array already returned by `listShots()` - no new tables, no aggregation service, and no charting library, since the design specifies hand-drawn SVG. Independent of B at the file level (new page, new route) - can be built in parallel with B or sequentially, a wall-clock choice not a technical requirement.

**B. Barista Assistant v0:** on-demand only - click "Analyze this shot," no chat, no persistent conversation. A Supabase Edge Function calls an LLM (Groq, free tier) with that shot's own data plus recent history for the same bean, returns a diagnosis/suggestion. Persisted per shot in a new `shot_analyses` table, same shape as `videos` (FK to shot, denormalized `user_id` for RLS, one row per shot, overwritten on re-analyze) - chosen over an ephemeral design because the prompt/logic will keep improving and persisted advice is just a historical record, not something that needs to track the current prompt version. No CV dependency: troubleshooting from the numbers already logged (ratio, time, consistency across bean history). Needs a Groq (or equivalent) API key, created and held by a human, never an agent - the Edge Function keeps it server-side, never exposed to the client. Implemented 2026-09-09; see `docs/barista-assistant-design.md` and `docs/superpowers/plans/2026-09-09-barista-assistant-v0.md`.

**Why CV moved after this instead of before it (Phase 3, below):** CV pour analysis is the highest-risk, least-boundable piece of the whole roadmap - no existing model for espresso-specific signals like channeling, no labeled data to validate against, and real-world phone-video conditions (lighting, angle, cup) are inconsistent. It's applied research, not a scoped engineering task. The data-only assistant above is boundable and delivers value immediately from data already being collected. When CV eventually exists, its outputs (flow curve, color shift, a channeling flag) become additional inputs to the same assistant function above, rather than a separate feature - this phase isn't throwaway work relative to CV, it's the foundation CV plugs into later.

### Phase 3 - CV Pour Analysis
Process the stored pour videos: flow rate over time, color/brightness shift (dark → blonde), channeling detection. Turns the video from a record into a signal - and, once built, an additional input to the Phase 2 Barista Assistant rather than a standalone feature.

### Phase 4 - Social & Multi-User Features
The actual social layer: friends and other espresso lovers seeing each other's shots, shared feeds, maybe leaderboards or community challenges. (Distinct from the multi-user *account* support already in v1 - this is about connecting users to each other.)

### Phase 5 - Milk Steaming Analysis
Capture audio + video of steaming milk. Audio signal indicates technique (pitcher sound changes as texture develops); video checks consistency/microfoam quality. Feedback on whether the texture is right.

### Phase 6 - Latte Art Coaching
Record the pour of steamed milk into the espresso. CV analysis of pour technique and resulting pattern, with feedback aimed at helping someone improve their latte art over time.

### Phase 7 - Hardware Integration (stretch)
If grinder/machine has a Bluetooth or app API, close the loop: the system doesn't just recommend a grind adjustment, it sets it.

---

## Open Questions (Not Yet Decided)
- **Tech stack** - deliberately deferred until this spec is locked
- **"Done" criteria for MVP** - needs a concrete, testable definition
- **Video storage approach** - where pour videos live and how they're linked to shot records, even before any analysis is built
