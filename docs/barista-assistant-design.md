# Barista Assistant v0 - Design

## What this is

Phase 2, piece B of the roadmap in `docs/mvp_spec.md`: an on-demand
troubleshooter for a single espresso shot. The user opens a shot, taps
"Analyze this shot", and gets back a short diagnosis of what the
numbers say plus one concrete adjustment for the next shot. The result
is persisted per shot and reloads with the page.

No chat, no persistent conversation, no CV. It reasons only from data
already logged: the shot's own numbers and the recent shots before it
on the same bag.

This is the app's first server-side component. Everything up to now has
been the SPA talking to Supabase directly; this adds one Supabase Edge
Function so an LLM API key can be held server-side and never shipped to
the client.

## Decisions locked before this design

Settled in the 2026-09-09 brainstorming conversation:

- **LLM provider:** Groq free tier (OpenAI-compatible `chat/completions`
  API, a Llama model). The API key is created and held by a human,
  never by an agent, and lives only inside the Edge Function.
- **Output shape:** structured - `{ diagnosis, adjustment }`. Exactly
  one adjustment, never a menu of options. Low-confidence caveats
  (thin history) are folded into the diagnosis text by prompt
  instruction, not a separate field.
- **Prompt context:** the shot being analyzed plus up to 8 prior shots
  on the same bag (`bean_name` + `roast_date` match), newest first.
  When the shot has neither `bean_name` nor `roast_date`, fall back to
  the last 8 shots overall and tell the model they may be different
  beans.
- **Edge function auth:** the client forwards the user's Supabase
  access token; the function does all reads and writes through an
  anon-key client carrying that token, so RLS is the ownership check.
  No service-role key.
- **Function responsibility:** the function owns the whole flow - read
  the data, call Groq, persist the row, return the saved row. The
  client just calls it and re-renders.
- **UI placement:** an always-visible "Barista assistant" section on
  the shot detail page, between the delta block and the tasting note.

## Non-goals for v0

- Any use of the pour video. CV is Phase 3; its outputs become
  additional prompt inputs to this same function later.
- Chat or follow-up questions.
- Cross-bag or whole-history trend analysis beyond the 8-shot window.
- Prompt versioning or migrating old analyses when the prompt changes.
  A stored analysis is a historical record of what was said then, not
  something that tracks the current prompt.
- Automatic (re-)analysis. It only runs when the user taps the button.
- Rate limiting or usage quotas beyond whatever Groq's free tier
  enforces and passes back as a 429.

---

## 1. Data model

New migration: `supabase/migrations/00000000000004_shot_analyses.sql`.

The `shot_analyses` table is modeled on `videos`: one row per shot, FK
to `shots.id`, a denormalized `user_id` for simple RLS.

```sql
-- supabase/migrations/00000000000004_shot_analyses.sql

create table shot_analyses (
  id uuid primary key default gen_random_uuid(),
  shot_id uuid not null unique references shots(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  diagnosis text not null,
  adjustment text not null,
  model text not null,
  history_count smallint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index shot_analyses_user_id_idx on shot_analyses (user_id);

alter table shot_analyses enable row level security;

create policy "shot_analyses_select_own" on shot_analyses
  for select using (auth.uid() = user_id);
create policy "shot_analyses_insert_own" on shot_analyses
  for insert with check (
    auth.uid() = user_id
    and exists (select 1 from shots s where s.id = shot_id and s.user_id = auth.uid())
  );
create policy "shot_analyses_update_own" on shot_analyses
  for update using (auth.uid() = user_id) with check (
    auth.uid() = user_id
    and exists (select 1 from shots s where s.id = shot_id and s.user_id = auth.uid())
  );
create policy "shot_analyses_delete_own" on shot_analyses
  for delete using (auth.uid() = user_id);

create trigger shot_analyses_set_updated_at
before update on shot_analyses
for each row execute function set_updated_at();
```

Field notes:

- `shot_id` is `unique`. This enforces the 1:1 rule and lets the
  function upsert on that column so re-analyze overwrites in place.
- `diagnosis` / `adjustment`: the model's two outputs, stored verbatim.
- `model`: the Groq model id that produced this row (e.g.
  `llama-3.3-70b-versatile`). Cheap to store, makes an old analysis
  interpretable.
