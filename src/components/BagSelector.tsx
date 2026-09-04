// src/components/BagSelector.tsx
import { useState } from 'react';
import { bagKey, sameBag } from '../lib/shotView';

export type BagIdentity = {
  bean_name: string | null;
  roast_date: string | null;
};

type Props = {
  bags: BagIdentity[];
  selected: BagIdentity | null;
  onSelect: (bag: BagIdentity) => void;
  label: string;
};

export function BagSelector({ bags, selected, onSelect, label }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="h-9 px-3 border border-[var(--color-divider)] rounded-[var(--radius-md)] text-sm hover:bg-[var(--color-accent-100)] active:bg-[var(--color-accent-200)]"
      >
        {label}
      </button>
      {open && (
        <ul
          role="listbox"
          className="absolute right-0 mt-1 z-10 min-w-[200px] bg-[var(--color-bg)] border border-[var(--color-divider)] rounded-[var(--radius-md)] shadow-[var(--shadow-md)]"
        >
          {bags.map((bag) => (
            <li key={bagKey(bag)}>
              <button
                type="button"
                role="option"
                aria-selected={selected != null && sameBag(bag, selected)}
                onClick={() => {
                  onSelect(bag);
                  setOpen(false);
                }}
                className="block w-full text-left px-3 py-2 text-sm hover:bg-[var(--color-accent-100)] active:bg-[var(--color-accent-200)]"
              >
                {bag.bean_name ?? 'Unlabeled'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
