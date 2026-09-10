# Per-Bag Target Pull Time - Design

## What this is

A pull-time window you set per bag - "I want this bag to run 26-31s" -
so the app and the barista assistant know the time you are aiming for,
not just the ratio. It is the direct sibling of the per-bag target
ratio (`docs/target-ratio-design.md`); this doc only covers what
differs. Where it says "mirrors the ratio target", read that design.

Two differences from the ratio target:

- **It is a range, not a point.** Ratio you dial to a number and a
  fixed tolerance absorbs the wobble. Pull time is genuinely a window
  ("26 to 31 seconds"), so it is stored and shown as a low/high pair.
  There is no separate tolerance constant - the range is the tolerance.
- **It also drives a prompt rewrite.** The `analyze-shot` function
  already reads `target_ratio`; this adds the time range and, in the
  same pass, fixes a standing prompt bug: the model keeps recommending
  a grind change for a small ratio correction ("grind coarser to
  reduce yield"), which is the wrong lever and a physics error (grind
  does not set yield).

Decided in a 2026-09-10 brainstorming conversation.

## Decisions locked before this design

- **Full mirror.** Same four surfaces as the ratio target: the shot
  form sets it; the shot detail readout, the Trends pull-time chart,
  and the shot list's Dialed/Dialing tag all reflect it.
- **A range, pull time only.** The ratio target stays a single value
  with its existing 0.15 tolerance. Only pull time gets a low/high
  range.
- **Independent of the ratio target.** A bag can have a ratio target, a
  time range, both, or neither. A `bag_targets` row exists when any of
  the three is set; clearing all three deletes the row.
- **Two-end control.** `Off`, then a low value and a high value, each
  nudged independently by 1s. On first enable it seeds to a window
  around the shot's current pull time, so most users never touch it
  after turning it on.
- **`dialed` with a range set:** the range replaces the "last two
  shots' pull times within 2s of each other" check with "both land
  inside the range". See the rule below.
- **The barista assistant consumes it** and the prompt is reworked in
  the same change.

## Non-goals for v1

- Reworking the ratio target into a range.
- Target dose, or a target for anything else.
- A target-time control anywhere but the shot form (the other surfaces
  display it, like the ratio target).
- Per-shot or time-ranged target history.
- Backfilling ranges for existing bags.
- Changing the `resting` / `past-peak` roast-age logic in `bagState`.

---

## 1. Data model

New migration `supabase/migrations/00000000000006_bag_target_pull_time.sql`:

```sql
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

Notes:

- `target_ratio` becomes nullable so a bag can have a time range and no
  ratio target. The existing `check (target_ratio > 0.5 and < 10)`
  still holds - a NULL passes a CHECK.
- `bag_targets_pull_time_range` forbids a half-set range and enforces
  `low < high` inside a sane 5-120s band.
- `bag_targets_not_empty` is a backstop against an all-null row; the
  client deletes the row when everything is cleared.
- The unique index (`user_id, bean_name, roast_date`) and the RLS
  policies are unchanged - same row, same ownership rule.

RLS test additions (`tests/integration/rls.test.ts`): the CHECK rejects
a half-set range and an inverted range; a row with only a pull-time
range (no `target_ratio`) is allowed.

---

## 2. Client library: `src/lib/bagTargets.ts`

`BagTarget` gains the nullable columns:

```ts
export type BagTarget = {
  id: string;
  user_id: string;
  bean_name: string | null;
  roast_date: string | null;
  target_ratio: number | null;              // was: number
  target_pull_time_low_s: number | null;    // new
  target_pull_time_high_s: number | null;   // new
  created_at: string;
  updated_at: string;
};
```

`setBagTarget` takes an object instead of a bare ratio - the form
writes all three fields together:

```ts
type BagTargetValues = {
  targetRatio: number | null;
  pullTime: [number, number] | null;   // [low, high]
};

