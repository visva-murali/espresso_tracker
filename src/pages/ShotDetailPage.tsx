// src/pages/ShotDetailPage.tsx
import { useEffect, useState, type ChangeEvent } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getShot, deleteShot, listShots, type Shot } from '../lib/shots';
import {
  getVideoForShot,
  getVideoPlaybackUrl,
  validateVideoFile,
  uploadShotVideo,
  type Video,
} from '../lib/videos';
import { groupShotsByBag, deltas, ratio, daysSinceRoast, sameBag } from '../lib/shotView';
import { formatMass, formatSigned, formatRoastAge } from '../lib/format';
import { RatioFigure } from '../components/shot-display/RatioFigure';
import { PullTimeFigure } from '../components/shot-display/PullTimeFigure';

type VideoState = 'none' | 'uploading' | 'ready' | 'unplayable';

function findPreviousShot(shot: Shot, allShots: Shot[]): Shot | null {
  const bag = groupShotsByBag(allShots).find((b) => sameBag(b, shot));
  if (!bag) return null;
  const index = bag.shots.findIndex((s) => s.id === shot.id);
  return index >= 0 ? bag.shots[index + 1] ?? null : null;
}

export function ShotDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [shot, setShot] = useState<Shot | null | undefined>(undefined);
  const [previousShot, setPreviousShot] = useState<Shot | null>(null);
  const [, setVideo] = useState<Video | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoState, setVideoState] = useState<VideoState>('none');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    getShot(id)
      .then((s) => {
        setShot(s);
        if (!s) return;
        return listShots().then((all) => setPreviousShot(findPreviousShot(s, all)));
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load shot'));
  }, [id]);

  useEffect(() => {
    if (!id) return;
    getVideoForShot(id)
      .then((v) => {
        setVideo(v);
        if (!v) return;
        setVideoState('ready');
        getVideoPlaybackUrl(v).then(setVideoUrl);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load video'));
  }, [id]);

  async function handleVideoAttach(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    if (!file || !id) return;
    const result = await validateVideoFile(file);
    if (!result.valid) {
      setError(result.reason);
      return;
    }
    setVideoState('uploading');
    try {
      const uploaded = await uploadShotVideo(id, file);
      setVideo(uploaded);
      const url = await getVideoPlaybackUrl(uploaded);
      setVideoUrl(url);
      setVideoState('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload video');
      setVideoState('none');
    }
  }

  async function handleDelete() {
    if (!id) return;
    if (!window.confirm('Delete this shot? This cannot be undone.')) return;
    try {
      await deleteShot(id);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete shot');
    }
  }

  if (error) return <p style={{ color: 'var(--color-accent-800)' }}>{error}</p>;
  if (shot === undefined) return <p>Loading...</p>;
  if (shot === null) return <p>Shot not found.</p>;

  const shotDeltas = previousShot ? deltas(shot, previousShot) : null;
  const age = shot.roast_date ? daysSinceRoast(shot.roast_date) : null;
  const timestamp = new Date(shot.created_at).toLocaleString();

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
        <div className="flex items-center" style={{ gap: 'var(--space-2)' }}>
          <Link
            to={`/shots/${id}/edit`}
            className="h-9 px-3 flex items-center border border-[var(--color-divider)] rounded-[var(--radius-md)] text-sm hover:bg-[var(--color-accent-100)] active:bg-[var(--color-accent-200)]"
          >
            Edit
          </Link>
          <Link
            to={`/shots/new?from=${id}`}
            className="h-9 px-3 flex items-center border border-[var(--color-divider)] rounded-[var(--radius-md)] text-sm hover:bg-[var(--color-accent-100)] active:bg-[var(--color-accent-200)]"
          >
            Duplicate
          </Link>
        </div>
      </header>

      <div style={{ padding: 'var(--space-4) var(--space-4) var(--space-3)' }}>
        <div
          className="num"
          style={{ fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.55 }}
        >
          <span>{shot.bean_name ?? 'Unlabeled'}</span>
          {age != null ? ` · ${formatRoastAge(age)}` : ''}
          {` · ${timestamp}`}
        </div>
        <div className="flex items-baseline" style={{ gap: 'var(--space-4)' }}>
          <RatioFigure value={ratio(shot)} size="xl" />
          <PullTimeFigure seconds={shot.pull_time_s} size="xl" />
        </div>
      </div>

      <div style={{ padding: '0 var(--space-4) var(--space-3)' }}>
        {videoState === 'none' && (
          <div className="border-t border-[var(--color-divider)]" style={{ padding: 'var(--space-3) 0' }}>
            <label
              htmlFor="detail-video-input"
              className="rounded-[var(--radius-sm)] px-1 py-0.5 hover:bg-[var(--color-accent-100)] active:bg-[var(--color-accent-200)]"
              style={{ color: 'var(--color-accent)' }}
            >
              Attach pour video
            </label>
            <input id="detail-video-input" type="file" accept="video/*" onChange={handleVideoAttach} />
          </div>
        )}
        {videoState !== 'none' && (
          <>
            <div
              className="plate"
              style={{
                aspectRatio: '16 / 10',
                background: 'var(--color-neutral-900)',
                border: '6px solid var(--color-surface)',
                outline: '1px solid var(--color-divider)',
                filter: 'sepia(0.22) saturate(0.82) contrast(1.05)',
              }}
            >
              {videoUrl && videoState !== 'uploading' && (
                <video
                  data-testid="pour-video"
                  src={videoUrl}
                  controls
                  className="w-full h-full"
                  onError={() => setVideoState('unplayable')}
                />
              )}
            </div>
            <div
              className="flex justify-between"
              style={{ fontSize: '11px', opacity: 0.6, marginTop: '4px' }}
            >
              <span>Pour video</span>
              <span>
                {videoState === 'uploading' && 'Uploading...'}
                {videoState === 'ready' && 'Ready'}
                {videoState === 'unplayable' && (
                  <>
                    Can't preview this format ·{' '}
                    {videoUrl && (
                      <a
                        href={videoUrl}
                        className="rounded-[var(--radius-sm)] px-1 py-0.5 hover:bg-[var(--color-accent-100)] active:bg-[var(--color-accent-200)]"
                        style={{ color: 'var(--color-accent)' }}
                      >
                        Download
                      </a>
                    )}
                  </>
                )}
              </span>
            </div>
            {videoState === 'uploading' && (
              <div
                style={{
                  height: '2px',
                  background: 'var(--color-accent-200)',
                  marginTop: '4px',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: '40%',
                    background: 'var(--color-accent)',
                    animation: 'indeterminate 1.2s ease-in-out infinite',
                  }}
                />
              </div>
            )}
          </>
        )}
      </div>

      <table className="w-full" style={{ borderCollapse: 'collapse' }}>
        <tbody>
          <tr style={{ borderTop: '1px solid var(--color-divider)' }}>
            <td style={{ padding: 'var(--space-2) var(--space-4)', opacity: 0.65 }}>Dose</td>
            <td className="num text-right" style={{ padding: 'var(--space-2) var(--space-4)' }}>
              {formatMass(shot.dose_g)}
            </td>
          </tr>
          <tr style={{ borderTop: '1px solid var(--color-divider)' }}>
            <td style={{ padding: 'var(--space-2) var(--space-4)', opacity: 0.65 }}>Yield</td>
            <td className="num text-right" style={{ padding: 'var(--space-2) var(--space-4)' }}>
              {formatMass(shot.yield_g)}
            </td>
          </tr>
          <tr style={{ borderTop: '1px solid var(--color-divider)' }}>
            <td style={{ padding: 'var(--space-2) var(--space-4)', opacity: 0.65 }}>Grind</td>
            <td className="num text-right" style={{ padding: 'var(--space-2) var(--space-4)' }}>
              {shot.grind_setting}
            </td>
          </tr>
          {shot.rating != null && (
            <tr style={{ borderTop: '1px solid var(--color-divider)' }}>
              <td style={{ padding: 'var(--space-2) var(--space-4)', opacity: 0.65 }}>Rating</td>
              <td className="num text-right" style={{ padding: 'var(--space-2) var(--space-4)' }}>
                {shot.rating} / 5
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {shotDeltas && (
        <div style={{ padding: 'var(--space-3) var(--space-4)' }}>
          <div
            className="num"
            style={{ fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.55 }}
          >
            Against the previous shot
          </div>
          <div style={{ fontSize: '13px' }}>
            {shotDeltas.grind != null && (
              <span style={{ color: 'var(--color-accent-700)' }}>
                <span className="fig">{formatSigned(shotDeltas.grind, 1)}</span> grind
              </span>
            )}
            {shotDeltas.grind != null && ' · '}
            <span style={{ color: 'var(--color-accent-700)' }}>
              <span className="fig">{formatSigned(shotDeltas.yield_g, 1)}</span> g yield
            </span>
            {' · '}
            <span style={{ color: 'var(--color-accent-700)' }}>
              <span className="fig">{formatSigned(shotDeltas.pull_time_s, 0)}</span>s time
            </span>
          </div>
        </div>
      )}

      {shot.tasting_note && (
        <div
          className="border-t border-[var(--color-divider)]"
          style={{
            padding: 'var(--space-3) var(--space-4)',
            fontFamily: 'var(--font-heading)',
            fontStyle: 'italic',
            fontSize: '19px',
            lineHeight: 1.4,
          }}
        >
          {shot.tasting_note}
        </div>
      )}

      <div
        className="flex justify-between items-center border-t border-[var(--color-divider)]"
        style={{ padding: 'var(--space-3) var(--space-4) var(--space-6)' }}
      >
        <button
          type="button"
          onClick={handleDelete}
          className="text-sm rounded-[var(--radius-sm)] px-1 py-0.5 hover:bg-[var(--color-accent-100)] active:bg-[var(--color-accent-200)]"
          style={{ color: 'var(--color-neutral-700)' }}
        >
          Delete shot
        </button>
        <Link
          to={`/shots/new?from=${id}`}
          className="flex items-center justify-center border border-[var(--color-accent)] rounded-[var(--radius-md)] hover:bg-[var(--color-accent-100)] active:bg-[var(--color-accent-200)]"
          style={{ height: '48px', padding: '0 var(--space-4)', color: 'var(--color-accent)' }}
        >
          Pull another like this
        </Link>
      </div>
    </div>
  );
}
