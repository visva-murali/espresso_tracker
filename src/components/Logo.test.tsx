// src/components/Logo.test.tsx
import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Logo } from './Logo';

describe('Logo', () => {
  it('renders an svg at the default 16px interface size', () => {
    const { container } = render(<Logo />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute('width', '16');
    expect(svg).toHaveAttribute('stroke-width', '1.5');
  });

  it('honours an explicit size', () => {
    const { container } = render(<Logo size={40} />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('width', '40');
    expect(svg).toHaveAttribute('height', '40');
  });
});
