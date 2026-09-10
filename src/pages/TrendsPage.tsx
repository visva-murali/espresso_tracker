// src/pages/TrendsPage.tsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listShots, type Shot } from '../lib/shots';
import { groupShotsByBag, ratio, sameBag, type Bag } from '../lib/shotView';
import { scaleLinear, medianOf, niceDomain } from '../lib/chartScale';
import { BagSelector } from '../components/BagSelector';

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

function RatioOverTimeChart({ shots }: { shots: Shot[] }) {
  const times = shots.map((s) => s.pull_time_s);
  const ratios = shots.map((s) => ratio(s));

  // Pad the domain (and widen it when every shot landed on the same number)
  // so points never stack on the axis or collapse to a single pixel.
  const [xLo, xHi] = niceDomain(times, 4);
  const [yLo, yHi] = niceDomain(ratios, 0.3);
  const x = scaleLinear(xLo, xHi, 40, 328);
  const y = scaleLinear(yLo, yHi, 158, 18);

  const minTime = Math.round(Math.min(...times));
  const maxTime = Math.round(Math.max(...times));
  const minRatio = Math.min(...ratios);
  const maxRatio = Math.max(...ratios);

  return (
    <svg viewBox="0 0 340 190" width="100%" style={{ overflow: 'visible' }}>
      <line x1="40" y1="158" x2="328" y2="158" stroke="var(--color-divider)" />
      <line x1="40" y1="18" x2="40" y2="158" stroke="var(--color-divider)" />

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
        {maxRatio.toFixed(1)}
      </text>
      <text x="4" y="30" style={{ ...TICK_STYLE, fontSize: '8.5px', letterSpacing: '0.08em' }}>
        RATIO
      </text>
      <text className="num" x="4" y="160" style={TICK_STYLE}>
        {minRatio.toFixed(1)}
      </text>
      <text className="num" x="40" y="176" style={TICK_STYLE}>
        {minTime}s
      </text>
      <text className="num" x="328" y="176" textAnchor="end" style={TICK_STYLE}>
        {maxTime}s
      </text>
    </svg>
  );
}

function PullTimeConsistencyChart({ shots }: { shots: Shot[] }) {
  const recent = [...shots].slice(0, 14).reverse();
  const times = recent.map((s) => s.pull_time_s);
  const median = medianOf(times);
  const x = scaleLinear(0, Math.max(recent.length - 1, 1), 10, 330);
  const y = scaleLinear(Math.min(...times) - 2, Math.max(...times) + 2, 100, 10);

  const points = recent.map((s, i) => `${x(i)},${y(s.pull_time_s)}`).join(' ');

  return (
    <svg viewBox="0 0 340 120" width="100%">
      <rect x="10" y={y(median + 1)} width="320" height={y(median - 1) - y(median + 1)} fill="var(--color-accent-100)" />
      <line x1="10" y1={y(median)} x2="330" y2={y(median)} stroke="var(--color-accent-300)" />
      <polyline points={points} fill="none" stroke="var(--color-neutral-800)" strokeWidth="1.4" />
      {recent.length > 0 && (
        <circle
          cx={x(recent.length - 1)}
          cy={y(recent[recent.length - 1].pull_time_s)}
          r="3.5"
          fill="var(--color-accent)"
        />
      )}
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

function BagTrends({ bag }: { bag: Bag }) {
  const shots = bag.shots;
  const recentTimes = shots.slice(0, 14).map((s) => s.pull_time_s);
  const medianTime = Math.round(medianOf(recentTimes));

  return (
    <div className="flex flex-col" style={{ gap: 'var(--space-6)', padding: 'var(--space-4)' }}>
      <div>
        <div className="num" style={KICKER_STYLE}>
          Ratio against time
        </div>
        <p style={CAPTION_STYLE}>Is a longer pull pulling wetter or drier?</p>
        <RatioOverTimeChart shots={shots} />
      </div>
      <div>
        <div className="num" style={KICKER_STYLE}>
          Pull time consistency
        </div>
        <p style={CAPTION_STYLE}>
          Last {recentTimes.length} {recentTimes.length === 1 ? 'shot' : 'shots'} against your median of {medianTime}s.
        </p>
        <PullTimeConsistencyChart shots={shots} />
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

  useEffect(() => {
    listShots().then((shots) => {
      const grouped = groupShotsByBag(shots);
      setBags(grouped);
      setSelectedBag(grouped[0] ?? null);
    });
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
        <BagSelector
          bags={bags}
          selected={selectedBag}
          onSelect={(bag) => {
            const match = bags.find((b) => sameBag(b, bag));
            if (match) setSelectedBag(match);
          }}
          label={selectedBag?.bean_name ?? 'Select bag'}
        />
      </header>

      {!selectedBag || selectedBag.shots.length === 0 ? (
        <p style={{ padding: 'var(--space-4)' }}>No shots logged yet.</p>
      ) : (
        <BagTrends bag={selectedBag} />
      )}
    </div>
  );
}
