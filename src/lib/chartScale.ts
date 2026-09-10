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

export function medianOf(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}
