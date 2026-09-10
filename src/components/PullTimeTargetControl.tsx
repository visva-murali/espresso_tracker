import { formatSigned } from '../lib/format';
import { pullTimeAgainstRange } from '../lib/shotView';

type Props = {
  value: [number, number] | null;
  onChange: (next: [number, number] | null) => void;
  currentPullTime: number;
};

const MIN_S = 5;
const MAX_S = 120;
const DEFAULT_RANGE: [number, number] = [25, 32];

function seedRange(currentPullTime: number): [number, number] {
  if (!Number.isFinite(currentPullTime) || currentPullTime <= 0) return DEFAULT_RANGE;
  const c = Math.round(currentPullTime);
  const low = Math.max(MIN_S, c - 2);
  const high = Math.min(MAX_S, c + 2);
  return low < high ? [low, high] : [Math.max(MIN_S, high - 1), high];
}

const stepperClass =
  'w-8 h-8 border border-[var(--color-divider)] rounded-[var(--radius-sm)] hover:bg-[var(--color-accent-100)] active:bg-[var(--color-accent-200)]';

export function PullTimeTargetControl({ value, onChange, currentPullTime }: Props) {
  const off = value === null;

  function toggle() {
    onChange(off ? seedRange(currentPullTime) : null);
  }
  function stepLow(d: number) {
    if (!value) return;
    onChange([Math.min(value[1] - 1, Math.max(MIN_S, value[0] + d)), value[1]]);
  }
  function stepHigh(d: number) {
    if (!value) return;
    onChange([value[0], Math.max(value[0] + 1, Math.min(MAX_S, value[1] + d))]);
  }

  const position =
    value && Number.isFinite(currentPullTime) && currentPullTime > 0
      ? pullTimeAgainstRange(Math.round(currentPullTime), value)
      : null;

  return (
    <div className="flex items-center justify-between" style={{ paddingTop: 'var(--space-2)' }}>
      <span style={{ fontSize: '12px', opacity: 0.65 }}>Target</span>
      <div className="flex items-center" style={{ gap: 'var(--space-2)' }}>
        <button
          type="button"
          aria-label="No pull time target"
          aria-pressed={off}
          onClick={toggle}
          className={`text-[13px] px-2 py-1 rounded-[var(--radius-sm)] border ${
            off
              ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
              : 'border-[var(--color-divider)] text-[var(--color-neutral-700)]'
          }`}
        >
          Off
        </button>
        {value && (
          <div className="flex items-center" style={{ gap: '4px' }}>
            <button type="button" aria-label="Decrease low" onClick={() => stepLow(-1)} className={stepperClass}>
              &minus;
            </button>
            <span className="fig" style={{ fontSize: '13px', minWidth: '30px', textAlign: 'center' }}>
              {value[0]}s
            </span>
            <button type="button" aria-label="Increase low" onClick={() => stepLow(1)} className={stepperClass}>
              +
            </button>
            <span style={{ opacity: 0.5, padding: '0 2px' }}>-</span>
            <button type="button" aria-label="Decrease high" onClick={() => stepHigh(-1)} className={stepperClass}>
              &minus;
            </button>
            <span className="fig" style={{ fontSize: '13px', minWidth: '30px', textAlign: 'center' }}>
              {value[1]}s
            </span>
            <button type="button" aria-label="Increase high" onClick={() => stepHigh(1)} className={stepperClass}>
              +
            </button>
          </div>
        )}
        {position && (
          <span className="fig" style={{ fontSize: '12px', color: 'var(--color-accent-700)' }}>
            {Math.round(currentPullTime)}s{' '}
            {position.state === 'in' ? 'in range' : `${formatSigned(position.delta, 0)}s`}
          </span>
        )}
      </div>
    </div>
  );
}
