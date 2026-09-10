import { describe, it, expect } from 'vitest';
import { ratio, daysSinceRoast } from './shot-math';

describe('ratio', () => {
  it('computes yield over dose', () => {
    expect(ratio({ dose_g: 18, yield_g: 36 })).toBe(2);
  });

  it('handles a fractional result', () => {
    expect(ratio({ dose_g: 18, yield_g: 41.4 })).toBeCloseTo(2.3);
  });
});

describe('daysSinceRoast', () => {
  it('computes whole days between roast_date and now', () => {
    expect(daysSinceRoast('2026-08-23', new Date('2026-09-04'))).toBe(12);
  });

  it('floors a partial day', () => {
    expect(daysSinceRoast('2026-09-03T00:00:00Z', new Date('2026-09-04T18:00:00Z'))).toBe(1);
  });
});
