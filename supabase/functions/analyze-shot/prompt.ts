// supabase/functions/analyze-shot/prompt.ts
import { ratio, daysSinceRoast } from './shot-math.ts';
import type { ShotRow, GroqMessages } from './types.ts';

const MS_PER_DAY = 1000 * 60 * 60 * 24;

const SYSTEM = [
  'You are an espresso dial-in assistant. You are given one shot, the recent shots before it on',
  'the same bag, the target brew ratio for the bag (or "none set"), and, when a previous shot',
  'exists, the exact changes from it. Reason only from these numbers: dose, yield, ratio',
  '(yield/dose), pull time, grind, ratings, tasting notes.',
  '',
  'The target ratio is the user\'s stated intent - judge the shot against it, do not infer a',
  'different goal from history. Use prior shots only for trend. With no target, reason from the',
  'numbers and trend alone.',
  '',
  'Use the "Change from the previous shot" line exactly as given; never describe a change in the',
  'direction opposite to what it states. Do not attribute a change to a variable that did not',
  'move: at the same grind and dose, a few grams of yield or a few seconds of time is ordinary',
  'pull-to-pull variance (distribution, tamp, channeling), not a grind or dose effect.',
  '',
  'Levers: grind does not set yield or ratio directly - yield is where you stop the shot, and',
  'ratio is yield over dose. To move a ratio that is a little off while the pull time is fine,',
  'change yield (stop earlier for less, later for more), not grind. To move the pull time, adjust',
  'grind: finer is slower and longer, coarser is faster and shorter. Reach for grind only for a',
  'pull-time miss or a clear sour/bitter imbalance. More dose lowers the ratio at a fixed yield',
  'and adds body.',
  '',
  'Call a shot over- or under-extracted only from a tasting note (bitter or harsh = over, sour or',
  'thin = under) or a ratio more than about 0.1 off target. A ratio within about 0.1 of target is',
  'on target, not over- or under-extracted.',
  '',
  'Give the diagnosis, then exactly one of:',
  '- one adjustment for the next shot: change one variable only, and name the value it should',
  '  move toward; or',
  '- if the ratio is within about 0.1 of target (or, with no target, stable across recent shots),',
  '  the pull time is inside the target range (or, with no range, in a sensible 25-32s band and',
  '  steady), and no rating or note flags a problem: say the shot is dialed and the adjustment is',
  '  to repeat it unchanged. A pull time that moved a few seconds from the last shot at the same',
  '  grind and dose does not disqualify this - note it as consistency to watch.',
  '',
  'If there are two or fewer prior shots on the bag, open the diagnosis by saying the signal is',
  'limited. Be concrete and terse, one or two sentences each, no line breaks. Do not hedge with',
  'multiple options. Do not discuss equipment, water, or beans you were not told about.',
  '',
  'Respond only as JSON: {"diagnosis": "...", "adjustment": "..."}.',
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

function targetLine(
  shot: ShotRow,
  targetRatio: number | null,
  pullTimeRange: [number, number] | null
): string {
  const clauses: string[] = [];
  if (targetRatio != null) {
    clauses.push(
      `target ratio 1:${targetRatio.toFixed(2)} (this shot is ${fmtSigned(ratio(shot) - targetRatio)})`
    );
  }
  if (pullTimeRange != null) {
    const [low, high] = pullTimeRange;
    const t = Math.round(shot.pull_time_s);
    const pos = t < low ? `${t - low}s under` : t > high ? `+${t - high}s over` : 'in range';
    clauses.push(`target pull time ${low}-${high}s (this shot ${t}s, ${pos})`);
  }
  return clauses.length ? `  ${clauses.join('; ')}` : '  target: none set for this bag';
}

function currentShotBlock(
  shot: ShotRow,
  targetRatio: number | null,
  pullTimeRange: [number, number] | null
): string {
  const when = new Date(shot.created_at).toISOString().slice(0, 16).replace('T', ' ');
  const lines = [
    `Shot being analyzed (${when} UTC):`,
    `  grind ${shot.grind_setting} | dose ${shot.dose_g}g | yield ${shot.yield_g}g | ` +
      `${fmtRatio(shot)} | ${Math.round(shot.pull_time_s)}s | ${ratingPart(shot)}`,
    targetLine(shot, targetRatio, pullTimeRange),
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

const NUMERIC_RE = /^-?\d+(\.\d+)?$/;

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function signed1(n: number): string {
  const r = round1(n);
  return `${r >= 0 ? '+' : '-'}${Math.abs(r).toFixed(1)}`;
}

// The exact changes from the immediately-previous shot on the bag, so the
// model does not have to compute (and sometimes miscompute) them. Mirrors
// deltas() in src/lib/shotView.ts for grind / dose / yield / time, plus a
// rating delta. Only rendered same-bag with a previous shot present.
function changeFromPreviousLine(current: ShotRow, previous: ShotRow): string {
  const grindPart =
    NUMERIC_RE.test(current.grind_setting) && NUMERIC_RE.test(previous.grind_setting)
      ? (() => {
          const d = round1(parseFloat(current.grind_setting) - parseFloat(previous.grind_setting));
          return d === 0 ? 'grind unchanged' : `grind ${signed1(d)}`;
        })()
      : current.grind_setting === previous.grind_setting
        ? 'grind unchanged'
        : `grind "${previous.grind_setting}" -> "${current.grind_setting}"`;

  const parts = [
    grindPart,
    `dose ${signed1(current.dose_g - previous.dose_g)}g`,
    `yield ${signed1(current.yield_g - previous.yield_g)}g`,
    `time ${current.pull_time_s - previous.pull_time_s >= 0 ? '+' : '-'}${Math.abs(
      Math.round(current.pull_time_s - previous.pull_time_s)
    )}s`,
  ];
  if (current.rating != null && previous.rating != null) {
    const d = current.rating - previous.rating;
    parts.push(d === 0 ? 'rating unchanged' : `rating ${d > 0 ? '+' : '-'}${Math.abs(d)}`);
  }
  return `Change from the previous shot: ${parts.join(', ')}`;
}

export function buildPrompt(
  shot: ShotRow,
  priorShots: ShotRow[],
  opts: {
    mixedBeans: boolean;
    targetRatio: number | null;
    pullTimeRange: [number, number] | null;
  },
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

  const changeLine =
    !opts.mixedBeans && priorShots.length > 0
      ? ['', changeFromPreviousLine(shot, priorShots[0])]
      : [];

  const user = [
    beanLine,
    '',
    currentShotBlock(shot, opts.targetRatio, opts.pullTimeRange),
    ...changeLine,
    '',
    historyBlock,
  ].join('\n');
  return { system: SYSTEM, user };
}
