import { useEffect, useState, type ChangeEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ShotForm, emptyShotFormValues, type ShotFormValues } from '../components/ShotForm';
import { BagSelector } from '../components/BagSelector';
import { createShot, listShots, type Shot } from '../lib/shots';
import { groupShotsByBag, referenceShot as pickReferenceShot, sameBag, bagKey, toFormValues, targetForBag, type Bag } from '../lib/shotView';
import { listBagTargets, setBagTarget, type BagTarget } from '../lib/bagTargets';
import { validateVideoFile, uploadShotVideo } from '../lib/videos';
import { LoadingBar } from '../components/LoadingBar';

/**
 * Bean name and roast date for a bag with no shots yet - either a
 * brand-new user's first shot ever, or an existing user deliberately
 * starting a new bag. Confirming this mounts ShotForm with these two
 * fields locked in and the four nudge fields blank (see assumption 9).
 */
function NewBagFields({
  beanName,
  roastDate,
  onBeanNameChange,
  onRoastDateChange,
  onContinue,
}: {
  beanName: string;
  roastDate: string;
  onBeanNameChange: (value: string) => void;
  onRoastDateChange: (value: string) => void;
  onContinue: () => void;
}) {
  return (
    <div className="flex flex-col gap-3" style={{ padding: 'var(--space-4)' }}>
      <label className="flex flex-col gap-1">
        Bean / origin
        <input
          className="border border-[var(--color-divider)] rounded-[var(--radius-md)] px-2 py-1"
          value={beanName}
          onChange={(e) => onBeanNameChange(e.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1">
        Roast date
        <input
          type="date"
          className="border border-[var(--color-divider)] rounded-[var(--radius-md)] px-2 py-1"
          value={roastDate}
          onChange={(e) => onRoastDateChange(e.target.value)}
        />
      </label>
      <button
        type="button"
        onClick={onContinue}
        className="border border-[var(--color-accent)] rounded-[var(--radius-md)] hover:bg-[var(--color-accent-100)] active:bg-[var(--color-accent-200)]"
        style={{ height: '48px', color: 'var(--color-accent)' }}
      >
        Continue
      </button>
    </div>
  );
}

export function NewShotPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fromShotId = searchParams.get('from');
  const [bags, setBags] = useState<Bag[]>([]);
  const [selectedBag, setSelectedBag] = useState<Bag | null>(null);
  const [seedShot, setSeedShot] = useState<Shot | null>(null);
  const [startingNewBag, setStartingNewBag] = useState(false);
  const [newBagConfirmed, setNewBagConfirmed] = useState(false);
  const [newBeanName, setNewBeanName] = useState('');
  const [newRoastDate, setNewRoastDate] = useState('');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [createdShotId, setCreatedShotId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bagTargets, setBagTargets] = useState<BagTarget[]>([]);
  const [bagTargetsLoaded, setBagTargetsLoaded] = useState(false);
  const [target, setTarget] = useState<number | null>(null);

  useEffect(() => {
    listBagTargets()
      .then(setBagTargets)
      .catch(() => setBagTargets([]))
      .finally(() => setBagTargetsLoaded(true));
  }, []);

  useEffect(() => {
    listShots()
      .then((shots) => {
        const grouped = groupShotsByBag(shots);
        setBags(grouped);
        if (grouped.length === 0) {
          setStartingNewBag(true);
          return;
        }

        const namedShot = fromShotId ? shots.find((s) => s.id === fromShotId) ?? null : null;
        if (namedShot) {
          setSeedShot(namedShot);
          const bag = grouped.find((b) => sameBag(b, namedShot));
          setSelectedBag(bag ?? grouped[0]);
        } else {
          setSelectedBag(grouped[0]);
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load bags'));
  }, [fromShotId]);

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
    const bagRef = { bean_name: values.bean_name || null, roast_date: values.roast_date || null };
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
    if (target !== targetForBag(bagTargets, bagRef)) {
      await setBagTarget(bagRef, { targetRatio: target, pullTime: null });
    }
    if (videoFile) {
      await uploadShotVideo(shotId, videoFile);
    }
    navigate(`/shots/${shotId}`);
  }

  // The bag whose target the control edits: the confirmed new bag's typed
  // bean/roast, or the selected existing bag. An identical bean_name +
  // roast_date is the same bag everywhere else (groupShotsByBag), so
  // resolving its stored target here is correct, not an auto-default.
  const targetBeanName = newBagConfirmed
    ? newBeanName || null
    : selectedBag
    ? selectedBag.bean_name
    : null;
  const targetRoastDate = newBagConfirmed
    ? newRoastDate || null
    : selectedBag
    ? selectedBag.roast_date
    : null;
  const hasBagForTarget = newBagConfirmed || selectedBag != null;

  useEffect(() => {
    if (!bagTargetsLoaded) return;
    setTarget(
      hasBagForTarget
        ? targetForBag(bagTargets, { bean_name: targetBeanName, roast_date: targetRoastDate })
        : null
    );
    // Keyed on the bag identity, not on bagTargets, so a late load never
    // clobbers a value the user picked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetBeanName, targetRoastDate, hasBagForTarget, bagTargetsLoaded]);

  const reference = seedShot ?? (selectedBag ? pickReferenceShot(selectedBag.shots) : null);
  const showNewBagFields = startingNewBag && !newBagConfirmed;
  const formValues: ShotFormValues | null = newBagConfirmed
    ? { ...emptyShotFormValues, bean_name: newBeanName, roast_date: newRoastDate }
    : reference
    ? toFormValues(reference)
    : null;

  return (
    <div className="max-w-md mx-auto flex flex-col min-h-[100dvh]">
      <header
        className="flex justify-between items-center border-b border-[var(--color-divider)]"
        style={{ padding: 'var(--space-3) var(--space-4)' }}
      >
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="rounded-[var(--radius-sm)] px-1 py-0.5 hover:bg-[var(--color-accent-100)] active:bg-[var(--color-accent-200)]"
          style={{ color: 'var(--color-accent)' }}
        >
          Cancel
        </button>
        <h1 style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: '17px' }}>
          New shot
        </h1>
        <span style={{ width: '52px' }} />
      </header>

      {error && <p style={{ color: 'var(--color-accent-800)', padding: '0 var(--space-4)' }}>{error}</p>}

      {!error && !showNewBagFields && !(formValues && bagTargetsLoaded) && <LoadingBar />}

      {!showNewBagFields && selectedBag && !newBagConfirmed && (
        <div
          className="flex justify-between items-center border-b border-[var(--color-divider)]"
          style={{ padding: 'var(--space-3) var(--space-4)' }}
        >
          <div>
            <div
              className="num"
              style={{ fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.55 }}
            >
              {reference ? `Copied from ${new Date(reference.created_at).toLocaleString()}` : ''}
            </div>
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: '18px' }}>
              {selectedBag.bean_name ?? 'Unlabeled'}
            </div>
          </div>
          <div className="flex items-center" style={{ gap: 'var(--space-2)' }}>
            <BagSelector
              bags={bags}
              selected={selectedBag}
              onSelect={(bag) => {
                const match = bags.find((b) => sameBag(b, bag));
                if (match) {
                  setSelectedBag(match);
                  setSeedShot(null);
                }
              }}
              label="Change"
            />
            <button
              type="button"
              onClick={() => setStartingNewBag(true)}
              className="text-sm rounded-[var(--radius-sm)] px-1 py-0.5 hover:bg-[var(--color-accent-100)] active:bg-[var(--color-accent-200)]"
              style={{ color: 'var(--color-accent)' }}
            >
              Start a new bag
            </button>
          </div>
        </div>
      )}

      {showNewBagFields && (
        <NewBagFields
          beanName={newBeanName}
          roastDate={newRoastDate}
          onBeanNameChange={setNewBeanName}
          onRoastDateChange={setNewRoastDate}
          onContinue={() => setNewBagConfirmed(true)}
        />
      )}

      {formValues && !showNewBagFields && bagTargetsLoaded && (
        <ShotForm
          key={seedShot ? seedShot.id : selectedBag ? bagKey(selectedBag) : 'new-bag'}
          referenceValues={formValues}
          initialValues={formValues}
          submitLabel="Save shot"
          onSubmit={handleSubmit}
          target={target}
          onTargetChange={setTarget}
        >
          <div className="flex flex-col gap-1" style={{ padding: '0 var(--space-4) var(--space-4)' }}>
            <label htmlFor="video-input" className="text-sm" style={{ color: 'var(--color-accent)' }}>
              Attach pour video (optional)
            </label>
            <input id="video-input" type="file" accept="video/*" onChange={handleVideoChange} />
            {videoError && <p style={{ color: 'var(--color-accent-800)' }}>{videoError}</p>}
          </div>
        </ShotForm>
      )}
    </div>
  );
}