export function setBagTarget(bag: BagRef, values: BagTargetValues): Promise<void>;
```

Behaviour (null-aware bag lookup unchanged):

- all fields null -> delete the row if it exists, else no-op
- otherwise -> update the row's three columns if it exists, else insert
  `{ user_id, bean_name, roast_date, target_ratio, target_pull_time_low_s,
  target_pull_time_high_s }`

`listBagTargets` is unchanged (it already `select()`s all columns).

Call sites to update: `NewShotPage`, `EditShotPage` (the only two
callers; both already pass a ratio).

---

## 3. `src/lib/shotView.ts`

### `pullTimeRangeForBag` (new) - `targetForBag` unchanged

The implementation keeps `targetForBag(targets, bag): number | null`
(the ratio) as it is - changing its return type would ripple to five
page call sites for no functional gain - and adds a parallel helper:

```ts
export function pullTimeRangeForBag(targets: BagTarget[], bag: BagRef): [number, number] | null;
// [low, high] for the matching bag when both columns are set, else null
```

Pages that need the range call it alongside `targetForBag`.

### `ratioDelta` - unchanged.

### `pullTimeAgainstRange`

```ts
export function pullTimeAgainstRange(
  pullTimeS: number,
  range: [number, number]
): { state: 'under' | 'in' | 'over'; delta: number };
// in  -> delta 0
// over -> delta = pullTimeS - high  (positive)
// under -> delta = pullTimeS - low  (negative)
```

Used by the shot detail readout.

### `bagState` gains the range

```ts
export function bagState(
  bagShots: Shot[],
  options?: { targetRatio?: number | null; pullTimeRange?: [number, number] | null; now?: Date }
): BagStateValue;
```

Rule (roast-age bookends still evaluated first, unchanged):

```
ratioOk = targetRatio != null
  ? both recent shots within DIALED_RATIO_TOLERANCE of targetRatio
  : |ratio(latest) - ratio(previous)| <= DIALED_RATIO_TOLERANCE      // today's shot-to-shot

timeOk = pullTimeRange != null
  ? both recent shots' pull_time_s within [low, high]
  : |latest.pull_time_s - previous.pull_time_s| <= DIALED_TIME_TOLERANCE_S   // today's shot-to-shot