- `history_count`: how many prior shots were fed to the model for this
  analysis (0-8). Tells a future reader how much signal it had.
- No `prompt_version` column, deliberately (see Non-goals).
- `on delete cascade` from `shots`: deleting a shot removes its
  analysis, same as `videos`.
- The `insert` and `update` policies also require the referenced shot
  to belong to the caller, matching the hardened `videos` policies in
  migration `00000000000003`.

RLS isolation gets an explicit cross-user test, mirroring the existing
`tests/integration/rls.test.ts` cases for `shots` and `videos`.

---

## 2. Edge function: `analyze-shot`

Location: `supabase/functions/analyze-shot/index.ts` (Deno, the
Supabase Edge Functions runtime).

### Request / response contract

- **Method:** `POST`
- **Headers:** `Authorization: Bearer <user Supabase access token>`
  (attached automatically by `supabase.functions.invoke`)
- **Body:** `{ "shot_id": "<uuid>" }`
- **200:** the saved `shot_analyses` row as JSON
- **Error statuses:**
  - `400` - body missing or `shot_id` not a uuid
  - `401` - no token, or token rejected by Supabase
  - `404` - shot does not exist or is not owned by the caller
    (indistinguishable by design - RLS returns nothing either way)
  - `422` - the shot's own data cannot support analysis (see below)
  - `429` - passed through from Groq (rate limited / quota)
  - `502` - Groq call failed, timed out, or returned a body that does
    not parse into `{ diagnosis: string, adjustment: string }`

Error bodies are `{ "error": "<human-readable message>" }`.

### Flow

1. Handle CORS preflight (`OPTIONS`) and set
   `Access-Control-Allow-Origin` for the app origins on every response.
2. Parse and validate the body. Bad body -> `400`.
3. Create a supabase-js client with the project URL, the anon key, and
   `global.headers.Authorization` set to the incoming header. Every
   query below goes through this client, so RLS enforces ownership and
   there is no manual `user_id` filtering and no service-role key.
4. `select * from shots where id = shot_id` (`.maybeSingle()`). No row
   -> `404`.
5. Guard the shot's numbers: if `dose_g <= 0` or `yield_g <= 0`
   (legacy/corrupt data - v1 validation otherwise guarantees the four
   core fields are present and positive), return `422` rather than
   sending nonsense to the model or dividing by zero on the ratio.
6. Fetch prior shots:
   - If the shot has a `bean_name` or a `roast_date`: select shots
     where `bean_name` matches, `roast_date` matches, and
     `created_at < shot.created_at`; order `created_at desc`; limit 8.
     Each match is null-aware (`.is(col, null)` when the shot's value
     is null, `.eq(col, value)` otherwise), so "same bag" here is the
     same `bean_name` + `roast_date` pairing that
     `src/lib/shotView.ts` `groupShotsByBag` keys on.
   - If the shot has neither: select the last 8 shots overall with
     `created_at < shot.created_at`, and set a `mixedBeans` flag that
     changes one line of the prompt.
7. Build the prompt (section 3). `history_count` = number of prior
   shots actually found.
8. Call Groq `POST https://api.groq.com/openai/v1/chat/completions`:
   - model from `GROQ_MODEL` env var
   - `response_format: { type: "json_object" }`
   - `temperature: 0.3`, `max_tokens` small (a few hundred)
   - a fetch timeout (e.g. 20s); timeout or non-2xx -> `502` (or `429`
     if Groq said 429)
9. Parse the completion's message content as JSON. Reject -> `502` if:
   `diagnosis` or `adjustment` is missing, not a string, empty, or
   longer than a sanity cap (e.g. 600 chars).
10. Upsert into `shot_analyses` on the `shot_id` conflict target with
    `{ shot_id, user_id: shot.user_id, diagnosis, adjustment, model,
    history_count }`, then `.select().single()` and return that row
    with `200`.

### Secrets and config

- `GROQ_API_KEY` and `GROQ_MODEL` are set with `supabase secrets set`
  for the deployed function, and placed in `supabase/functions/.env`
  for local `supabase functions serve`. That file is covered by the
  existing `.env.*` gitignore rule; a `supabase/functions/.env.example`
  documents the two names with placeholder values.
