// src/lib/analyses.ts
import { supabase } from './supabaseClient';

export type ShotAnalysis = {
  id: string;
  shot_id: string;
  user_id: string;
  diagnosis: string;
  adjustment: string;
  model: string;
  history_count: number;
  created_at: string;
  updated_at: string;
};

export class AnalyzeError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'AnalyzeError';
    this.status = status;
  }
}

const GENERIC_MESSAGE = 'The assistant is unavailable right now. Try again.';

export async function getAnalysisForShot(shotId: string): Promise<ShotAnalysis | null> {
  const { data, error } = await supabase
    .from('shot_analyses')
    .select()
    .eq('shot_id', shotId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function analyzeShot(shotId: string): Promise<ShotAnalysis> {
  const { data, error } = await supabase.functions.invoke('analyze-shot', {
    body: { shot_id: shotId },
  });

  if (error) {
    const context = (error as { context?: { status?: number; json?: () => Promise<unknown> } })
      .context;
    const status = context?.status ?? 0;
    let message = GENERIC_MESSAGE;
    try {
      const parsed = (await context?.json?.()) as { error?: string } | undefined;
      if (parsed?.error) message = parsed.error;
    } catch (_err) {
      // keep the generic message
    }
    throw new AnalyzeError(status, message);
  }

  return data as ShotAnalysis;
}
