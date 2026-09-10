type Props = {
  value: number | null;
  onChange: (next: number | null) => void;
};

const QUICK_PICKS = [2, 2.5, 3];
const STEP = 0.1;
const MIN = 0.6;
const MAX = 9.9;

function clamp(n: number): number {
  return Math.min(MAX, Math.max(MIN, Math.round(n * 10) / 10));
}

function formatPick(p: number): string {
  return Number.isInteger(p) ? `1:${p}` : `1:${p}`;
}

export function RatioTargetControl({ value, onChange }: Props) {
  const segmentBase = 'text-[13px] px-2 py-1 rounded-[var(--radius-sm)] border';
  const segmentOff = 'border-[var(--color-divider)] text-[var(--color-neutral-700)]';
  const segmentOn = 'border-[var(--color-accent)] text-[var(--color-accent)]';

  return (
    <div className="flex items-center justify-between" style={{ paddingTop: 'var(--space-2)' }}>
      <span style={{ fontSize: '12px', opacity: 0.65 }}>Target</span>
      <div className="flex items-center" style={{ gap: 'var(--space-2)' }}>
        <div className="flex" style={{ gap: '4px' }}>
          <button
            type="button"
            aria-label="No target"
            aria-pressed={value === null}
            onClick={() => onChange(null)}
            className={`${segmentBase} ${value === null ? segmentOn : segmentOff}`}
          >
            Off
          </button>
          {QUICK_PICKS.map((p) => (
            <button
              key={p}
              type="button"
              aria-label={`Target ${formatPick(p)}`}
              aria-pressed={value === p}
              onClick={() => onChange(value === p ? null : p)}
              className={`${segmentBase} ${value === p ? segmentOn : segmentOff}`}
            >
              {formatPick(p)}
            </button>
          ))}
        </div>
        {value !== null && (
          <div className="flex items-center" style={{ gap: '4px' }}>
            <button
              type="button"
              aria-label="Decrease target"
              onClick={() => onChange(clamp(value - STEP))}
              className="w-8 h-8 border border-[var(--color-divider)] rounded-[var(--radius-sm)] hover:bg-[var(--color-accent-100)] active:bg-[var(--color-accent-200)]"
            >
              &minus;
            </button>
            <span className="fig" style={{ fontSize: '13px', minWidth: '34px', textAlign: 'center' }}>
              1:{value.toFixed(1)}
            </span>
            <button
              type="button"
              aria-label="Increase target"
              onClick={() => onChange(clamp(value + STEP))}
              className="w-8 h-8 border border-[var(--color-divider)] rounded-[var(--radius-sm)] hover:bg-[var(--color-accent-100)] active:bg-[var(--color-accent-200)]"
            >
              +
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
