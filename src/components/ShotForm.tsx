import { useState, type FormEvent } from 'react';

export type ShotFormValues = {
  grind_setting: string;
  dose_g: string;
  yield_g: string;
  pull_time_s: string;
  bean_name: string;
  roast_date: string;
  rating: string;
  tasting_note: string;
};

export const emptyShotFormValues: ShotFormValues = {
  grind_setting: '',
  dose_g: '',
  yield_g: '',
  pull_time_s: '',
  bean_name: '',
  roast_date: '',
  rating: '',
  tasting_note: '',
};

type Props = {
  initialValues: ShotFormValues;
  submitLabel: string;
  onSubmit: (values: ShotFormValues) => Promise<void>;
};

export function ShotForm({ initialValues, submitLabel, onSubmit }: Props) {
  const [values, setValues] = useState(initialValues);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function set<K extends keyof ShotFormValues>(key: K, value: string) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await onSubmit(values);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save shot');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-md mx-auto p-4 flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        Grind setting
        <input
          className="border rounded px-2 py-1"
          value={values.grind_setting}
          onChange={(e) => set('grind_setting', e.target.value)}
          required
        />
      </label>
      <label className="flex flex-col gap-1">
        Dose (g)
        <input
          type="number"
          step="0.1"
          className="border rounded px-2 py-1"
          value={values.dose_g}
          onChange={(e) => set('dose_g', e.target.value)}
          required
        />
      </label>
      <label className="flex flex-col gap-1">
        Yield (g)
        <input
          type="number"
          step="0.1"
          className="border rounded px-2 py-1"
          value={values.yield_g}
          onChange={(e) => set('yield_g', e.target.value)}
          required
        />
      </label>
      <label className="flex flex-col gap-1">
        Pull time (s)
        <input
          type="number"
          step="1"
          className="border rounded px-2 py-1"
          value={values.pull_time_s}
          onChange={(e) => set('pull_time_s', e.target.value)}
          required
        />
      </label>
      <label className="flex flex-col gap-1">
        Bean / origin (optional)
        <input
          className="border rounded px-2 py-1"
          value={values.bean_name}
          onChange={(e) => set('bean_name', e.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1">
        Roast date (optional)
        <input
          type="date"
          className="border rounded px-2 py-1"
          value={values.roast_date}
          onChange={(e) => set('roast_date', e.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1">
        Rating (optional, 1-5)
        <input
          type="number"
          min="1"
          max="5"
          step="1"
          className="border rounded px-2 py-1"
          value={values.rating}
          onChange={(e) => set('rating', e.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1">
        Tasting note (optional)
        <textarea
          className="border rounded px-2 py-1"
          value={values.tasting_note}
          onChange={(e) => set('tasting_note', e.target.value)}
        />
      </label>
      {error && <p className="text-red-600">{error}</p>}
      <button type="submit" disabled={saving} className="bg-black text-white rounded px-4 py-2">
        {saving ? 'Saving...' : submitLabel}
      </button>
    </form>
  );
}
