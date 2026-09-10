// supabase/functions/analyze-shot/prompt.ts
import { ratio, daysSinceRoast } from './shot-math.ts';
import type { ShotRow, GroqMessages } from './types.ts';

const MS_PER_DAY = 1000 * 60 * 60 * 24;

const SYSTEM = [
  'You are an espresso dial-in assistant. You are given one espresso shot, the recent shots',
  'before it on the same bag, and the target brew ratio the user is aiming for on this bag',
  '(or "none set"). Reason only from the numbers provided: dose, yield, ratio (yield/dose), pull',
  'time, grind setting, ratings, and tasting notes.',
  '',
  'When a target ratio is set, judge the shot against it: that is the user\'s stated intent, so',
  'do not infer a different goal from the shot history. Use the prior shots only for trend - is',
  'the ratio converging on the target, is the pull time drifting, are ratings improving. When no',
  'target is set, reason from the numbers and the trend alone.',
  '',
  'How the variables move outcomes:',
  '- Grind: finer slows the flow, lengthens the pull, and raises extraction (bitter if too far);',
  '  coarser does the reverse. Reach for grind to fix pull time or a sour/bitter imbalance.',
  '- Yield: the direct lever for ratio. Stop the shot earlier for a lower ratio, later for a',
  '  higher one. Use this for a small ratio correction when the pull time and taste are fine.',
  '- Dose: more dose lowers the ratio at a fixed yield and adds body; less does the reverse.',
  '',
  'Do not attribute a shot-to-shot change to a variable that did not change. If the grind',
  'setting is the same as the previous shot, differences in time or yield are ordinary',
  'pull-to-pull variance (distribution, tamp, channeling), not a grind effect.',
  '',
  'Give the diagnosis, then exactly one of:',
  '- one adjustment for the next shot: change one variable only, and name the value or target it',
  '  should move toward; or',
  '- if the ratio is within about 0.1 of the target (or, with no target, stable across recent',
  '  shots), the pull time is in a sensible range (roughly 25-32s for a straight shot) and steady,',
  '  and no rating or note flags a problem: say the shot is dialed and the adjustment is to',
  '  repeat it unchanged.',
  '',
  'If there are two or fewer prior shots on the bag, open the diagnosis by saying the signal is',
  'limited. Be concrete and terse. Do not hedge with multiple options. Do not discuss equipment,',
  'water, or beans you were not told about.',
  '',
  'Respond only as JSON: {"diagnosis": "...", "adjustment": "..."}. Each value is one or two',
  'sentences with no line breaks.',
].join(' ');

function fmtRatio(shot: ShotRow): string {
  return `1:${ratio(shot).toFixed(2)}`;
}

function fmtSigned(value: number): string {
  const rounded = Number(value.toFixed(2));
  return `${rounded >= 0 ? '+' : '-'}${Math.abs(rounded).toFixed(2)}`;
}

function ratingPart(shot: ShotRow): string {
  return shot.rating != null ? `rating ${shot.rating}/5` : '(no rating)';
}

function targetLine(shot: ShotRow, targetRatio: number | null): string {
  if (targetRatio == null) return '  target ratio: none set for this bag';
  const distance = fmtSigned(ratio(shot) - targetRatio);
  return `  target ratio 1:${targetRatio.toFixed(2)} (this shot is ${distance})`;
}

function currentShotBlock(shot: ShotRow, targetRatio: number | null): string {
  const when = new Date(shot.created_at).toISOString().slice(0, 16).replace('T', ' ');
  const lines = [
    `Shot being analyzed (${when} UTC):`,
    `  grind ${shot.grind_setting} | dose ${shot.dose_g}g | yield ${shot.yield_g}g | ` +
      `${fmtRatio(shot)} | ${Math.round(shot.pull_time_s)}s | ${ratingPart(shot)}`,
    targetLine(shot, targetRatio),
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
  opts: { mixedBeans: boolean; targetRatio: number | null },
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

  const user = [beanLine, '', currentShotBlock(shot, opts.targetRatio), '', historyBlock].join('\n');
  return { system: SYSTEM, user };
}