return ratioOk && timeOk ? 'dialed' : 'dialing'
```

With neither target set, or with only the ratio target set, this is
byte-for-byte today's behaviour. `DIALED_RATIO_TOLERANCE` (0.15) and
`DIALED_TIME_TOLERANCE_S` (2) are reused only on the no-target branches.

---

## 4. UI

### 4a. `src/components/PullTimeTargetControl.tsx` (new)

```ts
export function PullTimeTargetControl(props: {
  value: [number, number] | null;
  onChange: (next: [number, number] | null) => void;
  currentPullTime: number;   // the form's live pull_time_s: seeds the range and shows the live position
}): JSX.Element;
```

- `Off` button (`aria-label` "No pull time target", `aria-pressed` when
  `value` is null). Clicking it with a range set calls `onChange(null)`;
  clicking it while off calls `onChange` with the seed range.
- Seed range: `[round(currentPullTime) - 2, round(currentPullTime) + 2]`,
  clamped to `[5, 120]` with `low < high`. When `currentPullTime` is not
  a positive number (blank form on a new bag), seed `[25, 32]`.
- When `value` is set: a low stepper and a high stepper, each with
  `-` / `+` (`aria-label`s "Decrease low" / "Increase low" / "Decrease
  high" / "Increase high"), step 1s. Clamp low to `[5, high - 1]`, high
  to `[low + 1, 120]`.
- Beside the steppers, the live position: `30s in range` or `34s +3s`
  (`pullTimeAgainstRange(currentPullTime, value)`), in
  `--color-accent-700`, matching how the Ratio row shows its delta.

Layout mirrors `RatioTargetControl`: it sits directly under the Pull
time `NudgeRow` in `ShotForm`. Styling uses the same tokens and the
`.fig` utility.

### 4b. `src/components/ShotForm.tsx`

Two new optional props, mirroring `target` / `onTargetChange`:

```ts
pullTimeTarget?: [number, number] | null;
onPullTimeTargetChange?: (next: [number, number] | null) => void;
```

Render `PullTimeTargetControl` immediately after the Pull time
`NudgeRow`, passing `currentPullTime={Number(values.pull_time_s)}`.

### 4c. `NewShotPage.tsx` / `EditShotPage.tsx`

Both already hold `target` state, seed it from `targetForBag`, gate the
form render on `bagTargetsLoaded`, and persist on submit when changed.
Add a parallel `pullTimeTarget: [number, number] | null` state:

- **Seed:** from `pullTimeRangeForBag(bagTargets, bag)`, in the same
  effect that seeds `target`.
- **Persist:** on submit, build the current
  `{ targetRatio, pullTime }` and the stored one; if they differ, call
  `setBagTarget(bagRef, { targetRatio, pullTime })`. One call writes
  both.
- The non-fatal error handling and the "differs from stored" guard are
  the same as the ratio target's.

### 4d. `ShotDetailPage.tsx` - the readout

`const target = targetForBag(bagTargets, shot)` (the ratio, unchanged)
and `const pullRange = pullTimeRangeForBag(bagTargets, shot)`. The quiet
11px uppercase line below the figures, by case:

- ratio only: `target 1:2.0 · +0.06`  (unchanged)
- range only: `target 26-31s · 30s in range`
- both: `target 1:2.0 +0.06 · 26-31s 30s in range`
- over the range: `... 26-31s 34s +3s`
- under the range: `... 26-31s 22s -4s`

No line when the bag has no target at all. Range bounds are inclusive
(a 26s shot is in a 26-31s range).

### 4e. `TrendsPage.tsx` - the target band

`RatioOverTimeChart` is untouched (that is the ratio goal line).

`PullTimeConsistencyChart` today draws a median line plus a shaded
`median +/- 1s` band, then the polyline / dots. When a range is set:

- Draw the target band as a shaded `<rect>` from `y(high)` to `y(low)`
  in `--color-accent-100`, with a `26-31s` label at the right edge in
  `TICK_STYLE`.
- **Replace** the `median +/- 1s` band with the target band (two bands
  read as noise); keep the median line.
- Extend the y domain to include `low` and `high` so the band is never
  clipped, the same way the ratio chart extends its domain to the
  target.

When no range is set: unchanged.

`BagTrends` resolves `pullTimeRangeForBag(bagTargets, selectedBag)` and
passes it down.

### 4f. `ShotListPage.tsx` - the tag

`BagGroup` and the `visibleBags` filter pass the resolved target into
`bagState`:

```ts
bagState(bag.shots, {
  targetRatio: targetForBag(bagTargets, bag),
  pullTimeRange: pullTimeRangeForBag(bagTargets, bag),
});
```

No visual change to `BagTag`; only what it says.

---

## 5. The barista prompt

`supabase/functions/analyze-shot/`.

### Data flow

- `types.ts`: `Deps.getBagTarget` returns
  `{ ratio: number | null; pullTime: [number, number] | null } | null`
  instead of `number | null`.
- `index.ts` `getBagTarget`: select `target_ratio,
  target_pull_time_low_s, target_pull_time_high_s`; return the object,
  or null when there is no row.
- `orchestrator.ts`: pass the object to `buildPrompt`.
- `prompt.ts` `buildPrompt` opts:
  `{ mixedBeans; targetRatio: number | null; pullTimeRange: [number, number] | null }`.

### `targetLine` in the user message

- ratio + range: `target ratio 1:2.00 (this shot is +0.06); target pull
  time 26-31s (this shot 30s, in range)`
- one set: just that clause
- neither: `target: none set for this bag`

Position and the "no target -> reason from the numbers and trend" rule
are unchanged.

### System message rewrite

Keeps the current structure (target as stated intent, trust the
"Change from the previous shot" line, terse, JSON contract) and changes:

- **The lever map, sharpened.** Grind does not set yield or ratio
  directly - yield is where you stop the shot. To move a ratio that is
  a little off with a fine pull time, adjust yield (stop earlier or
  later), not grind. To move the pull time, adjust grind (finer =
  slower = longer; coarser = faster = shorter). Dose changes ratio at a
  fixed yield plus body.
- **Judge pull time against the range** when one is set, the same way
  it judges ratio against the target. In range = on target for time.
- **The "dialed, repeat it" path** now reads: ratio within ~0.1 of
  target (or, no target, stable across recent shots) AND pull time in
  the target range (or, no range, in a sensible 25-32s band and steady)
  AND no rating or tasting note flags a problem.
- Over/under-extraction stays a tasting-note or large-miss call, not a
  sub-0.1 ratio gap (already in the prompt; keep and reinforce).

Recorded as the next dated entry in the "Prompt revisions" section of
`docs/barista-assistant-design.md`.

---

## 6. Testing

Unit / component (Vitest, jsdom):

- `bagTargets.test.ts` (integration, local Supabase): `setBagTarget`
  with the object writes ratio-only, range-only, both; clears the row
  when all null; the null-keyed bag still works.
- `shotView.test.ts`: `pullTimeRangeForBag` returns `[low, high]` / null;
  `pullTimeAgainstRange` under/in/over;
  `bagState` matrix - range only, range + ratio, in-range vs one shot
  out; unchanged results when neither or only-ratio is set (existing
  cases migrate to the options object as they did for the ratio target).
- `PullTimeTargetControl.test.tsx`: off/on; seed `currentTime +/- 2`;
  seed `[25, 32]` when the form time is blank; each stepper nudges and
  clamps; `low < high` held; live position text.
- `ShotForm.test.tsx`: the two props thread through; the control
  renders under the Pull time row.
- `NewShotPage.test.tsx` / `EditShotPage.test.tsx`: seed the range from
  the bag; `setBagTarget` called with the object on a change; not
  called when nothing changed.
- `ShotDetailPage.test.tsx`: readout for range-only, both, out-of-range;
  absent with no target.
- `TrendsPage.test.tsx`: the target band and label draw when a range is
  set; the median +/- band is gone in that case; nothing when absent.
- `ShotListPage.test.tsx`: a bag with a range reads Dialed when both
  recent shots are in range, Dialing when one is outside.
- `analyze-shot/prompt.test.ts`: `targetLine` renders the range clause;
  SYSTEM carries the grind-does-not-set-yield rule and the range-aware
  dialed path.
- `analyze-shot/orchestrator.test.ts`: `getBagTarget` returns the
  object; the range reaches the prompt.

Integration (`tests/integration/rls.test.ts`): the two CHECK cases and
the ratio-null row, per section 1.

---

## 7. Files

```
supabase/
  migrations/
    00000000000006_bag_target_pull_time.sql   new
  functions/analyze-shot/
    types.ts                                  modified: getBagTarget return shape
    index.ts                                  modified: getBagTarget query
    orchestrator.ts                           modified: pass the object
    orchestrator.test.ts                      modified
    prompt.ts                                 modified: targetLine + SYSTEM rewrite
    prompt.test.ts                            modified
