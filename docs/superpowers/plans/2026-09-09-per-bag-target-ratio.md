# Per-Bag Target Ratio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user set a target brew ratio per bag and thread it through the log-a-shot form, the shot detail readout, the Trends ratio chart, and the "dialed" judgment on the shot list.

**Architecture:** A new `bag_targets` table holds one nullable row per bag, keyed by the same `bean_name` + `roast_date` pairing `groupShotsByBag` uses. A small `src/lib/bagTargets.ts` reads and writes it (RLS is the ownership check). `src/lib/shotView.ts` gains `targetForBag` and `ratioDelta` helpers, and `bagState` gains a target-aware branch. The form owns the target as page state and persists it on shot save; the three read-only surfaces load the target list alongside their existing shot load and resolve it per bag.

**Tech Stack:** React 18 + Vite, TypeScript, Supabase (Postgres 17 + Auth + RLS), Vitest + Testing Library, hand-drawn SVG charts (no charting library).

**Spec:** `docs/target-ratio-design.md`

## Global Constraints

- No em dashes anywhere (code comments, docs, commit messages, UI copy). Use a hyphen or restructure. UI "no target" state is labelled `Off`, not a dash.
- Do not estimate or emphasize development time in any plan, doc, commit message, or status update.
- No new npm dependencies.
- Charts are hand-drawn SVG. Do not add a charting library.
- Frontend talks to Supabase directly. No backend/API layer. RLS (`user_id = auth.uid()`) is the per-user isolation boundary on every table.
- `target_ratio` is stored as a plain number. Quick picks are `1:2 / 1:2.5 / 1:3`; the value is adjustable by 0.1 from there, clamped to `(0.5, 10)`.
- A bag with no `bag_targets` row has no target: `bagState` falls back to today's shot-to-shot convergence rule, no goal line, no delta shown. Targets never auto-default from another bag.
- Follow existing patterns: `src/theme.css` tokens and the `.fig` / `.num` utility classes for styling; `src/lib/videos.ts` for the shape of a lib module; the button and segmented-control treatment in `docs/superpowers/plans/2026-09-04-design-foundation.md`.

---

## File Structure

**Created:**
- `supabase/migrations/00000000000005_bag_targets.sql` - the table, its unique index, RLS policies, updated-at trigger. (`00000000000004` is taken by the shipped `shot_analyses` migration.)
- `src/lib/bagTargets.ts` - `BagTarget` type, `listBagTargets`, `setBagTarget`.
- `src/lib/bagTargets.test.ts` - integration test against local Supabase, styled like `src/lib/shots.test.ts`.
- `src/components/RatioTargetControl.tsx` - the `Off / 1:2 / 1:2.5 / 1:3` segmented control plus 0.1 nudge buttons.
- `src/components/RatioTargetControl.test.tsx` - its unit tests.

**Modified:**
- `src/lib/shotView.ts` - add `targetForBag`, `ratioDelta`; change `bagState` to an options object with a target branch.
- `src/lib/shotView.test.ts` - migrate `bagState` calls to the options form; add target-branch and `targetForBag` / `ratioDelta` tests.
- `src/components/ShotForm.tsx` - optional `target` / `onTargetChange` props; render the control on the existing Ratio row; show a live actual-minus-target delta.
- `src/components/ShotForm.test.tsx` - two new tests.
- `src/pages/NewShotPage.tsx` - load targets, seed from the selected bag, persist on save.
- `src/pages/NewShotPage.test.tsx` - add the `bagTargets` mock; seed / persist tests.
- `src/pages/EditShotPage.tsx` - load targets, seed from the shot's bag, persist on save.
- `src/pages/EditShotPage.test.tsx` - add the `bagTargets` mock; seed / persist tests.
- `src/pages/ShotListPage.tsx` - load targets, pass the resolved target into both `bagState` calls.
- `src/pages/ShotListPage.test.tsx` - add the `bagTargets` mock; a dialed-against-target test.
- `src/pages/ShotDetailPage.tsx` - load targets, render the `target 1:X` readout line.
- `src/pages/ShotDetailPage.test.tsx` - add the `bagTargets` mock; readout present / absent tests.
- `src/pages/TrendsPage.tsx` - load the target for the selected bag, draw the goal line.
- `src/pages/TrendsPage.test.tsx` - add the `bagTargets` mock; goal-line present / absent tests.
- `tests/integration/rls.test.ts` - `bag_targets` cross-user isolation and unique-index cases.
- `CLAUDE.md` - `bag_targets` in the data model section; a note on `bagState`.
- `docs/mvp_spec.md` - a roadmap entry.

---

## Running tests

- Pure / component tests: `npx vitest run <path>` (jsdom, no external services).
- Integration tests (`src/lib/bagTargets.test.ts`, `tests/integration/rls.test.ts`) need local Supabase up with the new migration applied and `.env.test.local` present with `SUPABASE_LOCAL_SERVICE_ROLE_KEY` and `VITE_SUPABASE_ANON_KEY`:
  ```bash
  npx supabase start
  npx supabase migration up   # applies the new migration without wiping local data
  npx vitest run tests/integration/rls.test.ts src/lib/bagTargets.test.ts
  ```
- Full run before the final commit: `npx vitest run` with local Supabase up.

### Mocking `listBagTargets` in existing page tests (Tasks 7-11)

All five pages call `listBagTargets()` in a mount effect and chain
`.then/.catch/.finally` on the result. A bare `vi.fn()` returns
`undefined`, so `.then` throws synchronously inside the effect and the
test fails - and `NewShotPage` / `EditShotPage` additionally gate their
form render on `bagTargetsLoaded`, which never flips if the promise
chain throws. So **every** test in these files, not just the new ones,
needs `listBagTargets` mocked to resolve an array.

- `ShotDetailPage.test.tsx` and `NewShotPage.test.tsx` have a `beforeEach`
  (`NewShotPage` calls `vi.clearAllMocks()` first): add
  `vi.mocked(listBagTargets).mockResolvedValue([])` there, after any
  `clearAllMocks`. `NewShotPage` also needs
  `vi.mocked(setBagTarget).mockResolvedValue(undefined)`.
- `ShotListPage.test.tsx`, `TrendsPage.test.tsx`, `EditShotPage.test.tsx`
  have **no** `beforeEach` and set mocks inline per test. Add
  `beforeEach(() => { vi.mocked(listBagTargets).mockResolvedValue([]); })`
  (import `beforeEach` from `vitest`), placed after any existing
  top-level mock setup and not clobbering a per-test `mockResolvedValue`.
  `EditShotPage` also needs the `setBagTarget` default.

### Test helper names (Tasks 7-11)

The plan's task steps use placeholder render-helper names. The real ones:
`EditShotPage.test.tsx` and `ShotDetailPage.test.tsx` both use
`renderAtShot(id)`; `NewShotPage.test.tsx`, `ShotListPage.test.tsx`, and
`TrendsPage.test.tsx` have no helper and render
`<MemoryRouter>...<Page /></MemoryRouter>` inline per test. `TrendsPage`'s
shot fixture is named `shots` (an array), not `baseShot`.

---

## Task 1: `bag_targets` table and RLS isolation

**Files:**
- Create: `supabase/migrations/00000000000005_bag_targets.sql`
- Test: `tests/integration/rls.test.ts` (append two `it` blocks in a new `describe`)

**Interfaces:**
- Consumes: the `set_updated_at()` trigger function and `auth.users` table from `supabase/migrations/00000000000001_shots_and_videos.sql`.
- Produces: a `bag_targets` table with columns `id uuid`, `user_id uuid`, `bean_name text null`, `roast_date date null`, `target_ratio numeric`, `created_at timestamptz`, `updated_at timestamptz`; a unique index on `(user_id, bean_name, roast_date) nulls not distinct`; four `bag_targets_*_own` RLS policies.

> The shipped `00000000000004_shot_analyses.sql` (Barista Assistant) takes slot 4, so this migration is `00000000000005`. Local Postgres is major version 17 (`supabase/config.toml`), so `nulls not distinct` is supported.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/00000000000005_bag_targets.sql`:

```sql
-- supabase/migrations/00000000000005_bag_targets.sql

create table bag_targets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bean_name text,
  roast_date date,
  target_ratio numeric not null check (target_ratio > 0.5 and target_ratio < 10),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index bag_targets_bag_idx
  on bag_targets (user_id, bean_name, roast_date) nulls not distinct;

create index bag_targets_user_id_idx on bag_targets (user_id);

alter table bag_targets enable row level security;

create policy "bag_targets_select_own" on bag_targets
  for select using (auth.uid() = user_id);
create policy "bag_targets_insert_own" on bag_targets
  for insert with check (auth.uid() = user_id);
create policy "bag_targets_update_own" on bag_targets
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "bag_targets_delete_own" on bag_targets
  for delete using (auth.uid() = user_id);

