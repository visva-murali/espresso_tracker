# Handoff: Espresso Tracker front-end design schema

## Overview

A complete visual and structural schema for the espresso shot tracker (`visva-murali/espresso_tracker`, branch `main`). It defines tokens, an app-specific component vocabulary, layout rules, and four reference screens: shot list, log a shot, shot detail, and trends. The goal of the schema is that every future screen can be assembled from the parts in section 03 rather than designed from scratch.

The design is **mobile-first** (390pt reference width), **bean-first** (shots nest under a bag heading), and built around **duplicate-and-nudge** logging: a new shot starts as a copy of the bag's reference shot and the UI's job is to show what moved.

## About the design files

`Espresso Tracker Design Schema.dc.html` is a **design reference created in HTML** — a prototype showing intended look and behaviour, not production code to lift. The task is to recreate it inside the existing app: React 18 + Vite + TypeScript, React Router, Supabase client, Tailwind v4 (`@import "tailwindcss"` in `src/index.css`).

Concretely that means: express the tokens below as CSS custom properties in a stylesheet imported alongside Tailwind, then build the components as React components using those variables (Tailwind arbitrary values like `text-[var(--color-accent)]` are fine). Do not port the design system's `styles.css` wholesale and do not introduce a component library.

The design system is **Classical** — editorial, book-like, hairlines and outlines rather than fills. Its full stylesheet is bundled at `classical/styles.css` for reference.

## Fidelity

**High fidelity.** Colours, type, spacing and sizes below are final and exact. Recreate them pixel-accurately. Where the prototype shows sample data (bean names, timestamps, ratings) that is placeholder content, not copy to ship.

---

## Design tokens

Ground, text and accent come from the Classical system. Copy these verbatim.

```css
:root {
  --color-bg:        #f3f2f2;  /* every screen */
  --color-surface:   #eae9e9;  /* video mats, sheets, dialogs */
  --color-text:      #201f1d;
  --color-accent:    #b68235;  /* actions, deltas */
  --color-divider:   color-mix(in srgb, #201f1d 16%, transparent);

  --color-neutral-100: #f8f4f4;  --color-neutral-200: #eae7e7;
  --color-neutral-300: #d7d3d3;  --color-neutral-400: #bab6b6;
  --color-neutral-500: #9b9797;  --color-neutral-600: #7d7979;
  --color-neutral-700: #605d5d;  --color-neutral-800: #444141;
  --color-neutral-900: #2d2b2b;

  --color-accent-100: #fff3e4;  --color-accent-200: #ffe3bf;
  --color-accent-300: #facb8d;  --color-accent-400: #e1ad66;
  --color-accent-500: #c28d41;  --color-accent-600: #a06f24;
  --color-accent-700: #7d5411;  --color-accent-800: #5a3b0a;
  --color-accent-900: #3a270d;

  --font-heading: "Cormorant Garamond", system-ui, sans-serif;  /* 400 and 600 only */
  --font-body:    "Lora", system-ui, sans-serif;                /* 400 and 600 only */

  --space-1: 4.6px;  --space-2: 9.2px;  --space-3: 13.8px;
  --space-4: 18.4px; --space-6: 27.6px; --space-8: 36.8px;

  --radius-sm: 2px;  --radius-md: 4px;  --radius-lg: 7px;

  --shadow-sm: 0 1px 2px  color-mix(in srgb, #2d2b2b 14%, transparent);
  --shadow-md: 0 3px 10px color-mix(in srgb, #2d2b2b 16%, transparent);
  --shadow-lg: 0 12px 32px color-mix(in srgb, #2d2b2b 22%, transparent);
}
```

Fonts load from Google Fonts: `Cormorant+Garamond:wght@400;600` and `Lora:wght@400;600`.

### Two utility classes the whole app depends on

```css
.num { font-feature-settings: 'tnum' 1; font-variant-numeric: tabular-nums; }
.fig { font-family: var(--font-body); font-weight: 600;
       font-feature-settings: 'tnum' 1; font-variant-numeric: tabular-nums;
       letter-spacing: -0.01em; }
```

