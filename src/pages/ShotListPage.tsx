// src/pages/ShotListPage.tsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listShots, type Shot } from '../lib/shots';
import { groupShotsByBag, bagState, bagLabel, ratio, daysSinceRoast, deltas, bagKey, targetForBag, type Bag } from '../lib/shotView';
import { listBagTargets, type BagTarget } from '../lib/bagTargets';
import { formatMass, formatSigned, formatRoastAge } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import { SearchIcon, MenuIcon, VideoIcon } from '../components/icons';
import { Logo } from '../components/Logo';
import { StickyActionBar } from '../components/StickyActionBar';
import { LoadingBar } from '../components/LoadingBar';
import { RatioFigure } from '../components/shot-display/RatioFigure';
import { PullTimeFigure } from '../components/shot-display/PullTimeFigure';
import { RatingDots } from '../components/shot-display/RatingDots';
import { BagTag } from '../components/shot-display/BagTag';

type Filter = 'active' | 'all';


function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  const weekday = date.toLocaleDateString(undefined, { weekday: 'short' });
  const time = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return `${weekday} ${time}`;
}

function ShotRow({ shot, previous }: { shot: Shot; previous: Shot | null }) {
  const shotDeltas = previous ? deltas(shot, previous) : null;
  const doseDelta = shotDeltas ? formatSigned(shotDeltas.dose_g, 1) : null;
  const yieldDelta = shotDeltas ? formatSigned(shotDeltas.yield_g, 1) : null;

  return (
    <Link
      to={`/shots/${shot.id}`}
      className="grid items-center border-t border-[var(--color-divider)] hover:bg-[var(--color-surface)] active:bg-[var(--color-accent-100)]"
      style={{
        gridTemplateColumns: '1fr auto',
        gap: 'var(--space-3)',
        padding: 'var(--space-3) var(--space-4)',
        minHeight: '64px',
      }}
    >
      <div className="flex flex-col gap-1">
        <div className="flex items-baseline" style={{ gap: '14px' }}>
          <RatioFigure value={ratio(shot)} />
          <PullTimeFigure seconds={shot.pull_time_s} />
        </div>
        <div className="num text-[12.5px]" style={{ color: 'var(--color-neutral-700)' }}>
          {formatMass(shot.dose_g)}
          {doseDelta && (
            <span className="fig" style={{ color: 'var(--color-accent-700)' }}> {doseDelta}</span>
          )}
          {' → '}
          {formatMass(shot.yield_g)}
          {yieldDelta && (
            <span className="fig" style={{ color: 'var(--color-accent-700)' }}> {yieldDelta}</span>
          )}
          {` · grind ${shot.grind_setting}`}
        </div>
      </div>
      <div className="flex flex-col items-end" style={{ gap: '4px' }}>
        {shot.rating != null ? (
          <RatingDots rating={shot.rating} />
        ) : (
          <VideoIcon size={15} style={{ color: 'var(--color-accent)' }} />
        )}
        <span className="num text-[11px]" style={{ color: 'var(--color-neutral-600)' }}>
          {formatTimestamp(shot.created_at)}
        </span>
      </div>
    </Link>
  );
}

function BagGroup({ bag, targets }: { bag: Bag; targets: BagTarget[] }) {
  const state = bagState(bag.shots, { targetRatio: targetForBag(targets, bag) });
  const age = bag.roast_date ? daysSinceRoast(bag.roast_date) : null;

  return (
    <section>
      <div
        className="flex justify-between items-baseline"
        style={{ padding: 'var(--space-4) var(--space-4) var(--space-2)' }}
      >
        <div>
          <div
            style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: '19px' }}
          >
            {bagLabel(bag)}
          </div>
          <div
            className="num"
            style={{ fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.55 }}
          >
            {age != null ? `${formatRoastAge(age)} · ` : ''}
            {bag.shots.length} shots
          </div>
        </div>
        <BagTag state={state} />
      </div>
      {bag.shots.map((shot, i) => (
        <ShotRow key={shot.id} shot={shot} previous={bag.shots[i + 1] ?? null} />
      ))}
    </section>
  );
}

