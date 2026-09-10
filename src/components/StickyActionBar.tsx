// src/components/StickyActionBar.tsx
import type { ReactNode } from 'react';

/**
 * The bar that holds a screen's primary bottom actions. `mt-auto` drops it
 * to the bottom of a min-height flex-column page on short screens;
 * `sticky bottom-0` keeps it in view while a taller screen scrolls under
 * it. The opaque background and top divider keep scrolled content readable
 * behind it. Every screen with a bottom action renders through this so the
 * actions land in the same place across the app.
 */
export function StickyActionBar({ children }: { children: ReactNode }) {
  return (
    <div
      data-testid="action-bar"
      className="sticky bottom-0 mt-auto border-t border-[var(--color-divider)] bg-[var(--color-bg)]"
      style={{ padding: 'var(--space-3) var(--space-4) var(--space-6)' }}
    >
      {children}
    </div>
  );
}