- The key is read only inside the function via `Deno.env.get`. It is
  never returned in a response, logged, or exposed to the client.
- `GROQ_BASE_URL` is an optional env var defaulting to
  `https://api.groq.com/openai/v1`, read only by `index.ts`'s real
  `callGroq`. It exists so a future local mock is possible; the
  automated tests mock `callGroq` at the `deps` boundary instead and
  never hit it.

### Shared computation

Ratio (`yield_g / dose_g`) and days-off-roast are computed in the
function and handed to the model as finished numbers, so the model
never does arithmetic. These are the same formulas as
`src/lib/shotView.ts` `ratio()` and `daysSinceRoast()`. Because the
function runs in Deno and cannot cleanly import from `src/`, the two
small pure formulas are reimplemented in a local
`supabase/functions/analyze-shot/shot-math.ts` with their own unit
tests. If these ever diverge from `src/lib/shotView.ts` the analyses
drift from the UI, so both copies carry a comment pointing at the
other.

### Testability structure

The handler is split so its logic is unit-testable without Deno,
Docker, or a network:

- `shot-math.ts`, `prompt.ts` - pure, no imports. `buildPrompt(shot,
  priorShots, { mixedBeans })` returns the `{ system, user }` message
  pair.
- `orchestrator.ts` - `runAnalysis(deps, { shotId })` where `deps` is
  `{ getShot, getPriorShots, callGroq, saveAnalysis, model }`. This
  holds all the branching: `404` when `getShot` returns null, `422` on
  the numeric guard, the same-bag vs `mixedBeans` history choice, the
  Groq response validation, the mapping of a thrown Groq error to
  `429`/`502`, and the final `saveAnalysis` call. It returns
  `{ status, body }`. No Deno or Supabase types cross into this file.
- `index.ts` - `Deno.serve` wiring only: CORS, body parse, construct
  the real `deps` (a supabase-js client carrying the caller's
  `Authorization` header; a `callGroq` that does the real `fetch` with
  a timeout against `GROQ_BASE_URL`), call `runAnalysis`, serialize
  the result.

`orchestrator.ts` and the pure files are covered by vitest with mocked
`deps`. `index.ts` (the thin wiring) plus the real Groq call are
covered by the manual end-to-end checklist.

---

## 3. The prompt

### System message (fixed)

> You are an espresso dial-in assistant. You are given one espresso
> shot and the recent shots that came before it on the same bag.
> Reason only from the numbers provided: dose, yield, ratio
> (yield/dose), pull time, grind setting, and any ratings or tasting
> notes. Diagnose what the current shot's numbers indicate about
> extraction (fast or slow, under- or over-extracted, ratio high or
> low), using the trend across prior shots when it is informative.
> Then give exactly one adjustment for the next shot: change one
> variable only, and say what target it should move toward. If there
> are two or fewer prior shots on the bag, open the diagnosis by
> saying the signal is limited. Be concrete and terse. Do not hedge
> with multiple options. Do not discuss equipment, water, or beans you
> were not told about.
>
> Respond only as JSON: `{"diagnosis": "...", "adjustment": "..."}`.
> Each value is one or two sentences with no line breaks.

### User message (data, assembled server-side)

Compact lines, numbers pre-computed:

```
Bean: Kenya Nyeri AA, roasted 2026-08-23 (12 days off roast)

Shot being analyzed (Tue 4 Sep, 07:42):
  grind 18.0 | dose 18.0g | yield 41.5g | ratio 1:2.31 | time 32s | rating 2/5
  note: "sharp, sour finish"

Prior shots on this bag (newest first):
  1 day earlier: grind 18.0 | 18.0g -> 37.4g | 1:2.08 | 28s | rating 3/5
  2 days earlier: grind 20.0 | 18.0g -> 36.1g | 1:2.01 | 26s | (no rating)
  ...
```

Rules for assembly:

- Grind is inserted verbatim (free text per the schema). The prompt
  says "grind setting" and never assumes it is numeric.
- Omit fields that are null (`rating`, `tasting_note`, `roast_date`,
  `bean_name`) rather than printing "null".
