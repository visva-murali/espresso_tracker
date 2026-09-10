// supabase/functions/analyze-shot/types.ts

export type ShotRow = {
  id: string;
  user_id: string;
  grind_setting: string;
  dose_g: number;
  yield_g: number;
  pull_time_s: number;
  bean_name: string | null;
  roast_date: string | null;
  rating: number | null;
  tasting_note: string | null;
  created_at: string;
  updated_at: string;
};

export type GroqMessages = { system: string; user: string };

export type GroqResult = { diagnosis: string; adjustment: string };

export type AnalysisRow = {
  shot_id: string;
  user_id: string;
  diagnosis: string;
  adjustment: string;
  model: string;
  history_count: number;
};

export type Result = { status: number; body: unknown };

export type Deps = {
  model: string;
  getShot: (shotId: string) => Promise<ShotRow | null>;
  getPriorShots: (shot: ShotRow, opts: { mixedBeans: boolean }) => Promise<ShotRow[]>;
  getBagTarget: (
    shot: ShotRow
  ) => Promise<{ ratio: number | null; pullTime: [number, number] | null } | null>;
  callGroq: (messages: GroqMessages) => Promise<GroqResult>;
  saveAnalysis: (row: AnalysisRow) => Promise<Record<string, unknown>>;
};

export class GroqError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'GroqError';
    this.status = status;
  }
}
