# Per-Bag Target Pull Time Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user set a per-bag pull-time window (a low/high range), thread it through the log-a-shot form, the shot detail readout, the Trends pull-time chart, and the "dialed" judgment, and feed it to the barista assistant alongside a prompt rewrite.

**Architecture:** Extends the shipped per-bag target ratio. `bag_targets` gains two nullable `smallint` columns; `target_ratio` becomes nullable so a bag can have a time range and no ratio target. A new `pullTimeRangeForBag` helper in `shotView.ts` mirrors `targetForBag` (which is left unchanged, to avoid churning its five call sites - this deviates from spec section 3, which is updated to match). `bagState` gains a `pullTimeRange` option. A new presentational `PullTimeTargetControl` component sits under the Pull time row in `ShotForm`; the New/Edit pages own the range as state and persist it. The `analyze-shot` Edge Function reads the range and the prompt is reworked.

**Tech Stack:** React 18 + Vite, TypeScript, Supabase (Postgres 17 + Auth + RLS), Vitest + Testing Library, hand-drawn SVG charts, Deno Edge Function (tested under vitest).

**Spec:** `docs/target-pull-time-design.md`

## Global Constraints

- No em dashes anywhere (code, comments, docs, commit messages, UI copy). Use a hyphen or restructure.
- Do not estimate or emphasize development time.
- No new npm dependencies. Charts are hand-drawn SVG.
- Frontend talks to Supabase directly. RLS (`user_id = auth.uid()`) is the per-user isolation boundary.
- The ratio target stays a single value with its existing 0.15 tolerance. Only pull time is a range.
- Range bounds are inclusive and stored as whole seconds (`smallint`), `5 <= low < high <= 120`.
- Follow existing patterns: `src/theme.css` tokens and `.fig` / `.num` utilities; `src/lib/videos.ts` for a lib module's shape; `RatioTargetControl.tsx` and the ratio-target wiring in each page as the sibling to mirror.

## Running tests

- Pure / component: `npx vitest run <path>` (jsdom, no external services).
- Integration (`src/lib/bagTargets.test.ts`, `tests/integration/rls.test.ts`): local Supabase up with the new migration applied, `.env.test.local` present.
  ```bash
  npx supabase start
  npx supabase migration up
  npx vitest run tests/integration/rls.test.ts src/lib/bagTargets.test.ts
  ```
- Full run before the final commit: `npx vitest run` with local Supabase up.
- The vitest config already excludes `**/.claude/**`, so `npx vitest run` from the worktree is clean.

---

## File Structure

**Created:**
- `supabase/migrations/00000000000006_bag_target_pull_time.sql`
- `src/components/PullTimeTargetControl.tsx`
- `src/components/PullTimeTargetControl.test.tsx`

**Modified:**
- `src/lib/bagTargets.ts` - `BagTarget` type (nullable ratio + two columns); `setBagTarget` takes an object.
- `src/lib/bagTargets.test.ts` - object-form cases.
- `src/lib/shotView.ts` - `pullTimeRangeForBag`, `pullTimeAgainstRange`; `bagState` range branch.
- `src/lib/shotView.test.ts` - new helper tests; `bagState` matrix; migrate `bagState` calls to the options object where not already.
- `src/components/ShotForm.tsx` - two props, render the control under the Pull time `NudgeRow`.
- `src/components/ShotForm.test.tsx` - prop passthrough.
- `src/pages/NewShotPage.tsx` / `.test.tsx` - `pullTimeTarget` state, seed, persist; `setBagTarget` object call.
- `src/pages/EditShotPage.tsx` / `.test.tsx` - same.
- `src/pages/ShotDetailPage.tsx` / `.test.tsx` - readout with the range.
- `src/pages/TrendsPage.tsx` / `.test.tsx` - target band on `PullTimeConsistencyChart`.
- `src/pages/ShotListPage.tsx` / `.test.tsx` - pass `pullTimeRange` into `bagState`.
- `supabase/functions/analyze-shot/types.ts` - `getBagTarget` return shape.
- `supabase/functions/analyze-shot/index.ts` - `getBagTarget` query.
- `supabase/functions/analyze-shot/orchestrator.ts` / `.test.ts` - pass the object.
- `supabase/functions/analyze-shot/prompt.ts` / `.test.ts` - target line + SYSTEM rewrite.
- `tests/integration/rls.test.ts` - CHECK cases, ratio-null row.
- `CLAUDE.md`, `docs/target-ratio-design.md`, `docs/barista-assistant-design.md`, `docs/mvp_spec.md`.

---

## Task 1: migration and RLS

**Files:**
- Create: `supabase/migrations/00000000000006_bag_target_pull_time.sql`
- Test: `tests/integration/rls.test.ts` (append `it` blocks in the existing `bag_targets RLS isolation` describe)

**Interfaces:**
- Consumes: the shipped `bag_targets` table (migration `00000000000005`).
- Produces: `bag_targets.target_ratio` nullable; `target_pull_time_low_s smallint null`, `target_pull_time_high_s smallint null`; CHECK constraints `bag_targets_pull_time_range` and `bag_targets_not_empty`.

> If another migration lands before this one, bump the prefix to the next free number. Nothing else changes.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/00000000000006_bag_target_pull_time.sql

alter table bag_targets
  alter column target_ratio drop not null,
  add column target_pull_time_low_s  smallint,
  add column target_pull_time_high_s smallint,
  add constraint bag_targets_pull_time_range check (
    (target_pull_time_low_s is null) = (target_pull_time_high_s is null)
    and (
      target_pull_time_low_s is null
      or (target_pull_time_low_s >= 5
          and target_pull_time_high_s <= 120
          and target_pull_time_low_s < target_pull_time_high_s)
    )
  ),
  add constraint bag_targets_not_empty check (
    target_ratio is not null or target_pull_time_low_s is not null
  );
```

- [ ] **Step 2: Apply it**

Run: `npx supabase migration up`
Expected: `Applying migration 00000000000006_bag_target_pull_time.sql...`, no error.

- [ ] **Step 3: Write the tests**

Append inside the existing `describe('bag_targets RLS isolation', ...)` in `tests/integration/rls.test.ts`:

```ts
it('allows a row with a pull-time range and no ratio target', async () => {
  const a = await createTestUserClient(`rls-bt-pt-${Date.now()}@test.local`);
  const { error } = await a.client
    .from('bag_targets')
    .insert({
      user_id: a.userId,
      bean_name: 'Ethiopia',
      roast_date: '2026-09-01',
      target_ratio: null,
      target_pull_time_low_s: 26,
      target_pull_time_high_s: 31,
    });
  expect(error).toBeNull();
});

it('rejects a half-set range and an inverted range', async () => {
  const a = await createTestUserClient(`rls-bt-pt2-${Date.now()}@test.local`);

  const half = await a.client
    .from('bag_targets')
    .insert({ user_id: a.userId, bean_name: 'A', roast_date: null, target_pull_time_low_s: 26 });
  expect(half.error).not.toBeNull();

  const inverted = await a.client
    .from('bag_targets')
    .insert({
      user_id: a.userId,
      bean_name: 'B',
      roast_date: null,
      target_pull_time_low_s: 31,
      target_pull_time_high_s: 26,
    });
  expect(inverted.error).not.toBeNull();
});
```

- [ ] **Step 4: Run**

Run: `npx vitest run tests/integration/rls.test.ts`
Expected: PASS (existing `bag_targets` cases plus the two new ones).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/00000000000006_bag_target_pull_time.sql tests/integration/rls.test.ts
git commit -m "feat: add per-bag target pull time columns to bag_targets

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CyAxmA5LhinbPrZfBL3F33"
```

---

## Task 2: `bagTargets.ts` - nullable ratio, object-form `setBagTarget`

**Files:**
- Modify: `src/lib/bagTargets.ts`
- Modify: `src/lib/bagTargets.test.ts`
- Modify: `src/pages/NewShotPage.tsx`, `src/pages/EditShotPage.tsx` (call-site update only, behavior-neutral)

**Interfaces:**
- Consumes: the `bag_targets` columns from Task 1.
- Produces:
  ```ts
  export type BagTarget = {
    id: string;
    user_id: string;
    bean_name: string | null;
    roast_date: string | null;
    target_ratio: number | null;
    target_pull_time_low_s: number | null;
    target_pull_time_high_s: number | null;
    created_at: string;
    updated_at: string;
  };
  type BagTargetValues = { targetRatio: number | null; pullTime: [number, number] | null };
  export function setBagTarget(bag: BagRef, values: BagTargetValues): Promise<void>;
  export function listBagTargets(): Promise<BagTarget[]>; // unchanged
  ```

