# Barista Assistant v0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an on-demand "Analyze this shot" feature that sends a shot's numbers plus its recent same-bag history to an LLM and shows a short diagnosis and one adjustment, persisted per shot.

**Architecture:** One Supabase Edge Function (`analyze-shot`) is the app's first server-side component. It reads the shot and up to 8 prior same-bag shots through the caller's own JWT (RLS enforces ownership), calls Groq, and upserts a `shot_analyses` row, returning it. The function's logic lives in pure, vitest-testable files (`shot-math.ts`, `prompt.ts`, `orchestrator.ts`); `index.ts` is thin Deno wiring. The client gets `src/lib/analyses.ts` and a `ShotAssistant` component on the shot detail page.

**Tech Stack:** Supabase (Postgres + Edge Functions on Deno), React 18 + TypeScript + Vite, React Router, Vitest + React Testing Library, `@supabase/supabase-js` v2. Groq free-tier `chat/completions` API. No new npm dependencies.

**Spec:** `docs/barista-assistant-design.md` (read it in full before starting - it carries the request/response contract, the prompt text, the RLS rules, and the rationale this plan does not repeat).

## Global Constraints

- No em dashes anywhere in code, comments, docs, commit messages, or written output. Use a regular hyphen or restructure.
- Do not add or reference time estimates anywhere.
- The Groq API key is created and held by a human, never by an agent. It is only ever read inside the Edge Function via `Deno.env.get`, never returned in a response, logged, or sent to the client. Do not put a real key in any file this plan creates; `.env` files holding it are gitignored and created by the human.
- No new npm dependencies.
- RLS on `shot_analyses` restricts every operation to `user_id = auth.uid()`, and the `insert`/`update` policies additionally require the referenced shot to belong to the caller, matching the hardened `videos` policies in migration `00000000000003`.
- The Edge Function never uses a service-role key. All its database access goes through a supabase-js client carrying the caller's `Authorization` header, so RLS is the ownership check.
- UI follows the design-foundation Global Constraints (`docs/superpowers/plans/2026-09-04-design-foundation.md`): tokens from `src/theme.css`, `.num`/`.fig` utilities, themed `:focus-visible` ring, changing figures never in the heading font, destructive actions as ghost buttons never adjacent to a primary action. This section has no destructive action.
- `ratio()` and `daysSinceRoast()` are duplicated between `src/lib/shotView.ts` and `supabase/functions/analyze-shot/shot-math.ts` by necessity (Deno cannot import from `src/`). Both copies carry a comment pointing at the other; a change to one is a change to both.

## File Structure

```
supabase/
  migrations/
    00000000000004_shot_analyses.sql          new: table + RLS
  config.toml                                 modified: [functions.analyze-shot]
  functions/
    .env.example                              exists already (GROQ_API_KEY, GROQ_MODEL, GROQ_BASE_URL)
    analyze-shot/
      types.ts                                new: shared types + GroqError
      shot-math.ts                            new: ratio, daysSinceRoast (Deno copy)
      shot-math.test.ts                       new
      prompt.ts                               new: buildPrompt
      prompt.test.ts                          new
      orchestrator.ts                         new: runAnalysis(deps, input)
      orchestrator.test.ts                    new
      index.ts                                new: Deno.serve wiring + real deps
src/
  lib/
    shotView.ts                               modified: sync-pointer comments
    analyses.ts                               new: ShotAnalysis, getAnalysisForShot, analyzeShot, AnalyzeError
    analyses.test.ts                          new
  components/
    ShotAssistant.tsx                         new
    ShotAssistant.test.tsx                    new
  pages/
    ShotDetailPage.tsx                        modified: load analysis, render section
    ShotDetailPage.test.tsx                   modified: mock ../lib/analyses, new test
tests/
  integration/
    supabaseTestClient.ts                     new: extracted createTestUserClient helper
    rls.test.ts                               modified: import the extracted helper
    shot-analyses.test.ts                     new: shot_analyses RLS isolation
docs/
  superpowers/plans/2026-09-09-barista-assistant-v0.md   this file
CLAUDE.md                                     modified: status + data model note
docs/mvp_spec.md                              modified: mark Phase 2B done
```

## Preconditions

Env files are already set up by the human and are not the plan's concern:

- `.env` holds `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `SUPABASE_LOCAL_SERVICE_ROLE_KEY`.
- `supabase/functions/.env` holds `GROQ_API_KEY` and `GROQ_MODEL`.

The integration-test tasks (1 and 9) additionally need the local Supabase stack running: `npx supabase start` (Docker must be running). After Task 1 adds migration 4, apply it with `npx supabase migration up` (additive - do not use `npx supabase db reset`, which wipes the shared local dev database).

---

### Task 1: `shot_analyses` table, RLS, and isolation test

**Files:**
- Create: `supabase/migrations/00000000000004_shot_analyses.sql`
- Create: `tests/integration/supabaseTestClient.ts`
- Create: `tests/integration/shot-analyses.test.ts`
- Modify: `tests/integration/rls.test.ts` (use the extracted helper)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: the `shot_analyses` table with columns `id uuid`, `shot_id uuid unique`, `user_id uuid`, `diagnosis text`, `adjustment text`, `model text`, `history_count smallint`, `created_at timestamptz`, `updated_at timestamptz`. `createTestUserClient(email: string): Promise<{ client: SupabaseClient; userId: string }>` from `tests/integration/supabaseTestClient.ts`, for this and future integration tests.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/00000000000004_shot_analyses.sql`:

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

- [ ] **Step 2: Apply the migration to the local database**

Run: `npx supabase migration up`
Expected: applies `00000000000004_shot_analyses` with no error. (Do not use `npx supabase db reset` - it wipes the shared local dev database.)

- [ ] **Step 3: Extract the shared test-client helper**

Create `tests/integration/supabaseTestClient.ts` by moving the `createTestUserClient` function (and its imports and the `LOCAL_URL` / `ANON_KEY` / `SERVICE_ROLE_KEY` constants) verbatim out of `tests/integration/rls.test.ts`:

```typescript
// tests/integration/supabaseTestClient.ts
import { createClient } from '@supabase/supabase-js';

const LOCAL_URL = 'http://127.0.0.1:54321';
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_LOCAL_SERVICE_ROLE_KEY!;

export async function createTestUserClient(email: string) {
  const admin = createClient(LOCAL_URL, SERVICE_ROLE_KEY);
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: 'test-password-123',
    email_confirm: true,
  });
  if (error) throw error;

  // persistSession is disabled because jsdom's shared window.localStorage
  // would otherwise make every client created in this test process resolve
  // to the same storage key, overwriting each other's session and making
  // all "clients" act as whichever user signed in last. Each createClient
  // call keeps its session in memory only, so users a and b stay isolated.
  const client = createClient(LOCAL_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: signInError } = await client.auth.signInWithPassword({
    email,
    password: 'test-password-123',
  });
  if (signInError) throw signInError;

  return { client, userId: data.user!.id };
}
```

Then in `tests/integration/rls.test.ts`, delete that function and those constants and add at the top:

```typescript
import { createTestUserClient } from './supabaseTestClient';
```

Leave `import { createClient } from '@supabase/supabase-js';` in `rls.test.ts` only if something else there still uses it; `noUnusedLocals` will flag it otherwise, so remove it if now unused.

- [ ] **Step 4: Run the existing RLS tests to confirm the refactor is clean**

Run: `npx vitest run tests/integration/rls.test.ts`
Expected: PASS, same as before the extraction.

- [ ] **Step 5: Write the failing isolation test**

