# Per-Bag Target Ratio - Design

## What this is

A target brew ratio you set per bag, so the app knows what you are
aiming for instead of only what you got. Today every shot shows its
actual ratio (`yield / dose`, rendered `1:2.31`) and the `dialed /
dialing` chip on the shot list infers convergence by comparing your
last two shots to each other. Nothing records intent: a bag where
every shot lands 1:2.5 reads the same whether you were going for 1:2.5
or for 1:2 and missing.

This adds one number per bag - the target ratio - and threads it
through the three places ratio already shows up: the log-a-shot form,
the shot detail readout, and the Trends ratio chart. It also changes
what `dialed` means when a target is set.

It is not the Barista Assistant (`docs/barista-assistant-design.md`)
and does not depend on it. This design left the assistant integration
out of scope; it was done separately on 2026-09-10 - the `analyze-shot`
function now reads `target_ratio` and the prompt judges the shot
against it. See the "Prompt revisions" note in
`docs/barista-assistant-design.md`.

## Decisions locked before this design

Settled in the 2026-09-09 brainstorming conversation:

- **Explicit, not inferred.** The user picks the target. The app never
  decides it from shot history. Inference cannot separate "targeting
  1:2, overshot" from "targeting 1:2.5" until a bag already has several
  consistent shots, which is when it is least needed.
- **Per bag.** A target belongs to a bag (`bean_name` + `roast_date`
  pair, the same key `groupShotsByBag` uses), not to a shot and not to
  the user globally. Different beans want different ratios.
- **Current intent, not a historical contract.** One mutable value per
  bag. Changing it re-judges the whole bag against the new number:
  deltas recompute, the goal line moves, the chip re-evaluates. Shots
  never change, only the yardstick. No per-shot target history, no log
  table.
- **A bag can have no target.** While you are still deciding between
  1:2 and 1:3, the bag has no target row: `dialed` falls back to
  today's consistency rule, no goal line, no delta. It does not
  auto-default from your last bag - that would be pretending you have
  decided.
- **Quick picks, adjustable value.** The control offers `1:2 / 1:2.5 /
  1:3` plus an off state. Once a target is set, `+` / `-` buttons nudge
  it by 0.1, so a bag that settles at 1:2.4 can read as dialed against
  1:2.4 rather than sitting permanently 0.4 off a rigid 1:2. Stored as
  a plain number.
- **Set in the shot form only.** The target control lives on the Ratio
  row that the form already has. It is persisted when the shot is
  saved. Changing a target means logging your next shot on the bag, or
  editing any shot on the bag and saving. A target control on the
  Trends page is a possible fast-follow, deliberately out of v1 to hold
  down clutter.
- **`dialed` with a target set:** the last two shots must each be
  within the existing ratio tolerance of the *target* (not of each
  other), and the existing pull-time stability check is unchanged. With
  no target, the rule is exactly as it is today.

## Non-goals for v1

- Any Barista Assistant integration. (Done separately 2026-09-10 - see
  the note above.)
- A target control on the Trends page, the shot list, or the shot
  detail page. Those three surfaces display the target; only the form
  sets it.
- Per-shot or time-ranged target history.
- A global default target, or per-user target preferences.
- Targeting anything other than ratio (no target pull time, no target
  dose).
- Migrating or backfilling targets for existing bags. Every current bag
  starts with no target.
- Changing the `resting` / `past-peak` roast-age logic in `bagState`.

---

## 1. Data model

New migration: `supabase/migrations/00000000000005_bag_targets.sql`
(the Barista Assistant's `00000000000004_shot_analyses.sql` has shipped,
so this takes slot 5).

