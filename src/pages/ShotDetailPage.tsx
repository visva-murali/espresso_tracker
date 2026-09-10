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
import { getAnalysisForShot, type ShotAnalysis } from '../lib/analyses';
import { groupShotsByBag, deltas, ratio, daysSinceRoast, sameBag, targetForBag, ratioDelta } from '../lib/shotView';
import { listBagTargets, type BagTarget } from '../lib/bagTargets';
import { formatMass, formatSigned, formatRoastAge } from '../lib/format';
import { RatioFigure } from '../components/shot-display/RatioFigure';
import { PullTimeFigure } from '../components/shot-display/PullTimeFigure';
import { StickyActionBar } from '../components/StickyActionBar';
import { ShotAssistant } from '../components/ShotAssistant';

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
  const [actionError, setActionError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<ShotAnalysis | null>(null);
  const [analysisReady, setAnalysisReady] = useState(false);
  const [bagTargets, setBagTargets] = useState<BagTarget[]>([]);

  useEffect(() => {
    if (!id) return;
    getShot(id)
      .then((s) => {
        setShot(s);
        if (!s) return;
        return listShots().then((all) => setPreviousShot(findPreviousShot(s, all)));
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load shot'));
    listBagTargets()
      .then(setBagTargets)
      .catch(() => setBagTargets([]));
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

  useEffect(() => {
    if (!id) return;
    getAnalysisForShot(id)
      .then(setAnalysis)
      .catch(() => setAnalysis(null))
      .finally(() => setAnalysisReady(true));
  }, [id]);

  async function handleVideoAttach(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    if (!file || !id) return;
    setActionError(null);
    const result = await validateVideoFile(file);
    if (!result.valid) {
      setActionError(result.reason);
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
      setActionError(err instanceof Error ? err.message : 'Failed to upload video');
      setVideoState('none');
    }
  }

  async function handleDelete() {
    if (!id) return;
    if (!window.confirm('Delete this shot? This cannot be undone.')) return;
    setActionError(null);
    try {
      await deleteShot(id);
      navigate('/');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to delete shot');
    }
  }

  if (error) return <p style={{ color: 'var(--color-accent-800)' }}>{error}</p>;
  if (shot === undefined) return <p>Loading...</p>;
  if (shot === null) return <p>Shot not found.</p>;

  const shotDeltas = previousShot ? deltas(shot, previousShot) : null;
  const age = shot.roast_date ? daysSinceRoast(shot.roast_date) : null;
  const timestamp = new Date(shot.created_at).toLocaleString();
  const target = targetForBag(bagTargets, shot);

  return (
    <div className="max-w-md mx-auto flex flex-col min-h-[100dvh]">
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

      {actionError && (
        <p
          style={{
            color: 'var(--color-accent-800)',
            fontSize: '13px',
            padding: 'var(--space-2) var(--space-4) 0',
          }}
        >
          {actionError}
        </p>
      )}

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
        {target != null && (
          <div
            className="num"
            style={{
              fontSize: '11px',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              opacity: 0.55,
              marginTop: '4px',
            }}
          >
            target 1:{target.toFixed(1)} · {formatSigned(ratioDelta(shot, target), 2)}
          </div>
        )}
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

      {analysisReady && <ShotAssistant shotId={shot.id} initialAnalysis={analysis} />}

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

      <StickyActionBar>
        <div className="flex justify-between items-center">
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
      </StickyActionBar>
    </div>
  );
}