- [ ] **Step 1: Update the failing tests**

In `src/lib/bagTargets.test.ts`, change every `setBagTarget(kenya, 2)` style call to the object form, and add pull-time cases. The existing `describe('bagTargets', ...)` becomes:

```ts
describe('bagTargets', () => {
  it('sets a ratio target and lists it back', async () => {
    await setBagTarget(kenya, { targetRatio: 2, pullTime: null });
    const match = (await listBagTargets()).find(
      (t) => t.bean_name === kenya.bean_name && t.roast_date === kenya.roast_date
    );
    expect(Number(match!.target_ratio)).toBe(2);
    expect(match!.target_pull_time_low_s).toBeNull();
  });

  it('sets a pull-time range with no ratio target', async () => {
    await setBagTarget(kenya, { targetRatio: null, pullTime: [26, 31] });
    const match = (await listBagTargets()).find(
      (t) => t.bean_name === kenya.bean_name && t.roast_date === kenya.roast_date
    );
    expect(match!.target_ratio).toBeNull();
    expect(match!.target_pull_time_low_s).toBe(26);
    expect(match!.target_pull_time_high_s).toBe(31);
  });

  it('overwrites the row rather than adding a second', async () => {
    await setBagTarget(kenya, { targetRatio: 2, pullTime: null });
    await setBagTarget(kenya, { targetRatio: 2.5, pullTime: [25, 30] });
    const matches = (await listBagTargets()).filter(
      (t) => t.bean_name === kenya.bean_name && t.roast_date === kenya.roast_date
    );
    expect(matches).toHaveLength(1);
    expect(Number(matches[0].target_ratio)).toBe(2.5);
    expect(matches[0].target_pull_time_low_s).toBe(25);
  });

  it('deletes the row when every field is cleared', async () => {
    await setBagTarget(kenya, { targetRatio: 2, pullTime: [26, 31] });
    await setBagTarget(kenya, { targetRatio: null, pullTime: null });
    const matches = (await listBagTargets()).filter(
      (t) => t.bean_name === kenya.bean_name && t.roast_date === kenya.roast_date
    );
    expect(matches).toHaveLength(0);
  });

  it('is a no-op when clearing a bag that has no row', async () => {
    await expect(
      setBagTarget(unlabeled, { targetRatio: null, pullTime: null })
    ).resolves.toBeUndefined();
  });

  it('handles the null-keyed (unlabeled) bag', async () => {
    await setBagTarget(unlabeled, { targetRatio: 3, pullTime: null });
    const match = (await listBagTargets()).find(
      (t) => t.bean_name === null && t.roast_date === null
    );
    expect(Number(match?.target_ratio)).toBe(3);
    await setBagTarget(unlabeled, { targetRatio: null, pullTime: null });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/bagTargets.test.ts`
Expected: FAIL - `setBagTarget` still takes `(bag, number | null)`.

- [ ] **Step 3: Rewrite `bagTargets.ts`**

Replace the `BagTarget` type and `setBagTarget`; `findTargetId` and `listBagTargets` are unchanged:

```ts
export type BagTarget = {
  id: string;
  user_id: string;
  bean_name: string | null;
  roast_date: string | null;
  target_ratio: number | null;
  target_pull_time_low_s: number | null;
  target_pull_time_high_s: number | null;
  created_at: string;
  updated_at: string;
};

type BagRef = { bean_name: string | null; roast_date: string | null };
type BagTargetValues = { targetRatio: number | null; pullTime: [number, number] | null };

export async function setBagTarget(bag: BagRef, values: BagTargetValues): Promise<void> {
  const existingId = await findTargetId(bag);
  const row = {
    target_ratio: values.targetRatio,
    target_pull_time_low_s: values.pullTime ? values.pullTime[0] : null,
    target_pull_time_high_s: values.pullTime ? values.pullTime[1] : null,
  };
  const empty = row.target_ratio == null && row.target_pull_time_low_s == null;

  if (empty) {
    if (!existingId) return;
    const { error } = await supabase.from('bag_targets').delete().eq('id', existingId);
    if (error) throw error;
    return;
  }

  if (existingId) {
    const { error } = await supabase.from('bag_targets').update(row).eq('id', existingId);
    if (error) throw error;
    return;
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error('Not signed in');

  const { error } = await supabase.from('bag_targets').insert({
    user_id: userData.user.id,
    bean_name: bag.bean_name,
    roast_date: bag.roast_date,
    ...row,
  });
  if (error) throw error;
}
```

- [ ] **Step 4: Update the two call sites (behavior-neutral)**

In `src/pages/NewShotPage.tsx` (`handleSubmit`, currently `if (target !== targetForBag(bagTargets, bagRef))`) and in `src/pages/EditShotPage.tsx` (`handleSubmit`), change the persist call:

```ts
if (target !== targetForBag(bagTargets, bagRef)) {
  await setBagTarget(bagRef, { targetRatio: target, pullTime: null });
}
```

(The `pullTime` value becomes real in Tasks 6 and 7; here it is `null` so nothing changes.)

- [ ] **Step 5: Fix existing `BagTarget` literals so `tsc` stays clean**

The `BagTarget` type gained two required fields. Every existing
`BagTarget` object literal in a test mock is now missing them. Add
`target_pull_time_low_s: null, target_pull_time_high_s: null` to each
literal in: `src/pages/NewShotPage.test.tsx`, `src/pages/EditShotPage.test.tsx`,
`src/pages/ShotDetailPage.test.tsx`, `src/pages/ShotListPage.test.tsx`,
`src/pages/TrendsPage.test.tsx` (search each for `target_ratio:`). Also
in `src/lib/shotView.test.ts` if any literal exists outside `makeTarget`.

- [ ] **Step 6: Run**

Run: `npx vitest run src/lib/bagTargets.test.ts src/pages/ && npx tsc --noEmit`
Expected: tests PASS (local Supabase up for the first file); `tsc` clean.

- [ ] **Step 7: Commit**

```bash
git add src/lib/bagTargets.ts src/lib/bagTargets.test.ts src/pages/
git commit -m "feat: bagTargets stores a per-bag pull-time range

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CyAxmA5LhinbPrZfBL3F33"
```

---

## Task 3: `shotView.ts` - `pullTimeRangeForBag`, `pullTimeAgainstRange`, `bagState` range branch

**Files:**
- Modify: `src/lib/shotView.ts`
- Modify: `src/lib/shotView.test.ts`

**Interfaces:**
- Consumes: `BagTarget` from Task 2; existing `bagKey`, `ratio`, `daysSinceRoast`, `DIALED_RATIO_TOLERANCE` (0.15), `DIALED_TIME_TOLERANCE_S` (2).
- Produces:
  ```ts
  export function pullTimeRangeForBag(targets: BagTarget[], bag: BagRef): [number, number] | null;
  export function pullTimeAgainstRange(
    pullTimeS: number,
    range: [number, number]
  ): { state: 'under' | 'in' | 'over'; delta: number };
  export function bagState(
    bagShots: Shot[],
    options?: { targetRatio?: number | null; pullTimeRange?: [number, number] | null; now?: Date }
  ): BagStateValue;
  ```
  `targetForBag` and `ratioDelta` are unchanged.

- [ ] **Step 1: Write the failing tests**

Extend the top import of `src/lib/shotView.test.ts` with `pullTimeRangeForBag, pullTimeAgainstRange`. The `makeTarget` helper in that file (from the ratio-target work) needs the two new fields in its defaults so existing and new `makeTarget(...)` calls stay type-correct:

```ts
function makeTarget(overrides: Partial<BagTarget>): BagTarget {
  return {
    id: 'target-1',
    user_id: 'user-1',
    bean_name: 'Kenya Nyeri AA',
    roast_date: '2026-08-23',
    target_ratio: 2,
    target_pull_time_low_s: null,
    target_pull_time_high_s: null,
    created_at: '2026-09-04T07:42:00Z',
    updated_at: '2026-09-04T07:42:00Z',
    ...overrides,
  };
}
```

Then append:

