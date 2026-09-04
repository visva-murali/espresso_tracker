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
