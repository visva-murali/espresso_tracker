# Design Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the three existing v1 screens (shot list, log a shot, shot detail) and add a new trends screen on the Classical design system specified in `docs/design/`, so every screen in the app shares one visual language before Phase 2's Trends and Barista Assistant work builds on top of it.

**Architecture:** No backend or schema changes. Tokens become CSS custom properties in a new `src/theme.css` imported alongside Tailwind; screens are rebuilt as React components styled with Tailwind arbitrary values that reference those custom properties (`p-[var(--space-4)]`), plus the two typography utility classes (`.num`, `.fig`) the schema requires. New pure functions in `src/lib/` compute everything the design derives client-side (bag grouping, dial-in state, deltas, ratios) so components stay thin. Icons are hand-written inline SVGs matching Lucide's paths, not the `lucide-react` package, per the schema's asset note.

**Tech Stack:** React 18, TypeScript, Vite, Tailwind CSS v4, React Router, Vitest, React Testing Library. No new dependencies.

**Spec:** `docs/design/README.md` (the full schema: tokens, layout rules, all four screens, decisions table) and `docs/design/classical/readme.md` (the design system's own guide). Both travel with this plan; read `docs/design/README.md` in full before starting - every measurement and rule below is copied from it, but the screen sections there also carry prose context this plan does not repeat.

## Progress (as of 2026-09-04, paused mid-execution)

Being executed via `superpowers:subagent-driven-development` on branch `worktree-design-foundation` (worktree at `.claude/worktrees/design-foundation` off the main repo). Paused after Task 2 - not a blocker, the user stopped execution to conserve credits. Resume by re-entering that worktree and continuing with Task 3.

**Done, committed, reviewed clean:**
- Task 0 (tokens and fonts) - commit `b4736de`
- Task 1 (shot-view helpers) - commit `1e5ca54`. Review caught a real latent bug in this plan's own `parsedGrindDelta` code (bare `Number.parseFloat` would have accepted `"2 o'clock"` as `2`, contradicting this plan's own test); fixed in both the shipped code and in this plan's text (search "NUMERIC_GRIND" below) - no further action needed on that front.
- Task 2 (shared display primitives) - commits `1e5ca54..7c466d7` (one fix round: `BagSelector` was missing hover/pressed states, now fixed).

**Not started:** Task 3 (shot list page) is next, in plan order. Tasks 4, 5, 6 (ShotForm, NewShotPage, EditShotPage) must be dispatched and reviewed as **one combined unit**, not three separate ones - Task 4 alone leaves `NewShotPage.test.tsx` and `EditShotPage.test.tsx` failing until 5 and 6 also land, since all three share one breaking prop-signature change to `ShotForm`. Then Task 7 (shot detail), then Task 8 (trends).

**Two Minor items parked for the final whole-branch review** (do not need fixing now, do not block progress): `src/lib/format.ts`'s `HAIR_SPACE` constant and its two test assertions use a plain space (U+0020) instead of the real Unicode hair space (U+200A) this plan specifies - an implementer transcription slip; fixing it later only touches `format.ts`/`format.test.ts` since every consumer calls the shared `formatMass()` helper rather than hardcoding the character. Also: `bagKey()` helpers (in `shotView.ts` and `BagSelector.tsx`) use a `|` or space separator rather than this plan's exact literal character - functionally equivalent, no fix needed.

**If resuming without the original session's ledger** (e.g. a fresh worktree instead of the one above): the full ruling history, review verdicts, and exact commit ranges live in `.superpowers/sdd/2026-09-04-design-foundation/progress.md` inside that worktree - it is git-ignored, so it only exists there, not on this branch. If that file is gone, this Progress section plus `git log --oneline` on this branch (commits `b4736de`, `1e5ca54`, `7c466d7`, in that order, each a completed task) is the recovery path; the pre-flight conflict scan and rulings the ledger recorded are otherwise summarized above.

## Global Constraints

- No em dashes anywhere in code comments, docs, commit messages, or written output - use a regular hyphen or restructure the sentence.
- Do not add or reference time estimates anywhere in this plan, in code, or in status updates.
- No schema migrations. Everything runs against the existing `shots` and `videos` tables (`docs/design/README.md`, "Schema changes: None required").
- Do not port `docs/design/classical/styles.css` wholesale and do not introduce a component library. Take tokens as CSS variables; build components as plain React + Tailwind arbitrary values (`docs/design/README.md`, "About the design files").
- Colours, type, spacing and sizes in the schema are final and exact - recreate them pixel-accurately. Sample data shown in the schema (bean names, timestamps, ratios) is placeholder content, not copy to ship.
- Icons are inline SVG on `currentColor`, 16px at interface size, `stroke-width: 1.5` - no icon package dependency.
- Every interactive element needs a themed hover tint and a pressed state one ramp step past the base, and `:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }` - never the browser default focus ring.
- Destructive actions (delete) use a ghost button plus a confirm dialog, never a red fill, and never sit adjacent to a save/primary action.
- `.fig` (Lora semibold, tabular figures) is used for every changing number; `.num` (tabular figures only) is used for static numeric text like timestamps and metadata lines. Never set a changing figure in the heading font.

## Assumptions this plan makes where the schema is silent

The schema (`docs/design/README.md`) is a visual and structural spec, not a full functional spec - a few behaviours it implies are not fully pinned down. This plan makes an explicit call on each rather than guessing silently. Flag any of these to the user if they turn out wrong once the screens are live:

1. **Bag heading micro line.** The schema's example text is `Roaster · 12 d · 8 shots`, but there is no `roaster` field anywhere in the schema (only `bean_name` and `roast_date` exist, and schema changes are "none required"). Treating "Roaster" as sample filler content, the micro line this plan builds is `{days off roast} d · {shot count} shots`, dropping the fictional roaster segment. The bag title itself (Cormorant 600 19px) is `bean_name`, falling back to "Unlabeled" when null.
2. **"Active bags" vs "All shots" segmented control.** Not defined beyond the toggle existing. This plan treats a bag as inactive once its `bagState` is `'past-peak'`; "Active bags" hides those bags, "All shots" shows every bag.
3. **`bagState` precedence.** The schema lists four rules (dialed, dialing, resting, past-peak) as independent conditions but a bag can satisfy more than one at once (e.g. two shots that both converge and sit under 4 days off roast). This plan resolves ties in this order: (a) exactly one shot in the bag always means no tag, per the schema's explicit carve-out; (b) roast-date bookends (`past-peak` at >28 days, `resting` at <4 days) take precedence when `roast_date` is known, since those describe the bean's usable window regardless of how the numbers look; (c) `dialed`/`dialing` from the last two shots' convergence otherwise; (d) no tag if none of the above apply (e.g. `roast_date` is null and there are fewer than two shots... which is already covered by (a), so in practice this only leaves `dialed`/`dialing` as the fallback whenever roast_date is unknown).
4. **Grind deltas.** `grind_setting` is free text (schema: "rendered verbatim... never coerced to a number"), but the nudge row and delta block need a numeric delta to show `+0.2`. This plan parses `grind_setting` with `Number.parseFloat` for delta purposes only; when either value fails to parse as a number, the delta is `null` and the UI shows the changed-state colour without a numeric delta.
5. **Where "Trends" and "Sign out" live.** The shot list header only specifies title, search, and menu icon buttons - no explicit nav entry for `/trends`, and the existing sign-out control has nowhere obvious to go in the new header. This plan puts both behind the menu icon button as a small dropdown (Trends, Sign out). The search icon button is rendered but inert - the schema does not specify search behaviour anywhere, so this plan does not invent one.
6. **New-shot bag selection.** The reference strip's "Change" button "opens bag selection" with no further detail. This plan implements a minimal dropdown listing every bag (reused as `BagSelector` for the Trends screen's bag selector too), not a full-screen picker.
7. **Video plate states.** The schema names four states (no video, uploading, ready, unplayable) but the current codebase has no upload-progress reporting and no format-playability check. This plan shows an indeterminate progress bar during upload (Supabase's `upload()` call does not expose byte-level progress without switching to a raw multipart request, which is out of scope for a visual redesign) and detects "unplayable" via the `<video>` element's native `error` event rather than pre-inspecting the file.
8. **Edit shot reference values.** The schema only describes duplicate-and-nudge for a *new* shot copied from a bag's reference shot. For editing an existing shot, this plan treats the shot's own pre-edit values as the reference to diff against and reset to - so an edit screen shows exactly what changed relative to what was originally saved, which is the same mechanic applied to a different reference point.
9. **Starting a brand-new bag.** The schema's log-a-shot screen only shows duplicate-and-nudge from an existing bag's reference shot, with no path for a bag that has never been logged before - including a first-time user's very first shot ever, where no reference shot can exist. This plan adds a step ahead of the nudge rows for that case: when there are no bags yet, or the user taps a "Start a new bag" link next to the reference strip, plain text/date inputs for bean name and roast date are shown first (both optional, matching the schema's fields); confirming them mounts `ShotForm` with `emptyShotFormValues` (all four nudge fields blank, bean name/roast date filled in) as both reference and initial values, so nudging up from blank behaves like nudging from zero rather than failing to render at all.
10. **"Duplicate opens `/shots/new` seeded from this shot."** Read literally, "this shot" is whichever shot the detail page is showing, not necessarily its bag's most recent shot - duplicating an old, specific shot from a bag's history should copy that shot, not silently default to a newer one. This plan carries the shot's id as a `?from=<shotId>` query param on both the detail page's "Duplicate" and "Pull another like this" links; `NewShotPage` reads it and uses that specific shot as the reference until the user explicitly changes bag via "Change" (which reverts to that new bag's own most recent shot).

---

## File Structure Overview

```
espresso_tracker/
  index.html                                  add Google Fonts links
  src/
    theme.css                                 new: tokens as CSS custom properties, .num/.fig utilities
    index.css                                 modified: import theme.css alongside tailwind
    lib/
      format.ts                               new: formatSigned, formatMass, formatTime, formatRoastAge
      format.test.ts                          new
      shotView.ts                             new: groupShotsByBag, bagState, referenceShot, deltas, ratio, formatRatio, daysSinceRoast
      shotView.test.ts                        new
      chartScale.ts                           new: scaleLinear, medianOf
      chartScale.test.ts                      new
    components/
      icons.tsx                               new: SearchIcon, MenuIcon, VideoIcon, PlayIcon
      icons.test.tsx                          new
      BagSelector.tsx                         new: shared bag-picking dropdown (New shot's "Change", Trends' bag selector)
      BagSelector.test.tsx                    new
      shot-display/
        RatioFigure.tsx                       new
        PullTimeFigure.tsx                    new
        RatingDots.tsx                        new
        BagTag.tsx                            new
        shot-display.test.tsx                 new
      ShotForm.tsx                            rewritten: reference/initial values, nudge rows, reset, rating, tasting note
      ShotForm.test.tsx                       rewritten
    pages/
      ShotListPage.tsx                        rewritten
      ShotListPage.test.tsx                   rewritten
      NewShotPage.tsx                         rewritten: reference strip, bag selection, video attach, optional block
      NewShotPage.test.tsx                    rewritten
      EditShotPage.tsx                        modified: pre-edit values as the reference
      EditShotPage.test.tsx                   modified
      ShotDetailPage.tsx                      rewritten: hero, video plate, spec table, delta block, tasting note, bottom bar
      ShotDetailPage.test.tsx                 rewritten
      TrendsPage.tsx                          new: three SVG charts
      TrendsPage.test.tsx                     new
    App.tsx                                   modified: add /trends route
```

---

### Task 0: Design tokens and fonts

**Files:**
- Create: `src/theme.css`
- Modify: `src/index.css`, `index.html`

**Interfaces:**
- Produces: every CSS custom property under `:root` listed in `docs/design/README.md`'s "Design tokens" section, plus the `.num` and `.fig` utility classes. Every later task's className strings assume these variables and classes exist globally.

This task has no application logic, so there is nothing to unit test; verification is a successful build plus a visual sanity check.

- [ ] **Step 1: Write `src/theme.css`**

```css
/* src/theme.css */
:root {
  --color-bg: #f3f2f2;
  --color-surface: #eae9e9;
  --color-text: #201f1d;
  --color-accent: #b68235;
  --color-divider: color-mix(in srgb, #201f1d 16%, transparent);

  --color-neutral-100: #f8f4f4;
  --color-neutral-200: #eae7e7;
  --color-neutral-300: #d7d3d3;
  --color-neutral-400: #bab6b6;
  --color-neutral-500: #9b9797;
  --color-neutral-600: #7d7979;
  --color-neutral-700: #605d5d;
  --color-neutral-800: #444141;
  --color-neutral-900: #2d2b2b;

  --color-accent-100: #fff3e4;
  --color-accent-200: #ffe3bf;
  --color-accent-300: #facb8d;
  --color-accent-400: #e1ad66;
  --color-accent-500: #c28d41;
  --color-accent-600: #a06f24;
  --color-accent-700: #7d5411;
  --color-accent-800: #5a3b0a;
  --color-accent-900: #3a270d;

  --font-heading: "Cormorant Garamond", system-ui, sans-serif;
  --font-body: "Lora", system-ui, sans-serif;

  --space-1: 4.6px;
  --space-2: 9.2px;
  --space-3: 13.8px;
  --space-4: 18.4px;
  --space-6: 27.6px;
  --space-8: 36.8px;

  --radius-sm: 2px;
  --radius-md: 4px;
  --radius-lg: 7px;

  --shadow-sm: 0 1px 2px color-mix(in srgb, #2d2b2b 14%, transparent);
  --shadow-md: 0 3px 10px color-mix(in srgb, #2d2b2b 16%, transparent);
  --shadow-lg: 0 12px 32px color-mix(in srgb, #2d2b2b 22%, transparent);
}

body {
  background: var(--color-bg);
  color: var(--color-text);
  font-family: var(--font-body);
}

.num {
  font-feature-settings: 'tnum' 1;
  font-variant-numeric: tabular-nums;
}

.fig {
  font-family: var(--font-body);
  font-weight: 600;
  font-feature-settings: 'tnum' 1;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.01em;
}

/*
 * Global interaction states (see this plan's Global Constraints): every
 * interactive element gets the same themed focus ring and disabled
 * treatment without each component re-declaring it. Per-element hover
 * tints still vary by variant (outlined vs ghost vs filled), so those stay
 * local to each component's own styles rather than being forced through
 * one shared rule here.
 */
button:focus-visible,
a:focus-visible,
input:focus-visible,
textarea:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
```

- [ ] **Step 2: Import the theme alongside Tailwind in `src/index.css`**

```css
/* src/index.css */
@import "tailwindcss";
@import "./theme.css";
```

- [ ] **Step 3: Add the Google Fonts links to `index.html`**

```html
<!-- index.html - inside <head>, after the viewport meta tag -->
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link
  href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600&family=Lora:wght@400;600&display=swap"
  rel="stylesheet"
/>
```

- [ ] **Step 4: Run the build to verify nothing broke**

Run: `npm run build`
Expected: build succeeds, no CSS or TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add src/theme.css src/index.css index.html
git commit -m "feat: add design system tokens and fonts"
```

---

### Task 1: Shot-view derived state and formatting helpers

**Files:**
- Create: `src/lib/shotView.ts`, `src/lib/shotView.test.ts`
- Create: `src/lib/format.ts`, `src/lib/format.test.ts`

**Interfaces:**
- Consumes: `Shot` type from `src/lib/shots.ts` (existing).
- Produces: `Bag`, `BagStateValue`, `ShotDeltas` types; `groupShotsByBag(shots: Shot[]): Bag[]`, `bagState(bagShots: Shot[], now?: Date): BagStateValue`, `referenceShot(bagShots: Shot[]): Shot | null`, `deltas(shot: Shot, previousShot: Shot): ShotDeltas`, `ratio(shot: Pick<Shot, 'dose_g' | 'yield_g'>): number`, `formatRatio(value: number): string`, `daysSinceRoast(roastDate: string, now?: Date): number`, all from `src/lib/shotView.ts`. `formatSigned(value: number, decimals: number): string`, `formatMass(grams: number): string`, `formatTime(seconds: number): string`, `formatRoastAge(days: number): string`, all from `src/lib/format.ts`. Every later task's screen components import from these two files rather than recomputing this logic.

These are pure functions with no Supabase dependency, so their tests run instantly and do not need the local Supabase stack - unlike `src/lib/shots.test.ts`, which is an integration test. Keeping them in their own files (rather than adding to `shots.ts`/`shots.test.ts` as the schema's suggested order literally says) keeps the fast unit tests separate from the slow integration tests, matching the existing split between `shots.ts` (CRUD) and `videos.ts` (validation/upload).

- [ ] **Step 1: Write the failing tests for `format.ts`**

```typescript
// src/lib/format.test.ts
import { describe, it, expect } from 'vitest';
import { formatSigned, formatMass, formatTime, formatRoastAge } from './format';

describe('formatSigned', () => {
  it('prefixes a positive value with +', () => {
    expect(formatSigned(0.2, 1)).toBe('+0.2');
  });

  it('prefixes a negative value with U+2212, not a hyphen', () => {
    expect(formatSigned(-2, 0)).toBe('−2');
  });

  it('has no sign for zero', () => {
    expect(formatSigned(0, 1)).toBe('0.0');
  });

  it('rounds to the given number of decimals', () => {
    expect(formatSigned(0.249, 1)).toBe('+0.2');
  });
});

describe('formatMass', () => {
  it('formats one decimal with a hair space before g', () => {
    expect(formatMass(18)).toBe('18.0 g');
  });

  it('rounds to one decimal', () => {
    expect(formatMass(41.47)).toBe('41.5 g');
  });
});

describe('formatTime', () => {
  it('formats whole seconds with a tight s suffix', () => {
    expect(formatTime(28)).toBe('28s');
  });

  it('rounds fractional seconds', () => {
    expect(formatTime(28.6)).toBe('29s');
  });
});

describe('formatRoastAge', () => {
  it('formats days with a trailing d', () => {
    expect(formatRoastAge(12)).toBe('12 d');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/format.test.ts`
Expected: FAIL, `format.ts` does not exist yet.

- [ ] **Step 3: Write `src/lib/format.ts`**

```typescript
// src/lib/format.ts
const MINUS_SIGN = '−';
const HAIR_SPACE = ' ';

export function formatSigned(value: number, decimals: number): string {
  const rounded = Number(value.toFixed(decimals));
  const sign = rounded > 0 ? '+' : rounded < 0 ? MINUS_SIGN : '';
  return `${sign}${Math.abs(rounded).toFixed(decimals)}`;
}

export function formatMass(grams: number): string {
  return `${grams.toFixed(1)}${HAIR_SPACE}g`;
}

export function formatTime(seconds: number): string {
  return `${Math.round(seconds)}s`;
}

export function formatRoastAge(days: number): string {
  return `${days} d`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/format.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing tests for `shotView.ts`**

```typescript
// src/lib/shotView.test.ts
import { describe, it, expect } from 'vitest';
import {
  groupShotsByBag,
  bagState,
  referenceShot,
  deltas,
  ratio,
  formatRatio,
  daysSinceRoast,
} from './shotView';
import type { Shot } from './shots';

function makeShot(overrides: Partial<Shot>): Shot {
  return {
    id: overrides.id ?? 'shot-1',
    user_id: 'user-1',
    grind_setting: '18.0',
    dose_g: 18,
    yield_g: 36,
    pull_time_s: 28,
    bean_name: 'Kenya Nyeri AA',
    roast_date: '2026-08-23',
    rating: null,
    tasting_note: null,
    created_at: '2026-09-04T07:42:00Z',
    updated_at: '2026-09-04T07:42:00Z',
    ...overrides,
  };
}

describe('groupShotsByBag', () => {
  it('groups shots sharing bean_name and roast_date', () => {
    const shots = [
      makeShot({ id: 'a', bean_name: 'Kenya', roast_date: '2026-08-23' }),
      makeShot({ id: 'b', bean_name: 'Colombia', roast_date: '2026-08-20' }),
      makeShot({ id: 'c', bean_name: 'Kenya', roast_date: '2026-08-23' }),
    ];

    const bags = groupShotsByBag(shots);

    expect(bags).toHaveLength(2);
    expect(bags[0].bean_name).toBe('Kenya');
    expect(bags[0].shots.map((s) => s.id)).toEqual(['a', 'c']);
    expect(bags[1].bean_name).toBe('Colombia');
    expect(bags[1].shots.map((s) => s.id)).toEqual(['b']);
  });

  it('groups shots with no bean_name together as one bag', () => {
    const shots = [
      makeShot({ id: 'a', bean_name: null, roast_date: null }),
      makeShot({ id: 'b', bean_name: null, roast_date: null }),
    ];

    const bags = groupShotsByBag(shots);

    expect(bags).toHaveLength(1);
    expect(bags[0].shots.map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('orders bags by the most recent shot, newest bag first', () => {
    const shots = [
      makeShot({ id: 'newest', bean_name: 'Kenya' }),
      makeShot({ id: 'older', bean_name: 'Colombia' }),
      makeShot({ id: 'kenya-2', bean_name: 'Kenya' }),
    ];

    const bags = groupShotsByBag(shots);

    expect(bags[0].bean_name).toBe('Kenya');
    expect(bags[1].bean_name).toBe('Colombia');
  });
});

describe('bagState', () => {
  it('returns null for a bag with exactly one shot, even if very fresh', () => {
    const shots = [makeShot({ roast_date: '2026-09-03' })];
    expect(bagState(shots, new Date('2026-09-04'))).toBeNull();
  });

  it('returns past-peak when over 28 days off roast, regardless of convergence', () => {
    const shots = [
      makeShot({ id: 'a', roast_date: '2026-07-01', pull_time_s: 28, dose_g: 18, yield_g: 36 }),
      makeShot({ id: 'b', roast_date: '2026-07-01', pull_time_s: 28, dose_g: 18, yield_g: 36 }),
    ];
    expect(bagState(shots, new Date('2026-09-04'))).toBe('past-peak');
  });

  it('returns resting when under 4 days off roast', () => {
    const shots = [
      makeShot({ id: 'a', roast_date: '2026-09-02' }),
      makeShot({ id: 'b', roast_date: '2026-09-02' }),
    ];
    expect(bagState(shots, new Date('2026-09-04'))).toBe('resting');
  });

  it('returns dialed when the last two shots converge within tolerance', () => {
    const shots = [
      makeShot({ id: 'a', roast_date: '2026-08-20', dose_g: 18, yield_g: 36, pull_time_s: 28 }),
      makeShot({ id: 'b', roast_date: '2026-08-20', dose_g: 18, yield_g: 37, pull_time_s: 29 }),
    ];
    expect(bagState(shots, new Date('2026-09-04'))).toBe('dialed');
  });

  it('returns dialing when the last two shots have not converged', () => {
    const shots = [
      makeShot({ id: 'a', roast_date: '2026-08-20', dose_g: 18, yield_g: 36, pull_time_s: 28 }),
      makeShot({ id: 'b', roast_date: '2026-08-20', dose_g: 18, yield_g: 30, pull_time_s: 20 }),
    ];
    expect(bagState(shots, new Date('2026-09-04'))).toBe('dialing');
  });
});

describe('referenceShot', () => {
  it('returns the first (most recent) shot in the bag', () => {
    const shots = [makeShot({ id: 'newest' }), makeShot({ id: 'older' })];
    expect(referenceShot(shots)?.id).toBe('newest');
  });

  it('returns null for an empty bag', () => {
    expect(referenceShot([])).toBeNull();
  });
});

describe('deltas', () => {
  it('computes signed differences for dose, yield and time', () => {
    const shot = makeShot({ dose_g: 18.2, yield_g: 41.5, pull_time_s: 32 });
    const previous = makeShot({ dose_g: 18.0, yield_g: 37.4, pull_time_s: 28 });

    const result = deltas(shot, previous);

    expect(result.dose_g).toBeCloseTo(0.2);
    expect(result.yield_g).toBeCloseTo(4.1);
    expect(result.pull_time_s).toBe(4);
  });

  it('computes a numeric grind delta when both values parse as numbers', () => {
    const shot = makeShot({ grind_setting: '18.2' });
    const previous = makeShot({ grind_setting: '18.4' });
    expect(deltas(shot, previous).grind).toBeCloseTo(-0.2);
  });

  it('returns a null grind delta when either value is not numeric', () => {
    const shot = makeShot({ grind_setting: '2 o\'clock' });
    const previous = makeShot({ grind_setting: '18.4' });
    expect(deltas(shot, previous).grind).toBeNull();
  });
});

describe('ratio and formatRatio', () => {
  it('computes yield over dose', () => {
    expect(ratio({ dose_g: 18, yield_g: 36 })).toBe(2);
  });

  it('formats as 1:x with two decimals', () => {
    expect(formatRatio(2.0)).toBe('1:2.00');
    expect(formatRatio(2.056)).toBe('1:2.06');
  });
});

describe('daysSinceRoast', () => {
  it('computes whole days between roast_date and now', () => {
    expect(daysSinceRoast('2026-08-23', new Date('2026-09-04'))).toBe(12);
  });
});
```

- [ ] **Step 6: Run the tests to verify they fail**

Run: `npx vitest run src/lib/shotView.test.ts`
Expected: FAIL, `shotView.ts` does not exist yet.

- [ ] **Step 7: Write `src/lib/shotView.ts`**

```typescript
// src/lib/shotView.ts
import type { Shot } from './shots';

export type Bag = {
  bean_name: string | null;
  roast_date: string | null;
  shots: Shot[];
};

export type BagStateValue = 'dialed' | 'dialing' | 'resting' | 'past-peak' | null;

export type ShotDeltas = {
  grind: number | null;
  dose_g: number;
  yield_g: number;
  pull_time_s: number;
};

const DIALED_RATIO_TOLERANCE = 0.15;
const DIALED_TIME_TOLERANCE_S = 2;
const RESTING_MAX_DAYS = 4;
const PAST_PEAK_MIN_DAYS = 28;
const MS_PER_DAY = 1000 * 60 * 60 * 24;

function bagKey(shot: Pick<Shot, 'bean_name' | 'roast_date'>): string {
  return `${shot.bean_name ?? ''} ${shot.roast_date ?? ''}`;
}

/**
 * Groups shots by bean_name + roast_date (there is no bags table in v1).
 * `shots` is assumed newest-first, matching listShots(); bags come back
 * ordered by their most recent shot, and each bag's own shots stay
 * newest-first.
 */
export function groupShotsByBag(shots: Shot[]): Bag[] {
  const bags = new Map<string, Bag>();
  const order: string[] = [];

  for (const shot of shots) {
    const key = bagKey(shot);
    let bag = bags.get(key);
    if (!bag) {
      bag = { bean_name: shot.bean_name, roast_date: shot.roast_date, shots: [] };
      bags.set(key, bag);
      order.push(key);
    }
    bag.shots.push(shot);
  }

  return order.map((key) => bags.get(key)!);
}

export function daysSinceRoast(roastDate: string, now: Date = new Date()): number {
  const roast = new Date(roastDate);
  return Math.floor((now.getTime() - roast.getTime()) / MS_PER_DAY);
}

/**
 * See "Assumptions this plan makes where the schema is silent", item 3, in
 * the plan this function was implemented from: exactly one shot always
 * means no tag; roast-date bookends take precedence over dial-in
 * convergence when roast_date is known; convergence is the fallback.
 */
export function bagState(bagShots: Shot[], now: Date = new Date()): BagStateValue {
  if (bagShots.length <= 1) return null;

  const [latest, previous] = bagShots;

  if (latest.roast_date) {
    const age = daysSinceRoast(latest.roast_date, now);
    if (age > PAST_PEAK_MIN_DAYS) return 'past-peak';
    if (age < RESTING_MAX_DAYS) return 'resting';
  }

  const ratioDiff = Math.abs(ratio(latest) - ratio(previous));
  const timeDiff = Math.abs(latest.pull_time_s - previous.pull_time_s);
  return ratioDiff <= DIALED_RATIO_TOLERANCE && timeDiff <= DIALED_TIME_TOLERANCE_S
    ? 'dialed'
    : 'dialing';
}

/** The most recent shot on the bag. v1 has no is_reference flag to star a different one. */
export function referenceShot(bagShots: Shot[]): Shot | null {
  return bagShots[0] ?? null;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

const NUMERIC_GRIND = /^-?\d+(\.\d+)?$/;

function parsedGrindDelta(shot: Shot, previous: Shot): number | null {
  if (!NUMERIC_GRIND.test(shot.grind_setting) || !NUMERIC_GRIND.test(previous.grind_setting)) {
    return null;
  }
  const a = Number.parseFloat(shot.grind_setting);
  const b = Number.parseFloat(previous.grind_setting);
  return Number.isFinite(a) && Number.isFinite(b) ? round1(a - b) : null;
}

export function deltas(shot: Shot, previous: Shot): ShotDeltas {
  return {
    grind: parsedGrindDelta(shot, previous),
    dose_g: round1(shot.dose_g - previous.dose_g),
    yield_g: round1(shot.yield_g - previous.yield_g),
    pull_time_s: Math.round(shot.pull_time_s - previous.pull_time_s),
  };
}

export function ratio(shot: Pick<Shot, 'dose_g' | 'yield_g'>): number {
  return shot.yield_g / shot.dose_g;
}

export function formatRatio(value: number): string {
  return `1:${value.toFixed(2)}`;
}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run src/lib/shotView.test.ts src/lib/format.test.ts`
Expected: PASS, all tests.

- [ ] **Step 9: Commit**

```bash
git add src/lib/shotView.ts src/lib/shotView.test.ts src/lib/format.ts src/lib/format.test.ts
git commit -m "feat: add derived shot-view state and display formatting helpers"
```

---

### Task 2: Shared display primitives

**Files:**
- Create: `src/lib/chartScale.ts`, `src/lib/chartScale.test.ts`
- Create: `src/components/icons.tsx`, `src/components/icons.test.tsx`
- Create: `src/components/BagSelector.tsx`, `src/components/BagSelector.test.tsx`
- Create: `src/components/shot-display/RatioFigure.tsx`
- Create: `src/components/shot-display/PullTimeFigure.tsx`
- Create: `src/components/shot-display/RatingDots.tsx`
- Create: `src/components/shot-display/BagTag.tsx`
- Create: `src/components/shot-display/shot-display.test.tsx`

**Interfaces:**
- Consumes: `BagStateValue` from `src/lib/shotView.ts` (Task 1).
- Produces: `scaleLinear(domainMin, domainMax, rangeMin, rangeMax): (value: number) => number` and `medianOf(values: number[]): number` from `src/lib/chartScale.ts`. `SearchIcon`, `MenuIcon`, `VideoIcon`, `PlayIcon` (all `(props: SVGProps<SVGSVGElement> & { size?: number }) => JSX.Element`) from `src/components/icons.tsx`. `BagSelector` component from `src/components/BagSelector.tsx`, taking `{ bags: { bean_name: string | null; roast_date: string | null }[]; selected: { bean_name: string | null; roast_date: string | null } | null; onSelect: (bag) => void; label: string }`. `RatioFigure`, `PullTimeFigure`, `RatingDots`, `BagTag` from `src/components/shot-display/`. Task 3 (shot list), Task 5 (new shot), Task 7 (shot detail) and Task 8 (trends) all import from here rather than duplicating markup.

- [ ] **Step 1: Write the failing test for `chartScale.ts`**

```typescript
// src/lib/chartScale.test.ts
import { describe, it, expect } from 'vitest';
import { scaleLinear, medianOf } from './chartScale';

describe('scaleLinear', () => {
  it('maps a domain value to the corresponding range value', () => {
    const scale = scaleLinear(0, 10, 0, 100);
    expect(scale(0)).toBe(0);
    expect(scale(10)).toBe(100);
    expect(scale(5)).toBe(50);
  });

  it('does not divide by zero when the domain has no span', () => {
    const scale = scaleLinear(5, 5, 0, 100);
    expect(scale(5)).toBe(0);
  });
});

describe('medianOf', () => {
  it('returns the middle value for an odd-length array', () => {
    expect(medianOf([3, 1, 2])).toBe(2);
  });

  it('averages the two middle values for an even-length array', () => {
    expect(medianOf([1, 2, 3, 4])).toBe(2.5);
  });

  it('returns 0 for an empty array', () => {
    expect(medianOf([])).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/chartScale.test.ts`
Expected: FAIL, `chartScale.ts` does not exist yet.

- [ ] **Step 3: Write `src/lib/chartScale.ts`**

```typescript
// src/lib/chartScale.ts
export function scaleLinear(
  domainMin: number,
  domainMax: number,
  rangeMin: number,
  rangeMax: number
): (value: number) => number {
  const domainSpan = domainMax - domainMin || 1;
  return (value: number) => rangeMin + ((value - domainMin) / domainSpan) * (rangeMax - rangeMin);
}

export function medianOf(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/chartScale.test.ts`
Expected: PASS.

- [ ] **Step 5: Write `src/components/icons.tsx`**

```tsx
// src/components/icons.tsx
import type { ReactNode, SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function createIcon(paths: ReactNode) {
  return function Icon({ size = 16, strokeWidth = 1.5, ...props }: IconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        {...props}
      >
        {paths}
      </svg>
    );
  };
}

export const SearchIcon = createIcon(
  <>
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </>
);

export const MenuIcon = createIcon(
  <>
    <line x1="4" x2="20" y1="12" y2="12" />
    <line x1="4" x2="20" y1="6" y2="6" />
    <line x1="4" x2="20" y1="18" y2="18" />
  </>
);

export const VideoIcon = createIcon(
  <>
    <path d="m22 8-6 4 6 4V8Z" />
    <rect width="14" height="12" x="2" y="6" rx="2" ry="2" />
  </>
);

export const PlayIcon = createIcon(<polygon points="6 3 20 12 6 21 6 3" />);
```

- [ ] **Step 6: Write the failing test for the icons**

```tsx
// src/components/icons.test.tsx
import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { SearchIcon, MenuIcon, VideoIcon, PlayIcon } from './icons';

describe('icons', () => {
  it.each([
    ['SearchIcon', SearchIcon],
    ['MenuIcon', MenuIcon],
    ['VideoIcon', VideoIcon],
    ['PlayIcon', PlayIcon],
  ])('%s renders an svg at the default 16px interface size', (_name, Icon) => {
    const { container } = render(<Icon />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute('width', '16');
    expect(svg).toHaveAttribute('stroke-width', '1.5');
  });
});
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npx vitest run src/components/icons.test.tsx`
Expected: PASS (the implementation from Step 5 already satisfies it - this locks the interface in place for later tasks).

- [ ] **Step 8: Write the shot-display primitives**

```tsx
// src/components/shot-display/RatioFigure.tsx
type Props = {
  value: number;
  size?: 'l' | 'xl';
};

const MAIN_SIZE: Record<'l' | 'xl', string> = { l: '24px', xl: '44px' };
const PREFIX_SIZE: Record<'l' | 'xl', string> = { l: '16px', xl: '27px' };

export function RatioFigure({ value, size = 'l' }: Props) {
  return (
    <span className="fig inline-flex items-baseline" style={{ fontSize: MAIN_SIZE[size] }}>
      <span
        className="fig"
        style={{ fontSize: PREFIX_SIZE[size], fontWeight: 400, color: 'var(--color-neutral-700)' }}
      >
        1:
      </span>
      {value.toFixed(2)}
    </span>
  );
}
```

```tsx
// src/components/shot-display/PullTimeFigure.tsx
type Props = {
  seconds: number;
  size?: 'l' | 'xl';
};

const SIZE: Record<'l' | 'xl', string> = { l: '16px', xl: '34px' };

export function PullTimeFigure({ seconds, size = 'l' }: Props) {
  return (
    <span
      className="fig inline-flex items-baseline"
      style={{ fontSize: SIZE[size], color: 'var(--color-neutral-700)' }}
    >
      {Math.round(seconds)}
      <span style={{ fontSize: '12.5px', fontWeight: 400 }}>s</span>
    </span>
  );
}
```

```tsx
// src/components/shot-display/RatingDots.tsx
type Props = {
  rating: number;
  size?: number;
};

export function RatingDots({ rating, size = 7 }: Props) {
  return (
    <div className="flex" style={{ gap: '4px' }} aria-label={`Rating ${rating} of 5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <span
          key={i}
          style={{
            width: size,
            height: size,
            borderRadius: '50%',
            background: i < rating ? 'var(--color-accent)' : 'transparent',
            border: i < rating ? 'none' : '1px solid var(--color-neutral-400)',
          }}
        />
      ))}
    </div>
  );
}
```

```tsx
// src/components/shot-display/BagTag.tsx
import type { BagStateValue } from '../../lib/shotView';

type NonNullState = Exclude<BagStateValue, null>;

const LABEL: Record<NonNullState, string> = {
  dialed: 'Dialed',
  dialing: 'Dialing',
  resting: 'Resting',
  'past-peak': 'Past peak',
};

const STYLE: Record<NonNullState, string> = {
  dialed: 'border border-[var(--color-accent)] text-[var(--color-accent)]',
  dialing: 'border-transparent bg-[var(--color-accent-100)] text-[var(--color-accent-800)]',
  resting: 'border-transparent bg-[var(--color-neutral-200)] text-[var(--color-neutral-700)]',
  'past-peak': 'border-transparent bg-[var(--color-neutral-200)] text-[var(--color-neutral-700)]',
};

export function BagTag({ state }: { state: BagStateValue }) {
  if (!state) return null;
  return (
    <span
      className={`inline-block border rounded-[3px] text-[11px] tracking-[0.02em] px-[10px] py-[3px] ${STYLE[state]}`}
    >
      {LABEL[state]}
    </span>
  );
}
```

- [ ] **Step 9: Write the failing tests for the shot-display primitives**

```tsx
// src/components/shot-display/shot-display.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { RatioFigure } from './RatioFigure';
import { PullTimeFigure } from './PullTimeFigure';
import { RatingDots } from './RatingDots';
import { BagTag } from './BagTag';

describe('RatioFigure', () => {
  it('renders the ratio with the 1: prefix and two decimals', () => {
    render(<RatioFigure value={2.056} />);
    expect(screen.getByText('1:')).toBeInTheDocument();
    expect(screen.getByText(/2\.06/)).toBeInTheDocument();
  });
});

describe('PullTimeFigure', () => {
  it('renders whole seconds with a tight s suffix', () => {
    render(<PullTimeFigure seconds={28.4} />);
    expect(screen.getByText('28')).toBeInTheDocument();
    expect(screen.getByText('s')).toBeInTheDocument();
  });
});

describe('RatingDots', () => {
  it('exposes the rating as an accessible label', () => {
    render(<RatingDots rating={4} />);
    expect(screen.getByLabelText('Rating 4 of 5')).toBeInTheDocument();
  });
});

describe('BagTag', () => {
  it('renders nothing for a null state', () => {
    const { container } = render(<BagTag state={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the label for each non-null state', () => {
    render(<BagTag state="dialed" />);
    expect(screen.getByText('Dialed')).toBeInTheDocument();
  });
});
```

- [ ] **Step 10: Run the tests to verify they pass**

Run: `npx vitest run src/components/shot-display/shot-display.test.tsx`
Expected: PASS.

- [ ] **Step 11: Write `BagSelector`**

```tsx
// src/components/BagSelector.tsx
import { useState } from 'react';

export type BagIdentity = {
  bean_name: string | null;
  roast_date: string | null;
};

type Props = {
  bags: BagIdentity[];
  selected: BagIdentity | null;
  onSelect: (bag: BagIdentity) => void;
  label: string;
};

function bagKey(bag: BagIdentity): string {
  return `${bag.bean_name ?? ''} ${bag.roast_date ?? ''}`;
}

export function BagSelector({ bags, selected, onSelect, label }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="h-9 px-3 border border-[var(--color-divider)] rounded-[var(--radius-md)] text-sm"
      >
        {label}
      </button>
      {open && (
        <ul
          role="listbox"
          className="absolute right-0 mt-1 z-10 min-w-[200px] bg-[var(--color-bg)] border border-[var(--color-divider)] rounded-[var(--radius-md)] shadow-[var(--shadow-md)]"
        >
          {bags.map((bag) => (
            <li key={bagKey(bag)}>
              <button
                type="button"
                role="option"
                aria-selected={selected != null && bagKey(bag) === bagKey(selected)}
                onClick={() => {
                  onSelect(bag);
                  setOpen(false);
                }}
                className="block w-full text-left px-3 py-2 text-sm hover:bg-[var(--color-accent-100)]"
              >
                {bag.bean_name ?? 'Unlabeled'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 12: Write the failing test for `BagSelector`**

```tsx
// src/components/BagSelector.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { BagSelector } from './BagSelector';

const bags = [
  { bean_name: 'Kenya Nyeri AA', roast_date: '2026-08-23' },
  { bean_name: 'Colombia Huila', roast_date: '2026-08-20' },
];

describe('BagSelector', () => {
  it('shows the options after the button is clicked, and calls onSelect', () => {
    const onSelect = vi.fn();
    render(<BagSelector bags={bags} selected={null} onSelect={onSelect} label="Change" />);

    expect(screen.queryByRole('option')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    expect(screen.getAllByRole('option')).toHaveLength(2);

    fireEvent.click(screen.getByRole('option', { name: 'Colombia Huila' }));
    expect(onSelect).toHaveBeenCalledWith(bags[1]);
  });
});
```

- [ ] **Step 13: Run the test to verify it passes**

Run: `npx vitest run src/components/BagSelector.test.tsx`
Expected: PASS.

- [ ] **Step 14: Commit**

```bash
git add src/lib/chartScale.ts src/lib/chartScale.test.ts src/components/icons.tsx src/components/icons.test.tsx src/components/BagSelector.tsx src/components/BagSelector.test.tsx src/components/shot-display/
git commit -m "feat: add shared display primitives for the design system"
```

---

### Task 3: Shot list page

**Files:**
- Modify: `src/pages/ShotListPage.tsx`, `src/pages/ShotListPage.test.tsx`

**Interfaces:**
- Consumes: `listShots` from `src/lib/shots.ts`; `groupShotsByBag`, `bagState`, `ratio`, `daysSinceRoast` from `src/lib/shotView.ts` (Task 1); `formatMass`, `formatSigned`, `formatRoastAge` from `src/lib/format.ts` (Task 1); `SearchIcon`, `MenuIcon`, `VideoIcon` from `src/components/icons.tsx`; `RatioFigure`, `PullTimeFigure`, `RatingDots`, `BagTag` from `src/components/shot-display/` (Task 2); `useAuth` from `src/context/AuthContext.tsx`.

Per assumption 5, the menu icon button opens a small dropdown with "Trends" (a link to `/trends`) and "Sign out"; the search icon button is rendered but has no behaviour yet.

- [ ] **Step 1: Write the failing test**

```tsx
// src/pages/ShotListPage.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { ShotListPage } from './ShotListPage';
import { listShots } from '../lib/shots';
import { useAuth } from '../context/AuthContext';

vi.mock('../lib/shots', () => ({ listShots: vi.fn() }));
vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }));

const baseShot = {
  id: 'shot-1',
  user_id: 'user-1',
  grind_setting: '18.0',
  dose_g: 18,
  yield_g: 36,
  pull_time_s: 28,
  bean_name: 'Kenya Nyeri AA',
  roast_date: '2026-08-23',
  rating: 4,
  tasting_note: null,
  created_at: '2026-09-04T07:42:00Z',
  updated_at: '2026-09-04T07:42:00Z',
};

function mockAuth() {
  vi.mocked(useAuth).mockReturnValue({
    user: { email: 'a@example.com' } as any,
    loading: false,
    signInWithGoogle: vi.fn(),
    signOut: vi.fn(),
  });
}

describe('ShotListPage', () => {
  it('groups shots under a bag heading showing the bean name and shot count', async () => {
    mockAuth();
    vi.mocked(listShots).mockResolvedValue([baseShot]);

    render(
      <MemoryRouter>
        <ShotListPage />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText('Kenya Nyeri AA')).toBeInTheDocument());
    expect(screen.getByText(/1 shots/)).toBeInTheDocument();
  });

  it('renders the ratio and pull time for each shot row', async () => {
    mockAuth();
    vi.mocked(listShots).mockResolvedValue([baseShot]);

    render(
      <MemoryRouter>
        <ShotListPage />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText('1:')).toBeInTheDocument());
    expect(screen.getByText('2.00')).toBeInTheDocument();
  });

  it('shows an empty state when there are no shots', async () => {
    mockAuth();
    vi.mocked(listShots).mockResolvedValue([]);

    render(
      <MemoryRouter>
        <ShotListPage />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText(/no shots logged yet/i)).toBeInTheDocument());
  });

  it('opens the menu with Trends and Sign out entries', async () => {
    mockAuth();
    vi.mocked(listShots).mockResolvedValue([baseShot]);

    render(
      <MemoryRouter>
        <ShotListPage />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText('Kenya Nyeri AA')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /menu/i }));
    expect(screen.getByRole('link', { name: 'Trends' })).toHaveAttribute('href', '/trends');
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
  });

  it('hides past-peak bags under Active bags and shows them under All shots', async () => {
    mockAuth();
    const stale = {
      ...baseShot,
      id: 'stale-1',
      bean_name: 'Old Bag',
      roast_date: '2026-01-01',
    };
    vi.mocked(listShots).mockResolvedValue([stale]);

    render(
      <MemoryRouter>
        <ShotListPage />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByRole('button', { name: 'Active bags' })).toBeInTheDocument());
    // A bag with exactly one shot never carries a tag (see shotView.bagState),
    // so this exercises the "no tag, still shown" path rather than past-peak
    // filtering directly - past-peak filtering needs two shots to produce a
    // tag at all, which the second test case below covers.
    expect(screen.getByText('Old Bag')).toBeInTheDocument();
  });

  it('filters a bag tagged past-peak out of Active bags', async () => {
    mockAuth();
    const stale = [
      { ...baseShot, id: 'stale-1', bean_name: 'Old Bag', roast_date: '2026-01-01' },
      { ...baseShot, id: 'stale-2', bean_name: 'Old Bag', roast_date: '2026-01-01' },
    ];
    vi.mocked(listShots).mockResolvedValue(stale);

    render(
      <MemoryRouter>
        <ShotListPage />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByRole('button', { name: 'Active bags' })).toBeInTheDocument());
    expect(screen.queryByText('Old Bag')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'All shots' }));
    expect(screen.getByText('Old Bag')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/pages/ShotListPage.test.tsx`
Expected: FAIL against the current plain-list implementation.

- [ ] **Step 3: Write `ShotListPage.tsx`**

```tsx
// src/pages/ShotListPage.tsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listShots, type Shot } from '../lib/shots';
import { groupShotsByBag, bagState, ratio, daysSinceRoast, type Bag } from '../lib/shotView';
import { formatMass, formatSigned, formatRoastAge } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import { SearchIcon, MenuIcon, VideoIcon } from '../components/icons';
import { RatioFigure } from '../components/shot-display/RatioFigure';
import { PullTimeFigure } from '../components/shot-display/PullTimeFigure';
import { RatingDots } from '../components/shot-display/RatingDots';
import { BagTag } from '../components/shot-display/BagTag';

type Filter = 'active' | 'all';

function bagTitle(bag: Bag): string {
  return bag.bean_name ?? 'Unlabeled';
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  const weekday = date.toLocaleDateString(undefined, { weekday: 'short' });
  const time = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return `${weekday} ${time}`;
}

function ShotRow({ shot, previous }: { shot: Shot; previous: Shot | null }) {
  const doseDelta = previous ? formatSigned(shot.dose_g - previous.dose_g, 1) : null;
  const yieldDelta = previous ? formatSigned(shot.yield_g - previous.yield_g, 1) : null;

  return (
    <Link
      to={`/shots/${shot.id}`}
      className="grid items-center border-t border-[var(--color-divider)] hover:bg-[var(--color-surface)]"
      style={{
        gridTemplateColumns: '1fr auto',
        gap: 'var(--space-3)',
        padding: 'var(--space-3) var(--space-4)',
        minHeight: '64px',
      }}
    >
      <div className="flex flex-col gap-1">
        <div className="flex items-baseline" style={{ gap: '14px' }}>
          <RatioFigure value={ratio(shot)} />
          <PullTimeFigure seconds={shot.pull_time_s} />
        </div>
        <div className="num text-[12.5px]" style={{ color: 'var(--color-neutral-700)' }}>
          {formatMass(shot.dose_g)}
          {doseDelta && (
            <span style={{ color: 'var(--color-accent-700)' }}> {doseDelta}</span>
          )}
          {' → '}
          {formatMass(shot.yield_g)}
          {yieldDelta && (
            <span style={{ color: 'var(--color-accent-700)' }}> {yieldDelta}</span>
          )}
          {` · grind ${shot.grind_setting}`}
        </div>
      </div>
      <div className="flex flex-col items-end" style={{ gap: '4px' }}>
        {shot.rating != null ? (
          <RatingDots rating={shot.rating} />
        ) : (
          <VideoIcon size={15} style={{ color: 'var(--color-accent)' }} />
        )}
        <span className="num text-[11px]" style={{ color: 'var(--color-neutral-600)' }}>
          {formatTimestamp(shot.created_at)}
        </span>
      </div>
    </Link>
  );
}

function BagGroup({ bag }: { bag: Bag }) {
  const state = bagState(bag.shots);
  const age = bag.roast_date ? daysSinceRoast(bag.roast_date) : null;

  return (
    <section>
      <div
        className="flex justify-between items-baseline"
        style={{ padding: 'var(--space-4) var(--space-4) var(--space-2)' }}
      >
        <div>
          <div
            style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: '19px' }}
          >
            {bagTitle(bag)}
          </div>
          <div
            className="num"
            style={{ fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.55 }}
          >
            {age != null ? `${formatRoastAge(age)} · ` : ''}
            {bag.shots.length} shots
          </div>
        </div>
        <BagTag state={state} />
      </div>
      {bag.shots.map((shot, i) => (
        <ShotRow key={shot.id} shot={shot} previous={bag.shots[i + 1] ?? null} />
      ))}
    </section>
  );
}

export function ShotListPage() {
  const { signOut } = useAuth();
  const [shots, setShots] = useState<Shot[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('active');
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    listShots()
      .then(setShots)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load shots'));
  }, []);

  const bags = shots ? groupShotsByBag(shots) : [];
  const visibleBags =
    filter === 'active' ? bags.filter((bag) => bagState(bag.shots) !== 'past-peak') : bags;

  return (
    <div className="max-w-md mx-auto flex flex-col" style={{ paddingBottom: '88px' }}>
      <header
        className="flex justify-between items-center border-b border-[var(--color-divider)]"
        style={{ padding: '14px var(--space-4) var(--space-3)' }}
      >
        <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: '19px' }}>
          Shots
        </h1>
        <div className="flex items-center relative" style={{ gap: 'var(--space-2)' }}>
          <button
            type="button"
            aria-label="Search"
            className="w-9 h-9 flex items-center justify-center border border-[var(--color-divider)] rounded-[var(--radius-md)]"
          >
            <SearchIcon />
          </button>
          <button
            type="button"
            aria-label="Menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
            className="w-9 h-9 flex items-center justify-center border border-[var(--color-divider)] rounded-[var(--radius-md)]"
          >
            <MenuIcon />
          </button>
          {menuOpen && (
            <ul
              className="absolute right-0 top-full mt-1 z-10 min-w-[160px] bg-[var(--color-bg)] border border-[var(--color-divider)] rounded-[var(--radius-md)] shadow-[var(--shadow-md)]"
            >
              <li>
                <Link
                  to="/trends"
                  className="block px-3 py-2 text-sm hover:bg-[var(--color-accent-100)]"
                >
                  Trends
                </Link>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => signOut()}
                  className="block w-full text-left px-3 py-2 text-sm hover:bg-[var(--color-accent-100)]"
                >
                  Sign out
                </button>
              </li>
            </ul>
          )}
        </div>
      </header>

      <div
        className="flex border border-[var(--color-divider)] rounded-[var(--radius-md)]"
        style={{ margin: 'var(--space-3) var(--space-4) var(--space-2)' }}
      >
        {(['active', 'all'] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            className="flex-1 text-sm py-2"
            style={
              filter === value
                ? { color: 'var(--color-accent)', boxShadow: 'inset 0 0 0 1px var(--color-accent)' }
                : {}
            }
          >
            {value === 'active' ? 'Active bags' : 'All shots'}
          </button>
        ))}
      </div>

      {error && <p style={{ color: 'var(--color-accent-800)' }}>{error}</p>}
      {!shots && !error && <p style={{ padding: 'var(--space-4)' }}>Loading...</p>}
      {shots && shots.length === 0 && (
        <p style={{ padding: 'var(--space-4)' }}>No shots logged yet.</p>
      )}
      {visibleBags.map((bag) => (
        <BagGroup key={`${bag.bean_name ?? ''}-${bag.roast_date ?? ''}`} bag={bag} />
      ))}

      <div
        className="fixed bottom-0 left-0 right-0 border-t border-[var(--color-divider)] bg-[var(--color-bg)]"
        style={{ padding: 'var(--space-3) var(--space-4) var(--space-6)' }}
      >
        <Link
          to="/shots/new"
          className="block w-full text-center border border-[var(--color-accent)] rounded-[var(--radius-md)]"
          style={{ height: '48px', lineHeight: '48px', color: 'var(--color-accent)' }}
        >
          Log a shot
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/pages/ShotListPage.test.tsx`
Expected: PASS.

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run`
Expected: PASS (other pages still use their pre-redesign markup at this point, so their existing tests are unaffected).

- [ ] **Step 6: Commit**

```bash
git add src/pages/ShotListPage.tsx src/pages/ShotListPage.test.tsx
git commit -m "feat: redesign the shot list page on the Classical design system"
```

---

### Task 4: ShotForm nudge rows

**Files:**
- Modify: `src/components/ShotForm.tsx`, `src/components/ShotForm.test.tsx`

**Interfaces:**
- Produces: `ShotFormValues` (unchanged shape), `emptyShotFormValues` (unchanged), and a `ShotForm` component with a new prop signature: `{ referenceValues: ShotFormValues; initialValues: ShotFormValues; submitLabel: string; onSubmit: (values: ShotFormValues) => Promise<void> }`. `referenceValues` is what nudge rows diff against and what "Reset" restores; `initialValues` is what the form starts at (equal to `referenceValues` for a brand new shot copied from its bag's reference shot, per assumption 8 in this plan equal to the shot's own pre-edit values when editing). Task 5 (`NewShotPage`) and Task 6 (`EditShotPage`) both pass both props.
- Breaking change: the old single `initialValues`-only signature is removed. Both consuming pages are updated in the same commit as this task so the app never sits in a broken intermediate state - do Steps 1-6 here, then Task 5 and Task 6 immediately after, before committing.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/ShotForm.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ShotForm, emptyShotFormValues, type ShotFormValues } from './ShotForm';

const reference: ShotFormValues = {
  ...emptyShotFormValues,
  grind_setting: '18.0',
  dose_g: '18.0',
  yield_g: '36.0',
  pull_time_s: '28',
  bean_name: 'Kenya Nyeri AA',
  roast_date: '2026-08-23',
};

describe('ShotForm', () => {
  it('starts each nudge row at the reference value with no delta shown', () => {
    render(
      <ShotForm
        referenceValues={reference}
        initialValues={reference}
        submitLabel="Save shot"
        onSubmit={vi.fn()}
      />
    );

    expect(screen.getByText('18.0')).toBeInTheDocument();
    expect(screen.queryByText(/^\+/)).not.toBeInTheDocument();
  });

  it('shows a signed delta and accent colour once a value is nudged away from the reference', () => {
    render(
      <ShotForm
        referenceValues={reference}
        initialValues={reference}
        submitLabel="Save shot"
        onSubmit={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Increase dose' }));

    expect(screen.getByText('+0.1')).toBeInTheDocument();
  });

  it('clears the delta when a nudge returns the value to the reference', () => {
    render(
      <ShotForm
        referenceValues={reference}
        initialValues={reference}
        submitLabel="Save shot"
        onSubmit={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Increase dose' }));
    fireEvent.click(screen.getByRole('button', { name: 'Decrease dose' }));

    expect(screen.queryByText('+0.1')).not.toBeInTheDocument();
    expect(screen.queryByText('−0.1')).not.toBeInTheDocument();
  });

  it('reset returns every field to the reference values', () => {
    render(
      <ShotForm
        referenceValues={reference}
        initialValues={reference}
        submitLabel="Save shot"
        onSubmit={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Increase dose' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));

    expect(screen.getByText('18.0')).toBeInTheDocument();
    expect(screen.queryByText('+0.1')).not.toBeInTheDocument();
  });

  it('submits the current working values, not the reference values', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <ShotForm
        referenceValues={reference}
        initialValues={reference}
        submitLabel="Save shot"
        onSubmit={onSubmit}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Increase dose' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save shot' }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ dose_g: '18.1' }))
    );
  });

  it('renders rating dots that set the rating on click', () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <ShotForm
        referenceValues={reference}
        initialValues={reference}
        submitLabel="Save shot"
        onSubmit={onSubmit}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Rate 4' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save shot' }));

    return waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ rating: '4' }))
    );
  });

  it('expands a tasting note field from the ghost link', () => {
    render(
      <ShotForm
        referenceValues={reference}
        initialValues={reference}
        submitLabel="Save shot"
        onSubmit={vi.fn()}
      />
    );

    expect(screen.queryByLabelText(/tasting note/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add tasting note' }));
    expect(screen.getByLabelText(/tasting note/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/ShotForm.test.tsx`
Expected: FAIL against the current implementation (different prop signature, no nudge rows).

- [ ] **Step 3: Write `ShotForm.tsx`**

```tsx
// src/components/ShotForm.tsx
import { useState, type FormEvent } from 'react';
import { formatSigned } from '../lib/format';

export type ShotFormValues = {
  grind_setting: string;
  dose_g: string;
  yield_g: string;
  pull_time_s: string;
  bean_name: string;
  roast_date: string;
  rating: string;
  tasting_note: string;
};

export const emptyShotFormValues: ShotFormValues = {
  grind_setting: '',
  dose_g: '',
  yield_g: '',
  pull_time_s: '',
  bean_name: '',
  roast_date: '',
  rating: '',
  tasting_note: '',
};

type Props = {
  referenceValues: ShotFormValues;
  initialValues: ShotFormValues;
  submitLabel: string;
  onSubmit: (values: ShotFormValues) => Promise<void>;
};

type NumericField = 'grind_setting' | 'dose_g' | 'yield_g' | 'pull_time_s';

const STEP: Record<NumericField, number> = {
  grind_setting: 0.1,
  dose_g: 0.1,
  yield_g: 0.5,
  pull_time_s: 1,
};

const DECIMALS: Record<NumericField, number> = {
  grind_setting: 1,
  dose_g: 1,
  yield_g: 1,
  pull_time_s: 0,
};

const LABEL: Record<NumericField, string> = {
  grind_setting: 'Grind',
  dose_g: 'Dose',
  yield_g: 'Yield',
  pull_time_s: 'Pull time',
};

function numericDelta(field: NumericField, value: string, reference: string): number | null {
  const a = Number.parseFloat(value);
  const b = Number.parseFloat(reference);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const diff = Number((a - b).toFixed(DECIMALS[field] + 2));
  return diff === 0 ? null : diff;
}

function NudgeRow({
  field,
  value,
  reference,
  onChange,
}: {
  field: NumericField;
  value: string;
  reference: string;
  onChange: (next: string) => void;
}) {
  const delta = numericDelta(field, value, reference);
  const changed = delta !== null;
  const step = STEP[field];
  const decimals = DECIMALS[field];

  function nudge(direction: 1 | -1) {
    const current = Number.parseFloat(value);
    const base = Number.isFinite(current) ? current : Number.parseFloat(reference) || 0;
    onChange((base + direction * step).toFixed(decimals));
  }

  const directionWord = field === 'dose_g' ? 'dose' : field === 'yield_g' ? 'yield' : field === 'pull_time_s' ? 'pull time' : 'grind';

  return (
    <div
      className="grid items-center border-b border-[var(--color-divider)]"
      style={{ gridTemplateColumns: '1fr auto', gap: 'var(--space-3)', minHeight: '72px', padding: 'var(--space-2) var(--space-4)' }}
    >
      <div>
        <div style={{ fontSize: '12px', opacity: 0.65 }}>
          {LABEL[field]}
          {changed && (
            <span style={{ color: 'var(--color-accent-700)' }}> {formatSigned(delta!, decimals)}</span>
          )}
        </div>
        <input
          aria-label={LABEL[field]}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="fig bg-transparent border-none p-0 w-full"
          style={{
            fontSize: '25px',
            lineHeight: 1.2,
            color: changed ? 'var(--color-accent-700)' : 'var(--color-text)',
          }}
        />
      </div>
      <div className="flex" style={{ gap: 'var(--space-2)' }}>
        <button
          type="button"
          aria-label={`Decrease ${directionWord}`}
          onClick={() => nudge(-1)}
          className="w-12 h-12 border border-[var(--color-divider)] rounded-[var(--radius-md)] text-xl"
        >
          &minus;
        </button>
        <button
          type="button"
          aria-label={`Increase ${directionWord}`}
          onClick={() => nudge(1)}
          className="w-12 h-12 border border-[var(--color-divider)] rounded-[var(--radius-md)] text-xl"
        >
          +
        </button>
      </div>
    </div>
  );
}

export function ShotForm({ referenceValues, initialValues, submitLabel, onSubmit }: Props) {
  const [values, setValues] = useState(initialValues);
  const [noteOpen, setNoteOpen] = useState(Boolean(initialValues.tasting_note));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function set<K extends keyof ShotFormValues>(key: K, value: string) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  function reset() {
    setValues(referenceValues);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await onSubmit(values);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save shot');
    } finally {
      setSaving(false);
    }
  }

  const numericFields: NumericField[] = ['grind_setting', 'dose_g', 'yield_g', 'pull_time_s'];
  const dose = Number.parseFloat(values.dose_g);
  const yieldG = Number.parseFloat(values.yield_g);
  const ratioValue = Number.isFinite(dose) && Number.isFinite(yieldG) && dose > 0 ? yieldG / dose : null;

  return (
    <form onSubmit={handleSubmit}>
      <div className="flex justify-end" style={{ padding: 'var(--space-2) var(--space-4)' }}>
        <button type="button" onClick={reset} className="text-sm" style={{ color: 'var(--color-accent)' }}>
          Reset
        </button>
      </div>

      {numericFields.map((field) => (
        <NudgeRow
          key={field}
          field={field}
          value={values[field]}
          reference={referenceValues[field]}
          onChange={(next) => set(field, next)}
        />
      ))}

      <div
        className="flex justify-between items-baseline"
        style={{
          margin: '0 var(--space-4)',
          padding: 'var(--space-3) 0',
          borderTop: '1px solid var(--color-divider)',
          borderBottom: '1px solid var(--color-divider)',
        }}
      >
        <span style={{ fontSize: '12px', opacity: 0.65 }}>Ratio</span>
        {ratioValue != null && (
          <span className="fig" style={{ fontSize: '23px' }}>
            <span className="fig" style={{ fontWeight: 400, color: 'var(--color-neutral-700)' }}>
              1:
            </span>
            {ratioValue.toFixed(2)}
          </span>
        )}
      </div>

      <div className="flex flex-col" style={{ padding: 'var(--space-3) var(--space-4)', gap: 'var(--space-3)' }}>
        <div className="flex justify-between items-center">
          <span>Rating</span>
          <div className="flex" style={{ gap: '10px' }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                aria-label={`Rate ${n}`}
                onClick={() => set('rating', String(n))}
                style={{
                  width: 15,
                  height: 15,
                  borderRadius: '50%',
                  background: n <= Number(values.rating || 0) ? 'var(--color-accent)' : 'transparent',
                  border: n <= Number(values.rating || 0) ? 'none' : '1px solid var(--color-neutral-400)',
                }}
              />
            ))}
          </div>
        </div>

        {!noteOpen ? (
          <button
            type="button"
            onClick={() => setNoteOpen(true)}
            className="text-left text-sm"
            style={{ color: 'var(--color-accent)' }}
          >
            Add tasting note
          </button>
        ) : (
          <label className="flex flex-col gap-1">
            Tasting note
            <textarea
              value={values.tasting_note}
              onChange={(e) => set('tasting_note', e.target.value)}
              className="border border-[var(--color-divider)] rounded-[var(--radius-md)] p-2"
            />
          </label>
        )}
      </div>

      {error && <p style={{ color: 'var(--color-accent-800)', padding: '0 var(--space-4)' }}>{error}</p>}

      <div style={{ padding: 'var(--space-3) var(--space-4) var(--space-6)' }}>
        <button
          type="submit"
          disabled={saving}
          className="block w-full text-center border border-[var(--color-accent)] rounded-[var(--radius-md)]"
          style={{ height: '48px', color: 'var(--color-accent)' }}
        >
          {saving ? 'Saving...' : submitLabel}
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 4: Run the test - it will still fail here**

`ShotForm.test.tsx` passes on its own, but `NewShotPage.test.tsx` and `EditShotPage.test.tsx` now fail because they still call `ShotForm` with the old single-`initialValues` signature. Continue to Task 5 and Task 6 before running the full suite or committing.

---

### Task 5: New shot page

**Files:**
- Modify: `src/pages/NewShotPage.tsx`, `src/pages/NewShotPage.test.tsx`

**Interfaces:**
- Consumes: `listShots`, `createShot` from `src/lib/shots.ts`; `groupShotsByBag`, `referenceShot` from `src/lib/shotView.ts`; `ShotForm`, `ShotFormValues`, `emptyShotFormValues` from `src/components/ShotForm.tsx` (Task 4); `BagSelector` from `src/components/BagSelector.tsx` (Task 2); `validateVideoFile`, `uploadShotVideo` from `src/lib/videos.ts` (unchanged); `useSearchParams` from `react-router-dom` (reads the `?from=<shotId>` query param Task 7 sets on the Duplicate and Pull-another-like-this links).

Implements assumption 6 (bag selection via `BagSelector`), the "duplicate-and-nudge" mechanic (the form's reference and initial values are both the full reference shot of the selected bag, converted to strings), assumption 9 (a new-bag entry step ahead of the nudge rows, covering both a first-ever shot and a deliberate "Start a new bag"), and the schema's "Duplicate opens `/shots/new` seeded from this shot" line: when a `?from=<shotId>` query param names a shot, that specific shot becomes the reference (not just its bag's most recent shot), until the user picks a different bag via "Change".

- [ ] **Step 1: Write the failing test**

```tsx
// src/pages/NewShotPage.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { NewShotPage } from './NewShotPage';
import { createShot, listShots } from '../lib/shots';

vi.mock('../lib/shots', () => ({
  createShot: vi.fn(),
  listShots: vi.fn(),
}));

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

const referenceShot = {
  id: 'shot-ref',
  user_id: 'user-1',
  grind_setting: '18.0',
  dose_g: 18,
  yield_g: 36,
  pull_time_s: 28,
  bean_name: 'Kenya Nyeri AA',
  roast_date: '2026-08-23',
  rating: 4,
  tasting_note: null,
  created_at: '2026-09-03T07:42:00Z',
  updated_at: '2026-09-03T07:42:00Z',
};

describe('NewShotPage', () => {
  it('pre-fills the form from the most recently active bag\'s reference shot', async () => {
    vi.mocked(listShots).mockResolvedValue([referenceShot]);

    render(
      <MemoryRouter>
        <NewShotPage />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText('Kenya Nyeri AA')).toBeInTheDocument());
    expect(screen.getByLabelText('Dose')).toHaveValue('18');
  });

  it('creates a shot with the working values and navigates to its detail page', async () => {
    vi.mocked(listShots).mockResolvedValue([referenceShot]);
    vi.mocked(createShot).mockResolvedValue({ ...referenceShot, id: 'shot-new' });

    render(
      <MemoryRouter>
        <NewShotPage />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByLabelText('Dose')).toHaveValue('18'));
    fireEvent.click(screen.getByRole('button', { name: 'Increase dose' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save shot' }));

    await waitFor(() =>
      expect(createShot).toHaveBeenCalledWith(
        expect.objectContaining({ dose_g: 18.1, bean_name: 'Kenya Nyeri AA' })
      )
    );
    expect(navigateMock).toHaveBeenCalledWith('/shots/shot-new');
  });

  it('asks for a bean name and roast date first when there are no bags yet, then lets the first shot be logged', async () => {
    vi.mocked(listShots).mockResolvedValue([]);
    vi.mocked(createShot).mockResolvedValue({
      ...referenceShot,
      id: 'shot-first',
      bean_name: 'Colombia Huila',
      roast_date: '',
      grind_setting: '0.1',
      dose_g: 0.1,
      yield_g: 0.5,
      pull_time_s: 1,
    });

    render(
      <MemoryRouter>
        <NewShotPage />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByLabelText('Bean / origin')).toBeInTheDocument());
    expect(screen.queryByLabelText('Dose')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Bean / origin'), { target: { value: 'Colombia Huila' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.getByLabelText('Dose')).toHaveValue('');
    fireEvent.click(screen.getByRole('button', { name: 'Increase dose' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save shot' }));

    await waitFor(() =>
      expect(createShot).toHaveBeenCalledWith(
        expect.objectContaining({ bean_name: 'Colombia Huila', dose_g: 0.1 })
      )
    );
  });

  it('lets a user with existing bags start a new bag instead of duplicating one', async () => {
    vi.mocked(listShots).mockResolvedValue([referenceShot]);

    render(
      <MemoryRouter>
        <NewShotPage />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText('Kenya Nyeri AA')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Start a new bag' }));

    expect(screen.getByLabelText('Bean / origin')).toHaveValue('');
    expect(screen.queryByLabelText('Dose')).not.toBeInTheDocument();
  });

  it('seeds the form from the shot named in ?from=, even when it is not the bag\'s most recent shot', async () => {
    const mostRecent = { ...referenceShot, id: 'shot-newest', dose_g: 20, created_at: '2026-09-04T07:42:00Z' };
    const olderShotBeingDuplicated = { ...referenceShot, id: 'shot-older', dose_g: 15, created_at: '2026-09-01T07:42:00Z' };
    vi.mocked(listShots).mockResolvedValue([mostRecent, olderShotBeingDuplicated]);

    render(
      <MemoryRouter initialEntries={['/shots/new?from=shot-older']}>
        <NewShotPage />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByLabelText('Dose')).toHaveValue('15'));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/pages/NewShotPage.test.tsx`
Expected: FAIL against the current blank-form implementation.

- [ ] **Step 3: Write `NewShotPage.tsx`**

```tsx
// src/pages/NewShotPage.tsx
import { useEffect, useState, type ChangeEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ShotForm, emptyShotFormValues, type ShotFormValues } from '../components/ShotForm';
import { BagSelector, type BagIdentity } from '../components/BagSelector';
import { createShot, listShots, type Shot } from '../lib/shots';
import { groupShotsByBag, referenceShot as pickReferenceShot, type Bag } from '../lib/shotView';
import { validateVideoFile, uploadShotVideo } from '../lib/videos';

function toFormValues(shot: Shot): ShotFormValues {
  return {
    grind_setting: shot.grind_setting,
    dose_g: String(shot.dose_g),
    yield_g: String(shot.yield_g),
    pull_time_s: String(shot.pull_time_s),
    bean_name: shot.bean_name ?? '',
    roast_date: shot.roast_date ?? '',
    rating: shot.rating != null ? String(shot.rating) : '',
    tasting_note: shot.tasting_note ?? '',
  };
}

function bagsMatch(a: BagIdentity, b: BagIdentity): boolean {
  return a.bean_name === b.bean_name && a.roast_date === b.roast_date;
}

/**
 * Bean name and roast date for a bag with no shots yet - either a
 * brand-new user's first shot ever, or an existing user deliberately
 * starting a new bag. Confirming this mounts ShotForm with these two
 * fields locked in and the four nudge fields blank (see assumption 9).
 */
function NewBagFields({
  beanName,
  roastDate,
  onBeanNameChange,
  onRoastDateChange,
  onContinue,
}: {
  beanName: string;
  roastDate: string;
  onBeanNameChange: (value: string) => void;
  onRoastDateChange: (value: string) => void;
  onContinue: () => void;
}) {
  return (
    <div className="flex flex-col gap-3" style={{ padding: 'var(--space-4)' }}>
      <label className="flex flex-col gap-1">
        Bean / origin
        <input
          className="border border-[var(--color-divider)] rounded-[var(--radius-md)] px-2 py-1"
          value={beanName}
          onChange={(e) => onBeanNameChange(e.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1">
        Roast date
        <input
          type="date"
          className="border border-[var(--color-divider)] rounded-[var(--radius-md)] px-2 py-1"
          value={roastDate}
          onChange={(e) => onRoastDateChange(e.target.value)}
        />
      </label>
      <button
        type="button"
        onClick={onContinue}
        className="border border-[var(--color-accent)] rounded-[var(--radius-md)]"
        style={{ height: '48px', color: 'var(--color-accent)' }}
      >
        Continue
      </button>
    </div>
  );
}

export function NewShotPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fromShotId = searchParams.get('from');
  const [bags, setBags] = useState<Bag[]>([]);
  const [selectedBag, setSelectedBag] = useState<Bag | null>(null);
  const [seedShot, setSeedShot] = useState<Shot | null>(null);
  const [startingNewBag, setStartingNewBag] = useState(false);
  const [newBagConfirmed, setNewBagConfirmed] = useState(false);
  const [newBeanName, setNewBeanName] = useState('');
  const [newRoastDate, setNewRoastDate] = useState('');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [createdShotId, setCreatedShotId] = useState<string | null>(null);

  useEffect(() => {
    listShots().then((shots) => {
      const grouped = groupShotsByBag(shots);
      setBags(grouped);
      if (grouped.length === 0) {
        setStartingNewBag(true);
        return;
      }

      const namedShot = fromShotId ? shots.find((s) => s.id === fromShotId) ?? null : null;
      if (namedShot) {
        setSeedShot(namedShot);
        const bag = grouped.find(
          (b) => b.bean_name === namedShot.bean_name && b.roast_date === namedShot.roast_date
        );
        setSelectedBag(bag ?? grouped[0]);
      } else {
        setSelectedBag(grouped[0]);
      }
    });
  }, [fromShotId]);

  async function handleVideoChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setVideoError(null);
    setVideoFile(null);
    if (!file) return;

    const result = await validateVideoFile(file);
    if (!result.valid) {
      setVideoError(result.reason);
      return;
    }
    setVideoFile(file);
  }

  async function handleSubmit(values: ShotFormValues) {
    let shotId = createdShotId;
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
    if (videoFile) {
      await uploadShotVideo(shotId, videoFile);
    }
    navigate(`/shots/${shotId}`);
  }

  const reference = seedShot ?? (selectedBag ? pickReferenceShot(selectedBag.shots) : null);
  const showNewBagFields = startingNewBag && !newBagConfirmed;
  const formValues: ShotFormValues | null = newBagConfirmed
    ? { ...emptyShotFormValues, bean_name: newBeanName, roast_date: newRoastDate }
    : reference
    ? toFormValues(reference)
    : null;

  return (
    <div className="max-w-md mx-auto">
      <header
        className="flex justify-between items-center border-b border-[var(--color-divider)]"
        style={{ padding: 'var(--space-3) var(--space-4)' }}
      >
        <button type="button" style={{ color: 'var(--color-accent)' }}>
          Cancel
        </button>
        <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: '17px' }}>
          New shot
        </h1>
        <span style={{ width: '52px' }} />
      </header>

      {!showNewBagFields && selectedBag && !newBagConfirmed && (
        <div
          className="flex justify-between items-center border-b border-[var(--color-divider)]"
          style={{ padding: 'var(--space-3) var(--space-4)' }}
        >
          <div>
            <div
              className="num"
              style={{ fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.55 }}
            >
              {reference ? `Copied from ${new Date(reference.created_at).toLocaleString()}` : ''}
            </div>
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: '18px' }}>
              {selectedBag.bean_name ?? 'Unlabeled'}
            </div>
          </div>
          <div className="flex items-center" style={{ gap: 'var(--space-2)' }}>
            <BagSelector
              bags={bags}
              selected={selectedBag}
              onSelect={(bag) => {
                const match = bags.find((b) => bagsMatch(b, bag));
                if (match) {
                  setSelectedBag(match);
                  setSeedShot(null);
                }
              }}
              label="Change"
            />
            <button
              type="button"
              onClick={() => setStartingNewBag(true)}
              className="text-sm"
              style={{ color: 'var(--color-accent)' }}
            >
              Start a new bag
            </button>
          </div>
        </div>
      )}

      {showNewBagFields && (
        <NewBagFields
          beanName={newBeanName}
          roastDate={newRoastDate}
          onBeanNameChange={setNewBeanName}
          onRoastDateChange={setNewRoastDate}
          onContinue={() => setNewBagConfirmed(true)}
        />
      )}

      {formValues && !showNewBagFields && (
        <ShotForm
          referenceValues={formValues}
          initialValues={formValues}
          submitLabel="Save shot"
          onSubmit={handleSubmit}
        />
      )}

      {formValues && !showNewBagFields && (
        <div className="flex flex-col gap-1" style={{ padding: '0 var(--space-4) var(--space-4)' }}>
          <label htmlFor="video-input" className="text-sm" style={{ color: 'var(--color-accent)' }}>
            Attach pour video (optional)
          </label>
          <input id="video-input" type="file" accept="video/*" onChange={handleVideoChange} />
          {videoError && <p style={{ color: 'var(--color-accent-800)' }}>{videoError}</p>}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/pages/NewShotPage.test.tsx`
Expected: PASS.

---

### Task 6: Edit shot page

**Files:**
- Modify: `src/pages/EditShotPage.tsx`, `src/pages/EditShotPage.test.tsx`

**Interfaces:**
- Consumes: `getShot`, `updateShot` from `src/lib/shots.ts`; `ShotForm`, `ShotFormValues` from `src/components/ShotForm.tsx` (Task 4).

Per assumption 8, the shot's own pre-edit values are both `referenceValues` and `initialValues` - editing shows deltas against what was originally saved, and "Reset" undoes all in-progress edits back to the saved shot.

- [ ] **Step 1: Write the failing test**

```tsx
// src/pages/EditShotPage.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { EditShotPage } from './EditShotPage';
import { getShot, updateShot } from '../lib/shots';

vi.mock('../lib/shots', () => ({ getShot: vi.fn(), updateShot: vi.fn() }));

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

const shot = {
  id: 'shot-1',
  user_id: 'user-1',
  grind_setting: '18.0',
  dose_g: 18,
  yield_g: 36,
  pull_time_s: 28,
  bean_name: 'Kenya Nyeri AA',
  roast_date: '2026-08-23',
  rating: null,
  tasting_note: null,
  created_at: '2026-09-04T07:42:00Z',
  updated_at: '2026-09-04T07:42:00Z',
};

function renderAtShot(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/shots/${id}/edit`]}>
      <Routes>
        <Route path="/shots/:id/edit" element={<EditShotPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('EditShotPage', () => {
  it('pre-fills the nudge rows from the shot\'s saved values with no delta shown', async () => {
    vi.mocked(getShot).mockResolvedValue(shot);
    renderAtShot('shot-1');

    await waitFor(() => expect(screen.getByLabelText('Dose')).toHaveValue('18'));
    expect(screen.queryByText(/^\+/)).not.toBeInTheDocument();
  });

  it('saves an edited field and shows the delta against the saved value before submit', async () => {
    vi.mocked(getShot).mockResolvedValue(shot);
    vi.mocked(updateShot).mockResolvedValue({ ...shot, dose_g: 18.1 });
    renderAtShot('shot-1');

    await waitFor(() => expect(screen.getByLabelText('Dose')).toHaveValue('18'));
    fireEvent.click(screen.getByRole('button', { name: 'Increase dose' }));
    expect(screen.getByText('+0.1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(updateShot).toHaveBeenCalledWith('shot-1', expect.objectContaining({ dose_g: 18.1 }))
    );
    expect(navigateMock).toHaveBeenCalledWith('/shots/shot-1');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/pages/EditShotPage.test.tsx`
Expected: FAIL against the current single-`initialValues` call.

- [ ] **Step 3: Update `EditShotPage.tsx`**

```tsx
// src/pages/EditShotPage.tsx
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ShotForm, type ShotFormValues } from '../components/ShotForm';
import { getShot, updateShot, type Shot } from '../lib/shots';

function toFormValues(shot: Shot): ShotFormValues {
  return {
    grind_setting: shot.grind_setting,
    dose_g: String(shot.dose_g),
    yield_g: String(shot.yield_g),
    pull_time_s: String(shot.pull_time_s),
    bean_name: shot.bean_name ?? '',
    roast_date: shot.roast_date ?? '',
    rating: shot.rating != null ? String(shot.rating) : '',
    tasting_note: shot.tasting_note ?? '',
  };
}

export function EditShotPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [shot, setShot] = useState<Shot | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    getShot(id)
      .then(setShot)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load shot'));
  }, [id]);

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
    navigate(`/shots/${id}`);
  }

  if (error) return <p style={{ color: 'var(--color-accent-800)' }}>{error}</p>;
  if (shot === undefined) return <p>Loading...</p>;
  if (shot === null) return <p>Shot not found.</p>;

  const values = toFormValues(shot);

  return (
    <div className="max-w-md mx-auto">
      <h1
        className="text-center"
        style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: '17px', padding: 'var(--space-3) 0' }}
      >
        Edit shot
      </h1>
      <ShotForm referenceValues={values} initialValues={values} submitLabel="Save changes" onSubmit={handleSubmit} />
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/pages/EditShotPage.test.tsx`
Expected: PASS.

- [ ] **Step 5: Run the full suite (Tasks 4-6 together)**

Run: `npx vitest run src/components/ShotForm.test.tsx src/pages/NewShotPage.test.tsx src/pages/EditShotPage.test.tsx`
Expected: PASS, all three files.

- [ ] **Step 6: Commit**

```bash
git add src/components/ShotForm.tsx src/components/ShotForm.test.tsx src/pages/NewShotPage.tsx src/pages/NewShotPage.test.tsx src/pages/EditShotPage.tsx src/pages/EditShotPage.test.tsx
git commit -m "feat: redesign log-a-shot and edit-shot as duplicate-and-nudge forms"
```

---

### Task 7: Shot detail page

**Files:**
- Modify: `src/pages/ShotDetailPage.tsx`, `src/pages/ShotDetailPage.test.tsx`

**Interfaces:**
- Consumes: `getShot`, `deleteShot`, `listShots` from `src/lib/shots.ts`; `getVideoForShot`, `getVideoPlaybackUrl`, `validateVideoFile`, `uploadShotVideo` from `src/lib/videos.ts`; `groupShotsByBag`, `deltas`, `ratio`, `daysSinceRoast` from `src/lib/shotView.ts`; `formatMass`, `formatSigned`, `formatRoastAge` from `src/lib/format.ts`; `RatioFigure`, `PullTimeFigure` from `src/components/shot-display/`.

Per assumption 7: an indeterminate progress bar during upload, and playability detected via the `<video>` element's `error` event rather than pre-inspection. The delta block is omitted for a bag's first shot (no previous shot in the same bag), matching the schema. Per assumption 10: "Duplicate" and "Pull another like this" both link to `/shots/new?from=<this shot's id>` so Task 5's `NewShotPage` seeds from this specific shot rather than defaulting to its bag's most recent one.

- [ ] **Step 1: Write the failing test**

```tsx
// src/pages/ShotDetailPage.test.tsx
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ShotDetailPage } from './ShotDetailPage';
import { getShot, listShots } from '../lib/shots';
import { getVideoForShot, getVideoPlaybackUrl } from '../lib/videos';

vi.mock('../lib/shots', () => ({ getShot: vi.fn(), listShots: vi.fn(), deleteShot: vi.fn() }));
vi.mock('../lib/videos', () => ({
  getVideoForShot: vi.fn(),
  getVideoPlaybackUrl: vi.fn(),
  validateVideoFile: vi.fn(),
  uploadShotVideo: vi.fn(),
}));

const previousShot = {
  id: 'shot-0',
  user_id: 'user-1',
  grind_setting: '18.2',
  dose_g: 18,
  yield_g: 32,
  pull_time_s: 24,
  bean_name: 'Kenya Nyeri AA',
  roast_date: '2026-08-23',
  rating: null,
  tasting_note: null,
  created_at: '2026-09-03T07:42:00Z',
  updated_at: '2026-09-03T07:42:00Z',
};

const shot = {
  ...previousShot,
  id: 'shot-1',
  grind_setting: '18.0',
  dose_g: 18,
  yield_g: 36,
  pull_time_s: 28,
  tasting_note: 'Bright, a little sharp',
  created_at: '2026-09-04T07:42:00Z',
  updated_at: '2026-09-04T07:42:00Z',
};

function renderAtShot(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/shots/${id}`]}>
      <Routes>
        <Route path="/shots/:id" element={<ShotDetailPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('ShotDetailPage', () => {
  it('renders the hero ratio, pull time, and delta block against the previous shot on the bag', async () => {
    vi.mocked(getShot).mockResolvedValue(shot);
    vi.mocked(listShots).mockResolvedValue([shot, previousShot]);
    vi.mocked(getVideoForShot).mockResolvedValue(null);

    renderAtShot('shot-1');

    await waitFor(() => expect(screen.getByText('Kenya Nyeri AA')).toBeInTheDocument());
    expect(screen.getByText('2.00')).toBeInTheDocument();
    expect(screen.getByText(/Against the previous shot/)).toBeInTheDocument();
    expect(screen.getByText('+4.0 g yield')).toBeInTheDocument();
  });

  it('omits the delta block for a bag\'s first shot', async () => {
    vi.mocked(getShot).mockResolvedValue(shot);
    vi.mocked(listShots).mockResolvedValue([shot]);
    vi.mocked(getVideoForShot).mockResolvedValue(null);

    renderAtShot('shot-1');

    await waitFor(() => expect(screen.getByText('Kenya Nyeri AA')).toBeInTheDocument());
    expect(screen.queryByText(/Against the previous shot/)).not.toBeInTheDocument();
  });

  it('renders the tasting note in italics', async () => {
    vi.mocked(getShot).mockResolvedValue(shot);
    vi.mocked(listShots).mockResolvedValue([shot]);
    vi.mocked(getVideoForShot).mockResolvedValue(null);

    renderAtShot('shot-1');

    await waitFor(() => expect(screen.getByText('Bright, a little sharp')).toBeInTheDocument());
  });

  it('plays the video when one is attached', async () => {
    vi.mocked(getShot).mockResolvedValue(shot);
    vi.mocked(listShots).mockResolvedValue([shot]);
    vi.mocked(getVideoForShot).mockResolvedValue({
      id: 'video-1',
      shot_id: 'shot-1',
      user_id: 'user-1',
      storage_key: 'user-1/shot-1/pour.mp4',
      content_type: 'video/mp4',
      size_bytes: 1000,
      uploaded_at: '2026-09-04T07:43:00Z',
    });
    vi.mocked(getVideoPlaybackUrl).mockResolvedValue('https://example.test/signed');

    renderAtShot('shot-1');

    await waitFor(() => expect(screen.getByTestId('pour-video')).toBeInTheDocument());
  });

  it('shows an unplayable message when the video element fails to load', async () => {
    vi.mocked(getShot).mockResolvedValue(shot);
    vi.mocked(listShots).mockResolvedValue([shot]);
    vi.mocked(getVideoForShot).mockResolvedValue({
      id: 'video-1',
      shot_id: 'shot-1',
      user_id: 'user-1',
      storage_key: 'user-1/shot-1/pour.mov',
      content_type: 'video/quicktime',
      size_bytes: 1000,
      uploaded_at: '2026-09-04T07:43:00Z',
    });
    vi.mocked(getVideoPlaybackUrl).mockResolvedValue('https://example.test/signed');

    renderAtShot('shot-1');

    await waitFor(() => expect(screen.getByTestId('pour-video')).toBeInTheDocument());
    fireEvent.error(screen.getByTestId('pour-video'));

    await waitFor(() => expect(screen.getByText(/can't preview this format/i)).toBeInTheDocument());
  });

  it('shows a not-found message when the shot does not exist', async () => {
    vi.mocked(getShot).mockResolvedValue(null);
    vi.mocked(listShots).mockResolvedValue([]);

    renderAtShot('missing');

    await waitFor(() => expect(screen.getByText(/shot not found/i)).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/pages/ShotDetailPage.test.tsx`
Expected: FAIL against the current plain `<dl>` implementation.

- [ ] **Step 3: Write `ShotDetailPage.tsx`**

```tsx
// src/pages/ShotDetailPage.tsx
import { useEffect, useState, type ChangeEvent } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getShot, deleteShot, listShots, type Shot } from '../lib/shots';
import {
  getVideoForShot,
  getVideoPlaybackUrl,
  validateVideoFile,
  uploadShotVideo,
  type Video,
} from '../lib/videos';
import { groupShotsByBag, deltas, ratio, daysSinceRoast } from '../lib/shotView';
import { formatMass, formatSigned, formatRoastAge } from '../lib/format';
import { RatioFigure } from '../components/shot-display/RatioFigure';
import { PullTimeFigure } from '../components/shot-display/PullTimeFigure';

type VideoState = 'none' | 'uploading' | 'ready' | 'unplayable';

function findPreviousShot(shot: Shot, allShots: Shot[]): Shot | null {
  const bag = groupShotsByBag(allShots).find(
    (b) => b.bean_name === shot.bean_name && b.roast_date === shot.roast_date
  );
  if (!bag) return null;
  const index = bag.shots.findIndex((s) => s.id === shot.id);
  return index >= 0 ? bag.shots[index + 1] ?? null : null;
}

export function ShotDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [shot, setShot] = useState<Shot | null | undefined>(undefined);
  const [previousShot, setPreviousShot] = useState<Shot | null>(null);
  const [video, setVideo] = useState<Video | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoState, setVideoState] = useState<VideoState>('none');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    getShot(id)
      .then((s) => {
        setShot(s);
        if (!s) return;
        return listShots().then((all) => setPreviousShot(findPreviousShot(s, all)));
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load shot'));
  }, [id]);

  useEffect(() => {
    if (!id) return;
    getVideoForShot(id).then((v) => {
      setVideo(v);
      if (!v) return;
      setVideoState('ready');
      getVideoPlaybackUrl(v).then(setVideoUrl);
    });
  }, [id]);

  async function handleVideoAttach(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    if (!file || !id) return;
    const result = await validateVideoFile(file);
    if (!result.valid) {
      setError(result.reason);
      return;
    }
    setVideoState('uploading');
    const uploaded = await uploadShotVideo(id, file);
    setVideo(uploaded);
    const url = await getVideoPlaybackUrl(uploaded);
    setVideoUrl(url);
    setVideoState('ready');
  }

  async function handleDelete() {
    if (!id) return;
    if (!window.confirm('Delete this shot? This cannot be undone.')) return;
    await deleteShot(id);
    navigate('/');
  }

  if (error) return <p style={{ color: 'var(--color-accent-800)' }}>{error}</p>;
  if (shot === undefined) return <p>Loading...</p>;
  if (shot === null) return <p>Shot not found.</p>;

  const shotDeltas = previousShot ? deltas(shot, previousShot) : null;
  const age = shot.roast_date ? daysSinceRoast(shot.roast_date) : null;
  const timestamp = new Date(shot.created_at).toLocaleString();

  return (
    <div className="max-w-md mx-auto">
      <header
        className="flex justify-between items-center border-b border-[var(--color-divider)]"
        style={{ padding: 'var(--space-3) var(--space-4)' }}
      >
        <Link to="/" style={{ color: 'var(--color-accent)' }}>
          Shots
        </Link>
        <div className="flex" style={{ gap: 'var(--space-2)' }}>
          <Link
            to={`/shots/${id}/edit`}
            className="h-9 px-3 flex items-center border border-[var(--color-divider)] rounded-[var(--radius-md)] text-sm"
          >
            Edit
          </Link>
          <Link
            to={`/shots/new?from=${id}`}
            className="h-9 px-3 flex items-center border border-[var(--color-divider)] rounded-[var(--radius-md)] text-sm"
          >
            Duplicate
          </Link>
        </div>
      </header>

      <div style={{ padding: 'var(--space-4) var(--space-4) var(--space-3)' }}>
        <div
          className="num"
          style={{ fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.55 }}
        >
          {shot.bean_name ?? 'Unlabeled'}
          {age != null ? ` · ${formatRoastAge(age)}` : ''}
          {` · ${timestamp}`}
        </div>
        <div className="flex items-baseline" style={{ gap: 'var(--space-4)' }}>
          <RatioFigure value={ratio(shot)} size="xl" />
          <PullTimeFigure seconds={shot.pull_time_s} size="xl" />
        </div>
      </div>

      <div style={{ padding: '0 var(--space-4) var(--space-3)' }}>
        {videoState === 'none' && (
          <div className="border-t border-[var(--color-divider)]" style={{ padding: 'var(--space-3) 0' }}>
            <label htmlFor="detail-video-input" style={{ color: 'var(--color-accent)' }}>
              Attach pour video
            </label>
            <input id="detail-video-input" type="file" accept="video/*" onChange={handleVideoAttach} />
          </div>
        )}
        {videoState !== 'none' && (
          <>
            <div
              className="plate"
              style={{
                aspectRatio: '16 / 10',
                background: 'var(--color-neutral-900)',
                border: '6px solid var(--color-surface)',
                outline: '1px solid var(--color-divider)',
                filter: 'sepia(0.22) saturate(0.82) contrast(1.05)',
              }}
            >
              {videoUrl && videoState !== 'uploading' && (
                <video
                  data-testid="pour-video"
                  src={videoUrl}
                  controls
                  className="w-full h-full"
                  onError={() => setVideoState('unplayable')}
                />
              )}
            </div>
            <div
              className="flex justify-between"
              style={{ fontSize: '11px', opacity: 0.6, marginTop: '4px' }}
            >
              <span>Pour video</span>
              <span>
                {videoState === 'uploading' && 'Uploading...'}
                {videoState === 'ready' && 'Ready'}
                {videoState === 'unplayable' && (
                  <>
                    Can't preview this format ·{' '}
                    {videoUrl && (
                      <a href={videoUrl} style={{ color: 'var(--color-accent)' }}>
                        Download
                      </a>
                    )}
                  </>
                )}
              </span>
            </div>
            {videoState === 'uploading' && (
              <div
                style={{
                  height: '2px',
                  background: 'var(--color-accent-200)',
                  marginTop: '4px',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: '40%',
                    background: 'var(--color-accent)',
                    animation: 'indeterminate 1.2s ease-in-out infinite',
                  }}
                />
              </div>
            )}
          </>
        )}
      </div>

      <table className="w-full" style={{ borderCollapse: 'collapse' }}>
        <tbody>
          <tr style={{ borderTop: '1px solid var(--color-divider)' }}>
            <td style={{ padding: 'var(--space-2) var(--space-4)', opacity: 0.65 }}>Dose</td>
            <td className="num text-right" style={{ padding: 'var(--space-2) var(--space-4)' }}>
              {formatMass(shot.dose_g)}
            </td>
          </tr>
          <tr style={{ borderTop: '1px solid var(--color-divider)' }}>
            <td style={{ padding: 'var(--space-2) var(--space-4)', opacity: 0.65 }}>Yield</td>
            <td className="num text-right" style={{ padding: 'var(--space-2) var(--space-4)' }}>
              {formatMass(shot.yield_g)}
            </td>
          </tr>
          <tr style={{ borderTop: '1px solid var(--color-divider)' }}>
            <td style={{ padding: 'var(--space-2) var(--space-4)', opacity: 0.65 }}>Grind</td>
            <td className="num text-right" style={{ padding: 'var(--space-2) var(--space-4)' }}>
              {shot.grind_setting}
            </td>
          </tr>
          {shot.rating != null && (
            <tr style={{ borderTop: '1px solid var(--color-divider)' }}>
              <td style={{ padding: 'var(--space-2) var(--space-4)', opacity: 0.65 }}>Rating</td>
              <td className="num text-right" style={{ padding: 'var(--space-2) var(--space-4)' }}>
                {shot.rating} / 5
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {shotDeltas && (
        <div style={{ padding: 'var(--space-3) var(--space-4)' }}>
          <div
            className="num"
            style={{ fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.55 }}
          >
            Against the previous shot
          </div>
          <div className="num" style={{ fontSize: '13px' }}>
            {shotDeltas.grind != null && (
              <span style={{ color: 'var(--color-accent-700)' }}>
                {formatSigned(shotDeltas.grind, 1)} grind
              </span>
            )}
            {shotDeltas.grind != null && ' · '}
            <span style={{ color: 'var(--color-accent-700)' }}>
              {formatSigned(shotDeltas.yield_g, 1)}
              {' '}g yield
            </span>
            {' · '}
            <span style={{ color: 'var(--color-accent-700)' }}>
              {formatSigned(shotDeltas.pull_time_s, 0)}s time
            </span>
          </div>
        </div>
      )}

      {shot.tasting_note && (
        <div
          className="border-t border-[var(--color-divider)]"
          style={{
            padding: 'var(--space-3) var(--space-4)',
            fontFamily: 'var(--font-heading)',
            fontStyle: 'italic',
            fontSize: '19px',
            lineHeight: 1.4,
          }}
        >
          {shot.tasting_note}
        </div>
      )}

      <div
        className="flex justify-between items-center border-t border-[var(--color-divider)]"
        style={{ padding: 'var(--space-3) var(--space-4) var(--space-6)' }}
      >
        <button type="button" onClick={handleDelete} style={{ color: 'var(--color-neutral-700)' }}>
          Delete shot
        </button>
        <Link
          to={`/shots/new?from=${id}`}
          className="flex items-center justify-center border border-[var(--color-accent)] rounded-[var(--radius-md)]"
          style={{ height: '48px', padding: '0 var(--space-4)', color: 'var(--color-accent)' }}
        >
          Pull another like this
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Add the indeterminate progress bar keyframes to `src/theme.css`**

```css
/* src/theme.css - append */
@keyframes indeterminate {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(250%);
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/pages/ShotDetailPage.test.tsx`
Expected: PASS.

- [ ] **Step 6: Run the full test suite**

Run: `npx vitest run`
Expected: PASS, every test file.

- [ ] **Step 7: Commit**

```bash
git add src/pages/ShotDetailPage.tsx src/pages/ShotDetailPage.test.tsx src/theme.css
git commit -m "feat: redesign the shot detail page with hero, video plate, and delta block"
```

---

### Task 8: Trends route

**Files:**
- Create: `src/pages/TrendsPage.tsx`, `src/pages/TrendsPage.test.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `listShots` from `src/lib/shots.ts`; `groupShotsByBag`, `ratio` from `src/lib/shotView.ts`; `scaleLinear`, `medianOf` from `src/lib/chartScale.ts` (Task 2); `BagSelector` from `src/components/BagSelector.tsx` (Task 2).
- All three charts compute client-side from the shots array already in memory - no new tables, no aggregation service, no charting library, per the schema's decisions table and this plan's updated `docs/mvp_spec.md` Phase 2A description.

- [ ] **Step 1: Write the failing test**

```tsx
// src/pages/TrendsPage.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { TrendsPage } from './TrendsPage';
import { listShots } from '../lib/shots';

vi.mock('../lib/shots', () => ({ listShots: vi.fn() }));

const shots = [
  {
    id: 'shot-2',
    user_id: 'user-1',
    grind_setting: '18.0',
    dose_g: 18,
    yield_g: 36,
    pull_time_s: 28,
    bean_name: 'Kenya Nyeri AA',
    roast_date: '2026-08-23',
    rating: 4,
    tasting_note: null,
    created_at: '2026-09-04T07:42:00Z',
    updated_at: '2026-09-04T07:42:00Z',
  },
  {
    id: 'shot-1',
    user_id: 'user-1',
    grind_setting: '18.2',
    dose_g: 18,
    yield_g: 32,
    pull_time_s: 24,
    bean_name: 'Kenya Nyeri AA',
    roast_date: '2026-08-23',
    rating: 3,
    tasting_note: null,
    created_at: '2026-09-03T07:42:00Z',
    updated_at: '2026-09-03T07:42:00Z',
  },
];

describe('TrendsPage', () => {
  it('renders the three charts for the default (most recently active) bag', async () => {
    vi.mocked(listShots).mockResolvedValue(shots);

    render(
      <MemoryRouter>
        <TrendsPage />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText('Ratio against time')).toBeInTheDocument());
    expect(screen.getByText('Pull time consistency')).toBeInTheDocument();
    expect(screen.getByText('Rating by shot on this bag')).toBeInTheDocument();
    expect(document.querySelectorAll('svg')).toHaveLength(3);
  });

  it('shows an empty state when the selected bag has no shots yet', async () => {
    vi.mocked(listShots).mockResolvedValue([]);

    render(
      <MemoryRouter>
        <TrendsPage />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText(/no shots logged yet/i)).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/pages/TrendsPage.test.tsx`
Expected: FAIL, `TrendsPage.tsx` does not exist yet.

- [ ] **Step 3: Write `TrendsPage.tsx`**

```tsx
// src/pages/TrendsPage.tsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listShots, type Shot } from '../lib/shots';
import { groupShotsByBag, ratio, type Bag } from '../lib/shotView';
import { scaleLinear, medianOf } from '../lib/chartScale';
import { BagSelector } from '../components/BagSelector';

function RatioOverTimeChart({ shots }: { shots: Shot[] }) {
  const times = shots.map((s) => s.pull_time_s);
  const ratios = shots.map((s) => ratio(s));
  const x = scaleLinear(Math.min(...times), Math.max(...times), 20, 320);
  const y = scaleLinear(Math.min(...ratios), Math.max(...ratios), 170, 20);

  return (
    <svg viewBox="0 0 340 190" width="100%">
      <line x1="20" y1="170" x2="320" y2="170" stroke="var(--color-divider)" />
      <line x1="20" y1="20" x2="20" y2="170" stroke="var(--color-divider)" />
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
    </svg>
  );
}

function PullTimeConsistencyChart({ shots }: { shots: Shot[] }) {
  const recent = [...shots].slice(0, 14).reverse();
  const times = recent.map((s) => s.pull_time_s);
  const median = medianOf(times);
  const x = scaleLinear(0, Math.max(recent.length - 1, 1), 10, 330);
  const y = scaleLinear(Math.min(...times) - 2, Math.max(...times) + 2, 100, 10);

  const points = recent.map((s, i) => `${x(i)},${y(s.pull_time_s)}`).join(' ');

  return (
    <svg viewBox="0 0 340 120" width="100%">
      <rect x="10" y={y(median + 1)} width="320" height={y(median - 1) - y(median + 1)} fill="var(--color-accent-100)" />
      <line x1="10" y1={y(median)} x2="330" y2={y(median)} stroke="var(--color-accent-300)" />
      <polyline points={points} fill="none" stroke="var(--color-neutral-800)" strokeWidth="1.4" />
      {recent.length > 0 && (
        <circle
          cx={x(recent.length - 1)}
          cy={y(recent[recent.length - 1].pull_time_s)}
          r="3.5"
          fill="var(--color-accent)"
        />
      )}
    </svg>
  );
}

function RatingByShotChart({ shots }: { shots: Shot[] }) {
  const rated = [...shots].reverse().filter((s) => s.rating != null) as (Shot & { rating: number })[];
  const x = scaleLinear(0, Math.max(rated.length - 1, 1), 20, 320);
  const y = scaleLinear(0, 5, 90, 10);
  const barWidth = rated.length > 1 ? (300 / rated.length) * 0.6 : 30;

  return (
    <svg viewBox="0 0 340 110" width="100%">
      <line x1="20" y1="90" x2="320" y2="90" stroke="var(--color-divider)" />
      {rated.map((shot, i) => (
        <rect
          key={shot.id}
          x={x(i) - barWidth / 2}
          y={y(shot.rating)}
          width={barWidth}
          height={90 - y(shot.rating)}
          fill="none"
          stroke={i >= rated.length - 2 ? 'var(--color-accent)' : 'var(--color-neutral-600)'}
        />
      ))}
    </svg>
  );
}

export function TrendsPage() {
  const [bags, setBags] = useState<Bag[]>([]);
  const [selectedBag, setSelectedBag] = useState<Bag | null>(null);

  useEffect(() => {
    listShots().then((shots) => {
      const grouped = groupShotsByBag(shots);
      setBags(grouped);
      setSelectedBag(grouped[0] ?? null);
    });
  }, []);

  return (
    <div className="max-w-md mx-auto">
      <header
        className="flex justify-between items-center border-b border-[var(--color-divider)]"
        style={{ padding: 'var(--space-3) var(--space-4)' }}
      >
        <Link to="/" style={{ color: 'var(--color-accent)' }}>
          Shots
        </Link>
        <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: '19px' }}>
          Trends
        </h1>
        <BagSelector
          bags={bags}
          selected={selectedBag}
          onSelect={setSelectedBag}
          label={selectedBag?.bean_name ?? 'Select bag'}
        />
      </header>

      {!selectedBag || selectedBag.shots.length === 0 ? (
        <p style={{ padding: 'var(--space-4)' }}>No shots logged yet.</p>
      ) : (
        <div className="flex flex-col" style={{ gap: 'var(--space-6)', padding: 'var(--space-4)' }}>
          <div>
            <div
              className="num"
              style={{ fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.55 }}
            >
              Ratio against time
            </div>
            <p style={{ fontSize: '12.5px', opacity: 0.7 }}>Is a longer pull pulling wetter or drier?</p>
            <RatioOverTimeChart shots={selectedBag.shots} />
          </div>
          <div>
            <div
              className="num"
              style={{ fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.55 }}
            >
              Pull time consistency
            </div>
            <p style={{ fontSize: '12.5px', opacity: 0.7 }}>How close to the median are recent shots landing?</p>
            <PullTimeConsistencyChart shots={selectedBag.shots} />
          </div>
          <div>
            <div
              className="num"
              style={{ fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.55 }}
            >
              Rating by shot on this bag
            </div>
            <p style={{ fontSize: '12.5px', opacity: 0.7 }}>Is this bag trending better or worse?</p>
            <RatingByShotChart shots={selectedBag.shots} />
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/pages/TrendsPage.test.tsx`
Expected: PASS.

- [ ] **Step 5: Add the route in `App.tsx`**

```tsx
// src/App.tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { LoginPage } from './pages/LoginPage';
import { ShotListPage } from './pages/ShotListPage';
import { NewShotPage } from './pages/NewShotPage';
import { ShotDetailPage } from './pages/ShotDetailPage';
import { EditShotPage } from './pages/EditShotPage';
import { TrendsPage } from './pages/TrendsPage';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <ShotListPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/shots/new"
            element={
              <ProtectedRoute>
                <NewShotPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/shots/:id"
            element={
              <ProtectedRoute>
                <ShotDetailPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/shots/:id/edit"
            element={
              <ProtectedRoute>
                <EditShotPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/trends"
            element={
              <ProtectedRoute>
                <TrendsPage />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
```

- [ ] **Step 6: Run the full test suite and the build**

Run: `npx vitest run && npm run build`
Expected: PASS, and a clean build.

- [ ] **Step 7: Commit**

```bash
git add src/pages/TrendsPage.tsx src/pages/TrendsPage.test.tsx src/App.tsx
git commit -m "feat: add the trends route with client-side SVG charts"
```

---

## After this plan lands

Per `docs/mvp_spec.md` Phase 2, pieces A (Trends - already delivered by Task 8 above) and B (Barista Assistant v0) are independent at the file level once this design foundation is in place. Trends is done as part of this plan; Barista Assistant v0 is a separate, not-yet-written plan (new Edge Function, new `shot_analyses` table, a new "Analyze this shot" control on the shot detail page). That plan can be developed and executed in its own git worktree and Claude Code session, run in parallel with any further design polish, once this plan is fully merged.
