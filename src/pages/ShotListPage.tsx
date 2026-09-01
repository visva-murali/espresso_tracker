import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listShots, type Shot } from '../lib/shots';
import { useAuth } from '../context/AuthContext';

export function ShotListPage() {
  const { user, signOut } = useAuth();
  const [shots, setShots] = useState<Shot[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listShots()
      .then(setShots)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load shots'));
  }, []);

  return (
    <div className="max-w-md mx-auto p-4 flex flex-col gap-4">
      <div className="flex justify-between items-center">
        <span>{user?.email}</span>
        <button onClick={() => signOut()} className="border rounded px-3 py-1">
          Sign out
        </button>
      </div>
      <Link to="/shots/new" className="bg-black text-white rounded px-4 py-2 text-center">
        Log a shot
      </Link>
      {error && <p className="text-red-600">{error}</p>}
      {!shots && !error && <p>Loading...</p>}
      {shots?.length === 0 && <p>No shots logged yet.</p>}
      {shots && shots.length > 0 && (
        <ul className="flex flex-col gap-2">
          {shots.map((shot) => (
            <li key={shot.id}>
              <Link to={`/shots/${shot.id}`} className="block border rounded px-3 py-2">
                {shot.grind_setting} - {shot.dose_g}g in / {shot.yield_g}g out - {shot.pull_time_s}s
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