export function ShotListPage() {
  const { signOut } = useAuth();
  const [shots, setShots] = useState<Shot[] | null>(null);
  const [bagTargets, setBagTargets] = useState<BagTarget[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('active');
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    listShots()
      .then(setShots)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load shots'));
    listBagTargets()
      .then(setBagTargets)
      .catch(() => setBagTargets([]));
  }, []);

  const bags = shots ? groupShotsByBag(shots) : [];
  const visibleBags =
    filter === 'active'
      ? bags.filter(
          (bag) => bagState(bag.shots, { targetRatio: targetForBag(bagTargets, bag) }) !== 'past-peak'
        )
      : bags;

  return (
    <div className="max-w-md mx-auto flex flex-col min-h-[100dvh]">
      <header
        className="flex justify-between items-center border-b border-[var(--color-divider)]"
        style={{ padding: '14px var(--space-4) var(--space-3)' }}
      >
        <div className="flex items-center" style={{ gap: 'var(--space-2)' }}>
          <Logo size={20} style={{ color: 'var(--color-accent)' }} />
          <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: '19px' }}>
            Shots
          </h1>
        </div>
        <div className="flex items-center relative" style={{ gap: 'var(--space-2)' }}>
          <button
            type="button"
            aria-label="Search"
            disabled
            className="w-9 h-9 flex items-center justify-center border border-[var(--color-divider)] rounded-[var(--radius-md)] hover:bg-[var(--color-accent-100)] active:bg-[var(--color-accent-200)]"
          >
            <SearchIcon />
          </button>
          <button
            type="button"
            aria-label="Menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
            className="w-9 h-9 flex items-center justify-center border border-[var(--color-divider)] rounded-[var(--radius-md)] hover:bg-[var(--color-accent-100)] active:bg-[var(--color-accent-200)]"
          >
            <MenuIcon />
          </button>
          {menuOpen && (
            <ul
              className="absolute right-0 top-full mt-1 z-10 min-w-[160px] bg-[var(--color-bg)] border border-[var(--color-divider)] rounded-[var(--radius-md)] shadow-[var(--shadow-md)]"
            >
              <li>
                <Link
                  to="/trends"
                  className="block px-3 py-2 text-sm hover:bg-[var(--color-accent-100)] active:bg-[var(--color-accent-200)]"
                >
                  Trends
                </Link>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => signOut()}
                  className="block w-full text-left px-3 py-2 text-sm hover:bg-[var(--color-accent-100)] active:bg-[var(--color-accent-200)]"
                >
                  Sign out
                </button>
              </li>
            </ul>
          )}
        </div>
      </header>

      <div
        className="flex border border-[var(--color-divider)] rounded-[var(--radius-md)]"
        style={{ margin: 'var(--space-3) var(--space-4) var(--space-2)' }}
      >
        {(['active', 'all'] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            className="flex-1 text-sm py-2 hover:bg-[var(--color-accent-100)] active:bg-[var(--color-accent-200)]"
            style={
              filter === value
                ? { color: 'var(--color-accent)', boxShadow: 'inset 0 0 0 1px var(--color-accent)' }
                : {}
            }
          >
            {value === 'active' ? 'Active bags' : 'All shots'}
          </button>
        ))}
      </div>

      {error && <p style={{ color: 'var(--color-accent-800)' }}>{error}</p>}
      {!shots && !error && <LoadingBar />}
      {shots && shots.length === 0 && (
        <p style={{ padding: 'var(--space-4)' }}>No shots logged yet.</p>
      )}
      {visibleBags.map((bag) => (
        <BagGroup key={bagKey(bag)} bag={bag} targets={bagTargets} />
      ))}

      <StickyActionBar>
        <Link
          to="/shots/new"
          className="block w-full text-center border border-[var(--color-accent)] rounded-[var(--radius-md)] hover:bg-[var(--color-accent-100)] active:bg-[var(--color-accent-200)]"
          style={{ height: '48px', lineHeight: '48px', color: 'var(--color-accent)' }}
        >
          Log a shot
        </Link>
      </StickyActionBar>
    </div>
  );
}
