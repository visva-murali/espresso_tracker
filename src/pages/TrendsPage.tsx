// src/pages/TrendsPage.tsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listShots, type Shot } from '../lib/shots';
import { groupShotsByBag, ratio, sameBag, type Bag } from '../lib/shotView';
import { scaleLinear, medianOf } from '../lib/chartScale';
import { BagSelector } from '../components/BagSelector';

function RatioOverTimeChart({ shots }: { shots: Shot[] }) {
  const times = shots.map((s) => s.pull_time_s);
  const ratios = shots.map((s) => ratio(s));
  const x = scaleLinear(Math.min(...times), Math.max(...times), 20, 320);
  const y = scaleLinear(Math.min(...ratios), Math.max(...ratios), 170, 20);

  return (
    <svg viewBox="0 0 340 190" width="100%">
      <line x1="20" y1="170" x2="320" y2="170" stroke="var(--color-divider)" />
      <line x1="20" y1="20" x2="20" y2="170" stroke="var(--color-divider)" />
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
  const x = scaleLinear(0, Math.max(rated.length - 1, 1), 20, 320);
  const y = scaleLinear(0, 5, 90, 10);
  const barWidth = rated.length > 1 ? (300 / rated.length) * 0.6 : 30;

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
        <div className="flex flex-col" style={{ gap: 'var(--space-6)', padding: 'var(--space-4)' }}>
          <div>
            <div
              className="num"
              style={{ fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.55 }}
            >
              Ratio against time
            </div>
            <p style={{ fontSize: '12.5px', opacity: 0.7 }}>Is a longer pull pulling wetter or drier?</p>
            <RatioOverTimeChart shots={selectedBag.shots} />
          </div>
          <div>
            <div
              className="num"
              style={{ fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.55 }}
            >
              Pull time consistency
            </div>
            <p style={{ fontSize: '12.5px', opacity: 0.7 }}>How close to the median are recent shots landing?</p>
            <PullTimeConsistencyChart shots={selectedBag.shots} />
          </div>
          <div>
            <div
              className="num"
              style={{ fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.55 }}
            >
              Rating by shot on this bag
            </div>
            <p style={{ fontSize: '12.5px', opacity: 0.7 }}>Is this bag trending better or worse?</p>
            <RatingByShotChart shots={selectedBag.shots} />
          </div>
        </div>
      )}
    </div>
  );
}
