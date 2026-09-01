import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getShot, deleteShot, type Shot } from '../lib/shots';

export function ShotDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [shot, setShot] = useState<Shot | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    getShot(id)
      .then(setShot)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load shot'));
  }, [id]);

  async function handleDelete() {
    if (!id) return;
    if (!window.confirm('Delete this shot? This cannot be undone.')) return;
    await deleteShot(id);
    navigate('/');
  }

  if (error) return <p className="text-red-600">{error}</p>;
  if (shot === undefined) return <p>Loading...</p>;
  if (shot === null) return <p>Shot not found.</p>;

  return (
    <div className="max-w-md mx-auto p-4 flex flex-col gap-2">
      <Link to="/">Back to shots</Link>
      <h1 className="text-xl font-semibold">{shot.grind_setting}</h1>
      <dl className="grid grid-cols-2 gap-1">
        <dt>Dose</dt>
        <dd>{shot.dose_g} g</dd>
        <dt>Yield</dt>
        <dd>{shot.yield_g} g</dd>
        <dt>Pull time</dt>
        <dd>{shot.pull_time_s} s</dd>
        {shot.bean_name && (
          <>
            <dt>Bean</dt>
            <dd>{shot.bean_name}</dd>
          </>
        )}
        {shot.roast_date && (
          <>
            <dt>Roast date</dt>
            <dd>{shot.roast_date}</dd>
          </>
        )}
        {shot.rating != null && (
          <>
            <dt>Rating</dt>
            <dd>{shot.rating}</dd>
          </>
        )}
        {shot.tasting_note && (
          <>
            <dt>Notes</dt>
            <dd>{shot.tasting_note}</dd>
          </>
        )}
      </dl>
      <div className="flex gap-2 mt-2">
        <Link to={`/shots/${id}/edit`} className="border rounded px-3 py-1">
          Edit
        </Link>
        <button onClick={handleDelete} className="text-red-600 border rounded px-3 py-1">
          Delete
        </button>
      </div>
    </div>
  );
}