```ts
describe('pullTimeRangeForBag', () => {
  const withRange = (over: Partial<BagTarget>) =>
    makeTarget({ target_pull_time_low_s: 26, target_pull_time_high_s: 31, ...over });

  it('returns [low, high] for the matching bag', () => {
    const targets = [withRange({ bean_name: 'Kenya Nyeri AA', roast_date: '2026-08-23' })];
    expect(
      pullTimeRangeForBag(targets, { bean_name: 'Kenya Nyeri AA', roast_date: '2026-08-23' })
    ).toEqual([26, 31]);
  });

  it('returns null when the matching bag has no range set', () => {
    const targets = [makeTarget({ target_pull_time_low_s: null, target_pull_time_high_s: null })];
    expect(
      pullTimeRangeForBag(targets, { bean_name: 'Kenya Nyeri AA', roast_date: '2026-08-23' })
    ).toBeNull();
  });

  it('returns null when no bag matches or the list is empty', () => {
    expect(pullTimeRangeForBag([], { bean_name: 'X', roast_date: null })).toBeNull();
  });
});

describe('pullTimeAgainstRange', () => {
  it('is in range at the inclusive bounds', () => {
    expect(pullTimeAgainstRange(26, [26, 31])).toEqual({ state: 'in', delta: 0 });
    expect(pullTimeAgainstRange(31, [26, 31])).toEqual({ state: 'in', delta: 0 });
  });
  it('is over with a positive delta past the high bound', () => {
    expect(pullTimeAgainstRange(34, [26, 31])).toEqual({ state: 'over', delta: 3 });
  });
  it('is under with a negative delta below the low bound', () => {
    expect(pullTimeAgainstRange(22, [26, 31])).toEqual({ state: 'under', delta: -4 });
  });
});
```

Add to `describe('bagState', ...)` (the `makeShot` fixture and `makeTarget` helper already exist in the file):

```ts
it('is dialed when both recent shots land inside the pull-time range', () => {
  const shots = [
    makeShot({ id: 'a', roast_date: '2026-08-10', dose_g: 18, yield_g: 36, pull_time_s: 29 }),
    makeShot({ id: 'b', roast_date: '2026-08-10', dose_g: 18, yield_g: 36, pull_time_s: 27 }),
  ];
  expect(
    bagState(shots, { pullTimeRange: [26, 31], now: new Date('2026-09-04') })
  ).toBe('dialed');
});

it('is dialing when one recent shot is outside the range, even if the two shots agree', () => {
  const shots = [
    makeShot({ id: 'a', roast_date: '2026-08-10', dose_g: 18, yield_g: 36, pull_time_s: 24 }),
    makeShot({ id: 'b', roast_date: '2026-08-10', dose_g: 18, yield_g: 36, pull_time_s: 25 }),
  ];
  expect(
    bagState(shots, { pullTimeRange: [26, 31], now: new Date('2026-09-04') })
  ).toBe('dialing');
});

it('with a range set, still requires the ratio target when one is also given', () => {
  const shots = [
    makeShot({ id: 'a', roast_date: '2026-08-10', dose_g: 18, yield_g: 45, pull_time_s: 29 }), // 1:2.5
    makeShot({ id: 'b', roast_date: '2026-08-10', dose_g: 18, yield_g: 45, pull_time_s: 28 }),
  ];
  expect(
    bagState(shots, { targetRatio: 2, pullTimeRange: [26, 31], now: new Date('2026-09-04') })
  ).toBe('dialing');
});

it('with no range set, the pull-time check is shot-to-shot as before', () => {
  const shots = [
    makeShot({ id: 'a', roast_date: '2026-08-10', dose_g: 18, yield_g: 36, pull_time_s: 40 }),
    makeShot({ id: 'b', roast_date: '2026-08-10', dose_g: 18, yield_g: 36, pull_time_s: 41 }),
  ];
  // 40s and 41s are within 2s of each other and ratios match -> dialed, exactly today's rule
  expect(bagState(shots, { now: new Date('2026-09-04') })).toBe('dialed');
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/lib/shotView.test.ts`
Expected: FAIL - the two helpers are not exported; `bagState` ignores `pullTimeRange`.

- [ ] **Step 3: Implement**

In `src/lib/shotView.ts`, add after `ratioDelta`:

```ts
export function pullTimeRangeForBag(
  targets: BagTarget[],
  bag: { bean_name: string | null; roast_date: string | null }
): [number, number] | null {
  if (!targets || targets.length === 0) return null;
  const key = bagKey(bag);
  const match = targets.find((t) => bagKey(t) === key);
  if (!match || match.target_pull_time_low_s == null || match.target_pull_time_high_s == null) {
    return null;
  }
  return [match.target_pull_time_low_s, match.target_pull_time_high_s];
}

export function pullTimeAgainstRange(
  pullTimeS: number,
  range: [number, number]
): { state: 'under' | 'in' | 'over'; delta: number } {
  const [low, high] = range;
  if (pullTimeS < low) return { state: 'under', delta: pullTimeS - low };
  if (pullTimeS > high) return { state: 'over', delta: pullTimeS - high };
  return { state: 'in', delta: 0 };
}
```

