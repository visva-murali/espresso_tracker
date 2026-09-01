import { useState, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShotForm, emptyShotFormValues, type ShotFormValues } from '../components/ShotForm';
import { createShot } from '../lib/shots';
import { validateVideoFile, uploadShotVideo } from '../lib/videos';

export function NewShotPage() {
  const navigate = useNavigate();
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [createdShotId, setCreatedShotId] = useState<string | null>(null);

  async function handleVideoChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setVideoError(null);
    setVideoFile(null);
    if (!file) return;

    const result = await validateVideoFile(file);
    if (!result.valid) {
      setVideoError(result.reason);
      return;
    }
    setVideoFile(file);
  }

  async function handleSubmit(values: ShotFormValues) {
    let shotId = createdShotId;
    if (!shotId) {
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
      shotId = shot.id;
      setCreatedShotId(shotId);
    }
    if (videoFile) {
      await uploadShotVideo(shotId, videoFile);
    }
    navigate(`/shots/${shotId}`);
  }

  return (
    <div>
      <h1 className="text-xl font-semibold text-center mt-4">Log a shot</h1>
      <div className="max-w-md mx-auto px-4 flex flex-col gap-1">
        <label htmlFor="video-input">Pour video (optional)</label>
        <input id="video-input" type="file" accept="video/*" onChange={handleVideoChange} />
        {videoError && <p className="text-red-600">{videoError}</p>}
      </div>
      <ShotForm initialValues={emptyShotFormValues} submitLabel="Save shot" onSubmit={handleSubmit} />
    </div>
  );
}