`.fig` is the single most important rule in the schema. **Figures break the system's heading rule on purpose**: Cormorant's numerals are too fine and too small on the body to read at arm's length on a wet counter, so every changing figure sets in Lora semibold, tabular, at full text colour. Cormorant keeps the words — titles, notes, section headings.

### Type scale as used

| Role | Font / size | Where |
| --- | --- | --- |
| Figure XL | `.fig` 44px / 1.05 | Shot detail hero ratio only |
| Figure L | `.fig` 24px / 1.15 | Shot rows, stepper values |
| Figure S | `.fig` 16px / 1.15, `--color-neutral-700` | Pull time beside a ratio |
| Title | Cormorant 600, 19px | Bag headings, screen titles |
| Body | Lora 400, 14px / 1.55 | Metadata, notes, field values |
| Micro | Lora 400, 11px, `0.09em`, uppercase | Kickers, labels, chart axes |

### Notation rules

- **Ratio**: always `1:x` with two decimals. The `1:` is constant, so it sets at ~65% of the figure size, weight 400, `--color-neutral-700`; only `x` is a full figure. Never "2.3x".
- **Time**: whole seconds, unit tight with no space (`28s`); the `s` is 12.5px weight 400.
- **Mass**: one decimal, hair space before the unit (`18.0 g`); the `g` is 14px, `--color-neutral-600`.
- **Roast age**: days from `roast_date` (`12 d`), never a date.
- **Grind**: rendered verbatim as free text. Never coerced to a number.
- **Deltas**: signed, in `--color-accent-700` (`+0.2`, `−2s`). Gold on a figure always means "this is what moved, and by how much". A minus sign is U+2212, not a hyphen.

### Colour semantics

There is **no good/bad colour scale**. A fast shot is a number and a delta, not an error. Gold means change (deltas, the values that moved) and action (outlined buttons). Ratios and times stay ink so gold has something to stand against. Destructive actions use a ghost button plus a confirm dialog, not red.

---

## Layout rules

- Reference width 390pt. Screen gutter is `--space-4` (18px); nothing touches the edge except hairlines and the video plate.
- Vertical rhythm between blocks `--space-6`; inside a block `--space-2`.
- Rows are 64px minimum. Steppers are 48px. Nothing pressed while holding a portafilter goes below 48px.
- The bottom action bar reserves 88px plus safe-area inset; list content pads by that much so the last row clears it.
- Structure comes from hairlines (`1px solid var(--color-divider)`) and outlines. No filled cards, no solid buttons, no heavy shadows.

---

## Screens

### 1. Shot list — route `/`, replaces `src/pages/ShotListPage.tsx`

**Purpose**: scan recent shots grouped by bag; start a new one.

**Layout** (top to bottom, all full width):

