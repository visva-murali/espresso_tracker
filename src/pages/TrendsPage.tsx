// src/pages/TrendsPage.tsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listShots, type Shot } from '../lib/shots';
import {
  groupShotsByBag,
  ratio,
  sameBag,
  bagLabel,
  targetForBag,
  pullTimeRangeForBag,
  type Bag,
} from '../lib/shotView';
import { listBagTargets, type BagTarget } from '../lib/bagTargets';
import { scaleLinear, medianOf, niceDomain, ratioDomain } from '../lib/chartScale';
import { BagSelector } from '../components/BagSelector';
import { LoadingBar } from '../components/LoadingBar';

// Below this many shots on a bag, a "trend" is mostly noise: the pull-time
// chart drops its connecting line and the page shows an "early days" note.
const MIN_SHOTS_FOR_TREND = 4;

const KICKER_STYLE = {
  fontSize: '11px',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  opacity: 0.55,
} as const;

const CAPTION_STYLE = { fontSize: '12.5px', opacity: 0.7 } as const;

const TICK_STYLE = {
  fontFamily: 'var(--font-body)',
  fontSize: '10px',
  fill: 'var(--color-neutral-600)',
} as const;

function RatioOverTimeChart({
  shots,
  targetRatio,
}: {
  shots: Shot[];
  targetRatio: number | null;
}) {
  const times = shots.map((s) => s.pull_time_s);
  const ratios = shots.map((s) => ratio(s));

  // Pad the time axis so points never stack on the edge. For the ratio axis,
  // center a fixed window on the target when one is set so the goal line sits
  // mid-plot and normal scatter reads as a small cluster, not a dramatic
  // spread; with no target, fall back to a wide domain around the shots.
  const [xLo, xHi] = niceDomain(times, 4);
  const [yLo, yHi] = ratioDomain(ratios, targetRatio);
  const x = scaleLinear(xLo, xHi, 40, 328);
  const y = scaleLinear(yLo, yHi, 158, 18);

  return (
    <svg viewBox="0 0 340 190" width="100%" style={{ overflow: 'visible' }}>
      <line x1="40" y1="158" x2="328" y2="158" stroke="var(--color-divider)" />
      <line x1="40" y1="18" x2="40" y2="158" stroke="var(--color-divider)" />

      {targetRatio != null && (
        <>
          <line
            x1="40"
            y1={y(targetRatio)}
            x2="328"
            y2={y(targetRatio)}
            stroke="var(--color-accent-300)"
            strokeDasharray="4 3"
          />
          <text
            className="num"
            x="4"
            y={y(targetRatio) + 3}
            style={{ ...TICK_STYLE, fill: 'var(--color-accent)' }}
          >
            1:{targetRatio.toFixed(1)}
          </text>
        </>
      )}

      {shots.map((shot, i) => (
        <circle
          key={shot.id}
          cx={x(shot.pull_time_s)}
          cy={y(ratio(shot))}
          r={i === 0 ? 4.5 : 4}
          fill={i === 0 ? 'var(--color-accent)' : 'none'}
          stroke={i === 0 ? 'none' : 'var(--color-neutral-600)'}
        />
      ))}

      <text className="num" x="4" y="16" style={TICK_STYLE}>
        {yHi.toFixed(1)}
      </text>
      <text x="4" y="30" style={{ ...TICK_STYLE, fontSize: '8.5px', letterSpacing: '0.08em' }}>
        RATIO
      </text>
      <text className="num" x="4" y="160" style={TICK_STYLE}>
        {yLo.toFixed(1)}
      </text>
      <text className="num" x="40" y="176" style={TICK_STYLE}>
        {Math.round(xLo)}s
      </text>
      <text className="num" x="328" y="176" textAnchor="end" style={TICK_STYLE}>
        {Math.round(xHi)}s
      </text>
    </svg>
  );
}

function PullTimeConsistencyChart({
  shots,
  range,
}: {
  shots: Shot[];
  range: [number, number] | null;
}) {
  const recent = [...shots].slice(0, 14).reverse();
  const times = recent.map((s) => s.pull_time_s);
  const median = medianOf(times);
  const x = scaleLinear(0, Math.max(recent.length - 1, 1), 18, 322);
  // Extend the domain to include the range so the band is never clipped.
  const lo = Math.min(...times, ...(range ?? [])) - 2;
  const hi = Math.max(...times, ...(range ?? [])) + 2;
  const y = scaleLinear(lo, hi, 100, 10);

  // Below the trend threshold a connecting line reads as a confident slope
  // through two or three points. Show the shots as bare dots instead.
  const showLine = recent.length >= MIN_SHOTS_FOR_TREND;
  const points = recent.map((s, i) => `${x(i)},${y(s.pull_time_s)}`).join(' ');
  const lastIndex = recent.length - 1;

  return (
    <svg viewBox="0 0 340 120" width="100%">
      {range ? (
        <>
          <rect
            data-band="target"
            x="10"
            y={y(range[1])}
            width="320"
            height={y(range[0]) - y(range[1])}
            fill="var(--color-accent-100)"
          />
          <text className="num" x="10" y={y(range[1]) - 3} style={TICK_STYLE}>
            {range[0]}-{range[1]}s
          </text>
        </>
      ) : (
        <rect
          x="10"
          y={y(median + 1)}
          width="320"
          height={y(median - 1) - y(median + 1)}
          fill="var(--color-accent-100)"
        />
      )}
      <line x1="10" y1={y(median)} x2="330" y2={y(median)} stroke="var(--color-accent-300)" />

      {showLine && (
        <>
          <polyline points={points} fill="none" stroke="var(--color-neutral-800)" strokeWidth="1.4" />
          {recent.length > 0 && (
            <circle cx={x(lastIndex)} cy={y(recent[lastIndex].pull_time_s)} r="3.5" fill="var(--color-accent)" />
          )}
        </>
      )}

      {!showLine &&
        recent.map((s, i) => (
          <circle
            key={s.id}
            cx={x(i)}
            cy={y(s.pull_time_s)}
            r={i === lastIndex ? 4 : 3.5}
            fill={i === lastIndex ? 'var(--color-accent)' : 'none'}
            stroke={i === lastIndex ? 'none' : 'var(--color-neutral-600)'}
          />
        ))}
    </svg>
  );
}