```sql
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

Field notes:

- The row exists only when a target is set. Clearing a target deletes
  the row. `target_ratio` is therefore `not null`.
- `bean_name` and `roast_date` mirror the columns on `shots` (both
  nullable) so the bag key matches `groupShotsByBag` exactly, including
  the "Unlabeled" bag where both are null.
- `nulls not distinct` on the unique index (Postgres 15+, which
  Supabase runs) makes `(user_id, null, null)` collide with itself, so
  the Unlabeled bag can hold at most one target row like any other bag.
  Without it Postgres treats each null as distinct and the uniqueness
  guarantee is lost for null-keyed bags.
- `check` bounds are a sanity guard against a fat-fingered value, not a
  brewing opinion. 1:0.5 to 1:10 covers every real espresso ratio with
  room to spare.
- `on delete cascade` from `auth.users` matches `shots` and `videos`.
  There is no FK to `shots` - a target outlives any individual shot and
  is keyed by bag identity, not by a shot id.
- No denormalized anything. The table is tiny (one row per bag the user
  has set a target on) and every read is a full `select` scoped by RLS.

RLS isolation gets an explicit cross-user test in
`tests/integration/rls.test.ts`, mirroring the existing `shots` and
`videos` cases.

---

## 2. Client library: `src/lib/bagTargets.ts`

Shape follows `src/lib/videos.ts`: a type plus small functions, no
class.

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

type BagRef = { bean_name: string | null; roast_date: string | null };

// One RLS-scoped select of every target the user has. Small table,
// pages load it alongside listShots().
export function listBagTargets(): Promise<BagTarget[]>;

// Set, change, or clear the target for one bag. Pass null to clear
// (deletes the row). Pass a number to create or overwrite it.
export function setBagTarget(bag: BagRef, targetRatio: number | null): Promise<void>;
```

`setBagTarget` does a null-aware lookup then insert / update / delete
rather than a Supabase `upsert`, because `upsert` with a null-bearing
conflict target is fragile:

1. `select id from bag_targets` filtered by `user_id`, and `bean_name`
   / `roast_date` each matched with `.is(col, null)` when the bag's
   value is null or `.eq(col, value)` otherwise. This is the same
   null-aware matching `analyze-shot` uses for same-bag history in the
   Barista Assistant design.
2. `targetRatio` is null and a row exists: `delete` it. Null and no
   row: no-op.
3. `targetRatio` is a number and a row exists: `update` its
   `target_ratio` by id.
4. A number and no row: `insert` `{ user_id, bean_name, roast_date,
   target_ratio }`, with `user_id` from `supabase.auth.getUser()` like
   `createShot`.

`listBagTargets` returns `[]` on an empty table, never throws for
"none".

---

## 3. `src/lib/shotView.ts` changes

### `targetForBag`

```ts
export function targetForBag(targets: BagTarget[], bag: BagRef): number | null;
```

Returns `target_ratio` for the target whose `bagKey` matches `bag`, or
null. A one-liner over `bagKey`, colocated with `sameBag` /
`groupShotsByBag`.

### `bagState` signature and rule

The signature gains an options object rather than a positional
argument, because callers and tests already pass `now` positionally and
a third position reads badly:

```ts
export function bagState(
  bagShots: Shot[],
  options?: { targetRatio?: number | null; now?: Date }
): BagStateValue;
```

- Existing call `bagState(shots, new Date('2026-09-04'))` becomes
  `bagState(shots, { now: new Date('2026-09-04') })`.
- `ShotListPage` passes `{ targetRatio: targetForBag(targets, bag) }`.

Rule, with the roast-age bookends unchanged and evaluated first:

```
timeStable = |latest.pull_time_s - previous.pull_time_s| <= DIALED_TIME_TOLERANCE_S

if targetRatio != null:
  onTarget(s) = |ratio(s) - targetRatio| <= DIALED_RATIO_TOLERANCE
  return onTarget(latest) && onTarget(previous) && timeStable ? 'dialed' : 'dialing'

# no target: exactly today's behavior
ratioStable = |ratio(latest) - ratio(previous)| <= DIALED_RATIO_TOLERANCE
return ratioStable && timeStable ? 'dialed' : 'dialing'
```

`DIALED_RATIO_TOLERANCE` (0.15) and `DIALED_TIME_TOLERANCE_S` (2) are
reused as-is. The docstring pointer to "assumption 3" in the MVP plan
is updated to describe the target branch.

### `ratioDelta` and formatting

```ts
export function ratioDelta(shot: Pick<Shot, 'dose_g' | 'yield_g'>, targetRatio: number): number;
```

Returns `ratio(shot) - targetRatio`. Rendered with the existing
`formatSigned(delta, 2)` from `src/lib/format.ts`; no new formatter.

---

## 4. UI

All three display surfaces read a `BagTarget[]` the page already
loaded and resolve it with `targetForBag`. Styling uses existing
`src/theme.css` tokens and the `.fig` / `.num` utilities; button and
segmented-control treatment follows the design-foundation constraints
in `docs/superpowers/plans/2026-09-04-design-foundation.md`.

### 4a. `ShotForm.tsx` - the target control