- **Header**, `14px var(--space-4) var(--space-3)` padding, bottom hairline. Left: "Shots", Cormorant 600 19-20px. Right: a flex row, `gap: var(--space-2)`, of two 36×36 outlined icon buttons (search, menu) using Lucide icons at 16px, `stroke-width: 1.5`.
- **Segmented control**, full width, `var(--space-3) var(--space-4) var(--space-2)`: "Active bags" / "All shots". Two equal flex options, 1px divider border, radius `--radius-md`; the selected option is `--color-accent` text with `inset 0 0 0 1px var(--color-accent)`.
- **Bag group**, repeated. Header: `var(--space-4) var(--space-4) var(--space-2)` padding, baseline-aligned space-between. Left column is the bag title (Cormorant 600 19px) over a `.num` micro line, `11px / 0.08em / uppercase / opacity .55`, reading `Roaster · 12 d · 8 shots`. Right is the state tag.
- **Shot rows**, each `display: grid; grid-template-columns: 1fr auto; align-items: center; gap: var(--space-3); padding: var(--space-3) var(--space-4); min-height: 64px;` with a top hairline.
  - Left column, first line: a flex baseline row, `gap: 14px`. First child is the ratio — `.fig` 24px, containing an inner `.fig` span at 16px weight 400 `--color-neutral-700` holding `1:`. Second child is pull time — `.fig` 16px `--color-neutral-700` with the `s` at 12.5px weight 400. **No separator character between them**; the gap does the work.
  - Left column, second line: `.num` 12.5px `--color-neutral-700`, reading `18.0 → 41.5 g · grind 4.2`, with any delta appended as `<span style="color: var(--color-accent-700)">+0.2</span>`.
  - Right column: rating dots over the timestamp, right-aligned, `gap: 4px`. Rating is five 7px circles; filled ones are `--color-accent`, empty ones `1px solid var(--color-neutral-400)`. Omit the whole rating element when `rating` is null. Timestamp is `.num` 11px, `--color-neutral-600`, weekday + clock inside a fortnight then a date — never "3 days ago".
  - When the shot has a video and no rating, show a 15px Lucide `video` icon in `--color-accent` in the rating's place. Never show an empty slot.
  - The whole row navigates to `/shots/:id`. Swipe left reveals edit and delete; no per-row buttons.
- **Bottom bar**: top hairline, `var(--space-3) var(--space-4) var(--space-6)`, containing a full-width 48px outlined primary button, "Log a shot".