Create `tests/integration/shot-analyses.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { createTestUserClient } from './supabaseTestClient';

async function insertShot(client: Awaited<ReturnType<typeof createTestUserClient>>['client'], userId: string) {
  const { data, error } = await client
    .from('shots')
    .insert({ grind_setting: '18', dose_g: 18, yield_g: 36, pull_time_s: 28, user_id: userId })
    .select()
    .single();
  expect(error).toBeNull();
  return data!;
}

describe('shot_analyses RLS isolation', () => {
  it('user B cannot select user A\'s analysis row', async () => {
    const a = await createTestUserClient(`ana-a-${Date.now()}@test.local`);
    const b = await createTestUserClient(`ana-b-${Date.now()}@test.local`);
    const shot = await insertShot(a.client, a.userId);

    const { data: analysis, error: insertError } = await a.client
      .from('shot_analyses')
      .insert({
        shot_id: shot.id,
        user_id: a.userId,
        diagnosis: 'running fast',
        adjustment: 'grind finer',
        model: 'test-model',
        history_count: 0,
      })
      .select()
      .single();
    expect(insertError).toBeNull();

    const { data: seenByB } = await b.client
      .from('shot_analyses')
      .select()
      .eq('id', analysis!.id);
    expect(seenByB).toEqual([]);
  });

  it('user B cannot update or delete user A\'s analysis row', async () => {
    const a = await createTestUserClient(`ana-c-${Date.now()}@test.local`);
    const b = await createTestUserClient(`ana-d-${Date.now()}@test.local`);
    const shot = await insertShot(a.client, a.userId);

    const { data: analysis } = await a.client
      .from('shot_analyses')
      .insert({
        shot_id: shot.id,
        user_id: a.userId,
        diagnosis: 'd',
        adjustment: 'x',
        model: 'test-model',
        history_count: 0,
      })
      .select()
      .single();

    const { data: updated } = await b.client
      .from('shot_analyses')
      .update({ diagnosis: 'tampered' })
      .eq('id', analysis!.id)
      .select();
    expect(updated).toEqual([]);

    const { data: deleted } = await b.client
      .from('shot_analyses')
      .delete()
      .eq('id', analysis!.id)
      .select();
    expect(deleted).toEqual([]);
  });

  it('user B cannot insert an analysis referencing user A\'s shot', async () => {
    const a = await createTestUserClient(`ana-e-${Date.now()}@test.local`);
    const b = await createTestUserClient(`ana-f-${Date.now()}@test.local`);
    const shot = await insertShot(a.client, a.userId);

    const { error } = await b.client.from('shot_analyses').insert({
      shot_id: shot.id,
      user_id: b.userId,
      diagnosis: 'd',
      adjustment: 'x',
      model: 'test-model',
      history_count: 0,
    });
    expect(error).not.toBeNull();
  });

  it('re-analyzing the same shot overwrites via the unique shot_id', async () => {
    const a = await createTestUserClient(`ana-g-${Date.now()}@test.local`);
    const shot = await insertShot(a.client, a.userId);

    const row = {
      shot_id: shot.id,
      user_id: a.userId,
      diagnosis: 'first',
      adjustment: 'x',
      model: 'test-model',
      history_count: 0,
    };
    await a.client.from('shot_analyses').upsert(row, { onConflict: 'shot_id' });
    await a.client
      .from('shot_analyses')
      .upsert({ ...row, diagnosis: 'second' }, { onConflict: 'shot_id' });

    const { data } = await a.client.from('shot_analyses').select().eq('shot_id', shot.id);
    expect(data).toHaveLength(1);
    expect(data![0].diagnosis).toBe('second');
  });
});
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run tests/integration/shot-analyses.test.ts`
Expected: PASS on all four cases. (If it errors with `relation "shot_analyses" does not exist`, the migration in Step 2 did not apply - re-run `npx supabase migration up`.)

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/00000000000004_shot_analyses.sql tests/integration/supabaseTestClient.ts tests/integration/rls.test.ts tests/integration/shot-analyses.test.ts
git commit -m "feat: add shot_analyses table with RLS and isolation tests"
```

---

### Task 2: `shot-math.ts` for the function

**Files:**
- Create: `supabase/functions/analyze-shot/shot-math.ts`
- Create: `supabase/functions/analyze-shot/shot-math.test.ts`
- Modify: `src/lib/shotView.ts` (add sync-pointer comments)

**Interfaces:**
- Consumes: nothing.
- Produces: `ratio(shot: { dose_g: number; yield_g: number }): number` and `daysSinceRoast(roastDate: string, now?: Date): number` from `supabase/functions/analyze-shot/shot-math.ts`. Tasks 3 and 4 import these.

Vitest discovers `*.test.ts` under `supabase/functions/` from the repo root, so these run with the normal `npx vitest` command. `npm run build` runs `tsc` scoped to `src` and `tests` only, so it does not type-check function files; the vitest run is their check.

- [ ] **Step 1: Write the failing tests**

Create `supabase/functions/analyze-shot/shot-math.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { ratio, daysSinceRoast } from './shot-math';

describe('ratio', () => {
  it('computes yield over dose', () => {
    expect(ratio({ dose_g: 18, yield_g: 36 })).toBe(2);
  });

  it('handles a fractional result', () => {
    expect(ratio({ dose_g: 18, yield_g: 41.4 })).toBeCloseTo(2.3);
  });
});

