// supabase/functions/analyze-shot/prompt.ts
import { ratio, daysSinceRoast } from './shot-math.ts';
import type { ShotRow, GroqMessages } from './types.ts';

const MS_PER_DAY = 1000 * 60 * 60 * 24;

const SYSTEM = [
  'You are an espresso dial-in assistant. You are given one espresso shot and the recent shots',
  'that came before it on the same bag. Reason only from the numbers provided: dose, yield, ratio',
  '(yield/dose), pull time, grind setting, and any ratings or tasting notes. Diagnose what the',
  'current shot\'s numbers indicate about extraction (fast or slow, under- or over-extracted, ratio',
  'high or low), using the trend across prior shots when it is informative. Then give exactly one',
  'adjustment for the next shot: change one variable only, and say what target it should move',
  'toward. If there are two or fewer prior shots on the bag, open the diagnosis by saying the',
  'signal is limited. Be concrete and terse. Do not hedge with multiple options. Do not discuss',
  'equipment, water, or beans you were not told about.',
  '',
  'Respond only as JSON: {"diagnosis": "...", "adjustment": "..."}. Each value is one or two',
  'sentences with no line breaks.',
].join(' ');

function fmtRatio(shot: ShotRow): string {
  return `1:${ratio(shot).toFixed(2)}`;
}

function ratingPart(shot: ShotRow): string {
  return shot.rating != null ? `rating ${shot.rating}/5` : '(no rating)';
}

function currentShotBlock(shot: ShotRow): string {
  const when = new Date(shot.created_at).toISOString().slice(0, 16).replace('T', ' ');
  const lines = [
    `Shot being analyzed (${when} UTC):`,
    `  grind ${shot.grind_setting} | dose ${shot.dose_g}g | yield ${shot.yield_g}g | ` +
      `${fmtRatio(shot)} | ${Math.round(shot.pull_time_s)}s | ${ratingPart(shot)}`,
  ];
  if (shot.tasting_note) lines.push(`  note: "${shot.tasting_note}"`);
  return lines.join('\n');
}

function relativeDayLabel(prior: ShotRow, current: ShotRow): string {
  // Math.floor to match daysSinceRoast in shot-math.ts, so the prompt
  // reports elapsed days one consistent way.
  const days = Math.floor(
    (new Date(current.created_at).getTime() - new Date(prior.created_at).getTime()) / MS_PER_DAY
  );
  if (days <= 0) return 'same day';
  return days === 1 ? '1 day earlier' : `${days} days earlier`;
}

function priorShotLine(prior: ShotRow, current: ShotRow): string {
  return (
    `  ${relativeDayLabel(prior, current)}: grind ${prior.grind_setting} | ` +
    `${prior.dose_g}g -> ${prior.yield_g}g | ${fmtRatio(prior)} | ` +
    `${Math.round(prior.pull_time_s)}s | ${ratingPart(prior)}`
  );
}

export function buildPrompt(
  shot: ShotRow,
  priorShots: ShotRow[],
  opts: { mixedBeans: boolean },
  now: Date = new Date()
): GroqMessages {
  const beanLine =
    opts.mixedBeans || (shot.bean_name == null && shot.roast_date == null)
      ? 'Bean: not recorded'
      : `Bean: ${shot.bean_name ?? 'unlabeled'}` +
        (shot.roast_date
          ? `, roasted ${shot.roast_date} (${daysSinceRoast(shot.roast_date, now)} days off roast)`
          : '');

  const historyHeader = opts.mixedBeans
    ? 'Recent shots (may be different beans, newest first):'
    : 'Prior shots on this bag (newest first):';

  const historyBlock =
    priorShots.length === 0
      ? opts.mixedBeans
        ? 'No recent shots.'
        : 'No prior shots on this bag.'
      : [historyHeader, ...priorShots.map((p) => priorShotLine(p, shot))].join('\n');

  const user = [beanLine, '', currentShotBlock(shot), '', historyBlock].join('\n');
  return { system: SYSTEM, user };
}