**Bag state tag** (derived, never stored, computed from that bag's shots):

| Tag | Style | Rule |
| --- | --- | --- |
| Dialed | `.tag-outline` — 1px accent border, accent text | two consecutive shots within 0.15 ratio and 2s of each other |
| Dialing | `.tag-accent` — `--color-accent-100` bg, `--color-accent-800` text | more than one shot, not yet converged |
| Resting | `.tag-neutral` | under 4 days off roast |
| Past peak | `.tag-neutral` | over 28 days off roast |

A bag with exactly one shot carries **no tag at all** rather than a guess.

Tag base style: `font-size: 11px; letter-spacing: 0.02em; padding: 3px 10px; border-radius: 3px;`.

### 2. Log a shot — route `/shots/new`, replaces `NewShotPage` + `ShotForm`

**Purpose**: log a shot in under 30 seconds by copying the bag's reference shot and nudging what changed.

- **Header**: "Cancel" ghost left, "New shot" (Cormorant 600 17px) centred, "Reset" ghost right. Bottom hairline. "Reset" returns every field to the reference values.
- **Reference strip**: bottom hairline, space-between. Left is a `.num` micro kicker "Copied from Tue 07:42" over the bag name (Cormorant 600 18px). Right is a 36px outlined "Change" button which opens bag selection.
- **Four nudge rows** in `padding: var(--space-2) var(--space-4)`, in this order: **Grind, Dose, Yield, Pull time**. Each is `display: grid; grid-template-columns: 1fr auto; align-items: center; gap: var(--space-3); min-height: 72px;` with a bottom hairline except the last.
  - Left: a 12px label at `opacity: .65`, then the value as `.fig` 25px / 1.2.
  - Right: two 48×48 outlined secondary buttons, `−` and `+`, `gap: var(--space-2)`, glyphs at 20px.
  - **Changed state**: when the value differs from the reference, the value colour becomes `--color-accent-700` and the label gains the signed delta in `--color-accent-700` (e.g. `Grind +0.2`). Untouched rows stay full ink, so the screen reads as a diff at a glance.
  - Steps: dose 0.1 g, yield 0.5 g, time 1s, grind 0.1 (or one notch of whatever text convention the previous shot used). Long-press repeats. Steppers are idempotent against the reference: nudging back to the original value clears the delta and the colour.
  - Tapping the value itself opens a numeric keypad for large jumps.
- **Ratio readout**: a strip with top and bottom hairlines, `margin: 0 var(--space-4); padding: var(--space-3) 0`, space-between baseline. Label "Ratio" 12px `opacity .65`; value `.fig` 23px with the two-part `1:` treatment. Recomputes live from dose and yield.
- **Optional block**, `var(--space-3) var(--space-4)`, `gap: var(--space-3)`: rating (label left, five 15px circles right with `gap: 10px`), a full-width 48px outlined "Attach pour video" button with "optional" right-aligned at 12px `opacity .5`, and a ghost "Add tasting note" link that expands a `.input` textarea.
- **Bottom bar**: full-width 48px outlined primary, "Save shot".

Validation: grind, dose, yield and time are required (they are `not null` in the schema) but arrive pre-filled from the reference, so validation should almost never fire. Video is validated client-side before upload — 500 MB and 3 minutes, per `src/lib/videos.ts`.

### 3. Shot detail — route `/shots/:id`, replaces `src/pages/ShotDetailPage.tsx`

- **Header**: "Shots" ghost back link left; right a flex row of two 36px outlined buttons, "Edit" and "Duplicate". "Duplicate" opens `/shots/new` seeded from this shot.
- **Hero**, `var(--space-4) var(--space-4) var(--space-3)`: a `.num` micro kicker `Kenya Nyeri AA · 12 d · Tue 07:42`, then a baseline flex row with `gap: var(--space-4)` — the ratio as `.fig` 44px with the `1:` inner span at 27px weight 400 `--color-neutral-700`, and the pull time as `.fig` 34px `--color-neutral-700`.
- **Video plate**, `0 var(--space-4) var(--space-3)`: a 16:10 box with `class="plate"` — `filter: sepia(0.22) saturate(0.82) contrast(1.05); border: 6px solid var(--color-surface); outline: 1px solid var(--color-divider);` — over a `--color-neutral-900` background. Caption line underneath at 11px `opacity .6`, space-between: `Pour video · 0:31` left, status right. Phone footage letterboxes inside the mat rather than cropping — the crema surface is the point.
  - States: no video (a hairline "attach pour" row instead), uploading (determinate rule under the caption), ready, unplayable (the HEVC-in-.mov case — the caption says so plainly and offers download).
  - Phase 2 hook: the caption's right slot becomes the analysis state and an overlay track can be drawn inside the same mat without changing the layout.
- **Spec table**, `.table` style: rows Dose / Yield / Grind / Rating, label left at `opacity .65`, value right-aligned and `.num`. Row rules from `--color-divider`, `var(--space-2)` cell padding.
- **Delta block**: `.num` micro kicker "Against the previous shot", then a 13px `.num` line: `−0.2 grind · +4.1 g yield · +4s time`, each delta in `--color-accent-700`. Omit the block entirely for a bag's first shot.
- **Tasting note**: top hairline, then Cormorant 400 *italic* 19px / 1.4. This is the one place the serif carries content.
- **Bottom bar**: "Delete shot" as a ghost button far left, a 48px outlined primary "Pull another like this" right. Delete opens the system dialog and never sits adjacent to save.

### 4. Trends — new route `/trends`

Three charts, nothing else. All three compute client-side from the shots array; no new tables, no aggregation service.

- **Header**: "Trends" left, a 36px outlined bag selector button right.
- Each chart block: a `.num` micro kicker, a 12.5px `opacity .7` question line, then the SVG at 100% width.
  1. **Ratio against time** (`viewBox="0 0 340 190"`) — scatter of shots, x = pull time, y = ratio. A user-set target window drawn as a `--color-accent-100` rect with a `--color-accent-300` 3-3 dashed stroke. Axis lines in `--color-divider`. Points are 4px `none`-filled circles stroked `--color-neutral-600`; the most recent shot is a filled 4.5px `--color-accent` dot. Axis labels are 10px Lora `--color-neutral-600` with tabular figures; the y axis is labelled "RATIO" at 8.5px so the bare numbers need no `1:` prefix.
  2. **Pull time consistency** (`viewBox="0 0 340 120"`) — a polyline of the last 14 pull times, stroke `--color-neutral-800` at 1.4px, over a `--color-accent-100` band marking ±1s of the median with a `--color-accent-300` centre line. Latest point is a 3.5px accent dot.
  3. **Rating by shot on this bag** (`viewBox="0 0 340 110"`) — outlined bars, `--color-neutral-600` stroke, no fill; the most recent two are stroked `--color-accent`. Baseline in `--color-divider`.

Deliberately excluded: shots per week, grind vs rating, roast age vs rating. Charts are the easiest place to add slop.

---

## Interactions & behaviour

- Navigation is unchanged from the current router: `/login`, `/`, `/shots/new`, `/shots/:id`, `/shots/:id/edit`, plus the new `/trends`.
- Every interactive element gets a themed hover tint and a pressed state one ramp step past the base (`--color-accent-600` on this light ground, or a `color-mix()` tint for outlined and ghost variants). Keyboard focus is `outline: 2px solid var(--color-accent); outline-offset: 2px` — never the browser default.
- Disabled controls drop to 45% opacity.
- Loading: the shot list shows the bag headings' hairline structure with muted placeholder rows, not a spinner. Detail shows the hero kicker and an empty plate.
- Errors surface as a 13px line in `--color-accent-800` above the affected control; never a toast.
- Delete is the only irreversible action: ghost button, system dialog, and it never sits next to save.
- Transitions are short and few — 120ms ease for hover tints, 180ms for the stepper value change. No page transitions.

## State

- **Server state** (Supabase, unchanged): `shots` and `videos`, both under RLS on `user_id = auth.uid()`.
- **Derived, client-side, nothing persisted**:
  - `groupShotsByBag(shots)` — groups on `bean_name` + `roast_date`. This is the only new data structure the schema needs.
  - `bagState(bagShots)` — returns `dialed | dialing | resting | past-peak | null` per the rules above.
  - `referenceShot(bagShots)` — the most recent shot on the bag, unless one is starred.
  - `deltas(shot, previousShot)` — the signed differences rendered in gold.
  - `ratio(shot)` — `yield_g / dose_g`, formatted `1:x.xx`.
- **Local UI state**: the new-shot form holds the reference shot plus the working values so it can compute deltas and support Reset.

## Schema changes

**None required.** Everything above runs against the existing `shots` and `videos` tables. Two optional additions if you want them later:

- `shots.is_reference boolean` — lets a user star a reference shot instead of always using the most recent.
- A real `bags` table — the bag heading is already the tappable target a `/bags/:id` route would hang off, so this is additive.

## Assets

No images. Icons are **Lucide** (https://lucide.dev), inline SVG on `currentColor`, 16px at interface size with `stroke-width: 1.5`. Icons used: search, menu, video, play. The video plate in the prototype is a placeholder rectangle — real pour footage replaces it.

## Suggested implementation order

Each step ships on its own without breaking the app:

1. Tokens and type — a `theme.css` next to `src/index.css`, plus the `.num` / `.fig` utilities and the font links.
2. `groupShotsByBag`, `bagState`, `referenceShot`, `deltas`, `ratio` as pure functions in `src/lib/shots.ts`, with unit tests alongside the existing ones.
3. Bag heading and shot row in `ShotListPage`.
4. The nudge row replacing the numeric inputs in `ShotForm`, and the reference strip in `NewShotPage`.
5. The detail hero, video plate and delta block in `ShotDetailPage`.
6. `/trends` as a new route.

## Files in this bundle

- `Espresso Tracker Design Schema.dc.html` — the full schema page: principles, tokens, five component specs at real 390pt size, four screens, and a decisions table. Open it in a browser.
- `classical/styles.css` — the Classical design system stylesheet the schema is built on. Reference for exact component styles (`.btn`, `.tag`, `.input`, `.seg`, `.card`, `.table`, `.plate`, `.dialog`).
- `classical/readme.md` — the design system's own guide: direction, colour, type, interaction states, do's and don'ts.
- `github.md` — repo association and the screen-to-source map.
