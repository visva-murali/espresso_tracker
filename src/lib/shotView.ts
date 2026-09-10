// src/lib/shotView.ts
import type { Shot } from './shots';
import type { BagTarget } from './bagTargets';
import type { ShotFormValues } from '../components/ShotForm';

export type Bag = {
  bean_name: string | null;
  roast_date: string | null;
  shots: Shot[];
};

export type BagStateValue = 'dialed' | 'dialing' | 'resting' | 'past-peak' | null;

export type ShotDeltas = {
  grind: number | null;
  dose_g: number;
  yield_g: number;
  pull_time_s: number;
};

const DIALED_RATIO_TOLERANCE = 0.15;
const DIALED_TIME_TOLERANCE_S = 2;
const RESTING_MAX_DAYS = 4;
const PAST_PEAK_MIN_DAYS = 28;
const MS_PER_DAY = 1000 * 60 * 60 * 24;

export function bagKey(bag: { bean_name: string | null; roast_date: string | null }): string {
  return `${bag.bean_name ?? ''}|${bag.roast_date ?? ''}`;
}

/** Display name for a bag. v1 bags have no name of their own, so this is the
 * bean name when the user gave one, and a plain "Unlabeled" otherwise. */
export function bagLabel(bag: { bean_name: string | null }): string {
  return bag.bean_name ?? 'Unlabeled';
}

export function sameBag(
  a: { bean_name: string | null; roast_date: string | null },
  b: { bean_name: string | null; roast_date: string | null }
): boolean {
  return bagKey(a) === bagKey(b);
}

/**
 * Groups shots by bean_name + roast_date (there is no bags table in v1).
 * `shots` is assumed newest-first, matching listShots(); bags come back
 * ordered by their most recent shot, and each bag's own shots stay
 * newest-first.
 */
export function groupShotsByBag(shots: Shot[]): Bag[] {
  const bags = new Map<string, Bag>();
  const order: string[] = [];

  for (const shot of shots) {
    const key = bagKey(shot);
    let bag = bags.get(key);
    if (!bag) {
      bag = { bean_name: shot.bean_name, roast_date: shot.roast_date, shots: [] };
      bags.set(key, bag);
      order.push(key);
    }
    bag.shots.push(shot);
  }

  return order.map((key) => bags.get(key)!);
}

// Mirrored in supabase/functions/analyze-shot/shot-math.ts (the Edge
// Function cannot import from src/). Keep both copies in sync.
export function daysSinceRoast(roastDate: string, now: Date = new Date()): number {
  const roast = new Date(roastDate);
  return Math.floor((now.getTime() - roast.getTime()) / MS_PER_DAY);
}

/**
 * See "Assumptions this plan makes where the schema is silent", item 3, in
 * the plan this function was implemented from: exactly one shot always
 * means no tag; roast-date bookends take precedence over any dial-in check
 * when roast_date is known.
 *
 * When `options.targetRatio` is set (the bag has a target ratio), "dialed"
 * requires the last two shots each within DIALED_RATIO_TOLERANCE of that
 * target; otherwise it falls back to shot-to-shot ratio convergence.
 * Likewise `options.pullTimeRange`: when set, both recent shots must land
 * inside the window; otherwise pull times must be within
 * DIALED_TIME_TOLERANCE_S of each other.
 */
export function bagState(
  bagShots: Shot[],
  options: {
    targetRatio?: number | null;
    pullTimeRange?: [number, number] | null;
    now?: Date;
  } = {}
): BagStateValue {
  const { targetRatio = null, pullTimeRange = null, now = new Date() } = options;
  if (bagShots.length <= 1) return null;

  const [latest, previous] = bagShots;

  if (latest.roast_date) {
    const age = daysSinceRoast(latest.roast_date, now);
    if (age > PAST_PEAK_MIN_DAYS) return 'past-peak';
    if (age < RESTING_MAX_DAYS) return 'resting';
  }

  const ratioOk =
    targetRatio != null
      ? Math.abs(ratio(latest) - targetRatio) <= DIALED_RATIO_TOLERANCE &&
        Math.abs(ratio(previous) - targetRatio) <= DIALED_RATIO_TOLERANCE
      : Math.abs(ratio(latest) - ratio(previous)) <= DIALED_RATIO_TOLERANCE;

  const inRange = (s: Shot) =>
    s.pull_time_s >= pullTimeRange![0] && s.pull_time_s <= pullTimeRange![1];
  const timeOk =
    pullTimeRange != null
      ? inRange(latest) && inRange(previous)
      : Math.abs(latest.pull_time_s - previous.pull_time_s) <= DIALED_TIME_TOLERANCE_S;

  return ratioOk && timeOk ? 'dialed' : 'dialing';
}

