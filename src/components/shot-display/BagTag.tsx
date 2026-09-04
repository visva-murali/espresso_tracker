// src/components/shot-display/BagTag.tsx
import type { BagStateValue } from '../../lib/shotView';

type NonNullState = Exclude<BagStateValue, null>;

const LABEL: Record<NonNullState, string> = {
  dialed: 'Dialed',
  dialing: 'Dialing',
  resting: 'Resting',
  'past-peak': 'Past peak',
};

const STYLE: Record<NonNullState, string> = {
  dialed: 'border border-[var(--color-accent)] text-[var(--color-accent)]',
  dialing: 'border-transparent bg-[var(--color-accent-100)] text-[var(--color-accent-800)]',
  resting: 'border-transparent bg-[var(--color-neutral-200)] text-[var(--color-neutral-700)]',
  'past-peak': 'border-transparent bg-[var(--color-neutral-200)] text-[var(--color-neutral-700)]',
};

export function BagTag({ state }: { state: BagStateValue }) {
  if (!state) return null;
  return (
    <span
      className={`inline-block border rounded-[3px] text-[11px] tracking-[0.02em] px-[10px] py-[3px] ${STYLE[state]}`}
    >
      {LABEL[state]}
    </span>
  );
}