Replace `bagState` (update the docstring's pull-time sentence to mention the range branch):

```ts
export function bagState(
  bagShots: Shot[],
  options: { targetRatio?: number | null; pullTimeRange?: [number, number] | null; now?: Date } = {}
): BagStateValue {
  const { targetRatio = null, pullTimeRange = null, now = new Date() } = options;
  if (bagShots.length <= 1) return null;

  const [latest, previous] = bagShots;

  if (latest.roast_date) {
    const age = daysSinceRoast(latest.roast_date, now);
    if (age > PAST_PEAK_MIN_DAYS) return 'past-peak';
    if (age < RESTING_MAX_DAYS) return 'resting';
  }

  const ratioOk =
    targetRatio != null
      ? Math.abs(ratio(latest) - targetRatio) <= DIALED_RATIO_TOLERANCE &&
        Math.abs(ratio(previous) - targetRatio) <= DIALED_RATIO_TOLERANCE
      : Math.abs(ratio(latest) - ratio(previous)) <= DIALED_RATIO_TOLERANCE;

  const inRange = (s: Shot) =>
    s.pull_time_s >= pullTimeRange![0] && s.pull_time_s <= pullTimeRange![1];
  const timeOk =
    pullTimeRange != null
      ? inRange(latest) && inRange(previous)
      : Math.abs(latest.pull_time_s - previous.pull_time_s) <= DIALED_TIME_TOLERANCE_S;

  return ratioOk && timeOk ? 'dialed' : 'dialing';
}
```

- [ ] **Step 4: Run**

Run: `npx vitest run src/lib/shotView.test.ts src/pages/ShotListPage.test.tsx`
Expected: PASS. `ShotListPage` still calls `bagState` with `{ targetRatio }` only - valid against the widened options.

- [ ] **Step 5: Commit**

```bash
git add src/lib/shotView.ts src/lib/shotView.test.ts
git commit -m "feat: bagState judges pull time against a target range

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CyAxmA5LhinbPrZfBL3F33"
```

---

## Task 4: `PullTimeTargetControl` component

**Files:**
- Create: `src/components/PullTimeTargetControl.tsx`
- Create: `src/components/PullTimeTargetControl.test.tsx`

**Interfaces:**
- Consumes: `pullTimeAgainstRange` from Task 3; `formatSigned` from `src/lib/format.ts`.
- Produces:
  ```ts
  export function PullTimeTargetControl(props: {
    value: [number, number] | null;
    onChange: (next: [number, number] | null) => void;
    currentPullTime: number;
  }): JSX.Element;
  ```
  Buttons carry `aria-label`: `No pull time target`, `Decrease low`, `Increase low`, `Decrease high`, `Increase high`. Clicking `No pull time target` toggles between `null` and the seed range. Steppers move one end by 1s, clamped to `5 <= low`, `high <= 120`, `low < high`. Seed range is `[round(currentPullTime) - 2, round(currentPullTime) + 2]` clamped, or `[25, 32]` when `currentPullTime` is not a positive number.

- [ ] **Step 1: Write the failing tests**

Create `src/components/PullTimeTargetControl.test.tsx`:

```ts
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { PullTimeTargetControl } from './PullTimeTargetControl';

describe('PullTimeTargetControl', () => {
  it('marks the Off button pressed when value is null', () => {
    render(<PullTimeTargetControl value={null} onChange={vi.fn()} currentPullTime={30} />);
    expect(screen.getByRole('button', { name: 'No pull time target' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('turning it on seeds a window around the current pull time', () => {
    const onChange = vi.fn();
    render(<PullTimeTargetControl value={null} onChange={onChange} currentPullTime={30} />);
    fireEvent.click(screen.getByRole('button', { name: 'No pull time target' }));
    expect(onChange).toHaveBeenCalledWith([28, 32]);
  });

  it('seeds [25, 32] when the current pull time is not a positive number', () => {
    const onChange = vi.fn();
    render(<PullTimeTargetControl value={null} onChange={onChange} currentPullTime={NaN} />);
    fireEvent.click(screen.getByRole('button', { name: 'No pull time target' }));
    expect(onChange).toHaveBeenCalledWith([25, 32]);
  });

  it('clicking Off while a range is set clears it', () => {
    const onChange = vi.fn();
    render(<PullTimeTargetControl value={[26, 31]} onChange={onChange} currentPullTime={30} />);
    fireEvent.click(screen.getByRole('button', { name: 'No pull time target' }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('nudges each end by 1s', () => {
    const onChange = vi.fn();
    render(<PullTimeTargetControl value={[26, 31]} onChange={onChange} currentPullTime={30} />);
    fireEvent.click(screen.getByRole('button', { name: 'Increase low' }));
    expect(onChange).toHaveBeenCalledWith([27, 31]);
    fireEvent.click(screen.getByRole('button', { name: 'Decrease high' }));
    expect(onChange).toHaveBeenCalledWith([26, 30]);
  });

  it('keeps low below high when nudging', () => {
    const onChange = vi.fn();
    render(<PullTimeTargetControl value={[30, 31]} onChange={onChange} currentPullTime={30} />);
    fireEvent.click(screen.getByRole('button', { name: 'Increase low' }));
    expect(onChange).toHaveBeenCalledWith([30, 31]); // clamped at high - 1
  });

  it('shows the live position of the current pull time', () => {
    const { rerender } = render(
      <PullTimeTargetControl value={[26, 31]} onChange={vi.fn()} currentPullTime={30} />
    );
    expect(screen.getByText(/30s in range/)).toBeInTheDocument();
    rerender(
      <PullTimeTargetControl value={[26, 31]} onChange={vi.fn()} currentPullTime={34} />
    );
    expect(screen.getByText(/34s \+3s/)).toBeInTheDocument();
  });

  it('hides the steppers when there is no range', () => {
    render(<PullTimeTargetControl value={null} onChange={vi.fn()} currentPullTime={30} />);
    expect(screen.queryByRole('button', { name: 'Increase low' })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/components/PullTimeTargetControl.test.tsx`
Expected: FAIL - module does not exist.

- [ ] **Step 3: Implement**

Create `src/components/PullTimeTargetControl.tsx` (mirrors `RatioTargetControl.tsx`'s structure and styling):

```tsx
import { formatSigned } from '../lib/format';
import { pullTimeAgainstRange } from '../lib/shotView';

type Props = {
  value: [number, number] | null;
  onChange: (next: [number, number] | null) => void;
  currentPullTime: number;
};

const MIN_S = 5;
const MAX_S = 120;
const DEFAULT_RANGE: [number, number] = [25, 32];

function seedRange(currentPullTime: number): [number, number] {
  if (!Number.isFinite(currentPullTime) || currentPullTime <= 0) return DEFAULT_RANGE;
  const c = Math.round(currentPullTime);
  const low = Math.max(MIN_S, c - 2);
  const high = Math.min(MAX_S, c + 2);
  return low < high ? [low, high] : [Math.max(MIN_S, high - 1), high];
}

export function PullTimeTargetControl({ value, onChange, currentPullTime }: Props) {
  const segmentBase = 'text-[13px] px-2 py-1 rounded-[var(--radius-sm)] border';
  const off = value === null;

  function toggle() {
    onChange(off ? seedRange(currentPullTime) : null);
  }
  function stepLow(d: number) {
    if (!value) return;
    onChange([Math.min(value[1] - 1, Math.max(MIN_S, value[0] + d)), value[1]]);
  }
  function stepHigh(d: number) {
    if (!value) return;
    onChange([value[0], Math.max(value[0] + 1, Math.min(MAX_S, value[1] + d))]);
  }

  const position =
    value && Number.isFinite(currentPullTime) && currentPullTime > 0
      ? pullTimeAgainstRange(Math.round(currentPullTime), value)
      : null;

  return (
    <div className="flex items-center justify-between" style={{ paddingTop: 'var(--space-2)' }}>
      <span style={{ fontSize: '12px', opacity: 0.65 }}>Target</span>
      <div className="flex items-center" style={{ gap: 'var(--space-2)' }}>
        <button
          type="button"
          aria-label="No pull time target"
          aria-pressed={off}
          onClick={toggle}
          className={`${segmentBase} ${
            off
              ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
              : 'border-[var(--color-divider)] text-[var(--color-neutral-700)]'
          }`}
        >
          Off
        </button>
        {value && (
          <div className="flex items-center" style={{ gap: '4px' }}>
            <button
              type="button"
              aria-label="Decrease low"
              onClick={() => stepLow(-1)}
              className="w-8 h-8 border border-[var(--color-divider)] rounded-[var(--radius-sm)] hover:bg-[var(--color-accent-100)] active:bg-[var(--color-accent-200)]"
            >
              &minus;
            </button>
            <span className="fig" style={{ fontSize: '13px', minWidth: '30px', textAlign: 'center' }}>
              {value[0]}s
            </span>
            <button
              type="button"
              aria-label="Increase low"
              onClick={() => stepLow(1)}
              className="w-8 h-8 border border-[var(--color-divider)] rounded-[var(--radius-sm)] hover:bg-[var(--color-accent-100)] active:bg-[var(--color-accent-200)]"
            >
              +
            </button>
            <span style={{ opacity: 0.5, padding: '0 2px' }}>-</span>
            <button
              type="button"
              aria-label="Decrease high"
              onClick={() => stepHigh(-1)}
              className="w-8 h-8 border border-[var(--color-divider)] rounded-[var(--radius-sm)] hover:bg-[var(--color-accent-100)] active:bg-[var(--color-accent-200)]"
            >
              &minus;
            </button>
            <span className="fig" style={{ fontSize: '13px', minWidth: '30px', textAlign: 'center' }}>
              {value[1]}s
            </span>
            <button
              type="button"
              aria-label="Increase high"
              onClick={() => stepHigh(1)}
              className="w-8 h-8 border border-[var(--color-divider)] rounded-[var(--radius-sm)] hover:bg-[var(--color-accent-100)] active:bg-[var(--color-accent-200)]"
            >
              +
            </button>
          </div>
        )}
        {position && (
          <span className="fig" style={{ fontSize: '12px', color: 'var(--color-accent-700)' }}>
            {Math.round(currentPullTime)}s{' '}
            {position.state === 'in' ? 'in range' : `${formatSigned(position.delta, 0)}s`}
          </span>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run**

Run: `npx vitest run src/components/PullTimeTargetControl.test.tsx`
Expected: PASS (8 cases).

- [ ] **Step 5: Commit**

```bash
git add src/components/PullTimeTargetControl.tsx src/components/PullTimeTargetControl.test.tsx
git commit -m "feat: add PullTimeTargetControl range control

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CyAxmA5LhinbPrZfBL3F33"
```

---

## Task 5: wire the control into `ShotForm`

**Files:**
- Modify: `src/components/ShotForm.tsx`
- Modify: `src/components/ShotForm.test.tsx`

**Interfaces:**
- Consumes: `PullTimeTargetControl` from Task 4.
- Produces: two new optional props:
  ```ts
  pullTimeTarget?: [number, number] | null;      // default null
  onPullTimeTargetChange?: (next: [number, number] | null) => void;
  ```

- [ ] **Step 1: Write the failing tests**

Add inside `describe('ShotForm', ...)` in `src/components/ShotForm.test.tsx`:

```ts
it('renders the pull-time target control and forwards a toggle', () => {
  const onPullTimeTargetChange = vi.fn();
  render(
    <ShotForm
      referenceValues={reference}
      initialValues={{ ...reference, pull_time_s: '30' }}
      submitLabel="Save shot"
      onSubmit={vi.fn()}
      pullTimeTarget={null}
      onPullTimeTargetChange={onPullTimeTargetChange}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: 'No pull time target' }));
  expect(onPullTimeTargetChange).toHaveBeenCalledWith([28, 32]);
});

