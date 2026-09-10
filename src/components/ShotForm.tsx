import { useState, type FormEvent, type ReactNode } from 'react';
import { formatSigned } from '../lib/format';
import { StickyActionBar } from './StickyActionBar';
import { RatioTargetControl } from './RatioTargetControl';
import { PullTimeTargetControl } from './PullTimeTargetControl';

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
  referenceValues: ShotFormValues;
  initialValues: ShotFormValues;
  submitLabel: string;
  onSubmit: (values: ShotFormValues) => Promise<void>;
  /**
   * The bag's target ratio, owned by the page. When set, the Ratio row
   * shows the live actual-minus-target delta and the segmented control
   * reflects the current value.
   */
  target?: number | null;
  onTargetChange?: (next: number | null) => void;
  /**
   * The bag's target pull-time window [low, high], owned by the page. When
   * set, the control under the Pull time row shows the live position.
   */
  pullTimeTarget?: [number, number] | null;
  onPullTimeTargetChange?: (next: [number, number] | null) => void;
  /**
   * Extra fields rendered inside the form, between the rating/note section
   * and the sticky action bar - used by NewShotPage for its optional
   * pour-video picker so the picker stays above the pinned submit button.
   */
  children?: ReactNode;
};

type NumericField = 'grind_setting' | 'dose_g' | 'yield_g' | 'pull_time_s';

const STEP: Record<NumericField, number> = {
  grind_setting: 0.1,
  dose_g: 0.1,
  yield_g: 0.5,
  pull_time_s: 1,
};

const DECIMALS: Record<NumericField, number> = {
  grind_setting: 1,
  dose_g: 1,
  yield_g: 1,
  pull_time_s: 0,
};

const LABEL: Record<NumericField, string> = {
  grind_setting: 'Grind',
  dose_g: 'Dose',
  yield_g: 'Yield',
  pull_time_s: 'Pull time',
};

function numericDelta(field: NumericField, value: string, reference: string): number | null {
  const a = Number.parseFloat(value);
  const b = Number.parseFloat(reference);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const diff = Number((a - b).toFixed(DECIMALS[field] + 2));
  return diff === 0 ? null : diff;
}

function NudgeRow({
  field,
  value,
  reference,
  onChange,
}: {
  field: NumericField;
  value: string;
  reference: string;
  onChange: (next: string) => void;
}) {
  const delta = numericDelta(field, value, reference);
  const changed = delta !== null;
  const step = STEP[field];
  const decimals = DECIMALS[field];

  function nudge(direction: 1 | -1) {
    const current = Number.parseFloat(value);
    const base = Number.isFinite(current) ? current : Number.parseFloat(reference) || 0;
    onChange((base + direction * step).toFixed(decimals));
  }

  const directionWord = field === 'dose_g' ? 'dose' : field === 'yield_g' ? 'yield' : field === 'pull_time_s' ? 'pull time' : 'grind';

  return (
    <div
      className="grid items-center border-b border-[var(--color-divider)]"
      style={{ gridTemplateColumns: '1fr auto', gap: 'var(--space-3)', minHeight: '72px', padding: 'var(--space-2) var(--space-4)' }}
    >
      <div>
        <div style={{ fontSize: '12px', opacity: 0.65 }}>
          {LABEL[field]}
          {changed && (
            <span className="fig" style={{ color: 'var(--color-accent-700)' }}> {formatSigned(delta!, decimals)}</span>
          )}
        </div>
        <input
          aria-label={LABEL[field]}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required
          inputMode={field !== 'grind_setting' ? 'decimal' : undefined}
          className="fig bg-transparent border-none p-0 w-full"
          style={{
            fontSize: '25px',
            lineHeight: 1.2,
            color: changed ? 'var(--color-accent-700)' : 'var(--color-text)',
          }}
        />
      </div>
      <div className="flex" style={{ gap: 'var(--space-2)' }}>
        <button
          type="button"
          aria-label={`Decrease ${directionWord}`}
          onClick={() => nudge(-1)}
          className="w-12 h-12 border border-[var(--color-divider)] rounded-[var(--radius-md)] text-xl hover:bg-[var(--color-accent-100)] active:bg-[var(--color-accent-200)]"
        >
          &minus;
        </button>
        <button
          type="button"
          aria-label={`Increase ${directionWord}`}
          onClick={() => nudge(1)}
          className="w-12 h-12 border border-[var(--color-divider)] rounded-[var(--radius-md)] text-xl hover:bg-[var(--color-accent-100)] active:bg-[var(--color-accent-200)]"
        >
          +
        </button>
      </div>
    </div>
  );
}

