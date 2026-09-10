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

/**
 * Turns raw data values into a plotting domain [low, high] that always has
 * usable width. A real spread is padded outward by `padFraction` so points
 * do not sit on the axis; a spread narrower than `minSpan` (including the
 * all-equal case, which would otherwise collapse every point onto one
 * pixel) is widened to `minSpan` around its midpoint.
 */
export function niceDomain(
  values: number[],
  minSpan: number,
  padFraction = 0.1
): [number, number] {
  if (values.length === 0) return [0, minSpan];

  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo;

  if (span < minSpan) {
    const mid = (lo + hi) / 2;
    return [mid - minSpan / 2, mid + minSpan / 2];
  }

  const pad = span * padFraction;
  return [lo - pad, hi + pad];
}

/**
 * Vertical domain for the ratio-against-time chart. With a target set, the
 * window is a fixed band centered on the target (`target +/- half`) so the
 * goal line sits mid-plot and normal shot-to-shot scatter reads as a small
 * cluster around it rather than a dramatic spread; an edge is pushed out
 * only when a shot lands outside the band. With no target there is nothing
 * to center on, so fall back to a wide `niceDomain`.
 */
export function ratioDomain(
  ratios: number[],
  target: number | null,
  half = 0.5,
  minSpan = 0.8
): [number, number] {
  if (target == null) return niceDomain(ratios, minSpan);

  let lo = target - half;
  let hi = target + half;
  for (const r of ratios) {
    if (r < lo) lo = r - 0.1;
    if (r > hi) hi = r + 0.1;
  }
  return [lo, hi];
}

export function medianOf(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}
