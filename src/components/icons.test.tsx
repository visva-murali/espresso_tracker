// src/components/icons.test.tsx
import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { SearchIcon, MenuIcon, VideoIcon, PlayIcon } from './icons';

describe('icons', () => {
  it.each([
    ['SearchIcon', SearchIcon],
    ['MenuIcon', MenuIcon],
    ['VideoIcon', VideoIcon],
    ['PlayIcon', PlayIcon],
  ])('%s renders an svg at the default 16px interface size', (_name, Icon) => {
    const { container } = render(<Icon />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute('width', '16');
    expect(svg).toHaveAttribute('stroke-width', '1.5');
  });
});
