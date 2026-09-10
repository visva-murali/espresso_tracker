import { describe, it, expect, vi } from 'vitest';
import { runAnalysis } from './orchestrator';
import { GroqError } from './types';
import type { Deps, ShotRow } from './types';

function makeShot(overrides: Partial<ShotRow>): ShotRow {
  return {
    id: 'shot-1',
    user_id: 'user-1',
    grind_setting: '18.0',
    dose_g: 18,
    yield_g: 36,
    pull_time_s: 28,
    bean_name: 'Kenya',
    roast_date: '2026-08-23',
    rating: null,
    tasting_note: null,
    created_at: '2026-09-04T07:42:00Z',
    updated_at: '2026-09-04T07:42:00Z',
    ...overrides,
  };
}

function makeDeps(overrides: Partial<Deps>): Deps {
  return {
    model: 'test-model',
    getShot: vi.fn().mockResolvedValue(makeShot({})),
    getPriorShots: vi.fn().mockResolvedValue([]),
    getBagTarget: vi.fn().mockResolvedValue(null),
    callGroq: vi.fn().mockResolvedValue({ diagnosis: 'running fast', adjustment: 'grind finer' }),
    saveAnalysis: vi.fn().mockImplementation(async (row) => ({ id: 'analysis-1', ...row })),
    ...overrides,
  };
}

describe('runAnalysis', () => {
  it('returns 404 when the shot is not found', async () => {
    const deps = makeDeps({ getShot: vi.fn().mockResolvedValue(null) });
    const res = await runAnalysis(deps, { shotId: 'missing' });
    expect(res.status).toBe(404);
    expect(deps.callGroq).not.toHaveBeenCalled();
  });

  it('returns 422 when yield_g is zero', async () => {
    const deps = makeDeps({ getShot: vi.fn().mockResolvedValue(makeShot({ yield_g: 0 })) });
    const res = await runAnalysis(deps, { shotId: 'shot-1' });
    expect(res.status).toBe(422);
    expect(deps.callGroq).not.toHaveBeenCalled();
  });

  it('asks getPriorShots for same-bag history when the shot has a bean', async () => {
    const deps = makeDeps({});
    await runAnalysis(deps, { shotId: 'shot-1' });
    expect(deps.getPriorShots).toHaveBeenCalledWith(expect.objectContaining({ id: 'shot-1' }), {
      mixedBeans: false,
    });
  });

  it('uses the mixedBeans path when the shot has no bean_name and no roast_date', async () => {
    const deps = makeDeps({
      getShot: vi.fn().mockResolvedValue(makeShot({ bean_name: null, roast_date: null })),
    });
    await runAnalysis(deps, { shotId: 'shot-1' });
    expect(deps.getPriorShots).toHaveBeenCalledWith(expect.anything(), { mixedBeans: true });
  });

  it('resolves the bag target for the shot and passes ratio + range into the prompt', async () => {
    const deps = makeDeps({
      getBagTarget: vi.fn().mockResolvedValue({ ratio: 2, pullTime: [26, 31] }),
    });
    await runAnalysis(deps, { shotId: 'shot-1' });
    const messages = (deps.callGroq as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(messages.user).toContain('target ratio 1:2.00');
    expect(messages.user).toContain('target pull time 26-31s');
  });

  it('tells the model no target is set when getBagTarget returns null', async () => {
    const deps = makeDeps({ getBagTarget: vi.fn().mockResolvedValue(null) });
    await runAnalysis(deps, { shotId: 'shot-1' });
    const messages = (deps.callGroq as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(messages.user).toContain('target: none set for this bag');
  });

  it('records history_count from the prior shots returned', async () => {
    const priors = Array.from({ length: 8 }, (_, i) => makeShot({ id: `p${i}` }));
    const deps = makeDeps({ getPriorShots: vi.fn().mockResolvedValue(priors) });
    const res = await runAnalysis(deps, { shotId: 'shot-1' });
    expect(deps.saveAnalysis).toHaveBeenCalledWith(expect.objectContaining({ history_count: 8 }));
    expect((res.body as { history_count: number }).history_count).toBe(8);
  });

  it('maps a GroqError(429) to status 429', async () => {
    const deps = makeDeps({
      callGroq: vi.fn().mockRejectedValue(new GroqError(429, 'rate limited')),
    });
    const res = await runAnalysis(deps, { shotId: 'shot-1' });
    expect(res.status).toBe(429);
    expect(deps.saveAnalysis).not.toHaveBeenCalled();
  });

  it('maps any other Groq failure to 502', async () => {
    const deps = makeDeps({ callGroq: vi.fn().mockRejectedValue(new Error('network')) });
    const res = await runAnalysis(deps, { shotId: 'shot-1' });
    expect(res.status).toBe(502);
  });

  it('returns 502 when the Groq result is missing a field', async () => {
    const deps = makeDeps({ callGroq: vi.fn().mockResolvedValue({ diagnosis: 'x' }) });
    const res = await runAnalysis(deps, { shotId: 'shot-1' });
    expect(res.status).toBe(502);
    expect(deps.saveAnalysis).not.toHaveBeenCalled();
  });

  it('returns 502 when a Groq field is longer than the sanity cap', async () => {
    const deps = makeDeps({
      callGroq: vi.fn().mockResolvedValue({ diagnosis: 'a'.repeat(601), adjustment: 'ok' }),
    });
    const res = await runAnalysis(deps, { shotId: 'shot-1' });
    expect(res.status).toBe(502);
  });

  it('saves the trimmed analysis and returns it on the happy path', async () => {
    const deps = makeDeps({
      callGroq: vi.fn().mockResolvedValue({ diagnosis: '  running fast  ', adjustment: 'grind finer' }),
    });
    const res = await runAnalysis(deps, { shotId: 'shot-1' });
    expect(res.status).toBe(200);
    expect(deps.saveAnalysis).toHaveBeenCalledWith({
      shot_id: 'shot-1',
      user_id: 'user-1',
      diagnosis: 'running fast',
      adjustment: 'grind finer',
      model: 'test-model',
      history_count: 0,
    });
    expect((res.body as { id: string }).id).toBe('analysis-1');
  });
});