- When the `mixedBeans` fallback path is used: the `Bean:` line
  becomes `Bean: not recorded`, and the prior-shots header becomes
  `Recent shots (may be different beans, newest first):`.
- When there are zero prior shots, the prior-shots block is replaced
  with `No prior shots on this bag.`

---

## 4. Client library: `src/lib/analyses.ts`

Shape follows `src/lib/videos.ts`: a type plus small functions, no
class.

```ts
export type ShotAnalysis = {
  id: string;
  shot_id: string;
  user_id: string;
  diagnosis: string;
  adjustment: string;
  model: string;
  history_count: number;
  created_at: string;
  updated_at: string;
};

export class AnalyzeError extends Error {
  status: number;
  constructor(status: number, message: string);
}

// Plain RLS-scoped select. Returns null when no analysis exists yet.
export function getAnalysisForShot(shotId: string): Promise<ShotAnalysis | null>;

// Invokes the edge function and returns the saved row.
// Throws AnalyzeError carrying the HTTP status on any non-2xx.
export function analyzeShot(shotId: string): Promise<ShotAnalysis>;
```

- `analyzeShot` calls
  `supabase.functions.invoke('analyze-shot', { body: { shot_id: shotId } })`,
  which attaches the access token automatically.
- Error mapping: `functions.invoke` surfaces non-2xx as a
  `FunctionsHttpError` with the `Response` on it; `analyzeShot` reads
  the status and the `{ error }` body and throws `AnalyzeError(status,
  message)`.
- The UI uses `status` to split "try again" (`429`, `502`, network)
  from "can't analyze this shot" (`422`) from anything else.

---

## 5. UI: the "Barista assistant" section

New component: `src/components/ShotAssistant.tsx`, rendered on
`ShotDetailPage` between the delta block and the tasting note.

Props:

```ts
{
  shotId: string;
  initialAnalysis: ShotAnalysis | null; // fetched by the page's load
}
```

`ShotDetailPage`'s existing data load gains one more await:
`getAnalysisForShot(id)` alongside the shot and video fetches. The
result is passed straight in as `initialAnalysis`. A failure of that
one call is swallowed to null (the section then just offers "Analyze"),
it does not block or blank the page.

### States