create trigger bag_targets_set_updated_at
before update on bag_targets
for each row execute function set_updated_at();
```

- [ ] **Step 2: Apply the migration to local Supabase**

Run:
```bash
npx supabase start
npx supabase migration up
```
Expected: the new migration applies with no error and prints `Applying migration 00000000000005_bag_targets.sql...`. (Use `npx supabase db reset` only if migration history is out of sync; it replays every migration and wipes local data.)

- [ ] **Step 3: Write the failing RLS tests**

Append to `tests/integration/rls.test.ts`, after the `videos RLS isolation` describe block:

```ts
describe('bag_targets RLS isolation', () => {
  it("user cannot select, update, or delete another user's bag target", async () => {
    const a = await createTestUserClient(`rls-bt-a-${Date.now()}@test.local`);
    const b = await createTestUserClient(`rls-bt-b-${Date.now()}@test.local`);

    const { data: target, error: insertError } = await a.client
      .from('bag_targets')
      .insert({ user_id: a.userId, bean_name: 'Kenya', roast_date: '2026-08-23', target_ratio: 2 })
      .select()
      .single();
    expect(insertError).toBeNull();

    const { data: seenByB } = await b.client
      .from('bag_targets')
      .select()
      .eq('id', target!.id);
    expect(seenByB).toEqual([]);

    const { data: updated } = await b.client
      .from('bag_targets')
      .update({ target_ratio: 9 })
      .eq('id', target!.id)
      .select();
    expect(updated).toEqual([]);

    const { data: deleted } = await b.client
      .from('bag_targets')
      .delete()
      .eq('id', target!.id)
      .select();
    expect(deleted).toEqual([]);

    const { data: stillThere } = await a.client
      .from('bag_targets')
      .select()
      .eq('id', target!.id)
      .single();
    expect(Number(stillThere?.target_ratio)).toBe(2);
  });

  it('rejects a second target row for the same bag key, including a null-keyed bag', async () => {
    const a = await createTestUserClient(`rls-bt-c-${Date.now()}@test.local`);

    const first = await a.client
      .from('bag_targets')
      .insert({ user_id: a.userId, bean_name: null, roast_date: null, target_ratio: 2 })
      .select()
      .single();
    expect(first.error).toBeNull();

    const second = await a.client
      .from('bag_targets')
      .insert({ user_id: a.userId, bean_name: null, roast_date: null, target_ratio: 3 })
      .select()
      .single();
    expect(second.error).not.toBeNull();
  });
});
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/integration/rls.test.ts`
Expected: PASS, including the two new `bag_targets RLS isolation` cases.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/00000000000005_bag_targets.sql tests/integration/rls.test.ts
git commit -m "feat: add bag_targets table with per-user RLS

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RDzwbB7tmDu8igKYvqdShn"
```

---

## Task 2: `src/lib/bagTargets.ts`

**Files:**
- Create: `src/lib/bagTargets.ts`
- Test: `src/lib/bagTargets.test.ts`

**Interfaces:**
- Consumes: `supabase` from `src/lib/supabaseClient.ts`; the `bag_targets` table from Task 1.
- Produces:
  ```ts
  export type BagTarget = {
    id: string;
    user_id: string;
    bean_name: string | null;
    roast_date: string | null;
    target_ratio: number;
    created_at: string;
    updated_at: string;
  };
  export function listBagTargets(): Promise<BagTarget[]>;
  export function setBagTarget(
    bag: { bean_name: string | null; roast_date: string | null },
    targetRatio: number | null
  ): Promise<void>;
  ```
  `setBagTarget` with `null` deletes any existing row (no-op if none); with a number it updates the existing row's `target_ratio` or inserts a new row.

- [ ] **Step 1: Write the failing integration test**

Create `src/lib/bagTargets.test.ts` (mirrors the sign-in setup in `src/lib/shots.test.ts`):

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';
import { listBagTargets, setBagTarget } from './bagTargets';

const LOCAL_URL = 'http://127.0.0.1:54321';
const TEST_EMAIL = `bag-targets-${Date.now()}@test.local`;
const TEST_PASSWORD = 'test-password-123';

const kenya = { bean_name: 'Kenya Nyeri AA', roast_date: '2026-08-23' };
const unlabeled = { bean_name: null, roast_date: null };

beforeAll(async () => {
  const admin = createClient(LOCAL_URL, process.env.SUPABASE_LOCAL_SERVICE_ROLE_KEY!);
  await admin.auth.admin.createUser({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  const { error } = await supabase.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });
  if (error) throw error;
});

afterAll(async () => {
  await supabase.auth.signOut();
});

