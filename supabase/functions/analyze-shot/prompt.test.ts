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
    const { system } = buildPrompt(makeShot({}), [], { mixedBeans: false, targetRatio: null, pullTimeRange: null }, NOW);
    expect(system).toContain('espresso dial-in assistant');
    expect(system).toContain('{"diagnosis"');
  });

  it('renders the bean line with days off roast', () => {
    const { user } = buildPrompt(makeShot({}), [], { mixedBeans: false, targetRatio: null, pullTimeRange: null }, NOW);
    expect(user).toContain('Bean: Kenya Nyeri AA, roasted 2026-08-23 (12 days off roast)');
  });

  it('renders ratio and time as finished numbers and grind verbatim', () => {
    const { user } = buildPrompt(
      makeShot({ grind_setting: "2 o'clock", dose_g: 18, yield_g: 41.4, pull_time_s: 32 }),
      [],
      { mixedBeans: false, targetRatio: null, pullTimeRange: null },
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
      { mixedBeans: false, targetRatio: null, pullTimeRange: null },
      NOW
    );
    expect(user).not.toContain('null');
    expect(user).not.toContain('note:');
  });

  it('says there are no prior shots when the history is empty', () => {
    const { user } = buildPrompt(makeShot({}), [], { mixedBeans: false, targetRatio: null, pullTimeRange: null }, NOW);
    expect(user).toContain('No prior shots on this bag.');
  });

  it('lists prior shots newest first with a relative-day label', () => {
    const prior = [
      makeShot({ id: 'p1', created_at: '2026-09-03T07:42:00Z', yield_g: 37.4, pull_time_s: 28, rating: 3 }),
      makeShot({ id: 'p2', created_at: '2026-09-02T07:42:00Z', yield_g: 36.1, pull_time_s: 26, rating: null }),
    ];
    const { user } = buildPrompt(makeShot({}), prior, { mixedBeans: false, targetRatio: null, pullTimeRange: null }, NOW);
    expect(user).toContain('Prior shots on this bag (newest first):');
    expect(user).toContain('1 day earlier:');
    expect(user).toContain('2 days earlier:');
    expect(user).toContain('(no rating)');
  });

  it('floors a partial elapsed day in the relative-day label (matches daysSinceRoast)', () => {
    // 1 day and 14 hours earlier should read as "1 day earlier", not "2 days earlier".
    const prior = [makeShot({ id: 'p1', created_at: '2026-09-02T17:42:00Z' })];
    const { user } = buildPrompt(makeShot({}), prior, { mixedBeans: false, targetRatio: null, pullTimeRange: null }, NOW);
    expect(user).toContain('1 day earlier:');
    expect(user).not.toContain('2 days earlier:');
  });

  it('switches the bean and history lines when mixedBeans is set', () => {
    const { user } = buildPrompt(
      makeShot({ bean_name: null, roast_date: null }),
      [makeShot({ id: 'p1', created_at: '2026-09-03T07:42:00Z' })],
      { mixedBeans: true, targetRatio: null, pullTimeRange: null },
      NOW
    );
    expect(user).toContain('Bean: not recorded');
    expect(user).toContain('Recent shots (may be different beans, newest first):');
  });

  it('renders the target ratio and the signed distance from it when a target is set', () => {
    const { user } = buildPrompt(
      makeShot({ dose_g: 18, yield_g: 37 }), // 1:2.06
      [],
      { mixedBeans: false, targetRatio: 2, pullTimeRange: null },
      NOW
    );
    expect(user).toContain('target ratio 1:2.00 (this shot is +0.06)');
  });

  it('shows a negative distance when the shot is tighter than the target', () => {
    const { user } = buildPrompt(
      makeShot({ dose_g: 18, yield_g: 34.2 }), // 1:1.90
      [],
      { mixedBeans: false, targetRatio: 2, pullTimeRange: null },
      NOW
    );
    expect(user).toContain('target ratio 1:2.00 (this shot is -0.10)');
  });

  it('says no target is set when targetRatio is null', () => {
    const { user } = buildPrompt(makeShot({}), [], { mixedBeans: false, targetRatio: null, pullTimeRange: null }, NOW);
    expect(user).toContain('target: none set for this bag');
    expect(user).not.toContain('target ratio 1:');
  });

  it('system message carries the lever map, the repeat-it path, and the unchanged-variable rule', () => {
    const { system } = buildPrompt(makeShot({}), [], { mixedBeans: false, targetRatio: 2, pullTimeRange: null }, NOW);
    expect(system).toContain('espresso dial-in assistant');
    expect(system).toContain('{"diagnosis"');
    // judges against the target, does not infer intent from history
    expect(system).toMatch(/target.*stated intent|stated intent.*target/i);
    // lever map
    expect(system).toMatch(/yield.*ratio/i);
    // the "you're dialed, repeat it" escape hatch
    expect(system).toMatch(/repeat it/i);
    // do not blame a variable that did not move
    expect(system).toMatch(/did not (change|move)|same as the previous shot/i);
  });

  it('system message tells the model to trust the delta line and not flip its direction', () => {
    const { system } = buildPrompt(makeShot({}), [], { mixedBeans: false, targetRatio: 2, pullTimeRange: null }, NOW);
    expect(system).toMatch(/opposite/i);
    expect(system).toMatch(/consistency to watch/i);
    // over/under-extraction is a taste or large-miss judgment, not a small ratio gap
    expect(system).toMatch(/over- or under-extracted/);
  });

  it('renders a signed change line against the immediately previous shot', () => {
    const prior = [
      makeShot({
        id: 'p1',
        created_at: '2026-09-03T07:42:00Z',
        grind_setting: '15',
        dose_g: 18,
        yield_g: 38,
        pull_time_s: 25,
        rating: 3,
      }),
    ];
    const current = makeShot({
      grind_setting: '15',
      dose_g: 18,
      yield_g: 37,
      pull_time_s: 30,
      rating: 4,
    });
    const { user } = buildPrompt(current, prior, { mixedBeans: false, targetRatio: 2, pullTimeRange: null }, NOW);
    expect(user).toContain(
      'Change from the previous shot: grind unchanged, dose +0.0g, yield -1.0g, time +5s, rating +1'
    );
  });

  it('gives a signed numeric grind delta when both settings are numbers', () => {
    const prior = [makeShot({ id: 'p1', created_at: '2026-09-03T07:42:00Z', grind_setting: '15' })];
    const current = makeShot({ grind_setting: '14' });
    const { user } = buildPrompt(current, prior, { mixedBeans: false, targetRatio: null, pullTimeRange: null }, NOW);
    expect(user).toContain('grind -1.0');
  });

  it('shows the raw grind values when a setting is not numeric', () => {
    const prior = [makeShot({ id: 'p1', created_at: '2026-09-03T07:42:00Z', grind_setting: "3 o'clock" })];
    const current = makeShot({ grind_setting: "2 o'clock" });
    const { user } = buildPrompt(current, prior, { mixedBeans: false, targetRatio: null, pullTimeRange: null }, NOW);
    expect(user).toContain(`grind "3 o'clock" -> "2 o'clock"`);
  });

  it('omits the rating delta when either shot has no rating', () => {
    const prior = [makeShot({ id: 'p1', created_at: '2026-09-03T07:42:00Z', rating: null })];
    const current = makeShot({ rating: 4 });
    const { user } = buildPrompt(current, prior, { mixedBeans: false, targetRatio: null, pullTimeRange: null }, NOW);
    expect(user).toContain('Change from the previous shot:');
    expect(user).not.toMatch(/rating [+-]/);
  });

  it('has no change line when there are no prior shots', () => {
    const { user } = buildPrompt(makeShot({}), [], { mixedBeans: false, targetRatio: null, pullTimeRange: null }, NOW);
    expect(user).not.toContain('Change from the previous shot');
  });

  it('has no change line in the mixedBeans case (previous shot may be a different bag)', () => {
    const prior = [makeShot({ id: 'p1', created_at: '2026-09-03T07:42:00Z' })];
    const { user } = buildPrompt(
      makeShot({ bean_name: null, roast_date: null }),
      prior,
      { mixedBeans: true, targetRatio: null, pullTimeRange: null },
      NOW
    );
    expect(user).not.toContain('Change from the previous shot');
  });

  it('renders the pull-time range clause when a range is set', () => {
    const { user } = buildPrompt(
      makeShot({ pull_time_s: 30 }),
      [],
      { mixedBeans: false, targetRatio: 2, pullTimeRange: [26, 31] },
      NOW
    );
    expect(user).toContain('target pull time 26-31s (this shot 30s, in range)');
  });

  it('shows the shot over the range', () => {
    const { user } = buildPrompt(
      makeShot({ pull_time_s: 34 }),
      [],
      { mixedBeans: false, targetRatio: null, pullTimeRange: [26, 31] },
      NOW
    );
    expect(user).toContain('target pull time 26-31s (this shot 34s, +3s over)');
  });

  it('says none set when neither ratio nor range is given', () => {
    const { user } = buildPrompt(
      makeShot({}),
      [],
      { mixedBeans: false, targetRatio: null, pullTimeRange: null },
      NOW
    );
    expect(user).toContain('target: none set for this bag');
  });

  it('system message says grind does not set yield and pins the lever map', () => {
    const { system } = buildPrompt(
      makeShot({}),
      [],
      { mixedBeans: false, targetRatio: 2, pullTimeRange: [26, 31] },
      NOW
    );
    expect(system).toMatch(/grind does not (set|change) yield/i);
    expect(system).toMatch(/to move the pull time, adjust grind/i);
  });
});