- **No analysis** (`initialAnalysis` null, nothing run yet): section
  header "Barista assistant", one line of description ("A read of this
  shot's numbers against the bag so far."), and an **Analyze this
  shot** button.
- **Running:** button becomes disabled with label "Analyzing...". Used
  for both the first run and re-analyze.
- **Present:** a "Diagnosis" block and a "Next shot" block, both set in
  the body font (never the heading font - it is changing content), then
  a quiet metadata line `Analyzed Tue 14:32 · llama-3.3-70b` and a
  ghost **Re-analyze** button.
- **Error:** an inline message inside the section; the section
  otherwise keeps whatever it was showing (an existing analysis stays
  visible). Never blanks the page - this follows the pattern set by
  commit `1b68cc3` for video-attach/delete failures.
  - `422` -> "This shot's numbers can't be analyzed."
  - `429` / `502` / network -> "The assistant is unavailable right
    now. Try again."
  - other -> the error's own message.

### Styling

Uses the existing `src/theme.css` tokens and the `.num` / `.fig`
utilities. Button variants, the `:focus-visible` ring, and the
"destructive actions are ghost + never adjacent to primary" rule come
from the design-foundation plan's Global Constraints
(`docs/superpowers/plans/2026-09-04-design-foundation.md`). Re-analyze
is a ghost button; there is no destructive action in this section.

---

## 6. Testing

### Unit (Vitest, fast, no stack)

- `supabase/functions/analyze-shot/shot-math.test.ts`: ratio and
  days-off-roast, including the parity cases already covered for
  `src/lib/shotView.ts`.
- Prompt assembly: a pure `buildPrompt(shot, priorShots, opts)`
  function extracted from the handler, tested for - null fields
  omitted, `mixedBeans` line swap, zero-prior-shots line, grind passed
  verbatim (including non-numeric like `"2 o'clock"`), ratio/days
  rendered as finished numbers.
- `src/lib/analyses.ts`: `analyzeShot` error mapping - mock
  `supabase.functions.invoke` returning each of `422` / `429` / `502`
  and assert the thrown `AnalyzeError.status`.
- `supabase/functions/analyze-shot/orchestrator.test.ts`: `runAnalysis`
  with fully mocked `deps` - `404` when `getShot` returns null; `422`
  when `yield_g` is 0; same-bag history passed through to `buildPrompt`
  vs `mixedBeans` path when the shot has no bean; a `getPriorShots`
  returning 8 rows produces `history_count: 8`; a `callGroq` that
  throws a 429-tagged error maps to status `429`, any other throw to
  `502`; a Groq result missing `adjustment` maps to `502`; the happy
  path calls `saveAnalysis` with the right row and returns `200` with
  it.
- `src/components/ShotAssistant.tsx` (React Testing Library, mocked
  `analyses` lib): renders the Analyze button with no analysis; renders
  both blocks and the metadata line with an analysis; shows the running
  label while the promise is pending; shows the right message for a
  `422` vs a `502`; keeps an existing analysis visible when re-analyze
  errors.

### Integration (against local Supabase, like `tests/integration/rls.test.ts`)

- `shot_analyses` RLS: user B cannot select, update, or delete user
  A's analysis row; a direct insert by user B carrying user A's
  `shot_id` is rejected by the shot-ownership check in the `insert`
  policy.

The edge function itself is not exercised in the automated suite - its
only untested surface after the unit tests above is the `Deno.serve`
wiring in `index.ts` and the real Groq `fetch`, both covered by the
manual checklist. Standing up a Groq mock reachable from inside the
Supabase functions Docker container is deliberately out of scope.

### Manual, end to end (needs the real Groq key)

Run through this checklist once the key exists (also recorded in the
plan's final task): set the real key in `supabase/functions/.env`, run
`npx supabase start` and `npx supabase functions serve analyze-shot`,
then from the running app: analyze a shot with several prior shots on
its bag; analyze a shot with only 1-2 priors and confirm the diagnosis
opens with the limited-signal caveat; re-analyze and confirm the row is
overwritten in place; reload the page and confirm the analysis comes
back; analyze a shot with no bean name and confirm it still returns
with the "may be different beans" framing; confirm another user's shot
id returns a not-found error, not someone else's data.

---

## 7. Prerequisites (human, before implementation can finish)

1. Create a Groq account and API key at `console.groq.com`. Hold it;
   do not paste it into any agent-visible location.
2. Pick the model id (`GROQ_MODEL`) - a current Llama model on the
   free tier.
3. For local dev: put both values in `supabase/functions/.env`.
4. For deploy: `supabase secrets set GROQ_API_KEY=... GROQ_MODEL=...`
   against the project, then `supabase functions deploy analyze-shot`.

The function scaffold, table migration, RLS, client lib, UI, and all
unit / integration tests (Groq stubbed) can be built and pass before
the key exists. Only the real end-to-end check is blocked on it.

---

## 8. Files

```
supabase/
  migrations/
    00000000000004_shot_analyses.sql        new
  functions/
    .env.example                             new: GROQ_API_KEY, GROQ_MODEL
    analyze-shot/
      index.ts                               new: Deno.serve wiring + real deps
      orchestrator.ts                         new: runAnalysis(deps, input)
      orchestrator.test.ts                    new
      prompt.ts                               new: buildPrompt
      prompt.test.ts                          new
      shot-math.ts                            new: ratio, daysSinceRoast (Deno copy)
      shot-math.test.ts                       new
      types.ts                                new: ShotRow, GroqResult, Deps, Result
src/
  lib/
    analyses.ts                              new
    analyses.test.ts                         new
  components/
    ShotAssistant.tsx                        new
    ShotAssistant.test.tsx                   new
  pages/
    ShotDetailPage.tsx                       modified: load + render the section
    ShotDetailPage.test.tsx                  modified
tests/
  integration/
    shot-analyses.test.ts                    new: shot_analyses RLS isolation
docs/
  barista-assistant-design.md                this file
```

No new npm dependencies. `index.ts` imports `@supabase/supabase-js`
from `esm.sh` (the standard Supabase Edge Functions pattern) and uses
the Deno-native `fetch`; none of that is exercised by vitest, which
only imports the pure `orchestrator.ts` / `prompt.ts` / `shot-math.ts`
files.
