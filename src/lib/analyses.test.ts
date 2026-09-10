import { describe, it, expect, vi, beforeEach } from 'vitest';
import { analyzeShot, AnalyzeError } from './analyses';
import { supabase } from './supabaseClient';

vi.mock('./supabaseClient', () => ({
  supabase: { functions: { invoke: vi.fn() } },
}));

const invoke = vi.mocked(supabase.functions.invoke);

function httpError(status: number, bodyJson: unknown) {
  return {
    name: 'FunctionsHttpError',
    context: { status, json: async () => bodyJson },
  };
}

beforeEach(() => {
  invoke.mockReset();
});

describe('analyzeShot', () => {
  it('returns the row on success', async () => {
    const row = { id: 'a1', shot_id: 's1', diagnosis: 'd', adjustment: 'x' };
    invoke.mockResolvedValue({ data: row, error: null } as never);
    await expect(analyzeShot('s1')).resolves.toEqual(row);
    expect(invoke).toHaveBeenCalledWith('analyze-shot', { body: { shot_id: 's1' } });
  });

  it('throws AnalyzeError with the status and server message on 422', async () => {
    invoke.mockResolvedValue({
      data: null,
      error: httpError(422, { error: "This shot's numbers can't be analyzed." }),
    } as never);
    await expect(analyzeShot('s1')).rejects.toMatchObject({
      status: 422,
      message: "This shot's numbers can't be analyzed.",
    });
    await expect(analyzeShot('s1')).rejects.toBeInstanceOf(AnalyzeError);
  });

  it('maps 429 and 502 to AnalyzeError with that status', async () => {
    invoke.mockResolvedValue({ data: null, error: httpError(429, {}) } as never);
    await expect(analyzeShot('s1')).rejects.toMatchObject({ status: 429 });

    invoke.mockResolvedValue({ data: null, error: httpError(502, {}) } as never);
    await expect(analyzeShot('s1')).rejects.toMatchObject({ status: 502 });
  });

  it('falls back to status 0 and a generic message when there is no context', async () => {
    invoke.mockResolvedValue({ data: null, error: { name: 'FunctionsFetchError' } } as never);
    await expect(analyzeShot('s1')).rejects.toMatchObject({ status: 0 });
  });
});
