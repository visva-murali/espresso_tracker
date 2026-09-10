// src/lib/chartScale.test.ts
import { describe, it, expect } from 'vitest';
import { scaleLinear, medianOf, niceDomain } from './chartScale';

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

describe('niceDomain', () => {
  it('pads a real spread by the given fraction', () => {
    expect(niceDomain([10, 20], 4, 0.1)).toEqual([9, 21]);
  });

  it('expands a collapsed (all-equal) set to a centered minimum window', () => {
    expect(niceDomain([28, 28, 28], 4)).toEqual([26, 30]);
  });

  it('expands a spread narrower than the minimum, keeping it centered', () => {
    expect(niceDomain([27, 28], 4)).toEqual([25.5, 29.5]);
  });

  it('keeps a spread wider than the minimum, only padding it', () => {
    expect(niceDomain([20, 30], 4, 0.2)).toEqual([18, 32]);
  });

  it('falls back to [0, minSpan] for an empty set', () => {
    expect(niceDomain([], 4)).toEqual([0, 4]);
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