function RatingByShotChart({ shots }: { shots: Shot[] }) {
  const rated = [...shots].reverse().filter((s) => s.rating != null) as (Shot & { rating: number })[];

  // Lay bars out in equal slots across the plot, each bar a fraction of its
  // slot and capped, so a handful of ratings do not blow up into giant bars
  // that hang off both edges of the chart.
  const slot = 300 / Math.max(rated.length, 1);
  const barWidth = Math.min(slot * 0.6, 30);
  const x = (i: number) => 20 + slot * (i + 0.5);
  const y = scaleLinear(0, 5, 90, 10);

  return (
    <svg viewBox="0 0 340 110" width="100%">
      <line x1="20" y1="90" x2="320" y2="90" stroke="var(--color-divider)" />
      {rated.map((shot, i) => (
        <rect
          key={shot.id}
          x={x(i) - barWidth / 2}
          y={y(shot.rating)}
          width={barWidth}
          height={90 - y(shot.rating)}
          fill="none"
          stroke={i >= rated.length - 2 ? 'var(--color-accent)' : 'var(--color-neutral-600)'}
        />
      ))}
    </svg>
  );
}

function BagTrends({
  bag,
  targetRatio,
  pullTimeRange,
}: {
  bag: Bag;
  targetRatio: number | null;
  pullTimeRange: [number, number] | null;
}) {
  const shots = bag.shots;
  const recentTimes = shots.slice(0, 14).map((s) => s.pull_time_s);
  const medianTime = Math.round(medianOf(recentTimes));
  const early = shots.length < MIN_SHOTS_FOR_TREND;

  return (
    <div className="flex flex-col" style={{ gap: 'var(--space-6)', padding: 'var(--space-4)' }}>
      {early && (
        <p style={{ ...CAPTION_STYLE, opacity: 0.55 }}>
          {shots.length} {shots.length === 1 ? 'shot' : 'shots'} on this bag so far - patterns get clearer with a
          few more.
        </p>
      )}
      <div>
        <div className="num" style={KICKER_STYLE}>
          Ratio against time
        </div>
        <p style={CAPTION_STYLE}>Is a longer pull pulling wetter or drier?</p>
        <RatioOverTimeChart shots={shots} targetRatio={targetRatio} />
      </div>
      <div>
        <div className="num" style={KICKER_STYLE}>
          Pull time consistency
        </div>
        <p style={CAPTION_STYLE}>
          Last {recentTimes.length} {recentTimes.length === 1 ? 'shot' : 'shots'} against your median of {medianTime}s.
        </p>
        <PullTimeConsistencyChart shots={shots} range={pullTimeRange} />
      </div>
      <div>
        <div className="num" style={KICKER_STYLE}>
          Rating by shot on this bag
        </div>
        <p style={CAPTION_STYLE}>Is this bag trending better or worse?</p>
        <RatingByShotChart shots={shots} />
      </div>
    </div>
  );
}

export function TrendsPage() {
  const [bags, setBags] = useState<Bag[]>([]);
  const [selectedBag, setSelectedBag] = useState<Bag | null>(null);
  const [bagTargets, setBagTargets] = useState<BagTarget[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    listShots()
      .then((shots) => {
        const grouped = groupShotsByBag(shots);
        setBags(grouped);
        setSelectedBag(grouped[0] ?? null);
      })
      .finally(() => setLoaded(true));
    listBagTargets()
      .then(setBagTargets)
      .catch(() => setBagTargets([]));
  }, []);

  return (
    <div className="max-w-md mx-auto">
      <header
        className="flex justify-between items-center border-b border-[var(--color-divider)]"
        style={{ padding: 'var(--space-3) var(--space-4)' }}
      >
        <Link
          to="/"
          className="rounded-[var(--radius-sm)] px-1 py-0.5 hover:bg-[var(--color-accent-100)] active:bg-[var(--color-accent-200)]"
          style={{ color: 'var(--color-accent)' }}
        >
          Shots
        </Link>
        <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: '19px' }}>
          Trends
        </h1>
        {bags.length > 1 ? (
          <BagSelector
            bags={bags}
            selected={selectedBag}
            onSelect={(bag) => {
              const match = bags.find((b) => sameBag(b, bag));
              if (match) setSelectedBag(match);
            }}
            label={selectedBag ? bagLabel(selectedBag) : 'Select bag'}
          />
        ) : (
          <span aria-hidden style={{ display: 'inline-block', width: '2.75rem' }} />
        )}
      </header>

      {!loaded ? (
        <LoadingBar />
      ) : !selectedBag || selectedBag.shots.length === 0 ? (
        <p style={{ padding: 'var(--space-4)' }}>No shots logged yet.</p>
      ) : (
        <BagTrends
          bag={selectedBag}
          targetRatio={targetForBag(bagTargets, selectedBag)}
          pullTimeRange={pullTimeRangeForBag(bagTargets, selectedBag)}
        />
      )}
    </div>
  );
}