it('shows the live pull-time position when a range is set', () => {
  render(
    <ShotForm
      referenceValues={reference}
      initialValues={{ ...reference, pull_time_s: '30' }}
      submitLabel="Save shot"
      onSubmit={vi.fn()}
      pullTimeTarget={[26, 31]}
      onPullTimeTargetChange={vi.fn()}
    />
  );
  expect(screen.getByText(/30s in range/)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/components/ShotForm.test.tsx`
Expected: FAIL - no `No pull time target` button.

- [ ] **Step 3: Implement**

In `src/components/ShotForm.tsx`:

Add the import beside `RatioTargetControl`:
```ts
import { PullTimeTargetControl } from './PullTimeTargetControl';
```

Extend `Props` (beside `target` / `onTargetChange`):
```ts
pullTimeTarget?: [number, number] | null;
onPullTimeTargetChange?: (next: [number, number] | null) => void;
```

Extend the destructure with `pullTimeTarget = null, onPullTimeTargetChange`.

The four numeric fields are rendered by `numericFields.map((field) => <NudgeRow .../>)`. Replace that map so the pull-time control follows the `pull_time_s` row:

```tsx
{numericFields.map((field) => (
  <div key={field}>
    <NudgeRow
      field={field}
      value={values[field]}
      reference={referenceValues[field]}
      onChange={(next) => set(field, next)}
    />
    {field === 'pull_time_s' && (
      <div style={{ padding: '0 var(--space-4) var(--space-2)' }}>
        <PullTimeTargetControl
          value={pullTimeTarget}
          onChange={(next) => onPullTimeTargetChange?.(next)}
          currentPullTime={Number.parseFloat(values.pull_time_s)}
        />
      </div>
    )}
  </div>
))}
```

- [ ] **Step 4: Run**

Run: `npx vitest run src/components/ShotForm.test.tsx`
Expected: PASS (existing cases plus the two new ones).

- [ ] **Step 5: Commit**

```bash
git add src/components/ShotForm.tsx src/components/ShotForm.test.tsx
git commit -m "feat: pull-time target control on the shot form

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CyAxmA5LhinbPrZfBL3F33"
```

---

## Task 6: `NewShotPage` seeds and persists the range

**Files:**
- Modify: `src/pages/NewShotPage.tsx`
- Modify: `src/pages/NewShotPage.test.tsx`

**Interfaces:**
- Consumes: `pullTimeRangeForBag` from Task 3; `setBagTarget` object form from Task 2; `ShotForm` pull-time props from Task 5.

- [ ] **Step 1: Write the failing tests**

`src/pages/NewShotPage.test.tsx` already mocks `../lib/bagTargets`. Add:

```ts
it('seeds the pull-time range from the selected bag', async () => {
  vi.mocked(listShots).mockResolvedValue([referenceShot]);
  vi.mocked(listBagTargets).mockResolvedValue([
    {
      id: 't1',
      user_id: 'user-1',
      bean_name: referenceShot.bean_name,
      roast_date: referenceShot.roast_date,
      target_ratio: null,
      target_pull_time_low_s: 26,
      target_pull_time_high_s: 31,
      created_at: '2026-09-04T00:00:00Z',
      updated_at: '2026-09-04T00:00:00Z',
    },
  ]);

  render(
    <MemoryRouter>
      <NewShotPage />
    </MemoryRouter>
  );

  await waitFor(() => expect(screen.getByText(/26s/)).toBeInTheDocument());
  expect(screen.getByRole('button', { name: 'No pull time target' })).toHaveAttribute(
    'aria-pressed',
    'false'
  );
});

it('persists a changed pull-time range on save', async () => {
  vi.mocked(listShots).mockResolvedValue([referenceShot]);
  vi.mocked(listBagTargets).mockResolvedValue([]);
  vi.mocked(createShot).mockResolvedValue({ ...referenceShot, id: 'shot-new' });

  render(
    <MemoryRouter>
      <NewShotPage />
    </MemoryRouter>
  );

  await waitFor(() => screen.getByRole('button', { name: 'No pull time target' }));
  fireEvent.click(screen.getByRole('button', { name: 'No pull time target' })); // seeds around 28s -> [26, 30]
  fireEvent.click(screen.getByRole('button', { name: 'Save shot' }));

  await waitFor(() =>
    expect(setBagTarget).toHaveBeenCalledWith(
      { bean_name: referenceShot.bean_name, roast_date: referenceShot.roast_date },
      expect.objectContaining({ pullTime: [26, 30] })
    )
  );
});
```

(`referenceShot.pull_time_s` is 28, so the seed is `[26, 30]`.)

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/pages/NewShotPage.test.tsx`
Expected: FAIL - no pull-time control wired.

- [ ] **Step 3: Implement**

In `src/pages/NewShotPage.tsx`:

Extend the `shotView` import with `pullTimeRangeForBag`.

Add state beside `target`:
```ts
const [pullTimeTarget, setPullTimeTarget] = useState<[number, number] | null>(null);
```

In the seed effect (the one keyed on `bagTargetsLoaded` and the resolved bag), also seed the range:
```ts
useEffect(() => {
  if (!bagTargetsLoaded) return;
  const bag = hasBagForTarget
    ? { bean_name: targetBeanName, roast_date: targetRoastDate }
    : null;
  setTarget(bag ? targetForBag(bagTargets, bag) : null);
  setPullTimeTarget(bag ? pullTimeRangeForBag(bagTargets, bag) : null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [targetBeanName, targetRoastDate, hasBagForTarget, bagTargetsLoaded]);
```

In `handleSubmit`, replace the ratio-only persist with a combined one:
```ts
const storedRatio = targetForBag(bagTargets, bagRef);
const storedRange = pullTimeRangeForBag(bagTargets, bagRef);
const rangeChanged =
  JSON.stringify(storedRange) !== JSON.stringify(pullTimeTarget);
if (target !== storedRatio || rangeChanged) {
  await setBagTarget(bagRef, { targetRatio: target, pullTime: pullTimeTarget });
}
```

Pass the props to `ShotForm`:
```tsx
pullTimeTarget={pullTimeTarget}
onPullTimeTargetChange={setPullTimeTarget}
```

- [ ] **Step 4: Run**

Run: `npx vitest run src/pages/NewShotPage.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/NewShotPage.tsx src/pages/NewShotPage.test.tsx
git commit -m "feat: set and persist a bag pull-time range from the new-shot form

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CyAxmA5LhinbPrZfBL3F33"
```

---

## Task 7: `EditShotPage` seeds and persists the range

**Files:**
- Modify: `src/pages/EditShotPage.tsx`
- Modify: `src/pages/EditShotPage.test.tsx`

**Interfaces:** same as Task 6.

- [ ] **Step 1: Write the failing tests**

Add to `src/pages/EditShotPage.test.tsx` (the `renderAtShot` helper and `bagTargets` mock already exist):

```ts
it('seeds the pull-time range from the shot\'s bag', async () => {
  vi.mocked(getShot).mockResolvedValue(shot);
  vi.mocked(listBagTargets).mockResolvedValue([
    {
      id: 't1',
      user_id: 'user-1',
      bean_name: shot.bean_name,
      roast_date: shot.roast_date,
      target_ratio: null,
      target_pull_time_low_s: 27,
      target_pull_time_high_s: 32,
      created_at: '2026-09-04T00:00:00Z',
      updated_at: '2026-09-04T00:00:00Z',
    },
  ]);

  renderAtShot('shot-1');

  await waitFor(() => expect(screen.getByText(/27s/)).toBeInTheDocument());
});

it('writes the range on save when it changed', async () => {
  vi.mocked(getShot).mockResolvedValue(shot);
  vi.mocked(updateShot).mockResolvedValue({ ...shot });
  vi.mocked(listBagTargets).mockResolvedValue([]);

  renderAtShot('shot-1');

  await waitFor(() => screen.getByRole('button', { name: 'No pull time target' }));
  fireEvent.click(screen.getByRole('button', { name: 'No pull time target' })); // shot.pull_time_s is 28 -> [26, 30]
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

  await waitFor(() =>
    expect(setBagTarget).toHaveBeenCalledWith(
      { bean_name: shot.bean_name, roast_date: shot.roast_date },
      expect.objectContaining({ pullTime: [26, 30] })
    )
  );
});

it('does not write the target when nothing changed', async () => {
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
Expected: FAIL - no pull-time control; range never persisted.

- [ ] **Step 3: Implement**

In `src/pages/EditShotPage.tsx`:

Extend the `shotView` import with `pullTimeRangeForBag`.

Add state:
```ts
const [pullTimeTarget, setPullTimeTarget] = useState<[number, number] | null>(null);
```

Seed effect (beside the `target` seed):
```ts
useEffect(() => {
  if (!shot || !bagTargetsLoaded) return;
  setTarget(targetForBag(bagTargets, shot));
  setPullTimeTarget(pullTimeRangeForBag(bagTargets, shot));
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [shot?.bean_name, shot?.roast_date, bagTargetsLoaded]);
```

`handleSubmit` (replace the ratio-only persist):
```ts
const bagRef = { bean_name: values.bean_name || null, roast_date: values.roast_date || null };
const storedRatio = targetForBag(bagTargets, bagRef);
const storedRange = pullTimeRangeForBag(bagTargets, bagRef);
const rangeChanged = JSON.stringify(storedRange) !== JSON.stringify(pullTimeTarget);
if (target !== storedRatio || rangeChanged) {
  await setBagTarget(bagRef, { targetRatio: target, pullTime: pullTimeTarget });
}
```

Pass the props:
```tsx
pullTimeTarget={pullTimeTarget}
onPullTimeTargetChange={setPullTimeTarget}
```

- [ ] **Step 4: Run**

Run: `npx vitest run src/pages/EditShotPage.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/EditShotPage.tsx src/pages/EditShotPage.test.tsx
git commit -m "feat: edit a bag pull-time range from the edit-shot form

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CyAxmA5LhinbPrZfBL3F33"
```

---

## Task 8: `ShotListPage` feeds the range into `bagState`

**Files:**
- Modify: `src/pages/ShotListPage.tsx`
- Modify: `src/pages/ShotListPage.test.tsx`

- [ ] **Step 1: Write the failing test**

Add to `src/pages/ShotListPage.test.tsx` (mock + `beforeEach` default already present):

```ts
it('shows Dialed when both recent shots land in the bag pull-time range', async () => {
  mockAuth();
  const inRange = [
    { ...baseShot, id: 's2', dose_g: 18, yield_g: 45, pull_time_s: 29, roast_date: null },
    { ...baseShot, id: 's1', dose_g: 18, yield_g: 45, pull_time_s: 27, roast_date: null },
  ];
  vi.mocked(listShots).mockResolvedValue(inRange);
  vi.mocked(listBagTargets).mockResolvedValue([
    {
      id: 't1',
      user_id: 'user-1',
      bean_name: baseShot.bean_name,
      roast_date: null,
      target_ratio: null,
      target_pull_time_low_s: 26,
      target_pull_time_high_s: 31,
      created_at: '2026-09-04T00:00:00Z',
      updated_at: '2026-09-04T00:00:00Z',
    },
  ]);

  render(
    <MemoryRouter>
      <ShotListPage />
    </MemoryRouter>
  );

  expect(await screen.findByText('Dialed')).toBeInTheDocument();
});

it('shows Dialing when a recent shot falls outside the pull-time range', async () => {
  mockAuth();
  const out = [
    { ...baseShot, id: 's2', dose_g: 18, yield_g: 45, pull_time_s: 22, roast_date: null },
    { ...baseShot, id: 's1', dose_g: 18, yield_g: 45, pull_time_s: 23, roast_date: null },
  ];
  vi.mocked(listShots).mockResolvedValue(out);
  vi.mocked(listBagTargets).mockResolvedValue([
    {
      id: 't1',
      user_id: 'user-1',
      bean_name: baseShot.bean_name,
      roast_date: null,
      target_ratio: null,
      target_pull_time_low_s: 26,
      target_pull_time_high_s: 31,
      created_at: '2026-09-04T00:00:00Z',
      updated_at: '2026-09-04T00:00:00Z',
    },
  ]);

  render(
    <MemoryRouter>
      <ShotListPage />
    </MemoryRouter>
  );

  expect(await screen.findByText('Dialing')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/pages/ShotListPage.test.tsx`
Expected: FAIL - the range is not consulted, both bags read Dialed (ratios match, shots within 2s).

- [ ] **Step 3: Implement**

In `src/pages/ShotListPage.tsx`, extend the `shotView` import with `pullTimeRangeForBag`. Both `bagState` calls become:

```ts
bagState(bag.shots, {
  targetRatio: targetForBag(targets, bag),
  pullTimeRange: pullTimeRangeForBag(targets, bag),
})
```

`BagGroup` already receives `targets`. The `visibleBags` filter uses `bagTargets` - pass both there too.

- [ ] **Step 4: Run**

Run: `npx vitest run src/pages/ShotListPage.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/ShotListPage.tsx src/pages/ShotListPage.test.tsx
git commit -m "feat: judge the dialed tag against the bag pull-time range

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CyAxmA5LhinbPrZfBL3F33"
```

---

## Task 9: `ShotDetailPage` readout

**Files:**
- Modify: `src/pages/ShotDetailPage.tsx`
- Modify: `src/pages/ShotDetailPage.test.tsx`

**Interfaces:**
- Consumes: `pullTimeRangeForBag`, `pullTimeAgainstRange` from Task 3; `formatSigned` (already imported in the page).

- [ ] **Step 1: Write the failing tests**

Add to `src/pages/ShotDetailPage.test.tsx` (`shot` fixture: `dose_g 18`, `yield_g 36` -> 1:2.00, `pull_time_s 28`):

```ts
it('shows the pull-time range and the shot\'s position in it', async () => {
  vi.mocked(getShot).mockResolvedValue(shot);
  vi.mocked(listShots).mockResolvedValue([shot]);
  vi.mocked(getVideoForShot).mockResolvedValue(null);
  vi.mocked(listBagTargets).mockResolvedValue([
    {
      id: 't1',
      user_id: 'user-1',
      bean_name: shot.bean_name,
      roast_date: shot.roast_date,
      target_ratio: null,
      target_pull_time_low_s: 26,
      target_pull_time_high_s: 31,
      created_at: '2026-09-04T00:00:00Z',
      updated_at: '2026-09-04T00:00:00Z',
    },
  ]);

  renderAtShot('shot-1');

  // 28s inside 26-31s
  expect(await screen.findByText(/26-31s/)).toBeInTheDocument();
  expect(screen.getByText(/28s in range/)).toBeInTheDocument();
});

it('shows both the ratio delta and the range when both are set', async () => {
  vi.mocked(getShot).mockResolvedValue({ ...shot, yield_g: 37 }); // 1:2.06
  vi.mocked(listShots).mockResolvedValue([{ ...shot, yield_g: 37 }]);
  vi.mocked(getVideoForShot).mockResolvedValue(null);
  vi.mocked(listBagTargets).mockResolvedValue([
    {
      id: 't1',
      user_id: 'user-1',
      bean_name: shot.bean_name,
      roast_date: shot.roast_date,
      target_ratio: 2,
      target_pull_time_low_s: 26,
      target_pull_time_high_s: 31,
      created_at: '2026-09-04T00:00:00Z',
      updated_at: '2026-09-04T00:00:00Z',
    },
  ]);

  renderAtShot('shot-1');

  expect(await screen.findByText(/target 1:2\.0/)).toBeInTheDocument();
  expect(screen.getByText(/26-31s/)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/pages/ShotDetailPage.test.tsx`
Expected: FAIL - no range text.

- [ ] **Step 3: Implement**

In `src/pages/ShotDetailPage.tsx`, extend the `shotView` import with `pullTimeRangeForBag, pullTimeAgainstRange`. After `const target = targetForBag(bagTargets, shot);` add:

```ts
const pullRange = pullTimeRangeForBag(bagTargets, shot);
const pullPos = pullRange ? pullTimeAgainstRange(shot.pull_time_s, pullRange) : null;
```

Replace the target readout block (currently `{target != null && ( <div ...>target 1:{...} ...</div> )}`) with one that handles all three cases:

```tsx
{(target != null || pullRange) && (
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
    target
    {target != null && ` 1:${target.toFixed(1)} ${formatSigned(ratioDelta(shot, target), 2)}`}
    {target != null && pullRange && ' ·'}
    {pullRange &&
      ` ${pullRange[0]}-${pullRange[1]}s ${Math.round(shot.pull_time_s)}s ${
        pullPos!.state === 'in' ? 'in range' : `${formatSigned(pullPos!.delta, 0)}s`
      }`}
  </div>
)}
```

- [ ] **Step 4: Run**

Run: `npx vitest run src/pages/ShotDetailPage.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/ShotDetailPage.tsx src/pages/ShotDetailPage.test.tsx
git commit -m "feat: show the pull-time range on the shot detail readout

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CyAxmA5LhinbPrZfBL3F33"
```

---

## Task 10: `TrendsPage` target band

**Files:**
- Modify: `src/pages/TrendsPage.tsx`
- Modify: `src/pages/TrendsPage.test.tsx`

**Interfaces:**
- Consumes: `pullTimeRangeForBag` from Task 3.

- [ ] **Step 1: Write the failing tests**

Add to `src/pages/TrendsPage.test.tsx` (mock + `beforeEach` default already present):

```ts
it('draws the pull-time target band and label when the bag has a range', async () => {
  const bagShots = [
    { ...shots[0], id: 's2', pull_time_s: 29 },
    { ...shots[0], id: 's1', pull_time_s: 27 },
  ];
  vi.mocked(listShots).mockResolvedValue(bagShots);
  vi.mocked(listBagTargets).mockResolvedValue([
    {
      id: 't1',
      user_id: 'user-1',
      bean_name: shots[0].bean_name,
      roast_date: shots[0].roast_date,
      target_ratio: null,
      target_pull_time_low_s: 26,
      target_pull_time_high_s: 31,
      created_at: '2026-09-04T00:00:00Z',
      updated_at: '2026-09-04T00:00:00Z',
    },
  ]);

  const { container } = render(
    <MemoryRouter>
      <TrendsPage />
    </MemoryRouter>
  );

  await waitFor(() =>
    expect(screen.getByText('Pull time consistency')).toBeInTheDocument()
  );
  const pullSvg = screen.getByText('Pull time consistency').parentElement!.querySelector('svg')!;
  expect(pullSvg.textContent).toContain('26-31s');
  expect(pullSvg.querySelector('rect[data-band="target"]')).toBeTruthy();
});

it('draws no target band when the bag has no range', async () => {
  const bagShots = [
    { ...shots[0], id: 's2', pull_time_s: 29 },
    { ...shots[0], id: 's1', pull_time_s: 27 },
  ];
  vi.mocked(listShots).mockResolvedValue(bagShots);
  vi.mocked(listBagTargets).mockResolvedValue([]);

  const { container } = render(
    <MemoryRouter>
      <TrendsPage />
    </MemoryRouter>
  );

  await waitFor(() => expect(screen.getByText('Pull time consistency')).toBeInTheDocument());
  const pullSvg = screen.getByText('Pull time consistency').parentElement!.querySelector('svg')!;
  expect(pullSvg.querySelector('rect[data-band="target"]')).toBeNull();
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/pages/TrendsPage.test.tsx`
Expected: FAIL - no target band.

- [ ] **Step 3: Implement**

In `src/pages/TrendsPage.tsx`, extend the `shotView` import with `pullTimeRangeForBag`.

Replace `PullTimeConsistencyChart` (the `showLine` / `!showLine` blocks are unchanged - shown truncated):

```tsx
function PullTimeConsistencyChart({
  shots,
  range,
}: {
  shots: Shot[];
  range: [number, number] | null;
}) {
  const recent = [...shots].slice(0, 14).reverse();
  const times = recent.map((s) => s.pull_time_s);
  const median = medianOf(times);
  const x = scaleLinear(0, Math.max(recent.length - 1, 1), 10, 330);
  // Extend the domain to include the range so the band is never clipped.
  const lo = Math.min(...times, ...(range ?? [])) - 2;
  const hi = Math.max(...times, ...(range ?? [])) + 2;
  const y = scaleLinear(lo, hi, 100, 10);

  const showLine = recent.length >= MIN_SHOTS_FOR_TREND;
  const points = recent.map((s, i) => `${x(i)},${y(s.pull_time_s)}`).join(' ');
  const lastIndex = recent.length - 1;

  return (
    <svg viewBox="0 0 340 120" width="100%">
      {range ? (
        <>
          <rect
            data-band="target"
            x="10"
            y={y(range[1])}
            width="320"
            height={y(range[0]) - y(range[1])}
            fill="var(--color-accent-100)"
          />
          <text className="num" x="330" y={y(range[1]) - 3} textAnchor="end" style={TICK_STYLE}>
            {range[0]}-{range[1]}s
          </text>
        </>
      ) : (
        <rect
          x="10"
          y={y(median + 1)}
          width="320"
          height={y(median - 1) - y(median + 1)}
          fill="var(--color-accent-100)"
        />
      )}
      <line x1="10" y1={y(median)} x2="330" y2={y(median)} stroke="var(--color-accent-300)" />

      {showLine && (
        <>
          <polyline points={points} fill="none" stroke="var(--color-neutral-800)" strokeWidth="1.4" />
          {recent.length > 0 && (
            <circle cx={x(lastIndex)} cy={y(recent[lastIndex].pull_time_s)} r="3.5" fill="var(--color-accent)" />
          )}
        </>
      )}

      {!showLine &&
        recent.map((s, i) => (
          <circle
            key={s.id}
            cx={x(i)}
            cy={y(s.pull_time_s)}
            r={i === lastIndex ? 4 : 3.5}
            fill={i === lastIndex ? 'var(--color-accent)' : 'none'}
            stroke={i === lastIndex ? 'none' : 'var(--color-neutral-600)'}
          />
        ))}
    </svg>
  );
}
```

`BagTrends` gains a `pullTimeRange: [number, number] | null` prop (beside `targetRatio`) and passes it: `<PullTimeConsistencyChart shots={shots} range={pullTimeRange} />`.

`TrendsPage` resolves it where `BagTrends` is rendered:

```tsx
<BagTrends
  bag={selectedBag}
  targetRatio={targetForBag(bagTargets, selectedBag)}
  pullTimeRange={pullTimeRangeForBag(bagTargets, selectedBag)}
/>
```

- [ ] **Step 4: Run**

Run: `npx vitest run src/pages/TrendsPage.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/TrendsPage.tsx src/pages/TrendsPage.test.tsx
git commit -m "feat: draw the pull-time target band on the trends chart

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CyAxmA5LhinbPrZfBL3F33"
```

---

## Task 11: barista assistant - read the range, rewrite the prompt

**Files:**
- Modify: `supabase/functions/analyze-shot/types.ts`
- Modify: `supabase/functions/analyze-shot/index.ts`
- Modify: `supabase/functions/analyze-shot/orchestrator.ts` / `.test.ts`
- Modify: `supabase/functions/analyze-shot/prompt.ts` / `.test.ts`

**Interfaces:**
- Produces: `Deps.getBagTarget: (shot: ShotRow) => Promise<{ ratio: number | null; pullTime: [number, number] | null } | null>`; `buildPrompt(shot, priorShots, { mixedBeans, targetRatio, pullTimeRange })`.

- [ ] **Step 1: Update the prompt tests**

In `supabase/functions/analyze-shot/prompt.test.ts`, change every `buildPrompt(..., { mixedBeans: X, targetRatio: Y }, NOW)` call to add `pullTimeRange: null`, then add:

```ts
it('renders the pull-time range clause when a range is set', () => {
  const { user } = buildPrompt(
    makeShot({ pull_time_s: 30 }),
    [],
    { mixedBeans: false, targetRatio: 2, pullTimeRange: [26, 31] },
    NOW
  );
  expect(user).toContain('target pull time 26-31s (this shot 30s, in range)');
});

it('shows the shot over the range', () => {
  const { user } = buildPrompt(
    makeShot({ pull_time_s: 34 }),
    [],
    { mixedBeans: false, targetRatio: null, pullTimeRange: [26, 31] },
    NOW
  );
  expect(user).toContain('target pull time 26-31s (this shot 34s, +3s over)');
});

it('says none set when neither ratio nor range is given', () => {
  const { user } = buildPrompt(
    makeShot({}),
    [],
    { mixedBeans: false, targetRatio: null, pullTimeRange: null },
    NOW
  );
  expect(user).toContain('target: none set for this bag');
});

it('system message says grind does not set yield and pins the lever map', () => {
  const { system } = buildPrompt(
    makeShot({}),
    [],
    { mixedBeans: false, targetRatio: 2, pullTimeRange: [26, 31] },
    NOW
  );
  expect(system).toMatch(/grind does not (set|change) yield/i);
  expect(system).toMatch(/to move the pull time, adjust grind/i);
});
```

- [ ] **Step 2: Update the orchestrator test**

In `supabase/functions/analyze-shot/orchestrator.test.ts`, change `makeDeps` default:
```ts
getBagTarget: vi.fn().mockResolvedValue(null),
```
and update the existing "resolves the bag target" test to the object shape:
```ts
it('resolves the bag target for the shot and passes ratio + range into the prompt', async () => {
  const deps = makeDeps({
    getBagTarget: vi.fn().mockResolvedValue({ ratio: 2, pullTime: [26, 31] }),
  });
  await runAnalysis(deps, { shotId: 'shot-1' });
  const messages = (deps.callGroq as ReturnType<typeof vi.fn>).mock.calls[0][0];
  expect(messages.user).toContain('target ratio 1:2.00');
  expect(messages.user).toContain('target pull time 26-31s');
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `npx vitest run supabase/functions/`
Expected: FAIL - range clause absent; SYSTEM lacks the grind rule.

- [ ] **Step 4: Implement**

`types.ts` - change `Deps.getBagTarget`:
```ts
getBagTarget: (shot: ShotRow) => Promise<{ ratio: number | null; pullTime: [number, number] | null } | null>;
```

`orchestrator.ts` - replace the target line:
```ts
const bagTarget = await deps.getBagTarget(shot);
const messages = buildPrompt(shot, priorShots, {
  mixedBeans,
  targetRatio: bagTarget?.ratio ?? null,
  pullTimeRange: bagTarget?.pullTime ?? null,
});
```

`index.ts` - `getBagTarget`:
```ts
getBagTarget: async (shot) => {
  let query = supabase
    .from('bag_targets')
    .select('target_ratio, target_pull_time_low_s, target_pull_time_high_s');
  query = shot.bean_name == null ? query.is('bean_name', null) : query.eq('bean_name', shot.bean_name);
  query = shot.roast_date == null ? query.is('roast_date', null) : query.eq('roast_date', shot.roast_date);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const d = data as {
    target_ratio: number | string | null;
    target_pull_time_low_s: number | null;
    target_pull_time_high_s: number | null;
  };
  return {
    ratio: d.target_ratio == null ? null : Number(d.target_ratio),
    pullTime:
      d.target_pull_time_low_s == null || d.target_pull_time_high_s == null
        ? null
        : [d.target_pull_time_low_s, d.target_pull_time_high_s],
  };
},
```

`prompt.ts`:

- `buildPrompt` opts: `{ mixedBeans: boolean; targetRatio: number | null; pullTimeRange: [number, number] | null }`.
- `targetLine` becomes (keeps the `none set` fallback):
  ```ts
  function targetLine(
    shot: ShotRow,
    targetRatio: number | null,
    pullTimeRange: [number, number] | null
  ): string {
    const clauses: string[] = [];
    if (targetRatio != null) {
      clauses.push(
        `target ratio 1:${targetRatio.toFixed(2)} (this shot is ${fmtSigned(ratio(shot) - targetRatio)})`
      );
    }
    if (pullTimeRange != null) {
      const [low, high] = pullTimeRange;
      const t = Math.round(shot.pull_time_s);
      const pos = t < low ? `${t - low}s under` : t > high ? `+${t - high}s over` : 'in range';
      clauses.push(`target pull time ${low}-${high}s (this shot ${t}s, ${pos})`);
    }
    return clauses.length ? `  ${clauses.join('; ')}` : '  target: none set for this bag';
  }
  ```
  (`currentShotBlock` passes `opts.pullTimeRange` through.)
- SYSTEM message: replace the "Levers:" paragraph and the "dialed" bullet. New "Levers:" paragraph:
  ```
  Levers: grind does not set yield or ratio directly - yield is where you stop the shot, and
  ratio is yield over dose. To move a ratio that is a little off while the pull time is fine,
  change yield (stop earlier for less, later for more), not grind. To move the pull time, adjust
  grind: finer is slower and longer, coarser is faster and shorter. Reach for grind only for a
  pull-time miss or a clear sour/bitter imbalance. More dose lowers the ratio at a fixed yield
  and adds body.
  ```
  New "dialed" bullet (replaces the current one):
  ```
  - if the ratio is within about 0.1 of target (or, with no target, stable across recent shots),
    the pull time is inside the target range (or, with no range, in a sensible 25-32s band and
    steady), and no rating or note flags a problem: say the shot is dialed and the adjustment is
    to repeat it unchanged. A pull time that moved a few seconds from the last shot at the same
    grind and dose does not disqualify this - note it as consistency to watch.
  ```
  Keep the rest (target as stated intent, trust the "Change from the previous shot" line, over/under-extraction is a taste-or-large-miss call, JSON contract).

- [ ] **Step 5: Run**

Run: `npx vitest run supabase/functions/`
Expected: PASS (all function tests).

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/analyze-shot/
git commit -m "feat: barista assistant reads the pull-time range; lever-map prompt fix

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CyAxmA5LhinbPrZfBL3F33"
```

---

## Task 12: documentation

**Files:**
- Modify: `CLAUDE.md`, `docs/target-ratio-design.md`, `docs/barista-assistant-design.md`, `docs/mvp_spec.md`, `docs/target-pull-time-design.md`

- [ ] **Step 1: `CLAUDE.md`**

In the `## Data model` `bag_targets` bullet, add: a per-bag pull-time range (`target_pull_time_low_s` / `_high_s`, both null or both set); `target_ratio` is now nullable so a bag can have a range and no ratio target.

In the `bagState` note, add: with a pull-time range set, "dialed" also requires the last two shots to land inside the range.

In `## Barista assistant`, add: the function also reads the pull-time range; the prompt uses it and no longer confuses grind with yield.

- [ ] **Step 2: `docs/target-ratio-design.md`**

Under "What this is", add a line: a sibling per-bag target, the pull-time range, was added 2026-09-10 - see `docs/target-pull-time-design.md`. Update the section 3 note that `targetForBag` returns a number (a `pullTimeRangeForBag` sibling was added rather than changing its return type).

- [ ] **Step 3: `docs/barista-assistant-design.md`**

Add a dated entry to the "Prompt revisions" list: 2026-09-10 - pull-time range read alongside the ratio; the lever map was rewritten to state that grind does not set yield (it had kept recommending a grind change for small ratio corrections).

Update the `buildPrompt` / `Deps.getBagTarget` signatures in the "Testability structure" section.

- [ ] **Step 4: `docs/mvp_spec.md`**

Append to piece C: a per-bag pull-time range (a low/high window) was added the same way, 2026-09-10; the barista assistant consumes both.

- [ ] **Step 5: `docs/target-pull-time-design.md`**

Add a line at the top of section 3: implemented with a `pullTimeRangeForBag` helper rather than changing `targetForBag`'s return type (less call-site churn).

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md docs/
git commit -m "docs: record the per-bag pull-time range

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CyAxmA5LhinbPrZfBL3F33"
```

---

## Final verification

- [ ] **Full suite with local Supabase up**

```bash
npx supabase start
npx supabase migration up
npx vitest run
```
Expected: all pass.

- [ ] **Build**

Run: `npm run build`
Expected: `tsc` clean, Vite build succeeds.

- [ ] **Manual smoke (`npm run dev`)**

- Log a shot, turn on the pull-time target (seeds around the shot's time), nudge the ends, save. Reopen: the `target ... 26-31s ...` line shows with the right position.
- Log a second shot inside the range with a close ratio: the shot list shows `Dialed`.
- Open Trends for that bag: the accent band spans the range on the pull-time chart, the median band is gone.
- Edit the first shot, widen the range, save: the Trends band and the detail readout both move.
- Turn the target `Off` and save: the band and the readout disappear; the `Dialed` tag reverts to the shot-to-shot rule.

- [ ] **Deploy (after merge, human-run)**

`npm run deploy:supabase` - `supabase db push` applies migration 6, `supabase functions deploy` ships the reworked prompt. Then re-analyze a shot and confirm the assistant uses the range.

---

## Self-Review Notes

- **Spec coverage:** data model + RLS (Task 1); `bagTargets` object form (Task 2); `pullTimeRangeForBag` / `pullTimeAgainstRange` / `bagState` (Task 3); control (Task 4); form wiring (Task 5); persistence from New / Edit (Tasks 6, 7); shot list tag (Task 8); detail readout (Task 9); Trends band (Task 10); prompt (Task 11); docs (Task 12). Spec section 3's "`targetForBag` returns the row" is deliberately not done - `pullTimeRangeForBag` is added instead and the spec is updated to say so (Task 12 Step 5).
- **Deviation from spec:** `targetForBag` keeps its `number | null` return; a parallel `pullTimeRangeForBag` is added. Rationale: changing `targetForBag` ripples to five page call sites for no functional gain.
- **Type consistency:** `BagTarget` (nullable ratio + two columns), `BagTargetValues` `{ targetRatio, pullTime: [number, number] | null }`, `setBagTarget(bag, values)`, `pullTimeRangeForBag(targets, bag): [number, number] | null`, `pullTimeAgainstRange(s, range): { state, delta }`, `bagState(shots, { targetRatio?, pullTimeRange?, now? })`, `Deps.getBagTarget -> { ratio, pullTime } | null`, `buildPrompt(shot, prior, { mixedBeans, targetRatio, pullTimeRange })` - consistent across Tasks 2-11.
- **Migration number** `00000000000006`; bump if another lands first.
- **Test mocks:** every page test file already has `vi.mock('../lib/bagTargets')` and a `listBagTargets` default from the ratio-target work; the new tests extend those. `BagTarget` literals in tests now need the two new fields - the plan's test snippets include them.