export function ShotForm({
  referenceValues,
  initialValues,
  submitLabel,
  onSubmit,
  target = null,
  onTargetChange,
  pullTimeTarget = null,
  onPullTimeTargetChange,
  children,
}: Props) {
  const [values, setValues] = useState(initialValues);
  const [noteOpen, setNoteOpen] = useState(Boolean(initialValues.tasting_note));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [hoveredRating, setHoveredRating] = useState<number | null>(null);
  const [pressedRating, setPressedRating] = useState<number | null>(null);

  function set<K extends keyof ShotFormValues>(key: K, value: string) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  function reset() {
    setValues(referenceValues);
  }

  function isValidPositiveNumber(value: string): boolean {
    const n = Number.parseFloat(value);
    return Number.isFinite(n) && n > 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (values.grind_setting.trim() === '') {
      setError('Grind is required.');
      return;
    }
    if (
      !isValidPositiveNumber(values.dose_g) ||
      !isValidPositiveNumber(values.yield_g) ||
      !isValidPositiveNumber(values.pull_time_s)
    ) {
      setError('Dose, yield, and pull time must be greater than zero.');
      return;
    }
    setSaving(true);
    try {
      await onSubmit(values);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save shot');
    } finally {
      setSaving(false);
    }
  }

  const numericFields: NumericField[] = ['grind_setting', 'dose_g', 'yield_g', 'pull_time_s'];
  const dose = Number.parseFloat(values.dose_g);
  const yieldG = Number.parseFloat(values.yield_g);
  const ratioValue = Number.isFinite(dose) && Number.isFinite(yieldG) && dose > 0 ? yieldG / dose : null;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col flex-1">
      <div className="flex justify-end" style={{ padding: 'var(--space-2) var(--space-4)' }}>
        <button
          type="button"
          onClick={reset}
          className="text-sm rounded-[var(--radius-sm)] px-1 py-0.5 hover:bg-[var(--color-accent-100)] active:bg-[var(--color-accent-200)]"
          style={{ color: 'var(--color-accent)' }}
        >
          Reset
        </button>
      </div>

      {numericFields.map((field) => (
        <div key={field}>
          <NudgeRow
            field={field}
            value={values[field]}
            reference={referenceValues[field]}
            onChange={(next) => set(field, next)}
          />
          {field === 'pull_time_s' && (
            <div style={{ padding: '0 var(--space-4) var(--space-2)' }}>
              <PullTimeTargetControl
                value={pullTimeTarget}
                onChange={(next) => onPullTimeTargetChange?.(next)}
                currentPullTime={Number.parseFloat(values.pull_time_s)}
              />
            </div>
          )}
        </div>
      ))}

      <div
        style={{
          margin: '0 var(--space-4)',
          padding: 'var(--space-3) 0',
          borderTop: '1px solid var(--color-divider)',
          borderBottom: '1px solid var(--color-divider)',
        }}
      >
        <div className="flex justify-between items-baseline">
          <span style={{ fontSize: '12px', opacity: 0.65 }}>Ratio</span>
          {ratioValue != null && (
            <span className="fig" style={{ fontSize: '23px' }}>
              <span className="fig" style={{ fontWeight: 400, color: 'var(--color-neutral-700)' }}>
                1:
              </span>
              {ratioValue.toFixed(2)}
              {target != null && (
                <span
                  className="fig"
                  style={{ fontSize: '14px', color: 'var(--color-accent-700)', marginLeft: '6px' }}
                >
                  {formatSigned(ratioValue - target, 2)}
                </span>
              )}
            </span>
          )}
        </div>
        <RatioTargetControl value={target} onChange={(next) => onTargetChange?.(next)} />
      </div>

      <div className="flex flex-col" style={{ padding: 'var(--space-3) var(--space-4)', gap: 'var(--space-3)' }}>
        <div className="flex justify-between items-center">
          <span>Rating</span>
          <div className="flex" style={{ gap: '10px' }}>
            {[1, 2, 3, 4, 5].map((n) => {
              const filled = n <= Number(values.rating || 0);
              const isPressed = pressedRating === n;
              const isHovered = hoveredRating === n;
              const background = filled
                ? isPressed
                  ? 'var(--color-accent-800)'
                  : isHovered
                  ? 'var(--color-accent-700)'
                  : 'var(--color-accent)'
                : isPressed
                ? 'var(--color-accent-200)'
                : isHovered
                ? 'var(--color-accent-100)'
                : 'transparent';
              return (
                <button
                  key={n}
                  type="button"
                  aria-label={`Rate ${n}`}
                  onClick={() => set('rating', String(n))}
                  onMouseEnter={() => setHoveredRating(n)}
                  onMouseLeave={() => setHoveredRating((h) => (h === n ? null : h))}
                  onMouseDown={() => setPressedRating(n)}
                  onMouseUp={() => setPressedRating(null)}
                  style={{
                    width: 15,
                    height: 15,
                    borderRadius: '50%',
                    background,
                    border: filled ? 'none' : '1px solid var(--color-neutral-400)',
                  }}
                />
              );
            })}
          </div>
        </div>

        {!noteOpen ? (
          <button
            type="button"
            onClick={() => setNoteOpen(true)}
            className="text-left text-sm rounded-[var(--radius-sm)] px-1 py-0.5 -mx-1 hover:bg-[var(--color-accent-100)] active:bg-[var(--color-accent-200)]"
            style={{ color: 'var(--color-accent)' }}
          >
            Add tasting note
          </button>
        ) : (
          <label className="flex flex-col gap-1">
            Tasting note
            <textarea
              value={values.tasting_note}
              onChange={(e) => set('tasting_note', e.target.value)}
              className="border border-[var(--color-divider)] rounded-[var(--radius-md)] p-2"
            />
          </label>
        )}
      </div>

      {children}

      <StickyActionBar>
        {error && (
          <p style={{ color: 'var(--color-accent-800)', paddingBottom: 'var(--space-2)' }}>{error}</p>
        )}
        <button
          type="submit"
          disabled={saving}
          className="block w-full text-center border border-[var(--color-accent)] rounded-[var(--radius-md)] hover:bg-[var(--color-accent-100)] active:bg-[var(--color-accent-200)]"
          style={{ height: '48px', color: 'var(--color-accent)' }}
        >
          {saving ? 'Saving...' : submitLabel}
        </button>
      </StickyActionBar>
    </form>
  );
}