describe('daysSinceRoast', () => {
  it('computes whole days between roast_date and now', () => {
    expect(daysSinceRoast('2026-08-23', new Date('2026-09-04'))).toBe(12);
  });

  it('floors a partial day', () => {
    expect(daysSinceRoast('2026-09-03T00:00:00Z', new Date('2026-09-04T18:00:00Z'))).toBe(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run supabase/functions/analyze-shot/shot-math.test.ts`
Expected: FAIL, `shot-math.ts` does not exist.

- [ ] **Step 3: Write `shot-math.ts`**

```typescript
// supabase/functions/analyze-shot/shot-math.ts
//
// Deno copy of ratio() and daysSinceRoast() from src/lib/shotView.ts.
// This function runs in Deno and cannot import from src/, so the two
// formulas are kept in sync by hand. If you change one, change the
// other (src/lib/shotView.ts).

const MS_PER_DAY = 1000 * 60 * 60 * 24;

export function ratio(shot: { dose_g: number; yield_g: number }): number {
  return shot.yield_g / shot.dose_g;
}

export function daysSinceRoast(roastDate: string, now: Date = new Date()): number {
  const roast = new Date(roastDate);
  return Math.floor((now.getTime() - roast.getTime()) / MS_PER_DAY);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run supabase/functions/analyze-shot/shot-math.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the sync-pointer comments in `src/lib/shotView.ts`**

Above the existing `export function daysSinceRoast(` line, add:

```typescript
// Mirrored in supabase/functions/analyze-shot/shot-math.ts (the Edge
// Function cannot import from src/). Keep both copies in sync.
```

Above the existing `export function ratio(` line, add:

```typescript
// Mirrored in supabase/functions/analyze-shot/shot-math.ts. Keep in sync.
```

- [ ] **Step 6: Run the shotView tests to confirm nothing moved**

Run: `npx vitest run src/lib/shotView.test.ts`
Expected: PASS (comment-only change).

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/analyze-shot/shot-math.ts supabase/functions/analyze-shot/shot-math.test.ts src/lib/shotView.ts
git commit -m "feat: add shot-math helpers for the analyze-shot function"
```

---

### Task 3: shared types and `prompt.ts`

**Files:**
- Create: `supabase/functions/analyze-shot/types.ts`
- Create: `supabase/functions/analyze-shot/prompt.ts`
- Create: `supabase/functions/analyze-shot/prompt.test.ts`

**Interfaces:**
- Consumes: `ratio`, `daysSinceRoast` from `./shot-math` (Task 2).
- Produces:
  - From `./types.ts`: `ShotRow` (the 12 shot columns as a type), `GroqMessages = { system: string; user: string }`, `GroqResult = { diagnosis: string; adjustment: string }`, `AnalysisRow = { shot_id: string; user_id: string; diagnosis: string; adjustment: string; model: string; history_count: number }`, `Result = { status: number; body: unknown }`, `Deps` (defined in Task 4's step), and `class GroqError extends Error { status: number }`.
  - From `./prompt.ts`: `buildPrompt(shot: ShotRow, priorShots: ShotRow[], opts: { mixedBeans: boolean }, now?: Date): GroqMessages`.

- [ ] **Step 1: Write `types.ts`**

```typescript
// supabase/functions/analyze-shot/types.ts

export type ShotRow = {
  id: string;
  user_id: string;
  grind_setting: string;
  dose_g: number;
  yield_g: number;
  pull_time_s: number;
  bean_name: string | null;
  roast_date: string | null;
  rating: number | null;
  tasting_note: string | null;
  created_at: string;
  updated_at: string;
};

export type GroqMessages = { system: string; user: string };

export type GroqResult = { diagnosis: string; adjustment: string };

export type AnalysisRow = {
  shot_id: string;
  user_id: string;
  diagnosis: string;
  adjustment: string;
  model: string;
  history_count: number;
};

export type Result = { status: number; body: unknown };

export type Deps = {
  model: string;
  getShot: (shotId: string) => Promise<ShotRow | null>;
  getPriorShots: (shot: ShotRow, opts: { mixedBeans: boolean }) => Promise<ShotRow[]>;
  callGroq: (messages: GroqMessages) => Promise<GroqResult>;
  saveAnalysis: (row: AnalysisRow) => Promise<Record<string, unknown>>;
};

export class GroqError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'GroqError';
    this.status = status;
  }
}
```

- [ ] **Step 2: Write the failing tests for `prompt.ts`**

Create `supabase/functions/analyze-shot/prompt.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildPrompt } from './prompt';
import type { ShotRow } from './types';

function makeShot(overrides: Partial<ShotRow>): ShotRow {
  return {
    id: 'shot-1',
    user_id: 'user-1',
    grind_setting: '18.0',
    dose_g: 18,
    yield_g: 41.4,
    pull_time_s: 32,
    bean_name: 'Kenya Nyeri AA',
    roast_date: '2026-08-23',
    rating: 2,
    tasting_note: 'sharp, sour finish',
    created_at: '2026-09-04T07:42:00Z',
    updated_at: '2026-09-04T07:42:00Z',
    ...overrides,
  };
}

const NOW = new Date('2026-09-04T08:00:00Z');

describe('buildPrompt', () => {
  it('puts the fixed rules in the system message', () => {
    const { system } = buildPrompt(makeShot({}), [], { mixedBeans: false }, NOW);
    expect(system).toContain('espresso dial-in assistant');
    expect(system).toContain('{"diagnosis"');
  });

  it('renders the bean line with days off roast', () => {
    const { user } = buildPrompt(makeShot({}), [], { mixedBeans: false }, NOW);
    expect(user).toContain('Bean: Kenya Nyeri AA, roasted 2026-08-23 (12 days off roast)');
  });

  it('renders ratio and time as finished numbers and grind verbatim', () => {
    const { user } = buildPrompt(
      makeShot({ grind_setting: "2 o'clock", dose_g: 18, yield_g: 41.4, pull_time_s: 32 }),
      [],
      { mixedBeans: false },
      NOW
    );
    expect(user).toContain("grind 2 o'clock");
    expect(user).toContain('1:2.30');
    expect(user).toContain('32s');
  });

  it('omits null optional fields rather than printing null', () => {
    const { user } = buildPrompt(
      makeShot({ rating: null, tasting_note: null }),
      [],
      { mixedBeans: false },
      NOW
    );
    expect(user).not.toContain('null');
    expect(user).not.toContain('note:');
  });

  it('says there are no prior shots when the history is empty', () => {
    const { user } = buildPrompt(makeShot({}), [], { mixedBeans: false }, NOW);
    expect(user).toContain('No prior shots on this bag.');
  });

  it('lists prior shots newest first with a relative-day label', () => {
    const prior = [
      makeShot({ id: 'p1', created_at: '2026-09-03T07:42:00Z', yield_g: 37.4, pull_time_s: 28, rating: 3 }),
      makeShot({ id: 'p2', created_at: '2026-09-02T07:42:00Z', yield_g: 36.1, pull_time_s: 26, rating: null }),
    ];
    const { user } = buildPrompt(makeShot({}), prior, { mixedBeans: false }, NOW);
    expect(user).toContain('Prior shots on this bag (newest first):');
    expect(user).toContain('1 day earlier:');
    expect(user).toContain('2 days earlier:');
    expect(user).toContain('(no rating)');
  });

  it('switches the bean and history lines when mixedBeans is set', () => {
    const { user } = buildPrompt(
      makeShot({ bean_name: null, roast_date: null }),
      [makeShot({ id: 'p1', created_at: '2026-09-03T07:42:00Z' })],
      { mixedBeans: true },
      NOW
    );
    expect(user).toContain('Bean: not recorded');
    expect(user).toContain('Recent shots (may be different beans, newest first):');
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run supabase/functions/analyze-shot/prompt.test.ts`
Expected: FAIL, `prompt.ts` does not exist.

- [ ] **Step 4: Write `prompt.ts`**

```typescript
// supabase/functions/analyze-shot/prompt.ts
import { ratio, daysSinceRoast } from './shot-math';
import type { ShotRow, GroqMessages } from './types';

const MS_PER_DAY = 1000 * 60 * 60 * 24;

const SYSTEM = [
  'You are an espresso dial-in assistant. You are given one espresso shot and the recent shots',
  'that came before it on the same bag. Reason only from the numbers provided: dose, yield, ratio',
  '(yield/dose), pull time, grind setting, and any ratings or tasting notes. Diagnose what the',
  'current shot\'s numbers indicate about extraction (fast or slow, under- or over-extracted, ratio',
  'high or low), using the trend across prior shots when it is informative. Then give exactly one',
  'adjustment for the next shot: change one variable only, and say what target it should move',
  'toward. If there are two or fewer prior shots on the bag, open the diagnosis by saying the',
  'signal is limited. Be concrete and terse. Do not hedge with multiple options. Do not discuss',
  'equipment, water, or beans you were not told about.',
  '',
  'Respond only as JSON: {"diagnosis": "...", "adjustment": "..."}. Each value is one or two',
  'sentences with no line breaks.',
].join(' ');

function fmtRatio(shot: ShotRow): string {
  return `1:${ratio(shot).toFixed(2)}`;
}

function ratingPart(shot: ShotRow): string {
  return shot.rating != null ? `rating ${shot.rating}/5` : '(no rating)';
}

function currentShotBlock(shot: ShotRow): string {
  const when = new Date(shot.created_at).toISOString().slice(0, 16).replace('T', ' ');
  const lines = [
    `Shot being analyzed (${when} UTC):`,
    `  grind ${shot.grind_setting} | dose ${shot.dose_g}g | yield ${shot.yield_g}g | ` +
      `${fmtRatio(shot)} | ${Math.round(shot.pull_time_s)}s | ${ratingPart(shot)}`,
  ];
  if (shot.tasting_note) lines.push(`  note: "${shot.tasting_note}"`);
  return lines.join('\n');
}

function relativeDayLabel(prior: ShotRow, current: ShotRow): string {
  const days = Math.round(
    (new Date(current.created_at).getTime() - new Date(prior.created_at).getTime()) / MS_PER_DAY
  );
  if (days <= 0) return 'same day';
  return days === 1 ? '1 day earlier' : `${days} days earlier`;
}

function priorShotLine(prior: ShotRow, current: ShotRow): string {
  return (
    `  ${relativeDayLabel(prior, current)}: grind ${prior.grind_setting} | ` +
    `${prior.dose_g}g -> ${prior.yield_g}g | ${fmtRatio(prior)} | ` +
    `${Math.round(prior.pull_time_s)}s | ${ratingPart(prior)}`
  );
}

export function buildPrompt(
  shot: ShotRow,
  priorShots: ShotRow[],
  opts: { mixedBeans: boolean },
  now: Date = new Date()
): GroqMessages {
  const beanLine =
    opts.mixedBeans || (shot.bean_name == null && shot.roast_date == null)
      ? 'Bean: not recorded'
      : `Bean: ${shot.bean_name ?? 'unlabeled'}` +
        (shot.roast_date
          ? `, roasted ${shot.roast_date} (${daysSinceRoast(shot.roast_date, now)} days off roast)`
          : '');

  const historyHeader = opts.mixedBeans
    ? 'Recent shots (may be different beans, newest first):'
    : 'Prior shots on this bag (newest first):';

  const historyBlock =
    priorShots.length === 0
      ? opts.mixedBeans
        ? 'No recent shots.'
        : 'No prior shots on this bag.'
      : [historyHeader, ...priorShots.map((p) => priorShotLine(p, shot))].join('\n');

  const user = [beanLine, '', currentShotBlock(shot), '', historyBlock].join('\n');
  return { system: SYSTEM, user };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run supabase/functions/analyze-shot/prompt.test.ts`
Expected: PASS. (If the `1:2.30` assertion fails, check `yield_g: 41.4 / dose_g: 18 = 2.3000` and `toFixed(2)` gives `2.30`.)

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/analyze-shot/types.ts supabase/functions/analyze-shot/prompt.ts supabase/functions/analyze-shot/prompt.test.ts
git commit -m "feat: add prompt builder and shared types for analyze-shot"
```

---

### Task 4: `orchestrator.ts`

**Files:**
- Create: `supabase/functions/analyze-shot/orchestrator.ts`
- Create: `supabase/functions/analyze-shot/orchestrator.test.ts`

**Interfaces:**
- Consumes: `buildPrompt` from `./prompt` (Task 3); `Deps`, `Result`, `ShotRow`, `GroqResult`, `AnalysisRow`, `GroqError` from `./types` (Task 3).
- Produces: `runAnalysis(deps: Deps, input: { shotId: string }): Promise<Result>` from `./orchestrator.ts`. Task 5 (`index.ts`) calls it with real `deps`.

- [ ] **Step 1: Write the failing tests**

Create `supabase/functions/analyze-shot/orchestrator.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { runAnalysis } from './orchestrator';
import { GroqError } from './types';
import type { Deps, ShotRow } from './types';

function makeShot(overrides: Partial<ShotRow>): ShotRow {
  return {
    id: 'shot-1',
    user_id: 'user-1',
    grind_setting: '18.0',
    dose_g: 18,
    yield_g: 36,
    pull_time_s: 28,
    bean_name: 'Kenya',
    roast_date: '2026-08-23',
    rating: null,
    tasting_note: null,
    created_at: '2026-09-04T07:42:00Z',
    updated_at: '2026-09-04T07:42:00Z',
    ...overrides,
  };
}

function makeDeps(overrides: Partial<Deps>): Deps {
  return {
    model: 'test-model',
    getShot: vi.fn().mockResolvedValue(makeShot({})),
    getPriorShots: vi.fn().mockResolvedValue([]),
    callGroq: vi.fn().mockResolvedValue({ diagnosis: 'running fast', adjustment: 'grind finer' }),
    saveAnalysis: vi.fn().mockImplementation(async (row) => ({ id: 'analysis-1', ...row })),
    ...overrides,
  };
}

describe('runAnalysis', () => {
  it('returns 404 when the shot is not found', async () => {
    const deps = makeDeps({ getShot: vi.fn().mockResolvedValue(null) });
    const res = await runAnalysis(deps, { shotId: 'missing' });
    expect(res.status).toBe(404);
    expect(deps.callGroq).not.toHaveBeenCalled();
  });

  it('returns 422 when yield_g is zero', async () => {
    const deps = makeDeps({ getShot: vi.fn().mockResolvedValue(makeShot({ yield_g: 0 })) });
    const res = await runAnalysis(deps, { shotId: 'shot-1' });
    expect(res.status).toBe(422);
    expect(deps.callGroq).not.toHaveBeenCalled();
  });

  it('asks getPriorShots for same-bag history when the shot has a bean', async () => {
    const deps = makeDeps({});
    await runAnalysis(deps, { shotId: 'shot-1' });
    expect(deps.getPriorShots).toHaveBeenCalledWith(expect.objectContaining({ id: 'shot-1' }), {
      mixedBeans: false,
    });
  });

  it('uses the mixedBeans path when the shot has no bean_name and no roast_date', async () => {
    const deps = makeDeps({
      getShot: vi.fn().mockResolvedValue(makeShot({ bean_name: null, roast_date: null })),
    });
    await runAnalysis(deps, { shotId: 'shot-1' });
    expect(deps.getPriorShots).toHaveBeenCalledWith(expect.anything(), { mixedBeans: true });
  });

  it('records history_count from the prior shots returned', async () => {
    const priors = Array.from({ length: 8 }, (_, i) => makeShot({ id: `p${i}` }));
    const deps = makeDeps({ getPriorShots: vi.fn().mockResolvedValue(priors) });
    const res = await runAnalysis(deps, { shotId: 'shot-1' });
    expect(deps.saveAnalysis).toHaveBeenCalledWith(expect.objectContaining({ history_count: 8 }));
    expect((res.body as { history_count: number }).history_count).toBe(8);
  });

  it('maps a GroqError(429) to status 429', async () => {
    const deps = makeDeps({
      callGroq: vi.fn().mockRejectedValue(new GroqError(429, 'rate limited')),
    });
    const res = await runAnalysis(deps, { shotId: 'shot-1' });
    expect(res.status).toBe(429);
    expect(deps.saveAnalysis).not.toHaveBeenCalled();
  });

  it('maps any other Groq failure to 502', async () => {
    const deps = makeDeps({ callGroq: vi.fn().mockRejectedValue(new Error('network')) });
    const res = await runAnalysis(deps, { shotId: 'shot-1' });
    expect(res.status).toBe(502);
  });

  it('returns 502 when the Groq result is missing a field', async () => {
    const deps = makeDeps({ callGroq: vi.fn().mockResolvedValue({ diagnosis: 'x' }) });
    const res = await runAnalysis(deps, { shotId: 'shot-1' });
    expect(res.status).toBe(502);
    expect(deps.saveAnalysis).not.toHaveBeenCalled();
  });

  it('returns 502 when a Groq field is longer than the sanity cap', async () => {
    const deps = makeDeps({
      callGroq: vi.fn().mockResolvedValue({ diagnosis: 'a'.repeat(601), adjustment: 'ok' }),
    });
    const res = await runAnalysis(deps, { shotId: 'shot-1' });
    expect(res.status).toBe(502);
  });

  it('saves the trimmed analysis and returns it on the happy path', async () => {
    const deps = makeDeps({
      callGroq: vi.fn().mockResolvedValue({ diagnosis: '  running fast  ', adjustment: 'grind finer' }),
    });
    const res = await runAnalysis(deps, { shotId: 'shot-1' });
    expect(res.status).toBe(200);
    expect(deps.saveAnalysis).toHaveBeenCalledWith({
      shot_id: 'shot-1',
      user_id: 'user-1',
      diagnosis: 'running fast',
      adjustment: 'grind finer',
      model: 'test-model',
      history_count: 0,
    });
    expect((res.body as { id: string }).id).toBe('analysis-1');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run supabase/functions/analyze-shot/orchestrator.test.ts`
Expected: FAIL, `orchestrator.ts` does not exist.

- [ ] **Step 3: Write `orchestrator.ts`**

```typescript
// supabase/functions/analyze-shot/orchestrator.ts
import { buildPrompt } from './prompt';
import { GroqError } from './types';
import type { Deps, Result, GroqResult, AnalysisRow } from './types';

const MAX_TEXT = 600;

function isValidGroqResult(value: unknown): value is GroqResult {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.diagnosis === 'string' &&
    typeof r.adjustment === 'string' &&
    r.diagnosis.trim().length > 0 &&
    r.adjustment.trim().length > 0 &&
    r.diagnosis.length <= MAX_TEXT &&
    r.adjustment.length <= MAX_TEXT
  );
}

export async function runAnalysis(deps: Deps, input: { shotId: string }): Promise<Result> {
  const shot = await deps.getShot(input.shotId);
  if (!shot) {
    return { status: 404, body: { error: 'Shot not found.' } };
  }

  if (shot.dose_g <= 0 || shot.yield_g <= 0) {
    return { status: 422, body: { error: "This shot's numbers can't be analyzed." } };
  }

  const mixedBeans = shot.bean_name == null && shot.roast_date == null;
  const priorShots = await deps.getPriorShots(shot, { mixedBeans });
  const messages = buildPrompt(shot, priorShots, { mixedBeans });

  let groqResult: GroqResult;
  try {
    groqResult = await deps.callGroq(messages);
  } catch (err) {
    const status = err instanceof GroqError ? err.status : 502;
    return { status, body: { error: 'The assistant is unavailable right now. Try again.' } };
  }

  if (!isValidGroqResult(groqResult)) {
    return { status: 502, body: { error: 'The assistant returned an unexpected response.' } };
  }

  const row: AnalysisRow = {
    shot_id: shot.id,
    user_id: shot.user_id,
    diagnosis: groqResult.diagnosis.trim(),
    adjustment: groqResult.adjustment.trim(),
    model: deps.model,
    history_count: priorShots.length,
  };

  const saved = await deps.saveAnalysis(row);
  return { status: 200, body: saved };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run supabase/functions/analyze-shot/orchestrator.test.ts`
Expected: PASS on all cases.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/analyze-shot/orchestrator.ts supabase/functions/analyze-shot/orchestrator.test.ts
git commit -m "feat: add analyze-shot orchestrator with full branch coverage"
```

---

### Task 5: `index.ts` Deno wiring and function config

**Files:**
- Create: `supabase/functions/analyze-shot/index.ts`
- Modify: `supabase/config.toml`

Note: `supabase/functions/.env.example` (with `GROQ_API_KEY`, `GROQ_MODEL`, `GROQ_BASE_URL`) and the root `.env.example` already exist, added ahead of this plan's execution. Task 5 only needs to consume them, not create them.

**Interfaces:**
- Consumes: `runAnalysis` from `./orchestrator` (Task 4); `GroqError`, `GroqMessages`, `GroqResult`, `ShotRow` from `./types` (Task 3).
- Produces: the deployed HTTP contract from the spec (`POST { shot_id }` with a bearer token). No exported symbols; nothing imports `index.ts`.

This task has no vitest coverage - all its logic lives in the pure files already tested. Its verification is that the Supabase functions runtime bundles and boots it without error, and the manual end-to-end run in Task 9.

- [ ] **Step 1: Write `index.ts`**

```typescript
// supabase/functions/analyze-shot/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { runAnalysis } from './orchestrator.ts';
import { GroqError } from './types.ts';
import type { GroqMessages, GroqResult, ShotRow } from './types.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const GROQ_BASE_URL = Deno.env.get('GROQ_BASE_URL') ?? 'https://api.groq.com/openai/v1';
const GROQ_MODEL = Deno.env.get('GROQ_MODEL') ?? 'llama-3.3-70b-versatile';
const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY') ?? '';

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

async function callGroq(messages: GroqMessages): Promise<GroqResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  let res: Response;
  try {
    res = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0.3,
        max_tokens: 400,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: messages.system },
          { role: 'user', content: messages.user },
        ],
      }),
      signal: controller.signal,
    });
  } catch (_err) {
    throw new GroqError(502, 'Groq request failed or timed out');
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 429) throw new GroqError(429, 'Groq rate limited');
  if (!res.ok) throw new GroqError(502, `Groq responded ${res.status}`);

  const completion = await res.json();
  const content = completion?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new GroqError(502, 'Groq response had no content');
  try {
    return JSON.parse(content) as GroqResult;
  } catch (_err) {
    throw new GroqError(502, 'Groq content was not JSON');
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed.' });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json(401, { error: 'Not signed in.' });

  let shotId: unknown;
  try {
    const body = await req.json();
    shotId = body?.shot_id;
  } catch (_err) {
    return json(400, { error: 'Invalid request body.' });
  }
  if (typeof shotId !== 'string' || !UUID_RE.test(shotId)) {
    return json(400, { error: 'shot_id must be a uuid.' });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const { status, body } = await runAnalysis(
    {
      model: GROQ_MODEL,
      getShot: async (id) => {
        const { data } = await supabase.from('shots').select('*').eq('id', id).maybeSingle();
        return (data as ShotRow | null) ?? null;
      },
      getPriorShots: async (shot, { mixedBeans }) => {
        let query = supabase
          .from('shots')
          .select('*')
          .lt('created_at', shot.created_at)
          .order('created_at', { ascending: false })
          .limit(8);
        if (!mixedBeans) {
          query =
            shot.bean_name == null
              ? query.is('bean_name', null)
              : query.eq('bean_name', shot.bean_name);
          query =
            shot.roast_date == null
              ? query.is('roast_date', null)
              : query.eq('roast_date', shot.roast_date);
        }
        const { data } = await query;
        return (data as ShotRow[] | null) ?? [];
      },
      callGroq,
      saveAnalysis: async (row) => {
        const { data, error } = await supabase
          .from('shot_analyses')
          .upsert(row, { onConflict: 'shot_id' })
          .select()
          .single();
        if (error) throw new Error(error.message);
        return data as Record<string, unknown>;
      },
    },
    { shotId }
  );

  return json(status, body);
});
```

- [ ] **Step 2: Add the function block to `supabase/config.toml`**

Append to the end of `supabase/config.toml`:

```toml
[functions.analyze-shot]
verify_jwt = true
```

`verify_jwt = true` makes the platform reject a missing or invalid JWT before the handler runs; the handler still forwards the token so RLS applies to its queries.

- [ ] **Step 3: Smoke-test that the function bundles and boots**

`supabase/functions/.env` already exists (see Preconditions).

Run: `npx supabase functions serve analyze-shot --env-file supabase/functions/.env`
Expected: it prints that it is serving `analyze-shot` with no bundling, import, or type error. Stop it with Ctrl-C.

If Docker or the stack is unavailable in this environment, skip the boot and instead confirm by inspection that every import path resolves and no `src/` import was introduced; note in the commit that the boot check is deferred to Task 9.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/analyze-shot/index.ts supabase/config.toml
git commit -m "feat: add analyze-shot edge function wiring and config"
```

---

### Task 6: client library `src/lib/analyses.ts`

**Files:**
- Create: `src/lib/analyses.ts`
- Create: `src/lib/analyses.test.ts`

**Interfaces:**
- Consumes: `supabase` from `src/lib/supabaseClient.ts` (existing).
- Produces: `type ShotAnalysis` (the `shot_analyses` row: `id`, `shot_id`, `user_id`, `diagnosis`, `adjustment`, `model`, `history_count`, `created_at`, `updated_at`), `class AnalyzeError extends Error { status: number }`, `getAnalysisForShot(shotId: string): Promise<ShotAnalysis | null>`, `analyzeShot(shotId: string): Promise<ShotAnalysis>`, all from `src/lib/analyses.ts`. Tasks 7 and 8 import these.

`getAnalysisForShot` is a one-line supabase select of the same shape as the untested `getVideoForShot` in `src/lib/videos.ts`; it is exercised through the Task 8 page test (which mocks this module) and the Task 9 manual run, not a dedicated unit test. The unit test here covers `analyzeShot`'s error mapping, which is the only non-trivial logic.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/analyses.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { analyzeShot, AnalyzeError } from './analyses';
import { supabase } from './supabaseClient';

vi.mock('./supabaseClient', () => ({
  supabase: { functions: { invoke: vi.fn() } },
}));

const invoke = vi.mocked(supabase.functions.invoke);

function httpError(status: number, bodyJson: unknown) {
  return {
    name: 'FunctionsHttpError',
    context: { status, json: async () => bodyJson },
  };
}

beforeEach(() => {
  invoke.mockReset();
});

describe('analyzeShot', () => {
  it('returns the row on success', async () => {
    const row = { id: 'a1', shot_id: 's1', diagnosis: 'd', adjustment: 'x' };
    invoke.mockResolvedValue({ data: row, error: null } as never);
    await expect(analyzeShot('s1')).resolves.toEqual(row);
    expect(invoke).toHaveBeenCalledWith('analyze-shot', { body: { shot_id: 's1' } });
  });

  it('throws AnalyzeError with the status and server message on 422', async () => {
    invoke.mockResolvedValue({
      data: null,
      error: httpError(422, { error: "This shot's numbers can't be analyzed." }),
    } as never);
    await expect(analyzeShot('s1')).rejects.toMatchObject({
      status: 422,
      message: "This shot's numbers can't be analyzed.",
    });
    await expect(analyzeShot('s1')).rejects.toBeInstanceOf(AnalyzeError);
  });

  it('maps 429 and 502 to AnalyzeError with that status', async () => {
    invoke.mockResolvedValue({ data: null, error: httpError(429, {}) } as never);
    await expect(analyzeShot('s1')).rejects.toMatchObject({ status: 429 });

    invoke.mockResolvedValue({ data: null, error: httpError(502, {}) } as never);
    await expect(analyzeShot('s1')).rejects.toMatchObject({ status: 502 });
  });

  it('falls back to status 0 and a generic message when there is no context', async () => {
    invoke.mockResolvedValue({ data: null, error: { name: 'FunctionsFetchError' } } as never);
    await expect(analyzeShot('s1')).rejects.toMatchObject({ status: 0 });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/analyses.test.ts`
Expected: FAIL, `analyses.ts` does not exist.

- [ ] **Step 3: Write `src/lib/analyses.ts`**

```typescript
// src/lib/analyses.ts
import { supabase } from './supabaseClient';

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
  constructor(status: number, message: string) {
    super(message);
    this.name = 'AnalyzeError';
    this.status = status;
  }
}

const GENERIC_MESSAGE = 'The assistant is unavailable right now. Try again.';

export async function getAnalysisForShot(shotId: string): Promise<ShotAnalysis | null> {
  const { data, error } = await supabase
    .from('shot_analyses')
    .select()
    .eq('shot_id', shotId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function analyzeShot(shotId: string): Promise<ShotAnalysis> {
  const { data, error } = await supabase.functions.invoke('analyze-shot', {
    body: { shot_id: shotId },
  });

  if (error) {
    const context = (error as { context?: { status?: number; json?: () => Promise<unknown> } })
      .context;
    const status = context?.status ?? 0;
    let message = GENERIC_MESSAGE;
    try {
      const parsed = (await context?.json?.()) as { error?: string } | undefined;
      if (parsed?.error) message = parsed.error;
    } catch (_err) {
      // keep the generic message
    }
    throw new AnalyzeError(status, message);
  }

  return data as ShotAnalysis;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/analyses.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/analyses.ts src/lib/analyses.test.ts
git commit -m "feat: add analyses client library for the barista assistant"
```

---

### Task 7: `ShotAssistant` component

**Files:**
- Create: `src/components/ShotAssistant.tsx`
- Create: `src/components/ShotAssistant.test.tsx`

**Interfaces:**
- Consumes: `analyzeShot`, `AnalyzeError`, `type ShotAnalysis` from `src/lib/analyses.ts` (Task 6).
- Produces: `ShotAssistant` component, props `{ shotId: string; initialAnalysis: ShotAnalysis | null }`, from `src/components/ShotAssistant.tsx`. Task 8 renders it.

- [ ] **Step 1: Write the failing tests**

Create `src/components/ShotAssistant.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ShotAssistant } from './ShotAssistant';
import { analyzeShot, AnalyzeError, type ShotAnalysis } from '../lib/analyses';

vi.mock('../lib/analyses', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/analyses')>();
  return { ...actual, analyzeShot: vi.fn() };
});

const analyzeShotMock = vi.mocked(analyzeShot);

const analysis: ShotAnalysis = {
  id: 'a1',
  shot_id: 's1',
  user_id: 'u1',
  diagnosis: 'Running fast, under-extracted.',
  adjustment: 'Grind finer, aim for 30-32s.',
  model: 'llama-3.3-70b-versatile',
  history_count: 3,
  created_at: '2026-09-04T07:42:00Z',
  updated_at: '2026-09-04T07:42:00Z',
};

beforeEach(() => {
  analyzeShotMock.mockReset();
});

describe('ShotAssistant', () => {
  it('offers analysis when there is none yet', () => {
    render(<ShotAssistant shotId="s1" initialAnalysis={null} />);
    expect(screen.getByText('Barista assistant')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Analyze this shot' })).toBeInTheDocument();
  });

  it('renders the diagnosis, adjustment, and metadata line for an existing analysis', () => {
    render(<ShotAssistant shotId="s1" initialAnalysis={analysis} />);
    expect(screen.getByText(/Running fast, under-extracted\./)).toBeInTheDocument();
    expect(screen.getByText(/Grind finer, aim for 30-32s\./)).toBeInTheDocument();
    expect(screen.getByText(/llama-3\.3-70b-versatile/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Re-analyze' })).toBeInTheDocument();
  });

  it('shows the running label while analysis is in flight, then the result', async () => {
    let resolve: (v: ShotAnalysis) => void = () => {};
    analyzeShotMock.mockReturnValue(new Promise((r) => (resolve = r)));

    render(<ShotAssistant shotId="s1" initialAnalysis={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Analyze this shot' }));

    expect(screen.getByRole('button', { name: 'Analyzing...' })).toBeDisabled();
    resolve(analysis);
    await waitFor(() => expect(screen.getByText(/Grind finer/)).toBeInTheDocument());
  });

  it('shows the 422 message and keeps an existing analysis visible', async () => {
    analyzeShotMock.mockRejectedValue(new AnalyzeError(422, 'server text'));
    render(<ShotAssistant shotId="s1" initialAnalysis={analysis} />);

    fireEvent.click(screen.getByRole('button', { name: 'Re-analyze' }));
    await waitFor(() =>
      expect(screen.getByText("This shot's numbers can't be analyzed.")).toBeInTheDocument()
    );
    expect(screen.getByText(/Running fast, under-extracted\./)).toBeInTheDocument();
  });

  it('shows the generic message on a 502', async () => {
    analyzeShotMock.mockRejectedValue(new AnalyzeError(502, 'anything'));
    render(<ShotAssistant shotId="s1" initialAnalysis={null} />);

    fireEvent.click(screen.getByRole('button', { name: 'Analyze this shot' }));
    await waitFor(() =>
      expect(
        screen.getByText('The assistant is unavailable right now. Try again.')
      ).toBeInTheDocument()
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/ShotAssistant.test.tsx`
Expected: FAIL, `ShotAssistant.tsx` does not exist.

- [ ] **Step 3: Write `src/components/ShotAssistant.tsx`**

```tsx
// src/components/ShotAssistant.tsx
import { useState } from 'react';
import { analyzeShot, AnalyzeError, type ShotAnalysis } from '../lib/analyses';

type Props = {
  shotId: string;
  initialAnalysis: ShotAnalysis | null;
};

const GENERIC_MESSAGE = 'The assistant is unavailable right now. Try again.';

function messageForError(err: unknown): string {
  if (err instanceof AnalyzeError) {
    if (err.status === 422) return "This shot's numbers can't be analyzed.";
    if (err.status === 429 || err.status === 502) return GENERIC_MESSAGE;
    return err.message || GENERIC_MESSAGE;
  }
  return GENERIC_MESSAGE;
}

function formatAnalyzedAt(iso: string): string {
  const date = new Date(iso);
  const day = date.toLocaleDateString(undefined, { weekday: 'short' });
  const time = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return `${day} ${time}`;
}

export function ShotAssistant({ shotId, initialAnalysis }: Props) {
  const [analysis, setAnalysis] = useState<ShotAnalysis | null>(initialAnalysis);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    setError(null);
    try {
      setAnalysis(await analyzeShot(shotId));
    } catch (err) {
      setError(messageForError(err));
    } finally {
      setRunning(false);
    }
  }

  const buttonLabel = running ? 'Analyzing...' : analysis ? 'Re-analyze' : 'Analyze this shot';

  return (
    <section
      className="border-t border-[var(--color-divider)]"
      style={{ padding: 'var(--space-3) var(--space-4)' }}
    >
      <div
        className="num"
        style={{
          fontSize: '11px',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          opacity: 0.55,
        }}
      >
        Barista assistant
      </div>

      {analysis ? (
        <div style={{ marginTop: 'var(--space-2)' }}>
          <p style={{ fontSize: '13px', margin: 0 }}>
            <span style={{ color: 'var(--color-neutral-700)' }}>Diagnosis. </span>
            {analysis.diagnosis}
          </p>
          <p style={{ fontSize: '13px', margin: 'var(--space-1) 0 0' }}>
            <span style={{ color: 'var(--color-neutral-700)' }}>Next shot. </span>
            {analysis.adjustment}
          </p>
          <div className="num" style={{ fontSize: '11px', opacity: 0.5, marginTop: 'var(--space-2)' }}>
            Analyzed {formatAnalyzedAt(analysis.updated_at)} · {analysis.model}
          </div>
        </div>
      ) : (
        <p style={{ fontSize: '13px', opacity: 0.7, margin: 'var(--space-2) 0 0' }}>
          A read of this shot's numbers against the bag so far.
        </p>
      )}

      {error && (
        <p
          style={{
            color: 'var(--color-accent-800)',
            fontSize: '13px',
            marginTop: 'var(--space-2)',
          }}
        >
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={run}
        disabled={running}
        className="h-9 px-3 flex items-center border rounded-[var(--radius-md)] text-sm hover:bg-[var(--color-accent-100)] active:bg-[var(--color-accent-200)]"
        style={{
          marginTop: 'var(--space-2)',
          borderColor: analysis ? 'var(--color-divider)' : 'var(--color-accent)',
          color: analysis ? 'var(--color-neutral-700)' : 'var(--color-accent)',
        }}
      >
        {buttonLabel}
      </button>
    </section>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/ShotAssistant.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/ShotAssistant.tsx src/components/ShotAssistant.test.tsx
git commit -m "feat: add ShotAssistant section component"
```

---

### Task 8: wire `ShotAssistant` into `ShotDetailPage`

**Files:**
- Modify: `src/pages/ShotDetailPage.tsx`
- Modify: `src/pages/ShotDetailPage.test.tsx`

**Interfaces:**
- Consumes: `getAnalysisForShot`, `type ShotAnalysis` from `src/lib/analyses.ts` (Task 6); `ShotAssistant` from `src/components/ShotAssistant.tsx` (Task 7).
- Produces: no new exports. The detail page now fetches the persisted analysis on load and renders the assistant section between the delta block and the tasting note.

- [ ] **Step 1: Add the `../lib/analyses` mock to the existing test file and write the failing test**

In `src/pages/ShotDetailPage.test.tsx`, add near the other `vi.mock` calls:

```typescript
import { getAnalysisForShot } from '../lib/analyses';

vi.mock('../lib/analyses', () => ({
  getAnalysisForShot: vi.fn(),
  analyzeShot: vi.fn(),
  AnalyzeError: class AnalyzeError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));
```

In the `beforeEach` (or at the top of each existing test that renders the page), default the mock so existing tests still pass:

```typescript
beforeEach(() => {
  vi.mocked(getAnalysisForShot).mockResolvedValue(null);
});
```

(If there is already a `beforeEach`, add the line to it. If not, add one inside the `describe`.)

Then add this test:

```typescript
it('renders the Barista assistant section after load', async () => {
  vi.mocked(getShot).mockResolvedValue(shot);
  vi.mocked(listShots).mockResolvedValue([shot]);
  vi.mocked(getVideoForShot).mockResolvedValue(null);
  vi.mocked(getAnalysisForShot).mockResolvedValue(null);

  renderAtShot('shot-1');

  await waitFor(() => expect(screen.getByText('Barista assistant')).toBeInTheDocument());
  expect(screen.getByRole('button', { name: 'Analyze this shot' })).toBeInTheDocument();
});

it('shows an existing analysis on load', async () => {
  vi.mocked(getShot).mockResolvedValue(shot);
  vi.mocked(listShots).mockResolvedValue([shot]);
  vi.mocked(getVideoForShot).mockResolvedValue(null);
  vi.mocked(getAnalysisForShot).mockResolvedValue({
    id: 'a1',
    shot_id: 'shot-1',
    user_id: 'user-1',
    diagnosis: 'Running fast.',
    adjustment: 'Grind finer.',
    model: 'llama-3.3-70b-versatile',
    history_count: 2,
    created_at: '2026-09-04T07:42:00Z',
    updated_at: '2026-09-04T07:42:00Z',
  });

  renderAtShot('shot-1');

  await waitFor(() => expect(screen.getByText(/Running fast\./)).toBeInTheDocument());
  expect(screen.getByRole('button', { name: 'Re-analyze' })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `npx vitest run src/pages/ShotDetailPage.test.tsx`
Expected: the two new tests FAIL (no "Barista assistant" text); existing tests still PASS because `getAnalysisForShot` is mocked to `null`.

- [ ] **Step 3: Wire the page**

In `src/pages/ShotDetailPage.tsx`:

Add imports:

```typescript
import { getAnalysisForShot, type ShotAnalysis } from '../lib/analyses';
import { ShotAssistant } from '../components/ShotAssistant';
```

Add state next to the other `useState` calls:

```typescript
  const [analysis, setAnalysis] = useState<ShotAnalysis | null>(null);
  const [analysisReady, setAnalysisReady] = useState(false);
```

Add an effect next to the existing video effect:

```typescript
  useEffect(() => {
    if (!id) return;
    getAnalysisForShot(id)
      .then(setAnalysis)
      .catch(() => setAnalysis(null))
      .finally(() => setAnalysisReady(true));
  }, [id]);
```

Render the section between the delta block and the tasting note. Find:

```tsx
      {shot.tasting_note && (
```

and immediately before it insert:

```tsx
      {analysisReady && <ShotAssistant shotId={shot.id} initialAnalysis={analysis} />}

```

Rationale for `analysisReady`: `ShotAssistant` seeds its own state from `initialAnalysis` at mount, so the page must not mount it until the fetch has settled or an already-saved analysis would be missed.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/pages/ShotDetailPage.test.tsx`
Expected: PASS, all tests including the two new ones.

- [ ] **Step 5: Run the full suite and the build**

Run: `npx vitest run`
Expected: PASS, every test file. (The local Supabase stack is running and `.env.test.local` is set, so the integration tests pass too.)

Run: `npm run build`
Expected: `tsc` and `vite build` both succeed. `tsc` covers `src` and `tests`; it does not compile `supabase/functions`, which is expected.

- [ ] **Step 6: Commit**

```bash
git add src/pages/ShotDetailPage.tsx src/pages/ShotDetailPage.test.tsx
git commit -m "feat: show the barista assistant on the shot detail page"
```

---

### Task 9: end-to-end verification and documentation

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/mvp_spec.md`

**Interfaces:**
- Consumes: everything from Tasks 1-8, plus a working `GROQ_API_KEY` in `supabase/functions/.env` (already placed there by the human).
- Produces: a verified deployed feature and updated status docs.

If the Groq key in `supabase/functions/.env` turns out to be missing or invalid when Step 1 runs, stop and report that Steps 2-4 are blocked on a working key.

- [ ] **Step 1: Local end-to-end run**

With the local Supabase stack and the function running:

```bash
npx supabase start
npx supabase functions serve analyze-shot --env-file supabase/functions/.env
```

In another terminal run the app (`npm run dev`), sign in, and work through the checklist from `docs/barista-assistant-design.md` section 6 "Manual, end to end":
- a shot with several prior same-bag shots returns a diagnosis and one adjustment
- a shot with only 1-2 priors opens the diagnosis with the limited-signal caveat
- re-analyze overwrites the row in place (check the section's timestamp changes, and `select count(*) from shot_analyses where shot_id = ...` stays 1)
- reload the page: the analysis comes back
- a shot with no bean name still returns, framed as "may be different beans"
- confirm an error surfaces inline (temporarily set a bad `GROQ_API_KEY`, click Analyze, expect "The assistant is unavailable right now. Try again." and no page blank)

Record the outcome (pass, or the specific failure) in this task's checkbox note.

- [ ] **Step 2: Deploy**

```bash
npx supabase secrets set GROQ_API_KEY=<key> GROQ_MODEL=<model>
npx supabase functions deploy analyze-shot
npx supabase db push
```

Then in the deployed app, analyze one shot and confirm it returns and persists.

- [ ] **Step 3: Update `CLAUDE.md`**

- In "Data model", add a bullet after the `videos` bullet:

```
- `shot_analyses`: one row per shot (unique `shot_id`, 1:1), holding
  the barista assistant's `diagnosis`, `adjustment`, the `model` that
  produced them, and `history_count`. Denormalized `user_id` for RLS,
  mirroring `videos`. Written only by the `analyze-shot` Edge Function.
```

- Add a new section after "Video handling":

```
## Barista assistant

On-demand shot troubleshooting on the shot detail page. The
`analyze-shot` Supabase Edge Function reads the shot plus up to 8 prior
same-bag shots through the caller's JWT (RLS enforces ownership), calls
Groq (free tier, key held server-side in the function's env, never in
the client), and upserts a `shot_analyses` row. Design and rationale:
`docs/barista-assistant-design.md`. No CV dependency; this is Phase 2
piece B from `docs/mvp_spec.md`.
```

- [ ] **Step 4: Update `docs/mvp_spec.md`**

In the "Phase 2 - Make the Data Work For You" section, at the end of the
**B. Barista Assistant v0** paragraph, add:

```
Implemented 2026-09-09; see `docs/barista-assistant-design.md` and
`docs/superpowers/plans/2026-09-09-barista-assistant-v0.md`.
```

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md docs/mvp_spec.md
git commit -m "docs: record barista assistant v0 as implemented"
```

---

## Self-Review

**Spec coverage:**
- Data model (spec section 1) -> Task 1.
- Edge function contract and flow (section 2) -> Tasks 3, 4, 5; error statuses covered in `orchestrator.test.ts` (404, 422, 429, 502) and `index.ts` (400, 401, 405).
- Prompt (section 3) -> Task 3.
- Client library (section 4) -> Task 6.
- UI section and states (section 5) -> Tasks 7, 8.
- Testing (section 6): unit -> Tasks 2-4, 6, 7; integration RLS -> Task 1; manual checklist -> Task 9.
- Prerequisites (section 7) -> env files already in place (Preconditions block); Groq key verified in Task 9 Step 1.
- Testability structure (section 2 subsection) -> the `shot-math` / `prompt` / `orchestrator` / `index` split is Tasks 2-5.

**Placeholder scan:** No "TBD"/"handle errors appropriately"/"similar to Task N". Every code step has literal content. The one deliberately deferred item is Task 5's boot smoke-test when Docker is unavailable, with an explicit inspection fallback and re-check in Task 9.

**Type consistency:** `ShotRow`, `GroqMessages`, `GroqResult`, `AnalysisRow`, `Deps`, `Result`, `GroqError` defined in Task 3's `types.ts` and used with the same shapes in Tasks 4 and 5. `buildPrompt(shot, priorShots, { mixedBeans }, now?)` signature identical in Task 3's definition, its tests, and Task 4's call. `runAnalysis(deps, { shotId })` identical in Task 4 and Task 5. `ShotAnalysis`, `AnalyzeError`, `getAnalysisForShot`, `analyzeShot` identical across Tasks 6, 7, 8. `getPriorShots(shot, { mixedBeans })` two-arg form consistent between `types.ts`, `orchestrator.ts`, `orchestrator.test.ts`, and `index.ts`.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-09-barista-assistant-v0.md`. Two execution options:

1. **Subagent-Driven (recommended)** - a fresh subagent per task, two-stage review between tasks, fast iteration.
2. **Inline Execution** - execute tasks in this session via `superpowers:executing-plans`, batched with checkpoints for review.

Note: env files are already in place. Task 9 verifies the Groq key works and then deploys. Tasks 1-8 can be built and verified now; Task 1 and its integration test need the local Supabase stack (`npx supabase start`, Docker running).

Which approach?
