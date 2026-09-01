import { useNavigate } from 'react-router-dom';
import { ShotForm, emptyShotFormValues, type ShotFormValues } from '../components/ShotForm';
import { createShot } from '../lib/shots';

export function NewShotPage() {
  const navigate = useNavigate();

  async function handleSubmit(values: ShotFormValues) {
    const shot = await createShot({
      grind_setting: values.grind_setting,
      dose_g: Number(values.dose_g),
      yield_g: Number(values.yield_g),
      pull_time_s: Number(values.pull_time_s),
      bean_name: values.bean_name || null,
      roast_date: values.roast_date || null,
      rating: values.rating ? Number(values.rating) : null,
      tasting_note: values.tasting_note || null,
    });
    navigate(`/shots/${shot.id}`);
  }

  return (
    <div>
      <h1 className="text-xl font-semibold text-center mt-4">Log a shot</h1>
      <ShotForm initialValues={emptyShotFormValues} submitLabel="Save shot" onSubmit={handleSubmit} />
    </div>
  );
}
