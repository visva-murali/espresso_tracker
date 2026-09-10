// src/components/StickyActionBar.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { StickyActionBar } from './StickyActionBar';

describe('StickyActionBar', () => {
  it('renders its children', () => {
    render(
      <StickyActionBar>
        <button>Save changes</button>
      </StickyActionBar>
    );

    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument();
  });

  it('drops to the bottom of a flex column and stays pinned while content scrolls under it', () => {
    render(<StickyActionBar>x</StickyActionBar>);

    const bar = screen.getByTestId('action-bar');
    expect(bar.className).toContain('mt-auto');
    expect(bar.className).toContain('sticky');
    expect(bar.className).toContain('bottom-0');
  });

  it('has an opaque background and a top divider so scrolled content reads cleanly behind it', () => {
    render(<StickyActionBar>x</StickyActionBar>);

    const bar = screen.getByTestId('action-bar');
    expect(bar.className).toContain('bg-[var(--color-bg)]');
    expect(bar.className).toContain('border-t');
  });
});