describe('bagTargets', () => {
  it('sets a target and lists it back', async () => {
    await setBagTarget(kenya, 2);
    const targets = await listBagTargets();
    const match = targets.find(
      (t) => t.bean_name === kenya.bean_name && t.roast_date === kenya.roast_date
    );
    expect(match).toBeTruthy();
    expect(Number(match!.target_ratio)).toBe(2);
  });

  it('overwrites the existing row instead of creating a second one', async () => {
    await setBagTarget(kenya, 2);
    await setBagTarget(kenya, 2.5);
    const matches = (await listBagTargets()).filter(
      (t) => t.bean_name === kenya.bean_name && t.roast_date === kenya.roast_date
    );
    expect(matches).toHaveLength(1);
    expect(Number(matches[0].target_ratio)).toBe(2.5);
  });

  it('clears a target when passed null', async () => {
    await setBagTarget(kenya, 2.5);
    await setBagTarget(kenya, null);
    const matches = (await listBagTargets()).filter(
      (t) => t.bean_name === kenya.bean_name && t.roast_date === kenya.roast_date
    );
    expect(matches).toHaveLength(0);
  });

  it('is a no-op when clearing a bag that has no target', async () => {
    await expect(setBagTarget(unlabeled, null)).resolves.toBeUndefined();
  });

  it('handles the null-keyed (unlabeled) bag', async () => {
    await setBagTarget(unlabeled, 3);
    const match = (await listBagTargets()).find(
      (t) => t.bean_name === null && t.roast_date === null
    );
    expect(Number(match?.target_ratio)).toBe(3);
    await setBagTarget(unlabeled, null);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/bagTargets.test.ts`
Expected: FAIL - `bagTargets` module has no exports / `setBagTarget is not a function`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/bagTargets.ts`:

```ts
import { supabase } from './supabaseClient';

export type BagTarget = {
  id: string;
  user_id: string;
  bean_name: string | null;
  roast_date: string | null;
  target_ratio: number;
  created_at: string;
  updated_at: string;
};

type BagRef = { bean_name: string | null; roast_date: string | null };

export async function listBagTargets(): Promise<BagTarget[]> {
  const { data, error } = await supabase.from('bag_targets').select();
  if (error) throw error;
  return data ?? [];
}

async function findTargetId(bag: BagRef): Promise<string | null> {
  let query = supabase.from('bag_targets').select('id');
  query = bag.bean_name === null
    ? query.is('bean_name', null)
    : query.eq('bean_name', bag.bean_name);
  query = bag.roast_date === null
    ? query.is('roast_date', null)
    : query.eq('roast_date', bag.roast_date);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

export async function setBagTarget(bag: BagRef, targetRatio: number | null): Promise<void> {
  const existingId = await findTargetId(bag);

  if (targetRatio === null) {
    if (!existingId) return;
    const { error } = await supabase.from('bag_targets').delete().eq('id', existingId);
    if (error) throw error;
    return;
  }

  if (existingId) {
    const { error } = await supabase
      .from('bag_targets')
      .update({ target_ratio: targetRatio })
      .eq('id', existingId);
    if (error) throw error;
    return;
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error('Not signed in');

  const { error } = await supabase.from('bag_targets').insert({
    user_id: userData.user.id,
    bean_name: bag.bean_name,
    roast_date: bag.roast_date,
    target_ratio: targetRatio,
  });
  if (error) throw error;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/bagTargets.test.ts`
Expected: PASS (5 cases). Local Supabase must be running with Task 1's migration applied.

- [ ] **Step 5: Commit**

```bash
git add src/lib/bagTargets.ts src/lib/bagTargets.test.ts
git commit -m "feat: add bagTargets lib for per-bag target ratio CRUD

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RDzwbB7tmDu8igKYvqdShn"
```

---

## Task 3: `targetForBag` and `ratioDelta` in `shotView.ts`

**Files:**
- Modify: `src/lib/shotView.ts` (add two exports; add one import)
- Test: `src/lib/shotView.test.ts` (add two describe blocks)

**Interfaces:**
- Consumes: `BagTarget` from `src/lib/bagTargets.ts`; existing `bagKey`, `ratio` in the same file.
- Produces:
  ```ts
  export function targetForBag(
    targets: BagTarget[],
    bag: { bean_name: string | null; roast_date: string | null }
  ): number | null;
  export function ratioDelta(
    shot: Pick<Shot, 'dose_g' | 'yield_g'>,
    targetRatio: number
  ): number; // ratio(shot) - targetRatio
  ```

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/shotView.test.ts`. Extend the top import to include the new names:

```ts
import {
  groupShotsByBag,
  bagState,
  referenceShot,
  deltas,
  ratio,
  formatRatio,
  daysSinceRoast,
  targetForBag,
  ratioDelta,
} from './shotView';
import type { BagTarget } from './bagTargets';
```

Then append:

```ts
function makeTarget(overrides: Partial<BagTarget>): BagTarget {
  return {
    id: 'target-1',
    user_id: 'user-1',
    bean_name: 'Kenya Nyeri AA',
    roast_date: '2026-08-23',
    target_ratio: 2,
    created_at: '2026-09-04T07:42:00Z',
    updated_at: '2026-09-04T07:42:00Z',
    ...overrides,
  };
}

describe('targetForBag', () => {
  it('returns the target_ratio for the matching bag key', () => {
    const targets = [makeTarget({ bean_name: 'Kenya Nyeri AA', roast_date: '2026-08-23', target_ratio: 2.5 })];
    expect(targetForBag(targets, { bean_name: 'Kenya Nyeri AA', roast_date: '2026-08-23' })).toBe(2.5);
  });

  it('matches the null-keyed unlabeled bag', () => {
    const targets = [makeTarget({ bean_name: null, roast_date: null, target_ratio: 3 })];
    expect(targetForBag(targets, { bean_name: null, roast_date: null })).toBe(3);
  });

  it('returns null when no target matches', () => {
    const targets = [makeTarget({ bean_name: 'Kenya Nyeri AA', roast_date: '2026-08-23' })];
    expect(targetForBag(targets, { bean_name: 'Colombia', roast_date: '2026-08-23' })).toBeNull();
  });

  it('returns null for an empty target list', () => {
    expect(targetForBag([], { bean_name: 'Kenya', roast_date: null })).toBeNull();
  });
});

describe('ratioDelta', () => {
  it('returns actual ratio minus the target', () => {
    expect(ratioDelta({ dose_g: 18, yield_g: 41.4 }, 2)).toBeCloseTo(0.3);
  });

  it('is negative when the shot is tighter than the target', () => {
    expect(ratioDelta({ dose_g: 18, yield_g: 34.2 }, 2)).toBeCloseTo(-0.1);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/lib/shotView.test.ts`
Expected: FAIL - `targetForBag`/`ratioDelta` are not exported.

- [ ] **Step 3: Implement**

In `src/lib/shotView.ts`, add near the top with the other imports:

```ts
import type { BagTarget } from './bagTargets';
```

Add after the existing `ratio` function:

```ts
export function targetForBag(
  targets: BagTarget[],
  bag: { bean_name: string | null; roast_date: string | null }
): number | null {
  if (!targets || targets.length === 0) return null;
  const key = bagKey(bag);
  const match = targets.find((t) => bagKey(t) === key);
  return match ? match.target_ratio : null;
}

export function ratioDelta(
  shot: Pick<Shot, 'dose_g' | 'yield_g'>,
  targetRatio: number
): number {
  return ratio(shot) - targetRatio;
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run src/lib/shotView.test.ts`
Expected: PASS (existing cases plus the new `targetForBag` and `ratioDelta` blocks).

- [ ] **Step 5: Commit**

```bash
git add src/lib/shotView.ts src/lib/shotView.test.ts
git commit -m "feat: add targetForBag and ratioDelta helpers

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RDzwbB7tmDu8igKYvqdShn"
```

---

## Task 4: `bagState` options object and target branch

**Files:**
- Modify: `src/lib/shotView.ts` (`bagState` signature and body; update the docstring)
- Test: `src/lib/shotView.test.ts` (migrate existing `bagState` calls; add target cases)

**Interfaces:**
- Consumes: existing `ratio`, `daysSinceRoast`, `DIALED_RATIO_TOLERANCE` (0.15), `DIALED_TIME_TOLERANCE_S` (2), `PAST_PEAK_MIN_DAYS`, `RESTING_MAX_DAYS` in the same file.
- Produces:
  ```ts
  export function bagState(
    bagShots: Shot[],
    options?: { targetRatio?: number | null; now?: Date }
  ): BagStateValue;
  ```
  With `targetRatio` set: `dialed` when both of the last two shots are within `DIALED_RATIO_TOLERANCE` of `targetRatio` and their pull times are within `DIALED_TIME_TOLERANCE_S`. With `targetRatio` null/omitted: unchanged from today (shot-to-shot ratio convergence). Roast-age `resting` / `past-peak` bookends still evaluated first and unchanged.

- [ ] **Step 1: Update existing tests to the options form and add the new cases**

In `src/lib/shotView.test.ts`, change every existing `bagState(shots, new Date('2026-09-04'))` call (there are five, around lines 79-111) to `bagState(shots, { now: new Date('2026-09-04') })`. Then add inside the `describe('bagState', ...)` block:

```ts
it('is dialed when both recent shots sit within tolerance of the target', () => {
  const shots = [
    makeShot({ id: 'a', roast_date: '2026-08-10', dose_g: 18, yield_g: 36.9, pull_time_s: 29 }), // 1:2.05
    makeShot({ id: 'b', roast_date: '2026-08-10', dose_g: 18, yield_g: 35.5, pull_time_s: 28 }), // 1:1.97
  ];
  expect(bagState(shots, { targetRatio: 2, now: new Date('2026-09-04') })).toBe('dialed');
});

it('is dialing when a recent shot is outside the target band, even if the two shots agree', () => {
  const shots = [
    makeShot({ id: 'a', roast_date: '2026-08-10', dose_g: 18, yield_g: 45, pull_time_s: 30 }), // 1:2.5
    makeShot({ id: 'b', roast_date: '2026-08-10', dose_g: 18, yield_g: 45.5, pull_time_s: 31 }), // 1:2.53
  ];
  expect(bagState(shots, { targetRatio: 2, now: new Date('2026-09-04') })).toBe('dialing');
});

it('is dialing when on target but pull times are more than 2s apart', () => {
  const shots = [
    makeShot({ id: 'a', roast_date: '2026-08-10', dose_g: 18, yield_g: 36, pull_time_s: 34 }),
    makeShot({ id: 'b', roast_date: '2026-08-10', dose_g: 18, yield_g: 36, pull_time_s: 28 }),
  ];
  expect(bagState(shots, { targetRatio: 2, now: new Date('2026-09-04') })).toBe('dialing');
});

it('still returns resting before applying the target branch', () => {
  const shots = [
    makeShot({ id: 'a', roast_date: '2026-09-02', dose_g: 18, yield_g: 45 }),
    makeShot({ id: 'b', roast_date: '2026-09-02', dose_g: 18, yield_g: 45 }),
  ];
  expect(bagState(shots, { targetRatio: 2, now: new Date('2026-09-04') })).toBe('resting');
});
```

- [ ] **Step 2: Run to verify the new cases fail**

Run: `npx vitest run src/lib/shotView.test.ts`
Expected: FAIL - `bagState` does not accept an options object / ignores `targetRatio`. TypeScript errors on `{ now: ... }` are expected too.

- [ ] **Step 3: Rewrite `bagState`**

In `src/lib/shotView.ts`, replace the `bagState` function. Update its docstring to describe the target branch:

```ts
/**
 * See "Assumptions this plan makes where the schema is silent", item 3, in
 * the plan bagState was first implemented from: exactly one shot always
 * means no tag; roast-date bookends take precedence over any dial-in
 * check when roast_date is known.
 *
 * When `options.targetRatio` is set (the bag has a bag_targets row),
 * "dialed" means the last two shots each land within DIALED_RATIO_TOLERANCE
 * of that target and within DIALED_TIME_TOLERANCE_S of each other on pull
 * time. When it is not set, "dialed" falls back to shot-to-shot ratio
 * convergence between the last two shots.
 */
export function bagState(
  bagShots: Shot[],
  options: { targetRatio?: number | null; now?: Date } = {}
): BagStateValue {
  const { targetRatio = null, now = new Date() } = options;
  if (bagShots.length <= 1) return null;

  const [latest, previous] = bagShots;

  if (latest.roast_date) {
    const age = daysSinceRoast(latest.roast_date, now);
    if (age > PAST_PEAK_MIN_DAYS) return 'past-peak';
    if (age < RESTING_MAX_DAYS) return 'resting';
  }

  const timeStable = Math.abs(latest.pull_time_s - previous.pull_time_s) <= DIALED_TIME_TOLERANCE_S;

  if (targetRatio != null) {
    const onTarget = (s: Shot) => Math.abs(ratio(s) - targetRatio) <= DIALED_RATIO_TOLERANCE;
    return onTarget(latest) && onTarget(previous) && timeStable ? 'dialed' : 'dialing';
  }

  const ratioDiff = Math.abs(ratio(latest) - ratio(previous));
  return ratioDiff <= DIALED_RATIO_TOLERANCE && timeStable ? 'dialed' : 'dialing';
}
```

- [ ] **Step 4: Run to verify all pass**

Run: `npx vitest run src/lib/shotView.test.ts`
Expected: PASS (all `bagState` cases, old and new).

- [ ] **Step 5: Check nothing else broke**

Run: `npx vitest run src/pages/ShotListPage.test.tsx`
Expected: PASS. `ShotListPage` still calls `bagState(bag.shots)` with one argument, which is valid against the new optional-options signature. If this fails to compile, do not change `ShotListPage` here - it is updated in Task 9. Fix only a genuine type error in this file's own call.

- [ ] **Step 6: Commit**

```bash
git add src/lib/shotView.ts src/lib/shotView.test.ts
git commit -m "feat: make bagState target-aware via an options object

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RDzwbB7tmDu8igKYvqdShn"
```

---

## Task 5: `RatioTargetControl` component

**Files:**
- Create: `src/components/RatioTargetControl.tsx`
- Test: `src/components/RatioTargetControl.test.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks (pure presentational).
- Produces:
  ```ts
  export function RatioTargetControl(props: {
    value: number | null;
    onChange: (next: number | null) => void;
  }): JSX.Element;
  ```
  Buttons carry `aria-label`: `No target`, `Target 1:2`, `Target 1:2.5`, `Target 1:3`, `Decrease target`, `Increase target`. Quick picks step to 2 / 2.5 / 3; clicking the active quick pick calls `onChange(null)`. Nudge buttons step by 0.1, clamped to `[0.6, 9.9]` effective range (0.1 inside the DB `(0.5, 10)` bounds), and render only when `value !== null`.

- [ ] **Step 1: Write the failing tests**

Create `src/components/RatioTargetControl.test.tsx`:

```ts
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { RatioTargetControl } from './RatioTargetControl';

describe('RatioTargetControl', () => {
  it('marks the Off button pressed when value is null', () => {
    render(<RatioTargetControl value={null} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'No target' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Target 1:2' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('marks the matching quick pick pressed', () => {
    render(<RatioTargetControl value={2.5} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Target 1:2.5' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('calls onChange with the quick-pick value', () => {
    const onChange = vi.fn();
    render(<RatioTargetControl value={null} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Target 1:3' }));
    expect(onChange).toHaveBeenCalledWith(3);
  });

  it('clears the target when the active quick pick is clicked again', () => {
    const onChange = vi.fn();
    render(<RatioTargetControl value={2} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Target 1:2' }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('hides the nudge buttons when there is no target', () => {
    render(<RatioTargetControl value={null} onChange={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Increase target' })).not.toBeInTheDocument();
  });

  it('nudges by 0.1 and shows the current value', () => {
    const onChange = vi.fn();
    render(<RatioTargetControl value={2} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Increase target' }));
    expect(onChange).toHaveBeenCalledWith(2.1);
    expect(screen.getByText('1:2.0')).toBeInTheDocument();
  });

  it('clamps the low end to 0.6', () => {
    const onChange = vi.fn();
    render(<RatioTargetControl value={0.6} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Decrease target' }));
    expect(onChange).toHaveBeenCalledWith(0.6);
  });

  it('shows no quick pick pressed after nudging off a quick-pick value', () => {
    render(<RatioTargetControl value={2.4} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Target 1:2' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Target 1:2.5' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('1:2.4')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/components/RatioTargetControl.test.tsx`
Expected: FAIL - module does not exist.

- [ ] **Step 3: Implement**

Create `src/components/RatioTargetControl.tsx`:

```tsx
type Props = {
  value: number | null;
  onChange: (next: number | null) => void;
};

const QUICK_PICKS = [2, 2.5, 3];
const STEP = 0.1;
const MIN = 0.6;
const MAX = 9.9;

function clamp(n: number): number {
  return Math.min(MAX, Math.max(MIN, Math.round(n * 10) / 10));
}

function formatPick(p: number): string {
  return Number.isInteger(p) ? `1:${p}` : `1:${p}`;
}

export function RatioTargetControl({ value, onChange }: Props) {
  const segmentBase =
    'text-[13px] px-2 py-1 rounded-[var(--radius-sm)] border';
  const segmentOff = 'border-[var(--color-divider)] text-[var(--color-neutral-700)]';
  const segmentOn = 'border-[var(--color-accent)] text-[var(--color-accent)]';

  return (
    <div className="flex items-center justify-between" style={{ paddingTop: 'var(--space-2)' }}>
      <span style={{ fontSize: '12px', opacity: 0.65 }}>Target</span>
      <div className="flex items-center" style={{ gap: 'var(--space-2)' }}>
        <div className="flex" style={{ gap: '4px' }}>
          <button
            type="button"
            aria-label="No target"
            aria-pressed={value === null}
            onClick={() => onChange(null)}
            className={`${segmentBase} ${value === null ? segmentOn : segmentOff}`}
          >
            Off
          </button>
          {QUICK_PICKS.map((p) => (
            <button
              key={p}
              type="button"
              aria-label={`Target ${formatPick(p)}`}
              aria-pressed={value === p}
              onClick={() => onChange(value === p ? null : p)}
              className={`${segmentBase} ${value === p ? segmentOn : segmentOff}`}
            >
              {formatPick(p)}
            </button>
          ))}
        </div>
        {value !== null && (
          <div className="flex items-center" style={{ gap: '4px' }}>
            <button
              type="button"
              aria-label="Decrease target"
              onClick={() => onChange(clamp(value - STEP))}
              className="w-8 h-8 border border-[var(--color-divider)] rounded-[var(--radius-sm)] hover:bg-[var(--color-accent-100)] active:bg-[var(--color-accent-200)]"
            >
              &minus;
            </button>
            <span className="fig" style={{ fontSize: '13px', minWidth: '34px', textAlign: 'center' }}>
              1:{value.toFixed(1)}
            </span>
            <button
              type="button"
              aria-label="Increase target"
              onClick={() => onChange(clamp(value + STEP))}
              className="w-8 h-8 border border-[var(--color-divider)] rounded-[var(--radius-sm)] hover:bg-[var(--color-accent-100)] active:bg-[var(--color-accent-200)]"
            >
              +
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
```

(`formatPick` keeps both branches identical for now; it exists so a future change to how whole-number picks render has one home. Leave it.)

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run src/components/RatioTargetControl.test.tsx`
Expected: PASS (8 cases).

- [ ] **Step 5: Commit**

```bash
git add src/components/RatioTargetControl.tsx src/components/RatioTargetControl.test.tsx
git commit -m "feat: add RatioTargetControl segmented control

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RDzwbB7tmDu8igKYvqdShn"
```

---

## Task 6: Wire the target control into `ShotForm`

**Files:**
- Modify: `src/components/ShotForm.tsx` (props; the Ratio row)
- Test: `src/components/ShotForm.test.tsx` (two new cases)

**Interfaces:**
- Consumes: `RatioTargetControl` from Task 5; `formatSigned` (already imported in `ShotForm.tsx`).
- Produces: two new optional props on `ShotForm`:
  ```ts
  target?: number | null;         // default null
  onTargetChange?: (next: number | null) => void;  // default no-op
  ```
  When `target` is a number and the form's dose/yield parse to a positive ratio, the Ratio readout shows `formatSigned(ratioValue - target, 2)` beside the ratio in `--color-accent-700`.

- [ ] **Step 1: Write the failing tests**

Add these cases inside the existing `describe('ShotForm', ...)` block in `src/components/ShotForm.test.tsx` (no new imports needed - `render`, `screen`, `fireEvent`, `vi` are already imported there):

```ts
it('shows the actual-minus-target delta on the ratio row when a target is set', () => {
  render(
    <ShotForm
      referenceValues={reference}
      initialValues={{ ...reference, dose_g: '18.0', yield_g: '41.4' }}
      submitLabel="Save shot"
      onSubmit={vi.fn()}
      target={2}
      onTargetChange={vi.fn()}
    />
  );
  // ratio 41.4 / 18 = 2.30, target 2 -> +0.30
  expect(screen.getByText('+0.30')).toBeInTheDocument();
});

it('shows no target delta when target is null', () => {
  render(
    <ShotForm
      referenceValues={reference}
      initialValues={{ ...reference, dose_g: '18.0', yield_g: '41.4' }}
      submitLabel="Save shot"
      onSubmit={vi.fn()}
      target={null}
      onTargetChange={vi.fn()}
    />
  );
  expect(screen.queryByText('+0.30')).not.toBeInTheDocument();
});

it('forwards a quick-pick click to onTargetChange', () => {
  const onTargetChange = vi.fn();
  render(
    <ShotForm
      referenceValues={reference}
      initialValues={reference}
      submitLabel="Save shot"
      onSubmit={vi.fn()}
      target={null}
      onTargetChange={onTargetChange}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: 'Target 1:2' }));
  expect(onTargetChange).toHaveBeenCalledWith(2);
});
```

The `reference` fixture at the top of the file already sets `dose_g` / `yield_g`; the tests override them inline so the ratio math is predictable.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/components/ShotForm.test.tsx`
Expected: FAIL - `ShotForm` has no `target` prop; no `Target 1:2` button rendered.

- [ ] **Step 3: Implement**

In `src/components/ShotForm.tsx`:

Add the import near the top:
```ts
import { RatioTargetControl } from './RatioTargetControl';
```

Extend `Props`:
```ts
type Props = {
  referenceValues: ShotFormValues;
  initialValues: ShotFormValues;
  submitLabel: string;
  onSubmit: (values: ShotFormValues) => Promise<void>;
  target?: number | null;
  onTargetChange?: (next: number | null) => void;
  children?: ReactNode;
};
```

Update the destructure and add a safe handler:
```ts
export function ShotForm({
  referenceValues,
  initialValues,
  submitLabel,
  onSubmit,
  target = null,
  onTargetChange,
  children,
}: Props) {
```

Replace the Ratio row block (currently the `div` with `Ratio` label and the `1:` figure) with:

```tsx
<div
  style={{
    margin: '0 var(--space-4)',
    padding: 'var(--space-3) 0',
    borderTop: '1px solid var(--color-divider)',
    borderBottom: '1px solid var(--color-divider)',
  }}
>
  <div className="flex justify-between items-baseline">
    <span style={{ fontSize: '12px', opacity: 0.65 }}>Ratio</span>
    {ratioValue != null && (
      <span className="fig" style={{ fontSize: '23px' }}>
        <span className="fig" style={{ fontWeight: 400, color: 'var(--color-neutral-700)' }}>
          1:
        </span>
        {ratioValue.toFixed(2)}
        {target != null && (
          <span
            className="fig"
            style={{ fontSize: '14px', color: 'var(--color-accent-700)', marginLeft: '6px' }}
          >
            {formatSigned(ratioValue - target, 2)}
          </span>
        )}
      </span>
    )}
  </div>
  <RatioTargetControl value={target} onChange={(next) => onTargetChange?.(next)} />
</div>
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run src/components/ShotForm.test.tsx`
Expected: PASS (existing cases plus the three new ones).

- [ ] **Step 5: Commit**

```bash
git add src/components/ShotForm.tsx src/components/ShotForm.test.tsx
git commit -m "feat: show target ratio control and delta on the shot form

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RDzwbB7tmDu8igKYvqdShn"
```

---

## Task 7: `NewShotPage` loads, seeds, and persists the target

**Files:**
- Modify: `src/pages/NewShotPage.tsx`
- Test: `src/pages/NewShotPage.test.tsx`

**Interfaces:**
- Consumes: `listBagTargets`, `setBagTarget`, `BagTarget` from `src/lib/bagTargets.ts`; `targetForBag` from `src/lib/shotView.ts`; the `target` / `onTargetChange` props from Task 6.
- Produces: no new exports. Behavior - on submit, after the shot is created, `setBagTarget({ bean_name, roast_date }, target)` is called only when `target` differs from what `targetForBag` resolves for that bag from the loaded list.

- [ ] **Step 1: Write the failing tests**

In `src/pages/NewShotPage.test.tsx`, add a `bagTargets` mock alongside the existing mocks:

```ts
import { listBagTargets, setBagTarget } from '../lib/bagTargets';

vi.mock('../lib/bagTargets', () => ({
  listBagTargets: vi.fn(),
  setBagTarget: vi.fn(),
}));
```

The file's `beforeEach` is just `vi.clearAllMocks()`; add the defaults after it:
```ts
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listBagTargets).mockResolvedValue([]);
  vi.mocked(setBagTarget).mockResolvedValue(undefined);
});
```

Add these tests (the file has a `referenceShot` fixture with `bean_name: 'Kenya Nyeri AA'`, `roast_date: '2026-08-23'`, and renders inline with `render(<MemoryRouter><NewShotPage /></MemoryRouter>)`):

```ts
it('seeds the target control from the selected bag\'s stored target', async () => {
  vi.mocked(listShots).mockResolvedValue([referenceShot]);
  vi.mocked(listBagTargets).mockResolvedValue([
    {
      id: 't1',
      user_id: 'user-1',
      bean_name: referenceShot.bean_name,
      roast_date: referenceShot.roast_date,
      target_ratio: 2,
      created_at: '2026-09-04T00:00:00Z',
      updated_at: '2026-09-04T00:00:00Z',
    },
  ]);

  render(
    <MemoryRouter>
      <NewShotPage />
    </MemoryRouter>
  );

  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Target 1:2' })).toHaveAttribute('aria-pressed', 'true')
  );
});

it('persists a changed target on save', async () => {
  vi.mocked(listShots).mockResolvedValue([referenceShot]);
  vi.mocked(listBagTargets).mockResolvedValue([]);
  vi.mocked(createShot).mockResolvedValue({ ...referenceShot, id: 'shot-new' });

  render(
    <MemoryRouter>
      <NewShotPage />
    </MemoryRouter>
  );

  await waitFor(() => screen.getByRole('button', { name: 'Target 1:3' }));
  fireEvent.click(screen.getByRole('button', { name: 'Target 1:3' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save shot' }));

  await waitFor(() =>
    expect(setBagTarget).toHaveBeenCalledWith(
      { bean_name: referenceShot.bean_name, roast_date: referenceShot.roast_date },
      3
    )
  );
});

it('does not call setBagTarget when the target is unchanged', async () => {
  vi.mocked(listShots).mockResolvedValue([referenceShot]);
  vi.mocked(listBagTargets).mockResolvedValue([]);
  vi.mocked(createShot).mockResolvedValue({ ...referenceShot, id: 'shot-new' });

  render(
    <MemoryRouter>
      <NewShotPage />
    </MemoryRouter>
  );

  await waitFor(() => screen.getByRole('button', { name: 'Save shot' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save shot' }));

  await waitFor(() => expect(createShot).toHaveBeenCalled());
  expect(setBagTarget).not.toHaveBeenCalled();
});
```

If the test file has no shared render helper, use the same inline `render(<MemoryRouter ...><NewShotPage/></MemoryRouter>)` the other tests in the file use.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/pages/NewShotPage.test.tsx`
Expected: FAIL - `Cannot find module '../lib/bagTargets'` mock target mismatch, or `Target 1:2` button not found (page does not render the control wired).

- [ ] **Step 3: Implement**

In `src/pages/NewShotPage.tsx`:

Add imports:
```ts
import { listBagTargets, setBagTarget, type BagTarget } from '../lib/bagTargets';
import { groupShotsByBag, referenceShot as pickReferenceShot, sameBag, bagKey, toFormValues, targetForBag, type Bag } from '../lib/shotView';
```
(extend the existing `shotView` import with `targetForBag`.)

Add state near the other `useState` calls:
```ts
const [bagTargets, setBagTargets] = useState<BagTarget[]>([]);
const [bagTargetsLoaded, setBagTargetsLoaded] = useState(false);
const [target, setTarget] = useState<number | null>(null);
```

Load targets in their own mount effect, always flipping the loaded flag
(a failed load falls back to `[]`, same as `listShots` failures elsewhere):
```ts
useEffect(() => {
  listBagTargets()
    .then(setBagTargets)
    .catch(() => setBagTargets([]))
    .finally(() => setBagTargetsLoaded(true));
}, []);
```

Seed `target` from the resolved bag. The seed only runs once targets have
loaded and re-runs only when the bag *identity* changes (the picker, or
confirming a new bag), never when `bagTargets` itself settles - so a value
the user picks is never clobbered by a late load. `bagForTarget` for a
confirmed new bag reuses `targetForBag`: an identical `bean_name` +
`roast_date` is the same bag everywhere else in the app (see
`groupShotsByBag`), so resolving its stored target here is correct, not an
auto-default.
```ts
const bagForTarget = newBagConfirmed
  ? { bean_name: newBeanName || null, roast_date: newRoastDate || null }
  : selectedBag
  ? { bean_name: selectedBag.bean_name, roast_date: selectedBag.roast_date }
  : null;

useEffect(() => {
  if (!bagTargetsLoaded) return;
  setTarget(bagForTarget ? targetForBag(bagTargets, bagForTarget) : null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [bagForTarget?.bean_name, bagForTarget?.roast_date, bagTargetsLoaded]);
```

Gate the `ShotForm` render on `bagTargetsLoaded` too, so the target control
never mounts before its seed value is known. Where the form is rendered,
change `{formValues && !showNewBagFields && (` to
`{formValues && !showNewBagFields && bagTargetsLoaded && (`.

In `handleSubmit`, compute the bag ref once and persist the target after the shot exists, before the video upload:
```ts
async function handleSubmit(values: ShotFormValues) {
  let shotId = createdShotId;
  const bagRef = { bean_name: values.bean_name || null, roast_date: values.roast_date || null };
  if (!shotId) {
    const shot = await createShot({
      grind_setting: values.grind_setting,
      dose_g: Number(values.dose_g),
      yield_g: Number(values.yield_g),
      pull_time_s: Number(values.pull_time_s),
      bean_name: values.bean_name || null,
      roast_date: values.roast_date || null,
      rating: values.rating ? Number(values.rating) : null,
      tasting_note: values.tasting_note || null,
    });
    shotId = shot.id;
    setCreatedShotId(shotId);
  }
  if (target !== targetForBag(bagTargets, bagRef)) {
    await setBagTarget(bagRef, target);
  }
  if (videoFile) {
    await uploadShotVideo(shotId, videoFile);
  }
  navigate(`/shots/${shotId}`);
}
```

Pass the props to `ShotForm`:
```tsx
<ShotForm
  key={seedShot ? seedShot.id : selectedBag ? bagKey(selectedBag) : 'new-bag'}
  referenceValues={formValues}
  initialValues={formValues}
  submitLabel="Save shot"
  onSubmit={handleSubmit}
  target={target}
  onTargetChange={setTarget}
>
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run src/pages/NewShotPage.test.tsx`
Expected: PASS (existing cases plus the three new ones).

- [ ] **Step 5: Commit**

```bash
git add src/pages/NewShotPage.tsx src/pages/NewShotPage.test.tsx
git commit -m "feat: set and persist a bag target when logging a new shot

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RDzwbB7tmDu8igKYvqdShn"
```

---

## Task 8: `EditShotPage` loads, seeds, and persists the target

**Files:**
- Modify: `src/pages/EditShotPage.tsx`
- Test: `src/pages/EditShotPage.test.tsx`

**Interfaces:**
- Consumes: `listBagTargets`, `setBagTarget`, `BagTarget` from `src/lib/bagTargets.ts`; `targetForBag` from `src/lib/shotView.ts`; the `ShotForm` target props.
- Produces: no new exports. On submit, after `updateShot`, `setBagTarget` runs only when `target` differs from the loaded value for the shot's (possibly edited) bag.

- [ ] **Step 1: Write the failing tests**

In `src/pages/EditShotPage.test.tsx`, add:

```ts
import { listBagTargets, setBagTarget } from '../lib/bagTargets';

vi.mock('../lib/bagTargets', () => ({
  listBagTargets: vi.fn(),
  setBagTarget: vi.fn(),
}));
```

This file has no `beforeEach` today; add one (import `beforeEach` from `vitest`):
```ts
beforeEach(() => {
  vi.mocked(listBagTargets).mockResolvedValue([]);
  vi.mocked(setBagTarget).mockResolvedValue(undefined);
});
```

Tests. The file's `shot` fixture has `bean_name: 'Kenya Nyeri AA'`, `roast_date: '2026-08-23'`; the render helper is `renderAtShot(id)`:

```ts
it('seeds the target from the shot\'s bag', async () => {
  vi.mocked(getShot).mockResolvedValue(shot);
  vi.mocked(listBagTargets).mockResolvedValue([
    {
      id: 't1',
      user_id: 'user-1',
      bean_name: shot.bean_name,
      roast_date: shot.roast_date,
      target_ratio: 2.5,
      created_at: '2026-09-04T00:00:00Z',
      updated_at: '2026-09-04T00:00:00Z',
    },
  ]);

  renderAtShot('shot-1');

  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Target 1:2.5' })).toHaveAttribute('aria-pressed', 'true')
  );
});

it('writes the target on save when it changed', async () => {
  vi.mocked(getShot).mockResolvedValue(shot);
  vi.mocked(updateShot).mockResolvedValue({ ...shot });
  vi.mocked(listBagTargets).mockResolvedValue([]);

  renderAtShot('shot-1');

  await waitFor(() => screen.getByRole('button', { name: 'Target 1:2' }));
  fireEvent.click(screen.getByRole('button', { name: 'Target 1:2' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

  await waitFor(() =>
    expect(setBagTarget).toHaveBeenCalledWith(
      { bean_name: shot.bean_name, roast_date: shot.roast_date },
      2
    )
  );
});

it('does not write the target when it was not touched', async () => {
  vi.mocked(getShot).mockResolvedValue(shot);
  vi.mocked(updateShot).mockResolvedValue({ ...shot });
  vi.mocked(listBagTargets).mockResolvedValue([]);

  renderAtShot('shot-1');

  await waitFor(() => screen.getByRole('button', { name: 'Save changes' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

  await waitFor(() => expect(updateShot).toHaveBeenCalled());
  expect(setBagTarget).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/pages/EditShotPage.test.tsx`
Expected: FAIL - no `Target 1:2` control rendered; `setBagTarget` never called.

- [ ] **Step 3: Implement**

In `src/pages/EditShotPage.tsx`:

```ts
import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ShotForm, type ShotFormValues } from '../components/ShotForm';
import { getShot, updateShot, type Shot } from '../lib/shots';
import { toFormValues, targetForBag } from '../lib/shotView';
import { listBagTargets, setBagTarget, type BagTarget } from '../lib/bagTargets';
```

Add state:
```ts
const [bagTargets, setBagTargets] = useState<BagTarget[]>([]);
const [bagTargetsLoaded, setBagTargetsLoaded] = useState(false);
const [target, setTarget] = useState<number | null>(null);
```

Load targets in the mount effect (non-fatal), alongside `getShot`:
```ts
useEffect(() => {
  if (!id) return;
  getShot(id)
    .then(setShot)
    .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load shot'));
  listBagTargets()
    .then(setBagTargets)
    .catch(() => setBagTargets([]))
    .finally(() => setBagTargetsLoaded(true));
}, [id]);
```

Seed `target` once the shot and the targets are both available. Keyed on
the shot's bag identity, not on `bagTargets`, so a late load never clobbers
a value the user picked:
```ts
useEffect(() => {
  if (!shot || !bagTargetsLoaded) return;
  setTarget(targetForBag(bagTargets, shot));
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [shot?.bean_name, shot?.roast_date, bagTargetsLoaded]);
```

Gate the `ShotForm` render so the control never mounts before the seed is
known: change the loading guard from `if (shot === undefined) return <p>Loading...</p>;`
to `if (shot === undefined || !bagTargetsLoaded) return <p>Loading...</p>;`.

In `handleSubmit`, after `updateShot`:
```ts
async function handleSubmit(values: ShotFormValues) {
  if (!id) return;
  await updateShot(id, {
    grind_setting: values.grind_setting,
    dose_g: Number(values.dose_g),
    yield_g: Number(values.yield_g),
    pull_time_s: Number(values.pull_time_s),
    bean_name: values.bean_name || null,
    roast_date: values.roast_date || null,
    rating: values.rating ? Number(values.rating) : null,
    tasting_note: values.tasting_note || null,
  });
  const bagRef = { bean_name: values.bean_name || null, roast_date: values.roast_date || null };
  if (target !== targetForBag(bagTargets, bagRef)) {
    await setBagTarget(bagRef, target);
  }
  navigate(`/shots/${id}`);
}
```

Pass the props:
```tsx
<ShotForm
  key={id}
  referenceValues={values}
  initialValues={values}
  submitLabel="Save changes"
  onSubmit={handleSubmit}
  target={target}
  onTargetChange={setTarget}
/>
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run src/pages/EditShotPage.test.tsx`
Expected: PASS (existing plus the three new cases).

- [ ] **Step 5: Commit**

```bash
git add src/pages/EditShotPage.tsx src/pages/EditShotPage.test.tsx
git commit -m "feat: edit a bag target from the edit-shot form

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RDzwbB7tmDu8igKYvqdShn"
```

---

## Task 9: `ShotListPage` feeds the target into `bagState`

**Files:**
- Modify: `src/pages/ShotListPage.tsx`
- Test: `src/pages/ShotListPage.test.tsx`

**Interfaces:**
- Consumes: `listBagTargets`, `BagTarget` from `src/lib/bagTargets.ts`; `targetForBag` from `src/lib/shotView.ts`; the Task 4 `bagState(shots, { targetRatio })` signature.
- Produces: no new exports. `BagGroup` gains a `targets: BagTarget[]` prop and both `bagState` calls in the file pass `{ targetRatio: targetForBag(targets, bag) }`.

- [ ] **Step 1: Write the failing test**

In `src/pages/ShotListPage.test.tsx`, add the mock:

```ts
import { listBagTargets } from '../lib/bagTargets';

vi.mock('../lib/bagTargets', () => ({ listBagTargets: vi.fn() }));
```

This file has no `beforeEach` and calls `mockAuth()` + `vi.mocked(listShots).mockResolvedValue(...)` inline in every test. Add one:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
// ...
beforeEach(() => {
  vi.mocked(listBagTargets).mockResolvedValue([]);
});
```

Add a test. The file's `baseShot` fixture is a single shot; build a two-shot bag that sits at 1:2.5 and assert it reads dialed only when a 1:2.5 target exists. Set `roast_date: null` on every fixture below (shots and the target row) so the roast-age `resting` / `past-peak` bookends - which run against the real `new Date()` and would otherwise make this test time-dependent - never apply, leaving the target / convergence branch as the thing under test. Each test still calls `mockAuth()` like the existing ones, and renders inline with `<MemoryRouter><ShotListPage /></MemoryRouter>`:

```ts
it('shows Dialed when recent shots sit on the bag target', async () => {
  const onTarget = [
    { ...baseShot, id: 's2', dose_g: 18, yield_g: 45, pull_time_s: 30, roast_date: null },
    { ...baseShot, id: 's1', dose_g: 18, yield_g: 45, pull_time_s: 29, roast_date: null },
  ];
  vi.mocked(listShots).mockResolvedValue(onTarget);
  vi.mocked(listBagTargets).mockResolvedValue([
    {
      id: 't1',
      user_id: 'user-1',
      bean_name: baseShot.bean_name,
      roast_date: null,
      target_ratio: 2.5,
      created_at: '2026-09-04T00:00:00Z',
      updated_at: '2026-09-04T00:00:00Z',
    },
  ]);

  mockAuth();
  render(
    <MemoryRouter>
      <ShotListPage />
    </MemoryRouter>
  );

  expect(await screen.findByText('Dialed')).toBeInTheDocument();
});

it('falls back to convergence when the bag has no target', async () => {
  const spread = [
    { ...baseShot, id: 's2', dose_g: 18, yield_g: 45, pull_time_s: 30, roast_date: null },
    { ...baseShot, id: 's1', dose_g: 18, yield_g: 30, pull_time_s: 20, roast_date: null },
  ];
  vi.mocked(listShots).mockResolvedValue(spread);
  vi.mocked(listBagTargets).mockResolvedValue([]);

  mockAuth();
  render(
    <MemoryRouter>
      <ShotListPage />
    </MemoryRouter>
  );

  expect(await screen.findByText('Dialing')).toBeInTheDocument();
});
```

If `baseShot` sets `bean_name` too, the target row's `bean_name` above must match it (it already uses `baseShot.bean_name`). The key that `targetForBag` compares is `bean_name` plus `roast_date` together.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/pages/ShotListPage.test.tsx`
Expected: FAIL - `listBagTargets` mock not wired / bag shows `Dialing` because the target is not consulted.

- [ ] **Step 3: Implement**

In `src/pages/ShotListPage.tsx`:

Extend the imports (keep `bagLabel`, used by the bag heading):
```ts
import { groupShotsByBag, bagState, bagLabel, ratio, daysSinceRoast, deltas, bagKey, targetForBag, type Bag } from '../lib/shotView';
import { listBagTargets, type BagTarget } from '../lib/bagTargets';
```

Add state and load it in the mount effect:
```ts
const [bagTargets, setBagTargets] = useState<BagTarget[]>([]);

useEffect(() => {
  listShots()
    .then(setShots)
    .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load shots'));
  listBagTargets()
    .then(setBagTargets)
    .catch(() => setBagTargets([]));
}, []);
```

Give `BagGroup` the targets:
```tsx
function BagGroup({ bag, targets }: { bag: Bag; targets: BagTarget[] }) {
  const state = bagState(bag.shots, { targetRatio: targetForBag(targets, bag) });
  // ...rest unchanged
}
```

Pass it where `BagGroup` is rendered:
```tsx
{visibleBags.map((bag) => (
  <BagGroup key={bagKey(bag)} bag={bag} targets={bagTargets} />
))}
```
(Keep whatever `key` the file already uses.)

Update the `visibleBags` filter:
```ts
const visibleBags =
  filter === 'active'
    ? bags.filter(
        (bag) => bagState(bag.shots, { targetRatio: targetForBag(bagTargets, bag) }) !== 'past-peak'
      )
    : bags;
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/pages/ShotListPage.test.tsx`
Expected: PASS (existing plus the two new cases).

- [ ] **Step 5: Commit**

```bash
git add src/pages/ShotListPage.tsx src/pages/ShotListPage.test.tsx
git commit -m "feat: judge the dialed tag against the bag target on the shot list

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RDzwbB7tmDu8igKYvqdShn"
```

---

## Task 10: `ShotDetailPage` shows the target readout

**Files:**
- Modify: `src/pages/ShotDetailPage.tsx`
- Test: `src/pages/ShotDetailPage.test.tsx`

**Interfaces:**
- Consumes: `listBagTargets`, `BagTarget` from `src/lib/bagTargets.ts`; `targetForBag`, `ratioDelta` from `src/lib/shotView.ts`; `formatSigned` (already imported in the page).
- Produces: no new exports. When the shot's bag has a target, one line below the ratio / pull-time figures reads `target 1:X.X · +D.DD`.

- [ ] **Step 1: Write the failing tests**

In `src/pages/ShotDetailPage.test.tsx`, add the mock:

```ts
import { listBagTargets } from '../lib/bagTargets';

vi.mock('../lib/bagTargets', () => ({ listBagTargets: vi.fn() }));
```

Default it wherever mocks are reset:
```ts
vi.mocked(listBagTargets).mockResolvedValue([]);
```

Tests (the file's `shot` fixture: `dose_g: 18`, `yield_g: 36`, `bean_name: 'Kenya Nyeri AA'`, `roast_date: '2026-08-23'`; ratio is 1:2.00):

```ts
it('shows the target readout when the bag has a target', async () => {
  vi.mocked(getShot).mockResolvedValue(shot);
  vi.mocked(listShots).mockResolvedValue([shot]);
  vi.mocked(getVideoForShot).mockResolvedValue(null);
  vi.mocked(listBagTargets).mockResolvedValue([
    {
      id: 't1',
      user_id: 'user-1',
      bean_name: shot.bean_name,
      roast_date: shot.roast_date,
      target_ratio: 2.5,
      created_at: '2026-09-04T00:00:00Z',
      updated_at: '2026-09-04T00:00:00Z',
    },
  ]);

  renderAtShot('shot-1');

  // ratio 2.00 against target 2.5 -> -0.50
  expect(await screen.findByText(/target 1:2\.5/)).toBeInTheDocument();
  expect(screen.getByText(/−0\.50/)).toBeInTheDocument();
});

it('omits the target readout when the bag has no target', async () => {
  vi.mocked(getShot).mockResolvedValue(shot);
  vi.mocked(listShots).mockResolvedValue([shot]);
  vi.mocked(getVideoForShot).mockResolvedValue(null);
  vi.mocked(listBagTargets).mockResolvedValue([]);

  renderAtShot('shot-1');

  await screen.findByText(/Kenya Nyeri AA/);
  expect(screen.queryByText(/target 1:/)).not.toBeInTheDocument();
});
```

(`−` in the expected text is the same `MINUS_SIGN` `formatSigned` emits.)

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/pages/ShotDetailPage.test.tsx`
Expected: FAIL - `listBagTargets` mock unused / no `target 1:2.5` text.

- [ ] **Step 3: Implement**

In `src/pages/ShotDetailPage.tsx`:

Extend imports:
```ts
import { groupShotsByBag, deltas, ratio, daysSinceRoast, sameBag, targetForBag, ratioDelta } from '../lib/shotView';
import { formatMass, formatSigned, formatRoastAge } from '../lib/format';
import { listBagTargets, type BagTarget } from '../lib/bagTargets';
```

Add state:
```ts
const [bagTargets, setBagTargets] = useState<BagTarget[]>([]);
```

Load in the first effect (non-fatal), chained after the shot / list load:
```ts
useEffect(() => {
  if (!id) return;
  getShot(id)
    .then((s) => {
      setShot(s);
      if (!s) return;
      return listShots().then((all) => setPreviousShot(findPreviousShot(s, all)));
    })
    .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load shot'));
  listBagTargets()
    .then(setBagTargets)
    .catch(() => setBagTargets([]));
}, [id]);
```

After the `shot === null` guard, compute the target:
```ts
const target = targetForBag(bagTargets, shot);
```

In the `<div style={{ padding: 'var(--space-4) var(--space-4) var(--space-3)' }}>`
block (the one holding the bean/age/timestamp line and the
`<div className="flex items-baseline" style={{ gap: 'var(--space-4)' }}>`
with `RatioFigure` / `PullTimeFigure`), add this as the last child, right
after that flex row closes:
```tsx
{target != null && (
  <div
    className="num"
    style={{
      fontSize: '11px',
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      opacity: 0.55,
      marginTop: '4px',
    }}
  >
    target 1:{target.toFixed(1)} · {formatSigned(ratioDelta(shot, target), 2)}
  </div>
)}
```

`shot` here is the non-null `Shot` (past the `shot === null` guard), and
`targetForBag` / `ratioDelta` both accept a `{ bean_name, roast_date }` /
`{ dose_g, yield_g }` shape, so passing `shot` directly is fine.

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run src/pages/ShotDetailPage.test.tsx`
Expected: PASS (existing plus the two new cases).

- [ ] **Step 5: Commit**

```bash
git add src/pages/ShotDetailPage.tsx src/pages/ShotDetailPage.test.tsx
git commit -m "feat: show actual-vs-target ratio on the shot detail page

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RDzwbB7tmDu8igKYvqdShn"
```

---

## Task 11: `TrendsPage` draws the goal line

**Files:**
- Modify: `src/pages/TrendsPage.tsx`
- Test: `src/pages/TrendsPage.test.tsx`

**Interfaces:**
- Consumes: `listBagTargets`, `BagTarget` from `src/lib/bagTargets.ts`; `targetForBag` from `src/lib/shotView.ts`.
- Produces: no new exports. `RatioOverTimeChart` gains a `targetRatio: number | null` prop; when set, the y domain is extended to include it and a dashed `<line>` plus a small `1:X.X` `<text>` are drawn.

- [ ] **Step 1: Write the failing tests**

In `src/pages/TrendsPage.test.tsx`, add:

```ts
import { listBagTargets } from '../lib/bagTargets';

vi.mock('../lib/bagTargets', () => ({ listBagTargets: vi.fn() }));
```

Default it in a `beforeEach` (see the "Mocking `listBagTargets`" note - this
file has none today, so add one):
```ts
beforeEach(() => {
  vi.mocked(listBagTargets).mockResolvedValue([]);
});
```

Tests (the file's shot fixture is the array `shots`; build local arrays
off one of its entries):

```ts
it('draws the goal line and label when the selected bag has a target', async () => {
  const bagShots = [
    { ...shots[0], id: 's2', dose_g: 18, yield_g: 40, pull_time_s: 30 },
    { ...shots[0], id: 's1', dose_g: 18, yield_g: 38, pull_time_s: 28 },
  ];
  vi.mocked(listShots).mockResolvedValue(bagShots);
  vi.mocked(listBagTargets).mockResolvedValue([
    {
      id: 't1',
      user_id: 'user-1',
      bean_name: shots[0].bean_name,
      roast_date: shots[0].roast_date,
      target_ratio: 2.2,
      created_at: '2026-09-04T00:00:00Z',
      updated_at: '2026-09-04T00:00:00Z',
    },
  ]);

  const { container } = render(
    <MemoryRouter>
      <TrendsPage />
    </MemoryRouter>
  );

  // wait for the target-specific label, not just any <text>, so the assert
  // does not race the bagTargets load
  await waitFor(() => expect(container.textContent).toContain('1:2.2'));
  expect(container.querySelector('line[stroke-dasharray]')).toBeTruthy();
});

it('draws no goal line when the bag has no target', async () => {
  const bagShots = [
    { ...shots[0], id: 's2', dose_g: 18, yield_g: 40, pull_time_s: 30 },
    { ...shots[0], id: 's1', dose_g: 18, yield_g: 38, pull_time_s: 28 },
  ];
  vi.mocked(listShots).mockResolvedValue(bagShots);
  vi.mocked(listBagTargets).mockResolvedValue([]);

  const { container } = render(
    <MemoryRouter>
      <TrendsPage />
    </MemoryRouter>
  );

  await waitFor(() => expect(container.querySelector('svg')).toBeTruthy());
  expect(container.querySelector('line[stroke-dasharray]')).toBeNull();
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/pages/TrendsPage.test.tsx`
Expected: FAIL - no dashed line / no `1:2.2` text.

- [ ] **Step 3: Implement**

In `src/pages/TrendsPage.tsx`:

Extend imports (keep `bagLabel`, which the header still uses):
```ts
import { groupShotsByBag, ratio, sameBag, bagLabel, targetForBag, type Bag } from '../lib/shotView';
import { listBagTargets, type BagTarget } from '../lib/bagTargets';
```

`RatioOverTimeChart` already builds its scales through `niceDomain` (from the
trends-readability work) and draws left-edge ratio ticks. Do not rewrite it -
thread a `targetRatio` prop through, fold the target into the y-domain input
so the goal line cannot fall off-canvas, and add the dashed line plus a
right-aligned label. Everything else in the function stays as it is:

```tsx
function RatioOverTimeChart({
  shots,
  targetRatio,
}: {
  shots: Shot[];
  targetRatio: number | null;
}) {
  const times = shots.map((s) => s.pull_time_s);
  const ratios = shots.map((s) => ratio(s));

  const [xLo, xHi] = niceDomain(times, 4);
  const [yLo, yHi] = niceDomain(targetRatio != null ? [...ratios, targetRatio] : ratios, 0.3);
  const x = scaleLinear(xLo, xHi, 40, 328);
  const y = scaleLinear(yLo, yHi, 158, 18);

  const minTime = Math.round(Math.min(...times));
  const maxTime = Math.round(Math.max(...times));
  const minRatio = Math.min(...ratios);
  const maxRatio = Math.max(...ratios);

  return (
    <svg viewBox="0 0 340 190" width="100%" style={{ overflow: 'visible' }}>
      <line x1="40" y1="158" x2="328" y2="158" stroke="var(--color-divider)" />
      <line x1="40" y1="18" x2="40" y2="158" stroke="var(--color-divider)" />

      {targetRatio != null && (
        <>
          <line
            x1="40"
            y1={y(targetRatio)}
            x2="328"
            y2={y(targetRatio)}
            stroke="var(--color-accent-300)"
            strokeDasharray="4 3"
          />
          <text className="num" x="328" y={y(targetRatio) - 4} textAnchor="end" style={TICK_STYLE}>
            1:{targetRatio.toFixed(1)}
          </text>
        </>
      )}

      {shots.map((shot, i) => (
        <circle
          key={shot.id}
          cx={x(shot.pull_time_s)}
          cy={y(ratio(shot))}
          r={i === 0 ? 4.5 : 4}
          fill={i === 0 ? 'var(--color-accent)' : 'none'}
          stroke={i === 0 ? 'none' : 'var(--color-neutral-600)'}
        />
      ))}

      <text className="num" x="4" y="16" style={TICK_STYLE}>
        {maxRatio.toFixed(1)}
      </text>
      <text x="4" y="30" style={{ ...TICK_STYLE, fontSize: '8.5px', letterSpacing: '0.08em' }}>
        RATIO
      </text>
      <text className="num" x="4" y="160" style={TICK_STYLE}>
        {minRatio.toFixed(1)}
      </text>
      <text className="num" x="40" y="176" style={TICK_STYLE}>
        {minTime}s
      </text>
      <text className="num" x="328" y="176" textAnchor="end" style={TICK_STYLE}>
        {maxTime}s
      </text>
    </svg>
  );
}
```

`BagTrends` passes the prop through - it already receives `bag`, so give it
the resolved target too:
```tsx
function BagTrends({ bag, targetRatio }: { bag: Bag; targetRatio: number | null }) {
  // ...unchanged...
  <RatioOverTimeChart shots={shots} targetRatio={targetRatio} />
  // ...unchanged...
}
```

In `TrendsPage`, add state and load it alongside the existing `listShots`:
```ts
const [bagTargets, setBagTargets] = useState<BagTarget[]>([]);

useEffect(() => {
  listShots().then((shots) => {
    const grouped = groupShotsByBag(shots);
    setBags(grouped);
    setSelectedBag(grouped[0] ?? null);
  });
  listBagTargets()
    .then(setBagTargets)
    .catch(() => setBagTargets([]));
}, []);
```

Pass the resolved target where `BagTrends` is rendered:
```tsx
<BagTrends bag={selectedBag} targetRatio={targetForBag(bagTargets, selectedBag)} />
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run src/pages/TrendsPage.test.tsx`
Expected: PASS (existing plus the two new cases).

- [ ] **Step 5: Commit**

```bash
git add src/pages/TrendsPage.tsx src/pages/TrendsPage.test.tsx
git commit -m "feat: draw the target ratio as a goal line on the trends chart

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RDzwbB7tmDu8igKYvqdShn"
```

---

## Task 12: Documentation

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/mvp_spec.md`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing.

- [ ] **Step 1: Update `CLAUDE.md`**

In the `## Data model` section, add after the `videos` bullet:

```markdown
- `bag_targets`: optional per-bag target brew ratio. One row per bag,
  keyed by `user_id` + `bean_name` + `roast_date` (the same pairing
  `groupShotsByBag` uses), plus a `target_ratio` numeric. No row means
  the bag has no target. RLS restricts every operation to
  `user_id = auth.uid()`. Set only from the shot form (New or Edit),
  persisted when the shot is saved.
```

And add after the `RLS on both tables...` bullet (adjust "both" to "all three"):

```markdown
- The shot list's dialed/dialing tag (`src/lib/shotView.ts` `bagState`)
  compares the last two shots to the bag's `target_ratio` when one is
  set, and falls back to shot-to-shot ratio convergence when it is not.
```

- [ ] **Step 2: Update `docs/mvp_spec.md`**

In `### Phase 2 - Make the Data Work For You`, add after piece **B. Barista Assistant v0**:

```markdown
**C. Per-bag target ratio:** the brew ratio you are aiming for on a
bag, chosen from `1:2 / 1:2.5 / 1:3` and adjustable by 0.1. Shown
against each shot's actual ratio on the shot detail screen and as a
goal line on the Trends ratio chart; the shot list's dialed/dialing tag
judges recent shots against the target when one is set. Explicit, not
inferred. Stored in a `bag_targets` table keyed the same way bags are
grouped (`bean_name` + `roast_date`), no row meaning no target. Decided
in a 2026-09-09 planning conversation. Full design:
`docs/target-ratio-design.md`.
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md docs/mvp_spec.md
git commit -m "docs: record the per-bag target ratio feature

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RDzwbB7tmDu8igKYvqdShn"
```

---

## Final verification

- [ ] **Run the full suite with local Supabase up**

```bash
npx supabase start
npx supabase migration up
npx vitest run
```
Expected: all tests pass.

- [ ] **Build**

Run: `npm run build`
Expected: `tsc` clean, Vite build succeeds.

- [ ] **Manual smoke (optional, `npm run dev`)**

- Log a shot on a new bag, set the target to `1:3`, save. Reopen the shot: the `target 1:3.0` line shows with the right delta.
- Log a second shot on that bag near 1:3 with a close pull time: the shot list shows `Dialed`.
- Open Trends for that bag: the dashed goal line sits at 1:3 with a `1:3.0` label.
- Edit the first shot, nudge the target to `1:2.9`, save. The Trends line and the detail readout both move.
- Clear the target (tap the active pick, or `Off`) on a shot and save: the goal line and the readout disappear; the `Dialed` tag reverts to the convergence rule.

---

## Self-Review Notes

- **Spec coverage:** table + RLS (Task 1), lib (Task 2), `targetForBag` / `ratioDelta` (Task 3), `bagState` branch (Task 4), control (Task 5), form wiring + live delta (Task 6), persistence from New and Edit (Tasks 7, 8), shot list chip (Task 9), detail readout (Task 10), trends goal line (Task 11), doc updates (Task 12). Spec section 5's integration cases are in Task 1; the spec's "unit, mocked supabase" framing for `bagTargets` is implemented instead as an integration test in Task 2, matching the existing `src/lib/shots.test.ts` pattern (the codebase has no mocked-supabase unit precedent).
- **No Trends editing control** in this plan, matching the spec's non-goals.
- **Type consistency:** `BagTarget`, `BagRef` shape, `setBagTarget(bag, ratio | null)`, `listBagTargets()`, `targetForBag(targets, bag)`, `ratioDelta(shot, target)`, and `bagState(shots, { targetRatio, now })` are used with the same names and signatures across Tasks 2 through 11.
- **Migration number** is `00000000000005`; slot 4 is the shipped `shot_analyses` migration.

## Review notes (2026-09-10)

Checked against the current tree. Fixed in place: migration number 4 -> 5;
Task 11 `RatioOverTimeChart` reconciled with the shipped `niceDomain`-based
chart (the earlier snippet rewrote it and dropped the padding and axis
ticks); Task 9 import kept `bagLabel`; `targetForBag` guards a nullish
list; added the "Mocking `listBagTargets`" and "Test helper names"
subsections under Running tests.

Resolved 2026-09-10:

1. **Seed race.** Tasks 7 and 8 now add a `bagTargetsLoaded` flag, gate the
   `ShotForm` render on it, and key the seed effect on the bag identity
   rather than on `bagTargets`. The control never mounts before its seed
   value is known, so a late load cannot clobber a user's pick.
2. **"Start a new bag" collision.** Kept. An identical `bean_name` +
   `roast_date` is the same bag everywhere else in the app
   (`groupShotsByBag`), so resolving its stored target is correct, not an
   auto-default. Noted in Task 7.
3. **`db reset` vs `migration up`.** Switched to `migration up` throughout,
   matching commit 89d3de1.
