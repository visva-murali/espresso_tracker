import { describe, it, expect } from 'vitest';
import { buildPrompt } from './prompt';
import type { ShotRow } from './types';

function makeShot(overrides: Partial<ShotRow>): ShotRow {
  return {
    id: 'shot-1',
    user_id: 'user-1',
    grind_setting: '18.0',
    dose_g: 18,
    yield_g: 41.4,
    pull_time_s: 32,
    bean_name: 'Kenya Nyeri AA',
    roast_date: '2026-08-23',
    rating: 2,
    tasting_note: 'sharp, sour finish',
    created_at: '2026-09-04T07:42:00Z',
    updated_at: '2026-09-04T07:42:00Z',
    ...overrides,
  };
}

const NOW = new Date('2026-09-04T08:00:00Z');

describe('buildPrompt', () => {
  it('puts the fixed rules in the system message', () => {
    const { system } = buildPrompt(makeShot({}), [], { mixedBeans: false }, NOW);
    expect(system).toContain('espresso dial-in assistant');
    expect(system).toContain('{"diagnosis"');
  });

  it('renders the bean line with days off roast', () => {
    const { user } = buildPrompt(makeShot({}), [], { mixedBeans: false }, NOW);
    expect(user).toContain('Bean: Kenya Nyeri AA, roasted 2026-08-23 (12 days off roast)');
  });

  it('renders ratio and time as finished numbers and grind verbatim', () => {
    const { user } = buildPrompt(
      makeShot({ grind_setting: "2 o'clock", dose_g: 18, yield_g: 41.4, pull_time_s: 32 }),
      [],
      { mixedBeans: false },
      NOW
    );
    expect(user).toContain("grind 2 o'clock");
    expect(user).toContain('1:2.30');
    expect(user).toContain('32s');
  });

  it('omits null optional fields rather than printing null', () => {
    const { user } = buildPrompt(
      makeShot({ rating: null, tasting_note: null }),
      [],
      { mixedBeans: false },
      NOW
    );
    expect(user).not.toContain('null');
    expect(user).not.toContain('note:');
  });

  it('says there are no prior shots when the history is empty', () => {
    const { user } = buildPrompt(makeShot({}), [], { mixedBeans: false }, NOW);
    expect(user).toContain('No prior shots on this bag.');
  });

  it('lists prior shots newest first with a relative-day label', () => {
    const prior = [
      makeShot({ id: 'p1', created_at: '2026-09-03T07:42:00Z', yield_g: 37.4, pull_time_s: 28, rating: 3 }),
      makeShot({ id: 'p2', created_at: '2026-09-02T07:42:00Z', yield_g: 36.1, pull_time_s: 26, rating: null }),
    ];
    const { user } = buildPrompt(makeShot({}), prior, { mixedBeans: false }, NOW);
    expect(user).toContain('Prior shots on this bag (newest first):');
    expect(user).toContain('1 day earlier:');
    expect(user).toContain('2 days earlier:');
    expect(user).toContain('(no rating)');
  });

  it('floors a partial elapsed day in the relative-day label (matches daysSinceRoast)', () => {
    // 1 day and 14 hours earlier should read as "1 day earlier", not "2 days earlier".
    const prior = [makeShot({ id: 'p1', created_at: '2026-09-02T17:42:00Z' })];
    const { user } = buildPrompt(makeShot({}), prior, { mixedBeans: false }, NOW);
    expect(user).toContain('1 day earlier:');
    expect(user).not.toContain('2 days earlier:');
  });

  it('switches the bean and history lines when mixedBeans is set', () => {
    const { user } = buildPrompt(
      makeShot({ bean_name: null, roast_date: null }),
      [makeShot({ id: 'p1', created_at: '2026-09-03T07:42:00Z' })],
      { mixedBeans: true },
      NOW
    );
    expect(user).toContain('Bean: not recorded');
    expect(user).toContain('Recent shots (may be different beans, newest first):');
  });
});
