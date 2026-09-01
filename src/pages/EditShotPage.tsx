import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ShotForm, type ShotFormValues } from '../components/ShotForm';
import { getShot, updateShot, type Shot } from '../lib/shots';

function toFormValues(shot: Shot): ShotFormValues {
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

export function EditShotPage() {
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

  async function handleSubmit(values: ShotFormValues) {
    if (!id) return;
    await updateShot(id, {
      grind_setting: values.grind_setting,
      dose_g: Number(values.dose_g),
      yield_g: Number(values.yield_g),
      pull_time_s: Number(values.pull_time_s),
      bean_name: values.bean_name || null,
      roast_date: values.roast_date || null,
      rating: values.rating ? Number(values.rating) : null,
      tasting_note: values.tasting_note || null,
    });
    navigate(`/shots/${id}`);
  }

  if (error) return <p className="text-red-600">{error}</p>;
  if (shot === undefined) return <p>Loading...</p>;
  if (shot === null) return <p>Shot not found.</p>;

  return (
    <div>
      <h1 className="text-xl font-semibold text-center mt-4">Edit shot</h1>
      <ShotForm initialValues={toFormValues(shot)} submitLabel="Save changes" onSubmit={handleSubmit} />
    </div>
  );
}
