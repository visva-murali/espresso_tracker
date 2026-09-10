# Trends screen - known follow-ups

Cosmetic and polish items on the trends screen that are understood but not
yet fixed. None of these are correctness bugs. The larger item, giving the
ratio scatter a user-set target window and a readable direction, shipped
2026-09-10 (`target-ratio-design.md`,
`superpowers/plans/2026-09-09-per-bag-target-ratio.md`).

## 1. Fixed SVG viewBox headroom leaves dead vertical space

The pull-time (`340x120`) and rating (`340x110`) charts reserve vertical
space the marks never use, so there is a visible gap between sections,
more noticeable on sparse bags where the marks sit high in the box.

- Where: `src/pages/TrendsPage.tsx`, all three chart components.
- Possible fix: size each viewBox to its content, or tighten the scale
  output ranges so the marks fill the box.

## 2. Header title drifts off-centre with long bag names

The trends `<header>` uses `justify-between` with a fixed-width spacer
opposite the "Shots" link. A wide bag-selector button (for example
"Colombia Popayan") pushes "Trends" left of true centre.

- Where: `src/pages/TrendsPage.tsx` `TrendsPage` header.
- Possible fix: a three-column header (CSS grid, or left/centre/right
  with equal-width side columns) so the title stays centred regardless of
  the side elements' widths.

## 3. Rating chart highlights both bars when exactly two are rated

`RatingByShotChart` styles the last two bars as "recent" (accent). With
exactly two rated shots on a bag, every bar is highlighted, which carries
no information.

- Where: `src/pages/TrendsPage.tsx` `RatingByShotChart`.
- Possible fix: only highlight the trailing bars when there are more than
  two, or highlight just the most recent one.

## Resolved

### Ratio scatter clustered on the axis and exaggerated tiny differences (2026-09-10)

`RatioOverTimeChart` derived its y scale from `niceDomain(ratios, 0.3)`,
which centred a 0.3-wide window on the data: shots sharing a ratio landed
on the axis as a blob, and 0.05 of scatter stretched across a fifth of
the plot. The axis tick labels were drawn from the shot min/max ratio but
positioned at the padded domain edges, so a bag with near-identical shots
showed the same number top and bottom and the axis looked collapsed. The
target ratio label sat at the right end of the goal line, under the most
recent shot dot.

Fixed with `ratioDomain(ratios, target)` in `src/lib/chartScale.ts`: with
a target set, a fixed `target +/- 0.5` window (an edge pushed out only for
a shot outside it) so the goal line sits mid-plot; with no target,
`niceDomain(ratios, 0.8)`. Axis labels now read the actual scale bounds,
and the target label is anchored to the left gutter level with the dashed
line. `target-ratio-design.md` section 4d has the superseded original
plan.