/** The most recent shot on the bag. v1 has no is_reference flag to star a different one. */
export function referenceShot(bagShots: Shot[]): Shot | null {
  return bagShots[0] ?? null;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function parsedGrindDelta(shot: Shot, previous: Shot): number | null {
  const numericRegex = /^-?\d+(\.\d+)?$/;
  if (!numericRegex.test(shot.grind_setting) || !numericRegex.test(previous.grind_setting)) {
    return null;
  }
  const a = Number.parseFloat(shot.grind_setting);
  const b = Number.parseFloat(previous.grind_setting);
  return Number.isFinite(a) && Number.isFinite(b) ? round1(a - b) : null;
}

export function deltas(shot: Shot, previous: Shot): ShotDeltas {
  return {
    grind: parsedGrindDelta(shot, previous),
    dose_g: round1(shot.dose_g - previous.dose_g),
    yield_g: round1(shot.yield_g - previous.yield_g),
    pull_time_s: Math.round(shot.pull_time_s - previous.pull_time_s),
  };
}

// Mirrored in supabase/functions/analyze-shot/shot-math.ts. Keep in sync.
export function ratio(shot: Pick<Shot, 'dose_g' | 'yield_g'>): number {
  return shot.yield_g / shot.dose_g;
}

/** The target ratio the user set for this bag, or null when the bag has no
 * bag_targets row. Keyed by bean_name + roast_date, the same pairing
 * groupShotsByBag uses. */
export function targetForBag(
  targets: BagTarget[],
  bag: { bean_name: string | null; roast_date: string | null }
): number | null {
  if (!targets || targets.length === 0) return null;
  const key = bagKey(bag);
  const match = targets.find((t) => bagKey(t) === key);
  return match ? match.target_ratio : null;
}

/** Actual brew ratio minus the target. Positive means the shot ran wetter
 * than aimed for, negative tighter. */
export function ratioDelta(
  shot: Pick<Shot, 'dose_g' | 'yield_g'>,
  targetRatio: number
): number {
  return ratio(shot) - targetRatio;
}

/** The pull-time window the user set for this bag, or null when the bag has
 * no window. Keyed by bean_name + roast_date, like targetForBag. */
export function pullTimeRangeForBag(
  targets: BagTarget[],
  bag: { bean_name: string | null; roast_date: string | null }
): [number, number] | null {
  if (!targets || targets.length === 0) return null;
  const key = bagKey(bag);
  const match = targets.find((t) => bagKey(t) === key);
  if (!match || match.target_pull_time_low_s == null || match.target_pull_time_high_s == null) {
    return null;
  }
  return [match.target_pull_time_low_s, match.target_pull_time_high_s];
}

/** Where a pull time sits relative to a target window. `delta` is 0 in
 * range, positive seconds over the high bound, negative seconds under the
 * low bound. Bounds are inclusive. */
export function pullTimeAgainstRange(
  pullTimeS: number,
  range: [number, number]
): { state: 'under' | 'in' | 'over'; delta: number } {
  const [low, high] = range;
  if (pullTimeS < low) return { state: 'under', delta: pullTimeS - low };
  if (pullTimeS > high) return { state: 'over', delta: pullTimeS - high };
  return { state: 'in', delta: 0 };
}

export function formatRatio(value: number): string {
  return `1:${value.toFixed(2)}`;
}

export function toFormValues(shot: Shot): ShotFormValues {
  return {
    grind_setting: shot.grind_setting,
    dose_g: String(shot.dose_g),
    yield_g: String(shot.yield_g),
    pull_time_s: String(shot.pull_time_s),
    bean_name: shot.bean_name ?? '',
    roast_date: shot.roast_date ?? '',
    rating: shot.rating != null ? String(shot.rating) : '',
    tasting_note: shot.tasting_note ?? '',
  };
}