src/
  lib/
    bagTargets.ts                             modified: types, setBagTarget object
    bagTargets.test.ts                        modified
    shotView.ts                               modified: pullTimeRangeForBag,
                                              pullTimeAgainstRange, bagState range branch
    shotView.test.ts                          modified
  components/
    PullTimeTargetControl.tsx                 new
    PullTimeTargetControl.test.tsx            new
    ShotForm.tsx                              modified: two props, control under Pull time row
    ShotForm.test.tsx                         modified
  pages/
    NewShotPage.tsx / .test.tsx               modified: range state, seed, persist
    EditShotPage.tsx / .test.tsx              modified: same
    ShotDetailPage.tsx / .test.tsx            modified: readout
    TrendsPage.tsx / .test.tsx                modified: target band
    ShotListPage.tsx / .test.tsx              modified: bagState arg
tests/
  integration/
    rls.test.ts                               modified: CHECK cases, ratio-null row
docs/
  target-pull-time-design.md                  this file
  target-ratio-design.md                      modified: cross-reference
  barista-assistant-design.md                 modified: Prompt revisions entry
  mvp_spec.md                                 modified: note appended to piece C
CLAUDE.md                                     modified: bag_targets columns, bagState note
```

No new npm dependencies. The Trends band is one more `<rect>`,
consistent with the hand-drawn-chart rule.
