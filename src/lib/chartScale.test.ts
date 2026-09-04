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
