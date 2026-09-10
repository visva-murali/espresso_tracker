// supabase/functions/analyze-shot/orchestrator.ts
import { buildPrompt } from './prompt.ts';
import { GroqError } from './types.ts';
import type { Deps, Result, GroqResult, AnalysisRow } from './types.ts';

const MAX_TEXT = 600;

function isValidGroqResult(value: unknown): value is GroqResult {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.diagnosis === 'string' &&
    typeof r.adjustment === 'string' &&
    r.diagnosis.trim().length > 0 &&
    r.adjustment.trim().length > 0 &&
    r.diagnosis.length <= MAX_TEXT &&
    r.adjustment.length <= MAX_TEXT
  );
}

export async function runAnalysis(deps: Deps, input: { shotId: string }): Promise<Result> {
  const shot = await deps.getShot(input.shotId);
  if (!shot) {
    return { status: 404, body: { error: 'Shot not found.' } };
  }

  if (shot.dose_g <= 0 || shot.yield_g <= 0) {
    return { status: 422, body: { error: "This shot's numbers can't be analyzed." } };
  }

  const mixedBeans = shot.bean_name == null && shot.roast_date == null;
  const priorShots = await deps.getPriorShots(shot, { mixedBeans });
  const targetRatio = await deps.getBagTarget(shot);
  const messages = buildPrompt(shot, priorShots, { mixedBeans, targetRatio });

  let groqResult: GroqResult;
  try {
    groqResult = await deps.callGroq(messages);
  } catch (err) {
    const status = err instanceof GroqError ? err.status : 502;
    return { status, body: { error: 'The assistant is unavailable right now. Try again.' } };
  }

  if (!isValidGroqResult(groqResult)) {
    return { status: 502, body: { error: 'The assistant returned an unexpected response.' } };
  }

  const row: AnalysisRow = {
    shot_id: shot.id,
    user_id: shot.user_id,
    diagnosis: groqResult.diagnosis.trim(),
    adjustment: groqResult.adjustment.trim(),
    model: deps.model,
    history_count: priorShots.length,
  };

  const saved = await deps.saveAnalysis(row);
  return { status: 200, body: saved };
}
