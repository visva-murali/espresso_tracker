# Trends screen - known follow-ups

Cosmetic and polish items on the trends screen that are understood but not
yet fixed. None of these are correctness bugs. The larger item, giving the
ratio scatter a user-set target window and a readable direction, is
tracked separately in `target-ratio-design.md` and
`superpowers/plans/2026-09-09-per-bag-target-ratio.md`.

## 1. Ratio scatter clusters on the bottom-left axis

When several shots on a bag share the lowest ratio (a fixed dose with a
repeated yield is common), `niceDomain(ratios, 0.3)` centres a 0.3-wide
window on the data and those points land within a few percent of the
axis, so they read as a single blob in the corner rather than a spread.

- Where: `src/pages/TrendsPage.tsx` `RatioOverTimeChart`, via
  `src/lib/chartScale.ts` `niceDomain`.
- Possible fix: apply padding in the sub-`minSpan` branch of `niceDomain`
  as well as the normal branch. This changes `niceDomain`'s existing unit
  tests, so update those in the same change.

## 2. Fixed SVG viewBox headroom leaves dead vertical space

The pull-time (`340x120`) and rating (`340x110`) charts reserve vertical
space the marks never use, so there is a visible gap between sections,
more noticeable on sparse bags where the marks sit high in the box.

- Where: `src/pages/TrendsPage.tsx`, all three chart components.
- Possible fix: size each viewBox to its content, or tighten the scale
  output ranges so the marks fill the box.

## 3. Header title drifts off-centre with long bag names

The trends `<header>` uses `justify-between` with a fixed-width spacer
opposite the "Shots" link. A wide bag-selector button (for example
"Colombia Popayan") pushes "Trends" left of true centre.

- Where: `src/pages/TrendsPage.tsx` `TrendsPage` header.
- Possible fix: a three-column header (CSS grid, or left/centre/right
  with equal-width side columns) so the title stays centred regardless of
  the side elements' widths.

## 4. Rating chart highlights both bars when exactly two are rated

`RatingByShotChart` styles the last two bars as "recent" (accent). With
exactly two rated shots on a bag, every bar is highlighted, which carries
no information.

- Where: `src/pages/TrendsPage.tsx` `RatingByShotChart`.
- Possible fix: only highlight the trailing bars when there are more than
  two, or highlight just the most recent one.