The form's Ratio row (currently `ShotForm.tsx:217`) shows `Ratio ....
1:2.31`. A target control is added directly under the readout, inside
the same bordered row:

```
Ratio                                  1:2.31
Target      ( off )  1:2   1:2.5   1:3       - +
```

- Four-state segmented control: off, 1:2, 1:2.5, 1:3. Exactly one
  active. Tapping the active quick pick again returns to off.
- `-` / `+` buttons: shown only when a target is active, step 0.1,
  clamped to the `check` bounds. Nudging away from a quick-pick value
  (for example 1:2.5 to 1:2.4) leaves no segment highlighted but keeps
  the numeric target shown next to the control.
- When a target is active the Ratio readout also shows the live delta:
  `1:2.31` with `+0.31` beside it in `--color-accent-700`, matching how
  `NudgeRow` shows field deltas. This uses the form's current
  `dose_g` / `yield_g` inputs, so it moves as you nudge them.

New `ShotForm` props (the component stays presentational - it does not
touch `bagTargets.ts`):

```ts
target: number | null;
onTargetChange: (next: number | null) => void;
```

`emptyShotFormValues` is unchanged; the target is not a form value, it
is a sibling piece of state owned by the page.

The segmented control is its own component,
`src/components/RatioTargetControl.tsx`, so it is unit-testable and
reusable if the Trends fast-follow happens.

### 4b. `NewShotPage.tsx` and `EditShotPage.tsx` - owning and persisting

Both pages hold `const [target, setTarget] = useState<number | null>(null)`
and pass `target` / `setTarget` to `ShotForm`.

- **NewShotPage:** on mount, after `listShots`, also `listBagTargets`.
  When a `selectedBag` is chosen (existing bag or `from=` seed), seed
  `target` with `targetForBag(targets, selectedBag)`. For a brand-new
  bag, `target` stays null. On `handleSubmit`, after `createShot`
  resolves, if `target` differs from the bag's stored value call
  `setBagTarget({ bean_name, roast_date }, target)` using the just-saved
  shot's bean/roast. A failure here does not block navigation to the
  shot - it surfaces the same way video-upload failures do, as a
  non-fatal error line.
- **EditShotPage:** on mount, after `getShot`, `listBagTargets` and
  seed `target` from the shot's bag. On `handleSubmit`, after
  `updateShot`, if `target` changed call `setBagTarget`. If the edit
  also changed `bean_name` / `roast_date` (moving the shot to a
  different bag), the target write targets the new bag key; the old
  bag's target row is left alone.

"Differs from the bag's stored value" is checked so saving a shot
without touching the target does not churn the row or its
`updated_at`.

### 4c. `ShotDetailPage.tsx` - the readout

`ShotDetailPage` already loads the shot and `listShots()` for the
previous-shot delta. Add `listBagTargets()` to that load.

Under the `RatioFigure` / `PullTimeFigure` block (`ShotDetailPage:153`),
when the bag has a target, one quiet line:

```
target 1:2.0  ·  +0.31
```

in the same 11px uppercase `--color-neutral` treatment as the
bean/age/timestamp line above the figures. `+0.31` is
`formatSigned(ratioDelta(shot, target), 2)`. No control, no link. When
the bag has no target the line is absent.

### 4d. `TrendsPage.tsx` - the goal line

`TrendsPage` loads shots and groups them; add `listBagTargets()` and
resolve the target for `selectedBag`.

In `RatioOverTimeChart`, when a target exists:

- Extend the y domain to include the target so the line is never
  off-canvas. `RatioOverTimeChart` now derives its y scale from
  `niceDomain(ratios, 0.3)` (added by the trends-readability work), so
  fold the target into that call's input: `niceDomain(target != null ?
  [...ratios, target] : ratios, 0.3)`. Keep the chart's existing scale
  output ranges and axis ticks; do not rewrite the function.
- Draw a horizontal `<line>` at `y(target)` in `--color-accent-300`,
  dashed (`stroke-dasharray`), with a small `1:2.0` label at the right
  edge using the chart's existing `TICK_STYLE`.

The chart's caption ("Is a longer pull pulling wetter or drier?") is
unchanged. `PullTimeConsistencyChart` and `RatingByShotChart` are not
touched.

### 4e. `ShotListPage.tsx` - the chip

`ShotListPage` adds `listBagTargets()` to its load effect and keeps the
result in state. `BagGroup` receives the `BagTarget[]` (or the
resolved number) and both `bagState` calls become:

```ts
bagState(bag.shots, { targetRatio: targetForBag(targets, bag) })
```

No visual change to `BagTag` itself - only what it says. The `active`
filter (`bagState(bag.shots) !== 'past-peak'`) gets the same argument.

---

## 5. Testing

### Unit (Vitest, no stack)

- `src/lib/bagTargets.test.ts` (mocking `supabase`): `setBagTarget`
  inserts when no row exists, updates by id when one does, deletes when
  passed null, no-ops on null with no row; null-aware matching uses
  `.is` for a null-keyed bag and `.eq` otherwise; `listBagTargets`
  returns `[]` for an empty result.
- `src/lib/shotView.test.ts`: `targetForBag` matches by full bag key
  including the both-null bag and returns null on no match. `bagState`
  with `{ targetRatio }`: `dialed` when both recent shots are within
  0.15 of the target and pull times within 2s; `dialing` when one shot
  is outside the target band even though the two shots agree with each
  other; `dialing` when on-target but pull times differ by more than
  2s; with `targetRatio` null or omitted, identical results to the
  current tests (which are updated to the options-object call form);
  roast-age `resting` / `past-peak` still win over the target branch.
- `src/lib/format.ts`: no change; `formatSigned` already covers the
  delta.
- `src/components/RatioTargetControl.test.tsx`: renders four states
  with the right one active; clicking a quick pick calls
  `onTargetChange` with 2 / 2.5 / 3; clicking the active pick calls it
  with null; `+` / `-` step by 0.1 and clamp; `+` / `-` hidden when
  off.
- `src/components/ShotForm.test.tsx`: passes `target` / `onTargetChange`
  through; the Ratio readout shows the live delta only when a target is
  set and it tracks dose/yield edits.

### Component (React Testing Library, mocked libs)

- `NewShotPage.test.tsx`: seeds the target from an existing bag's
  stored value; leaves it null for a new bag; calls `setBagTarget` on
  submit only when the value changed; a `setBagTarget` rejection still
  navigates to the shot and shows a non-fatal error.
- `EditShotPage.test.tsx`: seeds from the shot's bag; writes on submit
  when changed; does not write when untouched.
- `ShotDetailPage.test.tsx`: renders the `target 1:X · +Y` line when
  the bag has a target, omits it otherwise.
- `TrendsPage.test.tsx`: renders the goal line and its label when a
  target exists; y domain includes an out-of-range target; no line
  when absent.
- `ShotListPage.test.tsx`: a bag whose shots all sit near its target
  shows `Dialed`; the same shots with no target row fall back to the
  consistency rule.

### Integration (local Supabase, like `tests/integration/rls.test.ts`)

- `bag_targets` RLS: user B cannot select, insert against their own id
  a row they then read as A's, update, or delete user A's target row.
- The `nulls not distinct` index: a second insert for the same
  `(user_id, null, null)` bag fails the unique constraint.

---

## 6. Docs to update alongside the code

- `CLAUDE.md` "Data model" section: add `bag_targets` (per-bag target
  ratio, keyed by `bean_name` + `roast_date`, no row means no target).
- `CLAUDE.md` note that `bagState` has a target-aware branch.
- `docs/mvp_spec.md` roadmap: a line under Phase 2 or a new short
  entry, since this is net-new capability beyond the three trends
  views and the assistant.
- The design schema (`docs/design/`) if it specifies the Ratio row or
  the Trends ratio chart at a fidelity that this changes.

---

## 7. Files

```
supabase/
  migrations/
    0000000000000N_bag_targets.sql          new
src/
  lib/
    bagTargets.ts                            new
    bagTargets.test.ts                       new
    shotView.ts                              modified: targetForBag, bagState branch, ratioDelta
    shotView.test.ts                         modified
  components/
    RatioTargetControl.tsx                   new
    RatioTargetControl.test.tsx              new
    ShotForm.tsx                             modified: target props, control on the Ratio row, live delta
    ShotForm.test.tsx                        modified
  pages/
    NewShotPage.tsx                          modified: load, seed, persist target
    NewShotPage.test.tsx                     modified
    EditShotPage.tsx                         modified: load, seed, persist target
    EditShotPage.test.tsx                    modified
    ShotDetailPage.tsx                       modified: load targets, readout line
    ShotDetailPage.test.tsx                  modified
    TrendsPage.tsx                           modified: load target, goal line
    TrendsPage.test.tsx                      modified
    ShotListPage.tsx                         modified: load targets, pass to bagState
    ShotListPage.test.tsx                    modified
tests/
  integration/
    rls.test.ts                              modified: bag_targets isolation + unique index
docs/
  target-ratio-design.md                     this file
```

No new npm dependencies. The Trends goal line is one more SVG element,
consistent with the design's hand-drawn-chart rule (no charting
library).
