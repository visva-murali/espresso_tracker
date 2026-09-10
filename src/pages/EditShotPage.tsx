import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ShotForm, type ShotFormValues } from '../components/ShotForm';
import { getShot, updateShot, type Shot } from '../lib/shots';
import { toFormValues, targetForBag, pullTimeRangeForBag } from '../lib/shotView';
import { listBagTargets, setBagTarget, type BagTarget } from '../lib/bagTargets';
import { LoadingBar } from '../components/LoadingBar';

export function EditShotPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [shot, setShot] = useState<Shot | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [bagTargets, setBagTargets] = useState<BagTarget[]>([]);
  const [bagTargetsLoaded, setBagTargetsLoaded] = useState(false);
  const [target, setTarget] = useState<number | null>(null);
  const [pullTimeTarget, setPullTimeTarget] = useState<[number, number] | null>(null);

  useEffect(() => {
    if (!id) return;
    getShot(id)
      .then(setShot)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load shot'));
    listBagTargets()
      .then(setBagTargets)
      .catch(() => setBagTargets([]))
      .finally(() => setBagTargetsLoaded(true));
  }, [id]);

  useEffect(() => {
    if (!shot || !bagTargetsLoaded) return;
    setTarget(targetForBag(bagTargets, shot));
    setPullTimeTarget(pullTimeRangeForBag(bagTargets, shot));
    // Keyed on the shot's bag identity, not on bagTargets, so a late load
    // never clobbers a value the user picked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shot?.bean_name, shot?.roast_date, bagTargetsLoaded]);

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
    const bagRef = { bean_name: values.bean_name || null, roast_date: values.roast_date || null };
    const storedRatio = targetForBag(bagTargets, bagRef);
    const storedRange = pullTimeRangeForBag(bagTargets, bagRef);
    const rangeChanged = JSON.stringify(storedRange) !== JSON.stringify(pullTimeTarget);
    if (target !== storedRatio || rangeChanged) {
      await setBagTarget(bagRef, { targetRatio: target, pullTime: pullTimeTarget });
    }
    navigate(`/shots/${id}`);
  }

  const shell = (body: ReactNode) => (
    <div className="max-w-md mx-auto flex flex-col min-h-[100dvh]">
      <div className="flex items-center border-b border-[var(--color-divider)]" style={{ padding: 'var(--space-3) var(--space-4)' }}>
        <Link
          to={`/shots/${id}`}
          className="rounded-[var(--radius-sm)] px-1 py-0.5 hover:bg-[var(--color-accent-100)] active:bg-[var(--color-accent-200)]"
          style={{ color: 'var(--color-accent)' }}
        >
          Shot
        </Link>
      </div>
      <h1
        className="text-center"
        style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: '17px', padding: 'var(--space-3) 0' }}
      >
        Edit shot
      </h1>
      {body}
    </div>
  );

  if (error)
    return shell(
      <p style={{ color: 'var(--color-accent-800)', padding: '0 var(--space-4)' }}>{error}</p>
    );
  if (shot === undefined || !bagTargetsLoaded) return shell(<LoadingBar />);
  if (shot === null) return shell(<p style={{ padding: '0 var(--space-4)' }}>Shot not found.</p>);

  const values = toFormValues(shot);

  return shell(
    <>
      <ShotForm
        key={id}
        referenceValues={values}
        initialValues={values}
        submitLabel="Save changes"
        onSubmit={handleSubmit}
        target={target}
        onTargetChange={setTarget}
        pullTimeTarget={pullTimeTarget}
        onPullTimeTargetChange={setPullTimeTarget}
      />
    </>
  );
}
