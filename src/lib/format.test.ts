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
    expect(formatMass(18)).toBe('18.0 g');
  });

  it('rounds to one decimal', () => {
    expect(formatMass(41.47)).toBe('41.5 g');
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
