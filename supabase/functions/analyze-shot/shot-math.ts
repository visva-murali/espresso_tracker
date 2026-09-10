// supabase/functions/analyze-shot/shot-math.ts
//
// Deno copy of ratio() and daysSinceRoast() from src/lib/shotView.ts.
// This function runs in Deno and cannot import from src/, so the two
// formulas are kept in sync by hand. If you change one, change the
// other (src/lib/shotView.ts).

const MS_PER_DAY = 1000 * 60 * 60 * 24;

export function ratio(shot: { dose_g: number; yield_g: number }): number {
  return shot.yield_g / shot.dose_g;
}

export function daysSinceRoast(roastDate: string, now: Date = new Date()): number {
  const roast = new Date(roastDate);
  return Math.floor((now.getTime() - roast.getTime()) / MS_PER_DAY);
}
